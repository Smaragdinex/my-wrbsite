// 2026-11-14 使用者「賣照片按下一鍵賣出 → 切到定格：玩家看到老闆正在一張一張看照片（動畫循環）；玩家不想等也可以離開，跑完給錢」
// 流程：shop.js 的「一鍵全部賣出」→ start(list)：
//   1. 鏡頭切到櫃台前的定格（看著老闆），手和相機不畫；老闆（shopkeeper.appraise）雙手拿照片一張一張翻
//   2. 背景照原本那套一張一張評（judge）：每評完一張就入帳、下面那條顯示這張的評語和價錢、左邊小圖換成老闆正在看的那張
//   3. 看完：畫面上「看完了！賣出 N 張、共 $X」，按 E 回到遊戲；玩家中途按 E／Esc 離開 → 鏡頭還給玩家，老闆照樣看完，看完跳提示
import * as THREE from 'three'
import { t as tr, birdName } from '../i18n.js'

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])

export function createAppraisal({ keeper, camera, sellOne, onChange, onWatch, toast }) {
  const el = document.createElement('div'); el.className = 'appraise-ui'; el.hidden = true
  document.body.appendChild(el)
  const st = { running: false, watching: false, done: false, list: [], i: 0, total: 0, bonus: 0, hits: 0, n: 0, last: null }
  const view = { p: new THREE.Vector3(), t: new THREE.Vector3() }
  const saved = { p: new THREE.Vector3(), q: new THREE.Quaternion() }

  function setView() {
    // 櫃台前、老闆正前方 2 m、眼睛高 1.55 m，看著他胸口到臉之間
    const m = keeper.model; m.updateWorldMatrix(true, false)
    const o = m.getWorldPosition(new THREE.Vector3()), f = m.getWorldDirection(new THREE.Vector3()).setY(0).normalize()
    const r = new THREE.Vector3(f.z, 0, -f.x)
    view.p.copy(o).addScaledVector(f, 1.55).addScaledVector(r, -0.3); view.p.y = o.y + 1.58   // 稍微偏左（右邊有一台螢幕會擋到）、近一點
    view.t.copy(o).addScaledVector(r, -0.05); view.t.y = o.y + 1.33
  }
  function render() {
    const cur = st.list[Math.min(st.i, st.list.length - 1)], L = st.last
    if (st.done) {
      el.innerHTML = `<div class="ap-bar done"><div class="ap-main"><h3>${tr('看完了！賣出 {n} 張，共 ${p}', { n: st.n, p: st.total.toLocaleString() })}</h3>
        ${st.bonus ? `<p class="comm-hit">${tr('完成 {n} 個委託，獎金 ${p}', { n: st.hits, p: st.bonus.toLocaleString() })}</p>` : ''}
        ${L ? `<p class="ap-say">「${esc(L.comment)}」</p>` : ''}</div><div class="ap-key">${tr('E 繼續')}</div></div>`
      return
    }
    el.innerHTML = `<div class="ap-bar">${cur ? `<img class="ap-pic" src="${cur.url}" alt="">` : ''}
      <div class="ap-main"><h3>${tr('老闆在看你的照片… {i} / {n}', { i: Math.min(st.i + 1, st.list.length), n: st.list.length })}<span class="ap-money">${tr('已入帳 ${p}', { p: st.total.toLocaleString() })}</span></h3>
        <div class="ap-prog"><i style="width:${(st.i / Math.max(1, st.list.length) * 100).toFixed(1)}%"></i></div>
        ${L ? `<p class="ap-say"><b>${esc(birdName(L.p.subject.id, L.p.subject.name))}</b>　${tr('{n} 分', { n: L.p.score })}　+$${L.price.toLocaleString()}${L.bonus ? `　<span class="comm-hit">${tr('委託獎金 ${p}', { p: L.bonus.toLocaleString() })}</span>` : ''}<br>「${esc(L.comment)}」</p>` : `<p class="ap-say">${tr('老闆：「嗯……讓我一張一張看。」')}</p>`}</div>
      <div class="ap-key">${tr('E 離開（老闆看完會自動入帳）')}</div></div>`
  }
  function watch(on) {
    if (on === st.watching) return
    st.watching = on
    if (on) { saved.p.copy(camera.position); saved.q.copy(camera.quaternion); setView() }
    else { camera.position.copy(saved.p); camera.quaternion.copy(saved.q); camera.updateMatrixWorld() }
    el.hidden = !on; if (on) render()
    onWatch?.(on)
  }
  async function start(list) {
    if (st.running || !list.length) return
    Object.assign(st, { running: true, done: false, list, i: 0, total: 0, bonus: 0, hits: 0, n: 0, last: null })
    keeper.appraise(list.map((p) => p.url)); keeper.say?.(tr('嗯……讓我一張一張看。'), 3)
    watch(true)
    try {
      for (let i = 0; i < list.length; i++) {
        st.i = i; if (st.watching) render()
        keeper.appraiseShow?.(i)   // 手上翻到這一張
        const p = list[i], [r] = await Promise.all([sellOne(p), new Promise((ok) => setTimeout(ok, 1800))])   // 一張最少看 1.8 秒（沒有語言模型時評價是瞬間的，不然老闆看起來沒在看）
        st.total += r.price + r.bonus; st.n++; if (r.bonus) { st.bonus += r.bonus; st.hits++ }
        st.last = { p, price: r.price, bonus: r.bonus, comment: r.comment }
        onChange?.(p)
        if (st.watching) render()
      }
    } catch (e) { console.error('[appraise] 賣照片出錯', e) }
    finally {
      st.i = list.length; st.running = false
      keeper.appraise(null); keeper.say?.(tr('看完了，錢算給你了！'), 3)
      if (st.watching) { st.done = true; render() }
      else if (st.n) toast?.(tr('老闆看完你的照片了：賣出 {n} 張，共 ${p}', { n: st.n, p: st.total.toLocaleString() }))
    }
  }
  function leave() {
    if (!st.watching) return
    if (st.running) toast?.(tr('老闆會繼續看，看完自動入帳'))
    st.done = false; watch(false)
  }
  addEventListener('keydown', (e) => { if (st.watching && (e.code === 'KeyE' || e.code === 'Escape')) { e.preventDefault(); e.stopImmediatePropagation(); leave() } }, true)
  // 每格：定格鏡頭（玩家的鏡頭不動）
  function tick() { if (st.watching) { camera.position.copy(view.p); camera.lookAt(view.t); camera.updateMatrixWorld() } }
  function rewatch() { if (st.running) watch(true) }
  return { start, leave, rewatch, tick, get watching() { return st.watching }, get running() { return st.running } }
}
