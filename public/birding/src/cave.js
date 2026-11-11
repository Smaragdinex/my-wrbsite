// 2026-11-11 瀑布後面的岩窟步道（使用者：從山上走到瀑布，走進洞穴、在旁邊看瀑布；要有草、青苔，高模、更有臨場感。
// 參考：貴州黃果樹水簾洞、冰島 Seljalandsfoss 走到瀑布後面、ChatGPT 概念圖——岩拱門、濕石板路、長滿青苔和蕨類的岩壁、鐵欄杆）
// 模型：tools/make-cave-kit.py → models/props/cave_kit.glb（頂點色：綠多於紅＝青苔，其餘配花崗岩 triplanar）
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { ALP_SPURS, YOSE, alpineHeight, addCollider } from './layout.js'
import { mulberry32, fbm2 } from './noise.js'
import { windUniforms } from './wind.js'
import { scatter } from './plants.js'
import { mossRockMaterial } from './yosemite-top.js'

const VER = new URL(import.meta.url).searchParams.get('v') ?? ''
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z)

export async function loadCaveKit() {
  const gl = await new GLTFLoader().loadAsync(`models/props/cave_kit.glb?v=${VER}`)
  const geo = {}
  gl.scene.updateMatrixWorld(true)
  gl.scene.traverse((o) => { if (o.isMesh) { const g = o.geometry.clone(); g.applyMatrix4(o.matrixWorld); if (g.attributes.color_1) { g.setAttribute('color', g.attributes.color_1); g.deleteAttribute('color_1') } geo[o.name] = g } })
  const rockM = mossRockMaterial(); rockM.roughness = 0.62          // 水霧裡的岩石是濕的
  const slabM = mossRockMaterial(); slabM.roughness = 0.42; slabM.color.setScalar(0.72)          // 石板路：濕得發亮
  return { geo, rockM, slabM }
}

