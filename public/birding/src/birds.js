// 從 fju-animals（輔大動物網站）搬過來的鳥：同一批模型與動作程式，只拿掉松鼠／攀蜥／烏龜、改成溫室裡的地形高度。
// 鳥都是寫實 3D 模型（ChatGPT 參考圖交給 Tripo 生成），在 Blender 綁骨架，
// 程式轉骨頭做走路、跳枝、覓食等動作。模型比真實尺寸放大（不放大在校園尺度下看不到）；+z 是前方、腳底在原點。
// 這裡另外有停棲處（樹枝、樹幹、石頭），用 loft 放樣做。
import * as THREE from 'three'
import { mergeVertices, mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js'
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js'
import { ripple } from './structures.js'
import { FishSchool, fishGeo, fishMat } from './fish.js'
import { FIG_FORCED } from './layout.js'
import { canopyGeometry, leafify, barkify, leafCardGeometry, leafCardMaterial } from './fju-foliage.js'

const { clamp, lerp, smoothstep: ss, randFloat: rnd } = THREE.MathUtils
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z)
// 山鷸搖擺的不對稱曲線（2026-11-10 ChatGPT 建議）：0.2 到最前、0.35 前面稍停、0.65 到最後、0.8 開始回來；週期性 Hermite，速度連續
const ROCK_KEYS = [[0, 0], [0.2, 1], [0.35, 0.75], [0.6, -1], [0.8, -0.35], [1, 0]]   // 第三輪：往前推、往後收的節奏更分明
// 頭的節奏（ChatGPT 第五輪：停一下→往前探 4 mm→停→收回，像縮小版的鴿子）
const HEAD_KEYS = [[0, 0], [0.15, 0], [0.4, 1], [0.65, 1], [0.9, 0], [1, 0]]
function rockCurve(t, K = ROCK_KEYS) {
  const p = ((t % 1) + 1) % 1, n = K.length
  for (let i = 0; i < n - 1; i++) {
    const [a, va] = K[i], [b, vb] = K[i + 1]
    if (p < a || p > b) continue
    const pr = i === 0 ? [K[n - 2][0] - 1, K[n - 2][1]] : K[i - 1], nx = i + 2 >= n ? [K[1][0] + 1, K[1][1]] : K[i + 2]
    const ma = (vb - pr[1]) / (b - pr[0]), mb = (nx[1] - va) / (nx[0] - a), h = b - a, u = (p - a) / h, u2 = u * u, u3 = u2 * u
    return (2 * u3 - 3 * u2 + 1) * va + (u3 - 2 * u2 + u) * h * ma + (-2 * u3 + 3 * u2) * vb + (u3 - u2) * h * mb
  }
  return 0
}
const tmp = new THREE.Color()
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a))
const fract = (x) => x - Math.floor(x)
const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt))
const dampAngle = (a, b, k, dt) => a + wrap(b - a) * (1 - Math.exp(-k * dt))
const pick = (a) => a[Math.floor(Math.random() * a.length)]
const sgn = () => (Math.random() < 0.5 ? -1 : 1)

const skin = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 })
const mats = {}
const mat = (c, r = 0.6) => (mats[c + '/' + r] ||= new THREE.MeshStandardMaterial({ color: c, roughness: r }))
const SPH = new THREE.SphereGeometry(1, 16, 12)

/* ---------- 放樣 ---------- */
function cr(a, b, c, d, t) {
  const t2 = t * t, t3 = t2 * t
  return 0.5 * (2 * b + (c - a) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (3 * b - a - 3 * c + d) * t3)
}
// rings：每個截面是 [x, y, z, 半寬, 上半高, 下半高?]，用 Catmull-Rom 內插成平滑的封閉管狀體。
// paint(out, u, s, c, q)：u 沿脊線 0→1；s 背 +1／腹 -1；c 兩側 ±1；q 是 frame(頂點) 的正規化座標。
// displace(u, s, c, p)：沿法線推出的距離（做溝紋、隆起）。另外輸出 uv（u, 繞一圈 0→1）和沿脊線的切線 tang，給毛用。
function loft(rings, paint, { seg = 16, sub = 5, up = V(0, 1, 0), grain = 0.06, frame, material = skin, displace } = {}) {
  rings = rings.map((r) => (r.length === 5 ? [...r, r[4]] : r))
  const n = rings.length, S = []
  for (let i = 0; i < n - 1; i++) {
    const a = rings[Math.max(0, i - 1)], b = rings[i], c = rings[i + 1], d = rings[Math.min(n - 1, i + 2)]
    for (let k = 0; k < sub + (i === n - 2 ? 1 : 0); k++) S.push(b.map((_, j) => cr(a[j], b[j], c[j], d[j], k / sub)))
  }
  const P = S.map((s) => V(s[0], s[1], s[2])), m = P.length
  const T = P.map((_, i) => V().subVectors(P[Math.min(i + 1, m - 1)], P[Math.max(i - 1, 0)]).normalize())
  const N = up.clone()
  if (Math.abs(N.dot(T[0])) > 0.95) N.set(0, 0, -1)
  N.addScaledVector(T[0], -N.dot(T[0])).normalize()
  const len = [0]
  for (let i = 1; i < m; i++) len.push(len[i - 1] + P[i].distanceTo(P[i - 1]))
  const total = len[m - 1] || 1
  const pos = [], cols = [], idx = [], uvs = [], tang = [], usc = [], ucs = [], col = new THREE.Color(), B = V(), v = V(), q = new THREE.Quaternion()
  let curT = T[0], curV = 0
  const put = (p, u, s, c) => {
    const fp = frame ? frame(p) : p
    paint(col, u, s, c, fp)
    const g = 1 + grain * (Math.random() * 2 - 1)
    pos.push(p.x, p.y, p.z); cols.push(col.r * g, col.g * g, col.b * g)
    uvs.push(u, curV); tang.push(curT.x, curT.y, curT.z); ucs.push(u, s, c)
    if (displace) usc.push([u, s, c, fp.clone()])
  }
  for (let i = 0; i < m; i++) {
    if (i > 0) { q.setFromUnitVectors(T[i - 1], T[i]); N.applyQuaternion(q); N.addScaledVector(T[i], -N.dot(T[i])).normalize() }
    B.crossVectors(T[i], N)
    const [, , , rx, ryt, ryb] = S[i]
    curT = T[i]
    for (let j = 0; j < seg; j++) {
      const ang = (j / seg) * Math.PI * 2, c = Math.cos(ang), s = Math.sin(ang)
      curV = Math.abs(1 - 2 * j / seg) * 0.5   // 對稱展開，接縫那一條才不會跳回 0
      v.copy(P[i]).addScaledVector(B, rx * c).addScaledVector(N, (s >= 0 ? ryt : ryb) * s)
      put(v, len[i] / total, s, c)
    }
  }
  for (let i = 0; i < m - 1; i++) for (let j = 0; j < seg; j++) {
    const a = i * seg + j, b = a + seg, c = i * seg + ((j + 1) % seg), d = c + seg
    idx.push(a, b, c, c, b, d)
  }
  // 兩端用一個稍微凸出的頂點封口
  for (const [i, dir] of [[0, -1], [m - 1, 1]]) {
    const k = pos.length / 3, [, , , rx, ryt] = S[i]
    curT = T[i]; curV = 0
    put(P[i].clone().addScaledVector(T[i], dir * Math.min(rx, ryt) * 0.5), i ? 1 : 0, 0, 0)
    for (let j = 0; j < seg; j++) {
      const a = i * seg + j, b = i * seg + ((j + 1) % seg)
      dir < 0 ? idx.push(k, a, b) : idx.push(k, b, a)
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  g.setAttribute('tang', new THREE.Float32BufferAttribute(tang, 3))
  g.setAttribute('ucs', new THREE.Float32BufferAttribute(ucs, 3))
  g.setIndex(idx)
  g.computeVertexNormals()
  if (displace) {
    const pa = g.attributes.position, na = g.attributes.normal
    usc.forEach(([u, s, c, fp], i) => {
      const d = displace(u, s, c, fp)
      pa.setXYZ(i, pa.getX(i) + na.getX(i) * d, pa.getY(i) + na.getY(i) * d, pa.getZ(i) + na.getZ(i) * d)
    })
    g.computeVertexNormals()
  }
  const mesh = new THREE.Mesh(g, material)
  mesh.castShadow = true
  return mesh
}

/* ---------- 腳：兩節 IK ---------- */
function makeLeg({ a, b, ra, rb, ca, cb, bend = 1, x = 0 }) {
  const hip = new THREE.Group(), knee = new THREE.Group(), foot = new THREE.Group()
  const up = new THREE.Mesh(new THREE.CylinderGeometry(ra, ra * 0.7, a, 8).translate(0, -a / 2, 0), mat(ca, 0.8))
  const lo = new THREE.Mesh(new THREE.CylinderGeometry(rb, rb * 0.85, b, 7).translate(0, -b / 2, 0), mat(cb, 0.5))
  const j = new THREE.Mesh(SPH, mat(cb, 0.5)); j.scale.setScalar(rb * 1.15)
  for (const m of [up, lo, j]) m.castShadow = true
  hip.add(up, knee); knee.position.y = -a; knee.add(j, lo, foot); foot.position.y = -b
  return { hip, knee, foot, a, b, bend, x, toes: [], ground: 0 }
}
// 把腳掌放到 (fy, fz)（和髖關節同一個座標系），bend +1 關節往後（鳥），-1 往前（膝蓋）
function legIK(l, hy, hz, fy, fz, footPitch = 0) {
  let dy = fy - hy, dz = fz - hz, d = Math.hypot(dy, dz)
  const max = (l.a + l.b) * 0.999, min = Math.abs(l.a - l.b) + 1e-4
  if (d > max) { dy *= max / d; dz *= max / d; d = max } else if (d < min) { dy *= min / d; dz *= min / d; d = min }
  const base = Math.atan2(-dz, -dy)
  const al = Math.acos(clamp((l.a * l.a + d * d - l.b * l.b) / (2 * l.a * d), -1, 1))
  const t1 = base + l.bend * al
  const ky = hy - l.a * Math.cos(t1), kz = hz - l.a * Math.sin(t1)
  const t2 = Math.atan2(-(hz + dz - kz), -(hy + dy - ky))
  l.hip.position.set(l.x, hy, hz)
  l.hip.rotation.x = t1; l.knee.rotation.x = t2 - t1; l.foot.rotation.x = footPitch - t2
}
function birdFoot(l, r, toe, c) {
  for (const [yaw, k] of [[-0.42, 1], [0, 1.12], [0.42, 0.95], [Math.PI, 0.62]]) {
    const p = new THREE.Group(), curl = new THREE.Group()
    p.rotation.y = yaw; p.add(curl)
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.3, r * 0.7, toe * k, 6).translate(0, (toe * k) / 2, 0).rotateX(Math.PI / 2), mat(c, 0.5))
    m.castShadow = true
    curl.add(m); l.foot.add(p); l.toes.push(curl)
  }
  l.ground = r * 0.6
}

/* ---------- 行為 ---------- */
// 動作表：{ 名稱: [權重, 最短秒, 最長秒] }，時間到就隨機換下一個
class Acts {
  constructor(table, onStart) { this.table = table; this.onStart = onStart; this.next() }
  next(name) {
    const tb = this.table
    if (!name) {
      const keys = Object.keys(tb)
      let r = Math.random() * keys.reduce((s, k) => s + tb[k][0], 0)
      name = keys.find((k) => (r -= tb[k][0]) < 0) ?? keys[0]
    }
    Object.assign(this, { name, t: 0, dur: rnd(tb[name][1], tb[name][2]), r: Math.random() * 2 - 1, sgn: sgn() })
    this.onStart?.(name, this)
  }
  tick(dt) { this.t += dt; if (this.t >= this.dur) this.next() }
  get k() { return clamp(this.t / this.dur, 0, 1) }
}
// 小鳥看東西是一下一下跳著轉頭
class Glance {
  constructor(rate = [0.35, 1.4], yaw = 0.9, pitch = 0.35) { Object.assign(this, { rate, Y: yaw, P: pitch, t: 0, yaw: 0, hp: 0, roll: 0 }) }
  update(dt) {
    if ((this.t -= dt) > 0) return
    this.t = rnd(...this.rate); this.yaw = rnd(-this.Y, this.Y); this.hp = rnd(-this.P, this.P * 0.6)
    this.roll = Math.random() < 0.25 ? rnd(-0.5, 0.5) : 0
  }
}
// 在地上（或任何平面）走到隨機目標點
class Walker {
  constructor({ radius, speed, turn = 2.5, center = [0, 0], avoid }) {
    Object.assign(this, { radius, speed, turn, center, avoid, p: new THREE.Vector2(...center), h: 0, goal: null, want: null, v: 0 })
  }
  pick(min = 0.3, max = 99) {
    for (let i = 0; i < 40; i++) {
      const a = Math.random() * Math.PI * 2, r = this.radius * Math.sqrt(Math.random())
      const x = this.center[0] + Math.cos(a) * r, z = this.center[1] + Math.sin(a) * r
      const d = Math.hypot(x - this.p.x, z - this.p.y)
      if (d < min || d > max || this.avoid?.(x, z, this.p)) continue
      this.goal = new THREE.Vector2(x, z); this.want = null
      return true
    }
    return false
  }
  update(dt) {
    let target = this.want, d = 0
    if (this.goal) { const dx = this.goal.x - this.p.x, dz = this.goal.y - this.p.y; d = Math.hypot(dx, dz); target = Math.atan2(dx, dz) }
    if (target == null) { this.v = 0; return 0 }
    const diff = wrap(target - this.h), dh = clamp(diff, -this.turn * dt, this.turn * dt)
    this.h += dh
    let step = 0
    if (this.goal) {
      step = Math.min(this.speed * clamp(1.2 - Math.abs(diff), 0, 1) * dt, d)
      this.p.x += Math.sin(this.h) * step; this.p.y += Math.cos(this.h) * step
      if (d - step < 0.02) this.goal = null
    } else if (Math.abs(diff) < 0.02) this.want = null
    this.v = dt > 0 ? step / dt : 0   // 同一格更新兩次（dt = 0）時 0/0 = NaN，會一路傳到頭的姿勢、整隻鳥破圖（2026-11-08 帝雉）
    return step + Math.abs(dh) * 0.12
  }
  get busy() { return !!(this.goal || this.want != null) }
}
// 沿樹枝跳
class Hopper {
  constructor(env, { hop = [0.15, 0.4], rest = [0.8, 3.5], dur = 0.26, span = [0.85, 1.35], blocked, fix, preT = 0.12, arc = [0.06, 0.3], apex = 0.5 } = {}) {   // span：身體往鏡頭（步道那側）轉多少（2026-11-09 使用者：要面對走道，以前 0.45～1.25 太多是側身）
    Object.assign(this, { env, hopR: hop, restR: rest, dur, span, blocked, fix, preT, arcP: arc, apex })   // preT 起跳前蹲多久、arc 跳多高（基本＋距離倍數）、apex 最高點在哪（0.5＝正中間）   // fix：永遠朝同一邊（啄木鳥在樹幹上一定頭朝上，往下是倒退）
    const { min, max } = env.branch
    // 很短的停點（草莖頂端）就站正中間
    this.s = max - min >= 0.29 ? rnd(min + 0.2, max - 0.1) : (min + max) / 2; this.k = 1; this.y = 0; this.wait = rnd(...rest); this.landed = 9
    this.h = this.wantH = this.face(sgn())
  }
  face(dir) {
    if (this.fix) dir = this.fix
    const tc = this.env.toCam, turn = rnd(...this.span)
    return Math.atan2(dir * Math.cos(turn) + tc.x * Math.sin(turn), tc.z * Math.sin(turn))
  }
  update(dt) {
    this.landed += dt
    if (this.k < 1) {
      this.k = Math.min(1, this.k + dt / this.dur)
      const e = this.k * this.k * (3 - 2 * this.k)
      const wk = this.k < this.apex ? this.k / this.apex * 0.5 : 0.5 + (this.k - this.apex) / (1 - this.apex) * 0.5
      this.s = lerp(this.s0, this.s1, e); this.y = this.arc * Math.sin(Math.PI * wk)
      if (this.k >= 1) { this.landed = 0; this.y = 0 }
    } else if ((this.wait -= dt) <= 0) this.jump()
    this.h = dampAngle(this.h, this.wantH, 14, dt)
  }
  jump() {
    const { min, max } = this.env.branch
    let dir = sgn()
    const len = Math.random() < 0.3 ? 0 : rnd(...this.hopR)    // 有時只是原地轉個方向
    if (this.s + dir * len > max || this.s + dir * len < min) dir = -dir
    const s1 = clamp(this.s + dir * len, min, max)
    if (this.blocked?.(s1, this)) { this.wait = 0.4; return }
    Object.assign(this, { s0: this.s, s1, k: 0, arc: this.arcP[0] + len * this.arcP[1], wait: rnd(...this.restR) })
    this.wantH = this.face(len ? dir : -Math.sign(Math.sin(this.h)) || 1)
  }
  get hopping() { return this.k < 1 }
  get pre() { return this.k >= 1 ? 1 - clamp(this.wait / this.preT, 0, 1) : 0 }   // 起跳前蹲一下
}

/* ---------- 影子 ---------- */
let blobTex
function contactShadow(r, strength = 0.45) {
  if (!blobTex) {
    const c = document.createElement('canvas'); c.width = c.height = 64
    const x = c.getContext('2d'), g = x.createRadialGradient(32, 32, 0, 32, 32, 32)
    g.addColorStop(0, '#fff'); g.addColorStop(0.45, '#999'); g.addColorStop(1, '#000')
    x.fillStyle = g; x.fillRect(0, 0, 64, 64)
    blobTex = new THREE.CanvasTexture(c)
  }
  const g = new THREE.Group()
  // 柔和的接觸陰影
  const blob = new THREE.Mesh(new THREE.PlaneGeometry(r * 2, r * 2).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0x000000, alphaMap: blobTex, transparent: true, opacity: strength, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }))
  // 接住太陽即時陰影的圓盤（地面本身是烘焙的，不接即時陰影），邊緣淡出
  const sm = new THREE.ShadowMaterial({ opacity: 0.42, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 })
  const R = r * 3
  sm.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vLocal;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvLocal = position.xz;')
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec2 vLocal;')
      .replace('gl_FragColor = vec4( color, opacity * ( 1.0 - getShadowMask() ) );', `gl_FragColor = vec4( color, opacity * ( 1.0 - getShadowMask() ) * ( 1.0 - smoothstep( ${(R * 0.55).toFixed(4)}, ${R.toFixed(4)}, length( vLocal ) ) ) );`)
  }
  const catcher = new THREE.Mesh(new THREE.CircleGeometry(R, 32).rotateX(-Math.PI / 2), sm)
  catcher.receiveShadow = true; catcher.userData.catcher = true
  catcher.position.y = r * 0.004
  g.add(blob, catcher)
  return g
}

/* ---------- 各種動物 ---------- */
const BUILD = {
  heron: malayanHeron,

  dove: spottedDove,

  nightheron: nightHeron,

  bulbul: bulbul,

  whiteeye: whiteeye,

  barbet: barbet,

  treepie: treepie,

  kingfisher, egret, moorhen, sparrow, waterhen, bluemagpie, blackbulbul, babbler, mikado,
  spoonbill, thrush, pheasant, oriole,
  flamecrest, bushrobin, rosefinch, yellowtit, laughingthrush, niltava, yuhina, sibia,
  goshawk, woodowl, serpenteagle,
  mandarin, spotbill, partridge, nuthatch, finchbill, minivet, pitta, grassowl,
  liocichla, whitebrow, bullfinch, barwing, islandthrush, tit, rustylt, whitethroat, hwamei, styan, scimitar, fulvetta, bamboo, flowing, bushwarbler, cupwing, shortwing,
  scopsowl, mtscops, jacana, psnipe, woodcock, shelduck, pheron, stilt, harrier, rnpheasant, skylark, cisticola, nutcracker, wbwood,
  shoebill, flamingo, ajacana, rspoonbill, sarus, gallinule, skimmer, redcrowned, ruff, grebe, lapwing,
  peregrine, blackswift, greatgreyowl,
}
/* ---------- 現成模型 ---------- */
// 松鼠和烏龜用網路上別人做好的寫實模型（來源與授權見 README、頁尾），載入後用頂點著色器把尾巴、頭、腳彎動。
const GLB = {}
const TINT = { 'thrush-rig': 0.5 }
// 2026-11-11 串流載入（使用者：先做，之後再加鳥進場時間才不會變長）：以前 150 個鳥模型（48 MB）進場前全部載完。
// 現在進場前只載入口附近那幾種（world.js 挑），其餘的鳥先放一個空的替身，進場後在背景由近到遠一隻隻載、載到就換上真的（world.streamBirds）。
// 不用替每隻鳥登記牠用哪些模型：rigged() 找不到模型會丟 MissingModel，placeAnimal 接住、記下缺哪個，載完再重蓋一次
const MODEL_NAMES = ['night-heron-rig', 'barbet-rig', 'bulbul-rig', 'whiteeye-rig', 'treepie-rig', 'dove-rig', 'heron-rig',
    'kingfisher-rig', 'kingfisher-fly-rig', 'egret-rig', 'moorhen-rig', 'sparrow-rig', 'waterhen-rig', 'bluemagpie-rig', 'blackbulbul-rig', 'babbler-rig', 'mikado-rig',
    'spoonbill-rig', 'thrush-rig', 'pheasant-rig', 'oriole-rig',
    'flamecrest-rig', 'bushrobin-rig', 'rosefinch-rig', 'yellowtit-rig', 'laughingthrush-rig', 'niltava-rig', 'yuhina-rig', 'sibia-rig', 'goshawk-rig', 'serpenteagle-rig', 'serpenteagle-fly-rig', 'woodowl-rig', 'scopsowl-rig', 'mtscops-rig', 'jacana-rig', 'psnipe-rig', 'woodcock-rig', 'shelduck-rig', 'pheron-rig', 'stilt-rig', 'harrier-rig', 'wbwood2-rig', 'wbwood-rig', 'peregrine-rig', 'blackswift-rig', 'greatgreyowl-rig', 'rnpheasant-rig', 'skylark-rig', 'cisticola-rig', 'nutcracker-rig',
    'mandarin-rig', 'mandarinf-rig', 'spotbill-rig', 'partridge-rig', 'nuthatch-rig', 'finchbill-rig', 'minivet-rig', 'pitta-rig', 'grassowl-rig',
    'liocichla-rig', 'whitebrow-rig', 'bullfinch-rig', 'barwing-rig', 'islandthrush-rig', 'tit-rig', 'rustylt-rig', 'whitethroat-rig', 'hwamei-rig', 'styan-rig', 'scimitar-rig', 'fulvetta-rig', 'bamboo-rig', 'flowing-rig', 'bushwarbler-rig', 'cupwing-rig', 'shortwing-rig',
    'shoebill-rig', 'flamingo-rig', 'ajacana-rig', 'rspoonbill-rig', 'sarus-rig', 'gallinule-rig', 'skimmer-fly-rig', 'skimmer-rig', 'redcrowned-rig', 'ruff-rig', 'grebe-rig', 'lapwing-rig']
