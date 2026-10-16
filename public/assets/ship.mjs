// 等角視角的太空梭剖面:X 打開之後浮現,五間小房間,一間一個作品(滑鼠移上去房間浮起來,點了進作品)。
// 風格參考 catinsight-3d 的 3D 房間:粉彩、圓潤、柔和陰影、正交相機斜看
import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';

const WORKS = [
  { title: 'KittyCafe', tag: 'Web · iOS · Casual Game', desc: 'Serve the pickiest cat customers before the clock runs out.', url: '/kitty-cafe/', floor: 0xffd6de, wall: 0xffe9ee, accent: 0xff8fa3 },
  { title: 'Cat Street Stocks', tag: 'Board Game · Stock Market', desc: 'A board game about the stock market, with cats.', url: '/catinsight-3d/', floor: 0xcdeccf, wall: 0xe6f6e4, accent: 0x5cc77a },
  { title: 'Ocean Cleanup', tag: 'iOS Game', desc: 'A casual iOS game about cleaning up the beach.', url: 'https://apps.apple.com/tw/app/id6771914760', floor: 0xf4e3b5, wall: 0xdff1fb, accent: 0x4fb3ea },
  { title: 'Tiny Planet', tag: 'Three.js · Flight Sandbox', desc: 'Fly a little plane around a tiny planet.', url: '/tiny-planet/', floor: 0xded3f6, wall: 0xece6fb, accent: 0x9b7bea },
  { title: 'Wooden Rails', tag: 'Three.js · Track Puzzle', desc: 'A track-laying puzzle built from wooden rails.', url: '/wooden-rails/', floor: 0xf6dcbc, wall: 0xfbeedd, accent: 0xe39a4a },
];

const canvas = document.getElementById('ship');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
const scene = new THREE.Scene();
const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, -200, 400);
const VIEW = new THREE.Vector3(0.5, 0.62, 1).normalize();     // 從前上方偏右斜看(隔間牆接近側看,才不會擋住房間)
let frustumH = 13;
function resize() {
  renderer.setSize(innerWidth, innerHeight, false);
  const a = innerWidth / innerHeight;
  frustumH = a < 1 ? 13 / Math.max(a, .55) * .62 : 13;       // 直式手機看得到整艘
  cam.left = -frustumH * a / 2; cam.right = frustumH * a / 2; cam.top = frustumH / 2; cam.bottom = -frustumH / 2; cam.updateProjectionMatrix();
}
addEventListener('resize', resize); resize();

// ---------- 環境反射:一個上亮下暗、帶幾塊柔光板的小攝影棚,讓金屬和玻璃有反光 ----------
{
  const env = new THREE.Scene();
  const sky = new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), new THREE.ShaderMaterial({ side: THREE.BackSide, uniforms: {},
    vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'varying vec3 vP; void main(){ float h = normalize(vP).y*0.5+0.5; gl_FragColor = vec4(mix(vec3(0.10,0.10,0.16), vec3(0.95,0.97,1.0), smoothstep(0.2,1.0,h)), 1.0); }' }));
  env.add(sky);
  for (const [x, y, z, c] of [[6, 5, 3, 0xffffff], [-6, 3, -4, 0xbfd6ff], [0, 6, -6, 0xffe2f0]]) {
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(4, 2.5), new THREE.MeshBasicMaterial({ color: c, side: THREE.DoubleSide }));
    panel.position.set(x, y, z); panel.lookAt(0, 0, 0); env.add(panel);
  }
  const pm = new THREE.PMREMGenerator(renderer);
  scene.environment = pm.fromScene(env, 0.02).texture;
}

// ---------- 光 ----------
scene.add(new THREE.HemisphereLight(0xeaf2ff, 0x5a5070, 1.25));
const key = new THREE.DirectionalLight(0xfff3e4, 2.1); key.position.set(10, 18, 12); key.castShadow = true;
key.shadow.mapSize.set(2048, 2048); Object.assign(key.shadow.camera, { left: -16, right: 16, top: 12, bottom: -12, near: 1, far: 60 }); key.shadow.bias = -0.0006; key.shadow.radius = 4;
scene.add(key); scene.add(key.target);
const rim = new THREE.DirectionalLight(0x9fc4ff, .7); rim.position.set(-12, 6, -10); scene.add(rim);

