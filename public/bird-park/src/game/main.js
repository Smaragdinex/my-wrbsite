// 遊戲入口：同一個園區（world.js），第一人稱走動、拿相機拍鳥、拿照片去相機行換錢、買鏡頭
import * as THREE from 'three'
import { buildWorld, PHONE } from '../world.js'
import { createSettings } from './settings.js'
import { createAmbience } from './ambience.js'
import { createPlayer } from '../player.js'
import { createHud } from './hud.js'
import { createCamera, BODIES, LENSES } from './camera.js'
import { createAlbum } from './album.js'
import { createShop } from './shop.js'
import { buildStore } from './store.js'
import { loadState, saveState, putPhoto, deletePhoto, allPhotos } from './save.js'
import { judgePhoto, loadLLM, llm, rawGen } from './judge.js'
import { createFlight, flyModels } from './flight.js'
import { priceFor } from './scoring.js'
import { createViewmodel } from './viewmodel.js'
import { createUiFx } from './ui-fx.js'
import { controlsSvg } from './controls-help.js'
import { MENU_VIEW, terrainHeight } from '../layout.js'

const loadingEl = document.getElementById('loading')
const world = await buildWorld(document.getElementById('scene'), {
  onProgress: (f) => { loadingEl.textContent = `園區建造中… ${Math.round(f * 100)}%` },
  extraModels: flyModels(),
  night: true,
})
const { renderer, scene, camera } = world

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
for (const p of photos) if (!p.sold && p.score <= 0 && (p.subject || p.price)) { p.subject = null; p.price = 0; p.notes = ['沒拍到鳥（太小、太糊或看不清楚）']; putPhoto(p) }
// 收購價改成分數分級（60 分以下不收）：沒賣掉的舊照片照新規則重算估價
for (const p of photos) if (!p.sold && p.subject) { const np = priceFor(p.subject.id, p.score); if (np !== p.price) { p.price = np; putPhoto(p) } }
const save = () => { saveState(state); hud.setMoney(state.money) }
hud.setMoney(state.money)
const gear = { body: () => BODIES.find((b) => b.id === state.bodyId), lens: () => LENSES.find((l) => l.id === state.lensId) }

const cam = createCamera({ world, camera, controls: player.controls, hud, gear, onShot: (p) => {
  photos.push(p); putPhoto(p)
  // 拍的當下不顯示分數、評語、價錢（使用者要求）：要到相簿或相機行老闆那裡才知道拍得怎樣
  hud.toast('已存入相簿')
} })

// 面板（相簿、相機行）開著的時候放開滑鼠；關掉再鎖回去
const relock = () => player.controls.lock()
const album = createAlbum({ photos, onDelete: (p) => { photos.splice(photos.indexOf(p), 1); deletePhoto(p.time) }, onClose: relock })
const store = await buildStore(scene, state)   // 相機行：溫室門口外面那棟店，遊戲從店裡開始
const shop = createShop({ state, photos, judge: judgePhoto, onChange: (p) => { save(); store.refresh(); if (p) putPhoto(p) }, onClose: relock })
const panelOpen = () => album.isOpen || shop.isOpen || cam.panelOpen
const openPanel = (pnl) => { pnl.open(); player.controls.unlock() }

addEventListener('keydown', (e) => {
  if (e.code === 'Tab') { e.preventDefault(); if (album.isOpen) album.close(); else if (!shop.isOpen) openPanel(album) }
  // E：舉著相機 → 相機設定；靠近相機行 → 進店；靠近長椅 → 休息
  if (e.code === 'KeyE' && cam.panelOpen) { cam.closePanel(); return }
  if (e.code === 'KeyE' && cam.state.raised && player.controls.isLocked) { cam.openPanel(); return }
  if (e.code === 'KeyE') {
    if (shop.isOpen) return shop.close()
    const f = !album.isOpen && player.controls.isLocked ? store.focus(camera) : null
    if (f?.type === 'item') { shop.open('gear', f.item.id); player.controls.unlock() }      // 逛店：看著展示台 → 器材頁跳到那一項
    else if (f?.type === 'counter') store.checkout(() => { shop.open('sell'); player.controls.unlock() })   // 櫃台：老闆不在櫃台就先走回來，到了才開買賣畫面
    else if (!panelOpen() && player.controls.isLocked && nearBench()) rest()
  }
  if (e.code === 'KeyQ' && player.controls.isLocked) {
    // 換下一支有的鏡頭
    const mine = LENSES.filter((l) => state.owned.includes(l.id))
    state.lensId = mine[(mine.findIndex((l) => l.id === state.lensId) + 1) % mine.length].id
    save(); hud.toast(`換上 ${gear.lens().name}`)
  }
})
// 日夜：一天 24 分鐘（遊戲裡 1 小時 = 現實 1 分鐘）；網址 ?t=19.5 可以直接從某個時間開始
const DAY_SEC = 24 * 60
const qs = new URLSearchParams(location.search)
let hour = qs.has('t') ? +qs.get('t') : 9
world.time.setTime(hour)
// 長椅：坐下休息，跳到下一個時段（清晨 6、早上 9、黃昏 17、夜晚 19:30）
const PERIODS = [6, 9, 17, 19.5]
const nearBench = () => world.time.benches.find((b) => Math.hypot(camera.position.x - b.p.x, camera.position.z - b.p.z) < 1.6)
function rest() {
  const next = PERIODS.find((p) => p > hour + 0.05) ?? PERIODS[0] + 24
  hud.fadeThrough(() => { hour = next % 24; world.time.setTime(hour); hud.toast(`休息到${hour < 7 ? '清晨' : hour < 12 ? '早上' : hour < 18 ? '黃昏' : '夜晚'}`) })
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
}
setMenuCam(true)

