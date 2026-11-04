import * as THREE from 'three'
import { buildSky, buildDome, buildGround, buildMountain, buildWater, buildRamp, waterTime, ripple } from './structures.js'
import { buildFlora } from './flora.js'
import { loadPlants } from './plants.js'
import { buildStops, rampPoint } from './stops.js'
import { loadAnimalModels, placeAnimal } from './birds.js'
import { BIRDS } from './birdinfo.js'
import { foliageTime } from './fju-foliage.js'
import { snapScroll } from './snap.js'
import { windUniforms } from './wind.js'
import { MTN, POOL, mtnBase, domeY, terrainHeight } from './layout.js'
import { softDotTex } from './textures.js'

const canvas = document.getElementById('scene')
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' })
renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
renderer.shadowMap.enabled = true
renderer.shadowMap.type = THREE.PCFShadowMap   // PCF 才吃 shadow.radius，邊緣比較柔
renderer.toneMapping = THREE.ACESFilmicToneMapping
renderer.toneMappingExposure = 1.05

const scene = new THREE.Scene()
const FOG = new THREE.Color(0xc9d8d6)
scene.fog = new THREE.FogExp2(FOG, 0.0052)
const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 2000)

/* 光 */
const { sky } = buildSky(scene)
{
  // 環境反射：拿天空當光源
  const pm = new THREE.PMREMGenerator(renderer)
  const envScene = new THREE.Scene()
  envScene.add(sky.clone())
  scene.environment = pm.fromScene(envScene, 0.04).texture
  scene.environmentIntensity = 0.55
}
const hemi = new THREE.HemisphereLight(0xdcecf5, 0x5d6e44, 1.35)
scene.add(hemi)
const sun = new THREE.DirectionalLight(0xfff1dc, 2.3)
sun.position.set(-45, 80, 30)
sun.castShadow = true
sun.shadow.mapSize.set(4096, 4096)
Object.assign(sun.shadow.camera, { left: -85, right: 85, top: 70, bottom: -70, near: 1, far: 250 })
sun.shadow.bias = -0.0004
sun.shadow.normalBias = 0.06
sun.shadow.radius = 3
scene.add(sun, sun.target)

/* 卡片 */
const story = document.getElementById('story'), dots = document.getElementById('dots')
const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
const CREDITS = `<details class="credits"><summary>模型來源</summary><div class="small">
  棕櫚、龜背芋、香蕉、蕨類：<a href="https://sketchfab.com/3d-models/2f093afb792742438f0f7ba7eaab90f0" target="_blank" rel="noopener">Tropical Plants Pack M02P</a> by MozzarellaARC（<a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener">CC BY 4.0</a>）<br>
  椰子類棕櫚：<a href="https://sketchfab.com/3d-models/d05c8ffb6ec64a7184c4b673e21f7224" target="_blank" rel="noopener">Realistic Palm Tree 2 Free</a> by Next Spring（CC BY 4.0）<br>
  雨林大樹：<a href="https://sketchfab.com/3d-models/46f83ec5f6c04abf9d509c1070f67d1e" target="_blank" rel="noopener">Jungle Tree</a> by kobaltsecond6c7d6150917a4267（CC BY 4.0）<br>
  鳳梨科植物：<a href="https://sketchfab.com/3d-models/0930b42ec567469b8cdeaa93d37c9f06" target="_blank" rel="noopener">BROMELIADS PLANTS</a> by wasis007（CC BY 4.0）<br>
  火鶴、竹芋、蕨類、馬拉巴栗、岩石：<a href="https://polyhaven.com/models" target="_blank" rel="noopener">Poly Haven</a>（CC0）<br>
  以上模型皆經縮放、減面與重新上色後使用。</div></details>`
