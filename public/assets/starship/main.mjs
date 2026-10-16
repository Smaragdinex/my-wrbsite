// 首頁最後一段:星際戰艦。control.mjs 的 XP 決定現在在哪:
//   launch 期間 → 光速星線(warp)、白光,之後戰艦才從遠方出現(XP.ship;穿越途中不畫戰艦)
//   ship 狀態 → 自己的流程:外觀(慢慢轉、可拖曳,點機庫口)→ 穿過機庫和通道 → 中央大廳(六道艙門)
//                → 點艙門飛進作品艙;艙裡左右切換隔壁艙;往上滾 = 回上一層、往下滾 = 往前
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createExterior } from './exterior.mjs?v=7';
import { ROOMS, buildRoom } from './rooms.mjs?v=6';
import { createHall, createCorridor } from './hall.mjs?v=61';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { sfx } from './sfx.mjs?v=1';

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
function stepSky(dt, t, meteorsOn = true) {
  starMat.uniforms.uTime.value = t; nextMeteor -= dt;
  if (!meteorsOn) { nextMeteor = Math.max(nextMeteor, 1.5); for (const f of meteors) f.m.visible = false; }   // 跳躍 / 轉場時不出現流星
  if (nextMeteor <= 0) { nextMeteor = 1 + Math.random() * 3; const f = meteors.find((x) => !x.m.visible);
    if (f) { const W = innerWidth, H = innerHeight, ang = Math.PI + .35 + Math.random() * .55, sp = 700 + Math.random() * 700, len = 120 + Math.random() * 200;
      f.vx = Math.cos(ang) * sp; f.vy = Math.sin(ang) * sp; f.life = 0; f.dur = .7 + Math.random() * .7; f.m.position.set(W * (.3 + Math.random() * .7), H * (.5 + Math.random() * .5), 0);
      f.m.rotation.z = ang; f.m.scale.set(len, 6 + Math.random() * 4, 1); f.m.visible = true; } }   // 貼圖亮頭在 +x,轉成跟速度同方向 → 亮頭在前、尾巴在後
  for (const f of meteors) { if (!f.m.visible) continue; f.life += dt; f.m.position.x += f.vx * dt; f.m.position.y += f.vy * dt; const k = f.life / f.dur; f.m.material.opacity = Math.sin(Math.PI * Math.min(1, k)); if (k >= 1) f.m.visible = false; }
}

// ---------- 超空間跳躍(像《星際大戰》):①前方的星星拉長成放射狀的光線 ②藍白色的光隧道 ③光線縮回成星點、白光、抵達 ----------
const warpScene = new THREE.Scene(), warpCam = new THREE.PerspectiveCamera(70, 1, .1, 600);
const WN = 1600, wData = [], wPos = new Float32Array(WN * 6), wCol = new Float32Array(WN * 6);
for (let k = 0; k < WN; k++) { const a = Math.random() * Math.PI * 2, r = 1.5 + Math.pow(Math.random(), .5) * 45; wData.push({ x: Math.cos(a) * r, y: Math.sin(a) * r, z: -20 - Math.random() * 380 });
  const c = Math.random() < .3 ? [.65, .82, 1] : [1, 1, 1]; wCol.set([...c, ...c.map((v) => v * .15)], k * 6); }
