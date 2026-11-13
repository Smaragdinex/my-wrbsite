// 遊戲入口：同一個園區（world.js），第一人稱走動、拿相機拍鳥、拿照片去相機行換錢、買鏡頭
import * as THREE from 'three'
import { buildWorld, PHONE } from '../world.js'
import { createSettings } from './settings.js'
import { createAmbience } from './ambience.js'
import { createPlayer } from '../player.js'
import { createHud } from './hud.js'
import { createCamera, BODIES, LENSES } from './camera.js'
import { createPlayback } from './playback.js'
import { createGuide, guideAniso } from './guide.js'
import { createShop } from './shop.js'
import { createCommissions } from './commissions.js'
import { createProductView } from './product.js'
import { buildStore } from './store.js'
import { loadState, saveState, putPhoto, deletePhoto, allPhotos } from './save.js'
import { judgePhoto, loadLLM, llm, rawGen, RARITY } from './judge.js'
import { createFlight, flyModels } from './flight.js'
import { createPresence } from './presence.js'
import { priceFor } from './scoring.js'
import { createViewmodel } from './viewmodel.js'
import { createUiFx } from './ui-fx.js'
import { controlsSvg } from './controls-help.js'
import { MENU_VIEW, terrainHeight, supportAt } from '../layout.js'
import { t as tr, LANG, LANGS, setLang } from '../i18n.js'
import { summitRests } from '../summit.js'

// 頁面上寫死的字（data-i18n）換成這個語言；標題列
for (const el of document.querySelectorAll('[data-i18n]')) el.textContent = tr(el.textContent.trim())
for (const el of document.querySelectorAll('[data-i18n-aria]')) { el.setAttribute('aria-label', tr(el.dataset.i18nAria)); el.title = tr(el.dataset.i18nAria) }
document.title = tr('鳥類生態園：攝影')
// 首頁的語言按鈕：換語言就重新載入（貼圖上的字都是一開始畫的）
{
  const box = document.getElementById('langs')
  box.innerHTML = '<div class="globe">LANGUAGE</div>' + LANGS.map((l) => `<button data-lang="${l.id}" class="${l.id === LANG ? 'on' : ''}">${l.label}</button>`).join('')
  box.onclick = (e) => { const b = e.target.closest('[data-lang]'); if (b && b.dataset.lang !== LANG) setLang(b.dataset.lang) }
}

