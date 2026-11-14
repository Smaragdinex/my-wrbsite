// 2026-11-11 瀑布後面的岩窟步道（使用者：從山上走到瀑布，走進洞穴、在旁邊看瀑布；要有草、青苔，高模、更有臨場感。
// 參考：貴州黃果樹水簾洞、冰島 Seljalandsfoss 走到瀑布後面、ChatGPT 概念圖——岩拱門、濕石板路、長滿青苔和蕨類的岩壁、鐵欄杆）
// 岩石全部是 Poly Haven（CC0）攝影測量掃描的真岩石（plants.js 的 lib：rockface_a/b、mrock_*、boulder）
import * as THREE from 'three'
import { ALP_SPURS, YOSE, alpineHeight, addCollider } from './layout.js'
import { mulberry32, fbm2 } from './noise.js'
import { windUniforms } from './wind.js'
import { scatter, parts, lowGeo } from './plants.js'
import { mossRockMaterial } from './yosemite-top.js'
import { rockTex } from './yosemite.js'
import { dayLight } from './structures.js'

const VER = new URL(import.meta.url).searchParams.get('v') ?? ''
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z)

export async function loadCaveKit() { return {} }   // 2026-11-11 改用掃描的真岩石（plants.js 的 lib），不再載自己做的 cave_kit.glb

