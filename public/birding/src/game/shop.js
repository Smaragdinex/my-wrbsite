// 相機行的面板（店本身在 store.js：溫室入口外面那棟）。在櫃台按 E 跟老闆說話：
// 2026-11-14 使用者改版：
//   買器材 → 不再出一張清單，直接進器材介紹頁（product.js：3D 360° 轉著看＋價錢，左右換下一個）
//   賣照片 → 左邊老闆的委託、右邊可以賣的照片，只有一個「一鍵賣出」；按下去面板關掉、切到定格鏡頭看老闆一張一張看照片（appraise.js），
//            玩家不想等可以離開，老闆照樣看完、錢自動入帳
// 2026-11-16 使用者看了參考（寶可夢隨樂拍分項評分、沉浸式介面）選「第二個」：面板改成靠右的野外筆記本（.shop-note），
//   老闆留在畫面左邊（main.js 打開時鏡頭轉向老闆、不畫手），老闆的話改成他頭上的對話；
//   照片卡片：分數章、四個分項長條、特別瞬間加成、收購成數、符合哪個委託；委託清單標出「手上已經有符合的照片」
import { BODIES, LENSES } from './camera.js'
import { MIN_SCORE, breakdown, tierLabel } from './scoring.js'
import { t as tr, birdName } from '../i18n.js'

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])

