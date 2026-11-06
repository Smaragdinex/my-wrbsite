// 第二館：高山雲霧林。圓頂東門 → 玻璃通道（中間是氣候緩衝室，兩道自動門）→ 一棟玻璃溫室，裡面是台灣高山的地形：
// 入口平台、水池，往東爬升到約 20 公尺的山頂；溪流從山上沿山谷流下來（中途一段小瀑布），步道之字形上山、吊橋過溪谷，山頂有觀景台。
// 植物：冷杉（細長尖塔）、鐵杉（較寬、枝條下垂）——程式做的針葉卡片樹；坡上一整片玉山箭竹；溪邊蕨類、長苔的岩石；雲霧一直在飄。
// 地形、步道、溪、吊橋的形狀在 layout.js（玩家走路也要用）。
// 效能：外殼（通道、館的鋼構和霧玻璃）一開始就蓋，很便宜；館裡面等玩家走到東邊才蓋。
// 兩館不同時畫：玩家在館裡（或 B 門開著）才畫館內；在圓頂這邊（或 A 門開著）才畫圓頂裡面，緩衝室兩道門都關著的時候切換。
import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { ALP, CORR, ALP_STREAM, ALP_POND, ALP_TRAIL, ALP_BRIDGE, ALP_GRID, ALP_HEIGHTS, alpineHeight, alpineTrailDist, alpineStreamDist, alpineDoors, addCollider } from './layout.js'
import { scatter } from './plants.js'
import { bladeMesh } from './flora.js'
import { lodRegisterGrass } from './lod.js'
import { mulberry32, fbm2 } from './noise.js'

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z)
const TAU = Math.PI * 2
const { clamp, lerp } = THREE.MathUtils
const ss = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t) }   // 跟 layout.js 同樣的參數順序（three 的 smoothstep 是 (x, min, max)，第一版用錯，樹全沒長出來）
const XM = (ALP.X0 + ALP.X1) / 2

function canvasTex(w, h, draw, srgb = true) {
  const c = document.createElement('canvas'); c.width = w; c.height = h
  draw(c.getContext('2d'), w, h)
  const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8
  return t
}
const bar = (list, a, b, t = 0.14, t2 = t) => {
  const d = new THREE.Vector3().subVectors(b, a), len = d.length()
  const m = new THREE.Matrix4().lookAt(a, b, Math.abs(d.y) > 0.99 * len ? V(1, 0, 0) : V(0, 1, 0))
  m.setPosition(a.clone().add(b).multiplyScalar(0.5))
  list.push(new THREE.BoxGeometry(t, t2, len).applyMatrix4(m))
}
const quad = (pts, mat, parent, order = 5) => {
  const pos = []
  for (let i = 1; i < pts.length - 1; i++) pos.push(...pts[0].toArray(), ...pts[i].toArray(), ...pts[i + 1].toArray())
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.computeVertexNormals()
  const m = new THREE.Mesh(geo, mat); m.renderOrder = order; parent.add(m); return m
}

