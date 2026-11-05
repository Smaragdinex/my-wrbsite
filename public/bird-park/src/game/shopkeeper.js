// 相機行老闆：會走動的店員。模型 models/owner-rigged.glb（Tripo：減面 10k → Auto Rig（Mixamo 骨架）→ 免費預設動作，原檔 models/raw/owner-rigged.glb）。
// 動作：idle 站著、walk 走路（原地，位置由程式移動）、greet_01 打招呼、agree 點頭（介紹器材）、look_around 東張西望、wave_goodbye_02 揮手道別。
// 行為（狀態機）：
//   home     櫃台後面站著；玩家在店裡就轉頭看玩家，偶爾東張西望
//   greet    玩家進店 → 走到玩家前面 1.4 公尺，揮手問「需要幫忙嗎？」
//   attend   像真的店員一樣陪逛：玩家在走就跟在側後方 2 公尺左右（不擋路）；玩家停下來站一下就再問「需要幫忙嗎？」（換句話，最多三次）；
//            玩家盯著一台器材看 → 走到旁邊介紹；一陣子沒互動就回櫃台。在櫃台待 45 秒、玩家還在店裡逛 → 再出來看看
//   checkout 玩家在櫃台按 E → 「來櫃台這邊」走回櫃台後面，到了才打開買賣畫面
//   bye      玩家走進往溫室的通道 → 揮手「慢走」，再回櫃台
// 走路：店裡切 0.2 公尺的格子，用店裡既有的碰撞點（展示島、櫃台、角落的架子…）當障礙，A* 找路再拉直；玩家擋在前面就停下來等。
import * as THREE from 'three'