export function createShop({ state, photos, comm, judge, onClose, onView, onAppraise, say }) {
  const el = document.createElement('div')
  el.className = 'sheet shop-note'; el.hidden = true
  document.body.appendChild(el)
  let tab = 'menu'
  const sellable = () => photos.filter((p) => !p.sold && p.subject && p.score >= MIN_SCORE && p.price > 0).sort((a, b) => b.score - a.score)   // 60 分以下不收
  const gearList = () => [...BODIES.map((b) => ({ ...b, kind: 'body' })), ...LENSES.map((l) => ({ ...l, kind: 'lens' }))]
  // 委託清單：主線（老闆的話）＋今天的 3 個每日委託
  function commHtml(have = new Set()) {
    if (!comm) return ''
    const m = comm.main
    const mark = (c) => have.has(c.id) ? `<span class="have">${tr('✓ 手上有照片')}</span>` : ''
    const mainRow = m ? `<div class="comm main"><div><span class="tag">${tr('主線 {i}/{n}', { i: comm.mainIndex + 1, n: comm.mainTotal })}</span><b>${esc(comm.condText(m))}</b>${mark(m)}<p class="muted">「${esc(tr(m.say))}」</p>
        <div class="main-prog"><i style="width:${(comm.mainIndex / comm.mainTotal * 100).toFixed(1)}%"></i></div></div><span class="reward">+$ ${m.reward.toLocaleString()}</span></div>`
      : `<div class="comm main"><div><span class="tag">${tr('主線')}</span><b>${tr('主線委託全部完成！')}</b></div></div>`
    const daily = comm.daily.map((d) => `<div class="comm ${d.done ? 'done' : ''}"><div><span class="tag">${tr('每日')}</span><b>${esc(comm.condText(d))}</b>${d.done ? '' : mark(d)}</div><span class="reward">${d.done ? tr('完成') : '+$ ' + d.reward.toLocaleString()}</span></div>`).join('')
    return `<div class="comms"><h3>${tr('老闆的委託')}<span class="muted">${tr('每日委託清晨 6 點更新')}</span></h3>${mainRow}${daily}</div>`
  }
  // 一張照片的卡片：拍立得＋分數章＋分項長條
  function card(p, k) {
    const b = breakdown(p), c = comm?.matchFor(p)
    const bars = b ? b.rows.map(([n, v]) => `<div class="bar"><span>${n}</span><i><b style="width:${Math.round(Math.max(0.04, Math.min(1, v)) * 100)}%"></b></i></div>`).join('') : ''
    return `<figure class="pc ${k % 2 ? 'r' : 'l'}"><div class="pc-pic"><img src="${p.url}" alt=""><span class="stamp ${p.score >= 100 ? 'gold' : ''}">${p.score}<small>${tr('分')}</small></span></div>
      <figcaption><div class="pc-top"><b class="pc-name">${esc(birdName(p.subject.id, p.subject.name))}</b><span class="pc-price">$${p.price.toLocaleString()}</span></div>
        <div class="bars">${bars}</div>
        ${b?.moment ? `<div class="moment">★ ${esc(b.moment.label)} ×${b.moment.mult}</div>` : ''}
        <div class="tier">${tr('{n} 分', { n: p.score })} → ${tierLabel(p.score)}</div>
        ${c ? `<div class="pc-comm">✓ ${tr('符合委託')}：${esc(comm.condText(c))}　+$${c.reward.toLocaleString()}</div>` : ''}</figcaption></figure>`
  }
  // 賣一張：老闆評價＋（符合的話）委託獎金（appraise.js 一張一張叫）
  async function sellOne(p) {
    const c = comm?.matchFor(p)
    const r = await judge(p)
    if (!Number.isFinite(r.price)) r.price = 0      // 不管哪裡算錯，錢都不能變成 NaN 存進存檔
    const bonus = c ? c.reward : 0
    p.sold = true; p.soldFor = r.price + bonus; p.judge = r.comment
    if (c) { p.comm = { cond: comm.condText(c), reward: bonus, kind: c.kind }; comm.complete(c) }
    state.money += r.price + bonus; state.sold++; state.earned += r.price + bonus
    window.gtag?.('event', 'photo_sold', { bird: p.subject?.id, score: p.score, price: r.price + bonus, commission: !!c })
    return { price: r.price, bonus, comment: r.comment }
  }
  const X = `<button class="x" data-close aria-label="${tr('關閉')}" title="${tr('關閉')}"><svg viewBox="0 0 24 24" width="18" height="18"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg></button>`
  function render() {
    if (tab === 'menu') {
      const n = sellable().length
      el.innerHTML = `<div class="sheet-in talk-in"><header>${X}<h2>${tr('相機行')}</h2></header>
        <div class="talk-choices">
          <button class="talk-btn" data-go="buy"><b>${tr('買器材')}</b><span>${tr('360° 看機身和鏡頭、價錢')}</span></button>
          <button class="talk-btn" data-go="sell"><b>${tr('賣照片')}</b><span>${n ? tr('{n} 張可以賣', { n }) : tr('沒有可以賣的照片（{n} 分以上才收）。', { n: MIN_SCORE })}</span></button>
        </div></div>`
      return
    }
    const list = sellable(), est = list.reduce((a, q) => a + q.price, 0)
    const have = new Set(list.map((p) => comm?.matchFor(p)?.id).filter(Boolean))
    el.innerHTML = `<div class="sheet-in sell-in"><header>${X}<h2>${tr('賣照片')}</h2><button class="back" data-go="menu">‹ ${tr('返回')}</button></header>
      ${commHtml(have)}
      <div class="band" title="${tr('60 分以上才收；100 分才給正常價')}"><em>${tr('收購價')}</em>${[[60, '10%'], [70, '25%'], [80, '50%'], [90, '70%'], [100, '100%+']].map(([a, k]) => `<span><b>${a}</b>${k}</span>`).join('')}</div>
      <div class="pcs">${list.map(card).join('') || `<p class="muted">${tr('沒有可以賣的照片（{n} 分以上才收）。', { n: MIN_SCORE })}</p>`}</div>
      ${list.length ? `<div class="sell-all"><button class="btn sell-btn" data-sellall>${tr('一鍵全部賣出（{n} 張，估價 ${p}）', { n: list.length, p: est.toLocaleString() })}</button></div>` : ''}
      </div>`
  }
  el.addEventListener('click', (e) => {
    const t = e.target.closest('button'); if (!t) return
    if (t.dataset.close != null) return close()
    if (t.dataset.go === 'menu' || t.dataset.go === 'sell') { tab = t.dataset.go; talk(); return render() }
    if (t.dataset.go === 'buy') {   // 直接進 360° 器材頁（從目前用的機身開始）
      const all = gearList(); el.hidden = true
      return onView?.(all.find((x) => x.id === state.bodyId) ?? all[0], all)
    }
    if (t.dataset.sellall != null) {
      const list = sellable(); if (!list.length) return
      el.hidden = true
      onAppraise?.(list)
    }
  })
  addEventListener('keydown', (e) => { if (!el.hidden && e.code === 'Escape') close() })
  // 老闆的話：講在他頭上（store.keeper.say），不再寫成面板裡的一段字
  function talk() {
    if (tab === 'menu') return say?.(tr('要買器材，還是有照片要賣？'), 4)
    const n = sellable().length
    say?.(n ? tr('拍到好照片了？拿來看看。') : tr('{n} 分以上的照片我才收喔。', { n: MIN_SCORE }), 4)
  }
  function open(t) { tab = t === 'sell' ? 'sell' : 'menu'; render(); el.hidden = false; talk() }
  function close() { if (el.hidden) return; el.hidden = true; onClose?.() }
  return { open, close, get isOpen() { return !el.hidden }, render, sellOne }
}