const wGeo = new THREE.BufferGeometry(); wGeo.setAttribute('position', new THREE.BufferAttribute(wPos, 3)); wGeo.setAttribute('color', new THREE.BufferAttribute(wCol, 3));
const wMat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
const warpLines = new THREE.LineSegments(wGeo, wMat); warpLines.frustumCulled = false; warpScene.add(warpLines);
// 光隧道:包住鏡頭的長圓筒,shader 畫一條條往鏡頭衝過來、會慢慢扭轉的藍白光紋
const TUN_L = 420;
const tunMat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.BackSide,
  uniforms: { uTime: { value: 0 }, uOp: { value: 0 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform float uTime, uOp; varying vec2 vUv;
    float h(float n){ return fract(sin(n * 12.9898) * 43758.5453); }
    void main(){
      float a = vUv.x * 72.0 + vUv.y * 9.0 + uTime * .35;              // 繞圈方向的光紋(會扭轉)
      float lane = floor(a), f = fract(a), r = h(lane);
      float s = fract(vUv.y * (3.0 + r * 5.0) - uTime * (2.2 + r * 2.5) + r * 7.0);
      float streak = smoothstep(.0, .5, s) * smoothstep(1.0, .55, s) * smoothstep(.0, .45, f) * smoothstep(1.0, .55, f);
      vec3 col = mix(vec3(.18, .38, 1.0), vec3(.85, .95, 1.0), streak * (.4 + r * .6));
      float far = smoothstep(.0, .25, vUv.y), near = smoothstep(1.0, .8, vUv.y);
      gl_FragColor = vec4(col * (.4 + streak * 1.9), uOp * far * near * (.45 + streak * .55));
    }` });
const tunnel = new THREE.Mesh(new THREE.CylinderGeometry(7, 7, TUN_L, 64, 1, true), tunMat);
tunnel.rotation.x = Math.PI / 2; tunnel.position.z = -TUN_L / 2 + 15; warpScene.add(tunnel);
const coreTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d'); const gr = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(.25, 'rgba(170,210,255,.7)'); gr.addColorStop(1, 'rgba(60,110,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 256, 256); return new THREE.CanvasTexture(c); })();
const core = new THREE.Sprite(new THREE.SpriteMaterial({ map: coreTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }));
core.position.z = -220; core.scale.setScalar(120); warpScene.add(core);
const segW = (x, a, b) => Math.min(1, Math.max(0, (x - a) / (b - a))), easeW = (t) => t * t * (3 - 2 * t);
function stepWarp(dt, w, lt, t) {
  const stretch = easeW(segW(lt, 2.0, 3.3)), tun = easeW(segW(lt, 3.0, 3.7)) * (1 - easeW(segW(lt, 5.6, 6.1))), out = easeW(segW(lt, 5.9, 6.45));
  const len = 2 + 150 * Math.pow(stretch, 2.2) * (1 - out);            // 光線長度:拉長 → 跳出時一下子縮回星點
  const speed = 6 + 520 * stretch * (1 - out);
  for (let k = 0; k < WN; k++) { const d = wData[k]; d.z += speed * dt; if (d.z > 2) d.z -= 400; wPos.set([d.x, d.y, d.z, d.x, d.y, d.z - len], k * 6); }
  wGeo.attributes.position.needsUpdate = true;
  wMat.opacity = w * (1 - tun * .88);
  tunMat.uniforms.uTime.value = t; tunMat.uniforms.uOp.value = tun * w;
  core.material.opacity = tun * .7 * w; core.scale.setScalar(80 + Math.sin(t * 9) * 5);
  warpCam.rotation.z += dt * tun * .25;                                  // 隧道裡鏡頭慢慢旋轉
  warpCam.position.set((Math.random() - .5) * .06 * tun, (Math.random() - .5) * .06 * tun, 0);   // 微微震動
}

// ---------- 戰艦外觀 ----------
const extScene = new THREE.Scene(); extScene.environment = envTex;
extScene.add(new THREE.HemisphereLight(0xbcd2ff, 0x1a1830, .5));
const ext = createExterior(extScene);
const extCam = new THREE.PerspectiveCamera(38, 1, .5, 2000);

// ---------- 機庫 → 通道 ----------
const corScene = new THREE.Scene(); corScene.environment = envTex;
const cor = createCorridor(corScene);
const corCam = new THREE.PerspectiveCamera(62, 1, .1, 120);
// 最後一層:淡淡的暗角 + 一點點對比(電影感),大廳和通道共用
const FINISH = { uniforms: { tDiffuse: { value: null } }, vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; varying vec2 vUv;
    void main(){ vec4 c = texture2D(tDiffuse, vUv); float d = length((vUv - .5) * vec2(1.1, 1.0));
      c.rgb *= mix(1.0, .8, smoothstep(.42, .95, d)); c.rgb = mix(c.rgb, c.rgb * c.rgb * (3.0 - 2.0 * c.rgb), .18); gl_FragColor = c; }` };
const corComposer = new EffectComposer(renderer);                      // 通道跟大廳一樣有燈條光暈
corComposer.addPass(new RenderPass(corScene, corCam));
corComposer.addPass(new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), .4, .5, 1.15));
corComposer.addPass(new OutputPass());
corComposer.addPass(new ShaderPass(FINISH));

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
const hallScene = new THREE.Scene(); hallScene.environment = envTex; hallScene.environmentIntensity = .55;
hallScene.add(new THREE.HemisphereLight(0xfff8ee, 0x8a8478, .3));
const hkey = new THREE.DirectionalLight(0xfff4e8, .45); hkey.position.set(5, 16, 6); hkey.castShadow = false;   // 陰影交給天窗的聚光燈,這盞只補光 hkey.shadow.mapSize.set(2048, 2048);
Object.assign(hkey.shadow.camera, { near: 1, far: 50, left: -10, right: 10, top: 10, bottom: -10 }); hkey.shadow.bias = -.0015; hkey.shadow.normalBias = .06;
hallScene.add(hkey);
const hall = createHall(hallScene, ROOMS); hall.root.updateMatrixWorld(true);
const hallCam = new THREE.PerspectiveCamera(56, 1, .1, 200);
// 大廳另外走後製:暖白燈條、地球儀會有柔和的光暈(bloom)
const hallComposer = new EffectComposer(renderer);
hallComposer.addPass(new RenderPass(hallScene, hallCam));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), .4, .5, 1.15);   // 門檻高:只有燈條 / 投影會發光,白牆不會 hallComposer.addPass(bloom);
hallComposer.addPass(new OutputPass());
hallComposer.addPass(new ShaderPass(FINISH));

