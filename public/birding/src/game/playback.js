// 相機回放（2026-11-08，取代原本網頁式的相簿）：按 Tab，整個畫面變成相機背面——中間是螢幕、右邊一排實體按鈕、十字鍵。
// 跟真的單眼一樣：
//   一開始顯示最後拍的那張；◀ ▶（方向鍵、A/D、滾輪）上一張、下一張
//   縮小鍵（Q、−）：單張 → 4 張 → 9 張 → 36 張的索引畫面，方向鍵移動選取框，SET（Enter）回到單張
//   放大鍵（E、＋）：單張時放大 2×、4×、8×（從鳥的位置開始），方向鍵移動看哪裡；索引畫面時是回到少一點張數
//   INFO（I）：資訊切換——只有照片 → 拍攝資料（張數、光圈快門 ISO、焦距、時間）→ 詳細（鳥種、分數、估價、評語）
//   刪除鍵（Delete、X）：螢幕上跳出確認，預設停在「取消」；賣掉的照片有鎖、不能刪
//   Tab、Esc 關掉
// 照片照時間排：最舊的在第一張（跟相機的檔案編號一樣）。
import { t as tr, birdName } from '../i18n.js'

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
const GRIDS = [1, 4, 9, 36], ZOOMS = [1, 2, 4, 8]
// 快門顯示成相機的標準檔位（自動模式算出來的是連續值，像 1/399，真的相機會顯示 1/400）
const STD = [8000, 6400, 5000, 4000, 3200, 2500, 2000, 1600, 1250, 1000, 800, 640, 500, 400, 320, 250, 200, 160, 125, 100, 80, 60, 50, 40, 30, 25, 20, 15, 13, 10, 8, 6, 5, 4, 3]
const shutterStr = (t) => t >= 0.4 ? `${Math.round(t * 10) / 10}"` : `1/${STD.reduce((b, d) => Math.abs(Math.log(d * t)) < Math.abs(Math.log(b * t)) ? d : b)}`
const pad2 = (n) => String(n).padStart(2, '0')
const when = (ms) => { const d = new Date(ms); return `${d.getFullYear()}/${pad2(d.getMonth() + 1)}/${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}` }

