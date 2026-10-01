// Cat Street Stocks —— 股票大富翁(3D 初稿)
// 等軸測棋盤 + 立體格子 + 可擲的骰子 + 貓咪棋子;用「任務」決定過關,不用倒數計時。
// 公司都是虛構的,事件卡把總體經濟事件和各類股的連動寫成資料(EVENTS)。
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const $ = (id) => document.getElementById(id);
const fmt = (n) => Math.round(n).toLocaleString('en-US');
const APP_URL = 'https://apps.apple.com/app/id6763914049';

/* ───────────── 資料 ───────────── */
const SECTORS = {
  tech:  { name: 'Meow Tech', code: 'TECH',  color: 0x8b7cff, css: '#8b7cff', open: 120, div: 0.01, blurb: 'Fast growth, big swings.' },
  chip:  { name: 'Paw Chips', code: 'CHIP',  color: 0x35c2a1, css: '#25a888', open: 90,  div: 0.01, blurb: 'Booms and busts with supply.' },
  yield: { name: 'Nap Yield', code: 'YIELD', color: 0xf5b942, css: '#d99a12', open: 60,  div: 0.05, blurb: 'Slow mover. Pays 5% every lap.' },
  oil:   { name: 'Purr Oil',  code: 'OIL',   color: 0xf2796b, css: '#e2604f', open: 80,  div: 0.02, blurb: 'Moves with world events.' },
};
const KEYS = Object.keys(SECTORS);
// 16 格:四個角是特殊格
const TILES = ['start', 'tech', 'chip', 'chance', 'fee', 'yield', 'oil', 'tech', 'chance', 'chip', 'yield', 'chance', 'paw', 'oil', 'tech', 'chip'];
const TILE_COLOR = { start: 0xff8fc0, chance: 0xffd24a, fee: 0x9aa0ad, paw: 0x7cc6ff };
const EVENTS = [
  { t: 'Rate cut announced',     m: { tech: 1.20, chip: 1.10, yield: 0.97, oil: 1.00 }, w: 'Cheaper borrowing lifts growth stocks the most.' },
  { t: 'Chip shortage',          m: { tech: 0.95, chip: 1.25, yield: 1.00, oil: 1.00 }, w: 'Scarce supply lets chip makers raise prices.' },
  { t: 'Oil supply shock',       m: { tech: 0.93, chip: 0.95, yield: 1.00, oil: 1.25 }, w: 'Energy gains while higher costs hit everyone else.' },
  { t: 'Black swan',             m: { tech: 0.80, chip: 0.80, yield: 0.95, oil: 0.90 }, w: 'Panic selling hits the riskiest sectors hardest.' },
  { t: 'Strong earnings season', m: { tech: 1.12, chip: 1.12, yield: 1.04, oil: 1.04 }, w: 'Profits beat forecasts across the board.' },
  { t: 'Inflation surprise',     m: { tech: 0.90, chip: 0.92, yield: 1.03, oil: 1.10 }, w: 'Rate fears hurt growth; steady payers hold up.' },
];
const LOT = 10, START_CASH = 10000, SALARY = 500, FEE = 200, MAX_ROLLS = 15;

