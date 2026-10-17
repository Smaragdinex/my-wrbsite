// 左上角的「太空人表情頭盔」(使用者的參考圖):白色陶瓷裝甲頭盔(Blender 3D 模型 tools/blender/helmet_build.py 渲染 → assets/helmet/helm.webp),
//   外殼固定不動;深色玻璃面罩裡的藍白色 LED 表情會跟著滑鼠 / 手指在面罩裡移動(往邊緣時稍微壓扁,像貼在弧形螢幕上),
//   玻璃反光(helm_glass.webp)用 screen 疊在表情上面 → 表情像在玻璃後面。
// 8 種狀態(依網站上發生的事自動切換,優先順序由上往下):
//   錯誤  error   :生氣臉 + 變紅 + 頭上一個生氣符號(模型載入失敗、或短時間來回滾很多次)
//   驚訝  surprise:眼睛放大 + 「!」線(點臉、點機庫口 / 艙門、讀條快速往下滑)
//   載入中 loading :圓圈眼轉圈(讀條滿了在等戰艦模型)
//   播放中 playing :笑 + 音符往上飄(超空間跳躍、進艦 / 換艙的動畫)
//   開心  happy   :^ ^ 眼 + 腮紅短線 + 大笑(滑鼠靠近頭盔、指到機庫口 / 艙門 / 機器人)
//   睡眠  sleep   :閉眼 + zzz(25 秒沒動;一動就驚醒)
//   思考  think   :一字眼左右看(8 秒沒動)
//   預設  idle    :圓角眼 + 小微笑,眼睛跟著滑鼠 / 手指看
// 手機版(≤700px):拿掉頭上的小特效。其他程式可以呼叫 window.__face.show('surprise', 1200) 暫時換表情。
const NS = 'http://www.w3.org/2000/svg';
const BLUE = '#5aa8ff', RED = '#ff4d5e', CORE = '#eef8ff', CORE_RED = '#ffe1e4';
// 面罩(helm.webp 裡):中心 (50,50),半徑 26.5 × 24.2(Blender 1 單位 = 38.46)
const VCX = 50, VCY = 50, VRX = 26, VRY = 23.8;
// 每個狀態的參數(之間補間):眼睛形狀權重 pill / arc(^) / round / ring / line / closed(‿) / angry(><),嘴巴 w 寬 c 彎 o 張 f 填滿,blush 腮紅短線
const S = {
  idle:     { pill: 1, ew: 7, eh: 8.4, mw: 9, mc: 2.4, mo: 0, mf: 0 },
  happy:    { arc: 1, mw: 11, mc: 2.4, mo: 2.6, mf: 1, blush: 1 },
  surprise: { round: 1, er: 4.6, mw: 4.6, mc: 0, mo: 3.6, mf: 0 },
  think:    { line: 1, mw: 6, mc: 0, mo: 0, mf: 0 },
  playing:  { arc: 1, mw: 11, mc: 3, mo: 2, mf: 1, blush: .7 },
  loading:  { ring: 1, er: 4, mw: 5, mc: 0, mo: 2.4, mf: 0 },
  error:    { angry: 1, mw: 9, mc: -2.6, mo: 0, mf: 0, red: 1 },
  sleep:    { closed: 1, mw: 5, mc: 0, mo: 1.6, mf: 0 },
};
const BASE = { pill: 0, arc: 0, round: 0, ring: 0, line: 0, closed: 0, angry: 0, blush: 0, ew: 7, eh: 8.4, er: 4, mw: 9, mc: 2, mo: 0, mf: 0, red: 0 };
const full = (k) => ({ ...BASE, ...S[k] });

