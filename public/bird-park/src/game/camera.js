// 相機：右鍵按一下舉起／放下（觀景窗）、滾輪變焦、自動對焦（看機身對焦速度）、左鍵拍照；舉著相機按 E 開設定面板（模式、光圈、快門、ISO）。
// 焦段用全片幅換算視角；照片是另外畫一張 3:2 的圖，照真的單眼算：
// 光圈 → 景深（對焦誤差在景深外就糊）；快門 → 手震（慢於 1/焦距）、鳥在動的動態模糊；ISO → 雜訊；曝光不對 → 照片太亮／太暗（exposure.js）。
import * as THREE from 'three'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import { measurePhoto, scorePhoto } from './scoring.js'
import { APERTURES, SHUTTERS, ISOS, MODES, NOISE, fmtShutter, fmtAp, settle, createMeter } from './exposure.js'
import { createCameraSfx } from './camera-sfx.js'

// 機身：af 對焦要幾秒、fps 連拍、iso 最高 ISO（暗處能拍多亮；越高的機身雜訊也越少，見 exposure.js 的 NOISE）
export const BODIES = [
  { id: 'b1', name: '入門機身 Lark 100', price: 0, af: 0.7, fps: 3, iso: 1600 },
  { id: 'b2', name: '中階機身 Kestrel 500', price: 6000, af: 0.3, fps: 8, iso: 6400 },
  { id: 'b3', name: '旗艦機身 Falcon 9', price: 22000, af: 0.1, fps: 20, iso: 25600 },
]
// 鏡頭：焦段範圍（mm）、最大光圈（數字越小越亮、景深越淺）
export const LENSES = [
  { id: 'l1', name: '18–55mm 標準變焦', price: 0, min: 18, max: 55, ap: 4 },
  { id: 'l2', name: '70–300mm 望遠變焦', price: 3500, min: 70, max: 300, ap: 5.6 },
  { id: 'l3', name: '100–400mm 望遠變焦', price: 9000, min: 100, max: 400, ap: 5.6 },
  { id: 'l4', name: '150–600mm 超望遠', price: 16000, min: 150, max: 600, ap: 6.3 },
  { id: 'l5', name: '600mm f/4 定焦', price: 48000, min: 600, max: 600, ap: 4 },
]
export const vfov = (f) => THREE.MathUtils.radToDeg(2 * Math.atan(24 / (2 * f)))   // 全片幅 36×24

const WALK_FOV = 62
const PHOTO_W = 1200, PHOTO_H = 800
const KEY = 'birdpark-camera-v1'

// 觀景窗裡的對焦點（像單眼的 AF 點陣）：7×3 個小框，中間那個是現在用的（比較大、四角括弧）；合焦時亮紅色、底下的綠點 ● 亮起
const AF_SVG = (() => {
  const W = 340, H = 170, pts = []
  for (let r = -1; r <= 1; r++) for (let c = -3; c <= 3; c++) {
    if (!r && !c) continue
    const x = W / 2 + c * 44 - 10, y = H / 2 + r * 44 - 7
    pts.push(`<rect class="pt" x="${x}" y="${y}" width="20" height="14" rx="1.5"/>`)
  }
  // 現用的對焦點：四個角括弧＋中間十字小刻（十字型對焦點）
  const cx = W / 2, cy = H / 2, w = 17, h = 12, k = 7
  const corner = (sx, sy) => `M${cx + sx * w},${cy + sy * (h - k)} V${cy + sy * h} H${cx + sx * (w - k)}`
  return `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">${pts.join('')}
    <g class="act"><rect class="fill" x="${cx - w}" y="${cy - h}" width="${w * 2}" height="${h * 2}" rx="2"/>
    <path d="${corner(-1, -1)} ${corner(1, -1)} ${corner(-1, 1)} ${corner(1, 1)}"/>
    <path class="tick" d="M${cx - 3},${cy} H${cx + 3} M${cx},${cy - 3} V${cy + 3}"/></g></svg>`
})()

