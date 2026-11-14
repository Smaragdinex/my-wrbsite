// 2026-11-14 使用者「單獨的圖鑑也做網站，直接看全部鳥，就只有書打開」：guide.html
// 跟遊戲裡按 E 打開的是同一本書（guide.js），catalog 模式：全部鳥都解鎖、沒有拍照成績、書不能闔上。
// 頁面只畫書（沒有 3D 園區），背景是深色桌面。
import * as THREE from 'three'
import { BIRDS } from '../birdinfo.js'
import { createGuide, guideAniso } from './guide.js'
import { t as tr } from '../i18n.js'

const renderer = new THREE.WebGLRenderer({ antialias: true })
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2))
renderer.setSize(innerWidth, innerHeight)
renderer.outputColorSpace = THREE.SRGBColorSpace
renderer.toneMapping = THREE.ACESFilmicToneMapping   // 跟遊戲一樣（書頁 shader 有用到 tone mapping 的函式）
renderer.toneMappingExposure = 1.05
renderer.setClearColor(0x1d2a22)
document.body.appendChild(renderer.domElement)
addEventListener('resize', () => renderer.setSize(innerWidth, innerHeight))
guideAniso(renderer)

const all = {}
for (const b of BIRDS) all[b.id] = { n: 0, best: 0, unread: false }
const guide = createGuide({ renderer, catalog: true, getRecords: () => all })
const hint = document.querySelector('.guide-hint')
if (hint) hint.textContent = tr('← → 翻頁　Home 回目錄')
guide.open()
window.__guide = guide   // 測試腳本用

let last = performance.now()
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000); last = now
  renderer.clear()
  guide.render(dt)
  requestAnimationFrame(frame)
}
requestAnimationFrame(frame)
document.getElementById('loading')?.remove()
