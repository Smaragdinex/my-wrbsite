// 相機行（店面）：溫室入口外面另外一棟，像美術館門口的商店——遊戲從店裡開始，穿過東邊的玻璃通道才進溫室。
// 外觀跟溫室同一套：白色鋼構、玻璃帷幕、天窗、綠牆（植物牆）、LED 燈條，乾淨的高科技感。
// 北牆：櫃台＋老闆（models/owner.glb，Tripo）＋身後發光層架擺機身、鏡頭；南半邊：一座座展示台（玻璃罩＋價格卡）。
// 逛店：走到展示台前面看著它 → 提示名稱、價錢，按 E 打開器材頁（直接跳到那一項）；走到櫃台前 → 按 E 跟老闆說話（賣照片、買器材）。
// 座標（世界）：x 從 STORE.X0（東牆，接通道）到 STORE.X1（西牆，店門口），z ±STORE.HZ，原點在地面
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { STORE, addCollider } from '../layout.js'
import { BODIES, LENSES } from './camera.js'

const { X0, X1, HZ, H } = STORE
const XM = (X0 + X1) / 2
const V = (x, y, z) => new THREE.Vector3(x, y, z)
const COUNTER = { x0: -79.6, x1: -85.6, z: 5.0, h: 1.05, d: 0.75 }
const OWNER = { x: -82.6, z: 6.15 }

function canvasTex(w, h, draw, srgb = true) {
  const c = document.createElement('canvas'); c.width = w; c.height = h
  draw(c.getContext('2d'), w, h)
  const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8
  return t
}
// 磨石子地板：淺灰底＋細碎石子
const terrazzo = () => canvasTex(512, 512, (g, w, h) => {
  g.fillStyle = '#d9d7d1'; g.fillRect(0, 0, w, h)
  for (let i = 0; i < 2600; i++) {
    const l = 120 + Math.random() * 110, r = 0.8 + Math.random() ** 3 * 4
    g.fillStyle = `rgba(${l},${l * 0.98 | 0},${l * 0.94 | 0},${0.35 + Math.random() * 0.4})`
    g.beginPath(); g.arc(Math.random() * w, Math.random() * h, r, 0, 7); g.fill()
  }
})
// 葉子（植物牆用）：一片有葉脈的橢圓葉，透明底
const leafTex = () => canvasTex(128, 128, (g) => {
  g.translate(64, 64)
  g.fillStyle = '#fff'; g.beginPath(); g.ellipse(0, 0, 26, 58, 0, 0, 7); g.fill()
  g.strokeStyle = 'rgba(0,0,0,0.25)'; g.lineWidth = 3; g.beginPath(); g.moveTo(0, -56); g.lineTo(0, 56); g.stroke()
  g.lineWidth = 1.5
  for (let y = -40; y < 50; y += 12) { g.beginPath(); g.moveTo(0, y); g.lineTo(-22, y - 10); g.moveTo(0, y); g.lineTo(22, y - 10); g.stroke() }
})
function labelDraw(it, state) {
  return (g, w, h) => {
    g.fillStyle = '#f7f8f6'; g.fillRect(0, 0, w, h)
    g.fillStyle = '#2f7d4f'; g.fillRect(0, 0, 10, h)
    g.fillStyle = '#1f2a24'; g.font = 'bold 34px "PingFang TC", "Noto Sans TC", sans-serif'; g.textBaseline = 'top'
    g.fillText(it.name, 28, 22)
    const own = state.owned.includes(it.id), using = state.bodyId === it.id || state.lensId === it.id
    g.font = 'bold 40px "PingFang TC", sans-serif'; g.fillStyle = own ? '#2f7d4f' : '#1f2a24'
    g.fillText(using ? '使用中' : own ? '已擁有' : it.price ? `$${it.price.toLocaleString()}` : '免費', 28, 78)
    g.font = '24px "PingFang TC", sans-serif'; g.fillStyle = '#5b6a61'
    g.fillText(it.spec, 28, 140)
  }
}

