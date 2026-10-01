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

/* ───────────── 語言 ───────────── */
// 預設跟瀏覽器語言;網址加 ?lang=en / ?lang=zh 可強制
const ZH = (new URLSearchParams(location.search).get('lang') || navigator.language || 'en').toLowerCase().startsWith('zh');
const L = (en, zh) => (ZH ? zh : en);

/* ───────────── 資料 ───────────── */
const SECTORS = {
  tech:   { name: L('Meow Tech', '喵科技'),       code: L('TECH', '科技股'),   color: 0x8b7cff, css: '#7d6cf0', open: 120, div: 0.01, blurb: L('Fast growth, big swings.', '成長快,波動也大。') },
  chip:   { name: L('Paw Chips', '貓掌半導體'),   code: L('CHIPS', '半導體'),  color: 0x4f8ef0, css: '#3f7de0', open: 90,  div: 0.01, blurb: L('Booms and busts with supply.', '跟著供需循環大起大落。') },
  yield:  { name: L('Nap Yield', '午睡高股息'),   code: L('YIELD', '高股息'),  color: 0xf5b942, css: '#d99a12', open: 60,  div: 0.05, blurb: L('Slow mover. Pays 5% every lap.', '漲得慢,但每圈配息 5%。') },
  oil:    { name: L('Purr Energy', '呼嚕能源'),   code: L('ENERGY', '能源股'), color: 0xf2796b, css: '#e2604f', open: 80,  div: 0.02, blurb: L('Moves with world events.', '跟著國際事件走。') },
  health: { name: L('Whisker Health', '鬍鬚醫療'), code: L('HEALTH', '醫療股'), color: 0x54c98a, css: '#35ad6d', open: 70,  div: 0.02, blurb: L('Steady when markets panic.', '市場恐慌時相對抗跌。') },
  reit:   { name: L('Cat Tower REIT', '貓跳台不動產'), code: L('REIT', '不動產'), color: 0xc48ad6, css: '#ad6cc4', open: 100, div: 0.04, blurb: L('Pays 4% a lap. Hates rate hikes.', '每圈配息 4%,最怕升息。') },
};
const KEYS = Object.keys(SECTORS);
// 16 格:四個角是特殊格
const TILES = ['start', 'yield', 'chip', 'chance', 'fee', 'tech', 'health', 'oil', 'chance', 'reit', 'yield', 'chance', 'paw', 'chip', 'tech', 'oil'];
const TILE_COLOR = { start: 0xff8fc0, chance: 0xffd24a, fee: 0x9aa0ad, paw: 0x7cc6ff };
const EVENTS = [
  { t: L('Rate cut announced', '央行宣布降息'),        m: { tech: 1.20, chip: 1.10, yield: 0.97, oil: 1.00, health: 1.00, reit: 1.12 }, w: L('Cheaper borrowing lifts growth stocks and property.', '借錢變便宜,成長股和不動產最受惠。') },
  { t: L('AI server demand booms', 'AI 伺服器需求爆發'), m: { tech: 1.10, chip: 1.25, yield: 1.00, oil: 0.95, health: 1.00, reit: 1.00 }, w: L('Scarce chips let makers raise prices.', '晶片供不應求,廠商有漲價空間。') },
  { t: L('Oil supply shock', '原油供給吃緊'),          m: { tech: 0.93, chip: 0.95, yield: 1.00, oil: 1.25, health: 1.00, reit: 0.97 }, w: L('Energy gains while higher costs hit everyone else.', '能源股受惠,其他產業成本上升。') },
  { t: L('Black swan', '黑天鵝事件'),                 m: { tech: 0.80, chip: 0.80, yield: 0.95, oil: 0.90, health: 0.98, reit: 0.90 }, w: L('Panic selling hits the riskiest sectors hardest.', '恐慌賣壓下,風險高的類股跌最多。') },
  { t: L('Strong earnings season', '財報季優於預期'),   m: { tech: 1.12, chip: 1.12, yield: 1.04, oil: 1.04, health: 1.06, reit: 1.03 }, w: L('Profits beat forecasts across the board.', '企業獲利普遍優於預期。') },
  { t: L('Rate hike surprise', '意外升息'),            m: { tech: 0.90, chip: 0.92, yield: 1.03, oil: 1.02, health: 1.00, reit: 0.88 }, w: L('Higher rates hurt growth and property; steady payers hold up.', '升息壓抑成長股與不動產,穩定配息的相對抗跌。') },
  { t: L('Flu season hits', '流感疫情升溫'),           m: { tech: 0.98, chip: 0.98, yield: 1.00, oil: 0.96, health: 1.20, reit: 1.00 }, w: L('Demand for medicine and care jumps.', '醫療需求大增。') },
];
const LOT = 10, START_CASH = 10000, SALARY = 500, FEE = 200, MAX_ROLLS = 15;

