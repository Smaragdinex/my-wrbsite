// 植物 LOD：以前每一株、每一片草不管在哪都照畫（看任何方向都畫整個溫室，約 2,400 萬個三角形）。
// 1. 一般的 InstancedMesh（plants.js 的 scatter、flora.js 的 makeInst）：每隔幾格（鏡頭有動才做）逐株檢查——
//    在視野外（留一點邊，畫面外的植物影子才不會突然消失）就不畫；地面上矮的植物越遠越稀疏、太遠就不畫；
//    大樹、長在山上的（y > 2.5，遠景主角，第一版把整座山的植物都弄不見了）永遠不稀疏。
//    看得到的那幾株的矩陣擠到最前面、count 設成那麼多：繪製次數不變。
// 2. 草葉：切成一塊一塊（每塊自己的範圍，視野外整塊不畫），塊裡的草先打亂順序，越遠 instanceCount 越少＝越稀。
// 距離都照鏡頭變焦換算：長焦望遠看遠處時，遠處的植物在畫面上很大，不能變稀。
import * as THREE from 'three'

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
export function lodRegister(meshes, h, lows = []) {
  const keep = meshes.map((m, i) => m?.isInstancedMesh && m.count > 0 ? i : -1).filter((i) => i >= 0)
  meshes = keep.map((i) => meshes[i]); lows = keep.map((i) => lows[i] ?? null)
  if (!meshes.length) return
  const m0 = meshes[0], n = m0.count
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
    if (_c.y > 2.5) hash[i] = -1   // 長在山上（離地面高）的植物是遠景的主角，從哪裡都看得到：不變稀，只做視野外不畫
  }
  const cols = meshes.map((m) => m.instanceColor ? m.instanceColor.array.slice(0, n * 3) : null)
  // 矮的（蕨類、地被）14～40 公尺開始變稀、更遠就不畫；4 公尺以上的樹只做視野外不畫
  const d0 = Math.max(14, h * 14), d1 = h >= 4 ? Infinity : Math.max(32, h * 40)
  for (const m of [...meshes, ...lows]) if (m?.castShadow) m.userData.lodManaged = true   // 陰影由 lodShadowProxies 的替身負責（shadowcache.js）
  // 換成低面數的距離：一公尺的蕨類 10 公尺外、越高的越遠才換（長焦時照變焦倍率拉遠）
  const dL = Math.max(10, h * 10)
  sets.push({ meshes, lows, n, base, cols, pos, rad, hash, d0, d1, dL, vis: new Uint32Array(n), far: new Uint8Array(n), proxies: null })
  lodStats.instances += n * meshes.length
  last.fov = 0   // 下一格強制更新
}

// 草葉一塊：mesh（InstancedBufferGeometry，草已經打亂順序）、中心、半徑
export function lodRegisterGrass(mesh, center, r) {
  grass.push({ mesh, c: center.clone(), r, n: mesh.geometry.instanceCount })
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

export function lodUpdate(camera, force = false) {
  camera.updateMatrixWorld()
  const p = camera.getWorldPosition(_c.clone()), q = camera.getWorldQuaternion(new THREE.Quaternion())
  if (!force && p.distanceToSquared(last.p) < 0.25 && Math.abs(q.dot(last.q)) > 0.9997 && Math.abs(camera.fov - last.fov) < 0.5) return
  last.p.copy(p); last.q.copy(q); last.fov = camera.fov
  _pm.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse); _fr.setFromProjectionMatrix(_pm)
  const zoom = Math.max(1, Math.tan(THREE.MathUtils.degToRad(WALK_FOV / 2)) / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))) * lodQuality.scale
  const P = _fr.planes
  let drawn = 0, lowTris = 0, nearN = 0
  for (const S of sets) {
    const d0 = S.d0 * zoom, d1 = S.d1 * zoom, d1s = d1 * d1, dLs = (S.dL * zoom) ** 2
    let k = 0
    for (let i = 0; i < S.n; i++) {
      const x = S.pos[i * 3] - p.x, y = S.pos[i * 3 + 1] - p.y, z = S.pos[i * 3 + 2] - p.z
      const dd = x * x + y * y + z * z
      if (dd > d1s && S.hash[i] >= 0) continue
      if (d1 !== Infinity) { const d = Math.sqrt(dd); if (d > d0 && S.hash[i] > 1 - (d - d0) / (d1 - d0)) continue }
      // 視野外不畫；邊界多留 6 公尺（畫面外的植物影子會投進畫面）＋距離的 8%（約 4.6 度）：
      // 鏡頭轉不到 2.8 度不重算，遠處的樹以前只留 6 公尺（200 公尺外不到 2 度），慢慢轉頭時畫面邊緣的樹會突然冒出來、消失（2026-11-08 山上）
      const r = S.rad[i] + 6 + Math.sqrt(dd) * 0.08, cx = S.pos[i * 3], cy = S.pos[i * 3 + 1], cz = S.pos[i * 3 + 2]
      let out = false
      for (let j = 0; j < 6; j++) { const pl = P[j]; if (pl.normal.x * cx + pl.normal.y * cy + pl.normal.z * cz + pl.constant < -r) { out = true; break } }
      if (out) continue
      S.far[k] = dd > dLs ? 1 : 0
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
        if (ca && co) { ca[c * 3] = co[i * 3]; ca[c * 3 + 1] = co[i * 3 + 1]; ca[c * 3 + 2] = co[i * 3 + 2] }
        c++
      }
      m.count = c   // 不動 visible：高山館切換兩館時會整批藏起來（alpine.js），這裡設 visible 會把它又打開
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
  }
  // 草：15 公尺內全密，到 60 公尺漸漸剩兩成，90 公尺外不畫（地面本身是綠的）
  let gd = 0
  const sph = new THREE.Sphere()
  for (const G of grass) {
    sph.set(G.c, G.r)
    const d = Math.max(0, G.c.distanceTo(p) - G.r * 0.5) / zoom
    let f = d < 15 ? 1 : d < 60 ? 1 - 0.8 * (d - 15) / 45 : d < 90 ? 0.2 : 0
    if (!_fr.intersectsSphere(sph)) f = 0
    G.mesh.geometry.instanceCount = Math.round(G.n * f)
    gd += G.mesh.geometry.instanceCount
  }
  lodStats.drawn = drawn; lodStats.grassDrawn = gd; lodStats.trisSaved = Math.round(lowTris)
}
if (typeof window !== 'undefined') window.__lod = { update: lodUpdate, stats: lodStats, sets, grass }
