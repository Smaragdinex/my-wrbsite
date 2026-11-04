// 整個園區（溫室、山、水、植物、鳥、雲）：導覽頁（main.js）和遊戲（game/main.js）共用同一份，兩邊看到的世界一模一樣
import * as THREE from 'three'
import { buildSky, buildDome, buildGround, buildMountain, buildWater, buildRamp, waterTime, ripple } from './structures.js'
import { buildFlora } from './flora.js'
import { loadPlants } from './plants.js'
import { buildStops } from './stops.js'
import { loadAnimalModels, placeAnimal } from './birds.js'
import { BIRDS } from './birdinfo.js'
import { foliageTime } from './fju-foliage.js'
import { windUniforms } from './wind.js'
import { MTN, POOL, terrainHeight, poolQ, mtnR } from './layout.js'
import { softDotTex } from './textures.js'

// 手機（觸控、窄螢幕）記憶體少：解析度和陰影貼圖都降一級，不然 iOS Safari 分頁會被系統關掉
export const PHONE = matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) < 820

// extraReserve：額外不種東西的圓（遊戲的攤位等），{ x, z, r }
export async function buildWorld(canvas, { onProgress, extraReserve = [] } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: false })
  renderer.setPixelRatio(Math.min(devicePixelRatio, PHONE ? 1.5 : 2))
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFShadowMap   // PCF 才吃 shadow.radius，邊緣比較柔
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.05

  const scene = new THREE.Scene()
  scene.fog = new THREE.FogExp2(new THREE.Color(0xc9d8d6), 0.0052)
  const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 2000)
  camera.layers.enable(1)   // layer 1：草葉（水面倒影的鏡頭不畫）

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
  sun.shadow.mapSize.setScalar(PHONE ? 2048 : 4096)
  Object.assign(sun.shadow.camera, { left: -85, right: 85, top: 70, bottom: -70, near: 1, far: 250 })
  sun.shadow.bias = -0.0004
  sun.shadow.normalBias = 0.06
  sun.shadow.radius = 3
  scene.add(sun, sun.target)

  /* 場景 */
  buildDome(scene)
  buildGround(scene)
  const mountain = buildMountain(scene)
  const water = buildWater(scene)
  buildRamp(scene)
  const [plantLib] = await Promise.all([loadPlants(onProgress), loadAnimalModels()])
  // 鳥：先擺好（鏡頭位置要先知道，種植物時才能避開視線和鳥活動的範圍）
  const birds = BIRDS.map((def) => {
    const d = { ...def, y: def.y ?? terrainHeight(...def.spot), groundAt: def.water == null ? terrainHeight : null }
    // 游泳的鳥只在開闊水面：離池邊（石頭）和山腳都要留距離
    if (def.swim) d.swimOK = (x, z) => poolQ(x, z) < 0.7 && Math.hypot(x - MTN.x, z - MTN.z) > mtnR(Math.atan2(z - MTN.z, x - MTN.x), 0) + 4
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

  // 每格：風、水、鳥（只更新鏡頭附近的，骨架動畫很吃 CPU）、水霧、雲
  function tick(t, dt, { phone = false } = {}) {
    windUniforms.uTime.value = t
    waterTime.value = t
    pondRipples(t)
    foliageTime.value = t
    for (const b of birds) if (b.target.distanceTo(camera.position) < 70) b.update(t, dt, phone)
    water.mist.update(dt, camera)
    for (const c of clouds) {
      const u = c.userData
      u.a += u.speed * dt
      c.position.set(MTN.x + Math.cos(u.a) * u.r, u.y + Math.sin(t * 0.2 + u.ph) * 0.8, MTN.z + Math.sin(u.a) * u.r)
    }
  }
  function render(cam = camera) {
    water.reflect(renderer, scene, cam, PHONE ? 0.3 : 0.5, PHONE ? 3 : 2)
    renderer.render(scene, cam)
  }
  return { renderer, scene, camera, sun, hemi, birds, flora, water, clouds, tick, render }
}
