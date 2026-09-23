// CatInsight Stock — 等軸測小房間(參考 threejs-journey 的 lessons 房間,糖果色)
// 全部用 Three.js 幾何堆出來,貓用 /assets/cat2_web.glb;螢幕是一張會動的股票線圖(CanvasTexture)。
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

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
key.shadow.bias = -0.0015;
key.shadow.normalBias = 0.06;   // 圓角面自遮陰影(acne)容易閃,偏移拉大
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
// 層架往右縮,最左邊讓給街機
const SHELF_X0 = -1.85, SHELF_X1 = S / 2 - 0.8;
box(SHELF_X1 - SHELF_X0, 0.12, 0.7, C.shelf, { x: (SHELF_X0 + SHELF_X1) / 2, y: 2.55, z: L.z + 0.15, r: 0.03, seg: 1 });
box(SHELF_X1 - SHELF_X0, 0.12, 0.7, C.shelf, { x: (SHELF_X0 + SHELF_X1) / 2, y: 1.65, z: L.z + 0.15, r: 0.03, seg: 1 });

// ---------- 層架上的東西 ----------
{
  // 粗邊線框:把每條邊做成圓管、頂點放小球(WebGL 的線寬固定 1px,不能加粗,所以用實體)
  const thickEdges = (geometry, color, radius) => {
    const g = new THREE.Group();
    const edges = new THREE.EdgesGeometry(geometry);
    const pos = edges.attributes.position;
    const m = mat(color);
    const seen = new Set();
    for (let i = 0; i < pos.count; i += 2) {
      const a = new THREE.Vector3().fromBufferAttribute(pos, i);
      const b = new THREE.Vector3().fromBufferAttribute(pos, i + 1);
      const d = b.clone().sub(a);
      const cylm = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, d.length(), 10), m);
      cylm.position.copy(a).add(b).multiplyScalar(0.5);
      cylm.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize());
      cylm.castShadow = true; g.add(cylm);
      for (const v of [a, b]) {
        const k = v.toArray().map((n) => n.toFixed(3)).join(',');
        if (seen.has(k)) continue; seen.add(k);
        const sp = new THREE.Mesh(new THREE.SphereGeometry(radius * 1.05, 12, 10), m);
        sp.position.copy(v); sp.castShadow = true; g.add(sp);
      }
    }
    return g;
  };
  // 立方體(粉)
  const g1 = group(-1.35, 3.05, L.z + 0.15);
  const e1 = thickEdges(new THREE.BoxGeometry(0.5, 0.5, 0.5), C.wire1, 0.028);
  e1.rotation.set(0.5, 0.6, 0.2); g1.add(e1);
  g1.userData.jump = { phase: 0.0, height: 0.32, baseY: 3.05 };
  // 四面體(青)
  const g2 = group(-0.45, 3.0, L.z + 0.15);
  const e2 = thickEdges(new THREE.TetrahedronGeometry(0.42), C.wire2, 0.028);
  e2.rotation.set(0.3, 0.2, 0.4); g2.add(e2);
  g2.userData.jump = { phase: 1.1, height: 0.28, baseY: 3.0 };
  // 彩球方陣
  const g3 = group(1.1, 2.61, L.z + 0.15);
  let k = 0;
  for (let x = 0; x < 3; x++) for (let y = 0; y < 3; y++) for (let z = 0; z < 3; z++) {
    sphere(0.085, C.balls[k++ % C.balls.length], { x: (x - 1) * 0.19, y: y * 0.19 + 0.09, z: (z - 1) * 0.19, parent: g3 });
  }
}

