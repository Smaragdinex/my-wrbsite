// 所有貼圖都用 canvas 現場畫，不依賴外部圖檔
import * as THREE from 'three'
import { mulberry32 } from './noise.js'

function canvas(w, h) {
  const c = document.createElement('canvas')
  c.width = w; c.height = h
  return [c, c.getContext('2d')]
}
function toTex(c, { repeat = false, srgb = true } = {}) {
  const t = new THREE.CanvasTexture(c)
  if (srgb) t.colorSpace = THREE.SRGBColorSpace
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.anisotropy = 8
  return t
}
const hsl = (h, s, l, a = 1) => `hsla(${h},${s}%,${l}%,${a})`

// 溫室鋼構：菱形格（透明底，白線）
export function domeGridTex() {
  const S = 256
  const [c, g] = canvas(S, S)
  g.strokeStyle = '#fff'
  g.lineWidth = 9
  g.lineCap = 'square'
  for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) {
    g.beginPath(); g.moveTo(ox, oy); g.lineTo(ox + S, oy + S); g.stroke()
    g.beginPath(); g.moveTo(ox + S, oy); g.lineTo(ox, oy + S); g.stroke()
  }
  g.lineWidth = 4
  g.beginPath(); g.moveTo(0, S / 2); g.lineTo(S, S / 2); g.stroke()
  const t = toTex(c, { repeat: true })
  return t
}

export function grassGroundTex() {
  const S = 512, rnd = mulberry32(11)
  const [c, g] = canvas(S, S)
  g.fillStyle = '#5c7d36'; g.fillRect(0, 0, S, S)
  for (let i = 0; i < 9000; i++) {
    const x = rnd() * S, y = rnd() * S
    g.strokeStyle = hsl(80 + rnd() * 30, 35 + rnd() * 25, 22 + rnd() * 28, 0.7)
    g.lineWidth = 1 + rnd()
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + (rnd() - 0.5) * 4, y - 3 - rnd() * 6); g.stroke()
  }
  for (let i = 0; i < 400; i++) {
    g.fillStyle = hsl(30, 30, 25 + rnd() * 15, 0.35)
    g.beginPath(); g.arc(rnd() * S, rnd() * S, 1 + rnd() * 4, 0, TAU); g.fill()
  }
  return toTex(c, { repeat: true })
}
const TAU = Math.PI * 2

export function paverTex() {
  const S = 512, rnd = mulberry32(5)
  const [c, g] = canvas(S, S)
  g.fillStyle = '#8a8170'; g.fillRect(0, 0, S, S)
  const rows = 8, rh = S / rows
  for (let r = 0; r < rows; r++) {
    let x = r % 2 ? -rh * 0.6 : 0
    while (x < S) {
      const w = rh * (1.1 + rnd() * 0.9)
      const l = 62 + rnd() * 14
      g.fillStyle = hsl(36 + rnd() * 10, 14 + rnd() * 10, l)
      g.fillRect(x + 3, r * rh + 3, w - 6, rh - 6)
      for (let k = 0; k < 30; k++) {
        g.fillStyle = hsl(30, 10, l - 10 + rnd() * 20, 0.25)
        g.fillRect(x + 3 + rnd() * (w - 8), r * rh + 3 + rnd() * (rh - 8), 2, 2)
      }
      x += w
    }
  }
  return toTex(c, { repeat: true })
}

export function gratingTex() {
  const S = 256
  const [c, g] = canvas(S, S)
  g.fillStyle = '#b9bcbc'; g.fillRect(0, 0, S, S)
  g.strokeStyle = '#7e8384'; g.lineWidth = 3
  for (let i = 0; i <= S; i += 16) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, S); g.stroke() }
  g.lineWidth = 2
  for (let i = 0; i <= S; i += 64) { g.beginPath(); g.moveTo(0, i); g.lineTo(S, i); g.stroke() }
  return toTex(c, { repeat: true })
}