export function createCamera({ world, camera, controls, hud, gear, onShot, onPanel, getSound = () => true }) {
  const sfx = createCameraSfx({ getSound })
  const st = { raised: false, focal: 35, focus: 10, aimDist: 10, af: 0, locked: false, fov: WALK_FOV, cool: 0, meterT: 0 }
  // 使用者選的設定（存起來，下次開遊戲還在）
  const cam = { mode: 'auto', ap: 5.6, t: 1 / 250, iso: 400 }
  try { Object.assign(cam, JSON.parse(localStorage.getItem(KEY) || '{}')) } catch {}
  const saveCam = () => { try { localStorage.setItem(KEY, JSON.stringify(cam)) } catch {} }

  // 觀景窗疊圖：下面一排是焦距、快門、光圈、ISO、測光表、對焦距離、模式
  const vf = document.createElement('div')
  vf.className = 'viewfinder'
  vf.innerHTML = `<div class="vf-mask"></div><div class="vf-frame"><i></i><i></i><i></i><i></i></div><div class="vf-af">${AF_SVG}</div>
    <div class="vf-bar"><span class="vf-ok">●</span><span class="vf-mode"></span><span class="vf-f"></span><span class="vf-t"></span><span class="vf-ap"></span><span class="vf-iso"></span>
    <span class="vf-meter"><b>-2</b><b>-1</b><b>0</b><b>+1</b><b>+2</b><i></i></span><span class="vf-d"></span></div>
    <div class="vf-warn"></div><div class="vf-flash"></div>`
  hud.root.appendChild(vf)
  const $ = (s) => vf.querySelector(s)

  const lens = () => gear.lens(), body = () => gear.body()
  const clampFocal = () => { st.focal = THREE.MathUtils.clamp(st.focal, lens().min, lens().max) }
  clampFocal()
  const meter = createMeter(world.renderer)
  const now = () => settle(cam, { lens: lens(), body: body(), ev: meter.ev, focal: st.focal })

  addEventListener('contextmenu', (e) => e.preventDefault())
  addEventListener('mousedown', (e) => {
    if (!controls.isLocked) return
    if (e.button === 2) { st.raised = !st.raised; st.af = 0; st.locked = false; st.meterT = 0 }   // 按一下切換，不用一直按著
    if (e.button === 0 && st.raised) shoot()
  })
  controls.addEventListener('unlock', () => { if (!panelOn) st.raised = false })   // 開相簿、相機行、按 Esc 就放下相機（開相機設定不算）
  addEventListener('wheel', (e) => {
    if (!controls.isLocked || !st.raised) return
    st.focal *= Math.exp(-e.deltaY * 0.0015)
    clampFocal()
  }, { passive: true })

  /* ---------- 設定介面：畫在相機背面的螢幕上（舉著相機按 E，相機拿到面前） ---------- */
  // 一張 1024×683 的畫布當螢幕貼圖（viewmodel.js 把它貼到三台機身的 Screen 材質上）；滑鼠點的位置用射線打到螢幕上換成畫布座標
  const LW = 1024, LH = 683
  const lcdCanvas = document.createElement('canvas'); lcdCanvas.width = LW; lcdCanvas.height = LH
  const lcd = lcdCanvas.getContext('2d')
  const lcdTex = new THREE.CanvasTexture(lcdCanvas); lcdTex.colorSpace = THREE.SRGBColorSpace; lcdTex.anisotropy = 8
  lcdTex.flipY = false   // glTF 的 UV 原點在左上（跟畫布一樣）
  let panelOn = false, hits = [], hover = -1, screenMesh = null
  // 按 E：整個視窗就是相機背面的螢幕（不用低頭看）；同一張畫布也貼在 3D 相機的螢幕上
  const lcdWrap = document.createElement('div')
  lcdWrap.className = 'cam-lcd'; lcdWrap.hidden = true
  lcdWrap.appendChild(lcdCanvas)
  document.body.appendChild(lcdWrap)
  const step = (list, v, d, lo = -Infinity, hi = Infinity) => {
    const ok = list.filter((x) => x >= lo - 1e-9 && x <= hi + 1e-9)
    let i = ok.findIndex((x) => Math.abs(x - v) < 1e-9)
    if (i < 0) i = ok.reduce((b, x, k) => (Math.abs(Math.log(x / v)) < Math.abs(Math.log(ok[b] / v)) ? k : b), 0)
    return ok[THREE.MathUtils.clamp(i + d, 0, ok.length - 1)]
  }
  const FONT = '"PingFang TC", "Noto Sans TC", sans-serif', MONO = 'ui-monospace, Menlo, monospace'
  function renderPanel() {
    const s = now(), m = cam.mode, L = lens(), B = body(), g = lcd
    const auto = (k) => (m === 'auto' || (m === 'A' && k === 't') || (m === 'S' && k === 'ap'))
    hits = []
    const hit = (x, y, w, h, act) => { const i = hits.length; hits.push({ x, y, w, h, act }); return i === hover }
    // 底：黑色螢幕、細細的掃描感漸層
    const bg = g.createLinearGradient(0, 0, 0, LH); bg.addColorStop(0, '#10161a'); bg.addColorStop(1, '#05080a')
    g.fillStyle = bg; g.fillRect(0, 0, LW, LH)
    // 上排：模式
    MODES.forEach((x, i) => {
      const bx = 18 + i * 248, w = 236, on = x.id === m, hv = hit(bx, 14, w, 74, { mode: x.id })
      g.fillStyle = on ? '#f2c94c' : hv ? '#2c3a40' : '#1a2428'; g.beginPath(); g.roundRect(bx, 14, w, 74, 12); g.fill()
      g.fillStyle = on ? '#111' : '#d7e3e6'; g.font = `600 32px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'
      g.fillText(x.name, bx + w / 2, 52)
    })
    g.textAlign = 'left'; g.fillStyle = '#8fa3a8'; g.font = `24px ${FONT}`
    g.fillText(MODES.find((x) => x.id === m).tip.slice(0, 38), 22, 116)
    // 三排設定：名稱｜◀ 數值 ▶
    const rows = [['ap', '光圈', fmtAp(s.N)], ['t', '快門', fmtShutter(s.t)], ['iso', 'ISO', String(s.iso)]]
    rows.forEach(([k, label, val], i) => {
      const y = 146 + i * 122, a = auto(k)
      g.fillStyle = '#121b1f'; g.beginPath(); g.roundRect(18, y, LW - 36, 108, 14); g.fill()
      g.fillStyle = '#9fb4b9'; g.font = `600 34px ${FONT}`; g.textBaseline = 'middle'; g.fillText(label, 44, y + 54)
      for (const [dx, d, ch] of [[300, -1, '◀'], [LW - 140, 1, '▶']]) {
        const hv = !a && hit(dx, y + 12, 100, 84, { k, d })
        g.fillStyle = a ? '#1a2226' : hv ? '#f2c94c' : '#26343a'; g.beginPath(); g.roundRect(dx, y + 12, 100, 84, 12); g.fill()
        g.fillStyle = a ? '#3c4a50' : hv ? '#111' : '#e8f0f2'; g.font = `40px ${FONT}`; g.textAlign = 'center'; g.fillText(ch, dx + 50, y + 56)
      }
      g.fillStyle = a ? '#7f9196' : '#ffffff'; g.font = `700 64px ${MONO}`; g.textAlign = 'center'; g.fillText(val, LW / 2 + 60, y + 48)
      if (a) { g.font = `24px ${FONT}`; g.fillStyle = '#f2c94c'; g.fillText('自動', LW / 2 + 60, y + 92) }
      g.textAlign = 'left'
    })
    // 測光表：-3 … +3，指針
    const my = 572, mx0 = 120, mx1 = LW - 290, o = THREE.MathUtils.clamp(s.over, -3, 3)
    g.strokeStyle = '#6f8388'; g.lineWidth = 3; g.beginPath(); g.moveTo(mx0, my); g.lineTo(mx1, my); g.stroke()
    g.font = `22px ${MONO}`; g.fillStyle = '#9fb4b9'; g.textAlign = 'center'
    for (let v = -3; v <= 3; v++) { const x = mx0 + (v + 3) / 6 * (mx1 - mx0); g.fillRect(x - 1.5, my - (v === 0 ? 16 : 9), 3, v === 0 ? 32 : 18); g.fillText(`${v > 0 ? '+' : ''}${v}`, x, my + 30) }
    const ok = Math.abs(s.over) <= 0.5, px = mx0 + (o + 3) / 6 * (mx1 - mx0)
    g.fillStyle = ok ? '#5cf07a' : '#ff9b5a'; g.beginPath(); g.moveTo(px, my - 12); g.lineTo(px - 13, my - 36); g.lineTo(px + 13, my - 36); g.fill()
    g.font = `600 30px ${FONT}`; g.fillText(ok ? '曝光剛好' : s.over > 0 ? `過曝 ${s.over.toFixed(1)} 格` : `欠曝 ${(-s.over).toFixed(1)} 格`, (mx0 + mx1) / 2, 526)
    // 最下面：警告或機身資訊、關閉
    g.textAlign = 'left'; g.font = `24px ${FONT}`
    const warn = s.t > 1 / st.focal ? '⚠ 快門比 1/焦距 慢，會手震' : s.iso > 800 && s.iso >= B.iso * 0.5 ? '⚠ ISO 很高，雜訊多' : `${B.name.split(' ').slice(1).join(' ')}・${Math.round(st.focal)}mm・EV ${meter.ev.toFixed(1)}`
    g.fillStyle = warn.startsWith('⚠') ? '#ffb36b' : '#7f9196'; g.fillText(warn, 22, LH - 34)
    const hv = hit(LW - 230, LH - 66, 212, 56, { close: true })
    g.fillStyle = hv ? '#f2c94c' : '#26343a'; g.beginPath(); g.roundRect(LW - 230, LH - 66, 212, 56, 12); g.fill()
    g.fillStyle = hv ? '#111' : '#e8f0f2'; g.textAlign = 'center'; g.font = `600 26px ${FONT}`; g.fillText('完成（E）', LW - 124, LH - 37)
    g.textAlign = 'left'
    lcdTex.needsUpdate = true
  }
  function act(a) {
    if (a.close) return closePanel()
    if (a.mode) {
      // 切模式時從目前實際的值開始調，不會突然跳很遠
      const s = now(); Object.assign(cam, { mode: a.mode, ap: s.N, t: s.t, iso: s.iso })
      cam.ap = step(APERTURES, cam.ap, 0, lens().ap); cam.t = step(SHUTTERS, cam.t, 0); cam.iso = step(ISOS, cam.iso, 0, 100, body().iso)
    }
    if (a.k === 'ap') cam.ap = step(APERTURES, cam.ap, a.d, lens().ap)
    // 快門清單是由快到慢：▶ = 快門變慢（比較亮）
    if (a.k === 't') cam.t = step(SHUTTERS, cam.t, a.d)
    if (a.k === 'iso') cam.iso = step(ISOS, cam.iso, a.d, 100, body().iso)
    saveCam(); renderPanel()
  }
  // 滑鼠 → 螢幕上的哪一格（畫布鋪滿視窗中間，用它在畫面上的位置換算）
  function pick(e) {
    const r = lcdCanvas.getBoundingClientRect()
    const x = (e.clientX - r.left) / r.width * LW, y = (e.clientY - r.top) / r.height * LH
    return hits.findIndex((h) => x >= h.x && x <= h.x + h.w && y >= h.y && y <= h.y + h.h)
  }
  addEventListener('mousemove', (e) => { if (!panelOn) return; const i = pick(e); if (i !== hover) { hover = i; renderPanel() } lcdCanvas.style.cursor = i >= 0 ? 'pointer' : '' })
  lcdCanvas.addEventListener('click', (e) => { if (!panelOn) return; const i = pick(e); if (i >= 0) act(hits[i].act) })
  function openPanel() { meterNow(); hover = -1; panelOn = true; renderPanel(); lcdWrap.hidden = false; controls.unlock(); onPanel?.(true) }
  function closePanel() { panelOn = false; lcdWrap.hidden = true; controls.lock(); onPanel?.(false) }
  // 平常（不是設定畫面）螢幕就顯示目前的設定、比較暗
  let idleT = 0
  function idleScreen(dt) { if (panelOn || (idleT -= dt) > 0) return; idleT = 0.5; renderPanel() }

  // 對焦：觀景窗中心打一條射線，量到的距離變了就重新對焦（要 body.af 秒）
  const ray = new THREE.Raycaster(), center = new THREE.Vector2(0, 0)
  let targets = [], tgtT = 0
  function aim() {
    if ((tgtT -= 1) <= 0) {   // 可以擋住視線的東西（不透明的網格＋鳥），每 30 格重抓一次
      tgtT = 30; targets = []
      world.scene.traverse((o) => { if ((o.isMesh || o.isInstancedMesh) && o.visible && !o.material?.transparent) targets.push(o) })
    }
    ray.setFromCamera(center, camera)
    ray.far = 300
    const hit = ray.intersectObjects(targets, false)[0]
    return hit ? hit.distance : 300
  }

  // 鳥的速度（算動態模糊用）：每格記下畫面上那個物件（停著的模型或飛行模型）的位置
  const vel = new Map(), _p = new THREE.Vector3()
  function trackBirds(dt) {
    if (dt <= 0) return
    for (const b of world.birds) {
      if (b.target.distanceTo(camera.position) > 120) continue
      for (const m of b.built.birds ?? [b.built]) {
        const o = world.shotOf?.(m)?.obj ?? m.obj
        o.getWorldPosition(_p)
        const v = vel.get(o)
        if (!v) { vel.set(o, { p: _p.clone(), v: new THREE.Vector3() }); continue }
        const inst = _p.clone().sub(v.p).divideScalar(dt)
        v.v.lerp(inst.length() > 40 ? v.v : inst, 0.5); v.p.copy(_p)   // 換模型瞬間的跳動不算
      }
    }
  }

  // 測光：舉著相機時每 0.25 秒量一次（用照片的視角）
  const shotCam = new THREE.PerspectiveCamera()
  function photoCam() {
    shotCam.copy(camera, false)   // 不要連手和相機（鏡頭的子物件）一起複製
    shotCam.layers.disable(3)       // 第一人稱的手和相機（viewmodel.js 的 layer 3）不入鏡
    shotCam.aspect = PHOTO_W / PHOTO_H
    // 照片＝觀景窗裡 3:2 的那個框：框佔螢幕高度的比例換成照片的垂直視角
    let hf = $('.vf-frame').getBoundingClientRect().height / innerHeight
    if (!(hf > 0 && hf <= 1)) hf = 0.78   // 量不到（視窗縮到最小之類）就用平常的比例，不然整張照片的數字都會變 NaN
    shotCam.fov = THREE.MathUtils.radToDeg(2 * Math.atan(hf * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)))); shotCam.updateProjectionMatrix()
    return shotCam
  }
  function meterNow() { meter.measure(world.scene, photoCam()) }

  function update(dt) {
    clampFocal()
    const want = st.raised && !panelOn ? vfov(st.focal) : WALK_FOV   // 看背面螢幕時不是透過鏡頭看
    st.fov += (want - st.fov) * Math.min(1, dt * 12)
    camera.fov = st.fov; camera.updateProjectionMatrix()
    controls.pointerSpeed = Math.max(0.08, st.fov / WALK_FOV)   // 長焦時滑鼠轉得慢一點才瞄得準
    // 相機舉到眼前（viewmodel 的 raise 到 85%）才出現觀景窗；舉著的時候沒有畫面中間的準星點
    vf.classList.toggle('on', st.raised && !panelOn && (st.vfReady ?? true))
    hud.root.querySelector('.crosshair')?.classList.toggle('off', st.raised)
    st.cool -= dt
    trackBirds(dt)
    idleScreen(dt)
    if (!st.raised) return
    if ((st.meterT -= dt) <= 0) { st.meterT = 0.25; meterNow() }
    const d = aim()
    if (Math.abs(d - st.aimDist) > Math.max(0.15, st.aimDist * 0.06)) { st.aimDist = d; st.af = 0; st.locked = false }
    st.af += dt
    if (!st.locked && st.af >= body().af) {
      st.locked = true; st.focus = st.aimDist
      sfx.focusBeep()
      const a = $('.vf-af'); a.classList.remove('hit'); void a.offsetWidth; a.classList.add('hit')   // 合焦那一下對焦點閃亮
    }
    const s = now()
    $('.vf-af').classList.toggle('ok', st.locked)
    $('.vf-af').classList.toggle('busy', !st.locked)
    $('.vf-ok').classList.toggle('on', st.locked)
    $('.vf-mode').textContent = { auto: 'AUTO', A: 'A', S: 'S', M: 'M' }[cam.mode]
    $('.vf-f').textContent = `${Math.round(st.focal)}mm`
    $('.vf-t').textContent = fmtShutter(s.t)
    $('.vf-ap').textContent = fmtAp(s.N)
    $('.vf-iso').textContent = `ISO ${s.iso}`
    $('.vf-meter i').style.left = `${((THREE.MathUtils.clamp(s.over, -2.5, 2.5) + 2.5) / 5) * 100}%`
    $('.vf-meter').classList.toggle('bad', Math.abs(s.over) > 0.5)
    $('.vf-d').textContent = st.locked ? `對焦 ${st.focus < 100 ? st.focus.toFixed(1) : '∞'} m` : '對焦中…'
    const warn = s.t > 1 / st.focal ? '手震警告：快門太慢' : s.over < -1.5 ? '太暗' : s.over > 1.5 ? '太亮' : ''
    $('.vf-warn').textContent = warn; $('.vf-warn').hidden = !warn
  }

  // 景深（前後各一半）：光圈 N × 容許模糊圈 0.03mm × 距離² ÷ 焦距²（距離公尺、焦距 mm → 結果公尺）
  // 例：55mm f/4 拍 3.6 公尺 ≈ ±0.5 公尺；600mm f/6.3 拍 20 公尺 ≈ ±0.2 公尺
  const dofTol = (N, dist) => Math.max(0.02, (N * 30 * dist * dist) / (st.focal * st.focal))

  // 拍照：另外畫一張 3:2 的照片（同一個視角）
  // 畫進貼圖時 three 不做色調映射和 sRGB 轉換（只有畫到螢幕才做），所以先畫到 HDR 貼圖、再用 OutputPass 轉成跟螢幕一樣的顏色（曝光在這一步乘上去）
  const rt = new THREE.WebGLRenderTarget(PHOTO_W, PHOTO_H, { samples: 4, type: THREE.HalfFloatType })
  const rtOut = new THREE.WebGLRenderTarget(PHOTO_W, PHOTO_H)
  const outPass = new OutputPass()
  const canvas = document.createElement('canvas'); canvas.width = PHOTO_W; canvas.height = PHOTO_H
  const ctx = canvas.getContext('2d')
  const raw = document.createElement('canvas'); raw.width = PHOTO_W; raw.height = PHOTO_H
  const rctx = raw.getContext('2d')
  const tmp = document.createElement('canvas'); tmp.width = PHOTO_W; tmp.height = PHOTO_H
  const tctx = tmp.getContext('2d')
  // 方向模糊：同一張圖沿著 (dx, dy) 疊 n 次（手震、動態模糊）
  function smear(dst, src, dx, dy, clip) {
    const n = Math.min(16, Math.max(3, Math.ceil(Math.hypot(dx, dy) / 1.5)))
    dst.save()
    if (clip) { dst.beginPath(); dst.rect(...clip); dst.clip() }
    dst.clearRect(0, 0, PHOTO_W, PHOTO_H)
    for (let i = 0; i < n; i++) { const u = i / (n - 1) - 0.5; dst.globalAlpha = 1 / (i + 1); dst.drawImage(src, dx * u, dy * u) }
    dst.restore(); dst.globalAlpha = 1
  }
  function shoot() {
    if (st.cool > 0) return
    st.cool = 1 / body().fps
    meterNow()
    const s = now()
    sfx.shutter(s.t, { fast: body().fps >= 15 })
    const sc = photoCam()
    const focusDist = st.locked ? st.focus : st.aimDist * (0.6 + Math.random() * 0.8)   // 還沒對到焦就按：焦點亂跑
    const found = measurePhoto(world, sc, { focusDist, dofTol: dofTol(s.N, st.aimDist) })
    // 快門造成的模糊（像素）：手震＝快門比 1/焦距 慢幾倍；鳥在動＝橫越畫面的速度 × 快門
    const pxPerRad = (PHOTO_H / 2) / Math.tan(THREE.MathUtils.degToRad(sc.fov / 2))
    const shake = s.t > 1 / st.focal ? Math.min(40, (s.t * st.focal - 1) * 4) : 0
    const shakeDir = Math.random() * Math.PI * 2
    const camDir = sc.getWorldDirection(new THREE.Vector3())
    for (const f of found) {
      f.focusSharp = f.sharp
      const v = vel.get(f.obj)?.v ?? new THREE.Vector3()
      const across = v.clone().addScaledVector(camDir, -v.dot(camDir))
      f.motion = (across.length() / Math.max(f.dist, 0.5)) * pxPerRad * s.t
      f.vx = across.dot(new THREE.Vector3().setFromMatrixColumn(sc.matrixWorld, 0)); f.vy = across.dot(new THREE.Vector3().setFromMatrixColumn(sc.matrixWorld, 1))
      const blur = Math.hypot(f.motion, shake)
      f.sharp *= 1 / (1 + (blur / 4) ** 2)
    }
    const noise = 2.5 * Math.sqrt(s.iso / 100) * (NOISE[body().id] ?? 1) * (1 + Math.max(0, -s.over) * 0.4)
    const result = scorePhoto(found, { over: s.over, noise, shake })
    // 畫照片：曝光乘到色調映射前
    const r = world.renderer
    const prev = r.getRenderTarget(), ex0 = r.toneMappingExposure
    world.water.reflect(r, world.scene, sc, 0.5, 1)
    r.setRenderTarget(rt); r.render(world.scene, sc)
    r.toneMappingExposure = 1.05 * meter.photoGain(s.over)
    outPass.render(r, rtOut, rt)
    r.toneMappingExposure = ex0
    r.setRenderTarget(prev)
    const px = new Uint8Array(PHOTO_W * PHOTO_H * 4)
    r.readRenderTargetPixels(rtOut, 0, 0, PHOTO_W, PHOTO_H, px)
    const img = rctx.createImageData(PHOTO_W, PHOTO_H)
    for (let y = 0; y < PHOTO_H; y++) img.data.set(px.subarray((PHOTO_H - 1 - y) * PHOTO_W * 4, (PHOTO_H - y) * PHOTO_W * 4), y * PHOTO_W * 4)
    rctx.putImageData(img, 0, 0)
    // 1. 對焦：沒對到主角就整張照誤差糊（之前的做法）
    const sub = result.subject
    const defocus = sub ? (1 - sub.focusSharp) * 6 : (st.locked ? 0 : 3)
    ctx.filter = defocus > 0.3 ? `blur(${defocus.toFixed(1)}px)` : 'none'
    ctx.drawImage(raw, 0, 0); ctx.filter = 'none'
    // 2. 手震：整張沿一個方向拖
    if (shake > 0.8) { tctx.clearRect(0, 0, PHOTO_W, PHOTO_H); tctx.drawImage(canvas, 0, 0); smear(ctx, tmp, Math.cos(shakeDir) * shake, Math.sin(shakeDir) * shake) }
    // 3. 鳥在動：只拖鳥那一塊（沿牠在畫面上移動的方向）
    for (const f of found) {
      if (f.motion < 0.8 || !f.box) continue
      const [x0, y0, x1, y1] = f.box, pad = f.motion
      const clip = [(x0 + 1) / 2 * PHOTO_W - pad, (1 - y1) / 2 * PHOTO_H - pad, (x1 - x0) / 2 * PHOTO_W + pad * 2, (y1 - y0) / 2 * PHOTO_H + pad * 2]
      const k = f.motion / (Math.hypot(f.vx, f.vy) || 1)
      tctx.clearRect(0, 0, PHOTO_W, PHOTO_H); tctx.drawImage(canvas, 0, 0)
      ctx.save(); ctx.beginPath(); ctx.rect(...clip); ctx.clip()
      for (let i = 0; i < 10; i++) { const u = i / 9 - 0.5; ctx.globalAlpha = 1 / (i + 1); ctx.drawImage(tmp, f.vx * k * u, -f.vy * k * u) }
      ctx.restore(); ctx.globalAlpha = 1
    }
    // 4. 雜訊：ISO 越高、曝光越不足越多；亮度雜訊＋一點彩色雜訊
    if (noise > 1.5) {
      const d = ctx.getImageData(0, 0, PHOTO_W, PHOTO_H), a = d.data
      for (let i = 0; i < a.length; i += 4) {
        const g = (Math.random() + Math.random() + Math.random() - 1.5) * noise
        a[i] += g + (Math.random() - 0.5) * noise * 0.5; a[i + 1] += g; a[i + 2] += g + (Math.random() - 0.5) * noise * 0.5
      }
      ctx.putImageData(d, 0, 0)
    }
    const url = canvas.toDataURL('image/jpeg', 0.85)
    // 快門閃一下（慢快門閃久一點）
    const fl = $('.vf-flash'); fl.style.animationDuration = `${Math.max(0.18, Math.min(1, s.t * 2))}s`; fl.classList.remove('go'); void fl.offsetWidth; fl.classList.add('go')
    onShot?.({ url, ...result, found: found.map(({ obj, ...f }) => f), focal: Math.round(st.focal), lens: lens().name, body: body().name, time: Date.now(),
      exif: { mode: cam.mode, N: s.N, t: s.t, iso: s.iso, over: Math.round(s.over * 10) / 10, ev: Math.round(meter.ev * 10) / 10 } })
  }
  // 載入時先畫一次測光圖和照片圖：畫到貼圖用的著色器版本跟畫面不同，要先編譯好，不然一開始幾次測光會是全黑
  async function warm() {
    const r = world.renderer, sc = photoCam(), prev = r.getRenderTarget()
    r.setRenderTarget(rt)   // 編譯「畫到貼圖」的版本（色調映射、色彩空間跟畫到螢幕不同）
    await r.compileAsync(world.scene, sc)
    r.render(world.scene, sc); r.setRenderTarget(prev)
    for (let i = 0; i < 4 && meter.lum === meter.lum0; i++) { meterNow(); await new Promise((q) => setTimeout(q, 60)) }   // 分頁在背景時 requestAnimationFrame 不會跑，所以用 setTimeout
  }
  return { update, state: st, shoot, sfx, shotCam, settings: cam, warm, now, meter, openPanel, closePanel, get panelOpen() { return panelOn }, lcdTex, setScreen: (m) => { screenMesh = m } }
}
