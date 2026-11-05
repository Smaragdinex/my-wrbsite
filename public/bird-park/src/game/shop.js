// 相機行：一進入口就在左手邊的相機器材店（攤位＋老闆都是 Tripo 模型）。靠近按 E：賣照片給老闆（老闆給評語和價錢）、買或換機身和鏡頭
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { terrainHeight, addCollider } from '../layout.js'
import { BODIES, LENSES } from './camera.js'
import { MIN_SCORE } from './scoring.js'

export const SHOP = { x: -64.5, z: -4.6, face: 0 }   // 攤位面朝 +z（步道）

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])

// 招牌字：透明底、金色字，直接「漆」在模型頂上那塊空白木招牌上（AI 生的模型寫中文會變亂碼，所以招牌留白、字自己畫）
function signTex(text, sub) {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 144
  const g = c.getContext('2d')
  g.textBaseline = 'middle'; g.shadowColor = 'rgba(0,0,0,0.55)'; g.shadowBlur = 6; g.shadowOffsetY = 3
  g.font = 'bold 104px "PingFang TC", "Noto Sans TC", sans-serif'
  const w1 = g.measureText(text).width
  g.font = '44px "PingFang TC", "Noto Sans TC", sans-serif'
  const w2 = g.measureText(sub).width, gap = 40, x0 = (1024 - w1 - gap - w2) / 2
  g.fillStyle = '#e8cf8a'; g.font = 'bold 104px "PingFang TC", "Noto Sans TC", sans-serif'; g.fillText(text, x0, 76)
  g.fillStyle = '#d9c9a0'; g.font = '44px "PingFang TC", "Noto Sans TC", sans-serif'; g.fillText(sub, x0 + w1 + gap, 82)
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8
  return t
}

function deckTex() {   // 一條條的木板
  const c = document.createElement('canvas'); c.width = 512; c.height = 128
  const g = c.getContext('2d')
  for (let i = 0; i < 8; i++) {
    const l = 150 + ((i * 37) % 40); g.fillStyle = `rgb(${l},${l * 0.8 | 0},${l * 0.6 | 0})`; g.fillRect(0, i * 16, 512, 15)
    g.fillStyle = 'rgba(40,25,15,0.8)'; g.fillRect(0, i * 16 + 15, 512, 1)
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1, 2)
  return t
}

// 攤位和老闆：ChatGPT 畫四視圖 → Tripo 建模 → tools/make-prop.py（models/shop.glb、models/owner.glb）
// 攤位寬 2.9、深 1.2、高 3 公尺，正面朝 +z；招牌在頂上（正面 z = -0.45、高 2.62～2.98）。
// 老闆站在攤位靠入口那一側、櫃台旁邊；玩家走近會慢慢轉頭面向玩家，平常微微呼吸
const OWNER = { x: -1.95, z: 0.55, yaw: -0.45 }
export async function buildShop(scene) {
  const VER = new URL(import.meta.url).searchParams.get('v') ?? ''
  const loader = new GLTFLoader()
  const [kiosk, owner] = await Promise.all(['models/shop.glb', 'models/owner.glb'].map((p) => loader.loadAsync(`${p}?v=${VER}`).then((r) => r.scene)))
  const g = new THREE.Group()
  const y = terrainHeight(SHOP.x, SHOP.z)
  g.position.set(SHOP.x, y, SHOP.z); g.rotation.y = SHOP.face
  for (const m of [kiosk, owner]) m.traverse((o) => { if (o.isMesh) { o.castShadow = o.receiveShadow = true } })
  g.add(kiosk)
  // 木棧板平台：攤位和老闆一起站在上面（地形在這裡攤平了，layout.js 的 FLAT）
  const deck = new THREE.Mesh(new THREE.BoxGeometry(4.8, 0.2, 2.1), new THREE.MeshStandardMaterial({ map: deckTex(), color: 0x9a7650, roughness: 0.8 }))
  deck.position.set(-0.55, -0.02, 0.3); deck.castShadow = deck.receiveShadow = true; g.add(deck)
  kiosk.position.y = owner.position.y = 0.08
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.05, 0.29), new THREE.MeshStandardMaterial({ map: signTex('相機行', '照片收購・器材'), transparent: true, roughness: 0.55, metalness: 0.3 }))
  sign.position.set(0, 2.8, -0.435); g.add(sign)
  owner.position.x = OWNER.x; owner.position.z = OWNER.z; owner.rotation.y = OWNER.yaw
  g.add(owner)
  scene.add(g)
  addCollider(SHOP.x, SHOP.z, 1.6, y + 3)
  addCollider(SHOP.x + OWNER.x, SHOP.z + OWNER.z, 0.35, y + 2)
  const _p = new THREE.Vector3()
  // 老闆：玩家在 6 公尺內就轉頭看玩家（最多轉 ±70 度），呼吸＝身體高度微微起伏
  function tick(t, dt, camPos) {
    owner.getWorldPosition(_p)
    const dx = camPos.x - _p.x, dz = camPos.z - _p.z
    const near = Math.hypot(dx, dz) < 6
    const want = near ? THREE.MathUtils.clamp(Math.atan2(dx, dz) - SHOP.face, -1.2, 1.2) : OWNER.yaw
    owner.rotation.y += (want - owner.rotation.y) * (1 - Math.exp(-2.5 * dt))
    owner.scale.y = 1 + Math.sin(t * 1.6) * 0.004
  }
  return { group: g, owner, tick }
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
  function open() { render(); el.hidden = false }
  function close() { el.hidden = true; onClose?.() }
  return { open, close, get isOpen() { return !el.hidden }, render }
}
