// 植物 LOD：以前每一株、每一片草不管在哪都照畫（看任何方向都畫整個溫室，約 2,400 萬個三角形）。
// 1. 一般的 InstancedMesh（plants.js 的 scatter、flora.js 的 makeInst）：每隔幾格（鏡頭有動才做）逐株檢查——
//    在視野外（留一點邊，畫面外的植物影子才不會突然消失）就不畫；地面上矮的植物越遠越稀疏、太遠就不畫；
//    大樹、長在山上的（y > 2.5，遠景主角，第一版把整座山的植物都弄不見了）永遠不稀疏。
//    看得到的那幾株的矩陣擠到最前面、count 設成那麼多：繪製次數不變。
// 2. 草葉：切成一塊一塊（每塊自己的範圍，視野外整塊不畫），塊裡的草先打亂順序，越遠 instanceCount 越少＝越稀。
// 距離都照鏡頭變焦換算：長焦望遠看遠處時，遠處的植物在畫面上很大，不能變稀。
import * as THREE from 'three'
import { dayLight } from './structures.js'

const WALK_FOV = 62
const sets = [], grass = []
const _fr = new THREE.Frustum(), _pm = new THREE.Matrix4(), _c = new THREE.Vector3()
const last = { p: new THREE.Vector3(1e9, 0, 0), q: new THREE.Quaternion(), fov: 0 }
export const lodStats = { instances: 0, drawn: 0, grass: 0, grassDrawn: 0 }
// 自動畫質（settings.js）會調這個：所有 LOD 距離乘上它（1＝原本、0.5＝一半的距離就開始變稀）
export const lodQuality = { scale: 1 }
export const lodSetScale = (k) => { if (Math.abs(lodQuality.scale - k) > 1e-3) { lodQuality.scale = k; last.fov = 0 } }

// meshes：共用同一份擺放清單的 InstancedMesh（一種植物的各個材質）；h：這種植物大概多高（公尺）
// lows：（可選）跟 meshes 一一對應的低面數版本（plants.js 的 lowGeo），沒有的放 null；遠處的株改畫低面數版本
export function lodRegister(meshes, h, lows = [], { solid = false, auto = false } = {}) {
  const keep = meshes.map((m, i) => m?.isInstancedMesh && m.count > 0 ? i : -1).filter((i) => i >= 0)
  meshes = keep.map((i) => meshes[i]); lows = keep.map((i) => lows[i] ?? null)
  // 2026-11-14 FPS：自己建的 InstancedMesh（石頭一顆 2.6 萬面、岩廊牆、樹）以前沒有低面數版本，多遠都畫原本的 → 這裡自動用 meshoptimizer 減面補一份（plants.js lowGeo）
  lows = lows.map((lo, i) => lo ?? autoLow(meshes[i]))
  if (!meshes.length) return
  const m0 = meshes[0], n = m0.count
  // 每株自己做視野剔除：整組的 three.js 剔除關掉（它的包圍球被 LOD 改過 count 之後會過時，整組被誤判在視野外、全部不畫）
  for (const m of [...meshes, ...lows]) if (m) { if (!m.boundingSphere) m.computeBoundingSphere(); m.userData.fullSphere ??= m.boundingSphere.clone(); m.frustumCulled = false }
  const base = m0.instanceMatrix.array.slice(0, n * 16)
  const pos = new Float32Array(n * 3), rad = new Float32Array(n), hash = new Float32Array(n)
  const g = m0.geometry
  if (!g.boundingSphere) g.computeBoundingSphere()
  const gs = g.boundingSphere
  const m4 = new THREE.Matrix4(), s = new THREE.Vector3()
  for (let i = 0; i < n; i++) {
    m4.fromArray(base, i * 16)
    _c.copy(gs.center).applyMatrix4(m4); pos.set([_c.x, _c.y, _c.z], i * 3)
    s.setFromMatrixScale(m4); rad[i] = gs.radius * Math.max(s.x, s.y, s.z)
    hash[i] = ((Math.sin(i * 12.9898 + n * 0.731) * 43758.5453) % 1 + 1) % 1
    if (solid || _c.y > 2.5) hash[i] = -1   // solid：石階、欄杆、蘆葦叢這種不能東缺一塊的（只做視野外、太遠太小不畫）。長在山上（離地面高）的植物是遠景的主角，從哪裡都看得到：不變稀，只做視野外不畫
  }
  const cols = meshes.map((m) => m.instanceColor ? m.instanceColor.array.slice(0, n * 3) : null)
  // 矮的（蕨類、地被）14～40 公尺開始變稀、更遠就不畫；4 公尺以上的樹只做視野外不畫
  // 2026-11-13 使用者「草可以遠一點都先畫嗎，不然靠近才出現很怪」：矮植物 14 m 開始變稀、32 m 不畫 → 30 m 開始變稀、80 m 才全部不畫
  const d0 = Math.max(30, h * 30), d1 = h >= 4 || solid ? Infinity : Math.max(80, h * 90)
  if (!solid || auto) for (const m of [...meshes, ...lows]) if (m?.castShadow) m.userData.lodManaged = true   // auto：自動登記的（石頭、岩廊牆）影子也交給替身，轉頭時畫面外的影子不會不見   // 陰影由 lodShadowProxies 的替身負責（shadowcache.js）
  // 換成低面數的距離：一公尺的蕨類 10 公尺外、越高的越遠才換（長焦時照變焦倍率拉遠）
  // 2026-11-12 使用者：遠景的樹看起來是板狀的低模——「應該像人眼一樣：圓的、看不清楚，但不是低模」→ 4 m 以上的樹換低面數版本的距離拉遠一倍多（20 m 的樹 200 m → 440 m）
  const dL = h >= 4 ? h * 12 : Math.max(10, h * 10)   // 4 m 以上：120～150 m 外換輕量版（冷杉的輕量版也是立體樹冠，不是板）
  const S0 = { meshes, lows, n, base, cols, pos, rad, hash, d0, d1, dL, vis: new Uint32Array(n), far: new Uint8Array(n), scl: new Float32Array(n), proxies: null, auto }
  sets.push(S0)
  // 2026-11-12 遠景替身（ChatGPT：3A 遊戲的遠景不是整片烘成一張圖，是遠處的樹換成「多角度替身貼片」）：
  // 4 m 以上的樹，遠到在畫面上不到 IMP_PX 像素高的那幾棵不畫模型，改畫一片面向鏡頭的貼片（2 個三角形），貼圖是這種樹從 8 個方向拍下來的（第一次用到時烘）。
  // 一棵冷杉 1,000～5,000 個三角形 → 2 個；所以遠處的樹不用再變稀（以前 230～330 m 之間抽掉），整片森林都在
  // 2026-11-12 使用者：「還是用原本的吧，遠景根本糊掉。讓玩家載入久一點是可以的」——替身貼片在他的螢幕上是一塊塊方形（貼圖的透明邊沒去乾淨、解析度也不夠）→ 關掉，遠處照舊畫真的樹
  if (IMP_ON && h >= 4 && !solid && n >= 12 && typeof document !== 'undefined') {
    const org = new Float32Array(n * 3), sz = new Float32Array(n * 4), p3 = new THREE.Vector3(), q4 = new THREE.Quaternion(), e3 = new THREE.Euler()
    const bb = new THREE.Box3(); for (const m of meshes) { if (!m.geometry.boundingBox) m.geometry.computeBoundingBox(); bb.union(m.geometry.boundingBox) }
    const R = Math.max(-bb.min.x, bb.max.x, -bb.min.z, bb.max.z)
    for (let i = 0; i < n; i++) { m4.fromArray(base, i * 16); m4.decompose(p3, q4, s); e3.setFromQuaternion(q4, 'YXZ'); org.set([p3.x, p3.y, p3.z], i * 3); sz.set([R * Math.max(s.x, s.z), bb.min.y * s.y, bb.max.y * s.y, e3.y], i * 4) }
    S0.imp = { org, sz, R, y0: bb.min.y, y1: bb.max.y, idx: new Uint32Array(n), mesh: null, hM: (bb.max.y - bb.min.y) }
  }
  lodStats.instances += n * meshes.length
  last.fov = 0   // 下一格強制更新
}

