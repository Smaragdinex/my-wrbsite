// CatInsight Stock — 等軸測小房間(參考 threejs-journey 的 lessons 房間,糖果色)
// 全部用 Three.js 幾何堆出來,貓用 /assets/cat2_web.glb;螢幕是一張會動的股票線圖(CanvasTexture)。
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// ---------- 配色(參考圖) ----------
const C = {
  bg: 0x2a1f4e,
  slab: 0xe6c6d6, slabSide: 0xd7b3c8, plank: 0xf0d6e2, plankDark: 0xe4c4d4,
  wallL: 0xd9c4f0, wallLSide: 0xc3a8e6, wallR: 0xf0619c, wallRSide: 0xd94f88,
  shelf: 0xf1d7e4, pillar: 0xe8d3ec,
  rug: 0x46bfcf,
  desk: 0xf7e2ec, deskLeg: 0xf3c9db,
  monitor: 0x4a3d7c, monitorEdge: 0x3a2f63, stand: 0xcfc0e6,
  chair: 0xf7a24a, chairDark: 0xef7b3a, chairPost: 0xe9d6e8,
  arcade: 0xb89ad3, arcadeTop: 0xf27a5a, arcadeStripe: 0xfff2f5, arcadeScreen: 0x5a4d80,
  plant: 0x3fc9c0, plantDark: 0x2fb0a8,
  board: 0x8f6bf0, wheel: 0xf27a5a,
  bowl: 0x3aa8b8, cat: 0x2f2740,
  wire1: 0xf08ac0, wire2: 0x53d5b9,
  balls: [0xff6f91, 0x8f6bf0, 0xffb84d, 0x46bfcf, 0xff8a65, 0xa78bfa],
  camera: 0xf3e6f0, cameraLens: 0xffffff, tripod: 0xf27a5a,
};

const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
const CAM_TARGET = new THREE.Vector3(0, 1.55, 0);
camera.position.set(9.6, 7.0, 9.6);
camera.lookAt(CAM_TARGET);

const controls = new OrbitControls(camera, canvas);
controls.target.copy(CAM_TARGET);
controls.enableZoom = false;
controls.enablePan = false;
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.minPolarAngle = 0.95;
controls.maxPolarAngle = 1.32;
controls.minAzimuthAngle = 0.30;
controls.maxAzimuthAngle = 1.27;
controls.autoRotate = true;
controls.autoRotateSpeed = 0.35;

// ---------- 燈光 ----------
scene.add(new THREE.HemisphereLight(0xffe9f3, 0x5a4a8a, 0.9));
const key = new THREE.DirectionalLight(0xfff4ea, 2.2);
key.position.set(6, 10, 4);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.camera.near = 1; key.shadow.camera.far = 40;
key.shadow.camera.left = -8; key.shadow.camera.right = 8;
key.shadow.camera.top = 8; key.shadow.camera.bottom = -8;
key.shadow.bias = -0.0006;
key.shadow.normalBias = 0.02;
scene.add(key);
const fill = new THREE.DirectionalLight(0xe0d0ff, 0.6);
fill.position.set(-6, 5, 6);
scene.add(fill);

// ---------- 小工具 ----------
const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0.0, ...extra });
const root = new THREE.Group();
root.rotation.y = Math.PI / 2;   // 讓淡紫框牆在左、粉牆在右(鏡頭從前方 45° 看)
scene.add(root);
const animated = [];   // 進場動畫用:每個物件 scale 從 0 長出來

function box(w, h, d, color, { x = 0, y = 0, z = 0, r = 0.06, parent = root, shadow = true, seg = 3, ry = 0, rz = 0, rx = 0 } = {}) {
  const g = r > 0 ? new RoundedBoxGeometry(w, h, d, seg, Math.min(r, w / 2, h / 2, d / 2)) : new THREE.BoxGeometry(w, h, d);
  const m = new THREE.Mesh(g, mat(color));
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  m.castShadow = shadow; m.receiveShadow = true;
  parent.add(m);
  return m;
}
function cyl(rt, rb, h, color, { x = 0, y = 0, z = 0, parent = root, seg = 24, rx = 0, rz = 0 } = {}) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat(color));
  m.position.set(x, y, z); m.rotation.set(rx, 0, rz);
  m.castShadow = true; m.receiveShadow = true;
  parent.add(m);
  return m;
}
function sphere(rad, color, { x = 0, y = 0, z = 0, parent = root } = {}) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(rad, 24, 18), mat(color));
  m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true;
  parent.add(m);
  return m;
}
function group(x = 0, y = 0, z = 0, parent = root) {
  const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g); animated.push(g); return g;
}

