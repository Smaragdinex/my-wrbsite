// 2026-11-10 東部擴建的植被（PARK_PLAN.md、ChatGPT「東部擴建 V2」）
//   草原（東北）：芒草（高、葉子往外拱、頂上銀白帶粉的花穗）一片片；白茅（中高、直立、白色的穗）；小雲雀那塊是短草和裸土
//   人工濕地（東南）：北邊一整片蘆葦（2 m 多、紫褐色的穗往一邊垂）；水邊一圈莎草；東岸鹽地的黃綠矮草
// 全部用 flora.js 的 bladeMesh（一片葉子一個 instance、彎曲和風在 shader 裡），切 14 公尺一塊給 lod.js 遠的變稀
// 數量照 ChatGPT 的上限：芒草 2000 叢、白茅 3000、低草 4000、蘆葦 1500、莎草 1000
import * as THREE from 'three'
import { bladeMesh } from './flora.js'
import { lodRegisterGrass } from './lod.js'
import { EAST, EAST_DW, EAST_DG, wetSD, grassSD, alpineHeight, alpineTrailDist, domeRho, addCollider, smoothstep as ss, ALP_SPURS } from './layout.js'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { fbm2, mulberry32 } from './noise.js'
import { scatter } from './plants.js'

const TAU = Math.PI * 2

// 鳥站的地方、鳥到鏡頭那條線：草不要長（不然鳥整隻被草蓋住、拍不到）
function nearBirdLane(avoid, x, z) {
  for (const b of avoid) {
    if (!b.ground) continue
    const dx = b.cx - b.x, dz = b.cz - b.z, L2 = dx * dx + dz * dz || 1
    const t = Math.max(0, Math.min(1, ((x - b.x) * dx + (z - b.z) * dz) / L2))
    if (Math.hypot(x - b.x - dx * t, z - b.z - dz * t) < 1.1 || Math.hypot(x - b.x, z - b.z) < 1.4) return true
  }
  return false
}

