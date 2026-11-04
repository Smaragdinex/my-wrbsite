// 第一人稱的手和相機：走路時相機拿在胸前（跟著腳步晃）、右鍵舉到眼前（舉到底就換成觀景窗）、按 E 把相機拿近看背面螢幕調設定。
// 手：models/arms.glb（UHFPS 的手，骨架 upper_arm → forearm → hand → 手指；tools/export-arms.py）
// 相機：models/camera/body-*.glb＋lens-*.glb（tools/make-camera.py；卡口中心＝原點、鏡頭朝 -Z、背面螢幕朝 +Z）
// 兩隻手用兩節 IK 跟著相機：右手握握把（食指在快門上、拇指在背面），左手托在鏡頭下面（鏡頭越長托得越前面）。
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
  carry: { p: V(0.1, -0.115, -0.31), r: new THREE.Euler(-0.55, 0.4, 0.12) },   // 拿在胸前偏右，鏡頭朝前、頂部和背面朝玩家（畫面右下角看得到兩隻手）
  raise: { p: V(0.0, -0.052, -0.085), r: new THREE.Euler(0, 0, 0) },            // 觀景窗貼在眼睛前
  view: { p: V(0.006, 0.03, -0.185), r: new THREE.Euler(0.3, 0, 0) },           // 拿近、往上翻一點，背面螢幕在畫面正中間
}