export const CAVE_FILL = []   // 岩簷底下的天光補光（白天才亮）
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

  // 2026-11-11 使用者：岩石不夠真實，可以用真的岩石嗎 → 全部換成 Poly Haven 攝影測量掃描的真岩石（專案裡本來就有：
  // rockface_a／rockface_b 岩壁掃描、mrock_1～13 長青苔的石頭、boulder），用拼的（kitbash）
  const SC = {}
  // 顏色對到外面的花崗岩壁：掃描的岩片偏褐、帶藍綠 → 去掉一半多的彩度、偏冷灰（青苔還留一點綠）
  const matched = new Map()
  const matchMat = (mat) => {
    if (matched.has(mat)) return matched.get(mat)
    const m2 = mat.clone(), prev = mat.onBeforeCompile
    m2.onBeforeCompile = (sh, r2) => {
      prev?.call(m2, sh, r2)
      sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
        { float cl = dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11)); float gk = smoothstep(0.02, 0.1, diffuseColor.g - max(diffuseColor.r, diffuseColor.b));
          diffuseColor.rgb = mix(vec3(cl), diffuseColor.rgb, mix(0.32, 0.85, gk)) * mix(vec3(1.32, 1.03, 0.68), vec3(1.0), gk); }`)   // 2026-11-12 使用者「瀑布山上下顏色不同」：洞裡的岩石原本對的是灰花崗岩 → 改成跟上面岩壁一樣的暖砂岩色（青苔的綠不動）
    }
    m2.customProgramCacheKey = () => (mat.customProgramCacheKey?.() ?? '') + 'caveMatchSand'
    matched.set(mat, m2); return m2
  }
  const rock = (name, x, y, z, s, yaw = rnd() * 6.28, rx = 0, rz = 0) => { if (!lib?.[name]) return; (SC[name] ||= []).push({ p: V(x, y, z), q: new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, yaw, rz)), s: s instanceof THREE.Vector3 ? s : V(s, s, s) }) }
  // 1) 踏腳石：扁的青苔石頭埋進地裡，只露出頂上幾公分（真的石頭面），沿步道兩顆並排
  const FLAT = ['mrock_10', 'mrock_12', 'mrock_7', 'mrock_9', 'mrock_8'], FH = { mrock_10: 0.77, mrock_12: 0.74, mrock_7: 0.74, mrock_9: 0.61, mrock_8: 0.53 }
  for (let i = 0; i < line.length; i += 3) {
    const [x, z, tx, tz] = line[i]
    for (const lat of [-0.6, 0.55]) {
      const px = x - tz * (lat + (rnd() - 0.5) * 0.3) + tx * (rnd() - 0.5) * 0.3, pz = z + tx * (lat + (rnd() - 0.5) * 0.3) + tz * (rnd() - 0.5) * 0.3
      const n = FLAT[Math.floor(rnd() * FLAT.length)], sc = 0.5 + rnd() * 0.25
      rock(n, px, alpineHeight(px, pz) - FH[n] * sc * 0.55 + 0.06, pz, V(sc, sc * 0.55, sc))
    }
  }
  for (let k = 0; k < 12; k++) { const a = rnd() * 6.28, d = Math.sqrt(rnd()) * 2.0, px = ex + 0.4 + Math.cos(a) * d, pz = ez + Math.sin(a) * d * 0.9, n = FLAT[k % FLAT.length], sc = 0.6 + rnd() * 0.3; rock(n, px, alpineHeight(px, pz) - FH[n] * sc * 0.55 + 0.06, pz, V(sc, sc * 0.55, sc)) }
  // 2) 天然岩拱（2026-11-11 使用者：要做到最好——上一版是兩顆石頭頂一塊石板，不像概念圖的拱）：
  // 十幾顆整顆的掃描石頭沿一條半橢圓的拱互相咬在一起（每顆 2 m 上下、中心間隔不到 1 m，疊成一整條連續的岩體），前後兩圈錯開讓拱有厚度；
  // 拱下淨空約 2.7 m 寬、2.4 m 高。兩隻腳各一個碰撞
  const ARCH = ['mrock_4', 'mrock_3', 'mrock_6', 'mrock_5', 'mrock_2', 'mrock_1'], AH = { mrock_4: 1.77, mrock_3: 1.1, mrock_6: 1.26, mrock_5: 1.21, mrock_2: 1.26, mrock_1: 1.47 }
  // 第三版：上一版每顆石頭亂轉，2～3 m 長的石頭像爆開的石片。這版照真的拱石排：石頭的長邊順著拱的弧線、一顆壓一顆，
  // 內圈石頭的頂面（掃描的那一面）朝拱裡面、外圈朝外，兩圈底對底，人從下面走過看到的都是真的石頭面
  const AD = { mrock_1: [2.24, 3.37, 0.19, -0.305], mrock_2: [2.65, 3.26, 0.585, 0.32], mrock_3: [2.11, 2.08, -0.195, -0.15], mrock_4: [2.13, 1.96, 0.285, 0.39], mrock_5: [1.82, 3.0, -0.18, 0.03], mrock_6: [2.12, 2.76, -0.1, 0.14] }
  const gate = (t, s) => {
    const [x, z, tx, tz] = line[Math.floor(line.length * t)], y = alpineHeight(x, z)
    const RA = 2.7 * s, RB = 3.55 * s, bx = new THREE.Vector3(), by = new THREE.Vector3(), bz = new THREE.Vector3(), mb = new THREE.Matrix4()
    for (const [ring, N] of [[0, 7], [1, 6]]) for (let i = 0; i < N; i++) {
      const a = Math.PI * (0.04 + 0.92 * (i + (ring ? 0.5 : 0)) / (N - (ring ? 0 : 1))), ca = Math.cos(a), sa = Math.sin(a)
      const n = ARCH[(i * 5 + ring * 2 + (s < 1 ? 3 : 0)) % ARCH.length], [wx, lz, cx, cz] = AD[n]
      const len = (ring ? 2.7 : 2.3) * s * (0.92 + rnd() * 0.2), sc = len / lz
      // 拱的平面：橫向 L=(-tz,0,tx)、往上 U；切線 T、朝外的法線 Nn
      const L = V(-tz, 0, tx), T = V(0, 0, 0).addScaledVector(L, -RA * sa).add(V(0, RB * ca, 0)).normalize(), Nn = V(0, 0, 0).addScaledVector(L, RB * ca).add(V(0, RA * sa, 0)).normalize()
      by.copy(Nn).multiplyScalar(ring ? 1 : -1); bz.copy(T).multiplyScalar(i % 2 ? 1 : -1); bx.crossVectors(by, bz)
      const q = new THREE.Quaternion().setFromRotationMatrix(mb.makeBasis(bx, by, bz)).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler((rnd() - 0.5) * 0.3, (rnd() - 0.5) * 0.5, (rnd() - 0.5) * 0.3)))
      const dz = (ring ? 0.25 : -0.2) + (rnd() - 0.5) * 0.3
      const c = V(x, y - 0.35, z).addScaledVector(L, RA * ca).add(V(0, RB * sa, 0)).add(V(tx * dz, 0, tz * dz)).addScaledVector(by, ring ? -0.3 * sc : -0.12 * sc)
      c.sub(V(cx * sc, 0, cz * sc).applyQuaternion(q));
      (SC[n] ||= []).push({ p: c, q, s: V(sc, sc * (ring ? 1.0 : 0.85), sc) })
    }
    // 兩隻腳外側各堆兩顆扶壁石，拱才像是從地上長出來的
    for (const sd of [-1, 1]) {
      for (const [o, f, sc] of [[3.9, 0.5, 0.95], [3.5, -1.0, 0.7]]) { const px = x - tz * sd * o * s + tx * f, pz = z + tx * sd * o * s + tz * f; rock(ARCH[Math.floor(rnd() * 6)], px, alpineHeight(px, pz) - 0.35, pz, sc * s, rnd() * 6.28, (rnd() - 0.5) * 0.3, (rnd() - 0.5) * 0.3) }
      addCollider(x - tz * sd * 2.9 * s, z + tx * sd * 2.9 * s, 1.0 * s, y + 3.2)
    }
  }
  gate(0.5, 1.45)   // 2026-11-12 使用者：一開始進入的拱門岩石大一點（淨空 2.7×2.4 m → 3.9×3.5 m）
  gate(0.8, 1.25)
  // 平台和水簾中間的大石頭（看水簾的「窗」的窗框）、後壁腳下一排岩壁掃描和大石頭
  // 2026-11-13 凹槽改成湖、步道改走後壁的岩架：以前「平台和水簾中間的大石頭」和「後壁腳下一排大石頭」擺在舊步道旁，現在會擋在新路上、泡在湖裡 → 拿掉
  if (false) {
  { const x = ex - 4.4, z = ez - 3.6, y = alpineHeight(x, z); rock('mrock_5', x, y - 0.5, z, V(1.5, 2.4, 1.3), 0.9); addCollider(x, z, 1.4, y + 3) }
  for (const [name, t, off, sc] of [['mrock_2', 0.6, 3.4, 1.4], ['boulder', 0.7, 2.9, 1.5], ['mrock_6', 0.9, 3.4, 1.5], ['mrock_4', 0.98, 3.0, 1.3], ['mrock_6', 0.42, 3.0, 1.2], ['boulder', 0.86, 2.7, 1.1]]) {
    const [x0, z0, tx, tz] = line[Math.min(line.length - 1, Math.floor(line.length * t))], x = x0 - tz * off, z = z0 + tx * off
    rock(name, x, alpineHeight(x, z) - 0.45 * sc, z, sc)
    addCollider(x, z, 1.1 * sc, alpineHeight(x, z) + 2)
  }
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
    // 2026-11-13 使用者（凹槽口往上的石階）「這裡不是牆擋著了嗎」：這層岩壁內襯整片往洞裡墊了 1.25 m（還有岩層凸出），
    // 凹槽西口石階轉彎那裡離步道中線只剩 0.85 m，比半個步道寬還近——岩壁壓在石階上。步道（崖壁石階凹槽那段＋凹槽支線最後一段）
    // 周圍 1.65 m、人走得到的高度（腳下 0.6 m 到頭上 2.8 m）以內的內襯一律往岩壁裡退，其他地方不動
    { const T = YOSE.stairs(), sm = []
      const addSeg = (ax, az, ay, bx, bz, by) => { const L = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.ceil(L / 0.3)); for (let k = 0; k <= n; k++) { const t = k / n; sm.push([ax + (bx - ax) * t, az + (bz - az) * t, ay + (by - ay) * t]) } }
      for (let i = 1; i < T.pts.length && T.yy[i] < 36; i++) addSeg(T.pts[i - 1][0], T.pts[i - 1][1], T.yy[i - 1], T.pts[i][0], T.pts[i][1], T.yy[i])
      const cv = ALP_SPURS.find((q) => q.name === 'cave'); if (cv) for (let i = Math.max(1, cv.pts.length - 2); i < cv.pts.length; i++) addSeg(cv.pts[i - 1][0], cv.pts[i - 1][1], alpineHeight(...cv.pts[i - 1]), cv.pts[i][0], cv.pts[i][1], alpineHeight(...cv.pts[i]))
      const R = 1.65
      for (let v = 0; v < pos.length / 3; v++) {
        const vx = pos[v * 3], vy = pos[v * 3 + 1], vz = pos[v * 3 + 2]
        let need = -1e9
        for (const [px, pz, py] of sm) { const dx = vx - px; if (Math.abs(dx) >= R || vy < py - 0.6 || vy > py + 2.8 || vz < pz - 0.5) continue; need = Math.max(need, pz + Math.sqrt(R * R - dx * dx)) }
        if (vz < need) pos[v * 3 + 2] = need
      } }
    const cg = new THREE.BufferGeometry(); cg.setAttribute('position', new THREE.BufferAttribute(pos, 3)); cg.setIndex(idx); cg.computeVertexNormals()
    // 面要朝洞口（-z／往下）：檢查一個後壁中間的法線，反了就整個翻面
    { const nrm = cg.attributes.normal, mid = Math.round(NXc / 2) * (NS + 1) + 10; if (nrm.getZ(mid) > 0) { for (let t = 0; t < idx.length; t += 3) { const q = idx[t + 1]; idx[t + 1] = idx[t + 2]; idx[t + 2] = q } cg.setIndex(idx); cg.computeVertexNormals() } }
    const nrm = cg.attributes.normal, col = new Float32Array(meta.length * 3), c = new THREE.Color()
    // 這層現在只是掃描岩片縫隙裡的底：壓暗，看起來是岩縫的陰影
    const dry = new THREE.Color(0.13, 0.115, 0.095), dark = new THREE.Color(0.035, 0.033, 0.03), mossD = new THREE.Color(0.08, 0.2, 0.035), mossL = new THREE.Color(0.26, 0.42, 0.08)
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
    // 2026-11-14 ChatGPT 美術驗收第 1 名「瀑布後面那個洞像一個大黑洞」：洞壁改用跟岩壁同一張砂岩貼圖、暖色，再補從水面／洞口反進來的光（白天）
    wallM.map = rockTex(); wallM.color.setRGB(1.15, 1.0, 0.85)
    { const ob = wallM.onBeforeCompile, key = wallM.customProgramCacheKey?.bind(wallM)
      wallM.onBeforeCompile = (sh, r) => { ob?.(sh, r); sh.uniforms.uDayC = dayLight
        sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uDayC;').replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * vec3(1.0, 0.92, 0.8) * 0.45 * uDayC;') }
      wallM.customProgramCacheKey = () => (key ? key() : '') + '|caveSandLit' }
    const shell = new THREE.Mesh(cg, wallM); shell.name = 'caveShell'; shell.receiveShadow = true; shell.castShadow = false; g.add(shell)
    // 後壁和天花板貼滿岩壁掃描（Poly Haven rock_face：一片單面的岩壁浮雕，面朝斜上方 (0, .7, .7)）：
    // 每片轉到面朝洞裡（後壁朝洞口、天花板朝下，中間彎的地方照斷面的角度），像貼磁磚一樣互相疊一點；每片中心貼在程式算的那層岩面前面 0.25 m。
    // 後壁用完整的掃描（每片 8000 個三角形）、天花板離得遠用四分之一面數的版本
    if (lib?.rockface_a) {
      const STP = YOSE.stairs(), nearPath = (x, y, z) => { for (let i = 0; i < STP.pts.length; i++) { if (STP.pts[i][0] > 208) break; if (Math.abs(STP.pts[i][0] - x) < 5.5 && Math.abs(STP.pts[i][1] - z) < 5.0 && y < STP.yy[i] + 10) return true   /* 驗收第 13 條：步道頭上 5～10 m 懸著的單面岩片，從底下看得到背後是空的 → 範圍加大 */ } return false }
      // 手機、平板（觸控為主）：岩片全部用四分之一面數的版本、鋪得稀一點
      const LITE = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches
      const DEF = { rockface_a: V(-0.35, 1.8, -1.45), rockface_b: V(-0.4, 1.25, -0.95) }, L3 = { rockface_a: [[], []], rockface_b: [[], []] }
      const E = new THREE.Euler(), qq = new THREE.Quaternion(), m5 = new THREE.Matrix4()
      const SI = LITE ? 12 : 9, SJW = LITE ? 10 : 8, SJC = LITE ? 12 : 10
      for (let i = 3; i < NXc - 1; i += SI) for (let j = 1; j < NS - 3; j += j < NW ? SJW : SJC) {
        const ii = Math.min(NXc, Math.max(0, i + Math.floor(rnd() * 5 - 2))), jj = Math.max(0, j + Math.floor(rnd() * 4 - 2)), vi = ii * (NS + 1) + jj, m = meta[vi]
        if (YOSE.caveA(m.x) < 0.55) continue   // 洞的兩端（淺、牆彎得急）不貼：從步道看過去是岩片的薄邊
        if (m.ceil > 0.25) continue
        if (nearPath(m.x, pos[vi * 3 + 1], pos[vi * 3 + 2])) continue   // 2026-11-13 步道改走後壁的岩架：會凸到路上的岩片不貼   // 2026-11-13 使用者「瀑布這裡破圖」：岩壁掃描只有正面，貼在天花板、彎角的那些從底下斜看時看到背面和薄邊，像一片片紙 → 只貼後牆（正對步道的那面）
        const nm = rnd() < 0.7 ? 'rockface_a' : 'rockface_b', ctr = DEF[nm], sc = (nm === 'rockface_a' ? 1.2 : 1.8) * (0.95 + rnd() * 0.35)
        const al = m.ceil * Math.PI / 2
        if (m.ceil > 0.9) qq.setFromEuler(E.set(Math.PI * 0.75 + (rnd() - 0.5) * 0.2, rnd() * 6.28, 0, 'YXZ'))
        else qq.setFromEuler(E.set(-Math.PI / 4 - al + (rnd() - 0.5) * 0.2, Math.PI + (rnd() - 0.5) * 0.4, (rnd() - 0.5) * 0.3, 'XYZ'))
        const P0 = V(pos[vi * 3], pos[vi * 3 + 1], pos[vi * 3 + 2]).add(V(0, -0.25 * Math.sin(al), -0.25 * Math.cos(al)))
        const p = P0.sub(ctr.clone().multiplyScalar(sc).applyQuaternion(qq))
        L3[nm][!LITE && jj < 22 ? 0 : 1].push(m5.compose(p, qq, V(sc, sc, sc)).clone())   // 眼睛高度附近（牆的下半）用完整的掃描，其他用低面數
      }
      for (const [nm, [near, far]] of Object.entries(L3)) for (const { geo, mat } of parts(lib[nm])) for (const [list, gg] of [[near, geo], [far, lowGeo(geo) ?? geo]]) {
        if (!list.length) continue
        const im = new THREE.InstancedMesh(gg, matchMat(mat), list.length); list.forEach((mm, k) => im.setMatrixAt(k, mm)); im.receiveShadow = true; im.castShadow = false; im.computeBoundingSphere(); g.add(im)
      }
    }
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
  // 踏腳石照原本的顏色（長青苔的石頭）；岩拱、大石頭跟岩壁一樣對到花崗岩的灰
  for (const [name, list] of Object.entries(SC)) {
    if (FLAT.includes(name) && !ARCH.includes(name)) { scatter(g, lib[name], list, { cast: true }); continue }
    for (const { geo, mat } of parts(lib[name])) { const im = new THREE.InstancedMesh(geo, matchMat(mat), list.length); list.forEach((it, k) => im.setMatrixAt(k, m4.compose(it.p, it.q, it.s))); im.castShadow = true; im.receiveShadow = true; im.computeBoundingSphere(); g.add(im) }
  }
  // 4) 岩簷底下的補光：水簾把天光漫射進來（以前整個岩窟是黑的，看不到岩壁）。不投影
  // 2026-11-13 使用者（夜景照片）：「瀑布這夜晚不會有燈吧」——這三盞是模擬白天天光的補光，晚上也亮著，把岩壁照得像打了探照燈 → 強度跟著天光（world.js setTime 乘 dayLight）
  { const [x, z] = [ex - 3.5, ez + 1.2], lt = new THREE.PointLight(0xb4cbd8, 20, 19, 1.7); lt.position.set(x, alpineHeight(x, z) + 3.2, z); g.add(lt)
    const l3 = new THREE.PointLight(0xb4cbd8, 26, 30, 1.6); l3.position.set(ex - 4, alpineHeight(ex - 4, ez) + 9, ez + 0.5); g.add(l3)   // 高一點的一盞：照到後壁上半和天花板
    const l2 = new THREE.PointLight(0xb4cbd8, 12, 15, 1.7), [x2, z2, ] = line[Math.floor(line.length * 0.55)]; l2.position.set(x2, alpineHeight(x2, z2) + 2.6, z2 + 1); g.add(l2)
    for (const l of [lt, l3, l2]) { l.userData.base = l.intensity; CAVE_FILL.push(l) } }
  return g
}
