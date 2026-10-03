// 貓咪股市大富翁 · 手機遙控頁
// 連到主機開的房間(Cloudflare Durable Object 轉送)。主機把擲骰、買賣、翻牌這些面板的 HTML 鏡射過來,
// 這裡只負責顯示、把按了哪個按鈕 / 拉桿拉到多少回傳。遊戲規則全部在主機跑。
const $ = (id) => document.getElementById(id);
const API = 'wss://xarts.games/api/board';
const q = new URLSearchParams(location.search);
const gid = sessionStorage.gid || (sessionStorage.gid = 'p' + Math.random().toString(36).slice(2, 10));   // 同一支手機重整頁面還能認回座位
const ST = { ws: null, code: (q.get('r') || '').toUpperCase().slice(0, 4), name: localStorage.getItem('css.jname') || '', char: null, chars: [], joined: false, started: false, mine: false, retry: 0, hostOn: true };
let toastTimer = 0;
function toast(msg) { const t = $('toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('on'), 2200); }
const send = (m) => { if (ST.ws && ST.ws.readyState === 1) ST.ws.send(JSON.stringify(m)); };

// ---- 連線 ----
function connect() {
  if (!ST.code) return;
  const ws = new WebSocket(`${API}/room/${ST.code}/ws?role=guest`); ST.ws = ws;
  ws.onopen = () => { if (ST.joined || ST.started) send({ t: 'join', gid, name: ST.name, char: ST.char }); setStatus(); };
  ws.onmessage = (e) => { let m; try { m = JSON.parse(e.data); } catch (x) { return; } if (window.__j && window.__j.log.length < 300) window.__j.log.push(m.t + ':' + (m.box || '')); onMsg(m); };
  ws.onclose = (e) => { if (ST.ws !== ws) return; ST.ws = null; setStatus(); if (e.code === 1006 || e.reason !== 'expired') ST.retry = setTimeout(connect, 2000); else $('jmsg').textContent = '房間已過期'; };
  ws.onerror = () => {};
}
function onMsg(m) {
  if (m.t === 'lobby') { ST.chars = m.chars; paintChars(); if (!ST.joined) $('jmsg').textContent = ''; return; }
  if (m.t === 'joined') {
    if (!m.ok) { $('jmsg').textContent = m.reason === 'full' ? '房間已滿(最多 3 支手機)' : m.reason === 'started' ? '這一局已經開始,等下一局再加入' : '加入失敗'; ST.joined = false; return; }
    ST.joined = true; ST.char = m.char; ST.name = m.name; paintChars();
    if (m.started) { ST.started = true; showGame(); } else { $('jgo').textContent = '✓ 已加入,等主機開始(可以換角色)'; }
    return;
  }
  if (m.t === 'start') { ST.started = true; showGame(); return; }
  if (m.t === 'host') { ST.hostOn = !!m.on; setStatus(); return; }
  if (m.t === 'reset') {        // 主機按了再玩一次:回到大廳,等下一局
    ST.started = false; ST.mine = false; ['ctl', 'stepCtl', 'panel', 'draw', 'end'].forEach((id) => { $(id).className = $(id).className.replace(/\bhide\b/, '') + ' hide'; $(id).innerHTML = ''; });
    $('jform').classList.remove('hide'); $('jhead').classList.add('hide'); $('jrows').classList.add('hide'); $('jstatus').classList.add('hide'); $('jgo').textContent = '✓ 已加入,等主機開始(可以換角色)'; return; }
  if (!ST.started) return;
  if (m.t === 'toast') { toast(m.msg); return; }
  if (m.t === 'me') { $('jico').textContent = m.icon; $('jnm').textContent = m.name; $('jcash').textContent = '$' + m.cash; $('jassets2').textContent = '總資產 $' + m.assets; $('jrows').innerHTML = m.rows;
    ST.mine = !!m.mine; ST.over = !!m.over; $('jst').textContent = m.over ? '遊戲結束' : m.mine ? '輪到你了!' : `現在是 ${m.turn} 的回合 · ${m.round}`; $('jst').classList.toggle('mine', ST.mine); applyMine(); return; }
  if (m.t === 'ui') { const el = $(m.box); if (!el) return; el.className = m.cls; morph(el, m.html); applyMine(); }
}
function setStatus() {
  const s = $('jstatus'); if (!ST.started) return;
  const on = ST.ws && ST.ws.readyState === 1;
  s.classList.toggle('hide', on && ST.hostOn); s.classList.toggle('off', !on || !ST.hostOn);
  s.textContent = !on ? '連線中斷,重新連線中…' : !ST.hostOn ? '主機離線了,等它回來…' : '';
}
// 只有輪到自己時才能操作擲骰 / 面板;翻牌和結算畫面大家都看得到但不能按
function applyMine() {
  ['ctl', 'stepCtl', 'panel'].forEach((id) => { $(id).style.visibility = ST.mine ? '' : 'hidden'; });
  ['draw', 'end'].forEach((id) => { $(id).style.pointerEvents = ST.mine && id !== 'end' ? '' : 'none'; });
}
function showGame() {
  $('jform').classList.add('hide'); $('jhead').classList.remove('hide'); $('jrows').classList.remove('hide'); $('jstatus').classList.remove('hide'); setStatus();
  try { navigator.wakeLock?.request('screen'); } catch (e) {}
}

// ---- 大廳:選角色 ----
function paintChars() {
  const box = $('jchars');
  if (!ST.chars.length) return;
  box.innerHTML = ST.chars.map((c) => { const taken = c.taken && c.taken !== gid; return `<button data-k="${c.k}" class="${ST.char === c.k ? 'on' : ''}" ${taken ? 'disabled' : ''}><span class="big">${c.icon}</span>${c.name}${taken ? `<small>${c.taken === 'host' ? '主機' : '已選'}</small>` : ''}</button>`; }).join('');
  box.querySelectorAll('button').forEach((b) => { b.onclick = () => { ST.char = b.dataset.k; paintChars(); if (ST.joined) send({ t: 'join', gid, name: ST.name, char: ST.char }); }; });
}
$('jcode').value = ST.code; $('jname').value = ST.name;
$('jcode').oninput = () => { ST.code = $('jcode').value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4); $('jcode').value = ST.code; if (ST.code.length === 4 && !ST.ws) connect(); };
$('jgo').onclick = () => {
  ST.name = $('jname').value.trim().slice(0, 12) || '玩家'; localStorage.setItem('css.jname', ST.name);
  if (ST.code.length !== 4) { $('jmsg').textContent = '請輸入 4 碼房號'; return; }
  if (!ST.ws) connect();
  const go = () => send({ t: 'join', gid, name: ST.name, char: ST.char });
  if (ST.ws && ST.ws.readyState === 1) go(); else { const ws = ST.ws; ws.addEventListener('open', go, { once: true }); }
  $('jmsg').textContent = '';
};
if (ST.code.length === 4) connect();

// ---- 鏡射區塊的操作:按鈕 → 第幾顆;拉桿 → 第幾條、數值 ----
['ctl', 'stepCtl', 'panel', 'draw', 'end'].forEach((id) => {
  const el = $(id);
  el.addEventListener('click', (e) => {
    const b = e.target.closest('button, .dcard'); if (!b || !el.contains(b) || b.disabled) return;
    e.preventDefault(); send({ t: 'click', box: id, idx: [...el.querySelectorAll('button, .dcard')].indexOf(b) });
  });
  let last = 0;
  el.addEventListener('input', (e) => { const inp = e.target; if (inp.tagName !== 'INPUT') return; const now = Date.now(); const fire = () => send({ t: 'input', box: id, idx: [...el.querySelectorAll('input')].indexOf(inp), value: inp.value });
    if (now - last > 60) { last = now; fire(); } else { clearTimeout(inp._t); inp._t = setTimeout(fire, 70); } });
});
// 拉桿拖到一半時主機會一直送新的 HTML 回來:拖的時候先不更新那條拉桿的值,放手再套用最後一次
let dragging = null;
document.addEventListener('pointerdown', (e) => { if (e.target.tagName === 'INPUT') dragging = e.target; });
document.addEventListener('pointerup', () => { dragging = null; });
document.addEventListener('pointercancel', () => { dragging = null; });
// 最小的 DOM 合併:同位置同標籤就更新屬性和文字,不一樣才整個換掉。這樣翻牌的動畫和拉桿狀態不會被重畫打斷
function morph(from, html) {
  const tpl = document.createElement('template'); tpl.innerHTML = html; morphChildren(from, tpl.content);
}
function morphChildren(a, b) {
  const an = [...a.childNodes], bn = [...b.childNodes];
  for (let i = 0; i < bn.length; i++) {
    const x = an[i], y = bn[i];
    if (!x) { a.appendChild(y.cloneNode(true)); continue; }
    if (x.nodeType !== y.nodeType || (x.nodeType === 1 && x.tagName !== y.tagName)) { a.replaceChild(y.cloneNode(true), x); continue; }
    if (x.nodeType === 3) { if (x.data !== y.data) x.data = y.data; continue; }
    if (x.nodeType !== 1) continue;
    for (const at of [...x.attributes]) if (!y.hasAttribute(at.name)) x.removeAttribute(at.name);
    for (const at of y.attributes) { if (x.getAttribute(at.name) !== at.value) { if (at.name === 'value' && x === dragging) continue; x.setAttribute(at.name, at.value); } }
    if (x.tagName === 'INPUT' && x !== dragging && y.hasAttribute('value') && x.value !== y.getAttribute('value')) x.value = y.getAttribute('value');
    morphChildren(x, y);
  }
  for (let i = an.length - 1; i >= bn.length; i--) a.removeChild(an[i]);
}
window.__j = { ST, send, log: [] };