// ---------- 街機 ----------
{
  // 結構照參考:兩片紫色「側板」用側面輪廓拉伸,比正面凸出;橘色招牌/控制台/下半段、螢幕都「嵌」在兩片側板之間
  const a = group(-S / 2 + 0.12 + 0.58, 0, L.z + T / 2 + 0.50);   // 最左邊、背面貼牆
  const PURPLE = 0xa98aa6, ORANGE = 0xf08262, STRIPE = 0xfdf6f7;
  const SIDE_T = 0.07, W = 1.1, IW = W - SIDE_T * 2;             // 側板厚、總寬、內寬
  // 側板輪廓 [z, y](z 正 = 前)
  const prof = [
    [-0.45, 0.00], [0.22, 0.00], [0.22, 0.28], [0.36, 0.28],     // 底部內縮的腳
    [0.36, 1.04],                                                // 下半段直板
    [0.58, 1.14], [0.60, 1.38],                                  // 控制台往前凸
    [0.38, 1.46], [0.30, 2.16],                                  // 螢幕區凹進去、往後傾
    [0.60, 2.32], [0.60, 2.64],                                  // 招牌往前凸
    [0.42, 2.78], [-0.38, 2.78], [-0.45, 2.70],                  // 圓角頂 → 背
  ];
  const shape = new THREE.Shape(prof.map(([z, y]) => new THREE.Vector2(z, y)));
  const sideGeo = new THREE.ExtrudeGeometry(shape, { depth: SIDE_T, bevelEnabled: true, bevelThickness: 0.015, bevelSize: 0.015, bevelSegments: 2 });
  sideGeo.rotateY(-Math.PI / 2);        // 輪廓 z → 世界 z;拉伸 → -x
  sideGeo.computeBoundingBox();
  sideGeo.translate(-sideGeo.boundingBox.min.x, -sideGeo.boundingBox.min.y, 0);   // 讓 x 從 0 開始
  for (const sx of [-W / 2, W / 2 - SIDE_T]) {
    const side = new THREE.Mesh(sideGeo, mat(PURPLE));
    side.position.x = sx; side.castShadow = true; side.receiveShadow = true; a.add(side);
  }
  // 背板 + 頂蓋(紫)
  box(IW, 2.70, 0.10, PURPLE, { y: 1.35, z: -0.40, r: 0.02, parent: a, seg: 1 });
  box(IW, 0.16, 0.86, PURPLE, { y: 2.70, z: 0.00, r: 0.03, parent: a, seg: 1 });
  // 依兩點放一片板子(貼在斜面上)
  const plate = (z0, y0, z1, y1, w, thick, color, out = 0, shadow = true) => {
    const dz = z1 - z0, dy = y1 - y0, len = Math.hypot(dz, dy);
    const nz = dy / len, ny = -dz / len;
    const m = box(w, len, thick, color, { r: Math.min(0.02, thick / 2), parent: a, seg: 1, shadow });
    m.position.set(0, (y0 + y1) / 2 + ny * out, (z0 + z1) / 2 + nz * out);
    m.rotation.x = -Math.atan2(dz, dy);
    return m;
  };
  // 招牌(橘,嵌在側板之間,比側板前緣退 3cm)
  box(IW, 0.32, 0.50, ORANGE, { y: 2.48, z: 0.32, r: 0.05, parent: a });
  // 螢幕模組:紫色凹槽(往後傾)+ 淺灰 CRT(圓角)+ 深色內框
  plate(0.36, 1.48, 0.29, 2.14, IW, 0.16, 0x8f7597, -0.08);
  plate(0.36, 1.52, 0.295, 2.10, IW - 0.16, 0.03, 0x5a4d6e, 0.0, false);
  plate(0.36, 1.56, 0.30, 2.06, IW - 0.24, 0.02, 0xd8d2db, 0.012, false);
  // 控制台:斜面 + 直立前緣(橘)
  plate(0.60, 1.38, 0.38, 1.46, IW, 0.06, ORANGE, -0.03);
  box(IW, 0.24, 0.20, ORANGE, { y: 1.26, z: 0.47, r: 0.03, parent: a });
  // 下半段(橘)+ 底部紫色腳
  box(IW, 0.74, 0.16, ORANGE, { y: 0.67, z: 0.25, r: 0.03, parent: a });
  box(IW, 0.28, 0.60, PURPLE, { y: 0.14, z: -0.10, r: 0.02, parent: a, seg: 1 });
  // 白色直條:招牌正面與頂面、控制台斜面與前緣、下半段
  const SW = 0.14;
  box(SW, 0.30, 0.02, STRIPE, { y: 2.48, z: 0.32 + 0.25 + 0.005, r: 0.005, parent: a, seg: 1, shadow: false });
  box(SW, 0.02, 0.48, STRIPE, { y: 2.48 + 0.16 + 0.005, z: 0.32, r: 0.005, parent: a, seg: 1, shadow: false });
  plate(0.60, 1.38, 0.38, 1.46, SW, 0.02, STRIPE, 0.01, false);
  box(SW, 0.22, 0.02, STRIPE, { y: 1.26, z: 0.47 + 0.10 + 0.005, r: 0.005, parent: a, seg: 1, shadow: false });
  box(SW, 0.72, 0.02, STRIPE, { y: 0.67, z: 0.25 + 0.08 + 0.005, r: 0.005, parent: a, seg: 1, shadow: false });
  // 搖桿(白色圓座 + 桿 + 橘球)與三顆按鈕,放在控制台斜面上
  const cz = 0.49, cy = 1.42;
  cyl(0.075, 0.075, 0.03, 0xf3edf5, { x: 0.02, y: cy + 0.015, z: cz, parent: a });
  cyl(0.02, 0.02, 0.2, 0xf3edf5, { x: 0.02, y: cy + 0.11, z: cz, parent: a });
  sphere(0.06, ORANGE, { x: 0.02, y: cy + 0.23, z: cz, parent: a });
  sphere(0.04, 0x9d7bea, { x: -0.30, y: cy + 0.02, z: cz + 0.02, parent: a });   // 紫
  sphere(0.032, 0xf27a5a, { x: -0.17, y: cy + 0.015, z: cz + 0.04, parent: a }); // 小橘
  sphere(0.04, 0x4fd1b8, { x: 0.30, y: cy + 0.02, z: cz + 0.02, parent: a });    // 青
  // 投幣門(淡紫方塊 + 投幣孔)
  box(0.26, 0.30, 0.04, 0xcfc3e6, { x: 0.0, y: 0.74, z: 0.25 + 0.08 + 0.02, r: 0.015, parent: a, seg: 1 });
  box(0.04, 0.12, 0.015, 0x7d6f94, { x: -0.06, y: 0.77, z: 0.25 + 0.08 + 0.045, r: 0, parent: a, seg: 1, shadow: false });
  box(0.05, 0.05, 0.015, 0x7d6f94, { x: 0.06, y: 0.70, z: 0.25 + 0.08 + 0.045, r: 0, parent: a, seg: 1, shadow: false });
}