// 觀察屋窗前的扇形（18 m 內、左右 ±40°）：高的草、蘆葦不長（擋住看鳥）
function sightBlock(x, z) {
  for (const h of HIDES) {
    const fx = h.look[0] - h.x, fz = h.look[1] - h.z, L = Math.hypot(fx, fz), dx = x - h.x, dz = z - h.z, d = Math.hypot(dx, dz)
    if (d < 18 && d > 0.5 && (dx * fx + dz * fz) / (d * L) > 0.77) return true
  }
  return false
}
export function buildEast({ avoid = [], lib = null } = {}) {
  const g = new THREE.Group(); g.name = 'east'
  const rnd = mulberry32(1110)
  const layers = { cane: [[], []], plume: [[], []], tall: [[], []], blade: [[], []], low: [[], []] }   // plume：花穗（跟 cane 同順序、不打亂：遠的變稀時稈和穗一起消失）   // cane：有稈的（芒草、蘆葦）；blade：白茅、莎草；low：短草
  const c = new THREE.Color()
  const push = (L, x, y, z, a, col, h) => { layers[L][0].push(x, y, z, a); layers[L][1].push(col.r, col.g, col.b, h) }
  const ok = (x, z) => domeRho(x, z) < 0.952 && alpineTrailDist(x, z) > 1.5 && !nearBirdLane(avoid, x, z) && !EAST.hides.some(([hx, hz]) => Math.hypot(x - hx, z - hz) < 3.8)   // 觀察屋裡不長草

  /* ---------- 草原 ---------- */
  {
    const [x0, x1, z0, z1] = EAST.grassBox, L = EAST.lark
    let nMis = 0, nImp = 0, nLow = 0
    for (let k = 0; k < 60000 && (nMis < 2000 || nImp < 3000 || nLow < 4000); k++) {
      const x = x0 + rnd() * (x1 - x0), z = z0 + rnd() * (z1 - z0)
      const sd = grassSD(x, z)
      if (sd > 2 || rnd() < ss(-3, 2, sd) || !ok(x, z)) continue
      const y = alpineHeight(x, z), slope = Math.hypot(alpineHeight(x + 1, z) - y, alpineHeight(x, z + 1) - y)
      if (slope > 0.8) continue   // 西緣的岩坡不長
      const lark = 1 - ss(0.7, 1.25, Math.hypot((x - L.x) / L.rx, (z - L.z) / L.rz))
      // 高草藏身區（草鴞、環頸雉）偏西北；整片用雜訊分成一塊塊，不要均勻
      const [ox, oz] = EAST.owlNest, od = Math.hypot(x - ox, z - oz)
      const tallZone = Math.max(ss(312, 290, x) * ss(108, 96, z) * ss(70, 76, z), 1.6 * (1 - ss(6, 14, od)))   // 草鴞的巢四周一圈最密的芒草（藏起來）
      const patch = fbm2(x * 0.06 + 3, z * 0.06 - 8, 3)
      const pMis = Math.max(0, (0.15 + 0.75 * tallZone + 0.6 * (patch - 0.5)) * (1 - lark))
      const r = rnd()
      if (r < pMis && nMis < 2000) {
        // 芒草：一叢 2～4 根花稈（直、1.4～2 m），底下一大把細長葉子往外拱（cane 模式的「葉」從接近地面長出來、尾端下垂），頂上一束銀白帶粉的花穗
        nMis++
        const H = 1.3 + rnd() * 0.7, dry = rnd()
        c.setHSL(0.2 - dry * 0.06, 0.38 - dry * 0.12, 0.26 + dry * 0.08)
        const nl = 10 + Math.floor(rnd() * 8)
        for (let j = 0; j < nl; j++) { const k2 = 0.85 + rnd() * 0.3; push('tall', x + (rnd() - 0.5) * 0.3, y - 0.02, z + (rnd() - 0.5) * 0.3, rnd() * TAU, c.clone().multiplyScalar(k2), (0.7 + rnd() * 0.5) * H * 0.75) }
        const ns = 2 + Math.floor(rnd() * 3)
        for (let s = 0; s < ns; s++) {
          const sx = x + (rnd() - 0.5) * 0.25, sz = z + (rnd() - 0.5) * 0.25, st = H * (0.85 + rnd() * 0.25)
          push('cane', sx, y - 0.02, sz, rnd() * TAU, c.clone().setHSL(0.12, 0.25, 0.42), st)
          // 花穗：從稈頂往上、微微拱彎的幾枝（第一版用 cane 的「葉」：全部往外攤平，從遠處看是一片白色星星）；銀灰帶一點粉
          const pc = new THREE.Color().setHSL(0.06 + rnd() * 0.04, 0.2, 0.62 + rnd() * 0.08)
          for (let j = 0; j < 6; j++) push('plume', sx, y - 0.02 + st * 0.8, sz, rnd() * TAU, pc, 0.26 + rnd() * 0.14)   // 細細的好幾枝，近看像羽毛不是一片三角形
        }
      } else if (r < pMis + 0.45 * (1 - lark) && nImp < 3000) {
        // 白茅：直立的窄葉 0.4～0.8 m，有幾根抽出白色的毛穗
        nImp++
        const dry = rnd()
        c.setHSL(0.19 - dry * 0.05, 0.42 - dry * 0.15, 0.27 + dry * 0.1)
        const n = 8 + Math.floor(rnd() * 7), H = 0.4 + rnd() * 0.4
        for (let j = 0; j < n; j++) push('blade', x + (rnd() - 0.5) * 0.35, y - 0.02, z + (rnd() - 0.5) * 0.35, rnd() * TAU, c.clone().multiplyScalar(0.85 + rnd() * 0.3), H * (0.7 + rnd() * 0.5))
        if (rnd() < 0.3) push('blade', x + (rnd() - 0.5) * 0.2, y - 0.02, z + (rnd() - 0.5) * 0.2, rnd() * TAU, new THREE.Color().setHSL(0.1, 0.1, 0.7), H * 1.2)   // 偶爾一根白色毛穗
      } else if (nLow < 4000 && rnd() < 0.75 - 0.35 * lark * (fbm2(x * 0.3, z * 0.3, 2) > 0.5 ? 1 : 0)) {
        // 短草（小雲雀那塊：有一半的地方是裸土）
        nLow++
        c.setHSL(0.17 + rnd() * 0.05, 0.4, 0.24 + rnd() * 0.08)
        for (let j = 0; j < 7; j++) push('low', x + (rnd() - 0.5) * 0.4, y - 0.01, z + (rnd() - 0.5) * 0.4, rnd() * TAU, c, 0.1 + rnd() * 0.15)
      }
    }
  }

  /* ---------- 濕地 ---------- */
  {
    const [x0, x1, z0, z1] = EAST.wetBox, W = EAST.W
    let nReed = 0, nSedge = 0, nSalt = 0, nCat = 0
    for (let k = 0; k < 90000 && (nReed < 1500 || nSedge < 1800 || nSalt < 2500); k++) {   // V2：莎草 1000 → 1800（岸邊、泥灘一叢叢）
      const x = x0 + rnd() * (x1 - x0), z = z0 + rnd() * (z1 - z0)
      const sd = wetSD(x, z)
      if (sd > 14 || !ok(x, z)) continue
      const y = alpineHeight(x, z), dep = W - y
      // 蘆葦：北邊那一帶（z < -60）一整片，其他岸邊零星一叢叢；只長在水深 0.3 以內、岸上 1.5 m 以內
      const north = ss(-57, -63, z), patch = fbm2(x * 0.12 + 9, z * 0.12, 3)
      // V2（ChatGPT）：觀察屋前 18 m 視線不長高草；岸線留 35～45% 開放泥灘（其他地方的蘆葦只長在一塊塊群落裡）；島上不長蘆葦
      const view = sightBlock(x, z), onIsl = EAST.islands.some((I) => Math.hypot((x - I.x) / I.rx, (z - I.z) / I.rz) < 1.2)
      const reedOK = dep < 0.25 && sd > -6 && sd < 1.5 && !view && !onIsl
      const pReed = reedOK ? Math.min(1, 0.95 * north + 0.6 * ss(0.56, 0.68, patch)) : 0
      // 香蒲：局部淺水灣（水深 0.05～0.2），一叢叢；穗是深褐色的長條
      if (!view && !onIsl && dep > 0.04 && dep < 0.2 && ss(0.6, 0.7, fbm2(x * 0.18 - 3, z * 0.18 + 11, 2)) > rnd() * 1.6 && nCat < 500) {
        nCat++
        c.setHSL(0.19 + rnd() * 0.03, 0.42, 0.22 + rnd() * 0.05)
        const H = 1.2 + rnd() * 0.9, base = W - dep - 0.03
        for (let j = 0; j < 7; j++) push('tall', x + (rnd() - 0.5) * 0.25, base, z + (rnd() - 0.5) * 0.25, rnd() * TAU, c.clone().multiplyScalar(0.9 + rnd() * 0.2), H * (0.75 + rnd() * 0.35))
        const pc = new THREE.Color().setHSL(0.06, 0.45, 0.12 + rnd() * 0.04)
        for (let j = 0; j < 2; j++) { const st = H * (0.9 + rnd() * 0.25); push('cane', x + (rnd() - 0.5) * 0.2, base, z + (rnd() - 0.5) * 0.2, rnd() * TAU, c, st); push('plume', x + (rnd() - 0.5) * 0.05, base + st * 0.82, z, rnd() * TAU, pc, 0.22) }
        continue
      }
      if (rnd() < pReed && nReed < 1500) {
        nReed++
        const ns = 3 + Math.floor(rnd() * 4), H = 1.8 + rnd() * 0.8
        c.setHSL(0.2 + rnd() * 0.04, 0.4, 0.26 + rnd() * 0.06)
        for (let s = 0; s < ns; s++) {
          const sx = x + (rnd() - 0.5) * 0.45, sz = z + (rnd() - 0.5) * 0.45, st = H * (0.8 + rnd() * 0.3), base = Math.min(y, W) - 0.05
          push('cane', sx, base, sz, rnd() * TAU, c.clone().multiplyScalar(0.85), st)
          // 葉子：稈的中段往外斜伸；頂上一束紫褐色的穗（cane 的「葉」會往外垂，正好像蘆葦穗被風吹向一邊）
          for (let j = 0; j < 6; j++) { const t = 0.25 + j / 6 * 0.55 + rnd() * 0.05; push('cane', sx, base + st * t, sz, rnd() * TAU, c.clone().multiplyScalar(0.95 + rnd() * 0.15), -(0.35 + rnd() * 0.2)) }
          const pc = new THREE.Color().setHSL(0.03 + rnd() * 0.04, 0.3, 0.33 + rnd() * 0.08)
          for (let j = 0; j < 3; j++) push('plume', sx, base + st * 0.82, sz, rnd() * TAU, pc, 0.32 + rnd() * 0.1)
        }
        continue
      }
      // 莎草：水邊（水深 0.15 到岸上 2.5 m）
      if (dep < 0.15 && sd > -1.5 && sd < 2.5 && rnd() < (view ? 0.2 : 0.75) * (0.3 + ss(0.4, 0.6, patch)) && nSedge < 1800) {
        nSedge++
        c.setHSL(0.24 + rnd() * 0.04, 0.42, 0.18 + rnd() * 0.06)
        const H = 0.4 + rnd() * 0.35
        for (let j = 0; j < 10; j++) push('blade', x + (rnd() - 0.5) * 0.3, Math.min(y, W) - 0.02, z + (rnd() - 0.5) * 0.3, rnd() * TAU, c, H * (0.7 + rnd() * 0.5))
        continue
      }
      // 岸上的鹽地矮草（東岸多一點）
      if (sd > 1.5 && rnd() < 0.5 + 0.4 * ss(340, 352, x) && nSalt < 2500) {
        nSalt++
        c.setHSL(0.15 + rnd() * 0.05, 0.38, 0.27 + rnd() * 0.08)
        for (let j = 0; j < 6; j++) push('low', x + (rnd() - 0.5) * 0.4, y - 0.01, z + (rnd() - 0.5) * 0.4, rnd() * TAU, c, 0.12 + rnd() * 0.2)
      }
    }
  }

  // 切 14 公尺一塊，每塊打亂順序（lod.js 遠的只畫前面一部分）
  const opts = { cane: { width: [0.022, 0.014], cane: true }, plume: { width: [0.009, 0.007] }, tall: { width: [0.012, 0.01] }, blade: { width: [0.008, 0.007] }, low: { width: [0.01, 0.01] } }
  let n = 0
  for (const [name, [A, B]] of Object.entries(layers)) {
    const CELL = 14, cells = new Map()
    for (let i = 0; i < A.length / 4; i++) { const key = Math.floor(A[i * 4] / CELL) + ',' + Math.floor(A[i * 4 + 2] / CELL); (cells.get(key) || cells.set(key, []).get(key)).push(i) }
    for (const [key, idx] of cells) {
      // cane 層：一根稈和它的葉子要一起（不能打散，不然遠的時候葉子飄在空中）→ 照原本順序分組，只打亂組
      for (let i = idx.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); if (name !== 'cane' && name !== 'plume') [idx[i], idx[j]] = [idx[j], idx[i]] }
      const a = [], b = []
      for (const i of idx) { a.push(A[i * 4], A[i * 4 + 1], A[i * 4 + 2], A[i * 4 + 3]); b.push(B[i * 4], B[i * 4 + 1], B[i * 4 + 2], B[i * 4 + 3]) }
      const [cx, cz] = key.split(',').map((v) => (+v + 0.5) * CELL)
      const m = bladeMesh(a, b, opts[name]); g.add(m)
      // 每一塊自己的外框（bladeMesh 預設是原點、半徑 100 → 只好整個關掉剔除，每一塊不管在哪都畫一次）
      m.geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(cx, alpineHeight(cx, cz) + 1, cz), CELL * 0.75 + 4)
      // 照距離變稀（cane 層沒打亂：畫前面幾叢＝整叢消失，不會只剩穗飄著）
      lodRegisterGrass(m, new THREE.Vector3(cx, alpineHeight(cx, cz) + 0.5, cz), CELL * 0.72 + 1)
      n += idx.length
    }
  }
  g.userData.blades = n
  // V2：水中枯木與樹樁（ChatGPT：倒木 2～4 根 1.5～4 m、自然樹樁 2～5 個 0.3～1.2 m；集中在岸邊、水道彎；開闊泥灘中間不放）
  if (lib?.deadlog) {
    const L = [[346.5, -44.5, 0.5, 3.4, 0.3], [321.5, -61, 2.1, 2.6, 0.22], [349, -59.5, 1.2, 2.0, 0.18], [334, -64.5, -0.4, 3.8, 0.34]].map(([x, z, ...r]) => [x + EAST_DW[0], z + EAST_DW[1], ...r])
    scatter(g, lib.deadlog, L.map(([x, z, yaw, len, D]) => ({ p: new THREE.Vector3(x, Math.min(EAST.W, alpineHeight(x, z)) - D * 0.35, z), q: new THREE.Quaternion().setFromEuler(new THREE.Euler(0.06, yaw, 0.04, 'YXZ')), s: new THREE.Vector3(len / 3.05, D / 0.28, D / 0.28) })))
  }
  if (lib?.stump) {
    const S = [[336.5, -62.8, 0.9, 0.9], [344.5, -47.5, 0.6, 0.5], [325.5, -43.5, 0.7, 0.7], [348, -52, 0.5, 1.1]].map(([x, z, ...r]) => [x + EAST_DW[0], z + EAST_DW[1], ...r])
    scatter(g, lib.stump, S.map(([x, z, D, H]) => ({ p: new THREE.Vector3(x, alpineHeight(x, z) - 0.15, z), q: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), x), s: new THREE.Vector3(D / 1.5 * 1.35, Math.min(H / 0.57, D / 1.5 * 1.35 * 1.25), D / 1.5 * 1.35) })))
  }
  g.add(buildHides())
  g.add(buildBoardwalk())
  return g
}

