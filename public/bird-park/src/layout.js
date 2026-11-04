// 園區配置：所有尺寸、地形高度、步道、碰撞與可站立表面的查詢都在這裡。
// 單位是公尺，y 朝上。
import * as THREE from 'three'
import { fbm2, fbm3, noise3 } from './noise.js'

export const TAU = Math.PI * 2
export const DOME = { A: 75, B: 55, H: 40 }          // 橢圓溫室：長半軸、短半軸、頂高
export const MTN = { x: 12, z: -6, h: 32 }           // 中央雲霧山
export const POOL = { x: -3, z: -6, rx: 9, rz: 14, water: -0.55 }   // 西緣不能再往外（環山步道在 x≈-16）
export const RAMP = { theta0: Math.PI / 2, turns: 2.2, y0: 0, y1: 24, width: 3, gap: 2.1 }
export const DECK = { r: 4.5, x: 0, z: 0, y: 0 }
export const SPAWN = { x: -68, z: 0, yaw: -90, pitch: 3 }

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
export const domeRho = (x, z) => Math.hypot(x / DOME.A, z / DOME.B)
export function domeY(x, z) {
  const r2 = (x / DOME.A) ** 2 + (z / DOME.B) ** 2
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
  const y = RAMP.y0 + (RAMP.y1 - RAMP.y0) * s
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
  const e = rampSample(1)
  const rc = e.ro + 2.2
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
const ringPt = (a) => [MTN.x + RING_R * Math.cos(a), MTN.z + RING_R * Math.sin(a)]
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
  for (let i = 0; i < 20; i++) pts.push(ringPt((i / 20) * TAU))
  return pts
}
export const PATHS = [
  { name: 'entry', w: 4.2, curve: curve([[-74, 0], [-66, 0], [-58, 0], loopPt(Math.PI)]) },
  { name: 'loop', w: 3.4, curve: curve(loopPoints(), true) },
  { name: 'ring', w: 3.2, curve: curve(ringPoints(), true) },
  { name: 'west', w: 3.0, curve: curve([loopPt(Math.PI), [-38, 3], [-24, -1], ringPt(Math.PI - 0.12)]) },
  { name: 'south', w: 2.6, curve: curve([loopPt(Math.PI / 2), [6, 30], [11, 22.5], ringPt(Math.PI / 2)]) },
  { name: 'east', w: 2.6, curve: curve([loopPt(0), [44, -3], ringPt(-0.12)]) },
  { name: 'north', w: 2.6, curve: curve([loopPt(-Math.PI / 2), [1, -36], ringPt(-1.85)]) },
  { name: 'sw', w: 2.4, curve: curve([loopPt(2.3), [-28, 18], [-14, 15], ringPt(2.3)]) },
  { name: 'nw', w: 2.4, curve: curve([loopPt(-2.4), [-28, -20], [-16, -22], ringPt(-2.5)]) },
  { name: 'spur', w: 2.6, curve: curve([ringPt(1.0), [19.5, 11.6], [14.6, 10.45]]) },
]

/* ---------- 網格：步道距離與地形高度 ---------- */
const G = { x0: -80, z0: -60, cell: 0.5, nx: 321, nz: 241 }
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

function buildHeights() {
  for (let j = 0; j < G.nz; j++) {
    const z = G.z0 + j * G.cell
    for (let i = 0; i < G.nx; i++) {
      const x = G.x0 + i * G.cell
      const k = j * G.nx + i
      const rho = domeRho(x, z)
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
      // 水池
      const q = poolQ(x, z)
      h = lerp(-1.5, h, smoothstep(0.55, 1.25, q))
      if (rho > 1.02) h = 0
      height[k] = h
    }
  }
}

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

/* ---------- 碰撞 ---------- */
export const colliders = []   // { x, z, r, top }
export function addCollider(x, z, r, top = 99) { colliders.push({ x, z, r, top }) }

const PLAYER_R = 0.38
export function supportAt(x, z, feet) {
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
export function blocked(x, z, feet) {
  if (domeRho(x, z) > 0.955) return true
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
export const insideGarden = (x, z, margin = 0.93) => domeRho(x, z) < margin
export function distToMtn(x, z) { return Math.hypot(x - MTN.x, z - MTN.z) }