export function createPlayback({ photos, onDelete, onClose }) {
  const el = document.createElement('div')
  el.className = 'cam-play'; el.hidden = true
  el.innerHTML = `<div class="cp-body">
      <div class="cp-lcd"><div class="cp-view"></div><div class="cp-osd"></div></div>
      <div class="cp-side">
        <button class="cp-btn" data-k="play" title="▶">▶</button>
        <button class="cp-btn" data-k="out" title="Q / −"><span class="ic">⊟</span></button>
        <button class="cp-btn" data-k="in" title="E / +"><span class="ic">⊕</span></button>
        <button class="cp-btn txt" data-k="info" title="I">INFO</button>
        <button class="cp-btn del" data-k="del" title="Delete">🗑</button>
      </div>
      <div class="cp-dpad">
        <button data-k="up">▲</button><button data-k="left">◀</button><button class="set" data-k="set">SET</button><button data-k="right">▶</button><button data-k="down">▼</button>
      </div>
    </div>
    <div class="cp-hint"></div>`
  document.body.appendChild(el)
  const view = el.querySelector('.cp-view'), osd = el.querySelector('.cp-osd'), hint = el.querySelector('.cp-hint')
  const st = { list: [], i: 0, grid: 0, zoom: 0, px: 0.5, py: 0.5, info: 1, confirm: null, msg: '', msgT: 0 }

  const cur = () => st.list[st.i]
  function center(p) {   // 放大從哪裡開始：主角鳥在畫面上的位置（沒有就畫面中間）
    const b = p?.subject?.box
    if (!b) return [0.5, 0.5]
    return [((b[0] + b[2]) / 2 + 1) / 2, (1 - (b[1] + b[3]) / 2) / 2]
  }
  function render() {
    const n = st.list.length, p = cur()
    hint.textContent = tr('◀ ▶ 上一張／下一張　Q 縮小（多張）　E 放大　I 資訊　Delete 刪除　Tab 關閉')
    if (!n) { view.innerHTML = `<div class="cp-empty">${tr('沒有影像')}</div>`; osd.innerHTML = ''; return }
    const G = GRIDS[st.grid]
    if (G === 1) {
      const z = ZOOMS[st.zoom]
      // 放大：圖片放大 z 倍，(px, py) 是螢幕中間要對到的那一點（0～1），不讓圖片邊緣跑進螢幕
      const half = 0.5 / z
      st.px = Math.min(1 - half, Math.max(half, st.px)); st.py = Math.min(1 - half, Math.max(half, st.py))
      const tx = (0.5 - st.px * z) * 100, ty = (0.5 - st.py * z) * 100
      view.innerHTML = `<img class="cp-one" src="${p.url}" alt="" style="width:${z * 100}%;height:${z * 100}%;left:${tx + 0}%;top:${ty}%">` +
        (z > 1 ? `<div class="cp-nav"><i style="left:${(st.px - half) * 100}%;top:${(st.py - half) * 100}%;width:${100 / z}%;height:${100 / z}%"></i></div>` : '')
    } else {
      const cols = Math.sqrt(G), page = Math.floor(st.i / G) * G
      let h = `<div class="cp-grid" style="grid-template-columns:repeat(${cols},1fr);grid-template-rows:repeat(${cols},1fr)">`
      for (let k = page; k < page + G; k++) {
        const q = st.list[k]
        h += q ? `<div class="cp-cell${k === st.i ? ' sel' : ''}" data-i="${k}"><img src="${q.url}" alt="">${q.sold ? '<b class="lock">🔒</b>' : ''}</div>` : '<div class="cp-cell empty"></div>'
      }
      view.innerHTML = h + '</div>'
    }
    // 螢幕上的字（OSD）
    let o = ''
    if (st.info >= 1 || G > 1) {
      o += `<div class="cp-top"><span>▶</span><span>${st.i + 1}/${n}</span>${p.sold ? '<span>🔒</span>' : ''}${G === 1 && ZOOMS[st.zoom] > 1 ? `<span>×${ZOOMS[st.zoom]}</span>` : ''}</div>`
      if (G === 1 && p.exif) o += `<div class="cp-bot"><span>f/${p.exif.N}</span><span>${shutterStr(p.exif.t)}</span><span>ISO ${p.exif.iso}</span><span>${p.focal}mm</span><span>${p.exif.over > 0 ? '+' : ''}${p.exif.over ?? 0}EV</span><span class="r">${when(p.time)}</span></div>`
    }
    if (st.info >= 2 && G === 1) {
      const name = p.subject ? birdName(p.subject.id, p.subject.name) : tr('沒拍到鳥')
      o += `<div class="cp-detail"><b>${esc(name)}</b><span>${tr('{n} 分', { n: p.score })}</span><span>${p.sold ? tr('已售出 ${p}', { p: p.soldFor }) : tr('估價 ${p}', { p: p.price })}</span>
        <p>${esc(p.body ?? '')}・${esc(p.lens ?? '')}</p><p>${esc((p.notes ?? []).join(tr('、')) || tr('拍得不錯'))}</p>${p.judge ? `<p class="judge">「${esc(p.judge)}」</p>` : ''}</div>`
    }
    if (st.confirm) o += `<div class="cp-confirm"><p>${tr('刪除這張')}？</p><div><span class="${st.confirm.yes ? 'on' : ''}" data-c="yes">${tr('刪除')}</span><span class="${st.confirm.yes ? '' : 'on'}" data-c="no">${tr('取消')}</span></div></div>`
    if (st.msg) o += `<div class="cp-msg">${esc(st.msg)}</div>`
    osd.innerHTML = o
  }
  function flash(m) { st.msg = m; clearTimeout(st.msgT); st.msgT = setTimeout(() => { st.msg = ''; render() }, 1400) }

  function press(k) {
    const n = st.list.length, G = GRIDS[st.grid], z = ZOOMS[st.zoom]
    if (st.confirm) {
      if (k === 'left' || k === 'right' || k === 'up' || k === 'down') st.confirm.yes = !st.confirm.yes
      else if (k === 'set') {
        if (st.confirm.yes) { const p = cur(); st.list.splice(st.i, 1); onDelete(p); st.i = Math.min(st.i, st.list.length - 1); st.zoom = 0 }
        st.confirm = null
      } else if (k === 'del' || k === 'back') st.confirm = null
      return render()
    }
    if (k === 'info') st.info = (st.info + 1) % 3
    else if (!n) return render()
    else if (k === 'play') { st.grid = 0; st.zoom = 0 }
    else if (k === 'del') { if (cur().sold) flash(tr('已售出的照片不能刪除')); else st.confirm = { yes: false } }
    else if (k === 'out') {
      if (G === 1 && z > 1) st.zoom--                                    // 放大中：先縮回來
      else if (st.grid < GRIDS.length - 1) { st.grid++; st.zoom = 0 }
    } else if (k === 'in') {
      if (G > 1) st.grid--
      else if (st.zoom < ZOOMS.length - 1) { if (st.zoom === 0) [st.px, st.py] = center(cur()); st.zoom++ }
    } else if (k === 'set') { if (G > 1) st.grid = 0; else if (z > 1) st.zoom = 0 }
    else if (G === 1 && z > 1) {                                          // 放大中：方向鍵移動看的位置
      const d = 0.25 / z
      if (k === 'left') st.px -= d; if (k === 'right') st.px += d; if (k === 'up') st.py -= d; if (k === 'down') st.py += d
    } else if (G === 1) {
      if (k === 'left' || k === 'up') st.i = (st.i - 1 + n) % n           // 跟相機一樣：到頭就繞回去
      if (k === 'right' || k === 'down') st.i = (st.i + 1) % n
    } else {
      const cols = Math.sqrt(G)
      const d = { left: -1, right: 1, up: -cols, down: cols }[k] ?? 0
      st.i = Math.min(n - 1, Math.max(0, st.i + d))
    }
    render()
  }
  const KEYMAP = { ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down',
    KeyQ: 'out', Minus: 'out', NumpadSubtract: 'out', KeyE: 'in', Equal: 'in', NumpadAdd: 'in', KeyI: 'info', Delete: 'del', Backspace: 'del', KeyX: 'del',
    Enter: 'set', NumpadEnter: 'set', Space: 'set', KeyP: 'play' }
  // 回傳 true＝這個鍵回放畫面用掉了（main.js 就不再處理）
  function key(e) {
    if (el.hidden) return false
    if (e.code === 'Tab' || e.code === 'Escape') { e.preventDefault(); if (st.confirm && e.code === 'Escape') { st.confirm = null; render(); return true } close(); return true }
    const k = KEYMAP[e.code]
    if (k) { e.preventDefault(); press(k) }
    return true
  }
  el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-k]'), c = e.target.closest('[data-c]'), cell = e.target.closest('.cp-cell[data-i]')
    if (c && st.confirm) { st.confirm.yes = c.dataset.c === 'yes'; return press('set') }
    if (b) return press(b.dataset.k)
    if (cell) { const i = +cell.dataset.i; if (i === st.i) press('set'); else { st.i = i; render() } }
  })
  let wheelT = 0
  el.addEventListener('wheel', (e) => {
    e.preventDefault()
    const now = performance.now(); if (now - wheelT < 120) return; wheelT = now   // 觸控板一次滑會連發很多個
    press(e.deltaY > 0 ? (GRIDS[st.grid] > 1 ? 'down' : 'right') : (GRIDS[st.grid] > 1 ? 'up' : 'left'))
  }, { passive: false })

  function open() {
    st.list = [...photos].sort((a, b) => a.time - b.time)
    st.i = st.list.length - 1; st.grid = 0; st.zoom = 0; st.confirm = null; st.msg = ''
    render(); el.hidden = false
  }
  function close() { el.hidden = true; st.confirm = null; onClose?.() }
  return { open, close, key, render, press, get isOpen() { return !el.hidden }, st }
}
