// 草鴞的巢（2026-11-09 使用者：38 號搬到森林入口旁的大草地，加上牠的巢）
// 真的草鴞巢：在白茅草叢底下的地上，把草踩扁鋪成一個淺盤，上面的草還立著、往內彎成一個「草屋頂」，
// 從巢口往外有一條被壓扁的草隧道（親鳥進出的通道）。蛋是純白色、偏圓，一窩 4～6 顆。
// 這裡做：踩扁的乾草盤＋一圈墊高的巢緣、5 顆白蛋（一顆剛破殼、旁邊有殼）、白茅草叢（拱在巢上面，巢口朝鏡頭留開）、
// 白茅的白色穗子、往外的草隧道、地上幾顆食繭（吐出來的毛和骨頭）、步道邊一根刻著貓頭鷹臉的木樁（不寫字，各語言都看得懂）。
import * as THREE from 'three'

// 簡單的亂數（固定種子：每次載入長得一樣）
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296) }

// 草葉：一條從 base 出發的細長葉片，分 4 節，沿著 dir（水平方向）彎、tip 往下垂。輸出到 pos/col/idx
function blade(out, base, { dir, len, up, bend, w, c0, c1 }) {
  const N = 4, i0 = out.pos.length / 3
  const side = new THREE.Vector3(-dir.z, 0, dir.x)
  for (let k = 0; k <= N; k++) {
    const t = k / N
    // 高度：up 決定一開始多直，bend 讓尾端往 dir 倒
    const yy = len * (up * t - bend * t * t)
    const hh = len * (Math.sqrt(Math.max(0, 1 - up * up)) * t + bend * 0.6 * t * t)
    const px = base.x + dir.x * hh, pz = base.z + dir.z * hh, py = base.y + yy
    const ww = w * (1 - t * 0.92)
    const c = c0.clone().lerp(c1, t)
    out.pos.push(px - side.x * ww, py, pz - side.z * ww, px + side.x * ww, py, pz + side.z * ww)
    out.col.push(c.r, c.g, c.b, c.r, c.g, c.b)
    if (k) { const a = i0 + (k - 1) * 2; out.idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2) }
  }
}
function meshOf(out, mat) {
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(out.pos, 3))
  g.setAttribute('color', new THREE.Float32BufferAttribute(out.col, 3))
  g.setIndex(out.idx); g.computeVertexNormals()
  const m = new THREE.Mesh(g, mat); m.castShadow = false; m.receiveShadow = true
  return m
}