export class MissingModel extends Error { constructor(n) { super('model not loaded: ' + n); this.model = n } }
let _loader = null, _extra = []
const _loading = new Map(), FAILED = new Set()
const loader = () => {
  if (!_loader) { _loader = new GLTFLoader(); const D = new DRACOLoader(); D.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/'); _loader.setDRACOLoader(D) }
  return _loader
}
// 載一個模型（同一個只載一次）；回傳有沒有載到。缺檔不丟錯：呼叫的人自己用替代模型或先不蓋
export function ensureModel(n) {
  if (GLB[n]) return Promise.resolve(true)
  if (FAILED.has(n)) return Promise.resolve(false)
  let pr = _loading.get(n)
  if (!pr) {
    pr = loader().loadAsync(`models/birds/${n}.glb?v=${VER}`).then((g) => {
      g.scene.traverse((o) => { if (o.isMesh) { cutBridges(o); fixWinding(o.geometry) } })
      // Tripo 生成的羽色太鮮豔的，載入時壓暗（紫嘯鶇真實是深藍黑、只有光澤是亮藍）
      const k = TINT[n.replace('-fly', '')]
      if (k) g.scene.traverse((o) => { if (o.isMesh) { o.material = o.material.clone(); o.material.color.multiplyScalar(k) } })
      if (BILL_FIX[n]) straightenBill(g.scene, BILL_FIX[n])
      GLB[n] = g.scene
      return true
    }).catch(() => { FAILED.add(n); console.warn('[birds] 沒有模型', n); return false }).finally(() => _loading.delete(n))
    _loading.set(n, pr)
  }
  return pr
}
export const modelFailed = (n) => FAILED.has(n)
// 猜這種鳥會用到的模型（檔名開頭是牠的 id：本尊、雌鳥 f、第二版 2、飛行版）——只是讓下載可以並行；猜漏的由 MissingModel 補
export const modelsFor = (id) => [...MODEL_NAMES, ..._extra].filter((n) => { const b = n.replace(/-fly-rig$|-rig$/, ''); return b === id || b === id + 'f' || b === id + '2' })
// extra：遊戲另外要的模型（飛行版）；nearIds：進場前就要載好的鳥（不給＝全部，圖鑑頁、工具用）
export async function loadAnimalModels(extra = [], onProgress, nearIds = null) {
  _extra = extra
  const names = nearIds ? [...new Set(['kingfisher-fly-rig', ...nearIds.flatMap(modelsFor)])] : [...MODEL_NAMES, ...extra]
  let done = 0
  await Promise.all(names.map((n) => ensureModel(n).finally(() => onProgress?.(++done / names.length))))
}
export const hasModel = (n) => !!GLB[n]
export const loadedModels = () => Object.keys(GLB)
/* ---------- 有骨架的現成模型：用「模型座標的軸」轉骨頭 ---------- */
// 每根骨頭的本地軸方向都不一樣（Blender 的 roll），直接轉 x/y/z 左右腳會不對稱。
// 這裡先算出每根骨頭靜止時在模型座標裡的朝向，turn(骨頭, 模型座標的軸, 角度) 再換算成本地軸，
// 所以「繞身體的上下軸轉」對每根骨頭意思都一樣。straight：一開始就把這些骨頭（例如捲起來的尾巴）拉直到某個比例。
const HEAD_YAW_FIX = {}
// 2026-11-12 使用者「嘴巴整個歪」（粉紅琵鷺）：頭本身是正的，是那張扁嘴從嘴基往左彎了 45°（生成的模型就長這樣）。真的琵鷺嘴是直直往前的。
// 第一版把整顆頭轉 45°：嘴正了、頭卻歪到另一邊。這版只動嘴：頭部頂點裡沿著嘴的方向超過嘴基的那一段，繞嘴基的上下軸轉回來（嘴基 4 cm 內漸變，不折出稜角）。
// hc＝頭的中心、d＝現在嘴的方向（歪的）、t0～t1＝嘴基漸變的範圍（沿 d 量）、yaw＝要轉回來的角度；數字是對模型量出來的（頭部頂點的主軸分析）
const BILL_FIX = {}   // 粉紅琵鷺試過 { hc: [-0.155, 0.92, -0.008], d: [-0.424, -0.798, 0.429], t0: 0.03, t1: 0.075, yaw: -0.79 }：使用者看了說還是歪，先還原成原本的模型
function straightenBill(root, { hc, d, t0, t1, yaw }) {
  root.traverse((o) => {
    if (!o.isSkinnedMesh) return
    const hi = o.skeleton.bones.findIndex((b) => b.name === 'head'), ge = o.geometry, P = ge.attributes.position, N = ge.attributes.normal, SI = ge.attributes.skinIndex, SW = ge.attributes.skinWeight
    const px = hc[0] + d[0] * t0, pz = hc[2] + d[2] * t0
    for (let i = 0; i < P.count; i++) {
      let w = 0; for (let k = 0; k < 4; k++) if (SI.getComponent(i, k) === hi) w += SW.getComponent(i, k)
      if (w < 0.5) continue
      const x = P.getX(i), y = P.getY(i), z = P.getZ(i), t = (x - hc[0]) * d[0] + (y - hc[1]) * d[1] + (z - hc[2]) * d[2]
      const u = Math.min(1, Math.max(0, (t - t0) / (t1 - t0))), a = yaw * u * u * (3 - 2 * u) * Math.min(1, (w - 0.5) / 0.3); if (!a) continue
      const c = Math.cos(a), sn = Math.sin(a), dx = x - px, dz = z - pz
      P.setXYZ(i, px + dx * c + dz * sn, y, pz - dx * sn + dz * c)
      if (N) { const nx = N.getX(i), nz = N.getZ(i); N.setXYZ(i, nx * c + nz * sn, N.getY(i), -nx * sn + nz * c) }
    }
    P.needsUpdate = true; if (N) N.needsUpdate = true; ge.computeBoundingBox(); ge.computeBoundingSphere()
  })
}
export function rigged(name, { straight = {} } = {}) {
  if (!GLB[name]) throw new MissingModel(name)
  const model = cloneSkinned(GLB[name])
  const bones = {}
  model.traverse((o) => {
    if (o.isBone) bones[o.name] = o
    if (o.isMesh) {
      o.castShadow = true; o.frustumCulled = false
      if (o.material.isMeshBasicMaterial) o.material = new THREE.MeshStandardMaterial({ map: o.material.map, roughness: 0.75 })
    }
  })
  // 2026-11-13 使用者：天空一條黑色破圖線（一閃一閃）。山鷸、鏽臉鉤嘴鶥、灰頭鷽的飛行模型 wingtip 骨頭 scale 是 (1, 0, 1)（綁骨工具輸出的），
  // 縮放 0 的矩陣拆不出旋轉 → 翼尖變 NaN，那幾片面被畫成一條射向天空的線。載入時把縮放 0 的骨頭改回 1
  // 反綁定矩陣也是用縮放 0 算的（數值上百萬）→ 用父骨頭的反矩陣重算：inv(tip) = inv(本地 tip) × inv(父)
  const zs = Object.values(bones).filter((b) => Math.min(Math.abs(b.scale.x), Math.abs(b.scale.y), Math.abs(b.scale.z)) < 1e-4)
  if (zs.length) {
    for (const b of zs) b.scale.set(1, 1, 1)
    model.traverse((o) => {
      if (!o.isSkinnedMesh) return
      const sk = o.skeleton, inv = sk.boneInverses.map((m) => m.clone())
      for (const b of zs) {
        const i = sk.bones.indexOf(b), pi = sk.bones.indexOf(b.parent); if (i < 0 || pi < 0) continue
        b.updateMatrix(); inv[i] = b.matrix.clone().invert().multiply(inv[pi])
      }
      sk.boneInverses = inv; sk.boneMatrices = new Float32Array(sk.bones.length * 16)
    })
  }
  for (const [n, k] of Object.entries(straight)) bones[n]?.quaternion.slerp(new THREE.Quaternion(), k)
  // 2026-11-12 使用者「這嘴巴整個歪」：有的模型生成出來頭就是轉向一邊的（粉紅琵鷺：嘴尖偏左 12 cm＝頭往左轉 35°），低頭覓食時嘴斜斜的插下去。
  // 一開始就把頭繞身體的上下軸轉正（量法：頭部頂點裡離頭關節最遠的那一撮＝嘴尖，看它偏離中線多少）
  if (HEAD_YAW_FIX[name] && bones.head) { model.updateMatrixWorld(true); const pq = bones.head.parent.getWorldQuaternion(new THREE.Quaternion()), mq0 = model.getWorldQuaternion(new THREE.Quaternion()), qw = mq0.clone().multiply(new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), HEAD_YAW_FIX[name])).multiply(mq0.clone().invert()); bones.head.quaternion.premultiply(pq.clone().invert().multiply(qw).multiply(pq)) }
  model.updateMatrixWorld(true)
  const mq = model.getWorldQuaternion(new THREE.Quaternion()).invert(), wq = new THREE.Quaternion()
  for (const b of Object.values(bones)) {
    b.userData.rest = b.quaternion.clone(); b.userData.restP = b.position.clone()
    b.userData.inv = mq.clone().multiply(b.getWorldQuaternion(wq)).invert()   // 模型座標 → 骨頭本地
  }
  const _a = V(), _q = new THREE.Quaternion()
  return {
    model, bones,
    reset() { for (const b of Object.values(bones)) { b.quaternion.copy(b.userData.rest); b.position.copy(b.userData.restP) } },
    // 把骨頭沿著父骨頭的方向推遠（s = 0.5 → 父骨頭拉長 50%），用來伸脖子
    stretch(n, s) { const b = bones[n]; if (b && s) b.position.copy(b.userData.restP).multiplyScalar(1 + s) },
    turn(n, axis, angle) {
      const b = bones[n]; if (!b || !angle) return
      b.quaternion.multiply(_q.setFromAxisAngle(_a.copy(axis).applyQuaternion(b.userData.inv).normalize(), angle))
    },
  }
}
// 減面時翻掉的三角形（頂點順序跟法線相反）：只畫正面時會變成破洞，看到後面深色的翅膀、樹枝——身上一片片碎片。
// 樹鵲、綠繡眼、白頭翁約 9% 的面是反的（2026-11-08 使用者回報 17 號樹鵲破圖）。載入時照頂點法線把順序轉回來。
// 2026-11-13 使用者：環頸雉走路時腳破圖（一根棍子從腳伸出去）。模型裡兩隻腳的腳趾黏在一起（左腳中趾和右腳腳趾共用幾片面），
// 走路兩腳一分開，那幾片面被拉成長棍。載入時把「一頭綁在左腳／左翅、另一頭綁在右腳／右翅」的面切掉（共 60 幾片，看不出少了）
const SIDE = /^(thigh|shin|foot|toe|wing)([LR])/
function cutBridges(o) {
  const g = o.geometry, ix = g.index, si = g.attributes.skinIndex, sw = g.attributes.skinWeight
  if (!o.isSkinnedMesh || !ix || !si || !sw || !o.skeleton) return
  const side = o.skeleton.bones.map((b) => SIDE.exec(b.name)?.[2] ?? '')
  if (!side.some(Boolean)) return
  const n = si.count, vs = new Array(n)
  for (let i = 0; i < n; i++) {
    let best = 0, bi = 0
    for (let k = 0; k < 4; k++) { const w = sw.getComponent(i, k); if (w > best) { best = w; bi = si.getComponent(i, k) } }
    vs[i] = side[bi] ?? ''
  }
  const a = ix.array, keep = []
  for (let t = 0; t < a.length; t += 3) {
    const s0 = vs[a[t]], s1 = vs[a[t + 1]], s2 = vs[a[t + 2]]
    const L = s0 === 'L' || s1 === 'L' || s2 === 'L', R = s0 === 'R' || s1 === 'R' || s2 === 'R'
    if (!(L && R)) keep.push(a[t], a[t + 1], a[t + 2])
  }
  if (keep.length !== a.length) { g.setIndex(keep); g.userData.bridges = (a.length - keep.length) / 3 }
}
function fixWinding(g) {
  const p = g.attributes.position, n = g.attributes.normal, ix = g.index
  if (!p || !n || !ix) return
  const a = ix.array, T = a.length / 3
  // 每個面「照頂點法線看是不是反的」的分數（>0 正、<0 反）
  const vote = new Float32Array(T)
  for (let t = 0; t < T; t++) {
    const i0 = a[t * 3], i1 = a[t * 3 + 1], i2 = a[t * 3 + 2]
    const e1x = p.getX(i1) - p.getX(i0), e1y = p.getY(i1) - p.getY(i0), e1z = p.getZ(i1) - p.getZ(i0)
    const e2x = p.getX(i2) - p.getX(i0), e2y = p.getY(i2) - p.getY(i0), e2z = p.getZ(i2) - p.getZ(i0)
    const fx = e1y * e2z - e1z * e2y, fy = e1z * e2x - e1x * e2z, fz = e1x * e2y - e1y * e2x
    const nx = n.getX(i0) + n.getX(i1) + n.getX(i2), ny = n.getY(i0) + n.getY(i1) + n.getY(i2), nz = n.getZ(i0) + n.getZ(i1) + n.getZ(i2)
    vote[t] = Math.sign(fx * nx + fy * ny + fz * nz) * Math.hypot(fx, fy, fz)   // 面積加權
  }
  // 2026-11-09 第二版（使用者又回報 4、17、18 號破圖）：只看頂點法線不夠——翻掉的面附近，頂點法線也跟著歪，
  // 那幾片照法線判斷還是錯的。改成看網格的連接：相鄰兩個面共用的邊，方向要相反才是一致的；
  // 從一個面開始往外擴散，把整塊連在一起的面轉成同一個方向，最後整塊照多數面的法線投票決定朝外還是朝內。
  // 頂點在 UV 接縫會拆開，所以先照位置把同一點併起來再找相鄰
  const vid = new Int32Array(p.count), pos = new Map()
  for (let i = 0; i < p.count; i++) {
    const k = Math.round(p.getX(i) * 1e5) + ',' + Math.round(p.getY(i) * 1e5) + ',' + Math.round(p.getZ(i) * 1e5)
    let v = pos.get(k); if (v === undefined) { v = pos.size; pos.set(k, v) } vid[i] = v
  }
  const NV = pos.size, edges = new Map()   // 無向邊 → [面, 方向(+1: 小→大)]…
  for (let t = 0; t < T; t++) for (let e = 0; e < 3; e++) {
    const u = vid[a[t * 3 + e]], w = vid[a[t * 3 + (e + 1) % 3]]
    if (u === w) continue
    const key = u < w ? u * NV + w : w * NV + u
    let l = edges.get(key); if (!l) edges.set(key, l = [])
    l.push(t, u < w ? 1 : -1)
  }
  const nb = Array.from({ length: T }, () => [])   // 相鄰面：[面, 同向(1)/反向(0)]
  for (const l of edges.values()) if (l.length === 4) { nb[l[0]].push(l[2], l[1] === l[3] ? 1 : 0); nb[l[2]].push(l[0], l[1] === l[3] ? 1 : 0) }
  if (!g.boundingBox) g.computeBoundingBox()
  const C = g.boundingBox.getCenter(new THREE.Vector3())
  const flip = new Int8Array(T), seen = new Uint8Array(T), comp = []
  for (let s = 0; s < T; s++) {
    if (seen[s]) continue
    comp.length = 0; seen[s] = 1; flip[s] = 0; comp.push(s)
    for (let q = 0; q < comp.length; q++) {
      const t = comp[q], L2 = nb[t]
      for (let j = 0; j < L2.length; j += 2) {
        const o = L2[j]; if (seen[o]) continue
        seen[o] = 1; flip[o] = flip[t] ^ L2[j + 1]; comp.push(o)   // 共用的邊同向＝其中一個是反的
      }
    }
    let sum = 0
    if (comp.length > T * 0.05) for (const t of comp) sum += flip[t] ? -vote[t] : vote[t]
    else {
      // 小碎片（減面切出來、跟身體只靠一個點相連）：連頂點法線都跟著反了，投票會投錯。
      // 改用形狀判斷：面要朝「離開身體中心」的方向（鳥身體是一團，翅膀尾巴也大致朝外）
      for (const t of comp) {
        const i0 = a[t * 3], i1 = a[t * 3 + 1], i2 = a[t * 3 + 2]
        const e1x = p.getX(i1) - p.getX(i0), e1y = p.getY(i1) - p.getY(i0), e1z = p.getZ(i1) - p.getZ(i0)
        const e2x = p.getX(i2) - p.getX(i0), e2y = p.getY(i2) - p.getY(i0), e2z = p.getZ(i2) - p.getZ(i0)
        const fx = e1y * e2z - e1z * e2y, fy = e1z * e2x - e1x * e2z, fz = e1x * e2y - e1y * e2x
        const d = fx * (p.getX(i0) - C.x) + fy * (p.getY(i0) - C.y) + fz * (p.getZ(i0) - C.z)
        sum += flip[t] ? -d : d
      }
    }
    const all = sum < 0 ? 1 : 0
    for (const t of comp) if (flip[t] ^ all) { const x = a[t * 3 + 1]; a[t * 3 + 1] = a[t * 3 + 2]; a[t * 3 + 2] = x }
  }
  ix.needsUpdate = true
  // 有些頂點的法線本身就是反的（約 1.5%）：打光時那一小塊亮暗顛倒，胸口出現亮白鋸齒。
  // 用轉好的面重算一次法線，只換掉跟原本方向相反的那些頂點（其他保留原本平滑的法線）
  // 早期那三隻（樹鵲、綠繡眼、白頭翁）約 10% 的法線歪了 60° 以上（只換反向的還留下白色碎片）：這種模型整個用重算的法線
  // 2026-11-09：重算的法線改成「同一個位置的頂點併起來算」（UV 接縫兩邊一樣平滑，不會出現硬邊），
  // 原本的法線跟它差超過約 50° 就換掉（以前只換反向的，歪一半的還是會在肚子上亮出白色碎點）
  const keep = n.clone(), acc = new Float32Array(NV * 3)
  for (let t = 0; t < T; t++) {
    const i0 = a[t * 3], i1 = a[t * 3 + 1], i2 = a[t * 3 + 2]
    const e1x = p.getX(i1) - p.getX(i0), e1y = p.getY(i1) - p.getY(i0), e1z = p.getZ(i1) - p.getZ(i0)
    const e2x = p.getX(i2) - p.getX(i0), e2y = p.getY(i2) - p.getY(i0), e2z = p.getZ(i2) - p.getZ(i0)
    const fx = e1y * e2z - e1z * e2y, fy = e1z * e2x - e1x * e2z, fz = e1x * e2y - e1y * e2x
    for (const i of [i0, i1, i2]) { const v = vid[i] * 3; acc[v] += fx; acc[v + 1] += fy; acc[v + 2] += fz }
  }
  const nn = n
  let off = 0
  const W = new Float32Array(p.count * 3)
  for (let i = 0; i < p.count; i++) {
    const v = vid[i] * 3, l = Math.hypot(acc[v], acc[v + 1], acc[v + 2]) || 1
    W[i * 3] = acc[v] / l; W[i * 3 + 1] = acc[v + 1] / l; W[i * 3 + 2] = acc[v + 2] / l
    if (keep.getX(i) * W[i * 3] + keep.getY(i) * W[i * 3 + 1] + keep.getZ(i) * W[i * 3 + 2] < 0.5) off++
  }
  const all = off / p.count >= 0.08   // 早期那三隻（樹鵲、綠繡眼、白頭翁）歪的很多：整個用重算的
  for (let i = 0; i < p.count; i++) {
    const d = keep.getX(i) * W[i * 3] + keep.getY(i) * W[i * 3 + 1] + keep.getZ(i) * W[i * 3 + 2]
    if (all || d < 0.65) nn.setXYZ(i, W[i * 3], W[i * 3 + 1], W[i * 3 + 2])
  }
  nn.needsUpdate = true
}
// 版本號跟著 index.html 的 ?v= 走，模型檔才不會用到快取的舊版
const VER = new URL(import.meta.url).searchParams.get('v') ?? ''
export const AX = { x: V(1, 0, 0), y: V(0, 1, 0), z: V(0, 0, 1) }
// 腳趾（toeL0a → toeL0b …，Blender 自動找的）：彎曲軸 = 腳趾方向 × 往下，繞它正轉 = 趾尖往下勾
function toesOf(r, sd) {
  r.model.updateWorldMatrix(true, true)
  const at = (b) => r.model.worldToLocal(b.getWorldPosition(V()))
  return Object.keys(r.bones).filter((n) => n.startsWith('toe' + sd) && n.endsWith('a')).map((n) => {
    const a = r.bones[n], b = r.bones[n.slice(0, -1) + 'b'], d = at(b).sub(at(a)).setY(0).normalize()
    return { a: n, b: b.name, axis: d.cross(V(0, -1, 0)).normalize() }
  })
}
function curlToes(r, toes, c) { if (c) for (const t of toes) { r.turn(t.a, t.axis, c * 0.6); r.turn(t.b, t.axis, c * 0.9) } }

