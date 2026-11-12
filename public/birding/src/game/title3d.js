// 2026-11-12 主頁的即時 3D 小場景（使用者：「改即時 3D」）：傍晚的濕地一角、六隻紅鶴、會動的水面倒影、鏡頭緩慢移動。
// 重點是「馬上出現」：只載一個紅鶴模型（270 KB）和一張背景底圖（遊戲裡同一個位置拍的森林，200 KB），不碰公園的場景和地形。
// 構成：
//   背景＝一面立在 50 m 外的大看板，貼遊戲裡拍的那張森林（沒有紅鶴）；水面是 Reflector（即時鏡射紅鶴和看板）＋一點波紋扭曲
//   紅鶴＝同一個綁好骨架的模型複製六隻，動作在這裡自己寫（擺頸、低頭濾食、慢慢走）——遊戲裡那套動作系統綁著整個世界，載不進來
// 按「開始遊戲」時 stop()：停掉、釋放顯示記憶體，把 WebGL 讓給遊戲
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js'
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js'
import { Reflector } from 'three/addons/objects/Reflector.js'

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z)
const LAT = V(0, 0, -1)   // 模型頭朝 -x、左右對稱：身體的左右軸是 -z（跟遊戲 birds.js 的 TRIPO.lat 一樣；第一版寫成 +z，每節脖子都往反方向彎，低頭時頭翻上去）
const UPAX = V(0, 1, 0)
// 低頭濾食時每節脖子繞左右軸轉多少（跟遊戲裡 FEED.flamingo 同一組數字）
const FEED = { neck: 0.35, neck2: -0.17, neck3: -0.52, neck4: -0.66, neck5: -0.66, neck6: -0.63, neck7: -0.52, neck8: -0.35, neck9: -0.09, neck10: 0.26, head: 1.75 }
const ss = (a, b, v) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t) }