// ---------- 小工具 ----------
const M = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: .62, metalness: .02, envMapIntensity: .55, ...o });
const G = (c, i = 2) => new THREE.MeshStandardMaterial({ color: 0x000000, emissive: c, emissiveIntensity: i });
function rbox(w, h, d, r = .08, m) {        // 圓角方塊(粉彩玩具感)
  const s = new THREE.Shape(); const x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r); s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r); s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
  const g = new THREE.ExtrudeGeometry(s, { depth: d - r * 2, bevelEnabled: true, bevelThickness: r, bevelSize: r * .6, bevelSegments: 3, curveSegments: 6 });
  g.translate(0, 0, -(d - r * 2) / 2);
  const mesh = new THREE.Mesh(g, m); mesh.castShadow = mesh.receiveShadow = true; return mesh;
}
function mesh(geo, m, cast = true) { const o = new THREE.Mesh(geo, m); o.castShadow = cast; o.receiveShadow = true; return o; }
function cat(color = 0xf2a65a, scale = 1) {  // 圓滾滾的小貓
  const g = new THREE.Group(), m = M(color), w = M(0xfff7ee);
  const body = mesh(new THREE.SphereGeometry(.42, 24, 18), m); body.scale.set(1, .9, 1.15); body.position.y = .4; g.add(body);
  const belly = mesh(new THREE.SphereGeometry(.3, 20, 14), w); belly.position.set(0, .36, .22); belly.scale.set(1, .9, .6); g.add(belly);
  const head = mesh(new THREE.SphereGeometry(.36, 24, 18), m); head.position.set(0, .98, .12); g.add(head);
  for (const s of [-1, 1]) {
    const ear = mesh(new THREE.ConeGeometry(.12, .24, 12), m); ear.position.set(s * .2, 1.3, .1); ear.rotation.z = -s * .25; g.add(ear);
    const eye = mesh(new THREE.SphereGeometry(.05, 10, 8), M(0x2a2033), false); eye.position.set(s * .13, 1.02, .44); g.add(eye);
  }
  const nose = mesh(new THREE.SphereGeometry(.035, 8, 6), M(0xff8fa3), false); nose.position.set(0, .93, .47); g.add(nose);
  const tail = mesh(new THREE.TorusGeometry(.26, .06, 8, 20, Math.PI * 1.2), m); tail.position.set(0, .45, -.42); tail.rotation.set(0, Math.PI / 2, .4); g.add(tail);
  g.scale.setScalar(scale); return g;
}
function label(text, accent) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 128; const x = c.getContext('2d');
  x.fillStyle = 'rgba(16,18,40,.82)'; const r = 40; x.beginPath(); x.roundRect(6, 14, 500, 100, r); x.fill();
  x.fillStyle = '#' + accent.toString(16).padStart(6, '0'); x.beginPath(); x.arc(56, 64, 14, 0, Math.PI * 2); x.fill();
  x.fillStyle = '#fff'; x.font = '700 50px "Helvetica Neue", -apple-system, sans-serif'; x.textBaseline = 'middle'; x.fillText(text, 88, 66);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true })); s.scale.set(2.5, .62, 1); s.renderOrder = 10; return s;
}