/* ---------- 地上走的鳥：現成或 Tripo 生成的模型 + 骨架（body → neck → head、tail、兩翼、兩腳 thigh → shin → foot） ---------- */
// cfg：name 模型、H 顯示高度、h0 模型高度、rotY 讓頭朝 +z、lat「繞它正轉 = 抬頭、腳往前」的左右軸、
//      walk Walker 參數、acts 動作表、step 步幅（公尺）、bob 走路點頭、sway 盯地面時脖子左右晃、
//      hop 兩腳併攏用跳的（跳多高，麻雀、小彎嘴）、flick 尾巴一下一下往上翹（秧雞、水雞）、
//      swim 浮在水面上游：腳收在肚子下面划水（不踩地），每划一下一圈小水波
// ---------- 求偶／群體展示（2026-11-11 使用者：招牌行為要做、而且要正確；動作和數字照 ChatGPT 核對過的鳥類行為） ----------
// 一對／一群鳥共用一個「導演」：每隔 gap 秒開一場（dur 秒），開場時每隻都切到 'show' 動作（動作表裡權重 0，不會自己抽到）、停下腳步；
// 每隻自己的 cfg.show 每格問導演現在演到哪。x.c.si：這隻在群裡的編號（0 當雄鳥／帶頭的）
export const SHOWS = []
function showDirector({ gap, dur, first = [12, 30], onStart, onEnd }) {
  const D = { birds: [], on: false, t: 0, len: 0, wait: rnd(...first), n: 0 }
  SHOWS.push(D)
  D.tick = (x) => {
    if (x.c.si == null) { x.c.si = D.birds.length; D.birds.push({ w: x.w, acts: x.acts, c: x.c }) }
    if (x.c.si === 0) {
      if (D.on) {
        D.t += x.dt
        if (D.t >= D.len || D.birds.every((b) => b.acts.name !== 'show')) { D.on = false; D.wait = rnd(...gap); onEnd?.(D); for (const b of D.birds) if (b.acts.name === 'show') b.acts.next('stand') }
      } else if ((D.wait -= x.dt) <= 0) {
        D.on = true; D.t = 0; D.len = rnd(...dur); D.n++
        for (const b of D.birds) { b.w.goal = null; b.w.want = null; b.acts.next('show') }
        onStart?.(D)
      }
    }
    return D.on && x.acts.name === 'show'
  }
  return D
}
const elAt = (P, t) => { for (const e of P) if (t >= e.t0 && t < e.t0 + e.dur) return [e, (t - e.t0) / e.dur]; return [null, 0] }
// 鶴的舞（丹頂鶴、赤頸鶴）：兩隻面對面，各跳各的、互相回應（錯開 0.2～1.5 秒，不是鏡射）——
//   鞠躬 0.8～1.6 s（頭低到水平以下 20～50°）、仰頭 0.5～1.0 s（嘴朝上 45～80°）、跳躍 0.9～1.8 s（0.3～0.9 m，翅膀張開、腳往下垂）、張翅拍動；
//   六成的場次最後接「齊鳴」4～10 s：並肩站、脖子伸直、嘴朝天 50～85°，雄鳥把翅膀舉到背上、雌鳥翅膀收著；雄鳥一長聲 1～2 s，雌鳥兩短聲
function craneShow(leapMax) {
  const D = showDirector({ gap: [45, 100], dur: [16, 32], onStart: (D) => {
    D.call = Math.random() < 0.6 ? rnd(4.5, 9) : 0
    const end = D.len - D.call - 0.6
    D.plans = D.birds.map((b, i) => {
      const P = []; let t = 0.9 + (i ? rnd(0.3, 1.3) : 0)
      while (t < end - 1.6) {
        const k = Math.random(), e = k < 0.3 ? ['bow', rnd(0.9, 1.6)] : k < 0.5 ? ['toss', rnd(0.6, 1.0)] : k < 0.8 ? ['leap', rnd(1.1, 1.7), rnd(0.3, leapMax)] : ['flap', rnd(1.6, 2.6)]
        P.push({ type: e[0], t0: t, dur: e[1], h: e[2] }); t += e[1] + rnd(0.3, 1.5)
      }
      return P
    })
    const [a, b] = D.birds
    if (b) { a.w.want = Math.atan2(b.w.p.x - a.w.p.x, b.w.p.y - a.w.p.y); b.w.want = a.w.want + Math.PI }
  } })
  return (x) => {
    if (!D.tick(x)) return null
    const i = x.c.si, H = x.cfg.H, o = { lean: 0, neck: -0.1, head: 0, reach: 0.5, rate: 9, wing: 0, jump: 0 }
    if (D.call && D.t > D.len - D.call) {
      if (x.c.callN !== D.n) { x.c.callN = D.n; x.w.want = D.birds[0].w.h + (i ? rnd(-0.25, 0.25) : 0) }   // 並肩、朝同一邊
      const u = (D.t - (D.len - D.call)) % 2.6
      const sing = i === 0 ? (u < 1.6 ? 1 : 0) : ((u > 0.25 && u < 0.8) || (u > 1.0 && u < 1.55) ? 1 : 0)
      o.neck = -0.3; o.reach = 1.0; o.head = -1.05 - 0.14 * sing; o.rate = 12
      if (i === 0) o.wing = 0.75 + 0.05 * Math.sin(x.t * 17) * sing
      return o
    }
    const [e, u] = elAt(D.plans[i] ?? [], D.t)
    if (!e) return o
    const sn = Math.sin(Math.PI * u)
    if (e.type === 'bow') { o.lean = 0.5 * sn; o.neck = 2.0 * sn; o.head = 0.15 * sn; o.reach = 0.35; o.wing = 0.25 * sn }
    else if (e.type === 'toss') { o.neck = -0.3 * sn; o.head = -1.1 * sn; o.reach = 1.0; o.rate = 14 }
    else if (e.type === 'leap') {
      if (u < 0.2) { o.lean = 0.3; o.neck = 0.4; o.jump = -0.07 * H * ss(u, 0, 0.2); o.wing = 0.3 }
      else { const v = Math.min(1, (u - 0.2) / 0.66); o.jump = e.h * 4 * v * (1 - v); o.wing = 1.45 * Math.sin(Math.PI * Math.min(1, v * 1.15)) + 0.2; o.neck = -0.2; o.head = -0.3; o.reach = 0.9; o.lean = u > 0.86 ? 0.2 : -0.1 }
    } else if (e.type === 'flap') {
      if (e.turned !== D.n) { e.turned = D.n; x.w.want = x.w.h + sgn() * rnd(0.5, 2.0) }
      o.wing = (1.6 + 0.35 * Math.sin(x.t * Math.PI * 2 * 2.4)) * Math.min(1, sn * 2); o.neck = -0.15; o.head = -0.25; o.reach = 0.85
    }
    return o
  }
}
// 鳳頭鸊鷉：兩隻游到面對面（0.4～1 m）→ 甩頭儀式 5～12 s（脖子挺直，頭左右甩 ±25～45°、1.5～2.5 Hz，一陣 3～6 下）＋回頭理羽（嘴轉到肩後 90～130°）；
//   四成五的場次接「水草舞」：各自潛水 3～8 s 叼水草上來 → 胸貼胸幾乎直立（靠腳在水下快速划水撐著）2～5 s、頭和水草左右擺 ±15～30°、1～2 Hz → 0.3～0.7 s 內坐回水面
function grebeShow() {
  const weedGeo = (() => { const gs = []; for (let i = 0; i < 6; i++) { const L = rnd(0.12, 0.26), g = new THREE.PlaneGeometry(0.012, L, 1, 4).translate(0, -L / 2, 0).rotateY(rnd(0, 3)).rotateZ(rnd(-0.5, 0.5)); gs.push(g) } return mergeGeometries(gs) })()
  const weedMat = new THREE.MeshStandardMaterial({ color: 0x2c4a1c, roughness: 0.6, side: THREE.DoubleSide })
  const D = showDirector({ gap: [40, 90], dur: [13, 13], onStart: (D) => {
    D.full = Math.random() < 0.45; D.len = D.full ? 29.5 : 13; D.off = rnd(0.15, 0.4); D.sh = rnd(1.6, 2.4)
    const [a, b] = D.birds
    if (!b) return
    const dx = b.w.p.x - a.w.p.x, dz = b.w.p.y - a.w.p.y, d = Math.hypot(dx, dz) || 1, mx = (a.w.p.x + b.w.p.x) / 2, mz = (a.w.p.y + b.w.p.y) / 2
    a.w.goal = new THREE.Vector2(mx - dx / d * 0.45, mz - dz / d * 0.45); b.w.goal = new THREE.Vector2(mx + dx / d * 0.45, mz + dz / d * 0.45)
  } })
  return (x) => {
    const on = D.tick(x), i = x.c.si
    if (x.c.weed) x.c.weed.visible = false
    if (!on) return null
    const o = { lean: 0, neck: -0.25, head: 0, reach: 1.0, rate: 8, jump: 0, yaw: 0, pitch: 0 }, me = D.birds[i], ot = D.birds[1 - i], T = D.t - (i ? D.off : 0)
    if (ot && !x.w.goal) { const hd = Math.atan2(ot.w.p.x - x.w.p.x, ot.w.p.y - x.w.p.y); if (Math.abs(wrap(hd - x.w.h)) > 0.06) x.w.want = hd }
    if (T < 3.5) return o
    const shake = (hz, A, burst = 2.6, onT = 1.7) => (T % burst < onT ? A * Math.sin(T * Math.PI * 2 * hz) : 0)
    let weed = false
    if (T < 11.5) {
      // 甩頭儀式；中間各理一次羽
      const pt = T - (i ? 8.6 : 6.9)
      if (pt > 0 && pt < 1.0) { o.yaw = (i ? -1 : 1) * 1.95 * Math.sin(Math.PI * pt); o.head = 0.35 * Math.sin(Math.PI * pt); o.neck = 0.1 }
      else o.yaw = shake(D.sh, 0.62)
    } else if (D.full && T < 18.5) {
      // 潛水叼水草：頭先栽下去、整隻沉到水下，幾秒後浮上來
      const dn = ss(T, 12, 12.5), upk = ss(T, 17.4 + i * 0.5, 17.9 + i * 0.5)
      o.pitch = -0.7 * dn * (1 - upk); o.prate = 10; o.jump = -0.75 * dn * (1 - upk); o.neck = 0.5 * dn * (1 - upk); weed = upk > 0.5
    } else if (D.full && T < 27.3) {
      weed = true
      const up = ss(T, 21.2, 21.6) * (1 - ss(T, 26.2, 26.7))
      // 直立：身體仰起約 65°，一半以上的身體露出水面；脖子往前補回來保持直立；頭帶著水草左右擺
      o.pitch = 1.05 * up; o.prate = 12; o.jump = -0.1 * up + 0.012 * up * Math.sin(x.t * 34); o.neck = 0.35 * up - 0.25; o.head = 0.5 * up
      o.yaw = up > 0.5 ? 0.42 * Math.sin((T - 21.6) * Math.PI * 2 * 1.5) : 0
    } else if (D.full) weed = T < 28.3
    if (weed) {
      if (!x.c.weed) { x.c.weed = new THREE.Mesh(weedGeo, weedMat); x.c.weed.castShadow = true; x.root.add(x.c.weed) }
      const hb = x.r.bones.head; hb.updateWorldMatrix(true, false)
      x.c.weed.position.copy(x.root.worldToLocal(hb.localToWorld(V(0, x.cfg.bill * 0.85, 0)))); x.c.weed.visible = true
      x.c.weed.rotation.z = 0.25 * Math.sin(x.t * 6 + i)
    }
    return o
  }
}
// 大紅鸛的群體展示（20～40 s）：一群擠在一起、脖子伸得筆直「行軍」（0.5～1 m/s、每秒 1.5～2.5 步），邊走邊「搖頭旗」——頭左右轉 ±45～80°、0.5～1.2 Hz（嘴大致水平，不是朝天）；
//   走一段各自慢 0.3～2 秒陸續掉頭往回走；停下來後輪流「翅膀敬禮」1.5～3 s（翅膀啪地張開露出紅色和黑色飛羽、停 0.5～1.5 s 再收）。同一時間大約四到七成的鳥在做同一件事
function flamingoShow(STRAIGHT) {
  const D = showDirector({ gap: [50, 110], dur: [24, 38], onStart: (D) => {
    D.dir = rnd(0, Math.PI * 2); D.turnT = rnd(5, 7.5); D.stopT = D.turnT * 2
    for (const b of D.birds) { b.lag = rnd(0.3, 2); b.join = Math.random() < 0.85; b.hz = rnd(0.6, 1.1); b.ph = rnd(0, 6); b.sp0 = b.w.speed; b.sal = []
      for (let t = D.stopT + rnd(1, 4); t < D.len - 3; t += rnd(4, 8)) b.sal.push({ t0: t, dur: rnd(1.6, 2.8) }) }
  }, onEnd: (D) => { for (const b of D.birds) if (b.sp0) b.w.speed = b.sp0 } })
  D.bones = STRAIGHT
  return (x) => {
    if (!D.tick(x)) return null
    const b = D.birds[x.c.si]
    if (!b.join) return { rate: 4 }
    const T = D.t - b.lag
    if (T < 0) return { rate: 4 }
    if (T < D.stopT - 0.2) {
      x.w.speed = 0.62
      const dir = D.dir + (T > D.turnT ? Math.PI : 0)
      if (!x.w.goal) { x.w.goal = new THREE.Vector2(x.w.p.x + Math.sin(dir) * 1.2, x.w.p.y + Math.cos(dir) * 1.2); x.w.want = null }
      else if (T > D.turnT && !b.rev) { b.rev = D.n; x.w.goal = new THREE.Vector2(x.w.p.x + Math.sin(dir) * 1.2, x.w.p.y + Math.cos(dir) * 1.2) }
    } else { x.w.speed = b.sp0; x.w.goal = null }
    if (b.rev && b.rev !== D.n) b.rev = 0
    const o = { lean: 0, neck: 0, head: 0, reach: 0.25, rate: 7, bones: STRAIGHT, yaw: 0.95 * Math.sin(T * Math.PI * 2 * b.hz + b.ph), wing: 0, tail: 0 }
    const [e, u] = elAt(b.sal, D.t)
    if (e) { o.wing = 0.34 * ss(u, 0, 0.14) * (1 - ss(u, 0.72, 1)); o.yaw = 0; o.tail = 0.3 * o.wing / 0.34 }   /* 2026-11-12 使用者：翅膀變形——站姿模型的翅膀是收著的一整片，張到 1.5 會整片掀起來、露出裡面破掉的白底；只微微抬起抖一下 */
    return o
  }
}
// 流蘇鷸的求偶場：雄鳥各顧各的小地盤、互相較勁（不同步；一隻動了，旁邊的 0.2～1 秒內跟著回應）。10～30 秒一陣、歇 5～20 秒——
//   挺立 2～6 s（身體拉高一兩成、脖子伸長、飾羽全開）、抖翅 0.4～1.2 s（每秒 5～9 下、張開 20～50°）有時小跳 5～25 cm、
//   前傾威嚇 1～3 s（身體前傾 15～35°、嘴水平，朝對手走 2～5 小步）、蹲伏不動 3～12 s（身體壓低兩到四成、嘴朝下 30～70°）
function ruffShow() {
  const D = showDirector({ gap: [5, 20], dur: [10, 30], first: [6, 14], onStart: (D) => {
    D.plans = D.birds.map(() => {
      const P = []; let t = rnd(0, 1.2)
      while (t < D.len - 1) {
        const k = Math.random(), e = k < 0.28 ? ['up', rnd(2, 5)] : k < 0.55 ? ['flut', rnd(0.5, 1.1), Math.random() < 0.6 ? rnd(0.05, 0.22) : 0] : k < 0.8 ? ['threat', rnd(1.2, 2.8)] : ['squat', rnd(3, 9)]
        P.push({ type: e[0], t0: t, dur: e[1], h: e[2] }); t += e[1] + rnd(0.2, 1.0)
      }
      return P
    })
  } })
  return (x) => {
    if (!D.tick(x)) return null
    const i = x.c.si, H = x.cfg.H, o = { lean: 0.05, neck: 0, head: 0, reach: 0.5, rate: 10, wing: 0, jump: 0 }
    const [e, u] = elAt(D.plans[i] ?? [], D.t)
    if (!e) return o
    if (e.type === 'up') { o.neck = -0.35; o.reach = 1.0; o.lean = -0.12; o.jump = 0.03 * H }
    else if (e.type === 'flut') { o.wing = 0.45 + 0.3 * Math.sin(x.t * Math.PI * 2 * 7); o.neck = -0.3; o.reach = 0.9; if (e.h) { const v = ss(u, 0.15, 0.85); o.jump = e.h * 4 * v * (1 - v) } }
    else if (e.type === 'threat') {
      o.lean = 0.42; o.neck = 0.35; o.head = -0.25; o.reach = 0.8
      if (e.went !== D.n) {
        e.went = D.n
        let best = null, bd = 1e9
        for (const b of D.birds) if (b.w !== x.w) { const d = x.w.p.distanceTo(b.w.p); if (d < bd) { bd = d; best = b } }
        if (best && bd > 0.5) { const k = Math.min(0.3, bd - 0.45) / bd; x.w.goal = new THREE.Vector2(lerp(x.w.p.x, best.w.p.x, k), lerp(x.w.p.y, best.w.p.y, k)); x.w.want = null }
      }
    } else if (e.type === 'squat') { const dn = ss(u, 0, 0.08) * (1 - ss(u, 0.94, 1)); o.jump = -0.055 * dn; o.lean = 0.55 * dn; o.neck = 0.7 * dn; o.head = 0.35 * dn; o.reach = 0.3; o.rate = 14 }
    return o
  }
}
function groundTripo(env, cfg) {
  const r = rigged(cfg.name)
  const k = cfg.H / cfg.h0, LAT = cfg.lat, FWD = cfg.fwd ?? V(1, 0, 0)   // FWD：身體前後軸（側傾用）
  const root = new THREE.Group(), inner = new THREE.Group()
  r.model.scale.setScalar(k); inner.add(r.model)
  inner.rotation.y = cfg.rotY
  // 溫室的地面本身就接太陽陰影，不用再加 fju 那個接觸陰影圓盤（會變成腳下一圈黑）
  root.add(inner)
  const w = new Walker({ radius: 0.7, speed: 0.16, turn: 1.0, ...cfg.walk })
  w.h = env.face(sgn(), rnd(0.3, 0.8))
  // cfg.patrol：[[x,z],[x,z]]（鳥群座標）在兩點之間走過去、走回來（山鷸在步道上）；每次走到端點附近隨機一點
  if (cfg.patrol) { let e = 0; w.pick = () => { e ^= 1; const [x, z] = cfg.patrol[e]; w.goal = new THREE.Vector2(x + rnd(-0.15, 0.15), z + rnd(-0.15, 0.15)); w.want = null; return true } }
  const acts = new Acts(cfg.acts, (n, a) => {
    if (n === 'walk' && !w.pick(0.25)) a.next('look')
    if (n === 'turn') w.want = w.h + a.sgn * rnd(0.6, 2)
  })
  const glance = new Glance([0.6, 1.8], 0.7, 0.25)
  const c = { lean: 0, neck: 0, head: 0, yaw: 0, phase: 0, amp: 0, sway: 0, reach: 0, roll: 0, hb: 0, hb0: 0, thrust: 9, prevPhase: 0, run: 0, runPh: 0 }, focus = V()
  // 腳：踩在地上的那一點固定不動（不會滑），離身體太遠就抬起來跨到前面；一次只抬一隻。
  // 大腿、小腿用兩節 IK 對到腳踝目標，腳掌保持原本貼地的角度。全部在模型座標的側面（FWD、y）平面裡算
  const N = FWD.clone().cross(AX.y).normalize()   // 繞 N 轉 = 在側面平面裡從 FWD 轉向上
  const mp = (b, out = V()) => r.model.worldToLocal(r.bones[b].getWorldPosition(out))
  const ang = (a, b) => Math.atan2(b.y - a.y, _d.subVectors(b, a).dot(FWD))
  const _d = V(), _t = V(), _q = new THREE.Quaternion(), _p = new THREE.Quaternion(), _r = new THREE.Quaternion(), _m = new THREE.Quaternion()
  // 在模型座標裡繞 axis 轉骨頭（身體前傾、側傾之後也準；r.turn 的軸是以靜止姿勢算的）
  const modelQ = (o, out) => out.copy(_m.copy(r.model.getWorldQuaternion(_m)).invert()).multiply(o.getWorldQuaternion(_r))
  const rotM = (bn, axis, a) => {
    const b = r.bones[bn], pm = modelQ(b.parent, new THREE.Quaternion()), bm = modelQ(b, new THREE.Quaternion())
    b.quaternion.copy(pm.invert().multiply(_q.setFromAxisAngle(axis, a).multiply(bm)))
    b.updateWorldMatrix(false, true)
  }
  r.model.updateWorldMatrix(true, true)
  const legs = ['L', 'R'].map((sd) => {
    const hip = mp('thigh' + sd), knee = mp('shin' + sd), ankle = mp('foot' + sd)
    const a = knee.clone().sub(hip), b = ankle.clone().sub(knee)
    const bend = Math.sign(a.dot(FWD) * b.y - a.y * b.dot(FWD))
    // 腳是斜的（往外張），IK 在側面平面裡算，所以骨長也要用投影到側面的長度
    return { sd, toes: toesOf(r, sd), rest: ankle, L1: Math.hypot(a.dot(FWD), a.y), L2: Math.hypot(b.dot(FWD), b.y), bend, flat: r.bones['foot' + sd].userData.inv.clone().invert(),
      plant: null, from: V(), to: V(), t: 1, pos: V() }
  })
  const stride = cfg.stride ?? 0.22 * cfg.H, lift = cfg.lift ?? 0.06 * cfg.H, swing = cfg.swingT ?? 0.32
  const [KA, KB] = cfg.knee ?? [0.5, 1.1]   // 抬腳時：腳跟（看起來像膝蓋）往前上抬多少、跗蹠往後折多少
  const ik = (L, target) => {
    const hip = mp('thigh' + L.sd), tg = r.model.worldToLocal(_t.copy(target))
    const du = _d.subVectors(tg, hip).dot(FWD), dv = tg.y - hip.y
    const d = clamp(Math.hypot(du, dv), Math.abs(L.L1 - L.L2) + 1e-4, (L.L1 + L.L2) * 0.999)
    const base = Math.atan2(dv, du), al = Math.acos(clamp((L.L1 * L.L1 + d * d - L.L2 * L.L2) / (2 * L.L1 * d), -1, 1))
    // 兩種彎法挑跟原本模型同一個方向的
    let want = base + al
    const kx = Math.cos(want) * L.L1, ky = Math.sin(want) * L.L1
    if (Math.sign(kx * (dv - ky) - ky * (du - kx)) !== L.bend) want = base - al
    rotM('thigh' + L.sd, N, want - ang(hip, mp('shin' + L.sd)))
    const knee = mp('shin' + L.sd)
    rotM('shin' + L.sd, N, ang(knee, tg) - ang(knee, mp('foot' + L.sd)))
    // 抬腳（照影片）：腳跟往前上提、跗蹠往後折讓腳掌拖在後面，過一半後再往前伸直、落地
    const sw = L.t < 1 ? L.t : 0
    if (sw) {
      rotM('thigh' + L.sd, N, -KA * Math.sin(Math.PI * sw))
      rotM('shin' + L.sd, N, KB * Math.sin(Math.PI * Math.min(1, sw / 0.8)))
    }
    // 腳掌：回到模型座標裡原本的角度（貼平），抬腳時腳趾往下垂
    const fb = r.bones['foot' + L.sd]
    _p.copy(r.model.getWorldQuaternion(_q)).invert().multiply(fb.parent.getWorldQuaternion(_q)).invert()
    fb.quaternion.copy(_p.multiply(L.flat))
    fb.updateWorldMatrix(false, true)
    if (sw) rotM('foot' + L.sd, N, 0.5 * Math.sin(Math.PI * Math.min(1, sw / 0.85)))
    // 腳趾：空中收起來、快落地時張開，踩地時平貼
    curlToes(r, L.toes, sw ? 0.9 * Math.sin(Math.PI * Math.min(1, sw / 0.85)) - 0.15 * ss(sw, 0.8, 1) : 0)
  }
  // 蚯蚓：每格用目前嘴尖的位置重排一條管子。拔的時候一端還在土裡、被拉長；拔出來後掛在嘴上扭，吞的時候越來越短
  let wormMesh = null, wormOn = false, caught = false, skin = null, tipIdx = -1
  // 嘴尖：模型上最往前的那個頂點（只看上半身），每格用蒙皮後的位置，蚯蚓才真的夾在嘴裡
  if (cfg.worm) {
    r.model.traverse((o) => { if (o.isSkinnedMesh) skin = o })
    const p = skin.geometry.attributes.position, v = V(), H = skin.geometry.boundingBox ?? (skin.geometry.computeBoundingBox(), skin.geometry.boundingBox)
    let best = Infinity
    for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); if (v.y > H.max.y * 0.6 && v.dot(FWD) < best) { best = v.dot(FWD); tipIdx = i } }
  }
  const anchor = V(), _tip = V(), _hd = V(), wormMat = new THREE.MeshStandardMaterial({ color: 0xb8675c, roughness: 0.45, emissive: 0x2a0d08 })
  const worm = (n, kk, t) => {
    if (n !== 'worm' || kk < 0.18) { wormOn = false; if (wormMesh) wormMesh.visible = false; return }
    r.bones.head.updateWorldMatrix(true, true)
    const tip = skin.getVertexPosition(tipIdx, _tip).applyMatrix4(skin.matrixWorld)
    // 往頭的方向縮 1.5 公分：夾在上下喙之間，不是黏在尖端外面
    tip.addScaledVector(r.bones.head.getWorldPosition(_hd).sub(tip).normalize(), 0.015)
    if (!wormOn) { wormOn = true; caught = Math.random() < 0.75; anchor.set(tip.x, 0.004, tip.z) }
    if (!caught || kk > 0.97) { if (wormMesh) wormMesh.visible = false; return }
    const pts = [], N = 12, L = 0.15
    const release = ss(kk, 0.53, 0.58), swallow = ss(kk, 0.75, 0.97)
    // 露出來的那段最長 L：拉得比 L 遠，土裡那端就被拔起來跟著走
    const dir = V().subVectors(anchor, tip), dl = dir.length()
    const end = dl > L ? tip.clone().addScaledVector(dir, L / dl) : anchor.clone()
    end.y = Math.max(end.y, 0.004)
    for (let i = 0; i <= N; i++) {
      const u = i / N
      // 還連著土：從地面拉到嘴尖，中間有點下垂、扭來扭去掙扎
      const a = V().lerpVectors(end, tip, u), wob = Math.sin(Math.PI * u)
      a.y -= wob * 0.012; a.x += Math.sin(u * 8 + t * 18) * 0.009 * wob; a.z += Math.cos(u * 7 + t * 15) * 0.007 * wob
      // 拔出來了：從嘴尖往下垂、左右扭；吞的時候長度縮短
      const len = L * (1 - swallow) * u
      const b = V(tip.x + Math.sin(u * 5 + t * 9) * 0.035 * u, tip.y - len, tip.z + Math.cos(u * 4 + t * 7) * 0.025 * u)
      pts.push(a.lerp(b, release))
    }
    if (!wormMesh) { wormMesh = new THREE.Mesh(new THREE.BufferGeometry(), wormMat); wormMesh.frustumCulled = false; root.parent.add(wormMesh) }
    wormMesh.visible = true
    wormMesh.geometry.dispose()
    wormMesh.geometry = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map((p) => root.parent.worldToLocal(p))), 18, 0.0065, 5)
  }
  const C0 = { ...c }
  const update = (t, dt) => {
    if (!(dt > 0)) return   // dt = 0（同一格第二次）不用動
    acts.tick(dt)
    // 山鷸（照影片）：只在身體往前搖的那半拍往前走（速度 sin² 曲線，平均速度不變），往後坐時腳不動、頭停在原地
    let gate = 1
    if (cfg.rock) {
      c.rf = damp(c.rf ?? 0.9, c.amp > 0.2 ? (cfg.rockHz ?? 2) : 0.9, 2, dt)
      // 走走停停（ChatGPT 第四輪：牠的招牌是「兩腳踩著不動、身體照樣前後扭」）：每 1.4～2.6 秒停 0.3～0.5 秒，停的時候腳步相位也停
      c.pz = (c.pz ?? 1.5) - dt; c.pzLen ??= 0.4
      if (c.pz < -c.pzLen) { c.pz = rnd(1.4, 2.6); c.pzLen = rnd(0.3, 0.5) }
      c.mv = damp(c.mv ?? 1, c.pz < 0 ? 0 : 1, 14, dt)
      c.rph = (c.rph ?? 0) + dt * c.rf * Math.PI * 2 * c.mv                  // 步態相位（腳）
      c.kph = (c.kph ?? 0) + dt * c.rf * (cfg.rockMul ?? 1) * Math.PI * 2    // 搖擺相位（身體）一直在跑，跟腳步各自獨立
      gate = c.mv * (1 + 0.08 * Math.sin(c.kph))   // 速度幾乎固定（原本 0.4～2.8 倍的忽快忽慢是不順的主因之一）
    }
    const d = w.update(dt * gate)
    // 用跳的：身體停在 dp，落後 walker 一個步幅就整隻跳過去（兩腳一起），walker 停了也要跳到定點
    let hopY = 0, hopStart = false
    if (cfg.hop) {
      c.dp ??= w.p.clone()
      if (c.hopT == null || c.hopT >= 1) {
        if (c.dp.distanceTo(w.p) > stride * (w.busy ? 1 : 0.2)) { c.hopFrom = c.dp.clone(); c.hopTo = w.p.clone(); c.hopT = 0; hopStart = true }
      }
      if (c.hopT < 1) {
        c.hopT = Math.min(1, c.hopT + dt / swing)
        const e = c.hopT * c.hopT * (3 - 2 * c.hopT)
        c.dp.lerpVectors(c.hopFrom, c.hopTo, e); hopY = cfg.hop * Math.sin(Math.PI * c.hopT)
      }
    }
    const P = cfg.hop ? c.dp : w.p
    if ((acts.name === 'walk' || acts.name === 'turn') && !w.busy) acts.next()
    // 山鷸：腳步跟搖擺共用同一個相位（一個搖擺週期＝左右各一步），不再各算各的而慢慢錯開
    if (cfg.rock) c.phase += w.busy ? dt * c.rf * c.mv : 0
    else c.phase += d / stride
    c.amp = damp(c.amp, w.busy ? 1 : 0, 6, dt)
    const n = acts.name, kk = acts.k
    // 目標姿勢：lean 身體前傾、neck 脖子往前下伸、head 頭抬回水平、reach 脖子伸長（cfg.reach 倍）
    let lean = 0, neck = 0, head = 0, reach = 0.45, rate = 4
    if (n === 'hunt' || n === 'stare') { lean = 0.35; neck = 0.5; head = -0.35; reach = 0.85 }
    else if (n === 'strike' || n === 'peck') {
      if (kk < 0.3) { lean = 0.4; neck = 0.6; head = -0.4; reach = 0.6 }
      else if (kk < 0.45) { lean = 0.75; neck = 1.1; head = -0.2; reach = 1.2; rate = 25 }
      else { lean = 0.1; neck = 0.1; head = 0.1; reach = 0.4; rate = 6 }
    } else if (n === 'walk' || n === 'turn') { lean = 0.15; neck = 0.2; head = -0.15; reach = 0.6 }
    else if (n === 'look') { neck = -0.25; head = 0.2; reach = 1.05 }   // 警戒：脖子往上伸直
    else if (n === 'worm') {
      // 抓蚯蚓：瞄準 → 戳進草裡 → 分三下把蚯蚓拔出來 → 叼著甩一甩 → 嘴朝上吞下去
      if (kk < 0.12) { lean = 0.4; neck = 0.6; head = -0.4; reach = 0.6 }
      else if (kk < 0.2) { lean = 0.75; neck = 1.15; head = -0.2; reach = 1.2; rate = 25 }
      else if (kk < 0.55) {
        const pp = (kk - 0.2) / 0.35 * 3, pull = (Math.floor(pp) + ss(pp % 1, 0, 0.35)) / 3
        lean = 0.75 - 0.3 * pull; neck = 1.1 - 0.45 * pull; head = -0.2 + 0.05 * pull; reach = 1.2 - 0.25 * pull; rate = 18
      } else if (kk < 0.75) { lean = 0.2; neck = 0.05; head = -0.05; reach = 0.85; rate = 8 }
      else { lean = 0.05; neck = -0.35; head = -0.6 + 0.08 * Math.sin(t * 9); reach = 0.9; rate = 7 }
    }
    // 2026-11-11 求偶／群體展示（cfg.show，見 showDirector）：回傳這一格的目標姿勢，蓋掉上面照動作名字給的
    // 2026-11-11 cfg.feed：長脖子的鳥低頭覓食的姿勢（跟 show 同一種回傳值；沒有展示在演才用）。使用者：琵鷺、紅鶴低頭時身體往下彎、脖子動得很怪
    // ——原本只有「身體前傾＋整條脖子一起轉」，S 形的長脖子根本伸不到水面
    const ex = (cfg.show ? cfg.show({ c, n, t, dt, w, acts, root, r, cfg }) : null) ?? (cfg.feed ? cfg.feed({ c, n, kk, t }) : null)
    if (ex) { lean = ex.lean ?? lean; neck = ex.neck ?? neck; head = ex.head ?? head; reach = ex.reach ?? reach; rate = ex.rate ?? rate }
    // 跑（被人嚇到逃跑，速度是走路的好幾倍）：身體前傾、脖子往前伸；腳改用跑步循環（下面）
    const baseV = cfg.walk?.speed ?? 0.16
    c.run = damp(c.run, w.v > baseV * 2.5 ? 1 : 0, 8, dt)
    lean += 0.28 * c.run; neck += 0.25 * c.run; head -= 0.15 * c.run
    c.lean = damp(c.lean, lean, rate, dt); c.neck = damp(c.neck, neck, rate, dt); c.head = damp(c.head, head, rate, dt)
    c.reach = damp(c.reach, reach * (cfg.reach ?? 0), rate, dt)
    if (n === 'look' || n === 'stand') glance.update(dt)
    c.yaw = damp(c.yaw, n === 'look' || n === 'stand' ? glance.yaw * (n === 'look' ? 1 : 0.4) : 0, 10, dt)
    // 盯地面時脖子左右慢慢晃（頭保持對著同一點，用視差判斷獵物位置），晃一陣停一陣
    c.sway = damp(c.sway, ex?.sway != null ? ex.sway : n === 'stare' && cfg.sway ? 0.35 * ss(Math.sin(t * 0.45), -0.3, 0.3) * Math.sin(t * 3.4)
      : n === 'worm' && kk > 0.55 && kk < 0.75 ? 0.3 * Math.sin(t * 13) : 0, n === 'worm' ? 20 : 8, dt)   // 叼著蚯蚓時頭左右甩
    const ph = c.phase * Math.PI * 2
    r.reset()
    // 走路時重心移到踩地的那隻腳（身體側傾）、每一步前後點一下；站著時慢慢呼吸
    c.roll = damp(c.roll, 0.05 * ((legs[0].t < 1) - (legs[1].t < 1)), 5, dt)
    const roll = c.roll, pitch = 0.035 * Math.sin(ph * 2) * c.amp, breath = 0.025 * Math.sin(t * 1.7)
    if (r.bones.chest) {
      // 身體兩節分攤前傾，脖子三節分攤彎曲和伸長，頭整顆不變形
      r.turn('body', LAT, -c.lean * 0.6 + pitch + 0.015 * Math.sin(t * 1.3)); r.turn('body', FWD, roll)
      r.turn('chest', LAT, -c.lean * 0.4 + breath - pitch * 0.5); r.turn('chest', FWD, -roll * 0.4)
      const nb = -c.neck * 0.8 - pitch * 0.5, ny = c.yaw * 0.5 + c.sway
      if (r.bones.neck4) {
        // 2026-11-12 紅鶴：脖子 8 節（neck…neck8）。前後彎平均分給每一節；左右轉只給上半段（下半段貼著胸口，轉了胸前會擠出一塊）
        const NK = r.neckChain ??= Object.keys(r.bones).filter((k) => /^neck\d*$/.test(k)).sort((p, q) => (+p.slice(4) || 1) - (+q.slice(4) || 1))
        // 左右轉（使用者：「轉頭應該是用頭，你像是捏住脖子在扭」）：只有最上面三節各分一點，其餘交給頭（下面 head 另外補 0.35）
        NK.forEach((b, i) => { r.turn(b, LAT, nb / NK.length); const k = i - (NK.length - 3); if (k >= 0) r.turn(b, AX.y, ny * [0.06, 0.09, 0.15][k]) })   // ChatGPT：N6～N8 照 20／30／50% 分
        r.turn('head', AX.y, c.yaw * 0.35)
        r.turn(NK.at(-1), FWD, -roll * 0.6)
        for (const b of [...NK.slice(1), 'head']) r.stretch(b, c.reach)
      } else {
      for (const [b, f] of [['neck', 0.45], ['neck2', 0.35], ['neck3', 0.2]]) { r.turn(b, LAT, nb * f); r.turn(b, AX.y, ny * f) }
      r.turn('neck3', FWD, -roll * 0.6)
      for (const b of ['neck2', 'neck3', 'head']) r.stretch(b, c.reach)
      }
    } else {
      r.turn('body', LAT, -c.lean - (cfg.swim ? 0.08 : 0) + 0.02 * Math.sin(t * 1.3)); r.turn('body', FWD, roll)
      r.turn('neck', LAT, -c.neck * 0.8); r.turn('neck', AX.y, c.yaw * 0.5 + c.sway)
      r.stretch('head', c.reach)
    }
    // cfg.rock：山鷸的「搖擺步」（2026-11-10 照影片與研究重做）：身體在腳上前後搖、頭在空中幾乎完全不動。
    // 頭和身體分開算：先記下「沒搖時」頭在鳥本身座標的位置，套上身體的搖擺後，再把脖子／頭的骨頭推回那個位置
    // （2026-11-10 骨架加到身體兩節＋脖子三節，位移分給脖子根、中段、頭），頭的角度也反向補回身體的前傾，看起來就是身體在頭底下滑來滑去
    let rockNeck = 0, headAnchor = null
    if (cfg.rock && r.bones.head) {
      c.rockA = damp(c.rockA ?? 0, c.amp > 0.2 ? 1 : 0.3 * ss(Math.sin(t * 0.7), 0.2, 1), 4, dt)
      // 節奏在上面 w.update 前算：c.kph 身體搖擺（rockHz×rockMul，一直跑）、c.rph 腳步（停下時也停），各自慢慢變速
      // rockMul：每個步態週期搖幾下（山鷸 2：每一步搖一下，腳踩著不動時身體自己前後扭——ChatGPT 第三輪：這才是牠獨特的舞步）
      const rp = c.kph / (Math.PI * 2), rk = rockCurve(rp), A = cfg.rock * c.rockA
      inner.position.z = 0; inner.position.y = 0; inner.updateWorldMatrix(true, true)        // 上一格的位移要先歸零再量
      headAnchor = root.worldToLocal(r.bones.head.getWorldPosition(V()))
      inner.position.z = A * cfg.H * 0.069 * rk                               // 身體前後移
      inner.position.y = A * cfg.H * 0.0077 * rockCurve(rp - 0.25)                    // 往後坐時身體微微下沉
      r.turn('body', LAT, -0.025 * A * rk); r.turn('chest', LAT, -0.015 * A * rockCurve(rp - 0.04))   // 往前推時身體前傾、尾端翹起（兩節分攤，背部彎得比較順）
      r.turn('tail', LAT, 0.035 * A * rockCurve(rp - 0.08))   // 尾巴跟著身體、慢一點點
      c.hph = rp
      rockNeck = 0.035 * A * rk - 0.024 * A * (rockCurve(rp - 0.13, HEAD_KEYS) - 0.5)   // 頭往前探到底時嘴尖微微往下點（±0.7°，比位移慢 0.05 週期）                                               // 頭的角度補回來，保持水平
    }
    r.turn('head', LAT, -c.neck * 0.3 - c.head + rockNeck); r.turn('head', AX.y, c.yaw * 0.6 - c.sway * 0.95)
    if (cfg.show || cfg.feed) {
      // 展示用的額外動作：翅膀張開（sw）、整隻升降（jy：跳、蹲、潛水）、頭左右甩（sy）、身體仰起（sp）、個別骨頭多轉（sb）
      c.sw = damp(c.sw ?? 0, ex?.wing ?? 0, 14, dt); c.jy = damp(c.jy ?? 0, ex?.jump ?? 0, ex ? 28 : 8, dt)
      c.sy = damp(c.sy ?? 0, ex?.yaw ?? 0, 22, dt); c.sp = damp(c.sp ?? 0, ex?.pitch ?? 0, ex?.prate ?? 6, dt); c.st = damp(c.st ?? 0, ex?.tail ?? 0, 8, dt)
      if (Math.abs(c.sw) > 0.005) for (const [wg, sg] of [['wingL', 1], ['wingR', -1]]) { r.turn(wg, FWD, sg * c.sw * (cfg.wingSign ?? 1)); r.turn(wg, AX.y, sg * c.sw * (cfg.wingOut ?? 0.3)) }
      if (c.sy) r.turn('head', AX.y, c.sy)
      if (c.sp) r.turn('body', LAT, c.sp)
      if (c.st) r.turn('tail', LAT, c.st)
      c.sb ??= {}
      for (const b of new Set([...Object.keys(c.sb), ...Object.keys(ex?.bones ?? {})])) { c.sb[b] = damp(c.sb[b] ?? 0, ex?.bones?.[b] ?? 0, 7, dt); if (Math.abs(c.sb[b]) > 0.002) r.turn(b, LAT, c.sb[b]) }
    }
    // 尾巴：前傾時翹起、走路時跟著步伐上下左右擺
    const flick = cfg.flick ? cfg.flick * Math.pow(Math.max(0, Math.sin(t * (cfg.flickF ?? 2.4))), 6) : 0
    r.turn('tail', LAT, 0.1 * c.lean + 0.06 * Math.sin(ph * 2 + 1) * c.amp + flick + (cfg.swim ? 0.3 : 0)); r.turn('tail', AX.y, 0.08 * Math.sin(ph) * c.amp)
    for (const [wg, sg] of [['wingL', 1], ['wingR', -1]]) r.turn(wg, AX.y, sg * (0.02 * breath / 0.025 + 0.04 * Math.abs(roll) / 0.07))
    // 用跳的鳥：以前整隻只是上下平移，身體像一塊板（2026-11-08 使用者：紫嘯鶇跳起來很僵硬）。
    // 起跳身體往前傾、空中抬頭＋翅膀微張＋尾巴上揚、落地往前一沉＋尾巴往上一翹（平衡），頭盡量保持水平
    let hopDip = 0
    if (cfg.hop) {
      const hT = c.hopT ?? 1, air = hT < 1 ? Math.sin(Math.PI * hT) : 0
      if (hT < 1) c.landT = -1
      else if (c.landT === -1) c.landT = 0
      if (c.landT >= 0) c.landT += dt
      const land = c.landT >= 0 ? Math.exp(-c.landT * 9) * Math.max(0, Math.cos(c.landT * 14)) : 0
      const tilt = hT < 1 ? 0.2 * Math.sin(2 * Math.PI * hT) : 0   // 前半段前傾、後半段抬頭準備落地
      r.turn('body', LAT, -tilt - 0.2 * land)
      r.turn('head', LAT, 0.7 * tilt + 0.15 * land)
      r.turn('tail', LAT, 0.35 * air + 0.5 * land)
      for (const [wg, sg] of [['wingL', 1], ['wingR', -1]]) r.turn(wg, AX.y, sg * 0.22 * air)
      hopDip = -cfg.hop * 0.35 * land
    }
    // 抬腳那一下身體微微升起
    const up = legs.reduce((a, L) => a + (L.t < 1 ? Math.sin(Math.PI * L.t) : 0), 0)
    // 跟著地形走：腳下那一點的地面高度（相對鳥群原點）；涉水的鳥不用（水底看不到）
    // 跑步循環的相位：每跑 runStride 公尺一個循環（步幅照速度放大，最多走路的 2.6 倍）
    const runStride = stride * clamp(Math.sqrt(Math.max(1, w.v / baseV)), 1, 2.6) * 1.6
    if (c.run > 0.01) c.runPh += (w.v * dt) / runStride
    const runBob = c.run * 0.02 * cfg.H * Math.abs(Math.sin(c.runPh * Math.PI * 2))   // 每一步身體上下一下
    const liftY = (cfg.hop ? 0 : 0.012 * cfg.H * up * (1 - c.run)) + runBob, gyHere = env.groundAt ? env.groundAt(P.x, P.y) : 0
    c.gy = c.gy == null ? gyHere : damp(c.gy, gyHere, 12, dt)
    root.position.set(P.x, c.gy + liftY + hopY + hopDip + (c.jy ?? 0), P.y); root.rotation.y = w.h
    root.updateWorldMatrix(true, true)
    // 山鷸的頭：要等整隻鳥這一格的位置擺好之後才能釘（以前在擺位置前釘，頭永遠慢一格，每抬一次腳就上下抖 4～5 mm）。
    // 目標 = 沒搖時頭的位置，扣掉抬腳那一下的身體升起，再低通平滑一下（速度變化不會一頓一頓）
    if (headAnchor) {
      const want = root.localToWorld(headAnchor.clone()); want.y -= liftY
      if (!c.hw || c.hw.distanceTo(want) > 0.06) c.hw = want.clone()
      else c.hw.lerp(want, 1 - Math.exp(-24 * dt))
      const hNow = r.bones.head.getWorldPosition(V()), hTgt = hNow.clone().lerp(c.hw, 0.78)   // 穩 78%
      hTgt.addScaledVector(V(Math.sin(w.h), 0, Math.cos(w.h)), (0.003 + 0.001 * (c.mv ?? 1)) * c.rockA * rockCurve((c.hph ?? 0) - 0.08, HEAD_KEYS))   // 頭自己的前探節奏（停步時 3 mm、走路 4 mm），頭還是跟身體有一點點連動，不會像浮在空中
      for (const [b, f] of [['neck', 1 / 3], ['neck2', 1 / 2], ['head', 1]]) {   // 位移分三段吃：脖子根、脖子中段、頭，脖子伸縮才平順
        const bn = r.bones[b] ?? r.bones.head
        bn.parent.updateWorldMatrix(true, false)
        const pw = bn.parent.worldToLocal(hTgt.clone()), pn = bn.parent.worldToLocal(r.bones.head.getWorldPosition(V()))
        bn.position.addScaledVector(pw.sub(pn), f)
        bn.updateMatrixWorld(true)
      }
    }
    const fwd = _t.set(Math.sin(w.h), 0, Math.cos(w.h)).clone(), moving = c.amp > 0.3
    // 走路時左右腳照節拍輪流跨：每走 stride 公尺一個循環，左腳在 0、右腳在半圈，步伐才平均
    const beat = legs.map((L, i) => moving && Math.floor(c.phase + i * 0.5) > Math.floor(c.prevPhase + i * 0.5))
    c.prevPhase = c.phase
    if (cfg.swim) {
      // 游泳（照影片）：腳整隻收進肚子底下看不到（大腿骨縮小，整條腿跟著縮到髖關節），在水面下輪流往後划；
      // 身體微微前傾、尾巴翹起來，每划一下頭往前點一下
      legs.forEach((L, li) => {
        const kick = c.amp * Math.sin(ph + li * Math.PI)
        r.bones['thigh' + L.sd].scale.setScalar(0.2)
        r.turn('thigh' + L.sd, LAT, 0.8 + 0.25 * kick)
        r.turn('shin' + L.sd, LAT, -1.6 - 0.35 * kick)
        r.turn('foot' + L.sd, LAT, 1.2 + 0.3 * kick)
        curlToes(r, L.toes, 0.6 - 0.4 * kick)
      })
      // 每划一下：頭往前點一下、身體後面一圈小水波
      if (beat[0] || beat[1]) {
        c.thrust = 0; c.hb0 = c.hb
        const p = root.localToWorld(_d.set(0, 0, -0.1))
        ripple(p.x, p.z, 0.3)
      }
      root.position.y += 0.004 * Math.sin(t * 2.1)   // 浮在水上微微起伏
    }
    if (!cfg.swim) legs.forEach((L, li) => {
      const home = r.model.localToWorld(L.rest.clone()); home.y -= liftY
      if (!L.plant) { L.plant = home.clone(); L.pos.copy(home) }
      // 展示的跳躍（鶴、流蘇鷸）：離地時兩隻腳照站姿往下垂、微微伸直，不踩在原地（以前腳釘在地上，跳高時一隻腳被拉成往前踢）
      if ((c.jy ?? 0) > 0.03) { L.plant.copy(home); L.plant.y -= Math.min(c.jy, 0.05 * cfg.H); L.pos.copy(L.plant); L.t = 1; ik(L, L.pos); return }
      // 跑：不用「踩住、落後太多才跨」（7 倍速時腳跟不上，會縮在肚子下被拖著走），
      // 改成兩腳半個循環錯開，前後擺動、往前擺的那一半抬離地面（2026-11-08 帝雉）
      if (c.run > 0.5 && !cfg.hop) {
        const a = (c.runPh + li * 0.5) * Math.PI * 2
        L.pos.copy(home).addScaledVector(fwd, runStride * 0.5 * Math.cos(a))
        L.pos.y += 0.1 * cfg.H * Math.max(0, -Math.sin(a))   // 往前擺（cos 變大）的那半圈離地；往後蹬的那半圈踩在地上
        L.plant.copy(L.pos); L.t = 1
        ik(L, L.pos)
        return
      }
      const other = legs.find((o) => o !== L)
      if (L.t < 1) {
        L.t = Math.min(1, L.t + dt / swing)
        const e = L.t * L.t * (3 - 2 * L.t)
        L.pos.lerpVectors(L.from, L.to, e); L.pos.y += lift * Math.sin(Math.PI * L.t)
        if (L.t >= 1) { L.plant.copy(L.to); if (cfg.wade) ripple(L.to.x, L.to.z, 0.35) }   // 涉水時每踩一步一圈小水波
      } else {
        L.pos.copy(L.plant)
        // 腳落後太多（走路）或離站姿位置太遠（停下、轉身）就跨一步；另一隻腳在空中時不跨
        const far = Math.hypot(L.plant.x - home.x, L.plant.z - home.z)
        if (hopStart) {
          // 跳：兩隻腳一起離地，落在跳完之後身體底下（同樣的相對位置）
          L.from.copy(L.plant); L.to.copy(home); L.to.x += c.hopTo.x - c.hopFrom.x; L.to.z += c.hopTo.y - c.hopFrom.y; L.t = 0
        } else if (cfg.hop ? !moving && c.hopT >= 1 && other.t >= 1 && far > 0.06 * cfg.H
          : other.t >= 1 && (moving ? beat[li] || far > stride * 1.2 : far > 0.035 * cfg.H)) {
          L.from.copy(L.plant); L.to.copy(home).addScaledVector(fwd, moving ? stride * 0.5 : 0); L.t = 0
          if (moving) { c.thrust = 0; c.hb0 = c.hb }
        }
      }
      ik(L, L.pos)
    })
    // 鳩鴿類走路點頭：其實是頭前後移動，不是轉。每跨一步，頭很快往前推（thrust），
    // 之後身體往前走、頭停在空中原地不動（hold），所以相對身體慢慢往後退，下一步再推
    if (cfg.bob) {
      const A = cfg.bob, TH = cfg.thrustT ?? 0.13
      if (c.thrust < TH) { c.thrust += dt; const e = Math.min(1, c.thrust / TH); c.hb = lerp(c.hb0, A, e * e * e * (e * (e * 6 - 15) + 10)) }
      // 真的鳥頭在空中完全不動，但斑鳩腳短、每步只走 5 公分，從網頁的鏡頭距離看不出來，
      // 所以 bobGain 倍誇張：停頭時頭相對身體退得比身體走得快（在世界裡會微微往後飄）
      else c.hb = moving ? Math.max(-2 * A, c.hb - (cfg.bobGain ?? 1) * (w.v / k) * dt) : damp(c.hb, 0, 5, dt)
      const hd = r.bones.head
      // 頭推到前面時稍微低一點（影片裡脖子往前伸時頭會下沉）
      hd.position.add(FWD.clone().multiplyScalar(-c.hb).add(_d.set(0, -0.3 * Math.max(0, c.hb), 0)).applyQuaternion(modelQ(hd.parent, new THREE.Quaternion()).invert()))
    }
    if (cfg.worm) worm(n, kk, t)
    // 涉水的鷺鷥啄下去、嘴碰到水面時激起一圈大水波
    if (cfg.wade) {
      if (n !== 'strike') c.splash = false
      else if (!c.splash && kk > 0.3) {
        const tip = r.bones.head.localToWorld(_d.set(0, cfg.bill, 0))
        if (tip.y < env.waterY + 0.03) { ripple(tip.x, tip.z, 1.2); c.splash = true }
      }
    }
    focus.set(w.p.x, cfg.focusY ?? 0.6, w.p.y)
    // 保險：任何一個姿勢值或骨頭變成 NaN（一旦出現就會一直卡著，頂點亂飛＝破圖）就整個歸回原本的樣子
    if (Object.values(c).some((v) => typeof v === 'number' && !Number.isFinite(v))) Object.assign(c, C0)
    for (const b of Object.values(r.bones)) if (!Number.isFinite(b.quaternion.x + b.quaternion.w + b.position.x + b.position.y)) { b.quaternion.copy(b.userData.rest); b.position.copy(b.userData.restP) }
    if (!Number.isFinite(w.p.x + w.p.y + w.h)) { w.p.set(0, 0); w.h = 0; w.goal = null; w.want = null }
  }
  return { obj: root, focus, update, acts, walker: w, legs, get behavior() { return acts.name === 'show' ? 'display' : null } }
}
// 夜鷺（ChatGPT 參考圖 → Tripo，跟黑冠麻鷺一樣綁法：脖子三節、頭剛性、腳趾）：站著等、慢慢走、很快啄下去
function nightHeron(env) {
  // 站在池塘淺水裡（水深約 12 公分，離北岸石緣 1.4 公尺），只在池岸內側走動；啄的時候嘴伸進水裡
  return groundTripo(env, { name: 'night-heron-rig', H: 0.8, h0: 0.83, rotY: Math.PI / 2, lat: V(0, 0, -1), reach: 0.8, shadow: 0.3, wade: true, bill: 0.276,
    walk: { radius: 0.6, speed: 0.18, avoid: (x, z) => z < -0.4 }, swingT: 0.36, lift: 0, knee: [1.0, 1.7], focusY: 0.5,
    acts: { stand: [5, 3, 7], hunt: [3, 2.5, 5], walk: [1.2, 99, 99], turn: [1, 99, 99], strike: [0.7, 1.4, 1.4], look: [2, 1.5, 3] } })
}
// 黑冠麻鷺（ChatGPT 參考圖 → Tripo）：慢慢走、停下來盯地面（脖子左右晃）、啄進草裡拔蚯蚓吞下去
function malayanHeron(env) {
  return groundTripo(env, { name: 'heron-rig', H: 0.8, h0: 0.88, rotY: Math.PI / 2, lat: V(0, 0, -1), sway: true, shadow: 0.3, reach: 1, worm: true, bill: 0.225,
    walk: { radius: 1.6, speed: 0.2 }, step: 0.17, swingT: 0.38, lift: 0, knee: [1.2, 1.9], focusY: 0.5,
    acts: { walk: [3, 99, 99], stare: [3, 2.5, 5], worm: [1.4, 3.3, 3.9], look: [2, 1.5, 3], stand: [2, 2, 4], turn: [1, 99, 99] } })
}
// 珠頸斑鳩（ChatGPT 參考圖 → Tripo）：邊走邊點頭、啄地上的種子
// 斑鳩常一對一起在地上走
function spottedDove(env) {
  return groundGroup(2, 0.45, (avoid) => groundTripo(env, { name: 'dove-rig', H: 0.36, h0: 0.53, rotY: Math.PI / 2, lat: V(0, 0, -1), bob: 0.05, bobGain: 1.9, shadow: 0.18,
    walk: { radius: 1.2, speed: 0.15, avoid }, stride: 0.11, swingT: 0.16, lift: 0, knee: [0.6, 1.2], focusY: 0.3,
    acts: { walk: [4, 99, 99], peck: [3, 0.9, 1.3], look: [2, 1.2, 2.5], stand: [1.5, 1.5, 3], turn: [1, 99, 99] } }))
}

