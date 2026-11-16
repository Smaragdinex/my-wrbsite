// 寫實植物／岩石模型（models/plants/*.glb，由 tools/export-plants.py 產生）
// 每個 glb 裡一株一個節點，原點在根部中心、單位公尺；這裡負責載入並用 InstancedMesh 大量擺放
import * as THREE from 'three'
import { lodSetShadowGen } from './lod.js'
import { lodRegister, lodSetLowGen } from './lod.js'
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js'
import { addWind } from './wind.js'

const FILES = [
  'tropical_pack', 'palm2', 'jungle_tree', 'bromeliads', 'anthurium', 'calathea_orbifolia', 'fern_02',
  'pachira_aquatica', 'rock_moss_set', 'rock_moss_set_02', 'boulder', 'rock_face', 'rock_face_02',
  'tree_stump_1k', 'dead_tree_trunk_1k', 'koi',   // 2026-11-14 雀榕不用了（換圓樹冠闊葉樹，alpine.js），不再載 figtree.glb（2 MB）   // 2026-11-10 雀榕（tools/make-figtree.py）、山下湖的錦鯉（Tripo）   // 2026-11-10 巨木林的樹頭、倒木
]

// 版本號跟著 index.html 的 ?v= 走，上線後模型才不會用到快取的舊版
const VER = new URL(import.meta.url).searchParams.get('v') ?? ''

// 遠處用的低面數版本：載入時用 meshoptimizer 把每個零件簡化成約 1/4（共用頂點、只換索引，不多佔顯示記憶體）。
// 模型檔不動（蕨類的原始素材 tropical_pack 已經不在 models/raw，沒辦法回 Blender 重做）。
let simp = null
const LOW_RATIO = 0.25, LOW_ERR = 0.04, LOW_MIN_TRIS = 1200
const lowCache = new Map()
export function lowGeo(geo) {
  if (lowCache.has(geo)) return lowCache.get(geo)
  let out = null
  const pos = geo.attributes.position
  if (simp && geo.index && geo.index.count / 3 >= LOW_MIN_TRIS) {
    const P = new Float32Array(pos.count * 3)
    for (let i = 0; i < pos.count; i++) { P[i * 3] = pos.getX(i); P[i * 3 + 1] = pos.getY(i); P[i * 3 + 2] = pos.getZ(i) }
    const idx = new Uint32Array(geo.index.array)
    // LockBorder：葉子是一片片開放的面，邊緣鎖住，葉形（去背的輪廓）才不會被吃掉
    const [res] = simp.simplify(idx, P, 3, Math.floor(idx.length * LOW_RATIO / 3) * 3, LOW_ERR, ['LockBorder'])
    if (res.length < idx.length * 0.7) {
      out = new THREE.BufferGeometry()
      for (const [k, a] of Object.entries(geo.attributes)) out.setAttribute(k, a)
      out.setIndex(new THREE.BufferAttribute(res, 1))
      if (!geo.boundingSphere) geo.computeBoundingSphere()
      out.boundingSphere = geo.boundingSphere.clone(); out.boundingBox = geo.boundingBox?.clone() ?? null
    }
  }
  lowCache.set(geo, out)
  return out
}
lodSetLowGen(lowGeo)
// 2026-11-17 使用者「紅杉林、非洲區很卡」：量到走路每 24 m 陰影搬家重畫時，陰影要畫 960 萬個三角形（紅杉林），那一格卡 50～500 ms。
// 陰影專用的更粗版本：再減到 18%、不鎖邊（陰影貼圖一個貼素 7 公分，葉片輪廓的細節本來就畫不出來）
const shCache = new Map()
export function shadowGeo(geo, mat = null) {
  const opaque = !(mat?.alphaTest > 0) && !mat?.transparent
  if (shCache.has(geo)) return shCache.get(geo)
  if (!simp) return null   // 減面器還沒載好：先不快取，下次再試
  let out = null
  if (!geo.index) { try { geo = mergeVertices(geo) } catch { geo = null } }   // 沒有索引的（針葉卡、葉片）先合併頂點才能減面
  const src = arguments[0]
  if (!geo?.index) { shCache.set(src, null); return null }
  const pos = geo.attributes.position
  if (geo.index.count / 3 >= 200) {
    const P = new Float32Array(pos.count * 3)
    for (let i = 0; i < pos.count; i++) { P[i * 3] = pos.getX(i); P[i * 3 + 1] = pos.getY(i); P[i * 3 + 2] = pos.getZ(i) }
    const idx = new Uint32Array(geo.index.array)
    const tgt = Math.max(36, Math.floor(idx.length * 0.18 / 3) * 3)
    let [res] = simp.simplify(idx, P, 3, tgt, 0.12, [])
    // 掃描的石頭：UV 接縫把網格切成很多塊，減面收不起來 → 不透明的（opaque）照位置把頂點焊起來再減（影子用不到 UV）
    if (res.length > idx.length * 0.6 && opaque) {
      const key = new Map(), remap = new Uint32Array(pos.count)
      for (let i = 0; i < pos.count; i++) { const k = Math.round(P[i * 3] * 1e4) + ',' + Math.round(P[i * 3 + 1] * 1e4) + ',' + Math.round(P[i * 3 + 2] * 1e4); let j = key.get(k); if (j == null) { j = i; key.set(k, i) } remap[i] = j }
      const wi = idx.map((v) => remap[v])
      ;[res] = simp.simplify(wi, P, 3, tgt, 0.12, [])
      // 掃描石頭的網格不是封閉流形，一般減面卡在 65%：改用頂點分群（格子 = 包圍盒最長邊的 1/14，同一格的頂點併成一點、丟掉退化的三角形）
      if (res.length > idx.length * 0.6) {
        if (!geo.boundingBox) geo.computeBoundingBox()
        const bb = geo.boundingBox, cell = Math.max(bb.max.x - bb.min.x, bb.max.y - bb.min.y, bb.max.z - bb.min.z) / 14
        const cm = new Map(), cr = new Uint32Array(pos.count)
        for (let i = 0; i < pos.count; i++) { const k = Math.floor((P[i * 3] - bb.min.x) / cell) + ',' + Math.floor((P[i * 3 + 1] - bb.min.y) / cell) + ',' + Math.floor((P[i * 3 + 2] - bb.min.z) / cell); let j = cm.get(k); if (j == null) { j = i; cm.set(k, i) } cr[i] = j }
        const out2 = [], seen = new Set()
        for (let t = 0; t < idx.length; t += 3) { const a2 = cr[idx[t]], b2 = cr[idx[t + 1]], c2 = cr[idx[t + 2]]; if (a2 === b2 || b2 === c2 || a2 === c2) continue; const k = [a2, b2, c2].sort((x, y) => x - y).join(','); if (seen.has(k)) continue; seen.add(k); out2.push(a2, b2, c2) }
        res = new Uint32Array(out2)
      }
    }
    if (res.length < idx.length * 0.6) {
      out = new THREE.BufferGeometry()
      for (const [k, a] of Object.entries(geo.attributes)) out.setAttribute(k, a)
      out.setIndex(new THREE.BufferAttribute(res, 1))
      if (!geo.boundingSphere) geo.computeBoundingSphere()
      out.boundingSphere = geo.boundingSphere.clone()
    }
  }
  shCache.set(src, out)
  return out
}
lodSetShadowGen(shadowGeo)   // lod.js 自動補低面數版本用（石頭、岩廊牆…不是 scatter 種的）

