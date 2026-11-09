// 寫實樹皮（2026-11-10）：Poly Haven CC0 掃描的樹皮貼圖（models/plants/bark/，原檔在 models/raw/ph/）
// metasequoia_bark：紅褐色、縱向纖維條（巨木＝紅檜）；japanese_cedar_bark：神木；pine_bark：冷杉、鐵杉
// 每組三張：diff 顏色、nor_gl 法線（凹凸）、arm（R 陰影 AO、G 粗糙度）
import * as THREE from 'three'

const VER = new URL(import.meta.url).searchParams.get('v') ?? ''
const TL = new THREE.TextureLoader()
const cache = new Map()

function tex(name, kind, srgb) {
  const key = name + kind
  if (cache.has(key)) return cache.get(key)
  const t = TL.load(`models/plants/bark/${name}_${kind}.jpg?v=${VER}`)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.anisotropy = 8
  if (srgb) t.colorSpace = THREE.SRGBColorSpace
  cache.set(key, t)
  return t
}

// 樹皮材質：normal 凹凸的強度、color 整體再乘一個顏色（貼圖本身偏暗的可以提亮）
export function barkMaterial(name, { normal = 1.4, color = 0xffffff, ao = 1 } = {}) {
  const arm = tex(name, 'arm', false)
  return new THREE.MeshStandardMaterial({
    map: tex(name, 'diff', true), normalMap: tex(name, 'nor_gl', false), normalScale: new THREE.Vector2(normal, normal),
    roughnessMap: arm, aoMap: arm, aoMapIntensity: ao, roughness: 1, metalness: 0,
    color: Array.isArray(color) ? new THREE.Color().setRGB(...color) : color,   // [r, g, b] 可以超過 1（掃描貼圖偏暗，要提亮）
  })
}
