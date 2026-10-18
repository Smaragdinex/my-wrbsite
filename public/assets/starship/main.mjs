// 首頁最後一段:星際戰艦。control.mjs 的 XP 決定現在在哪:
//   launch 期間 → 光速星線(warp)、白光,之後戰艦才從遠方出現(XP.ship;穿越途中不畫戰艦)
//   ship 狀態 → 自己的流程:外觀(慢慢轉、可拖曳,點機庫口)→ 穿過機庫和通道 → 中央大廳(六道艙門)
//                → 點艙門飛進作品艙;艙裡左右切換隔壁艙;往上滾 = 回上一層、往下滾 = 往前
import * as THREE from 'three';
import { quality, Q_SET } from './quality.mjs?v=4';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createExterior } from './exterior.mjs?v=40';
import { ROOMS, buildRoom } from './rooms.mjs?v=17';
import { createHall, createCorridor } from './hall.mjs?v=93';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { sfx } from './sfx.mjs?v=9';
import { player } from '../player.mjs?v=3';

const canvas = document.getElementById('ship');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: quality.tier !== 'low', alpha: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, Q_SET.dprMax));          // 畫質分級(quality.mjs):high 2x、medium 1.5x、low 1x
renderer.shadowMap.enabled = Q_SET.shadows; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
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
const WN = Q_SET.warpN || 1600, wData = []   /* 星線數依顯示卡分級(quality.mjs) */, wPos = new Float32Array(WN * 6), wCol = new Float32Array(WN * 6);
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
const tunnel = new THREE.Mesh(new THREE.CylinderGeometry(7, 7, TUN_L, Q_SET.tunSeg || 64, 1, true), tunMat);
tunnel.rotation.x = Math.PI / 2; tunnel.position.z = -TUN_L / 2 + 15; warpScene.add(tunnel);
// 高階顯示卡:外面再一層比較慢、偏紫的光紋(有景深,像《星際大戰》光速時的多層光)
let tunnel2 = null;
if (Q_SET.tun2) {
  const m2 = tunMat.clone(); m2.uniforms = { uTime: { value: 0 }, uOp: { value: 0 } };
  m2.fragmentShader = tunMat.fragmentShader.replace('vUv.x * 72.0', 'vUv.x * 48.0').replace('uTime * (2.2 + r * 2.5)', 'uTime * (1.1 + r * 1.3)').replace('vec3(.18, .38, 1.0), vec3(.85, .95, 1.0)', 'vec3(.32, .22, .9), vec3(.8, .78, 1.0)');
  tunnel2 = new THREE.Mesh(new THREE.CylinderGeometry(13, 13, TUN_L, 96, 1, true), m2); tunnel2.rotation.x = Math.PI / 2; tunnel2.position.z = -TUN_L / 2 + 15; warpScene.add(tunnel2);
}
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
  if (tunnel2) { tunnel2.material.uniforms.uTime.value = t; tunnel2.material.uniforms.uOp.value = tun * w * .55; tunnel2.rotation.y = -t * .05; }
  core.material.opacity = tun * .7 * w; core.scale.setScalar(80 + Math.sin(t * 9) * 5);
  warpCam.rotation.z += dt * tun * .25;                                  // 隧道裡鏡頭慢慢旋轉
  const sh = Q_SET.shake ? .06 * tun : 0; warpCam.position.set((Math.random() - .5) * sh, (Math.random() - .5) * sh, 0);   // 微微震動(低階不震,省得暈)
}

// ---------- 戰艦外觀 ----------
const extScene = new THREE.Scene(); extScene.environment = envTex;
extScene.add(new THREE.HemisphereLight(0xbcd2ff, 0x1a1830, .3));   /* 補光少一點:背光面要夠暗,船殼才有立體感 */
const ext = createExterior(extScene, Q_SET);
window.__shipHover = () => ({ door: mode === 'hall' ? hover : -1, hangar: hoverHangar, bot: hoverBot });   /* 給左上表情臉用 */
window.__dbg = () => ({ ext, extCam, rtHall, rtCor, renderer, hallPortal, corCam, cor, hall, pCam }); window.__shipPose = () => ({ yaw: +ext.ship.rotation.y.toFixed(3), pitch: +ext.ship.rotation.x.toFixed(3) });   // 測試用
const extCam = new THREE.PerspectiveCamera(38, 1, .5, 6000);           // 遠平面要看得到底下那顆大星球
// 光暈前先把壞掉的像素(NaN / 無限大)換成 0:不然 bloom 會把一個壞點擴散成一大塊黑色方框(大廳中間偶爾出現的黑框就是這樣來的)
const NAN_FIX = { uniforms: { tDiffuse: { value: null } }, vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: 'uniform sampler2D tDiffuse; varying vec2 vUv; void main(){ vec4 c = texture2D(tDiffuse, vUv); if (any(isnan(c)) || any(isinf(c))) c = vec4(0.0, 0.0, 0.0, 1.0); gl_FragColor = clamp(c, 0.0, 64.0); }' };
const nanFix = () => new ShaderPass(NAN_FIX);
const extComposer = new EffectComposer(renderer);                      // 外觀也加光暈:上千個小窗、環臂長廊、艦首大環的金光
const skyPass = new RenderPass(skyScene, skyCam), warpPass = new RenderPass(warpScene, warpCam), extPass = new RenderPass(extScene, extCam);   // 星空、(還在收尾的)超空間、戰艦疊在一起再加光暈
warpPass.clear = false; warpPass.clearDepth = true; extPass.clear = false; extPass.clearDepth = true;
for (const ps of [skyPass, warpPass, extPass]) extComposer.addPass(ps);
const extBloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), .35, .35, 2.2); extBloom.enabled = Q_SET.bloom; extComposer.addPass(nanFix()); extComposer.addPass(extBloom);   // 門檻高:只有窗戶、燈條會發光,被太陽照亮的白色艦身不會糊掉
extComposer.addPass(new OutputPass());

