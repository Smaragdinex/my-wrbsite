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
  return l;
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
// 天窗看出去的地球:大顆、有雲、夜側有城市燈、外圈大氣光(天窗往上看,所以畫得滿一點)
function earthView() {
  const base = spaceView(1024, 1024, { seed: 9 }).image;
  return canvasTex(1024, 1024, (g, W) => {
    g.drawImage(base, 0, 0); const px = W * .42, py = W * .46, pr = W * .38, r = rand(21);
    const at = g.createRadialGradient(px, py, pr * .9, px, py, pr * 1.18); at.addColorStop(0, 'rgba(120,190,255,.55)'); at.addColorStop(1, 'rgba(120,190,255,0)'); g.fillStyle = at; g.beginPath(); g.arc(px, py, pr * 1.18, 0, 7); g.fill();
    const oc = g.createRadialGradient(px - pr * .35, py - pr * .35, pr * .1, px, py, pr); oc.addColorStop(0, '#6fb6f0'); oc.addColorStop(.6, '#1f5cb8'); oc.addColorStop(1, '#0a2050');
    g.save(); g.beginPath(); g.arc(px, py, pr, 0, 7); g.clip(); g.fillStyle = oc; g.fillRect(px - pr, py - pr, pr * 2, pr * 2);
    const puff = (x, y, rad, col, sx = 1, sy = 1, rot = 0) => { g.save(); g.translate(x, y); g.rotate(rot); g.scale(sx, sy); const gr = g.createRadialGradient(0, 0, 0, 0, 0, rad); gr.addColorStop(0, col); gr.addColorStop(1, col.replace(/[\d.]+\)$/, '0)')); g.fillStyle = gr; g.fillRect(-rad, -rad, rad * 2, rad * 2); g.restore(); };
    // 大陸:一群群柔邊的綠褐色斑塊(每塊由很多小團疊成,邊緣不規則)
    for (let c = 0; c < 6; c++) { const cx = px + (r() - .5) * pr * 1.3, cy = py + (r() - .5) * pr * 1.3, sz = 60 + r() * 120;
      for (let k = 0; k < 40; k++) puff(cx + (r() - .5) * sz * 1.6, cy + (r() - .5) * sz, 18 + r() * 34, `rgba(${80 + r() * 50 | 0},${120 + r() * 40 | 0},${70 + r() * 20 | 0},.55)`); }
    // 雲:沿著緯度拉長的柔白雲團 + 幾個氣旋
    for (let k = 0; k < 260; k++) { const y = py + (r() - .5) * pr * 1.9, x = px + (r() - .5) * pr * 1.9; puff(x, y, 10 + r() * 26, `rgba(255,255,255,${.12 + r() * .25})`, 2.6, .8, -.25 + (r() - .5) * .2); }
    for (let k = 0; k < 3; k++) { const cx = px + (r() - .5) * pr, cy = py + (r() - .5) * pr; for (let j = 0; j < 40; j++) { const a = j * .45, d = j * 1.6; puff(cx + Math.cos(a) * d, cy + Math.sin(a) * d, 10 + j * .5, 'rgba(255,255,255,.18)', 1.6, .7, a); } }
    const sh = g.createLinearGradient(px - pr * .2, py - pr * .2, px + pr, py + pr); sh.addColorStop(0, 'rgba(0,0,12,0)'); sh.addColorStop(.6, 'rgba(0,0,12,.82)'); g.fillStyle = sh; g.fillRect(px - pr, py - pr, pr * 2, pr * 2);
    for (let k = 0; k < 260; k++) { const a = r() * 7, d = Math.sqrt(r()) * pr; const x = px + Math.cos(a) * d, y = py + Math.sin(a) * d; if ((x - px) + (y - py) < pr * .45) continue; g.fillStyle = `rgba(255,${190 + r() * 50 | 0},120,${.4 + r() * .5})`; g.fillRect(x, y, 2, 2); }
    g.restore();
  });
}
// 門上的招牌:Cloud Dancer 白底 + 深灰字(編號、名稱、副標)+ 右邊 ↗;燈條另外做(會呼吸 / 點擊時掃過)
function signTex(room, i) {
  return canvasTex(1024, 336, (g, W, H) => {
    g.textBaseline = 'alphabetic';
    g.fillStyle = '#6a707c'; g.font = '300 150px "Helvetica Neue", sans-serif'; g.fillText(String(i + 1).padStart(2, '0'), 34, 205);
    const t = room.title.toUpperCase(); g.font = '700 74px "Helvetica Neue", sans-serif';
    const fs = Math.min(74, 74 * (W - 260 - 110) / g.measureText(t).width); g.font = `700 ${fs | 0}px "Helvetica Neue", sans-serif`;
    g.fillStyle = '#2f343d'; g.fillText(t, 252, 150);
    g.fillStyle = '#7a808c'; g.font = '500 40px "Helvetica Neue", sans-serif'; g.fillText((SUB[room.key] || room.tag).toUpperCase(), 254, 215);
    g.fillStyle = '#5a606c'; g.font = '300 70px "Helvetica Neue", sans-serif'; g.textAlign = 'right'; g.fillText('↗', W - 36, 140);
  });
}
const enterTex = () => canvasTex(512, 96, (g, W, H) => { g.fillStyle = '#1d2440'; g.beginPath(); g.roundRect(4, 8, W - 8, H - 16, (H - 16) / 2); g.fill();
  g.fillStyle = '#e8f6ff'; g.font = '500 36px "SF Mono", Menlo, monospace'; g.textBaseline = 'middle'; g.textAlign = 'center'; g.fillText('ENTER PROJECT →', W / 2, H / 2 + 1); });

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
  const mirror = new Reflector(new THREE.CircleGeometry(HALL_R + .5, 96), { clipBias: .003, color: 0x555555,
    textureWidth: innerWidth * dpr * (small ? .35 : .5), textureHeight: innerHeight * dpr * (small ? .35 : .5) });
  mirror.rotation.x = -Math.PI / 2; root.add(mirror);
  const floor = new THREE.Mesh(new THREE.CircleGeometry(HALL_R + .5, 96), new THREE.MeshStandardMaterial({ color: CD, roughness: .3, metalness: 0, transparent: true, opacity: .87 }));
  floor.rotation.x = -Math.PI / 2; floor.position.y = .01; floor.receiveShadow = true; root.add(floor);
  // 接觸陰影:東西貼地的地方一圈柔和的暗(圓形 / 長條,貼在地板上)
  const blobT = canvasTex(128, 128, (g) => { const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(.55, 'rgba(0,0,0,.45)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); });
  const contact = (parent, x, z, sx, sz, op = .35, ry = 0) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: blobT, transparent: true, opacity: op, depthWrite: false })); m.rotation.set(-Math.PI / 2, 0, ry); m.scale.set(sx, sz, 1); m.position.set(x, .022, z); parent.add(m); return m; };
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
  const panelM = gloss(0xf5f3ef, .35), seamM = gloss(CD3, .5), ventM = mat(0x8d8a84, { roughness: .6 }), ledCols = [0x6cc6ff, 0x7fe0a0, 0xffd166];
  function wallModule(b, k) {
    const m = group(root, Math.sin(b) * (HALL_R - .02), 0, -Math.cos(b) * (HALL_R - .02), -b);
    box(m, 1.25, 2.3, .05, panelM, { y: 2.15, r: .04, shadow: false });                     // 微凸的大面板
    box(m, .03, WALL_H - .8, .03, seamM, { x: .7, y: WALL_H / 2, r: 0, shadow: false });        // 直接縫
    for (let v = 0; v < 6; v++) box(m, .8, .025, .03, ventM, { y: .62 + v * .07, r: 0, shadow: false });   // 通風格柵
    box(m, 1.25, .06, .04, seamM, { y: 3.42, r: 0, shadow: false });
    if (k % 2 === 0) { const l = new THREE.Mesh(new THREE.BoxGeometry(.06, .06, .02), glow(ledCols[k % 3], 2.6)); l.position.set(-.45, 3.7, .03); m.add(l); leds.push(l); }
  }
  const leds = [];
  let mk = 0;
  for (const [b0, b1] of segs) { const arc = (b1 - b0) * HALL_R; if (arc < 1.6) continue; const cnt = Math.floor(arc / 1.5);
    for (let j = 0; j < cnt; j++) wallModule(b0 + (b1 - b0) * (j + .5) / cnt, mk++); }
  for (const [y, h, m] of [[0, .3, gloss(CD3)], [WALL_H - .05, .1, gloss(CD2)]]) { const s = ringSector(HALL_R - .08, HALL_R, -Math.PI, Math.PI, h, m); s.position.y = y; root.add(s); }
  for (const y of [.32, WALL_H - .3]) { const s = ringSector(HALL_R - .1, HALL_R - .06, -Math.PI, Math.PI, .04, warmM(2.4)); s.position.y = y; root.add(s); }
  // 門與門之間(和前半圈)的柱子:圓角白柱 + 一道直的暖光 + 柱腳白色花盆
  const pillarB = [];
  for (let k = 0; k <= n; k++) pillarB.push(bearings[0] - span / n / 2 + span / n * k);
  for (let k = 1; k < 6; k++) if (k !== 3) pillarB.push(span / 2 + (Math.PI * 2 - span) * k / 6);   // 正前方(鏡頭站的位置)不放柱子
  pillarB.forEach((b, k) => {
    const p = group(root, Math.sin(b) * (HALL_R - .25), 0, -Math.cos(b) * (HALL_R - .25), -b);
    box(p, .7, WALL_H, .5, gloss(CD), { y: WALL_H / 2, r: .12 });
    box(p, .16, WALL_H - 1.0, .04, gloss(CD3, .5), { y: WALL_H / 2 + .2, z: .24, r: .02, shadow: false });    // 燈槽
    const s = new THREE.Mesh(new THREE.BoxGeometry(.05, WALL_H - 1.2, .02), warmM(2.8)); s.position.set(0, WALL_H / 2 + .2, .27); p.add(s);
    for (const y of [1.2, 4.6]) { const l = new THREE.Mesh(new THREE.BoxGeometry(.18, .04, .02), glow(0x6cc6ff, 2)); l.position.set(0, y, .27); p.add(l); }
    contact(root, Math.sin(b) * (HALL_R - .45), -Math.cos(b) * (HALL_R - .45), 1.6, 1.1, .3, -b);
    if (k <= n) { box(p, .8, .55, .7, gloss(0xffffff), { y: .28, z: .75, r: .1 }); plant(p, { y: .55, z: .75, r: .26, h: .2, pot: 0xffffff, len: .75, n: 12 }); }
  });

  // ---------- 五個門洞:圓角白門框 + 內圈暖光 + 招牌面板 + 艙內縮影 ----------
  const doors = rooms.map((room, i) => {
    const b = bearings[i], acc = room.cfg.accent, cfg = room.cfg;
    const g = group(root, Math.sin(b) * HALL_R, 0, -Math.cos(b) * HALL_R, -b);
    // 厚門框(往大廳凸出 1.1)+ 外圈一道凹槽 + 門框正面和門洞內側(門柱裡)都嵌一圈燈帶
    const FD = 1.1;
    const fr = new THREE.Mesh(frameGeo(DOOR_W + .9, DOOR_H + .5, DOOR_W, DOOR_H + .1, .45, FD, -.05), gloss(CD)); fr.position.z = -.35; fr.castShadow = true; g.add(fr);
    const groove = new THREE.Mesh(frameGeo(DOOR_W + .62, DOOR_H + .36, DOOR_W + .5, DOOR_H + .3, .42, .02, -.03), gloss(CD3, .5)); groove.position.z = FD - .33; g.add(groove);
    const lineM = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: WARM, emissiveIntensity: 2.6 });
    const ln = new THREE.Mesh(frameGeo(DOOR_W + .22, DOOR_H + .17, DOOR_W + .06, DOOR_H + .06, .4, .02, 0), lineM); ln.position.z = FD - .32; g.add(ln);
    for (const x of [-1, 1]) { const j = new THREE.Mesh(new THREE.BoxGeometry(.02, DOOR_H - .7, .06), lineM); j.position.set(x * (DOOR_W / 2 - .01), DOOR_H / 2 + .1, .2); g.add(j); }   // 門柱內側的直燈
    const jt = new THREE.Mesh(new THREE.BoxGeometry(DOOR_W - .7, .02, .06), lineM); jt.position.set(0, DOOR_H + .04, .2); g.add(jt);
    contact(g, 0, .75, DOOR_W + 1.6, 1.6, .28);
    // 招牌:白色面板 + 字 + 下緣暖光
    const sg = group(g, 0, DOOR_H + 1.25, .45);
    box(sg, 3.2, 1.05, .16, gloss(0xfbfaf7), { r: .12 });
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(3.0, .985), new THREE.MeshBasicMaterial({ map: signTex(room, i), transparent: true })); sign.position.set(0, .03, .085); sg.add(sign);
    // 底部燈條:淡灰軌道 + 冰藍光(平常停在一段、慢慢呼吸;點擊時從左掃到右)
    const BAR_W = 2.76, track = new THREE.Mesh(new THREE.PlaneGeometry(BAR_W, .04), new THREE.MeshBasicMaterial({ color: 0xdcd7ce })); track.position.set(0, -.4, .086); sg.add(track);
    const barM = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x9fdcf0).multiplyScalar(1.8), toneMapped: false });
    const bar = new THREE.Mesh(new THREE.PlaneGeometry(1, .046), barM); bar.position.set(0, -.4, .088); sg.add(bar);
    // 滑過時浮現的「ENTER PROJECT →」(招牌下方)
    const enterM = new THREE.MeshBasicMaterial({ map: enterTex(), transparent: true, opacity: 0, depthWrite: false });
    const enter = new THREE.Mesh(new THREE.PlaneGeometry(1.75, .33), enterM); enter.position.set(0, -.74, .42); sg.add(enter);   // 擺在厚門框前面,不會被擋住
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
    const cabLight = props(R, room.key, new THREE.Color(acc).lerp(new THREE.Color(WARM), .5).getHex());
    box(g, DOOR_W + .3, .08, .8, gloss(CD2), { y: .04, z: 1.15, r: .03, shadow: false });     // 門口的小平台
    const hit = new THREE.Mesh(new THREE.BoxGeometry(3.2, 5.2, 2.2), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })); hit.position.set(0, 2.6, .3); g.add(hit);
    hit.userData.door = i;
    return { i, b, g, edgeM: lineM, lineM, hit, bar, barM, BAR_W, enter, enterM, cabLight, backM: back.material, innerM: inner, open: 0, hover: 0, acc: new THREE.Color(acc), world: (dist = 0, y = 1.5) => g.localToWorld(new THREE.Vector3(0, y, dist)) };
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
  const ocu = new THREE.Mesh(new THREE.CircleGeometry(3.0, 64), new THREE.MeshBasicMaterial({ map: earthView(), color: new THREE.Color(1.15, 1.15, 1.2), toneMapped: false }));
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
  // ---------- 中央全息:旋轉的地球(藍球 + 點狀大陸 + 經緯線 + 光暈 + 兩圈軌道)+ 上方戰艦投影 + 往上飄的光點 ----------
  const land = canvasTex(1024, 512, (g, W, H) => { g.fillStyle = '#000'; g.fillRect(0, 0, W, H); const rr = rand(8); g.fillStyle = '#fff';
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
  // 往上飄的光點(從地上的圓盤升起,繞著地球慢慢轉)
  const PN = 180, pPos = new Float32Array(PN * 3), pSeed = [];
  for (let k = 0; k < PN; k++) { const a = Math.random() * 6.28, r = .3 + Math.random() * 1.7; pSeed.push({ a, r, y: Math.random() * 3.4, v: .15 + Math.random() * .35 }); }
  const pGeo = new THREE.BufferGeometry(); pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
  const motes = new THREE.Points(pGeo, new THREE.PointsMaterial({ color: new THREE.Color(0x3a9cff).multiplyScalar(1.4), size: .05, transparent: true, opacity: .85, depthWrite: false, toneMapped: false })); ped.add(motes);

  // ---------- 天窗:行星的光從上面灑下來(冷白聚光 + 很淡的光束 + 飄在光裡的灰塵)----------
  const skyLight = new THREE.SpotLight(0xdfeaff, 40, 20, .62, .7, 1.2); skyLight.position.set(0, CEIL_Y + .3, 0); skyLight.target.position.set(0, 0, 0);
  skyLight.castShadow = true; skyLight.shadow.mapSize.set(1024, 1024); skyLight.shadow.bias = -.0008; skyLight.shadow.radius = 6; root.add(skyLight); root.add(skyLight.target);
  const shaftM = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'varying vec2 vUv; void main(){ float a = smoothstep(0.0, 1.0, vUv.y) * .07 * (.7 + .3 * sin(vUv.x * 40.0)); gl_FragColor = vec4(vec3(.85, .92, 1.0) * a, a); }' });
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(2.8, 4.6, CEIL_Y, 64, 1, true), shaftM); shaft.position.y = CEIL_Y / 2; root.add(shaft);
  const DN = 120, dPos = new Float32Array(DN * 3), dSeed = [];
  for (let k = 0; k < DN; k++) { const a = Math.random() * 6.28, r = Math.random() * 3.6; dSeed.push({ a, r, y: Math.random() * CEIL_Y, s: .5 + Math.random() }); }
  const dGeo = new THREE.BufferGeometry(); dGeo.setAttribute('position', new THREE.BufferAttribute(dPos, 3));
  const dust = new THREE.Points(dGeo, new THREE.PointsMaterial({ color: 0xffffff, size: .03, transparent: true, opacity: .55, depthWrite: false })); root.add(dust);

  // ---------- 入口兩側的大花盆 ----------
  for (const s of [-1, 1]) { contact(root, s * 3.6, 5.6, 1.9, 1.9, .32); box(root, 1.0, .7, 1.0, gloss(0xffffff), { x: s * 3.6, y: .35, z: 5.6, r: .12 }); plant(root, { x: s * 3.6, y: .7, z: 5.6, r: .32, h: .2, pot: 0xffffff, len: 1.0, n: 14 }); }

  // ---------- 圓形沙發(兩側) ----------
  const sofaM = gloss(CD2, .85), cushM = gloss(0xfaf8f4, .9);
  for (const s of [-1, 1]) {
    const px = s * 5.7, pz = 1.2, so = group(root, px, 0, pz, Math.atan2(-px, -pz));
    contact(root, px, pz, 3.0, 3.0, .38); cyl(so, 1.12, 1.12, .12, gloss(CD3), { y: .06, seg: 48 });
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
      for (let k = 0; k < PN; k++) { const p = pSeed[k]; p.y += p.v * dt; if (p.y > 3.4) p.y = 0; pPos.set([Math.cos(p.a + t * .1) * p.r * (1 - p.y * .12), p.y + .05, Math.sin(p.a + t * .1) * p.r * (1 - p.y * .12)], k * 3); }
      pGeo.attributes.position.needsUpdate = true;
      for (let k = 0; k < DN; k++) { const d = dSeed[k]; d.y -= dt * .05 * d.s; if (d.y < 0) d.y = CEIL_Y; dPos.set([Math.cos(d.a + t * .02 * d.s) * d.r, d.y, Math.sin(d.a + t * .02 * d.s) * d.r], k * 3); }
      dGeo.attributes.position.needsUpdate = true;
      leds.forEach((l, k) => { l.material.emissiveIntensity = ((t * .7 + k * .37) % 1) < .8 ? 2.6 : .4; });
      for (const d of doors) {
        const k = Math.max(d.hover, d.open);
        d.lineM.emissive.copy(warmC).lerp(d.acc, k * .8); d.lineM.emissiveIntensity = 2.6 + k * 2.4;
        d.cabLight.intensity = 3 + d.hover * 7; d.backM.emissiveIntensity = .55 + d.hover * .5; d.innerM.emissiveIntensity = d.hover * .25;   // 滑到哪一艙,那一艙亮起來
        d.innerM.emissive.copy(d.acc);
        // 燈條:平常 35% 長、很慢地呼吸;滑過時亮一點;點擊(open)時一路掃到 100%
        const fill = .35 + (1 - .35) * d.open, br = .55 + .45 * (.5 + .5 * Math.sin(t * .8 + d.i * 1.3));
        d.bar.scale.x = d.BAR_W * fill; d.bar.position.x = -d.BAR_W / 2 + d.BAR_W * fill / 2;
        d.barM.color.setRGB(.16, .58, .9).multiplyScalar(.55 + Math.max(br, d.hover) * 1.1 + d.open * .8);   // 冰藍(白底上要深一點才看得到)
        d.enterM.opacity = d.hover; d.enter.position.y = -.8 + d.hover * .08;
      }
      for (const p of plants) {
        const x = p.getWorldPosition(_v).x, tt = t - x * .09;
        const wind = Math.max(0, .35 + .4 * Math.sin(tt * .55) + .25 * Math.sin(tt * 1.37 + 1.2));
        swayPlant(p, t, wind, Math.PI / 2 + Math.sin(t * .1) * .3);
      }
    },
  };
}