export function buildCave(scene, kit, sum, lib) {
  const sp = ALP_SPURS.find((s) => s.name === 'cave')
  if (!sp) return null
  const g = new THREE.Group(); g.name = 'cave'; scene.add(g)
  const rnd = mulberry32(5150), P = sp.pts, m4 = new THREE.Matrix4()
  const Q = (yaw, tilt = 0) => new THREE.Quaternion().setFromEuler(new THREE.Euler((rnd() - 0.5) * tilt, yaw, (rnd() - 0.5) * tilt))
  // 步道中線：每 0.25 m 一點
  const line = []
  for (let i = 1; i < P.length - 1; i++) { const [ax, az] = P[i], [bx, bz] = P[i + 1], L = Math.hypot(bx - ax, bz - az); for (let d = 0; d < L; d += 0.25) line.push([ax + (bx - ax) * d / L, az + (bz - az) * d / L, (bx - ax) / L, (bz - az) / L]) }
  const [ex, ez] = P.at(-1)
  const lists = {}
  const put = (name, x, y, z, yaw, s, tilt = 0) => (lists[name] ||= []).push(m4.compose(V(x, y, z), Q(yaw, tilt), s instanceof THREE.Vector3 ? s : V(s, s, s)).clone())

  // 1) 濕石板路：沿步道兩到三塊並排、錯縫；盡頭的平台鋪滿
  for (let i = 0; i < line.length; i += 3) {
    const [x, z, tx, tz] = line[i]
    for (const lat of [-0.62, 0.02, 0.66]) {
      if (rnd() < 0.08) continue
      const px = x - tz * (lat + (rnd() - 0.5) * 0.14) + tx * (rnd() - 0.5) * 0.2, pz = z + tx * (lat + (rnd() - 0.5) * 0.14) + tz * (rnd() - 0.5) * 0.2
      const sc = 0.7 + rnd() * 0.75; put('slab_' + Math.floor(rnd() * 4), px, alpineHeight(px, pz) - 0.075 - rnd() * 0.02, pz, rnd() * 6.28, V(sc * (0.8 + rnd() * 0.5), 1, sc * (0.8 + rnd() * 0.5)), 0.05)
    }
  }
  for (let k = 0; k < 26; k++) { const a = rnd() * 6.28, d = Math.sqrt(rnd()) * 2.1, px = ex + 0.4 + Math.cos(a) * d, pz = ez + Math.sin(a) * d * 0.9; put('slab_' + Math.floor(rnd() * 4), px, alpineHeight(px, pz) - 0.075, pz, rnd() * 6.28, 0.9 + rnd() * 0.4, 0.03) }

  // 2) 岩拱門：步道進岩簷的地方，從拱門底下走進去（拱的兩隻腳各一個碰撞）
  const gate = (name, t, s) => {
    const [x, z, tx, tz] = line[Math.floor(line.length * t)], y = alpineHeight(x, z), yaw = Math.atan2(tx, tz)
    put(name, x, y - 0.25, z, yaw, s)
    const half = (name === 'arch_0' ? 3.4 / 2 + 1.5 * 0.55 : 2.9 / 2 + 1.2 * 0.55) * s
    for (const sd of [-1, 1]) for (const k of [0.85, 1.25]) addCollider(x - tz * sd * half * k, z + tx * sd * half * k, 0.75 * s, y + 3)
  }
  gate('arch_0', 0.5, 1.12)
  gate('arch_1', 0.8, 1.05)
  // 岩柱：平台和水簾中間偏西，跟拱門、岩壁圍出一個看水簾的「窗」
  { const x = ex - 4.4, z = ez - 3.6, y = alpineHeight(x, z); put('pillar_0', x, y - 0.5, z, 2.7, V(1.15, 0.9, 1.3), 0.25); addCollider(x, z, 1.0, y + 4) }
  // 後壁的大岩塊：平的那面貼岩壁（北邊），一塊接一塊
  for (const [name, t, off, s, yaw] of [['wall_2', 0.56, 2.7, 1.0, 0.25], ['wall_0', 0.68, 2.9, 1.05, -0.1], ['wall_1', 0.86, 2.6, 1.0, 0.15], ['wall_0', 0.98, 3.0, 0.9, -0.3], ['wall_2', 0.4, 2.8, 0.8, 0.5]]) {
    const [x0, z0, tx, tz] = line[Math.min(line.length - 1, Math.floor(line.length * t))], x = x0 - tz * off, z = z0 + tx * off
    const yw = Math.atan2(tx, tz) + Math.PI / 2 + yaw
    put(name, x, alpineHeight(x, z) - 0.3 * s, z, yw + Math.PI, s)
    addCollider(x, z, 1.2 * s, alpineHeight(x, z) + 2)
  }
  for (const [name, list] of Object.entries(lists)) {
    const im = new THREE.InstancedMesh(kit.geo[name], name.startsWith('slab') ? kit.slabM : kit.rockM, list.length)
    list.forEach((m, i) => im.setMatrixAt(i, m)); im.castShadow = true; im.receiveShadow = true; im.computeBoundingSphere(); g.add(im)
  }

  // 3) 青苔墊、草叢（山頂那套 Blender 模型）、蕨類：沿石板路兩側、岩塊腳下，越往裡越密
  if (sum) {
    const L2 = {}
    const add = (name, x, z, s) => (L2[name] ||= []).push(m4.compose(V(x, alpineHeight(x, z) - 0.03, z), Q(rnd() * 6.28, 0.15), V(s, s * (0.8 + rnd() * 0.5), s)).clone())
    for (let i = 0; i < line.length; i++) {
      const [x, z, tx, tz] = line[i], inK = i / line.length
      for (const sd of [-1, 1]) {
        if (rnd() > 0.35 + 0.5 * inK) continue
        const d = 1.25 + rnd() * 1.3, px = x - tz * sd * d, pz = z + tx * sd * d, r = rnd()
        if (YOSE.inLake(px, pz, 0.2)) continue
        if (r < 0.4) add('mosspad_' + Math.floor(rnd() * 3), px, pz, 0.5 + rnd() * 0.8)
        else add('grass_' + Math.floor(rnd() * 3), px, pz, 0.6 + rnd() * 0.6)
      }
    }
    for (const [name, list] of Object.entries(L2)) {
      const mat = name.startsWith('moss') ? sum.mossM : sum.grassM
      const im = new THREE.InstancedMesh(sum.geo[name], mat, list.length); list.forEach((m, i) => im.setMatrixAt(i, m)); im.receiveShadow = true; im.computeBoundingSphere(); g.add(im)
    }
  }
  if (lib) {
    const ferns = ['fern_sa', 'fern_sb', 'fern2_b', 'fern2_c', 'fern_a'].filter((n) => lib[n]), fl = {}
    for (let i = 0; i < line.length; i += 2) {
      const [x, z, tx, tz] = line[i]
      for (const sd of [-1, 1]) {
        if (rnd() > 0.5) continue
        const d = 1.5 + rnd() * 1.6, px = x - tz * sd * d, pz = z + tx * sd * d
        if (YOSE.inLake(px, pz, 0.2)) continue
        ;(fl[ferns[Math.floor(rnd() * ferns.length)]] ||= []).push({ p: V(px, alpineHeight(px, pz) - 0.04, pz), q: Q(rnd() * 6.28), s: V(1, 1, 1).multiplyScalar(0.7 + rnd() * 0.8) })
      }
    }
    for (const [n, list] of Object.entries(fl)) if (ferns.length) scatter(g, lib[n], list, { cast: true })
  }

  // 5) 岩窟的後壁和天花板（2026-11-11 使用者：先重做岩窟的天花板和後壁）：以前是岩壁網格凹進去的一片平滑深色面。
  // 這裡照同一個斷面（layout 的 caveA／caveD／caveH）另外鋪一層細的岩面（x 每 0.2 m、沿斷面 100 排，約 2.4 萬個三角形），只往洞裡凸（0.05～1.6 m）蓋在舊的前面：
  //   後壁：一層層水平的岩層（厚 0.4～2 m，一半凸出成岩棚 0.2～0.9 m）、每 3～5 m 一道直的節理縫、一塊塊凸出或崩掉的岩塊；
  //   天花板：一片片剝落的凹窩和垂下來的岩塊；滲水的黑色水痕從天花板的縫往下流；岩棚上、牆腳、靠洞口有光的地方長青苔
  {
    const C = YOSE.cave, hsh = (n) => { const v = Math.sin(n * 127.1 + 311.7) * 43758.5453; return v - Math.floor(v) }
    const sst = (a, b, v) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t) }
    const NXc = Math.round((C.x1 - C.x0) / 0.2), NW = 44, NC = 56, NS = NW + NC, pos = new Float32Array((NXc + 1) * (NS + 1) * 3), meta = []
    const BED = [-10]; while (BED.at(-1) < 80) BED.push(BED.at(-1) + 0.4 + 1.6 * Math.pow(hsh(BED.length * 1.91), 1.3))
    const JX = [C.x0]; while (JX.at(-1) < C.x1) JX.push(JX.at(-1) + 3 + 2.2 * hsh(JX.length * 2.7 + 1))
    // 牆腳線（base）是 0.25 m 一階、地面高度每一欄都不同：直接用會讓整面牆變成一條條直的稜（第一版）→ 先沿 x 平滑 ±2 m
    const ZB = [], G0 = []
    for (let i = 0; i <= NXc; i++) { const x = C.x0 + (C.x1 - C.x0) * i / NXc; let a = 0, b = 0, n = 0; for (let k = -10; k <= 10; k++) { const xx = x + k * 0.2, z = YOSE.base(xx); a += z; b += alpineHeight(xx, z); n++ } ZB.push(a / n); G0.push(b / n) }
    for (let i = 0; i <= NXc; i++) {
      const x = C.x0 + (C.x1 - C.x0) * i / NXc, A = YOSE.caveA(x), Dp = YOSE.caveD(x), Ho = YOSE.caveH(x), zb = ZB[i], g0 = G0[i]
      const fallK = Math.exp(-(((x - YOSE.fall.x) / 8) ** 2)), lip = -1.2 * A * (1 - 0.8 * fallK), edge = sst(0.12, 0.45, A)
      for (let j = 0; j <= NS; j++) {
        let d, y, td, ty, ceil = 0, u
        if (j <= NW) { const f = j / NW; d = Dp + 0.6 * A * Math.sin(f * Math.PI); y = g0 - 1.5 + (Ho * 0.5 + 1.5) * f; td = 0.6 * A * Math.PI * Math.cos(f * Math.PI); ty = Ho * 0.5 + 1.5; u = y }
        else { const th = (j - NW) / NC * Math.PI / 2 * 0.93; d = lip + (Dp - lip) * Math.cos(th); y = g0 + Ho * 0.5 + Ho * 0.5 * Math.sin(th); td = -(Dp - lip) * Math.sin(th); ty = Ho * 0.5 * Math.cos(th); ceil = sst(0, 0.5, th); u = g0 + Ho * 0.5 + th * Ho * 0.6 }
        const tl = Math.hypot(td, ty) || 1, nd = -ty / tl, ny = td / tl      // 朝洞裡的法線（斷面平面裡）
        // 岩層
        const yy = y + 0.9 * (fbm2(x * 0.05, 3.1, 2) - 0.5) * 2 + 0.06 * (x - 195)
        let lo = 0, hi = BED.length - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (BED[m] <= yy) lo = m; else hi = m }
        const th2 = BED[hi] - BED[lo], f2 = (yy - BED[lo]) / th2, shelf = hsh(lo * 3.7) > 0.5 ? 0.2 + 0.7 * hsh(lo * 5.3 + 2) : 0.05 * hsh(lo)
        let off = shelf * sst(0, 0.12, f2) * (1 - 0.5 * sst(0.8, 1, f2)) * (1 - ceil)
        // 岩塊：2.4 m 一格
        const ci = Math.floor(x / 2.4), cj = Math.floor(u / 2.4), bx = (ci + 0.25 + 0.5 * hsh(ci * 7 + cj * 13)) * 2.4, bu = (cj + 0.25 + 0.5 * hsh(ci * 11 + cj * 3)) * 2.4, bs = 0.35 + 0.6 * hsh(ci * 5 + cj * 17)
        const inB = sst(bs + 0.18, bs, Math.max(Math.abs(x - bx), Math.abs(u - bu)))
        off += inB * (hsh(ci * 19 + cj * 2.3) > 0.45 ? 0.38 + 0.3 * ceil : -0.1)
        off += 0.6 * fbm2(x * 0.3, u * 0.3, 3) + 0.34 * fbm2(x * 0.9 + 9, u * 0.9, 3) + 0.12 * fbm2(x * 2.2, u * 2.2 + 4, 2) + 0.5 * ceil * Math.max(0, fbm2(x * 0.22 + 5, d * 0.3, 3) - 0.4)
        let joint = 0; for (let k = 0; k < JX.length; k++) { const jx = JX[k] + 0.5 * Math.sin(u * 0.2 + k * 1.7); joint = Math.max(joint, Math.exp(-(((x - jx) / 0.3) ** 2))) }
        off -= 0.32 * joint * (1 - 0.5 * ceil)
        off = (1.25 + Math.max(0, off)) * edge * (1 - 0.6 * sst(NS - 8, NS, j))   // 舊岩面的岩層有的往洞裡凸出一公尺多：整層往前墊 1.25 m 才蓋得住
        const k3 = (i * (NS + 1) + j) * 3
        pos[k3] = x; pos[k3 + 1] = y + ny * off; pos[k3 + 2] = zb + d + nd * off
        meta.push({ x, y, f2, shelf, ceil, joint, hy: (y - g0) / Math.max(1, Ho), tone: 0.8 + 0.35 * hsh(lo * 3 + 1), open: 1 - Math.min(1, Math.max(0, (d - lip) / Math.max(1, Dp - lip))), fallK })
      }
    }
    const idx = []
    for (let i = 0; i < NXc; i++) for (let j = 0; j < NS; j++) { const a = i * (NS + 1) + j, b = a + NS + 1; idx.push(a, a + 1, b, a + 1, b + 1, b) }
    const cg = new THREE.BufferGeometry(); cg.setAttribute('position', new THREE.BufferAttribute(pos, 3)); cg.setIndex(idx); cg.computeVertexNormals()
    // 面要朝洞口（-z／往下）：檢查一個後壁中間的法線，反了就整個翻面
    { const nrm = cg.attributes.normal, mid = Math.round(NXc / 2) * (NS + 1) + 10; if (nrm.getZ(mid) > 0) { for (let t = 0; t < idx.length; t += 3) { const q = idx[t + 1]; idx[t + 1] = idx[t + 2]; idx[t + 2] = q } cg.setIndex(idx); cg.computeVertexNormals() } }
    const nrm = cg.attributes.normal, col = new Float32Array(meta.length * 3), c = new THREE.Color()
    const dry = new THREE.Color(0.27, 0.23, 0.18), dark = new THREE.Color(0.06, 0.057, 0.052), mossD = new THREE.Color(0.08, 0.2, 0.035), mossL = new THREE.Color(0.26, 0.42, 0.08)
    meta.forEach((m, v) => {
      const ny = nrm.getY(v), n1 = fbm2(m.x * 0.5, m.y * 0.5, 3), n2 = fbm2(m.x * 2.1 + 7, m.y * 2.1, 2)
      c.copy(dry).multiplyScalar(m.tone * (0.8 + 0.35 * n1))
      // 滲水的黑水痕：沿直線往下，天花板的縫和節理底下最多；越靠瀑布越濕
      const streak = sst(0.5, 0.68, fbm2(m.x * 0.6 + 3, m.y * 0.05, 3)) * (0.6 + 0.4 * m.fallK) + 0.6 * m.joint + 0.45 * m.ceil
      c.lerp(dark, Math.min(0.85, streak * 0.8 + 0.25 * m.fallK))
      // 青苔：岩棚頂面、朝上的面、牆腳 3 m、洞口有光的那一帶；天花板深處不長
      const up = sst(0.25, 0.7, ny), low = sst(0.22, 0.02, m.hy), lit = sst(0.35, 0.9, m.open)
      const patch = sst(0.46, 0.62, fbm2(m.x * 0.22 + 11, m.y * 0.22, 3)) * (1 - 0.75 * m.ceil)   // 牆面上一大片一大片的苔（潮濕的岩壁）
      const mo = Math.min(1, (up * 1.0 + low * 0.9 + lit * 0.5 * (1 - m.ceil * 0.6) + patch * 0.8) * sst(0.25, 0.55, n1 + 0.25 * n2 + 0.2 * up))
      c.lerp(mossD.clone().lerp(mossL, n2), mo * 0.9)
      col.set([c.r, c.g, c.b], v * 3)
    })
    cg.setAttribute('color', new THREE.BufferAttribute(col, 3))
    const wallM = mossRockMaterial(); wallM.roughness = 0.5; wallM.side = THREE.DoubleSide
    const shell = new THREE.Mesh(cg, wallM); shell.name = 'caveShell'; shell.receiveShadow = true; shell.castShadow = false; g.add(shell)
    // 滴水：從天花板的縫一滴滴落下來（沿洞口那一帶多），落到地上重來
    {
      const N = 140, P0 = new Float32Array(N * 3), S0 = new Float32Array(N * 3)
      for (let k = 0; k < N; k++) {
        const x = C.x0 + 4 + rnd() * (C.x1 - C.x0 - 8), zb = YOSE.base(x), d = -1 + rnd() * (YOSE.caveD(x) * 0.8), g0 = alpineHeight(x, zb + d)
        const th = Math.acos(Math.min(1, Math.max(0, (d + 1.2) / (YOSE.caveD(x) + 1.2)))), top = alpineHeight(x, zb) + YOSE.caveH(x) * (0.5 + 0.5 * Math.sin(th)) - 0.4
        P0.set([x, top, zb + d], k * 3); S0.set([top - g0, rnd() * 10, 0.6 + rnd() * 0.5], k * 3)
      }
      const dg = new THREE.BufferGeometry(); dg.setAttribute('position', new THREE.BufferAttribute(P0, 3)); dg.setAttribute('aS', new THREE.BufferAttribute(S0, 3))
      const dm = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, uniforms: { uTime: windUniforms.uTime },
        vertexShader: `attribute vec3 aS; uniform float uTime; varying float vA;
          void main() { float T = 1.2 + sqrt(2.0 * aS.x / 9.8); float t = mod(uTime * aS.z + aS.y, T + 2.5); float fall = min(aS.x, 4.9 * max(0.0, t - 1.2) * max(0.0, t - 1.2));
            vA = t < 1.2 ? t / 1.2 * 0.5 : (fall < aS.x ? 1.0 : 0.0); vec3 p = position; p.y -= fall;
            vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = clamp(34.0 / -mv.z, 1.0, 5.0); }`,
        fragmentShader: `varying float vA; void main() { vec2 q = gl_PointCoord - 0.5; float a = smoothstep(0.5, 0.1, length(q * vec2(1.6, 0.9))); gl_FragColor = vec4(0.82, 0.9, 0.95, a * vA * 0.75); }` })
      const drops = new THREE.Points(dg, dm); drops.frustumCulled = false; g.add(drops)
    }
  }
  // 4) 岩簷底下的補光：水簾把天光漫射進來（以前整個岩窟是黑的，看不到岩壁）。不投影
  { const [x, z] = [ex - 3.5, ez + 1.2], lt = new THREE.PointLight(0xb4cbd8, 20, 19, 1.7); lt.position.set(x, alpineHeight(x, z) + 3.2, z); g.add(lt)
    const l3 = new THREE.PointLight(0xb4cbd8, 26, 30, 1.6); l3.position.set(ex - 4, alpineHeight(ex - 4, ez) + 9, ez + 0.5); g.add(l3)   // 高一點的一盞：照到後壁上半和天花板
    const l2 = new THREE.PointLight(0xb4cbd8, 12, 15, 1.7), [x2, z2, ] = line[Math.floor(line.length * 0.55)]; l2.position.set(x2, alpineHeight(x2, z2) + 2.6, z2 + 1); g.add(l2) }
  return g
}
