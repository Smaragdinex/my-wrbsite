// 整個園區（溫室、山、水、植物、鳥、雲）：導覽頁（main.js）和遊戲（game/main.js）共用同一份，兩邊看到的世界一模一樣
import './fogzone.js'   // 一定要在任何材質編譯前（改霧的 shader）
import * as THREE from 'three'
import { lodUpdate, lodRegister, lodInit } from './lod.js'
import { createAlpine , loadConiferKit } from './alpine.js'
import { createHalls } from './halls.js'
import { createShadowCache } from './shadowcache.js'
import { createCoast } from './coast.js'
import { buildOutside } from './outside.js'
import { createWeather } from './weather.js'
import { wetify } from './structures.js'
import { buildSky, buildDome, buildGround, buildMountain, buildWater, buildRamp, waterTime, ripple, dayLight, duskLight, mistLevel, sunDirU } from './structures.js'
import { buildFlora } from './flora.js'
import { loadPlants, parts } from './plants.js'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { buildStops } from './stops.js'
import { loadAnimalModels, placeAnimal, REAL_CM, gameLen, ensureModel, modelsFor, modelFailed, MissingModel } from './birds.js'
import { BIRDS } from './birdinfo.js'
import { foliageTime } from './fju-foliage.js'
import { windUniforms } from './wind.js'
import { SPAWN, MTN, POOL, terrainHeight, poolQ, mtnR, insideGarden, COAST_ON, inAlpine, alpineHeight, ALP_POND, PATHS, alpineTrailDist, addCollider, pathClearAt, FIG_FORCED, EAST, wetSD , walkAt, deckAt } from './layout.js'
const FOG_D0 = 0.0034   // 白天的霧（2026-11-08 拿掉溫室：0.0052→0.0034，看得到遠景）；晚上、清晨照 mistLevel 加濃（setTime）
import { softDotTex } from './textures.js'
import { createCloudSea } from './cloudsea.js'
import { buildOwlNest } from './owlnest.js'
import { buildEast, loadHideKit } from './east.js'
import { buildCamp } from './camp.js'
import { buildPondLife } from './pondlife.js'
import { buildYosemite } from './yosemite.js'
import { buildGiants, giantSpots } from './giants.js'
import { loadWalkwayKit, buildWalkways } from './walkway.js'
import { buildStreambed, streambedTick } from './streambed.js'
import { loadWetlandKit, buildWetlandProps } from './wetland.js'
import { loadSummitKit, buildSummit as buildYoseTop } from './yosemite-top.js'
import { loadCaveKit, buildCave } from './cave.js'

// 手機（觸控、窄螢幕）記憶體少：解析度和陰影貼圖都降一級，不然 iOS Safari 分頁會被系統關掉
export const PHONE = matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) < 820