// 機庫 → 通道(跟大廳同一套風格):亮面白的圓形長走道、一圈圈白色肋環(內側暖白燈)、天花板暖光燈條、
// 白色亮面走道 + 兩條暖光邊線;兩道白色滑門(暖光門縫 + 一點藍),盡頭是一片亮白(大廳的光)
export function createCorridor(scene) {
  const root = new THREE.Group(); scene.add(root);
  const WARM = 0xffd9a8, CD = 0xf0eee9, CD2 = 0xe4e0d8;
  scene.background = new THREE.Color(0xf4efe6);
  scene.fog = new THREE.Fog(0xf4efe6, 22, 70);                           // 遠處淡進一片暖白
  const gloss = (c, rough = .22) => new THREE.MeshStandardMaterial({ color: c, roughness: rough, metalness: .04, envMapIntensity: 1.1 });
  const warmM = (i = 2.6) => glow(WARM, i);
  const L = 70, R = 3.0, Z0 = 16;
  const wt = panelTex('#f0eee9', 'rgba(150,138,120,.16)', 1024, 1024, 4, 4); wt.repeat.set(3, 16);
  const tube = new THREE.Mesh(new THREE.CylinderGeometry(R, R, L, 40, 1, true), new THREE.MeshStandardMaterial({ map: wt, roughness: .3, metalness: .04, side: THREE.BackSide }));
  tube.rotation.x = Math.PI / 2; tube.scale.set(1.15, 1, 1); tube.position.z = -L / 2 + Z0; tube.receiveShadow = true; root.add(tube);
  const floorY = -R * .78;
  box(root, 3.0, .08, L, gloss(0xf6f3ee, .14), { y: floorY, z: -L / 2 + Z0, r: 0, shadow: false });
  for (const x of [-1.42, 1.42]) { const st = new THREE.Mesh(new THREE.BoxGeometry(.05, .03, L), warmM(2.6)); st.position.set(x, floorY + .05, -L / 2 + Z0); root.add(st); }
  const ceil = new THREE.Mesh(new THREE.BoxGeometry(.5, .04, L), warmM(2.2)); ceil.position.set(0, R - .08, -L / 2 + Z0); root.add(ceil);
  for (const s of [-1, 1]) { const w = new THREE.Mesh(new THREE.BoxGeometry(.03, .05, L), warmM(1.8)); w.position.set(s * (R * 1.15 - .06), .6, -L / 2 + Z0); root.add(w); }
  // 肋環:白色圓環 + 內側一圈暖光
  for (let z = Z0 - 2; z > -L + Z0; z -= 4.5) {
    const rib = new THREE.Mesh(new THREE.TorusGeometry(R - .08, .2, 10, 48), gloss(CD2, .3)); rib.scale.set(1.15, 1, 1); rib.position.z = z; root.add(rib);
    const rl = new THREE.Mesh(new THREE.TorusGeometry(R - .3, .022, 6, 64), warmM(1.7)); rl.scale.set(1.15, 1, 1); rl.position.z = z; root.add(rl);
  }
  // 滑門:圓角白框 + 左右兩片白門(暖光門縫、門上一道淡藍)
  function door(z) {
    const g = group(root, 0, 0, z);
    const fr = new THREE.Mesh(new THREE.TorusGeometry(R - .15, .38, 12, 48), gloss(CD, .25)); fr.scale.set(1.15, 1, 1); g.add(fr);
    const fl = new THREE.Mesh(new THREE.TorusGeometry(R - .55, .03, 6, 64), warmM(3)); fl.scale.set(1.15, 1, 1); fl.position.z = .3; g.add(fl);
    const seam = warmM(3);
    const panels = [-1, 1].map((s) => {
      const p = group(g, 0, 0, 0);
      box(p, R * 1.15 - .1, (R - .2) * 2, .18, gloss(0xfbfaf7, .2), { x: s * (R * 1.15 - .1) / 2, r: .06 });
      const sl = new THREE.Mesh(new THREE.BoxGeometry(.05, R * 1.7, .02), seam); sl.position.set(s * .03, 0, .1); p.add(sl);
      const bl = new THREE.Mesh(new THREE.BoxGeometry(R * .9, .05, .02), glow(0x7fd0ff, 2)); bl.position.set(s * (R * .6), -.4, .1); p.add(bl);
      return { p, s };
    });
    return { set(k) { panels.forEach(({ p, s }) => { p.position.x = s * k * (R * 1.15); }); seam.emissiveIntensity = 3 + k * 2; } };
  }
  const d1 = door(0), d2 = door(-44);
  const endGlow = new THREE.Mesh(new THREE.PlaneGeometry(8, 8), new THREE.MeshBasicMaterial({ color: 0xfffaf2, toneMapped: false })); endGlow.position.z = -48; root.add(endGlow);
  scene.add(new THREE.HemisphereLight(0xfff8ee, 0x9a9284, .42));
  for (const z of [8, -8, -24, -40]) { const l = new THREE.PointLight(0xfff0dc, 4, 18, 1.5); l.position.set(0, 1.6, z); root.add(l); }
  const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  return {
    root, START: 13, END: -47,
    // 依鏡頭目前的 z 開門(靠近時滑開)
    update(camZ) { d1.set(smooth(9, 3, camZ)); d2.set(smooth(-33, -39, camZ)); },
  };
}
