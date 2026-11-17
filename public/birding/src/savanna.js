// 2026-11-16 東北的非洲稀樹草原（使用者：從紅杉林往東北畫箭頭「往外設計一個非洲稀樹草原，大一點」，蛇鷲住這裡）
// 範圍＝layout.js 的 LOBES.sav（約 150 × 110 m），地形、地面顏色在 layout.js savShape、alpine.js（eastZone 'sav'）。
// 這裡種：
//   金黃的高草（紅燕麥草那種，0.5～1.3 m，一叢叢帶穗）、矮草毯、零星裸露的紅土
//   傘形金合歡（扭曲的樹幹分 3～4 枝，頂上一層平平的樹冠）：零散的孤樹＋幾小群
//   白蟻丘（紅褐色、0.8～2.5 m 的土塔）、東北角花崗岩丘（kopje，一堆圓滾滾的大石頭）
import * as THREE from 'three'
import { bladeMesh } from './flora.js'
import { lodRegisterGrass } from './lod.js'
import { DELTA, DELTA_ISLANDS, deltaK, deltaChanD, deltaLagoon, LOBES, SAV, savK, lobeSweep, alpineHeight, alpineTrailDist, domeRho, addCollider, smoothstep as ss } from './layout.js'
import { fbm2, mulberry32 } from './noise.js'
import { canopyGeometry, leafify, barkify } from './fju-foliage.js'
import { graniteMaterial } from './yosemite.js'

const TAU = Math.PI * 2
// 2026-11-17 Blender 做的樹（tools/make-savanna-trees.py → models/props/savanna_trees.glb，葉片貼圖 savanna_leaves.png）：
// 每種樹兩個變化（acacia_a/b、island_a/b、palm_a/b），每個節點有 bark、leaf 兩個材質；實際公尺、底在原點
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { lodRegister } from './lod.js'
const VER = new URL(import.meta.url).searchParams.get('v') ?? ''
export async function loadSavannaKit() {
  const [gl, leafTex, barkC, barkN] = await Promise.all([
    new GLTFLoader().loadAsync(`models/props/savanna_trees.glb?v=${VER}`),
    new THREE.TextureLoader().loadAsync(`models/props/savanna_leaves.png?v=${VER}`),
    new THREE.TextureLoader().loadAsync(`models/plants/bark/pine_bark_diff.jpg?v=${VER}`),
    new THREE.TextureLoader().loadAsync(`models/plants/bark/pine_bark_nor_gl.jpg?v=${VER}`),
  ])
  leafTex.flipY = false; leafTex.colorSpace = THREE.SRGBColorSpace; leafTex.anisotropy = 4
  for (const t of [barkC, barkN]) { t.flipY = false; t.wrapS = t.wrapT = THREE.RepeatWrapping }
  barkC.colorSpace = THREE.SRGBColorSpace
  gl.scene.updateMatrixWorld(true)
  const geo = {}
  gl.scene.traverse((o) => { if (o.isMesh) { const n = (o.parent?.isMesh || o.parent === gl.scene ? o.name : o.parent.name).replace(/_\d+$/, ''); const g = o.geometry.clone(); g.applyMatrix4(o.matrixWorld); (geo[n] ??= {})[o.material.name] = g } })
  const bark = barkify(new THREE.MeshStandardMaterial({ map: barkC, normalMap: barkN, color: 0xe6d8c8, roughness: 0.95, vertexColors: true }))
  const leaf = leafify(new THREE.MeshStandardMaterial({ map: leafTex, color: 0xffffff, emissive: 0x0b1206, roughness: 0.75, alphaTest: 0.5, side: THREE.DoubleSide, vertexColors: true }))
  return { geo, bark, leaf }
}
const L = LOBES.sav
const BOX = [L.x - L.rx - 25, L.x + L.rx + 5, L.z - L.rz - 20, L.z + L.rz + 5]
const inSav = (x, z, k = 0.6) => savK(x, z) > k && domeRho(x, z) < 0.95
// 鳥站的地方附近不長高草（不然拍不到）
// 邊緣 1.5 m 慢慢變密（不是一圈硬邊）
const nearAvoid = (avoid, x, z) => avoid.some((b) => { if (!b.sav) return false; const d = Math.hypot(x - b.x, z - b.z) - (b.r ?? 3); return d < 0 || (d < 1.5 && Math.random() > d / 1.5) })

