// 第一人稱：WASD 走、Shift 跑、C 蹲低慢慢走（鳥比較不會被嚇跑）、空白鍵跳、滑鼠看
import * as THREE from 'three'
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js'
import { supportAt, blocked, SPAWN } from './layout.js'

const EYE = 1.65, EYE_LOW = 1.05, WALK = 4.2, RUN = 8.5, SNEAK = 1.5, GRAV = 22, JUMP = 7
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
    if (e.code === 'Space' && st.grounded && controls.isLocked) { st.vy = JUMP; st.grounded = false }
  })
  addEventListener('keyup', (e) => keys.delete(e.code))
  addEventListener('blur', () => keys.clear())

  const fwd = new THREE.Vector3(), right = new THREE.Vector3()

  function tryMove(nx, nz) {
    if (blocked(nx, nz, st.feet)) return false
    // 站在步道／觀景台上時，不能從欄杆邊走下去
    if (st.grounded && st.owner !== 0) {
      const s = supportAt(nx, nz, st.feet)
      if (s.y < st.feet - 0.6) return false
    }
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
    if (want.lengthSq() > 0) want.normalize().multiplyScalar(st.sneak ? SNEAK : keys.has('ShiftLeft') || keys.has('ShiftRight') ? RUN : WALK)
    const k = st.grounded ? 12 : 3
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
    st.eye += ((st.sneak ? EYE_LOW : EYE) - st.eye) * Math.min(1, 10 * dt)
    camera.position.set(st.x, st.feet + st.eye, st.z)
  }

  camera.position.set(st.x, st.feet + EYE, st.z)
  return { controls, update, state: st }
}
