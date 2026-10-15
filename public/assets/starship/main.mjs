// 首頁最後一段:星際戰艦。control.mjs 的 XP 決定現在在哪:
//   launch 期間 → 光速星線(warp)、白光,之後戰艦才從遠方出現(XP.ship;穿越途中不畫戰艦)
//   ship 狀態 → 自己的流程:外觀(慢慢轉、可拖曳,點機庫口)→ 穿過機庫和通道 → 中央大廳(六道艙門)
//                → 點艙門飛進作品艙;艙裡左右切換隔壁艙;往上滾 = 回上一層、往下滾 = 往前
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createExterior } from './exterior.mjs?v=4';
import { ROOMS, buildRoom } from './rooms.mjs?v=3';
import { createHall, createCorridor } from './hall.mjs?v=2';

const canvas = document.getElementById('ship');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
renderer.autoClear = false;
const envTex = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), .04).texture;

// ---------- 背景天空:三層星星(亮的會閃)+ 隨機流星(螢幕座標)----------
const skyScene = new THREE.Scene(), skyCam = new THREE.OrthographicCamera(0, 1, 1, 0, -1, 1);
const starMat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  uniforms: { uTime: { value: 0 }, uDpr: { value: renderer.getPixelRatio() } },
  vertexShader: `attribute float aSize; attribute float aPhase; attribute float aTw; uniform float uTime, uDpr; varying float vA;
    void main(){ vA = mix(1.0, 0.35 + 0.65*abs(sin(uTime*(0.6+aTw*1.8) + aPhase)), step(0.5, aTw)); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_PointSize = aSize * uDpr; }`,
  fragmentShader: `varying float vA; void main(){ vec2 c = gl_PointCoord-0.5; float r = length(c); if(r>0.5) discard; float a = smoothstep(0.5,0.0,r); gl_FragColor = vec4(vec3(0.85,0.9,1.0), a*a*vA); }` });
let starPts = null;
function buildStars() {
  const W = innerWidth, H = innerHeight, N = Math.round(W * H / 380);
  const pos = new Float32Array(N * 3), size = new Float32Array(N), ph = new Float32Array(N), tw = new Float32Array(N);
  for (let k = 0; k < N; k++) { const r = Math.random(); pos.set([Math.random() * W, Math.random() * H, 0], k * 3);
    size[k] = r < .8 ? 1.2 + Math.random() * .8 : r < .97 ? 2.2 + Math.random() * 1.2 : 3.6 + Math.random() * 1.6; ph[k] = Math.random() * 6.28; tw[k] = r > .8 ? Math.random() : Math.random() * .5; }
  if (starPts) { skyScene.remove(starPts); starPts.geometry.dispose(); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aSize', new THREE.BufferAttribute(size, 1)); g.setAttribute('aPhase', new THREE.BufferAttribute(ph, 1)); g.setAttribute('aTw', new THREE.BufferAttribute(tw, 1));
  starPts = new THREE.Points(g, starMat); starPts.frustumCulled = false; skyScene.add(starPts);
  skyCam.right = W; skyCam.top = H; skyCam.updateProjectionMatrix();
}
const meteorTex = (() => { const c = document.createElement('canvas'); c.width = 256; c.height = 16; const g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 256, 0); gr.addColorStop(0, 'rgba(160,200,255,0)'); gr.addColorStop(.85, 'rgba(210,230,255,.7)'); gr.addColorStop(1, 'rgba(255,255,255,1)');
  g.fillStyle = gr; g.beginPath(); g.moveTo(0, 8); g.lineTo(240, 3); g.arc(246, 8, 6, -Math.PI / 2, Math.PI / 2); g.lineTo(0, 9); g.fill(); return new THREE.CanvasTexture(c); })();