const loadingEl = document.getElementById('loading')
// 載入畫面：下載 0～70%、蓋溫室 70～80%、預熱著色器 80～100%（鳥沿著進度線飛過去）
const ldNum = document.getElementById('ld-num'), ldMsg = document.getElementById('ld-msg')
const ldFill = loadingEl.querySelector('.ld-fill'), ldBird = loadingEl.querySelector('.ld-bird')
let ldShown = 0
function setLoad(f, msg) {
  f = Math.max(ldShown, Math.min(1, f)); ldShown = f   // 只往前走
  const p = Math.round(f * 100)
  ldNum.textContent = p; ldFill.style.width = p + '%'; ldBird.style.left = p + '%'
  if (msg) ldMsg.textContent = msg
}
// 2026-11-12 標題畫面（使用者：「要跟其他遊戲一樣，一進入有額外的動畫主畫面，那裡可以設定、看控制、play」）：
// 網頁一打開先是這個畫面——純 CSS／SVG 的動畫背景（天空、飄的雲、三層山、飛過去的鳥），什麼模型都還沒下載。
// 「開始遊戲」才開始載入，載完直接進公園；「設定」＝載入等級（要載多細的貼圖和多少鳥，載入前才能決定）和語言，其他畫質在遊戲裡的設定調；「操作說明」＝按鍵圖。
// 錄影、自動測試（網址有 rec 或 tier）不顯示
let fromTitle = false
const VER_Q = new URL(import.meta.url).searchParams.get('v') ?? ''   // 主頁背景影片（紅鶴會動、有倒影；10 秒循環，1.8 MB）的快取版本
{ const qs0 = new URLSearchParams(location.search), pre = document.getElementById('pre')
  if (pre && !qs0.has('rec') && !qs0.has('tier')) {
    let saved = null; try { saved = localStorage.getItem('birdpark.tier') } catch {}
    let pick = saved === 'full' || saved === 'mid' || saved === 'lite' ? saved : 'auto'
    const O = [['auto', tr('自動'), tr('照這台電腦的規格決定，不確定就選這個。')], ['full', tr('完整'), tr('貼圖原尺寸、所有鳥都載入。最漂亮，需要較好的電腦，載入最久。')], ['mid', tr('均衡'), tr('貼圖減半、只載入 170 公尺內的鳥。')], ['lite', tr('輕量'), tr('貼圖再減半、只載入 110 公尺內的鳥。電腦跑不動或打不開時選這個。')]]
    const X = `<button class="x" aria-label="${tr('關閉')}" title="${tr('關閉')}"><svg viewBox="0 0 24 24" width="18" height="18"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg></button>`
    const bird = (cls) => `<svg class="tb ${cls}" viewBox="0 0 60 24" aria-hidden="true"><path class="w" d="M30 13 Q20 2 4 6 Q16 8 24 15 Z"/><path class="w w2" d="M30 13 Q40 2 56 6 Q44 8 36 15 Z"/><path d="M22 14 Q30 10 40 14 Q32 18 22 14 Z"/></svg>`
    const hill = (cls, d) => `<svg class="hill ${cls}" viewBox="0 0 1200 300" preserveAspectRatio="none" aria-hidden="true"><path d="${d}"/></svg>`
    pre.innerHTML = `<div class="sky" aria-hidden="true"><i class="sun"></i><i class="cl c1"></i><i class="cl c2"></i><i class="cl c3"></i>
        ${hill('h1', 'M0 300 L0 170 Q150 90 300 150 Q420 60 560 130 Q700 40 860 120 Q1000 70 1200 150 L1200 300 Z')}${hill('h2', 'M0 300 L0 210 Q120 150 260 200 Q400 120 540 190 Q700 140 820 200 Q1000 130 1200 210 L1200 300 Z')}${hill('h3', 'M0 300 L0 250 Q200 200 380 245 Q560 190 760 240 Q960 200 1200 250 L1200 300 Z')}</div>
      <div class="menu" id="preMenu"><div class="brand"><h1>${tr('鳥類生態園')}</h1><p>${tr('帶著相機走進公園，找鳥、拍照。')}</p></div>
        <nav><button class="go">${tr('開始遊戲')}</button><button class="ghost" data-open="set">${tr('設定')}</button><button class="ghost" data-open="help">${tr('操作說明')}</button></nav></div>
      <div class="panel menu-sheet" id="preSet" hidden><div class="sheet-head">${X}<h2>${tr('設定')}</h2></div>
        <b class="lbl">${tr('載入等級')}</b><div class="opts"></div>
        <b class="lbl">LANGUAGE</b><div class="lg">${LANGS.map((l) => `<button data-lang="${l.id}" class="${l.id === LANG ? 'on' : ''}">${l.label}</button>`).join('')}</div>
        <small>${tr('解析度、陰影、音量這些，進遊戲後按 Esc 在「設定」裡調。')}</small></div>
      <div class="panel menu-sheet" id="preHelp" hidden><div class="sheet-head">${X}<h2>${tr('操作說明')}</h2></div><div class="ctl">${controlsSvg()}</div></div>`
    const menu = pre.querySelector('#preMenu'), setEl = pre.querySelector('#preSet'), hlpEl = pre.querySelector('#preHelp'), opts = setEl.querySelector('.opts')
    const drawOpts = () => { opts.innerHTML = O.map(([k, n, h]) => `<button data-tier="${k}" class="${k === pick ? 'on' : ''}" aria-pressed="${k === pick}"><strong>${n}</strong><span>${h}</span></button>`).join('') }
    const show = (el) => { menu.hidden = !!el; setEl.hidden = el !== setEl; hlpEl.hidden = el !== hlpEl }
    const savePick = () => { try { if (pick === 'auto') localStorage.removeItem('birdpark.tier'); else localStorage.setItem('birdpark.tier', pick) } catch {} }
    drawOpts(); pre.hidden = false; loadingEl.hidden = true
    // 即時 3D 的背景（title3d.js）：載好就蓋在影片上面；載不起來（沒有 WebGL、模型抓不到）就照舊播影片
    let t3 = null, gone = false
    import('./title3d.js').then((m) => m.startTitle3D(pre.querySelector('.sky'), { ver: VER_Q })).then((h) => { if (gone) h.stop(); else { t3 = h; pre.querySelector('.sky').classList.add('live') } }).catch((e) => console.warn('[title3d]', e))
    const onKey = (e) => { if (e.key === 'Escape') show(null) }; addEventListener('keydown', onKey)
    await new Promise((res) => pre.addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return
      if (b.dataset.tier) { pick = b.dataset.tier; savePick(); drawOpts() }
      else if (b.dataset.lang) { if (b.dataset.lang !== LANG) setLang(b.dataset.lang) }
      else if (b.dataset.open) show(b.dataset.open === 'set' ? setEl : hlpEl)
      else if (b.classList.contains('x')) show(null)
      else if (b.classList.contains('go')) res()
    }))
    removeEventListener('keydown', onKey); savePick()
    gone = true; try { t3?.stop() } catch {}
    pre.hidden = true; pre.innerHTML = ''; loadingEl.hidden = false; fromTitle = true
  }
}
const world = await buildWorld(document.getElementById('scene'), {
  onProgress: (f, stage) => stage === 'build' ? setLoad(0.7, tr('蓋公園、種樹…')) : setLoad(f * 0.7, tr('下載植物和鳥…')),
  extraModels: flyModels(),
  stream: !new URLSearchParams(location.search).has('nostream'),   // 2026-11-11 鳥的模型串流載入（?nostream 照舊全部載完再進場，測試比對用）
  night: true,
})
const { renderer, scene, camera } = world
// 附屬館（高山館、海岸館）的館內也在載入畫面時蓋好：走過去才蓋會卡一下
setLoad(0.8, tr('公園快好了…'))
await new Promise((r) => setTimeout(r, 30))
await world.halls.prebuild()