// ---------- 房間本體 ----------
const S = 6.4;            // 地板邊長
const T = 0.42;           // 牆厚
const H = 4.8;            // 牆高
// 底座(厚厚一塊)
box(S, 0.55, S, C.slab, { y: -0.275, r: 0.05, seg: 2 });
// 木地板條
for (let i = 0; i < 12; i++) {
  box(S - 0.2, 0.05, (S - 0.2) / 12 - 0.03, i % 2 ? C.plank : C.plankDark, { y: 0.025, z: -S / 2 + 0.1 + (i + 0.5) * ((S - 0.2) / 12), r: 0.01, seg: 1 });
}
// 右牆(粉紅,實心)
box(T, H, S, C.wallR, { x: S / 2 - T / 2, y: H / 2, r: 0.04, seg: 2 });
// 左牆(淡紫):做成有大開口的框:兩根柱子 + 上梁 + 下座,中間再一根細柱與兩層層架
const L = { z: -S / 2 + T / 2 };
box(S, 0.9, T, C.wallL, { y: H - 0.45, z: L.z, r: 0.04, seg: 2 });            // 上梁
box(0.9, H, T, C.wallL, { x: -S / 2 + 0.45, y: H / 2, z: L.z, r: 0.04, seg: 2 }); // 左柱
box(0.9, H, T, C.wallL, { x: S / 2 - 0.45, y: H / 2, z: L.z, r: 0.04, seg: 2 });  // 右柱(與粉牆相接)
box(S, 0.5, T, C.wallL, { y: 0.25, z: L.z, r: 0.04, seg: 2 });                 // 下座
cyl(0.16, 0.16, H - 1.4, C.pillar, { x: 0.35, y: (H - 1.4) / 2 + 0.5, z: L.z });   // 中間細柱
// 兩層層架
box(S - 1.6, 0.12, 0.7, C.shelf, { y: 2.55, z: L.z + 0.15, r: 0.03, seg: 1 });
box(S - 1.6, 0.12, 0.7, C.shelf, { y: 1.65, z: L.z + 0.15, r: 0.03, seg: 1 });

// 粉牆上的字
{
  const cv = document.createElement('canvas'); cv.width = 1024; cv.height = 1024;
  const g = cv.getContext('2d');
  g.clearRect(0, 0, 1024, 1024);
  g.fillStyle = '#fff'; g.textBaseline = 'top';
  g.font = '800 150px "SF Pro Display", "Helvetica Neue", Arial, sans-serif';
  g.fillText('CatInsight', 90, 300);
  g.font = '600 110px "SF Pro Display", "Helvetica Neue", Arial, sans-serif';
  g.globalAlpha = 0.85;
  g.fillText('Stock', 96, 470);
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.6), new THREE.MeshBasicMaterial({ map: tex, transparent: true }));
  m.rotation.y = -Math.PI / 2;
  m.position.set(S / 2 - T - 0.01, 3.05, -0.9);
  root.add(m);
}

// ---------- 層架上的東西 ----------
{
  // 線框立方體(粉)
  const g1 = group(-1.9, 3.05, L.z + 0.15);
  const e1 = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(0.5, 0.5, 0.5)), new THREE.LineBasicMaterial({ color: C.wire1 }));
  e1.rotation.set(0.5, 0.6, 0.2); g1.add(e1); g1.userData.spin = 0.4;
  // 線框四面體(青)
  const g2 = group(-0.9, 3.0, L.z + 0.15);
  const e2 = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.TetrahedronGeometry(0.42)), new THREE.LineBasicMaterial({ color: C.wire2 }));
  e2.rotation.set(0.3, 0.2, 0.4); g2.add(e2); g2.userData.spin = -0.5;
  // 彩球方陣
  const g3 = group(1.1, 2.61, L.z + 0.15);
  let k = 0;
  for (let x = 0; x < 3; x++) for (let y = 0; y < 3; y++) for (let z = 0; z < 3; z++) {
    sphere(0.085, C.balls[k++ % C.balls.length], { x: (x - 1) * 0.19, y: y * 0.19 + 0.09, z: (z - 1) * 0.19, parent: g3 });
  }
}