const meteors = [];
for (let k = 0; k < 4; k++) { const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: meteorTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); m.visible = false; skyScene.add(m); meteors.push({ m, life: 0, dur: 1, vx: 0, vy: 0 }); }
let nextMeteor = 1.2;
function stepSky(dt, t) {
  starMat.uniforms.uTime.value = t; nextMeteor -= dt;
  if (nextMeteor <= 0) { nextMeteor = 1 + Math.random() * 3; const f = meteors.find((x) => !x.m.visible);
    if (f) { const W = innerWidth, H = innerHeight, ang = Math.PI + .35 + Math.random() * .55, sp = 700 + Math.random() * 700, len = 120 + Math.random() * 200;
      f.vx = Math.cos(ang) * sp; f.vy = Math.sin(ang) * sp; f.life = 0; f.dur = .7 + Math.random() * .7; f.m.position.set(W * (.3 + Math.random() * .7), H * (.5 + Math.random() * .5), 0);
      f.m.rotation.z = ang; f.m.scale.set(len, 6 + Math.random() * 4, 1); f.m.visible = true; } }   // 貼圖亮頭在 +x,轉成跟速度同方向 → 亮頭在前、尾巴在後
  for (const f of meteors) { if (!f.m.visible) continue; f.life += dt; f.m.position.x += f.vx * dt; f.m.position.y += f.vy * dt; const k = f.life / f.dur; f.m.material.opacity = Math.sin(Math.PI * Math.min(1, k)); if (k >= 1) f.m.visible = false; }
}

// ---------- 光速星線(出發後)----------
const warpScene = new THREE.Scene(), warpCam = new THREE.PerspectiveCamera(70, 1, .1, 400);
const WN = 1400, wData = [], wPos = new Float32Array(WN * 6), wCol = new Float32Array(WN * 6);
for (let k = 0; k < WN; k++) { const a = Math.random() * Math.PI * 2, r = 1.2 + Math.pow(Math.random(), .6) * 40; wData.push({ x: Math.cos(a) * r, y: Math.sin(a) * r, z: -Math.random() * 300 });
  const c = Math.random() < .25 ? [.6, .8, 1] : Math.random() < .35 ? [.85, .75, 1] : [1, 1, 1]; wCol.set([...c, ...c.map((v) => v * .1)], k * 6); }
const wGeo = new THREE.BufferGeometry(); wGeo.setAttribute('position', new THREE.BufferAttribute(wPos, 3)); wGeo.setAttribute('color', new THREE.BufferAttribute(wCol, 3));
const wMat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
const warpLines = new THREE.LineSegments(wGeo, wMat); warpLines.frustumCulled = false; warpScene.add(warpLines);
function stepWarp(dt, w) { const speed = 14 + w * 210, len = 1 + w * 22;
  for (let k = 0; k < WN; k++) { const d = wData[k]; d.z += speed * dt; if (d.z > 2) d.z -= 300; wPos.set([d.x, d.y, d.z, d.x, d.y, d.z - len], k * 6); }
  wGeo.attributes.position.needsUpdate = true; wMat.opacity = Math.min(1, w * 1.4); warpCam.rotation.z += dt * w * .12; }

// ---------- 戰艦外觀 ----------
const extScene = new THREE.Scene(); extScene.environment = envTex;
extScene.add(new THREE.HemisphereLight(0xbcd2ff, 0x1a1830, .5));
const ext = createExterior(extScene);
const extCam = new THREE.PerspectiveCamera(38, 1, .5, 2000);

// ---------- 機庫 → 通道 ----------
const corScene = new THREE.Scene(); corScene.environment = envTex;
const cor = createCorridor(corScene);
const corCam = new THREE.PerspectiveCamera(62, 1, .1, 120);

// ---------- 作品艙(一次只畫一間)----------
const roomScene = new THREE.Scene(); roomScene.environment = envTex;
roomScene.add(new THREE.HemisphereLight(0xffe4f2, 0x3c3a78, .6));
const key = new THREE.DirectionalLight(0xfff0e0, 1.35); key.castShadow = true; key.shadow.mapSize.set(2048, 2048);
Object.assign(key.shadow.camera, { near: 1, far: 40, left: -7, right: 7, top: 7, bottom: -7 }); key.shadow.bias = -.0015; key.shadow.normalBias = .06;
roomScene.add(key); roomScene.add(key.target);
const fill = new THREE.DirectionalLight(0xc9b4ff, .35); fill.position.set(-6, 5, 6); roomScene.add(fill);
const GAP = 22;            // 房與房在場景裡的間距(一次只畫一間,換房是整張畫面左右滑)
const rooms = ROOMS.map((r, i) => { const b = buildRoom(roomScene, r, {}); b.group.position.set(i * GAP, 0, 0); return b; });
const roomCam = new THREE.PerspectiveCamera(30, 1, .1, 200);
const CAM_OFF = new THREE.Vector3(9.6, 7.0, 9.6).sub(new THREE.Vector3(0, 1.55, 0));

