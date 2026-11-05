// 第一人稱的手和相機：走路時相機拿在胸前（跟著腳步晃）、右鍵舉到眼前（舉到底就換成觀景窗）、按 E 把相機拿近看背面螢幕調設定。
// 手：models/hand-grip.glb（ChatGPT 畫手拿單眼的四視圖 → Tripo 建模 → tools/make-hand-grip.py 刪掉相機、對齊到我們機身的卡口），整隻手跟著相機動
// 相機：models/camera/body-*.glb＋lens-*.glb（tools/make-camera.py；卡口中心＝原點、鏡頭朝 -Z、背面螢幕朝 +Z）
// 只用右手拿相機：手指是 Tripo 生出來的真實握法（中指到小指繞握把前面、食指在快門、拇指在背面）。
// 整組掛在玩家鏡頭底下，放在 layer 3：拍照、測光的鏡頭不畫這層。
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'

export const VM_LAYER = 3
const VER = new URL(import.meta.url).searchParams.get('v') ?? ''
const loader = new GLTFLoader()
const load = (p) => loader.loadAsync(`${p}?v=${VER}`).then((g) => g.scene)
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z)
const { clamp, lerp, smoothstep: ss } = THREE.MathUtils
const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt))

// 鏡頭：長度（公尺，含遮光罩前的鏡身）、半徑；左手托的位置跟著它
// S：左手托的那一段的半徑（600mm 大砲後段比較細，前面才變粗）
const LENS = { l1: { L: 0.062, R: 0.033, S: 0.033 }, l2: { L: 0.145, R: 0.04, S: 0.04 }, l3: { L: 0.193, R: 0.047, S: 0.047 }, l4: { L: 0.26, R: 0.0525, S: 0.0525 }, l5: { L: 0.448, R: 0.084, S: 0.051 } }

// 相機（卡口中心）在三種狀態的位置／角度（鏡頭座標：x 右、y 上、-z 前）
const POSES = {
  carry: { p: V(0.095, -0.105, -0.28), r: new THREE.Euler(-0.18, 0.05, 0) },   // 照 ChatGPT 畫的參考圖（models/raw/ref/pov-camera-ref.png）：右下角、正正的背面朝玩家、稍微往前傾、底部被畫面切到
  raise: { p: V(0.0, -0.052, -0.085), r: new THREE.Euler(0, 0, 0) },            // 觀景窗貼在眼睛前
  view: { p: V(0.006, 0.03, -0.185), r: new THREE.Euler(0.3, 0, 0) },           // 拿近、往上翻一點，背面螢幕在畫面正中間
}