/* ---------- 外殼：通道＋緩衝室＋館的鋼構、霧玻璃 ---------- */
function buildShell() {
  const g = new THREE.Group(); g.name = 'alpineShell'
  const steel = new THREE.MeshStandardMaterial({ color: 0xf2f4f5, roughness: 0.45, metalness: 0.5 })
  const alu = new THREE.MeshStandardMaterial({ color: 0x3c4246, roughness: 0.35, metalness: 0.8 })
  const glassM = new THREE.MeshStandardMaterial({ color: 0xcfe4ea, transparent: true, opacity: 0.16, roughness: 0.04, metalness: 0.1, side: THREE.DoubleSide, depthWrite: false })
  // 館的玻璃是霧面的（裡面是雲霧林），從圓頂看過去是一片白濛濛的大溫室
  const frost = new THREE.MeshStandardMaterial({ color: 0xe6eef0, transparent: true, opacity: 0.42, roughness: 0.6, side: THREE.DoubleSide, depthWrite: false })
  const geos = { steel: [], alu: [] }
  // 通道：x 從圓頂東門到館的西牆，人字屋頂、兩側玻璃
  const { X0, X1, W } = CORR, EAVE = 3.2, RIDGE = 4.2, L = X1 - X0
  const posts = [X0, X0 + L / 3, X0 + 2 * L / 3, X1]
  for (const x of posts) for (const z of [-W, W]) bar(geos.steel, V(x, 0, z), V(x, EAVE, z), 0.22)
  for (const z of [-W, W]) bar(geos.steel, V(X0, EAVE, z), V(X1, EAVE, z), 0.2, 0.28)
  for (const x of posts) { bar(geos.steel, V(x, EAVE, -W), V(x, RIDGE, 0), 0.18, 0.24); bar(geos.steel, V(x, EAVE, W), V(x, RIDGE, 0), 0.18, 0.24) }
  bar(geos.steel, V(X0, RIDGE, 0), V(X1, RIDGE, 0), 0.18)
  for (const z of [-W, W]) {
    geos.steel.push(new THREE.BoxGeometry(L, 0.3, 0.12).translate((X0 + X1) / 2, 0.15, z))
    quad([V(X0, 0.3, z), V(X1, 0.3, z), V(X1, EAVE, z), V(X0, EAVE, z)], glassM, g)
    for (let x = X0 + 1.2; x < X1; x += 1.2) bar(geos.alu, V(x, 0.3, z), V(x, EAVE, z), 0.05)
  }
  for (const s of [-1, 1]) quad([V(X0, EAVE, s * W), V(X1, EAVE, s * W), V(X1, RIDGE, 0), V(X0, RIDGE, 0)], glassM, g)
  const floor = new THREE.Mesh(new THREE.BoxGeometry(L + 1, 0.08, W * 2), new THREE.MeshStandardMaterial({ color: 0xd9d6cf, roughness: 0.6 }))
  floor.position.set((X0 + X1) / 2, 0, 0); floor.receiveShadow = true; g.add(floor)
  // 緩衝室：A、B 兩道玻璃自動門（兩片往兩邊滑），上面門楣
  const doors = {}
  for (const [k, x] of [['a', CORR.A], ['b', CORR.B]]) {
    bar(geos.alu, V(x, 2.6, -W), V(x, 2.6, W), 0.16, 0.22)
    for (const z of [-W, W]) bar(geos.alu, V(x, 0, z * 0.97), V(x, 2.6, z * 0.97), 0.1)
    // 門上面那塊（門楣到屋頂）固定玻璃
    quad([V(x, 2.7, -W), V(x, 2.7, W), V(x, EAVE, W), V(x, RIDGE, 0), V(x, EAVE, -W)], glassM, g)
    const panels = [-1, 1].map((s) => {
      const p = new THREE.Group()
      const gl = new THREE.Mesh(new THREE.BoxGeometry(0.03, 2.5, W - 0.05), glassM); gl.renderOrder = 6; p.add(gl)
      const fr = new THREE.Mesh(new THREE.BoxGeometry(0.06, 2.5, 0.06), alu); fr.position.z = -s * (W - 0.05) / 2; p.add(fr)
      p.position.set(x, 1.27, s * (W / 2 - 0.02)); g.add(p)
      return { p, s }
    })
    doors[k] = { panels, x, v: 0, open: 0 }
  }
  // 館：x 從 ALP.X0 到 X1、z ±HZ、簷高 22、屋脊 34；8 公尺一榀門型鋼架，四面＋屋頂霧玻璃
  const { X0: H0, X1: H1, HZ, H } = ALP, HE = 22
  for (let x = H0; x <= H1 + 0.01; x += 8) {
    for (const z of [-HZ, HZ]) bar(geos.steel, V(x, 0, z), V(x, HE, z), 0.5)
    bar(geos.steel, V(x, HE, -HZ), V(x, H, 0), 0.45, 0.7); bar(geos.steel, V(x, HE, HZ), V(x, H, 0), 0.45, 0.7)
  }
  for (const z of [-HZ, HZ]) { bar(geos.steel, V(H0, HE, z), V(H1, HE, z), 0.4, 0.5); bar(geos.alu, V(H0, 8, z), V(H1, 8, z), 0.12); bar(geos.alu, V(H0, 15, z), V(H1, 15, z), 0.12) }
  bar(geos.steel, V(H0, H, 0), V(H1, H, 0), 0.4)
  for (const x of [H0, H1]) for (let z = -HZ + 8; z < HZ; z += 8) bar(geos.steel, V(x, 0, z), V(x, HE + (H - HE) * (1 - Math.abs(z) / HZ), z), 0.4)
  // 霧玻璃：南北牆、屋頂、東牆、西牆（西牆中間留通道的開口）
  for (const z of [-HZ, HZ]) quad([V(H0, 0, z), V(H1, 0, z), V(H1, HE, z), V(H0, HE, z)], frost, g)
  for (const s of [-1, 1]) quad([V(H0, HE, s * HZ), V(H1, HE, s * HZ), V(H1, H, 0), V(H0, H, 0)], frost, g)
  quad([V(H1, 0, -HZ), V(H1, 0, HZ), V(H1, HE, HZ), V(H1, H, 0), V(H1, HE, -HZ)], frost, g)
  // 西牆中間留通道開口：拆成四塊凸多邊形（quad 是扇形三角化，凹的多邊形會破）
  quad([V(H0, 0, W), V(H0, 0, HZ), V(H0, HE, HZ), V(H0, HE, W)], frost, g)
  quad([V(H0, 0, -HZ), V(H0, 0, -W), V(H0, HE, -W), V(H0, HE, -HZ)], frost, g)
  quad([V(H0, RIDGE + 0.4, -W), V(H0, RIDGE + 0.4, W), V(H0, HE, W), V(H0, HE, -W)], frost, g)
  quad([V(H0, HE, -HZ), V(H0, HE, HZ), V(H0, H, 0)], frost, g)
  // 館名（西牆、通道上方，朝外）
  const signT = canvasTex(1024, 256, (x, w, h) => {
    x.fillStyle = '#1f4a36'; x.fillRect(0, 0, w, h)
    x.fillStyle = '#f2f4ef'; x.textAlign = 'center'; x.textBaseline = 'middle'
    x.font = 'bold 120px "PingFang TC", "Noto Sans TC", sans-serif'; x.fillText('高山雲霧林', w / 2, h * 0.42)
    x.font = '600 46px "Helvetica Neue", Arial, sans-serif'; x.fillText('ALPINE CLOUD FOREST', w / 2, h * 0.82)
  })
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(8, 2), new THREE.MeshStandardMaterial({ map: signT, emissive: 0xffffff, emissiveMap: signT, emissiveIntensity: 0.3 }))
  sign.position.set(H0 - 0.3, 6.5, 0); sign.rotation.y = -Math.PI / 2; g.add(sign)
  // 通道裡的指標（從圓頂進來看得到）
  const tagT = canvasTex(512, 128, (x, w, h) => {
    x.fillStyle = '#1f4a36'; x.fillRect(0, 0, w, h); x.fillStyle = '#fff'; x.textAlign = 'center'; x.textBaseline = 'middle'
    x.font = 'bold 56px "PingFang TC", sans-serif'; x.fillText('→ 高山雲霧林', w / 2, h / 2)
  })
  const tag = new THREE.Mesh(new THREE.PlaneGeometry(2, 0.5), new THREE.MeshStandardMaterial({ map: tagT, emissive: 0xffffff, emissiveMap: tagT, emissiveIntensity: 0.4 }))
  tag.position.set(X0 + 0.6, EAVE - 0.5, 0); tag.rotation.y = -Math.PI / 2; g.add(tag)
  for (const [k, m] of [['steel', steel], ['alu', alu]]) { const mesh = new THREE.Mesh(mergeGeometries(geos[k]), m); mesh.castShadow = true; mesh.receiveShadow = true; g.add(mesh) }
  return { g, doors }
}