// ---------- 太空梭:沿 x 軸,前側(+z)切開看得到裡面 ----------
const ROOMS = WORKS.length, RW = 4, LEN = ROOMS * RW, R = 3.1, FLOOR_Y = -1.5;
const ship = new THREE.Group(); scene.add(ship);
function panelTexture() {     // 機身面板:淡淡的接縫線和鉚釘
  const c = document.createElement('canvas'); c.width = 512; c.height = 2048; const g = c.getContext('2d');
  g.fillStyle = '#f4f5f9'; g.fillRect(0, 0, 512, 2048);
  g.strokeStyle = 'rgba(120,130,160,.35)'; g.lineWidth = 3;
  for (let y = 0; y <= 2048; y += 205) { g.beginPath(); g.moveTo(0, y); g.lineTo(512, y); g.stroke(); }
  for (let x = 0; x <= 512; x += 128) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 2048); g.stroke(); }
  g.fillStyle = 'rgba(120,130,160,.45)';
  for (let y = 12; y < 2048; y += 205) for (let x = 10; x < 512; x += 32) { g.beginPath(); g.arc(x, y, 2.2, 0, Math.PI * 2); g.fill(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}
const hullM = M(0xffffff, { map: panelTexture(), roughness: .38, metalness: .12, side: THREE.DoubleSide });
const hullIn = M(0xdfe3ee, { side: THREE.BackSide });
// 機身:只留背面那半圈(上→後→下),前面切開
const hull = mesh(new THREE.CylinderGeometry(R, R, LEN, 48, 1, true, Math.PI / 2, Math.PI), hullM); hull.rotation.z = Math.PI / 2; ship.add(hull);
const hullTrim = mesh(new THREE.TorusGeometry(R, .09, 10, 48, Math.PI), M(0xb9c2d6)); hullTrim.rotation.y = Math.PI / 2;
for (const x of [-LEN / 2, LEN / 2]) { const t = hullTrim.clone(); t.position.x = x; t.rotation.set(0, -Math.PI / 2, Math.PI / 2); ship.add(t); }
// 切口的邊(上下兩條)
for (const y of [R - .02, -R + .02]) { const e = mesh(new THREE.BoxGeometry(LEN, .14, .14), M(0xc9d0df)); e.position.set(0, y, 0); ship.add(e); }
// 地板(有厚度,看得出剖面)
const floorSlab = rbox(LEN + .2, .34, R * 1.7, .1, M(0x9aa3b8)); floorSlab.position.set(0, FLOOR_Y - .17, -R * .15); ship.add(floorSlab);
// 機頭(左邊):半個橢球,一樣只留背面
const noseGeo = new THREE.SphereGeometry(R, 40, 24, 0, Math.PI); noseGeo.rotateY(-Math.PI / 2);   // 朝 -x 的半球
const nose = mesh(noseGeo, M(0xf3f4f8, { roughness: .45, metalness: .08 })); nose.scale.set(1.9, 1, 1); nose.position.x = -LEN / 2; ship.add(nose);
const cockpit = mesh(new THREE.SphereGeometry(1.2, 24, 16), M(0x23305a, { roughness: .15, metalness: .4 })); cockpit.scale.set(1.6, .8, 1.1); cockpit.position.set(-LEN / 2 - 3.6, 1.0, -1.3); ship.add(cockpit);
// 引擎(右邊)
for (const [y, z] of [[1.1, -1.2], [-1.1, -1.2], [0, -2.1]]) {
  const n = mesh(new THREE.CylinderGeometry(.9, 1.15, 1.6, 28), M(0xa4adc2, { metalness: .35, roughness: .35 })); n.rotation.z = Math.PI / 2; n.position.set(LEN / 2 + .8, y, z); ship.add(n);
  const g = mesh(new THREE.CircleGeometry(.85, 28), G(0x6cc6ff, 3.5), false); g.rotation.y = Math.PI / 2; g.position.set(LEN / 2 + 1.62, y, z); ship.add(g); g.userData.pulse = true;
}
// 機翼:後面一片、前面一片(在地板下)
const wingShape = new THREE.Shape(); wingShape.moveTo(0, 0); wingShape.lineTo(6.5, 0); wingShape.lineTo(3.5, 4.2); wingShape.lineTo(1.4, 4.2); wingShape.closePath();
const wingGeo = new THREE.ExtrudeGeometry(wingShape, { depth: .22, bevelEnabled: true, bevelThickness: .06, bevelSize: .06, bevelSegments: 2 });
for (const s of [-1, 1]) { const w = mesh(wingGeo, M(0xe8ebf3)); w.rotation.x = s * Math.PI / 2; w.position.set(LEN / 2 - 7.5, FLOOR_Y - .55, s * (R - .4)); ship.add(w);
  const tip = mesh(new THREE.BoxGeometry(1.4, .12, .16), G(WORKS[s > 0 ? 0 : 3].accent, 2.5), false); tip.position.set(LEN / 2 - 4.2, FLOOR_Y - .5, s * (R + 3.7)); ship.add(tip); }
const fin = mesh(new THREE.ExtrudeGeometry((() => { const f = new THREE.Shape(); f.moveTo(0, 0); f.lineTo(4, 0); f.lineTo(3.2, 3); f.lineTo(1.6, 3); f.closePath(); return f; })(), { depth: .2, bevelEnabled: false }), M(0xe8ebf3));
fin.position.set(LEN / 2 - 4.4, R - .25, -.9); ship.add(fin);

// ---------- 升級細節 ----------
const blinkers = [], flames = [];
// 機身上下兩道彩色飾條(貼在外殼上,稍微大一點)
for (const [a0, col] of [[Math.PI / 2 + .12, 0xff8fa3], [Math.PI * 1.5 - .3, 0x7fb8ff]]) {
  const band = mesh(new THREE.CylinderGeometry(R + .015, R + .015, LEN - .1, 48, 1, true, a0, .18), M(col, { roughness: .35, side: THREE.DoubleSide }), false);
  band.rotation.z = Math.PI / 2; ship.add(band);
}
// 切口上下兩條藍色發光燈條
for (const y of [R - .02, -R + .02]) { const e = mesh(new THREE.BoxGeometry(LEN - .4, .05, .06), G(0x7fd0ff, 2.2), false); e.position.set(0, y, .1); ship.add(e); }
// 機身頂部外側一排亮著的小舷窗
for (let k = 0; k < 9; k++) {
  const a = Math.PI / 2 + .55;                                   // 外殼上偏後的一圈位置(轉成 x 軸後)
  const w = mesh(new THREE.CircleGeometry(.16, 18), G(k % 3 ? 0xffe2a8 : 0x9fdcff, 1.8), false);
  const y = Math.cos(a - Math.PI / 2) * (R + .02), z = -Math.sin(a - Math.PI / 2) * (R + .02);
  w.position.set(-LEN / 2 + 1.2 + k * (LEN - 2.4) / 8, y, z); w.lookAt(w.position.x, y * 2, z * 2); ship.add(w);
}
// 天線(機頭上方)+ 碟形天線
{
  const mast = mesh(new THREE.CylinderGeometry(.04, .05, 1.6, 8), M(0xb9c2d6, { metalness: .6, roughness: .3 })); mast.position.set(-LEN / 2 + 1.6, R + .75, -.6); ship.add(mast);
  const tip = mesh(new THREE.SphereGeometry(.09, 12, 8), G(0xff6b6b, 3), false); tip.position.set(-LEN / 2 + 1.6, R + 1.6, -.6); ship.add(tip); blinkers.push({ m: tip, rate: 1.1, phase: 0 });
  const dish = mesh(new THREE.SphereGeometry(.55, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2.6), M(0xeef1f7, { metalness: .4, roughness: .3, side: THREE.DoubleSide }));
  dish.position.set(LEN / 2 - 2.6, R + .35, -1.1); dish.rotation.set(-.5, 0, .5); ship.add(dish);
  const dstem = mesh(new THREE.CylinderGeometry(.05, .05, .5, 8), M(0xb9c2d6)); dstem.position.set(LEN / 2 - 2.6, R + .1, -1.1); ship.add(dstem);
}
// 駕駛艙玻璃反光
{ const glint = mesh(new THREE.SphereGeometry(1.21, 24, 16, 0, Math.PI * .5, Math.PI * .15, Math.PI * .3), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .35 }), false);
  glint.scale.set(1.6, .8, 1.1); glint.position.set(-LEN / 2 - 3.6, 1.0, -1.3); ship.add(glint); }
