// 2026-11-14 使用者「修正 FPS，讓他有 60 FPS 以上」：量出來瓶頸是 draw call 次數（每次約 10 微秒，主畫面 1,500 次＝13 ms），不是面數。
// 一般網格（不是 InstancedMesh）裡最多的是：每隻鳥的鳥棲樹（樹幹、枝、小枝、葉叢各一個，一棵 20 多次）、高山區、東區的小道具。
// 靜態合併：場景第二層的每個群組裡，「不會動、同材質、同陰影設定」的網格，照 32 m 一格合成一個網格（視野剔除照樣有效）。
// 原件不刪、visible 也不動（別的程式還拿得到、照樣可以切換）：只把它的 layers 清空（主畫面、影子、倒影都不畫）；
// 之後原件動了、被切換顯示、或它上面的群組被切換 → 那一組自動拆回原狀。
// 會動的不合：第一次看到先記位置，隔 3 秒以上再看一次沒動才合。標了 userData.noMerge 的整棵樹（相機行）不碰。
import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

const CELL = 32
const seen = new WeakMap()      // mesh → 第一次看到時的矩陣指紋
const done = new WeakSet()      // 已經處理過（合了或判定不合）的 mesh
const batches = []              // { root, merged: [Mesh], parts: [{ m, fp, chainVis }] }
export const batchStats = { batches: 0, merged: 0, meshesIn: 0, undone: 0, why: {} }
const why = (k) => { batchStats.why[k] = (batchStats.why[k] || 0) + 1; return false }

const fp = (o) => { const e = o.matrixWorld.elements; return e[0] * 1.3 + e[5] * 2.1 + e[10] * 3.7 + e[12] * 5.3 + e[13] * 7.1 + e[14] * 11.9 + e[1] * 0.7 + e[8] * 0.9 }
const chainVisible = (o, root) => { for (let p = o; p && p !== root; p = p.parent) { if (p === o) continue; if (!p.visible) return false } return true }
const blocked = (o, root) => { for (let p = o; p && p !== root.parent; p = p.parent) if (p.userData.noMerge || p.isSkinnedMesh || p.isBone || /_rig$|Armature/.test(p.name)) return true; return false }
// 材質的「內容」：很多零件各自 new 一份一模一樣的材質（顏色、貼圖、參數都一樣），照 uuid 分就合不起來
const _msig = new WeakMap()
function matSig(m) {
  let k = _msig.get(m); if (k) return k
  if (!(m.isMeshStandardMaterial || m.isMeshLambertMaterial || m.isMeshBasicMaterial || m.isMeshPhongMaterial)) { k = m.uuid; _msig.set(m, k); return k }
  const tex = (t) => t ? t.uuid : '-'
  k = [m.type, m.color?.getHexString(), m.emissive?.getHexString(), m.emissiveIntensity, m.roughness, m.metalness, m.opacity, m.alphaTest, m.side, m.vertexColors ? 1 : 0, m.flatShading ? 1 : 0, m.envMapIntensity,
    tex(m.map), tex(m.normalMap), tex(m.roughnessMap), tex(m.aoMap), tex(m.alphaMap), tex(m.emissiveMap), m.fog ? 1 : 0, m.depthWrite ? 1 : 0, m.colorWrite ? 1 : 0,
    m.onBeforeCompile ? m.onBeforeCompile.toString().length + ':' + m.onBeforeCompile.toString().slice(0, 80) : '-', m.customProgramCacheKey ? m.customProgramCacheKey() : '-'].join('|')
  // onBeforeCompile 是各自的閉包（可能各自抓了不同的 uniform 物件）：程式碼一樣但不是同一個函式的，保守起見照函式本身分
  if (m.onBeforeCompile && m.onBeforeCompile !== THREE.Material.prototype.onBeforeCompile) { let id = _fnId.get(m.onBeforeCompile); if (id == null) _fnId.set(m.onBeforeCompile, (id = _fnN++)); k += '|f' + id }
  _msig.set(m, k); return k
}
const _fnId = new WeakMap(); let _fnN = 0
const attrSig = (g) => Object.keys(g.attributes).sort().map((k) => k + g.attributes[k].itemSize).join(',') + (g.index ? '|i' : '|n')

function eligible(o, root) {
  if (!o.isMesh || o.isInstancedMesh || o.isSkinnedMesh || done.has(o)) return false
  const g = o.geometry
  if (!g || g.isInstancedBufferGeometry || Object.keys(g.morphAttributes || {}).length) return why('geo')   // groups（方塊、圓柱預設每面一組）不影響：材質只有一個
  const m = o.material
  if (!m || Array.isArray(m)) return why('matArr')
  if (m.transparent) return why('transparent')
  if (m.isShaderMaterial) return why('shader')
  if (o.onBeforeRender !== THREE.Object3D.prototype.onBeforeRender && o.onBeforeRender.toString().length > 20) return why('obr')   // 自己有每格邏輯的
  if (!o.visible || !chainVisible(o, root)) return why('hidden')
  if (!(o.layers.mask & 1) && !o.userData.tinyOff) return why('layer')   // tinyOff：只是太遠被 lod.js 暫時關掉，可以合
  if (blocked(o, root)) return why('blocked')
  return true
}