// ---------- 攝影機 + 三腳架 ----------
let camHead = null;
{
  const t = group(-0.55, 0, -1.55);   // 靠牆一點(層架前緣在 -2.14,腳架腳張開 0.5 不會碰到)
  // 三隻腳:腳底在地上張開,頂端收攏到雲台下方
  const legs = 3, head = new THREE.Vector3(0, 1.45, 0), spread = 0.5;
  for (let i = 0; i < legs; i++) {
    const a = i * (Math.PI * 2 / legs) + 0.4;
    const foot = new THREE.Vector3(Math.sin(a) * spread, 0.02, Math.cos(a) * spread);
    const dir = head.clone().sub(foot);
    const leg = cyl(0.03, 0.035, dir.length(), C.tripod, { parent: t });
    leg.position.copy(foot).add(head).multiplyScalar(0.5);
    leg.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  }
  cyl(0.05, 0.05, 0.4, C.tripod, { y: 1.55, parent: t });
  // 攝影機頭獨立一個 group,繞雲台左右慢慢掃(±30°)
  camHead = new THREE.Group(); camHead.position.y = 1.85; t.add(camHead);
  box(0.55, 0.32, 0.3, C.camera, { r: 0.06, parent: camHead });
  cyl(0.11, 0.09, 0.22, C.camera, { x: 0.35, parent: camHead, rz: Math.PI / 2 });
  cyl(0.085, 0.085, 0.02, C.cameraLens, { x: 0.47, parent: camHead, rz: Math.PI / 2 });
  box(0.22, 0.12, 0.08, C.arcadeTop, { x: -0.1, z: 0.19, r: 0.03, parent: camHead, seg: 1 });
  sphere(0.02, 0xff4d4d, { x: -0.2, y: 0.1, z: 0.16, parent: camHead });   // 錄影紅燈
}

