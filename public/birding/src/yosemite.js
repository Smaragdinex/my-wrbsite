// 帳篷區後面的優勝美地風（2026-11-10）：yose 支線（主線第 13 點 → 營地）北邊，沿著溫室玻璃的邊緣立一整面花崗岩壁
// 岩壁：灰白、縱向一條條的稜溝（冰河磨過的花崗岩），表面有黑色的水痕（沿岩壁流下的水染黑）、淡色的剝落面；頂上往後收到玻璃邊
// 瀑布：從岩壁頂一條細長的水簾（像優勝美地瀑布），落到岩壁下的水潭，濺起水霧
// 樹：西黃松（Ponderosa）——高、直、橘紅色的鱗片樹皮，樹冠只在上半段、一簇簇的長針葉；這一區原本的冷杉、鐵杉讓開（alpine.js 用 inYose）
import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { ALP_SPURS, alpineHeight, alpineTrailDist, alpineStreamDist, domeRho, domeY, addCollider, YOSE, CAMP, EAST } from './layout.js'
import { mulberry32, fbm2 } from './noise.js'
import { coniferGeo, needleMaterial } from './alpine.js'
import { barkMaterial } from './bark.js'
import { parts, scatter } from './plants.js'
import { bladeMesh } from './flora.js'
import { weatherU, sunDirU, dayLight } from './structures.js'

const TAU = Math.PI * 2, V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z)
const lerpN = (a, b, t) => a + (b - a) * t
const ss = (a, b, v) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t) }