export async function loadPlants(onProgress) {
  simp = await import('https://cdn.jsdelivr.net/npm/meshoptimizer@0.22.0/meshopt_simplifier.module.js')
    .then(async (m) => { await m.MeshoptSimplifier.ready; return m.MeshoptSimplifier }).catch(() => null)   // 載不到就全部用原本的模型
  const draco = new DRACOLoader().setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.174.0/examples/jsm/libs/draco/gltf/')
  const loader = new GLTFLoader().setDRACOLoader(draco)
  const lib = {}
  let done = 0
  await Promise.all(FILES.map(async (f) => {
    const g = await loader.loadAsync(`models/plants/${f}.glb?v=${VER}`)
    for (const o of [...g.scene.children]) lib[o.name] = o
    onProgress?.(++done / FILES.length)
  }))
  draco.dispose()
  return lib
}

// 一個節點拆成（幾何, 材質）清單；葉子材質改成 alphaTest＋雙面，才有正確的深度和影子
const partsCache = new Map()
export function parts(node) {
  if (partsCache.has(node)) return partsCache.get(node)
  const out = []
  node.updateMatrixWorld(true)
  const inv = new THREE.Matrix4().copy(node.matrixWorld).invert()
  node.traverse((o) => {
    if (!o.isMesh) return
    const geo = o.geometry.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld))
    const m = o.material
    if (m.map && (m.transparent || m.alphaTest > 0 || m.alphaMap)) {
      m.transparent = false
      m.alphaTest = 0.45
      m.depthWrite = true
      m.side = THREE.DoubleSide
      m.alphaToCoverage = false
    }
    m.envMapIntensity = 0.6
    out.push({ geo, mat: m })
  })
  partsCache.set(node, out)
  return out
}

// list: [{ p: Vector3, q: Quaternion, s: Vector3, c?: Color }]
// wind：樹梢（模型最高處）擺動幾公尺
const _m = new THREE.Matrix4()
export function scatter(scene, node, list, { wind = 0, cast = true, receive = true } = {}) {
  if (!node || !list.length) return []
  const meshes = [], lows = []
  const box = new THREE.Box3().setFromObject(node)
  const H = Math.max(0.2, box.max.y - box.min.y)
  for (const { geo, mat } of parts(node)) {
    let m = mat
    if (wind > 0) m = addWind(mat.clone(), wind / (H * H))
    const im = new THREE.InstancedMesh(geo, m, list.length)
    list.forEach((it, i) => {
      _m.compose(it.p, it.q, it.s)
      im.setMatrixAt(i, _m)
      if (it.c) im.setColorAt(i, it.c)
    })
    im.castShadow = cast
    im.receiveShadow = receive
    // 矮的植物（< 2.5 公尺）放 layer 1：水面倒影不畫（倒影裡看不出來，又是大部分的繪製次數）
    if (H < 2.5) im.layers.set(1)
    im.computeBoundingSphere()
    scene.add(im)
    meshes.push(im)
    // 遠處的低面數版本：同一份材質、同樣的擺放，一開始 0 株（lod.js 分配）
    const lg = lowGeo(geo)
    if (lg) {
      const lo = new THREE.InstancedMesh(lg, m, list.length)
      lo.instanceMatrix.array.set(im.instanceMatrix.array)
      if (im.instanceColor) lo.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(im.instanceColor.array), 3)
      lo.castShadow = cast; lo.receiveShadow = receive; lo.layers.mask = im.layers.mask
      lo.boundingSphere = im.boundingSphere.clone(); lo.count = 0
      scene.add(lo)
      lows.push(lo)
    } else lows.push(null)
  }
  // LOD（lod.js）：這種植物大概多高＝模型高 × 中位數縮放
  const ys = list.map((it) => it.s.y).sort((a, b) => a - b)
  lodRegister(meshes, H * ys[ys.length >> 1], lows)
  return meshes
}

export const nodeHeight = (node) => { const b = new THREE.Box3().setFromObject(node); return b.max.y - b.min.y }
