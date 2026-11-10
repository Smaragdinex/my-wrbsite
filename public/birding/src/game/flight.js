// 鳥會怕人：玩家靠太近（跑過來、站著不動、蹲低慢慢靠近的距離都不一樣），鳥就照牠真實的習性逃走——
// 會飛的起飛、飛到遠處躲起來，等玩家走開再飛回原本的地方降落；帝雉、小彎嘴用跑的；紅冠水雞、白腹秧雞游開。
// 飛的時候換成另一個翅膀張開的模型（ChatGPT 畫飛行姿勢 → Tripo → tools/rig-distance.py 的 fly 骨架：body、head、tail、wingL/R、wingtipL/R）。
import * as THREE from 'three'
import { rigged, AX, hasModel } from '../birds.js'
import { terrainHeight as gardenH, domeRho, domeY, mtnBase, MTN, inAlpine, alpineHeight } from '../layout.js'
// 地面高度：山區查山區的地形（不然鳥會飛進山坡裡）
const terrainHeight = (x, z) => inAlpine(x, z) ? alpineHeight(x, z) : gardenH(x, z)

const { clamp, lerp, smoothstep: ss, randFloat: rnd } = THREE.MathUtils
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z)
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a))
const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt))

// 每種鳥：r 驚飛距離（公尺，走路靠近時）；fly 飛行（speed 公尺/秒、hz 拍翅頻率、style：flap 一直拍、bound 拍幾下收翅滑一段（雀類波浪飛）、glide 慢拍＋長滑翔（鷺）、
// （2026-11-09 新加的 14 隻：k ＝ 站姿模型的身長 × 真實的翼展／身長比，例如八色鳥 2、鴨 1.5、雉 1.1）
// k 飛行模型縮放（tools/fly-points.py 擺正後翼展約 1；和停棲模型並排比頭的大小定的），名稱照 models/birds/<id>-fly-rig.glb）；run 用跑的（速度倍數）；swim 游開
export const ESCAPE = {
  sparrow: { r: 5, fly: { speed: 8, hz: 13, style: 'bound', k: 0.58 } },
  whiteeye: { r: 5, fly: { speed: 7, hz: 14, style: 'bound', k: 0.8 } },
  bulbul: { r: 6, fly: { speed: 8, hz: 11, style: 'bound', k: 0.78 } },
  blackbulbul: { r: 6, fly: { speed: 8, hz: 11, style: 'bound', k: 0.88 } },
  barbet: { r: 7, fly: { speed: 8, hz: 10, style: 'bound', k: 1.1 } },
  dove: { r: 6, fly: { speed: 10, hz: 8, style: 'flap', k: 1.15 } },
  treepie: { r: 8, fly: { speed: 8, hz: 7, style: 'glide', k: 1.2 } },
  bluemagpie: { r: 9, fly: { speed: 8, hz: 6, style: 'glide', k: 1.35 } },
  kingfisher: { r: 10, fly: { speed: 11, hz: 12, style: 'flap', k: 0.82 } },
  egret: { r: 11, fly: { speed: 7, hz: 3.2, style: 'glide', k: 2.2 } },
  nightheron: { r: 9, fly: { speed: 7, hz: 3.5, style: 'glide', k: 1.9 } },
  heron: { r: 6, fly: { speed: 6, hz: 3.2, style: 'glide', k: 1.95 } },   // 黑冠麻鷺出了名的不怕人
  spoonbill: { r: 12, fly: { speed: 7, hz: 3, style: 'glide', k: 2.3 } },
  thrush: { r: 7, fly: { speed: 9, hz: 9, style: 'flap', k: 0.95 } },
  oriole: { r: 8, fly: { speed: 9, hz: 8, style: 'bound', k: 1.07 } },
  mikado: { r: 8, run: 7, fly: { speed: 9, hz: 9, style: 'glide', k: 1.49 } },   // 2026-11-09 雉類：平常用跑的，被逼急才「噗嚕嚕」快拍幾下滑到樹上
  pheasant: { r: 8, run: 7, fly: { speed: 9, hz: 9, style: 'glide', k: 1.18 } },
  babbler: { r: 5, run: 5, fly: { speed: 6, hz: 11, style: 'flap', k: 0.556 } },
  // 高山區 8 種（2026-11-07 飛行模型；k ≈ 停棲模型縮放 × 1.8，翼展約是身長的 1.6～1.8 倍）
  flamecrest: { r: 5, fly: { speed: 7, hz: 15, style: 'bound', k: 0.47 } },
  yuhina: { r: 5, fly: { speed: 7, hz: 14, style: 'bound', k: 0.54 } },
  yellowtit: { r: 6, fly: { speed: 7, hz: 13, style: 'bound', k: 0.65 } },
  niltava: { r: 7, fly: { speed: 8, hz: 11, style: 'flap', k: 0.8 } },
  sibia: { r: 7, fly: { speed: 8, hz: 9, style: 'bound', k: 1.0 } },
  goshawk: { r: 12, fly: { speed: 11, hz: 5, style: 'glide', k: 0.85 } },   // 2026-11-08 猛禽：翼展約 85 公分、拍幾下就滑翔
  woodowl: { r: 8, fly: { speed: 7, hz: 3.5, style: 'glide', k: 0.95 } },   // 褐林鴞翼展約 1 公尺，飛得慢、很安靜
  bushrobin: { r: 4, fly: { speed: 7, hz: 13, style: 'flap', k: 0.47 } },   // 不太怕人
  rosefinch: { r: 6, fly: { speed: 8, hz: 12, style: 'bound', k: 0.49 } },
  laughingthrush: { r: 3.5, run: 5, fly: { speed: 6, hz: 10, style: 'flap', k: 0.509 } },                                   // 出了名的親人，靠太近才跑開
  moorhen: { r: 9, swim: 5, fly: { speed: 7, hz: 7, style: 'flap', k: 1.12 } },   // 秧雞飛的時候腳拖在後面（飛行模型照這樣畫的）
  mandarin: { r: 12, swim: 5, fly: { speed: 12, hz: 6, style: 'flap', k: 0.773 } },      // 2026-11-09：鴛鴦很怕人
  spotbill: { r: 10, swim: 5, fly: { speed: 12, hz: 5.5, style: 'flap', k: 1.0 } },
  partridge: { r: 7, run: 6, fly: { speed: 8, hz: 14, style: 'glide', k: 0.412 } },       // 林下三五成群，受驚快步跑進灌叢，逼急了才飛
  pitta: { r: 7, run: 5, fly: { speed: 7, hz: 11, style: 'flap', k: 0.43 } },
  shelduck: { r: 12, swim: 5, fly: { speed: 12, hz: 5, style: 'flap', k: 1.2 } },
  pheron: { r: 12, fly: { speed: 7, hz: 3, style: 'glide', k: 2.2 } },
  stilt: { r: 9, fly: { speed: 9, hz: 6, style: 'flap', k: 0.95 } },
  harrier: { r: 14, fly: { speed: 9, hz: 3.5, style: 'glide', k: 1.35 } },
  wbwood: { r: 8, fly: { speed: 8, hz: 9, style: 'bound', k: 0.42 } },
  nutcracker: { r: 10, fly: { speed: 9, hz: 5, style: 'glide', k: 0.55 } },
  rnpheasant: { r: 7, run: 3, fly: { speed: 9, hz: 10, style: 'flap', k: 1.2 } },
  skylark: { r: 5, fly: { speed: 7, hz: 9, style: 'flap', k: 0.42 } },
  cisticola: { r: 4, fly: { speed: 6, hz: 12, style: 'bound', k: 0.3 } },
  woodcock: { r: 4, fly: { speed: 7, hz: 9, style: 'flap', k: 0.55 } },   // 2026-11-10 山鷸：不太怕人，靠很近才「咻咻」飛起
  jacana: { r: 7, fly: { speed: 7, hz: 5, style: 'glide', k: 0.58 } },   // 2026-11-10 水雉：翅膀幾乎全白，飛起來長腳往後伸
  psnipe: { r: 5, run: 4, fly: { speed: 7, hz: 7, style: 'flap', k: 0.45 } },
  scopsowl: { r: 5, fly: { speed: 7, hz: 5, style: 'glide', k: 0.43 } },   // 2026-11-09 領角鴞：不太怕人，翅膀寬圓、飛得慢又安靜
  mtscops: { r: 5, fly: { speed: 6.5, hz: 6, style: 'glide', k: 0.35 } },
  grassowl: { r: 6, run: 3, fly: { speed: 6, hz: 3.5, style: 'glide', k: 1.01 } },
  nuthatch: { r: 5, fly: { speed: 7, hz: 14, style: 'bound', k: 0.26 } },
  finchbill: { r: 6, fly: { speed: 8, hz: 11, style: 'bound', k: 0.368 } },
  minivet: { r: 7, fly: { speed: 8, hz: 10, style: 'flap', k: 0.294 } },
  waterhen: { r: 9, swim: 5, fly: { speed: 7, hz: 7, style: 'flap', k: 1.07 } },
  // 2026-11-09 台灣特有種 17 種（k ≈ 停棲模型縮放 × 1.5）
  liocichla: { r: 4, fly: { speed: 7, hz: 12, style: 'flap', k: 0.506 } },   // 很親人
  whitebrow: { r: 5, fly: { speed: 7, hz: 13, style: 'flap', k: 0.413 } },
  bullfinch: { r: 5, fly: { speed: 8, hz: 11, style: 'bound', k: 0.484 } },   // 動作慢、不太怕人
  barwing: { r: 6, fly: { speed: 7, hz: 11, style: 'flap', k: 0.508 } },
  islandthrush: { r: 10, fly: { speed: 10, hz: 9, style: 'flap', k: 0.553 } },   // 非常警覺
  tit: { r: 6, fly: { speed: 7, hz: 14, style: 'bound', k: 0.415 } },
  rustylt: { r: 8, run: 5, fly: { speed: 7, hz: 10, style: 'flap', k: 0.677 } },   // 害羞，先跑進灌叢
  whitethroat: { r: 7, run: 5, fly: { speed: 7, hz: 10, style: 'flap', k: 0.629 } },
  hwamei: { r: 8, run: 5, fly: { speed: 7, hz: 10, style: 'flap', k: 0.597 } },
  styan: { r: 7, fly: { speed: 9, hz: 9, style: 'bound', k: 0.518 } },
  scimitar: { r: 7, run: 5, fly: { speed: 7, hz: 10, style: 'flap', k: 0.654 } },
  fulvetta: { r: 5, fly: { speed: 7, hz: 14, style: 'bound', k: 0.437 } },
  bamboo: { r: 7, run: 6, fly: { speed: 8, hz: 14, style: 'glide', k: 0.515 } },   // 受驚先快跑，逼急了才飛
  flowing: { r: 5, fly: { speed: 7, hz: 15, style: 'bound', k: 0.446 } },
  bushwarbler: { r: 6, run: 4, fly: { speed: 6, hz: 14, style: 'flap', k: 0.447 } },   // 很會躲
  cupwing: { r: 5, run: 4, fly: { speed: 5, hz: 16, style: 'flap', k: 0.254 } },
  shortwing: { r: 7, run: 4, fly: { speed: 6, hz: 14, style: 'flap', k: 0.290 } },   // 翅膀短，不太愛飛
}
// 飛行模型（存在才用；還沒做好的先借翠鳥的飛行模型，大小照停棲模型的身高換算）
const FLY_NAME = (id) => `${id}-fly-rig`
export const flyModels = () => Object.keys(ESCAPE).filter((id) => ESCAPE[id].fly?.k && id !== 'kingfisher').map(FLY_NAME)   // 沒有 k 的還沒做飛行模型，不去載