/* ───────────── 狀態 ───────────── */
let S;
const assets = () => S.cash + KEYS.reduce((a, k) => a + S.hold[k].n * S.price[k], 0);
const stockValue = () => KEYS.reduce((a, k) => a + S.hold[k].n * S.price[k], 0);
const MISSIONS = [
  { id: 'spread', title: 'Spread it out',    sub: 'Hold 3 different sectors at once',        ok: () => KEYS.filter((k) => S.hold[k].n > 0).length >= 3 },
  { id: 'paid',   title: 'Get paid to wait', sub: 'Collect $150+ in dividends on one payday', ok: () => S.lastDividend >= 150 },
  { id: 'dip',    title: 'Buy the dip',      sub: 'Buy a sector trading below its opening price', ok: () => S.flags.dip },
  { id: 'profit', title: 'Take profit',      sub: 'Sell a holding that is up 15% or more',   ok: () => S.flags.profit },
  { id: 'cash',   title: 'Keep dry powder',  sub: 'Own stock and keep $2,000+ cash for 3 turns', ok: () => S.cashStreak >= 3 },
  { id: 'grow',   title: 'Grow the pile',    sub: 'Reach $11,000 in total assets',           ok: () => assets() >= 11000 },
];
function newState() {
  const pool = MISSIONS.slice().sort(() => Math.random() - 0.5).slice(0, 3);
  S = {
    pos: 0, cash: START_CASH, rolls: 0, paws: 2, busy: false, over: false,
    price: Object.fromEntries(KEYS.map((k) => [k, SECTORS[k].open])),
    hold: Object.fromEntries(KEYS.map((k) => [k, { n: 0, cost: 0 }])),
    lastDividend: 0, cashStreak: 0, flags: { dip: false, profit: false },
    missions: pool.map((m) => ({ ...m, done: false })),
  };
}

/* ───────────── Three.js 場景 ───────────── */
const renderer = new THREE.WebGLRenderer({ canvas: $('gl'), antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xcfe9dc);

const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
cam.position.set(12, 11, 12);
cam.lookAt(0, 0.2, 0);
function resize() {
  const w = innerWidth, h = innerHeight, a = w / h;
  renderer.setSize(w, h, false);
  // 棋盤在等軸測下大約寬 9、高 6;兩個方向都要塞得下,下方再留一點給按鈕
  const half = Math.max(4.2, 5.0 / a);
  cam.left = -half * a; cam.right = half * a; cam.top = half * 0.92; cam.bottom = -half * 1.08;
  cam.updateProjectionMatrix();
}
addEventListener('resize', resize);

scene.add(new THREE.HemisphereLight(0xffffff, 0xbfd8c8, 1.15));
const sun = new THREE.DirectionalLight(0xfff2dd, 1.9);
sun.position.set(-6, 12, 5);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -9, right: 9, top: 9, bottom: -9, near: 1, far: 40 });
sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.03;
scene.add(sun);

const STEP = 1.14, TOP = 0.40;
const mat = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.85, metalness: 0, ...o });
function box(w, h, d, color, x, y, z, r = 0.06, parent = scene) {
  const m = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 3, Math.min(r, h / 2 - 0.001)), mat(color));
  m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m;
}
// 地面、人行道、草地
{
  const g = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), mat(0xbfe3c9)); g.rotation.x = -Math.PI / 2; g.receiveShadow = true; scene.add(g);
  box(5 * STEP + 0.7, 0.12, 5 * STEP + 0.7, 0xf4ead8, 0, 0.06, 0, 0.05);
  box(3 * STEP - 0.12, 0.16, 3 * STEP - 0.12, 0xa8d98f, 0, 0.10, 0, 0.05);
}
// 小鎮裝飾:樹和房子(純幾何)
function tree(x, z, s = 1) {
  const g = new THREE.Group(); g.position.set(x, 0, z); g.scale.setScalar(s); scene.add(g);
  const t = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 0.45, 8), mat(0x9a6b4a)); t.position.y = 0.22; t.castShadow = true; g.add(t);
  [[0.48, 0.62, 0.7], [0.38, 0.52, 1.05], [0.26, 0.42, 1.36]].forEach(([r, h, y], i) => {
    const c = new THREE.Mesh(new THREE.ConeGeometry(r, h, 8), mat(i % 2 ? 0x5fb87a : 0x4fa86c)); c.position.y = y; c.castShadow = true; g.add(c);
  });
}
function house(x, z, wall, roof, ry = 0) {
  const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry; scene.add(g);
  box(1.5, 0.95, 1.2, wall, 0, 0.48, 0, 0.05, g);
  const r = new THREE.Mesh(new THREE.ConeGeometry(1.18, 0.62, 4), mat(roof)); r.position.y = 1.26; r.rotation.y = Math.PI / 4; r.scale.set(1, 1, 0.82); r.castShadow = true; g.add(r);
  box(0.3, 0.46, 0.05, 0x9a6b4a, 0.3, 0.24, 0.61, 0.02, g);
  box(0.34, 0.3, 0.05, 0xbfe6ff, -0.35, 0.55, 0.61, 0.02, g);
}
[[-4.6, -4.4, 1.2], [-5.4, -1.6, 1], [-4.5, 1.6, 1.1], [-1.4, -5.2, 1], [1.8, -4.8, 1.2], [4.6, -5.3, 0.9], [-5.6, 4.4, 1.1], [5.5, -2.2, 1]].forEach((a) => tree(...a));
house(-4.9, -2.9, 0xfff1dc, 0x6fb7c9, 0.2); house(-2.9, -5.1, 0xffe6ee, 0xf2a35e, -0.15); house(3.3, -5.4, 0xeef4ff, 0xe2726b, 0.1); house(-5.6, 0.2, 0xfdf6e3, 0xd9b24a, 0.3);

