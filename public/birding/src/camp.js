// 營地（2026-11-09 使用者：右邊岔路加大，上面做一個休息地，三頂帳篷圍著中間的營火）
// 營地在 camp 支線的盡頭（layout.js CAMP，那一塊地形已經攤平）。
// 中間：石頭圍一圈的火坑、交叉的木柴、會跳動的火焰（三層加色的火舌）、往上飄的煙、暖色的點光源（一閃一閃，晚上照亮四周）
//       火上一個三腳架吊著一個燻黑的水壺
// 外圍：三頂三角帳篷（橘、綠、藍，門簾捲起來一邊、營釘和營繩），門口朝營火；帳篷之間放原木長椅、一個樹墩上擺營燈、背包、柴堆
import * as THREE from 'three'
import { CAMP, ALP_SPURS, alpineHeight, addCollider } from './layout.js'

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z)
const TAU = Math.PI * 2
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296) }
function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h)
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; return t
}

export function buildCamp(scene) {
  const g = new THREE.Group(); g.name = 'camp'
  const rnd = rng(707)
  const cx = CAMP.x, cz = CAMP.z, gy = (x, z) => alpineHeight(x, z)
  const y0 = gy(cx, cz)
  // 從哪裡走進來：支線最後一段的方向（入口那邊不放帳篷）
  const sp = ALP_SPURS.find((q) => q.name === 'camp').pts, a = sp.at(-2), e = sp.at(-1)
  const inA = Math.atan2(a[0] - e[0], a[1] - e[1])   // 從營火看向入口的方向

  // ---------- 火坑 ----------
  const stoneM = new THREE.MeshStandardMaterial({ color: 0x77736c, roughness: 0.95, flatShading: true })
  const sootM = new THREE.MeshStandardMaterial({ color: 0x1d1a17, roughness: 1 })
  const ash = new THREE.Mesh(new THREE.CircleGeometry(0.62, 24).rotateX(-Math.PI / 2), sootM); ash.position.set(cx, y0 + 0.015, cz); ash.receiveShadow = true; g.add(ash)
  for (let i = 0; i < 13; i++) {
    const t = i / 13 * TAU, st = new THREE.Mesh(new THREE.DodecahedronGeometry(0.17 + rnd() * 0.06, 0), stoneM)
    st.position.set(cx + Math.cos(t) * 0.72, y0 + 0.07, cz + Math.sin(t) * 0.72); st.scale.set(1.1, 0.7, 0.9); st.rotation.set(rnd() * 3, rnd() * 3, rnd() * 3)
    st.castShadow = true; st.receiveShadow = true; g.add(st)
  }
  addCollider(cx, cz, 0.85, y0 + 0.5)
  // 木柴（樹皮貼圖＋切面），交叉疊成金字塔，下半部燒黑
  const barkT = canvasTex(64, 128, (c, w, h) => {
    c.fillStyle = '#5b4330'; c.fillRect(0, 0, w, h); const r = rng(3)
    for (let i = 0; i < 40; i++) { c.strokeStyle = `rgba(30,20,12,${0.3 + r() * 0.4})`; c.lineWidth = 1 + r() * 2; const x = r() * w; c.beginPath(); c.moveTo(x, 0); c.lineTo(x + (r() - 0.5) * 6, h); c.stroke() }
  })
  const logM = new THREE.MeshStandardMaterial({ map: barkT, roughness: 0.95 })
  const charM = new THREE.MeshStandardMaterial({ map: barkT, color: 0x4a3a30, roughness: 1, emissive: 0xff3a08, emissiveIntensity: 0.05 })   // 燒黑的木柴，只透一點點紅光
  const cutM = new THREE.MeshStandardMaterial({ color: 0xc9a77a, roughness: 0.85 })
  const between = (p, q, r, mat = [logM, cutM, cutM]) => {
    const d = q.clone().sub(p), m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, d.length(), 9), mat)
    m.position.copy(p).add(q).multiplyScalar(0.5); m.quaternion.setFromUnitVectors(V(0, 1, 0), d.normalize()); m.castShadow = true; m.receiveShadow = true; return m
  }
  for (let i = 0; i < 6; i++) {
    const t = i / 6 * TAU + 0.3, r0 = 0.5
    g.add(between(V(cx + Math.cos(t) * r0, y0 + 0.05, cz + Math.sin(t) * r0), V(cx + Math.cos(t) * 0.05, y0 + 0.55, cz + Math.sin(t) * 0.05), 0.045, [charM, charM, charM]))
  }
  // 炭火：一團發光的小塊
  const emberM = new THREE.MeshStandardMaterial({ color: 0x2a0d04, emissive: 0xff5a14, emissiveIntensity: 1.6, roughness: 1 })
  for (let i = 0; i < 14; i++) {
    const t = rnd() * TAU, d = rnd() * 0.32, em = new THREE.Mesh(new THREE.DodecahedronGeometry(0.05 + rnd() * 0.04, 0), emberM)
    em.position.set(cx + Math.cos(t) * d, y0 + 0.04, cz + Math.sin(t) * d); em.rotation.set(rnd() * 3, rnd() * 3, 0); g.add(em)
  }
  // 火舌：三層交叉的面，加色混合，shader 裡用雜訊往上捲動、邊緣是火焰形狀
  const flameMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { uTime: { value: 0 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `
      uniform float uTime; varying vec2 vUv;
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f); return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
      void main(){
        vec2 uv = vUv; float y = uv.y;
        float w = 0.5 * (1.0 - y) * (0.75 + 0.25 * sin(y * 7.0 - uTime * 6.0));
        float nz = n(vec2(uv.x * 5.0, y * 4.0 - uTime * 3.2)) * 0.6 + n(vec2(uv.x * 11.0, y * 9.0 - uTime * 5.0)) * 0.4;
        float d = abs(uv.x - 0.5 + (nz - 0.5) * 0.25 * y) / max(w, 0.001);
        float a = smoothstep(1.0, 0.35, d) * smoothstep(1.0, 0.55, y + nz * 0.35) * smoothstep(0.0, 0.08, y);
        vec3 col = mix(vec3(1.0, 0.85, 0.45), vec3(1.0, 0.32, 0.05), smoothstep(0.1, 0.75, y + d * 0.3));
        gl_FragColor = vec4(col * a * 1.6, a);
      }`,
  })
  const flames = new THREE.Group()
  for (let i = 0; i < 3; i++) { const q = new THREE.Mesh(new THREE.PlaneGeometry(0.75, 1.05).translate(0, 0.52, 0), flameMat); q.rotation.y = i * Math.PI / 3; flames.add(q) }
  flames.position.set(cx, y0 + 0.08, cz); flames.renderOrder = 8; g.add(flames)
  // 煙：一顆顆柔邊的灰色貼片，從火上方往上飄、變大變淡
  const smokeT = canvasTex(64, 64, (c, w, h) => { const gr = c.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2); gr.addColorStop(0, 'rgba(200,200,200,0.55)'); gr.addColorStop(1, 'rgba(200,200,200,0)'); c.fillStyle = gr; c.fillRect(0, 0, w, h) })
  const smoke = []
  for (let i = 0; i < 14; i++) {
    const sm = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeT, transparent: true, depthWrite: false, color: 0x9a9690 }))
    sm.userData.t0 = i / 14; g.add(sm); smoke.push(sm)
  }
  const fireLight = new THREE.PointLight(0xff8a3a, 3, 14, 1.6); fireLight.position.set(cx, y0 + 0.9, cz); g.add(fireLight)
  // 三腳架＋水壺
  const ironM = new THREE.MeshStandardMaterial({ color: 0x2a2826, roughness: 0.6, metalness: 0.6 })
  const top = V(cx, y0 + 1.45, cz)
  for (let i = 0; i < 3; i++) { const t = i / 3 * TAU + 0.5; g.add(between(V(cx + Math.cos(t) * 0.95, y0, cz + Math.sin(t) * 0.95), top, 0.02, ironM)) }
  g.add(between(top, V(cx, y0 + 1.0, cz), 0.006, ironM))
  const kettle = new THREE.Mesh(new THREE.LatheGeometry([V(0, 0), V(0.13, 0.01), V(0.16, 0.08), V(0.14, 0.18), V(0.07, 0.22), V(0.05, 0.24)].map((p) => new THREE.Vector2(p.x, p.y)), 18), new THREE.MeshStandardMaterial({ color: 0x232120, roughness: 0.55, metalness: 0.5, side: THREE.DoubleSide }))
  kettle.position.set(cx, y0 + 0.74, cz); kettle.castShadow = true; g.add(kettle)
  const spout = between(V(cx + 0.12, y0 + 0.83, cz), V(cx + 0.24, y0 + 0.93, cz), 0.018, ironM); g.add(spout)

  // ---------- 三頂帳篷 ----------
  // 三角帳：兩片斜的布面（中間微微下凹）、前後三角形（前面門簾捲起一半露出黑色的內帳門）、底布、兩根營柱、營繩＋營釘
  const tentCols = [0xd9692a, 0x4f7d48, 0x3e6a96, 0xc9a33a, 0x9a3b3b]
  const ropeM = new THREE.MeshStandardMaterial({ color: 0xd8cfb8, roughness: 1 })
  const pegM = new THREE.MeshStandardMaterial({ color: 0xb9bcc0, roughness: 0.4, metalness: 0.7 })
  const dark = new THREE.MeshStandardMaterial({ color: 0x15130f, roughness: 1, side: THREE.DoubleSide })
  function tent(col, L = 2.6, W = 2.1, H = 1.45) {
    const t = new THREE.Group()
    const fabT = canvasTex(256, 256, (c, w, h) => {
      const base = new THREE.Color(col); c.fillStyle = '#' + base.getHexString(); c.fillRect(0, 0, w, h)
      c.globalAlpha = 0.08; for (let y = 0; y < h; y += 3) { c.fillStyle = y % 6 ? '#000' : '#fff'; c.fillRect(0, y, w, 1) }   // 尼龍格紋
      c.globalAlpha = 0.25; c.fillStyle = '#000'; for (let x = 0; x < w; x += 64) c.fillRect(x, 0, 3, h)   // 車縫線
      c.globalAlpha = 1
    })
    const fab = new THREE.MeshStandardMaterial({ map: fabT, roughness: 0.75, side: THREE.DoubleSide })
    // 斜面：屋脊 (0, H) 到屋簷 (±W/2, 0)，細分成網格，中間往內凹一點（布是被營繩拉著的）
    const slope = (sd) => {
      const NU = 12, NV = 6, pos = [], uv = [], idx = []
      const nx = sd * H, ny = W / 2, nl = Math.hypot(nx, ny)   // 斜面朝外的法線方向（xz 平面裡）
      for (let j = 0; j <= NV; j++) for (let i = 0; i <= NU; i++) {
        const u = i / NU, v = j / NV, z = (u - 0.5) * L
        const sag = 0.07 * Math.sin(Math.PI * u) * Math.sin(Math.PI * v)
        pos.push(sd * W / 2 * v - nx / nl * sag, H * (1 - v) - ny / nl * sag, z); uv.push(u * 2, v * 1.5)
      }
      for (let j = 0; j < NV; j++) for (let i = 0; i < NU; i++) { const a = j * (NU + 1) + i; idx.push(a, a + NU + 1, a + 1, a + 1, a + NU + 1, a + NU + 2) }
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setIndex(idx); geo.computeVertexNormals()
      const m = new THREE.Mesh(geo, fab); m.castShadow = true; m.receiveShadow = true; return m
    }
    t.add(slope(1), slope(-1))
    // 前後三角形
    const tri = (z, door) => {
      const sh = new THREE.Shape(); sh.moveTo(-W / 2, 0); sh.lineTo(0, H); sh.lineTo(W / 2, 0); sh.closePath()
      if (door) { const hole = new THREE.Path(); hole.moveTo(-0.5, 0); hole.lineTo(0, H * 0.82); hole.lineTo(0.5, 0); hole.closePath(); sh.holes.push(hole) }
      const m = new THREE.Mesh(new THREE.ShapeGeometry(sh), fab); m.position.z = z; m.castShadow = true; t.add(m)
      if (door) {
        // 內帳門（黑）、捲起來的門簾（一捲布）
        const ish = new THREE.Shape(); ish.moveTo(-0.5, 0); ish.lineTo(0, H * 0.82); ish.lineTo(0.5, 0); ish.closePath()
        const inner = new THREE.Mesh(new THREE.ShapeGeometry(ish), dark); inner.position.z = z - 0.25; t.add(inner)
        const roll = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, H * 0.8, 10), fab)
        roll.position.set(-0.32, H * 0.42, z + 0.02); roll.rotation.z = -0.48; roll.castShadow = true; t.add(roll)
      }
    }
    tri(L / 2, true); tri(-L / 2, false)
    // 底布（深灰，比帳篷大一點）
    const fl = new THREE.Mesh(new THREE.PlaneGeometry(W + 0.2, L + 0.2).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x3c3f3a, roughness: 1 }))
    fl.position.y = 0.012; fl.receiveShadow = true; t.add(fl)
    // 營柱（前後）、頂上的橫桿
    for (const z of [L / 2 + 0.02, -L / 2 - 0.02]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, H + 0.12, 6), pegM); p.position.set(0, (H + 0.12) / 2, z); t.add(p) }
    // 營繩：從頂端前後各拉一條到地上的營釘、兩側各兩條
    const peg = (x, z) => { const k = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.004, 0.18, 5), pegM); k.position.set(x, 0.05, z); k.rotation.z = 0.3; t.add(k) }
    const rope = (p, q) => { const d = q.clone().sub(p), m = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, d.length(), 4), ropeM); m.position.copy(p).add(q).multiplyScalar(0.5); m.quaternion.setFromUnitVectors(V(0, 1, 0), d.normalize()); t.add(m) }
    for (const s of [1, -1]) { const q = V(0, 0.02, s * (L / 2 + 0.9)); rope(V(0, H + 0.08, s * (L / 2 + 0.02)), q); peg(q.x, q.z) }
    for (const s of [1, -1]) for (const z of [-L / 2 + 0.3, L / 2 - 0.3]) { const q = V(s * (W / 2 + 0.55), 0.02, z); rope(V(s * W / 4, H / 2, z), q); peg(q.x, q.z) }
    return t
  }
  // 2026-11-10 兩個出入口都留開：camp 支線（下面來）和 yose 支線（往瀑布山谷）——以前只讓開 camp 那邊，綠帳篷剛好擋在往瀑布的路上
  const ysp = ALP_SPURS.find((q) => q.name === 'yose'), yo = ysp ? ysp.pts[ysp.pts.length - 2] : null
  const outA = yo ? Math.atan2(yo[0] - cx, yo[1] - cz) : inA + Math.PI
  const arcA = ((outA - inA) % TAU + TAU) % TAU, arcs = [[inA, arcA], [outA, TAU - arcA]].sort((p, q) => q[1] - p[1])
  // 2026-11-10 使用者：帳篷區再大一點 → 空地 R 6.8→10、帳篷離火 5.4→7.6 m、依兩段弧長各自塞得下幾頂就放幾頂（最多 5 頂）
  const R = 7.6, tentAng = []
  for (const [a0, len] of arcs) { const n = Math.max(0, Math.min(3, Math.floor(len * R / 5.4) - 1)); for (let k = 1; k <= n; k++) tentAng.push([a0 + len * k / (n + 1), a0]) }
  tentAng.splice(5)
  tentAng.forEach(([ang], i) => {
    const px = cx + Math.sin(ang) * R, pz = cz + Math.cos(ang) * R
    const tt = tent(tentCols[i % tentCols.length], 3.6, 2.9, 2.0); tt.position.set(px, gy(px, pz), pz)   // 2026-11-10 使用者：帳篷大一點（2.6×2.1×1.45 → 3.6×2.9×2.0）
    tt.rotation.y = Math.atan2(cx - px, cz - pz)   // 帳篷的 +z（門）朝營火
    g.add(tt)
    addCollider(px, pz, 1.7, gy(px, pz) + 2)
  })
  // ---------- 原木長椅（同一段弧上相鄰兩頂帳篷之間、圍著火）＋ 樹墩、營燈、背包、柴堆 ----------
  const seats = []
  for (let i = 0; i + 1 < tentAng.length; i++) {
    if (tentAng[i][1] !== tentAng[i + 1][1]) continue
    const ba = (tentAng[i][0] + tentAng[i + 1][0]) / 2
    const bx = cx + Math.sin(ba) * 2.6, bz = cz + Math.cos(ba) * 2.6, by = gy(bx, bz)
    const tx = Math.cos(ba), tz = -Math.sin(ba)   // 長椅沿著圓周方向
    g.add(between(V(bx - tx * 0.75, by + 0.2, bz - tz * 0.75), V(bx + tx * 0.75, by + 0.2, bz + tz * 0.75), 0.2))
    addCollider(bx, bz, 0.5, by + 0.4)
    seats.push({ x: bx, z: bz, y: by + 0.42 })
  }
  // 樹墩＋營燈（入口右手邊）
  {
    const ba = inA + 0.55, sx = cx + Math.sin(ba) * 2.6, sz = cz + Math.cos(ba) * 2.6, sy = gy(sx, sz)
    g.add(between(V(sx, sy - 0.05, sz), V(sx, sy + 0.45, sz), 0.24))
    addCollider(sx, sz, 0.32, sy + 0.45)
    const lampGlass = new THREE.MeshStandardMaterial({ color: 0xfff2c8, emissive: 0xffc46a, emissiveIntensity: 1.4, transparent: true, opacity: 0.85 })
    const cage = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.2, 10), lampGlass); cage.position.set(sx, sy + 0.56, sz); g.add(cage)
    const cap = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.06, 10), ironM); cap.position.set(sx, sy + 0.69, sz); g.add(cap)
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.09, 0.03, 10), ironM); base.position.set(sx, sy + 0.46, sz); g.add(base)
    const lampL = new THREE.PointLight(0xffc77a, 0.8, 6, 2); lampL.position.set(sx, sy + 0.6, sz); g.add(lampL); g.userData.lamp = lampL
  }
  // 背包（靠在一頂帳篷旁）
  {
    const ba = inA + Math.PI + 0.85, bx = cx + Math.sin(ba) * 3.0, bz = cz + Math.cos(ba) * 3.0, by = gy(bx, bz)
    const packM = new THREE.MeshStandardMaterial({ color: 0x8a2d24, roughness: 0.8 })
    const pack = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.55, 0.24), packM); pack.position.set(bx, by + 0.27, bz); pack.rotation.set(0.2, ba, 0); pack.castShadow = true; g.add(pack)
    const roll = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.4, 10), new THREE.MeshStandardMaterial({ color: 0x2f5d73, roughness: 0.9 })); roll.position.set(bx, by + 0.6, bz); roll.rotation.set(0, ba, Math.PI / 2); g.add(roll)
  }
  // 柴堆：入口左手邊，劈好的木柴疊兩排
  {
    const ba = inA - 0.6, wx = cx + Math.sin(ba) * 3.1, wz = cz + Math.cos(ba) * 3.1, wy = gy(wx, wz)
    const tx = Math.cos(ba), tz = -Math.sin(ba)
    for (let row = 0; row < 3; row++) for (let k = 0; k < 4 - row; k++) {
      const off = (k - (3 - row) / 2) * 0.17, y = wy + 0.08 + row * 0.14
      const p = V(wx + tx * off - Math.sin(ba) * 0.35, y, wz + tz * off - Math.cos(ba) * 0.35), q = V(wx + tx * off + Math.sin(ba) * 0.35, y, wz + tz * off + Math.cos(ba) * 0.35)
      g.add(between(p, q, 0.07))
    }
    addCollider(wx, wz, 0.45, wy + 0.4)
  }
  scene.add(g)

  // ---------- 動畫：火焰、煙、火光閃爍 ----------
  const base = V(cx, y0 + 0.9, cz)
  function tick(t, dt, { day = 1 } = {}) {
    flameMat.uniforms.uTime.value = t
    flames.scale.set(1, 0.9 + 0.12 * Math.sin(t * 7.3) + 0.06 * Math.sin(t * 13.1), 1)
    fireLight.intensity = (2.2 + 0.6 * Math.sin(t * 9.1) + 0.4 * Math.sin(t * 23.7) + 0.3 * Math.sin(t * 5.3)) * (1.3 - 0.6 * day)
    for (const s of smoke) {
      const k = (t * 0.12 + s.userData.t0) % 1
      s.position.set(base.x + Math.sin(k * 6 + s.userData.t0 * 9) * 0.25 * k + k * 0.6, base.y + 0.5 + k * 4.5, base.z + Math.cos(k * 5 + s.userData.t0 * 7) * 0.25 * k)
      const sc = 0.5 + k * 2.2; s.scale.set(sc, sc, 1)
      s.material.opacity = 0.45 * Math.sin(Math.PI * k) * (0.6 + 0.4 * day)
    }
  }
  return { group: g, tick, seats }
}
