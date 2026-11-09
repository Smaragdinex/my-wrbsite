// 園區配置：所有尺寸、地形高度、步道、碰撞與可站立表面的查詢都在這裡。
// 單位是公尺，y 朝上。
import * as THREE from 'three'
import { fbm2, fbm3, noise3 } from './noise.js'

export const TAU = Math.PI * 2
// 溫室是一顆「蛋」：西半邊（x < 0）是原本的橢圓（長半軸 A），東半邊拉長到 AE，裡面是高山區（2026-11-07 改成一個館：拿掉附屬的高山館和通道）。
// x = 0 兩邊的半徑都是 B、斜率都是 0，玻璃面是平順接起來的。GA／GB：原本那顆橢圓，熱帶花園的種植坡、植物範圍照它（山區在它外面）。
export const DOME = { A: 75, AE: 378, B: 55, BE: 115, H: 110 }   // 2026-11-09 山區再放大 ×1.2：AE 328→378、BE 96→115、H 92→110   // 西半軸、東半軸、短半軸（西）、東邊山區最寬處的短半軸、頂高
// 短半軸往東慢慢變寬（西半邊花園照舊 55，山區那側到 72）
export const domeB = (x) => x > 0 ? DOME.B + (DOME.BE - DOME.B) * smoothstep(20, 110, x) : DOME.B   // 2026-11-08 從 x 20 才開始變寬：花園那片地面網格只到 z ±62
// 山區放大（2026-11-07 第四次，1.32→1.55）：原本的配置（設計座標）以入口 x=76 為原點放大 AS 倍，高度 AHS 倍
export const AS = 2.418, AHS = 2.184   // 2026-11-09 第六次放大 ×1.2（2.015→2.418，高度 1.82→2.184，坡度不變；使用者：山再大一點、種果樹和花）
//   // 2026-11-08 第五次放大 ×1.3（1.55→2.015，高度 1.4→1.82，坡度不變）；東邊界 AE 270→328、南北 BE 74→96，頂高 72→92（樹高、飛行高度的上限）
export const AM = (x, z) => [76 + (x - 76) * AS, z * AS]
export const GARDEN = { A: 75, B: 55 }
export const MTN = { x: 12, z: -6, h: 32 }           // 中央雲霧山
export const POOL = { x: -7, z: -6, rx: 15, rz: 21, water: -0.55 }   // 2026-11-08 放大（原本 x -3、10×18）：環山步道西側往外推 12 公尺讓出位置（RING_BULGE）
// width：步道寬（2026-11-07 從 3 加寬到 4.2）；flat：最後這段（比例）不再爬升，和觀景台一樣高，走上平台不會有一階
export const RAMP = { theta0: Math.PI / 2, turns: 2.2, y0: 0, y1: 24, width: 4.2, gap: 2.1, flat: 0.035 }
export const DECK = { r: 7, x: 0, z: 0, y: 0 }   // 頂端圓形觀景台（2026-11-07 從半徑 4.5 放大到 7）
// 相機行：溫室入口外面另外一棟店（像美術館門口的商店），遊戲從店裡開始，穿過玻璃通道的門才進溫室。
// x 從 X0（靠溫室那面牆，中間開口接通道）到 X1（店門口那面），z ±HZ；通道：x 從 X0 到圓頂門口，寬 ±DOOR_W
export const STORE = { X0: -75.6, X1: -88.6, HZ: 7.5, H: 5.0, DOOR_W: 3.4 }
// 高山區（alpine.js）：溫室東半邊、原本花園橢圓外面那一塊。花園的 alpine 步道走到 x≈74 接上山的步道；
// 入口一小片平地、水池，往東爬升到約 26 公尺的山頂，一條溪從東南高處沿山谷流到水池，步道之字形上山、吊橋過溪谷
export const ALP = { X0: 25, X1: 378, HZ: 119 }   // X0 45→25：inAlpine 從 x 30 就開始，以前 30～45 那一小段沒有地形資料（高度 1e9）   // 山區地形格子的範圍（實際能走的是 inAlpine）
// 第三館：海岸（coast.js，美術用 NatureManufacture「Coast Dunes Environment」，跟《淨灘大作戰》同一套）。圓頂南門（z≈-55）→ 通道（z -53～-74，A 門 -61、B 門 -67）
// → 玻璃館（z -74～-154、x ±40）：北半邊沙丘、木棧道，中間沙灘，海岸線約 z -128，往南是館裡的淺水潟湖；館外整片都是海（到地平線）
// 海岸館暫時拿掉（2026-11-07 使用者要求）：關掉就沒有南門、通道、館和海；程式和模型都還在，改回 true 就回來
export const COAST_ON = false
export const CST = { Z0: -74, Z1: -154, HX: 40, H: 22, SEA: 0 }
export const CCORR = { Z0: -53, Z1: -74, W: 3.2, A: -61, B: -67 }
export const coastShoreZ = (x) => -128 + 5 * Math.sin(x * 0.07) + 2 * Math.sin(x * 0.19 + 1)   // 海岸線（館內，GLSL 也有一份）
export const BOARDWALK = { x0: 0, z0: -74.2, z1: -106, w: 2.2 }   // 木棧道：從入口筆直穿過沙丘到沙灘
export const MENU_VIEW = { x: -30, y: 1.7, z: 20, lx: 6, ly: 10, lz: -8 }   // 首頁背景：溫室裡固定一個鏡頭（站在步道上看中央的山和瀑布），不在店裡
export const SPAWN = { x: -87.6, z: 0.4, yaw: -90, pitch: 2 }   // 店門口往裡看：右邊是陳列櫃、左前方是櫃台，正前方是通往溫室的門

export const clamp = (v, a, b) => Math.min(b, Math.max(a, v))
export const lerp = (a, b, t) => a + (b - a) * t
export function smoothstep(a, b, v) { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t) }
export function angDiff(a, b) {
  let d = (a - b) % TAU
  if (d > Math.PI) d -= TAU
  if (d < -Math.PI) d += TAU
  return d
}

/* ---------- 溫室 ---------- */
export const domeRho = (x, z) => Math.hypot(x / (x > 0 ? DOME.AE : DOME.A), z / domeB(x))
export const gardenRho = (x, z) => Math.hypot(x / GARDEN.A, z / GARDEN.B)
export function domeY(x, z) {
  const r2 = (x / (x > 0 ? DOME.AE : DOME.A)) ** 2 + (z / domeB(x)) ** 2
  return r2 >= 1 ? 0 : DOME.H * Math.sqrt(1 - r2)
}

