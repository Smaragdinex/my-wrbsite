// 2026-11-14 使用者「手機版本上面是鳥、下面是描述文字，像 Instagram 一篇一篇，可以左右」：
// guide.html 在直的手機上不畫書，改成一張一張的卡片（第一張是封面＋前言，後面每種鳥一張），左右滑換鳥；
// 卡片上半是會動的 3D 插圖（跟書裡同一個 makeDiorama），下半是名字、棲地、出沒時間、稀有度、介紹、小知識，可以上下捲。
// 3D 只有一個 canvas：滑到哪張就把 canvas 搬進那張的插圖框；離開時留一張截圖，滑回來或滑動中看得到。
import * as THREE from 'three'
import { BIRDS } from '../birdinfo.js'
import { _makeDiorama as makeDiorama } from './guide.js'
import { MissingModel, ensureModel, modelsFor, modelFailed } from '../birds.js'
import { RARITY } from './judge.js'
import { activityLabel } from './presence.js'
import { t as tr, LANG, LANGS, setLang, FONT_SANS, FONT_SERIF } from '../i18n.js'

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
const css = document.createElement('style')
css.textContent = `
body.feed { overflow: hidden; background: #f1ead8; }
.fd-top { position: fixed; top: 0; left: 0; right: 0; z-index: 5; display: flex; align-items: center; gap: 6px; padding: max(10px, env(safe-area-inset-top)) 12px 10px; background: rgba(241,234,216,0.94); backdrop-filter: blur(6px); border-bottom: 1px solid rgba(80,60,30,0.15); }
.fd-top .lg { display: flex; gap: 4px; }
.fd-top button { all: unset; cursor: pointer; font: 12px ${FONT_SANS}; color: #5b5244; padding: 5px 9px; border-radius: 999px; border: 1px solid rgba(80,60,30,0.2); }
.fd-top button.on { background: #2d2a24; color: #f1ead8; border-color: #2d2a24; }
.fd-top .sp { flex: 1; }
.fd-top .n { font: 13px ${FONT_SERIF}; color: #7b7262; }
.fd-row { position: fixed; inset: 0; display: flex; overflow-x: auto; overflow-y: hidden; scroll-snap-type: x mandatory; scrollbar-width: none; background: #f1ead8; overscroll-behavior: contain; }
.fd-row::-webkit-scrollbar { display: none; }
.fd-card { flex: 0 0 100%; height: 100%; overflow-y: auto; scroll-snap-align: start; scroll-snap-stop: always; box-sizing: border-box; padding: calc(max(10px, env(safe-area-inset-top)) + 48px) 0 calc(28px + env(safe-area-inset-bottom)); color: #2d2a24; font: 16px/1.7 ${FONT_SANS}; }
.fd-pic { position: relative; width: 100%; aspect-ratio: 1 / 1; background: radial-gradient(circle at 50% 58%, rgba(180,196,160,0.45), rgba(180,196,160,0) 70%); }
.fd-pic img, .fd-pic canvas { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
.fd-txt { padding: 14px 20px 0; }
.fd-no { font: 13px ${FONT_SERIF}; color: #7b7262; letter-spacing: 0.05em; }
.fd-name { font: 600 30px/1.25 ${FONT_SERIF}; margin: 2px 0 0; }
.fd-name small { font-size: 17px; color: #7b7262; font-weight: 400; margin-left: 6px; }
.fd-sci { font: italic 16px Georgia, ${FONT_SERIF}; color: #7b7262; margin-bottom: 12px; }
.fd-meta { display: grid; grid-template-columns: auto 1fr; gap: 3px 14px; padding: 10px 0 12px; border-top: 1px solid rgba(80,60,30,0.2); border-bottom: 1px solid rgba(80,60,30,0.2); font-size: 15px; }
.fd-meta b { font-weight: 400; color: #7b7262; }
.fd-intro { margin: 14px 0 6px; }
.fd-h { color: #5b6e3c; font-weight: 700; margin-top: 12px; }
.fd-facts { margin: 4px 0 0; padding-left: 1.1em; }
.fd-facts li { margin: 4px 0; font-size: 15px; }
.fd-facts li::marker { color: #5b6e3c; }
.fd-cover { text-align: center; }
.fd-cover .ser { font: 11px ${FONT_SERIF}; letter-spacing: 0.25em; color: #7b7262; margin-top: 18px; }
.fd-cover h1 { font: 600 40px/1.2 ${FONT_SERIF}; margin: 10px 0 0; }
.fd-cover .en { font: italic 18px Georgia, ${FONT_SERIF}; color: #7b7262; }
.fd-cover .pic { width: 100%; aspect-ratio: 3 / 2; background: center / contain no-repeat url(models/guide/frontis_magpie_wc.jpg); mix-blend-mode: multiply; margin: 8px 0; }
.fd-cover .pre { text-align: left; padding: 0 22px; }
.fd-cover .go { display: inline-block; text-decoration: none; margin: 18px 0 6px; padding: 10px 18px; border-radius: 999px; background: #2d2a24; color: #f1ead8; font-size: 15px; }
.fd-hint { position: fixed; bottom: calc(10px + env(safe-area-inset-bottom)); left: 50%; transform: translateX(-50%); z-index: 4; font: 12px ${FONT_SANS}; color: #f1ead8; background: rgba(45,42,36,0.75); padding: 6px 12px; border-radius: 999px; transition: opacity 0.6s; pointer-events: none; white-space: nowrap; }
.fd-toc { position: fixed; inset: 0; z-index: 9; background: #f1ead8; overflow-y: auto; padding: calc(max(10px, env(safe-area-inset-top)) + 8px) 0 30px; }
.fd-toc[hidden] { display: none; }
.fd-toc h2 { font: 600 24px ${FONT_SERIF}; margin: 6px 20px 10px; display: flex; justify-content: space-between; align-items: center; }
.fd-toc h2 button { all: unset; cursor: pointer; font: 26px ${FONT_SANS}; color: #5b5244; padding: 0 6px; }
.fd-toc a { display: flex; gap: 12px; padding: 9px 20px; border-top: 1px solid rgba(80,60,30,0.1); color: #2d2a24; text-decoration: none; font-size: 16px; }
.fd-toc a i { color: #7b7262; font: 13px ${FONT_SERIF}; width: 2em; padding-top: 3px; font-style: normal; }
.fd-toc a span { flex: 1; }
.fd-toc a em { color: #7b7262; font: italic 13px Georgia, ${FONT_SERIF}; }
`
document.head.appendChild(css)
document.body.classList.add('feed')