// 觀察屋（ChatGPT V2 的 O7 草原、O8 濕地）
// 2026-11-10 重做（使用者：涼亭很低階建模；ChatGPT「濕地 V2」A 節）：台灣濕地公園那種低調的木造賞鳥屋——
// 6.0×3.2 m、前牆 2.35／後牆 2.75 的單斜頂（約 7°）、立縫金屬屋頂＋外露椽木、屋簷前挑 0.75 側挑 0.45；
// 牆是一片片橫向木板（寬 0.12～0.19、厚 0.025、縫 0.006～0.012，每片色差 ±8～15%，65% 灰褐／25% 深褐／10% 深色結構）；
// 正面三個觀察窗（各寬 1.4、下緣 1.05、高 0.5、中間 0.15 木柱）、窗台深 0.24、窗上掀開 55° 的木遮板；後面步道側一個 0.95 m 的門；屋裡長椅 0.42 m
export const HIDES = [
  { name: 'O7', x: EAST.hides[0][0], z: EAST.hides[0][1], look: [318 + EAST_DG[0], 101 + EAST_DG[1]], w: 6, d: 3.2 },
  { name: 'O8', x: EAST.hides[1][0], z: EAST.hides[1][1], look: [336 + EAST_DW[0], -51 + EAST_DW[1]], w: 6, d: 3.2 },
]
function woodTex() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 64
  const x = c.getContext('2d'), r = mulberry32(42)
  x.fillStyle = '#d8d8d8'; x.fillRect(0, 0, 256, 64)
  for (let i = 0; i < 90; i++) {   // 木紋：沿長邊的細線、深淺不一，偶爾一個節
    const y = r() * 64, a = 0.05 + r() * 0.14
    x.strokeStyle = `rgba(40,30,20,${a})`; x.lineWidth = 0.6 + r() * 1.4; x.beginPath(); x.moveTo(0, y)
    for (let k = 0; k <= 256; k += 16) x.lineTo(k, y + Math.sin(k * 0.03 + i) * 1.5 + (r() - 0.5) * 0.8)
    x.stroke()
  }
  for (let i = 0; i < 3; i++) { const cx = r() * 256, cy = r() * 64; x.fillStyle = 'rgba(50,35,20,0.35)'; x.beginPath(); x.ellipse(cx, cy, 3 + r() * 3, 2 + r() * 2, 0, 0, Math.PI * 2); x.fill() }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4
  return t
}
function buildHides() {
  const G = new THREE.Group(); G.name = 'hides'
  const tex = woodTex(), r = mulberry32(606)
  const woodM = new THREE.MeshStandardMaterial({ map: tex, vertexColors: true, roughness: 0.86 })
  const roofM = new THREE.MeshStandardMaterial({ color: new THREE.Color().setRGB(0.09, 0.11, 0.10), roughness: 0.62, metalness: 0.45 })
  // 線性色（貼圖平均約 0.75 → 頂點色 ×1.3）
  const GREY = [0.28, 0.25, 0.20], BROWN = [0.22, 0.15, 0.09], STRUCT = [0.13, 0.10, 0.075]
  for (const h of HIDES) {
    const a = Math.atan2(h.look[0] - h.x, h.look[1] - h.z)
    const y = alpineHeight(h.x, h.z) + 0.03
    const W = h.w, D = h.d, HF = 2.35, HB = 2.75, T = 0.025
    const wood = [], roof = []
    const col = (base, v = 0.12) => { const k = 1.3 * (1 + (r() - 0.5) * 2 * v); return [base[0] * k, base[1] * k, base[2] * k] }
    const plankCol = () => { const q = r(); return col(q < 0.7 ? GREY : BROWN) }
    const box = (sx, sy, sz, x, yy, z, c, rx = 0, ry = 0, rz = 0) => {
      const g2 = new THREE.BoxGeometry(sx, sy, sz)
      // 木紋沿著最長的那一邊：uv 依尺寸縮放（不然短板子的紋被拉長）
      const uv = g2.attributes.uv, L = Math.max(sx, sy, sz)
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * L * 0.7 + r() * 0.0, uv.getY(i) * 0.25 + (sx + sy + sz) * 3.1 % 1)
      if (rx || ry || rz) g2.rotateX(rx).rotateY(ry).rotateZ(rz)
      g2.translate(x, yy, z)
      const n = g2.attributes.position.count, cc = new Float32Array(n * 3)
      for (let i = 0; i < n; i++) cc.set(c, i * 3)
      g2.setAttribute('color', new THREE.BufferAttribute(cc, 3))
      wood.push(g2.toNonIndexed ? g2.toNonIndexed() : g2)
    }
    const hAt = (z) => HB + (HF - HB) * (z + D / 2) / D   // 牆高（後高前低）
    // 地板：沿 x 的木板
    for (let z = -D / 2 + 0.08; z < D / 2; z += 0.155) box(W - 0.02, 0.04, 0.145, 0, 0.02, z, plankCol())
    // 立柱（深色結構）
    const posts = [[-W / 2, -D / 2], [W / 2, -D / 2], [-W / 2, D / 2], [W / 2, D / 2], [-0.55, -D / 2], [0.55, -D / 2], [-W / 2, 0], [W / 2, 0]]
    for (const [px, pz] of posts) { const hh = hAt(pz); box(0.14, hh + 0.35, 0.14, px, (hh - 0.35) / 2, pz, col(STRUCT, 0.06)) }
    // 正面：三個窗
    const WIN = [-1.55, 0, 1.55], WW = 1.4, SILL = 1.15, WH = 0.65   // 玩家眼睛 1.65：窗 1.2～1.75 站著平視（ChatGPT 的 1.05 是給比較矮的視線）
    const inWin = (x0, x1, yy) => yy > SILL - 0.01 && yy < SILL + WH && WIN.some((c) => x1 > c - WW / 2 + 0.01 && x0 < c + WW / 2 - 0.01)
    const PITCH = 0.168
    const plankRow = (yy, x0, x1, z, cut) => {
      // 一排橫板；遇到窗就斷開
      const seg = []; let s0 = x0
      for (const c of [...WIN].sort((p, q) => p - q)) { if (cut && yy > SILL - 0.01 && yy < SILL + WH) { seg.push([s0, c - WW / 2]); s0 = c + WW / 2 } }
      seg.push([s0, x1])
      for (const [u0, u1] of seg) if (u1 - u0 > 0.05) box(u1 - u0, 0.155 + (r() - 0.5) * 0.03, T, (u0 + u1) / 2, yy, z + (r() - 0.5) * 0.004, plankCol())
    }
    for (let yy = 0.12; yy < HF - 0.04; yy += PITCH) plankRow(yy, -W / 2, W / 2, D / 2, true)
    // 窗：窗台（裡外）、窗頂橫樑、窗間木柱、往上掀 55° 的遮板＋兩根撐桿
    box(W - 0.3, 0.05, 0.24, 0, SILL - 0.025, D / 2 - 0.12, col(BROWN, 0.05))
    box(W - 0.3, 0.04, 0.1, 0, SILL - 0.03, D / 2 + 0.06, col(BROWN, 0.05))
    box(W, 0.18, 0.1, 0, SILL + WH + 0.09, D / 2 - 0.03, col(STRUCT, 0.05))
    for (const c of WIN) {
      for (const sx of [-1, 1]) box(0.15, WH, 0.12, c + sx * (WW / 2 + 0.075), SILL + WH / 2, D / 2 - 0.02, col(STRUCT, 0.05))
      const fl = new THREE.BoxGeometry(WW - 0.04, WH, 0.03).translate(0, -WH / 2, 0).rotateX(-1.25).translate(c, SILL + WH + 0.02, D / 2 + 0.05)
      const n = fl.attributes.position.count, cc = new Float32Array(n * 3), fc = col(GREY, 0.1); for (let i = 0; i < n; i++) cc.set(fc, i * 3); fl.setAttribute('color', new THREE.BufferAttribute(cc, 3)); wood.push(fl.toNonIndexed())
      for (const sx of [-0.55, 0.55]) box(0.025, 0.42, 0.025, c + sx, SILL + WH * 0.72, D / 2 + 0.3, col(STRUCT, 0.05), 1.0)
    }
    // 兩側：橫板，上緣照屋頂斜度截
    for (const u of [-1, 1]) for (let yy = 0.12; yy < HB - 0.05; yy += PITCH) {
      let z0 = -D / 2, z1 = D / 2
      if (yy > HF - 0.05) z1 = -D / 2 + D * (HB - yy) / (HB - HF)
      if (z1 - z0 > 0.1) box(T, 0.155 + (r() - 0.5) * 0.03, z1 - z0, u * W / 2, yy, (z0 + z1) / 2, plankCol())
    }
    // 後牆：門（寬 0.95、高 2.05）兩側
    for (let yy = 0.12; yy < HB - 0.04; yy += PITCH) {
      if (yy < 2.05) { box(W / 2 - 0.55, 0.155, T, -(W / 2 + 0.55) / 2, yy, -D / 2, plankCol()); box(W / 2 - 0.55, 0.155, T, (W / 2 + 0.55) / 2, yy, -D / 2, plankCol()) }
      else box(W, 0.155, T, 0, yy, -D / 2, plankCol())
    }
    box(1.2, 0.12, 0.1, 0, 2.11, -D / 2 - 0.03, col(STRUCT, 0.05))   // 門楣
    // 角板（深色直條）
    for (const [px, pz] of [[-W / 2, D / 2], [W / 2, D / 2], [-W / 2, -D / 2], [W / 2, -D / 2]]) box(0.1, hAt(pz), 0.1, px + Math.sign(px) * 0.03, hAt(pz) / 2, pz + Math.sign(pz) * 0.03, col(STRUCT, 0.05))
    // 屋裡：長椅＋相機架
    box(W - 0.6, 0.05, 0.36, 0, 0.42, D / 2 - 0.95, col(BROWN, 0.06))
    for (const sx of [-2.2, 0, 2.2]) box(0.08, 0.4, 0.3, sx, 0.2, D / 2 - 0.95, col(STRUCT, 0.05))
    // 屋頂：椽木（外露，每 0.5 m）＋前緣封簷板＋金屬板＋立縫
    const slope = Math.atan2(HB - HF, D), RL = (D + 0.75 + 0.3) / Math.cos(slope), zc = (0.75 - 0.3) / 2
    const roofY = (z) => hAt(z) + 0.08
    for (let x = -W / 2 - 0.4; x <= W / 2 + 0.41; x += 0.5) box(0.06, 0.12, RL, x, roofY(zc) - 0.07, zc, col(STRUCT, 0.06), slope)
    box(W + 0.9, 0.2, 0.04, 0, roofY(D / 2 + 0.75) - 0.06, D / 2 + 0.77, col(BROWN, 0.05))
    box(W + 0.9, 0.16, 0.04, 0, roofY(-D / 2 - 0.3) - 0.04, -D / 2 - 0.32, col(BROWN, 0.05))
    roof.push(new THREE.BoxGeometry(W + 0.9, 0.03, RL + 0.04).rotateX(slope).translate(0, roofY(zc) + 0.005, zc))
    for (let x = -W / 2 - 0.42; x <= W / 2 + 0.43; x += 0.45) roof.push(new THREE.BoxGeometry(0.025, 0.04, RL + 0.04).rotateX(slope).translate(x, roofY(zc) + 0.035, zc))
    const m = new THREE.Mesh(mergeGeometries(wood), woodM), m2 = new THREE.Mesh(mergeGeometries(roof.map((q) => q.toNonIndexed())), roofM)
    for (const o of [m, m2]) { o.position.set(h.x, y, h.z); o.rotation.y = a; o.castShadow = true; o.receiveShadow = true; G.add(o) }
    h.y = y; h.a = a
    // 碰撞：正面、兩側、後牆（門口留空）
    const c = Math.cos(a), sn = Math.sin(a), P = (lx, lz) => [h.x + lx * c + lz * sn, h.z - lx * sn + lz * c]
    for (let t = -W / 2; t <= W / 2 + 1e-3; t += 0.5) { const [px, pz] = P(t, D / 2); addCollider(px, pz, 0.22, y + HF) }
    for (const u of [-1, 1]) for (let t = -D / 2; t <= D / 2 + 1e-3; t += 0.5) { const [px, pz] = P(u * W / 2, t); addCollider(px, pz, 0.22, y + HB) }
    for (let t = -W / 2; t <= W / 2 + 1e-3; t += 0.5) { if (Math.abs(t) < 0.8) continue; const [px, pz] = P(t, -D / 2); addCollider(px, pz, 0.22, y + HB) }
  }
  return G
}

