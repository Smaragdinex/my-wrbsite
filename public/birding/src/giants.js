// 巨木林帶（2026-11-09 使用者：山區要像阿里山、紅杉國家公園那樣，走進山裡要有那種感覺）
// 步道中段（吊橋前後）兩側種一片紅檜／紅杉巨木：高 34～46 公尺、樹幹直徑 1.8～3.6 公尺，根部往外撐開成板根，
// 紅褐色帶縱向深裂紋的樹皮；樹冠只在上半段（下半段是光溜溜的巨大樹幹），一棵棵連起來把天空遮住。
// 樹冠縫隙有一束束斜射的陽光（跟著太陽方向和時間變，晚上沒有）。
// 全部用 InstancedMesh：一份樹幹、一份樹冠、一份光束，記憶體只多一點（學校電腦）。
import * as THREE from 'three'
import { ALP_TRAIL, ALP_BRIDGE, BRIDGE_DIM, ALP_POND, ALP_SPURS, CABIN, CAMP, inAlpine, alpineHeight, alpineTrailDist, alpineStreamDist, domeY, domeRho, addCollider } from './layout.js'
import { mulberry32 } from './noise.js'
import { coniferGeo, needleMaterial } from './alpine.js'
import { lodRegister } from './lod.js'
import { barkMaterial } from './bark.js'
import { scatter } from './plants.js'

const TAU = Math.PI * 2
// 巨木林的範圍：步道第 3～9 點附近（入口上坡之後、過吊橋、到南坡）
const SEG = [3, 9]
const bandDist = (x, z) => {
  let best = 1e9
  for (let i = SEG[0]; i < SEG[1]; i++) {
    const [ax, az] = ALP_TRAIL[i], [bx, bz] = ALP_TRAIL[i + 1], dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2))
    best = Math.min(best, Math.hypot(x - ax - dx * t, z - az - dz * t))
  }
  return best
}
const bridgeDist = (x, z) => {
  const a = ALP_TRAIL[ALP_BRIDGE.a], b = ALP_TRAIL[ALP_BRIDGE.a + 2], dx = b[0] - a[0], dz = b[1] - a[1]
  const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz)))
  return Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t)
}