/* ---------- 停枝的鳥：Tripo 生成的模型 + 程式做的 IK 腳 ---------- */
// 模型由照片或 ChatGPT 畫的參考圖用 Tripo 轉成 3D，Blender 切掉原本的腳、綁骨架（body → neck → head、tail、兩翼）。
// 腳另外用兩節 IK + 四趾做，腳掌抓在枝上，跳的時候蹲低 → 蹬起 → 空中收腳 → 落地一壓一彈。
// cfg：name 模型、k 縮放、rotY 讓頭朝 +z、lat 模型的左右軸、feet 切口中心（腳長出來的地方）、
//      leg 腳的大小倍數、legC 腳的顏色、beat 鳴叫時點頭的頻率
function perchTripo(env, cfg) {
  const r = rigged(cfg.name)
  const k = cfg.k, LAT = cfg.lat.clone().normalize(), ls = cfg.leg ?? 1
  const LEG = { tib: 0.05 * ls, tar: 0.031 * ls }, LH = 0.05 * ls, HIPX = 0.022 * ls, HIP_IN = 0.025 * ls   // 髖關節埋進肚子裡
  const [fx, fy, fz] = cfg.feet
  const root = new THREE.Group(), lift = new THREE.Group(), inner = new THREE.Group()
  r.model.scale.setScalar(k); r.model.position.set(-fx * k, -fy * k + 0.006 * ls, -fz * k)
  inner.add(r.model); inner.rotation.y = cfg.rotY
  lift.add(inner); root.add(lift)
  const [ca, cb, ct] = cfg.legC ?? [0x4e5a45, 0x56614f, 0x4f5a4a]
  const legs = [1, -1].map((sx) => {
    const l = makeLeg({ a: LEG.tib, b: LEG.tar, ra: 0.0075 * ls, rb: 0.0042 * ls, ca, cb, bend: 1, x: sx * HIPX })
    birdFoot(l, 0.0042 * ls, 0.022 * ls, ct)
    root.add(l.hip)
    return l
  })
  const hp = new Hopper(env, { rest: [2, 7], dur: 0.32, ...cfg.hopper })
  const gl = new Glance([0.5, 1.6], 0.8, 0.3)
  const acts = new Acts({ idle: [4, 2, 5], call: [3, 2, 4], preen: [0.8, 1.5, 3] })
  const c = { yaw: 0, pitch: 0, call: 0 }, focus = V()
  const update = (t, dt) => {
    acts.tick(dt)
    if (acts.name !== 'idle') hp.wait = Math.max(hp.wait, 0.3)   // 做別的事時不跳
    hp.update(dt); gl.update(dt)
    const k01 = hp.hopping ? hp.k : 1
    const air = hp.hopping ? Math.sin(Math.PI * k01) : 0
    const push = hp.hopping ? Math.max(0, 1 - k01 / 0.25) : 0                      // 剛起跳那一下腿還是直的
    const land = hp.hopping ? 0 : Math.exp(-hp.landed * 7) * (1 + 0.4 * Math.sin(hp.landed * 22))
    const crouch = clamp(0.75 * hp.pre + 0.6 * land, 0, 1)
    c.yaw = damp(c.yaw, acts.name === 'preen' ? 1.2 * acts.sgn : gl.yaw, acts.name === 'preen' ? 6 : 18, dt)
    c.pitch = damp(c.pitch, acts.name === 'preen' ? 0.5 : gl.hp, 18, dt)
    c.call = damp(c.call, acts.name === 'call' ? 1 : 0, 6, dt)
    const beat = c.call * Math.max(0, Math.sin(t * (cfg.beat ?? 9)))
    r.reset()
    r.turn('body', LAT, 0.04 * beat)
    r.turn('neck', AX.y, c.yaw * 0.45); r.turn('neck', LAT, c.pitch * 0.4 + 0.12 * beat - 0.15 * crouch)
    r.turn('head', AX.y, c.yaw * 0.55); r.turn('head', LAT, c.pitch * 0.6 + 0.18 * beat + 0.15 * crouch)
    r.turn('tail', LAT, 0.45 * land - 0.3 * hp.pre + 0.2 * air)
    for (const [w, sg] of [['wingL', 1], ['wingR', -1]]) r.turn(w, AX.y, sg * (0.6 * air + 0.15 * push))
    // 身體：蹲下時壓低、往前傾；起跳時伸直；空中略抬頭
    const h = LH * (1 - 0.42 * crouch + 0.08 * push) - 0.02 * ls * air
    lift.position.set(0, h, 0.004 * ls * crouch)
    lift.rotation.x = 0.28 * crouch - 0.12 * push + 0.08 * air
    // 腳：在地上時腳掌抓在枝頂（root 座標 y=0）；空中往身體收
    const hipY = h + HIP_IN, hipZ = (-0.004 + 0.004 * crouch) * ls
    legs.forEach((l) => {
      const tuck = air * 0.75
      const fy2 = lerp(0.002, hipY - (LEG.tib + LEG.tar) * 0.45, tuck)
      const fz2 = lerp(0.006, -0.01, tuck) * ls
      legIK(l, hipY, hipZ, fy2, fz2, -0.1 * crouch)
      const curl = 0.55 + 0.6 * tuck - 0.2 * push
      l.toes.forEach((tt) => (tt.rotation.x = curl))
    })
    root.position.set(hp.s, env.branch.top(hp.s) + hp.y, env.branch.z?.(hp.s) ?? 0)
    root.rotation.y = hp.h
    focus.set(hp.s, 0.3, 0)
  }
  return { obj: root, focus, update, hopper: hp, acts }
}
/* ---------- 停枝的鳥：用模型自己的腳（骨頭 thigh → shin → foot） ---------- */
// 跳的節奏和 perchTripo 一樣，只是腳不另外做：蹲低時大腿往前、小腿往後折、身體跟著降低，空中把腳收起來。
// cfg：name、k、rotY、lat（繞它正轉 = 抬頭、腳往前）、foot 腳底在模型裡的高度、drop 蹲到底時身體降多少（模型單位）
// 兩隻腳最低的頂點（模型靜止姿勢下，腳骨附近、最低的 40 個），給 cfg.plant 量腳底離枝條多遠
function soleSamples(r) {
  let mesh = null
  r.model.traverse((o) => { if (o.isSkinnedMesh && !mesh) mesh = o })
  if (!mesh) return null
  r.model.updateMatrixWorld(true); mesh.skeleton.update()
  const v = V(), out = []
  for (const sd of ['L', 'R']) {
    const f = r.bones['foot' + sd]; if (!f) continue
    const fp = f.getWorldPosition(V()), cand = []
    const n = mesh.geometry.attributes.position.count
    for (let i = 0; i < n; i++) {
      mesh.getVertexPosition(i, v); mesh.localToWorld(v)
      if (Math.hypot(v.x - fp.x, v.z - fp.z) < 0.08 * r.model.scale.x && v.y < fp.y) cand.push([v.y, i])
    }
    // 腳掌和腳趾都要算（腳趾勾起來後尖端才是最低、最容易插進樹皮的地方）：取最低的 160 個裡每隔一個
    cand.sort((a, b) => a[0] - b[0])
    cand.slice(0, 160).forEach(([, i], j) => { if (j % 2 === 0) out.push(i) })
  }
  return out.length ? { mesh, idx: out } : null
}
function perchRigged(env, cfg) {
  const r = rigged(cfg.name)
  const k = cfg.k, LAT = cfg.lat, FWDAX = cfg.fwd ?? V(-1, 0, 0)   // 身體前後軸（模型座標，歪頭用）
  const root = new THREE.Group(), lift = new THREE.Group(), inner = new THREE.Group()
  r.model.scale.setScalar(k); r.model.position.y = -cfg.foot * k
  inner.add(r.model); inner.rotation.y = cfg.rotY
  lift.add(inner); root.add(lift)
  // 兩隻腳的中點要落在停棲點（樹枝中線）上：有的模型原點在身體中心（藍鵲尾巴很長，腳在原點前面 27 公分），
  // 停在枝上時腳整個懸在樹枝前面（2026-11-09 使用者：第 20 隻沒站在樹枝上）。量一次、把模型往回挪
  if (r.bones.footL && r.bones.footR) {
    root.updateMatrixWorld(true)
    const inv = new THREE.Matrix4().copy(root.matrixWorld).invert()
    const mid = r.bones.footL.getWorldPosition(V()).add(r.bones.footR.getWorldPosition(V())).multiplyScalar(0.5).applyMatrix4(inv)
    if (Math.hypot(mid.x, mid.z) > 0.015) { inner.position.x -= mid.x; inner.position.z -= mid.z }
  }
  // 飛行用的第二個模型（翅膀張開生成、另外綁翅膀骨架）：離開樹枝時換成它，回到枝上再換回來
  const fr = cfg.fly ? rigged(cfg.fly.name) : null
  if (fr) { fr.model.scale.setScalar(cfg.fly.k); fr.model.position.y = cfg.fly.y; fr.model.visible = false; inner.add(fr.model) }
  const hp = new Hopper(env, { rest: [2, 7], dur: 0.32, ...cfg.hopper })
  const toes = [toesOf(r, 'L'), toesOf(r, 'R')]
  const gl = new Glance([0.5, 1.6], 0.8, 0.3)
  const acts = new Acts(cfg.acts ?? (cfg.eat ? { idle: [3, 2, 4], call: [1.5, 2, 3], preen: [0.6, 1.5, 3], eat: [3.5, 2.2, 3.2] } : { idle: [4, 2, 5], call: [3, 2, 4], preen: [0.8, 1.5, 3] }))
  // cfg.plant：腳底貼枝。挑出兩隻腳最低的一些頂點（腳掌、腳趾），每格算它們離枝條表面多遠，
  // 把身體慢慢上下調到剛好踩在樹皮上（不同位置的枝條粗細、彎度、鳥的朝向都不一樣，寫死高度一定有的浮有的陷）
  const sole = cfg.plant ? soleSamples(r) : null, _sv = V()
  let plantY = 0
  const dv = { on: false, from: V(), to: V(), h: 0 }
  // 2026-11-10 翠鳥抓魚（ChatGPT 給的數字）：每次俯衝約 6 成抓到；抓到 → 叼魚（橫叼、5 公分）飛回枝頭 → 往側下方甩頭摔魚 3 下（每下 0.25 秒）
  // → 把魚轉成頭朝內、仰頭吞（約 1 秒）。抓到後 20–35 秒才再衝、沒抓到 6–12 秒；水裡有一群小魚，影子衝下來會散開
  const fk = cfg.dive ? { school: null, held: null, caught: false, target: null, cool: rnd(2, 5), prev: '', tips: new Map(), tag: null } : null
  // 嘴尖：每個模型量一次（靜止姿勢下，從身體骨頭往頭骨頭的方向最往前的頂點），之後每格取蒙皮後的位置
  const billTip = (rig, out) => {
    let e = fk.tips.get(rig)
    if (!e) {
      let skin = null; rig.model.traverse((o) => { if (o.isSkinnedMesh && (!skin || o.geometry.attributes.position.count > skin.geometry.attributes.position.count)) skin = o })
      rig.model.updateWorldMatrix(true, true)
      // 往前＝尾巴骨頭往頭骨頭的水平方向（身體→頭是往上，會找到頭頂）；只看身體骨頭以上的頂點
      const hb = rig.bones.head.getWorldPosition(V()), bb = (rig.bones.body ?? rig.bones.neck).getWorldPosition(V())
      const dir = hb.clone().sub((rig.bones.tail ?? rig.bones.body).getWorldPosition(V())).setY(0).normalize()
      let best = -Infinity, idx = 0
      const pp = skin.geometry.attributes.position, v = V()
      for (let i = 0; i < pp.count; i++) { skin.getVertexPosition(i, v).applyMatrix4(skin.matrixWorld); if (v.y < bb.y) continue; const d = v.sub(hb).dot(dir); if (d > best) { best = d; idx = i } }
      fk.tips.set(rig, (e = { skin, idx }))
    }
    return e.skin.getVertexPosition(e.idx, out).applyMatrix4(e.skin.matrixWorld)
  }
  const _ft = V(), _fh = V(), _fbill = V(), _fq = new THREE.Quaternion(), _fx = V(1, 0, 0)
  function fishUpdate(t, dt, kk) {
    const par = root.parent
    if (!par) return
    if (!fk.school) {
      fk.school = new FishSchool(par, V(hp.s + 1.1, 0, 0), { n: 9, R: 0.9, waterY: env.waterLocal })
      fk.held = new THREE.Mesh(fishGeo(), fishMat()); fk.held.visible = false; fk.held.castShadow = true; par.add(fk.held)
    }
    fk.school.setCenter(V(hp.s + 1.1, 0, 0))
    fk.school.update(t, dt)
    const n = acts.name
    if (n === 'dive') {
      if (!fk.target && kk > 0.05) { fk.target = fk.school.nearest(dv.to); fk.hit = Math.random() < 0.6 }
      if (kk > 0.28 && !fk.scared) { fk.scared = true; fk.school.scare(dv.to, 1.0, fk.hit ? fk.target : null) }
      if (fk.hit && fk.target && kk < 0.38) { fk.target.goal = dv.to.clone(); fk.target.flee = 0 }
      if (kk >= 0.38 && fk.hit && fk.target && !fk.caught) { fk.caught = true; fk.school.take(fk.target) }
    }
    const show = fk.caught && (n === 'dive' ? kk >= 0.4 : n === 'beat' || n === 'gulp')
    fk.held.visible = show
    if (!show) return
    // 魚夾在嘴尖往裡 1 公分；剛抓到是橫的（跟嘴垂直），吞之前轉成順著嘴、頭朝喉嚨
    const rig = fr && fr.model.visible ? fr : r
    rig.model.updateWorldMatrix(true, true)
    const tip = billTip(rig, _ft), head = rig.bones.head.getWorldPosition(_fh)
    const bill = _fbill.subVectors(tip, head).normalize()
    const g = n === 'gulp' ? acts.k : 0
    const turn = ss(g, 0.1, 0.3), swallow = ss(g, 0.35, 0.85)
    const side = V().crossVectors(bill, V(0, 1, 0)).normalize()
    const axis = side.clone().lerp(bill.clone().negate(), turn).normalize()
    const pos = tip.clone().addScaledVector(bill, -0.012 - swallow * 0.04)
    pos.addScaledVector(axis, -0.5 * 0.065 * turn)
    fk.held.position.copy(par.worldToLocal(pos))
    const wl = par.getWorldQuaternion(new THREE.Quaternion()).invert()
    _fq.setFromUnitVectors(_fx, axis).premultiply(wl)
    // 剛抓到的魚還在扭，慢慢沒力
    const wig = (n === 'dive' ? 0.5 : n === 'beat' ? 0.25 * (1 - acts.k) : 0) * Math.sin(t * 30)
    fk.held.quaternion.copy(_fq).multiply(new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), wig))
    fk.held.scale.setScalar(0.065 * (1 - 0.85 * swallow))
  }
  const c = { yaw: 0, pitch: 0, call: 0 }, focus = V()
  // cfg.rich：長尾巴的鳥（台灣藍鵲）多一層細節：呼吸、重心左右換、歪頭、
  // 長尾巴慢慢擺、落地時尾巴往上翹再晃回來、叫的時候尾巴一下一下上揚、偶爾抖一下翅膀
  const rc = { roll: 0, tailY: 0, tailP: 0, tailV: 0, flick: 0, flickT: rnd(3, 8), wasHop: false }
  function rich(t, dt, crouch, land, air, beat) {
    // 呼吸：身體一起一伏
    const breath = Math.sin(t * 2.2 + cfg.k * 7)
    r.turn('body', LAT, 0.025 * breath)
    // 重心慢慢左右換
    lift.rotation.z = 0.035 * Math.sin(t * 0.45 + cfg.k * 3)
    // 歪頭看東西（Glance 的 roll）
    rc.roll = damp(rc.roll, gl.roll, 8, dt)
    r.turn('head', FWDAX, rc.roll * 0.6)
    // 尾巴：彈簧。落地、叫、起跳時給它一下，平常隨風慢慢左右擺
    const hopNow = hp.hopping
    if (rc.wasHop && !hopNow) rc.tailV += 3.5          // 落地：尾巴往上甩
    rc.wasHop = hopNow
    const want = 0.35 * beat - 0.25 * air
    rc.tailV += ((want - rc.tailP) * 60 - rc.tailV * 7) * dt
    rc.tailP += rc.tailV * dt
    rc.tailY = 0.12 * Math.sin(t * 0.7 + cfg.k) + 0.05 * Math.sin(t * 1.9)
    r.turn('tail', LAT, -rc.tailP * 0.9)
    r.turn('tail', AX.y, rc.tailY)
    // 偶爾抖一下翅膀
    if ((rc.flickT -= dt) <= 0) { rc.flick = 1; rc.flickT = rnd(4, 10) }
    rc.flick = Math.max(0, rc.flick - dt * 3)
    const fl = rc.flick > 0 ? Math.sin(rc.flick * Math.PI * 3) * rc.flick : 0
    for (const [w, sg] of [['wingL', 1], ['wingR', -1]]) r.turn(w, AX.y, sg * 0.25 * Math.abs(fl) + sg * 0.12 * beat)
  }
  // 2026-11-10 貓頭鷹的跳（使用者：跳的時候腳跟身體太僵硬 → 照 ChatGPT 看影片給的修法）：
  // 腳主導起跳（先蹲 0.11 秒、最後 0.05 秒快速蹬直）、兩腳錯開（前腳先抬先伸、後腳晚 25 ms 蹬離、晚 45 ms 落地）、
  // 收腳只收一點點；身體壓扁／拉長一點；落地是腳先著地、身體再往下沉一次再回來（不再彈跳抖動）；
  // 頭穩住、慢半拍反向補身體的前傾、落地後輕點一下頭；翅膀幾乎不開；尾巴慢 50 ms；腳趾分開放開、再抓緊
  const owlS = { bp: 0, lead: 1, ox: 0 }, _fa = V(), _fb = V()
  const owlPose = (t, dt) => {
    const pre = hp.pre, hop = hp.hopping, k01 = hop ? hp.k : 1, L = hp.landed
    const crA = pre < 0.69 ? ss(pre, 0, 0.69) : 1 - 0.85 * ss(pre, 0.69, 1)      // 蹲下 → 最後一下蹬直
    const ext = hop ? 1 - ss(k01, 0, 0.18) : ss(pre, 0.69, 1)                   // 蹬直（起跳那一刻最大）
    const air = hop ? Math.sin(Math.PI * k01) : 0
    const lc = (x) => x < 0 ? 0 : x < 0.07 ? ss(x, 0, 0.07) : 1 - ss(x, 0.07, 0.23)   // 落地：往下沉一次再回來
    const landC = hop ? 0 : lc(L), landD = hop ? 0 : lc(L - 0.05)
    const nod = hop ? 0 : ss(L, 0.05, 0.1) * (1 - ss(L, 0.12, 0.26))
    // 哪一隻腳是前腳（朝跳的方向那一側）
    if (hop && k01 < 0.05) {
      r.bones.footL.getWorldPosition(_fa); r.bones.footR.getWorldPosition(_fb)
      const pa = root.parent.worldToLocal(_fa), pb = root.parent.worldToLocal(_fb)
      owlS.lead = Math.sign((pa.x - pb.x) * (hp.s1 - hp.s0)) || 1
    }
    // 第二輪：落地分兩拍——前腳先著地，後腳晚 45 ms；身體前傾限制在 ±0.11（空中）／±0.06（落地後），頭反向補 75%
    const legT = (s) => { const lead = (s === 'L') === (owlS.lead > 0); return hop ? (lead ? ss(k01, 0.04, 0.28) * (1 - ss(k01, 0.62, 0.95)) : ss(k01, 0.12, 0.36) * (1 - ss(k01, 0.8, 1) * 0.7)) : lead ? 0 : 0.3 * (1 - ss(L, 0, 0.045)) }
    const bodyP = clamp(-0.1 * crA + 0.06 * ext - 0.04 * air - 0.06 * landC, -0.11, 0.11)
    owlS.ox = hop || hp.s1 == null ? 0 : 0.007 * (Math.sign(hp.s1 - hp.s0) || 0) * (L < 0.15 ? Math.sin(Math.PI * L / 0.15) : 0)   // 落地往前多滑一點點再回來
    owlS.bp = damp(owlS.bp, bodyP, 28, dt)   // 頭慢半拍（約 35 ms）跟著補
    r.reset()
    r.turn('body', LAT, bodyP + 0.03 * (c.call > 0 ? Math.max(0, Math.sin(t * (cfg.beat ?? 9))) * c.call : 0))
    r.turn('neck', AX.y, c.yaw * 0.45); r.turn('neck', LAT, c.pitch * 0.4 + 0.06 * crA - 0.35 * owlS.bp)
    r.turn('head', AX.y, c.yaw * 0.55); r.turn('head', LAT, c.pitch * 0.6 - 0.4 * owlS.bp + 0.03 * nod)
    r.turn('tail', LAT, 0.12 * ext + 0.06 * crA - 0.1 * air - 0.2 * landD)
    for (const [w, sg] of [['wingL', 1], ['wingR', -1]]) r.turn(w, AX.y, sg * (0.16 * air + 0.05 * ext))
    for (const s of ['L', 'R']) {
      const lt = legT(s), bend = crA + 0.75 * landC
      r.turn('thigh' + s, LAT, 0.35 * bend - 0.08 * ext + 0.35 * lt)
      r.turn('shin' + s, LAT, -0.55 * bend + 0.12 * ext - 0.6 * lt)
      r.turn('foot' + s, LAT, 0.3 * bend - 0.05 * ext + 0.4 * lt)
    }
    // 腳趾：蹲的時候抓緊、起跳前 30 ms 放開；空中放鬆；落地後 75 ms 內抓回去
    const rel = ss(pre, 0.8, 1)
    const g = hop ? lerp(0.35, 0.05, ss(k01, 0, 0.1)) - 0.05 * ss(k01, 0.8, 1) : pre > 0 ? 0.38 - 0.33 * rel : 0.05 + 0.33 * ss(L, 0, 0.075)
    toes.forEach((tt) => curlToes(r, tt, g))
    // 身體壓扁／拉長（蹲 0.96、蹬直 1.025、落地 50 ms 0.97），整隻往下沉
    const sq = 1 - 0.04 * crA + 0.025 * ext - 0.03 * (hop ? 0 : 1 - ss(L, 0, 0.05)) * (L < 1 ? 1 : 0)
    inner.scale.set(1 / Math.sqrt(sq), sq, 1 / Math.sqrt(sq))
    lift.position.y = -0.022 * crA - 0.016 * landC
  }
  // 2026-11-10 啄木鳥攀在樹幹上（使用者：腳在樹幹上是錯的 → ChatGPT 給的攀爬姿勢）：三點支撐——兩腳在髖部下前方抓樹皮、
  // 跗蹠往樹幹斜 30～50°、腳趾彎起來抓、硬尾羽頂在腳下面 10～15 公分的樹皮上；身體上半往後仰 ~12°、肚子離樹皮幾公分。
  // 實測（側面剪影＋樹皮平面）：身體後仰 0.4、大腿 -0.6、小腿 0.9（腳往前伸到肚子下的樹皮）、尾巴 1.0——大腿、小腿、尾巴的正負跟 ChatGPT 給的相反
  // 擺完姿勢再量兩隻腳離樹皮多遠，整隻往樹幹推到腳剛好貼住（樹皮平面＝擺放點、法線＝obj 的 +z）
  const cl = { push: null }, _cn = V(), _co = V(), _cf = V()
  if (cfg.cling && typeof window !== 'undefined' && new URLSearchParams(location.search).has('rec')) window.__cling = cfg.cling   // 除錯：rec 模式可以即時調姿勢
  const clingPose = (t, dt) => {
    const k = cfg.cling, pk = acts.name === 'eat' ? Math.max(0, Math.sin(acts.k * 26)) * (acts.k < 0.8 ? 1 : 0) : 0   // 啄樹皮：上半身往前敲
    r.turn('body', LAT, (k.body ?? 0.4) - 0.25 * pk)
    r.turn('chest', LAT, -0.15 * pk)
    for (const sd of ['L', 'R']) {
      const st = sd === 'L' ? 1 : -1
      r.turn('thigh' + sd, LAT, (k.thigh ?? -0.6) + 0.04 * st)
      r.turn('shin' + sd, LAT, (k.shin ?? 0.9) - 0.05 * st)
      r.turn('foot' + sd, LAT, k.foot ?? 0.35)
    }
    toes.forEach((tt) => curlToes(r, tt, k.toes ?? 0.75))
    r.turn('tail', LAT, k.tail ?? 1.0)   // 尾巴尖頂在腳下面的樹皮上
    // 腳貼樹皮
    const g = root.parent.parent   // 擺放點（樹皮表面）
    root.parent.updateWorldMatrix(true, false); root.updateMatrixWorld(true)
    _cn.set(0, 0, 1).transformDirection(root.parent.matrixWorld); g.getWorldPosition(_co)
    let d = 1e9
    for (const sd of ['L', 'R']) d = Math.min(d, r.bones['foot' + sd].getWorldPosition(_cf).sub(_co).dot(_cn))
    const want = cl.push == null ? d - 0.012 : cl.push + (d - 0.012) * Math.min(1, dt * 10)
    cl.push = want
    lift.position.copy(root.worldToLocal(_cf.copy(root.getWorldPosition(V())).addScaledVector(_cn, -want)))
  }
  const update = (t, dt) => {
    acts.tick(dt)
    if (fk) {
      // 動作接續：俯衝抓到 → 摔魚 → 吞；俯衝的冷卻時間
      const pn = fk.prev
      fk.cool -= dt
      if (pn === 'dive' && acts.name !== 'dive') { if (fk.caught) acts.next('beat'); else fk.cool = rnd(6, 12); fk.target = null; fk.scared = false }
      else if (pn === 'beat' && acts.name !== 'beat') acts.next('gulp')
      else if (pn === 'gulp' && acts.name !== 'gulp') { fk.caught = false; fk.cool = rnd(20, 35) }
      if (acts.name === 'dive' && acts.t < 0.05 && fk.cool > 0) acts.next('idle')
      fk.prev = acts.name
      fk.tag = acts.name === 'dive' ? (fk.caught ? 'catch' : 'dive') : acts.name === 'beat' ? 'beat' : acts.name === 'gulp' ? 'gulp' : null
    }
    if (acts.name !== 'idle') hp.wait = Math.max(hp.wait, 0.3)
    hp.update(dt); gl.update(dt)
    const k01 = hp.hopping ? hp.k : 1
    const air = hp.hopping ? Math.sin(Math.PI * k01) : 0
    const push = hp.hopping ? Math.max(0, 1 - k01 / 0.25) : 0
    const land = hp.hopping ? 0 : Math.exp(-hp.landed * 7) * (1 + 0.4 * Math.sin(hp.landed * 22))
    let crouch = clamp(0.75 * hp.pre + 0.6 * land, 0, 1)
    // 翠鳥抓魚：盯著水面 → 頭朝下俯衝進水裡（濺起水波）→ 拍翅飛回原本的枝頭 → 落地一壓
    let dive = null
    if (cfg.dive && acts.name === 'dive') {
      const kk = acts.k
      if (!dv.on) {
        dv.on = true; dv.splash = false; dv.h = hp.h
        dv.from.set(hp.s, env.branch.top(hp.s), 0)
        const tc = env.toCam
        // 往枝條外面（+x，遠離樹幹）斜斜飛下去、稍微朝鏡頭：樹幹那側在寬螢幕上被卡片蓋住
        dv.to.set(hp.s + 1.1 + tc.x * 0.4, env.waterLocal - 0.04, tc.z * 0.4)
      }
      const fall = ss(kk, 0.14, 0.38), back = ss(kk, 0.5, 0.88)
      const u = back > 0 ? 1 - back : Math.pow(fall, 1.7)                    // 掉下去越來越快
      const p = V().lerpVectors(dv.from, dv.to, u)
      p.y += (back > 0 ? 0.5 : 0.15) * Math.sin(Math.PI * u)                 // 回程往上拉一個弧
      const head = back > 0 ? Math.atan2(dv.from.x - dv.to.x, dv.from.z - dv.to.z) : Math.atan2(dv.to.x - dv.from.x, dv.to.z - dv.from.z)
      const pitch = kk < 0.14 ? 0.35 * ss(kk, 0, 0.12) : back > 0 ? -0.25 * (1 - ss(kk, 0.82, 0.92)) : lerp(0.35, 1.35, ss(kk, 0.14, 0.3))
      if (!dv.splash && kk >= 0.38) {
        dv.splash = true
        const w = root.parent.localToWorld(dv.to.clone())
        ripple(w.x, w.z, 1.0)
      }
      const fly = (kk > 0.14 && kk < 0.38) || (kk > 0.46 && kk < 0.9)
      dive = { p, head: kk < 0.14 ? hp.h : head, pitch, flap: kk > 0.46 && kk < 0.9 ? 1 : 0, tuck: fly || (kk >= 0.38 && kk <= 0.46) ? 1 : 0,
        crouch: kk < 0.14 ? ss(kk, 0, 0.12) * 0.8 : kk > 0.9 ? Math.exp(-(kk - 0.9) * 40) : 0 }
      crouch = Math.max(crouch, dive.crouch)
      if (fr) {
        // 翅膀：起飛時拍、俯衝時往後收成流線型（照影片：入水前翅膀往後貼）、出水後用力拍翅飛回去
        const flying = kk > 0.12 && kk < 0.9
        r.model.visible = !flying; fr.model.visible = flying
        fr.reset()
        const sweep = 1.25 * ss(kk, 0.2, 0.34) * (1 - ss(kk, 0.44, 0.52))
        const beat = (kk < 0.22 ? 0.75 : kk > 0.46 ? 0.85 : 0) * (1 - ss(kk, 0.84, 0.9)) * (kk < 0.22 ? ss(kk, 0.12, 0.16) : 1)
        const a = beat * Math.sin(t * 42), a2 = beat * Math.sin(t * 42 - 0.9)
        for (const [n, sg] of [['L', 1], ['R', -1]]) {
          fr.turn('wing' + n, AX.y, sg * sweep); fr.turn('wingtip' + n, AX.y, sg * sweep * 0.6)
          fr.turn('wing' + n, AX.x, -sg * a); fr.turn('wingtip' + n, AX.x, -sg * a2 * 0.6)
        }
        fr.turn('head', LAT, 0.1 * sweep)
      }
    } else { dv.on = false; if (fr) { r.model.visible = true; fr.model.visible = false } }
    // 摔魚：快速往側下方甩（約 0.08 秒打下去、再收回），3 下；身體跟著轉一點點、往下壓
    let bw = 0
    if (acts.name === 'beat') {
      const u = Math.min(acts.k / 0.85, 0.999) * 3, ph = u % 1
      bw = ph < 0.32 ? ss(ph, 0, 0.32) : 1 - ss(ph, 0.32, 1)
    }
    // 吞：停一下、仰頭（往上往後）再收回來
    const gl2 = acts.name === 'gulp' ? acts.k : -1
    const gulpUp = gl2 >= 0 ? Math.sin(Math.PI * ss(gl2, 0.25, 0.9)) : 0
    if (fk) fishUpdate(t, dt, acts.k)
    c.yaw = damp(c.yaw, acts.name === 'preen' ? 1.2 * acts.sgn : dive ? 0 : acts.name === 'beat' ? -0.85 * bw * acts.sgn : gl2 >= 0 ? 0 : gl.yaw, acts.name === 'preen' ? 6 : acts.name === 'beat' ? 45 : 18, dt)
    // 吃果實（cfg.eat）：低頭往枝上的榕果啄，一下一下，最後仰頭吞下去
    const eat = acts.name === 'eat' ? acts.k : -1, peck = eat >= 0 && eat < 0.8 ? 0.9 + 0.5 * Math.max(0, Math.sin(eat * 26)) : 0, gulp = eat >= 0.8 ? -0.6 * Math.sin((eat - 0.8) / 0.2 * Math.PI) : 0
    c.eat = damp(c.eat ?? 0, eat >= 0 && eat < 0.85 ? 1 : 0, 8, dt)   // 吃的時候身體往前傾
    c.pitch = damp(c.pitch, acts.name === 'preen' ? -0.5 : dive ? 0 : eat >= 0 ? -(peck + gulp) * (cfg.eatSign ?? 1) : acts.name === 'beat' ? -0.45 * bw : gl2 >= 0 ? 0.75 * gulpUp : -gl.hp, eat >= 0 || acts.name === 'beat' ? 40 : 18, dt)
    c.call = damp(c.call, acts.name === 'call' ? 1 : 0, 6, dt)
    const beat = c.call * Math.max(0, Math.sin(t * (cfg.beat ?? 9)))
    r.reset()
    // 身體蹲低時前傾、起跳時伸直；頭保持水平
    r.turn('body', LAT, -0.3 * crouch + 0.1 * push - 0.06 * air + 0.03 * beat - 0.35 * (c.eat ?? 0) * (cfg.eatSign ?? 1) - 0.12 * bw)
    if (bw) r.turn('body', AX.y, -0.1 * bw * acts.sgn)
    r.turn('neck', AX.y, c.yaw * 0.45); r.turn('neck', LAT, c.pitch * 0.4 - 0.12 * beat + 0.15 * crouch)
    r.turn('head', AX.y, c.yaw * 0.55 + (cfg.headYaw ?? 0)); r.turn('head', LAT, c.pitch * 0.6 - 0.18 * beat + 0.15 * crouch)   // cfg.headYaw：模型生成時頭就轉了（大冠鷲 90°），先轉回正前方
    r.turn('tail', LAT, -0.45 * land + 0.3 * hp.pre - 0.2 * air)
    const flap = dive?.flap ? Math.sin(t * 38) : 0
    for (const [w, sg] of [['wingL', 1], ['wingR', -1]]) {
      r.turn(w, AX.y, sg * (0.6 * air + 0.15 * push + (dive?.flap ? 0.9 : 0)))
      if (flap) r.turn(w, AX.x, sg * 0.8 * flap)
    }
    // 腳：蹲 → 大腿往前、小腿往後折、腳掌壓平；空中 → 整隻腳收到肚子下面
    const bend = 0.9 * crouch, tuck = 0.8 * Math.max(air, dive?.tuck ?? 0)
    for (const s of ['L', 'R']) {
      r.turn('thigh' + s, LAT, 0.3 * crouch + bend * 0.6 + tuck * 0.8)
      r.turn('shin' + s, LAT, -bend * 1.2 - tuck * 1.6)
      r.turn('foot' + s, LAT, bend * 0.6 + tuck * 1.2)
    }
    // 腳趾：平常勾住樹枝，蹬出去時放開、空中半收，落地再抓緊
    const g0 = cfg.grip ?? 0.55
    const grip = g0 - (g0 + 0.1) * push - 0.3 * air + 0.25 * land
    toes.forEach((t) => curlToes(r, t, grip))
    lift.position.y = -cfg.drop * k * crouch
    if (cfg.owlHop && !dive) owlPose(t, dt)
    if (cfg.cling && !dive) clingPose(t, dt)
    root.position.set(hp.s + (cfg.owlHop ? owlS.ox : 0), env.branch.top(hp.s) + hp.y, env.branch.z?.(hp.s) ?? 0)
    root.rotation.y = hp.h
    lift.rotation.x = 0; lift.rotation.z = 0
    if (cfg.rich && !dive) rich(t, dt, crouch, land, air, beat)
    if (sole && !dive && env.branch.gap) {
      // 跳的時候不貼（在空中），落地後馬上貼回去
      root.updateMatrixWorld(true); sole.mesh.skeleton.update()
      // 只看踩在枝條上半部的腳掌、腳趾（離正上方 0.6 個半徑內）：勾過枝條前後緣的趾尖本來就該包住樹皮往下，
      // 拿它們來算會把整隻鳥頂高（2026-11-09 藍鵲腳趾改張開後整隻浮在枝上 5 公分）
      let g = Infinity, g2 = Infinity
      for (const i of sole.idx) {
        sole.mesh.getVertexPosition(i, _sv); sole.mesh.localToWorld(_sv); root.parent.worldToLocal(_sv)
        const gg = env.branch.gap(_sv.x, _sv.y, _sv.z)
        if (!env.branch.side || env.branch.side(_sv.x, _sv.z) < 0.6) g = Math.min(g, gg); else g2 = Math.min(g2, gg)
      }
      if (g === Infinity) g = g2
      // g 是「還沒加 plantY 之前」量的，所以 plantY 要直接追 -g（以前寫成每格累加 -g，只要有一點點陷進去就一路加到上限 5 公分，整隻浮起來）
      if (!hp.hopping) plantY += (clamp(-(g + 0.003), -0.08, 0.05) - plantY) * Math.min(1, dt * 12)
      lift.position.y += plantY
    }
    if (dive) { root.position.copy(dive.p); root.rotation.y = dive.head; lift.rotation.x = dive.pitch }
    focus.set(hp.s, 0.3, 0)
  }
  return { obj: root, focus, update, hopper: hp, acts, get behavior() { return fk?.tag ?? null }, fishing: fk }
}
// 五色鳥：ChatGPT 參考圖 → Tripo，正側面頭朝 -x；腳是模型自己生成的，綁了 thigh → shin → foot
function barbet(env) { return perchRigged(env, { name: 'barbet-rig', k: 0.6, rotY: Math.PI / 2, lat: V(0, 0, -1), foot: 0.01, drop: 0.05, beat: 9 }) }
// 白頭翁：ChatGPT 參考圖 → Tripo，正側面頭朝 -x
// 綠繡眼常常幾隻一起：三隻在同一根枝上跳，彼此不擠在一起
// 同一根枝上好幾隻：各跳各的，但不會跳到別隻身上（gap 公尺內有鳥就不跳），一開始在鏡頭正對的那段枝上分開站
function perchGroup(n, gap, start, mk) {
  const birds = []
  const blocked = (s1, me) => birds.some((b) => b.hopper !== me && Math.abs(b.hopper.s - s1) < gap)
  for (let i = 0; i < n; i++) birds.push(mk(blocked))
  birds.forEach((b, i) => { const br = b.hopper.env.branch; b.hopper.s = clamp(start + i * gap * 1.4, br.min + 0.1, br.max) })   // 第二隻不能排到枝條末端外面
  return group(birds, () => V(birds.reduce((a, b) => a + b.hopper.s, 0) / n, 0.3, 0), n >= 3)
}
// 地上兩隻：各走各的，選目的地和走的路線都會避開另一隻
function groundGroup(n, gap, mk) {
  const birds = []
  let HA = gap * 0.5, HB = gap * 0.35, measured = false   // 身體橢圓的半長、半寬（下面第一次更新時從模型量）
  const near = (x, z, me) => birds.some((b) => {
    const w = b.walker, G = Math.max(gap, 2 * HA)   // 挑目的地：至少隔一個身長，走到了才不會頭尾相疊
    if (w.p === me) return false
    return Math.hypot(x - w.p.x, z - w.p.y) < G || (w.goal && Math.hypot(x - w.goal.x, z - w.goal.y) < G)
  })
  const avoid = (x, z, p) => { for (let k = 1; k <= 8; k++) if (near(lerp(p.x, x, k / 8), lerp(p.y, z, k / 8), p)) return true; return false }
  for (let i = 0; i < n; i++) birds.push(mk(avoid))
  birds.forEach((b, i) => b.walker.p.set((i - (n - 1) / 2) * gap * 1.5, (i % 2) * 0.2))
  const g = group(birds, () => birds.reduce((a, b) => a.add(b.focus), V()).divideScalar(n), true)
  // 走路途中也不能穿過彼此（2026-11-08 使用者回報斑鳩、麻雀互相穿透）：只在挑目的地時避開不夠——兩隻同時走、轉彎會畫弧線。
  // 身體當成沿著頭的方向的橢圓（斑鳩頭到尾 0.74 公尺、寬 0.24）：兩隻中心連線方向上，各自的橢圓半徑加起來就是最近能靠多近。
  // 每格先把靠太近的兩隻往兩邊推開；正在往對方走的那隻放棄目的地，等下一個動作再挑。尺寸第一次更新時從模型量
  const rad = (h, ux, uz) => { const c = Math.sin(h) * ux + Math.cos(h) * uz, s = Math.cos(h) * ux - Math.sin(h) * uz; return 1 / Math.hypot(c / HA, s / HB) }
  const upd = g.update
  g.update = (t, dt) => {
    if (!measured && birds[0].obj.parent) {
      measured = true
      const o = birds[0].obj; o.updateWorldMatrix(true, true)
      const inv = new THREE.Matrix4().copy(o.matrixWorld).invert(), bx = new THREE.Box3()
      o.traverse((m) => { if (m.isSkinnedMesh) bx.union(new THREE.Box3().setFromObject(m, true).applyMatrix4(inv)) })
      if (!bx.isEmpty()) { const s = bx.getSize(V()); HA = s.z * 0.45; HB = Math.min(s.x, s.z) * 0.45 }   // 尾巴末端很細：長度打九折
    }
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      const a = birds[i].walker, b = birds[j].walker
      const dx = b.p.x - a.p.x, dz = b.p.y - a.p.y, d = Math.hypot(dx, dz)
      if (d > 2 * HA) continue
      const ux = d > 1e-4 ? dx / d : 1, uz = d > 1e-4 ? dz / d : 0
      const minD = rad(a.h, ux, uz) + rad(b.h, ux, uz)
      if (d >= minD) continue
      const push = (minD - d) / 2
      a.p.x -= ux * push; a.p.y -= uz * push; b.p.x += ux * push; b.p.y += uz * push
      for (const [w, s] of [[a, 1], [b, -1]]) if (w.goal && (Math.sin(w.h) * ux + Math.cos(w.h) * uz) * s > 0.3) w.goal = null
    }
    upd(t, dt)
  }
  return g
}
// lead：手機畫面窄、整群放不下時，鏡頭只跟著第一隻（地上走的一群、三隻以上停在枝上的）
function group(birds, center, lead) {
  const g = new THREE.Group(), focus = V()
  birds.forEach((b) => g.add(b.obj))
  const update = (t, dt) => { birds.forEach((b) => b.update(t, dt)); focus.copy(center()) }
  return { obj: g, focus, lead: lead ? birds[0].focus : null, update, birds, acts: birds[0].acts }
}
// 綠繡眼常常幾隻一起：三隻在同一根枝上跳
function whiteeye(env) {
  return perchGroup(3, 0.28, -1.1, (blocked) => perchTripo(env, { name: 'whiteeye-rig', k: 0.42, rotY: Math.PI / 2, lat: V(0, 0, 1), feet: [-0.055, 0.17, 0], leg: 0.84, legC: [0x5d6266, 0x676c70, 0x5d6266], beat: 11,
    hopper: { rest: [0.8, 3], blocked } }))
}
// 樹鵲、白頭翁常成對出現：兩隻在同一根枝上
function treepie(env) {
  return perchGroup(2, 0.55, -1.2, (blocked) => perchTripo(env, { name: 'treepie-rig', k: 0.82, rotY: Math.PI / 2, lat: V(0, 0, 1), feet: [-0.19, 0.16, 0], leg: 1.15, legC: [0x1c1c1c, 0x222222, 0x1c1c1c], beat: 6,
    hopper: { blocked } }))
}
function bulbul(env) {
  return perchGroup(2, 0.32, -0.9, (blocked) => perchTripo(env, { name: 'bulbul-rig', k: 0.42, rotY: Math.PI / 2, lat: V(0, 0, 1), feet: [-0.07, 0.165, 0], leg: 0.86, legC: [0x2c2a26, 0x33302c, 0x2c2a27], beat: 7,
    hopper: { blocked } }))
}