function resize() {
  renderer.setSize(innerWidth, innerHeight, false);
  const a = innerWidth / innerHeight;
  for (const c of [warpCam, extCam, roomCam, corCam, hallCam]) { c.aspect = a; c.updateProjectionMatrix(); }
  hallCam.fov = a < 1 ? 80 : 56; hallCam.updateProjectionMatrix();
  for (const c of [hallComposer, corComposer]) { c.setPixelRatio(renderer.getPixelRatio()); c.setSize(innerWidth, innerHeight); }
  starMat.uniforms.uDpr.value = renderer.getPixelRatio(); buildStars();
}
addEventListener('resize', resize); resize();

// ---------- UI ----------
const card = document.getElementById('card'), flashEl = document.getElementById('flash'), dots = document.getElementById('dots');
const cursorEl = document.getElementById('cursor'), fineCursor = matchMedia('(min-width: 701px) and (hover: hover)').matches;
let lastHk = -1;
// 頁面上所有按鈕 / 連結:滑過「滴」、按下「確認音」;艙室箭頭、圓點、作品卡按鈕滑過時圓球游標也縮小
let lastEl = null;
addEventListener('pointerover', (e) => { const el = e.target.closest?.('a, button'); if (el && el !== lastEl) sfx.hover(); lastEl = el;
  if (el && el.matches('#arrows button, #dots button, #card a, #sfxBtn')) cursorEl?.classList.add('onnav'); });