const player = createPlayer(camera, renderer.domElement)
scene.add(camera)   // 第一人稱的手和相機掛在鏡頭底下，鏡頭要在場景裡才會畫出來
const vm = await createViewmodel(camera)
// 鳥怕人：靠太近會飛走／跑掉／游開，玩家走開後再回來
const flight = createFlight(world, player)
world.shotOf = flight.shotOf
const hud = createHud(document.getElementById('hud'))

// 存檔：錢、裝備；照片從 IndexedDB 讀回來
const state = loadState()
const photos = await allPhotos()
// 舊存檔：以前 0 分的照片還有底價，改成「沒拍到鳥、0 元」
for (const p of photos) if (!p.sold && p.score <= 0 && (p.subject || p.price)) { p.subject = null; p.price = 0; p.notes = [tr('沒拍到鳥（太小、太糊或看不清楚）')]; putPhoto(p) }
// 收購價改成分數分級（60 分以下不收）：沒賣掉的舊照片照新規則重算估價
for (const p of photos) if (!p.sold && p.subject) { const np = priceFor(p.subject.id, p.score); if (np !== p.price) { p.price = np; putPhoto(p) } }
// 圖鑑記錄：拍到過的鳥種（舊存檔從相簿補）
state.seen = [...new Set([...(state.seen ?? []), ...photos.filter((p) => p.subject).map((p) => p.subject.id)])]
// 圖鑑讀過的頁：拍到新鳥種＝未讀，翻到那一頁才算讀過（舊存檔沒有這欄：已經記錄的都當讀過，不會一打開滿滿的 NEW）
state.read ??= [...state.seen]
const unreadN = () => state.seen.filter((id) => !state.read.includes(id)).length
const save = () => { saveState(state); hud.setMoney(state.money) }
hud.setMoney(state.money); hud.setGuideNew(unreadN())
// 老闆委託：主線＋每日 3 個（commissions.js）；右上角時鐘下面一直顯示目前的主線委託
const comm = createCommissions(state, { onChange: (why) => { save(); showQuest(); if (why === 'day') hud.toast(tr('老闆有新的每日委託')) } })
const showQuest = () => hud.setQuest(comm.main ? tr('委託：{c}', { c: comm.condText(comm.main) }) : '')
showQuest(); saveState(state)   // 第一次產生的每日委託要存起來，不然每次重新整理都換一批
const gear = { body: () => BODIES.find((b) => b.id === state.bodyId), lens: () => LENSES.find((l) => l.id === state.lensId) }

const cam = createCamera({ world, camera, controls: player.controls, hud, gear, getSound: () => settings.state.sound, onShot: (p) => {
  // 委託要看拍的時段、有沒有在下雨
  p.hour = hour; p.rain = world.weather.rain; p.weather = world.weather.name
  photos.push(p); putPhoto(p)
  // 圖鑑：拍到過就算記錄（照片賣掉、刪掉也還在）；新的鳥種先記成未讀，右上角亮「圖鑑 N 筆新紀錄」
  const isNew = p.subject && !state.seen.includes(p.subject.id)
  if (isNew) { state.seen.push(p.subject.id); save(); hud.setGuideNew(unreadN()) }
  // 拍的當下不顯示分數、評語、價錢（使用者要求）：要到相簿或相機行老闆那裡才知道拍得怎樣——新鳥種只說「圖鑑多了一筆」
  const hit = comm.matchFor(p)
  hud.toast((isNew ? tr('已存入相簿\n圖鑑新增一筆紀錄！') : tr('已存入相簿')) + (hit ? '\n' + tr('這張符合老闆的委託！拿去相機行') : ''), isNew || hit ? 3.2 : 2.2)
} })

