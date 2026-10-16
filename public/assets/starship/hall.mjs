// 艦內:①機庫 → 通道(鏡頭穿過兩道會滑開的艙門)②中央大廳(照使用者給的參考圖,像《劍星》那種亮白科幻空間):
// 鏡頭站在入口平視;亮面白地板(真的反射)、暖白燈條、圓頂天花板一圈大窗 + 天窗看得到地球、中央吊柱;
// 後半圈五個圓角門洞(白色招牌、裡面是該艙的縮影)、中央地上的光環 + 發光地球儀 + 戰艦投影、圓沙發、會被風吹動的盆栽、自己到處跑的打掃機器人。
import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
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

// 把 root 底下「不會動、不透明」的網格依材質合併(座標烘進幾何裡);skip 裡的東西(和它們的子孫)不動
function mergeStatic(root, skip) {
  root.updateMatrixWorld(true);
  const inv = root.matrixWorld.clone().invert(), groups = new Map();
  root.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh || !o.geometry?.attributes.normal || !o.geometry.attributes.uv) return;
    for (let p = o; p; p = p.parent) if (skip.has(p)) return;
    const m = o.material; if (Array.isArray(m) || m.transparent) return;
    if (!groups.has(m)) groups.set(m, []); groups.get(m).push(o);
  });
  for (const [m, list] of groups) {
    if (list.length < 2) continue;
    const geos = list.map((o) => { const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
      for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
      g.clearGroups(); g.applyMatrix4(inv.clone().multiply(o.matrixWorld)); return g; });
    const g = mergeGeometries(geos, false); if (!g) continue;
    const mesh = new THREE.Mesh(g, m); mesh.castShadow = list.some((o) => o.castShadow); mesh.receiveShadow = list.some((o) => o.receiveShadow); mesh.matrixAutoUpdate = false; mesh.updateMatrix();
    root.add(mesh); for (const o of list) o.parent.remove(o);
  }
}