// 2026-11-14 使用者「修正 FPS 問題，讓他有 60 FPS 以上」：量出來每格畫 1,100 萬～3,500 萬個三角形——石頭（一顆 2.6 萬面）、岩廊牆、石橋砌石、巨木林、山頂這些
// InstancedMesh 沒有登記 LOD，在 200 m 外照樣整批畫。這裡自動把「不會動、面數夠多、還沒登記」的 InstancedMesh 交給上面同一套 LOD（solid：不變稀，只做視野外／太遠太小不畫）。
// 會動的（魚、鳥、燈火…自己每格改矩陣的）不能交：第一次看到先記矩陣的指紋，隔 2 秒以上再看一次，沒變才登記
const _auto = new WeakMap(), _seen = new WeakSet()
const _fp = (m) => { const a = m.instanceMatrix.array, n = Math.min(a.length, m.count * 16); let h = m.count * 7.13; for (let i = 0; i < n; i += 13) h += a[i] * ((i % 97) + 1); return h }
export function lodAutoRegister(scene, now = performance.now()) {
  if (typeof location !== "undefined" && location.search.includes("noautolod")) return 0   // 量測對照用
  if (!_seen.size) for (const S of sets) for (const m of [...S.meshes, ...S.lows, ...(S.proxies || [])]) if (m) _seen.add(m)
  const add = []
  scene.traverse((o) => {
    if (!o.isInstancedMesh || _seen.has(o) || o.isSkinnedMesh || o.userData.shadowProxy || o.userData.noLod) return
    if (o.count < 2 || !(o.layers.mask & 1)) return
    const g = o.geometry, per = (g.index ? g.index.count : g.attributes.position?.count || 0) / 3
    if (per < 120 || per * o.count < 20000) return
    if (o.instanceMatrix.usage === THREE.DynamicDrawUsage) { _seen.add(o); return }
    const f = _fp(o), r = _auto.get(o)
    if (!r) { _auto.set(o, { f, t: now, n: o.count }); return }
    if (r.f !== f || r.n !== o.count) { _seen.add(o); return }   // 會動：不管
    if (now - r.t < 2000) return
    _seen.add(o); add.push(o)
  })
  for (const m of add) {
    if (!m.geometry.boundingBox) m.geometry.computeBoundingBox()
    const bb = m.geometry.boundingBox, s = new THREE.Vector3(), m4 = new THREE.Matrix4(); m4.fromArray(m.instanceMatrix.array, 0); s.setFromMatrixScale(m4)
    const h = Math.max(0.3, (bb.max.y - bb.min.y) * s.y)
    lodRegister([m], h, [], { solid: true, auto: true })
    if (m.castShadow) m.layers.disable(5)   // 影子改由替身投（shadowcache.js SHADOW_LAYER＝5）
  }
  if (add.length) lodShadowProxies()
  for (const S of sets) for (const m of S.meshes) _seen.add(m)
  return add.length
}