export async function createViewmodel(camera) {
  const root = new THREE.Group()
  camera.add(root)
  const [hand, ...cams] = await Promise.all(['models/hand-grip.glb', 'models/camera/body-b1.glb', 'models/camera/body-b2.glb', 'models/camera/body-b3.glb',
    'models/camera/lens-l1.glb', 'models/camera/lens-l2.glb', 'models/camera/lens-l3.glb', 'models/camera/lens-l4.glb', 'models/camera/lens-l5.glb'].map(load))
  const bodies = { b1: cams[0], b2: cams[1], b3: cams[2] }, lenses = { l1: cams[3], l2: cams[4], l3: cams[5], l4: cams[6], l5: cams[7] }
  const camRig = new THREE.Group()
  root.add(camRig)
  for (const m of [...Object.values(bodies), ...Object.values(lenses)]) { m.visible = false; camRig.add(m) }
  camRig.add(hand)
  root.traverse((o) => {
    o.layers.set(VM_LAYER)
    if (o.isMesh) { o.frustumCulled = false; o.castShadow = false; o.receiveShadow = false }
  })
  // 手和相機用自己的鏡頭畫（視角固定 62 度、近平面 1 公分）：玩家的鏡頭會跟著焦段變焦，手如果用同一個鏡頭畫，
  // 舉起／放下相機時會被放大成一大片。畫完世界之後清掉深度、再用這個鏡頭只畫 layer 3（也不會插進牆壁裡）
  camera.layers.disable(VM_LAYER)
  const vmCam = new THREE.PerspectiveCamera(62, camera.aspect, 0.01, 10)
  vmCam.layers.set(VM_LAYER)
  let litN = -1
  function render(renderer, scene) {
    if (!root.visible) return
    // 燈光也要在 layer 3，這個鏡頭才照得到（three.js 的燈光會看圖層）；燈的數量變了（點光源）再補一次
    if (litN !== scene.children.length) { litN = scene.children.length; scene.traverse((o) => { if (o.isLight) o.layers.enable(VM_LAYER) }) }
    camera.updateMatrixWorld()
    camera.getWorldPosition(vmCam.position); camera.getWorldQuaternion(vmCam.quaternion)
    if (vmCam.aspect !== camera.aspect) { vmCam.aspect = camera.aspect; vmCam.updateProjectionMatrix() }
    const ac = renderer.autoClear, su = renderer.shadowMap.autoUpdate
    renderer.autoClear = false; renderer.shadowMap.autoUpdate = false
    renderer.clearDepth(); renderer.render(scene, vmCam)
    renderer.autoClear = ac; renderer.shadowMap.autoUpdate = su
  }
  // 背面螢幕、銘牌的材質換成畫布貼圖（設定介面、機身名稱）
  const screens = {}
  for (const [id, b] of Object.entries(bodies)) b.traverse((o) => { if (o.isMesh && o.material.name === 'Screen') screens[id] = o })

  /* ---------- 姿勢 ---------- */
  const st = { raise: 0, view: 0, bob: 0, sway: V(), lastYaw: 0, lastPitch: 0, body: 'b1', lens: 'l1' }
  // 手是對 b2 機身做的（握把右緣 W1＝0.082）：其他機身左右挪；再往外、往前一點，手指才不會陷進我們比較厚的握把
  const W1 = { b1: 0.072, b2: 0.082, b3: 0.086 }
  const tune = { hand: V(0.006, 0, -0.005) }
  function setGear(body, lens) {
    st.body = body; st.lens = lens
    hand.position.copy(tune.hand).add(V(W1[body] - W1.b2, 0, 0))
    for (const [k, m] of Object.entries(bodies)) m.visible = k === body
    for (const [k, m] of Object.entries(lenses)) m.visible = k === lens
  }
  const pose = new THREE.Object3D()
  const qa = new THREE.Quaternion(), qb = new THREE.Quaternion(), _q = new THREE.Quaternion()
  function update(dt, { raise = 0, view = 0, speed = 0, t = 0 } = {}) {
    st.raise = damp(st.raise, raise, 14, dt); st.view = damp(st.view, view, 9, dt)
    // 舉到眼前（85%）就換成觀景窗，整組不畫：觀景窗裡不會看到手指、相機
    root.visible = st.raise < 0.85
    if (!root.visible) return
    // 走路晃：跟著步伐上下、左右晃；舉起來或看螢幕時不太晃
    st.bob += dt * (speed > 0.3 ? 6 + speed * 0.9 : 0)
    const amp = clamp(speed / 4, 0, 1.6) * (1 - st.raise) * (1 - st.view)
    const breathe = Math.sin(t * 1.3) * 0.003
    // 鏡頭轉動時，手和相機落後一點（慣性）
    const e = camera.rotation, dyaw = Math.atan2(Math.sin(e.y - st.lastYaw), Math.cos(e.y - st.lastYaw)), dpit = (e.x - st.lastPitch)   // 轉過 ±180° 那條線不要算成轉一大圈
    st.lastYaw = e.y; st.lastPitch = e.x
    st.sway.x = damp(st.sway.x, clamp(-dyaw / Math.max(dt, 1e-3) * 0.012, -0.05, 0.05), 8, dt)
    st.sway.y = damp(st.sway.y, clamp(-dpit / Math.max(dt, 1e-3) * 0.012, -0.05, 0.05), 8, dt)
    // 三個姿勢混合
    const A = POSES.carry, B = POSES.raise, C = POSES.view
    pose.position.copy(A.p).lerp(B.p, st.raise).lerp(C.p, st.view)
    qa.setFromEuler(A.r).slerp(qb.setFromEuler(B.r), st.raise).slerp(_q.setFromEuler(C.r), st.view)
    pose.quaternion.copy(qa)
    pose.position.x += Math.sin(st.bob) * 0.012 * amp + st.sway.x * (1 - st.raise)
    pose.position.y += -Math.abs(Math.cos(st.bob)) * 0.014 * amp + breathe + st.sway.y * (1 - st.raise)
    // 長鏡頭比較重：拿著的時候往下垂一點
    const Ln = LENS[st.lens]
    pose.position.y -= (Ln.L - 0.06) * 0.06 * (1 - st.raise) * (1 - st.view)
    camRig.position.copy(pose.position); camRig.quaternion.copy(pose.quaternion)
  }
  // 五稜鏡正面的銘牌：機身型號（白字）
  for (const [id, b] of Object.entries(bodies)) b.traverse((o) => {
    if (!o.isMesh || o.material.name !== 'Name') return
    const c = document.createElement('canvas'); c.width = 512; c.height = 128
    const g = c.getContext('2d'); g.fillStyle = '#0b0b0c'; g.fillRect(0, 0, 512, 128)
    g.translate(512, 0); g.scale(-1, 1)   // 銘牌的 UV 是從背面看的左右，從正面看要左右翻
    g.fillStyle = '#e9e9e4'; g.font = 'bold 74px "Helvetica Neue", Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'
    g.fillText({ b1: 'LARK 100', b2: 'KESTREL 500', b3: 'FALCON 9' }[id], 256, 66)
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.flipY = false
    o.material = new THREE.MeshStandardMaterial({ map: t, roughness: 0.45 })
  })
  // 背面螢幕：貼上相機設定畫面的畫布（camera.js 畫的），自己發光
  function setScreenTexture(tex) {
    for (const m of Object.values(screens)) m.material = new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 0.85, roughness: 0.22, metalness: 0 })
  }
  // 鏡頭被程式直接搬走（首頁 ↔ 遊戲）時呼叫：不要把這一跳當成甩頭、跑步，手才不會一進遊戲就晃
  function snap() { st.lastYaw = camera.rotation.y; st.lastPitch = camera.rotation.x; st.sway.set(0, 0, 0); st.bob = 0 }
  const vm = { root, camRig, hand, bodies, lenses, screens, tune, setGear, update, render, st, POSES, setScreenTexture, snap, get screen() { return screens[st.body] } }
  window.__vm = vm
  return vm
}
