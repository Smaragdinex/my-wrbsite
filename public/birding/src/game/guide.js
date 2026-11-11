// 鳥類圖鑑：沒有其他東西可以互動時按 E 打開。是一本 3D 的書：從畫面下方升上來、翻開封面、鏡頭拉近到一個跨頁填滿畫面。
// 左頁是介紹（文字畫在 canvas 上），右頁是那隻鳥：真的模型放在一個小場景裡走動、轉頭（placeAnimal，跟溫室裡同一套動作），
// 每格畫到一張貼圖，再像插圖一樣疊在紙上（只疊鳥和影子，背景是紙）。
// 翻頁：→ / D / 點右半邊 / 滾輪往下 = 下一頁，← / A / 點左半邊 = 上一頁；翻的那張紙沿書脊轉過去、外緣慢一點，看起來會彎。
// E、Esc、左上角 X 關閉（書闔起來沉下去）。
// 還沒拍到的鳥：右頁是剪影，左頁只寫名字和在哪裡，介紹要拍到才解鎖。第一個跨頁是扉頁＋前言（收集進度），第二個跨頁是目錄（左右兩頁）。
import * as THREE from 'three'
import { BIRDS } from '../birdinfo.js'
import { placeAnimal, MissingModel, ensureModel, modelsFor, modelFailed } from '../birds.js'
import { VALUE } from './scoring.js'
import { RARITY } from './judge.js'
import { activityLabel } from './presence.js'
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
  uniform sampler2D map; uniform sampler2D plate; uniform float hasPlate; uniform vec4 rect; uniform float fade; uniform float shade; uniform float flip;
  // 插圖畫到貼圖時還沒 tone mapping：這裡用 three.js 內建、跟遊戲畫面一樣的 ACES（toneMappingExposure 跟著遊戲）
  void main() {
    vec2 uv = vec2(flip > 0.5 ? 1.0 - vUv.x : vUv.x, vUv.y);
    vec3 c = texture2D(map, uv).rgb;
    if (hasPlate > 0.5) {
      vec2 q = (uv - rect.xy) / rect.zw;
      if (q.x > 0.0 && q.y > 0.0 && q.x < 1.0 && q.y < 1.0) {
        vec4 p = texture2D(plate, q);
        // 插圖邊緣淡出（像水彩暈開），不會有一條硬邊
        float e = smoothstep(0.0, fade, min(min(q.x, 1.0 - q.x), min(q.y, 1.0 - q.y)));
        c = c * (1.0 - p.a * e) + ACESFilmicToneMapping(p.rgb) * e;
      }
    }
    gl_FragColor = vec4(c * shade, 1.0);
    #include <colorspace_fragment>
  }`
function pageMat(map, flip = 0) {
  return new THREE.ShaderMaterial({
    vertexShader: PAGE_VS, fragmentShader: PAGE_FS,
    uniforms: { map: { value: map }, plate: { value: null }, hasPlate: { value: 0 }, rect: { value: new THREE.Vector4(PLATE.x, PLATE.y, PLATE.w, PLATE.h) }, fade: { value: 0.05 }, shade: { value: 1 }, flip: { value: flip } },
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
      if (ctx.measureText(line + tok).width > w && line && !/^[，。、；：！？）」』,.;:!?)]/.test(tok)) { lines.push(line); line = tok.trimStart() } else line += tok
    }
    lines.push(line)
  }
  return lines
}
// k：畫布放大倍數（字小的頁面，例如目錄，畫高解析一點；版面一樣用 CW × CH 的座標）
// 2026-11-11 使用者／玩家回報：圖鑑太糊 → 每頁的畫布照螢幕放大（一頁大約佔滿螢幕高：CH 對應 innerHeight×DPR），最少 1.4 倍、最多 2 倍
const K_SCREEN = Math.min(2, Math.max(1.4, (innerHeight * Math.min(devicePixelRatio || 1, 2) * 0.95) / CH))
let MAX_ANISO = 8
export function guideAniso(r) { MAX_ANISO = r.capabilities.getMaxAnisotropy?.() || 8 }
function canvasTex(draw, k = 1) {
  k = Math.max(k, K_SCREEN)
  const c = document.createElement('canvas'); c.width = Math.round(CW * k); c.height = Math.round(CH * k)
  const g = c.getContext('2d'); g.scale(k, k)
  draw(g)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = MAX_ANISO
  return t
}
const pageNo = (ctx, n, side) => { ctx.font = `26px ${SERIF}`; ctx.fillStyle = MUTED; ctx.textAlign = side === 'L' ? 'left' : 'right'; ctx.fillText(String(n), side === 'L' ? 70 : CW - 70, CH - 56); ctx.textAlign = 'left' }
// 每一頁鳥的左頁下方：「↩ 回到目錄」（點了翻回目錄；範圍給 createGuide 的點擊判斷用，畫布像素）
const BACK = { x0: CW - 360, x1: CW - 50, y0: CH - 100, y1: CH - 30 }
function backLink(ctx) {
  ctx.font = `28px ${SANS}`; ctx.fillStyle = ACCENT; ctx.textAlign = 'right'
  ctx.fillText('↩ ' + tr('回到目錄'), CW - 70, CH - 56)
  const w = ctx.measureText('↩ ' + tr('回到目錄')).width
  ctx.fillRect(CW - 70 - w, CH - 46, w, 2); ctx.textAlign = 'left'
}
// 目錄每一行的位置（畫和點擊判斷共用）
// 2026-11-10 改成像真的書（ChatGPT 建議）：跨頁 0 是扉頁＋前言，接著目錄跨頁（一頁一欄、每頁最多 35 種，左右兩頁），再來每種鳥一個跨頁
// 鳥變多時目錄自動加頁（湊成偶數頁，維持完整跨頁）
const TOC_PER = 35
const TOC_PAGES = Math.max(2, Math.ceil(Math.ceil(BIRDS.length / TOC_PER) / 2) * 2)
const FRONT = 1 + TOC_PAGES / 2   // 鳥的第一個跨頁
const TOC_Y0 = 262, TOC_X0 = 74, TOC_X1 = CW - 74
const tocStep = () => Math.min(34, (CH - 96 - TOC_Y0) / (TOC_PER - 1))
// 印在頁角的頁碼：扉頁、前言不編號；目錄 1、2…；鳥的左頁、右頁接著
const birdPageNo = (i) => TOC_PAGES + i * 2 + 1
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI']
const NEWRED = '#b5452c'
// 小型大寫的字（字距拉開）：英文標題、頁眉用
function spaced(ctx, text, x, y, px, color, align = 'center', track = 0.22) {
  ctx.save(); ctx.font = `${px}px ${SERIF}`; ctx.fillStyle = color
  const chars = [...text], w = chars.reduce((s, c) => s + ctx.measureText(c).width, 0) + track * px * (chars.length - 1)
  let cx = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x
  ctx.textAlign = 'left'
  for (const c of chars) { ctx.fillText(c, cx, y); cx += ctx.measureText(c).width + track * px }
  ctx.restore(); return w
}
function rule(ctx, x0, x1, y, a = 0.35, w = 1.5) { ctx.strokeStyle = `rgba(80,60,30,${a})`; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke() }
// 小菱形花飾（兩條細線中間一顆）
function fleuron(ctx, x, y, half) {
  rule(ctx, x - half, x - 12, y, 0.4); rule(ctx, x + 12, x + half, y, 0.4)
  ctx.fillStyle = 'rgba(91,110,60,0.75)'; ctx.beginPath(); ctx.moveTo(x, y - 6); ctx.lineTo(x + 6, y); ctx.lineTo(x, y + 6); ctx.lineTo(x - 6, y); ctx.fill()
}
// 頁眉：外側一行字距拉開的小字＋一條細線
function runningHead(ctx, text, side) {
  spaced(ctx, text, side === 'L' ? 74 : CW - 74, 70, 15, MUTED, side === 'L' ? 'left' : 'right', 0.28)
  rule(ctx, 74, CW - 74, 86, 0.22, 1)
}
// 沒讀過的新紀錄：朱紅色小字 NEW（不加底色框），(x, y) 是左邊、文字基線
function newTag(ctx, x, y, size = 22) {
  ctx.save(); ctx.font = `bold ${size * 0.72}px ${SANS}`; ctx.fillStyle = NEWRED
  let w = 0; for (const c of 'NEW') { ctx.fillText(c, x + w, y - size * 0.12); w += ctx.measureText(c).width + size * 0.08 }
  ctx.restore(); return w
}
function stamp(ctx, text, x, y, color) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(-0.12)
  ctx.font = `bold 30px ${SANS}`; const w = ctx.measureText(text).width + 34
  ctx.strokeStyle = color; ctx.lineWidth = 3; ctx.globalAlpha = 0.8
  ctx.strokeRect(-w / 2, -26, w, 52); ctx.fillStyle = color; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, 0, 1)
  ctx.restore()
}

function birdLeft(b, i, rec, unread) {
  return canvasTex((ctx) => {
    paper(ctx, 'L')
    const X = 86, W = CW - 2 * X - 20
    let y = 120
    ctx.fillStyle = MUTED; ctx.font = `26px ${SERIF}`; ctx.fillText(`No. ${String(i + 1).padStart(2, '0')}`, X, y)
    if (unread) newTag(ctx, X + ctx.measureText(`No. ${String(i + 1).padStart(2, '0')}`).width + 16, y, 24)
    if (rec) stamp(ctx, tr('已記錄'), CW - 190, 118, '#a8442f')
    y += 84
    ctx.fillStyle = INK; ctx.font = `bold 72px ${SERIF}`; ctx.fillText(rec ? b.name : '？？？', X, y, W)   // 沒拍到：名字跟目錄一樣先藏起來，只給在哪裡
    if (b.nick && rec && ctx.measureText(b.name).width < W * 0.6) { const w = ctx.measureText(b.name).width; ctx.font = `34px ${SERIF}`; ctx.fillStyle = MUTED; ctx.fillText(`（${b.nick}）`, X + w + 8, y - 6) }
    y += 50
    ctx.font = `italic 32px Georgia, ${SERIF}`; ctx.fillStyle = MUTED; ctx.fillText(rec ? b.sci : '— — —', X, y)
    y += 34
    ctx.strokeStyle = 'rgba(80,60,30,0.35)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(X, y); ctx.lineTo(X + W, y); ctx.stroke()
    y += 52
    ctx.font = `26px ${SANS}`; const kw = Math.max(130, ...[tr('棲地'), tr('出沒時間'), tr('稀有度'), tr('收購底價')].map((k) => ctx.measureText(k).width + 22))   // 標題欄寬：其他語言的字比較長
    const row = (k, v) => { ctx.font = `26px ${SANS}`; ctx.fillStyle = MUTED; ctx.fillText(k, X, y); ctx.fillStyle = INK; ctx.font = `30px ${SANS}`; ctx.fillText(v, X + kw, y, W - kw); y += 48 }
    row(tr('棲地'), b.where)
    row(tr('出沒時間'), tr(activityLabel(b.id)))   // 沒拍到也給：晚上才出來的鳥要讓玩家知道晚上來找
    row(tr('稀有度'), rec ? tr(RARITY[b.id] ?? '普通') : '？')
    row(tr('收購底價'), rec ? `$${(VALUE[b.id] ?? 50) * 3}` : '？')
    y += 18
    if (!rec) {
      ctx.font = `30px ${SANS}`; ctx.fillStyle = INK
      for (const l of wrap(ctx, tr('還沒拍到這種鳥。到「{where}」附近找找看，拍到之後這一頁會補上介紹。', { where: b.where }), W)) { ctx.fillText(l, X, y); y += 52 }
      pageNo(ctx, birdPageNo(i), 'L'); backLink(ctx)
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
    pageNo(ctx, birdPageNo(i), 'L'); backLink(ctx)
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
    pageNo(ctx, birdPageNo(i) + 1, 'R')
  })
}
// 扉頁（第一個跨頁的左頁）：系列名、書名、中間一幅會動的插圖（FRONTIS，小場景畫上去）、下面出版資訊
const FRONTIS = { x: 0.13, y: 1 - 930 / CH, w: 0.74, h: 490 / CH }   // 插圖範圍（uv，y 往上）
function titlePage() {
  return canvasTex((ctx) => {
    paper(ctx, 'L')
    const cx = CW / 2
    spaced(ctx, 'X-ARTS NATURAL HISTORY SERIES', cx, 112, 17, MUTED)
    spaced(ctx, 'VOL. 01', cx, 140, 14, MUTED)
    fleuron(ctx, cx, 172, 150)
    spaced(ctx, 'A FIELD GUIDE TO THE BIRDS', cx, 234, 21, ACCENT, 'center', 0.2)
    ctx.textAlign = 'center'; ctx.fillStyle = INK
    ctx.font = `600 84px ${SERIF}`; ctx.fillText(tr('鳥類圖鑑'), cx, 330, CW - 160)
    ctx.font = `italic 32px Georgia, ${SERIF}`; ctx.fillStyle = MUTED; ctx.fillText('Birds of the Park', cx, 382)
    // 插圖底：一片淡淡的水彩
    const px = FRONTIS.x * CW, py = (1 - FRONTIS.y - FRONTIS.h) * CH, pw = FRONTIS.w * CW, ph = FRONTIS.h * CH
    const g = ctx.createRadialGradient(cx, py + ph * 0.62, 10, cx, py + ph * 0.55, pw * 0.55)
    g.addColorStop(0, 'rgba(182,196,158,0.40)'); g.addColorStop(0.7, 'rgba(182,196,158,0.12)'); g.addColorStop(1, 'rgba(182,196,158,0)')
    ctx.fillStyle = g; ctx.fillRect(px, py, pw, ph)
    ctx.textAlign = 'center'
    ctx.font = `26px ${SERIF}`; ctx.fillStyle = INK; ctx.fillText(tr('觀察・辨識・記錄'), cx, 990)
    ctx.font = `italic 20px Georgia, ${SERIF}`; ctx.fillStyle = MUTED; ctx.fillText('An Illustrated Field Guide', cx, 1024)
    fleuron(ctx, cx, 1068, 110)
    spaced(ctx, 'X-ARTS · 2026', cx, 1118, 15, MUTED)
    ctx.textAlign = 'left'
  })
}
// 前言（第一個跨頁的右頁）：一段簡介、觀察進度、使用方法
function prefacePage(nRec, nNew) {
  return canvasTex((ctx) => {
    paper(ctx, 'R')
    runningHead(ctx, 'PREFACE', 'R')
    const X = 96, W = CW - 2 * X
    ctx.fillStyle = INK; ctx.font = `600 46px ${SERIF}`; ctx.fillText(tr('前言'), X, 176)
    let y = 252
    ctx.font = `28px ${SERIF}`
    for (const l of wrap(ctx, tr('這本圖鑑收錄園區裡可以遇見的 {m} 種野鳥。每拍到一種，就會在這裡留下紀錄：插圖、習性，還有你拍下的最好成績。', { m: BIRDS.length }), W)) { ctx.fillText(l, X, y); y += 48 }
    y += 46
    spaced(ctx, tr('觀察進度'), X, y, 18, ACCENT, 'left', 0.25); y += 22
    rule(ctx, X, X + W, y, 0.25, 1); y += 84
    ctx.fillStyle = INK; ctx.font = `600 72px ${SERIF}`; ctx.fillText(String(nRec), X, y)
    let w = ctx.measureText(String(nRec)).width
    ctx.font = `36px ${SERIF}`; ctx.fillStyle = MUTED; ctx.fillText(` / ${BIRDS.length}`, X + w + 4, y)
    ctx.textAlign = 'right'; ctx.font = `26px ${SANS}`; ctx.fillText(tr('已記錄 {n} / {m} 種', { n: nRec, m: BIRDS.length }), X + W, y); ctx.textAlign = 'left'
    y += 30
    ctx.fillStyle = 'rgba(80,60,30,0.13)'; ctx.fillRect(X, y, W, 10)
    ctx.fillStyle = ACCENT; ctx.fillRect(X, y, W * nRec / BIRDS.length, 10)
    y += 62
    if (nNew) { ctx.fillStyle = NEWRED; ctx.font = `26px ${SANS}`; ctx.fillText(tr('{n} 筆新紀錄還沒看（目錄裡標 NEW）', { n: nNew }), X, y, W); y += 30 }
    y += 60
    spaced(ctx, tr('使用方法'), X, y, 18, ACCENT, 'left', 0.25); y += 22
    rule(ctx, X, X + W, y, 0.25, 1); y += 56
    ctx.font = `26px ${SANS}`
    for (const t of [tr('拍到一種鳥，就會記進這本圖鑑。'), tr('← →、A D 或點書頁翻頁'), tr('點目錄裡的鳥，直接翻到那一頁'), tr('E 或 Esc 闔上')]) {
      ctx.fillStyle = ACCENT; ctx.beginPath(); ctx.arc(X + 6, y - 9, 4, 0, 7); ctx.fill()
      ctx.fillStyle = INK; ctx.fillText(t, X + 26, y, W - 26); y += 50
    }
    ctx.textAlign = 'right'; ctx.font = `italic 22px Georgia, ${SERIF}`; ctx.fillStyle = MUTED; ctx.fillText('— X-ARTS Field Notes', X + W, CH - 90); ctx.textAlign = 'left'
  })
}
// 目錄第 p 頁（0 起）：一欄，編號／鳥名／紀錄／頁碼
function tocPage(p, recs, unread) {
  const side = p % 2 ? 'R' : 'L'
  return canvasTex((ctx) => {
    paper(ctx, side)
    runningHead(ctx, `CONTENTS · ${ROMAN[p] ?? p + 1}`, side)
    const a = p * TOC_PER, b = Math.min(BIRDS.length, a + TOC_PER)
    ctx.fillStyle = INK; ctx.font = `600 44px ${SERIF}`; ctx.fillText(tr('目錄'), TOC_X0, 160)
    if (b > a) { ctx.textAlign = 'right'; ctx.font = `24px ${SERIF}`; ctx.fillStyle = MUTED; ctx.fillText(`${String(a + 1).padStart(2, '0')} — ${String(b).padStart(2, '0')}`, TOC_X1, 160); ctx.textAlign = 'left' }
    // 表頭
    const CHK = TOC_X1 - 96, NX = TOC_X0 + 52
    spaced(ctx, 'NO.', TOC_X0, 214, 13, MUTED, 'left', 0.2)
    spaced(ctx, tr('鳥種'), NX, 214, 13, MUTED, 'left', 0.2)
    spaced(ctx, tr('紀錄'), CHK + 10, 214, 13, MUTED, 'center', 0.2)
    spaced(ctx, tr('頁'), TOC_X1, 214, 13, MUTED, 'right', 0.2)
    rule(ctx, TOC_X0, TOC_X1, 228, 0.4, 1.5)
    const step = tocStep()
    for (let i = a; i < b; i++) {
      const y = TOC_Y0 + (i - a) * step, rec = recs[i]
      ctx.font = `19px ${SERIF}`; ctx.fillStyle = MUTED; ctx.fillText(String(i + 1).padStart(2, '0'), TOC_X0, y)
      const name = rec ? BIRDS[i].name : tr('尚未發現'), maxW = CHK - 40 - NX - 60
      ctx.font = rec ? `23px ${SANS}` : `italic 21px ${SANS}`; ctx.fillStyle = rec ? INK : 'rgba(45,42,36,0.36)'
      ctx.fillText(name, NX, y, maxW)
      let w = Math.min(maxW, ctx.measureText(name).width)
      if (unread[i]) w += 10 + newTag(ctx, NX + w + 10, y, 22)
      ctx.fillStyle = 'rgba(80,60,30,0.22)'; for (let x = NX + 14 + w; x < CHK - 26; x += 11) ctx.fillRect(x, y - 6, 2, 2)
      if (rec) { const cx = CHK; ctx.strokeStyle = ACCENT; ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(cx, y - 9); ctx.lineTo(cx + 7, y - 2); ctx.lineTo(cx + 20, y - 18); ctx.stroke() }
      ctx.font = `19px ${SERIF}`; ctx.fillStyle = MUTED; ctx.textAlign = 'right'; ctx.fillText(String(birdPageNo(i)), TOC_X1, y); ctx.textAlign = 'left'
    }
    if (p === TOC_PAGES - 1) {
      // 最後一頁目錄的頁腳：圖例
      ctx.font = `19px ${SANS}`; ctx.fillStyle = MUTED; ctx.textAlign = 'center'
      const lg = `✓ ${tr('已記錄')}　　NEW ${tr('新紀錄')}`
      ctx.fillText(lg, CW / 2, CH - 52); ctx.textAlign = 'left'
    }
    pageNo(ctx, p + 1, side)
  }, 1.5)
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
const SIL = new THREE.MeshBasicMaterial({ color: 0x2b2722, side: THREE.DoubleSide })   // 鳥身上零星反的小碎片：剪影也要畫兩面（不然有白點）
function makeDiorama(def, P = PLATE, zoom = 1) {
  const sc = new THREE.Scene()
  sc.add(new THREE.HemisphereLight(0xf6f2e8, 0x8a7c66, 1.7))
  const sun = new THREE.DirectionalLight(0xfff3df, 2.4)
  sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024); sun.shadow.bias = -0.0005
  const S = sun.shadow.camera; S.left = S.bottom = -2.5; S.right = S.top = 2.5; S.near = 0.1; S.far = 20
  sc.add(sun, sun.target)
  // 鳥放在原本的站點（樹、水面跟著站點），高度改成 0；水鳥的水面高度換成相對的
  const water = def.guideStand ? null : def.water != null ? def.water - (def.y ?? 0) : null   // guideStand：圖鑑裡畫站在地上的（黑剪嘴鷗）
  const d = { ...def, y: 0, water: water ?? undefined, groundAt: null, view: def.view ?? 200 }
  if (def.guideStand) { d.guide = true; d.perch = 'ground' }
  if (def.swim) d.swimOK = (x, z) => Math.hypot(x - def.spot[0], z - def.spot[1]) < 1.4
  if (def.perch === 'sacred' || def.perch === 'fig') d.perch = 'branch'   // 神木、雀榕上的鳥：圖鑑插圖沒有那棵樹，畫成停在樹枝上
  const a = placeAnimal(d, { strict: true })   // 模型還沒載到會丟 MissingModel（diorama() 接住，載完再畫）
  sc.add(a.group)
  const [x, z] = def.spot
  // 地上：只接影子的透明地面；水鳥再加一片淡淡的水
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(30, 30).rotateX(-Math.PI / 2), new THREE.ShadowMaterial({ opacity: 0.32 }))
  ground.position.set(x, def.perch === 'ground' || def.perch === 'stem' ? 0 : -50, z); ground.receiveShadow = true
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
  // 2026-11-09 使用者：一群的鳥（鴨子、麻雀、鷓鴣、成對停枝的…）在圖鑑裡每隻都很小 → 只留第一隻、鏡頭照牠一隻取景
  const one = a.built.birds?.length > 1 ? a.built.birds[0] : a.built
  if (one !== a.built) for (const b of a.built.birds) if (b !== one) b.obj.visible = false
  a.group.updateMatrixWorld(true)
  const box = new THREE.Box3().setFromObject(one.obj, true), size = box.getSize(new THREE.Vector3()), mid = box.getCenter(new THREE.Vector3())
  const cam = new THREE.PerspectiveCamera(30, P.w / P.h * (CW / CH), 0.05, 60)
  const dir = a.cam.clone().sub(a.target).normalize()
  dir.y = Math.min(Math.max(dir.y, 0.12), 0.45); dir.normalize()
  const s = Math.max(size.y, Math.max(size.x, size.z) * 0.75)
  // 一群鳥會散開，退遠一點
  const dist = s / 0.55 / 2 / Math.tan(THREE.MathUtils.degToRad(15)) / zoom
  // 鏡頭對準鳥身上的追蹤點（built.focus，跟溫室跟拍用的同一點），再加上它和外框中心的差：鳥走到哪都在正中間
  const focusAt = (v) => one.obj.parent.localToWorld(v.copy(one.focus))
  const off = mid.clone().sub(focusAt(new THREE.Vector3()))
  if (pond) pond.scale.setScalar(s * 1.1)
  const sunOff = new THREE.Vector3(-2, 6, 3)
  // 鳥身上的原本材質（剪影切換用）
  const meshes = []
  one.obj.traverse((o) => { if (o.isMesh && !o.userData.catcher) meshes.push([o, o.material]) })
  let sil = null
  const rt = new THREE.WebGLRenderTarget(560, Math.round(560 * (P.h * CH) / (P.w * CW)), { samples: 4 })
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

export function createGuide({ renderer, getRecords, onClose, onRead = () => {}, sfx = () => {} }) {
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

  // 跨頁 0 是扉頁＋前言；1～FRONT-1 是目錄；跨頁 s（FRONT～）是 BIRDS[s - FRONT]
  const NS = BIRDS.length + FRONT
  const TOC_S = 1
  let recs = [], infos = [], unread = []
  const mats = new Map()   // key 'L3' / 'R3' / 'B3'（背面用的左頁）→ 材質
  const dioramas = new Map()
  function refresh() {
    const r = getRecords()
    infos = BIRDS.map((b) => r[b.id] ?? null); recs = infos.map(Boolean); unread = infos.map((o) => !!o?.unread)
    for (const m of mats.values()) m.uniforms.map.value.dispose()
    mats.clear()
    for (const [id, d] of dioramas) d.setSilhouette(!r[id])
  }
  function texFor(side, s) {
    if (s === 0) return side === 'L' ? titlePage() : prefacePage(recs.filter(Boolean).length, unread.filter(Boolean).length)
    if (s < FRONT) return tocPage((s - 1) * 2 + (side === 'R' ? 1 : 0), recs, unread)
    const i = s - FRONT
    return side === 'L' ? birdLeft(BIRDS[i], i, recs[i], unread[i]) : birdRight(BIRDS[i], i, recs[i], infos[i])
  }
  function mat(kind, s) {
    const k = kind + s
    if (!mats.has(k)) {
      const m = kind === 'B' ? pageMat(mat('L', s).uniforms.map.value, 1) : pageMat(texFor(kind, s))
      mats.set(k, m)
    }
    const m = mats.get(k)
    if (kind === 'L' && s === 0) {
      const d = frontis()
      m.uniforms.plate.value = d.rt.texture; m.uniforms.hasPlate.value = d.ready ? 1 : 0
      m.uniforms.rect.value.set(FRONTIS.x, FRONTIS.y, FRONTIS.w, FRONTIS.h); m.uniforms.fade.value = 0.2
    }
    if (kind === 'R' && s >= FRONT) {
      const d = diorama(s)
      m.uniforms.plate.value = d.rt.texture; m.uniforms.hasPlate.value = d.ready ? 1 : 0
    }
    return m
  }
  const dioWait = new Set(), BLANK_D = { rt: { texture: new THREE.Texture() }, ready: false, update() {}, render() {}, setSilhouette() {} }
  function diorama(s) {
    const b = BIRDS[s - FRONT]
    let d = dioramas.get(b.id)
    if (!d) {
      // 2026-11-11 串流載入：這隻鳥的模型可能還沒載到 → 先回一張空白（hasPlate 0，頁面照常畫文字），背景載完把這一頁的材質丟掉重做
      if (dioWait.has(b.id)) return BLANK_D
      try { d = makeDiorama(b) } catch (e) {
        if (!(e instanceof MissingModel)) throw e
        dioWait.add(b.id)
        if (modelFailed(e.model)) return BLANK_D   // 檔案真的沒有：這一頁就不畫插圖，不要一直重試
        Promise.all([...modelsFor(b.id).map(ensureModel), ensureModel(e.model)]).then(() => { dioWait.delete(b.id); const m = mats.get('R' + s); if (m) { m.uniforms.map.value.dispose(); mats.delete('R' + s) } })
        return BLANK_D
      }
      dioramas.set(b.id, d)
      d.setSilhouette(!recs[s - FRONT])
      d.update(0, 0.016)
      // 先在背景編好著色器（鳥的材質在這個小場景裡的燈光組合不一樣），好了才開始畫
      renderer.compileAsync(d.scene, d.cam).then(() => { d.ready = true })
    }
    return d
  }
  // 翻到某隻鳥那一頁＝讀過：存檔、目錄重畫（那一頁這次還留著 NEW，下次打開才拿掉）
  function markRead(s) {
    if (s < FRONT || !unread[s - FRONT]) return
    unread[s - FRONT] = false; onRead(BIRDS[s - FRONT].id)
    // 前言（新紀錄數）和目錄（NEW）重畫
    for (let q = 0; q < FRONT; q++) for (const k of (q ? ['L', 'R', 'B'] : ['R']).map((c) => c + q)) { const m = mats.get(k); if (m) { if (k[0] !== 'B') m.uniforms.map.value.dispose(); mats.delete(k) } }
  }
  // 扉頁插圖：帝雉（地上的鳥，沒有樹枝被切到），永遠是彩色（跟有沒有拍到無關），自己一個小場景
  let frontD = null
  function frontis() {
    if (!frontD) {
      frontD = makeDiorama(BIRDS.find((b) => b.id === 'mikado') ?? BIRDS[0], FRONTIS, 1.45)
      frontD.update(0, 0.016)
      renderer.compileAsync(frontD.scene, frontD.cam).then(() => { frontD.ready = true })
    }
    return frontD
  }
  const warmAround = (s) => { for (const k of [s - 1, s, s + 1, s + 2]) if (k >= FRONT && k < NS) diorama(k) }

  // 狀態
  const st = { open: false, t: 0, target: 0, spread: 0, flip: null, time: 0 }
  const hud = document.createElement('div')
  hud.className = 'guide-ui'; hud.hidden = true
  hud.innerHTML = `<button class="x" aria-label="${tr('關閉')}"><svg width="18" height="18" viewBox="0 0 18 18"><path d="M3 3l12 12M15 3L3 15" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg></button>
    <div class="guide-hint">${tr('← → 翻頁　Home 回目錄　E 闔上')}</div>`
  document.body.appendChild(hud)
  hud.querySelector('.x').onclick = () => close()

  function open() {
    if (st.open) return
    refresh()
    st.open = true; st.target = 1; hud.hidden = false
    warmAround(st.spread); markRead(st.spread)
  }
  function close(why) {
    if (!st.open) return
    setHover(null)
    st.open = false; st.target = 0; hud.hidden = true; st.flip = null
    onClose?.(why)
  }
  function turn(dirn) {
    if (!st.open || st.t < 0.98) return
    if (st.flip) { if (st.flip.queue === 0) st.flip.queue = dirn; return }
    jump(st.spread + dirn)
  }
  // 直接翻到第 to 個跨頁（目錄點鳥名、回到目錄）：一張紙翻過去，紙的正面是現在的右頁、背面是目標的左頁
  function jump(to) {
    if (!st.open || st.t < 0.98 || st.flip || to === st.spread || to < 0 || to >= NS) return
    st.flip = { dirn: Math.sign(to - st.spread), from: st.spread, to, p: 0, queue: 0 }
    sfx('page'); setHover(null)
    warmAround(to)
  }
  // 點書頁：打到哪一頁、換成畫布像素，看是不是點到目錄的一行、或「回到目錄」
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2()
  function pagePick(e) {
    if (st.flip || st.t < 0.98) return null
    const r = renderer.domElement.getBoundingClientRect()
    ndc.set((e.clientX - r.left) / r.width * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
    ray.setFromCamera(ndc, cam)
    const hit = ray.intersectObjects([leftPage, rightPage], false)[0]
    if (!hit?.uv) return null
    const x = hit.uv.x * CW, y = (1 - hit.uv.y) * CH
    if (st.spread >= 1 && st.spread < FRONT) {
      const p = (st.spread - 1) * 2 + (hit.object === rightPage ? 1 : 0), step = tocStep()
      const r = Math.round((y - TOC_Y0 + 8) / step), i = p * TOC_PER + r
      if (r >= 0 && r < TOC_PER && i < BIRDS.length && x > TOC_X0 - 10 && x < TOC_X1 + 10) {
        const yc = TOC_Y0 + r * step - 8
        return { to: i + FRONT, key: 'row' + i, page: hit.object, box: [TOC_X0 - 12, yc - step / 2 + 1, TOC_X1 + 12, yc + step / 2 - 1] }
      }
    }
    if (st.spread >= FRONT && hit.object === leftPage && x > BACK.x0 && x < BACK.x1 && y > BACK.y0 && y < BACK.y1) return { to: TOC_S, key: 'back', page: leftPage, box: [BACK.x0 + 20, BACK.y0 + 6, BACK.x1, BACK.y1 - 4] }
    return null
  }
  // 滑過／按下的反白（按鈕手感）：一片半透明的綠色方塊疊在那一行（或「回到目錄」）上面，按下去變深、縮一點
  const hl = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0x5b6e3c, transparent: true, opacity: 0, depthWrite: false }))
  hl.visible = false; hl.renderOrder = 3
  let hover = null, pressed = false
  function setHover(pk) {
    const key = pk?.key ?? null
    if (key !== (hover?.key ?? null) && key) sfx('hover')
    hover = pk
    if (!pk) { hl.visible = false; return }
    const [x0, y0, x1, y1] = pk.box   // 畫布像素 → 頁面座標（頁面 x 0～PW、y -PH/2～PH/2）
    pk.page.add(hl)
    hl.position.set((x0 + x1) / 2 / CW * PW, (0.5 - (y0 + y1) / 2 / CH) * PH, 0.0015)
    hl.scale.set((x1 - x0) / CW * PW * (pressed ? 0.985 : 1), (y1 - y0) / CH * PH * (pressed ? 0.92 : 1), 1)
    hl.material.opacity = pressed ? 0.28 : 0.16
    hl.visible = true
  }
  addEventListener('keydown', (e) => {
    if (!st.open) return
    if (e.code === 'ArrowRight' || e.code === 'KeyD' || e.code === 'PageDown') turn(1)
    else if (e.code === 'ArrowLeft' || e.code === 'KeyA' || e.code === 'PageUp') turn(-1)
    else if (e.code === 'Home' || e.code === 'KeyT') jump(TOC_S)
    else if (e.code === 'Escape') close('esc')
  })
  renderer.domElement.addEventListener('click', (e) => {
    if (!st.open) return
    const pk = pagePick(e)
    pressed = false; setHover(null)
    if (pk) { sfx('click'); jump(pk.to) } else turn(e.clientX > innerWidth / 2 ? 1 : -1)
  })
  renderer.domElement.addEventListener('mousemove', (e) => {
    if (!st.open) return
    const pk = pagePick(e)
    renderer.domElement.style.cursor = pk ? 'pointer' : ''
    setHover(pk)
  })
  renderer.domElement.addEventListener('mousedown', (e) => { if (st.open && hover) { pressed = true; setHover(hover) } })
  addEventListener('mouseup', () => { if (pressed) { pressed = false; if (hover) setHover(hover) } })
  let wheelT = 0
  addEventListener('wheel', (e) => { if (!st.open || performance.now() - wheelT < 350 || Math.abs(e.deltaY) < 4) return; wheelT = performance.now(); turn(e.deltaY > 0 ? 1 : -1) })

  function render(dt) {
    if (st.t <= 0 && !st.open) return
    st.time += dt
    st.t = st.target >= st.t ? Math.min(1, st.t + dt / 1.5) : Math.max(0, st.t - dt / 0.6)   // >=：以前開到 1 之後會被當成「要闔上」扣一點，t 在 0.97～1 之間跳，翻頁（要 ≥ 0.98）約一半按了沒反應
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
        st.spread = f.to; markRead(f.to)
        const q = f.queue; st.flip = null
        if (q) turn(q)
      }
    }
    const F = st.flip
    let A, B
    if (F) { A = Math.min(F.from, F.to); B = Math.max(F.from, F.to) } else A = B = st.spread   // 跳頁時 A、B 不相鄰：左頁 A、右頁 B，翻的紙正面 A 的右頁、背面 B 的左頁
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
      if (s < FRONT || (!F && s !== st.spread)) continue
      const d = diorama(s)
      if (!d.ready) continue
      d.update(st.time, dt); d.render(renderer)
      mat('R', s).uniforms.hasPlate.value = 1
    }
    // 扉頁的插圖：看得到左頁 0 時也每格畫
    if (A === 0 && opn > 0.3) { const d = frontis(); if (d.ready) { d.update(st.time, dt); d.render(renderer); mat('L', 0).uniforms.hasPlate.value = 1 } }
    if (st.spread >= FRONT && !F) { const d = diorama(st.spread); if (d.ready) { mat('R', st.spread).uniforms.hasPlate.value = 1 } }

    const ac = renderer.autoClear
    renderer.autoClear = false; renderer.clearDepth()
    renderer.render(scene, cam)
    renderer.autoClear = ac
  }
  return { open, close, render, turn, jump, get isOpen() { return st.open }, get visible() { return st.t > 0 }, st, dbg: { scene, cam, leftPage, rightPage, mats, dim, dioramas } }
}