// 2026-11-14 FPS：不是 InstancedMesh 的小東西（相機行的展示機每台幾十個零件、燈籠、鏈條、小石頭…）在幾百公尺外照樣畫，一格多上千次 draw call。
// 跟上面植物同一個門檻：在畫面上半徑不到 MINPX 像素就不畫（長鏡頭拉近照倍率畫得更遠）。只關掉 layer 0（主鏡頭看的層）——不動 visible（別的系統會切）、不影響影子層。
// 鳥、老闆（有骨架的模型）、會動的不管：鳥再小也要看得到
const tiny = { list: [], t: 1e9, off: new Set() }
const _tc = new THREE.Vector3()
function tinyScan(scene) {
  const L = []
  const skip = (o) => { for (let p = o; p; p = p.parent) { if (p.userData.noTinyCull || /_rig$|Armature/.test(p.name) || p.userData.bird) return true } return false }
  scene.traverse((o) => {
    // 2026-11-14 霧片（Sprite：瀑布水霧、地面霧氣）：一片一次 draw call，從花園往山那邊看一格 300 多片，大多在 100 m 外、被霧蓋得幾乎看不到 → 照它的大小一樣算「畫面上太小就不畫」（係數放寬：霧片是淡的大片）
    if (o.isSprite) { if (!(o.layers.mask & 1) && !tiny.off.has(o)) return; o.userData.tinyK = 0.35; L.push(o); return }
    if (!o.isMesh || o.isInstancedMesh || o.isSkinnedMesh || !o.frustumCulled || o.geometry.isInstancedBufferGeometry || o.userData.batched) return   // batched：已合併（batch.js），原件不畫
    if (!(o.layers.mask & 1) && !tiny.off.has(o)) return
    const g = o.geometry; if (!g.boundingSphere) g.computeBoundingSphere()
    const r = g.boundingSphere.radius * o.matrixWorld.getMaxScaleOnAxis(); if (!(r > 0) || r > 2.5) return
    if (o.parent && o.parent.children.some((c) => c.isSkinnedMesh)) return
    if (skip(o)) return
    L.push(o)
  })
  tiny.list = L
}
export function tinyCull(scene, camera, dt) {
  if ((tiny.t += dt) > 3) { tiny.t = 0; tinyScan(scene) }
  const zoom = Math.max(1, Math.tan(THREE.MathUtils.degToRad(WALK_FOV / 2)) / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))) * lodQuality.scale
  const cp = camera.position, K = PXK * zoom / MINPX
  for (const o of tiny.list) {
    if (o.userData.batched) { tiny.off.delete(o); delete o.userData.tinyOff; continue }
    let r
    if (o.isSprite) { _tc.setFromMatrixPosition(o.matrixWorld); r = Math.max(o.scale.x, o.scale.y) * 0.5 * K * o.userData.tinyK }
    else { const g = o.geometry; _tc.copy(g.boundingSphere.center).applyMatrix4(o.matrixWorld); r = g.boundingSphere.radius * o.matrixWorld.getMaxScaleOnAxis() * K }
    const far = _tc.distanceToSquared(cp) > r * r
    if (far) { if (o.layers.mask & 1) { o.layers.disable(0); tiny.off.add(o); o.userData.tinyOff = true } }
    else if (tiny.off.has(o)) { o.layers.enable(0); tiny.off.delete(o); delete o.userData.tinyOff }
  }
}
lodStats.tiny = () => ({ list: tiny.list.length, off: tiny.off.size })

