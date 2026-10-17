// 首頁的捲動控制(自己接手滾輪/觸控/鍵盤,頁面本身不捲):
//   open   :往下滑 → X 停在畫面上打開(進度跟著手)
//   gate   :X 打開到底後鎖住,出現讀條 —— 要夠快、連續地往下滑才會漲,一停就慢慢掉回去,滿了才出發
//   launch :自動播放 —— 顆粒自己化開 → 星際穿越(光速星線)→ 太空梭從遠方飛進來
//   ship   :一頁一頁:0 = 戰艦外觀、1~5 = 艦內五間房;一次滑動換一頁(換頁中鎖住一下,才不會一次跳好幾間)
// 其他模組每幀讀 window.__xp(open / dissolve / warp / fadeBg / ship / tour)
const XP = window.__xp = { state: 'open', open: 0, dissolve: 0, warp: 0, fadeBg: 0, ship: 0, tour: 0, charge: 0, flash: 0 };
const clamp01 = (v) => Math.min(1, Math.max(0, v)), seg = (v, a, b) => clamp01((v - a) / (b - a)), ease = (t) => t * t * (3 - 2 * t);

const OPEN_LEN = 1.4;          // 打開 X 要滑幾個「螢幕高」
const TOUR_LEN = 2.2;          // 看完五間房要滑幾個螢幕高
const CHARGE_PER_PX = 1 / 1100; // 讀條:每滑 1px 漲多少(要連續快滑才追得過衰減)
const DECAY = 0.42;            // 讀條每秒往回掉多少
// 手機:一次滑動只有一個螢幕高,手指抬起再放下中間又會掉 → 每滑一次漲比較多(約 3 下滿)、手指按著不掉、放開後等一下才慢慢掉
const TOUCH_CHARGE = 1 / 1.9;   // 每滑「一個螢幕高」漲多少
const TOUCH_GRACE = 700, TOUCH_DECAY = 0.2;
const LAUNCH_SEC = 9.0;

let waitShip = false, vOpen = 0, vTour = 0, launchT = 0, lastInput = 0, pageAcc = 0, pageLock = 0, touching = false, lastTouch = -1e9;
const ui = { gate: document.getElementById('gate'), fill: document.getElementById('gateFill'), pct: document.getElementById('gatePct') };

// 戰艦階段的換頁 / 回上一層交給 starship/main.mjs(window.__shipNav):kind 'v' 上下、'h' 左右、'back' 回上一層;
// 一次動作後鎖一下,避免觸控板一次滑動觸發好幾次
function nav(kind, d = 0) {
  const now = performance.now();
  if (XP.state !== 'ship' || now < pageLock) return;
  pageLock = now + 900; window.__shipNav?.(kind, d);
}

function input(dyPx, touch = false, axis = 'v') {          // dyPx > 0 = 往下滑(內容往上走);手機一次滑動距離很大,讀條另外算
  const cpp = touch ? TOUCH_CHARGE / innerHeight : CHARGE_PER_PX;
  lastInput = performance.now();
  const vh = innerHeight;
  if (XP.state === 'open') {
    vOpen = Math.max(0, vOpen + dyPx / vh);
    if (vOpen >= OPEN_LEN) { vOpen = OPEN_LEN; XP.state = 'gate'; }
  } else if (XP.state === 'gate') {
    if (dyPx < 0) waitShip = false;                                        // 等戰艦時往上滑 = 取消
    if (dyPx > 0) XP.charge = Math.min(1, XP.charge + dyPx * cpp);
    else if (XP.charge <= 0.001) { XP.state = 'open'; vOpen = Math.max(0, OPEN_LEN + dyPx / vh); }   // 讀條空的時候往上滑 = 退回去把 X 合起來
    else XP.charge = Math.max(0, XP.charge + dyPx * cpp);
    if (XP.charge >= 1) { XP.charge = 1; waitShip = true; }                // 讀條滿了:戰艦模型載好就出發(tick 裡檢查)
  } else if (XP.state === 'ship') {
    const now = performance.now();
    if (now < pageLock) return;
    pageAcc += dyPx;
    if (Math.abs(pageAcc) > (touch ? 45 : 60)) { const d = Math.sign(pageAcc); pageAcc = 0; nav(axis, d); }
  }
}

