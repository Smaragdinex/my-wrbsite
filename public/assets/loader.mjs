// 一進首頁的讀取頁(index.html 的 #loader):小太空船沿著進度線往前飛,百分比跟著戰艦 / 通道 / 大廳的載入進度走。
//   全部載好(window.__shipReady)→ 小船往前衝出去、整頁淡出 → 才看到顆粒 X;之後的超空間一路播完,不再停在隧道裡等。
//   讀取中 window.__loading = true:control.mjs 不接滾輪 / 觸控(不然 X 會在讀取頁後面偷偷打開)。
const el = document.getElementById('loader');
if (!el) window.__loading = false;
else {
  const ship = el.querySelector('.ship'), trail = el.querySelector('.trail'), pct = el.querySelector('.pct'), track = el.querySelector('.track');
  const MIN_MS = 1200, MAX_MS = 45000;                                   /* 至少顯示一下(快取很快時不要一閃而過);最久等 45 秒,之後交給超空間的 HOLD */
  const t0 = performance.now();
  let shown = 0, leaving = false;
  const ready = () => { try { return !!window.__shipReady?.(); } catch { return false; } };
  const target = (now) => {
    const p = window.__shipProgress?.();
    const crawl = Math.min(.08, (now - t0) / 25000);                    /* 3D 模組還沒載到時,進度也慢慢往前爬一點,不要卡在 0% */
    return Math.min(.97, Math.max(crawl, typeof p === 'number' ? p : 0));
  };
  const draw = () => {
    const run = track.clientWidth - ship.offsetWidth, x = shown * run;  /* 小船整艘都在線上:0% 時船尾貼線的左端、100% 時船頭到右端 */
    ship.style.transform = `translateX(${x.toFixed(1)}px)`;
    trail.style.width = `${(x + ship.offsetWidth * .2).toFixed(1)}px`;
    pct.textContent = `${Math.round(shown * 100)}%`;
  };
  const leave = () => {
    leaving = true; shown = 1; draw();
    window.__crumb?.('loader done');
    setTimeout(() => {                                                   // 滿格停一下 → 小船加速衝出畫面右邊 → 整頁淡出
      el.classList.add('go');
      ship.style.transform = `translateX(${track.clientWidth + innerWidth}px)`;
      el.classList.add('done');
      window.__loading = false;
      setTimeout(() => el.remove(), 1200);
    }, 260);
  };
  const tick = (now) => {
    if (leaving) return;
    const done = ready() || now - t0 > MAX_MS;
    const goal = done ? 1 : target(now);
    shown += (Math.max(shown, goal) - shown) * .08;                      /* 平滑往前,永遠不往回掉 */
    draw();
    if (done && now - t0 > MIN_MS && shown > .985) { leave(); return; }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
