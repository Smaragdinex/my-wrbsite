// 山頂（2026-11-07 重做）：攝影玩家的小木屋（走得進去）、加大的觀景台（長椅、投幣望遠鏡）、三角點、石堆。
// 玉山圓柏、玉山杜鵑在 alpine.js（跟針葉樹同一套卡片）。位置都在 layout.js（CABIN、步道終點）。
import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { CABIN, ALP_TRAIL, alpineHeight, addCollider } from './layout.js'
import { mulberry32 } from './noise.js'

const V = (x, y, z) => new THREE.Vector3(x, y, z)
const TAU = Math.PI * 2
function canvasTex(w, h, draw, srgb = true) {
  const c = document.createElement('canvas'); c.width = w; c.height = h
  draw(c.getContext('2d'), w, h)
  const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8
  return t
}
// 木板牆：直條木板（深色護木漆），每片深淺不同、板縫黑
const plankTex = (base, n = 8) => canvasTex(256, 256, (x, w, h) => {
  const r = mulberry32(11)
  for (let i = 0; i < n; i++) {
    const c = new THREE.Color(base).offsetHSL((r() - 0.5) * 0.02, 0, (r() - 0.5) * 0.08)
    x.fillStyle = '#' + c.getHexString(); x.fillRect(i * w / n, 0, w / n, h)
    for (let k = 0; k < 14; k++) { x.strokeStyle = `rgba(30,18,10,${0.12 + r() * 0.2})`; x.lineWidth = 0.6 + r(); const px = i * w / n + r() * w / n; x.beginPath(); x.moveTo(px, 0); x.bezierCurveTo(px + (r() - 0.5) * 6, h * 0.3, px + (r() - 0.5) * 6, h * 0.7, px + (r() - 0.5) * 4, h); x.stroke() }
    x.fillStyle = 'rgba(15,9,5,0.85)'; x.fillRect(i * w / n, 0, 2, h)
  }
})