// 空中步道木棧板：u 橫跨整個步道寬（0～1，兩側是不鏽鋼收邊），v 沿步道每格 2 公尺
export function woodDeckTex() {
  const W = 512, H = 512, rnd = mulberry32(17)
  const [c, g] = canvas(W, H)
  const planks = 14, ph = H / planks
  for (let i = 0; i < planks; i++) {
    const l = 40 + rnd() * 12, h = 26 + rnd() * 8
    g.fillStyle = hsl(h, 24 + rnd() * 10, l); g.fillRect(0, i * ph, W, ph)
    // 木紋：沿板子長向的細線
    for (let k = 0; k < 26; k++) {
      g.strokeStyle = hsl(h - 4, 40, l - 8 - rnd() * 10, 0.35)
      g.lineWidth = 0.6 + rnd() * 1.2
      const y = i * ph + rnd() * ph
      g.beginPath(); g.moveTo(0, y)
      for (let x = 0; x <= W; x += 32) g.lineTo(x, y + Math.sin(x * 0.02 + k) * 1.5 + (rnd() - 0.5))
      g.stroke()
    }
    // 板縫
    g.fillStyle = 'rgba(25,18,12,0.85)'; g.fillRect(0, i * ph, W, 2.5)
    // 螺絲
    g.fillStyle = 'rgba(60,60,60,0.8)'
    for (const x of [W * 0.12, W * 0.5, W * 0.88]) { g.beginPath(); g.arc(x, i * ph + ph / 2, 2.2, 0, TAU); g.fill() }
  }
  // 兩側不鏽鋼收邊
  const eg = g.createLinearGradient(0, 0, W * 0.05, 0)
  eg.addColorStop(0, '#8d9596'); eg.addColorStop(0.8, '#c7cdcd'); eg.addColorStop(1, '#6f7677')
  g.fillStyle = eg; g.fillRect(0, 0, W * 0.05, H)
  g.save(); g.translate(W, 0); g.scale(-1, 1); g.fillStyle = eg; g.fillRect(0, 0, W * 0.05, H); g.restore()
  return toTex(c, { repeat: true })
}

export function rockTex() {
  const S = 512, rnd = mulberry32(3)
  const [c, g] = canvas(S, S)
  g.fillStyle = '#9a958c'; g.fillRect(0, 0, S, S)
  for (let i = 0; i < 2600; i++) {
    const r = 2 + rnd() * 18
    g.fillStyle = hsl(35, 6 + rnd() * 8, 35 + rnd() * 45, 0.22)
    g.beginPath(); g.ellipse(rnd() * S, rnd() * S, r, r * (0.4 + rnd() * 0.6), rnd() * 3, 0, TAU); g.fill()
  }
  g.strokeStyle = 'rgba(40,36,30,0.35)'
  for (let i = 0; i < 60; i++) {
    g.lineWidth = 1 + rnd() * 2
    let x = rnd() * S, y = rnd() * S
    g.beginPath(); g.moveTo(x, y)
    for (let k = 0; k < 6; k++) { x += (rnd() - 0.5) * 40; y += rnd() * 30; g.lineTo(x, y) }
    g.stroke()
  }
  return toTex(c, { repeat: true })
}

export function barkTex(hue = 28) {
  const W = 128, H = 256, rnd = mulberry32(hue)
  const [c, g] = canvas(W, H)
  g.fillStyle = hsl(hue, 22, 30); g.fillRect(0, 0, W, H)
  for (let i = 0; i < 220; i++) {
    g.strokeStyle = hsl(hue, 18 + rnd() * 10, 18 + rnd() * 30, 0.6)
    g.lineWidth = 1 + rnd() * 3
    const x = rnd() * W
    g.beginPath(); g.moveTo(x, 0); g.bezierCurveTo(x + 6, H * 0.3, x - 6, H * 0.6, x + (rnd() - 0.5) * 8, H); g.stroke()
  }
  return toTex(c, { repeat: true })
}

export function palmTrunkTex() {
  const W = 128, H = 256, rnd = mulberry32(8)
  const [c, g] = canvas(W, H)
  g.fillStyle = '#7a6a52'; g.fillRect(0, 0, W, H)
  for (let y = 0; y < H; y += 12) {
    g.fillStyle = hsl(32, 18, 30 + rnd() * 10)
    g.fillRect(0, y, W, 4)
    g.fillStyle = hsl(36, 20, 55 + rnd() * 10, 0.5)
    g.fillRect(0, y + 5, W, 3)
  }
  return toTex(c, { repeat: true })
}

// 一叢葉子（給樹冠、灌木的十字面片）
export function leafClusterTex(seed = 1, hue = 100) {
  const S = 256, rnd = mulberry32(seed)
  const [c, g] = canvas(S, S)
  for (let i = 0; i < 110; i++) {
    const a = rnd() * TAU, d = Math.sqrt(rnd()) * S * 0.36
    const x = S / 2 + Math.cos(a) * d, y = S / 2 + Math.sin(a) * d
    const L = 16 + rnd() * 18
    g.save(); g.translate(x, y); g.rotate(rnd() * TAU)
    g.fillStyle = hsl(hue + (rnd() - 0.5) * 30, 40 + rnd() * 25, 22 + rnd() * 26)
    g.beginPath(); g.ellipse(0, 0, L, L * 0.42, 0, 0, TAU); g.fill()
    g.strokeStyle = 'rgba(20,40,10,0.35)'; g.lineWidth = 1
    g.beginPath(); g.moveTo(-L, 0); g.lineTo(L, 0); g.stroke()
    g.restore()
  }
  return toTex(c)
}