// ---------- 地毯 / 滑板 ----------
box(3.6, 0.05, 2.7, C.rug, { x: -0.5, y: 0.075, z: 0.9, r: 0.02, seg: 1 });
{
  const s = group(-1.55, 0.08, 1.75);   // 靠左邊
  s.rotation.y = 0.5;
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
  // 耳機:米白色粗弧形頭帶掛在螢幕右上角(斜 45°),兩個橘色圓耳罩垂在螢幕前後,內側淺色耳墊
  const hp = group(0.64, 1.37, 0.0, m);
  hp.rotation.y = -Math.PI / 4;
  const CREAM = 0xf7f1f2, CUP = 0xf08262, PAD = 0xfbe3d8;
  const band = new THREE.Mesh(new THREE.TorusGeometry(0.21, 0.032, 12, 40, Math.PI), mat(CREAM));
  band.castShadow = true; hp.add(band);
  for (const sx of [-1, 1]) {
    // 頭帶末端往下一小段
    cyl(0.032, 0.032, 0.12, CREAM, { x: sx * 0.21, y: -0.06, parent: hp });
    // 耳罩:橘色圓盤,軸向 x(面朝內),外側再一片淺色耳墊
    cyl(0.09, 0.09, 0.06, CUP, { x: sx * 0.21, y: -0.13, parent: hp, rz: Math.PI / 2 });
    cyl(0.07, 0.07, 0.015, PAD, { x: sx * (0.21 - 0.035), y: -0.13, parent: hp, rz: Math.PI / 2 });
    cyl(0.035, 0.035, 0.02, CREAM, { x: sx * 0.21, y: -0.06, parent: hp });
  }
  // 鍵盤、滑鼠、滑鼠墊
  box(0.95, 0.03, 0.34, 0xd9c9ef, { x: 0, y: 1.42, z: 0.28, r: 0.01, parent: d, seg: 1, shadow: false });
  box(0.75, 0.05, 0.28, 0xf6eef8, { x: 0, y: 1.44, z: 0.28, r: 0.02, parent: d });
  box(0.16, 0.06, 0.22, 0xf6eef8, { x: 0.65, y: 1.44, z: 0.3, r: 0.04, parent: d });
}

// ---------- 椅子 ----------
{
  const c = group(1.35, 0, 1.6);   // 桌面 z 到 0.85,椅墊從 1.15 開始,不重疊
  c.rotation.y = -0.35;
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
const plantLeaves = [];
{
  const p = group(1.85, 0, -1.9);
  cyl(0.28, 0.22, 0.28, C.chairDark, { y: 0.14, parent: p });
  // 每根葉子:高度方向切 24 段,頂點著色器依高度權重(底 0、頂 1,平方)往側邊推 → 根部不動、越上面彎越多
  const leaf = (h, x, z, tilt, col, phase) => {
    const pivot = new THREE.Group(); pivot.position.set(x, 0.28 + 0.1, z); p.add(pivot);
    pivot.rotation.z = tilt; pivot.rotation.x = tilt * 0.4;
    const geo = new THREE.CapsuleGeometry(0.17, h, 8, 16, 24);   // capSegments, radialSegments, heightSegments
    const material = mat(col);
    const uni = { uTime: { value: 0 }, uPhase: { value: phase }, uAmp: { value: 0.16 * (h / 1.9 + 0.4) }, uYMin: { value: -h / 2 - 0.17 }, uH: { value: h + 0.34 } };
    material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, uni);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>
          uniform float uTime, uPhase, uAmp, uYMin, uH;`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          float w = clamp((position.y - uYMin) / uH, 0.0, 1.0);
          w = w * w;                                   // 底部穩、頂端彎
          float sway = sin(uTime * 1.4 + uPhase) * uAmp;
          float sway2 = sin(uTime * 0.9 + uPhase * 1.7) * uAmp * 0.45;
          transformed.x += sway * w;
          transformed.z += sway2 * w;
          transformed.y -= (sway * sway + sway2 * sway2) * w * 0.35;   // 彎的時候高度略縮,比較像真的彎
        `);
    };
    material.customProgramCacheKey = () => 'cactus-bend';
    const m = new THREE.Mesh(geo, material);
    m.position.y = h / 2 + 0.17; m.castShadow = true; pivot.add(m);
    pivot.userData = { uni };
    plantLeaves.push(pivot);
  };
  leaf(1.9, 0, 0, 0.05, C.plant, 0);
  leaf(1.1, -0.28, 0.05, 0.45, C.plantDark, 1.3);
  leaf(0.9, 0.26, -0.05, -0.5, C.plant, 2.4);
}

