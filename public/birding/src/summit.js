// 山頂（2026-11-07 重做）：攝影玩家的小木屋（走得進去；2026-11-08 放大）、三角點、石堆。2026-11-08 拿掉觀景台：山頂就是自然的箭竹草原。
// 玉山圓柏、玉山杜鵑在 alpine.js（跟針葉樹同一套卡片）。位置都在 layout.js（CABIN、步道終點）。
import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js'
import { CABIN, ALP_TRAIL, alpineHeight, addCollider } from './layout.js'
import { mulberry32, fbm2 } from './noise.js'
import { softDotTex, plankTextures } from './textures.js'
const VER = new URL(import.meta.url).searchParams.get('v') ?? ''

const V = (x, y, z) => new THREE.Vector3(x, y, z)
const TAU = Math.PI * 2
function canvasTex(w, h, draw, srgb = true) {
  const c = document.createElement('canvas'); c.width = w; c.height = h
  draw(c.getContext('2d'), w, h)
  const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8
  return t
}
// 木紋（2026-11-07 改寫實）：每個像素算——年輪條紋順著木頭方向（貼圖的 y），被低頻雜訊和節疤推彎；節疤是深色的橢圓、
// 旁邊的紋路繞過去；每片板子顏色差一點、板縫是黑的；weather 讓表面偏灰（風吹日曬）。同時出一張凹凸圖（紋路凹、板縫最深）。
// 回傳 { map, bump }，都是 RepeatWrapping，貼圖一格 = S 公尺（boxAt、圓木照實際尺寸算 UV，不會拉長）
function woodTex({ seed = 1, light = [196, 150, 104], dark = [120, 82, 50], planks = 1, gap = 0, knots = 5, ring = 0.07, weather = 0 }) {
  const N = 512, r = mulberry32(seed)
  const col = new Uint8ClampedArray(N * N * 4), bmp = new Uint8ClampedArray(N * N * 4)
  const pw = N / planks, tint = Array.from({ length: planks }, () => (r() - 0.5) * 0.25)
  const K = Array.from({ length: knots }, () => ({ x: r() * N, y: r() * N, s: 4 + r() * 7 }))
  const g = [light, dark].map((c) => c.map((v) => v * (1 - weather) + 128 * weather))
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const pi = Math.floor(x / pw), lu = x - pi * pw
    let d = fbm2(x * 0.006 + pi * 7.3 + seed, y * 0.0018, 3) * 46 + Math.sin(y * 0.01 + pi * 2) * 5
    let kd = 0
    for (const k of K) {
      // 節疤：貼圖上下接得起來（y 方向重複）
      let dx = x - k.x, dy = y - k.y; if (dy > N / 2) dy -= N; if (dy < -N / 2) dy += N
      const e = dx * dx + (dy * 0.32) ** 2, rr = k.s * k.s
      d += 16 * k.s * dx / (Math.sqrt(e) + 2) * Math.exp(-e / (rr * 14))   // 紋路繞過節疤
      kd = Math.max(kd, Math.exp(-(dx * dx + dy * dy) / (rr * 1.4)))
    }
    const t = (lu + d) * ring, band = 0.5 + 0.5 * Math.sin(t * Math.PI * 2), late = band ** 4   // 晚材：細細深色的那一圈
    const fine = fbm2(x * 0.9, y * 0.012, 2)   // 細的導管紋
    let m = 0.15 + late * 0.55 + fine * 0.22 + tint[pi] + kd * 0.6
    m += (fbm2(x * 0.02 + 40, y * 0.02, 3)) * 0.15   // 大片的深淺
    m = Math.min(1, Math.max(0, m))
    const i = (y * N + x) * 4
    for (let c = 0; c < 3; c++) col[i + c] = g[0][c] + (g[1][c] - g[0][c]) * m
    let b = 150 - late * 70 - fine * 30 - kd * 40
    if (gap && (lu < gap || lu > pw - gap * 0.5)) { for (let c = 0; c < 3; c++) col[i + c] *= 0.25; b = 10 }
    col[i + 3] = 255; bmp[i] = bmp[i + 1] = bmp[i + 2] = b; bmp[i + 3] = 255
  }
  const mk = (data, srgb) => { const c = document.createElement('canvas'); c.width = c.height = N; c.getContext('2d').putImageData(new ImageData(data, N, N), 0, 0); const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; return t }
  return { map: mk(col, true), bump: mk(bmp, false) }
}
const S = 1.4   // 木紋貼圖一格幾公尺
const rep2 = (t, a, b) => { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(a, b); return t }
// BoxGeometry 的 UV 照每一面的實際大小縮放（不然每個盒子都把整張木紋拉進去）
function boxUV(geo, w, h, d) {
  const uv = geo.attributes.uv, dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]]
  for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) { const i = f * 4 + k; uv.setXY(i, uv.getX(i) * dims[f][0] / S, uv.getY(i) * dims[f][1] / S) }
  return geo
}

