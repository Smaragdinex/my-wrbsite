// 相機：右鍵舉起（觀景窗）、滾輪變焦、自動對焦（看機身對焦速度）、左鍵拍照。
// 焦段用全片幅換算視角；照片是另外畫一張 3:2 的圖，沒對到焦就照誤差模糊。
import * as THREE from 'three'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import { measurePhoto, scorePhoto } from './scoring.js'

// 機身：af 對焦要幾秒、fps 連拍、iso 暗處能拍到多亮（之後夜晚用）
export const BODIES = [
  { id: 'b1', name: '入門機身 Lark 100', price: 0, af: 0.7, fps: 3, iso: 1600 },
  { id: 'b2', name: '中階機身 Kestrel 500', price: 6000, af: 0.3, fps: 8, iso: 6400 },
  { id: 'b3', name: '旗艦機身 Falcon 9', price: 22000, af: 0.1, fps: 20, iso: 25600 },
]
// 鏡頭：焦段範圍（mm）、光圈（越小景深越淺、越好分離背景）
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

export function createCamera({ world, camera, controls, hud, gear, onShot }) {
  const st = { raised: false, focal: 35, focus: 10, aimDist: 10, af: 0, locked: false, fov: WALK_FOV, cool: 0 }
  // 觀景窗疊圖
  const vf = document.createElement('div')
  vf.className = 'viewfinder'
  vf.innerHTML = `<div class="vf-mask"></div><div class="vf-frame"><i></i><i></i><i></i><i></i></div><div class="vf-af"></div>
    <div class="vf-bar"><span class="vf-f"></span><span class="vf-ap"></span><span class="vf-d"></span><span class="vf-st"></span></div><div class="vf-flash"></div>`
  hud.root.appendChild(vf)
  const $ = (s) => vf.querySelector(s)

  const lens = () => gear.lens(), body = () => gear.body()
  const clampFocal = () => { st.focal = THREE.MathUtils.clamp(st.focal, lens().min, lens().max) }
  clampFocal()

  addEventListener('contextmenu', (e) => e.preventDefault())
  addEventListener('mousedown', (e) => {
    if (!controls.isLocked) return
    if (e.button === 2) { st.raised = true; st.af = 0; st.locked = false }
    if (e.button === 0 && st.raised) shoot()
  })
  addEventListener('mouseup', (e) => { if (e.button === 2) st.raised = false })
  addEventListener('wheel', (e) => {
    if (!controls.isLocked || !st.raised) return
    st.focal *= Math.exp(-e.deltaY * 0.0015)
    clampFocal()
  }, { passive: true })

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

  function update(dt) {
    clampFocal()
    const want = st.raised ? vfov(st.focal) : WALK_FOV
    st.fov += (want - st.fov) * Math.min(1, dt * 12)
    camera.fov = st.fov; camera.updateProjectionMatrix()
    controls.pointerSpeed = Math.max(0.08, st.fov / WALK_FOV)   // 長焦時滑鼠轉得慢一點才瞄得準
    vf.classList.toggle('on', st.raised)
    st.cool -= dt
    if (!st.raised) return
    const d = aim()
    if (Math.abs(d - st.aimDist) > Math.max(0.15, st.aimDist * 0.06)) { st.aimDist = d; st.af = 0; st.locked = false }
    st.af += dt
    if (!st.locked && st.af >= body().af) { st.locked = true; st.focus = st.aimDist }
    $('.vf-af').classList.toggle('ok', st.locked)
    $('.vf-f').textContent = `${Math.round(st.focal)}mm`
    $('.vf-ap').textContent = `f/${lens().ap}`
    $('.vf-d').textContent = st.locked ? `對焦 ${st.focus < 100 ? st.focus.toFixed(1) : '∞'} m` : '對焦中…'
    $('.vf-st').textContent = body().name.split(' ')[0]
  }

  // 景深（前後各一半）：光圈 N × 容許模糊圈 0.03mm × 距離² ÷ 焦距²（距離公尺、焦距 mm → 結果公尺）
  // 例：55mm f/4 拍 3.6 公尺 ≈ ±0.5 公尺；600mm f/6.3 拍 20 公尺 ≈ ±0.2 公尺
  const dofTol = (dist) => Math.max(0.02, (lens().ap * 30 * dist * dist) / (st.focal * st.focal))

  // 拍照：另外畫一張 3:2 的照片（同一個視角），沒對到焦的照誤差模糊
  // 畫進貼圖時 three 不做色調映射和 sRGB 轉換（只有畫到螢幕才做），所以先畫到 HDR 貼圖、再用 OutputPass 轉成跟螢幕一樣的顏色
  const rt = new THREE.WebGLRenderTarget(PHOTO_W, PHOTO_H, { samples: 4, type: THREE.HalfFloatType })
  const rtOut = new THREE.WebGLRenderTarget(PHOTO_W, PHOTO_H)
  const outPass = new OutputPass()
  const shotCam = new THREE.PerspectiveCamera()
  const canvas = document.createElement('canvas'); canvas.width = PHOTO_W; canvas.height = PHOTO_H
  const ctx = canvas.getContext('2d')
  const raw = document.createElement('canvas'); raw.width = PHOTO_W; raw.height = PHOTO_H
  const rctx = raw.getContext('2d')
  function shoot() {
    if (st.cool > 0) return
    st.cool = 1 / body().fps
    shotCam.copy(camera)
    shotCam.aspect = PHOTO_W / PHOTO_H
    // 照片＝觀景窗裡 3:2 的那個框：框佔螢幕高度的比例換成照片的垂直視角
    let hf = $('.vf-frame').getBoundingClientRect().height / innerHeight
    if (!(hf > 0 && hf <= 1)) hf = 0.78   // 量不到（視窗縮到最小之類）就用平常的比例，不然整張照片的數字都會變 NaN
    shotCam.fov = THREE.MathUtils.radToDeg(2 * Math.atan(hf * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)))); shotCam.updateProjectionMatrix()
    const focusDist = st.locked ? st.focus : st.aimDist * (0.6 + Math.random() * 0.8)   // 還沒對到焦就按：焦點亂跑
    const found = measurePhoto(world, shotCam, { focusDist, dofTol: dofTol(st.aimDist) })
    const result = scorePhoto(found)
    // 畫照片
    const r = world.renderer
    const prev = r.getRenderTarget()
    world.water.reflect(r, world.scene, shotCam, 0.5, 1)
    r.setRenderTarget(rt); r.render(world.scene, shotCam)
    outPass.render(r, rtOut, rt)
    r.setRenderTarget(prev)
    const px = new Uint8Array(PHOTO_W * PHOTO_H * 4)
    r.readRenderTargetPixels(rtOut, 0, 0, PHOTO_W, PHOTO_H, px)
    const img = rctx.createImageData(PHOTO_W, PHOTO_H)
    for (let y = 0; y < PHOTO_H; y++) img.data.set(px.subarray((PHOTO_H - 1 - y) * PHOTO_W * 4, (PHOTO_H - y) * PHOTO_W * 4), y * PHOTO_W * 4)
    rctx.putImageData(img, 0, 0)
    const s = result.subject
    const blur = s ? (1 - s.sharp) * 6 : (st.locked ? 0 : 3)
    ctx.filter = blur > 0.3 ? `blur(${blur.toFixed(1)}px)` : 'none'
    ctx.drawImage(raw, 0, 0); ctx.filter = 'none'
    const url = canvas.toDataURL('image/jpeg', 0.85)
    // 快門閃一下
    const fl = $('.vf-flash'); fl.classList.remove('go'); void fl.offsetWidth; fl.classList.add('go')
    onShot?.({ url, ...result, found, focal: Math.round(st.focal), lens: lens().name, body: body().name, time: Date.now() })
  }
  return { update, state: st, shoot, shotCam }
}