/* ---------- 雲霧山 ---------- */
export function mtnBase(y) {
  const t = clamp(y / MTN.h, 0, 1)
  return 13 - 5 * t - 2.5 * t ** 8
}
// 半徑最多比 mtnBase 多 1.9，步道內緣靠這個保證不插進岩壁
export function mtnR(theta, y) {
  const c = Math.cos(theta), s = Math.sin(theta)
  const n = fbm3(c * 1.4 + 7.1, y * 0.085, s * 1.4 + 3.3, 4)
  const n2 = noise3(c * 4 + 1, y * 0.3, s * 4 + 2)
  let r = mtnBase(y) + clamp(n * 2.6, -1.6, 1.6) + 0.3 * n2
  // 瀑布切出的峽谷，朝向入口（θ = π）
  r -= 1.9 * Math.exp(-((angDiff(theta, Math.PI) / 0.2) ** 2)) * smoothstep(-2, 2, y)
  return r
}

/* ---------- 環山步道（空中走廊） ---------- */
export const rampInner = (y) => mtnBase(y) + RAMP.gap
export function rampSample(s) {
  const th = RAMP.theta0 + s * RAMP.turns * TAU
  const y = RAMP.y0 + (RAMP.y1 - RAMP.y0) * Math.min(1, s / (1 - RAMP.flat))
  const ri = rampInner(y)
  return { th, y, ri, ro: ri + RAMP.width }
}
export function rampHeights(x, z) {
  const dx = x - MTN.x, dz = z - MTN.z
  const r = Math.hypot(dx, dz), th = Math.atan2(dz, dx)
  let base = (th - RAMP.theta0) % TAU
  if (base < 0) base += TAU
  const out = []
  for (let k = 0; k <= Math.ceil(RAMP.turns); k++) {
    const s = (base + k * TAU) / (RAMP.turns * TAU)
    if (s > 1) break
    const p = rampSample(s)
    if (r >= p.ri && r <= p.ro) out.push(p.y)
  }
  return out
}
function initDeck() {
  // 觀景台的內緣對齊步道末端的內緣：步道最後一段（平的）整段落在平台上，平台把它蓋住，接起來沒有縫、沒有一階
  const e = rampSample(1)
  const rc = e.ri + DECK.r
  DECK.x = MTN.x + rc * Math.cos(e.th)
  DECK.z = MTN.z + rc * Math.sin(e.th)
  DECK.y = e.y
  DECK.th = e.th
}
initDeck()
const onDeck = (x, z) => Math.hypot(x - DECK.x, z - DECK.z) <= DECK.r

/* ---------- 步道 ---------- */
const loopPt = (a) => [52 * Math.cos(a), 38 * Math.sin(a)]
export const RING_R = 28   // 環山步道半徑（水池放大後往外推，原本 23）
// 西側（瀑布那一面）往外鼓：湖放大要讓位置，最西邊多 RING_BULGE 公尺，南北兩側不變（再大會撞到繞園步道）
export const RING_BULGE = 12
const ringR = (a) => RING_R + RING_BULGE * Math.max(0, -Math.cos(a))
const ringPt = (a) => [MTN.x + ringR(a) * Math.cos(a), MTN.z + ringR(a) * Math.sin(a)]
function curve(pts, closed = false) {
  return new THREE.CatmullRomCurve3(pts.map(([x, z]) => new THREE.Vector3(x, 0, z)), closed, 'centripetal')
}
function loopPoints() {
  const pts = []
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * TAU
    const w = i % 4 === 0 ? 0 : 3.5 * Math.sin(i * 2.3)   // 四個接點不晃，其他地方蜿蜒
    const [x, z] = loopPt(a)
    pts.push([x + w * Math.cos(a), z + w * Math.sin(a)])
  }
  return pts
}
function ringPoints() {
  const pts = []
  for (let i = 0; i < 24; i++) pts.push(ringPt((i / 24) * TAU))
  return pts
}
// 繞園步道會左右蜿蜒，所以 loopPt(a) 不一定在真的步道上；支線要從「步道上離它最近的那一點」出發，
// 不然起點會偏到草地上、在步道旁邊留下一截方方的步道頭
const LOOP = curve(loopPoints(), true), LOOP_PTS = LOOP.getSpacedPoints(800)
function onLoop(a) {
  const [x, z] = loopPt(a)
  let best = LOOP_PTS[0], bd = Infinity
  for (const q of LOOP_PTS) { const d = (q.x - x) ** 2 + (q.z - z) ** 2; if (d < bd) { bd = d; best = q } }
  return [best.x, best.z]
}
export const PATHS = [
  ...[
  { name: 'entry', w: 4.2, curve: curve([[-74, 0], [-66, 0], [-58, 0], loopPt(Math.PI)]) },
  { name: 'loop', w: 3.4, curve: LOOP },
  { name: 'ring', w: 3.2, curve: curve(ringPoints(), true) },
  { name: 'west', w: 3.0, curve: curve([loopPt(Math.PI), [-38, 3], ringPt(Math.PI - 0.12)]) },
  { name: 'south', w: 2.6, curve: curve([loopPt(Math.PI / 2), [6, 30], [11, 22.5], ringPt(Math.PI / 2)]) },
  { name: 'east', w: 2.6, curve: curve([loopPt(0), [44, -3], ringPt(-0.12)]) },
  { name: 'north', w: 2.6, curve: curve([loopPt(-Math.PI / 2), [1, -36], ringPt(-1.85)]) },
  { name: 'sw', w: 2.4, curve: curve([onLoop(2.3), [-29, 20], ringPt(2.3)]) },
  { name: 'nw', w: 2.4, curve: curve([onLoop(-2.4), [-30, -24], ringPt(-2.5)]) },
  { name: 'spur', w: 2.6, curve: curve([ringPt(1.0), [19.5, 11.6], [14.6, 10.45]]) },
  { name: 'alpine', w: 3.0, curve: curve([loopPt(0), [62, 0.5], [73.5, 0]]) },   // 往高山館的東門
  { name: 'coast', w: 3.0, curve: curve([loopPt(-Math.PI / 2), [0.5, -46], [0, -53.6]]) },   // 往海岸館的南門
  ].filter((p) => COAST_ON || p.name !== 'coast'),
]

/* ---------- 網格：步道距離與地形高度 ---------- */
export const G = { x0: -80, z0: -60, cell: 0.5, nx: 321, nz: 241 }   // structures.js 的步道材質也用這個格子（到步道邊的距離）
export const pathClear = new Float32Array(G.nx * G.nz).fill(1e9)   // 到最近步道邊緣的距離（內部為負）
const height = new Float32Array(G.nx * G.nz)

