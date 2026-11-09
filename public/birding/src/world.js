// 整個園區（溫室、山、水、植物、鳥、雲）：導覽頁（main.js）和遊戲（game/main.js）共用同一份，兩邊看到的世界一模一樣
import './fogzone.js'   // 一定要在任何材質編譯前（改霧的 shader）
import * as THREE from 'three'
import { lodUpdate } from './lod.js'
import { createAlpine } from './alpine.js'
import { createHalls } from './halls.js'
import { createShadowCache } from './shadowcache.js'
import { createCoast } from './coast.js'
import { buildOutside } from './outside.js'
import { createWeather } from './weather.js'
import { wetify } from './structures.js'
import { buildSky, buildDome, buildGround, buildMountain, buildWater, buildRamp, waterTime, ripple, dayLight, duskLight, mistLevel } from './structures.js'
import { buildFlora } from './flora.js'
import { loadPlants } from './plants.js'
import { buildStops } from './stops.js'
import { loadAnimalModels, placeAnimal } from './birds.js'
import { BIRDS } from './birdinfo.js'
import { foliageTime } from './fju-foliage.js'
import { windUniforms } from './wind.js'
import { MTN, POOL, terrainHeight, poolQ, mtnR, insideGarden, COAST_ON, inAlpine, alpineHeight, ALP_POND, PATHS, alpineTrailDist, addCollider } from './layout.js'
const FOG_D0 = 0.0034   // 白天的霧（2026-11-08 拿掉溫室：0.0052→0.0034，看得到遠景）；晚上、清晨照 mistLevel 加濃（setTime）
import { softDotTex } from './textures.js'
import { createCloudSea } from './cloudsea.js'
import { buildOwlNest } from './owlnest.js'

// 手機（觸控、窄螢幕）記憶體少：解析度和陰影貼圖都降一級，不然 iOS Safari 分頁會被系統關掉
export const PHONE = matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) < 820

