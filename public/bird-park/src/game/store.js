// 相機行（店面）：溫室入口外面另外一棟，像美術館門口的商店——遊戲從店裡開始，穿過東邊的玻璃通道才進溫室。
// 外觀跟溫室同一套：白色鋼構、玻璃帷幕、天窗、綠牆（植物牆）、LED 燈條，乾淨的高科技感。
// 北牆：櫃台（中間是發光玻璃展示櫃）＋老闆（會走動的店員，shopkeeper.js，models/owner-rigged.glb）＋身後胡桃木燈箱格櫃；兩個角落：三腳架展示台、相機包櫃，牆上掛鳥類攝影作品（models/store-prints.jpg，ChatGPT 四張拼一張）。
// 南半邊：地毯上一座座展示島（鋼底座＋橡木台面＋玻璃罩＋斜立價格卡）。天花板兩條軌道燈。
// 逛店：走到展示台前面看著它 → 提示名稱、價錢，按 E 打開器材頁（直接跳到那一項）；走到櫃台前 → 按 E 跟老闆說話（賣照片、買器材）。
// 座標（世界）：x 從 STORE.X0（東牆，接通道）到 STORE.X1（西牆，店門口），z ±STORE.HZ，原點在地面
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { STORE, addCollider, colliders } from '../layout.js'
import { BODIES, LENSES } from './camera.js'
import { createShopkeeper } from './shopkeeper.js'

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
// 產品盒：白盒子＋綠色斜帶＋鏡頭圓圈標誌（沒有品牌字）
function packDraw(g, w, h) {
  g.fillStyle = '#f4f4f1'; g.fillRect(0, 0, w, h)
  g.fillStyle = '#2f7d4f'; g.beginPath(); g.moveTo(0, h * 0.62); g.lineTo(w, h * 0.42); g.lineTo(w, h * 0.56); g.lineTo(0, h * 0.76); g.fill()
  g.strokeStyle = '#1f2a24'; g.lineWidth = 7; g.beginPath(); g.arc(w * 0.3, h * 0.3, 30, 0, 7); g.stroke()
  g.lineWidth = 3; g.beginPath(); g.arc(w * 0.3, h * 0.3, 15, 0, 7); g.stroke()
  g.fillStyle = '#1f2a24'; g.fillRect(w * 0.55, h * 0.24, w * 0.32, 8); g.fillRect(w * 0.55, h * 0.32, w * 0.2, 6)
}
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
  const ownerP = loader.loadAsync(`models/owner-rigged.glb?v=${VER}`)
  const gear = await Promise.all([...BODIES.map((b) => `models/camera/body-${b.id}.glb`), ...LENSES.map((l) => `models/camera/lens-${l.id}.glb`)].map(load))
  const gearModel = Object.fromEntries([...BODIES, ...LENSES].map((it, i) => [it.id, gear[i]]))

  const g = new THREE.Group()
  const white = new THREE.MeshStandardMaterial({ color: 0xf2f4f5, roughness: 0.45, metalness: 0.5 })
  const panel = new THREE.MeshStandardMaterial({ color: 0xeceeec, roughness: 0.8, emissive: 0xf4f4f0, emissiveIntensity: 0.18 })   // 白牆、天花板自己亮一點（不然天花板會反射地面的綠，變成橄欖綠）
  const dark = new THREE.MeshStandardMaterial({ color: 0x3c4246, roughness: 0.35, metalness: 0.8 })
  const grain = (base, line) => canvasTex(256, 256, (x, w, h) => {   // 木紋：直條細紋
    x.fillStyle = base; x.fillRect(0, 0, w, h)
    for (let i = 0; i < 140; i++) { x.strokeStyle = line; x.globalAlpha = 0.05 + Math.random() * 0.12; x.lineWidth = 0.5 + Math.random() * 2; const y = Math.random() * h; x.beginPath(); x.moveTo(0, y); x.bezierCurveTo(w * 0.3, y + (Math.random() - 0.5) * 10, w * 0.7, y + (Math.random() - 0.5) * 10, w, y + (Math.random() - 0.5) * 6); x.stroke() }
  })
  const oak = new THREE.MeshStandardMaterial({ map: grain('#c9a477', '#7a5634'), roughness: 0.55 })
  const walnut = new THREE.MeshStandardMaterial({ map: grain('#5f412c', '#2a1a10'), roughness: 0.5 })
  const charcoal = new THREE.MeshStandardMaterial({ color: 0x2e3234, roughness: 0.55, metalness: 0.3, emissive: 0x202322, emissiveIntensity: 0.25 })   // 晚上不要全黑
  const steel = new THREE.MeshStandardMaterial({ color: 0xc9ccce, roughness: 0.3, metalness: 0.85 })
  const glow = new THREE.MeshStandardMaterial({ color: 0xfff6e6, emissive: 0xffeacc, emissiveIntensity: 1.1 })
  const glassM = new THREE.MeshStandardMaterial({ color: 0xcfe4ea, transparent: true, opacity: 0.14, roughness: 0.04, metalness: 0.1, side: THREE.DoubleSide, depthWrite: false })
  const caseGlass = new THREE.MeshStandardMaterial({ color: 0xe8f4f6, transparent: true, opacity: 0.2, roughness: 0.02, metalness: 0.2, depthWrite: false })
  const led = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff4e2, emissiveIntensity: 1.6 })
  led.userData.lamp = [1.2, 2.2]
  const geos = { white: [], panel: [], dark: [], led: [], oak: [], walnut: [], charcoal: [], steel: [], glow: [] }
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
  const mats = { white, panel, dark, led, oak, walnut, charcoal, steel, glow }
  const leafM = new THREE.MeshStandardMaterial({ map: leafTex(), alphaTest: 0.5, side: THREE.DoubleSide, color: 0x6aa05a, roughness: 0.6 })
  const addTuft = (x, y, z, sz) => {   // 小盆栽的葉子：幾片葉子往外斜
    for (let i = 0; i < 9; i++) {
      const piv = new THREE.Group(); piv.position.set(x, y, z); piv.rotation.set(0, i * 0.7 + Math.random() * 0.3, 0)
      const l = new THREE.Mesh(new THREE.PlaneGeometry(sz * 0.45, sz), leafM); l.position.set(0, sz * 0.45, 0); const t = new THREE.Group(); t.rotation.x = 0.35 + Math.random() * 0.45; t.add(l); piv.add(t); g.add(piv)
    }
  }

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

  /* ---------- 東牆開口：往溫室的自動門 ---------- */
  // 兩片玻璃推拉門（中間對開，往兩邊滑進固定玻璃前面），上面一條門楣＋馬達箱，兩面各一顆感應器（關著紅燈、開門綠燈）。
  // 人走到門口 3 公尺內就開，離開一秒後慢慢關；關著的時候擋人（動態碰撞點），開到七成以上才讓人過。
  const DOOR_Y = 2.6, LEAF_W = 1.4, LEAF_H = 2.55, OPEN = 1.36, DX = X0 - 0.12
  box('dark', 0.2, 0.26, DW * 2, X0, DOOR_Y + 0.13, 0)                              // 門楣
  box('steel', 0.2, 0.24, 5.8, X0 - 0.2, DOOR_Y + 0.14, 0)                          // 馬達箱（店內那面）
  box('steel', 0.02, 0.02, 5.6, DX, 0.01, 0)                                        // 地上導軌
  pane([V(X0, DOOR_Y + 0.26, -DW), V(X0, DOOR_Y + 0.26, DW), V(X0, EAVE, DW), V(X0, RIDGE, 0), V(X0, EAVE, -DW)])   // 門楣上的固定玻璃
  for (const s of [-1, 1]) {
    rect(V(X0, 0.02, s * OPEN), V(X0, 0.02, s * DW), V(X0, DOOR_Y, s * DW), V(X0, DOOR_Y, s * OPEN))                 // 兩邊固定玻璃
    bar('dark', V(X0, 0, s * OPEN), V(X0, DOOR_Y, s * OPEN), 0.07, 0.07)
    bar('dark', V(X0, 0.03, s * OPEN), V(X0, 0.03, s * DW), 0.08, 0.06)
    for (const sz of [0.06, 0.14]) box('white', 0.05, 0.004, 0.9, X0 - 0.03, 1.0 + sz, s * (OPEN + 1.3))   // 固定玻璃上的防撞貼條
    addCollider(X0 - 0.05, s * 1.75, 0.32, 9); addCollider(X0 - 0.05, s * 2.4, 0.32, 9); addCollider(X0 - 0.05, s * 3.0, 0.32, 9)
  }
  const sensM = new THREE.MeshStandardMaterial({ color: 0x220000, emissive: 0xff3a2a, emissiveIntensity: 1.2 })
  for (const sx of [X0 - 0.33, X0 + 0.12]) {
    box('dark', 0.08, 0.06, 0.26, sx, DOOR_Y - 0.03, 0)
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.018, 0.04), sensM); lamp.position.set(sx + (sx < X0 ? -0.045 : 0.045), DOOR_Y - 0.04, 0.08); g.add(lamp)
  }
  const bandM = new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, roughness: 0.6, side: THREE.DoubleSide })
  const leaves = [-1, 1].map((s) => {
    const lf = new THREE.Group(); lf.position.set(DX, 0.03, s * LEAF_W / 2)
    const fr = (w, h, y, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(0.05, h, w), mats.dark); m.position.set(0, y, z); m.castShadow = true; lf.add(m) }
    fr(0.05, LEAF_H, LEAF_H / 2, -LEAF_W / 2 + 0.025); fr(0.05, LEAF_H, LEAF_H / 2, LEAF_W / 2 - 0.025)
    fr(LEAF_W, 0.06, LEAF_H - 0.03, 0); fr(LEAF_W, 0.1, 0.05, 0)
    const gl = new THREE.Mesh(new THREE.PlaneGeometry(LEAF_W - 0.1, LEAF_H - 0.16), glassM); gl.rotation.y = Math.PI / 2; gl.position.y = LEAF_H / 2 + 0.02; gl.renderOrder = 5; lf.add(gl)
    for (const y of [1.0, 1.06, 1.12]) { const b = new THREE.Mesh(new THREE.PlaneGeometry(LEAF_W - 0.12, 0.025), bandM); b.rotation.y = Math.PI / 2; b.position.set(-0.012, y, 0); lf.add(b) }   // 磨砂防撞帶
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.04, 0.02), mats.steel); h.position.set(-0.03, 0.95, -s * (LEAF_W / 2 - 0.12)); lf.add(h)          // 手動拉的小把手
    g.add(lf); return { lf, s }
  })
  const doorCol = [-1.2, -0.6, 0, 0.6, 1.2].map((z) => { addCollider(DX, z, 0.32, 9); return colliders[colliders.length - 1] })
  const door = { t: 0, hold: 0 }
  // 店內那面門上：往溫室的指標牌（吊在天花板）
  {
    const t = canvasTex(512, 128, (x, w, h) => {
      x.fillStyle = '#1f2a24'; x.fillRect(0, 0, w, h); x.fillStyle = '#7fd19c'; x.fillRect(0, h - 8, w, 8)
      x.fillStyle = '#fff'; x.textBaseline = 'middle'; x.font = 'bold 56px "PingFang TC", "Noto Sans TC", sans-serif'; x.fillText('溫室', 120, h / 2 - 2)
      x.font = '600 34px "Helvetica Neue", Arial, sans-serif'; x.fillStyle = '#cfe8d8'; x.fillText('GREENHOUSE', 250, h / 2 + 2)
      x.strokeStyle = '#fff'; x.lineWidth = 9; x.beginPath(); x.moveTo(62, h - 26); x.lineTo(62, 26); x.moveTo(38, 50); x.lineTo(62, 24); x.lineTo(86, 50); x.stroke()   // 往前直走的箭頭
    })
    const sm = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.35), new THREE.MeshStandardMaterial({ map: t, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: 0.5 }))
    sm.rotation.y = -Math.PI / 2; sm.position.set(X0 - 0.9, 3.55, 0); g.add(sm)
    box('dark', 0.04, 0.37, 1.42, X0 - 0.87, 3.55, 0)
    for (const z of [-0.55, 0.55]) bar('steel', V(X0 - 0.88, 3.72, z), V(X0 - 0.88, H, z), 0.012)
  }
  const mat2 = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.02, 2.6), mat.material); mat2.position.set(X0 - 0.95, 0.04, 0); mat2.receiveShadow = true; g.add(mat2)   // 門內腳踏墊
  // 防盜感應門（EAS）：兩根白色立板夾著門口
  for (const s of [-1, 1]) {
    box('white', 0.5, 1.45, 0.05, X0 - 0.75, 0.75, s * 1.55); box('steel', 0.56, 0.04, 0.16, X0 - 0.75, 0.02, s * 1.55)
    box('glow', 0.02, 1.3, 0.055, X0 - 0.52, 0.78, s * 1.55)
    addCollider(X0 - 0.75, s * 1.6, 0.22, 2)
  }
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

  /* ---------- 櫃台、老闆、身後的燈箱格櫃 ---------- */
  // 櫃台：深灰櫃體、橡木檯面；正面中間一段是發光的玻璃展示櫃（鏡頭躺著放），兩邊是直條橡木格柵
  const { x0: cx0, x1: cx1, z: cz, h: ch, d: cd } = COUNTER
  const cxm = (cx0 + cx1) / 2, cw = cx0 - cx1, cf = cz - cd / 2      // cf：櫃台正面
  const GX0 = -81.1, GX1 = -84.1                                     // 玻璃展示段
    // 櫃體：兩邊實心，中間展示段挖空（底板、頂板、背板），才看得到裡面的發光層板
  for (const [x0, x1] of [[cx0, GX0], [GX1, cx1]]) box('charcoal', x0 - x1, ch - 0.06, cd - 0.04, (x0 + x1) / 2, (ch - 0.06) / 2, cz + 0.02)
  box('charcoal', GX0 - GX1, 0.16, cd - 0.04, (GX0 + GX1) / 2, 0.08, cz + 0.02)
  box('charcoal', GX0 - GX1, 0.1, cd - 0.04, (GX0 + GX1) / 2, ch - 0.08, cz + 0.02)
  box('charcoal', GX0 - GX1, ch - 0.06, 0.04, (GX0 + GX1) / 2, (ch - 0.06) / 2, cz + cd / 2)
  box('oak', cw + 0.12, 0.06, cd + 0.14, cxm, ch, cz)
  box('charcoal', cw + 0.04, 0.06, cd + 0.02, cxm, 0.03, cz - 0.01)   // 踢腳內縮的陰影
  for (const [x0, x1] of [[cx0, GX0], [GX1, cx1]]) {
    const n = Math.round((x0 - x1) / 0.07)
    for (let i = 0; i < n; i++) box('oak', 0.045, ch - 0.2, 0.035, x0 - 0.035 - i * (x0 - x1 - 0.07) / (n - 1), (ch - 0.2) / 2 + 0.1, cf - 0.02)
  }
  // 展示段：裡面一層發光層板，躺著放鏡頭；前面一片玻璃、上下鋁邊
  box('glow', GX0 - GX1 - 0.06, 0.02, cd - 0.2, (GX0 + GX1) / 2, 0.42, cz)
  box('glow', GX0 - GX1 - 0.06, 0.012, 0.02, (GX0 + GX1) / 2, ch - 0.14, cf + 0.06)   // 上緣往下打的燈條
  box('steel', GX0 - GX1, 0.04, 0.05, (GX0 + GX1) / 2, ch - 0.06, cf - 0.02)
  box('steel', GX0 - GX1, 0.04, 0.05, (GX0 + GX1) / 2, 0.14, cf - 0.02)
  rect(V(GX0, 0.16, cf - 0.03), V(GX1, 0.16, cf - 0.03), V(GX1, ch - 0.08, cf - 0.03), V(GX0, ch - 0.08, cf - 0.03))
  ;['l1', 'l2', 'l3', 'l4', 'l2', 'l1'].forEach((id, k) => {
    const m = gearModel[id].clone(); m.rotation.y = Math.PI / 2   // 側躺，鏡頭朝 +x
    m.position.set(GX0 - 0.42 - k * 0.45, 0.48, cz - 0.05); g.add(m)
  })
  for (let i = 0; i < 7; i++) addCollider(cx1 + 0.4 + i * (cw - 0.8) / 6, cz, 0.5, ch + 0.2)
  // 檯面上：結帳平板（立架）、刷卡機、一疊產品盒、小盆栽、鏡頭清潔組
  box('steel', 0.08, 0.16, 0.08, -81.7, ch + 0.1, cz + 0.12)
  {
    const pos = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.24, 0.015), new THREE.MeshStandardMaterial({ color: 0x111416, roughness: 0.25, metalness: 0.4, emissive: 0x9fc6b0, emissiveIntensity: 0.25 }))
    pos.position.set(-81.7, ch + 0.24, cz + 0.1); pos.rotation.set(-0.45, Math.PI, 0); g.add(pos)
  }
  box('charcoal', 0.09, 0.03, 0.15, -82.25, ch + 0.045, cz - 0.15)
  box('glow', 0.06, 0.004, 0.04, -82.25, ch + 0.062, cz - 0.17)
  const boxM = new THREE.MeshStandardMaterial({ map: canvasTex(256, 256, packDraw), roughness: 0.55 })
  const pack = (w, h, d, x, y, z, ry = 0) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), boxM); m.position.set(x, y + h / 2, z); m.rotation.y = ry; m.castShadow = true; g.add(m); return m }
  pack(0.2, 0.14, 0.16, -84.5, ch + 0.03, cz - 0.05, 0.2); pack(0.18, 0.12, 0.14, -84.5, ch + 0.17, cz - 0.05, -0.1); pack(0.12, 0.09, 0.1, -84.95, ch + 0.03, cz + 0.1, 0.5)
  box('white', 0.13, 0.12, 0.13, -80.3, ch + 0.09, cz + 0.1)                    // 小盆栽（白盆）
  addTuft(-80.3, ch + 0.15, cz + 0.1, 0.22)
  box('charcoal', 0.16, 0.06, 0.1, -80.9, ch + 0.06, cz - 0.15)                  // 清潔組：吹球座
  box('oak', 0.035, 0.12, 0.035, -80.95, ch + 0.15, cz - 0.15)

  // 收據機（平板旁邊，吐出一小段紙）、紙袋（櫃台東端，綠色腰帶＋扭繩提把）
  box('charcoal', 0.13, 0.1, 0.15, -81.25, ch + 0.08, cz + 0.12)
  { const pp = new THREE.Mesh(new THREE.PlaneGeometry(0.07, 0.09), new THREE.MeshStandardMaterial({ color: 0xfbfbf8, roughness: 0.9, side: THREE.DoubleSide })); pp.position.set(-81.25, ch + 0.17, cz + 0.04); pp.rotation.x = -0.5; g.add(pp) }
  {
    const bagT = canvasTex(256, 256, (x, w, h) => {
      x.fillStyle = '#f3efe6'; x.fillRect(0, 0, w, h); x.fillStyle = '#2f7d4f'; x.fillRect(0, h * 0.55, w, h * 0.12)
      x.fillStyle = '#1f2a24'; x.font = 'bold 40px "PingFang TC", sans-serif'; x.textAlign = 'center'; x.fillText('相機行', w / 2, h * 0.4)
    })
    const bm = new THREE.MeshStandardMaterial({ map: bagT, roughness: 0.85 }), hm = new THREE.MeshStandardMaterial({ color: 0xcdbb98, roughness: 0.9 })
    ;[[-79.95, 0.26, -0.12], [-80.2, 0.3, 0.15]].forEach(([x, hh, ry]) => {
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.26, hh, 0.11), bm); b.position.set(x, ch + 0.03 + hh / 2, cz - 0.05); b.rotation.y = ry; b.castShadow = true; g.add(b)
      for (const dz of [-0.035, 0.035]) { const hd = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.006, 5, 12, Math.PI), hm); hd.position.set(0, hh / 2, dz); b.add(hd) }
    })
  }


  // 身後：胡桃木燈箱格櫃 8 欄 × 4 列，每格背板自己發暖光，擺機身／鏡頭／產品盒；下面是抽屜櫃
  const SX0 = -79.3, SX1 = -85.9, SB = HZ - 0.32, SD = 0.42, SY0 = 0.95, SY1 = 3.35, COLS = 8, ROWS = 4
  const cwid = (SX0 - SX1) / COLS, chgt = (SY1 - SY0) / ROWS, sfz = SB - SD   // sfz：格櫃正面
  box('glow', SX0 - SX1, SY1 - SY0, 0.02, (SX0 + SX1) / 2, (SY0 + SY1) / 2, SB - 0.01)
  for (let i = 0; i <= COLS; i++) box('walnut', 0.045, SY1 - SY0 + 0.045, SD, SX0 - i * cwid, (SY0 + SY1) / 2, SB - SD / 2)
  for (let j = 0; j <= ROWS; j++) box('walnut', SX0 - SX1 + 0.045, 0.045, SD, (SX0 + SX1) / 2, SY0 + j * chgt, SB - SD / 2)
  box('walnut', SX0 - SX1 + 0.1, SY0 - 0.02, SD + 0.04, (SX0 + SX1) / 2, (SY0 - 0.02) / 2, SB - SD / 2 - 0.02)   // 下面的抽屜櫃
  for (let i = 0; i < COLS; i++) for (const y of [0.32, 0.68]) {
    box('charcoal', cwid - 0.06, 0.012, 0.01, SX0 - (i + 0.5) * cwid, y + 0.17, sfz - 0.025)   // 抽屜縫
    box('steel', 0.16, 0.018, 0.025, SX0 - (i + 0.5) * cwid, y, sfz - 0.035)                  // 把手
  }
  const cubby = [
    ['b1', 'l1', 'P', 'b2', 'l3', 'b3', 'P', 'l2'],
    ['l3', 'b2', 'l1', 'PP', 'l4', 'l2', 'b1', 'l3'],
    ['P', 'l2', 'b3', 'l1', 'b2', 'P', 'l3', 'b1'],
    ['l4', 'PP', 'l2', 'b1', 'P', 'l1', 'PP', 'l5'],
  ]
  cubby.forEach((row, rj) => row.forEach((id, ci) => {
    const x = SX0 - (ci + 0.5) * cwid, y = SY1 - (rj + 1) * chgt + 0.025, z = SB - SD / 2 - 0.02
    if (id[0] === 'P') {
      pack(0.24, 0.18, 0.2, x - 0.12, y, z, 0.15); if (id === 'PP') pack(0.2, 0.15, 0.17, x + 0.18, y, z, -0.2)
      else pack(0.16, 0.12, 0.13, x + 0.15, y, z, 0.4)
      return
    }
    const m = gearModel[id].clone()
    if (id[0] === 'l') { m.rotation.x = Math.PI / 2; m.position.set(x, y, z) }
    else { m.rotation.y = Math.PI + 0.35; m.position.set(x, y + 0.075, z) }
    m.scale.setScalar(1.25)    // 格子裡放大一點，從櫃台外面看得清楚
    g.add(m)
    box('white', 0.11, 0.045, 0.003, x, y + 0.04, sfz + 0.01)   // 小價格條
  }))
  // 店招：格櫃上面的發光字
  const signT = canvasTex(1024, 192, (x, w, h) => {
    x.clearRect(0, 0, w, h); x.textBaseline = 'middle'; x.textAlign = 'center'
    x.fillStyle = '#2f7d4f'; x.font = 'bold 110px "PingFang TC", "Noto Sans TC", sans-serif'; x.fillText('相機行', w / 2 - 170, h / 2)
    x.fillStyle = '#5b6a61'; x.font = '600 52px "Helvetica Neue", Arial, sans-serif'; x.fillText('PHOTO & OPTICS', w / 2 + 220, h / 2 + 8)
  })
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 0.79), new THREE.MeshStandardMaterial({ map: signT, transparent: true, emissive: 0xffffff, emissiveMap: signT, emissiveIntensity: 0.25 }))
  sign.position.set((SX0 + SX1) / 2, 3.95, HZ - 0.29); sign.rotation.y = Math.PI; g.add(sign)

  /* ---------- 牆上的鳥類攝影作品（ChatGPT 畫的四張，一張圖切四格） ---------- */
  const printT = await new THREE.TextureLoader().loadAsync(`models/store-prints.jpg?v=${VER}`)
  printT.colorSpace = THREE.SRGBColorSpace; printT.anisotropy = 8
  const frame = (k, x, y, z, w, ry) => {      // k：第幾張（0 左上、1 右上、2 左下、3 右下）
    const t = printT.clone(); t.repeat.set(0.5, 0.5); t.offset.set((k % 2) * 0.5, k < 2 ? 0.5 : 0); t.needsUpdate = true
    const fg = new THREE.Group(); fg.position.set(x, y, z); fg.rotation.y = ry
    const fr = new THREE.Mesh(new THREE.BoxGeometry(w + 0.08, w + 0.08, 0.04), mats.walnut); fr.castShadow = true
    const mt = new THREE.Mesh(new THREE.PlaneGeometry(w, w), new THREE.MeshStandardMaterial({ color: 0xf6f5f0, roughness: 0.9 })); mt.position.z = 0.021
    const ph = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.82, w * 0.82), new THREE.MeshStandardMaterial({ map: t, roughness: 0.5 })); ph.position.z = 0.022
    fg.add(fr, mt, ph); g.add(fg)
  }
  // 北牆西段（三腳架展示台上面）、北牆東段（相機包櫃上面）
  frame(0, -86.75, 2.75, HZ - 0.32, 0.8, Math.PI); frame(1, -87.75, 2.75, HZ - 0.32, 0.8, Math.PI)
  frame(2, -77.05, 2.85, HZ - 0.32, 0.8, Math.PI); frame(3, -78.15, 2.85, HZ - 0.32, 0.8, Math.PI)

  /* ---------- 西北角：三腳架展示台 ---------- */
  box('oak', 2.0, 0.12, 0.9, -87.3, 0.06, HZ - 0.85)
  box('glow', 1.96, 0.01, 0.02, -87.3, 0.125, HZ - 1.3)
  const tripod = (x, z, hgt, cam) => {
    const top = V(x, hgt, z)
    for (let i = 0; i < 3; i++) { const a = i * 2.094 + 0.5; bar('charcoal', top, V(x + Math.cos(a) * hgt * 0.27, 0.13, z + Math.sin(a) * hgt * 0.27), 0.025) }
    bar('steel', V(x, hgt - 0.35, z), V(x, hgt + 0.08, z), 0.02)
    box('charcoal', 0.08, 0.06, 0.08, x, hgt + 0.11, z)
    if (cam) { const b = gearModel[cam].clone(); b.rotation.y = 2.3; b.position.set(x, hgt + 0.14 + 0.075, z); g.add(b) }
  }
  tripod(-86.6, HZ - 0.9, 1.35, 'b2'); tripod(-87.35, HZ - 0.8, 1.2, null); tripod(-88.05, HZ - 0.95, 1.45, 'b3')
  addCollider(-87.3, HZ - 0.85, 1.0, 1.5)

  /* ---------- 東北角：相機包櫃 ---------- */
  box('walnut', 2.9, 0.04, 0.45, -77.6, 0.5, HZ - 0.55); box('walnut', 2.9, 0.04, 0.45, -77.6, 1.25, HZ - 0.55)
  for (const x of [-76.15, -79.05]) box('walnut', 0.04, 1.3, 0.45, x, 0.65, HZ - 0.55)
  const bagM = [0x34393a, 0x5d6445, 0x8a6a48, 0x2c3a4a].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.85 }))
  ;[[-76.6, 0.52, 0.45, 0.32], [-77.35, 0.52, 0.55, 0.36], [-78.3, 0.52, 0.5, 0.3], [-76.75, 1.27, 0.38, 0.28], [-77.6, 1.27, 0.5, 0.42], [-78.5, 1.27, 0.42, 0.3]].forEach(([x, y, w, h], i) => {
    const bag = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.3, 2, 2, 2), bagM[i % 4]); bag.position.set(x, y + h / 2, HZ - 0.55); bag.castShadow = true; g.add(bag)
    const strap = new THREE.Mesh(new THREE.TorusGeometry(w * 0.32, 0.012, 6, 16, Math.PI), mats.charcoal); strap.position.set(x, y + h, HZ - 0.55); g.add(strap)
    box('steel', 0.05, 0.03, 0.01, x, y + h * 0.6, HZ - 0.71)
  })
  addCollider(-77.6, HZ - 0.55, 0.7, 1.5); addCollider(-78.4, HZ - 0.55, 0.7, 1.5)

  /* ---------- 天花板軌道燈（照展示台那一區） ---------- */
  for (const z of [-3.3, 3.0]) {
    box('charcoal', X0 - X1 - 1.4, 0.04, 0.05, XM, H - 0.03, z)
    for (let x = X0 - 1.1; x > X1 + 0.8; x -= 1.45) {
      const hd = new THREE.Group(); hd.position.set(x, H - 0.06, z)
      const can = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.065, 0.2, 14), mats.charcoal); can.position.y = -0.12
      const lens = new THREE.Mesh(new THREE.CircleGeometry(0.05, 14), led); lens.rotation.x = Math.PI / 2; lens.position.y = -0.221
      can.add(lens); const piv = new THREE.Group(); piv.rotation.x = z < 0 ? -0.35 : 0.3; piv.add(can); hd.add(piv); g.add(hd)
    }
  }

  /* ---------- 地毯（展示台那一區） ---------- */
  const rugT = canvasTex(512, 256, (x, w, h) => {
    x.fillStyle = '#3a3f3c'; x.fillRect(0, 0, w, h)
    for (let i = 0; i < 9000; i++) { const l = 50 + Math.random() * 25; x.fillStyle = `rgb(${l},${l + 4},${l + 2})`; x.fillRect(Math.random() * w, Math.random() * h, 1.5, 1.5) }
    x.strokeStyle = '#7d8a80'; x.lineWidth = 5; x.strokeRect(14, 14, w - 28, h - 28)
  })
  const rug = new THREE.Mesh(new THREE.BoxGeometry(9.4, 0.012, 4.6), new THREE.MeshStandardMaterial({ map: rugT, roughness: 0.95 }))
  rug.position.set(-82.6, 0.036, -3.2); rug.receiveShadow = true; g.add(rug)


  /* ---------- 南牆中段：配件牆（洞洞板掛記憶卡、電池、濾鏡…，下面抽屜櫃） ---------- */
  const AX0 = -79.45, AX1 = -84.15, AW = AX0 - AX1, AXM = (AX0 + AX1) / 2, AZ = -HZ + 0.3
  box('charcoal', AW, 0.74, 0.45, AXM, 0.37, AZ + 0.225)
  box('oak', AW + 0.04, 0.04, 0.49, AXM, 0.76, AZ + 0.235)
  for (let i = 0; i < 6; i++) { const x = AX0 - (i + 0.5) * AW / 6; box('steel', 0.18, 0.018, 0.025, x, 0.55, AZ + 0.465); box('dark', AW / 6 - 0.04, 0.008, 0.008, x, 0.38, AZ + 0.452) }
  const pegT = canvasTex(512, 256, (x, w, h) => {
    x.fillStyle = '#f1f2ef'; x.fillRect(0, 0, w, h); x.fillStyle = 'rgba(40,45,42,0.45)'
    for (let yy = 8; yy < h; yy += 16) for (let xx = 8; xx < w; xx += 16) { x.beginPath(); x.arc(xx, yy, 2.2, 0, 7); x.fill() }
  })
  pegT.wrapS = pegT.wrapT = THREE.RepeatWrapping; pegT.repeat.set(3, 1.6)
  const peg = new THREE.Mesh(new THREE.BoxGeometry(AW, 1.6, 0.04), new THREE.MeshStandardMaterial({ map: pegT, roughness: 0.8, emissive: 0xf4f4f0, emissiveIntensity: 0.12 }))
  peg.position.set(AXM, 1.62, AZ + 0.02); peg.receiveShadow = true; g.add(peg)
  for (const x of [AX0 + 0.03, AX1 - 0.03]) box('walnut', 0.06, 2.0, 0.5, x, 1.42, AZ + 0.25)
  box('walnut', AW + 0.12, 0.06, 0.5, AXM, 2.45, AZ + 0.25)
  {
    const t = canvasTex(1024, 128, (x, w, h) => {
      x.clearRect(0, 0, w, h); x.textBaseline = 'middle'; x.textAlign = 'center'
      x.fillStyle = '#2f7d4f'; x.font = 'bold 72px "PingFang TC", "Noto Sans TC", sans-serif'; x.fillText('配件', w / 2 - 150, h / 2)
      x.fillStyle = '#5b6a61'; x.font = '600 44px "Helvetica Neue", Arial, sans-serif'; x.fillText('ACCESSORIES', w / 2 + 110, h / 2 + 4)
    })
    const sm = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.3), new THREE.MeshStandardMaterial({ map: t, transparent: true, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: 0.3 }))
    sm.position.set(AXM, 2.66, AZ + 0.51); g.add(sm)
  }
  // 掛卡：一張 1024×512 的圖畫 8 種配件（4×2 格），每種用 offset 取一格
  const cardT = canvasTex(1024, 512, (x) => {
    const tile = (k, draw, label, sub, col) => {
      const ox = (k % 4) * 256, oy = Math.floor(k / 4) * 256
      x.save(); x.translate(ox, oy)
      x.fillStyle = '#fafaf7'; x.fillRect(4, 4, 248, 248); x.fillStyle = col; x.fillRect(4, 4, 248, 50)
      x.fillStyle = '#d8d8d2'; x.beginPath(); x.ellipse(128, 26, 22, 8, 0, 0, 7); x.fill()   // 掛孔
      x.fillStyle = '#fff'; x.font = 'bold 26px "Helvetica Neue", Arial, sans-serif'; x.textAlign = 'center'; x.fillText(label, 128, 48)
      x.save(); x.translate(128, 140); draw(); x.restore()
      x.fillStyle = '#2b302d'; x.font = 'bold 24px "PingFang TC", sans-serif'; x.fillText(sub, 128, 238)
      x.restore()
    }
    tile(0, () => { x.fillStyle = '#20252a'; x.beginPath(); x.moveTo(-40, -55); x.lineTo(25, -55); x.lineTo(40, -40); x.lineTo(40, 55); x.lineTo(-40, 55); x.fill(); x.fillStyle = '#d33'; x.fillRect(-40, -10, 80, 26); x.fillStyle = '#fff'; x.font = 'bold 20px Arial'; x.fillText('128GB', 0, 10) }, 'SD CARD', '記憶卡', '#c0392b')
    tile(1, () => { x.fillStyle = '#1b1d1f'; x.fillRect(-32, -58, 64, 112); x.fillStyle = '#c9a24a'; x.fillRect(-18, -58, 36, 8); x.fillStyle = '#9aa'; x.font = 'bold 15px Arial'; x.fillText('2280mAh', 0, 8) }, 'BATTERY', '鋰電池', '#2c3e50')
    tile(2, () => { x.fillStyle = '#111'; x.beginPath(); x.arc(0, 0, 58, 0, 7); x.fill(); const gr = x.createRadialGradient(-15, -15, 5, 0, 0, 50); gr.addColorStop(0, '#6c6f74'); gr.addColorStop(1, '#202226'); x.fillStyle = gr; x.beginPath(); x.arc(0, 0, 48, 0, 7); x.fill() }, 'ND FILTER', '減光鏡', '#34495e')
    tile(3, () => { x.fillStyle = '#111'; x.beginPath(); x.arc(0, 0, 58, 0, 7); x.fill(); x.fillStyle = '#cfe6f0'; x.beginPath(); x.arc(0, 0, 48, 0, 7); x.fill(); x.fillStyle = 'rgba(255,255,255,0.8)'; x.beginPath(); x.ellipse(-16, -18, 18, 8, -0.7, 0, 7); x.fill() }, 'UV FILTER', '保護鏡', '#2f7d4f')
    tile(4, () => { x.rotate(-0.6); x.fillStyle = '#2b2f33'; x.fillRect(-10, -62, 20, 100); x.fillStyle = '#c3c6c9'; x.fillRect(-10, 38, 20, 14); x.fillStyle = '#e8e4da'; x.beginPath(); x.arc(0, 60, 9, 0, 7); x.fill() }, 'LENSPEN', '拭鏡筆', '#8e6c3a')
    tile(5, () => { x.strokeStyle = '#3d4a3f'; x.lineWidth = 16; x.beginPath(); for (let a = 0; a < 18; a += 0.2) { const r = 12 + a * 2.3; x.lineTo(Math.cos(a) * r, Math.sin(a) * r * 0.6) } x.stroke() }, 'STRAP', '相機背帶', '#556b2f')
    tile(6, () => { x.fillStyle = '#141516'; x.beginPath(); x.arc(0, 0, 56, 0, 7); x.fill(); x.strokeStyle = '#3a3c3e'; x.lineWidth = 4; x.beginPath(); x.arc(0, 0, 44, 0, 7); x.stroke(); x.fillStyle = '#9a9c9e'; x.fillRect(-60, -8, 12, 16); x.fillRect(48, -8, 12, 16) }, 'LENS CAP', '鏡頭蓋', '#444')
    tile(7, () => { x.fillStyle = '#1e2124'; x.fillRect(-24, -55, 48, 90); x.fillStyle = '#7fd19c'; x.beginPath(); x.arc(0, -20, 14, 0, 7); x.fill(); x.strokeStyle = '#1e2124'; x.lineWidth = 5; x.beginPath(); x.moveTo(0, 35); x.bezierCurveTo(0, 70, 50, 50, 50, 80); x.stroke() }, 'REMOTE', '快門線', '#7d3c98')
  })
  const cardGeo = new THREE.BoxGeometry(0.2, 0.2, 0.012)
  const cardMs = [...Array(8)].map((_, k) => {
    const t = cardT.clone(); t.repeat.set(0.25, 0.5); t.offset.set((k % 4) * 0.25, k < 4 ? 0.5 : 0); t.needsUpdate = true
    const face = new THREE.MeshStandardMaterial({ map: t, roughness: 0.6 }), back = new THREE.MeshStandardMaterial({ color: 0xe9e9e4, roughness: 0.8 })
    return [back, back, back, back, face, back]
  })
  const PCOLS = 9, prow = [2.3, 1.92, 1.54, 1.16]
  prow.forEach((y, r) => { for (let c = 0; c < PCOLS; c++) {
    const x = AX0 - 0.3 - c * (AW - 0.6) / (PCOLS - 1), k = (c * 3 + r * 5) % 8
    bar('steel', V(x, y + 0.02, AZ + 0.04), V(x, y + 0.04, AZ + 0.27), 0.008)
    for (let n = 0; n < 4; n++) { const cm = new THREE.Mesh(cardGeo, cardMs[k]); cm.position.set(x, y - 0.09, AZ + 0.09 + n * 0.045); cm.rotation.x = 0.05; g.add(cm) }
    box('white', 0.06, 0.02, 0.003, x, y + 0.055, AZ + 0.28)   // 價格夾
  } })
  // 檯面上：濾鏡盒、幾顆鏡頭蓋、一台展示機
  for (let i = 0; i < 5; i++) pack(0.12, 0.03 + (i % 2) * 0.02, 0.12, AX0 - 0.4 - i * 0.18, 0.78, AZ + 0.32, (i - 2) * 0.1)
  pack(0.12, 0.03, 0.12, AX0 - 0.48, 0.81, AZ + 0.32, 0.4)
  { const m = gearModel.b1.clone(); m.rotation.y = 0.4; m.position.set(AX1 + 0.7, 0.85, AZ + 0.27); g.add(m) }
  { const m = gearModel.l2.clone(); m.rotation.x = Math.PI / 2; m.position.set(AX1 + 1.15, 0.78, AZ + 0.3); g.add(m) }
  for (let x = AX0 - 0.3; x > AX1; x -= 0.75) addCollider(x, AZ + 0.25, 0.4, 3)

  /* ---------- 門口附近：直立數位看板，輪播鳥照（每 6 秒換一張） ---------- */
  const SIGN = { x: X0 - 1.1, z: -3.3 }
  box('white', 0.14, 1.95, 0.82, SIGN.x, 0.995, SIGN.z); box('steel', 0.5, 0.03, 0.9, SIGN.x, 0.015, SIGN.z)
  const scr = document.createElement('canvas'); scr.width = 448; scr.height = 768
  const scrT = new THREE.CanvasTexture(scr); scrT.colorSpace = THREE.SRGBColorSpace
  const scrM = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 1.2), new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffffff, emissiveMap: scrT, emissiveIntensity: 0.9, roughness: 0.15 }))
  scrM.rotation.y = -Math.PI / 2; scrM.position.set(SIGN.x - 0.072, 1.2, SIGN.z); g.add(scrM)
  const caps = [['翠鳥', 'Common Kingfisher'], ['五色鳥', 'Taiwan Barbet'], ['藍鵲', 'Taiwan Blue Magpie'], ['白頭翁', 'Light-vented Bulbul']]
  let slide = -1
  function drawSlide(k) {
    const x = scr.getContext('2d'), w = scr.width, h = scr.height, im = printT.image, iw = im.width / 2, ih = im.height / 2
    x.fillStyle = '#0f1311'; x.fillRect(0, 0, w, h)
    x.drawImage(im, (k % 2) * iw, (k < 2 ? 0 : 1) * ih, iw, ih, 0, 70, w, w)
    x.fillStyle = '#7fd19c'; x.font = '600 26px "Helvetica Neue", Arial, sans-serif'; x.textAlign = 'left'; x.fillText('BIRD PHOTO OF THE WEEK', 24, 46)
    x.fillStyle = '#fff'; x.font = 'bold 52px "PingFang TC", "Noto Sans TC", sans-serif'; x.fillText(caps[k][0], 24, w + 140)
    x.fillStyle = '#b9c7be'; x.font = '28px "Helvetica Neue", Arial, sans-serif'; x.fillText(caps[k][1], 24, w + 186)
    x.fillStyle = '#2f7d4f'; x.fillRect(24, h - 92, w - 48, 60); x.fillStyle = '#fff'; x.font = 'bold 28px "PingFang TC", sans-serif'; x.fillText('進溫室拍拍看 →', 44, h - 52)
    for (let i = 0; i < 4; i++) { x.fillStyle = i === k ? '#fff' : '#4a524d'; x.beginPath(); x.arc(w - 110 + i * 24, 40, 6, 0, 7); x.fill() }
    scrT.needsUpdate = true
  }
  addCollider(SIGN.x, SIGN.z, 0.45, 2.2)

  /* ---------- 店門口（西側）：購物籃一疊 ---------- */
  for (let i = 0; i < 5; i++) {
    const bx = X1 + 0.75, bz = -2.4, y = 0.04 + i * 0.07, bw = 0.46, bd = 0.32, bh = 0.24
    box('charcoal', bw, 0.015, bd, bx, y, bz)
    for (const s of [-1, 1]) { box('charcoal', bw, bh, 0.012, bx, y + bh / 2, bz + s * bd / 2); box('charcoal', 0.012, bh, bd, bx + s * bw / 2, y + bh / 2, bz) }
    box('glow', bw + 0.005, 0.02, 0.014, bx, y + bh - 0.03, bz - bd / 2)
  }
  bar('steel', V(X1 + 0.53, 0.04 + 4 * 0.07 + 0.24, -2.4), V(X1 + 0.75, 0.62, -2.4), 0.012); bar('steel', V(X1 + 0.97, 0.04 + 4 * 0.07 + 0.24, -2.4), V(X1 + 0.75, 0.62, -2.4), 0.012)
  addCollider(X1 + 0.75, -2.4, 0.3, 0.7)

  /* ---------- 天花板設備：空調出風口、灑水頭、偵煙器 ---------- */
  for (const z of [-6.2, 6.2]) { box('dark', X0 - X1 - 2.0, 0.015, 0.12, XM, H - 0.01, z); box('steel', X0 - X1 - 1.9, 0.01, 0.16, XM, H - 0.004, z) }
  for (let x = X0 - 1.6; x > X1 + 1; x -= 3.2) for (const z of [-5.2, 5.4]) {
    box('steel', 0.03, 0.06, 0.03, x, H - 0.03, z); box('steel', 0.07, 0.008, 0.07, x, H - 0.065, z)   // 灑水頭
  }
  for (const [x, z] of [[-78.0, -5.6], [-84.6, -5.6], [-81.3, 6.4], [-87.4, 6.2]]) box('white', 0.14, 0.04, 0.14, x, H - 0.02, z)   // 偵煙器

  /* ---------- 展示島（可以逛）：深灰鋼底座＋橡木台面＋玻璃罩＋發光壓克力墊＋斜立價格卡 ---------- */
  const items = []
  const spec = (it) => it.af != null ? `對焦 ${it.af}s・連拍 ${it.fps} 張/秒` : `${it.min === it.max ? it.min : it.min + '–' + it.max}mm・f/${it.ap}`
  const place = (it, kind, x, z) => {
    const tall = kind === 'lens' ? (it.id === 'l5' ? 0.46 : 0.32) : 0.3
    box('charcoal', 0.46, 0.86, 0.46, x, 0.43, z - 0.04)                          // 鋼底座
    box('steel', 0.5, 0.03, 0.5, x, 0.015, z - 0.04)
    box('oak', 0.7, 0.05, 0.84, x, 0.885, z + 0.02)                               // 橡木台面（前面多出來放價格卡）
    box('glow', 0.66, 0.008, 0.8, x, 0.856, z + 0.02)                             // 台面底下一圈光
    box('glow', 0.3, 0.025, 0.3, x, 0.922, z - 0.04)                              // 壓克力發光墊
    const cg = new THREE.Mesh(new THREE.BoxGeometry(0.54, tall + 0.1, 0.54), caseGlass)
    cg.position.set(x, 0.91 + (tall + 0.1) / 2, z - 0.04); cg.renderOrder = 6; g.add(cg)
    box('steel', 0.55, 0.012, 0.55, x, 0.916 + tall + 0.1, z - 0.04)             // 玻璃罩上緣鋁框
    const m = gearModel[it.id].clone()
    if (kind === 'lens') { m.rotation.x = Math.PI / 2; m.position.set(x, 0.935, z - 0.04) }
    else { m.rotation.y = 0.5; m.position.set(x, 1.01, z - 0.04) }
    g.add(m)
    pack(0.11, 0.09, 0.09, x + 0.18, 0.91, z - 0.16, 0.3)                          // 旁邊放個產品盒
    // 價格卡：斜立在台面前緣
    const draw = labelDraw({ ...it, spec: spec(it) }, state)
    const t = canvasTex(512, 192, draw)
    const card = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.15), new THREE.MeshStandardMaterial({ map: t, roughness: 0.6 }))
    card.position.set(x, 0.96, z + 0.36); card.rotation.x = -0.55; g.add(card)
    box('charcoal', 0.42, 0.012, 0.06, x, 0.916, z + 0.38)
    addCollider(x, z, 0.48, 1.5)
    const pitch = state.owned.includes(it.id) ? `${it.name}你已經有了，用得還順手嗎？` : `這${kind === 'lens' ? '支' : '台'}${it.name}，${spec(it)}，按 E 可以看詳細！`
    items.push({ ...it, kind, pitch, pos: V(x, 1.1, z), tex: t, draw: () => { labelDraw({ ...it, spec: spec(it) }, state)(t.image.getContext('2d'), 512, 192); t.needsUpdate = true } })
  }
  BODIES.forEach((b, i) => place(b, 'body', -79.6 - i * 3.0, -1.8))
  LENSES.forEach((l, i) => place(l, 'lens', -78.6 - i * 2.0, -4.6))

  /* ---------- 合併、燈 ---------- */
  for (const [k, list] of Object.entries(geos)) {
    if (!list.length) continue
    const mesh = new THREE.Mesh(mergeGeometries(list), mats[k])
    mesh.castShadow = k !== 'led' && k !== 'glow'; mesh.receiveShadow = true
    g.add(mesh)
  }
  // 店裡一盞燈（晚上外面很暗，店裡還是亮的）＋層架那邊一盞
  const l1 = new THREE.PointLight(0xfff2e0, 18, 16, 1.6); l1.position.set(XM, H - 0.4, 0); g.add(l1)
  const l2 = new THREE.PointLight(0xfff2e0, 6, 7, 1.6); l2.position.set(-82.6, 3.0, HZ - 1.4); g.add(l2)
  scene.add(g)

  /* ---------- 老闆（會走動的店員，shopkeeper.js） ---------- */
  const counterZone = (x, z) => x < cx0 + 0.6 && x > cx1 - 0.6 && z > cz - 2.4 && z < cz
  const keeper = createShopkeeper({
    gltf: await ownerP, parent: g, colliders, home: OWNER, homeYaw: Math.PI,
    bounds: { x0: X1 + 0.55, x1: X0 - 0.35, z0: -HZ + 1.1, z1: HZ - 0.95 },
    inStore: (x, z) => x < X0 && x > X1 && Math.abs(z) < HZ,
    inPassage: (x, z) => x >= X0 && x < -66 && Math.abs(z) < 4,
    counterZone,
  })
  addCollider(OWNER.x, OWNER.z, 0.3, 2.2); const keeperCol = colliders[colliders.length - 1]   // 玩家不能穿過老闆（建好找路格子之後才加，不然他會把自己當障礙）

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
  // cam：鏡頭；opt.play＝玩家在玩（不是首頁）；opt.look＝滑鼠鎖住、可以看東西
  function tick(t, dt, cam, opt = { play: true, look: false }) {
    const camPos = cam.position
    keeper.tick(t, dt, opt.play ? camPos : null, opt.look ? focus(cam)?.item ?? null : null, opt.look ? cam.getWorldDirection(_f) : null)
    keeperCol.x = keeper.pos.x; keeperCol.z = keeper.pos.y
    // 玩家跟老闆疊在一起時（不管怎麼發生的）先關掉他的碰撞，不然玩家四個方向都會被擋住、WASD 完全不能動
    keeperCol.top = Math.hypot(camPos.x - keeper.pos.x, camPos.z - keeper.pos.y) < 0.6 ? -1 : 2.2   // 正常碰撞會擋在 0.68，進到 0.6 以內代表已經疊在一起
    // 自動門：人在門口 3 公尺內就開，離開 1 秒後才關；開 0.7 秒、關 1.1 秒，速度頭尾放慢
    const near = Math.hypot(camPos.x - X0, camPos.z) < 3.0 && camPos.y < 4
    door.hold = near ? 1.0 : Math.max(0, door.hold - dt)
    const want2 = near || door.hold > 0 ? 1 : 0
    door.t = THREE.MathUtils.clamp(door.t + (want2 ? dt / 0.7 : -dt / 1.1), 0, 1)
    const e = door.t * door.t * (3 - 2 * door.t)
    for (const { lf, s } of leaves) lf.position.z = s * (LEAF_W / 2 + (OPEN + 0.05) * e)
    for (const c of doorCol) c.top = e > 0.7 ? -1 : 9
    sensM.emissive.setHex(want2 ? 0x3ad06a : 0xff3a2a)
    // 看板輪播
    const k = Math.floor(t / 6) % 4
    if (k !== slide && printT.image) { slide = k; drawSlide(k) }
  }
  const refresh = () => items.forEach((it) => it.draw())
  return { group: g, focus, tick, refresh, items, checkout: keeper.checkout, keeper }
}
