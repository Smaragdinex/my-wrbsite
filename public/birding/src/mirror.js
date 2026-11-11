// 平面倒影（2026-11-11 濕地 V3「鏡面水」，照 structures.js 花園水池那套抽出來）：
// 鏡射鏡頭對 y = Y 翻過去、斜切近平面（水面以下不畫進倒影），畫到一張小貼圖；水面 shader 用 uReflMat 投影回去取樣。
// 鏡頭離 center 超過 maxDist 就不更新、uReflOn = 0（shader 退回假的環境倒影）
import * as THREE from 'three'

export function createMirror({ Y, center, maxDist = 110, hide = [] }) {
  const rt = new THREE.WebGLRenderTarget(512, 512, { type: THREE.HalfFloatType })
  const uRefl = { value: rt.texture }, uReflMat = { value: new THREE.Matrix4() }, uReflOn = { value: 0 }
  const vCam = new THREE.PerspectiveCamera(), clip = new THREE.Plane(), cp = new THREE.Vector4(), qv = new THREE.Vector4()
  const C = new THREE.Vector3(center[0], Y, center[1]), dir = new THREE.Vector3(), N = new THREE.Vector3(0, 1, 0), P0 = new THREE.Vector3(0, Y, 0)
  let frame = 0
  function reflect(renderer, scene, camera, scale = 0.5, every = 2) {
    const far = camera.position.distanceTo(C) > maxDist || camera.position.y < Y + 0.05
    uReflOn.value = far ? 0 : 1
    if (far || frame++ % every) return
    const w = Math.max(64, Math.round(renderer.domElement.width * scale)), h = Math.max(64, Math.round(renderer.domElement.height * scale))
    if (rt.width !== w || rt.height !== h) rt.setSize(w, h)
    camera.updateMatrixWorld()
    vCam.copy(camera, false); vCam.layers.set(0)   // layer 1（草葉）不畫進倒影
    vCam.position.set(camera.position.x, 2 * Y - camera.position.y, camera.position.z)
    dir.set(0, 0, -1).applyQuaternion(camera.quaternion); dir.y = -dir.y
    vCam.up.set(0, 1, 0); vCam.lookAt(vCam.position.clone().add(dir)); vCam.updateMatrixWorld()
    vCam.projectionMatrix.copy(camera.projectionMatrix)
    uReflMat.value.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1).multiply(vCam.projectionMatrix).multiply(vCam.matrixWorldInverse)
    clip.setFromNormalAndCoplanarPoint(N, P0).applyMatrix4(vCam.matrixWorldInverse)
    cp.set(clip.normal.x, clip.normal.y, clip.normal.z, clip.constant)
    const e = vCam.projectionMatrix.elements
    qv.set((Math.sign(cp.x) + e[8]) / e[0], (Math.sign(cp.y) + e[9]) / e[5], -1, (1 + e[10]) / e[14])
    cp.multiplyScalar(2 / cp.dot(qv))
    e[2] = cp.x; e[6] = cp.y; e[10] = cp.z + 1 - 0.003; e[14] = cp.w
    for (const m of hide) m.visible = false
    const prevRT = renderer.getRenderTarget(), prevAuto = renderer.shadowMap.autoUpdate
    renderer.shadowMap.autoUpdate = false
    renderer.setRenderTarget(rt); renderer.clear(); renderer.render(scene, vCam)
    renderer.setRenderTarget(prevRT); renderer.shadowMap.autoUpdate = prevAuto
    for (const m of hide) m.visible = true
  }
  return { uRefl, uReflMat, uReflOn, reflect, hide }
}