// 巨木的位置：純地形計算（alpine.js 種其他樹時也要避開，所以先算好、記起來）
let SPOTS = null
export function giantSpots(avoid = []) {
  if (SPOTS) return SPOTS
  const rnd = mulberry32(4242), list = []
  // 神木（2026-11-09）：步道旁一棵特別粗的巨木（直徑約 5.5 公尺），外圍一圈木柵欄，像阿里山的香林神木。
  // 找過了吊橋那段（或入口上坡那段）離步道約 9 公尺、最平的一點
  {
    let best = null
    for (const i of [7, 8, 3, 4, 2, 9]) {
      const [ax, az] = ALP_TRAIL[i], [bx, bz] = ALP_TRAIL[i + 1], L = Math.hypot(bx - ax, bz - az)
      for (let t = 0.1; t <= 0.9; t += 0.04) for (const side of [-1, 1]) for (const off of [10, 11, 12.5, 14]) {
        const x = ax + (bx - ax) * t - (bz - az) / L * side * off, z = az + (bz - az) * t + (bx - ax) / L * side * off
        if (!inAlpine(x, z, 6) || domeRho(x, z) > 0.88 || alpineTrailDist(x, z) < 9.2 || alpineStreamDist(x, z) < 9 || bridgeDist(x, z) < 14) continue
        if (avoid.some((b) => Math.hypot(x - b.x, z - b.z) < 12)) continue
        const y = alpineHeight(x, z); let sl = 0
        for (let a = 0; a < 8; a++) sl = Math.max(sl, Math.abs(alpineHeight(x + Math.cos(a * 0.785) * 5.5, z + Math.sin(a * 0.785) * 5.5) - y))
        // 要跟步道差不多高、中間沒有土坡擋住（第一版放在切坡頂上，從步道只看得到一面坡和樹梢）
        const tx = ax + (bx - ax) * t, tz = az + (bz - az) * t, ty = alpineHeight(tx, tz)
        if (Math.abs(y - ty) > 2.4) continue
        let blocked = false
        for (let u = 0.15; u < 0.85; u += 0.1) if (alpineHeight(tx + (x - tx) * u, tz + (z - tz) * u) > ty + 1.4 + (y - ty) * u) blocked = true
        if (blocked) continue
        const H = Math.min(48, domeY(x, z) - y - 2)
        if (H < 34) continue
        if (!best || sl < best.sl) best = { x, z, y, sl, H }
      }
    }
    if (best) list.push({ x: best.x, z: best.z, y: best.y - 0.3, D: 5.6, H: best.H, rot: 0.6, lean: 0, sacred: true, fenceR: 6.6 })
  }
  for (let k = 0; k < 24000 && list.length < 170; k++) {
    const i = SEG[0] + Math.floor(rnd() * (SEG[1] - SEG[0])), t = rnd()
    const [ax, az] = ALP_TRAIL[i], [bx, bz] = ALP_TRAIL[i + 1], L = Math.hypot(bx - ax, bz - az)
    const side = rnd() < 0.5 ? -1 : 1, off = 4 + Math.pow(rnd(), 1.1) * 28
    const x = ax + (bx - ax) * t - (bz - az) / L * side * off, z = az + (bz - az) * t + (bx - ax) / L * side * off
    if (!inAlpine(x, z, 4) || domeRho(x, z) > 0.9) continue
    const D = 1.8 + Math.pow(rnd(), 1.6) * 1.8   // 樹幹直徑（多半 2 公尺上下，偶爾一棵特別粗）
    if (alpineTrailDist(x, z) < 3.2 + D * 0.9 || bridgeDist(x, z) < 6 + D || alpineStreamDist(x, z) < 3 + D * 0.6) continue
    if (Math.hypot(x - CABIN.x, z - CABIN.z) < CABIN.R + 6 || Math.hypot(x - CAMP.x, z - CAMP.z) < CAMP.R + 6 || Math.hypot(x - ALP_POND.x, z - ALP_POND.z) < ALP_POND.r + 4) continue
    if (avoid.some((b) => Math.hypot(x - b.x, z - b.z) < 4 + D)) continue
    if (list.some((g) => Math.hypot(g.x - x, g.z - z) < (g.sacred ? g.fenceR + D * 0.5 + 2 : 3.6 + (g.D + D) * 0.6))) continue
    const y = alpineHeight(x, z)
    // 坡太陡不種（樹會一邊懸空）
    let sl = 0; for (const [dx, dz] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) sl = Math.max(sl, Math.abs(alpineHeight(x + dx * D, z + dz * D) - y))
    if (sl > D * 0.9) continue
    const H = Math.min(34 + rnd() * 12, domeY(x, z) - y - 2)
    if (H < 26) continue
    list.push({ x, z, y, D, H, rot: rnd() * TAU, lean: (rnd() - 0.5) * 0.03 })
  }
  SPOTS = list
  // 巨大樹頭（阿里山伐木留下的，直徑 3～4.5 公尺、高 1.5～3 公尺，有的上面長出小樹＝「三代木」）、長青苔的倒木
  const dr = mulberry32(515), stumps = [], logs = []
  const free = (x, z, r) => inAlpine(x, z, 3) && domeRho(x, z) < 0.9 && alpineTrailDist(x, z) > 3 + r && bridgeDist(x, z) > 6 + r && alpineStreamDist(x, z) > 2.5 + r
    && Math.hypot(x - CABIN.x, z - CABIN.z) > CABIN.R + 4 + r && Math.hypot(x - CAMP.x, z - CAMP.z) > CAMP.R + 4 + r && !avoid.some((b) => Math.hypot(x - b.x, z - b.z) < 4 + r)
    && !list.some((g) => Math.hypot(g.x - x, g.z - z) < (g.sacred ? g.fenceR + 1 : g.D * 0.5 + 1.5) + r)
    && !stumps.some((s) => Math.hypot(s.x - x, s.z - z) < s.D * 0.5 + 2 + r)
  for (let k = 0; k < 6000 && stumps.length < 9; k++) {
    const i = SEG[0] + Math.floor(dr() * (SEG[1] - SEG[0])), t = dr(), [ax, az] = ALP_TRAIL[i], [bx, bz] = ALP_TRAIL[i + 1], L = Math.hypot(bx - ax, bz - az)
    const side = dr() < 0.5 ? -1 : 1, off = 5 + dr() * 16, D = 3 + dr() * 1.6
    const x = ax + (bx - ax) * t - (bz - az) / L * side * off, z = az + (bz - az) * t + (bx - ax) / L * side * off
    if (!free(x, z, D * 0.5)) continue
    const y = alpineHeight(x, z); let lo = y
    for (let a = 0; a < 8; a++) lo = Math.min(lo, alpineHeight(x + Math.cos(a * 0.785) * D * 0.55, z + Math.sin(a * 0.785) * D * 0.55))
    stumps.push({ x, z, y: lo - 0.15, D, H: (y - lo) + 1.4 + dr() * 1.6, rot: dr() * TAU, sapling: dr() < 0.45 })
  }
  for (let k = 0; k < 8000 && logs.length < 9; k++) {
    const i = SEG[0] + Math.floor(dr() * (SEG[1] - SEG[0])), t = dr(), [ax, az] = ALP_TRAIL[i], [bx, bz] = ALP_TRAIL[i + 1], L = Math.hypot(bx - ax, bz - az)
    const side = dr() < 0.5 ? -1 : 1, off = 5 + dr() * 18, len = 9 + dr() * 9, D = 0.9 + dr() * 0.8, yaw = dr() * TAU
    const x = ax + (bx - ax) * t - (bz - az) / L * side * off, z = az + (bz - az) * t + (bx - ax) / L * side * off
    const dx = Math.cos(yaw), dz = Math.sin(yaw), n = Math.ceil(len / 2)
    let ok = true; const pts = []
    for (let j = 0; j <= n && ok; j++) { const u = (j / n - 0.5) * len, px = x + dx * u, pz = z + dz * u; if (!free(px, pz, D * 0.5) || logs.some((l) => l.pts.some((q) => Math.hypot(q[0] - px, q[1] - pz) < D + 1))) ok = false; pts.push([px, pz]) }
    if (!ok) continue
    const h0 = alpineHeight(pts[0][0], pts[0][1]), h1 = alpineHeight(pts[n][0], pts[n][1])
    if (Math.abs(h1 - h0) > len * 0.35) continue   // 太陡的坡不放（會像滑梯）
    logs.push({ x, z, yaw, len, D, h0, h1, pts })
  }
  SPOTS.decor = { stumps, logs }
  return list
}
// 0～1：這一點在巨木林帶裡面的程度（地面顏色、林下調暗用）
export const forestK = (x, z) => 1 - THREE.MathUtils.smoothstep(bandDist(x, z), 20, 32)
export const nearGiant = (x, z, pad = 0) => !!SPOTS && (SPOTS.some((g) => Math.hypot(g.x - x, g.z - z) < (g.sacred ? g.fenceR : g.D * 0.5) + pad)
  || SPOTS.decor.stumps.some((s) => Math.hypot(s.x - x, s.z - z) < s.D * 0.5 + pad)
  || SPOTS.decor.logs.some((l) => l.pts.some((q) => Math.hypot(q[0] - x, q[1] - z) < l.D * 0.5 + 0.6 + pad)))

