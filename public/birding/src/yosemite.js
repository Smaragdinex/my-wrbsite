// 帳篷區後面的優勝美地風（2026-11-10）：yose 支線（主線第 13 點 → 營地）北邊，沿著溫室玻璃的邊緣立一整面花崗岩壁
// 岩壁：灰白、縱向一條條的稜溝（冰河磨過的花崗岩），表面有黑色的水痕（沿岩壁流下的水染黑）、淡色的剝落面；頂上往後收到玻璃邊
// 瀑布：從岩壁頂一條細長的水簾（像優勝美地瀑布），落到岩壁下的水潭，濺起水霧
// 樹：西黃松（Ponderosa）——高、直、橘紅色的鱗片樹皮，樹冠只在上半段、一簇簇的長針葉；這一區原本的冷杉、鐵杉讓開（alpine.js 用 inYose）
import * as THREE from 'three'
import { ALP_SPURS, alpineHeight, alpineTrailDist, domeRho, domeY, addCollider, YOSE, CAMP } from './layout.js'
import { mulberry32, fbm2 } from './noise.js'
import { coniferGeo, needleMaterial } from './alpine.js'
import { barkMaterial } from './bark.js'
import { parts, scatter } from './plants.js'

const TAU = Math.PI * 2, V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z)
const ss = (a, b, v) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t) }

