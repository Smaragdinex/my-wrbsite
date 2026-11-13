// 園區配置：所有尺寸、地形高度、步道、碰撞與可站立表面的查詢都在這裡。
// 單位是公尺，y 朝上。
import * as THREE from 'three'
import { fbm2, fbm3, noise3 } from './noise.js'

export const TAU = Math.PI * 2
// 溫室是一顆「蛋」：西半邊（x < 0）是原本的橢圓（長半軸 A），東半邊拉長到 AE，裡面是高山區（2026-11-07 改成一個館：拿掉附屬的高山館和通道）。
// x = 0 兩邊的半徑都是 B、斜率都是 0，玻璃面是平順接起來的。GA／GB：原本那顆橢圓，熱帶花園的種植坡、植物範圍照它（山區在它外面）。
export const DOME = { A: 75, AE: 378, B: 55, BE: 145, H: 110 }   // 2026-11-10 使用者：山區加大（優勝美地的岩壁、瀑布才壯觀）→ BE 115→145   // 2026-11-09 山區再放大 ×1.2：AE 328→378、BE 96→115、H 92→110   // 西半軸、東半軸、短半軸（西）、東邊山區最寬處的短半軸、頂高
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
export const ALP = { X0: -90, X1: 378, HZ: 192 }   /* 2026-11-11 HZ 150→170：西南的潟湖往南到 z -158 */   // 2026-11-11 X0 25→-62：西北的草原那塊在花園北邊（x 到 -56）   // X0 45→25：inAlpine 從 x 30 就開始，以前 30～45 那一小段沒有地形資料（高度 1e9）   // 山區地形格子的範圍（實際能走的是 inAlpine）
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
// 2026-11-10 東部擴建（PARK_PLAN.md／ChatGPT「東部擴建 V2」）：東邊原本是橢圓的尖角（z=±60 只到 x 319），東南的低窪地、東北的緩坡都在外面。
// x 210 以東慢慢從橢圓（n=2）換成超橢圓（n=4.5）：尖角變鈍，濕地和草原包進來；西半邊（花園、入口）完全不變
const domeN = (x) => 2 + 2.5 * smoothstep(210, 262, x)
// 2026-11-11 使用者：濕地搬到公園西南、草原搬到西北，「讓地圖更大」→ 兩塊橢圓（LOBES）跟原本的邊界平滑接起來（smooth min）
export const LOBES = { grass: { x: 2, z: 100, rx: 58, rz: 46 }, wet: { x: 60, z: -122, rx: 52, rz: 54 }, lagoon: { x: -14, z: -126, rx: 66, rz: 58 } }   /* 2026-11-11 使用者：濕地再更大 → 兩塊都往南、潟湖再往西 */   // 2026-11-11 lagoon：濕地加大一倍，西邊（夕陽那側）多一座鹹水潟湖
export const lobeRho = (L, x, z) => Math.hypot((x - L.x) / L.rx, (z - L.z) / L.rz)
// 新地塊跟原本的園區之間不能留凹口（第一版：凹口在邊界外，地面沒畫、看得到走不到）→ 每塊從園區裡面的一點（L.from）拉出來，
// 沿路的橢圓從小（半徑 L.r0）慢慢變成那塊的橢圓：整塊像一顆水滴長出去
LOBES.grass.from = [8, 36]; LOBES.wet.from = [42, -52]; LOBES.lagoon.from = [40, -110]
for (const L of Object.values(LOBES)) L.r0 = 24
export function lobeSweep(L, x, z) {
  let m = 1e9
  for (let i = 0; i <= 10; i++) {
    const t = i / 10, cx = L.from[0] + (L.x - L.from[0]) * t, cz = L.from[1] + (L.z - L.from[1]) * t, rx = L.r0 + (L.rx - L.r0) * t, rz = L.r0 + (L.rz - L.r0) * t
    m = Math.min(m, Math.hypot((x - cx) / rx, (z - cz) / rz))
  }
  return m
}
const smin = (a, b, k) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25 }
function domeRho0(x, z) {
  if (x <= 210) return Math.hypot(x / (x > 0 ? DOME.AE : DOME.A), z / domeB(x))
  const n = domeN(x)
  return ((x / DOME.AE) ** n + Math.abs(z / domeB(x)) ** n) ** (1 / n)
}
// 2026-11-11 使用者：濕地走不過去。潟湖那塊是從東邊 (40,-110) 拉出去的，它的西半邊跟花園北緣之間留了一個凹口：地面有畫、圍籬也在更外面，
// 但 domeRho 在那裡 > 0.955，被當成園區的牆擋住。再從花園裡面往北拉兩條到潟湖，把凹口整個包進園區
const LAG_FILL = [[-22, -34], [8, -40]].map((from) => ({ ...LOBES.lagoon, from, r0: 24 }))
export const domeRho = (x, z) => smin(smin(smin(smin(smin(domeRho0(x, z), lobeSweep(LOBES.grass, x, z), 0.3), lobeSweep(LOBES.wet, x, z), 0.3), lobeSweep(LOBES.lagoon, x, z), 0.3), lobeSweep(LAG_FILL[0], x, z), 0.3), lobeSweep(LAG_FILL[1], x, z), 0.3)
// 同一個方位上「最外面」的邊界半徑（outside.js 的草地從這裡往外鋪）：比它近、但在邊界外的凹口，山區地形網格要自己畫（不然是一個洞）
const OUTER_N = 1440, outerTab = new Float32Array(OUTER_N).fill(-1)
export function outerR(x, z) {
  let a = Math.atan2(z, x); if (a < 0) a += TAU
  const i = Math.round(a / TAU * OUTER_N) % OUTER_N
  if (outerTab[i] < 0) { const dx = Math.cos(i / OUTER_N * TAU), dz = Math.sin(i / OUTER_N * TAU); let r = 0; for (let m = 420; m > 0; m -= 0.5) if (domeRho(dx * m, dz * m) < 1) { r = m; break } outerTab[i] = r }
  return outerTab[i]
}
export const gardenRho = (x, z) => Math.hypot(x / GARDEN.A, z / GARDEN.B)
export function domeY(x, z) {
  const r2 = domeRho(x, z) ** 2
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
  { name: 'entry', w: 4.2, curve: curve([[-72.75, 0], [-66, 0], [-58, 0], loopPt(Math.PI)]) },   // 2026-11-11 起點從 -74 移到 -72.75：相機行門口的石磚地板到 -72.9，以前石頭路疊在磚上面閃爍
  { name: 'loop', w: 3.4, curve: LOOP },
  { name: 'ring', w: 3.2, curve: curve(ringPoints(), true) },
  { name: 'west', w: 3.0, curve: curve([loopPt(Math.PI), [-38, 3], ringPt(Math.PI - 0.12)]) },
  { name: 'south', w: 2.6, curve: curve([loopPt(Math.PI / 2), [6, 30], [11, 22.5], ringPt(Math.PI / 2)]) },
  { name: 'east', w: 2.6, curve: curve([loopPt(0), [44, -3], ringPt(-0.12)]) },
  { name: 'north', w: 2.6, curve: curve([loopPt(-Math.PI / 2), [1, -36], ringPt(-1.85)]) },
  { name: 'sw', w: 2.4, curve: curve([onLoop(2.3), [-29, 20], ringPt(2.3)]) },
  { name: 'nw', w: 2.4, curve: curve([onLoop(-2.4), [-30, -24], ringPt(-2.5)]) },
  { name: 'spur', w: 2.6, curve: curve([ringPt(1.0), [19.5, 11.6], [14.6, 10.45]]) },
  { name: 'alpine', w: 3.0, curve: curve([loopPt(0), [62, 0.5], [76.6, 0]]) },   // 往高山館的東門（2026-11-09 73.5→76.6：跟山區泥土步道接上，中間不再空一段草地）
  { name: 'coast', w: 3.0, curve: curve([loopPt(-Math.PI / 2), [0.5, -46], [0, -53.6]]) },
  { name: 'meadow', w: 2.6, curve: curve([ringPt(Math.PI / 2), [2, 50], [2, 58.5]]) },   // 2026-11-11 往西北的新草原（接山區步道 meadow）   // 往海岸館的南門
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
      // 2026-11-11 原本只做東邊（x > 20）：山區地形後來繞到花園的北、西、南三面，那幾面花園邊緣外的坡還在自己起伏，
      // 跟從 0.97 接出去的山區地形差 20～40 公分，山區那片的邊翹在上面、底下看穿（使用者：地形縫偏高有破圖）→ 整圈都做
      if (rho <= 0.97) continue
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
// 2026-11-11 瀑布湖流出來的河（世界座標）：從湖的西岸出水口往西南，繞過營地南邊、穿過營地支線和主步道（各一座石橋），一路下坡流進山下湖（溪口旁邊，兩股水在湖口會合）。
// 路線是照地形找的最省力下坡（湖 31 m → 山下湖 0 m），中間不會往上爬。2026-11-11 加寬（ChatGPT 建議：基準 5 m、2.5～8 m、湖口 7～8 m），上段往東讓開營地的帳篷
// 2026-11-14 使用者（俯視圖黃色）：出湖那段河改走湖的西南角、往南直直流到原本石橋那裡（x180），再接原本的河道
export const ALP_RIVER = [[181.6, 77], [180.4, 72.6], [180, 66], [180, 57], [171, 50], [160, 41], [151, 38.5], [142, 35.5], [135.5, 30], [129, 18], [124, 10], [122, 0], [121, -10], [120, -20], [119, -28], [116.1, -30.7], [113.2, -33.4]]   // 2026-11-10 檢查員（山下湖河口）：河道延伸進湖 8 m（以前停在湖邊、外面被「岸比水面高」墊成一道土堤，像水流到地上）   // 中段往東南讓開栗背林鴝（134, 33）和黃嘴角鴞那棵樹；過營地支線的地方離岔路口 7 公尺（橋不能蓋在岔路口上）
ALP_RIVER.wide = true
export const ALP_STREAMS = [ALP_STREAM, ALP_RIVER]
// 河過步道的地方：石拱橋（橋面＝步道高度；橋下照河挖，不鋪路）。buildAlpine 算出 x, z, y, dir
export const RIVER_BRIDGES = []
// 吊橋底下是一道峽谷：溪在橋的上游掉下一道瀑布，橋面離水面 6～7 公尺
export const ALP_GORGE = { x: AM(124.5, 0)[0], z: -12.8 * AS, depth: 8.5, r: 7 * AS }
export const BRIDGE_DIM = { hw: 1.6, sag: 0.8 }   // 2026-11-07 加大：寬 3.2 公尺   // 吊橋半寬、中間下垂（alpine.js 畫橋、bridgeAt 走路都用）
export const ALP_POND = { x: AM(88, 0)[0], z: -17 * AS, r: 9.5 * AS, water: -0.08 }   // 2026-11-10 使用者：湖的水太少（一大圈泥灘、荷花顯得太高）→ 水面 -0.45 → -0.08（湖邊最低的地方約 0.05，不會溢出去）   // 2026-11-09 湖放大（半徑 7→9.5 設計單位）：鴛鴦、花嘴鴨在這裡游
const ALP_TRAIL_D = [[76, 0], [86, 3], [97, 9], [108, 12], [116, 5], [118.5, -1], [124, -12], [129.5, -22.5], [137, -26], [147, -21], [157, -15], [163, -4], [161, 8], [154, 16], [146, 15], [145, 9]]
export const ALP_TRAIL = ALP_TRAIL_D.map(([x, z]) => AM(x, z))
// 支線小路（2026-11-07）：從主步道岔出去，走到底是一小塊林間空地，稀有的鳥在那裡（from：接在主步道第幾個點）
export const ALP_SPURS = [
  { name: 'north', from: 3, pts: [[110, 19], [105, 25], [101, 28.5]] },        // 北坡闊葉林：黃山雀
  { name: 'fir', from: 9, pts: [[150, -25], [155, -26], [158.5, -24.5]] },      // 南坡冷杉林：火冠戴菊鳥（2026-11-08 往北收：原本盡頭 rho 1.01，路和鳥都在玻璃外面）
  // 2026-11-09 使用者：過橋後馬上往左折回去很彆扭 → 改成過橋先往前直走一段，再往左繞一個大彎（繞過鷓鴣北邊）到同一塊空地
  { name: 'gorge', from: 7, pts: [[129.35, -26.5], [125.2, -29.4], [119, -29], [114, -25.6], [112.5, -22.5]] },  // 吊橋下去，沿溪谷：黃腹琉璃
  // 2026-11-11 使用者：走到山頂才有小木屋 → 小木屋搬到步道終點（山頂）再往前一點，門朝步道來的方向
  { name: 'cabin', from: 15, k: 0.09, pts: [[145, 6.2]] },   // k：2026-11-12 小木屋只比步道終點高 0.6 m（原本 1.5 m，門前變成陡坡）
  // 2026-11-09 使用者：右邊岔路加大、上面做一個休息的營地（三頂帳篷圍著營火）。跟黃山雀那條共用第一段，到岔口往上坡走到一塊平台
  { name: 'camp', from: 3, pts: [[110, 19], [112.8, 24], [114.25, 28.95]], clear: 11 },   // 2026-11-10 營地再加大 7.5→11
  // 2026-11-10 使用者：帳篷區那邊路線拉長、換一種風景（優勝美地）→ 從主線第 13 點（山頂步道東段）往西下坡，沿北邊的花崗岩壁、瀑布走到營地，跟 camp 支線連成一圈。
  // join：終點接到別條支線的終點（營地），高度兩頭都要對上、盡頭不另外攤平
  // 2026-11-11 使用者：瀑布底下要有一座湖、湖再流出一條河 → 原本貼著岩壁走過瀑布前面的那段，改從湖的南岸繞過去、在湖的出水口過一座石橋（世界座標寫的，換回設計座標）
  // 2026-11-13 使用者照片「這邊橋沒做好」：路在石拱橋東頭 2 m 就轉彎（舊點 186, 66），橋身伸過轉角 → 石欄被「不能擋到路」那條規則拆到只剩一顆。轉角沿同一條線往東移 5 m，路直直過河
  // 2026-11-14 使用者：「補上石橋」→ 河改道後這條路在湖口（水面 27.5、路面 26.3，路比水還低）沒辦法過河；改從湖口下游 9 m（水面 24.1）過，石橋架在那
  { name: 'yose', from: 13, join: 'camp', pts: [[152.92, 22.75], [147.96, 26.47], ...[[236, 65.5], [222, 64.5], [210, 63.5], [197, 63.5], [190.3, 63.3], [185, 61.5], [175.5, 63], [170.8, 66.3]].map(([X, Z]) => [76 + (X - 76) / AS, Z / AS]), [114.25, 28.95]] },
  // 2026-11-10 東部擴建（ChatGPT V2；路線用坡度 ≤20% 的 A* 在高度圖上找、再簡化）：
  // wet：主步道第 9 點（248,-51）往東南下坡，一個之字形下到濕地南岸（316,-30），再沿南岸高處走到東邊的遠距觀察點（濕地核心不能進）
  // 2026-11-13 使用者「這是舊的道路，可以移除了」：以前往東邊舊濕地的支線（濕地 11/11 已經搬到西南），拿掉
  // { name: 'wet', from: 9, noClear: true, pts: [[255, -58], [266, -63], [282, -62], [300, -71], [300, -55], [312, -33], [316, -29], [327, -26], [339, -26], [345, -29]].map(([X, Z]) => [76 + (X - 76) / AS, Z / AS]) },
  // grass：主步道第 12 點（282,19）往東、之字形下到草原西北角，經過草原觀察棚 O7，沿北緣走到東邊看小雲雀那塊（草鴞的高草核心離路 25 m）
  { name: 'grass', from: 12, noClear: true, pts: [[293, 20], [291, 42], [303, 45], [290, 57], [276, 67], [282, 75], [298, 74], [316, 77], [330, 86]].map(([X, Z]) => [76 + (X - 76) / AS, Z / AS]) },
  // 2026-11-10 ridge：瀑布頂東端（平台 75.8 m）沿新的岩脊之字形下到草原西北角，接上 grass 支線（坡度 ≤25%、轉彎有懲罰的 A*（tools/plan3.js），約 226 m，離草鴞巢 ≥26 m）。
  // world：點已經是世界座標、從 y0 這個高度開始（不是從主步道岔出去）；endOn：終點高度＝那條支線在同一點的高度（兩條路接起來沒有落差）
  // 2026-11-10 使用者：南坡溪谷（吊橋下那條溪谷小路的盡頭）接到山下入口的湖，湖邊有路可以走上來。走溪的南岸（不用過溪），
  // 坡度 ≤20% 的 A*：直接走太陡（29%），往南繞一個之字形，約 80 m；起點在湖的東南岸（離水 5 m）
  { name: 'lakeGorge', world: true, k: 0.22, noClear: true, endOn: 'gorge', pts: [[123, -63], [129, -74], [142, -85], [145, -89], [157, -67], [164.3, -54.4]] },
  // 2026-11-10 使用者：入口的湖再接回一開始的公園（那邊有兩條路）→ 從主步道起點（花園東出口外 76,0）往南，繞湖西岸（離水 ≥6 m）、
  // 湖南岸（離水雉、彩鷸 ≥12 m），接到湖東南岸 lakeGorge 的起點（往上就是南坡溪谷）。幾乎平的（0～5 m），約 125 m（A* 找的）
  // 2026-11-10 岩簷步道（松龍岩那種）：湖西岸的步道往北，沿著湖跟岩壁之間走進岩簷底下，盡頭是瀑布側後方的觀景平台（離水簾 4～5 m）
  // 2026-11-10 濕地 V2（ChatGPT C 節）：步道靠近水邊那段改低矮木棧道（寬 1.7），從主步道沿著觀察屋東側下到水邊一個小平台；east.js 鋪木板
  { name: 'wetIn', world: true, k: 0.15, noClear: true, pts: [[77, -57], [66, -63], [55, -68], [44, -73], [37, -79], [34.5, -84], [34.2, -85.8]] },   // 2026-11-13 使用者（手畫湖範圍）：湖往北長到這條路 → 湖邊步道改走新北岸，從 lakeLoop 接到中間木棧道北端（以前走 O8 前面，現在那裡是湖）
  // 2026-11-13 使用者：湖加大到山腳、「不要讓玩家過去邊界」→ 繞沼澤南邊、東邊的 wetRing 拆掉（整條在新湖裡）；去對岸只走木棧道
  { name: 'lagoonRing', world: true, k: 0.15, noClear: true, pts: [[34.2, -85.8], [22, -87.5], [8, -86], [-6, -84.5], [-22, -86.5], [-38, -89], [-52, -96], [-62, -108], [-66, -124], [-62, -142], [-52, -156], [-38, -165], [-20, -170], [-2, -167], [12, -161], [24, -159], [36, -159]] },   // 2026-11-11 加大後：繞潟湖一圈接到木棧道南端
  { name: 'meadow', world: true, y0: 0, k: 0.15, noClear: true, pts: [[2, 58], [5, 68], [9, 80], [10, 92], [16, 104]] },   // 2026-11-11 花園北邊 → 西北的新草原
  { name: 'wetBoard', world: true, k: 0.15, pts: [[321.5, -27.3], [322.6, -31], [326, -34], [330.5, -35.3], [334.2, -34.8]] },
  // 2026-11-13 使用者（手畫路線）「比較順的走上去 不然突然變高 很怪」：舊路線 [177,70.5]→[179.5,77] 貼著出水口走，
  // 落在「河岸防溢」那一圈（離河中心 hw+0.1～hw+1.6）裡，整段被墊到河面 +8 cm＝27.59，步道該是 26 → 1 m 內爬 1.8 m 像一道牆。
  // 照使用者畫的往西繞開河口（離河中心都 >6.6 m，不再被墊），路也拉長到 26 m，配 startOn 之後全程 ≤12% 慢慢爬上凹槽
  // 2026-11-14 使用者：「旁邊道路位置低，修到一樣高，讓上去的位置往右移」→ 岔路口往西挪到 x175（離河 8 m 以上，不會被河岸墊高），
  // 先往西北在西側爬上來，到 x177 z86.6 已經跟湖岸一樣高，再沿新湖岸（BASIN 北邊 3 m 外）走到凹槽
  // 2026-11-14 使用者（俯視圖深紅線）：從營地那側斜斜往北上來，沿湖西岸外側爬到岩拱
  { name: 'cave', world: true, k: 0.2, startOn: 'yose', pts: [[168.5, 70], [170.4, 74], [172.4, 78.5], [174.4, 83], [176.6, 86.8], [180.5, 88.4], [183.6, 89], [185.6, 90.2], [187.6, 93.2]],
    minY: [null, null, null, null, 27.3, 27.72, 27.72, 27.72, 27.72] },   // 沿湖那段＝湖水面 27.5 再高 0.22（跟湖岸一樣高）   // 2026-11-13 使用者：瀑布後面的凹槽改成湖、從瀑布身後直接往上 → 支線走到凹槽西口就接崖壁步道
  { name: 'lakeLoop', world: true, y0: 0, flat: 3, k: 0.15,   /* 2026-11-10 使用者：花園出口左邊那條路有一道凸起的破圖（前 12 m 貼著花園邊，路面被墊到 0.5 m，花園地面是 0） */ noClear: true, endOn: 'lakeGorge', pts: [[76.5, 0], [78.2, -6], [78, -12], [76.5, -35], [77, -57], [81, -63], [88, -68], [96, -71], [106, -72.5], [116, -69], [123, -63]] },   /* 2026-11-13 湖北邊加一片開放淡水濕地：這段改貼著山下湖南緣走（以前 84,-73／98,-78 那段在濕地裡）；濕地夾在湖和山下湖中間，從路上看得到小辮鴴、彩鷸 */
  { name: 'ridge', world: true, y0: 75.8, k: 0.27, noClear: true, landings: true, endOn: 'grass', pts: null },   // pts：ridgeTrailPts()（EAST.ridge 定義之後）
].map((sp) => sp.world ? sp : ({ ...sp, pts: [ALP_TRAIL_D[sp.from], ...sp.pts].map(([x, z]) => AM(x, z)) }))
// 攝影小木屋：cabin 支線走到底就是門口（在門廊上）；屋子中心再往裡半個屋深＋0.45 公尺，門朝來的方向（buildAlpine 算好高度）
export const CABIN = (() => {
  const sp = ALP_SPURS.find((q) => q.name === 'cabin'), e = sp.pts[sp.pts.length - 1], p = sp.pts[sp.pts.length - 2]
  const dx = e[0] - p[0], dz = e[1] - p[1], L = Math.hypot(dx, dz)
  // 2026-11-08 放大：6×4.5 → 8.4×6.3；R＝屋子連門廊的外接半徑（地形攤平、樹讓開都用它）
  const W = 8.4, D = 6.3, back = D / 2 + 0.45
  return { x: e[0] + dx / L * back, z: e[1] + dz / L * back, door: e, yaw: Math.atan2(-dx, -dz), W, D, R: Math.hypot(W / 2 + 0.6, D / 2 + 1.6), y: 0 }   // yaw：門（前面）朝哪個方向
})()
// 營地：camp 支線的盡頭（三頂帳篷圍著營火，camp.js）；R＝帳篷外圍的半徑（樹、石頭、箭竹讓開）
// 2026-11-10 優勝美地區（yosemite.js）：x0～x1 沿著溫室玻璃的北邊立一面花崗岩壁；edge(x)＝那裡玻璃邊（domeRho 0.93）的 z，base(x)＝牆腳（往裡 8 公尺）
export const YOSE = (() => {
  const edgeCache = new Map()
  const edge = (x) => { const k = Math.round(x * 4); if (!edgeCache.has(k)) { let z = 40; while (domeRho(x, z) < 0.93 && z < 140) z += 0.25; edgeCache.set(k, z) } return edgeCache.get(k) }
  const Y = { x0: 168, x1: 251, edge, base: (x) => edge(x) - 20 }   // 2026-11-10 x1 262→251：瀑布頂平台東邊接上新的岩脊（EAST.ridge），岩壁到平台東端為止（岩壁底的高度照地形算，地形墊高後原本 251～262 那段岩壁被抬到 85～98 m，從岩脊冒出來）   // 2026-11-10 溫室加大後：牆腳往裡 20 公尺（那裡玻璃高，岩壁才能 30 公尺以上）
  Y.fall = { x: 200, z: Y.base(200) - 3, r: 3.2, rx: 6.5, rz: 3.2 }   // 落點（水花、白沫在這）
  // 2026-11-11 使用者：瀑布下來要有一座湖、湖再接一條河往下流（跟優勝美地一樣）→ 落點外面一座橢圓湖（24×20 公尺），水面 water 在 buildAlpine 照湖岸地形算
  // 2026-11-10 使用者：瀑布落下來的水最後插進地形 → 量了：瀑布在 x 200，湖心在 x 194，落水那排湖只到 x 200.3，水簾東半邊、後層整片落在高出水面 1～3 公尺的岸上。
  // 湖心移到瀑布正下方偏南、往東放大，北岸伸到岩壁腳下（落水點全在水面上）
  Y.lake = { x: 198, z: 80.5, rx: 13, rz: 10, water: 0 }
  const ssY = (a, b, v) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t) }
  // 2026-11-10 使用者（松龍岩瀑布照片）：瀑布後面是一個往岩壁裡凹進去的岩簷／岩窟（ChatGPT：寬 24～32 m、最深 8～11 m、開口 12～20 m），
  // 步道從湖西岸走進岩簷底下、到瀑布側後方看水簾。caveA(x)：0～1 這一欄凹進去多少；caveD：最深（離牆腳往裡）；caveH：開口高
  Y.cave = { x0: 182.5, x1: 207, xc: 197, D: 10, H: 21 }
  Y.caveA = (x) => { const c = Y.cave; return ssY(c.x0, c.x0 + 8, x) * ssY(c.x1, c.x1 - 6, x) * (0.9 + 0.1 * Math.cos((x - c.xc) * 0.35)) }
  Y.caveD = (x) => Y.cave.D * Math.pow(Y.caveA(x), 0.7)
  Y.caveH = (x) => Y.cave.H * Math.pow(Y.caveA(x), 0.6)
  // 2026-11-13 瀑布後面的凹槽（岩窟）整片變成湖：只留貼著後壁的一條岩架（步道走在上面，從瀑布身後一路往上爬）
  // Y.recPath(x)：岩架上步道的中線離牆腳多遠；Y.inRecessWater：凹槽裡岩架前面那一片水
  Y.recPath = (x) => Math.max(1.2, Y.caveD(x) - 2.1)   // 後壁的碰撞（yosemite.js：牆腳往裡 caveD − 0.6、半徑 0.75）外面再留 0.4 m
  Y.inRecessWater = (x, z, pad = 0) => x > Y.cave.x0 + 1.5 - pad && x < Y.cave.x1 - 1 + pad && Y.caveD(x) > 2.4 && z > Y.base(x) - 3 && z < Y.base(x) + Y.recPath(x) - 1.6 + pad
  // 2026-11-13 驗收第 9 條（使用者：「從這裡往下一直到瀑布，整片改成湖，樹全部移除」）：瀑布湖往東接一片湖，沿著東側岩壁腳（x 205～247），
  // 南岸在步道下面的坡（zS），北邊到岩壁腳；岩壁腳 1 m 內不挖（岩壁網格的底照那裡的地形）
  Y.lakeE = { x0: 205, x1: 247, zS: (x) => 73 + 0.2 * (x - 205) }
  // 驗收第 11 條：湖西岸接到溪的水道（layout.js 檔尾挖的）
  // 2026-11-13 凹槽入口那座岩拱的淨空區：樹、大植被不要長在拱上面或拱洞裡（俯視整座拱被一棵紅杉的樹冠蓋掉）
  Y.inArch = (x, z, pad = 0) => Math.hypot(x - 185.0, z - 90.3) < 5.5 + pad
  Y.inOutlet = (x, z, pad = 0) => { const P = [190.5, 79.3], Q = [184.6, 75.4], dx = Q[0] - P[0], dz = Q[1] - P[1], t = Math.max(0, Math.min(1, ((x - P[0]) * dx + (z - P[1]) * dz) / (dx * dx + dz * dz))); return Math.hypot(x - P[0] - dx * t, z - P[1] - dz * t) < 2.5 + pad }
  Y.inEastLake = (x, z, pad = 0) => x > Y.lakeE.x0 - pad && x < Y.lakeE.x1 + pad && z > Y.lakeE.zS(x) - pad && z < Y.base(x) - 0.2 + pad
  // 2026-11-14 使用者（湖西岸照片）「中間這是舊的可以走的，你可以挖掉，這樣水位才正確」：湖跟出水口之間那條舊路廊留下的土舌（比水面高，把水隔成兩片）
  // 挖成湖的一部分。BASIN＝挖掉的範圍；湖面（yosemite.js）、河面淡入（alpine.js）、擋人走進水裡都照「湖心往外的半徑表」lakeR(θ)
  Y.BASIN = [[179.6, 73.8], [179.0, 76.5], [179.0, 80.5], [179.6, 83.6], [181.2, 85.2], [183.8, 85.8], [186.5, 85.2], [187.5, 82], [187.5, 76], [185.8, 73.5]]
  const inPoly = (P, x, z) => { let c = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const [xi, zi] = P[i], [xj, zj] = P[j]; if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) c = !c } return c }
  const polyEdgeD = (P, x, z) => { let m = 1e9; for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const [ax, az] = P[j], [bx, bz] = P[i], dx = bx - ax, dz = bz - az, t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz))); m = Math.min(m, Math.hypot(x - ax - dx * t, z - az - dz * t)) } return m }
  Y.basinEdgeD = (x, z) => polyEdgeD(Y.BASIN, x, z) * (inPoly(Y.BASIN, x, z) ? -1 : 1)   // 離 BASIN 邊緣幾公尺（負＝在裡面）
  Y.inBasin = (x, z, pad = 0) => Y.basinEdgeD(x, z) < pad
  Y.lakeR = (() => { const N = 64, tab = new Float32Array(N), LK = Y.lake
    const OUTP = [180.6, 72.2], outA = Math.atan2(OUTP[1] - LK.z, OUTP[0] - LK.x), outR = Math.hypot(OUTP[0] - LK.x, OUTP[1] - LK.z)
    for (let i = 0; i < N; i++) { const a = -Math.PI + 2 * Math.PI * i / N, ux = Math.cos(a), uz = Math.sin(a)
      const rE = 1.015 / Math.hypot(ux / LK.rx, uz / LK.rz), da = Math.abs(((a - outA + Math.PI * 3) % (2 * Math.PI)) - Math.PI)
      let r = rE
      // 2026-11-14 使用者「有縫沒接好」：出湖那段河面（s 0～2.5）跟湖一樣高、是平的 → 湖面直接蓋過去，交接點放在河開始往下掉之前（同高度，看不出縫）
      { const OA = Math.atan2(74.59 - LK.z, 180.94 - LK.x), OR = Math.hypot(180.94 - LK.x, 74.59 - LK.z), dd = Math.abs(((a - OA + Math.PI * 3) % (2 * Math.PI)) - Math.PI)
        r = Math.max(r, rE + Math.max(0, OR - rE) * Math.cos(Math.min(Math.PI / 2, dd * 7.5)) ** 2) }
      for (let d = 0; d < 40; d += 0.1) if (Y.inBasin(LK.x + ux * d, LK.z + uz * d)) r = Math.max(r, d + 0.4)
      tab[i] = r }
    const f = (a) => { const t = ((a + Math.PI) / (2 * Math.PI)) * N, i0 = Math.floor(t), w = t - i0; return tab[((i0 % N) + N) % N] * (1 - w) + tab[(((i0 + 1) % N) + N) % N] * w }
    f.tab = tab; return f })()
  Y.inLake = (x, z, pad = 0) => ((x - Y.lake.x) / (Y.lake.rx + pad)) ** 2 + ((z - Y.lake.z) / (Y.lake.rz + pad)) ** 2 < 1 || Y.inEastLake(x, z, pad) || Y.inOutlet(x, z, pad) || Y.inRecessWater(x, z, pad) || Y.inBasin(x, z, pad)
  // 岩壁高：yosemite.js 畫、步道算高度都用這個
  Y.g0 = (x) => alpineHeight(x, Y.base(x))
  // 2026-11-10 使用者：玻璃早就拆了 → 岩壁中段 40～58 公尺（瀑布那一帶最高），兩端收矮
  const HtRaw = (x) => { const end = Math.min(ssY(Y.x0, Y.x0 + 9, x), ssY(Y.x1, Y.x1 - 9, x)), peak = Math.exp(-(((x - 200) / 38) ** 2)); return Math.max(3, (30 + 16 * peak + 12 * fbm2(x * 0.05, 3.7, 3)) * (0.3 + 0.7 * end)) }
  // 2026-11-11 瀑布口到石階頂那一段（x 194～230）岩壁頂是平的（同一個高度 P0）：溪從頂上流到瀑布口、人走到頂上的觀景台
  let P0 = null
  Y.flatK = (x) => Math.min(ssY(184, 192, x), ssY(256, 249, x))   // 2026-11-11 平的岩壁頂加寬（瀑布口到石階頂再往東，頂上一大片平地）
  Y.topY = (x) => { if (P0 == null) P0 = Y.g0(200) + HtRaw(200); const k = Y.flatK(x); return lerp(Y.g0(x) + HtRaw(x), P0, k) }
  Y.Ht = (x) => Y.topY(x) - Y.g0(x)
  // 2026-11-12 兩段式瀑布（使用者給的 Watkins Glen／龍岩瀑布照片；ChatGPT 規格在 docs/GORGE_SPEC.txt）：瀑布口那一段（x 193～207）岩壁上半往後退 rec 公尺，
  // 退出來的地方是一片平的岩棚（高 shelfY，剛好是岩簷的頂）：上段細瀑落在岩棚上，水攤開後從岩簷口成一片寬水簾落進湖裡。
  // rec2：岩棚後壁在上段瀑布正後方再凹一個洞（步道從水簾後面穿過去）
  Y.rec = (x) => 6.5 * Math.exp(-Math.pow((x - Y.fall.x) / 7.5, 4))
  Y.rec2 = (x) => Y.rec(x) + 3.4 * Math.exp(-Math.pow((x - Y.fall.x) / 6.5, 4))   // 2026-11-12 凹洞從 7 m 寬加到 13 m：步道從水簾後面穿過去
  // 2026-11-13 岩棚高度改用「凹槽湖底的最終高度」（水面 −0.9，下面「凹槽變湖」那一步挖成的）：以前用當下的地面高度，
  // 步道比較早算（地面還沒挖成湖）拿到 50.53，岩壁比較晚算拿到 49.26，下層岩廊就懸在凹洞上 1.27 m
  Y.shelfY = () => (Y.lake.water ? Y.lake.water - 0.9 : Y.g0(Y.fall.x)) + Y.caveH(Y.fall.x) + 2.3
  // 2026-11-12 秘境瀑布步道（使用者：後面上山的兩條步道都拆掉，改成從瀑布湖旁邊進去往上；全程走上去不停 3 分鐘。路線設計 docs/GORGE_ROUTE.txt）：
  // 一條連續的路，從瀑布後面岩窟的東口開始，沿湖邊踩石板到岩壁腳，再沿岩壁外側之字形往上到岩壁頂（隧道、螺旋岩室 2026-11-12 拆掉了）。pts＝中線 [x, z]、yy＝高度、kind＝這一點是哪一種：
  // 'open' 露天、'gal' 岩壁上鑿出來的步道（岩壁網格上切橫槽）、'alc' 折返平台（槽切得深）、'top' 岩壁頂
  Y.TRAIL_HW = 1.35   // 可以走的半寬（2026-11-12 使用者「路再寬一點」1.2 → 1.35）
  Y.GAL = [189, 211]   // 2026-11-13 兩段穿越瀑布的岩廊（有岩頂、不爬坡）的 x 範圍：layout.js 排高度、yosemite.js 切岩壁和換欄杆都用它
  Y.stairs = (() => {
    let built = null
    return () => {
      if (built) return built
      const pts = [], yy = [], kind = []
      const add = (x, z, y, k) => { pts.push([x, z]); yy.push(y); kind.push(k) }
      let cur = null
      const to = (b, k, n) => { const a = cur; for (let i = 1; i <= n; i++) { const t = i / n, x = lerp(a[0], b[0], t); add(x, Y.base(x) + lerp(a[1], b[1], t), lerp(a[2], b[2], t), k) } cur = b }
      const PI = Math.PI
      // 起點＝cave 支線的終點（瀑布正後方），高度跟那裡的地面一樣
      // 2026-11-13 改：起點在凹槽西口（cave 支線的終點），沿著後壁的岩架走到瀑布正後方、一路往上爬，出凹槽東口直接接第一段階地（中間不再下到湖邊走平路）
      { const x0 = 187.6, z0 = 93.2, y0 = alpineHeight(x0, z0) + 0.02; add(x0, z0, y0, 'open'); cur = [x0, z0 - Y.base(x0), y0]
        const YR = 32.2, X1 = 206.5, pts2 = []; for (let x = 189.5; x <= X1 + 1e-6; x += 1.5) pts2.push(x)
        for (const x of pts2) { const t = (x - 189.5) / (X1 - 189.5); to([x, Y.recPath(x), lerp(y0 + 0.15, YR, Math.pow(t, 1.1))], 'open', 2) }
        to([210.5, 1.25 + 0.6 * clamp((YR - 33) / 40, 0, 1), YR + 0.6], 'gal', 4) }
      // 從岩窟出來：岩窟東端是收成拱的岩壁，走不出去 → 在 x 203 從岩簷口底下出來，沿湖邊踩著石板（水面上 0.8 m）往東到迴廊口
      // 2026-11-12 重新設計（使用者實際走過：「不需要進洞，我們是看鳥的遊戲；沿著山壁往上走，參考 Zion Angels Landing」）：
      // 隧道、螺旋岩室全部拆掉，整條都在岩壁外側——瀑布東邊那面岩壁上鑿出來的之字形步道（Walter's Wiggles 那種），五段、四個折返平台，
      // 每段橫越 33 m、升 9 m 多（坡度 28%）；外側是鐵鍊欄杆，往外看得到瀑布、湖和停在岩壁橫生樹上的鳥。
      // 岩壁越高越往後仰：步道中線離牆腳的距離從 1.6 m（底）慢慢加到 3.4 m（頂）
      const Y0 = 32.8, YT = Y.topY(240) + 0.05, lean = (y) => 0.6 * clamp((y - 33) / (YT - 33), 0, 1)   // 岩壁面越高越往後仰（頂上比牆腳退 1.8 m）
      // 第三版（ChatGPT 崖壁步道 V3：「把屋頂挑高沒有用，要把連續的屋頂拿掉」）：五段不再上下疊在同一面牆上，改成一層層往後退的階地——
      // 每往上一段，整條往岩壁裡退 TS 公尺；每一層從地板到天空全部鑿開，頭上沒有岩石。步道外緣 1.2 m、內側只留 0.55 m 就是上一層的石壁（總寬 1.75 m）。
      // 折返平台＝兩層之間繞半圈（半徑 TS/2）。三個平的賞鳥台另外往石壁裡鑿 1.9 m，頭上留一段天然的岩簷（＝上一層步道的地板）
      const TS = 2.6, RT = TS / 2, dK = (k, y) => lean(y) + 1.25 + TS * k   // 2026-11-13 使用者「步道可以穿牆、要變寬」：內側石壁從中線 0.7 m 退到 1.25 m、可走的內側 0.75 m（鏡頭離牆 0.5 m 才不會穿進去）；外側 1.35 m。上下兩層要錯開 2.8 m 才不重疊   // 2026-11-12 使用者「路再寬一點」：每層 1.7 → 2.0 m（外側 1.35、內側 0.65）
      // 2026-11-12 使用者「中間一段設計穿過瀑布後面走過去」：第二段往西多走 8 m 到瀑布中段的岩棚（x 210、高度剛好＝岩棚），
      // 在岩棚上繞水潭一圈——從後面的凹洞穿過上段瀑布的水簾後面到西側，再沿水潭前緣踩著石頭跨過出水口回來——然後才折返往上
      // 2026-11-13 使用者手畫新路線：中間那兩段要橫跨整面崖壁、穿過瀑布——從 U3 往西穿到 x182（原本只到 194 的岩棚迴圈），
      // 再從 x182 一路往東拉到 x241。第二次穿越的高度比岩棚高 6 m 多，那裡原本是齊平的岩壁 → 靠 slotsAt 把岩壁往裡鑿（使用者：「岩壁挖深一點讓玩家走過去」）
      // 第二版（使用者看了 ChatGPT 概念圖：「就是這概念，但下面一樣就一道往上走」）：
      // 第 1 段從 U1 一路往西爬、穿過瀑布到西邊的折返平台 A（x182），不再在瀑布東邊折返；第 2 段從 A 折回來、在上層再穿過瀑布一次。
      // 兩次穿越都是「岩壁裡的廊道、頭上有岩頂、水簾在外側」（像龍岩窟），由 yosemite.js slotsAt 在瀑布前後改切有頂的廊道
      // 2026-11-13（第三版，使用者給了 ChatGPT 生的「龍岩窟」圖：「做一樣」）：兩段穿越瀑布改成**平的岩廊**（踏板會變成平鋪的石板）——
      // 下層岩廊在岩棚高度（瀑布正後方原本那個凹洞 rec2，水從外側落進中段水潭），上層岩廊比它高 7 m；GAL 範圍內不爬坡，爬升都放在岩廊兩頭。
      // 西邊的折返平台 A 往西移到 x176：兩層之間要爬 7 m，平台兩邊各 13 m 的路才不會太陡
      const legs = [[210.5, 244], [244, 176], [176, 241], [241, 216], [216, 240]], SH = Y.shelfY(), GAL = Y.GAL
      const BAYS = [{ leg: 1, x: 224.5, name: 'waterfall' }, { leg: 2, x: 234.5, name: 'canopy' }, { leg: 3, x: 229.5, name: 'raptor' }], BH = 2.0
      const galOn = (li) => li === 1 || li === 2
      // 岩廊的步道貼著岩面走（龍岩窟參考圖：欄杆外面就是落差和水簾，不是一片岩石平台）：中線離退進去的岩面 1.5 m（欄杆剛好在岩面邊緣），
      // 瀑布正中那 10 m 再往裡 1.2 m——主瀑布本身有 2.6 m 厚、背面比岩面還深 0.4 m，不退進去欄杆就泡在水裡。岩廊兩頭外 4 m 慢慢接回階地的深度
      const galD = (x) => Y.rec(x) + 1.5 + 1.2 * Math.exp(-(((x - Y.fall.x) / 5) ** 4))
      const galW = (x) => smoothstep(GAL[0] - 4, GAL[0], x) * smoothstep(GAL[1] + 4, GAL[1], x)
      const flatIn = (li) => BAYS.filter((b) => b.leg === li).length * 2 * BH + (galOn(li) ? GAL[1] - GAL[0] : 0)
      const lenOf = (li) => Math.abs(legs[li][1] - legs[li][0]) - flatIn(li)
      // 第 0、1 段走到岩廊東口（x211）剛好爬到岩棚高度；走完岩廊照同一個坡度爬到平台 A；之後第 2～4 段一起爬到頂
      const preGal1 = Math.abs(legs[1][0] - GAL[1]) - BAYS.filter((b) => b.leg === 1 && (b.x - GAL[1]) * (b.x - legs[1][0]) < 0).length * 2 * BH
      const rA = (SH - Y0) / (lenOf(0) + preGal1), yA = SH + rA * Math.abs(GAL[0] - legs[1][1]), rB = (YT - yA) / (lenOf(2) + lenOf(3) + lenOf(4) - 3)
      let y = Y0; const bays = []
      legs.forEach(([xa, xb], li) => {
        const len = Math.abs(xb - xa), n = Math.round(len / 1.05), dir = Math.sign(xb - xa), last = li === legs.length - 1, rise = li < 2 ? rA : rB, riseT = li < 1 ? rA : rB
        const myB = BAYS.filter((b) => b.leg === li)
        const climbTo = (s) => { let c = Math.min(s, last ? len - 3 : len); for (const b of myB) { const sb = Math.abs(b.x - xa); c -= clamp(s - (sb - BH), 0, 2 * BH) }
          if (galOn(li)) { const g0 = Math.min(Math.abs(GAL[0] - xa), Math.abs(GAL[1] - xa)), g1 = Math.max(Math.abs(GAL[0] - xa), Math.abs(GAL[1] - xa)); c -= clamp(s - g0, 0, g1 - g0) }   // 岩廊那段不爬
          return Math.max(0, c) }
        for (let i = 1; i <= n; i++) { const t = i / n, x = lerp(xa, xb, t), yy2 = last && t === 1 ? YT : y + rise * climbTo(t * len); add(x, Y.base(x) + (galOn(li) ? lerp(dK(li, yy2), galD(x), galW(x)) : dK(li, yy2)), yy2, 'gal') }   /* 2026-11-13 瀑布那段的岩壁本身就往後退了 rec（最深 6.5 m），水簾掛在退進去的岩面前面；步道要再往裡 1.6 m 才會在水簾後面、頭上有岩頂 */
        for (const b of myB) { const yb = y + rise * climbTo(Math.abs(b.x - xa)); bays.push({ ...b, y: yb, d: dK(li, yb), half: BH, depth: 1.9 }) }
        y = last ? YT : y + rise * climbTo(len)
        // 2026-11-13 岩棚那一圈（原本走到 x194 再原路折回 x210）拆掉：改成第 2 段直接往西穿過去、第 3 段再從西邊一路往東，
        // 整條崖壁只剩「之」字，不再有原路折返的迴圈（使用者：「原本外面那個 U 外道都要刪除」）
        if (!last) {
          const d0 = dK(li, y), sx = dir
          for (let i = 1; i <= 8; i++) { const f = i / 8 * PI, yy2 = y;   /* 2026-11-12 折返平台是平的（原本繞半圈升 1 m：踏板像一疊大石塊貼在岩壁上） */ add(xb + sx * RT * 1.9 * Math.sin(f), Y.base(xb) + d0 + RT - RT * Math.cos(f) + (lean(yy2) - lean(y)), yy2, 'alc') }   // 平台往外鼓出去一點（橢圓：沿岩壁方向 1.6 m）
        }
      })
      const top = YT
      cur = [240, dK(4, YT), YT]
      to([239.4, dK(4, YT) + 1.4, top], 'top', 2); to([238.2, dK(4, YT) + 3.2, top], 'top', 3)   /* 2026-11-12 步道加寬後岩壁頂的邊往後退了 1.6 m，原本往東北的出口直接撞上溪潭邊的石頭 → 改往西北 */   // 最上面那段走到底，往北轉上岩壁頂
      let L = 0; const S = [0]; for (let i = 1; i < pts.length; i++) { L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); S.push(L) }
      const h = (s) => { if (s <= 0) return yy[0]; if (s >= L) return yy[yy.length - 1]; let lo = 0, hi = S.length - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (S[m] < s) lo = m; else hi = m } return lerp(yy[lo], yy[hi], (s - S[lo]) / Math.max(1e-6, S[hi] - S[lo])) }
      // 全程（湖西岸 cave 支線起點到岩壁頂）不停走 3 分鐘：湖邊那 40 m 照平常的速度，步道上的速度 v 照長度反推（濕的石階，小心走）
      const v = Math.min(3.2, L / (180 - 40 / 3.2))
      built = { pts, yy, kind, S, L, h, h0: yy[0], top, v, bays, TS, dTop: dK(4, YT), dbg: { rA, rB, yA, SH, Y0, preGal1, l0: lenOf(0), l1: lenOf(1), l2: lenOf(2), l3: lenOf(3), l4: lenOf(4) } }
      return built
    }
  })()
  // 站在步道上的高度；不在上面回傳 null。步道有好幾層上下重疊（螺旋、上下層通道）：給 feet（腳底高度）就挑「不高過腳底 0.6 m」裡最接近腳底的那一層
  Y.stairAt = (x, z, feet) => {
    if (x < 168 || x > 247.5 || z < 86 || z > 122) return null
    const st = Y.stairs(), HW = Y.TRAIL_HW
    // 賞鳥台：中線往岩壁裡 1.9 m、前後各 2 m 的那一塊平地
    for (const b of st.bays ?? []) { const dz = z - (Y.base(x) + b.d);   /* 岩壁是斜的（每往東 1 m、往北 0.55 m）：照這一欄的牆腳量 */ if (Math.abs(x - b.x) <= b.half + 0.1 && dz > -1.35 && dz < b.depth + 0.7 && (feet == null || (b.y + 0.05 <= feet + 0.6 && b.y + 0.05 >= feet - 2))) return b.y + 0.05 }
    // 找中線上最近的那一點；上下重疊的幾層（螺旋每圈差 4.6 m、上下層通道）用高度分：只看腳底往上 0.6、往下 2 m 以內的
    let bestH = null, bestD = 1e9
    for (let i = 1; i < st.pts.length; i++) {
      const [ax, az] = st.pts[i - 1], [bx, bz] = st.pts[i]
      if (Math.abs(x - ax) > 4 || Math.abs(z - az) > 4) continue
      const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2)), d = Math.hypot(x - ax - dx * t, z - az - dz * t)
      if (d > HW || d >= bestD) continue
      if (st.kind[i] === 'shelf' && d > 1.0) continue   // 岩棚上那一圈：兩邊是水潭和岩棚的邊，只能走中間 2 m
      if (st.kind[i] === 'gal' && d > 0.75 && (z - (az + dz * t)) * Math.abs(dx) - (x - (ax + dx * t)) * dz * Math.sign(dx) > 0) continue   // 階地內側（朝岩壁那邊）只有 0.55 m，再過去是上一層的石壁
      const hh = lerp(st.yy[i - 1], st.yy[i], t) + 0.05
      if (feet != null && (hh > feet + 0.6 || hh < feet - 2)) continue
      bestD = d; bestH = hh
    }
    return bestH
  }
  // 岩壁頂上走得到的地方（平的，高 topY）：瀑布口東邊到 x 250；前緣＝岩壁的邊（瀑布口那段跟著岩棚往後退），後面到山腳前
  // x 213～237：最後一段迴廊在岩壁頂的邊緣底下往上爬（最後幾公尺頂上是開的），那一條不算岩壁頂（不然快到頂時腳下突然變成平台的高度，被當成一階太高擋住）
  // 2026-11-12 鷹之窗：最高那段岩壁廊道（x 236→214、+71～76 m）外的岩壁上長一棵大枯樹（原本放第一個回頭彎外：被松樹和旁邊岩壁擋住不顯眼）；perch＝頂端橫枝（模型座標，tools/gorge-kit.json）
  Y.snag = { x: 226.5, y: 70.5, z: Y.base(226.5) + 1.5, perch: [-0.992, 5.946, -5.35], dir: [-0.986, -0.151], r: 0.082 }
  // 2026-11-12 崖壁上橫生的樹（tools/make-cliff-kit.py → cliff_kit.glb；每棵的枝梢＝鳥站的點，數字抄自 tools/cliff-kit.json，模型座標）
  // 根紮在「上面那段步道的地板底下 1 m」那層岩簷的外緣（再往下是下面那段步道挑高的槽，沒有岩壁可以紮根）；樹往外 2～3.5 m、往上長到步道上的人眼睛上方 0～2.5 m。
  // [x, 從哪一段步道看（0 起算）, 模型, 縮放, 轉向]：一群一群擺，賞鳥台兩側多
  const CT_PERCH = {pine_a: [[0.832, 5.6, -3.852], [2.127, 5.16, -4.741], [-0.651, 3.095, -4.356]], pine_b: [[-1.466, 4.0, -2.782], [-1.809, 3.655, -3.537], [0.416, 2.415, -3.325]], pine_c: [[-1.503, 6.8, -4.708], [-2.596, 6.3, -5.79], [0.496, 4.041, -5.752]], pine_d: [[1.579, 3.2, -2.354], [1.387, 2.918, -3.121], [-0.943, 1.953, -2.744]], snag_a: [[1.651, 5.2, -3.638], [1.777, 4.599, -3.826], [1.884, 3.985, -3.297], [1.311, 2.906, -4.047]]}   // tools/cliff-kit.json：樹梢＋光禿的棲枝
  // [x, 第幾段, 模型, 大小, 轉幾度]。2026-11-12 ChatGPT V3：每個賞鳥台左右 5～9 m 各一棵，棲枝在眼睛的高度到往上 2 m；猛禽台東邊那棵枯木的頂比眼睛高 2 m、後面是天空
  // 2026-11-13 使用者：「原本外面那個 U 外道都要刪除 還有樹」→ 崖壁上那些掛在階地外緣的松樹整組拿掉。
  // （它們的樹根是綁在「第幾段步道」上的，新路線多了兩段、段號全部錯位，樹就浮在半空中了）
  const CT_LIST = []
  let _ct = null
  Y.cliffTrees = () => {
    if (_ct) return _ct
    const T = Y.stairs(), legs = [[]]
    for (let i = 0; i < T.pts.length; i++) { if (T.kind[i] === 'gal') legs.at(-1).push(i); else if (legs.at(-1).length) legs.push([]) }
    const at = (k, x) => { const Lg = legs[k]; let b = Lg[0]; for (const i of Lg) if (Math.abs(T.pts[i][0] - x) < Math.abs(T.pts[b][0] - x)) b = i; return b }
    _ct = CT_LIST.map(([x, k, model, s, yaw0]) => { let yaw = yaw0
      const i = at(k, x), fy = T.yy[i], y = fy - 1.3, z = T.pts[at(k - 1, x)][1] + 1.25 + 0.04   /* 下一層步道內側的石壁（2026-11-13 牆從中線 0.7 退到 1.25） */   // 這一層階地外緣底下的石壁＝下一層步道內側的石壁（中線往裡 0.6 m）
      yaw -= Math.atan((Y.base(x + 0.5) - Y.base(x - 0.5)));   /* 岩壁是斜的：樹照岩壁面的法線往外長 */ const c = Math.cos(yaw), sn = Math.sin(yaw)
      const perch = CT_PERCH[model].map(([px, py, pz]) => [x + (px * c + pz * sn) * s, y + py * s, z + (-px * sn + pz * c) * s])
      return { x, y, z, model, s, yaw, leg: k, floor: fy, perch }
    })
    return _ct
  }
  Y.topFront = (x) => Y.base(x) + 3.2 + Y.rec(x) + (x > 211.8 && x < 246.8 ? Y.stairs().dTop + 1.0 - 3.2 : 0)   // 2026-11-12 階地那一段（x 213.5～246.8）：岩壁頂的前緣＝最上面那層步道內側的石壁
  Y.topAt = (x, z) => (x > 201.2 && x < 250 && z > Y.topFront(x) - 0.05 && z < Y.edge(x) - 2.2) ? Y.topY(x) + 0.05 : null   // 岩壁頂上的平地：瀑布口東邊到 x 250
  Y.behind = (x, z) => x > Y.x0 - 3 && x < Y.x1 + 3 && z > Y.base(x) - 1.5   // 岩壁上（石頭、草不要長在這裡）
  Y.inside = (x, z) => x > Y.x0 - 12 && x < Y.x1 + 10 && z > Y.base(Math.min(Y.x1, Math.max(Y.x0, x))) - 30
  return Y
})()
// 2026-11-10 吃果實的鳥停在雀榕上：birds.js 擺鳥時把自帶那棵樹的樹幹位置放進來，alpine.js 先在這些位置種雀榕
export const FIG_FORCED = []
export const CAMP = (() => { const e = ALP_SPURS.find((q) => q.name === 'camp').pts.at(-1); return { x: e[0], z: e[1], R: 10, y: 0 } })()
export const ALP_BRIDGE = { a: 5, b: 6 }   // 步道第 5～7 點（120,-4 → 124,-12 → 128,-20）跨過溪谷：吊橋，橋下不鋪路
// 2026-11-11 橋頭平台（使用者：橋頭跟木棧道疊在一起、高低角度都不對）：ChatGPT 的做法——吊橋兩端各一塊木平台吸收步道轉彎，
// 平台跟橋面最後一塊木板一樣高（Y0）；凸多邊形＝沿橋軸 1.7 m 的矩形 ∪ 從橋軸 1.4 m 處往下一個步道點方向 1.8 m 的矩形。
// walkway.js 照這個畫木板、欄杆，supportAt 照這個走，地形在平台底下壓低。下面算完步道高度（prof）才填
export const BRIDGE_HEADS = []
function hull2(P) {
  const p = P.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]), cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
  const lo = [], up = []
  for (const q of p) { while (lo.length > 1 && cr(lo.at(-2), lo.at(-1), q) <= 0) lo.pop(); lo.push(q) }
  for (const q of p.slice().reverse()) { while (up.length > 1 && cr(up.at(-2), up.at(-1), q) <= 0) up.pop(); up.push(q) }
  return lo.slice(0, -1).concat(up.slice(0, -1))   // 逆時針（x→右、z→下 的平面上）
}
export function inHull(x, z, H, pad = 0) {
  for (let i = 0; i < H.length; i++) {
    const [ax, az] = H[i], [bx, bz] = H[(i + 1) % H.length], ex = bx - ax, ez = bz - az, L = Math.hypot(ex, ez)
    if ((ex * (z - az) - ez * (x - ax)) / L < -pad) return false
  }
  return true
}
export function landingAt(x, z) { for (const h of BRIDGE_HEADS) if (inHull(x, z, h.hull)) return h.Y0; return null }
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
// 2026-11-10 東部擴建：東南「人工鹹淡水濕地展示區」、東北高草原（ChatGPT V2 的多邊形；座標是世界座標）
// 濕地：水面 W；水裡越往中間越深（0.05→0.45 m）、東邊一個深潭（1.1 m）；西半邊是剛好露出水面的泥灘，一條彎彎的潮溝穿過去；
// 外面一圈岸往上接回原地形，而且一定比水面高（東邊原地形只有 1～2 m，要堆一道自然的土堤，水才不會漫出去）
const pip = (P, x, z) => { let c = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) if ((P[i][1] > z) !== (P[j][1] > z) && x < (P[j][0] - P[i][0]) * (z - P[i][1]) / (P[j][1] - P[i][1]) + P[i][0]) c = !c; return c }
const ringDist = (P, x, z) => { let d = 1e9; for (let i = 0; i < P.length; i++) { const a = P[i], b = P[(i + 1) % P.length]; d = Math.min(d, segDist(x, z, a[0], a[1], b[0], b[1])[0]) } return d }
const sdPoly = (P, x, z) => (pip(P, x, z) ? -1 : 1) * ringDist(P, x, z)   // 負＝在裡面
export const EAST = {
  W: 2.5,   // 水面高
  water: [[318, -59], [329, -69], [344, -66], [350, -54], [348, -40], [336, -35], [322, -42]],
  pool: { x: 342, z: -53, r: 5 },
  creek: [[316, -53], [320, -53], [328, -55], [335, -51], [341, -47], [349, -46]],
  grass: [[272, 66], [299, 63], [320, 72], [336, 88], [339, 108], [319, 119], [292, 114], [273, 95]],
  lark: { x: 318, z: 97, rx: 11, rz: 8 },     // 小雲雀：低草、裸土的核心（20×15 m）
  hides: [[300, 78.5], [318.5, -32]],
  spring: [254.5, 121.2],                      // 瀑布頂上游的湧泉（小岩丘頂）
  owlNest: [292, 114],                         // 草鴞的巢（2026-11-10 使用者：巢要放在隱密的地方）：草原南緣高草最深處，離步道 40 m，四周一圈密密的芒草          // 觀察屋 O7、O8（east.js 蓋）：四周 6 m 不長樹、箭竹
}
// 2026-11-10 ChatGPT「濕地 V2」：不是一個水池 → 主水域（深 0.35～0.8）＋淺水覓食區（0.03～0.18）＋裸露泥灘＋兩座泥島＋一條西北往東南彎的水道（寬 2.5～4.5、深 0.3～0.6）
EAST.mainPool = { x: 341, z: -53, rx: 8.5, rz: 10 }
EAST.channel = [[318.5, -40.5], [323, -45.5], [328.5, -48], [333, -51.5], [338, -53], [343, -57.5], [347, -63]]
EAST.islands = [{ x: 330.5, z: -58.5, rx: 3.6, rz: 2.1, rot: 0.5, h: 0.2 }, { x: 337.5, z: -42.5, rx: 2.1, rz: 1.6, rot: -0.3, h: 0.14 }]
EAST.wetBox = [306, 362, -82, -22]; EAST.grassBox = [258, 352, 52, 132]
// 2026-11-11 使用者：濕地搬到公園西南（山區入口湖的西南邊）、草原搬到西北（花園北邊）→ 整套平移（水域、泥灘、島、潮溝、觀察屋、草鴞巢、木棧道）；
// 東邊原本那兩塊回到山的地形，種紅杉。濕地的水面 2.5 → -0.25（新位置的地面約 0）
export const EAST_DW = [-276, -60], EAST_DG = [-303, 8]
{
  const mv = (p, d) => { p[0] += d[0]; p[1] += d[1] }, mo = (o, d) => { o.x += d[0]; o.z += d[1] }
  for (const p of [...EAST.water, ...EAST.creek, ...EAST.channel]) mv(p, EAST_DW)
  for (const o of [EAST.pool, EAST.mainPool, ...EAST.islands]) mo(o, EAST_DW)
  EAST.wetBox = [EAST.wetBox[0] + EAST_DW[0], EAST.wetBox[1] + EAST_DW[0], EAST.wetBox[2] + EAST_DW[1], EAST.wetBox[3] + EAST_DW[1]]
  mv(EAST.hides[1], EAST_DW)
  for (const p of EAST.grass) mv(p, EAST_DG)
  mo(EAST.lark, EAST_DG); mv(EAST.owlNest, EAST_DG); mv(EAST.hides[0], EAST_DG)
  EAST.grassBox = [EAST.grassBox[0] + EAST_DG[0], EAST.grassBox[1] + EAST_DG[0], EAST.grassBox[2] + EAST_DG[1], EAST.grassBox[3] + EAST_DG[1]]
  for (const p of ALP_SPURS.find((q) => q.name === 'wetBoard').pts) mv(p, EAST_DW)
  // 2026-11-12 使用者：「右邊木道可以跟中間的連結嗎」→ 原本走到沼澤裡一個平台就是死路；現在從那裡繼續往南、繞過荷葉區（水雉 52,-107 的東邊），
  // 再往西接到中間 S 形棧道東側的翡翠灣（灣前緣中點 42.84,-121.30、朝東；最後 3 m 是接灣的平台），變成一圈環線
  // （第二版，同一天）折線木道＋平台接灣的地方木板角度對不起來 → 整條改成跟中間棧道同一套的平滑曲線棧道（下面 mkWetWalk 的 'wet2'）；這條支線只剩岸上接過去的一小段土路
  { const sp = ALP_SPURS.find((q) => q.name === 'wetBoard'); sp.pts.length = 0; sp.pts.push([38.6, -78.0], [41.2, -81.0]) }   // 2026-11-13 O8 往北退：改成從湖邊步道接到 O8 後門的一小段土路（舊的 45.5,-87.3 那段走進水裡，拿掉）
  EAST.W = -0.25
}
// 2026-11-11 濕地加大一倍、分成兩座（使用者：10 種鳥都要住得進去、兩個不同特色的濕地；ChatGPT「Wetland expansion」）：
// 東：翡翠沼澤（淡水；原本的位置撐滿環湖步道）——荷葉盆地（水雉、紫水雞）、深水池（鳳頭鸊鷉）、兩片濕草甸（丹頂鶴、赤頸鶴）、紙莎草角落（鯨頭鸛）、蘆葦帶（紫鷺、澤鵟）
// 西：夕陽潟湖（鹹水；西邊新開的地，太陽從這邊落下）——粉紅的淺水灣（大紅鸛）、一條筆直的深水道（黑剪嘴鷗）、泥灘與沙洲（黑面琵鷺、玫瑰琵鷺、高蹺鴴、流蘇鷸）
// 中間也是水，一條木棧道從北岸走到南岸，把兩座湖分開（使用者 2026-11-11）；兩邊同一個水面高 W
EAST.water = [[39, -99], [38.5, -93], [40, -88.5], [44, -86.5], [48.5, -84], [52, -79.5], [60, -76.5], [67, -72.5], [73, -68], [79, -68.5], [86, -73], [95, -76.5], [101, -79], [100, -90], [101, -102], [105, -114], [106.5, -127], [104, -142], [98, -154], [88, -163], [74, -166.5], [60, -165.5], [50, -160], [43, -154], [39, -146], [38, -134], [38, -121], [38, -108]]   // 2026-11-13 使用者手畫（docs/acceptance-1113/wetland_map_for_drawing.png 的紅線）：往東長到山腳、往南到原本的環湖步道、往北長到 lakeLoop／新湖邊步道；O8 留在西北角一塊突出的岸上
// 2026-11-13 使用者照片「觀賞要往外移、讓水池更乾淨、旁邊 old 走道改成 sand or wetland water」→ O8 那塊突出的岸（連舊走道）變成淺水，O8 往北退到湖邊步道旁的岸上
// （11-11 版：[[47,-97],[56,-94],[67,-93],[78,-97],[86,-106],[90,-120],[88,-136],[80,-150],[66,-158],[52,-156],[44,-146],[38,-134],[38,-121],[38,-108],[42,-101]]）
EAST.lagoon = [[-24, -94], [-6, -91], [12, -95], [23, -103], [26, -116], [22, -130], [14, -146], [0, -158], [-18, -162], [-38, -156], [-52, -142], [-58, -124], [-54, -106], [-42, -96]]   // 2026-11-11 再加大：往西到 x -58、往南到 z -162
EAST.mid = [[20, -101], [42, -100], [44, -154], [14, -154]]   // 2026-11-11 使用者：兩湖中間也是湖、中間的步道改木棧道 → 兩座湖用一片水接起來（鹹淡水的分界在木棧道底下）
EAST.wetBox = [-76, 110, -180, -60]   // 2026-11-13 湖往北、往東長（北邊到 z -68 的開放濕地）：水面網格、植被、擋水都用這個框（原本 [-76,108,-180,-78]，新湖被切成一條直線）
// 翡翠沼澤裡的分區（深度、植物、鳥都照這個）
EAST.marsh = {
  grebe: { x: 62, z: -115, rx: 17, rz: 12.5, dep: 1.4 },   /* 2026-11-12 使用者：右邊的湖加大 → 開闊深水從 18×14 m 放大到 34×25 m（原本大部分是 0.2 m 深、長滿蘆葦的淺灘） */          // 深水池：鳳頭鸊鷉求偶、花嘴鴨
  lily: { x: 50, z: -106, rx: 7.5, rz: 6, dep: 0.5 },         // 荷葉盆地：觀察屋 O8 正前方
  meadows: [{ x: 64, z: -98, rx: 7, rz: 5.5, who: 'redcrowned' }, { x: 90, z: -78, rx: 11, rz: 6.5, who: 'lapwing', open: true }, { x: 72, z: -127, rx: 8, rz: 6, who: 'sarus' }, { x: 68, z: -151, rx: 7, rz: 4.5, who: 'ruff' }],   // 濕草甸：剛好露出水面、一窪窪積水
  papyrus: { x: 47, z: -131, rx: 6, rz: 4.5 },
  // 2026-11-13 使用者：湖跟山下湖中間加一片 open freshwater wetland（小辮鴴、彩鷸）＝上面 meadows 的 'lapwing'：幾公分深的水、泥、短草，不長蘆葦；丹頂鶴草甸往西南讓給新木道                   // 紙莎草角落：鯨頭鸛埋伏
}
EAST.mainPool = { x: 62, z: -115, rx: 17, rz: 12.5 }
EAST.channel = [[42, -112], [50, -114.5], [60, -116], [70, -114], [79, -111]]
EAST.channel2 = [[60, -116], [62.5, -125], [57, -134], [59, -144], [66, -150]]
EAST.creek = [[-50, -110], [-30, -115], [-6, -120], [8, -123], [20, -126]]   // 潟湖的筆直深水道（黑剪嘴鷗貼著水面剪過去）：35～50 m、寬 5 m
EAST.islands = [
  // 2026-11-12 湖加大：湖中間的三座草島拿掉（澤鵟改站枯木）；鯨頭鸛腳下那座（54,-126）也拿掉——牠是站在淺水裡等魚的鳥，站在泥島上兩隻腳陷在土裡（使用者截圖）
  // 潟湖：泥灘、沙洲（光禿、高出水面 0.1～0.15）
  { x: -12, z: -103, rx: 5, rz: 3, rot: 0.3, h: 0.12 }, { x: -22, z: -127, rx: 4, rz: 2.5, rot: -0.5, h: 0.1 }, { x: 6, z: -134, rx: 4.5, rz: 2.2, rot: 0.2, h: 0.12 },
  { x: 14, z: -110, rx: 3, rz: 2, rot: 0.8, h: 0.15 }, { x: -5, z: -127, rx: 3.5, rz: 2, rot: -0.2, h: 0.1 },
  // 2026-11-11 加大的部分
  { x: -42, z: -122, rx: 5, rz: 3, rot: 0.6, h: 0.12 }, { x: -30, z: -146, rx: 5.5, rz: 3, rot: -0.3, h: 0.12 }, { x: -6, z: -150, rx: 4, rz: 2.4, rot: 0.2, h: 0.1 },
  { x: 62, z: -146, rx: 3.2, rz: 2.2, rot: 0.5, h: 0.2, veg: true }, { x: 77, z: -140, rx: 2.8, rz: 2, rot: -0.4, h: 0.18, veg: true }, { x: 52, z: -140, rx: 2.4, rz: 1.8, rot: 0.1, h: 0.18, veg: true },
]
EAST.lagoonDeep = { x: -15, z: -116, rx: 5.5, rz: 4.5, dep: 1.2 }
EAST.hides[1] = [42.5, -83]   // O8（淡水）：2026-11-13 從突出的岸（42.5,-92）往北退 9 m，貼著湖邊步道，往東南看整片湖
EAST.hides[2] = [-15, -89.2]  // O9（潟湖）：北岸，往南看泥灘和沙洲
EAST.decks = [
  // 2026-11-12 使用者：兩座單獨的觀賞台（潟湖東北岸的夕陽台、沼澤東岸長滿蘆葦的鶴台）移除；剩下的都是接在棧道上的觀景灣（下面 push 的）
]
export const inLagoon = (x, z) => x < 31
// 觀景台：矩形（w 沿面向的左右、d 前後）；wetland.js 照這個蓋
export function deckFrame(D) { const a = Math.atan2(D.look[0] - D.x, D.look[1] - D.z); return { a, c: Math.cos(a), s: Math.sin(a) } }
export function deckAt(x, z) {
  for (const D of EAST.decks) {
    const { c, s } = deckFrame(D), dx = x - D.x, dz = z - D.z, lz = dx * s + dz * c, lx = dx * c - dz * s
    if (Math.abs(lx) <= D.w / 2 && Math.abs(lz) <= D.d / 2) return D.y ??= Math.max(EAST.W + 0.3, alpineHeight(D.x - (D.d / 2 + 0.3) * s, D.z - (D.d / 2 + 0.3) * c) + 0.12, 0.08 + Math.max(...[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([u, v]) => alpineHeight(D.x + (u * D.w / 2) * c + (v * D.d / 2) * s, D.z - (u * D.w / 2) * s + (v * D.d / 2) * c))))   /* 2026-11-12 使用者：獨立的觀賞台太高、要跳才上得去（以前＝四角最高點＋0.35，後面入口那一側落差 0.34～0.7）→ 比後面入口的地面高 0.12、不低於四角的地面 */
  }
  return null
}
// 邊界加雜訊：多邊形的直邊在遊戲裡一看就是六角形（2026-11-10 第一版從空中看是一塊褐色六角形）→ 岸線、草原邊緣彎彎曲曲
export const wetSD = (x, z) => Math.min(sdPoly(EAST.water, x, z), sdPoly(EAST.lagoon, x, z), sdPoly(EAST.mid, x, z)) + 3.2 * (fbm2(x * 0.05 + 13, z * 0.05 - 2, 3) - 0.5) + 1.2 * (fbm2(x * 0.2, z * 0.2 + 5, 2) - 0.5)
export const grassSD = (x, z) => sdPoly(EAST.grass, x, z) + 9 * (fbm2(x * 0.03 - 4, z * 0.03 + 9, 3) - 0.5)
// 東部的分區（植被用）：'wet'＝濕地（水、泥灘、岸邊 6 m 內）、'grass'＝草原；其他 null
export function eastZone(x, z) {
  const [a, b, c, d] = EAST.wetBox, [e, f, g, h] = EAST.grassBox
  if (EAST.hides.some(([hx, hz]) => Math.hypot(x - hx, z - hz) < 6)) return 'hide'
  if (x > a - 8 && x < b + 8 && z > c - 8 && z < d + 8 && wetSD(x, z) < 14) return 'wet'   // 濕地＋整片壓低的岸坡（第一版只到 6 m，觀察屋裡長出兩棵冷杉）
  if (x > e && x < f && z > g && z < h && grassSD(x, z) < 2) return 'grass'
  return null
}
// 觀察屋底下攤平（半徑 3 m 平的、4.8 m 接回去）：屋子才不會一邊懸空，人站在地上眼睛剛好對到觀察窗
const hideY = []
// 2026-11-10 使用者：瀑布頂後面都是空的 → 從瀑布頂東端接一道往東南下降的岩脊到東部草原西北角（ChatGPT「瀑布頂 → 上游溪谷 → 東部草原」縮小版）。
// 脊線 EAST.ridge：瀑布頂（75.3 m，跟平台一樣高）→ 草原西北角（32 m）；脊頂寬約 24 m（橫坡 6%），兩側 1.4 倍陡坡落回原地形（不會把草原蓋掉）。
// 之字形步道走在脊頂上（ALP_SPURS 'ridge'，A* 找的）
EAST.ridge = [[249, 112, 75.3], [260, 103, 70], [267, 94, 60], [272, 84, 47], [276, 73, 35], [278, 65, 29.5]]
// 之字形步道直接從脊線算（第一版用 A* 找，轉彎太密、每段只有 5～8 m，加了轉彎平台以後中間沒有坡可以走，變成一階一階）：
// 每一段從脊頂一側斜著走到另一側（離脊線 ±8 m），下降 3.4 m、長約 16 m（約 21%），兩端是轉彎平台
function ridgeTrailPts() {
  const R = EAST.ridge, S = [0]
  for (let i = 1; i < R.length; i++) S.push(S[i - 1] + Math.hypot(R[i][0] - R[i - 1][0], R[i][1] - R[i - 1][1]))
  const L = S.at(-1)
  const at = (s) => { let i = 0; while (i < R.length - 2 && S[i + 1] < s) i++; const t = clamp((s - S[i]) / (S[i + 1] - S[i]), 0, 1), dx = R[i + 1][0] - R[i][0], dz = R[i + 1][1] - R[i][1], l = Math.hypot(dx, dz); return { x: R[i][0] + dx * t, z: R[i][1] + dz * t, y: lerp(R[i][2], R[i + 1][2], t), nx: -dz / l, nz: dx / l } }
  const W = 8, DH = 3.4, pts = [[249.5, 112]]
  let s = 0, y = R[0][2], side = 1   // 第一段往東北（往西南會貼著瀑布頂平台的邊走、被欄杆擋住）
  for (;;) {
    let s2 = s; while (s2 < L && at(s2).y > y - DH) s2 += 0.25
    if (s2 > L - 4) break
    const a = at(s2); pts.push([+(a.x + a.nx * W * side).toFixed(2), +(a.z + a.nz * W * side).toFixed(2)]); side = -side; s = s2; y = a.y
  }
  pts.push([276, 67])
  return pts
}
ALP_SPURS.find((q) => q.name === 'ridge').pts = ridgeTrailPts()   // EAST 在 ALP_SPURS 後面才定義，這裡補上
// 2026-11-12 使用者：岩脊這條下山的步道拆掉（岩脊的山留著當背景），上山只剩瀑布旁的秘境步道
ALP_SPURS.splice(ALP_SPURS.findIndex((q) => q.name === 'ridge'), 1)
function ridgeH(X, Z) {
  const R = EAST.ridge
  if (X < 238 || X > 300 || Z < 52 || Z > 132) return -1e9
  let best = 1e9, y = 0
  for (let i = 0; i < R.length - 1; i++) {
    const [d, t] = segDist(X, Z, R[i][0], R[i][1], R[i + 1][0], R[i + 1][1])
    if (d < best) { best = d; y = lerp(R[i][2], R[i + 1][2], t) }
  }
  const n = 0.5 * (fbm2(X * 0.11 + 31, Z * 0.11 - 6, 3) - 0.5)
  // 脊頂寬 24 m（橫坡 6%）：脊線本身很陡（中段約 90%），之字形的每一段要橫著走過脊頂才降得下去
  return y + n - (best < 12 ? 0.06 * best : 0.72 + 1.4 * (best - 12))
}
function eastShape(X, Z, h) {
  let r = eastShape1(X, Z, h)
  // 岩脊最後才疊上去（第一版放在最前面，被草原的整形壓平了一半）：只往上加；西邊（x < 246）是瀑布頂平台、石階，不碰
  const rh = ridgeH(X, Z)
  if (rh > r) r = lerp(r, rh, smoothstep(246.5, 250.5, X))   // 平台（mesh）到 x 250 為止：地形在平台底下才升上來，接縫在 x 250，不會跟平台面疊在一起閃
  // 湧泉的小岩丘（2026-11-10 ChatGPT Emerald Pool／Silver Apron）：瀑布頂是全區最高點，水要有更高的地方來 → 平台東北角後面一顆 79 m 的圓頂花崗岩，
  // 泉水從頂上冒出、沿西側光滑的岩板（Silver Apron）滑到平台上（yosemite.js 畫水）
  { const [sx, sz] = EAST.spring, d = Math.hypot(X - sx, Z - sz); if (d < 8) { const k = 79.2 - 4.6 * (d / 6) ** 2; if (k > r) r = lerp(r, k, smoothstep(246.5, 250.5, X)) } }
  return r
}
function eastShape1(X, Z, h) {
  for (let i = 0; i < EAST.hides.length; i++) {
    const [hx, hz] = EAST.hides[i], dd = Math.hypot(X - hx, Z - hz)
    if (dd < 4.8) { hideY[i] ??= eastShape0(hx, hz, h); return lerp(hideY[i], eastShape0(X, Z, h), smoothstep(3, 4.8, dd)) }
  }
  return eastShape0(X, Z, h)
}
function eastShape0(X, Z, h) {
  const [a, b, c, d] = EAST.wetBox
  if (X > a - 14 && X < b + 14 && Z > c - 14 && Z < d + 14) {
    const W = EAST.W, sd = wetSD(X, Z), n = fbm2(X * 0.09 + 5, Z * 0.09 - 3, 3) - 0.5
    if (sd < 0) {
      // 2026-11-11 兩座濕地（EAST.marsh／EAST.lagoon）：深度照分區算
      const ell = (o) => Math.hypot((X - o.x) / o.rx, (Z - o.z) / o.rz) + 0.22 * (fbm2(X * 0.15 + o.x, Z * 0.15 + 3, 2) - 0.5)
      let dep
      if (inLagoon(X, Z)) {
        // 夕陽潟湖：大片 0.15～0.4 的淺水（大紅鸛）、岸邊 1:20～1:40 的緩坡；東北岸一片幾公分深的泥灘（琵鷺）；西半邊一個 1.2 m 的深處；筆直的深水道 0.65～0.8
        dep = 0.06 + 0.26 * smoothstep(0, 9, -sd) + 0.06 * n
        dep = lerp(dep, 0.04 + 0.03 * n, 0.85 * smoothstep(13, 4, Math.hypot(X - 14, Z + 100)))
        const LD = EAST.lagoonDeep; dep = Math.max(dep, LD.dep * smoothstep(1, 0.25, ell(LD)))
        const cd = polyDist(X, Z, EAST.creek)[0]; dep = Math.max(dep, (0.65 + 0.15 * n) * smoothstep(3.4, 2.2, cd) * smoothstep(0, 2.5, -sd))
      } else {
        // 翡翠沼澤：一般 0.12～0.3；深水池 1.4、荷葉盆地 0.5、紙莎草角落 0.18、兩條彎彎的水道 0.6；濕草甸大多剛好露出水面，一窪窪積水
        const M = EAST.marsh
        dep = 0.12 + 0.18 * smoothstep(0, 6, -sd) + 0.06 * n
        { const r = ell(M.grebe); dep = Math.max(dep, M.grebe.dep * smoothstep(1, 0.3, r) + 0.3 * smoothstep(1.25, 0.9, r)) }
        { const r = ell(M.lily); dep = lerp(dep, M.lily.dep + 0.08 * n, smoothstep(1.1, 0.8, r)) }
        { const r = ell(M.papyrus); dep = lerp(dep, 0.18 + 0.05 * n, smoothstep(1.1, 0.8, r)) }
        for (const ch of [EAST.channel, EAST.channel2]) { const chd = polyDist(X, Z, ch)[0], chw = 1.1 + 0.6 * fbm2(X * 0.1 + 7, Z * 0.1, 2); dep = Math.max(dep, (0.6 + 0.2 * n) * smoothstep(chw + 0.8, chw, chd) * smoothstep(0, 2, -sd)) }
        for (const md of M.meadows) dep = lerp(dep, md.open ? 0.02 - 0.14 * fbm2(X * 0.32 + md.x, Z * 0.32, 2) : 0.03 - 0.12 * fbm2(X * 0.45 + md.x, Z * 0.45, 2), smoothstep(1.05, 0.7, ell(md)))   // open：開放濕地，積水比較多（一片片幾公分深的水面夾泥和短草）
      }
      let y = W - dep
      // 島：沼澤的長草（veg）、潟湖的是光禿的泥灘沙洲；高出水面 0.1～0.2，邊坡很緩、岸線不規則
      for (const I of EAST.islands) {
        const c = Math.cos(I.rot), s2 = Math.sin(I.rot), dx = X - I.x, dz = Z - I.z, u = (dx * c + dz * s2) / I.rx, v = (-dx * s2 + dz * c) / I.rz
        const r = Math.hypot(u, v) + 0.22 * (fbm2(X * 0.4 + I.x, Z * 0.4, 2) - 0.5)
        y = lerp(y, W + 0.04 + I.h * smoothstep(1, 0.2, r) + 0.04 * n, smoothstep(1.35, 0.95, r))
      }
      return y
    }
    // 岸：西邊原本是 45% 的坡，直接接會在水邊變成一道 10 m 的土崖 → 坡頂壓低成一個往外慢慢變陡的凹坡（山腳堆積坡的樣子）：
    // 離水 5 m 高 0.6、10 m 高 3、20 m 高 11；東邊原地形只有 1～2 m → 14 m 內墊成高於水面 0.3 的土堤（水才不會漫出去）；
    // 水邊 0～3 m 是濕泥岸；40 m 以外回到原地形
    let y = Math.min(h, W + 0.1 + 0.08 * sd + 0.02 * sd * sd)
    if (sd < 14) y = Math.max(y, W + 0.3 + 0.03 * sd + 0.12 * n)
    if (sd < 3) y = lerp(W + 0.06 + 0.1 * sd + 0.08 * n, y, smoothstep(1.5, 3, sd))
    return lerp(y, h, smoothstep(30, 45, sd))
  }
  const [e, f, g, k] = EAST.grassBox
  if (X > e - 12 && X < f + 12 && Z > g - 12 && Z < k + 12) {
    // 草原：原本是 34% 的碎石坡（x 278 的 30 m 到 x 336 的 13 m）→ 壓成一路往東南緩下來的草坡（平均 19%），上面起伏 ±1.5 m 的草丘；
    // 小雲雀那塊再壓平一點。多邊形外 12 m 內接回原地形（西邊接山頂岩坡）
    const sd = grassSD(X, Z)
    const base = 1.6 + 2.2 * smoothstep(0.45, 1.05, lobeRho(LOBES.grass, X, Z)) + 0.8 * clamp((X - EAST.grassBox[0]) / 90, 0, 1)   // 2026-11-11 新位置：平緩的草坡（草丘 ±1.5 疊上去不會低於 0），往邊緣微微升起
    const hum = 1.5 * (fbm2(X * 0.045 + 21, Z * 0.045 + 4, 3) - 0.5) * 2 + 0.4 * (fbm2(X * 0.16, Z * 0.16, 2) - 0.5)
    const L = EAST.lark, lk = 1 - smoothstep(0.8, 1.3, Math.hypot((X - L.x) / L.rx, (Z - L.z) / L.rz))
    const t = base + hum * (1 - 0.7 * lk)
    return lerp(t, h, smoothstep(-2, 12, sd))
  }
  return h
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
  h = eastShape(X, Z, h * AHS); h /= AHS   // 2026-11-10 東部擴建：濕地盆地、草原（世界座標、公尺）
  h = h * AHS   // 2026-11-08：以前 min(…, domeY - 9)（不能頂到玻璃）——圓頂拿掉之後，這個上限在邊界附近把地形壓成一面懸崖；邊界外的草地（outside.js）會從邊界的高度慢慢降下去
  return lerp(gardenEdgeH(X, Z), Math.max(lobeRho(LOBES.wet, X, Z) < 1.4 || lobeRho(LOBES.lagoon, X, Z) < 1.4 ? -3 : 0, h), smoothstep(1.0, 1.25, gardenRho(X, Z)))   // 濕地那塊可以低於 0（水面 -0.25）          // 花園那側從種植坡的高度接起，往裡面慢慢變成山的形狀
}
// 階梯式溪床（step-pool，台灣山溪常見）：水面一段一段是平的（水潭），潭與潭之間是一道落差（小瀑布、跌水）。
// 沿著溪的距離 s：原本的溪床是一條一路往下的折線（sProf）；把它切成很多段，每段一個水潭，
// 潭的水面＝那段下游端的溪床再高一點（潭尾的石頭門檻），潭底往上游挖深（瀑布底下的沖刷潭最深）。
// 陡的地方潭短、落差大；平的地方潭長、落差小（像淺灘）。
const STEP = 0.25
function buildSteps(st, sProf, seed0 = 911, { want0 = 0.55, wantR = 1.1, len0 = 2.6, pin0 = false, riffle = 0, rapid = false } = {}) {
  const S = [0]
  for (let i = 1; i < st.length; i++) S.push(S[i - 1] + Math.hypot(st[i][0] - st[i - 1][0], st[i][1] - st[i - 1][1]))
  const L = S[S.length - 1]
  const lin = (s) => { let i = 0; while (i < S.length - 2 && S[i + 1] < s) i++; return lerp(sProf[i], sProf[i + 1], clamp((s - S[i]) / (S[i + 1] - S[i]), 0, 1)) }
  // 切段：從上游往下走
  let seed = seed0
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  const pools = []
  let s0 = 0
  if (pin0) { pools.push({ s0: 0, s1: S[1], level: sProf[1] + 0.28 }); s0 = S[1] }   // 第一個潭剛好到第 1 點（瀑布湖的出水口：湖面平平地流到缺口）
  while (s0 < L - 0.5) {
    const g = Math.max(0.01, (lin(s0) - lin(Math.min(L, s0 + 4))) / 4)     // 這附近的坡度
    const want = want0 + rnd() * wantR                                      // 想要的落差（公尺）
    let len = clamp(want / g, len0, 11) * (0.85 + rnd() * 0.3)
    if (L - (s0 + len) < 2.5) len = L - s0                                  // 最後一小段併進來
    const s1 = Math.min(L, s0 + len)
    pools.push({ s0, s1, level: lin(s1) + 0.28, riffle: rnd() < riffle })   // riffle：這一段不是一道落差，是一段往下斜的淺灘急流
    s0 = s1
  }
  // 每一道落差（第 k 個潭的上游端）：上一個潭的水面掉到這個潭的水面
  const drops = []
  for (let k = 1; k < pools.length; k++) {
    const h = pools[k - 1].level - pools[k].level
    if (h > 0.12 && !pools[k].riffle) drops.push({ s: pools[k].s0, h, up: pools[k - 1].level, down: pools[k].level })
  }
  const FALL = 0.7   // 水從門檻翻下去的水平距離（越高的落差拋得越遠一點）
  const poolAt = (s) => { let k = 0; while (k < pools.length - 1 && pools[k].s1 < s) k++; return k }
  // 水面：潭裡是平的；過門檻往下彎成拋物線（水翻過石頭）
  const water = (s) => {
    const k = poolAt(s), P = pools[k]
    if (k > 0 && P.riffle) {   // 淺灘：水面從上一段一路斜斜降下來（最多 5 公尺長），不是一道白色的水簾
      // rapid（河）：整段一路斜下去（急流），不是斜 5 公尺就變平潭（2026-11-10 ChatGPT：20% 坡度的山溪應該大多是急流，平潭只佔一成）
      const up = pools[k - 1].level, R = rapid ? 0.95 * (P.s1 - P.s0) : Math.min(5, 0.8 * (P.s1 - P.s0)), t = clamp((s - P.s0) / R, 0, 1)
      return up - (up - P.level) * t
    }
    if (k > 0) {
      const up = pools[k - 1].level, h = up - P.level, f = FALL * (0.6 + 0.25 * Math.min(h, 2))
      if (s < P.s0 + f) { const t = clamp((s - P.s0 + 0.12) / (f + 0.12), 0, 1); return up - h * t * t }
    }
    return P.level
  }
  // 溪床：潭底比水面低；瀑布正下方的沖刷潭最深，往潭尾變淺到門檻
  const bed = (s) => {
    const k = poolAt(s), P = pools[k], t = clamp((s - P.s0) / Math.max(0.1, P.s1 - P.s0), 0, 1)
    if (k > 0 && P.riffle && rapid) return water(s) - 0.38   // 急流：河床跟著斜的水面，淺淺一層（ChatGPT：急流水深 0.1～0.35 m）
    const h = k > 0 ? pools[k - 1].level - P.level : 0
    let d = 0.3 + 0.35 * (1 - t) + Math.min(1.1, 0.35 + h * 0.4) * Math.exp(-(s - P.s0) / 1.6)
    if (k > 0 && s < P.s0 + 0.35) d = Math.min(d, lerp(pools[k - 1].level - 0.3 - P.level + 0.3, d, clamp((s - P.s0) / 0.35, 0, 1)))   // 門檻那一點：上一個潭的底
    return P.level - d
  }
  // 預先取樣（地形每一格都要查）
  const n = Math.ceil(L / STEP) + 1, W = new Float32Array(n), B = new Float32Array(n)
  for (let i = 0; i < n; i++) { W[i] = water(i * STEP); B[i] = bed(i * STEP) }
  Object.assign(st, { S, len: L, pools, drops, W, B })
  st.water = (s) => sampleS(st.W, s); st.bed = (s) => sampleS(st.B, s)
  st.sAt = (x, z) => { const [, i, t] = polyDist(x, z, st); return st.S[i] + t * (st.S[i + 1] - st.S[i]) }
  st.dist = (x, z) => polyDist(x, z, st)[0]
  st.halfAt = st.wide ? (s) => clamp(2.5 + 1.5 * fbm2(s * 0.025, 3.3, 2) + 0.6 * fbm2(s * 0.12, 7.7, 2) - 0.9 * smoothstep(16, 2, s), 1.25, 4) : () => 1.25   // 半寬：低頻起伏；2026-11-10 出水口那段改窄（以前最寬，貼著營地步道，岸墊不起來、河面浮在步道旁）（fbm2 是 ±0.6 的有號雜訊，不是 0～1）
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
  {
    const A = tr[ALP_BRIDGE.a], B = tr[ALP_BRIDGE.a + 2], L = Math.hypot(B[0] - A[0], B[1] - A[1]), ux = (B[0] - A[0]) / L, uz = (B[1] - A[1]) / L
    for (const [t, out, P, py, nxt] of [[0, -1, A, prof[ALP_BRIDGE.a], tr[ALP_BRIDGE.a - 1]], [1, 1, B, prof[ALP_BRIDGE.a + 2], tr[ALP_BRIDGE.a + 3]]]) {
      const ox = ux * out, oz = uz * out, sx = -oz, sz = ox, HWL = 1.6
      const X = [P[0] + ox * 1.4, P[1] + oz * 1.4]
      let ex = nxt[0] - X[0], ez = nxt[1] - X[1]; const el = Math.hypot(ex, ez); ex /= el; ez /= el
      const pts = []
      // 橋軸那塊只到 1.7 m（再長會在出口外側凸出一角）；出口那塊往回多 0.4 m，接成一塊
      for (const s of [0, 1.7]) for (const l of [-HWL, HWL]) pts.push([P[0] + ox * s + sx * l, P[1] + oz * s + sz * l])
      for (const s of [-0.4, 1.8]) for (const l of [-HWL, HWL]) pts.push([X[0] + ex * s - ez * l, X[1] + ez * s + ex * l])
      BRIDGE_HEADS.push({ t, P, Y0: py + 0.06, o: [ox, oz], side: [sx, sz], X, e: [ex, ez], exit: [X[0] + ex * 1.8, X[1] + ez * 1.8], next: nxt, hull: hull2(pts) })
    }
  }
  for (const sp of ALP_SPURS) {   // 支線：從主步道那一點的高度開始，一樣坡度最多 22%
    const pp = sp.pts.map(([x, z]) => alpBase(x, z)); pp[0] = sp.y0 ?? (sp.world ? alpBase(...sp.pts[0]) : prof[sp.from])
    const k = sp.k ?? (sp.join ? 0.26 : 0.22), seg = (i) => Math.hypot(sp.pts[i][0] - sp.pts[i - 1][0], sp.pts[i][1] - sp.pts[i - 1][1])
    for (let i = 1; i < pp.length; i++) pp[i] = i < (sp.flat ?? 0) ? pp[0] : clamp(pp[i], pp[i - 1] - seg(i) * k, pp[i - 1] + seg(i) * k)   // flat：前幾點跟起點一樣高（貼著花園邊走的那段，不能比花園地面高）
    // 2026-11-13 使用者（瀑布旁步道）「不然突然變高 很怪」：岔出去的支線起點高度本來是直接取當地地形，
    // 但岔路口的地已經被母步道壓平了（低 0.5 m 以上）→ 支線一開頭就得追回那個高差，1 m 內爬 1.8 m，變成一道牆。
    // startOn：起點高度改成取母步道最近一點的高度，再從起點往下游重新夾坡度，整段爬升攤平到整條支線上
    if (sp.startOn) {
      const o = ALP_SPURS.find((q) => q.name === sp.startOn), e = sp.pts[0]
      let best = 1e9, by = o.prof[0]
      for (let i = 1; i < o.pts.length; i++) { const [ax, az] = o.pts[i - 1], [bx, bz] = o.pts[i], dx = bx - ax, dz = bz - az, t = clamp(((e[0] - ax) * dx + (e[1] - az) * dz) / (dx * dx + dz * dz), 0, 1), d = Math.hypot(e[0] - ax - dx * t, e[1] - az - dz * t); if (d < best) { best = d; by = lerp(+o.prof[i - 1], +o.prof[i], t) } }
      const raw = sp.pts.map(([x, z]) => alpBase(x, z))
      raw[0] = by
      for (let i = 1; i < raw.length; i++) raw[i] = clamp(raw[i], raw[i - 1] - seg(i) * k, raw[i - 1] + seg(i) * k)
      for (let i = 0; i < pp.length; i++) pp[i] = raw[i]
    }
    // 2026-11-14 minY：某幾點至少要多高（null＝不管）。第一個有指定的點之前，從起點照路長線性爬上去（不讓坡度上限把路壓在低地）
    if (sp.minY) {
      const first = sp.minY.findIndex((v) => v != null), cum = [0]; for (let i = 1; i < pp.length; i++) cum.push(cum[i - 1] + seg(i))
      for (let i = 1; i < first; i++) pp[i] = lerp(pp[0], sp.minY[first], cum[i] / cum[first])
      for (let i = first; i < pp.length; i++) if (sp.minY[i] != null) pp[i] = Math.max(pp[i], sp.minY[i])
    }
    if (sp.join) {   // 終點要剛好接上那條支線的終點：從終點往回再夾一次坡度
      pp[pp.length - 1] = ALP_SPURS.find((q) => q.name === sp.join).prof.at(-1)
      for (let i = pp.length - 2; i > 0; i--) pp[i] = clamp(pp[i], pp[i + 1] - seg(i + 1) * k, pp[i + 1] + seg(i + 1) * k)
    }
    if (sp.endOn) {   // 終點接在另一條支線上：高度用那條支線在最近一點的高度，再從終點往回夾坡度
      const o = ALP_SPURS.find((q) => q.name === sp.endOn), e = sp.pts.at(-1)
      let bi = 0; o.pts.forEach((q, i) => { if (Math.hypot(q[0] - e[0], q[1] - e[1]) < Math.hypot(o.pts[bi][0] - e[0], o.pts[bi][1] - e[1])) bi = i })
      pp[pp.length - 1] = o.prof[bi]
      for (let i = pp.length - 2; i > 0; i--) pp[i] = clamp(pp[i], pp[i + 1] - seg(i + 1) * k, pp[i + 1] + seg(i + 1) * k)
    }
    sp.prof = pp
  }
  CABIN.y = ALP_SPURS.find((q) => q.name === 'cabin').prof.at(-1)
  CAMP.y = ALP_SPURS.find((q) => q.name === 'camp').prof.at(-1)
  const gorgeK = (x, z) => Math.exp(-((Math.hypot(x - ALP_GORGE.x, z - ALP_GORGE.z) / ALP_GORGE.r) ** 2))
  const st = ALP_STREAM, sProf = st.map(([x, z], i) => alpBase(x, z) - 1.3 - ALP_GORGE.depth * gorgeK(x, z))
  for (let i = 1; i < sProf.length; i++) sProf[i] = Math.min(sProf[i], sProf[i - 1] - 0.3)     // 溪床一路往下
  sProf[sProf.length - 1] = Math.min(sProf[sProf.length - 1], ALP_POND.water - 0.3)
  // 2026-11-10 使用者：石頭瀑布落下來的水最後插出地形 → 量了：溪最後兩點一個在湖岸外 6.4 公尺（高 8.8）、一個在湖裡，中間直線內插，
  // 走到湖岸時溪面還有 4.6 公尺高，可是湖的盆地（半徑＋2.5 公尺內）已經把地面挖低到 0 左右：最後幾個潭浮在地面上 1～2 公尺。
  // 在湖岸外 0.5 公尺插一個點、高度＝湖面；再往上游把坡度夾在 0.5 以內（落差在進湖前分好幾段跌完，到湖岸剛好是湖面）
  {
    const P = ALP_POND, n = st.length, a = st[n - 2], b = st[n - 1], R = P.r + 0.5
    let lo = 0, hi = 1
    for (let it = 0; it < 30; it++) { const m = (lo + hi) / 2, d = Math.hypot(a[0] + (b[0] - a[0]) * m - P.x, a[1] + (b[1] - a[1]) * m - P.z); if (d > R) lo = m; else hi = m }
    st.splice(n - 1, 0, [a[0] + (b[0] - a[0]) * lo, a[1] + (b[1] - a[1]) * lo])
    sProf.splice(n - 1, 0, P.water - 0.3)
    for (let i = n - 2; i >= 0; i--) sProf[i] = Math.min(sProf[i], sProf[i + 1] + 0.5 * Math.hypot(st[i + 1][0] - st[i][0], st[i + 1][1] - st[i][1]))
  }
  ALP_STREAM.prof = sProf
  // 2026-11-10 使用者：一開始那條溪也檢查 → 162 m 落差 46 m（坡度 28%，比河還陡），以前一段段平潭像一條水溝；跟河一樣大多是一路斜下去的急流
  buildSteps(st, sProf, 911, { riffle: 0.7, rapid: true })
  // 瀑布湖水面：湖岸一圈原地形最低的地方再低 0.5（不會溢出去）
  { const LK = YOSE.lake; let lo = 1e9; for (let a = 0; a < 48; a++) lo = Math.min(lo, alpBase(LK.x + Math.cos(a / 48 * TAU) * LK.rx * 1.05, LK.z + Math.sin(a / 48 * TAU) * LK.rz * 1.05)); LK.water = lo - 0.5 }
  {
    const rv = ALP_RIVER, rp = rv.map(([x, z]) => alpBase(x, z) - 1.3)
    rp[0] = YOSE.lake.water + 0.1
    // 河過步道：找每條路（主步道、支線）跟河的交點 → 石拱橋。步道是切進坡裡的（比原地形低），河在交點前後要壓到步道底下 1.6 公尺，
    // 不然河比路還高、橋要蓋得比路高好幾公尺（2026-11-11 營地支線那座差 4 公尺，走不上去）
    const segX = (a, b, c, d) => { const r = [b[0] - a[0], b[1] - a[1]], q = [d[0] - c[0], d[1] - c[1]], den = r[0] * q[1] - r[1] * q[0]; if (Math.abs(den) < 1e-9) return null; const t = ((c[0] - a[0]) * q[1] - (c[1] - a[1]) * q[0]) / den, u = ((c[0] - a[0]) * r[1] - (c[1] - a[1]) * r[0]) / den; return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? [t, u] : null }
    const paths = [{ pts: tr, prof }, ...ALP_SPURS.map((sp) => ({ pts: sp.pts, prof: sp.prof }))], XS = []
    for (const P of paths) for (let i = 0; i < P.pts.length - 1; i++) for (let j = 0; j < rv.length - 1; j++) {
      const hit = segX(P.pts[i], P.pts[i + 1], rv[j], rv[j + 1]); if (!hit) continue
      const [t] = hit, x = lerp(P.pts[i][0], P.pts[i + 1][0], t), z = lerp(P.pts[i][1], P.pts[i + 1][1], t)
      if (XS.some((b) => Math.hypot(b.x - x, b.z - z) < 3)) continue   // 兩條路共用的那段只算一次
      const dx = P.pts[i + 1][0] - P.pts[i][0], dz = P.pts[i + 1][1] - P.pts[i][1], l = Math.hypot(dx, dz), py = lerp(P.prof[i], P.prof[i + 1], t)
      XS.push({ x, z, j, py, k: (P.prof[i + 1] - P.prof[i]) / l, dir: [dx / l, dz / l] })   // k：步道的坡度（橋面跟著斜，兩頭才接得上路）
      if (j > 1) rp[j] = Math.min(rp[j], py - 1.6)   // 第 0、1 點（湖裡、湖岸缺口）＝湖面，不能壓（壓了湖面會浮在出水口的河道上）
      rp[j + 1] = Math.min(rp[j + 1], py - 1.6)
    }
    // 壓低的地方往上游攤開（坡度最多 28%）：不然一個點突然掉 8 公尺，水面是一條扭來扭去的白帶
    for (let i = rp.length - 2; i >= 1; i--) rp[i] = Math.min(rp[i], rp[i + 1] + 0.28 * Math.hypot(rv[i + 1][0] - rv[i][0], rv[i + 1][1] - rv[i][1]))
    rp[0] = YOSE.lake.water - 0.25; rp[1] = YOSE.lake.water - 0.27   // 出水口：湖岸缺口那一點以前，河面＝湖面（第一個潭的水面＝溪床＋0.28），過了缺口才往下跌
    for (let i = 2; i < rp.length; i++) rp[i] = Math.min(rp[i], rp[i - 1] - 0.3)
    // 河口（最後兩點在湖裡）：舊的終點是消能潭（水面＝湖面），往湖裡河床降到 -0.95（水深約 0.87），不留土堤
    const nR = rp.length
    rp[nR - 3] = Math.min(rp[nR - 3], ALP_POND.water - 0.3); rp[nR - 2] = ALP_POND.water - 0.7; rp[nR - 1] = ALP_POND.water - 0.87
    rv.prof = rp
    buildSteps(rv, rp, 4242, { want0: 0.25, wantR: 0.5, len0: 2.0, pin0: true, riffle: 0.85, rapid: true })   // 河比溪陡（湖口往下一路跌）：落差小、次數多，才不會一道道白色的牆
    {
      // 舊終點往下游：水面＝湖面＋0.008（河面延伸進湖，跟湖面幾乎同高）；河床平順接到湖底；半寬放到 4.2（河口寬約 8.4 m）
      const sEnd = rv.S[nR - 3], sL = rv.S[nR - 1], bEnd = rv.bed(sEnd - 0.5)
      for (let i = 0; i < rv.W.length; i++) {
        const sv = i * STEP
        if (sv < sEnd - 1.5) continue
        const t = smoothstep(sEnd - 1.5, sEnd + 0.5, sv)
        rv.W[i] = lerp(rv.W[i], ALP_POND.water + 0.008, t)
        rv.B[i] = Math.min(rv.B[i], lerp(Math.min(bEnd, ALP_POND.water - 0.9), ALP_POND.water - 0.95, smoothstep(sEnd, sL, sv)) * t + rv.B[i] * (1 - t))
      }
      // 2026-11-10 使用者：河口那道水「改得很不好、要 extremely realistic」→ 以前是 8 m 掉 6 m 的一條斜坡急流（像水泥溢洪道，被切成幾層平潭）。
      // 改成真的瀑布（ChatGPT 河流規格：主河水簾上緣 4～6 m、底部白水、深的消能潭）：
      //   上游 7.4 m 一段亂石急流（掉 1 m）→ 一道微彎的岩唇 → 自由落下約 5 m（水平拋出 1.4 m）→ 湖口的消能潭（深 1.4 m）→ 河口進湖
      const sA = sEnd - 11, sLip = sEnd - 3.6, THROW = 1.4, Wl = ALP_POND.water + 0.008
      const WA = rv.water(sA), WL = WA - 1.0
      for (let i = 0; i < rv.W.length; i++) {
        const sv = i * STEP
        if (sv < sA) continue
        let w, b
        if (sv < sLip) {
          const t = (sv - sA) / (sLip - sA)
          w = WA - 1.0 * Math.pow(t, 1.25) + 0.05 * Math.sin(t * 19) * t * (1 - t) * 4   // 急流：越近岩唇越急，水面有幾道小坎
          b = w - 0.3 - 0.08 * Math.sin(t * 13 + 1)
        } else if (sv < sLip + THROW) {
          const t = (sv - sLip) / THROW
          w = WL - (WL - Wl) * t * t                                                       // 拋物線落下
          b = Math.min(w - 0.4, WL - 0.3 - (WL - Wl + 0.9) * Math.pow(t, 0.6))              // 水簾後面是垂直的岩壁（往下挖到消能潭底）
        } else {
          w = Wl
          b = lerp(Wl - 1.45, ALP_POND.water - 0.95, smoothstep(sLip + THROW + 0.5, sL, sv))   // 消能潭：落水點最深
        }
        rv.W[i] = w; rv.B[i] = b
      }
      rv.drops = rv.drops.filter((d) => d.s < sA - 1)
      rv.drops.push({ s: sLip, h: WL - Wl, up: WL, down: Wl, fall: true })
      const h0 = rv.halfAt
      // 岩唇那段收窄成 5.4 m 寬的水簾；落下去之後在消能潭、河口慢慢放寬到 8.4 m
      rv.halfAt = (sv) => sv < sLip + 0.5 ? lerp(h0(sv), 2.7, smoothstep(sA, sLip - 2.5, sv)) : lerp(2.7, 4.2, smoothstep(sLip + 0.5, sEnd + 1.5, sv))
      rv.mouthS = sEnd; rv.lipS = sLip
    }
    // 2026-11-13 使用者（湖往石拱橋看）「瀑布橋這邊請做好 接好」：出水口那段河只有 4 m 寬，湖岸那圈 +18 cm 的岸剩一條灰色土舌把湖跟河隔開 →
    // 出湖的前 7.5 m 河面放寬（最多 +2.2 m 半寬），湖直接開口變成河；到橋那裡（s≈9）已經回到原本的寬度，拱橋不用變
    { const h1 = rv.halfAt; rv.halfAt = (sv) => h1(sv) + 2.2 * (1 - smoothstep(2, 7.5, sv)) }
    for (const c of XS) {   /* 2026-11-14 使用者：「先拿掉橋，先把陸地溪流修好」→ 瀑布湖出水口下面那座石拱橋先拆 */
      const sc = rv.sAt(c.x, c.z); RIVER_BRIDGES.push({ x: c.x, z: c.z, dir: c.dir, k: c.k, y: Math.max(c.py, rv.water(sc) + (Math.hypot(c.x - 180, c.z - 62.3) < 6 ? 2.3 : 3.0)   /* 2026-11-14 使用者「都太貼水面」：2.1 → 3.0，拱洞露出水面；瀑布下那座離營地只有 9 m，2.3 m 坡才不會太陡 */),   /* 2026-11-13 使用者：橋再高一點（離水 1.2 → 2.1 m） */ half: Math.max(4.2, rv.halfAt(sc) + 2.4), hw: 1.3, river: rv.halfAt(sc) }) }   // 橋跨過整條河（寬的河橋就長）
  }
  // 斷面（參考台灣山溪的影片）：水邊不是直的——寬度用 2D 雜訊，兩岸不對稱、一凹一凸；
  // 水裡是 U 形的潭底；岸是緩緩爬上去的坡，坡上有一塊塊凸起的石頭（不是一面平滑的牆）
  function carve(st, x, z, h, gk) {
    const [ds, si, stt] = polyDist(x, z, st)
    if (ds > (st.wide ? 20 : 14)) return [h, ds]
    const sx = st[si + 1][0] - st[si][0], sz = st[si + 1][1] - st[si][1], lat = ds * (sx * (z - st[si][1]) - sz * (x - st[si][0]) >= 0 ? 1 : -1)
    const ss_ = st.S[si] + stt * (st.S[si + 1] - st.S[si]), sAdj = ss_ + streamLatOff(ss_, lat)
    const bed = st.bed(sAdj), wl0 = st.water(sAdj)
    // 落差旁邊的岸要比「上游那個潭」高（以前岸只比這一點的水面高，落差處水簾兩側沒東西擋，像懸空的白帶）
    const wl = st.wide ? Math.max(wl0, st.water(sAdj - 0.8), st.water(sAdj - 1.6)) : wl0
    const half = st.wide ? st.halfAt(ss_) + 0.5 * fbm2(x * 0.3 + 5.1, z * 0.3 - 2.7, 3) : Math.max(0.9, 1.25 + 1.5 * (fbm2(x * 0.2 + 5.1, z * 0.2 - 2.7, 3) - 0.5) + 0.35 * gk)
    // 寬的河：河床凹凸不平（ChatGPT：0.16／0.07 兩層雜訊）；水邊 1.5 公尺礫石灘，再一段亂石坡，半寬＋7 公尺接回森林
    // 2026-11-10 河床起伏 ±0.4 → ±0.15：以前一塊塊河床露出水面，側面看是「一個個水潭＋乾的溪床」
    const bedN = st.wide ? 0.16 * fbm2(ss_ * 0.18, lat * 0.25, 2) * 0.6 + 0.07 * fbm2(ss_ * 0.65, lat * 0.8, 2) * 0.6 : 0
    const inWater = bed + bedN + (wl0 - bed - bedN) * smoothstep(0, half, ds) ** 2
    // 河口在湖裡那段：只往下挖河床，不墊岸（以前在湖裡墊出一道比水面高的土堤）
    if (st.wide && Math.hypot(x - ALP_POND.x, z - ALP_POND.z) < ALP_POND.r - 1.5) return [Math.min(h, lerp(inWater, h, smoothstep(half, half + 2.5, ds))), ds]
    const lump = (st.wide ? 1.4 : 1.1) * Math.max(0, fbm2(x * 0.42 - 3.3, z * 0.42 + 8.1, 3) - 0.35) * smoothstep(half + (st.wide ? 1.5 : 0), half + (st.wide ? 2.7 : 1.2), ds) * smoothstep(st.wide ? 14 : 10, st.wide ? 7 : 4, ds)
    const bank = (st.wide ? lerp(wl + 0.12 + 0.25 * smoothstep(half, half + 1.5, ds), h, smoothstep(half + 1.5, half + 7, ds)) : lerp(wl + 0.1, h, smoothstep(half + 0.4, Math.max(6.5, 10 - 3 * gk), ds))) + lump
    h = ds < half ? inWater : Math.min(h + lump, lerp(inWater, bank, smoothstep(half, half + 0.9, ds)))
    if (ds > half) h = Math.max(h, Math.min(bank, wl + 0.1 + (ds - half) * 0.6))   // 岸一定比水面高（水才不會溢出去）
    return [h, ds]
  }
  for (let j = 0; j < AG.nz; j++) for (let i = 0; i < AG.nx; i++) {
    const x = AG.x0 + i * AG.cell, z = AG.z0 + j * AG.cell, k = j * AG.nx + i
    let h = alpBase(x, z)
    // 溪谷：V 字形，越靠溪越低（主溪＋2026-11-11 瀑布湖流出來的河，同一套挖法）
    const gk = gorgeK(x, z)
    let ds0
    ;[h, ds0] = carve(ALP_STREAM, x, z, h, gk)
    // 瀑布湖：湖裡往中間挖深（最深 3 公尺），湖岸一圈一定比水面高（水不會溢出去），岸再慢慢接回原地形
    {
      const LK = YOSE.lake, e = Math.hypot((x - LK.x) / LK.rx, (z - LK.z) / LK.rz)
      if (e < 1.6) {
        if (e < 1) h = Math.min(h, LK.water - 0.25 - 2.8 * (1 - e * e))
        else h = Math.max(lerp(LK.water + 0.18, h, smoothstep(1.0, 1.55, e)), Math.min(h, LK.water + 0.18 + (e - 1) * 3))
      }
    }
    let ds1
    ;[h, ds1] = carve(ALP_RIVER, x, z, h, 0)
    aStream[k] = Math.min(ds0, ds1 - (ALP_RIVER.halfAt(ALP_RIVER.sAt(x, z)) - 1.25))   // 河寬的部分扣掉：「離溪多遠」照水邊算（樹、草讓開用）
    // 水池
    const dp = Math.hypot(x - ALP_POND.x, z - ALP_POND.z)
    h = lerp(ALP_POND.water - 1.1, h, smoothstep(ALP_POND.r * 0.6, ALP_POND.r + 2.5, dp))
    // 2026-11-10 河口那一帶：湖底照「湖岸 4 m 就到 1 m 深」挖（以前原本的高地只被拉低一部分，在水下留一圈淺灘土堤，跟荷花台是同一塊）
    { const mk = smoothstep(11, 6, Math.hypot(x - 117, z + 30.5)); if (mk > 0) h = lerp(h, Math.min(h, lerp(ALP_POND.water - 1.05, h, smoothstep(ALP_POND.r - 1.5, ALP_POND.r + 2.5, dp))), mk) }
    // 步道：鋪平（吊橋那段不鋪，橋下是溪谷）
    const [dt, ti, tt] = polyDist(x, z, tr, (i) => i === ALP_BRIDGE.a || i === ALP_BRIDGE.a + 1)
    const py = lerp(prof[ti], prof[ti + 1], tt)
    const hRiver = h   // 石橋底下保留河道（下面路面攤平之後再挖回來）
    h = lerp(py, h, smoothstep(1.4, 7.5, dt))   // 步道兩側的切坡放緩（3.2 時像一面牆；2026-11-10 ChatGPT：路肩跟山坡交界太硬 → 5→7.5 公尺）
    // 2026-11-10 使用者：往山頂那段（第 11～12 段）步道左手邊一座小山丘擋住視野（步道夾在兩邊高起來的地形中間）→ 左手邊壓低到步道高度＋0.5，6～13 公尺慢慢接回原地形
    if (ti === 11 || ti === 12 || (ti === 13 && tt < 0.3)) {
      const [sx, sz] = tr[ti], [ex, ez] = tr[ti + 1], cr = (ex - sx) * (z - sz) - (ez - sz) * (x - sx)
      if (cr < 0 && h > py + 0.5) h = lerp(py + 0.5, h, smoothstep(6, 13, dt))
    }
    let dAll = dt
    for (const sp of ALP_SPURS) {   // 支線：窄一點；走到底那一小塊空地攤平
      const [d2, i2, t2] = polyDist(x, z, sp.pts)
      // landings：每段兩端各 1.7 m 是平的（轉彎平台），坡只在中間（第一版平台跟坡的過渡擠在 1.7 m 裡，每個平台邊都鼓起 50～70%）
      let tt = t2
      if (sp.landings) { const Ls = Math.hypot(sp.pts[i2 + 1][0] - sp.pts[i2][0], sp.pts[i2 + 1][1] - sp.pts[i2][1]); tt = clamp((t2 * Ls - (i2 > 0 ? 1.7 : 0)) / Math.max(1, Ls - (i2 > 0 ? 1.7 : 0) - (i2 + 1 < sp.pts.length - 1 ? 1.7 : 0)), 0, 1) }
      const y2 = lerp(sp.prof[i2], sp.prof[i2 + 1], tt)
      const e = sp.pts[sp.pts.length - 1], de = Math.hypot(x - e[0], z - e[1]), C0 = sp.clear ?? 3.5, C1 = C0 + 4.5   // clear：盡頭空地多大（營地比較大）
      if (d2 < 6) h = lerp(y2, h, smoothstep(1.0, 4, d2))
      // 2026-11-10 ChatGPT：髮夾彎要有平台（至少 2.5×3 m、坡度 <5%），平台跟步道之間 1～2 m 的過渡 → 每個轉彎點半徑 1.7 m 攤平成轉彎點的高度，1.7～3.4 m 接回步道。
      // 地形本身就是碰撞面（supportAt 查高度表），改地形＝視覺和走路一起改
      if (sp.landings && d2 < 6) for (let i = 1; i < sp.pts.length - 1; i++) { const dv = Math.hypot(x - sp.pts[i][0], z - sp.pts[i][1]); if (dv < 3.4) h = lerp(sp.prof[i], h, smoothstep(1.7, 3.4, dv)) }
      if (!sp.join && !sp.noClear && de < C1 + 1) h = lerp(sp.prof[sp.prof.length - 1], h, smoothstep(C0, C1, de))
      dAll = Math.min(dAll, d2 + 0.35)   // 小路畫得窄一點（alpineTrailDist 用來畫路面、樹讓開）
    }
    aTrail[k] = dAll
    // 2026-11-13 使用者「橋開始跟尾巴…往外翹、可以直接加寬道路」：石拱橋兩頭的路畫成喇叭口——橋頭外 1.5 m 內路面半寬 2.5 m（石欄往外撇的那段在路邊），往外 7 m 收回原本的寬
    for (const b of RIVER_BRIDGES) {
      const ax = x - b.x, az = z - b.z, out = Math.abs(ax * b.dir[0] + az * b.dir[1]) - (b.half + 0.3), lat = Math.abs(-ax * b.dir[1] + az * b.dir[0])
      if (out < -1 || out > 7 || lat > 4) continue
      const wd = lerp(2.5, 1.3, smoothstep(1.5, 7, out))
      aTrail[k] = Math.min(aTrail[k], Math.max(0, lat - (wd - 1.3)))
    }
    for (const b of RIVER_BRIDGES) {   // 橋下：河道照挖（路面攤平會把河填掉），兩端 4 公尺外接回路面；橋頭的路面接到橋面高
      const ax = x - b.x, az = z - b.z, along = ax * b.dir[0] + az * b.dir[1], lat = Math.abs(-ax * b.dir[1] + az * b.dir[0])
      if (lat < b.hw + 6 && Math.abs(along) < b.half + 9) {   /* 2026-11-13 使用者「斜坡再順一點」：橋頭的引道拉長到 8 m、兩側 4 m 慢慢接回地面（以前 3.6 m、路兩邊直直掉下去像一道土堤） */
        const k2 = smoothstep(b.half - 1.6, b.half + 0.2, Math.abs(along))
        // 2026-11-13 使用者「橋旁邊的石頭都懸空」：以前橋下整條 4 m 寬都挖回原本的河谷，水面只有河那麼寬，兩邊空出一道乾的溝、石頭懸在溝上 →
        // 只挖河本身（水面外 0.3 m），往外照 1.3:1 的坡接回路面
        const RVb = ALP_RIVER, sb = RVb.sAt(x, z), over = Math.max(0, RVb.dist(x, z) - RVb.halfAt(sb) - 0.3), hDig = Math.max(hRiver, Math.min(h, RVb.water(sb) + 0.1 + over * 1.3))
        h = lerp(Math.min(h, hDig), h, k2)
        // 2026-11-13 使用者「瀑布橋這邊請做好 接好」：拱洞（橋中心 ±(河半寬+0.6)）裡一半是乾的岸——河中線偏一邊、岸比水面高 →
        // 拱洞整個寬度、橋身前後各 2 m 挖到水面下 0.3 m，水從整個拱洞底下流過；再往外 2 m 接回原本的岸
        { const sp = (b.river ?? 2.3) + 0.6, ka = smoothstep(sp + 0.5, sp - 0.2, Math.abs(along)) * smoothstep(b.hw + 4, b.hw + 2, lat); if (ka > 0) h = Math.min(h, lerp(h, RVb.water(sb) - 0.3, ka)) }
        { const wl = smoothstep(b.hw + 2.9, b.hw + 1.2, lat), wa   /* 2026-11-13 使用者（橋頭俯視圖圈河岸）「sand too high」：路兩側墊高的範圍收窄——只墊路面（半寬 2.5 m），外面 1.7 m 接回原本的岸，不再在河邊堆一道沙堤 */ = smoothstep(b.half + 8.5, b.half + 1.0, Math.abs(along)); if (wl > 0 && wa > 0) h = lerp(h, b.y + b.k * along - 0.02, wa * wl * k2) }   // 橋頭外 1 公尺內路面＝橋面（石板鋪出去、不露一片懸空的板子）
      }
    }
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
        const hPre = h
        h = Math.min(h, lerp(under, h, smoothstep(BRIDGE_DIM.hw + 0.8, BRIDGE_DIM.hw + 14, db)))
        // 2026-11-10：溪邊原本比水面高的岸，不能被挖到比水面低（吊橋底下溪面兩邊浮起 1.5 公尺）
        if (ds0 < 4) { const wS = ALP_STREAM.water(ALP_STREAM.sAt(x, z)); if (hPre > wS) h = Math.max(h, Math.min(hPre, wS + 0.12)) }
      }
    }
    // 2026-11-11 橋頭平台底下：地面壓到平台木板底下 8 公分（平台外 1.5 公尺慢慢接回來）
    for (const hd of BRIDGE_HEADS) if (inHull(x, z, hd.hull, 1.6)) {
      let dmin = 0
      for (let q = 0; q < hd.hull.length; q++) { const [ax, az] = hd.hull[q], [bx, bz] = hd.hull[(q + 1) % hd.hull.length], ex = bx - ax, ez = bz - az, L = Math.hypot(ex, ez); dmin = Math.min(dmin === 0 ? 1e9 : dmin, (ex * (z - az) - ez * (x - ax)) / L) }
      h = Math.min(h, lerp(hd.Y0 - 0.08, h, smoothstep(0, -1.5, dmin)))
    }
    // 山頂：步道終點一小塊平地（2026-11-08 拿掉觀景台，不再削一大片平台）；終點旁邊的山頭不能比終點高太多，步道才不會走在溝裡
    const pe = tr[tr.length - 1], dpk = Math.hypot(x - pe[0], z - pe[1])
    h = lerp(prof[prof.length - 1] + 0.02, h, smoothstep(2.5, 5, dpk))
    {
      // 2026-11-12 使用者：小木屋比地形高。原因：這一步把終點 14 公尺內的地面壓低，連小木屋的地基和上去的那段支線一起削掉（門口低 0.7 公尺）→ 小木屋四周、支線路面不壓
      const hKeep = h, cs = ALP_SPURS.find((q) => q.name === 'cabin')
      h = lerp(Math.min(h, prof[prof.length - 1] + 0.3 + 0.12 * Math.max(0, dpk - 3)), h, smoothstep(6, 14, dpk))
      const keep = Math.max(smoothstep(CABIN.R + 4.4, CABIN.R, Math.hypot(x - CABIN.x, z - CABIN.z)), smoothstep(4, 1.0, polyDist(x, z, cs.pts)[0]))
      h = lerp(h, hKeep, keep)
    }
    // 2026-11-10 使用者截圖（營地旁看瀑布）：河面、湖面浮在半空、從坡上翹出來——營地和支線步道攤平時把河岸、湖岸削得比水面低（最多低 3.9 公尺）。
    // 最後再保一次：水邊 0.8 公尺內的岸至少比水面高 0.12，往外最陡 1:1.1 接回地形（像一道亂石堤）；橋頭、步道路面本身不墊
    {
      let nearBridge = false
      for (const b of RIVER_BRIDGES) { const ax = x - b.x, az = z - b.z; const lt = Math.abs(-ax * b.dir[1] + az * b.dir[0]), al = Math.abs(ax * b.dir[0] + az * b.dir[1]); if ((lt < b.hw + 0.8 && al < b.half + 1.5) || (lt < b.hw + 4 && al < (b.river ?? 2.3) + 1.1)) nearBridge = true }   /* 拱洞前後挖低的那塊也不墊 */   // 只有橋面那條（以前範圍太大，出水口兩岸整片被跳過）
      const onPath = smoothstep(1.3, 2.4, dAll)
      if (!nearBridge) {
        const [dr, ri, rt] = polyDist(x, z, ALP_RIVER)
        const sR = ALP_RIVER.S[ri] + rt * (ALP_RIVER.S[ri + 1] - ALP_RIVER.S[ri]), hw = ALP_RIVER.halfAt(sR) + 0.35
        if (dr > hw && dr < hw + 9 && sR > 0.5 && Math.hypot(x - ALP_POND.x, z - ALP_POND.z) > ALP_POND.r - 1) {   // 湖裡不墊（河口延伸進湖那段，以前墊出一圈水下土堤）
          const wl = Math.max(ALP_RIVER.water(sR), ALP_RIVER.water(sR - 0.8), ALP_RIVER.water(sR - 1.6))
          const need = wl + 0.12 - Math.max(0, dr - hw - 0.8) * 1.1
          if (h < need) h = lerp(h, need, onPath)
        }
        // 2026-11-10 山上那條溪也一樣（吊橋底下整段挖低、步道攤平都會把岸削到比水面低，溪面兩邊浮起來）；湖的盆地裡不管
        {
          const SA = ALP_STREAM, [d2, i2, t2] = polyDist(x, z, SA), s2 = SA.S[i2] + t2 * (SA.S[i2 + 1] - SA.S[i2]), h2 = 2.0
          if (d2 > h2 && d2 < h2 + 7 && Math.hypot(x - ALP_POND.x, z - ALP_POND.z) > ALP_POND.r + 0.5) {
            const wl = Math.max(SA.water(s2), SA.water(s2 - 0.8))
            const need = wl + 0.12 - Math.max(0, d2 - h2 - 0.6) * 1.1
            if (h < need) h = lerp(h, need, onPath)
          }
        }
        const LK = YOSE.lake, e = Math.hypot((x - LK.x) / LK.rx, (z - LK.z) / LK.rz)
        if (e > 1.0 && e < 1.9 && !(dr < hw + 0.2)) {
          const need = LK.water + 0.15 - Math.max(0, (e - 1) * Math.min(LK.rx, LK.rz) - 0.8) * 1.1
          if (h < need) h = lerp(h, need, onPath)
        }
      }
    }
    {
      // 2026-11-12 使用者：瀑布湖往下的溪「有些地方水位偏低」＝河道貼著步道的地方被步道的填土蓋住（水面在地面底下最多 1.1 m）。
      // 最後再挖一次河槽：水面寬度裡地面一定在水面下（中間深 0.38、往兩邊收），岸邊 1.2 m 內最陡 1.3:1 接回原地形（橋是另外的模型，橋下照挖）
      const RV = ALP_RIVER, [dr, ri, rt] = polyDist(x, z, RV), sR = RV.S[ri] + rt * (RV.S[ri + 1] - RV.S[ri]), hw = RV.halfAt(sR)
      if (dr < hw + 1.2 && sR > 2 && sR < RV.lipS - 8) {
        const wl = RV.water(sR)
        h = Math.min(h, dr < hw ? wl - 0.06 - 0.32 * (1 - (dr / hw) ** 2) : wl + 0.1 + (dr - hw) * 1.3)
      }
      // 2026-11-13 使用者「水跑出來了」（瀑布湖出水口西岸）：岸比水面低，水面那片多邊形攤在草地上 → 水面外的岸墊到水面上 8 cm
      // 2026-11-14 改回原本的規則（使用者照片：水漫到草坡上）：第二版讓步道附近不墊，結果河岸比水面低、河面整片攤在陸地上。
      // 這次改成把步道移走（凹槽支線改從西邊爬上來），岸照樣一定比水面高
      if (dr > hw + 0.1 && dr < hw + 3 && sR > 0.5 && sR < RV.lipS - 8) {
        const wl = RV.water(sR)
        if (h < wl + 0.08) h = lerp(wl + 0.08, h, smoothstep(hw + 1.6, hw + 3, dr))
      }
    }
    aHeight[k] = Number.isFinite(h) ? h : 0   // 2026-11-11 格子往西擴到 x -62 以後包到花園中心 (0,0)：gardenEdgeH 在原點是 NaN（地形網格的外框變 NaN，整片地形被剔除）
  }
}
buildAlpine()
const agrid = (arr, x, z) => {
  const fx = (x - AG.x0) / AG.cell, fz = (z - AG.z0) / AG.cell
  if (fx < 0 || fz < 0 || fx >= AG.nx - 1 || fz >= AG.nz - 1) return 1e9
  const i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j, k = j * AG.nx + i
  return (arr[k] * (1 - u) + arr[k + 1] * u) * (1 - v) + (arr[k + AG.nx] * (1 - u) + arr[k + AG.nx + 1] * u) * v
}
export const inAlpine = (x, z, m = 0) => (x > 30 || lobeSweep(LOBES.grass, x, z) < 1.3 || lobeSweep(LOBES.wet, x, z) < 1.3 || lobeSweep(LOBES.lagoon, x, z) < 1.9) && x > ALP.X0 + 1 && gardenRho(x, z) > 1.03 + m / 60 && x < ALP.X1 && Math.abs(z) < ALP.HZ
export const alpineHeight = (x, z) => inAlpine(x, z) ? agrid(aHeight, x, z) : 0
export const alpineTrailDist = (x, z) => agrid(aTrail, x, z)
export const alpineStreamDist = (x, z) => agrid(aStream, x, z)
export const ALP_GRID = AG
export { aHeight as ALP_HEIGHTS }
// 吊橋：橋面是兩端之間的直線（中間微微下垂），寬 1.4 公尺
// 石拱橋的橋面高（中間拱起 0.25）；不在橋上回傳 null
// 2026-11-14 石拱橋四個角（兩頭、兩側石欄的壓頂石上）各一盞石燈籠：[x, 底面 y, z]。alpine.js 擺燈籠、walkway.js 把它們加進燈光表（晚上照亮橋）
export function bridgeLanterns() {
  const out = []
  for (const b of RIVER_BRIDGES) { const L = b.half + 0.3
    for (const u of [-(L + 0.3), 0, L + 0.3]) for (const v of [-(b.hw + 0.12), b.hw + 0.12]) out.push([b.x + b.dir[0] * u - b.dir[1] * v, b.y + b.k * u + 0.25 * Math.cos(Math.min(1, Math.abs(u) / b.half) * Math.PI / 2) ** 2 + 0.69, b.z + b.dir[1] * u + b.dir[0] * v]) }   // 兩頭＋橋中間
  return out
}
export function riverBridgeAt(x, z) {
  for (const b of RIVER_BRIDGES) {
    const ax = x - b.x, az = z - b.z, along = ax * b.dir[0] + az * b.dir[1], lat = Math.abs(-ax * b.dir[1] + az * b.dir[0])
    if (lat < b.hw && Math.abs(along) < b.half) return b.y + b.k * along + 0.25 * Math.cos(along / b.half * Math.PI / 2) ** 2
  }
  return null
}
export function bridgeAt(x, z) {
  const a = ALP_TRAIL[ALP_BRIDGE.a], b = ALP_TRAIL[ALP_BRIDGE.a + 2], pa = ALP_TRAIL.prof[ALP_BRIDGE.a], pb = ALP_TRAIL.prof[ALP_BRIDGE.a + 2]
  const [d, t] = segDist(x, z, a[0], a[1], b[0], b[1])
  if (d > BRIDGE_DIM.hw + 0.03 || t <= 0 || t >= 1) return null
  return lerp(pa, pb, t) - BRIDGE_DIM.sag * Math.sin(Math.PI * t) + 0.06
}

