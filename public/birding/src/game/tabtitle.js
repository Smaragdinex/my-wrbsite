// 2026-11-10 使用者：分頁標題要「會動」，像 xarts.games 首頁那隻走路的貓（public/assets/shell.mjs 的 tabTitle）。
// 這裡是一隻鳥固定在第 2 格，後面的山和樹一直往後捲，看起來就像鳥一直往前飛。
// 分頁在背景時瀏覽器會把計時器降到每秒一次，還是會動，所以不用另外處理。
// 會蓋掉 main.js 設的 document.title（只在載入時設一次）。
const BLANK = ' '   // em space：寬度跟 emoji 差不多，捲動時才不會一格寬一格窄
const BIRD = 2
const scenery = ['⛰️', BLANK, '🌲', BLANK, BLANK, '🌳', BLANK, '🏔️', BLANK, '🌲', '🌲', BLANK]
const W = 9   // 只顯示前 9 格，其他留在畫面外輪流捲進來

function draw() {
  document.title = `Birdwatching ${scenery.slice(0, W).map((c, i) => (i === BIRD ? '🐦' : c)).join('')}`
}

draw()
setInterval(() => { scenery.unshift(scenery.pop()); draw() }, 260)   // 🐦 頭朝左（Apple 的 emoji）→ 風景往右捲，鳥看起來往左飛