// ---------- 中央大廳 ----------
const hallScene = new THREE.Scene(); hallScene.environment = envTex;
hallScene.add(new THREE.HemisphereLight(0xe6eeff, 0x3c3a78, .5));
const hkey = new THREE.DirectionalLight(0xfff4e8, 1.05); hkey.position.set(7, 14, 9); hkey.castShadow = true; hkey.shadow.mapSize.set(2048, 2048);
Object.assign(hkey.shadow.camera, { near: 1, far: 50, left: -10, right: 10, top: 10, bottom: -10 }); hkey.shadow.bias = -.0015; hkey.shadow.normalBias = .06;
hallScene.add(hkey);
const hall = createHall(hallScene, ROOMS); hall.root.updateMatrixWorld(true);
const hallCam = new THREE.PerspectiveCamera(38, 1, .1, 200);

function resize() {
  renderer.setSize(innerWidth, innerHeight, false);
  const a = innerWidth / innerHeight;
  for (const c of [warpCam, extCam, roomCam, corCam, hallCam]) { c.aspect = a; c.updateProjectionMatrix(); }
  starMat.uniforms.uDpr.value = renderer.getPixelRatio(); buildStars();
}
addEventListener('resize', resize); resize();

// ---------- UI ----------
const card = document.getElementById('card'), flashEl = document.getElementById('flash'), dots = document.getElementById('dots');
const arrows = document.getElementById('arrows'), prevBtn = document.getElementById('prevRoom'), nextBtn = document.getElementById('nextRoom');
const veil = Object.assign(document.createElement('div'), { id: 'veil' });          // 轉場用的黑幕
veil.style.cssText = 'position:fixed;inset:0;z-index:4;background:#05070d;opacity:0;pointer-events:none';
document.body.appendChild(veil);
if (dots) { dots.innerHTML = ROOMS.map((r) => `<button aria-label="${r.title}"></button>`).join('');
  [...dots.children].forEach((b, i) => b.addEventListener('click', () => (mode === 'room' ? slideTo(i) : mode === 'hall' && toRoom(i)))); }
prevBtn?.addEventListener('click', () => nav('h', -1));
nextBtn?.addEventListener('click', () => nav('h', 1));
let shownCard = -2;
function showCard(i) {
  if (i === shownCard) return; shownCard = i;
  if (i < 0) { card.classList.remove('on'); return; }
  const w = ROOMS[i];
  card.querySelector('small').textContent = `Room ${String(i + 1).padStart(2, '0')} · ${w.tag}`;
  card.querySelector('h2').textContent = w.title; card.querySelector('p').textContent = w.desc;
  const a = card.querySelector('a'); a.href = w.url; a.target = /^https?:/.test(w.url) ? '_blank' : ''; card.classList.add('on');
}
function open(w) { if (/^https?:/.test(w.url)) window.open(w.url, '_blank', 'noopener'); else location.href = w.url; }

// ---------- 流程狀態 ----------
// ext 外觀 → enter(飛進機庫、走通道)→ hall 大廳 → toRoom → room(左右換艙)→ toHall → hall → exit → ext
let mode = 'ext', t0 = 0, cur = 0, roomF = 0, side = 1, fromDoor = 0, clockT = 0;
const ENTER = 5.2, TO_ROOM = 1.5, TO_HALL = 1.2, EXIT = 1.6;
const busy = () => !['ext', 'hall', 'room'].includes(mode);
function go(m, extra = {}) { mode = m; t0 = clockT; Object.assign(window.__shipState, { mode: m, ...extra }); }
window.__shipState = { mode };
function enterShip() { if (mode !== 'ext') return; side = extCam.position.x >= 0 ? 1 : -1; go('enter'); }
function toRoom(i) { if (mode !== 'hall') return; cur = roomF = i; fromDoor = i; go('toRoom', { room: i }); }
function slideTo(i) { cur = Math.max(0, Math.min(ROOMS.length - 1, i)); window.__shipState.room = cur; }
function nav(kind, d = 0) {
  if (busy()) return;
  if (kind === 'back') { if (mode === 'room') { fromDoor = cur; go('toHall'); } else if (mode === 'hall') go('exit'); return; }
  // 滾輪 / 上下滑:往下 = 往前(進艦 → 第一艙 → 下一艙),往上 = 回上一層(艙 → 大廳 → 艦外)
  if (mode === 'ext' && kind === 'v' && d > 0) enterShip();
  else if (mode === 'hall' && kind === 'v') d < 0 ? go('exit') : toRoom(0);
  else if (mode === 'room') { if (kind === 'h' || d > 0) slideTo(cur + d); else { fromDoor = cur; go('toHall'); } }
}
window.__shipNav = nav;
window.__ship = { enter: enterShip, toRoom, slideTo, nav, jump(m, i = 0) { cur = roomF = fromDoor = i; go(m, { room: i }); t0 = -99; } };