let STOPS = []
function renderCards() {
  story.innerHTML = STOPS.map((s, i) => s.cover
    ? `<section class="step"><div class="card"><h1>${esc(s.title)}</h1><p>${esc(s.text)}</p><p class="hint">↓ 往下滑開始</p>${CREDITS}</div></section>`
    : s.bird
      ? `<section class="step"><div class="card">
        <div class="num">${String(i).padStart(2, '0')} / ${STOPS.length - 1}・園區的鳥</div>
        <h2>${esc(s.title)}${s.nick ? `<span class="nick">${esc(s.nick)}</span>` : ''}</h2>
        <div class="sci">${esc(s.sci)}</div>
        <div class="tag">📍 ${esc(s.tag)}</div>
        <p>${esc(s.text)}</p>
        <details class="facts"><summary>小知識（${s.facts.length}）</summary><ul>${s.facts.map((f) => `<li>${esc(f)}</li>`).join('')}</ul></details></div></section>`
      : `<section class="step"><div class="card">
        <div class="num">${String(i).padStart(2, '0')} / ${STOPS.length - 1}</div>
        <h2>${esc(s.title)}</h2>${s.tag ? `<div class="tag">${esc(s.tag)}</div>` : ''}
        <p>${esc(s.text)}</p></div></section>`).join('')
  dots.innerHTML = ''
  STOPS.forEach((s, i) => {
    const b = document.createElement('button')
    b.title = s.title
    b.onclick = () => snap?.goTo(i)
    dots.appendChild(b)
  })
}
let snap = null, steps = []

/* 場景 */
buildDome(scene)
buildGround(scene)
const mountain = buildMountain(scene)
const water = buildWater(scene)
buildRamp(scene)
const loadingEl = document.getElementById('loading')
const T0 = performance.now()
const [plantLib] = await Promise.all([loadPlants((f) => { loadingEl.textContent = `園區建造中… ${Math.round(f * 100)}%` }), loadAnimalModels()])
const T1 = performance.now()
// 鳥：先擺好（鏡頭位置要先知道，種植物時才能避開視線和鳥活動的範圍）
const birds = BIRDS.map((def) => {
  const d = { ...def, y: def.y ?? terrainHeight(...def.spot) }
  // 沒指定方位就讓鏡頭站在「鳥背對山」那一側，背景是雲霧山
  if (d.view == null) d.view = THREE.MathUtils.radToDeg(Math.atan2(def.spot[0] - MTN.x, def.spot[1] - MTN.z))
  const a = placeAnimal(d)
  scene.add(a.group)
  return { def, ...a }
})
const birdStops = birds.map((b) => ({
  bird: b, title: b.def.name, nick: b.def.nick, sci: b.def.sci, tag: b.def.where, text: b.def.intro, facts: b.def.facts,
  pos: b.cam, target: b.target,
}))
const reserve = birds.map((b) => ({ x: b.def.spot[0], z: b.def.spot[1], r: b.def.perch === 'branch' ? 4 : 2.6 }))
const flora = buildFlora(scene, plantLib, { stopsFor: (h) => [...buildStops(h), ...birdStops], reserve })
const T2 = performance.now()
// 山體換成真實岩石貼圖（借 rock_face_02 的顏色＋法線），頂點色負責苔蘚／暗部
{
  let src = null
  plantLib.rockface_b.traverse((o) => { if (o.isMesh) src = o.material })
  const m = mountain.material
  const rep = (t) => { const c = t.clone(); c.wrapS = c.wrapT = THREE.RepeatWrapping; c.repeat.set(2.2, 1.6); c.needsUpdate = true; return c }
  m.map = rep(src.map); m.normalMap = rep(src.normalMap); m.normalScale.set(1.4, 1.4)
  m.bumpMap = null
  m.color.setScalar(1.35)
  m.needsUpdate = true
}

// 山頂雲霧
const clouds = []
{
  const tex = softDotTex()
  for (let i = 0; i < 26; i++) {
    const m = new THREE.SpriteMaterial({ map: tex, color: 0xf4f8f8, transparent: true, opacity: 0.22 + Math.random() * 0.12, depthWrite: false, fog: true })
    const s = new THREE.Sprite(m)
    const a = Math.random() * Math.PI * 2, r = 6 + Math.random() * 16
    s.position.set(MTN.x + Math.cos(a) * r, 22 + Math.random() * 14, MTN.z + Math.sin(a) * r)
    const k = 10 + Math.random() * 14
    s.scale.set(k, k * 0.55, 1)
    s.userData = { a, r, speed: 0.01 + Math.random() * 0.02, y: s.position.y, ph: Math.random() * 6 }
    s.renderOrder = 6
    scene.add(s)
    clouds.push(s)
  }
}