/* ───────────── 棋盤 ───────────── */
// 5x5 外圈,從最靠近鏡頭的角開始逆時針走
const COORD = [];
for (let x = 4; x >= 0; x--) COORD.push([x, 4]);
for (let z = 3; z >= 0; z--) COORD.push([0, z]);
for (let x = 1; x <= 4; x++) COORD.push([x, 0]);
for (let z = 1; z <= 3; z++) COORD.push([4, z]);
const tilePos = (i) => new THREE.Vector3((COORD[i][0] - 2) * STEP, 0, (COORD[i][1] - 2) * STEP);

const tiles = [];
TILES.forEach((type, i) => {
  const p = tilePos(i), sec = SECTORS[type];
  const g = new THREE.Group(); g.position.copy(p); scene.add(g);
  const special = !sec;
  box(1.04, 0.30, 1.04, sec ? sec.color : TILE_COLOR[type], 0, 0.21, 0, 0.09, g);
  box(1.0, 0.10, 1.0, special ? TILE_COLOR[type] : 0xfff8ec, 0, TOP - 0.05, 0, 0.045, g);
  // 標籤:畫在 canvas 上貼在格子頂面,朝鏡頭方向轉 45° 讓字是正的
  const cv = document.createElement('canvas'); cv.width = cv.height = 256;
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const holder = new THREE.Group(); holder.rotation.y = Math.PI / 4; holder.position.y = TOP + 0.004; g.add(holder);
  const lab = new THREE.Mesh(new THREE.PlaneGeometry(0.98, 0.98), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
  lab.rotation.x = -Math.PI / 2; holder.add(lab);
  // 持股越多,格子後方的小樓越高
  let bld = null;
  if (sec) {
    bld = new THREE.Group(); bld.position.set(-0.30, TOP, -0.30); bld.visible = false; g.add(bld);
    box(0.30, 1, 0.30, sec.color, 0, 0.5, 0, 0.03, bld);
    box(0.36, 0.08, 0.36, 0xffffff, 0, 1.03, 0, 0.02, bld);
  }
  tiles.push({ type, g, cv, tex, bld, bldH: 0 });
});
function drawLabel(i) {
  const t = tiles[i], c = t.cv.getContext('2d'), sec = SECTORS[t.type];
  c.clearRect(0, 0, 256, 256); c.textAlign = 'center'; c.textBaseline = 'middle';
  const F = (px) => `900 ${px}px "Avenir Next","Helvetica Neue",Arial,sans-serif`;
  if (sec) {
    c.fillStyle = sec.css; c.font = F(46); c.fillText(sec.code, 128, 84);
    c.fillStyle = '#3b2f2a'; c.font = F(70); c.fillText('$' + Math.round(S.price[t.type]), 128, 152);
  } else if (t.type === 'chance') {
    c.fillStyle = '#b0780a'; c.font = F(170); c.fillText('?', 128, 138);
  } else {
    const [a, b] = { start: ['GO', '+$' + SALARY], fee: ['FEE', '-$' + FEE], paw: ['PAW', '+1'] }[t.type];
    c.fillStyle = '#fff'; c.font = F(72); c.fillText(a, 128, 104);
    c.font = F(40); c.fillText(b, 128, 166);
  }
  t.tex.needsUpdate = true;
}
const drawAll = () => tiles.forEach((_, i) => drawLabel(i));

/* ───────────── 棋子(貓) ───────────── */
const piece = new THREE.Group(); scene.add(piece);
const body = new THREE.Group(); piece.add(body);
{ // 佔位:模型還沒載到之前先放一隻幾何貓
  const ph = new THREE.Group(); ph.name = 'ph'; body.add(ph);
  const b = new THREE.Mesh(new THREE.SphereGeometry(0.26, 20, 16), mat(0xffb057)); b.position.y = 0.26; b.scale.y = 1.1; b.castShadow = true; ph.add(b);
  const h = new THREE.Mesh(new THREE.SphereGeometry(0.2, 20, 16), mat(0xffb057)); h.position.y = 0.66; h.castShadow = true; ph.add(h);
  [-0.11, 0.11].forEach((x) => { const e = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.14, 4), mat(0xffb057)); e.position.set(x, 0.86, 0); ph.add(e); });
}
{
  const draco = new DRACOLoader(); draco.setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.174.0/examples/jsm/libs/draco/');
  const loader = new GLTFLoader(); loader.setDRACOLoader(draco);
  loader.load('../cat.glb', (gltf) => {
    const m = gltf.scene;
    const bb = new THREE.Box3().setFromObject(m), size = bb.getSize(new THREE.Vector3()), ctr = bb.getCenter(new THREE.Vector3());
    const k = 0.95 / size.y;
    m.scale.setScalar(k); m.position.set(-ctr.x * k, -bb.min.y * k, -ctr.z * k);
    m.traverse((o) => { if (o.isMesh) { o.castShadow = true; if (o.material) { o.material.emissive = new THREE.Color(0xffb040); o.material.emissiveIntensity = 0.22; } } });
    body.remove(body.getObjectByName('ph')); body.add(m);
  }, undefined, (e) => console.warn('[board] cat.glb 載入失敗,用幾何貓代替', e));
}
body.rotation.y = Math.PI / 4;
function placePiece(i) { const p = tilePos(i); piece.position.set(p.x, TOP, p.z); }