// 樹皮：紅褐色，縱向深裂紋（紅檜／紅杉），偶爾一條青苔
function barkTex() {
  const W = 256, H = 512, c = document.createElement('canvas'); c.width = W; c.height = H
  const x = c.getContext('2d'), r = mulberry32(77)
  x.fillStyle = '#7a4a32'; x.fillRect(0, 0, W, H)
  for (let i = 0; i < 140; i++) {   // 一條條長長的樹皮縱紋，亮暗交錯
    const x0 = r() * W, w = 2 + r() * 9, l = 0.55 + r() * 0.3
    x.fillStyle = `rgba(${150 + r() * 60},${85 + r() * 40},${55 + r() * 25},${0.25 + r() * 0.3})`
    x.beginPath(); x.moveTo(x0, 0)
    for (let y = 0; y <= H; y += 16) x.lineTo(x0 + Math.sin(y * 0.02 + i) * 3 + (r() - 0.5) * 2, y)
    for (let y = H; y >= 0; y -= 16) x.lineTo(x0 + w * l + Math.sin(y * 0.02 + i) * 3, y)
    x.fill()
  }
  for (let i = 0; i < 70; i++) {   // 深裂縫（暗）
    const x0 = r() * W; x.strokeStyle = `rgba(30,14,8,${0.45 + r() * 0.35})`; x.lineWidth = 1 + r() * 2.5
    x.beginPath(); x.moveTo(x0, r() * H * 0.3)
    let xx = x0; for (let y = 0; y <= H; y += 12) { xx += (r() - 0.5) * 2.2; x.lineTo(xx, y) } x.stroke()
  }
  x.fillStyle = 'rgba(70,95,45,0.22)'   // 背陰那一側一點青苔
  for (let i = 0; i < 30; i++) { x.beginPath(); x.ellipse(r() * W * 0.3, r() * H, 6 + r() * 14, 20 + r() * 40, 0, 0, TAU); x.fill() }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4
  return t
}

// 樹幹：高 1、底部半徑 1；往上收細，底部往外撐開成 5～6 片板根
function trunkGeo() {
  // 2026-11-10 細緻版：段數加倍、加上縱向的溝槽（紅檜的樹幹是一條條縱向的稜）；UV 照真實尺寸（樹皮貼圖一張約 1.5 公尺）
  const RS = 48, HS = 72
  const g = new THREE.CylinderGeometry(1, 1, 1, RS, HS, true).translate(0, 0.5, 0)
  const p = g.attributes.position, uv = g.attributes.uv
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), a = Math.atan2(z, x)
    const taper = 0.5 * (1 - y) + 0.12 * (1 - y) * (1 - y) + 0.06   // 上面細
    const flare = Math.exp(-y * 28) * (0.45 + 0.45 * Math.max(0, Math.sin(a * 5 + 0.7)) ** 2)   // 板根（第一版太寬：底部像裙子攤開，神木的根伸到柵欄外面）
    const lumpy = 1 + 0.035 * Math.sin(a * 11 + y * 30) + 0.02 * Math.sin(a * 23 - y * 70)
      + 0.03 * Math.sin(a * 17 + Math.sin(y * 7) * 1.4) + 0.018 * Math.sin(a * 37 + Math.sin(y * 13 + a) * 2)   // 縱向的稜和溝
    const r = (taper * 1.6 + flare) * lumpy
    p.setXYZ(i, x * r, y, z * r)
    uv.setXY(i, uv.getX(i) * 9, y * 30)
  }
  g.computeVertexNormals()
  return g
}

