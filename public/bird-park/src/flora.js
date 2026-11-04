// 植物與園藝小物：全部用 InstancedMesh，一種東西一次畫完
import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import {
  TAU, MTN, PATHS, RAMP, DOME, POOL, clamp, lerp,
  domeY, terrainHeight, pathClearAt, poolQ, mtnR, rampSample, rampHeights, rampInner, insideGarden, distToMtn,
  colliders, addCollider,
} from './layout.js'
import { mulberry32, fbm2 } from './noise.js'
import { addWind, windUniforms } from './wind.js'
import { scatter, nodeHeight } from './plants.js'
import * as T from './textures.js'

const UP = new THREE.Vector3(0, 1, 0)
const _m = new THREE.Matrix4()

/* ---------- 幾何 ---------- */
function flowerHead() {
  const P = [0, 0, 0], C = [1, 0.85, 0.35], I = []
  const N = 40
  for (let i = 0; i <= N; i++) {
    const a = (i / N) * TAU
    const r = 0.25 + 0.75 * Math.abs(Math.cos(a * 2.5))
    P.push(Math.cos(a) * r * 0.5, 0.12 * r, Math.sin(a) * r * 0.5)
    C.push(1, 1, 1)
    if (i > 0) I.push(0, i + 1, i)
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3))
  g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3))
  g.setIndex(I)
  g.computeVertexNormals()
  return g
}
/* ---------- 擺放輔助 ---------- */
function makeInst(geo, mat, list, { cast = true, receive = true, colors = null } = {}) {
  const m = new THREE.InstancedMesh(geo, mat, Math.max(1, list.length))
  list.forEach((it, i) => {
    _m.compose(it.p, it.q, it.s)
    m.setMatrixAt(i, _m)
    if (colors) m.setColorAt(i, it.c)
  })
  m.count = list.length
  m.castShadow = cast
  m.receiveShadow = receive
  m.computeBoundingSphere()
  return m
}
const qY = (a) => new THREE.Quaternion().setFromAxisAngle(UP, a)
const v3 = (x, y, z) => new THREE.Vector3(x, y, z)
const sc = (s) => new THREE.Vector3(s, s, s)

function freeOfColliders(x, z, r) {
  for (const c of colliders) if (Math.hypot(x - c.x, z - c.z) < c.r + r) return false
  return true
}
function groundOK(x, z, { clear = 1, mtnPad = 1.2, pool = 1.3, rho = 0.94 } = {}) {
  if (!insideGarden(x, z, rho)) return false
  // 鳥活動的範圍（停棲樹、走路的草地）不種東西
  for (const r of reserved) if ((x - r.x) ** 2 + (z - r.z) ** 2 < r.r * r.r) return false
  if (pathClearAt(x, z) < clear) return false
  if (poolQ(x, z) < pool) return false
  const d = distToMtn(x, z)
  if (d < mtnR(Math.atan2(z - MTN.z, x - MTN.x), 0) + mtnPad) return false
  // 低矮步道正下方不種，免得穿出步道
  const gy = terrainHeight(x, z)
  if (d < 20 && rampHeights(x, z).some((h) => h - gy < 2.5)) return false
  return true
}
function randInGarden(rnd) {
  const a = rnd() * TAU, r = Math.sqrt(rnd()) * 0.94
  return [DOME.A * r * Math.cos(a), DOME.B * r * Math.sin(a)]
}

