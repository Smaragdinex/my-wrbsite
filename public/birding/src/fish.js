// 水裡的小魚群（翠鳥抓魚用）。2026-11-10 ChatGPT 給的數字：
// 5–15 尾、魚長 2–6 公分、水面下 0.1–0.6 公尺（翠鳥抓 0.05–0.3）、巡游 0.05–0.2 m/s、
// 看到上方快速移動的影子（0.3–1 公尺內）0.08–0.2 秒後往兩側散開、衝刺 0.5–1 m/s 持續 0.5–1.5 秒、3–8 秒後恢復
import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z)
const rnd = (a, b) => a + Math.random() * (b - a)

// 一條魚（長 1 個單位、頭朝 +x）：紡錘形身體＋扁的尾鰭；背深、肚子銀白（頂點色）
let geoCache = null
export function fishGeo() {
  if (geoCache) return geoCache
  const body = new THREE.SphereGeometry(0.5, 12, 8)
  {
    const p = body.attributes.position
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), k = x > 0 ? 1 - 0.25 * x : 1 + 0.5 * x   // 頭圓、往尾巴收細
      p.setXYZ(i, x * 0.82, p.getY(i) * 0.24 * k, p.getZ(i) * 0.13 * k)
    }
  }
  const tail = new THREE.BufferGeometry()
  tail.setAttribute('position', new THREE.Float32BufferAttribute([-0.38, 0, 0, -0.62, 0.13, 0, -0.62, -0.13, 0, -0.38, 0, 0, -0.62, -0.13, 0, -0.62, 0.13, 0], 3))
  tail.setAttribute('normal', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, -1, 0, 0, -1, 0, 0, -1], 3))
  tail.setAttribute('uv', new THREE.Float32BufferAttribute(new Array(12).fill(0), 2))
  const g = mergeGeometries([body.toNonIndexed(), tail])
  const p = g.attributes.position, col = []
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i), k = THREE.MathUtils.smoothstep(y, -0.06, 0.06)
    col.push(0.78 - 0.5 * k, 0.8 - 0.46 * k, 0.76 - 0.5 * k)   // 肚子銀白、背橄欖褐
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
  g.computeVertexNormals()
  return (geoCache = g)
}
let matCache = null
export function fishMat() {
  return (matCache ??= new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35, metalness: 0.25, side: THREE.DoubleSide }))
}

// parent：放魚的群組（座標跟 center 同一套）；center：魚群中心（水面下）；waterY：水面高度（同一套座標）
export class FishSchool {
  constructor(parent, center, { n = 9, R = 1.0, waterY, len = [0.045, 0.065] } = {}) {
    this.center = center.clone(); this.R = R; this.waterY = waterY
    this.mesh = new THREE.InstancedMesh(fishGeo(), fishMat(), n)
    this.mesh.frustumCulled = false
    parent.add(this.mesh)
    this.fish = Array.from({ length: n }, () => this.spawn({}))
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._e = new THREE.Euler(); this._s = V()
  }
  spawn(f) {
    const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * this.R
    return Object.assign(f, {
      p: V(this.center.x + Math.cos(a) * r, this.waterY - rnd(0.1, 0.3), this.center.z + Math.sin(a) * r),
      h: Math.random() * Math.PI * 2, v: rnd(0.05, 0.15), len: rnd(0.045, 0.065), goal: null, flee: 0, fleeDir: 0, gone: 0, ph: Math.random() * 10, wig: 0,
    })
  }
  // 魚群往某點附近聚（翠鳥枝頭下面）
  setCenter(c) { this.center.copy(c) }
  nearest(p) {
    let best = null, d = Infinity
    for (const f of this.fish) { if (f.gone > 0) continue; const dd = Math.hypot(f.p.x - p.x, f.p.z - p.z); if (dd < d) { d = dd; best = f } }
    return best
  }
  // 上方有影子衝下來：半徑內的魚（except 那條被盯上的）往外散
  scare(p, r = 1.0, except = null) {
    for (const f of this.fish) {
      if (f === except || f.gone > 0) continue
      const dx = f.p.x - p.x, dz = f.p.z - p.z
      if (Math.hypot(dx, dz) < r) { f.flee = rnd(0.5, 1.4) + rnd(0.08, 0.2); f.delay = rnd(0.08, 0.2); f.fleeDir = Math.atan2(dz, dx) + rnd(-0.6, 0.6) }
    }
  }
  take(f) { f.gone = rnd(15, 30) }   // 被抓走，過一陣子另一條游進來
  update(t, dt) {
    const { _m, _q, _e, _s } = this
    this.fish.forEach((f, i) => {
      if (f.gone > 0) {
        f.gone -= dt
        if (f.gone <= 0) this.spawn(f)
        _m.makeScale(0, 0, 0); this.mesh.setMatrixAt(i, _m); return
      }
      let want = f.h, speed = f.v
      if (f.flee > 0) {
        f.delay -= dt
        if (f.delay <= 0) { want = f.fleeDir; speed = 0.8; f.flee -= dt }
      } else {
        // 巡游：到目標點就換一個；離中心太遠就轉回來
        if (!f.goal || Math.hypot(f.goal.x - f.p.x, f.goal.z - f.p.z) < 0.1) {
          const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * this.R
          f.goal = V(this.center.x + Math.cos(a) * r, 0, this.center.z + Math.sin(a) * r); f.v = rnd(0.05, 0.18)
        }
        want = Math.atan2(f.goal.z - f.p.z, f.goal.x - f.p.x)
      }
      let dh = want - f.h; dh = Math.atan2(Math.sin(dh), Math.cos(dh))
      f.h += dh * Math.min(1, dt * (f.flee > 0 ? 14 : 2.5))
      f.p.x += Math.cos(f.h) * speed * dt; f.p.z += Math.sin(f.h) * speed * dt
      // 尾巴擺：游越快擺越快
      f.ph += dt * (6 + speed * 60)
      _e.set(0, -f.h + 0.18 * Math.sin(f.ph), 0.06 * Math.sin(f.ph * 0.5))
      _m.compose(f.p, _q.setFromEuler(_e), _s.setScalar(f.len))
      this.mesh.setMatrixAt(i, _m)
    })
    this.mesh.instanceMatrix.needsUpdate = true
  }
}
