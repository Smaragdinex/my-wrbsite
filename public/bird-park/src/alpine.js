// 第二館：高山雲霧林。圓頂東門 → 玻璃通道（中間是氣候緩衝室，兩道自動門）→ 一棟玻璃溫室，裡面是台灣高山的地形：
// 入口平台、水池，往東爬升到約 20 公尺的山頂；溪流從山上沿山谷流下來（中途一段小瀑布），步道之字形上山、吊橋過溪谷，山頂有觀景台。
// 植物：冷杉（細長尖塔）、鐵杉（較寬、枝條下垂）——程式做的針葉卡片樹；坡上一整片玉山箭竹；溪邊蕨類、長苔的岩石；雲霧一直在飄。
// 地形、步道、溪、吊橋的形狀在 layout.js（玩家走路也要用）。
// 效能：外殼（通道、館的鋼構和霧玻璃）一開始就蓋，很便宜；館裡面等玩家走到東邊才蓋。
// 兩館不同時畫：玩家在館裡（或 B 門開著）才畫館內；在圓頂這邊（或 A 門開著）才畫圓頂裡面，緩衝室兩道門都關著的時候切換。
import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { ALP, ALP_STREAM, ALP_POND, ALP_TRAIL, ALP_BRIDGE, ALP_GRID, ALP_HEIGHTS, ALP_PEAK, alpineHeight, alpineTrailDist, alpineStreamDist, inAlpine, domeY, domeRho, addCollider } from './layout.js'
import { scatter } from './plants.js'
import { bladeMesh } from './flora.js'
import { lodRegister, lodRegisterGrass } from './lod.js'
import { mulberry32, fbm2 } from './noise.js'

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z)
const TAU = Math.PI * 2
const { clamp, lerp } = THREE.MathUtils
const ss = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t) }   // 跟 layout.js 同樣的參數順序（three 的 smoothstep 是 (x, min, max)，第一版用錯，樹全沒長出來）

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
// 鳥站附近：r 公尺內、或鳥到鏡頭那條線 w 公尺內就不放（樹不擋鏡頭、不插進停棲的樹）
function nearBird(avoid, x, z, r, w) {
  for (const b of avoid) {
    if (Math.hypot(x - b.x, z - b.z) < r) return true
    const dx = b.cx - b.x, dz = b.cz - b.z, L2 = dx * dx + dz * dz, t = Math.max(0, Math.min(1, ((x - b.x) * dx + (z - b.z) * dz) / L2))
    if (Math.hypot(x - b.x - dx * t, z - b.z - dz * t) < w) return true
  }
  return false
}
function buildInterior(lib, avoid = []) {
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
    // 只留山區（花園橢圓外、溫室裡）的格子；花園那邊有自己的地面
    const keep = new Uint8Array(nx * nz)
    for (let k = 0; k < nx * nz; k++) keep[k] = inAlpine(pos[k * 3], pos[k * 3 + 2], -1) && domeRho(pos[k * 3], pos[k * 3 + 2]) < 1.0 ? 1 : 0
    for (let j = 0; j < nz - 1; j++) for (let i = 0; i < nx - 1; i++) { const a = j * nx + i, b = a + 1, c = a + nx, d = c + 1; if (keep[a] | keep[b] | keep[c] | keep[d]) idx.push(a, c, b, b, c, d) }
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
    // 遠處的樹：mipmap 把針葉的透明度平均掉，alphaTest 一切就只剩枝幹（遠看像一根根竹竿）。照 mip 層級把透明度補回來
    needleM.alphaToCoverage = true
    needleM.onBeforeCompile = (sh) => {
      sh.fragmentShader = sh.fragmentShader.replace('#include <alphatest_fragment>', `
        vec2 nDx = dFdx(vMapUv * vec2(256.0, 128.0)), nDy = dFdy(vMapUv * vec2(256.0, 128.0));
        diffuseColor.a *= 1.0 + max(0.0, 0.5 * log2(max(dot(nDx, nDx), dot(nDy, nDy)))) * 0.35;
        #include <alphatest_fragment>`)
    }
    needleM.customProgramCacheKey = () => 'needleMip'
    const barkM = new THREE.MeshStandardMaterial({ color: 0x4b3a2c, roughness: 0.95 })
    const coreM = new THREE.MeshStandardMaterial({ color: 0x1f3324, roughness: 1 })
    for (const kind of ['fir', 'hemlock']) {
      const crown = coniferGeo(kind), trunk = new THREE.CylinderGeometry(0.006, 0.022, 0.86, 7).translate(0, 0.43, 0)   // 樹幹到 86% 就停：不然樹梢會冒出一根光禿禿的樹幹
      // 樹冠裡面一個實心的深綠圓錐：卡片樹側看會透光，遠看只剩枝幹像竹竿；有這個芯遠看才是一棵實心的針葉樹
      const core = new THREE.ConeGeometry(kind === 'fir' ? 0.1 : 0.16, 0.8, 7, 1, true).translate(0, 0.52, 0)
      const list = []
      for (let k = 0; k < 12000 && list.length < (kind === 'fir' ? 240 : 180); k++) {
        const x = ALP.X0 + rnd() * (ALP.X1 - ALP.X0), z = -ALP.HZ + rnd() * ALP.HZ * 2
        if (!inAlpine(x, z, 3) || domeRho(x, z) > 0.94) continue
        if (alpineTrailDist(x, z) < 3.2 || alpineStreamDist(x, z) < 2.5 || Math.hypot(x - ALP_POND.x, z - ALP_POND.z) < ALP_POND.r + 2.5) continue
        const hgt = alpineHeight(x, z)
        // 冷杉在高處、鐵杉在中坡；山頂附近稀疏（箭竹草原）
        const want = kind === 'fir' ? ss(7, 16, hgt) * (1 - 0.85 * ss(17, 22, hgt)) : ss(2.5, 7, hgt) * (1 - ss(14, 20, hgt))
        if (rnd() > want * (0.55 + 0.45 * fbm2(x * 0.05, z * 0.05 + kind.length, 2) + 0.3)) continue
        // 越高越矮（高山上的冷杉長不高，山頂看得出去）；不能頂到玻璃
        const H = Math.min(((kind === 'fir' ? 9 : 8) + rnd() * 7) * (1 - 0.5 * ss(12, 22, hgt)), domeY(x, z) - hgt - 1.5)
        if (H < 4) continue
        if (nearBird(avoid, x, z, 5.5, 2.5)) continue
        if (rnd() > ss(86, 100, x)) continue   // 入口一小片空地，先看到山再進林子
        if (Math.hypot(x - ALP_TRAIL.at(-1)[0], z - ALP_TRAIL.at(-1)[1]) < 16) continue   // 山頂觀景台四周是箭竹草原，看得出去
        list.push({ p: V(x, hgt - 0.2, z), q: new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), rnd() * TAU), s: V(H * (0.85 + rnd() * 0.3), H, H * (0.85 + rnd() * 0.3)), H })
        addCollider(x, z, 0.35, hgt + H)
      }
      const ms = []
      for (const [geo, mat] of [[crown, needleM], [trunk, barkM], [core, coreM]]) {
        const m = new THREE.InstancedMesh(geo, mat, list.length)
        const mm = new THREE.Matrix4(), c = new THREE.Color()
        list.forEach((it, i) => { m.setMatrixAt(i, mm.compose(it.p, it.q, it.s)); if (mat === needleM) m.setColorAt(i, c.setHSL(0.3 + (rnd() - 0.5) * 0.04, 0.3, 0.75 + rnd() * 0.2)) })
        m.castShadow = true; m.receiveShadow = true; m.computeBoundingSphere(); g.add(m); ms.push(m)
      }
      lodRegister(ms, 12)   // 視野外的樹不畫（山區變大，樹多了一倍）
    }
  }
  // 岩石：陡坡上的大岩塊、溪邊的長苔石頭（用溫室那批岩石模型）
  {
    const lists = {}, put = (n, it) => (lists[n] ||= []).push(it)
    const big = ['rock_face', 'rock_face_02', 'boulder', 'mrock_3', 'mrock_7', 'mrock_9', 'mrock_12'], moss = ['rock_moss_set', 'rock_moss_set_02', 'mrock_8', 'mrock_10', 'boulder']
    const pick = (a) => a[Math.floor(rnd() * a.length)]
    for (let k = 0; k < 8000; k++) {
      const x = ALP.X0 + rnd() * (ALP.X1 - ALP.X0), z = -ALP.HZ + rnd() * ALP.HZ * 2
      if (!inAlpine(x, z, 2) || domeRho(x, z) > 0.95 || alpineTrailDist(x, z) < 2.2 || nearBird(avoid, x, z, 3, 1.5)) continue
      const h = alpineHeight(x, z), slope = Math.hypot(alpineHeight(x + 1, z) - h, alpineHeight(x, z + 1) - h)
      const sd = alpineStreamDist(x, z)
      if (sd > 1.4 && sd < 4 && rnd() < 0.25) put(pick(moss), { p: V(x, h - 0.15, z), q: new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rnd() * TAU, 0)), s: V(1, 1, 1).multiplyScalar(0.8 + rnd() * 1.2), c: new THREE.Color().setHSL(0.25, 0.12, 0.85 + rnd() * 0.1) })
      else if (slope > 0.55 && rnd() < 0.06) put(pick(big), { p: V(x, h - 0.6, z), q: new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rnd() * TAU, 0)), s: V(1, 1, 1).multiplyScalar(1.5 + rnd() * 2), c: new THREE.Color().setHSL(0.1, 0.05, 0.8 + rnd() * 0.12) })
    }
    for (const [n, list] of Object.entries(lists)) if (lib[n]) scatter(g, lib[n], list, { cast: true })
    // 溪邊、池邊的蕨類
    const ferns = []
    for (let k = 0; k < 12000 && ferns.length < 420; k++) {
      const x = ALP.X0 + rnd() * (ALP.X1 - ALP.X0), z = -ALP.HZ + rnd() * ALP.HZ * 2
      if (!inAlpine(x, z, 1) || domeRho(x, z) > 0.95) continue
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
    for (let k = 0; k < 260000 && A.length / 4 < 330000; k++) {
      const x = ALP.X0 + rnd() * (ALP.X1 - ALP.X0), z = -ALP.HZ + rnd() * ALP.HZ * 2
      if (!inAlpine(x, z, 1) || domeRho(x, z) > 0.955) continue
      if (Math.hypot(x - ALP_TRAIL.at(-1)[0], z - ALP_TRAIL.at(-1)[1]) < 4.5) continue   // 觀景台上
      if (avoid.some((b) => b.ground && Math.hypot(x - b.x, z - b.z) < 1.6)) continue   // 地上的鳥走動的地方草矮一點也不行：直接不長
      if (alpineTrailDist(x, z) < 1.5 || alpineStreamDist(x, z) < 1.4 || Math.hypot(x - ALP_POND.x, z - ALP_POND.z) < ALP_POND.r + 0.6) continue
      const h = alpineHeight(x, z)
      const dens = (0.45 + 0.55 * fbm2(x * 0.07, z * 0.07, 3) + 0.4)
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
  // 雲霧：一團團有雲紋的柔邊霧（四種紋路、各自旋轉），多半貼著山谷和低坡、少數掛在山腰；
  // 順著風慢慢往東飄、飄出山區就從西邊再進來，濃淡會慢慢變；鏡頭靠近就淡掉（走進霧裡不會看到一張平板）。
  // 遠近的整體霧氣在 fogzone.js（低處濃、高處淡）。
  const mist = []
  {
    const texs = [0, 1, 2, 3].map((seed) => canvasTex(256, 256, (x, w, h) => {
      const r = mulberry32(90 + seed)
      x.clearRect(0, 0, w, h)
      for (let i = 0; i < 70; i++) {
        const a = r() * TAU, d = Math.pow(r(), 0.7) * w * 0.3, rr = w * (0.08 + r() * 0.16)
        const cx = w / 2 + Math.cos(a) * d * 1.3, cy = h / 2 + Math.sin(a) * d * 0.6
        const gr = x.createRadialGradient(cx, cy, 0, cx, cy, rr)
        gr.addColorStop(0, `rgba(244,247,248,${0.05 + r() * 0.07})`); gr.addColorStop(1, 'rgba(244,247,248,0)')
        x.fillStyle = gr; x.fillRect(0, 0, w, h)
      }
      // 外圈收邊，不留方形的邊
      x.globalCompositeOperation = 'destination-in'
      const m = x.createRadialGradient(w / 2, h / 2, w * 0.18, w / 2, h / 2, w * 0.5)
      m.addColorStop(0, 'rgba(0,0,0,1)'); m.addColorStop(1, 'rgba(0,0,0,0)')
      x.fillStyle = m; x.fillRect(0, 0, w, h)
    }))
    const zMax = ALP.HZ - 4, X0 = 78, X1 = 182
    const place = (s, x) => {
      const u = s.userData
      for (let k = 0; k < 40; k++) {
        const z = -zMax + rnd() * zMax * 2
        if (!inAlpine(x, z, 4) || domeRho(x, z) > 0.9) { x = X0 + rnd() * (X1 - X0); continue }
        const gy = alpineHeight(x, z)
        // 偏好低處（山谷、溪邊）；高處的少一點
        if (rnd() > 1.15 - gy / 26) { x = X0 + rnd() * (X1 - X0); continue }
        u.x = x; u.z = z; u.y = gy + u.lift; return
      }
      u.x = x; u.z = 0; u.y = alpineHeight(x, 0) + u.lift
    }
    for (let i = 0; i < 120; i++) {
      const mat = new THREE.SpriteMaterial({ map: texs[i % 4], depthWrite: false, transparent: true, fog: true, rotation: (rnd() - 0.5) * 0.4, opacity: 0 })
      const s = new THREE.Sprite(mat), sz = 9 + rnd() * 16
      s.scale.set(sz, sz * (0.38 + rnd() * 0.2), 1); s.renderOrder = 7
      s.userData = { sz, lift: sz * 0.22 + 0.5 + rnd() * 4, op: 0.45 + rnd() * 0.45, ph: rnd() * TAU, sp: 0.25 + rnd() * 0.35, x: 0, z: 0, y: 0 }
      place(s, X0 + rnd() * (X1 - X0))
      g.add(s); mist.push(s)
    }
    var updateMist = (t, dt, camera) => {
      const cp = camera.position
      for (const s of mist) {
        const u = s.userData
        u.x += u.sp * dt; u.z += Math.sin(t * 0.03 + u.ph) * 0.15 * dt
        if (u.x > X1 || !inAlpine(u.x, u.z, 3)) place(s, X0 + rnd() * 6)
        // 地形變高就慢慢往上抬，不插進山坡
        const gy = alpineHeight(u.x, u.z) + u.lift
        u.y += (gy - u.y) * Math.min(1, dt * 0.3)
        s.position.set(u.x, u.y + Math.sin(t * 0.2 + u.ph) * 0.4, u.z)
        const d = s.position.distanceTo(cp)
        const life = 0.6 + 0.4 * Math.sin(t * 0.05 + u.ph * 3)                     // 慢慢變濃變淡
        const edge = ss(X0, X0 + 8, u.x) * (1 - ss(X1 - 10, X1, u.x))                // 從西邊進來時淡入
        s.material.opacity = u.op * life * edge * ss(u.sz * 0.25, u.sz * 0.7, d)     // 太近就淡掉
        s.visible = s.material.opacity > 0.01
      }
    }
  }
  return { g, mist, waterT, updateMist }
}

/* ---------- 對外 ---------- */
// 山區就是溫室東半邊（2026-11-07 改成一個館）：館內一開始就蓋好、一直畫；animate 每格跑（溪水、雲霧）
export function createAlpine({ scene, lib, avoid = [] }) {
  let interior = null
  return {
    build() { if (!interior) { interior = buildInterior(lib, avoid); scene.add(interior.g) } return interior.g },
    get group() { return interior?.g },
    animate(t, dt, camera) {
      if (!interior) return
      interior.waterT.offset.y -= dt * 0.35
      interior.updateMist(t, dt, camera)
    },
  }
}
