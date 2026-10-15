// 首頁最後一段:星際戰艦。control.mjs 的 XP 決定現在在哪:
//   launch 期間 → 光速星線(warp)、白光,之後戰艦才從遠方出現(XP.ship;穿越途中不畫戰艦和星球)
//   ship 狀態 → XP.page:0 = 戰艦外觀(鏡頭慢慢繞),1~5 = 艦內五間房(一頁一間,左右滑動換頁)
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createExterior } from './exterior.mjs?v=3';
import { ROOMS, buildRoom, S } from './rooms.mjs?v=2';

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

// ---------- 艦內五間房(像太空裡排成一列的艙段)----------
const roomScene = new THREE.Scene(); roomScene.environment = envTex;
roomScene.add(new THREE.HemisphereLight(0xffe4f2, 0x3c3a78, .6));
const key = new THREE.DirectionalLight(0xfff0e0, 1.35); key.castShadow = true; key.shadow.mapSize.set(2048, 2048);
Object.assign(key.shadow.camera, { near: 1, far: 40, left: -7, right: 7, top: 7, bottom: -7 }); key.shadow.bias = -.0015; key.shadow.normalBias = .06;
roomScene.add(key); roomScene.add(key.target);
const fill = new THREE.DirectionalLight(0xc9b4ff, .35); fill.position.set(-6, 5, 6); roomScene.add(fill);
const GAP = 22;            // 房與房在場景裡的間距(一次只畫一間,換房是整張畫面左右滑)
const rooms = ROOMS.map((r, i) => { const b = buildRoom(roomScene, r, {}); b.group.position.set(i * GAP, 0, 0); b.group.traverse((o) => { o.userData.room = i; }); return b; });
const roomCam = new THREE.PerspectiveCamera(30, 1, .1, 200);
const CAM_OFF = new THREE.Vector3(9.6, 7.0, 9.6).sub(new THREE.Vector3(0, 1.55, 0));

function resize() {
  renderer.setSize(innerWidth, innerHeight, false);
  const a = innerWidth / innerHeight;
  for (const c of [warpCam, extCam, roomCam]) { c.aspect = a; c.updateProjectionMatrix(); }
  starMat.uniforms.uDpr.value = renderer.getPixelRatio(); buildStars();
}
addEventListener('resize', resize); resize();

// ---------- UI:作品卡、頁面圓點 ----------
const card = document.getElementById('card'), flashEl = document.getElementById('flash'), dots = document.getElementById('dots');
const TOTAL = ROOMS.length + 1;
if (dots) { dots.innerHTML = Array.from({ length: TOTAL }, (_, i) => `<button aria-label="${i ? ROOMS[i - 1].title : 'Starship'}"></button>`).join('');
  [...dots.children].forEach((b, i) => b.addEventListener('click', () => window.__xpDebug?.goPage?.(i))); }
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
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(9, 9);
addEventListener('pointermove', (e) => { ndc.set(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1); });
let hoverRoom = -1;
canvas.addEventListener('click', () => { if (hoverRoom >= 0) open(ROOMS[hoverRoom]); });

// ---------- 左右箭頭 ----------
const arrows = document.getElementById('arrows'), prevBtn = document.getElementById('prevRoom'), nextBtn = document.getElementById('nextRoom');
prevBtn?.addEventListener('click', () => window.__xpNav?.(-1));
nextBtn?.addEventListener('click', () => window.__xpNav?.(1));

// 外觀頁可以用滑鼠 / 手指拖曳,360° 轉著看戰艦(左右轉一圈、上下看艦腹到俯視)
let dragYaw = 0, dragPitch = 0, drag = null;
const onExterior = () => (window.__xp?.page || 0) === 0 && pageF < .05 && window.__xp?.state === 'ship';
canvas.style.touchAction = 'none';
canvas.addEventListener('pointerdown', (e) => { if (!onExterior()) return; drag = { x: e.clientX, y: e.clientY }; window.__shipDrag = true; canvas.setPointerCapture(e.pointerId); });
canvas.addEventListener('pointermove', (e) => { if (!drag) return;
  dragYaw -= (e.clientX - drag.x) * .0065; dragPitch = Math.min(1.25, Math.max(-1.0, dragPitch + (e.clientY - drag.y) * .005)); drag = { x: e.clientX, y: e.clientY }; });
const endDrag = () => { drag = null; window.__shipDrag = false; };
canvas.addEventListener('pointerup', endDrag); canvas.addEventListener('pointercancel', endDrag);