// 2026-11-11 巨木林木棧道（walkway.js 畫）：從橋頭平台的出口沿步道點走，轉角用半徑 10 m 的圓弧（木板呈扇形排開，不會互相重疊）；
// 高度：腳印範圍裡最高的地面 + 6 cm（不會被地形穿出）；從平台出口往下最多 35% 坡（離地高的那段下面有樁），整段 ±0.5 m 平滑
// 玩家走在棧道上（supportAt 用 walkAt）
export const WALK_HW = 1.5
export const ALP_WALKS = (() => {
  const T = ALP_TRAIL, out = []
  for (const [hd, rest] of [[BRIDGE_HEADS[0], [T[ALP_BRIDGE.a - 1], T[ALP_BRIDGE.a - 2]]], [BRIDGE_HEADS[1], [T[ALP_BRIDGE.a + 3], T[ALP_BRIDGE.a + 4]]]]) {
    const P = [hd.exit, ...rest], R = 10
    // 圓角折線 → 每 0.05 m 一個取樣點
    const segs = []   // {type:'L', a, b} | {type:'A', c, r, a0, da}
    let cur = P[0]
    for (let k = 1; k < P.length; k++) {
      const b = P[k]
      if (k < P.length - 1) {
        const c = P[k + 1], d1 = [b[0] - cur[0], b[1] - cur[1]], d2 = [c[0] - b[0], c[1] - b[1]], l1 = Math.hypot(...d1), l2 = Math.hypot(...d2)
        const u1 = [d1[0] / l1, d1[1] / l1], u2 = [d2[0] / l2, d2[1] / l2], th = Math.acos(clamp(u1[0] * u2[0] + u1[1] * u2[1], -1, 1))
        const tl = Math.min(R * Math.tan(th / 2), l1 * 0.45, l2 * 0.45), r = tl / Math.tan(Math.max(th, 1e-4) / 2)
        const p1 = [b[0] - u1[0] * tl, b[1] - u1[1] * tl], turn = Math.sign(u1[0] * u2[1] - u1[1] * u2[0]) || 1
        const nrm = [-u1[1] * turn, u1[0] * turn], c0 = [p1[0] + nrm[0] * r, p1[1] + nrm[1] * r]
        segs.push({ type: 'L', a: cur, b: p1 })
        segs.push({ type: 'A', c: c0, r, a0: Math.atan2(p1[1] - c0[1], p1[0] - c0[0]), da: th * turn })
        cur = [b[0] + u2[0] * tl, b[1] + u2[1] * tl]
      } else segs.push({ type: 'L', a: cur, b })
    }
    const xs = [], zs = [], tx = [], tz = []
    for (const g of segs) {
      const len = g.type === 'L' ? Math.hypot(g.b[0] - g.a[0], g.b[1] - g.a[1]) : Math.abs(g.da) * g.r, n = Math.max(1, Math.round(len / 0.05))
      for (let q = xs.length ? 1 : 0; q <= n; q++) {
        const f = q / n
        if (g.type === 'L') { xs.push(lerp(g.a[0], g.b[0], f)); zs.push(lerp(g.a[1], g.b[1], f)); tx.push((g.b[0] - g.a[0]) / len); tz.push((g.b[1] - g.a[1]) / len) }
        else { const an = g.a0 + g.da * f, sg = Math.sign(g.da); xs.push(g.c[0] + Math.cos(an) * g.r); zs.push(g.c[1] + Math.sin(an) * g.r); tx.push(-Math.sin(an) * sg); tz.push(Math.cos(an) * sg) }
      }
    }
    const N = xs.length, base = new Float32Array(N), y = new Float32Array(N)
    for (let i = 0; i < N; i++) {
      let m = -1e9
      for (const l of [-WALK_HW, -0.75, 0, 0.75, WALK_HW]) for (const a of [-0.3, 0, 0.3]) m = Math.max(m, alpineHeight(xs[i] + tz[i] * l * -1 + tx[i] * a, zs[i] + tx[i] * l + tz[i] * a))
      base[i] = m + 0.06
    }
    y[0] = Math.max(hd.Y0, base[0])
    for (let i = 1; i < N; i++) y[i] = Math.max(base[i], y[i - 1] - 0.35 * 0.05)
    const sm = Float32Array.from(y)
    for (let i = 0; i < N; i++) { let a = 0, c = 0; for (let q = Math.max(0, i - 10); q <= Math.min(N - 1, i + 10); q++) { a += y[q]; c++ } sm[i] = Math.max(base[i], a / c) }
    sm[0] = y[0]; for (let i = 1; i < 6 && i < N; i++) sm[i] = Math.max(base[i], lerp(y[0], sm[i], i / 6))
    let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9
    for (let i = 0; i < N; i++) { x0 = Math.min(x0, xs[i]); x1 = Math.max(x1, xs[i]); z0 = Math.min(z0, zs[i]); z1 = Math.max(z1, zs[i]) }
    out.push({ head: hd, xs, zs, tx, tz, y: sm, ground: base, N, ds: 0.05, box: [x0 - 2, x1 + 2, z0 - 2, z1 + 2] })
  }
  return out
})()
// 2026-11-11 兩湖中間的木棧道（使用者：中間的走道改木頭道）：北岸 → 南岸，跨過水面；棧道面＝max(水面 + 0.45, 地面 + 0.06)，兩端順著接回地面
const mkWetWalk = (P, tag, bays) => {
  // 2026-11-11 ChatGPT「S-Curve Sunset Boardwalk」：直的 45 m 像一座橋 → 緩緩的 S 形（左右各擺 3 m、長約 50 m，Catmull-Rom）：
  // 往南走，先往西（潟湖）彎出去——轉過第一個彎，金色的潟湖整個打開；再往東（沼澤）彎回來
  // 主棧道的控制點在下面呼叫的地方   // 加大後多一個彎，走到新的南岸（約 78 m）
  const cv = new THREE.CatmullRomCurve3(P.map(([x, z]) => new THREE.Vector3(x, 0, z)), false, 'centripetal'), LEN = cv.getLength(), NS = Math.round(LEN / 0.05)
  const xs = [], zs = [], tx = [], tz = []
  for (let i = 0; i <= NS; i++) { const q = cv.getPointAt(i / NS), t = cv.getTangentAt(i / NS); xs.push(q.x); zs.push(q.z); tx.push(t.x); tz.push(t.z) }
  const N = xs.length, stx = Float32Array.from(tx), stz = Float32Array.from(tz)
  // 兩個觀景灣（EAST.decks，跟棧道同高）：夕陽灣（西側、17～22 m，5×4 m、一張面向夕陽的長椅）、翡翠灣（東側、34～39 m，4×3 m，看荷葉和鸊鷉）
  for (const [nm, s0, side, w, d, bench] of bays) {
    const i = Math.min(N - 1, Math.round(s0 / 0.05)), nx = -stz[i] * side, nz = stx[i] * side, off = WALK_HW + d / 2 + 0.02
    EAST.decks.push({ join: nm === 'emeraldBay', name: nm, x: xs[i] + nx * off, z: zs[i] + nz * off, w, d, look: [xs[i] + nx * 30, zs[i] + nz * 30], y: EAST.W + 0.45, bench, bay: true, s: s0, side })   // s、side：在棧道的哪裡、哪一側（walkway.js 把棧道欄杆接到灣的角柱）
  }
  const base = new Float32Array(N), y = new Float32Array(N)
  for (let i = 0; i < N; i++) { let m = -1e9; for (const l of [-WALK_HW, 0, WALK_HW]) m = Math.max(m, alpineHeight(xs[i] - stz[i] * l, zs[i] + stx[i] * l)); base[i] = m + 0.06; y[i] = Math.max(base[i], EAST.W + 0.45) }
  const sm = Float32Array.from(y)
  for (let i = 0; i < N; i++) { let a = 0, c = 0; for (let q = Math.max(0, i - 30); q <= Math.min(N - 1, i + 30); q++) { a += y[q]; c++ } sm[i] = Math.max(base[i], a / c) }
  let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9
  for (let i = 0; i < N; i++) { x0 = Math.min(x0, xs[i]); x1 = Math.max(x1, xs[i]); z0 = Math.min(z0, zs[i]); z1 = Math.max(z1, zs[i]) }
  ALP_WALKS.push({ head: { t: tag }, xs, zs, tx: Array.from(stx), tz: Array.from(stz), y: sm, ground: base, N, ds: 0.05, box: [x0 - 2, x1 + 2, z0 - 2, z1 + 2] })
}
mkWetWalk([[34.2, -86.3], [32.9, -93.3], [31.6, -100.3], [32.9, -108.3], [37, -116.3], [38.4, -123.3], [36.5, -131], [33.2, -139], [32.6, -147], [34.6, -153.5], [36, -158.6]], 'wet', [['sunsetBay', 19.5, -1, 5, 4, true], ['emeraldBay', 37, 1, 4, 3, false], ['southBay', 58, -1, 5, 4, true]])
// 2026-11-12 沼澤環線（使用者：右邊木道接到中間、「道路用順、中間沒接好、要有燈」）：從觀察屋 O8 旁的岸邊下水，往東南繞過荷葉盆地、深水池的東緣，
// 再往西直直接進翡翠灣前緣的開口（最後 6.7 m 跟灣垂直）；跟主棧道同寬、同高（水面 +0.45）、同一套欄杆和矮燈
mkWetWalk([[66.6, -63.6], [69.5, -67.5], [73, -73], [76, -80], [77.3, -88], [77.3, -96], [74, -104], [68, -110.5], [62, -116], [56.5, -118.6], [49.5, -120.66], [46.89, -120.91], [42.84, -121.3]], 'wet2', [])   // 2026-11-13 使用者手畫黃線：從北岸（新湖邊步道）下水，經過開放濕地西緣、丹頂鶴草甸東邊、穿過深水池，接到翡翠灣；以前荷葉池右半圈（O8 → 荷葉池東邊）拆掉
// 2026-11-13 驗收第 6 條（使用者照片：吊橋南岸橋頭平台）：「過橋的木道要打開往左的木道，神木也要有圓形木道圍著」
// 1. gorgeW：從橋頭平台往左（西南）沿峽谷支線開出去，下坡接回泥土路；平台欄杆在它寬度內的柱子拆掉（walkway.js cutBy）
// 2. sacredRing：神木外圍一圈環形木道（中線半徑 SACRED.R），取代原本的木柵欄
// 3. sacredLink：從往東那條木道（ALP_WALKS[1]）往南接到環形木道的短支線
// branch：起點／終點接在別的木道或平台上（那一頭不墊坡、欄杆跟對方的柱子接起來）；closed：環形
export const SACRED = { x: 214.9, z: -71, R: 5.4 }
function mkLandWalk(xs, zs, tag, { closed = false, y0, y1, joinA = false, joinB = false } = {}) {
  const N = xs.length, tx = [], tz = []
  for (let i = 0; i < N; i++) {
    const a = closed ? (i - 1 + N) % N : Math.max(0, i - 1), b = closed ? (i + 1) % N : Math.min(N - 1, i + 1), dx = xs[b] - xs[a], dz = zs[b] - zs[a], l = Math.hypot(dx, dz) || 1
    tx.push(dx / l); tz.push(dz / l)
  }
  const base = new Float32Array(N)
  for (let i = 0; i < N; i++) { let m = -1e9; for (const l of [-WALK_HW, -0.75, 0, 0.75, WALK_HW]) m = Math.max(m, alpineHeight(xs[i] - tz[i] * l, zs[i] + tx[i] * l)); base[i] = m + 0.06 }
  // 高度：地面最高點 +6 cm 的「坡度上限包絡」（任兩點之間坡度不超過 SL），再平滑一次、再包一次——不會穿地、也不會一段一段陡坡
  const SL = (closed ? 0.16 : 0.24) * 0.05, env = (v) => {
    const y = Float32Array.from(v)
    for (let r = 0; r < (closed ? 2 : 1); r++) {
      for (let i = closed ? 0 : 1; i < N; i++) y[i] = Math.max(y[i], y[(i - 1 + N) % N] - SL)
      for (let i = closed ? N - 1 : N - 2; i >= 0; i--) y[i] = Math.max(y[i], y[(i + 1) % N] - SL)
    }
    return y
  }
  const v0 = Float32Array.from(base)
  if (y0 != null && y1 != null) for (let i = 0; i < N; i++) v0[i] = Math.max(base[i], lerp(y0, y1, i / (N - 1)))
  else if (y0 != null) v0[0] = Math.max(base[0], y0)
  const onDeck = xs.map((x, i) => landingAt(x, zs[i]))   // 起點在橋頭平台上：平台那一段跟平台一樣高（平的），出了平台才開始下坡
  for (let i = 0; i < N; i++) if (onDeck[i] != null) v0[i] = onDeck[i]
  const y = env(v0)
  const K = closed ? 40 : 14, sm0 = new Float32Array(N)
  for (let i = 0; i < N; i++) { let a = 0, c = 0; for (let q = i - K; q <= i + K; q++) { const k = closed ? (q + N) % N : q; if (k < 0 || k >= N) continue; a += y[k]; c++ } sm0[i] = Math.max(base[i], a / c) }
  for (let i = 0; i < N; i++) if (onDeck[i] != null) sm0[i] = onDeck[i]
  const sm = env(sm0)
  // 接在別的木道／平台上的那一頭：最後 1.5 m 慢慢接到對方的高度（一樣高才不會有台階）
  // 2026-11-13 使用者（接口照片）：接在另一條木道上的那頭，對方木道寬 3.2 m——以前 1.5 m 就離開對方的高度，走到對方側邊時已經高出一截（看得到台階和木板側面）。
  // 改成：在對方木道寬度內（中線起 WALK_HW + 0.1）完全跟對方一樣高，出了對方側邊再用 1.5 m 接到自己的坡
  const H = Math.round((WALK_HW + 0.1) / 0.05)
  const hold = (i0, yv, at) => { for (let i = 0; i < Math.min(N, i0 + 30); i++) { const k = at(i); sm[k] = i < i0 ? yv : lerp(yv, sm[k], ss01((i - i0) / 30)) } }
  if (y0 != null && onDeck[0] == null) hold(joinA ? H : 0, y0, (i) => i)
  if (y1 != null) hold(joinB ? H : 0, y1, (i) => N - 1 - i)
  let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9
  for (let i = 0; i < N; i++) { x0 = Math.min(x0, xs[i]); x1 = Math.max(x1, xs[i]); z0 = Math.min(z0, zs[i]); z1 = Math.max(z1, zs[i]) }
  const w = { head: { t: tag }, xs, zs, tx, tz, y: sm, ground: base, N, ds: 0.05, closed, joinA, joinB, branch: joinA || joinB, box: [x0 - 2, x1 + 2, z0 - 2, z1 + 2] }
  ALP_WALKS.push(w); return w
}
const ss01 = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t) }
const sampleCurve = (P) => {
  const cv = new THREE.CatmullRomCurve3(P.map(([x, z]) => new THREE.Vector3(x, 0, z)), false, 'centripetal'), n = Math.round(cv.getLength() / 0.05), xs = [], zs = []
  for (let i = 0; i <= n; i++) { const q = cv.getPointAt(i / n); xs.push(q.x); zs.push(q.z) }
  return [xs, zs]
}
const nearestOn = (w, x, z) => { let bi = 0, bd = 1e9; for (let i = 0; i < w.N; i++) { const d = (x - w.xs[i]) ** 2 + (z - w.zs[i]) ** 2; if (d < bd) { bd = d; bi = i } } return bi }
{
  const hd = BRIDGE_HEADS[1], Sd = [hd.P[0] + hd.o[0] * 0.85, hd.P[1] + hd.o[1] * 0.85]
  // 往左：先順著平台往西南直直出去 3 m（平台欄杆在這裡開口），再沿峽谷支線的泥土路下坡，在泥土路上落地
  mkLandWalk(...sampleCurve([Sd, [Sd[0] - 0.25, Sd[1] - 3], [205, -62.5], [203.4, -65.6], [200.4, -67.6]]), 'gorgeW', { y0: hd.Y0, joinA: true })
  const N = Math.round(TAU * SACRED.R / 0.05), xs = [], zs = []
  for (let i = 0; i < N; i++) { const a = i / N * TAU; xs.push(SACRED.x + Math.cos(a) * SACRED.R); zs.push(SACRED.z + Math.sin(a) * SACRED.R) }
  const ring = mkLandWalk(xs, zs, 'sacredRing', { closed: true })
  // 支線：東邊木道上離神木最近的那一點 → 直直往神木走，接到環形木道的中線
  const w1 = ALP_WALKS[1], i1 = nearestOn(w1, SACRED.x, SACRED.z), A = [w1.xs[i1], w1.zs[i1]]
  const dx = SACRED.x - A[0], dz = SACRED.z - A[1], L = Math.hypot(dx, dz), B = [SACRED.x - dx / L * SACRED.R, SACRED.z - dz / L * SACRED.R]
  const n = Math.round((L - SACRED.R) / 0.05), lx = [], lz = []
  for (let i = 0; i <= n; i++) { lx.push(lerp(A[0], B[0], i / n)); lz.push(lerp(A[1], B[1], i / n)) }
  mkLandWalk(lx, lz, 'sacredLink', { y0: w1.y[i1], y1: ring.y[nearestOn(ring, B[0], B[1])], joinA: true, joinB: true })
}
// 2026-11-12 沼澤觀察屋旁的矮木道（wetBoard 支線，east.js buildBoardwalk 蓋）：以前木板貼著地形走，沼澤加大以後後半段的地形在水面下、整條沉在水裡只剩欄杆。
// 木板面＝max(地面 + 0.12, 水面 + 0.4)；盡頭 3×3 m 平台是平的。人走在上面（supportAt）
export const wetBoardY = (x, z) => Math.max(alpineHeight(x, z) + 0.12, EAST.W + 0.4)
export const wetBoardEnd = () => { const P = ALP_SPURS.find((q) => q.name === 'wetBoard').pts, E = P[P.length - 1], A = P[P.length - 2], l = Math.hypot(E[0] - A[0], E[1] - A[1]); const dx = (E[0] - A[0]) / l, dz = (E[1] - A[1]) / l; return { x: E[0], z: E[1], dx, dz, y: Math.max(wetBoardY(E[0], E[1]), deckAt(E[0] + dx * 3.6, E[1] + dz * 3.6) ?? -1e9) } }   // 盡頭的平台接翡翠灣：跟灣同高
export function wetBoardAt(x, z) {
  return null   // 2026-11-12 舊的折線木道拆了（改成 ALP_WALKS 的 'wet2'，walkAt 管）
  const P = ALP_SPURS.find((q) => q.name === 'wetBoard').pts
  if (x < 40 || x > 64 || z > P[0][1] + 3 || z < -125) return null
  const E = wetBoardEnd(), u = (x - E.x) * E.dx + (z - E.z) * E.dz, v = -(x - E.x) * E.dz + (z - E.z) * E.dx
  if (u >= -0.1 && u <= 2.95 && Math.abs(v) <= 1.5) return E.y
  let S = 0
  for (let i = 1; i < P.length; i++) {
    const ax = P[i - 1][0], az = P[i - 1][1], dx = P[i][0] - ax, dz = P[i][1] - az, l = Math.hypot(dx, dz), t = clamp(((x - ax) * dx + (z - az) * dz) / (l * l), 0, 1)
    if (Math.hypot(x - ax - dx * t, z - az - dz * t) <= 0.9 && S + t * l >= 1.1) return wetBoardY(ax + dx * t, az + dz * t)
    S += l
  }
  return null
}
// 站在棧道上：離中線 WALK_HW 以內、不在路的兩端外面 → 棧道面高；不在上面回傳 null
export function walkAt(x, z) {
  for (const w of ALP_WALKS) {
    if (x < w.box[0] || x > w.box[1] || z < w.box[2] || z > w.box[3]) continue
    let bi = -1, bd = 1e9
    for (let i = 0; i < w.N; i += 8) { const d = (x - w.xs[i]) ** 2 + (z - w.zs[i]) ** 2; if (d < bd) { bd = d; bi = i } }
    for (let i = Math.max(0, bi - 8); i <= Math.min(w.N - 1, bi + 8); i++) { const d = (x - w.xs[i]) ** 2 + (z - w.zs[i]) ** 2; if (d < bd) { bd = d; bi = i } }
    const along = (x - w.xs[bi]) * w.tx[bi] + (z - w.zs[bi]) * w.tz[bi], lat = Math.abs(-(x - w.xs[bi]) * w.tz[bi] + (z - w.zs[bi]) * w.tx[bi])
    if (lat > WALK_HW + 0.05) continue
    if (!w.closed && ((bi === 0 && along < 0) || (bi === w.N - 1 && along > 0))) continue
    return w.y[bi]
  }
  return null
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
// bottom：碰撞只在這個高度以上才算（2026-11-10 瀑布頂上的鐵箱子連帶擋住了正下方 12 m 的石階）
export function addCollider(x, z, r, top = 99, bottom = -99) { colliders.push({ x, z, r, top, bottom }) }
// 2026-11-13 使用者（濕地木道照片）：「這位置可以跳下、木欄杆沒有碰撞」——以前只有柱子有碰撞（半徑 0.08、每 1.4 m 一根），柱子之間 0.5 m 的空隙人直接走出去。
// 扶手一段一段登記成線段（walkway.js railRun），人的中心離線段不到 PLAYER_R 就擋；只擋在扶手那個高度範圍（y＝那段木道面）
export const railSegs = []
export function addRailSeg(x0, z0, x1, z1, y) { railSegs.push({ x0, z0, x1, z1, y, bx0: Math.min(x0, x1) - 0.6, bx1: Math.max(x0, x1) + 0.6, bz0: Math.min(z0, z1) - 0.6, bz1: Math.max(z0, z1) + 0.6 }) }
// 2026-11-13 使用者：「不要讓玩家過去邊界、那邊有破圖」→ 濕地的水不能走進去（以前從岸邊、木道都能下水走到湖對岸山腳）；
// 湖對岸（南岸 x>39.5,z<-150、東岸 x>97,z<-80）的岸上也擋——那邊只有木棧道之外的地，沒有路
function wetBlock(x, z) {
  const [a, b, c, d] = EAST.wetBox
  if (x < a - 10 || x > b + 10 || z < c - 10 || z > d + 10) return false
  if (walkAt(x, z) != null || deckAt(x, z) != null) return false
  return alpineHeight(x, z) < EAST.W - 0.06 || wetSD(x, z) < -0.5 || (x > 39.5 && z < -150) || (x > 97 && z < -80)   // wetSD：湖的範圍裡面（開放濕地的泥和短草也算，鳥的地方）
}
function railHit(x, z, feet) {
  for (const r of railSegs) {
    if (x < r.bx0 || x > r.bx1 || z < r.bz0 || z > r.bz1 || feet < r.y - 0.5 || feet > r.y + 0.95) continue
    const dx = r.x1 - r.x0, dz = r.z1 - r.z0, t = clamp(((x - r.x0) * dx + (z - r.z0) * dz) / (dx * dx + dz * dz || 1), 0, 1)
    if (Math.hypot(x - r.x0 - dx * t, z - r.z0 - dz * t) < PLAYER_R) return true
  }
  return false
}

const PLAYER_R = 0.38
export function supportAt(x, z, feet) {
  if (inAlpine(x, z)) {
    let y = alpineHeight(x, z), owner = 0
    const by = bridgeAt(x, z)
    if (by != null && by <= feet + 0.5 && by > y - 3) { y = by; owner = 3 }
    const ly = landingAt(x, z)     // 橋頭平台
    if (ly != null && ly <= feet + 0.5 && ly > y - 1) { y = ly; owner = 3 }
    const dy = deckAt(x, z)        // 2026-11-11 濕地的觀景台（夕陽、鶴）
    if (dy != null && dy <= feet + 0.5 && dy > y - 1.5) { y = dy; owner = 3 }
    const wy = walkAt(x, z)        // 巨木林木棧道
    if (wy != null && wy <= feet + 0.5 && wy > y - 1) { y = wy; owner = 3 }
    const wb = wetBoardAt(x, z)    // 沼澤觀察屋旁的矮木道
    if (wb != null && wb <= feet + 0.5 && wb > y) { y = wb; owner = 3 }
    const sy = YOSE.stairAt(x, z, feet)   // 瀑布步道（多層重疊：挑腳下那一層）
    if (sy != null && sy <= feet + 0.5 && sy > y) { y = sy; owner = 5 }
    const ty = YOSE.topAt(x, z)     // 岩壁頂上
    if (ty != null && ty <= feet + 0.5 && ty > y) { y = ty; owner = 5 }
    const rb = riverBridgeAt(x, z)  // 河上的石橋
    if (rb != null && rb <= feet + 0.5 && rb > y - 3) { y = rb; owner = 3 }
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
    if (railHit(x, z, feet)) return true   // 木道扶手
    if (wetBlock(x, z)) return true   // 濕地的水、湖對岸
    // 山區：太陡（一步高過 0.6 公尺）就走不上去；吊橋上不算
    if (bridgeAt(x, z) != null && Math.abs(bridgeAt(x, z) - feet) < 0.6) return false
    const rbq = riverBridgeAt(x, z)
    if (rbq != null && Math.abs(rbq - feet) < 0.6) { for (const c of colliders) { if (feet > c.top || feet < c.bottom - 0.3) continue; const ddx = x - c.x, ddz = z - c.z, rr = c.r + PLAYER_R; if (ddx * ddx + ddz * ddz < rr * rr) return true } return false }
    // 玩家一小步 0.15 公尺：往上超過 0.13（約 41 度）爬不上去；往下只有懸崖（掉超過 2.5 公尺）才擋，跳起來在空中不會被擋住
    // 2026-11-11 地面＝supportAt（石階、岩壁頂也算）；以前只看地形，石階上每一步都當成懸崖，走不上去
    const sup = supportAt(x, z, feet), h = sup.y
    // 步道上（本來就平緩）一步可以高到 0.35：吊橋兩端的橋面跟地面差 20～30 公分，不然會卡在橋頭；石階一階 0.2
    if (h > feet + (sup.owner === 5 ? 0.3 : alpineTrailDist(x, z) < 1.5 ? 0.35 : 0.13) || h < ref - 0.9) return true   // 往下一步掉超過 0.9 公尺＝懸崖邊，不能走下去（原本 2.5，會走下爬不回來的地方）
    if (h < ALP_POND.water + 0.05 && Math.hypot(x - ALP_POND.x, z - ALP_POND.z) < ALP_POND.r + 1) return true   // 水池不能走進去
    if (sup.owner !== 5 && sup.owner !== 3 && alpineStreamDist(x, z) < 3.5) for (const st of ALP_STREAMS) { const sq = st.sAt(x, z); if (st.dist(x, z) < (st.wide ? st.halfAt(sq) + 0.4 : 3.5) && st.water(sq) - h > 0.3) return true }   // 河只看水道裡（河靠步道很近，岸上不算）
    if (sup.owner !== 5 && YOSE.inLake(x, z, 0.3) && YOSE.lake.water - h > 0.05) return true   // 瀑布湖不能走進去   // 溪裡的潭（水深超過 0.3）不能走進去：潭壁陡，走進去爬不出來
    for (const c of colliders) { if (feet > c.top || feet < c.bottom - 0.3) continue; const ddx = x - c.x, ddz = z - c.z, rr = c.r + PLAYER_R; if (ddx * ddx + ddz * ddz < rr * rr) return true }
    return false
  }
  if (COAST_ON && inCoast(x, z, 0.45)) {
    // 海岸館：淺水才走得進去（沙面低於海面 0.25 以上就擋）；太陡爬不上去（沙丘、岬角）；木棧道上隨便走
    const bw = boardwalkAt(x, z)
    if (bw != null && Math.abs(bw - feet) < 0.5) return false
    const h = coastHeight(x, z)
    if (h < CST.SEA - 0.3) return true
    if (h > feet + 0.16 || h < ref - 2.5) return true
    for (const c of colliders) { if (feet > c.top || feet < c.bottom - 0.3) continue; const ddx = x - c.x, ddz = z - c.z, rr = c.r + PLAYER_R; if (ddx * ddx + ddz * ddz < rr * rr) return true }
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
    if (feet > c.top || feet < c.bottom - 0.3) continue
    const ddx = x - c.x, ddz = z - c.z, rr = c.r + PLAYER_R
    if (ddx * ddx + ddz * ddz < rr * rr) return true
  }
  return ceilingHit(x, z, feet)
}

/* ---------- 擺放用 ---------- */
export const insideGarden = (x, z, margin = 0.93) => gardenRho(x, z) < margin
export function distToMtn(x, z) { return Math.hypot(x - MTN.x, z - MTN.z) }

// 2026-11-12 使用者看影片：崖壁步道起點「路上原本的地、草」——步道從洞口出來到岩壁腳那一段，原本的山坡地形高出步道、草和蕨長在路上。
// 步道兩側 1.4 m 內的地形壓到步道底下，往外 1.2 m 接回原本的坡；同時登記成步道（alpineTrailDist）：草、蕨、石頭的擺放都會避開，地面畫成泥土路
{
  // 2026-11-12 使用者「懸空樹木」：枯木的根原本在舊的岩壁廊道外面，步道改成階地之後那裡是空的 → 改種在最上面那層步道外緣底下的石壁上
  { const T = YOSE.stairs(), near = (lo, hi) => { let b = -1; for (let i = 0; i < T.pts.length; i++) if (T.kind[i] === 'gal' && T.yy[i] > lo && T.yy[i] < hi && (b < 0 || Math.abs(T.pts[i][0] - 226.5) < Math.abs(T.pts[b][0] - 226.5))) b = i; return b }
    const top = T.top, i4 = near(top - 9.5, top + 1), i3 = near(T.yy[i4] - 16, T.yy[i4] - 3)
    if (i4 >= 0 && i3 >= 0) { YOSE.snag.y = T.yy[i4] - 1.2; YOSE.snag.z = T.pts[i3][1] + 1.25 + 0.15 } }
  const st = YOSE.stairs()
  for (let i = 1; i < st.pts.length; i++) {
    const k = st.kind[i]; if (k !== 'open' && !(k === 'gal' && st.yy[i] < 36)) continue
    const [ax, az] = st.pts[i - 1], [bx, bz] = st.pts[i], ya = st.yy[i - 1], yb = st.yy[i]
    const i0 = Math.floor((Math.min(ax, bx) - 3 - AG.x0) / AG.cell), i1 = Math.ceil((Math.max(ax, bx) + 3 - AG.x0) / AG.cell), j0 = Math.floor((Math.min(az, bz) - 3 - AG.z0) / AG.cell), j1 = Math.ceil((Math.max(az, bz) + 3 - AG.z0) / AG.cell)
    for (let j = Math.max(0, j0); j <= Math.min(AG.nz - 1, j1); j++) for (let ii = Math.max(0, i0); ii <= Math.min(AG.nx - 1, i1); ii++) {
      const x = AG.x0 + ii * AG.cell, z = AG.z0 + j * AG.cell, dx = bx - ax, dz = bz - az, t = clamp(((x - ax) * dx + (z - az) * dz) / Math.max(1e-6, dx * dx + dz * dz), 0, 1), d = Math.hypot(x - ax - dx * t, z - az - dz * t), y = lerp(ya, yb, t), q = j * AG.nx + ii
      if (d < 2.6) { const tgt = y - (k === 'gal' ? 0.35 : 0.02), w = 1 - clamp((d - 1.4) / 1.2, 0, 1); if (aHeight[q] > tgt) aHeight[q] = lerp(aHeight[q], tgt, w * w * (3 - 2 * w)) }
      if (d < aTrail[q]) aTrail[q] = d
    }
  }
}

// 2026-11-13 凹槽變湖：岩架（步道底下、往後到牆）＝步道高度往下 0.3；岩架前緣 1.2 m 內斜下去，再往前是湖底（水面下 0.9）
{
  const st = YOSE.stairs(), W = YOSE.lake.water
  const pathY = (x) => { let b = null, bd = 1e9; for (let i = 0; i < st.pts.length; i++) { if (st.pts[i][0] > 207.5 || st.yy[i] > 34) continue; const d = Math.abs(st.pts[i][0] - x); if (d < bd) { bd = d; b = st.yy[i] } } return b }
  const C = YOSE.cave
  for (let j = 0; j < AG.nz; j++) { const z = AG.z0 + j * AG.cell; if (z < 82 || z > 108) continue
    for (let i = 0; i < AG.nx; i++) { const x = AG.x0 + i * AG.cell; if (x < C.x0 || x > C.x1) continue
      const D = YOSE.caveD(x); if (D < 2.4) continue
      const b = YOSE.base(x), zr = z - b; if (zr < -3 || zr > D + 0.5) continue
      const k = j * AG.nx + i, py = pathY(x); if (py == null) continue
      const edge = YOSE.recPath(x) - 1.6   // 岩架前緣（離牆腳）
      const ledge = py - 0.3, bed = W - 0.9
      const t = smoothstep(edge - 1.2, edge, zr)
      let h = lerp(bed, ledge, t)
      if (zr < 0) h = Math.min(aHeight[k], lerp(h, aHeight[k], smoothstep(0, -3, zr)))   // 凹槽口外面慢慢接回湖底
      aHeight[k] = zr < 0 ? h : (t > 0.01 ? h : Math.min(aHeight[k], h))
    } }
}

// 2026-11-13 驗收第 4 條（使用者）：營地往瀑布那段土坡太陡（9.5 m 爬 3.5 m）、路太窄 → 營地到湖邊 (186, 66) 削成一條平順的坡道（約 15%），
// 路面半寬 2.6 m（原本 1.4）、外面 3 m 慢慢接回原本的坡；同時登記成步道（草、石頭讓開，地面畫成泥土路）
{
  const sp = ALP_SPURS.find((q) => q.name === 'yose'), n = sp.pts.length
  const caveSp = ALP_SPURS.find((q) => q.name === 'cave')
  const A = [CAMP.x, CAMP.z], M = sp.pts[n - 2], B = sp.pts[n - 3]
  const yA = alpineHeight(A[0], A[1]), yB = alpineHeight(B[0], B[1])
  const L1 = Math.hypot(M[0] - A[0], M[1] - A[1]), L2 = Math.hypot(B[0] - M[0], B[1] - M[1]), yM = lerp(yA, yB, L1 / (L1 + L2))
  sp.prof[n - 2] = yM
  for (const [P, Q, ya, yb] of [[A, M, yA, yM], [M, B, yM, yB]]) {
    const dx = Q[0] - P[0], dz = Q[1] - P[1], l2 = dx * dx + dz * dz
    const i0 = Math.floor((Math.min(P[0], Q[0]) - 6 - AG.x0) / AG.cell), i1 = Math.ceil((Math.max(P[0], Q[0]) + 6 - AG.x0) / AG.cell), j0 = Math.floor((Math.min(P[1], Q[1]) - 6 - AG.z0) / AG.cell), j1 = Math.ceil((Math.max(P[1], Q[1]) + 6 - AG.z0) / AG.cell)
    for (let j = Math.max(0, j0); j <= Math.min(AG.nz - 1, j1); j++) for (let i = Math.max(0, i0); i <= Math.min(AG.nx - 1, i1); i++) {
      const x = AG.x0 + i * AG.cell, z = AG.z0 + j * AG.cell, t = clamp(((x - P[0]) * dx + (z - P[1]) * dz) / l2, 0, 1), d = Math.hypot(x - P[0] - dx * t, z - P[1] - dz * t), q = j * AG.nx + i
      if (d > 5.6 || YOSE.inLake(x, z, 0.5) || aStream[q] < 3.2) continue   // 2026-11-13 使用者照片：坡道把石拱橋底下的河道填平了（河面浮在土上、橋像放在地上）→ 河道和河岸不動
      if (caveSp && polyDist(x, z, caveSp.pts)[0] < 2.5) continue   // 2026-11-13 岔去瀑布後面那條步道自己有 12% 的坡度，被這條坡道的直線一拉就歪成 31%，它的路面不要動
      // 2026-11-13 使用者（橋頭照片圈起來）「這是哪裡 不平」：石橋被刻意墊高到離水面 2.1 m，這條坡道卻照自己的直線把橋頭前面壓到低 0.3～0.7 m，
      // 石板邊緣就懸在那、前面凹一塊。橋的影響範圍內改成往橋面那條線靠過去（跟主迴圈裡橋頭引道同一個目標），兩邊才接得上
      let tgt = lerp(ya, yb, t)
      for (const b of RIVER_BRIDGES) {
        const ax = x - b.x, az = z - b.z, along = ax * b.dir[0] + az * b.dir[1], lat = Math.abs(-ax * b.dir[1] + az * b.dir[0])
        const kb = smoothstep(b.half + 8.5, b.half + 1.0, Math.abs(along)) * smoothstep(b.hw + 5.2, b.hw + 1.3, lat)
        if (kb > 0) tgt = lerp(tgt, b.y + b.k * along - 0.02, kb)
      }
      const w = 1 - clamp((d - 2.6) / 3.0, 0, 1), ww = w * w * (3 - 2 * w)
      aHeight[q] = lerp(aHeight[q], tgt, ww)
      if (d < 2.6) aTrail[q] = Math.min(aTrail[q], Math.max(0, d - 1.2))
    }
  }
}

// 2026-11-13 驗收第 1 條（使用者照片：沙土路走到木道起點，整片木道比地面高、看得到底下的橫樑）：
// 每條木道的兩端，木道比地面高 0.2 m 以上的，把那一頭的地墊起來接一段緩坡——木道底下墊到踏板下 8 cm，往外 4.5 m 慢慢接回原本的地（溪流不墊）
for (const w of ALP_WALKS) {
  const n = w.xs.length
  if (w.closed) continue   // 環形木道沒有頭尾
  for (const e of [0, n - 1]) {
    if ((e === 0 && w.joinA) || (e === n - 1 && w.joinB)) continue   // 接在別的木道／平台上的那一頭不墊坡
    const ex = w.xs[e], ez = w.zs[e], dy = w.y[e] - alpineHeight(ex, ez)
    if (dy < 0.2) continue
    if (eastZone(ex, ez) === 'wet' && alpineHeight(ex, ez) < EAST.W) continue   // 2026-11-13 使用者（荷葉池照片）：沼澤環線的終點接翡翠灣、在水裡 → 以前也墊坡，灣前面堆出一塊 5 m 的土 → 水裡的那頭不墊
    // 這一頭往木道裡面的方向（踏板底下整段都墊到 deck−0.08，直到木道本身已經貼地）
    let inner = 0; for (let k = 0; k < 160; k++) { const i = e === 0 ? k : n - 1 - k; if (w.y[i] - alpineHeight(w.xs[i], w.zs[i]) < 0.15) break; inner = k }
    const i0 = Math.floor((ex - 9 - AG.x0) / AG.cell), i1 = Math.ceil((ex + 9 - AG.x0) / AG.cell), j0 = Math.floor((ez - 9 - AG.z0) / AG.cell), j1 = Math.ceil((ez + 9 - AG.z0) / AG.cell)
    for (let j = Math.max(0, j0); j <= Math.min(AG.nz - 1, j1); j++) for (let i = Math.max(0, i0); i <= Math.min(AG.nx - 1, i1); i++) {
      const x = AG.x0 + i * AG.cell, z = AG.z0 + j * AG.cell, q = j * AG.nx + i
      if (aStream[q] < 1.5) continue
      // 離木道這一頭（含往裡那段還架高的踏板）最近的點
      let best = 1e9, by = 0
      for (let k = 0; k <= inner; k += 2) { const ii = e === 0 ? k : n - 1 - k, d = Math.hypot(x - w.xs[ii], z - w.zs[ii]); if (d < best) { best = d; by = w.y[ii] } }
      if (best > 5.5) continue
      // 不能高過附近任何一段踏板（木道往裡走會變低：那一段底下的地不能冒出踏板）
      let cap = 1e9, cd = 2.2; for (let k = 0; k < Math.min(n, inner + 260); k += 2) { const ii = e === 0 ? k : n - 1 - k, d = Math.hypot(x - w.xs[ii], z - w.zs[ii]); if (d < cd) { cd = d; cap = w.y[ii] - 0.08 } }   // 最近那一片踏板底下 8 cm
      const tgt = Math.min(by - 0.08, cap), t = smoothstep(1.0, 5.5, best)
      const h = Math.min(cap, lerp(tgt, aHeight[q], t))
      if (h > aHeight[q]) aHeight[q] = h
    }
  }
}

// 2026-11-13 新木道（往左支線、神木環形）：上面墊坡那一步可能把旁邊另一條木道底下的地墊高 → 每條木道底下（含兩側 0.3 m）的地一律壓到踏板下 8 cm
for (const w of ALP_WALKS) {
  if (!w.branch && !w.closed) continue
  for (let k = 0; k < w.N; k += 4) {
    const x = w.xs[k], z = w.zs[k], cap = w.y[k] - 0.08, R = WALK_HW + 0.3
    const i0 = Math.floor((x - R - AG.x0) / AG.cell), i1 = Math.ceil((x + R - AG.x0) / AG.cell), j0 = Math.floor((z - R - AG.z0) / AG.cell), j1 = Math.ceil((z + R - AG.z0) / AG.cell)
    for (let j = Math.max(0, j0); j <= Math.min(AG.nz - 1, j1); j++) for (let i = Math.max(0, i0); i <= Math.min(AG.nx - 1, i1); i++) {
      const gx = AG.x0 + i * AG.cell, gz = AG.z0 + j * AG.cell, q = j * AG.nx + i
      if (Math.abs(-(gx - x) * w.tz[k] + (gz - z) * w.tx[k]) > R || Math.abs((gx - x) * w.tx[k] + (gz - z) * w.tz[k]) > 0.3) continue
      if (aHeight[q] > cap) aHeight[q] = cap
    }
  }
}

// 2026-11-13 湖加大以後 O8 留在西北角的岸上：步道（lagoonRing 起點、wetBoard 小段）的路面高度是從 alpBase 算的，比濕地的岸低，
// 把 O8 前後壓到水面下（觀察屋泡在水裡、長出蘆葦）→ O8 周圍 7 m 內、湖的外面，地至少比水面高 0.14
{
  const [hx, hz] = EAST.hides[1]
  for (let j = 0; j < AG.nz; j++) for (let i = 0; i < AG.nx; i++) {
    const gx = AG.x0 + i * AG.cell, gz = AG.z0 + j * AG.cell, d = Math.hypot(gx - hx, gz - hz)
    if (d > 8.5) continue
    const sd = wetSD(gx, gz), q = j * AG.nx + i
    const tgt = EAST.W + 0.14 * smoothstep(-0.5, 1.2, sd) * smoothstep(8.5, 6.5, d) - 0.25 * (1 - smoothstep(-1.5, -0.5, sd))
    if (sd > -1.5 && aHeight[q] < tgt) aHeight[q] = tgt
  }
}

// 2026-11-13 驗收第 9 條：東邊那片湖挖下去——湖底（水面下 0.4～1.8 m，離南岸越遠越深）；南岸往步道那邊 9 m 內削成往下的岸坡；岩壁腳 1 m、崖壁步道 3 m 內不動
{
  const W = YOSE.lake.water, E = YOSE.lakeE, st = YOSE.stairs()
  const nearStairs = (x, z) => { for (let i = 0; i < st.pts.length; i++) if (st.yy[i] < 36 && Math.abs(st.pts[i][0] - x) < 3 && Math.abs(st.pts[i][1] - z) < 3) return true; return false }
  for (let j = 0; j < AG.nz; j++) { const z = AG.z0 + j * AG.cell; if (z < 60 || z > 110) continue
    for (let i = 0; i < AG.nx; i++) { const x = AG.x0 + i * AG.cell; if (x < E.x0 - 6 || x > E.x1 + 6) continue
      const q = j * AG.nx + i, b = YOSE.base(x), zs = E.zS(x)
      if (z > b - 1.0 || aTrail[q] < 3.5 || nearStairs(x, z)) continue
      const ex = smoothstep(E.x0 - 6, E.x0, x) * smoothstep(E.x1 + 6, E.x1, x)   // 東西兩端慢慢收
      if (ex <= 0) continue
      if (z >= zs) {
        const bed = lerp(W + 0.25, W - 1.8, smoothstep(zs, zs + 6, z)) , t = lerp(aHeight[q], bed, ex)
        if (t < aHeight[q]) aHeight[q] = t
      } else if (z > zs - 9) {
        const bank = lerp(W + 0.25, aHeight[q], smoothstep(zs, zs - 9, z)), t = lerp(aHeight[q], bank, ex)
        if (t < aHeight[q]) aHeight[q] = t
      }
    }
  }
}

// 2026-11-13 驗收第 12 條：秘境步道起點（凹槽口那一階）架在地面上方 0.85 m——凹槽變湖時把步道起點底下也挖成湖底了。
// 從岩窟步道（cave 支線）最後兩段到石階前 3 點，路面底下 1.8 m 內墊回路面高度、往外 1.5 m 接回（凹槽的湖還在路的外側）
{
  const sp = ALP_SPURS.find((q) => q.name === 'cave'), st = YOSE.stairs()
  const segs = []
  if (sp) { const n = sp.pts.length; for (let k = Math.max(1, n - 2); k < n; k++) segs.push([sp.pts[k - 1], sp.pts[k], +sp.prof[k - 1], +sp.prof[k]]) }
  if (sp) segs.push([sp.pts.at(-1), st.pts[0], +sp.prof.at(-1), st.yy[0] - 0.15])
  for (let k = 1; k <= 3; k++) segs.push([st.pts[k - 1], st.pts[k], st.yy[k - 1] - 0.15, st.yy[k] - 0.15])
  for (const [P, Q, ya, yb] of segs) {
    const dx = Q[0] - P[0], dz = Q[1] - P[1], l2 = Math.max(1e-6, dx * dx + dz * dz)
    const i0 = Math.floor((Math.min(P[0], Q[0]) - 4 - AG.x0) / AG.cell), i1 = Math.ceil((Math.max(P[0], Q[0]) + 4 - AG.x0) / AG.cell), j0 = Math.floor((Math.min(P[1], Q[1]) - 4 - AG.z0) / AG.cell), j1 = Math.ceil((Math.max(P[1], Q[1]) + 4 - AG.z0) / AG.cell)
    for (let j = Math.max(0, j0); j <= Math.min(AG.nz - 1, j1); j++) for (let i = Math.max(0, i0); i <= Math.min(AG.nx - 1, i1); i++) {
      const x = AG.x0 + i * AG.cell, z = AG.z0 + j * AG.cell, t = clamp(((x - P[0]) * dx + (z - P[1]) * dz) / l2, 0, 1), d = Math.hypot(x - P[0] - dx * t, z - P[1] - dz * t), q = j * AG.nx + i
      if (d > 3.3) continue
      const tgt = lerp(ya, yb, t) - 0.06, w = 1 - clamp((d - 1.8) / 1.5, 0, 1), h = lerp(aHeight[q], tgt, w * w * (3 - 2 * w))
      if (h > aHeight[q]) aHeight[q] = h
    }
  }
}

// 2026-11-13 使用者（石拱橋俯視圖）「sand too high」「bridge and sand 重疊嗎」：最後一步——橋頭（橋面＋往外 1.4 m 的石板）底下的地一律比橋面低 8 cm，
// 橋身兩側 2.5 m 內的岸不能高過橋面下 35 cm（以前營地坡道、步道攤平在後面又把沙堆回去，蓋住石板、埋住橋頭）
for (const b of RIVER_BRIDGES) {
  const DE = 0.65   // 石板往橋頭外多鋪多少（alpine.js 的 E 要一樣，不然地會從石板底下冒出來或石板懸空）
  const L = b.half + 0.3, R = L + 4
  const i0 = Math.floor((b.x - R - AG.x0) / AG.cell), i1 = Math.ceil((b.x + R - AG.x0) / AG.cell), j0 = Math.floor((b.z - R - AG.z0) / AG.cell), j1 = Math.ceil((b.z + R - AG.z0) / AG.cell)
  for (let j = Math.max(0, j0); j <= Math.min(AG.nz - 1, j1); j++) for (let i = Math.max(0, i0); i <= Math.min(AG.nx - 1, i1); i++) {
    const x = AG.x0 + i * AG.cell, z = AG.z0 + j * AG.cell, ax = x - b.x, az = z - b.z, al = ax * b.dir[0] + az * b.dir[1], lat = Math.abs(-ax * b.dir[1] + az * b.dir[0]), q = j * AG.nx + i
    const out = Math.abs(al) - L; if (out > DE + 1.5 || lat > b.hw + 2.5) continue
    const line = b.y + b.k * al   // 橋面（兩頭延伸出去照同一個坡）
    let cap
    if (lat < b.hw + 0.35) cap = line - 0.08 + Math.max(0, out - DE) * 0.12   // 路面：石板盡頭之後 1.5 m 慢慢可以高回來
    else cap = line - 0.08 - 0.27 * smoothstep(b.hw + 0.35, b.hw + 0.9, lat) * (1 - smoothstep(DE, DE + 1.5, out)) + Math.max(0, out - DE) * 0.12
    if (aHeight[q] > cap) aHeight[q] = cap
  }
}

YOSE.DIKE = null   // 2026-11-14 石橋拆掉，橋頭那道補的岸跟石牆一起拿掉

// 2026-11-13 驗收第 11 條：瀑布湖和往下流的溪之間隔著一道比水面高的土堤（湖西岸 186～188 一帶高 27.6～27.9，水面 27.5）→ 挖一條水道接起來（水面下 0.6、半寬 2.5 m、外面 2 m 接回）
{
  const W = YOSE.lake.water, P = [190.5, 79.3], Q = [184.6, 75.4], dx = Q[0] - P[0], dz = Q[1] - P[1], l2 = dx * dx + dz * dz
  const i0 = Math.floor((Math.min(P[0], Q[0]) - 5 - AG.x0) / AG.cell), i1 = Math.ceil((Math.max(P[0], Q[0]) + 5 - AG.x0) / AG.cell), j0 = Math.floor((Math.min(P[1], Q[1]) - 5 - AG.z0) / AG.cell), j1 = Math.ceil((Math.max(P[1], Q[1]) + 5 - AG.z0) / AG.cell)
  for (let j = Math.max(0, j0); j <= Math.min(AG.nz - 1, j1); j++) for (let i = Math.max(0, i0); i <= Math.min(AG.nx - 1, i1); i++) {
    const x = AG.x0 + i * AG.cell, z = AG.z0 + j * AG.cell, t = clamp(((x - P[0]) * dx + (z - P[1]) * dz) / l2, 0, 1), d = Math.hypot(x - P[0] - dx * t, z - P[1] - dz * t), q = j * AG.nx + i
    if (d > 4.5 || aTrail[q] < 1.6) continue
    const w = 1 - clamp((d - 2.5) / 2.0, 0, 1), h = lerp(aHeight[q], W - 0.6, w * w * (3 - 2 * w))
    if (h < aHeight[q]) aHeight[q] = h
  }
}

// 2026-11-14 BASIN 挖成湖：湖底＝水面 −0.55，邊緣 1.2 m 內斜上去；外面 3 m 內、不在湖裡也不在河道裡的地墊到水面上 0.15（湖水不會漫到岸上）
{
  const W = YOSE.lake.water, R = ALP_RIVER
  for (let j = 0; j < AG.nz; j++) { const z = AG.z0 + j * AG.cell; if (z < 68 || z > 92) continue
    for (let i = 0; i < AG.nx; i++) { const x = AG.x0 + i * AG.cell; if (x < 172 || x > 194) continue
      const q = j * AG.nx + i, e = YOSE.basinEdgeD(x, z)
      if (e < 0) continue   // 湖底在下面那一步一起挖
      if (e > 4.2 || YOSE.inLake(x, z, 0)) continue
      if (R.dist(x, z) < R.halfAt(R.sAt(x, z)) + 0.3) continue
      if (alpineTrailDist(x, z) < 1.6) continue   // 步道照自己的坡
      const tgt = lerp(W + 0.15, aHeight[q], smoothstep(2.2, 4.2, e)); if (aHeight[q] < tgt) aHeight[q] = tgt   // 岸寬 2.2 m 再慢慢接回（以前 1.2 m 太窄，河面越過岸鋪到西邊低地）
    } }
}

// 2026-11-14 使用者：「你要跟後面湖同深度」「水要同一個」：第一版 BASIN 只挖到水面下 0.55 m，湖西緣原本也有一圈 0.6 m 的淺棚，
// 兩片淺灘連成一大片淺色的沙底，跟後面 2～3 m 深的湖之間一道陡坡——看起來就是兩段水。
// 改成：整個湖面輪廓（YOSE.lakeR：橢圓＋出水口＋BASIN）的西半邊，湖底照「離湖岸多遠」往下：岸邊 0.3 m、每往裡 1 m 再深 0.7 m，最深 2.6 m（跟湖心一樣）；
// 只往下挖、不墊高（湖心本來就更深的地方不動）。瀑布那邊（x 193 以東）、凹槽（z 88 以北）不動
{
  const W = YOSE.lake.water, LK = YOSE.lake
  for (let j = 0; j < AG.nz; j++) { const z = AG.z0 + j * AG.cell; if (z < 66 || z > 88) continue
    for (let i = 0; i < AG.nx; i++) { const x = AG.x0 + i * AG.cell; if (x < 174 || x > 193) continue
      const dx = x - LK.x, dz = z - LK.z, dShore = YOSE.lakeR(Math.atan2(dz, dx)) - Math.hypot(dx, dz)
      if (dShore <= 0) continue
      const q = j * AG.nx + i, bed = W - Math.min(2.6, 0.3 + 0.7 * dShore)
      if (aHeight[q] > bed) aHeight[q] = bed
    } }
}

// 2026-11-14 使用者（出湖那段河）「這裡土可挖掉，是不是太薄」：河道中間 1.7～3.7 m 深，但兩邊各一條淺棚，水只有幾公分 → 看起來是一層薄水蓋在土上。
// 出湖之後 12 m 內，水面寬度裡的河床一律挖到水面下 0.8 m 以上，離水邊 0.5 m 內斜上去接岸（只挖、不墊）
{
  const R = ALP_RIVER
  for (let j = 0; j < AG.nz; j++) { const z = AG.z0 + j * AG.cell; if (z < 52 || z > 80) continue
    for (let i = 0; i < AG.nx; i++) { const x = AG.x0 + i * AG.cell; if (x < 172 || x > 190) continue
      const sR = R.sAt(x, z); if (sR > 12) continue
      const d = R.dist(x, z), hw = R.halfAt(sR); if (d > hw) continue
      const q = j * AG.nx + i, bed = R.water(sR) - 0.8 * smoothstep(hw, hw - 0.5, d) + 0.05
      if (aHeight[q] > bed) aHeight[q] = bed
    } }
}

// 2026-11-14 出水口那段湖底：照湖岸算的話它在湖的邊緣、只有 0.9 m 深（透出沙底、一條亮帶），但它其實是河的開頭 → 河寬裡、出湖前後 4 m，湖底挖到跟河一樣深（水面下 2.4 m，兩側 1.2 m 內斜上去）
{
  const R = ALP_RIVER, W = YOSE.lake.water
  for (let j = 0; j < AG.nz; j++) { const z = AG.z0 + j * AG.cell; if (z < 68 || z > 82) continue
    for (let i = 0; i < AG.nx; i++) { const x = AG.x0 + i * AG.cell; if (x < 174 || x > 190) continue
      const sR = R.sAt(x, z); if (sR > 4) continue
      const d = R.dist(x, z), hw = R.halfAt(sR); if (d > hw) continue
      const q = j * AG.nx + i, bed = W - 2.4 * smoothstep(hw, hw - 1.2, d) + 0.05
      if (aHeight[q] > bed) aHeight[q] = bed
    } }
}

// 2026-11-14 使用者（瀑布下的河岸照片）「修正這些石頭跟草」：新河道切過原本墊高的坡，東岸變成一道 2～3 m 的垂直土牆、石頭懸在牆頂。
// 出湖後 22 m 內，河岸從水邊往外最陡 0.75（約 37°），超過的削掉（只削、不墊）；步道、橋頭不動
{
  const R = ALP_RIVER
  for (let j = 0; j < AG.nz; j++) { const z = AG.z0 + j * AG.cell; if (z < 45 || z > 82) continue
    for (let i = 0; i < AG.nx; i++) { const x = AG.x0 + i * AG.cell; if (x < 168 || x > 194) continue
      const sR = R.sAt(x, z); if (sR > 22) continue
      const d = R.dist(x, z), hw = R.halfAt(sR); if (d < hw || d > hw + 6) continue
      if (YOSE.inLake(x, z, 0.3) || alpineTrailDist(x, z) < 1.8) continue
      let nearB = false; for (const b of RIVER_BRIDGES) { const ax = x - b.x, az = z - b.z; if (Math.abs(ax * b.dir[0] + az * b.dir[1]) < b.half + 3 && Math.abs(-ax * b.dir[1] + az * b.dir[0]) < b.hw + 2) nearB = true } if (nearB) continue
      const q = j * AG.nx + i, cap = R.water(sR) + 0.12 + (d - hw) * 0.75
      if (aHeight[q] > cap) aHeight[q] = lerp(aHeight[q], cap, smoothstep(hw + 6, hw + 3.5, d))
    } }
}

// 2026-11-14 同一張照片：舊路（以前從 x190 一路下到 x178 過河）拆掉後留下一塊塊被削過、墊過的土台，一公尺升 1.7 m 的土牆上擺著石頭。
// 瀑布下這一塊（x 181～194、z 58～76）把地形抹順 40 次（每格換成跟四周的平均），湖、河道、步道、橋頭那幾格固定不動
{
  const x0 = 174, x1 = 194, z0 = 58, z1 = 78, R = ALP_RIVER
  const ia = Math.round((x0 - AG.x0) / AG.cell), ib = Math.round((x1 - AG.x0) / AG.cell), ja = Math.round((z0 - AG.z0) / AG.cell), jb = Math.round((z1 - AG.z0) / AG.cell)
  const W = ib - ia + 1, H = jb - ja + 1, fix = new Uint8Array(W * H)
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) { const x = AG.x0 + (ia + i) * AG.cell, z = AG.z0 + (ja + j) * AG.cell
    let f = YOSE.inLake(x, z, 0.8) || R.dist(x, z) < R.halfAt(R.sAt(x, z)) + 0.6 || alpineTrailDist(x, z) < 1.6 || i === 0 || j === 0 || i === W - 1 || j === H - 1
    for (const b of RIVER_BRIDGES) { const ax = x - b.x, az = z - b.z; if (Math.abs(ax * b.dir[0] + az * b.dir[1]) < b.half + 2 && Math.abs(-ax * b.dir[1] + az * b.dir[0]) < b.hw + 1.5) f = true }
    fix[j * W + i] = f ? 1 : 0 }
  const tmp = new Float32Array(W * H)
  for (let it = 0; it < 40; it++) {
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) { const q = (ja + j) * AG.nx + ia + i
      tmp[j * W + i] = fix[j * W + i] ? aHeight[q] : (aHeight[q - 1] + aHeight[q + 1] + aHeight[q - AG.nx] + aHeight[q + AG.nx] + aHeight[q] * 2) / 6 }
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) aHeight[(ja + j) * AG.nx + ia + i] = tmp[j * W + i]
  }
  // 抹完：水邊外 0.1～1.6 m 的岸至少比水面高 8 cm（不然河面漫到岸上）
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) { const x = AG.x0 + (ia + i) * AG.cell, z = AG.z0 + (ja + j) * AG.cell, q = (ja + j) * AG.nx + ia + i
    if (YOSE.inLake(x, z, 0)) continue
    const sR = R.sAt(x, z), d = R.dist(x, z), hw = R.halfAt(sR); if (d < hw + 0.1 || d > hw + 1.6) continue
    const need = R.water(sR) + 0.08; if (aHeight[q] < need) aHeight[q] = need }
}