// 羽狀葉：v=0 是葉柄，往上到葉尖
function pinnate(W, H, seed, { hue, len, angle, gap, thin }) {
  const rnd = mulberry32(seed)
  const [c, g] = canvas(W, H)
  const cx = W / 2
  g.strokeStyle = hsl(hue - 10, 35, 28); g.lineWidth = 4
  g.beginPath(); g.moveTo(cx, H); g.lineTo(cx, 6); g.stroke()
  for (let y = H - 30; y > 10; y -= gap) {
    const t = 1 - y / H                          // 0 底 → 1 頂
    const L = len * Math.sin(Math.min(1, t * 1.25) * Math.PI) * (0.85 + rnd() * 0.3) + 6
    for (const side of [-1, 1]) {
      g.save(); g.translate(cx, y); g.rotate(side * angle)
      g.fillStyle = hsl(hue + (rnd() - 0.5) * 14, 45 + rnd() * 15, 26 + t * 14 + rnd() * 8)
      g.beginPath(); g.ellipse(side * L / 2, 0, L / 2, thin * (0.7 + 0.3 * Math.sin(t * Math.PI)), 0, 0, TAU); g.fill()
      g.restore()
    }
  }
  return toTex(c)
}
export const fernTex = () => pinnate(128, 512, 21, { hue: 105, len: 60, angle: -1.1, gap: 11, thin: 7 })
export const palmTex = () => pinnate(128, 512, 22, { hue: 95, len: 62, angle: -0.55, gap: 7, thin: 3.2 })

// 大葉（姑婆芋類）：下半段是葉柄
export function bigLeafTex() {
  const W = 256, H = 512
  const [c, g] = canvas(W, H)
  const cx = W / 2
  g.strokeStyle = '#5d7a2e'; g.lineWidth = 9
  g.beginPath(); g.moveTo(cx, H); g.lineTo(cx, H * 0.55); g.stroke()
  const top = 12, bot = H * 0.62
  const grad = g.createLinearGradient(0, top, W, bot)
  grad.addColorStop(0, '#3f7a24'); grad.addColorStop(1, '#2a5a1a')
  g.fillStyle = grad
  g.beginPath()
  g.moveTo(cx, top)
  g.bezierCurveTo(W * 1.02, top + 60, W * 0.98, bot - 40, cx + 18, bot)
  g.lineTo(cx, bot - 30)
  g.lineTo(cx - 18, bot)
  g.bezierCurveTo(-W * 0.02, bot - 40, -W * 0.02, top + 60, cx, top)
  g.fill()
  g.strokeStyle = 'rgba(190,220,140,0.55)'; g.lineWidth = 3
  g.beginPath(); g.moveTo(cx, bot - 25); g.lineTo(cx, top + 8); g.stroke()
  g.lineWidth = 1.5
  for (let i = 1; i < 9; i++) {
    const y = bot - 30 - i * ((bot - top - 40) / 9)
    for (const s of [-1, 1]) {
      g.beginPath(); g.moveTo(cx, y); g.quadraticCurveTo(cx + s * 50, y - 6, cx + s * 100 * Math.sin((i / 9) * Math.PI * 0.9 + 0.3), y - 30); g.stroke()
    }
  }
  return toTex(c)
}

// 鳳梨科：中心紅、葉尖綠的帶狀葉
export function bromeliadTex() {
  const W = 64, H = 256
  const [c, g] = canvas(W, H)
  const grad = g.createLinearGradient(0, H, 0, 0)
  grad.addColorStop(0, '#c0283a'); grad.addColorStop(0.45, '#d8475a'); grad.addColorStop(0.7, '#5b8a2c'); grad.addColorStop(1, '#3d6b1f')
  g.fillStyle = grad
  g.beginPath(); g.moveTo(W * 0.15, H); g.quadraticCurveTo(W * 0.05, H * 0.3, W / 2, 0); g.quadraticCurveTo(W * 0.95, H * 0.3, W * 0.85, H); g.fill()
  return toTex(c)
}

