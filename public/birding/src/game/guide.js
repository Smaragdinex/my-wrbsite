// 鳥類圖鑑：沒有其他東西可以互動時按 E 打開。是一本 3D 的書：從畫面下方升上來、翻開封面、鏡頭拉近到一個跨頁填滿畫面。
// 左頁是介紹（文字畫在 canvas 上），右頁是那隻鳥：真的模型放在一個小場景裡走動、轉頭（placeAnimal，跟溫室裡同一套動作），
// 每格畫到一張貼圖，再像插圖一樣疊在紙上（只疊鳥和影子，背景是紙）。
// 翻頁：→ / D / 點右半邊 / 滾輪往下 = 下一頁，← / A / 點左半邊 = 上一頁；翻的那張紙沿書脊轉過去、外緣慢一點，看起來會彎。
// E、Esc、左上角 X 關閉（書闔起來沉下去）。
// 還沒拍到的鳥：右頁是剪影，左頁只寫名字和在哪裡，介紹要拍到才解鎖。第一個跨頁是目錄和收集進度。
import * as THREE from 'three'
import { BIRDS } from '../birdinfo.js'
import { placeAnimal } from '../birds.js'
import { VALUE } from './scoring.js'
import { RARITY } from './judge.js'
import { t as tr, LANG, FONT_SANS, FONT_SERIF } from '../i18n.js'

const PW = 1, PH = 1.32                 // 一頁的寬、高（書的單位）
const CW = 900, CH = Math.round(CW * PH) // 頁面 canvas 的像素
const PLATE = { x: 0.09, y: 0.24, w: 0.82, h: 0.66 }   // 右頁插圖的範圍（uv，y 往上）
const SERIF = FONT_SERIF
const SANS = FONT_SANS
const INK = '#2d2a24', MUTED = '#7b7262', ACCENT = '#5b6e3c'
const ease = (t) => t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2
const clamp01 = (v) => Math.min(1, Math.max(0, v))

// 頁面材質：紙（canvas）上面疊插圖（小場景的貼圖，鳥和影子已經乘過 alpha），shade 是翻頁時的明暗，flip 給紙的背面用
const PAGE_VS = `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`
const PAGE_FS = `
  varying vec2 vUv;
  uniform sampler2D map; uniform sampler2D plate; uniform float hasPlate; uniform vec4 rect; uniform float shade; uniform float flip;
  // 插圖畫到貼圖時還沒 tone mapping：這裡用 three.js 內建、跟遊戲畫面一樣的 ACES（toneMappingExposure 跟著遊戲）
  void main() {
    vec2 uv = vec2(flip > 0.5 ? 1.0 - vUv.x : vUv.x, vUv.y);
    vec3 c = texture2D(map, uv).rgb;
    if (hasPlate > 0.5) {
      vec2 q = (uv - rect.xy) / rect.zw;
      if (q.x > 0.0 && q.y > 0.0 && q.x < 1.0 && q.y < 1.0) {
        vec4 p = texture2D(plate, q);
        // 插圖邊緣淡出（像水彩暈開），不會有一條硬邊
        float e = smoothstep(0.0, 0.05, min(min(q.x, 1.0 - q.x), min(q.y, 1.0 - q.y)));
        c = c * (1.0 - p.a * e) + ACESFilmicToneMapping(p.rgb) * e;
      }
    }
    gl_FragColor = vec4(c * shade, 1.0);
    #include <colorspace_fragment>
  }`
function pageMat(map, flip = 0) {
  return new THREE.ShaderMaterial({
    vertexShader: PAGE_VS, fragmentShader: PAGE_FS,
    uniforms: { map: { value: map }, plate: { value: null }, hasPlate: { value: 0 }, rect: { value: new THREE.Vector4(PLATE.x, PLATE.y, PLATE.w, PLATE.h) }, shade: { value: 1 }, flip: { value: flip } },
  })
}