// ---------- 街機 ----------
{
  const a = group(-1.95, 0, -1.6);
  a.rotation.y = 0.25;
  box(1.1, 2.4, 0.9, C.arcade, { y: 1.2, r: 0.08, parent: a });                 // 主體
  box(1.0, 0.35, 1.0, C.arcadeTop, { y: 2.55, z: 0.05, r: 0.08, parent: a });    // 頂
  box(0.16, 0.36, 1.02, C.arcadeStripe, { y: 2.55, z: 0.05, r: 0.02, parent: a, seg: 1 }); // 白條
  box(0.9, 0.7, 0.08, C.arcadeScreen, { y: 1.75, z: 0.44, r: 0.03, parent: a, seg: 1 });   // 螢幕框
  box(0.72, 0.5, 0.02, 0xefe6f5, { y: 1.75, z: 0.49, r: 0.01, parent: a, seg: 1, shadow: false }); // 螢幕
  box(1.1, 0.28, 0.5, C.arcadeTop, { y: 1.22, z: 0.4, r: 0.06, parent: a });     // 控制台
  box(0.16, 0.3, 0.5, C.arcadeStripe, { y: 1.22, z: 0.4, r: 0.02, parent: a, seg: 1 });
  cyl(0.03, 0.03, 0.25, 0xeeeeee, { x: 0.05, y: 1.45, z: 0.42, parent: a });     // 搖桿
  sphere(0.075, C.balls[2], { x: 0.05, y: 1.6, z: 0.42, parent: a });
  sphere(0.045, C.balls[1], { x: -0.28, y: 1.38, z: 0.5, parent: a });
  sphere(0.045, C.balls[5], { x: -0.14, y: 1.38, z: 0.5, parent: a });
  sphere(0.045, C.balls[3], { x: 0.3, y: 1.38, z: 0.5, parent: a });
  box(0.34, 0.3, 0.04, 0xd8cfe8, { y: 0.9, z: 0.46, r: 0.02, parent: a, seg: 1 });  // 投幣口
}

// ---------- 攝影機 + 三腳架 ----------
{
  const t = group(-0.4, 0, -0.9);
  const legs = 3;
  for (let i = 0; i < legs; i++) {
    const a = i * (Math.PI * 2 / legs) + 0.4;
    const leg = cyl(0.03, 0.03, 1.5, C.tripod, { x: Math.sin(a) * 0.3, y: 0.75, z: Math.cos(a) * 0.3, parent: t });
    leg.rotation.set(Math.cos(a) * 0.38, 0, -Math.sin(a) * 0.38);
  }
  cyl(0.05, 0.05, 0.4, C.tripod, { y: 1.55, parent: t });
  box(0.55, 0.32, 0.3, C.camera, { y: 1.85, r: 0.06, parent: t });
  cyl(0.11, 0.09, 0.22, C.camera, { x: 0.35, y: 1.85, parent: t, rz: Math.PI / 2 });
  cyl(0.085, 0.085, 0.02, C.cameraLens, { x: 0.47, y: 1.85, parent: t, rz: Math.PI / 2 });
  box(0.22, 0.12, 0.08, C.arcadeTop, { x: -0.1, y: 1.85, z: 0.19, r: 0.03, parent: t, seg: 1 });
}

// ---------- 地毯 / 滑板 ----------
box(3.6, 0.05, 2.7, C.rug, { x: -0.5, y: 0.075, z: 0.9, r: 0.02, seg: 1 });
{
  const s = group(-0.2, 0.08, 1.9);
  s.rotation.y = 0.35;
  box(1.5, 0.06, 0.42, C.board, { y: 0.19, r: 0.03, parent: s });
  for (const [x, z] of [[-0.5, 0.18], [-0.5, -0.18], [0.5, 0.18], [0.5, -0.18]]) {
    cyl(0.07, 0.07, 0.06, C.wheel, { x, y: 0.08, z, parent: s, rx: Math.PI / 2 });
  }
}