/* ───────────── 狀態 ───────────── */
let S;
const assets = () => S.cash + KEYS.reduce((a, k) => a + S.hold[k].n * S.price[k], 0);
const stockValue = () => KEYS.reduce((a, k) => a + S.hold[k].n * S.price[k], 0);
const MISSIONS = [
  { id: 'spread', title: L('Spread it out', '分散投資'),     sub: L('Hold 3 different sectors at once', '同時持有 3 種不同類股'),               ok: () => KEYS.filter((k) => S.hold[k].n > 0).length >= 3 },
  { id: 'paid',   title: L('Get paid to wait', '領到股利'),  sub: L('Collect $150+ in dividends on one payday', '一次發薪日領到 $150 以上股利'), ok: () => S.lastDividend >= 150 },
  { id: 'dip',    title: L('Buy the dip', '逢低買進'),       sub: L('Buy a sector trading below its opening price', '買進一檔低於開盤價的類股'),  ok: () => S.flags.dip },
  { id: 'profit', title: L('Take profit', '獲利了結'),       sub: L('Sell a holding that is up 15% or more', '賣出一檔賺超過 15% 的持股'),       ok: () => S.flags.profit },
  { id: 'cash',   title: L('Keep dry powder', '保留現金'),   sub: L('Own stock and keep $2,000+ cash for 3 turns', '持有股票且連續 3 回合現金 $2,000 以上'), ok: () => S.cashStreak >= 3 },
  { id: 'grow',   title: L('Grow the pile', '資產成長'),     sub: L('Reach $11,000 in total assets', '總資產達到 $11,000'),                   ok: () => assets() >= 11000 },
];
function newState() {
  const pool = MISSIONS.slice().sort(() => Math.random() - 0.5).slice(0, 3);
  S = {
    pos: 0, cash: START_CASH, rolls: 0, paws: 2, busy: false, over: false,
    price: Object.fromEntries(KEYS.map((k) => [k, SECTORS[k].open])),
    hold: Object.fromEntries(KEYS.map((k) => [k, { n: 0, cost: 0 }])),
    lastDividend: 0, cashStreak: 0, flags: { dip: false, profit: false }, lastEvent: null,
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
function lamp(x, z) {
  const g = new THREE.Group(); g.position.set(x, 0, z); scene.add(g);
  const p = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, 1.1, 8), mat(0x4a5568)); p.position.y = 0.55; p.castShadow = true; g.add(p);
  const b = new THREE.Mesh(new THREE.SphereGeometry(0.13, 14, 10), new THREE.MeshStandardMaterial({ color: 0xfff2b8, emissive: 0xffd76a, emissiveIntensity: 0.9 })); b.position.y = 1.18; g.add(b);
  box(0.2, 0.05, 0.2, 0x4a5568, 0, 1.34, 0, 0.02, g);
}
function fence(x, z, len, alongX) {
  for (let i = 0; i < len; i++) { const o = (i - (len - 1) / 2) * 0.42;
    box(alongX ? 0.36 : 0.08, 0.34, alongX ? 0.08 : 0.36, 0xd9a86c, x + (alongX ? o : 0), 0.2, z + (alongX ? 0 : o), 0.02); }
}
function flowers(n) {
  const cols = [0xffffff, 0xffd24a, 0xff9ec4, 0xffffff];
  for (let i = 0; i < n; i++) {
    const x = (Math.random() - 0.5) * 2.9, z = (Math.random() - 0.5) * 2.9;
    if (Math.hypot(x - 0.55, z - 0.55) < 0.6) continue;   // 留位置給骰子
    const f = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), mat(cols[i % cols.length])); f.position.set(x, 0.21, z); scene.add(f);
    const st = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), mat(0x86c96f)); st.position.set(x + 0.05, 0.19, z + 0.03); st.scale.y = 0.5; scene.add(st);
  }
}
const E = 2.5 * STEP + 0.62;
[[-E, -E], [E, -E], [-E, E]].forEach(([x, z]) => lamp(x, z));   // 最靠鏡頭的那個角不放,會擋到起點
fence(-E - 0.5, -1.4, 5, false); fence(-1.4, -E - 0.5, 5, true); fence(1.9, -E - 0.5, 4, true);
flowers(26);
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
    bld = new THREE.Group(); bld.position.set(0.36, TOP, -0.36);   // 放在畫面右側那個角,不擋圖示和價格 bld.visible = false; g.add(bld);
    box(0.22, 1, 0.22, sec.color, 0, 0.5, 0, 0.03, bld);
    box(0.27, 0.08, 0.27, 0xffffff, 0, 1.03, 0, 0.02, bld);
  }
  tiles.push({ type, g, cv, tex, bld, bldH: 0 });
});
// 類股圖示:自己用 canvas 畫的簡單圖形(不用任何真實公司的商標)
function icon(c, type, x, y, r, color) {
  c.save(); c.translate(x, y); c.fillStyle = color; c.strokeStyle = color; c.lineWidth = r * 0.16; c.lineJoin = 'round'; c.lineCap = 'round';
  const rr = (X, Y, W, H, R) => { c.beginPath(); c.roundRect(X, Y, W, H, R); };
  if (type === 'tech') { rr(-r, -r * 0.78, r * 2, r * 1.3, r * 0.18); c.fill(); c.fillRect(-r * 0.14, r * 0.5, r * 0.28, r * 0.3); rr(-r * 0.55, r * 0.74, r * 1.1, r * 0.2, r * 0.1); c.fill();
    c.fillStyle = '#fff'; rr(-r * 0.78, -r * 0.58, r * 1.56, r * 0.9, r * 0.08); c.fill(); }
  else if (type === 'chip') { for (let i = -1; i <= 1; i++) { c.beginPath(); c.moveTo(i * r * 0.45, -r); c.lineTo(i * r * 0.45, r); c.moveTo(-r, i * r * 0.45); c.lineTo(r, i * r * 0.45); c.stroke(); }
    rr(-r * 0.72, -r * 0.72, r * 1.44, r * 1.44, r * 0.2); c.fill(); c.fillStyle = '#fff'; rr(-r * 0.34, -r * 0.34, r * 0.68, r * 0.68, r * 0.1); c.fill(); }
  else if (type === 'yield') { c.beginPath(); c.arc(0, 0, r, 0, Math.PI * 2); c.fill(); c.fillStyle = '#fff'; c.font = `900 ${r * 1.4}px Arial`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('$', 0, r * 0.08); }
  else if (type === 'oil') { c.beginPath(); c.moveTo(r * 0.25, -r); c.lineTo(-r * 0.6, r * 0.15); c.lineTo(-r * 0.05, r * 0.15); c.lineTo(-r * 0.3, r); c.lineTo(r * 0.6, -r * 0.2); c.lineTo(r * 0.05, -r * 0.2); c.closePath(); c.fill(); }
  else if (type === 'health') { rr(-r, -r, r * 2, r * 2, r * 0.4); c.fill(); c.fillStyle = '#fff'; c.fillRect(-r * 0.2, -r * 0.62, r * 0.4, r * 1.24); c.fillRect(-r * 0.62, -r * 0.2, r * 1.24, r * 0.4); }
  else if (type === 'reit') { c.beginPath(); c.moveTo(0, -r); c.lineTo(r * 1.05, -r * 0.1); c.lineTo(-r * 1.05, -r * 0.1); c.closePath(); c.fill(); c.fillRect(-r * 0.72, -r * 0.1, r * 1.44, r * 1.05);
    c.fillStyle = '#fff'; c.fillRect(-r * 0.2, r * 0.3, r * 0.4, r * 0.65); }
  c.restore();
}
function drawLabel(i) {
  const t = tiles[i], c = t.cv.getContext('2d'), sec = SECTORS[t.type];
  c.clearRect(0, 0, 256, 256); c.textAlign = 'center'; c.textBaseline = 'middle';
  const F = (px) => `900 ${px}px "Avenir Next","PingFang TC","Helvetica Neue",Arial,sans-serif`;
  if (sec) {
    icon(c, t.type, 128, 62, 34, sec.css);
    c.fillStyle = sec.css; c.font = F(ZH ? 38 : 34); c.fillText(sec.code, 128, 136);
    c.fillStyle = '#3b2f2a'; c.font = F(62); c.fillText('$' + Math.round(S.price[t.type]), 128, 196);
  } else if (t.type === 'chance') {
    c.fillStyle = '#b0780a'; c.font = F(150); c.fillText('?', 128, 112);
    c.font = F(34); c.fillText(L('EVENT', '市場事件'), 128, 208);
  } else {
    const [a, b] = { start: [L('GO', '起點'), L('+$' + SALARY, '領薪水股利')], fee: [L('FEE', '手續費'), '-$' + FEE], paw: [L('PAW', '貓掌'), '+1'] }[t.type];
    c.fillStyle = '#fff'; c.font = F(ZH ? 60 : 72); c.fillText(a, 128, 104);
    c.font = F(ZH ? 34 : 40); c.fillText(b, 128, 168);
  }
  t.tex.needsUpdate = true;
}
const drawAll = () => tiles.forEach((_, i) => drawLabel(i));

