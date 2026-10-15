// 艦內:①機庫 → 通道(鏡頭穿過兩道會滑開的艙門)②中央大廳(照使用者給的概念圖:太空站控制中心的剖面)。
// 大廳:深色金屬地板 + 一圈圈發光環和指向各艙的箭頭、後半圈六個敞開的艙口(每個艙口裡看得到那一艙的縮影、
// 上方霓虹招牌)、中央全息地球儀 + 戰艦投影、前方 PROJECTS / SKILLS 兩座操控台、沙發、玻璃欄杆、植物、太空貓。
import * as THREE from 'three';
import { mat, glow, box, cyl, sphere, group, panelTex, leafyPlant, rand } from './kit.mjs';

// 圓環的一段(俯視是扇形環),沿 y 擠出:做弧形艙壁用。b0/b1 是方位角(0 = 正後方 -z,正值往 +x)
function ringSector(r0, r1, b0, b1, h, m) {
  const s = new THREE.Shape(), t0 = Math.PI / 2 - b0, t1 = Math.PI / 2 - b1;
  s.absarc(0, 0, r1, t0, t1, true); s.absarc(0, 0, r0, t1, t0, false); s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: h, bevelEnabled: false, curveSegments: 48 });
  g.rotateX(-Math.PI / 2);                       // 形狀的 (x, y) → 世界 (x, -z),擠出方向 → +y
  const mesh = new THREE.Mesh(g, m); mesh.castShadow = mesh.receiveShadow = true; return mesh;
}
const canvasTex = (w, h, draw) => { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t; };
const hex = (n) => '#' + n.toString(16).padStart(6, '0');

// ---------- 招牌上的小圖示(線條畫)----------
const ICON = {
  bridge(g, s) { g.beginPath(); g.arc(0, 0, s * .42, 0, Math.PI * 2); g.stroke(); g.beginPath(); g.roundRect(-s * .28, -s * .16, s * .56, s * .3, s * .14); g.stroke(); },
  kitty(g, s) { g.beginPath(); g.moveTo(-s * .36, -s * .05); g.lineTo(-s * .3, -s * .42); g.lineTo(-s * .1, -s * .26); g.lineTo(s * .1, -s * .26); g.lineTo(s * .3, -s * .42); g.lineTo(s * .36, -s * .05);
    g.arc(0, -s * .05, s * .36, 0, Math.PI); g.closePath(); g.stroke(); for (const x of [-.13, .13]) { g.beginPath(); g.arc(x * s, -s * .02, s * .04, 0, 7); g.fill(); } },
  stocks(g, s) { [[-.3, .1], [-.08, -.08], [.14, -.22]].forEach(([x, y]) => g.strokeRect(x * s, y * s, s * .14, (.36 - y) * s)); g.beginPath(); g.moveTo(-.38 * s, -.02 * s); g.lineTo(-.1 * s, -.28 * s); g.lineTo(.08 * s, -.18 * s); g.lineTo(.38 * s, -.42 * s); g.stroke(); },
  ocean(g, s) { for (const dy of [-.12, .12]) { g.beginPath(); for (let x = -.4; x <= .4; x += .02) { const y = dy + Math.sin(x * 14) * .07; x === -.4 ? g.moveTo(x * s, y * s) : g.lineTo(x * s, y * s); } g.stroke(); } },
  planet(g, s) { g.beginPath(); g.arc(0, 0, s * .24, 0, Math.PI * 2); g.stroke(); g.beginPath(); g.ellipse(0, 0, s * .44, s * .13, -.35, 0, Math.PI * 2); g.stroke(); },
  rails(g, s) { const a = s * .34; g.beginPath(); g.moveTo(0, -a); g.lineTo(a * .87, -a / 2); g.lineTo(a * .87, a / 2); g.lineTo(0, a); g.lineTo(-a * .87, a / 2); g.lineTo(-a * .87, -a / 2); g.closePath(); g.moveTo(0, 0); g.lineTo(0, a); g.moveTo(0, 0); g.lineTo(a * .87, -a / 2); g.moveTo(0, 0); g.lineTo(-a * .87, -a / 2); g.stroke(); },
};
const SUB = { bridge: 'About Me', kitty: 'Web · iOS', stocks: 'Board Game', ocean: 'iOS Game', planet: 'Three.js', rails: 'Track Puzzle' };
function signTex(room, i) {
  const col = hex(room.cfg.accent);
  return canvasTex(1024, 300, (g, W, H) => {
    g.fillStyle = 'rgba(9,13,30,.94)'; g.beginPath(); g.roundRect(14, 14, W - 28, H - 28, 30); g.fill();
    g.shadowColor = col; g.shadowBlur = 26; g.strokeStyle = col; g.lineWidth = 9; g.beginPath(); g.roundRect(14, 14, W - 28, H - 28, 30); g.stroke();
    g.save(); g.translate(150, H / 2); g.lineWidth = 12; g.strokeStyle = '#fff'; g.fillStyle = '#fff'; g.shadowBlur = 18; ICON[room.key](g, 170); g.restore();
    const label = `${String(i + 1).padStart(2, '0')} ${room.title}`; g.font = '800 92px "Helvetica Neue", sans-serif';
    const fs = Math.min(92, 92 * (W - 270 - 50) / g.measureText(label).width);       // 名字太長就縮小字,不要被切掉
    g.shadowBlur = 0; g.fillStyle = '#fff'; g.font = `800 ${fs | 0}px "Helvetica Neue", sans-serif`; g.fillText(label, 270, 140);
    g.fillStyle = col; g.font = '600 56px "Helvetica Neue", sans-serif'; g.fillText(SUB[room.key] || room.tag, 272, 225);
  });
}