// ---------- 書桌 / 螢幕 / 鍵盤 ----------
const screenCanvas = document.createElement('canvas'); screenCanvas.width = 640; screenCanvas.height = 400;
const screenTex = new THREE.CanvasTexture(screenCanvas); screenTex.colorSpace = THREE.SRGBColorSpace; screenTex.anisotropy = 8;
let screenMesh;
{
  const d = group(1.1, 0, 0.2);
  box(2.9, 0.12, 1.3, C.desk, { y: 1.35, r: 0.05, parent: d });
  for (const [x, z] of [[-1.3, 0.55], [-1.3, -0.55], [1.3, 0.55], [1.3, -0.55]]) {
    cyl(0.05, 0.05, 1.3, C.deskLeg, { x, y: 0.65, z, parent: d });
  }
  // 螢幕
  const m = group(0, 1.41, -0.25, d);
  cyl(0.28, 0.32, 0.05, C.stand, { y: 0.025, parent: m });
  cyl(0.05, 0.05, 0.42, C.stand, { y: 0.24, parent: m });
  box(1.55, 0.98, 0.08, C.monitorEdge, { y: 0.9, r: 0.04, parent: m });
  screenMesh = new THREE.Mesh(new THREE.PlaneGeometry(1.42, 0.86), new THREE.MeshBasicMaterial({ map: screenTex }));
  screenMesh.position.set(0, 0.9, 0.045);
  m.add(screenMesh);
  // 耳機掛在螢幕角
  const hp = group(0.62, 1.05, 0.06, m);
  const band = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.035, 12, 32, Math.PI), mat(C.arcadeTop));
  band.rotation.z = 0; hp.add(band);
  sphere(0.085, C.balls[2], { x: -0.2, y: -0.02, parent: hp });
  sphere(0.085, C.balls[2], { x: 0.2, y: -0.02, parent: hp });
  // 鍵盤、滑鼠、滑鼠墊
  box(0.95, 0.03, 0.34, 0xd9c9ef, { x: 0, y: 1.42, z: 0.28, r: 0.01, parent: d, seg: 1, shadow: false });
  box(0.75, 0.05, 0.28, 0xf6eef8, { x: 0, y: 1.44, z: 0.28, r: 0.02, parent: d });
  box(0.16, 0.06, 0.22, 0xf6eef8, { x: 0.65, y: 1.44, z: 0.3, r: 0.04, parent: d });
}

// ---------- 椅子 ----------
{
  const c = group(1.3, 0, 1.1);
  c.rotation.y = -0.4;
  box(0.9, 0.16, 0.9, C.chairDark, { y: 0.72, r: 0.07, parent: c });            // 座墊
  box(0.9, 1.0, 0.16, C.chair, { y: 1.3, z: -0.4, r: 0.07, parent: c });        // 靠背
  for (let i = 0; i < 3; i++) box(0.82, 0.03, 0.02, C.chairDark, { y: 0.95 + i * 0.3, z: -0.31, r: 0, parent: c, shadow: false });
  cyl(0.05, 0.05, 0.6, C.chairPost, { y: 0.35, parent: c });
  for (let i = 0; i < 5; i++) {
    const a = i * Math.PI * 2 / 5;
    const arm = box(0.5, 0.05, 0.08, C.chairPost, { x: Math.sin(a) * 0.25, y: 0.09, z: Math.cos(a) * 0.25, r: 0.02, parent: c, seg: 1 });
    arm.rotation.y = a + Math.PI / 2;
    sphere(0.06, C.chairPost, { x: Math.sin(a) * 0.48, y: 0.06, z: Math.cos(a) * 0.48, parent: c });
  }
}

