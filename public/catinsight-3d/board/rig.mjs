// 骨架角色的表情(Tripo 生成、tools/blender/rig_bunny*.py + rig_chars.py 綁骨架與做 Face 貼片)。board.mjs 和 rig-test.html 共用
import * as THREE from 'three';
// 表情:臉上那片貼片的 UV 是正面平面投影(box 範圍),五官座標用同一套單位(x 往角色左手邊、z 往上)
// 各角色的設定,key = 模型檔名。box = 貼片範圍(要和 tools/blender/rig_chars.py 的 face_box 一樣);eye/mouth = 五官中心;s = 五官大小倍率
const FACE_W = 512;
const FACES = {
  bunny: { box: [-0.40, 0.40, -0.30, 0.12], eyeX: 0.22, eyeZ: -0.015, mouthZ: -0.113, s: 1 },
  // 貓是無五官模型:眼睛、鼻子、嘴、腮紅、鬍鬚全部由貼片畫
  kitty: { box: [-0.68, 0.68, -0.02, 0.42], eyeX: 0.251, eyeZ: 0.275, mouthZ: 0.125, s: 1.2,
           nose: { z: 0.199, w: 0.032, h: 0.024, color: '#f0909c' }, catMouth: true,
           blush: { x: 0.34, z: 0.14, rx: 0.095, ry: 0.06, color: 'rgba(255,135,135,0.6)' },
           whiskers: { x0: 0.44, x1: 0.62, z: [0.19, 0.10], tilt: [0.012, -0.03], color: '#5a3520', w: 0.024 } },
  // 以下也是無五官模型(位置由 tools/blender/measure 腳本量出再微調)
  bear:    { box: [-0.66, 0.66, -0.05, 0.44], eyeX: 0.27, eyeZ: 0.28, mouthZ: 0.07, s: 1.2,
             nose: { z: 0.165, w: 0.04, h: 0.028, color: '#4a2a1a' }, blush: { x: 0.36, z: 0.14, rx: 0.09, ry: 0.055, color: 'rgba(255,120,110,0.5)' } },
  bear_m:  { box: [-0.62, 0.62, 0.0, 0.5], eyeX: 0.265, eyeZ: 0.30, mouthZ: 0.15, s: 1.2,   // 程式建模的熊
             nose: { z: 0.245, w: 0.045, h: 0.03, color: '#4a2a1a' }, blush: { x: 0.39, z: 0.17, rx: 0.08, ry: 0.055, color: 'rgba(255,120,110,0.5)' } },
  // 以下也是程式建模(build_toy.py),頭的大小位置都和 bear_m 一樣
  kitty_m:   { box: [-0.62, 0.62, 0.0, 0.5], eyeX: 0.255, eyeZ: 0.30, mouthZ: 0.16, s: 1.2, catMouth: true,
               nose: { z: 0.225, w: 0.032, h: 0.024, color: '#f0909c' }, blush: { x: 0.37, z: 0.17, rx: 0.085, ry: 0.055, color: 'rgba(255,135,135,0.6)' },
               whiskers: { x0: 0.44, x1: 0.60, z: [0.23, 0.15], tilt: [0.012, -0.03], color: '#5a3520', w: 0.022 } },
  bunny_m:   { box: [-0.62, 0.62, 0.0, 0.5], eyeX: 0.23, eyeZ: 0.30, mouthZ: 0.20, s: 1.2, blush: { x: 0.36, z: 0.20, rx: 0.085, ry: 0.055, color: 'rgba(255,140,150,0.55)' } },
  pup_m:     { box: [-0.62, 0.62, 0.0, 0.5], eyeX: 0.25, eyeZ: 0.32, mouthZ: 0.15, s: 1.2,
               nose: { z: 0.235, w: 0.05, h: 0.034, color: '#3a2418' }, blush: { x: 0.37, z: 0.18, rx: 0.08, ry: 0.05, color: 'rgba(255,130,130,0.5)' } },
  penguin_m: { box: [-0.62, 0.62, 0.0, 0.5], eyeX: 0.22, eyeZ: 0.38, mouthZ: 0.2, s: 1.2, noMouth: true,   // 嘴喙在模型上
               blush: { x: 0.35, z: 0.25, rx: 0.08, ry: 0.05, color: 'rgba(255,130,140,0.55)' } },
  guinea_m:  { box: [-0.62, 0.62, 0.0, 0.5], eyeX: 0.27, eyeZ: 0.31, mouthZ: 0.16, s: 1.2, catMouth: true,
               nose: { z: 0.225, w: 0.03, h: 0.022, color: '#f0909c' }, blush: { x: 0.39, z: 0.18, rx: 0.085, ry: 0.055, color: 'rgba(255,130,140,0.55)' } },
  fox_m:     { box: [-0.62, 0.62, 0.0, 0.5], eyeX: 0.25, eyeZ: 0.31, mouthZ: 0.15, s: 1.15, catMouth: true,
               nose: { z: 0.215, w: 0.034, h: 0.025, color: '#2a1a14' }, blush: { x: 0.37, z: 0.17, rx: 0.08, ry: 0.05, color: 'rgba(255,120,110,0.5)' } },
  pony_m:    { box: [-0.62, 0.62, 0.0, 0.5], eyeX: 0.22, eyeZ: 0.36, mouthZ: 0.08, s: 1.1,
               blush: { x: 0.36, z: 0.26, rx: 0.07, ry: 0.045, color: 'rgba(255,130,130,0.5)' } },
  pup:     { box: [-0.55, 0.55, -0.15, 0.36], eyeX: 0.21, eyeZ: 0.17, mouthZ: 0.0, s: 1.15,
             nose: { z: 0.08, w: 0.045, h: 0.03, color: '#3a2418' }, blush: { x: 0.33, z: 0.04, rx: 0.08, ry: 0.05, color: 'rgba(255,130,130,0.5)' } },
  penguin: { box: [-0.694, 0.694, -0.002, 0.505], eyeX: 0.25, eyeZ: 0.35, mouthZ: 0.2, s: 1.2, noMouth: true,   // 嘴喙在模型上
             blush: { x: 0.36, z: 0.24, rx: 0.08, ry: 0.05, color: 'rgba(255,130,140,0.55)' } },
  guinea:  { box: [-0.66, 0.66, 0.0, 0.42], eyeX: 0.28, eyeZ: 0.26, mouthZ: 0.1, s: 1.2, catMouth: true,
             nose: { z: 0.17, w: 0.03, h: 0.022, color: '#f0909c' }, blush: { x: 0.38, z: 0.13, rx: 0.09, ry: 0.055, color: 'rgba(255,130,140,0.55)' } },
  fox:     { box: [-0.67, 0.67, -0.072, 0.373], eyeX: 0.26, eyeZ: 0.23, mouthZ: 0.07, s: 1.15, catMouth: true,
             nose: { z: 0.14, w: 0.032, h: 0.024, color: '#2a1a14' }, blush: { x: 0.35, z: 0.1, rx: 0.08, ry: 0.05, color: 'rgba(255,120,110,0.5)' } },
  pony:    { box: [-0.551, 0.551, -0.069, 0.382], eyeX: 0.22, eyeZ: 0.27, mouthZ: 0.0, s: 1.05,
             blush: { x: 0.33, z: 0.14, rx: 0.07, ry: 0.045, color: 'rgba(255,130,130,0.5)' } },
};
export function drawFace(f, expr, blink = false) {
  const D = f.dims, { eyeX: EYE_X, eyeZ: EYE_Z, mouthZ: MOUTH_Z } = D, [x0, x1, , z1] = D.box;
  const c = f.ctx, k = FACE_W / (x1 - x0), X = (x) => (x - x0) * k, Y = (z) => (z1 - z) * k, u = (v) => v * k * D.s;
  c.clearRect(0, 0, c.canvas.width, c.canvas.height);
  if (D.blush) { const b = D.blush, sad = expr === 'sad';   // 腮紅:邊緣柔和的橢圓,難過時淡一點
    for (const s of [-1, 1]) { const bx = X(b.x * s), by = Y(b.z), g = c.createRadialGradient(0, 0, 0, 0, 0, k * b.rx);   // 漸層用平移後的座標
      g.addColorStop(0, sad ? b.color.replace(/[\d.]+\)$/, '0.2)') : b.color); g.addColorStop(1, 'rgba(255,140,140,0)');
      c.save(); c.fillStyle = g; c.translate(bx, by); c.scale(1, b.ry / b.rx); c.beginPath(); c.arc(0, 0, k * b.rx, 0, Math.PI * 2); c.fill(); c.restore(); } }
  if (D.whiskers) { const w = D.whiskers; c.strokeStyle = w.color; c.lineCap = 'round'; c.lineWidth = k * w.w;   // 鬍鬚:兩側各兩根
    for (const s of [-1, 1]) w.z.forEach((z, i) => { c.beginPath(); c.moveTo(X(w.x0 * s), Y(z)); c.quadraticCurveTo(X((w.x0 + w.x1) / 2 * s), Y(z + w.tilt[i] + 0.008), X(w.x1 * s), Y(z + w.tilt[i] * 2)); c.stroke(); }); } c.fillStyle = c.strokeStyle = '#141414'; c.lineCap = c.lineJoin = 'round'; c.lineWidth = u(0.016);
  const mx = X(0.003), my = Y(MOUTH_Z);
  for (const s of [-1, 1]) {
    const ex = X(EYE_X * s), ey = Y(EYE_Z);
    c.beginPath();
    if (blink || expr === 'blink') { c.moveTo(ex - u(0.036), ey + u(0.01)); c.quadraticCurveTo(ex, ey + u(0.03), ex + u(0.036), ey + u(0.01)); c.stroke(); }
    else if (expr === 'happy') { c.lineWidth = u(0.02); c.moveTo(ex - u(0.04), ey + u(0.015)); c.quadraticCurveTo(ex, ey - u(0.06), ex + u(0.04), ey + u(0.015)); c.stroke(); }   // ^ ^
    else if (expr === 'focus') { c.lineWidth = u(0.02); const d = -s; c.moveTo(ex - u(0.035) * d, ey - u(0.035)); c.lineTo(ex + u(0.03) * d, ey); c.lineTo(ex - u(0.035) * d, ey + u(0.035)); c.stroke(); }   // > <
    else if (expr === 'sad') {
      c.ellipse(ex, ey + u(0.012), u(0.032), u(0.045), 0, 0, Math.PI * 2); c.fill();
      c.beginPath(); c.lineWidth = u(0.013); c.moveTo(ex - s * u(0.005), ey - u(0.085)); c.lineTo(ex + s * u(0.05), ey - u(0.06)); c.stroke();   // 八字眉
    }
    else { const wow = expr === 'wow' ? 1.18 : 1; c.ellipse(ex, ey, u(0.036) * wow, u(0.054) * wow, 0, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#fff'; c.beginPath(); c.arc(ex + u(0.012), ey - u(0.022), u(0.011) * wow, 0, Math.PI * 2); c.fill(); c.fillStyle = '#141414'; }   // 眼睛反光
    c.lineWidth = u(0.016);
  }
  c.beginPath();
  if (D.noMouth) { /* 嘴在模型上(企鵝的嘴喙) */ }
  else if (expr === 'happy') { c.moveTo(mx - u(0.06), my - u(0.015)); c.quadraticCurveTo(mx, my - u(0.02), mx + u(0.06), my - u(0.015)); c.quadraticCurveTo(mx, my + u(0.085), mx - u(0.06), my - u(0.015)); c.fill();
    c.fillStyle = '#ff8a95'; c.beginPath(); c.ellipse(mx, my + u(0.035), u(0.03), u(0.016), 0, 0, Math.PI * 2); c.fill(); }   // 張嘴大笑 + 舌頭
  else if (expr === 'sad') { c.moveTo(mx - u(0.045), my + u(0.02)); c.quadraticCurveTo(mx, my - u(0.035), mx + u(0.045), my + u(0.02)); c.stroke();
    c.fillStyle = '#7cc4ff'; c.beginPath(); const tx = X(EYE_X) + u(0.01), ty = Y(EYE_Z) + u(0.075); c.moveTo(tx, ty - u(0.03)); c.quadraticCurveTo(tx + u(0.022), ty + u(0.005), tx, ty + u(0.016)); c.quadraticCurveTo(tx - u(0.022), ty + u(0.005), tx, ty - u(0.03)); c.fill(); }   // 嘴角往下 + 一滴眼淚
  else if (expr === 'wow') { c.ellipse(mx, my + u(0.005), u(0.022), u(0.03), 0, 0, Math.PI * 2); c.fill(); }
  else if (expr === 'focus') { c.ellipse(mx, my, u(0.02), u(0.014), 0, 0, Math.PI * 2); c.fill(); }
  else if (D.catMouth) { c.moveTo(mx - u(0.05), my - u(0.01)); c.quadraticCurveTo(mx - u(0.025), my + u(0.03), mx, my - u(0.008)); c.quadraticCurveTo(mx + u(0.025), my + u(0.03), mx + u(0.05), my - u(0.01)); c.stroke(); }   // 貓的 ω 嘴
  else { c.moveTo(mx - u(0.045), my - u(0.012)); c.quadraticCurveTo(mx, my + u(0.04), mx + u(0.045), my - u(0.012)); c.stroke(); }   // 原本的小微笑
  if (D.nose) { const n = D.nose, nx = X(0), ny = Y(n.z), w = u(n.w), h = u(n.h);   // 圓角倒三角形鼻子
    c.fillStyle = n.color; c.beginPath(); c.moveTo(nx - w, ny - h * 0.6); c.quadraticCurveTo(nx, ny - h * 1.1, nx + w, ny - h * 0.6); c.quadraticCurveTo(nx + w * 0.3, ny + h, nx, ny + h); c.quadraticCurveTo(nx - w * 0.3, ny + h, nx - w, ny - h * 0.6); c.fill(); }
  f.tex.needsUpdate = true;
}
export function setFace(a, expr) { if (!a?.face || (a.face.expr === expr && !a.face.blink)) return; a.face.expr = expr; a.face.blink = false; drawFace(a.face, expr); }
export function makeFace(inst, key = 'bunny') {
  let f = null;
  inst.traverse((o) => { if (!o.userData.face) return;
    const D = FACES[key] || FACES.bunny, cv = document.createElement('canvas'); cv.width = FACE_W; cv.height = Math.round(FACE_W * (D.box[3] - D.box[2]) / (D.box[1] - D.box[0]));
    const tex = new THREE.CanvasTexture(cv); tex.flipY = false; tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;   // flipY=false:和 glTF 的 UV 方向一致
    o.material = o.material.clone(); o.material.map = tex; f = { ctx: cv.getContext('2d'), tex, dims: D, expr: null, blink: false, next: 1 + Math.random() * 3 }; });
  if (f) { f.expr = 'smile'; drawFace(f, 'smile'); }
  return f;
}
export const EXPR = { Hop: 'smile', Roll: 'focus', Happy: 'happy', Sad: 'sad' };
// 骨架角色用的卡通光影:和棋盤一樣三階(150 / 215 / 255),但用線性取樣,階與階之間有一點漸層。
// 生成模型面數低,硬切的三階會沿著三角面邊緣出現鋸齒
export const softRamp = (() => {
  const t = new THREE.DataTexture(new Uint8Array([150, 150, 150, 255, 215, 215, 215, 255, 255, 255, 255, 255]), 3, 1, THREE.RGBAFormat);
  t.minFilter = t.magFilter = THREE.LinearFilter; t.needsUpdate = true; return t;
})();
// loadModel 遇到 Face 材質時呼叫:透明、不寫深度、往鏡頭推一點,避免和臉打架
export function faceMaterial(o, gradientMap) {
  o.material = new THREE.MeshToonMaterial({ transparent: true, depthWrite: false, gradientMap, polygonOffset: true, polygonOffsetFactor: -2 });
  o.material.userData.outlineParameters = { visible: false }; o.castShadow = false; o.userData.face = true;
}