// 2026-11-09 可以休息的地方（小木屋的床）：世界座標，game/main.js 跟長椅一樣按 E 跳時段
export const summitRests = []
export function buildSummit({ g, avoid = [], printsUrl }) {
  const rnd = mulberry32(2026)
  const C = CABIN, Y = C.y
  const fwd = V(Math.sin(C.yaw), 0, Math.cos(C.yaw)), right = V(fwd.z, 0, -fwd.x)
  const at = (u, y, v) => V(C.x, Y, C.z).addScaledVector(right, u).addScaledVector(fwd, v).add(V(0, y, 0))   // 屋子的座標：u 左右、v 前後（+v 是門那面）
  const rot = new THREE.Euler(0, C.yaw, 0)
  const lists = {}
  const SCAN = new Set(['log', 'wall', 'trim', 'floor']), TILE = 2.05, SEAMS = [75, 233, 393, 552, 708, 866, 1022, 1179, 1337, 1495, 1653, 1810, 1966]
  const STRIPS = SEAMS.slice(0, -1).map((q, i) => [(q + 16) / 2048, (SEAMS[i + 1] - 16) / 2048])
  let cylN = 0
  const put = (mat, geo) => (lists[mat] ??= []).push(geo.index ? geo.toNonIndexed() : geo)
  const boxAt = (mat, w, h, d, u, y, v, ry = 0, rx = 0) => put(mat, boxUV(new THREE.BoxGeometry(w, h, d), w, h, d).applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, C.yaw + ry, 0, 'YXZ')).setPosition(at(u, y, v))))
  const cylAt = (mat, r0, r1, h, u, y, v, seg = 10) => put(mat, new THREE.CylinderGeometry(r0, r1, h, seg).translate(0, 0, 0).applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(rot).setPosition(at(u, y, v))))
  const cylW = (mat, a, b, r0, r1 = r0, seg = 12) => {
    const d = new THREE.Vector3().subVectors(b, a), len = d.length()
    const geo = new THREE.CylinderGeometry(r1, r0, len, seg).translate(0, len / 2, 0)
    const uv = geo.attributes.uv
    if (SCAN.has(mat)) {
      // 掃描木紋（沿貼圖 u）：木頭的長度方向 → u；繞一圈 → 在同一條板子裡來回（鏡射，接縫看不出來、也不會露出板縫）
      const [v0, v1] = STRIPS[cylN++ % STRIPS.length], n = Math.max(1, Math.round(TAU * r0 / 0.36)), uo = (cylN * 0.37) % 1
      for (let i = 0; i < uv.count; i++) { const q = uv.getX(i) * n % 1, tri = 1 - Math.abs(2 * q - 1); uv.setXY(i, uo + uv.getY(i) * len / TILE, v0 + tri * (v1 - v0)) }
      mat += 'C'
    } else for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (TAU * r0) / S * 2, uv.getY(i) * len / S)
    geo.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), d.normalize())).translate(a.x, a.y, a.z)
    put(mat, geo)
  }
  const logUV = (mat, u0, y0, v0, u1, y1, v1, r0, r1 = r0) => cylW(mat, at(u0, y0, v0), at(u1, y1, v1), r0, r1)
  const rbox = (mat, w, h, d, u, y, v, rad, ry = 0, rx = 0) => put(mat, new RoundedBoxGeometry(w, h, d, 3, rad).applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, C.yaw + ry, 0, 'YXZ')).setPosition(at(u, y, v))))
  const tubeW = (mat, a, b, r) => put(mat, new THREE.TubeGeometry(new THREE.LineCurve3(a, b), 1, r, 6))

  // 2026-11-12 木頭全部換成掃描的真木板（Poly Haven，跟木棧道、賞鳥屋同一份）；以前是 canvas 畫的木紋。
  // 方盒子的 UV 木紋沿 v → 貼圖轉 90°；圓木另外一份不轉的（cylW 自己排 UV，材質名字後面加 C）
  const PT = plankTextures(VER)
  const turned = (t) => { const c = t.clone(); c.rotation = Math.PI / 2; c.repeat.set(S / TILE, S / TILE); c.needsUpdate = true; return c }
  const PR = { col: turned(PT.col), nor: turned(PT.nor), orm: turned(PT.orm) }
  const woodMat = (rgb, rough, T = PR) => { const m = new THREE.MeshStandardMaterial({ map: T.col, normalMap: T.nor, normalScale: new THREE.Vector2(1, -1), roughnessMap: T.orm, roughness: rough, metalness: 0 }); m.color.setRGB(...rgb); return m }
  const TONE = { log: [[2.25, 1.72, 1.16], 0.95], wall: [[1.7, 1.36, 1.02], 1], trim: [[1.15, 0.86, 0.62], 0.9], floor: [[2.1, 1.7, 1.25], 0.85] }   // 圓木（護木油的蜂蜜色）、山牆直板（舊一點）、門窗框（深）、地板（磨亮）
  const mats = {
    ...Object.fromEntries(Object.entries(TONE).flatMap(([k, [rgb, r]]) => [[k, woodMat(rgb, r)], [k + 'C', woodMat(rgb, r, PT)]])),
    chink: new THREE.MeshStandardMaterial({ color: 0xc9c0ad, roughness: 1 }),
    endgrain: new THREE.MeshStandardMaterial({ roughness: 0.95, map: canvasTex(256, 256, (x, w, h) => {   // 鋸開的木頭端面：同心年輪、放射狀乾裂、外圈一點樹皮色
      const r = mulberry32(17), cx = w / 2 + 6, cy = h / 2 - 4
      x.fillStyle = '#7a5a3c'; x.fillRect(0, 0, w, h)
      for (let k = 60; k > 0; k--) {
        const rr = k / 60 * w * 0.49, l = 150 + (k % 3 === 0 ? -38 : 0) + r() * 14 - k * 0.6
        x.fillStyle = `rgb(${l + 30},${l - 5},${l - 45})`; x.beginPath()
        for (let a = 0; a <= 48; a++) { const t = a / 48 * TAU, j = 1 + 0.03 * Math.sin(t * 3 + k) + 0.015 * Math.sin(t * 7); x.lineTo(cx + Math.cos(t) * rr * j, cy + Math.sin(t) * rr * j) }
        x.fill()
      }
      x.strokeStyle = 'rgba(40,24,12,0.7)'; x.lineWidth = 1.5
      for (let i = 0; i < 5; i++) { const t = r() * TAU, l0 = 6 + r() * 20, l1 = 60 + r() * 50; x.beginPath(); x.moveTo(cx + Math.cos(t) * l0, cy + Math.sin(t) * l0); x.lineTo(cx + Math.cos(t + 0.05) * l1, cy + Math.sin(t + 0.05) * l1); x.stroke() }
      const gr = x.createRadialGradient(w / 2, h / 2, w * 0.4, w / 2, h / 2, w * 0.5); gr.addColorStop(0, 'rgba(60,40,24,0)'); gr.addColorStop(1, 'rgba(60,40,24,0.9)')
      x.fillStyle = gr; x.fillRect(0, 0, w, h)
    }) }),   // 圓木之間的填縫（灰白的灰泥）
    roof: new THREE.MeshStandardMaterial({ map: canvasTex(256, 256, (x, w, h) => {   // 深灰石板瓦，一排一排錯開
      x.fillStyle = '#3c4044'; x.fillRect(0, 0, w, h)
      const r = mulberry32(5)
      for (let row = 0; row < 8; row++) for (let i = 0; i < 9; i++) {
        const l = 40 + r() * 22; x.fillStyle = `rgb(${l},${l + 3},${l + 7})`; x.fillRect(i * 32 + (row % 2) * 16 - 16, row * 32, 30, 30)
        x.fillStyle = 'rgba(0,0,0,0.5)'; x.fillRect(i * 32 + (row % 2) * 16 - 16, row * 32 + 28, 30, 3)
      }
    }), roughness: 0.75 }),
    stone: new THREE.MeshStandardMaterial({ color: 0x8a8780, roughness: 0.95 }),
    // 床（2026-11-09 寫實化）：條紋床墊布、紅黑格子毛毯（羊毛的毛絨雜點）、米白枕頭
    ticking: new THREE.MeshStandardMaterial({ roughness: 0.95, map: rep2(canvasTex(128, 128, (x, w, h) => {
      x.fillStyle = '#e9e2d0'; x.fillRect(0, 0, w, h)
      for (let i = 0; i < w; i += 16) { x.fillStyle = 'rgba(70,92,128,0.75)'; x.fillRect(i + 2, 0, 2, h); x.fillStyle = 'rgba(90,111,142,0.35)'; x.fillRect(i + 8, 0, 1, h) }
    }), 2, 4) }),
    plaid: new THREE.MeshStandardMaterial({ roughness: 1, map: rep2(canvasTex(256, 256, (x, w, h) => {   // 水牛格法蘭絨：紅底，深色直條＋橫條（交疊處最黑），中間一條細線
      x.fillStyle = '#a3271d'; x.fillRect(0, 0, w, h)
      x.fillStyle = 'rgba(18,10,10,0.62)'; x.fillRect(w / 2, 0, w / 2, h); x.fillRect(0, h / 2, w, h / 2)
      x.fillStyle = 'rgba(20,10,10,0.35)'; for (const q of [w * 0.25, w * 0.75]) { x.fillRect(q - 1, 0, 2, h); x.fillRect(0, q - 1, w, 2) }
      const r = mulberry32(21), img = x.getImageData(0, 0, w, h), d = img.data
      for (let i = 0; i < d.length; i += 4) { const n = (r() - 0.5) * 16; d[i] += n; d[i + 1] += n * 0.5; d[i + 2] += n * 0.5 }   // 羊毛的毛絨感
      x.putImageData(img, 0, 0)
    }), 1.4, 2.2) }),
    linen: new THREE.MeshStandardMaterial({ color: 0xece6da, roughness: 0.95 }),
    steel: new THREE.MeshStandardMaterial({ color: 0x9da2a8, roughness: 0.35, metalness: 0.85 }),
    rubber: new THREE.MeshStandardMaterial({ color: 0x101010, roughness: 0.9 }),
    carbon: new THREE.MeshStandardMaterial({ color: 0x1b1c1e, roughness: 0.38, metalness: 0.2 }),
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
  const W = C.W, D = C.D, WH = 3.0, PEAK = 4.9, T = 0.14, DOOR = 1.2, DOORH = 2.2
  const L0 = -W / 2   // 左牆（u 最小）：屋裡的擺設照左牆、後牆的距離放，屋子放大後位置跟著走
  // 石砌基礎（地面到地板）＋地板
  for (const [u, v, w, d] of [[0, D / 2, W + 0.2, 0.3], [0, -D / 2, W + 0.2, 0.3], [W / 2, 0, 0.3, D], [-W / 2, 0, 0.3, D]]) boxAt('stone', w, 0.5, d, u, -0.2, v)
  boxAt('floor', W - 0.05, 0.08, D - 0.05, 0, 0.0, 0)
  // 牆：前牆中間留門、兩側開窗；後牆一扇大窗（看出去是山谷）；兩側牆各一扇窗
  // 牆＝一根根橫放的圓木（直徑 0.28，每 0.26 公尺一根，中間填灰白灰泥）；前後牆和兩側牆差半根，轉角的木頭交叉、往外伸出 0.3 公尺
  const LR = 0.145, LS = 0.26
  const logRun = (axis, a0, a1, fixed, y0, y1) => {
    const off = axis === 'u' ? 0 : LS / 2
    for (let k = 0; ; k++) {
      const yc = 0.14 + off + k * LS; if (yc > WH + 0.05) break
      if (yc < y0 - 0.02 || yc > y1 + 0.02) continue
      const lo = Math.min(a0, a1), hi = Math.max(a0, a1), half = axis === 'u' ? W / 2 : D / 2
      const e0 = lo <= -half + 0.01 ? lo - 0.32 : lo, e1 = hi >= half - 0.01 ? hi + 0.32 : hi, L = e1 - e0, c = (e0 + e1) / 2
      const rs = 1 + (Math.sin(k * 3.7 + fixed * 5) * 0.06)   // 每根粗細差一點
      const geo = new THREE.CylinderGeometry(LR * rs, LR * rs * 1.03, L, 14, 1)
      const uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (TAU * LR) / S * 3 + k * 0.37, uv.getY(i) * L / S)
      geo.rotateZ(Math.PI / 2)                           // 軸轉成沿 local x
      if (axis === 'v') geo.rotateY(Math.PI / 2)          // 側牆：沿 local z
      const p = axis === 'u' ? at(c, yc, fixed) : at(fixed, yc, c)
      put('log', geo.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(rot).setPosition(p)))
      // 轉角伸出去的那頭：鋸開的端面看得到年輪
      for (const [e, sg] of [[e0, -1], [e1, 1]]) {
        if (Math.abs(e) < half + 0.1) continue
        const disc = new THREE.CircleGeometry(LR * rs * 1.01, 16).rotateY(sg * Math.PI / 2 + (axis === 'v' ? -Math.PI / 2 : 0))
        const pe = axis === 'u' ? at(e + sg * 0.003, yc, fixed) : at(fixed, yc, e + sg * 0.003)
        put('endgrain', disc.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(rot).setPosition(pe)))
      }
      // 這根上面的填縫（只在牆的範圍內，轉角伸出去那段沒有）
      {
        const sl = hi - lo, cc = (lo + hi) / 2
        const ch = axis === 'u' ? boxUV(new THREE.BoxGeometry(sl, 0.07, T * 0.9), sl, 0.07, T * 0.9) : boxUV(new THREE.BoxGeometry(T * 0.9, 0.07, sl), T * 0.9, 0.07, sl)
        const pc = axis === 'u' ? at(cc, yc + LS / 2, fixed) : at(fixed, yc + LS / 2, cc)
        if (yc + LS / 2 < Math.min(y1, WH)) put('chink', ch.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(rot).setPosition(pc)))
      }
    }
  }
  const wall = (u0, u1, v, y0, y1) => { if (Math.abs(u1 - u0) > 0.01 && y1 > y0) logRun('u', u0, u1, v, y0, y1) }
  const wallS = (v0, v1, u, y0, y1) => { if (Math.abs(v1 - v0) > 0.01 && y1 > y0) logRun('v', v0, v1, u, y0, y1) }
  const win = (axis, a0, a1, fixed, y0, y1) => {   // 窗框＋玻璃
    const c = (a0 + a1) / 2, w = a1 - a0, h = y1 - y0, ym = (y0 + y1) / 2
    if (axis === 'u') { boxAt('glass', w, h, 0.02, c, ym, fixed); for (const yy of [y0, y1]) boxAt('trim', w + 0.12, 0.08, T + 0.06, c, yy, fixed); for (const uu of [a0, a1, c]) boxAt('trim', 0.07, h, T + 0.04, uu, ym, fixed) }
    else { boxAt('glass', 0.02, h, w, fixed, ym, c); for (const yy of [y0, y1]) boxAt('trim', T + 0.06, 0.08, w + 0.12, fixed, yy, c); for (const vv of [a0, a1, c]) boxAt('trim', T + 0.04, h, 0.07, fixed, ym, vv) }
  }
  // 前牆（v = +D/2）：門在中間，門右邊一扇小窗
  const fw0 = W / 2 - 1.9, fw1 = W / 2 - 0.7   // 門右邊的小窗
  wall(-W / 2, -DOOR / 2, D / 2, 0, WH); wall(DOOR / 2, fw0, D / 2, 0, WH); wall(fw1, W / 2, D / 2, 0, WH)
  wall(fw0, fw1, D / 2, 0, 1.0); wall(fw0, fw1, D / 2, 2.1, WH); win('u', fw0, fw1, D / 2, 1.0, 2.1)
  wall(-DOOR / 2, DOOR / 2, D / 2, DOORH, WH)
  for (const uu of [-DOOR / 2, DOOR / 2]) boxAt('trim', 0.1, DOORH, T + 0.06, uu, DOORH / 2, D / 2); boxAt('trim', DOOR + 0.2, 0.1, T + 0.06, 0, DOORH, D / 2)
  // 門板：往裡開著
  boxAt('trim', 0.05, DOORH - 0.05, DOOR - 0.06, -DOOR / 2 + 0.04, DOORH / 2, D / 2 - (DOOR - 0.06) / 2 - 0.08)   // 開 90 度，貼著門框左邊往屋裡
  // 後牆（v = -D/2）：一整排大窗（攝影窗）
  const bw = W / 2 - 1.0
  wall(-W / 2, -bw, -D / 2, 0, WH); wall(bw, W / 2, -D / 2, 0, WH); wall(-bw, bw, -D / 2, 0, 0.9); wall(-bw, bw, -D / 2, 2.3, WH)
  win('u', -bw, bw, -D / 2, 0.9, 2.3)
  // 兩側牆：各一扇窗
  for (const su of [-1, 1]) { const u = su * W / 2; wallS(-D / 2, -0.7, u, 0, WH); wallS(0.7, D / 2, u, 0, WH); wallS(-0.7, 0.7, u, 0, 1.0); wallS(-0.7, 0.7, u, 2.1, WH); win('v', -0.7, 0.7, u, 1.0, 2.1) }
  // 山牆（三角形）：兩側 u = ±W/2 往上到屋脊（屋脊沿 v 方向）——改成屋脊沿 u：前後牆是山牆
  for (const sv of [-1, 1]) {
    const v = sv * D / 2, tri = new THREE.BufferGeometry()
    const p0 = at(-W / 2, WH, v), p1 = at(W / 2, WH, v), p2 = at(0, PEAK, v)
    tri.setAttribute('position', new THREE.Float32BufferAttribute([p0.x, p0.y, p0.z, p1.x, p1.y, p1.z, p2.x, p2.y, p2.z, p0.x, p0.y, p0.z, p2.x, p2.y, p2.z, p1.x, p1.y, p1.z], 3))
    const ux = (u) => (u + W / 2) / S, vy = (y) => y / S
    tri.setAttribute('uv', new THREE.Float32BufferAttribute([ux(-W / 2), vy(WH), ux(W / 2), vy(WH), ux(0), vy(PEAK), ux(-W / 2), vy(WH), ux(0), vy(PEAK), ux(W / 2), vy(WH)], 2)); tri.computeVertexNormals()
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
      // 屋裡看上去是木板天花板（不是石板瓦的背面）
      const ceil = boxUV(new THREE.BoxGeometry(L, 0.03, D + 1.0), L, 0.03, D + 1.0)
      put('wall', ceil.applyMatrix4(new THREE.Matrix4().compose(mid.clone().add(V(0, -0.075, 0)), q, V(1, 1, 1))))
    }
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, C.yaw, 0))
    put('trim', new THREE.BoxGeometry(0.16, 0.16, D + 1.0).applyMatrix4(new THREE.Matrix4().compose(at(0, PEAK + 0.05, 0), q, V(1, 1, 1))))
    for (const su of [-1, 1]) for (const sv of [-1, 1]) boxAt('trim', 0.18, WH, 0.18, su * W / 2, WH / 2, sv * D / 2)
  }
  // 煙囪（後面左邊）：石砌＋鐵管
  {
    // 煙囪底要跟著斜屋頂切：平底的話，靠屋裡那一側屋頂比較高，煙囪底會從天花板下面露出來（灰色石板）；
    // 靠外那一側屋頂比較低，從外面看又會有縫。底面每個頂點放在「那個 u 的屋頂板中間」高度（天花板上面、屋頂瓦下面）
    const cu = L0 + 1.4, roofY = (u) => PEAK - (PEAK - WH) * Math.abs(u) / (W / 2) + 0.12, y1 = PEAK + 0.9, cw = 0.7
    {
      const y0 = roofY(cu) - 0.05, h = y1 - y0, geo = boxUV(new THREE.BoxGeometry(cw, h, cw), cw, h, cw), p = geo.attributes.position
      for (let i = 0; i < p.count; i++) if (p.getY(i) < 0) p.setY(i, roofY(cu + p.getX(i)) - 0.03 - (y0 + h / 2))
      geo.computeVertexNormals()
      put('stone', geo.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(0, C.yaw, 0)).setPosition(at(cu, y0 + h / 2, -D / 2 + 1.05))))
    }
    cylAt('iron', 0.09, 0.09, 0.5, cu, y1 + 0.2, -D / 2 + 1.05)
  }   // 底部藏在屋頂下面一點點，不要穿進屋裡
  // 門廊：前面一小塊木平台＋一張長椅＋門口的提燈
  boxAt('floor', W, 0.08, 1.4, 0, 0.0, D / 2 + 0.75)
  // 門廊的柱子（2026-11-09 寫實化）：圓木柱（上細下粗）立在石墩上，頂上一根橫樑頂住小屋簷（以前柱子頂到 2.6、屋簷底 2.83，中間是空的），
  // 每根柱子兩側各一支斜撐到橫樑、往後一支斜撐到牆
  {
    const PV = D / 2 + 1.38, PU = W / 2 - 0.12
    for (const su of [-1, 1]) {
      const u = su * PU
      boxAt('stone', 0.32, 0.14, 0.32, u, 0.07, PV)
      logUV('log', u, 0.14, PV, u, 2.68, PV, 0.115, 0.1)
      put('endgrain', new THREE.CircleGeometry(0.1, 14).rotateX(-Math.PI / 2).translate(0, 0, 0).applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(rot).setPosition(at(u, 2.681, PV))))
      logUV('log', u, 2.12, PV, u - su * 0.62, 2.7, PV, 0.055)          // 往裡的斜撐
      logUV('log', u, 2.12, PV, u + su * 0.3, 2.6, PV, 0.05)            // 往外（屋簷伸出去那段）
      logUV('log', u, 2.15, PV, u, 2.72, PV - 0.62, 0.05)              // 往牆
    }
    logUV('log', -W / 2 - 0.2, 2.75, PV, W / 2 + 0.2, 2.75, PV, 0.11, 0.105)   // 橫樑（剛好頂到屋簷底）
  }
  {
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, C.yaw, 0)).multiply(new THREE.Quaternion().setFromAxisAngle(V(1, 0, 0), 0.32))
    put('roof', new THREE.BoxGeometry(W + 0.4, 0.08, 1.7).applyMatrix4(new THREE.Matrix4().compose(at(0, WH + 0.05, D / 2 + 0.8), q, V(1, 1, 1))))   // 門廊的小屋簷
  }
  boxAt('trim', 1.6, 0.06, 0.4, L0 + 1.4, 0.45, D / 2 + 1.0); for (const uu of [L0 + 0.7, L0 + 2.1]) boxAt('trim', 0.06, 0.45, 0.36, uu, 0.22, D / 2 + 1.0)
  boxAt('lamp', 0.14, 0.2, 0.14, DOOR / 2 + 0.3, 2.3, D / 2 + 0.12)

  /* ---------- 屋裡：攝影玩家的據點 ---------- */
  // 後面大窗前：三腳架＋大砲鏡頭對著窗外（2026-11-09 寫實化）
  // 腳架照相機行展示的那支做：三節伸縮碳纖腳（上粗下細、接頭有扳扣）、橡膠腳墊、三角座、中柱、球型雲台＋快拆板；
  // 上面架遊戲裡真的相機模型（旗艦機身＋150–600mm 超望遠，models/camera/），鏡頭朝窗外，腳架鎖在鏡頭腳上（重心在腳架正上方）
  {
    const TU = 0.3, TV = -D / 2 + 0.95, HGT = 1.32, apexY = HGT - 0.2, spread = 0.42
    const apex = at(TU, apexY, TV)
    cylW('carbon', at(TU, apexY - 0.035, TV), at(TU, apexY + 0.035, TV), 0.065)                   // 三角座
    for (let i = 0; i < 3; i++) {
      const a = C.yaw + Math.PI + i * TAU / 3                                                      // 一支腳朝窗、兩支朝屋裡
      const foot = at(TU, 0.052, TV).add(V(Math.sin(a) * spread, 0, Math.cos(a) * spread))
      const top = apex.clone().add(V(Math.sin(a) * 0.05, -0.02, Math.cos(a) * 0.05))
      const pt = (k) => top.clone().lerp(foot, k)
      cylW('carbon', top, pt(0.4), 0.019, 0.018); cylW('carbon', pt(0.4), pt(0.72), 0.015, 0.014); cylW('carbon', pt(0.72), pt(0.975), 0.0115, 0.0105)
      for (const k of [0.4, 0.72]) cylW('steel', pt(k - 0.025), pt(k + 0.006), k < 0.5 ? 0.024 : 0.019)   // 扳扣
      cylW('rubber', pt(0.04), pt(0.16), 0.023)                                                   // 泡棉握套
      cylW('rubber', pt(0.965), foot, 0.017, 0.02)                                                // 橡膠腳墊
    }
    cylW('steel', at(TU, apexY - 0.22, TV), at(TU, HGT, TV), 0.014)                                // 中柱
    cylW('carbon', at(TU, apexY + 0.035, TV), at(TU, apexY + 0.07, TV), 0.034)                     // 中柱鎖環
    cylW('carbon', at(TU, HGT, TV), at(TU, HGT + 0.03, TV), 0.032)                                 // 雲台底座
    put('steel', new THREE.SphereGeometry(0.034, 16, 12).translate(...at(TU, HGT + 0.058, TV).toArray()))   // 球
    cylW('carbon', at(TU, HGT + 0.08, TV), at(TU, HGT + 0.098, TV), 0.014)
    boxAt('carbon', 0.08, 0.018, 0.09, TU, HGT + 0.105, TV)                                          // 快拆座
    // 真的相機＋鏡頭：模型原點＝卡口中心、鏡頭朝 -Z；轉成朝窗外（-v），整組往後挪讓鏡頭腳（鏡身中段）落在雲台上
    const ld = new GLTFLoader().setDRACOLoader(new DRACOLoader().setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.174.0/examples/jsm/libs/draco/gltf/'))
    Promise.all(['models/camera/body-b3.glb', 'models/camera/lens-l4.glb'].map((u) => ld.loadAsync(u))).then(([bd, ln]) => {
      const rig = new THREE.Group()
      rig.add(bd.scene, ln.scene)
      // 鏡身中段（鏡頭腳的位置）那一小段的底部：遮光罩比鏡身粗，不能拿整支鏡頭的最低點
      const bb = new THREE.Box3().setFromObject(ln.scene), lensMid = bb.min.z + (bb.max.z - bb.min.z) * 0.55
      let under = Infinity
      ln.scene.updateMatrixWorld(true)
      ln.scene.traverse((o) => {
        if (!o.isMesh) return
        const p = o.geometry.attributes.position, v = new THREE.Vector3()
        for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld); if (Math.abs(v.z - lensMid) < 0.03) under = Math.min(under, v.y) }
      })
      if (!isFinite(under)) under = bb.min.y
      rig.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true } })
      const FOOT = 0.035   // 鏡頭腳座（接在鏡身底下、鎖在快拆座上）
      const foot = new THREE.Mesh(new RoundedBoxGeometry(0.05, FOOT + 0.01, 0.11, 2, 0.008), mats.carbon); foot.position.set(0, under - FOOT / 2 + 0.004, lensMid); rig.add(foot)
      rig.position.copy(at(TU, HGT + 0.114 + FOOT - under, TV)).addScaledVector(fwd, -lensMid)   // 鏡頭腳正好在雲台正上方
      rig.rotation.y = C.yaw
      rig.rotateX(0.04)                                                                              // 微微往上，對著窗外的山
      g.add(rig)
    }).catch((e) => console.warn('[summit] 相機模型載入失敗', e))
  }
  // 窗邊的工作桌：筆電（螢幕是鳥照）、一疊記憶卡盒、咖啡杯
  const DK = L0 + 3.0   // 桌子中心（後窗前面，爐子右邊、三腳架左邊）
  boxAt('trim', 1.6, 0.05, 0.7, DK, 0.76, -D / 2 + 0.45)
  for (const [uu, vv] of [[DK - 0.7, -D / 2 + 0.2], [DK + 0.7, -D / 2 + 0.2], [DK - 0.7, -D / 2 + 0.75], [DK + 0.7, -D / 2 + 0.75]]) boxAt('trim', 0.05, 0.74, 0.05, uu, 0.37, vv)
  // 桌上（2026-11-09 寫實化）：太空灰鋁殼筆電（圓角機身、鍵盤、觸控板、螢幕亮著一張鳥照）、白瓷咖啡杯（有把手、杯裡是咖啡）、
  // 記憶卡盒、讀卡機、筆記本＋筆、鏡頭蓋
  {
    const TOP = 0.785, LV = -D / 2 + 0.52
    const alu = new THREE.MeshStandardMaterial({ color: 0x8c8f94, roughness: 0.32, metalness: 0.85 })
    const keysT = canvasTex(512, 256, (x, w, h) => {
      x.fillStyle = '#7d8086'; x.fillRect(0, 0, w, h)
      x.fillStyle = '#1b1c1f'; x.fillRect(16, 10, w - 32, h * 0.6)
      const rows = [14, 14, 13, 12, 11], kw = (w - 40) / 14.6
      rows.forEach((n, ri) => { for (let k = 0; k < n; k++) { const ww = ri === 4 && k === 5 ? kw * 4.6 : kw * 0.9; const xx = 20 + k * kw + (ri === 4 && k > 5 ? kw * 3.6 : 0) + (14 - n) * kw * 0.25; x.fillStyle = '#2a2b2f'; x.fillRect(xx, 14 + ri * h * 0.115, ww, h * 0.1); x.fillStyle = 'rgba(255,255,255,0.06)'; x.fillRect(xx, 14 + ri * h * 0.115, ww, 2) } })
      x.fillStyle = '#868a90'; x.fillRect(w * 0.3, h * 0.68, w * 0.4, h * 0.28); x.strokeStyle = 'rgba(0,0,0,0.25)'; x.strokeRect(w * 0.3, h * 0.68, w * 0.4, h * 0.28)   // 觸控板
    })
    rbox('_alu', 0.34, 0.012, 0.235, DK, TOP + 0.006, LV, 0.005)
    const deck = new THREE.Mesh(new THREE.PlaneGeometry(0.33, 0.225), new THREE.MeshStandardMaterial({ map: keysT, roughness: 0.5, metalness: 0.4 }))
    deck.rotation.set(-Math.PI / 2, 0, 0, 'YXZ'); deck.rotation.y = C.yaw; deck.position.copy(at(DK, TOP + 0.0125, LV)); g.add(deck)
    // 螢幕：鉸鏈在機身後緣，打開約 110 度
    const lid = new THREE.Group(); lid.position.copy(at(DK, TOP + 0.012, LV - 0.117)); lid.rotation.order = 'YXZ'; lid.rotation.y = C.yaw; lid.rotation.x = -0.35; g.add(lid)
    const shell = new THREE.Mesh(new RoundedBoxGeometry(0.34, 0.225, 0.007, 2, 0.003), alu); shell.position.set(0, 0.1125, -0.0035); lid.add(shell)
    const bezel = new THREE.Mesh(new THREE.PlaneGeometry(0.334, 0.219), new THREE.MeshStandardMaterial({ color: 0x0a0a0b, roughness: 0.2 })); bezel.position.set(0, 0.1125, 0.0002); lid.add(bezel)
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.312, 0.195), new THREE.MeshStandardMaterial({ color: 0x223040, emissive: 0xffffff, emissiveIntensity: 0.55, roughness: 0.15 })); scr.position.set(0, 0.116, 0.0006); lid.add(scr)
    if (printsUrl) new THREE.TextureLoader().load(printsUrl, (tx) => { tx.colorSpace = THREE.SRGBColorSpace; tx.repeat.set(0.5, 0.5 * 0.625); tx.offset.set(0, 0.5 + 0.09); scr.material.map = tx; scr.material.emissiveMap = tx; scr.material.color.set(0x111111); scr.material.needsUpdate = true })
    mats._alu = alu
    // 咖啡杯：白瓷、杯口一圈、把手（甜甜圈的一半）、裡面深色咖啡
    const ceramic = new THREE.MeshStandardMaterial({ color: 0xf2efe8, roughness: 0.25 })
    const mug = new THREE.Mesh(new THREE.LatheGeometry([V(0, 0), V(0.038, 0), V(0.041, 0.006), V(0.042, 0.09), V(0.0385, 0.09), V(0.0365, 0.008), V(0, 0.008)], 24), ceramic)
    mug.position.copy(at(DK + 0.5, TOP, -D / 2 + 0.62)); g.add(mug)
    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.024, 0.0055, 8, 16, Math.PI), ceramic); handle.position.copy(mug.position).add(V(0, 0.047, 0)).addScaledVector(right, 0.04); handle.rotation.set(0, C.yaw + Math.PI / 2, -Math.PI / 2, 'YXZ'); g.add(handle)
    const cof = new THREE.Mesh(new THREE.CircleGeometry(0.037, 20).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x2a160a, roughness: 0.1 })); cof.position.copy(mug.position).add(V(0, 0.075, 0)); g.add(cof)
    // 記憶卡盒（半透明塑膠盒裡一張卡）疊三個、讀卡機、筆記本＋筆、鏡頭蓋
    for (let k = 0; k < 3; k++) { rbox('black', 0.04, 0.0045, 0.035, DK - 0.3 + k * 0.004, TOP + 0.0025 + k * 0.0048, -D / 2 + 0.66, 0.0015, 0.2 * k - 0.2); boxAt(k === 1 ? 'cardB' : 'cardR', 0.024, 0.0012, 0.032, DK - 0.3 + k * 0.004, TOP + 0.0045 + k * 0.0048, -D / 2 + 0.66, 0.2 * k - 0.2) }
    rbox('black', 0.06, 0.012, 0.03, DK - 0.27, TOP + 0.006, -D / 2 + 0.36, 0.004, 0.4)
    boxAt('notebook', 0.15, 0.012, 0.21, DK + 0.33, TOP + 0.006, -D / 2 + 0.36, -0.15); cylW('cardB', at(DK + 0.3, TOP + 0.015, -D / 2 + 0.3), at(DK + 0.36, TOP + 0.015, -D / 2 + 0.44), 0.0035)
    put('black', new THREE.CylinderGeometry(0.041, 0.041, 0.012, 24).translate(...at(DK - 0.45, TOP + 0.006, -D / 2 + 0.5).toArray()))
    mats.cardR = new THREE.MeshStandardMaterial({ color: 0xb8322a, roughness: 0.4 }); mats.cardB = new THREE.MeshStandardMaterial({ color: 0x23406e, roughness: 0.4 })
    mats.notebook = new THREE.MeshStandardMaterial({ color: 0x4d5a3a, roughness: 0.85 })
  }
  boxAt('trim', 0.5, 0.05, 0.5, DK, 0.45, -D / 2 + 1.2); for (const [du, dv] of [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]]) boxAt('trim', 0.04, 0.45, 0.04, DK + du, 0.22, -D / 2 + 1.2 + dv)   // 小凳子
  // 雙層床（右邊牆，2026-11-09 寫實化）：圓木床柱和橫桿、一條條床板、圓角的條紋床墊、紅黑格子毛毯（兩側垂下來、床頭那端反摺捲起）、
  // 枕頭；上鋪靠房間那側有護欄，床尾一座梯子。床頭朝後牆（-v），房間那側是 -u
  {
    const BU = W / 2 - 0.55, BV = -D / 2 + 1.65, HU = 0.44, HV = 0.98
    summitRests.length = 0; summitRests.push({ p: at(BU - HU - 0.3, 0, BV), r: 1.3, kind: 'bed' })   // 站在床邊（房間那側）
    for (const [du, dv] of [[-HU, -HV], [HU, -HV], [-HU, HV], [HU, HV]]) {
      logUV('log', BU + du, 0, BV + dv, BU + du, 2.06, BV + dv, 0.068, 0.062)
      put('endgrain', new THREE.CircleGeometry(0.062, 12).rotateX(-Math.PI / 2).applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(rot).setPosition(at(BU + du, 2.061, BV + dv))))
    }
    for (const y of [0.4, 1.55]) {
      for (const su of [-1, 1]) logUV('log', BU + su * HU, y, BV - HV - 0.06, BU + su * HU, y, BV + HV + 0.06, 0.052)   // 長邊橫桿
      for (const sv of [-1, 1]) logUV('log', BU - HU - 0.06, y, BV + sv * HV, BU + HU + 0.06, y, BV + sv * HV, 0.05)   // 床頭、床尾橫桿
      for (const sv of [-1, 1]) logUV('log', BU - HU, y + 0.32, BV + sv * HV, BU + HU, y + 0.32, BV + sv * HV, 0.04)   // 床頭板上面那根
      for (let k = 0; k < 8; k++) boxAt('trim', 0.86, 0.025, 0.1, BU, y + 0.04, BV - 0.86 + k * 0.245)                 // 床板
      const my = y + 0.135
      rbox('ticking', 0.84, 0.15, 1.88, BU, my, BV, 0.045)                                                              // 床墊
      // 毛毯：蓋住床尾那 2/3，兩側垂下來；床頭那端反摺一截、邊上捲起來
      const b0 = BV - 0.32, b1 = BV + HV - 0.03, bl = b1 - b0, bc = (b0 + b1) / 2, top = my + 0.075
      rbox('plaid', 0.9, 0.035, bl, BU, top + 0.012, bc, 0.012)
      for (const su of [-1, 1]) rbox('plaid', 0.025, 0.2, bl - 0.02, BU + su * 0.445, top - 0.08, bc, 0.01, 0, su * 0.08)
      rbox('plaid', 0.9, 0.04, 0.26, BU, top + 0.04, b0 + 0.13, 0.015)                                                // 反摺
      put('plaid', new THREE.CylinderGeometry(0.03, 0.03, 0.9, 12).rotateZ(Math.PI / 2).applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(rot).setPosition(at(BU, top + 0.045, b0))))
      // 枕頭：鼓起來的圓角枕、稍微斜放
      put('linen', new RoundedBoxGeometry(0.56, 0.16, 0.36, 4, 0.07).scale(1, 0.75, 1).applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(-0.12, C.yaw + 0.06, 0, 'YXZ')).setPosition(at(BU, top + 0.06, BV - HV + 0.3))))
    }
    // 上鋪護欄（房間那側，床頭到中間；床尾留一段給人爬進去）
    logUV('log', BU - HU, 1.55 + 0.36, BV - HV, BU - HU, 1.55 + 0.36, BV + 0.15, 0.04)
    logUV('log', BU - HU, 1.6, BV + 0.15, BU - HU, 1.91, BV + 0.15, 0.035)
    // 梯子：床尾那端、房間那側，斜靠在上鋪橫桿上
    for (const dv of [0.48, 0.86]) logUV('log', BU - HU - 0.3, 0, BV + dv, BU - HU - 0.04, 1.62, BV + dv, 0.032)
    for (let k = 1; k <= 5; k++) { const y = k * 0.3, uu = BU - HU - 0.3 + 0.26 * (y / 1.62); logUV('log', uu - 0.015, y, BV + 0.46, uu - 0.015, y, BV + 0.88, 0.022) }
  }
  // 柴爐（左後角）＋煙管接到煙囪
  // 爐子放在煙囪正下方（左後角），煙管直直往上接煙囪
  const SV = -D / 2 + 1.05, SU = L0 + 1.4
  boxAt('iron', 0.55, 0.6, 0.5, SU, 0.35, SV); cylAt('iron', 0.08, 0.08, PEAK - 0.65, SU, 0.65 + (PEAK - 0.65) / 2, SV)
  boxAt('stone', 0.9, 0.04, 0.9, SU, 0.03, SV)
  // 爐火（2026-11-08）：爐子正面一個小玻璃火窗，裡面的火用著色器畫（往上竄的雜訊火舌＋底下的炭火），
  // 一盞橘色點光源跟著火的亮暗閃（照亮爐子前面的地板和牆）；煙囪頂冒煙。每格的更新掛在火窗的 onBeforeRender（看得到才算）
  {
    const FW = 0.32, FH = 0.24, fv = SV + 0.252
    const fireM = new THREE.ShaderMaterial({
      uniforms: { uT: { value: 0 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `varying vec2 vUv; uniform float uT;
        float h2(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h2(i), h2(i + vec2(1, 0)), f.x), mix(h2(i + vec2(0, 1)), h2(i + vec2(1, 1)), f.x), f.y); }
        float fbm(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { s += a * vn(p); p *= 2.1; a *= 0.5; } return s; }
        void main(){
          vec2 p = vUv;
          float n = fbm(vec2(p.x * 5.0, p.y * 3.0 - uT * 2.6)), n2 = fbm(vec2(p.x * 9.0 + 3.0, p.y * 6.0 - uT * 4.0));
          float flame = (1.0 - p.y) * 1.45 - 0.45 + n * 0.85 + n2 * 0.25 - abs(p.x - 0.5) * 1.1;
          vec3 c = vec3(0.06, 0.015, 0.0);
          c = mix(c, vec3(0.95, 0.32, 0.04), smoothstep(0.15, 0.5, flame));
          c = mix(c, vec3(1.0, 0.72, 0.28), smoothstep(0.55, 0.85, flame));
          c = mix(c, vec3(1.0, 0.95, 0.75), smoothstep(0.9, 1.1, flame));
          float coal = smoothstep(0.78, 0.95, 1.0 - p.y) * (0.55 + 0.45 * fbm(vec2(p.x * 14.0, uT * 0.7)));   // 底下的炭火
          c += vec3(0.9, 0.22, 0.02) * coal;
          gl_FragColor = vec4(c * 1.7, 1.0);
          #include <colorspace_fragment>
        }`,
    })
    const fire = new THREE.Mesh(new THREE.PlaneGeometry(FW, FH), fireM)
    fire.position.copy(at(SU, 0.33, fv)); fire.rotation.y = C.yaw; g.add(fire)
    // 火窗的鐵框
    for (const yy of [0.33 - FH / 2 - 0.02, 0.33 + FH / 2 + 0.02]) boxAt('iron', FW + 0.08, 0.04, 0.03, SU, yy, fv)
    for (const uu of [SU - FW / 2 - 0.02, SU + FW / 2 + 0.02]) boxAt('iron', 0.04, FH + 0.08, 0.03, uu, 0.33, fv)
    boxAt('iron', 0.04, 0.03, 0.06, SU + FW / 2 - 0.02, 0.5, fv + 0.03)   // 門把
    const light = new THREE.PointLight(0xff8636, 0, 7.5, 1.6)
    light.position.copy(at(SU, 0.55, SV + 0.55)); g.add(light)
    // 煙：煙囪頂一串慢慢往上飄、越來越大越淡的灰煙
    const smokeT = softDotTex(), puffs = []
    const top = at(L0 + 1.4, PEAK + 1.25, -D / 2 + 1.05)
    for (let i = 0; i < 12; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeT, color: 0x9d9d98, transparent: true, opacity: 0, depthWrite: false }))
      sp.userData.ph = i / 12; sp.renderOrder = 6; g.add(sp); puffs.push(sp)
    }
    const upd = () => {
      const t = performance.now() / 1000
      fireM.uniforms.uT.value = t
      // 火光閃：幾個不同頻率疊起來，偶爾一下比較暗
      const fl = 0.78 + 0.12 * Math.sin(t * 7.3) + 0.07 * Math.sin(t * 13.1 + 1.3) + 0.05 * Math.sin(t * 23.7)
      light.intensity = 3.5 * fl
      for (const sp of puffs) {
        const k = (t * 0.06 + sp.userData.ph) % 1
        sp.position.copy(top).add(V(Math.sin(k * 5 + sp.userData.ph * 9) * 0.3 * k + k * 1.2, k * 5.5, Math.cos(k * 4 + sp.userData.ph * 7) * 0.3 * k))
        const sz = 0.5 + k * 2.6; sp.scale.set(sz, sz, 1)
        sp.material.opacity = 0.6 * Math.sin(Math.PI * Math.min(1, k * 1.4)) * (1 - k)
      }
    }
    fire.onBeforeRender = upd; puffs[0].onBeforeRender = upd   // 在屋外看不到火窗時，煙也要繼續飄
  }
  // 左牆：鏡頭架（三層，擺幾支鏡頭和相機）
  for (const y of [1.0, 1.4, 1.8]) boxAt('trim', 0.3, 0.04, 1.4, -W / 2 + 0.2, y, D / 2 - 1.2)
  // 架上（2026-11-09 寫實化）：遊戲裡真的機身和鏡頭模型（相機行賣的那幾支），鏡頭直立擺（後蓋朝下）、機身側放；架子下面有鐵托架
  for (const y of [1.0, 1.4, 1.8]) for (const vv of [D / 2 - 1.75, D / 2 - 0.65]) boxAt('iron', 0.22, 0.03, 0.02, -W / 2 + LR + 0.11, y - 0.04, vv)
  {
    const ld2 = new GLTFLoader().setDRACOLoader(new DRACOLoader().setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.174.0/examples/jsm/libs/draco/gltf/'))
    const items = [['body-b1', 1.0, D / 2 - 1.6, 'body'], ['lens-l1', 1.0, D / 2 - 1.15, 'lens'], ['lens-l2', 1.0, D / 2 - 0.85, 'lens'], ['body-b2', 1.4, D / 2 - 1.45, 'body'], ['lens-l3', 1.4, D / 2 - 0.9, 'lens'], ['lens-l5', 1.8, D / 2 - 1.3, 'lens']]
    for (const [name, y, vv, kind] of items) ld2.loadAsync(`models/camera/${name}.glb`).then((gl) => {
      const o = gl.scene, holder = new THREE.Group(); holder.add(o)
      if (kind === 'lens') o.rotation.x = -Math.PI / 2   // 鏡頭朝 -Z → 轉成朝上（後蓋朝下立著）
      else o.rotation.y = 0.5
      const bb = new THREE.Box3().setFromObject(holder), ctr = bb.getCenter(V())
      o.position.sub(V(ctr.x, bb.min.y, ctr.z))
      holder.position.copy(at(-W / 2 + LR + 0.13, y + 0.02, vv)); holder.rotation.y = C.yaw + (kind === 'body' ? Math.PI / 2 : 0)
      holder.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true } })
      g.add(holder)
    }).catch(() => {})
  }
  // 牆上：地圖、鳥照（相機行那四張）、掛燈
  {
    const pm = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.68), mats.paper)
    // 左牆窗戶（v ±0.7）後面那段實心的牆（v -D/2～-0.7）中間；以前在 v -0.6，整張蓋在窗戶上（2026-11-08）
    pm.position.copy(at(-W / 2 + LR + 0.03, 1.65, -D / 4 - 0.35)); pm.rotation.y = C.yaw + Math.PI / 2; g.add(pm)
    const pf = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.74, 0.96), mats.trim); pf.position.copy(pm.position).addScaledVector(right, -0.012); pf.rotation.y = C.yaw; g.add(pf)   // 木框
    if (printsUrl) new THREE.TextureLoader().load(printsUrl, (tx) => {
      tx.colorSpace = THREE.SRGBColorSpace
      for (let k = 0; k < 4; k++) {
        const t = tx.clone(); t.repeat.set(0.5, 0.5); t.offset.set((k % 2) * 0.5, k < 2 ? 0.5 : 0); t.needsUpdate = true
        const m = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.42), new THREE.MeshStandardMaterial({ map: t, roughness: 0.6 }))
        // 掛在前牆門左邊那一整面實心的牆上（以前排在 -0.5～1.45，剛好蓋在門口和窗戶上）；貼著圓木內側表面，不陷進木頭
        m.position.copy(at(-DOOR / 2 - 0.55 - (3 - k) * 0.7, 1.75, D / 2 - LR - 0.035)); m.rotation.y = C.yaw + Math.PI; g.add(m)
        const f = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.48, 0.02), mats.trim); f.position.copy(m.position).addScaledVector(fwd, 0.012); f.rotation.y = C.yaw; g.add(f)
      }
    })
  }
  // 燈（2026-11-09 寫實化）：屋子中間一盞工業風吊燈（黑色鐵燈罩、裡面白琺瑯、愛迪生燈泡、鐵鍊吊在屋脊），
  // 一盞暖色點光源真的照亮屋裡；桌上一盞小檯燈。亮度跟著路燈（lamp 材質的發光強度：白天弱、晚上亮），每格在燈泡的 onBeforeRender 更新
  const bulbM = Object.assign(new THREE.MeshStandardMaterial({ color: 0xfff1d0, emissive: 0xffb25a, emissiveIntensity: 1.2 }), { userData: { lamp: [0.8, 3] } })
  const lampAt = (u, y, v, opt) => {
    const grp = new THREE.Group(); grp.position.copy(at(u, y, v)); g.add(grp)
    const sh = new THREE.Mesh(new THREE.LatheGeometry([V(0.02, 0.1), V(0.03, 0.09), V(0.05, 0.075), V(opt.r * 0.75, 0.02), V(opt.r, -0.04), V(opt.r + 0.004, -0.045)], 28), new THREE.MeshStandardMaterial({ color: 0x1c1d1f, roughness: 0.45, metalness: 0.6, side: THREE.FrontSide }))
    const inner = new THREE.Mesh(sh.geometry, new THREE.MeshStandardMaterial({ color: 0xf3efe6, roughness: 0.35, side: THREE.BackSide, emissive: 0xffd9a0, emissiveIntensity: 0.15 }))
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(opt.b, 16, 12).scale(1, 1.3, 1), bulbM); bulb.position.y = -0.01
    grp.add(sh, inner, bulb)
    const light = new THREE.PointLight(opt.col, 0, opt.dist, 2); light.position.y = -0.06; grp.add(light)
    bulb.onBeforeRender = () => { light.intensity = opt.k * bulbM.emissiveIntensity }
    return grp
  }
  const pend = lampAt(0, WH - 0.55, 0.1, { r: 0.19, b: 0.035, col: 0xffc78a, dist: 11, k: 4.2 })
  for (let y = WH - 0.45; y < PEAK - 0.1; y += 0.05) put('iron', new THREE.TorusGeometry(0.012, 0.0035, 5, 10).rotateY(y * 40).translate(...at(0, y, 0.1).toArray()))   // 鐵鍊
  // 檯燈：圓鐵座、斜的燈臂、小燈罩朝筆電那邊
  {
    const bu = L0 + 2.35, bv = -D / 2 + 0.3
    put('iron', new THREE.CylinderGeometry(0.06, 0.07, 0.02, 20).translate(...at(bu, 0.795, bv).toArray()))
    tubeW('iron', at(bu, 0.8, bv), at(bu + 0.05, 1.1, bv + 0.05), 0.007); tubeW('iron', at(bu + 0.05, 1.1, bv + 0.05), at(bu + 0.15, 1.15, bv + 0.12), 0.006)
    const dl = lampAt(bu + 0.17, 1.12, bv + 0.14, { r: 0.07, b: 0.018, col: 0xffd2a0, dist: 3.5, k: 0.9 }); dl.rotation.z = 0.5; dl.rotation.y = C.yaw
  }
  // 地毯
  // 地毯：手織的 kilim（紅底、靛藍和米白的菱形花紋、兩端流蘇）
  mats.cloth = new THREE.MeshStandardMaterial({ roughness: 1, map: canvasTex(512, 340, (x, w, h) => {
    const r = mulberry32(61)
    x.fillStyle = '#8e2f22'; x.fillRect(0, 0, w, h)
    x.fillStyle = '#e7dcc4'; for (let i = 0; i < w; i += 6) { x.fillRect(i, 0, 3, 12); x.fillRect(i, h - 12, 3, 12) }   // 流蘇
    x.strokeStyle = '#2b3550'; x.lineWidth = 10; x.strokeRect(26, 22, w - 52, h - 44); x.strokeStyle = '#e2cfa3'; x.lineWidth = 3; x.strokeRect(38, 34, w - 76, h - 68)
    for (let k = 0; k < 3; k++) {   // 中間三顆大菱形
      const cx = w * (0.25 + k * 0.25), cy = h / 2
      for (const [sz, col] of [[70, '#2b3550'], [52, '#e2cfa3'], [36, '#a5422e'], [18, '#2b3550']]) { x.fillStyle = col; x.beginPath(); x.moveTo(cx, cy - sz); x.lineTo(cx + sz * 0.7, cy); x.lineTo(cx, cy + sz); x.lineTo(cx - sz * 0.7, cy); x.fill() }
    }
    for (let i = 52; i < w - 52; i += 18) { x.fillStyle = '#e2cfa3'; x.beginPath(); x.moveTo(i, 50); x.lineTo(i + 6, 58); x.lineTo(i, 66); x.lineTo(i - 6, 58); x.fill(); x.beginPath(); x.moveTo(i, h - 50); x.lineTo(i + 6, h - 58); x.lineTo(i, h - 66); x.lineTo(i - 6, h - 58); x.fill() }
    const img = x.getImageData(0, 0, w, h), d = img.data; for (let i = 0; i < d.length; i += 4) { const n = (r() - 0.5) * 22 + ((i / 4) % w % 3 === 0 ? -8 : 0); d[i] += n; d[i + 1] += n; d[i + 2] += n } x.putImageData(img, 0, 0)   // 織紋
  }) })
  boxAt('cloth', 2.4, 0.008, 1.6, 0, 0.044, 0.5)
  // 門邊的掛鉤：登山外套、帽子、望遠鏡（吊帶）；爐子旁一堆柴；床尾一個登山背包
  {
    const hv = D / 2 - LR - 0.06
    boxAt('trim', 1.1, 0.08, 0.025, 1.45, 1.75, hv)
    for (let k = 0; k < 4; k++) tubeW('iron', at(1.0 + k * 0.3, 1.75, hv - 0.01), at(1.0 + k * 0.3, 1.8, hv - 0.08), 0.007)
    // 掛著的東西（2026-11-09 第二版寫實化：第一版外套是三個圓角方塊、帽子是飄著的半球、望遠鏡是兩根黑棍）
    const hangAt = (u, y) => { const grp = new THREE.Group(); grp.position.copy(at(u, y, hv - 0.075)); grp.rotation.y = C.yaw + Math.PI; g.add(grp); return grp }   // 區域座標：+z 朝屋裡、+y 朝上、原點＝掛鉤尖
    // 登山外套：用領口的掛繩掛在鉤子上——肩膀往下垂、下襬比較寬，身上一道道垂直的皺褶；兩隻袖子從肩膀垂到下襬兩側、袖口收束；
    // 帽兜塌在背後；布料是深綠色防潑水尼龍（細格紋）、前面一條拉鍊、胸前拉鍊口袋、兩個手插口袋、肩線和腰部的車縫線
    {
      const cloth = (x, w, h) => {
        x.fillStyle = '#2d5844'; x.fillRect(0, 0, w, h)
        const r = mulberry32(5)
        for (let i = 0; i < w; i += 6) { x.fillStyle = 'rgba(0,0,0,0.06)'; x.fillRect(i, 0, 1, h); x.fillRect(0, i, w, 1) }   // 細格紋（ripstop）
        for (let i = 0; i < 2600; i++) { const l = r() < 0.5 ? 0 : 255; x.fillStyle = `rgba(${l},${l},${l},0.035)`; x.fillRect(r() * w, r() * h, 2, 2) }
      }
      const plainT = canvasTex(256, 256, (x, w, h) => { cloth(x, w, h); x.strokeStyle = 'rgba(10,25,18,0.45)'; x.lineWidth = 2; x.beginPath(); x.moveTo(0, h * 0.5); x.lineTo(w, h * 0.5); x.stroke() })   // 袖子：素面＋一條車縫線
      const fabT = canvasTex(512, 512, (x, w, h) => {
        cloth(x, w, h)
        const seam = (x0, y0, x1, y1) => { x.strokeStyle = 'rgba(10,25,18,0.55)'; x.lineWidth = 2; x.beginPath(); x.moveTo(x0, y0); x.lineTo(x1, y1); x.stroke(); x.strokeStyle = 'rgba(120,160,135,0.25)'; x.lineWidth = 1; x.setLineDash([4, 3]); x.beginPath(); x.moveTo(x0, y0 + 3); x.lineTo(x1, y1 + 3); x.stroke(); x.setLineDash([]) }
        // u：0 背面中心 → 0.5 正面中心；v：0 下襬 → 1 領口（canvas 的 y 往下，所以 y = (1-v)*h）
        x.fillStyle = '#16211c'; x.fillRect(w * 0.5 - 4, 0, 8, h)                                   // 拉鍊布條
        for (let y = 0; y < h; y += 4) { x.fillStyle = '#4a4f4c'; x.fillRect(w * 0.5 - 2, y, 4, 2) }   // 拉鍊齒
        x.fillStyle = '#9aa09c'; x.fillRect(w * 0.5 - 4, h * 0.05, 8, 14)                           // 拉鍊頭
        seam(0, h * 0.2, w, h * 0.2)                                                                // 肩線（育克）
        seam(w * 0.3, h * 0.92, w * 0.7, h * 0.92)                                                  // 下襬收邊
        for (const cx of [w * 0.38, w * 0.62]) { x.fillStyle = '#1d2b24'; x.fillRect(cx - 34, h * 0.62, 68, 5); seam(cx - 40, h * 0.6, cx + 40, h * 0.6) }   // 手插口袋（拉鍊口）
        x.fillStyle = '#1d2b24'; x.fillRect(w * 0.56, h * 0.3, 4, 60)                              // 胸前直拉鍊口袋
        x.fillStyle = '#c6d0c9'; x.fillRect(w * 0.56 - 1, h * 0.3, 6, 8)
        x.fillStyle = '#1b2721'; x.fillRect(0, h * 0.94, w, h * 0.06)                               // 下襬的鬆緊帶
      })
      const fab = new THREE.MeshStandardMaterial({ map: fabT, roughness: 0.62, metalness: 0.02 }), fabP = new THREE.MeshStandardMaterial({ map: plainT, roughness: 0.62, metalness: 0.02 })
      const jk = hangAt(1.3, 1.79)
      // 身體：橢圓截面的筒，照高度改寬度（肩膀垂、下襬寬），再加垂直皺褶
      const Hh = 0.74, body = new THREE.CylinderGeometry(1, 1, 1, 48, 24, false, Math.PI, TAU).translate(0, 0.5, 0)
      const bp = body.attributes.position
      for (let i = 0; i < bp.count; i++) {
        const vx = bp.getX(i), vz = bp.getZ(i), t = bp.getY(i), th = Math.atan2(vx, vz)
        const wd = t > 0.74 ? THREE.MathUtils.lerp(0.212, 0.07, Math.pow((t - 0.74) / 0.26, 0.85)) : THREE.MathUtils.lerp(0.232, 0.212, t / 0.74)   // 半寬：肩膀從領口斜斜垂下來（掛鉤只勾住領口）
        const dp = (t > 0.74 ? THREE.MathUtils.lerp(0.058, 0.03, (t - 0.74) / 0.26) : 0.058) * (vz < 0 ? 0.55 : 1)   // 背面貼牆比較扁
        const fold = (Math.sin(th * 7 + 1.3) * 0.5 + Math.sin(th * 13 + t * 4) * 0.3) * 0.009 * (1 - t) + Math.sin(th * 5) * 0.004 * Math.sin(t * 9)
        bp.setXYZ(i, vx * (wd + fold * 0.4), t * Hh, vz * (dp + fold))
      }
      body.computeVertexNormals()
      const bm = new THREE.Mesh(body, fab); bm.position.y = -Hh - 0.035; jk.add(bm)
      // 袖子：從肩點往外下垂、慢慢收細，貼著身體兩側，袖口一圈黑色收邊
      for (const sg of [-1, 1]) {
        const pts = [V(sg * 0.15, -0.13, 0.015), V(sg * 0.235, -0.3, 0.05), V(sg * 0.25, -0.5, 0.06), V(sg * 0.24, -0.67, 0.058)]
        const cur = new THREE.CatmullRomCurve3(pts), sl = new THREE.TubeGeometry(cur, 20, 1, 14), sp = sl.attributes.position, c = new THREE.Vector3(), v = new THREE.Vector3()
        for (let k = 0; k < sp.count; k++) { const ti = Math.floor(k / 15) / 20; cur.getPointAt(Math.min(1, ti), c); v.fromBufferAttribute(sp, k).sub(c); const rr = THREE.MathUtils.lerp(0.052, 0.038, ti) * (1 + 0.08 * Math.sin(ti * 30 + k)); v.multiplyScalar(rr); v.z *= 0.75; sp.setXYZ(k, c.x + v.x, c.y + v.y, c.z + v.z) }
        sl.computeVertexNormals()
        const sm = new THREE.Mesh(sl, fabP); jk.add(sm)
        const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.041, 0.043, 0.04, 14).scale(1, 1, 0.75), new THREE.MeshStandardMaterial({ color: 0x1a2620, roughness: 0.8 })); cuff.position.copy(pts[3]).add(V(0, -0.015, 0)); jk.add(cuff)
      }
      // 帽兜塌在背後、領口兩側立起來一點；掛繩
      const hood = new THREE.Mesh(new THREE.SphereGeometry(0.12, 18, 12).scale(1, 0.7, 0.35), fabP); hood.position.set(0, -0.09, -0.04); jk.add(hood)
      const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.09, 0.06, 20, 1, true).scale(1, 1, 0.5), fabP.clone()); collar.material.side = THREE.DoubleSide; collar.position.set(0, -0.06, 0.005); jk.add(collar)
      const loop = new THREE.Mesh(new THREE.TorusGeometry(0.018, 0.003, 6, 12), new THREE.MeshStandardMaterial({ color: 0x15201a, roughness: 0.8 })); loop.position.set(0, -0.015, -0.005); jk.add(loop)
      jk.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true } })
    }
    // 毛帽：羅紋針織（直條紋＋一點毛絨）、反摺的帽緣、頂上一顆毛球；用毛球掛在鉤子上，整頂倒著垂下來
    {
      const knitT = canvasTex(256, 128, (x, w, h) => {
        x.fillStyle = '#b39a72'; x.fillRect(0, 0, w, h); const r = mulberry32(8)
        for (let i = 0; i < w; i += 8) { x.fillStyle = 'rgba(60,40,20,0.28)'; x.fillRect(i, 0, 3, h); x.fillStyle = 'rgba(255,240,210,0.12)'; x.fillRect(i + 4, 0, 2, h) }
        for (let i = 0; i < 1500; i++) { x.fillStyle = `rgba(${r() < 0.5 ? '255,245,220' : '60,40,20'},0.12)`; x.fillRect(r() * w, r() * h, 1, 3) }
      })
      knitT.wrapS = knitT.wrapT = THREE.RepeatWrapping; knitT.repeat.set(3, 1)
      const knit = new THREE.MeshStandardMaterial({ map: knitT, roughness: 1 })
      const hat = hangAt(1.9, 1.79)
      const pts = []; for (let k = 0; k <= 14; k++) { const t = k / 14, a = t * Math.PI / 2; pts.push(new THREE.Vector2(0.095 * Math.cos(a) * (1 + 0.04 * Math.sin(t * 20)), 0.13 * Math.sin(a))) }
      const crown = new THREE.Mesh(new THREE.LatheGeometry(pts.reverse(), 28), knit); crown.material.side = THREE.DoubleSide
      const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.099, 0.099, 0.05, 28, 1, true), knit)
      const pom = new THREE.Mesh(new THREE.SphereGeometry(0.04, 20, 14), new THREE.MeshStandardMaterial({ color: 0xe9e1d1, roughness: 1 }))
      const pp = pom.geometry.attributes.position; for (let i = 0; i < pp.count; i++) { const x0 = pp.getX(i), y0 = pp.getY(i), z0 = pp.getZ(i), k = 1 + 0.07 * Math.sin(x0 * 260) * Math.sin(y0 * 230 + 1) * Math.sin(z0 * 250 + 2); pp.setXYZ(i, x0 * k, y0 * k, z0 * k) } pom.geometry.computeVertexNormals()   // 毛球表面一點點凹凸（用位置算，接縫兩邊的頂點移一樣多，不會裂開）
      const inner = new THREE.Group(); inner.add(crown, cuff, pom); crown.position.y = 0.0; cuff.position.y = 0.0; pom.position.y = 0.155
      inner.position.set(0, -0.19, 0.03); inner.rotation.z = 0.12; inner.scale.set(1, 1, 0.7); hat.add(inner)   // 毛球勾在鉤子上（跟戴著一樣：毛球在上、開口朝下），被牆壓扁一點
      hat.traverse((m) => { if (m.isMesh) m.castShadow = true })
    }
    // 望遠鏡（8×42 屋脊式）：兩支橡膠包覆的鏡筒、中間連接橋、調焦輪、眼罩；吊帶掛在鉤子上，物鏡朝下垂著
    {
      const rub = new THREE.MeshStandardMaterial({ color: 0x24302a, roughness: 0.85 }), blk = new THREE.MeshStandardMaterial({ color: 0x0c0d0e, roughness: 0.5, metalness: 0.3 })
      const lensM = new THREE.MeshStandardMaterial({ color: 0x22304a, roughness: 0.05, metalness: 0.6 })
      const bin = hangAt(1.6, 1.79), body = new THREE.Group(); body.position.set(0, -0.24, 0.035); body.rotation.z = 0.05; bin.add(body)
      for (const sg of [-1, 1]) {
        const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.027, 0.029, 0.13, 24), rub); barrel.position.set(sg * 0.032, 0, 0); body.add(barrel)
        const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.0285, 0.0285, 0.05, 24), new THREE.MeshStandardMaterial({ color: 0x1b211e, roughness: 0.95 })); grip.position.set(sg * 0.032, -0.01, 0); body.add(grip)
        const obj = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.012, 24), blk); obj.position.set(sg * 0.032, -0.071, 0); body.add(obj)
        const glass = new THREE.Mesh(new THREE.CircleGeometry(0.024, 24).rotateX(Math.PI / 2), lensM); glass.position.set(sg * 0.032, -0.0775, 0); body.add(glass)
        const eye = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.022, 0.03, 20), blk); eye.position.set(sg * 0.03, 0.08, 0); body.add(eye)
        const lug = new THREE.Mesh(new THREE.TorusGeometry(0.006, 0.002, 6, 10), blk); lug.position.set(sg * 0.058, 0.055, 0); lug.rotation.y = Math.PI / 2; body.add(lug)
      }
      const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.05, 0.022), rub); bridge.position.y = 0.04; body.add(bridge)
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.026, 16).rotateZ(Math.PI / 2), blk); wheel.position.set(0, 0.062, 0.006); body.add(wheel)
      // 吊帶：從兩邊的吊耳往上收到鉤子
      const strapM = new THREE.MeshStandardMaterial({ color: 0x15181a, roughness: 0.9 })
      for (const sg of [-1, 1]) { const cur = new THREE.CatmullRomCurve3([V(sg * 0.058, -0.185, 0.035), V(sg * 0.045, -0.1, 0.02), V(sg * 0.012, -0.02, 0.005), V(0, 0, 0)]); const st = new THREE.TubeGeometry(cur, 10, 0.004, 4); st.scale(1, 1, 0.4); bin.add(new THREE.Mesh(st, strapM)) }
      bin.traverse((m) => { if (m.isMesh) m.castShadow = true })
    }
    for (let row = 0; row < 3; row++) for (let k = 0; k < 4 - row; k++) logUV('log', SU + 0.55, 0.1 + row * 0.14, SV - 0.25 + k * 0.15 + row * 0.075, SU + 0.95, 0.1 + row * 0.14, SV - 0.25 + k * 0.15 + row * 0.075, 0.065)   // 柴
    rbox('pack', 0.34, 0.55, 0.22, W / 2 - 1.2, 0.3, -D / 2 + 2.85, 0.07, 0.3, -0.12); rbox('pack2', 0.24, 0.2, 0.08, W / 2 - 1.2, 0.22, -D / 2 + 2.98, 0.04, 0.3, -0.12)   // 背包＋前袋
        mats.pack = new THREE.MeshStandardMaterial({ color: 0xc0581f, roughness: 0.8 }); mats.pack2 = new THREE.MeshStandardMaterial({ color: 0x3a3c40, roughness: 0.8 })
  }

  // 碰撞：牆一圈小圓（門口留空）；床、爐子、桌子
  const wallCol = (ax, az, bx, bz, skip) => { const n = Math.ceil(Math.hypot(bx - ax, bz - az) / 0.3); for (let i = 0; i <= n; i++) { const t = i / n, u = ax + (bx - ax) * t, v = az + (bz - az) * t; if (skip && skip(u, v)) continue; const p = at(u, 0, v); addCollider(p.x, p.z, 0.12, Y + WH + 2) } }
  wallCol(-W / 2, D / 2, W / 2, D / 2, (u) => Math.abs(u) < DOOR / 2 + 0.12)
  wallCol(-W / 2, -D / 2, W / 2, -D / 2); wallCol(-W / 2, -D / 2, -W / 2, D / 2); wallCol(W / 2, -D / 2, W / 2, D / 2)
  for (const [u, v, r] of [[W / 2 - 0.55, -D / 2 + 1.2, 0.5], [W / 2 - 0.55, -D / 2 + 2.2, 0.5], [SU, SV, 0.4], [DK - 0.4, -D / 2 + 0.45, 0.45], [DK + 0.4, -D / 2 + 0.45, 0.45], [0.3, -D / 2 + 0.95, 0.45], [W / 2 - 1.17, -D / 2 + 2.32, 0.25]]) { const p = at(u, 0, v); addCollider(p.x, p.z, r, Y + 2) }

  /* ---------- 步道終點：三角點＋石堆（2026-11-08 拿掉觀景台） ---------- */
  {
    const E = ALP_TRAIL[ALP_TRAIL.length - 1], P = ALP_TRAIL[ALP_TRAIL.length - 2], dx = E[0] - P[0], dz = E[1] - P[1], L = Math.hypot(dx, dz), f = V(dx / L, 0, dz / L), r = V(f.z, 0, -f.x)
    const o = (a, b) => V(E[0], 0, E[1]).addScaledVector(r, a).addScaledVector(f, b)
    // 三角點：花崗岩方柱（刻十字）＋旁邊一堆石頭，在步道終點前方一點
    const tp = o(-1.2, 1.6), ty = alpineHeight(tp.x, tp.z)
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