export async function startTitle3D(host, { ver = '' } = {}) {
  const canvas = document.createElement('canvas'); canvas.className = 'bg3d'
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' })
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5))
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0x9bacd0)   // 跟底圖的天空同色（第一版是紫的，寬螢幕看到邊會露出一條紫色）
  const camera = new THREE.PerspectiveCamera(27, 16 / 9, 0.3, 300)

  const [gl, plate] = await Promise.all([
    (() => { const L = new GLTFLoader(), D = new DRACOLoader(); D.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/'); L.setDRACOLoader(D); return L.loadAsync(`models/birds/flamingo-rig.glb?v=${ver}`) })(),
    new THREE.TextureLoader().loadAsync(`title-plate.jpg?v=${ver}`),
  ])
  plate.colorSpace = THREE.SRGBColorSpace; plate.anisotropy = 8; plate.wrapS = THREE.MirroredRepeatWrapping

  // 背景看板：寬 78 m、高 29 m，立在紅鶴後面 50 m；底邊埋進水面下一點（接縫被倒影蓋住）
  // 看板往左右各多延伸一倍寬（邊緣鏡像接續）：寬螢幕、滑鼠往旁邊移時不會看到圖的邊
  const BW = 78, BH = BW * 735 / 1968, EXT = 3
  const bg = new THREE.PlaneGeometry(BW * EXT, BH); { const u = bg.attributes.uv; for (let i = 0; i < u.count; i++) u.setX(i, (u.getX(i) - 0.5) * EXT + 0.5) }
  const board = new THREE.Mesh(bg, new THREE.MeshBasicMaterial({ map: plate, toneMapped: false }))
  board.position.set(-6, BH / 2 - 0.25, -50); scene.add(board)

  // 光：傍晚——低角度的暖色太陽從鏡頭這一側照過去，天光偏紫
  scene.add(new THREE.HemisphereLight(0xc9c2e6, 0x4a3f4a, 1.15))
  const sun = new THREE.DirectionalLight(0xffc79a, 2.4); sun.position.set(6, 5, 14); scene.add(sun)

  // 水面：即時鏡射；片段著色器加一點隨時間變的扭曲和傍晚的色調
  const uT = { value: 0 }
  const water = new Reflector(new THREE.PlaneGeometry(260, 160), { textureWidth: 1024, textureHeight: 1024, clipBias: 0.003, color: 0xcfc9d6 })
  water.rotation.x = -Math.PI / 2; water.position.set(0, 0, -10)
  water.material.uniforms.uT = uT
  water.material.fragmentShader = water.material.fragmentShader
    .replace('uniform vec3 color;', 'uniform vec3 color; uniform float uT;')
    .replace('vec4 base = texture2DProj( tDiffuse, vUv );', `vec4 uvw = vUv;
      float rp = sin(vUv.y * 0.9 + uT * 0.9) * 0.0012 + sin(vUv.x * 2.3 - uT * 0.6 + vUv.y * 0.4) * 0.0009;
      uvw.x += rp * uvw.w; uvw.y += rp * 0.6 * uvw.w;
      vec4 base = texture2DProj( tDiffuse, uvw );`)
  water.material.needsUpdate = true
  scene.add(water)

  // 紅鶴
  const src = gl.scene
  src.traverse((o) => { if (o.isMesh) { o.material = new THREE.MeshStandardMaterial({ map: o.material.map, roughness: 0.78, side: THREE.DoubleSide }); o.frustumCulled = false } })
  src.updateMatrixWorld(true)
  const bb = new THREE.Box3().setFromObject(src), K = 1.3 / (bb.max.y - bb.min.y)   // 站高 130 cm
  const birds = []
  const FLOCK = V(3.3, 0, -0.9)   // 紅鶴群的中間（SPOTS 的平均）：鏡頭繞著它轉、一直看著它
  // [x, z, 面向（弧度，0＝頭朝 -x）, 個性：phase, 大小]
  const SPOTS = [[1.2, -0.6, 0.2, 0.0, 1.0], [2.6, 0.5, 2.9, 1.7, 0.94], [3.6, -1.4, 0.5, 3.1, 1.04], [5.6, -0.2, 3.4, 4.4, 0.97], [6.9, -1.6, -0.3, 5.3, 1.0], [0.1, -2.6, 2.4, 2.4, 0.92]]
  for (const [x, z, yaw, ph, sz] of SPOTS) {
    const m = cloneSkinned(src), g = new THREE.Group(); g.add(m)
    m.scale.setScalar(K * sz); m.position.y = -bb.min.y * K * sz - 0.33 * sz   // 腳踝以下泡在水裡
    g.position.set(x, 0, z); g.rotation.y = yaw
    scene.add(g); g.updateMatrixWorld(true)
    const bones = {}
    m.traverse((o) => { if (o.isBone) bones[o.name] = o })
    const mq = m.getWorldQuaternion(new THREE.Quaternion()).invert(), wq = new THREE.Quaternion()
    for (const b of Object.values(bones)) { b.userData.rest = b.quaternion.clone(); b.userData.inv = mq.clone().multiply(b.getWorldQuaternion(wq)).invert() }
    birds.push({ g, bones, ph, sz, x0: x, z0: z, yaw0: yaw, feedT: -ph * 2.2, walk: false, w: { mode: 'walk', t: ph, h: yaw, gone: 0, leg: 0, x, z } })
  }
  // 骨頭繞「模型座標的軸」轉 a：local = rest × inv × R × inv⁻¹
  const _q = new THREE.Quaternion(), _r = new THREE.Quaternion(), _i = new THREE.Quaternion()
  const turn = (b, axis, a, first = true) => {
    if (!b) return
    _r.setFromAxisAngle(axis, a); _i.copy(b.userData.inv).invert()
    _q.copy(b.userData.inv).multiply(_r).multiply(_i)
    if (first) b.quaternion.copy(b.userData.rest).multiply(_q); else b.quaternion.multiply(_q)
  }

  let W = 0, H = 0
  const fit = () => {
    const w = host.clientWidth || innerWidth, h = host.clientHeight || innerHeight
    if (w === W && h === H) return
    W = w; H = h; renderer.setSize(w, h, false); camera.aspect = w / h
    camera.fov = camera.aspect < 1.2 ? 46 : 30; camera.updateProjectionMatrix()   // 直的螢幕拉廣一點，紅鶴才都在畫面裡
  }
  let mx = 0, my = 0
  const onMove = (e) => { mx = (e.clientX / innerWidth - 0.5) * 2; my = (e.clientY / innerHeight - 0.5) * 2 }
  addEventListener('pointermove', onMove)

  const clock = new THREE.Clock(); let raf = 0, alive = true, cx = 0, cy = 0
  const CYCLE = 13   // 每隻每 13 秒低頭濾食一次（各自錯開）
  function frame() {
    if (!alive) return
    raf = requestAnimationFrame(frame)
    const dt = Math.min(0.05, clock.getDelta()), t = clock.elapsedTime
    fit(); uT.value = t
    for (const b of birds) {
      const B = b.bones, p = b.ph
      // 低頭：2 秒彎下去、濾食 4.5 秒（頭左右掃）、1.5 秒抬起來
      const c = ((t + b.feedT) % CYCLE + CYCLE) % CYCLE
      const k = ss(0, 2, c) * (1 - ss(6.5, 8, c)), sweep = k * 0.22 * Math.sin(t * 2.4 + p)
      // 站著的時候：脖子慢慢擺、偶爾轉頭看
      const idle = 1 - k, look = idle * 0.5 * Math.sin(t * 0.23 + p * 1.7) * ss(0.2, 0.9, Math.sin(t * 0.11 + p))
      turn(B.body, LAT, -0.16 * k + 0.012 * Math.sin(t * 0.8 + p))
      for (const [n, a] of Object.entries(FEED)) {
        const br = 0.03 * Math.sin(t * 0.7 + p + n.length) * idle
        turn(B[n], LAT, a * k + br)
        if (n === 'neck8' || n === 'neck9' || n === 'neck10') turn(B[n], UPAX, look * 0.3 + sweep * 0.25, false)
        if (n === 'head') turn(B[n], UPAX, look * 0.5 + sweep * 0.5, false)
      }
      turn(B.tail, LAT, 0.05 * Math.sin(t * 1.3 + p))
      // 慢慢走的那幾隻：來回走 1.2 m，兩腳輪流往前
      // 走路（使用者：「他們移動會漂浮」——以前身體照正弦滑來滑去、腳只是前後擺，腳底在水裡滑；到頭還瞬間轉向）。
      // 現在：腳步跟走過的距離綁在一起——撐地的那隻腳在世界上不動（腳相對髖關節往後退的速度＝身體往前的速度），另一隻抬起往前跨；
      // 走 1.6 m 停下來站一下，再一小步一小步原地轉身，走回去
      if (b.walk) {
        const w = b.w, Lg = 0.62 * b.sz, C = 0.7 * b.sz, S = C / 2, V0 = 0.2 * b.sz   // 腿長、一個步態週期走的距離、撐地時腳的位移、走路速度
        w.t += dt
        let v = 0, turnV = 0
        if (w.mode === 'walk') { v = V0 * Math.min(1, w.t / 0.8); if ((w.gone += v * dt) >= 1.6 * b.sz) { w.mode = 'stop'; w.t = 0 } }
        else if (w.mode === 'stop') { if (w.t > 2.6) { w.mode = 'turn'; w.t = 0; w.h0 = w.h } }
        else if (w.mode === 'turn') { const k = ss(0, 3.2, w.t); const nh = w.h0 + Math.PI * k; turnV = Math.abs(nh - w.h) / Math.max(dt, 1e-4); w.h = nh; if (w.t >= 3.2) { w.mode = 'walk'; w.t = 0; w.gone = 0 } }
        // 往前（模型頭朝 -x，繞 y 轉 h 之後的方向）
        const fx = -Math.cos(w.h), fz = Math.sin(w.h)
        w.x += fx * v * dt; w.z += fz * v * dt
        // 步態相位：走路照走過的距離前進；原地轉身時照轉的速度踏小步
        w.leg += (v / C + Math.min(0.8, turnV * 0.25)) * dt
        const moving = Math.min(1, v / (V0 * 0.5) + Math.min(1, turnV * 2)), amp = v > 0.01 ? 1 : 0.35
        const legAng = (q) => {
          let off, lift = 0
          if (q < 0.5) off = S / 2 - S * (q / 0.5)                                  // 撐地：腳從前面往後退（身體往前）
          else { const u = (q - 0.5) / 0.5; off = -S / 2 + S * ss(0, 1, u); lift = Math.sin(Math.PI * u) }   // 抬腳往前跨
          return [Math.atan2(off * amp, Lg) * moving, lift * moving]
        }
        const pl = (w.leg % 1 + 1) % 1, [aL, lL] = legAng(pl), [aR, lR] = legAng((pl + 0.5) % 1)
        turn(B.thighL, LAT, -aL); turn(B.thighR, LAT, -aR)
        turn(B.shinL, LAT, lL * 0.55); turn(B.shinR, LAT, lR * 0.55)   // 往前跨時「膝」（其實是腳踝）往後折、腳抬離水面
        turn(B.footL, LAT, -lL * 0.4); turn(B.footR, LAT, -lR * 0.4)
        b.g.position.set(w.x, 0.012 * Math.abs(Math.sin(pl * Math.PI * 2)) * moving, w.z); b.g.rotation.y = w.h
      }
    }
    // 鏡頭：很慢地左右漂、跟著滑鼠偏一點（有前後景的視差）
    cx += (mx - cx) * Math.min(1, dt * 1.5); cy += (my - cy) * Math.min(1, dt * 1.5)
    // 2026-11-13 使用者：「應該移動的只是相機，紅鶴不動」——紅鶴站在原地（只有低頭濾食、轉頭），鏡頭繞著紅鶴群慢慢左右來回（±11°、約 90 秒一個來回），
    // 一直對準紅鶴群的中間；看的點往右偏一點，紅鶴才在畫面右半邊（左邊是選單）。滑鼠只讓鏡頭再偏一點點
    { const C0 = FLOCK, R = 11.5, a = Math.sin(t * 0.07) * 0.19 + cx * 0.06
      camera.position.set(C0.x + Math.sin(a) * R, 0.92 + Math.sin(t * 0.05) * 0.08 - cy * 0.08, C0.z + Math.cos(a) * R)
      camera.lookAt(C0.x - 2.9, 1.05, C0.z) }
    if (window.__t3cam) { const c = window.__t3cam(birds); camera.position.copy(c.p); camera.lookAt(c.t) }   // 測試用：自動測試腳本指定鏡頭
    renderer.render(scene, camera)
  }
  fit(); frame()
  host.prepend(canvas)
  requestAnimationFrame(() => canvas.classList.add('on'))

  return {
    canvas,
    stop() {
      alive = false; cancelAnimationFrame(raf); removeEventListener('pointermove', onMove)
      scene.traverse((o) => { o.geometry?.dispose?.(); const ms = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : []; for (const m of ms) { m.map?.dispose?.(); m.dispose?.() } })
      water.getRenderTarget?.().dispose?.(); plate.dispose()
      renderer.dispose(); renderer.forceContextLoss?.(); canvas.remove()
    },
  }
}