/* ---------- 2026-11 新增的 9 種（ChatGPT 參考圖 → Tripo → tools/rig-distance.py，點位在 tools/bird-points.json） ---------- */
const LAPWING_H0 = 0.83   // 小辮鴴模型頭頂高（不含冠羽，冠羽到 0.98）
const TRIPO = { rotY: Math.PI / 2, lat: V(0, 0, -1) }   // Tripo 模型都是頭朝 -x
// 只在枝條外段跳：靠樹幹那段在寬螢幕上會被左邊的卡片蓋住
const outer = (env, min) => env.branch?.lock ? env : ({ ...env, branch: { ...env.branch, min } })   // lock：真的樹枝量好的長度，不能再往外延
// 翠鳥：停在水池上方的枝頭，偶爾一頭栽進水裡抓魚、再飛回同一根枝
function kingfisher(env) {
  // 飛行模型（第二版：附站姿參考圖生成，頭部花紋一致）用「頭和嘴的大小」對齊停棲模型（tools/compare-scale.py 並排比過）；
  // 身體中心 y≈0.1 對到停棲模型身體中心（腳上 0.13 公尺）
  return perchRigged(outer(env, -0.2), { name: 'kingfisher-rig', k: 0.38, ...TRIPO, foot: 0.004, drop: 0.04, beat: 8, dive: true,
    fly: { name: 'kingfisher-fly-rig', k: 0.82, y: 0.13 - 0.1 * 0.82 },
    hopper: { hop: [0.1, 0.25], rest: [3, 8] }, acts: { idle: [4, 2, 5], call: [1.5, 1.5, 3], preen: [0.8, 1.5, 3], dive: [3.5, 2.6, 2.6], beat: [0, 1.2, 1.5], gulp: [0, 1.1, 1.4] } })
}
// 小白鷺：在淺水裡慢慢走、盯著水面、很快啄下去
function egret(env) {
  return groundTripo(env, { name: 'egret-rig', H: 1.05, h0: 0.98, ...TRIPO, reach: 0.8, wade: true, bill: 0.275,
    walk: { radius: 0.9, speed: 0.15 }, swingT: 0.48, lift: 0, knee: [1.0, 1.7], focusY: 0.6,
    acts: { stand: [3, 3, 6], hunt: [3, 2.5, 5], walk: [2, 99, 99], turn: [1, 99, 99], strike: [1, 1.4, 1.4], look: [1.5, 1.5, 3] } })
}
// 紅冠水雞：浮在水面上游，一邊游一邊點頭、翹尾巴，啄水面上的東西（腳在水裡划，每划一下一圈水紋）
function moorhen(env) {
  return groundTripo(env, { name: 'moorhen-rig', H: 0.5, h0: 0.764, ...TRIPO, swim: true, bill: 0.165, bob: 0.03, flick: 0.5,
    walk: { radius: 0.9, speed: 0.12, avoid: env.swimOK }, stride: 0.1, swingT: 0.35, lift: 0, knee: [0.6, 1.2], focusY: 0.3,
    acts: { walk: [4, 99, 99], peck: [2, 0.9, 1.3], look: [2, 1.2, 2.5], stand: [1, 1.5, 3], turn: [1, 99, 99] } })
}
// 白腹秧雞：浮在水面上慢慢游，尾巴一直往上翹
function waterhen(env) {
  return groundTripo(env, { name: 'waterhen-rig', H: 0.5, h0: 0.77, ...TRIPO, swim: true, bill: 0.2, bob: 0.025, flick: 0.45, flickF: 3.1,
    walk: { radius: 1.2, speed: 0.12, avoid: env.swimOK }, stride: 0.11, swingT: 0.28, lift: 0, knee: [0.8, 1.4], focusY: 0.3,
    acts: { walk: [4, 99, 99], peck: [3, 0.9, 1.3], look: [2, 1.2, 2.5], stand: [1, 1.5, 3], turn: [1, 99, 99] } })
}
// 麻雀：三隻在地上，兩腳併攏一跳一跳地找草籽
function sparrow(env) {
  return groundGroup(3, 0.22, (avoid) => groundTripo(env, { name: 'sparrow-rig', H: 0.2, h0: 0.65, ...TRIPO, hop: 0.035, flick: 0.15,
    walk: { radius: 0.9, speed: 0.22, turn: 3, avoid }, stride: 0.07, swingT: 0.12, lift: 0.035, knee: [0.3, 0.6], focusY: 0.12,
    acts: { walk: [4, 99, 99], peck: [4, 0.6, 1.0], look: [2, 0.8, 1.8], stand: [1, 1, 2], turn: [1, 99, 99] } }))
}
// 小彎嘴：在林下的落葉上一跳一跳，用彎嘴翻找蟲子
function babbler(env) {
  return groundTripo(env, { name: 'babbler-rig', H: 0.23, h0: 0.51, ...TRIPO, hop: 0.04, flick: 0.25,
    walk: { radius: 1.0, speed: 0.2, turn: 3 }, stride: 0.09, swingT: 0.14, lift: 0.04, knee: [0.3, 0.6], focusY: 0.14,
    acts: { walk: [4, 99, 99], peck: [4, 0.8, 1.4], look: [2, 0.8, 1.8], stand: [1, 1, 2], turn: [1, 99, 99] } })
}
// 帝雉：在森林邊緣慢慢走、低頭啄食，長尾巴跟著擺
function mikado(env) {
  return groundTripo(env, { name: 'mikado-rig', H: 0.59, h0: 0.455, ...TRIPO, bob: 0.02,
    walk: { radius: 1.6, speed: 0.16 }, stride: 0.16, swingT: 0.32, lift: 0, knee: [0.8, 1.4], focusY: 0.35,
    acts: { walk: [4, 99, 99], peck: [3, 0.9, 1.4], look: [2, 1.5, 3], stand: [1.5, 1.5, 3], turn: [1, 99, 99] } })
}
// 台灣藍鵲、紅嘴黑鵯：兩隻在同一根枝上
// 2026-11-09 使用者：20 號腳趾收成拳頭、不像抓樹枝 → grip 1.25 改 0.35：腳趾張開平貼枝上，趾尖勾過枝條前緣
function bluemagpie(env) {
  return perchGroup(2, 0.7, -0.9, (blocked) => perchRigged(outer(env, -1.1), { name: 'bluemagpie-rig', k: 1.0, ...TRIPO, foot: 0.145, drop: 0.06, beat: 5, grip: 0.35, rich: true, plant: true,
    hopper: { blocked, hop: [0.25, 0.6] } }))
}
function blackbulbul(env) {
  return perchGroup(2, 0.4, -0.6, (blocked) => perchRigged(outer(env, -0.9), { name: 'blackbulbul-rig', k: 0.5, ...TRIPO, foot: 0.004, drop: 0.05, beat: 7,
    hopper: { blocked } }))
}

