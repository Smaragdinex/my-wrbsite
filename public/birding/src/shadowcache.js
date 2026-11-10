// 太陽陰影快取：以前每一格都把整片陰影重畫一次（溫室全景約佔畫面時間的 45%）。
// 現在陰影貼圖畫好就留著用，只有這些時候才重畫：
//   1. 太陽（或月亮）方向轉了超過 MOVE_DEG（遊戲裡一天 24 分鐘，大約每 1 秒一次）
//   2. 鏡頭附近、看得到的地方有「會動的東西」在投影（鳥、老闆、自動門）：最多每秒 RATE_DYN 次
//   3. 換陰影畫質（貼圖重建）、或外部呼叫 dirty()
// 為什麼要另外一台鏡頭：植物 LOD（lod.js）只留鏡頭看得到的那幾株，轉頭就換一批，
// 畫好的陰影會少掉「剛才在畫面外」的樹影。所以陰影改在另一次 render 裡畫：
// 那次 render 的鏡頭只開 SHADOW_LAYER，所有投影的東西都加進這一層；LOD 管的植物在這一層放一份完整、不剔除的替身。
// three.js 的陰影 pass 用「呼叫 render 的那台鏡頭」的 layers 篩選，主畫面那台鏡頭沒開這一層，替身不會出現在畫面上。
import * as THREE from 'three'
import { lodShadowProxies, lodShadowCull } from './lod.js'

export const SHADOW_LAYER = 5
const MOVE_DEG = 0.6, RATE_DYN = 30, NEAR_DYN = 30, RESCAN = 2

export function createShadowCache({ renderer, scene, sun, camera }) {
  sun.shadow.autoUpdate = false
  // 畫陰影用的鏡頭：視野只有一點點、朝地底下看，主畫面這次 render 幾乎什麼都不畫（只有 frustumCulled=false 的投影物件）
  const cam = new THREE.OrthographicCamera(-1e-3, 1e-3, 1e-3, -1e-3, 0.1, 0.2)
  cam.position.set(0, -9000, 0); cam.lookAt(0, -9001, 0); cam.updateMatrixWorld()
  cam.layers.set(SHADOW_LAYER)
  const rt = new THREE.WebGLRenderTarget(1, 1)
  const lastDir = new THREE.Vector3(), dir = new THREE.Vector3(), lastTgt = new THREE.Vector3(1e9, 0, 0)
  const cosMove = Math.cos(THREE.MathUtils.degToRad(MOVE_DEG))
  let dirty = true, scanT = 1e9, dynT = 0, lastSize = 0
  let movers = []   // [mesh, 上次的 matrixWorld]
  const stats = { updates: 0, why: '', mover: null }
  const _fr = new THREE.Frustum(), _pm = new THREE.Matrix4(), _s = new THREE.Sphere()

  // 把會投影、主畫面看得到的東西都放進陰影層；記下不是 InstancedMesh 的（可能會動），用來偵測移動
  // 有骨架動畫的模型（鳥、老闆）：不投太陽影子。2026-11-07 逐一量過：地面的陰影是烘焙的、不接即時陰影，
  // 鳥停在地上／樹上、老闆在有屋頂的店裡，開關它們的影子畫面像素差 0～0.1%（肉眼看不出來），
  // 但它們一直在動，留著影子就得幾乎每格重畫陰影。圖鑑（guide.js）是另一個場景、自己的光，不受影響。
  const noSun = (o) => o.isSkinnedMesh || /_rig$/.test(o.name) || o.name === 'Armature'
  function scan() {
    lodShadowProxies()
    const list = []
    scene.traverse((o) => { if (noSun(o)) o.traverse((c) => { c.castShadow = false }) })
    scene.traverse((o) => {
      if (!(o.isMesh || o.isPoints || o.isLine) || !o.castShadow) return
      if (o.userData.lodManaged) return                 // LOD 管的植物：由替身投影
      if (!o.userData.shadowProxy && !o.layers.test(camera.layers)) return   // 手和相機（viewmodel 的 layer 3）本來就不投影
      o.layers.enable(SHADOW_LAYER)
      if (!o.isInstancedMesh) list.push(o)
    })
    const prev = new Map(movers)
    movers = list.map((o) => [o, prev.get(o) || o.matrixWorld.clone()])
  }

  function movingNear(dt) {
    _pm.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse); _fr.setFromProjectionMatrix(_pm)
    const zoom = Math.max(1, 31 / Math.max(1, camera.fov)), near2 = (NEAR_DYN * zoom) ** 2
    const cp = camera.position
    let hit = false
    for (const pair of movers) {
      const [o, m0] = pair, m = o.matrixWorld.elements, e = m0.elements
      let moved = false
      if (!moved) for (let i = 0; i < 15; i++) if (Math.abs(m[i] - e[i]) > 1e-4) { moved = true; break }
      if (!moved || hit) continue
      m0.copy(o.matrixWorld)
      // 看不到的不算（祖先藏起來、太遠、在畫面外）
      let p = o, vis = true
      while (p) { if (!p.visible) { vis = false; break } p = p.parent }
      if (!vis) continue
      const dx = m[12] - cp.x, dy = m[13] - cp.y, dz = m[14] - cp.z
      if (dx * dx + dy * dy + dz * dz > near2) continue
      _s.center.set(m[12], m[13], m[14]); _s.radius = 4   // 影子會落在東西旁邊：多留一點邊
      if (!_fr.intersectsSphere(_s)) continue
      hit = true; stats.mover = o
    }
    // 沒算到的（hit 之後跳過的）下次再比：先把剩下的也記成現在的位置，避免下一格全部「動了」
    if (hit) for (const pair of movers) pair[1].copy(pair[0].matrixWorld)
    return hit
  }

  function update(dt) {
    if ((scanT += dt) > RESCAN) { scanT = 0; scan() }
    dynT += dt
    let why = ''
    const size = sun.shadow.mapSize.x
    if (dirty || !sun.shadow.map || size !== lastSize || sun.target.position.distanceToSquared(lastTgt) > 1) why = 'init'   // 換館時陰影範圍會搬家（halls.js）
    dir.subVectors(sun.position, sun.target.position).normalize()
    if (!why && dir.dot(lastDir) < cosMove) why = 'sun'
    const dyn = movingNear(dt)
    if (!why && dyn && dynT >= 1 / RATE_DYN) why = 'dyn'
    if (!why) return false
    if (why === 'init') scan()
    dirty = false; lastSize = size; lastDir.copy(dir); lastTgt.copy(sun.target.position); dynT = 0
    sun.shadow.needsUpdate = true
    { const C = sun.shadow.camera; lodShadowCull(sun.target.position.x, sun.target.position.z, Math.max(Math.abs(C.left), Math.abs(C.right), Math.abs(C.top), Math.abs(C.bottom)) * 1.45 + 8) }
    const prevRT = renderer.getRenderTarget(), auto = renderer.shadowMap.autoUpdate
    renderer.shadowMap.autoUpdate = true
    renderer.setRenderTarget(rt); renderer.render(scene, cam); renderer.setRenderTarget(prevRT)
    renderer.shadowMap.autoUpdate = auto
    stats.updates++; stats.why = why
    return true
  }

  return { update, dirty: () => { dirty = true }, stats, layer: SHADOW_LAYER }
}