// ---------- 滑鼠 / 手指:外觀拖曳旋轉、點機庫口、點艙門、點作品艙 ----------
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(9, 9);
let dragYaw = 0, dragPitch = 0, drag = null, hover = -1, hoverHangar = false;
const setNdc = (e) => ndc.set(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
addEventListener('pointermove', setNdc);
canvas.style.touchAction = 'none';
canvas.addEventListener('pointerdown', (e) => { setNdc(e); drag = { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY }; if (mode === 'ext') { window.__shipDrag = true; canvas.setPointerCapture(e.pointerId); } });
canvas.addEventListener('pointermove', (e) => { if (!drag || mode !== 'ext') return;
  dragYaw -= (e.clientX - drag.x) * .0065; dragPitch = Math.min(1.25, Math.max(-1.0, dragPitch + (e.clientY - drag.y) * .005)); drag.x = e.clientX; drag.y = e.clientY; });
canvas.addEventListener('pointerup', (e) => {
  const moved = drag ? Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) : 99; drag = null; window.__shipDrag = false;
  if (moved > 6) return;                                       // 是拖曳,不是點擊
  setNdc(e); const h = pick();
  if (mode === 'ext' && h === 'hangar') enterShip();
  else if (mode === 'hall' && h >= 0) toRoom(h);
  else if (mode === 'room' && h >= 0) open(ROOMS[h]);
});
canvas.addEventListener('pointercancel', () => { drag = null; window.__shipDrag = false; });
function pick() {
  if (mode === 'ext') {                                        // 只算看得到的那一側機庫口(被船身擋住的不算)
    ray.setFromCamera(ndc, extCam); const h = ray.intersectObject(ext.ship, true).find((x) => x.object.isMesh);
    return h && ext.hangarHits.includes(h.object) ? 'hangar' : -1; }
  if (mode === 'hall') { ray.setFromCamera(ndc, hallCam); const h = ray.intersectObjects(hall.hits, false)[0]; return h ? h.object.userData.door : -1; }
  if (mode === 'room' && Math.abs(roomF - cur) < .02) { setRoomCam(cur); ray.setFromCamera(ndc, roomCam); return ray.intersectObjects(rooms[cur].group.children, true).length ? cur : -1; }
  return -1;
}

// ---------- 各段的鏡頭 + 繪製 ----------
const clamp01 = (v) => Math.min(1, Math.max(0, v)), ease = (t) => t * t * (3 - 2 * t), seg = (x, a, b) => clamp01((x - a) / (b - a));
const tgt = new THREE.Vector3(), camPos = new THREE.Vector3(), V = (x, y, z) => new THREE.Vector3(x, y, z);
const port = () => innerWidth < innerHeight;

