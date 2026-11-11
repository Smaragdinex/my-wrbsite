// 2026-11-11 吊橋橋面＋橋頭平台＋巨木林木棧道（使用者：「橋跟木頭道用 Blender 做最好的光影、模型；它們疊在一起很不 realistic」）
// 零件在 Blender 做（tools/make-boardwalk-kit.py → models/props/boardwalk_kit.glb）：掃描木紋（Poly Haven weathered_brown_planks）、螺絲、倒角、AO 烤在一張 2048 貼圖上；
// 太陽會動，所以只烤自遮蔽，不烤光影。這裡照 layout.js 的形狀（吊橋 deck、BRIDGE_HEADS、ALP_WALKS）一塊一塊擺：
//   吊橋：橫向木板（照橋面下垂的切線斜）、每 1.5 m 一根鋼橫樑、兩側槽鋼邊樑＋踢腳板、兩端伸縮縫蓋板
//   橋頭平台：凸多邊形，木板垂直於「橋軸＋出口方向」的角平分線、多邊形邊上收邊樑＋欄杆（避開橋塔）
//   棧道：沿 ALP_WALKS 的中線（轉角是圓弧，木板扇形排開）、兩側縱樑、每 1.4 m 欄杆柱、上中下三道扶手、離地高的地方下面有樁
import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { ALP_TRAIL, ALP_BRIDGE, BRIDGE_DIM, BRIDGE_HEADS, ALP_WALKS, WALK_HW, alpineHeight, addCollider, deckAt } from './layout.js'
import { dappled } from './alpine.js'

const VER = new URL(import.meta.url).searchParams.get('v') ?? ''

// 2026-11-11 使用者：木棧道的燈光要更好、更寫實。以前借公園夜燈的白色點光源：木板上一圈圈過曝的白光、邊緣硬。
// 改成在木頭材質裡自己算每盞矮燈的光：琥珀色（2200 K）、照度照距離平方衰減（近的亮、慢慢淡到 4 m 外）、燈上面有遮罩所以只往下往外照、
// 木板的法線貼圖吃得到光（木紋、板縫有明暗），欄杆柱朝燈的那面亮、背面暗。不加真的光源，全公園其他材質不受影響
const LAMP_MAX = 40
export const LAMP_U = { uLampP: { value: Array.from({ length: LAMP_MAX }, () => new THREE.Vector3(0, -999, 0)) }, uLampOn: { value: 0 } }
export function lampLit(mat) {
  const prev = mat.onBeforeCompile, prevKey = mat.customProgramCacheKey?.bind(mat)
  mat.onBeforeCompile = (sh, r) => {
    prev?.call(mat, sh, r)
    sh.uniforms.uLampP = LAMP_U.uLampP; sh.uniforms.uLampOn = LAMP_U.uLampOn
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vLampW;').replace('#include <project_vertex>', `#include <project_vertex>
      { vec4 lw = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          lw = instanceMatrix * lw;
        #endif
        vLampW = (modelMatrix * lw).xyz; }`)
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
      varying vec3 vLampW; uniform vec3 uLampP[${LAMP_MAX}]; uniform float uLampOn;`).replace('#include <opaque_fragment>', `
      if (uLampOn > 0.003) {
        float lampE = 0.0;
        for (int i = 0; i < ${LAMP_MAX}; i++) {
          vec3 d = uLampP[i] - vLampW; float r2 = dot(d, d);
          if (r2 > 25.0) continue;
          float r = sqrt(r2); vec3 l = (viewMatrix * vec4(d / r, 0.0)).xyz;
          float nl = max(dot(normal, l), 0.0) * 0.85 + 0.15;
          float att = 0.16 / (0.05 + r2) * smoothstep(5.0, 1.2, r);
          float shield = smoothstep(-0.12, 0.2, d.y);                       // 燈罩：燈的高度以上照不到
          lampE += nl * att * shield;
        }
        lampE = lampE / (1.0 + 0.35 * lampE);                               // 燈正下方不要過曝成一片白
        outgoingLight += diffuseColor.rgb * vec3(1.0, 0.5, 0.2) * lampE * uLampOn * 5.5;
      }
      #include <opaque_fragment>`)
  }
  mat.customProgramCacheKey = () => (prevKey?.() ?? '') + 'lampLit'
  return mat
}
export async function loadWalkwayKit() {
  const gl = await new GLTFLoader().loadAsync(`models/props/boardwalk_kit.glb?v=${VER}`)
  const geo = {}
  gl.scene.updateMatrixWorld(true)
  gl.scene.traverse((o) => { if (o.isMesh) { const g = o.geometry.clone(); g.applyMatrix4(o.matrixWorld); geo[o.name] = g } })
  const TL = new THREE.TextureLoader()
  const tex = (n, srgb) => { const t = TL.load(`models/props/bw_wood_${n}.jpg?v=${VER}`); t.flipY = false; t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; t.anisotropy = 8; return t }
  const orm = tex('orm', false)
  const wood = new THREE.MeshStandardMaterial({ map: tex('col', true), normalMap: tex('nor', false), normalScale: new THREE.Vector2(1, -1), aoMap: orm, aoMapIntensity: 0.65, roughnessMap: orm, roughness: 1, metalness: 0 })
  wood.color.setScalar(1.3)   // 參考圖（ChatGPT 生的）木頭是偏淺的灰褐色；烤出來的底色在林下太暗
  dappled(wood); lampLit(wood)   // 樹冠縫隙的光斑也落在木板上
  const steel = new THREE.MeshStandardMaterial({ color: 0x2f4a3c, roughness: 0.55, metalness: 0.5 })   // 跟橋塔同一個深綠
  const galv = new THREE.MeshStandardMaterial({ color: 0xa3a8a5, roughness: 0.55, metalness: 0.55 })
  return { geo, wood, steel, galv }
}