// 2026-11-14 使用者（橋頭照片）「缺口橋沒弄好」：橋墊高之後橋頭前面的路比橋面低 0.2～0.3 m，石板和石欄的頭懸在路上。
// 最後一步：橋頭外 1.2 m 內的路面墊到橋面下 6 cm，往外 6 m 慢慢接回（只墊高）
for (const b of RIVER_BRIDGES) {
  const L = b.half + 0.3, R = L + 8
  const i0 = Math.floor((b.x - R - AG.x0) / AG.cell), i1 = Math.ceil((b.x + R - AG.x0) / AG.cell), j0 = Math.floor((b.z - R - AG.z0) / AG.cell), j1 = Math.ceil((b.z + R - AG.z0) / AG.cell)
  for (let j = Math.max(0, j0); j <= Math.min(AG.nz - 1, j1); j++) for (let i = Math.max(0, i0); i <= Math.min(AG.nx - 1, i1); i++) {
    const x = AG.x0 + i * AG.cell, z = AG.z0 + j * AG.cell, ax = x - b.x, az = z - b.z, al = ax * b.dir[0] + az * b.dir[1], lat = Math.abs(-ax * b.dir[1] + az * b.dir[0]), q = j * AG.nx + i
    const out = Math.abs(al) - L; if (out < -0.6 || out > 7 || lat > b.hw + 2.2) continue
    const tgt = b.y + b.k * al - 0.06, w = smoothstep(7, 1.2, out) * smoothstep(b.hw + 2.2, b.hw + 0.8, lat)
    const h = lerp(aHeight[q], tgt, w); if (h > aHeight[q]) aHeight[q] = h
  }
}