// extraReserve：額外不種東西的圓（遊戲的攤位等），{ x, z, r }；extraModels：遊戲另外要載的鳥模型（飛行版）；
// night：要日夜（遊戲用；會多幾盞真的點光源，導覽頁不開就一直是白天）
export async function buildWorld(canvas, { onProgress, extraReserve = [], extraModels = [], night = false, stream = false } = {}) {
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
  // 2026-11-10 玩家回饋「好卡」：以前一張 4096 陰影貼圖蓋整個園區（380×260 公尺），每次重畫都把全區的樹畫一遍（＋1000 多萬個三角形）。
  // 改成跟著玩家的 150×150 公尺（2048 貼圖，一個貼素 7 公分、比以前還細）；走出 24 公尺格子才搬家重畫。遠處地面的影子本來就是烘焙的
  sun.shadow.mapSize.setScalar(2048)
  Object.assign(sun.shadow.camera, { left: -75, right: 75, top: 75, bottom: -75, near: 1, far: 360 })   // 要蓋到溫室外面的相機行（x 到 -89）和東邊山區（x 到 270）
  sun.shadow.bias = -0.0004
  sun.shadow.normalBias = 0.06
  sun.shadow.radius = 3
  scene.add(sun, sun.target)

  /* 場景 */
  buildDome(scene)
  await loadConiferKit()   // 2026-11-12 立體樹冠的冷杉、鐵杉（180 KB）：公園外的樹林帶也要用，所以最先載
  const outsideG = buildOutside(renderer); scene.add(outsideG)   // 公園外面：圍籬、草地、樹林帶、遠山（2026-11-08 拿掉溫室）
  buildGround(scene)
  const mountain = buildMountain(scene)
  const water = buildWater(scene)
  buildRamp(scene)
  // 2026-11-11 串流載入（stream：遊戲用；導覽頁照舊全部載完）：進場前只載入口 NEAR 公尺內的鳥，其餘進場後由近到遠在背景載（下面 streamBirds）
  const NEAR = 70
  const nearIds = stream ? BIRDS.filter((d) => Math.hypot(d.spot[0] - SPAWN.x, d.spot[1] - SPAWN.z) < NEAR).map((d) => d.id).concat('mikado') : null   // 帝雉：圖鑑扉頁的插圖一打開就要
  // 下載進度：植物（檔案大）佔 75%、鳥 25%
  let pF = 0, bF = 0
  const prog = () => onProgress?.(pF * 0.75 + bF * 0.25, 'load')
  const [plantLib, , walkKit, wetKit, sumKit, caveKit, hideKit] = await Promise.all([loadPlants((f) => { pF = f; prog() }), loadAnimalModels(extraModels, (f) => { bF = f; prog() }, nearIds), loadWalkwayKit(), loadWetlandKit(), loadSummitKit(), loadCaveKit(), loadHideKit()])
  onProgress?.(1, 'build')
  // 鳥：先擺好（鏡頭位置要先知道，種植物時才能避開視線和鳥活動的範圍）
  const placeDef = (def) => {
    // 山區的鳥站在山區的地形上（地面高度查 alpineHeight）
    const groundH = (x, z) => inAlpine(x, z) ? alpineHeight(x, z) : terrainHeight(x, z)
    const d = { ...def, y: def.y ?? groundH(...def.spot), groundAt: def.water == null && !def.cliffRay ? groundH : null }   // 岩壁上的鳥不照地形（不然會掉到岩壁腳下）
    // 游泳的鳥只在開闊水面：離池邊（石頭）和山腳都要留距離
    const nearBoard = (x, z) => { for (const [dx, dz] of [[0, 0], [1.5, 0], [-1.5, 0], [0, 1.5], [0, -1.5], [1.1, 1.1], [-1.1, 1.1], [1.1, -1.1], [-1.1, -1.1]]) if (walkAt(x + dx, z + dz) != null || deckAt(x + dx, z + dz) != null) return true; return false }
    if (def.swim === 'alpPond') d.swimOK = (x, z) => Math.hypot(x - ALP_POND.x, z - ALP_POND.z) < ALP_POND.r * 0.78   // 山區入口的湖（鴛鴦、花嘴鴨）
    else if (def.swim === 'eastWet') d.swimOK = (x, z) => wetSD(x, z) < -2.5 && alpineHeight(x, z) < EAST.W - 0.3 && !nearBoard(x, z)   // 東部人工濕地（黃麻鴨、鸊鷉）：開闊、夠深的水面；2026-11-13 使用者：鸊鷉游到木棧道底下穿過去 → 離棧道、觀景台 1.5 m 以內不去
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
    d.trunkBad = (x, z) => inAlpine(x, z) ? alpineTrailDist(x, z) < 2 : pathClearAt(x, z) < 1.2
    const a = placeAnimal(d)
    scene.add(a.group)
    return Object.assign(a, { def, size: REAL_CM[def.id] ? gameLen(REAL_CM[def.id]) : 0.3 })   // 同一個物件（串流載入：模型晚點載到時 a.finish() 直接改它的 built／update）   // size：遊戲裡的身長（公尺），畫面像素剔除用
  }
  // 停在神木上的鳥（茶腹鳾）要等神木蓋好、量到樹皮表面才能擺，先跳過（也不能進 alpAvoid，不然神木會躲開牠、換位置）
  const birds = BIRDS.filter((d) => d.perch !== 'sacred' && !d.onFig && !d.cliffRay).map(placeDef)   // cliffRay：岩壁上的鳥，等岩壁蓋好再量（下面）
  // 2026-11-10 吃果實的鳥：雀榕直接種在鳥的站點（FIG_FORCED），樹種好之後再到這棵樹真正的枝條上找位置站（下面 findFigPerch）
  const figDefs = BIRDS.filter((d) => d.onFig)
  for (const d of figDefs) FIG_FORCED.push({ x: d.spot[0], z: d.spot[1], y: alpineHeight(...d.spot), def: d })
  // 2026-11-10 figExtra：同一種鳥在別棵雀榕上再放一隻（一棵樹一隻；使用者：兩隻疊在同一根枝上）。自然長的雀榕樹冠低、葉子會把鳥蓋住，所以也種一棵指定的
  for (const d of figDefs) for (const s of d.figExtra ?? []) FIG_FORCED.push({ x: s[0], z: s[1], y: alpineHeight(...s), def: { ...d, spot: s, extra: true } })
  // 第二館：高山雲霧林（外殼現在蓋，館內等玩家走過去才蓋）
  // 山區（溫室東半邊）：直接蓋、一直畫。附屬館只剩海岸館（目前關著）
  // 山區的樹、草、岩石避開鳥站的地方和鏡頭那一側
  const alpAvoid = birds.filter((b) => inAlpine(...b.def.spot)).map((b) => ({ x: b.def.spot[0], z: b.def.spot[1], cx: b.cam.x, cz: b.cam.z, ground: b.def.perch === 'ground' || b.def.perch === 'stem', clear: b.def.lawn ? 5 : 0 }))
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
    // 2026-11-10 使用者：巢要隱密 → 不再從步道清出一條通到巢的草叢通道（那條路等於指路）
    // 2026-11-09 使用者：外面不用那根木樁（sign 只拿來決定草叢通道的方向，不再擺出來）
    scene.add(buildOwlNest({ x: nx, z: nz, face: Math.atan2(ux, uz), groundAt: alpineHeight, owl: [ox, oz], sign: null }))
    addCollider(nx, nz, 0.55, alpineHeight(nx, nz) + 0.6)
  }
  giantSpots(alpAvoid)   // 巨木的位置先算好：山區的其他樹、草要避開
  const alpine = createAlpine({ scene, lib: plantLib, avoid: alpAvoid })
  scene.add(buildEast({ avoid: alpAvoid, lib: plantLib, hideKit, walkKit }))
  buildStreambed(scene).then((r) => console.log('streambed', JSON.stringify(r))).catch((e) => console.error('streambed', e))   // 2026-11-12 溪床卵石、苔石、水草（不擋進場，載好就出現）   // 2026-11-10 東部擴建：草原、人工濕地的草和蘆葦（east.js）
  alpine.build()
  // 2026-11-13 使用者「把這裡的營區暫時都移除，讓進入瀑布步道更順暢」：帳篷、柴堆、營火、冰桶都不擺（buildCamp 留著，要放回來把這行換回去）
  const camp = { tick() {} }   // buildCamp(scene)
  const pondLife = buildPondLife(scene, { lib: plantLib })   // 2026-11-10 山下湖：荷花、錦鯉
  const yose = buildYosemite(scene, { lib: plantLib })   // 2026-11-10 帳篷區後面的花崗岩壁、瀑布、西黃松
  const giants = buildGiants(scene, { sun, avoid: alpAvoid, lib: plantLib })
  buildWetlandProps(scene, wetKit, walkKit)   // 2026-11-11 濕地 V3：枯樹、舊木樁、睡蓮（Blender）
  buildCave(scene, caveKit, sumKit, plantLib)   // 2026-11-11 瀑布後面的岩窟步道（岩拱、石板路、青苔）
  buildYoseTop(scene, sumKit, plantLib)   // 2026-11-11 瀑布頂後面的整座山、平台和石階的青苔草叢
  outsideG.userData.buildFence?.(walkKit)   // 2026-11-11 園區圍籬用木棧道同一套零件和木頭材質
  // 2026-11-12 場景太重：瀑布、岩窟、岩壁頂、濕地、棧道這幾區自己建的 InstancedMesh（石階、鐵鍊、崖松、蘆葦、木樁、山上的冷杉）
  // 以前不管在哪都整批畫。建好之後（有的零件是非同步載的，所以隔幾秒再掃幾次）一個個登記到 LOD：視野外、太遠太小的那幾個不畫
  const lodSweep = () => {
    for (const top of scene.children) {
      if (!['yosemite', 'cave', 'summit', 'streambed', 'wetlandProps', 'walkways'].includes(top.name)) continue
      top.traverse((m) => {
        if (!m.isInstancedMesh || m.count < 8 || m.userData.fullSphere || m.userData.noLod || m.isSkinnedMesh || m.instanceMatrix.usage === THREE.DynamicDrawUsage) return
        if (!m.geometry.boundingBox) m.geometry.computeBoundingBox()
        const bb = m.geometry.boundingBox; lodRegister([m], Math.max(0.3, bb.max.y - bb.min.y), [], { solid: true })
      })
    }
  }
  // 2026-11-12 記憶體分級（使用者：學校的電腦打不開）：照這台電腦的記憶體和顯示卡分三級——
  //   full（獨立顯卡、Apple M 系列，記憶體 8 GB 以上）：貼圖原尺寸、鳥全部在背景載完（原本的行為）
  //   mid（記憶體 8 GB 或一般顯卡）：貼圖最大 1024、只載 170 m 內的鳥（走近才載）
  //   lite（內顯、記憶體 4 GB 以下、手機）：貼圖最大 512、只載 110 m 內的鳥
  // 貼圖縮小＝畫到小的 canvas 換掉原圖（2048² 一張連 mipmap 佔 22 MB 顯示記憶體，縮到 1024 剩四分之一、512 剩十六分之一）。網址加 ?tier=full|mid|lite 可以強制
  const TIER = (() => {
    const q = new URLSearchParams(location.search).get('tier'); if (q === 'full' || q === 'mid' || q === 'lite') return q
    try { const sv = localStorage.getItem('birdpark.tier'); if (sv === 'full' || sv === 'mid' || sv === 'lite') return sv } catch {}   // 玩家在主畫面選的（沒選＝自動）
    let name = ''; try { const gl = renderer.getContext(), ext = gl.getExtension('WEBGL_debug_renderer_info'); name = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)) } catch {}
    const mem = navigator.deviceMemory ?? 8
    if (PHONE || mem <= 4 || /swiftshader|llvmpipe|software|basic render|intel|uhd|iris|hd graphics|mali|adreno|powervr|vega \d/i.test(name)) return 'lite'
    if (/apple m\d|rtx|gtx 1[06-9]|gtx 16|radeon rx|radeon pro|arc a/i.test(name) && mem >= 8) return 'full'
    return 'mid'
  })()
  const TEXCAP = { full: 4096, mid: 1024, lite: 512 }[TIER], BIRD_RANGE = { full: 1e9, mid: 170, lite: 110 }[TIER]
  const capped = new WeakSet(), memStat = { tier: TIER, shrunk: 0, savedMB: 0 }
  const capTextures = (root = scene) => {
    if (TEXCAP >= 4096) return
    root.traverse((o) => {
      const ms = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : []
      for (const m of ms) for (const k in m) {
        const t = m[k]; if (!t || !t.isTexture || capped.has(t) || t.isCompressedTexture || t.isDataTexture || t.isRenderTargetTexture || t.isCubeTexture) continue
        const im = t.image; if (!im || !(im instanceof ImageBitmap || im instanceof HTMLImageElement || im instanceof HTMLCanvasElement)) continue
        const w = im.width, h = im.height; if (!w || !h) continue   // 還沒載完：下次掃到再處理
        capped.add(t); if (Math.max(w, h) <= TEXCAP) continue
        const k2 = TEXCAP / Math.max(w, h), c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w * k2)); c.height = Math.max(1, Math.round(h * k2))
        c.getContext('2d').drawImage(im, 0, 0, c.width, c.height)
        t.image = c; t.needsUpdate = true; im.close?.()
        memStat.shrunk++; memStat.savedMB += (w * h - c.width * c.height) * 4 * 1.33 / 1e6
      }
    })
  }
  // 2026-11-13 貼圖斜著看（石板路、地面、樹皮）不要糊：所有貼圖開到這張顯示卡能給的最大各向異性過濾（輕量等級 4 倍）。代價很小
  const ANI = TIER === 'lite' ? 4 : renderer.capabilities.getMaxAnisotropy(), aniDone = new WeakSet()
  const sharpen = (root = scene) => root.traverse((o) => { const ms = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : []; for (const m of ms) for (const k in m) { const t = m[k]; if (t && t.isTexture && !aniDone.has(t) && !t.isRenderTargetTexture && !t.isDataTexture && t.anisotropy < ANI && t.minFilter !== THREE.NearestFilter) { aniDone.add(t); t.anisotropy = ANI; t.needsUpdate = true } } })
  for (const ms of [2500, 8000, 20000, 45000]) setTimeout(() => { lodSweep(); capTextures(); sharpen() }, ms)
  setTimeout(() => lodInit({ renderer, sun, hemi }), 1500)   // 遠景替身：等場景建好、進場後才開始烘
  const walkRoot = buildWalkways(scene, walkKit)   // 2026-11-11 吊橋橋面、橋頭平台、巨木林木棧道（Blender 零件）
  // 2026-11-10 果樹上的鳥：在掃描的雀榕（不含葉子）上，從上往下打射線找「上面有空間、左右各一段差不多水平的直枝」，
  // 要在朝步道那一側、離地 2.2～3.4 公尺（鏡頭退到 6 公尺外，看起來比較平視）；枝的方向盡量跟鏡頭方向垂直（看得到鳥的側面）
  if (plantLib.figtree) {
    const geos = parts(plantLib.figtree).filter((q) => !/leaves/.test(q.mat.name)).map((q) => { const c = q.geo.index ? q.geo.toNonIndexed() : q.geo.clone(); for (const k of Object.keys(c.attributes)) if (k !== 'position') c.deleteAttribute(k); return c })
    const figMesh = new THREE.Mesh(mergeGeometries(geos), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }))
    const ray = new THREE.Raycaster(), DOWN = new THREE.Vector3(0, -1, 0)
    for (const f of FIG_FORCED.filter((q) => q.def && q.T)) {
      const T = f.T, base = T.p.y
      figMesh.matrix.compose(T.p, T.q, T.s); figMesh.matrixWorld.copy(figMesh.matrix)
      const hitsAt = (x, z, top) => { ray.set(new THREE.Vector3(x, top, z), DOWN); ray.far = top - base; return ray.intersectObject(figMesh, false) }
      let ta = null
      for (let k = 0; k < 72; k++) { const a = k / 72 * Math.PI * 2, td = alpineTrailDist(f.x + Math.sin(a) * 8, f.z + Math.cos(a) * 8); if (!ta || td < ta.td) ta = { a, td } }
      const toCam = new THREE.Vector3(Math.sin(ta.a), 0, Math.cos(ta.a))
      let best = null; const cands = []
      for (const [h0, h1] of [[2.2, 3.4], [2.2, 4.4], [1.8, 5.5]]) {   // 低的枝優先；這棵樹低處沒有合適的枝才往上找
      if (cands.length) break
      for (let r = 0.6; r <= 3.6; r += 0.2) for (let da = -1.1; da <= 1.1; da += 0.08) {
        const a = ta.a + da, x = f.x + Math.sin(a) * r, z = f.z + Math.cos(a) * r
        const hs = hitsAt(x, z, base + 7)
        for (let i = 0; i < hs.length; i++) {
          const h = hs[i], hy = h.point.y
          if (hy - base < h0 || hy - base > h1) continue   // 低一點：人眼 1.6 公尺往上看，枝越高越會擋住鳥的身體
          if (i > 0 && hs[i - 1].point.y < hy + 0.35) continue   // 頭上要有空間
          const n = h.face.normal.clone().transformDirection(figMesh.matrixWorld); if (Math.abs(n.y) < 0.5) continue
          // 從步道那邊的鏡頭看得到：鏡頭（站點外 3.8 公尺、人眼高）到鳥身上（枝上 8 公分）之間不能有這棵樹的枝幹擋住
          { const eye = new THREE.Vector3(x + toCam.x * 6, base + 1.6, z + toCam.z * 6), tgt = new THREE.Vector3(x, hy + 0.08, z), dv = tgt.clone().sub(eye)
            ray.set(eye, dv.clone().normalize()); ray.far = dv.length() - 0.02; if (ray.intersectObject(figMesh, false).length) continue }
          for (let j = 0; j < 12; j++) {
            const b = j / 12 * Math.PI, u = new THREE.Vector3(Math.cos(b), 0, Math.sin(b))
            let L = 0, slope = 0
            for (const d of [0.08, 0.16, 0.24, 0.32, 0.4]) {
              const ok = [1, -1].map((sg) => { const q = hitsAt(x + u.x * d * sg, z + u.z * d * sg, hy + 0.3)[0]; return q && Math.abs(q.point.y - hy) < 0.05 + 0.25 * d ? q.point.y - hy : null })
              if (ok[0] == null || ok[1] == null) break
              L = d; slope = (ok[0] - ok[1]) / (2 * d)
            }
            if (L < 0.16) continue
            const side = Math.abs(u.x * toCam.z - u.z * toCam.x)   // 1＝跟鏡頭方向垂直
            const score = L * 3 + side * 1.2 - Math.abs(da) * 0.6 - Math.abs(hy - base - 2.5) * 0.8 - Math.abs(slope) * 2
            cands.push({ score, x, z, y: hy, u, L, slope })
          }
        }
      }
      }
      // 分數高的先試：整個場景（石頭、別的樹…）也不能擋在鏡頭和鳥之間；雀榕自己的葉子、透明的東西不算
      cands.sort((p, q) => q.score - p.score)
      scene.updateMatrixWorld(true)
      // 只拿這棵樹附近 12 公尺內的東西來測（整個場景一起打射線太慢，載入會卡住）；草、花這種幾百上千株的 InstancedMesh 不算
      const nearObjs = []
      scene.traverse((o) => {
        if (!o.isMesh || !o.visible || o === figMesh) return
        const m = o.material; if (!m || Array.isArray(m) || m.transparent || /leaves/.test(m.name ?? '')) return
        if (o.isInstancedMesh && o.count > 300) return
        if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere()
        if (!o.isInstancedMesh) { const c = o.geometry.boundingSphere.center.clone().applyMatrix4(o.matrixWorld), r = o.geometry.boundingSphere.radius * o.matrixWorld.getMaxScaleOnAxis(); if (Math.hypot(c.x - f.x, c.z - f.z) > 12 + r) return }
        nearObjs.push(o)
      })
      for (const c of cands.slice(0, 60)) {
        const eye = new THREE.Vector3(c.x + toCam.x * 6, base + 1.6, c.z + toCam.z * 6), tgt = new THREE.Vector3(c.x, c.y + 0.08, c.z), dv = tgt.clone().sub(eye)
        ray.set(eye, dv.clone().normalize()); ray.far = dv.length() - 0.05
        const blk = ray.intersectObjects(nearObjs, false)[0]
        if (!blk) { best = c; break }
      }
      if (!best) { console.warn('fig perch not found', f.def.id); best = cands[0]; if (!best) continue }
      const def = f.def
      def.perch = 'fig'; def.spot = [best.x, best.z]; def.figDir = [best.u.x, best.u.z]; def.figLen = Math.max(0.08, best.L - 0.06); def.figSlope = best.slope
      def.view = THREE.MathUtils.radToDeg(ta.a); def.figCamH = base + 1.6 - best.y; def.lookY = 0.08; def.dist = 6
      const b = placeDef({ ...def, y: best.y }); b.def = def
      birds.push(b)
    }
  }
  // 2026-11-10 神木上的鳥：從步道那一側朝神木中心打一條射線，打到樹皮的那一點就是鳥的位置、法線朝外（鳥背貼著樹、肚子朝樹皮）
  {
    const S = giantSpots().find((q) => q.sacred)
    if (S) {
      scene.updateMatrixWorld(true)
      let best = null
      for (let k = 0; k < 72; k++) { const a = k / 72 * Math.PI * 2, td = alpineTrailDist(S.x + Math.sin(a) * 9, S.z + Math.cos(a) * 9); if (!best || td < best.td) best = { a, td } }
      for (const def of BIRDS.filter((d) => d.perch === 'sacred' && !d.cliffRay)) {
        const a = best.a + (def.sacredTurn ?? 0), hy = S.y + 0.3 + (def.sacredH ?? 2.4)
        const ray = new THREE.Raycaster(new THREE.Vector3(S.x + Math.sin(a) * 12, hy, S.z + Math.cos(a) * 12), new THREE.Vector3(-Math.sin(a), 0, -Math.cos(a)), 0, 12)
        const hit = ray.intersectObject(giants.group ?? scene, true).find((h) => Math.hypot(h.point.x - S.x, h.point.z - S.z) < S.D)
        if (!hit) continue
        const n = hit.face ? hit.face.normal.clone().transformDirection(hit.object.matrixWorld) : new THREE.Vector3(Math.sin(a), 0, Math.cos(a))
        n.y = 0; n.normalize()
        def.spot = [hit.point.x, hit.point.z]; def.normal = [n.x, n.z]; def.view = THREE.MathUtils.radToDeg(best.a)   // 鏡頭還是在步道那一側；鳥繞到樹幹側邊（sacredTurn），看得到側面而不是只看到背
        const b = placeDef({ ...def, y: hit.point.y }); b.def = def
        birds.push(b)
      }
    }
  }
  // 2026-11-13 Pass 1D：岩壁上的鳥（def.cliffRay＝[x, y, z0]：從 z0 往 +z 打一條水平射線，打到岩壁網格 cliffFace 的那一點）
  // 黑雨燕（perch 'sacred' 直立）：直接貼在岩面上；遊隼（perch 'ground'）：岩面前長出一塊 1.6 m 寬、0.9 m 深的天然岩架讓牠站
  {
    const face = scene.getObjectByName('cliffFace')
    if (face) {
      scene.updateMatrixWorld(true)
      for (const def of BIRDS.filter((d) => d.cliffRay)) {
        const [rx, ry, rz] = def.cliffRay
        // 岩面不是平的（頁岩凹槽、上面懸出的岩簷、凹洞裡的掃描岩片）：鳥身那 1.2 m 高度範圍內每 0.2 m 打一條，取最前面那一點，鳥才不會躲在岩簷底下
        const solids = [face, scene.getObjectByName('cave')].filter(Boolean)
        const cast = (y) => new THREE.Raycaster(new THREE.Vector3(rx, y, rz), new THREE.Vector3(0, 0, 1), 0, 40).intersectObjects(solids, true).find((h) => h.object.isMesh && !h.object.material.transparent)
        const hit = cast(ry)
        if (!hit) continue
        let zFront = hit.point.z
        for (let dy = 0.2; dy <= 1.21; dy += 0.2) { const h2 = cast(ry + dy); if (h2 && Math.abs(h2.point.z - hit.point.z) < 3) zFront = Math.min(zFront, h2.point.z) }
        const back = hit.point.z - zFront   // 鳥站的地方比上面的岩面凹進去多少
        const n = hit.face ? hit.face.normal.clone().transformDirection(face.matrixWorld) : new THREE.Vector3(0, 0, -1)
        n.y = 0; if (n.lengthSq() < 1e-4) n.set(0, 0, -1); n.normalize(); if (n.z > 0) n.negate()   // 朝外（往 -z）
        if (def.perch === 'sacred') {
          if (back > 0.15) continue   // 貼壁的鳥：那一點上面還有東西擋著，就不擺（設定的點要選平的岩面）
          def.spot = [hit.point.x, hit.point.z]; def.normal = [n.x, n.z]
          const b = placeDef({ ...def, y: hit.point.y }); b.def = def; birds.push(b)
        } else {
          const ledge = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 3), face.material)
          { const P = ledge.geometry.attributes.position, v = new THREE.Vector3(); for (let i = 0; i < P.count; i++) { v.fromBufferAttribute(P, i); const k = 1 + 0.1 * Math.sin(v.x * 7.1 + v.z * 5.3) * Math.cos(v.y * 6.2) + 0.05 * Math.sin(v.x * 17.0 - v.y * 13.0); if (v.y > 0) v.y *= 0.25 + 0.05 * Math.sin(v.x * 9.0); P.setXYZ(i, v.x * k, v.y * k, v.z * k) } ledge.geometry.computeVertexNormals() }
          { const P = ledge.geometry.attributes.position, c = new Float32Array(P.count * 3); for (let i = 0; i < P.count; i++) { const k = 0.36 + 0.05 * Math.sin(i * 12.9898); c[i * 3] = k * 1.1; c[i * 3 + 1] = k; c[i * 3 + 2] = k * 0.85 } ledge.geometry.setAttribute('color', new THREE.BufferAttribute(c, 3)) }   // 岩壁材質吃頂點色：沒給會全黑
          const ls = def.nest ? 0.32 : 1   // 雨燕只要一個小小的岩縫平台
          const dz = (0.55 + back / 2) * (def.nest ? 0.6 : 1)   // 岩架從岩壁裡一直伸到上面岩簷的前緣外面
          ledge.scale.set(0.85 * ls, 0.6 * ls, dz); ledge.rotation.y = Math.atan2(n.x, n.z)
          ledge.position.set(hit.point.x, hit.point.y - 0.02 + (def.nest ? 0.13 - 0.15 * ls : 0), hit.point.z - dz + 0.35); ledge.castShadow = ledge.receiveShadow = true; ledge.name = 'falconLedge'; scene.add(ledge)
          def.spot = [hit.point.x, zFront - (def.nest ? 0.2 : 0.4)]
          if (def.nest) {   // 黑雨燕的巢：岩架上一個苔蘚、細根做的淺杯（直徑約 15 cm），鳥伏坐在裡面
            const moss = new THREE.MeshStandardMaterial({ color: 0x2e3320, roughness: 1 }), rim = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.025, 8, 22).rotateX(Math.PI / 2), moss)
            const bed = new THREE.Mesh(new THREE.CircleGeometry(0.08, 16).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x2c3319, roughness: 1 }))
            rim.position.set(def.spot[0], hit.point.y + 0.125, def.spot[1]); bed.position.set(def.spot[0], hit.point.y + 0.11, def.spot[1]); rim.castShadow = true; scene.add(rim, bed)
          }
          const b = placeDef({ ...def, y: hit.point.y + 0.13 }); b.def = def; birds.push(b)
        }
      }
    }
  }
  // 串流載入：還沒有模型的鳥（pending）一隻隻補上——每次挑離鏡頭最近的，三個下載並行；載到就蓋、通知遊戲（驚飛、出沒時段要接上）
  const streamState = { total: 0, left: 0, done: null }
  function streamBirds({ onReady, late } = {}) {
    const pend = birds.filter((b) => b.pending), busy = new Set()
    streamState.total = streamState.left = pend.length
    // 2026-11-12 使用者：稀有的鳥讀完再飛進來——late(b) 的鳥排在最後（附近 40 m 內的普通鳥都載完才輪到），載好由遊戲那邊讓牠飛進場
    const next = () => { let best = null, bd = BIRD_RANGE; for (const b of pend) { if (busy.has(b)) continue; const d0 = b.target.distanceTo(camera.position); if (d0 >= BIRD_RANGE) continue; const d = d0 + (late?.(b) ? 400 : 0); if (!best || d < bd) { bd = d; best = b } } return best }   // mid／lite：只載 BIRD_RANGE 內的，走近才載
    const finishOne = async (b) => {
      for (let k = 0; k < 6 && b.pending; k++) {
        await Promise.all(modelsFor(b.def.id).map(ensureModel))
        if (b.need) await ensureModel(b.need)
        if (b.need && modelFailed(b.need)) { console.warn('[stream] 缺模型，這隻鳥不會出現', b.def.id, b.need); return false }
        await new Promise((r) => setTimeout(r, 0))   // 讓出一格再蓋（複製骨架、算大小要幾十毫秒）
        try { b.finish() } catch (e) { if (!(e instanceof MissingModel)) { console.error('[stream]', b.def.id, e); return false } b.need = e.model }
      }
      if (b.pending) return false
      b.shown = undefined
      renderer.compileAsync?.(b.group, camera, scene).catch(() => {})   // 著色器先在背景編好，第一次看到牠才不會頓一下
      return true
    }
    const inRange = () => pend.filter((b) => b.target.distanceTo(camera.position) < BIRD_RANGE).length
    const work = async () => { while (pend.length) { const b = next(); if (!b) { streamState.left = inRange(); await new Promise((r) => setTimeout(r, 1200)); continue } busy.add(b); const ok = await finishOne(b); pend.splice(pend.indexOf(b), 1); busy.delete(b); streamState.left = inRange(); if (ok) { capTextures(b.group); onReady?.(b) } } }
    streamState.done = Promise.all([work(), work(), work()]).then(() => { streamState.left = 0 })
    return streamState.done
  }
  const _forestFog = new THREE.Color()   // 阿里山／紅杉林那種巨木林帶（步道中段）   // 右邊岔路上去的營地（三頂帳篷＋營火）
  const halls = COAST_ON ? createHalls({ scene, sun, halls: [createCoast({ scene })] }) : { tick() {}, prebuild: async () => {}, halls: [], mode: 'D' }
  const birdStops = birds.filter((b) => !b.def.extra).map((b) => ({
    bird: b, title: b.def.name, nick: b.def.nick, sci: b.def.sci, tag: b.def.where, text: b.def.intro, facts: b.def.facts,
    pos: b.cam, target: b.target,
  }))
  // 地上的鳥：空地要大到鏡頭那邊也沒有花草擋在最前面
  const reserve = [...birds.map((b) => ({ x: b.def.spot[0], z: b.def.spot[1], r: b.def.perch === 'branch' ? 4 : Math.max(2.6, (b.def.dist ?? 0) + 0.8) })), ...extraReserve]
  const flora = buildFlora(scene, plantLib, { stopsFor: (h) => [...buildStops(h), ...birdStops], reserve, woodKit: hideKit })
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
  const _sd = new THREE.Vector3()
  function tick(t, dt, { phone = false } = {}) {
    lodUpdate(camera)
    halls.tick(t, dt, camera)
    if (halls.mode.endsWith('D')) {   // 陰影範圍跟著玩家（在館內時由 halls.js 指定館的中心）
      const gx = Math.round(camera.position.x / 24) * 24, gz = Math.round(camera.position.z / 24) * 24
      if (sun.target.position.x !== gx || sun.target.position.z !== gz) {
        _sd.subVectors(sun.position, sun.target.position)
        sun.target.position.set(gx, 0, gz); sun.position.copy(sun.target.position).add(_sd)
      }
    }
    alpine.animate(t, dt, camera)
    windUniforms.uTime.value = t
    waterTime.value = t
    pondRipples(t)
    foliageTime.value = t
    // 2026-11-10 玩家回饋「好卡」：每隻鳥的模型 3～4 萬個三角形，以前遠到只剩一個點也照畫（一個畫面幾百萬個三角形）。
    // 在畫面上不到 3 像素高的鳥不畫（照鏡頭焦距算：長鏡頭拉近時遠的鳥照樣畫出來）；藏的是鳥底下那層，不跟驚飛、出現時段的開關打架
    const pxK = renderer.domElement.clientHeight / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)))
    for (const b of birds) {
      const d = b.target.distanceTo(camera.position), show = (b.size ?? 0.3) * pxK / Math.max(d, 0.1) > 3
      if (b.shown !== show) { b.shown = show; for (const m of b.built.birds ?? [b.built]) for (const ch of m.obj.children) ch.visible = show }
      if (!b.absent && d < 70) b.update(t, dt, phone)
    }
    water.mist.update(dt, camera)
    time?.tick(t, dt)
    cloudSea.tick(t, camera, { day: dayLight.value })
    camp.tick(t, dt, { day: dayLight.value })
    pondLife.tick(t, dt)
    yose.tick(t)
    streambedTick(t)
    giants.tick(t, camera, { day: dayLight.value })
    weather.tick(t, dt)
    {
      // 走進巨木林：樹冠把天空遮住，林下比較暗、帶一點藍綠色的霧（天氣每格都會把燈光重設，所以這裡乘上去不會累積）
      const fk = giants.inside(camera)
      if (fk > 0.001) {
        hemi.intensity *= 1 - 0.42 * fk
        scene.environmentIntensity *= 1 - 0.5 * fk
        scene.fog.density *= 1 + 0.9 * fk
        const l = scene.fog.color.r * 0.3 + scene.fog.color.g * 0.5 + scene.fog.color.b * 0.2
        scene.fog.color.lerp(_forestFog.setRGB(l * 0.62, l * 0.78, l * 0.72), 0.6 * fk)
      }
    }
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
  const quality = { reflScale: PHONE ? 0.3 : 1, reflEvery: PHONE ? 3 : 2, dof: !PHONE }   // dof：遠景柔焦（settings.js 照畫質等級開關）
  { const r0 = water.reflect; water.reflect = (...args) => { r0(...args); alpine.wetMirror?.reflect(...args) } }   // 2026-11-11 濕地的鏡面倒影跟花園水池一起更新（拍照、預熱那兩處也是呼叫 water.reflect）
  const shadows = createShadowCache({ renderer, scene, sun, camera })
  let lastR = performance.now()
  // 2026-11-12 遠景柔焦（使用者：遠處應該像人眼一樣圓的、看不清楚，但不是低模）：場景先畫到一張 HDR 暫存圖（含深度），
  // 再用一次全螢幕處理——110 m 以內清楚、到 320 m 越來越糊（最多約 1.3 像素，照畫面高度換算），天空也一起柔化。
  // 只拿「本身也在遠處」的取樣點來平均：近處的樹幹、鳥不會被抹進背景，背景也不會滲進近物的邊緣（沒有光暈）。
  // 長鏡頭拉近時門檻照放大倍率往遠推（600 mm 約 20 倍＝1.8 km 才開始糊），拍遠處的鳥不受影響。畫質低的等級關掉（多一張全解析度暫存圖、一次全螢幕處理）
  const post = { rt: null, scene: new THREE.Scene(), cam: new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), mat: null, size: new THREE.Vector2() }
  post.mat = new THREE.ShaderMaterial({
    uniforms: { tColor: { value: null }, tDepth: { value: null }, cn: { value: 0.1 }, cf: { value: 1000 }, f0: { value: 90 }, f1: { value: 260 }, maxR: { value: 2 }, res: { value: new THREE.Vector2(1, 1) } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: `#include <packing>
      uniform sampler2D tColor, tDepth; uniform float cn, cf, f0, f1, maxR; uniform vec2 res; varying vec2 vUv;
      float coc(vec2 uv) { float d = texture2D(tDepth, uv).x; float z = d >= 0.99999 ? 1e5 : -perspectiveDepthToViewZ(d, cn, cf); return smoothstep(f0, f1, z); }
      void main() {
        vec4 c0 = texture2D(tColor, vUv); float k = coc(vUv);
        if (k > 0.01) {
          vec3 acc = c0.rgb; float w = 1.0; float r = k * maxR;   // 暫存圖已經是 sRGB 編碼（接近眼睛感受的亮度），直接平均
          for (int i = 0; i < 12; i++) {
            float a = float(i) * 2.39996, rr = sqrt((float(i) + 0.5) / 12.0) * r;
            vec2 uv = vUv + vec2(cos(a), sin(a)) * rr / res;
            float ws = coc(uv);
            acc += texture2D(tColor, uv).rgb * ws; w += ws;
          }
          c0.rgb = acc / w;
        }
        gl_FragColor = vec4(c0.rgb, 1.0);   // 暫存圖裡已經是螢幕上的顏色（色調映射、sRGB 都做過了，見下面 isXRRenderTarget），原樣輸出
      }`,
    depthTest: false, depthWrite: false, toneMapped: false,
  })
  { const q = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), post.mat); q.frustumCulled = false; post.scene.add(q) }
  function render(cam = camera) {
    const now = performance.now(); shadows.update(Math.min(0.1, (now - lastR) / 1000)); lastR = now
    water.reflect(renderer, scene, cam, quality.reflScale, quality.reflEvery)
    if (!quality.dof || renderer.getRenderTarget() || !cam.isPerspectiveCamera) { renderer.render(scene, cam); return }
    renderer.getDrawingBufferSize(post.size)
    if (!post.rt || post.rt.width !== post.size.x || post.rt.height !== post.size.y) {
      post.rt?.dispose(); post.rt?.depthTexture?.dispose()
      post.rt = new THREE.WebGLRenderTarget(post.size.x, post.size.y, { type: THREE.HalfFloatType, samples: 4, depthTexture: new THREE.DepthTexture(post.size.x, post.size.y) })
      // 暫存圖存 sRGB 編碼過的顏色（跟畫到螢幕一樣）：半透明的霧、雲是在 sRGB 上疊的。存線性的話霧疊起來比較濃，遠山整片變淡變灰。
      // 一定要明確設：XR 那條路的輸出色彩空間就是這個，空的會讓著色器編不起來（整個遊戲黑掉）。半浮點的格式不會被硬體再轉一次
      post.rt.texture.colorSpace = THREE.SRGBColorSpace
    }
    // 畫的那一刻把暫存圖標成「XR」：three 就照畫到螢幕時一樣，每個材質自己決定做不做色調映射（輸出色彩空間跟著暫存圖＝線性，sRGB 留到最後一步）。
    // 第一版畫成 HDR 再統一做色調映射：天空這種沒有色調映射的著色器被多做一次，天空變灰變淡。標記不能一直開著（建立時開著會被當成外部的 XR 畫面，整張黑）
    renderer.setRenderTarget(post.rt); post.rt.isXRRenderTarget = true
    try { renderer.render(scene, cam) } finally { post.rt.isXRRenderTarget = false }
    renderer.setRenderTarget(null)
    const U = post.mat.uniforms, zoom = Math.max(1, Math.tan(THREE.MathUtils.degToRad(31)) / Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)))
    U.tColor.value = post.rt.texture; U.tDepth.value = post.rt.depthTexture; U.cn.value = cam.near; U.cf.value = cam.far
    U.f0.value = 110 * zoom; U.f1.value = 320 * zoom; U.maxR.value = 1.3 * post.size.y / 1080;   /* ChatGPT：1080p 下最多 1.0～1.5 像素 */ U.res.value.copy(post.size)
    renderer.render(post.scene, post.cam)
  }
  const groundAt = (x, z) => inAlpine(x, z) ? alpineHeight(x, z) : terrainHeight(x, z)   // 相機對焦用（camera.js aim）
  return { groundAt, memStat, streamBirds, streamState, renderer, scene, camera, sun, hemi, birds, flora, water, clouds, tick, render, time, weather, quality, plantLib, halls, alpine, shadows }   // plantLib：相機行的植物牆、花槽也用同一批寫實植物
}