// 2026-11-14 使用者「想保持水倒影」＋ FPS：花園水池的倒影把整座山、巨木林、高山區又畫一次（26 ms，關掉倒影 12 ms；倒影解析度減半沒差＝是東西太多）。
// 畫倒影那一下，整組 LOD 植物／石頭（所有株都離水面中心 R 公尺以外的）和很遠的大網格先藏起來，畫完再放回來：
// 水面附近的山壁、瀑布、樹照樣在倒影裡；更遠、在倒影裡只剩地平線上一條細邊的森林不畫（天空補上）
const _farCache = new Map()
let _all = null, _allT = 0
const _sp = new THREE.Sphere()
export function lodHideFar(scene, x0, z0, x1, z1, R) {   // 水面範圍（長方形 x0..x1、z0..z1）外 R 公尺
  if (typeof location !== 'undefined' && location.search.includes('noreflcut')) return () => {}   // 對照用
  const key = [x0, z0, x1, z1, R].map((v) => v.toFixed(1)).join(',')
  const dRect = (x, z) => Math.hypot(Math.max(x0 - x, 0, x - x1), Math.max(z0 - z, 0, z - z1))
  let L = _farCache.get(key)
  if (!L || L.n !== sets.length) {
    const hide = [], inSets = new Set()
    for (const S of sets) {
      for (const m of [...S.meshes, ...S.lows]) if (m) inSets.add(m)
      let near = false
      for (let i = 0; i < S.n && !near; i++) if (dRect(S.pos[i * 3], S.pos[i * 3 + 2]) < R + S.rad[i]) near = true
      if (!near) for (const m of [...S.meshes, ...S.lows]) if (m) hide.push(m)
    }
    L = { n: sets.length, hide, inSets }; _farCache.set(key, L)
  }
  // 其他所有東西（不在 LOD 裡的 InstancedMesh、一般網格、鳥、魚）：每次照現在的位置量（會動的也對）；清單每 5 秒重掃一次
  const now = performance.now()
  if (!_all || now - _allT > 5000) { _allT = now; _all = []; scene.traverse((o) => { if ((o.isMesh || o.isPoints) && !o.userData.shadowProxy) _all.push(o) }) }
  const off = [], cnt = []
  for (const m of L.hide) if (m.visible) { m.visible = false; off.push(m) }
  // 一組散布全區的 InstancedMesh（高山的冷杉、巨木林、錦鯉）：只留水面附近那幾株——把近的那幾列矩陣換到前面、count 暫時改小，畫完還原 count
  const part = (m) => {
    const n = m.count; if (n < 2) return
    const a = m.instanceMatrix.array, ca = m.instanceColor?.array, w = m.matrixWorld.elements, g = m.geometry
    if (!g.boundingSphere) g.computeBoundingSphere()
    const gr = g.boundingSphere.radius
    let k = 0, moved = false
    for (let j = 0; j < n; j++) {
      const o = j * 16, x = a[o + 12], y = a[o + 13], z = a[o + 14]
      const wx = w[0] * x + w[4] * y + w[8] * z + w[12], wz = w[2] * x + w[6] * y + w[10] * z + w[14]
      const sc = Math.hypot(a[o], a[o + 1], a[o + 2]) * Math.hypot(w[0], w[1], w[2])
      const rr = gr * sc
      if (dRect(wx, wz) < (rr < 2 ? 25 : R) + rr) {   // 小的（草叢、蕨、石頭）在倒影裡只留水邊 25 m 內
        if (j !== k) { for (let e = 0; e < 16; e++) { const t = a[k * 16 + e]; a[k * 16 + e] = a[o + e]; a[o + e] = t } if (ca) for (let e = 0; e < 3; e++) { const t = ca[k * 3 + e]; ca[k * 3 + e] = ca[j * 3 + e]; ca[j * 3 + e] = t } moved = true }
        k++
      }
    }
    if (moved) { m.instanceMatrix.clearUpdateRanges(); m.instanceMatrix.needsUpdate = true; if (ca) { m.instanceColor.clearUpdateRanges(); m.instanceColor.needsUpdate = true } }
    if (k < n) { cnt.push([m, n]); m.count = k }
  }
  // （逐株篩選量過：面數少了但時間沒變，反而每次倒影多 4% CPU → 不做；整組都在遠處的照樣整組藏）
  for (const o of _all) {
    if (!o.visible || L.inSets.has(o)) continue
    const g = o.geometry; if (!g) continue
    if (o.isInstancedMesh) { if (!o.boundingSphere) o.computeBoundingSphere(); _sp.copy(o.userData.fullSphere ?? o.boundingSphere) }
    else { if (!g.boundingSphere) g.computeBoundingSphere(); _sp.copy(g.boundingSphere) }
    _sp.applyMatrix4(o.matrixWorld)
    if (_sp.radius > 5000) continue   // 天空球
    if (dRect(_sp.center.x, _sp.center.z) - _sp.radius > (_sp.radius < 2 ? 25 : R)) { o.visible = false; off.push(o) }
  }
  return () => { for (const m of off) m.visible = true; for (const [m, n] of cnt) m.count = n }
}

let lowGen = null
export const lodSetLowGen = (f) => { lowGen = f }
function autoLow(m) {
  if (!lowGen || !m.parent || m.userData.noAutoLow) return null
  const g = m.geometry, per = (g.index ? g.index.count : 0) / 3
  if (per < 1200) return null
  const lg = lowGen(g); if (!lg) return null
  const lo = new THREE.InstancedMesh(lg, m.material, m.count)
  lo.instanceMatrix.array.set(m.instanceMatrix.array.subarray(0, m.count * 16))
  if (m.instanceColor) lo.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(m.instanceColor.array), 3)
  lo.position.copy(m.position); lo.quaternion.copy(m.quaternion); lo.scale.copy(m.scale)
  lo.castShadow = m.castShadow; lo.receiveShadow = m.receiveShadow; lo.layers.mask = m.layers.mask & ~(1 << 5); lo.renderOrder = m.renderOrder
  lo.customDepthMaterial = m.customDepthMaterial; lo.customDistanceMaterial = m.customDistanceMaterial
  if (!m.boundingSphere) m.computeBoundingSphere(); lo.boundingSphere = m.boundingSphere.clone(); lo.count = 0; lo.name = (m.name || '') + ':low'
  m.parent.add(lo)
  return lo
}

