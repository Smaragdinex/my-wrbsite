// 相機行的面板（店本身在 store.js：溫室入口外面那棟）。靠近按 E：賣照片給老闆（老闆給評語和價錢）、買或換機身和鏡頭
import { BODIES, LENSES } from './camera.js'
import { MIN_SCORE } from './scoring.js'


const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])

// 面板：賣照片／器材
export function createShop({ state, photos, judge, onChange, onClose }) {
  const el = document.createElement('div')
  el.className = 'sheet'; el.hidden = true
  document.body.appendChild(el)
  let tab = 'sell', busy = false, last = null
  const owned = (id) => state.owned.includes(id)
  function gearRow(it, kind) {
    const using = kind === 'body' ? state.bodyId === it.id : state.lensId === it.id
    const spec = kind === 'body' ? `對焦 ${it.af}s・連拍 ${it.fps} 張/秒・ISO ${it.iso}` : `${it.min === it.max ? it.min : it.min + '–' + it.max}mm・f/${it.ap}`
    const btn = using ? '<span class="pill">使用中</span>'
      : owned(it.id) ? `<button class="btn ghost" data-use="${kind}:${it.id}">換上</button>`
      : `<button class="btn" data-buy="${kind}:${it.id}" ${state.money < it.price ? 'disabled' : ''}>買 $${it.price.toLocaleString()}</button>`
    return `<div class="row" data-id="${it.id}"><div><b>${esc(it.name)}</b><div class="muted">${spec}</div></div>${btn}</div>`
  }
  function render() {
    const unsold = photos.filter((p) => !p.sold && p.subject && p.score >= MIN_SCORE && p.price > 0).sort((a, b) => b.score - a.score)   // 60 分以下不收
    el.innerHTML = `<div class="sheet-in"><header><h2>相機行</h2><span class="money-pill">$ ${state.money.toLocaleString()}</span>
      <nav><button class="tab ${tab === 'sell' ? 'on' : ''}" data-tab="sell">賣照片</button><button class="tab ${tab === 'gear' ? 'on' : ''}" data-tab="gear">器材</button></nav>
      <button class="btn ghost" data-close>離開（E）</button></header>
      ${tab === 'sell' ? `
        <p class="muted">老闆：「拍到什麼好照片？拿來給我看看。我這裡不是資源回收，${MIN_SCORE} 分以上才收；100 分才給正常價，拍到難得的瞬間超過 100 分還會多給。」</p>
        <p class="muted tiers">60–69 分：一成　70–79：兩成半　80–89：五成　90–99：七成　100：正常價　100 以上：每分多 5%</p>
        ${last ? `<div class="judged"><img src="${last.url}" alt=""><div><h3>${esc(last.subject.name)}　賣了 $${last.soldFor}</h3><p class="judge">「${esc(last.judge)}」</p></div></div>` : ''}
        <div class="grid">${unsold.map((p) => `<figure data-t="${p.time}"><img src="${p.url}" alt=""><figcaption><b>${esc(p.subject.name)}</b><span>${p.score} 分</span><span>估價 $${p.price}</span>
          <button class="btn" data-sell="${p.time}" ${busy ? 'disabled' : ''}>${busy ? '老闆在看…' : '賣'}</button></figcaption></figure>`).join('') || '<p class="muted">沒有可以賣的照片（${MIN_SCORE} 分以上才收）。</p>'}</div>`
      : `<h3>機身</h3>${BODIES.map((b) => gearRow(b, 'body')).join('')}<h3>鏡頭</h3>${LENSES.map((l) => gearRow(l, 'lens')).join('')}`}
      </div>`
  }
  el.addEventListener('click', async (e) => {
    const t = e.target.closest('button'); if (!t) return
    if (t.dataset.close != null) return close()
    if (t.dataset.tab) { tab = t.dataset.tab; return render() }
    if (t.dataset.use) { const [k, id] = t.dataset.use.split(':'); if (k === 'body') state.bodyId = id; else state.lensId = id; onChange(); return render() }
    if (t.dataset.buy) {
      const [k, id] = t.dataset.buy.split(':'), it = (k === 'body' ? BODIES : LENSES).find((x) => x.id === id)
      if (state.money < it.price) return
      state.money -= it.price; state.owned.push(id)
      if (k === 'body') state.bodyId = id; else state.lensId = id
      onChange(); return render()
    }
    if (t.dataset.sell && !busy) {
      const p = photos.find((x) => x.time === +t.dataset.sell)
      if (!p || !p.subject || p.score < MIN_SCORE) return   // 保險：60 分以下一律不收
      busy = true; render()
      const r = await judge(p)                       // { price, comment }
      if (!Number.isFinite(r.price)) r.price = 0      // 不管哪裡算錯，錢都不能變成 NaN 存進存檔
      p.sold = true; p.soldFor = r.price; p.judge = r.comment
      state.money += r.price; state.sold++; state.earned += r.price
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
