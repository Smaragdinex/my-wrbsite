// 艦內:①機庫 → 通道(鏡頭穿過兩道會滑開的艙門)②中央大廳(照使用者給的參考圖,像《劍星》那種亮白科幻空間):
// 鏡頭站在入口平視;亮面白地板(真的反射)、暖白燈條、圓頂天花板一圈大窗 + 天窗看得到地球、中央吊柱;
// 後半圈五個圓角門洞(白色招牌、裡面是該艙的縮影)、中央地上的光環 + 發光地球儀 + 戰艦投影、圓沙發、會被風吹動的盆栽、自己到處跑的打掃機器人。
import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { mat, glow, box, cyl, sphere, group, panelTex, leafyPlant, swayPlant, rand } from './kit.mjs?v=3';

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

const SUB = { kitty: 'Web · iOS', stocks: 'Board Game', ocean: 'iOS Game', planet: 'Three.js', rails: 'Track Puzzle' };

// ---------- 艙口裡的縮影:後牆的畫 + 幾件立體小道具 ----------
const BACK = {
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
  if (key === 'kitty') { box(R, 1.0, .06, .5, 0xffffff, { x: .35, y: .62, z: -2.1 }); for (const x of [-.05, .75]) cyl(R, .025, .025, .6, 0xf2b8c9, { x, y: .3, z: -2.1 });
    box(R, .42, .06, .42, 0xff8fb0, { x: .35, y: .4, z: -1.5, r: .04 }); box(R, .42, .45, .06, 0xff8fb0, { x: .35, y: .62, z: -1.3, r: .03 });
    const pouf = cyl(R, .24, .26, .3, 0xffd59a, { x: -.6, y: .15, z: -1.6 }); cyl(R, .22, .22, .04, 0xfff2c4, { x: -.6, y: .32, z: -1.6 }); }
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
  const l = new THREE.PointLight(acc, 3, 4.2, 1.6); l.position.set(0, 2.1, -1.2); R.add(l);
}

export const HALL_R = 8;
const DOOR_W = 2.4, DOOR_H = 2.75, WALL_H = 5.4, ALC_D = 3.0, CEIL_Y = WALL_H + 3.0;

