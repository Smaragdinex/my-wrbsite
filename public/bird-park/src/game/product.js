// 器材介紹頁：逛店時看著展示台按 E 打開。左邊：名稱、價錢、規格、介紹、購買／換上；右邊：器材的 3D 模型，自己慢慢轉，
// 拖曳可以 360° 轉著看、滾輪拉近拉遠。3D 用自己的一個小 renderer（只在打開時畫），模型是 store.js 載好的那份 clone。
import * as THREE from 'three'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { t as tr } from '../i18n.js'

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
// 每樣器材的介紹（中文原文；其他語言在 i18n 檔）
const DESC = {
  b1: '輕巧好上手的入門機身。對焦慢一點、連拍也不快，白天拍停著不動的鳥綽綽有餘；光線一暗，雜訊就會很明顯。',
  b2: '進階玩家最愛的中階機身。對焦快了一倍多，連拍每秒 8 張，晚一點的光線也撐得住，拍走動、理毛的鳥更穩。',
  b3: '職業鳥類攝影師用的旗艦機身。幾乎一瞬間就合焦，每秒 20 張連拍，起飛、入水那一刻都抓得到；高 ISO 也很乾淨。',
  l1: '機身附的標準變焦鏡。拍風景、溫室全景很好用，但拍鳥太短了，得走得很近，鳥常常先飛走。',
  l2: '入門的望遠變焦。300mm 已經可以拍到樹上的鳥，輕巧好帶，是第一支拍鳥鏡頭的好選擇。',
  l3: '拍鳥最常見的焦段。400mm 拉得更近，畫質也更好，水池對岸的鳥也能拍得清楚。',
  l4: '超望遠變焦，拍膽小的鳥不用靠太近。600mm 能把遠處樹梢的小鳥拍成主角；手要穩、快門要快。',
  l5: '大砲級的定焦鏡。f/4 大光圈在昏暗的林下也有快快門，背景糊得像奶油，是許多人夢想中的鏡頭。',
}