/* ───────────── 骰子 ───────────── */
const DIE = 0.56;
function pipTex(n) {
  const cv = document.createElement('canvas'); cv.width = cv.height = 128; const c = cv.getContext('2d');
  c.fillStyle = '#fffdf8'; c.fillRect(0, 0, 128, 128);
  const P = { 1: [[64, 64]], 2: [[36, 36], [92, 92]], 3: [[34, 34], [64, 64], [94, 94]], 4: [[36, 36], [92, 36], [36, 92], [92, 92]],
    5: [[36, 36], [92, 36], [64, 64], [36, 92], [92, 92]], 6: [[36, 30], [92, 30], [36, 64], [92, 64], [36, 98], [92, 98]] }[n];
  c.fillStyle = n === 1 ? '#e2483d' : '#2b2420';
  P.forEach(([x, y]) => { c.beginPath(); c.arc(x, y, n === 1 ? 17 : 12, 0, Math.PI * 2); c.fill(); });
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
}
// BoxGeometry 的面順序是 +x,-x,+y,-y,+z,-z;對面加起來是 7
const FACE = [3, 4, 1, 6, 2, 5];
const die = new THREE.Mesh(new RoundedBoxGeometry(DIE, DIE, DIE, 4, 0.08), FACE.map((n) => new THREE.MeshStandardMaterial({ map: pipTex(n), roughness: 0.6 })));
die.castShadow = true; scene.add(die);
const DIE_REST = new THREE.Vector3(0.55, 0.18 + DIE / 2, 0.55);
die.position.copy(DIE_REST);
// 讓點數 n 朝上的姿態
const UPQ = {
  1: new THREE.Quaternion(),
  6: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI),
  3: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2),
  4: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -Math.PI / 2),
  2: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2),
  5: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2),
};