// 外觀:戰艦從遠方飛近(appear)後慢慢自轉一圈一圈;dive 0→1 = 鏡頭飛向機庫口、穿進去
function drawExterior(t, appear, dive = 0) {
  ext.update(t, hoverHangar);
  const fitE = port() ? .8 / extCam.aspect : 1;
  const yaw = 2.3 + t * .045 + dragYaw, dist = THREE.MathUtils.lerp(420, 80, ease(appear)) * fitE;
  const el = Math.min(1.45, Math.max(-1.1, .36 + dragPitch + Math.sin(t * .1) * .03));
  camPos.set(Math.sin(yaw) * Math.cos(el) * dist, Math.sin(el) * dist, Math.cos(yaw) * Math.cos(el) * dist); tgt.set(0, 2, 4);
  if (dive > 0) {
    const h = ext.hangarWorld(side), out = V(side, 0, 0);
    const p1 = h.clone().addScaledVector(out, 16).add(V(0, 2.5, 0)), p2 = h.clone().addScaledVector(out, .3);
    const a = ease(seg(dive, 0, .62)), b = ease(seg(dive, .62, 1));
    camPos.lerp(p1, a).lerp(p2, b); tgt.lerp(h, a).lerp(h.clone().addScaledVector(out, -6), b);
  }
  extCam.position.copy(camPos); extCam.lookAt(tgt); renderer.render(extScene, extCam);
}
function drawCorridor(p, t) {
  const z = THREE.MathUtils.lerp(cor.START, cor.END, ease(p) * .3 + p * .7);
  corCam.position.set(Math.sin(t * 1.3) * .08, .2 + Math.sin(t * 2.1) * .05, z); corCam.lookAt(0, .1, z - 10);
  cor.update(z); renderer.render(corScene, corCam);
}
function hallHome(v) {
  const k = port() ? Math.max(1, 1.32 / hallCam.aspect) : 1;   // 直式螢幕拉遠,六道門都放得下
  return v.set(0, 9.2 * k, 14.2 * k);
}
const HALL_T = V(0, 1.4, -1.6);
function drawHallAt(t, dt, pos, tg) { hallCam.position.copy(pos); hallCam.lookAt(tg); hall.update(t, dt); renderer.render(hallScene, hallCam); }
// 大廳全景;from + k < 1 = 從 from 的位置往全景拉
function drawHall(t, dt, from = null, k = 1) {
  hallHome(camPos); tgt.copy(HALL_T);
  if (from && k < 1) { camPos.lerpVectors(from.pos, camPos, ease(k)); tgt.lerpVectors(from.tgt, HALL_T, ease(k)); }
  drawHallAt(t, dt, camPos, tgt);
}
function setRoomCam(i, near = 0) {
  const fit = Math.max(1.12, 1.4 / roomCam.aspect);
  tgt.set(i * GAP, 1.55, 0);
  roomCam.position.copy(tgt).addScaledVector(CAM_OFF, fit * (1 - near * .45)); roomCam.lookAt(tgt);
}
function drawRoom(i, t, dt, near = 0) {
  setRoomCam(i, near);
  key.position.set(tgt.x + 6, 10, 4); key.target.position.set(tgt.x, 0, 0); key.target.updateMatrixWorld();
  rooms.forEach((r, j) => { r.group.visible = j === i; });
  rooms[i].update(t, dt);
  renderer.render(roomScene, roomCam);
}
// 作品艙:目前這間 + 正在滑進來的那間,各畫在自己往左 / 右推的畫面上
function drawRooms(t, dt, near = 0) {
  const W = innerWidth, H = innerHeight, p0 = Math.floor(roomF), f = roomF - p0;
  for (const p of f > .001 ? [p0, p0 + 1] : [p0]) {
    if (p < 0 || p >= ROOMS.length) continue;
    renderer.setViewport(Math.round((p - roomF) * W), 0, W, H); renderer.clearDepth();
    drawRoom(p, t, dt, near);
  }
  renderer.setViewport(0, 0, W, H);
}
// 站在艙門前的鏡頭(進門 / 出門的轉場用)
const doorView = (i, d = 2.4) => ({ pos: hall.doors[i].world(d, 1.6), tgt: hall.doors[i].world(-2, 1.5) });