STOPS = flora.stops
renderCards()
steps = [...story.querySelectorAll('.step')]
// 小知識：寬螢幕直接展開，手機收起來（卡片才不會太高）
const wide = matchMedia('(min-width: 721px)')
const openFacts = () => document.querySelectorAll('details.facts').forEach((d) => { d.open = wide.matches })
openFacts(); wide.addEventListener('change', openFacts)
snap = snapScroll(steps, { onChange: (i) => [...dots.children].forEach((b, k) => b.classList.toggle('on', k === i)) })
;[...dots.children].forEach((b, k) => b.classList.toggle('on', k === 0))

/* ---------- 捲動 → 鏡頭 ---------- */
function scrollProgress() {
  const y = scrollY
  const keys = steps.map((s) => s.offsetTop + s.offsetHeight / 2 - innerHeight / 2)
  if (y <= keys[0]) return 0
  for (let i = 1; i < keys.length; i++) if (y < keys[i]) return i - 1 + (y - keys[i - 1]) / (keys[i] - keys[i - 1])
  return keys.length - 1
}
const camPos = new THREE.Vector3(), camTarget = new THREE.Vector3()
const _a = new THREE.Vector3(), _b = new THREE.Vector3()
// 兩站之間用「繞山的圓柱座標」內插：角度走短的那邊、半徑不會小於山的半徑，鏡頭就不會穿過山體。
// 中段稍微抬高，越過灌木和步道欄杆；但不能撞到溫室屋頂
function shotAt(p) {
  const i = Math.min(STOPS.length - 2, Math.floor(p))
  const f = THREE.MathUtils.smoothstep(p - i, 0.08, 0.92)
  const A = STOPS[i], B = STOPS[i + 1]
  // 兩站都在空中步道上：沿著步道走過去（直線飛會穿過上一圈步道的地板），眼睛看前方的步道
  if (A.ramp && B.ramp) {
    const g = B.deck ? Math.min(1, f / 0.8) : f
    const s = THREE.MathUtils.lerp(A.ramp.s, B.ramp.s, g), off = THREE.MathUtils.lerp(A.ramp.off, B.ramp.off, g)
    camPos.copy(rampPoint(s, off))
    if (B.deck) camPos.lerp(B.pos, THREE.MathUtils.smoothstep(f, 0.75, 1))
    camTarget.lerpVectors(A.target, B.target, f)
    const ahead = rampPoint(s + 0.06, off + 1.2, 1.2)
    camTarget.lerp(ahead, Math.sin(f * Math.PI) * 0.9)
    return Math.round(p)
  }
  // 直線不會靠近山：直接直線飛（繞山的弧線反而會掃過旁邊的大樹）
  {
    const dx = B.pos.x - A.pos.x, dz = B.pos.z - A.pos.z, L2 = dx * dx + dz * dz || 1
    const t = THREE.MathUtils.clamp(((MTN.x - A.pos.x) * dx + (MTN.z - A.pos.z) * dz) / L2, 0, 1)
    const near = Math.hypot(A.pos.x + dx * t - MTN.x, A.pos.z + dz * t - MTN.z)
    if (near > mtnBase(0) + 7) {
      camPos.lerpVectors(A.pos, B.pos, f)
      camPos.y += Math.sin(f * Math.PI) * Math.min(6, A.pos.distanceTo(B.pos) * 0.15)
      camPos.y = Math.min(camPos.y, domeY(camPos.x, camPos.z) - 1.5)
      camTarget.lerpVectors(A.target, B.target, f)
      return Math.round(p)
    }
  }
  const cyl = (v) => ({ a: Math.atan2(v.z - MTN.z, v.x - MTN.x), r: Math.hypot(v.x - MTN.x, v.z - MTN.z), y: v.y })
  const ca = cyl(A.pos), cb = cyl(B.pos)
  let da = cb.a - ca.a
  while (da > Math.PI) da -= Math.PI * 2
  while (da < -Math.PI) da += Math.PI * 2
  const bump = Math.sin(f * Math.PI)
  const y = THREE.MathUtils.lerp(ca.y, cb.y, f) + bump * Math.min(8, A.pos.distanceTo(B.pos) * 0.12)
  const rMin = mtnBase(Math.max(0, y)) + 6
  const r = Math.max(THREE.MathUtils.lerp(ca.r, cb.r, f), rMin * bump + Math.min(ca.r, cb.r) * (1 - bump))
  const a = ca.a + da * f
  camPos.set(MTN.x + r * Math.cos(a), y, MTN.z + r * Math.sin(a))
  camPos.y = Math.min(camPos.y, domeY(camPos.x, camPos.z) - 1.5)
  camTarget.lerpVectors(_a.copy(A.target), _b.copy(B.target), f)
  return Math.round(p)
}