// 每隔幾秒呼叫一次（world.js tick）：取樣 → 合併 → 檢查已合的有沒有動
export function staticBatch(scene, now = performance.now()) {
  // 1. 已合的：原件動了或被切換顯示 → 拆回
  for (let i = batches.length - 1; i >= 0; i--) {
    const B = batches[i]
    let bad = !B.root.parent
    if (!bad) for (const p of B.parts) { if (Math.abs(fp(p.m) - p.fp) > 1e-4 || !p.m.visible || !chainVisible(p.m, B.root) || p.m.parent == null) { bad = true; break } }
    if (bad) {
      for (const mm of B.merged) { mm.parent?.remove(mm); mm.geometry.dispose() }
      for (const p of B.parts) { p.m.layers.mask = p.mask; delete p.m.userData.batched; done.delete(p.m) }
      batches.splice(i, 1); batchStats.undone++
    }
  }
  // 2. 新的：每個第二層群組
  // 根：每個頂層群組整棵（同一格、同材質的合在一起）；之後有零件動了或被切換，只拆回它所在的那一組（同材質同一格），不會整棵拆掉
  const roots = []
  for (const top of scene.children) { if (top.userData.noMerge || top.isMesh) continue; roots.push({ root: top, shallow: false }) }
  let added = 0
  for (const { root, shallow } of roots) {
    if (root.userData.noMerge || !root.visible) continue
    root.updateMatrixWorld(true)
    const cand = []
    const walk = (fn) => { if (!shallow) return root.traverse(fn); for (const c of root.children) if (c.isMesh) c.traverse(fn) }
    walk((o) => {
      if (o === root || !eligible(o, root)) return
      const f = fp(o), r = seen.get(o)
      if (!r) { seen.set(o, { f, t: now }); return }
      if (Math.abs(r.f - f) > 1e-4) { seen.set(o, { f, t: now }); return }   // 動了：重新計時
      if (now - r.t < 3000) return
      cand.push(o)
    })
    if (cand.length < 3) { if (cand.length) why('few:' + (root.name || root.parent?.name || '?')); continue }
    // 照「材質＋陰影＋屬性＋格子」分組
    const inv = new THREE.Matrix4().copy(root.matrixWorld).invert(), groups = new Map(), c = new THREE.Vector3()
    for (const o of cand) {
      const g = o.geometry; if (!g.boundingSphere) g.computeBoundingSphere()
      c.copy(g.boundingSphere.center).applyMatrix4(o.matrixWorld)
      const key = [matSig(o.material), o.castShadow ? 1 : 0, o.receiveShadow ? 1 : 0, o.layers.mask | (o.userData.tinyOff ? 1 : 0), o.renderOrder, o.frustumCulled ? 1 : 0, attrSig(g), Math.floor(c.x / CELL), Math.floor(c.z / CELL)].join('/')
      let G = groups.get(key); if (!G) groups.set(key, (G = [])); G.push(o)
    }
    const merged = [], parts = []
    for (const G of groups.values()) {
      if (G.length < 2) { why('single'); continue }
      let geo
      try {
        geo = mergeGeometries(G.map((o) => { const q = o.geometry.clone(); q.clearGroups(); q.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld)); return q }), false)
      } catch { geo = null }
      if (!geo) continue
      const o0 = G[0], mm = new THREE.Mesh(geo, o0.material)
      mm.castShadow = o0.castShadow; mm.receiveShadow = o0.receiveShadow; mm.layers.mask = o0.layers.mask | 1; mm.renderOrder = o0.renderOrder; mm.frustumCulled = o0.frustumCulled
      mm.customDepthMaterial = o0.customDepthMaterial; mm.customDistanceMaterial = o0.customDistanceMaterial
      mm.name = 'batch'; mm.userData.batch = true; mm.userData.noBake = true
      geo.computeBoundingSphere()
      root.add(mm); merged.push(mm)
      for (const o of G) { parts.push({ m: o, fp: fp(o), mask: o.layers.mask | (o.userData.tinyOff ? 1 : 0) }); delete o.userData.tinyOff; o.layers.mask = 0; o.userData.batched = true; done.add(o) }
      batches.push({ root, merged: [mm], parts: parts.slice(parts.length - G.length) })
      batchStats.meshesIn += G.length
    }
    if (merged.length) { batchStats.batches++; batchStats.merged += merged.length; added += parts.length }
  }
  return added
}