export async function createViewmodel(camera) {
  const root = new THREE.Group()
  camera.add(root)
  const [arms, ...cams] = await Promise.all(['models/arms.glb', 'models/camera/body-b1.glb', 'models/camera/body-b2.glb', 'models/camera/body-b3.glb',
    'models/camera/lens-l1.glb', 'models/camera/lens-l2.glb', 'models/camera/lens-l3.glb', 'models/camera/lens-l4.glb', 'models/camera/lens-l5.glb'].map(load))
  const bodies = { b1: cams[0], b2: cams[1], b3: cams[2] }, lenses = { l1: cams[3], l2: cams[4], l3: cams[5], l4: cams[6], l5: cams[7] }
  // 手：骨架原本面向 +z、A 字姿勢；轉 180 度讓右手在右邊，肩膀放在眼睛下面 0.2 公尺
  arms.rotation.y = Math.PI
  arms.position.set(0, -1.455 - 0.2, 0.06)
  root.add(arms)
  const camRig = new THREE.Group()
  root.add(camRig)
  for (const m of [...Object.values(bodies), ...Object.values(lenses)]) { m.visible = false; camRig.add(m) }
  const bones = {}
  arms.traverse((o) => { if (o.isBone) bones[o.name] = o })
  root.traverse((o) => {
    o.layers.set(VM_LAYER)
    if (o.isMesh) { o.frustumCulled = false; o.castShadow = false; o.receiveShadow = false }
  })
  camera.layers.enable(VM_LAYER)
  // 背面螢幕、銘牌的材質換成畫布貼圖（設定介面、機身名稱）
  const screens = {}
  for (const [id, b] of Object.entries(bodies)) b.traverse((o) => { if (o.isMesh && o.material.name === 'Screen') screens[id] = o })

  /* ---------- IK ---------- */
  const _a = V(), _b = V(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _m = new THREE.Matrix4()
  const wpos = (b, out = V()) => b.getWorldPosition(out)
  // 把骨頭轉成在世界座標裡 q（保留父骨頭）
  const setWorldQ = (b, q) => { b.parent.getWorldQuaternion(_q2); b.quaternion.copy(_q2.invert().multiply(q)); b.updateMatrixWorld(true) }
  // 讓骨頭從自己指向 child 的方向轉到 dir（世界）
  function aimBone(b, child, dir) {
    b.updateMatrixWorld(true)
    const cur = wpos(child, _a).sub(wpos(b, _b)).normalize()
    _q.setFromUnitVectors(cur, dir.clone().normalize())
    b.getWorldQuaternion(_q2)
    setWorldQ(b, _q.multiply(_q2))
  }
  // 兩節 IK：肩 S、手腕目標 T、手肘往 pole 那邊彎
  const sides = {}
  for (const sd of ['R', 'L']) {
    // 這套骨架的手（hand）不是接在前臂底下，是直接掛在根上（IK 式）：手自己擺位置，前臂指向前臂末端（forearm_end）
    const ua = bones['upper_arm' + sd], fa = bones['forearm' + sd], fe = bones['forearm' + sd + '_end'], hd = bones['hand' + sd]
    root.updateMatrixWorld(true)
    sides[sd] = { ua, fa, fe, hd, L1: wpos(ua).distanceTo(wpos(fa)), L2: wpos(fa).distanceTo(wpos(fe)) }
  }
  const restAll = {}, restPos = {}
  for (const b of Object.values(bones)) { restAll[b.name] = b.quaternion.clone(); restPos[b.name] = b.position.clone() }
  function solveArm(sd, T, pole) {
    const { ua, fa, fe, hd, L1, L2 } = sides[sd]
    const S = wpos(ua, V())
    const dv = T.clone().sub(S), d = clamp(dv.length(), Math.abs(L1 - L2) + 1e-3, L1 + L2 - 1e-3)
    dv.normalize()
    const a = (L1 * L1 - L2 * L2 + d * d) / (2 * d), h = Math.sqrt(Math.max(0, L1 * L1 - a * a))
    const pd = pole.clone().sub(S); pd.addScaledVector(dv, -pd.dot(dv)).normalize()
    const E = S.clone().addScaledVector(dv, a).addScaledVector(pd, h)
    aimBone(ua, fa, E.clone().sub(S))
    aimBone(fa, fe, T.clone().sub(E))
    // 手腕放到前臂末端（伸不到時就停在手臂伸直的地方）
    fe.updateMatrixWorld(true)
    hd.position.copy(hd.parent.worldToLocal(wpos(fe, V()))); hd.updateMatrixWorld(true)
  }
  // 手掌的方向：d 手腕→中指根、n 手掌朝向（世界座標），把整隻手轉過去
  function frameOf(sd) {
    const hd = bones['hand' + sd]
    const d = wpos(bones['f_middle01' + sd], V()).sub(wpos(hd, V())).normalize()
    const side = wpos(bones['f_index01' + sd], V()).sub(wpos(bones['f_pinky01' + sd], V())).normalize()
    const n = sd === 'R' ? side.clone().cross(d) : d.clone().cross(side)
    n.addScaledVector(d, -n.dot(d)).normalize()
    return { d, n }
  }
  const basis = (d, n) => new THREE.Matrix4().makeBasis(d, n, d.clone().cross(n))
  function orientHand(sd, d1, n1) {
    const hd = bones['hand' + sd]
    hd.updateMatrixWorld(true)
    const { d, n } = frameOf(sd)
    const q = new THREE.Quaternion().setFromRotationMatrix(basis(d1.clone().normalize(), n1.clone().addScaledVector(d1, -n1.dot(d1) / d1.lengthSq()).normalize()).multiply(basis(d, n).invert()))
    hd.getWorldQuaternion(_q2)
    setWorldQ(hd, q.multiply(_q2))
  }
  // 手指彎曲：每節繞「手掌側軸」轉（往掌心彎是正）
  function curl(sd, finger, angles) {
    const { d, n } = frameOf(sd)
    const axis = d.clone().cross(n).normalize()
    const names = finger === 'thumb' ? ['thumb01', 'thumb02', 'thumb03'] : [`f_${finger}01`, `f_${finger}02`, `f_${finger}03`]
    names.forEach((nm, i) => {
      const b = bones[nm + sd]; if (!b || !angles[i]) return
      b.getWorldQuaternion(_q2)
      setWorldQ(b, new THREE.Quaternion().setFromAxisAngle(axis, angles[i]).multiply(_q2))
    })
  }

  /* ---------- 姿勢 ---------- */
  const st = { raise: 0, view: 0, bob: 0, sway: V(), lastYaw: 0, lastPitch: 0, body: 'b1', lens: 'l1' }
  const gripR = new THREE.Object3D(), cradleL = new THREE.Object3D()
  camRig.add(gripR, cradleL)
  // 目標用「指根（中指第一節）」和「掌心」的位置定，手腕再沿著手掌方向往回推一個手掌長（0.088 公尺）
  // 座標都是相機（camRig）的：x 右、y 上、-z 前；W1＝機身右緣（入門機比較小）
  const tune = {
    rKnuckle: V(0.012, 0.0, -0.036), rDir: V(-0.25, 0.3, -0.92), rPalm: V(-1, 0, 0.15),       // 指根在握把右前角，手掌貼握把（掌心朝左）
    lPalmAt: V(-0.006, -0.011, 0), lDir: V(0.72, 0.0, -0.7), lPalm: V(-0.1, 1, 0),                  // 掌心托在鏡頭正下方，手指往右前方繞上去
    rCurl: { index: [0.45, 0.55, 0.35], middle: [1.25, 1.15, 0.7], ring: [1.3, 1.15, 0.7], pinky: [1.35, 1.1, 0.7], thumb: [0.5, 0.45, 0.3] },
    lCurl: { index: [0.9, 0.8, 0.5], middle: [1.0, 0.85, 0.5], ring: [1.05, 0.9, 0.55], pinky: [1.1, 0.9, 0.55], thumb: [0.05, 0.15, 0.1] },
    poleR: V(0.6, -0.8, 0.3), poleL: V(-0.6, -0.9, 0.2),
  }
  const W1 = { b1: 0.072, b2: 0.082, b3: 0.086 }
  function setGear(body, lens) {
    st.body = body; st.lens = lens
    for (const [k, m] of Object.entries(bodies)) m.visible = k === body
    for (const [k, m] of Object.entries(lenses)) m.visible = k === lens
  }
  const pose = new THREE.Object3D()
  const qa = new THREE.Quaternion(), qb = new THREE.Quaternion()
  function update(dt, { raise = 0, view = 0, speed = 0, t = 0 } = {}) {
    st.raise = damp(st.raise, raise, 14, dt); st.view = damp(st.view, view, 9, dt)
    // 舉到底：觀景窗接手，整組不畫
    root.visible = st.raise < 0.96
    if (!root.visible) return
    // 走路晃：跟著步伐上下、左右晃；舉起來或看螢幕時不太晃
    st.bob += dt * (speed > 0.3 ? 6 + speed * 0.9 : 0)
    const amp = clamp(speed / 4, 0, 1.6) * (1 - st.raise) * (1 - st.view)
    const breathe = Math.sin(t * 1.3) * 0.003
    // 鏡頭轉動時，手和相機落後一點（慣性）
    const e = camera.rotation, dyaw = (e.y - st.lastYaw), dpit = (e.x - st.lastPitch)
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
    // 手的目標
    const rd = tune.rDir.clone().normalize(), ld = tune.lDir.clone().normalize(), ln = tune.lPalm.clone().normalize()
    gripR.position.set(W1[st.body] + tune.rKnuckle.x, tune.rKnuckle.y, tune.rKnuckle.z).addScaledVector(rd, -0.088)
    // 左手：掌心在鏡頭下面（鏡頭越長托得越前面），手腕＝掌心往回半個手掌、往下一點（掌心在手骨上面約 1.5 公分）
    const palm = V(tune.lPalmAt.x, -Ln.S + tune.lPalmAt.y, -Math.min(0.035 + Ln.L * 0.42, 0.17))
    cradleL.position.copy(palm).addScaledVector(ld, -0.05).addScaledVector(ln, -0.016)
    // IK：先回到靜止姿勢再解
    for (const b of Object.values(bones)) { b.quaternion.copy(restAll[b.name]); b.position.copy(restPos[b.name]) }
    root.updateMatrixWorld(true)
    const toW = (o) => o.getWorldPosition(V())
    const dirW = (v) => v.clone().transformDirection(camRig.matrixWorld)
    const poleW = (v) => v.clone().applyMatrix4(root.matrixWorld)
    solveArm('R', toW(gripR), poleW(tune.poleR))
    orientHand('R', dirW(tune.rDir), dirW(tune.rPalm))
    solveArm('L', toW(cradleL), poleW(tune.poleL))
    orientHand('L', dirW(tune.lDir), dirW(tune.lPalm))
    for (const [f, a] of Object.entries(tune.rCurl)) curl('R', f, a)
    for (const [f, a] of Object.entries(tune.lCurl)) curl('L', f, a)
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
  const vm = { root, camRig, arms, bones, bodies, lenses, screens, tune, setGear, update, st, POSES, setScreenTexture, get screen() { return screens[st.body] } }
  window.__vm = vm
  return vm
}
