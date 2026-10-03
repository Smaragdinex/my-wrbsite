// 貓咪股市大富翁 · 手機遙控頁
// 連到主機開的房間(Cloudflare Durable Object 轉送)。主機把擲骰、買賣、翻牌這些面板的 HTML 鏡射過來,
// 這裡只負責顯示、把按了哪個按鈕 / 拉桿拉到多少回傳。遊戲規則全部在主機跑。
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
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
    if (m.started) { ST.started = true; showGame(); }
    return;
  }
  if (m.t === 'start') { ST.started = true; showGame(); return; }
  if (m.t === 'host') { ST.hostOn = !!m.on; setStatus(); return; }
  if (m.t === 'reset') {        // 主機按了再玩一次:回到大廳,等下一局
    ST.started = false; ST.mine = false; if (pc) { try { pc.close(); } catch (e) {} pc = null; } $('jvidwrap').classList.add('hide'); ['ctl', 'stepCtl', 'panel', 'draw', 'end'].forEach((id) => { $(id).className = $(id).className.replace(/\bhide\b/, '') + ' hide'; $(id).innerHTML = ''; });
    $('jform').classList.remove('hide'); $('jhead').classList.add('hide'); $('jrows').classList.add('hide'); $('jstatus').classList.add('hide'); paintChars(); return; }
  if (!ST.started) return;
  if (m.t === 'rtc') { rtcOnMsg(m); return; }
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
// 收主機的棋盤直播
let pc = null;
async function rtcOnMsg(m) {
  try {
    if (m.sdp && m.sdp.type === 'offer') {
      if (pc) { try { pc.close(); } catch (e) {} }
      pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
      pc.onicecandidate = (e) => { if (e.candidate) send({ t: 'rtc', ice: e.candidate }); };
      pc.ontrack = (e) => { const v = $('jvid'); v.srcObject = e.streams[0]; $('jvidwrap').classList.remove('hide'); v.play().catch(() => {}); };
      await pc.setRemoteDescription(m.sdp); const a = await pc.createAnswer(); await pc.setLocalDescription(a); send({ t: 'rtc', sdp: pc.localDescription });
    } else if (m.ice && pc) await pc.addIceCandidate(m.ice);
  } catch (e) { console.warn('[rtc]', e); }
}
function showGame() {
  $('jform').classList.add('hide'); $('jhead').classList.remove('hide'); $('jrows').classList.remove('hide'); $('jstatus').classList.remove('hide'); setStatus();
  try { navigator.wakeLock?.request('screen'); } catch (e) {}
}