/* ---------- 紙和字 ---------- */
let paperCache = null
function paper(ctx, side) {
  // 米色紙＋一點纖維雜點；靠書脊那邊暗一點（書頁往中間凹）
  if (!paperCache) {
    const c = document.createElement('canvas'); c.width = CW; c.height = CH
    const g = c.getContext('2d')
    g.fillStyle = '#f2e9d4'; g.fillRect(0, 0, CW, CH)
    const img = g.getImageData(0, 0, CW, CH), d = img.data
    for (let i = 0; i < d.length; i += 4) { const n = (Math.random() - 0.5) * 9; d[i] += n; d[i + 1] += n; d[i + 2] += n * 0.8 }
    g.putImageData(img, 0, 0)
    for (let i = 0; i < 260; i++) {   // 纖維
      g.strokeStyle = `rgba(120,100,70,${Math.random() * 0.05})`; g.lineWidth = 1
      const x = Math.random() * CW, y = Math.random() * CH, a = Math.random() * 6.28, l = 6 + Math.random() * 18
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke()
    }
    paperCache = c
  }
  ctx.drawImage(paperCache, 0, 0)
  const sx = side === 'L' ? CW : 0, gr = ctx.createLinearGradient(sx, 0, side === 'L' ? CW - 140 : 140, 0)
  gr.addColorStop(0, 'rgba(70,50,25,0.22)'); gr.addColorStop(1, 'rgba(70,50,25,0)')
  ctx.fillStyle = gr; ctx.fillRect(0, 0, CW, CH)
  const ox = side === 'L' ? 0 : CW, go = ctx.createLinearGradient(ox, 0, side === 'L' ? 40 : CW - 40, 0)
  go.addColorStop(0, 'rgba(70,50,25,0.10)'); go.addColorStop(1, 'rgba(70,50,25,0)')
  ctx.fillStyle = go; ctx.fillRect(0, 0, CW, CH)
}
// 中文一個字一個字換行（英文單字不拆）
function wrap(ctx, text, w) {
  const lines = []
  for (const para of String(text).split('\n')) {
    let line = ''
    for (const tok of para.match(/[A-Za-z0-9'’.,()-]+\s?|./gu) ?? []) {
      if (ctx.measureText(line + tok).width > w && line) { lines.push(line); line = tok.trimStart() } else line += tok
    }
    lines.push(line)
  }
  return lines
}
function canvasTex(draw) {
  const c = document.createElement('canvas'); c.width = CW; c.height = CH
  draw(c.getContext('2d'))
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8
  return t
}
const pageNo = (ctx, n, side) => { ctx.font = `26px ${SERIF}`; ctx.fillStyle = MUTED; ctx.textAlign = side === 'L' ? 'left' : 'right'; ctx.fillText(String(n), side === 'L' ? 70 : CW - 70, CH - 56); ctx.textAlign = 'left' }
function stamp(ctx, text, x, y, color) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(-0.12)
  ctx.font = `bold 30px ${SANS}`; const w = ctx.measureText(text).width + 34
  ctx.strokeStyle = color; ctx.lineWidth = 3; ctx.globalAlpha = 0.8
  ctx.strokeRect(-w / 2, -26, w, 52); ctx.fillStyle = color; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, 0, 1)
  ctx.restore()
}