// 面板（相簿、相機行）開著的時候放開滑鼠；關掉再鎖回去
const relock = () => player.controls.lock()
// Tab：相機背面螢幕的回放（playback.js，2026-11-08 取代網頁式的相簿）
const album = createPlayback({ photos, onDelete: (p) => { const i = photos.indexOf(p); if (i >= 0) photos.splice(i, 1); deletePhoto(p.time) }, onClose: relock })
const store = await buildStore(scene, state, world.plantLib, { getSound: () => settings.state.sound })   // 自動門音效跟著設定的「音效」開關（只在玩的時候才會叫到，那時 settings 已經建好）   // 相機行：溫室門口外面那棟店，遊戲從店裡開始
const shop = createShop({ state, photos, comm, judge: judgePhoto, onChange: (p) => { save(); store.refresh(); if (p) putPhoto(p) }, onClose: relock, onView: (it, all) => product.open(it, all) })
// Esc 闔上：瀏覽器不讓 Esc 重新鎖滑鼠，就回到首頁選單（跟平常按 Esc 一樣）
let uiFx = null   // 下面 createUiFx 才建；圖鑑的按鈕、翻頁音效用它
guideAniso(renderer)
const guide = createGuide({ renderer, sfx: (k) => uiFx?.play(k), onClose: (why) => why === 'esc' ? player.controls.dispatchEvent({ type: 'unlock' }) : relock(), getRecords: () => {
  // 每種鳥：拍過幾張、最高幾分（沒有照片但記錄過的也算記錄）
  const r = {}
  for (const id of state.seen) r[id] = { n: 0, best: 0 }
  for (const p of photos) if (p.subject) { const o = r[p.subject.id] ??= { n: 0, best: 0 }; o.n++; o.best = Math.max(o.best, p.score) }
  for (const id in r) r[id].unread = !state.read.includes(id)
  return r
}, onRead: (id) => { if (!state.read.includes(id)) { state.read.push(id); save(); hud.setGuideNew(unreadN()) } } })
const product = createProductView({ state, getModel: (id) => store.gearModel[id], onChange: () => { save(); store.refresh(); shop.render() }, onClose: () => { if (!shop.isOpen) relock() } })   // 從櫃台的器材清單打開的：關掉回到清單
const panelOpen = () => album.isOpen || shop.isOpen || product.isOpen || cam.panelOpen || guide.isOpen
const openPanel = (pnl) => { pnl.open(); player.controls.unlock() }