// ---------- 傘形金合歡 ----------
// 一棵的幾何：樹幹（2～2.6 m 分岔）→ 3～4 枝斜斜往外上長 → 頂上一片扁平的樹冠（幾團壓扁的葉簇疊成一層）
function acaciaParts(rnd, H, R) {
  const wood = [], crowns = []
  const fork = new THREE.Vector3((rnd() - 0.5) * 0.5, 0.38 * H, (rnd() - 0.5) * 0.5)
  const trunk = new THREE.CatmullRomCurve3([new THREE.Vector3(0, -0.3, 0), new THREE.Vector3(fork.x * 0.3 + (rnd() - 0.5) * 0.2, fork.y * 0.5, fork.z * 0.3), fork])
  wood.push(new THREE.TubeGeometry(trunk, 8, 0.2 + 0.04 * H, 7, false))
  const nb = 3 + Math.floor(rnd() * 2), a0 = rnd() * TAU
  for (let i = 0; i < nb; i++) {
    const a = a0 + i / nb * TAU + (rnd() - 0.5) * 0.6, r = R * (0.45 + rnd() * 0.35)
    const end = new THREE.Vector3(Math.cos(a) * r, H * (0.84 + rnd() * 0.1), Math.sin(a) * r)
    const mid = fork.clone().lerp(end, 0.5); mid.y -= 0.25; mid.x += (rnd() - 0.5) * 0.6; mid.z += (rnd() - 0.5) * 0.6
    wood.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([fork, mid, end]), 8, 0.09 + 0.02 * H, 6, false))
    // 枝頭再分兩根細枝撐住樹冠
    for (let j = 0; j < 2; j++) { const b = a + (j - 0.5) * 0.9, e2 = end.clone().add(new THREE.Vector3(Math.cos(b) * R * 0.25, 0.3, Math.sin(b) * R * 0.25)); wood.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([end, end.clone().lerp(e2, 0.5).add(new THREE.Vector3(0, 0.1, 0)), e2]), 4, 0.045, 5, false)) }
    crowns.push([end.x * 1.1, H + 0.15, end.z * 1.1, R * (0.55 + rnd() * 0.2)])
  }
  crowns.push([0, H + 0.35, 0, R * 0.7])
  return { wood, crowns }
}