// 航行燈:左翼紅、右翼綠、尾翼白色閃光
for (const [x, y, z, col, rate, ph] of [[LEN / 2 - 4.0, FLOOR_Y - .45, R + 3.85, 0x5cff9a, .9, .3], [LEN / 2 - 4.0, FLOOR_Y - .45, -(R + 3.85), 0xff5a5a, .9, .3], [LEN / 2 - 2.4, R + 2.85, -.8, 0xffffff, 1.6, 0]]) {
  const l = mesh(new THREE.SphereGeometry(.13, 12, 8), G(col, 3), false); l.position.set(x, y, z); ship.add(l);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: col, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); halo.scale.setScalar(1.1); halo.position.copy(l.position); ship.add(halo);
  blinkers.push({ m: l, halo, rate, phase: ph });
}
// 引擎火焰:會閃動的藍色錐形+光暈
function glowTex() {
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(.35, 'rgba(255,255,255,.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c);
}
function flameTex() {
  const c = document.createElement('canvas'); c.width = 32; c.height = 256; const g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 0, 256); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(.25, 'rgba(140,210,255,.85)'); gr.addColorStop(1, 'rgba(60,120,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 32, 256); return new THREE.CanvasTexture(c);
}
{
  const ft = flameTex(), gt = glowTex(); ft.flipY = false;   // 亮的那端貼在噴嘴
  for (const [y, z] of [[1.1, -1.2], [-1.1, -1.2], [0, -2.1]]) {
    const cone = new THREE.Mesh(new THREE.ConeGeometry(.62, 3.2, 20, 1, true), new THREE.MeshBasicMaterial({ map: ft, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    cone.geometry.translate(0, 1.6, 0); cone.rotation.z = -Math.PI / 2; cone.position.set(LEN / 2 + 1.65, y, z); ship.add(cone);   // 底(寬)在噴嘴、尖端往後
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: gt, color: 0x7fc8ff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); glow.scale.setScalar(2.6); glow.position.set(LEN / 2 + 1.9, y, z); ship.add(glow);
    flames.push({ cone, glow, ph: Math.random() * 6 });
  }
}

// ---------- 五間房 ----------
const rooms = [];
WORKS.forEach((w, i) => {
  const x0 = -LEN / 2 + i * RW, cx = x0 + RW / 2;
  const room = new THREE.Group(); room.position.x = cx; ship.add(room);
  const props = new THREE.Group(); room.add(props);
  // 房間地板、後牆(貼在機身內側)
  const fl = rbox(RW - .14, .12, R * 1.55, .05, M(w.floor)); fl.position.set(0, FLOOR_Y + .06, -R * .2); room.add(fl);
  const wall = mesh(new THREE.CylinderGeometry(R - .05, R - .05, RW - .14, 40, 1, true, Math.PI * .58, Math.PI * .84), M(w.wall, { side: THREE.BackSide }), false);
  wall.rotation.z = Math.PI / 2; room.add(wall);
  // 隔間牆(跟下一間之間)
  if (i < ROOMS - 1) { const p = rbox(.16, R * 1.45, 3.6, .06, M(0xd3d8e4)); p.position.set(RW / 2, 0, -1.3); room.add(p); }   // 隔間只到房間中段,前面敞開
  // 天花板燈條(作品代表色)
  const strip = mesh(new THREE.BoxGeometry(RW * .7, .08, .14), G(w.accent, 2.6), false); strip.position.set(0, R * .82, -R * .5); room.add(strip);
  const lamp = new THREE.PointLight(w.accent, 6, 6, 1.8); lamp.position.set(0, 1.4, 0); room.add(lamp);
  // 小圓窗(後牆)
  const win = mesh(new THREE.CircleGeometry(.5, 28), M(0x1d2a55, { roughness: .1, metalness: .3, emissive: 0x0b1433 }), false); win.position.set(0, .8, -R + .12); room.add(win);
  const winRim = mesh(new THREE.TorusGeometry(.52, .07, 8, 28), M(0xc0c7d6)); winRim.position.copy(win.position); room.add(winRim);
  // 主題擺設
  const anim = [];
  if (i === 0) {       // KittyCafe:櫃台、蛋糕櫃、兩隻貓
    const counter = rbox(2.6, .9, .8, .1, M(0xfff1f4)); counter.position.set(-.1, FLOOR_Y + .55, -1.4); props.add(counter);
    const top = rbox(2.8, .1, 1, .05, M(0xff9fb2)); top.position.set(-.1, FLOOR_Y + 1.05, -1.4); props.add(top);
    for (let k = 0; k < 4; k++) { const cake = mesh(new THREE.CylinderGeometry(.13, .13, .16, 16), M([0xfff6c9, 0xff8fa3, 0xb7e3ff, 0xd8c3ff][k])); cake.position.set(-1 + k * .55, FLOOR_Y + 1.19, -1.4); props.add(cake); }
    const barista = cat(0xf2a65a, .78); barista.position.set(.3, FLOOR_Y + .1, -2.25); props.add(barista);
    const guest = cat(0x7c6a62, .7); guest.position.set(-.9, FLOOR_Y + .1, .3); guest.rotation.y = Math.PI * .9; props.add(guest); anim.push((t) => { guest.rotation.y = Math.PI * .9 + Math.sin(t * 1.2) * .2; });
    const stool = mesh(new THREE.CylinderGeometry(.28, .22, .5, 18), M(0xff8fa3)); stool.position.set(.9, FLOOR_Y + .35, -.3); props.add(stool);
  } else if (i === 1) {  // Cat Street Stocks:棋盤桌、骰子、K 線看板
    const table = rbox(2.6, .16, 2.2, .06, M(0x8fd39d)); table.position.set(0, FLOOR_Y + .72, -.6); props.add(table);
    for (const [sx, sz] of [[-1.1, -1.5], [1.1, -1.5], [-1.1, .3], [1.1, .3]]) { const leg = mesh(new THREE.CylinderGeometry(.06, .06, .6, 8), M(0x6a7a8c)); leg.position.set(sx, FLOOR_Y + .35, sz); props.add(leg); }
    const cols = [0xff8fa3, 0xffd166, 0x6cc6ff, 0xb48bff, 0x5cc77a];
    for (let k = 0; k < 16; k++) { const a = k / 16 * Math.PI * 2; const tile = rbox(.32, .06, .32, .03, M(cols[k % 5])); tile.position.set(Math.cos(a) * .9, FLOOR_Y + .84, -.6 + Math.sin(a) * .75); props.add(tile); }
    const dice = []; for (const dx of [-.2, .25]) { const d = rbox(.26, .26, .26, .06, M(0xffffff)); d.position.set(dx, FLOOR_Y + .98, -.6); props.add(d); dice.push(d); }
    anim.push((t) => dice.forEach((d, k) => { d.rotation.set(t * (1.4 + k), t * (1.1 + k * .5), 0); d.position.y = FLOOR_Y + 1.0 + Math.abs(Math.sin(t * 2.4 + k)) * .25; }));
    const board = rbox(1.8, 1.1, .1, .05, M(0x1e2742)); board.position.set(0, .9, -2.55); props.add(board);
    const chart = new THREE.BufferGeometry().setFromPoints([[-.7, -.3], [-.4, -.1], [-.15, -.25], [.15, .15], [.4, .05], [.7, .35]].map(([x, y]) => new THREE.Vector3(x, y, 0)));
    const line = new THREE.Line(chart, new THREE.LineBasicMaterial({ color: 0x5cff9a })); line.position.set(0, .9, -2.49); props.add(line);
    const player = cat(0xe9e4dc, .62); player.position.set(1.3, FLOOR_Y + .1, .9); player.rotation.y = -.6; props.add(player);
  } else if (i === 2) {  // Ocean Cleanup:沙灘、海、螃蟹、垃圾
    const sea = mesh(new THREE.BoxGeometry(RW - .3, .08, 1.3), M(0x6fc7f2, { roughness: .2, metalness: .1 })); sea.position.set(0, FLOOR_Y + .17, -2.2); props.add(sea);
    anim.push((t) => { sea.position.y = FLOOR_Y + .17 + Math.sin(t * 1.6) * .02; });
    const crab = new THREE.Group(); const cb = mesh(new THREE.SphereGeometry(.28, 18, 12), M(0xff6b5a)); cb.scale.set(1.3, .6, 1); cb.position.y = .2; crab.add(cb);
    for (const s of [-1, 1]) { const claw = mesh(new THREE.SphereGeometry(.12, 12, 8), M(0xff6b5a)); claw.position.set(s * .42, .28, .15); crab.add(claw);
      const eye = mesh(new THREE.SphereGeometry(.05, 8, 6), M(0x222222)); eye.position.set(s * .1, .4, .18); crab.add(eye); }
    crab.position.set(-.6, FLOOR_Y + .1, -.2); props.add(crab); anim.push((t) => { crab.position.x = -.6 + Math.sin(t * .9) * .8; });
    for (const [x, z, c] of [[.9, -.6, 0x8fd3ff], [1.3, .4, 0x9be38a], [-1.2, .6, 0xffffff]]) { const b = mesh(new THREE.CylinderGeometry(.09, .09, .4, 12), M(c, { roughness: .2 })); b.rotation.z = Math.PI / 2.3; b.position.set(x, FLOOR_Y + .22, z); props.add(b); }
    const bucket = mesh(new THREE.CylinderGeometry(.28, .22, .45, 18), M(0xffd166)); bucket.position.set(1.1, FLOOR_Y + .35, -1.3); props.add(bucket);
    const cleaner = cat(0xf8f2e8, .62); cleaner.position.set(.2, FLOOR_Y + .1, .7); props.add(cleaner);
  } else if (i === 3) {  // Tiny Planet:小星球、繞著飛的小飛機
    const ped = mesh(new THREE.CylinderGeometry(.55, .7, .5, 24), M(0xcbbdf2)); ped.position.set(0, FLOOR_Y + .3, -.8); props.add(ped);
    const planet = mesh(new THREE.IcosahedronGeometry(.85, 2), M(0x6fb7ff, { flatShading: true })); planet.position.set(0, FLOOR_Y + 1.5, -.8); props.add(planet);
    const land = mesh(new THREE.IcosahedronGeometry(.87, 1), M(0x7fd67f, { flatShading: true, transparent: true, opacity: .9 })); land.scale.setScalar(.98); planet.add(land);
    const plane = new THREE.Group(); const pb = rbox(.38, .1, .12, .04, M(0xff8fa3)); plane.add(pb); const pw = rbox(.1, .04, .5, .02, M(0xffffff)); plane.add(pw);
    props.add(plane);
    anim.push((t) => { planet.rotation.y = t * .4; const a = t * 1.1; plane.position.set(Math.cos(a) * 1.25, FLOOR_Y + 1.6 + Math.sin(a * 2) * .2, -.8 + Math.sin(a) * 1.25); plane.rotation.y = -a; });
    for (let k = 0; k < 6; k++) { const st = mesh(new THREE.OctahedronGeometry(.08), G(0xfff1a8, 2), false); st.position.set(-1.4 + Math.random() * 2.8, .3 + Math.random() * 1.6, -2.3 + Math.random() * .6); props.add(st); }
  } else {               // Wooden Rails:木頭軌道一圈、小火車
    const track = mesh(new THREE.TorusGeometry(1.1, .07, 8, 48), M(0xb07a45)); track.rotation.x = Math.PI / 2; track.scale.set(1.25, 1, 1); track.position.set(0, FLOOR_Y + .16, -.7); props.add(track);
    const track2 = track.clone(); track2.scale.set(1.25 * .82, .82, 1); props.add(track2);
    for (let k = 0; k < 24; k++) { const a = k / 24 * Math.PI * 2; const sl = rbox(.08, .05, .36, .02, M(0xd9a46a)); sl.position.set(Math.cos(a) * 1.23, FLOOR_Y + .13, -.7 + Math.sin(a) * .9); sl.rotation.y = -a; props.add(sl); }
    const train = new THREE.Group();
    const loco = rbox(.5, .32, .3, .06, M(0xe65a4f)); loco.position.y = .26; train.add(loco); const chim = mesh(new THREE.CylinderGeometry(.06, .06, .18, 10), M(0x333a4a)); chim.position.set(.14, .5, 0); train.add(chim);
    const car = rbox(.42, .26, .28, .06, M(0x5cb7f0)); car.position.set(-.55, .23, 0); train.add(car);
    props.add(train); anim.push((t) => { const a = t * .7; train.position.set(Math.cos(a) * 1.02, FLOOR_Y + .1, -.7 + Math.sin(a) * .74); train.rotation.y = -a - Math.PI / 2; });
    const kid = cat(0x8a8f99, .62); kid.position.set(1.2, FLOOR_Y + .1, .9); kid.rotation.y = -.5; props.add(kid);
  }
  // 房名(浮在房間上方)
  const lb = label(w.title, w.accent); lb.position.set(0, R + 1.1, .2); room.add(lb);
  // 滑鼠判定用的隱形盒子
  const hit = new THREE.Mesh(new THREE.BoxGeometry(RW - .2, R * 2, R * 2), new THREE.MeshBasicMaterial({ visible: false })); hit.position.set(0, 0, -.2); room.add(hit);
  hit.userData.i = i;
  rooms.push({ w, room, props, lb, hit, anim, lamp, cx, lift: 0 });
});

// ---------- 背景天空:三層星星(亮的會閃)+ 隨機流星(螢幕座標,不跟著鏡頭縮放)----------
const skyScene = new THREE.Scene(), skyCam = new THREE.OrthographicCamera(0, 1, 1, 0, -1, 1);
const starMat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  uniforms: { uTime: { value: 0 }, uDpr: { value: renderer.getPixelRatio() } },
  vertexShader: `attribute float aSize; attribute float aPhase; attribute float aTw; uniform float uTime, uDpr; varying float vA;
    void main(){ vA = mix(1.0, 0.35 + 0.65*abs(sin(uTime*(0.6+aTw*1.8) + aPhase)), step(0.5, aTw)); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_PointSize = aSize * uDpr; }`,
  fragmentShader: `varying float vA; void main(){ vec2 c = gl_PointCoord-0.5; float r = length(c); if(r>0.5) discard; float a = smoothstep(0.5,0.0,r); gl_FragColor = vec4(vec3(0.85,0.9,1.0), a*a*vA); }` });
let starGeo = null;
function buildStars() {
  const W = innerWidth, H = innerHeight, N = Math.round(W * H / 380);   // 1280×800 約 2,700 顆
  const pos = new Float32Array(N * 3), size = new Float32Array(N), ph = new Float32Array(N), tw = new Float32Array(N);
  for (let k = 0; k < N; k++) {
    const r = Math.random();
    pos.set([Math.random() * W, Math.random() * H, 0], k * 3);
    size[k] = r < .8 ? 1.2 + Math.random() * .8 : r < .97 ? 2.2 + Math.random() * 1.2 : 3.6 + Math.random() * 1.6;   // 小、中、少數亮星
    ph[k] = Math.random() * 6.28; tw[k] = r > .8 ? Math.random() : Math.random() * .5;                             // 亮一點的才會閃
  }
  if (starGeo) { skyScene.remove(skyScene.userData.stars); starGeo.dispose(); }
  starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); starGeo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  starGeo.setAttribute('aPhase', new THREE.BufferAttribute(ph, 1)); starGeo.setAttribute('aTw', new THREE.BufferAttribute(tw, 1));
  const pts = new THREE.Points(starGeo, starMat); pts.frustumCulled = false; skyScene.add(pts); skyScene.userData.stars = pts;
  skyCam.right = W; skyCam.top = H; skyCam.updateProjectionMatrix();
}
buildStars(); addEventListener('resize', buildStars);
// 流星:頭亮尾淡的細長條,從畫面上半部往左下劃過
const meteorTex = (() => { const c = document.createElement('canvas'); c.width = 256; c.height = 16; const g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 256, 0); gr.addColorStop(0, 'rgba(160,200,255,0)'); gr.addColorStop(.85, 'rgba(210,230,255,.7)'); gr.addColorStop(1, 'rgba(255,255,255,1)');
  g.fillStyle = gr; g.beginPath(); g.moveTo(0, 8); g.lineTo(240, 3); g.arc(246, 8, 6, -Math.PI / 2, Math.PI / 2); g.lineTo(0, 9); g.fill();
  return new THREE.CanvasTexture(c); })();