function birdLeft(b, i, rec) {
  return canvasTex((ctx) => {
    paper(ctx, 'L')
    const X = 86, W = CW - 2 * X - 20
    let y = 120
    ctx.fillStyle = MUTED; ctx.font = `26px ${SERIF}`; ctx.fillText(`No. ${String(i + 1).padStart(2, '0')}`, X, y)
    if (rec) stamp(ctx, tr('已記錄'), CW - 190, 118, '#a8442f')
    y += 84
    ctx.fillStyle = INK; ctx.font = `bold 72px ${SERIF}`; ctx.fillText(rec ? b.name : '？？？', X, y, W)   // 沒拍到：名字跟目錄一樣先藏起來，只給在哪裡
    if (b.nick && rec && ctx.measureText(b.name).width < W * 0.6) { const w = ctx.measureText(b.name).width; ctx.font = `34px ${SERIF}`; ctx.fillStyle = MUTED; ctx.fillText(`（${b.nick}）`, X + w + 8, y - 6) }
    y += 50
    ctx.font = `italic 32px Georgia, ${SERIF}`; ctx.fillStyle = MUTED; ctx.fillText(rec ? b.sci : '— — —', X, y)
    y += 34
    ctx.strokeStyle = 'rgba(80,60,30,0.35)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(X, y); ctx.lineTo(X + W, y); ctx.stroke()
    y += 52
    ctx.font = `26px ${SANS}`; const kw = Math.max(130, ...[tr('棲地'), tr('稀有度'), tr('收購底價')].map((k) => ctx.measureText(k).width + 22))   // 標題欄寬：其他語言的字比較長
    const row = (k, v) => { ctx.font = `26px ${SANS}`; ctx.fillStyle = MUTED; ctx.fillText(k, X, y); ctx.fillStyle = INK; ctx.font = `30px ${SANS}`; ctx.fillText(v, X + kw, y, W - kw); y += 48 }
    row(tr('棲地'), b.where)
    row(tr('稀有度'), rec ? tr(RARITY[b.id] ?? '普通') : '？')
    row(tr('收購底價'), rec ? `$${(VALUE[b.id] ?? 50) * 3}` : '？')
    y += 18
    if (!rec) {
      ctx.font = `30px ${SANS}`; ctx.fillStyle = INK
      for (const l of wrap(ctx, tr('還沒拍到這種鳥。到「{where}」附近找找看，拍到之後這一頁會補上介紹。', { where: b.where }), W)) { ctx.fillText(l, X, y); y += 52 }
      pageNo(ctx, i * 2 + 3, 'L')
      return
    }
    // 介紹＋小知識：放不下就把字縮小一點，再放不下就少放幾條小知識
    const bottom = CH - 150
    let size = 30, facts = b.facts.length, lay
    for (;;) {
      lay = []; let yy = y
      ctx.font = `${size}px ${SANS}`
      for (const l of wrap(ctx, b.intro, W)) { lay.push([l, X, yy, size, INK]); yy += size * 1.68 }
      yy += size * 0.9
      lay.push([tr('小知識'), X, yy, size * 0.95, ACCENT, true]); yy += size * 1.7
      ctx.font = `${size * 0.9}px ${SANS}`
      for (const f of b.facts.slice(0, facts)) {
        const ls = wrap(ctx, f, W - 34)
        ls.forEach((l, k) => { lay.push([l, X + 34, yy, size * 0.9, INK, false, k === 0]); yy += size * 0.9 * 1.62 })
        yy += size * 0.35
      }
      if (yy <= bottom || (size <= 24 && facts <= 2)) break
      if (size > 24) size -= 1; else facts--
    }
    for (const [t, x, yy, s, c, bold, dot] of lay) {
      ctx.font = `${bold ? 'bold ' : ''}${s}px ${SANS}`; ctx.fillStyle = c; ctx.fillText(t, x, yy)
      if (dot) { ctx.fillStyle = ACCENT; ctx.beginPath(); ctx.arc(X + 12, yy - s * 0.35, 5, 0, 7); ctx.fill() }
    }
    pageNo(ctx, i * 2 + 3, 'L')
  })
}
function birdRight(b, i, rec, info) {
  return canvasTex((ctx) => {
    paper(ctx, 'R')
    // 插圖底：淡淡一片水彩（綠灰），框兩條細線
    const px = PLATE.x * CW, py = (1 - PLATE.y - PLATE.h) * CH, pw = PLATE.w * CW, ph = PLATE.h * CH
    const g = ctx.createRadialGradient(px + pw / 2, py + ph * 0.6, 20, px + pw / 2, py + ph * 0.55, pw * 0.7)
    g.addColorStop(0, rec ? 'rgba(180,196,160,0.42)' : 'rgba(170,160,140,0.35)'); g.addColorStop(1, 'rgba(180,196,160,0)')
    ctx.fillStyle = g; ctx.fillRect(px, py, pw, ph)
    ctx.strokeStyle = 'rgba(80,60,30,0.45)'; ctx.lineWidth = 2; ctx.strokeRect(px - 14, py - 14, pw + 28, ph + 28)
    ctx.lineWidth = 1; ctx.strokeRect(px - 22, py - 22, pw + 44, ph + 44)
    let y = py + ph + 84
    ctx.textAlign = 'center'
    ctx.fillStyle = INK; ctx.font = `38px ${SERIF}`; ctx.fillText(`${tr('圖 {n}', { n: i + 1 })}　${rec ? b.name : '？？？'}`, CW / 2, y, CW - 120)
    y += 46; ctx.fillStyle = MUTED; ctx.font = `24px ${SANS}`
    ctx.fillText(rec ? tr('拍過 {n} 張・最高 {best} 分', { n: info.n, best: info.best }) : tr('尚未記錄'), CW / 2, y)
    ctx.textAlign = 'left'
    pageNo(ctx, i * 2 + 4, 'R')
  })
}
function contentsLeft(nRec) {
  return canvasTex((ctx) => {
    paper(ctx, 'L')
    ctx.textAlign = 'center'; ctx.fillStyle = INK
    ctx.font = `bold 92px ${SERIF}`; ctx.fillText(tr('鳥類圖鑑'), CW / 2, 330, CW - 140)
    ctx.font = `30px ${SERIF}`; ctx.fillStyle = MUTED; ctx.fillText(tr('鳥類生態園・攝影紀錄'), CW / 2, 400)
    ctx.strokeStyle = 'rgba(80,60,30,0.35)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(CW / 2 - 120, 450); ctx.lineTo(CW / 2 + 120, 450); ctx.stroke()
    ctx.fillStyle = INK; ctx.font = `40px ${SANS}`; ctx.fillText(tr('已記錄 {n} / {m} 種', { n: nRec, m: BIRDS.length }), CW / 2, 590)
    const bw = 460, bx = CW / 2 - bw / 2
    ctx.fillStyle = 'rgba(80,60,30,0.15)'; ctx.fillRect(bx, 628, bw, 18)
    ctx.fillStyle = ACCENT; ctx.fillRect(bx, 628, bw * nRec / BIRDS.length, 18)
    ctx.fillStyle = MUTED; ctx.font = `26px ${SANS}`
    ;[tr('拍到一種鳥，就會記進這本圖鑑。'), tr('← →、A D 或點書頁翻頁'), tr('E 或 Esc 闔上')].forEach((t, k) => ctx.fillText(t, CW / 2, 790 + k * 52, CW - 120))
    ctx.textAlign = 'left'
  })
}
function contentsRight(recs) {
  return canvasTex((ctx) => {
    paper(ctx, 'R')
    ctx.fillStyle = INK; ctx.font = `bold 46px ${SERIF}`; ctx.fillText(tr('目錄'), 90, 140)
    const top = 220, step = Math.min(46, (CH - 160 - top) / BIRDS.length)
    BIRDS.forEach((b, i) => {
      const y = top + i * step, rec = recs[i]
      ctx.font = `26px ${SERIF}`; ctx.fillStyle = MUTED; ctx.fillText(String(i + 1).padStart(2, '0'), 90, y)
      ctx.font = `30px ${SANS}`; ctx.fillStyle = rec ? INK : 'rgba(45,42,36,0.35)'; ctx.fillText(rec ? b.name : '？？？', 150, y, CW - 380)
      const w = Math.min(CW - 380, ctx.measureText(rec ? b.name : '？？？').width)
      ctx.fillStyle = 'rgba(80,60,30,0.3)'; for (let x = 160 + w; x < CW - 190; x += 14) ctx.fillRect(x, y - 8, 3, 3)
      ctx.font = `26px ${SERIF}`; ctx.fillStyle = MUTED; ctx.textAlign = 'right'; ctx.fillText(String(i * 2 + 3), CW - 120, y); ctx.textAlign = 'left'
      if (rec) { ctx.strokeStyle = '#a8442f'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(CW - 100, y - 12); ctx.lineTo(CW - 90, y - 2); ctx.lineTo(CW - 72, y - 26); ctx.stroke() }
    })
  })
}