/* ---------- 針葉樹（程式做的卡片樹） ---------- */
// 一根小枝：中間細枝、兩側密密的短針葉，透明底（alphaTest）
function needleTex() {
  const t = canvasTex(256, 128, (x, w, h) => {
    x.clearRect(0, 0, w, h)
    const rnd = mulberry32(7)
    for (let b = 0; b < 3; b++) {
      const y0 = h * (0.3 + b * 0.2), tilt = (b - 1) * 0.12
      x.strokeStyle = '#4a3a2a'; x.lineWidth = 2.2; x.beginPath(); x.moveTo(0, h / 2); x.lineTo(w * 0.95, y0 + tilt * w * 0.5); x.stroke()
      for (let i = 0; i < 260; i++) {
        const u = rnd() * 0.95, px = u * w, py = h / 2 + (y0 + tilt * w * 0.5 - h / 2) * u
        const a = (rnd() < 0.5 ? -1 : 1) * (0.6 + rnd() * 0.7) + 0.4, len = (7 + rnd() * 9) * (1 - u * 0.4)
        const g = 52 + rnd() * 40
        x.strokeStyle = `rgb(${20 + rnd() * 18},${g},${30 + rnd() * 18})`; x.lineWidth = 1.6
        x.beginPath(); x.moveTo(px, py); x.lineTo(px + Math.cos(a) * len, py + Math.sin(a) * len); x.stroke()
      }
    }
  })
  return t
}
// kind 'fir'：冷杉，細長尖塔、枝條平伸；'hemlock'：鐵杉，比較寬、枝條下垂、頂端歪一點。高度 1（擺放時縮放）
function coniferGeo(kind) {
  const fir = kind === 'fir', R = fir ? 0.17 : 0.27, tiers = fir ? 16 : 12, rnd = mulberry32(fir ? 3 : 5)
  const cards = []
  for (let i = 0; i < tiers; i++) {
    const t = i / (tiers - 1), y = 0.1 + t * 0.88, r = R * Math.pow(1 - t, fir ? 0.85 : 0.7) + 0.02
    const n = fir ? 10 : 11
    for (let k = 0; k < n; k++) {
      const a = (k / n) * TAU + i * 0.9 + rnd() * 0.4
      const len = r * (0.85 + rnd() * 0.3)
      const card = new THREE.PlaneGeometry(len, len * 0.62).translate(len / 2, 0, 0)
      card.rotateX(Math.PI / 2 * 0.25 * (rnd() - 0.5))                                 // 枝條稍微扭一下，不是一片平板
      card.rotateZ(-(fir ? 0.15 : 0.45) - rnd() * 0.2)                                 // 往下垂
      card.rotateY(a); card.translate(0, y, 0)
      cards.push(card)
    }
  }
  const g = mergeGeometries(cards.map((c) => c.toNonIndexed()))
  // 法線往上、往外偏：卡片樹不會一面亮一面黑
  const p = g.attributes.position, n = g.attributes.normal
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i), l = Math.hypot(x, z) || 1; n.setXYZ(i, x / l * 0.5, 0.85, z / l * 0.5) }
  return g
}