function stampPaths() {
  for (const p of PATHS) {
    const hw = p.w / 2
    const n = Math.ceil(p.curve.getLength() / 0.35)
    const pts = p.curve.getSpacedPoints(n)
    p.points = pts
    const R = hw + 8
    for (const q of pts) {
      const i0 = Math.max(0, Math.floor((q.x - R - G.x0) / G.cell))
      const i1 = Math.min(G.nx - 1, Math.ceil((q.x + R - G.x0) / G.cell))
      const j0 = Math.max(0, Math.floor((q.z - R - G.z0) / G.cell))
      const j1 = Math.min(G.nz - 1, Math.ceil((q.z + R - G.z0) / G.cell))
      for (let j = j0; j <= j1; j++) {
        const z = G.z0 + j * G.cell
        for (let i = i0; i <= i1; i++) {
          const x = G.x0 + i * G.cell
          const d = Math.hypot(x - q.x, z - q.z) - hw
          const k = j * G.nx + i
          if (d < pathClear[k]) pathClear[k] = d
        }
      }
    }
  }
}

function poolQ(x, z) { return ((x - POOL.x) / POOL.rx) ** 2 + ((z - POOL.z) / POOL.rz) ** 2 }
export { poolQ }

// 攤平的圓：鳥的活動範圍（x, z, 半徑, 高度）
export const FLAT = [{ x: -57, z: -6.5, r: 3.5, y: 0.08 },
  { x: -60, z: 6, r: 2.5, y: 0.6 },     // 麻雀
  { x: -36, z: -34, r: 2.5, y: 1.0 },   // 小彎嘴（靠牆的種植坡上，攤成一小塊平台）
  { x: -11, z: 25, r: 3, y: -0.05 },    // 帝雉
  { x: 16, z: 33, r: 2.5, y: 0.27 },    // 台灣紫嘯鶇
  { x: 42, z: -18, r: 3, y: 0.02 },     // 藍腹鷴
]
function buildHeights() {
  for (let j = 0; j < G.nz; j++) {
    const z = G.z0 + j * G.cell
    for (let i = 0; i < G.nx; i++) {
      const x = G.x0 + i * G.cell
      const k = j * G.nx + i
      const rho = gardenRho(x, z)
      const low = 0.45 * fbm2(x * 0.035 + 3, z * 0.035 - 1, 3)
      // 靠牆隆起的種植坡，讓視線有層次
      const berm = smoothstep(0.7, 0.93, rho) * (1.8 + 1.6 * fbm2(x * 0.06, z * 0.06, 3))
      const knolls = 1.2 * Math.max(0, fbm2(x * 0.05 + 9, z * 0.05 + 4, 3)) * smoothstep(0.35, 0.6, rho)
      let h = low + berm + knolls
      // 步道兩側攤平
      const pc = pathClear[k]
      h = lerp(low * 0.6, h, smoothstep(0.3, 5, pc))
      // 山腳一圈攤平，步道起點才對得上地面
      const dm = Math.hypot(x - MTN.x, z - MTN.z)
      h = lerp(low * 0.6, h, smoothstep(19, 27, dm))
      // 鳥走動的地方攤平（斑鳩在入口草地上走，原本有小坡會讓腳陷進土裡）
      for (const f of FLAT) h = lerp(f.y, h, smoothstep(f.r, f.r + 3, Math.hypot(x - f.x, z - f.z)))
      // 水池
      const q = poolQ(x, z)
      h = lerp(-1.5, h, smoothstep(0.55, 1.25, q))
      // 東邊（山區那側）不降到 0：下面第二輪把種植坡的高度往外延伸，山區的地形從這個高度接起（2026-11-07：原本兩邊都降到 0，交界是一條 1.5 公尺深的溝，玩家會掉下去）
      if (x <= 20 && rho > 1.02) h = 0
      // 相機行那棟和通道底下攤平成 0（不然溫室牆邊的種植坡會從店的地板冒出來）
      const sx = smoothstep(STORE.X0 + 3.5, STORE.X0 + 1.5, x) * smoothstep(STORE.HZ + 2, STORE.HZ, Math.abs(z))
      // 通道（寬 ±4）兩側各留一段平地再慢慢接回種植坡：以前坡從通道玻璃邊直接爬上去，從通道裡往左右看整面都是草牆
      const sp = smoothstep(-64, -68.5, x) * smoothstep(STORE.DOOR_W + 7.5, STORE.DOOR_W + 3.2, Math.abs(z))
      const se = smoothstep(62, 68, x) * smoothstep(5.5, 3.6, Math.abs(z))   // 往山區的步道出口攤平
      const ss_ = !COAST_ON ? 0 : smoothstep(-44, -49.5, z) * smoothstep(CCORR.W + 2.5, CCORR.W + 0.6, Math.abs(x))   // 南門（往海岸館）
      h = lerp(h, 0, Math.max(sx, sp, se, ss_))
      height[k] = h
    }
  }
  // 第二輪：東邊 rho 0.97 以外，高度＝沿半徑往內到 0.97 那一點的高度（種植坡的頂往外平平延伸，接到山區）
  const edge = height.slice()
  const at = (x, z) => {
    const fx = clamp((x - G.x0) / G.cell, 0, G.nx - 1.001), fz = clamp((z - G.z0) / G.cell, 0, G.nz - 1.001)
    const i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j, k = j * G.nx + i
    return (edge[k] * (1 - u) + edge[k + 1] * u) * (1 - v) + (edge[k + G.nx] * (1 - u) + edge[k + G.nx + 1] * u) * v
  }
  for (let j = 0; j < G.nz; j++) {
    const z = G.z0 + j * G.cell
    for (let i = 0; i < G.nx; i++) {
      const x = G.x0 + i * G.cell, rho = gardenRho(x, z)
      if (x <= 20 || rho <= 0.97) continue
      const se = smoothstep(62, 68, x) * smoothstep(5.5, 3.6, Math.abs(z))   // 往山區的步道出口照樣攤平
      height[j * G.nx + i] = lerp(at(x * 0.97 / rho, z * 0.97 / rho), 0, se)
    }
  }
}
// 花園東邊邊緣的高度（山區的地形從這裡接起）
const gardenEdgeH = (x, z) => { const r = gardenRho(x, z); return terrainHeight(x * 0.97 / r, z * 0.97 / r) }

export function terrainHeight(x, z) {
  const fx = (x - G.x0) / G.cell, fz = (z - G.z0) / G.cell
  if (fx < 0 || fz < 0 || fx >= G.nx - 1 || fz >= G.nz - 1) return 0
  const i = Math.floor(fx), j = Math.floor(fz)
  const u = fx - i, v = fz - j
  const k = j * G.nx + i
  const a = height[k], b = height[k + 1], c = height[k + G.nx], d = height[k + G.nx + 1]
  return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v
}
export function pathClearAt(x, z) {
  const i = Math.round((x - G.x0) / G.cell), j = Math.round((z - G.z0) / G.cell)
  if (i < 0 || j < 0 || i >= G.nx || j >= G.nz) return 1e9
  return pathClear[j * G.nx + i]
}