let discTex = null
function softDisc() {
  if (discTex) return discTex
  const c = document.createElement('canvas'); c.width = c.height = 128
  const g = c.getContext('2d'), gr = g.createRadialGradient(64, 64, 10, 64, 64, 64)
  gr.addColorStop(0, '#fff'); gr.addColorStop(0.6, '#bbb'); gr.addColorStop(1, '#000')
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128)
  return (discTex = new THREE.CanvasTexture(c))
}
/* ---------- 右頁的小場景（一種鳥一個，打開過就留著） ---------- */
const SIL = new THREE.MeshBasicMaterial({ color: 0x2b2722 })
function makeDiorama(def) {
  const sc = new THREE.Scene()
  sc.add(new THREE.HemisphereLight(0xf6f2e8, 0x8a7c66, 1.7))
  const sun = new THREE.DirectionalLight(0xfff3df, 2.4)
  sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024); sun.shadow.bias = -0.0005
  const S = sun.shadow.camera; S.left = S.bottom = -2.5; S.right = S.top = 2.5; S.near = 0.1; S.far = 20
  sc.add(sun, sun.target)
  // 鳥放在原本的站點（樹、水面跟著站點），高度改成 0；水鳥的水面高度換成相對的
  const water = def.water != null ? def.water - (def.y ?? 0) : null
  const d = { ...def, y: 0, water: water ?? undefined, groundAt: null, view: def.view ?? 200 }
  if (def.swim) d.swimOK = (x, z) => Math.hypot(x - def.spot[0], z - def.spot[1]) < 1.4
  const a = placeAnimal(d)
  sc.add(a.group)
  const [x, z] = def.spot
  // 地上：只接影子的透明地面；水鳥再加一片淡淡的水
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(30, 30).rotateX(-Math.PI / 2), new THREE.ShadowMaterial({ opacity: 0.32 }))
  ground.position.set(x, def.perch === 'ground' ? 0 : -50, z); ground.receiveShadow = true
  sc.add(ground)
  let pond = null
  if (water != null && def.perch === 'ground') {
    // 一小灘水（邊緣淡出，像水彩），大小等量完鳥再定
    pond = new THREE.Mesh(new THREE.CircleGeometry(1, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x8fb3b0, transparent: true, opacity: 0.5, depthWrite: false, alphaMap: softDisc() }))
    pond.position.set(x, water + 0.002, z); sc.add(pond)
    ground.position.y = water + 0.001   // 影子落在水面上
  }
  // 鏡頭：沿用溫室裡拍這隻鳥的方向，距離照鳥的大小重算（鳥佔插圖高度約一半）
  // 外框要逐點量（precise）：骨架動畫的 boundingBox 是第一次算的就一直沿用，樹枝上的鳥會差到畫面外
  a.group.updateMatrixWorld(true)
  const box = new THREE.Box3().setFromObject(a.built.obj, true), size = box.getSize(new THREE.Vector3()), mid = box.getCenter(new THREE.Vector3())
  const cam = new THREE.PerspectiveCamera(30, PLATE.w / PLATE.h * (CW / CH), 0.05, 60)
  const dir = a.cam.clone().sub(a.target).normalize()
  dir.y = Math.min(Math.max(dir.y, 0.12), 0.45); dir.normalize()
  const s = Math.max(size.y, Math.max(size.x, size.z) * 0.75)
  // 一群鳥會散開，退遠一點
  const dist = s / 0.55 / 2 / Math.tan(THREE.MathUtils.degToRad(15)) * (a.built.birds?.length > 1 ? 1.3 : 1)
  // 鏡頭對準鳥身上的追蹤點（built.focus，跟溫室跟拍用的同一點），再加上它和外框中心的差：鳥走到哪都在正中間
  const focusAt = (v) => a.built.obj.parent.localToWorld(v.copy(a.built.focus))
  const off = mid.clone().sub(focusAt(new THREE.Vector3()))
  if (pond) pond.scale.setScalar(s * 1.1)
  const sunOff = new THREE.Vector3(-2, 6, 3)
  // 鳥身上的原本材質（剪影切換用）
  const meshes = []
  a.built.obj.traverse((o) => { if (o.isMesh && !o.userData.catcher) meshes.push([o, o.material]) })
  let sil = null
  const rt = new THREE.WebGLRenderTarget(560, Math.round(560 * (PLATE.h * CH) / (PLATE.w * CW)), { samples: 4 })
  const look = mid.clone(), want = new THREE.Vector3()
  return {
    rt, ready: false, scene: sc, cam,
    setSilhouette(on) { if (sil === on) return; sil = on; for (const [o, m] of meshes) o.material = on ? SIL : m },
    update(t, dt) {
      a.update(t, dt)
      // 鏡頭平順地跟著鳥（高度只跟三成，低頭啄食時畫面不上下晃）；第一格直接對準
      focusAt(want).add(off)
      want.y = mid.y + (want.y - mid.y) * 0.3
      look.lerp(want, t === 0 ? 1 : 1 - Math.exp(-dt * 4))
      cam.position.copy(look).addScaledVector(dir, dist); cam.lookAt(look)
      // 影子相機跟著走；水鳥的那灘水也跟著（游遠了還在腳下）
      sun.position.copy(look).add(sunOff); sun.target.position.copy(look)
      if (pond) pond.position.set(look.x, pond.position.y, look.z)
    },
    render(renderer) {
      const prev = renderer.getRenderTarget(), cc = renderer.getClearColor(new THREE.Color()), ca = renderer.getClearAlpha()
      renderer.setRenderTarget(rt); renderer.setClearColor(0x000000, 0); renderer.clear()
      renderer.render(sc, cam)
      renderer.setRenderTarget(prev); renderer.setClearColor(cc, ca)
    },
  }
}