// 2026-11-13 回報問題用：按 ` 在左上角顯示目前位置／面向／時間（截圖給我們就知道在哪裡、往哪看），再按一次關掉
const posEl = Object.assign(document.createElement('div'), { hidden: true })
posEl.style.cssText = 'position:fixed;left:10px;top:10px;z-index:50;font:600 13px ui-monospace,monospace;color:#fff;background:rgba(0,0,0,.6);padding:6px 9px;border-radius:6px;pointer-events:none;white-space:pre'
document.body.appendChild(posEl)
setInterval(() => {
  if (posEl.hidden) return
  const p = camera.getWorldPosition(new THREE.Vector3()), d = camera.getWorldDirection(new THREE.Vector3())
  posEl.textContent = `x ${p.x.toFixed(1)}  y ${p.y.toFixed(1)}  z ${p.z.toFixed(1)}\nlook ${d.x.toFixed(2)} ${d.y.toFixed(2)} ${d.z.toFixed(2)}  fov ${camera.fov.toFixed(0)}\n${tr('時間')} ${hour.toFixed(2)}`
}, 200)
addEventListener('keydown', (e) => {
  if (e.code === 'Backquote') { posEl.hidden = !posEl.hidden; return }
  if (guide.isOpen) { if (e.code === 'KeyE') guide.close(); if (e.code === 'Tab') e.preventDefault(); return }   // 圖鑑開著：翻頁、Esc 在 guide.js 處理
  if (album.key(e)) return   // 回放開著：方向鍵、Q/E、刪除…都給它（Tab、Esc 關掉）
  if (e.code === 'Tab') { e.preventDefault(); if (album.isOpen) album.close(); else if (!shop.isOpen && !product.isOpen) openPanel(album) }
  // E：舉著相機 → 相機設定；靠近相機行 → 進店；靠近長椅 → 休息
  if (e.code === 'KeyE' && cam.panelOpen) { cam.closePanel(); return }
  if (e.code === 'KeyE' && cam.state.raised && player.controls.isLocked) { cam.openPanel(); return }
  if (e.code === 'KeyE') {
    if (product.isOpen) return product.close()
    if (shop.isOpen) return shop.close()
    const f = !album.isOpen && player.controls.isLocked ? store.focus(camera) : null
    if (f?.type === 'item') { product.open(f.item, store.items); player.controls.unlock() }      // 逛店：看著展示台 → 器材介紹頁（左邊介紹＋購買，右邊 3D 轉著看）
    else if (f?.type === 'counter') store.checkout(() => { shop.open('sell'); player.controls.unlock() })   // 櫃台：老闆不在櫃台就先走回來，到了才開買賣畫面
    else if (!panelOpen() && player.controls.isLocked && nearBench()) rest()
    else if (!panelOpen() && player.controls.isLocked) { guide.open(); player.controls.unlock() }   // 附近沒有可以按 E 的東西：打開鳥類圖鑑
  }
  // F：手電筒（2026-11-10）——晚上照路、照鳥（白天也能開，只是看不太出來）
  if (e.code === 'KeyF' && player.controls.isLocked) {
    torch.on = !torch.on; torch.intensity = torch.on ? TORCH_I : 0
    hud.toast(tr(torch.on ? '手電筒：開' : '手電筒：關'), 1.2)
  }
  if (e.code === 'KeyQ' && player.controls.isLocked) {
    // 換下一支有的鏡頭
    const mine = LENSES.filter((l) => state.owned.includes(l.id))
    state.lensId = mine[(mine.findIndex((l) => l.id === state.lensId) + 1) % mine.length].id
    save(); hud.toast(tr('換上 {name}', { name: gear.lens().name }))
  }
})
// 手電筒：掛在鏡頭上的聚光燈（照向準星），暖白色、邊緣柔、照 35 公尺；不投影子（效能）
// 2026-11-10 使用者：從左邊出來（以前在右下，光被手上的相機擋住）、不要那麼亮、柔和 → 亮度 90→32、邊緣全柔（penumbra 0.95）、角度放寬、偏暖
let guideHi = false
const torch = new THREE.SpotLight(0xffe6c4, 32, 30, 0.55, 0.95, 1.5)
torch.position.set(-0.32, -0.08, -0.3); torch.target.position.set(0.4, -0.7, -10)
// 2026-11-10 使用者：第一次按手電筒都會卡 → 以前開關是 visible，燈的數量一變，所有材質的 shader 都要重新編譯（卡 1～2 秒）。
// 改成燈一直在場景裡、關的時候亮度 0（shader 一開始就編好含這盞燈的版本）
const TORCH_I = torch.intensity
camera.add(torch, torch.target); torch.on = false; torch.intensity = 0
// 日夜：一天 24 分鐘（遊戲裡 1 小時 = 現實 1 分鐘）；網址 ?t=19.5 可以直接從某個時間開始
const DAY_SEC = 24 * 60
const qs = new URLSearchParams(location.search)
let hour = qs.has('t') ? +qs.get('t') : 9
// 天氣：遊戲裡自己隨機變（晴／多雲／下雨／雷雨）；?weather=rain 之類可以固定一開始的天氣
world.weather.set('sunny', true)   // 2026-11-12 進場先是大太陽（之後照機率自動換）
world.weather.auto(true)
if (qs.has('weather')) world.weather.set(qs.get('weather'), true)
world.weather.onThunder((delay, strength) => amb.thunder?.(delay, strength))
let wasRaining = false
world.time.setTime(hour)
// 長椅：坐下休息，跳到下一個時段（清晨 6、早上 9、黃昏 17、夜晚 19:30）
const PERIODS = [6, 9, 17, 19.5]
const nearBench = () => world.time.benches.find((b) => Math.hypot(camera.position.x - b.p.x, camera.position.z - b.p.z) < 1.6)
  ?? summitRests.find((b) => Math.hypot(camera.position.x - b.p.x, camera.position.z - b.p.z) < b.r && Math.abs(camera.position.y - b.p.y) < 2.5)   // 小木屋的床