// ---------- 貓 + 碗 ----------
// 貓改用 Meshy 產生的 GLB(cat.glb,已 Draco 壓縮 + 貼圖縮到 1024)。
// 模型只有一個 mesh、沒有骨架,所以「轉頭」用 vertex shader 做:脖子以上的頂點依高度加權繞垂直軸旋轉。
let catHead = null;            // 舊介面保留(不再使用)
const catUniforms = { uHead: { value: 0 }, uNeck: { value: 0.08 }, uBlend: { value: 0.18 }, uPivot: { value: new THREE.Vector2(0.17, 0.40) } };   // 模型原始座標:脖子約 y=0.08~0.26,頭中心 xz≈(0.17, 0.40)
let catModel = null;
{
  const b = group(2.25, 0, 2.45);
  cyl(0.5, 0.42, 0.22, C.bowl, { y: 0.11, parent: b });
  cyl(0.42, 0.42, 0.02, 0x8fe0ea, { y: 0.23, parent: b });
  const cat = new THREE.Group(); cat.position.y = 0.24; cat.rotation.y = -Math.PI * 0.7; b.add(cat);
  const draco = new DRACOLoader(); draco.setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.174.0/examples/jsm/libs/draco/');
  const loader = new GLTFLoader(); loader.setDRACOLoader(draco);
  loader.load('./cat.glb', (gltf) => {
    const m = gltf.scene;
    const box = new THREE.Box3().setFromObject(m);
    const size = box.getSize(new THREE.Vector3());
    const k = 1.0 / size.y;                       // 貓高約 1.0
    m.scale.setScalar(k);
    m.position.set(-(box.min.x + box.max.x) / 2 * k, -box.min.y * k, -(box.min.z + box.max.z) / 2 * k);
    m.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = true; o.receiveShadow = true;
      const mat = o.material; mat.side = THREE.FrontSide;
      // 原貼圖偏暗棕,調亮並加一點金黃自發光,接近參考圖的金色
      mat.metalness = 0; mat.color.setScalar(1.25);
      mat.emissive.set(0xffb040); mat.emissiveMap = mat.map; mat.emissiveIntensity = 0.3;
      mat.onBeforeCompile = (sh) => {
        Object.assign(sh.uniforms, catUniforms);
        sh.vertexShader = sh.vertexShader
          .replace('#include <common>', `#include <common>
            uniform float uHead, uNeck, uBlend; uniform vec2 uPivot;
            mat2 headRot(float y) { float a = uHead * smoothstep(uNeck, uNeck + uBlend, y); float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }`)
          .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
            objectNormal.xz = headRot(position.y) * objectNormal.xz;`)
          .replace('#include <begin_vertex>', `#include <begin_vertex>
            transformed.xz = uPivot + headRot(position.y) * (transformed.xz - uPivot);`);
      };
      mat.needsUpdate = true;
    });
    cat.add(m); catModel = m;
    if (window.__room) window.__room.cat = m;
  });
  animated.push(cat);
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
// 直式(手機)畫面窄,鏡頭要拉遠整間房才塞得進去:距離依長寬比調整
const BASE_DIST = camera.position.distanceTo(CAM_TARGET);
let lastAspect = 0;
function fitCamera(aspect) {
  const k = aspect >= 1.15 ? 1 : 1.28 / aspect;          // 越窄越遠
  const dist = BASE_DIST * Math.min(k, 2.2);
  const dir = camera.position.clone().sub(controls.target).normalize();
  camera.position.copy(controls.target).add(dir.multiplyScalar(dist));
  // 直式時看的目標點稍微往上,底部留給按鈕
  controls.target.set(0, aspect < 1 ? 1.35 : 1.55, 0);
}
function resize() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (canvas.width !== Math.floor(w * renderer.getPixelRatio()) || canvas.height !== Math.floor(h * renderer.getPixelRatio())) {
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  if (Math.abs(camera.aspect - lastAspect) > 0.01) { lastAspect = camera.aspect; fitCamera(camera.aspect); }
}
function loop() {
  requestAnimationFrame(loop);
  if (window.__room) window.__room.frames++;
  resize();
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = (performance.now() - introStart) / 1000;         // 全部用真實時間,分頁切回來動畫接得上
  const introT = t;
  for (const g of animated) {
    const p = Math.max(0, Math.min(1, (introT - g.userData.delay) / 0.6));
    const e = 1 - Math.pow(1 - p, 3);                 // easeOut
    const overshoot = p < 1 ? 1 + 0.08 * Math.sin(p * Math.PI) : 1;
    g.scale.copy(g.userData.baseScale).multiplyScalar(Math.max(0.001, e * overshoot));
    if (g.userData.spin) g.rotation.y += g.userData.spin * dt;
    if (g.userData.jump) {
      // 每 2.6 秒跳一次:前 0.9 秒是拋物線,其餘停在架上
      const j = g.userData.jump, cycle = 2.6, air = 0.9;
      const u = ((t + j.phase) % cycle);
      const inAir = u < air;
      const hop = inAir ? Math.sin(Math.PI * u / air) : 0;
      g.position.y = j.baseY + j.height * hop;
      g.scale.y = g.userData.baseScale.y * (inAir ? 1 + 0.08 * hop : 1);   // 跳起來時微拉長
      // 空中轉一整圈(360°),落地剛好轉完;用 smoothstep 讓起跳/落地時轉速慢、最高點轉最快
      const k = inAir ? u / air : 1;
      const ease = k * k * (3 - 2 * k);
      const laps = Math.floor((t + j.phase) / cycle);
      g.rotation.y = (laps + ease) * Math.PI * 2;
    }
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
  // 攝影機頭左右掃 ±30°(約 8 秒一個來回),外加一點點上下點頭
  if (camHead) {
    // 掃描角度 ±45°、約 5 秒一個來回,並在兩端稍作停留(smoothstep 曲線)
    const ph = (Math.sin(t * 1.25) + 1) / 2;
    const eased = ph * ph * (3 - 2 * ph);
    camHead.rotation.y = THREE.MathUtils.degToRad(-45 + 90 * eased);
    camHead.rotation.z = THREE.MathUtils.degToRad(4) * Math.sin(t * 2.5 + 1);
  }
  // 貓頭自由左右看:偶爾轉頭、停一下、再轉回來(用幾個不同頻率的 sin 疊出不規則的節奏)
  {
    const look = 0.55 * Math.sin(t * 0.7) * Math.sin(t * 0.23 + 1.0) + 0.25 * Math.sin(t * 1.9 + 0.5) * Math.max(0, Math.sin(t * 0.31));
    catUniforms.uHead.value += (look - catUniforms.uHead.value) * Math.min(1, dt * 3);   // 平滑跟上
  }

  // 仙人掌彎曲:把時間餵給每根的著色器
  for (const lf of plantLeaves) lf.userData.uni.uTime.value = t;
  tickSeries(performance.now());
  drawScreen(t);
  controls.update();
  renderer.render(scene, camera);
}
loop();
setTimeout(() => document.getElementById('loading').classList.add('done'), 400);
window.__room = { get camHeadY() { return camHead ? camHead.rotation.y : null; }, frames: 0, camera, controls, THREE, catUniforms };