// 低矮木棧道（ChatGPT：寬 1.6～1.8、板寬 0.12～0.16、厚 0.04、縫 0.008；支柱 1.5～2 m；靠水那段 1.1 m 欄杆）：沿 wetBoard 支線鋪，盡頭 3×3 m 平台
function buildBoardwalk() {
  const G = new THREE.Group(), sp = ALP_SPURS.find((q) => q.name === 'wetBoard')
  if (!sp) return G
  const r = mulberry32(919), parts = [], W = 1.7, P = sp.pts
  const add = (geo, c) => { const n = geo.attributes.position.count, cc = new Float32Array(n * 3); for (let i = 0; i < n; i++) cc.set(c, i * 3); geo.setAttribute('color', new THREE.BufferAttribute(cc, 3)); parts.push(geo.toNonIndexed()) }
  const wc = () => { const k = 1.3 * (0.88 + r() * 0.24), b = r() < 0.7 ? [0.28, 0.25, 0.20] : [0.22, 0.15, 0.09]; return [b[0] * k, b[1] * k, b[2] * k] }
  const S = [0]; for (let i = 1; i < P.length; i++) S.push(S[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]))
  const at = (s) => { let i = 1; while (i < P.length - 1 && S[i] < s) i++; const t = (s - S[i - 1]) / (S[i] - S[i - 1]), dx = P[i][0] - P[i - 1][0], dz = P[i][1] - P[i - 1][1], l = Math.hypot(dx, dz); return { x: P[i - 1][0] + dx * t, z: P[i - 1][1] + dz * t, dx: dx / l, dz: dz / l, seg: i } }
  const Ltot = S.at(-1)
  for (let s = 1.2; s < Ltot; s += 0.155) {
    const a = at(s), y = alpineHeight(a.x, a.z) + 0.1, yaw = Math.atan2(a.dx, a.dz)
    add(new THREE.BoxGeometry(W, 0.04, 0.145).rotateY(yaw).translate(a.x, y, a.z), wc())
  }
  // 平台
  const E = at(Ltot), ey = alpineHeight(E.x, E.z) + 0.1
  for (let u = -1.4; u <= 1.4; u += 0.155) add(new THREE.BoxGeometry(3.0, 0.04, 0.145).rotateY(Math.atan2(E.dx, E.dz)).translate(E.x + E.dx * (1.4 + u), ey, E.z + E.dz * (1.4 + u)), wc())
  // 欄杆：棧道後半段兩側、平台三邊；柱子＋兩根橫木
  const rails = []
  for (let s = Ltot * 0.45; s <= Ltot; s += 1.6) for (const sd of [-1, 1]) { const a = at(s); rails.push([a.x - a.dz * sd * (W / 2 + 0.05), a.z + a.dx * sd * (W / 2 + 0.05), sd]) }
  const nx = -E.dz, nz = E.dx
  for (let u = 0; u <= 2.8; u += 1.4) for (const sd of [-1, 1]) rails.push([E.x + E.dx * u + nx * sd * 1.55, E.z + E.dz * u + nz * sd * 1.55, sd])
  for (let v = -1.4; v <= 1.4; v += 1.4) rails.push([E.x + E.dx * 2.9 + nx * v, E.z + E.dz * 2.9 + nz * v, 2])
  const post = (x, z) => { const y = alpineHeight(x, z); add(new THREE.BoxGeometry(0.1, 1.25, 0.1).translate(x, y + 0.5, z), [0.17, 0.13, 0.1]); addCollider(x, z, 0.12, y + 1.2) }
  for (const [x, z] of rails) post(x, z)
  for (const sd of [-1, 1, 2]) {
    const L = rails.filter((q) => q[2] === sd)
    for (let i = 1; i < L.length; i++) {
      const [ax, az] = L[i - 1], [bx, bz] = L[i], d = Math.hypot(bx - ax, bz - az); if (d > 2) continue
      for (const hh of [0.55, 1.05]) { const ya = alpineHeight(ax, az) + hh, yb = alpineHeight(bx, bz) + hh, len = Math.hypot(d, yb - ya); const geo = new THREE.BoxGeometry(len, 0.07, 0.06); geo.applyMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), new THREE.Vector3(bx - ax, yb - ya, bz - az).normalize()))); geo.translate((ax + bx) / 2, (ya + yb) / 2, (az + bz) / 2); add(geo, wc()) }
    }
  }
  // 兩條縱樑（從側面看得到棧道有厚度）
  for (let s = 1.2; s < Ltot; s += 1.0) for (const sd of [-1, 1]) { const a = at(s), b = at(Math.min(Ltot, s + 1.0)); const ax = a.x - a.dz * sd * 0.7, az = a.z + a.dx * sd * 0.7, bx = b.x - b.dz * sd * 0.7, bz = b.z + b.dx * sd * 0.7; const ya = alpineHeight(ax, az) + 0.02, yb = alpineHeight(bx, bz) + 0.02, len = Math.hypot(bx - ax, yb - ya, bz - az); if (len < 0.2) continue; const geo = new THREE.BoxGeometry(len, 0.12, 0.08); geo.applyMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), new THREE.Vector3(bx - ax, yb - ya, bz - az).normalize()))); geo.translate((ax + bx) / 2, (ya + yb) / 2, (az + bz) / 2); add(geo, [0.15, 0.12, 0.09]) }
  const m = new THREE.Mesh(mergeGeometries(parts), new THREE.MeshStandardMaterial({ map: woodTex(), vertexColors: true, roughness: 0.85 }))
  m.castShadow = true; m.receiveShadow = true; G.add(m)
  return G
}