// ---------- 版面 ----------
const top = document.createElement('div'); top.className = 'fd-top'
top.innerHTML = `<div class="lg">${LANGS.map((l) => `<button data-lang="${l.id}" class="${l.id === LANG ? 'on' : ''}">${l.label}</button>`).join('')}</div><span class="sp"></span><span class="n"></span><button class="tocb">${esc(tr('目錄'))}</button>`
document.body.appendChild(top)
top.onclick = (e) => {
  const b = e.target.closest('[data-lang]')
  if (b && b.dataset.lang !== LANG) { const u = new URL(location.href); u.searchParams.delete('lang'); history.replaceState(null, '', u); setLang(b.dataset.lang) }
  if (e.target.closest('.tocb')) toc.hidden = false
}
const counter = top.querySelector('.n')

const row = document.createElement('div'); row.className = 'fd-row'
const cover = `<section class="fd-card fd-cover">
  <div class="ser">X-ARTS NATURAL HISTORY SERIES</div>
  <h1>${esc(tr('鳥類圖鑑'))}</h1><div class="en">Birds of the Park</div>
  <div class="pic"></div>
  <div class="pre"><p>${esc(tr('這本圖鑑收錄《Birdwatch》園區裡可以遇見的 {m} 種野鳥：每一種都有會動的插圖、在園區的棲地、出沒時間，還有介紹和小知識。', { m: BIRDS.length }))}</p>
  <p>${esc(tr('帶著相機走進公園，拍到的鳥會記進你自己的圖鑑：xarts.games/birding/game.html'))}</p></div>
  <a class="go" href="game.html">${esc(tr('開始遊戲'))}</a>
</section>`
row.innerHTML = cover + BIRDS.map((b, i) => `<section class="fd-card" data-i="${i}">
  <div class="fd-pic"></div>
  <div class="fd-txt">
    <div class="fd-no">No. ${String(i + 1).padStart(2, '0')}</div>
    <h2 class="fd-name">${esc(b.name)}${b.nick ? `<small>（${esc(b.nick)}）</small>` : ''}</h2>
    <div class="fd-sci">${esc(b.sci)}</div>
    <div class="fd-meta"><b>${esc(tr('棲地'))}</b><span>${esc(b.where)}</span><b>${esc(tr('出沒時間'))}</b><span>${esc(tr(activityLabel(b.id)))}</span><b>${esc(tr('稀有度'))}</b><span>${esc(tr(RARITY[b.id] ?? '普通'))}</span></div>
    <p class="fd-intro">${esc(b.intro)}</p>
    <div class="fd-h">${esc(tr('小知識'))}</div>
    <ul class="fd-facts">${b.facts.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>
  </div></section>`).join('')
document.body.appendChild(row)
const cards = [...row.children]   // 0＝封面，1～84＝鳥

