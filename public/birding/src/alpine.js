// 第二館：高山雲霧林。圓頂東門 → 玻璃通道（中間是氣候緩衝室，兩道自動門）→ 一棟玻璃溫室，裡面是台灣高山的地形：
// 入口平台、水池，往東爬升到約 30 公尺的山頂；溪流從山上沿山谷流下來（中途一段小瀑布），步道之字形上山、吊橋過溪谷，山頂有小木屋和三角點。
// 植物：冷杉（細長尖塔）、鐵杉（較寬、枝條下垂）——程式做的針葉卡片樹；坡上一整片玉山箭竹；溪邊蕨類、長苔的岩石；雲霧一直在飄。
// 地形、步道、溪、吊橋的形狀在 layout.js（玩家走路也要用）。
// 效能：外殼（通道、館的鋼構和霧玻璃）一開始就蓋，很便宜；館裡面等玩家走到東邊才蓋。
// 兩館不同時畫：玩家在館裡（或 B 門開著）才畫館內；在圓頂這邊（或 A 門開著）才畫圓頂裡面，緩衝室兩道門都關著的時候切換。
import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { buildSummit } from './summit.js'
import { CABIN, ALP, ALP_STREAM, ALP_POND, ALP_TRAIL, ALP_BRIDGE, ALP_GRID, ALP_HEIGHTS, ALP_PEAK, BRIDGE_DIM, alpineHeight, alpineTrailDist, alpineStreamDist, alpineStreamS, streamWater, streamLatOff, inAlpine, domeY, domeRho, addCollider } from './layout.js'
import { scatter } from './plants.js'
import { bladeMesh } from './flora.js'
import { addWind } from './wind.js'
import { lodRegister, lodRegisterGrass } from './lod.js'
import { mulberry32, fbm2 } from './noise.js'
import { dayLight, mistLevel } from './structures.js'

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
// 針葉卡片的材質（山區的冷杉、鐵杉、圓柏和公園外面的樹林帶共用）
export function needleMaterial() {
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
  return needleM
}
// kind 'fir'：冷杉，細長尖塔、枝條平伸、層次分明；'hemlock'：鐵杉，比較寬、枝條下垂、頂端的芽歪向一邊。高度 1（擺放時縮放）
// 每根側枝兩片交叉的卡片（從側面、從上面看都有厚度）；每層枝數、長度、角度都有亂數，偶爾缺一枝（看得到樹幹，比較自然）
// 頂點顏色：樹冠裡面、下面比較暗（自己遮自己），外面、上面比較亮——卡片樹最缺的就是這個
export function coniferGeo(kind) {
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
      c.setHSL(0.17 + n * 0.04, 0.36, 0.21 + n * 0.06)                                      // 箭竹底下：偏暗的橄欖綠（草叢間的縫看起來是陰影，不是光禿禿的地）
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
    ground.receiveShadow = true; ground.userData.terrain = true; g.add(ground)   // terrain：拍照算遮擋時用高度表，不逐個三角形打射線（scoring.js）
  }
  // 水池＋溪：自己寫的水 shader（溪和池共用）。
  // 水面是平的（不沿著岸往上爬），岸邊靠深度測試自然切掉；每個頂點帶「水深」（水面 - 地形）和「坡度」：
  // 深的地方偏墨綠、淺的地方透出溪底，邊緣淡掉並有一圈白沫；看斜的地方反射天空（菲涅耳）、太陽方向有閃光；
  // 坡度大的那幾段流得快、一片白（小瀑布、急流）。水紋是兩層往下游捲動的雜訊，算法線用。
  const spray = []
  const waterU = { uTime: { value: 0 }, uDay: dayLight, uSun: { value: V(-0.45, 0.8, 0.3).normalize() } }
  // 2026-11-07 第三版（跟 ChatGPT 討論過，依截圖的三個問題改）：
  // 1. 反射：低角度看水面反射的是兩岸的樹和石壁（暗綠），不是白色天空；太陽高光縮小——原本像灰白塑膠
  // 2. 流向圖（uFlow，溪建好時預先算的一張貼圖）：水紋、白沫順著水流方向漂，碰到石頭會分開繞過去；
  //    石頭邊一圈白沫、上游那面堆起來、下游拖一道 V 字尾跡（B 通道）。兩個相位交替取樣，水紋才不會越拉越長
  // 3. 跌水分三段：門檻上的水是平滑發亮的（aLip）、往下是一股股白色水絲夾著深色水、底下一片翻滾的白沫
  const flowTexDummy = new THREE.DataTexture(new Uint8Array([128, 128, 0, 0]), 1, 1); flowTexDummy.needsUpdate = true
  const waterM = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, fog: true, side: THREE.DoubleSide,   // 三角形的方向不管（從上面看才不會被背面剔除）
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uTime: { value: 0 }, uDay: { value: 1 }, uSun: { value: V() }, uFlowBox: { value: new THREE.Vector4(0, 0, 1, 1) } }]),
    vertexShader: `
      attribute float aDepth; attribute float aSlope; attribute float aFoam; attribute float aLip;
      varying vec2 vUv; varying float vDepth; varying float vSlope; varying float vFoam; varying float vLip; varying vec3 vW;
      #include <fog_pars_vertex>
      void main() {
        vUv = uv; vDepth = aDepth; vSlope = aSlope; vFoam = aFoam; vLip = aLip;
        vec4 wp = modelMatrix * vec4(position, 1.0); vW = wp.xyz;
        vec4 mvPosition = viewMatrix * wp;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: `
      uniform float uTime; uniform float uDay; uniform vec3 uSun; uniform sampler2D uFlow; uniform vec4 uFlowBox;
      varying vec2 vUv; varying float vDepth; varying float vSlope; varying float vFoam; varying float vLip; varying vec3 vW;
      #include <fog_pars_fragment>
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float vnoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y); }
      float fbm(vec2 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++) { s += a * vnoise(p); p = p * 2.03 + 7.1; a *= 0.5; } return s; }
      float fbm2(vec2 p) { return vnoise(p) * 0.65 + vnoise(p * 2.1 + 3.7) * 0.35; }
      float ripple(vec2 p) { return fbm(p * 1.3) * 0.6 + fbm2(p * 3.4 + 11.0) * 0.4; }
      // 跌水面：沿著水流方向（uv）往下拉
      float fallWaves(vec2 p, float sp) {
        return fbm(p * vec2(1.6, 0.9) + vec2(0.0, -uTime * sp)) * 0.6 + fbm(p * vec2(3.1, 1.7) + vec2(3.0, -uTime * sp * 1.6)) * 0.4;
      }
      void main() {
        // 流向圖：rg＝水流方向（世界 xz，-1.5～1.5），b＝石頭的白沫、尾跡，a＝流速倍率（水池慢）
        vec2 fuv = (vW.xz - uFlowBox.xy) * uFlowBox.zw;
        vec4 fl = texture2D(uFlow, clamp(fuv, 0.0, 1.0));
        float inside = step(0.0, fuv.x) * step(fuv.x, 1.0) * step(0.0, fuv.y) * step(fuv.y, 1.0);
        vec2 flow = mix(vec2(0.08, 0.05), (fl.rg * 2.0 - 1.0) * 1.5 * mix(0.15, 1.0, fl.a), inside);
        float rockF = fl.b * inside;
        float fall = smoothstep(0.35, 1.2, vSlope);
        float lip = clamp(vLip, 0.0, 1.0);
        float fv = clamp(vFoam, 0.0, 1.2);
        // 兩個相位交替：水紋順著 flow 漂，一個相位拉長之前換另一個接手
        float spd = 0.55 + fv * 0.5 + rockF * 0.4;
        float ph0 = fract(uTime * 0.3), ph1 = fract(uTime * 0.3 + 0.5), wB = abs(ph0 - 0.5) * 2.0;
        vec2 o0 = flow * ph0 * 1.8 * spd, o1 = flow * ph1 * 1.8 * spd;
        vec2 q = vW.xz;
        float e = 0.05;
        float h0 = mix(ripple(q - o0), ripple(q - o1 + 17.3), wB);
        float hx = mix(ripple(q + vec2(e, 0.0) - o0), ripple(q + vec2(e, 0.0) - o1 + 17.3), wB);
        float hz = mix(ripple(q + vec2(0.0, e) - o0), ripple(q + vec2(0.0, e) - o1 + 17.3), wB);
        float rough = (0.55 + fv * 2.2 + rockF * 2.4) * (1.0 - lip * 0.85);      // 潭裡細紋、石頭邊和跌水底下翻滾、門檻上平滑
        vec3 Np = normalize(vec3((h0 - hx) / e * 0.06 * rough, 1.0, (h0 - hz) / e * 0.06 * rough));
        // 跌水那面：沿 uv 往下的水紋
        float sp = 0.45 + fall * 3.0;
        vec2 p = vec2(vUv.x * 1.4, vUv.y * 0.45);
        float g0 = fallWaves(p, sp), gx = fallWaves(p + vec2(0.06, 0.0), sp), gy = fallWaves(p + vec2(0.0, 0.06), sp);
        vec3 Nf = normalize(vec3((g0 - gx) * 4.0, 1.0, (g0 - gy) * 4.0));
        vec3 N = normalize(mix(Np, Nf, fall));
        vec3 Vd = normalize(cameraPosition - vW);
        float fres = 0.02 + 0.98 * pow(1.0 - max(dot(N, Vd), 0.0), 5.0);
        float d = clamp(vDepth / 0.9, 0.0, 1.0);
        // 顏色是線性空間：山溪清澈，淺處透出黃褐石頭、深處青綠
        vec3 bed = vec3(0.11, 0.09, 0.055), mid = vec3(0.025, 0.06, 0.05), deep = vec3(0.005, 0.03, 0.03);
        vec3 col = mix(bed, mid, smoothstep(0.0, 0.45, d));
        col = mix(col, deep, smoothstep(0.45, 1.0, d));
        col += vec3(0.01, 0.026, 0.02) * (h0 - 0.5) * (1.0 - d * 0.5);
        // 反射：低角度看過去倒映的是兩岸的樹和石壁（暗綠、一塊深一塊淺），只有幾乎正上方的反射才是天空
        vec3 R = reflect(-Vd, N);
        vec3 sky = mix(fogColor, vec3(0.78, 0.85, 0.9), 0.5);
        float trees = fbm2(vW.xz * 0.3 + R.xz * 0.5);   // 倒影的明暗跟著位置慢慢變（太跟著反射角走，跌水那面會變成豹紋）
        vec3 bank = mix(vec3(0.008, 0.018, 0.011), vec3(0.03, 0.05, 0.032), trees);
        vec3 env = mix(bank, sky * 0.75, smoothstep(0.82, 0.99, R.y));
        col = mix(col, env, clamp(fres * (1.0 + lip * 0.6) * (1.0 - fall * 0.75), 0.0, 0.92));   // 跌水那面是碎水，幾乎不倒影
        // 太陽高光：小而亮（原本太大一片，看起來像塑膠）
        float spec = pow(max(dot(reflect(-uSun, N), Vd), 0.0), 260.0);
        col += vec3(1.0, 0.97, 0.9) * spec * (1.6 + lip * 1.5);
        // 跌水：一股股白色水絲，中間夾著深色透明的水
        // 三層：粗的水股、細的水絲、最細的拉絲（長焦拉近看才不會是一片糊糊的白）
        float streak = fbm(vec2(vUv.x * 12.0, vUv.y * 0.6 - uTime * sp * 0.9)) * 0.5 + fbm(vec2(vUv.x * 38.0, vUv.y * 1.8 - uTime * sp * 1.25)) * 0.3 + vnoise(vec2(vUv.x * 110.0, vUv.y * 5.0 - uTime * sp * 1.6)) * 0.2;
        float curtain = fall * mix(0.55, 1.0, smoothstep(0.3, 0.48, streak));   // 大部分是白的，只留細細的深色縫（原本白黑各半，拉近看像豹紋）
        // 白沫：跟著水流漂（同一組相位），一塊塊、邊緣碎；跌水底下＋石頭邊／尾跡
        float fb = mix(fbm(q * 2.6 - o0 * 1.2) * 0.55 + fbm2(q * 8.0 - o0 * 1.2) * 0.45, fbm(q * 2.6 - o1 * 1.2 + 9.1) * 0.55 + fbm2(q * 8.0 - o1 * 1.2 + 9.1) * 0.45, wB);   // 泡沫要碎（大塊模糊的白像抹上去的）
        float amt = clamp(fv * 0.75 + rockF * 1.1, 0.0, 1.2);
        float foam = smoothstep(0.78 - amt * 0.36, 0.86 - amt * 0.3, fb) * min(1.0, amt * 1.3);
        foam += smoothstep(0.05, 0.0, vDepth) * smoothstep(0.62, 0.78, fb) * 0.3;   // 岸邊一點點
        foam *= (1.0 - lip * 0.9) * (1.0 - fall);   // 跌水那面不用（白沫是照水平面排的，貼到幾乎垂直的面會拉成一條條糊糊的白），那面只用水絲
        foam = clamp(max(foam, curtain), 0.0, 1.0);
        vec3 white = vec3(0.8, 0.85, 0.86) * (0.82 + 0.18 * h0);
        col = mix(col, white, foam * 0.88);
        col *= mix(0.12, 1.0, uDay);
        float a = mix(0.12, 0.86, d) + foam * 0.55 + fres * 0.35 + fall * 0.25 + lip * 0.2;   // 淺的地方看得到溪底
        a *= smoothstep(0.0, 0.05, vDepth);                                      // 岸邊淡掉，不會有一條硬邊
        gl_FragColor = vec4(col, clamp(a, 0.0, 1.0));
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  })
  waterM.uniforms.uFlow = { value: flowTexDummy }
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
    geo.setAttribute('aDepth', new THREE.Float32BufferAttribute(dep, 1)); geo.setAttribute('aSlope', new THREE.Float32BufferAttribute(slo, 1)); geo.setAttribute('aFoam', new THREE.Float32BufferAttribute(new Float32Array(slo.length), 1)); geo.setAttribute('aLip', new THREE.Float32BufferAttribute(new Float32Array(slo.length), 1)); geo.setIndex(idx)
    const pond = new THREE.Mesh(geo, waterM); pond.renderOrder = 2; g.add(pond)
    // 溪（2026-11-07 改成階梯式：一個個水潭、潭和潭之間一道跌水，layout.js buildSteps）
    // 沿著溪中線每 0.25 公尺一個斷面；水面高度照沿溪距離查（潭裡平的、跌水往下彎）。
    // 斷面寬度不是固定的：往兩邊找到岸比水面高的地方為止（再多 0.15 公尺讓岸自然切掉），水才不會凸出岸外。
    // 每個頂點帶：水深、坡度（跌水那幾格很陡）、白沫量（跌水底下最多，往下游漂散）。
    const st = ALP_STREAM, P = []
    for (let i = 0; i < st.length; i++) P.push(V(st[i][0], 0, st[i][1]))
    const curve = new THREE.CatmullRomCurve3(P, false, 'centripetal'), L = curve.getLength(), N = Math.ceil(L / 0.25), K = 16
    const sp = [], su = [], sd = [], ss_ = [], sf = [], sl = [], si = []
    const S = []
    for (let i = 0; i <= N; i++) { const p = curve.getPointAt(i / N); S.push(alpineStreamS(p.x, p.z)) }
    const foamAt = (s) => {
      let f = 0
      for (const d of st.drops) {
        const x = s - d.s
        if (x >= 0) f += Math.min(1.1, 0.25 + d.h * 0.55) * Math.exp(-x / (0.35 + d.h * 0.35))   // 跌水底下一片白沫，往下游很快散掉
      }
      return Math.min(1.5, f)
    }
    // 門檻上那一小段：水加速、變薄，表面平滑發亮（真的跌水邊緣是一道亮亮的「玻璃」，翻下去才碎成白色）
    const lipAt = (s) => { let l = 0; for (const d of st.drops) { const x = s - d.s; if (x > -0.9 && x < 0.15) l = Math.max(l, Math.min(1, d.h * 1.2) * Math.min(1, (x + 0.9) / 0.6) * (x > 0 ? 1 - x / 0.15 : 1)) } return l }
    let acc = 0, prev = null
    for (let i = 0; i <= N; i++) {
      const p = curve.getPointAt(i / N), tg = curve.getTangentAt(i / N), side = V(-tg.z, 0, tg.x).normalize()
      if (prev) acc += p.distanceTo(prev); prev = p
      // 門檻是斜的、彎的（layout.js streamLatOff）：每一排頂點沿水流方向錯開 off，整排剛好落在同一條「等高線」上，
      // 一排的水面高度都一樣——網格不會被斜的門檻切成鋸齒（第一版每個頂點各查各的，跌水那面全是 V 字摺痕）
      const w = streamWater(S[i]), slope = Math.max(0, (streamWater(S[i] - 0.25) - streamWater(S[i] + 0.25)) / 0.5), f = foamAt(S[i]), lp = lipAt(S[i])
      const at2 = (lat) => { const o = streamLatOff(S[i], lat); return [p.x + side.x * lat - tg.x * o, p.z + side.z * lat - tg.z * o] }
      const edge = (sgn) => { let r = 0.3; while (r < 6) { const [x, z] = at2(r * sgn); if (alpineHeight(x, z) >= w) break; r += 0.1 } return r + 0.15 }
      const el = edge(-1), er = edge(1)
      for (let k = 0; k <= K; k++) {
        const t = k / K, lat = -el + (el + er) * t, [x, z] = at2(lat)
        sp.push(x, w, z); su.push(t, acc - w * 1.2); sd.push(w - alpineHeight(x, z)); ss_.push(slope); sf.push(f); sl.push(lp)
      }
      if (i) for (let k = 0; k < K; k++) { const A = (i - 1) * (K + 1) + k, B = A + 1, C = A + K + 1, D = C + 1; si.push(A, C, B, B, C, D) }
    }
    const sg = new THREE.BufferGeometry()
    sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3)); sg.setAttribute('uv', new THREE.Float32BufferAttribute(su, 2))
    sg.setAttribute('aDepth', new THREE.Float32BufferAttribute(sd, 1)); sg.setAttribute('aSlope', new THREE.Float32BufferAttribute(ss_, 1))
    sg.setAttribute('aFoam', new THREE.Float32BufferAttribute(sf, 1)); sg.setAttribute('aLip', new THREE.Float32BufferAttribute(sl, 1)); sg.setIndex(si)
    const stream = new THREE.Mesh(sg, waterM); stream.renderOrder = 2; g.add(stream)
    // 石頭：用溪的折線（地形就是照它挖的）放
    const rr = mulberry32(77), stones = {}
    const MOSS = ['mrock_8', 'mrock_10', 'mrock_2', 'mrock_5', 'mrock_11'], BIG = ['boulder', 'mrock_3', 'mrock_7', 'mrock_9', 'mrock_12']
    const at = (s) => { let i = 0; while (i < st.length - 2 && st.S[i + 1] < s) i++; const u = (s - st.S[i]) / (st.S[i + 1] - st.S[i]); const x = lerp(st[i][0], st[i + 1][0], u), z = lerp(st[i][1], st[i + 1][1], u), dx = st[i + 1][0] - st[i][0], dz = st[i + 1][1] - st[i][1], l = Math.hypot(dx, dz); return { x, z, sx: -dz / l, sz: dx / l } }
    const put = (names, x, z, y, k, flat = 0.75) => {
      const n = names[Math.floor(rr() * names.length)]
      ;(stones[n] ||= []).push({ p: V(x, y, z), q: new THREE.Quaternion().setFromEuler(new THREE.Euler((rr() - 0.5) * 0.4, rr() * TAU, (rr() - 0.5) * 0.4)), s: V(k, k * (flat + rr() * 0.35), k), c: new THREE.Color().setHSL(0.2, 0.1, 0.62 + rr() * 0.18) })
    }
    // 每道跌水：兩側各一兩顆大石頭夾著（水從中間的缺口翻下去），高的跌水門檻中間偶爾也有一顆把水分成兩股
    for (const d of st.drops) {
      const c = at(d.s - 0.15)
      for (const sgn of [-1, 1]) {
        const n = 1 + (rr() < 0.6 ? 1 : 0)
        for (let j = 0; j < n; j++) {
          const r = 0.75 + rr() * 0.7 + j * 0.8, x = c.x + c.sx * r * sgn, z = c.z + c.sz * r * sgn, back = (rr() - 0.3) * 0.8
          const k = 0.45 + Math.min(0.5, d.h * 0.3) + rr() * 0.3
          put(BIG, x - c.sz * back, z + c.sx * back, d.up - 0.35 - rr() * 0.2, k)
        }
      }
      // 門檻上：兩三顆石頭冒出水面，把翻下去的水切成幾股（門檻看起來才不是一條直線）
      for (let j = 0, n = 2 + (rr() < 0.5 ? 1 : 0); j < n; j++) { const o = (rr() - 0.5) * 2.2, b = at(d.s - 0.1 + (rr() - 0.5) * 0.5); put(MOSS, b.x + b.sx * o, b.z + b.sz * o, d.up - 0.3, 0.26 + rr() * 0.2, 0.6) }
      // 跌水正下方：幾顆被沖圓的石頭半沉在潭裡
      for (let j = 0; j < 2; j++) { const b = at(d.s + 1.2 + rr() * 1.8), o = (rr() - 0.5) * 1.6; put(MOSS, b.x + b.sx * o, b.z + b.sz * o, d.down - 0.3, 0.22 + rr() * 0.18, 0.55) }
    }
    // 潭尾淺的地方、岸邊：零星的石頭（岸上的一半埋在土裡）
    for (let s = 1; s < st.len - 1; s += 1.6) {
      const c = at(s), sgn = rr() < 0.5 ? -1 : 1
      if (rr() < 0.55) { const r = 1.6 + rr() * 1.2, x = c.x + c.sx * r * sgn, z = c.z + c.sz * r * sgn; put(rr() < 0.4 ? BIG : MOSS, x, z, alpineHeight(x, z) - 0.25, 0.3 + rr() * 0.45) }
      if (rr() < 0.3) { const o = (rr() - 0.5) * 1.8, x = c.x + c.sx * o, z = c.z + c.sz * o, w = streamWater(s); if (w - alpineHeight(x, z) < 0.45) put(MOSS, x, z, w - 0.18, 0.18 + rr() * 0.16, 0.5) }
    }
    // 溪床裡一顆顆圓圓的石頭（參考影片：水在石頭之間流，不是一條空的水道）：淺的地方多、冒出水面
    for (let s = 0.8; s < st.len - 0.8; s += 0.9) {
      const c = at(s)
      for (let j = 0; j < 2; j++) {
        if (rr() < 0.35) continue
        const o = (rr() - 0.5) * 3.2, x = c.x + c.sx * o, z = c.z + c.sz * o, w = streamWater(s), dep = w - alpineHeight(x, z)
        if (dep < 0.02 || dep > 0.8) continue
        const k = 0.16 + rr() * 0.3 + (rr() < 0.15 ? 0.3 : 0)
        put(rr() < 0.25 ? BIG : MOSS, x, z, w - k * 0.55 - rr() * 0.1, k, 0.55)
      }
    }
    // 流向圖（給水的 shader，uFlow）：每 0.125 公尺一格，存這裡的水往哪流、石頭邊的白沫。
    // 基本方向＝最近那段溪的下游方向；碰到冒出水面的石頭：往石頭裡衝的分量拿掉（水從兩側繞過、兩側流快一點），
    // 石頭邊一圈白沫（上游那面堆得比較多），下游拖一道 V 字尾跡＋正後方一團亂流。
    {
      const CELL = 0.125, M = 7
      let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9
      for (const [x, z] of st) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z) }
      x0 -= M; x1 += M; z0 -= M; z1 += M
      const nx = Math.ceil((x1 - x0) / CELL), nz = Math.ceil((z1 - z0) / CELL)
      const fx = new Float32Array(nx * nz), fz = new Float32Array(nx * nz), fo = new Float32Array(nx * nz), sa = new Uint8Array(nx * nz)
      for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
        const x = x0 + (i + 0.5) * CELL, z = z0 + (j + 0.5) * CELL
        let best = 1e9, tx = 1, tz = 0
        for (let k = 0; k < st.length - 1; k++) {
          const ax = st[k][0], az = st[k][1], dx = st[k + 1][0] - ax, dz = st[k + 1][1] - az, l2 = dx * dx + dz * dz
          const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2)), ex = x - ax - dx * t, ez = z - az - dz * t, dd = ex * ex + ez * ez
          if (dd < best) { best = dd; const l = Math.sqrt(l2); tx = dx / l; tz = dz / l }
        }
        const id = j * nx + i
        fx[id] = tx; fz[id] = tz
        sa[id] = Math.hypot(x - ALP_POND.x, z - ALP_POND.z) < ALP_POND.r + 2 ? 40 : 255   // 水池裡流得慢
      }
      // 冒出水面的石頭（scatter 的原點在模型底部中心）
      const sizeOf = {}
      for (const n of Object.keys(stones)) if (lib[n]) { const b = new THREE.Box3().setFromObject(lib[n]), v = b.getSize(V()); sizeOf[n] = v }
      const rocks = []
      for (const [n, list] of Object.entries(stones)) {
        const sz = sizeOf[n]; if (!sz) continue
        for (const it of list) {
          const s = alpineStreamS(it.p.x, it.p.z), w = streamWater(s), top = it.p.y + sz.y * it.s.y
          if (top < w + 0.04 || it.p.y > w - 0.02 || alpineStreamDist(it.p.x, it.p.z) > 3.2) continue
          rocks.push({ x: it.p.x, z: it.p.z, r: Math.max(0.12, 0.42 * Math.max(sz.x, sz.z) * it.s.x) })
        }
      }
      for (const rk of rocks) {
        const ext = rk.r * 9, i0 = Math.max(0, Math.floor((rk.x - ext - x0) / CELL)), i1 = Math.min(nx - 1, Math.ceil((rk.x + ext - x0) / CELL))
        const j0 = Math.max(0, Math.floor((rk.z - ext - z0) / CELL)), j1 = Math.min(nz - 1, Math.ceil((rk.z + ext - z0) / CELL))
        const ci = Math.min(nx - 1, Math.max(0, Math.floor((rk.x - x0) / CELL))), cj = Math.min(nz - 1, Math.max(0, Math.floor((rk.z - z0) / CELL)))
        const tx = fx[cj * nx + ci], tz = fz[cj * nx + ci], R = rk.r
        for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
          const x = x0 + (i + 0.5) * CELL, z = z0 + (j + 0.5) * CELL, dx = x - rk.x, dz = z - rk.z, r = Math.hypot(dx, dz) || 1e-4
          const along = dx * tx + dz * tz, lat = -dx * tz + dz * tx, id = j * nx + i
          // 繞過去：往石頭中心的分量拿掉、兩側加速
          if (r < R * 2.4) {
            const k = ss(R * 2.4, R, r), nxv = dx / r, nzv = dz / r, into = fx[id] * nxv + fz[id] * nzv
            if (into < 0) { fx[id] -= nxv * into * k; fz[id] -= nzv * into * k }
            const boost = 1 + 0.45 * k * Math.min(1, Math.abs(lat) / R)
            fx[id] *= boost; fz[id] *= boost
          }
          // 白沫：石頭邊一圈（上游那面多）、V 字尾跡、正後方亂流
          let f = Math.exp(-(((r - R) / 0.13) ** 2)) * (along < 0 ? 0.95 : 0.6)
          if (r < R) f = Math.max(f, 0.6)
          if (along > 0) {
            const spread = R * 0.7 + along * 0.3, wid = 0.1 + along * 0.05
            f = Math.max(f, Math.exp(-(((Math.abs(lat) - spread) / wid) ** 2)) * Math.exp(-along / (R * 4 + 0.6)) * 0.75)
            f = Math.max(f, Math.exp(-((lat / (R * 0.75)) ** 2)) * Math.exp(-along / (R * 2 + 0.3)) * 0.65)
          }
          fo[id] = Math.max(fo[id], f)
        }
      }
      const data = new Uint8Array(nx * nz * 4)
      for (let k = 0; k < nx * nz; k++) {
        data[k * 4] = Math.round(clamp(fx[k] / 1.5 * 0.5 + 0.5, 0, 1) * 255); data[k * 4 + 1] = Math.round(clamp(fz[k] / 1.5 * 0.5 + 0.5, 0, 1) * 255)
        data[k * 4 + 2] = Math.round(clamp(fo[k], 0, 1) * 255); data[k * 4 + 3] = sa[k]
      }
      const tex = new THREE.DataTexture(data, nx, nz); tex.magFilter = tex.minFilter = THREE.LinearFilter; tex.needsUpdate = true
      waterM.uniforms.uFlow.value = tex
      waterM.uniforms.uFlowBox.value.set(x0, z0, 1 / (x1 - x0), 1 / (z1 - z0))
      waterM.userData.flowRocks = rocks.length
    }
    for (const [n, list] of Object.entries(stones)) if (lib[n]) scatter(g, lib[n], list, { cast: true })
    // 跌水底下的水花：一團團白霧貼著水面翻動（高的跌水比較多、比較大）
    const sprayT = canvasTex(64, 64, (x, w, h) => { const gr = x.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2); gr.addColorStop(0, 'rgba(255,255,255,0.9)'); gr.addColorStop(0.5, 'rgba(240,246,248,0.35)'); gr.addColorStop(1, 'rgba(240,246,248,0)'); x.fillStyle = gr; x.fillRect(0, 0, w, h) })
    for (const d of st.drops) {
      if (d.h < 0.5) continue
      const n = d.h > 1.2 ? 3 : 2
      for (let k = 0; k < n; k++) {
        const c = at(d.s + 0.4 + rr() * 0.7), o = (rr() - 0.5) * 1.2
        const sp_ = new THREE.Sprite(new THREE.SpriteMaterial({ map: sprayT, transparent: true, depthWrite: false, fog: true, opacity: 0.4 }))
        const z0 = 0.5 + Math.min(1, d.h * 0.5) + rr() * 0.4; sp_.scale.set(z0 * 1.6, z0, 1)
        sp_.position.set(c.x + c.sx * o, d.down + 0.15 + rr() * 0.25, c.z + c.sz * o)
        sp_.userData = { y0: sp_.position.y, ph: rr() * TAU, s0: z0 }; sp_.renderOrder = 6
        g.add(sp_); spray.push(sp_)
      }
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
  // 山頂：小木屋、三角點、灌叢（summit.js）
  buildSummit({ g, avoid, printsUrl: 'models/store-prints.jpg' })
  // 針葉樹
  {
    const needleM = needleMaterial()
    const barkM = new THREE.MeshStandardMaterial({ color: 0x5a4636, roughness: 0.95 })
    const coreM = new THREE.MeshStandardMaterial({ color: 0x223a26, roughness: 1 })   // 跟針葉同色系，從上面看不會是一顆黑色金字塔
    for (const kind of ['fir', 'hemlock']) {
      const crown = coniferGeo(kind), trunk = new THREE.CylinderGeometry(0.006, 0.026, 0.86, 8).translate(0, 0.43, 0)   // 樹幹到 86% 就停：不然樹梢會冒出一根光禿禿的樹幹
      // 樹冠裡面一個實心的深綠圓錐：卡片樹側看會透光，遠看只剩枝幹像竹竿；有這個芯遠看才是一棵實心的針葉樹
      const core = new THREE.ConeGeometry(kind === 'fir' ? 0.075 : 0.12, 0.74, 9, 1, true).translate(0, 0.5, 0)
      const list = []
      for (let k = 0; k < 30000 && list.length < (kind === 'fir' ? 400 : 430); k++) {
        const x = ALP.X0 + rnd() * (ALP.X1 - ALP.X0), z = -ALP.HZ + rnd() * ALP.HZ * 2
        if (!inAlpine(x, z, 3) || domeRho(x, z) > 0.94 || Math.hypot(x - CABIN.x, z - CABIN.z) < CABIN.R + 4.4) continue
        if (alpineTrailDist(x, z) < 3.2 || alpineStreamDist(x, z) < 2.5 || Math.hypot(x - ALP_POND.x, z - ALP_POND.z) < ALP_POND.r + 2.5) continue
        const hgt = alpineHeight(x, z)
        // 冷杉在高處、鐵杉在中坡；山頂附近稀疏（箭竹草原）
        let want = kind === 'fir' ? ss(7, 16, hgt) * (1 - 0.85 * ss(17, 22, hgt)) : ss(2.5, 7, hgt) * (1 - ss(14, 20, hgt))
        // 一進山區（花園交界往東）：低處也長一片鐵杉、零星冷杉，不要是空地（2026-11-07 使用者：樹多一點但不要滿；2026-11-08 再多一點、延伸遠一點）
        const entry = ss(78, 86, x) * (1 - ss(118, 134, x))
        want = Math.max(want, entry * (kind === 'fir' ? 0.28 : 0.62))
        if (rnd() > want * (0.55 + 0.45 * fbm2(x * 0.05, z * 0.05 + kind.length, 2) + 0.3)) continue
        // 越高越矮（高山上的冷杉長不高，山頂看得出去）；不能頂到玻璃
        const H = Math.min(((kind === 'fir' ? 9 : 8) + rnd() * 7) * (1 - 0.5 * ss(12, 22, hgt)), domeY(x, z) - hgt - 1.5)
        if (H < 4) continue
        // 樹冠（底下最寬）不能伸到步道、吊橋、溪上：離中線至少樹冠半徑 + 1.3 公尺
        const crownR = H * (kind === 'fir' ? 0.19 : 0.29)
        if (alpineTrailDist(x, z) < crownR + 1.3 || bridgeDist(x, z) < crownR + 1.5 || alpineStreamDist(x, z) < crownR * 0.6 + 1.2) continue
        if (nearBird(avoid, x, z, 5.5, 2.5)) continue
        if (Math.hypot(x - ALP_TRAIL[0][0], z - ALP_TRAIL[0][1]) < 7) continue   // 步道一進來的地方留一小塊空地，看得到山
        if (Math.hypot(x - ALP_TRAIL.at(-1)[0], z - ALP_TRAIL.at(-1)[1]) < 16) continue   // 山頂四周是箭竹草原，看得出去
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
        if (!inAlpine(x, z, 2) || domeRho(x, z) > 0.93 || alpineTrailDist(x, z) < 1.8 || Math.hypot(x - CABIN.x, z - CABIN.z) < CABIN.R + 1.9 || nearBird(avoid, x, z, 3.5, 1.5)) continue
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
      if (!inAlpine(x, z, 2) || domeRho(x, z) > 0.95 || Math.hypot(x - CABIN.x, z - CABIN.z) < CABIN.R + 2.4 || alpineTrailDist(x, z) < 2.2 || bridgeDist(x, z) < 2.5 || nearBird(avoid, x, z, 3, 1.5)) continue
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
  // 玉山箭竹（2026-11-07 改）：原本是一叢叢細長草葉、中間露出一大片地面，像稀稀落落的刺。
  // 真的箭竹草原是膝蓋到腰高、密密一整片：每叢幾根細竹稈，稈上不同高度長出披針形的葉子往外斜伸（bladeMesh 的 cane 模式）。
  // 顏色一片片不一樣：大部分黃綠、有些比較深綠、有些偏枯黃；切成 14 公尺一塊做 LOD（遠的變稀，地面顏色接得上）
  {
    const A = [], B = [], c = new THREE.Color(), MAXI = 450000
    for (let k = 0; k < 140000 && A.length / 4 < MAXI; k++) {
      const x = ALP.X0 + rnd() * (ALP.X1 - ALP.X0), z = -ALP.HZ + rnd() * ALP.HZ * 2
      if (!inAlpine(x, z, 1) || domeRho(x, z) > 0.955) continue
            if (avoid.some((b) => b.ground && Math.hypot(x - b.x, z - b.z) < 1.6)) continue   // 地上的鳥走動的地方：不長
      if (Math.hypot(x - CABIN.x, z - CABIN.z) < CABIN.R) continue   // 小木屋裡面不長
      if (alpineTrailDist(x, z) < 1.5 || alpineStreamDist(x, z) < 1.4 || Math.hypot(x - ALP_POND.x, z - ALP_POND.z) < ALP_POND.r + 0.6) continue
      const h = alpineHeight(x, z)
      const patch = fbm2(x * 0.07, z * 0.07, 3)
      if (rnd() > 0.55 + 0.6 * patch) continue
      // 一片片的色調：黃綠為主、深綠、枯黃
      const tone = fbm2(x * 0.11 + 31, z * 0.11 - 17, 2)
      const hue = 0.21 + (tone - 0.5) * 0.06 + (rnd() - 0.5) * 0.02, dry = ss(0.62, 0.8, tone)
      c.setHSL(hue - dry * 0.05, 0.5 - dry * 0.1, 0.22 + rnd() * 0.06 + dry * 0.08)
      const tall = (0.45 + rnd() * 0.3 + 0.25 * ss(10, 22, h)) * (0.85 + 0.3 * patch)
      const stems = 2 + Math.floor(rnd() * 3)
      for (let s = 0; s < stems; s++) {
        const sx = x + (rnd() - 0.5) * 0.25, sz = z + (rnd() - 0.5) * 0.25, st = tall * (0.75 + rnd() * 0.35), sa = rnd() * TAU
        A.push(sx, h - 0.02, sz, sa); B.push(c.r * 0.8, c.g * 0.8, c.b * 0.7, st)   // 竹稈
        // 稈的上半段長葉子：越上面越多、越短
        const nl = 5 + Math.floor(rnd() * 4)
        for (let j = 0; j < nl; j++) {
          const t = 0.3 + (j / nl) * 0.62 + rnd() * 0.06, la = rnd() * TAU, len = (0.24 + rnd() * 0.14) * (1.15 - t * 0.4)
          const lean = 0.2 * st * t   // 稈本身也斜一點：葉子接在稈的位置上
          A.push(sx + Math.cos(sa) * lean * t, h - 0.02 + st * t, sz + Math.sin(sa) * lean * t, la)
          const k2 = 0.95 + rnd() * 0.15
          B.push(c.r * k2, c.g * k2, c.b * k2 * 0.9, -len)
        }
      }
    }
    const CELL = 14, cells = new Map()
    for (let i = 0; i < A.length / 4; i++) { const key = Math.floor(A[i * 4] / CELL) + ',' + Math.floor(A[i * 4 + 2] / CELL); (cells.get(key) || cells.set(key, []).get(key)).push(i) }
    for (const [key, idx] of cells) {
      for (let i = idx.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]] }
      const a = [], b = []
      for (const i of idx) { a.push(A[i * 4], A[i * 4 + 1], A[i * 4 + 2], A[i * 4 + 3]); b.push(B[i * 4], B[i * 4 + 1], B[i * 4 + 2], B[i * 4 + 3]) }
      const [cx, cz] = key.split(',').map((v) => (+v + 0.5) * CELL)
      const m = bladeMesh(a, b, { width: [0.042, 0.028], cane: true }); m.frustumCulled = false; g.add(m)
      lodRegisterGrass(m, V(cx, alpineHeight(cx, cz) + 0.5, cz), CELL * 0.72 + 1)
    }
  }
  // 箭竹的「叢」：一張畫滿竹葉的透明貼圖，貼在三片交叉的面上（遊戲裡密草的標準做法）。
  // 一叢就有幾十片葉子，用很少的數量就能把整片坡蓋滿；近處再加上面那些立體的竹稈和葉子，拉近看才有層次。
  {
    const leafTex = canvasTex(512, 512, (x, w, h) => {
      const r = mulberry32(4242)
      x.clearRect(0, 0, w, h)
      const leaf = (px, py, ang, L, W, col, dark) => {
        const dx = Math.cos(ang), dy = Math.sin(ang), nx = -dy, ny = dx
        const tx = px + dx * L, ty = py + dy * L, droop = L * 0.12
        x.beginPath(); x.moveTo(px, py)
        x.quadraticCurveTo(px + dx * L * 0.3 + nx * W, py + dy * L * 0.3 + ny * W, tx, ty + droop)
        x.quadraticCurveTo(px + dx * L * 0.3 - nx * W, py + dy * L * 0.3 - ny * W, px, py)
        x.fillStyle = col; x.fill()
        x.strokeStyle = dark; x.lineWidth = 1; x.beginPath(); x.moveTo(px, py); x.lineTo(px + dx * L * 0.85, py + dy * L * 0.85 + droop * 0.7); x.stroke()   // 中肋
      }
      // 由後往前、由下往上畫：底下的葉子暗（被上面遮住），上面的亮
      // 叢的輪廓是圓頂、高低不齊（原本每根稈都長到差不多高，整叢像一塊方方的綠籬）；稈不畫到最底下那條邊（不然坡上會看到一排黑線）
      for (let i = 0; i < 70; i++) {
        const off = (r() + r() + r()) / 3 - 0.5, bx = w * 0.5 + off * w * 0.8
        const top = h * (0.06 + Math.abs(off) * 0.9 + r() * 0.3), lean = off * w * 0.35 + (r() - 0.5) * w * 0.1, base = h * (0.88 + r() * 0.1)
        x.strokeStyle = `hsl(${60 + r() * 15}, 32%, ${28 + r() * 10}%)`; x.lineWidth = 1.2 + r() * 0.8
        x.beginPath(); x.moveTo(bx, base); x.quadraticCurveTo(bx + lean * 0.3, (base + top) / 2, bx + lean, top); x.stroke()
        const nl = 4 + Math.floor(r() * 5)
        for (let j = 0; j < nl; j++) {
          const t = 0.3 + (j / nl) * 0.7, px = bx + lean * t * t, py = base + (top - base) * t
          const side = r() < 0.5 ? -1 : 1, ang = -Math.PI / 2 + side * (0.55 + r() * 0.75) + lean / w
          const L = w * (0.1 + r() * 0.09) * (1.1 - t * 0.3), W = L * (0.13 + r() * 0.06)
          const lum = 20 + t * 22 + r() * 8, hue = 68 + r() * 26, sat = 42 + r() * 18
          const dry = r() < 0.12
          leaf(px, py, ang, L, W, dry ? `hsl(${48 + r() * 8}, 40%, ${lum + 6}%)` : `hsl(${hue}, ${sat}%, ${lum}%)`, `hsla(${hue - 10}, 40%, ${lum * 0.6}%, 0.7)`)
        }
      }
    })
    leafTex.wrapS = leafTex.wrapT = THREE.ClampToEdgeWrapping
    const parts = [0, 1, 2].map((i) => new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0).rotateY(i * Math.PI / 3))
    const geo = mergeGeometries(parts)
    { const n = geo.attributes.normal; for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, 1, 0) }   // 法線朝上：三片交叉的面亮度一致（不然轉個角度就一片黑一片白）
    const mat = addWind(new THREE.MeshStandardMaterial({ map: leafTex, alphaTest: 0.42, side: THREE.DoubleSide, roughness: 0.85 }), 0.05)
    // 雙面材質從背面看，three 會把法線翻過來（變朝下）→ 那一面整片黑。這裡的法線本來就統一朝上，不要翻
    { const wind = mat.onBeforeCompile; mat.onBeforeCompile = (sh, r) => { wind(sh, r); sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>', THREE.ShaderChunk.normal_fragment_begin.replace('normal *= faceDirection;', '')) }; mat.customProgramCacheKey = () => 'caneCard' }
    const list = [], c = new THREE.Color()
    for (let k = 0; k < 160000 && list.length < 90000; k++) {
      const x = ALP.X0 + rnd() * (ALP.X1 - ALP.X0), z = -ALP.HZ + rnd() * ALP.HZ * 2
      if (!inAlpine(x, z, 1) || domeRho(x, z) > 0.955) continue
      if (avoid.some((b) => b.ground && Math.hypot(x - b.x, z - b.z) < 1.8)) continue
      if (Math.hypot(x - CABIN.x, z - CABIN.z) < CABIN.R + 0.2) continue
      if (alpineTrailDist(x, z) < 1.7 || alpineStreamDist(x, z) < 1.6 || Math.hypot(x - ALP_POND.x, z - ALP_POND.z) < ALP_POND.r + 0.8) continue
      const patch = fbm2(x * 0.07, z * 0.07, 3)
      if (rnd() > 0.5 + 0.7 * patch) continue
      const hh = alpineHeight(x, z), tone = fbm2(x * 0.11 + 31, z * 0.11 - 17, 2), dry = ss(0.62, 0.8, tone)
      const tall = (0.55 + rnd() * 0.35 + 0.25 * ss(10, 22, hh)) * (0.85 + 0.3 * patch), wide = tall * (1.1 + rnd() * 0.5)
      c.setHSL(0.24 + (tone - 0.5) * 0.08 - dry * 0.06, 0.35, 0.85 + rnd() * 0.25 + dry * 0.15)   // 貼圖本身有顏色：這裡是一片片的色調（乘上去）
      // 坡上：叢的下緣要埋進最低的那一角（原本下坡那邊浮在半空、看得到底）
      const r2 = wide * 0.5, lo = Math.min(hh, alpineHeight(x + r2, z), alpineHeight(x - r2, z), alpineHeight(x, z + r2), alpineHeight(x, z - r2))
      list.push({ x, y: lo - 0.06, z, yaw: rnd() * TAU, w: wide, h: tall + (hh - lo), c: c.clone() })
    }
    const im = new THREE.InstancedMesh(geo, mat, list.length), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler()
    list.forEach((it, i) => {
      m4.compose(V(it.x, it.y, it.z), q.setFromEuler(e.set(0, it.yaw, 0)), V(it.w, it.h, it.w))
      im.setMatrixAt(i, m4); im.setColorAt(i, it.c)
    })
    im.receiveShadow = true; im.castShadow = false; im.layers.set(1)
    im.computeBoundingSphere(); g.add(im)
    lodRegister([im], 2.2)   // 比較高的「植物」：28 公尺開始變稀，遠一點才不畫（再遠是地面的顏色接上）
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
        const mk = mistLevel.value
        const gy = alpineHeight(u.x, u.z) + u.lift * (1 - 0.45 * mk)                   // 清晨、晚上的霧貼著地面、沉在山谷裡
        u.y += (gy - u.y) * Math.min(1, dt * 0.3)
        s.position.set(u.x, u.y + Math.sin(t * 0.2 + u.ph) * 0.4, u.z)
        const d = s.position.distanceTo(cp)
        const life = 0.6 + 0.4 * Math.sin(t * 0.05 + u.ph * 3)                     // 慢慢變濃變淡
        const edge = ss(X0, X0 + 8, u.x) * (1 - ss(X1 - 10, X1, u.x))                // 從西邊進來時淡入
        s.material.opacity = Math.min(1, u.op * life * (1 + 1.1 * mk)) * edge * ss(u.sz * 0.25, u.sz * 0.7, d)     // 太近就淡掉；有霧的時段濃一倍
        s.material.color.setScalar(0.12 + 0.88 * dayLight.value)   // 霧團不受光：跟著天色變暗（晚上原本白白亮亮的，像在發光）
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
      for (const sp of interior.spray) { const u = sp.userData; sp.position.y = u.y0 + Math.sin(t * 2.3 + u.ph) * 0.15; sp.material.opacity = 0.35 + 0.2 * Math.sin(t * 3.1 + u.ph * 2); const k = u.s0 * (1 + 0.12 * Math.sin(t * 1.7 + u.ph)); sp.scale.set(k * 1.6, k, 1); sp.material.color.setScalar(0.12 + 0.88 * dayLight.value) }
      interior.updateMist(t, dt, camera)
    },
  }
}