/* ---------- 館內 ---------- */
function buildInterior(lib) {
  const g = new THREE.Group(); g.name = 'alpineInterior'
  const rnd = mulberry32(2026)
  const AG = ALP_GRID
  // 地形網格：坡度決定顏色（緩坡箭竹草地的黃綠、陡坡岩石灰、步道泥土、溪邊濕的深色），再加一張細節雜訊貼圖
  {
    const nx = AG.nx, nz = AG.nz, pos = new Float32Array(nx * nz * 3), col = new Float32Array(nx * nz * 3), uv = new Float32Array(nx * nz * 2), idx = []
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const k = j * nx + i, x = AG.x0 + i * AG.cell, z = AG.z0 + j * AG.cell
      pos.set([x, ALP_HEIGHTS[k], z], k * 3); uv.set([x * 0.25, z * 0.25], k * 2)
    }
    for (let j = 0; j < nz - 1; j++) for (let i = 0; i < nx - 1; i++) { const a = j * nx + i, b = a + 1, c = a + nx, d = c + 1; idx.push(a, c, b, b, c, d) }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); geo.setIndex(idx)
    geo.computeVertexNormals()
    const nrm = geo.attributes.normal, c = new THREE.Color()
    for (let k = 0; k < nx * nz; k++) {
      const x = pos[k * 3], z = pos[k * 3 + 2], ny = nrm.getY(k)
      const n = fbm2(x * 0.15, z * 0.15, 3)
      c.setHSL(0.2 + n * 0.04, 0.38, 0.27 + n * 0.06)                                       // 草地
      const rock = ss(0.86, 0.7, ny)
      c.lerp(new THREE.Color().setHSL(0.1, 0.06, 0.36 + n * 0.08), rock)                     // 岩石
      const tr = ss(1.6, 0.9, alpineTrailDist(x, z))
      c.lerp(new THREE.Color().setHSL(0.08, 0.28, 0.33 + n * 0.04), tr * 0.9)               // 步道泥土
      const wet = ss(3.5, 1, alpineStreamDist(x, z))
      c.lerp(new THREE.Color().setHSL(0.15, 0.25, 0.17), wet * 0.7)                          // 溪邊濕地
      col.set([c.r, c.g, c.b], k * 3)
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3))
    const detail = canvasTex(256, 256, (x, w, h) => {
      x.fillStyle = '#d0d0d0'; x.fillRect(0, 0, w, h)
      for (let i = 0; i < 5000; i++) { const l = 150 + Math.random() * 105; x.fillStyle = `rgba(${l},${l},${l},0.5)`; x.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 3, 1 + Math.random() * 3) }
    })
    detail.wrapS = detail.wrapT = THREE.RepeatWrapping
    const ground = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, map: detail, roughness: 0.95 }))
    ground.receiveShadow = true; g.add(ground)
  }
  // 水池＋溪：池面平的，溪是一條沿著溪床的帶子（往下流的水紋貼圖會捲動），陡的那段變成小瀑布
  const waterT = canvasTex(128, 512, (x, w, h) => {
    x.fillStyle = '#7f9aa0'; x.fillRect(0, 0, w, h)
    for (let i = 0; i < 400; i++) { x.strokeStyle = `rgba(235,245,248,${0.1 + Math.random() * 0.35})`; x.lineWidth = 1 + Math.random() * 2; const px = Math.random() * w, py = Math.random() * h; x.beginPath(); x.moveTo(px, py); x.lineTo(px + (Math.random() - 0.5) * 6, py + 10 + Math.random() * 30); x.stroke() }
  })
  waterT.wrapS = waterT.wrapT = THREE.RepeatWrapping
  const waterM = new THREE.MeshStandardMaterial({ map: waterT, color: 0xb8ccd0, transparent: true, opacity: 0.82, roughness: 0.08, metalness: 0.2 })
  {
    const pond = new THREE.Mesh(new THREE.CircleGeometry(ALP_POND.r + 0.8, 48).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x5e7a80, transparent: true, opacity: 0.85, roughness: 0.05, metalness: 0.3 }))
    pond.position.set(ALP_POND.x, ALP_POND.water, ALP_POND.z); g.add(pond)
    const st = ALP_STREAM, prof = ALP_STREAM.prof, pts = [], P = []
    for (let i = 0; i < st.length; i++) P.push(V(st[i][0], prof[i] + 0.25, st[i][1]))
    const curve = new THREE.CatmullRomCurve3(P), N = 160, pos = [], uv = [], idx = []
    let acc = 0, prev = null
    for (let i = 0; i <= N; i++) {
      const p = curve.getPointAt(i / N), tg = curve.getTangentAt(i / N), side = V(-tg.z, 0, tg.x).normalize()
      if (prev) acc += p.distanceTo(prev); prev = p
      const w = 0.9 + 0.4 * Math.sin(i * 0.37)
      for (const s of [-1, 1]) { const q = p.clone().addScaledVector(side, s * w); q.y = Math.max(q.y, alpineHeight(q.x, q.z) + 0.04); pos.push(q.x, q.y, q.z); uv.push(s * 0.5 + 0.5, acc * 0.15) }
      if (i) { const a = (i - 1) * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3) }
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setIndex(idx); geo.computeVertexNormals()
    const stream = new THREE.Mesh(geo, waterM); stream.renderOrder = 2; g.add(stream)
  }
  // 吊橋：兩端木塔＋鋼索扶手（垂成弧線）＋吊索＋木板橋面
  {
    const a = ALP_TRAIL[ALP_BRIDGE.a], b = ALP_TRAIL[ALP_BRIDGE.a + 2], pa = ALP_TRAIL.prof[ALP_BRIDGE.a], pb = ALP_TRAIL.prof[ALP_BRIDGE.a + 2]
    const A = V(a[0], pa, a[1]), B = V(b[0], pb, b[1]), dir = B.clone().sub(A), len = dir.length(); dir.normalize()
    const side = V(-dir.z, 0, dir.x)
    const wood = new THREE.MeshStandardMaterial({ color: 0x6a5038, roughness: 0.85 }), rope = new THREE.MeshStandardMaterial({ color: 0x3a3d40, roughness: 0.4, metalness: 0.7 })
    const planks = [], ropes = [], posts = []
    const deck = (t) => A.clone().lerp(B, t).add(V(0, -0.35 * Math.sin(Math.PI * t), 0))
    for (let i = 0; i <= len / 0.28; i++) {
      const t = i / (len / 0.28), p = deck(t)
      const m = new THREE.Matrix4().makeRotationY(Math.atan2(dir.x, dir.z)).setPosition(p)
      planks.push(new THREE.BoxGeometry(1.5, 0.05, 0.22).applyMatrix4(m))
    }
    for (const s of [-1, 1]) {
      const rail = [], low = []
      for (let i = 0; i <= 24; i++) { const t = i / 24, p = deck(t).addScaledVector(side, s * 0.78); rail.push(p.clone().add(V(0, 1.05 + 0.25 * Math.sin(Math.PI * t), 0))); low.push(p.clone().add(V(0, 0.05, 0))) }
      ropes.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(rail), 48, 0.025, 6), new THREE.TubeGeometry(new THREE.CatmullRomCurve3(low), 48, 0.02, 6))
      for (let i = 1; i < 24; i += 2) ropes.push(new THREE.TubeGeometry(new THREE.LineCurve3(low[i], rail[i]), 1, 0.008, 4))
      for (const [P0, t] of [[A, 0], [B, 1]]) {
        const p = deck(t).addScaledVector(side, s * 0.85)
        posts.push(new THREE.CylinderGeometry(0.1, 0.12, 2.0, 8).translate(p.x, p.y + 0.6, p.z))
      }
    }
    const pm = new THREE.Mesh(mergeGeometries(planks), wood), rm = new THREE.Mesh(mergeGeometries(ropes), rope), po = new THREE.Mesh(mergeGeometries(posts), wood)
    for (const m of [pm, rm, po]) { m.castShadow = true; m.receiveShadow = true; g.add(m) }
  }
  // 山頂觀景台：木平台＋欄杆＋解說牌
  {
    const [x, z] = ALP_TRAIL[ALP_TRAIL.length - 1], y = ALP_TRAIL.prof[ALP_TRAIL.prof.length - 1]
    const wood = new THREE.MeshStandardMaterial({ color: 0x7a5c40, roughness: 0.8 }), gs = []
    gs.push(new THREE.BoxGeometry(4, 0.12, 4).translate(x, y + 0.06, z))
    for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) gs.push(new THREE.BoxGeometry(0.1, 1.1, 0.1).translate(x + sx * 1.95, y + 0.6, z + sz * 1.95))
    for (const [ax, az, bx, bz] of [[-1, -1, 1, -1], [1, -1, 1, 1], [-1, 1, 1, 1]]) bar(gs, V(x + ax * 1.95, y + 1.1, z + az * 1.95), V(x + bx * 1.95, y + 1.1, z + bz * 1.95), 0.08)
    const m = new THREE.Mesh(mergeGeometries(gs.map((q) => q.index ? q.toNonIndexed() : q)), wood); m.castShadow = m.receiveShadow = true; g.add(m)
  }
  // 針葉樹
  {
    const tex = needleTex()
    const needleM = new THREE.MeshStandardMaterial({ map: tex, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.85, color: 0xb8c8b0 })
    const barkM = new THREE.MeshStandardMaterial({ color: 0x4b3a2c, roughness: 0.95 })
    for (const kind of ['fir', 'hemlock']) {
      const crown = coniferGeo(kind), trunk = new THREE.CylinderGeometry(0.006, 0.022, 0.86, 7).translate(0, 0.43, 0)   // 樹幹到 86% 就停：不然樹梢會冒出一根光禿禿的樹幹
      const list = []
      for (let k = 0; k < 4000 && list.length < (kind === 'fir' ? 150 : 110); k++) {
        const x = ALP.X0 + 6 + rnd() * (ALP.X1 - ALP.X0 - 8), z = -ALP.HZ + 2 + rnd() * (ALP.HZ * 2 - 4)
        if (alpineTrailDist(x, z) < 3.2 || alpineStreamDist(x, z) < 2.5 || Math.hypot(x - ALP_POND.x, z - ALP_POND.z) < ALP_POND.r + 2.5) continue
        const u = x - ALP.X0, hgt = alpineHeight(x, z)
        // 冷杉在高處、鐵杉在中坡；山頂附近稀疏（箭竹草原）
        const want = kind === 'fir' ? ss(6, 14, hgt) * (1 - 0.7 * ss(17, 21, hgt)) : ss(2, 6, hgt) * (1 - ss(12, 17, hgt))
        if (rnd() > want * (0.55 + 0.45 * fbm2(x * 0.05, z * 0.05 + kind.length, 2) + 0.3)) continue
        const H = (kind === 'fir' ? 9 : 8) + rnd() * 7
        list.push({ p: V(x, hgt - 0.2, z), q: new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), rnd() * TAU), s: V(H * (0.85 + rnd() * 0.3), H, H * (0.85 + rnd() * 0.3)), H })
        addCollider(x, z, 0.35, hgt + H)
      }
      for (const [geo, mat] of [[crown, needleM], [trunk, barkM]]) {
        const m = new THREE.InstancedMesh(geo, mat, list.length)
        const mm = new THREE.Matrix4(), c = new THREE.Color()
        list.forEach((it, i) => { m.setMatrixAt(i, mm.compose(it.p, it.q, it.s)); if (mat === needleM) m.setColorAt(i, c.setHSL(0.3 + (rnd() - 0.5) * 0.04, 0.3, 0.75 + rnd() * 0.2)) })
        m.castShadow = true; m.receiveShadow = true; m.computeBoundingSphere(); g.add(m)
      }
    }
  }
  // 岩石：陡坡上的大岩塊、溪邊的長苔石頭（用溫室那批岩石模型）
  {
    const lists = {}, put = (n, it) => (lists[n] ||= []).push(it)
    const big = ['rock_face', 'rock_face_02', 'boulder', 'mrock_3', 'mrock_7', 'mrock_9', 'mrock_12'], moss = ['rock_moss_set', 'rock_moss_set_02', 'mrock_8', 'mrock_10', 'boulder']
    const pick = (a) => a[Math.floor(rnd() * a.length)]
    for (let k = 0; k < 3000; k++) {
      const x = ALP.X0 + 6 + rnd() * 72, z = -ALP.HZ + 2 + rnd() * 76
      if (alpineTrailDist(x, z) < 2.2) continue
      const h = alpineHeight(x, z), slope = Math.hypot(alpineHeight(x + 1, z) - h, alpineHeight(x, z + 1) - h)
      const sd = alpineStreamDist(x, z)
      if (sd > 1.4 && sd < 4 && rnd() < 0.25) put(pick(moss), { p: V(x, h - 0.15, z), q: new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rnd() * TAU, 0)), s: V(1, 1, 1).multiplyScalar(0.8 + rnd() * 1.2), c: new THREE.Color().setHSL(0.25, 0.12, 0.85 + rnd() * 0.1) })
      else if (slope > 0.55 && rnd() < 0.06) put(pick(big), { p: V(x, h - 0.6, z), q: new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rnd() * TAU, 0)), s: V(1, 1, 1).multiplyScalar(1.5 + rnd() * 2), c: new THREE.Color().setHSL(0.1, 0.05, 0.8 + rnd() * 0.12) })
    }
    for (const [n, list] of Object.entries(lists)) if (lib[n]) scatter(g, lib[n], list, { cast: true })
    // 溪邊、池邊的蕨類
    const ferns = []
    for (let k = 0; k < 4000 && ferns.length < 260; k++) {
      const x = ALP.X0 + 4 + rnd() * 72, z = -ALP.HZ + 2 + rnd() * 76
      const sd = alpineStreamDist(x, z), dp = Math.hypot(x - ALP_POND.x, z - ALP_POND.z)
      if (!((sd > 1.3 && sd < 4.5) || (dp > ALP_POND.r + 0.8 && dp < ALP_POND.r + 3.5)) || alpineTrailDist(x, z) < 1.6) continue
      ferns.push({ p: V(x, alpineHeight(x, z) - 0.05, z), q: new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), rnd() * TAU), s: V(1, 1, 1).multiplyScalar(0.7 + rnd() * 0.5), c: new THREE.Color().setHSL(0.25, 0.15, 0.9) })
    }
    const fl = {}
    for (const f of ferns) (fl[pick(['fern_sa', 'fern_sb', 'fern2_b', 'fern2_c', 'fern_a'])] ||= []).push(f)
    for (const [n, list] of Object.entries(fl)) if (lib[n]) scatter(g, lib[n], list, { cast: false })
  }
  // 玉山箭竹：坡上一大片黃綠色的高草（跟溫室的草同一套草葉，比較高、比較寬），切成 14 公尺一塊做 LOD
  {
    const A = [], B = [], c = new THREE.Color()
    for (let k = 0; k < 120000 && A.length / 4 < 210000; k++) {
      const x = ALP.X0 + 1 + rnd() * 78, z = -ALP.HZ + 1 + rnd() * 78
      if (alpineTrailDist(x, z) < 1.5 || alpineStreamDist(x, z) < 1.4 || Math.hypot(x - ALP_POND.x, z - ALP_POND.z) < ALP_POND.r + 0.6) continue
      const h = alpineHeight(x, z), u = x - ALP.X0
      const dens = ss(3, 9, u) * (0.45 + 0.55 * fbm2(x * 0.07, z * 0.07, 3) + 0.4)
      if (rnd() > dens) continue
      const m = 5 + Math.floor(rnd() * 6), a0 = rnd() * TAU, tall = 0.45 + rnd() * 0.5 + 0.3 * ss(10, 20, h)
      c.setHSL(0.17 + rnd() * 0.05, 0.42, 0.34 + rnd() * 0.1)
      for (let j = 0; j < m; j++) {
        const a = a0 + (j / m) * TAU + (rnd() - 0.5) * 0.6, d = rnd() * 0.12
        A.push(x + Math.cos(a) * d, h - 0.02, z + Math.sin(a) * d, a)
        B.push(c.r, c.g, c.b, tall * (0.7 + rnd() * 0.5))
      }
    }
    const CELL = 14, cells = new Map()
    for (let i = 0; i < A.length / 4; i++) { const key = Math.floor(A[i * 4] / CELL) + ',' + Math.floor(A[i * 4 + 2] / CELL); (cells.get(key) || cells.set(key, []).get(key)).push(i) }
    for (const [key, idx] of cells) {
      for (let i = idx.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]] }
      const a = [], b = []
      for (const i of idx) { a.push(A[i * 4], A[i * 4 + 1], A[i * 4 + 2], A[i * 4 + 3]); b.push(B[i * 4], B[i * 4 + 1], B[i * 4 + 2], B[i * 4 + 3]) }
      const [cx, cz] = key.split(',').map((v) => (+v + 0.5) * CELL)
      const m = bladeMesh(a, b, { width: [0.018, 0.02] }); m.frustumCulled = false; g.add(m)
      lodRegisterGrass(m, V(cx, alpineHeight(cx, cz) + 0.5, cz), CELL * 0.72 + 1)
    }
  }
  // 雲霧：一片片很大的柔邊霧（面向鏡頭），在山谷裡慢慢飄
  const mist = []
  {
    const mt = canvasTex(128, 128, (x, w, h) => { const gr = x.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2); gr.addColorStop(0, 'rgba(240,245,246,0.55)'); gr.addColorStop(0.6, 'rgba(235,240,242,0.2)'); gr.addColorStop(1, 'rgba(235,240,242,0)'); x.fillStyle = gr; x.fillRect(0, 0, w, h) })
    const mm = new THREE.SpriteMaterial({ map: mt, depthWrite: false, transparent: true, fog: true })
    for (let i = 0; i < 46; i++) {
      const x = ALP.X0 + 8 + rnd() * 66, z = -ALP.HZ + 6 + rnd() * 68
      const s = new THREE.Sprite(mm); const sz = 10 + rnd() * 14
      s.scale.set(sz, sz * 0.45, 1); s.position.set(x, alpineHeight(x, z) + 2 + rnd() * 6, z); s.renderOrder = 7
      s.userData = { x, z, ph: rnd() * TAU, sp: 0.15 + rnd() * 0.25 }
      g.add(s); mist.push(s)
    }
  }
  return { g, mist, waterT }
}