const meteors = [];
for (let k = 0; k < 4; k++) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: meteorTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  m.visible = false; skyScene.add(m); meteors.push({ m, life: 0, dur: 1, vx: 0, vy: 0 });
}
let nextMeteor = 1.2;
function stepSky(dt, t) {
  starMat.uniforms.uTime.value = t;
  nextMeteor -= dt;
  if (nextMeteor <= 0) {
    nextMeteor = 1 + Math.random() * 3;
    const f = meteors.find((x) => !x.m.visible);
    if (f) {
      const W = innerWidth, H = innerHeight, ang = Math.PI + .35 + Math.random() * .55, sp = 700 + Math.random() * 700, len = 120 + Math.random() * 200;
      f.vx = Math.cos(ang) * sp; f.vy = Math.sin(ang) * sp; f.life = 0; f.dur = .7 + Math.random() * .7;
      f.m.position.set(W * (.3 + Math.random() * .7), H * (.5 + Math.random() * .5), 0);
      f.m.rotation.z = ang + Math.PI; f.m.scale.set(len, 6 + Math.random() * 4, 1); f.m.visible = true;
    }
  }
  for (const f of meteors) {
    if (!f.m.visible) continue;
    f.life += dt; f.m.position.x += f.vx * dt; f.m.position.y += f.vy * dt;
    const k = f.life / f.dur; f.m.material.opacity = Math.sin(Math.PI * Math.min(1, k));
    if (k >= 1) f.m.visible = false;
  }
}

