// 遊戲入口：同一個園區（world.js），第一人稱走動、拿相機拍鳥、拿照片去相機行換錢、買鏡頭
import * as THREE from 'three'
import { buildWorld } from '../world.js'
import { createPlayer } from '../player.js'
import { createHud } from './hud.js'
import { createCamera, BODIES, LENSES } from './camera.js'
import { createAlbum } from './album.js'
import { buildShop, createShop, SHOP } from './shop.js'
import { loadState, saveState, putPhoto, deletePhoto, allPhotos } from './save.js'
import { judgePhoto, loadLLM, llm, rawGen } from './judge.js'

const loadingEl = document.getElementById('loading')
const world = await buildWorld(document.getElementById('scene'), {
  onProgress: (f) => { loadingEl.textContent = `園區建造中… ${Math.round(f * 100)}%` },
  extraReserve: [{ x: SHOP.x, z: SHOP.z, r: 3.2 }],
})
const { renderer, scene, camera } = world
buildShop(scene)

const player = createPlayer(camera, renderer.domElement)
const hud = createHud(document.getElementById('hud'))

// 存檔：錢、裝備；照片從 IndexedDB 讀回來
const state = loadState()
const photos = await allPhotos()
const save = () => { saveState(state); hud.setMoney(state.money) }
hud.setMoney(state.money)
const gear = { body: () => BODIES.find((b) => b.id === state.bodyId), lens: () => LENSES.find((l) => l.id === state.lensId) }

const cam = createCamera({ world, camera, controls: player.controls, hud, gear, onShot: (p) => {
  photos.push(p); putPhoto(p)
  hud.toast(p.subject ? `${p.subject.name}　${p.score} 分　估價 $${p.price}${p.notes.length ? '\n' + p.notes.join('、') : ''}` : '沒拍到鳥')
} })

// 面板（相簿、相機行）開著的時候放開滑鼠；關掉再鎖回去
const relock = () => player.controls.lock()
const album = createAlbum({ photos, onDelete: (p) => { photos.splice(photos.indexOf(p), 1); deletePhoto(p.time) }, onClose: relock })
const shop = createShop({ state, photos, judge: judgePhoto, onChange: (p) => { save(); if (p) putPhoto(p) }, onClose: relock })
const panelOpen = () => album.isOpen || shop.isOpen
const openPanel = (pnl) => { pnl.open(); player.controls.unlock() }

addEventListener('keydown', (e) => {
  if (e.code === 'Tab') { e.preventDefault(); if (album.isOpen) album.close(); else if (!shop.isOpen) openPanel(album) }
  if (e.code === 'KeyE') { if (shop.isOpen) shop.close(); else if (!album.isOpen && nearShop()) openPanel(shop) }
  if (e.code === 'KeyQ' && player.controls.isLocked) {
    // 換下一支有的鏡頭
    const mine = LENSES.filter((l) => state.owned.includes(l.id))
    state.lensId = mine[(mine.findIndex((l) => l.id === state.lensId) + 1) % mine.length].id
    save(); hud.toast(`換上 ${gear.lens().name}`)
  }
})
const nearShop = () => Math.hypot(camera.position.x - SHOP.x, camera.position.z - (SHOP.z + 1.2)) < 3.2

// 預熱：先畫一張，著色器編譯完再拿掉載入畫面
world.tick(0, 0.016)
await renderer.compileAsync(scene, camera)
world.render()
loadingEl.classList.add('done')

// 老闆的 AI（本地 LLM）：背景下載，好了之前用寫好的評語
// 老闆的 AI 是實驗功能（網址加 ?ai=1）：瀏覽器裡的小模型在 CPU 上一張要十幾二十秒、評語也不太穩，預設用寫好的評語
if (new URLSearchParams(location.search).has('ai')) loadLLM(() => hud.setStatus(llm.status === 'loading' ? `老闆的 AI 準備中… ${Math.round(llm.progress * 100)}%` : llm.status === 'ready' ? '' : llm.status === 'failed' ? '' : ''))

// 開始畫面：點一下鎖定滑鼠（瀏覽器規定要使用者點擊才能鎖）
const startEl = document.getElementById('start')
startEl.hidden = false
document.getElementById('go').onclick = () => player.controls.lock()
player.controls.addEventListener('lock', () => { startEl.hidden = true })
player.controls.addEventListener('unlock', () => { if (!panelOpen()) startEl.hidden = false })

const clock = new THREE.Clock()
function frame() {
  requestAnimationFrame(frame)
  const dt = Math.min(clock.getDelta(), 0.05), t = clock.elapsedTime
  if (!panelOpen()) player.update(dt)
  cam.update(dt)
  world.tick(t, dt)
  hud.setHint(!panelOpen() && player.controls.isLocked && nearShop() ? '按 E 進入相機行' : '')
  hud.update(dt)
  world.render()
}
window.__game = { world, player, hud, scene, camera, renderer, cam, gear, photos, state, album, shop, llm, judgePhoto, rawGen }
frame()
