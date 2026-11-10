// 遊戲入口：同一個園區（world.js），第一人稱走動、拿相機拍鳥、拿照片去相機行換錢、買鏡頭
import * as THREE from 'three'
import { buildWorld, PHONE } from '../world.js'
import { createSettings } from './settings.js'
import { createAmbience } from './ambience.js'
import { createPlayer } from '../player.js'
import { createHud } from './hud.js'
import { createCamera, BODIES, LENSES } from './camera.js'
import { createPlayback } from './playback.js'
import { createGuide } from './guide.js'
import { createShop } from './shop.js'
import { createCommissions } from './commissions.js'
import { createProductView } from './product.js'
import { buildStore } from './store.js'
import { loadState, saveState, putPhoto, deletePhoto, allPhotos } from './save.js'
import { judgePhoto, loadLLM, llm, rawGen } from './judge.js'
import { createFlight, flyModels } from './flight.js'
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
const world = await buildWorld(document.getElementById('scene'), {
  onProgress: (f, stage) => stage === 'build' ? setLoad(0.7, tr('蓋公園、種樹…')) : setLoad(f * 0.7, tr('下載植物和鳥…')),
  extraModels: flyModels(),
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

addEventListener('keydown', (e) => {
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
    torch.visible = !torch.visible
    hud.toast(tr(torch.visible ? '手電筒：開' : '手電筒：關'), 1.2)
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
const torch = new THREE.SpotLight(0xffe6c4, 32, 30, 0.55, 0.95, 1.5)
torch.position.set(-0.32, -0.08, -0.3); torch.target.position.set(0.4, -0.7, -10)
camera.add(torch, torch.target); torch.visible = false
// 日夜：一天 24 分鐘（遊戲裡 1 小時 = 現實 1 分鐘）；網址 ?t=19.5 可以直接從某個時間開始
const DAY_SEC = 24 * 60
const qs = new URLSearchParams(location.search)
let hour = qs.has('t') ? +qs.get('t') : 9
// 天氣：遊戲裡自己隨機變（晴／多雲／下雨／雷雨）；?weather=rain 之類可以固定一開始的天氣
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
function tick(dt, t) {
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
  guide.render(dt)   // 圖鑑（書）疊在最上面
}
window.__game = { torch, comm, step: (dt) => { recT += dt; tick(dt, recT) }, REC, setMenuCam, guide, amb, settings, store, product, world, player, hud, scene, camera, renderer, cam, gear, photos, state, album, shop, llm, judgePhoto, rawGen, flight, vm, setHour: (h) => { hour = h; world.time.setTime(h) } }
if (!REC) frame()