// ---- 大廳:3D 角色轉盤(和主機同一套模型,左右切換;被主機 / 別人選走的會跳過)----
const stage = (() => {
  const cv = $('jgl'), renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.shadowMap.enabled = true;
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0xc9e8b8);
  scene.add(new THREE.HemisphereLight(0xffffff, 0xffe9c9, 1.15));
  const sun = new THREE.DirectionalLight(0xfff2dd, 1.7); sun.position.set(-4, 9, 6); sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -6, right: 6, top: 6, bottom: -6, near: 1, far: 30 }); scene.add(sun);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshToonMaterial({ color: 0xc9e8b8 })); ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
  const ramp = new THREE.DataTexture(new Uint8Array([150, 150, 150, 255, 215, 215, 215, 255, 255, 255, 255, 255]), 3, 1, THREE.RGBAFormat); ramp.minFilter = ramp.magFilter = THREE.NearestFilter; ramp.needsUpdate = true;
  const mat = (c) => new THREE.MeshToonMaterial({ color: c, gradientMap: ramp });
  // 幾朵花
  for (let i = 0; i < 40; i++) { const a = Math.random() * Math.PI * 2, d = 2.4 + Math.random() * 3; const f = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 5), mat([0xffffff, 0xffd24a, 0xff9ec4][i % 3])); f.position.set(Math.cos(a) * d, 0.05, Math.sin(a) * d); scene.add(f); }
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100); const CAM_OFF = new THREE.Vector3(12, 11, 12), target = new THREE.Vector3(0.9, 0.5, 0.9);
  cam.position.copy(target).add(CAM_OFF); cam.lookAt(target);
  const loader = (() => { const d = new DRACOLoader(); d.setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.174.0/examples/jsm/libs/draco/'); const l = new GLTFLoader(); l.setDRACOLoader(d); return l; })();
  const cache = {};
  const loadModel = (url, h) => (cache[url] ||= new Promise((res, rej) => loader.load(url, (g) => { const m = g.scene; const bb = new THREE.Box3().setFromObject(m), size = bb.getSize(new THREE.Vector3()), c = bb.getCenter(new THREE.Vector3()); const k = h / size.y;
    m.scale.setScalar(k); m.position.set(-c.x * k, -bb.min.y * k, -c.z * k); m.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.material = new THREE.MeshToonMaterial({ map: o.material.map || null, gradientMap: ramp, side: o.material.side }); } });
    const w = new THREE.Group(); w.add(m); res(w); }, undefined, rej)));
  let slots = [], sel = 0, cur = 0, R = Math.SQRT1_2, FRONT = Math.PI / 4, last = performance.now();
  function build(chars) {          // 依大廳給的角色清單建底座(只建一次)
    if (slots.length) { slots.forEach((sl, i) => { sl.taken = !!chars[i].taken && chars[i].taken !== gid; }); return; }
    slots = chars.map((c) => { const g = new THREE.Group(); scene.add(g);
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.68, 0.14, 40), mat(0xfff8ec)); base.position.y = 0.07; base.receiveShadow = true; base.castShadow = true; g.add(base);
      const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.76, 0.06, 40), mat(0xff7a59)); ring.position.y = 0.03; g.add(ring);
      const holder = new THREE.Group(); holder.position.y = 0.14; holder.rotation.y = FRONT; g.add(holder);
      const ph = new THREE.Mesh(new THREE.SphereGeometry(0.3, 16, 12), mat(c.color || 0xffb057)); ph.position.y = 0.4; holder.add(ph);
      loadModel(new URL(c.url, location.href.replace(/join\/.*$/, '')).href, c.h).then((tpl) => { holder.remove(ph); holder.add(tpl.clone(true)); }).catch(() => {});
      return { key: c.k, g, holder, ring, spin: 0, hop: 0, taken: !!c.taken && c.taken !== gid }; });
  }
  function select(i, dir = 1) { const n = slots.length; if (!n) return null; i = (i % n + n) % n; for (let c = 0; c < n && slots[i].taken; c++) i = (i + dir + n) % n; sel = i; slots[i].hop = 1; return slots[i].key; }
  function resize() { const w = cv.clientWidth, h = cv.clientHeight; if (!w || !h) return; renderer.setSize(w, h, false); const a = w / h, half = Math.max(2.1, 2.7 / a); cam.left = -half * a; cam.right = half * a; cam.top = half; cam.bottom = -half; cam.updateProjectionMatrix(); }
  function frame() {
    const now = performance.now(), dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (slots.length) {
      const order = slots.map((_, i) => i).filter((i) => !slots[i].taken), n = order.length || 1;
      const wrap = (v) => ((v % n) + n + n / 2) % n - n / 2;
      cur += wrap(order.indexOf(sel) - cur) * Math.min(1, dt * 7);
      slots.forEach((sl, i) => {
        if (sl.taken) { sl.g.visible = false; return; }
        const on = i === sel, rel = wrap(order.indexOf(i) - cur), a = Math.abs(rel);
        const o = rel * 1.95, back = Math.min(a, 2) * 0.75, k = Math.max(0, 1 - Math.max(0, a - 1) * 1.7), fwd = 1.2 - back;
        sl.g.position.set(o * R + fwd * R, 0, -o * R + fwd * R); sl.g.visible = k > 0.02; sl.g.scale.setScalar(Math.max(0.001, k));
        sl.hop = Math.max(0, sl.hop - dt * 2.2);
        const sT = Math.max(0.78, 1.3 - a * 0.52); sl.holder.scale.setScalar(sl.holder.scale.x + (sT - sl.holder.scale.x) * Math.min(1, dt * 10));
        sl.holder.position.y = 0.14 + Math.sin((1 - sl.hop) * Math.PI) * (sl.hop > 0 ? 0.35 : 0);
        if (on) sl.spin += dt * 1.1; else { const d = Math.atan2(Math.sin(-sl.spin), Math.cos(-sl.spin)); sl.spin += d * Math.min(1, dt * 6); }
        sl.holder.rotation.y = FRONT + sl.spin; sl.ring.visible = on;
      });
    }
    renderer.render(scene, cam); requestAnimationFrame(frame);
  }
  addEventListener('resize', resize); resize(); requestAnimationFrame(frame);
  return { build, select, get sel() { return sel; }, get slots() { return slots; } };
})();
function paintChars() {
  if (!ST.chars.length) return;
  stage.build(ST.chars); $('jhint').classList.add('hide');
  const idx = ST.chars.findIndex((c) => c.k === ST.char);
  const k = stage.select(idx >= 0 ? idx : 0);            // 自己選的被別人搶走就自動跳到下一個
  if (k && k !== ST.char) { ST.char = k; if (ST.joined) send({ t: 'join', gid, name: ST.name, char: ST.char }); }
  const c = ST.chars.find((x) => x.k === ST.char); $('jcharName').textContent = c ? c.name : '—';
  $('jgo').textContent = ST.joined ? `✓ 已加入(${c ? c.name : ''}),等主機開始` : (c ? `用${c.name}加入` : '加入');
}
const step = (d) => { if (!ST.chars.length) return; const k = stage.select(stage.sel + d, d); if (k) { ST.char = k; paintChars(); if (ST.joined) send({ t: 'join', gid, name: ST.name, char: ST.char }); } };
$('jprev').onclick = () => step(-1); $('jnext').onclick = () => step(1);
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