// 圓角矩形路徑(門框、燈條用)
function rrect(p, x, y, w, h, r) { p.moveTo(x + r, y); p.lineTo(x + w - r, y); p.quadraticCurveTo(x + w, y, x + w, y + r); p.lineTo(x + w, y + h - r); p.quadraticCurveTo(x + w, y + h, x + w - r, y + h); p.lineTo(x + r, y + h); p.quadraticCurveTo(x, y + h, x, y + h - r); p.lineTo(x, y + r); p.quadraticCurveTo(x, y, x + r, y); return p; }
// 一圈框:外圓角矩形挖掉內圓角矩形,沿 z 擠出
function frameGeo(ow, oh, iw, ih, r, depth, oy = 0) {
  const s = rrect(new THREE.Shape(), -ow / 2, oy, ow, oh, r); s.holes.push(rrect(new THREE.Path(), -iw / 2, oy + (oh - ih) / 2, iw, ih, r * .8));
  return new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelThickness: .03, bevelSize: .03, bevelSegments: 2, curveSegments: 10 });
}
// 窗外:星空 + 星雲 + 一顆藍色行星(地球)的一角
function spaceView(W, H, { planet = null, seed = 1 } = {}) {
  return canvasTex(W, H, (g) => {
    const r = rand(seed), bg = g.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, '#060a1c'); bg.addColorStop(1, '#0d1638'); g.fillStyle = bg; g.fillRect(0, 0, W, H);
    for (let k = 0; k < 6; k++) { const x = r() * W, y = r() * H, rr = 80 + r() * 200, gr = g.createRadialGradient(x, y, 0, x, y, rr); gr.addColorStop(0, `rgba(${90 + r() * 80 | 0},${90 + r() * 60 | 0},200,.22)`); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(x - rr, y - rr, rr * 2, rr * 2); }
    for (let k = 0; k < W * H / 900; k++) { g.fillStyle = `rgba(255,255,255,${.25 + r() * .75})`; const s = r() < .95 ? 1.4 : 2.6; g.fillRect(r() * W, r() * H, s, s); }
    if (planet) { const [px, py, pr] = planet;
      const gr = g.createRadialGradient(px - pr * .35, py - pr * .35, pr * .1, px, py, pr); gr.addColorStop(0, '#9fd2ff'); gr.addColorStop(.55, '#2f6fd0'); gr.addColorStop(1, '#0a2050');
      g.fillStyle = gr; g.beginPath(); g.arc(px, py, pr, 0, Math.PI * 2); g.fill();
      g.save(); g.beginPath(); g.arc(px, py, pr, 0, Math.PI * 2); g.clip();
      for (let k = 0; k < 40; k++) { g.strokeStyle = `rgba(255,255,255,${.15 + r() * .35})`; g.lineWidth = 4 + r() * 14; g.beginPath(); const a = r() * 7, d = r() * pr; g.arc(px + Math.cos(a) * d, py + Math.sin(a) * d, 20 + r() * pr * .5, r() * 6, r() * 6 + 1.2); g.stroke(); }
      for (let k = 0; k < 14; k++) { g.fillStyle = `rgba(70,140,90,${.35 + r() * .3})`; g.beginPath(); g.ellipse(px + (r() - .5) * pr * 1.4, py + (r() - .5) * pr * 1.4, 30 + r() * 90, 20 + r() * 60, r() * 3, 0, 7); g.fill(); }
      const sh = g.createLinearGradient(px - pr, py - pr, px + pr, py + pr); sh.addColorStop(.45, 'rgba(0,0,10,0)'); sh.addColorStop(1, 'rgba(0,0,10,.75)'); g.fillStyle = sh; g.fillRect(px - pr, py - pr, pr * 2, pr * 2); g.restore();
      g.strokeStyle = 'rgba(140,200,255,.55)'; g.lineWidth = 10; g.beginPath(); g.arc(px, py, pr + 4, 0, Math.PI * 2); g.stroke(); }
  });
}
// 門上的招牌(白色面板上的深灰字:大大的編號 + 名稱 + 副標)
function signTex(room, i) {
  return canvasTex(1024, 340, (g, W, H) => {
    g.fillStyle = '#3a3f4a'; g.font = '200 190px "Helvetica Neue", sans-serif'; g.textBaseline = 'middle'; g.fillText(String(i + 1).padStart(2, '0'), 40, H / 2 + 8);
    const t = room.title.toUpperCase(); g.font = '500 92px "Helvetica Neue", sans-serif';
    const fs = Math.min(92, 92 * (W - 330) / g.measureText(t).width); g.font = `500 ${fs | 0}px "Helvetica Neue", sans-serif`; g.fillText(t, 300, H / 2 - 38);
    g.fillStyle = '#7a808c'; g.font = '500 52px "Helvetica Neue", sans-serif'; g.fillText((SUB[room.key] || room.tag).toUpperCase(), 302, H / 2 + 62);
    g.fillStyle = hex(room.cfg.accent); g.fillRect(300, H / 2 + 8, 70, 7);
  });
}

