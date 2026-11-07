// 寫實植物／岩石模型（models/plants/*.glb，由 tools/export-plants.py 產生）
// 每個 glb 裡一株一個節點，原點在根部中心、單位公尺；這裡負責載入並用 InstancedMesh 大量擺放
import * as THREE from 'three'
import { lodRegister } from './lod.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js'
import { addWind } from './wind.js'

const FILES = [
  'tropical_pack', 'palm2', 'jungle_tree', 'bromeliads', 'anthurium', 'calathea_orbifolia', 'fern_02',
  'pachira_aquatica', 'rock_moss_set', 'rock_moss_set_02', 'boulder', 'rock_face', 'rock_face_02',
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
function parts(node) {
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
