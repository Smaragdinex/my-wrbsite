// 2026-11-10 東部擴建的植被（PARK_PLAN.md、ChatGPT「東部擴建 V2」）
//   草原（東北）：芒草（高、葉子往外拱、頂上銀白帶粉的花穗）一片片；白茅（中高、直立、白色的穗）；小雲雀那塊是短草和裸土
//   人工濕地（東南）：北邊一整片蘆葦（2 m 多、紫褐色的穗往一邊垂）；水邊一圈莎草；東岸鹽地的黃綠矮草
// 全部用 flora.js 的 bladeMesh（一片葉子一個 instance、彎曲和風在 shader 裡），切 14 公尺一塊給 lod.js 遠的變稀
// 數量照 ChatGPT 的上限：芒草 2000 叢、白茅 3000、低草 4000、蘆葦 1500、莎草 1000
import * as THREE from 'three'
import { bladeMesh } from './flora.js'
import { lodRegisterGrass } from './lod.js'
import { EAST, EAST_DW, EAST_DG, wetSD, grassSD, inLagoon, walkAt, alpineHeight, alpineTrailDist, domeRho, addCollider, smoothstep as ss, ALP_SPURS, wetBoardY, wetBoardEnd } from './layout.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { fbm2, mulberry32 } from './noise.js'
import { scatter } from './plants.js'
import { plankTextures } from './textures.js'

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
// 2026-11-11 兩湖中間的木棧道上、旁邊 0.6 m 不長草
const nearWalk = (x, z) => [[0, 0], [0.7, 0], [-0.7, 0], [0, 0.7], [0, -0.7], [1.5, 0], [-1.5, 0], [0, 1.5], [0, -1.5]].some(([a, b]) => walkAt(x + a, z + b) != null)
export function buildEast({ avoid = [], lib = null, hideKit = null, walkKit = null } = {}) {
  const g = new THREE.Group(); g.name = 'east'
  const rnd = mulberry32(1110)
  const layers = { cane: [[], []], plume: [[], []], tall: [[], []], blade: [[], []], low: [[], []] }   // plume：花穗（跟 cane 同順序、不打亂：遠的變稀時稈和穗一起消失）   // cane：有稈的（芒草、蘆葦）；blade：白茅、莎草；low：短草
  const c = new THREE.Color()
  const push = (L, x, y, z, a, col, h) => { layers[L][0].push(x, y, z, a); layers[L][1].push(col.r, col.g, col.b, h) }
  const ok = (x, z) => domeRho(x, z) < 0.952 && alpineTrailDist(x, z) > 1.5 && !nearBirdLane(avoid, x, z) && !EAST.hides.some(([hx, hz]) => Math.hypot(x - hx, z - hz) < 3.8) && !nearWalk(x, z)   // 觀察屋裡不長草

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
    // 2026-11-11 兩座濕地分開種（ChatGPT「Wetland expansion」）：
    // 翡翠沼澤（淡水）：水邊、草島一圈圈蘆葦和香蒲；兩片濕草甸是低矮的翠綠濕草（鶴跳舞的地方，不長高草）；荷葉盆地、深水池、紙莎草角落（wetland.js 的 Blender 模型）讓開
    // 夕陽潟湖（鹹水）：岸線 35～45% 開放；水邊一圈紅橘色的海蓬子（鹽地植物，潟湖的招牌顏色）、金黃的鹽地矮草；蘆葦只有北岸、東岸零星幾叢；沙洲光禿
    const M = EAST.marsh, inE = (o, x, z, k = 1) => Math.hypot((x - o.x) / o.rx, (z - o.z) / o.rz) < k
    const islAt = (x, z) => EAST.islands.find((I) => { const cr = Math.cos(I.rot), sr = Math.sin(I.rot), dx = x - I.x, dz = z - I.z; return Math.hypot((dx * cr + dz * sr) / I.rx, (-dx * sr + dz * cr) / I.rz) < 1.15 })
    let nReed = 0, nSedge = 0, nSalt = 0, nCat = 0, nMead = 0, nSam = 0
    for (let k = 0; k < 420000 && (nReed < 3800 || nSedge < 3600 || nSalt < 5200 || nMead < 3400 || nSam < 3600); k++) {
      const x = x0 + rnd() * (x1 - x0), z = z0 + rnd() * (z1 - z0)
      const sd = wetSD(x, z)
      if (sd > 14 || !ok(x, z)) continue
      const y = alpineHeight(x, z), dep = W - y, lag = inLagoon(x, z), I = islAt(x, z)
      const patch = fbm2(x * 0.12 + 9, z * 0.12, 3), view = sightBlock(x, z)
      if (!lag) {
        if (inE(M.lily, x, z, 1.05) || inE(M.papyrus, x, z, 1.1)) continue
        const md = M.meadows.find((o) => inE(o, x, z, 1.08))
        if (md) {   // 濕草甸：翠綠的矮濕草（0.15～0.4 m），一窪窪積水的地方稀一點
          if (nMead < 3400 && rnd() < (dep > 0.02 ? 0.25 : 0.9)) { nMead++; c.setHSL(0.24 + rnd() * 0.05, 0.5, 0.2 + rnd() * 0.06); for (let j = 0; j < 9; j++) push('blade', x + (rnd() - 0.5) * 0.4, Math.min(y, W) - 0.02, z + (rnd() - 0.5) * 0.4, rnd() * TAU, c.clone().multiplyScalar(0.85 + rnd() * 0.3), 0.15 + rnd() * 0.25) }
          continue
        }
      }
      // 香蒲：沼澤的淺水灣（水深 0.04～0.22），一叢叢；穗是深褐色的長條
      if (!lag && !view && dep > 0.04 && dep < 0.22 && ss(0.55, 0.68, fbm2(x * 0.18 - 3, z * 0.18 + 11, 2)) > rnd() * 1.3 && nCat < 950) {
        nCat++
        c.setHSL(0.19 + rnd() * 0.03, 0.42, 0.22 + rnd() * 0.05)
        const H = 1.2 + rnd() * 0.9, base = W - dep - 0.03
        for (let j = 0; j < 7; j++) push('tall', x + (rnd() - 0.5) * 0.25, base, z + (rnd() - 0.5) * 0.25, rnd() * TAU, c.clone().multiplyScalar(0.9 + rnd() * 0.2), H * (0.75 + rnd() * 0.35))
        const pc = new THREE.Color().setHSL(0.06, 0.45, 0.12 + rnd() * 0.04)
        for (let j = 0; j < 2; j++) { const st = H * (0.9 + rnd() * 0.25); push('cane', x + (rnd() - 0.5) * 0.2, base, z + (rnd() - 0.5) * 0.2, rnd() * TAU, c, st); push('plume', x + (rnd() - 0.5) * 0.05, base + st * 0.82, z, rnd() * TAU, pc, 0.22) }
        continue
      }
      // 蘆葦：沼澤的水邊（水深 0.25 到岸上 1.5 m）一塊塊群落、草島上整片；潟湖只有北岸東岸零星幾叢
      const reedOK = dep < 0.25 && sd > -6 && sd < 1.5 && !view && (!I || I.veg)
      const pReed = !reedOK ? 0 : lag ? 0.35 * ss(0.62, 0.72, patch) * ss(-112, -98, z) : I ? 0.9 : Math.min(1, 0.3 + 0.75 * ss(0.5, 0.64, patch))
      if (rnd() < pReed && nReed < 3800) {
        nReed++
        const ns = 3 + Math.floor(rnd() * 4), H = 1.8 + rnd() * 0.8
        c.setHSL(0.2 + rnd() * 0.04, 0.4, 0.26 + rnd() * 0.06)
        for (let s = 0; s < ns; s++) {
          const sx = x + (rnd() - 0.5) * 0.45, sz = z + (rnd() - 0.5) * 0.45, st = H * (0.8 + rnd() * 0.3), base = Math.min(y, W) - 0.05
          push('cane', sx, base, sz, rnd() * TAU, c.clone().multiplyScalar(0.85), st)
          for (let j = 0; j < 6; j++) { const t = 0.25 + j / 6 * 0.55 + rnd() * 0.05; push('cane', sx, base + st * t, sz, rnd() * TAU, c.clone().multiplyScalar(0.95 + rnd() * 0.15), -(0.35 + rnd() * 0.2)) }
          const pc = new THREE.Color().setHSL(0.03 + rnd() * 0.04, 0.3, 0.33 + rnd() * 0.08)
          for (let j = 0; j < 3; j++) push('plume', sx, base + st * 0.82, sz, rnd() * TAU, pc, 0.32 + rnd() * 0.1)
        }
        continue
      }
      // 潟湖：海蓬子（紅橘、肉質短莖 8～20 cm）——水線上下一圈、沙洲邊緣
      if (lag && dep < 0.06 && (sd > -1 && sd < 3.5 || (I && !I.veg)) && nSam < 3600 && rnd() < 0.8 * (0.4 + ss(0.35, 0.6, patch))) {
        nSam++
        c.setHSL(0.0 + rnd() * 0.05, 0.55, 0.24 + rnd() * 0.08); if (rnd() < 0.3) c.setHSL(0.12, 0.5, 0.3)
        for (let j = 0; j < 8; j++) push('low', x + (rnd() - 0.5) * 0.45, y - 0.01, z + (rnd() - 0.5) * 0.45, rnd() * TAU, c.clone().multiplyScalar(0.85 + rnd() * 0.3), 0.08 + rnd() * 0.12)
        continue
      }
      // 莎草：沼澤水邊（水深 0.15 到岸上 2.5 m）
      if (!lag && dep < 0.15 && sd > -1.5 && sd < 2.5 && rnd() < (view ? 0.2 : 0.75) * (0.3 + ss(0.4, 0.6, patch)) && nSedge < 3600) {
        nSedge++
        c.setHSL(0.24 + rnd() * 0.04, 0.42, 0.18 + rnd() * 0.06)
        const H = 0.4 + rnd() * 0.35
        for (let j = 0; j < 10; j++) push('blade', x + (rnd() - 0.5) * 0.3, Math.min(y, W) - 0.02, z + (rnd() - 0.5) * 0.3, rnd() * TAU, c, H * (0.7 + rnd() * 0.5))
        continue
      }
      // 岸上：沼澤是青綠矮草、潟湖是金黃的鹽地矮草
      if (sd > 1.5 && nSalt < 5200 && rnd() < 0.55) {
        nSalt++
        if (lag) c.setHSL(0.11 + rnd() * 0.04, 0.45, 0.3 + rnd() * 0.08); else c.setHSL(0.17 + rnd() * 0.05, 0.4, 0.24 + rnd() * 0.08)
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
  g.add(buildHides(hideKit))
  g.add(buildBoardwalk(walkKit))
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
  { name: 'O9', x: EAST.hides[2][0], z: EAST.hides[2][1], look: [-12, -112], w: 6, d: 3.2 },   // 2026-11-11 夕陽潟湖的觀察屋（北岸，往南看泥灘、沙洲）
]
// 2026-11-11 使用者：濕地的木頭都改成 Blender 做的 → 賞鳥屋整間換成 tools/make-hide-kit.py 的模型（倒角的實體木板＋Poly Haven 掃描木紋，
// 跟木棧道同一份木頭）。原本是 JS 疊方盒子＋畫布畫的木紋。三間同一個模型；碰撞照舊在這裡算
const VER = new URL(import.meta.url).searchParams.get('v') ?? ''
export async function loadHideKit() {
  const gl = await new GLTFLoader().loadAsync(`models/props/hide_kit.glb?v=${VER}`)
  const geo = {}
  gl.scene.updateMatrixWorld(true)
  gl.scene.traverse((o) => { if (o.isMesh) { const g = o.geometry.clone(); g.applyMatrix4(o.matrixWorld); if (g.attributes.color_1 && !g.attributes.color) g.setAttribute('color', g.attributes.color_1); geo[o.name] = g } })
  const PT = plankTextures(VER), orm = PT.orm
  const wood = new THREE.MeshStandardMaterial({ map: PT.col, normalMap: PT.nor, normalScale: new THREE.Vector2(1, -1), aoMap: orm, aoMapIntensity: 0.65, roughnessMap: orm, roughness: 1, metalness: 0, vertexColors: true })
  wood.color.setScalar(1.75)   // 牆是直的、大多背光，同一個亮度（1.3）看起來比棧道暗很多 → 調亮到並排看是同一種木頭
  const roof = new THREE.MeshStandardMaterial({ color: new THREE.Color().setRGB(0.09, 0.11, 0.10), roughness: 0.62, metalness: 0.45 })
  return { geo, wood, roof }
}
function buildHides(kit) {
  const G = new THREE.Group(); G.name = 'hides'
  for (const h of HIDES) {
    const a = Math.atan2(h.look[0] - h.x, h.look[1] - h.z)
    const y = alpineHeight(h.x, h.z) + 0.03
    const W = h.w, D = h.d, HF = 2.35, HB = 2.75
    for (const [n, mat] of [['hide_wood', kit?.wood], ['hide_roof', kit?.roof]]) {
      if (!kit?.geo?.[n]) continue
      const o = new THREE.Mesh(kit.geo[n], mat); o.position.set(h.x, y, h.z); o.rotation.y = a; o.castShadow = true; o.receiveShadow = true; G.add(o)
    }
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
function buildBoardwalk(wk) {
  // 2026-11-11 也改用木棧道那套 Blender 零件（bw_plank、bw_stringer、bw_post、bw_rail_top／mid）和同一個木頭材質；原本是 JS 疊的方木條
  const G = new THREE.Group(), sp = ALP_SPURS.find((q) => q.name === 'wetBoard')
  if (!sp || !wk?.geo || sp.pts.length < 4) return G   // 2026-11-12 折線木道拆了（改成 walkway.js 蓋的 'wet2' 曲線棧道）
  const r = mulberry32(919), W = 1.7, P = sp.pts, M = {}
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), UP = new THREE.Vector3(0, 1, 0), bm = new THREE.Matrix4()
  const put = (part, x, y, z, yaw, sc = [1, 1, 1]) => (M[part] ||= []).push(m4.compose(new THREE.Vector3(x, y, z), q.setFromAxisAngle(UP, yaw), new THREE.Vector3(sc[0], sc[1], sc[2])).clone())
  // 零件的長邊是 x：從 a 拉到 b（順著地形斜）
  const span = (part, a, b, sc = 1) => { const X = b.clone().sub(a), L = X.length(); X.normalize(); const Z = new THREE.Vector3().crossVectors(X, UP).normalize(), Y = new THREE.Vector3().crossVectors(Z, X); (M[part] ||= []).push(m4.compose(a.clone().add(b).multiplyScalar(0.5), q.setFromRotationMatrix(bm.makeBasis(X, Y, Z)), new THREE.Vector3(L * sc, 1, 1)).clone()) }
  const S = [0]; for (let i = 1; i < P.length; i++) S.push(S[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]))
  const at = (s) => { let i = 1; while (i < P.length - 1 && S[i] < s) i++; const t = (s - S[i - 1]) / (S[i] - S[i - 1]), dx = P[i][0] - P[i - 1][0], dz = P[i][1] - P[i - 1][1], l = Math.hypot(dx, dz); return { x: P[i - 1][0] + dx * t, z: P[i - 1][1] + dz * t, dx: dx / l, dz: dz / l, seg: i } }
  const Ltot = S.at(-1)
  // 木板：橫在路上（零件長 3.1 → 縮成 1.7）
  for (let s = 1.2; s < Ltot; s += 0.158) { const a = at(s), y = wetBoardY(a.x, a.z); put('bw_plank_' + Math.floor(r() * 4), a.x, y, a.z, Math.atan2(a.dx, a.dz) + (r() < 0.5 ? Math.PI : 0), [W / 3.1, 1, 1]) }
  // 平台 3 × 3 m
  const E = at(Ltot), ey = wetBoardEnd().y, onPlat = (x, z) => { const u = (x - E.x) * E.dx + (z - E.z) * E.dz, v = -(x - E.x) * E.dz + (z - E.z) * E.dx; return u >= -0.2 && u <= 3.1 && Math.abs(v) <= 1.7 }
  for (let u = -1.4; u <= 1.4; u += 0.158) put('bw_plank_' + Math.floor(r() * 4), E.x + E.dx * (1.4 + u), ey, E.z + E.dz * (1.4 + u), Math.atan2(E.dx, E.dz), [3.0 / 3.1, 1, 1])
  // 欄杆：棧道後半段兩側、平台三邊；柱子＋上橫桿＋兩道中橫桿
  const rails = []
  for (let s = 5.6; s <= Ltot; s += 1.6) for (const sd of [-1, 1]) { const a = at(s); rails.push([a.x - a.dz * sd * (W / 2 + 0.05), a.z + a.dx * sd * (W / 2 + 0.05), sd]) }
  const nx = -E.dz, nz = E.dx
  for (let u = 0; u <= 2.8; u += 1.4) for (const sd of [-1, 1]) rails.push([E.x + E.dx * u + nx * sd * 1.55, E.z + E.dz * u + nz * sd * 1.55, sd])
  // 2026-11-12 平台的盡頭接翡翠灣（開著，不再封欄杆）
  const deckY = (x, z) => onPlat(x, z) ? ey : wetBoardY(x, z)
  for (const [x, z] of rails) { put('bw_post', x, deckY(x, z), z, Math.atan2(E.dx, E.dz)); addCollider(x, z, 0.12, deckY(x, z) + 1.2) }
  // 2026-11-12 木道架高到水面上以後：離地（水底）高的地方底下補木樁
  { const pile = (x, z) => { const Y = deckY(x, z), gy = Math.min(alpineHeight(x, z), EAST.W) - 0.4; if (Y - alpineHeight(x, z) > 0.2) put('bw_pile', x, Y - 0.05, z, 0, [1.1, Math.max(0.3, Y - 0.05 - gy), 1.1]) }
    for (let s = 1.6; s < Ltot; s += 1.6) for (const sd of [-1, 1]) { const a = at(s); pile(a.x - a.dz * sd * 0.7, a.z + a.dx * sd * 0.7) }
    for (const u of [0.15, 1.45, 2.75]) for (const v of [-1.35, 1.35]) pile(E.x + E.dx * u - E.dz * v, E.z + E.dz * u + E.dx * v) }
  for (const sd of [-1, 1, 2]) {
    const L = rails.filter((p) => p[2] === sd)
    for (let i = 1; i < L.length; i++) {
      const [ax, az] = L[i - 1], [bx, bz] = L[i], d = Math.hypot(bx - ax, bz - az); if (d > 2.6) continue
      for (const [part, hh] of [['bw_rail_top', 1.04], ['bw_rail_mid', 0.64], ['bw_rail_mid', 0.27]]) span(part, new THREE.Vector3(ax, deckY(ax, az) + hh, az), new THREE.Vector3(bx, deckY(bx, bz) + hh, bz))
    }
  }
  // 兩條縱樑（零件長邊是 z、長 2.4；頂面在木板底下）
  for (let s = 1.2; s < Ltot; s += 1.0) for (const sd of [-1, 1]) {
    const a = at(s), b = at(Math.min(Ltot, s + 1.0)), ax = a.x - a.dz * sd * 0.7, az = a.z + a.dx * sd * 0.7, bx = b.x - b.dz * sd * 0.7, bz = b.z + b.dx * sd * 0.7
    const len = Math.hypot(bx - ax, bz - az); if (len < 0.05) continue
    put('bw_stringer', (ax + bx) / 2, (deckY(ax, az) + deckY(bx, bz)) / 2, (az + bz) / 2, Math.atan2(bx - ax, bz - az), [1, 1, (len + 0.02) / 2.4])
  }
  for (const [part, list] of Object.entries(M)) {
    if (!wk.geo[part] || !list.length) continue
    const im = new THREE.InstancedMesh(wk.geo[part], wk.wood, list.length)
    list.forEach((m, k) => im.setMatrixAt(k, m)); im.castShadow = true; im.receiveShadow = true; im.computeBoundingSphere(); G.add(im)
  }
  return G
}