// 2026-11-14 改線後 yose 最後兩段（過河後到營地）路面照縱斷面重新鋪一次：營地邊上有一道 1.4 m 的坎（別的整地留下的）
{
  const sp = ALP_SPURS.find((q) => q.name === 'yose'), n = sp.pts.length, segs = []
  for (let k = n - 2; k < n; k++) segs.push([sp.pts[k - 1], sp.pts[k], +sp.prof[k - 1], +sp.prof[k]])
  for (const [P, Q, ya, yb] of segs) {
    const dx = Q[0] - P[0], dz = Q[1] - P[1], l2 = dx * dx + dz * dz
    const i0 = Math.floor((Math.min(P[0], Q[0]) - 4 - AG.x0) / AG.cell), i1 = Math.ceil((Math.max(P[0], Q[0]) + 4 - AG.x0) / AG.cell), j0 = Math.floor((Math.min(P[1], Q[1]) - 4 - AG.z0) / AG.cell), j1 = Math.ceil((Math.max(P[1], Q[1]) + 4 - AG.z0) / AG.cell)
    for (let j = Math.max(0, j0); j <= Math.min(AG.nz - 1, j1); j++) for (let i = Math.max(0, i0); i <= Math.min(AG.nx - 1, i1); i++) {
      const x = AG.x0 + i * AG.cell, z = AG.z0 + j * AG.cell, t = clamp(((x - P[0]) * dx + (z - P[1]) * dz) / l2, 0, 1), d = Math.hypot(x - P[0] - dx * t, z - P[1] - dz * t), q = j * AG.nx + i
      if (d > 3.6) continue
      let kb = 0; for (const b of RIVER_BRIDGES) { const ax = x - b.x, az = z - b.z, out = Math.abs(ax * b.dir[0] + az * b.dir[1]) - b.half - 0.3, lat = Math.abs(-ax * b.dir[1] + az * b.dir[0]); kb = Math.max(kb, smoothstep(7, 2, out) * smoothstep(b.hw + 2.2, b.hw + 0.8, lat)) }   // 橋頭引道那段讓橋自己管
      const w = 1 - clamp((d - 1.6) / 2.0, 0, 1)
      aHeight[q] = lerp(aHeight[q], lerp(ya, yb, t), w * w * (3 - 2 * w) * (1 - kb))
    }
  }
}
