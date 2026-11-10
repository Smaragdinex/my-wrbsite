// 山下的湖（ALP_POND）：荷花和錦鯉（2026-11-10）
// 荷花：幾片荷葉叢（靠岸、水深 0.15～1.4 公尺），每叢有浮在水面的葉、挺出水面的葉（葉柄從葉心長出、葉面像淺碗、邊緣波浪）、
//       粉紅的花（三層花瓣圍成杯形、中間黃綠色蓮蓬）、花苞、凋謝後的蓮蓬。鴨子游的中間那片水留空。
// 錦鯉：Tripo 模型（models/plants/koi.glb，頭朝 -x、長 1），在水面下 0.15～0.5 公尺慢慢游；身體用 vertex shader 左右擺尾
import * as THREE from 'three'
import { ALP_POND, alpineHeight } from './layout.js'
import { mulberry32 } from './noise.js'
import { parts } from './plants.js'

const TAU = Math.PI * 2, V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z)
const W = ALP_POND.water

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h
  draw(c.getContext('2d'), w, h)
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8
  return t
}

// 荷葉貼圖：藍綠、蠟質，中心一個淡色圓點，二十幾條從中心放射、到邊緣分叉的葉脈
function padTex() {
  return canvasTex(512, 512, (x, w) => {
    const c = w / 2, r = mulberry32(5)
    const g = x.createRadialGradient(c, c, 0, c, c, c)
    g.addColorStop(0, '#9fbf7a'); g.addColorStop(0.08, '#6f9a58'); g.addColorStop(0.7, '#4e7f48'); g.addColorStop(0.97, '#5b8a50'); g.addColorStop(1, '#3d6a3a')
    x.fillStyle = g; x.fillRect(0, 0, w, w)
    for (let i = 0; i < 2600; i++) { const a = r() * TAU, d = Math.sqrt(r()) * c; x.fillStyle = `rgba(${150 + r() * 60},${190 + r() * 40},${150 + r() * 50},${0.05 + r() * 0.06})`; x.fillRect(c + Math.cos(a) * d, c + Math.sin(a) * d, 2 + r() * 3, 2 + r() * 3) }   // 蠟質的白霜
    const N = 22
    for (let i = 0; i < N; i++) {
      const a = i / N * TAU + r() * 0.08
      x.strokeStyle = 'rgba(200,225,170,0.55)'; x.lineWidth = 3.2; x.beginPath(); x.moveTo(c, c)
      const ex = c + Math.cos(a) * c * 0.78, ey = c + Math.sin(a) * c * 0.78
      x.quadraticCurveTo(c + Math.cos(a + 0.05) * c * 0.4, c + Math.sin(a + 0.05) * c * 0.4, ex, ey); x.stroke()
      x.lineWidth = 1.6
      for (const s of [-1, 1]) { x.beginPath(); x.moveTo(ex, ey); x.lineTo(c + Math.cos(a + s * 0.07) * c * 0.97, c + Math.sin(a + s * 0.07) * c * 0.97); x.stroke() }
    }
    x.fillStyle = '#b7cf8e'; x.beginPath(); x.arc(c, c, 9, 0, TAU); x.fill()
  })
}
// 花瓣：底部白、往尖端漸層成粉紅，細細的縱脈
function petalTex() {
  return canvasTex(128, 256, (x, w, h) => {
    const g = x.createLinearGradient(0, h, 0, 0)
    g.addColorStop(0, '#fbf3ea'); g.addColorStop(0.45, '#f6c9d4'); g.addColorStop(0.85, '#e57fa0'); g.addColorStop(1, '#d4567f')
    x.fillStyle = g; x.fillRect(0, 0, w, h)
    for (let i = 0; i < 14; i++) { const px = w * (0.1 + 0.8 * i / 13); x.strokeStyle = 'rgba(200,80,120,0.22)'; x.lineWidth = 1.2; x.beginPath(); x.moveTo(w / 2, h); x.quadraticCurveTo(px, h * 0.5, px + (px - w / 2) * 0.1, 0); x.stroke() }
  })
}

