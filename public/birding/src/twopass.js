// 2026-11-20 FPS（使用者：「改善 FPS 但不要減少美術材質」）：
// three.js 畫「透明＋雙面」材質時，每個物件每格先把材質改成背面、needsUpdate、畫一次，再改成正面、needsUpdate、畫一次
// （renderObject 裡），每次 needsUpdate 都要重新查一次 shader（getParameters／getProgram）。溫室玻璃、窗玻璃、發光燈罩共 21 個。
// 做法：拆成兩個物件——原物件用背面材質（就是原本那個，改成 BackSide），底下加一個子物件用正面材質（複製一份）。
// 兩個位置一樣、排序距離一樣，子物件 id 比較大 → 照 id 排在後面畫：背面先、正面後，跟 three.js 原本的順序一樣，畫面不變。
// 正面材質每格從原材質抄會變的數值（亮度、透明度、顏色…），原物件被遮擋剔除（layers）藏起來時子物件跟著藏。
import * as THREE from 'three'

const pairs = []   // { o, m, f, child }
const fronts = new Map()   // 原材質 → 正面材質（共用材質的物件共用同一份）
let scanT = -1e9
const COPY = ['opacity', 'emissiveIntensity', 'roughness', 'metalness', 'envMapIntensity', 'depthWrite', 'depthTest', 'visible', 'map', 'emissiveMap', 'alphaMap', 'normalMap', 'transmission', 'thickness', 'ior', 'clearcoat', 'sheen', 'iridescence', 'alphaTest']
const COLORS = ['color', 'emissive', 'specularColor', 'attenuationColor', 'sheenColor']

function scan(scene) {
  const list = []
  scene.traverse((o) => {
    const m = o.material
    if (!o.isMesh || o.isInstancedMesh || o.isSkinnedMesh || Array.isArray(m) || !m || o.userData.twoPass || o.name === 'twoPassFront') return
    if (m.transparent !== true || m.side !== THREE.DoubleSide || m.forceSinglePass) return
    if (m.onBeforeCompile !== THREE.Material.prototype.onBeforeCompile || m.onBeforeRender !== THREE.Material.prototype.onBeforeRender) return   // 自己改 shader 的材質（複製品拿不到同一份 uniform）照舊
    list.push(o)
  })
  for (const o of list) {
    const m = o.material
    let f = fronts.get(m)
    if (!f) { f = m.clone(); f.side = THREE.FrontSide; f.userData = { ...m.userData, twoPassOf: m.uuid }; fronts.set(m, f) }
    if (m.shadowSide == null) m.shadowSide = THREE.DoubleSide   // 影子照原本雙面的算法（不然 BackSide 的影子會變成只投正面）
    m.side = THREE.BackSide; m.needsUpdate = true
    const child = new THREE.Mesh(o.geometry, f)
    child.name = 'twoPassFront'; child.castShadow = false; child.receiveShadow = o.receiveShadow
    child.renderOrder = o.renderOrder; child.frustumCulled = o.frustumCulled; child.layers.mask = o.layers.mask
    o.add(child); o.userData.twoPass = true
    pairs.push({ o, m, f, child })
  }
}

export function twoPass(scene) {
  scan(scene)
  const prev = scene.onBeforeRender
  scene.onBeforeRender = function (renderer, sc, camera, rt) {
    const now = performance.now()
    if (now - scanT > 5000) { scanT = now; scan(scene) }
    const done = new Set()
    for (const P of pairs) {
      const { o, m, f, child } = P
      if (o.material !== m) { if (child.parent) { child.parent.remove(child); m.side = THREE.DoubleSide; m.needsUpdate = true } continue }   // 別的程式換了材質：拆回去
      if (child.layers.mask !== o.layers.mask) child.layers.mask = o.layers.mask
      if (done.has(f)) continue; done.add(f)
      for (const k of COPY) if (k in m && f[k] !== m[k]) f[k] = m[k]
      for (const k of COLORS) if (m[k]?.isColor && !f[k].equals(m[k])) f[k].copy(m[k])
    }
    prev?.call(this, renderer, sc, camera, rt)
  }
  return pairs.length
}
// 測試用：on=false 暫時還原成 three.js 原本的畫法（比對畫面是否一模一樣）
export function twoPassToggle(on) {
  for (const P of pairs) { P.child.visible = on; P.m.side = on ? THREE.BackSide : THREE.DoubleSide; P.m.needsUpdate = true }
}