// 地上的貼花用「相乘」混色:把地板乘上一個顏色(白 = 不變)。地板很亮(HDR),一般半透明疊上去會被洗掉。
// 形狀直接在 shader 裡算(不用貼圖):'blob' 圓形柔邊陰影、'pool' 門口光池(靠門那端最濃、往大廳淡出、兩側也淡)
function tintMat(shape, color, k = 1) {
  const A = shape === 'pool' ? 'float s = 1.0 - abs(vUv.x - .5) * 2.0; float a = pow(vUv.y, .9) * smoothstep(0.0, .6, s);'
    : 'float d = length(vUv - .5) * 2.0; float a = 1.0 - smoothstep(0.0, 1.0, d); a *= a;';
  return new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.DstColorFactor, blendDst: THREE.ZeroFactor,
    uniforms: { uCol: { value: new THREE.Color(color) }, uK: { value: k } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform vec3 uCol; uniform float uK; varying vec2 vUv; void main(){ ${A} gl_FragColor = vec4(mix(vec3(1.0), uCol, clamp(a * uK, 0.0, 1.0)), 1.0); }` });
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
// 門上的招牌(2 倍解析度,字比較銳利):左緣一條該艙顏色的色條、編號、細分隔線、名稱、副標、右上角小小的艙位編號、↗
function signTex(room, i) {
  return canvasTex(2048, 672, (g, W, H) => {
    g.textBaseline = 'alphabetic';
    g.fillStyle = hex(room.cfg.accent); g.beginPath(); g.roundRect(0, 56, 18, H - 112, 9); g.fill();
    g.fillStyle = '#6a707c'; g.font = '200 300px "Helvetica Neue", sans-serif'; g.fillText(String(i + 1).padStart(2, '0'), 64, 418);
    g.fillStyle = 'rgba(106,112,124,.35)'; g.fillRect(470, 150, 3, 330);
    const t = room.title.toUpperCase(); g.font = '700 148px "Helvetica Neue", sans-serif';
    const fs = Math.min(148, 148 * (W - 520 - 240) / g.measureText(t).width); g.font = `700 ${fs | 0}px "Helvetica Neue", sans-serif`;
    g.fillStyle = '#2f343d'; g.fillText(t, 516, 318);
    g.fillStyle = '#7a808c'; g.font = '500 76px "Helvetica Neue", sans-serif'; g.fillText((SUB[room.key] || room.tag).toUpperCase(), 520, 440);
    g.fillStyle = '#9aa0aa'; g.font = '500 44px "SF Mono", Menlo, monospace'; g.textAlign = 'right'; g.fillText(`DECK A · BAY 0${i + 1}`, W - 210, 120);
    g.fillStyle = '#5a606c'; g.font = '200 150px "Helvetica Neue", sans-serif'; g.fillText('↗', W - 60, 310);
  });
}
const enterTex = () => canvasTex(512, 96, (g, W, H) => { g.fillStyle = '#1d2440'; g.beginPath(); g.roundRect(4, 8, W - 8, H - 16, (H - 16) / 2); g.fill();
  g.fillStyle = '#e8f6ff'; g.font = '500 36px "SF Mono", Menlo, monospace'; g.textBaseline = 'middle'; g.textAlign = 'center'; g.fillText('ENTER PROJECT →', W / 2, H / 2 + 1); });

export function createHall(scene, rooms) {
  const root = new THREE.Group(); scene.add(root);
  const arch = new THREE.Group(); root.add(arch);   // 建築(地板、牆、柱、門框、展示艙、天花板…):烘焙好的模型載入後整組換掉;互動的東西留在 root
  scene.background = new THREE.Color(0x0a0c14);
  const n = rooms.length, span = 150 * Math.PI / 180;
  const bearings = rooms.map((_, i) => -span / 2 + span * (i + .5) / n);
  // 色票:Cloud Dancer 亮面白為主;暖白燈條
  const CD = 0xf0eee9, CD2 = 0xe4e0d8, CD3 = 0xd3cdc2, WARM = 0xffd9a8;
  const glossNew = (c, rough = .22) => new THREE.MeshStandardMaterial({ color: c, roughness: rough, metalness: .04, envMapIntensity: 1.1 });
  const memo = new Map(), once = (key, make) => memo.get(key) || memo.set(key, make()).get(key);
  const gloss = (c, rough = .22) => once(`g${c}|${rough}`, () => glossNew(c, rough));        // 同色同粗糙度共用一個材質(之後才能合併成一個網格)
  const warmM = (i = 2.6) => once(`w${i}`, () => glow(WARM, i));
  const plants = [], plant = (parent, o) => { const p = leafyPlant(parent, o); plants.push(p); return p; };
  const at = (b, r, y = 0) => new THREE.Vector3(Math.sin(b) * r, y, -Math.cos(b) * r);

  // ---------- 亮面白地板(真的會反射):反射鏡面 + 上面一層半透明的白 ----------
  const dpr = Math.min(devicePixelRatio, 2), small = innerWidth < 700;
  // 反射用低解析度 → 倒影自然變柔(像拋光石材,不是鏡子),也省效能;手機不做反射
  let mirror = null;
  if (!small) { mirror = new Reflector(new THREE.CircleGeometry(HALL_R + .5, 96), { clipBias: .003, color: 0x555555,
    textureWidth: innerWidth * dpr * .28, textureHeight: innerHeight * dpr * .28 });
    mirror.rotation.x = -Math.PI / 2; mirror.renderOrder = -3; root.add(mirror); }
  // 地磚:同心圓分圈 + 放射狀接縫(外圈分得越細),每塊磚的白有一點點差異;接縫微凹(bump)、比磚面粗一點(roughness)
  const FR = HALL_R + .5, FPX = 2048, px = (m) => m / FR * (FPX / 2);
  const BANDS = [[2.1, 2.72, 12], [2.72, 3.62, 16], [4.36, 5.6, 24], [5.6, 6.8, 32], [6.8, FR, 40]];
  const drawFloor = (g, mode) => {   // mode: 'color' | 'bump' | 'rough'
    const c = FPX / 2, rr = rand(31);
    g.fillStyle = mode === 'color' ? '#f0eee9' : mode === 'bump' ? '#fff' : '#3a3a3a'; g.fillRect(0, 0, FPX, FPX);
    for (const [r0, r1, nSeg] of BANDS) for (let k = 0; k < nSeg; k++) {
      const a0 = k / nSeg * Math.PI * 2, a1 = (k + 1) / nSeg * Math.PI * 2;
      if (mode === 'color') { const v = 236 + rr() * 8 | 0; g.fillStyle = `rgb(${v + 4},${v + 2},${v - 3})`; g.beginPath(); g.arc(c, c, px(r1), a0, a1); g.arc(c, c, px(r0), a1, a0, true); g.closePath(); g.fill(); }
      g.strokeStyle = mode === 'color' ? 'rgba(150,140,125,.55)' : mode === 'bump' ? '#000' : '#b0b0b0'; g.lineWidth = 3;
      g.beginPath(); g.moveTo(c + Math.cos(a0) * px(r0), c + Math.sin(a0) * px(r0)); g.lineTo(c + Math.cos(a0) * px(r1), c + Math.sin(a0) * px(r1)); g.stroke();
    }
    if (mode === 'color') bearings.forEach((b, i) => {                                  // 門前地上淡淡的大編號
      const r = HALL_R - 2.5, s2 = FPX / (2 * FR); g.save(); g.translate(c + Math.sin(b) * r * s2, c - Math.cos(b) * r * s2);   // 字頭朝後方(門那邊),從入口看過去是正的
      g.fillStyle = 'rgba(140,132,118,.75)'; g.font = `300 ${0.85 * s2 | 0}px "Helvetica Neue", sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(i + 1).padStart(2, '0'), 0, 0); g.restore(); });
    for (const r of [2.1, 2.72, 3.62, 4.36, 5.6, 6.8]) { g.lineWidth = r === 5.6 || r === 6.8 ? 7 : 3; g.strokeStyle = mode === 'color' ? (g.lineWidth > 3 ? 'rgba(160,154,142,.9)' : 'rgba(150,140,125,.55)') : mode === 'bump' ? '#000' : '#b0b0b0'; g.beginPath(); g.arc(c, c, px(r), 0, Math.PI * 2); g.stroke(); }
  };
  const fTex = (mode) => { const t = canvasTex(FPX, FPX, (g) => drawFloor(g, mode)); if (mode !== 'color') t.colorSpace = THREE.NoColorSpace; return t; };
  const floor = new THREE.Mesh(new THREE.CircleGeometry(FR, 128), new THREE.MeshStandardMaterial({ map: fTex('color'), bumpMap: fTex('bump'), bumpScale: 1.2, roughnessMap: fTex('rough'), roughness: 1,
    metalness: 0, transparent: !!mirror, opacity: mirror ? .86 : 1, envMapIntensity: .9 }));
  floor.rotation.x = -Math.PI / 2; floor.position.y = .01; floor.receiveShadow = true; floor.renderOrder = -2; arch.add(floor);   // 地板先畫,地上的貼花(陰影、光池、編號)才不會被半透明地板蓋掉
  // 接觸陰影:東西貼地的地方一圈柔和的暗(圓形 / 長條,貼在地板上)
  const contact = (parent, x, z, sx, sz, op = .35, ry = 0) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), tintMat('blob', 0x8a8274, Math.min(1, op * 2.6))); m.rotation.set(-Math.PI / 2, 0, ry); m.scale.set(sx, sz, 1); m.position.set(x, .022, z); parent.add(m); return m; };
  // 牆腳的「環境遮蔽」:靠牆的地上越往牆越暗一點點
  const aoM = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, uniforms: { uR: { value: HALL_R } },
    vertexShader: 'varying float vR; void main(){ vR = length(position.xy); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform float uR; varying float vR; void main(){ float a = pow(smoothstep(uR - 1.3, uR, vR), 2.0) * .32; gl_FragColor = vec4(mix(vec3(1.0), vec3(.62, .58, .52), a), 1.0); }',
    blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.DstColorFactor, blendDst: THREE.ZeroFactor });
  const ao = new THREE.Mesh(new THREE.RingGeometry(HALL_R - 1.4, HALL_R + .02, 128), aoM); ao.rotation.x = -Math.PI / 2; ao.position.y = .02; arch.add(ao);

  // ---------- 艙壁:一整圈亮白牆(後半圈開六個門洞),牆腳 / 牆頂暖光燈條 ----------
  const wallM = new THREE.MeshStandardMaterial({ map: panelTex('#f0eee9', 'rgba(150,138,120,.13)', 1024, 1024, 3, 2), roughness: .3, metalness: .04 });
  const half = (DOOR_W / 2 + .5) / HALL_R;
  const segs = [];                                                     // 門與門之間各一段,最後一段從最後一道門繞過前半圈回到第一道門
  let prev = bearings[0] + half;
  for (const b of bearings.slice(1)) { segs.push([prev, b - half]); prev = b + half; }
  segs.push([prev, bearings[0] - half + Math.PI * 2]);
  for (const [b0, b1] of segs) if (b1 > b0) arch.add(ringSector(HALL_R, HALL_R + .5, b0, b1, WALL_H, wallM));
  for (const b of bearings) { const lin = ringSector(HALL_R, HALL_R + .5, b - half, b + half, WALL_H - DOOR_H - .45, wallM); lin.position.y = DOOR_H + .45; arch.add(lin); }
  const panelM = gloss(0xf5f3ef, .35), seamM = gloss(CD3, .5), ventM = mat(0x8d8a84, { roughness: .6 }), ledCols = [0x6cc6ff, 0x7fe0a0, 0xffd166];
  function wallModule(b, k) {
    const m = group(arch, Math.sin(b) * (HALL_R - .02), 0, -Math.cos(b) * (HALL_R - .02), -b);
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
  for (const [y, h, m] of [[0, .3, gloss(CD3)], [WALL_H - .05, .1, gloss(CD2)]]) { const s = ringSector(HALL_R - .08, HALL_R, -Math.PI, Math.PI, h, m); s.position.y = y; arch.add(s); }
  for (const y of [.32, WALL_H - .3]) { const s = ringSector(HALL_R - .1, HALL_R - .06, -Math.PI, Math.PI, .04, warmM(2.4)); s.position.y = y; arch.add(s); }
  // 門與門之間(和前半圈)的柱子:圓角白柱 + 一道直的暖光 + 柱腳白色花盆
  const pillarB = [];
  for (let k = 0; k <= n; k++) pillarB.push(bearings[0] - span / n / 2 + span / n * k);
  for (let k = 1; k < 6; k++) if (k !== 3) pillarB.push(span / 2 + (Math.PI * 2 - span) * k / 6);   // 正前方(鏡頭站的位置)不放柱子
  pillarB.forEach((b, k) => {
    const p = group(arch, Math.sin(b) * (HALL_R - .25), 0, -Math.cos(b) * (HALL_R - .25), -b);
    box(p, .7, WALL_H, .5, gloss(CD), { y: WALL_H / 2, r: .12 });
    box(p, .16, WALL_H - 1.0, .04, gloss(CD3, .5), { y: WALL_H / 2 + .2, z: .24, r: .02, shadow: false });    // 燈槽
    const s = new THREE.Mesh(new THREE.BoxGeometry(.05, WALL_H - 1.2, .02), warmM(2.8)); s.position.set(0, WALL_H / 2 + .2, .27); p.add(s);
    for (const y of [1.2, 4.6]) { const l = new THREE.Mesh(new THREE.BoxGeometry(.18, .04, .02), glow(0x6cc6ff, 2)); l.position.set(0, y, .27); p.add(l); }
    contact(arch, Math.sin(b) * (HALL_R - .45), -Math.cos(b) * (HALL_R - .45), 1.6, 1.1, .3, -b);
    if (k <= n) { box(p, .8, .55, .7, gloss(0xffffff), { y: .28, z: .75, r: .1 }); plant(p, { y: .55, z: .75, r: .26, h: .2, pot: 0xffffff, len: .75, n: 12 }); }
  });

  // ---------- 五個門洞:圓角白門框 + 內圈暖光 + 招牌面板 + 艙內縮影 ----------
  const doors = rooms.map((room, i) => {
    const b = bearings[i], acc = room.cfg.accent, cfg = room.cfg;
    const g = group(root, Math.sin(b) * HALL_R, 0, -Math.cos(b) * HALL_R, -b), ga = group(arch, Math.sin(b) * HALL_R, 0, -Math.cos(b) * HALL_R, -b);
    // 厚門框(往大廳凸出 1.1)+ 外圈一道凹槽 + 門框正面和門洞內側(門柱裡)都嵌一圈燈帶
    const FD = 1.1;
    const fr = new THREE.Mesh(frameGeo(DOOR_W + .9, DOOR_H + .5, DOOR_W, DOOR_H + .1, .45, FD, -.05), gloss(CD)); fr.position.z = -.35; fr.castShadow = true; ga.add(fr);
    const groove = new THREE.Mesh(frameGeo(DOOR_W + .62, DOOR_H + .36, DOOR_W + .5, DOOR_H + .3, .42, .02, -.03), gloss(CD3, .5)); groove.position.z = FD - .33; ga.add(groove);
    const lineM = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: WARM, emissiveIntensity: 2.6 });
    const ln = new THREE.Mesh(frameGeo(DOOR_W + .22, DOOR_H + .17, DOOR_W + .06, DOOR_H + .06, .4, .02, 0), lineM); ln.position.z = FD - .32; g.add(ln);
    for (const x of [-1, 1]) { const j = new THREE.Mesh(new THREE.BoxGeometry(.02, DOOR_H - .7, .06), lineM); j.position.set(x * (DOOR_W / 2 - .01), DOOR_H / 2 + .1, .2); g.add(j); }   // 門柱內側的直燈
    const jt = new THREE.Mesh(new THREE.BoxGeometry(DOOR_W - .7, .02, .06), lineM); jt.position.set(0, DOOR_H + .04, .2); g.add(jt);
    contact(ga, 0, .75, DOOR_W + 1.6, 1.6, .28);
    const statusM = glow(0x5cf09a, 2.6); const status = new THREE.Mesh(new THREE.CapsuleGeometry(.035, .1, 4, 8), statusM); status.position.set(DOOR_W / 2 + .42, 1.55, FD - .32); g.add(status);
    const poolM = tintMat('pool', new THREE.Color(acc).offsetHSL(0, .3, -.12), .7);
    const pool = new THREE.Mesh(new THREE.PlaneGeometry(DOOR_W + 1.2, 3.4), poolM); pool.rotation.x = -Math.PI / 2; pool.position.set(0, .024, 1.55 + 1.7); g.add(pool);   // 從門口平台的前緣開始往大廳淡出
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
    const R = group(ga, 0, 0, 0);
    const floorC = { kitty: 0xf6d6e0, stocks: 0xdfe8e6, ocean: 0xe9d6a8, planet: 0x3a2466, rails: 0xd9b88f }[room.key] ?? 0xeeeeee;
    box(R, DOOR_W + .4, .06, ALC_D, gloss(floorC, .3), { y: .03, z: -ALC_D / 2, r: 0, shadow: false });
    const inner = glossNew(new THREE.Color(CD2).lerp(new THREE.Color(cfg.wall), .25).getHex(), .4);   // 滑過時會變色,每間自己一個
    for (const x of [-1, 1]) box(R, .1, DOOR_H + .4, ALC_D, inner, { x: x * (DOOR_W / 2 + .25), y: (DOOR_H + .4) / 2, z: -ALC_D / 2, r: 0 });
    box(R, DOOR_W + .6, .1, ALC_D + .2, gloss(CD), { y: DOOR_H + .42, z: -ALC_D / 2, r: 0 });
    const cl = new THREE.Mesh(new THREE.PlaneGeometry(DOOR_W - .3, .25), warmM(2.2)); cl.rotation.x = Math.PI / 2; cl.position.set(0, DOOR_H + .36, -ALC_D / 2); R.add(cl);
    const bt = canvasTex(512, 512, (cx, W, H) => BACK[room.key](cx, W, H, rand(i + 3)));
    const back = new THREE.Mesh(new THREE.PlaneGeometry(DOOR_W + .4, DOOR_H + .4), new THREE.MeshStandardMaterial({ map: bt, emissiveMap: bt, emissive: 0xffffff, emissiveIntensity: .55, roughness: .8 }));
    back.position.set(0, (DOOR_H + .4) / 2, -ALC_D + .02); R.add(back);
    const cabLight = props(R, room.key, new THREE.Color(acc).lerp(new THREE.Color(WARM), .5).getHex());
    box(ga, DOOR_W + .3, .08, .8, gloss(CD2), { y: .04, z: 1.15, r: .03, shadow: false });     // 門口的小平台
    const hit = new THREE.Mesh(new THREE.BoxGeometry(3.2, 5.2, 2.2), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })); hit.position.set(0, 2.6, .3); g.add(hit);
    hit.userData.door = i;
    return { i, b, g, ln, status, edgeM: lineM, lineM, hit, bar, barM, BAR_W, enter, enterM, cabLight, statusM, poolM, backM: back.material, innerM: inner, open: 0, hover: 0, acc: new THREE.Color(acc), world: (dist = 0, y = 1.5) => g.localToWorld(new THREE.Vector3(0, y, dist)) };
  });

  // ---------- 天花板:一圈斜的大窗(看得到太空和地球)+ 頂上的圓形天窗 + 放射狀的樑 + 中央吊柱 ----------
  const winTex = (() => {
    const W = 2048, H = 512, sky = spaceView(W, H, { seed: 5 }).image;
    return canvasTex(W, H, (g) => { g.fillStyle = '#f0eee9'; g.fillRect(0, 0, W, H); const N = 16, ww = W / N;
      for (let k = 0; k < N; k++) { g.save(); g.beginPath(); g.roundRect(k * ww + 14, 40, ww - 28, H - 80, 26); g.clip(); g.drawImage(sky, 0, 0); g.restore();
        g.strokeStyle = '#ffd9a8'; g.lineWidth = 5; g.beginPath(); g.roundRect(k * ww + 10, 36, ww - 20, H - 72, 28); g.stroke(); } });
  })();
  const clere = new THREE.Mesh(new THREE.CylinderGeometry(5.6, HALL_R + .5, 3.0, 64, 1, true), new THREE.MeshStandardMaterial({ map: winTex, emissiveMap: winTex, emissive: 0xffffff, emissiveIntensity: .2, roughness: .3, side: THREE.BackSide }));
  clere.position.y = WALL_H + 1.5; arch.add(clere);
  const ceil = new THREE.Mesh(new THREE.RingGeometry(3.0, 5.62, 96), gloss(CD)); ceil.rotation.x = Math.PI / 2; ceil.position.y = CEIL_Y; arch.add(ceil);
  for (let k = 0; k < 12; k++) { const b = k / 12 * Math.PI * 2, p = group(arch, 0, 0, 0, -b);
    box(p, .3, .25, 2.7, gloss(CD2), { y: CEIL_Y - .12, z: -4.3, r: .06 });
    const l = new THREE.Mesh(new THREE.BoxGeometry(.06, .02, 2.5), warmM(2.6)); l.position.set(0, CEIL_Y - .25, -4.3); p.add(l); }
  const ocu = new THREE.Mesh(new THREE.CircleGeometry(3.0, 64), new THREE.MeshBasicMaterial({ map: earthView(), color: new THREE.Color(1.15, 1.15, 1.2), toneMapped: false }));
  ocu.rotation.x = Math.PI / 2; ocu.position.y = CEIL_Y + .4; arch.add(ocu);
  const ocuF = new THREE.Mesh(new THREE.TorusGeometry(3.0, .22, 16, 96), gloss(CD)); ocuF.rotation.x = Math.PI / 2; ocuF.position.y = CEIL_Y + .1; arch.add(ocuF);
  const ocuL = new THREE.Mesh(new THREE.TorusGeometry(2.8, .03, 8, 96), warmM(3)); ocuL.rotation.x = Math.PI / 2; ocuL.position.y = CEIL_Y - .05; arch.add(ocuL);
  const topRing = new THREE.Mesh(new THREE.TorusGeometry(HALL_R + .2, .05, 8, 128), warmM(2.6)); topRing.rotation.x = Math.PI / 2; topRing.position.y = WALL_H + .02; arch.add(topRing);
  // 中央吊柱(從天窗中間垂下來,底部是投影發射器)
  for (const [y0, y1, rr] of [[CEIL_Y + .4, 6.4, .34]]) { cyl(arch, rr, rr, y0 - y1, gloss(CD), { y: (y0 + y1) / 2, seg: 24 });
    for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2, l = new THREE.Mesh(new THREE.BoxGeometry(.04, y0 - y1 - .6, .04), warmM(2.8)); l.position.set(Math.sin(a) * (rr + .01), (y0 + y1) / 2, Math.cos(a) * (rr + .01)); arch.add(l); } }
  cyl(arch, .55, .3, .4, gloss(CD), { y: 6.25, seg: 32 });
  const emit = new THREE.Mesh(new THREE.TorusGeometry(.62, .035, 8, 64), glow(0x6cc6ff, 3.2)); emit.rotation.x = Math.PI / 2; emit.position.y = 6.05; arch.add(emit);
  const emitRing = new THREE.Mesh(new THREE.TorusGeometry(1.15, .012, 6, 96), glow(0x8fd4ff, 2.6)); emitRing.rotation.x = Math.PI / 2; emitRing.position.y = 6.0; arch.add(emitRing);

  // ---------- 中央:平的地板,只用嵌在地上的光環分區 + 發光地球儀 + 戰艦投影 ----------
  const ped = group(root, 0, 0, 0), pedArch = group(arch, 0, 0, 0);
  const inlay = (r0, r1, m, y = .02) => { const g = new THREE.Mesh(new THREE.RingGeometry(r0, r1, 160), m); g.rotation.x = -Math.PI / 2; g.position.y = y; pedArch.add(g); return g; };
  inlay(4.3, 4.36, warmM(2.8)); inlay(3.62, 3.67, warmM(2.8)); inlay(3.67, 4.3, gloss(CD2, .2), .016);   // 兩圈暖光之間是一圈淡一點的地板
  for (let k = 0; k < 36; k++) { const b = k / 36 * Math.PI * 2, l = new THREE.Mesh(new THREE.PlaneGeometry(.04, .5), warmM(1.8)); l.rotation.x = -Math.PI / 2; l.rotation.z = -b; const p = at(b, 3.98, .022); l.position.copy(p); pedArch.add(l); }
  const padTex = canvasTex(512, 512, (g, W) => { g.fillStyle = '#0c1a36'; g.fillRect(0, 0, W, W); g.strokeStyle = 'rgba(127,208,255,.7)';
    for (let k = 1; k < 9; k++) { g.lineWidth = k % 3 ? 2 : 5; g.beginPath(); g.arc(W / 2, W / 2, k * 28, 0, Math.PI * 2); g.stroke(); }
    for (let k = 0; k < 24; k++) { const a = k / 24 * Math.PI * 2; g.beginPath(); g.moveTo(W / 2 + Math.cos(a) * 60, W / 2 + Math.sin(a) * 60); g.lineTo(W / 2 + Math.cos(a) * 250, W / 2 + Math.sin(a) * 250); g.stroke(); } });
  const pad = new THREE.Mesh(new THREE.CircleGeometry(2.0, 64), new THREE.MeshBasicMaterial({ map: padTex, toneMapped: false })); pad.rotation.x = -Math.PI / 2; pad.position.y = .024; pedArch.add(pad);
  const r3 = new THREE.Mesh(new THREE.TorusGeometry(2.02, .04, 8, 96), glow(0x6cc6ff, 3)); r3.rotation.x = Math.PI / 2; r3.position.y = .03; pedArch.add(r3);
  // ---------- 中央全息:旋轉的地球(藍球 + 點狀大陸 + 經緯線 + 光暈 + 兩圈軌道)+ 上方戰艦投影 + 往上飄的光點 ----------
  // 大陸形狀:球面上的 3D 雜訊(fbm)決定哪裡是陸地 → 自然的不規則海岸線
  const hash = (x, y, z) => { const h = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return h - Math.floor(h); };
  const vnoise = (x, y, z) => { const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z), xf = x - xi, yf = y - yi, zf = z - zi, sm = (t) => t * t * (3 - 2 * t), u = sm(xf), v = sm(yf), w = sm(zf);
    const L = (a, b, t) => a + (b - a) * t, c = (dx, dy, dz) => hash(xi + dx, yi + dy, zi + dz);
    return L(L(L(c(0, 0, 0), c(1, 0, 0), u), L(c(0, 1, 0), c(1, 1, 0), u), v), L(L(c(0, 0, 1), c(1, 0, 1), u), L(c(0, 1, 1), c(1, 1, 1), u), v), w); };
  const fbm = (x, y, z) => { let a = .5, f = 1.6, s = 0; for (let o = 0; o < 4; o++) { s += a * vnoise(x * f + 11, y * f + 7, z * f + 3); a *= .5; f *= 2.1; } return s; };
  // ---- 陸地遮罩:跟 SphereGeometry 的 UV 對齊(u = 經度、v = 緯度),每格問 fbm「這裡是不是陸地」----
  const MW = 512, MH = 256, mask = new Uint8Array(MW * MH);
  for (let y = 0; y < MH; y++) { const th = (y + .5) / MH * Math.PI, st = Math.sin(th), ct = Math.cos(th);
    for (let x = 0; x < MW; x++) { const ph = (x + .5) / MW * Math.PI * 2, px = -Math.cos(ph) * st, pz = Math.sin(ph) * st;
      mask[y * MW + x] = fbm(px, ct, pz) > .495 && Math.abs(ct) < .9 ? 1 : 0; } }
  const isLand = (x, y) => mask[Math.min(MH - 1, Math.max(0, y)) * MW + ((x % MW) + MW) % MW];
  // ---- 金色大陸貼圖:柔和的金色底光 → 一層密密的光點(像夜裡的城市燈,赤道偏橘、往兩極變淡黃)→ 更亮的海岸線 ----
  const landTex = canvasTex(2048, 1024, (g, W, H) => {
    const mc = document.createElement('canvas'); mc.width = MW; mc.height = MH; const mg = mc.getContext('2d'), id = mg.createImageData(MW, MH);
    for (let i = 0; i < MW * MH; i++) { id.data[i * 4] = 255; id.data[i * 4 + 1] = 190; id.data[i * 4 + 2] = 80; id.data[i * 4 + 3] = mask[i] ? 42 : 0; }
    mg.putImageData(id, 0, 0); g.imageSmoothingEnabled = true; g.drawImage(mc, 0, 0, W, H);             // 放大時自然變柔 → 底光
    const r = rand(44), sx = W / MW, sy = H / MH;
    for (let y = 3; y < H; y += 7) for (let x = 3; x < W; x += 7) {
      if (!isLand(x / sx | 0, y / sy | 0)) continue;
      const lat = Math.abs(y / H - .5) * 2, k = r();                                                        // lat 0 = 赤道、1 = 極
      const R = 255, G = 200 + lat * 45 + k * 10 | 0, B = 90 + lat * 110 + k * 30 | 0;
      g.fillStyle = `rgba(${R},${G},${B},${.8 + k * .2})`; g.beginPath(); g.arc(x, y, 1.1 + k * 1.3, 0, Math.PI * 2); g.fill();
    }
    g.fillStyle = 'rgba(255,240,190,1)';                                                                    // 海岸線:陸地格子旁邊是海的地方
    for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) if (isLand(x, y) && (!isLand(x + 1, y) || !isLand(x - 1, y) || !isLand(x, y + 1) || !isLand(x, y - 1))) g.fillRect(x * sx, y * sy, sx * .9, sy * .9);
  });
  const globe = group(ped, 0, 1.5, 0); globe.scale.setScalar(.9);
  const spin = group(globe, 0, 0, 0); spin.rotation.z = .41;                                                    // 地軸傾斜
  // 地球本體:海洋從中心的深藏青 → 藍 → 邊緣帶一點紫(依視角漸層),金色大陸比白還亮 → 會發出柔光(bloom)
  const globeU = { uLand: { value: landTex }, uTime: { value: 0 } };
  spin.add(new THREE.Mesh(new THREE.SphereGeometry(.97, 96, 64), new THREE.ShaderMaterial({ uniforms: globeU,
    vertexShader: 'varying vec2 vUv; varying vec3 vN, vV; void main(){ vUv = uv; vec4 wp = modelMatrix * vec4(position, 1.0); vN = normalize(mat3(modelMatrix) * normal); vV = normalize(cameraPosition - wp.xyz); gl_Position = projectionMatrix * viewMatrix * wp; }',
    fragmentShader: `uniform sampler2D uLand; uniform float uTime; varying vec2 vUv; varying vec3 vN, vV;
      void main(){
        float f = 1.0 - abs(dot(normalize(vN), normalize(vV)));
        vec3 ocean = mix(vec3(.015, .04, .16), vec3(.05, .22, .62), smoothstep(.0, .75, f));
        ocean = mix(ocean, vec3(.42, .3, .95), smoothstep(.62, 1.0, f));
        vec4 land = texture2D(uLand, vUv);
        float flick = .92 + .08 * sin(uTime * 2.3 + vUv.x * 40.0);
        vec3 col = ocean * (1.0 - land.a * .55) + land.rgb * land.a * 2.0 * flick;
        col += vec3(1.0, .82, .45) * smoothstep(.985, 1.0, sin(vUv.y * 90.0 - uTime * 1.6)) * .06;     // 一道淡淡的掃描線往上跑
        gl_FragColor = vec4(col, 1.0);
      }` })));
  // 經緯線(淡青)
  const geoOf = (arr) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3)); return g; };
  { const v = [], R1 = 1.0, ring = (fn) => { for (let k = 0; k < 96; k++) { const a0 = k / 96 * Math.PI * 2, a1 = (k + 1) / 96 * Math.PI * 2; v.push(...fn(a0), ...fn(a1)); } };
    for (let lat = -60; lat <= 60; lat += 30) { const p = lat * Math.PI / 180, y = Math.sin(p) * R1, r = Math.cos(p) * R1; ring((a) => [Math.cos(a) * r, y, Math.sin(a) * r]); }
    for (let lon = 0; lon < 180; lon += 30) { const q = lon * Math.PI / 180; ring((a) => [Math.cos(a) * Math.cos(q) * R1, Math.sin(a) * R1, Math.cos(a) * Math.sin(q) * R1]); }
    spin.add(new THREE.LineSegments(geoOf(v), new THREE.LineBasicMaterial({ color: 0x7fd8ff, transparent: true, opacity: .22, depthWrite: false }))); }
  // 大氣層:輪廓一圈光,顏色由下往上從青 → 洋紅
  const rim = new THREE.Mesh(new THREE.SphereGeometry(1.07, 64, 48), new THREE.ShaderMaterial({ transparent: true, depthWrite: false,
    vertexShader: 'varying vec3 vN, vV, vP; void main(){ vP = position; vec4 wp = modelMatrix * vec4(position, 1.0); vN = normalize(mat3(modelMatrix) * normal); vV = normalize(cameraPosition - wp.xyz); gl_Position = projectionMatrix * viewMatrix * wp; }',
    fragmentShader: 'varying vec3 vN, vV, vP; void main(){ float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.2); vec3 c = mix(vec3(.25, .85, 1.0), vec3(1.0, .4, .95), smoothstep(-1.0, 1.0, vP.y)); gl_FragColor = vec4(c * 1.7, f * .9); }' }));
  globe.add(rim);
  // 背後的光暈:中心偏金、往外變藍再淡出
  const haloT = canvasTex(256, 256, (g) => { const gr = g.createRadialGradient(128, 128, 30, 128, 128, 128); gr.addColorStop(0, 'rgba(255,205,120,.55)'); gr.addColorStop(.45, 'rgba(110,170,255,.3)'); gr.addColorStop(1, 'rgba(160,110,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 256, 256); });
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloT, transparent: true, opacity: .85, depthWrite: false })); halo.scale.setScalar(3.6); halo.renderOrder = -1; globe.add(halo);
  // 兩圈軌道:沿著環流動的漸層(青 → 金 → 洋紅),各一顆金色小衛星
  const orbitU = { uTime: globeU.uTime };
  const orbit = (r, tiltX, tiltY, off) => { const p = group(globe, 0, 0, 0); p.rotation.set(tiltX, tiltY, 0);
    const ringM = new THREE.Mesh(new THREE.TorusGeometry(r, .011, 6, 200), new THREE.ShaderMaterial({ uniforms: orbitU, transparent: true, depthWrite: false,
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `uniform float uTime; varying vec2 vUv; void main(){ float t = fract(vUv.x + uTime * .06 + ${off.toFixed(2)});
        vec3 c = t < .33 ? mix(vec3(.3, .85, 1.0), vec3(1.0, .78, .35), t / .33) : t < .66 ? mix(vec3(1.0, .78, .35), vec3(1.0, .4, .9), (t - .33) / .33) : mix(vec3(1.0, .4, .9), vec3(.3, .85, 1.0), (t - .66) / .34);
        gl_FragColor = vec4(c * 1.15, .95); }` }));
    ringM.rotation.x = Math.PI / 2; p.add(ringM);
    const sat = sphere(p, .04, new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffd27a).multiplyScalar(2.6), toneMapped: false })); return { p, sat, r }; };
  const orbits = [orbit(1.5, -.35, 0, 0), orbit(1.72, .5, .6, .5)];
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
  for (const s of [-1, 1]) { contact(arch, s * 3.6, 5.6, 1.9, 1.9, .32); box(arch, 1.0, .7, 1.0, gloss(0xffffff), { x: s * 3.6, y: .35, z: 5.6, r: .12 }); plant(arch, { x: s * 3.6, y: .7, z: 5.6, r: .32, h: .2, pot: 0xffffff, len: 1.0, n: 14 }); }

  // ---------- 圓形沙發(兩側) ----------
  const sofaM = gloss(CD2, .85), cushM = gloss(0xfaf8f4, .9);
  for (const s of [-1, 1]) {
    const px = s * 5.7, pz = 1.2, so = group(arch, px, 0, pz, Math.atan2(-px, -pz));
    contact(arch, px, pz, 3.0, 3.0, .38); cyl(so, 1.12, 1.12, .12, gloss(CD3), { y: .06, seg: 48 });
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
  const shadowBlob = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.1), tintMat('blob', 0x6a645a, 1)); shadowBlob.rotation.x = -Math.PI / 2; shadowBlob.position.y = .021; bot.add(shadowBlob);
  bot.traverse((o) => { if (o.isMesh) o.castShadow = true; }); bot.scale.setScalar(1.35);
  const AVOID = [[-5.6, 1.0, 1.9], [5.5, 1.0, 1.8], [-3.6, 5.6, 1.1], [3.6, 5.6, 1.1]];      // 休息區、入口花盆:[x, z, 半徑]
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
  const holoLight = new THREE.PointLight(0xffc874, 3, 6, 1.6);   // 地球的金光 holoLight.position.set(0, 1.5, 0); root.add(holoLight);

  // ---------- 效能:不會動的東西依材質合併成少數幾個網格(draw call 從上千降到幾百)----------
  const skip = new Set([bot, globe, holo, motes, dust, emitRing, ...plants, ...doors.flatMap((d) => [d.bar, d.enter])]); if (mirror) skip.add(mirror);
  mergeStatic(arch, skip);
  // 葉子、艙裡的小道具不投陰影(地上的接觸陰影就夠了),省掉陰影那一輪的大量繪製
  for (const p of plants) p.traverse((o) => { o.castShadow = false; });
  for (const d of doors) d.g.traverse((o) => { if (o.isMesh && o.geometry.parameters?.height !== undefined && o !== d.hit) o.castShadow = false; });
  // 地板反射每兩幀更新一次(倒影本來就柔,看不出差別),反射那一輪的成本減半
  if (mirror) { const orig = mirror.onBeforeRender; let f = 0; mirror.onBeforeRender = function (...a) { if ((f++ & 1) === 0) orig.apply(this, a); }; }
  // ---------- 烘焙版建築(Blender 建模 + Cycles 烘光,tools/blender/hall_bake.py 產生)----------
  // 載入前先顯示上面用程式蓋的大廳;載入後把 arch 整組換掉。植物家具是另一個檔(原本材質、即時打光)。
  let baked = false; const propPlants = [];
  const gl = new GLTFLoader(), draco = new DRACOLoader(); draco.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/'); gl.setDRACOLoader(draco);
  const loadGLB = (url) => new Promise((ok, fail) => gl.load(url, (g) => ok(g.scene), undefined, fail));
  Promise.all([loadGLB('/assets/starship/models/hall_baked.glb?v=3'), loadGLB('/assets/starship/models/hall_props.glb?v=3')]).then(([hallM, propsM]) => {
    hallM.traverse((o) => {
      if (!o.isMesh) return;
      const src = o.material, m = new THREE.MeshBasicMaterial({ map: src.map || src.emissiveMap, toneMapped: false });   // 光影都烘在貼圖裡 → 不受光
      if (o.name.startsWith('baked_floor') && mirror) { m.transparent = true; m.opacity = .9; o.renderOrder = -2; mirror.position.y = -.012; }   // 讓即時的地板倒影透一點出來(鏡面放到磚面底下,不然會搶深度)
      if (o.name.startsWith('screen_')) m.color.setScalar(.9);
      o.material = m; src.dispose(); o.matrixAutoUpdate = false; o.updateMatrix();
    });
    propsM.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; }
      if (/^prop_(anthurium|calathea|pachira|potted)/.test(o.name) && o.parent === propsM) propPlants.push({ o, rz: o.rotation.z, rx: o.rotation.x, ph: Math.random() * 6 }); });
    root.add(hallM, propsM);
    root.remove(arch); arch.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); } });
    plants.length = 0; baked = true;
    for (const d of doors) { d.ln.position.z = .88; d.status.position.z = .88; }   // 烘焙版的門框比較厚,燈帶往前一點
  }).catch((e) => console.warn('[hall] 烘焙模型載入失敗,用程式蓋的版本', e));

  const _v = new THREE.Vector3(), warmC = new THREE.Color(WARM);
  return {
    root, doors, hits: doors.map((d) => d.hit), get baked() { return baked; },
    update(t, dt) {
      stepBot(t, Math.min(dt, .05));
      globeU.uTime.value = t; spin.rotation.y = t * .12; holo.rotation.y = -t * .3; holo.position.y = 2.6 + Math.sin(t * 1.2) * .05; globe.position.y = 1.5 + Math.sin(t * .8) * .03;
      orbits.forEach((o, k) => { const a = t * (k ? -.5 : .7) + k * 2; o.sat.position.set(Math.cos(a) * o.r, 0, Math.sin(a) * o.r); });
      emitRing.scale.setScalar(1 + Math.sin(t * 2) * .04);
      for (let k = 0; k < PN; k++) { const p = pSeed[k]; p.y += p.v * dt; if (p.y > 3.4) p.y = 0; pPos.set([Math.cos(p.a + t * .1) * p.r * (1 - p.y * .12), p.y + .05, Math.sin(p.a + t * .1) * p.r * (1 - p.y * .12)], k * 3); }
      pGeo.attributes.position.needsUpdate = true;
      for (let k = 0; k < DN; k++) { const d = dSeed[k]; d.y -= dt * .05 * d.s; if (d.y < 0) d.y = CEIL_Y; dPos.set([Math.cos(d.a + t * .02 * d.s) * d.r, d.y, Math.sin(d.a + t * .02 * d.s) * d.r], k * 3); }
      dGeo.attributes.position.needsUpdate = true;
      leds.forEach((l, k) => { l.material.emissiveIntensity = ((t * .7 + k * .37) % 1) < .8 ? 2.6 : .4; });
      for (const d of doors) {
        const k = Math.max(d.hover, d.open);
        d.lineM.emissive.copy(warmC).lerp(d.acc, k * .8); d.lineM.emissiveIntensity = 2.6 + k * 2.4;
        d.cabLight.intensity = 3 + d.hover * 7; d.poolM.uniforms.uK.value = .7 + d.hover * .3;
        d.statusM.emissive.setHex(0x5cf09a).lerp(d.acc, d.hover); d.statusM.emissiveIntensity = (((t * .5 + d.i * .2) % 1) < .85 ? 2.6 : .6) + d.hover * 2; d.backM.emissiveIntensity = .55 + d.hover * .5; d.innerM.emissiveIntensity = d.hover * .25;   // 滑到哪一艙,那一艙亮起來
        d.innerM.emissive.copy(d.acc);
        // 燈條:平常 35% 長、很慢地呼吸;滑過時亮一點;點擊(open)時一路掃到 100%
        const fill = .35 + (1 - .35) * d.open, br = .55 + .45 * (.5 + .5 * Math.sin(t * .8 + d.i * 1.3));
        d.bar.scale.x = d.BAR_W * fill; d.bar.position.x = -d.BAR_W / 2 + d.BAR_W * fill / 2;
        d.barM.color.setRGB(.16, .58, .9).multiplyScalar(.55 + Math.max(br, d.hover) * 1.1 + d.open * .8);   // 冰藍(白底上要深一點才看得到)
        d.enterM.opacity = d.hover; d.enter.position.y = -.8 + d.hover * .08;
      }
      for (const p of propPlants) { const x = p.o.position.x, tt = t - x * .09, w = Math.max(0, .35 + .4 * Math.sin(tt * .55) + .25 * Math.sin(tt * 1.37 + 1.2));
        p.o.rotation.x = p.rx + Math.sin(t * 1.7 + p.ph) * .012 * (.4 + w); p.o.rotation.z = p.rz + w * .025 + Math.sin(t * 2.3 + p.ph) * .01; }
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