export function createProductView({ state, getModel, onChange, onClose }) {
  const el = document.createElement('div')
  el.className = 'sheet product-sheet'; el.hidden = true
  el.innerHTML = `<div class="product">
    <section class="product-info"></section>
    <section class="product-view"><canvas></canvas>
      <button class="nav prev" data-step="-1" aria-label="${tr('上一個')}" title="${tr('上一個')}"><svg viewBox="0 0 24 24" width="22" height="22"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
      <button class="nav next" data-step="1" aria-label="${tr('下一個')}" title="${tr('下一個')}"><svg viewBox="0 0 24 24" width="22" height="22"><path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
      <div class="product-hint"><span class="count"></span>${tr('拖曳旋轉・滾輪縮放')}</div></section>
  </div>`
  document.body.appendChild(el)
  const info = el.querySelector('.product-info'), view = el.querySelector('.product-view'), canvas = view.querySelector('canvas')
  let item = null, list = []   // list：可以左右切換的那一串器材（展示台的順序，或櫃台的器材清單）

  /* ---------- 3D：第一次打開才建（多一個 WebGL context，不用的時候不畫） ---------- */
  let r3 = null
  function init3d() {
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true })
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.9
    const scene = new THREE.Scene()
    const pm = new THREE.PMREMGenerator(renderer)
    scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture   // 攝影棚的反光，黑色機身、鏡頭玻璃才有質感
    scene.environmentIntensity = 0.45   // 太亮黑色機身會變灰
    const key = new THREE.DirectionalLight(0xffffff, 1.3); key.position.set(2, 3, 2.5); scene.add(key)
    const rim = new THREE.DirectionalLight(0xdfe9ff, 1.0); rim.position.set(-2.5, 1.5, -2); scene.add(rim)
    const cam = new THREE.PerspectiveCamera(30, 1, 0.01, 50)
    const pivot = new THREE.Group(); scene.add(pivot)
    // 地上一圈淡淡的影子，讓東西看起來是放著的
    const sc = document.createElement('canvas'); sc.width = sc.height = 128
    const sg = sc.getContext('2d'), gr = sg.createRadialGradient(64, 64, 4, 64, 64, 62)
    gr.addColorStop(0, 'rgba(0,0,0,0.35)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); sg.fillStyle = gr; sg.fillRect(0, 0, 128, 128)
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(sc), transparent: true, depthWrite: false }))
    shadow.rotation.x = -Math.PI / 2; scene.add(shadow)
    r3 = { renderer, scene, cam, pivot, shadow, yaw: 0, pitch: 0.25, vYaw: 0, zoom: 1, drag: null, idle: 0, raf: 0, last: 0, R: 1 }

    canvas.addEventListener('pointerdown', (e) => { r3.drag = { x: e.clientX, y: e.clientY }; r3.vYaw = 0; canvas.setPointerCapture(e.pointerId); view.classList.add('grab') })
    canvas.addEventListener('pointermove', (e) => {
      if (!r3.drag) return
      const dx = e.clientX - r3.drag.x, dy = e.clientY - r3.drag.y; r3.drag = { x: e.clientX, y: e.clientY }
      r3.yaw += dx * 0.01; r3.vYaw = dx * 0.6; r3.pitch = THREE.MathUtils.clamp(r3.pitch + dy * 0.008, -1.2, 1.35)
    })
    const up = () => { r3.drag = null; r3.idle = 0; view.classList.remove('grab') }
    canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up)
    canvas.addEventListener('wheel', (e) => { e.preventDefault(); r3.zoom = THREE.MathUtils.clamp(r3.zoom * Math.exp(e.deltaY * 0.001), 0.45, 1.8) }, { passive: false })
  }
  function setModel(id) {
    const { pivot, shadow } = r3
    pivot.clear()
    const m = getModel(id).clone()
    // 置中、量大小：鏡頭的長軸轉成左右方向，比較好看
    let box = new THREE.Box3().setFromObject(m), size = box.getSize(new THREE.Vector3())
    if (item.kind === 'lens' && size.z > size.x * 1.2) m.rotation.y = Math.PI / 2
    box = new THREE.Box3().setFromObject(m); size = box.getSize(new THREE.Vector3())
    const c = box.getCenter(new THREE.Vector3())
    m.position.sub(c)
    pivot.add(m)
    r3.R = size.length() / 2
    shadow.position.y = -size.y / 2 - 0.002; shadow.scale.setScalar(Math.max(size.x, size.z) * 1.5)
    r3.yaw = Math.PI - 0.6; r3.pitch = 0.22;   // 一開始從正面斜 35° 看（模型的正面朝 -z）
    r3.vYaw = 0; r3.zoom = 1; r3.idle = 9
  }
  function frame(now) {
    r3.raf = requestAnimationFrame(frame)
    const dt = Math.min(0.05, (now - (r3.last || now)) / 1000); r3.last = now
    const { renderer, scene, cam, pivot } = r3
    const w = canvas.clientWidth, h = canvas.clientHeight
    if (canvas.width !== Math.round(w * renderer.getPixelRatio()) || canvas.height !== Math.round(h * renderer.getPixelRatio())) { renderer.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix() }
    if (!r3.drag) {
      r3.idle += dt
      r3.vYaw *= Math.exp(-dt * 3)                          // 放開之後慣性慢慢停
      const auto = r3.idle > 1.5 ? 0.35 : 0                  // 停手一下子之後自己慢慢轉
      r3.yaw += r3.vYaw * 0.6 * dt + auto * dt
    }
    pivot.rotation.y = r3.yaw
    // 鏡頭繞著東西轉（上下角度），距離照東西大小算，整個放得進畫面
    const fit = r3.R / Math.sin(THREE.MathUtils.degToRad(cam.fov / 2)) / Math.min(1, cam.aspect) * 1.4 * r3.zoom
    cam.position.set(0, Math.sin(r3.pitch) * fit, Math.cos(r3.pitch) * fit); cam.lookAt(0, 0, 0)
    r3.shadow.visible = r3.pitch > -0.05
    renderer.render(scene, cam)
  }

  /* ---------- 左邊：介紹、購買 ---------- */
  function render() {
    const it = item, owned = state.owned.includes(it.id)
    const using = it.kind === 'body' ? state.bodyId === it.id : state.lensId === it.id
    const rows = it.kind === 'body'
      ? [[tr('對焦速度'), tr('{n} 秒', { n: it.af })], [tr('連拍'), tr('{n} 張/秒', { n: it.fps })], [tr('最高 ISO'), it.iso.toLocaleString()]]
      : [[tr('焦段'), it.min === it.max ? `${it.min}mm` : `${it.min}–${it.max}mm`], [tr('最大光圈'), `f/${it.ap}`], [tr('類型'), tr(it.min === it.max ? '定焦' : '變焦')]]
    const short = it.price - state.money
    const btn = using ? `<span class="pill using">${tr('使用中')}</span>`
      : owned ? `<button class="btn" data-use>${tr('換上')}</button>`
      : `<button class="btn" data-buy ${short > 0 ? 'disabled' : ''}>${tr('買 ${p}', { p: it.price.toLocaleString() })}</button>${short > 0 ? `<p class="short">${tr('還差 ${p}', { p: short.toLocaleString() })}</p>` : ''}`
    info.innerHTML = `<div class="sheet-head"><button class="x" aria-label="${tr('關閉')}" title="${tr('關閉')}"><svg viewBox="0 0 24 24" width="18" height="18"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg></button>
      <span class="kind">${tr(it.kind === 'body' ? '機身' : '鏡頭')}</span><span class="money-pill">$ ${state.money.toLocaleString()}</span></div>
      <h2>${esc(it.name)}</h2>
      <div class="price">${owned ? `<span class="owned">${tr('已擁有')}</span>` : it.price ? '$' + it.price.toLocaleString() : tr('免費')}</div>
      <table class="specs">${rows.map(([k, v]) => `<tr><th>${k}</th><td>${esc(v)}</td></tr>`).join('')}</table>
      <p class="desc">${esc(tr(DESC[it.id]))}</p>
      <div class="buy">${btn}</div>
      <p class="muted keys">${tr('E 或 Esc 關閉')}</p>`
  }
  info.addEventListener('click', (e) => {
    if (e.target.closest('.x')) return close()
    if (e.target.closest('[data-buy]')) {
      if (state.money < item.price || state.owned.includes(item.id)) return
      state.money -= item.price; state.owned.push(item.id)
    } else if (!e.target.closest('[data-use]')) return
    if (item.kind === 'body') state.bodyId = item.id; else state.lensId = item.id
    onChange(); render()
  })
  addEventListener('keydown', (e) => {
    if (el.hidden) return
    if (e.code === 'Escape') close()
    else if (e.code === 'ArrowLeft' || e.code === 'KeyA') step(-1)
    else if (e.code === 'ArrowRight' || e.code === 'KeyD') step(1)
  })
  view.querySelectorAll('.nav').forEach((b) => b.addEventListener('click', () => step(+b.dataset.step)))
  // 左右看上一個、下一個（頭尾接起來）
  function step(d) {
    if (list.length < 2) return
    const i = list.findIndex((x) => x.id === item.id)
    show(list[(i + d + list.length) % list.length])
  }
  function show(it) {
    item = it
    render(); setModel(it.id)
    const i = list.findIndex((x) => x.id === it.id)
    view.querySelector('.count').textContent = list.length > 1 ? `${i + 1} / ${list.length}　` : ''
    view.classList.toggle('single', list.length < 2)
  }

  function open(it, all = [it]) {
    list = all; el.hidden = false
    if (!r3) init3d()
    show(it)
    cancelAnimationFrame(r3.raf); r3.last = 0; r3.raf = requestAnimationFrame(frame)
  }
  function close() {
    if (el.hidden) return
    el.hidden = true; if (r3) cancelAnimationFrame(r3.raf)
    onClose?.()
  }
  return { open, close, get isOpen() { return !el.hidden } }
}