// 2026-11-06 新增四種（ChatGPT 參考圖 → Tripo → tools/rig-distance.py，點位在 bird-points.json）
// 黑面琵鷺：在淺水裡慢慢走、低頭用湯匙嘴掃水面（跟小白鷺同一套涉水動作，步伐更慢）
function spoonbill(env) {
  return groundTripo(env, { name: 'spoonbill-rig', H: 1.3, h0: 0.98, ...TRIPO, reach: 0.6, wade: true, bill: 0.38,
    walk: { radius: 1.0, speed: 0.12 }, swingT: 0.55, lift: 0, knee: [1.0, 1.7], focusY: 0.7,
    acts: { stand: [3, 3, 6], hunt: [4, 3, 6], walk: [3, 99, 99], turn: [1, 99, 99], strike: [1, 1.4, 1.4], look: [1.5, 1.5, 3] } })
}
// 台灣紫嘯鶇：在地上一跳一跳，停下來翹尾巴
function thrush(env) {
  return groundTripo(env, { name: 'thrush-rig', H: 0.39, h0: 0.735, ...TRIPO, hop: 0.05, flick: 0.4, flickF: 1.6,
    walk: { radius: 1.1, speed: 0.22, turn: 3 }, stride: 0.1, swingT: 0.14, lift: 0.045, knee: [0.3, 0.6], focusY: 0.2,
    acts: { walk: [4, 99, 99], peck: [3, 0.8, 1.4], look: [2, 0.8, 1.8], stand: [1.5, 1, 2.5], turn: [1, 99, 99] } })
}
// 藍腹鷴：跟帝雉一樣在林緣慢慢走、低頭啄食
function pheasant(env) {
  return groundTripo(env, { name: 'pheasant-rig', H: 0.63, h0: 0.619, ...TRIPO, bob: 0.02,
    walk: { radius: 1.6, speed: 0.16 }, stride: 0.16, swingT: 0.32, lift: 0, knee: [0.8, 1.4], focusY: 0.36,
    acts: { walk: [4, 99, 99], peck: [3, 0.9, 1.4], look: [2, 1.5, 3], stand: [1.5, 1.5, 3], turn: [1, 99, 99] } })
}
// 黃鸝：停在樹冠的枝上跳
function oriole(env) {
  return perchRigged(outer(env, -0.9), { name: 'oriole-rig', k: 0.54, ...TRIPO, foot: 0.005, drop: 0.05, beat: 7 })
}

// 2026-11-07 高山區 8 種（同一套流程；點位用 tools/side-view.py＋side-grid.py 量）
// 地上的：栗背林鴝（步道邊跳、翹尾巴）、台灣朱雀（山頂草坡低頭啄草籽）、金翼白眉（山頂步道慢慢走、很親人）
function bushrobin(env) {
  return groundTripo(env, { name: 'bushrobin-rig', H: 0.2, h0: 0.763, ...TRIPO, hop: 0.035, flick: 0.35, flickF: 1.8,
    walk: { radius: 1.0, speed: 0.22, turn: 3 }, stride: 0.08, swingT: 0.12, lift: 0.035, knee: [0.3, 0.6], focusY: 0.12,
    acts: { walk: [4, 99, 99], peck: [3, 0.7, 1.2], look: [2, 0.8, 1.8], stand: [1.5, 1, 2.5], turn: [1, 99, 99] } })
}
function rosefinch(env) {
  return groundTripo(env, { name: 'rosefinch-rig', H: 0.2, h0: 0.734, ...TRIPO, hop: 0.035, flick: 0.15,
    walk: { radius: 1.0, speed: 0.2, turn: 3 }, stride: 0.07, swingT: 0.12, lift: 0.035, knee: [0.3, 0.6], focusY: 0.12,
    acts: { walk: [4, 99, 99], peck: [5, 0.7, 1.3], look: [2, 0.8, 1.8], stand: [1, 1, 2], turn: [1, 99, 99] } })
}
function laughingthrush(env) {
  return groundTripo(env, { name: 'laughingthrush-rig', H: 0.24, h0: 0.557, ...TRIPO, hop: 0.04, flick: 0.25,
    walk: { radius: 1.2, speed: 0.2, turn: 3 }, stride: 0.09, swingT: 0.14, lift: 0.04, knee: [0.3, 0.6], focusY: 0.14,
    acts: { walk: [4, 99, 99], peck: [3, 0.8, 1.4], look: [2, 0.8, 1.8], stand: [1.5, 1, 2.5], turn: [1, 99, 99] } })
}
// 停在樹枝上的：火冠戴菊鳥（很小）、黃山雀、黃腹琉璃、冠羽畫眉、白耳畫眉
function flamecrest(env) {
  return perchRigged(outer(env, -0.7), { name: 'flamecrest-rig', k: 0.26, ...TRIPO, foot: 0.004, drop: 0.04, beat: 9 })
}
function yellowtit(env) {
  return perchRigged(outer(env, -0.8), { name: 'yellowtit-rig', k: 0.36, ...TRIPO, foot: 0.004, drop: 0.045, beat: 8 })
}
function niltava(env) {
  return perchRigged(outer(env, -0.9), { name: 'niltava-rig', k: 0.44, ...TRIPO, foot: 0.004, drop: 0.05, beat: 7 })
}
function yuhina(env) {
  return perchGroup(2, 0.35, -0.6, (blocked) => perchRigged(outer(env, -0.8), { name: 'yuhina-rig', k: 0.3, ...TRIPO, foot: 0.004, drop: 0.04, beat: 9,
    hopper: { blocked } }))
}
// 2026-11-08 山區猛禽：鳳頭蒼鷹（中海拔林緣的大樹上）、褐林鴞（溪谷旁的森林裡）。ChatGPT 參考圖 → Tripo → rig-distance（點位在 bird-points.json）
// 2026-11-12 大冠鷲（Tripo）：瀑布秘境步道最高那段廊道外，岩壁枯樹的橫枝上（perch 'snag'）
function serpenteagle(env) {
  return perchRigged(outer(env, -1.1), { name: 'serpenteagle-rig', k: 0.62, ...TRIPO, headYaw: -Math.PI / 2, foot: 0.01, drop: 0.05, beat: 4, grip: 1.2 })
}
function goshawk(env) {
  return perchRigged(outer(env, -1.1), { name: 'goshawk-rig', k: 0.42, ...TRIPO, foot: 0.045, drop: 0.05, beat: 5, grip: 1.2 })
}
// 2026-11-09 新增 8 種（使用者挑的；ChatGPT 參考圖 → Tripo → rig-distance.py，點位在 bird-points.json）
// 鴛鴦、花嘴鴨：在山區入口的湖裡游（跟紅冠水雞同一套游泳動作）
// 2026-11-09 使用者：湖裡只有一隻太孤單 → 鴛鴦 4 隻（兩對常常游在一起）、花嘴鴨 5 隻一小群；彼此不穿透（groundGroup），只在開闊水面
const swimAvoid = (env, mates) => (x, z, p) => mates(x, z, p) || (env.swimOK ? env.swimOK(x, z, p) : false)
// 鴛鴦公母長得完全不一樣（2026-11-09 使用者）：公的花俏（帆羽、橘色鬃毛）、母的灰褐色白眼圈 → 公母交錯，2 公 2 母
function mandarin(env) {
  let k = 0   // 母的小一點（H 0.31）
  return groundGroup(4, 0.7, (avoid) => { const f = k++ % 2 === 1; return groundTripo(env, { name: f ? 'mandarinf-rig' : 'mandarin-rig', H: f ? 0.31 : 0.33, h0: f ? 0.702 : 0.714, ...TRIPO, swim: true, bill: 0.1, bob: 0.025,
    walk: { radius: 3.2, speed: 0.13, avoid: swimAvoid(env, avoid) }, stride: 0.1, swingT: 0.35, lift: 0, knee: [0.6, 1.2], focusY: 0.24,
    acts: { walk: [4, 99, 99], peck: [2, 0.9, 1.3], look: [2, 1.2, 2.5], stand: [1.5, 1.5, 3], turn: [1, 99, 99] } }) })
}
function spotbill(env) {
  return groundGroup(2, 0.9, (avoid) => groundTripo(env, { name: 'spotbill-rig', H: 0.42, h0: 0.716, ...TRIPO, swim: true, bill: 0.13, bob: 0.03,
    walk: { radius: 3.6, speed: 0.14, avoid: swimAvoid(env, avoid) }, stride: 0.11, swingT: 0.35, lift: 0, knee: [0.7, 1.3], focusY: 0.28,
    acts: { walk: [4, 99, 99], peck: [3, 0.9, 1.4], look: [2, 1.2, 2.5], stand: [1, 1.5, 3], turn: [1, 99, 99] } }))
}
// 臺灣山鷓鴣：林下三隻一群，圓滾滾地慢慢走、低頭翻落葉
function partridge(env) {
  return groundGroup(3, 0.32, (avoid) => groundTripo(env, { name: 'partridge-rig', H: 0.23, h0: 0.89, ...TRIPO, bob: 0.02,
    walk: { radius: 1.3, speed: 0.16, avoid }, stride: 0.08, swingT: 0.16, lift: 0.02, knee: [0.4, 0.8], focusY: 0.13,
    acts: { walk: [4, 99, 99], peck: [4, 0.8, 1.3], look: [2, 1.2, 2.5], stand: [1.5, 1.5, 3], turn: [1, 99, 99] } }))
}
// 八色鳥：花園林下一跳一跳，停下來翻落葉找蚯蚓
function pitta(env) {
  return groundTripo(env, { name: 'pitta-rig', H: 0.17, h0: 0.9, ...TRIPO, hop: 0.045, flick: 0.2, flickF: 1.4,
    walk: { radius: 1.1, speed: 0.2, turn: 3 }, stride: 0.09, swingT: 0.13, lift: 0.04, knee: [0.3, 0.6], focusY: 0.1,
    acts: { walk: [4, 99, 99], peck: [4, 0.8, 1.4], look: [2, 0.8, 1.8], stand: [1.5, 1, 2.5], turn: [1, 99, 99] } })
}
// 草鴞：站在草地上幾乎不動，偶爾轉頭、走兩步
function grassowl(env) {
  return groundTripo(env, { name: 'grassowl-rig', H: 0.36, h0: 0.983, ...TRIPO,
    walk: { radius: 0.5, speed: 0.08 }, stride: 0.1, swingT: 0.4, lift: 0, knee: [0.6, 1.2], focusY: 0.28,
    acts: { stand: [6, 3, 7], look: [4, 1.5, 3], walk: [1, 99, 99], turn: [1, 99, 99] } })
}
// 停在枝上的：茶腹鳾、白環鸚嘴鵯（一對）、灰喉山椒鳥（腳在模型的 0.065、0.2：長尾巴垂得比腳低）
function nuthatch(env) {
  return perchRigged(outer(env, -0.9), { name: 'nuthatch-rig', k: 0.14, ...TRIPO, foot: 0.004, drop: 0.03, beat: 9 })
}
function finchbill(env) {
  // 2026-11-10 使用者：吃果的白環鸚嘴鵯兩隻疊在一起（雀榕的果枝短，第二隻被夾回同一個位置）→ 一棵樹一隻，另一隻在別棵雀榕（birdinfo figExtra）
  return perchGroup(1, 0.32, -0.7, (blocked) => perchRigged(outer(env, -0.8), { name: 'finchbill-rig', eat: true, k: 0.22, ...TRIPO, foot: 0.065, drop: 0.04, beat: 7,
    hopper: { blocked } }))
}
function minivet(env) {
  return perchRigged(outer(env, -0.9), { name: 'minivet-rig', k: 0.19, ...TRIPO, foot: 0.2, drop: 0.05, beat: 7 })
}
function woodowl(env) {
  return perchRigged(outer(env, -1.0), { name: 'woodowl-rig', k: 0.46, ...TRIPO, foot: 0.05, drop: 0.04, beat: 4 })
}
function sibia(env) {
  return perchRigged(outer(env, -1.0), { name: 'sibia-rig', eat: true, k: 0.56, ...TRIPO, foot: 0.004, drop: 0.05, beat: 7 })
}


/* ---------- 2026-11-09 補齊台灣特有種（17 種，ChatGPT 參考圖 → Tripo → rig-distance，點位在 tools/bird-points.json） ---------- */
// 地上走的：H 顯示身高（公尺）、h0 模型高度（side-view 的 BOUNDS y）、size 小鳥跳著走
const endemicGround = (name, H, h0, o = {}) => (env) => groundTripo(env, { name, H, h0, ...TRIPO, patrol: o.patrol, rock: o.rock, rockHz: o.rockHz, rockMul: o.rockMul, hop: o.hop ?? 0.035, flick: o.flick ?? 0.2, flickF: 1.6, bob: o.bob,
  walk: { radius: o.radius ?? 1.1, speed: o.speed ?? 0.2, turn: 3, ...(o.walk ?? {}) }, stride: o.stride ?? 0.08, swingT: o.swingT ?? 0.13, lift: o.lift ?? 0.035, knee: [0.3, 0.6], focusY: H * 0.6,
  acts: o.acts ?? { walk: [4, 99, 99], peck: [3, 0.7, 1.3], look: [2, 0.8, 1.8], stand: [1.5, 1, 2.5], turn: [1, 99, 99] } })
