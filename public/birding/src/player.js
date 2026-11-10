// 第一人稱：WASD 走、Shift 跑、C 蹲低慢慢走（鳥比較不會被嚇跑）、空白鍵跳、滑鼠看
import * as THREE from 'three'
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js'
import { supportAt, blocked, SPAWN, domeRho, YOSE } from './layout.js'

// 速度照「不會 3D 暈」調：走路 3.2 m/s（原本 4.2 太快）、跑 6.2
const EYE = 1.65, EYE_LOW = 1.05, WALK = 3.2, RUN = 6.2, SNEAK = 1.3, GRAV = 22, JUMP = 7
const SLIDE = [0.3, -0.3, 0.6, -0.6, 0.9, -0.9, 1.2, -1.2].map((d) => d)

export function createPlayer(camera, dom) {
  const controls = new PointerLockControls(camera, dom)
  camera.rotation.order = 'YXZ'
  const keys = new Set()
  const vel = new THREE.Vector3()
  const st = { x: SPAWN.x, z: SPAWN.z, feet: 0, vy: 0, grounded: true, owner: 0, sneak: false, eye: EYE }

  // 網址參數：?x=&z=&y=&yaw=&pitch=（角度用度）
  const q = new URLSearchParams(location.search)
  if (q.has('x')) st.x = +q.get('x')
  if (q.has('z')) st.z = +q.get('z')
  const yaw = q.has('yaw') ? +q.get('yaw') : SPAWN.yaw
  const pitch = q.has('pitch') ? +q.get('pitch') : SPAWN.pitch
  camera.rotation.set(THREE.MathUtils.degToRad(pitch), THREE.MathUtils.degToRad(yaw), 0)
  st.feet = q.has('y') ? +q.get('y') : supportAt(st.x, st.z, 1e6).y
  const sup = supportAt(st.x, st.z, st.feet + 0.3)
  st.feet = Math.max(st.feet, sup.y); st.owner = sup.owner

  addEventListener('keydown', (e) => {
    keys.add(e.code)
    if (e.code === 'Space' && st.grounded && controls.isLocked) { st.vy = JUMP; st.grounded = false; st.takeoff = st.feet; st.takeoffOwner = st.owner }
  })
  addEventListener('keyup', (e) => keys.delete(e.code))
  addEventListener('blur', () => keys.clear())

  const fwd = new THREE.Vector3(), right = new THREE.Vector3()

  // 2026-11-07：玩家會跳下旁邊的山、步道、吊橋，掉到爬不回來的地方（例如中央那座山腳的水池：四面都算「不能走」，整個卡死）。
  // 規則：走路、跳躍都不能越過「比出發點低太多」的邊——
  //   站在步道／觀景台／吊橋上（owner ≠ 0）：比腳底低 0.6 公尺以上就是欄杆外，走不過去、也跳不過去
  //   站在地上：跳起來不能落到比起跳點低 1.5 公尺以上的地方（不能從山坡、懸崖跳下去）
  // 萬一已經卡在不該站的地方（舊存檔、從外面掉進來），原地本身就算「擋住」：那就放行，讓人自己走出來。
  function tryMove(nx, nz) {
    const cliffRef = st.grounded ? st.feet : Math.min(st.feet, st.takeoff ?? st.feet)   // 空中：懸崖照起跳點算（見 layout.js blocked）
    if (blocked(nx, nz, st.feet, cliffRef)) {
      if (!blocked(st.x, st.z, st.feet, cliffRef) || domeRho(nx, nz) > 0.955) return false   // 原地是合法的、或前面是溫室的牆：照常擋
    }
    const ref = st.grounded ? st.feet : (st.takeoff ?? st.feet), owner = st.grounded ? st.owner : (st.takeoffOwner ?? 0)
    const s = supportAt(nx, nz, st.grounded ? st.feet : Math.max(st.feet, ref))
    if (owner !== 0 && s.y < ref - 0.6) return false   // 落點是下一圈的步道也一樣擋（第一版只擋落到地面，從螺旋步道跳到下一圈掉了 11 公尺）
    if (!st.grounded && owner === 0 && s.y < ref - 1.5) return false
    st.x = nx; st.z = nz
    return true
  }

  function update(dt) {
    dt = Math.min(dt, 0.05)
    camera.getWorldDirection(fwd); fwd.y = 0; fwd.normalize()
    right.crossVectors(fwd, camera.up).normalize()
    const want = new THREE.Vector3()
    if (controls.isLocked) {
      if (keys.has('KeyW') || keys.has('ArrowUp')) want.add(fwd)
      if (keys.has('KeyS') || keys.has('ArrowDown')) want.sub(fwd)
      if (keys.has('KeyD') || keys.has('ArrowRight')) want.add(right)
      if (keys.has('KeyA') || keys.has('ArrowLeft')) want.sub(right)
    }
    st.sneak = controls.isLocked && keys.has('KeyC')
    if (want.lengthSq() > 0) want.normalize().multiplyScalar((st.sneak ? SNEAK : keys.has('ShiftLeft') || keys.has('ShiftRight') ? RUN : WALK) * (st.owner === 5 && st.grounded && YOSE.stairAt(st.x, st.z) != null ? 0.65 : 1))   // 石階上走慢一點（ChatGPT：上樓約平地的 7 成）
    // 起步、停下都慢慢來（原本 12 幾乎是瞬間），停下比起步快一點，才不會覺得滑
    const k = !st.grounded ? 3 : want.lengthSq() > 0 ? 6 : 8
    vel.x += (want.x - vel.x) * Math.min(1, k * dt)
    vel.z += (want.z - vel.z) * Math.min(1, k * dt)

    // 分小步走，避免一次跨過細柱子；撞到就把方向轉一點試試，沿著牆或欄杆滑過去
    const steps = Math.ceil(Math.hypot(vel.x, vel.z) * dt / 0.15) || 1
    for (let i = 0; i < steps; i++) {
      const dx = vel.x * dt / steps, dz = vel.z * dt / steps
      if (tryMove(st.x + dx, st.z + dz)) continue
      let ok = false
      for (const a of SLIDE) {
        const c = Math.cos(a), s = Math.sin(a)
        if (tryMove(st.x + (dx * c - dz * s) * c, st.z + (dx * s + dz * c) * c)) { ok = true; break }
      }
      if (!ok) { vel.x *= 0.5; vel.z *= 0.5 }
    }

    st.vy -= GRAV * dt
    st.feet += st.vy * dt
    const s = supportAt(st.x, st.z, st.feet + Math.max(0, -st.vy * dt))
    if (st.feet <= s.y || (st.grounded && st.vy <= 0 && st.feet - s.y < 0.45)) {
      st.feet = s.y; st.vy = 0; st.grounded = true; st.owner = s.owner
    } else {
      st.grounded = false
    }
    st.eye += ((st.sneak ? EYE_LOW : EYE) - st.eye) * Math.min(1, 6 * dt)
    // 鏡頭高度另外平滑：上下台階、地面高低不平時腳會一格一格跳，眼睛不要跟著跳（跳躍、掉下去時直接跟）
    // 2026-11-10 使用者：瀑布石階走起來很卡、不順。量了：每階 0.2 公尺、踏面 1.2 公尺，鏡頭「平—跳 0.2—平—跳」，一秒一頓。
    // 眼睛改跟「前後 0.6 公尺內地面高度的平均」（沿走路方向取五點）：台階變成一條順的斜坡，腳還是一階一階踩
    // 第一版用前後 0.6 公尺地面平均，ChatGPT 指出會「還沒到樓梯鏡頭就先升」→ 改成石階本身是連續斜坡（layout.js stairAt），鏡頭只做 0.16 秒的時間平滑
    const eyeY = st.feet + st.eye
    st.camY = st.grounded && st.camY != null && Math.abs(eyeY - st.camY) < 0.6 ? st.camY + (eyeY - st.camY) * (1 - Math.exp(-dt / 0.16)) : eyeY
    camera.position.set(st.x, st.camY, st.z)
  }

  camera.position.set(st.x, st.feet + EYE, st.z)
  return { controls, update, state: st }
}