// ---------- 機庫 → 通道 ----------
const corScene = new THREE.Scene(); corScene.environment = envTex;
const cor = createCorridor(corScene, { after: ext.ready });
const corCam = new THREE.PerspectiveCamera(60, 1, .1, 120);
// 最後一層:淡淡的暗角 + 一點點對比(電影感),大廳和通道共用
const FINISH = { uniforms: { tDiffuse: { value: null } }, vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; varying vec2 vUv;
    void main(){ vec4 c = texture2D(tDiffuse, vUv); float d = length((vUv - .5) * vec2(1.1, 1.0));
      c.rgb *= mix(1.0, .8, smoothstep(.42, .95, d)); c.rgb = mix(c.rgb, c.rgb * c.rgb * (3.0 - 2.0 * c.rgb), .18); gl_FragColor = c; }` };
const corComposer = new EffectComposer(renderer);                      // 通道跟大廳一樣有燈條光暈
corComposer.addPass(new RenderPass(corScene, corCam));
const corBloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), .4, .5, 1.15); corBloom.enabled = Q_SET.bloom; corComposer.addPass(nanFix()); corComposer.addPass(corBloom);
corComposer.addPass(new OutputPass());
corComposer.addPass(new ShaderPass(FINISH));

// ---------- 作品艙(一次只畫一間)----------
const roomScene = new THREE.Scene(); roomScene.environment = envTex;
roomScene.add(new THREE.HemisphereLight(0xffe4f2, 0x3c3a78, .6));
const key = new THREE.DirectionalLight(0xfff0e0, 1.35); key.castShadow = true; key.shadow.mapSize.set(Q_SET.shadowSize, Q_SET.shadowSize);
Object.assign(key.shadow.camera, { near: 1, far: 40, left: -7, right: 7, top: 7, bottom: -7 }); key.shadow.bias = -.0015; key.shadow.normalBias = .06;
roomScene.add(key); roomScene.add(key.target);
const fill = new THREE.DirectionalLight(0xc9b4ff, .35); fill.position.set(-6, 5, 6); roomScene.add(fill);
const GAP = 22;            // 房與房在場景裡的間距(一次只畫一間,換房是整張畫面左右滑)
const rooms = ROOMS.map((r, i) => { const b = buildRoom(roomScene, r, { mirror: Q_SET.mirror && innerWidth >= 700 }); b.group.position.set(i * GAP, 0, 0); return b; });
const realOn = (i) => !!rooms[i]?.real?.ready;
let roomChain = null;                                                // 五間房一間一間載(手機不要同時下載十幾 MB)
const loadRooms = () => { roomChain ??= rooms.reduce((p, r) => p.then(() => r.real?.load()), Promise.resolve()); };                       // 這間已經換成真的房間(烘焙模型載好了)
const roomCam = new THREE.PerspectiveCamera(30, 1, .1, 200);
const CAM_OFF = new THREE.Vector3(9.6, 7.0, 9.6).sub(new THREE.Vector3(0, 1.55, 0));

// ---------- 中央大廳 ----------
const hallScene = new THREE.Scene(); hallScene.environment = envTex; hallScene.environmentIntensity = .55;
hallScene.add(new THREE.HemisphereLight(0xfff8ee, 0x8a8478, .3));
const hkey = new THREE.DirectionalLight(0xfff4e8, .45); hkey.position.set(5, 16, 6); hkey.castShadow = false;   // 陰影交給天窗的聚光燈,這盞只補光 hkey.shadow.mapSize.set(2048, 2048);
Object.assign(hkey.shadow.camera, { near: 1, far: 50, left: -10, right: 10, top: 10, bottom: -10 }); hkey.shadow.bias = -.0015; hkey.shadow.normalBias = .06;
hallScene.add(hkey);
const hall = createHall(hallScene, ROOMS, { mirror: Q_SET.mirror, after: ext.ready }); hall.root.updateMatrixWorld(true);
const hallCam = new THREE.PerspectiveCamera(56, 1, .1, 200);
// 大廳另外走後製:暖白燈條、地球儀會有柔和的光暈(bloom)
const hallComposer = new EffectComposer(renderer);
hallComposer.addPass(new RenderPass(hallScene, hallCam));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), .18, .3, 1.6);   // 很淡、門檻高:只有最亮的燈條 / 投影有一點光暈,白牆和門框保持乾淨
bloom.enabled = Q_SET.hallBloom; hallComposer.addPass(nanFix()); hallComposer.addPass(bloom);
hallComposer.addPass(new OutputPass());
hallComposer.addPass(new ShaderPass(FINISH));

// ---------- 傳送門:氣閘門 → 看到通道、通道第二道門 → 看到大廳(每幀從對應位置畫到小張的貼圖上,用螢幕座標貼回門洞,所以有真的透視和深度)----------
const rtCor = new THREE.WebGLRenderTarget(2, 2, { type: THREE.HalfFloatType }), rtHall = new THREE.WebGLRenderTarget(2, 2, { type: THREE.HalfFloatType });
const _dbs = new THREE.Vector2();
const portalMat = (rt, k) => new THREE.ShaderMaterial({ uniforms: { tMap: { value: rt.texture }, uRes: { value: _dbs }, uK: { value: k } },
  vertexShader: 'void main(){ gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }',
  fragmentShader: 'uniform sampler2D tMap; uniform vec2 uRes; uniform float uK; void main(){ vec3 c = texture2D(tMap, gl_FragCoord.xy / uRes).rgb; if (any(isnan(c)) || any(isinf(c))) c = vec3(0.); gl_FragColor = vec4(clamp(c * uK, 0., 32.), 1.); }' });   // 擋掉 NaN(不然 bloom 會把整個畫面變黑)
ext.portal.material = portalMat(rtCor, 1.22); cor.portal.material = portalMat(rtHall, 1);
const pCam = new THREE.PerspectiveCamera(60, 1, .1, 200), _q = new THREE.Quaternion(), _lp = new THREE.Vector3();
const COR_FROM_BAY = 19.9, HALL_FROM_COR = 51.6, HALL_DY = 2.0;            // 座標對應:機庫(戰艦本地)z -6.9 = 通道起點 13;通道終點 -44.2 = 大廳鏡頭 7.4
function renderTo(rt, scene, cam, noTone) {
  const tm = renderer.toneMapping; if (noTone) renderer.toneMapping = THREE.NoToneMapping;
  renderer.setRenderTarget(rt); renderer.clear(); renderer.render(scene, cam); renderer.setRenderTarget(null); renderer.toneMapping = tm;
}
function corPortal() {                                       // 從機庫鏡頭換算到通道裡的位置 / 方向
  _lp.copy(extCam.position); ext.ship.worldToLocal(_lp);
  ext.ship.getWorldQuaternion(_q); _q.invert().multiply(extCam.quaternion);
  pCam.position.set(_lp.x, _lp.y - .14, _lp.z + COR_FROM_BAY); pCam.quaternion.copy(_q);
  pCam.fov = extCam.fov; pCam.aspect = extCam.aspect; pCam.near = Math.max(.1, pCam.position.z - 12.9); pCam.far = 200; pCam.updateProjectionMatrix();
  cor.update(pCam.position.z); renderTo(rtCor, corScene, pCam, cor.baked);
}
function hallPortal(t, dt) {                                  // 從通道鏡頭換算到大廳(從入口後方看進去,用 near 切掉後牆)
  pCam.position.copy(corCam.position).add(_lp.set(0, HALL_DY, HALL_FROM_COR)); pCam.quaternion.copy(corCam.quaternion);
  pCam.fov = corCam.fov; pCam.aspect = corCam.aspect; pCam.near = Math.max(.1, pCam.position.z - 7.2); pCam.far = 200; pCam.updateProjectionMatrix();
  pCam.layers.enable(1); hall.update(t, dt); updateDoorWins(pCam); renderTo(rtHall, hallScene, pCam, hall.baked);   // 通道盡頭看進去的大廳:門洞裡也是真的房間
}
const hallFov = () => (innerWidth / innerHeight < 1 ? 80 : 56);
// ---------- 大廳門洞裡看到的是真的房間(跟走進去看到的一樣)----------
// 每道門洞放一片「窗」,畫的是該房間:用大廳鏡頭換算到房間裡的位置(門框後緣 = 房間入口 z 0),五道門共用一張貼圖(各自只畫門洞在畫面上的那一塊)。
// 窗只在 layer 1(大廳鏡頭看得到;地板倒影、通道那邊的門洞看不到,那兩處還是原本的展示艙)。
const doorRT = new THREE.WebGLRenderTarget(2, 2, { type: THREE.HalfFloatType });
const DOOR_Z = -.02, OPEN_W = 2.4, OPEN_H = 2.85;                  // 門洞(跟 hall.mjs 的 DOOR_W、DOOR_H + .1 一樣)
const doorCam = new THREE.PerspectiveCamera(56, 1, .1, 200), clipFront = [new THREE.Plane(new THREE.Vector3(0, 0, -1), -.01)];   // 房間座標 z > -.01(入口那面牆)切掉
const doorWins = hall.doors.map((d) => {
  const sh = new THREE.Shape(), w = OPEN_W + .24, h = OPEN_H + .2, r = .5, x0 = -w / 2, y0 = -.08;
  sh.moveTo(x0 + r, y0); sh.lineTo(x0 + w - r, y0); sh.quadraticCurveTo(x0 + w, y0, x0 + w, y0 + r); sh.lineTo(x0 + w, y0 + h - r); sh.quadraticCurveTo(x0 + w, y0 + h, x0 + w - r, y0 + h);
  sh.lineTo(x0 + r, y0 + h); sh.quadraticCurveTo(x0, y0 + h, x0, y0 + h - r); sh.lineTo(x0, y0 + r); sh.quadraticCurveTo(x0, y0, x0 + r, y0);
  const m = new THREE.Mesh(new THREE.ShapeGeometry(sh, 10), portalMat(doorRT, 1)); m.position.z = DOOR_Z; m.layers.set(1); m.visible = false; d.g.add(m); return m;
});
hallCam.layers.enable(1);
const _dm = new THREE.Matrix4(), _dinv = new THREE.Matrix4(), _dT = new THREE.Matrix4(), _cw = new THREE.Matrix4(), _ds = new THREE.Vector3(), _corner = new THREE.Vector3();
function doorToRoom(i) {                                          // 大廳世界座標 → 第 i 間房的世界座標
  hall.doors[i].g.updateWorldMatrix(true, false); rooms[i].group.updateWorldMatrix(true, false);
  return _dm.copy(rooms[i].group.matrixWorld).multiply(_dT.makeTranslation(0, 0, -DOOR_Z)).multiply(_dinv.copy(hall.doors[i].g.matrixWorld).invert());
}
const _poly = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
function doorRect(i, cam) {                                       // 門洞在畫面上的範圍(貼圖像素):門洞四角先在鏡頭空間切掉鏡頭後面的部分,再投影;看不到就回 null
  const d = hall.doors[i], W = doorRT.width, H = doorRT.height, zc = -cam.near * 1.01;
  [[-1.5, -.1], [1.5, -.1], [1.5, 3.05], [-1.5, 3.05]].forEach(([x, y], k) => { _poly[k].set(x, y, DOOR_Z); d.g.localToWorld(_poly[k]).applyMatrix4(cam.matrixWorldInverse); });
  const pts = [];
  for (let k = 0; k < 4; k++) {                                   // 用鏡頭的近平面切多邊形(Sutherland–Hodgman 一條邊)
    const a = _poly[k], b = _poly[(k + 1) % 4], ina = a.z <= zc, inb = b.z <= zc;
    if (ina) pts.push(a.clone());
    if (ina !== inb) pts.push(a.clone().lerp(b, (zc - a.z) / (b.z - a.z)));
  }
  if (!pts.length) return null;
  let x0 = 1, x1 = -1, y0 = 1, y1 = -1;
  for (const p of pts) { p.applyMatrix4(cam.projectionMatrix); x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); }
  if (x1 < -1 || x0 > 1 || y1 < -1 || y0 > 1) return null;
  const px = (v) => (Math.max(-1, Math.min(1, v)) * .5 + .5);
  const ax = Math.max(0, Math.floor(px(x0) * W) - 2), ay = Math.max(0, Math.floor(px(y0) * H) - 2);
  return [ax, ay, Math.min(W, Math.ceil(px(x1) * W) + 2) - ax, Math.min(H, Math.ceil(px(y1) * H) + 2) - ay];
}
function updateDoorWins(cam) {
  cam.updateMatrixWorld(); let any = false;
  const order = doorWins.map((_, i) => i).sort((a, b) => hall.doors[b].g.getWorldPosition(_ds).distanceToSquared(cam.position) - hall.doors[a].g.getWorldPosition(_corner).distanceToSquared(cam.position));   // 遠的先畫、最近的那道門最後畫(範圍重疊時以它為準)
  for (const i of order) {
    const on = realOn(i) && roomTex[i] && !pending(roomTex[i]), rect = on ? doorRect(i, cam) : null; doorWins[i].visible = !!rect;   // 房間貼圖都傳上顯示卡了才在門洞裡畫
    if (!rect) continue;
    _cw.multiplyMatrices(doorToRoom(i), cam.matrixWorld); _cw.decompose(doorCam.position, doorCam.quaternion, _ds);
    doorCam.fov = cam.fov; doorCam.aspect = cam.aspect; doorCam.near = cam.near; doorCam.far = 200; doorCam.updateProjectionMatrix();
    rooms.forEach((r, j) => { r.group.visible = j === i; });
    const st = rooms[i].real, lite = quality.tier !== 'high'; if (st.mirror) { st.mirror.visible = false; st.floorM.opacity = 1; }   // 門洞裡不做地板倒影(省一輪)
    if (st.props && lite) st.props.visible = false;                 // 中低階:門洞裡不畫植物
    doorRT.scissor.set(...rect); doorRT.scissorTest = true;
    renderer.setRenderTarget(doorRT); renderer.clippingPlanes = clipFront; renderer.clear(); renderer.render(roomScene, doorCam);
    if (st.mirror) { st.mirror.visible = true; st.floorM.opacity = .9; }
    if (st.props) st.props.visible = true;
    any = true;
  }
  if (any) { renderer.clippingPlanes = []; renderer.setRenderTarget(null); }
}
function resize() {
  renderer.setSize(innerWidth, innerHeight, false);
  const a = innerWidth / innerHeight;
  for (const c of [warpCam, extCam, roomCam, corCam, hallCam]) { c.aspect = a; c.updateProjectionMatrix(); }
  hallCam.fov = hallFov(); hallCam.near = .1; hallCam.updateProjectionMatrix();
  for (const c of [hallComposer, corComposer, extComposer]) { c.setPixelRatio(renderer.getPixelRatio()); c.setSize(innerWidth, innerHeight); }
  starMat.uniforms.uDpr.value = renderer.getPixelRatio(); buildStars();
  renderer.getDrawingBufferSize(_dbs); rtCor.setSize(_dbs.x * .7, _dbs.y * .7); rtHall.setSize(_dbs.x, _dbs.y); doorRT.setSize(_dbs.x, _dbs.y);   /* 大廳的窗、門洞裡的房間用全解析度:走到門口時跟直接畫的一樣清楚 */
  for (const rt of [rtCor, rtHall]) { renderer.setRenderTarget(rt); renderer.setClearColor(0xf4efe6, 1); renderer.clear(); } renderer.setRenderTarget(null); renderer.setClearColor(0x000000, 0);   // 新的貼圖先清乾淨(半精度貼圖沒清會有垃圾值)
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
addEventListener('click', (e) => { if (e.target.closest?.('a, button') && !e.target.closest('#sfxBtn, #musicBox')) sfx.click(); }, true);
// 喇叭開關 + 音樂播放器:共用模組 assets/player.mjs(About 頁也用);這裡只控制什麼時候顯示
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
const ENTER = 8.2, TO_ROOM = 1.75, TO_HALL = 1.5, EXIT = 2.0, TO_ROOM_R = 2.4, TO_HALL_R = 2.1;   // _R:真的房間(門口直接走進去,比較長)
const busy = () => !['ext', 'hall', 'room'].includes(mode);
function go(m, extra = {}) { if (m === 'toHall' || m === 'exit') sfx.whoosh(false); if (m === 'toRoom') rooms[extra.room]?.real?.load(); if (m === 'hall' || m === 'toRoom') loadRooms(); /* 走進大廳就開始載房間模型 */ mode = m; t0 = clockT; Object.assign(window.__shipState, { mode: m, ...extra }); }
window.__shipState = { mode };
function enterShip() { if (mode !== 'ext') return; side = ext.ship.worldToLocal(extCam.position.clone()).x >= 0 ? 1 : -1; /* 鏡頭在戰艦哪一側就從那側進 */ sfx.click(); sfx.open(); setTimeout(() => sfx.whoosh(true), 650); setTimeout(() => { if (mode === 'enter') sfx.open(); }, 3900); setTimeout(() => { if (mode === 'enter') sfx.whoosh(true); }, 4500); go('enter'); }   // 機庫門、俯衝風聲、氣閘門、衝進通道
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
const DPR0 = Math.min(devicePixelRatio, Q_SET.dprMax), perf = { acc: 0, n: 0, i: 0, slow: 0, levels: [...new Set([DPR0, 1.5, 1.25, 1].filter((v) => v <= DPR0))] };
// 解析度已經降到最低還是卡:關掉光暈(等於降到 low)
function dropToLow() { if (quality.tier === 'low') return; quality.tier = 'low'; quality.why += ', runtime'; extBloom.enabled = corBloom.enabled = bloom.enabled = false; console.info('[quality] runtime → low'); }
window.__shipInfo = () => lastInfo;
window.__ship = { enter: enterShip, toRoom, slideTo, nav, jump(m, i = 0) { cur = roomF = fromDoor = i; go(m, { room: i }); t0 = -99; } };

// ---------- 滑鼠 / 手指:外觀拖曳旋轉、點機庫口、點艙門、點作品艙 ----------
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(9, 9);
let dragYaw = 0, dragPitch = 0, yawVel = 0, yawShown = 0, lastExtT = 0, drag = null, hover = -1, hoverHangar = false, hoverBot = false;
const setNdc = (e) => ndc.set(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
addEventListener('pointermove', setNdc);
canvas.style.touchAction = 'none';
canvas.addEventListener('pointerdown', (e) => { setNdc(e); yawVel = 0; drag = { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY }; if (mode === 'ext') { window.__shipDrag = true; canvas.setPointerCapture(e.pointerId); } });
canvas.addEventListener('pointermove', (e) => { if (drag && mode === 'hall') {          // 大廳:左右拖 = 轉頭看(上下滑還是交給滾動換層)
    const dx = e.clientX - drag.x; if (Math.abs(e.clientX - drag.x0) > Math.abs(e.clientY - drag.y0)) window.__shipDrag = true;
    hallYaw = Math.max(-1.0, Math.min(1.0, hallYaw + dx * .004)); drag.x = e.clientX; drag.y = e.clientY; return; }
  if (!drag || mode !== 'ext') return;
  // 只左右轉(不上下翻);記下拖曳速度,放開後還會慣性滑一下
  const now = performance.now(), d = -(e.clientX - drag.x) * .0065, dtm = Math.max(8, now - (drag.t || now - 16));
  dragYaw += d; yawVel = yawVel * .6 + (d / (dtm / 1000)) * .4; drag.t = now; drag.x = e.clientX; drag.y = e.clientY; });
canvas.addEventListener('pointerup', (e) => {
  if (drag && performance.now() - (drag.t || 0) > 90) yawVel = 0;                  // 停住一下才放開 = 不要甩出去
  yawVel = Math.max(-2.6, Math.min(2.6, yawVel));
  const moved = drag ? Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) : 99; drag = null; window.__shipDrag = false;
  if (moved > 6) return;                                       // 是拖曳,不是點擊
  setNdc(e); const h = pick();
  if (mode === 'ext' && h === 'hangar') enterShip();
  else if (mode === 'hall' && h === 'bot') { if (hall.greet(hallCam.position)) sfx.greet(); }   // 點機器人:它會轉過來打招呼
  else if (mode === 'hall' && h >= 0) toRoom(h);
  else if (mode === 'room' && h >= 0) { sfx.click(); open(ROOMS[h]); }
});
canvas.addEventListener('pointercancel', () => { drag = null; window.__shipDrag = false; });
function pick() {
  if (mode === 'ext') {                                        // 只算看得到的那一側機庫口(被船身擋住的不算)
    ray.setFromCamera(ndc, extCam); const h = ray.intersectObject(ext.ship, true).find((x) => x.object.isMesh);
    return h && ext.hangarHits.includes(h.object) ? 'hangar' : -1; }
  if (mode === 'hall') { ray.setFromCamera(ndc, hallCam); const h = ray.intersectObjects([...hall.hits, hall.botHit], false)[0]; return !h ? -1 : h.object.userData.bot ? 'bot' : h.object.userData.door; }
  if (mode === 'room' && Math.abs(roomF - cur) < .02) { setRoomCam(cur); ray.setFromCamera(ndc, roomCam); return ray.intersectObjects(realOn(cur) ? rooms[cur].real.hits : rooms[cur].group.children, true).length ? cur : -1; }   // 真的房間:點家具 / 擺設就進作品
  return -1;
}

// ---------- 各段的鏡頭 + 繪製 ----------
const clamp01 = (v) => Math.min(1, Math.max(0, v)), ease = (t) => t * t * (3 - 2 * t), seg = (x, a, b) => clamp01((x - a) / (b - a));
const tgt = new THREE.Vector3(), camPos = new THREE.Vector3(), V = (x, y, z) => new THREE.Vector3(x, y, z);
const port = () => innerWidth < innerHeight;

const diveP = new THREE.CatmullRomCurve3([0, 1, 2, 3, 4].map(() => new THREE.Vector3())), diveT = new THREE.CatmullRomCurve3([0, 1, 2, 3, 4].map(() => new THREE.Vector3())), _dv = new THREE.Vector3();
const smoother = (x) => { x = Math.min(1, Math.max(0, x)); const a = x * x * x * (x * (x * 6 - 15) + 10); return a * .8 + x * .2; };   // 起步不要太慢
// 外觀:戰艦從遠方飛近(appear)後慢慢自轉一圈一圈;dive 0→1 = 鏡頭飛向機庫口、穿進去
function drawExterior(t, appear, dive = 0, open = 0) {
  ext.update(t, hoverHangar); ext.setHangarOpen(open);
  const fitE = port() ? .8 / extCam.aspect : 1;
  // 鏡頭固定在一個角度;自轉和拖曳都是轉「戰艦本身」(護航小艦、星球不跟著轉)
  const yaw = 2.3, dist = THREE.MathUtils.lerp(560, 128, ease(appear)) * fitE, el = .36 + Math.sin(t * .1) * .03;
  const dtE = Math.min(.05, Math.max(0, t - lastExtT)); lastExtT = t;
  if (!drag) { if (dive > 0) yawVel = 0; dragYaw += yawVel * dtE; yawVel *= Math.exp(-dtE * 3.4); }          // 放開後的慣性,慢慢停下
  yawShown += (dragYaw - yawShown) * (1 - Math.exp(-dtE * 9));                      // 畫面上的角度平滑追上手指(不會一頓一頓)
  ext.setPose(-(t * .045) - yawShown, 0);
  camPos.set(Math.sin(yaw) * Math.cos(el) * dist, Math.sin(el) * dist, Math.cos(yaw) * Math.cos(el) * dist); tgt.set(0, 5, 4);
  let roll = 0, fov = 38, near = .5;
  if (dive > 0) {                                              // 進艦:從軌道俯衝到機庫口 → 穿過開口、轉向艦首 → 沿著機庫甲板滑向氣閘門 → 氣閘門滑開
    const L = (x, y, z) => ext.ship.localToWorld(_dv.set(x, y, z)).clone(), s = side, P = diveP.points, T = diveT.points;
    P[0].copy(camPos); P[1].copy(L(s * 30, 6, 7)); P[2].copy(L(s * 10, .7, 3.4)); P[3].copy(L(s * 2.8, .3, .6)); P[4].copy(L(0, .34, -6.9));
    T[0].copy(tgt); T[1].copy(L(s * 6.6, .3, 3)); T[2].copy(L(s * 3.2, .2, -1.2)); T[3].copy(L(0, .32, -9)); T[4].copy(L(0, .3, -17));
    const e = smoother(dive);
    camPos.copy(diveP.getPoint(e)); tgt.copy(diveT.getPoint(e));
    roll = side * .2 * Math.sin(Math.PI * seg(dive, .3, .78));               // 轉進機庫時機身(鏡頭)壓一點彎
    fov = 38 + 22 * ease(seg(dive, .4, .7));                                  // 進到機庫裡鏡頭變廣角
    near = dive > .5 ? .06 : .5;
    ext.setAirlock(ease(seg(dive, .7, .86)));
  } else ext.setAirlock(0);
  if (extCam.fov !== fov || extCam.near !== near) { extCam.fov = fov; extCam.near = near; extCam.updateProjectionMatrix(); }
  const ov = window.__camOv;                                          // 測試用:指定外觀鏡頭(戰艦本地座標)看細節
  if (ov) { camPos.copy(ext.ship.localToWorld(new THREE.Vector3(...ov.pos))); tgt.copy(ext.ship.localToWorld(new THREE.Vector3(...ov.tgt))); if (ov.fov && extCam.fov !== ov.fov) { extCam.fov = ov.fov; extCam.updateProjectionMatrix(); } }
  extCam.position.copy(camPos); extCam.lookAt(tgt); if (roll) extCam.rotateZ(roll);
  if (dive > .6) corPortal();                                  // 氣閘門開了:門洞裡畫通道
  warpPass.enabled = (window.__xp?.warp || 0) > .001; extComposer.render();
}
const HANDOFF = -41.6;                                           // 通道走到這裡,第二道門後的大廳已經佔滿整個畫面(橫式 -40.8、直式 -41.2 就滿了)
function drawCorridor(p, t, dt) {
  const z = THREE.MathUtils.lerp(cor.START, cor.END, ease(p) * .7 + (1 - (1 - p) * (1 - p)) * .3);   // 慢慢起步(接機庫鏡頭的速度)、中間快、到大廳門口慢慢停(接大廳靜止的鏡頭)
  const wob = Math.min(1, p * 4) * (1 - ease(seg(p, .8, 1)));  // 剛進來和快出去時不晃,接縫才對得上(平順地停,不要一下轉向)
  const fv = THREE.MathUtils.lerp(60, hallFov(), seg(p, .55, .95)); if (corCam.fov !== fv) { corCam.fov = fv; corCam.updateProjectionMatrix(); }   // 鏡頭焦距慢慢變成跟大廳一樣
  corCam.position.set(Math.sin(t * 1.3) * .08 * wob, .2 + Math.sin(t * 2.1) * .05 * wob, z); corCam.lookAt(0, THREE.MathUtils.lerp(.1, -.45, seg(p, .6, 1)), z - 10.4);   // 最後的視線 = 大廳鏡頭的視線
  if (z < HANDOFF) {                                           // 門洞已經佔滿畫面:直接用大廳的畫法畫(跟停下來之後一模一樣)→ 鏡頭停住時不會突然變清楚 / 變暗
    hallCam.position.copy(corCam.position).add(_lp.set(0, HALL_DY, HALL_FROM_COR)); hallCam.quaternion.copy(corCam.quaternion);
    hallCam.fov = corCam.fov; hallCam.near = Math.max(.1, hallCam.position.z - 7.2); hallCam.updateProjectionMatrix();   // near 切掉大廳入口後面的牆(跟門洞裡的畫法一樣)
    hall.update(t, dt); renderHall(dt); return;
  }
  const bk = seg(z, -30, HANDOFF);                              // 快到交接點:通道光暈慢慢調成跟大廳一樣,門洞裡的大廳看起來就跟交接後一樣
  corBloom.strength = THREE.MathUtils.lerp(.4, .18, bk); corBloom.radius = THREE.MathUtils.lerp(.5, .3, bk); corBloom.threshold = THREE.MathUtils.lerp(1.15, 1.6, bk);
  cor.update(z);
  if (z < -18) hallPortal(t, dt);
  const tm = renderer.toneMapping; if (cor.baked) renderer.toneMapping = THREE.NoToneMapping;   // 烘焙貼圖已經套過色調
  corComposer.render(); renderer.toneMapping = tm;
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
function renderHall(dt) {
  // 烘焙版的貼圖已經套過 Blender 的色調(AgX),大廳這段就不要再做一次色調映射
  updateDoorWins(hallCam);
  const tm = renderer.toneMapping; if (hall.baked) renderer.toneMapping = THREE.NoToneMapping;
  hallComposer.render(dt); renderer.toneMapping = tm;
}
function drawHallAt(t, dt, pos, tg) {
  if (hallCam.near !== .1 || hallCam.fov !== hallFov()) { hallCam.near = .1; hallCam.fov = hallFov(); hallCam.updateProjectionMatrix(); }   // 進艦交接時借用過,換回大廳的
  hallCam.position.copy(pos); hallCam.lookAt(tg); hall.update(t, dt); renderHall(dt);
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
let roomLX = 0, roomLY = 0, roomWalk = null;
const _wp = new THREE.Vector3(), _wt = new THREE.Vector3(), _we = new THREE.Vector3(), _wl = new THREE.Vector3();
// 走進 / 走出真的房間:e 0 = 大廳 doorPath 的終點(換算到房間裡,剛好在門洞前面)、1 = 在房間裡站好
function walkPose(i, e) {
  const v = doorPath(i, 1, { pos: _wp, tgt: _wt }), M = doorToRoom(i), st = rooms[i].real, base = rooms[i].group.position;
  v.pos.applyMatrix4(M); v.tgt.applyMatrix4(M);
  roomWalk = { i, pos: v.pos.lerp(_we.copy(base).add(st.eye), e), tgt: v.tgt.lerp(_wl.copy(base).add(st.look), e) };
}
function setRoomCam(i, near = 0) {
  if (roomWalk && roomWalk.i === i) { const fv = hallFov(); if (roomCam.fov !== fv) { roomCam.fov = fv; roomCam.updateProjectionMatrix(); } roomCam.position.copy(roomWalk.pos); roomCam.lookAt(roomWalk.tgt); tgt.copy(roomWalk.tgt); return; }
  if (realOn(i)) {                                             // 真的房間:站在入口往裡看(跟大廳一樣),滑鼠有一點視差;剛走進來時從門口往前走一點
    const st = rooms[i].real, base = rooms[i].group.position, has = mode === 'room' && !drag && Math.abs(ndc.x) <= 1 && Math.abs(ndc.y) <= 1;
    roomLX += ((has ? ndc.x : 0) - roomLX) * .05; roomLY += ((has ? ndc.y : 0) - roomLY) * .05;
    const fv = hallFov(); if (roomCam.fov !== fv) { roomCam.fov = fv; roomCam.updateProjectionMatrix(); }
    roomCam.position.copy(base).add(st.eye); roomCam.position.z += near * .8;
    tgt.copy(base).add(st.look); tgt.x += roomLX * .9; tgt.y += roomLY * .5;
    roomCam.lookAt(tgt); return;
  }
  if (roomCam.fov !== 30) { roomCam.fov = 30; roomCam.updateProjectionMatrix(); }
  const fit = Math.max(1.12, 1.4 / roomCam.aspect);
  tgt.set(i * GAP, 1.55, 0);
  roomCam.position.copy(tgt).addScaledVector(CAM_OFF, fit * (1 - near * .45)); roomCam.lookAt(tgt);
}
function drawRoom(i, t, dt, near = 0) {
  setRoomCam(i, near);
  key.position.set(tgt.x + 6, 10, 4); key.target.position.set(tgt.x, 0, 0); key.target.updateMatrixWorld();
  rooms.forEach((r, j) => { r.group.visible = j === i; });
  rooms[i].update(t, dt);
  if (realOn(i)) renderer.clippingPlanes = clipFront;              // 真房間:入口那面牆切掉(從門口走進來時才看得到門洞外)
  renderer.render(roomScene, roomCam); renderer.clippingPlanes = [];
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
// ---------- 預熱(超空間裡做完,進大廳才不會卡一下)----------
// 模型載好不代表能馬上順順地畫:第一次畫的時候還要編譯 shader、把大張貼圖傳上顯示卡,那一幀會卡 0.1~0.6 秒。
// 所以每個場景的模型一載好就:①在背景編譯 shader(compileAsync,不卡畫面)②貼圖排隊,每幀傳一兩張 ③後製(光暈等)先畫一次。
// 超空間會等到「戰艦 + 通道 + 大廳」都預熱好才跳出(最多多等 15 秒);五間房接著在背景載、預熱(看戰艦外觀的時候)。
const warmRT = new THREE.WebGLRenderTarget(8, 8, { type: THREE.HalfFloatType }), texQueue = [], texSeen = new WeakSet(), composerWarm = [];
const W8 = { ext: 0, cor: 0, hall: 0 };                                // 0 還沒開始、1 進行中、2 好了
const roomWarm = new Set(), extTex = new WeakSet(), corTex = new WeakSet(), hallTex = new WeakSet(), roomTex = []; let shipReadyAt = 0;
const pending = (set) => texQueue.some((x) => set.has(x)) || bigQueue.some((b) => set.has(b.tx));   // 這組貼圖還有沒傳完的
function queueTextures(root) {
  root.traverse((o) => { for (const m of [].concat(o.material || [])) {
    const add = (v) => { if (v && v.isTexture && !v.isRenderTargetTexture && !texSeen.has(v)) { texSeen.add(v); texQueue.push(v); } };   // 後製 / 門洞用的畫布貼圖不用傳
    for (const k in m) add(m[k]);
    if (m.uniforms) for (const u of Object.values(m.uniforms)) add(u && u.value);
  } });
}
async function compileBoth(scene, cam, clip = null) {                  // 畫到貼圖(後製 / 門洞)和直接畫到螢幕,shader 版本不一樣 → 兩種都先編好
  queueTextures(scene);
  const prevClip = renderer.clippingPlanes; if (clip) renderer.clippingPlanes = clip;
  renderer.setRenderTarget(warmRT); const a = renderer.compileAsync(scene, cam); renderer.setRenderTarget(null);
  const b = renderer.compileAsync(scene, cam); renderer.clippingPlanes = prevClip;
  try { await Promise.all([a, b]); } catch (e) { console.warn('[warm]', e); }
}
// 大貼圖(≥ 2048)分段上傳:一次傳一條(約 100 萬像素,幾毫秒),傳完產生 mipmap,再交給 three.js(它就不會再自己整張傳一次 → 不卡)
const bigQueue = [], GL = renderer.getContext();
const WRAP = { 1000: GL.REPEAT, 1001: GL.CLAMP_TO_EDGE, 1002: GL.MIRRORED_REPEAT }, FILT = { 1003: GL.NEAREST, 1004: GL.NEAREST_MIPMAP_NEAREST, 1005: GL.NEAREST_MIPMAP_LINEAR, 1006: GL.LINEAR, 1007: GL.LINEAR_MIPMAP_NEAREST, 1008: GL.LINEAR_MIPMAP_LINEAR };
const bigOK = (tx) => typeof createImageBitmap === 'function' && !tx.isRenderTargetTexture && !tx.isDataTexture && !tx.isCompressedTexture && !tx.isCanvasTexture && !tx.isVideoTexture
  && tx.flipY === false && tx.format === THREE.RGBAFormat && tx.type === THREE.UnsignedByteType && (tx.image?.width || 0) >= 2048 && !renderer.properties.get(tx).__webglInit;
function startBig(tx) {
  const w = tx.image.width, h = tx.image.height, mips = tx.generateMipmaps && FILT[tx.minFilter] !== GL.LINEAR && FILT[tx.minFilter] !== GL.NEAREST;
  const glTex = GL.createTexture(); renderer.state.bindTexture(GL.TEXTURE_2D, glTex);
  GL.texStorage2D(GL.TEXTURE_2D, mips ? Math.floor(Math.log2(Math.max(w, h))) + 1 : 1, tx.colorSpace === THREE.SRGBColorSpace ? GL.SRGB8_ALPHA8 : GL.RGBA8, w, h);
  GL.texParameteri(GL.TEXTURE_2D, GL.TEXTURE_WRAP_S, WRAP[tx.wrapS]); GL.texParameteri(GL.TEXTURE_2D, GL.TEXTURE_WRAP_T, WRAP[tx.wrapT]);
  GL.texParameteri(GL.TEXTURE_2D, GL.TEXTURE_MAG_FILTER, FILT[tx.magFilter]); GL.texParameteri(GL.TEXTURE_2D, GL.TEXTURE_MIN_FILTER, FILT[tx.minFilter]);
  bigQueue.push({ tx, glTex, w, h, mips, y: 0, rows: Math.max(32, Math.floor(1048576 / w)), strip: null, busy: false });
}
function stepBig() {
  const b = bigQueue[0]; if (!b) return;
  if (renderer.properties.get(b.tx).__webglInit) { GL.deleteTexture(b.glTex); bigQueue.shift(); return; }   // three.js 等不及已經自己傳了:用它的
  if (!b.strip) { if (!b.busy) { b.busy = true; createImageBitmap(b.tx.image, 0, b.y, b.w, Math.min(b.rows, b.h - b.y), { premultiplyAlpha: 'none', colorSpaceConversion: 'none' }).then((bm) => { b.strip = bm; }, () => { b.fail = true; }); } if (b.fail) { GL.deleteTexture(b.glTex); bigQueue.shift(); renderer.initTexture(b.tx); } return; }
  renderer.state.bindTexture(GL.TEXTURE_2D, b.glTex);
  GL.pixelStorei(GL.UNPACK_FLIP_Y_WEBGL, false); GL.pixelStorei(GL.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false); GL.pixelStorei(GL.UNPACK_ALIGNMENT, 4); GL.pixelStorei(GL.UNPACK_COLORSPACE_CONVERSION_WEBGL, GL.NONE);
  GL.texSubImage2D(GL.TEXTURE_2D, 0, 0, b.y, GL.RGBA, GL.UNSIGNED_BYTE, b.strip);
  b.y += b.strip.height; b.strip.close(); b.strip = null; b.busy = false;
  if (b.y >= b.h) {
    if (b.mips) GL.generateMipmap(GL.TEXTURE_2D);
    const p = renderer.properties.get(b.tx); p.__webglTexture = b.glTex; p.__webglInit = true; p.__version = b.tx.version;
    bigQueue.shift();
  }
}
// 後製(光暈、輸出、NaN 清除…)的材質:塞進一個小場景,一起在背景編譯
function passMaterials(composer) {
  const out = new Set(), take = (v) => { if (!v) return; if (v.isMaterial) out.add(v); else if (Array.isArray(v)) v.forEach(take); };
  for (const p of composer.passes) for (const k of Object.keys(p)) { const v = p[k]; take(v); if (v && v._mesh) take(v._mesh.material); if (v && typeof v === 'object' && !v.isMaterial && !Array.isArray(v) && k !== 'scene' && k !== 'camera') for (const k2 of Object.keys(v)) take(v[k2]); }
  return [...out];
}
function compilePasses(composer) {
  const sc = new THREE.Scene(), cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), geo = new THREE.PlaneGeometry(2, 2);
  for (const m of passMaterials(composer)) { const q = new THREE.Mesh(geo, m); q.frustumCulled = false; sc.add(q); }
  return compileBoth(sc, cam);
}
function markTex(root, set) {                                          // 記下某個場景用到的貼圖(戰艦的貼圖要先傳完才跳出超空間)
  root.traverse((o) => { for (const m of [].concat(o.material || [])) for (const k in m) { const v = m[k]; if (v && v.isTexture) set.add(v); } });
}
function warmTick() {
  const go_ = (key, ok, fn) => { if (W8[key] === 0 && ok) { W8[key] = 1; fn().then(() => { W8[key] = 2; }); } };
  go_('ext', ext.loaded, () => markTex(extScene, extTex) || Promise.all([compileBoth(extScene, extCam), compilePasses(extComposer)]).then(() => composerWarm.push('ext')));
  go_('cor', cor.baked, () => markTex(corScene, corTex) || Promise.all([compileBoth(corScene, corCam), compilePasses(corComposer)]).then(() => composerWarm.push('cor')));
  go_('hall', hall.baked, () => markTex(hallScene, hallTex) || Promise.all([compileBoth(hallScene, hallCam), compilePasses(hallComposer)]).then(() => { composerWarm.push('hall'); loadRooms(); }));   // 大廳好了就接著載房間
  rooms.forEach((r, i) => { if (realOn(i) && !roomWarm.has(i)) { roomWarm.add(i); markTex(r.group, roomTex[i] = new WeakSet()); compileBoth(roomScene, roomCam, clipFront); } });
  // 貼圖:每幀最多花 ~6ms 傳(一張大貼圖可能就超過,那就一幀一張)
  const t0 = performance.now();
  while (texQueue.length && performance.now() - t0 < 4) {
    const tx = texQueue[0];
    if (!tx.image || (tx.image.width || 0) === 0 || tx.version === 0) { texQueue.push(texQueue.shift()); if (texQueue.length < 2 || texQueue.every((x) => !x.image || x.version === 0)) break; continue; }   // 圖還沒解碼好:排到後面
    texQueue.shift();
    if (bigOK(tx)) startBig(tx); else { try { renderer.initTexture(tx); } catch {} }
  }
  stepBig();
}
function warmComposers() {                                             // 後製的 shader(光暈、輸出)第一次畫才編譯 → 先在看不到的時候畫一次
  const kind = composerWarm[0]; if (!kind) return;
  if (pending({ ext: extTex, cor: corTex, hall: hallTex }[kind])) return;   // 等這個場景的大貼圖分段傳完再畫(不然 three.js 會整張同步上傳 → 卡)
  composerWarm.shift();
  if (kind === 'ext') extComposer.render();
  else if (kind === 'cor') { corCam.position.set(0, .2, cor.START); corCam.lookAt(0, .1, cor.START - 10); cor.update(cor.START); const tm = renderer.toneMapping; if (cor.baked) renderer.toneMapping = THREE.NoToneMapping; corComposer.render(); renderer.toneMapping = tm; }
  else if (kind === 'hall') { hallCam.position.copy(HALL_POS); hallCam.lookAt(HALL_T); renderHall(0); }
}
const innerReady = () => W8.cor === 2 && W8.hall === 2 && !composerWarm.length && !pending(corTex) && !pending(hallTex);
window.__shipReady = () => {                                           // control.mjs:超空間等到這個是 true 才跳出
  if (ext.failed) return true;
  if (!ext.loaded || W8.ext !== 2 || composerWarm.includes('ext') || pending(extTex)) return false;
  shipReadyAt ||= performance.now();
  return innerReady() || performance.now() - shipReadyAt > 15000;      // 通道 / 大廳太慢就不等了(背景繼續)
};
window.__shipProgress = () => Math.min(1, ext.progress * .55 + (W8.ext === 2 ? .1 : 0) + (cor.baked ? .1 : 0) + (W8.cor === 2 ? .05 : 0) + (hall.baked ? .15 : 0) + (W8.hall === 2 ? .05 : 0));
window.__warm = (detail) => ({ ...W8, tex: texQueue.length, big: bigQueue.length, rooms: [...roomWarm], q: detail ? texQueue.slice(0, 30).map((x) => [x.name, x.constructor.name, x.image && x.image.constructor.name, x.image && x.image.width, x.version, x.isCanvasTexture, x.isRenderTargetTexture]) : undefined });   // 測試用
function frame() {
  const dt = Math.min(.05, clock.getDelta()), t = clock.elapsedTime; clockT = t;
  const XP = window.__xp || { ship: 0, warp: 0, flash: 0, state: '' };
  const appear = XP.ship, warpOn = XP.warp > .001, live = appear > .9 && XP.state === 'ship';
  canvas.style.opacity = Math.max(appear, Math.min(1, XP.warp * 3)).toFixed(3);
  canvas.style.pointerEvents = appear > .9 ? 'auto' : 'none';
  warmTick(); sfx.hyperspace(XP);                                    // 超空間音效跟著時間軸走
  if (appear <= .001 && !warpOn) { warmComposers(); flashEl.style.opacity = (XP.flash || 0).toFixed(3); requestAnimationFrame(frame); return; }
  warmComposers();                                                   // 在清畫面之前畫 → 接著整個重畫,看不到
  flashEl.style.opacity = (XP.flash || 0).toFixed(3);

  // 自動降解析度:畫面上有東西時,最近 90 幀平均慢於 ~42fps 就降一級(2 → 1.5 → 1.25 → 1);只降不升,避免來回跳
  if (appear > .9) { perf.acc += dt; if (++perf.n >= 90) { if (perf.acc / perf.n > 1 / 42) { if (perf.i < perf.levels.length - 1) { renderer.setPixelRatio(perf.levels[++perf.i]); resize(); } else if (++perf.slow >= 2) dropToLow(); } perf.acc = perf.n = 0; } }
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
      if (k < 4.7) drawExterior(t, 1, seg(k, .25, 4.7), ease(seg(k, 0, .9)));   // 機庫門開 → 俯衝 → 機庫 → 氣閘門開,門洞裡已經看得到通道 → 穿過去
      else if (k < 7.5) { drawCorridor((k - 4.7) / 2.8, t, dt); fade = .35 * (1 - ease(seg(k, 4.7, 4.95))); }   // 穿過氣閘門時一點點亮光
      else drawHall(t, dt);                                                       // 第二道門裡已經看得到大廳 → 直接走進去   // 一進來先抬頭看圓頂,再慢慢看向前方
      if (k >= ENTER) go('hall');
    } else if (mode === 'hall') drawHall(t, dt);
    else if (mode === 'toRoom') {                              // 鏡頭走到艙門前、門滑開、穿進去 → 作品艙
      const d = hall.doors[cur];
      const real = realOn(cur), END = real ? TO_ROOM_R : TO_ROOM;
      if (k < 1.1) { d.open = ease(seg(k, .1, .7)); const v = doorPath(cur, seg(k, 0, 1.1), { pos: camPos, tgt }); drawHallAt(t, dt, v.pos, v.tgt); if (!real) fade = ease(seg(k, .85, 1.1)); }
      else if (real) { d.open = 0; walkPose(cur, ease(seg(k, 1.1, END))); drawRooms(t, dt); }   // 門洞裡已經是這間房 → 直接從門口走進去(不淡出)
      else { d.open = 0; drawRooms(t, dt, 1 - ease(seg(k, 1.1, TO_ROOM))); fade = 1 - ease(seg(k, 1.1, 1.4)); }
      if (k >= END) { roomWalk = null; roomLX = roomLY = 0; go('room', { room: cur }); }
    } else if (mode === 'room') { roomF += (cur - roomF) * Math.min(1, dt * 3.2); if (Math.abs(cur - roomF) < .002) roomF = cur; drawRooms(t, dt); }
    else if (mode === 'toHall') {                              // 作品艙淡出 → 從那道艙門前退回大廳全景
      const real = realOn(fromDoor), A = real ? .8 : .35, END = real ? TO_HALL_R : TO_HALL;
      if (k < A) { if (real) { walkPose(fromDoor, 1 - ease(seg(k, 0, A))); drawRooms(t, dt); } else { drawRooms(t, dt, ease(seg(k, 0, .35)) * .5); fade = ease(seg(k, 0, .35)); } }   // 真房間:退回門口,接著退回大廳(不淡出)
      else { roomWalk = null; const v = doorPath(fromDoor, 1 - seg(k, A, END), { pos: camPos, tgt }); drawHallAt(t, dt, v.pos, v.tgt); if (!real) fade = 1 - ease(seg(k, .35, .65)); }
      if (k >= END) go('hall');
    } else if (mode === 'exit') {                              // 大廳淡出 → 從機庫口退回太空看整艘船
      if (k < .4) { drawHall(t, dt); fade = ease(seg(k, 0, .4)); }
      else { drawExterior(t, 1, 1 - ease(seg(k, .4, 1.6)), 1 - ease(seg(k, 1.4, EXIT))); fade = 1 - ease(seg(k, .4, .75)); }   // 退出門外,大門在身後關上
      if (k >= EXIT) go('ext');
    }
  }
  const warmVeil = mode === 'enter' || mode === 'exit' || ((mode === 'toRoom' || mode === 'toHall') && realOn(mode === 'toRoom' ? cur : fromDoor));   // 白色大廳 ↔ 白色房間:用暖白轉場,不要閃黑
  veil.style.background = warmVeil ? '#f4efe6' : '#05070d';
  veil.style.opacity = fade.toFixed(3);

  // 滑鼠指到的東西(機庫口 / 艙門 / 作品艙)
  hover = -1; hoverHangar = false; hoverBot = false;
  if (live && !drag) { const h = pick(); if (h === 'hangar') hoverHangar = true; else if (h === 'bot') hoverBot = true; else hover = h; }
  hall.doors.forEach((d) => { d.hover += ((mode === 'hall' && hover === d.i ? 1 : 0) - d.hover) * Math.min(1, dt * 8); });
  // 游標:桌機用網站本來的圓球游標,指到作品門 / 機庫口 / 作品艙時縮成小點;手機或窄螢幕才用系統游標
  const onThing = live && (hoverHangar || hoverBot || hover >= 0);
  cursorEl?.classList.toggle('ondoor', onThing);
  canvas.style.cursor = fineCursor ? '' : onThing ? 'pointer' : mode === 'ext' ? (drag ? 'grabbing' : 'grab') : '';
  const hk = hoverHangar ? 'h' : hoverBot ? 'b' : hover; if (hk !== lastHk) { if (hk !== -1 && live) sfx.hover(); lastHk = hk; }   // 滑到新的東西:滴一聲
  player.show(live);

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
