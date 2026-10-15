// 星艦首頁共用的小工具:圓角方塊、圓柱、球、木紋 / 艙壁面板貼圖、陶盆、植物。
// 寫法照 catinsight-3d/room.mjs(同一套品質標準):RoundedBoxGeometry、柔和的粗糙度、每個東西都有陰影
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

export const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.82, metalness: 0.0, ...extra });
export const glow = (color, i = 2.4) => new THREE.MeshStandardMaterial({ color: 0x000000, emissive: color, emissiveIntensity: i, roughness: 1 });

function place(m, parent, { x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, shadow = true } = {}) {
  m.position.set(x, y, z); m.rotation.set(rx, ry, rz); m.castShadow = shadow; m.receiveShadow = true; parent.add(m); return m;
}
export function box(parent, w, h, d, color, o = {}) {
  const r = o.r ?? 0.05;
  const g = r > 0 ? new RoundedBoxGeometry(w, h, d, o.seg ?? 3, Math.min(r, w / 2, h / 2, d / 2)) : new THREE.BoxGeometry(w, h, d);
  return place(new THREE.Mesh(g, color?.isMaterial ? color : mat(color, o.m)), parent, o);
}
export function cyl(parent, rt, rb, h, color, o = {}) {
  return place(new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, o.seg ?? 28), color?.isMaterial ? color : mat(color, o.m)), parent, o);
}
export function sphere(parent, r, color, o = {}) {
  return place(new THREE.Mesh(new THREE.SphereGeometry(r, o.seg ?? 28, Math.round((o.seg ?? 28) * .7)), color?.isMaterial ? color : mat(color, o.m)), parent, o);
}
export function group(parent, x = 0, y = 0, z = 0, ry = 0) { const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = ry; parent.add(g); return g; }

// 木紋(room.mjs 同一支):along 'u' 橫紋、'v' 直紋
export function woodTex(w, h, along, base = '#e9cfa6', ink = [150, 105, 60]) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h; const g = cv.getContext('2d');
  g.fillStyle = base; g.fillRect(0, 0, w, h);
  const L = along === 'u' ? w : h, S = along === 'u' ? h : w;
  for (let i = 0; i < 70; i++) {
    const o = Math.random() * S, amp = 2 + Math.random() * 6, fr = 0.004 + Math.random() * 0.01, ph = Math.random() * 6, a = 0.06 + Math.random() * 0.12;
    g.strokeStyle = `rgba(${ink[0] + Math.random() * 30 | 0},${ink[1] + Math.random() * 25 | 0},${ink[2] + Math.random() * 20 | 0},${a})`; g.lineWidth = 0.6 + Math.random() * 1.6; g.beginPath();
    for (let t = 0; t <= L; t += 8) { const q = o + Math.sin(t * fr + ph) * amp + Math.sin(t * fr * 3.7 + ph) * amp * 0.3; along === 'u' ? (t ? g.lineTo(t, q) : g.moveTo(t, q)) : (t ? g.lineTo(q, t) : g.moveTo(q, t)); }
    g.stroke();
  }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}

// 艙壁面板:大面板 + 接縫 + 小鉚釘 + 偶爾一塊小儀表/通風格柵(星艦內裝的感覺)
export function panelTex(base = '#eef0f6', seam = 'rgba(110,120,150,.28)', w = 1024, h = 1024, cols = 4, rows = 3) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h; const g = cv.getContext('2d');
  g.fillStyle = base; g.fillRect(0, 0, w, h);
  const pw = w / cols, ph = h / rows;
  for (let c = 0; c < cols; c++) for (let r = 0; r < rows; r++) {
    const x = c * pw, y = r * ph;
    const gr = g.createLinearGradient(x, y, x, y + ph); gr.addColorStop(0, 'rgba(255,255,255,.18)'); gr.addColorStop(1, 'rgba(0,0,20,.05)');
    g.fillStyle = gr; g.fillRect(x + 4, y + 4, pw - 8, ph - 8);
    g.strokeStyle = seam; g.lineWidth = 4; g.strokeRect(x + 2, y + 2, pw - 4, ph - 4);
    g.fillStyle = seam; for (const [ax, ay] of [[12, 12], [pw - 12, 12], [12, ph - 12], [pw - 12, ph - 12]]) { g.beginPath(); g.arc(x + ax, y + ay, 3.5, 0, Math.PI * 2); g.fill(); }
    if ((c * 7 + r * 3) % 5 === 0) { g.strokeStyle = 'rgba(110,120,150,.32)'; g.lineWidth = 3; for (let k = 0; k < 6; k++) { g.beginPath(); g.moveTo(x + pw * .25, y + ph * .35 + k * 10); g.lineTo(x + pw * .75, y + ph * .35 + k * 10); g.stroke(); } }
  }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}

// 陶盆(車床輪廓,有捲邊)+ 土
export function pot(parent, r = 0.3, h = 0.42, color = 0xd9784f, o = {}) {
  const g = group(parent, o.x || 0, o.y || 0, o.z || 0);
  const pts = [[0, 0.004], [r * .73, 0.004], [r * .78, 0.02], [r * .87, h * .74], [r * .97, h * .76], [r, h * .82], [r, h * .97], [r * .97, h], [r * .92, h * .95], [0, h * .95]].map(([a, b]) => new THREE.Vector2(a, b));
  const m = new THREE.Mesh(new THREE.LatheGeometry(pts, 48), mat(color, { roughness: 0.78 })); m.castShadow = m.receiveShadow = true; g.add(m);
  cyl(g, r * .92, r * .92, 0.012, 0x4a3426, { y: h * .95 });
  return g;
}
// 葉子植物:一叢往外彎的長葉(每片是壓扁的球,沿弧線排開)
export function leafyPlant(parent, o = {}) {
  const g = pot(parent, o.r ?? 0.28, o.h ?? 0.4, o.pot ?? 0xf0f0f4, o);
  const leafM = mat(o.leaf ?? 0x35b98a, { roughness: 0.55 }), leafM2 = mat(o.leaf2 ?? 0x2a9a72, { roughness: 0.55 });
  const n = o.n ?? 11, top = (o.h ?? 0.4) * .95;
  for (let i = 0; i < n; i++) {
    const a = i / n * Math.PI * 2 + Math.random() * .3, tilt = 0.35 + Math.random() * .55, len = (o.len ?? 0.75) * (0.7 + Math.random() * .5);
    const stem = new THREE.Group(); stem.position.y = top; stem.rotation.set(0, a, 0); g.add(stem);
    const arm = new THREE.Group(); arm.rotation.z = -tilt; stem.add(arm);
    const leaf = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), i % 2 ? leafM : leafM2);
    leaf.scale.set(0.09, len / 2, 0.025); leaf.position.y = len / 2; leaf.castShadow = true; arm.add(leaf);
  }
  return g;
}
export function rand(seed) { let s = seed; return () => { s = (s * 16807) % 2147483647; return s / 2147483647; }; }

// 文字貼圖(招牌 / 標籤)
export function textTex(lines, { w = 1024, h = 256, bg = 'rgba(0,0,0,0)', color = '#fff', font = '700 110px "Helvetica Neue", sans-serif', align = 'center' } = {}) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h; const g = cv.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  g.fillStyle = color; g.font = font; g.textAlign = align; g.textBaseline = 'middle';
  const L = Array.isArray(lines) ? lines : [lines];
  L.forEach((s, i) => g.fillText(s, align === 'center' ? w / 2 : 40, h / 2 + (i - (L.length - 1) / 2) * h / (L.length + .4)));
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}