// 荷葉：半徑 1 的圓，往上翹成淺碗（中心低、邊緣高），邊緣波浪
function padGeo(cup, wave, seed) {
  const r = mulberry32(seed), NA = 40, NR = 7, pos = [], uv = [], idx = []
  const ph = r() * TAU
  for (let i = 0; i <= NR; i++) for (let j = 0; j <= NA; j++) {
    const t = i / NR, a = j / NA * TAU
    const y = cup * t * t + wave * t * t * t * (Math.sin(a * 7 + ph) * 0.6 + Math.sin(a * 13 + ph * 2) * 0.4)
    pos.push(Math.cos(a) * t, y, Math.sin(a) * t); uv.push(0.5 + Math.cos(a) * t * 0.5, 0.5 + Math.sin(a) * t * 0.5)
    if (i && j) { const A = (i - 1) * (NA + 1) + j - 1, B = A + 1, C = A + NA + 1, D = C + 1; idx.push(A, B, C, B, D, C) }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx)
  g.computeVertexNormals(); return g
}
// 一朵花（高約 0.16、寬 0.2，原點在花托）：外 8、中 8、內 6 片匙形花瓣，越外層越往外開；中間蓮蓬
function flowerGeo(open) {
  const r = mulberry32(11), ps = []
  const petal = (L, Wd) => {
    const q = new THREE.PlaneGeometry(Wd, L, 3, 6).translate(0, L / 2, 0), p = q.attributes.position
    for (let i = 0; i < p.count; i++) { const t = p.getY(i) / L, sx = p.getX(i) / (Wd / 2); p.setX(i, p.getX(i) * Math.sin(Math.PI * Math.min(1, t * 0.85 + 0.15)) * (0.55 + 0.45 * t)); p.setZ(i, -sx * sx * Wd * 0.28 + t * t * L * 0.12) }   // 匙形、往內凹
    return q
  }
  for (const [n, tilt, L, off] of [[8, 0.75 * open + 0.2, 0.1, 0], [8, 0.5 * open + 0.15, 0.095, 0.4], [6, 0.28 * open + 0.1, 0.085, 0.2]]) {
    for (let k = 0; k < n; k++) ps.push(petal(L, L * 0.62).rotateX(-tilt + (r() - 0.5) * 0.12).rotateY(k / n * TAU + off).translate(0, 0.008, 0))
  }
  const g = mergeAll(ps.map((q) => q.toNonIndexed()))
  return g
}
function mergeAll(list) {
  let n = 0; for (const q of list) n += q.attributes.position.count
  const P = new Float32Array(n * 3), N = new Float32Array(n * 3), U = new Float32Array(n * 2); let o = 0
  for (const q of list) { if (!q.attributes.normal) q.computeVertexNormals(); P.set(q.attributes.position.array, o * 3); N.set(q.attributes.normal.array, o * 3); U.set(q.attributes.uv.array, o * 2); o += q.attributes.position.count }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.BufferAttribute(N, 3)); g.setAttribute('uv', new THREE.BufferAttribute(U, 2)); return g
}

const depthAt = (x, z) => W - alpineHeight(x, z)
const rOf = (x, z) => Math.hypot(x - ALP_POND.x, z - ALP_POND.z)