export function buildGiants(scene, { sun, avoid = [], lib = null } = {}) {
  const spots = giantSpots(avoid)
  const g = new THREE.Group(); g.name = 'giantForest'
  if (!spots.length) return { group: g, tick() {}, inside: () => 0 }
  const rnd = mulberry32(99)
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), s = new THREE.Vector3()
  // 樹幹
  // 2026-11-10 樹皮改用掃描的紅杉樹皮（法線凹凸、粗糙度、陰影）；神木另外用柳杉樹皮，看得出不一樣
  const barkM = barkMaterial('metasequoia_bark', { normal: 1.6, color: [1.55, 1.3, 1.18] })
  const sacredM = barkMaterial('japanese_cedar_bark', { normal: 1.8, color: [1.9, 1.7, 1.55] })
  const tg = trunkGeo()
  const trunk = new THREE.InstancedMesh(tg, barkM, spots.length)
  const sacredT = new THREE.InstancedMesh(tg, sacredM, 1); sacredT.count = 0
  // 樹冠（2026-11-10 改版）：以前是一整個冷杉卡片樹冠放大 1.5 倍，卡片一片好幾公尺、從下面看像幾片大蕨葉。
  // 現在：頂端一根窄窄的樹梢（冷杉），樹冠本體是掛在大枝上的一團團針葉（鐵杉卡片縮小當「枝葉團」，一團 3～6 公尺），一層一層、有縫透光
  const crownA = new THREE.InstancedMesh(coniferGeo('fir'), needleMaterial(), spots.length)
  const col = new THREE.Color(), limbs = [], clumps = []
  spots.forEach((t, i) => {
    const R = t.D / 2
    q.setFromEuler(e.set(t.lean, t.rot, t.lean * 0.6))
    m4.compose(v.set(t.x, t.y - 0.6, t.z), q, s.set(R, t.H * 0.97, R)); trunk.setMatrixAt(i, m4)
    if (t.sacred) { sacredT.setMatrixAt(0, m4); sacredT.count = 1; m4.makeScale(0, 0, 0); trunk.setMatrixAt(i, m4) }   // 神木用另一種樹皮
    // 大枝：樹冠裡往外斜伸的粗枝（從下面抬頭看得到枝幹，不是一根電線桿插著一團葉子）
    const nL = 9 + Math.floor(rnd() * 4), cc = new THREE.Color().setHSL(0.3 + (rnd() - 0.5) * 0.05, 0.22, 0.62 + rnd() * 0.15)   // 比一般冷杉暗一點的深綠
    for (let k = 0; k < nL; k++) {
      const h = t.H * (0.44 + 0.46 * (k / nL) + rnd() * 0.03), a = k * 2.39 + rnd() * 0.8, up = 0.35 + rnd() * 0.4   // 跟水平的夾角；螺旋排列，不會擠在同一邊
      const yy = h / t.H, rr = R * 1.6 * (0.5 * (1 - yy) + 0.12 * (1 - yy) ** 2 + 0.06)   // 那個高度樹幹的半徑（跟 trunkGeo 一樣的收細）
      const len = t.H * (0.15 + rnd() * 0.1) * (1.25 - h / t.H), rad = R * (0.08 + rnd() * 0.05) * (1.15 - h / t.H)
      const dir = v.set(Math.cos(a) * Math.cos(up), Math.sin(up), Math.sin(a) * Math.cos(up))
      const base = new THREE.Vector3(t.x + Math.cos(a) * rr * 0.6, t.y + h, t.z + Math.sin(a) * rr * 0.6)
      limbs.push({ p: base, q: new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir), s: new THREE.Vector3(rad, len, rad) })
      // 枝葉團：沿著大枝掛 3 團（中段、外段、枝梢），越往上越小
      const sz = (1.25 - yy) * (0.9 + rnd() * 0.5)
      for (const u of [0.22, 0.6, 0.98]) {   // 從靠近樹幹就開始有葉：不然近看是一根根光禿禿的棍子插在樹幹上
        const S = (4.2 + rnd() * 3) * sz * (u > 1 ? 0.85 : 1)
        const cp = base.clone().addScaledVector(dir, len * u).add(new THREE.Vector3((rnd() - 0.5) * 1.2, -S * 0.35 + (rnd() - 0.5), (rnd() - 0.5) * 1.2))
        clumps.push({ p: cp, q: new THREE.Quaternion().setFromEuler(new THREE.Euler((rnd() - 0.5) * 0.9, rnd() * TAU, (rnd() - 0.5) * 0.9)), s: new THREE.Vector3(S * 1.15, S, S * 1.15), c: cc.clone().offsetHSL(0, 0, (rnd() - 0.5) * 0.08) })
      }
    }
    // 樹梢：頂端 30% 一根窄的冷杉尖塔
    q.setFromEuler(e.set(t.lean, t.rot, t.lean * 0.6))
    m4.compose(v.set(t.x, t.y + t.H * 0.68, t.z), q, s.set(t.H * 0.36, t.H * 0.34, t.H * 0.36)); crownA.setMatrixAt(i, m4)
    trunk.setColorAt(i, col.setHSL(0.05 + (rnd() - 0.5) * 0.02, 0.15, 0.85 + rnd() * 0.2))
    crownA.setColorAt(i, cc)
    addCollider(t.x, t.z, R * 1.05, t.y + t.H)
  })
  // 大枝：一根收細、微彎的圓柱（長 1、底半徑 1、末端 0.35），一樣的樹皮
  const limbG = new THREE.CylinderGeometry(0.35, 1, 1, 10, 6, true).translate(0, 0.5, 0)
  { const lp = limbG.attributes.position, lu = limbG.attributes.uv; for (let i = 0; i < lp.count; i++) { const y = lp.getY(i); lp.setX(i, lp.getX(i) + y * y * 0.6); lu.setXY(i, lu.getX(i) * 2, y * 6) } limbG.computeVertexNormals() }
  const limbM = new THREE.InstancedMesh(limbG, barkM, limbs.length)
  limbs.forEach((l, i) => { m4.compose(l.p, l.q, l.s); limbM.setMatrixAt(i, m4) })
  const crownB = new THREE.InstancedMesh(coniferGeo('hemlock', 8), crownA.material, clumps.length)   // 輕量版（8 層）：一團小，層數少看不出來
  clumps.forEach((c, i) => { m4.compose(c.p, c.q, c.s); crownB.setMatrixAt(i, m4); crownB.setColorAt(i, c.c) })
  for (const m of [trunk, sacredT, limbM, crownA, crownB]) { m.castShadow = true; m.receiveShadow = true; m.computeBoundingSphere(); g.add(m) }
  lodRegister([trunk], 40); lodRegister([crownA], 40); lodRegister([crownB], 40); lodRegister([limbM], 40)

  // ---------- 神木的柵欄、巨大樹頭、倒木、木棧道 ----------
  const woodM = new THREE.MeshStandardMaterial({ color: 0x7a5a3c, roughness: 0.9 })
  const ringT = (() => {   // 樹頭切面／倒木斷面：一圈圈年輪，中間有點腐朽變暗
    const c = document.createElement('canvas'); c.width = c.height = 256; const x = c.getContext('2d'), r = mulberry32(31)
    x.fillStyle = '#9a7048'; x.fillRect(0, 0, 256, 256)
    for (let k = 60; k > 2; k--) { x.strokeStyle = `rgba(${70 + r() * 30},${44 + r() * 20},${24},${0.25 + r() * 0.35})`; x.lineWidth = 0.8 + r() * 1.8; x.beginPath(); x.ellipse(128 + (r() - 0.5) * 3, 128 + (r() - 0.5) * 3, k * 2.05, k * 2.0, r(), 0, TAU); x.stroke() }
    const gr = x.createRadialGradient(128, 128, 0, 128, 128, 60); gr.addColorStop(0, 'rgba(40,25,12,0.75)'); gr.addColorStop(1, 'rgba(40,25,12,0)'); x.fillStyle = gr; x.fillRect(0, 0, 256, 256)
    for (let i = 0; i < 18; i++) { x.strokeStyle = 'rgba(35,20,10,0.6)'; x.lineWidth = 1.5; const a = r() * TAU; x.beginPath(); x.moveTo(128, 128); x.lineTo(128 + Math.cos(a) * (60 + r() * 60), 128 + Math.sin(a) * (60 + r() * 60)); x.stroke() }   // 乾裂
    x.fillStyle = 'rgba(70,105,45,0.55)'; for (let i = 0; i < 40; i++) { const a = r() * TAU, d = 100 + r() * 26; x.beginPath(); x.arc(128 + Math.cos(a) * d, 128 + Math.sin(a) * d, 5 + r() * 9, 0, TAU); x.fill() }   // 邊緣青苔
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t
  })()
  const ringM = new THREE.MeshStandardMaterial({ map: ringT, roughness: 0.95 })
  const { stumps, logs } = spots.decor
  const between = (a, b, r, mat) => { const d = b.clone().sub(a), m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, d.length(), 6), mat); m.position.copy(a).add(b).multiplyScalar(0.5); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()); m.castShadow = true; return m }
  // 神木的柵欄：一圈 18 根木樁＋上下兩道橫桿（照地形高低）
  for (const t of spots.filter((q) => q.sacred)) {
    const N = 18, posts = []
    for (let k = 0; k < N; k++) {
      const a = k / N * TAU, px = t.x + Math.cos(a) * t.fenceR, pz = t.z + Math.sin(a) * t.fenceR, py = alpineHeight(px, pz)
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 1.15, 7), woodM); post.position.set(px, py + 0.5, pz); post.castShadow = true; g.add(post)
      addCollider(px, pz, 0.12, py + 1.05); posts.push(new THREE.Vector3(px, py, pz))
    }
    for (let k = 0; k < N; k++) { const a = posts[k], b = posts[(k + 1) % N]; for (const h of [0.45, 0.95]) g.add(between(a.clone().setY(a.y + h), b.clone().setY(b.y + h), 0.04, woodM)) }
    addCollider(t.x, t.z, t.fenceR, t.y + 1.0)   // 柵欄裡面進不去（看得到、走不進去）
  }
  // 樹頭：側面用樹皮、上面是年輪切面；底部往外撐（板根）；有的上面長出一棵小鐵杉
  // 2026-11-10 有掃描的樹頭模型（Poly Haven tree_stump_01，寬 1.5、高 0.57）就用它：放大成直徑 D，高度另外拉高一點
  const STUMP = lib?.stump ? { w: 1.5, h: 0.57 } : null
  if (stumps.length && STUMP) {
    // 原模型是矮矮的小樹頭：橫向放大到直徑 D（根盤再大一點），高度拉到 H
    const list = stumps.map((t) => { const k = t.D / STUMP.w * 1.35, ky = Math.max(k * 0.9, t.H / STUMP.h); t.top = t.y + STUMP.h * ky; return { p: new THREE.Vector3(t.x, t.y, t.z), q: new THREE.Quaternion().setFromEuler(new THREE.Euler(0, t.rot, 0)), s: new THREE.Vector3(k, ky, k) } })
    scatter(g, lib.stump, list)
    stumps.forEach((t) => addCollider(t.x, t.z, t.D * 0.35, t.top))
    const sap = stumps.filter((q) => q.sapling), sapM = new THREE.InstancedMesh(coniferGeo('hemlock'), crownA.material, Math.max(1, sap.length))
    sap.forEach((t, i) => { const h = 2.5 + (i % 3) * 0.8; m4.compose(v.set(t.x + 0.2, t.top - 0.15, t.z - 0.1), q.setFromEuler(e.set(0, i, 0)), s.set(h * 0.7, h, h * 0.7)); sapM.setMatrixAt(i, m4); sapM.setColorAt(i, col.setHSL(0.3, 0.3, 0.75)) })
    sapM.count = sap.length; sapM.castShadow = true; sapM.computeBoundingSphere(); g.add(sapM)
  } else if (stumps.length) {
    // 樹頭：高 1、頂部半徑 1；底部往外撐成板根（樹頭底部比切面寬），表面凹凸
    const side = new THREE.CylinderGeometry(1, 1, 1, 24, 8, true).translate(0, 0.5, 0), sp = side.attributes.position, suv = side.attributes.uv
    for (let i = 0; i < sp.count; i++) {
      const x = sp.getX(i), y = sp.getY(i), z = sp.getZ(i), a = Math.atan2(z, x)
      const r = (1 + 0.55 * Math.exp(-y * 5) * (0.6 + 0.6 * Math.max(0, Math.sin(a * 5 + 0.7)) ** 2)) * (1 + 0.04 * Math.sin(a * 13 + y * 9))
      sp.setXYZ(i, x * r, y, z * r); suv.setXY(i, suv.getX(i) * 3, y * 1.5)
    }
    side.computeVertexNormals()
    const top = new THREE.CircleGeometry(1, 28).rotateX(-Math.PI / 2)
    const sideM = new THREE.InstancedMesh(side, barkM, stumps.length), topM = new THREE.InstancedMesh(top, ringM, stumps.length)
    const sap = stumps.filter((q) => q.sapling), sapM = new THREE.InstancedMesh(coniferGeo('hemlock'), crownA.material, Math.max(1, sap.length))
    stumps.forEach((t, i) => {
      const R = t.D / 2
      m4.compose(v.set(t.x, t.y, t.z), q.setFromEuler(e.set(0, t.rot, 0)), s.set(R, t.H, R)); sideM.setMatrixAt(i, m4)
      m4.compose(v.set(t.x, t.y + t.H, t.z), q, s.set(R * 1.01, 1, R * 1.01)); topM.setMatrixAt(i, m4)
      addCollider(t.x, t.z, R * 0.75, t.y + t.H)
    })
    sap.forEach((t, i) => { const h = 2.5 + (i % 3) * 0.8; m4.compose(v.set(t.x + 0.3, t.y + t.H - 0.1, t.z - 0.2), q.setFromEuler(e.set(0, i, 0)), s.set(h * 0.7, h, h * 0.7)); sapM.setMatrixAt(i, m4); sapM.setColorAt(i, col.setHSL(0.3, 0.3, 0.75)) })
    sapM.count = sap.length
    for (const m of [sideM, topM, sapM]) { m.castShadow = true; m.receiveShadow = true; m.computeBoundingSphere(); g.add(m) }
  }
  // 2026-11-10 倒木：有掃描的倒木模型（Poly Haven dead_tree_trunk，長 3.05、直徑 0.28，長軸 x）就用它，拉到 len × D
  if (logs.length && lib?.deadlog) {
    const list = logs.map((t) => {
      const pitch = Math.atan2(t.h1 - t.h0, t.len)
      return { p: new THREE.Vector3(t.x, (t.h0 + t.h1) / 2 - t.D * 0.12, t.z), q: new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -t.yaw, pitch, 'YXZ')), s: new THREE.Vector3(t.len / 3.05, t.D / 0.28, t.D / 0.28) }
    })
    scatter(g, lib.deadlog, list)
    logs.forEach((t) => { for (const [px, pz] of t.pts) addCollider(px, pz, t.D * 0.45, alpineHeight(px, pz) + t.D) })
  } else if (logs.length) {
    // 倒木：躺在地上的長圓柱，上半面長滿青苔（頂點色），兩端是斷面年輪
    const lg = new THREE.CylinderGeometry(1, 1, 1, 14, 8, true).rotateZ(Math.PI / 2)   // 長軸在 x
    const lp = lg.attributes.position, ln = lg.attributes.normal, lc = new Float32Array(lp.count * 3), r = mulberry32(8)
    for (let i = 0; i < lp.count; i++) {
      const up = ln.getY(i), moss = THREE.MathUtils.smoothstep(up, -0.2, 0.5) * (0.7 + 0.3 * r()), k = 0.85 + 0.3 * r()
      // 下面是腐朽的紅褐樹皮，上半面一層亮綠青苔（線性色彩）
      lc[i * 3] = (0.2 * (1 - moss) + 0.09 * moss) * k; lc[i * 3 + 1] = (0.09 * (1 - moss) + 0.2 * moss) * k; lc[i * 3 + 2] = (0.05 * (1 - moss) + 0.03 * moss) * k
      lp.setY(i, lp.getY(i) * (1 + 0.06 * Math.sin(lp.getX(i) * 9 + lp.getZ(i) * 4)))
    }
    lg.setAttribute('color', new THREE.BufferAttribute(lc, 3)); lg.computeVertexNormals()
    const logBark = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 })   // 不用樹皮貼圖：紅褐貼圖乘上綠色只剩一片暗褐，看不出青苔
    const logM = new THREE.InstancedMesh(lg, logBark, logs.length)
    const endG = new THREE.CircleGeometry(1, 16).rotateY(Math.PI / 2), endM = new THREE.InstancedMesh(endG, ringM, logs.length * 2)
    logs.forEach((t, i) => {
      const R = t.D / 2, pitch = Math.atan2(t.h1 - t.h0, t.len), cy = (t.h0 + t.h1) / 2 + R * 0.7
      q.setFromEuler(e.set(0, -t.yaw, pitch, 'YXZ'))
      m4.compose(v.set(t.x, cy, t.z), q, s.set(t.len, R, R)); logM.setMatrixAt(i, m4)
      for (const sgn of [-1, 1]) {
        const dx = Math.cos(t.yaw), dz = Math.sin(t.yaw)
        m4.compose(v.set(t.x + dx * sgn * t.len / 2, cy + Math.sin(pitch) * sgn * t.len / 2, t.z + dz * sgn * t.len / 2), q, s.set(1, R * 0.98, R * 0.98)); endM.setMatrixAt(i * 2 + (sgn > 0 ? 1 : 0), m4)
      }
      for (const [px, pz] of t.pts) addCollider(px, pz, R * 0.9, alpineHeight(px, pz) + t.D)
    })
    endM.material = ringM
    for (const m of [logM, endM]) { m.castShadow = true; m.receiveShadow = true; m.computeBoundingSphere(); g.add(m) }
  }
  // 木棧道：巨木林這幾段步道（吊橋前、吊橋後）鋪上橫向木板，兩側每 2.4 公尺一根欄杆柱、上下兩道扶手
  {
    const planks = [], posts = []
    // 2026-11-10 使用者：橋頭跟木棧道重疊（步道在橋頭轉彎，第一段棧道直接從橋面末端長出去，斜斜壓在橋面和混凝土基座上）
    // → 換到吊橋的座標量：在橋面範圍（含兩端各 1.8 公尺的塔座、基座）、離中線 BRIDGE_DIM.hw + 1.6 以內的不鋪，棧道往後退到橋頭外面才開始
    const bA = ALP_TRAIL[ALP_BRIDGE.a], bB = ALP_TRAIL[ALP_BRIDGE.a + 2], bL = Math.hypot(bB[0] - bA[0], bB[1] - bA[1]), bdx = (bB[0] - bA[0]) / bL, bdz = (bB[1] - bA[1]) / bL
    const onBridgeHead = (x, z, pad) => { const rx = x - bA[0], rz = z - bA[1], al = rx * bdx + rz * bdz, lat = Math.abs(rx * bdz - rz * bdx); return al > -1.8 - pad && al < bL + 1.8 + pad && lat < BRIDGE_DIM.hw + 1.6 + pad }
    for (const i of [3, 4, 7, 8]) {
      const [ax, az] = ALP_TRAIL[i], [bx, bz] = ALP_TRAIL[i + 1], L = Math.hypot(bx - ax, bz - az), dx = (bx - ax) / L, dz = (bz - az) / L
      for (let u = 0.2; u < L; u += 0.3) {
        const x = ax + dx * u, z = az + dz * u
        if (bridgeDist(x, z) < 1.5 || onBridgeHead(x, z, 0)) continue
        const h = alpineHeight(x, z), slope = Math.atan2(alpineHeight(x + dx * 0.2, z + dz * 0.2) - alpineHeight(x - dx * 0.2, z - dz * 0.2), 0.4)
        planks.push({ x, z, y: h + 0.05 + (Math.sin(u * 7.1) * 0.006), yaw: Math.atan2(dx, dz), slope, k: 0.9 + Math.sin(u * 3.7 + i) * 0.1 })
      }
      for (let u = 1.2; u < L - 0.5; u += 2.4) for (const sd of [-1, 1]) {
        const x = ax + dx * u - dz * sd * 1.45, z = az + dz * u + dx * sd * 1.45
        if (bridgeDist(x, z) < 2 || onBridgeHead(x, z, 0.3)) continue
        posts.push({ x, z, y: alpineHeight(x, z), seg: i, sd, u })
      }
    }
    const plankG = new THREE.BoxGeometry(2.7, 0.07, 0.27)
    const plankM = new THREE.MeshStandardMaterial({ color: 0x8a6440, roughness: 0.85 })
    const pm = new THREE.InstancedMesh(plankG, plankM, planks.length)
    planks.forEach((p, i) => { m4.compose(v.set(p.x, p.y, p.z), q.setFromEuler(e.set(-p.slope, p.yaw, 0, 'YXZ')), s.set(1, 1, 1)); pm.setMatrixAt(i, m4); pm.setColorAt(i, col.setHSL(0.07, 0.3, 0.75 * p.k)) })
    pm.receiveShadow = true; pm.castShadow = false; pm.computeBoundingSphere(); g.add(pm)
    const postG = new THREE.BoxGeometry(0.12, 1.0, 0.12).translate(0, 0.5, 0)
    const ptm = new THREE.InstancedMesh(postG, woodM, posts.length)
    posts.forEach((p, i) => { m4.compose(v.set(p.x, p.y, p.z), q.identity(), s.set(1, 1, 1)); ptm.setMatrixAt(i, m4); addCollider(p.x, p.z, 0.1, p.y + 1) })
    ptm.castShadow = true; ptm.computeBoundingSphere(); g.add(ptm)
    // 扶手：同一段、同一側相鄰的兩根柱子之間
    const rails = []
    for (let k = 1; k < posts.length; k++) {
      const a = posts.find((p, j) => j < k && p.seg === posts[k].seg && p.sd === posts[k].sd && Math.abs(p.u - (posts[k].u - 2.4)) < 0.01)
      if (a) rails.push([a, posts[k]])
    }
    const railG = new THREE.BoxGeometry(1, 0.07, 0.09)
    const rm = new THREE.InstancedMesh(railG, woodM, rails.length * 2)
    rails.forEach(([a, b], i) => {
      for (const [j, h] of [[0, 0.95], [1, 0.5]]) {
        const A = v.set(a.x, a.y + h, a.z).clone(), B = new THREE.Vector3(b.x, b.y + h, b.z), d = B.clone().sub(A)
        m4.compose(A.add(B).multiplyScalar(0.5), q.setFromEuler(e.set(0, -Math.atan2(d.z, d.x), Math.atan2(d.y, Math.hypot(d.x, d.z)), 'YXZ')), s.set(d.length() + 0.08, 1, 1)); rm.setMatrixAt(i * 2 + j, m4)
      }
    })
    rm.castShadow = true; rm.computeBoundingSphere(); g.add(rm)
  }

  // 光束：樹冠縫隙斜射下來的陽光。細長的面，順著太陽方向放，繞自己的軸轉向鏡頭（圓柱型看板），加色、兩端淡出
  const N = 46, beams = []
  for (let k = 0; k < 400 && beams.length < N; k++) {
    const t = spots[Math.floor(rnd() * spots.length)], a = rnd() * TAU, d = t.D * 0.5 + 3 + rnd() * 4
    const x = t.x + Math.cos(a) * d, z = t.z + Math.sin(a) * d
    if (!inAlpine(x, z, 2) || bandDist(x, z) > 22) continue
    beams.push({ x, z, y: alpineHeight(x, z), w: 0.8 + rnd() * 2.2, ph: rnd() * TAU })
  }
  const beamGeo = new THREE.PlaneGeometry(1, 1, 1, 8).translate(0, 0.5, 0)
  const beamMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
    uniforms: { uDir: { value: new THREE.Vector3(0, 1, 0) }, uK: { value: 1 }, uTime: { value: 0 }, uCol: { value: new THREE.Color(1, 0.93, 0.78) } },
    vertexShader: `
      uniform vec3 uDir; uniform float uTime;
      attribute vec4 aBeam;   // x, y, z（光落地的點）, 寬
      attribute float aPh;
      varying vec2 vUv; varying float vPh;
      void main() {
        vUv = uv; vPh = aPh;
        vec3 axis = normalize(uDir);
        float len = 30.0;
        vec3 base = aBeam.xyz;
        vec3 p = base + axis * (position.y * len);
        vec3 toCam = normalize(cameraPosition - p);
        vec3 side = normalize(cross(axis, toCam));
        p += side * position.x * aBeam.w * (0.6 + 0.4 * position.y);
        gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: `
      uniform float uK, uTime; uniform vec3 uCol;
      varying vec2 vUv; varying float vPh;
      void main() {
        float across = 1.0 - abs(vUv.x - 0.5) * 2.0;
        float a = smoothstep(0.0, 0.7, across) * smoothstep(0.0, 0.25, vUv.y) * smoothstep(1.0, 0.55, vUv.y);
        a *= 0.75 + 0.25 * sin(uTime * 0.4 + vPh + vUv.y * 3.0);   // 慢慢明暗（像雲飄過、樹梢搖）
        gl_FragColor = vec4(uCol * a * 0.09 * uK, 1.0);
      }`,
  })
  const ig = new THREE.InstancedBufferGeometry(); ig.index = beamGeo.index
  ig.setAttribute('position', beamGeo.attributes.position); ig.setAttribute('uv', beamGeo.attributes.uv)
  ig.setAttribute('aBeam', new THREE.InstancedBufferAttribute(new Float32Array(beams.flatMap((b) => [b.x, b.y, b.z, b.w])), 4))
  ig.setAttribute('aPh', new THREE.InstancedBufferAttribute(new Float32Array(beams.map((b) => b.ph)), 1))
  ig.instanceCount = beams.length
  const beamMesh = new THREE.Mesh(ig, beamMat); beamMesh.frustumCulled = false; beamMesh.renderOrder = 9
  g.add(beamMesh)

  scene.add(g)
  const tmp = new THREE.Vector3()
  function tick(t, camera, { day = 1 } = {}) {
    beamMat.uniforms.uTime.value = t
    if (sun) { tmp.copy(sun.position).sub(sun.target.position).normalize(); beamMat.uniforms.uDir.value.copy(tmp) }
    // 太陽越低越斜、越金黃；晚上沒有；鏡頭在林帶外面（遠看）淡掉，不會在遠景看到一根根發光的棍子
    const low = 1 - Math.max(0, tmp.y)
    beamMat.uniforms.uCol.value.setRGB(1, 0.92 - 0.15 * low, 0.75 - 0.3 * low)
    const inBand = 1 - THREE.MathUtils.smoothstep(bandDist(camera.position.x, camera.position.z), 25, 55)
    beamMat.uniforms.uK.value = Math.max(0, day) * inBand * (tmp.y > 0.05 ? 1 : 0)
    beamMesh.visible = beamMat.uniforms.uK.value > 0.01
  }
  // 鏡頭在林帶裡面的程度（0 外面～1 裡面）：world.js 拿來把林下調暗、霧帶一點藍綠
  const inside = (camera) => 1 - THREE.MathUtils.smoothstep(bandDist(camera.position.x, camera.position.z), 16, 34)
  return { group: g, tick, spots, inside }
}