// ---------- 艙口裡的縮影:後牆的畫 + 幾件立體小道具 ----------
const BACK = {
  bridge(g, W, H, r) { const gr = g.createRadialGradient(W * .6, H * .4, 20, W * .5, H * .5, W * .7); gr.addColorStop(0, '#3a3a9a'); gr.addColorStop(.5, '#141c4a'); gr.addColorStop(1, '#050816'); g.fillStyle = gr; g.fillRect(0, 0, W, H);
    for (let k = 0; k < 260; k++) { g.fillStyle = `rgba(255,255,255,${.3 + r() * .7})`; g.fillRect(r() * W, r() * H * .75, 2, 2); }
    g.strokeStyle = '#8fa6c8'; g.lineWidth = 14; g.strokeRect(20, 30, W - 40, H * .62); g.beginPath(); g.moveTo(W / 2, 30); g.lineTo(W / 2, 30 + H * .62); g.stroke();
    g.fillStyle = '#2a3350'; g.fillRect(0, H * .72, W, H * .28); },
  kitty(g, W, H, r) { g.fillStyle = '#f7c9d8'; g.fillRect(0, 0, W, H); g.fillStyle = '#fbe3ea'; g.fillRect(0, H * .66, W, H * .34);
    for (const y of [.22, .42]) { g.fillStyle = '#e9a7bd'; g.fillRect(W * .08, H * y, W * .4, 10); for (let k = 0; k < 5; k++) { g.fillStyle = ['#fff2c4', '#ff8fb0', '#bfe4ff', '#d9c4ff', '#ffd59a'][k]; g.fillRect(W * .1 + k * 38, H * y - 34, 26, 34); } }
    g.fillStyle = '#ffffff'; g.fillRect(W * .58, H * .12, W * .32, H * .3); g.fillStyle = '#ffd59a'; g.beginPath(); g.arc(W * .74, H * .29, 40, 0, 7); g.fill();
    g.fillStyle = '#ffd59a'; g.beginPath(); g.moveTo(W * .74 - 40, H * .25); g.lineTo(W * .74 - 30, H * .17); g.lineTo(W * .74 - 12, H * .23); g.fill(); g.beginPath(); g.moveTo(W * .74 + 40, H * .25); g.lineTo(W * .74 + 30, H * .17); g.lineTo(W * .74 + 12, H * .23); g.fill(); },
  stocks(g, W, H, r) { g.fillStyle = '#0f2a2e'; g.fillRect(0, 0, W, H);
    for (let row = 0; row < 2; row++) for (let col = 0; col < 3; col++) {
      const x = 22 + col * (W - 44) / 3, y = 34 + row * 150, w = (W - 44) / 3 - 14, h = 130; g.fillStyle = '#071318'; g.fillRect(x, y, w, h); g.strokeStyle = '#3d5f66'; g.lineWidth = 5; g.strokeRect(x, y, w, h);
      g.strokeStyle = (row + col) % 3 === 1 ? '#ff6b6b' : '#5cf0a0'; g.lineWidth = 4; g.beginPath(); let v = h * .6; for (let k = 0; k <= 20; k++) { v = Math.max(15, Math.min(h - 10, v + (r() - .5) * 26 - ((row + col) % 3 === 1 ? -2 : 2))); k ? g.lineTo(x + 6 + k * (w - 12) / 20, y + v) : g.moveTo(x + 6, y + v); } g.stroke(); }
    g.fillStyle = '#16353a'; g.fillRect(0, H * .72, W, H * .28); },
  ocean(g, W, H, r) { const gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, '#5fd0ff'); gr.addColorStop(.6, '#1176c4'); gr.addColorStop(1, '#063b78'); g.fillStyle = gr; g.fillRect(0, 0, W, H);
    for (let k = 0; k < 5; k++) { g.fillStyle = 'rgba(255,255,255,.08)'; g.beginPath(); const x = r() * W; g.moveTo(x, 0); g.lineTo(x + 50, 0); g.lineTo(x - 60, H); g.lineTo(x - 120, H); g.fill(); }
    for (let k = 0; k < 16; k++) { const x = r() * W, y = H * .1 + r() * H * .6, s = 8 + r() * 12; g.fillStyle = ['#ffb35c', '#ffd166', '#ff8fa3', '#9fffd0'][k % 4]; g.beginPath(); g.ellipse(x, y, s * 1.6, s, 0, 0, 7); g.fill(); g.beginPath(); g.moveTo(x - s * 1.4, y); g.lineTo(x - s * 2.6, y - s); g.lineTo(x - s * 2.6, y + s); g.fill(); }
    for (let k = 0; k < 9; k++) { g.fillStyle = ['#ff7a9a', '#ff9f5a', '#c86bff'][k % 3]; const x = k * W / 8, h = 60 + r() * 90; g.beginPath(); g.ellipse(x, H - 20, 24, h, 0, Math.PI, 0); g.fill(); } },
  planet(g, W, H, r) { const gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, '#3a1a6e'); gr.addColorStop(1, '#16083a'); g.fillStyle = gr; g.fillRect(0, 0, W, H);
    for (let k = 0; k < 120; k++) { g.fillStyle = `rgba(255,200,255,${.2 + r() * .6})`; g.fillRect(r() * W, r() * H * .6, 2, 2); }
    g.shadowColor = '#ff4fd8'; g.shadowBlur = 30; g.fillStyle = '#ffd1f6'; g.font = '900 120px "Helvetica Neue", sans-serif'; g.textAlign = 'center'; g.fillText('PLAY', W / 2, H * .3); g.shadowBlur = 0;
    g.strokeStyle = '#b48bff'; g.lineWidth = 6; g.beginPath(); g.arc(W * .22, H * .55, 50, 0, 7); g.stroke(); g.beginPath(); g.ellipse(W * .22, H * .55, 90, 22, -.3, 0, 7); g.stroke(); },
  rails(g, W, H, r) { g.fillStyle = '#e9c79c'; g.fillRect(0, 0, W, H); g.fillStyle = '#c9965f'; g.fillRect(0, H * .66, W, H * .34);
    g.fillStyle = '#d8b07c'; g.fillRect(W * .55, H * .1, W * .38, H * .36); g.fillStyle = '#8a5a30'; for (let x = 0; x < 5; x++) for (let y = 0; y < 4; y++) { g.beginPath(); g.arc(W * .58 + x * 40, H * .14 + y * 36, 4, 0, 7); g.fill(); }
    for (const y of [.22, .42]) { g.fillStyle = '#a8703c'; g.fillRect(W * .06, H * y, W * .4, 10); for (let k = 0; k < 4; k++) { g.fillStyle = ['#e85c4a', '#3f8fd9', '#f2c14e', '#5cb87a'][k]; g.fillRect(W * .08 + k * 48, H * y - 30, 36, 30); } } },
};
function props(R, key, acc) {
  const scr = (c, i = 1.6) => glow(c, i);
  if (key === 'bridge') { for (const x of [-.6, .6]) { box(R, .9, .55, .45, 0x5d6b88, { x, y: .28, z: -1.7, r: .05 }); const s = new THREE.Mesh(new THREE.PlaneGeometry(.75, .3), scr(0x7fd0ff)); s.position.set(x, .62, -1.6); s.rotation.x = -.8; R.add(s); } }
  if (key === 'kitty') { box(R, 1.0, .06, .5, 0xffffff, { x: .35, y: .62, z: -2.1 }); for (const x of [-.05, .75]) cyl(R, .025, .025, .6, 0xf2b8c9, { x, y: .3, z: -2.1 });
    box(R, .42, .06, .42, 0xff8fb0, { x: .35, y: .4, z: -1.5, r: .04 }); box(R, .42, .45, .06, 0xff8fb0, { x: .35, y: .62, z: -1.3, r: .03 });
    const cat = sphere(R, .2, 0xffd59a, { x: -.6, y: .2, z: -1.6 }); cat.scale.set(1, .85, 1); sphere(R, .14, 0xffd59a, { x: -.6, y: .48, z: -1.55 }); }
  if (key === 'stocks') { box(R, 1.8, .06, .6, 0xc9d3e6, { y: .66, z: -2.1 }); for (const x of [-.55, 0, .55]) { box(R, .5, .32, .04, 0x1b2430, { x, y: .95, z: -2.2 }); const s = new THREE.Mesh(new THREE.PlaneGeometry(.44, .26), scr(x ? 0x5cf0a0 : 0xff6b6b, 1.3)); s.position.set(x, .95, -2.17); R.add(s); }
    box(R, .45, .08, .45, 0x2b3150, { y: .45, z: -1.35, r: .04 }); box(R, .45, .6, .08, 0x2b3150, { y: .78, z: -1.12, r: .04 }); cyl(R, .04, .04, .4, 0x9aa0ab, { y: .22, z: -1.35 }); }
  if (key === 'ocean') { const r = rand(4); for (let k = 0; k < 7; k++) { const c = [0xff7a9a, 0xff9f5a, 0xc86bff][k % 3]; cyl(R, .04, .07, .3 + r() * .5, c, { x: -1 + r() * 2, y: .25, z: -2.4 + r() * 1.4 }); }
    for (let k = 0; k < 4; k++) sphere(R, .12 + r() * .1, 0x8a8f99, { x: -1 + r() * 2, y: .06, z: -2.2 + r() * 1.3 }); }
  if (key === 'planet') { const a = group(R, .4, 0, -1.9, -.3); box(a, .6, 1.25, .5, 0x3a1f6e, { y: .62, r: .05 }); box(a, .58, .1, .55, 0xff4fd8, { y: 1.28, r: .03 });
    const s = new THREE.Mesh(new THREE.PlaneGeometry(.46, .36), scr(0xff8ff0, 2)); s.position.set(0, .95, .26); s.rotation.x = -.15; a.add(s); box(a, .55, .08, .25, 0x5a3d99, { y: .66, z: .3, rx: -.3, r: .02 }); }
  if (key === 'rails') { box(R, 1.6, .08, .6, 0xc08a52, { x: .2, y: .62, z: -2.1, r: .02 }); for (const x of [-.5, .9]) cyl(R, .03, .03, .6, 0x8a5a30, { x, y: .3, z: -2.1 });
    const t = new THREE.Mesh(new THREE.TorusGeometry(.42, .03, 6, 40), mat(0xc08a52)); t.rotation.x = -Math.PI / 2; t.scale.set(1.3, 1, 1); t.position.set(-.1, .05, -1.1); R.add(t);
    for (const [x, c] of [[-.45, 0xe85c4a], [-.2, 0x3f8fd9]]) box(R, .2, .14, .12, c, { x, y: .12, z: -.75, r: .03 }); }
  // 艙口裡自己的彩色燈
  const l = new THREE.PointLight(acc, 5, 4.2, 1.6); l.position.set(0, 2.1, -1.2); R.add(l);
}