const V = (x, y, z) => new THREE.Vector3(x, y, z)

export function buildWalkways(scene, kit) {
  const root = new THREE.Group(); root.name = 'walkways'
  const { geo, wood, steel, galv } = kit
  const rnd = (() => { let s = 20261111; return () => ((s = Math.imul(s ^ (s >>> 15), 1 | s) + 0x6d2b79f5 | 0), ((s ^ (s >>> 13)) >>> 0) / 4294967296) })()
  // 一組 InstancedMesh：每種零件收集矩陣，最後一次建好
  function batch(name) {
    const lists = {}
    const add = (part, m) => { (lists[part] ??= []).push(m.clone()) }
    const done = () => {
      const g = new THREE.Group(); g.name = name
      for (const [part, ms] of Object.entries(lists)) {
        const mat = part.startsWith('br_beam') || part.startsWith('br_channel') || part.startsWith('br_kick') || part.startsWith('bw_bracket') ? steel : part === 'br_expplate' ? galv : wood
        const im = new THREE.InstancedMesh(geo[part], mat, ms.length)
        ms.forEach((m, i) => im.setMatrixAt(i, m))
        im.castShadow = true; im.receiveShadow = true; im.computeBoundingSphere(); g.add(im)
      }
      root.add(g)
    }
    return { add, done }
  }
  const m4 = new THREE.Matrix4(), bx = new THREE.Vector3(), by = new THREE.Vector3(), bz = new THREE.Vector3()
  // 用三個軸（X＝零件長邊／橫向、Z＝前進方向）組矩陣；Y 用 Z×X 算，保證右手系、朝上
  function place(pos, X, Z, sx = 1, sy = 1, sz = 1) {
    bx.copy(X).normalize(); bz.copy(Z).normalize(); by.crossVectors(bz, bx).normalize()
    if (by.y < 0) { bx.negate(); by.crossVectors(bz, bx).normalize() }
    bz.crossVectors(bx, by).normalize()
    m4.makeBasis(bx.clone().multiplyScalar(sx), by.clone().multiplyScalar(sy), bz.clone().multiplyScalar(sz)).setPosition(pos)
    return m4
  }
  const rotY = (m) => m.multiply(new THREE.Matrix4().makeRotationY(Math.PI))

  // ---------------- 吊橋橋面 ----------------
  const a = ALP_TRAIL[ALP_BRIDGE.a], b = ALP_TRAIL[ALP_BRIDGE.a + 2], pa = ALP_TRAIL.prof[ALP_BRIDGE.a], pb = ALP_TRAIL.prof[ALP_BRIDGE.a + 2]
  const A = V(a[0], pa, a[1]), B = V(b[0], pb, b[1]), dir = B.clone().sub(A).setY(0), len = dir.length(); dir.normalize()
  const side = V(-dir.z, 0, dir.x), HW = BRIDGE_DIM.hw
  const deck = (t) => A.clone().lerp(B, t).add(V(0, -BRIDGE_DIM.sag * Math.sin(Math.PI * t) + 0.06, 0))
  const tan = (t) => deck(Math.min(1, t + 0.002)).sub(deck(Math.max(0, t - 0.002))).normalize()
  {
    const br = batch('bridgeDeck')
    const P = 0.172, n = Math.floor(len / P)
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n, p = deck(t).add(V(0, (rnd() - 0.5) * 0.003, 0)), m = place(p, side, tan(t))
      if (rnd() < 0.5) rotY(m)
      br.add('br_plank_' + Math.floor(rnd() * 3), m)
    }
    const nb = Math.round(len / 1.5)
    for (let i = 0; i <= nb; i++) { const t = i / nb; br.add('br_beam', place(deck(t), side, tan(t))) }
    // 邊樑、踢腳板：一段一段跟著下垂曲線
    const NS = 40
    for (let i = 0; i < NS; i++) {
      const p0 = deck(i / NS), p1 = deck((i + 1) / NS), d = p1.clone().sub(p0), L = d.length() + 0.004
      for (const s of [-1, 1]) {
        const c = p0.clone().lerp(p1, 0.5)
        const mc = place(c.clone().addScaledVector(side, s * HW), side, d, 1, 1, L); if (s < 0) rotY(mc); br.add('br_channel', mc)
        br.add('br_kick', place(c.clone().addScaledVector(side, s * (HW + 0.055)).add(V(0, 0.01, 0)), side, d, 1, 1, L))
      }
    }
    for (const t of [0, 1]) br.add('br_expplate', place(deck(t).add(V(0, 0.002, 0)), side, tan(t)))
    br.done()
  }

  // ---------------- 橋頭平台 ----------------
  const ends = {}   // 每個橋頭出口兩側最後一根欄杆柱的位置（棧道的扶手從這裡接過去）
  for (const hd of BRIDGE_HEADS) {
    const bt = batch('bridgeHead' + hd.t)
    const H = hd.hull, Y0 = hd.Y0
    // 木板跟出口方向垂直（跟棧道同方向，出口那條縫是直的；橋那頭的斜邊有伸縮縫蓋板蓋住）
    const bis = V(hd.e[0], 0, hd.e[1]).normalize(), perp = V(-bis.z, 0, bis.x)
    const P = V(hd.P[0], Y0, hd.P[1])
    const proj = H.map(([x, z]) => (x - P.x) * bis.x + (z - P.z) * bis.z), r0 = Math.min(...proj), r1 = Math.max(...proj)
    // 一排一排：沿出口方向每 0.159 一排，跟多邊形求交，太長就切成兩三塊（接縫錯開）
    let row = 0
    for (let r = r0 + 0.08; r < r1 - 0.05; r += 0.159, row++) {
      const c = P.clone().addScaledVector(bis, r)
      let q0 = -1e9, q1 = 1e9
      for (let i = 0; i < H.length; i++) {   // 半平面裁切直線 c + perp*q
        const [ax, az] = H[i], [bx2, bz2] = H[(i + 1) % H.length], ex = bx2 - ax, ez = bz2 - az
        const f0 = ex * (c.z - az) - ez * (c.x - ax), fd = ex * perp.z - ez * perp.x
        if (Math.abs(fd) < 1e-9) { if (f0 < 0) q1 = -1e9; continue }
        const q = -f0 / fd
        if (fd > 0) q0 = Math.max(q0, q); else q1 = Math.min(q1, q)
      }
      const L = q1 - q0 - 0.01
      if (L < 0.12) continue
      const k = Math.ceil(L / 3.1), cuts = [q0]
      const jog = k > 1 ? (row % 2 ? 0.35 : -0.35) : 0
      for (let j = 1; j < k; j++) cuts.push(q0 + (q1 - q0) * j / k + jog)
      cuts.push(q1)
      for (let j = 0; j < k; j++) {
        const u0 = cuts[j] + 0.005, u1 = cuts[j + 1] - 0.005, mid = (u0 + u1) / 2
        const p = c.clone().addScaledVector(perp, mid); p.y = Y0 + (rnd() - 0.5) * 0.003
        const m = place(p, perp, bis, (u1 - u0) / 3.1, 1, 1); if (rnd() < 0.5) rotY(m)
        bt.add('bw_plank_' + Math.floor(rnd() * 4), m)
      }
    }
    // 邊：入口（貼著橋面那條）和出口（接棧道那條）以外都要收邊樑＋欄杆
    // 入口邊＝經過橋面端點 P 的那條；出口邊＝經過出口中點的那條（點到線段距離）
    const onEdge = (i, px, pz) => { const [ax, az] = H[i], [bx2, bz2] = H[(i + 1) % H.length], ex = bx2 - ax, ez = bz2 - az, t = Math.max(0, Math.min(1, ((px - ax) * ex + (pz - az) * ez) / (ex * ex + ez * ez))); return Math.hypot(ax + ex * t - px, az + ez * t - pz) < 0.12 }
    const isEntry = (i) => onEdge(i, hd.P[0], hd.P[1])
    const isExit = (i) => onEdge(i, hd.exit[0], hd.exit[1])
    const towers = [-1, 1].map((s) => [hd.P[0] + hd.o[0] * 0.35 + hd.side[0] * s * (HW + 0.3), hd.P[1] + hd.o[1] * 0.35 + hd.side[1] * s * (HW + 0.3)])
    // 從入口邊的下一條邊開始，沿多邊形走到出口邊之前＝一條欄杆；出口之後走到入口之前＝另一條
    const ei = H.findIndex((_, i) => isEntry(i)), chains = [[]]
    for (let k = 1; k <= H.length; k++) {
      const i = (ei + k) % H.length
      if (isEntry(i)) break
      if (isExit(i)) { chains.push([]); continue }
      chains.at(-1).push(i)
    }
    for (const ch of chains) {
      if (!ch.length) continue
      const posts = []
      for (const i of ch) {
        const [ax, az] = H[i], [bx2, bz2] = H[(i + 1) % H.length], ex = bx2 - ax, ez = bz2 - az, L = Math.hypot(ex, ez), nx = ez / L, nz = -ex / L   // 外法線
        // 收邊樑（擋住平台底下）
        const mid = V((ax + bx2) / 2 + nx * 0.05, Y0, (az + bz2) / 2 + nz * 0.05)
        bt.add('bw_stringer', place(mid, V(nx, 0, nz), V(ex, 0, ez), 1, 1, (L + 0.1) / 2.4))
        const nseg = Math.max(1, Math.ceil(L / 1.4))
        for (let j = 0; j <= nseg; j++) {
          if (j === 0 && posts.length) continue
          const x = ax + ex * j / nseg + nx * 0.11, z = az + ez * j / nseg + nz * 0.11
          if (towers.some(([tx, tz]) => Math.hypot(x - tx, z - tz) < 0.55)) continue
          posts.push([x, z, nx, nz])
        }
      }
      for (const [x, z, nx, nz] of posts) {
        bt.add('bw_post', place(V(x, Y0, z), V(nx, 0, nz), V(-nz, 0, nx)))
        bt.add('bw_bracket', place(V(x, Y0, z), V(-nz, 0, nx), V(nx, 0, nz)))
        addCollider(x, z, 0.08, Y0 + 1.1)
        const g = alpineHeight(x, z)
        if (Y0 - g > 0.15) bt.add('bw_pile', place(V(x, Y0 - 0.26, z), V(nx, 0, nz), V(-nz, 0, nx), 1, Y0 - 0.26 - (g - 0.3), 1))
      }
      railRun(bt, posts.map(([x, z, nx, nz]) => ({ x, z, y: Y0, nx, nz })))
      // 出口那一頭的柱子（棧道接過來）
      const last = posts.at(-1), first = posts[0]
      for (const p of [first, last]) {
        if (!p) continue
        const d = Math.hypot(p[0] - hd.exit[0], p[1] - hd.exit[1])
        if (d < WALK_HW + 1.2) { const s = Math.sign((p[0] - hd.exit[0]) * -hd.e[1] + (p[1] - hd.exit[1]) * hd.e[0]); ends[hd.t + ',' + s] = { x: p[0], z: p[1], y: Y0, nx: p[2], nz: p[3] } }
      }
    }
    bt.done()
  }

  // 扶手：一串柱子之間，上（柱帽下）、中、下三道；扶手貼在柱子內側
  function railRun(bt, posts) {
    for (let i = 1; i < posts.length; i++) {
      const p = posts[i - 1], q = posts[i]
      for (const [part, h, inset] of [['bw_rail_top', 1.04, 0.0], ['bw_rail_mid', 0.64, 0.0725], ['bw_rail_mid', 0.27, 0.0725]]) {
        const P0 = V(p.x - p.nx * inset, p.y + h, p.z - p.nz * inset), P1 = V(q.x - q.nx * inset, q.y + h, q.z - q.nz * inset)
        const d = P1.clone().sub(P0), L = d.length()
        if (L < 0.05 || L > 3) continue
        const lat = V(-d.z, 0, d.x).normalize()
        bt.add(part, place(P0.clone().lerp(P1, 0.5), d, V(lat.x, 0, lat.z).applyAxisAngle(V(0, 1, 0), 0), L + 0.06, 1, 1))
      }
    }
  }

  // ---------------- 木棧道 ----------------
  const lampAt = []; let lampK = 0
  for (const w of ALP_WALKS) {
    const bw = batch('boardwalk' + w.head.t)
    const at = (s) => { const f = Math.min(w.N - 1.001, Math.max(0, s / w.ds)), i = Math.floor(f), u = f - i
      return { x: w.xs[i] + (w.xs[i + 1] - w.xs[i]) * u, z: w.zs[i] + (w.zs[i + 1] - w.zs[i]) * u, y: w.y[i] + (w.y[i + 1] - w.y[i]) * u, g: w.ground[i] - 0.06, tx: w.tx[i], tz: w.tz[i] } }
    const S = (w.N - 1) * w.ds
    // 木板：轉角（曲率 κ）內側不能疊 → 中線間距 = 0.159 / (1 - 1.55κ)
    let s = 0.09
    while (s < S - 0.08) {
      const p = at(s), q = at(s + 0.3), dy = (q.y - p.y) / 0.3
      const kap = Math.abs(Math.atan2(q.tx * p.tz - q.tz * p.tx, q.tx * p.tx + q.tz * p.tz)) / 0.3
      const m = place(V(p.x, p.y + (rnd() - 0.5) * 0.003, p.z), V(-p.tz, 0, p.tx), V(p.tx, dy, p.tz)); if (rnd() < 0.5) rotY(m)
      bw.add('bw_plank_' + Math.floor(rnd() * 4), m)
      s += 0.159 / Math.max(0.5, 1 - 1.55 * kap)
    }
    // 縱樑：兩側＋中間，1.2 m 一段（側面看得到棧道厚度）
    for (const lat of [-1.505, 0, 1.505]) for (let s0 = 0; s0 < S - 0.1; s0 += 1.2) {
      const s1 = Math.min(S, s0 + 1.2), p = at(s0), q = at(s1)
      const P0 = V(p.x - p.tz * lat, p.y, p.z + p.tx * lat), P1 = V(q.x - q.tz * lat, q.y, q.z + q.tx * lat), d = P1.clone().sub(P0)
      bw.add('bw_stringer', place(P0.clone().lerp(P1, 0.5), V(-d.z, 0, d.x), d, 1, 1, (d.length() + 0.02) / 2.4))
    }
    // 欄杆柱：每 1.4 m（從平台那頭的柱子接過來）
    for (const sd of [-1, 1]) {
      const posts = []
      const e = ends[w.head.t + ',' + sd]
      if (e) posts.push(e)
      for (let s0 = 1.2; s0 < S - 0.2; s0 += 1.4) {
        const p = at(s0), lat = sd * 1.61, nx = -p.tz * sd, nz = p.tx * sd
        const x = p.x + nx * 1.61, z = p.z + nz * 1.61
        if (deckAt(p.x + nx * 2.3, p.z + nz * 2.3) != null) continue   // 2026-11-11 觀景灣的入口：這一側不立柱、不拉欄杆（railRun 超過 3 m 的間隔不接）
        if (w.head.t === 'wet' && (lampK++ % 4) === 1) lampAt.push([x - nx * 0.09, p.y + 0.55, z - nz * 0.09, nx, nz])   // 每 5.6 m 一盞矮燈（柱子內側、離台面 0.55 m）
        posts.push({ x, z, y: p.y, nx, nz })
        bw.add('bw_post', place(V(x, p.y, z), V(nx, 0, nz), V(p.tx, 0, p.tz)))
        bw.add('bw_bracket', place(V(x, p.y, z), V(p.tx, 0, p.tz), V(nx, 0, nz)))
        addCollider(x, z, 0.08, p.y + 1.1)
        if (p.y - p.g > 0.14) {   // 離地高：縱樑下面一根樁
          const px = p.x + nx * 1.505, pz = p.z + nz * 1.505, g = alpineHeight(px, pz)
          bw.add('bw_pile', place(V(px, p.y - 0.26, pz), V(nx, 0, nz), V(p.tx, 0, p.tz), 1, Math.max(0.1, p.y - 0.26 - (g - 0.3)), 1))
        }
      }
      railRun(bw, posts)
    }
    bw.done()
  }
  // 2026-11-11 濕地木棧道的矮燈（ChatGPT：柱子內側、有遮罩的琥珀色 LED，2200～2400 K，(1, .45, .16)；黃昏 17:45 起慢慢亮）：
  // 燈殼＋發光面各一個合併的 mesh；發光強度交給日夜系統（userData.lamp＝[白天, 晚上]），真的點光源由 world.js 挑鏡頭附近幾盞
  if (lampAt.length) {
    const hs = [], gs = []
    for (const [x, y, z, nx, nz] of lampAt) {
      const a = Math.atan2(nx, nz), M = new THREE.Matrix4().makeRotationY(a).setPosition(x, y, z)
      hs.push(new THREE.BoxGeometry(0.1, 0.035, 0.09).translate(0, 0.07, -0.03).applyMatrix4(M), new THREE.BoxGeometry(0.1, 0.13, 0.02).translate(0, 0, 0).applyMatrix4(M))
      gs.push(new THREE.BoxGeometry(0.07, 0.07, 0.012).translate(0, 0.0, -0.016).applyMatrix4(M))
    }
    const hm = new THREE.Mesh(mergeGeometries(hs), new THREE.MeshStandardMaterial({ color: 0x23201c, roughness: 0.6, metalness: 0.4 }))
    const gm = new THREE.MeshStandardMaterial({ color: 0x2a1c10, emissive: new THREE.Color().setRGB(1, 0.42, 0.13), emissiveIntensity: 0, roughness: 0.5 })
    gm.userData.lamp = [0, 2.4]
    const glow = new THREE.Mesh(mergeGeometries(gs), gm)
    // 每盞燈一小團柔和的光暈（加色、不寫深度；水面的倒影裡也看得到一點一點的燈）
    const c = document.createElement('canvas'); c.width = c.height = 64
    { const x = c.getContext('2d'), gr = x.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,190,110,1)'); gr.addColorStop(0.25, 'rgba(255,140,60,0.45)'); gr.addColorStop(1, 'rgba(255,110,40,0)'); x.fillStyle = gr; x.fillRect(0, 0, 64, 64) }
    const ht = new THREE.CanvasTexture(c); ht.colorSpace = THREE.SRGBColorSpace
    const hp = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(lampAt.flatMap(([x, y, z, nx, nz]) => [x - nx * 0.05, y, z - nz * 0.05]), 3)),
      new THREE.PointsMaterial({ map: ht, size: 0.55, sizeAttenuation: true, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }))
    hp.frustumCulled = false
    lampAt.slice(0, LAMP_MAX).forEach(([x, y, z, nx, nz], i) => LAMP_U.uLampP.value[i].set(x - nx * 0.06, y - 0.02, z - nz * 0.06))
    glow.onBeforeRender = () => { const k = gm.emissiveIntensity / 2.4; LAMP_U.uLampOn.value = k; hp.material.opacity = 0.75 * k; hp.visible = k > 0.01 }
    glow.frustumCulled = false
    root.add(hm, glow, hp)
  }
  scene.add(root)
  return root
}