export function grassTuftTex() {
  const S = 128, rnd = mulberry32(31)
  const [c, g] = canvas(S, S)
  for (let i = 0; i < 26; i++) {
    const x = 10 + rnd() * (S - 20), h = S * (0.5 + rnd() * 0.5), bend = (rnd() - 0.5) * 40
    g.fillStyle = hsl(85 + rnd() * 25, 40 + rnd() * 20, 26 + rnd() * 22)
    g.beginPath(); g.moveTo(x - 3, S); g.quadraticCurveTo(x + bend * 0.3, S - h * 0.5, x + bend, S - h); g.quadraticCurveTo(x + bend * 0.3 + 2, S - h * 0.5, x + 3, S); g.fill()
  }
  return toTex(c)
}

export function vineTex() {
  const W = 64, H = 512, rnd = mulberry32(41)
  const [c, g] = canvas(W, H)
  g.strokeStyle = '#4a5a24'; g.lineWidth = 2
  g.beginPath(); g.moveTo(W / 2, 0)
  for (let y = 0; y <= H; y += 32) g.lineTo(W / 2 + Math.sin(y * 0.05) * 6, y)
  g.stroke()
  for (let y = 8; y < H; y += 14) {
    const s = rnd() < 0.5 ? -1 : 1
    g.save(); g.translate(W / 2 + Math.sin(y * 0.05) * 6, y); g.rotate(s * (0.6 + rnd() * 0.5))
    g.fillStyle = hsl(95 + rnd() * 20, 45, 25 + rnd() * 18)
    g.beginPath(); g.ellipse(s * 10, 0, 11, 5, 0, 0, TAU); g.fill()
    g.restore()
  }
  return toTex(c)
}

export function softDotTex() {
  const S = 128
  const [c, g] = canvas(S, S)
  const grad = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2)
  grad.addColorStop(0, 'rgba(255,255,255,1)')
  grad.addColorStop(0.4, 'rgba(255,255,255,0.5)')
  grad.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = grad; g.fillRect(0, 0, S, S)
  return toTex(c)
}

export function waterfallTex() {
  const W = 256, H = 512, rnd = mulberry32(51)
  const [c, g] = canvas(W, H)
  g.fillStyle = 'rgba(200,228,238,0.18)'; g.fillRect(0, 0, W, H)
  // 寬而淡的水幕
  for (let i = 0; i < 40; i++) {
    const x = rnd() * W, w = 6 + rnd() * 20
    const grad = g.createLinearGradient(x - w, 0, x + w, 0)
    grad.addColorStop(0, 'rgba(255,255,255,0)'); grad.addColorStop(0.5, `rgba(240,250,255,${0.15 + rnd() * 0.25})`); grad.addColorStop(1, 'rgba(255,255,255,0)')
    g.fillStyle = grad; g.fillRect(x - w, 0, w * 2, H)
  }
  // 細水絲，上下繞回接得起來
  for (let i = 0; i < 700; i++) {
    const x = rnd() * W, y = rnd() * H, len = 40 + rnd() * 260
    g.strokeStyle = `rgba(255,255,255,${0.2 + rnd() * 0.65})`
    g.lineWidth = 0.6 + rnd() * 1.6
    for (const oy of [0, -H]) { g.beginPath(); g.moveTo(x, y + oy); g.lineTo(x + (rnd() - 0.5) * 2, y + oy + len); g.stroke() }
  }
  return toTex(c, { repeat: true })
}

// 水面法線貼圖（由雜訊高度場推出來）
export function waterNormalTex() {
  const S = 256, rnd = mulberry32(61)
  const waves = []
  for (let i = 0; i < 14; i++) waves.push({ kx: Math.round((rnd() - 0.5) * 12), ky: Math.round((rnd() - 0.5) * 12), p: rnd() * TAU, a: 0.5 + rnd() })
  const h = (x, y) => waves.reduce((s, w) => s + w.a * Math.sin((w.kx * x + w.ky * y) * TAU / S + w.p), 0)
  const data = new Uint8Array(S * S * 4)
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const dx = h(x + 1, y) - h(x - 1, y), dy = h(x, y + 1) - h(x, y - 1)
    const n = new THREE.Vector3(-dx * 0.6, -dy * 0.6, 1).normalize()
    const k = (y * S + x) * 4
    data[k] = (n.x * 0.5 + 0.5) * 255; data[k + 1] = (n.y * 0.5 + 0.5) * 255; data[k + 2] = (n.z * 0.5 + 0.5) * 255; data[k + 3] = 255
  }
  const t = new THREE.DataTexture(data, S, S)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.generateMipmaps = true
  t.minFilter = THREE.LinearMipmapLinearFilter
  t.needsUpdate = true
  return t
}