/* ───────────── 棋子(貓) ───────────── */
const piece = new THREE.Group(); scene.add(piece);
const body = new THREE.Group(); piece.add(body);
// 棋子可選:預設是原創的幾何兔子;網址加 ?piece=cat 換回房間那隻貓的模型
const PIECE = new URLSearchParams(location.search).get('piece') || 'bunny';
// 原創兔子(純幾何):奶油色、一隻耳朵折下來、腮紅、粉紅圓點鼻、橘色圍巾。正面朝 +z
function makeBunny() {
  const g = new THREE.Group();
  const fur = mat(0xfff4e2, { roughness: 0.9 }), pink = mat(0xffb3c7), dark = mat(0x2b2420, { roughness: 0.5 }), scarf = mat(0xff8a3d);
  const add = (geo, m, x, y, z, sx = 1, sy = 1, sz = 1) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.scale.set(sx, sy, sz); o.castShadow = true; g.add(o); return o; };
  const sph = (r) => new THREE.SphereGeometry(r, 24, 18);
  add(sph(0.22), fur, 0, 0.24, 0, 1, 1.08, 0.92);                    // 身體
  add(sph(0.075), fur, -0.11, 0.045, 0.07, 1, 0.6, 1.3);             // 腳
  add(sph(0.075), fur, 0.11, 0.045, 0.07, 1, 0.6, 1.3);
  add(sph(0.06), fur, -0.2, 0.27, 0.05, 0.8, 1.3, 0.8);              // 手
  add(sph(0.06), fur, 0.2, 0.27, 0.05, 0.8, 1.3, 0.8);
  add(sph(0.07), fur, 0, 0.2, -0.2);                                 // 尾巴
  add(new THREE.TorusGeometry(0.15, 0.05, 10, 24), scarf, 0, 0.43, 0).rotation.x = Math.PI / 2;   // 圍巾
  add(new THREE.BoxGeometry(0.09, 0.2, 0.04), scarf, 0.1, 0.33, 0.15).rotation.z = -0.25;
  add(sph(0.24), fur, 0, 0.62, 0, 1.12, 0.95, 1);                    // 頭(偏扁寬)
  // 耳朵:左耳直立,右耳折下來
  const earGeo = new THREE.CapsuleGeometry(0.062, 0.26, 6, 14), inGeo = new THREE.CapsuleGeometry(0.032, 0.2, 4, 10);
  const earL = add(earGeo, fur, -0.11, 0.98, 0); earL.rotation.z = 0.12;
  const inL = add(inGeo, pink, -0.11, 0.98, 0.04); inL.rotation.z = 0.12; inL.castShadow = false;
  const earR = add(new THREE.CapsuleGeometry(0.062, 0.12, 6, 14), fur, 0.12, 0.9, 0); earR.rotation.z = -0.2;
  const tip = add(new THREE.CapsuleGeometry(0.06, 0.13, 6, 14), fur, 0.24, 0.98, 0.02); tip.rotation.z = -1.35;   // 折下來的那一段
  add(sph(0.028), dark, -0.095, 0.65, 0.215);                        // 眼睛
  add(sph(0.028), dark, 0.095, 0.65, 0.215);
  add(sph(0.024), pink, 0, 0.595, 0.24);                             // 粉紅圓點鼻
  add(sph(0.045), pink, -0.165, 0.575, 0.17, 1, 0.6, 0.5).castShadow = false;   // 腮紅
  add(sph(0.045), pink, 0.165, 0.575, 0.17, 1, 0.6, 0.5).castShadow = false;
  return g;
}
if (PIECE === 'cat') {
  // 佔位:模型還沒載到之前先放一隻幾何貓
  const ph = new THREE.Group(); ph.name = 'ph'; body.add(ph);
  const b = new THREE.Mesh(new THREE.SphereGeometry(0.26, 20, 16), mat(0xffb057)); b.position.y = 0.26; b.scale.y = 1.1; b.castShadow = true; ph.add(b);
  const h = new THREE.Mesh(new THREE.SphereGeometry(0.2, 20, 16), mat(0xffb057)); h.position.y = 0.66; h.castShadow = true; ph.add(h);
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
} else {
  const bunny = makeBunny(); bunny.scale.setScalar(1.25); body.add(bunny);
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
// 貓咪顧問:只講棋盤上看得到的事實和任務提示,**不預測漲跌**
function advise() {
  const todo = new Set(S.missions.filter((m) => !m.done).map((m) => m.id));
  const held = KEYS.filter((k) => S.hold[k].n > 0);
  const cheap = KEYS.filter((k) => S.price[k] < SECTORS[k].open * 0.97);
  const up = held.find((k) => (S.price[k] * S.hold[k].n - S.hold[k].cost) / S.hold[k].cost >= 0.15);
  let d = 0; for (let i = 1; i <= 6; i++) if (TILES[(S.pos + i) % TILES.length] === 'chance') { d = i; break; }
  if (todo.has('profit') && up) return L(`${SECTORS[up].name} is up over 15%. Land on it to take profit.`, `${SECTORS[up].name}已經賺超過 15%,走到它的格子就能獲利了結。`);
  if (todo.has('dip') && cheap.length) return L(`${SECTORS[cheap[0]].name} is below its opening price. Buying it counts as buying the dip.`, `${SECTORS[cheap[0]].name}現在低於開盤價,買進就算逢低買進。`);
  if (todo.has('spread') && held.length < 3) return L(`You hold ${held.length} sector${held.length === 1 ? '' : 's'}. Three different ones spread your risk.`, `你現在持有 ${held.length} 種類股,湊滿 3 種可以分散風險。`);
  if (todo.has('paid')) return L('High-yield and REIT pay the most each lap. Hold them when you pass GO.', '高股息和不動產配息最多,持有它們再繞回起點就能領股利。');
  if (todo.has('cash') && S.cash < 2000) return L('Cash is low. Keep $2,000 so you can buy when a chance shows up.', '現金偏低。留 $2,000 以上,好機會出現時才買得起。');
  if (d) return L(`A market event is ${d} step${d > 1 ? 's' : ''} ahead. Every price may move.`, `前方第 ${d} 格是市場事件,所有價格都可能變動。`);
  return L('No one knows the next roll. Spread out and keep some cash.', '沒有人知道下一步會擲出幾點,分散持股、留點現金最穩。');
}
function hud() {
  $('cash').textContent = fmt(S.cash);
  $('assets').textContent = fmt(assets());
  $('stocks').textContent = fmt(stockValue());
  $('paws').textContent = S.paws;
  $('mcount').textContent = S.missions.filter((m) => m.done).length + '/3';
  $('rollsLeft').textContent = L(`${MAX_ROLLS - S.rolls} left`, `剩 ${MAX_ROLLS - S.rolls} 次`);
  $('pawBtn').disabled = S.paws <= 0;
  $('miss').innerHTML = S.missions.map((m) =>
    `<div class="m ${m.done ? 'done' : ''}"><span class="ck">${m.done ? '✓' : ''}</span><span>${m.title}<small>${m.sub}</small></span></div>`).join('');
  $('tip').textContent = advise();
  $('assetRows').innerHTML =
    `<div class="row"><i style="background:#57b86b"></i><span>${L('Cash', '現金')}</span><span></span><span>${fmt(S.cash)}</span></div>` +
    KEYS.map((k) => `<div class="row"><i style="background:${SECTORS[k].css}"></i><span>${SECTORS[k].code}</span><span class="q">${S.hold[k].n} ${L('sh', '股')}</span><span>${fmt(S.hold[k].n * S.price[k])}</span></div>`).join('');
  const e = S.lastEvent;
  $('evtBody').innerHTML = e
    ? `<div>${e.t}</div><div class="why">${e.w}</div>` + KEYS.filter((k) => Math.round((e.m[k] - 1) * 100)).map((k) => { const d = Math.round((e.m[k] - 1) * 100);
        return `<div class="mvrow"><span>${SECTORS[k].code}</span><span style="color:${d > 0 ? '#1c8a4a' : '#c4472f'}">${d > 0 ? '+' : ''}${d}% ${d > 0 ? '▲' : '▼'}</span></div>`; }).join('')
    : `<div class="why">${L('No event yet. Land on a ? tile to draw one.', '還沒有事件。走到「?」格會抽一張。')}</div>`;
  $('roundTxt').textContent = L(`Round ${S.rolls} / ${MAX_ROLLS}`, `回合 ${S.rolls} / ${MAX_ROLLS}`);
  $('roundBar').style.width = (S.rolls / MAX_ROLLS * 100) + '%';
}
function staticText() {
  document.documentElement.lang = ZH ? 'zh-Hant' : 'en';
  document.title = L('Cat Street Stocks', '貓咪股市大富翁');
  $('lblAssets').textContent = L('Total assets', '總資產'); $('lblStocks').textContent = L('Stocks', '股票市值');
  $('pawBtn').textContent = L('Use paw', '使用貓掌'); $('rollTxt').textContent = L('ROLL', '擲骰子');
  $('assetTitle').textContent = L('My assets', '我的資產'); $('evtTitle').textContent = L('Market event', '市場事件');
  $('note').textContent = L('Fictional companies · for learning, not investment advice', '公司皆為虛構 · 學習用途,非投資建議');
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
        <div>${L('Price', '股價')}<b>$${Math.round(price)}</b></div>
        <div>${L('Since open', '相對開盤')}<b style="color:${vs >= 0 ? '#1c8a4a' : '#c4472f'}">${vs >= 0 ? '+' : ''}${vs.toFixed(0)}%</b></div>
        <div>${L('You hold', '持有')}<b>${h.n}${h.n ? ` <span style="font-size:11px;color:${gain >= 0 ? '#1c8a4a' : '#c4472f'}">${gain >= 0 ? '+' : ''}${gain.toFixed(0)}%</span>` : ''}</b></div>
      </div>
      <div class="btns">
        <button class="b-buy" data-a="buy1" ${S.cash < price * LOT ? 'disabled' : ''}>${L('Buy 10', '買 10 股')}<br><span style="font-size:11px">$${fmt(price * LOT)}</span></button>
        <button class="b-buy" data-a="buy3" ${S.cash < price * LOT * 3 ? 'disabled' : ''}>${L('Buy 30', '買 30 股')}<br><span style="font-size:11px">$${fmt(price * LOT * 3)}</span></button>
        <button class="b-sell" data-a="sell" ${h.n ? '' : 'disabled'}>${L('Sell all', '全部賣出')}</button>
        <button class="b-skip" data-a="skip">${L('Skip', '跳過')}</button>
      </div>`);
    p.querySelectorAll('button').forEach((b) => b.onclick = () => {
      const a = b.dataset.a;
      if (a === 'buy1' || a === 'buy3') {
        const n = LOT * (a === 'buy1' ? 1 : 3), cost = price * n;
        S.cash -= cost; h.n += n; h.cost += cost;
        if (price < sec.open * 0.97) S.flags.dip = true;
        toast(L(`Bought ${n} ${sec.name}`, `買進 ${sec.name} ${n} 股`));
      } else if (a === 'sell') {
        const value = price * h.n;
        if ((value - h.cost) / h.cost >= 0.15) S.flags.profit = true;
        toast(L('Sold for', '賣出得') + ` $${fmt(value)} (${value >= h.cost ? '+' : '-'}$${fmt(Math.abs(value - h.cost))})`);
        S.cash += value; h.n = 0; h.cost = 0;
      }
      closePanel(); res();
    });
  });
}
function cardPanel(title, text, moves = '') {
  return new Promise((res) => {
    const p = panel(`<h3>${title}</h3><p>${text}</p>${moves ? `<div class="moves">${moves}</div>` : ''}<div class="btns"><button class="b-ok">${L('Continue', '繼續')}</button></div>`);
    p.querySelector('button').onclick = () => { closePanel(); res(); };
  });
}

/* ───────────── 回合流程(狀態機:idle → rolling → moving → landing → idle / over) ───────────── */
function payday() {
  const div = KEYS.reduce((a, k) => a + S.hold[k].n * S.price[k] * SECTORS[k].div, 0);
  S.lastDividend = div; S.cash += SALARY + div;
  toast(L('Payday', '發薪日') + ` +$${fmt(SALARY)}${div > 0 ? ` · ${L('dividends', '股利')} +$${fmt(div)}` : ''}`);
  hud(); checkMissions();
}
function checkMissions() {
  S.missions.forEach((m) => { if (!m.done && m.ok()) { m.done = true; toast(L('Mission complete: ', '任務完成:') + m.title); } });
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
    S.lastEvent = e; drawAll(); hud();
    const moves = KEYS.map((k) => { const d = Math.round((e.m[k] - 1) * 100); return d ? `<span class="mv ${d > 0 ? 'up' : 'dn'}">${SECTORS[k].name} ${d > 0 ? '+' : ''}${d}%</span>` : ''; }).join('');
    await cardPanel(e.t, e.w, moves);
  } else if (type === 'fee') { S.cash -= FEE; hud(); await cardPanel(L('Trading fees', '交易手續費'), L(`Every trade has a cost. You paid $${FEE}.`, `每筆交易都有成本,這次付了 $${FEE}。`)); }
  else if (type === 'paw') { S.paws++; hud(); await cardPanel(L('Lucky paw', '撿到貓掌'), L('You found a paw. Use it to pick how far you walk instead of rolling.', '得到一個貓掌,可以自己決定走幾步,不用擲骰子。')); }
  else await cardPanel(L('Payday', '發薪日'), L(`Salary $${fmt(SALARY)}${S.lastDividend > 0 ? ` plus $${fmt(S.lastDividend)} in dividends` : ''}. Holding stocks pays you every lap.`, `薪水 $${fmt(SALARY)}${S.lastDividend > 0 ? `,加上股利 $${fmt(S.lastDividend)}` : ''}。持有股票,每繞一圈都會配息。`));

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
  const style = {
    cash: L('Careful saver. Lots of cash, little growth.', '謹慎存錢派:現金很多,但成長有限。'),
    tech: L('Growth believer. Big swings, big upside.', '成長信仰派:波動大,潛力也大。'),
    chip: L('Cycle rider. You chase supply and demand.', '循環騎士:跟著供需循環進出。'),
    yield: L('Income collector. Steady pay every lap.', '領息一族:每圈穩穩收股利。'),
    oil: L('Macro trader. You bet on world events.', '總經交易者:押注國際事件。'),
    health: L('Defender. You like sectors that hold up in a storm.', '防禦派:偏好抗跌的類股。'),
    reit: L('Landlord. You collect rent and watch interest rates.', '包租公:收租配息,緊盯利率。'),
  }[top];
  const title = [L('Rough market', '行情不順'), L('Curious kitten', '好奇小貓'), L('Sharp analyst', '精明分析師'), L('Top cat investor', '頂尖貓投資人')][done];
  const a = assets();
  $('end').innerHTML = `<div class="card">
    <div class="stars">${[0, 1, 2].map((i) => i < done ? '<b>★</b>' : '★').join('')}</div>
    <h2>${title}</h2>
    <p>${L('Total assets', '總資產')} <b>$${fmt(a)}</b> (${a >= START_CASH ? '+' : ''}${((a / START_CASH - 1) * 100).toFixed(0)}%) · ${L(`${S.rolls} rolls`, `${S.rolls} 回合`)}</p>
    <p>${style}</p>
    <p style="font-size:12.5px">${L('Want real charts, rankings, and an AI you can talk to? CatInsight Stock has them.', '想看真實線圖、排行,還有能對話的 AI?CatInsight Stock 都有。')}</p>
    <div class="btns"><button class="b-skip" id="again">${L('Play again', '再玩一次')}</button><button class="b-ok" id="app">${L('Get the app', '下載 App')}</button></div></div>`;
  $('end').classList.remove('hide');
  $('again').onclick = start;
  $('app').onclick = () => window.open(APP_URL, '_blank', 'noopener');
}
function start() {
  newState(); $('end').classList.add('hide'); closePanel();
  staticText(); placePiece(0); drawAll(); hud(); showCtl(true);
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
