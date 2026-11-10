// 相機行的面板（店本身在 store.js：溫室入口外面那棟）。靠近按 E：賣照片給老闆（老闆給評語和價錢）、買或換機身和鏡頭
import { BODIES, LENSES } from './camera.js'
import { MIN_SCORE } from './scoring.js'
import { t as tr, birdName } from '../i18n.js'


const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])

// 面板：賣照片／器材
export function createShop({ state, photos, comm, judge, onChange, onClose, onView }) {
  const el = document.createElement('div')
  el.className = 'sheet'; el.hidden = true
  document.body.appendChild(el)
  let tab = 'sell', busy = false, last = null, prog = null, batch = null   // prog：一鍵賣出的進度 {i, n}；batch：一鍵賣出的結果
  const owned = (id) => state.owned.includes(id)
  function gearRow(it, kind) {
    const using = kind === 'body' ? state.bodyId === it.id : state.lensId === it.id
    const spec = kind === 'body' ? tr('對焦 {af}s・連拍 {fps} 張/秒・ISO {iso}', { af: it.af, fps: it.fps, iso: it.iso }) : `${it.min === it.max ? it.min : it.min + '–' + it.max}mm・f/${it.ap}`
    const btn = using ? `<span class="pill">${tr('使用中')}</span>`
      : owned(it.id) ? `<button class="btn ghost" data-use="${kind}:${it.id}">${tr('換上')}</button>`
      : `<button class="btn" data-buy="${kind}:${it.id}" ${state.money < it.price ? 'disabled' : ''}>${tr('買 ${p}', { p: it.price.toLocaleString() })}</button>`
    return `<div class="row gear-row" data-id="${it.id}" data-view="${it.id}"><div><b>${esc(it.name)}</b><div class="muted">${spec}</div></div><button class="btn ghost view3d" data-view="${it.id}">${tr('360° 查看')}</button>${btn}</div>`
  }
  // 委託清單：主線（老闆的話）＋今天的 3 個每日委託
  function commHtml() {
    if (!comm) return ''
    const m = comm.main
    const mainRow = m ? `<div class="comm main"><div><span class="tag">${tr('主線 {i}/{n}', { i: comm.mainIndex + 1, n: comm.mainTotal })}</span><b>${esc(comm.condText(m))}</b><p class="muted">「${esc(tr(m.say))}」</p></div><span class="reward">+$ ${m.reward.toLocaleString()}</span></div>`
      : `<div class="comm main"><div><span class="tag">${tr('主線')}</span><b>${tr('主線委託全部完成！')}</b></div></div>`
    const daily = comm.daily.map((d) => `<div class="comm ${d.done ? 'done' : ''}"><div><span class="tag">${tr('每日')}</span><b>${esc(comm.condText(d))}</b></div><span class="reward">${d.done ? tr('完成') : '+$ ' + d.reward.toLocaleString()}</span></div>`).join('')
    return `<div class="comms"><h3>${tr('老闆的委託')}<span class="muted">${tr('第 {d} 天・每日委託清晨 6 點更新', { d: comm.day })}</span></h3>${mainRow}${daily}<p class="muted">${tr('符合委託的照片照常賣，老闆另外再加委託獎金。一張照片只算一個委託。')}</p></div>`
  }
  // 賣一張：老闆評價＋（符合的話）委託獎金
  async function sellOne(p) {
    const c = comm?.matchFor(p)
    const r = await judge(p)
    if (!Number.isFinite(r.price)) r.price = 0      // 不管哪裡算錯，錢都不能變成 NaN 存進存檔
    const bonus = c ? c.reward : 0
    p.sold = true; p.soldFor = r.price + bonus; p.judge = r.comment
    if (c) { p.comm = { cond: comm.condText(c), reward: bonus, kind: c.kind }; comm.complete(c) }
    state.money += r.price + bonus; state.sold++; state.earned += r.price + bonus
    window.gtag?.('event', 'photo_sold', { bird: p.subject?.id, score: p.score, price: r.price + bonus, commission: !!c })
    return { price: r.price, bonus }
  }
  function render() {
    const unsold = photos.filter((p) => !p.sold && p.subject && p.score >= MIN_SCORE && p.price > 0).sort((a, b) => b.score - a.score)   // 60 分以下不收
    el.innerHTML = `<div class="sheet-in"><header><button class="x" data-close aria-label="${tr('關閉')}" title="${tr('關閉')}"><svg viewBox="0 0 24 24" width="18" height="18"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg></button><h2>${tr('相機行')}</h2><span class="money-pill">$ ${state.money.toLocaleString()}</span>
      <nav><button class="tab ${tab === 'sell' ? 'on' : ''}" data-tab="sell">${tr('賣照片')}</button><button class="tab ${tab === 'gear' ? 'on' : ''}" data-tab="gear">${tr('器材')}</button></nav></header>
      ${tab === 'sell' ? `
        <p class="muted">${tr('老闆：「拍到什麼好照片？拿來給我看看。我這裡不是資源回收，{n} 分以上才收；100 分才給正常價，拍到難得的瞬間超過 100 分還會多給。」', { n: MIN_SCORE })}</p>
        <p class="muted tiers">${tr('60–69 分：一成　70–79：兩成半　80–89：五成　90–99：七成　100：正常價　100 以上：每分多 5%')}</p>
        ${commHtml()}
        ${unsold.length > 0 ? `<div class="sell-all"><button class="btn" data-sellall ${busy ? 'disabled' : ''}>${prog ? tr('老闆在看… {i}/{n}', prog) : tr('一鍵全部賣出（{n} 張，估價 ${p}）', { n: unsold.length, p: unsold.reduce((a, q) => a + q.price, 0).toLocaleString() })}</button></div>` : ''}
        ${batch ? `<div class="judged"><img src="${batch.best.url}" alt=""><div><h3>${tr('全部賣出：{n} 張，共 ${p}', { n: batch.n, p: batch.total.toLocaleString() })}</h3>${batch.bonus ? `<p class="comm-hit">${tr('完成 {n} 個委託，獎金 ${p}', { n: batch.hits, p: batch.bonus.toLocaleString() })}</p>` : ''}<p class="judge">「${esc(batch.best.judge)}」</p></div></div>` : ''}
        ${last && !batch ? `<div class="judged"><img src="${last.url}" alt=""><div><h3>${esc(birdName(last.subject.id, last.subject.name))}　${tr('賣了 ${p}', { p: last.soldFor })}</h3>${last.comm ? `<p class="comm-hit">${tr('委託完成：{c}（獎金 ${p}）', { c: last.comm.cond, p: last.comm.reward.toLocaleString() })}</p>` : ''}<p class="judge">「${esc(last.judge)}」</p></div></div>` : ''}
        <div class="grid">${unsold.map((p) => `<figure data-t="${p.time}"><img src="${p.url}" alt=""><figcaption><b>${esc(birdName(p.subject.id, p.subject.name))}</b><span>${tr('{n} 分', { n: p.score })}</span><span>${tr('估價 ${p}', { p: p.price })}</span>${comm?.matchFor(p) ? `<span class="comm-badge">${tr('符合委託 +${p}', { p: comm.matchFor(p).reward.toLocaleString() })}</span>` : ''}
          <button class="btn" data-sell="${p.time}" ${busy ? 'disabled' : ''}>${busy ? tr('老闆在看…') : tr('賣')}</button></figcaption></figure>`).join('') || `<p class="muted">${tr('沒有可以賣的照片（{n} 分以上才收）。', { n: MIN_SCORE })}</p>`}</div>`
      : `<h3>${tr('機身')}</h3>${BODIES.map((b) => gearRow(b, 'body')).join('')}<h3>${tr('鏡頭')}</h3>${LENSES.map((l) => gearRow(l, 'lens')).join('')}`}
      </div>`
  }
  el.addEventListener('click', async (e) => {
    // 器材：點一列（或「360° 查看」）→ 器材介紹頁，3D 轉著看、左右換下一個
    const v = e.target.closest('[data-view]')
    if (v && !e.target.closest('[data-buy],[data-use]')) { const all = [...BODIES.map((b) => ({ ...b, kind: 'body' })), ...LENSES.map((l) => ({ ...l, kind: 'lens' }))]; return onView?.(all.find((x) => x.id === v.dataset.view), all) }
    const t = e.target.closest('button'); if (!t) return
    if (t.dataset.close != null) return close()
    if (t.dataset.tab) { tab = t.dataset.tab; return render() }
    if (t.dataset.use) { const [k, id] = t.dataset.use.split(':'); if (k === 'body') state.bodyId = id; else state.lensId = id; onChange(); return render() }
    if (t.dataset.buy) {
      const [k, id] = t.dataset.buy.split(':'), it = (k === 'body' ? BODIES : LENSES).find((x) => x.id === id)
      if (state.money < it.price) return
      state.money -= it.price; state.owned.push(id)
      window.gtag?.('event', 'gear_bought', { item: id })
      if (k === 'body') state.bodyId = id; else state.lensId = id
      onChange(); return render()
    }
    // 一鍵全部賣出（2026-11-08）：照一張一張賣的同一套（老闆每張都看、價錢一樣算），顯示進度，賣完顯示總共多少
    if (t.dataset.sellall != null && !busy) {
      const list = photos.filter((q) => !q.sold && q.subject && q.score >= MIN_SCORE && q.price > 0).sort((a, b) => b.score - a.score)
      if (!list.length) return
      busy = true; batch = null; last = null
      let total = 0, best = null, n = 0, bonus = 0, hits = 0
      try {
        for (let i = 0; i < list.length; i++) {
          prog = { i: i + 1, n: list.length }; render()
          const q = list[i], r = await sellOne(q)
          total += r.price + r.bonus; n++; if (r.bonus) { bonus += r.bonus; hits++ }
          if (!best || q.score > best.score) best = q
          onChange(q)
        }
      } finally {
        // 中間出錯也要把按鈕放回來（以前會一直卡在「老闆在看…」、再也按不了）
        prog = null; busy = false
        if (n) batch = { n, total, best, bonus, hits }
        render()
      }
      return
    }
    if (t.dataset.sell && !busy) {
      batch = null
      const p = photos.find((x) => x.time === +t.dataset.sell)
      if (!p || !p.subject || p.score < MIN_SCORE) return   // 保險：60 分以下一律不收
      busy = true; render()
      try { await sellOne(p) } catch (err) { console.warn('[shop] 賣照片出錯', err); busy = false; return render() }
      last = p; busy = false
      onChange(p); render()
    }
  })
  // tab：'sell' 賣照片／'gear' 器材；focus：器材頁要捲到、標亮的那一項（逛店時看著展示台按 E）
  function open(t, focus) {
    if (t) tab = t
    render(); el.hidden = false
    if (focus) { const row = el.querySelector(`[data-id="${focus}"]`); if (row) { row.classList.add('focus'); row.scrollIntoView({ block: 'center' }) } }
  }
  function close() { el.hidden = true; onClose?.() }
  return { open, close, get isOpen() { return !el.hidden }, render }
}
