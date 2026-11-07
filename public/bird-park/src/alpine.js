// 第二館：高山雲霧林。圓頂東門 → 玻璃通道（中間是氣候緩衝室，兩道自動門）→ 一棟玻璃溫室，裡面是台灣高山的地形：
// 入口平台、水池，往東爬升到約 20 公尺的山頂；溪流從山上沿山谷流下來（中途一段小瀑布），步道之字形上山、吊橋過溪谷，山頂有觀景台。
// 植物：冷杉（細長尖塔）、鐵杉（較寬、枝條下垂）——程式做的針葉卡片樹；坡上一整片玉山箭竹；溪邊蕨類、長苔的岩石；雲霧一直在飄。
// 地形、步道、溪、吊橋的形狀在 layout.js（玩家走路也要用）。
// 效能：外殼（通道、館的鋼構和霧玻璃）一開始就蓋，很便宜；館裡面等玩家走到東邊才蓋。
// 兩館不同時畫：玩家在館裡（或 B 門開著）才畫館內；在圓頂這邊（或 A 門開著）才畫圓頂裡面，緩衝室兩道門都關著的時候切換。
import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { buildSummit } from './summit.js'
import { CABIN, ALP, ALP_STREAM, ALP_POND, ALP_TRAIL, ALP_BRIDGE, ALP_GRID, ALP_HEIGHTS, ALP_PEAK, BRIDGE_DIM, alpineHeight, alpineTrailDist, alpineStreamDist, inAlpine, domeY, domeRho, addCollider } from './layout.js'
import { scatter } from './plants.js'
import { bladeMesh } from './flora.js'
import { lodRegister, lodRegisterGrass } from './lod.js'
import { mulberry32, fbm2 } from './noise.js'
import { dayLight } from './structures.js'

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z)
const TAU = Math.PI * 2
const { clamp, lerp } = THREE.MathUtils
const ss = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t) }   // 跟 layout.js 同樣的參數順序（three 的 smoothstep 是 (x, min, max)，第一版用錯，樹全沒長出來）

function canvasTex(w, h, draw, srgb = true) {
  const c = document.createElement('canvas'); c.width = w; c.height = h
  draw(c.getContext('2d'), w, h)
  const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8
  return t
}
const bar = (list, a, b, t = 0.14, t2 = t) => {
  const d = new THREE.Vector3().subVectors(b, a), len = d.length()
  const m = new THREE.Matrix4().lookAt(a, b, Math.abs(d.y) > 0.99 * len ? V(1, 0, 0) : V(0, 1, 0))
  m.setPosition(a.clone().add(b).multiplyScalar(0.5))
  list.push(new THREE.BoxGeometry(t, t2, len).applyMatrix4(m))
}
const quad = (pts, mat, parent, order = 5) => {
  const pos = []
  for (let i = 1; i < pts.length - 1; i++) pos.push(...pts[0].toArray(), ...pts[i].toArray(), ...pts[i + 1].toArray())
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.computeVertexNormals()
  const m = new THREE.Mesh(geo, mat); m.renderOrder = order; parent.add(m); return m
}

/* ---------- 針葉樹（程式做的卡片樹） ---------- */
// 2026-11-07 改寫得比較寫實：一根側枝＝主枝＋兩側一排排的小枝，小枝上密密的短針葉；針葉裡深外淺、枝梢是嫩綠的新芽，
// 沒有黑色描邊（原本每根針都描深色，看起來像漫畫）。透明底（alphaTest）。
export function needleTex() {
  const t = canvasTex(512, 256, (x, w, h) => {
    x.clearRect(0, 0, w, h)
    const rnd = mulberry32(7)
    const needle = (px, py, a, len, tip) => {
      const g = 95 + rnd() * 45 + tip * 45, r = 48 + rnd() * 20 + tip * 45, b = 46 + rnd() * 16
      x.strokeStyle = `rgba(${r | 0},${g | 0},${b | 0},0.95)`; x.lineWidth = 1.5 + rnd() * 0.8
      x.beginPath(); x.moveTo(px, py); x.lineTo(px + Math.cos(a) * len, py + Math.sin(a) * len); x.stroke()
    }
    // 主枝：從左（樹幹那頭）往右，微微彎
    const main = (u) => [u * w * 0.97, h / 2 + Math.sin(u * 2.2) * h * 0.04]
    x.strokeStyle = 'rgba(70,52,36,0.9)'; x.lineWidth = 3; x.beginPath(); for (let i = 0; i <= 20; i++) x.lineTo(...main(i / 20)); x.stroke()
    // 小枝：兩側交錯，越往外越短；每根小枝上兩排針葉
    for (let i = 0; i < 18; i++) {
      const u = 0.05 + i / 18 * 0.88, [mx, my] = main(u), side = i % 2 ? 1 : -1
      const L = (0.42 - u * 0.25) * h * (0.8 + rnd() * 0.4), a = side * (0.75 + rnd() * 0.35) + 0.25
      const ex = mx + Math.cos(a) * L * 1.6, ey = my + Math.sin(a) * L
      // 先鋪一片實心的葉團（中間深、邊緣亮一點）：遠看是一團團的枝葉，不是一根根黑線
      const ang = Math.atan2(ey - my, ex - mx), ln = Math.hypot(ex - mx, ey - my)
      x.save(); x.translate((mx + ex) / 2, (my + ey) / 2); x.rotate(ang)
      const gr = x.createLinearGradient(0, -L * 0.35, 0, L * 0.35)
      gr.addColorStop(0, 'rgb(78,118,70)'); gr.addColorStop(0.5, 'rgb(46,82,48)'); gr.addColorStop(1, 'rgb(66,104,62)')
      x.fillStyle = gr; x.beginPath(); x.ellipse(0, 0, ln * 0.55, L * 0.26, 0, 0, TAU); x.fill(); x.restore()
      x.strokeStyle = 'rgba(80,60,40,0.8)'; x.lineWidth = 1.4; x.beginPath(); x.moveTo(mx, my); x.lineTo(ex, ey); x.stroke()
      for (let k = 0; k < 40; k++) {
        const v = rnd(), px = mx + (ex - mx) * v, py = my + (ey - my) * v, s2 = rnd() < 0.5 ? -1 : 1
        needle(px, py, a + s2 * (0.9 + rnd() * 0.5), 9 + rnd() * 7, v > 0.8 ? 1 : 0)
      }
    }
    for (let k = 0; k < 160; k++) { const u = rnd() * 0.97, [px, py] = main(u); needle(px, py, (rnd() - 0.5) * 3, 8 + rnd() * 8, u > 0.88 ? 1 : 0) }   // 主枝本身也長針
  })
  return t
}
// kind 'fir'：冷杉，細長尖塔、枝條平伸、層次分明；'hemlock'：鐵杉，比較寬、枝條下垂、頂端的芽歪向一邊。高度 1（擺放時縮放）
// 每根側枝兩片交叉的卡片（從側面、從上面看都有厚度）；每層枝數、長度、角度都有亂數，偶爾缺一枝（看得到樹幹，比較自然）
// 頂點顏色：樹冠裡面、下面比較暗（自己遮自己），外面、上面比較亮——卡片樹最缺的就是這個
function coniferGeo(kind) {
  const fir = kind === 'fir', R = fir ? 0.19 : 0.29, tiers = fir ? 22 : 17, rnd = mulberry32(fir ? 3 : 5)
  const cards = []
  for (let i = 0; i < tiers; i++) {
    const t = i / (tiers - 1), y = 0.08 + Math.pow(t, 0.95) * 0.9 + (rnd() - 0.5) * 0.015
    const r = (R * Math.pow(1 - t, fir ? 0.9 : 0.72) + 0.025) * (0.85 + rnd() * 0.3)
    const n = Math.max(4, Math.round((fir ? 7 : 8) * (0.6 + 0.4 * (1 - t))))
    for (let k = 0; k < n; k++) {
      if (rnd() < 0.12 && t < 0.8) continue
      const a = (k / n) * TAU + i * 2.39 + rnd() * 0.5
      const len = r * (0.75 + rnd() * 0.5)
      const droop = fir ? 0.08 + t * 0.1 + rnd() * 0.12 : 0.35 + rnd() * 0.25 - t * 0.15
      for (const tw of [0, Math.PI / 2]) {
        const card = new THREE.PlaneGeometry(len, len * (fir ? 0.5 : 0.6), 2, 1).translate(len / 2, 0, 0)
        // 枝梢往下彎（鐵杉彎很多）：沿長度方向把外端壓下去
        const p = card.attributes.position
        for (let v = 0; v < p.count; v++) { const u = p.getX(v) / len; p.setY(v, p.getY(v) - u * u * len * (fir ? 0.12 : 0.35)) }
        card.rotateX(tw + (rnd() - 0.5) * 0.3)
        card.rotateZ(-droop)
        card.rotateY(a); card.translate(0, y, 0)
        cards.push(card)
      }
    }
  }
  // 頂芽：一根往上的小枝（鐵杉歪一邊）
  for (const tw of [0, Math.PI / 2]) { const c = new THREE.PlaneGeometry(0.1, 0.06).translate(0.05, 0, 0).rotateX(tw).rotateZ(fir ? Math.PI / 2 : Math.PI / 2 - 0.5).translate(0, 0.96, 0); cards.push(c) }
  const g = mergeGeometries(cards.map((c) => c.toNonIndexed()))
  const p = g.attributes.position, n = g.attributes.normal, col = new Float32Array(p.count * 3)
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), l = Math.hypot(x, z) || 1
    n.setXYZ(i, x / l * 0.55, 0.8, z / l * 0.55)   // 法線往上、往外偏：卡片樹不會一面亮一面黑
    const rMax = R * Math.pow(Math.max(0, 1 - (y - 0.08) / 0.9), fir ? 0.9 : 0.72) + 0.03
    const out = Math.min(1, l / rMax), k = (0.5 + 0.5 * out) * (0.72 + 0.28 * y)   // 裡面、下面暗
    col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = k
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3))
  return g
}