const _v = V(), _w = V(), _box = new THREE.Box3(), _q = new THREE.Quaternion()

// 一隻飛行中的鳥：外層 root 管位置和航向（YXZ：先轉航向、再俯仰、最後側傾），inner 讓 Tripo 模型（頭朝 -x）頭朝 +z
function makeFlier(id, perchH) {
  const own = hasModel(FLY_NAME(id)), r = rigged(own ? FLY_NAME(id) : 'kingfisher-fly-rig')
  const root = new THREE.Group(), inner = new THREE.Group()
  root.rotation.order = 'YXZ'
  inner.rotation.y = Math.PI / 2
  inner.add(r.model); root.add(inner)
  // Tripo 的白色、灰色羽毛貼圖帶半透明（小白鷺、夜鷺會變成半透明），一律畫成不透明
  r.model.traverse((o) => { if (o.isMesh) { o.material.transparent = false; o.material.opacity = 1; o.material.depthWrite = true } })
  // 縮放：有自己的飛行模型用表裡的 k；借用的先用停棲模型高度粗估（之後用 tools/compare-scale.py 對齊）
  r.model.updateMatrixWorld(true)
  _box.setFromObject(r.model)
  const size = _box.getSize(V()), c = _box.getCenter(V())
  const k = ESCAPE[id].fly.k ?? (perchH * 2.2) / Math.max(size.x, size.z)
  r.model.scale.setScalar(k)
  r.model.position.copy(c).multiplyScalar(-k)   // 身體中心在原點
  root.visible = false
  return { root, r }
}

