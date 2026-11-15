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
import { canopyGeometry, leafify, barkify } from './fju-foliage.js'

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
    if (h.name === 'O8') {   // 2026-11-13 使用者：O8 前面的水池要乾淨 → 屋子 12 m 內全不長高草／蘆葦、看出去的扇形 30 m、張角 ±57°
      if (d < 12 || (d < 30 && (dx * fx + dz * fz) / (d * L) > 0.54)) return true
      continue
    }
    if (d < 18 && d > 0.5 && (dx * fx + dz * fz) / (d * L) > 0.77) return true
  }
  return false
}
// 2026-11-11 兩湖中間的木棧道上、旁邊 0.6 m 不長草
const nearWalk = (x, z) => [[0, 0], [0.7, 0], [-0.7, 0], [0, 0.7], [0, -0.7], [1.5, 0], [-1.5, 0], [0, 1.5], [0, -1.5]].some(([a, b]) => walkAt(x + a, z + b) != null)
export function buildEast({ avoid = [], lib = null, hideKit = null, walkKit = null } = {}) {
  const g = new THREE.Group(); g.name = 'east'
  const rnd = mulberry32(1110)
  const layers = { cane: [[], []], plume: [[], []], tall: [[], []], blade: [[], []], low: [[], []], gmid: [[], []], glow: [[], []] }   /* gmid／glow：草原自己的中草、矮草毯（2026-11-15：比濕地的寬、亮） */   // plume：花穗（跟 cane 同順序、不打亂：遠的變稀時稈和穗一起消失）   // cane：有稈的（芒草、蘆葦）；blade：白茅、莎草；low：短草
  const c = new THREE.Color()
  const push = (L, x, y, z, a, col, h) => { layers[L][0].push(x, y, z, a); layers[L][1].push(col.r, col.g, col.b, h) }
  const ok = (x, z) => domeRho(x, z) < 0.952 && alpineTrailDist(x, z) > 1.5 && !nearBirdLane(avoid, x, z) && !EAST.hides.some(([hx, hz]) => Math.hypot(x - hx, z - hz) < 3.8) && !nearWalk(x, z)   // 觀察屋裡不長草

  /* ---------- 草原 ----------
     2026-11-15 使用者「大草原就一片大草，問 ChatGPT 怎麼改善」→ docs/GRASSLAND_SPEC_1115.txt、概念圖 docs/acceptance-1113/grassland_concept.png：
     芒草不再到處撒，集中成 domain-warp 雜訊的一塊塊（約 28%，大塊在內部、步道和觀察屋前稀）；其餘是一層密的矮草毯＋中草；
     偶爾一塊乾穗草；步道邊和空地有零星野花（咸豐草白、蟛蜞菊黃、紫色菊、蓼的粉紅穗）；幾叢矮灌木、幾顆半埋的石頭、一棵孤樹 */
  const GRASS_FEAT = []   // 灌木、孤樹、石頭（下面另外蓋）
  {
    const [x0, x1, z0, z1] = EAST.grassBox, L = EAST.lark
    const H = (h) => new THREE.Color(h)
    const C = { carpet: [H(0x687D46), H(0x879456)], mid: [H(0x849151), H(0xA6A16A)], dry: [H(0xB1A073), H(0xC3B387)], misLeaf: H(0x7F874E), plume: [H(0xC9C5A7), H(0xE2DECA)], stem: H(0x8a8458) }
    const FLOW = [[H(0xF2EEE0), H(0xD7B839)], [H(0xE3BD42), H(0xC9A030)], [H(0x9975B2), H(0x7a5a96)], [H(0xC994A8), H(0xb07a90)]]
    const mixC = (a, b, t) => c.copy(a).lerp(b, t)
    const misMask = (x, z) => {
      const wx = x + 18 * (fbm2(x * 0.02 + 5, z * 0.02, 2) - 0.5), wz = z + 18 * (fbm2(x * 0.02 - 7, z * 0.02 + 3, 2) - 0.5)
      const n = fbm2(wx * 0.035 + 3, wz * 0.035 - 8, 3)
      const [ox, oz] = EAST.owlNest, od = Math.hypot(x - ox, z - oz)
      const m = Math.max(ss(0.45, 0.52, n), 1 - ss(6, 14, od))   // 草鴞的巢四周一定是最密的芒草
      return m * ss(2.2, 6, alpineTrailDist(x, z))
    }
    let nMis = 0, nMid = 0, nLow = 0, nDry = 0, nFl = 0
    for (let k = 0; k < 400000 && (nMis < 2600 || nMid < 12000 || nLow < 42000 || nDry < 900 || nFl < 1500); k++) {
      const x = x0 + rnd() * (x1 - x0), z = z0 + rnd() * (z1 - z0)
      const sd = grassSD(x, z)
      if (sd > 2 || rnd() < ss(-3, 2, sd) || !ok(x, z)) continue
      const y = alpineHeight(x, z), slope = Math.hypot(alpineHeight(x + 1, z) - y, alpineHeight(x, z + 1) - y)
      if (slope > 0.8) continue   // 西緣的岩坡不長
      const lark = 1 - ss(0.7, 1.25, Math.hypot((x - L.x) / L.rx, (z - L.z) / L.rz))
      const mm = misMask(x, z), td = alpineTrailDist(x, z), r = rnd()
      const bare = ss(0.6, 0.7, fbm2(x * 0.12 + 11, z * 0.12, 2)) * (td < 4 ? 1 : 0.35)   // 裸土：步道兩側、零星乾的地方
      if (mm > 0.35 && r < 0.62 * mm * (1 - lark) && nMis < 2600) {
        // 芒草：一叢 2～4 根花稈（1.3～2.3 m）、底下一大把往外拱的細長葉、頂上一束銀白帶米色的花穗
        nMis++
        const Hh = 1.3 + rnd() * 1.0, k2 = 0.88 + rnd() * 0.24
        const nl = 10 + Math.floor(rnd() * 8)
        for (let j = 0; j < nl; j++) push('tall', x + (rnd() - 0.5) * 0.3, y - 0.02, z + (rnd() - 0.5) * 0.3, rnd() * TAU, c.copy(C.misLeaf).multiplyScalar(k2 * (0.9 + rnd() * 0.2)).clone(), (0.6 + rnd() * 0.5) * Hh * 0.7)
        const ns = 2 + Math.floor(rnd() * 3)
        for (let s2 = 0; s2 < ns; s2++) {
          const sx = x + (rnd() - 0.5) * 0.25, sz = z + (rnd() - 0.5) * 0.25, st = Hh * (0.85 + rnd() * 0.25)
          push('cane', sx, y - 0.02, sz, rnd() * TAU, C.stem.clone(), st)
          const pc = mixC(C.plume[0], C.plume[1], rnd()).clone()
          for (let j = 0; j < 6; j++) push('plume', sx, y - 0.02 + st * 0.8, sz, rnd() * TAU, pc, 0.26 + rnd() * 0.14)
        }
        continue
      }
      // 野花：步道邊 1.5～9 m、芒草塊之外，一小群一小群（雜訊高的地方）
      if (nFl < 1500 && mm < 0.25 && td < 9 && fbm2(x * 0.15 + 2, z * 0.15 - 5, 2) > 0.6 && r < 0.5) {
        nFl++
        const f = FLOW[Math.floor(rnd() * FLOW.length)], Hh = 0.25 + rnd() * 0.45
        push('blade', x, y - 0.02, z, rnd() * TAU, mixC(C.mid[0], C.carpet[0], 0.5).clone(), Hh)          // 花莖
        for (let j = 0; j < 4; j++) push('plume', x + (rnd() - 0.5) * 0.04, y - 0.02 + Hh * 0.92, z + (rnd() - 0.5) * 0.04, rnd() * TAU, (j ? f[0] : f[1]).clone(), 0.05 + rnd() * 0.04)   // 花瓣＋花心
        continue
      }
      // 乾穗草：稀疏乾草的地方（乾的稜線、裸土附近）一小撮，抽出淺色的穗
      if (nDry < 900 && (bare > 0.3 || fbm2(x * 0.05 - 9, z * 0.05 + 2, 2) > 0.62) && r < 0.35 && mm < 0.3) {
        nDry++
        const Hh = 0.65 + rnd() * 0.55, col = mixC(C.dry[0], C.dry[1], rnd()).clone()
        for (let j = 0; j < 5; j++) push('blade', x + (rnd() - 0.5) * 0.25, y - 0.02, z + (rnd() - 0.5) * 0.25, rnd() * TAU, col.clone().multiplyScalar(0.9 + rnd() * 0.2), Hh * (0.7 + rnd() * 0.4))
        for (let j = 0; j < 2; j++) push('plume', x + (rnd() - 0.5) * 0.1, y - 0.02 + Hh * 0.85, z + (rnd() - 0.5) * 0.1, rnd() * TAU, C.plume[1].clone(), 0.12 + rnd() * 0.08)
        continue
      }
      if (r < 0.3 && nMid < 12000 && bare < 0.5) {
        // 中草 0.35～0.75 m：一叢 6～9 片
        nMid++
        const col = mixC(C.mid[0], C.mid[1], rnd()).clone().multiplyScalar(1.25 + rnd() * 0.2), Hh = 0.35 + rnd() * 0.4
        for (let j = 0; j < 7; j++) push('gmid', x + (rnd() - 0.5) * 0.3, y - 0.02, z + (rnd() - 0.5) * 0.3, rnd() * TAU, col.clone().multiplyScalar(0.88 + rnd() * 0.24), Hh * (0.7 + rnd() * 0.5))
      } else if (nLow < 42000 && rnd() > bare * 0.8 && rnd() < 1 - 0.4 * lark * (fbm2(x * 0.3, z * 0.3, 2) > 0.5 ? 1 : 0)) {
        // 矮草毯 0.08～0.25 m（小雲雀那塊一半是裸土）
        nLow++
        const col = mixC(C.carpet[0], C.carpet[1], rnd()).clone().multiplyScalar(1.25 + rnd() * 0.2)
        for (let j = 0; j < 6; j++) push('glow', x + (rnd() - 0.5) * 0.5, y - 0.01, z + (rnd() - 0.5) * 0.5, rnd() * TAU, col, 0.12 + rnd() * 0.2)
      }
    }
    // 矮灌木（芒草塊邊緣、步道 3 m 外）、幾顆半埋的石頭、一棵孤樹（觀察屋看得到、離巢遠）
    const okF = (x, z, r) => ok(x, z) && grassSD(x, z) < -3 && alpineTrailDist(x, z) > r && Math.hypot(x - EAST.owlNest[0], z - EAST.owlNest[1]) > 16
    for (let k = 0, n = 0; k < 4000 && n < 26; k++) { const x = x0 + rnd() * (x1 - x0), z = z0 + rnd() * (z1 - z0), mm = misMask(x, z); if (!okF(x, z, 3.5) || mm < 0.12 || mm > 0.55) continue; GRASS_FEAT.push({ k: 'shrub', x, z, s: 0.7 + rnd() * 0.7 }); n++ }
    for (let k = 0, n = 0; k < 2000 && n < 7; k++) { const x = x0 + rnd() * (x1 - x0), z = z0 + rnd() * (z1 - z0); if (!okF(x, z, 2.5) || misMask(x, z) > 0.2) continue; GRASS_FEAT.push({ k: 'rock', x, z, s: 0.35 + rnd() * 0.4 }); n++ }
    { let best = null; for (let k = 0; k < 600; k++) { const x = x0 + rnd() * (x1 - x0), z = z0 + rnd() * (z1 - z0); if (!okF(x, z, 6) || misMask(x, z) > 0.2) continue; const hd = Math.min(...EAST.hides.map(([hx, hz]) => Math.hypot(x - hx, z - hz))); if (hd < 14 || hd > 30) continue; best = { k: 'tree', x, z, s: 1 }; break } if (best) GRASS_FEAT.push(best) }
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
    for (let k = 0; k < 420000 && (nReed < 3800 || nSedge < 3600 || nSalt < 5200 || nMead < 5600 || nSam < 3600); k++) {
      const x = x0 + rnd() * (x1 - x0), z = z0 + rnd() * (z1 - z0)
      const sd = wetSD(x, z)
      if (sd > 14 || !ok(x, z)) continue
      const y = alpineHeight(x, z), dep = W - y, lag = inLagoon(x, z), I = islAt(x, z)
      const patch = fbm2(x * 0.12 + 9, z * 0.12, 3), view = sightBlock(x, z)
      if (!lag) {
        if (inE(M.lily, x, z, 1.05) || inE(M.papyrus, x, z, 1.1)) continue
        const md = M.meadows.find((o) => inE(o, x, z, 1.08))
        if (md) {   // 濕草甸：翠綠的矮濕草（0.15～0.4 m），一窪窪積水的地方稀一點
          if (nMead < 5600 && rnd() < (dep > 0.02 ? 0.25 : 0.9)) { nMead++; c.setHSL(0.24 + rnd() * 0.05, 0.5, 0.2 + rnd() * 0.06); for (let j = 0; j < 9; j++) push('blade', x + (rnd() - 0.5) * 0.4, Math.min(y, W) - 0.02, z + (rnd() - 0.5) * 0.4, rnd() * TAU, c.clone().multiplyScalar(0.85 + rnd() * 0.3), 0.15 + rnd() * 0.25) }
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
  const opts = { cane: { width: [0.022, 0.014], cane: true }, plume: { width: [0.009, 0.007] }, tall: { width: [0.012, 0.01] }, blade: { width: [0.008, 0.007] }, low: { width: [0.01, 0.01] }, gmid: { width: [0.022, 0.016] }, glow: { width: [0.03, 0.022], lawn: true } }
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
      const m = bladeMesh(a, b, opts[name]); m.name = 'grass_' + name; g.add(m)
      // 每一塊自己的外框（bladeMesh 預設是原點、半徑 100 → 只好整個關掉剔除，每一塊不管在哪都畫一次）
      m.geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(cx, alpineHeight(cx, cz) + 1, cz), CELL * 0.75 + 4)
      // 照距離變稀（cane 層沒打亂：畫前面幾叢＝整叢消失，不會只剩穗飄著）
      lodRegisterGrass(m, new THREE.Vector3(cx, alpineHeight(cx, cz) + 0.5, cz), CELL * 0.72 + 1)
      n += idx.length
    }
  }
  // 草原的灌木、孤樹、石頭（GRASS_FEAT）
  if (GRASS_FEAT.length) {
    const crown = canopyGeometry()
    const leafM = leafify(new THREE.MeshStandardMaterial({ color: 0x5c7f3e, roughness: 0.85, vertexColors: !!crown.attributes.color }))
    const shrubs = GRASS_FEAT.filter((f) => f.k === 'shrub'), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), cc = new THREE.Color()
    if (shrubs.length) {
      const im = new THREE.InstancedMesh(crown, leafM, shrubs.length)
      shrubs.forEach((f, i) => { const y = alpineHeight(f.x, f.z); q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rnd() * TAU); im.setMatrixAt(i, m4.compose(new THREE.Vector3(f.x, y - 0.15 * f.s, f.z), q, new THREE.Vector3(0.8 * f.s, 0.55 * f.s, 0.75 * f.s))); im.setColorAt(i, cc.setHSL(0.24 + (rnd() - 0.5) * 0.05, 0.4, 0.75 + rnd() * 0.3)); addCollider(f.x, f.z, 0.45 * f.s, y + 0.8 * f.s, y - 0.5) })
      im.castShadow = true; im.receiveShadow = true; im.computeBoundingSphere(); g.add(im)
    }
    const tree = GRASS_FEAT.find((f) => f.k === 'tree')
    if (tree) {   // 孤樹：枝下高 2 m 的闊葉樹（兩團樹冠），樹幹微彎
      const y = alpineHeight(tree.x, tree.z)
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.22, 3.2, 9).translate(0, 1.6, 0), barkify(new THREE.MeshStandardMaterial({ color: 0x6d5544, roughness: 0.9 })))
      trunk.position.set(tree.x, y - 0.1, tree.z); trunk.rotation.z = 0.06; trunk.castShadow = true; g.add(trunk)
      for (const [dx, dy, dz, sx, sy] of [[0, 3.6, 0, 2.6, 1.7], [0.9, 3.0, 0.5, 1.7, 1.2], [-0.8, 3.2, -0.4, 1.6, 1.1]]) { const m = new THREE.Mesh(crown, leafM); m.position.set(tree.x + dx, y + dy, tree.z + dz); m.scale.set(sx, sy, sx * 0.9); m.castShadow = true; m.receiveShadow = true; g.add(m) }
      addCollider(tree.x, tree.z, 0.35, y + 3, y - 0.5)
    }
    const rocks = GRASS_FEAT.filter((f) => f.k === 'rock'), rn = ['mrock_3', 'mrock_5', 'mrock_8'].filter((n2) => lib?.[n2])
    if (rocks.length && rn.length) { const by = Object.fromEntries(rn.map((n2) => [n2, []])); rocks.forEach((f, i) => by[rn[i % rn.length]].push({ p: new THREE.Vector3(f.x, alpineHeight(f.x, f.z) - 0.25 * f.s, f.z), q: new THREE.Quaternion().setFromEuler(new THREE.Euler(rnd() * 0.3, rnd() * TAU, rnd() * 0.3)), s: new THREE.Vector3(f.s, f.s * 0.7, f.s) })); for (const n2 of rn) if (by[n2].length) scatter(g, lib[n2], by[n2], { cast: true }) }
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