/* ───────────── 補間動畫(用自己的時鐘,面板隱藏時也能手動推進) ───────────── */
let T = 0; const tweens = [];
const tween = (dur, fn) => new Promise((res) => tweens.push({ t0: T, dur, fn, res }));
const wait = (dur) => tween(dur, () => {});
const ease = (k) => 1 - Math.pow(1 - k, 3);
function step(dt) {
  T += dt;
  for (let i = tweens.length - 1; i >= 0; i--) {
    const a = tweens[i], k = Math.min(1, (T - a.t0) / a.dur);
    a.fn(k);
    if (k >= 1) { tweens.splice(i, 1); a.res(); }
  }
  // 待機:貓輕輕呼吸;小樓平滑長高
  if (!S.busy) body.scale.y = 1 + Math.sin(T * 3) * 0.02;
  tiles.forEach((t) => {
    if (!t.bld) return;
    const target = Math.min(3, S.hold[t.type].n / LOT) * 0.24;
    t.bldH += (target - t.bldH) * Math.min(1, dt * 8);
    t.bld.visible = t.bldH > 0.01; t.bld.scale.y = Math.max(0.001, t.bldH);
  });
  renderer.render(scene, cam);
}
let last = performance.now();
function loop(now) { const dt = Math.min(0.05, (now - last) / 1000); last = now; step(dt); requestAnimationFrame(loop); }
window.__tick = (ms = 16) => { for (let t = 0; t < ms; t += 16) step(0.016); };

async function rollDie(n) {
  const yaw = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.random() * Math.PI * 2);
  const final = yaw.multiply(UPQ[n]);
  const axis = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.4, Math.random() - 0.5).normalize();
  const from = new THREE.Vector3(-1.1, 2.6, -1.1), spin = new THREE.Quaternion();
  await tween(0.95, (k) => {
    const e = ease(k);
    die.position.lerpVectors(from, DIE_REST, e);
    // 落地彈兩下
    die.position.y = DIE_REST.y + Math.abs(Math.cos(k * Math.PI * 2.5)) * (1 - k) * 2.3;
    spin.setFromAxisAngle(axis, (1 - k) * (1 - k) * Math.PI * 7);
    die.quaternion.copy(final).multiply(spin);
  });
  await wait(0.25);
}
async function hopTo(i) {
  const a = piece.position.clone(), p = tilePos(i), b = new THREE.Vector3(p.x, TOP, p.z);
  await tween(0.22, (k) => {
    piece.position.lerpVectors(a, b, k);
    piece.position.y = TOP + Math.sin(k * Math.PI) * 0.5;
    body.scale.y = 1 + Math.sin(k * Math.PI) * 0.18;
  });
  // 落地把格子壓一下
  const g = tiles[i].g;
  tween(0.18, (k) => { g.position.y = -Math.sin(k * Math.PI) * 0.06; });
  body.scale.y = 1;
}