// 花崗岩的顏色貼圖：淺灰底、黑白雲母、石英的小斑點，淡淡的鐵鏽色
function graniteTex() {
  const c = document.createElement('canvas'); c.width = c.height = 512
  const x = c.getContext('2d'), r = mulberry32(17)
  x.fillStyle = '#b9b6ae'; x.fillRect(0, 0, 512, 512)
  for (let i = 0; i < 26000; i++) {
    const k = r(), s = 0.8 + r() * 1.4
    x.fillStyle = k < 0.08 ? `rgba(55,52,50,${0.35 + r() * 0.3})` : k < 0.5 ? `rgba(235,233,226,${0.35 + r() * 0.4})` : k < 0.56 ? `rgba(170,120,80,${0.2 + r() * 0.2})` : `rgba(150,148,140,${0.3 + r() * 0.3})`
    x.fillRect(r() * 512, r() * 512, s, s)
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8
  return t
}

// 2026-11-11 使用者：山路上要有青苔、草 → 岩壁朝上的面（岩棚、平台、山頂）、石階踏板用的值雜訊（世界座標，不靠 UV）
const VER = new URL(import.meta.url).searchParams.get('v') ?? ''
const GLSL_VNOISE = `
  float vnH(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float vn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(vnH(i), vnH(i + vec2(1, 0)), f.x), mix(vnH(i + vec2(0, 1)), vnH(i + vec2(1, 1)), f.x), f.y); }
  float vfbm(vec2 p) { return vn(p) * 0.55 + vn(p * 2.3 + 7.1) * 0.3 + vn(p * 5.1 + 3.7) * 0.15; }`
const SHELTER = { x: 212, z: 102 }   // 岩壁頂上的涼亭（2026-11-11 使用者：涼亭懸空 → 以前 222, 99.5 在平台前緣外 3 m、底下是石階走廊；這裡平台前緣 98.2～後緣 105.8，四邊各留 1 m）
// 2026-11-10 同一套 triplanar 花崗岩（照世界座標三向投影）給邊界外的花崗岩圓頂用（outside.js）；scale：貼圖密度（遠的大一點）
export function graniteMaterial({ fog = true, scale = 0.3 } = {}) {
  const m = new THREE.MeshStandardMaterial({ map: graniteTex(), vertexColors: true, roughness: 0.86, fog })
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vTpW; varying vec3 vTpN;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvTpW = (modelMatrix * vec4(transformed, 1.0)).xyz; vTpN = normalize(mat3(modelMatrix) * objectNormal);')
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vTpW; varying vec3 vTpN;')
      .replace('#include <map_fragment>', `
        vec3 tpB = pow(abs(normalize(vTpN)), vec3(5.0)); tpB /= (tpB.x + tpB.y + tpB.z + 1e-4);
        vec4 tpC = texture2D(map, vTpW.zy * ${scale.toFixed(3)}) * tpB.x + texture2D(map, vTpW.xz * ${scale.toFixed(3)}) * tpB.y + texture2D(map, vTpW.xy * ${scale.toFixed(3)}) * tpB.z;
        vec4 tpL = texture2D(map, vTpW.zy * 0.02 + 0.37) * tpB.x + texture2D(map, vTpW.xz * 0.02 + 0.61) * tpB.y + texture2D(map, vTpW.xy * 0.02 + 0.13) * tpB.z;
        diffuseColor *= mix(tpC, tpC * (0.7 + 0.6 * tpL), 0.7);`)
  }
  m.customProgramCacheKey = () => 'graniteTp' + scale + fog
  return m
}
export function buildYosemite(scene, { lib } = {}) {
  const M0 = { XA: 206, XB: 215.5 }   // 2026-11-12 之字形石階拆了：XB 只剩「步道上到岩壁頂的出口在哪」（路牌用）
  const g = new THREE.Group(); g.name = 'yosemite'; scene.add(g)
  const rnd = mulberry32(1851)
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = V()

  // ---------- 岩壁 ----------
  // 每一欄（沿 x）一個斷面：牆腳在 YOSE.base(x)，往上幾乎垂直（微微往後仰），頂上往後收到玻璃邊
  // 2026-11-10 使用者：「你現在根本低模」→ 岩壁一欄 44 排 → 100 排；瀑布那一帶（176～214）一欄 0.25 m（其他 0.5 m）
  const X0 = YOSE.x0, X1 = YOSE.x1, FACE = 170, TOP = 14   /* 2026-11-12 FACE 100→170：岩壁上多了岩棚、步道的橫槽，斷面變長 */   // 頂面 6→14 排：才畫得出岩縫、磨光面（2026-11-10）
  const XS = []; for (let x = X0; x < X1 - 1e-6;) { XS.push(x); x += x >= 176 && x < 214 ? 0.25 : 0.5 } XS.push(X1)
  const NX = XS.length - 1
  const pos = [], col = [], uv = [], idx = [], caveQ = [], ledgeSpots = []
  const cols = []
  // 岩簷＋層理：這一欄的岩面斷面（d＝離牆腳往裡幾公尺、y），照弧長重新取 FACE+1 個點
  const hsh = (n) => { const v = Math.sin(n * 127.1 + 311.7) * 43758.5453; return v - Math.floor(v) }
  // 2026-11-12 使用者要整段都是 Watkins Glen 那種層狀岩壁秘境 → 整面都是層狀岩（原本只有瀑布旁 x 172～216，兩側是光滑的灰色花崗岩）
  const SED = (x) => 1
  // 2026-11-10 ChatGPT QA 第二輪：層厚不要固定（0.5～3.2 m 亂數）；每 6～12 m 一條主節理（直的深縫）；每 8～15 m 一片 2～5 m 寬的平整岩面；
  // 岩棚凸出 0.3～1.8 m；中尺度凹凸 0.03～0.12 m（波長 0.3～1.5 m）；每 15～25 m² 一塊凸出或缺掉的岩塊（0.4～1.5 m）
  const BED = [-30]; while (BED.at(-1) < 140) BED.push(BED.at(-1) + 0.5 + 2.7 * Math.pow(hsh(BED.length * 1.37), 1.4))
  const JX = [160]; while (JX.at(-1) < 230) JX.push(JX.at(-1) + 6 + 6 * hsh(JX.length * 2.11 + 5))
  const PAN = []; for (let x = 165; x < 225;) { x += 8 + 7 * hsh(x * 0.31); PAN.push([x, 2 + 3 * hsh(x * 0.77)]) }
  const bedAt = (x, y) => {
    const yy = y + 0.1 * (x - 195) + 1.2 * fbm2(x * 0.03, 2.2, 2)
    let lo = 0, hi = BED.length - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (BED[m] <= yy) lo = m; else hi = m }
    const id = lo, th = BED[hi] - BED[lo], f = (yy - BED[lo]) / th
    const jid = Math.floor((x + 3 * hsh(id)) / (2.5 + 3 * hsh(id + 7)))
    // 這層凸出多少：一半的層是凸出的岩棚（0.3～1.8 m），其他微凹
    const prot = hsh(id) > 0.5 ? -(0.3 + 1.5 * Math.pow(hsh(id * 5 + 2), 2)) : 0.15 + 0.35 * hsh(id * 3 + 9)
    let off = prot + (hsh(id * 31 + jid) - 0.5) * 0.5 + 0.25 * Math.sin(f * Math.PI) * Math.min(1, th / 1.5) - 0.4 * ss(1 - Math.min(0.3, 0.35 / th), 1, f)
    // 平整岩面：這一段層理幾乎不見
    let pan = 0; for (const [px, pw] of PAN) pan = Math.max(pan, ss(pw / 2 + 0.8, pw / 2, Math.abs(x - px)))
    off *= 1 - 0.75 * pan
    // 主節理：直的深縫（深 0.2～0.7、寬約 0.15 m）
    let joint = 0; for (let i = 0; i < JX.length; i++) { const jx = JX[i] + 0.6 * Math.sin(y * 0.15 + i); joint = Math.max(joint, (0.2 + 0.5 * hsh(i * 3.3)) * Math.exp(-(((x - jx) / 0.14) ** 2))) }
    // 岩塊：4.5 m 一格，每格一塊凸出或缺損
    const ci = Math.floor(x / 4.5), cj = Math.floor(y / 4.5), bx = (ci + 0.2 + 0.6 * hsh(ci * 7 + cj * 13)) * 4.5, by = (cj + 0.2 + 0.6 * hsh(ci * 11 + cj * 3)) * 4.5, bs = 0.2 + 0.55 * hsh(ci * 5 + cj * 17)
    const inB = ss(bs + 0.12, bs, Math.max(Math.abs(x - bx), Math.abs(y - by) * 1.3))
    off += inB * (hsh(ci * 19 + cj) > 0.5 ? -0.45 : 0.4)
    off += 0.16 * (fbm2(x * 1.4, y * 1.3, 3) - 0.5) + 0.06 * (fbm2(x * 4.1 + 3, y * 3.7, 2) - 0.5)
    const tone = (0.78 + 0.4 * hsh(id * 3 + 1)) * (0.92 + 0.16 * hsh(id * 17 + jid * 5)) * (1 - 0.12 * inB)
    return { off: off + joint, ledge: ss(0.72, 0.97, f) * (prot < 0 ? 1 : 0.25) * (1 - pan), f, tone, joint }
  }
  // 秘境步道（layout.js YOSE.stairs）在岩壁上的橫槽：這一欄 x 有哪些槽（地板高 y0、頂 y1、深到離牆腳 depth）
  const TR = YOSE.stairs(), SHELF_Y = YOSE.shelfY()
  const slotsAt = (x) => {
    const out = [], T = TR
    for (let i = 1; i < T.pts.length; i++) {
      const k = T.kind[i], [ax] = T.pts[i - 1], [bx, bz] = T.pts[i]
      if (k === 'gal' && T.kind[i - 1] !== 'alc') {
        if ((x - ax) * (x - bx) > 0.04) continue
        const t = Math.abs(bx - ax) < 1e-6 ? 0 : Math.max(0, Math.min(1, (x - ax) / (bx - ax))), y = lerpN(T.yy[i - 1], T.yy[i], t)
        out.push({ y0: y - 0.3, y1: y + 2.95, depth: bz - YOSE.base(bx) + 1.75 })
      } else if (k === 'alc' || (k === 'open' && bz - YOSE.base(bx) > 0.2 && bx > 207.5)) {
        // 凹室、進迴廊前那一小段：中線左右 1.5 m 內的欄都切到這一點的深度
        if (Math.abs(x - bx) > 1.5) continue
        // 凹室接隧道的那一頭：不要順著路的方向再多切（不然隧道頭 1.5 m 露在凹室裡，看起來像一截水管）
        const tx = bx - ax
        if (T.kind[i + 1] === 'tun' && (x - bx) * Math.sign(tx) > 0.3) continue
        if (T.kind[i - 1] === 'tun' && (x - bx) * Math.sign(tx) < -0.3) continue
        out.push({ y0: T.yy[i] - 0.3, y1: T.yy[i] + 3.05, depth: bz - YOSE.base(bx) + 1.75 })
      }
    }
    return out
  }
  // 隧道口：岩壁網格在這幾顆球的範圍內不畫（材質裡 discard），隧道的管子才接得出來
  // 球的半徑 1.3（比隧道斷面小一點）：洞整個落在隧道口裡面，從旁邊看不到岩體裡面是空的；門口是一個圓拱
  const PORTALS = [], TC = (i) => new THREE.Vector3(TR.pts[i][0], TR.yy[i], TR.pts[i][1])
  for (let i = 1; i < TR.pts.length; i++) {
    const a = TR.kind[i - 1], b = TR.kind[i]
    if ((a === 'tun') !== (b === 'tun') && a !== 'top' && b !== 'top') { const c = TC(i - 1).add(TC(i)).multiplyScalar(0.5); PORTALS.push(new THREE.Vector4(c.x, c.y + 1.45, c.z, 1.3)) }
  }
  while (PORTALS.length < 6) PORTALS.push(new THREE.Vector4(0, -999, 0, 0))
  const faceProfile = (x, zb, g0, Ht, push, fallK) => {
    const A = YOSE.caveA(x), Dp = YOSE.caveD(x), Ho = YOSE.caveH(x), sed = SED(x)
    const normalD = (y) => {
      const v = (y - (g0 - 1.5)) / (Ht + 1.5)
      const flute = 0.45 * Math.sin(x * 1.7 + Math.sin(y * 0.11) * 2.2) + 0.25 * Math.sin(x * 4.3 + y * 0.05)
      const lump = 1.6 * (fbm2(x * 0.09, y * 0.07, 4) - 0.5)
      return v * 1.8 * (1 - 0.85 * fallK) + (flute + lump) * ss(0, 0.08, v) * (1 - 0.6 * fallK) * (1 - 0.5 * sed) + ss(0.9, 1, v) * 1.2 * (1 - fallK)
    }
    const P = []   // [d, y, inCave(0..1)]
    const yTop = g0 + Ht
    const lip = -1.2 * A * (1 - 0.8 * fallK), yL = g0 + Ho
    // 2026-11-12 岩壁上要往裡切的地方（cutAt(y)＝這個高度多切幾公尺）：岩棚以上整面退 rec；上段瀑布正後方的凹洞（rec2，高 3.3 m）；
    // 秘境步道的橫槽（slotsAt：岩壁迴廊、凹室，高 3.2 m、深到步道內側）。每個切口的上下緣各取兩個點，轉角才是直角
    const R = YOSE.rec(x), R2 = YOSE.rec2(x), slots = slotsAt(x)
    // 橫槽的深度是從牆腳量的；岩壁面本身越高越往後仰（normalD），要扣掉，槽的內壁才會剛好在步道內側
    const nd0 = (y) => (A > 0.02 ? 0 : normalD(y))
    const cutAt = (y) => { let c = 0; if (R > 0.3 && y >= SHELF_Y) c = y < SHELF_Y + 3.3 ? R2 : R; for (const sl of slots) if (y >= sl.y0 && y <= sl.y1) c = Math.max(c, Math.max(1.2, sl.depth - nd0(y))); return c }
    const upper = (yFrom, dBase) => {
      const ys = []; for (let y = yFrom; y < yTop; y += 0.4) ys.push(y)
      const edges = []; if (R > 0.3) edges.push(SHELF_Y, SHELF_Y + 3.3); for (const sl of slots) edges.push(sl.y0, sl.y1)
      for (const e of edges) if (e > yFrom + 0.05 && e < yTop - 0.05) ys.push(e - 0.03, e + 0.03)
      ys.sort((a, b) => a - b)
      for (const y of ys) P.push([dBase(y) + cutAt(y), y, 0])
    }
    if (A > 0.02) {
      P.push([0, g0 - 1.5, 0], [Dp * 0.5, g0 - 1.5, 1], [Dp, g0 - 1.5, 1])
      for (let j = 0; j <= 10; j++) P.push([Dp + 0.6 * A * Math.sin(j / 10 * Math.PI), g0 - 1.5 + (Ho * 0.5 + 1.5) * j / 10, 1])
      for (let j = 1; j <= 16; j++) { const th = j / 16 * Math.PI / 2; P.push([lip + (Dp - lip) * Math.cos(th), g0 + Ho * 0.5 + Ho * 0.5 * Math.sin(th), 1 - 0.7 * j / 16]) }
      P.push([lip - 0.35 * A, yL + 0.5, 0], [lip * 0.6, yL + 1.6, 0])
      upper(yL + 2.0, (y) => Math.min(lip * 0.6 * ss(yL + 8, yL + 2, y), 0) + normalD(y) * ss(yL + 2, yL + 9, y))
    } else upper(g0 - 1.5, normalD)
    const cutTop = cutAt(yTop)
    P.push([normalD(yTop) + cutTop, yTop, 0])
    // 弧長重取樣
    const Ls = [0]; for (let i = 1; i < P.length; i++) Ls.push(Ls[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]))
    const out = []
    for (let k = 0, i = 1; k <= FACE; k++) {
      const s0 = Ls.at(-1) * k / FACE; while (i < P.length - 1 && Ls[i] < s0) i++
      const u = (s0 - Ls[i - 1]) / Math.max(1e-6, Ls[i] - Ls[i - 1]), d = lerpN(P[i - 1][0], P[i][0], u), y = lerpN(P[i - 1][1], P[i][1], u), q = lerpN(P[i - 1][2], P[i][2], u)
      // 層理只往裡凹（瀑布水簾那幾公尺）或前後都有（其他地方）；岩窟裡也有
      const b = bedAt(x, y), bo = sed * (fallK > 0.3 ? Math.max(0, b.off) + 0.2 : b.off) * ss(g0 - 0.5, g0 + 1.5, y)
      out.push([y, Math.max(push, zb + d + bo), q, b.ledge * sed, b.tone, b.joint * sed])
    }
    if (A > 0.25) out.lip = { y: g0 + Ho + 0.3, z: zb + lip - 0.35 * A, A }
    out.cutTop = cutTop
    return out
  }
  for (let i = 0; i <= NX; i++) {
    const x = XS[i], zb = YOSE.base(x), ze = YOSE.edge(x) - 0.8
    const g0 = alpineHeight(x, zb)
    const Ht = YOSE.Ht(x)   // layout.js：兩端收矮；瀑布口到石階頂那段頂上是平的
    // 2026-11-11 石階平台那一段（XA～XB）：岩壁本體往後退到最上一層平台的後面，前面是一階一階的平台（下面另外畫）
    const terr = false, push = -1e9, fk = YOSE.flatK(x)   // 2026-11-12 之字形石階的平台拆掉了，整面都是岩壁本體
    const fallK = Math.exp(-(((x - YOSE.fall.x) / 8) ** 2))   // 瀑布口那幾公尺：岩壁不往後仰、頂上不凸，水簾貼著岩壁落下（以前瀑布口浮在岩壁前面）
    const row = []
    const prof = faceProfile(x, zb, g0, Ht, push, fallK), sed = SED(x)
    cols.push({ x, zb, g0, Ht, terr, lip: prof.lip })
    for (let k = 0; k <= FACE + TOP; k++) {
      let y, z
      if (k <= FACE) {
        y = prof[k][0]; z = prof[k][1]
      } else {
        const t = (k - FACE) / TOP, z0 = Math.max(zb + 3.0 - 2.4 * fallK + YOSE.rec(x), zb + prof.cutTop + 0.45)
        y = g0 + Ht + lerpN(Math.sin(t * Math.PI * 0.5) * 0.8 - t * t * 0.6, -0.04 * t, fk)   // 平的那段：頂上平平的、往後微微低一點
        z = z0 + (ze - z0) * t
      }
      row.push([x, y, z])
    }
    for (const [ri, [px, py, pz]] of row.entries()) {
      const pr = ri <= FACE ? prof[ri] : null, inCave = pr ? pr[2] : 0, ledge = pr ? pr[3] : 0, tone = pr ? pr[4] : 1, jnt = pr ? pr[5] : 0
      caveQ.push(inCave)
      if (ledge > 0.45 && inCave < 0.25 && py > YOSE.g0(px) + 1.2 && py < YOSE.g0(px) + 40 && rnd() < 0.3) ledgeSpots.push([px, py, pz, inCave])
      pos.push(px, py, pz); uv.push(px * 0.22, ri > FACE ? pz * 0.22 + 40 : py * 0.22)   // 頂上那幾排用 z 當貼圖座標（以前用 y，頂面被拉成一條條）
      // 黑色水痕：一條條縱向（只看 x），從上往下淡；淡色剝落面：大塊
      const streak = Math.max(0, fbm2(px * 0.35, 7.1, 3) - 0.52) * 3.2 * ss(g0, g0 + Ht, py) * (ri > FACE ? 0.1 : 1)   // 頂面不畫縱向水痕（會變一條條）
      const pale = Math.max(0, fbm2(px * 0.06, py * 0.06 + 4, 3) - 0.55) * 1.6
      const wet = Math.exp(-(((px - YOSE.fall.x) / 4.2) ** 2)) * (0.55 + 0.45 * ss(g0, g0 + 3, py))   // 瀑布後面濕掉的黑色岩壁
      let k = Math.max(0.3, (1 - streak * 0.75 + pale * 0.25) * (1 - 0.55 * wet))
      if (ri > FACE) {
        // 2026-11-10 頂面（使用者給 Tenaya Lake 的照片、ChatGPT：不要像水泥）：亮一點的暖米灰花崗岩；冰河磨光的亮面一大塊一塊；
        // 節理裂縫（兩組方向、細、深色）；高度不動（走路、溪、欄杆都不受影響）
        const polish = Math.max(0, fbm2(px * 0.12 + 9, pz * 0.12, 3) - 0.5) * 1.4
        const cr1 = Math.pow(1 - Math.abs(Math.sin(px * 0.55 + pz * 0.21 + 2.5 * fbm2(px * 0.05, pz * 0.05, 2))), 22)
        const cr2 = Math.pow(1 - Math.abs(Math.sin(pz * 0.62 - px * 0.13 + 2.0 * fbm2(px * 0.06 + 4, pz * 0.06, 2))), 26)
        k = (1.12 + polish * 0.25) * (1 - 0.45 * Math.max(cr1, cr2))
        col.push(k * 1.04, k, k * 0.92)
      } else if (sed > 0.01) {
        // 2026-11-10 松龍岩（ChatGPT QA 第二輪 linear）：乾岩 0.22/0.20/0.18、濕岩 0.075/0.08/0.07、岩簷深處 0.045；苔 0.045/0.085/0.035
        // 貼圖平均約 0.5，所以頂點色 ×2。瀑布兩側 3～8 m 不規則滲水帶；苔集中在岩棚下緣、裂縫、滲水帶（20～40%）
        const seep = Math.max(0, fbm2(px * 0.28 + 3, py * 0.03, 3) - 0.42) * 2.6 * (0.4 + 0.6 * Math.exp(-(((px - YOSE.fall.x) / 9) ** 2)))
        const wetF = Math.min(1, Math.exp(-(((px - YOSE.fall.x) / 6.5) ** 2)) * 0.9 + 0.5 * inCave + seep)
        const deep = inCave * inCave
        // 2026-11-12 ChatGPT 峽谷規格（docs/GORGE_SPEC.txt，linear；頂點色 ×2）：乾砂岩 .30/.27/.22、乾頁岩 .18/.19/.18、濕砂岩 .105/.095/.078、濕頁岩 .065/.075/.07、
        // 苔 .035/.115/.025、鐵鏽 .25/.095/.035。這一層是砂岩還是頁岩看它的明暗（tone 暗的當頁岩）
        const shl = Math.min(1, Math.max(0, (1.0 - tone) * 3.2))
        let r0 = lerpN(lerpN(0.74, 0.42, shl), lerpN(0.25, 0.14, shl), wetF), g0c = lerpN(lerpN(0.58, 0.40, shl), lerpN(0.2, 0.15, shl), wetF), b0 = lerpN(lerpN(0.38, 0.35, shl), lerpN(0.14, 0.135, shl), wetF)   // 乾砂岩再暖一點（底圖是灰的花崗岩貼圖，照規格的數字出來偏灰）
        { const iron = Math.max(0, fbm2(px * 0.21 + 11, py * 0.35 + 5, 3) - 0.6) * 2.4 * (1 - 0.6 * wetF); r0 = lerpN(r0, 0.5, iron * 0.5); g0c = lerpN(g0c, 0.19, iron * 0.5); b0 = lerpN(b0, 0.07, iron * 0.5) }
        r0 = lerpN(r0, 0.11, deep * 0.7); g0c = lerpN(g0c, 0.115, deep * 0.7); b0 = lerpN(b0, 0.1, deep * 0.7)
        const crackD = 1 - 0.6 * Math.min(1, jnt * 2.2)
        r0 *= tone * crackD * (1 - streak * 0.35); g0c *= tone * crackD * (1 - streak * 0.35); b0 *= tone * crackD * (1 - streak * 0.35)
        const moss = Math.min(1, ledge * (0.6 + 0.6 * wetF) + Math.min(1, jnt * 2) * 0.5 * wetF + 0.6 * Math.max(0, fbm2(px * 0.6, py * 0.5 + 7, 3) - 0.55) * 2 * wetF) * (1 - 0.7 * deep)
        const cr = lerpN(r0, 0.08, moss), cg2 = lerpN(g0c, 0.235, moss), cb = lerpN(b0, 0.05, moss)
        const gr = k * (1 - streak * 0.05)
        col.push(lerpN(gr, cr, sed), lerpN(k, cg2, sed), lerpN(gr * (1 + streak * 0.02), cb, sed))
      } else col.push(k * (1 - streak * 0.05), k, k * (1 + streak * 0.02))
    }
  }
  const W = FACE + TOP + 1
  for (let i = 0; i < NX; i++) for (let k = 0; k < W - 1; k++) { const a = i * W + k, b = a + W; idx.push(a, a + 1, b, a + 1, b + 1, b) }
  const cg = new THREE.BufferGeometry()
  cg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); cg.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); cg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  cg.setIndex(idx); cg.computeVertexNormals()
  const rockN = lib?.rockface_a ? parts(lib.rockface_a).find((p) => p.mat.normalMap)?.mat.normalMap : null   // 掃描岩石的法線圖借來當細部凹凸
  if (rockN) { rockN.wrapS = rockN.wrapT = THREE.RepeatWrapping }
  // 2026-11-11 ChatGPT：垂直岩面用 triplanar（照世界座標從三個方向投影，依法線混合），不靠 UV——以前平台的石壁、岩壁頂面貼圖被拉成一條條
  // 法線貼圖拿掉（它也是照 UV 貼的，一樣會拉長）；粗糙度 0.86；大尺度的深淺另外用頂點色
  const cliffM = new THREE.MeshStandardMaterial({ map: graniteTex(), vertexColors: true, roughness: 0.86, side: THREE.DoubleSide })
  cliffM.onBeforeCompile = (sh) => {
    sh.uniforms.uPortal = { value: PORTALS }
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vTpW; varying vec3 vTpN;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvTpW = (modelMatrix * vec4(transformed, 1.0)).xyz; vTpN = normalize(mat3(modelMatrix) * objectNormal);')
    // 2026-11-10 使用者「低模」：加凹凸（用貼圖亮度當高度，螢幕空間導數擾動法線；不靠 UV）
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
      varying vec3 vTpW; varying vec3 vTpN; float tpH; uniform vec4 uPortal[6];${GLSL_VNOISE}
      vec3 tpPerturb(vec3 surf_pos, vec3 surf_norm, vec2 dHdxy, float faceDirection) {
        vec3 vSigmaX = normalize(dFdx(surf_pos)), vSigmaY = normalize(dFdy(surf_pos)), vN = surf_norm;
        vec3 R1 = cross(vSigmaY, vN), R2 = cross(vN, vSigmaX); float fDet = dot(vSigmaX, R1) * faceDirection;
        vec3 vGrad = sign(fDet) * (dHdxy.x * R1 + dHdxy.y * R2); return normalize(abs(fDet) * surf_norm - vGrad);
      }`)
      .replace('#include <map_fragment>', `
        for (int pi = 0; pi < 6; pi++) { if (distance(vTpW, uPortal[pi].xyz) < uPortal[pi].w) discard; }
        vec3 tpB = pow(abs(normalize(vTpN)), vec3(5.0)); tpB /= (tpB.x + tpB.y + tpB.z + 1e-4);
        vec4 tpC = texture2D(map, vTpW.zy * 0.3) * tpB.x + texture2D(map, vTpW.xz * 0.3) * tpB.y + texture2D(map, vTpW.xy * 0.3) * tpB.z;
        vec4 tpL = texture2D(map, vTpW.zy * 0.045 + 0.37) * tpB.x + texture2D(map, vTpW.xz * 0.045 + 0.61) * tpB.y + texture2D(map, vTpW.xy * 0.045 + 0.13) * tpB.z;
        vec4 tpM = texture2D(map, vTpW.zy * 0.11 + 0.21) * tpB.x + texture2D(map, vTpW.xz * 0.11 + 0.47) * tpB.y + texture2D(map, vTpW.xy * 0.11 + 0.71) * tpB.z;
        tpH = dot(tpC.rgb, vec3(0.33)) * 0.35 + dot(tpM.rgb, vec3(0.33)) * 0.9 + dot(tpL.rgb, vec3(0.33)) * 1.6;
        diffuseColor *= mix(tpC, tpC * (0.75 + 0.5 * tpL), 0.6);
        // 2026-11-12 薄層理（Watkins Glen 的頁岩：一層 8～24 公分，夾 25～65 公分的砂岩）：網格一排 45 公分畫不出來，在材質裡照世界高度切層——
        // 每層深淺不同、層面是一條深色的縫；高度也照層疊一階一階加上去，縫那裡法線會轉、看起來有立體的陰影
        { float wallK = 1.0 - smoothstep(0.35, 0.75, abs(normalize(vTpN).y));
          float sdist = length(vViewPosition);
          // 直的節理把岩壁切成 2～3 m 寬的一塊塊，每塊的層面上下錯開一點（不然整面像掃描線）；層的密度隨高度變（薄頁岩帶、厚砂岩帶交替）
          float cell = floor(vTpW.x / 3.3 + 0.37);   // 只看 x：混進 z 的話岩棚凹凸會讓格子來回跳，層線斷成一截一截的虛線
          // 層面只跟高度有關（加一點點沿 x 的起伏和每塊的錯位）：混進二維雜訊的話，層線會繞成一圈圈像木紋
          float vy = vTpW.y + 0.07 * sin(vTpW.x * 0.21) + 0.012 * (vTpW.x - 195.0) + 0.1 * fract(sin(cell * 17.3) * 4375.5);
          float u1 = vy * 1.1 + 0.6 * vn(vec2(vy * 0.7, 3.0));
          float b1 = fract(u1), h1 = fract(sin(floor(u1) * 78.233) * 43758.5453);
          // 每個厚層裡再分 1～6 片薄層（頁岩帶片數多、砂岩帶是整塊）
          float nThin = floor(1.0 + 5.99 * fract(h1 * 7.31)), u2 = b1 * nThin;
          float b2 = fract(u2), h2 = fract(sin((floor(u1) * 7.0 + floor(u2)) * 12.9898) * 43758.5453);
          float thin = smoothstep(75.0, 22.0, sdist);                         // 遠處薄層糊掉（比像素細，會閃）
          float seam = max(smoothstep(0.12, 0.0, b2) * step(0.35, h2) * 0.45 * thin, smoothstep(0.05, 0.0, b1) * 0.9);
          vec3 tint = mix(vec3(0.86, 0.9, 0.93), vec3(1.16, 1.0, 0.8), h1) * mix(1.0, 0.8 + 0.4 * h2, thin);   // 冷灰的頁岩層／暖褐的砂岩層
          diffuseColor.rgb *= mix(vec3(1.0), tint * (1.0 - 0.42 * seam), wallK);
          tpH += wallK * ((1.0 - abs(b2 * 2.0 - 1.0)) * 0.22 * thin + (1.0 - abs(b1 * 2.0 - 1.0)) * 0.55); }`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        { float dist = length(vViewPosition); vec2 dH = clamp(vec2(dFdx(tpH), dFdy(tpH)) * 2.2, -0.9, 0.9) * smoothstep(90.0, 15.0, dist); normal = tpPerturb(-vViewPosition, normal, dH, faceDirection); }   // clamp：層面那條線高度是跳的，導數會爆掉、變成一截一截的亮線`)
  }
  { const ob = cliffM.onBeforeCompile
    // 朝上的面長青苔／草：岩棚一塊塊苔、山頂平台（y > 70）大片草地（中間留些露岩）；越靠瀑布越濕、苔越綠
    cliffM.onBeforeCompile = (sh) => { ob(sh); sh.fragmentShader = sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      { float up = smoothstep(0.62, 0.9, normalize(vTpN).y);
        float nn = vfbm(vTpW.xz * 0.35), nf = vfbm(vTpW.xz * 2.2 + 4.0);
        float top = smoothstep(68.0, 73.0, vTpW.y);
        float cov = up * smoothstep(0.62 - 0.3 * top, 0.72 - 0.25 * top, nn + 0.1 * nf);
        vec3 mossC = mix(vec3(0.05, 0.1, 0.022), vec3(0.15, 0.22, 0.05), nf);
        vec3 grassC = mix(vec3(0.1, 0.14, 0.04), vec3(0.26, 0.26, 0.11), smoothstep(0.4, 0.75, nn));
        diffuseColor.rgb = mix(diffuseColor.rgb, mix(mossC, grassC, top) * (0.8 + 0.4 * nf), cov * 0.92);
        // 牆面（垂直）偶爾一條條青苔／水痕：低處、背陽面多
        float vert = 1.0 - smoothstep(0.3, 0.6, abs(normalize(vTpN).y));
        float streak = smoothstep(0.66, 0.8, vfbm(vec2(vTpW.x * 0.9 + vTpW.z * 0.9, vTpW.y * 0.08)));
        diffuseColor.rgb = mix(diffuseColor.rgb, mossC * 1.1, vert * streak * 0.55); }`) }
  }
  cliffM.customProgramCacheKey = () => 'cliffTriplanar'
  const cliff = new THREE.Mesh(cg, cliffM); cliff.castShadow = true; cliff.receiveShadow = true; g.add(cliff)
  // 岩壁封起來（ChatGPT：要是有厚度的封閉岩體）：兩端各一片側面（從岩壁斷面一路接到後下角）、後面一道牆往下埋進地裡——
  // 以前從岩壁尾端下面往上看，頂面是一片懸空的薄板
  {
    const P = cg.attributes.position, sp = [], si = []
    const add = (x, y, z) => { sp.push(x, y, z); return sp.length / 3 - 1 }
    for (const ci of [0, NX]) {
      const c = cols[ci], base = add(c.x, c.g0 - 3, YOSE.edge(c.x) - 0.8)
      let prev = null, first = null
      for (let k = 0; k < W; k++) { const i = ci * W + k, v = add(P.getX(i), P.getY(i), P.getZ(i)); if (first == null) first = v; if (prev != null) si.push(base, prev, v); prev = v }
      const b0 = add(c.x, c.g0 - 3, c.zb - 0.5); si.push(base, b0, first)   // 底下那一角也封起來
    }
    for (let ci = 0; ci < NX; ci++) {   // 後面：頂面最後一排往下到地裡
      const i0 = ci * W + W - 1, i1 = (ci + 1) * W + W - 1
      const a = add(P.getX(i0), P.getY(i0), P.getZ(i0)), b = add(P.getX(i1), P.getY(i1), P.getZ(i1))
      const a2 = add(P.getX(i0), cols[ci].g0 - 3, P.getZ(i0)), b2 = add(P.getX(i1), cols[ci + 1].g0 - 3, P.getZ(i1))
      si.push(a, b, a2, b, b2, a2)
    }
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3))
    sg.setAttribute('color', new THREE.Float32BufferAttribute(new Array(sp.length).fill(0.82), 3)); sg.setAttribute('uv', new THREE.Float32BufferAttribute(new Array(sp.length / 3 * 2).fill(0), 2))
    sg.setIndex(si); sg.computeVertexNormals()
    const sm = new THREE.Mesh(sg, cliffM); sm.castShadow = true; sm.receiveShadow = true; g.add(sm)
  }
  for (const c of cols) if (!(c.x > 205 && c.x < 244) && YOSE.caveA(c.x) < 0.08 && Math.abs(c.x * 2 - Math.round(c.x * 2)) < 1e-6 && Math.round(c.x * 2) % 3 === 0) addCollider(c.x, c.zb + 0.9, 1.3, c.g0 + c.Ht)
  // 岩窟：碰撞放在後壁（往裡 caveD 的地方）
  for (let x = YOSE.cave.x0; x <= YOSE.cave.x1; x += 0.6) { const A = YOSE.caveA(x); if (A < 0.08) continue; addCollider(x, YOSE.base(x) + Math.max(0.9, YOSE.caveD(x) - 0.6), 0.75, YOSE.g0(x) + YOSE.caveH(x)) }   // 石階平台兩端外面也不放（半徑 1.3 會伸進轉彎的平台）

  // 岩壁腳下的落石堆：掃描的岩石、大石頭，沿牆腳 1～4 公尺
  if (lib) {
    const names = ['boulder', 'mrock_1', 'mrock_3', 'mrock_5', 'mrock_8', 'mrock_11'].filter((n) => lib[n]), lists = Object.fromEntries(names.map((n) => [n, []]))
    // 2026-11-10 使用者：石頭再大、再寫實 → 落石堆的石頭放大 1.6 倍；水潭四周一圈 1.5～4 公尺的大石頭（濕的、顏色深）；石頭不能壓到步道（照石頭大小算）
    const FL = YOSE.fall, inPool = (x, z, pad) => ((x - FL.x) / (FL.rx + pad)) ** 2 + ((z - FL.z) / (FL.rz + pad)) ** 2 < 1
    const wetC = (x) => { const w = Math.exp(-(((x - FL.x) / 9) ** 2)); return new THREE.Color().setScalar(1.35 - 0.3 * w) }
    const putRock = (n, x, z, k2, sink = 0.25) => lists[n].push({ p: V(x, alpineHeight(x, z) - sink * k2, z), q: new THREE.Quaternion().setFromEuler(new THREE.Euler(rnd() * 0.3, rnd() * TAU, rnd() * 0.3)), s: V(k2, k2 * (0.7 + rnd() * 0.5), k2), c: wetC(x) })
    for (let k = 0; k < 260; k++) {
      const x = X0 + 4 + rnd() * (X1 - X0 - 8), z = YOSE.base(x) - 0.5 - rnd() * 4
      const n = names[Math.floor(rnd() * names.length)], k2 = (n === 'boulder' ? 0.25 + rnd() * 0.35 : 0.6 + rnd() * 0.9) * 1.6
      if (alpineTrailDist(x, z) < 3.2 + k2 * (n === 'boulder' ? 2.2 : 0.7) || inPool(x, z, 0.6) || YOSE.inLake(x, z, 1.5) || alpineStreamDist(x, z) < 2.5 || (x > 204 && x < 244)) continue
      putRock(n, x, z, k2)
    }
    for (let k = 0, made = 0; k < 400 && made < 16; k++) {   // 水潭邊的大石頭（不擋住看瀑布的那一面：步道那側少放）
      const a = rnd() * TAU, x = FL.x + Math.cos(a) * (FL.rx + 0.6 + rnd() * 1.6), z = FL.z + Math.sin(a) * (FL.rz + 0.5 + rnd() * 1.4)
      const n = rnd() < 0.5 && lib.boulder ? 'boulder' : names[1 + Math.floor(rnd() * (names.length - 1))], k2 = n === 'boulder' ? 0.45 + rnd() * 0.5 : 1.6 + rnd() * 1.6
      if (!lists[n] || alpineTrailDist(x, z) < 3.4 + k2 * (n === 'boulder' ? 2.2 : 0.7) || (Math.sin(a) < -0.3 && rnd() < 0.7) || YOSE.inLake(x, z, -0.5)) continue
      putRock(n, x, z, k2, 0.3); addCollider(x, z, k2 * (n === 'boulder' ? 1.6 : 0.6), alpineHeight(x, z) + k2 * 0.8); made++
    }
    // 岩石改成灰白（花崗岩）：材質複製一份、顏色去飽和再提亮（原本掃描的是褐色、長青苔的石頭），跟岩壁一致
    for (const n of names) {
      if (!lists[n].length) continue
      for (const { geo, mat } of parts(lib[n])) {
        const m2 = mat.clone()
        m2.onBeforeCompile = (sh) => { sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
          float gl = dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11)); diffuseColor.rgb = mix(vec3(gl) * vec3(1.5, 1.48, 1.43) + 0.03, diffuseColor.rgb * 1.25, 0.3);`) }   // 留三成原本的顏色（青苔、鏽斑），比較寫實
        m2.customProgramCacheKey = () => 'granite'
        const im = new THREE.InstancedMesh(geo, m2, lists[n].length)
        lists[n].forEach((it, i) => { im.setMatrixAt(i, m4.compose(it.p, it.q, it.s)); im.setColorAt(i, it.c) })
        im.castShadow = true; im.receiveShadow = true; im.computeBoundingSphere(); g.add(im)
      }
    }
  }

  // ---------- 瀑布＋水潭（2026-11-10 使用者：更大、更長、更寫實、更有臨場感）----------
  // 三層水簾：後面一層慢、暗（有厚度）；主水簾一條條往下加速的水絲＋白色的「馬尾」水團；前面下半段一層水霧簾
  // 落點：500 顆水花往上往外噴、慢慢飄散；大片水霧；橢圓水潭（13×6.4 公尺）、兩層白沫一圈圈往外；岩壁背後濕黑一條
  const F = YOSE.fall, fc = cols.reduce((a, c) => Math.abs(c.x - F.x) < Math.abs(a.x - F.x) ? c : a)
  const poolY = YOSE.lake.water   // 2026-11-11 落到湖裡（layout.js YOSE.lake）
  const topY = fc.g0 + fc.Ht, fz = fc.zb + 0.6
  const uT = { value: 0 }
  const fallMat = (o) => new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    uniforms: { uT, uSpd: { value: o.spd }, uA: { value: o.a }, uDark: { value: o.dark ?? 0 }, uLow: { value: o.low ?? 0 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `
      varying vec2 vUv; uniform float uT, uSpd, uA, uDark, uLow;
      float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
      float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f); return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
      float fbm(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 4; i++){ s += a * n(p); p *= 2.03; a *= 0.5; } return s; }
      void main(){
        float x = vUv.x, y = vUv.y;
        float fall = y * y * 1.6 + y * 0.6;                         // 越往下流越快（重力加速）
        float t = uT * uSpd;
        float s1 = n(vec2(x * 26.0, fall * 4.0 - t * 2.4)), s2 = n(vec2(x * 61.0 + 3.0, fall * 7.0 - t * 3.6));
        float str = smoothstep(0.32, 0.86, s1 * 0.55 + s2 * 0.5);
        float plume = smoothstep(0.48, 0.8, fbm(vec2(x * 7.0, fall * 2.2 - t * 1.7)));   // 白色的水團（馬尾瀑）
        float spread = mix(0.16, 0.06, y);
        float edge = smoothstep(0.0, spread, x) * smoothstep(1.0, 1.0 - spread, x);
        edge *= 0.75 + 0.25 * n(vec2(x * 9.0, fall * 3.0 - t * 1.5));                     // 邊緣破碎
        float low = mix(1.0, smoothstep(0.35, 0.75, y), uLow);                               // 水霧簾只在下半段
        float a = (0.22 + 0.55 * str + 0.45 * plume) * edge * low * uA * mix(0.85, 1.0, y);
        vec3 c = mix(vec3(0.72, 0.8, 0.84), vec3(1.0), clamp(str * 0.6 + plume, 0.0, 1.0));
        gl_FragColor = vec4(mix(c, c * 0.6, uDark), clamp(a, 0.0, 1.0));
      }`,
  })
  {
    const sheet = (wTop, wBot, back, outK, mat, ro, v0 = 0) => {
      const N = 40, P = [], U = [], I = []
      for (let k = 0; k <= N; k++) {
        const v = v0 + (1 - v0) * k / N, y = topY + 0.05 - (topY + 0.05 - poolY) * v, w = wTop + (wBot - wTop) * v, out = back + outK * v * v
        P.push(F.x - w, y, fz - out, F.x + w, y, fz - out); U.push(0, v, 1, v)
        if (k) { const a = (k - 1) * 2; I.push(a, a + 1, a + 2, a + 1, a + 3, a + 2) }
      }
      const fg = new THREE.BufferGeometry(); fg.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); fg.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2)); fg.setIndex(I)
      const m = new THREE.Mesh(fg, mat); m.renderOrder = ro; g.add(m)
    }
    // 2026-11-12 兩段式：上段細瀑（寬 3～4.5 m、約 22 m）落在岩棚上；岩棚上一片薄薄的水流到岩簷口；下段寬水簾（頂 5～6 m、底 11～13 m）落進湖裡
    const REC = YOSE.rec(F.x), shelfY = SHELF_Y, zUp = fz + REC, zLipW = fc.lip ? fc.lip.z - 0.35 : fz
    const tier = (yA, yB, zA, wTop, wBot, back, outK, mat, ro, v0 = 0) => {
      const N = 30, P = [], U = [], I = []
      for (let k = 0; k <= N; k++) {
        const v = v0 + (1 - v0) * k / N, y = yA - (yA - yB) * v, w = wTop + (wBot - wTop) * v, out = back + outK * v * v
        P.push(F.x - w, y, zA - out, F.x + w, y, zA - out); U.push(0, v, 1, v)
        if (k) { const a = (k - 1) * 2; I.push(a, a + 1, a + 2, a + 1, a + 3, a + 2) }
      }
      const fg = new THREE.BufferGeometry(); fg.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); fg.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2)); fg.setIndex(I)
      const m = new THREE.Mesh(fg, mat); m.renderOrder = ro; g.add(m)
    }
    // 上段
    tier(topY + 0.05, shelfY - 0.1, zUp, 1.4, 2.0, 0.2, 1.3, fallMat({ spd: 0.7, a: 0.55, dark: 0.35 }), 3)
    tier(topY + 0.05, shelfY - 0.1, zUp, 1.6, 2.4, 0.4, 2.0, fallMat({ spd: 1.0, a: 1.0 }), 4)
    // 岩棚上的水：從上段落點往外攤開、流到岩簷口（一片斜斜的薄水，用同一種水簾材質、流速慢）
    { const P = [], U = [], I = [], N = 10, z0 = zUp - 2.2, z1 = zLipW + 0.1
      for (let k = 0; k <= N; k++) { const t = k / N, z = z0 + (z1 - z0) * t, w = 2.6 + 3.2 * t, y = shelfY + 0.12 - 0.5 * t * t; P.push(F.x - w, y, z, F.x + w, y, z); U.push(0, t, 1, t); if (k) { const a = (k - 1) * 2; I.push(a, a + 1, a + 2, a + 1, a + 3, a + 2) } }
      const fg = new THREE.BufferGeometry(); fg.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); fg.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2)); fg.setIndex(I)
      const m = new THREE.Mesh(fg, fallMat({ spd: 0.35, a: 0.7, dark: 0.25 })); m.renderOrder = 3; g.add(m) }
    // 下段
    const yLipW = shelfY - 0.4
    tier(yLipW, poolY, zLipW, 2.6, 5.4, 0.1, 2.0, fallMat({ spd: 0.7, a: 0.5, dark: 0.35 }), 3)
    tier(yLipW, poolY, zLipW, 2.9, 6.2, 0.25, 3.0, fallMat({ spd: 1.0, a: 0.95 }), 4)
    tier(yLipW, poolY, zLipW, 3.3, 6.8, 0.6, 3.8, fallMat({ spd: 1.35, a: 0.42, low: 1 }), 5, 0.3)
    // 2026-11-12 水霧裡的彩虹（使用者：有水下來加上太陽，產生彩虹更好）。照物理來：主虹在「背對太陽的方向」外 42°——
    // 把落水點周圍的水霧當成一顆半徑 10 m 的球，球面上每一點看「鏡頭→這一點」跟反日方向的夾角，40～43° 那一圈上色（裡紫外紅）。
    // 所以要太陽在背後、站對位置才看得到，太陽移動彩虹也跟著移動；陰天、晚上沒有
    { const rbM = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, fog: false,
        uniforms: { uSun: sunDirU, uDay: dayLight, uCloud: weatherU.cloud, uC: { value: V(F.x, poolY + 6.5, fz - 3.5) } },
        vertexShader: `varying vec3 vW; void main() { vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
        fragmentShader: `uniform vec3 uSun; uniform float uDay; uniform float uCloud; uniform vec3 uC; varying vec3 vW;
          vec3 hue(float h) { vec3 k = abs(fract(vec3(h) + vec3(0.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - 3.0) - 1.0; return clamp(k, 0.0, 1.0); }
          void main() {
            vec3 vd = normalize(vW - cameraPosition);
            float ang = degrees(acos(clamp(dot(vd, -normalize(uSun)), -1.0, 1.0)));
            float t = (ang - 39.8) / 3.4;                              // 0 紫（內）→ 1 紅（外）
            float band = smoothstep(0.0, 0.18, t) * smoothstep(1.0, 0.82, t);
            vec3 col = hue(mix(0.78, 0.0, t));
            // 水霧濃的地方才有：落水點上方 0～15 m、左右 9 m 內
            vec3 d = vW - uC;
            float mist = smoothstep(10.5, 4.0, abs(d.x)) * smoothstep(-7.5, -5.0, d.y) * smoothstep(10.5, 3.0, d.y);
            float sunK = smoothstep(0.04, 0.16, uSun.y) * uDay * (1.0 - smoothstep(0.25, 0.6, uCloud));
            float a = band * mist * sunK * 0.34;
            gl_FragColor = vec4(col * a, a);
          }` })
      // 球的背面會被岩壁擋住 → 改成落水點前面 1 m 的一片直立的面（寬 22、高 18），夾角照樣逐點算
      const rb = new THREE.Mesh(new THREE.PlaneGeometry(22, 18, 1, 1), rbM); rb.position.copy(rbM.uniforms.uC.value).add(V(0, 1.5, -1.0)); rb.renderOrder = 6; rb.frustumCulled = false; rb.name = 'rainbow'; g.add(rb) }
    // 水潭：橢圓、深綠帶一點藍
    const poolM = new THREE.MeshStandardMaterial({ color: 0x1f7f63, roughness: 0.05, metalness: 0.12, transparent: true, opacity: 0.88 })   // 2026-11-12 翡翠綠（參考照的水色）
    // 2026-11-11 使用者：下雨時這座湖也要有漣漪（濕地那支水面 shader 已經有，這裡是一片平的標準材質）→ 同一套雨滴圈：改法線＋圈的亮邊
    poolM.onBeforeCompile = (sh) => {
      sh.uniforms.uRT = uT; sh.uniforms.uRain = weatherU.rain
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vRW;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvRW = (modelMatrix * vec4(position, 1.0)).xyz;')
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
        varying vec3 vRW; uniform float uRT; uniform float uRain;
        float rhash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        vec3 rainRings(vec2 p, float cell, float seed) {
          vec3 acc = vec3(0.0);
          vec2 g = floor(p / cell);
          for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
            vec2 id = g + vec2(float(i), float(j));
            float h1 = rhash(id + seed), h2 = rhash(id * 1.7 + seed + 13.1), h3 = rhash(id * 2.3 + seed + 41.7);
            float ph = fract(uRT * (0.75 + 0.5 * h3) + h1 * 7.0);
            vec2 c = (id + 0.2 + 0.6 * vec2(h1, h2)) * cell, d = p - c;
            float dist = length(d), r = ph * cell * 0.85, w = cell * 0.07;
            float x = (dist - r) / w, env = exp(-x * x) * (1.0 - ph) * (1.0 - ph) * step(h3, uRain * 1.2);
            acc.xy += (d / max(dist, 1e-4)) * sin(x * 2.4) * env;
            acc.z += env * max(0.0, cos(x * 1.6));
          }
          return acc;
        }`)
        .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        float rainK = 0.0;
        if (uRain > 0.01) {
          float rf = 1.0 / (1.0 + 0.00035 * dot(cameraPosition - vRW, cameraPosition - vRW));
          vec3 rr = rainRings(vRW.xz, 0.55, 3.0) + rainRings(vRW.xz + 5.3, 0.9, 71.0) * 0.8;
          float rk = rf * min(1.0, uRain * 1.6);
          normal = normalize(normal + (viewMatrix * vec4(rr.x, 0.0, rr.y, 0.0)).xyz * 0.3 * rk);
          rainK = rr.z * rk;
        }`)
        .replace('#include <opaque_fragment>', 'outgoingLight += vec3(0.75, 0.8, 0.85) * rainK * 0.07;\n#include <opaque_fragment>')
    }
    // 湖：剛好到湖岸那一圈（湖裡往下挖、岸往上一階，邊緣接在那一階上；以前放大 12%，出水口那邊水面浮在河道上面）
    const LK = YOSE.lake, pool = new THREE.Mesh(new THREE.CircleGeometry(1, 72).rotateX(-Math.PI / 2), poolM); pool.scale.set(LK.rx * 1.015, 1, LK.rz * 1.015); pool.position.set(LK.x, poolY, LK.z); pool.receiveShadow = true; g.add(pool)
    const foamT = (() => { const c = document.createElement('canvas'); c.width = c.height = 256; const x = c.getContext('2d'), r = mulberry32(9); for (let i = 0; i < 1600; i++) { const a = r() * TAU, d = Math.pow(r(), 0.7) * 120; x.fillStyle = `rgba(255,255,255,${(0.1 + r() * 0.45) * (1 - d / 130)})`; x.beginPath(); x.arc(128 + Math.cos(a) * d, 128 + Math.sin(a) * d, 1 + r() * 5, 0, TAU); x.fill() } const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t })()
    for (const [k, sc] of [[0, 6.5], [1, 4.2]]) {
      const fm = new THREE.Mesh(new THREE.CircleGeometry(1, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: foamT, transparent: true, depthWrite: false, opacity: 0.8 }))
      fm.scale.set(sc, 1, sc * 0.6); fm.position.set(F.x, poolY + 0.02 + k * 0.01, fz - 3.2); fm.userData = { sc, k }; fm.renderOrder = 2; g.add(fm); foams.push(fm)
    }
    // 水霧：大片、慢慢飄、有的往步道那邊飄過來
    const mistT = mistTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'); const gr = x.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = gr; x.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c) })()
    for (let k = 0; k < 26; k++) { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: mistT, transparent: true, depthWrite: false, opacity: 0.4 })); const p0 = V(F.x + (rnd() - 0.5) * 11, poolY + 0.6 + rnd() * 9, fz - 2.8 - rnd() * 4); sp.position.copy(p0); sp.scale.setScalar(4 + rnd() * 6); sp.userData = { ph: rnd() * TAU, p0 }; sp.renderOrder = 6; g.add(sp); mist.push(sp) }
    // 水花：落點往上往外噴的小水滴（加色、會飄散）
    const NS = 500, sp = new Float32Array(NS * 3), sv = []
    const reset = (i, first) => { const x = F.x + (rnd() - 0.5) * 9, z = fz - 2.6 - rnd() * 1.8; sp[i * 3] = x; sp[i * 3 + 1] = poolY + (first ? rnd() * 5 : 0.1); sp[i * 3 + 2] = z; sv[i] = V((rnd() - 0.5) * 1.6, 2 + rnd() * 4.5, -(0.4 + rnd() * 2.2)) }
    for (let i = 0; i < NS; i++) reset(i, true)
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(sp, 3))
    const sprayM = new THREE.PointsMaterial({ color: 0xffffff, size: 0.12, transparent: true, opacity: 0.55, depthWrite: false, map: mistT, blending: THREE.AdditiveBlending })
    const spray = new THREE.Points(sg, sprayM); spray.frustumCulled = false; spray.renderOrder = 7; g.add(spray)
    sprayU = (dt) => { for (let i = 0; i < NS; i++) { sv[i].y -= 3.2 * dt; sv[i].multiplyScalar(1 - 0.9 * dt); sp[i * 3] += sv[i].x * dt; sp[i * 3 + 1] += sv[i].y * dt; sp[i * 3 + 2] += sv[i].z * dt; if (sp[i * 3 + 1] < poolY || rnd() < 0.004) reset(i, false) } sg.attributes.position.needsUpdate = true }
  }

  // ---------- 秘境瀑布步道（2026-11-12；路線 layout.js YOSE.stairs、設計 docs/GORGE_ROUTE.txt）----------
  // 以前這裡是岩壁東側 6 層平台的之字形石階，使用者要求拆掉，改成從瀑布後面的岩窟進去、在岩壁和岩體裡一路往上的一條路：
  // 岩壁上的迴廊是岩壁網格自己切出來的橫槽（上面 slotsAt）；隧道是岩體裡另外的管狀網格（下面 1）；整條路鋪石階踏板（2）；
  // 露天的地方外側加鐵欄杆（3）；隧道裡每 8 m 一盞壁燈，燈光直接算進隧道壁和踏板的顏色裡（不用真的光源）
  {
    const st = TR, topYm = YOSE.topY(214), NP = st.pts.length
    const stepM = new THREE.MeshStandardMaterial({ map: cliffM.map, color: 0xc4c0b8, roughness: 0.88, vertexColors: true })   /* 頂點色＝Blender 烘的環境遮蔽（岩石套件）；方塊踏板給全白 */
    stepM.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vTpW; varying vec3 vTpN;')
        .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
          vec4 tpP = vec4(transformed, 1.0); vec3 tpN = objectNormal;
          #ifdef USE_INSTANCING
            tpP = instanceMatrix * tpP; tpN = mat3(instanceMatrix) * tpN;
          #endif
          vTpW = (modelMatrix * tpP).xyz; vTpN = normalize(mat3(modelMatrix) * tpN);`)
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vTpW; varying vec3 vTpN;')
        .replace('#include <map_fragment>', `
          vec3 tpB = pow(abs(normalize(vTpN)), vec3(5.0)); tpB /= (tpB.x + tpB.y + tpB.z + 1e-4);
          vec4 tpC = texture2D(map, vTpW.zy * 0.45) * tpB.x + texture2D(map, vTpW.xz * 0.45) * tpB.y + texture2D(map, vTpW.xy * 0.45) * tpB.z;
          diffuseColor *= mix(vec4(0.8), tpC, 0.7);
          // 越靠瀑布越濕（ChatGPT：濕的花崗岩暗 10～25%、粗糙度 0.35～0.55）
          float wet = smoothstep(30.0, 8.0, distance(vTpW.xz, vec2(${F.x.toFixed(1)}, ${F.z.toFixed(1)})));
          diffuseColor.rgb *= 1.0 - 0.24 * wet;`)
        .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor *= 1.0 - 0.5 * wet;')
    }
    { const ob = stepM.onBeforeCompile
      // 踏板：邊角、縫裡長青苔（踏面中間被踩的地方少），越靠瀑布越多
      stepM.onBeforeCompile = (sh) => { ob(sh); sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>' + GLSL_VNOISE + `
        vec3 stPerturb(vec3 surf_pos, vec3 surf_norm, vec2 dHdxy, float faceDirection) {
          vec3 vSigmaX = normalize(dFdx(surf_pos)), vSigmaY = normalize(dFdy(surf_pos)), vN = surf_norm;
          vec3 R1 = cross(vSigmaY, vN), R2 = cross(vN, vSigmaX); float fDet = dot(vSigmaX, R1) * faceDirection;
          vec3 vGrad = sign(fDet) * (dHdxy.x * R1 + dHdxy.y * R2); return normalize(abs(fDet) * surf_norm - vGrad);
        }`).replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        { float stH = dot(tpC.rgb, vec3(0.33)) * 0.5 + vfbm(vTpW.xz * 3.0 + vTpW.y * 2.3) * 0.9 + vfbm(vTpW.xz * 11.0 + vTpW.y * 9.0) * 0.25;
          vec2 dH = clamp(vec2(dFdx(stH), dFdy(stH)) * 1.5, -0.7, 0.7) * smoothstep(40.0, 5.0, length(vViewPosition)); normal = stPerturb(-vViewPosition, normal, dH, faceDirection); }`).replace('#include <color_fragment>', `#include <color_fragment>
        { float nn = vfbm(vTpW.xz * 1.6 + vTpW.y * 0.7), nf = vfbm(vTpW.xz * 6.0 + 2.0);
          float upF = normalize(vTpN).y;
          float nz = vfbm(vTpW.xz * 14.0 + vTpW.y * 3.0);
          float cov = smoothstep(0.64 - 0.1 * wet, 0.8 - 0.1 * wet, nn + 0.18 * nf + 0.22 * (nz - 0.5)) * mix(1.0, 0.6, smoothstep(0.5, 0.9, upF));
          cov = max(cov, (1.0 - abs(upF)) * smoothstep(0.55, 0.7, nn) * 0.8);
          vec3 mossC = mix(vec3(0.05, 0.1, 0.022), vec3(0.16, 0.23, 0.05), nf);
          diffuseColor.rgb = mix(diffuseColor.rgb, mossC * (0.7 + 0.6 * nz), cov * 0.7);
          /* 側面一條條細的層理（頁岩一片片的斷面） */
          float lam = vfbm(vec2(vTpW.y * 34.0, (vTpW.x + vTpW.z) * 0.7)), lam2 = vfbm(vec2(vTpW.y * 9.0 + 3.0, (vTpW.x - vTpW.z) * 0.4));
          diffuseColor.rgb *= 1.0 - (1.0 - smoothstep(0.3, 0.7, abs(upF))) * (0.34 * smoothstep(0.5, 0.72, lam) + 0.22 * smoothstep(0.45, 0.7, lam2)) * (1.0 - cov); }`) }
    }
    stepM.customProgramCacheKey = () => 'stepTriplanar2'
    const C3 = [], TAN = [], SIDE = [], UP = V(0, 1, 0)
    for (let i = 0; i < NP; i++) C3.push(V(st.pts[i][0], st.yy[i], st.pts[i][1]))
    for (let i = 0; i < NP; i++) { const t = C3[Math.min(NP - 1, i + 1)].clone().sub(C3[Math.max(0, i - 1)]).normalize(); TAN.push(t); SIDE.push(V().crossVectors(t, UP).normalize()) }
    const isTun = (i) => st.kind[i] === 'tun'
    // 螺旋那一段不是管子，是一個中空的圓形岩室（下面 4）；岩室的牆半徑 RW
    const SP = st.spiral, RW = 6.1, SPB = SP.y0 - 0.1, SPT = SP.y1 + 5.6
    const inChamber = (i) => st.tag[i] !== 'SP' && Math.hypot(st.pts[i][0] - SP.x, st.pts[i][1] - SP.z) < RW - 0.1 && st.yy[i] > SP.y0 - 2 && st.yy[i] < SP.y1 + 2
    const tubePt = (i) => isTun(i) && st.tag[i] !== 'SP' && !inChamber(i)
    const tagS0 = {}
    for (let i = 0; i < NP; i++) if (st.tag[i] && tagS0[st.tag[i]] == null) tagS0[st.tag[i]] = st.S[i]
    const U = (i) => st.S[i] - (tagS0[st.tag[i]] ?? 0)
    // 每段隧道的斷面怎麼變（ChatGPT 內部規格 docs/GORGE_INTERIOR.txt）：[沿路幾公尺, 寬的倍數, 高的倍數]；基本斷面寬 2.7、高 3.1
    const KEYS = {
      T1: [[0, 1, 1], [7, 0.82, 0.86], [14, 1.2, 1.3], [20, 1.15, 1.25], [25, 1.0, 1.05], [40, 1, 1]],
      T3: [[0, 1, 1], [7, 1.05, 1.1], [12, 1.5, 1.3]],
      T4: [[0, 0.8, 1.22], [8, 1.25, 1.65], [13, 1.25, 1.7], [22, 0.9, 1.0], [40, 0.88, 0.95]],
      T5: [[0, 1, 1.05], [10, 1.1, 1.2], [20, 1.15, 1.2], [26, 1.9, 1.6], [43, 1.9, 1.6], [49, 0.95, 1.0], [80, 0.9, 0.95]],
      T6: [[0, 0.88, 0.92], [10, 1.1, 1.1], [19, 1.5, 1.45], [30, 1.5, 1.45]],
    }
    const shape = (i) => {
      const K = KEYS[st.tag[i]]; if (!K) return [1, 1]
      const u = U(i); let a = K[0], b = K[K.length - 1]
      for (let k = 0; k + 1 < K.length; k++) if (u >= K[k][0] && u <= K[k + 1][0]) { a = K[k]; b = K[k + 1]; break }
      const t = b[0] > a[0] ? ss(a[0], b[0], u) : 0
      return [lerpN(a[1], b[1], t), lerpN(a[2], b[2], t)]
    }
    // 牆在哪：斷面放寬的部分大多往「岩體裡面那一側」長（IN：朝北；水溝、滲水牆也在這一側）。
    // 往岩壁面那一側放寬的話，隧道會從岩壁穿出去（第一版 T1 的岩室就破在岩壁外面）
    const IN = (i) => (SIDE[i].z >= 0 ? 1 : -1)
    const wallLat = (i, sd) => { const [w] = shape(i); return sd === IN(i) ? sd * (1.36 * w + (w - 1) * 0.9) : sd * (1.36 * w - (w - 1) * 0.3) }
    const idxAt = (tag, u) => { let best = -1, bd = 1e9; for (let i = 0; i < NP; i++) if (st.tag[i] === tag) { const d = Math.abs(U(i) - u); if (d < bd) { bd = d; best = i } } return best }
    // 光：壁燈（暖）沿隧道每 8.5 m 一盞；天光縫（冷白）在天花板。都直接算進牆和踏板的頂點色
    const LIGHTS = [], lamps = [], lampInfo = [], skys = []
    { let acc = 4
      for (let i = 1; i < NP; i++) {
        if (!isTun(i)) { acc = 4; continue }
        acc += st.S[i] - st.S[i - 1]; if (acc < 8.5) continue
        acc = 0
        let p
        if (st.tag[i] === 'SP') { const dx = C3[i].x - SP.x, dz = C3[i].z - SP.z, l = Math.hypot(dx, dz); p = V(SP.x + dx / l * (RW - 0.25), C3[i].y + 2.2, SP.z + dz / l * (RW - 0.25)) }
        else if (inChamber(i)) continue
        else { const sd = lamps.length % 2 ? 1 : -1; p = C3[i].clone().addScaledVector(SIDE[i], wallLat(i, sd) - sd * 0.24).add(V(0, 2.2, 0)) }
        lamps.push(p); lampInfo.push({ i, sd: st.tag[i] === 'SP' ? 0 : (lamps.length - 1) % 2 ? 1 : -1 }); LIGHTS.push({ p, c: [4.2, 3.0, 1.55], r2: 9, feet: C3[i].y })
      }
      for (const [tag, u] of [['T1', 17], ['T4', 10.5], ['T5', 18], ['T5', 34], ['T5', 51], ['T6', 13], ['T6', 16.5]]) {
        const i = idxAt(tag, u); if (i < 0) continue
        const [, hk] = shape(i), p = C3[i].clone().add(V(0, 3.1 * hk - 0.06, 0)).addScaledVector(SIDE[i], 0.5 * IN(i))
        skys.push({ p, i }); LIGHTS.push({ p, c: [2.4, 3.6, 4.2], r2: 16, feet: C3[i].y })
      }
    }
    const lightAt = (p) => { let r = 0, g2 = 0, b = 0; for (const l of LIGHTS) { if (Math.abs(l.feet + 1.4 - p.y) > 3.6) continue; const d2 = (l.p.x - p.x) ** 2 + (l.p.z - p.z) ** 2 + (l.p.y - p.y) ** 2 * 0.5; if (d2 > l.r2 * 6) continue; const k = Math.exp(-d2 / l.r2); r += l.c[0] * k; g2 += l.c[1] * k; b += l.c[2] * k } return [Math.min(7, r), Math.min(6, g2), Math.min(5, b)] }
    const litCol = (p, base, out) => { const L = lightAt(p); out.push(base * (1 + L[0]), base * 0.94 * (1 + L[1]), base * 0.84 * (1 + L[2])) }
    // 1) 隧道：馬蹄形斷面沿中線掃出來（寬高照 KEYS 變、天花板左右歪一點、表面加凹凸）；跟岩壁同一個材質
    const RUNS = []
    { let run = []; for (let i = 0; i < NP; i++) { if (tubePt(i)) run.push(i); else if (run.length) { RUNS.push(run); run = [] } } if (run.length) RUNS.push(run) }
    { const RING0 = [[-1, -0.12], [-1.09, 0.9], [-1, 1.9], [-0.65, 2.7], [0, 3.1], [0.65, 2.7], [1, 1.9], [1.09, 0.9], [1, -0.12], [0.4, -0.16], [-0.4, -0.16]], RING = []   /* 最後兩點是地板：斷面是封閉的一圈（放寬的岩室踏板蓋不滿，沒地板會看穿到外面） */
      RING0.forEach((a, k) => { const b = RING0[(k + 1) % RING0.length]; RING.push(a, [(a[0] + b[0]) / 2 * (a[1] > 1.5 && b[1] > 1.5 ? 1.04 : 1), (a[1] + b[1]) / 2]) })   /* 2026-11-12 每兩點中間再插一點、每兩圈中間再插一圈：以前三角形又長又窄，燈光（頂點色）沿隧道拉成一條條放射狀的紋 */
      const NR = RING.length
      const pos = [], col = [], uv = [], idx = []
      for (const run of RUNS) {
        if (run.length < 2) continue
        const base = pos.length / 3
        const rings = [{ i: run[0], off: -0.3 }, ...run.map((i) => ({ i, off: 0 })), { i: run[run.length - 1], off: 0.3 }]
        const RP = rings.map(({ i, off }) => {
          const [wk, hk] = shape(i), asym = 0.25 * Math.sin(U(i) * 0.21 + st.tag[i].charCodeAt(1) * 1.7)
          return RING.map(([rx, ry], k) => {
            const lat0 = wallLat(i, rx > 0 ? 1 : -1) * Math.abs(rx) * 0.956
            const n = 0.24 * (fbm2(st.S[i] * 0.45 + k * 1.15, k * 0.85 + 5, 3) - 0.5) * (ry < 0 ? 0.15 : 1)
            const ly = ry * (ry > 0 ? hk : 1), lx = lat0 * (1 + n * 0.4) + asym * Math.pow(Math.max(0, ry) / 3.1, 2)
            return C3[i].clone().addScaledVector(TAN[i], off).addScaledVector(SIDE[i], lx).add(V(0, ly + n * (ry > 1 ? 1 : 0), 0))
          })
        })
        let nr = 0
        const emit = (P, sv) => {
          for (let k = 0; k < NR; k++) { const p = P[k]; pos.push(p.x, p.y, p.z); uv.push(sv * 0.3, k / NR); litCol(p, 0.2 + 0.08 * fbm2(p.x * 0.7, p.y * 0.9 + p.z * 0.7, 2), col) }
          if (nr) for (let k = 0; k < NR; k++) { const k2 = (k + 1) % NR, a = base + (nr - 1) * NR + k, a2 = base + (nr - 1) * NR + k2; idx.push(a, a + NR, a2, a2, a + NR, a2 + NR) }
          nr++
        }
        RP.forEach((P, ri) => {
          if (ri) emit(P.map((p, k) => p.clone().add(RP[ri - 1][k]).multiplyScalar(0.5)), (st.S[rings[ri].i] + st.S[rings[ri - 1].i]) / 2)
          emit(P, st.S[rings[ri].i])
        })
      }
      const tg = new THREE.BufferGeometry()
      tg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); tg.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); tg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
      tg.setIndex(idx); tg.computeVertexNormals()
      const tube = new THREE.Mesh(tg, cliffM); tube.receiveShadow = true; tube.name = 'gorgeTunnel'; g.add(tube)
    }
    // 壁燈本體：小小的暖色燈（發光）＋鐵托架
    if (lamps.length) {
      const li = new THREE.InstancedMesh(new THREE.SphereGeometry(0.06, 10, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 0.78, 0.45) }), lamps.length)
      const bi = new THREE.InstancedMesh(new THREE.BoxGeometry(0.05, 0.22, 0.05), new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.6, metalness: 0.6 }), lamps.length)
      lamps.forEach((l, k) => { li.setMatrixAt(k, m4.makeTranslation(l.x, l.y, l.z)); bi.setMatrixAt(k, m4.makeTranslation(l.x, l.y + 0.18, l.z)) })
      li.name = 'gorgeLamps'; bi.name = 'gorgeLampArms'; g.add(li, bi)
    }
    const STEPS = []
    // 2) 石階踏板：整條路每 0.42 m 一塊；隧道裡窄一點、靠乾的那一側，濕的那一側留一條水溝
    { const N = Math.floor(st.L / 0.42), bg = new THREE.BoxGeometry(2.5, 0.6, 0.47), tm = new THREE.InstancedMesh(bg, stepM, N), q = new THREE.Quaternion(), c = new THREE.Color()
      bg.setAttribute('color', new THREE.BufferAttribute(new Float32Array(bg.attributes.position.count * 3).fill(1), 3))
      let ii = 1
      for (let n = 0; n < N; n++) {
        const s0 = (n + 0.5) * 0.42; while (ii < NP - 1 && st.S[ii] < s0) ii++
        const t = (s0 - st.S[ii - 1]) / Math.max(1e-6, st.S[ii] - st.S[ii - 1]), p = C3[ii - 1].clone().lerp(C3[ii], t), tn = TAN[ii]
        const slope = (st.yy[ii] - st.yy[ii - 1]) / Math.max(1e-6, st.S[ii] - st.S[ii - 1])
        const yTop = slope > 0.05 ? Math.floor(p.y / 0.16) * 0.16 + 0.1 : p.y + 0.02
        q.setFromAxisAngle(UP, Math.atan2(tn.x, tn.z))
        const tun = st.kind[ii] === 'tun', sp = st.tag[ii] === 'SP', w = sp ? 0.98 : tun ? 0.84 : 1.0
        if (tun && !sp) p.addScaledVector(SIDE[ii], -0.2 * IN(ii))
        tm.setMatrixAt(n, m4.compose(V(p.x, yTop - 0.3, p.z), q, V(w, 1, 1)))
        if (!tun) tm.setColorAt(n, c.setRGB(1.0, 0.9, 0.74))
        else { const L = lightAt(V(p.x, yTop, p.z)), b = 0.3; tm.setColorAt(n, c.setRGB(b * (1 + L[0]), b * 0.86 * (1 + L[1]), b * 0.68 * (1 + L[2]))) }
        STEPS.push({ m: m4.clone(), c: c.clone() })
      }
      tm.castShadow = true; tm.receiveShadow = true; tm.computeBoundingSphere(); tm.name = 'gorgeSteps'; g.add(tm)
    }
    // 3) 外側鐵欄杆：岩壁迴廊、凹室、岩棚（靠湖那一側）
    { const ironR = new THREE.MeshStandardMaterial({ color: 0x33363a, roughness: 0.5, metalness: 0.6 }), pp = [], segs = []
      let acc = 9, prev = null
      for (let i = 1; i < NP; i++) {
        const k = st.kind[i], open = k === 'gal' || k === 'alc' || k === 'shelf' || (k === 'open' && st.pts[i][0] > 207)
        if (!open) { prev = null; acc = 9; continue }
        acc += st.S[i] - st.S[i - 1]; if (acc < 1.35) continue
        acc = 0
        const sd = SIDE[i].z < 0 ? 1 : -1
        const p = C3[i].clone().addScaledVector(SIDE[i], sd * 1.15)
        pp.push(p); if (prev && prev.distanceTo(p) < 2.6) segs.push([prev, p]); prev = p
      }
      if (pp.length) {
        const pm2 = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.03, 0.03, 1.1, 6).translate(0, 0.55, 0), ironR, pp.length)
        pp.forEach((p, k) => pm2.setMatrixAt(k, m4.makeTranslation(p.x, p.y, p.z))); pm2.castShadow = true; g.add(pm2)
        const rg = new THREE.CylinderGeometry(0.022, 0.022, 1, 5).rotateZ(Math.PI / 2), rm = new THREE.InstancedMesh(rg, ironR, segs.length * 2), q = new THREE.Quaternion()
        segs.forEach(([a, b], k) => { const d = b.clone().sub(a), L = d.length(); q.setFromUnitVectors(V(1, 0, 0), d.clone().normalize()); for (const [j, hh] of [[0, 1.05], [1, 0.55]]) rm.setMatrixAt(k * 2 + j, m4.compose(a.clone().add(b).multiplyScalar(0.5).add(V(0, hh, 0)), q, V(L, 1, 1))) })
        g.add(rm)
      }
    }
    // ---- 水 ----
    // 流水的材質（水溝、水盆）：深色的水上有往下游漂的亮紋
    const runM = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, uniforms: { uT },
      vertexShader: `attribute vec3 color; varying vec2 vUv; varying vec3 vC; void main() { vUv = uv; vC = color; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `varying vec2 vUv; varying vec3 vC; uniform float uT;
        float h(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
        float n(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
        void main() { float a = n(vec2(vUv.x * 5.0, vUv.y * 2.4 + uT * 1.1)) * 0.6 + n(vec2(vUv.x * 11.0 + 3.0, vUv.y * 5.0 + uT * 1.9)) * 0.4;
          float hi = smoothstep(0.55, 0.85, a);
          vec3 c = mix(vec3(0.05, 0.1, 0.095), vec3(0.6, 0.72, 0.74), hi) * (0.35 + vC);
          gl_FragColor = vec4(c, 0.8); }` })
    // 5) 石階旁的水溝：沿每段隧道濕的那一側一條 0.34 m 寬的水（往下游流）
    { const pos = [], col = [], uv = [], idx = []
      for (const run of RUNS) {
        const base = pos.length / 3
        run.forEach((i, ri) => {
          for (const lat of [0.86, 1.2]) { const p = C3[i].clone().addScaledVector(SIDE[i], lat * IN(i)).add(V(0, 0.03, 0)); pos.push(p.x, p.y, p.z); uv.push(lat > 1 ? 1 : 0, st.S[i]); const L = lightAt(p); col.push(0.25 * L[0], 0.25 * L[1], 0.25 * L[2]) }
          if (ri && IN(i) === IN(run[ri - 1])) { const a = base + (ri - 1) * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3) }
        })
      }
      const rg2 = new THREE.BufferGeometry(); rg2.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); rg2.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); rg2.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); rg2.setIndex(idx)
      const rn = new THREE.Mesh(rg2, runM); rn.renderOrder = 2; rn.name = 'gorgeRunnel'; g.add(rn)
    }
    // 6) 滲水的岩壁：濕的那一側牆上一片片往下流的薄水（跟瀑布同一種水簾材質、慢）；7) 滴水：從天花板、滲水帶一顆顆落下來
    const SEEP = [['T1', 9.5, 0.6, 2.2], ['T1', 11.2, 0.4, 1.9], ['T1', 16.5, 0.7, 2.5], ['T4', 10, 0.35, 3.6], ['T4', 11.6, 0.25, 3.2], ['T6', 6, 0.3, 2.4], ['T6', 10.5, 0.25, 2.6]]
    for (let u = 23.5, k = 0; u < 38; u += 1.5, k++) SEEP.push(['T5', u, 0.35 + 0.5 * hsh(k * 3.1), 2.8 + 1.2 * hsh(k * 7.7)])
    const dripP = [], dripA = []
    const addDrips = (c, rx, rz, yTop, H, n) => { for (let k = 0; k < n; k++) { dripP.push(c.x + (rnd() - 0.5) * rx, yTop - rnd() * 0.2, c.z + (rnd() - 0.5) * rz); dripA.push(H * (0.7 + 0.3 * rnd()), rnd(), 0.45 + 0.5 * rnd()) } }
    { const pos = [], uv = [], idx = []
      for (const [tag, u, w, hh] of SEEP) {
        const i = idxAt(tag, u); if (i < 0) continue
        const lat = wallLat(i, IN(i)) - IN(i) * 0.06, c = C3[i].clone().addScaledVector(SIDE[i], lat), b = pos.length / 3
        const y0 = c.y + 0.1, y1 = y0 + hh
        for (const [sx, vy] of [[-1, 0], [1, 0], [-1, 1], [1, 1]]) { const p = c.clone().addScaledVector(TAN[i], sx * w * 0.5); pos.push(p.x, vy ? y0 : y1, p.z); uv.push(sx > 0 ? 1 : 0, vy) }
        idx.push(b, b + 2, b + 1, b + 1, b + 2, b + 3)
        addDrips(c.clone().addScaledVector(SIDE[i], -0.25 * IN(i)), 0.5, 0.5, y1, hh, 6)
      }
      const sg2 = new THREE.BufferGeometry(); sg2.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); sg2.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); sg2.setIndex(idx)
      const sm2 = new THREE.Mesh(sg2, fallMat({ spd: 0.2, a: 0.4, dark: 0.45 })); sm2.renderOrder = 3; sm2.name = 'gorgeSeep'; g.add(sm2)
    }
    // 滴水簾：T1 第 9～12 m 整排從天花板滴；T4 小溪上面；T5 岩室
    { const a = idxAt('T1', 10.5); if (a >= 0) addDrips(C3[a].clone(), 2.6, 2.6, C3[a].y + 2.6, 2.6, 50)
      const b = idxAt('T4', 10.8); if (b >= 0) addDrips(C3[b].clone().addScaledVector(SIDE[b], 0.6 * IN(b)), 1.6, 1.6, C3[b].y + 4.6, 4.6, 40)
      for (const u of [27, 31, 35, 40]) { const c = idxAt('T5', u); if (c >= 0) addDrips(C3[c].clone().addScaledVector(SIDE[c], 1.6 * IN(c)), 3, 3, C3[c].y + 4.6, 4.6, 26) } }
    // 8) 天光縫：天花板一條亮縫＋往下一道淡淡的光柱
    { const skyM = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.8, 0.95, 1.0).multiplyScalar(1.6), side: THREE.DoubleSide })
      const shaftM = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.7, 0.9, 1.0), transparent: true, opacity: 0.07, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending })
      for (const { p, i } of skys) {
        const yaw = Math.atan2(TAN[i].x, TAN[i].z), [, hk] = shape(i), hh = 3.1 * hk
        const crack = new THREE.Mesh(new THREE.PlaneGeometry(0.32, 2.2).rotateX(Math.PI / 2), skyM); crack.position.copy(p); crack.rotation.y = yaw; g.add(crack)
        for (const ry of [0, Math.PI / 2]) { const sh = new THREE.Mesh(new THREE.PlaneGeometry(ry ? 0.5 : 2.0, hh), shaftM); sh.position.set(p.x, p.y - hh / 2, p.z); sh.rotation.y = yaw + ry + Math.PI / 2; sh.renderOrder = 4; g.add(sh) }
        addDrips(p.clone(), 0.4, 1.8, p.y, hh, 8)
      }
    }
    // 4) 螺旋岩室：中空的圓形岩室（半徑 RW、高約 15 m），石階貼著外牆繞兩圈；中間是空的，頂上一個天窗，一道細瀑布從天窗落進底下的水盆
    { const pos = [], col = [], uv = [], idx = []
      const skyK = (p) => { const r = Math.hypot(p.x - SP.x, p.z - SP.z); return 1.9 * Math.exp(-r * r / 34) * (0.3 + 0.7 * Math.min(1, Math.max(0, (p.y - SPB) / (SPT - SPB)))) }
      const vtx = (p, base, u2, v2) => { const L = lightAt(p), k = skyK(p); pos.push(p.x, p.y, p.z); uv.push(u2, v2); col.push(base * (1 + L[0] + 0.55 * k), base * 0.94 * (1 + L[1] + 0.8 * k), base * 0.84 * (1 + L[2] + 0.95 * k)); return pos.length / 3 - 1 }
      const fAt = (x, z) => Math.atan2(-(x - SP.x), -(z - SP.z))   // 跟 layout 的圓弧同一個角度（0＝南、往西為正）
      // 外牆：兩個開口（T1 從東南進來、最下面；T3 往西南出去、最上面）不畫
      const NA = 56, NY = 34, fOpen = Math.atan2(Math.sqrt(RW * RW - SP.r * SP.r), SP.r), hw = 0.38
      const open = (f, y) => (Math.abs(f + fOpen) < hw && y > SP.y0 - 0.3 && y < SP.y0 + 3.2) || (Math.abs(f - fOpen) < hw && y > SP.y1 - 0.3 && y < SP.y1 + 3.3)
      const wb = pos.length / 3
      for (let j = 0; j <= NY; j++) for (let a = 0; a <= NA; a++) {
        const f = -Math.PI + a / NA * Math.PI * 2, y = SPB - 0.2 + (SPT - SPB + 0.2) * j / NY
        const r = RW + 0.32 * (fbm2(f * 2.2 + 3, y * 0.5, 3) - 0.5) + 0.25 * (fbm2(f * 7 + 1, y * 0.25 + 9, 2) - 0.5)
        vtx(V(SP.x - r * Math.sin(f), y, SP.z - r * Math.cos(f)), 0.2 + 0.08 * fbm2(f * 3, y * 0.9, 2), f * 2, y * 0.3)
      }
      for (let j = 0; j < NY; j++) for (let a = 0; a < NA; a++) {
        const f = -Math.PI + (a + 0.5) / NA * Math.PI * 2, y = SPB - 0.2 + (SPT - SPB + 0.2) * (j + 0.5) / NY
        if (open(f, y)) continue
        const p0 = wb + j * (NA + 1) + a, p1 = p0 + NA + 1; idx.push(p0, p0 + 1, p1, p0 + 1, p1 + 1, p1)
      }
      // 地板、屋頂（圓盤）
      for (const [y, flip, base] of [[SPB, 0, 0.24], [SPT, 1, 0.16]]) {
        const c0 = vtx(V(SP.x, y, SP.z), base, 0, 0), r0 = pos.length / 3
        for (let a = 0; a <= NA; a++) { const f = a / NA * Math.PI * 2; vtx(V(SP.x - (RW + 0.3) * Math.sin(f), y, SP.z - (RW + 0.3) * Math.cos(f)), base, Math.sin(f), Math.cos(f)) }
        for (let a = 0; a < NA; a++) flip ? idx.push(c0, r0 + a + 1, r0 + a) : idx.push(c0, r0 + a, r0 + a + 1)
      }
      // 螺旋石階底下的岩板（內緣半徑 3.15、外緣貼牆）＋內緣的矮石牆（0.95 m）
      const sp = []; for (let i = 0; i < NP; i++) if (st.tag[i] === 'SP' || (i + 1 < NP && st.tag[i + 1] === 'SP' && st.tag[i] !== 'SP' && isTun(i))) sp.push(i)
      const sb = pos.length / 3
      sp.forEach((i, ri) => {
        const dx = C3[i].x - SP.x, dz = C3[i].z - SP.z, l = Math.hypot(dx, dz), ux = dx / l, uz = dz / l, y = C3[i].y
        const P = (r, yy2) => V(SP.x + ux * r, yy2, SP.z + uz * r)
        for (const [r, yy2, b] of [[3.15, y - 0.06, 0.26], [RW + 0.2, y - 0.06, 0.26], [RW + 0.2, y - 0.55, 0.18], [3.15, y - 0.55, 0.18], [3.15, y + 0.95, 0.3], [2.88, y + 0.95, 0.3], [2.88, y - 0.55, 0.22]]) vtx(P(r, yy2), b, st.S[i] * 0.3, r)
        if (ri) { const a = sb + (ri - 1) * 7, c = a + 7
          for (const [k0, k1] of [[0, 1], [1, 2], [2, 3], [3, 6], [0, 4], [4, 5], [5, 6]]) idx.push(a + k0, c + k0, a + k1, a + k1, c + k0, c + k1) }
      })
      // 水盆的石緣（一圈矮牆，半徑 2.6）
      const bb = pos.length / 3, NB = 36
      for (let a = 0; a <= NB; a++) { const f = a / NB * Math.PI * 2, sx = Math.sin(f), cz = Math.cos(f); for (const [r, y] of [[2.85, SPB], [2.8, SPB + 0.42], [2.5, SPB + 0.42], [2.45, SPB + 0.1]]) vtx(V(SP.x + sx * r, y, SP.z + cz * r), 0.3, f, r) }
      for (let a = 0; a < NB; a++) for (let k = 0; k < 3; k++) { const p0 = bb + a * 4 + k, p1 = p0 + 4; idx.push(p0, p1, p0 + 1, p0 + 1, p1, p1 + 1) }
      const cg2 = new THREE.BufferGeometry(); cg2.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); cg2.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); cg2.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); cg2.setIndex(idx); cg2.computeVertexNormals()
      const ch = new THREE.Mesh(cg2, cliffM); ch.receiveShadow = true; ch.name = 'gorgeSpiral'; g.add(ch)
      // 水盆的水、天窗（亮）、光柱、細瀑布（三片交叉的水簾）、落水點的滴水
      const pool2 = new THREE.Mesh(new THREE.CircleGeometry(2.5, 40).rotateX(-Math.PI / 2), runM); { const n = pool2.geometry.attributes.position.count, cc = new Float32Array(n * 3).fill(0.9); pool2.geometry.setAttribute('color', new THREE.BufferAttribute(cc, 3)) }
      pool2.position.set(SP.x, SPB + 0.34, SP.z); pool2.renderOrder = 2; g.add(pool2)
      const skyL = new THREE.Mesh(new THREE.CircleGeometry(1, 28).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.82, 0.95, 1.0).multiplyScalar(1.7), side: THREE.DoubleSide })); skyL.scale.set(1.5, 1, 1.0); skyL.position.set(SP.x, SPT - 0.05, SP.z); g.add(skyL)
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 2.3, SPT - SPB, 24, 1, true), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.7, 0.9, 1.0), transparent: true, opacity: 0.055, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending })); shaft.position.set(SP.x, (SPT + SPB) / 2, SP.z); shaft.renderOrder = 4; g.add(shaft)
      const fm2 = fallMat({ spd: 0.9, a: 0.85 })
      for (let k = 0; k < 3; k++) { const fq = new THREE.Mesh(new THREE.PlaneGeometry(0.75, SPT - SPB - 0.4, 1, 12), fm2); fq.position.set(SP.x, (SPT + SPB) / 2 + 0.2, SP.z); fq.rotation.y = k * Math.PI / 3; fq.renderOrder = 5; g.add(fq) }
      addDrips(V(SP.x, 0, SP.z), 1.6, 1.6, SPT - 0.5, SPT - SPB - 0.6, 90)
      for (let k = 0; k < 5; k++) { const f = k * 1.3 + 0.4; addDrips(V(SP.x - (RW - 0.5) * Math.sin(f), 0, SP.z - (RW - 0.5) * Math.cos(f)), 0.6, 0.6, SPT - 2 - k, 6, 8) }
    }
    // 9) 2026-11-12 Blender 岩石套件（tools/make-gorge-rock-kit.py；概念圖 models/raw/ref/gorge-interior-1.png）——
    // 使用者：「用 Blender 做岩石材質、光影」。以前隧道是一條光滑的管子、踏板是方塊、壁燈是一顆球：
    // 岩拱（每 4～5 m 一道，照那一段的寬高縮放）、牆腳和牆上的層狀岩棚、一塊塊石板拼的踏板、水溝邊的緣石、鐵架掛燈。
    // 每一件的頂點色是 Blender 烘的環境遮蔽；隧道裡的燈光照舊算進每一件的顏色，另外最近的兩盞燈是真的光源（tick）
    new GLTFLoader().loadAsync(`models/props/gorge_rock_kit.glb?v=${VER}`).then((gl) => {
      const K = {}
      gl.scene.traverse((o) => { if (!o.isMesh) return; const ge = o.geometry.clone(); o.updateWorldMatrix(true, false); ge.applyMatrix4(o.matrixWorld); if (!ge.attributes.color && ge.attributes.color_1) ge.setAttribute('color', ge.attributes.color_1); K[o.name] = ge })
      const inst = (geo, list, mat, shadow = true) => { if (!geo || !list.length) return null; const im = new THREE.InstancedMesh(geo, mat, list.length); list.forEach((e, k) => { im.setMatrixAt(k, e.m); if (e.c) im.setColorAt(k, e.c) }); im.castShadow = shadow; im.receiveShadow = true; im.computeBoundingSphere(); g.add(im); return im }
      const tunCol = (p, b) => { const L = lightAt(p); return new THREE.Color(b * (1 + L[0]), b * 0.9 * (1 + L[1]), b * 0.76 * (1 + L[2])) }
      const basis = (x, y, z, p, sx = 1, sy = 1, sz = 1) => new THREE.Matrix4().makeBasis(x.clone().multiplyScalar(sx), y.clone().multiplyScalar(sy), z.clone().multiplyScalar(sz)).setPosition(p)
      const RSIDE = [[1, -0.12], [1.09, 0.9], [1, 1.9], [0.65, 2.7], [0, 3.1]]
      const wallAtY = (i, sd, y) => { const [, hk] = shape(i), yy = y / hk; let rx = 0; for (let k = 0; k + 1 < RSIDE.length; k++) if (yy <= RSIDE[k + 1][1]) { rx = lerpN(RSIDE[k][0], RSIDE[k + 1][0], Math.max(0, (yy - RSIDE[k][1]) / (RSIDE[k + 1][1] - RSIDE[k][1]))); break } return wallLat(i, sd) * 0.956 * rx }
      const flat = (v) => V(v.x, 0, v.z).normalize()
      // 踏板：四種石板輪流用，一半轉 180 度
      { const names = ['step_a', 'step_b', 'step_c', 'step_d'].filter((n) => K[n]), lists = names.map(() => []), flip = new THREE.Matrix4().makeRotationY(Math.PI)
        if (names.length) {
          STEPS.forEach((e, n) => { const k = Math.floor(hsh(n * 3.7 + 1) * names.length) % names.length; lists[k].push({ m: hsh(n * 9.1) < 0.5 ? e.m.clone().multiply(flip) : e.m, c: e.c }) })
          names.forEach((n, k) => { const im = inst(K[n], lists[k], stepM); if (im) im.name = 'gorgeSteps_' + n })
          const old = g.getObjectByName('gorgeSteps'); if (old) { g.remove(old); old.geometry.dispose() }
        } }
      const ribs = { rib_a: [], rib_b: [], rib_c: [] }, RN = Object.keys(ribs)
      const ledges = { ledge_a: [], ledge_b: [], ledge_c: [], ledge_d: [] }
      const curbs = []
      const seepS = SEEP.map(([tag, u]) => { const i = idxAt(tag, u); return i < 0 ? -99 : st.S[i] })
      for (const run of RUNS) {
        if (run.length < 4) continue
        let acc = 3.6
        for (let r = 1; r < run.length - 1; r++) {
          const i = run[r]; acc += st.S[i] - st.S[run[r - 1]]
          const [wk, hk] = shape(i)
          if (acc < 4.3 || wk > 1.42) continue
          acc = hsh(i * 1.7) * 1.3
          const a = wallLat(i, 1) * 0.956, b = wallLat(i, -1) * 0.956, th = flat(TAN[i])
          const p = C3[i].clone().addScaledVector(SIDE[i], (a + b) / 2).add(V(0, -0.04, 0))
          ribs[RN[Math.floor(hsh(i * 5.3) * 3) % 3]].push({ m: basis(SIDE[i], UP, th.negate(), p, (a - b) / 2 / 1.3, hk * 1.01, 1 + 0.3 * hsh(i * 2.9)), c: tunCol(p.clone().add(V(0, 1.5, 0)), 0.34) })
        }
        // 岩棚：兩側牆腳一路斷斷續續；牆上偶爾一塊（高一點的地方）
        for (const sd of [1, -1]) {
          let la = 1.2
          for (let r = 1; r < run.length - 1; r++) {
            const i = run[r]; la += st.S[i] - st.S[run[r - 1]]
            if (la < 1.45) continue
            la = hsh(i * 3.3 + sd) * 0.5
            const wet = sd === IN(i), th = flat(TAN[i]), zAx = SIDE[i].clone().multiplyScalar(-sd), xAx = th.multiplyScalar(-sd)
            const nearSeep = wet && seepS.some((s0) => Math.abs(s0 - st.S[i]) < 1.5)
            const [, hk] = shape(i)
            if (hsh(i * 7.1 + sd * 2) < 0.9 && !nearSeep) {
              const nm = ['ledge_a', 'ledge_b', 'ledge_d', 'ledge_a'][Math.floor(hsh(i * 4.7 + sd) * 4) % 4], k = 0.85 + 0.4 * hsh(i * 6.1 + sd)
              const p = C3[i].clone().addScaledVector(SIDE[i], wallAtY(i, sd, 0.3) + sd * (wet ? 0.2 : 0.1)).add(V(0, -0.35, 0))
              ledges[nm].push({ m: basis(xAx, UP, zAx, p, k, 0.9 + 0.35 * hsh(i * 8.3 + sd), 1), c: tunCol(p.clone().add(V(0, 0.6, 0)), 0.34) })
            }
            for (const hz of [0, 1]) if (hsh(i * 11.9 + sd * 5 + hz * 3.3) < (hz ? 0.45 : 0.7) && !nearSeep) {
              const y = (hz ? 1.95 + 0.5 * hsh(i * 13.7 + sd) : 1.0 + 0.6 * hsh(i * 23.7 + sd)) * Math.min(hk, 1.4), nm = ['ledge_b', 'ledge_c', 'ledge_c'][Math.floor(hsh(i * 15.1 + sd) * 3) % 3]
              const p = C3[i].clone().addScaledVector(SIDE[i], wallAtY(i, sd, y + 0.2) + sd * 0.16).add(V(0, y, 0))
              ledges[nm].push({ m: basis(xAx, UP, zAx, p, 0.8 + 0.5 * hsh(i * 17.3 + sd), 0.9 + 0.3 * hsh(i * 19.1), 1), c: tunCol(p, 0.32) })
            }
          }
        }
        // 水溝邊的緣石（踏板和水之間）
        { let ca = 0.6
          for (let r = 1; r < run.length; r++) {
            const i = run[r], d = st.S[i] - st.S[run[r - 1]]; if (IN(i) !== IN(run[r - 1])) continue
            for (ca += d; ca >= 1.26; ca -= 1.26) {
              const t = 1 - (ca - 1.26) / Math.max(1e-6, d), p = C3[run[r - 1]].clone().lerp(C3[i], Math.min(1, Math.max(0, t))).addScaledVector(SIDE[i], 0.84 * IN(i)).add(V(0, 0.02, 0))
              const xAx = TAN[i].clone(), zAx = SIDE[i].clone(), yAx = V().crossVectors(zAx, xAx).normalize()
              curbs.push({ m: basis(xAx, yAx, zAx, p), c: tunCol(p, 0.36) })
            }
          } }
      }
      // 螺旋岩室：外牆牆腳、牆上一圈圈岩棚
      { const sp = []; for (let i = 0; i < NP; i++) if (st.tag[i] === 'SP') sp.push(i)
        let la = 0
        for (let r = 1; r < sp.length; r++) {
          const i = sp[r]; la += st.S[i] - st.S[sp[r - 1]]; if (la < 1.7) continue
          la = hsh(i * 3.9) * 0.6
          const dx = C3[i].x - SP.x, dz = C3[i].z - SP.z, l = Math.hypot(dx, dz), out = V(dx / l, 0, dz / l), zAx = out.clone().negate(), xAx = V().crossVectors(UP, zAx)
          for (const [yo, pr, list] of [[-0.3, 0.9, ['ledge_a', 'ledge_d', 'ledge_b']], [2.3 + 1.2 * hsh(i * 2.1), 0.55, ['ledge_c', 'ledge_b']]]) {
            if (hsh(i * 5.7 + yo) > pr) continue
            const nm = list[Math.floor(hsh(i * 7.7 + yo) * list.length) % list.length], p = V(SP.x + out.x * (RW - 0.12), C3[i].y + yo, SP.z + out.z * (RW - 0.12))
            ledges[nm].push({ m: basis(xAx, UP, zAx, p, 0.9 + 0.4 * hsh(i * 9.9 + yo), 0.9 + 0.35 * hsh(i * 4.3 + yo), 1), c: tunCol(p.clone().add(V(0, 0.5, 0)), 0.36) })
          }
        } }
      for (const n of RN) { const im = inst(K[n], ribs[n], stepM); if (im) im.name = 'gorgeRib_' + n }
      for (const n of Object.keys(ledges)) { const im = inst(K[n], ledges[n], stepM); if (im) im.name = 'gorgeLedge_' + n }
      { const im = inst(K.curb, curbs, stepM); if (im) im.name = 'gorgeCurbs' }
      // 壁燈：鐵架掛燈換掉原本那顆球
      if (K.lantern_iron && lamps.length) {
        const list = [], glow = []
        lampInfo.forEach(({ i, sd }, k) => {
          let zAx, p
          if (!sd) { const dx = C3[i].x - SP.x, dz = C3[i].z - SP.z, l = Math.hypot(dx, dz); zAx = V(-dx / l, 0, -dz / l); p = V(SP.x + dx / l * (RW - 0.1), C3[i].y + 2.45, SP.z + dz / l * (RW - 0.1)) }
          else { zAx = SIDE[i].clone().multiplyScalar(-sd); p = C3[i].clone().addScaledVector(SIDE[i], wallAtY(i, sd, 2.4) - sd * 0.1).add(V(0, 2.45, 0)) }
          const xAx = V().crossVectors(UP, zAx)
          list.push({ m: basis(xAx, UP, zAx, p, 1.1, 1.1, 1.1) })
          glow.push(p.clone().addScaledVector(zAx, 0.3 * 1.1).add(V(0, -0.2 * 1.1, 0)))
        })
        inst(K.lantern_iron, list, new THREE.MeshStandardMaterial({ color: 0x1c1b1a, roughness: 0.55, metalness: 0.7 }), false)
        inst(K.lantern_glass, list, new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 0.6, 0.22) }), false)
        for (const n of ['gorgeLamps', 'gorgeLampArms']) { const o = g.getObjectByName(n); if (o) g.remove(o) }
        const cv = document.createElement('canvas'); cv.width = cv.height = 64
        { const x = cv.getContext('2d'), gr = x.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,0.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = gr; x.fillRect(0, 0, 64, 64) }
        const halo = new THREE.Points(new THREE.BufferGeometry().setFromPoints(glow), new THREE.PointsMaterial({ map: new THREE.CanvasTexture(cv), color: new THREE.Color(1.0, 0.72, 0.38), size: 1.5, sizeAttenuation: true, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }))
        halo.frustumCulled = false; halo.layers.set(2); halo.name = 'gorgeLampGlow'; g.add(halo)
        lampGlow.push(...glow)
      }
    }).catch((e) => console.error('gorge rock kit', String(e?.stack ?? e)))
    // 滴水（全部一起畫）：每一顆從 yTop 落 H 公尺、落到底重來
    if (dripP.length) {
      const dg = new THREE.BufferGeometry(); dg.setAttribute('position', new THREE.Float32BufferAttribute(dripP, 3)); dg.setAttribute('aD', new THREE.Float32BufferAttribute(dripA, 3))
      const dm = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, uniforms: { uT },
        vertexShader: `attribute vec3 aD; uniform float uT; varying float vA; void main() { float k = fract(uT * aD.z + aD.y); vec3 p = position; p.y -= k * k * aD.x; vA = 1.0 - k * 0.5; vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_PointSize = clamp(42.0 / -mv.z, 1.0, 7.0); gl_Position = projectionMatrix * mv; }`,
        fragmentShader: `varying float vA; void main() { vec2 d = gl_PointCoord - 0.5; float a = smoothstep(0.5, 0.0, length(d * vec2(2.4, 1.0))); gl_FragColor = vec4(0.8, 0.9, 0.95, a * 0.75 * vA); }` })
      const dp = new THREE.Points(dg, dm); dp.frustumCulled = false; dp.renderOrder = 6; dp.name = 'gorgeDrips'; g.add(dp)
    }

    // 岩壁頂上：觀景台（瀑布口東邊）欄杆＋後面不能走出去
    const ironM = new THREE.MeshStandardMaterial({ color: 0x3b3d3f, roughness: 0.5, metalness: 0.6 }), posts = []
    for (let x = 201.4; x < 250; x += 0.9) if (x < 210.3 || x > 214.3) posts.push(V(x, YOSE.topY(x), YOSE.topFront(x) + 0.15))   // 2026-11-12 前緣整排欄杆，步道上來的地方（x 210～214）留開口
    for (let z = YOSE.topFront(201.4) + 0.15; z < YOSE.edge(201.4) - 2.2; z += 0.9) posts.push(V(201.3, YOSE.topY(201.3), z))   // 西邊（溪那側）
    for (const p of posts) addCollider(p.x, p.z, 0.2, p.y + 1.1, p.y)
    for (let x = 201.2; x < 251; x += 1) addCollider(x, YOSE.edge(x) - 1.9, 0.35, topYm + 3)
    const pg = new THREE.CylinderGeometry(0.035, 0.035, 1.05, 6).translate(0, 0.52, 0), pm = new THREE.InstancedMesh(pg, ironM, posts.length)
    posts.forEach((p, i) => pm.setMatrixAt(i, m4.makeTranslation(p.x, p.y, p.z))); pm.castShadow = true; g.add(pm)
    for (let i = 1; i < posts.length; i++) { const a = posts[i - 1], b = posts[i]; if (a.distanceTo(b) > 1.4) continue; const d = b.clone().sub(a), r = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, d.length(), 5), ironM); r.position.copy(a).add(b).multiplyScalar(0.5).setY((a.y + b.y) / 2 + 1.0); r.quaternion.setFromUnitVectors(V(0, 1, 0), d.normalize()); g.add(r) }

    // 岩壁頂上的溪：從後面（玻璃前）流到瀑布口，越靠瀑布口越寬、越快；兩岸一顆顆花崗岩
    {
      const F2 = YOSE.fall, zLip = YOSE.base(F2.x) + 0.45 + YOSE.rec(F2.x), zSrc = 101.6, NS = 40, P = [], U = [], I = []   // 2026-11-10 起點改在上游小溪接進來的地方（以前從公園邊界憑空冒出來）
      const cx = (t) => F2.x + 1.6 * Math.sin(t * 2.6 + 0.5) * (1 - t) - 0.8 * (1 - t)
      for (let i = 0; i <= NS; i++) {
        const t = i / NS, z = lerpN(zSrc, zLip, t), x = cx(t), w = lerpN(1.6, 3.0, t * t), y = YOSE.topY(x) + 0.07 - 0.02 * t
        P.push(x - w, y, z, x + w, y, z); U.push(0, t * 5, 1, t * 5)
        if (i) { const a = (i - 1) * 2; I.push(a, a + 2, a + 1, a + 1, a + 2, a + 3) }
      }
      const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); sg.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2)); sg.setIndex(I); sg.computeVertexNormals()
      const creek = new THREE.Mesh(sg, fallMat({ spd: 0.55, a: 0.85, dark: 0.15 })); creek.renderOrder = 3; g.add(creek)
      // 2026-11-10 上游（ChatGPT「瀑布頂 → 上游溪谷」的縮小版，使用者 OK）：以前這條溪從公園邊界憑空冒出來 →
      // 東北角小岩丘頂上的湧泉 → Silver Apron（水從光滑的花崗岩板整片滑下來）→ Emerald Pool（平台後方一個翡翠綠的潭，四周大石頭）
      // → 沿平台後緣往西的小溪 → 在瀑布口前接進原本那條溪。平台是平的 mesh：水面貼在平台上 7 公分；岩丘上照地形
      {
        const [spx, spz] = EAST.spring, back = (x) => YOSE.edge(x) - 6.5   // 平台後緣那一條（edge-4.5 以後）種了一排松樹：溪走在樹前面
        const groundY = (x, z) => x <= 249.5 ? YOSE.topY(x) : alpineHeight(x, z)
        const POOL = { x: 241, z: 118.6, rx: 3.6, rz: 2.6 }
        // 上游：泉→岩板→潭（寬的一片水）；下游：潭→往西的小溪→接到原本的溪中段
        const runs = [
          { pts: [[spx, spz], [252.5, 120.7], [250.6, 120.2], [248.5, 119.8], [POOL.x + POOL.rx - 0.3, POOL.z + 0.3]], w: [0.5, 1.5], spd: 0.9, a: 0.8 },
          { pts: [[POOL.x - POOL.rx + 0.3, POOL.z - 0.2], [233, back(233)], [228, back(228)], [222, back(222)], [216, back(216)], [210, back(210)], [205, back(205) - 0.5], [201.2, 101]], w: [0.9, 1.1], spd: 0.45, a: 0.82 },
        ]
        for (const R of runs) {
          const pts = R.pts.map(([x, z]) => V(x, 0, z)), curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal'), Lr = curve.getLength(), NSr = Math.ceil(Lr / 0.4), P2 = [], U2 = [], I2 = []
          for (let i = 0; i <= NSr; i++) {
            const t = i / NSr, p = curve.getPointAt(t), tg = curve.getTangentAt(t), w = lerpN(R.w[0], R.w[1], t) * (0.85 + 0.15 * Math.sin(t * 17)), nx = -tg.z, nz = tg.x
            for (const sd of [-1, 1]) { const x = p.x + nx * w * sd, z = p.z + nz * w * sd; P2.push(x, groundY(x, z) + 0.07, z) }
            U2.push(0, t * Lr / 3, 1, t * Lr / 3)
            if (i) { const a2 = (i - 1) * 2; I2.push(a2, a2 + 2, a2 + 1, a2 + 1, a2 + 2, a2 + 3) }
          }
          // 三角形要朝上：往西流的那段左右順序反過來，第一版整條溪朝下被剔掉看不到（雙面的話看到的是背面，一條黑帶）
          { const v = (k) => V(P2[k * 3], P2[k * 3 + 1], P2[k * 3 + 2]), nrm = v(2).sub(v(0)).cross(v(1).sub(v(0))); if (nrm.y < 0) for (let k = 0; k < I2.length; k += 3) { const t3 = I2[k + 1]; I2[k + 1] = I2[k + 2]; I2[k + 2] = t3 } }
          const rg = new THREE.BufferGeometry(); rg.setAttribute('position', new THREE.Float32BufferAttribute(P2, 3)); rg.setAttribute('uv', new THREE.Float32BufferAttribute(U2, 2)); rg.setIndex(I2); rg.computeVertexNormals()   /* 2026-11-11 沒有法線 → 溪床整條全黑 */
          const run = new THREE.Mesh(rg, fallMat({ spd: R.spd, a: R.a, dark: 0.12 })); run.renderOrder = 3; g.add(run)
          const rbed = new THREE.Mesh(rg.clone(), new THREE.MeshStandardMaterial({ color: 0x3d4f4c, roughness: 0.3, metalness: 0.1 })); rbed.position.y = -0.03; g.add(rbed)
        }
        // Emerald Pool：翡翠綠、很清的深潭（平台是平的挖不下去 → 深色潭面＋亮一點的淺綠邊，四周一圈大石頭）
        const pg = new THREE.CircleGeometry(1, 40).rotateX(-Math.PI / 2)
        const deep = new THREE.Mesh(pg, new THREE.MeshStandardMaterial({ color: 0x0f4d44, roughness: 0.06, metalness: 0.05, transparent: true, opacity: 0.93 }))
        deep.scale.set(POOL.rx - 0.5, 1, POOL.rz - 0.4); deep.position.set(POOL.x, YOSE.topY(POOL.x) + 0.09, POOL.z); deep.renderOrder = 3; g.add(deep)
        const shal = new THREE.Mesh(pg, new THREE.MeshStandardMaterial({ color: 0x3f8a74, roughness: 0.1, transparent: true, opacity: 0.85 }))
        shal.scale.set(POOL.rx, 1, POOL.rz); shal.position.set(POOL.x, YOSE.topY(POOL.x) + 0.075, POOL.z); shal.renderOrder = 3; g.add(shal)
        if (lib) {
          const names = ['boulder', 'mrock_3', 'mrock_5', 'mrock_8'].filter((n) => lib[n]), list = Object.fromEntries(names.map((n) => [n, []]))
          for (let i = 0; i < 22; i++) {
            const a3 = i / 22 * TAU + rnd() * 0.2, inflow = Math.abs(Math.atan2(Math.sin(a3), Math.cos(a3))) < 0.35, outflow = Math.abs(Math.atan2(Math.sin(a3 - Math.PI), Math.cos(a3 - Math.PI))) < 0.35
            if (inflow || outflow) continue   // 進水口、出水口留開
            const rr = 1.08 + rnd() * 0.15, x = POOL.x + Math.cos(a3) * POOL.rx * rr, z = POOL.z + Math.sin(a3) * POOL.rz * rr
            const n = names[Math.floor(rnd() * names.length)], k2 = n === 'boulder' ? 0.3 + rnd() * 0.3 : 0.6 + rnd() * 0.8
            list[n].push({ p: V(x, YOSE.topY(x) - 0.12 * k2, z), q: new THREE.Quaternion().setFromEuler(new THREE.Euler(rnd() * 0.3, rnd() * TAU, rnd() * 0.3)), s: V(k2, k2 * 0.75, k2) })
          }
          for (const n of names) if (list[n].length) scatter(g, lib[n], list[n], { cast: true })
        }
      }
      const bed = new THREE.Mesh(sg.clone(), new THREE.MeshStandardMaterial({ color: 0x3d4f4c, roughness: 0.3, metalness: 0.1 })); bed.position.y = -0.03; g.add(bed)
      if (lib) {
        const names = ['boulder', 'mrock_3', 'mrock_5', 'mrock_8'].filter((n) => lib[n])
        const list = Object.fromEntries(names.map((n) => [n, []]))
        for (let i = 0; i < 46; i++) {
          const t = rnd(), z = lerpN(zSrc, zLip, t), w = lerpN(1.6, 3.0, t * t), sd = rnd() < 0.5 ? -1 : 1, x = cx(t) + sd * (w + 0.2 + rnd() * 1.4)
          if (x > 201) continue   // 觀景台那邊不放（會擋路）
          const n = names[Math.floor(rnd() * names.length)], k2 = n === 'boulder' ? 0.25 + rnd() * 0.3 : 0.5 + rnd() * 0.7
          list[n].push({ p: V(x, YOSE.topY(x) - 0.15 * k2, z), q: new THREE.Quaternion().setFromEuler(new THREE.Euler(rnd() * 0.3, rnd() * TAU, rnd() * 0.3)), s: V(k2, k2 * 0.8, k2) })
        }
        for (const n of names) if (list[n].length) scatter(g, lib[n], list[n], { cast: true })
      }
    }
  }

  // ---------- 西黃松 ----------
  const PINES = []
  // 2026-11-10 使用者：瀑布步道往上有樹林擋住 → 石階（含從支線走過來那段）6 m 內不種松樹（樹冠會蓋在路上、樹幹擋路）
  const SP = YOSE.stairs().pts.filter((_, i) => i % 2 === 0), nearStairs = (x, z, r) => SP.some(([sx, sz]) => Math.hypot(sx - x, sz - z) < r)
  for (let k = 0; k < 4000 && PINES.length < 30; k++) {
    const x = X0 - 6 + rnd() * (X1 - X0 + 10), z = YOSE.base(x) - 3 - rnd() * 30
    if (!YOSE.inside(x, z) || domeRho(x, z) > 0.9) continue
    if (alpineTrailDist(x, z) < 3 || nearStairs(x, z, 6) || Math.hypot(x - F.x, z - F.z) < 14 || PINES.some((p) => Math.hypot(p.x - x, p.z - z) < 7)) continue
    if (Math.hypot(x - CAMP.x, z - CAMP.z) < CAMP.R + 4 || YOSE.behind(x, z) || YOSE.inLake(x, z, 4) || alpineStreamDist(x, z) < 4) continue   // 營地裡、石階、湖、河上不長
    const y = alpineHeight(x, z), H = 18 + rnd() * 10
    if (H < 10) continue
    PINES.push({ x, z, y, H, rot: rnd() * TAU, lean: (rnd() - 0.5) * 0.05 })
  }
  // 2026-11-11 岩壁頂上的休息站（使用者：山頂要有大平地、加休息站；ChatGPT：國家公園那種簡樸的——木造涼亭、長椅、步道指標、解說牌、望遠鏡，不要商業化）
  {
    const wood = new THREE.MeshStandardMaterial({ color: 0x7a5a3a, roughness: 0.85 }), dark = new THREE.MeshStandardMaterial({ color: 0x4b3a2a, roughness: 0.9 })
    const stone = new THREE.MeshStandardMaterial({ color: 0x9a968e, roughness: 0.95 }), metal = new THREE.MeshStandardMaterial({ color: 0x55604f, roughness: 0.6, metalness: 0.25 })
    const panelT = (() => { const c = document.createElement('canvas'); c.width = 512; c.height = 320; const x = c.getContext('2d'); x.fillStyle = '#5b3f26'; x.fillRect(0, 0, 512, 320); x.fillStyle = '#efe6cf'; x.fillRect(14, 14, 484, 292)
      x.fillStyle = '#2f4a2e'; x.font = 'bold 34px Georgia, serif'; x.fillText('Upper Fall Overlook', 34, 62); x.fillStyle = '#4a4a40'; x.font = '20px Georgia, serif'
      ;['Granite walls carved by glaciers', 'Watch for swifts and ravens', 'riding the updraft along the cliff.'].forEach((t, i) => x.fillText(t, 34, 112 + i * 30))
      x.strokeStyle = '#7c8f6a'; x.lineWidth = 4; x.beginPath(); x.moveTo(34, 240); x.bezierCurveTo(140, 180, 260, 280, 470, 210); x.stroke(); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t })()
    const signT = (() => { const c = document.createElement('canvas'); c.width = 512; c.height = 160; const x = c.getContext('2d'); x.fillStyle = '#6b4a2c'; x.fillRect(0, 0, 512, 160); x.fillStyle = '#f3e7c8'; x.font = 'bold 40px Georgia, serif'; x.fillText('UPPER FALL TRAIL', 30, 62); x.font = '30px Georgia, serif'; x.fillText('Valley  ↓   ·   Overlook  ←', 30, 120); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t })()
    const parts = { wood: [], dark: [], stone: [], metal: [] }
    const box = (k, w, h, d, x, y, z, ry = 0) => parts[k].push(new THREE.BoxGeometry(w, h, d).applyMatrix4(new THREE.Matrix4().makeRotationY(ry).setPosition(x, y, z)))
    const Y0 = (x) => YOSE.topY(x) + 0.05
    // 涼亭（4.4 × 5 m）：四根粗木柱站在石墩上，人字形屋頂
    // 2026-11-10 ChatGPT：涼亭以前正對石階出口（6 公尺），還沒爬到頂就看到 → 移到平台中間偏西、出口側面 20 多公尺
    const sx = SHELTER.x, sz = SHELTER.z, sy = Y0(sx)
    for (const dx of [-2.0, 2.0]) for (const dz of [-2.3, 2.3]) { box('stone', 0.5, 0.35, 0.5, sx + dx, sy + 0.17, sz + dz); box('wood', 0.26, 2.6, 0.26, sx + dx, sy + 1.6, sz + dz); addCollider(sx + dx, sz + dz, 0.25, sy + 3, sy) }
    for (const dz of [-2.3, 2.3]) box('wood', 4.6, 0.22, 0.24, sx, sy + 2.95, sz + dz)
    for (const sgn of [-1, 1]) { const r = new THREE.BoxGeometry(2.9, 0.12, 5.8).applyMatrix4(new THREE.Matrix4().makeRotationZ(sgn * 0.42).setPosition(sx + sgn * 1.3, sy + 3.55, sz)); parts.dark.push(r) }
    box('wood', 0.2, 0.25, 5.8, sx, sy + 4.1, sz)
    // 涼亭裡：野餐桌＋兩條長椅
    box('wood', 1.0, 0.07, 2.2, sx, sy + 0.78, sz); for (const dz of [-0.85, 0.85]) box('wood', 0.9, 0.74, 0.1, sx, sy + 0.4, sz + dz)
    for (const dx of [-0.85, 0.85]) { box('wood', 0.32, 0.06, 2.2, sx + dx, sy + 0.46, sz); for (const dz of [-0.9, 0.9]) box('wood', 0.08, 0.44, 0.08, sx + dx, sy + 0.22, sz + dz) }
    addCollider(sx, sz, 1.0, sy + 0.9, sy)
    // 看出去的原木長椅（面向山谷）
    for (const bx of [220, 231, 247]) { const bz = YOSE.topFront(bx) + 1.6, by = Y0(bx); box('wood', 1.8, 0.1, 0.4, bx, by + 0.45, bz); box('wood', 1.8, 0.4, 0.08, bx, by + 0.7, bz + 0.2); for (const dx of [-0.7, 0.7]) box('wood', 0.12, 0.42, 0.36, bx + dx, by + 0.21, bz); addCollider(bx, bz, 0.5, by + 0.6) }
    // 步道指標（石階頂）
    { const x = M0.XB + 2.2, z = YOSE.topFront(M0.XB) + 1.8, y = Y0(x); box('wood', 0.14, 1.9, 0.14, x, y + 0.95, z); const sg = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.38, 0.05), [wood, wood, wood, wood, new THREE.MeshStandardMaterial({ map: signT, roughness: 0.8 }), new THREE.MeshStandardMaterial({ map: signT, roughness: 0.8 })]); sg.position.set(x, y + 1.6, z + 0.1); sg.castShadow = true; g.add(sg); addCollider(x, z, 0.15, y + 2) }
    // 解說牌＋望遠鏡（瀑布口旁的觀景台）
    { const x = 204.2, z = YOSE.topFront(204.2) + 1.2, y = Y0(x); for (const dx of [-0.5, 0.5]) box('wood', 0.1, 0.9, 0.1, x + dx, y + 0.45, z); const pm = new THREE.Mesh(new THREE.PlaneGeometry(1.25, 0.78), new THREE.MeshStandardMaterial({ map: panelT, roughness: 0.7 })); pm.rotation.x = -0.6; pm.position.set(x, y + 1.05, z + 0.05); g.add(pm); addCollider(x, z, 0.5, y + 1.2) }
    { const x = 206.4, z = YOSE.topFront(206.4) + 0.9, y = Y0(x); box('metal', 0.12, 1.1, 0.12, x, y + 0.55, z); box('metal', 0.22, 0.2, 0.5, x, y + 1.2, z - 0.05); parts.metal.push(new THREE.CylinderGeometry(0.06, 0.06, 0.2, 10).rotateX(Math.PI / 2).translate(x - 0.06, y + 1.22, z - 0.35), new THREE.CylinderGeometry(0.06, 0.06, 0.2, 10).rotateX(Math.PI / 2).translate(x + 0.06, y + 1.22, z - 0.35)); addCollider(x, z, 0.2, y + 1.3) }
    // 垃圾桶（防熊的那種鐵箱）
    // 防熊垃圾桶跟著涼亭（以前在石階出口旁邊）
    { const x = SHELTER.x + 3.6, z = SHELTER.z + 2.4, y = Y0(x); box('metal', 0.9, 1.0, 0.6, x, y + 0.5, z); addCollider(x, z, 0.5, y + 1.1, y) }
    for (const [k, list] of Object.entries(parts)) if (list.length) { const m = new THREE.Mesh(mergeGeometries(list.map((q) => q.index ? q.toNonIndexed() : q)), { wood, dark, stone, metal }[k]); m.castShadow = true; m.receiveShadow = true; g.add(m) }
  }
  // 2026-11-11 岩壁頂上也長樹（以前光禿禿）：西黃松、矮一點，離邊 4 公尺以上；觀景台、走道、溪讓開
  for (let k = 0, n = 0; k < 3000 && n < 16; k++) {
    const x = X0 + 8 + rnd() * (X1 - X0 - 16), zb = YOSE.base(x), ze = YOSE.edge(x) - 2, zf = YOSE.topFront(x)
    const z = zf + 4 + rnd() * (ze - zf - 4)
    if (ze - zf < 6 || Math.abs(x - YOSE.fall.x) < 6 || (x > 199 && x < 252 && z < YOSE.edge(x) - 4.5) || Math.hypot(x - SHELTER.x, z - SHELTER.z) < 6 || Math.hypot(x - 241, z - 118.6) < 5.5 || PINES.some((p) => Math.hypot(p.x - x, p.z - z) < 6)) continue
    PINES.push({ x, z, y: YOSE.topY(x) - 0.2, H: 9 + rnd() * 6, rot: rnd() * TAU, lean: (rnd() - 0.5) * 0.08 }); n++
  }
  // 2026-11-10 ChatGPT QA：山頂平台一大片灰色像水泥 → 樹下一圈松針落葉土、平台上零星幾片砂土／碎石、散幾顆小石頭
  {
    const T = (() => { const c = document.createElement('canvas'); c.width = c.height = 256; const x = c.getContext('2d'), gr = x.createRadialGradient(128, 128, 20, 128, 128, 128)
      gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.55, 'rgba(255,255,255,0.75)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = gr; x.fillRect(0, 0, 256, 256)
      const img = x.getImageData(0, 0, 256, 256), d = img.data
      for (let i = 0; i < d.length; i += 4) { const n = Math.random(); d[i] = 105 + n * 40; d[i + 1] = 92 + n * 34; d[i + 2] = 74 + n * 26; d[i + 3] *= 0.3 + 0.35 * Math.random() }
      x.putImageData(img, 0, 0); for (let k = 0; k < 500; k++) { x.strokeStyle = `rgba(${70 + Math.random() * 40},${55 + Math.random() * 25},35,0.35)`; x.lineWidth = 1; const px = Math.random() * 256, py = Math.random() * 256, an = Math.random() * 6.3; if (Math.hypot(px - 128, py - 128) > 115) continue; x.beginPath(); x.moveTo(px, py); x.lineTo(px + Math.cos(an) * 9, py + Math.sin(an) * 9); x.stroke() }
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t })()
    const dm = new THREE.MeshStandardMaterial({ map: T, transparent: true, depthWrite: false, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })
    const pts = []
    for (const p of PINES) if (Math.abs(p.y - YOSE.topY(p.x)) < 0.5) pts.push([p.x, p.z, 2.4 + rnd() * 0.8])
    for (let k = 0, n = 0; k < 400 && n < 16; k++) {
      const x = 202 + rnd() * 47, zf = YOSE.topFront(x) + 1.5, ze = YOSE.edge(x) - 2.5
      if (ze < zf) continue
      pts.push([x, zf + rnd() * (ze - zf), 1.0 + rnd() * 1.6]); n++
    }
    const im = new THREE.InstancedMesh(new THREE.CircleGeometry(1, 24).rotateX(-Math.PI / 2), dm, pts.length)
    pts.forEach(([x, z, r], i) => im.setMatrixAt(i, m4.compose(V(x, YOSE.topY(x) + 0.02, z), q.setFromAxisAngle(V(0, 1, 0), rnd() * TAU), s.set(r * (0.8 + rnd() * 0.4), 1, r))))
    im.receiveShadow = true; im.renderOrder = 1; g.add(im)
    if (lib) {
      const names = ['mrock_1', 'mrock_3', 'mrock_5'].filter((n) => lib[n]), rl = Object.fromEntries(names.map((n) => [n, []]))
      for (let k = 0, n = 0; k < 600 && n < 40 && names.length; k++) {
        const x = 202 + rnd() * 47, zf = YOSE.topFront(x) + 1.2, ze = YOSE.edge(x) - 2.2, z = zf + rnd() * (ze - zf)
        if (ze < zf || Math.hypot(x - SHELTER.x, z - SHELTER.z) < 4.5 || alpineTrailDist(x, z) < 1.5) continue
        const k2 = 0.25 + rnd() * 0.45, nm = names[Math.floor(rnd() * names.length)]
        rl[nm].push({ p: V(x, YOSE.topY(x) - 0.12 * k2, z), q: new THREE.Quaternion().setFromEuler(new THREE.Euler(rnd() * 0.3, rnd() * TAU, rnd() * 0.3)), s: V(k2, k2 * 0.6, k2) }); n++
      }
      for (const n of names) if (rl[n].length) scatter(g, lib[n], rl[n], { cast: true })
      // 2026-11-10 ChatGPT：抵達感——石階最後幾階從兩塊大花崗岩中間穿出去（缺口約 2 公尺），出口前看不到平台，走出去視野才打開；
      // 平台上再散幾塊半埋的大岩盤，打破整片平地
      {
        const st = YOSE.stairs(), e = st.pts.at(-1), b4 = st.pts.at(-4), dx = e[0] - b4[0], dz = e[1] - b4[1], dl = Math.hypot(dx, dz), ux = dx / dl, uz = dz / dl, nx = -uz, nz = ux
        const big = names.includes('mrock_5') ? 'mrock_5' : names[0], gate = { [big]: [] }
        // 擺在最後一段石階內側（平台前緣石牆後面 1 公尺），擋住從石階往平台看的視線；不擋出口（出口在石階盡頭往北轉上平台）
        for (const [dxe, k2] of [[-6.2, 2.3], [-3.9, 1.9]]) {
          const x = e[0] + dxe, z = YOSE.topFront(x) + 1.1
          gate[big].push({ p: V(x, YOSE.topY(x) - 0.35 * k2, z), q: new THREE.Quaternion().setFromEuler(new THREE.Euler(rnd() * 0.2, rnd() * TAU, rnd() * 0.2)), s: V(k2, k2 * 1.25, k2 * 0.8) })
          addCollider(x, z, 0.42 * k2, YOSE.topY(x) + k2)
        }
        scatter(g, lib[big], gate[big], { cast: true })
        const out = Object.fromEntries(names.map((n) => [n, []]))
        for (let k = 0, n = 0; k < 400 && n < 8; k++) {
          const x = 204 + rnd() * 44, zf = YOSE.topFront(x) + 2.5, ze = YOSE.edge(x) - 3, z = zf + rnd() * (ze - zf)
          if (ze < zf + 1 || Math.hypot(x - SHELTER.x, z - SHELTER.z) < 6 || Math.hypot(x - e[0], z - e[1]) < 9 || alpineTrailDist(x, z) < 2) continue
          const k2 = 1.0 + rnd() * 0.8, nm = names[Math.floor(rnd() * names.length)]
          out[nm].push({ p: V(x, YOSE.topY(x) - 0.45 * k2, z), q: new THREE.Quaternion().setFromEuler(new THREE.Euler(rnd() * 0.25, rnd() * TAU, rnd() * 0.25)), s: V(k2 * 1.3, k2 * 0.7, k2) }); n++
          addCollider(x, z, 0.55 * k2, YOSE.topY(x) + 0.4 * k2)
        }
        for (const n of names) if (out[n].length) scatter(g, lib[n], out[n], { cast: true })
      }
    }
  }
  if (PINES.length) {
    const pbark = barkMaterial('pine_bark', { normal: 1.5, color: [1.75, 1.15, 0.8] })   // 西黃松的樹皮：橘紅色的大鱗片，裂縫黑
    const tg = new THREE.CylinderGeometry(0.55, 1, 1, 18, 12, true).translate(0, 0.5, 0)
    { const u = tg.attributes.uv; for (let i = 0; i < u.count; i++) u.setXY(i, u.getX(i) * 2, u.getY(i) * 10) }
    const trunk = new THREE.InstancedMesh(tg, pbark, PINES.length)
    const limbs = [], tufts = [], cc = new THREE.Color()
    PINES.forEach((p, i) => {
      const R = 0.32 + p.H * 0.012
      m4.compose(V(p.x, p.y - 0.3, p.z), q.setFromEuler(e.set(p.lean, p.rot, 0)), s.set(R, p.H * 0.93, R)); trunk.setMatrixAt(i, m4)
      addCollider(p.x, p.z, R * 1.1, p.y + p.H)
      // 樹冠：上半段 10～14 根往上翹的枝，枝梢一簇簇長針葉（樹冠開闊、看得到天空）
      const nL = 10 + Math.floor(rnd() * 5)
      for (let k = 0; k < nL; k++) {
        const h = p.H * (0.5 + 0.42 * k / nL), a = k * 2.4 + rnd() * 0.6, up = 0.15 + rnd() * 0.35 + 0.3 * (k / nL)
        const len = p.H * (0.13 + rnd() * 0.07) * (1.15 - k / nL * 0.6), dir = V(Math.cos(a) * Math.cos(up), Math.sin(up), Math.sin(a) * Math.cos(up))
        const base = V(p.x, p.y + h, p.z)
        limbs.push({ p: base, q: new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), dir), s: V(R * 0.18, len, R * 0.18) })
        for (const u of [0.55, 0.85, 1.05]) {
          const S = 2.0 + rnd() * 1.4, cp = base.clone().addScaledVector(dir, len * u).add(V(0, -S * 0.3, 0))
          tufts.push({ p: cp, q: new THREE.Quaternion().setFromEuler(new THREE.Euler((rnd() - 0.5) * 1.2, rnd() * TAU, (rnd() - 0.5) * 1.2)), s: V(S * 1.3, S, S * 1.3), c: cc.setHSL(0.27 + (rnd() - 0.5) * 0.04, 0.3, 0.6 + rnd() * 0.12).clone() })
        }
      }
      tufts.push({ p: V(p.x, p.y + p.H * 0.86, p.z), q: new THREE.Quaternion(), s: V(3, p.H * 0.16, 3), c: cc.setHSL(0.27, 0.3, 0.65).clone() })   // 樹梢
    })
    const lg = new THREE.CylinderGeometry(0.3, 1, 1, 8, 1, true).translate(0, 0.5, 0)
    const limbM = new THREE.InstancedMesh(lg, pbark, limbs.length); limbs.forEach((l, i) => limbM.setMatrixAt(i, m4.compose(l.p, l.q, l.s)))
    const tuftM = new THREE.InstancedMesh(coniferGeo('hemlock', 7), needleMaterial(), tufts.length); tufts.forEach((t, i) => { tuftM.setMatrixAt(i, m4.compose(t.p, t.q, t.s)); tuftM.setColorAt(i, t.c) })
    for (const m of [trunk, limbM, tuftM]) { m.castShadow = true; m.receiveShadow = true; m.computeBoundingSphere(); g.add(m) }
  }

  // 2026-11-11 瀑布湖的岸（使用者：左岸一片光禿的米色坡）：一層草（花園那套草葉）、蕨類、長青苔的石頭；步道、河道、石階、岩壁讓開
  {
    const LK = YOSE.lake, ok = (x, z) => !YOSE.behind(x, z) && alpineTrailDist(x, z) > 1.3 && alpineStreamDist(x, z) > 1.6 && !YOSE.inLake(x, z, 0.4) && domeRho(x, z) < 0.93
    const A = [], B = [], c = new THREE.Color(), sunV = V(-0.45, 0.8, 0.3).normalize()
    for (let k = 0; k < 120000 && A.length / 4 < 40000; k++) {
      const a = rnd() * TAU, e = 1.03 + Math.pow(rnd(), 1.4) * 2.6, x = LK.x + Math.cos(a) * LK.rx * e, z = LK.z + Math.sin(a) * LK.rz * e
      if (!ok(x, z)) continue
      const n = fbm2(x * 0.7, z * 0.7, 2)
      c.setHSL(0.22 + n * 0.06 + (rnd() - 0.5) * 0.03, 0.45, 0.2 + rnd() * 0.08)
      if (rnd() < 0.12) c.lerp(new THREE.Color(0.55, 0.5, 0.3), 0.45)
      A.push(x, alpineHeight(x, z) - 0.02, z, rnd() * TAU)
      B.push(c.r, c.g, c.b, (0.12 + rnd() * 0.2 + Math.max(0, n - 0.4) * 0.4) * (e < 1.15 ? 1.4 : 1))   // 水邊的草長一點
    }
    if (A.length) { const gm = bladeMesh(A, B, { width: [0.006, 0.008], sun: sunV }); gm.frustumCulled = false; g.add(gm) }
    if (lib) {
      const ferns = ['fern_sa', 'fern_sb', 'fern2_b', 'fern2_c', 'fern_a'].filter((n) => lib[n]), rocks = ['mrock_2', 'mrock_5', 'mrock_8', 'mrock_10', 'mrock_11'].filter((n) => lib[n])
      const fl = {}, rl = {}
      for (let k = 0, nf = 0, nr = 0; k < 4000 && (nf < 70 || nr < 34); k++) {
        const a = rnd() * TAU, e = 1.05 + rnd() * 1.3, x = LK.x + Math.cos(a) * LK.rx * e, z = LK.z + Math.sin(a) * LK.rz * e
        if (!ok(x, z)) continue
        const y = alpineHeight(x, z)
        if (nf < 70 && ferns.length && rnd() < 0.7) { (fl[ferns[Math.floor(rnd() * ferns.length)]] ||= []).push({ p: V(x, y - 0.05, z), q: new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), rnd() * TAU), s: V(1, 1, 1).multiplyScalar(0.8 + rnd() * 0.7) }); nf++ }
        else if (nr < 34 && rocks.length) { const k2 = 0.35 + rnd() * 0.75; (rl[rocks[Math.floor(rnd() * rocks.length)]] ||= []).push({ p: V(x, y - 0.25 * k2, z), q: new THREE.Quaternion().setFromEuler(new THREE.Euler(rnd() * 0.3, rnd() * TAU, rnd() * 0.3)), s: V(k2, k2 * (0.6 + rnd() * 0.4), k2) }); nr++ }
      }
      for (const [n, list] of [...Object.entries(fl), ...Object.entries(rl)]) scatter(g, lib[n], list, { cast: true })
    }
  }

  // 2026-11-10 岩簷步道：湖那側一排木欄杆（ChatGPT：高 1.05～1.15、柱距 1.2～1.6）；盡頭觀景平台前緣一圈；岩棚上長蕨類、岩窟口地上一些蕨類和濕石頭
  {
    const sp = ALP_SPURS.find((s) => s.name === 'cave')
    if (sp) {
      const woodM = new THREE.MeshStandardMaterial({ color: 0x2b3033, roughness: 0.42, metalness: 0.65 }), parts2 = []   // 2026-11-11 改成跟石階一樣的深色鐵欄杆（濕的）
      const post = new THREE.CylinderGeometry(0.035, 0.035, 1, 8), bar = new THREE.CylinderGeometry(0.028, 0.028, 1, 8).rotateZ(Math.PI / 2)
      const LK = YOSE.lake, rail = []
      const P = sp.pts
      for (let i = 2; i < P.length - 1; i++) {
        const [ax, az] = P[i], [bx, bz] = P[i + 1], L = Math.hypot(bx - ax, bz - az), nx = -(bz - az) / L, nz = (bx - ax) / L
        const sgn = (LK.x - (ax + bx) / 2) * nx + (LK.z - (az + bz) / 2) * nz > 0 ? 1 : -1
        for (let d = 0; d < L - 0.01; d += 1.4) { const x = ax + (bx - ax) * d / L + nx * sgn * 1.2, z = az + (bz - az) * d / L + nz * sgn * 1.2; rail.push([x, z]) }
      }
      // 平台：盡頭往前（水簾那側）半圈
      const [ex, ez] = P.at(-1)
      for (let a = -2.45; a <= 0.95; a += 0.42) rail.push([ex + 0.4 + Math.cos(a) * 2.2, ez + Math.sin(a) * 2.0])   // 西邊（步道進來那側）不圍
      let prev = null
      for (const [x, z] of rail) {
        const y = alpineHeight(x, z), top = y + 1.1
        parts2.push(post.clone().scale(1, 1.15, 1).translate(x, y + 0.52, z))
        if (prev && Math.hypot(prev[0] - x, prev[2] - z) < 2.2) for (const h of [0, -0.45]) {
          const a = V(prev[0], prev[1] + h, prev[2]), b = V(x, top + h, z), len = a.distanceTo(b)
          const m = new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(V(1, 0, 0), b.clone().sub(a).normalize()))
          parts2.push(bar.clone().scale(len, 1, 1).applyMatrix4(m).translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2))
        }
        prev = [x, top, z]
        addCollider(x, z, 0.12, y + 1.2)
      }
      const rm = new THREE.Mesh(mergeGeometries(parts2.map((q2) => q2.index ? q2.toNonIndexed() : q2)), woodM); rm.castShadow = true; rm.receiveShadow = true; g.add(rm)
    }
    // 2026-11-10 使用者：垂掛植物（ChatGPT：只長在有裂縫、土的地方——岩簷上緣、岩棚，不要整片天花板都是）：
    // 一張畫好的藤蔓圖（細莖＋小葉、透明底）貼在往下垂的長條上，InstancedMesh 一次畫完；下端隨風輕輕擺
    {
      const cv = document.createElement('canvas'); cv.width = 128; cv.height = 512
      const cx = cv.getContext('2d'), r2 = mulberry32(77)
      for (let st = 0; st < 3; st++) {
        let x = 22 + st * 40 + (r2() - 0.5) * 16, y = 0
        const len = 280 + r2() * 232, root = r2() < 0.25
        cx.strokeStyle = root ? 'rgb(70,52,36)' : 'rgb(46,74,30)'; cx.lineWidth = root ? 1.6 : 2.2; cx.beginPath(); cx.moveTo(x, 0)
        const pts2 = []
        while (y < len) { y += 6; x += (r2() - 0.5) * 3.2; x = Math.min(124, Math.max(4, x)); cx.lineTo(x, y); pts2.push([x, y]) }
        cx.stroke()
        if (root) continue
        for (const [px, py] of pts2) {
          if (r2() < 0.45) continue
          const side = r2() < 0.5 ? -1 : 1, sz = (1 - py / 560) * (6 + r2() * 7)
          cx.fillStyle = `rgb(${40 + r2() * 40 | 0},${85 + r2() * 60 | 0},${30 + r2() * 30 | 0})`
          cx.beginPath(); cx.ellipse(px + side * sz * 0.8, py + sz * 0.3, sz, sz * 0.55, side * 0.6 + (r2() - 0.5) * 0.6, 0, Math.PI * 2); cx.fill()
        }
      }
      const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4
      const vg = new THREE.PlaneGeometry(1, 1, 1, 8).translate(0, -0.5, 0)
      const vm = new THREE.MeshStandardMaterial({ map: tex, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.8 })
      vm.onBeforeCompile = (sh) => {
        sh.uniforms.uT = uT
        sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uT;').replace('#include <begin_vertex>', `#include <begin_vertex>
          { float k = pow(max(0.0, -position.y), 1.6); vec4 ip = instanceMatrix[3]; transformed.x += sin(uT * 1.1 + ip.x * 0.7 + ip.z * 0.5) * 0.08 * k; transformed.z += sin(uT * 0.8 + ip.x * 1.3) * 0.05 * k; }`)
      }
      vm.customProgramCacheKey = () => 'hangVine'
      // ChatGPT QA 第二輪：不要一整排綠窗簾 → 5～7 個群落（寬 1.5～4 m），中間留裸岩；每群 8～25 條；長度 60% 0.4～1.5、30% 1.5～3、10% 3～5 m；另外 2～6 條短根
      const list = [], CL = []
      for (let k = 0; k < 7; k++) CL.push({ x: YOSE.cave.x0 + 1 + rnd() * (YOSE.cave.x1 - YOSE.cave.x0 - 2) + (k > 4 ? (rnd() - 0.5) * 30 : 0), w: 1.5 + rnd() * 2.5 })
      const inCl = (x) => CL.find((c) => Math.abs(x - c.x) < c.w / 2 && Math.abs(x - YOSE.fall.x) > 4.5)
      const lenPick = () => { const r = rnd(); return 1.6 * (r < 0.6 ? 0.4 + rnd() * 1.1 : r < 0.9 ? 1.5 + rnd() * 1.5 : 3 + rnd() * 2) }   // 遠看才看得到：整體 ×1.6
      const lipAt = (x) => { let best = null; for (const c of cols) if (c.lip && (!best || Math.abs(c.x - x) < Math.abs(best.x - x))) best = c; return best && Math.abs(best.x - x) < 0.5 ? best : null }
      for (const cl of CL) {
        const n = 16 + Math.floor(rnd() * 22)
        for (let i = 0; i < n; i++) {
          const x = cl.x + (rnd() - 0.5) * cl.w, c = lipAt(x)
          if (c && Math.abs(x - YOSE.fall.x) > 4.5) list.push({ p: V(x, c.lip.y + (rnd() - 0.5) * 0.4, c.lip.z - 0.05 - rnd() * 0.15), yaw: (rnd() - 0.5) * 0.5, w: 0.3 + rnd() * 0.35, L: lenPick(), c: 0.75 + rnd() * 0.45 })
        }
        for (let i = 0; i < 2 + rnd() * 4; i++) { const x = cl.x + (rnd() - 0.5) * cl.w, c = lipAt(x); if (c) list.push({ p: V(x, c.lip.y - 0.1, c.lip.z), yaw: rnd() * 3, w: 0.12 + rnd() * 0.1, L: 0.2 + rnd() * 0.6, c: 0.45 }) }   // 短根（深色）
      }
      // 岩棚上：也照群落長（群落外很少）
      for (const [x, y, z] of ledgeSpots) {
        if (Math.abs(x - YOSE.fall.x) < 4 || rnd() > (inCl(x) ? 0.5 : 0.05)) continue
        list.push({ p: V(x, y + 0.05, z - 0.25), yaw: (rnd() - 0.5) * 0.6, w: 0.22 + rnd() * 0.3, L: lenPick() * 0.8, c: 0.7 + rnd() * 0.5 })
      }
      if (list.length) {
        const im = new THREE.InstancedMesh(vg, vm, list.length), cc = new THREE.Color()
        list.forEach((b, i) => { im.setMatrixAt(i, m4.compose(b.p, q.setFromAxisAngle(V(0, 1, 0), b.yaw), V(b.w, b.L, 1))); im.setColorAt(i, cc.setRGB(b.c * 0.95, b.c, b.c * 0.85)) })
        im.castShadow = false;   // 透明貼圖的影子會變成長方形
        im.receiveShadow = true; im.computeBoundingSphere(); g.add(im)
      }
    }
    if (lib) {
      const ferns = ['fern_sa', 'fern_sb', 'fern2_b', 'fern2_c', 'fern_a'].filter((n) => lib[n]), fl = {}
      // 岩棚上的蕨類（層理上緣、潮濕的地方）
      // 岩棚上的蕨類往外（-z，離開岩壁）伸出去（ChatGPT：葉長 0.3～0.9 m、不要只貼著岩面）；每 10 m² 3～8 叢小的
      for (const [x, y, z] of ledgeSpots) { if (!ferns.length) break; const qq = new THREE.Quaternion().setFromAxisAngle(V(1, 0, 0), -(0.35 + rnd() * 0.45)).multiply(new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), rnd() * TAU)); (fl[ferns[Math.floor(rnd() * ferns.length)]] ||= []).push({ p: V(x, y - 0.12, z - 0.1), q: qq, s: V(1, 1, 1).multiplyScalar(0.55 + rnd() * 0.75) }) }
      // 岩窟口兩側、牆腳：大蕨類
      for (let k = 0, n = 0; k < 600 && n < 60; k++) {
        const x = YOSE.cave.x0 - 4 + rnd() * (YOSE.cave.x1 - YOSE.cave.x0 + 6), zb = YOSE.base(x), z = zb - 1.5 + rnd() * (YOSE.caveD(x) + 1.5)
        if (alpineTrailDist(x, z) < 1.4 || YOSE.inLake(x, z, 0.6) || YOSE.caveA(x) > 0.5 && z > zb + YOSE.caveD(x) * 0.6 || z > zb + Math.max(0.3, YOSE.caveD(x) - 0.8)) continue
        if (!ferns.length) break
        ;(fl[ferns[Math.floor(rnd() * ferns.length)]] ||= []).push({ p: V(x, alpineHeight(x, z) - 0.05, z), q: new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), rnd() * TAU), s: V(1, 1, 1).multiplyScalar(0.9 + rnd() * 0.8) }); n++
      }
      for (const [n, list] of Object.entries(fl)) scatter(g, lib[n], list, { cast: false })
    }
  }

  let lastT = 0
  const _near = [null, null]
  function tick(t, camera, lights) {
    // 隧道壁燈：離鏡頭最近的兩盞是真的光源（借公園路燈那一池固定數量的 PointLight：白天它們是關的；光源數量一變所有材質要重編）
    if (camera && lights?.length >= 2 && lampGlow.length) {
      let d0 = 240, d1 = 240; _near[0] = _near[1] = null
      for (const p of lampGlow) { const d = p.distanceToSquared(camera.position); if (d < d0) { d1 = d0; _near[1] = _near[0]; d0 = d; _near[0] = p } else if (d < d1) { d1 = d; _near[1] = p } }
      for (let k = 0; k < 2; k++) if (_near[k]) { lights[k].position.copy(_near[k]); lights[k].intensity = 15 }
    }
    const dt = Math.min(0.1, Math.max(0, t - lastT)); lastT = t
    uT.value = t
    for (const sp of mist) { const u = sp.userData; sp.material.opacity = (u.op ?? 1) * (0.28 + 0.16 * Math.sin(t * 0.6 + u.ph)); sp.position.set(u.p0.x + Math.sin(t * 0.13 + u.ph) * 1.5, u.p0.y + Math.sin(t * 0.21 + u.ph) * 0.8, u.p0.z - (0.5 + 0.5 * Math.sin(t * 0.09 + u.ph)) * 2.5) }
    for (const f of foams) { const k = (t * (f.userData.k ? 0.35 : 0.22) + f.userData.k * 0.5) % 1; f.rotation.y = t * (f.userData.k ? -0.05 : 0.03); f.material.opacity = 0.85 * (1 - k * 0.6) }
    if (sprayU && dt > 0) sprayU(dt)
  }
  // ---------- 2026-11-12 鷹之窗：最高那段岩壁廊道外的岩壁上一棵大枯樹，頂端橫枝停一隻大冠鷲 ----------
  // 模型 tools/make-gorge-kit.py（Blender；ChatGPT 概念圖 models/raw/ref/gorge-eagle-window.png）；木紋跟濕地枯木同一份掃描，褪成銀灰
  // 頂點色（snag）：r＝烘好的明暗、g＝地衣量（根部、朝上的面）
  {
    const S = YOSE.snag
    new GLTFLoader().loadAsync(`models/props/gorge_kit.glb?v=${VER}`).then((gl) => {
      const TL = new THREE.TextureLoader()
      const tex = (n, srgb) => { const t = TL.load(`models/props/drift_${n}.jpg?v=${VER}`); t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.flipY = false; t.anisotropy = 8; return t }
      const m = new THREE.MeshStandardMaterial({ map: tex('col', true), normalMap: tex('nor', false), normalScale: new THREE.Vector2(1.3, -1.3), roughnessMap: tex('rough', false), roughness: 1 })
      m.onBeforeCompile = (sh) => {
        sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec4 snag;\nvarying vec2 vSnag;\nvarying vec3 vSnagP;')
          .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSnag = snag.rg; vSnagP = position;')
        sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec2 vSnag;\nvarying vec3 vSnagP;\n' + GLSL_VNOISE)
          .replace('#include <map_fragment>', `#include <map_fragment>
            float sl = dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11));
            vec3 wood = mix(vec3(0.16, 0.15, 0.135), vec3(0.66, 0.645, 0.59), smoothstep(0.03, 0.42, sl));
            wood *= mix(0.5, 1.15, vSnag.x);
            float ln = vfbm(vSnagP.xy * 3.1 + vSnagP.z * 1.7);
            float li = smoothstep(0.42, 0.62, vSnag.y * 0.75 + ln * 0.5);
            vec3 lich = mix(vec3(0.098, 0.128, 0.072), vec3(0.365, 0.402, 0.235), smoothstep(0.35, 0.7, vfbm(vSnagP.xz * 9.0 + vSnagP.y * 4.0)));
            diffuseColor.rgb = mix(wood, lich, li * 0.8);`)
      }
      gl.scene.traverse((o) => {
        if (!o.isMesh || o.name !== 'eagle_snag') return
        const geo = o.geometry.clone(); o.updateWorldMatrix(true, false); geo.applyMatrix4(o.matrixWorld)
        const c = geo.attributes.color_1 || geo.attributes.color
        geo.setAttribute('snag', c); geo.deleteAttribute('color'); geo.deleteAttribute('color_1')
        const t = new THREE.Mesh(geo, m); t.name = 'eagleSnag'; t.position.set(S.x, S.y, S.z); t.castShadow = true; t.receiveShadow = true; g.add(t)
      })
    })
  }
  return { group: g, tick, pines: PINES }
}
const mist = [], foams = [], lampGlow = []
let mistTex = null
let sprayU = null
