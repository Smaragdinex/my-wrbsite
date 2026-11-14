// 相機行老闆：會走動的店員。模型 models/owner-rigged.glb（Tripo：減面 10k → Auto Rig（Mixamo 骨架）→ 免費預設動作，原檔 models/raw/owner-rigged.glb）。
// 動作：idle 站著、walk 走路（原地，位置由程式移動）、greet_01 打招呼、agree 點頭（介紹器材）、look_around 東張西望、wave_goodbye_02 揮手道別。
// 行為（狀態機）：
//   home     櫃台後面站著；玩家在店裡就轉頭看玩家，偶爾東張西望
//   greet    玩家進店 → 走到玩家前面 1.4 公尺，揮手問「需要幫忙嗎？」
//            玩家不理他（沒看他、沒看器材、直接走開，或站著 7 秒都沒看他）→「好，慢慢看」走回櫃台，這次不再主動過去（除非玩家在器材前面站很久）
//   attend   玩家有回應（看他、看器材）才陪逛：玩家在走就跟在側後方 2 公尺左右（不擋路）；玩家停下來站一下就再問「需要幫忙嗎？」（換句話，最多三次）；
//            玩家盯著一台器材看 → 走到旁邊介紹；一陣子沒互動就回櫃台。在櫃台待 45 秒、玩家還在店裡逛 → 再出來看看
//   checkout 玩家在櫃台按 E → 「來櫃台這邊」走回櫃台後面，到了才打開買賣畫面
//   bye      玩家走進往溫室的通道 → 揮手「慢走」，再回櫃台
// 動作：idle、walk 兩段一直在播，比重和步伐快慢每格跟著「實際移動速度」——沒在移動就一定不會有走路動作（不會原地踏步）；
//       起步加速、快到時減速。打招呼、點頭這種一次性的動作疊在上面淡入淡出。
// 走路：店裡切 0.2 公尺的格子，用店裡既有的碰撞點（展示島、櫃台、角落的架子…）當障礙，A* 找路再拉直；玩家擋在前面就停下來等。
import * as THREE from 'three'
import { t as tr, FONT_SANS } from '../i18n.js'

const CELL = 0.2, SPEED = 1.15, TURN = 5.5, NPC_R = 0.22
const WALK_CLIP_SPEED = 0.92   // walk 這段動作原本的步伐速度（量腳著地時往後滑的速度），播放速度照實際走的速度調，腳才不會滑
const NEAR_PLAYER = 1.4, ACCEL = 2.2, DECEL = 2.5