const host = document.getElementById('face');
if (host) {
  const small = () => innerWidth <= 700;
  host.innerHTML = ''; host.classList.add('emohelm');
  Object.assign(host.style, { position: 'relative', width: '60px', height: '60px', cursor: 'pointer', filter: 'none' });
  const svg = document.createElementNS(NS, 'svg'); svg.setAttribute('viewBox', '-30 -30 160 160');
  Object.assign(svg.style, { position: 'absolute', left: '-30px', top: '-30px', width: '120px', height: '120px', overflow: 'visible', pointerEvents: 'none' });
  svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', 'X·ARTS helmet face'); host.appendChild(svg);
  const g = (tag, a, p = svg) => { const e = document.createElementNS(NS, tag); for (const k in a) e.setAttribute(k, a[k]); p.appendChild(e); return e; };
  const defs = g('defs', {});
  defs.innerHTML = `
    <filter id="fLed" x="-60%" y="-60%" width="220%" height="220%" color-interpolation-filters="sRGB">
      <feGaussianBlur in="SourceAlpha" stdDeviation="1.5" result="a"/><feFlood id="fLedCol" flood-color="${BLUE}"/><feComposite in2="a" operator="in" result="gl"/>
      <feGaussianBlur in="SourceAlpha" stdDeviation=".5" result="a2"/><feFlood id="fLedCol2" flood-color="#9fd0ff"/><feComposite in2="a2" operator="in" result="gl2"/>
      <feMerge><feMergeNode in="gl"/><feMergeNode in="gl"/><feMergeNode in="gl2"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    <filter id="fGlow" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="1.2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    <clipPath id="cVisor"><ellipse cx="${VCX}" cy="${VCY}" rx="${VRX}" ry="${VRY}"/></clipPath>`;
  const fLedCol = defs.querySelector('#fLedCol'), fLedCol2 = defs.querySelector('#fLedCol2');
  // 頭盔外殼(固定)→ 面罩裡的表情(會動)→ 玻璃反光(固定,screen 疊上去)
  const IMG = (n) => { const im = new Image(); im.src = `/assets/helmet/${n}?v=3`; return im.src; };
  g('image', { href: IMG('helm.webp'), x: 0, y: 0, width: 100, height: 100 });
  const faceG = g('g', { 'clip-path': 'url(#cVisor)' });
  const moveG = g('g', {}, faceG);                                               // 表情整組:跟著滑鼠移動 + 往邊緣壓扁
  const led = g('g', { filter: 'url(#fLed)' }, moveG);
  g('image', { href: IMG('helm_glass.webp'), x: 0, y: 0, width: 100, height: 100, style: 'mix-blend-mode:screen' });
  const visorEdge = g('ellipse', { cx: VCX, cy: VCY, rx: VRX + .4, ry: VRY + .4, fill: 'none', 'stroke-width': 1.4, stroke: RED, filter: 'url(#fGlow)', opacity: 0 });   /* 錯誤時面罩內緣變紅 */
  const mkEye = () => ({
    pill: g('rect', { rx: 3.5 }, led),
    arc: g('path', { fill: 'none', 'stroke-width': 3.4, 'stroke-linecap': 'round' }, led),
    round: g('circle', {}, led),
    ring: g('circle', { fill: 'none', 'stroke-width': 2 }, led),
    line: g('rect', { rx: 1.3, height: 2.6 }, led),
    closed: g('path', { fill: 'none', 'stroke-width': 2.6, 'stroke-linecap': 'round' }, led),
    angry: g('path', { fill: 'none', 'stroke-width': 2.8, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, led),
    blush: [0, 1].map(() => g('path', { fill: 'none', 'stroke-width': 1.5, 'stroke-linecap': 'round' }, led)),
  });
  const eyes = [mkEye(), mkEye()];
  const mouth = g('path', { 'stroke-width': 2.4, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, led);
  // 頭上的小特效:星星、驚嘆線、音符、zzz、生氣符號
  const fx = g('g', { transform: 'translate(88 4)', filter: 'url(#fGlow)' });
  const star = (x, y, r) => g('path', { d: `M${x} ${y - r}Q${x} ${y} ${x + r} ${y}Q${x} ${y} ${x} ${y + r}Q${x} ${y} ${x - r} ${y}Q${x} ${y} ${x} ${y - r}Z` }, fx);
  const stars = [star(4, 4, 6), star(14, -6, 3.6), star(-4, -8, 2.6)];
  const bang = [g('path', { d: 'M0 2 L4 -8', 'stroke-width': 2.4, 'stroke-linecap': 'round' }, fx), g('path', { d: 'M7 6 L14 -1', 'stroke-width': 2.4, 'stroke-linecap': 'round' }, fx), g('path', { d: 'M10 13 L18 11', 'stroke-width': 2.4, 'stroke-linecap': 'round' }, fx)];
  const notes = [0, 1].map(() => { const n = g('g', {}, fx); g('ellipse', { cx: 0, cy: 8, rx: 3.2, ry: 2.4, transform: 'rotate(-20 0 8)' }, n); g('path', { d: 'M2.8 7 V-6 Q8 -4 9 0', fill: 'none', 'stroke-width': 1.8, 'stroke-linecap': 'round' }, n); return n; });
  const zzz = g('text', { x: 0, y: 6, 'font-size': 13, 'font-weight': 700, 'font-family': 'Helvetica Neue, Arial, sans-serif' }, fx); zzz.textContent = 'z';
  const zzz2 = g('text', { x: 9, y: -4, 'font-size': 9, 'font-weight': 700, 'font-family': 'Helvetica Neue, Arial, sans-serif' }, fx); zzz2.textContent = 'z';
  const anger = g('g', { transform: 'translate(6 2)' }, fx);
  for (const r of [0, 90, 180, 270]) g('path', { d: 'M-1.5 -6 Q-1.5 -1.5 -6 -1.5', fill: 'none', 'stroke-width': 2.4, 'stroke-linecap': 'round', transform: `rotate(${r})` }, anger);

  let state = 'idle', until = 0, flash = 0;
  const cur = full('idle'); let tgt = full('idle');
  const look = { x: 0, y: 0 }, lk = { x: 0, y: 0 };
  const L = (a, b, k) => a + (b - a) * k;
  const setState = (k) => { if (k !== state) { state = k; tgt = full(k); } };
  function show(k, ms = 1400) { const map = { smile: 'happy', laugh: 'playing', mad: 'error', sad: 'think', cry: 'error', wink: 'happy', sleepy: 'sleep', neutral: 'idle' }; k = map[k] || k; until = performance.now() + ms; setState(k); if (k === 'surprise') flash = 1; }
  window.__face = { show, get emotion() { return state; } };

  // ---- 輸入:表情看滑鼠 / 手指,閒置計時 ----
  let lastMove = performance.now(), near = false;
  function pointAt(x, y) {
    const r = host.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2, dx = x - cx, dy = y - cy, d = Math.hypot(dx, dy) || 1, k = Math.min(1, d / 260);
    look.x = dx / d * k; look.y = dy / d * k; near = d < 110;
  }
  function wake() { const was = performance.now() - lastMove > 25000; lastMove = performance.now(); if (was) show('surprise', 900); }
  addEventListener('pointermove', (e) => { pointAt(e.clientX, e.clientY); wake(); }, { passive: true });
  addEventListener('touchstart', (e) => { const t = e.touches[0]; if (t) pointAt(t.clientX, t.clientY); wake(); }, { passive: true });
  addEventListener('keydown', wake);
  let lastDir = 0, flips = [];
  addEventListener('wheel', (e) => {
    wake(); const d = Math.sign(e.deltaY); if (!d) return;
    if (lastDir && d !== lastDir) { const now = performance.now(); flips = flips.filter((t) => now - t < 2200); flips.push(now); if (flips.length >= 5) { flips = []; show('error', 1500); } }
    lastDir = d;
  }, { passive: true });
  addEventListener('pointerup', () => { const h = window.__shipHover?.(); if (h && (h.door >= 0 || h.hangar)) show('surprise', 1100); }, true);
  host.addEventListener('click', (e) => { e.stopPropagation(); show('surprise', 1200); });

  function baseState(now) {
    if (window.__siteError) return 'error';
    const xp = window.__xp, gp = document.getElementById('gatePct');
    if (gp && /LOADING/.test(gp.textContent) && xp?.state === 'gate') return 'loading';
    if (xp?.state === 'gate' && xp.charge > .12) return 'surprise';
    const mode = window.__shipState?.mode;
    if (xp?.state === 'launch' || /^(enter|toRoom|toHall|exit)$/.test(mode || '')) return 'playing';
    const h = window.__shipHover?.();
    if (near || (h && (h.door >= 0 || h.hangar || h.bot))) return 'happy';
    const idle = now - lastMove;
    if (idle > 25000) return 'sleep';
    if (idle > 8000) return 'think';
    return 'idle';
  }

  const f = (v) => v.toFixed(2);
  function frame(t) {
    if (t > until) setState(baseState(t));
    for (const k in tgt) cur[k] = L(cur[k], tgt[k], .15);
    flash *= .9;
    const c = cur, sec = t / 1000, red = c.red > .5;
    const col = red ? RED : BLUE, core = red ? CORE_RED : CORE;
    // 看哪裡(-1~1):思考時自己左右看、睡覺時往下
    let lx = lk.x = L(lk.x, look.x, .1), ly = lk.y = L(lk.y, look.y, .1);
    if (state === 'think') { lx = Math.sin(sec * 1.6) * .8; ly = -.15; }
    if (state === 'sleep') { lx *= .2; ly = .25; }
    // 表情在面罩裡移動:最多左右 5.5、上下 4;越靠邊越扁(弧形玻璃的感覺)
    const dx = lx * 5.5, dy = ly * 4, sx = 1 - Math.abs(lx) * .12, sy = 1 - Math.abs(ly) * .1;
    const shake = state === 'error' ? Math.sin(t / 40) * .8 : 0;
    moveG.setAttribute('transform', `translate(${f(VCX + dx + shake)} ${f(VCY + dy)}) scale(${f(sx)} ${f(sy)}) translate(${-VCX} ${-VCY})`);
    visorEdge.setAttribute('opacity', f(c.red * .85));
    fLedCol.setAttribute('flood-color', col); fLedCol2.setAttribute('flood-color', red ? '#ff9aa4' : '#9fd0ff');
    fx.style.display = small() ? 'none' : '';
    // 眼睛
    led.setAttribute('fill', core); led.setAttribute('stroke', core);
    const blink = ((sec % 4.4) < .12 && (state === 'idle' || state === 'happy')) ? .15 : 1, op = (v) => Math.max(0, Math.min(1, v)).toFixed(2);
    [-1, 1].forEach((s, i) => {
      const e = eyes[i], x = 50 + s * 10.5, y = 46;
      e.pill.setAttribute('x', f(x - c.ew / 2)); e.pill.setAttribute('y', f(y - c.eh * blink / 2)); e.pill.setAttribute('width', f(c.ew)); e.pill.setAttribute('height', f(c.eh * blink)); e.pill.setAttribute('opacity', op(c.pill));
      e.arc.setAttribute('d', `M${f(x - 5)} ${f(y + 2.2)} Q${f(x)} ${f(y - 5.4)} ${f(x + 5)} ${f(y + 2.2)}`); e.arc.setAttribute('opacity', op(c.arc));
      e.round.setAttribute('cx', f(x)); e.round.setAttribute('cy', f(y)); e.round.setAttribute('r', f(c.er + flash)); e.round.setAttribute('opacity', op(c.round));
      e.ring.setAttribute('cx', f(x)); e.ring.setAttribute('cy', f(y)); e.ring.setAttribute('r', f(c.er)); e.ring.setAttribute('opacity', op(c.ring));
      e.ring.setAttribute('stroke-dasharray', state === 'loading' ? '15 10' : 'none'); e.ring.setAttribute('transform', state === 'loading' ? `rotate(${(sec * 360) % 360} ${f(x)} ${f(y)})` : '');
      e.line.setAttribute('x', f(x - 4.4)); e.line.setAttribute('y', f(y - 1.3)); e.line.setAttribute('width', 8.8); e.line.setAttribute('opacity', op(c.line));
      e.closed.setAttribute('d', `M${f(x - 4.6)} ${f(y - .6)} Q${f(x)} ${f(y + 3.8)} ${f(x + 4.6)} ${f(y - .6)}`); e.closed.setAttribute('opacity', op(c.closed));
      e.angry.setAttribute('d', s < 0 ? `M${f(x - 4.2)} ${f(y - 3.2)} L${f(x + 3.2)} ${f(y)} L${f(x - 4.2)} ${f(y + 3.2)}` : `M${f(x + 4.2)} ${f(y - 3.2)} L${f(x - 3.2)} ${f(y)} L${f(x + 4.2)} ${f(y + 3.2)}`);
      e.angry.setAttribute('opacity', op(c.angry));
      e.blush.forEach((b, k) => { const bx = x + s * 1.5 + (k ? 1.8 : -1.8), by = y + 7; b.setAttribute('d', `M${f(bx + .5)} ${f(by - 1.3)} L${f(bx - .5)} ${f(by + 1.3)}`); b.setAttribute('opacity', op(c.blush)); });
      for (const k of ['pill', 'round', 'line']) e[k].setAttribute('stroke', 'none');
    });
    // 嘴巴(填滿的笑 = 上緣平、下緣彎的半月形)
    const l = 50 - c.mw / 2, r = 50 + c.mw / 2, y = 56, k = Math.min(1, c.mo / 3), ins = L(c.mw / 3, 0, k);
    const cy1 = y + c.mc * 1.4 - c.mo * 1.33 * (c.mf > .5 ? 0 : 1), cy2 = y + c.mc * 1.4 + c.mo * 1.33;
    mouth.setAttribute('d', `M${f(l)} ${f(y)}C${f(l + ins)} ${f(cy1)} ${f(r - ins)} ${f(cy1)} ${f(r)} ${f(y)}C${f(r - ins)} ${f(cy2)} ${f(l + ins)} ${f(cy2)} ${f(l)} ${f(y)}Z`);
    mouth.setAttribute('fill', c.mf > .5 ? core : 'none'); mouth.setAttribute('stroke', core);
    // 頭上特效
    fx.setAttribute('fill', col); fx.setAttribute('stroke', col);
    stars.forEach((s2, i) => s2.setAttribute('opacity', state === 'happy' ? f(.5 + .5 * Math.sin(sec * 5 + i * 2)) : 0));
    bang.forEach((b) => b.setAttribute('opacity', state === 'surprise' ? .95 : 0));
    notes.forEach((n, i) => { const p = (sec * .7 + i * .5) % 1; n.setAttribute('transform', `translate(${f(i * 9 - 2 + Math.sin(p * 6) * 2)} ${f(10 - p * 22)}) scale(${f(.8 + i * .15)})`); n.setAttribute('opacity', state === 'playing' ? f(Math.sin(p * Math.PI)) : 0); });
    const zp = (sec * .5) % 1; zzz.setAttribute('opacity', state === 'sleep' ? f(1 - zp * .6) : 0); zzz2.setAttribute('opacity', state === 'sleep' ? f(.4 + zp * .6) : 0);
    zzz.setAttribute('transform', `translate(0 ${f(-zp * 4)})`); zzz.setAttribute('stroke', 'none'); zzz2.setAttribute('stroke', 'none');
    anger.setAttribute('opacity', state === 'error' ? f(.6 + .4 * Math.sin(sec * 12)) : 0); anger.setAttribute('fill', 'none');
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