/* ---------- 館內 ---------- */
// 鳥站附近：r 公尺內、或鳥到鏡頭那條線 w 公尺內就不放（樹不擋鏡頭、不插進停棲的樹）
function nearBird(avoid, x, z, r, w) {
  for (const b of avoid) {
    if (Math.hypot(x - b.x, z - b.z) < r) return true
    const dx = b.cx - b.x, dz = b.cz - b.z, L2 = dx * dx + dz * dz, t = Math.max(0, Math.min(1, ((x - b.x) * dx + (z - b.z) * dz) / L2))
    if (Math.hypot(x - b.x - dx * t, z - b.z - dz * t) < w) return true
  }
  return false
}
// 到吊橋中線的距離（吊橋那段不算步道，alpineTrailDist 量不到）
function bridgeDist(x, z) {
  const a = ALP_TRAIL[ALP_BRIDGE.a], b = ALP_TRAIL[ALP_BRIDGE.a + 2], dx = b[0] - a[0], dz = b[1] - a[1]
  const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz)))
  return Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t)
}
function buildInterior(lib, avoid = []) {
  const g = new THREE.Group(); g.name = 'alpineInterior'
  const rnd = mulberry32(2026)
  const AG = ALP_GRID
  // 地形網格：坡度決定顏色（緩坡箭竹草地的黃綠、陡坡岩石灰、步道泥土、溪邊濕的深色），再加一張細節雜訊貼圖
  {
    const nx = AG.nx, nz = AG.nz, pos = new Float32Array(nx * nz * 3), col = new Float32Array(nx * nz * 3), uv = new Float32Array(nx * nz * 2), idx = []
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const k = j * nx + i, x = AG.x0 + i * AG.cell, z = AG.z0 + j * AG.cell
      pos.set([x, ALP_HEIGHTS[k], z], k * 3); uv.set([x * 0.25, z * 0.25], k * 2)
    }
    // 只留山區（花園橢圓外、溫室裡）的格子；花園那邊有自己的地面
    const keep = new Uint8Array(nx * nz)
    for (let k = 0; k < nx * nz; k++) keep[k] = inAlpine(pos[k * 3], pos[k * 3 + 2], -1) && domeRho(pos[k * 3], pos[k * 3 + 2]) < 1.0 ? 1 : 0
    for (let j = 0; j < nz - 1; j++) for (let i = 0; i < nx - 1; i++) { const a = j * nx + i, b = a + 1, c = a + nx, d = c + 1; if (keep[a] | keep[b] | keep[c] | keep[d]) idx.push(a, c, b, b, c, d) }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); geo.setIndex(idx)
    geo.computeVertexNormals()
    const nrm = geo.attributes.normal, c = new THREE.Color()
    for (let k = 0; k < nx * nz; k++) {
      const x = pos[k * 3], z = pos[k * 3 + 2], ny = nrm.getY(k)
      const n = fbm2(x * 0.15, z * 0.15, 3)
      c.setHSL(0.2 + n * 0.04, 0.38, 0.27 + n * 0.06)                                       // 草地
      const rock = ss(0.86, 0.7, ny)
      c.lerp(new THREE.Color().setHSL(0.1, 0.06, 0.36 + n * 0.08), rock)                     // 岩石
      const tr = ss(1.6, 0.9, alpineTrailDist(x, z))
      c.lerp(new THREE.Color().setHSL(0.08, 0.28, 0.33 + n * 0.04), tr * 0.9)               // 步道泥土
      // 溪床、池底：濕的深色石頭和砂（水是透明的，看得到底下）；岸上一圈濕地
      const sd = alpineStreamDist(x, z), dp = Math.hypot(x - ALP_POND.x, z - ALP_POND.z) - ALP_POND.r
      const wet = Math.max(ss(4.5, 1.2, sd), ss(3, 0, dp))
      const stone = fbm2(x * 1.3, z * 1.3, 2)
      c.lerp(new THREE.Color().setHSL(0.11 + stone * 0.04, 0.16, 0.1 + stone * 0.07), wet)
      col.set([c.r, c.g, c.b], k * 3)
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3))
    const detail = canvasTex(256, 256, (x, w, h) => {
      x.fillStyle = '#d0d0d0'; x.fillRect(0, 0, w, h)
      for (let i = 0; i < 5000; i++) { const l = 150 + Math.random() * 105; x.fillStyle = `rgba(${l},${l},${l},0.5)`; x.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 3, 1 + Math.random() * 3) }
    })
    detail.wrapS = detail.wrapT = THREE.RepeatWrapping
    const ground = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, map: detail, roughness: 0.95 }))
    ground.receiveShadow = true; g.add(ground)
  }
  // 水池＋溪：自己寫的水 shader（溪和池共用）。
  // 水面是平的（不沿著岸往上爬），岸邊靠深度測試自然切掉；每個頂點帶「水深」（水面 - 地形）和「坡度」：
  // 深的地方偏墨綠、淺的地方透出溪底，邊緣淡掉並有一圈白沫；看斜的地方反射天空（菲涅耳）、太陽方向有閃光；
  // 坡度大的那幾段流得快、一片白（小瀑布、急流）。水紋是兩層往下游捲動的雜訊，算法線用。
  const spray = []
  const waterU = { uTime: { value: 0 }, uDay: dayLight, uSun: { value: V(-0.45, 0.8, 0.3).normalize() } }
  const waterM = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, fog: true, side: THREE.DoubleSide,   // 三角形的方向不管（從上面看才不會被背面剔除）
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uTime: { value: 0 }, uDay: { value: 1 }, uSun: { value: V() } }]),
    vertexShader: `
      attribute float aDepth; attribute float aSlope;
      varying vec2 vUv; varying float vDepth; varying float vSlope; varying vec3 vW;
      #include <fog_pars_vertex>
      void main() {
        vUv = uv; vDepth = aDepth; vSlope = aSlope;
        vec4 wp = modelMatrix * vec4(position, 1.0); vW = wp.xyz;
        vec4 mvPosition = viewMatrix * wp;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: `
      uniform float uTime; uniform float uDay; uniform vec3 uSun;
      varying vec2 vUv; varying float vDepth; varying float vSlope; varying vec3 vW;
      #include <fog_pars_fragment>
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float vnoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y); }
      float fbm(vec2 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++) { s += a * vnoise(p); p = p * 2.03 + 7.1; a *= 0.5; } return s; }
      float waves(vec2 p, float sp) {
        return fbm(p * vec2(1.6, 0.9) + vec2(0.0, -uTime * sp)) * 0.6 + fbm(p * vec2(3.1, 1.7) + vec2(3.0, -uTime * sp * 1.6)) * 0.4;
      }
      void main() {
        float rapids = smoothstep(0.18, 0.5, vSlope);                        // 只有真的陡的地方（小瀑布、急流）才白
        float sp = 0.35 + rapids * 2.6;
        vec2 p = vec2(vUv.x * 2.2, vUv.y * 0.7);
        float e = 0.06, h0 = waves(p, sp), hx = waves(p + vec2(e, 0.0), sp), hy = waves(p + vec2(0.0, e), sp);
        vec3 N = normalize(vec3((h0 - hx) * (2.6 + rapids * 2.0), 1.0, (h0 - hy) * (2.6 + rapids * 2.0)));
        vec3 Vd = normalize(cameraPosition - vW);
        float fres = 0.02 + 0.98 * pow(1.0 - max(dot(N, Vd), 0.0), 5.0);
        float d = clamp(vDepth / 0.7, 0.0, 1.0);
        // 顏色是線性空間：要比直覺暗很多（0.05 線性 ≈ 0.25 sRGB）
        vec3 bed = vec3(0.075, 0.085, 0.055), deep = vec3(0.008, 0.03, 0.026);
        vec3 col = mix(bed, deep, smoothstep(0.0, 1.0, d));
        col += vec3(0.01, 0.025, 0.02) * h0;                                  // 水裡的光影
        // 反射：往上反射到天空才亮；斜斜看過去反射到的是兩岸的樹和山壁（暗綠），不是天空
        vec3 R = reflect(-Vd, N);
        vec3 sky = mix(fogColor, vec3(0.80, 0.87, 0.92), 0.5);
        // 水紋讓反射一塊亮一塊暗（天空、樹影交錯），水面才看得出在動
        vec3 env = mix(vec3(0.012, 0.022, 0.016), sky * 0.9, smoothstep(0.35, 0.9, R.y + (h0 - 0.5) * 0.9));
        col = mix(col, env, clamp(fres * 1.3 + 0.08, 0.0, 1.0));
        float spec = pow(max(dot(reflect(-uSun, N), Vd), 0.0), 70.0);
        col += vec3(1.0, 0.97, 0.9) * spec * 2.4;
        // 白沫：急流整片、岸邊一圈、石頭後面的碎浪
        float fn = fbm(p * vec2(2.4, 1.2) + vec2(0.0, -uTime * sp * 1.3));
        // 急流、瀑布：沿著水流方向拉長的白色水絲（橫向細、縱向長），中間夾著透出來的深色水
        float streak = fbm(vec2(vUv.x * 9.0, vUv.y * 0.45 - uTime * sp * 0.8)) * 0.65 + fbm(vec2(vUv.x * 21.0, vUv.y * 1.1 - uTime * sp * 1.1)) * 0.35;
        float foam = rapids * smoothstep(0.3, 0.62, streak + rapids * 0.12);
        foam += smoothstep(0.06, 0.0, vDepth) * smoothstep(0.55, 0.75, fn) * 0.5;   // 岸邊細細一圈
        foam = clamp(foam, 0.0, 1.0);
        col = mix(col, vec3(0.75, 0.8, 0.8), foam * 0.8);
        col *= mix(0.12, 1.0, uDay);
        float a = mix(0.28, 0.88, d) + foam * 0.5 + fres * 0.35;            // 淺的地方看得到溪底的石頭
        a *= smoothstep(0.0, 0.06, vDepth);                                    // 岸邊淡掉，不會有一條硬邊
        gl_FragColor = vec4(col, clamp(a, 0.0, 1.0));
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  })
  waterM.uniforms.uTime = waterU.uTime; waterM.uniforms.uDay = dayLight; waterM.uniforms.uSun = waterU.uSun
  {
    // 水池：一片比池子大一點的平面，每點的水深照地形算（沒水的地方深度 < 0 → 透明）
    const R = ALP_POND.r + 3, NR = 28, NA = 64, pos = [], uv = [], dep = [], slo = [], idx = []
    for (let i = 0; i <= NR; i++) for (let j = 0; j <= NA; j++) {
      const r = R * i / NR, a = j / NA * TAU, x = ALP_POND.x + Math.cos(a) * r, z = ALP_POND.z + Math.sin(a) * r
      pos.push(x, ALP_POND.water, z); uv.push(x * 0.35, z * 0.35); dep.push(ALP_POND.water - alpineHeight(x, z)); slo.push(0)
      if (i && j) { const A = (i - 1) * (NA + 1) + j - 1, B = A + 1, C = A + NA + 1, D = C + 1; idx.push(A, C, B, B, C, D) }
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
    geo.setAttribute('aDepth', new THREE.Float32BufferAttribute(dep, 1)); geo.setAttribute('aSlope', new THREE.Float32BufferAttribute(slo, 1)); geo.setIndex(idx)
    const pond = new THREE.Mesh(geo, waterM); pond.renderOrder = 2; g.add(pond)
    // 溪：沿著溪床中線，每個斷面 9 個點、水面是平的（水深 = 水面 - 地形）；寬度照溪谷自然切
    const st = ALP_STREAM, prof = ALP_STREAM.prof, P = []
    for (let i = 0; i < st.length; i++) P.push(V(st[i][0], prof[i] + 0.32, st[i][1]))
    const curve = new THREE.CatmullRomCurve3(P, false, 'centripetal'), L = curve.getLength(), N = Math.ceil(L / 0.5), K = 8
    const sp = [], su = [], sd = [], ss_ = [], si = []
    let acc = 0, prev = null
    const ys = []
    for (let i = 0; i <= N; i++) ys.push(curve.getPointAt(i / N).y)
    for (let i = 0; i <= N; i++) {
      const p = curve.getPointAt(i / N), tg = curve.getTangentAt(i / N), side = V(-tg.z, 0, tg.x).normalize()
      if (prev) acc += p.distanceTo(prev); prev = p                                  // 沿著水流的真實距離（瀑布那段才拉得開）
      const a = Math.max(0, i - 2), b = Math.min(N, i + 2), slope = Math.max(0, (ys[a] - ys[b]) / ((b - a) * L / N))
      const w = 1.8 + 0.5 * Math.sin(i * 0.23)
      for (let k = 0; k <= K; k++) {
        const s = (k / K - 0.5) * 2 * w, q = p.clone().addScaledVector(side, s)
        sp.push(q.x, p.y, q.z); su.push(k / K, acc); sd.push(p.y - alpineHeight(q.x, q.z)); ss_.push(slope)
      }
      if (i) for (let k = 0; k < K; k++) { const A = (i - 1) * (K + 1) + k, B = A + 1, C = A + K + 1, D = C + 1; si.push(A, C, B, B, C, D) }
    }
    const sg = new THREE.BufferGeometry()
    sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3)); sg.setAttribute('uv', new THREE.Float32BufferAttribute(su, 2))
    sg.setAttribute('aDepth', new THREE.Float32BufferAttribute(sd, 1)); sg.setAttribute('aSlope', new THREE.Float32BufferAttribute(ss_, 1)); sg.setIndex(si)
    const stream = new THREE.Mesh(sg, waterM); stream.renderOrder = 2; g.add(stream)
    // 溪裡的石頭：沿著溪每 2.5 公尺左右，偏離中線放一顆長苔的石頭，一半露出水面（水從旁邊繞過）
    const rr = mulberry32(77), stones = {}, names = ['rock_moss_set', 'mrock_8', 'mrock_10', 'boulder']
    for (let u = 0.02; u < 0.97; u += 2.5 / L) {
      if (rr() < 0.35) continue
      const p = curve.getPointAt(u), tg = curve.getTangentAt(u), side = V(-tg.z, 0, tg.x).normalize()
      const q = p.clone().addScaledVector(side, (rr() - 0.5) * 2.4)
      const k = 0.35 + rr() * 0.45, n = names[Math.floor(rr() * names.length)]
      ;(stones[n] ||= []).push({ p: V(q.x, alpineHeight(q.x, q.z) - 0.12, q.z), q: new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rr() * TAU, 0)), s: V(k, k * (0.7 + rr() * 0.4), k), c: new THREE.Color().setHSL(0.22, 0.12, 0.7 + rr() * 0.15) })
    }
    for (const [n, list] of Object.entries(stones)) if (lib[n]) scatter(g, lib[n], list, { cast: true })
    // 瀑布、急流下面的水花：幾團白色的霧，會一直翻動
    const sprayT = canvasTex(64, 64, (x, w, h) => { const gr = x.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2); gr.addColorStop(0, 'rgba(255,255,255,0.9)'); gr.addColorStop(0.5, 'rgba(240,246,248,0.35)'); gr.addColorStop(1, 'rgba(240,246,248,0)'); x.fillStyle = gr; x.fillRect(0, 0, w, h) })
    for (let i = 4; i <= N - 4; i++) {
      const a0 = (ys[i - 4] - ys[i]) / 2, a1 = (ys[i] - ys[i + 4]) / 2
      if (!(a0 > 0.45 && a1 < 0.35)) continue                                          // 陡的一段剛結束的地方（瀑布底）
      const p = curve.getPointAt(i / N)
      for (let k = 0; k < 4; k++) {
        const sp_ = new THREE.Sprite(new THREE.SpriteMaterial({ map: sprayT, transparent: true, depthWrite: false, fog: true, opacity: 0.5 }))
        const z0 = 0.8 + rr() * 1.4; sp_.scale.set(z0 * 1.6, z0, 1)
        sp_.position.set(p.x + (rr() - 0.5) * 1.6, p.y + 0.2 + rr() * 0.6, p.z + (rr() - 0.5) * 1.6)
        sp_.userData = { y0: sp_.position.y, ph: rr() * TAU, s0: z0 }; sp_.renderOrder = 6
        g.add(sp_); spray.push(sp_)
      }
      i += 8
    }
  }
  // 吊橋：照台灣山區的人行吊橋做——兩端鋼構橋塔（H 形、漆成深綠，站在混凝土基座上），
  // 兩條主鋼纜從塔頂垂成拋物線、往後拉到地上的錨碇；每 0.6 公尺一根吊索拉著橋面的橫樑；
  // 橋面：橫樑上鋪縱向木板（板間留縫、每塊顏色和高度差一點）；兩側鋼絲網到扶手鋼索；橋面中間微微下垂（跟 layout.js bridgeAt 一樣）。
  {
    const a = ALP_TRAIL[ALP_BRIDGE.a], b = ALP_TRAIL[ALP_BRIDGE.a + 2], pa = ALP_TRAIL.prof[ALP_BRIDGE.a], pb = ALP_TRAIL.prof[ALP_BRIDGE.a + 2]
    const A = V(a[0], pa, a[1]), B = V(b[0], pb, b[1]), dir = B.clone().sub(A).setY(0), len = dir.length(); dir.normalize()
    const side = V(-dir.z, 0, dir.x), yaw = Math.atan2(dir.x, dir.z), HW = BRIDGE_DIM.hw
    const deck = (t) => A.clone().lerp(B, t).add(V(0, -BRIDGE_DIM.sag * Math.sin(Math.PI * t) + 0.06, 0))   // 橋面頂（跟 layout.js bridgeAt 一樣）
    const woodT = canvasTex(256, 64, (x, w, h) => {
      x.fillStyle = '#7a5d40'; x.fillRect(0, 0, w, h)
      for (let i = 0; i < 70; i++) { const y = Math.random() * h; x.strokeStyle = `rgba(${40 + Math.random() * 30},${28 + Math.random() * 20},18,${0.25 + Math.random() * 0.35})`; x.lineWidth = 0.6 + Math.random() * 1.6; x.beginPath(); x.moveTo(0, y); x.bezierCurveTo(w * 0.3, y + (Math.random() - 0.5) * 6, w * 0.7, y + (Math.random() - 0.5) * 6, w, y + (Math.random() - 0.5) * 4); x.stroke() }
      for (let i = 0; i < 4; i++) { x.fillStyle = 'rgba(40,26,15,0.45)'; x.beginPath(); x.ellipse(Math.random() * w, Math.random() * h, 3 + Math.random() * 3, 2, 0, 0, 7); x.fill() }
    })
    woodT.wrapS = woodT.wrapT = THREE.RepeatWrapping
    const wood = new THREE.MeshStandardMaterial({ map: woodT, roughness: 0.9, vertexColors: true })
    const steel = new THREE.MeshStandardMaterial({ color: 0x2f4a3c, roughness: 0.55, metalness: 0.5 })      // 橋塔：深綠漆
    const cable = new THREE.MeshStandardMaterial({ color: 0x55595c, roughness: 0.35, metalness: 0.85 })
    const conc = new THREE.MeshStandardMaterial({ color: 0x8d8b84, roughness: 0.95 })
    const meshT = canvasTex(64, 64, (x, w, h) => {            // 菱形鋼絲網（透明底）
      x.clearRect(0, 0, w, h); x.strokeStyle = '#c9cdd0'; x.lineWidth = 2.2
      x.beginPath(); x.moveTo(0, h / 2); x.lineTo(w / 2, 0); x.lineTo(w, h / 2); x.lineTo(w / 2, h); x.closePath(); x.stroke()
    }, false)
    meshT.wrapS = meshT.wrapT = THREE.RepeatWrapping; meshT.repeat.set(len / 0.12, 1.0 / 0.12)
    const netM = new THREE.MeshStandardMaterial({ map: meshT, alphaTest: 0.4, side: THREE.DoubleSide, metalness: 0.6, roughness: 0.5, color: 0x9aa0a4 })
    const woods = [], steels = [], cables = [], concs = [], col = new THREE.Color(), rnd2 = mulberry32(42)
    const box = (list, w, h, d, p, ry = yaw, rx = 0) => list.push(new THREE.BoxGeometry(w, h, d).applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, ry, 0, 'YXZ')).setPosition(p)))
    const tube = (list, pts, r, seg = 64) => list.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), seg, r, 6))
    // 橫樑（鋼）每 0.6 公尺一根；縱向木板一段一段鋪在橫樑上
    const NB = Math.round(len / 0.6)
    for (let i = 0; i <= NB; i++) {
      const t = i / NB, p = deck(t).add(V(0, -0.09, 0))
      box(steels, HW * 2 + 0.12, 0.08, 0.1, p)
    }
    const NPL = 13, plW = (HW * 2 - 0.08) / NPL
    for (let i = 0; i < NB; i++) {
      const t0 = i / NB, t1 = (i + 1) / NB, p0 = deck(t0), p1 = deck(t1), mid = p0.clone().lerp(p1, 0.5), pitch = Math.atan2(p1.y - p0.y, Math.hypot(p1.x - p0.x, p1.z - p0.z))
      for (let k = 0; k < NPL; k++) {
        const off = (k - (NPL - 1) / 2) * plW, q = mid.clone().addScaledVector(side, off).add(V(0, -0.025 + (rnd2() - 0.5) * 0.008, 0))
        const geo = new THREE.BoxGeometry(plW - 0.025, 0.04, len / NB + 0.01)
        geo.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(-pitch, yaw, 0, 'YXZ')).setPosition(q))
        // 每塊板顏色不一樣（舊一點的偏灰）
        col.setHSL(0.07 + rnd2() * 0.03, 0.3 + rnd2() * 0.15, 0.55 + rnd2() * 0.3); if (rnd2() < 0.2) col.lerp(new THREE.Color(0.5, 0.5, 0.48), 0.5)
        const c = []; for (let v = 0; v < geo.attributes.position.count; v++) c.push(col.r, col.g, col.b)
        geo.setAttribute('color', new THREE.Float32BufferAttribute(c, 3))
        woods.push(geo)
      }
    }
    // 兩邊的邊樑（鋼，沿著橋面）
    for (const s of [-1, 1]) { const pts = []; for (let i = 0; i <= 24; i++) pts.push(deck(i / 24).addScaledVector(side, s * (HW + 0.04)).add(V(0, -0.06, 0))); tube(steels, pts, 0.035) }
    // 橋塔：每端兩根方柱＋上下兩根橫樑，站在混凝土基座上；塔頂比橋面高 2.4
    const TH = 6.5, ends = [[0, -1], [1, 1]]   // 2026-11-07 加大
    const topOf = {}
    for (const [t, out] of ends) {
      const p = deck(t).addScaledVector(dir, out * 0.35)
      for (const s of [-1, 1]) {
        const q = p.clone().addScaledVector(side, s * (HW + 0.18))
        const g0 = Math.min(alpineHeight(q.x, q.z), q.y - 0.3)
        box(concs, 0.85, q.y - g0 + 0.35, 0.85, V(q.x, (q.y + g0) / 2 - 0.1, q.z))                  // 基座
        box(steels, 0.36, TH + 0.1, 0.36, q.clone().add(V(0, TH / 2, 0)))
        topOf[t + ',' + s] = q.clone().add(V(0, TH, 0))
      }
      const c0 = p.clone().add(V(0, TH, 0))
      box(steels, HW * 2 + 0.8, 0.3, 0.3, c0); box(steels, HW * 2 + 0.5, 0.2, 0.22, c0.clone().add(V(0, -2.2, 0)))   // 門型上樑＋第二道橫樑（都在頭頂上，人從底下走過）
      // 上角的斜撐（只在頭頂高度，不擋路）
      for (const s of [-1, 1]) tube(steels, [p.clone().addScaledVector(side, s * (HW + 0.18)).add(V(0, TH - 0.9, 0)), p.clone().addScaledVector(side, s * (HW - 0.45)).add(V(0, TH, 0))], 0.045, 2)
    }
    // 主鋼纜：塔頂到塔頂（拋物線，中間離橋面 1.1）；再從塔頂往外拉到地上的錨碇
    for (const s of [-1, 1]) {
      const T0 = topOf['0,' + s], T1 = topOf['1,' + s], pts = []
      const sagMid = T0.clone().lerp(T1, 0.5).y - (deck(0.5).y + 1.25)     // 中間垂到離橋面 1.25
      const NC = Math.round(len / 0.6)
      for (let i = 0; i <= NC; i++) {
        const t = i / NC, d = deck(t).addScaledVector(side, s * (HW + 0.06))
        pts.push(V(d.x, T0.y + (T1.y - T0.y) * t - sagMid * 4 * t * (1 - t), d.z))
      }
      tube(cables, pts, 0.06, 160)
      // 吊索
      for (let i = 1; i < NC; i++) {
        const t = i / NC
        const top = pts[i], bot = deck(t).addScaledVector(side, s * (HW + 0.04)).add(V(0, -0.06, 0))
        tube(cables, [bot, top], 0.008, 1)
      }
      // 扶手鋼索（離橋面 1.0）
      const rail = []; for (let i = 0; i <= 40; i++) rail.push(deck(i / 40).addScaledVector(side, s * (HW + 0.05)).add(V(0, 1.15, 0)))
      tube(cables, rail, 0.016, 120)
      // 錨碇：塔頂往外 4 公尺、往下到地面的混凝土塊
      for (const [t, out] of ends) {
        const T = topOf[t + ',' + s], q = T.clone().addScaledVector(dir, out * 7).addScaledVector(side, s * 0.5)
        q.y = alpineHeight(q.x, q.z) + 0.15
        tube(cables, [T, q], 0.04, 2)
        box(concs, 1.1, 0.7, 1.1, q.clone().add(V(0, 0.05, 0)))
      }
      // 兩側鋼絲網：橋面到扶手
      const np = [], nu = [], ni = []
      for (let i = 0; i <= 40; i++) {
        const t = i / 40, d = deck(t).addScaledVector(side, s * (HW + 0.05))
        np.push(d.x, d.y - 0.04, d.z, d.x, d.y + 1.15, d.z); nu.push(t, 0, t, 1)
        if (i) { const k = (i - 1) * 2; ni.push(k, k + 2, k + 1, k + 1, k + 2, k + 3) }
      }
      const ng = new THREE.BufferGeometry(); ng.setAttribute('position', new THREE.Float32BufferAttribute(np, 3)); ng.setAttribute('uv', new THREE.Float32BufferAttribute(nu, 2)); ng.setIndex(ni); ng.computeVertexNormals()
      const net = new THREE.Mesh(ng, netM); g.add(net)
    }
    for (const [list, m] of [[woods, wood], [steels, steel], [cables, cable], [concs, conc]]) {
      const mesh = new THREE.Mesh(mergeGeometries(list.map((q) => q.index ? q.toNonIndexed() : q).map((q) => { if (!q.attributes.color) { const c = new Float32Array(q.attributes.position.count * 3).fill(1); q.setAttribute('color', new THREE.BufferAttribute(c, 3)) } return q })), m)
      mesh.castShadow = true; mesh.receiveShadow = true; g.add(mesh)
    }
  }
  // 山頂：小木屋、觀景台、三角點、灌叢（summit.js）
  buildSummit({ g, avoid, printsUrl: 'models/store-prints.jpg' })
  // 針葉樹
  {
    const tex = needleTex()
    const needleM = new THREE.MeshStandardMaterial({ map: tex, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.85, color: 0xd2dccb, vertexColors: true })
    // 遠處的樹：mipmap 把針葉的透明度平均掉，alphaTest 一切就只剩枝幹（遠看像一根根竹竿）。照 mip 層級把透明度補回來
    needleM.alphaToCoverage = true
    needleM.onBeforeCompile = (sh) => {
      sh.fragmentShader = sh.fragmentShader.replace('#include <alphatest_fragment>', `
        vec2 nDx = dFdx(vMapUv * vec2(512.0, 256.0)), nDy = dFdy(vMapUv * vec2(512.0, 256.0));
        diffuseColor.a *= 1.0 + max(0.0, 0.5 * log2(max(dot(nDx, nDx), dot(nDy, nDy)))) * 0.35;
        #include <alphatest_fragment>`)
    }
    needleM.customProgramCacheKey = () => 'needleMip'
    const barkM = new THREE.MeshStandardMaterial({ color: 0x5a4636, roughness: 0.95 })
    const coreM = new THREE.MeshStandardMaterial({ color: 0x223a26, roughness: 1 })   // 跟針葉同色系，從上面看不會是一顆黑色金字塔
    for (const kind of ['fir', 'hemlock']) {
      const crown = coniferGeo(kind), trunk = new THREE.CylinderGeometry(0.006, 0.026, 0.86, 8).translate(0, 0.43, 0)   // 樹幹到 86% 就停：不然樹梢會冒出一根光禿禿的樹幹
      // 樹冠裡面一個實心的深綠圓錐：卡片樹側看會透光，遠看只剩枝幹像竹竿；有這個芯遠看才是一棵實心的針葉樹
      const core = new THREE.ConeGeometry(kind === 'fir' ? 0.075 : 0.12, 0.74, 9, 1, true).translate(0, 0.5, 0)
      const list = []
      for (let k = 0; k < 20000 && list.length < (kind === 'fir' ? 330 : 320); k++) {
        const x = ALP.X0 + rnd() * (ALP.X1 - ALP.X0), z = -ALP.HZ + rnd() * ALP.HZ * 2
        if (!inAlpine(x, z, 3) || domeRho(x, z) > 0.94 || Math.hypot(x - CABIN.x, z - CABIN.z) < 9) continue
        if (alpineTrailDist(x, z) < 3.2 || alpineStreamDist(x, z) < 2.5 || Math.hypot(x - ALP_POND.x, z - ALP_POND.z) < ALP_POND.r + 2.5) continue
        const hgt = alpineHeight(x, z)
        // 冷杉在高處、鐵杉在中坡；山頂附近稀疏（箭竹草原）
        let want = kind === 'fir' ? ss(7, 16, hgt) * (1 - 0.85 * ss(17, 22, hgt)) : ss(2.5, 7, hgt) * (1 - ss(14, 20, hgt))
        // 一進山區（花園交界往東）：低處也長一片鐵杉、零星冷杉，不要是空地（2026-11-07 使用者：樹多一點但不要滿）
        const entry = ss(78, 88, x) * (1 - ss(108, 122, x))
        want = Math.max(want, entry * (kind === 'fir' ? 0.1 : 0.26))
        if (rnd() > want * (0.55 + 0.45 * fbm2(x * 0.05, z * 0.05 + kind.length, 2) + 0.3)) continue
        // 越高越矮（高山上的冷杉長不高，山頂看得出去）；不能頂到玻璃
        const H = Math.min(((kind === 'fir' ? 9 : 8) + rnd() * 7) * (1 - 0.5 * ss(12, 22, hgt)), domeY(x, z) - hgt - 1.5)
        if (H < 4) continue
        // 樹冠（底下最寬）不能伸到步道、吊橋、溪上：離中線至少樹冠半徑 + 1.3 公尺
        const crownR = H * (kind === 'fir' ? 0.19 : 0.29)
        if (alpineTrailDist(x, z) < crownR + 1.3 || bridgeDist(x, z) < crownR + 1.5 || alpineStreamDist(x, z) < crownR * 0.6 + 1.2) continue
        if (nearBird(avoid, x, z, 5.5, 2.5)) continue
        if (Math.hypot(x - ALP_TRAIL[0][0], z - ALP_TRAIL[0][1]) < 7) continue   // 步道一進來的地方留一小塊空地，看得到山
        if (Math.hypot(x - ALP_TRAIL.at(-1)[0], z - ALP_TRAIL.at(-1)[1]) < 16) continue   // 山頂觀景台四周是箭竹草原，看得出去
        list.push({ p: V(x, hgt - 0.2, z), q: new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), rnd() * TAU), s: V(H * (0.85 + rnd() * 0.3), H, H * (0.85 + rnd() * 0.3)), H })
        addCollider(x, z, 0.35, hgt + H)
      }
      const ms = []
      for (const [geo, mat] of [[crown, needleM], [trunk, barkM], [core, coreM]]) {
        const m = new THREE.InstancedMesh(geo, mat, list.length)
        const mm = new THREE.Matrix4(), c = new THREE.Color()
        list.forEach((it, i) => { m.setMatrixAt(i, mm.compose(it.p, it.q, it.s)); if (mat === needleM) m.setColorAt(i, c.setHSL(0.27 + (rnd() - 0.5) * 0.06, 0.2 + rnd() * 0.15, 0.7 + rnd() * 0.25)) })   // 每棵深淺、黃綠藍綠都差一點
        m.castShadow = true; m.receiveShadow = true; m.computeBoundingSphere(); g.add(m); ms.push(m)
      }
      lodRegister(ms, 12)   // 視野外的樹不畫（山區變大，樹多了一倍）
    }
    // 山頂一圈：玉山圓柏（矮、往旁邊爬的針葉灌叢，跟鐵杉同一套卡片壓扁）、玉山杜鵑（革質葉＋粉紅花，葉片卡片）
    {
      const leafT = canvasTex(256, 256, (x, w, h) => {
        x.clearRect(0, 0, w, h); const r = mulberry32(21)
        for (let i = 0; i < 46; i++) {   // 一叢叢輪生的長橢圓葉
          const cx = 20 + r() * (w - 40), cy = 30 + r() * (h - 50), a = r() * TAU, L = 22 + r() * 16
          const l = 26 + r() * 22; x.fillStyle = `rgb(${l},${l + 40 + r() * 20},${l + 8})`
          x.save(); x.translate(cx, cy); x.rotate(a); x.beginPath(); x.ellipse(L / 2, 0, L / 2, L * 0.2, 0, 0, TAU); x.fill()
          x.strokeStyle = 'rgba(200,220,170,0.35)'; x.lineWidth = 1; x.beginPath(); x.moveTo(0, 0); x.lineTo(L, 0); x.stroke(); x.restore()
        }
        for (let i = 0; i < 9; i++) {   // 花團：五六朵粉紅的鐘形花聚在枝頂
          const cx = 24 + r() * (w - 48), cy = 20 + r() * (h * 0.6)
          for (let k = 0; k < 6; k++) { const a = k / 6 * TAU + r(), d = 6 + r() * 5; x.fillStyle = `rgb(${236 + r() * 19},${160 + r() * 40},${190 + r() * 30})`; x.beginPath(); x.arc(cx + Math.cos(a) * d, cy + Math.sin(a) * d, 5 + r() * 2, 0, TAU); x.fill(); x.fillStyle = 'rgba(190,80,120,0.6)'; x.beginPath(); x.arc(cx + Math.cos(a) * d, cy + Math.sin(a) * d, 1.6, 0, TAU); x.fill() }
        }
      })
      const leafM = new THREE.MeshStandardMaterial({ map: leafT, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.6, vertexColors: true })
      const rhodo = (() => {   // 半球形的一叢：好幾片交叉的卡片
        const cs = [], r = mulberry32(8)
        for (let i = 0; i < 16; i++) {
          const a = r() * TAU, el = r() * 1.1, c = new THREE.PlaneGeometry(0.9, 0.7).rotateX(-el).rotateY(a).translate(Math.cos(a) * 0.25, 0.35 + Math.sin(el) * 0.2, Math.sin(a) * 0.25)
          cs.push(c.toNonIndexed())
        }
        const gg = mergeGeometries(cs), pp = gg.attributes.position, cc = new Float32Array(pp.count * 3)
        for (let i = 0; i < pp.count; i++) { const k = 0.6 + 0.4 * Math.min(1, pp.getY(i) / 0.7); cc[i * 3] = cc[i * 3 + 1] = cc[i * 3 + 2] = k }
        gg.setAttribute('color', new THREE.BufferAttribute(cc, 3)); return gg
      })()
      const jun = coniferGeo('hemlock')
      const E = ALP_TRAIL.at(-1), EY = ALP_TRAIL.prof.at(-1), J = [], RH = []
      for (let k = 0; k < 1500 && (J.length < 60 || RH.length < 40); k++) {
        const a = rnd() * TAU, d = 6 + Math.pow(rnd(), 0.7) * 36, x = E[0] + Math.cos(a) * d, z = E[1] + Math.sin(a) * d
        if (!inAlpine(x, z, 2) || domeRho(x, z) > 0.93 || alpineTrailDist(x, z) < 1.8 || Math.hypot(x - CABIN.x, z - CABIN.z) < 6.5 || nearBird(avoid, x, z, 3.5, 1.5)) continue
        const y = alpineHeight(x, z); if (y < EY - 10) continue
        const sz = 0.7 + rnd() * 0.9, q = new THREE.Quaternion().setFromEuler(new THREE.Euler((rnd() - 0.5) * 0.3, rnd() * TAU, (rnd() - 0.5) * 0.3))
        if (rnd() < 0.6 ? J.length < 60 : RH.length >= 40) J.push({ p: V(x, y - 0.1, z), q, s: V(3.2 * sz, 1.1 * sz, 3.2 * sz) })
        else RH.push({ p: V(x, y - 0.05, z), q, s: V(1, 1, 1).multiplyScalar(1.1 + rnd() * 0.9) })
      }
      for (const [geo, mat, list] of [[jun, needleM, J], [rhodo, leafM, RH]]) {
        const m = new THREE.InstancedMesh(geo, mat, list.length), mm = new THREE.Matrix4(), c = new THREE.Color()
        list.forEach((it, i) => { m.setMatrixAt(i, mm.compose(it.p, it.q, it.s)); m.setColorAt(i, mat === needleM ? c.setHSL(0.3 + (rnd() - 0.5) * 0.05, 0.25, 0.92 + rnd() * 0.15) : c.setHSL(0.3, 0.1, 0.9 + rnd() * 0.1)) })
        m.castShadow = true; m.receiveShadow = true; m.computeBoundingSphere(); g.add(m)
      }
    }
  }
  // 岩石：陡坡上的大岩塊、溪邊的長苔石頭（用溫室那批岩石模型）
  {
    const lists = {}, put = (n, it) => (lists[n] ||= []).push(it)
    const big = ['rock_face', 'rock_face_02', 'boulder', 'mrock_3', 'mrock_7', 'mrock_9', 'mrock_12'], moss = ['rock_moss_set', 'rock_moss_set_02', 'mrock_8', 'mrock_10', 'boulder']
    const pick = (a) => a[Math.floor(rnd() * a.length)]
    for (let k = 0; k < 8000; k++) {
      const x = ALP.X0 + rnd() * (ALP.X1 - ALP.X0), z = -ALP.HZ + rnd() * ALP.HZ * 2
      if (!inAlpine(x, z, 2) || domeRho(x, z) > 0.95 || Math.hypot(x - CABIN.x, z - CABIN.z) < 7 || alpineTrailDist(x, z) < 2.2 || bridgeDist(x, z) < 2.5 || nearBird(avoid, x, z, 3, 1.5)) continue
      const h = alpineHeight(x, z), slope = Math.hypot(alpineHeight(x + 1, z) - h, alpineHeight(x, z + 1) - h)
      const sd = alpineStreamDist(x, z)
      if (sd > 1.4 && sd < 4 && rnd() < 0.25) put(pick(moss), { p: V(x, h - 0.15, z), q: new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rnd() * TAU, 0)), s: V(1, 1, 1).multiplyScalar(0.8 + rnd() * 1.2), c: new THREE.Color().setHSL(0.25, 0.12, 0.85 + rnd() * 0.1) })
      else if (slope > 0.55 && rnd() < 0.06) {
        const k = 1.5 + rnd() * 2
        if (alpineTrailDist(x, z) < 2.2 + k * 1.3 || bridgeDist(x, z) < 2.5 + k * 1.3) continue   // 大岩塊不能壓到步道
        put(pick(big), { p: V(x, h - 0.6, z), q: new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rnd() * TAU, 0)), s: V(1, 1, 1).multiplyScalar(k), c: new THREE.Color().setHSL(0.1, 0.05, 0.8 + rnd() * 0.12) })
      }
    }
    for (const [n, list] of Object.entries(lists)) if (lib[n]) scatter(g, lib[n], list, { cast: true })
    // 溪邊、池邊的蕨類
    const ferns = []
    for (let k = 0; k < 12000 && ferns.length < 420; k++) {
      const x = ALP.X0 + rnd() * (ALP.X1 - ALP.X0), z = -ALP.HZ + rnd() * ALP.HZ * 2
      if (!inAlpine(x, z, 1) || domeRho(x, z) > 0.95) continue
      const sd = alpineStreamDist(x, z), dp = Math.hypot(x - ALP_POND.x, z - ALP_POND.z)
      if (!((sd > 1.3 && sd < 4.5) || (dp > ALP_POND.r + 0.8 && dp < ALP_POND.r + 3.5)) || alpineTrailDist(x, z) < 1.6) continue
      ferns.push({ p: V(x, alpineHeight(x, z) - 0.05, z), q: new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), rnd() * TAU), s: V(1, 1, 1).multiplyScalar(0.7 + rnd() * 0.5), c: new THREE.Color().setHSL(0.25, 0.15, 0.9) })
    }
    const fl = {}
    for (const f of ferns) (fl[pick(['fern_sa', 'fern_sb', 'fern2_b', 'fern2_c', 'fern_a'])] ||= []).push(f)
    for (const [n, list] of Object.entries(fl)) if (lib[n]) scatter(g, lib[n], list, { cast: false })
  }
  // 玉山箭竹：坡上一大片黃綠色的高草（跟溫室的草同一套草葉，比較高、比較寬），切成 14 公尺一塊做 LOD
  {
    const A = [], B = [], c = new THREE.Color()
    for (let k = 0; k < 260000 && A.length / 4 < 330000; k++) {
      const x = ALP.X0 + rnd() * (ALP.X1 - ALP.X0), z = -ALP.HZ + rnd() * ALP.HZ * 2
      if (!inAlpine(x, z, 1) || domeRho(x, z) > 0.955) continue
      if (Math.hypot(x - ALP_TRAIL.at(-1)[0], z - ALP_TRAIL.at(-1)[1]) < 5.2) continue   // 觀景台上
      if (avoid.some((b) => b.ground && Math.hypot(x - b.x, z - b.z) < 1.6)) continue   // 地上的鳥走動的地方草矮一點也不行：直接不長
      if (Math.hypot(x - CABIN.x, z - CABIN.z) < 4.6) continue   // 小木屋裡面不長草
      if (alpineTrailDist(x, z) < 1.5 || alpineStreamDist(x, z) < 1.4 || Math.hypot(x - ALP_POND.x, z - ALP_POND.z) < ALP_POND.r + 0.6) continue
      const h = alpineHeight(x, z)
      const dens = (0.45 + 0.55 * fbm2(x * 0.07, z * 0.07, 3) + 0.4)
      if (rnd() > dens) continue
      const m = 5 + Math.floor(rnd() * 6), a0 = rnd() * TAU, tall = 0.45 + rnd() * 0.5 + 0.3 * ss(10, 20, h)
      c.setHSL(0.17 + rnd() * 0.05, 0.42, 0.34 + rnd() * 0.1)
      for (let j = 0; j < m; j++) {
        const a = a0 + (j / m) * TAU + (rnd() - 0.5) * 0.6, d = rnd() * 0.12
        A.push(x + Math.cos(a) * d, h - 0.02, z + Math.sin(a) * d, a)
        B.push(c.r, c.g, c.b, tall * (0.7 + rnd() * 0.5))
      }
    }
    const CELL = 14, cells = new Map()
    for (let i = 0; i < A.length / 4; i++) { const key = Math.floor(A[i * 4] / CELL) + ',' + Math.floor(A[i * 4 + 2] / CELL); (cells.get(key) || cells.set(key, []).get(key)).push(i) }
    for (const [key, idx] of cells) {
      for (let i = idx.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]] }
      const a = [], b = []
      for (const i of idx) { a.push(A[i * 4], A[i * 4 + 1], A[i * 4 + 2], A[i * 4 + 3]); b.push(B[i * 4], B[i * 4 + 1], B[i * 4 + 2], B[i * 4 + 3]) }
      const [cx, cz] = key.split(',').map((v) => (+v + 0.5) * CELL)
      const m = bladeMesh(a, b, { width: [0.018, 0.02] }); m.frustumCulled = false; g.add(m)
      lodRegisterGrass(m, V(cx, alpineHeight(cx, cz) + 0.5, cz), CELL * 0.72 + 1)
    }
  }
  // 雲霧：一團團有雲紋的柔邊霧（四種紋路、各自旋轉），多半貼著山谷和低坡、少數掛在山腰；
  // 順著風慢慢往東飄、飄出山區就從西邊再進來，濃淡會慢慢變；鏡頭靠近就淡掉（走進霧裡不會看到一張平板）。
  // 遠近的整體霧氣在 fogzone.js（低處濃、高處淡）。
  const mist = []
  {
    const texs = [0, 1, 2, 3].map((seed) => canvasTex(256, 256, (x, w, h) => {
      const r = mulberry32(90 + seed)
      x.clearRect(0, 0, w, h)
      for (let i = 0; i < 70; i++) {
        const a = r() * TAU, d = Math.pow(r(), 0.7) * w * 0.3, rr = w * (0.08 + r() * 0.16)
        const cx = w / 2 + Math.cos(a) * d * 1.3, cy = h / 2 + Math.sin(a) * d * 0.6
        const gr = x.createRadialGradient(cx, cy, 0, cx, cy, rr)
        gr.addColorStop(0, `rgba(244,247,248,${0.05 + r() * 0.07})`); gr.addColorStop(1, 'rgba(244,247,248,0)')
        x.fillStyle = gr; x.fillRect(0, 0, w, h)
      }
      // 外圈收邊，不留方形的邊
      x.globalCompositeOperation = 'destination-in'
      const m = x.createRadialGradient(w / 2, h / 2, w * 0.18, w / 2, h / 2, w * 0.5)
      m.addColorStop(0, 'rgba(0,0,0,1)'); m.addColorStop(1, 'rgba(0,0,0,0)')
      x.fillStyle = m; x.fillRect(0, 0, w, h)
    }))
    const zMax = ALP.HZ - 4, X0 = 78, X1 = ALP.X1 - 10
    const place = (s, x) => {
      const u = s.userData
      for (let k = 0; k < 40; k++) {
        const z = -zMax + rnd() * zMax * 2
        if (!inAlpine(x, z, 4) || domeRho(x, z) > 0.9) { x = X0 + rnd() * (X1 - X0); continue }
        const gy = alpineHeight(x, z)
        // 偏好低處（山谷、溪邊）；高處的少一點
        if (rnd() > 1.15 - gy / 26) { x = X0 + rnd() * (X1 - X0); continue }
        u.x = x; u.z = z; u.y = gy + u.lift; return
      }
      u.x = x; u.z = 0; u.y = alpineHeight(x, 0) + u.lift
    }
    for (let i = 0; i < 165; i++) {   // 後面 45 團先放在入口那一段（一進山區就是霧茫茫）
      const mat = new THREE.SpriteMaterial({ map: texs[i % 4], depthWrite: false, transparent: true, fog: true, rotation: (rnd() - 0.5) * 0.4, opacity: 0 })
      const s = new THREE.Sprite(mat), sz = 9 + rnd() * 16
      s.scale.set(sz, sz * (0.38 + rnd() * 0.2), 1); s.renderOrder = 7
      s.userData = { sz, lift: sz * 0.22 + 0.5 + rnd() * 4, op: 0.45 + rnd() * 0.45, ph: rnd() * TAU, sp: 0.25 + rnd() * 0.35, x: 0, z: 0, y: 0 }
      place(s, i < 120 ? X0 + rnd() * (X1 - X0) : X0 + rnd() * 30)
      g.add(s); mist.push(s)
    }
    var updateMist = (t, dt, camera) => {
      const cp = camera.position
      for (const s of mist) {
        const u = s.userData
        u.x += u.sp * dt; u.z += Math.sin(t * 0.03 + u.ph) * 0.15 * dt
        if (u.x > X1 || !inAlpine(u.x, u.z, 3)) place(s, X0 + rnd() * 6)
        // 地形變高就慢慢往上抬，不插進山坡
        const gy = alpineHeight(u.x, u.z) + u.lift
        u.y += (gy - u.y) * Math.min(1, dt * 0.3)
        s.position.set(u.x, u.y + Math.sin(t * 0.2 + u.ph) * 0.4, u.z)
        const d = s.position.distanceTo(cp)
        const life = 0.6 + 0.4 * Math.sin(t * 0.05 + u.ph * 3)                     // 慢慢變濃變淡
        const edge = ss(X0, X0 + 8, u.x) * (1 - ss(X1 - 10, X1, u.x))                // 從西邊進來時淡入
        s.material.opacity = u.op * life * edge * ss(u.sz * 0.25, u.sz * 0.7, d)     // 太近就淡掉
        s.visible = s.material.opacity > 0.01
      }
    }
  }
  return { g, mist, spray, waterU, updateMist }
}

/* ---------- 對外 ---------- */
// 山區就是溫室東半邊（2026-11-07 改成一個館）：館內一開始就蓋好、一直畫；animate 每格跑（溪水、雲霧）
export function createAlpine({ scene, lib, avoid = [] }) {
  let interior = null
  return {
    build() { if (!interior) { interior = buildInterior(lib, avoid); scene.add(interior.g) } return interior.g },
    get group() { return interior?.g },
    animate(t, dt, camera) {
      if (!interior) return
      interior.waterU.uTime.value = t
      for (const sp of interior.spray) { const u = sp.userData; sp.position.y = u.y0 + Math.sin(t * 2.3 + u.ph) * 0.15; sp.material.opacity = 0.35 + 0.2 * Math.sin(t * 3.1 + u.ph * 2); const k = u.s0 * (1 + 0.12 * Math.sin(t * 1.7 + u.ph)); sp.scale.set(k * 1.6, k, 1) }
      interior.updateMist(t, dt, camera)
    },
  }
}