// ---------- 星際穿越(光速星線):出發後自動播放 ----------
const warpScene = new THREE.Scene(), warpCam = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, .1, 400);
const WN = 1400, wData = [], wPos = new Float32Array(WN * 6), wCol = new Float32Array(WN * 6);
for (let k = 0; k < WN; k++) {
  const a = Math.random() * Math.PI * 2, r = 1.2 + Math.pow(Math.random(), .6) * 40;
  wData.push({ x: Math.cos(a) * r, y: Math.sin(a) * r, z: -Math.random() * 300 });
  const c = Math.random() < .25 ? [.6, .8, 1] : Math.random() < .35 ? [.85, .75, 1] : [1, 1, 1];
  wCol.set([...c, ...c.map((v) => v * .1)], k * 6);
}
const wGeo = new THREE.BufferGeometry(); wGeo.setAttribute('position', new THREE.BufferAttribute(wPos, 3)); wGeo.setAttribute('color', new THREE.BufferAttribute(wCol, 3));
const wMat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
const warpLines = new THREE.LineSegments(wGeo, wMat); warpLines.frustumCulled = false; warpScene.add(warpLines);
function stepWarp(dt, w) {
  const speed = 14 + w * 210, len = 1 + w * 22;
  for (let k = 0; k < WN; k++) {
    const d = wData[k]; d.z += speed * dt; if (d.z > 2) { d.z -= 300; }
    wPos.set([d.x, d.y, d.z, d.x, d.y, d.z - len], k * 6);
  }
  wGeo.attributes.position.needsUpdate = true; wMat.opacity = Math.min(1, w * 1.4);
  warpCam.rotation.z += dt * w * .12;                         // 慢慢旋轉,有在隧道裡鑽的感覺
}
addEventListener('resize', () => { warpCam.aspect = innerWidth / innerHeight; warpCam.updateProjectionMatrix(); });
renderer.autoClear = false;

