// 2026-11-10 東部擴建的植被（PARK_PLAN.md、ChatGPT「東部擴建 V2」）
//   草原（東北）：芒草（高、葉子往外拱、頂上銀白帶粉的花穗）一片片；白茅（中高、直立、白色的穗）；小雲雀那塊是短草和裸土
//   人工濕地（東南）：北邊一整片蘆葦（2 m 多、紫褐色的穗往一邊垂）；水邊一圈莎草；東岸鹽地的黃綠矮草
// 全部用 flora.js 的 bladeMesh（一片葉子一個 instance、彎曲和風在 shader 裡），切 14 公尺一塊給 lod.js 遠的變稀
// 數量照 ChatGPT 的上限：芒草 2000 叢、白茅 3000、低草 4000、蘆葦 1500、莎草 1000
import * as THREE from 'three'
import { bladeMesh } from './flora.js'
import { lodRegisterGrass } from './lod.js'
import { EAST, wetSD, grassSD, alpineHeight, alpineTrailDist, domeRho, addCollider, smoothstep as ss } from './layout.js'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { fbm2, mulberry32 } from './noise.js'

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

export function buildEast({ avoid = [] } = {}) {
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
    let nReed = 0, nSedge = 0, nSalt = 0
    for (let k = 0; k < 50000 && (nReed < 1500 || nSedge < 1000 || nSalt < 2500); k++) {
      const x = x0 + rnd() * (x1 - x0), z = z0 + rnd() * (z1 - z0)
      const sd = wetSD(x, z)
      if (sd > 14 || !ok(x, z)) continue
      const y = alpineHeight(x, z), dep = W - y
      // 蘆葦：北邊那一帶（z < -60）一整片，其他岸邊零星一叢叢；只長在水深 0.3 以內、岸上 1.5 m 以內
      const north = ss(-57, -63, z), patch = fbm2(x * 0.12 + 9, z * 0.12, 3)
      const reedOK = dep < 0.3 && sd > -9 && sd < 1.5
      const pReed = reedOK ? Math.min(1, 0.95 * north + 0.35 * ss(0.5, 0.7, patch)) : 0
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
      if (dep < 0.15 && sd > -1.5 && sd < 2.5 && rnd() < 0.55 && nSedge < 1000) {
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
  g.add(buildHides())
  return g
}

// 觀察屋（ChatGPT V2 的 O7 草原、O8 濕地）：木頭小屋，三面牆＋單斜屋頂，背面（步道那側）開著讓人走進去；
// 正面一條橫的觀察窗（窗台 1.25 m、窗高 0.5 m，站著平視、剛好架相機），窗下一條長木板凳。牆有碰撞（circle collider 一排）
export const HIDES = [
  { name: 'O7', x: EAST.hides[0][0], z: EAST.hides[0][1], look: [318, 101], w: 4, d: 3 },
  { name: 'O8', x: EAST.hides[1][0], z: EAST.hides[1][1], look: [336, -51], w: 5, d: 3 },
]
function buildHides() {
  const G = new THREE.Group(); G.name = 'hides'
  const wood = new THREE.MeshStandardMaterial({ color: 0x7a5a3c, roughness: 0.9 }), dark = new THREE.MeshStandardMaterial({ color: 0x4a3a2a, roughness: 0.95 })
  for (const h of HIDES) {
    const a = Math.atan2(h.look[0] - h.x, h.look[1] - h.z)   // 正面朝向
    let y = -1e9
    y = alpineHeight(h.x, h.z) + 0.04   // layout.js eastShape 已經把底下攤平
    const W = h.w, D = h.d, H0 = 2.3, H1 = 2.0, T = 0.08, parts = [], darkParts = []
    const box = (sx, sy, sz, x, yy, z, arr = parts) => arr.push(new THREE.BoxGeometry(sx, sy, sz).translate(x, yy, z))
    box(W, 0.1, D, 0, -0.05, 0, darkParts)                           // 地板
    for (const [u, v] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) box(0.14, 2.6, 0.14, u * (W / 2 - 0.07), -1.0 + 1.3 - 0.3, v * (D / 2 - 0.07), darkParts)   // 柱子（往下埋到坡裡）
    // 正面（+z 局部）：窗下的牆、窗上的牆，中間一條 0.35 m 的窗
    box(W, 1.25, T, 0, 0.625, D / 2); box(W, H0 - 1.75, T, 0, 1.75 + (H0 - 1.75) / 2, D / 2)   // 窗 1.25～1.75 m（站著眼睛 1.6 剛好平視）
    // 兩側：從前面 2.3 m 斜到後面 2.0 m（用兩段近似）
    for (const u of [-1, 1]) { box(T, H1, D, u * W / 2, H1 / 2, 0); box(T, H0 - H1, D / 2, u * W / 2, H1 + (H0 - H1) / 2, D / 4) }
    box(W - 0.2, 0.05, 0.3, 0, 1.23, D / 2 - 0.2, darkParts)         // 窗台（放鏡頭）
    box(W - 0.4, 0.06, 0.35, 0, 0.45, D / 2 - 0.65, darkParts)       // 長板凳
    const roof = new THREE.BoxGeometry(W + 0.5, 0.08, D + 0.6).rotateX(-Math.atan2(H0 - H1, D)).translate(0, (H0 + H1) / 2 + 0.06, 0.05)
    darkParts.push(roof)
    const m = new THREE.Mesh(mergeGeometries(parts), wood), m2 = new THREE.Mesh(mergeGeometries(darkParts), dark)
    for (const o of [m, m2]) { o.position.set(h.x, y, h.z); o.rotation.y = a; o.castShadow = true; o.receiveShadow = true; G.add(o) }
    h.y = y; h.a = a
    // 牆的碰撞：正面、兩側每 0.5 m 一個圓
    const c = Math.cos(a), sn = Math.sin(a), P = (lx, lz) => [h.x + lx * c + lz * sn, h.z - lx * sn + lz * c]
    for (let t = -W / 2; t <= W / 2 + 1e-3; t += 0.5) { const [px, pz] = P(t, D / 2); addCollider(px, pz, 0.22, y + H0) }
    for (const u of [-1, 1]) for (let t = -D / 2; t <= D / 2 + 1e-3; t += 0.5) { const [px, pz] = P(u * W / 2, t); addCollider(px, pz, 0.22, y + H0) }
  }
  return G
}