function rest() {
  const next = PERIODS.find((p) => p > hour + 0.05) ?? PERIODS[0] + 24
  hud.fadeThrough(() => { hour = next % 24; world.time.setTime(hour); hud.toast(tr('休息到{when}', { when: tr(hour < 7 ? '清晨' : hour < 12 ? '早上' : hour < 18 ? '黃昏' : '夜晚') })) })
}
vm.setScreenTexture(cam.lcdTex)

// 首頁背景：鏡頭搬到溫室裡一個固定的位置（看中央的山和瀑布）；開始遊戲再放回玩家身上（玩家本來在店裡）
const saved = { p: new THREE.Vector3(), q: new THREE.Quaternion() }
let menuCam = false
function setMenuCam(on) {
  if (on === menuCam) return
  menuCam = on
  if (on) {
    saved.p.copy(camera.position); saved.q.copy(camera.quaternion)
    camera.position.set(MENU_VIEW.x, terrainHeight(MENU_VIEW.x, MENU_VIEW.z) + MENU_VIEW.y, MENU_VIEW.z)
    camera.lookAt(MENU_VIEW.lx, MENU_VIEW.ly, MENU_VIEW.lz)
  } else { camera.position.copy(saved.p); camera.quaternion.copy(saved.q) }
  camera.updateMatrixWorld(); flight.snap(); vm.snap()   // 鏡頭瞬間搬家不算移動／轉頭
}
setMenuCam(true)

// 預熱：先畫一張，著色器編譯完再拿掉載入畫面
world.tick(0, 0.016)
await renderer.compileAsync(scene, camera)
// 再到店裡、店門口、回頭看店、水池邊各預熱一次：每個地方的霧、燈、看得到的東西不一樣，著色器版本也不同；
// 水面倒影（畫到貼圖）、影子、手和相機也各有自己的版本。沒先編好的話，第一次走過去會整個卡住 0.5～1 秒
const home = { p: camera.position.clone(), q: camera.quaternion.clone() }
const WARM = [[-87.6, 0.4, -90], [-74, 0, -90], [-55, 2, 90], [-15, -25, 60], [103, -5, -90], [167, 12, 100]]
for (const [wi, [x, z, yaw]] of WARM.entries()) {
  setLoad(0.8 + 0.18 * wi / WARM.length, tr('準備畫面…'))
  camera.position.set(x, supportAt(x, z, 99).y + 1.7, z); camera.rotation.set(0, yaw * Math.PI / 180, 0, 'YXZ'); camera.updateMatrixWorld()
  world.tick(0, 0.016); store.tick(0, 0.016, camera, { play: false, look: false })
  await renderer.compileAsync(scene, camera)
  world.water.reflect(renderer, scene, camera, world.quality.reflScale, 1)
  world.render(); vm.render(renderer, scene)
}
camera.position.copy(home.p); camera.quaternion.copy(home.q); camera.updateMatrixWorld()
world.tick(0, 0.016)
await cam.warm()
world.render()
setLoad(1, tr('好了！'))
await new Promise((r) => setTimeout(r, 250))
loadingEl.classList.add('done')
window.gtag?.('event', 'world_loaded', { load_sec: Math.round((performance.now()) / 1000), phone: !!PHONE })

// 老闆的 AI（本地 LLM）：背景下載，好了之前用寫好的評語
// 老闆的 AI（WebLLM）：桌機瀏覽器有 WebGPU 就在背景載入；手機、沒有 WebGPU、或網址加 ?ai=0 就用寫好的評語
// 2026-11-09 學校電腦開不起來：AI 老闆（Qwen 1.5B）第一次要下載約 1 GB、再吃約 1 GB 顯示記憶體，加上遊戲本身約 1.4 GB。
// 記憶體不到 8 GB 的電腦（navigator.deviceMemory）不載，改用寫好的評語（價錢照樣算）；?ai=1 可以強制開
const BIG_PC = (navigator.deviceMemory ?? 8) >= 8
const AI_Q = new URLSearchParams(location.search).get('ai')
if (!PHONE && AI_Q !== '0' && (BIG_PC || AI_Q === '1')) loadLLM(() => hud.setStatus(llm.status === 'loading' ? tr('老闆的 AI 準備中… {p}%（第一次要下載約 1 GB）', { p: Math.round(llm.progress * 100) }) : ''))