// ---------- 植物 ----------
{
  const p = group(1.85, 0, -1.9);
  cyl(0.28, 0.22, 0.28, C.chairDark, { y: 0.14, parent: p });
  const leaf = (h, x, z, tilt, col) => {
    const m = new THREE.Mesh(new THREE.CapsuleGeometry(0.17, h, 6, 16), mat(col));
    m.position.set(x, 0.28 + h / 2 + 0.1, z); m.rotation.z = tilt; m.rotation.x = tilt * 0.4;
    m.castShadow = true; p.add(m);
  };
  leaf(1.9, 0, 0, 0.05, C.plant);
  leaf(1.1, -0.28, 0.05, 0.45, C.plantDark);
  leaf(0.9, 0.26, -0.05, -0.5, C.plant);
}

// ---------- 貓 + 碗 ----------
{
  const b = group(2.2, 0, 1.75);
  cyl(0.5, 0.42, 0.22, C.bowl, { y: 0.11, parent: b });
  cyl(0.42, 0.42, 0.02, 0x8fe0ea, { y: 0.23, parent: b });
  const loader = new GLTFLoader();
  loader.load('/assets/cat2_web.glb', (gltf) => {
    const cat = gltf.scene;
    // 模型是標準化到 [-1,1],這裡縮到高約 0.9,放在碗上
    const bb = new THREE.Box3().setFromObject(cat);
    const size = bb.getSize(new THREE.Vector3());
    const s = 0.9 / size.y;
    cat.scale.setScalar(s);
    const bb2 = new THREE.Box3().setFromObject(cat);
    cat.position.y = 0.24 - bb2.min.y;
    cat.rotation.y = -Math.PI * 0.75;
    cat.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    b.add(cat);
    console.log('cat loaded', size.y.toFixed(2));
  }, undefined, () => {
    // 載不到就用簡單的貓
    sphere(0.3, C.cat, { y: 0.55, parent: b });
    sphere(0.22, C.cat, { y: 0.92, z: 0.1, parent: b });
  });
}

// ---------- 螢幕上的股票線圖 ----------
const series = [];
let px = 222;
for (let i = 0; i < 120; i++) { px += (Math.random() - 0.48) * 1.6; series.push(px); }
function drawScreen(t) {
  const g = screenCanvas.getContext('2d');
  const W = screenCanvas.width, Hh = screenCanvas.height;
  g.fillStyle = '#1a1a1f'; g.fillRect(0, 0, W, Hh);
  // 頂部
  g.fillStyle = '#fff'; g.font = '700 30px -apple-system, Helvetica, Arial'; g.fillText('NVDA', 28, 46);
  g.fillStyle = '#9a9aa8'; g.font = '500 18px -apple-system, Helvetica, Arial'; g.fillText('NVIDIA Corporation', 28, 72);
  const last = series[series.length - 1], first = series[0];
  const up = last >= first;
  g.fillStyle = up ? '#ff453a' : '#30d158'; g.font = '800 40px -apple-system, Helvetica, Arial';
  g.fillText('$' + last.toFixed(2), W - 190, 52);
  g.font = '600 18px -apple-system, Helvetica, Arial';
  g.fillText((up ? '+' : '') + (last - first).toFixed(2) + ' (' + ((last / first - 1) * 100).toFixed(2) + '%)', W - 190, 78);
  // 圖
  const x0 = 28, y0 = 100, w = W - 56, h = Hh - 140;
  const min = Math.min(...series), max = Math.max(...series), pad = (max - min) * 0.15 + 0.01;
  const X = (i) => x0 + i / (series.length - 1) * w;
  const Y = (v) => y0 + (1 - (v - (min - pad)) / (max - min + pad * 2)) * h;
  g.strokeStyle = 'rgba(255,255,255,.08)'; g.lineWidth = 1;
  for (let k = 0; k < 4; k++) { const y = y0 + k * h / 3; g.beginPath(); g.moveTo(x0, y); g.lineTo(x0 + w, y); g.stroke(); }
  const col = up ? '#ff453a' : '#30d158';
  const grad = g.createLinearGradient(0, y0, 0, y0 + h); grad.addColorStop(0, col + '55'); grad.addColorStop(1, col + '00');
  g.beginPath(); g.moveTo(X(0), y0 + h);
  series.forEach((v, i) => g.lineTo(X(i), Y(v)));
  g.lineTo(X(series.length - 1), y0 + h); g.closePath(); g.fillStyle = grad; g.fill();
  g.beginPath(); series.forEach((v, i) => i ? g.lineTo(X(i), Y(v)) : g.moveTo(X(i), Y(v)));
  g.strokeStyle = col; g.lineWidth = 3; g.lineJoin = 'round'; g.stroke();
  // 即時點
  const lx = X(series.length - 1), ly = Y(last);
  g.fillStyle = col; g.beginPath(); g.arc(lx, ly, 6, 0, Math.PI * 2); g.fill();
  g.fillStyle = col + '44'; g.beginPath(); g.arc(lx, ly, 10 + 4 * Math.sin(t * 4), 0, Math.PI * 2); g.fill();
  // 底部期間列
  g.fillStyle = '#9a9aa8'; g.font = '600 16px -apple-system, Helvetica, Arial';
  ['1D', '1W', '1M', '3M', 'YTD', '1Y'].forEach((s, i) => {
    const x = 40 + i * 92;
    if (i === 2) { g.fillStyle = '#0a84ff'; g.beginPath(); g.roundRect(x - 12, Hh - 34, 52, 26, 8); g.fill(); g.fillStyle = '#fff'; }
    g.fillText(s, x, Hh - 15); g.fillStyle = '#9a9aa8';
  });
  screenTex.needsUpdate = true;
}
let lastTick = 0;
function tickSeries(now) {
  if (now - lastTick > 700) {
    lastTick = now;
    const v = series[series.length - 1] + (Math.random() - 0.48) * 1.4;
    series.push(v); series.shift();
  }
}