// 滾輪(觸控板也是 wheel 事件)
addEventListener('wheel', (e) => { e.preventDefault(); const k = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? innerHeight : 1; const h = XP.state === 'ship' && Math.abs(e.deltaX) > Math.abs(e.deltaY); input((h ? e.deltaX : e.deltaY) * k, false, h ? 'h' : 'v'); }, { passive: false });
// 手機:手指往上推 = 往下滑
let ty = null, tx = null;
addEventListener('touchstart', (e) => { ty = e.touches[0].clientY; tx = e.touches[0].clientX; touching = true; lastTouch = performance.now(); }, { passive: true });
addEventListener('touchmove', (e) => { if (ty == null) return; if (window.__shipDrag) { if (e.cancelable) e.preventDefault(); return; }   // 正在拖曳旋轉戰艦:不換頁
  const y = e.touches[0].clientY, x = e.touches[0].clientX, dy = ty - y, dx = tx - x;
  const h = XP.state === 'ship' && Math.abs(dx) > Math.abs(dy); input((h ? dx : dy) * 1.6, true, h ? 'h' : 'v'); ty = y; tx = x; lastTouch = performance.now(); if (e.cancelable) e.preventDefault(); }, { passive: false });
const touchUp = () => { ty = tx = null; touching = false; lastTouch = performance.now(); };
addEventListener('touchend', touchUp); addEventListener('touchcancel', touchUp);
// 鍵盤
addEventListener('keydown', (e) => {
  const step = { ArrowDown: 80, PageDown: innerHeight * .8, ' ': innerHeight * .8, ArrowUp: -80, PageUp: -innerHeight * .8 }[e.key];
  if (step != null) { e.preventDefault(); input(step); return; }
  const d = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
  if (d) { e.preventDefault(); nav('h', d); }
  if (e.key === 'Escape') { e.preventDefault(); nav('back'); }
});

let prev = performance.now();
function tick(now) {
  const dt = Math.min(.05, (now - prev) / 1000); prev = now;
  const shipOk = () => { try { return !!window.__shipReady?.(); } catch { return false; } };
  if (waitShip && XP.state === 'gate' && shipOk()) { waitShip = false; XP.state = 'launch'; launchT = 0; }
  if (XP.state === 'gate' && !waitShip) {                                                // 停手就慢慢掉
    const byTouch = now - lastTouch < 4000;
    if (byTouch) { if (!touching && now - lastTouch > TOUCH_GRACE) XP.charge = Math.max(0, XP.charge - TOUCH_DECAY * dt); }
    else if (now - lastInput > 90) XP.charge = Math.max(0, XP.charge - DECAY * dt);
  }
  if (now - lastInput > 250) pageAcc = 0;
  if (XP.state === 'launch') {
    launchT += dt;
    const s = launchT;
    XP.dissolve = ease(seg(s, 0, 2.8));                        // 0~2.8 秒:顆粒化開
    XP.warp = ease(seg(s, 2.0, 2.4)) * (1 - ease(seg(s, 6.6, 7.3)));   // 2~7.3 秒:超空間跳躍(星星拉長 → 光隧道 → 跳出)
    XP.lt = s;                                                     // 給 starship/main.mjs 分段用
    XP.fadeBg = ease(seg(s, 2.4, 4.0));
    XP.flash = Math.sin(Math.PI * seg(s, 6.4, 7.6)) * .7;      // 抵達時一下白光
    XP.ship = ease(seg(s, 6.6, LAUNCH_SEC));                   // 太空梭飛進來
    if (s >= LAUNCH_SEC) XP.state = 'ship';
  }
  // 打散與看房間都用平滑追上(不是瞬間跳到手指的位置),動起來比較慢、比較柔
  XP.open += (ease(clamp01(vOpen / OPEN_LEN)) - XP.open) * Math.min(1, dt * 2.2);
  XP.tour += (clamp01(vTour / TOUR_LEN) - XP.tour) * Math.min(1, dt * 2.2);
  // 讀條 UI
  const g = XP.state === 'gate' || (XP.state === 'launch' && launchT < .5);
  ui.gate.classList.toggle('on', g);
  ui.fill.style.transform = `scaleX(${XP.charge.toFixed(3)})`;
  ui.pct.textContent = waitShip && XP.state === 'gate' ? `LOADING SHIP ${Math.round((window.__shipProgress?.() || 0) * 100)}%` : Math.round(XP.charge * 100) + '%';
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);
window.__xpDebug = { input, jump(state) { if (state === 'gate') { vOpen = OPEN_LEN; XP.state = 'gate'; } if (state === 'launch') { vOpen = OPEN_LEN; XP.state = 'launch'; launchT = 0; } if (state === 'ship') { vOpen = OPEN_LEN; XP.state = 'launch'; launchT = LAUNCH_SEC; } }, setTour(v) { vTour = v * TOUR_LEN; }, nav, setLaunchT(v) { launchT = v; } };