export const HALL_R = 8;
const DOOR_W = 2.3, DOOR_H = 2.5, WALL_H = 4.3, ALC_D = 2.8;

export function createHall(scene, rooms) {
  const root = new THREE.Group(); scene.add(root);
  const r = rand(17), n = rooms.length, span = 150 * Math.PI / 180;
  const bearings = rooms.map((_, i) => -span / 2 + span * (i + .5) / n);
  const metal = (c, rough = .45) => mat(c, { roughness: rough, metalness: .55 });
  const plates = (base, seam) => { const t = panelTex(base, seam, 1024, 1024, 4, 4); return t; };

  // ---------- 地板:厚底座 + 深色金屬面板 + 發光環 + 虛線環 + 指向各艙的箭頭 ----------
  cyl(root, HALL_R + .7, HALL_R + .5, .8, metal(0x4a5060), { y: -.4, seg: 96 });
  const ft = plates('#6a7282', 'rgba(20,24,36,.55)'); ft.repeat.set(3, 3);
  cyl(root, HALL_R + .45, HALL_R + .45, .05, new THREE.MeshStandardMaterial({ map: ft, roughness: .32, metalness: .6, envMapIntensity: .9 }), { y: .025, seg: 96 });
  const ring = (r0, r1, c, i = 2.2, y = .06) => { const m = new THREE.Mesh(new THREE.RingGeometry(r0, r1, 128), glow(c, i)); m.rotation.x = -Math.PI / 2; m.position.y = y; root.add(m); return m; };
  ring(2.62, 2.72, 0x6cc6ff, 2.6); ring(3.95, 4.0, 0x6cc6ff, 1.6); ring(5.7, 5.78, 0x6cc6ff, 2.2); ring(HALL_R + .3, HALL_R + .42, 0x6cc6ff, 2.4, .005);
  for (let k = 0; k < 48; k++) { if (k % 2) continue; const b = k / 48 * Math.PI * 2; const d = ringSector(4.6, 4.7, b, b + .07, .02, glow(0x9fd6ff, 1.4)); d.position.y = .05; d.castShadow = false; root.add(d); }
  const arrowGeo = (() => { const s = new THREE.Shape(); s.moveTo(0, .36); s.lineTo(.3, -.16); s.lineTo(-.3, -.16); s.closePath(); const g = new THREE.ShapeGeometry(s); g.rotateX(-Math.PI / 2); return g; })();

  // ---------- 弧形艙壁(深灰金屬)+ 牆頂欄杆 + 燈條 ----------
  const wallM = new THREE.MeshStandardMaterial({ map: plates('#9aa1ae', 'rgba(30,36,50,.45)'), roughness: .5, metalness: .45 });
  const darkM = metal(0x3e4452, .5);
  const half = (DOOR_W / 2 + .42) / HALL_R, B0 = -98 * Math.PI / 180, B1 = 98 * Math.PI / 180;
  let prev = B0;
  for (const b of [...bearings, B1 + half]) { if (b - half > prev + .001) root.add(ringSector(HALL_R, HALL_R + .5, prev, b - half, WALL_H, wallM)); prev = b + half; }
  for (const b of bearings) { const lin = ringSector(HALL_R, HALL_R + .5, b - half, b + half, WALL_H - DOOR_H - .35, wallM); lin.position.y = DOOR_H + .35; root.add(lin); }
  const cap = ringSector(HALL_R - .15, HALL_R + .65, B0, B1, .22, darkM); cap.position.y = WALL_H; root.add(cap);
  for (const [y, c, i] of [[WALL_H - .12, 0x6cc6ff, 2.6], [.9, 0x6cc6ff, 1.4]]) { const s = ringSector(HALL_R - .05, HALL_R, B0, B1, .05, glow(c, i)); s.position.y = y; root.add(s); }
  const base = ringSector(HALL_R - .12, HALL_R, B0, B1, .35, darkM); root.add(base);
  // 門與門之間的柱子(往內凸、一道直燈)+ 柱腳的植物
  const pillarB = [B0 + .04, ...bearings.slice(0, -1).map((b, i) => (b + bearings[i + 1]) / 2), B1 - .04];
  for (const b of pillarB) {
    const p = group(root, Math.sin(b) * (HALL_R - .2), 0, -Math.cos(b) * (HALL_R - .2), -b);
    box(p, .55, WALL_H, .5, metal(0x7d8494), { y: WALL_H / 2, r: .05 });
    const s = new THREE.Mesh(new THREE.BoxGeometry(.06, WALL_H * .55, .02), glow(0x6cc6ff, 2.2)); s.position.set(0, WALL_H * .55, .26); p.add(s);
    for (const y of [.5, 3.6]) { const l = new THREE.Mesh(new THREE.BoxGeometry(.2, .08, .02), glow(0xffd9a0, 2.4)); l.position.set(0, y, .26); p.add(l); }
    box(p, .62, .45, .55, metal(0x5d6472), { y: .22, z: .5, r: .05 });
    leafyPlant(p, { y: .45, z: .5, r: .22, h: .3, pot: 0xdfe4ee, len: .55, n: 9 });
  }

  // ---------- 六個敞開的艙口:艙口框 + 霓虹邊 + 艙內縮影 + 招牌 + 門前坡道 ----------
  const doors = rooms.map((room, i) => {
    const b = bearings[i], acc = room.cfg.accent, cfg = room.cfg;
    const g = group(root, Math.sin(b) * HALL_R, 0, -Math.cos(b) * HALL_R, -b);
    // 艙口框(厚金屬)+ 內圈霓虹
    for (const x of [-1, 1]) box(g, .38, DOOR_H + .35, .7, metal(0x8a91a0), { x: x * (DOOR_W / 2 + .19), y: (DOOR_H + .35) / 2, z: .05, r: .06 });
    box(g, DOOR_W + .76, .35, .7, metal(0x8a91a0), { y: DOOR_H + .17, z: .05, r: .06 });
    const edgeM = glow(acc, 2.4);
    for (const [x, y, w, h] of [[-(DOOR_W / 2 + .01), DOOR_H / 2, .06, DOOR_H], [DOOR_W / 2 + .01, DOOR_H / 2, .06, DOOR_H], [0, DOOR_H + .01, DOOR_W + .08, .06]]) {
      const e = new THREE.Mesh(new THREE.BoxGeometry(w, h, .05), edgeM); e.position.set(x, y, .41); g.add(e);
    }
    // 艙內(往外凸出牆後):地板、兩側牆、天花板、後牆的畫、道具、彩色燈
    const R = group(g, 0, 0, 0);
    const wallC = new THREE.Color(cfg.wallB || cfg.wall).multiplyScalar(.62), inner = new THREE.MeshStandardMaterial({ color: wallC, roughness: .7, emissive: new THREE.Color(acc), emissiveIntensity: .12 });
    const floorC = { bridge: 0x3a4560, kitty: 0xf6d6e0, stocks: 0x284046, ocean: 0xe9d6a8, planet: 0x2a1850, rails: 0xc9965f }[room.key] ?? 0x888888;
    box(R, DOOR_W + .3, .06, ALC_D, mat(floorC, { roughness: .6 }), { y: .03, z: -ALC_D / 2, r: 0, shadow: false });
    for (const x of [-1, 1]) box(R, .1, DOOR_H + .3, ALC_D, inner, { x: x * (DOOR_W / 2 + .2), y: (DOOR_H + .3) / 2, z: -ALC_D / 2, r: 0 });
    box(R, DOOR_W + .5, .12, ALC_D + .2, darkM, { y: DOOR_H + .36, z: -ALC_D / 2, r: 0 });
    const bt = canvasTex(512, 512, (cx, W, H) => BACK[room.key](cx, W, H, rand(i + 3)));
    const back = new THREE.Mesh(new THREE.PlaneGeometry(DOOR_W + .3, DOOR_H + .3), new THREE.MeshStandardMaterial({ map: bt, emissiveMap: bt, emissive: 0xffffff, emissiveIntensity: 1.0, roughness: .8 }));
    back.position.set(0, (DOOR_H + .3) / 2, -ALC_D + .02); R.add(back);
    props(R, room.key, acc);
    // 招牌:往前傾、霓虹框 + 圖示 + 編號名稱 + 副標
    const sg = group(g, 0, DOOR_H + 1.05, .55); sg.rotation.x = -.18;
    box(sg, 2.75, .86, .1, metal(0x3a4050), { z: -.06, r: .04 });
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.7, .79), new THREE.MeshBasicMaterial({ map: signTex(room, i), transparent: true, toneMapped: false })); sign.position.z = .005; sg.add(sign);
    // 門前坡道(格柵 + 兩邊發光)+ 地上的箭頭與連到中央的線
    box(g, DOOR_W, .07, 1.3, metal(0x4c5260, .6), { y: .035, z: .95, r: .02, shadow: false });
    for (let k = 0; k < 8; k++) box(g, DOOR_W - .2, .02, .05, metal(0x2a2f3a), { y: .08, z: .42 + k * .15, r: 0, shadow: false });
    const lineM = glow(acc, 1.6);
    for (const x of [-1, 1]) { const e = new THREE.Mesh(new THREE.BoxGeometry(.05, .03, 1.3), lineM); e.position.set(x * DOOR_W / 2, .08, .95); g.add(e); }
    const arrow = new THREE.Mesh(arrowGeo, lineM); arrow.position.set(0, .07, HALL_R - 4.7); arrow.rotation.y = Math.PI; g.add(arrow);
    const line = new THREE.Mesh(new THREE.BoxGeometry(.05, .02, 2.2), lineM); line.position.set(0, .065, HALL_R - 3.6); g.add(line);
    const hit = new THREE.Mesh(new THREE.BoxGeometry(3.0, 4.2, 2.2), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })); hit.position.set(0, 2.1, .2); g.add(hit);
    hit.userData.door = i;
    return { i, b, g, edgeM, lineM, hit, arrow, open: 0, hover: 0, world: (dist = 0, y = 1.5) => g.localToWorld(new THREE.Vector3(0, y, dist)) };
  });

  // ---------- 中央:三層投影台 + 全息地球儀 + 戰艦投影 + 「Welcome to X·ARTS」----------
  const ped = group(root, 0, 0, .2);
  cyl(ped, 2.3, 2.45, .35, metal(0x3e4452), { y: .175, seg: 64 });
  const tr = new THREE.Mesh(new THREE.TorusGeometry(2.32, .035, 8, 96), glow(0x6cc6ff, 3)); tr.rotation.x = Math.PI / 2; tr.position.y = .36; ped.add(tr);
  cyl(ped, 1.62, 1.85, .75, metal(0x6b7280), { y: .72, seg: 8 });
  const uiTex = canvasTex(256, 160, (g, W, H) => { g.fillStyle = '#081a3a'; g.fillRect(0, 0, W, H); g.strokeStyle = '#7fd0ff'; g.lineWidth = 3; g.strokeRect(6, 6, W - 12, H - 12);
    for (let k = 0; k < 6; k++) { g.fillStyle = `rgba(127,208,255,${.3 + (k % 3) * .2})`; g.fillRect(18, 22 + k * 20, 40 + (k * 37) % 150, 8); } });
  for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2 + Math.PI / 8; if (Math.abs(Math.sin(a)) < .2 && Math.cos(a) > 0) continue;
    const s = new THREE.Mesh(new THREE.PlaneGeometry(.95, .5), new THREE.MeshBasicMaterial({ map: uiTex, toneMapped: false })); s.position.set(Math.sin(a) * 1.76, .74, Math.cos(a) * 1.76); s.rotation.y = a; s.rotation.x = 0; ped.add(s); }
  const welcome = new THREE.Mesh(new THREE.PlaneGeometry(1.3, .48), new THREE.MeshBasicMaterial({ toneMapped: false, map: canvasTex(600, 220, (g, W, H) => {
    g.fillStyle = '#0a1230'; g.fillRect(0, 0, W, H); g.strokeStyle = '#7fd0ff'; g.lineWidth = 6; g.strokeRect(5, 5, W - 10, H - 10);
    g.fillStyle = '#cfe9ff'; g.textAlign = 'center'; g.font = '600 40px "Helvetica Neue", sans-serif'; g.fillText('Welcome to', W / 2, 74); g.fillStyle = '#fff'; g.font = '900 100px "Helvetica Neue", sans-serif'; g.fillText('X·ARTS', W / 2, 175); }) }));
  welcome.position.set(0, .66, 1.79); ped.add(welcome);
  cyl(ped, 1.35, 1.45, .2, metal(0x4a5060), { y: 1.2, seg: 48 });
  const tr2 = new THREE.Mesh(new THREE.TorusGeometry(1.38, .03, 8, 96), glow(0x8fd4ff, 3)); tr2.rotation.x = Math.PI / 2; tr2.position.y = 1.31; ped.add(tr2);
  // 地球儀:半球網格 + 點狀大陸 + 經緯線
  const add = (c, o) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  const land = canvasTex(1024, 512, (g, W, H) => { g.fillStyle = '#000'; g.fillRect(0, 0, W, H); const rr = rand(8);
    for (let k = 0; k < 14; k++) { const cx = rr() * W, cy = H * .15 + rr() * H * .7, rx = 40 + rr() * 140, ry = 30 + rr() * 90; for (let d = 0; d < 260; d++) { const a = rr() * 7, q = Math.sqrt(rr()); g.fillStyle = '#9fe0ff'; g.fillRect(cx + Math.cos(a) * rx * q, cy + Math.sin(a) * ry * q, 3, 3); } } });
  const globe = group(ped, 0, 1.3, 0);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(1.25, 48, 24, 0, Math.PI * 2, 0, Math.PI / 2), add(0x3a9aff, .18)); globe.add(dome);
  const domeW = new THREE.Mesh(new THREE.SphereGeometry(1.26, 24, 10, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x8fd4ff, wireframe: true, transparent: true, opacity: .35, depthWrite: false })); globe.add(domeW);
  const lands = new THREE.Mesh(new THREE.SphereGeometry(1.2, 48, 24, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshBasicMaterial({ map: land, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide })); globe.add(lands);
  // 戰艦投影(在地球儀上方)
  const holo = group(ped, 0, 3.0, 0); holo.scale.setScalar(.58);
  const hM = add(0x4fa8ff, .12), hW = new THREE.MeshBasicMaterial({ color: 0x9fdcff, wireframe: true, transparent: true, opacity: .6, depthWrite: false });
  for (const [w, h, d, y, z] of [[1.1, .45, 3.2, 0, 0], [.9, .3, 2.2, .36, .3], [.6, .3, 1.3, .64, .45], [.35, .32, .55, .94, .5], [1.3, .9, .5, .15, 1.7]]) {
    const geo = new THREE.BoxGeometry(w, h, d); for (const m of [hM, hW]) { const mesh = new THREE.Mesh(geo, m); mesh.position.set(0, y, z); holo.add(mesh); } }
  const orbit = new THREE.Mesh(new THREE.TorusGeometry(1.6, .012, 6, 96), glow(0x8fd4ff, 2.2)); orbit.position.y = 2.3; orbit.rotation.x = Math.PI / 2 - .25; ped.add(orbit);
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.25, 1.6, 48, 1, true), add(0x5fb4ff, .05)); beam.position.y = 2.6; ped.add(beam);

  // ---------- 前方:PROJECTS / SKILLS 操控台 + 椅子、兩側沙發(左邊坐一隻橘貓)----------
  const holoScreen = (title, draw) => canvasTex(800, 420, (g, W, H) => { g.fillStyle = 'rgba(20,60,120,.35)'; g.fillRect(0, 0, W, H); g.strokeStyle = '#8fd4ff'; g.lineWidth = 6; g.strokeRect(4, 4, W - 8, H - 8);
    g.fillStyle = '#dff3ff'; g.font = '800 54px "Helvetica Neue", sans-serif'; g.fillText(title, 34, 76); draw(g, W, H); });
  const projTex = holoScreen('PROJECTS', (g) => rooms.slice(1).forEach((rm, k) => { g.fillStyle = hex(rm.cfg.accent); g.globalAlpha = .85; g.fillRect(34 + k * 150, 120, 132, 200); g.globalAlpha = 1; g.fillStyle = '#fff'; g.font = '600 22px "Helvetica Neue", sans-serif'; g.fillText(rm.title.split(' ')[0], 40 + k * 150, 350); }));
  const skillTex = holoScreen('SKILLS', (g) => ['3D', 'JS', 'C#', 'AI', 'UI', 'iOS'].forEach((s, k) => { const x = 110 + (k % 3) * 220, y = 190 + Math.floor(k / 3) * 130; g.strokeStyle = '#8fd4ff'; g.lineWidth = 5; g.beginPath(); g.arc(x, y, 50, 0, 7); g.stroke(); g.fillStyle = '#dff3ff'; g.font = '800 36px "Helvetica Neue", sans-serif'; g.textAlign = 'center'; g.fillText(s, x, y + 12); g.textAlign = 'left'; }));
  for (const [s, tex] of [[-1, projTex], [1, skillTex]]) {
    const c = group(root, s * 3.3, 0, 4.4, -s * .45);
    box(c, 2.3, .85, .85, metal(0x7d8494), { y: .43, r: .06 });
    box(c, 2.32, .32, .04, mat(0xb07a45, { roughness: .6 }), { y: .32, z: .43, r: .01 });
    const st = new THREE.Mesh(new THREE.BoxGeometry(2.2, .04, .03), glow(0xffb35c, 2.4)); st.position.set(0, .12, .44); c.add(st);
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(2.1, 1.1), new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false, side: THREE.DoubleSide, depthWrite: false })); scr.position.set(0, 1.45, -.05); scr.rotation.x = -.12; c.add(scr);
    for (const x of [-.95, .95]) cyl(c, .03, .03, .6, 0x9aa0ab, { x, y: 1.05, z: -.08 });
    const ch = group(c, 0, 0, 1.15, Math.PI);
    cyl(ch, .3, .34, .08, metal(0x6b7280), { y: .04 }); cyl(ch, .06, .06, .38, metal(0x9aa0ab), { y: .24 });
    box(ch, .62, .14, .6, 0xa9d3e6, { y: .48, r: .06 }); box(ch, .62, .6, .14, 0xa9d3e6, { y: .8, z: -.27, r: .06 });
  }
  for (const s of [-1, 1]) {
    const so = group(root, s * 6.3, 0, 3.5, -s * (Math.PI / 2 - .5));
    box(so, 2.1, .42, .9, 0x9fb4c8, { y: .32, r: .1 }); box(so, 2.1, .7, .28, 0x9fb4c8, { y: .7, z: -.38, r: .1 });
    for (const x of [-1.05, 1.05]) box(so, .26, .62, .9, 0x8aa0b6, { x, y: .4, r: .1 });
    for (const x of [-.48, .48]) box(so, .92, .14, .7, 0xb9cbdc, { x, y: .6, z: .05, r: .06 });
    box(so, 2.2, .14, .95, metal(0x5d6472), { y: .07, r: .03 });
    const sl = new THREE.Mesh(new THREE.BoxGeometry(2.1, .03, .03), glow(0xffb35c, 2)); sl.position.set(0, .05, .5); so.add(sl);
    if (s < 0) { const cat = group(so, -.45, .68, .05); const bd = sphere(cat, .3, 0xf0a25a); bd.scale.set(1, .85, .9); sphere(cat, .22, 0xf0a25a, { y: .34, z: .12 });
      for (const x of [-.12, .12]) { const e = new THREE.Mesh(new THREE.ConeGeometry(.07, .14, 8), mat(0xf0a25a)); e.position.set(x, .54, .1); cat.add(e); } sphere(cat, .1, 0xfff4e6, { y: .28, z: .3 }); }
    else { cyl(so, .22, .22, .05, metal(0x7d8494), { x: 1.5, y: .55, z: .2 }); cyl(so, .03, .03, .5, 0x9aa0ab, { x: 1.5, y: .28, z: .2 }); cyl(so, .06, .05, .12, 0xffffff, { x: 1.5, y: .64, z: .2 }); }
    leafyPlant(root, { x: s * 7.3, z: 1.4, pot: 0xdfe4ee, len: .9 });
    leafyPlant(root, { x: s * 4.9, z: 5.9, pot: 0xdfe4ee, len: .7, r: .24, h: .34 });
  }

  // ---------- 前半圈的玻璃欄杆 ----------
  const glassM = new THREE.MeshPhysicalMaterial({ color: 0xbfe4ff, roughness: .05, metalness: 0, transparent: true, opacity: .16, depthWrite: false, side: THREE.DoubleSide });
  const RR = HALL_R + .25, FB0 = 102 * Math.PI / 180, FB1 = 258 * Math.PI / 180, steps = 13;
  for (let k = 0; k <= steps; k++) {
    const b = FB0 + (FB1 - FB0) * k / steps;
    cyl(root, .05, .05, 1.0, metal(0xb9c2d0), { x: Math.sin(b) * RR, y: .5, z: -Math.cos(b) * RR, seg: 10 });
    if (k < steps) { const b2 = FB0 + (FB1 - FB0) * (k + .5) / steps, w = 2 * RR * Math.sin((FB1 - FB0) / steps / 2) - .1;
      const gp = new THREE.Mesh(new THREE.PlaneGeometry(w, .85), glassM); gp.position.set(Math.sin(b2) * RR, .48, -Math.cos(b2) * RR); gp.rotation.y = -b2; root.add(gp); }
  }
  const rail = ringSector(RR - .05, RR + .05, FB0, FB1, .06, metal(0xb9c2d0)); rail.position.y = 1.0; root.add(rail);
  const railGlow = ringSector(RR - .04, RR + .04, FB0, FB1, .02, glow(0x6cc6ff, 2)); railGlow.position.y = .96; root.add(railGlow);

  // ---------- 太空貓(穿太空衣,背對鏡頭看著艙門;滑鼠指到哪一艙就轉頭看哪一艙)----------
  const suit = mat(0xf4f6fa, { roughness: .5 }), fur = mat(0xffffff, { roughness: .8 });
  const astro = group(root, 0, 0, 5.4); const body = group(astro, 0, 0, 0);
  for (const x of [-.13, .13]) { const leg = new THREE.Mesh(new THREE.CapsuleGeometry(.1, .22, 4, 12), suit); leg.position.set(x, .2, 0); leg.castShadow = true; body.add(leg); }
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(.26, .3, 6, 16), suit); torso.position.y = .62; torso.castShadow = true; body.add(torso);
  for (const x of [-1, 1]) { const arm = new THREE.Mesh(new THREE.CapsuleGeometry(.08, .26, 4, 10), suit); arm.position.set(x * .33, .62, 0); arm.rotation.z = x * .25; body.add(arm); }
  box(body, .42, .44, .2, 0xc9d0dc, { y: .66, z: .26, r: .06 });
  const pack = new THREE.Mesh(new THREE.PlaneGeometry(.22, .14), glow(0x5fd0ff, 2.4)); pack.position.set(0, .72, .37); body.add(pack);
  const head = group(body, 0, 1.12, 0);
  sphere(head, .25, fur); for (const x of [-.13, .13]) { const e = new THREE.Mesh(new THREE.ConeGeometry(.08, .16, 10), fur); e.position.set(x, .22, 0); head.add(e); }
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(.36, 32, 20), new THREE.MeshPhysicalMaterial({ color: 0xdff3ff, roughness: .05, transparent: true, opacity: .22, depthWrite: false })); head.add(helmet);
  const collar = new THREE.Mesh(new THREE.TorusGeometry(.22, .05, 8, 24), suit); collar.rotation.x = Math.PI / 2; collar.position.y = -.27; head.add(collar);
  const tailCurve = new THREE.CatmullRomCurve3([V(0, .35, .22), V(.05, .25, .45), V(.2, .4, .6), V(.24, .65, .55)]);
  const tail = new THREE.Mesh(new THREE.TubeGeometry(tailCurve, 20, .05, 8), fur); body.add(tail);
  astro.scale.setScalar(1.25);
  function V(x, y, z) { return new THREE.Vector3(x, y, z); }

  // 燈:大廳頂燈 + 投影台的藍光
  const lamp = new THREE.PointLight(0xe8f2ff, 8, 18, 1.4); lamp.position.set(0, 6, 0); root.add(lamp);
  const holoLight = new THREE.PointLight(0x6cc6ff, 10, 7, 1.6); holoLight.position.set(0, 2.2, .2); root.add(holoLight);

  let look = 0;
  return {
    root, doors, hits: doors.map((d) => d.hit),
    update(t, dt) {
      lands.rotation.y = t * .15; domeW.rotation.y = t * .15; holo.rotation.y = -t * .3; holo.position.y = 3.0 + Math.sin(t * 1.2) * .06;
      orbit.rotation.z = t * .4; tr2.material.emissiveIntensity = 2.4 + Math.sin(t * 2) * .6;
      let target = 0, hv = 0;
      for (const d of doors) {
        const k = Math.max(d.hover, d.open);
        d.edgeM.emissiveIntensity = 2.4 + k * 3 + Math.sin(t * 3 + d.i) * .3 * d.hover;
        d.lineM.emissiveIntensity = 1.6 + k * 2.6;
        d.arrow.position.z = HALL_R - 4.7 + Math.sin(t * 3) * .12 * d.hover;
        if (d.hover > hv) { hv = d.hover; target = d.b; }
      }
      look += ((hv > .2 ? target : Math.sin(t * .3) * .5) - look) * Math.min(1, dt * 3);
      astro.rotation.y = -look * .8; head.rotation.y = -look * .4;
      body.position.y = Math.abs(Math.sin(t * 1.6)) * .03; tail.rotation.z = Math.sin(t * 2.2) * .15;
    },
  };
}