/* ---------- 日夜 ---------- */
// setTime(時)：0～24。太陽從東邊升起（6 點）、西邊落下（18 點）；太陽下山後換成月光（偏藍、很弱）。
// 天空、霧、半球光、環境反射一起變暗；不受光的東西（水霧、雲、瀑布的自發光）跟著 dayLight 暗下來。
// 路燈：dayLight 掉到一半以下就亮。燈頭自發光＋一圈光暈；離玩家最近的幾盞放真的點光源（地上一圈光），全部都放太吃效能。
// 池邊、草叢有螢火蟲，只有晚上看得到。
const C = (h) => new THREE.Color(h)
const SKY_D = C(0xdcecf5), SKY_N = C(0x24304c), GND_D = C(0x5d6e44), GND_N = C(0x0b0e0a)
const FOG_D = C(0xc9d8d6), FOG_K = C(0xd8b39a), FOG_N = C(0x0b111b)
// 2026-11-11 夕陽（ChatGPT 濕地黃金時刻，linear RGB）：天光偏藍紫、地面反光暖褐、霧偏灰粉（不要整個場景都橘）
const DUSK_SKY = new THREE.Color().setRGB(0.52, 0.56, 0.72), DUSK_GND = new THREE.Color().setRGB(0.2, 0.14, 0.1), DUSK_FOG = new THREE.Color().setRGB(0.43, 0.36, 0.36)
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
    sunDir.set(Math.cos(a) * 0.8, Math.sin(a) * 0.85, -0.3).normalize()   // 2026-11-11 太陽改成東邊（中央山脈那側）升起、西南邊落下：台灣的夕陽在西邊；以前落在東邊高山後面，濕地看不到夕陽
    const day = ss(sunDir.y, -0.14, 0.28), dusk = ss(sunDir.y, -0.2, 0.0) * (1 - ss(sunDir.y, 0.05, 0.32))
    st.day = day; dayLight.value = day; duskLight.value = dusk
    skyMat.uniforms.sunDir.value.copy(sunDir); sunDirU.value.copy(sunDir)
    skyMat.uniforms.moonDir.value.copy(MOON_DIR)
    // 太陽／月光：同一盞平行光，太陽下山後轉向月亮
    // 2026-11-11 使用者：太陽出來的光要很漂亮（ChatGPT 光照 V2，linear RGB）：正午 3.0、上午／下午 2.6～2.8；
    // 顏色照太陽高度：黃金時刻 (1, .43, .20) → 上午 (1, .88, .72) → 正午 (1, .96, .88)；天光 1.65、環境 0.75（樹幹背光面不要黑）
    const sunI = 3.0 * ss(sunDir.y, -0.03, 0.12) * (0.67 + 0.33 * ss(sunDir.y, 0.12, 0.6))   /* 2026-11-11 夕陽（太陽高 5～7°）還有 2.0：低角度的暖光、長影子才出得來（以前 0.8，一片灰） */, moonI = 0.32 * (1 - day)
    sun.position.copy(sun.target.position).addScaledVector(sunI > moonI ? sunDir : MOON_DIR, 100)
    sun.intensity = sunI + moonI
    if (sunI > moonI) { const e1 = ss(sunDir.y, 0.0, 0.35), e2 = ss(sunDir.y, 0.35, 0.8); sun.color.setRGB(1, lerp(lerp(0.43, 0.88, e1), 0.96, e2), lerp(lerp(0.2, 0.72, e1), 0.88, e2)) }
    else sun.color.copy(MOON)
    hemi.intensity = lerp(0.22, 1.65, day) * (1 - 0.3 * dusk)   // 黃昏：逆光的樹要暗成剪影（天光太亮整片樹都是亮綠）
    hemi.color.copy(SKY_N).lerp(SKY_D, day).lerp(DUSK_SKY, dusk * 0.7)
    hemi.groundColor.copy(GND_N).lerp(GND_D, day).lerp(DUSK_GND, dusk * 0.6)
    scene.environmentIntensity = lerp(0.05, 0.75, day)
    scene.fog.color.copy(FOG_N).lerp(FOG_D, day).lerp(DUSK_FOG, dusk * 0.75)
    // 晚上、清晨起霧（2026-11-07）：清晨 6 點最濃，9 點前散掉；晚上 9 點後到天亮一直有霧
    const hh = st.hour, morning = Math.exp(-(((hh - 6.2) / 1.5) ** 2)), night = Math.max(ss(hh, 19, 21.5), 1 - ss(hh, 3.5, 6)) * 0.75   // three 的 smoothstep 是 (x, min, max)
    const mk = Math.min(1, Math.max(morning, night)); mistLevel.value = mk
    scene.fog.density = FOG_D0 * (1 + 0.75 * mk)
    for (const c of clouds) c.material.opacity = c.userData.op0 * (1 + 1.4 * mk)
    // 晚上眼睛會適應：曝光拉高一點，不然整片黑什麼都看不到
    renderer.toneMappingExposure = lerp(1.7, 1.05, day) - 0.28 * dusk
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