// 花瓣：白色（實際顏色由每朵花的 instance color 乘上去），基部窄、尖端圓、邊緣柔、中間一條條淡淡的脈紋，
// 基部稍暗、尖端稍亮；透明度給 alphaTest 切邊。shape：0 細長（雛菊）、1 寬圓（波斯菊、長春花）
export function petalTex(shape = 0) {
  const W = 64, H = 128, [c, x] = canvas(W, H)
  const img = x.createImageData(W, H), d = img.data
  for (let j = 0; j < H; j++) {
    const t = j / (H - 1)                                     // 0 基部 → 1 尖端
    const half = shape ? Math.sin(Math.PI * Math.min(1, t * 1.1)) ** 0.6 * (0.2 + 0.8 * Math.min(1, t * 2.2)) * 0.48
      : (0.12 + 0.88 * Math.min(1, t * 3.5)) * (1 - Math.max(0, t - 0.82) / 0.18 * 0.65) * 0.36
    for (let i = 0; i < W; i++) {
      const u = (i + 0.5) / W - 0.5, k = (j * W + i) * 4
      const edge = half - Math.abs(u)
      const a = Math.max(0, Math.min(1, edge * 40)) * (t < 0.985 ? 1 : 0)
      const vein = 0.93 + 0.07 * Math.cos(u / Math.max(half, 0.01) * Math.PI * (shape ? 7 : 3))
      const v = (0.72 + 0.28 * Math.min(1, t * 1.6)) * vein * (1 - 0.12 * Math.abs(u) / Math.max(half, 0.01))
      d[k] = d[k + 1] = d[k + 2] = Math.round(255 * Math.min(1, v)); d[k + 3] = Math.round(255 * a)
    }
  }
  x.putImageData(img, 0, 0)
  return toTex(c)
}
// 葉片：披針形、中脈和側脈、邊緣稍暗
export function leafBladeTex() {
  const W = 64, H = 128, [c, x] = canvas(W, H)
  const img = x.createImageData(W, H), d = img.data
  for (let j = 0; j < H; j++) {
    const t = j / (H - 1), half = Math.sin(Math.PI * t) ** 0.8 * 0.46 * (1 - 0.3 * t)
    for (let i = 0; i < W; i++) {
      const u = (i + 0.5) / W - 0.5, k = (j * W + i) * 4, au = Math.abs(u)
      const a = Math.max(0, Math.min(1, (half - au) * 40))
      const mid = Math.exp(-((u / 0.03) ** 2)) * 0.25
      const side = Math.max(0, Math.cos((t * 9 - au / Math.max(half, 0.01) * 1.5) * Math.PI * 2)) ** 6 * 0.08
      const v = 0.78 + mid + side - 0.18 * (au / Math.max(half, 0.01)) ** 2
      d[k] = Math.round(70 * v); d[k + 1] = Math.round(122 * v); d[k + 2] = Math.round(44 * v); d[k + 3] = Math.round(255 * a)
    }
  }
  x.putImageData(img, 0, 0)
  return toTex(c)
}

// 水霧雜訊：可以無縫重複的分形雜訊（格點在邊界繞回去），水霧方片拿來捲動取樣，做出一絲一絲的霧
export function mistNoiseTex() {
  const S = 256, [c, g] = canvas(S, S), img = g.createImageData(S, S), d = img.data
  const rnd = mulberry32(91), lat = {}
  const L = (p, i, j) => { const k = p + ':' + ((i % p) + p) % p + ',' + ((j % p) + p) % p; return lat[k] ??= rnd() }
  const val = (x, y, p) => {
    const i = Math.floor(x), j = Math.floor(y), u = x - i, v = y - j
    const su = u * u * (3 - 2 * u), sv = v * v * (3 - 2 * v)
    return (L(p, i, j) * (1 - su) + L(p, i + 1, j) * su) * (1 - sv) + (L(p, i, j + 1) * (1 - su) + L(p, i + 1, j + 1) * su) * sv
  }
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    let n = 0, a = 0.5, tot = 0
    for (const p of [4, 8, 16, 32, 64]) { n += val(x / S * p, y / S * p, p) * a; tot += a; a *= 0.55 }
    n /= tot
    const v = Math.round(255 * Math.min(1, Math.max(0, (n - 0.2) / 0.6))), k = (y * S + x) * 4
    d[k] = d[k + 1] = d[k + 2] = v; d[k + 3] = 255
  }
  g.putImageData(img, 0, 0)
  const t = toTex(c, { repeat: true, srgb: false })
  return t
}