stampPaths()
buildHeights()
{
  // 步道起點貼齊地面
  const s0 = rampSample(0)
  const mid = (s0.ri + s0.ro) / 2
  RAMP.y0 = terrainHeight(MTN.x + mid * Math.cos(s0.th), MTN.z + mid * Math.sin(s0.th)) + 0.02
}

/* ---------- 高山區地形（0.5 公尺格子，x 45～190、z ±56；能走的範圍是 inAlpine） ---------- */
// 溪流、步道都是折線，地形照它們挖溪谷、鋪平步道；結果存成格子（玩家走路、種樹、做網格都查這張）
// 溪：從山頂東南側的山泉（離觀景台不遠）往下，沿著山谷一路流到入口旁的水池；陡的那幾段是小瀑布
export const ALP_STREAM = [[151, -2], [150, -8], [147, -13], [142, -16.5], [135, -15.5], [130.5, -14.2], [125.5, -13.4], [120.5, -14.2], [114, -16.5], [109, -18], [100, -19], [94, -18]].map(([x, z]) => AM(x, z))
// 吊橋底下是一道峽谷：溪在橋的上游掉下一道瀑布，橋面離水面 6～7 公尺
export const ALP_GORGE = { x: AM(124.5, 0)[0], z: -12.8 * AS, depth: 8.5, r: 7 * AS }
export const BRIDGE_DIM = { hw: 1.6, sag: 0.8 }   // 2026-11-07 加大：寬 3.2 公尺   // 吊橋半寬、中間下垂（alpine.js 畫橋、bridgeAt 走路都用）
export const ALP_POND = { x: AM(88, 0)[0], z: -17 * AS, r: 9.5 * AS, water: -0.45 }   // 2026-11-09 湖放大（半徑 7→9.5 設計單位）：鴛鴦、花嘴鴨在這裡游
const ALP_TRAIL_D = [[76, 0], [86, 3], [97, 9], [108, 12], [116, 5], [118.5, -1], [124, -12], [129.5, -22.5], [137, -26], [147, -21], [157, -15], [163, -4], [161, 8], [154, 16], [146, 15], [145, 9]]
export const ALP_TRAIL = ALP_TRAIL_D.map(([x, z]) => AM(x, z))
// 支線小路（2026-11-07）：從主步道岔出去，走到底是一小塊林間空地，稀有的鳥在那裡（from：接在主步道第幾個點）
export const ALP_SPURS = [
  { name: 'north', from: 3, pts: [[110, 19], [105, 25], [101, 28.5]] },        // 北坡闊葉林：黃山雀
  { name: 'fir', from: 9, pts: [[150, -25], [155, -26], [158.5, -24.5]] },      // 南坡冷杉林：火冠戴菊鳥（2026-11-08 往北收：原本盡頭 rho 1.01，路和鳥都在玻璃外面）
  // 2026-11-09 使用者：過橋後馬上往左折回去很彆扭 → 改成過橋先往前直走一段，再往左繞一個大彎（繞過鷓鴣北邊）到同一塊空地
  { name: 'gorge', from: 7, pts: [[129.35, -26.5], [125.2, -29.4], [119, -29], [114, -25.6], [112.5, -22.5]] },  // 吊橋下去，沿溪谷：黃腹琉璃
  { name: 'cabin', from: 14, pts: [[142.5, 15.6], [140, 16.2]] },               // 山頂步道 → 攝影小木屋的門口
].map((sp) => ({ ...sp, pts: [ALP_TRAIL_D[sp.from], ...sp.pts].map(([x, z]) => AM(x, z)) }))
// 攝影小木屋：cabin 支線走到底就是門口（在門廊上）；屋子中心再往裡半個屋深＋0.45 公尺，門朝來的方向（buildAlpine 算好高度）
export const CABIN = (() => {
  const sp = ALP_SPURS.find((q) => q.name === 'cabin'), e = sp.pts[sp.pts.length - 1], p = sp.pts[sp.pts.length - 2]
  const dx = e[0] - p[0], dz = e[1] - p[1], L = Math.hypot(dx, dz)
  // 2026-11-08 放大：6×4.5 → 8.4×6.3；R＝屋子連門廊的外接半徑（地形攤平、樹讓開都用它）
  const W = 8.4, D = 6.3, back = D / 2 + 0.45
  return { x: e[0] + dx / L * back, z: e[1] + dz / L * back, door: e, yaw: Math.atan2(-dx, -dz), W, D, R: Math.hypot(W / 2 + 0.6, D / 2 + 1.6), y: 0 }   // yaw：門（前面）朝哪個方向
})()
export const ALP_BRIDGE = { a: 5, b: 6 }   // 步道第 5～7 點（120,-4 → 124,-12 → 128,-20）跨過溪谷：吊橋，橋下不鋪路
export const ALP_PEAK = { x: AM(145, 0)[0], z: 8 * AS, h: 27, rx: 33, rz: 26 }   // 2026-11-08 山放大：高 21→27、範圍 27×21→33×26（設計座標）   // 跟步道終點差不多高：步道才不會在山頂挖出一條溝
const AG = { x0: ALP.X0, z0: -ALP.HZ, cell: 0.5, nx: Math.round((ALP.X1 - ALP.X0) / 0.5) + 1, nz: Math.round(ALP.HZ * 2 / 0.5) + 1 }
const aHeight = new Float32Array(AG.nx * AG.nz), aTrail = new Float32Array(AG.nx * AG.nz).fill(1e9), aStream = new Float32Array(AG.nx * AG.nz).fill(1e9)
function segDist(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz
  const t = L2 ? clamp(((px - ax) * dx + (pz - az) * dz) / L2, 0, 1) : 0
  return [Math.hypot(px - ax - dx * t, pz - az - dz * t), t]
}
function polyDist(px, pz, P, skip) {
  let best = 1e9, bi = 0, bt = 0
  for (let i = 0; i < P.length - 1; i++) {
    if (skip && skip(i)) continue
    const [d, t] = segDist(px, pz, P[i][0], P[i][1], P[i + 1][0], P[i + 1][1])
    if (d < best) { best = d; bi = i; bt = t }
  }
  return [best, bi, bt]
}
// 底層地形：入口平，往東爬升到山頂（偏北），南北兩道稜線，山頂後面往東牆降一點；不能頂到玻璃（離玻璃至少 9 公尺，樹才放得下）
function alpBase(X, Z) {
  // 用放大前的設計座標算形狀，高度再乘 AHS（山區整個放大）
  const x = 76 + (X - 76) / AS, z = Z / AS, P = { x: 76 + (ALP_PEAK.x - 76) / AS, z: ALP_PEAK.z / AS, h: ALP_PEAK.h }
  let h = 5 * smoothstep(80, 120, x)                                                             // 入口往東慢慢爬升
  h += (P.h - 5) * Math.exp(-(((x - P.x) / ALP_PEAK.rx) ** 2) - (((z - P.z) / ALP_PEAK.rz) ** 2))   // 主峰
  h += 4 * smoothstep(20, 42, Math.abs(z)) * smoothstep(92, 125, x)                               // 南北兩側的稜線
  h -= 5 * smoothstep(160, 186, x)                                                                // 山頂後面往東牆降
  h += 2.6 * fbm2(X * 0.04 + 11, Z * 0.04 - 7, 4) * smoothstep(84, 100, x)
  h += 1.4 * Math.max(0, fbm2(X * 0.13, Z * 0.13, 3)) * smoothstep(86, 105, x)                   // 小岩塊
  h = h * AHS   // 2026-11-08：以前 min(…, domeY - 9)（不能頂到玻璃）——圓頂拿掉之後，這個上限在邊界附近把地形壓成一面懸崖；邊界外的草地（outside.js）會從邊界的高度慢慢降下去
  return lerp(gardenEdgeH(X, Z), Math.max(0, h), smoothstep(1.0, 1.25, gardenRho(X, Z)))          // 花園那側從種植坡的高度接起，往裡面慢慢變成山的形狀
}
// 階梯式溪床（step-pool，台灣山溪常見）：水面一段一段是平的（水潭），潭與潭之間是一道落差（小瀑布、跌水）。
// 沿著溪的距離 s：原本的溪床是一條一路往下的折線（sProf）；把它切成很多段，每段一個水潭，
// 潭的水面＝那段下游端的溪床再高一點（潭尾的石頭門檻），潭底往上游挖深（瀑布底下的沖刷潭最深）。
// 陡的地方潭短、落差大；平的地方潭長、落差小（像淺灘）。
const STEP = 0.25
function buildSteps(st, sProf) {
  const S = [0]
  for (let i = 1; i < st.length; i++) S.push(S[i - 1] + Math.hypot(st[i][0] - st[i - 1][0], st[i][1] - st[i - 1][1]))
  const L = S[S.length - 1]
  const lin = (s) => { let i = 0; while (i < S.length - 2 && S[i + 1] < s) i++; return lerp(sProf[i], sProf[i + 1], clamp((s - S[i]) / (S[i + 1] - S[i]), 0, 1)) }
  // 切段：從上游往下走
  let seed = 911
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  const pools = []
  let s0 = 0
  while (s0 < L - 0.5) {
    const g = Math.max(0.01, (lin(s0) - lin(Math.min(L, s0 + 4))) / 4)     // 這附近的坡度
    const want = 0.55 + rnd() * 1.1                                         // 想要的落差（公尺）
    let len = clamp(want / g, 2.6, 11) * (0.85 + rnd() * 0.3)
    if (L - (s0 + len) < 2.5) len = L - s0                                  // 最後一小段併進來
    const s1 = Math.min(L, s0 + len)
    pools.push({ s0, s1, level: lin(s1) + 0.28 })
    s0 = s1
  }
  // 每一道落差（第 k 個潭的上游端）：上一個潭的水面掉到這個潭的水面
  const drops = []
  for (let k = 1; k < pools.length; k++) {
    const h = pools[k - 1].level - pools[k].level
    if (h > 0.12) drops.push({ s: pools[k].s0, h, up: pools[k - 1].level, down: pools[k].level })
  }
  const FALL = 0.7   // 水從門檻翻下去的水平距離（越高的落差拋得越遠一點）
  const poolAt = (s) => { let k = 0; while (k < pools.length - 1 && pools[k].s1 < s) k++; return k }
  // 水面：潭裡是平的；過門檻往下彎成拋物線（水翻過石頭）
  const water = (s) => {
    const k = poolAt(s), P = pools[k]
    if (k > 0) {
      const up = pools[k - 1].level, h = up - P.level, f = FALL * (0.6 + 0.25 * Math.min(h, 2))
      if (s < P.s0 + f) { const t = clamp((s - P.s0 + 0.12) / (f + 0.12), 0, 1); return up - h * t * t }
    }
    return P.level
  }
  // 溪床：潭底比水面低；瀑布正下方的沖刷潭最深，往潭尾變淺到門檻
  const bed = (s) => {
    const k = poolAt(s), P = pools[k], t = clamp((s - P.s0) / Math.max(0.1, P.s1 - P.s0), 0, 1)
    const h = k > 0 ? pools[k - 1].level - P.level : 0
    let d = 0.3 + 0.35 * (1 - t) + Math.min(1.1, 0.35 + h * 0.4) * Math.exp(-(s - P.s0) / 1.6)
    if (k > 0 && s < P.s0 + 0.35) d = Math.min(d, lerp(pools[k - 1].level - 0.3 - P.level + 0.3, d, clamp((s - P.s0) / 0.35, 0, 1)))   // 門檻那一點：上一個潭的底
    return P.level - d
  }
  // 預先取樣（地形每一格都要查）
  const n = Math.ceil(L / STEP) + 1, W = new Float32Array(n), B = new Float32Array(n)
  for (let i = 0; i < n; i++) { W[i] = water(i * STEP); B[i] = bed(i * STEP) }
  Object.assign(ALP_STREAM, { S, len: L, pools, drops, W, B })
}
const sampleS = (arr, s) => { const f = clamp(s / STEP, 0, arr.length - 1), i = Math.min(arr.length - 2, Math.floor(f)), u = f - i; return arr[i] * (1 - u) + arr[i + 1] * u }
// 沿溪距離：(x, z) 投影到溪的折線上
export function alpineStreamS(x, z) {
  const st = ALP_STREAM, [, i, t] = polyDist(x, z, st)
  return st.S[i] + t * (st.S[i + 1] - st.S[i])
}
// 跌水的門檻不是一條橫的直線：每道門檻斜一點、中間往下游凸一點（很平滑，水面網格跟得上）
export const streamLatOff = (s, lat) => 0.35 * Math.sin(s * 0.53 + 1.0) * lat + 0.14 * lat * lat
export const streamWater = (s) => sampleS(ALP_STREAM.W, s)
export const streamBed = (s) => sampleS(ALP_STREAM.B, s)

