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

// meshes：共用同一份擺放清單的 InstancedMesh（一種植物的各個材質）；h：這種植物大概多高（公尺）
export function lodRegister(meshes, h) {
  meshes = meshes.filter((m) => m?.isInstancedMesh && m.count > 0)
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
  sets.push({ meshes, n, base, cols, pos, rad, hash, d0, d1, vis: new Uint32Array(n) })
  lodStats.instances += n * meshes.length
  last.fov = 0   // 下一格強制更新
}

// 草葉一塊：mesh（InstancedBufferGeometry，草已經打亂順序）、中心、半徑
export function lodRegisterGrass(mesh, center, r) {
  grass.push({ mesh, c: center.clone(), r, n: mesh.geometry.instanceCount })
  lodStats.grass += mesh.geometry.instanceCount
  last.fov = 0
}

export function lodUpdate(camera, force = false) {
  camera.updateMatrixWorld()
  const p = camera.getWorldPosition(_c.clone()), q = camera.getWorldQuaternion(new THREE.Quaternion())
  if (!force && p.distanceToSquared(last.p) < 0.25 && Math.abs(q.dot(last.q)) > 0.9997 && Math.abs(camera.fov - last.fov) < 0.5) return
  last.p.copy(p); last.q.copy(q); last.fov = camera.fov
  _pm.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse); _fr.setFromProjectionMatrix(_pm)
  const zoom = Math.max(1, Math.tan(THREE.MathUtils.degToRad(WALK_FOV / 2)) / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)))
  const P = _fr.planes
  let drawn = 0
  for (const S of sets) {
    const d0 = S.d0 * zoom, d1 = S.d1 * zoom, d1s = d1 * d1
    let k = 0
    for (let i = 0; i < S.n; i++) {
      const x = S.pos[i * 3] - p.x, y = S.pos[i * 3 + 1] - p.y, z = S.pos[i * 3 + 2] - p.z
      const dd = x * x + y * y + z * z
      if (dd > d1s && S.hash[i] >= 0) continue
      if (d1 !== Infinity) { const d = Math.sqrt(dd); if (d > d0 && S.hash[i] > 1 - (d - d0) / (d1 - d0)) continue }
      // 視野外不畫；邊界多留 6 公尺（畫面外的植物影子會投進畫面）
      const r = S.rad[i] + 6, cx = S.pos[i * 3], cy = S.pos[i * 3 + 1], cz = S.pos[i * 3 + 2]
      let out = false
      for (let j = 0; j < 6; j++) { const pl = P[j]; if (pl.normal.x * cx + pl.normal.y * cy + pl.normal.z * cz + pl.constant < -r) { out = true; break } }
      if (out) continue
      S.vis[k++] = i
    }
    S.meshes.forEach((m, mi) => {
      const a = m.instanceMatrix.array, ca = m.instanceColor?.array, co = S.cols[mi]
      for (let j = 0; j < k; j++) {
        const i = S.vis[j]
        a.set(S.base.subarray(i * 16, i * 16 + 16), j * 16)
        if (ca && co) { ca[j * 3] = co[i * 3]; ca[j * 3 + 1] = co[i * 3 + 1]; ca[j * 3 + 2] = co[i * 3 + 2] }
      }
      m.count = k; m.visible = k > 0
      m.instanceMatrix.clearUpdateRanges(); m.instanceMatrix.addUpdateRange(0, k * 16); m.instanceMatrix.needsUpdate = true
      if (ca && co) { m.instanceColor.clearUpdateRanges(); m.instanceColor.addUpdateRange(0, k * 3); m.instanceColor.needsUpdate = true }
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
    G.mesh.visible = f > 0
    G.mesh.geometry.instanceCount = Math.round(G.n * f)
    gd += G.mesh.geometry.instanceCount
  }
  lodStats.drawn = drawn; lodStats.grassDrawn = gd
}
if (typeof window !== 'undefined') window.__lod = { update: lodUpdate, stats: lodStats, sets, grass }
