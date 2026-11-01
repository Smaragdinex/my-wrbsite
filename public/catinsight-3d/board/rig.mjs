// 骨架角色的表情(目前只有兔子:Tripo 生成、tools/blender/rig_bunny*.py 綁骨架與做 Face 貼片)。board.mjs 和 rig-test.html 共用
import * as THREE from 'three';
// 表情:臉上那片貼片的 UV 是正面平面投影(rig_bunny_face.py 的 X0..Z1 範圍),五官座標用同一套單位(x 往兔子左手邊、z 往上)
const FACE_BOX = { x0: -0.40, x1: 0.40, z0: -0.30, z1: 0.12 }, FACE_W = 512, FACE_H = Math.round(512 * 0.42 / 0.8);
const EYE_X = 0.22, EYE_Z = -0.015, MOUTH_Z = -0.113;   // Tripo 兔子(rig_bunny_face.py 偵測到的五官中心)
export function drawFace(f, expr, blink = false) {
  const c = f.ctx, k = FACE_W / (FACE_BOX.x1 - FACE_BOX.x0), X = (x) => (x - FACE_BOX.x0) * k, Y = (z) => (FACE_BOX.z1 - z) * k, u = (v) => v * k;
  c.clearRect(0, 0, FACE_W, FACE_H); c.fillStyle = c.strokeStyle = '#141414'; c.lineCap = c.lineJoin = 'round'; c.lineWidth = u(0.016);
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
  if (expr === 'happy') { c.moveTo(mx - u(0.06), my - u(0.015)); c.quadraticCurveTo(mx, my - u(0.02), mx + u(0.06), my - u(0.015)); c.quadraticCurveTo(mx, my + u(0.085), mx - u(0.06), my - u(0.015)); c.fill();
    c.fillStyle = '#ff8a95'; c.beginPath(); c.ellipse(mx, my + u(0.035), u(0.03), u(0.016), 0, 0, Math.PI * 2); c.fill(); }   // 張嘴大笑 + 舌頭
  else if (expr === 'sad') { c.moveTo(mx - u(0.045), my + u(0.02)); c.quadraticCurveTo(mx, my - u(0.035), mx + u(0.045), my + u(0.02)); c.stroke();
    c.fillStyle = '#7cc4ff'; c.beginPath(); const tx = X(EYE_X) + u(0.01), ty = Y(EYE_Z) + u(0.075); c.moveTo(tx, ty - u(0.03)); c.quadraticCurveTo(tx + u(0.022), ty + u(0.005), tx, ty + u(0.016)); c.quadraticCurveTo(tx - u(0.022), ty + u(0.005), tx, ty - u(0.03)); c.fill(); }   // 嘴角往下 + 一滴眼淚
  else if (expr === 'wow') { c.ellipse(mx, my + u(0.005), u(0.022), u(0.03), 0, 0, Math.PI * 2); c.fill(); }
  else if (expr === 'focus') { c.ellipse(mx, my, u(0.02), u(0.014), 0, 0, Math.PI * 2); c.fill(); }
  else { c.moveTo(mx - u(0.045), my - u(0.012)); c.quadraticCurveTo(mx, my + u(0.04), mx + u(0.045), my - u(0.012)); c.stroke(); }   // 原本的小微笑
  f.tex.needsUpdate = true;
}
export function setFace(a, expr) { if (!a?.face || (a.face.expr === expr && !a.face.blink)) return; a.face.expr = expr; a.face.blink = false; drawFace(a.face, expr); }
export function makeFace(inst) {
  let f = null;
  inst.traverse((o) => { if (!o.userData.face) return;
    const cv = document.createElement('canvas'); cv.width = FACE_W; cv.height = FACE_H;
    const tex = new THREE.CanvasTexture(cv); tex.flipY = false; tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;   // flipY=false:和 glTF 的 UV 方向一致
    o.material = o.material.clone(); o.material.map = tex; f = { ctx: cv.getContext('2d'), tex, expr: null, blink: false, next: 1 + Math.random() * 3 }; });
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
