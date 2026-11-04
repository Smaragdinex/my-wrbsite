// 相簿：Tab 打開，看拍過的照片（鳥種、分數、估價），可以刪掉不要的；賣掉的照片標「已售出」
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])

export function createAlbum({ photos, onDelete, onClose }) {
  const el = document.createElement('div')
  el.className = 'sheet'; el.hidden = true
  document.body.appendChild(el)
  let big = null
  function render() {
    const list = [...photos].sort((a, b) => b.time - a.time)
    el.innerHTML = `<div class="sheet-in"><header><h2>相簿</h2><span class="muted">${list.length} 張</span><button class="btn ghost" data-close>關閉（Tab）</button></header>
      <div class="grid">${list.map((p) => `<figure data-t="${p.time}" class="${p.sold ? 'sold' : ''}"><img src="${p.url}" alt="">
        <figcaption><b>${esc(p.subject?.name ?? '沒拍到鳥')}</b><span>${p.score} 分</span><span>${p.sold ? '已售出 $' + p.soldFor : '估價 $' + p.price}</span>${p.exif ? `<span class="muted">f/${p.exif.N}・${p.exif.t >= 0.5 ? p.exif.t + '"' : '1/' + Math.round(1 / p.exif.t)}・ISO ${p.exif.iso}</span>` : ''}</figcaption></figure>`).join('') || '<p class="muted">還沒有照片。右鍵按一下舉起相機，左鍵拍照。</p>'}</div>
      ${big ? `<div class="big"><img src="${big.url}" alt=""><div class="big-info"><h3>${esc(big.subject?.name ?? '沒拍到鳥')}　${big.score} 分</h3>
        <p>${esc(big.body)}・${esc(big.lens)}・${big.focal}mm</p><p>${esc(big.notes.join('、') || '拍得不錯')}</p>
        ${big.judge ? `<p class="judge">「${esc(big.judge)}」</p>` : ''}
        <button class="btn ghost" data-back>返回</button> ${big.sold ? '' : '<button class="btn danger" data-del>刪除這張</button>'}</div></div>` : ''}</div>`
  }
  el.addEventListener('click', (e) => {
    const f = e.target.closest('figure'), t = e.target
    if (t.closest('[data-close]')) return close()
    if (t.closest('[data-back]')) { big = null; return render() }
    if (t.closest('[data-del]')) { const p = big; big = null; onDelete(p); return render() }
    if (f) { big = photos.find((p) => p.time === +f.dataset.t); render() }
  })
  function open() { big = null; render(); el.hidden = false }
  function close() { el.hidden = true; onClose?.() }
  return { open, close, get isOpen() { return !el.hidden }, render }
}