// extraReserve：額外不種東西的圓（遊戲的攤位等），{ x, z, r }；extraModels：遊戲另外要載的鳥模型（飛行版）；
// night：要日夜（遊戲用；會多幾盞真的點光源，導覽頁不開就一直是白天）
export async function buildWorld(canvas, { onProgress, extraReserve = [], extraModels = [], night = false } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: false })
  renderer.setPixelRatio(Math.min(devicePixelRatio, PHONE ? 1.5 : 2))
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFShadowMap   // PCF 才吃 shadow.radius，邊緣比較柔
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.05

  const scene = new THREE.Scene()
  scene.fog = new THREE.FogExp2(new THREE.Color(0xc9d8d6), FOG_D0)
  const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 2000)
  camera.layers.enable(1)   // layer 1：草葉（水面倒影的鏡頭不畫）

  /* 光 */
  const { sky, skyMat } = buildSky(scene)
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
  // 溫室是一顆往東拉長的蛋（x -89 相機行 ～ 190）：陰影範圍以 x 50 為中心
  sun.position.set(25, 80, 30); sun.target.position.set(90, 0, 0)
  sun.castShadow = true
  sun.shadow.mapSize.setScalar(PHONE ? 2048 : 4096)
  Object.assign(sun.shadow.camera, { left: -190, right: 190, top: 130, bottom: -130, near: 1, far: 360 })   // 要蓋到溫室外面的相機行（x 到 -89）和東邊山區（x 到 270）
  sun.shadow.bias = -0.0004
  sun.shadow.normalBias = 0.06
  sun.shadow.radius = 3
  scene.add(sun, sun.target)

  /* 場景 */
  buildDome(scene)
  scene.add(buildOutside())   // 公園外面：圍籬、草地、樹林帶、遠山（2026-11-08 拿掉溫室）
  buildGround(scene)
  const mountain = buildMountain(scene)
  const water = buildWater(scene)
  buildRamp(scene)
  // 下載進度：植物（檔案大）佔 75%、鳥 25%
  let pF = 0, bF = 0
  const prog = () => onProgress?.(pF * 0.75 + bF * 0.25, 'load')
  const [plantLib] = await Promise.all([loadPlants((f) => { pF = f; prog() }), loadAnimalModels(extraModels, (f) => { bF = f; prog() })])
  onProgress?.(1, 'build')
  // 鳥：先擺好（鏡頭位置要先知道，種植物時才能避開視線和鳥活動的範圍）
  const birds = BIRDS.map((def) => {
    // 山區的鳥站在山區的地形上（地面高度查 alpineHeight）
    const groundH = (x, z) => inAlpine(x, z) ? alpineHeight(x, z) : terrainHeight(x, z)
    const d = { ...def, y: def.y ?? groundH(...def.spot), groundAt: def.water == null ? groundH : null }
    // 游泳的鳥只在開闊水面：離池邊（石頭）和山腳都要留距離
    if (def.swim === 'alpPond') d.swimOK = (x, z) => Math.hypot(x - ALP_POND.x, z - ALP_POND.z) < ALP_POND.r * 0.78   // 山區入口的湖（鴛鴦、花嘴鴨）
    else if (def.swim) d.swimOK = (x, z) => poolQ(x, z) < 0.7 && Math.hypot(x - MTN.x, z - MTN.z) > mtnR(Math.atan2(z - MTN.z, x - MTN.x), 0) + 4
    // 沒指定方位就讓鏡頭站在「鳥背對山」那一側，背景是雲霧山
    if (d.view == null) d.view = THREE.MathUtils.radToDeg(Math.atan2(def.spot[0] - MTN.x, def.spot[1] - MTN.z))
    // 2026-11-09 樹上的鳥：鏡頭（鳥面對的方向）如果和最近的步道差超過 90°，玩家從步道看到的會是背；改成朝步道
    if (def.view == null && def.perch === 'branch') {
      const [x, z] = def.spot; let best = 1e9, q = null
      for (const p of PATHS) for (const t of p.points) { const k = Math.hypot(t.x - x, t.z - z); if (k < best) { best = k; q = t } }
      const pv = THREE.MathUtils.radToDeg(Math.atan2(q.x - x, q.z - z))
      if (Math.abs(((pv - d.view) % 360 + 540) % 360 - 180) > 90) d.view = pv
    }
    const a = placeAnimal(d)
    scene.add(a.group)
    return { def, ...a }
  })
  // 第二館：高山雲霧林（外殼現在蓋，館內等玩家走過去才蓋）
  // 山區（溫室東半邊）：直接蓋、一直畫。附屬館只剩海岸館（目前關著）
  // 山區的樹、草、岩石避開鳥站的地方和鏡頭那一側
  const alpAvoid = birds.filter((b) => inAlpine(...b.def.spot)).map((b) => ({ x: b.def.spot[0], z: b.def.spot[1], cx: b.cam.x, cz: b.cam.z, ground: b.def.perch === 'ground' }))
  // 草鴞的巢（2026-11-09）：在鳥後面 1 公尺、偏旁邊一點，巢口朝鏡頭；巢那一圈山區的箭竹不長（巢自己有一叢白茅）
  const owlB = birds.find((b) => b.def.id === 'grassowl')
  if (owlB && inAlpine(...owlB.def.spot)) {
    const [ox, oz] = owlB.def.spot, tx = owlB.cam.x - ox, tz = owlB.cam.z - oz, tl = Math.hypot(tx, tz), ux = tx / tl, uz = tz / tl
    const nx = ox - ux * 1.05 + uz * 0.55, nz = oz - uz * 1.05 - ux * 0.55
    alpAvoid.push({ x: nx, z: nz, cx: owlB.cam.x, cz: owlB.cam.z, ground: true })
    // 步道邊的木樁：山區步道旁 2.2～2.8 公尺、離鳥最近的那一點，木板朝步道
    let sign = null, best = 1e9
    for (let sx = ox - 30; sx <= ox + 30; sx += 0.5) for (let sz = oz - 30; sz <= oz + 30; sz += 0.5) {
      const td = alpineTrailDist(sx, sz), k = Math.hypot(sx - ox, sz - oz)
      if (td > 2.2 && td < 2.8 && inAlpine(sx, sz, 1) && k < best) { best = k; sign = [sx, sz] }
    }
    if (sign) { const [sx, sz] = sign, e = 0.2; sign.push(Math.atan2(alpineTrailDist(sx - e, sz) - alpineTrailDist(sx + e, sz), alpineTrailDist(sx, sz - e) - alpineTrailDist(sx, sz + e))) }
    scene.add(buildOwlNest({ x: nx, z: nz, face: Math.atan2(ux, uz), groundAt: alpineHeight, owl: [ox, oz], sign }))
    addCollider(nx, nz, 0.55, alpineHeight(nx, nz) + 0.6)
    if (sign) addCollider(sign[0], sign[1], 0.12)
  }
  const alpine = createAlpine({ scene, lib: plantLib, avoid: alpAvoid })
  alpine.build()
  const halls = COAST_ON ? createHalls({ scene, sun, halls: [createCoast({ scene })] }) : { tick() {}, prebuild: async () => {}, halls: [], mode: 'D' }
  const birdStops = birds.map((b) => ({
    bird: b, title: b.def.name, nick: b.def.nick, sci: b.def.sci, tag: b.def.where, text: b.def.intro, facts: b.def.facts,
    pos: b.cam, target: b.target,
  }))
  // 地上的鳥：空地要大到鏡頭那邊也沒有花草擋在最前面
  const reserve = [...birds.map((b) => ({ x: b.def.spot[0], z: b.def.spot[1], r: b.def.perch === 'branch' ? 4 : Math.max(2.6, (b.def.dist ?? 0) + 0.8) })), ...extraReserve]
  const flora = buildFlora(scene, plantLib, { stopsFor: (h) => [...buildStops(h), ...birdStops], reserve })
  // 山體換成真實岩石貼圖（借 rock_face_02 的顏色＋法線），頂點色負責苔蘚／暗部
  {
    let src = null
    plantLib.rockface_b.traverse((o) => { if (o.isMesh) src = o.material })
    const m = mountain.material
    const rep = (t) => { const c = t.clone(); c.wrapS = c.wrapT = THREE.RepeatWrapping; c.repeat.set(2.2, 1.6); c.needsUpdate = true; return c }
    m.map = rep(src.map); m.normalMap = rep(src.normalMap); m.normalScale.set(1.4, 1.4)
    m.bumpMap = null
    m.color.setScalar(1.35)
    wetify(m, { dark: 0.4, rough: 0.35 })   // 下雨岩壁變濕變亮
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
      s.userData = { a, r, speed: 0.01 + Math.random() * 0.02, y: s.position.y, ph: Math.random() * 6, op0: m.opacity }
      s.renderOrder = 6
      scene.add(s)
      clouds.push(s)
    }
  }

  const cloudSea = createCloudSea(scene, { sun })   // 山區下面的雲海（爬到雲層上面才看得到）
  const time = night ? buildNight(scene, flora, { sun, hemi, renderer, skyMat, clouds, camera }) : null
  const weather = createWeather({ scene, camera, sun, hemi, renderer, time })   // 天氣：預設晴天、不自己變；遊戲（game/main.js）打開自動換

  function resize() {
    renderer.setSize(innerWidth, innerHeight, false)
    camera.aspect = innerWidth / innerHeight
    // 手機直立時畫面窄，視角放寬一點
    camera.fov = camera.aspect < 0.8 ? 68 : 55
    camera.updateProjectionMatrix()
  }
  addEventListener('resize', resize)
  resize()

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

  // 地面的霧（2026-11-07）：晚上、清晨才出現（mistLevel），貼著花園地面一層層慢慢飄；白天完全看不到。
  // 霧團本身不受光：顏色跟著天色變暗，不然晚上會像一團團發光的東西
  const groundMist = []
  {
    const tex = softDotTex()
    let n = 0
    for (let k = 0; k < 800 && n < 110; k++) {
      const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()), x = Math.cos(a) * r * 70, z = Math.sin(a) * r * 52
      if (!insideGarden(x, z, 0.92) || poolQ(x, z) < 1.1 || Math.hypot(x - MTN.x, z - MTN.z) < 14) continue
      const m = new THREE.SpriteMaterial({ map: tex, color: 0xeef3f3, transparent: true, opacity: 0, depthWrite: false, fog: true })
      const sp = new THREE.Sprite(m), sz = 10 + Math.random() * 12
      sp.scale.set(sz, sz * 0.32, 1); sp.renderOrder = 6; sp.visible = false
      sp.userData = { x, z, y: terrainHeight(x, z) + 0.4 + Math.random() * 0.9, sz, op: 0.55 + Math.random() * 0.35, ph: Math.random() * 6, v: 0.15 + Math.random() * 0.2 }
      scene.add(sp); groundMist.push(sp); n++
    }
  }
  // 每格：風、水、鳥（只更新鏡頭附近的，骨架動畫很吃 CPU）、水霧、雲
  function tick(t, dt, { phone = false } = {}) {
    lodUpdate(camera)
    halls.tick(t, dt, camera)
    alpine.animate(t, dt, camera)
    windUniforms.uTime.value = t
    waterTime.value = t
    pondRipples(t)
    foliageTime.value = t
    for (const b of birds) if (b.target.distanceTo(camera.position) < 70) b.update(t, dt, phone)
    water.mist.update(dt, camera)
    time?.tick(t, dt)
    cloudSea.tick(t, camera, { day: dayLight.value })
    weather.tick(t, dt)
    {
      const mk = mistLevel.value, tint = 0.2 + 0.8 * Math.min(1, dayLight.value * 1.4), cp = camera.position   // 清晨天剛亮，霧就先白起來
      for (const sp of groundMist) {
        const u = sp.userData
        if (mk < 0.02) { sp.visible = false; continue }
        u.x += u.v * dt * 0.6; if (!insideGarden(u.x, u.z, 0.93)) u.x -= 40   // 慢慢往東飄，飄到邊就繞回西邊
        sp.position.set(u.x, u.y + Math.sin(t * 0.15 + u.ph) * 0.2, u.z)
        const d = sp.position.distanceTo(cp)
        sp.material.opacity = Math.min(1, u.op * mk * 1.2 * (0.75 + 0.25 * Math.sin(t * 0.07 + u.ph))) * THREE.MathUtils.smoothstep(d, u.sz * 0.2, u.sz * 0.65)
        sp.material.color.setScalar(tint)
        sp.visible = sp.material.opacity > 0.01
      }
    }
    for (const c of clouds) {
      const u = c.userData
      u.a += u.speed * dt
      c.position.set(MTN.x + Math.cos(u.a) * u.r, u.y + Math.sin(t * 0.2 + u.ph) * 0.8, MTN.z + Math.sin(u.a) * u.r)
    }
  }
  // 畫質設定（遊戲的設定畫面會改）：水面倒影的解析度、幾格更新一次
  const quality = { reflScale: PHONE ? 0.3 : 0.5, reflEvery: PHONE ? 3 : 2 }
  const shadows = createShadowCache({ renderer, scene, sun, camera })
  let lastR = performance.now()
  function render(cam = camera) {
    const now = performance.now(); shadows.update(Math.min(0.1, (now - lastR) / 1000)); lastR = now
    water.reflect(renderer, scene, cam, quality.reflScale, quality.reflEvery)
    renderer.render(scene, cam)
  }
  return { renderer, scene, camera, sun, hemi, birds, flora, water, clouds, tick, render, time, weather, quality, plantLib, halls, alpine, shadows }   // plantLib：相機行的植物牆、花槽也用同一批寫實植物
}