function resize() {
  renderer.setSize(innerWidth, innerHeight, false)
  camera.aspect = innerWidth / innerHeight
  // 手機直立時畫面窄，視角放寬一點
  camera.fov = camera.aspect < 0.8 ? 68 : 55
  camera.updateProjectionMatrix()
}
addEventListener('resize', resize)
resize()

// 預熱：載入畫面還蓋著的時候每一站都先畫一次，著色器編譯、貼圖上傳都在這時做完
for (const b of birds) b.update(0, 0.016)
for (const s of STOPS) {
  camera.position.copy(s.pos); camera.lookAt(s.target)
  renderer.render(scene, camera)
}
await renderer.compileAsync(scene, camera)
console.log(`[park] 模型 ${Math.round(T1 - T0)} ms、擺放 ${Math.round(T2 - T1)} ms、預熱 ${Math.round(performance.now() - T2)} ms`)
loadingEl.classList.add('done')

// 池面的水紋：隨機的地方冒一圈（魚浮上來、蟲碰到水面），偶爾一次冒兩三圈
let nextRipple = 0
function pondRipples(t) {
  if (t < nextRipple) return
  nextRipple = t + 0.35 + Math.random() * 0.9
  const n = Math.random() < 0.2 ? 3 : 1
  const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * 0.85
  const x = POOL.x + Math.cos(a) * r * POOL.rx, z = POOL.z + Math.sin(a) * r * POOL.rz
  for (let i = 0; i < n; i++) ripple(x + (Math.random() - 0.5) * 0.4 * i, z + (Math.random() - 0.5) * 0.4 * i, 0.5 + Math.random() * 0.8)
}

const _look = new THREE.Vector3(), _dir = new THREE.Vector3(), _right = new THREE.Vector3(), _upV = new THREE.Vector3(0, 1, 0)
let smooth = null
const clock = new THREE.Clock()
function frame() {
  requestAnimationFrame(frame)
  snap.tick()
  const dt = Math.min(clock.getDelta(), 0.05), t = clock.elapsedTime
  windUniforms.uTime.value = t
  waterTime.value = t
  pondRipples(t)
  foliageTime.value = t
  // 鳥：只更新鏡頭附近的（骨架動畫很吃 CPU）
  for (const b of birds) if (b.target.distanceTo(camera.position) < 70) b.update(t, dt)
  water.mist.update(dt, camera)
  for (const c of clouds) {
    const u = c.userData
    u.a += u.speed * dt
    c.position.set(MTN.x + Math.cos(u.a) * u.r, u.y + Math.sin(t * 0.2 + u.ph) * 0.8, MTN.z + Math.sin(u.a) * u.r)
  }
  shotAt(scrollProgress())
  // 除錯：__park.view = { pos:[x,y,z], target:[x,y,z] } 把鏡頭固定在任意位置
  const dv = window.__park.view
  if (dv) { camPos.fromArray(dv.pos); camTarget.fromArray(dv.target); smooth = null }
  // 平滑追上捲動位置，手機慣性捲動才不會抖
  if (!smooth) smooth = { pos: camPos.clone(), target: camTarget.clone() }
  const k = 1 - Math.exp(-dt * 6)
  smooth.pos.lerp(camPos, k); smooth.target.lerp(camTarget, k)
  camera.position.copy(smooth.pos)
  // 寬螢幕卡片在左邊：鏡頭往左偏一點看，鳥才會落在畫面右半邊、不被卡片蓋住
  _look.copy(smooth.target)
  if (innerWidth > 720) {
    _dir.subVectors(smooth.target, smooth.pos)
    _right.crossVectors(_dir, _upV).normalize()
    _look.addScaledVector(_right, -_dir.length() * 0.24)
  }
  camera.lookAt(_look)
  renderer.render(scene, camera)
}
window.__park = { scene, camera, renderer, snap, STOPS, flora, birds, shotAt: (p) => (shotAt(p), { pos: camPos.clone(), target: camTarget.clone() }) }
frame()