// 首頁：開始遊戲／設定／操作說明。開始＝鎖定滑鼠（瀏覽器規定要使用者點擊才能鎖）；按 Esc 解鎖就回到這個選單（按鈕變「繼續」）
const settings = createSettings({ world, player })
const amb = createAmbience({ getMusic: () => settings.state.music, getAmb: () => settings.state.amb })   // 背景音樂＋溫室環境音（程式合成）
uiFx = createUiFx({ getSound: () => settings.state.sound })   // 滑鼠圓圈＋按鈕音效
const startEl = document.getElementById('start'), menuEl = document.getElementById('menu'), helpEl = document.getElementById('help')
// 主畫面的「載入等級」：自動（照這台電腦決定）／完整／均衡／輕量。選了存起來、重新載入後生效（貼圖縮小了沒辦法原地放大回來）
{ const box = document.getElementById('tier')
  if (box) {
    let saved = null; try { saved = localStorage.getItem('birdpark.tier') } catch {}
    const cur = saved === 'full' || saved === 'mid' || saved === 'lite' ? saved : 'auto', used = world.memStat?.tier ?? 'full'
    const NAME = { auto: tr('自動'), full: tr('完整'), mid: tr('均衡'), lite: tr('輕量') }
    const HINT = { full: tr('貼圖原尺寸、所有鳥都載入。最漂亮，需要較好的電腦，載入最久。'), mid: tr('貼圖減半、只載入 170 公尺內的鳥。'), lite: tr('貼圖再減半、只載入 110 公尺內的鳥。電腦跑不動或打不開時選這個。') }
    box.innerHTML = `<b>${tr('載入等級')}</b><div class="opts">${['auto', 'full', 'mid', 'lite'].map((k) => `<button data-tier="${k}" class="${k === cur ? 'on' : ''}">${NAME[k]}</button>`).join('')}</div><small>${cur === 'auto' ? tr('自動：這台電腦目前用「{n}」。', { n: NAME[used] }) + ' ' : ''}${HINT[used]}</small>`
    box.addEventListener('click', (e) => {
      const k = e.target?.dataset?.tier; if (!k || k === cur) return
      try { if (k === 'auto') localStorage.removeItem('birdpark.tier'); else localStorage.setItem('birdpark.tier', k) } catch {}
      location.reload()
    })
  }
}
startEl.append(settings.el)
helpEl.querySelector('.ctl').innerHTML = controlsSvg()   // 鍵盤滑鼠按鍵圖
const showSheet = (sheet) => { menuEl.hidden = !!sheet; for (const s of [helpEl, settings.el]) s.hidden = s !== sheet }
startEl.addEventListener('click', (e) => { if (e.target.closest('.back')) showSheet(null) })
document.getElementById('btnSettings').onclick = () => showSheet(settings.el)
document.getElementById('btnHelp').onclick = () => showSheet(helpEl)
startEl.hidden = false
document.body.classList.add('in-menu')   // 首頁選單上不顯示右上的錢、時間（HUD）
const goEl = document.getElementById('go')
goEl.onclick = () => player.controls.lock()
// 2026-11-12 使用者：「不用 Enter park，載完直接進入」——從標題畫面按「開始遊戲」進來的，載完直接就在公園裡（不出選單、不用再按鈕）。
// 鎖滑鼠瀏覽器規定要玩家「剛剛點過」才給：載入通常超過幾秒，自動鎖多半會被拒絕 → 那就先進場，玩家第一次點畫面（或按任何鍵）時再鎖，下面有一行小字提示
if (fromTitle) {
  startEl.hidden = true; document.body.classList.remove('in-menu'); setMenuCam(false); goEl.textContent = tr('繼續')
  const tip = document.createElement('div'); tip.id = 'clicktip'; tip.textContent = tr('點一下畫面開始操作'); document.body.append(tip)
  const grab = () => { if (!player.controls.isLocked && !panelOpen() && startEl.hidden) player.controls.lock() }
  const done = () => { tip.remove(); removeEventListener('pointerdown', grab); removeEventListener('keydown', grab) }
  addEventListener('pointerdown', grab); addEventListener('keydown', grab)
  player.controls.addEventListener('lock', done, { once: true })
  try { player.controls.lock() } catch {}
}
player.controls.addEventListener('lock', () => { setMenuCam(false); startEl.hidden = true; document.body.classList.remove('in-menu'); goEl.textContent = tr('繼續') })
player.controls.addEventListener('unlock', () => { if (!panelOpen()) { setMenuCam(true); showSheet(null); startEl.hidden = false; document.body.classList.add('in-menu') } })