/* ---------- 日夜 ---------- */
// setTime(時)：0～24。太陽從東邊升起（6 點）、西邊落下（18 點）；太陽下山後換成月光（偏藍、很弱）。
// 天空、霧、半球光、環境反射一起變暗；不受光的東西（水霧、雲、瀑布的自發光）跟著 dayLight 暗下來。
// 路燈：dayLight 掉到一半以下就亮。燈頭自發光＋一圈光暈；離玩家最近的幾盞放真的點光源（地上一圈光），全部都放太吃效能。
// 池邊、草叢有螢火蟲，只有晚上看得到。
const C = (h) => new THREE.Color(h)
const SKY_D = C(0xdcecf5), SKY_N = C(0x24304c), GND_D = C(0x5d6e44), GND_N = C(0x0b0e0a)
const FOG_D = C(0xc9d8d6), FOG_K = C(0xd8b39a), FOG_N = C(0x0b111b)
const SUN_D = C(0xfff1dc), SUN_K = C(0xff9a55), MOON = C(0x9fb6ff)
const MOON_DIR = new THREE.Vector3(0.45, 0.6, -0.5).normalize()
function buildNight(scene, flora, { sun, hemi, renderer, skyMat, clouds, camera }) {
  const ss = THREE.MathUtils.smoothstep, lerp = THREE.MathUtils.lerp
  // 會發光的材質：路燈、步道 LED（userData.lamp = [白天, 晚上] 強度）；其他自發光的（瀑布）白天的值乘上 dayLight
  const lampMats = [], glowMats = []
  scene.traverse((o) => {
    if (!o.material) return
    for (const m of [o.material].flat()) {
      if (m.userData.lamp) { if (!lampMats.includes(m)) lampMats.push(m) }
      else if (m.emissiveIntensity > 0 && m.emissive?.getHex() && !glowMats.includes(m)) { m.userData.glow0 = m.emissiveIntensity; glowMats.push(m) }
    }
  })
  // 燈頭光暈：一個 Points，加法混合
  const lamps = flora.lamps
  const halo = new THREE.Points(new THREE.BufferGeometry().setFromPoints(lamps), new THREE.PointsMaterial({
    map: softDotTex(), color: 0xffcf8a, size: 2.6, sizeAttenuation: true, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: true }))
  halo.frustumCulled = false
  // layer 2：光暈、螢火蟲（點的大小跟畫布高度走，畫到相機測光那張 48×32 的小圖會變超大，測光時把這層關掉）
  halo.layers.set(2); camera.layers.enable(2)
  scene.add(halo)
  // 真的光源：固定 N 盞（數量一變所有材質要重新編譯，所以白天也留著、亮度 0），每半秒換到離玩家最近的燈
  const N = PHONE ? 4 : 8
  const pls = Array.from({ length: N }, () => { const l = new THREE.PointLight(0xffc98a, 0, 13, 1.8); scene.add(l); return l })
  let pick = 0
  // 螢火蟲：池邊和草叢附近亂飛，一閃一閃
  const FF = 260, fp = [], fph = []
  for (let i = 0; fp.length < FF * 3 && i < 5000; i++) {
    const a = Math.random() * Math.PI * 2, r = 0.9 + Math.random() * 0.5
    const near = Math.random() < 0.55
    const x = near ? POOL.x + Math.cos(a) * POOL.rx * r : (Math.random() - 0.5) * 140
    const z = near ? POOL.z + Math.sin(a) * POOL.rz * r : (Math.random() - 0.5) * 100
    if (!insideGarden(x, z, 0.9) || poolQ(x, z) < 1.05) continue
    fp.push(x, terrainHeight(x, z) + 0.3 + Math.random() * 1.6, z); fph.push(Math.random() * 100)
  }
  const ffGeo = new THREE.BufferGeometry()
  ffGeo.setAttribute('position', new THREE.Float32BufferAttribute(fp, 3))
  ffGeo.setAttribute('aPh', new THREE.Float32BufferAttribute(fph, 1))
  const ffMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uT: { value: 0 }, uOn: { value: 0 }, uMap: { value: softDotTex() } },
    vertexShader: `attribute float aPh; uniform float uT; varying float vA;
      void main(){
        vec3 p = position + vec3(sin(uT * 0.4 + aPh) * 0.6, sin(uT * 0.7 + aPh * 1.3) * 0.25, cos(uT * 0.35 + aPh * 0.7) * 0.6);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        vA = pow(max(0.0, sin(uT * 1.3 + aPh * 4.0)), 3.0);
        gl_PointSize = clamp(140.0 / -mv.z, 2.0, 40.0); gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `uniform sampler2D uMap; uniform float uOn; varying float vA;
      void main(){ float a = texture2D(uMap, gl_PointCoord).r * vA * uOn; gl_FragColor = vec4(vec3(0.8, 1.0, 0.4) * a * 3.0, a); }`,
  })
  const fireflies = new THREE.Points(ffGeo, ffMat)
  fireflies.frustumCulled = false
  fireflies.layers.set(2)
  scene.add(fireflies)

  const st = { hour: 10, day: 1, lamp: 0 }
  const sunDir = new THREE.Vector3()
  function setTime(h) {
    st.hour = ((h % 24) + 24) % 24
    const a = (st.hour - 6) / 12 * Math.PI                                    // 6 點地平線、12 點最高、18 點落下
    sunDir.set(-Math.cos(a) * 0.8, Math.sin(a) * 0.85, 0.35).normalize()
    const day = ss(sunDir.y, -0.14, 0.28), dusk = ss(sunDir.y, -0.2, 0.0) * (1 - ss(sunDir.y, 0.05, 0.32))
    st.day = day; dayLight.value = day; duskLight.value = dusk
    skyMat.uniforms.sunDir.value.copy(sunDir)
    skyMat.uniforms.moonDir.value.copy(MOON_DIR)
    // 太陽／月光：同一盞平行光，太陽下山後轉向月亮
    const sunI = 2.3 * ss(sunDir.y, -0.02, 0.3), moonI = 0.32 * (1 - day)
    sun.position.copy(sun.target.position).addScaledVector(sunI > moonI ? sunDir : MOON_DIR, 100)
    sun.intensity = sunI + moonI
    sun.color.copy(sunI > moonI ? SUN_K.clone().lerp(SUN_D, ss(sunDir.y, 0.02, 0.4)) : MOON)
    hemi.intensity = lerp(0.22, 1.35, day)
    hemi.color.copy(SKY_N).lerp(SKY_D, day).lerp(FOG_K, dusk * 0.35)
    hemi.groundColor.copy(GND_N).lerp(GND_D, day)
    scene.environmentIntensity = lerp(0.05, 0.55, day)
    scene.fog.color.copy(FOG_N).lerp(FOG_D, day).lerp(FOG_K, dusk * 0.6)
    // 晚上、清晨起霧（2026-11-07）：清晨 6 點最濃，9 點前散掉；晚上 9 點後到天亮一直有霧
    const hh = st.hour, morning = Math.exp(-(((hh - 6.2) / 1.5) ** 2)), night = Math.max(ss(hh, 19, 21.5), 1 - ss(hh, 3.5, 6)) * 0.75   // three 的 smoothstep 是 (x, min, max)
    const mk = Math.min(1, Math.max(morning, night)); mistLevel.value = mk
    scene.fog.density = FOG_D0 * (1 + 0.75 * mk)
    for (const c of clouds) c.material.opacity = c.userData.op0 * (1 + 1.4 * mk)
    // 晚上眼睛會適應：曝光拉高一點，不然整片黑什麼都看不到
    renderer.toneMappingExposure = lerp(1.7, 1.05, day)
    st.lamp = 1 - ss(day, 0.3, 0.65)
    for (const m of lampMats) m.emissiveIntensity = lerp(m.userData.lamp[0], m.userData.lamp[1], st.lamp)
    for (const m of glowMats) m.emissiveIntensity = m.userData.glow0 * lerp(0.08, 1, day)
    halo.material.opacity = 0.55 * st.lamp
    ffMat.uniforms.uOn.value = 1 - ss(day, 0.05, 0.35)
    for (const c of clouds) c.material.color.setScalar(lerp(0.08, 1, day)).lerp(FOG_K, dusk * 0.5)
  }
  const _v = new THREE.Vector3()
  function tick(t, dt) {
    ffMat.uniforms.uT.value = t
    if (st.lamp <= 0.01) { for (const l of pls) l.intensity = 0; return }
    if ((pick -= dt) <= 0) {
      pick = 0.5
      const near = lamps.map((p, i) => [p.distanceToSquared(camera.position), i]).sort((a, b) => a[0] - b[0]).slice(0, N)
      near.forEach(([, i], k) => pls[k].position.copy(lamps[i]).add(_v.set(0, -0.25, 0)))
    }
    for (const l of pls) l.intensity = l.userData.off ? 0 : 14 * st.lamp
  }
  setTime(10)
  return { setTime, tick, get hour() { return st.hour }, get day() { return st.day }, lamps, benches: flora.benches, lights: pls }
}
