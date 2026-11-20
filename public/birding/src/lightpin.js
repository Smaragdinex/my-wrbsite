// 2026-11-20 卡頓修正（使用者：「玩家在遊玩時候不要很卡」）：
// three.js 的每個材質都照「場景裡看得到幾盞點光源」編 shader；數量一變，全部材質都要重新編譯（走進非洲量到一次卡 1.5 秒、編 101 個）。
// 營地、洞穴、山屋、相機行的燈都掛在各自的群組底下，群組被遮擋剔除／LOD 藏起來時燈也跟著消失 → 燈的數量跟著玩家位置一直變（量到 1、11、14、16 盞）。
// 做法：把這些點光源搬到場景最上層（永遠算進數量），原位留一個空物件當錨點；每次畫之前跟著錨點的位置走，
// 錨點所在的群組看不到時亮度設 0（跟以前「整盞不見」看起來一樣），看得到時還原。
import * as THREE from 'three'

const pinned = []   // { l, anchor }
let scanT = -1e9

function scan(scene) {
  const found = []
  scene.traverse((o) => { if (o.isPointLight && o.parent && o.parent !== scene && !o.userData.pinned) found.push(o) })
  for (const l of found) {
    for (let p = l.parent; p; p = p.parent) if (p.isCamera) { l.userData.pinned = 'skip'; break }
    if (l.userData.pinned) continue
    const anchor = new THREE.Object3D(); anchor.name = 'lightAnchor'
    anchor.position.copy(l.position); l.parent.add(anchor)
    scene.add(l); l.userData.pinned = true; l.userData.pinI = l.intensity
    pinned.push({ l, anchor })
  }
}

function shown(o, scene) {
  for (let p = o; p && p !== scene; p = p.parent) if (!p.visible) return false
  return true
}

const _v = new THREE.Vector3()
export function pinLights(scene) {
  scan(scene)
  const prev = scene.onBeforeRender
  scene.onBeforeRender = function (renderer, sc, camera, rt) {
    const now = performance.now()
    if (now - scanT > 5000) { scanT = now; scan(scene) }   // 之後才加進來的燈（例如晚點載入的區域）也收進來
    for (const P of pinned) {
      const { l, anchor } = P
      if (!anchor.parent) { if (!P.gone) { P.gone = true; l.intensity = 0 } continue }   // 原本的群組被拿掉了
      anchor.getWorldPosition(_v)
      if (!_v.equals(l.position)) { l.position.copy(_v); l.updateMatrixWorld() }
      if (!shown(anchor, scene)) { if (!P.off) { P.off = true; P.i = l.intensity } l.intensity = 0 }
      else if (P.off) { P.off = false; if (l.intensity === 0) l.intensity = P.i }
    }
    prev?.call(this, renderer, sc, camera, rt)
  }
  return pinned.length
}