// 草葉一塊：mesh（InstancedBufferGeometry，草已經打亂順序）、中心、半徑
export function lodRegisterGrass(mesh, center, r) {
  grass.push({ mesh, c: center.clone(), r, n: mesh.geometry.instanceCount, mask0: mesh.layers.mask })
  lodStats.grass += mesh.geometry.instanceCount
  last.fov = 0
}

// 陰影替身：LOD 只留看得到的那幾株，陰影卻要整片都有（陰影貼圖會留著重複用）。
// 每種會投影的植物多放一份「全部的株、不變稀、不剔除」的 InstancedMesh，只放在陰影層（shadowcache.js），主畫面看不到。
// 共用幾何和材質，只多一份矩陣。
export function lodShadowProxies() {
  for (const S of sets) {
    if (S.proxies) continue
    if (!S.meshes.every((m) => m.parent)) continue   // 還沒加進場景：下次再做
    S.proxies = []
    // 2026-11-10 整片陰影只有一張 1024 貼圖蓋 380×260 公尺（一個貼素約 37 公分）：2 公尺以下的植物（蕨類、草叢、花）投的影子只剩一團糊，
    // 但它們的替身佔了陰影重畫一半以上的三角形 → 不投影
    if (S.d0 < 28) continue
    for (const [mi, m] of S.meshes.entries()) {
      if (!m.userData.lodManaged) continue
      // 影子用低面數版本（陰影貼圖每個貼素約 9 公分，看不出差別，重畫陰影比較快）
      const px = new THREE.InstancedMesh(S.lows[mi]?.geometry ?? m.geometry, m.material, S.n)
      px.instanceMatrix.array.set(S.base)
      px.position.copy(m.position); px.quaternion.copy(m.quaternion); px.scale.copy(m.scale)
      px.castShadow = true; px.receiveShadow = false
      px.customDepthMaterial = m.customDepthMaterial
      px.layers.set(5); px.userData.shadowProxy = true; px.name = (m.name || 'lod') + ':shadow'
      px.computeBoundingSphere()
      m.parent.add(px)
      S.proxies.push(px)
    }
  }
}

// 2026-11-10 玩家回饋「好卡」：每次重畫陰影都把替身「全部」的株（整座山上幾千棵）畫進陰影貼圖（一次多 600 萬個三角形、一格 26→56 毫秒，每秒一次頓一下）。
// 陰影貼圖只蓋太陽目標附近 r 公尺：重畫前只留那一圈裡的株
export function lodShadowCull(cx, cz, r) {
  for (const S of sets) {
    if (!S.proxies?.length) continue
    let k = 0
    const src = S.base, n = S.n
    S.shIdx ??= new Uint32Array(n)
    for (let i = 0; i < n; i++) {
      const dx = S.pos[i * 3] - cx, dz = S.pos[i * 3 + 2] - cz, rr = r + S.rad[i]
      if (dx * dx + dz * dz < rr * rr) S.shIdx[k++] = i
    }
    for (const px of S.proxies) {
      const a = px.instanceMatrix.array
      for (let j = 0; j < k; j++) { const i = S.shIdx[j]; for (let e = 0; e < 16; e++) a[j * 16 + e] = src[i * 16 + e] }
      px.count = k; px.instanceMatrix.needsUpdate = true
    }
  }
}

