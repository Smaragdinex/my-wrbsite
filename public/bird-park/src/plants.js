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

export async function loadPlants(onProgress) {
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
  const meshes = []
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
  }
  // LOD（lod.js）：這種植物大概多高＝模型高 × 中位數縮放
  const ys = list.map((it) => it.s.y).sort((a, b) => a - b)
  lodRegister(meshes, H * ys[ys.length >> 1])
  return meshes
}

export const nodeHeight = (node) => { const b = new THREE.Box3().setFromObject(node); return b.max.y - b.min.y }