function buildAlpine() {
  // 步道高度：沿線取底層地形再平滑，坡度不超過 30%（走得上去）
  const tr = ALP_TRAIL, prof = tr.map(([x, z]) => alpBase(x, z))
  prof[0] = 0
  for (let i = 1; i < prof.length; i++) {
    const L = Math.hypot(tr[i][0] - tr[i - 1][0], tr[i][1] - tr[i - 1][1])
    prof[i] = clamp(prof[i], prof[i - 1] - L * 0.22, prof[i - 1] + L * 0.22)   // 步道坡度最多 22%（30% 時最後上山頂那段像一面斜牆）
  }
  // 吊橋：兩端等高直線
  prof[ALP_BRIDGE.a + 1] = (prof[ALP_BRIDGE.a] + prof[ALP_BRIDGE.a + 2]) / 2
  ALP_TRAIL.prof = prof
  for (const sp of ALP_SPURS) {   // 支線：從主步道那一點的高度開始，一樣坡度最多 22%
    const pp = sp.pts.map(([x, z]) => alpBase(x, z)); pp[0] = prof[sp.from]
    for (let i = 1; i < pp.length; i++) { const L = Math.hypot(sp.pts[i][0] - sp.pts[i - 1][0], sp.pts[i][1] - sp.pts[i - 1][1]); pp[i] = clamp(pp[i], pp[i - 1] - L * 0.22, pp[i - 1] + L * 0.22) }
    sp.prof = pp
  }
  CABIN.y = ALP_SPURS.find((q) => q.name === 'cabin').prof.at(-1)
  const gorgeK = (x, z) => Math.exp(-((Math.hypot(x - ALP_GORGE.x, z - ALP_GORGE.z) / ALP_GORGE.r) ** 2))
  const st = ALP_STREAM, sProf = st.map(([x, z], i) => alpBase(x, z) - 1.3 - ALP_GORGE.depth * gorgeK(x, z))
  for (let i = 1; i < sProf.length; i++) sProf[i] = Math.min(sProf[i], sProf[i - 1] - 0.3)     // 溪床一路往下
  sProf[sProf.length - 1] = Math.min(sProf[sProf.length - 1], ALP_POND.water - 0.3)
  ALP_STREAM.prof = sProf
  buildSteps(st, sProf)
  for (let j = 0; j < AG.nz; j++) for (let i = 0; i < AG.nx; i++) {
    const x = AG.x0 + i * AG.cell, z = AG.z0 + j * AG.cell, k = j * AG.nx + i
    let h = alpBase(x, z)
    // 溪谷：V 字形，越靠溪越低
    const [ds, si, stt] = polyDist(x, z, st)
    const sx = st[si + 1][0] - st[si][0], sz = st[si + 1][1] - st[si][1], lat = ds * (sx * (z - st[si][1]) - sz * (x - st[si][0]) >= 0 ? 1 : -1)
    const ss_ = st.S[si] + stt * (st.S[si + 1] - st.S[si]), sAdj = ss_ + streamLatOff(ss_, lat)
    const bed = streamBed(sAdj), wl = streamWater(sAdj)
    aStream[k] = ds
    const gk = gorgeK(x, z)
    // 斷面（參考台灣山溪的影片）：水邊不是直的——寬度用 2D 雜訊，兩岸不對稱、一凹一凸；
    // 水裡是 U 形的潭底；岸是緩緩爬上去的坡，坡上有一塊塊凸起的石頭（不是一面平滑的牆）
    const half = Math.max(0.9, 1.25 + 1.5 * (fbm2(x * 0.2 + 5.1, z * 0.2 - 2.7, 3) - 0.5) + 0.35 * gk)
    const inWater = bed + (wl - bed) * smoothstep(0, half, ds) ** 2
    const lump = 1.1 * Math.max(0, fbm2(x * 0.42 - 3.3, z * 0.42 + 8.1, 3) - 0.35) * smoothstep(half, half + 1.2, ds) * smoothstep(10, 4, ds)
    const bank = lerp(wl + 0.1, h, smoothstep(half + 0.4, Math.max(6.5, 10 - 3 * gk), ds)) + lump
    h = ds < half ? inWater : Math.min(h + lump, lerp(inWater, bank, smoothstep(half, half + 0.9, ds)))
    if (ds > half) h = Math.max(h, Math.min(bank, wl + 0.1 + (ds - half) * 0.6))   // 岸一定比水面高（水才不會溢出去）
    // 水池
    const dp = Math.hypot(x - ALP_POND.x, z - ALP_POND.z)
    h = lerp(ALP_POND.water - 1.1, h, smoothstep(ALP_POND.r * 0.6, ALP_POND.r + 2.5, dp))
    // 步道：鋪平（吊橋那段不鋪，橋下是溪谷）
    const [dt, ti, tt] = polyDist(x, z, tr, (i) => i === ALP_BRIDGE.a || i === ALP_BRIDGE.a + 1)
    const py = lerp(prof[ti], prof[ti + 1], tt)
    h = lerp(py, h, smoothstep(1.4, 5, dt))   // 步道兩側的切坡放緩（3.2 時像一面牆）
    let dAll = dt
    for (const sp of ALP_SPURS) {   // 支線：窄一點；走到底那一小塊空地攤平
      const [d2, i2, t2] = polyDist(x, z, sp.pts), y2 = lerp(sp.prof[i2], sp.prof[i2 + 1], t2)
      const e = sp.pts[sp.pts.length - 1], de = Math.hypot(x - e[0], z - e[1])
      if (d2 < 6) h = lerp(y2, h, smoothstep(1.0, 4, d2))
      if (de < 9) h = lerp(sp.prof[sp.prof.length - 1], h, smoothstep(3.5, 8, de))
      dAll = Math.min(dAll, d2 + 0.35)   // 小路畫得窄一點（alpineTrailDist 用來畫路面、樹讓開）
    }
    aTrail[k] = dAll
    // 小木屋底下和四周攤平（門口那塊空地也是）
    const dc = Math.hypot(x - CABIN.x, z - CABIN.z)
    if (dc < CABIN.R + 5) h = lerp(CABIN.y, h, smoothstep(CABIN.R, CABIN.R + 4.4, dc))
    // 吊橋底下：整段挖下去（原本只有峽谷中間低，兩端的坡比橋面還高，擋在橋前面）；兩端接到橋頭
    {
      const ba = tr[ALP_BRIDGE.a], bb = tr[ALP_BRIDGE.a + 2], [db, tb] = segDist(x, z, ba[0], ba[1], bb[0], bb[1])
      if (db < BRIDGE_DIM.hw + 14 && tb > 0 && tb < 1) {   // 只在兩個橋頭之間（橋頭外面是步道，不動）
        // 2026-11-07：原本挖 7 公尺、兩側 8 公尺內就收，橋下變成一條方方正正的溝；改成淺一點、兩側慢慢收（溪谷本身已經夠深）
        const deckY = lerp(prof[ALP_BRIDGE.a], prof[ALP_BRIDGE.a + 2], tb) - BRIDGE_DIM.sag * Math.sin(Math.PI * tb), m = Math.min(tb, 1 - tb)
        const under = deckY - 0.45 * smoothstep(0, 0.04, m) - 2.5 * smoothstep(0.03, 0.35, m)
        h = Math.min(h, lerp(under, h, smoothstep(BRIDGE_DIM.hw + 0.8, BRIDGE_DIM.hw + 14, db)))
      }
    }
    // 山頂：步道終點一小塊平地（2026-11-08 拿掉觀景台，不再削一大片平台）；終點旁邊的山頭不能比終點高太多，步道才不會走在溝裡
    const pe = tr[tr.length - 1], dpk = Math.hypot(x - pe[0], z - pe[1])
    h = lerp(prof[prof.length - 1] + 0.02, h, smoothstep(2.5, 5, dpk))
    h = lerp(Math.min(h, prof[prof.length - 1] + 0.3 + 0.12 * Math.max(0, dpk - 3)), h, smoothstep(6, 14, dpk))
    aHeight[k] = h
  }
}
buildAlpine()
const agrid = (arr, x, z) => {
  const fx = (x - AG.x0) / AG.cell, fz = (z - AG.z0) / AG.cell
  if (fx < 0 || fz < 0 || fx >= AG.nx - 1 || fz >= AG.nz - 1) return 1e9
  const i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j, k = j * AG.nx + i
  return (arr[k] * (1 - u) + arr[k + 1] * u) * (1 - v) + (arr[k + AG.nx] * (1 - u) + arr[k + AG.nx + 1] * u) * v
}
export const inAlpine = (x, z, m = 0) => x > 30 && gardenRho(x, z) > 1.03 + m / 60 && x < ALP.X1 && Math.abs(z) < ALP.HZ
export const alpineHeight = (x, z) => inAlpine(x, z) ? agrid(aHeight, x, z) : 0
export const alpineTrailDist = (x, z) => agrid(aTrail, x, z)
export const alpineStreamDist = (x, z) => agrid(aStream, x, z)
export const ALP_GRID = AG
export { aHeight as ALP_HEIGHTS }
// 吊橋：橋面是兩端之間的直線（中間微微下垂），寬 1.4 公尺
export function bridgeAt(x, z) {
  const a = ALP_TRAIL[ALP_BRIDGE.a], b = ALP_TRAIL[ALP_BRIDGE.a + 2], pa = ALP_TRAIL.prof[ALP_BRIDGE.a], pb = ALP_TRAIL.prof[ALP_BRIDGE.a + 2]
  const [d, t] = segDist(x, z, a[0], a[1], b[0], b[1])
  if (d > BRIDGE_DIM.hw + 0.03 || t <= 0 || t >= 1) return null
  return lerp(pa, pb, t) - BRIDGE_DIM.sag * Math.sin(Math.PI * t) + 0.06
}