// 機庫 → 通道:八角形的長走道(艙壁面板、每隔一段一圈肋骨、天花板燈、地上兩條藍燈),兩道會滑開的艙門
export function createCorridor(scene) {
  const root = new THREE.Group(); scene.add(root);
  scene.fog = new THREE.Fog(0x0a0f1e, 12, 52);
  const L = 70, R = 3.0;
  const wt = panelTex('#dfe4ee', 'rgba(70,80,120,.3)', 1024, 1024, 4, 4); wt.repeat.set(2, 18);
  const tube = new THREE.Mesh(new THREE.CylinderGeometry(R, R, L, 8, 1, true), new THREE.MeshStandardMaterial({ map: wt, roughness: .6, side: THREE.BackSide }));
  tube.rotation.set(Math.PI / 2, 0, 0); tube.rotateY(Math.PI / 8); tube.position.z = -L / 2 + 16; tube.receiveShadow = true; root.add(tube);
  const ap = R * Math.cos(Math.PI / 8);
  const ft = panelTex('#5a6378', 'rgba(20,24,36,.6)', 512, 1024, 2, 8); ft.repeat.set(1, 10);
  box(root, 2.4, .06, L, new THREE.MeshStandardMaterial({ map: ft, roughness: .5, metalness: .5 }), { y: -ap + .03, z: -L / 2 + 16, r: 0, shadow: false });
  for (const x of [-1.25, 1.25]) { const s = new THREE.Mesh(new THREE.BoxGeometry(.07, .05, L), glow(0x5fb4ff, 2.6)); s.position.set(x, -ap + .06, -L / 2 + 16); root.add(s); }
  const ribM = mat(0xb9c4dc, { roughness: .4, metalness: .4 });
  for (let z = 14; z > -L + 16; z -= 4) {
    const rib = new THREE.Mesh(new THREE.TorusGeometry(R - .05, .16, 6, 8), ribM); rib.rotation.z = Math.PI / 8; rib.position.z = z; root.add(rib);
    const lt = new THREE.Mesh(new THREE.BoxGeometry(1.2, .06, .3), glow(0xfff2dc, 3)); lt.position.set(0, ap - .05, z - 2); root.add(lt);
    for (const s of [-1, 1]) { const w = new THREE.Mesh(new THREE.BoxGeometry(.04, .5, 1.2), glow(0x9fd6ff, 1.2)); w.position.set(s * (ap - .03), .4, z - 2); root.add(w); }
  }
  // 艙門:八角框 + 左右兩片門板(往兩邊滑開)
  function door(z, color) {
    const g = group(root, 0, 0, z);
    const frame = new THREE.Mesh(new THREE.TorusGeometry(R - .2, .35, 6, 8), mat(0x8c96ad, { metalness: .5, roughness: .35 })); frame.rotation.z = Math.PI / 8; g.add(frame);
    const edge = new THREE.Mesh(new THREE.TorusGeometry(R - .55, .03, 4, 8), glow(color, 2.6)); edge.rotation.z = Math.PI / 8; g.add(edge);
    const panels = [-1, 1].map((s) => {
      const p = group(g, 0, 0, 0);
      box(p, R - .1, (R - .2) * 2, .2, 0xe8ecf4, { x: s * (R - .1) / 2, r: .04 });
      const st = new THREE.Mesh(new THREE.BoxGeometry(.08, R * 1.2, .02), glow(color, 2)); st.position.set(s * .15, 0, .12); p.add(st);
      return { p, s };
    });
    return { set(k) { panels.forEach(({ p, s }) => { p.position.x = s * k * (R - .1); }); } };
  }
  const d1 = door(0, 0x6cc6ff), d2 = door(-44, 0xffb35c);
  // 走道盡頭的光(大廳)
  const endGlow = new THREE.Mesh(new THREE.PlaneGeometry(6, 6), new THREE.MeshBasicMaterial({ color: 0xeaf4ff, toneMapped: false })); endGlow.position.z = -48; root.add(endGlow);
  scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x2a2f48, 1.1));
  for (const z of [8, -8, -24, -40]) { const l = new THREE.PointLight(0xffeedd, 14, 18, 1.5); l.position.set(0, 1.8, z); root.add(l); }
  const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  return {
    root, START: 13, END: -47,
    // 依鏡頭目前的 z 開門(靠近時滑開)
    update(camZ) { d1.set(smooth(9, 3, camZ)); d2.set(smooth(-33, -39, camZ)); },
  };
}