export function createHall(scene, rooms) {
  const root = new THREE.Group(); scene.add(root);
  scene.background = new THREE.Color(0x0a0c14);
  const n = rooms.length, span = 150 * Math.PI / 180;
  const bearings = rooms.map((_, i) => -span / 2 + span * (i + .5) / n);
  // 色票:Cloud Dancer 亮面白為主;暖白燈條
  const CD = 0xf0eee9, CD2 = 0xe4e0d8, CD3 = 0xd3cdc2, WARM = 0xffd9a8;
  const gloss = (c, rough = .22) => new THREE.MeshStandardMaterial({ color: c, roughness: rough, metalness: .04, envMapIntensity: 1.1 });
  const warmM = (i = 2.6) => glow(WARM, i);
  const plants = [], plant = (parent, o) => { const p = leafyPlant(parent, o); plants.push(p); return p; };
  const at = (b, r, y = 0) => new THREE.Vector3(Math.sin(b) * r, y, -Math.cos(b) * r);

  // ---------- 亮面白地板(真的會反射):反射鏡面 + 上面一層半透明的白 ----------
  const dpr = Math.min(devicePixelRatio, 2), small = innerWidth < 700;
  const mirror = new Reflector(new THREE.CircleGeometry(HALL_R + .5, 96), { clipBias: .003, color: 0x8a8a8a,
    textureWidth: innerWidth * dpr * (small ? .35 : .5), textureHeight: innerHeight * dpr * (small ? .35 : .5) });
  mirror.rotation.x = -Math.PI / 2; root.add(mirror);
  const floor = new THREE.Mesh(new THREE.CircleGeometry(HALL_R + .5, 96), new THREE.MeshStandardMaterial({ color: CD, roughness: .16, metalness: 0, transparent: true, opacity: .72 }));
  floor.rotation.x = -Math.PI / 2; floor.position.y = .01; floor.receiveShadow = true; root.add(floor);
  for (const [r0, r1] of [[4.85, 4.9], [6.75, 6.8]]) { const m = new THREE.Mesh(new THREE.RingGeometry(r0, r1, 128), mat(0xa9a499, { roughness: .3, metalness: .6 })); m.rotation.x = -Math.PI / 2; m.position.y = .015; root.add(m); }

  // ---------- 艙壁:一整圈亮白牆(後半圈開六個門洞),牆腳 / 牆頂暖光燈條 ----------
  const wallM = new THREE.MeshStandardMaterial({ map: panelTex('#f0eee9', 'rgba(150,138,120,.13)', 1024, 1024, 3, 2), roughness: .3, metalness: .04 });
  const half = (DOOR_W / 2 + .5) / HALL_R;
  const segs = [];                                                     // 門與門之間各一段,最後一段從最後一道門繞過前半圈回到第一道門
  let prev = bearings[0] + half;
  for (const b of bearings.slice(1)) { segs.push([prev, b - half]); prev = b + half; }
  segs.push([prev, bearings[0] - half + Math.PI * 2]);
  for (const [b0, b1] of segs) if (b1 > b0) root.add(ringSector(HALL_R, HALL_R + .5, b0, b1, WALL_H, wallM));
  for (const b of bearings) { const lin = ringSector(HALL_R, HALL_R + .5, b - half, b + half, WALL_H - DOOR_H - .45, wallM); lin.position.y = DOOR_H + .45; root.add(lin); }
  for (const [y, h, m] of [[0, .3, gloss(CD3)], [WALL_H - .05, .1, gloss(CD2)]]) { const s = ringSector(HALL_R - .08, HALL_R, -Math.PI, Math.PI, h, m); s.position.y = y; root.add(s); }
  for (const y of [.32, WALL_H - .3]) { const s = ringSector(HALL_R - .1, HALL_R - .06, -Math.PI, Math.PI, .04, warmM(2.4)); s.position.y = y; root.add(s); }
  // 門與門之間(和前半圈)的柱子:圓角白柱 + 一道直的暖光 + 柱腳白色花盆
  const pillarB = [];
  for (let k = 0; k <= n; k++) pillarB.push(bearings[0] - span / n / 2 + span / n * k);
  for (let k = 1; k < 6; k++) if (k !== 3) pillarB.push(span / 2 + (Math.PI * 2 - span) * k / 6);   // 正前方(鏡頭站的位置)不放柱子
  pillarB.forEach((b, k) => {
    const p = group(root, Math.sin(b) * (HALL_R - .25), 0, -Math.cos(b) * (HALL_R - .25), -b);
    box(p, .7, WALL_H, .5, gloss(CD), { y: WALL_H / 2, r: .12 });
    const s = new THREE.Mesh(new THREE.BoxGeometry(.06, WALL_H - 1.2, .02), warmM(2.8)); s.position.set(0, WALL_H / 2 + .2, .26); p.add(s);
    if (k <= n) { box(p, .8, .55, .7, gloss(0xffffff), { y: .28, z: .75, r: .1 }); plant(p, { y: .55, z: .75, r: .26, h: .2, pot: 0xffffff, len: .75, n: 12 }); }
  });

  // ---------- 五個門洞:圓角白門框 + 內圈暖光 + 招牌面板 + 艙內縮影 ----------
  const doors = rooms.map((room, i) => {
    const b = bearings[i], acc = room.cfg.accent, cfg = room.cfg;
    const g = group(root, Math.sin(b) * HALL_R, 0, -Math.cos(b) * HALL_R, -b);
    const fr = new THREE.Mesh(frameGeo(DOOR_W + .9, DOOR_H + .5, DOOR_W, DOOR_H + .1, .45, .55, -.05), gloss(CD)); fr.position.z = -.05; fr.castShadow = true; g.add(fr);
    const lineM = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: WARM, emissiveIntensity: 2.6 });
    const ln = new THREE.Mesh(frameGeo(DOOR_W + .22, DOOR_H + .17, DOOR_W + .06, DOOR_H + .06, .4, .02, 0), lineM); ln.position.z = .53; g.add(ln);
    // 招牌:白色面板 + 字 + 下緣暖光
    const sg = group(g, 0, DOOR_H + 1.25, .3);
    box(sg, 3.2, 1.05, .16, gloss(0xfbfaf7), { r: .12 });
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(3.0, 1.0), new THREE.MeshBasicMaterial({ map: signTex(room, i), transparent: true })); sign.position.z = .085; sg.add(sign);
    const sl = new THREE.Mesh(new THREE.BoxGeometry(2.9, .035, .03), warmM(2.6)); sl.position.set(0, -.56, .07); sg.add(sl);
    // 艙內(往牆外凸出):白色內壁 + 天花板燈 + 該艙的後牆畫 + 小道具 + 燈
    const R = group(g, 0, 0, 0);
    const floorC = { kitty: 0xf6d6e0, stocks: 0xdfe8e6, ocean: 0xe9d6a8, planet: 0x3a2466, rails: 0xd9b88f }[room.key] ?? 0xeeeeee;
    box(R, DOOR_W + .4, .06, ALC_D, gloss(floorC, .3), { y: .03, z: -ALC_D / 2, r: 0, shadow: false });
    const inner = gloss(new THREE.Color(CD2).lerp(new THREE.Color(cfg.wall), .25).getHex(), .4);
    for (const x of [-1, 1]) box(R, .1, DOOR_H + .4, ALC_D, inner, { x: x * (DOOR_W / 2 + .25), y: (DOOR_H + .4) / 2, z: -ALC_D / 2, r: 0 });
    box(R, DOOR_W + .6, .1, ALC_D + .2, gloss(CD), { y: DOOR_H + .42, z: -ALC_D / 2, r: 0 });
    const cl = new THREE.Mesh(new THREE.PlaneGeometry(DOOR_W - .3, .25), warmM(2.2)); cl.rotation.x = Math.PI / 2; cl.position.set(0, DOOR_H + .36, -ALC_D / 2); R.add(cl);
    const bt = canvasTex(512, 512, (cx, W, H) => BACK[room.key](cx, W, H, rand(i + 3)));
    const back = new THREE.Mesh(new THREE.PlaneGeometry(DOOR_W + .4, DOOR_H + .4), new THREE.MeshStandardMaterial({ map: bt, emissiveMap: bt, emissive: 0xffffff, emissiveIntensity: .55, roughness: .8 }));
    back.position.set(0, (DOOR_H + .4) / 2, -ALC_D + .02); R.add(back);
    props(R, room.key, new THREE.Color(acc).lerp(new THREE.Color(WARM), .5).getHex());
    box(g, DOOR_W + .3, .08, .8, gloss(CD2), { y: .04, z: .7, r: .03, shadow: false });     // 門口的小平台
    const hit = new THREE.Mesh(new THREE.BoxGeometry(3.2, 5.2, 2.2), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })); hit.position.set(0, 2.6, .3); g.add(hit);
    hit.userData.door = i;
    return { i, b, g, edgeM: lineM, lineM, hit, open: 0, hover: 0, acc: new THREE.Color(acc), world: (dist = 0, y = 1.5) => g.localToWorld(new THREE.Vector3(0, y, dist)) };
  });

  // ---------- 天花板:一圈斜的大窗(看得到太空和地球)+ 頂上的圓形天窗 + 放射狀的樑 + 中央吊柱 ----------
  const winTex = (() => {
    const W = 2048, H = 512, sky = spaceView(W, H, { seed: 5 }).image;
    return canvasTex(W, H, (g) => { g.fillStyle = '#f0eee9'; g.fillRect(0, 0, W, H); const N = 16, ww = W / N;
      for (let k = 0; k < N; k++) { g.save(); g.beginPath(); g.roundRect(k * ww + 14, 40, ww - 28, H - 80, 26); g.clip(); g.drawImage(sky, 0, 0); g.restore();
        g.strokeStyle = '#ffd9a8'; g.lineWidth = 5; g.beginPath(); g.roundRect(k * ww + 10, 36, ww - 20, H - 72, 28); g.stroke(); } });
  })();
  const clere = new THREE.Mesh(new THREE.CylinderGeometry(5.6, HALL_R + .5, 3.0, 64, 1, true), new THREE.MeshStandardMaterial({ map: winTex, emissiveMap: winTex, emissive: 0xffffff, emissiveIntensity: .2, roughness: .3, side: THREE.BackSide }));
  clere.position.y = WALL_H + 1.5; root.add(clere);
  const ceil = new THREE.Mesh(new THREE.RingGeometry(3.0, 5.62, 96), gloss(CD)); ceil.rotation.x = Math.PI / 2; ceil.position.y = CEIL_Y; root.add(ceil);
  for (let k = 0; k < 12; k++) { const b = k / 12 * Math.PI * 2, p = group(root, 0, 0, 0, -b);
    box(p, .3, .25, 2.7, gloss(CD2), { y: CEIL_Y - .12, z: -4.3, r: .06 });
    const l = new THREE.Mesh(new THREE.BoxGeometry(.06, .02, 2.5), warmM(2.6)); l.position.set(0, CEIL_Y - .25, -4.3); p.add(l); }
  const ocu = new THREE.Mesh(new THREE.CircleGeometry(3.0, 64), new THREE.MeshBasicMaterial({ map: spaceView(1024, 1024, { planet: [380, 420, 330], seed: 9 }) }));
  ocu.rotation.x = Math.PI / 2; ocu.position.y = CEIL_Y + .4; root.add(ocu);
  const ocuF = new THREE.Mesh(new THREE.TorusGeometry(3.0, .22, 16, 96), gloss(CD)); ocuF.rotation.x = Math.PI / 2; ocuF.position.y = CEIL_Y + .1; root.add(ocuF);
  const ocuL = new THREE.Mesh(new THREE.TorusGeometry(2.8, .03, 8, 96), warmM(3)); ocuL.rotation.x = Math.PI / 2; ocuL.position.y = CEIL_Y - .05; root.add(ocuL);
  const topRing = new THREE.Mesh(new THREE.TorusGeometry(HALL_R + .2, .05, 8, 128), warmM(2.6)); topRing.rotation.x = Math.PI / 2; topRing.position.y = WALL_H + .02; root.add(topRing);
  // 中央吊柱(從天窗中間垂下來,底部是投影發射器)
  for (const [y0, y1, rr] of [[CEIL_Y + .4, 6.4, .34]]) { cyl(root, rr, rr, y0 - y1, gloss(CD), { y: (y0 + y1) / 2, seg: 24 });
    for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2, l = new THREE.Mesh(new THREE.BoxGeometry(.04, y0 - y1 - .6, .04), warmM(2.8)); l.position.set(Math.sin(a) * (rr + .01), (y0 + y1) / 2, Math.cos(a) * (rr + .01)); root.add(l); } }
  cyl(root, .55, .3, .4, gloss(CD), { y: 6.25, seg: 32 });
  const emit = new THREE.Mesh(new THREE.TorusGeometry(.62, .035, 8, 64), glow(0x6cc6ff, 3.2)); emit.rotation.x = Math.PI / 2; emit.position.y = 6.05; root.add(emit);
  const emitRing = new THREE.Mesh(new THREE.TorusGeometry(1.15, .012, 6, 96), glow(0x8fd4ff, 2.6)); emitRing.rotation.x = Math.PI / 2; emitRing.position.y = 6.0; root.add(emitRing);

  // ---------- 中央:平的地板,只用嵌在地上的光環分區 + 發光地球儀 + 戰艦投影 ----------
  const ped = group(root, 0, 0, 0);
  const inlay = (r0, r1, m, y = .02) => { const g = new THREE.Mesh(new THREE.RingGeometry(r0, r1, 160), m); g.rotation.x = -Math.PI / 2; g.position.y = y; ped.add(g); return g; };
  inlay(4.3, 4.36, warmM(2.8)); inlay(3.62, 3.67, warmM(2.8)); inlay(3.67, 4.3, gloss(CD2, .2), .016);   // 兩圈暖光之間是一圈淡一點的地板
  for (let k = 0; k < 36; k++) { const b = k / 36 * Math.PI * 2, l = new THREE.Mesh(new THREE.PlaneGeometry(.04, .5), warmM(1.8)); l.rotation.x = -Math.PI / 2; l.rotation.z = -b; const p = at(b, 3.98, .022); l.position.copy(p); ped.add(l); }
  const padTex = canvasTex(512, 512, (g, W) => { g.fillStyle = '#0c1a36'; g.fillRect(0, 0, W, W); g.strokeStyle = 'rgba(127,208,255,.7)';
    for (let k = 1; k < 9; k++) { g.lineWidth = k % 3 ? 2 : 5; g.beginPath(); g.arc(W / 2, W / 2, k * 28, 0, Math.PI * 2); g.stroke(); }
    for (let k = 0; k < 24; k++) { const a = k / 24 * Math.PI * 2; g.beginPath(); g.moveTo(W / 2 + Math.cos(a) * 60, W / 2 + Math.sin(a) * 60); g.lineTo(W / 2 + Math.cos(a) * 250, W / 2 + Math.sin(a) * 250); g.stroke(); } });
  const pad = new THREE.Mesh(new THREE.CircleGeometry(2.0, 64), new THREE.MeshBasicMaterial({ map: padTex, toneMapped: false })); pad.rotation.x = -Math.PI / 2; pad.position.y = .024; ped.add(pad);
  const r3 = new THREE.Mesh(new THREE.TorusGeometry(2.02, .04, 8, 96), glow(0x6cc6ff, 3)); r3.rotation.x = Math.PI / 2; r3.position.y = .03; ped.add(r3);
  // 地球儀:藍色光球 + 亮的大陸 + 細經緯線 + 光暈
  const land = canvasTex(1024, 512, (g, W, H) => { g.fillStyle = '#000'; g.fillRect(0, 0, W, H); const rr = rand(8);
    g.fillStyle = '#fff';                                                  // 點狀的大陸(一團團小點,不是大色塊)
    for (let k = 0; k < 12; k++) { const cx = rr() * W, cy = H * .2 + rr() * H * .6, rx = 40 + rr() * 110, ry = 25 + rr() * 70;
      for (let d = 0; d < 420; d++) { const a = rr() * 7, q = Math.sqrt(rr()); g.fillRect(cx + Math.cos(a) * rx * q, cy + Math.sin(a) * ry * q, 4, 4); } }
    g.globalAlpha = .5; for (let y = 0; y < H; y += 32) g.fillRect(0, y, W, 2); for (let x = 0; x < W; x += 64) g.fillRect(x, 0, 2, H); });
  const globe = group(ped, 0, 1.45, 0); globe.scale.setScalar(.82);
  globe.add(new THREE.Mesh(new THREE.SphereGeometry(1.05, 48, 32), new THREE.MeshBasicMaterial({ color: 0x1d4fa8, transparent: true, opacity: .8 })));
  const lands = new THREE.Mesh(new THREE.SphereGeometry(1.07, 48, 32), new THREE.MeshBasicMaterial({ color: new THREE.Color(0x9fdcff).multiplyScalar(1.6), alphaMap: land, transparent: true, depthWrite: false, toneMapped: false })); globe.add(lands);
  const wire = new THREE.Mesh(new THREE.SphereGeometry(1.1, 24, 16), new THREE.MeshBasicMaterial({ color: 0x9fdcff, wireframe: true, transparent: true, opacity: .25, depthWrite: false, toneMapped: false })); globe.add(wire);
  const haloT = canvasTex(256, 256, (g) => { const gr = g.createRadialGradient(128, 128, 40, 128, 128, 128); gr.addColorStop(0, 'rgba(120,190,255,.9)'); gr.addColorStop(1, 'rgba(120,190,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 256, 256); });
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloT, transparent: true, opacity: .35, depthWrite: false, blending: THREE.AdditiveBlending })); halo.scale.setScalar(3.2); globe.add(halo);
  const orbA = new THREE.Mesh(new THREE.TorusGeometry(1.55, .012, 6, 96), glow(0x8fd4ff, 2.6)); orbA.rotation.x = Math.PI / 2 - .35; globe.add(orbA);
  const orbB = new THREE.Mesh(new THREE.TorusGeometry(1.75, .01, 6, 96), glow(0x8fd4ff, 2.2)); orbB.rotation.x = Math.PI / 2 + .5; orbB.rotation.y = .6; globe.add(orbB);
  const holo = group(ped, 0, 2.6, 0); holo.scale.setScalar(.42);
  const hW = new THREE.MeshBasicMaterial({ color: 0x9fdcff, wireframe: true, transparent: true, opacity: .75, depthWrite: false, toneMapped: false }), hM = new THREE.MeshBasicMaterial({ color: 0x5aaef5, transparent: true, opacity: .12, depthWrite: false });
  for (const [w, h, d, y, z] of [[1.1, .45, 3.2, 0, 0], [.9, .3, 2.2, .36, .3], [.6, .3, 1.3, .64, .45], [.35, .32, .55, .94, .5], [1.3, .9, .5, .15, 1.7]]) {
    const geo = new THREE.BoxGeometry(w, h, d); for (const m of [hM, hW]) { const mesh = new THREE.Mesh(geo, m); mesh.position.set(0, y, z); holo.add(mesh); } }
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(.55, 1.0, 3.4, 48, 1, true), new THREE.MeshBasicMaterial({ color: 0x8cc8ff, transparent: true, opacity: .035, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
  beam.position.y = 4.3; root.add(beam);

  // ---------- 入口兩側的大花盆 ----------
  for (const s of [-1, 1]) { box(root, 1.0, .7, 1.0, gloss(0xffffff), { x: s * 3.6, y: .35, z: 5.6, r: .12 }); plant(root, { x: s * 3.6, y: .7, z: 5.6, r: .32, h: .2, pot: 0xffffff, len: 1.0, n: 14 }); }

  // ---------- 圓形沙發(兩側) ----------
  const sofaM = gloss(CD2, .85), cushM = gloss(0xfaf8f4, .9);
  for (const s of [-1, 1]) {
    const px = s * 5.7, pz = 1.2, so = group(root, px, 0, pz, Math.atan2(-px, -pz));
    cyl(so, 1.12, 1.12, .12, gloss(CD3), { y: .06, seg: 48 });
    const ringL = new THREE.Mesh(new THREE.TorusGeometry(1.1, .025, 6, 64), warmM(2.4)); ringL.rotation.x = Math.PI / 2; ringL.position.y = .03; so.add(ringL);
    cyl(so, 1.05, 1.08, .3, sofaM, { y: .27, seg: 48 }); cyl(so, .98, .98, .14, cushM, { y: .48, seg: 48 });
    const rim = new THREE.Mesh(new THREE.TorusGeometry(.98, .07, 10, 64), cushM); rim.rotation.x = Math.PI / 2; rim.position.y = .48; so.add(rim);
    const backArc = 210 * Math.PI / 180;
    const back = ringSector(.8, 1.08, -backArc / 2, backArc / 2, .42, sofaM); back.position.y = .42; so.add(back);
    const top = new THREE.Mesh(new THREE.TorusGeometry(.94, .14, 12, 64, backArc), cushM); top.rotation.x = Math.PI / 2; top.rotation.z = -Math.PI / 2 - backArc / 2; top.position.y = .86; so.add(top);
    for (let k = -2; k <= 2; k++) { const b = k * .42, pil = sphere(so, .24, [0x7fb8e6, 0xf2c79d, 0xffffff, 0xf2c79d, 0x7fb8e6][k + 2], { x: Math.sin(b) * .62, y: .72, z: -Math.cos(b) * .62 }); pil.scale.set(1, .8, .5); pil.rotation.y = -b; }
  }

  // ---------- 打掃機器人:圓形白色掃地機,上面一個小圓頂 + 兩顆藍色 LED 眼睛,側刷會轉;
  // 在中央光環和牆之間的那圈地板上自己逛:挑下一個點(離現在的方位角不太遠、避開沙發和花盆)→ 轉向 → 走過去 → 偶爾停一下
  const bot = group(root, 0, 0, 0), botBody = group(bot, 0, 0, 0);
  cyl(botBody, .4, .42, .13, gloss(0xfbfaf7, .25), { y: .085, seg: 48 });
  cyl(botBody, .3, .34, .05, gloss(CD2, .3), { y: .17, seg: 48 });
  const dome = sphere(botBody, .21, new THREE.MeshStandardMaterial({ color: 0x1a2440, roughness: .08, metalness: .2, envMapIntensity: 1.4 }), { y: .19 }); dome.scale.set(1, .6, 1);   // 深色玻璃面罩,眼睛在上面
  const bump = new THREE.Mesh(new THREE.TorusGeometry(.42, .035, 8, 64), gloss(0x5a6070, .35)); bump.rotation.x = Math.PI / 2; bump.position.y = .07; botBody.add(bump);
  const ledRing = new THREE.Mesh(new THREE.TorusGeometry(.31, .016, 6, 64), glow(0x4fb4ff, 3.2)); ledRing.rotation.x = Math.PI / 2; ledRing.position.y = .2; botBody.add(ledRing);
  const eyeM = glow(0x7fd8ff, 3.2), eyes = [-1, 1].map((x) => { const e = new THREE.Mesh(new THREE.CapsuleGeometry(.022, .04, 4, 8), eyeM); e.position.set(x * .075, .25, -.165); e.rotation.x = Math.PI / 2 - .6; botBody.add(e); return e; });
  const brushes = [-1, 1].map((x) => { const br = group(bot, x * .3, .015, -.26); for (let k = 0; k < 3; k++) { const f = new THREE.Mesh(new THREE.BoxGeometry(.015, .006, .17), mat(0x8a8f99)); f.rotation.y = k * Math.PI * 2 / 3; f.position.set(Math.sin(k * Math.PI * 2 / 3) * .07, 0, Math.cos(k * Math.PI * 2 / 3) * .07); br.add(f); } return br; });
  const shadowBlob = new THREE.Mesh(new THREE.CircleGeometry(.48, 32), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: .12, depthWrite: false })); shadowBlob.rotation.x = -Math.PI / 2; shadowBlob.position.y = .021; bot.add(shadowBlob);
  bot.traverse((o) => { if (o.isMesh) o.castShadow = true; }); bot.scale.setScalar(1.35);
  const AVOID = [[-5.7, 1.2, 1.7], [5.7, 1.2, 1.7], [-3.6, 5.6, 1.1], [3.6, 5.6, 1.1]];      // 沙發、入口花盆:[x, z, 半徑]
  const okPt = (x, z) => AVOID.every(([ax, az, r]) => Math.hypot(x - ax, z - az) > r);
  const clearPath = (x0, z0, x1, z1) => { for (let k = 1; k <= 12; k++) { const u = k / 12, x = x0 + (x1 - x0) * u, z = z0 + (z1 - z0) * u, rr = Math.hypot(x, z); if (!okPt(x, z) || rr < 2.5 || rr > 6.9) return false; } return true; };
  const B = { x: -3.2, z: -2.6, h: Math.PI / 2, tx: 0, tz: 0, wait: 0, speed: 0, dir: 1 };   // dir:沿著圈繞的方向,偶爾掉頭
  function nextTarget() {
    if (Math.random() < .08) B.dir *= -1;
    const a0 = Math.atan2(B.x, -B.z);
    for (let tries = 0; tries < 40; tries++) {
      const a = a0 + B.dir * (.25 + Math.random() * .7), r = 2.8 + Math.random() * 3.8, x = Math.sin(a) * r, z = -Math.cos(a) * r;
      if (Math.hypot(x - B.x, z - B.z) > 1.2 && okPt(x, z) && clearPath(B.x, B.z, x, z)) { B.tx = x; B.tz = z; return; }
    }
    B.dir *= -1; const a = a0 + B.dir * .4, r = 4.6; B.tx = Math.sin(a) * r; B.tz = -Math.cos(a) * r;   // 找不到路就掉頭
  }
  nextTarget();
  function stepBot(t, dt) {
    if (B.wait > 0) { B.wait -= dt; B.speed = Math.max(0, B.speed - dt * 1.5); }
    else {
      const dx = B.tx - B.x, dz = B.tz - B.z, dist = Math.hypot(dx, dz);
      const want = Math.atan2(-dx, -dz); let dh = want - B.h; dh = Math.atan2(Math.sin(dh), Math.cos(dh));
      B.h += Math.sign(dh) * Math.min(Math.abs(dh), dt * 2.4);                                 // 原地慢慢轉向
      const aligned = Math.abs(dh) < .25;
      B.speed += ((aligned ? Math.min(.75, dist * .9 + .15) : 0) - B.speed) * Math.min(1, dt * 3);
      if (dist < .15) { B.wait = Math.random() < .35 ? 1 + Math.random() * 1.5 : .2; nextTarget(); }
    }
    B.x += -Math.sin(B.h) * B.speed * dt; B.z += -Math.cos(B.h) * B.speed * dt;
    bot.position.set(B.x, 0, B.z); bot.rotation.y = B.h;
    botBody.position.y = Math.sin(t * 18) * .003 * (B.speed > .05 ? 1 : 0);
    const spin = 8 + B.speed * 14; brushes[0].rotation.y += dt * spin; brushes[1].rotation.y -= dt * spin;
    const blink = (t % 3.7) < .12; eyes.forEach((e) => { e.scale.y = blink ? .15 : 1; });
    ledRing.material.emissiveIntensity = B.wait > 0 ? 1.8 + Math.sin(t * 4) * 1.4 : 3.2;
  }

  // 燈:暖白頂光 + 地球儀藍光
  const lamp = new THREE.PointLight(0xfff0dc, 2.5, 22, 1.2); lamp.position.set(0, 7.5, 0); root.add(lamp);
  const holoLight = new THREE.PointLight(0x6cc6ff, 3, 6, 1.6); holoLight.position.set(0, 1.5, 0); root.add(holoLight);

  const _v = new THREE.Vector3(), warmC = new THREE.Color(WARM);
  return {
    root, doors, hits: doors.map((d) => d.hit),
    update(t, dt) {
      stepBot(t, Math.min(dt, .05));
      lands.rotation.y = t * .12; wire.rotation.y = t * .12; holo.rotation.y = -t * .3; holo.position.y = 2.6 + Math.sin(t * 1.2) * .05;
      orbA.rotation.z = t * .4; orbB.rotation.z = -t * .3; emitRing.scale.setScalar(1 + Math.sin(t * 2) * .04);
      for (const d of doors) {
        const k = Math.max(d.hover, d.open);
        d.lineM.emissive.copy(warmC).lerp(d.acc, k * .8); d.lineM.emissiveIntensity = 2.6 + k * 2.4;
      }
      for (const p of plants) {
        const x = p.getWorldPosition(_v).x, tt = t - x * .09;
        const wind = Math.max(0, .35 + .4 * Math.sin(tt * .55) + .25 * Math.sin(tt * 1.37 + 1.2));
        swayPlant(p, t, wind, Math.PI / 2 + Math.sin(t * .1) * .3);
      }
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