const toc = document.createElement('div'); toc.className = 'fd-toc'; toc.hidden = true
toc.innerHTML = `<h2>${esc(tr('目錄'))}<button aria-label="close">×</button></h2>` + BIRDS.map((b, i) => `<a href="#" data-i="${i + 1}"><i>${String(i + 1).padStart(2, '0')}</i><span>${esc(b.name)}</span><em>${esc(b.sci)}</em></a>`).join('')
document.body.appendChild(toc)
toc.onclick = (e) => {
  e.preventDefault()
  if (e.target.closest('h2 button')) { toc.hidden = true; return }
  const a = e.target.closest('a[data-i]'); if (!a) return
  toc.hidden = true; go(+a.dataset.i, false)
}

const hint = document.createElement('div'); hint.className = 'fd-hint'; hint.textContent = tr('左右滑動換下一種鳥')
document.body.appendChild(hint)
setTimeout(() => { hint.style.opacity = 0 }, 4500)

// ---------- 3D 插圖 ----------
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true })
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2))
renderer.outputColorSpace = THREE.SRGBColorSpace
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05
renderer.shadowMap.enabled = true
renderer.setClearColor(0x000000, 0)
const canvas = renderer.domElement
const SQ = { w: 1, h: 1.32 }   // makeDiorama 的鏡頭比例＝P.w / P.h × 頁寬 / 頁高（1 : 1.32）→ 這樣是正方形
const dios = new Map(), waiting = new Set()
function dio(b) {
  if (dios.has(b.id)) return dios.get(b.id)
  if (waiting.has(b.id)) return null
  try {
    const d = makeDiorama(b, SQ, 0.82); d.update(0, 0.016); d.ready = false
    renderer.compileAsync(d.scene, d.cam).then(() => { d.ready = true })
    dios.set(b.id, d); return d
  } catch (e) {
    if (!(e instanceof MissingModel)) throw e
    if (modelFailed(e.model)) { dios.set(b.id, null); return null }
    waiting.add(b.id)
    Promise.all([...modelsFor(b.id).map(ensureModel), ensureModel(e.model)]).then(() => waiting.delete(b.id))
    return null
  }
}
const shots = new Map()   // 每張卡離開時留一張截圖
let cur = -1, shownT = 0
function attach(k) {
  if (k === cur) return
  // 離開的那張：留截圖
  if (cur > 0 && shownT > 0.8) { const url = canvas.toDataURL('image/webp', 0.85); shots.set(cur, url); const pic = cards[cur].querySelector('.fd-pic'); let im = pic.querySelector('img'); if (!im) { im = document.createElement('img'); pic.appendChild(im) } im.src = url }
  cur = k; shownT = 0
  counter.textContent = k ? `${k} / ${BIRDS.length}` : ''
  if (k > 0) { const pic = cards[k].querySelector('.fd-pic'); pic.appendChild(canvas); const r = pic.getBoundingClientRect(); renderer.setSize(r.width, r.width, true) }
  else canvas.remove()
  try { history.replaceState(null, '', k ? `#${BIRDS[k - 1].id}` : location.pathname + location.search) } catch {}
  // 先載前後兩隻
  for (const j of [k + 1, k - 1, k + 2]) if (j > 0 && j <= BIRDS.length) dio(BIRDS[j - 1])
}
function go(k, smooth = true) { row.scrollTo({ left: k * row.clientWidth, behavior: smooth ? 'smooth' : 'instant' }); attach(k) }
row.addEventListener('scroll', () => { const k = Math.round(row.scrollLeft / row.clientWidth); if (Math.abs(row.scrollLeft - k * row.clientWidth) < 2) attach(k) }, { passive: true })
row.addEventListener('scrollend', () => attach(Math.round(row.scrollLeft / row.clientWidth)))
addEventListener('resize', () => { if (cur > 0) { const r = cards[cur].querySelector('.fd-pic').getBoundingClientRect(); renderer.setSize(r.width, r.width, true) } row.scrollLeft = cur * row.clientWidth })
addEventListener('keydown', (e) => { if (e.code === 'ArrowRight') go(Math.min(BIRDS.length, cur + 1)); if (e.code === 'ArrowLeft') go(Math.max(0, cur - 1)) })

// 網址 #鳥的id 可以直接開那一隻（分享用）
const start = Math.max(0, BIRDS.findIndex((b) => b.id === location.hash.slice(1)) + 1)
requestAnimationFrame(() => go(start, false))

let last = performance.now(), T = 0
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000); last = now; T += dt
  if (cur > 0) {
    const d = dio(BIRDS[cur - 1])
    if (d && d.ready) { d.update(T, dt); renderer.setRenderTarget(null); renderer.clear(); renderer.render(d.scene, d.cam); shownT += dt }
  }
  requestAnimationFrame(frame)
}
requestAnimationFrame(frame)
window.__feed = { go, get cur() { return cur } }   // 測試腳本用