/* ---------- 海岸館地形（館內 x ±40、z -74～-154，0.5 公尺格子） ---------- */
const CG = { x0: -CST.HX, z0: CST.Z1, cell: 0.5, nx: 161, nz: 161 }
const cHeight = new Float32Array(CG.nx * CG.nz)
function coastBase(x, z) {
  const zs = coastShoreZ(x), dz = z - zs                                     // dz > 0：岸上；< 0：水裡
  let h = dz > 0 ? 1.4 * smoothstep(0, 26, dz) + 0.25 * smoothstep(0, 4, dz) : dz * 0.07   // 沙灘緩坡、水裡慢慢變深
  // 沙丘：北半邊，起伏 2～3 公尺；入口（北牆中間）附近壓平，接通道
  const gate = smoothstep(9, 4, Math.abs(x)) * smoothstep(-84, -76, z)
  h += smoothstep(-110, -94, z) * (1 - gate) * (1.6 + 1.4 * fbm2(x * 0.05 + 4, z * 0.07, 3) + 0.8 * Math.sin(x * 0.11 + z * 0.05))
  // 西邊岬角：岩石高地從沙丘一路伸進海裡（z < -112 最高）
  const head = smoothstep(-20, -30, x) * smoothstep(-96, -112, z) * (3.2 + 1.2 * fbm2(x * 0.1, z * 0.1, 3))
  if (head > 0) h = Math.max(h, head)   // 只在岬角那邊墊高（第一版 max(h, 0) 把整片海底都墊成 0，人可以走進海裡）
  h += 0.12 * fbm2(x * 0.4, z * 0.4, 2) * (dz > 0 ? 1 : 0.3)                // 沙面細小起伏
  return lerp(h, 0.08, gate * smoothstep(-80, -75, z))
}
// 木棧道高度：兩端貼著沙面（入口、沙灘各高 15 公分），中間跟著沙丘最高處＋35 公分，坡度最多 12%；棧道下面和兩側的沙挖低（不會穿出木板）
const BW_N = Math.round((BOARDWALK.z0 - BOARDWALK.z1) / 0.5) + 1, bwProf = new Float32Array(BW_N)
{
  const raw = Array.from({ length: BW_N }, (_, i) => coastBase(BOARDWALK.x0, BOARDWALK.z0 - i * 0.5))
  const tgt = raw.map((_, i) => { let m = -9; for (let k = -4; k <= 4; k++) m = Math.max(m, raw[clamp(i + k, 0, BW_N - 1)]); return m + 0.35 })
  bwProf[0] = raw[0] + 0.15
  for (let i = 1; i < BW_N; i++) bwProf[i] = clamp(tgt[i], bwProf[i - 1] - 0.06, bwProf[i - 1] + 0.06)
  const end = raw[BW_N - 1] + 0.15
  bwProf[BW_N - 1] = end
  for (let i = BW_N - 2; i >= 0; i--) bwProf[i] = Math.min(bwProf[i], bwProf[i + 1] + 0.06)
}
const bwAtZ = (z) => { const f = clamp((BOARDWALK.z0 - z) / 0.5, 0, BW_N - 1.001), i = Math.floor(f); return lerp(bwProf[i], bwProf[i + 1], f - i) }
for (let j = 0; j < CG.nz; j++) for (let i = 0; i < CG.nx; i++) {
  const x = CG.x0 + i * CG.cell, z = CG.z0 + j * CG.cell
  let h = coastBase(x, z)
  if (z <= BOARDWALK.z0 + 0.5 && z >= BOARDWALK.z1 - 0.5) {
    const d = Math.abs(x - BOARDWALK.x0) - BOARDWALK.w / 2
    h = lerp(Math.min(h, bwAtZ(z) - 0.3), h, smoothstep(0.4, 2.5, d))
  }
  cHeight[j * CG.nx + i] = h
}
export const inCoast = (x, z, m = 0) => z < CST.Z0 - m && z > CST.Z1 + m && Math.abs(x) < CST.HX - m
export function coastHeight(x, z) {
  const fx = (x - CG.x0) / CG.cell, fz = (z - CG.z0) / CG.cell
  if (fx < 0 || fz < 0 || fx >= CG.nx - 1 || fz >= CG.nz - 1) return -3
  const i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j, k = j * CG.nx + i
  return (cHeight[k] * (1 - u) + cHeight[k + 1] * u) * (1 - v) + (cHeight[k + CG.nx] * (1 - u) + cHeight[k + CG.nx + 1] * u) * v
}
export const COAST_GRID = CG
export { cHeight as COAST_HEIGHTS }
export function boardwalkAt(x, z) {
  const B = BOARDWALK
  if (Math.abs(x - B.x0) > B.w / 2 || z > B.z0 || z < B.z1) return null
  return bwAtZ(z)
}