export function createShopkeeper({ gltf, parent, colliders, bounds, home, homeYaw, inStore, inPassage, counterZone }) {
  /* ---------- 模型、動作 ---------- */
  const root = gltf.scene
  root.traverse((o) => { if (o.isMesh) { o.castShadow = o.receiveShadow = true; o.frustumCulled = false } })
  const box = new THREE.Box3().setFromObject(root, true)
  const s = 1.7 / (box.max.y - box.min.y)
  const model = new THREE.Group(); root.scale.setScalar(s); root.position.y = -box.min.y * s; model.add(root)
  model.position.set(home.x, 0, home.z); model.rotation.y = homeYaw
  parent.add(model)
  const mixer = new THREE.AnimationMixer(root)
  const acts = {}
  // 一次性動作只管上半身：Tripo 的 greet_01、wave_goodbye_02 本身會踏步（膝蓋彎 60～70 度，跟走路差不多），站著打招呼看起來像原地踏步。
  // 所以把它們的髖、腿、腳軌道拿掉（要在 clipAction 之前），下半身改由 idleLegs（idle 只留下半身）接手，比重＝一次性動作的比重 → 腿一直是站姿
  const LOWER = /(Hips|UpLeg|Leg|Foot|Toe)[^.]*\./
  const ONCE = ['greet_01', 'agree', 'wave_goodbye_02', 'look_around']
  let idleLegs = null
  for (const c of gltf.animations) {
    // 原地走路：髖骨的水平位移拿掉，只留上下起伏（Tripo 的 stay in place 還是會有一點飄）
    for (const tr of c.tracks) if (/Hips\.position$/.test(tr.name)) for (let i = 0; i < tr.values.length; i += 3) { tr.values[i] = tr.values[0]; tr.values[i + 2] = tr.values[2] }
    if (c.name === 'idle') idleLegs = mixer.clipAction(new THREE.AnimationClip('idle_legs', c.duration, c.tracks.filter((tr) => LOWER.test(tr.name)).map((tr) => tr.clone())))
    if (ONCE.includes(c.name)) c.tracks = c.tracks.filter((tr) => !LOWER.test(tr.name))
    acts[c.name] = mixer.clipAction(c)
  }
  for (const k of ONCE) if (acts[k]) { acts[k].setLoop(THREE.LoopOnce); acts[k].clampWhenFinished = true }
  acts.idle.play(); acts.walk.play(); idleLegs.play(); idleLegs.setEffectiveWeight(0)
  let one = null, oneOn = false, oneW = 0, moveW = 0, aSpd = 0   // 一次性動作、它的比重、走路比重、實際移動速度
  function play(name) {   // 只用在一次性的動作（打招呼、點頭、揮手、東張西望）；站／走由速度決定
    const a = acts[name]; if (!a) return
    if (one && one !== a) one.stop()
    a.reset().play(); one = a; oneOn = true
  }
  const onceDur = (name) => acts[name]?.getClip().duration ?? 2
  function blendAnims(dt, moved) {
    const v = moved / Math.max(dt, 1e-3)
    aSpd += (v - aSpd) * Math.min(1, dt * (v < aSpd ? 25 : 12))   // 停下來時腳很快就停（不要人停了腳還在走）
    moveW = THREE.MathUtils.clamp(aSpd / 0.45, 0, 1)
    oneW += ((oneOn ? 1 : 0) - oneW) * Math.min(1, dt * 6)
    acts.walk.setEffectiveWeight((1 - oneW) * moveW); acts.idle.setEffectiveWeight((1 - oneW) * (1 - moveW))
    acts.walk.timeScale = Math.max(0.25, aSpd / WALK_CLIP_SPEED)   // 步伐快慢＝實際速度
    idleLegs.setEffectiveWeight(one ? oneW : 0)   // 一次性動作沒有下半身，那一份比重由站姿的腿補上
    if (one) { one.setEffectiveWeight(oneW); if (!oneOn && oneW < 0.01) { one.stop(); one = null } }
  }

  /* ---------- 頭上的對話框 ---------- */
  const bc = document.createElement('canvas'); bc.width = 640; bc.height = 280
  const btex = new THREE.CanvasTexture(bc); btex.colorSpace = THREE.SRGBColorSpace
  const bubble = new THREE.Sprite(new THREE.SpriteMaterial({ map: btex, transparent: true, depthWrite: false, opacity: 0 }))
  bubble.scale.set(1.28, 0.56, 1); bubble.renderOrder = 20
  parent.add(bubble)
  let bubbleT = 0
  function say(text, sec = 3.5) {
    const g = bc.getContext('2d'), W = bc.width, H = bc.height
    g.clearRect(0, 0, W, H)
    g.font = `bold ${text.length > 40 ? 32 : 40}px ${FONT_SANS}`
    // 自動換行（中文一個字一個字量；英文、韓文一個字一個字是指整個單字）
    const lines = []; let line = ''
    for (const ch of text.match(/[A-Za-z0-9'’.,!?()-]+\s?|[\uac00-\ud7af]+\s?|./gu) ?? []) { if (g.measureText(line + ch).width > W - 80 && line) { lines.push(line.trimEnd()); line = ch.trimStart() } else line += ch }
    lines.push(line)
    const bh = 30 + lines.length * 50, bw = Math.min(W - 20, Math.max(...lines.map((l) => g.measureText(l).width)) + 60), bx = (W - bw) / 2, by = H - 30 - bh
    g.fillStyle = 'rgba(255,255,255,0.96)'; g.strokeStyle = 'rgba(31,42,36,0.25)'; g.lineWidth = 3
    g.beginPath(); g.roundRect(bx, by, bw, bh, 26); g.moveTo(W / 2 - 18, by + bh); g.lineTo(W / 2, H - 4); g.lineTo(W / 2 + 18, by + bh); g.fill(); g.stroke()
    g.fillStyle = '#1f2a24'; g.textAlign = 'center'; g.textBaseline = 'middle'
    lines.forEach((l, i) => g.fillText(l, W / 2, by + 40 + i * 50))
    btex.needsUpdate = true; bubbleT = sec; sinceSpoke = 0
  }

  /* ---------- 找路：格子＋A* ---------- */
  const { x0, x1, z0, z1 } = bounds   // x0 < x1, z0 < z1
  const NX = Math.ceil((x1 - x0) / CELL), NZ = Math.ceil((z1 - z0) / CELL)
  const solid = new Uint8Array(NX * NZ)
  const obs = colliders.filter((c) => c.top > 0.5 && c.x > x0 - 1.5 && c.x < x1 + 1.5 && c.z > z0 - 1.5 && c.z < z1 + 1.5)
  for (let i = 0; i < NX; i++) for (let j = 0; j < NZ; j++) {
    const x = x0 + (i + 0.5) * CELL, z = z0 + (j + 0.5) * CELL
    for (const c of obs) if ((x - c.x) ** 2 + (z - c.z) ** 2 < (c.r + NPC_R) ** 2) { solid[i + j * NX] = 1; break }
  }
  let avoid = null   // 重新找路時把玩家也當障礙（繞過去，不要一直等）
  const blockedAt = (i, j) => solid[i + j * NX] || (avoid && (x0 + (i + 0.5) * CELL - avoid.x) ** 2 + (z0 + (j + 0.5) * CELL - avoid.y) ** 2 < 0.8 ** 2)
  const cellOf = (x, z) => [THREE.MathUtils.clamp(Math.floor((x - x0) / CELL), 0, NX - 1), THREE.MathUtils.clamp(Math.floor((z - z0) / CELL), 0, NZ - 1)]
  const centre = (i, j) => new THREE.Vector2(x0 + (i + 0.5) * CELL, z0 + (j + 0.5) * CELL)
  function nearestFree(x, z) {
    const [ci, cj] = cellOf(x, z)
    for (let r = 0; r < 12; r++) {
      let best = null, bd = 1e9
      for (let i = ci - r; i <= ci + r; i++) for (let j = cj - r; j <= cj + r; j++) {
        if (i < 0 || j < 0 || i >= NX || j >= NZ || solid[i + j * NX]) continue
        const d = (i - ci) ** 2 + (j - cj) ** 2; if (d < bd) { bd = d; best = [i, j] }
      }
      if (best) return best
    }
    return [ci, cj]
  }
  const clear = (a, b) => {   // 兩點之間沒有障礙（每 0.1 公尺檢查一格）
    const n = Math.ceil(a.distanceTo(b) / 0.1)
    for (let k = 1; k < n; k++) { const [i, j] = cellOf(a.x + (b.x - a.x) * k / n, a.y + (b.y - a.y) * k / n); if (blockedAt(i, j)) return false }
    return true
  }
  function findPath(from, to) {
    const [si, sj] = nearestFree(from.x, from.y), [ti, tj] = nearestFree(to.x, to.y)
    const S = si + sj * NX, T = ti + tj * NX
    const g = new Float32Array(NX * NZ).fill(Infinity), prev = new Int32Array(NX * NZ).fill(-1), done = new Uint8Array(NX * NZ)
    const open = [S]; g[S] = 0
    const h = (k) => Math.hypot(k % NX - ti, Math.floor(k / NX) - tj)
    while (open.length) {
      let bi = 0; for (let k = 1; k < open.length; k++) if (g[open[k]] + h(open[k]) < g[open[bi]] + h(open[bi])) bi = k
      const c = open.splice(bi, 1)[0]; if (c === T) break
      if (done[c]) continue; done[c] = 1
      const ci = c % NX, cj = Math.floor(c / NX)
      for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
        if (!di && !dj) continue
        const ni = ci + di, nj = cj + dj; if (ni < 0 || nj < 0 || ni >= NX || nj >= NZ) continue
        const n = ni + nj * NX; if (blockedAt(ni, nj) || done[n]) continue
        if (di && dj && (blockedAt(ci + di, cj) || blockedAt(ci, cj + dj))) continue   // 斜走不要切牆角
        const ng = g[c] + (di && dj ? 1.414 : 1)
        if (ng < g[n]) { g[n] = ng; prev[n] = c; open.push(n) }
      }
    }
    if (prev[T] < 0 && S !== T) return [to.clone()]
    const raw = []; for (let k = T; k >= 0; k = prev[k]) { raw.push(centre(k % NX, Math.floor(k / NX))); if (k === S) break }
    raw.reverse(); raw[raw.length - 1] = to.clone()
    // 拉直：能直接看到的點就跳過中間的
    const out = []; let a = from.clone(), k = 0
    while (k < raw.length) { let j = raw.length - 1; while (j > k && !clear(a, raw[j])) j--; out.push(raw[j]); a = raw[j]; k = j + 1 }
    return out
  }

  /* ---------- 狀態機 ---------- */
  const pos = new THREE.Vector2(home.x, home.z), homeV = new THREE.Vector2(home.x, home.z)
  let state = 'home', path = [], onArrive = null, timer = 0, idleT = 12, greeted = false, lastIntro = null, lookT = 0, lookItem = null, pending = null, waitT = 0
  let faceYaw = homeYaw
  // 玩家的動向：平滑過的速度、站著不動多久；老闆多久沒講話、問過幾次
  let lastP = null, stillT = 0, sinceSpoke = 99, asks = 0, followT = 0, homeT = 0, pSpeed = 0, vel = 0
  // 玩家有沒有理他：engaged＝有回應；ignoreT＝打完招呼後被晾多久；ignored＝這次進店被晾過，不再主動過去；lookAtMeT＝玩家看著他多久
  let engaged = false, ignoreT = 0, ignored = false, lookAtMeT = 0
  const pv = new THREE.Vector2()
  const P = new THREE.Vector2()
  function walkTo(target, then) {
    const t = target.clone(); const [i, j] = nearestFree(t.x, t.y); if (solid[i + j * NX] === 0 && t.distanceTo(centre(i, j)) > CELL) t.copy(centre(i, j))
    path = t.distanceTo(pos) < 0.45 ? [] : findPath(pos, t); onArrive = then   // 太近就不用走（不然會一直小碎步）
    if (!path.length) { const f = onArrive; onArrive = null; f?.() }
  }
  const goHome = (then) => { state = 'return'; walkTo(homeV, () => { state = 'home'; faceYaw = homeYaw; then?.() }) }
  const faceTo = (v) => { faceYaw = Math.atan2(v.x - pos.x, v.y - pos.y) }
  function doOnce(name, text, then) {
    play(name); if (text) say(text, Math.max(3, onceDur(name)))
    timer = onceDur(name) - 0.3; onArrive = then
    state = 'anim'
  }

  // 走到器材旁邊（玩家看得到的那一側），點頭介紹
  function introduce() {
    const it = lookItem; lastIntro = it; lookItem = null; timer = 30; state = 'intro'; engaged = true   // 走過去的路上是 intro，到了點頭介紹完變回 attend
    const side = new THREE.Vector2(P.x - it.pos.x, P.y - it.pos.z).normalize(), perp = new THREE.Vector2(-side.y, side.x)
    if (perp.dot(new THREE.Vector2(pos.x - it.pos.x, pos.y - it.pos.z)) < 0) perp.negate()
    const to = new THREE.Vector2(it.pos.x, it.pos.z).addScaledVector(side, 0.55).addScaledVector(perp, 0.85)
    walkTo(to, () => { faceTo(P); doOnce('agree', it.pitch, () => { timer = 30 }) })
  }

  // 陪逛的位置：玩家在走 → 側後方（走路方向往後 1.1、往旁邊 1.6，選靠老闆那一側）；玩家停著 → 維持現在的方向、2 公尺
  function followSpot() {
    const away = new THREE.Vector2().subVectors(pos, P); if (away.lengthSq() < 1e-4) away.set(0, 1); away.normalize()
    if (pSpeed > 0.5) {
      const m = pv.clone().normalize(), side = new THREE.Vector2(-m.y, m.x); if (side.dot(away) < 0) side.negate()
      return P.clone().addScaledVector(pv, 0.6).addScaledVector(m, -1.1).addScaledVector(side, 1.6)   // 往玩家要去的地方提前一點
    }
    return P.clone().addScaledVector(away, 2.0)
  }

  // 玩家在櫃台按 E：老闆在櫃台就直接開；不在就先走回去
  function checkout(open) {
    if (pending) return
    engaged = true
    if (state === 'home' && pos.distanceTo(homeV) < 0.3) { say(tr('好，我幫你看看。'), 2); open(); return }
    pending = open; path = []
    say(tr('好，來櫃台這邊結帳！'), 3)
    state = 'checkout'
    walkTo(homeV, () => {
      faceYaw = homeYaw; state = 'home'
      const fn = pending; pending = null
      if (counterZone(P.x, P.y)) fn(); else say(tr('要結帳再來櫃台找我喔'), 3)
    })
  }


  /* ---------- 2026-11-14 看照片（appraise.js）——第二版（使用者「照片在桌上，他一張一張看」）----------
     開始：玩家的照片一張張平放在櫃台上排成一排（每張稍微歪一點，像隨手攤開）。
     每一張（appraise.js 看完一張叫 appraiseShow(i)）：身體往前傾、雙手到櫃台把那張拿起來 → 拿到胸前低頭看 → 下一張開始時把它放到櫃台另一頭「看完」那疊，再拿下一張。
     手：兩節骨頭 IK（肩→手肘→手），手跟著照片走；拿、放的時候上身往前彎（櫃台後緣離他 0.7 m，不彎手搆不到）；頭看著照片。
     照片：每張一片（正面＝玩家的照片、背面相紙米白），模型座標裡排位置，轉成店裡（父物件）的座標。不需要另外生成模型或動畫 */
  const BN = {}; root.traverse((o) => { if (o.isBone) BN[o.name.replace('mixamorig', '')] = o })
  const appr = { on: false, w: 0, cards: [], cur: -1, want: -1, lean: 0, look: 0 }
  const TL = new THREE.TextureLoader()
  const cardsG = new THREE.Group(); (parent ?? model.parent)?.add(cardsG)
  const CW_ = 0.2, CH_ = 0.135, TABLE_Y = 1.088            // 照片大小；櫃台面（store.js COUNTER h 1.05＋檯面板 0.03）＋一點
  const backM = new THREE.MeshStandardMaterial({ color: 0xece6d8, roughness: 0.9 })
  const HOLD = new THREE.Vector3(0, 1.24, 0.34)              // 拿著看：胸前（模型座標，前方 +z）
  function makeCard(url) {
    const t = TL.load(url); t.colorSpace = THREE.SRGBColorSpace
    const c = new THREE.Group()
    const f = new THREE.Mesh(new THREE.PlaneGeometry(CW_, CH_), new THREE.MeshStandardMaterial({ map: t, roughness: 0.55 }))
    const b = new THREE.Mesh(new THREE.PlaneGeometry(CW_, CH_), backM); b.rotation.y = Math.PI; b.position.z = -0.0008
    f.castShadow = b.castShadow = true; c.add(f, b); cardsG.add(c)
    return { g: c, tex: t, state: 'table', t: 1, from: null, fromQ: null }
  }
  // 模型座標的姿態 → 店裡座標
  const _mq = new THREE.Quaternion(), _pq0 = new THREE.Quaternion()
  function toParent(posL, quatL, outP, outQ) {
    model.updateWorldMatrix(true, false)
    outP.copy(posL); model.localToWorld(outP); cardsG.parent.worldToLocal(outP)
    model.getWorldQuaternion(_mq); cardsG.parent.getWorldQuaternion(_pq0)
    outQ.copy(_pq0.invert()).multiply(_mq).multiply(quatL)
  }
  const flatQ = (yaw) => new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, yaw, 'YXZ'))   // 平放、正面朝上（照片的上緣朝玩家那邊，老闆看是倒的、玩家看是正的）
  function slotPose(i, n, pos, quat) {   // 桌上第 i 張：櫃台後緣往前 0.18 m 一排，左右攤開
    const span = Math.min(1.25, n * 0.2), x = n > 1 ? -span / 2 + span * i / (n - 1) : 0
    const r = Math.sin(i * 12.9898) * 43758.5453, j = r - Math.floor(r)
    pos.set(x + (j - 0.5) * 0.04, TABLE_Y + i * 0.0004, 0.8 + (j - 0.5) * 0.05); quat.copy(flatQ(Math.PI + (j - 0.5) * 0.35))
  }
  function pilePose(k, pos, quat) {      // 看完那疊：他的右手邊（模型 -x）
    pos.set(-0.72, TABLE_Y + 0.002 + k * 0.0016, 0.8); quat.copy(flatQ(Math.PI + 0.25 + Math.sin(k * 3.1) * 0.12))
  }
  function holdPose(pos, quat) {          // 拿在胸前：正面朝他的臉（往上斜 35°）
    pos.copy(HOLD); quat.setFromEuler(new THREE.Euler(-0.6, Math.PI, 0, 'YXZ'))   // 背面朝外（玩家看到相紙背面），正面朝他
  }
  function appraise(urls) {
    if (urls && urls.length) {
      for (const c of appr.cards) { cardsG.remove(c.g); c.tex.dispose() }
      appr.cards = urls.slice(0, 30).map(makeCard)
      appr.cards.forEach((c, i) => { const p = new THREE.Vector3(), q = new THREE.Quaternion(); slotPose(i, appr.cards.length, p, q); c.endP = p; c.endQ = q; c.t = 1 })
      appr.cur = -1; appr.want = -1; appr.on = true; appr.pile = 0
      path = []; onArrive = null; pending = null; state = 'appraise'; faceYaw = homeYaw; oneOn = false
    } else if (appr.on) {
      appr.on = false; state = 'home'
      if (appr.cur >= 0) moveCard(appr.cards[appr.cur], 'done')   // 最後一張放回看完那疊
      appr.cur = -1; appr.clearT = 4   // 4 秒後把那疊收走
    }
  }
  function moveCard(c, to) {
    c.fromP = c.endP.clone(); c.fromQ = c.endQ.clone(); c.t = 0; c.state = to
    c.endP = new THREE.Vector3(); c.endQ = new THREE.Quaternion()
    if (to === 'held') holdPose(c.endP, c.endQ); else pilePose(appr.pile++, c.endP, c.endQ)
  }
  const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _pq = new THREE.Quaternion()
  function aim(bone, child, dir, w) {
    bone.updateWorldMatrix(true, true)
    const a = bone.getWorldPosition(new THREE.Vector3()), b = child.getWorldPosition(new THREE.Vector3())
    _q.setFromUnitVectors(b.sub(a).normalize(), dir.clone().normalize())
    bone.getWorldQuaternion(_q2); _q2.premultiply(_q)
    bone.parent.getWorldQuaternion(_pq); _q2.premultiply(_pq.invert())
    bone.quaternion.slerp(_q2, w); bone.updateWorldMatrix(false, true)
  }
  function bend(bone, axis, ang) {       // 骨頭繞世界軸轉 ang
    if (!bone) return
    bone.updateWorldMatrix(true, false)
    _q.setFromAxisAngle(axis, ang); bone.getWorldQuaternion(_q2); _q2.premultiply(_q)
    bone.parent.getWorldQuaternion(_pq); _q2.premultiply(_pq.invert()); bone.quaternion.copy(_q2); bone.updateWorldMatrix(false, true)
  }
  function arm(side, T, w, right) {
    const U = BN[side + 'Arm'], F = BN[side + 'ForeArm'], H = BN[side + 'Hand']; if (!U || !F || !H) return
    model.updateWorldMatrix(true, true)
    const S = U.getWorldPosition(new THREE.Vector3()), E0 = F.getWorldPosition(new THREE.Vector3()), H0 = H.getWorldPosition(new THREE.Vector3())
    const a = S.distanceTo(E0), b = E0.distanceTo(H0)
    const d0 = T.clone().sub(S), d = Math.min(d0.length(), (a + b) * 0.985), dir = d0.normalize()
    const x = (a * a - b * b + d * d) / (2 * d), h = Math.sqrt(Math.max(0, a * a - x * x))
    const pole = new THREE.Vector3(0, -1, 0).addScaledVector(right, 0.55 * (side === 'Left' ? 1 : -1))
    pole.addScaledVector(dir, -pole.dot(dir)).normalize()
    const E = S.clone().addScaledVector(dir, x).addScaledVector(pole, h)
    aim(U, F, E.clone().sub(S), w)
    aim(F, H, T.clone().sub(F.getWorldPosition(new THREE.Vector3())), w)
  }
  const ease = (t) => t * t * (3 - 2 * t)
  const _cp = new THREE.Vector3(), _cq = new THREE.Quaternion(), _wp = new THREE.Vector3()
  function appraiseTick(dt) {
    appr.w += ((appr.on || appr.cards.some((c) => c.t < 1) ? 1 : 0) - appr.w) * Math.min(1, dt * 3)
    cardsG.visible = appr.cards.length > 0
    if (!appr.cards.length) return
    if (!appr.on && appr.clearT > 0 && (appr.clearT -= dt) <= 0) { for (const c of appr.cards) { cardsG.remove(c.g); c.tex.dispose() } appr.cards = []; return }
    // 換下一張：手上那張放到看完那疊，再去拿下一張（放完才拿）
    if (appr.on && appr.want !== appr.cur) {
      const held = appr.cur >= 0 ? appr.cards[appr.cur] : null
      if (held && held.state === 'held' && held.t >= 1) moveCard(held, 'done')
      if ((!held || (held.state === 'done' && held.t >= 1)) && appr.want < appr.cards.length) { appr.cur = appr.want; moveCard(appr.cards[appr.cur], 'held') }
    }
    // 照片位置（模型座標裡內插：拿起來、放下去都走一條往上拱的弧線）
    let reach = 0, active = null
    for (const c of appr.cards) {
      if (c.t < 1) { c.t = Math.min(1, c.t + dt / 0.75); active = c; reach = Math.max(reach, Math.sin(Math.PI * c.t) * 0.9 + (c.state === 'held' ? 1 - c.t : c.t) * 0.1) }
      const k = ease(c.t)
      const p = c.fromP && c.t < 1 ? c.fromP.clone().lerp(c.endP, k).add(new THREE.Vector3(0, Math.sin(Math.PI * k) * 0.08, 0)) : c.endP
      const q = c.fromQ && c.t < 1 ? c.fromQ.clone().slerp(c.endQ, k) : c.endQ
      toParent(p, q, _cp, _cq); c.g.position.copy(_cp); c.g.quaternion.copy(_cq)
    }
    if (appr.w < 0.01) return
    const w = appr.w
    model.updateWorldMatrix(true, true)
    const mq = model.getWorldQuaternion(new THREE.Quaternion()), right = new THREE.Vector3(1, 0, 0).applyQuaternion(mq)
    // 上身前傾：拿、放的時候彎下去（櫃台後緣搆得到），拿著看的時候稍微往前
    const holding = appr.cur >= 0 && appr.cards[appr.cur].state === 'held'
    appr.lean += ((active ? 0.8 * reach : 0) + (holding ? 0.08 : 0) - appr.lean) * Math.min(1, dt * 6)
    bend(BN.Spine, right, appr.lean * 0.4 * w); bend(BN.Spine1, right, appr.lean * 0.35 * w); bend(BN.Spine2, right, appr.lean * 0.25 * w)
    // 手：抓著正在動的那張；沒在動就拿著手上那張；都沒有（剛開始、看完）就放鬆
    const target = active ?? (holding ? appr.cards[appr.cur] : null)
    if (target) {
      const cw = target.g.getWorldPosition(_wp)
      const along = new THREE.Vector3(1, 0, 0).applyQuaternion(target.g.getWorldQuaternion(new THREE.Quaternion()))   // 照片的左右邊
      if (along.dot(right) < 0) along.negate()
      arm('Left', cw.clone().addScaledVector(along, CW_ * 0.48), w, right)
      arm('Right', cw.clone().addScaledVector(along, -CW_ * 0.48), w, right)
    }
    // 頭：看著手上（或正在拿）的那張；點一下：剛拿起來時
    appr.look += ((target ? 1 : 0.4) - appr.look) * Math.min(1, dt * 4)
    const pitch = (0.32 + (active ? 0.25 * reach : 0)) * appr.look * w
    bend(BN.Neck, right, pitch * 0.45); bend(BN.Head, right, pitch * 0.55)
  }

  function tick(t, dt, cam, focusItem, camDir) {
    mixer.update(dt)
    if (!cam && appr.w > 0.01) { model.position.set(pos.x, 0, pos.y); appraiseTick(dt) }
    if (bubbleT > 0) bubbleT -= dt
    bubble.material.opacity += ((bubbleT > 0 ? 1 : 0) - bubble.material.opacity) * Math.min(1, dt * 8)
    bubble.position.set(model.position.x, 2.2, model.position.z)
    if (!cam) { blendAnims(dt, 0); return }   // 首頁、暫停：鏡頭不在玩家身上，不動
    P.set(cam.x, cam.z)
    const here = inStore(P.x, P.y), passage = inPassage(P.x, P.y)
    const dP = pos.distanceTo(P)
    if (!lastP) lastP = P.clone()
    pv.lerp(new THREE.Vector2().subVectors(P, lastP).divideScalar(Math.max(dt, 1e-3)), Math.min(1, dt * 4)); lastP.copy(P)
    pSpeed = pv.length(); stillT = pSpeed < 0.35 ? stillT + dt : 0; sinceSpoke += dt
    // 玩家有沒有在看他（鏡頭方向跟「玩家→老闆」夾角 17 度內、5 公尺內）
    if (camDir && dP < 5) { const tx = pos.x - P.x, tz = pos.y - P.y, l = Math.hypot(tx, tz) * Math.hypot(camDir.x, camDir.z) || 1; lookAtMeT = (tx * camDir.x + tz * camDir.z) / l > 0.955 ? lookAtMeT + dt : 0 } else lookAtMeT = 0

    // 陪逛：每 0.6 秒看一次玩家在哪；離太遠（3 公尺）、貼太近（0.9）或玩家在走、離開 1.8 公尺以上 → 換位置（走路中也可以改路線）
    if (state === 'attend' && engaged && here && (followT -= dt) <= 0) {
      followT = 0.6
      const spot = followSpot()
      if (dP > 3.0 || dP < 0.9 || (pSpeed > 0.5 && dP > 1.8 && spot.distanceTo(pos) > 1.2)) walkTo(spot, () => {})   // 玩家只是在旁邊小動，不跟著一直調位置
    }

    // 走過去招呼時玩家自己走過來了：1.3 公尺內就停（不要走進玩家身上）
    if (path.length && state === 'greet' && dP < 1.3) path = [pos.clone()]
    // 走路：沿著路徑點走，玩家擋在前面就停
    const px0 = pos.x, pz0 = pos.y
    if (path.length) {
      oneOn = false   // 要走了：打招呼之類的動作淡出
      const nx = path[0], d = nx.distanceTo(pos)
      let remain = d; for (let i = 1; i < path.length; i++) remain += path[i].distanceTo(path[i - 1])
      const dir = new THREE.Vector2().subVectors(nx, pos).normalize()
      // 接下來 1 公尺的路會不會擦到玩家（0.55 公尺內）
      const ahead = Math.min(1, d), u = THREE.MathUtils.clamp(new THREE.Vector2().subVectors(P, pos).dot(dir), 0, ahead)
      const blocked = here && P.distanceTo(new THREE.Vector2().copy(pos).addScaledVector(dir, u)) < 0.55
      if (blocked && state === 'attend') { path = []; onArrive = null; vel = 0; followT = 1.5 }   // 陪逛時被玩家擋住＝玩家就在旁邊了，不用走，站著就好
      else if (blocked) { vel = Math.max(0, vel - DECEL * 2 * dt); waitT += dt; if (waitT > 0.8) { waitT = 0; avoid = P.clone(); path = findPath(pos, path[path.length - 1]); avoid = null } }   // 要去別的地方：停一下，再繞過玩家
      else {
        waitT = 0
        const spd = state === 'attend' && dP > 2.4 ? THREE.MathUtils.clamp(pSpeed, 1.5, 2.2) : SPEED   // 陪逛落後就快步跟上（玩家走 4.2 公尺/秒，他最快 2.2，停下來時才追得上，像真人）
        const want = Math.max(0.2, Math.min(spd, Math.sqrt(2 * DECEL * remain)))   // 快到了就慢下來
        vel = vel < want ? Math.min(want, vel + ACCEL * dt) : Math.max(want, vel - DECEL * dt)   // 起步慢慢加速
        const step = Math.min(d, vel * dt); pos.addScaledVector(dir, step)
        faceYaw = Math.atan2(dir.x, dir.y)
        if (d - step < 0.02) path.shift()
        if (!path.length) { vel = 0; const f = onArrive; onArrive = null; f?.() }
      }
    } else {
      vel = 0
      if (state === 'anim') {
        timer -= dt
        if (timer <= 0) { state = 'attend'; oneOn = false; const f = onArrive; onArrive = null; f?.() }
      }
    }
    blendAnims(dt, Math.hypot(pos.x - px0, pos.y - pz0))

    // 玩家正在盯著哪台器材看、看了多久（介紹過的就不再介紹）
    if (focusItem && focusItem !== lastIntro) { if (focusItem === lookItem) lookT += dt; else { lookItem = focusItem; lookT = 0 } } else lookItem = null
    // 各狀態要做什麼
    if (state === 'appraise') faceYaw = homeYaw
    if (!path.length && state !== 'anim' && state !== 'checkout' && state !== 'appraise') {
      if (state === 'home') {
        if (passage && greeted) {   // 玩家要走了：在櫃台後面揮手
          greeted = false; ignored = false; lastIntro = null; faceTo(P)
          doOnce('wave_goodbye_02', tr('慢走！拍照愉快！'), () => { state = 'home' })
        } else if (here && !greeted && dP < 9) {
          greeted = true; state = 'greet'
          const to = P.clone().add(new THREE.Vector2().subVectors(pos, P).setLength(NEAR_PLAYER))
          asks = 1; engaged = false; ignoreT = 0
          walkTo(to, () => { faceTo(P); doOnce('greet_01', tr('歡迎光臨！需要幫忙嗎？'), () => { timer = 40 }) })
        } else {
          if (here) faceTo(P); else faceYaw = homeYaw
          if (here) { const a = THREE.MathUtils.euclideanModulo(faceYaw - homeYaw + Math.PI, Math.PI * 2) - Math.PI; faceYaw = homeYaw + THREE.MathUtils.clamp(a, -1.05, 1.05) }
          homeT = here && greeted ? homeT + dt : 0
          if (here && greeted && lookItem && lookT > 2.5) introduce()   // 在櫃台也看得到：玩家在一台器材前面站很久就走過來
          else if (!ignored && homeT > 45 && stillT > 2 && !counterZone(P.x, P.y)) {   // 玩家還在店裡慢慢看 → 再出來問問（被晾過就不再來）
            homeT = 0; asks = 1; state = 'greet'; engaged = false; ignoreT = 0
            walkTo(P.clone().add(new THREE.Vector2().subVectors(pos, P).setLength(NEAR_PLAYER)), () => { faceTo(P); doOnce('greet_01', tr('還在看嗎？需要幫忙嗎？'), () => { timer = 40 }) })
          }
          else if ((idleT -= dt) < 0) { idleT = 25 + Math.random() * 20; if (!here) { play('look_around'); timer = onceDur('look_around'); state = 'anim'; onArrive = () => { state = 'home' } } }
        }
      } else if (state === 'attend') {
        faceTo(P); timer -= dt
        // 有沒有理他：看著他 0.7 秒、看器材、走到他面前 → 有回應
        if (!engaged && (lookAtMeT > 0.7 || lookItem || (dP < 1.6 && stillT > 0.5 && lookAtMeT > 0.2))) engaged = true
        if (!engaged) ignoreT += dt
        if (lookItem && lookT > 1.2) introduce()
        else if (!engaged && here && ((ignoreT > 1.5 && dP > 3.5) || ignoreT > 7)) {   // 被晾著：走開了，或站著 7 秒都沒看他
          ignored = true; say(tr('好，慢慢看，有需要再叫我！'), 2.5); goHome()
        }   // 盯著某台器材看超過 1.2 秒 → 走過去介紹
        else if (engaged && here && stillT > 2.5 && dP < 3.5 && sinceSpoke > 14 && asks < 3) {   // 玩家停下來了，隔一陣子再問一次（換句話）
          const lines = [tr('歡迎光臨！需要幫忙嗎？'), tr('想拍什麼鳥？我可以幫你挑器材喔！'), tr('慢慢看，有問題隨時問我！')]
          doOnce(asks % 2 ? 'agree' : 'greet_01', lines[asks], () => { timer = 30 }); asks++
        } else if (passage) {
          doOnce('wave_goodbye_02', tr('慢走！拍照愉快！'), () => { greeted = false; ignored = false; lastIntro = null; goHome() })
        } else if (!here) {
          greeted = false; goHome()
        } else if (timer < 0) {
          say(tr('有需要再叫我喔！'), 2.5); goHome()
        }
      }
    }
    // 回櫃台途中玩家走了 → 回到家再重設；走出店外就算下次再來要重新招呼
    if (!here && !passage && state === 'home') { greeted = false; ignored = false }

    // 轉身、位置
    const cy = model.rotation.y, dy = THREE.MathUtils.euclideanModulo(faceYaw - cy + Math.PI, Math.PI * 2) - Math.PI
    model.rotation.y = cy + dy * Math.min(1, TURN * dt)
    model.position.set(pos.x, 0, pos.y)
    appraiseTick(dt)
  }
  return { model, tick, checkout, say, appraise, appraiseShow: (i) => { appr.want = Math.min(i, appr.cards.length - 1) }, get appraising() { return appr.on }, get state() { return state }, get anim() { return one && oneW > 0.5 ? one.getClip().name : moveW > 0.5 ? 'walk' : 'idle' }, get engaged() { return engaged }, get ignored() { return ignored }, get moveW() { return moveW }, get path() { return path }, pos }
}