// ---------- UI:左右鍵切視角、手掌切自動旋轉 ----------
const VIEWS = [0.785, 0.45, 1.15];
let viewIdx = 0, targetAz = null;
const azimuth = () => controls.getAzimuthalAngle();
document.getElementById('prev').onclick = () => { viewIdx = (viewIdx + VIEWS.length - 1) % VIEWS.length; targetAz = VIEWS[viewIdx]; controls.autoRotate = false; hand.classList.remove('on'); };
document.getElementById('next').onclick = () => { viewIdx = (viewIdx + 1) % VIEWS.length; targetAz = VIEWS[viewIdx]; controls.autoRotate = false; hand.classList.remove('on'); };
const hand = document.getElementById('hand');
hand.onclick = () => { controls.autoRotate = !controls.autoRotate; hand.classList.toggle('on', controls.autoRotate); targetAz = null; };
canvas.addEventListener('pointerdown', () => { targetAz = null; });

// ---------- 進場動畫 + 迴圈 ----------
animated.forEach((g, i) => { g.userData.baseScale = g.scale.clone(); g.scale.setScalar(0.001); g.userData.delay = 0.15 + i * 0.07; });
const introStart = performance.now();
const clock = new THREE.Clock();
function resize() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (canvas.width !== Math.floor(w * renderer.getPixelRatio()) || canvas.height !== Math.floor(h * renderer.getPixelRatio())) {
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
  }
}
function loop() {
  requestAnimationFrame(loop);
  resize();
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;
  const introT = (performance.now() - introStart) / 1000;   // 用真實時間,分頁在背景也照跑
  for (const g of animated) {
    const p = Math.max(0, Math.min(1, (introT - g.userData.delay) / 0.6));
    const e = 1 - Math.pow(1 - p, 3);                 // easeOut
    const overshoot = p < 1 ? 1 + 0.08 * Math.sin(p * Math.PI) : 1;
    g.scale.copy(g.userData.baseScale).multiplyScalar(Math.max(0.001, e * overshoot));
    if (g.userData.spin) g.rotation.y += g.userData.spin * dt;
  }
  if (targetAz !== null) {
    // 平滑轉到指定視角:直接推 camera 繞 target 轉
    const cur = azimuth(); let diff = targetAz - cur;
    if (Math.abs(diff) < 0.002) targetAz = null;
    else {
      const step = diff * Math.min(1, dt * 4);
      const v = camera.position.clone().sub(controls.target);
      v.applyAxisAngle(new THREE.Vector3(0, 1, 0), step);
      camera.position.copy(controls.target).add(v);
    }
  }
  tickSeries(performance.now());
  drawScreen(t);
  controls.update();
  renderer.render(scene, camera);
}
loop();
setTimeout(() => document.getElementById('loading').classList.add('done'), 400);