// ---------- 互動 ----------
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(9, 9);
let hover = -1;
addEventListener('pointermove', (e) => { ndc.set(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1); });
canvas.addEventListener('click', () => { if (hover >= 0) open(WORKS[hover]); });
function open(w) { if (/^https?:/.test(w.url)) window.open(w.url, '_blank', 'noopener'); else location.href = w.url; }
const card = document.getElementById('card');
let shownCard = -2;
function showCard(i) {
  if (i === shownCard) return; shownCard = i;
  if (i < 0) { card.classList.remove('on'); return; }
  const w = WORKS[i];
  card.querySelector('small').textContent = `Room ${String(i + 1).padStart(2, '0')} · ${w.tag}`;
  card.querySelector('h2').textContent = w.title; card.querySelector('p').textContent = w.desc;
  const a = card.querySelector('a'); a.href = w.url; a.target = /^https?:/.test(w.url) ? '_blank' : ''; card.classList.add('on');
}

// ---------- 捲動:淡入、從遠處拉近、再一間一間看過去 ----------
const clamp01 = (v) => Math.min(1, Math.max(0, v)), seg = (v, a, b) => clamp01((v - a) / (b - a)), ease = (t) => t * t * (3 - 2 * t);
const clock = new THREE.Clock();
const flashEl = document.getElementById('flash');
const tgt = new THREE.Vector3();
function frame() {
  const dt = Math.min(.05, clock.getDelta()), t = clock.elapsedTime;
  const XP = window.__xp || { ship: 0, tour: 0, warp: 0, flash: 0 };
  const appear = XP.ship, tour = XP.tour;                       // control.mjs:出發後太空梭飛進來、之後捲動看房間
  const warpOn = XP.warp > .001;
  canvas.style.opacity = Math.max(appear, Math.min(1, XP.warp * 3)).toFixed(3);
  canvas.style.pointerEvents = appear > .9 ? 'auto' : 'none';
  flashEl.style.opacity = (XP.flash || 0).toFixed(3);
  if (appear <= 0.001 && !warpOn) { requestAnimationFrame(frame); return; }
  renderer.clear();
  if (appear > .001) { stepSky(dt, t); renderer.render(skyScene, skyCam); }
  if (warpOn) { stepWarp(dt, XP.warp); renderer.render(warpScene, warpCam); }
  if (appear <= 0.001) { requestAnimationFrame(frame); return; }

  // 鏡頭:先看整艘(從很小拉近),之後放大、沿著房間平移
  const r = tour * (ROOMS - 1), ri = Math.round(r);
  const focusX = tour > 0 ? -LEN / 2 + RW / 2 + r * RW : 0;
  const zoomIn = ease(seg(tour, 0, .12));
  const zoom = THREE.MathUtils.lerp(.03, .62, ease(appear)) * THREE.MathUtils.lerp(1, 2.5, zoomIn);   // 先看整艘(含機頭和火焰),再拉近看房間
  ship.rotation.y = (1 - appear) * -.9;               // 從遠方轉著飛進來
  tgt.set(THREE.MathUtils.lerp(0, focusX, zoomIn), THREE.MathUtils.lerp(-.6, -.6, zoomIn), 0);
  cam.position.copy(tgt).addScaledVector(VIEW, 60); cam.lookAt(tgt); cam.zoom = zoom; cam.updateProjectionMatrix();
  ship.position.y = Math.sin(t * .7) * .12; ship.rotation.z = Math.sin(t * .5) * .012;

  // 滑鼠指到哪一間
  hover = -1;
  if (appear > .9) { ray.setFromCamera(ndc, cam); const h = ray.intersectObjects(rooms.map(r => r.hit), false)[0]; if (h) hover = h.object.userData.i; }
  canvas.style.cursor = hover >= 0 ? 'pointer' : '';
  const active = hover >= 0 ? hover : (tour > 0.02 ? ri : -1);
  showCard(appear > .9 ? active : -1);

  rooms.forEach((rm, i) => {
    const on = i === hover || (hover < 0 && tour > .02 && i === ri);
    rm.lift += ((on ? 1 : 0) - rm.lift) * .12;
    rm.props.position.y = rm.lift * .35; rm.lamp.intensity = 6 + rm.lift * 10;
    const k = (1 + rm.lift * .15) / Math.max(1, zoom * .75); rm.lb.scale.set(2.5 * k, .62 * k, 1); rm.lb.position.y = R + .9 + rm.lift * .3;
    rm.lb.material.opacity = tour > .02 && hover < 0 ? (i === ri ? 1 : .35) : 1;
    rm.anim.forEach((f) => f(t));
  });
  ship.traverse((o) => { if (o.userData.pulse) o.material.emissiveIntensity = 3 + Math.sin(t * 6) * .6; });
  for (const b of blinkers) { const on = ((t * b.rate + b.phase) % 1) < .18; b.m.material.emissiveIntensity = on ? 5 : .3; if (b.halo) b.halo.material.opacity = on ? 1 : .08; }
  for (const f of flames) { const k = .85 + Math.sin(t * 23 + f.ph) * .08 + Math.sin(t * 37 + f.ph * 2) * .06; f.cone.scale.set(1, k, 1); f.glow.material.opacity = .7 + (k - .85) * 2; }
  key.target.position.copy(tgt);
  renderer.render(scene, cam);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