export async function buildStore(scene, state) {
  const VER = new URL(import.meta.url).searchParams.get('v') ?? ''
  const loader = new GLTFLoader()
  const load = (p) => loader.loadAsync(`${p}?v=${VER}`).then((r) => r.scene)
  const [owner, ...gear] = await Promise.all(['models/owner.glb', ...BODIES.map((b) => `models/camera/body-${b.id}.glb`), ...LENSES.map((l) => `models/camera/lens-${l.id}.glb`)].map(load))
  const gearModel = Object.fromEntries([...BODIES, ...LENSES].map((it, i) => [it.id, gear[i]]))

  const g = new THREE.Group()
  const white = new THREE.MeshStandardMaterial({ color: 0xf2f4f5, roughness: 0.45, metalness: 0.5 })
  const panel = new THREE.MeshStandardMaterial({ color: 0xeceeec, roughness: 0.8, emissive: 0xf4f4f0, emissiveIntensity: 0.18 })   // 白牆、天花板自己亮一點（不然天花板會反射地面的綠，變成橄欖綠）
  const dark = new THREE.MeshStandardMaterial({ color: 0x3c4246, roughness: 0.35, metalness: 0.8 })
  const wood = new THREE.MeshStandardMaterial({ color: 0xb48a5e, roughness: 0.6 })
  const glassM = new THREE.MeshStandardMaterial({ color: 0xcfe4ea, transparent: true, opacity: 0.14, roughness: 0.04, metalness: 0.1, side: THREE.DoubleSide, depthWrite: false })
  const caseGlass = new THREE.MeshStandardMaterial({ color: 0xe8f4f6, transparent: true, opacity: 0.2, roughness: 0.02, metalness: 0.2, depthWrite: false })
  const led = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff4e2, emissiveIntensity: 1.6 })
  led.userData.lamp = [1.2, 2.2]
  const geos = { white: [], panel: [], dark: [], wood: [], led: [] }
  const box = (k, w, h, d, x, y, z) => geos[k].push(new THREE.BoxGeometry(w, h, d).translate(x, y, z))
  const bar = (k, a, b, t = 0.14, t2 = t) => {
    const d = new THREE.Vector3().subVectors(b, a), len = d.length()
    const m = new THREE.Matrix4().lookAt(a, b, Math.abs(d.y) > 0.99 * len ? V(1, 0, 0) : V(0, 1, 0))
    m.setPosition(a.clone().add(b).multiplyScalar(0.5))
    geos[k].push(new THREE.BoxGeometry(t, t2, len).applyMatrix4(m))
  }
  const pane = (pts, mat = glassM) => {
    const pos = []
    for (let i = 1; i < pts.length - 1; i++) pos.push(...pts[0].toArray(), ...pts[i].toArray(), ...pts[i + 1].toArray())
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.computeVertexNormals()
    const m = new THREE.Mesh(geo, mat); m.renderOrder = 5; g.add(m); return m
  }
  const rect = (a, b, c, d) => pane([a, b, c, d])

  /* ---------- 地板、屋頂 ---------- */
  const ft = terrazzo(); ft.wrapS = ft.wrapT = THREE.RepeatWrapping; ft.repeat.set(4, 4)
  const floor = new THREE.Mesh(new THREE.BoxGeometry(X0 - X1, 0.3, HZ * 2), new THREE.MeshStandardMaterial({ map: ft, roughness: 0.35, metalness: 0.05 }))
  floor.position.set(XM, -0.12, 0); floor.receiveShadow = true; g.add(floor)
  // 屋頂：白色天花板，中間一條天窗（z ±2.2，玻璃），天花板下面掛 LED 燈條
  for (const s of [-1, 1]) box('panel', X0 - X1, 0.25, HZ - 2.2, XM, H + 0.12, s * (2.2 + (HZ - 2.2) / 2))
  rect(V(X0, H + 0.2, -2.2), V(X1, H + 0.2, -2.2), V(X1, H + 0.2, 2.2), V(X0, H + 0.2, 2.2))
  for (let x = X0 - 1.3; x > X1; x -= 2.6) for (const z of [-4.6, 4.6]) box('led', 0.08, 0.04, 2.4, x, H - 0.05, z)
  // 柱子（每 3.25 公尺一根）＋屋頂大樑（橫跨 z）＋天窗兩邊的縱樑
  const NX = 4
  for (let i = 0; i <= NX; i++) {
    const x = X0 - (X0 - X1) * i / NX
    for (const z of [-HZ, HZ]) bar('white', V(x, 0, z), V(x, H, z), 0.26)
    bar('white', V(x, H, -HZ), V(x, H, HZ), 0.22, 0.4)
  }
  for (const z of [-2.2, 2.2]) bar('white', V(X0, H, z), V(X1, H, z), 0.16, 0.3)

  /* ---------- 牆 ---------- */
  // 玻璃帷幕：直分隔條每 1.3 公尺、腰帶 3.4 公尺高；底下 0.25 公尺白色踢腳
  const curtain = (ax, az, bx, bz, skip = null) => {
    const len = Math.hypot(bx - ax, bz - az), n = Math.round(len / 1.3)
    for (let i = 1; i < n; i++) {
      const t = i / n, x = ax + (bx - ax) * t, z = az + (bz - az) * t
      if (skip?.(x, z)) continue
      bar('dark', V(x, 0.25, z), V(x, H, z), 0.06, 0.1)
    }
    bar('dark', V(ax, 3.4, az), V(bx, 3.4, bz), 0.07)
    box('white', Math.abs(bx - ax) || 0.14, 0.25, Math.abs(bz - az) || 0.14, (ax + bx) / 2, 0.125, (az + bz) / 2)
    rect(V(ax, 0.25, az), V(bx, 0.25, bz), V(bx, H, bz), V(ax, H, az))
  }
  curtain(X0, -HZ, X1, -HZ)                       // 南牆：整面玻璃
  // 西牆（店門口）：玻璃＋中間一組關著的自動門
  curtain(X1, -HZ, X1, HZ, (x, z) => Math.abs(z) < 1.4)
  for (const s of [-1, 1]) {
    const z0 = s * 0.02, z1 = s * 1.2, xd = X1 + 0.1
    for (const z of [z0, z1]) bar('dark', V(xd, 0.02, z), V(xd, 2.5, z), 0.05, 0.07)
    bar('dark', V(xd, 0.06, z0), V(xd, 0.06, z1), 0.06, 0.12); bar('dark', V(xd, 2.48, z0), V(xd, 2.48, z1), 0.05)
    bar('dark', V(xd + 0.07, 0.95, s * 0.12), V(xd + 0.07, 1.6, s * 0.12), 0.03)
  }
  box('dark', 0.24, 0.26, 2.6, X1 + 0.12, 2.65, 0)
  const mat = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.02, 2.4), new THREE.MeshStandardMaterial({ color: 0x2c2f2c, roughness: 0.95 }))
  mat.position.set(X1 + 1.0, 0.04, 0); g.add(mat)
  // 東牆（接溫室）：中間開口（通道的人字形），兩邊是植物牆，上面玻璃
  const DW = 4.0, EAVE = 3.4, RIDGE = 4.5
  for (const s of [-1, 1]) {
    box('panel', 0.3, H, HZ - DW, X0 + 0.15, H / 2, s * (DW + (HZ - DW) / 2))
    pane([V(X0, EAVE, s * DW), V(X0, RIDGE, 0), V(X0, H, 0), V(X0, H, s * DW)])
  }
  bar('white', V(X0 - 0.05, H - 0.15, -DW), V(X0 - 0.05, H - 0.15, DW), 0.2)
  // 北牆：實心白牆（櫃台後面）
  box('panel', X0 - X1, H, 0.3, XM, H / 2, HZ - 0.15)

  /* ---------- 植物牆（東牆開口兩邊）：深色底板上鋪滿一片片葉子 ---------- */
  {
    const leaves = [], col = [], c = new THREE.Color(), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler()
    for (const s of [-1, 1]) {
      box('dark', 0.08, 3.6, HZ - DW - 0.6, X0 - 0.06, 2.0, s * (DW + (HZ - DW) / 2))
      for (let i = 0; i < 1400; i++) {
        const z = s * (DW + 0.35 + Math.random() * (HZ - DW - 0.7)), y = 0.3 + Math.random() * 3.5
        e.set((Math.random() - 0.5) * 1.2, -Math.PI / 2 + (Math.random() - 0.5) * 1.0, Math.random() * 6.28)
        const sc = 0.12 + Math.random() * 0.16
        m4.compose(V(X0 - 0.12 - Math.random() * 0.12, y, z), q.setFromEuler(e), V(sc, sc, sc))
        leaves.push(m4.clone())
        c.setHSL(0.27 + Math.random() * 0.08, 0.45 + Math.random() * 0.25, 0.18 + Math.random() * 0.2); col.push(c.clone())
      }
    }
    const lm = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshStandardMaterial({ map: leafTex(), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.6 }), leaves.length)
    leaves.forEach((m, i) => { lm.setMatrixAt(i, m); lm.setColorAt(i, col[i]) })
    lm.castShadow = true; lm.receiveShadow = true
    g.add(lm)
  }
  // 南牆邊一排白色長花槽，種一樣的葉子叢
  {
    const leaves = [], col = [], c = new THREE.Color(), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler()
    for (const [x0, x1] of [[X0 - 0.6, -79.2], [-84.4, X1 + 0.6]]) {
      box('panel', x0 - x1, 0.55, 0.7, (x0 + x1) / 2, 0.275, -HZ + 0.5)
      for (let i = 0; i < 420; i++) {
        const x = x1 + Math.random() * (x0 - x1), z = -HZ + 0.25 + Math.random() * 0.5, y = 0.6 + Math.random() ** 1.5 * 0.9
        e.set(-0.3 - Math.random() * 1.0, Math.random() * 6.28, (Math.random() - 0.5) * 0.8)
        const sc = 0.18 + Math.random() * 0.2
        m4.compose(V(x, y, z), q.setFromEuler(e), V(sc, sc, sc)); leaves.push(m4.clone())
        c.setHSL(0.26 + Math.random() * 0.08, 0.5, 0.2 + Math.random() * 0.18); col.push(c.clone())
      }
    }
    const lm = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshStandardMaterial({ map: leafTex(), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.6 }), leaves.length)
    leaves.forEach((m, i) => { lm.setMatrixAt(i, m); lm.setColorAt(i, col[i]) })
    lm.castShadow = true
    g.add(lm)
  }

  /* ---------- 櫃台、老闆、身後層架 ---------- */
  const { x0: cx0, x1: cx1, z: cz, h: ch, d: cd } = COUNTER
  const cxm = (cx0 + cx1) / 2, cw = cx0 - cx1
  box('panel', cw, ch - 0.06, cd, cxm, (ch - 0.06) / 2 + 0.06, cz)            // 櫃體
  box('wood', cw + 0.1, 0.06, cd + 0.12, cxm, ch, cz)                         // 木頭檯面
  box('led', cw - 0.2, 0.03, 0.03, cxm, 0.08, cz - cd / 2 - 0.01)            // 底下的燈條
  for (let i = 0; i < 14; i++) box('wood', 0.05, ch - 0.25, 0.03, cx1 + 0.3 + i * (cw - 0.6) / 13, ch / 2 + 0.05, cz - cd / 2 - 0.02)   // 正面木格柵
  for (let i = 0; i < 7; i++) addCollider(cx1 + 0.4 + i * (cw - 0.8) / 6, cz, 0.5, ch + 0.2)
  owner.position.set(OWNER.x, 0, OWNER.z); owner.rotation.y = Math.PI
  owner.traverse((o) => { if (o.isMesh) o.castShadow = o.receiveShadow = true })
  g.add(owner)
  // 身後層架：三層發光層板，擺機身、鏡頭（跟展示台一樣的模型）
  const SX0 = -79.4, SX1 = -85.8, SZ = HZ - 0.5
  box('white', SX0 - SX1 + 0.3, 2.6, 0.06, (SX0 + SX1) / 2, 1.9, HZ - 0.32)
  const shelfY = [1.15, 1.75, 2.35]
  const shelfItems = [['b1', 'l1', 'b2', 'l2', 'b3', 'l3'], ['l2', 'l1', 'l3', 'l2', 'l1', 'l4'], ['b2', 'b1', 'l4', 'b3', 'b2', 'l1']]
  shelfY.forEach((y, r) => {
    box('white', SX0 - SX1, 0.04, 0.4, (SX0 + SX1) / 2, y, SZ)
    box('led', SX0 - SX1 - 0.1, 0.012, 0.02, (SX0 + SX1) / 2, y - 0.025, SZ - 0.18)
    shelfItems[r].forEach((id, k) => {
      const m = gearModel[id].clone(), x = SX0 - 0.55 - k * (SX0 - SX1 - 1.1) / 5
      if (id[0] === 'l') { m.rotation.x = Math.PI / 2; m.position.set(x, y + 0.02, SZ) }   // 鏡頭立著放（卡口朝下）
      else { m.rotation.y = Math.PI; m.position.set(x, y + 0.075, SZ) }                      // 機身正面朝外
      g.add(m)
    })
  })
  // 店招：層架上面的發光字
  const signT = canvasTex(1024, 192, (x, w, h) => {
    x.clearRect(0, 0, w, h); x.textBaseline = 'middle'; x.textAlign = 'center'
    x.fillStyle = '#2f7d4f'; x.font = 'bold 110px "PingFang TC", "Noto Sans TC", sans-serif'; x.fillText('相機行', w / 2 - 170, h / 2)
    x.fillStyle = '#5b6a61'; x.font = '600 52px "Helvetica Neue", Arial, sans-serif'; x.fillText('PHOTO & OPTICS', w / 2 + 220, h / 2 + 8)
  })
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 0.79), new THREE.MeshStandardMaterial({ map: signT, transparent: true, emissive: 0xffffff, emissiveMap: signT, emissiveIntensity: 0.25 }))
  sign.position.set((SX0 + SX1) / 2, 3.65, HZ - 0.29); sign.rotation.y = Math.PI; g.add(sign)

  /* ---------- 展示台（可以逛） ---------- */
  const items = []
  const spec = (it) => it.af != null ? `對焦 ${it.af}s・連拍 ${it.fps} 張/秒` : `${it.min === it.max ? it.min : it.min + '–' + it.max}mm・f/${it.ap}`
  const place = (it, kind, x, z) => {
    const tall = kind === 'lens' ? Math.max(0.32, (it.id === 'l5' ? 0.46 : 0.3)) : 0.3
    box('panel', 0.62, 0.95, 0.62, x, 0.475, z)                                  // 台座（霧面白，晚上不會變全黑）
    box('led', 0.5, 0.012, 0.5, x, 0.955, z)                                     // 台面發光
    const cg = new THREE.Mesh(new THREE.BoxGeometry(0.56, tall + 0.08, 0.56), caseGlass)
    cg.position.set(x, 0.96 + (tall + 0.08) / 2, z); cg.renderOrder = 6; g.add(cg)
    const m = gearModel[it.id].clone()
    if (kind === 'lens') { m.rotation.x = Math.PI / 2; m.position.set(x, 0.97, z) }
    else { m.rotation.y = 0.5; m.position.set(x, 1.04, z) }
    g.add(m)
    // 價格卡：貼在台座朝店中間（+z）那一面
    const draw = labelDraw({ ...it, spec: spec(it) }, state)
    const t = canvasTex(512, 192, draw)
    const card = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.19), new THREE.MeshStandardMaterial({ map: t, roughness: 0.6 }))
    card.position.set(x, 0.74, z + 0.318); g.add(card)
    addCollider(x, z, 0.42, 1.5)
    items.push({ ...it, kind, pos: V(x, 1.15, z), tex: t, draw: () => { labelDraw({ ...it, spec: spec(it) }, state)(t.image.getContext('2d'), 512, 192); t.needsUpdate = true } })
  }
  BODIES.forEach((b, i) => place(b, 'body', -79.6 - i * 3.0, -1.8))
  LENSES.forEach((l, i) => place(l, 'lens', -78.6 - i * 2.0, -4.6))

  /* ---------- 合併、燈 ---------- */
  const mats = { white, panel, dark, wood, led }
  for (const [k, list] of Object.entries(geos)) {
    if (!list.length) continue
    const mesh = new THREE.Mesh(mergeGeometries(list), mats[k])
    mesh.castShadow = k !== 'led'; mesh.receiveShadow = true
    g.add(mesh)
  }
  // 店裡一盞燈（晚上外面很暗，店裡還是亮的）＋層架那邊一盞
  const l1 = new THREE.PointLight(0xfff2e0, 18, 16, 1.6); l1.position.set(XM, H - 0.4, 0); g.add(l1)
  const l2 = new THREE.PointLight(0xfff2e0, 6, 7, 1.6); l2.position.set(-82.6, 3.0, HZ - 1.4); g.add(l2)
  scene.add(g)

  /* ---------- 互動 ---------- */
  const _d = V(), _f = V(), _p = V()
  // 看著哪個展示台（2.6 公尺內、視線偏不到 12 度）；不然看櫃台前面那一塊
  function focus(camera) {
    camera.getWorldDirection(_f)
    let best = null, bestA = 0.21
    for (const it of items) {
      _d.subVectors(it.pos, camera.position); const dist = _d.length()
      if (dist > 2.6) continue
      const a = _d.normalize().angleTo(_f)
      if (a < bestA) { bestA = a; best = it }
    }
    if (best) return { type: 'item', item: best }
    const p = camera.position
    if (p.x < cx0 + 0.6 && p.x > cx1 - 0.6 && p.z > cz - 2.4 && p.z < cz) return { type: 'counter' }
    return null
  }
  // 老闆：玩家在店裡就轉頭看玩家（以面朝 -z 為中心，最多 ±60 度），平常微微呼吸
  function tick(t, dt, camPos) {
    owner.getWorldPosition(_p)
    const dx = camPos.x - _p.x, dz = camPos.z - _p.z
    let a = Math.atan2(dx, dz); if (a < 0) a += Math.PI * 2          // 0～2π，面朝 -z ＝ π
    const want = camPos.x < X0 + 1 ? THREE.MathUtils.clamp(a, Math.PI - 1.05, Math.PI + 1.05) : Math.PI
    owner.rotation.y += (want - owner.rotation.y) * (1 - Math.exp(-2.5 * dt))
    owner.scale.y = 1 + Math.sin(t * 1.6) * 0.004
  }
  const refresh = () => items.forEach((it) => it.draw())
  return { group: g, focus, tick, refresh, items }
}