// 從鳥（一群就是每一隻）找出 { obj, acts, hopper, walker }，把牠的 update 包起來：飛走的時候凍結原本的動畫
function membersOf(b) { return b.built.birds ?? [b.built] }

export function createFlight(world, player) {
  const { scene } = world
  const units = []   // 一個站點一組
  for (const b of world.birds) {
    const esc = ESCAPE[b.def.id]
    if (!esc) continue
    const ms = membersOf(b).map((m) => {
      const s = { m, mode: 'perch', home: V(), from: V(), curve: null, len: 0, dist: 0, t: 0, wait: 0, delay: 0, head: 0, roll: 0, pitch: 0, phase: Math.random() * 6, act: '' }
      if (esc.fly) {
        m.obj.updateMatrixWorld(true)
        _box.setFromObject(m.obj)
        const f = makeFlier(b.def.id, _box.getSize(_v).y)
        scene.add(f.root)
        Object.assign(s, f)
      }
      // 原本的 update：perch 以外都不跑（停在原地、不再動）
      const orig = m.update
      m.update = (t, dt) => { if (s.mode === 'perch' || s.mode === 'flee') orig(t, dt) }
      m.flight = s
      return s
    })
    units.push({ b, esc, ms, alarm: 0, calm: 0, state: 'home', home: b.target.clone(), base: { ...b.def } })
  }

  // 玩家速度（用鏡頭位置差算）、蹲低
  const last = V().copy(world.camera.position)
  let speed = 0

  /* ---------- 飛行路線 ---------- */
  // 飛到遠處的避難點：往背離玩家的方向（左右亂偏一點），30～45 公尺外、離地 9～14 公尺；不能穿過山、不能出溫室
  const blockedPath = (curve) => {
    for (let i = 1; i <= 24; i++) {
      const p = curve.getPoint(i / 24)
      const rh = Math.hypot(p.x - MTN.x, p.z - MTN.z)
      if (p.y < MTN.h + 4 && rh < mtnBase(Math.max(0, p.y)) + 5) return true
      if (domeRho(p.x, p.z) > 0.9 || p.y > domeY(p.x, p.z) - 3) return true
      if (p.y < terrainHeight(p.x, p.z) + 0.3 && i > 3 && i < 21) return true
    }
    return false
  }
  // short：地上的鳥被逼到很近才起飛，只飛一小段（10～18 公尺）到旁邊的樹上（離地 4～8 公尺）躲著
  function outbound(S, away, flock, short = false) {
    for (let i = 0; i < 60; i++) {
      const a = Math.atan2(away.x, away.z) + rnd(-0.6, 0.6) * (1 + i / 20)
      const d = V(Math.sin(a), 0, Math.cos(a)), dist = short ? rnd(10, 18) : rnd(30, 45)
      const F = flock?.F.clone() ?? S.clone().addScaledVector(d, dist)
      if (!flock) F.y = short ? terrainHeight(F.x, F.z) + rnd(4, 8) : Math.max(terrainHeight(F.x, F.z) + rnd(9, 14), S.y + 5)
      else F.add(V(rnd(-1.5, 1.5), rnd(-1, 1), rnd(-1.5, 1.5)))
      const dir = F.clone().sub(S).setY(0).normalize()
      const curve = new THREE.CubicBezierCurve3(S.clone(), S.clone().addScaledVector(dir, 2.5).add(V(0, 3, 0)), F.clone().addScaledVector(dir, short ? -4 : -10), F)
      if (!blockedPath(curve)) return curve
      if (flock) flock = null
    }
    // 找不到：往上飛
    return new THREE.CubicBezierCurve3(S.clone(), S.clone().add(V(0, 3, 0)), S.clone().add(V(0, 9, 0)), S.clone().add(V(0, 12, 0)))
  }
  // 回家：從避難點飛回來，最後從斜上方、正前方滑進原本的位置
  function inbound(F, S, faceH) {
    const fwd = V(Math.sin(faceH), 0, Math.cos(faceH))
    const dir = S.clone().sub(F).setY(0).normalize()
    // 從鳥原本面對的方向的反方向進場（落地後剛好面向原本的方向），但不要從玩家身上穿過去
    const app = fwd.clone().multiplyScalar(0.5).add(dir).normalize()
    return new THREE.CubicBezierCurve3(F.clone(), F.clone().addScaledVector(dir, 10), S.clone().addScaledVector(app, -4).add(V(0, 2.2, 0)), S.clone())
  }

  /* ---------- 驚飛 ---------- */
  function flush(u, t, short = false) {
    u.state = 'away'
    const P = world.camera.position
    if (u.esc.fly) {
      for (const s of u.ms) restoreWalker(s)   // 剛剛在跑：起飛前把走路速度還原（落地後照平常走）
      let flock = null
      u.ms.forEach((s, i) => {
        const m = s.m
        m.obj.updateMatrixWorld(true)
        _box.setFromObject(m.obj)
        _box.getCenter(s.home)
        m.obj.getWorldDirection(_w); s.faceH = Math.atan2(_w.x, _w.z)
        const away = s.home.clone().sub(P).setY(0)
        if (away.lengthSq() < 1e-4) away.set(1, 0, 0)
        s.curve = outbound(s.home, away.normalize(), flock, short)
        flock ??= { F: s.curve.v3 }
        s.len = s.curve.getLength(); s.dist = 0; s.t = 0
        s.delay = i === 0 ? 0 : rnd(0.05, 0.45)   // 一群裡第一隻先飛，其他跟著
        s.mode = 'wait'; s.head = s.faceH
        s.wait = short ? rnd(12, 25) : rnd(20, 38)
      })
    } else {
      u.ms.forEach((s) => fleeOnGround(u, s))
    }
  }
  const restoreWalker = (s) => { const w = s.m.walker; if (w && s.mode === 'flee') { w.speed = s.speed0; w.turn = s.turn0; s.mode = 'perch'; s.act = '' } }
  // 跑或游開：目的地在背離玩家的方向 2～3 公尺（游泳的要在開闊水面）；會飛的地上鳥沒有 run/swim 就用跳的（走路速度 2.5 倍）
  function fleeOnGround(u, s) {
    const m = s.m, w = m.walker
    if (!w) return
    if (s.mode !== 'flee') { s.speed0 = w.speed; s.turn0 = w.turn; s.radius0 = w.radius }
    s.mode = 'flee'
    w.speed = s.speed0 * (u.esc.run ?? u.esc.swim ?? 2.5); w.turn = 7
    const g = u.b.group.position, P = world.camera.position
    const a0 = Math.atan2(g.x + w.p.x - P.x, g.z + w.p.y - P.z)
    m.acts.next('walk')
    for (let i = 0; i < 24; i++) {
      const a = a0 + (i % 2 ? 1 : -1) * Math.floor((i + 1) / 2) * 0.35
      const d = rnd(2.2, 3.2)
      let x = w.p.x + Math.sin(a) * d, z = w.p.y + Math.cos(a) * d
      const rr = Math.hypot(x - w.center[0], z - w.center[1]), lim = s.radius0 * 2.2 + 1
      if (rr > lim) { x = w.center[0] + (x - w.center[0]) * lim / rr; z = w.center[1] + (z - w.center[1]) * lim / rr }
      if (w.avoid?.(x, z, w.p)) continue
      w.goal = new THREE.Vector2(x, z); w.want = null
      return
    }
  }

  /* ---------- 每格 ---------- */
  function flyStep(u, s, t, dt) {
    const f = u.esc.fly, root = s.root
    if (s.mode === 'wait') {
      if ((s.delay -= dt) > 0) return
      // 起飛：停棲的模型藏起來、換飛行模型
      s.m.obj.visible = false; root.visible = true
      root.position.copy(s.home); s.mode = 'out'; s.t = 0
    }
    if (s.mode === 'away') {
      s.wait -= dt
      const far = world.camera.position.distanceTo(s.home) > u.esc.r * 1.8
      if (s.wait <= 0 && far) {
        s.curve = inbound(s.curve.v3, s.home, s.faceH); s.len = s.curve.getLength(); s.dist = 0; s.t = 0
        s.mode = 'back'; root.visible = true
      }
      return
    }
    s.t += dt
    const rem = s.len - s.dist
    // 速度：起飛慢慢加速；回程最後幾公尺減速、拉起機頭（煞車）
    const v = s.mode === 'out' ? f.speed * Math.min(1, 0.3 + s.t / 1.2) : f.speed * clamp(rem / 6, 0.12, 1)
    s.dist = Math.min(s.len, s.dist + v * dt)
    const k = s.dist / s.len
    s.curve.getPointAt(k, root.position)
    s.curve.getTangentAt(Math.min(k, 0.999), _v)
    const h = Math.atan2(_v.x, _v.z)
    const dh = wrap(h - s.head)
    s.head += dh * (1 - Math.exp(-6 * dt))
    s.roll = damp(s.roll, clamp(-dh * 2.2, -0.7, 0.7), 4, dt)
    const flare = s.mode === 'back' ? ss(1 - rem / 3, 0, 1) : 0
    s.pitch = damp(s.pitch, -Math.asin(clamp(_v.y, -1, 1)) * 0.7 - 0.7 * flare, 6, dt)
    root.rotation.set(s.pitch, s.head, s.roll)
    s.act = s.mode === 'out' && s.t < 1.2 ? 'takeoff' : flare > 0.05 ? 'land' : 'fly'
    wings(s, f, t, dt, s.mode === 'out' ? 1 - ss(s.t, 0.3, 1.6) : 0, flare)
    if (s.dist >= s.len) {
      if (s.mode === 'out') { s.mode = 'away'; root.visible = false }
      else {
        // 落地：換回停棲模型，原本的動畫接著跑
        s.mode = 'perch'; root.visible = false; s.m.obj.visible = true
        if (s.m.hopper) s.m.hopper.landed = 0
      }
    }
  }
  // 翅膀：繞身體前後軸上下拍（AX.x），翼尖慢一點跟上；takeoff（0～1）拍得最用力；flare 落地前翅膀往前張開煞車
  function wings(s, f, t, dt, takeoff, flare) {
    const r = s.r
    r.reset()
    // 拍翅節奏：bound 拍 0.5 秒、收翅 0.35 秒；glide 拍 3～4 下、滑 1.5 秒；起飛和降落一直拍
    let beat = 1, fold = 0
    const cyc = (s.t + s.phase)
    if (f.style === 'bound' && !takeoff && !flare) { const c = cyc % 0.85; beat = c < 0.5 ? 1 : 0; fold = ss(c, 0.5, 0.58) * (1 - ss(c, 0.78, 0.85)) }
    if (f.style === 'glide' && !takeoff && !flare) { const c = cyc % (3.5 / f.hz + 1.5); beat = c < 3.5 / f.hz ? 1 : 0 }
    s.beat = damp(s.beat ?? 1, beat, 10, dt)
    const hz = f.hz * (1 + 0.25 * takeoff + 0.3 * flare)
    s.phase2 = (s.phase2 ?? 0) + hz * Math.PI * 2 * dt
    const A = (0.55 + 0.35 * takeoff + 0.3 * flare) * s.beat
    const a = A * Math.sin(s.phase2) + 0.1 * A, a2 = A * Math.sin(s.phase2 - 0.9)
    const sweep = 0.9 * fold - 0.35 * flare
    for (const [n, sg] of [['L', 1], ['R', -1]]) {
      r.turn('wing' + n, AX.y, sg * sweep); r.turn('wingtip' + n, AX.y, sg * sweep * 0.8)
      r.turn('wing' + n, AX.x, -sg * a); r.turn('wingtip' + n, AX.x, -sg * a2 * 0.7)
    }
    r.turn('tail', AX.z, -0.4 * flare)
  }

  function tick(t, dt, { sneak = false } = {}) {
    const P = world.camera.position
    speed = damp(speed, P.distanceTo(last) / Math.max(dt, 1e-3), 8, dt)
    last.copy(P)
    // 玩家越快越容易驚動；蹲低慢慢走只有一半距離；站著不動也會被注意到，但比較近才會
    const mult = sneak ? 0.5 : speed > 6 ? 1.5 : speed > 0.6 ? 1 : 0.7
    for (const u of units) {
      if (u.b.absent) continue   // 這個時段不在（main.js presence）
      if (u.state === 'home') {
        let d = Infinity
        for (const s of u.ms) { s.m.obj.getWorldPosition(_v); d = Math.min(d, _v.distanceTo(P)) }
        const R = u.esc.r * mult
        // 警戒值：靠得越近漲得越快（距離 R 不漲、0.7R 一秒、0.5R 三分之一秒），走遠就慢慢消
        if (d < R) u.alarm += dt * Math.min(10, (R / d) ** 2 - 1)
        else u.alarm = Math.max(0, u.alarm - dt * 0.4)
        // 2026-11-09 使用者：不怕人的先跳開，人真的很近才飛一下到樹上。地上走的鳥（有 walker）先跑／跳／游開（'ground'），
        // 玩家還是逼到 near（預設驚飛距離的一半）以內才起飛、只飛到旁邊的樹上；停在樹上的鳥照舊直接飛走
        if (u.alarm >= 1) {
          u.alarm = 0
          if (u.esc.fly && u.ms.some((s) => s.m.walker)) { u.state = 'ground'; u.calm = 0; for (const s of u.ms) fleeOnGround(u, s) }
          else flush(u, t)
        }
      } else if (u.state === 'ground') {
        let d = Infinity
        for (const s of u.ms) { s.m.obj.getWorldPosition(_v); d = Math.min(d, _v.distanceTo(P)) }
        // 慢慢走過去：牠一直往後退、保持距離（跑回家附近的範圍內，退到底被追上才飛）；用跑的衝過來（> 4 m/s），還有 0.7 倍距離就起飛
        const near = speed > 4 ? u.esc.r * 0.7 : (u.esc.near ?? u.esc.r * 0.45) * mult
        if (d < near) { flush(u, t, true); continue }
        u.calm = d > u.esc.r * mult * 1.3 ? u.calm + dt : 0
        for (const s of u.ms) { if (s.m.walker && !s.m.walker.goal && u.calm < 1.5) fleeOnGround(u, s); s.act = 'run' }
        if (u.calm > 4) { for (const s of u.ms) restoreWalker(s); u.state = 'home'; u.alarm = 0 }
      } else if (u.esc.fly) {
        for (const s of u.ms) if (s.mode !== 'perch') flyStep(u, s, t, dt)
        if (u.ms.every((s) => s.mode === 'perch')) u.state = 'home'
      } else {
        // 跑／游：到了目的地玩家還很近就再逃一次；遠了就慢下來、恢復平常的範圍
        let d = Infinity
        for (const s of u.ms) { s.m.obj.getWorldPosition(_v); d = Math.min(d, _v.distanceTo(P)) }
        u.calm = d > u.esc.r * mult * 1.3 ? u.calm + dt : 0
        for (const s of u.ms) {
          const w = s.m.walker
          if (!w) continue
          if (!w.goal && u.calm < 1.5) fleeOnGround(u, s)
          s.act = 'run'
        }
        if (u.calm > 4) {
          for (const s of u.ms) if (s.m.walker && s.mode === 'flee') { const w = s.m.walker; w.speed = s.speed0; w.turn = s.turn0; s.mode = 'perch'; s.act = '' }
          u.state = 'home'; u.alarm = 0
        }
      }
    }
  }
  // 拍照用：這隻鳥現在畫面上是哪個物件、在做什麼（飛行中是飛行模型；飛遠躲起來的不算）
  const shotOf = (m) => {
    const s = m.flight
    if (!s) return { obj: m.obj, act: m.acts?.name ?? '' }
    if (s.mode === 'away' || (s.mode === 'wait' && !m.obj.visible)) return null
    if (s.mode === 'out' || s.mode === 'back') return { obj: s.root, act: s.act }
    return { obj: m.obj, act: s.mode === 'flee' ? 'run' : m.acts?.name ?? '' }
  }
  window.__flight = { units, flush: (id) => { const u = units.find((x) => x.b.def.id === id); if (u && u.state === 'home') flush(u, 0) } }
  // 鏡頭被程式直接搬走時呼叫：這一跳不算玩家在跑（不然手會狂晃、鳥會被嚇飛）
  const snap = () => { last.copy(world.camera.position); speed = 0 }
  return { tick, units, shotOf, snap, get speed() { return speed } }
}
