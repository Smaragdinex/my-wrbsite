// 相機行（店面）：溫室入口外面另外一棟，像美術館門口的商店——遊戲從店裡開始，穿過東邊的玻璃通道才進溫室。
// 外觀跟溫室同一套：白色鋼構、玻璃帷幕、天窗、綠牆（植物牆）、LED 燈條，乾淨的高科技感。
// 北牆：櫃台（中間是發光玻璃展示櫃）＋老闆（models/owner.glb，Tripo）＋身後胡桃木燈箱格櫃；兩個角落：三腳架展示台、相機包櫃，牆上掛鳥類攝影作品（models/store-prints.jpg，ChatGPT 四張拼一張）。
// 南半邊：地毯上一座座展示島（鋼底座＋橡木台面＋玻璃罩＋斜立價格卡）。天花板兩條軌道燈。
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
  const [owner, ...gear] = await Promise.all(['models/owner.glb', ...BODIES.map((b) => `models/camera/body-${b.id}.glb`), ...LENSES.map((l) => `models/camera/lens-${l.id}.glb`)].map(load))
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

  owner.position.set(OWNER.x, 0, OWNER.z); owner.rotation.y = Math.PI
  owner.traverse((o) => { if (o.isMesh) o.castShadow = o.receiveShadow = true })
  g.add(owner)

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
    items.push({ ...it, kind, pos: V(x, 1.1, z), tex: t, draw: () => { labelDraw({ ...it, spec: spec(it) }, state)(t.image.getContext('2d'), 512, 192); t.needsUpdate = true } })
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
