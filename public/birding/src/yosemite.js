// 帳篷區後面的優勝美地風（2026-11-10）：yose 支線（主線第 13 點 → 營地）北邊，沿著溫室玻璃的邊緣立一整面花崗岩壁
// 岩壁：灰白、縱向一條條的稜溝（冰河磨過的花崗岩），表面有黑色的水痕（沿岩壁流下的水染黑）、淡色的剝落面；頂上往後收到玻璃邊
// 瀑布：從岩壁頂一條細長的水簾（像優勝美地瀑布），落到岩壁下的水潭，濺起水霧
// 樹：西黃松（Ponderosa）——高、直、橘紅色的鱗片樹皮，樹冠只在上半段、一簇簇的長針葉；這一區原本的冷杉、鐵杉讓開（alpine.js 用 inYose）
import * as THREE from 'three'
import { ALP_SPURS, alpineHeight, alpineTrailDist, domeRho, domeY, addCollider, YOSE } from './layout.js'
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
    const end = Math.min(ss(X0, X0 + 7, x), ss(X1, X1 - 7, x))   // 兩端收矮，接進山坡
    const Ht = Math.max(3, Math.min(28 + 9 * fbm2(x * 0.05, 3.7, 3), domeY(x, zb + 2.5) - g0 - 2.5) * (0.35 + 0.65 * end))
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
        y = Math.min(y, domeY(x, z) - 0.6)
      }
      row.push([x, y, z])
    }
    for (const [px, py, pz] of row) {
      pos.push(px, py, pz); uv.push(px * 0.22, py * 0.22)
      // 黑色水痕：一條條縱向（只看 x），從上往下淡；淡色剝落面：大塊
      const streak = Math.max(0, fbm2(px * 0.35, 7.1, 3) - 0.52) * 3.2 * ss(g0, g0 + Ht, py)
      const pale = Math.max(0, fbm2(px * 0.06, py * 0.06 + 4, 3) - 0.55) * 1.6
      const k = Math.max(0.35, 1 - streak * 0.75 + pale * 0.25)
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
    for (let k = 0; k < 260; k++) {
      const x = X0 + 4 + rnd() * (X1 - X0 - 8), z = YOSE.base(x) - 0.5 - rnd() * 3.5
      if (alpineTrailDist(x, z) < 4 || Math.hypot(x - YOSE.fall.x, z - YOSE.fall.z) < YOSE.fall.r + 1) continue
      const n = names[Math.floor(rnd() * names.length)], k2 = n === 'boulder' ? 0.25 + rnd() * 0.35 : 0.6 + rnd() * 0.9
      lists[n].push({ p: V(x, alpineHeight(x, z) - 0.25, z), q: new THREE.Quaternion().setFromEuler(new THREE.Euler(rnd() * 0.3, rnd() * TAU, rnd() * 0.3)), s: V(k2, k2 * (0.7 + rnd() * 0.5), k2) })
    }
    // 岩石改成灰白（花崗岩）：材質複製一份、顏色去飽和再提亮（原本掃描的是褐色、長青苔的石頭），跟岩壁一致
    for (const n of names) {
      if (!lists[n].length) continue
      for (const { geo, mat } of parts(lib[n])) {
        const m2 = mat.clone()
        m2.onBeforeCompile = (sh) => { sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
          float gl = dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11)); diffuseColor.rgb = vec3(gl) * vec3(1.55, 1.53, 1.48) + 0.04;`) }
        m2.customProgramCacheKey = () => 'granite'
        const im = new THREE.InstancedMesh(geo, m2, lists[n].length)
        lists[n].forEach((it, i) => im.setMatrixAt(i, m4.compose(it.p, it.q, it.s)))
        im.castShadow = true; im.receiveShadow = true; im.computeBoundingSphere(); g.add(im)
      }
    }
  }

  // ---------- 瀑布＋水潭 ----------
  const F = YOSE.fall, fc = cols.reduce((a, c) => Math.abs(c.x - F.x) < Math.abs(a.x - F.x) ? c : a)
  const topY = fc.g0 + fc.Ht, poolY = alpineHeight(F.x, F.z) + 0.12, fz = fc.zb + 0.6
  const uT = { value: 0 }
  const fallM = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    uniforms: { uT },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `
      varying vec2 vUv; uniform float uT;
      float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
      float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f); return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
      void main(){
        // 一條條往下流的水絲（橫向細、縱向拉長），越往下越散、越白
        float x = vUv.x, y = vUv.y;
        float s1 = n(vec2(x * 22.0, y * 3.0 + uT * 2.6)), s2 = n(vec2(x * 47.0 + 3.0, y * 5.0 + uT * 3.4));
        float str = smoothstep(0.35, 0.85, s1 * 0.6 + s2 * 0.5);
        float edge = smoothstep(0.0, 0.18, x) * smoothstep(1.0, 0.82, x);
        float a = (0.25 + 0.65 * str) * edge * mix(0.75, 1.0, 1.0 - y);
        gl_FragColor = vec4(mix(vec3(0.78, 0.84, 0.86), vec3(1.0), str), a);
      }`,
  })
  {
    // 水簾：上窄下寬、離岩壁一點點；分 24 段，越往下越往前（水往外拋）
    const N = 24, P = [], U = [], I = []
    for (let k = 0; k <= N; k++) {
      const v = k / N, y = topY + 0.3 - (topY + 0.3 - poolY) * v, w = 1.3 + 2.2 * v, out = 0.5 + 2.2 * v * v
      P.push(F.x - w, y, fz - out, F.x + w, y, fz - out); U.push(0, v, 1, v)
      if (k) { const a = (k - 1) * 2; I.push(a, a + 1, a + 2, a + 1, a + 3, a + 2) }
    }
    const fg = new THREE.BufferGeometry(); fg.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); fg.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2)); fg.setIndex(I)
    const fall = new THREE.Mesh(fg, fallM); fall.renderOrder = 3; g.add(fall)
    // 水潭：深綠的水面，落點一圈白沫
    const poolM = new THREE.MeshStandardMaterial({ color: 0x2f5a52, roughness: 0.08, metalness: 0.1, transparent: true, opacity: 0.88 })
    const pool = new THREE.Mesh(new THREE.CircleGeometry(F.r, 40).rotateX(-Math.PI / 2), poolM); pool.position.set(F.x, poolY, F.z); pool.receiveShadow = true; g.add(pool)
    const foamT = (() => { const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d'), r = mulberry32(9); for (let i = 0; i < 500; i++) { const a = r() * TAU, d = Math.sqrt(r()) * 60; x.fillStyle = `rgba(255,255,255,${0.15 + r() * 0.4})`; x.beginPath(); x.arc(64 + Math.cos(a) * d, 64 + Math.sin(a) * d, 1 + r() * 4, 0, TAU); x.fill() } return new THREE.CanvasTexture(c) })()
    const foam = new THREE.Mesh(new THREE.CircleGeometry(3, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: foamT, transparent: true, depthWrite: false, opacity: 0.85 }))
    foam.position.set(F.x, poolY + 0.02, fz - 2.7); g.add(foam)
    // 水霧：幾片朝鏡頭的霧（Sprite），在落點附近慢慢飄
    const mistT = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'); const gr = x.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,0.5)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = gr; x.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c) })()
    for (let k = 0; k < 12; k++) { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: mistT, transparent: true, depthWrite: false, opacity: 0.45 })); sp.position.set(F.x + (rnd() - 0.5) * 5, poolY + 0.8 + rnd() * 4, fz - 2.6 + (rnd() - 0.5) * 3); sp.scale.setScalar(3.5 + rnd() * 3); sp.userData.ph = rnd() * TAU; g.add(sp); mist.push(sp) }
    addCollider(F.x, F.z, F.r * 0.85, poolY + 0.6)
  }

  // ---------- 西黃松 ----------
  const PINES = []
  for (let k = 0; k < 4000 && PINES.length < 30; k++) {
    const x = X0 - 6 + rnd() * (X1 - X0 + 10), z = YOSE.base(x) - 3 - rnd() * 30
    if (!YOSE.inside(x, z) || domeRho(x, z) > 0.9) continue
    if (alpineTrailDist(x, z) < 3 || Math.hypot(x - F.x, z - F.z) < F.r + 3 || PINES.some((p) => Math.hypot(p.x - x, p.z - z) < 7)) continue
    const y = alpineHeight(x, z), H = Math.min(18 + rnd() * 8, domeY(x, z) - y - 2)
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

  function tick(t) {
    uT.value = t
    for (const sp of mist) { sp.material.opacity = 0.3 + 0.15 * Math.sin(t * 0.7 + sp.userData.ph); sp.position.y += Math.sin(t * 0.5 + sp.userData.ph) * 0.002 }
  }
  return { group: g, tick, pines: PINES }
}
const mist = []