/* ---------- 主體 ---------- */
let reserved = []
export function buildFlora(scene, lib, { stopsFor, reserve = [] } = {}) {
  reserved = reserve
  const rnd = mulberry32(2024)
  const tex = {
    vine: T.vineTex(),
  }
  const foliage = (map, wind, extra = {}) => addWind(new THREE.MeshStandardMaterial({ map, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.85, ...extra }), wind)
  const mats = {
    vine: foliage(tex.vine, 0.004),
    flower: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, side: THREE.DoubleSide }),
    stem: new THREE.MeshStandardMaterial({ color: 0x4f7a2a, roughness: 0.9 }),
    wood: new THREE.MeshStandardMaterial({ color: 0x9a6a40, roughness: 0.8 }),
    metal: new THREE.MeshStandardMaterial({ color: 0x3e4447, roughness: 0.4, metalness: 0.7 }),
    lamp: new THREE.MeshStandardMaterial({ color: 0xfff2d0, emissive: 0xffd89a, emissiveIntensity: 1.2 }),
  }

  /* --- 步道邊的長椅、路燈、解說牌 --- */
  const benches = [], lamps = [], signs = []
  for (const p of PATHS) {
    if (p.name === 'spur') continue
    const pts = p.points
    const every = p.name === 'loop' ? 70 : 45
    for (let k = 20; k < pts.length - 10; k += every) {
      const a = pts[k - 1], b = pts[k + 1]
      const tx = b.x - a.x, tz = b.z - a.z, tl = Math.hypot(tx, tz)
      const nx = -tz / tl, nz = tx / tl
      const side = (k / every) % 2 < 1 ? 1 : -1
      const off = p.w / 2 + 0.9
      const x = pts[k].x + nx * off * side, z = pts[k].z + nz * off * side
      if (!insideGarden(x, z, 0.92) || poolQ(x, z) < 1.4) continue
      if (distToMtn(x, z) < mtnR(Math.atan2(z - MTN.z, x - MTN.x), 0) + 2) continue
      const face = Math.atan2(-nx * side, -nz * side)
      if (rnd() < 0.55) {
        benches.push({ p: v3(x, terrainHeight(x, z), z), q: qY(face), s: sc(1) })
        addCollider(x, z, 0.9, terrainHeight(x, z) + 1)
      } else {
        signs.push({ p: v3(x, terrainHeight(x, z), z), q: qY(face), s: sc(1) })
        addCollider(x, z, 0.4, terrainHeight(x, z) + 1.6)
      }
    }
    // 路燈：另一側、錯開
    for (let k = 35; k < pts.length - 10; k += 55) {
      const a = pts[k - 1], b = pts[k + 1]
      const tx = b.x - a.x, tz = b.z - a.z, tl = Math.hypot(tx, tz)
      const side = (k / 55) % 2 < 1 ? -1 : 1
      const off = p.w / 2 + 0.45
      const x = pts[k].x - tz / tl * off * side, z = pts[k].z + tx / tl * off * side
      if (!insideGarden(x, z, 0.92) || poolQ(x, z) < 1.3 || !freeOfColliders(x, z, 0.6)) continue
      if (distToMtn(x, z) < mtnR(Math.atan2(z - MTN.z, x - MTN.x), 0) + 1.5) continue
      lamps.push({ p: v3(x, terrainHeight(x, z), z), q: qY(0), s: sc(1) })
      addCollider(x, z, 0.18, terrainHeight(x, z) + 4)
    }
  }
  {
    const seat = []
    for (let i = 0; i < 4; i++) seat.push(new THREE.BoxGeometry(1.8, 0.05, 0.11).translate(0, 0.45, -0.2 + i * 0.13))
    for (let i = 0; i < 3; i++) seat.push(new THREE.BoxGeometry(1.8, 0.1, 0.04).rotateX(-0.2).translate(0, 0.62 + i * 0.13, -0.28 - i * 0.03))
    const legs = []
    for (const x of [-0.8, 0.8]) legs.push(new THREE.BoxGeometry(0.06, 0.45, 0.5).translate(x, 0.22, -0.05), new THREE.BoxGeometry(0.06, 0.5, 0.06).translate(x, 0.7, -0.32))
    const g = mergeGeometries([mergeGeometries(seat), mergeGeometries(legs)], true)
    scene.add(makeInst(g, [mats.wood, mats.metal], benches))
  }
  {
    const post = new THREE.CylinderGeometry(0.06, 0.09, 3.2, 8).translate(0, 1.6, 0)
    const head = new THREE.CylinderGeometry(0.22, 0.16, 0.45, 8).translate(0, 3.35, 0)
    const cap = new THREE.ConeGeometry(0.3, 0.25, 8).translate(0, 3.7, 0)
    scene.add(makeInst(mergeGeometries([post, cap]), mats.metal, lamps))
    scene.add(makeInst(head, mats.lamp, lamps, { cast: false }))
  }
  {
    const post = new THREE.BoxGeometry(0.12, 1.1, 0.12).translate(0, 0.55, 0)
    const board = new THREE.BoxGeometry(0.9, 0.6, 0.06).rotateX(-0.5).translate(0, 1.15, 0.05)
    const g = mergeGeometries([post, board], true)
    scene.add(makeInst(g, [mats.metal, mats.wood], signs))
  }

  /* --- 寫實植物模型（plants.js） --- */
  const pick = (names) => names[Math.floor(rnd() * names.length)]
  const tint = (h = 0.06, l = 0.12) => new THREE.Color().setHSL(0.25 + (rnd() - 0.5) * h, 0.15, 0.92 + (rnd() - 0.5) * l)
  const lists = {}
  const put = (name, it) => (lists[name] ||= []).push(it)
  const H = (name) => nodeHeight(lib[name])

  // 導覽站用的「主角」：固定位置，鏡頭對著拍（stops.js 用回傳的 heroes）
  const heroes = {}
  const nearOK = (x0, z0, opts, r = 0) => {
    for (let k = 0; k < 200; k++) {
      const a = k * 2.4, d = k * 0.15
      const x = x0 + Math.cos(a) * d, z = z0 + Math.sin(a) * d
      if (groundOK(x, z, opts) && freeOfColliders(x, z, r)) return [x, z]
    }
    return [x0, z0]
  }
  {
    const [x, z] = nearOK(-31, 25, { clear: 4, rho: 0.86 }, 6)
    const gy = terrainHeight(x, z)
    put('jungle', { p: v3(x, gy - 0.15, z), q: qY(2.2), s: sc(1), c: tint(0, 0) })
    addCollider(x, z, 1.1, gy + 20)
    heroes.jungle = v3(x, gy, z)
  }
  {
    // 林下一角：龜背芋、香蕉、火鶴、竹芋擠在一起
    const [x, z] = nearOK(-21, 11.5, { clear: 1.2, mtnPad: 2 }, 1)
    heroes.understory = v3(x, terrainHeight(x, z), z)
    // 鏡頭在左前方（-x、-z）：龜背芋在前、香蕉在後面撐高度
    const ring = [['monstera_b', 0, 0, 1.25], ['monstera_d', -0.9, 1.3, 1.05], ['anthurium_a', -1.5, -0.7, 1.5], ['calathea_a', 0.7, -1.3, 1.5],
      ['banana_b', 1.8, 1.4, 1.15], ['banana_a', 2.6, -0.3, 1], ['fern_b', -0.6, -1.9, 1.05], ['anthurium_b', -2.3, 0.8, 1.4], ['monstera_a', 1.2, 2.6, 1]]
    for (const [name, dx, dz, sc0] of ring) {
      const px = x + dx, pz = z + dz
      put(name, { p: v3(px, terrainHeight(px, pz) - 0.04, pz), q: qY(rnd() * TAU), s: sc(sc0), c: tint() })
      addCollider(px, pz, 0.5, terrainHeight(px, pz) + 2)
    }
  }

  // 導覽鏡頭的視線上不種東西：沿著鏡頭→注視點取樣，每點一個淨空圓
  const stops = stopsFor ? stopsFor(heroes) : []
  const sight = []
  for (const st of stops) {
    for (let k = 0; k <= 1.001; k += 0.05) {
      const x = st.pos.x + (st.target.x - st.pos.x) * k, z = st.pos.z + (st.target.z - st.pos.z) * k
      const y = st.pos.y + (st.target.y - st.pos.y) * k
      sight.push({ x, z, y, k })
    }
  }
  // h：要種的東西多高；只有會擋到視線（比視線那一點高）的才要避開
  const clearOK = (x, z, r, h) => {
    for (const p of sight) {
      if (p.k > 0.85) continue
      if (h < p.y - terrainHeight(p.x, p.z) - 0.6 && p.k > 0.12) continue
      const rr = r + 0.6 + p.k * 2.2
      if ((x - p.x) ** 2 + (z - p.z) ** 2 < rr * rr) return false
    }
    return true
  }

  // 雨林大樹：數量少、撐起上層樹冠
  let tries = 0, n = 1
  while (n < 13 && tries++ < 4000) {
    const [x, z] = randInGarden(rnd)
    if (!groundOK(x, z, { clear: 4, rho: 0.86 }) || distToMtn(x, z) < 27 || !freeOfColliders(x, z, 7) || !clearOK(x, z, 8, 25)) continue
    const gy = terrainHeight(x, z)
    const s = Math.min(0.7 + rnd() * 0.45, (domeY(x, z) - gy - 2) / H('jungle'))
    if (s < 0.5) continue
    put('jungle', { p: v3(x, gy - 0.15, z), q: qY(rnd() * TAU), s: sc(s), c: tint() })
    addCollider(x, z, 1.1 * s, gy + 20 * s)
    n++
  }
  // 入口大道兩旁一排棕櫚
  {
    const entry = PATHS.find((p) => p.name === 'entry'), pts = entry.points
    let last = -99
    for (let k = 2; k < pts.length - 2; k++) {
      const d = pts[k].distanceTo(pts[0])
      if (d - last < 7) continue
      last = d
      const a = pts[k - 1], b = pts[k + 1], tx = b.x - a.x, tz = b.z - a.z, tl = Math.hypot(tx, tz) || 1
      for (const side of [-1, 1]) {
        const off = entry.w / 2 + 2.2
        const x = pts[k].x - tz / tl * off * side, z = pts[k].z + tx / tl * off * side
        if (!insideGarden(x, z, 0.93) || !freeOfColliders(x, z, 1) || !clearOK(x, z, 3.5, 14)) continue
        const name = pick(['coco_a', 'coco_f', 'coco_c', 'coco_e']), gy = terrainHeight(x, z)
        const s = Math.min(0.85 + rnd() * 0.25, (domeY(x, z) - gy - 1.5) / H(name))
        if (s < 0.5) continue
        put(name, { p: v3(x, gy - 0.1, z), q: qY(rnd() * TAU), s: sc(s), c: tint() })
        addCollider(x, z, 0.35, gy + H(name) * s)
      }
    }
  }
  // 棕櫚（高的椰子類＋矮的叢生棕櫚）
  const palmNames = ['coco_a', 'coco_b', 'coco_c', 'coco_d', 'coco_e', 'coco_f', 'palm_a', 'palm_b', 'palm_c', 'palm_b']
  tries = 0; n = 0
  while (n < 48 && tries++ < 5000) {
    const [x, z] = randInGarden(rnd)
    if (!groundOK(x, z, { clear: 2, rho: 0.9 }) || distToMtn(x, z) < 22 || !freeOfColliders(x, z, 2.4) || !clearOK(x, z, 4.5, 14)) continue
    const name = pick(palmNames), gy = terrainHeight(x, z)
    const s = Math.min(0.8 + rnd() * 0.4, (domeY(x, z) - gy - 1.5) / H(name))
    if (s < 0.55) continue
    put(name, { p: v3(x, gy - 0.1, z), q: qY(rnd() * TAU), s: sc(s), c: tint() })
    addCollider(x, z, 0.35, gy + H(name) * s)
    n++
  }
  // 中層小樹（馬拉巴栗）與香蕉
  tries = 0; n = 0
  while (n < 90 && tries++ < 6000) {
    const [x, z] = randInGarden(rnd)
    if (!groundOK(x, z, { clear: 1.6, mtnPad: 2 }) || !freeOfColliders(x, z, 1.6) || !clearOK(x, z, 1.5, 4)) continue
    const name = pick(['pachira_c', 'pachira_d', 'banana_a', 'banana_b', 'banana_a'])
    const s = name.startsWith('pachira') ? 1 + rnd() * 0.5 : 0.8 + rnd() * 0.45
    put(name, { p: v3(x, terrainHeight(x, z) - 0.05, z), q: qY(rnd() * TAU), s: sc(s), c: tint() })
    addCollider(x, z, 0.3, terrainHeight(x, z) + H(name) * s)
    n++
  }
  // 大葉植物：龜背芋
  tries = 0; n = 0
  while (n < 170 && tries++ < 6000) {
    const [x, z] = randInGarden(rnd)
    if (!groundOK(x, z, { clear: 1.1, mtnPad: 1.4 }) || !freeOfColliders(x, z, 0.6) || !clearOK(x, z, 1.1, 2)) continue
    put(pick(['monstera_a', 'monstera_b', 'monstera_c', 'monstera_d']), { p: v3(x, terrainHeight(x, z) - 0.05, z), q: qY(rnd() * TAU), s: sc(0.75 + rnd() * 0.6), c: tint() })
    n++
  }
  // 步道邊的低矮觀葉植物（火鶴、竹芋），貼著路緣種
  for (const p of PATHS) {
    for (let k = 0; k < p.points.length; k += 2) {
      if (rnd() < 0.35) continue
      const a = p.points[Math.max(0, k - 1)], b = p.points[Math.min(p.points.length - 1, k + 1)]
      const tx = b.x - a.x, tz = b.z - a.z, tl = Math.hypot(tx, tz) || 1
      const side = rnd() < 0.5 ? -1 : 1, off = p.w / 2 + 0.45 + rnd() * 1.6
      const x = p.points[k].x - tz / tl * off * side, z = p.points[k].z + tx / tl * off * side
      if (!groundOK(x, z, { clear: 0.35, mtnPad: 1, pool: 1.15 }) || !freeOfColliders(x, z, 0.3)) continue
      const name = pick(['anthurium_a', 'anthurium_b', 'anthurium_c', 'calathea_a', 'calathea_b', 'calathea_c', 'fern2_b', 'fern2_c'])
      put(name, { p: v3(x, terrainHeight(x, z) - 0.03, z), q: qY(rnd() * TAU), s: sc(0.9 + rnd() * 0.5), c: tint() })
    }
  }
  // 地被蕨類
  tries = 0; n = 0
  while (n < 650 && tries++ < 9000) {
    const [x, z] = randInGarden(rnd)
    if (!groundOK(x, z, { clear: 0.5, mtnPad: 0.8, pool: 1.15 })) continue
    put(pick(['fern_sa', 'fern_sb', 'fern2_b', 'fern2_c', 'fern_b', 'fern_c']), { p: v3(x, terrainHeight(x, z) - 0.04, z), q: qY(rnd() * TAU), s: sc(0.7 + rnd() * 0.6), c: tint() })
    n++
  }
  // 山壁上的植物：方向往外偏
  const onMountain = (y0, y1) => {
    const th = rnd() * TAU, y = lerp(y0, y1, rnd())
    const gorge = Math.abs(((th % TAU) + TAU) % TAU - Math.PI)   // 離瀑布峽谷多遠
    if (gorge < 0.25) return null
    const r = mtnR(th, y)
    const out = v3(Math.cos(th), 0, Math.sin(th))
    const slope = (mtnR(th, y - 1) - mtnR(th, y + 1)) * 0.5
    const n = out.clone().multiplyScalar(1).add(v3(0, clamp(slope, 0, 2) + 0.4, 0)).normalize()
    return { th, y, r, n, p: v3(MTN.x + (r - 0.15) * Math.cos(th), y, MTN.z + (r - 0.15) * Math.sin(th)) }
  }
  const alignTo = (n, spin) => new THREE.Quaternion().setFromUnitVectors(UP, n.clone().lerp(UP, 0.35).normalize()).multiply(qY(spin))
  for (let k = 0; k < 1900; k++) {
    const m = onMountain(-0.5, MTN.h)
    if (!m) continue
    put(pick(['fern_sa', 'fern_sb', 'fern2_b', 'fern2_c', 'fern_a', 'fern_b']), { p: m.p, q: alignTo(m.n, rnd() * TAU), s: sc(0.8 + rnd() * 0.8), c: tint() })
  }
  for (let k = 0; k < 520; k++) {
    const m = onMountain(1, MTN.h)
    if (!m) continue
    put('brom', { p: m.p, q: alignTo(m.n, rnd() * TAU), s: sc(0.9 + rnd() * 0.9), c: new THREE.Color().setHSL(rnd(), 0.1, 0.95) })
  }
  for (let k = 0; k < 420; k++) {
    const m = onMountain(0, MTN.h - 2)
    if (!m) continue
    put(pick(['anthurium_a', 'anthurium_b', 'calathea_a', 'monstera_a', 'anthurium_c']), { p: m.p, q: alignTo(m.n, rnd() * TAU), s: sc(m.y > 3 ? 0.9 + rnd() * 0.5 : 1 + rnd() * 0.6), c: tint() })
  }
  // 山壁岩塊：大半埋進山體，只露出長苔的那一面，打散車床曲面的平滑感；不能凸出到空中步道
  const rockNames = ['mrock_1', 'mrock_2', 'mrock_4', 'mrock_5', 'mrock_6', 'mrock_11', 'mrock_13']
  for (let k = 0, placed = 0; k < 2000 && placed < 150; k++) {
    const th = rnd() * TAU, y = -1 + rnd() * (MTN.h - 1)
    if (Math.abs(((th % TAU) + TAU) % TAU - Math.PI) < 0.3) continue
    const r = mtnR(th, y)
    const room = y < RAMP.y1 + 3 ? rampInner(y) - r - 0.4 : 1.5
    if (room < 0.15) continue
    const s = 1.1 + rnd() * 0.9
    const show = Math.min(room, 0.35 * s)          // 露出山壁外多少
    const out = v3(Math.cos(th), 0, Math.sin(th))
    // 岩塊的「上面」（長苔那面）朝外上方
    const q = new THREE.Quaternion().setFromUnitVectors(UP, out.clone().add(v3(0, 1.2, 0)).normalize()).multiply(qY(rnd() * TAU))
    const d = r + show - 0.7 * s
    put(pick(rockNames), { p: v3(MTN.x + d * out.x, y, MTN.z + d * out.z), q, s: sc(s), c: new THREE.Color().setHSL(0.22, 0.12, 0.85 + rnd() * 0.1) })
    placed++
  }
  // 地上散石與池邊石
  tries = 0; n = 0
  while (n < 70 && tries++ < 3000) {
    const [x, z] = randInGarden(rnd)
    if (!groundOK(x, z, { clear: 0.8 })) continue
    const name = pick(['mrock_3', 'mrock_7', 'mrock_8', 'mrock_9', 'mrock_10', 'mrock_12', 'boulder'])
    const s = 0.5 + rnd() ** 2 * 1.1
    put(name, { p: v3(x, terrainHeight(x, z) - 0.12 * s, z), q: qY(rnd() * TAU), s: sc(s) })
    if (s > 0.8) addCollider(x, z, s, terrainHeight(x, z) + s * 0.6)
    n++
  }
  for (let i = 0; i < 64; i++) {
    const a = (i / 64) * TAU + rnd() * 0.06, k = 1.06 + rnd() * 0.12
    const x = POOL.x + POOL.rx * k * Math.cos(a), z = POOL.z + POOL.rz * k * Math.sin(a)
    if (distToMtn(x, z) < mtnR(Math.atan2(z - MTN.z, x - MTN.x), 0) + 0.3 || pathClearAt(x, z) < 0.6) continue
    const name = pick(['mrock_7', 'mrock_8', 'mrock_9', 'mrock_10', 'mrock_12', 'mrock_13'])
    put(name, { p: v3(x, terrainHeight(x, z) - 0.25, z), q: qY(-a + (rnd() - 0.5)), s: sc(0.7 + rnd() * 0.5) })
  }

  // 風：樹梢擺幅（公尺）
  const windOf = (name) => name === 'jungle' ? 0.25 : name.startsWith('coco') || name.startsWith('palm') ? 0.35
    : name.startsWith('mrock') || name.startsWith('rock') || name === 'boulder' ? 0 : name.startsWith('fern') ? 0.06 : 0.1
  const counts = {}
  for (const [name, list] of Object.entries(lists)) {
    if (!lib[name]) { console.warn('缺模型', name); continue }
    const small = /^(fern|anthurium|calathea|brom)/.test(name)
    scatter(scene, lib[name], list, { wind: windOf(name), cast: !small })
    counts[name] = list.length
  }

  /* --- 花 --- */
  const heads = [], stems = []
  const palettes = [
    [0xe8506a, 0xf28aa0], [0xf2c230, 0xf7dd70], [0xb065d6, 0xd49af0], [0xffffff, 0xf6eef2],
    [0xff7a3d, 0xffa86b], [0xe04848, 0xff6f6f], [0x6c8ff0, 0x9cb5ff],
  ]
  const addFlower = (x, y, z, col, h, size) => {
    stems.push({ p: v3(x, y, z), q: qY(0), s: v3(1, h, 1) })
    heads.push({ p: v3(x, y + h, z), q: new THREE.Quaternion().setFromEuler(new THREE.Euler((rnd() - 0.5) * 0.6, rnd() * TAU, (rnd() - 0.5) * 0.6)), s: sc(size), c: new THREE.Color(col) })
  }
  // 花圃：沿步道邊成片
  const beds = []
  tries = 0
  while (beds.length < 26 && tries++ < 3000) {
    const p = PATHS[Math.floor(rnd() * PATHS.length)]
    const pt = p.points[Math.floor(rnd() * p.points.length)]
    const a = rnd() * TAU, off = p.w / 2 + 2.2 + rnd() * 1.5
    const x = pt.x + Math.cos(a) * off, z = pt.z + Math.sin(a) * off
    if (!groundOK(x, z, { clear: 1.2, mtnPad: 2 }) || !freeOfColliders(x, z, 1.5)) continue
    if (beds.some((b) => Math.hypot(b.x - x, b.z - z) < 8)) continue
    beds.push({ x, z })
  }
  for (const b of beds) {
    const pal = palettes[Math.floor(rnd() * palettes.length)]
    const R = 1.6 + rnd() * 1.6
    for (let k = 0; k < 140; k++) {
      const a = rnd() * TAU, rr = Math.sqrt(rnd()) * R
      const x = b.x + Math.cos(a) * rr * 1.4, z = b.z + Math.sin(a) * rr
      if (pathClearAt(x, z) < 0.3) continue
      addFlower(x, terrainHeight(x, z), z, pal[k % 2], 0.25 + rnd() * 0.45, 0.13 + rnd() * 0.08)
    }
  }
  // 零星野花
  for (let k = 0; k < 1400; k++) {
    const [x, z] = randInGarden(rnd)
    if (!groundOK(x, z, { clear: 0.4, mtnPad: 0.8, pool: 1.15 })) continue
    const pal = palettes[Math.floor(Math.abs(fbm2(x * 0.05, z * 0.05)) * 40) % palettes.length]
    addFlower(x, terrainHeight(x, z), z, pal[k % 2], 0.15 + rnd() * 0.4, 0.1 + rnd() * 0.06)
  }
  // 山壁蘭花（只有花）
  const orchids = [0xd65bc8, 0xf2f0f5, 0xb74fe0, 0xf5a0c8, 0xfff07a]
  for (let k = 0; k < 520; k++) {
    const m = onMountain(1, MTN.h)
    if (!m) continue
    const p = m.p.clone().addScaledVector(m.n, 0.35)
    heads.push({ p, q: alignTo(m.n, rnd() * TAU), s: sc(0.16 + rnd() * 0.1), c: new THREE.Color(orchids[k % orchids.length]) })
  }
  scene.add(makeInst(new THREE.CylinderGeometry(0.012, 0.015, 1, 4).translate(0, 0.5, 0), mats.stem, stems, { cast: false }))
  scene.add(makeInst(flowerHead(), mats.flower, heads, { colors: true, cast: false }))

  /* --- 草：一片一片的草葉，成叢長 --- */
  {
    const A = [], B = []
    const base = new THREE.Color(), c = new THREE.Color()
    tries = 0
    let clumps = 0
    // 一半撒全園，一半集中在步道兩旁 5 公尺內（鏡頭最常看的地方）
    while (clumps < 80000 && tries++ < 500000) {
      let x, z
      if (clumps % 2) [x, z] = randInGarden(rnd)
      else {
        const p = PATHS[Math.floor(rnd() * PATHS.length)], pt = p.points[Math.floor(rnd() * p.points.length)]
        const a = rnd() * TAU, d = p.w / 2 + rnd() * 5
        x = pt.x + Math.cos(a) * d; z = pt.z + Math.sin(a) * d
      }
      if (!groundOK(x, z, { clear: 0.12, mtnPad: 0.4, pool: 1.1, rho: 0.96 })) continue
      // 鏡頭腳下不長草（近距離的草葉會大到擋住畫面）
      if (stops.some((st) => (st.pos.x - x) ** 2 + (st.pos.z - z) ** 2 < 9)) continue
      // 大片的疏密：有的地方是草坪，有的只稀稀落落
      const dens = fbm2(x * 0.06 + 3, z * 0.06)
      if (rnd() > 0.45 + dens * 1.4) continue
      const gy = terrainHeight(x, z) - 0.01
      base.setHSL(0.24 + dens * 0.05 + (rnd() - 0.5) * 0.03, 0.5, 0.33 + rnd() * 0.08)
      const m = 4 + Math.floor(rnd() * 6), a0 = rnd() * TAU, tall = 0.22 + rnd() * 0.35 + Math.max(0, dens) * 0.3
      for (let j = 0; j < m; j++) {
        const a = a0 + (j / m) * TAU + (rnd() - 0.5) * 0.7, d = rnd() * 0.06
        c.copy(base)
        if (rnd() < 0.06) c.lerp(new THREE.Color(0.55, 0.5, 0.28), 0.5)
        A.push(x + Math.cos(a) * d, gy, z + Math.sin(a) * d, a)
        B.push(c.r, c.g, c.b, tall * (0.6 + rnd() * 0.6))
      }
      clumps++
    }
    // 一片草：4 段、越上越窄，頂端收成一點；擺放、彎曲、風都在 shader 裡做
    const ys = [0, 0.3, 0.56, 0.78], ws = [1, 0.85, 0.62, 0.36], P = [], I = []
    ys.forEach((y, i) => P.push(-0.5 * ws[i], y, 0, 0.5 * ws[i], y, 0))
    P.push(0, 1, 0)
    for (let i = 0; i < ys.length - 1; i++) { const k = i * 2; I.push(k, k + 1, k + 3, k, k + 3, k + 2) }
    const tip = ys.length * 2; I.push(tip - 2, tip - 1, tip)
    const g = new THREE.InstancedBufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3))
    g.setAttribute('normal', new THREE.Float32BufferAttribute(P.map((_, i) => (i % 3 === 1 ? 1 : 0)), 3))
    g.setIndex(I)
    g.setAttribute('gA', new THREE.InstancedBufferAttribute(new Float32Array(A), 4))
    g.setAttribute('gB', new THREE.InstancedBufferAttribute(new Float32Array(B), 4))
    g.instanceCount = A.length / 4
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 100)
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.9, side: THREE.DoubleSide })
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = windUniforms.uTime
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', `#include <common>
          uniform float uTime;
          attribute vec4 gA;   // x, y, z, 方向
          attribute vec4 gB;   // 顏色 + 高度
          varying vec3 vGcol;`)
        .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
          vec2 nd = vec2(cos(gA.w), sin(gA.w));
          objectNormal = normalize(vec3(0.0, 1.0, 0.0) + vec3(nd.x, 0.0, nd.y) * 0.5 * (fract(gA.w * 3.7) > 0.5 ? 1.0 : -1.0));`)
        .replace('#include <begin_vertex>', `
          float a = gA.w, h = gB.w, y = position.y;
          float lean = 0.15 + fract(a * 7.13) * 0.6;
          float w = sin(uTime * 1.2 + gA.x * 0.3 + gA.z * 0.17) * 0.6 + sin(uTime * 2.9 + gA.x * 2.1 + gA.z * 1.7) * 0.2;
          vec2 dir = vec2(cos(a), sin(a));
          float wid = 0.014 + fract(a * 5.3) * 0.016;
          vec3 transformed = gA.xyz;
          transformed.xz += vec2(-dir.y, dir.x) * position.x * wid;
          transformed.xz += dir * lean * y * y * h + vec2(0.7, 0.35) * w * y * y * h * 0.25;
          transformed.y += y * h * (1.0 - 0.18 * lean);
          vGcol = gB.rgb * mix(0.35, 1.2, y);
          vGcol = mix(vGcol, vec3(0.78, 0.74, 0.42) * dot(gB.rgb, vec3(0.5)) * 1.6, smoothstep(0.65, 1.0, y) * step(0.75, fract(a * 13.7)) * 0.4);`)
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vGcol;')
        .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= vGcol;')
    }
    mat.customProgramCacheKey = () => 'grassBlade'
    const grass = new THREE.Mesh(g, mat)
    grass.receiveShadow = true
    grass.frustumCulled = false
    scene.add(grass)
  }

  /* --- 垂藤：步道外緣＋山壁凸出處 --- */
  {
    const geo = new THREE.PlaneGeometry(0.6, 1).translate(0, -0.5, 0)
    const list = []
    for (let k = 0; k < 420; k++) {
      const s = 0.03 + rnd() * 0.97, p = rampSample(s)
      const r = p.ro + 0.05
      const L = 2 + rnd() * 5
      list.push({ p: v3(MTN.x + r * Math.cos(p.th), p.y - 0.3, MTN.z + r * Math.sin(p.th)), q: qY(Math.PI / 2 - p.th), s: v3(1, Math.min(L, p.y - RAMP.y0 + 0.5), 1) })
    }
    for (let k = 0; k < 1500 && list.length < 700; k++) {
      const th = rnd() * TAU, y = 4 + rnd() * (MTN.h - 5)
      const r0 = mtnR(th, y)
      let L = 0
      while (L < 9 && mtnR(th, y - L - 0.5) < r0 - 0.25) L += 0.5
      if (L < 2) continue
      list.push({ p: v3(MTN.x + (r0 - 0.1) * Math.cos(th), y, MTN.z + (r0 - 0.1) * Math.sin(th)), q: qY(Math.PI / 2 - th), s: v3(1.2, L, 1) })
    }
    scene.add(makeInst(geo, mats.vine, list, { receive: true }))
  }

  return { mats, counts, heroes, stops }
}