// 外觀:戰艦從遠方飛近(appear),鏡頭慢慢繞(加上使用者拖曳的角度)
function drawExterior(t, appear) {
  ext.update(t);
  const port = extCam.aspect < 1, fitE = port ? .8 / extCam.aspect : 1;   // 直式螢幕:從比較後面看(船身往畫面深處延伸)再拉遠
  const orbit = Math.sin(t * .05) * .3 + (port ? 2.75 : 2.3), dist = THREE.MathUtils.lerp(420, 80, ease(appear)) * fitE;   // 從右前方看(看得到艦首的藍光縫)
  const yaw = orbit + dragYaw, el = Math.min(1.45, Math.max(-1.1, .36 + dragPitch + Math.sin(t * .1) * .03));
  camPos.set(Math.sin(yaw) * Math.cos(el) * dist, Math.sin(el) * dist, Math.cos(yaw) * Math.cos(el) * dist);
  tgt.set(0, 2, 4);
  extCam.position.copy(camPos); extCam.lookAt(tgt);
  renderer.render(extScene, extCam);
}
// 艦內:每間房用同一個固定視角(跟 3D room 一樣從前方 45°)
function setRoomCam(i) {
  const fit = Math.max(1.12, 1.4 / roomCam.aspect);       // 直式螢幕拉遠一點
  tgt.set(i * GAP, 1.55, 0);
  roomCam.position.copy(tgt).addScaledVector(CAM_OFF, fit); roomCam.lookAt(tgt);
}
function drawRoom(i, t, dt) {
  setRoomCam(i);
  key.position.set(tgt.x + 6, 10, 4); key.target.position.set(tgt.x, 0, 0); key.target.updateMatrixWorld();
  rooms.forEach((r, j) => { r.group.visible = j === i; });
  rooms[i].update(t, dt);
  renderer.render(roomScene, roomCam);
}

// ---------- 每幀 ----------
const clamp01 = (v) => Math.min(1, Math.max(0, v)), ease = (t) => t * t * (3 - 2 * t);
const clock = new THREE.Clock();
let pageF = 0;
const tgt = new THREE.Vector3(), camPos = new THREE.Vector3();
function frame() {
  const dt = Math.min(.05, clock.getDelta()), t = clock.elapsedTime;
  const XP = window.__xp || { ship: 0, warp: 0, flash: 0, page: 0 };
  const appear = XP.ship, warpOn = XP.warp > .001;
  canvas.style.opacity = Math.max(appear, Math.min(1, XP.warp * 3)).toFixed(3);
  canvas.style.pointerEvents = appear > .9 ? 'auto' : 'none';
  if (appear <= .001 && !warpOn) { flashEl.style.opacity = (XP.flash || 0).toFixed(3); requestAnimationFrame(frame); return; }

  // 換頁:平滑追上目標頁;每一頁是一張「畫面」,換頁時整張往左 / 往右滑(外觀 → 第一間 → … → 第五間)
  const page = XP.page || 0;
  pageF += (page - pageF) * Math.min(1, dt * 3.2);
  if (Math.abs(page - pageF) < .002) pageF = page;
  flashEl.style.opacity = (XP.flash || 0).toFixed(3);
  dots && [...dots.children].forEach((b, i) => b.classList.toggle('on', i === page));
  const navOn = appear > .9 && XP.state === 'ship';
  dots && dots.classList.toggle('on', navOn);
  if (arrows) { arrows.classList.toggle('on', navOn); prevBtn.disabled = page <= 0; nextBtn.disabled = page >= TOTAL - 1; }

  renderer.clear();
  stepSky(dt, t); renderer.render(skyScene, skyCam);
  if (warpOn) { stepWarp(dt, XP.warp); renderer.render(warpScene, warpCam); }

  // 穿越途中(戰艦還沒出現)不畫戰艦和星球;抵達後才畫
  if (appear > .001) {
    const W = innerWidth, H = innerHeight, p0 = Math.floor(pageF), f = pageF - p0;
    for (const p of f > .001 ? [p0, p0 + 1] : [p0]) {
      if (p < 0 || p >= TOTAL) continue;
      const ox = Math.round((p - pageF) * W);           // 這一頁的畫面要往右(+)或往左(-)推多少
      renderer.setViewport(ox, 0, W, H); renderer.clearDepth();
      p === 0 ? drawExterior(t, appear) : drawRoom(p - 1, t, dt);
    }
    renderer.setViewport(0, 0, innerWidth, innerHeight);
  }
  // 作品卡 + 滑鼠指到哪一間(停穩了才算)
  const settled = Math.abs(page - pageF) < .02 && page >= 1;
  hoverRoom = -1;
  if (settled) { setRoomCam(page - 1); rooms.forEach((r, j) => { r.group.visible = j === page - 1; }); ray.setFromCamera(ndc, roomCam); if (ray.intersectObjects(rooms[page - 1].group.children, true)[0]) hoverRoom = page - 1; }
  canvas.style.cursor = hoverRoom >= 0 ? 'pointer' : onExterior() ? (drag ? 'grabbing' : 'grab') : '';
  showCard(settled ? page - 1 : -1);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