const CELL = 0.2, SPEED = 1.15, TURN = 5.5, NPC_R = 0.22
const WALK_CLIP_SPEED = 0.92   // walk 這段動作原本的步伐速度（量腳著地時往後滑的速度），播放速度照實際走的速度調，腳才不會滑
const NEAR_PLAYER = 1.4

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
  for (const c of gltf.animations) {
    // 原地走路：髖骨的水平位移拿掉，只留上下起伏（Tripo 的 stay in place 還是會有一點飄）
    for (const tr of c.tracks) if (/Hips\.position$/.test(tr.name)) for (let i = 0; i < tr.values.length; i += 3) { tr.values[i] = tr.values[0]; tr.values[i + 2] = tr.values[2] }
    acts[c.name] = mixer.clipAction(c)
  }
  for (const k of ['greet_01', 'agree', 'wave_goodbye_02', 'look_around']) if (acts[k]) { acts[k].setLoop(THREE.LoopOnce); acts[k].clampWhenFinished = true }
  let cur = null
  function play(name, fade = 0.3) {
    const a = acts[name]; if (!a || a === cur) return
    a.reset().setEffectiveWeight(1).play()
    if (cur) cur.crossFadeTo(a, fade, false)
    cur = a
  }
  const onceDur = (name) => acts[name]?.getClip().duration ?? 2
  play('idle', 0)

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
    g.font = 'bold 40px "PingFang TC", "Noto Sans TC", sans-serif'
    // 自動換行（中文一個字一個字量）
    const lines = []; let line = ''
    for (const ch of text) { if (g.measureText(line + ch).width > W - 80) { lines.push(line); line = ch } else line += ch }
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
  let lastP = null, stillT = 0, sinceSpoke = 99, asks = 0, followT = 0, homeT = 0, pSpeed = 0
  const pv = new THREE.Vector2()
  const P = new THREE.Vector2()
  function walkTo(target, then) {
    const t = target.clone(); const [i, j] = nearestFree(t.x, t.y); if (solid[i + j * NX] === 0 && t.distanceTo(centre(i, j)) > CELL) t.copy(centre(i, j))
    path = t.distanceTo(pos) < 0.45 ? [] : findPath(pos, t); onArrive = then   // 太近就不用走（不然會一直小碎步）
    if (!path.length) { const f = onArrive; onArrive = null; f?.() }
  }
  const goHome = (then) => { state = 'return'; walkTo(homeV, () => { state = 'home'; faceYaw = homeYaw; play('idle'); then?.() }) }
  const faceTo = (v) => { faceYaw = Math.atan2(v.x - pos.x, v.y - pos.y) }
  function doOnce(name, text, then) {
    play(name); if (text) say(text, Math.max(3, onceDur(name)))
    timer = onceDur(name) - 0.3; onArrive = then
    state = 'anim'
  }

  // 走到器材旁邊（玩家看得到的那一側），點頭介紹
  function introduce() {
    const it = lookItem; lastIntro = it; lookItem = null; timer = 30; state = 'intro'   // 走過去的路上是 intro，到了點頭介紹完變回 attend
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
    if (state === 'home' && pos.distanceTo(homeV) < 0.3) { say('好，我幫你看看。', 2); open(); return }
    pending = open; path = []
    say('好，來櫃台這邊結帳！', 3)
    state = 'checkout'
    walkTo(homeV, () => {
      faceYaw = homeYaw; play('idle'); state = 'home'
      const fn = pending; pending = null
      if (counterZone(P.x, P.y)) fn(); else say('要結帳再來櫃台找我喔', 3)
    })
  }

  function tick(t, dt, cam, focusItem) {
    mixer.update(dt)
    if (bubbleT > 0) bubbleT -= dt
    bubble.material.opacity += ((bubbleT > 0 ? 1 : 0) - bubble.material.opacity) * Math.min(1, dt * 8)
    bubble.position.set(model.position.x, 2.2, model.position.z)
    if (!cam) return   // 首頁、暫停：鏡頭不在玩家身上，不動
    P.set(cam.x, cam.z)
    const here = inStore(P.x, P.y), passage = inPassage(P.x, P.y)
    const dP = pos.distanceTo(P)
    if (!lastP) lastP = P.clone()
    pv.lerp(new THREE.Vector2().subVectors(P, lastP).divideScalar(Math.max(dt, 1e-3)), Math.min(1, dt * 4)); lastP.copy(P)
    pSpeed = pv.length(); stillT = pSpeed < 0.35 ? stillT + dt : 0; sinceSpoke += dt

    // 陪逛：每 0.6 秒看一次玩家在哪；離太遠（3 公尺）、貼太近（0.9）或玩家在走、離開 1.8 公尺以上 → 換位置（走路中也可以改路線）
    if (state === 'attend' && here && (followT -= dt) <= 0) {
      followT = 0.6
      const spot = followSpot()
      if (dP > 3.0 || dP < 0.9 || (pSpeed > 0.5 && dP > 1.8 && spot.distanceTo(pos) > 1.2)) walkTo(spot, () => {})   // 玩家只是在旁邊小動，不跟著一直調位置
    }

    // 走過去招呼時玩家自己走過來了：1.3 公尺內就停（不要走進玩家身上）
    if (path.length && state === 'greet' && dP < 1.3) path = [pos.clone()]
    // 走路：沿著路徑點走，玩家擋在前面就停
    if (path.length) {
      const nx = path[0], d = nx.distanceTo(pos)
      const dir = new THREE.Vector2().subVectors(nx, pos).normalize()
      // 接下來 1 公尺的路會不會擦到玩家（0.55 公尺內）
      const ahead = Math.min(1, d), u = THREE.MathUtils.clamp(new THREE.Vector2().subVectors(P, pos).dot(dir), 0, ahead)
      const blocked = here && P.distanceTo(new THREE.Vector2().copy(pos).addScaledVector(dir, u)) < 0.55
      if (blocked && state === 'attend') { path = []; onArrive = null; play('idle', 0.3); followT = 1.5 }   // 陪逛時被玩家擋住＝玩家就在旁邊了，不用走，站著就好
      else if (blocked) { waitT += dt; if (cur !== acts.idle) play('idle', 0.3); if (waitT > 0.8) { waitT = 0; avoid = P.clone(); path = findPath(pos, path[path.length - 1]); avoid = null } }   // 要去別的地方：停一下，再繞過玩家
      else {
        waitT = 0; if (cur !== acts.walk) play('walk', 0.2)
        const spd = state === 'attend' && dP > 2.4 ? THREE.MathUtils.clamp(pSpeed, 1.5, 2.2) : SPEED   // 陪逛落後就快步跟上（玩家走 4.2 公尺/秒，他最快 2.2，停下來時才追得上，像真人）
        acts.walk.timeScale = spd / WALK_CLIP_SPEED
        const step = Math.min(d, spd * dt); pos.addScaledVector(dir, step)
        faceYaw = Math.atan2(dir.x, dir.y)
        if (d - step < 0.02) path.shift()
        if (!path.length) { play('idle'); const f = onArrive; onArrive = null; f?.() }
      }
    } else if (state === 'anim') {
      timer -= dt
      if (timer <= 0) { state = 'attend'; play('idle'); const f = onArrive; onArrive = null; f?.() }
    }

    // 玩家正在盯著哪台器材看、看了多久（介紹過的就不再介紹）
    if (focusItem && focusItem !== lastIntro) { if (focusItem === lookItem) lookT += dt; else { lookItem = focusItem; lookT = 0 } } else lookItem = null
    // 各狀態要做什麼
    if (!path.length && state !== 'anim' && state !== 'checkout') {
      if (state === 'home') {
        if (passage && greeted) {   // 玩家要走了：在櫃台後面揮手
          greeted = false; lastIntro = null; faceTo(P)
          doOnce('wave_goodbye_02', '慢走！拍照愉快！', () => { state = 'home'; play('idle') })
        } else if (here && !greeted && dP < 9) {
          greeted = true; state = 'greet'
          const to = P.clone().add(new THREE.Vector2().subVectors(pos, P).setLength(NEAR_PLAYER))
          asks = 1
          walkTo(to, () => { faceTo(P); doOnce('greet_01', '歡迎光臨！需要幫忙嗎？', () => { timer = 40 }) })
        } else {
          if (here) faceTo(P); else faceYaw = homeYaw
          if (here) { const a = THREE.MathUtils.euclideanModulo(faceYaw - homeYaw + Math.PI, Math.PI * 2) - Math.PI; faceYaw = homeYaw + THREE.MathUtils.clamp(a, -1.05, 1.05) }
          homeT = here && greeted ? homeT + dt : 0
          if (here && greeted && lookItem && lookT > 2.5) introduce()   // 在櫃台也看得到：玩家在一台器材前面站很久就走過來
          else if (homeT > 45 && stillT > 2 && !counterZone(P.x, P.y)) {   // 玩家還在店裡慢慢看 → 再出來問問
            homeT = 0; asks = 1; state = 'greet'
            walkTo(P.clone().add(new THREE.Vector2().subVectors(pos, P).setLength(NEAR_PLAYER)), () => { faceTo(P); doOnce('greet_01', '還在看嗎？需要幫忙嗎？', () => { timer = 40 }) })
          }
          else if ((idleT -= dt) < 0) { idleT = 25 + Math.random() * 20; if (!here) { play('look_around'); timer = onceDur('look_around'); state = 'anim'; onArrive = () => { state = 'home'; play('idle') } } }
        }
      } else if (state === 'attend') {
        faceTo(P); timer -= dt
        if (lookItem && lookT > 1.2) introduce()   // 盯著某台器材看超過 1.2 秒 → 走過去介紹
        else if (here && stillT > 2.5 && dP < 3.5 && sinceSpoke > 14 && asks < 3) {   // 玩家停下來了，隔一陣子再問一次（換句話）
          const lines = ['歡迎光臨！需要幫忙嗎？', '想拍什麼鳥？我可以幫你挑器材喔！', '慢慢看，有問題隨時問我！']
          doOnce(asks % 2 ? 'agree' : 'greet_01', lines[asks], () => { timer = 30 }); asks++
        } else if (passage) {
          doOnce('wave_goodbye_02', '慢走！拍照愉快！', () => { greeted = false; lastIntro = null; goHome() })
        } else if (!here) {
          greeted = false; goHome()
        } else if (timer < 0) {
          say('有需要再叫我喔！', 2.5); goHome()
        }
      }
    }
    // 回櫃台途中玩家走了 → 回到家再重設；走出店外就算下次再來要重新招呼
    if (!here && !passage && state === 'home') greeted = false

    // 轉身、位置
    const cy = model.rotation.y, dy = THREE.MathUtils.euclideanModulo(faceYaw - cy + Math.PI, Math.PI * 2) - Math.PI
    model.rotation.y = cy + dy * Math.min(1, TURN * dt)
    model.position.set(pos.x, 0, pos.y)
  }
  return { model, tick, checkout, say, get state() { return state }, get anim() { return cur?.getClip().name }, get path() { return path }, pos }
}