const clock = new THREE.Clock()
// 錄影模式（?rec=1，宣傳影片用，tools/record/）：不自己跑迴圈，由錄影腳本呼叫 __game.step(dt) 一格一格推進（每格固定 1/30 秒、畫完截圖）
const REC = qs.has('rec')
let recT = 0
function frame() {
  requestAnimationFrame(frame)
  tick(Math.min(clock.getDelta(), 0.05), clock.elapsedTime)
}
// 鳥什麼時候在：每日排程＋活動時段＋飛來飛走（presence.js；PARK_PLAN.md）
const presence = createPresence({ world, camera, flight, hud, state, save, rec: REC })
// 串流載入：還沒有模型的鳥在背景由近到遠補上；補上一隻就接上驚飛和出沒時段
// 2026-11-12 使用者：稀有的鳥讀完再讓牠飛入——稀有、非常稀有的排到最後才載（進場時先把常見的載完，畫面比較快齊）；
// 載好的時候玩家在附近（6～130 m）就從遠處飛進來降落，不是憑空出現
const isRare = (b) => { const r = RARITY[b.def.id]; return r === '稀有' || r === '非常稀有' }
world.streamBirds({ late: isRare, onReady: (b) => {
  flight.add(b); presence.sync(b)
  if (!REC && isRare(b) && !b.absent) { const d = b.target.distanceTo(camera.position); if (d > 6 && d < 130 && flight.canFly(b)) { try { flight.arrive(b) } catch (e) { console.warn('[arrive]', b.def.id, e) } } }
} })
function tick(dt, t) {
  presence.update(hour, dt)
  if (!panelOpen() && !menuCam) player.update(dt)
  cam.update(dt)
  if (!panelOpen()) { hour = (hour + dt * 24 / DAY_SEC) % 24; world.time.setTime(hour) }
  hud.setClock(hour)
  comm.tickHour(hour)
  amb.tick(dt, { hour, pos: camera.position, rain: world.weather.rain, storm: world.weather.storm })
  if (world.weather.rain > 0.3 !== wasRaining) { wasRaining = !wasRaining; if (wasRaining && !menuCam) hud.toast(tr('開始下雨了')) }
  vm.setGear(state.bodyId, state.lensId)
  cam.setScreen(vm.screen)
  vm.update(dt, { raise: cam.state.raised ? 1 : 0, view: 0, speed: flight.speed, t })
  cam.state.vfReady = vm.st.raise > 0.85
  world.tick(t, dt)
  store.tick(t, dt, camera, { play: !menuCam, look: !panelOpen() && player.controls.isLocked && !cam.state.raised })
  flight.tick(t, dt, { sneak: player.state.sneak })
  const sf = !panelOpen() && player.controls.isLocked && !cam.state.raised ? store.focus(camera) : null
  hud.setHint(!panelOpen() && player.controls.isLocked ? (sf?.type === 'item' ? `${sf.item.name}　${state.owned.includes(sf.item.id) ? tr('已擁有') : '$' + sf.item.price.toLocaleString()}　${tr('按 E 查看')}` : sf?.type === 'counter' ? tr('按 E 跟老闆說話（賣照片、買器材）') : nearBench() ? tr(nearBench().kind === 'bed' ? '按 E 睡一下（跳到下一個時段）' : '按 E 坐下休息（跳到下一個時段）') : '') : '')
  hud.update(dt)
  settings.tick(dt, player.controls.isLocked)
  world.render()
  if (startEl.hidden) vm.render(renderer, scene)   // 手和相機另外畫（固定視角，不跟著變焦放大）；首頁選單上不畫，背景乾淨
  // 2026-11-11 圖鑑太糊：自動畫質會把解析度降到 0.65 倍，書也跟著糊 → 書打開時用螢幕原生解析度（書的場景很輕），闔上再交回自動畫質
  if (guide.visible) { const hi = Math.min(devicePixelRatio || 1, 2); if (Math.abs(renderer.getPixelRatio() - hi) > 1e-3) { renderer.setPixelRatio(hi); guideHi = true } }
  else if (guideHi) { guideHi = false; settings.apply() }
  guide.render(dt)   // 圖鑑（書）疊在最上面
}
window.__game = { torch, comm, step: (dt) => { recT += dt; tick(dt, recT) }, REC, setMenuCam, guide, amb, settings, store, product, world, player, hud, scene, camera, renderer, cam, gear, photos, state, album, shop, llm, judgePhoto, rawGen, flight, vm, setHour: (h) => { hour = h; world.time.setTime(h) } }
if (!REC) frame()