/* ───────────── 介面 ───────────── */
function hud() {
  $('cash').textContent = fmt(S.cash);
  $('assets').textContent = fmt(assets());
  $('stocks').textContent = fmt(stockValue());
  $('paws').textContent = S.paws;
  $('mcount').textContent = S.missions.filter((m) => m.done).length + '/3';
  $('rollsLeft').textContent = (MAX_ROLLS - S.rolls) + ' left';
  $('pawBtn').disabled = S.paws <= 0;
  $('miss').innerHTML = S.missions.map((m) =>
    `<div class="m ${m.done ? 'done' : ''}"><span class="ck">${m.done ? '✓' : ''}</span><span>${m.title}<small>${m.sub}</small></span></div>`).join('');
}
let toastTimer;
function toast(msg) { const t = $('toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('on'), 1900); }
function showCtl(on) { $('ctl').classList.toggle('hide', !on); $('stepCtl').classList.add('hide'); }
function panel(html) { const p = $('panel'); p.innerHTML = html; p.classList.remove('hide'); return p; }
const closePanel = () => $('panel').classList.add('hide');

function buyPanel(k) {
  return new Promise((res) => {
    const sec = SECTORS[k], h = S.hold[k], price = S.price[k];
    const gain = h.n ? (price * h.n - h.cost) / h.cost * 100 : 0;
    const vs = (price / sec.open - 1) * 100;
    const p = panel(`
      <h3><span class="tag" style="background:${sec.css}">${sec.code}</span>${sec.name}</h3>
      <p>${sec.blurb}</p>
      <div class="kv">
        <div>Price<b>$${Math.round(price)}</b></div>
        <div>Since open<b style="color:${vs >= 0 ? '#1c8a4a' : '#c4472f'}">${vs >= 0 ? '+' : ''}${vs.toFixed(0)}%</b></div>
        <div>You hold<b>${h.n}${h.n ? ` <span style="font-size:11px;color:${gain >= 0 ? '#1c8a4a' : '#c4472f'}">${gain >= 0 ? '+' : ''}${gain.toFixed(0)}%</span>` : ''}</b></div>
      </div>
      <div class="btns">
        <button class="b-buy" data-a="buy1" ${S.cash < price * LOT ? 'disabled' : ''}>Buy 10<br><span style="font-size:11px">$${fmt(price * LOT)}</span></button>
        <button class="b-buy" data-a="buy3" ${S.cash < price * LOT * 3 ? 'disabled' : ''}>Buy 30<br><span style="font-size:11px">$${fmt(price * LOT * 3)}</span></button>
        <button class="b-sell" data-a="sell" ${h.n ? '' : 'disabled'}>Sell all</button>
        <button class="b-skip" data-a="skip">Skip</button>
      </div>`);
    p.querySelectorAll('button').forEach((b) => b.onclick = () => {
      const a = b.dataset.a;
      if (a === 'buy1' || a === 'buy3') {
        const n = LOT * (a === 'buy1' ? 1 : 3), cost = price * n;
        S.cash -= cost; h.n += n; h.cost += cost;
        if (price < sec.open * 0.97) S.flags.dip = true;
        toast(`Bought ${n} ${sec.name}`);
      } else if (a === 'sell') {
        const value = price * h.n;
        if ((value - h.cost) / h.cost >= 0.15) S.flags.profit = true;
        toast(`Sold for $${fmt(value)} (${value >= h.cost ? '+' : '-'}$${fmt(Math.abs(value - h.cost))})`);
        S.cash += value; h.n = 0; h.cost = 0;
      }
      closePanel(); res();
    });
  });
}
function cardPanel(title, text, moves = '') {
  return new Promise((res) => {
    const p = panel(`<h3>${title}</h3><p>${text}</p>${moves ? `<div class="moves">${moves}</div>` : ''}<div class="btns"><button class="b-ok">Continue</button></div>`);
    p.querySelector('button').onclick = () => { closePanel(); res(); };
  });
}

/* ───────────── 回合流程(狀態機:idle → rolling → moving → landing → idle / over) ───────────── */
function payday() {
  const div = KEYS.reduce((a, k) => a + S.hold[k].n * S.price[k] * SECTORS[k].div, 0);
  S.lastDividend = div; S.cash += SALARY + div;
  toast(`Payday +$${fmt(SALARY)}${div > 0 ? ` · dividends +$${fmt(div)}` : ''}`);
  hud(); checkMissions();
}
function checkMissions() {
  S.missions.forEach((m) => { if (!m.done && m.ok()) { m.done = true; toast(`Mission complete: ${m.title}`); } });
  hud();
}
async function turn(forced) {
  if (S.busy || S.over) return;
  S.busy = true; showCtl(false);
  const n = forced ?? 1 + Math.floor(Math.random() * 6);
  if (!forced) await rollDie(n);
  for (let i = 0; i < n; i++) {
    S.pos = (S.pos + 1) % TILES.length;
    await hopTo(S.pos);
    if (S.pos === 0) payday();
  }
  S.rolls++;
  // 每回合小幅隨機波動
  KEYS.forEach((k) => { S.price[k] = Math.max(15, S.price[k] * (0.97 + Math.random() * 0.06)); });
  drawAll(); hud();
  await wait(0.15);

  const type = TILES[S.pos];
  if (SECTORS[type]) await buyPanel(type);
  else if (type === 'chance') {
    const e = EVENTS[Math.floor(Math.random() * EVENTS.length)];
    KEYS.forEach((k) => { S.price[k] *= e.m[k]; });
    drawAll(); hud();
    const moves = KEYS.map((k) => { const d = Math.round((e.m[k] - 1) * 100); return d ? `<span class="mv ${d > 0 ? 'up' : 'dn'}">${SECTORS[k].name} ${d > 0 ? '+' : ''}${d}%</span>` : ''; }).join('');
    await cardPanel(e.t, e.w, moves);
  } else if (type === 'fee') { S.cash -= FEE; hud(); await cardPanel('Trading fees', `Every trade has a cost. You paid $${FEE}.`); }
  else if (type === 'paw') { S.paws++; hud(); await cardPanel('Lucky paw', 'You found a paw. Use it to pick how far you walk instead of rolling.'); }
  else await cardPanel('Payday', `Salary $${fmt(SALARY)}${S.lastDividend > 0 ? ` plus $${fmt(S.lastDividend)} in dividends` : ''}. Holding stocks pays you every lap.`);

  S.cashStreak = (stockValue() > 0 && S.cash >= 2000) ? S.cashStreak + 1 : 0;
  checkMissions();
  const done = S.missions.filter((m) => m.done).length;
  if (done === 3 || S.rolls >= MAX_ROLLS) { await wait(0.4); return finish(done); }
  S.busy = false; showCtl(true);
}
function finish(done) {
  S.over = true;
  let top = 'cash', tv = S.cash;
  KEYS.forEach((k) => { const v = S.hold[k].n * S.price[k]; if (v > tv) { tv = v; top = k; } });
  const style = { cash: 'Careful saver. Lots of cash, little growth.', tech: 'Growth believer. Big swings, big upside.', chip: 'Cycle rider. You chase supply and demand.',
    yield: 'Income collector. Steady pay every lap.', oil: 'Macro trader. You bet on world events.' }[top];
  const title = ['Rough market', 'Curious kitten', 'Sharp analyst', 'Top cat investor'][done];
  const a = assets();
  $('end').innerHTML = `<div class="card">
    <div class="stars">${[0, 1, 2].map((i) => i < done ? '<b>★</b>' : '★').join('')}</div>
    <h2>${title}</h2>
    <p>Total assets <b>$${fmt(a)}</b> (${a >= START_CASH ? '+' : ''}${((a / START_CASH - 1) * 100).toFixed(0)}%) in ${S.rolls} rolls</p>
    <p>${style}</p>
    <p style="font-size:12.5px">Want real charts, rankings, and an AI you can talk to? CatInsight Stock has them.</p>
    <div class="btns"><button class="b-skip" id="again">Play again</button><button class="b-ok" id="app">Get the app</button></div></div>`;
  $('end').classList.remove('hide');
  $('again').onclick = start;
  $('app').onclick = () => window.open(APP_URL, '_blank', 'noopener');
}
function start() {
  newState(); $('end').classList.add('hide'); closePanel();
  placePiece(0); drawAll(); hud(); showCtl(true);
}

$('rollBtn').onclick = () => turn();
$('pawBtn').onclick = () => {
  if (S.busy || S.paws <= 0) return;
  $('ctl').classList.add('hide');
  $('steps').innerHTML = [1, 2, 3, 4, 5, 6].map((n) => `<button data-n="${n}">${n}</button>`).join('') + '<button data-n="0" style="background:#a99b90;box-shadow:0 4px 0 #857a70">×</button>';
  $('stepCtl').classList.remove('hide');
  $('steps').querySelectorAll('button').forEach((b) => b.onclick = () => {
    const n = +b.dataset.n; $('stepCtl').classList.add('hide');
    if (!n) return showCtl(true);
    S.paws--; hud(); turn(n);
  });
};

resize(); start();
requestAnimationFrame(loop);
window.__game = { get S() { return S; }, turn, tiles, die, piece };