export function buildPondLife(scene, { lib } = {}) {
  const g = new THREE.Group(); g.name = 'pondLife'; scene.add(g)
  const rnd = mulberry32(2610), R = ALP_POND.r
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = V()

  // ---------- 荷花 ----------
  const pads = [], raised = [], stalks = [], flowers = [], buds = [], pods = []
  // 水雉（birdinfo.js 的 jacana）站的地方：先鋪幾片大的浮葉，牠走來走去都踩在葉子上
  for (const [dx, dz, sz] of [[0, 0, 0.5], [0.55, 0.25, 0.42], [-0.5, 0.3, 0.45], [0.1, -0.55, 0.44], [-0.45, -0.4, 0.4], [0.6, -0.35, 0.38]]) pads.push({ x: 89.2 + dx, z: -46.9 + dz, size: sz, rot: rnd() * TAU })
  // 4 叢：西、南、東南、東北（鴨子在北邊靠步道那一側游，那裡留空給牠們）
  for (const ang of [200, 268, 318, 350]) {   // 2026-11-10 東北那叢（30°）剛好長在河口上 → 移到 350°
    const a = ang / 180 * Math.PI, cx = ALP_POND.x + Math.cos(a) * R * 0.8, cz = ALP_POND.z + Math.sin(a) * R * 0.8
    for (let k = 0; k < 900; k++) {
      const d = Math.sqrt(rnd()) * 6.5, b = rnd() * TAU, x = cx + Math.cos(b) * d, z = cz + Math.sin(b) * d * 0.75
      const dep = depthAt(x, z)
      if (dep < 0.15 || dep > 1.4 || rOf(x, z) > R * 0.97) continue
      const size = 0.26 + rnd() * 0.26
      if ([...pads, ...raised].some((p) => Math.hypot(p.x - x, p.z - z) < (p.size + size) * 0.62)) continue
      const nearJ = Math.hypot(x - 89.2, z + 46.9) < 2.4   // 水雉旁邊只鋪浮葉（挺水葉、花會擋住牠）
      const up = rnd() < 0.55 && !nearJ
      if (up) {   // 挺水葉：葉柄 0.3～1 公尺、葉面微傾
        const h = 0.12 + rnd() * 0.4
        raised.push({ x, z, size: size * 1.15, h, tx: (rnd() - 0.5) * 0.4, tz: (rnd() - 0.5) * 0.4, rot: rnd() * TAU })
      } else pads.push({ x, z, size, rot: rnd() * TAU })
      if (nearJ) continue
      if (rnd() < 0.13) flowers.push({ x: x + (rnd() - 0.5) * 0.3, z: z + (rnd() - 0.5) * 0.3, h: 0.4 + rnd() * 0.35, open: 0.5 + rnd() * 0.5, rot: rnd() * TAU, lean: (rnd() - 0.5) * 0.25 })
      else if (rnd() < 0.08) buds.push({ x: x + (rnd() - 0.5) * 0.3, z: z + (rnd() - 0.5) * 0.3, h: 0.35 + rnd() * 0.3, rot: rnd() * TAU })
      else if (rnd() < 0.05) pods.push({ x: x + (rnd() - 0.5) * 0.3, z: z + (rnd() - 0.5) * 0.3, h: 0.3 + rnd() * 0.3, rot: rnd() * TAU })
    }
  }
  const padT = padTex()
  const padM = new THREE.MeshStandardMaterial({ map: padT, roughness: 0.42, side: THREE.DoubleSide, color: 0xe8f0e0 })
  const inst = (geo, mat, list, set) => {
    const m = new THREE.InstancedMesh(geo, mat, Math.max(1, list.length)); m.count = list.length
    list.forEach((it, i) => { set(it); m.setMatrixAt(i, m4) })
    m.castShadow = true; m.receiveShadow = true; m.computeBoundingSphere(); g.add(m); return m
  }
  inst(padGeo(0.04, 0.025, 1), padM, pads, (p) => m4.compose(V(p.x, W + 0.012, p.z), q.setFromEuler(e.set(0, p.rot, 0)), s.set(p.size, p.size, p.size)))
  inst(padGeo(0.28, 0.08, 2), padM, raised, (p) => m4.compose(V(p.x + p.tx * p.h * 0.3, W + p.h, p.z + p.tz * p.h * 0.3), q.setFromEuler(e.set(p.tx, p.rot, p.tz)), s.set(p.size, p.size, p.size)))
  // 葉柄、花梗：細長綠莖（從水面到葉心／花托）
  const stemM = new THREE.MeshStandardMaterial({ color: 0x6c8a46, roughness: 0.6 })
  const stemG = new THREE.CylinderGeometry(0.006, 0.008, 1, 6).translate(0, 0.5, 0)
  for (const p of raised) stalks.push({ x: p.x, z: p.z, h: p.h, tx: p.tx * 0.3, tz: p.tz * 0.3 })
  for (const p of [...flowers, ...buds, ...pods]) stalks.push({ x: p.x, z: p.z, h: p.h, tx: p.lean ?? 0, tz: 0 })
  inst(stemG, stemM, stalks, (p) => m4.compose(V(p.x, W - 0.05, p.z), q.setFromEuler(e.set(p.tx, 0, p.tz)), s.set(1, p.h + 0.05, 1)))
  // 花
  const petalM = new THREE.MeshStandardMaterial({ map: petalTex(), roughness: 0.5, side: THREE.DoubleSide })
  const top = (p) => V(p.x + Math.sin(p.lean ?? 0) * 0 , W + p.h, p.z)
  inst(flowerGeo(1), petalM, flowers, (p) => m4.compose(top(p).add(V(0, 0, Math.sin(p.lean) * p.h)), q.setFromEuler(e.set(p.lean, p.rot, 0)), s.setScalar(2.2 + p.open * 0.8)))
  inst(flowerGeo(0.05), petalM, buds, (p) => m4.compose(top(p), q.setFromEuler(e.set(0, p.rot, 0)), s.setScalar(1.8)))
  // 蓮蓬：花中間（黃綠）和凋謝後的（綠褐）：倒圓錐，上面一個個小孔
  const podG = new THREE.CylinderGeometry(0.035, 0.018, 0.035, 14).translate(0, 0.03, 0)
  const podM = new THREE.MeshStandardMaterial({ color: 0xc8c860, roughness: 0.6 }), oldPodM = new THREE.MeshStandardMaterial({ color: 0x6f7a3c, roughness: 0.7 })
  inst(podG, podM, flowers, (p) => m4.compose(top(p).add(V(0, 0, Math.sin(p.lean) * p.h)), q.setFromEuler(e.set(p.lean, 0, 0)), s.setScalar(2.2)))
  inst(podG, oldPodM, pods, (p) => m4.compose(top(p), q.setFromEuler(e.set(0.4, p.rot, 0)), s.setScalar(2)))

  // ---------- 錦鯉 ----------
  const fish = [], fishMeshes = []
  const uTime = { value: 0 }
  if (lib?.koi) {
    const N = 26, TINT = [[1, 1, 1], [1, 1, 1], [1, 0.82, 0.55], [1, 0.95, 0.75], [0.55, 0.52, 0.5], [1, 0.7, 0.35]]   // 紅白為主，幾條橘、金黃、黑灰
    for (let i = 0; i < N; i++) {
      let x, z
      for (let k = 0; k < 200; k++) { const a = rnd() * TAU, d = Math.sqrt(rnd()) * R * 0.85; x = ALP_POND.x + Math.cos(a) * d; z = ALP_POND.z + Math.sin(a) * d; if (depthAt(x, z) > 0.7) break }
      fish.push({ x, z, y: W - 0.16 - rnd() * 0.18, h: rnd() * TAU, v: 0.25 + rnd() * 0.2, turn: 0, len: 0.4 + rnd() * 0.3, ph: rnd() * TAU, t: rnd() * 5, tint: TINT[i % TINT.length] })
    }
    const phase = new THREE.InstancedBufferAttribute(new Float32Array(fish.map((f) => f.ph)), 1)
    for (const { geo, mat } of parts(lib.koi)) {
      const m2 = mat.clone()
      // 擺尾：身體沿 x（頭在 -x），越往尾巴擺越大，波從頭往尾傳
      m2.onBeforeCompile = (sh) => {
        sh.uniforms.uTime = uTime
        sh.vertexShader = 'uniform float uTime;\nattribute float aPhase;\nvarying float vWY;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
          float tx = clamp(transformed.x + 0.25, 0.0, 1.0);
          transformed.z += sin(uTime * 7.0 + aPhase - transformed.x * 7.0) * 0.07 * tx * tx;`).replace('#include <project_vertex>', `#include <project_vertex>
          vWY = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).y;`)
        // 魚畫在水面之後（水不寫深度）：自己照離水面多深混一點湖水色，看起來在水裡，又不會被整片不透明的深水蓋掉
        sh.fragmentShader = 'varying float vWY;\n' + sh.fragmentShader.replace('#include <dithering_fragment>', `#include <dithering_fragment>
          float wk = clamp((${W.toFixed(3)} - vWY) * 1.4 + 0.26, 0.26, 0.62);
          gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(0.06, 0.14, 0.12), wk);`)
      }
      m2.customProgramCacheKey = () => 'koiSwim'
      m2.transparent = true; m2.depthWrite = true   // 放進透明物件那一批，才排得到水面（renderOrder 2）後面畫
      const im = new THREE.InstancedMesh(geo, m2, fish.length)
      im.geometry = geo.clone(); im.geometry.setAttribute('aPhase', phase)
      fish.forEach((f, i) => im.setColorAt(i, new THREE.Color(...f.tint)))
      im.castShadow = false; im.receiveShadow = true; im.frustumCulled = false; im.renderOrder = 3
      g.add(im); fishMeshes.push(im)
    }
  }
  const fv = V(), fq = new THREE.Quaternion(), fs = V(), up = V(0, 1, 0)
  function tick(t, dt) {
    uTime.value = t
    if (!fishMeshes.length) return
    dt = Math.min(dt, 0.1)
    fish.forEach((f, i) => {
      // 漫遊：每隔幾秒換一個轉向；快到淺水或岸邊就轉回湖心
      if ((f.t -= dt) < 0) { f.turn = (Math.random() - 0.5) * 0.9; f.t = 2 + Math.random() * 5; f.v = 0.18 + Math.random() * 0.3 }
      const lx = f.x + Math.cos(f.h) * 1.2, lz = f.z + Math.sin(f.h) * 1.2
      if (depthAt(lx, lz) < 0.6 || rOf(lx, lz) > R * 0.92) { const ta = Math.atan2(ALP_POND.z - f.z, ALP_POND.x - f.x); f.turn = ((ta - f.h + Math.PI * 3) % TAU - Math.PI) * 1.2 }
      f.h += f.turn * dt
      f.x += Math.cos(f.h) * f.v * dt; f.z += Math.sin(f.h) * f.v * dt
      // 模型頭朝 -x：繞 y 轉到行進方向
      fq.setFromAxisAngle(up, Math.PI - f.h)
      m4.compose(fv.set(f.x, f.y + Math.sin(t * 0.6 + f.ph) * 0.03, f.z), fq, fs.setScalar(f.len))
      for (const im of fishMeshes) im.setMatrixAt(i, m4)
    })
    for (const im of fishMeshes) im.instanceMatrix.needsUpdate = true
  }
  return { group: g, tick, fish }
}