/* ---------- 對外 ---------- */
export function createAlpine({ scene, sun, lib }) {
  const shell = buildShell()
  scene.add(shell.g)
  let interior = null, domeObjs = null, mode = 'dome'
  const fog0 = scene.fog.density
  function ensureInterior() {
    if (interior) return
    interior = buildInterior(lib)
    interior.g.visible = false
    scene.add(interior.g)
  }
  // 圓頂裡面的東西：場景裡除了燈、天空、圓頂外殼、高山館以外的全部（相機行那棟也算，在館裡看不到）
  function collectDome() {
    domeObjs = scene.children.filter((o) => !o.isLight && o !== sun.target && o !== shell.g && o !== interior?.g && !(o.isMesh && o.geometry?.parameters?.radius >= 800) && o.name !== 'domeShell' && o.name !== 'ground')
  }
  const near = (d, px, pz) => Math.abs(px - d.x) < 3.2 && Math.abs(pz) < CORR.W   // 3.2 公尺內就開：跑步（6 m/s）也不會撞到半開的門
  function tick(t, dt, camera) {
    const p = camera.position
    if (p.x > 58) ensureInterior()   // 走到圓頂東半邊就開始蓋（導覽頁的鳥站都在 x < 45，不會觸發）
    // 自動門：人靠近就開（加速、減速），沒人就慢慢關
    for (const k of ['a', 'b']) {
      const d = shell.doors[k], want = near(d, p.x, p.z) ? 1 : 0
      d.open = clamp(d.open + (want ? 2.0 : -1.0) * dt, 0, 1)
      const e = d.open * d.open * (3 - 2 * d.open)
      for (const { p: pn, s } of d.panels) pn.position.z = s * (CORR.W / 2 - 0.02 + e * (CORR.W / 2 - 0.1))
      alpineDoors[k] = d.open
    }
    if (!interior) return
    // 哪一館要畫：在館裡、或 B 門開著 → 畫館內；在圓頂那邊、或 A 門開著 → 畫圓頂
    const showAlp = p.x > CORR.B - 0.5 || shell.doors.b.open > 0.02
    const showDome = p.x < CORR.A + 0.5 || shell.doors.a.open > 0.02
    const m = (showAlp ? 'A' : '') + (showDome ? 'D' : '')
    if (m !== mode) {
      mode = m
      if (!domeObjs) collectDome()
      interior.g.visible = showAlp
      for (const o of domeObjs) o.visible = showDome
      // 太陽陰影的範圍跟著玩家所在的館走（陰影貼圖只蓋得到一館）
      sun.target.position.x = showAlp && !showDome ? XM : 0
      scene.fog.density = showAlp && !showDome ? 0.0095 : fog0   // 雲霧林：霧比較濃
    }
    if (showAlp) {
      interior.waterT.offset.y -= dt * 0.35
      for (const s of interior.mist) { const u = s.userData; s.position.x = u.x + Math.sin(t * 0.05 * u.sp + u.ph) * 6; s.position.z = u.z + Math.cos(t * 0.04 * u.sp + u.ph) * 4 }
    }
  }
  // 遊戲載入時就先蓋好（約 1.6 秒，算在載入畫面裡）；走路時才蓋會整個畫面停住一下
  return { tick, shell, prebuild: ensureInterior, get interior() { return interior }, get mode() { return mode } }
}