/* ---------- 碰撞 ---------- */
export const colliders = []   // { x, z, r, top }
export function addCollider(x, z, r, top = 99) { colliders.push({ x, z, r, top }) }

const PLAYER_R = 0.38
export function supportAt(x, z, feet) {
  if (inAlpine(x, z)) {
    let y = alpineHeight(x, z), owner = 0
    const by = bridgeAt(x, z)
    if (by != null && by <= feet + 0.5 && by > y - 3) { y = by; owner = 3 }
    return { y, owner }
  }
  if (COAST_ON && inCoast(x, z)) {
    let y = Math.max(coastHeight(x, z), CST.SEA - 0.25), owner = 0                  // 水裡走：腳踩在水面下 25 公分（淺水才走得進去）
    const bw = boardwalkAt(x, z)
    if (bw != null && bw <= feet + 0.5) { y = Math.max(y, bw); owner = bw > y - 0.01 ? 4 : owner }
    return { y, owner }
  }
  if (COAST_ON && z < CCORR.Z0 + 2 && z >= CST.Z0 && Math.abs(x) < CCORR.W) return { y: 0, owner: 0 }   // 南邊通道地板
  let y = terrainHeight(x, z), owner = 0
  for (const h of rampHeights(x, z)) if (h <= feet + 0.5 && h > y) { y = h; owner = 1 }
  if (onDeck(x, z) && DECK.y <= feet + 0.5 && DECK.y > y) { y = DECK.y; owner = 2 }
  return { y, owner }
}
function ceilingHit(x, z, feet) {
  const hs = rampHeights(x, z)
  if (onDeck(x, z)) hs.push(DECK.y)
  for (const h of hs) if (h > feet + 0.5 && h - 0.4 < feet + 1.9) return true
  return false
}
// 店裡和通道可以走（牆內縮一個人的寬度）
const inStore = (x, z) => (x < STORE.X0 + 0.1 && x > STORE.X1 + 0.45 && Math.abs(z) < STORE.HZ - 0.45) || (x >= STORE.X0 && x < -70 && Math.abs(z) < STORE.DOOR_W - 0.45)
export let coastDoors = { a: 1, b: 1 }   // coast.js 每格更新   // alpine.js 每格更新：自動門開了多少（0 關、1 全開）；關著的門擋人
// ref：拿來判斷「懸崖」的腳底高度。跳起來在空中時傳起跳點（2026-11-09：以前用空中的腳底高度，離地 0.9 公尺以上每一格都算懸崖、
// 原地也算擋住，player.js 就放行「卡住的人自己走出來」——結果空中完全不擋牆，從小木屋的窗戶、牆都跳得出去）
export function blocked(x, z, feet, ref = feet) {
  if (inAlpine(x, z, 0.45)) {
    if (domeRho(x, z) > 0.955) return true   // 溫室的牆
    // 山區：太陡（一步高過 0.6 公尺）就走不上去；吊橋上不算
    if (bridgeAt(x, z) != null && Math.abs(bridgeAt(x, z) - feet) < 0.6) return false
    // 玩家一小步 0.15 公尺：往上超過 0.13（約 41 度）爬不上去；往下只有懸崖（掉超過 2.5 公尺）才擋，跳起來在空中不會被擋住
    const h = alpineHeight(x, z)
    // 步道上（本來就平緩）一步可以高到 0.35：吊橋兩端的橋面跟地面差 20～30 公分，不然會卡在橋頭
    if (h > feet + (alpineTrailDist(x, z) < 1.5 ? 0.35 : 0.13) || h < ref - 0.9) return true   // 往下一步掉超過 0.9 公尺＝懸崖邊，不能走下去（原本 2.5，會走下爬不回來的地方）
    if (h < ALP_POND.water + 0.05 && Math.hypot(x - ALP_POND.x, z - ALP_POND.z) < ALP_POND.r + 1) return true   // 水池不能走進去
    if (alpineStreamDist(x, z) < 3.5 && streamWater(alpineStreamS(x, z)) - h > 0.3) return true   // 溪裡的潭（水深超過 0.3）不能走進去：潭壁陡，走進去爬不出來
    for (const c of colliders) { if (feet > c.top) continue; const ddx = x - c.x, ddz = z - c.z, rr = c.r + PLAYER_R; if (ddx * ddx + ddz * ddz < rr * rr) return true }
    return false
  }
  if (COAST_ON && inCoast(x, z, 0.45)) {
    // 海岸館：淺水才走得進去（沙面低於海面 0.25 以上就擋）；太陡爬不上去（沙丘、岬角）；木棧道上隨便走
    const bw = boardwalkAt(x, z)
    if (bw != null && Math.abs(bw - feet) < 0.5) return false
    const h = coastHeight(x, z)
    if (h < CST.SEA - 0.3) return true
    if (h > feet + 0.16 || h < ref - 2.5) return true
    for (const c of colliders) { if (feet > c.top) continue; const ddx = x - c.x, ddz = z - c.z, rr = c.r + PLAYER_R; if (ddx * ddx + ddz * ddz < rr * rr) return true }
    return false
  }
  if (COAST_ON && z < -50 && z >= CST.Z0 - 0.5 && Math.abs(x) < CCORR.W - 0.45) {
    for (const [dz, k] of [[CCORR.A, coastDoors.a], [CCORR.B, coastDoors.b]]) if (k < 0.7 && Math.abs(z - dz) < 0.35) return true
    return false
  }
  if (inCoast(x, z)) return true
  if (domeRho(x, z) > 0.955 && !inStore(x, z)) return true
  if (feet < 0.6 && poolQ(x, z) < 1.12) return true
  const dx = x - MTN.x, dz = z - MTN.z
  const r = Math.hypot(dx, dz)
  if (r < 17 && r < mtnR(Math.atan2(dz, dx), feet + 0.9) + PLAYER_R) return true
  for (const c of colliders) {
    if (feet > c.top) continue
    const ddx = x - c.x, ddz = z - c.z, rr = c.r + PLAYER_R
    if (ddx * ddx + ddz * ddz < rr * rr) return true
  }
  return ceilingHit(x, z, feet)
}

/* ---------- 擺放用 ---------- */
export const insideGarden = (x, z, margin = 0.93) => gardenRho(x, z) < margin
export function distToMtn(x, z) { return Math.hypot(x - MTN.x, z - MTN.z) }
