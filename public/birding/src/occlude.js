// 2026-11-17 遮擋剔除（使用者：「用一堆紅杉木擋住山區跟其他地區，這樣非洲應該可以提升 FPS」）
// 非洲西側的紅杉屏障（layout.js AF_WALL、giants.js 種的樹）當成一道不透光的牆：每段牆記住「實心的頂」有多高（地面＋樹冠最密那段）。
// 玩家站在非洲時，東西被擋住＝從眼睛到它最高點的那條視線，穿過牆的地方比牆頂低 → 不畫。
//   - 植物、樹（lod.js 管的）：一株一株判斷（包圍球的頂）
//   - 其他物件（山頂、峽谷、洞穴、池塘、步道、鳥…）：包圍盒頂面取樣，全部的點都被擋住才藏起來
// 步道穿過的缺口沒有牆：從缺口看得到的東西照畫（不會破洞）。離牆太近（25 m 內）那段牆不算（近看樹幹之間有縫）。
// 物件要在牆後面至少 12 m 才剔除（屏障本身、緊貼牆的樹照畫）。
import * as THREE from 'three'
import { savK } from './layout.js'

const segs = []                       // [ax, az, bx, bz, ya, yb, ga, gb]：牆的一段，兩端的樹冠頂高、山脊頂（土坡）高
// 牆分三層：山脊土坡（地面以下，完全不透光）→ 樹幹層（GAP 公尺，樹幹之間有縫，當成透明）→ 樹冠層（不透光，到 ya/yb）
export const GAP = 22
const act = []                        // 這次鏡頭位置用得到的段（離鏡頭夠遠）
export const occ = { on: false, x: 0, y: 0, z: 0, enabled: true, hidden: 0, checked: 0 }

export function occSetWall(lines) {   // lines：[[x, z, top, ground], ...] 的陣列
  segs.length = 0
  for (const L of lines) for (let i = 0; i < L.length - 1; i++) segs.push([L[i][0], L[i][1], L[i + 1][0], L[i + 1][1], L[i][2], L[i + 1][2], L[i][3], L[i + 1][3]])
}

const segDist = (s, x, z) => {
  const dx = s[2] - s[0], dz = s[3] - s[1], t = Math.max(0, Math.min(1, ((x - s[0]) * dx + (z - s[1]) * dz) / (dx * dx + dz * dz)))
  return Math.hypot(x - s[0] - dx * t, z - s[1] - dz * t)
}

// 每次 LOD 更新前呼叫：鏡頭在非洲才開
export function occUpdate(p) {
  occ.x = p.x; occ.y = p.y; occ.z = p.z
  act.length = 0
  for (const b of bins) b.length = 0
  if (occ.enabled && segs.length && savK(p.x, p.z) > 0.3) for (const s of segs) if (segDist(s, p.x, p.z) > 25) {
    act.push(s)
    // 照鏡頭看出去的方向角分格（牆每 4 m 一段、一百多段；每株植物只跟它那個方向的幾段算）
    let a0 = binOf(s[0] - p.x, s[1] - p.z), a1 = binOf(s[2] - p.x, s[3] - p.z)
    if (((a1 - a0 + NB) % NB) > NB / 2) { const t = a0; a0 = a1; a1 = t }
    for (let b = a0; ; b = (b + 1) % NB) { bins[b].push(s); if (b === a1) break }
  }
  occ.on = act.length > 0
}
const NB = 256, bins = Array.from({ length: NB }, () => [])
const binOf = (dx, dz) => ((Math.floor((Math.atan2(dz, dx) / (2 * Math.PI) + 0.5) * NB) % NB) + NB) % NB

// (x, y, z)：物件最高點，yb：最低點。從眼睛看它的那一段（底到頂）整段都落在土坡裡、或整段都落在樹冠層裡 → 被擋住，回傳 true
// （碰到樹幹層的照畫：2026-11-17 第一版只看頂，樹幹縫裡看得到的巨木被剔掉，露出後面的山）
export function occHidden(x, y, z, yb = y) {
  const cx = occ.x, cz = occ.z, dx = x - cx, dz = z - cz, list = bins[binOf(dx, dz)]
  for (let k = 0; k < list.length; k++) {
    const s = list[k], ex = s[2] - s[0], ez = s[3] - s[1]
    const den = dx * ez - dz * ex
    if (den > -1e-9 && den < 1e-9) continue
    const ax = s[0] - cx, az = s[1] - cz
    const t = (ax * ez - az * ex) / den
    if (t <= 0 || t >= 1) continue
    const u = (ax * dz - az * dx) / den
    if (u < 0 || u > 1) continue
    if ((1 - t) * Math.sqrt(dx * dx + dz * dz) < 12) continue
    const lt = occ.y + (y - occ.y) * t, lb = occ.y + (yb - occ.y) * t, gr = s[6] + (s[7] - s[6]) * u
    if (lt < gr) return true                                                    // 整段在山脊後面
    if (lb > gr + GAP && lt < s[4] + (s[5] - s[4]) * u) return true             // 整段在樹冠層裡
  }
  return false
}

