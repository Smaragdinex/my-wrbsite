// 2026-11-14 使用者「單獨的圖鑑也做網站，直接看全部鳥，就只有書打開」：guide.html
// 跟遊戲裡按 E 打開的是同一本書（guide.js），catalog 模式：全部鳥都解鎖、沒有拍照成績、書不能闔上。
// 頁面只畫書（沒有 3D 園區），背景是深色桌面。
import * as THREE from 'three'
import { BIRDS } from '../birdinfo.js'
import { createGuide, guideAniso } from './guide.js'
import { t as tr, LANG, LANGS, setLang } from '../i18n.js'

// 四種語言切換（跟遊戲首頁一樣：存 localStorage 'lang' 再重新載入；網址 ?lang=en 也可以，guide.html 開頭的小 script 處理）
{
  const box = document.createElement('div'); box.className = 'langs'
  box.innerHTML = LANGS.map((l) => `<button data-lang="${l.id}" class="${l.id === LANG ? 'on' : ''}">${l.label}</button>`).join('')
  box.onclick = (e) => { const b = e.target.closest('[data-lang]'); if (b && b.dataset.lang !== LANG) { const u = new URL(location.href); u.searchParams.delete('lang'); history.replaceState(null, '', u); setLang(b.dataset.lang) } }
  document.body.appendChild(box)
}

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
if (hint) hint.textContent = matchMedia('(pointer: coarse)').matches ? tr('點書頁左右兩邊翻頁') : tr('← → 翻頁　Home 回目錄')
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