const IMP_ON = false
const TF0 = 230, TF1 = 330, PXK = 750, MINPX = 2.5,   /* 太小不畫：半徑 5 → 2.5 像素（0.4 m 的蕨原本 60 m 就不見，現在 120 m） */ IMP_PX = 150, IMP_N = 8, IMP_W = 128, IMP_H = 256
// ---------- 遠景替身 ----------
let impCtx = null   // { renderer, sun, hemi }（world.js 建好之後給）
export const lodInit = (ctx) => { impCtx = ctx; last.fov = 0 }
const impLight = { value: 1 }
const QUAD = (() => { const g = new THREE.InstancedBufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute([-1, 0, 0, 1, 0, 0, 1, 1, 0, -1, 1, 0], 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2)); g.setIndex([0, 1, 2, 0, 2, 3]); return g })()
function impBake(S) {
  const { renderer, sun, hemi } = impCtx, I = S.imp
  const rt = new THREE.WebGLRenderTarget(IMP_W * IMP_N, IMP_H, { minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: true, depthBuffer: true })
  const sc = new THREE.Scene(), cx = 0, hh = (I.y1 - I.y0), W = Math.max(I.R, hh * IMP_W / IMP_H / 2)
  for (const m of S.meshes) { const o = new THREE.Mesh(m.geometry, m.material); o.frustumCulled = false; sc.add(o) }
  sc.add(new THREE.HemisphereLight(hemi.color, hemi.groundColor, hemi.intensity))
  const dl = new THREE.DirectionalLight(sun.color, sun.intensity); sc.add(dl); sc.add(dl.target)
  const cam = new THREE.OrthographicCamera(-W, W, I.y1, I.y0, 0.1, W * 6 + 200)
  const prevRT = renderer.getRenderTarget(), prevC = renderer.getClearColor(new THREE.Color()), prevA = renderer.getClearAlpha(), prevAuto = renderer.autoClear, sh = renderer.shadowMap.autoUpdate, vp = renderer.getViewport(new THREE.Vector4()), scT = renderer.getScissorTest()
  renderer.shadowMap.autoUpdate = false; renderer.setRenderTarget(rt); renderer.setClearColor(0x1a2a14, 0); renderer.autoClear = false; renderer.setScissorTest(false); renderer.clear()
  for (let a = 0; a < IMP_N; a++) {
    const an = a / IMP_N * Math.PI * 2, D = W * 3 + 50
    cam.position.set(Math.sin(an) * D, 0, Math.cos(an) * D); cam.up.set(0, 1, 0); cam.lookAt(0, 0, 0); cam.updateMatrixWorld()
    dl.position.set(Math.sin(an + 0.7) * 10, 9, Math.cos(an + 0.7) * 10)   // 光從鏡頭的斜上方來：每個角度的貼圖都是亮面為主，轉著看不會忽明忽暗
    renderer.setViewport(a * IMP_W, 0, IMP_W, IMP_H); renderer.render(sc, cam)
  }
  renderer.setRenderTarget(prevRT); renderer.setClearColor(prevC, prevA); renderer.autoClear = prevAuto; renderer.shadowMap.autoUpdate = sh; renderer.setViewport(vp); renderer.setScissorTest(scT)
  I.W = W; I.day0 = 0.12 + 0.95 * dayLight.value
  const g = QUAD.clone(); g.instanceCount = 0
  g.setAttribute('iPos', new THREE.InstancedBufferAttribute(new Float32Array(S.n * 3), 3)); g.setAttribute('iSz', new THREE.InstancedBufferAttribute(new Float32Array(S.n * 4), 4)); g.setAttribute('iCol', new THREE.InstancedBufferAttribute(new Float32Array(S.n * 3).fill(1), 3))
  const mat = new THREE.ShaderMaterial({ fog: true, side: THREE.DoubleSide,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { map: { value: null }, uLight: { value: 1 }, uK: { value: W / Math.max(1e-3, I.R) } }]),
    vertexShader: `attribute vec3 iPos; attribute vec4 iSz; attribute vec3 iCol; uniform float uK; varying vec2 vUv; varying vec3 vCol;
      #include <fog_pars_vertex>
      void main(){
        vec3 toC = cameraPosition - iPos; float ang = atan(toC.x, toC.z) - iSz.w;
        float cell = floor(mod(ang / 6.2831853 * ${IMP_N}.0 + 0.5, ${IMP_N}.0));
        vec3 right = normalize(vec3(toC.z, 0.0, -toC.x));
        vec3 wp = iPos + right * position.x * iSz.x * uK + vec3(0.0, mix(iSz.y, iSz.z, position.y), 0.0);
        vUv = vec2((cell + uv.x) / ${IMP_N}.0, uv.y); vCol = iCol;
        vec4 mvPosition = viewMatrix * vec4(wp, 1.0); gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: `uniform sampler2D map; uniform float uLight; varying vec2 vUv; varying vec3 vCol;
      #include <common>
      #include <fog_pars_fragment>
      void main(){
        vec4 t = texture2D(map, vUv); if (t.a < 0.45) discard;
        gl_FragColor = vec4(t.rgb / max(t.a, 0.45) * vCol * uLight, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }` })
  mat.uniforms.map.value = rt.texture; mat.uniforms.uLight = impLight
  const mesh = new THREE.Mesh(g, mat); mesh.frustumCulled = false; mesh.name = 'lod:impostor'; mesh.renderOrder = -1
  S.meshes[0].parent?.add(mesh); mesh.matrixAutoUpdate = false
  I.mesh = mesh; I.rt = rt
  lodStats.impSets = (lodStats.impSets ?? 0) + 1
}
function impFill(S, n) {
  const I = S.imp
  if (!I.mesh) { if (!n || !impCtx || !S.meshes[0].parent) return; try { impBake(S) } catch (e) { console.error('[impostor]', e); S.imp = null; return } }
  const g = I.mesh.geometry, P = g.attributes.iPos.array, Z = g.attributes.iSz.array, C = g.attributes.iCol.array, co = S.cols[0]
  for (let j = 0; j < n; j++) { const i = I.idx[j]; P[j * 3] = I.org[i * 3]; P[j * 3 + 1] = I.org[i * 3 + 1]; P[j * 3 + 2] = I.org[i * 3 + 2]; Z[j * 4] = I.sz[i * 4]; Z[j * 4 + 1] = I.sz[i * 4 + 1]; Z[j * 4 + 2] = I.sz[i * 4 + 2]; Z[j * 4 + 3] = I.sz[i * 4 + 3]; if (co) { C[j * 3] = co[i * 3]; C[j * 3 + 1] = co[i * 3 + 1]; C[j * 3 + 2] = co[i * 3 + 2] } }
  g.instanceCount = n; g.attributes.iPos.needsUpdate = true; g.attributes.iSz.needsUpdate = true; if (co) g.attributes.iCol.needsUpdate = true
  I.mesh.visible = n > 0 && S.meshes[0].visible !== false
  impLight.value = (0.12 + 0.95 * dayLight.value) / (I.day0 || 1)
  lodStats.impDrawn = (lodStats.impDrawn ?? 0) + n
}
export function lodUpdate(camera, force = false) {
  camera.updateMatrixWorld()
  const p = camera.getWorldPosition(_c.clone()), q = camera.getWorldQuaternion(new THREE.Quaternion())
  if (!force && p.distanceToSquared(last.p) < 0.25 && Math.abs(q.dot(last.q)) > 0.9997 && Math.abs(camera.fov - last.fov) < 0.5) return
  last.p.copy(p); last.q.copy(q); last.fov = camera.fov
  _pm.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse); _fr.setFromProjectionMatrix(_pm)
  const zoom = Math.max(1, Math.tan(THREE.MathUtils.degToRad(WALK_FOV / 2)) / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))) * lodQuality.scale
  const P = _fr.planes
  let drawn = 0, lowTris = 0, nearN = 0; lodStats.impDrawn = 0
  // 自動登記的：別的程式後來自己改了 count（例如石橋套件載入後用 count = 0 藏起舊橋面）→ 交還給它，不再管（矩陣先還原成原本的全部）
  for (let si = sets.length - 1; si >= 0; si--) { const S = sets[si]; if (!S.auto) continue
    if (!S.meshes.some((m) => m.userData.lodCount !== undefined && m.count !== m.userData.lodCount)) continue
    for (const m of S.meshes) { const ext = m.count; m.instanceMatrix.array.set(S.base); m.instanceMatrix.clearUpdateRanges(); m.instanceMatrix.needsUpdate = true; m.count = ext === m.userData.lodCount ? S.n : ext; delete m.userData.lodCount; m.userData.noLod = true; m.frustumCulled = true; if (m.castShadow) m.layers.enable(5); m.userData.lodManaged = false }
    for (const lo of S.lows) if (lo) { lo.count = 0; lo.parent?.remove(lo) }
    for (const px of S.proxies || []) px.parent?.remove(px)
    sets.splice(si, 1)
  }
  for (const S of sets) {
    const zS = S.d1 !== Infinity ? zoom / lodQuality.scale * Math.max(0.8, lodQuality.scale) : zoom, d0 = S.d0 * zS, d1 = S.d1 * zS,   /* 矮植物也一樣：畫質降級最多縮到八成 */ d1s = d1 * d1, dLs = (S.dL * zoom) ** 2
    let k = 0, ki = 0
    for (let i = 0; i < S.n; i++) {
      const x = S.pos[i * 3] - p.x, y = S.pos[i * 3 + 1] - p.y, z = S.pos[i * 3 + 2] - p.z
      const dd = x * x + y * y + z * z
      if (dd > d1s && S.hash[i] >= 0) continue
      let sc0 = 1
      // 2026-11-12 使用者「場景太重，學校打不開、家裡開始卡」：站在入口一格畫 2,790 萬個三角形——山上的小東西（蕨、石頭、石階）以前多遠都畫。
      // 在畫面上半徑不到 MINPX 像素的不畫（照鏡頭焦距和畫質等級算：長鏡頭拉近、畫質高就畫得遠）。半徑 0.4 m 的蕨約 60 m、1.5 m 的石頭 225 m、6 m 的樹 900 m
      { const rr = S.rad[i] * PXK * zoom, q2 = rr * rr / (MINPX * MINPX * dd); if (q2 < 1) continue; if (q2 < 2.2) sc0 = 0.2 + 0.8 * (Math.sqrt(q2) - 1) / 0.483 }
      // 2026-11-10 玩家回饋「好卡」：高的樹以前多遠都畫（站在花園水池邊，山區、巨木林幾千棵樹全畫，一格 1000 多萬個三角形）。
      // 230～330 公尺之間慢慢變稀（150～210 試過：山頂往下看整片森林不見）（每株照自己的雜湊值，不會一條線整排消失），再遠不畫；霧已經把那麼遠的樹蓋得很淡。長鏡頭拉近時照倍率拉遠
      // 2026-11-12 使用者：「邊走有些樹才跑出來」——以前過了門檻整棵突然出現。現在快要出現的那一段從很小慢慢長到原本大小（sc 0.15→1），看起來是從遠處淡進來，不是蹦出來
      let sc = 1
      if (!S.imp && dd > TF0 * TF0 * zoom * zoom) { const d = Math.sqrt(dd) / zoom; if (d > TF1) continue; const m = 1 - (d - TF0) / (TF1 - TF0) - ((i * 0.6180339887) % 1); if (m < 0) continue; sc = Math.min(sc, 0.15 + 0.85 * Math.min(1, m / 0.22)) }
      if (d1 !== Infinity) { const d = Math.sqrt(dd); if (d > d0) { const m = 1 - (d - d0) / (d1 - d0) - S.hash[i]; if (m < 0) continue; sc = Math.min(sc, 0.15 + 0.85 * Math.min(1, m / 0.2)) } }
      // 視野外不畫；邊界多留 6 公尺（畫面外的植物影子會投進畫面）＋距離的 8%（約 4.6 度）：
      // 鏡頭轉不到 2.8 度不重算，遠處的樹以前只留 6 公尺（200 公尺外不到 2 度），慢慢轉頭時畫面邊緣的樹會突然冒出來、消失（2026-11-08 山上）
      const r = S.rad[i] + 6 + Math.sqrt(dd) * 0.08, cx = S.pos[i * 3], cy = S.pos[i * 3 + 1], cz = S.pos[i * 3 + 2]
      let out = false
      for (let j = 0; j < 6; j++) { const pl = P[j]; if (pl.normal.x * cx + pl.normal.y * cy + pl.normal.z * cz + pl.constant < -r) { out = true; break } }
      if (out) continue
      if (S.imp) { const hpx = (S.imp.sz[i * 4 + 2] - S.imp.sz[i * 4 + 1]) * PXK * zoom; if (hpx * hpx < IMP_PX * IMP_PX * dd) { S.imp.idx[ki++] = i; continue } }
      S.far[k] = dd > dLs ? 1 : 0
      S.scl[k] = Math.min(sc, sc0)
      S.vis[k++] = i
    }
    // 把選到的株的矩陣擠到最前面；pick(j)：這一株要不要放進這個 mesh
    const fill = (m, mi, pick) => {
      const a = m.instanceMatrix.array, ca = m.instanceColor?.array, co = S.cols[mi]
      let c = 0
      for (let j = 0; j < k; j++) {
        if (!pick(j)) continue
        const i = S.vis[j]
        a.set(S.base.subarray(i * 16, i * 16 + 16), c * 16)
        const sk = S.scl[j]; if (sk < 0.999) { const o = c * 16; for (let e = 0; e < 11; e++) if (e !== 3 && e !== 7) a[o + e] *= sk }   // 快要出現／消失的：縮小（只縮 3×3 的部分，位置不動）
        if (ca && co) { ca[c * 3] = co[i * 3]; ca[c * 3 + 1] = co[i * 3 + 1]; ca[c * 3 + 2] = co[i * 3 + 2] }
        c++
      }
      m.count = c; m.userData.lodCount = c   // 不動 visible：高山館切換兩館時會整批藏起來（alpine.js），這裡設 visible 會把它又打開
      m.instanceMatrix.clearUpdateRanges(); m.instanceMatrix.addUpdateRange(0, Math.max(1, c) * 16); m.instanceMatrix.needsUpdate = true
      if (ca && co) { m.instanceColor.clearUpdateRanges(); m.instanceColor.addUpdateRange(0, Math.max(1, c) * 3); m.instanceColor.needsUpdate = true }
      return c
    }
    S.meshes.forEach((m, mi) => {
      const lo = S.lows[mi]
      if (!lo) { fill(m, mi, () => true); return }
      const near = fill(m, mi, (j) => !S.far[j]), far = fill(lo, mi, (j) => S.far[j])
      const vc = (q) => q.index ? q.index.count : q.attributes.position.count   // 沒有索引的幾何（outside.js 的樹）用頂點數
      lowTris += far * (vc(m.geometry) - vc(lo.geometry)) / 3; nearN += near
    })
    drawn += k * S.meshes.length
    if (S.imp) impFill(S, ki)
  }
  // 草：15 公尺內全密，到 60 公尺漸漸剩兩成，90 公尺外不畫（地面本身是綠的）
  let gd = 0
  const sph = new THREE.Sphere()
  for (const G of grass) {
    sph.set(G.c, G.r)
    // 2026-11-13 使用者：草要在更遠的地方就出來——畫質降級時以前草的距離跟著乘 0.4～0.65（35 m 變 15 m），現在最多只縮到八成
    const zG = zoom / lodQuality.scale * Math.max(0.8, lodQuality.scale), d = Math.max(0, G.c.distanceTo(p) - G.r * 0.5) / zG
    // 草葉：35 m 內全密、到 110 m 慢慢剩三成五、160 m 外不畫（原本 15 m 就開始變稀、90 m 不畫，走過去才看到草長出來）
    let f = d < 55 ? 1 : d < 150 ? 1 - 0.6 * (d - 55) / 95 : d < 220 ? 0.4 * (1 - (d - 150) / 70) : 0   // 55 m 內全密、150 m 剩四成、220 m 外不畫
    if (!_fr.intersectsSphere(sph)) f = 0
    G.mesh.geometry.instanceCount = Math.round(G.n * f)
    { const on = G.mesh.geometry.instanceCount > 0; if (on !== (G.mesh.layers.mask !== 0)) { if (on) G.mesh.layers.mask = G.mask0; else { G.mask0 ??= G.mesh.layers.mask; G.mesh.layers.mask = 0 } } }   // 0 根草的塊不發 draw call
    gd += G.mesh.geometry.instanceCount
  }
  lodStats.drawn = drawn; lodStats.grassDrawn = gd; lodStats.trisSaved = Math.round(lowTris)
}
if (typeof window !== 'undefined') window.__lod = { update: lodUpdate, stats: lodStats, sets, grass }