// （BUILD 在檔案前面就用到這些名字：要用 function 宣告才會提升，const 會在載入時出錯）
// 停枝的：k 縮放（= 想要的身高 / 模型高度），腳底在模型 y≈0；腳趾輕輕勾住（grip 0.35）、腳底貼枝
const endemicPerch = (name, k, beat = 8, more = {}) => (env) => perchRigged(outer(env, -0.9), { name, k, ...TRIPO, foot: 0.004, drop: 0.045, beat, grip: 0.35, plant: true, ...more })
const OWL_HOP = { owlHop: true, hopper: { preT: 0.16, dur: 0.3, arc: [0.075, 0.1], apex: 0.44 } }   // 第二輪：跳高一點，腳要明顯離開樹枝
function liocichla(env) { return endemicGround('liocichla-rig', 0.22, 0.652)(env) }
function whitebrow(env) { return endemicGround('whitebrow-rig', 0.2, 0.727, { flick: 0.35 })(env) }
function islandthrush(env) { return endemicGround('islandthrush-rig', 0.26, 0.705, { hop: 0.045, stride: 0.1 })(env) }
function rustylt(env) { return endemicGround('rustylt-rig', 0.27, 0.598, { hop: 0.04, flick: 0.25 })(env) }
function whitethroat(env) { return endemicGround('whitethroat-rig', 0.26, 0.62, { hop: 0.04, flick: 0.25 })(env) }
function hwamei(env) { return endemicGround('hwamei-rig', 0.25, 0.628, { hop: 0.04 })(env) }
function scimitar(env) { return endemicGround('scimitar-rig', 0.25, 0.573, { hop: 0.04, acts: { walk: [4, 99, 99], peck: [5, 0.9, 1.6], look: [2, 0.8, 1.8], stand: [1, 1, 2], turn: [1, 99, 99] } })(env) }
function bamboo(env) {   // 臺灣竹雞：三五隻一起在林緣草叢邊走邊啄
  return groundGroup(3, 0.34, (avoid) => groundTripo(env, { name: 'bamboo-rig', H: 0.24, h0: 0.699, ...TRIPO, bob: 0.02,
    walk: { radius: 1.3, speed: 0.17, avoid }, stride: 0.08, swingT: 0.16, lift: 0.02, knee: [0.4, 0.8], focusY: 0.14,
    acts: { walk: [4, 99, 99], peck: [4, 0.8, 1.3], look: [2, 1.2, 2.5], stand: [1.5, 1.5, 3], turn: [1, 99, 99] } }))
}
function bushwarbler(env) { return endemicGround('bushwarbler-rig', 0.17, 0.57, { hop: 0.03, radius: 0.8, flick: 0.3 })(env) }
function cupwing(env) { return endemicGround('cupwing-rig', 0.15, 0.887, { hop: 0.03, radius: 0.7, flick: 0 })(env) }
function shortwing(env) { return endemicGround('shortwing-rig', 0.17, 0.88, { hop: 0.035, radius: 0.8, flick: 0.3 })(env) }
function bullfinch(env) { return endemicPerch('bullfinch-rig', 0.21 / 0.651, 7)(env) }
function barwing(env) { return endemicPerch('barwing-rig', 0.22 / 0.65, 8)(env) }
function tit(env) { return endemicPerch('tit-rig', 0.18 / 0.65, 9)(env) }
function styan(env) { return endemicPerch('styan-rig', 0.22 / 0.637, 7)(env) }
// 2026-11-09 角鴞：白天停在樹枝上不太動，拍翅慢
function scopsowl(env) { return endemicPerch('scopsowl-rig', 0.21, 5, OWL_HOP)(env) }
function mtscops(env) { return endemicPerch('mtscops-rig', 0.17, 6, OWL_HOP)(env) }
// 2026-11-10 水雉：慢慢在荷葉上走（範圍小，不會走出荷葉外）；彩鷸：泥灘上低頭探找、尾巴上下擺
function jacana(env) { return endemicGround('jacana-rig', 0.3, 0.724, { hop: 0, flick: 0.05, radius: 0.45, speed: 0.08, stride: 0.1 })(env) }
function psnipe(env) { return endemicGround('psnipe-rig', 0.24, 0.717, { hop: 0, flick: 0.3, radius: 0.9, speed: 0.12, stride: 0.07 })(env) }
// 2026-11-10 山鷸：步道上兩點之間走過去走回來，每一步身體前後搖（rock）、頭不動；偶爾停下來用長嘴往地上探
function woodcock(env) { return endemicGround('woodcock-rig', 0.26, 0.573, { hop: 0, flick: 0, speed: 0.065, stride: 0.043, swingT: 0.2, lift: 0.006, patrol: env.patrol, rock: 1, rockHz: 1.5, rockMul: 2, acts: { walk: [6, 99, 99], peck: [2, 1, 1.8], stand: [1.5, 0.8, 2], look: [1, 0.8, 1.5] } })(env) }
// 2026-11-10 山下湖：黃麻鴨（兩隻游）、紫鷺（涉水捕魚）、高蹺鴴（三隻涉水）、西方澤鵟（站在草地上）
function shelduck(env) {
  return groundGroup(2, 1.1, (avoid) => groundTripo(env, { name: 'shelduck-rig', H: 0.5, h0: 0.719, ...TRIPO, swim: true, bill: 0.14, bob: 0.03,
    walk: { radius: 3.2, speed: 0.13, avoid: swimAvoid(env, avoid) }, stride: 0.12, swingT: 0.35, lift: 0, knee: [0.7, 1.3], focusY: 0.32,
    acts: { walk: [4, 99, 99], peck: [2, 0.9, 1.4], look: [2, 1.2, 2.5], stand: [1, 1.5, 3], turn: [1, 99, 99] } }))
}
function pheron(env) {
  return groundTripo(env, { name: 'pheron-rig', H: 1.0, h0: 0.979, ...TRIPO, reach: 0.9, wade: true, bill: 0.3,
    walk: { radius: 0.9, speed: 0.12 }, swingT: 0.5, lift: 0, knee: [1.0, 1.7], focusY: 0.6,
    acts: { stand: [3, 3, 6], hunt: [4, 3, 6], walk: [2, 99, 99], turn: [1, 99, 99], strike: [1, 1.4, 1.4], look: [1.5, 1.5, 3] } })
}
function stilt(env) {
  return groundGroup(3, 0.8, (avoid) => groundTripo(env, { name: 'stilt-rig', H: 0.46, h0: 0.98, ...TRIPO, reach: 0.6, wade: true, bill: 0.17,
    walk: { radius: 1.6, speed: 0.16, avoid }, swingT: 0.42, lift: 0, knee: [0.9, 1.6], focusY: 0.7,
    acts: { walk: [4, 99, 99], peck: [3, 0.8, 1.4], stand: [1.5, 1.5, 3], look: [1.5, 1, 2], turn: [1, 99, 99] } }))
}
// 2026-11-13 Pass 1D（ChatGPT 規格、使用者指定）：瀑布區的三種鳥。北美的鳥種——這座公園是台灣＋世界的鳥混在一起的設計，圖鑑不寫成同一個真實的優勝美地群落
// 遊隼：瀑布西側岩壁上一塊天然岩架（world.js 用射線量岩面、放岩架），站著不走動、轉頭看山谷；被驚動就起飛滑翔
function peregrine(env) {
  return groundTripo(env, { name: 'peregrine-rig', H: 0.4, h0: 0.979, ...TRIPO, bill: 0.05,
    walk: { radius: 0.01, speed: 0.01 }, swingT: 0.4, lift: 0.02, knee: [0.5, 1.0], focusY: 0.3,
    acts: { stand: [4, 3, 6], look: [4, 1.0, 2.2], walk: [0.01, 99, 99], turn: [0.01, 99, 99] } })
}
// 黑雨燕：抓在瀑布後面凹洞的潮濕後壁上（跟大赤啄木一樣直立貼著岩面；world.js 用射線量到後壁）
function blackswift(env) {
  // 2026-11-13 使用者：雨燕在巢裡 → 伏坐的模型（看不到腳），坐在 world.js 做的苔蘚巢裡，不走動，只轉頭
  return groundTripo(env, { name: 'blackswift-rig', H: 0.045, h0: 0.233, ...TRIPO, bill: 0.02,
    walk: { radius: 0.01, speed: 0.01 }, swingT: 0.4, lift: 0, knee: [0.2, 0.4], focusY: 0.03,
    acts: { stand: [5, 3, 6], look: [3, 1.0, 2.0], walk: [0.01, 99, 99], turn: [0.01, 99, 99] } })
}
// 烏林鴞：湖西南的林緣枝頭，看著草地
function greatgreyowl(env) {
  return perchRigged(outer(env, -1.0), { name: 'greatgreyowl-rig', k: 0.62, ...TRIPO, foot: 0.137, drop: 0.04, beat: 3.5 })
}
function harrier(env) {
  const b = groundTripo(env, { name: 'harrier-rig', H: 0.56, h0: 0.95, ...TRIPO, bill: 0.07,
    walk: { radius: 0.01, speed: 0.01 }, swingT: 0.4, lift: 0.02, knee: [0.6, 1.2], focusY: 0.45,   // 2026-11-12 站在枯木頂端：不走動（以前在草島上踱步）
    acts: { stand: [4, 3, 6], look: [3, 1.2, 2.5], walk: [0.01, 99, 99], turn: [0.01, 99, 99] } })   // walk／turn 不能拿掉（轉身會繞著模型原點轉、腳會離開斷口，機率壓到最低）（行為系統會直接叫）；半徑 1 cm＝原地
  // 2026-11-12 站在枯木斷口上：把模型挪到「兩腳中點＝轉身的軸心」，不管面向哪邊腳都踩在斷口正中間
  const o = b.obj; o.updateWorldMatrix(true, true)
  let fl, fr; o.traverse((q) => { if (q.isBone && q.name === 'footL') fl = q; if (q.isBone && q.name === 'footR') fr = q })
  if (fl && fr) { const m = o.worldToLocal(fl.getWorldPosition(V()).add(fr.getWorldPosition(V())).multiplyScalar(0.5)); for (const ch of o.children) { ch.position.x -= m.x; ch.position.z -= m.z } }
  return b
}
// 2026-11-11 世界濕地鳥（使用者：10 種獨特的濕地鳥住進加大的濕地；ChatGPT→Tripo→rig-distance，跟其他鳥同一套流程）
// 鯨頭鸛：紙莎草角落，幾乎不動地站著，偶爾猛然往水裡一啄（strike）
function shoebill(env) {
  return groundTripo(env, { name: 'shoebill-rig', H: 1.2, h0: 0.98, ...TRIPO, reach: 0.7, wade: true, bill: 0.24,
    walk: { radius: 0.5, speed: 0.07 }, swingT: 0.7, lift: 0, knee: [1.0, 1.7], focusY: 0.75,
    acts: { stand: [9, 15, 45], hunt: [4, 10, 25], strike: [1.2, 1.6, 1.6], look: [1.5, 2, 4], walk: [0.5, 99, 99], turn: [0.4, 99, 99] } })   // 2026-11-11 照核對過的行為：像雕像一樣站很久（遊戲裡 15～45 秒一段），獵食的撲擊很少
}
// 大紅鸛：潟湖淺水一群 6 隻，慢慢走、低頭濾食
// 覓食姿勢（每根骨頭多轉幾弧度，照側面實拍調的）。down：頭下到水面那一段的姿勢；sweep：嘴在水裡左右掃的幅度、頻率
export const FEED = {
  // 紅鶴濾食：身體只微微前傾，脖子從胸口直直垂下去，頭整個倒過來、上嘴朝下貼著水面，慢慢左右擺
  flamingo: { acts: ['peck'], lean: 0.16, neck: 0, head: 0, reach: 0.2, rate: 2.2, bones: { neck: 0.35, neck2: -0.17, neck3: -0.52, neck4: -0.66, neck5: -0.66, neck6: -0.63, neck7: -0.52, neck8: -0.35, neck9: -0.09, neck10: 0.26, head: 1.75 }, sweep: 0.12, hz: 0.25, inT: 0.2, outT: 0.8 },   // 2026-11-12 第五版：脖子 10 節平均分攤往下彎成一條弧（每節最多 38°）、喝水時脖子伸長 4 成；頭在頭頸交界轉 100° 倒過來（頭的權重只到交界往前 3 cm，脖子整條一樣細）
  // 玫瑰琵鷺：身體前傾，脖子往前下伸直，匙狀的嘴尖泡在水裡、張著一點左右快速掃
  rspoonbill: { acts: ['hunt', 'strike'], lean: 0.6, neck: 0, head: 0, reach: 0.65, bones: { neck: -1.25, neck2: -0.4, neck3: -0.1, head: 1.9 }, sweep: 0.3,   /* 2026-11-12 使用者：頭歪著喝水——頭往後折了 97°，嘴尖朝著腳；改成脖子往前下斜、嘴朝前下插進水裡 */ hz: 1.1, inT: 0.12, outT: 0.9 },
}
const feeder = (F) => ({ n, kk, t }) => {
  if (!F.acts.includes(n) || kk < 0.02 || kk > F.outT) return null   // 動作尾段回到站姿（骨頭的額外轉動會自己慢慢退回 0）
  const k = Math.min(1, kk / F.inT)
  return { lean: F.lean, neck: F.neck, head: F.head, reach: F.reach, rate: F.rate ?? 5, bones: F.bones, sway: k >= 1 ? F.sweep * Math.sin(t * Math.PI * 2 * F.hz) : 0 }
}
function flamingo(env) {
  const show = flamingoShow({ neck6: -0.42, neck7: -0.3, neck8: -0.03, neck9: 0.23, neck10: 0.44, head: 0.1 })   // 行進展示：只把上半段的 S 拉直（下半段留在胸前；整條從肩膀拉直會露出胸前那團原本黏著脖子的地方）
  return groundGroup(6, 1.3, (avoid) => groundTripo(env, { name: 'flamingo-rig', H: 1.3, h0: 0.981, ...TRIPO, reach: 0.9, wade: true, bill: 0.16, show, feed: feeder(FEED.flamingo),
    walk: { radius: 3.2, speed: 0.13, avoid }, swingT: 0.6, lift: 0, knee: [1.0, 1.8], focusY: 0.75,
    acts: { walk: [4, 99, 99], peck: [4, 7, 11], stand: [2, 2, 4], look: [1.5, 1.2, 2.5], turn: [1, 99, 99], show: [0, 999, 999] } }))
}
// 非洲水雉、紫水雞：荷葉盆地，踩著浮葉走（跟水雉同一套）
function ajacana(env) { return endemicGround('ajacana-rig', 0.29, 0.979, { hop: 0, flick: 0.05, radius: 1.1, speed: 0.09, stride: 0.1 })(env) }
function gallinule(env) { return endemicGround('gallinule-rig', 0.3, 0.979, { hop: 0, flick: 0.5, radius: 1.0, speed: 0.1, stride: 0.09 })(env) }
// 玫瑰琵鷺：潟湖南岸的淺灘，兩隻，嘴泡在水裡左右掃
function rspoonbill(env) {
  return groundGroup(2, 1.0, (avoid) => groundTripo(env, { name: 'rspoonbill-rig', H: 0.8, h0: 0.981, ...TRIPO, reach: 0.6, wade: true, bill: 0.24, feed: feeder(FEED.rspoonbill),
    walk: { radius: 1.6, speed: 0.12, avoid }, swingT: 0.55, lift: 0, knee: [1.0, 1.7], focusY: 0.7,
    acts: { stand: [2, 3, 6], hunt: [5, 3, 6], walk: [3, 99, 99], turn: [1, 99, 99], strike: [1, 1.4, 1.4], look: [1.5, 1.5, 3] } }))
}
// 赤頸鶴：南邊的濕草甸，一對，慢慢踱步、低頭啄食、抬頭張望
function sarus(env) {
  const show = undefined   // 2026-11-13 使用者：跳舞（跳起來、拍翅膀）時模型整個變形 → 拿掉（craneShow 留著）
  return groundGroup(2, 1.6, (avoid) => groundTripo(env, { name: 'sarus-rig', H: 1.6, h0: 0.979, ...TRIPO, reach: 0.25, bill: 0.18, show,
    walk: { radius: 2.6, speed: 0.14, avoid }, swingT: 0.65, lift: 0.03, knee: [1.0, 1.8], focusY: 0.8,
    acts: { walk: [4, 99, 99], peck: [2.5, 1.4, 2.6], stand: [2.5, 2, 5], look: [2.5, 1.5, 3], turn: [1, 99, 99] } }))
}
// 黑剪嘴鷗：一直在飛——沿著潟湖那條筆直的深水道貼著水面剪過去（下嘴泡在水裡），到頭拉高轉彎、從旁邊高一點飛回來，再下去剪一趟。
// 只有飛行模型（skimmer-fly-rig，翅膀舉在最高點）；路線是鳥群座標裡的一圈跑道形：長軸沿 env.toCam 的垂直方向（side）
function skimmer(env) {
  // 2026-11-11 使用者：圖鑑上一直看不到牠（園區裡牠只在飛，圖鑑的小場景拍不到）→ 另外做了站姿模型（skimmer-rig），圖鑑插圖用站著的：
  // 站在沙洲上休息、張望，短腳、長翅膀交叉蓋過尾巴
  if (env.guide) return groundTripo(env, { name: 'skimmer-rig', H: 0.28, h0: 0.395, ...TRIPO, reach: 0.2, bill: 0.2,
    walk: { radius: 0.25, speed: 0.05 }, swingT: 0.4, lift: 0.01, knee: [0.4, 0.8], focusY: 0.6,
    acts: { stand: [4, 2, 5], look: [3, 1.5, 3], turn: [0.6, 99, 99] } })
  const r = rigged('skimmer-fly-rig'), root = new THREE.Group(), inner = new THREE.Group(), focus = V()
  const K = 0.74   // 全長約 0.68 m（真實 45 cm × 1.5）
  r.model.scale.setScalar(K); r.model.position.set(0.03 * K, -0.02 * K, 0)   // 下嘴尖放在原點下面一點點
  inner.rotation.y = Math.PI / 2; inner.add(r.model); root.add(inner); root.rotation.order = 'YXZ'
  const side = V(env.toCam.z, 0, -env.toCam.x), HL = 24, HW = 4.5, SPD = 7.5
  const PER = 4 * HL + 2 * Math.PI * HW
  let dist = 0, ph = 0, snapT = rnd(2, 5)
  const at = (d) => {   // 跑道：近鏡頭那條直線是剪水段（u：沿 side、v：朝鏡頭）
    d = ((d % PER) + PER) % PER
    if (d < 2 * HL) return [-HL + d, HW, 0]
    d -= 2 * HL
    if (d < Math.PI * HW) { const a = d / HW; return [HL + Math.sin(a) * HW, Math.cos(a) * HW, 1] }
    d -= Math.PI * HW
    if (d < 2 * HL) return [HL - d, -HW, 2]
    d -= 2 * HL; const a = d / HW; return [-HL - Math.sin(a) * HW, -Math.cos(a) * HW, 3]
  }
  const pos = (d, out) => {
    const [u, v, seg] = at(d), dd = ((d % PER) + PER) % PER
    // 高度：剪水段中間 36 m 貼水（嘴尖在水面下 2 cm），兩端 6 m 進出；其餘 1.6～2.4 m
    let h = 2.0 + 0.4 * Math.sin(dd * 0.21)
    if (seg === 0) h = lerp(2.0, 0.0, ss(dd, 0, 6) * (1 - ss(dd, 2 * HL - 6, 2 * HL)))
    return out.set(side.x * u + env.toCam.x * v, h, side.z * u + env.toCam.z * v)
  }
  const p0 = V(), p1 = V()
  function update(t, dt) {
    dist += SPD * dt
    pos(dist, p0); pos(dist + 0.6, p1)
    const dx = p1.x - p0.x, dz = p1.z - p0.z, dy = p1.y - p0.y, low = 1 - ss(p0.y, 0.05, 0.8)
    root.position.copy(p0)
    const head = Math.atan2(dx, dz), turn = at(dist)[2] % 2 === 1 ? 1 : 0
    root.rotation.set(-Math.atan2(dy, Math.hypot(dx, dz)) + 0.1 * low, head, damp(root.rotation.z, -0.6 * turn, 3, dt))
    // 拍翅：剪水時翅膀只在水平以上淺淺地拍（不能打到水）；拉高、轉彎時拍得深
    ph += dt * Math.PI * 2 * lerp(3.4, 4.2, low)
    r.reset()
    const A = lerp(0.6, 0.32, low), a = A * Math.sin(ph) + lerp(0.25, 0.02, low), a2 = A * Math.sin(ph - 0.9) + lerp(0.2, 0.0, low)
    for (const [n, sg] of [['L', 1], ['R', -1]]) { r.turn('wing' + n, AX.x, -sg * a); r.turn('wingtip' + n, AX.x, -sg * a2 * 0.7) }
    // 剪水時下嘴往下斜 10～25°；下嘴碰到魚：嘴瞬間合上、頭往下往後一甩（0.25 秒）再抬回來——是觸覺反射，不是看準了啄
    snapT -= dt
    if (low > 0.9 && snapT < -0.7) snapT = rnd(3.5, 8)
    const sn2 = snapT < 0 && snapT > -0.7 ? Math.sin(Math.PI * Math.min(1, -snapT / 0.25) * 0.5) * (1 - ss(-snapT, 0.25, 0.7)) : 0
    r.turn('head', AX.z, (0.3 + 0.75 * sn2) * low)
    focus.copy(p0); focus.y += 0.1
  }
  update(0, 0)
  return { obj: root, focus, update, get behavior() { return root.position.y < 0.3 ? 'skim' : null } }
}
// 丹頂鶴：北邊的濕草甸，一對；ruff 流蘇鷸：南邊草甸三隻雄鳥；鳳頭鸊鷉：深水池一對游
function redcrowned(env) {
  const show = undefined   // 2026-11-13 使用者：跳舞（跳起來、拍翅膀）時模型整個變形 → 拿掉（craneShow 留著）
  return groundGroup(2, 1.6, (avoid) => groundTripo(env, { name: 'redcrowned-rig', H: 1.5, h0: 0.98, ...TRIPO, reach: 0.25, bill: 0.18, show,
    walk: { radius: 2.4, speed: 0.14, avoid }, swingT: 0.65, lift: 0.03, knee: [1.0, 1.8], focusY: 0.8,
    acts: { walk: [4, 99, 99], peck: [2.5, 1.4, 2.6], stand: [2.5, 2, 5], look: [2.5, 1.5, 3], turn: [1, 99, 99] } }))
}
function ruff(env) {
  const show = ruffShow()
  return groundGroup(3, 0.7, (avoid) => groundTripo(env, { name: 'ruff-rig', H: 0.3, h0: 0.977, ...TRIPO, reach: 0.35, bill: 0.1, show,
    walk: { radius: 1.6, speed: 0.2, avoid }, swingT: 0.3, lift: 0.01, knee: [0.8, 1.4], focusY: 0.4,
    acts: { stand: [4, 1.5, 3.5], look: [3, 1, 2], walk: [3, 99, 99], peck: [1.5, 0.8, 1.4], turn: [1.5, 99, 99], show: [0, 999, 999] } }))
}
// 2026-11-13 小辮鴴：開放濕地三隻，典型的「跑幾步、停、低頭啄」（plover 的覓食方式）：走得快、常停下來站著看、啄得多
function lapwing(env) {
  return groundGroup(3, 0.8, (avoid) => groundTripo(env, { name: 'lapwing-rig', H: 0.27, h0: LAPWING_H0, ...TRIPO, reach: 0.3, bill: 0.06,
    walk: { radius: 1.8, speed: 0.42, avoid }, swingT: 0.18, lift: 0.012, knee: [0.8, 1.4], focusY: 0.5,
    acts: { stand: [4, 1.2, 3], look: [3, 0.8, 1.8], walk: [4, 99, 99], peck: [3, 0.5, 1.0], turn: [1.5, 99, 99] } }))
}
// 鳳頭鸊鷉：深水池一對，浮在水面慢慢游、偶爾低頭
function grebe(env) {
  const show = grebeShow()
  return groundGroup(2, 1.2, (avoid) => groundTripo(env, { name: 'grebe-rig', H: 0.65, h0: 0.871, ...TRIPO, swim: true, bill: 0.27, reach: 0.12, show,
    walk: { radius: 3.4, speed: 0.14, avoid: swimAvoid(env, avoid) }, stride: 0.12, swingT: 0.35, lift: 0, knee: [0.7, 1.3], focusY: 0.3,
    acts: { walk: [4, 99, 99], look: [2.5, 1.2, 2.5], stand: [2, 1.5, 3], turn: [1, 99, 99], show: [0, 999, 999] } }))
}
function wbwood(env) {
  // 2026-11-10 大赤啄木：直立貼在神木樹幹上（sacredUpright），臉朝樹幹、偶爾左右挪一點；eat 動作＝往樹皮啄
  // 2026-11-10 使用者：腳要平貼在樹上 → 換成 Tripo 直接生成「攀樹姿勢」的模型（wbwood2：身體直立、腳趾和尾羽末端抵在同一個垂直面），
  // 不再用 clingPose 去掰站姿模型的腳。k 0.3（全長約 30 公分）；foot 0.44＝腳的高度（模型座標），腳趾在模型 x -0.19 → 離根 0.057，所以 sacredOff 0.057
  // 2026-11-12 使用者：圖鑑裡攀樹模型破圖、腳也歪（圖鑑沒有樹幹，攀樹姿勢被橫放在樹枝上）→ 圖鑑插圖改用原本的站姿模型（wbwood-rig），站在樹枝上
  if (env.guide) return perchRigged(env, { name: 'wbwood-rig', k: 0.3, ...TRIPO, foot: 0.09, drop: 0.02, beat: 9, eat: true, hopper: { hop: [0.05, 0.12] } })
  return perchRigged(env, { name: 'wbwood2-rig', k: 0.3, ...TRIPO, foot: 0.44, drop: 0.01, beat: 9, eat: true,
    fly: null, hopper: { span: [Math.PI / 2, Math.PI / 2], hop: [0.04, 0.1], rest: [3, 7] }, acts: { idle: [3, 2, 4], call: [1, 1.5, 2.5], preen: [0.5, 1.5, 2.5], eat: [4, 2.5, 4] } })
}
function nutcracker(env) {
  // 2026-11-10 星鴉：高山針葉林的鴉科，停在神木附近步道旁的枝頭
  return perchRigged(outer(env, -1.0), { name: 'nutcracker-rig', k: 0.21, ...TRIPO, foot: 0.02, drop: 0.05, beat: 5, eat: true,
    hopper: { hop: [0.15, 0.4] } })
}
function rnpheasant(env) {
  // 2026-11-10 環頸雉：湖前草地上慢慢走、低頭啄草籽；旁邊地上有一窩橄欖褐色的蛋（withNest：走路不會踩進巢）
  return withNest(env, (avoid) => groundTripo(env, { name: 'rnpheasant-rig', H: 0.4, h0: 0.468, ...TRIPO, bob: 0.02,
    walk: { radius: 1.1, speed: 0.15, avoid }, stride: 0.13, swingT: 0.3, lift: 0, knee: [0.8, 1.4], focusY: 0.25,
    acts: { walk: [4, 99, 99], peck: [3, 0.9, 1.4], look: [2, 1.5, 3], stand: [1.5, 1.5, 3], turn: [1, 99, 99] } }), 'pheasant', 0.6)
}
function skylark(env) {
  // 2026-11-10 小雲雀：在草地上走（雲雀用走的，不跳），頭冠偶爾豎起；巢是草根旁的小淺碗，三顆布滿褐斑的蛋
  return withNest(env, (avoid) => groundTripo(env, { name: 'skylark-rig', H: 0.18, h0: 0.72, ...TRIPO, bob: 0.01,
    walk: { radius: 0.8, speed: 0.13, avoid }, stride: 0.045, swingT: 0.11, lift: 0.012, knee: [0.3, 0.6], focusY: 0.1,
    acts: { walk: [4, 99, 99], peck: [3, 0.7, 1.2], look: [2, 0.8, 1.8], stand: [1.5, 1, 2.5], turn: [1, 99, 99] } }), 'lark', 0.38)
}
const CISTI_K = 0.15 / 0.725, CISTI_FOOT = 0.01   // 站高 0.15（小鳥放大過，同山雀）；腳底在模型 y 0.01
function cisticola(env) {
  // 2026-11-10 棕扇尾鶯：抓在一根高草莖頂端（stem 停棲：草莖跟著風晃），不會沿枝跳；底下草叢裡有牠縫的囊狀巢
  return perchRigged(env, { name: 'cisticola-rig', k: CISTI_K, ...TRIPO, foot: CISTI_FOOT, drop: 0.02, beat: 12,
    hopper: { hop: [0.001, 0.003], rest: [3, 7] }, acts: { idle: [3, 2, 4], call: [2, 1, 2], preen: [1, 1.5, 2.5] } })
}
function fulvetta(env) { return endemicPerch('fulvetta-rig', 0.18 / 0.618, 9)(env) }
function flowing(env) { return endemicPerch('flowing-rig', 0.17 / 0.572, 10)(env) }


/* ---------- 鳥巢（2026-11-10 湖前草地：環頸雉、小雲雀的地面巢；棕扇尾鶯縫在草叢裡的囊狀巢） ---------- */
const colorize = (geo, fn) => {
  geo = geo.index ? geo.toNonIndexed() : geo
  const p = geo.attributes.position, col = new Float32Array(p.count * 3), c = new THREE.Color()
  for (let i = 0; i < p.count; i++) { fn(c, p.getX(i), p.getY(i), p.getZ(i), i); col.set([c.r, c.g, c.b], i * 3) }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3)); geo.deleteAttribute('uv')
  return geo
}
const STRAW = [0xb59a63, 0x9c814f, 0xc8b27c, 0x7d6a45]
// 一叢草：n 片細長草葉（雙面），在 r 半徑內、高 h0～h1；skip(x,z)：那裡不長（讓出巢口、鏡頭方向）
function grassTuft(n, r, h0, h1, skip) {
  const blades = []
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, rr = r * Math.sqrt(Math.random()), h = h0 + Math.random() * (h1 - h0)
    const x = Math.cos(a) * rr, z = Math.sin(a) * rr
    if (skip?.(x, z)) continue
    const b = new THREE.PlaneGeometry(0.012, h, 1, 5).translate(0, h / 2, 0), bp = b.attributes.position
    const bend = (Math.random() * 0.5 + 0.15) * h
    for (let k = 0; k < bp.count; k++) { const y = bp.getY(k) / h; bp.setX(k, bp.getX(k) * (1 - y * 0.85)); bp.setZ(k, bend * y * y) }
    b.rotateY(-a + Math.PI / 2 + (Math.random() - 0.5)); b.translate(x, 0, z)
    const hx = [0x7f8f45, 0x95a052, 0xa89f5e, 0x6f7d3c][i % 4]
    blades.push(colorize(b, (c, _x, y) => c.setHex(hx).multiplyScalar(0.6 + 0.5 * Math.min(1, y / 0.4))))
  }
  const m = new THREE.Mesh(mergeGeometries(blades), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, side: THREE.DoubleSide }))
  m.castShadow = true; m.userData.noBake = true
  return m
}
// 草編的碗：外圈一圈碗形＋幾十根沿著碗緣繞的乾草（看得出是一根一根編的），R＝碗口半徑
function nestCup(R, depth) {
  const prof = [[0.001, 0.004], [R * 0.45, 0.006], [R * 0.8, depth * 0.45], [R, depth], [R * 1.22, depth * 1.05], [R * 1.45, depth * 0.55], [R * 1.5, 0]].map(([x, y]) => new THREE.Vector2(x, y))
  const parts = [colorize(new THREE.LatheGeometry(prof, 28), (c, x, y, z) => c.setHex(STRAW[(Math.abs(Math.floor(x * 913 + z * 571 + y * 377)) % 4)]))]
  for (let i = 0; i < 90; i++) {
    const a = Math.random() * Math.PI * 2, rr = R * (1.0 + Math.random() * 0.45), len = R * (0.7 + Math.random() * 0.9)
    const g = new THREE.CylinderGeometry(R * 0.012, R * 0.012, len, 4, 1)
    g.rotateZ(Math.PI / 2 + (Math.random() - 0.5) * 0.5); g.rotateY(-a + Math.PI / 2 + (Math.random() - 0.5) * 0.6)
    g.translate(Math.cos(a) * rr, depth * (0.25 + Math.random() * 0.85) * (rr < R * 1.3 ? 1 : 0.6), Math.sin(a) * rr)
    const hx = STRAW[i % 4]; parts.push(colorize(g, (c) => c.setHex(hx).multiplyScalar(0.85 + Math.random() * 0.3)))
  }
  const m = new THREE.Mesh(mergeGeometries(parts), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, side: THREE.DoubleSide }))
  m.castShadow = m.receiveShadow = true
  return m
}
// 一窩蛋：n 顆、長徑 L，speck：蛋殼上斑點的比例（小雲雀密密的褐斑；環頸雉素色橄欖褐）
function eggClutch(n, L, base, spot, speck, R) {
  const parts = []
  for (let i = 0; i < n; i++) {
    const a = i / n * Math.PI * 2 + Math.random() * 0.4, rr = n > 1 ? R * (n > 5 && i % 2 ? 0.28 : 0.55) : 0
    const g = new THREE.SphereGeometry(1, 14, 10)
    const pp = g.attributes.position
    for (let k = 0; k < pp.count; k++) { const y = pp.getY(k); pp.setY(k, y * (y > 0 ? 1.12 : 0.92)) }   // 一頭尖一頭鈍
    g.scale(L * 0.38, L * 0.5, L * 0.38); g.rotateZ(Math.PI / 2 - 0.15); g.rotateY(Math.random() * 6.3)
    g.translate(Math.cos(a) * rr, L * 0.33, Math.sin(a) * rr)
    parts.push(colorize(g, (c) => c.setHex(Math.random() < speck ? spot : base)))
  }
  const m = new THREE.Mesh(mergeGeometries(parts), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45 }))
  m.castShadow = true
  return m
}
function groundNest(kind, tc) {
  // tc：朝鏡頭的方向（巢座標）；草叢長在巢的後面（離鏡頭那側），蛋從前面看得到
  // 大小跟著鳥：遊戲裡的小鳥放大過（小雲雀 ×1.5），巢也一起放大，不然從 4 公尺外只是一個小點
  const g = new THREE.Group(), back = (x, z) => x * tc.x + z * tc.z > -0.02
  if (kind === 'pheasant') { const R = 0.11; g.add(nestCup(R, 0.026), eggClutch(9, 0.048, 0xa29a6c, 0x8a8058, 0.12, R)); const t = grassTuft(26, 0.16, 0.18, 0.35, back); t.position.set(-tc.x * 0.2, 0, -tc.z * 0.2); g.add(t) }
  else { const R = 0.075; g.add(nestCup(R, 0.018), eggClutch(3, 0.034, 0xe2dccb, 0x6e5236, 0.45, R)); const t = grassTuft(22, 0.1, 0.12, 0.26, back); t.position.set(-tc.x * 0.13, 0, -tc.z * 0.13); g.add(t) }
  g.traverse((o) => { if (o.isMesh) o.userData.noBake = true })
  return g
}
// 地上走的鳥＋旁邊一個巢：巢擺在鳥群座標 at（往鏡頭左前方），走路不會踩進巢裡
function withNest(env, mk, kind, at = 0.55) {
  const tc = env.toCam, sd = V(tc.z, 0, -tc.x), N = sd.multiplyScalar(at).addScaledVector(tc, at * 0.6)
  const hit = (x, z) => Math.hypot(x - N.x, z - N.z) < 0.28
  const b = mk((x, z, p) => { for (let k = 1; k <= 8; k++) if (hit(lerp(p.x, x, k / 8), lerp(p.y, z, k / 8))) return true; return false })
  const nest = groundNest(kind, tc)
  nest.position.set(N.x, env.groundAt ? env.groundAt(N.x, N.z) : 0, N.z)
  b.extra = nest   // placeAnimal 另外掛上去（不能包進鳥的 obj：鳥被嚇飛時 obj 會藏起來，巢不能跟著消失）
  return b
}