// 花崗岩的顏色貼圖：淺灰底、黑白雲母、石英的小斑點，淡淡的鐵鏽色
function graniteTex() {
  const c = document.createElement('canvas'); c.width = c.height = 512
  const x = c.getContext('2d'), r = mulberry32(17)
  x.fillStyle = '#b9b6ae'; x.fillRect(0, 0, 512, 512)
  for (let i = 0; i < 26000; i++) {
    const k = r(), s = 0.8 + r() * 1.4
    x.fillStyle = k < 0.08 ? `rgba(55,52,50,${0.35 + r() * 0.3})` : k < 0.5 ? `rgba(235,233,226,${0.35 + r() * 0.4})` : k < 0.56 ? `rgba(170,120,80,${0.2 + r() * 0.2})` : `rgba(150,148,140,${0.3 + r() * 0.3})`
    x.fillRect(r() * 512, r() * 512, s, s)
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8
  return t
}

export function buildYosemite(scene, { lib } = {}) {
  const g = new THREE.Group(); g.name = 'yosemite'; scene.add(g)
  const rnd = mulberry32(1851)
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = V()

  // ---------- 岩壁 ----------
  // 每一欄（沿 x）一個斷面：牆腳在 YOSE.base(x)，往上幾乎垂直（微微往後仰），頂上往後收到玻璃邊
  const X0 = YOSE.x0, X1 = YOSE.x1, NX = Math.round((X1 - X0) / 0.5), FACE = 44, TOP = 6
  const pos = [], col = [], uv = [], idx = []
  const cols = []
  for (let i = 0; i <= NX; i++) {
    const x = X0 + (X1 - X0) * i / NX, zb = YOSE.base(x), ze = YOSE.edge(x) - 0.8
    const g0 = alpineHeight(x, zb)
    const Ht = YOSE.Ht(x)   // layout.js：兩端收矮、頂上留空間給玻璃（石階步道走得上去）
    cols.push({ x, zb, g0, Ht })
    const row = []
    for (let k = 0; k <= FACE + TOP; k++) {
      let y, z
      if (k <= FACE) {
        const v = k / FACE
        y = g0 - 1.5 + (Ht + 1.5) * v
        // 往後仰一點；縱向的稜溝（x 方向變化快、y 方向變化慢）＋大塊的凹凸；頂端圓圓地收
        const flute = 0.45 * Math.sin(x * 1.7 + Math.sin(y * 0.11) * 2.2) + 0.25 * Math.sin(x * 4.3 + y * 0.05)
        const lump = 1.6 * (fbm2(x * 0.09, y * 0.07, 4) - 0.5)
        z = zb + v * 1.8 + (flute + lump) * ss(0, 0.08, v) - v * v * v * 0.0 + ss(0.9, 1, v) * 1.2
      } else {
        const t = (k - FACE) / TOP
        y = g0 + Ht + Math.sin(t * Math.PI * 0.5) * 0.8 - t * t * 0.6
        z = zb + 3.0 + (ze - zb - 3.0) * t
      }
      row.push([x, y, z])
    }
    for (const [px, py, pz] of row) {
      pos.push(px, py, pz); uv.push(px * 0.22, py * 0.22)
      // 黑色水痕：一條條縱向（只看 x），從上往下淡；淡色剝落面：大塊
      const streak = Math.max(0, fbm2(px * 0.35, 7.1, 3) - 0.52) * 3.2 * ss(g0, g0 + Ht, py)
      const pale = Math.max(0, fbm2(px * 0.06, py * 0.06 + 4, 3) - 0.55) * 1.6
      const wet = Math.exp(-(((px - YOSE.fall.x) / 4.2) ** 2)) * (0.55 + 0.45 * ss(g0, g0 + 3, py))   // 瀑布後面濕掉的黑色岩壁
      const k = Math.max(0.3, (1 - streak * 0.75 + pale * 0.25) * (1 - 0.55 * wet))
      col.push(k * (1 - streak * 0.05), k, k * (1 + streak * 0.02))
    }
  }
  const W = FACE + TOP + 1
  for (let i = 0; i < NX; i++) for (let k = 0; k < W - 1; k++) { const a = i * W + k, b = a + W; idx.push(a, a + 1, b, a + 1, b + 1, b) }
  const cg = new THREE.BufferGeometry()
  cg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); cg.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); cg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  cg.setIndex(idx); cg.computeVertexNormals()
  const rockN = lib?.rockface_a ? parts(lib.rockface_a).find((p) => p.mat.normalMap)?.mat.normalMap : null   // 掃描岩石的法線圖借來當細部凹凸
  if (rockN) { rockN.wrapS = rockN.wrapT = THREE.RepeatWrapping }
  const cliffM = new THREE.MeshStandardMaterial({ map: graniteTex(), vertexColors: true, roughness: 0.82, side: THREE.DoubleSide, ...(rockN ? { normalMap: rockN, normalScale: new THREE.Vector2(1.2, 1.2) } : {}) })
  const cliff = new THREE.Mesh(cg, cliffM); cliff.castShadow = true; cliff.receiveShadow = true; g.add(cliff)
  for (const c of cols) if (Math.round(c.x * 2) % 3 === 0) addCollider(c.x, c.zb + 0.9, 1.3, c.g0 + c.Ht)

  // 岩壁腳下的落石堆：掃描的岩石、大石頭，沿牆腳 1～4 公尺
  if (lib) {
    const names = ['boulder', 'mrock_1', 'mrock_3', 'mrock_5', 'mrock_8', 'mrock_11'].filter((n) => lib[n]), lists = Object.fromEntries(names.map((n) => [n, []]))
    // 2026-11-10 使用者：石頭再大、再寫實 → 落石堆的石頭放大 1.6 倍；水潭四周一圈 1.5～4 公尺的大石頭（濕的、顏色深）；石頭不能壓到步道（照石頭大小算）
    const FL = YOSE.fall, inPool = (x, z, pad) => ((x - FL.x) / (FL.rx + pad)) ** 2 + ((z - FL.z) / (FL.rz + pad)) ** 2 < 1
    const wetC = (x) => { const w = Math.exp(-(((x - FL.x) / 9) ** 2)); return new THREE.Color().setScalar(1.35 - 0.3 * w) }
    const putRock = (n, x, z, k2, sink = 0.25) => lists[n].push({ p: V(x, alpineHeight(x, z) - sink * k2, z), q: new THREE.Quaternion().setFromEuler(new THREE.Euler(rnd() * 0.3, rnd() * TAU, rnd() * 0.3)), s: V(k2, k2 * (0.7 + rnd() * 0.5), k2), c: wetC(x) })
    for (let k = 0; k < 260; k++) {
      const x = X0 + 4 + rnd() * (X1 - X0 - 8), z = YOSE.base(x) - 0.5 - rnd() * 4
      const n = names[Math.floor(rnd() * names.length)], k2 = (n === 'boulder' ? 0.25 + rnd() * 0.35 : 0.6 + rnd() * 0.9) * 1.6
      if (alpineTrailDist(x, z) < 3.2 + k2 * (n === 'boulder' ? 2.2 : 0.7) || inPool(x, z, 0.6)) continue
      putRock(n, x, z, k2)
    }
    for (let k = 0, made = 0; k < 400 && made < 16; k++) {   // 水潭邊的大石頭（不擋住看瀑布的那一面：步道那側少放）
      const a = rnd() * TAU, x = FL.x + Math.cos(a) * (FL.rx + 0.6 + rnd() * 1.6), z = FL.z + Math.sin(a) * (FL.rz + 0.5 + rnd() * 1.4)
      const n = rnd() < 0.5 && lib.boulder ? 'boulder' : names[1 + Math.floor(rnd() * (names.length - 1))], k2 = n === 'boulder' ? 0.45 + rnd() * 0.5 : 1.6 + rnd() * 1.6
      if (!lists[n] || alpineTrailDist(x, z) < 3.4 + k2 * (n === 'boulder' ? 2.2 : 0.7) || (Math.sin(a) < -0.3 && rnd() < 0.7)) continue
      putRock(n, x, z, k2, 0.3); addCollider(x, z, k2 * (n === 'boulder' ? 1.6 : 0.6), alpineHeight(x, z) + k2 * 0.8); made++
    }
    // 岩石改成灰白（花崗岩）：材質複製一份、顏色去飽和再提亮（原本掃描的是褐色、長青苔的石頭），跟岩壁一致
    for (const n of names) {
      if (!lists[n].length) continue
      for (const { geo, mat } of parts(lib[n])) {
        const m2 = mat.clone()
        m2.onBeforeCompile = (sh) => { sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
          float gl = dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11)); diffuseColor.rgb = mix(vec3(gl) * vec3(1.5, 1.48, 1.43) + 0.03, diffuseColor.rgb * 1.25, 0.3);`) }   // 留三成原本的顏色（青苔、鏽斑），比較寫實
        m2.customProgramCacheKey = () => 'granite'
        const im = new THREE.InstancedMesh(geo, m2, lists[n].length)
        lists[n].forEach((it, i) => { im.setMatrixAt(i, m4.compose(it.p, it.q, it.s)); im.setColorAt(i, it.c) })
        im.castShadow = true; im.receiveShadow = true; im.computeBoundingSphere(); g.add(im)
      }
    }
  }

  // ---------- 瀑布＋水潭（2026-11-10 使用者：更大、更長、更寫實、更有臨場感）----------
  // 三層水簾：後面一層慢、暗（有厚度）；主水簾一條條往下加速的水絲＋白色的「馬尾」水團；前面下半段一層水霧簾
  // 落點：500 顆水花往上往外噴、慢慢飄散；大片水霧；橢圓水潭（13×6.4 公尺）、兩層白沫一圈圈往外；岩壁背後濕黑一條
  const F = YOSE.fall, fc = cols.reduce((a, c) => Math.abs(c.x - F.x) < Math.abs(a.x - F.x) ? c : a)
  let poolY = 1e9
  for (let a = 0; a < 16; a++) for (const k of [0, 0.5, 0.9]) poolY = Math.min(poolY, alpineHeight(F.x + Math.cos(a / 16 * TAU) * F.rx * k, F.z + Math.sin(a / 16 * TAU) * F.rz * k))
  poolY += 0.15
  const topY = fc.g0 + fc.Ht, fz = fc.zb + 0.6
  const uT = { value: 0 }
  const fallMat = (o) => new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    uniforms: { uT, uSpd: { value: o.spd }, uA: { value: o.a }, uDark: { value: o.dark ?? 0 }, uLow: { value: o.low ?? 0 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `
      varying vec2 vUv; uniform float uT, uSpd, uA, uDark, uLow;
      float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
      float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f); return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
      float fbm(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 4; i++){ s += a * n(p); p *= 2.03; a *= 0.5; } return s; }
      void main(){
        float x = vUv.x, y = vUv.y;
        float fall = y * y * 1.6 + y * 0.6;                         // 越往下流越快（重力加速）
        float t = uT * uSpd;
        float s1 = n(vec2(x * 26.0, fall * 4.0 - t * 2.4)), s2 = n(vec2(x * 61.0 + 3.0, fall * 7.0 - t * 3.6));
        float str = smoothstep(0.32, 0.86, s1 * 0.55 + s2 * 0.5);
        float plume = smoothstep(0.48, 0.8, fbm(vec2(x * 7.0, fall * 2.2 - t * 1.7)));   // 白色的水團（馬尾瀑）
        float spread = mix(0.16, 0.06, y);
        float edge = smoothstep(0.0, spread, x) * smoothstep(1.0, 1.0 - spread, x);
        edge *= 0.75 + 0.25 * n(vec2(x * 9.0, fall * 3.0 - t * 1.5));                     // 邊緣破碎
        float low = mix(1.0, smoothstep(0.35, 0.75, y), uLow);                               // 水霧簾只在下半段
        float a = (0.22 + 0.55 * str + 0.45 * plume) * edge * low * uA * mix(0.85, 1.0, y);
        vec3 c = mix(vec3(0.72, 0.8, 0.84), vec3(1.0), clamp(str * 0.6 + plume, 0.0, 1.0));
        gl_FragColor = vec4(mix(c, c * 0.6, uDark), clamp(a, 0.0, 1.0));
      }`,
  })
  {
    const sheet = (wTop, wBot, back, outK, mat, ro, v0 = 0) => {
      const N = 40, P = [], U = [], I = []
      for (let k = 0; k <= N; k++) {
        const v = v0 + (1 - v0) * k / N, y = topY + 0.3 - (topY + 0.3 - poolY) * v, w = wTop + (wBot - wTop) * v, out = back + outK * v * v
        P.push(F.x - w, y, fz - out, F.x + w, y, fz - out); U.push(0, v, 1, v)
        if (k) { const a = (k - 1) * 2; I.push(a, a + 1, a + 2, a + 1, a + 3, a + 2) }
      }
      const fg = new THREE.BufferGeometry(); fg.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); fg.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2)); fg.setIndex(I)
      const m = new THREE.Mesh(fg, mat); m.renderOrder = ro; g.add(m)
    }
    sheet(2.6, 5.4, 0.25, 2.2, fallMat({ spd: 0.7, a: 0.55, dark: 0.35 }), 3)          // 後層
    sheet(3.0, 6.2, 0.5, 3.6, fallMat({ spd: 1.0, a: 1.0 }), 4)                         // 主水簾（岩壁變高了，下面往外拋多一點）
    sheet(3.6, 7.8, 0.9, 4.6, fallMat({ spd: 1.35, a: 0.45, low: 1 }), 5, 0.3)          // 前面的水霧簾
    // 水潭：橢圓、深綠帶一點藍
    const poolM = new THREE.MeshStandardMaterial({ color: 0x2c5a55, roughness: 0.06, metalness: 0.15, transparent: true, opacity: 0.9 })
    const pool = new THREE.Mesh(new THREE.CircleGeometry(1, 56).rotateX(-Math.PI / 2), poolM); pool.scale.set(F.rx, 1, F.rz); pool.position.set(F.x, poolY, F.z); pool.receiveShadow = true; g.add(pool)
    const foamT = (() => { const c = document.createElement('canvas'); c.width = c.height = 256; const x = c.getContext('2d'), r = mulberry32(9); for (let i = 0; i < 1600; i++) { const a = r() * TAU, d = Math.pow(r(), 0.7) * 120; x.fillStyle = `rgba(255,255,255,${(0.1 + r() * 0.45) * (1 - d / 130)})`; x.beginPath(); x.arc(128 + Math.cos(a) * d, 128 + Math.sin(a) * d, 1 + r() * 5, 0, TAU); x.fill() } const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t })()
    for (const [k, sc] of [[0, 6.5], [1, 4.2]]) {
      const fm = new THREE.Mesh(new THREE.CircleGeometry(1, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: foamT, transparent: true, depthWrite: false, opacity: 0.8 }))
      fm.scale.set(sc, 1, sc * 0.6); fm.position.set(F.x, poolY + 0.02 + k * 0.01, fz - 3.2); fm.userData = { sc, k }; fm.renderOrder = 2; g.add(fm); foams.push(fm)
    }
    // 水霧：大片、慢慢飄、有的往步道那邊飄過來
    const mistT = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'); const gr = x.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = gr; x.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c) })()
    for (let k = 0; k < 26; k++) { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: mistT, transparent: true, depthWrite: false, opacity: 0.4 })); const p0 = V(F.x + (rnd() - 0.5) * 11, poolY + 0.6 + rnd() * 9, fz - 2.8 - rnd() * 4); sp.position.copy(p0); sp.scale.setScalar(4 + rnd() * 6); sp.userData = { ph: rnd() * TAU, p0 }; sp.renderOrder = 6; g.add(sp); mist.push(sp) }
    // 水花：落點往上往外噴的小水滴（加色、會飄散）
    const NS = 500, sp = new Float32Array(NS * 3), sv = []
    const reset = (i, first) => { const x = F.x + (rnd() - 0.5) * 9, z = fz - 2.6 - rnd() * 1.8; sp[i * 3] = x; sp[i * 3 + 1] = poolY + (first ? rnd() * 5 : 0.1); sp[i * 3 + 2] = z; sv[i] = V((rnd() - 0.5) * 1.6, 2 + rnd() * 4.5, -(0.4 + rnd() * 2.2)) }
    for (let i = 0; i < NS; i++) reset(i, true)
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(sp, 3))
    const sprayM = new THREE.PointsMaterial({ color: 0xffffff, size: 0.12, transparent: true, opacity: 0.55, depthWrite: false, map: mistT, blending: THREE.AdditiveBlending })
    const spray = new THREE.Points(sg, sprayM); spray.frustumCulled = false; spray.renderOrder = 7; g.add(spray)
    sprayU = (dt) => { for (let i = 0; i < NS; i++) { sv[i].y -= 3.2 * dt; sv[i].multiplyScalar(1 - 0.9 * dt); sp[i * 3] += sv[i].x * dt; sp[i * 3 + 1] += sv[i].y * dt; sp[i * 3 + 2] += sv[i].z * dt; if (sp[i * 3 + 1] < poolY || rnd() < 0.004) reset(i, false) } sg.attributes.position.needsUpdate = true }
    for (let k = -2; k <= 2; k++) addCollider(F.x + k * F.rx * 0.38, F.z + 0.4, F.rz * 0.8, poolY + 0.6)
  }

  // ---------- 瀑布步道：之字形花崗岩石階＋頂上觀景台（layout.js YOSE.stairs；站的高度用 YOSE.stairAt，跟這裡畫的一致） ----------
  {
    const st = YOSE.stairs(), stepM = new THREE.MeshStandardMaterial({ map: cliffM.map, color: 0xd8d4cc, roughness: 0.85, ...(rockN ? { normalMap: rockN } : {}) })
    const wallM = new THREE.MeshStandardMaterial({ map: cliffM.map, color: 0xe6e2da, roughness: 0.95, emissive: 0x2a2826, ...(rockN ? { normalMap: rockN } : {}) })   // 跟岩壁同色、背光面也不會黑成一塊
    const steps = [], walls = [], posts = [], rails = []
    for (let i = 1; i < st.pts.length; i++) {
      const [ax, az] = st.pts[i - 1], [bx, bz] = st.pts[i], mx = (ax + bx) / 2, mz = (az + bz) / 2
      const len = Math.hypot(bx - ax, bz - az), yaw = Math.atan2(bx - ax, bz - az)
      const s0 = st.S[i - 1] + len / 2, top = Math.floor(st.h(s0) / 0.2) * 0.2 + 0.2, gy = alpineHeight(mx, mz)
      steps.push({ p: V(mx, top - 0.09, mz), yaw, s: V(1.9, 0.18, len + 0.04) })   // 踏面
      if (top - 0.18 > gy - 0.4) walls.push({ p: V(mx, (top - 0.18 + gy - 0.6) / 2, mz), yaw, s: V(2.0, top - 0.18 - gy + 0.6, len + 0.05) })   // 底下的砌石
      // 外側（離岩壁遠的那邊）欄杆：每 1.6 公尺一根柱子
      if (i % 3 === 0 && Math.abs(bx - ax) > Math.abs(bz - az) * 2) { const px = mx, pz = mz - 0.95; posts.push(V(px, top, pz)); addCollider(px, pz, 0.12, top + 1.1) }   // 轉彎那一小段不放（會擋在下一段上）
    }
    const P = st.plat
    steps.push({ p: V((P.x0 + P.x1) / 2, P.y - 0.15, (P.z0 + P.z1) / 2), yaw: 0, s: V(P.x1 - P.x0 + 0.2, 0.3, P.z1 - P.z0 + 0.2) })
    { const cx = (P.x0 + P.x1) / 2, cz = (P.z0 + P.z1) / 2, gy = alpineHeight(cx, cz); walls.push({ p: V(cx, (P.y - 0.3 + gy - 0.6) / 2, cz), yaw: 0, s: V(P.x1 - P.x0, P.y - 0.3 - gy + 0.6, P.z1 - P.z0) }) }
    // 觀景台三邊欄杆（靠瀑布那邊、前面、東邊；岩壁那邊不用）
    for (let x = P.x0 + 0.1; x <= P.x1 - 0.1; x += 0.8) { posts.push(V(x, P.y, P.z0 + 0.1)); addCollider(x, P.z0 + 0.1, 0.15, P.y + 1.1) }
    for (let z = P.z0 + 0.9; z <= P.z1 - 0.1; z += 0.8) { posts.push(V(P.x0 + 0.1, P.y, z)); addCollider(P.x0 + 0.1, z, 0.15, P.y + 1.1) }
    const box = new THREE.BoxGeometry(1, 1, 1)
    const im = (list, mat) => { const m = new THREE.InstancedMesh(box, mat, list.length); list.forEach((b, i) => m.setMatrixAt(i, m4.compose(b.p, q.setFromAxisAngle(V(0, 1, 0), b.yaw), b.s))); m.castShadow = true; m.receiveShadow = true; m.computeBoundingSphere(); g.add(m) }
    im(steps, stepM); im(walls, wallM)
    const ironM = new THREE.MeshStandardMaterial({ color: 0x3b3d3f, roughness: 0.5, metalness: 0.6 })
    const pg = new THREE.CylinderGeometry(0.035, 0.035, 1.05, 6).translate(0, 0.52, 0), pm = new THREE.InstancedMesh(pg, ironM, posts.length)
    posts.forEach((p, i) => pm.setMatrixAt(i, m4.makeTranslation(p.x, p.y, p.z))); pm.castShadow = true; g.add(pm)
    for (let i = 1; i < posts.length; i++) { const a = posts[i - 1], b = posts[i]; if (a.distanceTo(b) > 2.6) continue; const d = b.clone().sub(a), r = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, d.length(), 5), ironM); r.position.copy(a).add(b).multiplyScalar(0.5).setY((a.y + b.y) / 2 + 1.0); r.quaternion.setFromUnitVectors(V(0, 1, 0), d.normalize()); g.add(r) }
  }

  // ---------- 西黃松 ----------
  const PINES = []
  for (let k = 0; k < 4000 && PINES.length < 30; k++) {
    const x = X0 - 6 + rnd() * (X1 - X0 + 10), z = YOSE.base(x) - 3 - rnd() * 30
    if (!YOSE.inside(x, z) || domeRho(x, z) > 0.9) continue
    if (alpineTrailDist(x, z) < 3 || Math.hypot(x - F.x, z - F.z) < 14 || PINES.some((p) => Math.hypot(p.x - x, p.z - z) < 7)) continue
    if (Math.hypot(x - CAMP.x, z - CAMP.z) < CAMP.R + 4 || YOSE.behind(x, z)) continue   // 營地裡、石階步道上不長
    const y = alpineHeight(x, z), H = 18 + rnd() * 10
    if (H < 10) continue
    PINES.push({ x, z, y, H, rot: rnd() * TAU, lean: (rnd() - 0.5) * 0.05 })
  }
  if (PINES.length) {
    const pbark = barkMaterial('pine_bark', { normal: 1.5, color: [1.75, 1.15, 0.8] })   // 西黃松的樹皮：橘紅色的大鱗片，裂縫黑
    const tg = new THREE.CylinderGeometry(0.55, 1, 1, 18, 12, true).translate(0, 0.5, 0)
    { const u = tg.attributes.uv; for (let i = 0; i < u.count; i++) u.setXY(i, u.getX(i) * 2, u.getY(i) * 10) }
    const trunk = new THREE.InstancedMesh(tg, pbark, PINES.length)
    const limbs = [], tufts = [], cc = new THREE.Color()
    PINES.forEach((p, i) => {
      const R = 0.32 + p.H * 0.012
      m4.compose(V(p.x, p.y - 0.3, p.z), q.setFromEuler(e.set(p.lean, p.rot, 0)), s.set(R, p.H * 0.93, R)); trunk.setMatrixAt(i, m4)
      addCollider(p.x, p.z, R * 1.1, p.y + p.H)
      // 樹冠：上半段 10～14 根往上翹的枝，枝梢一簇簇長針葉（樹冠開闊、看得到天空）
      const nL = 10 + Math.floor(rnd() * 5)
      for (let k = 0; k < nL; k++) {
        const h = p.H * (0.5 + 0.42 * k / nL), a = k * 2.4 + rnd() * 0.6, up = 0.15 + rnd() * 0.35 + 0.3 * (k / nL)
        const len = p.H * (0.13 + rnd() * 0.07) * (1.15 - k / nL * 0.6), dir = V(Math.cos(a) * Math.cos(up), Math.sin(up), Math.sin(a) * Math.cos(up))
        const base = V(p.x, p.y + h, p.z)
        limbs.push({ p: base, q: new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), dir), s: V(R * 0.18, len, R * 0.18) })
        for (const u of [0.55, 0.85, 1.05]) {
          const S = 2.0 + rnd() * 1.4, cp = base.clone().addScaledVector(dir, len * u).add(V(0, -S * 0.3, 0))
          tufts.push({ p: cp, q: new THREE.Quaternion().setFromEuler(new THREE.Euler((rnd() - 0.5) * 1.2, rnd() * TAU, (rnd() - 0.5) * 1.2)), s: V(S * 1.3, S, S * 1.3), c: cc.setHSL(0.27 + (rnd() - 0.5) * 0.04, 0.3, 0.6 + rnd() * 0.12).clone() })
        }
      }
      tufts.push({ p: V(p.x, p.y + p.H * 0.86, p.z), q: new THREE.Quaternion(), s: V(3, p.H * 0.16, 3), c: cc.setHSL(0.27, 0.3, 0.65).clone() })   // 樹梢
    })
    const lg = new THREE.CylinderGeometry(0.3, 1, 1, 8, 1, true).translate(0, 0.5, 0)
    const limbM = new THREE.InstancedMesh(lg, pbark, limbs.length); limbs.forEach((l, i) => limbM.setMatrixAt(i, m4.compose(l.p, l.q, l.s)))
    const tuftM = new THREE.InstancedMesh(coniferGeo('hemlock', 7), needleMaterial(), tufts.length); tufts.forEach((t, i) => { tuftM.setMatrixAt(i, m4.compose(t.p, t.q, t.s)); tuftM.setColorAt(i, t.c) })
    for (const m of [trunk, limbM, tuftM]) { m.castShadow = true; m.receiveShadow = true; m.computeBoundingSphere(); g.add(m) }
  }

  let lastT = 0
  function tick(t) {
    const dt = Math.min(0.1, Math.max(0, t - lastT)); lastT = t
    uT.value = t
    for (const sp of mist) { const u = sp.userData; sp.material.opacity = 0.28 + 0.16 * Math.sin(t * 0.6 + u.ph); sp.position.set(u.p0.x + Math.sin(t * 0.13 + u.ph) * 1.5, u.p0.y + Math.sin(t * 0.21 + u.ph) * 0.8, u.p0.z - (0.5 + 0.5 * Math.sin(t * 0.09 + u.ph)) * 2.5) }
    for (const f of foams) { const k = (t * (f.userData.k ? 0.35 : 0.22) + f.userData.k * 0.5) % 1; f.rotation.y = t * (f.userData.k ? -0.05 : 0.03); f.material.opacity = 0.85 * (1 - k * 0.6) }
    if (sprayU && dt > 0) sprayU(dt)
  }
  return { group: g, tick, pines: PINES }
}
const mist = [], foams = []
let sprayU = null