// 預熱：先畫一張，著色器編譯完再拿掉載入畫面
world.tick(0, 0.016)
await renderer.compileAsync(scene, camera)
await cam.warm()
world.render()
loadingEl.classList.add('done')

// 老闆的 AI（本地 LLM）：背景下載，好了之前用寫好的評語
// 老闆的 AI（WebLLM）：桌機瀏覽器有 WebGPU 就在背景載入；手機、沒有 WebGPU、或網址加 ?ai=0 就用寫好的評語
if (!PHONE && new URLSearchParams(location.search).get('ai') !== '0') loadLLM(() => hud.setStatus(llm.status === 'loading' ? `老闆的 AI 準備中… ${Math.round(llm.progress * 100)}%（第一次要下載約 1 GB）` : ''))

// 首頁：開始遊戲／設定／操作說明。開始＝鎖定滑鼠（瀏覽器規定要使用者點擊才能鎖）；按 Esc 解鎖就回到這個選單（按鈕變「繼續」）
const settings = createSettings({ world, player })
const amb = createAmbience({ getMusic: () => settings.state.music, getAmb: () => settings.state.amb })   // 背景音樂＋溫室環境音（程式合成）
createUiFx({ getSound: () => settings.state.sound })   // 滑鼠圓圈＋按鈕音效
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
player.controls.addEventListener('lock', () => { setMenuCam(false); startEl.hidden = true; document.body.classList.remove('in-menu'); goEl.textContent = '繼續' })
player.controls.addEventListener('unlock', () => { if (!panelOpen()) { setMenuCam(true); showSheet(null); startEl.hidden = false; document.body.classList.add('in-menu') } })

const clock = new THREE.Clock()
function frame() {
  requestAnimationFrame(frame)
  const dt = Math.min(clock.getDelta(), 0.05), t = clock.elapsedTime
  if (!panelOpen() && !menuCam) player.update(dt)
  cam.update(dt)
  if (!panelOpen()) { hour = (hour + dt * 24 / DAY_SEC) % 24; world.time.setTime(hour) }
  hud.setClock(hour)
  amb.tick(dt, { hour, pos: camera.position })
  vm.setGear(state.bodyId, state.lensId)
  cam.setScreen(vm.screen)
  vm.update(dt, { raise: cam.state.raised ? 1 : 0, view: 0, speed: flight.speed, t })
  cam.state.vfReady = vm.st.raise > 0.85
  world.tick(t, dt)
  store.tick(t, dt, camera, { play: !menuCam, look: !panelOpen() && player.controls.isLocked && !cam.state.raised })
  flight.tick(t, dt, { sneak: player.state.sneak })
  const sf = !panelOpen() && player.controls.isLocked && !cam.state.raised ? store.focus(camera) : null
  hud.setHint(!panelOpen() && player.controls.isLocked ? (sf?.type === 'item' ? `${sf.item.name}　${state.owned.includes(sf.item.id) ? '已擁有' : '$' + sf.item.price.toLocaleString()}　按 E 查看` : sf?.type === 'counter' ? '按 E 跟老闆說話（賣照片、買器材）' : nearBench() ? '按 E 坐下休息（跳到下一個時段）' : '') : '')
  hud.update(dt)
  settings.tick(dt, player.controls.isLocked)
  world.render()
  if (startEl.hidden) vm.render(renderer, scene)   // 手和相機另外畫（固定視角，不跟著變焦放大）；首頁選單上不畫，背景乾淨
}
window.__game = { setMenuCam, amb, settings, store, world, player, hud, scene, camera, renderer, cam, gear, photos, state, album, shop, llm, judgePhoto, rawGen, flight, vm, setHour: (h) => { hour = h; world.time.setTime(h) } }
frame()