// ---------- 整個物件（場景最上層的東西） ----------
// 包圍盒（世界座標）只算一次；會動的（鳥）每次用目前位置的球。藏起來的記在 mine，回來時只打開自己藏的
const SKIP = new Set(['ground', 'alpineInterior', 'savanna', 'domeShell'])
let objs = null, objT = 0
const mine = new Set()
const _b = new THREE.Box3(), _b2 = new THREE.Box3(), _bs = new THREE.Sphere(), _v = new THREE.Vector3(), _sz = new THREE.Vector3(8, 10, 8)
function collect(scene) {
  objs = []
  for (const o of scene.children) {
    if (o.name === 'alpineInterior') { collectSub(o); continue }
    if (SKIP.has(o.name) || o.isLight || o.isCamera || o.userData.noOcc) continue
    let skinned = false
    o.traverse((m) => { if (m.isSkinnedMesh) skinned = true })
    if (skinned) { objs.push({ o, move: true }); continue }
    // InstancedMesh 用全部株的範圍（LOD 會把 count 縮成只剩看得到的，那時算的盒子太小）
    _b.makeEmpty(); o.updateWorldMatrix(true, true)
    o.traverse((m) => {
      if (!m.isMesh || !m.geometry?.attributes.position) return
      if (m.isInstancedMesh) { const sp = m.userData.fullSphere ?? (m.computeBoundingSphere(), m.boundingSphere); if (sp) _b.union(_bs.copy(sp).applyMatrix4(m.matrixWorld).getBoundingBox(_b2)) }
      else { if (!m.geometry.boundingBox) m.geometry.computeBoundingBox(); _b.union(_b2.copy(m.geometry.boundingBox).applyMatrix4(m.matrixWorld)) }
    })
    if (_b.isEmpty() || !isFinite(_b.min.x) || !isFinite(_b.max.x)) continue
    const sx = _b.max.x - _b.min.x, sz = _b.max.z - _b.min.z
    if (sx > 420 || sz > 420) continue   // 天空、雲、整圈的東西
    objs.push({ o, b: _b.clone() })
  }
}
// 2026-11-17 高山區整組（alpineInterior）以前整個跳過：從非洲往西回看，山脊後面的地形塊、整批的道具（一百多萬面）照畫。
// 改成一個一個 mesh 判斷（只看非洲以外的）。藏的方法用 layers（mask＝0），不動 visible——地形塊的遠近版本是用 visible 切的（alpine.js TERRAIN_LOD）
function collectSub(root) {
  root.updateWorldMatrix(true, true)
  root.traverse((m) => {
    if (!m.isMesh || m.isSkinnedMesh || m.userData.noOcc || m.geometry?.isInstancedBufferGeometry || !m.geometry?.attributes.position) return   // 草（InstancedBufferGeometry）lod.js 自己判斷
    _b.makeEmpty()
    if (m.isInstancedMesh) { const sp = m.userData.fullSphere ?? (m.computeBoundingSphere(), m.boundingSphere); if (!sp) return; _b.copy(_bs.copy(sp).applyMatrix4(m.matrixWorld).getBoundingBox(_b2)) }
    else { if (!m.geometry.boundingBox) m.geometry.computeBoundingBox(); _b.copy(m.geometry.boundingBox).applyMatrix4(m.matrixWorld) }
    if (_b.isEmpty() || !isFinite(_b.min.x) || !isFinite(_b.max.x) || _b.max.x - _b.min.x > 420 || _b.max.z - _b.min.z > 420) return
    _b.getCenter(_v); if (savK(_v.x, _v.z) > 0.05) return   // 非洲裡面的照畫
    objs.push({ o: m, b: _b.clone(), sub: true })
  })
}
const hideSub = (o) => { o.userData.occMask = o.layers.mask; o.layers.mask = 0 }
const showSub = (o) => { if (o.layers.mask === 0 && o.userData.occMask !== undefined) o.layers.mask = o.userData.occMask; delete o.userData.occMask }
// 包圍盒頂面每 ≤ 8 m 取一點，全部被擋才算看不到
function boxHidden(b) {
  const nx = Math.min(40, Math.max(1, Math.ceil((b.max.x - b.min.x) / 8))), nz = Math.min(40, Math.max(1, Math.ceil((b.max.z - b.min.z) / 8))), y = b.max.y + 0.5
  for (let i = 0; i <= nx; i++) for (let j = 0; j <= nz; j++) {
    if (!occHidden(b.min.x + (b.max.x - b.min.x) * i / nx, y, b.min.z + (b.max.z - b.min.z) * j / nz, b.min.y)) return false
  }
  return true
}
export function occObjects(scene, now = performance.now()) {
  if (!occ.on) { if (mine.size) { for (const o of mine) if (o.userData.occMask !== undefined) showSub(o); else o.visible = true; mine.clear(); return true } return false }
  const t0 = performance.now()
  if (!objs || now - objT > 6000) { collect(scene); objT = now }   // 鳥是串流載入的：隔一陣子重新收集
  let hid = 0, shown = false
  for (const it of objs) {
    let h
    if (it.sub) {   // 高山區的 mesh：本來就沒在畫的（遠近版本沒輪到的地形塊、count 0）不用算
      const o = it.o
      if (!mine.has(o) && (!o.visible || o.layers.mask === 0 || (o.isInstancedMesh && o.count === 0))) continue
      h = boxHidden(it.b)
      if (h) { if (!mine.has(o)) { hideSub(o); mine.add(o) } hid++ }
      else if (mine.has(o)) { showSub(o); mine.delete(o); shown = true }
      continue
    }
    if (it.move) { it.o.getWorldPosition(_v); _b.setFromCenterAndSize(_v, _sz); h = boxHidden(_b) }
    else h = boxHidden(it.b)
    if (h) { if (it.o.visible) { it.o.visible = false; mine.add(it.o) } if (mine.has(it.o)) hid++ }
    else if (mine.has(it.o)) { it.o.visible = true; mine.delete(it.o); shown = true }
  }
  occ.hidden = hid; occ.checked = objs.length; occ.ms = +(performance.now() - t0).toFixed(2)
  return shown   // 有東西重新出現：影子要重畫
}
