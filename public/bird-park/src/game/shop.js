// 相機行：入口廣場旁的小攤子。靠近按 E：賣照片給老闆（老闆給評語和價錢）、買或換機身和鏡頭
import * as THREE from 'three'
import { terrainHeight, addCollider } from '../layout.js'
import { BODIES, LENSES } from './camera.js'

export const SHOP = { x: -64.5, z: -4.6, face: 0 }   // 攤位面朝 +z（步道）

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])

function signTex(text, sub) {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 256
  const g = c.getContext('2d')
  g.fillStyle = '#2d4a3a'; g.fillRect(0, 0, 1024, 256)
  g.strokeStyle = '#d8c38a'; g.lineWidth = 10; g.strokeRect(14, 14, 996, 228)
  g.fillStyle = '#f3e9cf'; g.textAlign = 'center'
  g.font = 'bold 120px "PingFang TC", "Noto Sans TC", sans-serif'; g.fillText(text, 512, 140)
  g.font = '48px "PingFang TC", "Noto Sans TC", sans-serif'; g.fillStyle = '#d8c38a'; g.fillText(sub, 512, 215)
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8
  return t
}
function stripeTex() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 64
  const g = c.getContext('2d')
  for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#f2ede0' : '#2f6b4a'; g.fillRect(i * 32, 0, 32, 64) }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace
  return t
}

// 攤位：木頭櫃台＋後牆＋條紋遮陽棚＋招牌＋架上的相機
export function buildShop(scene) {
  const g = new THREE.Group()
  const y = terrainHeight(SHOP.x, SHOP.z)
  g.position.set(SHOP.x, y, SHOP.z); g.rotation.y = SHOP.face
  const wood = new THREE.MeshStandardMaterial({ color: 0x8a5a36, roughness: 0.75 })
  const dark = new THREE.MeshStandardMaterial({ color: 0x3b2a1e, roughness: 0.8 })
  const box = (w, h, d, m, x, yy, z) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, yy, z); o.castShadow = o.receiveShadow = true; g.add(o); return o }
  box(3.0, 1.0, 0.7, wood, 0, 0.5, 0.6)                         // 櫃台
  box(3.1, 0.06, 0.8, dark, 0, 1.03, 0.6)                       // 檯面
  box(3.2, 2.6, 0.15, wood, 0, 1.3, -0.6)                       // 後牆
  box(0.12, 2.6, 0.12, dark, -1.55, 1.3, 0.95); box(0.12, 2.6, 0.12, dark, 1.55, 1.3, 0.95)   // 前柱
  box(0.12, 2.6, 0.12, dark, -1.55, 1.3, -0.6); box(0.12, 2.6, 0.12, dark, 1.55, 1.3, -0.6)
  for (const yy of [1.45, 1.95]) box(2.9, 0.05, 0.3, dark, 0, yy, -0.45)   // 層架
  // 架上的相機：機身＋鏡頭
  const camMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1c, roughness: 0.4, metalness: 0.3 })
  for (let i = 0; i < 6; i++) {
    const x = -1.2 + i * 0.48, yy = i < 3 ? 1.52 : 2.02
    const body = box(0.22, 0.14, 0.1, camMat, x, yy, -0.42)
    const len = 0.08 + (i % 3) * 0.08
    const l = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, len, 16).rotateX(Math.PI / 2), camMat)
    l.position.set(x, yy, -0.42 + 0.05 + len / 2); g.add(l)
  }
  // 遮陽棚（斜的條紋布）
  const awn = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 1.9), new THREE.MeshStandardMaterial({ map: stripeTex(), side: THREE.DoubleSide, roughness: 0.9 }))
  awn.position.set(0, 2.55, 0.25); awn.rotation.x = -Math.PI / 2 + 0.28; awn.castShadow = true; g.add(awn)
  // 招牌
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.6), new THREE.MeshStandardMaterial({ map: signTex('相機行', '照片收購・器材'), roughness: 0.7 }))
  sign.position.set(0, 2.95, 1.0); g.add(sign)
  scene.add(g)
  addCollider(SHOP.x, SHOP.z, 1.7, y + 3)
  return g
}

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
    return `<div class="row"><div><b>${esc(it.name)}</b><div class="muted">${spec}</div></div>${btn}</div>`
  }
  function render() {
    const unsold = photos.filter((p) => !p.sold && p.subject).sort((a, b) => b.score - a.score)
    el.innerHTML = `<div class="sheet-in"><header><h2>相機行</h2><span class="money-pill">$ ${state.money.toLocaleString()}</span>
      <nav><button class="tab ${tab === 'sell' ? 'on' : ''}" data-tab="sell">賣照片</button><button class="tab ${tab === 'gear' ? 'on' : ''}" data-tab="gear">器材</button></nav>
      <button class="btn ghost" data-close>離開（E）</button></header>
      ${tab === 'sell' ? `
        <p class="muted">老闆：「拍到什麼好照片？拿來給我看看。對焦清楚、鳥夠大、沒被擋住，價錢就好。」</p>
        ${last ? `<div class="judged"><img src="${last.url}" alt=""><div><h3>${esc(last.subject.name)}　賣了 $${last.soldFor}</h3><p class="judge">「${esc(last.judge)}」</p></div></div>` : ''}
        <div class="grid">${unsold.map((p) => `<figure data-t="${p.time}"><img src="${p.url}" alt=""><figcaption><b>${esc(p.subject.name)}</b><span>${p.score} 分</span><span>估價 $${p.price}</span>
          <button class="btn" data-sell="${p.time}" ${busy ? 'disabled' : ''}>${busy ? '老闆在看…' : '賣'}</button></figcaption></figure>`).join('') || '<p class="muted">沒有可以賣的照片（沒拍到鳥的不收）。</p>'}</div>`
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
      busy = true; render()
      const r = await judge(p)                       // { price, comment }
      if (!Number.isFinite(r.price)) r.price = 0      // 不管哪裡算錯，錢都不能變成 NaN 存進存檔
      p.sold = true; p.soldFor = r.price; p.judge = r.comment
      state.money += r.price; state.sold++; state.earned += r.price
      last = p; busy = false
      onChange(p); render()
    }
  })
  function open() { render(); el.hidden = false }
  function close() { el.hidden = true; onClose?.() }
  return { open, close, get isOpen() { return !el.hidden }, render }
}