// ---------- 每幀 ----------
const clock = new THREE.Clock();
function frame() {
  const dt = Math.min(.05, clock.getDelta()), t = clock.elapsedTime; clockT = t;
  const XP = window.__xp || { ship: 0, warp: 0, flash: 0, state: '' };
  const appear = XP.ship, warpOn = XP.warp > .001, live = appear > .9 && XP.state === 'ship';
  canvas.style.opacity = Math.max(appear, Math.min(1, XP.warp * 3)).toFixed(3);
  canvas.style.pointerEvents = appear > .9 ? 'auto' : 'none';
  if (appear <= .001 && !warpOn) { flashEl.style.opacity = (XP.flash || 0).toFixed(3); requestAnimationFrame(frame); return; }
  flashEl.style.opacity = (XP.flash || 0).toFixed(3);

  renderer.clear();
  stepSky(dt, t); renderer.render(skyScene, skyCam);
  if (warpOn) { stepWarp(dt, XP.warp); renderer.render(warpScene, warpCam); }

  const k = t - t0;
  let fade = 0;
  if (appear > .001) {                                         // 穿越途中(戰艦還沒出現)不畫戰艦
    if (mode === 'ext') drawExterior(t, appear);
    else if (mode === 'enter') {                               // 0~1.7 秒飛進機庫口 → 通道 → 大廳
      if (k < 1.7) { drawExterior(t, 1, k / 1.7); fade = ease(seg(k, 1.35, 1.7)); }
      else if (k < 4.3) { drawCorridor((k - 1.7) / 2.6, t); fade = 1 - ease(seg(k, 1.7, 2.0)) + ease(seg(k, 3.95, 4.3)); }
      else { drawHall(t, dt, { pos: V(0, 2.2, 13.5), tgt: V(0, 1.8, 0) }, (k - 4.3) / (ENTER - 4.3)); fade = 1 - ease(seg(k, 4.3, 4.65)); }
      if (k >= ENTER) go('hall');
    } else if (mode === 'hall') drawHall(t, dt);
    else if (mode === 'toRoom') {                              // 鏡頭走到艙門前、門滑開、穿進去 → 作品艙
      const d = hall.doors[cur];
      if (k < .85) { d.open = ease(seg(k, .15, .6)); const v = doorView(cur, .2), a = ease(seg(k, 0, .85));
        hallHome(camPos).lerp(v.pos, a); tgt.copy(HALL_T).lerp(v.tgt, a); drawHallAt(t, dt, camPos, tgt); fade = ease(seg(k, .6, .85)); }
      else { d.open = 0; drawRooms(t, dt, 1 - ease(seg(k, .85, TO_ROOM))); fade = 1 - ease(seg(k, .85, 1.15)); }
      if (k >= TO_ROOM) go('room', { room: cur });
    } else if (mode === 'room') { roomF += (cur - roomF) * Math.min(1, dt * 3.2); if (Math.abs(cur - roomF) < .002) roomF = cur; drawRooms(t, dt); }
    else if (mode === 'toHall') {                              // 作品艙淡出 → 從那道艙門前退回大廳全景
      if (k < .35) { drawRooms(t, dt, ease(seg(k, 0, .35)) * .5); fade = ease(seg(k, 0, .35)); }
      else { drawHall(t, dt, doorView(fromDoor), (k - .35) / (TO_HALL - .35)); fade = 1 - ease(seg(k, .35, .65)); }
      if (k >= TO_HALL) go('hall');
    } else if (mode === 'exit') {                              // 大廳淡出 → 從機庫口退回太空看整艘船
      if (k < .4) { drawHall(t, dt); fade = ease(seg(k, 0, .4)); }
      else { drawExterior(t, 1, 1 - ease(seg(k, .4, EXIT))); fade = 1 - ease(seg(k, .4, .75)); }
      if (k >= EXIT) go('ext');
    }
  }
  veil.style.opacity = fade.toFixed(3);

  // 滑鼠指到的東西(機庫口 / 艙門 / 作品艙)
  hover = -1; hoverHangar = false;
  if (live && !drag) { const h = pick(); if (h === 'hangar') hoverHangar = true; else hover = h; }
  hall.doors.forEach((d) => { d.hover += ((mode === 'hall' && hover === d.i ? 1 : 0) - d.hover) * Math.min(1, dt * 8); });
  canvas.style.cursor = (hoverHangar || hover >= 0) ? 'pointer' : mode === 'ext' ? (drag ? 'grabbing' : 'grab') : '';

  // UI:作品卡、圓點、左右箭頭、返回鈕
  const inRoom = live && mode === 'room', settled = inRoom && Math.abs(roomF - cur) < .02;
  showCard(settled ? cur : -1);
  dots?.classList.toggle('on', inRoom);
  dots && [...dots.children].forEach((b, i) => b.classList.toggle('on', i === cur));
  if (arrows) { arrows.classList.toggle('on', inRoom); prevBtn.disabled = cur <= 0; nextBtn.disabled = cur >= ROOMS.length - 1; }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