// x, z：巢中心；face：巢口朝的方向（弧度，atan2(dx, dz)）；groundAt(x, z)：地面高度；owl：鳥站的位置（食繭撒在牠附近）；sign：木樁位置
export function buildOwlNest({ x, z, face, groundAt, owl, sign }) {
  const rnd = rng(3801)
  const g = new THREE.Group(); g.name = 'grassOwlNest'
  const cf = Math.cos(face), sf = Math.sin(face)
  // 巢的局部座標（+z 朝巢口）→ 世界座標
  const W = (lx, lz) => [x + lx * cf + lz * sf, z - lx * sf + lz * cf]
  const P = (lx, lz, dy = 0) => { const [wx, wz] = W(lx, lz); return new THREE.Vector3(wx, groundAt(wx, wz) + dy, wz) }
  const D = (a) => new THREE.Vector3(Math.sin(a + face), 0, Math.cos(a + face))   // 局部角度 a（0＝巢口）→ 世界水平方向
  const H = (h, s, l) => new THREE.Color().setHSL(h, s, l, THREE.SRGBColorSpace)   // 頂點色要線性：照 sRGB 給、轉過去（不然整片發白）
  const bladeMat = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.92 })

  // 1. 踩扁的乾草盤：草一根根貼地、繞著巢心轉一圈一圈鋪；外圈墊高成巢緣，中間微微凹
  {
    const out = { pos: [], col: [], idx: [] }
    for (let i = 0; i < 520; i++) {
      const r = Math.sqrt(rnd()) * 0.5, a = rnd() * Math.PI * 2
      const lx = Math.sin(a) * r, lz = Math.cos(a) * r * 1.1
      const rim = Math.exp(-(((r - 0.36) / 0.08) ** 2))   // 巢緣
      const base = P(lx, lz, 0.012 + rim * 0.055 + rnd() * 0.01)
      // 方向：大致沿著圓周（繞圈鋪），帶一點亂
      const dir = D(a + Math.PI / 2 + (rnd() - 0.5) * 0.9)
      const dry = rnd()
      blade(out, base, { dir, len: 0.16 + rnd() * 0.2, up: 0.05 + rim * 0.25, bend: 0.06, w: 0.006 + rnd() * 0.004,
        c0: H(0.09 + dry * 0.03, 0.4, 0.3 + dry * 0.14), c1: H(0.1 + dry * 0.02, 0.38, 0.44 + dry * 0.14) })
    }
    // 巢外一圈也被踩扁（不是整齊的圓）
    for (let i = 0; i < 260; i++) {
      const r = 0.45 + rnd() * 0.45, a = rnd() * Math.PI * 2
      const base = P(Math.sin(a) * r, Math.cos(a) * r, 0.01)
      blade(out, base, { dir: D(a + (rnd() - 0.5) * 1.4), len: 0.2 + rnd() * 0.25, up: 0.08, bend: 0.05, w: 0.007,
        c0: H(0.15, 0.34, 0.28 + rnd() * 0.06), c1: H(0.13, 0.34, 0.4 + rnd() * 0.1) })
    }
    // 草隧道：從巢口往外 1.5 公尺，一條 35 公分寬、草往外倒的通道
    for (let i = 0; i < 160; i++) {
      const t = rnd(), lz = 0.45 + t * 1.5, lx = (rnd() - 0.5) * 0.36 + Math.sin(lz * 1.3) * 0.12
      const base = P(lx, lz, 0.012)
      blade(out, base, { dir: D((rnd() - 0.5) * 0.7), len: 0.22 + rnd() * 0.22, up: 0.06, bend: 0.04, w: 0.007,
        c0: H(0.17, 0.36, 0.27 + rnd() * 0.06), c1: H(0.15, 0.34, 0.38 + rnd() * 0.1) })
    }
    g.add(meshOf(out, bladeMat))
    // 巢底：一塊乾草色的淺盤（草縫之間看到的不是綠地）
    const pad = new THREE.Mesh(new THREE.CircleGeometry(0.33, 24).rotateX(-Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: 0x6e5a3c, roughness: 1 }))
    pad.position.copy(P(0, 0, 0.008)); pad.scale.set(1, 1, 1.1); pad.rotation.y = face; pad.receiveShadow = true; g.add(pad)
  }

  // 2. 蛋：純白、偏圓（草鴞蛋約 4 公分），四顆躺著、一顆剛破殼（旁邊兩片殼）
  {
    const pts = []
    for (let i = 0; i <= 16; i++) { const t = i / 16, a = t * Math.PI; pts.push(new THREE.Vector2(Math.sin(a) * (1 - 0.12 * Math.cos(a)) * 0.5, -Math.cos(a) * 0.62)) }
    const eggG = new THREE.LatheGeometry(pts, 20)
    const eggM = new THREE.MeshStandardMaterial({ color: 0xf4f1e8, roughness: 0.45 })
    const S = 0.05
    const spots = [[-0.05, -0.03, 0.4], [0.04, -0.05, 2.2], [0.0, 0.04, 1.1], [-0.07, 0.05, 2.9]]
    for (const [lx, lz, a] of spots) {
      const e = new THREE.Mesh(eggG, eggM); e.scale.setScalar(S * 1.0)
      e.position.copy(P(lx, lz, 0.03 + 0.5 * S))
      e.rotation.set(Math.PI / 2 + (rnd() - 0.5) * 0.3, face + a, 0, 'YXZ'); e.castShadow = true; g.add(e)
    }
    // 破掉的蛋殼：兩個半殼（Lathe 只取一部分、雙面）
    const half = new THREE.LatheGeometry(pts.slice(0, 10), 18)
    const shellM = new THREE.MeshStandardMaterial({ color: 0xf2eee2, roughness: 0.5, side: THREE.DoubleSide })
    for (const [lx, lz, rx, ry] of [[0.1, 0.07, 2.4, 0.7], [0.13, -0.02, 1.9, 2.5]]) {
      const s = new THREE.Mesh(half, shellM); s.scale.setScalar(S)
      s.position.copy(P(lx, lz, 0.045)); s.rotation.set(rx, face + ry, 0.3); g.add(s)
    }
  }

  // 3. 白茅草叢：圍在巢的左右和後面，葉子長、往巢中間拱過去，像一個草屋頂；巢口（局部 +z）前方 ±55° 留開
  {
    const out = { pos: [], col: [], idx: [] }
    const plumes = []
    for (let i = 0; i < 900; i++) {
      const a = rnd() * Math.PI * 2
      let da = ((a + Math.PI) % (Math.PI * 2)) - Math.PI          // 跟巢口方向的夾角
      const open = Math.abs(da) < 0.95
      const r = (open ? 0.75 : 0.5) + Math.pow(rnd(), 0.7) * (open ? 0.9 : 1.15)
      if (open && rnd() < 0.7) continue
      const lx = Math.sin(a) * r, lz = Math.cos(a) * r
      if (Math.abs(lx) < 0.3 && lz > 0.4 && lz < 3) continue   // 隧道上不長
      const base = P(lx, lz, -0.02)
      const inner = r < 1.0 && !open
      // 靠近巢的：往巢心倒（拱成屋頂）；外面的：比較直、各方向亂倒
      const toC = D(a + Math.PI + (rnd() - 0.5) * 0.6)
      const dir = inner ? toC : D(rnd() * Math.PI * 2)
      const len = (inner ? 0.55 : 0.6) + rnd() * (inner ? 0.35 : 0.55)
      const tone = rnd(), dryTip = 0.3 + rnd() * 0.5
      blade(out, base, { dir, len, up: inner ? 0.62 + rnd() * 0.15 : 0.82 + rnd() * 0.15, bend: inner ? 0.5 + rnd() * 0.25 : 0.2 + rnd() * 0.25,
        w: 0.008 + rnd() * 0.005,
        c0: H(0.24 + tone * 0.04, 0.38, 0.2 + tone * 0.08), c1: H(0.17 - dryTip * 0.05, 0.4, 0.38 + dryTip * 0.2) })
      // 白茅的穗：外圈有些草抽出細長的白色毛穗（秋天整片銀白）
      if (!inner && rnd() < 0.09) plumes.push({ base, h: 0.8 + rnd() * 0.45, lean: D(rnd() * Math.PI * 2).multiplyScalar(0.08 + rnd() * 0.1) })
    }
    g.add(meshOf(out, bladeMat))
    // 穗：細稈＋一束白色絨毛（長橢圓、軟的白），一束由幾顆拉長的小球疊成，邊緣才不會太硬
    const stalk = { pos: [], col: [], idx: [] }
    const fluffG = new THREE.SphereGeometry(1, 8, 6)
    const fluffM = new THREE.MeshStandardMaterial({ color: 0xf3efe6, roughness: 1, transparent: true, opacity: 0.88, depthWrite: false })
    const fl = new THREE.InstancedMesh(fluffG, fluffM, plumes.length * 4)
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0)
    let n = 0
    for (const p of plumes) {
      const top = p.base.clone().add(new THREE.Vector3(p.lean.x, p.h, p.lean.z))
      const dir = top.clone().sub(p.base).normalize()
      blade(stalk, p.base, { dir: new THREE.Vector3(p.lean.x, 0, p.lean.z).normalize(), len: p.h, up: dir.y, bend: 0, w: 0.0035,
        c0: H(0.2, 0.3, 0.3), c1: H(0.12, 0.25, 0.55) })
      q.setFromUnitVectors(up, dir)
      for (let k = 0; k < 4; k++) {
        const c = top.clone().addScaledVector(dir, 0.03 + k * 0.035).add(new THREE.Vector3((rnd() - 0.5) * 0.01, 0, (rnd() - 0.5) * 0.01))
        const s = 0.018 - k * 0.0025
        m4.compose(c, q, new THREE.Vector3(s, 0.045, s)); fl.setMatrixAt(n++, m4)
      }
    }
    fl.count = n; fl.instanceMatrix.needsUpdate = true; fl.renderOrder = 2
    g.add(meshOf(stalk, bladeMat), fl)
  }

  // 4. 食繭：草鴞把吞下去的老鼠毛和骨頭吐成一顆顆灰色小團，常在休息的地方附近
  {
    const pg = new THREE.CapsuleGeometry(0.011, 0.025, 3, 7)
    const pm = new THREE.MeshStandardMaterial({ color: 0x6a6158, roughness: 1, flatShading: true })
    const bone = new THREE.MeshStandardMaterial({ color: 0xe8e0cc, roughness: 0.7 })
    const ox = owl[0], oz = owl[1]
    for (let i = 0; i < 4; i++) {
      const a = rnd() * Math.PI * 2, r = 0.35 + rnd() * 0.35
      const wx = ox + Math.sin(a) * r, wz = oz + Math.cos(a) * r
      const p = new THREE.Mesh(pg, pm); p.scale.set(1 + rnd() * 0.3, 1, 1 + rnd() * 0.2)
      p.position.set(wx, groundAt(wx, wz) + 0.012, wz); p.rotation.set(Math.PI / 2, 0, rnd() * Math.PI); g.add(p)
      // 露出一小截白骨
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.0025, 0.002, 0.03, 5), bone)
      b.position.set(wx + 0.01, groundAt(wx, wz) + 0.022, wz); b.rotation.set(Math.PI / 2, 0, rnd() * Math.PI); g.add(b)
    }
  }

  // 5. 步道邊的木樁：頂端一塊斜面木板，上面是燒刻的心形臉（草鴞的臉盤）（不寫字，各語言都看得懂）
  if (sign) {
    const [sx, sz, sa] = sign, gy = groundAt(sx, sz)
    const wood = new THREE.MeshStandardMaterial({ color: 0x6b4a2e, roughness: 0.85 })
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 1.0, 8), wood)
    post.position.set(sx, gy + 0.5, sz); post.castShadow = true; g.add(post)
    // 木板：畫一張臉（canvas 貼圖）
    const cv = document.createElement('canvas'); cv.width = cv.height = 256
    const c = cv.getContext('2d')
    c.fillStyle = '#9a7650'; c.fillRect(0, 0, 256, 256)
    for (let i = 0; i < 40; i++) { c.strokeStyle = `rgba(70,45,25,${0.08 + Math.random() * 0.12})`; c.lineWidth = 1 + Math.random() * 2; const y = Math.random() * 256; c.beginPath(); c.moveTo(0, y); c.bezierCurveTo(80, y + 6, 170, y - 6, 256, y + (Math.random() - 0.5) * 8); c.stroke() }
    // 心形臉盤（燒刻的深色邊）
    c.save(); c.translate(128, 132)
    const heart = () => { c.beginPath(); c.moveTo(0, -62); c.bezierCurveTo(28, -98, 92, -70, 80, -10); c.bezierCurveTo(70, 46, 22, 86, 0, 96); c.bezierCurveTo(-22, 86, -70, 46, -80, -10); c.bezierCurveTo(-92, -70, -28, -98, 0, -62); c.closePath() }
    heart(); c.fillStyle = '#e9d9bd'; c.fill(); c.lineWidth = 9; c.strokeStyle = '#3b2615'; c.stroke()
    c.fillStyle = '#20140b'; for (const ex of [-30, 30]) { c.beginPath(); c.arc(ex, 4, 12, 0, Math.PI * 2); c.fill() }
    c.beginPath(); c.moveTo(-6, 30); c.lineTo(6, 30); c.lineTo(0, 46); c.closePath(); c.fillStyle = '#b39270'; c.fill()
    c.restore()
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace
    const board = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.34, 0.035),
      [wood, wood, wood, wood, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8 }), wood])
    board.position.set(sx, gy + 1.05, sz); board.rotation.set(-0.35, sa, 0, 'YXZ'); board.castShadow = true; g.add(board)
  }
  return g
}