/* ---------- 停棲處 ---------- */
const BARK = 0x6d5544
barkify(mat(BARK, 0.9))
// 樹冠：一團平滑的球 + 表面一圈葉片
function crownBlob(color, r) {
  const m = new THREE.Mesh(canopyGeometry(), leafify(new THREE.MeshStandardMaterial({ color, roughness: 0.85, vertexColors: true })))
  m.scale.setScalar(r); m.castShadow = true
  m.add(new THREE.Mesh(leafCardGeometry(), leafCardMaterial(color)))
  return m
}
function stick(r0, r1, len, c, [x, y, z], rot = [0, 0, 0], seg = 10) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r0, r1, len, seg).translate(0, -len / 2, 0), mat(c, 0.9))
  m.position.set(x, y, z); m.rotation.set(...rot); m.castShadow = m.receiveShadow = true
  return m
}
const BRANCH = { len: 2.6, y: 3.2 }
// 停棲的橫枝（樹的座標：樹幹在原點、枝條往 +x）：從樹幹斜斜往上長出來、慢慢轉平，末端微微下垂；
// 越往外越細，和樹幹接的地方粗一點。center(x) 是枝條中心高度、radius(x) 是半徑。
const limb = {
  center: (x) => 3.2 - 0.85 * Math.pow(1 - ss(x, -0.25, 1.6), 1.6) - 0.07 * ss(x, 2.2, 3.0),
  // 和樹幹接的地方慢慢變粗（枝領），不是一個圓頭插在樹幹上
  radius: (x) => lerp(0.11, 0.038, clamp(x / 2.95, 0, 1)) + 0.1 * Math.exp(-Math.max(x, 0) / 0.32),
  z: (x) => 0.03 * Math.sin(x * 2.1 + 0.5) * ss(x, 0.3, 1),
}
const barkPaint = (o, u, s, c, p) => o.copy(tmp.set(BARK)).multiplyScalar(0.85 + 0.25 * ss(s, -0.6, 0.8))
// 沿 [[x, y, z, r], ...] 長一根逐漸變細的枝
function bough(pts) {
  return loft(pts.map(([x, y, z, r]) => [x, y, z, r, r]), barkPaint, { seg: 12, sub: 4, up: V(0, 0, 1), material: mat(BARK, 0.9) })
}
// 2026-11-10 停在雀榕上的鳥（def.onFig）：自帶的樹只留那根枝（改成雀榕灰白的樹皮、掛滿一串串榕果），
// 樹幹、樹冠藏起來，真正的雀榕由 alpine.js 種在同一個位置（FIG_FORCED），枝條看起來就是從雀榕樹幹長出來的
let figBarkM = null
function dressFig(tree, x, z, gy) {
  const branch = tree.children[1]
  tree.children.forEach((o) => { o.visible = o === branch })   // 樹幹、小枝的葉、樹冠藏起來（只留這根枝）
  branch.material = figBarkM ??= barkify(new THREE.MeshStandardMaterial({ color: 0x8a8378, roughness: 0.9 }))   // 雀榕灰褐色的樹皮（sRGB；clone 會掉樹皮紋路，另外做一個）
  // 榕果：沿枝條 x 0.4～2.9（鳥站在 1.8～2.4）一串串擠在枝的下半圈和側面；粉紅、紫紅、深紫
  const C = [[0.95, 0.62, 0.68], [0.86, 0.36, 0.5], [0.62, 0.16, 0.34], [0.4, 0.09, 0.22]], r = (a, b) => a + Math.random() * (b - a)
  const parts = []
  for (let c = 0; c < 34; c++) {
    const bx = r(0.4, 2.9), cy = limb.center(bx), cz = limb.z(bx), rad = limb.radius(bx), a0 = r(-2.4, 2.4)
    for (let k = 0; k < 7; k++) {
      const a = a0 + r(-0.5, 0.5), q = new THREE.IcosahedronGeometry(r(0.011, 0.016), 1).toNonIndexed()
      q.translate(bx + r(-0.04, 0.04), cy - Math.cos(a) * (rad + 0.012), cz + Math.sin(a) * (rad + 0.012))
      const col = C[Math.floor(Math.random() * C.length)], cc = new Float32Array(q.attributes.position.count * 3)
      for (let i = 0; i < cc.length; i += 3) { cc[i] = col[0]; cc[i + 1] = col[1]; cc[i + 2] = col[2] }
      q.setAttribute('color', new THREE.BufferAttribute(cc, 3)); parts.push(q)
    }
  }
  let n = 0; for (const q of parts) n += q.attributes.position.count
  const P = new Float32Array(n * 3), N = new Float32Array(n * 3), Cc = new Float32Array(n * 3); let o = 0
  for (const q of parts) { P.set(q.attributes.position.array, o * 3); N.set(q.attributes.normal.array, o * 3); Cc.set(q.attributes.color.array, o * 3); o += q.attributes.position.count }
  const fg = new THREE.BufferGeometry(); fg.setAttribute('position', new THREE.BufferAttribute(P, 3)); fg.setAttribute('normal', new THREE.BufferAttribute(N, 3)); fg.setAttribute('color', new THREE.BufferAttribute(Cc, 3))
  const fm = new THREE.Mesh(fg, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4 })); fm.castShadow = true
  tree.add(fm)
  tree.updateMatrix()
  FIG_FORCED.push({ x: x + tree.position.x, z: z + tree.position.z, y: gy })
}
function heroTree(away = -1) {
  // away：樹座標裡背對鏡頭的 z 方向；小枝往那邊長，才不會擋住停在枝上的動物
  const { len } = BRANCH
  const trunk = stick(0.26, 0.34, 7, BARK, [0, 7, 0], [0, 0, 0], 14)
  const pts = []
  for (let x = -0.25; x <= 2.95; x += 0.08) pts.push([x, limb.center(x), limb.z(x), limb.radius(x)])   // 從樹幹裡面開始長
  const branch = bough(pts)
  // 枝條末段分出幾根小枝，往外往上彎，末端是一小簇葉子（不再有直直戳上去的棍子）
  const g = new THREE.Group().add(trunk, branch)
  const twig = (x0, dir, up, L, r0, leaf) => {
    const y0 = limb.center(x0), z0 = limb.z(x0), q = []
    for (let k = 0; k <= 6; k++) {
      const f = k / 6
      q.push([x0 + L * f * 0.75, y0 + L * up * f * f + L * 0.15 * f, z0 + dir * L * f * 0.65, lerp(r0, r0 * 0.35, f)])
    }
    g.add(bough(q))
    // 小枝末端是鬆散的一叢葉子（只有葉片、沒有實心的球），沿小枝方向拉長、上下壓扁
    for (let k = 0; k < 2; k++) {
      const [lx, ly, lz] = q[4 + k * 2], m = new THREE.Mesh(leafCardGeometry(26, true), leafCardMaterial(0x5a9440))
      const r = leaf * (1 + k * 0.4)
      m.scale.set(r * 1.3, r * 0.8, r * 1.1); m.position.set(lx, ly + r * 0.2, lz); m.rotation.set(0.3 * k, k * 1.7, 0.2)
      g.add(m)
    }
  }
  // 動物停在 x ≈ 1.8～2.4，小枝長在靠樹幹那段和末端
  twig(1.0, away, 0.9, 0.7, 0.035, 0.22)
  twig(2.65, away * 0.8, 0.45, 0.5, 0.022, 0.18)
  twig(2.9, away * 0.3, 0.3, 0.4, 0.018, 0.16)
  const blob = (r, x, yy, z) => { const m = crownBlob(0x5a9440, r); m.position.set(x, yy, z); return m }
  g.add(blob(2.6, 0, 7.2, 0), blob(2.0, 1.6, 6.2, 0.6), blob(1.8, -1.4, 6.0, -0.5))
  g.traverse((o) => { if (o.isMesh) o.castShadow = o.receiveShadow = true })
  return g
}
function rock(r, seed) {
  const g = mergeVertices(new THREE.IcosahedronGeometry(1, 3).deleteAttribute('normal').deleteAttribute('uv'))
  const p = g.attributes.position, n = V(), cols = []
  const f = (n) => 1 + 0.13 * Math.sin(n.x * 3.1 + seed) * Math.cos(n.z * 2.7 - seed) + 0.06 * Math.sin(n.y * 7 + n.x * 5 + seed * 2)
  const base = new THREE.Color(0x8a857b), wet = new THREE.Color(0x4a4842), moss = new THREE.Color(0x6c7848), c = new THREE.Color()
  for (let i = 0; i < p.count; i++) {
    n.fromBufferAttribute(p, i).normalize()
    const k = f(n), y = n.y < -0.2 ? -0.2 + (n.y + 0.2) * 0.3 : n.y
    p.setXYZ(i, n.x * k * r, y * k * r * 0.45, n.z * k * r * 0.8)
    c.copy(base).lerp(wet, ss(-n.y, -0.2, 0.15)).lerp(moss, 0.6 * ss(n.y, 0.55, 0.8) * ss(Math.sin(n.x * 9 + seed) * Math.sin(n.z * 8), 0, 0.4))
    const gr = 0.92 + Math.random() * 0.16
    cols.push(c.r * gr, c.g * gr, c.b * gr)
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3))
  g.computeVertexNormals()
  const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }))
  m.castShadow = m.receiveShadow = true
  m.userData.top = r * 0.45 * f(V(0, 1, 0))
  return m
}

// 依鳥的資料把模型擺進溫室，回傳鏡頭要看的目標點與鏡頭位置
// def.y：腳下的高度（地面或水池底）；def.water：水面高度（涉水的鳥才用）
// 2026-11-10 玩家回饋（有在賞鳥的）：綠繡眼跟五色鳥遠看快一樣大。量了 69 種：早期的鳥放大約 2 倍（綠繡眼 3.5 倍、五色鳥 3 倍），
// 後來加的二十幾種幾乎是原尺寸（八色鳥 0.97、鴛鴦 1.0、鳳頭蒼鷹 1.04）——大小順序全亂了。
// 統一：遊戲裡的身長＝真實全長 × 放大倍數，30 公分以下一律 1.6 倍，越大的鳥倍數慢慢降到 80 公分時 1.25 倍（大小順序永遠跟真的一樣）。
// 放好之後量鳥自己座標系裡的身長（max(前後, 高)，直立的鷺、鴞、攀在樹幹上的看高度），照目標縮放。真實全長：台灣野鳥圖鑑常見值（公分，雉類、長尾鳥含尾）
export const REAL_CM = {
  sparrow: 14, dove: 30, heron: 49, whiteeye: 11, oriole: 26, babbler: 21, barbet: 20, kingfisher: 16, waterhen: 32, moorhen: 33,
  nightheron: 58, egret: 60, spoonbill: 76, mikado: 70, blackbulbul: 25, thrush: 30, treepie: 36, bulbul: 19, pheasant: 72, bluemagpie: 65,
  yuhina: 13, bushrobin: 13, yellowtit: 13, niltava: 18, flamecrest: 9, laughingthrush: 26, rosefinch: 16, goshawk: 42, woodowl: 50, serpenteagle: 70,
  mandarin: 45, spotbill: 60, partridge: 25, minivet: 18, pitta: 19, grassowl: 35, liocichla: 18, whitebrow: 15, bullfinch: 16, barwing: 19,
  islandthrush: 22, tit: 12, rustylt: 26, whitethroat: 28, hwamei: 23, styan: 18, scimitar: 25, fulvetta: 11, bamboo: 30, flowing: 14,
  bushwarbler: 13, cupwing: 9, shortwing: 13, scopsowl: 24, mtscops: 19, jacana: 45, psnipe: 25, woodcock: 34, shelduck: 64, pheron: 85,
  stilt: 36, harrier: 52, rnpheasant: 75, skylark: 16, cisticola: 10, nutcracker: 33, sibia: 24, finchbill: 22, nuthatch: 13, wbwood: 26,
  shoebill: 120, flamingo: 130, ajacana: 28, gallinule: 33, rspoonbill: 80, sarus: 160, redcrowned: 150, ruff: 29, lapwing: 30, grebe: 50,
  peregrine: 42, blackswift: 18, greatgreyowl: 68,   // 2026-11-13 瀑布區的三種（Pass 1D）   // 2026-11-11 世界濕地鳥（直立的看站高）
}
export const gameLen = (cm) => cm / 100 * lerp(1.6, 1.25, ss(cm, 30, 80))
const _fsInv = new THREE.Matrix4(), _fsV = V()
function bodyLen(o0) {
  o0.updateMatrixWorld(true); _fsInv.copy(o0.matrixWorld).invert()
  const box = new THREE.Box3()
  o0.traverseVisible((o) => {
    if (!o.isMesh || o.userData.catcher) return
    const p = o.geometry.attributes.position, step = Math.max(1, Math.floor(p.count / 3000))
    for (let i = 0; i < p.count; i += step) {
      if (o.isSkinnedMesh) o.getVertexPosition(i, _fsV); else _fsV.fromBufferAttribute(p, i)
      box.expandByPoint(_fsV.applyMatrix4(o.matrixWorld).applyMatrix4(_fsInv))
    }
  })
  return Math.max(box.max.z - box.min.z, box.max.y - box.min.y)
}
function fixSize(id, built) {
  const cm = REAL_CM[id]
  if (!cm) return
  const ms = built.birds ?? [built]
  const k = gameLen(cm) / bodyLen(ms[0].obj)
  if (!(k > 0) || Math.abs(k - 1) < 0.06) return
  for (const m of ms) m.obj.scale.multiplyScalar(k)
  built.sizeFix = k
}
export function placeAnimal(def, { strict = false } = {}) {
  const [x, z] = def.spot, gy = def.y ?? 0, waterY = def.water ?? -99
  const v = THREE.MathUtils.degToRad(def.view)
  const toCam = V(Math.sin(v), 0, Math.cos(v))     // 從動物指向鏡頭
  const side = V(toCam.z, 0, -toCam.x)              // 和視線垂直
  // 2026-11-10 樹上的鳥：自帶的那棵樹（樹幹在鳥的側邊 BRANCH.len）如果落在步道上，就換到另一側（五色鳥的樹幹插在路中間）
  if (def.perch === 'branch' && def.trunkBad?.(x - side.x * BRANCH.len, z - side.z * BRANCH.len)) side.negate()
  const g = new THREE.Group(), obj = new THREE.Group()
  g.position.set(x, gy, z); g.add(obj)
  // 朝向：沿著 side 方向，再往鏡頭轉 turn 弧度，看起來是四分之三側面
  const face = (s, turn) => { const d = side.clone().multiplyScalar(s * Math.cos(turn)).addScaledVector(toCam, Math.sin(turn)); return Math.atan2(d.x, d.z) }
  const env = { toCam, face, waterY, guide: !!def.guide }   // guide：圖鑑插圖（黑剪嘴鷗在圖鑑裡用站姿）
  // 游泳的鳥：目的地和游過去的路線都要在開闊水面（不撞山、不撞池邊的石頭）；def.swimOK 吃溫室座標
  if (def.swimOK) env.swimOK = (lx, lz, p) => { for (let k = 1; k <= 8; k++) if (!def.swimOK(x + lerp(p.x, lx, k / 8), z + lerp(p.y, lz, k / 8))) return true; return false }
  // 地上走的鳥：鳥群座標 (lx, lz) 的地面高度，相對鳥群原點（ground 鳥的 obj 沒有旋轉）
  if (def.patrol) env.patrol = def.patrol   // 在兩點之間來回走（山鷸）
  if (def.groundAt && def.perch === 'ground') env.groundAt = (lx, lz) => def.groundAt(x + lx, z + lz) - gy
  const target = V()
  let dist = 5.5, camH = 1.6

  if (def.perch === 'ground') {
    target.set(x, 1.0, z)
    dist = 6; camH = 1.8
  } else if (def.perch === 'branch') {
    const { len, y } = BRANCH
    const tree = heroTree(-1)   // 樹座標 +z 正好朝鏡頭
    // 樹幹放在動物的側邊，枝條朝動物伸過來
    tree.position.copy(side).multiplyScalar(-len)
    tree.rotation.y = Math.atan2(-side.z, side.x)
    g.add(tree)
    // 2026-11-10 樹幹是在鳥旁邊 2.6 公尺，那裡的地面可能比鳥的站點低（斜坡）→ 樹懸空（星鴉那棵浮了 2 公尺）：樹幹往下接到地面
    if (def.groundAt) {
      const gap = gy - def.groundAt(x + tree.position.x, z + tree.position.z)
      if (gap > 0.05) tree.add(stick(0.34, 0.38, gap + 0.5, BARK, [0, 0.2, 0], [0, 0, 0], 14))
    }
    if (def.onFig) dressFig(tree, x, z, gy)
    // obj 的 +x 就是枝條方向，原點在枝條的軸上
    obj.position.y = y
    obj.rotation.y = tree.rotation.y
    env.toCam = toCam.clone().applyAxisAngle(V(0, 1, 0), -obj.rotation.y)
    // 枝條表面的高度（obj 座標，s = 樹的 x - len）
    // z(s)：枝條中心左右微微彎（limb.z），鳥要站在正上方，不然會偏到枝條側面、腳踩空
    env.branch = { min: -len * 0.8, max: -0.18,   // max：2026-11-09 以前 0.15 超出枝條末端，鳥站在葉團上、腳踩空（藍鵲）
      top: (s) => limb.center(s + len) + limb.radius(s + len) - y, z: (s) => limb.z(s + len),
      // 點（obj 座標）到枝條表面的距離：正的是浮在外面、負的是陷進去
      gap: (px, py, pz) => { const x = px + len; return Math.hypot(py - (limb.center(x) - y), pz - limb.z(x)) - limb.radius(x) },
      side: (px, pz) => { const x = px + len; return Math.abs(pz - limb.z(x)) / limb.radius(x) } }   // 離枝條正上方多遠（半徑的倍數）
    env.waterLocal = waterY - gy - y   // 水面在 obj 座標的高度（翠鳥俯衝用）
    target.set(x, 3.6, z)
    dist = 5; camH = 3.4
  } else if (def.perch === 'snag') {
    // 2026-11-12 現成的枯枝（模型在別處，這裡不另外長樹）：def.limb = { dir: [dx, dz], r }；原點在枝條的軸上、obj 的 +x 沿著枝條
    const { dir, r } = def.limb
    obj.rotation.y = Math.atan2(-dir[1], dir[0])
    env.toCam = toCam.clone().applyAxisAngle(V(0, 1, 0), -obj.rotation.y)
    env.branch = { lock: true, min: -0.3, max: 0.3, top: () => r, z: () => 0, gap: (px, py, pz) => Math.hypot(py, pz) - r, side: (px, pz) => Math.abs(pz) / r }
    env.waterLocal = waterY - gy
    target.set(x, 0.4, z)
    dist = 6; camH = 0.6
  } else if (def.perch === 'fig') {
    // 2026-11-10 使用者：果樹上不要另外加一根枝，鳥直接站在雀榕真正的枝條上（world.js findFigPerch 用射線在掃描樹上量到的一段直枝：
    // 中點＝def.spot/def.y、方向 def.figDir、可走的半長 def.figLen、坡度 def.figSlope）
    const u = V(def.figDir[0], 0, def.figDir[1]).normalize(), up = V(0, 1, 0)
    obj.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(u, up, V().crossVectors(u, up)))
    env.toCam = toCam.clone().applyQuaternion(obj.quaternion.clone().invert())
    const L = def.figLen, k = def.figSlope ?? 0
    env.branch = { min: -L, max: L, lock: true, top: (s) => s * k, z: () => 0, gap: (px, py) => py - px * k, side: () => 0 }
    target.set(x, 0, z)
    dist = 3.6; camH = def.figCamH ?? -1.6
  } else if (def.perch === 'sacred') {
    // 2026-11-10 茶腹鳾搬到神木：直接貼在神木樹皮上（world.js 用射線量到的表面點＝def.spot/def.y、法線 def.normal）。
    // 借用停枝鳥的整套動作：把「枝條」轉成沿樹幹往下的直線——obj +x＝往下、+y＝朝外（鳥的背朝外、腳抓樹皮），沿 x 跳就是在樹幹上上下爬
    const n0 = (def.normal ? V(def.normal[0], 0, def.normal[1]) : toCam.clone()).normalize(), down = V(0, -1, 0)
    if (def.sacredUpright) {
      // 直立的模型（啄木鳥）：身體本來就是直的，不用翻倒——y 朝上、面向樹幹（-n），胸口貼樹皮所以整隻往外挪 sacredOff
      const tx = V().crossVectors(V(0, 1, 0), n0)
      obj.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(tx, V(0, 1, 0), n0))
      obj.position.copy(n0).multiplyScalar(def.sacredOff ?? 0.05)
      env.toCam = V(0, 0, -1)
      // gap 不給：腳是貼在垂直的樹皮上，不是踩在水平的枝上，不要用「腳底貼平」把整隻往上下推
      env.branch = { min: -0.15, max: 0.15, top: () => 0, z: () => 0, side: () => 0 }
      target.set(x, 0, z); dist = 4.6; camH = -0.7
    } else {
    // 身體繞著樹幹方向側翻一點、側面朝鏡頭（茶腹鳾抓樹皮時常側著身子、頭往外抬），不然從步道只看得到藍灰色的背
    const rollS = Math.sign(V().crossVectors(down, n0).dot(toCam)) || 1, n = n0.clone().applyAxisAngle(down, rollS * (def.sacredRoll ?? 0.7)), zz = V().crossVectors(down, n)
    obj.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(down, n, zz))
    env.toCam = V(0, 1, 0)   // 不要轉頭朝鏡頭（那樣只會看到背）：頭一定沿著樹幹朝上或朝下，從側面看得到側臉和過眼線
    env.branch = { min: -0.5, max: 0.5, top: () => 0, z: () => 0, gap: (px, py) => py, side: () => 0 }
    target.set(x, 0, z)
    dist = 4.6; camH = -0.7
    }
  } else if (def.perch === 'stem') {
    // 2026-11-10 棕扇尾鶯：停在一根高草莖的頂端（草莖被牠壓彎，頂端一小段幾乎是平的，腳抓在那裡），整根草跟著風輕輕晃；
    // 草莖底下是一叢草，草叢裡縫著牠的囊狀巢。st0：不動的草叢＋巢；st：會晃的草莖＋鳥（obj），以草莖底部為支點
    const H = def.stemH ?? 0.9
    const st0 = new THREE.Group(), st = new THREE.Group()
    st0.rotation.y = Math.atan2(-side.z, side.x); g.add(st0); st0.add(st)
    const lc = toCam.clone().applyAxisAngle(V(0, 1, 0), -st0.rotation.y)   // 草叢座標裡朝鏡頭的方向
    const curve = new THREE.CatmullRomCurve3([V(0, 0, 0), V(0.02, H * 0.45, 0), V(0.05, H * 0.86, 0), V(0.08, H - 0.008, 0), V(0.12, H, 0), V(0.17, H - 0.012, 0), V(0.22, H - 0.05, 0), V(0.25, H - 0.11, 0)])
    const SEG = 40, RAD = 6, tube = new THREE.TubeGeometry(curve, SEG, 0.0045, RAD, false), tp = tube.attributes.position, cp = V(), q = V()
    for (let i = 0; i < tp.count; i++) {   // 底下粗、往上漸細
      const ring = Math.floor(i / (RAD + 1)), u = ring / SEG
      curve.getPointAt(u, cp); q.fromBufferAttribute(tp, i).sub(cp).multiplyScalar(lerp(1.5, 0.55, u)).add(cp); tp.setXYZ(i, q.x, q.y, q.z)
    }
    tube.computeVertexNormals()
    const stalk = new THREE.Mesh(tube, mat(0xa89a62, 0.85)); stalk.castShadow = true
    st.add(stalk)
    // 草穗：草莖末端垂下的一串小穗
    const ears = []
    for (let i = 0; i < 14; i++) {
      const u = 0.86 + i / 14 * 0.14, p = curve.getPointAt(u)
      const e = new THREE.SphereGeometry(1, 5, 4); e.scale(0.004, 0.011, 0.004); e.rotateZ((Math.random() - 0.5) * 1.2); e.rotateX((Math.random() - 0.5) * 1.2)
      e.translate(p.x + (Math.random() - 0.5) * 0.012, p.y - 0.008, p.z + (Math.random() - 0.5) * 0.012); ears.push(e)
    }
    const ear = new THREE.Mesh(mergeGeometries(ears), mat(0x9b875a, 0.9)); ear.castShadow = true; st.add(ear)
    // 草叢：一圈細長的草葉（雙面），高 0.3～0.7 公尺
    st0.add(grassTuft(120, 0.22, 0.35, 0.8, (x, z) => x * lc.x + z * lc.z > 0.05))   // 鏡頭那側留空，看得到巢
    // 囊狀巢：梨形、用蛛絲把活的草葉縫在一起，入口在上面側邊（朝鏡頭）
    const prof = []
    for (let i = 0; i <= 12; i++) { const t = i / 12, y = t * 0.13; prof.push(new THREE.Vector2(0.004 + 0.042 * Math.sin(Math.PI * Math.pow(t, 0.8)) * (1 - 0.35 * t), y)) }
    const pouch = new THREE.Mesh(colorize(new THREE.LatheGeometry(prof, 18), (c, x, y, z) => c.setHex(STRAW[Math.abs(Math.floor(y * 400 + Math.atan2(z, x) * 5)) % 4]).lerp(new THREE.Color(0xd8d8cc), Math.random() * 0.25)),
      new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }))
    const hole = new THREE.Mesh(new THREE.CircleGeometry(0.016, 14), mat(0x1a140c, 1))
    hole.position.set(lc.x * 0.034, 0.1, lc.z * 0.034); hole.lookAt(lc.x, 0.1, lc.z); hole.rotateX(-0.35)
    const nest = new THREE.Group(); nest.add(pouch, hole)
    nest.position.set(lc.x * 0.1 - 0.03, 0.2, lc.z * 0.1); nest.rotation.z = 0.08
    nest.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.userData.noBake = true } })
    st0.add(nest)
    obj.position.set(0.12, H + 0.004, 0); st.add(obj)
    env.toCam = lc.clone()
    env.branch = { min: -0.004, max: 0.004, lock: true, top: () => 0, z: () => 0, gap: (px, py) => py, side: () => 0 }
    env.sway = (t) => { st.rotation.z = 0.035 * Math.sin(t * 1.3) + 0.015 * Math.sin(t * 3.1 + 1); st.rotation.x = 0.025 * Math.sin(t * 1.7 + 2) }
    target.set(x, H * 0.8, z)
    dist = 3.2; camH = 1.25
  } else if (def.perch === 'trunk') {
    const R = 0.42
    const trunk = stick(R * 0.95, R * 1.08, 8, BARK, [0, 8, 0], [0, 0, 0], 16)
    const crown = crownBlob(0x55903c, 3); crown.position.y = 8.6
    g.add(trunk, crown)
    obj.rotation.y = Math.atan2(toCam.x, toCam.z)   // obj 的 +z 朝鏡頭
    env.trunk = { R, arc: 0.16 }
    target.set(x + toCam.x * R, 1.6, z + toCam.z * R)
    dist = 4.2; camH = 1.8
  } else if (def.perch === 'rock') {
    const r1 = rock(1.1, 1.3), r2 = rock(0.8, 4.1)
    r1.position.y = waterY
    r2.position.set(side.x * 1.9 - toCam.x * 0.8, waterY, side.z * 1.9 - toCam.z * 0.8)
    g.add(r1, r2)
    env.rockTop = waterY + r1.userData.top - 0.02
    env.rocks = [{ x: 0, z: 0, r: 1.1 }, { x: r2.position.x, z: r2.position.z, r: 0.8 }]
    target.set(x, 0.8, z)
    dist = 5.2; camH = 2.4
  }
  // 溫室裡鏡頭可以靠近一點（校園版放大過的鳥，在這裡從 6 公尺外看太小）
  if (def.dist) dist = def.dist
  if (def.camH) camH = def.camH
  if (def.lookY != null) target.y = def.lookY
  target.y += gy
  // 跟拍：鏡頭和目標一起跟著鳥平移（量的是鳥現在在哪、相對於站點中心），鳥在畫面上的位置和大小都不變。
  // 一群鳥：寬螢幕跟整群的中心；手機（lead）跟其中一隻，整群放不下
  const base = target.clone(), f0 = V(), fw = V()
  const cam = base.clone().addScaledVector(toCam, dist)
  cam.y = gy + camH
  const baseCam = cam.clone()
  // 2026-11-11 串流載入：站點、樹、鏡頭位置上面都算好了；鳥的模型還沒載到就先放一個空的替身（pending），載到再呼叫 rec.finish() 換上真的
  const stub = { obj: new THREE.Group(), update() {}, focus: V(0, 0.1, 0) }
  const rec = { group: g, update: () => {}, target, cam, built: stub, pending: true, need: null }
  rec.finish = () => {
    // 有的鳥先開「展示導演」才複製模型：模型沒載到中途丟出去的話，把剛登記的導演收回來（不然每重蓋一次多一個空的）
    const nShow = SHOWS.length
    let built
    try { built = BUILD[def.id](env) } catch (e) { SHOWS.length = nShow; throw e }   // 模型還沒載到會丟 MissingModel（下面接）
    obj.remove(stub.obj)
    obj.add(built.obj)
    if (built.extra) obj.add(built.extra)
    // 動物本身不接收陰影（停在樹蔭下也要看得清楚），也不烘進地面
    built.obj.traverse((o) => { if (o.isMesh) { o.receiveShadow = !!o.userData.catcher; o.userData.noBake = true } })
    g.updateMatrixWorld(true)
    built.update(0, 0.016)
    g.updateMatrixWorld(true)
    fixSize(def.id, built)
    obj.localToWorld(f0.set(0, built.focus.y, 0))
    rec.built = built; rec.pending = false; rec.need = null
    rec.update = (t, dt, phone = false) => {
      env.sway?.(t)
      built.update(t, dt)
      obj.updateMatrixWorld()
      obj.localToWorld(fw.copy(phone && built.lead ? built.lead : built.focus)).sub(f0)
      fw.y *= 0.3
      target.copy(base).add(fw)
      cam.copy(baseCam).add(fw)
    }
  }
  obj.add(stub.obj)
  try { rec.finish() } catch (e) { if (strict || !(e instanceof MissingModel)) throw e; rec.need = e.model }
  return rec
}