export function buildSummit({ g, avoid = [], printsUrl }) {
  const rnd = mulberry32(2026)
  const C = CABIN, Y = C.y
  const fwd = V(Math.sin(C.yaw), 0, Math.cos(C.yaw)), right = V(fwd.z, 0, -fwd.x)
  const at = (u, y, v) => V(C.x, Y, C.z).addScaledVector(right, u).addScaledVector(fwd, v).add(V(0, y, 0))   // 屋子的座標：u 左右、v 前後（+v 是門那面）
  const rot = new THREE.Euler(0, C.yaw, 0)
  const lists = {}
  const put = (mat, geo) => (lists[mat] ??= []).push(geo.index ? geo.toNonIndexed() : geo)
  const boxAt = (mat, w, h, d, u, y, v, ry = 0, rx = 0) => put(mat, new THREE.BoxGeometry(w, h, d).applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, C.yaw + ry, 0, 'YXZ')).setPosition(at(u, y, v))))
  const cylAt = (mat, r0, r1, h, u, y, v, seg = 10) => put(mat, new THREE.CylinderGeometry(r0, r1, h, seg).translate(0, 0, 0).applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(rot).setPosition(at(u, y, v))))
  const tubeW = (mat, a, b, r) => put(mat, new THREE.TubeGeometry(new THREE.LineCurve3(a, b), 1, r, 6))

  const mats = {
    wall: new THREE.MeshStandardMaterial({ map: plankTex('#6b4a32'), roughness: 0.9 }),
    wallIn: new THREE.MeshStandardMaterial({ map: plankTex('#b8875a', 10), roughness: 0.85 }),
    trim: new THREE.MeshStandardMaterial({ color: 0x3b2a1e, roughness: 0.85 }),
    floor: new THREE.MeshStandardMaterial({ map: plankTex('#8a6442', 12), roughness: 0.8 }),
    roof: new THREE.MeshStandardMaterial({ map: canvasTex(256, 256, (x, w, h) => {   // 深灰石板瓦，一排一排錯開
      x.fillStyle = '#3c4044'; x.fillRect(0, 0, w, h)
      const r = mulberry32(5)
      for (let row = 0; row < 8; row++) for (let i = 0; i < 9; i++) {
        const l = 40 + r() * 22; x.fillStyle = `rgb(${l},${l + 3},${l + 7})`; x.fillRect(i * 32 + (row % 2) * 16 - 16, row * 32, 30, 30)
        x.fillStyle = 'rgba(0,0,0,0.5)'; x.fillRect(i * 32 + (row % 2) * 16 - 16, row * 32 + 28, 30, 3)
      }
    }), roughness: 0.75 }),
    stone: new THREE.MeshStandardMaterial({ color: 0x8a8780, roughness: 0.95 }),
    iron: new THREE.MeshStandardMaterial({ color: 0x1d1e20, roughness: 0.5, metalness: 0.6 }),
    glass: new THREE.MeshStandardMaterial({ color: 0xbcd4dc, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.25, depthWrite: false }),
    cloth: new THREE.MeshStandardMaterial({ color: 0x8c3b2e, roughness: 0.95 }),
    blanket: new THREE.MeshStandardMaterial({ color: 0x2f5d50, roughness: 1 }),
    black: new THREE.MeshStandardMaterial({ color: 0x141516, roughness: 0.45, metalness: 0.3 }),
    lamp: Object.assign(new THREE.MeshStandardMaterial({ color: 0xffe2b0, emissive: 0xffb860, emissiveIntensity: 1.2 }), { userData: { lamp: [0.8, 3] } }),
    paper: new THREE.MeshStandardMaterial({ map: canvasTex(256, 192, (x, w, h) => {   // 等高線地圖
      x.fillStyle = '#efe6cf'; x.fillRect(0, 0, w, h)
      const r = mulberry32(3)
      for (let k = 0; k < 14; k++) { x.strokeStyle = k % 5 === 0 ? 'rgba(120,80,40,0.8)' : 'rgba(150,110,60,0.5)'; x.lineWidth = k % 5 === 0 ? 1.6 : 0.8; x.beginPath(); for (let a = 0; a <= 64; a++) { const t = a / 64 * TAU, rr = 12 + k * 6 + 6 * Math.sin(t * 3 + k) + 4 * Math.sin(t * 5 - k * 0.7); x.lineTo(w * 0.55 + Math.cos(t) * rr * 1.3, h * 0.5 + Math.sin(t) * rr * 0.8) } x.closePath(); x.stroke() }
      x.strokeStyle = '#c0392b'; x.setLineDash([5, 4]); x.lineWidth = 2; x.beginPath(); x.moveTo(10, h - 20); x.bezierCurveTo(60, h - 60, 90, 40, w * 0.55, h * 0.5); x.stroke()
      for (let i = 0; i < 6; i++) { x.fillStyle = '#c0392b'; x.beginPath(); x.arc(30 + r() * 180, 20 + r() * 150, 3, 0, 7); x.fill() }
    }), roughness: 0.9 }),
  }

  /* ---------- 小木屋 ---------- */
  const W = C.W, D = C.D, WH = 2.7, PEAK = 4.1, T = 0.14, DOOR = 1.15, DOORH = 2.15
  // 石砌基礎（地面到地板）＋地板
  for (const [u, v, w, d] of [[0, D / 2, W + 0.2, 0.3], [0, -D / 2, W + 0.2, 0.3], [W / 2, 0, 0.3, D], [-W / 2, 0, 0.3, D]]) boxAt('stone', w, 0.5, d, u, -0.2, v)
  boxAt('floor', W - 0.05, 0.08, D - 0.05, 0, 0.0, 0)
  // 牆：前牆中間留門、兩側開窗；後牆一扇大窗（看出去是山谷）；兩側牆各一扇窗
  const wall = (u0, u1, v, y0, y1) => { const w = Math.abs(u1 - u0); if (w < 0.01 || y1 <= y0) return; boxAt('wall', w, y1 - y0, T, (u0 + u1) / 2, (y0 + y1) / 2, v); boxAt('wallIn', w, y1 - y0, 0.01, (u0 + u1) / 2, (y0 + y1) / 2, v - Math.sign(v) * (T / 2 + 0.006)) }
  const wallS = (v0, v1, u, y0, y1) => { const d = Math.abs(v1 - v0); if (d < 0.01 || y1 <= y0) return; boxAt('wall', T, y1 - y0, d, u, (y0 + y1) / 2, (v0 + v1) / 2); boxAt('wallIn', 0.01, y1 - y0, d, u - Math.sign(u) * (T / 2 + 0.006), (y0 + y1) / 2, (v0 + v1) / 2) }
  const win = (axis, a0, a1, fixed, y0, y1) => {   // 窗框＋玻璃
    const c = (a0 + a1) / 2, w = a1 - a0, h = y1 - y0, ym = (y0 + y1) / 2
    if (axis === 'u') { boxAt('glass', w, h, 0.02, c, ym, fixed); for (const yy of [y0, y1]) boxAt('trim', w + 0.12, 0.08, T + 0.06, c, yy, fixed); for (const uu of [a0, a1, c]) boxAt('trim', 0.07, h, T + 0.04, uu, ym, fixed) }
    else { boxAt('glass', 0.02, h, w, fixed, ym, c); for (const yy of [y0, y1]) boxAt('trim', T + 0.06, 0.08, w + 0.12, fixed, yy, c); for (const vv of [a0, a1, c]) boxAt('trim', T + 0.04, h, 0.07, fixed, ym, vv) }
  }
  // 前牆（v = +D/2）：門在中間，門右邊一扇小窗
  wall(-W / 2, -DOOR / 2, D / 2, 0, WH); wall(DOOR / 2, 1.3, D / 2, 0, WH); wall(2.4, W / 2, D / 2, 0, WH)
  wall(1.3, 2.4, D / 2, 0, 1.0); wall(1.3, 2.4, D / 2, 2.1, WH); win('u', 1.3, 2.4, D / 2, 1.0, 2.1)
  wall(-DOOR / 2, DOOR / 2, D / 2, DOORH, WH)
  for (const uu of [-DOOR / 2, DOOR / 2]) boxAt('trim', 0.1, DOORH, T + 0.06, uu, DOORH / 2, D / 2); boxAt('trim', DOOR + 0.2, 0.1, T + 0.06, 0, DOORH, D / 2)
  // 門板：往裡開著
  boxAt('trim', 0.05, DOORH - 0.05, DOOR - 0.06, -DOOR / 2 + 0.04, DOORH / 2, D / 2 - (DOOR - 0.06) / 2 - 0.08)   // 開 90 度，貼著門框左邊往屋裡
  // 後牆（v = -D/2）：一整排大窗（攝影窗）
  wall(-W / 2, -2.2, -D / 2, 0, WH); wall(2.2, W / 2, -D / 2, 0, WH); wall(-2.2, 2.2, -D / 2, 0, 0.9); wall(-2.2, 2.2, -D / 2, 2.2, WH)
  win('u', -2.2, 2.2, -D / 2, 0.9, 2.2)
  // 兩側牆：各一扇窗
  for (const su of [-1, 1]) { const u = su * W / 2; wallS(-D / 2, -0.6, u, 0, WH); wallS(0.6, D / 2, u, 0, WH); wallS(-0.6, 0.6, u, 0, 1.0); wallS(-0.6, 0.6, u, 2.0, WH); win('v', -0.6, 0.6, u, 1.0, 2.0) }
  // 山牆（三角形）：兩側 u = ±W/2 往上到屋脊（屋脊沿 v 方向）——改成屋脊沿 u：前後牆是山牆
  for (const sv of [-1, 1]) {
    const v = sv * D / 2, tri = new THREE.BufferGeometry()
    const p0 = at(-W / 2, WH, v), p1 = at(W / 2, WH, v), p2 = at(0, PEAK, v)
    tri.setAttribute('position', new THREE.Float32BufferAttribute([p0.x, p0.y, p0.z, p1.x, p1.y, p1.z, p2.x, p2.y, p2.z, p0.x, p0.y, p0.z, p2.x, p2.y, p2.z, p1.x, p1.y, p1.z], 3))
    tri.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0.5, 0.5, 0, 0, 0.5, 0.5, 1, 0], 2)); tri.computeVertexNormals()
    put('wall', tri)
  }
  // 屋頂：兩片斜板（屋脊沿 u），出簷 0.5；屋脊樑、四角柱
  {
    const run = W / 2 + 0.5, rise = PEAK - WH, ang = Math.atan2(rise, W / 2), L = Math.hypot(run, rise * run / (W / 2)) + 0.05
    for (const su of [-1, 1]) {
      const mid = at(su * run / 2, PEAK - rise * (run / 2) / (W / 2) + 0.12, 0)
      // 屋脊沿前後（v），兩片往左右（u）斜下去：先轉屋子的方向，再繞屋子的前後軸傾斜
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, C.yaw, 0)).multiply(new THREE.Quaternion().setFromAxisAngle(V(0, 0, 1), -su * ang))
      put('roof', new THREE.BoxGeometry(L, 0.1, D + 1.0).applyMatrix4(new THREE.Matrix4().compose(mid, q, V(1, 1, 1))))
    }
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, C.yaw, 0))
    put('trim', new THREE.BoxGeometry(0.16, 0.16, D + 1.0).applyMatrix4(new THREE.Matrix4().compose(at(0, PEAK + 0.05, 0), q, V(1, 1, 1))))
    for (const su of [-1, 1]) for (const sv of [-1, 1]) boxAt('trim', 0.18, WH, 0.18, su * W / 2, WH / 2, sv * D / 2)
  }
  // 煙囪（後面左邊）：石砌＋鐵管
  boxAt('stone', 0.6, 1.5, 0.6, -1.6, PEAK + 0.1, -1.2); cylAt('iron', 0.09, 0.09, 0.5, -1.6, PEAK + 1.05, -1.2)   // 底部藏在屋頂下面一點點，不要穿進屋裡
  // 門廊：前面一小塊木平台＋一張長椅＋門口的提燈
  boxAt('floor', W, 0.08, 1.4, 0, 0.0, D / 2 + 0.75)
  for (const su of [-1, 1]) boxAt('trim', 0.12, 2.6, 0.12, su * (W / 2 - 0.1), 1.3, D / 2 + 1.38)
  {
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, C.yaw, 0)).multiply(new THREE.Quaternion().setFromAxisAngle(V(1, 0, 0), 0.32))
    put('roof', new THREE.BoxGeometry(W + 0.4, 0.08, 1.7).applyMatrix4(new THREE.Matrix4().compose(at(0, WH + 0.05, D / 2 + 0.8), q, V(1, 1, 1))))   // 門廊的小屋簷
  }
  boxAt('trim', 1.6, 0.06, 0.4, -1.9, 0.45, D / 2 + 1.0); for (const uu of [-2.6, -1.2]) boxAt('trim', 0.06, 0.45, 0.36, uu, 0.22, D / 2 + 1.0)
  boxAt('lamp', 0.14, 0.2, 0.14, 0.85, 2.2, D / 2 + 0.12)

  /* ---------- 屋裡：攝影玩家的據點 ---------- */
  // 後面大窗前：三腳架＋長鏡頭相機對著窗外
  {
    const base = at(0.3, 0, -D / 2 + 0.9), top = base.clone().add(V(0, 1.3, 0))
    for (let k = 0; k < 3; k++) { const a = k / 3 * TAU + C.yaw; tubeW('black', top, base.clone().add(V(Math.sin(a) * 0.45, 0.02, Math.cos(a) * 0.45)), 0.018) }
    boxAt('black', 0.16, 0.12, 0.1, 0.3, 1.42, -D / 2 + 0.9)
    const lens = new THREE.CylinderGeometry(0.07, 0.065, 0.55, 14).rotateX(Math.PI / 2)
    put('black', lens.applyMatrix4(new THREE.Matrix4().compose(at(0.3, 1.44, -D / 2 + 0.6), new THREE.Quaternion().setFromEuler(new THREE.Euler(0.08, C.yaw, 0, 'YXZ')), V(1, 1, 1))))
  }
  // 窗邊的工作桌：筆電（螢幕是鳥照）、一疊記憶卡盒、咖啡杯
  boxAt('trim', 1.6, 0.05, 0.7, -1.9, 0.76, -D / 2 + 0.45)
  for (const [uu, vv] of [[-2.6, -D / 2 + 0.2], [-1.2, -D / 2 + 0.2], [-2.6, -D / 2 + 0.75], [-1.2, -D / 2 + 0.75]]) boxAt('trim', 0.05, 0.74, 0.05, uu, 0.37, vv)
  boxAt('black', 0.36, 0.02, 0.25, -1.9, 0.795, -D / 2 + 0.5); boxAt('black', 0.36, 0.24, 0.015, -1.9, 0.92, -D / 2 + 0.38, 0, -0.25)
  cylAt('stone', 0.045, 0.04, 0.1, -1.4, 0.84, -D / 2 + 0.6)
  boxAt('trim', 0.5, 0.05, 0.5, -1.9, 0.45, -D / 2 + 1.2); for (const [du, dv] of [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]]) boxAt('trim', 0.04, 0.45, 0.04, -1.9 + du, 0.22, -D / 2 + 1.2 + dv)   // 小凳子
  // 雙層床（右邊牆）
  for (const y of [0.4, 1.55]) { boxAt('trim', 0.95, 0.12, 2.0, W / 2 - 0.55, y, -0.6); boxAt('blanket', 0.9, 0.12, 1.6, W / 2 - 0.55, y + 0.12, -0.4); boxAt('wallIn', 0.6, 0.1, 0.35, W / 2 - 0.55, y + 0.17, -1.35) }
  for (const [du, dv] of [[-0.5, -1.6], [0.45, -1.6], [-0.5, 0.4], [0.45, 0.4]]) boxAt('trim', 0.07, 2.0, 0.07, W / 2 - 0.55 + du, 1.0, dv)
  // 柴爐（左後角）＋煙管接到煙囪
  boxAt('iron', 0.55, 0.6, 0.5, -W / 2 + 0.5, 0.35, -0.3); cylAt('iron', 0.08, 0.08, WH + 1.4 - 0.65, -W / 2 + 0.5, 0.65 + (WH + 1.4 - 0.65) / 2, -0.3)
  boxAt('stone', 0.9, 0.04, 0.9, -W / 2 + 0.5, 0.03, -0.3)
  // 左牆：鏡頭架（三層，擺幾支鏡頭和相機）
  for (const y of [1.0, 1.4, 1.8]) boxAt('trim', 0.3, 0.04, 1.4, -W / 2 + 0.2, y, 1.1)
  for (let i = 0; i < 7; i++) { const y = [1.0, 1.4, 1.8][i % 3] + 0.1, vv = 0.6 + (i * 0.37) % 1.2, len = 0.12 + (i % 3) * 0.08; put('black', new THREE.CylinderGeometry(0.045, 0.045, len, 12).applyMatrix4(new THREE.Matrix4().compose(at(-W / 2 + 0.2, y + len / 2 - 0.08, vv), new THREE.Quaternion(), V(1, 1, 1)))) }
  // 牆上：地圖、鳥照（相機行那四張）、掛燈
  {
    const pm = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.68), mats.paper)
    pm.position.copy(at(-W / 2 + T / 2 + 0.02, 1.7, -0.9)); pm.rotation.y = C.yaw + Math.PI / 2; g.add(pm)
    if (printsUrl) new THREE.TextureLoader().load(printsUrl, (tx) => {
      tx.colorSpace = THREE.SRGBColorSpace
      for (let k = 0; k < 4; k++) {
        const t = tx.clone(); t.repeat.set(0.5, 0.5); t.offset.set((k % 2) * 0.5, k < 2 ? 0.5 : 0); t.needsUpdate = true
        const m = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.42), new THREE.MeshStandardMaterial({ map: t, roughness: 0.6 }))
        m.position.copy(at(-1.6 + k * 0.65 + 1.1, 1.75, D / 2 - T / 2 - 0.02)); m.rotation.y = C.yaw + Math.PI; g.add(m)
        const f = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.48, 0.02), mats.trim); f.position.copy(m.position).addScaledVector(fwd, 0.012); f.rotation.y = C.yaw; g.add(f)
      }
    })
  }
  boxAt('lamp', 0.16, 0.22, 0.16, 0, WH - 0.35, 0); tubeW('iron', at(0, WH - 0.24, 0), at(0, WH, 0), 0.01)
  // 地毯
  boxAt('cloth', 1.8, 0.01, 1.2, 0, 0.045, 0.6)

  // 碰撞：牆一圈小圓（門口留空）；床、爐子、桌子
  const wallCol = (ax, az, bx, bz, skip) => { const n = Math.ceil(Math.hypot(bx - ax, bz - az) / 0.3); for (let i = 0; i <= n; i++) { const t = i / n, u = ax + (bx - ax) * t, v = az + (bz - az) * t; if (skip && skip(u, v)) continue; const p = at(u, 0, v); addCollider(p.x, p.z, 0.12, Y + WH + 2) } }
  wallCol(-W / 2, D / 2, W / 2, D / 2, (u) => Math.abs(u) < DOOR / 2 + 0.12)
  wallCol(-W / 2, -D / 2, W / 2, -D / 2); wallCol(-W / 2, -D / 2, -W / 2, D / 2); wallCol(W / 2, -D / 2, W / 2, D / 2)
  for (const [u, v, r] of [[W / 2 - 0.55, -1.0, 0.5], [W / 2 - 0.55, 0.0, 0.5], [-W / 2 + 0.5, -0.3, 0.4], [-1.9, -D / 2 + 0.45, 0.45], [-1.5, -D / 2 + 0.45, 0.4], [0.3, -D / 2 + 0.9, 0.35]]) { const p = at(u, 0, v); addCollider(p.x, p.z, r, Y + 2) }

  /* ---------- 觀景台：步道終點（加大，有長椅、投幣望遠鏡） ---------- */
  const E = ALP_TRAIL[ALP_TRAIL.length - 1], EY = ALP_TRAIL.prof[ALP_TRAIL.prof.length - 1]
  {
    const P = ALP_TRAIL[ALP_TRAIL.length - 2], dx = E[0] - P[0], dz = E[1] - P[1], L = Math.hypot(dx, dz), f = V(dx / L, 0, dz / L), r = V(f.z, 0, -f.x)
    const yawE = Math.atan2(f.x, f.z), q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yawE, 0))
    const o = (a, y, b) => V(E[0], EY, E[1]).addScaledVector(r, a).addScaledVector(f, b).add(V(0, y, 0))
    const bx = (mat, w, h, d, a, y, b) => put(mat, new THREE.BoxGeometry(w, h, d).applyMatrix4(new THREE.Matrix4().compose(o(a, y, b), q, V(1, 1, 1))))
    bx('floor', 7, 0.12, 4.2, 0, 0.06, 0.6)
    for (const a of [-3.45, 3.45]) for (const b of [-1.4, 1.2, 2.6]) bx('trim', 0.12, 1.15, 0.12, a, 0.6, b)
    for (const a of [-3.45, 3.45]) { bx('trim', 0.08, 0.08, 4.0, a, 1.12, 0.6); bx('trim', 0.06, 0.06, 4.0, a, 0.6, 0.6) }
    bx('trim', 7, 0.08, 0.08, 0, 1.12, 2.6); bx('trim', 7, 0.06, 0.06, 0, 0.6, 2.6)
    for (const a of [-3.45, -1, 1, 3.45]) bx('trim', 0.12, 1.15, 0.12, a, 0.6, 2.6)
    // 長椅（面向前方）
    bx('trim', 1.8, 0.06, 0.42, -1.6, 0.46, 1.7); bx('trim', 1.8, 0.4, 0.06, -1.6, 0.68, 1.48); for (const a of [-2.4, -0.8]) bx('trim', 0.07, 0.44, 0.38, a, 0.22, 1.7)
    // 投幣望遠鏡：鐵柱＋雙筒
    bx('iron', 0.12, 1.1, 0.12, 1.8, 0.62, 2.0); bx('iron', 0.34, 0.2, 0.42, 1.8, 1.25, 2.05); for (const a of [1.7, 1.9]) put('iron', new THREE.CylinderGeometry(0.05, 0.06, 0.3, 10).rotateX(Math.PI / 2).applyMatrix4(new THREE.Matrix4().compose(o(a, 1.27, 2.3), q, V(1, 1, 1))))
    for (const [a, b] of [[-3.45, 0], [3.45, 0], [0, 2.6]]) { const n = 12; for (let i = 0; i <= n; i++) { const t = i / n, pa = a === 0 ? -3.45 + 6.9 * t : a, pb = a === 0 ? b : -1.4 + 4.0 * t, p = o(pa, 0, pb); addCollider(p.x, p.z, 0.08, EY + 1.2) } }   // 欄杆
    { const p = o(1.8, 0, 2.0); addCollider(p.x, p.z, 0.15, EY + 1.4) }
    // 三角點：花崗岩方柱（刻十字）＋旁邊一堆石頭
    const tp = o(-2.2, 0, -2.6), ty = alpineHeight(tp.x, tp.z)
    put('stone', new THREE.BoxGeometry(0.22, 0.6, 0.22).translate(tp.x, ty + 0.3, tp.z)); addCollider(tp.x, tp.z, 0.15, ty + 0.6)
    for (let i = 0; i < 18; i++) { const a = rnd() * TAU, d = rnd() * 0.6, sz = 0.12 + rnd() * 0.2, cx = tp.x + 1.4 + Math.cos(a) * d, cz = tp.z + 0.2 + Math.sin(a) * d, cy = alpineHeight(cx, cz) + sz * 0.6 + (0.6 - d) * 0.6 * (i / 18); put('stone', new THREE.DodecahedronGeometry(sz, 0).scale(1, 0.7, 1).translate(cx, cy, cz)) }
    addCollider(tp.x + 1.4, tp.z + 0.2, 0.5, ty + 0.9)
  }

  for (const [k, list] of Object.entries(lists)) {
    const m = new THREE.Mesh(mergeGeometries(list), mats[k])
    m.castShadow = k !== 'glass'; m.receiveShadow = true; if (k === 'glass') m.renderOrder = 4
    g.add(m)
  }

  return { cabin: C }
}