// 2026-11-17 南方黃嘴犀鳥的巢（招牌行為「樹洞餵食」，flight.js 用）：離犀鳥最近的一棵金合歡，樹幹上一個用泥封住、只留一條縫的樹洞，朝犀鳥那邊（步道）
export const savNest = { ready: false }
export function buildSavanna({ avoid = [], kit = null, nestNear = null } = {}) {
  const g = new THREE.Group(); g.name = 'savanna'
  const rnd = mulberry32(2016)
  const c = new THREE.Color()

  // ---------- 樹、白蟻丘、岩丘的位置（先挑，草避開） ----------
  const TREES = [], MOUNDS = []
  const K = SAV.kopje
  const clearOf = (x, z, r) => TREES.every((t) => Math.hypot(t.x - x, t.z - z) > r + t.R) && MOUNDS.every((m) => Math.hypot(m.x - x, m.z - z) > r + m.r)
  // 樹：孤樹為主，幾處 3～5 棵一小群（雜訊高的地方）；步道 4 m 外、岩丘外
  // 2026-11-17 三角洲：濕的那一側只有樹島上長樹（高出水面 0.55 m 以上），而且是圓頂的闊葉大樹（照片裡一團團深綠的樹島），不是金合歡
  for (let k = 0; k < 20000 && TREES.length < 70; k++) {
    const x = BOX[0] + rnd() * (BOX[1] - BOX[0]), z = BOX[2] + rnd() * (BOX[3] - BOX[2])
    if (!inSav(x, z, 0.8) || domeRho(x, z) > 0.9 || alpineTrailDist(x, z) < 4.5 || Math.hypot(x - K.x, z - K.z) < K.r + 4 || nearAvoid(avoid, x, z)) continue
    const dk = deltaK(x, z), yW = alpineHeight(x, z) - DELTA.W
    if (dk > 0.3 && yW < 0.55) continue
    const broad = dk > 0.3
    const grove = fbm2(x * 0.03 + 8, z * 0.03 - 1, 2)
    if (!broad && rnd() > 0.25 + 0.75 * ss(0.5, 0.65, grove)) continue
    const H = broad ? 6.5 + rnd() * 3.5 : 4.2 + rnd() * 2.6, R = H * (broad ? 0.42 + rnd() * 0.15 : 0.62 + rnd() * 0.2)
    if (!clearOf(x, z, R * (broad ? 0.6 : 0.9))) continue
    TREES.push({ x, z, H, R, yaw: rnd() * TAU, broad })
  }
  // 樹島：每座島 3～8 棵擠在一起（照片裡一團團深綠）——另外找，不跟草原的金合歡搶名額
  const ISL = DELTA_ISLANDS()
  for (let k = 0, nI = 0; k < 40000 && nI < 110; k++) {
    const [ix, iz, ir] = ISL[k % ISL.length], a = rnd() * TAU, rr = Math.sqrt(rnd()) * ir * 0.85, x = ix + Math.cos(a) * rr, z = iz + Math.sin(a) * rr
    if (domeRho(x, z) > 0.93 || alpineTrailDist(x, z) < 4 || nearAvoid(avoid, x, z)) continue
    if (alpineHeight(x, z) - DELTA.W < 0.45) continue
    const H = 6 + rnd() * 4.5, R = H * (0.38 + rnd() * 0.15)
    if (!TREES.every((t) => Math.hypot(t.x - x, t.z - z) > (t.R + R) * 0.55)) continue
    TREES.push({ x, z, H, R, yaw: rnd() * TAU, broad: true }); nI++
  }
  for (let k = 0; k < 3000 && MOUNDS.length < 14; k++) {
    const x = BOX[0] + rnd() * (BOX[1] - BOX[0]), z = BOX[2] + rnd() * (BOX[3] - BOX[2])
    if (!inSav(x, z, 0.85) || deltaK(x, z) > 0.2 || alpineTrailDist(x, z) < 3 || nearAvoid(avoid, x, z) || !clearOf(x, z, 3)) continue
    MOUNDS.push({ x, z, r: 0.5 + rnd() * 0.6, h: 0.8 + rnd() * 1.7 })
  }

  // ---------- 草 ----------
  // 2026-11-17 FPS：草穗（plume）跟高草寬度幾乎一樣 → 併進同一層（少一半的 draw call）
  const layers = { tall: [[], []], mid: [[], []], low: [[], []] }
  const push = (Lr, x, y, z, a, col, h) => { if (Lr === 'plume') Lr = 'tall'; layers[Lr][0].push(x, y, z, a); layers[Lr][1].push(col.r, col.g, col.b, h) }
  const P = { gold: [new THREE.Color(0xC9A55A), new THREE.Color(0xDDBF78)], tawny: [new THREE.Color(0xA87C45), new THREE.Color(0xB98F55)], green: new THREE.Color(0x8C8A4C), seed: [new THREE.Color(0xB0603A), new THREE.Color(0xD8C28E)], low: [new THREE.Color(0x9C7A3E), new THREE.Color(0x87733F)] }
  const mix = (a, b, t) => c.copy(a).lerp(b, t).clone()
  const G = { sedge: [new THREE.Color(0x7FA43C), new THREE.Color(0x9DB84E)], lush: [new THREE.Color(0x7C9A3E), new THREE.Color(0x96A84C)], papy: new THREE.Color(0x4F7A2C), umbel: new THREE.Color(0x6E9A38) }
  let nT = 0, nM = 0, nL = 0, nP = 0
  for (let k = 0; k < 1600000 && (nT < 12000 || nM < 22000 || nL < 75000); k++) {
    const x = BOX[0] + rnd() * (BOX[1] - BOX[0]), z = BOX[2] + rnd() * (BOX[3] - BOX[2])
    const kS = savK(x, z)
    if (kS < 0.3 || rnd() > kS || domeRho(x, z) > 0.952 || nearAvoid(avoid, x, z)) continue
    const td = alpineTrailDist(x, z); if (td < 1.4) continue
    if (MOUNDS.some((m) => Math.hypot(m.x - x, m.z - z) < m.r + 0.3)) continue
    if (Math.hypot(x - K.x, z - K.z) < K.r * 0.55) continue
    const y = alpineHeight(x, z)
    const dk = deltaK(x, z)
    if (dk > 0.3 && rnd() < dk) {
      // 三角洲：深水不長；淺水、水邊是鮮綠的莎草（從水裡冒出來）；河岸、池邊一叢叢紙莎草；高一點的地方是綠草毯夾一點黃草
      const yW = y - DELTA.W
      if (yW < -0.3) continue
      const cd = deltaChanD(x, z), [le] = deltaLagoon(x, z)
      if (((cd > -0.6 && cd < 1.8) || (le > 0.92 && le < 1.25)) && rnd() < 0.18 && nP < 2600) {
        nP++
        const Hh = 1.5 + rnd() * 1.0
        for (let j = 0; j < 5; j++) { const sx = x + (rnd() - 0.5) * 0.3, sz = z + (rnd() - 0.5) * 0.3, st = Hh * (0.75 + rnd() * 0.3); push('tall', sx, Math.min(y, DELTA.W) - 0.03, sz, rnd() * TAU, G.papy.clone().multiplyScalar(0.85 + rnd() * 0.3), st)
          for (let u = 0; u < 4; u++) push('plume', sx, Math.min(y, DELTA.W) + st * 0.97, sz, rnd() * TAU, G.umbel.clone().multiplyScalar(0.9 + rnd() * 0.25), 0.18 + rnd() * 0.08) }
        continue
      }
      if (yW < 0.08) { if (nM < 22000 && rnd() < 0.7) { nM++; const col = mix(G.sedge[0], G.sedge[1], rnd()), Hh = 0.25 + rnd() * 0.35; for (let j = 0; j < 7; j++) push('mid', x + (rnd() - 0.5) * 0.35, Math.min(y, DELTA.W) - 0.04, z + (rnd() - 0.5) * 0.35, rnd() * TAU, col.clone().multiplyScalar(0.88 + rnd() * 0.25), Hh * (0.7 + rnd() * 0.5)) } continue }
      if (nL < 75000) { nL++; const dry = ss(0.45, 0.62, fbm2(x * 0.04 - 7, z * 0.04 + 3, 2)) * ss(0.35, 0.9, yW), col = mix(G.lush[0], G.lush[1], rnd()).lerp(P.low[0], dry)
        for (let j = 0; j < 6; j++) push('low', x + (rnd() - 0.5) * 0.5, y - 0.01, z + (rnd() - 0.5) * 0.5, rnd() * TAU, col, 0.1 + rnd() * 0.2) }
      continue
    }
    const red = ss(0.66, 0.76, fbm2(x * 0.09 - 4, z * 0.09 + 1, 2))   // 紅土裸地（地面顏色同一個雜訊）：草稀
    const n1 = fbm2(x * 0.035 + 2, z * 0.035 - 6, 3), r = rnd()
    const tallMask = ss(0.42, 0.56, fbm2(x * 0.05 - 3, z * 0.05 + 7, 3)) * ss(2.5, 6, td) * (1 - red)
    if (r < 0.55 * tallMask && nT < 12000) {
      // 高草叢：0.6～1.3 m，8～12 片細長葉，頂上 2～3 根帶紅褐小穗的花稈（紅燕麥草）
      nT++
      const Hh = 0.6 + rnd() * 0.7, col = mix(P.gold[0], P.gold[1], rnd()).lerp(P.tawny[0], ss(0.6, 0.3, n1) * 0.5)
      for (let j = 0; j < 10; j++) push('tall', x + (rnd() - 0.5) * 0.35, y - 0.02, z + (rnd() - 0.5) * 0.35, rnd() * TAU, col.clone().multiplyScalar(0.85 + rnd() * 0.3), Hh * (0.6 + rnd() * 0.45))
      for (let j = 0; j < 3; j++) push('plume', x + (rnd() - 0.5) * 0.2, y - 0.02 + Hh * (0.9 + rnd() * 0.25), z + (rnd() - 0.5) * 0.2, rnd() * TAU, mix(P.seed[0], P.seed[1], rnd()), 0.1 + rnd() * 0.08)
      continue
    }
    if (r < 0.45 && nM < 12000 && rnd() > red * 0.8) {
      nM++
      const Hh = 0.3 + rnd() * 0.35, col = mix(P.tawny[0], P.tawny[1], rnd()).lerp(P.green, ss(0.38, 0.25, n1) * 0.6)
      for (let j = 0; j < 7; j++) push('mid', x + (rnd() - 0.5) * 0.3, y - 0.02, z + (rnd() - 0.5) * 0.3, rnd() * TAU, col.clone().multiplyScalar(0.88 + rnd() * 0.25), Hh * (0.7 + rnd() * 0.5))
      continue
    }
    if (nL < 50000 && rnd() > red * 0.85) {
      nL++
      const col = mix(P.low[0], P.low[1], rnd())
      for (let j = 0; j < 6; j++) push('low', x + (rnd() - 0.5) * 0.5, y - 0.01, z + (rnd() - 0.5) * 0.5, rnd() * TAU, col, 0.08 + rnd() * 0.16)
    }
  }
  const opts = { tall: { width: [0.011, 0.009] }, mid: { width: [0.018, 0.014] }, low: { width: [0.03, 0.022], lawn: true } }
  // 2026-11-17 非洲 FPS（使用者：「檢查非洲那邊可以如何提升 FPS」→ 量到草佔 1.4～5.7 ms，最大一項）：
  //   格子 14 → 24 m（589 塊 → 約兩百塊，draw call 少一大半）；
  //   草原一眼望很遠，草葉只有 1～2 cm 寬，100 m 外比一個像素還細 → 照草的高度早一點變稀（[全密到, 剩四成, 不畫]，公尺）
  const FALL = { tall: [45, 120, 170], mid: [35, 95, 135], low: [25, 60, 90] }
  for (const [name, [A, B]] of Object.entries(layers)) {
    const CELL = 24, cells = new Map()
    for (let i = 0; i < A.length / 4; i++) { const key = Math.floor(A[i * 4] / CELL) + ',' + Math.floor(A[i * 4 + 2] / CELL); (cells.get(key) || cells.set(key, []).get(key)).push(i) }
    for (const [key, idx] of cells) {
      for (let i = idx.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]] }
      const a = [], b = []
      for (const i of idx) { a.push(A[i * 4], A[i * 4 + 1], A[i * 4 + 2], A[i * 4 + 3]); b.push(B[i * 4], B[i * 4 + 1], B[i * 4 + 2], B[i * 4 + 3]) }
      const [cx, cz] = key.split(',').map((v) => (+v + 0.5) * CELL)
      const m = bladeMesh(a, b, opts[name]); m.name = 'sav_' + name; g.add(m)
      m.geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(cx, alpineHeight(cx, cz) + 1, cz), CELL * 0.75 + 4)
      lodRegisterGrass(m, new THREE.Vector3(cx, alpineHeight(cx, cz) + 0.5, cz), CELL * 0.72 + 1, FALL[name])
    }
  }

  let nestT = null, nestM = null
  if (nestNear) { let bd = 60; for (const t of TREES) { if (t.broad) continue; const d = Math.hypot(t.x - nestNear[0], t.z - nestNear[1]); if (d < bd && d > 3) { bd = d; nestT = t } } }
  // ---------- 樹：有 Blender 的樹就用（乾草原＝金合歡；樹島＝闊葉大樹、三成扇葉棕櫚） ----------
  if (kit) {
    const by = {}, m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), UP = new THREE.Vector3(0, 1, 0)
    const REF = { acacia_a: 6.0, acacia_b: 5.2, island_a: 10, island_b: 12, palm_a: 10, palm_b: 9 }   // 模型本身的高度
    for (const t of TREES) {
      const kind = t.broad ? (rnd() < 0.32 ? (rnd() < 0.7 ? 'palm_a' : 'palm_b') : (rnd() < 0.5 ? 'island_a' : 'island_b')) : (rnd() < 0.5 ? 'acacia_a' : 'acacia_b')
      const s = t.H / REF[kind] * (t.broad ? 1.1 : 1.15), y = alpineHeight(t.x, t.z)
      ;(by[kind] ??= []).push(m4.compose(new THREE.Vector3(t.x, y - 0.05, t.z), q.setFromAxisAngle(UP, t.yaw), new THREE.Vector3(s * (0.9 + rnd() * 0.2), s, s * (0.9 + rnd() * 0.2))).clone())
      if (t === nestT) nestM = { kind, m: m4.clone(), y }
      addCollider(t.x, t.z, kind.startsWith('island') ? 0.6 : 0.3, y + t.H * 0.4, y - 0.5)
    }
    for (const [kind, list] of Object.entries(by)) {
      const parts = kit.geo[kind]; if (!parts) continue
      const ms = []
      for (const [mn, mat] of [['bark', kit.bark], ['leaf', kit.leaf]]) {
        if (!parts[mn]) continue
        const im = new THREE.InstancedMesh(parts[mn], mat, list.length)
        list.forEach((m, i) => im.setMatrixAt(i, m))
        im.castShadow = true; im.receiveShadow = true; im.computeBoundingSphere(); im.name = 'sav_' + kind + '_' + mn
        g.add(im); ms.push(im)
      }
      lodRegister(ms, REF[kind] * 1.1)
    }
  } else
  // ---------- 金合歡（舊的程式樹，沒有 kit 時） ----------
  {
    const woodGeos = [], crownList = []
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), UP = new THREE.Vector3(0, 1, 0)
    for (const t of TREES) {
      const y = alpineHeight(t.x, t.z), { wood, crowns } = acaciaParts(rnd, t.H, t.R)
      q.setFromAxisAngle(UP, t.yaw); m4.compose(new THREE.Vector3(t.x, y, t.z), q, new THREE.Vector3(1, 1, 1))
      for (const w of wood) { w.applyMatrix4(m4); woodGeos.push(w) }
      if (t.broad) {   // 樹島的闊葉樹：一團團圓頂樹冠（高寬比 0.7），幾團疊成一棵
        for (let j = 0; j < 5; j++) { const a = rnd() * TAU, rr = t.R * (j ? 0.45 : 0), v = new THREE.Vector3(Math.cos(a) * rr, 0, Math.sin(a) * rr); crownList.push({ x: t.x + v.x, y: y + t.H * (j ? 0.78 : 0.9), z: t.z + v.z, r: t.R * (j ? 0.62 : 0.8), broad: true }) }
      } else
      for (const [cx, cy, cz, cr] of crowns) { const v = new THREE.Vector3(cx, cy, cz).applyQuaternion(q); crownList.push({ x: t.x + v.x, y: y + cy, z: t.z + v.z, r: cr }) }
      addCollider(t.x, t.z, 0.3, y + t.H * 0.4, y - 0.5)
    }
    if (woodGeos.length) {
      const { mergeGeometries } = await_merge()
      const geo = mergeGeometries(woodGeos.map((w) => { w.deleteAttribute('uv'); return w }))
      const bark = barkify(new THREE.MeshStandardMaterial({ color: 0x5a4a40, roughness: 0.92 }))
      const mesh = new THREE.Mesh(geo, bark); mesh.castShadow = true; mesh.receiveShadow = true; mesh.name = 'acacia_wood'; g.add(mesh)
    }
    if (crownList.length) {
      // 扁平的樹冠：葉簇壓扁（高只有寬的 0.28），顏色暗橄欖綠、頂上被曬得淺一點
      const crown = canopyGeometry()
      const leafM = leafify(new THREE.MeshStandardMaterial({ color: 0x5f6e34, roughness: 0.88, vertexColors: true }))
      const im = new THREE.InstancedMesh(crown, leafM, crownList.length), cc = new THREE.Color()
      crownList.forEach((f, i) => {
        q.setFromAxisAngle(UP, rnd() * TAU)
        im.setMatrixAt(i, m4.compose(new THREE.Vector3(f.x, f.y, f.z), q, new THREE.Vector3(f.r, f.r * (f.broad ? 0.72 : 0.26), f.r * (0.85 + rnd() * 0.25))))
        im.setColorAt(i, f.broad ? cc.setHSL(0.24 + rnd() * 0.04, 0.42, 0.24 + rnd() * 0.06) : cc.setHSL(0.19 + rnd() * 0.04, 0.32, 0.36 + rnd() * 0.08))
      })
      im.castShadow = true; im.receiveShadow = true; im.computeBoundingSphere(); im.name = 'acacia_crown'; g.add(im)
    }
  }

  // ---------- 白蟻丘 ----------
  if (MOUNDS.length) {
    // 一座：底寬、往上收的土塔，旁邊常有一兩根小煙囪；表面有一圈圈雨水沖的溝
    const base = new THREE.LatheGeometry(Array.from({ length: 12 }, (_, i) => { const t = i / 11; return new THREE.Vector2(Math.max(0.05, (1 - t) ** 1.3 * (1 - 0.12 * Math.sin(t * 13)) + 0.06 * (1 - t)), t) }), 12)
    const p = base.attributes.position, v = new THREE.Vector3()
    for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); const n = 1 + 0.32 * (fbm2(v.x * 4 + v.y * 3, v.z * 4 - v.y, 3) - 0.5) + 0.12 * (fbm2(v.x * 11, v.y * 9 + v.z * 11, 2) - 0.5); p.setXYZ(i, v.x * n, v.y * (1 + 0.06 * (fbm2(v.x * 5, v.z * 5, 2) - 0.5)), v.z * n) }
    base.computeVertexNormals()
    const mat = barkify(new THREE.MeshStandardMaterial({ color: 0x7e5238, roughness: 1 }))   // barkify：借樹皮的細碎凹凸，看起來像乾掉的土
    const im = new THREE.InstancedMesh(base, mat, MOUNDS.length * 2), m4 = new THREE.Matrix4(), q = new THREE.Quaternion()
    MOUNDS.forEach((m, i) => {
      const y = alpineHeight(m.x, m.z) - 0.15
      im.setMatrixAt(i * 2, m4.compose(new THREE.Vector3(m.x, y, m.z), q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), i), new THREE.Vector3(m.r, m.h, m.r)))
      const a = rnd() * TAU
      im.setMatrixAt(i * 2 + 1, m4.compose(new THREE.Vector3(m.x + Math.cos(a) * m.r * 0.45, y, m.z + Math.sin(a) * m.r * 0.45), q, new THREE.Vector3(m.r * 0.35, m.h * (0.75 + rnd() * 0.5), m.r * 0.35)))
      addCollider(m.x, m.z, m.r * 0.8, y + m.h)
    })
    im.castShadow = true; im.receiveShadow = true; im.computeBoundingSphere(); im.name = 'termite_mounds'; g.add(im)
  }

  // ---------- 睡蓮（三角洲的睡蓮池，水深 0.2～0.8 m）：圓葉片有一道缺口，零星幾朵白、淡紫的花 ----------
  {
    const pad = new THREE.CircleGeometry(1, 18, 0.25, TAU - 0.5).rotateX(-Math.PI / 2)
    const padM = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.45, side: THREE.DoubleSide })
    const flower = new THREE.ConeGeometry(0.07, 0.07, 7, 1, true).rotateX(Math.PI).translate(0, 0.04, 0)
    const flM = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6, side: THREE.DoubleSide, emissive: 0x222222 })
    const P2 = [], F2 = []
    for (const L of DELTA.lagoons.filter((o) => o.lily)) for (let k = 0; k < 3000 && P2.length < 700 * DELTA.lagoons.length; k++) {
      const a = rnd() * TAU, r = Math.sqrt(rnd()) * 1.1, x = L.x + Math.cos(a) * r * L.rx, z = L.z + Math.sin(a) * r * L.rz, dep = DELTA.W - alpineHeight(x, z)
      if (dep < 0.15 || dep > 0.85 || fbm2(x * 0.25 + 3, z * 0.25, 2) < 0.42) continue
      P2.push([x, z, 0.16 + rnd() * 0.2, rnd() * TAU])
      if (rnd() < 0.06) F2.push([x + 0.1, z, rnd() < 0.7])
    }
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), cc = new THREE.Color(), UP = new THREE.Vector3(0, 1, 0)
    if (P2.length) { const im = new THREE.InstancedMesh(pad, padM, P2.length); P2.forEach(([x, z, s, a], i) => { im.setMatrixAt(i, m4.compose(new THREE.Vector3(x, DELTA.W + 0.012, z), q.setFromAxisAngle(UP, a), new THREE.Vector3(s, 1, s))); im.setColorAt(i, cc.setHSL(0.24 + rnd() * 0.06, 0.5, 0.2 + rnd() * 0.08)) }); im.receiveShadow = true; im.computeBoundingSphere(); im.name = 'lily_pads'; im.renderOrder = 3; g.add(im) }
    if (F2.length) { const im = new THREE.InstancedMesh(flower, flM, F2.length); F2.forEach(([x, z, w], i) => { im.setMatrixAt(i, m4.compose(new THREE.Vector3(x, DELTA.W + 0.02, z), q.identity(), new THREE.Vector3(1, 1, 1))); im.setColorAt(i, w ? cc.setRGB(0.95, 0.95, 0.92) : cc.setRGB(0.62, 0.55, 0.9)) }); im.computeBoundingSphere(); im.renderOrder = 3; g.add(im) }
  }

  // ---------- 花崗岩丘（kopje） ----------
  {
    const geo = new THREE.IcosahedronGeometry(1, 3), p = geo.attributes.position, v = new THREE.Vector3()
    for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); const n = 1 + 0.12 * (fbm2(v.x * 1.7 + 3, v.z * 1.7 + v.y, 3) - 0.5); if (v.y < 0) v.y *= 0.6; p.setXYZ(i, v.x * n, v.y * n * 0.82, v.z * n) }
    geo.computeVertexNormals()
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(p.count * 3).fill(0.5), 3))   // graniteMaterial 用頂點色
    let mat; try { mat = graniteMaterial() } catch { mat = null }
    mat ??= new THREE.MeshStandardMaterial({ color: 0xa89a88, roughness: 0.9 })
    const rocks = []
    for (let k = 0; k < 400 && rocks.length < 22; k++) {
      const a = rnd() * TAU, d = Math.sqrt(rnd()) * K.r * 0.85, x = K.x + Math.cos(a) * d, z = K.z + Math.sin(a) * d
      const s = (1 - d / K.r) * 3.2 + 0.9 + rnd() * 1.4
      if (alpineTrailDist(x, z) < s + 1.5) continue
      rocks.push({ x, z, s })
    }
    const im = new THREE.InstancedMesh(geo, mat, rocks.length), m4 = new THREE.Matrix4(), q = new THREE.Quaternion()
    rocks.forEach((r, i) => {
      const y = alpineHeight(r.x, r.z) - r.s * 0.3
      q.setFromEuler(new THREE.Euler((rnd() - 0.5) * 0.3, rnd() * TAU, (rnd() - 0.5) * 0.3))
      im.setMatrixAt(i, m4.compose(new THREE.Vector3(r.x, y, r.z), q, new THREE.Vector3(r.s * (1 + rnd() * 0.4), r.s * (0.7 + rnd() * 0.3), r.s)))
      addCollider(r.x, r.z, r.s * 0.95, y + r.s * 0.8)
    })
    im.castShadow = true; im.receiveShadow = true; im.computeBoundingSphere(); im.name = 'kopje'; g.add(im)
  }
  g.userData.trees = TREES
  if (nestM && kit) {
    // 量樹幹：離地 1.25 m 那一圈的樹皮頂點（模型座標），中心＝平均，半徑＝中位數
    const geo = kit.geo[nestM.kind].bark, p = geo.attributes.position, sc = new THREE.Vector3(), qq = new THREE.Quaternion(), pos = new THREE.Vector3()
    nestM.m.decompose(pos, qq, sc)
    const hh = 1.25, ly = (hh + 0.05) / sc.y, pts = []
    for (let i = 0; i < p.count; i++) { const y = p.getY(i) * sc.y - 0.05; if (y > 0.5 && y < 1.8) pts.push([p.getX(i), p.getZ(i)]) }   // 樹幹是低模，一圈一圈的頂點隔很開：取分岔以下一整段
    if (pts.length > 8) {
      const cx = pts.reduce((a, q) => a + q[0], 0) / pts.length, cz = pts.reduce((a, q) => a + q[1], 0) / pts.length
      const ds = pts.map(([x, z]) => Math.hypot(x - cx, z - cz)).sort((a, b) => a - b), rr = ds[ds.length >> 1] * sc.x
      const c = new THREE.Vector3(cx, ly, cz).applyMatrix4(nestM.m)
      let nx = nestNear[0] - c.x, nz = nestNear[1] - c.z; const nl = Math.hypot(nx, nz); nx /= nl; nz /= nl
      Object.assign(savNest, { ready: true, x: c.x + nx * rr, y: c.y, z: c.z + nz * rr, nx, nz, cx: c.x, cz: c.z, r: rr })
      // 泥封的洞口：一塊扁的泥（比樹皮紅褐），中間一條直的黑縫
      const yaw = Math.atan2(nx, nz)
      const mud = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), new THREE.MeshStandardMaterial({ color: 0x7a5236, roughness: 1 }))
      mud.scale.set(0.085, 0.12, 0.03); mud.position.set(savNest.x - nx * 0.012, savNest.y, savNest.z - nz * 0.012); mud.rotation.y = yaw
      const slit = new THREE.Mesh(new THREE.PlaneGeometry(0.018, 0.11), new THREE.MeshBasicMaterial({ color: 0x0c0806 }))
      slit.position.set(savNest.x + nx * 0.019, savNest.y, savNest.z + nz * 0.019); slit.rotation.y = yaw
      for (const m of [mud, slit]) { m.name = 'hornbillNest'; m.castShadow = m === mud; m.receiveShadow = true; g.add(m) }
    }
  }
  return g
}

// three 的 BufferGeometryUtils（同步拿：world.js 一開始就已經 import 過）
import * as BGU from 'three/addons/utils/BufferGeometryUtils.js'
const await_merge = () => BGU
