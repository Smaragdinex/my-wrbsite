// 2026-11-20 FPS（使用者：「改善 FPS 但不要減少美術材質」）：
// three.js 每個材質只記「上一次用的 shader」。同一個材質給「有每棵各自顏色（instanceColor）」和「沒有」的 InstancedMesh 共用時，
// 每畫一個就要換一次 shader、重新算一次參數（getParameters／getProgram）——量到相機行一格 500 次。石頭、蕨類大多是這樣（83 個材質）。
// 做法：沒有 instanceColor 的那些補一個全白的（顏色 × 1.0 完全不變），共用同一個材質的就都走同一個 shader。不改材質、不複製材質。
import * as THREE from 'three'

let scanT = -1e9
function scan(scene) {
  const colored = new Set(), plain = []
  scene.traverse((o) => {
    if (!o.isInstancedMesh) return
    const ms = Array.isArray(o.material) ? o.material : [o.material]
    if (o.instanceColor) for (const m of ms) colored.add(m)
    else plain.push(o)
  })
  let n = 0
  for (const o of plain) {
    const ms = Array.isArray(o.material) ? o.material : [o.material]
    if (!ms.some((m) => colored.has(m))) continue
    const cap = o.instanceMatrix.count
    o.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3).fill(1), 3)
    o.userData.whiteColor = true; n++
  }
  return n
}

export function unifyVariants(scene) {
  const n = scan(scene)
  const prev = scene.onBeforeRender
  scene.onBeforeRender = function (renderer, sc, camera, rt) {
    const now = performance.now()
    if (now - scanT > 5000) { scanT = now; scan(scene) }   // 之後才建的（自動 LOD 的低模、晚載入的區域）
    prev?.call(this, renderer, sc, camera, rt)
  }
  return n
}
// 測試用：on=false 暫時拿掉補上的白色（比對畫面）
const _saved = new WeakMap()
export function variantsToggle(scene, on) {
  scene.traverse((o) => { if (!o.userData.whiteColor) return; if (on) { if (!o.instanceColor) o.instanceColor = _saved.get(o) } else if (o.instanceColor) { _saved.set(o, o.instanceColor); o.instanceColor = null } })
}