addEventListener('pointerout', (e) => { const el = e.target.closest?.('#arrows button, #dots button, #card a, #sfxBtn'); if (el && !el.contains(e.relatedTarget)) cursorEl?.classList.remove('onnav'); });
addEventListener('click', (e) => { if (e.target.closest?.('a, button') && !e.target.closest('#sfxBtn')) sfx.click(); }, true);
// 音效開關(右下角的小喇叭)
const sfxBtn = Object.assign(document.createElement('button'), { id: 'sfxBtn', title: 'Sound' });
sfxBtn.setAttribute('aria-label', 'Toggle sound');
const drawSfx = () => { sfxBtn.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9v6h4l5 4V5L8 9H4z"/>${sfx.muted ? '<path d="M17 9l5 6M22 9l-5 6"/>' : '<path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/>'}</svg>`; sfxBtn.classList.toggle('muted', sfx.muted); };
drawSfx(); sfxBtn.addEventListener('click', () => { sfx.toggle(); drawSfx(); }); document.body.appendChild(sfxBtn);
const arrows = document.getElementById('arrows'), prevBtn = document.getElementById('prevRoom'), nextBtn = document.getElementById('nextRoom');
const veil = Object.assign(document.createElement('div'), { id: 'veil' });          // 轉場用的幕(進出戰艦用暖白,其他用黑)
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
const ENTER = 6.2, TO_ROOM = 1.75, TO_HALL = 1.5, EXIT = 2.0;
const busy = () => !['ext', 'hall', 'room'].includes(mode);
function go(m, extra = {}) { if (m === 'toHall' || m === 'exit') sfx.whoosh(false); mode = m; t0 = clockT; Object.assign(window.__shipState, { mode: m, ...extra }); }
window.__shipState = { mode };
function enterShip() { if (mode !== 'ext') return; side = extCam.position.x >= 0 ? 1 : -1; sfx.click(); sfx.open(); setTimeout(() => sfx.whoosh(true), 650); go('enter'); }
function toRoom(i) { if (mode !== 'hall') return; sfx.click(); sfx.whoosh(true); cur = roomF = i; fromDoor = i; go('toRoom', { room: i }); }
function slideTo(i) { const n = Math.max(0, Math.min(ROOMS.length - 1, i)); if (n !== cur) sfx.swish(); cur = n; window.__shipState.room = cur; }
function nav(kind, d = 0) {
  if (busy()) return;
  if (kind === 'back') { if (mode === 'room') { fromDoor = cur; go('toHall'); } else if (mode === 'hall') go('exit'); return; }
  // 滾輪 / 上下滑:往下 = 往前(進艦 → 第一艙 → 下一艙),往上 = 回上一層(艙 → 大廳 → 艦外)
  if (mode === 'ext' && kind === 'v' && d > 0) enterShip();
  else if (mode === 'hall' && kind === 'v') d < 0 ? go('exit') : toRoom(0);
  else if (mode === 'room') { if (kind === 'h' || d > 0) slideTo(cur + d); else { fromDoor = cur; go('toHall'); } }
}
window.__shipNav = nav;
// 從 About 頁按「← Home」回來時,直接回到大廳(離開時在外觀就回到外觀;還在 X 階段就照常從 X 開始)。
// 只有這條路會接續;重新整理、上一頁、從其他頁面進來,一律從頭開始。
const SAVE_KEY = 'xarts-ship';
addEventListener('pagehide', () => { try {
  if (window.__xp?.state !== 'ship') { sessionStorage.removeItem(SAVE_KEY); return; }
  sessionStorage.setItem(SAVE_KEY, JSON.stringify({ mode: mode === 'ext' || mode === 'exit' || mode === 'enter' ? 'ext' : 'hall', at: Date.now() }));
} catch {} });
addEventListener('pageshow', (e) => { if (e.persisted) location.reload(); });   // 按上一頁時瀏覽器會把整頁原封不動還原,這裡改成重新載入 → 從頭開始
function restore() { try {
  const saved = JSON.parse(sessionStorage.getItem(SAVE_KEY) || 'null'); sessionStorage.removeItem(SAVE_KEY);   // 只用一次
  const nav = performance.getEntriesByType('navigation')[0]?.type;
  let ref = ''; try { const u = new URL(document.referrer); if (u.origin === location.origin) ref = u.pathname; } catch {}
  if (!saved || nav !== 'navigate' || !/^\/about(\.html)?\/?$/.test(ref) || Date.now() - saved.at > 2 * 3600e3) return;
  window.__xpDebug?.jump('ship');
  if (saved.mode === 'hall') go('hall');
} catch {} }
// 效能數據(測試用):每幀的 draw call、三角形數、記憶體裡的幾何 / 貼圖數
renderer.info.autoReset = false; let lastInfo = null;
const perf = { acc: 0, n: 0, i: 0, levels: [...new Set([Math.min(devicePixelRatio, 2), 1.5, 1.25, 1].filter((v) => v <= Math.min(devicePixelRatio, 2)))] };
window.__shipInfo = () => lastInfo;
window.__ship = { enter: enterShip, toRoom, slideTo, nav, jump(m, i = 0) { cur = roomF = fromDoor = i; go(m, { room: i }); t0 = -99; } };

// ---------- 滑鼠 / 手指:外觀拖曳旋轉、點機庫口、點艙門、點作品艙 ----------
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(9, 9);
let dragYaw = 0, dragPitch = 0, drag = null, hover = -1, hoverHangar = false;
const setNdc = (e) => ndc.set(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
addEventListener('pointermove', setNdc);
canvas.style.touchAction = 'none';
canvas.addEventListener('pointerdown', (e) => { setNdc(e); drag = { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY }; if (mode === 'ext') { window.__shipDrag = true; canvas.setPointerCapture(e.pointerId); } });
canvas.addEventListener('pointermove', (e) => { if (drag && mode === 'hall') {          // 大廳:左右拖 = 轉頭看(上下滑還是交給滾動換層)
    const dx = e.clientX - drag.x; if (Math.abs(e.clientX - drag.x0) > Math.abs(e.clientY - drag.y0)) window.__shipDrag = true;
    hallYaw = Math.max(-1.0, Math.min(1.0, hallYaw + dx * .004)); drag.x = e.clientX; drag.y = e.clientY; return; }
  if (!drag || mode !== 'ext') return;
  dragYaw -= (e.clientX - drag.x) * .0065; dragPitch = Math.min(1.25, Math.max(-1.0, dragPitch + (e.clientY - drag.y) * .005)); drag.x = e.clientX; drag.y = e.clientY; });
canvas.addEventListener('pointerup', (e) => {
  const moved = drag ? Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) : 99; drag = null; window.__shipDrag = false;
  if (moved > 6) return;                                       // 是拖曳,不是點擊
  setNdc(e); const h = pick();
  if (mode === 'ext' && h === 'hangar') enterShip();
  else if (mode === 'hall' && h >= 0) toRoom(h);
  else if (mode === 'room' && h >= 0) { sfx.click(); open(ROOMS[h]); }
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
function drawExterior(t, appear, dive = 0, open = 0) {
  ext.update(t, hoverHangar); ext.setHangarOpen(open);
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
  cor.update(z); corComposer.render();
}
// 大廳鏡頭:站在入口平視;滑鼠移動有一點視差,拖曳可以左右轉頭看(手機直式看不到全部門時用)
let hallYaw = 0, lookX = 0, lookY = 0;
const HALL_POS = V(0, 2.2, 7.4), HALL_T = V(0, 1.55, -3);
function hallHome(v) { return v.copy(HALL_POS); }
function hallLook(v) {
  const has = mode === 'hall' && !drag && Math.abs(ndc.x) <= 1 && Math.abs(ndc.y) <= 1;     // 滑鼠還沒進畫面時 ndc 是 (9, 9),不算
  lookX += ((has ? ndc.x : 0) * .1 - lookX) * .06; lookY += ((has ? ndc.y : 0) * .05 - lookY) * .06;
  const yaw = hallYaw - lookX, d = HALL_T.clone().sub(HALL_POS);
  d.applyAxisAngle(V(0, 1, 0), yaw); d.y += lookY * 6; return v.copy(HALL_POS).add(d);
}
function drawHallAt(t, dt, pos, tg) {
  hallCam.position.copy(pos); hallCam.lookAt(tg); hall.update(t, dt);
  // 烘焙版的貼圖已經套過 Blender 的色調(AgX),大廳這段就不要再做一次色調映射
  const tm = renderer.toneMapping; if (hall.baked) renderer.toneMapping = THREE.NoToneMapping;
  hallComposer.render(dt); renderer.toneMapping = tm;
}
// 從大廳全景走到第 i 道門前(k 0→1):先往上 / 往門的方向弧形繞過中央投影,再降到門口
function doorPath(i, k, out) {
  const d = hall.doors[i], p0 = HALL_POS, p1 = d.world(5.2, 3.7), p2 = d.world(.3, 1.6), e = ease(k);
  out.pos.copy(p0).multiplyScalar((1 - e) * (1 - e)).addScaledVector(p1, 2 * e * (1 - e)).addScaledVector(p2, e * e);
  out.tgt.copy(hallLook(V(0, 0, 0))).lerp(d.world(-2, 1.4), Math.min(1, e * 1.4)); return out;
}
function drawHall(t, dt, from = null, k = 1) {
  hallHome(camPos); hallLook(tgt);
  if (from && k < 1) { const base = tgt.clone(); camPos.lerpVectors(from.pos, camPos, ease(k)); tgt.lerpVectors(from.tgt, base, ease(k)); }
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

  // 自動降解析度:畫面上有東西時,最近 90 幀平均慢於 ~42fps 就降一級(2 → 1.5 → 1.25 → 1);只降不升,避免來回跳
  if (appear > .9) { perf.acc += dt; if (++perf.n >= 90) { if (perf.acc / perf.n > 1 / 42 && perf.i < perf.levels.length - 1) { renderer.setPixelRatio(perf.levels[++perf.i]); resize(); } perf.acc = perf.n = 0; } }
  if (renderer.info.render.frame) lastInfo = { calls: renderer.info.render.calls, tris: renderer.info.render.triangles, geos: renderer.info.memory.geometries, texs: renderer.info.memory.textures, dpr: renderer.getPixelRatio() };
  renderer.info.reset();
  renderer.clear();
  stepSky(dt, t, XP.state === 'ship' && !warpOn && !busy()); renderer.render(skyScene, skyCam);
  if (warpOn) { stepWarp(dt, XP.warp, XP.lt ?? 99, t); renderer.render(warpScene, warpCam); }

  const k = t - t0;
  let fade = 0;
  if (appear > .001) {                                         // 穿越途中(戰艦還沒出現)不畫戰艦
    if (mode === 'ext') drawExterior(t, appear);
    else if (mode === 'enter') {                               // 機庫大門滑開 → 鏡頭飛進門裡 → 白色通道(兩道門)→ 大廳
      if (k < 2.3) { drawExterior(t, 1, seg(k, .55, 2.3), ease(seg(k, 0, 1.0))); fade = ease(seg(k, 2.0, 2.3)); }
      else if (k < 4.9) { drawCorridor((k - 2.3) / 2.6, t); fade = 1 - ease(seg(k, 2.3, 2.6)) + ease(seg(k, 4.55, 4.9)); }
      else { drawHall(t, dt, { pos: V(0, 3.0, 7.2), tgt: V(0, 8, -3) }, (k - 4.9) / (ENTER - 4.9)); fade = 1 - ease(seg(k, 4.9, 5.25)); }   // 一進來先抬頭看圓頂,再慢慢看向前方
      if (k >= ENTER) go('hall');
    } else if (mode === 'hall') drawHall(t, dt);
    else if (mode === 'toRoom') {                              // 鏡頭走到艙門前、門滑開、穿進去 → 作品艙
      const d = hall.doors[cur];
      if (k < 1.1) { d.open = ease(seg(k, .1, .7)); const v = doorPath(cur, seg(k, 0, 1.1), { pos: camPos, tgt }); drawHallAt(t, dt, v.pos, v.tgt); fade = ease(seg(k, .85, 1.1)); }
      else { d.open = 0; drawRooms(t, dt, 1 - ease(seg(k, 1.1, TO_ROOM))); fade = 1 - ease(seg(k, 1.1, 1.4)); }
      if (k >= TO_ROOM) go('room', { room: cur });
    } else if (mode === 'room') { roomF += (cur - roomF) * Math.min(1, dt * 3.2); if (Math.abs(cur - roomF) < .002) roomF = cur; drawRooms(t, dt); }
    else if (mode === 'toHall') {                              // 作品艙淡出 → 從那道艙門前退回大廳全景
      if (k < .35) { drawRooms(t, dt, ease(seg(k, 0, .35)) * .5); fade = ease(seg(k, 0, .35)); }
      else { const v = doorPath(fromDoor, 1 - seg(k, .35, TO_HALL), { pos: camPos, tgt }); drawHallAt(t, dt, v.pos, v.tgt); fade = 1 - ease(seg(k, .35, .65)); }
      if (k >= TO_HALL) go('hall');
    } else if (mode === 'exit') {                              // 大廳淡出 → 從機庫口退回太空看整艘船
      if (k < .4) { drawHall(t, dt); fade = ease(seg(k, 0, .4)); }
      else { drawExterior(t, 1, 1 - ease(seg(k, .4, 1.6)), 1 - ease(seg(k, 1.4, EXIT))); fade = 1 - ease(seg(k, .4, .75)); }   // 退出門外,大門在身後關上
      if (k >= EXIT) go('ext');
    }
  }
  veil.style.background = mode === 'enter' || mode === 'exit' ? '#f4efe6' : '#05070d';
  veil.style.opacity = fade.toFixed(3);

  // 滑鼠指到的東西(機庫口 / 艙門 / 作品艙)
  hover = -1; hoverHangar = false;
  if (live && !drag) { const h = pick(); if (h === 'hangar') hoverHangar = true; else hover = h; }
  hall.doors.forEach((d) => { d.hover += ((mode === 'hall' && hover === d.i ? 1 : 0) - d.hover) * Math.min(1, dt * 8); });
  // 游標:桌機用網站本來的圓球游標,指到作品門 / 機庫口 / 作品艙時縮成小點;手機或窄螢幕才用系統游標
  const onThing = live && (hoverHangar || hover >= 0);
  cursorEl?.classList.toggle('ondoor', onThing);
  canvas.style.cursor = fineCursor ? '' : onThing ? 'pointer' : mode === 'ext' ? (drag ? 'grabbing' : 'grab') : '';
  const hk = hoverHangar ? 'h' : hover; if (hk !== lastHk) { if (hk !== -1 && live) sfx.hover(); lastHk = hk; }   // 滑到新的東西:滴一聲
  if (sfxBtn) sfxBtn.classList.toggle('on', live);

  // UI:作品卡、圓點、左右箭頭、返回鈕
  const inRoom = live && mode === 'room', settled = inRoom && Math.abs(roomF - cur) < .02;
  showCard(settled ? cur : -1);
  dots?.classList.toggle('on', inRoom);
  dots && [...dots.children].forEach((b, i) => b.classList.toggle('on', i === cur));
  if (arrows) { arrows.classList.toggle('on', inRoom); prevBtn.disabled = cur <= 0; nextBtn.disabled = cur >= ROOMS.length - 1; }
  requestAnimationFrame(frame);
}
restore();
requestAnimationFrame(frame);