/* ---------- 書 ---------- */
function leather(title) {
  const c = document.createElement('canvas'); c.width = 512; c.height = Math.round(512 * PH)
  const g = c.getContext('2d')
  g.fillStyle = '#2f4a33'; g.fillRect(0, 0, c.width, c.height)
  const img = g.getImageData(0, 0, c.width, c.height), d = img.data
  for (let i = 0; i < d.length; i += 4) { const n = (Math.random() - 0.5) * 16; d[i] += n; d[i + 1] += n; d[i + 2] += n }
  g.putImageData(img, 0, 0)
  if (title) {
    g.strokeStyle = '#c9a85a'; g.lineWidth = 3; g.strokeRect(34, 34, c.width - 68, c.height - 68)
    g.lineWidth = 1.5; g.strokeRect(46, 46, c.width - 92, c.height - 92)
    g.fillStyle = '#d7b866'; g.textAlign = 'center'
    g.font = `bold 66px ${SERIF}`; g.fillText(tr('鳥類圖鑑'), c.width / 2, 250, c.width - 120)
    if (LANG !== 'en') { g.font = `24px ${SERIF}`; g.fillText('FIELD GUIDE TO THE BIRDS', c.width / 2, 300) }   // 英文標題已經是這句
    // 燙金的小鳥（站在樹枝上）
    g.save(); g.translate(c.width / 2, 440); g.fillStyle = '#d7b866'
    g.beginPath(); g.ellipse(0, 0, 52, 34, -0.25, 0, 7); g.fill()
    g.beginPath(); g.arc(42, -34, 22, 0, 7); g.fill()
    g.beginPath(); g.moveTo(60, -38); g.lineTo(86, -30); g.lineTo(60, -26); g.fill()
    g.beginPath(); g.moveTo(-40, 8); g.lineTo(-104, 34); g.lineTo(-92, 14); g.lineTo(-44, -10); g.fill()
    g.lineWidth = 5; g.strokeStyle = '#d7b866'; g.beginPath(); g.moveTo(-90, 44); g.quadraticCurveTo(0, 36, 96, 52); g.stroke()
    g.fillStyle = '#2f4a33'; g.beginPath(); g.arc(48, -38, 4, 0, 7); g.fill()
    g.restore()
    g.font = `22px ${SERIF}`; g.fillStyle = '#c9a85a'; g.fillText(tr('鳥類生態園'), c.width / 2, c.height - 90)
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8
  return t
}

export function createGuide({ renderer, getRecords, onClose }) {
  const scene = new THREE.Scene()
  const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 50)
  scene.add(cam)
  scene.add(new THREE.HemisphereLight(0xfff4e4, 0x5a4a3a, 1.4))
  const key = new THREE.DirectionalLight(0xfff0d8, 1.8); key.position.set(-1.2, 1.6, 3); scene.add(key)
  // 背後的遊戲畫面調暗
  const dim = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshBasicMaterial({ color: 0x0c120e, transparent: true, opacity: 0, depthWrite: false }))
  dim.position.z = -20; dim.renderOrder = -1; cam.add(dim)

  const book = new THREE.Group(); scene.add(book)
  const board = new THREE.MeshStandardMaterial({ color: 0xffffff, map: leather(false), roughness: 0.75 })
  const front = new THREE.MeshStandardMaterial({ color: 0xffffff, map: leather(true), roughness: 0.6, metalness: 0.05 })
  const endpaper = new THREE.MeshStandardMaterial({ color: 0xb9c2a4, roughness: 0.9 })
  const edge = new THREE.MeshStandardMaterial({ color: 0xe9dfc6, roughness: 0.95 })
  const BT = 0.024, BLOCK = 0.05
  // 右邊：封底＋書頁塊；左邊的書頁塊翻開才看得到
  const back = new THREE.Mesh(new THREE.BoxGeometry(PW + 0.04, PH + 0.06, BT), [board, board, board, board, endpaper, board])
  back.position.set(PW / 2 + 0.01, 0, -BLOCK - BT / 2); book.add(back)
  const blockR = new THREE.Mesh(new THREE.BoxGeometry(PW, PH, BLOCK), edge); blockR.position.set(PW / 2, 0, -BLOCK / 2); book.add(blockR)
  const blockL = blockR.clone(); blockL.position.x = -PW / 2; book.add(blockL)
  const spine = new THREE.Mesh(new THREE.CylinderGeometry(BLOCK * 0.9, BLOCK * 0.9, PH + 0.06, 16, 1, false, Math.PI, Math.PI), board)
  spine.position.z = -BLOCK; book.add(spine)
  // 封面：繞書脊轉，闔著蓋在右邊、翻開躺到左邊（左邊書頁塊的下面）
  const coverPivot = new THREE.Group(); book.add(coverPivot)
  const cover = new THREE.Mesh(new THREE.BoxGeometry(PW + 0.04, PH + 0.06, BT), [board, board, board, board, front, endpaper])
  cover.position.set(PW / 2 + 0.01, 0, BT / 2 + 0.004); coverPivot.add(cover)

  const plane = () => new THREE.PlaneGeometry(PW, PH, 1, 1).translate(PW / 2, 0, 0)
  const leftPage = new THREE.Mesh(plane(), null); leftPage.position.set(-PW, 0, 0.002); book.add(leftPage)
  const rightPage = new THREE.Mesh(plane(), null); rightPage.position.set(0, 0, 0.002); book.add(rightPage)
  // 翻的那張紙：正面＝右頁、背面＝下一個跨頁的左頁；頂點每格重算（沿書脊轉、外緣慢一點＝彎）
  const SEG = 36
  const leafGeo = new THREE.PlaneGeometry(PW, PH, SEG, 1).translate(PW / 2, 0, 0)
  const leafU = Float32Array.from({ length: leafGeo.attributes.position.count }, (_, i) => leafGeo.attributes.position.getX(i))
  const leafF = new THREE.Mesh(leafGeo, null), leafB = new THREE.Mesh(leafGeo, null)
  leafF.position.z = leafB.position.z = 0.006
  book.add(leafF, leafB)
  function bendLeaf(th, dirn) {
    const p = leafGeo.attributes.position, col = []
    let x = 0, z = 0
    for (let k = 0; k <= SEG; k++) {
      const u = k / SEG
      col.push([x, z])
      const a = th - dirn * 0.75 * Math.sin(th) * u ** 1.4
      x += Math.cos(a) * PW / SEG; z += Math.sin(a) * PW / SEG
    }
    for (let i = 0; i < p.count; i++) { const k = Math.round(leafU[i] / PW * SEG); p.setX(i, col[k][0]); p.setZ(i, col[k][1]) }
    p.needsUpdate = true; leafGeo.computeBoundingSphere()
  }

  // 跨頁 0 是目錄；跨頁 s（1～）是 BIRDS[s - 1]
  const NS = BIRDS.length + 1
  let recs = [], infos = []
  const mats = new Map()   // key 'L3' / 'R3' / 'B3'（背面用的左頁）→ 材質
  const dioramas = new Map()
  function refresh() {
    const r = getRecords()
    infos = BIRDS.map((b) => r[b.id] ?? null); recs = infos.map(Boolean)
    for (const m of mats.values()) m.uniforms.map.value.dispose()
    mats.clear()
    for (const [id, d] of dioramas) d.setSilhouette(!r[id])
  }
  function texFor(side, s) {
    if (s === 0) return side === 'L' ? contentsLeft(recs.filter(Boolean).length) : contentsRight(recs)
    const i = s - 1
    return side === 'L' ? birdLeft(BIRDS[i], i, recs[i]) : birdRight(BIRDS[i], i, recs[i], infos[i])
  }
  function mat(kind, s) {
    const k = kind + s
    if (!mats.has(k)) {
      const m = kind === 'B' ? pageMat(mat('L', s).uniforms.map.value, 1) : pageMat(texFor(kind, s))
      mats.set(k, m)
    }
    const m = mats.get(k)
    if (kind === 'R' && s > 0) {
      const d = diorama(s)
      m.uniforms.plate.value = d.rt.texture; m.uniforms.hasPlate.value = d.ready ? 1 : 0
    }
    return m
  }
  function diorama(s) {
    const b = BIRDS[s - 1]
    let d = dioramas.get(b.id)
    if (!d) {
      d = makeDiorama(b); dioramas.set(b.id, d)
      d.setSilhouette(!recs[s - 1])
      d.update(0, 0.016)
      // 先在背景編好著色器（鳥的材質在這個小場景裡的燈光組合不一樣），好了才開始畫
      renderer.compileAsync(d.scene, d.cam).then(() => { d.ready = true })
    }
    return d
  }
  const warmAround = (s) => { for (const k of [s - 1, s, s + 1, s + 2]) if (k > 0 && k < NS) diorama(k) }

  // 狀態
  const st = { open: false, t: 0, target: 0, spread: 0, flip: null, time: 0 }
  const hud = document.createElement('div')
  hud.className = 'guide-ui'; hud.hidden = true
  hud.innerHTML = `<button class="x" aria-label="${tr('關閉')}"><svg width="18" height="18" viewBox="0 0 18 18"><path d="M3 3l12 12M15 3L3 15" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg></button>
    <div class="guide-hint">${tr('← → 翻頁　E 闔上')}</div>`
  document.body.appendChild(hud)
  hud.querySelector('.x').onclick = () => close()

  function open() {
    if (st.open) return
    refresh()
    st.open = true; st.target = 1; hud.hidden = false
    warmAround(st.spread)
  }
  function close(why) {
    if (!st.open) return
    st.open = false; st.target = 0; hud.hidden = true; st.flip = null
    onClose?.(why)
  }
  function turn(dirn) {
    if (!st.open || st.t < 0.98) return
    if (st.flip) { if (st.flip.queue === 0) st.flip.queue = dirn; return }
    const to = st.spread + dirn
    if (to < 0 || to >= NS) return
    st.flip = { dirn, from: st.spread, to, p: 0, queue: 0 }
    warmAround(to)
  }
  addEventListener('keydown', (e) => {
    if (!st.open) return
    if (e.code === 'ArrowRight' || e.code === 'KeyD' || e.code === 'PageDown') turn(1)
    else if (e.code === 'ArrowLeft' || e.code === 'KeyA' || e.code === 'PageUp') turn(-1)
    else if (e.code === 'Escape') close('esc')
  })
  renderer.domElement.addEventListener('click', (e) => { if (st.open) turn(e.clientX > innerWidth / 2 ? 1 : -1) })
  let wheelT = 0
  addEventListener('wheel', (e) => { if (!st.open || performance.now() - wheelT < 350 || Math.abs(e.deltaY) < 4) return; wheelT = performance.now(); turn(e.deltaY > 0 ? 1 : -1) })

  function render(dt) {
    if (st.t <= 0 && !st.open) return
    st.time += dt
    st.t = st.target > st.t ? Math.min(1, st.t + dt / 1.5) : Math.max(0, st.t - dt / 0.6)
    const t = st.t
    // 0～0.35：從下面升上來；0.3～0.85：封面翻開；鏡頭一路拉近
    const rise = ease(clamp01(t / 0.35)), opn = ease(clamp01((t - 0.3) / 0.55))
    dim.material.opacity = 0.62 * clamp01(t / 0.3)
    coverPivot.rotation.y = -Math.PI * opn
    coverPivot.position.z = -(BLOCK + BT + 0.01) * opn   // 翻開後躺到左邊書頁塊的底下
    blockL.visible = opn > 0.5
    book.position.set(-PW / 2 * (1 - opn), -2.2 * (1 - rise), 0)
    book.rotation.set(-0.55 * (1 - rise) - 0.12 * (1 - opn), 0.25 * (1 - opn), 0.06 * (1 - opn))
    const asp = renderer.domElement.clientWidth / renderer.domElement.clientHeight
    if (cam.aspect !== asp) { cam.aspect = asp; cam.updateProjectionMatrix() }
    const tn = Math.tan(THREE.MathUtils.degToRad(15))
    const fitOpen = Math.max((PH + 0.22) / 2 / tn, (2 * PW + 0.28) / 2 / tn / asp)
    const fitClosed = Math.max((PH + 0.1) / 2 / tn / 0.62, (PW + 0.1) / 2 / tn / asp / 0.62)
    cam.position.set(0, 0, THREE.MathUtils.lerp(fitClosed, fitOpen, opn)); cam.lookAt(0, 0, 0)

    // 頁面
    const f = st.flip
    if (f) {
      f.p = Math.min(1, f.p + dt / 0.75)
      if (f.p >= 1) {
        st.spread = f.to
        const q = f.queue; st.flip = null
        if (q) turn(q)
      }
    }
    const F = st.flip
    let A, B
    if (F) { A = Math.min(F.from, F.to); B = A + 1 } else A = B = st.spread
    leftPage.material = mat('L', A); rightPage.material = mat('R', B)
    leafF.visible = leafB.visible = !!F
    if (F) {
      leafF.material = mat('R', A); leafB.material = mat('B', B)
      leafB.material.side = THREE.BackSide; leafF.material.side = THREE.FrontSide
      const e = ease(F.p), th = F.dirn > 0 ? Math.PI * e : Math.PI * (1 - e)
      bendLeaf(th, F.dirn)
      const sh = 0.78 + 0.22 * Math.abs(Math.cos(th))
      leafF.material.uniforms.shade.value = sh; leafB.material.uniforms.shade.value = sh
      // 翻起來的紙在下面兩頁投一點陰影
      const lift = Math.sin(th)
      mat('L', A).uniforms.shade.value = 1 - 0.18 * lift * (th > Math.PI / 2 ? 1 : 0.4)
      mat('R', B).uniforms.shade.value = 1 - 0.18 * lift * (th < Math.PI / 2 ? 1 : 0.4)
    } else { mat('L', A).uniforms.shade.value = 1; mat('R', B).uniforms.shade.value = 1 }
    leftPage.visible = opn > 0.5
    // 看得到的右頁插圖：每格更新鳥的動作、畫到貼圖
    for (const s of new Set(F ? [A, B] : [A])) {
      if (s === 0 || (!F && s !== st.spread)) continue
      const d = diorama(s)
      if (!d.ready) continue
      d.update(st.time, dt); d.render(renderer)
      mat('R', s).uniforms.hasPlate.value = 1
    }
    if (st.spread > 0 && !F) { const d = diorama(st.spread); if (d.ready) { mat('R', st.spread).uniforms.hasPlate.value = 1 } }

    const ac = renderer.autoClear
    renderer.autoClear = false; renderer.clearDepth()
    renderer.render(scene, cam)
    renderer.autoClear = ac
  }
  return { open, close, render, turn, get isOpen() { return st.open }, get visible() { return st.t > 0 }, st, dbg: { scene, cam, leftPage, rightPage, mats, dim, dioramas } }
}
