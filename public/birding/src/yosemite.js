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
const SHELTER = { x: 209, z: 102 }   // 2026-11-13 往西 3 m：步道加寬後 x 212 以東岩壁頂的前緣退到這裡   // 岩壁頂上的涼亭（2026-11-11 使用者：涼亭懸空 → 以前 222, 99.5 在平台前緣外 3 m、底下是石階走廊；這裡平台前緣 98.2～後緣 105.8，四邊各留 1 m）
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
  const nearTrail3 = (x, y, z) => { for (let i = 0; i < TR.pts.length; i++) { const dy = y - TR.yy[i]; if (dy > -1.5 && dy < 3.2 && Math.abs(x - TR.pts[i][0]) < 2.6 && Math.abs(z - TR.pts[i][1]) < 2.6) return true } return false }
  const CTREES = [...YOSE.cliffTrees().map((t) => [t.x, t.y]), [YOSE.snag.x, YOSE.snag.y]]   // 崖壁上的樹根：這附近的石壁不往裡凹（不然樹根懸空）
  let STEP_MAT = null   // 石階的材質（賞鳥台的鋪石地板也用）
  const CHAIN = { posts: [], segs: [] }   // 鐵鍊路段的鐵樁和每一跨（下面蓋欄杆時記下來，cliff_kit 載好再蓋）
  // 2026-11-12 第三版：階地。每一層從地板一路開到天空（y1 很高），越上面的層切得越深；岩壁變成一階一階往後退的大階梯，頭上沒有岩石。
  // 只有賞鳥台往石壁裡多鑿 1.9 m、高 3.2 m 的凹龕（頭上那塊岩簷＝上一層步道的地板）
  const slotsAt = (x) => {
    const out = [], T = TR
    for (let i = 1; i < T.pts.length; i++) {
      const k = T.kind[i], [ax] = T.pts[i - 1], [bx, bz] = T.pts[i]
      if (k === 'gal' && T.kind[i - 1] !== 'alc') {
        if ((x - ax) * (x - bx) > 0.04) continue
        const t = Math.abs(bx - ax) < 1e-6 ? 0 : Math.max(0, Math.min(1, (x - ax) / (bx - ax))), y = lerpN(T.yy[i - 1], T.yy[i], t), d = lerpN(T.pts[i - 1][1] - YOSE.base(ax), bz - YOSE.base(bx), t)
        out.push({ y0: y - 0.3, y1: y + 90, depth: d + 1.25 })
        for (const b of T.bays ?? []) if (Math.abs(x - b.x) < b.half + 0.25 && Math.abs(y - b.y) < 0.8) out.push({ y0: y - 0.3, y1: y + 3.2, depth: d + 1.25 + b.depth })   // 賞鳥台的凹龕
      } else if (k === 'alc' || (k === 'open' && bz - YOSE.base(bx) > 0.2 && bx > 207.5)) {
        if (Math.abs(x - bx) > 1.5) continue
        out.push({ y0: T.yy[i] - 0.3, y1: T.yy[i] + 90, depth: bz - YOSE.base(bx) + (k === 'alc' ? 1.9 : 1.75) })
      } else if (k === 'shelf') {
        // 岩棚上那一圈：大部分走在原本的岩棚上、不用切；只有進岩棚那幾公尺（岩棚還很窄）要把石壁切開
        if (Math.abs(x - bx) > 1.0) continue
        const d = bz - YOSE.base(bx); if (d + 0.85 > YOSE.rec2(x)) out.push({ y0: T.yy[i] - 0.3, y1: T.yy[i] + 90, depth: d + 0.95 })
      }
    }
    return out
  }
  // 隧道口：岩壁網格在這幾顆球的範圍內不畫（材質裡 discard），隧道的管子才接得出來
  // 球的半徑 1.3（比隧道斷面小一點）：洞整個落在隧道口裡面，從旁邊看不到岩體裡面是空的；門口是一個圓拱
  const PORTALS = []   // 岩壁材質裡「這幾顆球的範圍不畫」的洞（以前是隧道口；隧道拆了，現在全部是空的，留著給以後要在岩壁上開洞時用）
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
    const cutAt = (y) => { let c = 0; if (R > 0.3 && y >= SHELF_Y) c = y < SHELF_Y + 3.7 ? R2 : R; for (const sl of slots) if (y >= sl.y0 && y <= sl.y1) c = Math.max(c, Math.max(1.2, sl.depth - nd0(y))); return c }
    const upper = (yFrom, dBase) => {
      const ys = []; for (let y = yFrom; y < yTop; y += 0.4) ys.push(y)
      const edges = []; if (R > 0.3) edges.push(SHELF_Y, SHELF_Y + 3.7); for (const sl of slots) edges.push(sl.y0, sl.y1)
      const corner = new Set()
      for (const e of edges) if (e > yFrom + 0.05 && e < yTop - 0.05) { ys.push(e - 0.03, e + 0.03); corner.add(e - 0.03); corner.add(e + 0.03) }
      ys.sort((a, b) => a - b)
      for (const y of ys) P.push([dBase(y) + cutAt(y), y, 0, corner.has(y) ? 1 : 0])
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
    // 2026-11-12 階地的轉角（地板的內外緣）要剛好落在取樣點上，不然等距取樣會把直角削成斜面、石壁歪到步道上面
    const snap = new Map(); for (let i = 0; i < P.length; i++) if (P[i][3]) snap.set(Math.max(1, Math.min(FACE - 1, Math.round(Ls[i] / Ls.at(-1) * FACE))), P[i])
    const yTerr = slots.length ? Math.min(...slots.map((sl) => sl.y0)) - 0.4 : 1e9
    // 2026-11-12 ChatGPT V4（遠看五條橫帶太整齊）：兩層步道之間的石壁上加直的侵蝕溝、往裡凹的岩層（0.3～0.8 m），頭上 2.6 m 以上才有往外凸的岩塊；
    // 離地板、岩簷 0.35 m 以內不動（步道的寬度、能走的範圍都不變）
    const lvl = []; for (const sl of slots) { lvl.push(sl.y0); if (sl.y1 < sl.y0 + 20) lvl.push(sl.y1) }
    const rough = (y, bo0) => {
      let a = 99, b = 99; for (const e of lvl) { if (e <= y) a = Math.min(a, y - e); else b = Math.min(b, e - y) }
      if (a > 90) return 0
      let tk = 1; for (const [tx, ty] of CTREES) if (Math.abs(y - ty) < 3) tk = Math.min(tk, ss(1.6, 3.2, Math.abs(x - tx)))
      const m = ss(0.35, 0.9, a) * ss(0.3, 0.8, b) * tk, m2 = ss(2.6, 3.3, a) * ss(0.3, 0.9, b) * tk
      const chan = ss(0.52, 0.7, fbm2(x * 0.3, y * 0.035 + 7, 3)), blk = ss(0.5, 0.68, fbm2(x * 0.22 + 3, y * 0.32, 2))
      return m * (0.75 * chan + 0.8 * Math.max(0, Math.min(0.6, bo0))) - m2 * blk * (1 - chan) * (0.25 + Math.max(0, Math.min(0.5, -bo0)))
    }
    for (let k = 0, i = 1; k <= FACE; k++) {
      const s0 = Ls.at(-1) * k / FACE; while (i < P.length - 1 && Ls[i] < s0) i++
      const u = (s0 - Ls[i - 1]) / Math.max(1e-6, Ls[i] - Ls[i - 1]), sp = snap.get(k), d = sp ? sp[0] : lerpN(P[i - 1][0], P[i][0], u), y = sp ? sp[1] : lerpN(P[i - 1][1], P[i][1], u), q = lerpN(P[i - 1][2], P[i][2], u)
      // 層理只往裡凹（瀑布水簾那幾公尺）或前後都有（其他地方）；岩窟裡也有
      const b = bedAt(x, y), bo0 = sed * (fallK > 0.3 ? Math.max(0, b.off) + 0.2 : b.off) * ss(g0 - 0.5, g0 + 1.5, y), bo = y > yTerr ? (sp ? 0 : Math.max(-0.1, Math.min(0.3, bo0 * 0.4)) * 0.5 + rough(y, bo0)) : bo0   // 階地以上：層理不能凸到步道上
      out.push([y, Math.max(push, zb + d + bo), q, b.ledge * sed, b.tone, b.joint * sed])
    }
    if (A > 0.25) out.lip = { y: g0 + Ho + 0.3, z: zb + lip - 0.35 * A, A }
    out.cutTop = cutTop; out.topD = normalD(yTop) + cutTop   // topD＝岩壁頂的前緣離牆腳多遠（cutTop 是扣掉岩壁後仰的量之後的切深）
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
        const t = (k - FACE) / TOP, z0 = Math.max(zb + 3.0 - 2.4 * fallK + YOSE.rec(x), zb + prof.cutTop + 0.45, prof.cutTop > 2 ? zb + prof.topD + 0.03 : -1e9)   /* 2026-11-12 階地那段：頂面從最上面那層步道內側的石壁才開始（原本少算岩壁後仰的 1.3 m，頂面蓋在最後幾階上面） */
        y = g0 + Ht + lerpN(Math.sin(t * Math.PI * 0.5) * 0.8 - t * t * 0.6, -0.04 * t, fk)   // 平的那段：頂上平平的、往後微微低一點
        z = z0 + (ze - z0) * t
      }
      row.push([x, y, z])
    }
    for (const [ri, [px, py, pz]] of row.entries()) {
      const pr = ri <= FACE ? prof[ri] : null, inCave = pr ? pr[2] : 0, ledge = pr ? pr[3] : 0, tone = pr ? pr[4] : 1, jnt = pr ? pr[5] : 0
      caveQ.push(inCave)
      if (ledge > 0.45 && inCave < 0.25 && py > YOSE.g0(px) + 1.2 && py < YOSE.g0(px) + 40 && rnd() < 0.3 && !nearTrail3(px, py, pz)) ledgeSpots.push([px, py, pz, inCave])   // 步道旁邊、頭的高度以內不長（蕨葉整片擋在臉前面）
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
        const shelfWet = ss(11, 5.5, Math.abs(px - YOSE.fall.x) + 1.5 * (fbm2(px * 0.5, py * 0.5 + 3, 2) - 0.5)) * ss(3.2, 0.4, Math.abs(py - SHELF_Y - 0.4))   // 2026-11-12 中段水潭周圍 4～7 m：被水霧打濕、深 20～35%
        // 2026-11-12 ChatGPT 峽谷規格（docs/GORGE_SPEC.txt，linear；頂點色 ×2）：乾砂岩 .30/.27/.22、乾頁岩 .18/.19/.18、濕砂岩 .105/.095/.078、濕頁岩 .065/.075/.07、
        // 苔 .035/.115/.025、鐵鏽 .25/.095/.035。這一層是砂岩還是頁岩看它的明暗（tone 暗的當頁岩）
        const shl = Math.min(1, Math.max(0, (1.0 - tone) * 3.2))
        let r0 = lerpN(lerpN(0.74, 0.42, shl), lerpN(0.25, 0.14, shl), wetF), g0c = lerpN(lerpN(0.58, 0.40, shl), lerpN(0.2, 0.15, shl), wetF), b0 = lerpN(lerpN(0.38, 0.35, shl), lerpN(0.14, 0.135, shl), wetF)   // 乾砂岩再暖一點（底圖是灰的花崗岩貼圖，照規格的數字出來偏灰）
        { const iron = Math.max(0, fbm2(px * 0.21 + 11, py * 0.35 + 5, 3) - 0.6) * 2.4 * (1 - 0.6 * wetF); r0 = lerpN(r0, 0.5, iron * 0.5); g0c = lerpN(g0c, 0.19, iron * 0.5); b0 = lerpN(b0, 0.07, iron * 0.5) }
        r0 = lerpN(r0, 0.11, deep * 0.7); g0c = lerpN(g0c, 0.115, deep * 0.7); b0 = lerpN(b0, 0.1, deep * 0.7)
        const crackD = 1 - 0.6 * Math.min(1, jnt * 2.2)
        r0 *= tone * crackD * (1 - streak * 0.35); g0c *= tone * crackD * (1 - streak * 0.35); b0 *= tone * crackD * (1 - streak * 0.35)
        r0 *= 1 - 0.52 * shelfWet; g0c *= 1 - 0.47 * shelfWet; b0 *= 1 - 0.42 * shelfWet
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
  for (const c of cols) if (!(c.x > 205 && c.x < 248.5) && YOSE.caveA(c.x) < 0.08 && Math.abs(c.x * 2 - Math.round(c.x * 2)) < 1e-6 && Math.round(c.x * 2) % 3 === 0) addCollider(c.x, c.zb + 0.9, 1.3, c.g0 + c.Ht)
  // 岩窟：碰撞放在後壁（往裡 caveD 的地方）
  for (let x = YOSE.cave.x0; x <= YOSE.cave.x1; x += 0.6) { const A = YOSE.caveA(x); if (A < 0.08) continue; { const cz = YOSE.base(x) + Math.max(0.9, YOSE.caveD(x) - 0.35); if (TR.pts.some(([px, pz], i) => i < 40 && Math.hypot(px - x, pz - cz) < 1.5)) continue }   /* 凹槽東口步道往外轉的地方：牆的碰撞會擋到路 */ addCollider(x, YOSE.base(x) + Math.max(0.9, YOSE.caveD(x) - 0.35), 0.5, YOSE.g0(x) + YOSE.caveH(x)) }   /* 2026-11-13 凹槽變湖、步道貼著後壁的岩架走：碰撞貼近牆面一點、半徑小一點，不擋路 */   // 石階平台兩端外面也不放（半徑 1.3 會伸進轉彎的平台）

  // 岩壁腳下的落石堆：掃描的岩石、大石頭，沿牆腳 1～4 公尺
  if (lib) {
    const names = ['boulder', 'mrock_1', 'mrock_3', 'mrock_5', 'mrock_8', 'mrock_11'].filter((n) => lib[n]), lists = Object.fromEntries(names.map((n) => [n, []]))
    // 2026-11-10 使用者：石頭再大、再寫實 → 落石堆的石頭放大 1.6 倍；水潭四周一圈 1.5～4 公尺的大石頭（濕的、顏色深）；石頭不能壓到步道（照石頭大小算）
    const FL = YOSE.fall, inPool = (x, z, pad) => ((x - FL.x) / (FL.rx + pad)) ** 2 + ((z - FL.z) / (FL.rz + pad)) ** 2 < 1
    const wetC = (x) => { const w = Math.exp(-(((x - FL.x) / 9) ** 2)); return new THREE.Color().setScalar(1.35 - 0.3 * w) }
    // 2026-11-12 上山步道（YOSE.stairs）露天的頭一段不在 alpineTrailDist 裡，石頭會擺到路上把路堵死 → 另外量離它多遠
    const stOpen = YOSE.stairs().pts.slice(0, 26)
    const stairD = (x, z) => { let m = 1e9; for (let i = 1; i < stOpen.length; i++) { const [ax, az] = stOpen[i - 1], [bx, bz] = stOpen[i], dx = bx - ax, dz = bz - az, t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz))); m = Math.min(m, Math.hypot(x - ax - dx * t, z - az - dz * t)) } return m }
    const putRock = (n, x, z, k2, sink = 0.25) => lists[n].push({ p: V(x, alpineHeight(x, z) - sink * k2, z), q: new THREE.Quaternion().setFromEuler(new THREE.Euler(rnd() * 0.3, rnd() * TAU, rnd() * 0.3)), s: V(k2, k2 * (0.7 + rnd() * 0.5), k2), c: wetC(x) })
    for (let k = 0; k < 260; k++) {
      const x = X0 + 4 + rnd() * (X1 - X0 - 8), z = YOSE.base(x) - 0.5 - rnd() * 4
      const n = names[Math.floor(rnd() * names.length)], k2 = (n === 'boulder' ? 0.25 + rnd() * 0.35 : 0.6 + rnd() * 0.9) * 1.6
      if (alpineTrailDist(x, z) < 3.2 + k2 * (n === 'boulder' ? 2.2 : 0.7) || inPool(x, z, 0.6) || YOSE.inLake(x, z, 1.5) || alpineStreamDist(x, z) < 2.5 || (x > 204 && x < 244) || stairD(x, z) < 1.8 + k2 * 0.7) continue
      putRock(n, x, z, k2)
    }
    for (let k = 0, made = 0; k < 400 && made < 16; k++) {   // 水潭邊的大石頭（不擋住看瀑布的那一面：步道那側少放）
      const a = rnd() * TAU, x = FL.x + Math.cos(a) * (FL.rx + 0.6 + rnd() * 1.6), z = FL.z + Math.sin(a) * (FL.rz + 0.5 + rnd() * 1.4)
      const n = rnd() < 0.5 && lib.boulder ? 'boulder' : names[1 + Math.floor(rnd() * (names.length - 1))], k2 = n === 'boulder' ? 0.45 + rnd() * 0.5 : 1.6 + rnd() * 1.6
      if (!lists[n] || YOSE.behind(x, z - 1.5) || alpineTrailDist(x, z) < 3.4 + k2 * (n === 'boulder' ? 2.2 : 0.7) || (Math.sin(a) < -0.3 && rnd() < 0.7) || YOSE.inLake(x, z, -0.5) || stairD(x, z) < 1.7 + k2 * (n === 'boulder' ? 1.6 : 0.6)) continue
      if (alpineHeight(x, z) > YOSE.lake.water + 9) continue;   /* 2026-11-12 岩壁腳的地形格子是岩壁頂的高度：石頭被擺到 76 m 高、碰撞體沒有底，把底下的崖壁步道擋住 */ putRock(n, x, z, k2, 0.3); addCollider(x, z, k2 * (n === 'boulder' ? 1.6 : 0.6), alpineHeight(x, z) + k2 * 0.8, alpineHeight(x, z) - 1.5); made++
    }
    // 岩石改成灰白（花崗岩）：材質複製一份、顏色去飽和再提亮（原本掃描的是褐色、長青苔的石頭），跟岩壁一致
    for (const n of names) {
      if (!lists[n].length) continue
      for (const { geo, mat } of parts(lib[n])) {
        const m2 = mat.clone()
        m2.onBeforeCompile = (sh) => { sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
          float gl = dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11)); diffuseColor.rgb = mix(vec3(gl) * vec3(1.55, 1.22, 0.82) + 0.02, diffuseColor.rgb * 1.2, 0.3);`) }   /* 2026-11-12 灰白花崗岩 → 砂岩色（使用者：瀑布山上下顏色不同） */   // 留三成原本的顏色（青苔、鏽斑），比較寫實
        m2.customProgramCacheKey = () => 'graniteSand'
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
    // 2026-11-12 使用者「中間瀑布下來那邊是不是要有水像湖」→ ChatGPT：不是整片湖，是上段瀑布沖出來的一個不規則水潭（7×5 m、腎形、靠後面的岩壁），
    // 水從前面的缺口（寬約 3 m）經過一小段水道流到岩簷口，接下段瀑布——水潭、水道、下段瀑布頂要連成一條。水潭邊一圈高出水面 0.2～0.6 m 的岩石，
    // 岩棚兩側各留 1～2 m 沒淹到的岩面。落點 3 m 內一團白色的氣泡水、外面一圈打轉的碎白沫、出口一條條順著流的白沫；中間深綠、邊上看得到底。
    // （岩棚是岩壁網格的一部分、沒辦法往下挖 → 水面比岩棚高 0.32 m，靠那圈岩石圍住；深淺用顏色和透明度做）
    const MP = { x: F.x + 0.2, z: zUp - 2.5, rx: 3.7, rz: 2.7, y: shelfY + 0.16, ix: F.x, iz: zUp - 1.9 }
    const mpRim = (a) => { const k = 1 + 0.15 * Math.sin(a * 2 + 0.7) + 0.09 * Math.sin(a * 3 + 2.1) - 0.22 * Math.max(0, Math.cos(a - 4.25)) ** 3; return [MP.x + Math.cos(a) * MP.rx * k, MP.z + Math.sin(a) * MP.rz * k] }
    { const NA = 56, NR = 7, P = [], E = [], I = []
      for (let r = 0; r <= NR; r++) for (let a = 0; a < NA; a++) { const [ex, ez] = mpRim(a / NA * TAU), t = r / NR; P.push(lerpN(MP.x, ex, t), MP.y, lerpN(MP.z, ez, t)); E.push(1 - t) }
      // ChatGPT 水潭 V1：水像倒在平台上的一片 → 水面只比岩棚高 0.16 m；外面再一圈 0.7 m 斜下去貼到岩棚的深色濕泥砂（蓋住水和岩棚交界那條線）
      for (let a = 0; a < NA; a++) { const [ex, ez] = mpRim(a / NA * TAU), t = 1 + (0.6 + 0.25 * Math.sin(a * 1.7)) / 3.4; P.push(lerpN(MP.x, ex, t), shelfY + 0.015, lerpN(MP.z, ez, t)); E.push(-1) }
      for (let r = 0; r < NR + 1; r++) for (let a = 0; a < NA; a++) { const a2 = (a + 1) % NA, p = r * NA + a, q = r * NA + a2, u = p + NA, w = q + NA; I.push(p, u, q, q, u, w) }
      const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); pg.setAttribute('aEdge', new THREE.Float32BufferAttribute(E, 1)); pg.setIndex(I)
      const pm = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide,
        uniforms: { uT, uDay: dayLight, uSun: sunDirU, uImp: { value: new THREE.Vector2(MP.ix, MP.iz) }, uOut: { value: new THREE.Vector3(F.x, MP.z - MP.rz * 0.55, MP.z - MP.rz * 1.05) }, uLip: { value: zLipW } },
        vertexShader: `attribute float aEdge; varying float vE; varying vec3 vW; void main(){ vE = aEdge; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
        fragmentShader: `
          uniform float uT, uDay, uLip; uniform vec3 uSun, uOut; uniform vec2 uImp; varying float vE; varying vec3 vW;
          float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
          float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f); return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
          float fbm(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 4; i++){ s += a * n(p); p *= 2.03; a *= 0.5; } return s; }
          void main(){
            vec2 d = vW.xz - uImp; float dI = length(d);
            float lit = 0.12 + 0.95 * uDay;
            if (vE < 0.0) {   /* 外圈：濕的深色泥砂、碎石，往外淡掉 */
              float g = n(vW.xz * 9.0) * 0.5 + n(vW.xz * 23.0) * 0.5;
              gl_FragColor = vec4(mix(vec3(0.075, 0.07, 0.055), vec3(0.16, 0.14, 0.11), g) * lit, smoothstep(-1.0, -0.15, vE) * (0.55 + 0.4 * g)); return; }
            float chan = step(vW.z, uOut.z + 0.05);                                                                                  // 水道那一段（另一片網格，同一個材質）
            float depth = 0.25 + 1.0 * smoothstep(0.0, 0.5, vE) + 1.2 * smoothstep(3.6, 0.8, dI) * smoothstep(0.1, 0.5, vE);          // 邊上 0.25 m、中間 1.25 m、落點底下 2.4 m
            depth = mix(depth, 0.25 + 0.4 * smoothstep(0.0, 0.5, vE), chan);
            /* 淺的邊緣才是青綠色、看得到底；中間 3～4 m 是很深的墨綠、幾乎不透明（讓人覺得是岩棚裡的一個深潭，不是鋪在上面的一層水） */
            vec3 col = mix(vec3(0.12, 0.22, 0.17), vec3(0.03, 0.085, 0.075), smoothstep(0.3, 1.0, depth));
            col = mix(col, vec3(0.012, 0.04, 0.038), smoothstep(1.2, 2.2, depth));
            float outK = max(smoothstep(uOut.y, uOut.z, vW.z) * smoothstep(2.1, 0.9, abs(vW.x - uOut.x)), chan);                      // 出水口：往前（-z）加速
            col = mix(col, vec3(0.085, 0.17, 0.14), outK * 0.6);
            /* 落點：半徑 1.2～1.6 m 一團翻騰的白色氣泡水 */
            float bub = fbm(vW.xz * 2.6 + vec2(0.0, uT * 0.9)) * 0.6 + fbm(vW.xz * 6.5 - vec2(uT * 1.3, uT * 0.4)) * 0.4;
            float imp = smoothstep(1.55, 0.35, dI + (bub - 0.5) * 0.9);
            float foam = imp * smoothstep(0.28, 0.5, bub + imp * 0.35);
            /* 外面：細長的碎白沫（寬 5～25 cm、長 0.2～0.9 m），繞著落點慢慢轉，一條條 0.6～1.8 秒就消掉；只佔水面一成左右；西邊留一塊平靜的深色水 */
            float ang = atan(d.y, d.x) + uT * 0.3 / max(dI, 0.8);
            vec2 sc = vec2(ang * dI * 1.6, dI * 7.0);                                                                                // 沿著圓周拉長
            float life = n(sc * vec2(0.35, 0.2) + vec2(3.0, uT * 0.7));                                                              // 一條條時有時無（不用格子切，第一版切出一塊塊方的）
            float st = n(sc) * 0.6 + 0.4 * smoothstep(0.45, 0.75, life);
            float calm = smoothstep(-2.6, -0.6, d.x);
            foam += smoothstep(0.7, 0.8, st) * smoothstep(1.3, 2.0, dI) * smoothstep(4.4, 2.8, dI) * (1.0 - outK) * calm * 0.6;
            /* 出口：越靠近岩簷口越快、白沫越多（最後 1～1.5 m） */
            float nearLip = smoothstep(uLip + 1.6, uLip + 0.1, vW.z);
            foam += outK * smoothstep(0.66 - 0.2 * nearLip, 0.8 - 0.2 * nearLip, n(vec2(vW.x * 6.5, vW.z * 1.2 + uT * (1.4 + 1.6 * nearLip))) * 0.7 + 0.3 * n(vec2(vW.x * 14.0, vW.z * 2.0 + uT * 2.6))) * (0.35 + 0.5 * nearLip);
            foam += smoothstep(0.08, 0.0, vE) * smoothstep(0.62, 0.78, n(vW.xz * 6.0 + uT * 0.2)) * 0.18 * (1.0 - chan);
                        foam = clamp(foam, 0.0, 1.0);
            float rip = n(vW.xz * 7.0 + uT * vec2(0.5, 0.35)) - n(vW.xz * 7.0 + 0.3 - uT * vec2(0.3, 0.45));
            vec3 vd = normalize(cameraPosition - vW); float fr = pow(1.0 - clamp(vd.y, 0.0, 1.0), 3.0);
            col += vec3(0.4, 0.55, 0.7) * (fr * 0.4 + 0.02) + vec3(1.0, 0.95, 0.85) * smoothstep(0.34, 0.46, rip) * 0.16 * smoothstep(0.0, 0.2, uSun.y);
            col = mix(col, vec3(0.65, 0.78, 0.76) * 1.25, foam);
            float al = max(mix(0.62, 0.985, smoothstep(0.3, 1.0, depth)), foam);
            gl_FragColor = vec4(col * lit, al * smoothstep(0.0, mix(0.03, 0.16, chan), vE + 0.01));
          }` })
      const pool2 = new THREE.Mesh(pg, pm); pool2.renderOrder = 3; pool2.name = 'midPool'; g.add(pool2)
      // 水道：水潭前面的缺口 → 岩簷口（接下段瀑布）。一片斜斜的薄水，流得比瀑布慢
      { const P2 = [], E2 = [], I2 = [], N = 6, M = 6, z0 = MP.z - MP.rz * 0.9, zE = fz - 1.25   // zE＝岩棚的前緣
        pm.uniforms.uOut.value.z = z0; pm.uniforms.uLip.value = zE
        for (let k = 0; k <= N; k++) for (let m = 0; m <= M; m++) { const t = k / N, u = m / M, z = z0 + (zE - z0) * t, w = 1.5 + 0.15 * t; P2.push(F.x + (u * 2 - 1) * w, MP.y - 0.03 * t, z); E2.push(Math.sin(u * Math.PI) * 0.6) }
        for (let k = 0; k < N; k++) for (let m = 0; m < M; m++) { const a = k * (M + 1) + m, b = a + 1, c2 = a + M + 1, d2 = c2 + 1; I2.push(a, c2, b, b, c2, d2) }
        const fg = new THREE.BufferGeometry(); fg.setAttribute('position', new THREE.Float32BufferAttribute(P2, 3)); fg.setAttribute('aEdge', new THREE.Float32BufferAttribute(E2, 1)); fg.setIndex(I2)
        const m = new THREE.Mesh(fg, pm); m.renderOrder = 4; m.name = 'midChannel'; g.add(m)
        // 過了岩棚前緣：水往下彎、變成一片白白的水簾，接到下段瀑布的頂（用瀑布的材質；第一版整段用水潭的材質，懸在空中像一塊玻璃板）
        const P3 = [], U3 = [], I3 = [], N3 = 8
        for (let k = 0; k <= N3; k++) { const t = k / N3, z = zE + 0.25 + (zLipW - zE - 0.25) * t, w = 1.6 + 0.25 * t, y = lerpN(MP.y - 0.02, shelfY - 0.4, Math.pow(t, 1.7)); P3.push(F.x - w, y, z, F.x + w, y, z); U3.push(0, t, 1, t); if (k) { const a = (k - 1) * 2; I3.push(a, a + 1, a + 2, a + 1, a + 3, a + 2) } }
        const g3 = new THREE.BufferGeometry(); g3.setAttribute('position', new THREE.Float32BufferAttribute(P3, 3)); g3.setAttribute('uv', new THREE.Float32BufferAttribute(U3, 2)); g3.setIndex(I3)
        const m3 = new THREE.Mesh(g3, fallMat({ spd: 0.5, a: 0.9, dark: 0.25 })); m3.renderOrder = 5; m3.name = 'midSpill'; g.add(m3) }
      // 水潭邊的岩石（掃描的真岩石）：圍一圈、高出水面 0.2～0.6 m；前面的出水口留 3 m、後面是岩壁不用放；水裡兩三顆露出來
      if (lib) {
        const names = ['boulder', 'mrock_3', 'mrock_5', 'mrock_8'].filter((n) => lib[n]), list = Object.fromEntries(names.map((n) => [n, []]))
        const SHP = TR.pts.filter((_, i) => TR.kind[i] === 'shelf'), offPath = (x, z, r) => SHP.every(([px, pz]) => Math.hypot(px - x, pz - z) > r)   // 岩棚上那一圈步道：石頭、蕨不能擺在路上
        const put = (x, z, top, big) => { if (!offPath(x, z, 1.25)) return; const n = big && lib.boulder ? 'boulder' : names[1 + Math.floor(rnd() * (names.length - 1))] ?? names[0], k2 = n === 'boulder' ? 0.16 + rnd() * 0.1 : 0.26 + rnd() * 0.26   /* 0.5～1.0 m（第一版 1.5 m 一顆，把水潭整個蓋住） */
          list[n].push({ p: V(x, shelfY - 0.14 * k2, z), q: new THREE.Quaternion().setFromEuler(new THREE.Euler(rnd() * 0.3, rnd() * TAU, rnd() * 0.3)), s: V(k2, k2 * (0.75 + top), k2) }) }   // 石頭的原點在底部：坐在岩棚上、埋一點（第二版照中心算、浮在水面上）
        for (let i = 0; i < 60; i++) {
          const a = (i + rnd() * 0.6) / 60 * TAU, [ex, ez] = mpRim(a)
          if (ez > zUp - 0.5) continue                                         // 後面貼著岩壁
          if (ez < MP.z - MP.rz * 0.6 && Math.abs(ex - F.x) < 1.65) continue   // 出水口
          const rr = 1.0 + rnd() * 0.1; put(MP.x + (ex - MP.x) * rr, MP.z + (ez - MP.z) * rr, 0.2 + rnd() * 0.4, rnd() < 0.3)
        }
        // 跨過出水口的踏腳石（扁的掃描石頭，頂面比水面高一點）
        { const FH = { mrock_10: 0.77, mrock_12: 0.74, mrock_7: 0.74 }, fn = Object.keys(FH).filter((n) => lib[n]), sl = {}
          fn.length && [198.75, 199.65, 200.5, 201.4].forEach((sx, k) => { const n = fn[k % fn.length], sc = 0.5 + 0.08 * (k % 2), near = SHP.filter(([px]) => Math.abs(px - sx) < 0.6 && true).sort((a, b) => a[1] - b[1])[0]; (sl[n] ||= []).push({ p: V(sx, shelfY - FH[n] * sc * 0.55 + 0.22, near ? near[1] : YOSE.base(sx) + 0.8), q: new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), k * 1.7), s: V(sc, sc * 0.55, sc) }) })
          for (const [n, l3] of Object.entries(sl)) scatter(g, lib[n], l3, { cast: true }) }
        put(MP.x - 2.1, MP.z - 0.6, 0.25, true); put(MP.x + 2.3, MP.z + 0.3, 0.18, false); put(MP.x + 1.2, MP.z - 1.3, 0.12, false)   // 水裡露出來的
        for (const n of names) if (list[n].length) scatter(g, lib[n], list[n], { cast: true })
        // 蕨類：長在後面岩壁腳、岩石後面背水的縫裡（8 叢）；落點和出水口不長
        { const ferns = ['fern_sa', 'fern_sb', 'fern2_b', 'fern2_c', 'fern_a'].filter((n) => lib[n]), fl = {}
          for (const [dx, dz, k3] of [[-5.3, 1.2, 1.0], [-4.9, -0.4, 0.7], [-5.6, 2.2, 1.2], [5.6, 1.4, 1.1], [5.1, -0.3, 0.75], [5.9, 2.3, 0.9], [-3.4, -3.1, 0.6], [3.9, -3.0, 0.65]]) if (ferns.length && offPath(MP.x + dx, Math.min(zUp - 0.4, MP.z + dz), 1.3)) (fl[ferns[Math.floor(rnd() * ferns.length)]] ||= []).push({ p: V(MP.x + dx, shelfY - 0.04, Math.min(zUp - 0.4, MP.z + dz)), q: new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), rnd() * TAU), s: V(k3, k3, k3) })
          for (const [n, l2] of Object.entries(fl)) scatter(g, lib[n], l2, { cast: true }) }
      }
    }
    // 岩棚前緣的欄杆（水潭前面那段步道外側；出水口上面不立柱）
    { const pp = [], sg = [], ironL = new THREE.MeshStandardMaterial({ color: 0x33363a, roughness: 0.5, metalness: 0.6 }); let prev = null
      for (let x = 193.6; x <= 208.4; x += 1.2) { const p = V(x, shelfY, YOSE.base(x) - 0.25); if (Math.abs(x - F.x) < 1.9) { prev = null; continue } pp.push(p); addCollider(p.x, p.z, 0.12, p.y + 1.1, p.y - 0.4); if (prev) sg.push([prev, p]); prev = p }
      for (let x = 193.6; x <= 208.4; x += 0.45) addCollider(x, YOSE.base(x) - 0.45, 0.3, shelfY + 1.2, shelfY - 0.5)   // 整條前緣擋住（出水口那 3 m 也是）
      const pm2 = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.03, 0.03, 1.1, 6).translate(0, 0.55, 0), ironL, pp.length); pp.forEach((p, k) => pm2.setMatrixAt(k, new THREE.Matrix4().makeTranslation(p.x, p.y, p.z))); g.add(pm2)
      const rm = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.022, 0.022, 1, 5).rotateZ(Math.PI / 2), ironL, sg.length * 2), q4 = new THREE.Quaternion()
      sg.forEach(([a, b], k) => { const d = b.clone().sub(a), L = d.length(); q4.setFromUnitVectors(V(1, 0, 0), d.clone().normalize()); for (const [j, hh] of [[0, 1.05], [1, 0.55]]) rm.setMatrixAt(k * 2 + j, new THREE.Matrix4().compose(a.clone().add(b).multiplyScalar(0.5).add(V(0, hh, 0)), q4, V(L, 1, 1))) })
      g.add(rm) }
    // 下段
    const yLipW = shelfY - 0.4
    tier(yLipW, poolY, zLipW, 1.8, 5.4, 0.1, 2.0, fallMat({ spd: 0.7, a: 0.5, dark: 0.35 }), 3)
    tier(yLipW, poolY, zLipW, 2.0, 6.2, 0.25, 3.0, fallMat({ spd: 1.0, a: 0.95 }), 4)
    tier(yLipW, poolY, zLipW, 2.3, 6.8, 0.6, 3.8, fallMat({ spd: 1.35, a: 0.42, low: 1 }), 5, 0.3)
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
    const poolM = new THREE.MeshStandardMaterial({ color: 0x16604e, roughness: 0.06, metalness: 0.12, transparent: true, opacity: 0.74 })   /* 2026-11-12 ChatGPT：不透明的土耳其藍像油漆 → 深一點的翡翠綠、透一點（看得到岸邊水下的石頭） */   // 2026-11-12 翡翠綠（參考照的水色）
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
    // 2026-11-13 凹槽也是湖：一條沿著岩壁的水面（從牆腳前 3 m 到凹槽最裡面），跟湖同一個材質、同一個高度；岩架比水面高，自然蓋住後面那一截
    { const P = [], I = [], C0 = YOSE.cave; let n = 0
      for (let x = C0.x0; x <= C0.x1 + 1e-6; x += 0.5) { const b = YOSE.base(x), D = YOSE.caveD(x); P.push(x, LK.water + 0.004, b - 3.2, x, LK.water + 0.004, b + D + 0.3); if (n) { const a = (n - 1) * 2; I.push(a, a + 2, a + 1, a + 1, a + 2, a + 3) } n++ }
      const rg = new THREE.BufferGeometry(); rg.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); rg.setIndex(I); rg.computeVertexNormals()
      { const nn = rg.attributes.normal; for (let k = 0; k < nn.count; k++) nn.setXYZ(k, 0, 1, 0) }
      const rw = new THREE.Mesh(rg, poolM); rw.renderOrder = pool.renderOrder; rw.name = 'recessWater'; g.add(rw) }
    const foamT = (() => { const c = document.createElement('canvas'); c.width = c.height = 256; const x = c.getContext('2d'), r = mulberry32(9); for (let i = 0; i < 1600; i++) { const a = r() * TAU, d = Math.pow(r(), 0.7) * 120; x.fillStyle = `rgba(255,255,255,${(0.1 + r() * 0.45) * (1 - d / 130)})`; x.beginPath(); x.arc(128 + Math.cos(a) * d, 128 + Math.sin(a) * d, 1 + r() * 5, 0, TAU); x.fill() } const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t })()
    for (const [k, sc] of [[0, 6.5], [1, 4.2]]) {
      const fm = new THREE.Mesh(new THREE.CircleGeometry(1, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: foamT, transparent: true, depthWrite: false, opacity: 0.8 }))
      fm.scale.set(sc, 1, sc * 0.6); fm.position.set(F.x, poolY + 0.02 + k * 0.01, fz - 3.2); fm.userData = { sc, k }; fm.renderOrder = 2; g.add(fm); foams.push(fm)
    }
    // 水霧：大片、慢慢飄、有的往步道那邊飄過來
    const mistT = mistTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'); const gr = x.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = gr; x.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c) })()
    for (let k = 0; k < 26; k++) { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: mistT, transparent: true, depthWrite: false, opacity: 0.4 })); const p0 = V(F.x + (rnd() - 0.5) * 11, poolY + 0.6 + rnd() * 9, fz - 2.8 - rnd() * 4); sp.position.copy(p0); sp.scale.setScalar(4 + rnd() * 6); sp.userData = { ph: rnd() * TAU, p0 }; sp.renderOrder = 6; g.add(sp); mist.push(sp) }
    for (let k = 0; k < 9; k++) { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: mistT, transparent: true, depthWrite: false, opacity: 0.3 })); const p0 = V(F.x + (rnd() - 0.5) * 5, SHELF_Y + 0.6 + rnd() * 3.2, fz + YOSE.rec(F.x) - 1.2 - rnd() * 2.2); sp.position.copy(p0); sp.scale.setScalar(2.2 + rnd() * 3); sp.userData = { ph: rnd() * TAU, p0, op: 0.75 }; sp.renderOrder = 6; g.add(sp); mist.push(sp) }   // 2026-11-12 中段水潭上面的水霧（落點 2～3 m 內濃）
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
          cov = max(cov, (1.0 - abs(upF)) * smoothstep(0.6, 0.75, nn) * 0.4);
          vec3 mossC = mix(vec3(0.05, 0.1, 0.022), vec3(0.16, 0.23, 0.05), nf);
          diffuseColor.rgb = mix(diffuseColor.rgb, mossC * (0.7 + 0.6 * nz), cov * 0.7);
          /* 側面一條條細的層理（頁岩一片片的斷面） */
          float lam = vfbm(vec2(vTpW.y * 34.0, (vTpW.x + vTpW.z) * 0.7)), lam2 = vfbm(vec2(vTpW.y * 9.0 + 3.0, (vTpW.x - vTpW.z) * 0.4));
          diffuseColor.rgb *= 1.0 - (1.0 - smoothstep(0.3, 0.7, abs(upF))) * (0.34 * smoothstep(0.5, 0.72, lam) + 0.22 * smoothstep(0.45, 0.7, lam2)) * (1.0 - cov); }`) }
    }
    stepM.customProgramCacheKey = () => 'stepTriplanar3'
    STEP_MAT = stepM
    const C3 = [], TAN = [], SIDE = [], UP = V(0, 1, 0)
    for (let i = 0; i < NP; i++) C3.push(V(st.pts[i][0], st.yy[i], st.pts[i][1]))
    for (let i = 0; i < NP; i++) { const t = C3[Math.min(NP - 1, i + 1)].clone().sub(C3[Math.max(0, i - 1)]).normalize(); TAN.push(t); SIDE.push(V().crossVectors(t, UP).normalize()) }
    const STEPS = []
    // 石階踏板：整條路每 0.42 m 一塊
    { const N = Math.floor(st.L / 0.42), bg = new THREE.BoxGeometry(2.5, 0.6, 0.47), tm = new THREE.InstancedMesh(bg, stepM, N), q = new THREE.Quaternion(), c = new THREE.Color()
      bg.setAttribute('color', new THREE.BufferAttribute(new Float32Array(bg.attributes.position.count * 3).fill(1), 3))
      let ii = 1
      for (let n = 0; n < N; n++) {
        const s0 = (n + 0.5) * 0.42; while (ii < NP - 1 && st.S[ii] < s0) ii++
        const t = (s0 - st.S[ii - 1]) / Math.max(1e-6, st.S[ii] - st.S[ii - 1]), p = C3[ii - 1].clone().lerp(C3[ii], t), tn = TAN[ii]
        const slope = (st.yy[ii] - st.yy[ii - 1]) / Math.max(1e-6, st.S[ii] - st.S[ii - 1])
        const yTop = slope > 0.05 ? Math.floor(p.y / 0.16) * 0.16 + 0.1 : p.y + 0.02
        // 2026-11-12 ChatGPT V3（石階太新太整齊）：每一階轉一點、前後深淺差一點、左右錯開幾公分，顏色深淺差 ±13%、偏黃偏灰都有
        const h1 = hsh(n * 3.1 + 1), h2 = hsh(n * 5.7 + 2), h3 = hsh(n * 7.3 + 3), h4 = hsh(n * 11.9 + 4), h5 = hsh(n * 2.3 + 5)
        q.setFromAxisAngle(UP, Math.atan2(tn.x, tn.z) + (h1 - 0.5) * 0.09)
        const gal = st.kind[ii] === 'gal', alc = st.kind[ii] === 'alc', shf = st.kind[ii] === 'shelf', wet = shf && p.x > 198.3 && p.x < 201.9 && p.z < YOSE.base(p.x) + 3, so = (h3 - 0.5) * (gal || alc ? 0.04 : 0.1) + (gal ? (SIDE[ii].z < 0 ? 1 : -1) * 0.3 : 0)   // 階地：踏板只鋪到內側的石壁（寬 1.8 m，往外移 0.27）
        tm.setMatrixAt(n, m4.compose(V(p.x + SIDE[ii].x * so, yTop - 0.3 - h5 * 0.012, p.z + SIDE[ii].z * so), q, V(wet ? 0.0001 : gal ? 0.86 : alc ? 0.75 : shf ? 0.62 : 1, 1, 0.93 + 0.12 * h2)))   /* 折返平台：踏板窄一點（2.5 m 寬的踏板在半徑 0.85 m 的彎上互相戳出來，像貼在岩壁上的大石塊） */
        const kk = 0.87 + 0.26 * h4, wm = (h5 - 0.5) * 0.08
        tm.setColorAt(n, c.setRGB(1.0 * kk + wm, 0.9 * kk, 0.74 * kk - wm))
        STEPS.push({ m: m4.clone(), c: c.clone() })
      }
      tm.castShadow = true; tm.receiveShadow = true; tm.computeBoundingSphere(); tm.name = 'gorgeSteps'; g.add(tm)
    }
    // 外側的欄杆（靠湖那一側）：折返平台用鐵管欄杆、一般路段的鐵樁和鐵鍊記在 CHAIN
    { const ironR = new THREE.MeshStandardMaterial({ color: 0x33363a, roughness: 0.5, metalness: 0.6 }), pp = [], segs = []
      let acc = 9, prev = null
      for (let i = 1; i < NP; i++) {
        const k = st.kind[i], open = k === 'gal' || k === 'alc' || (k === 'open' && st.pts[i][0] > 189.5)   /* 2026-11-13 凹槽裡的岩架步道（湖那一側）也要欄杆 */
        if (!open) { prev = null; acc = 9; continue }
        acc += st.S[i] - st.S[i - 1]; if (acc < 1.35) continue
        acc = 0
        const sd = SIDE[i].z < 0 ? 1 : -1
        const p = C3[i].clone().addScaledVector(SIDE[i], sd * 1.2)
        // 2026-11-12 ChatGPT：整條黑鐵管欄杆像都市樓梯 → 折返平台前後才用鐵管欄杆，一般路段是鑿進岩石的鐵樁＋垂鍊（Angels Landing），賞鳥台外緣是矮石牆
        if ((st.bays ?? []).some((b) => Math.abs(C3[i].x - b.x) < b.half + 0.2 && Math.abs(C3[i].y - b.y) < 0.8)) { prev = null; continue }
        let sturdy = false; for (let q = Math.max(0, i - 3); q <= Math.min(NP - 1, i + 3); q++) if (st.kind[q] === 'alc' || st.kind[q] === 'top') sturdy = true
        p.sturdy = sturdy
        if (prev && prev.distanceTo(p) < 3.8) (sturdy || prev.sturdy ? segs : CHAIN.segs).push([prev, p])
        ;(sturdy ? pp : CHAIN.posts).push(p); prev = p
      }
      if (pp.length) {
        const pm2 = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.03, 0.03, 1.1, 6).translate(0, 0.55, 0), ironR, pp.length)
        pp.forEach((p, k) => pm2.setMatrixAt(k, m4.makeTranslation(p.x, p.y, p.z))); pm2.castShadow = true; g.add(pm2)
        const rg = new THREE.CylinderGeometry(0.022, 0.022, 1, 5).rotateZ(Math.PI / 2), rm = new THREE.InstancedMesh(rg, ironR, segs.length * 2), q = new THREE.Quaternion()
        segs.forEach(([a, b], k) => { const d = b.clone().sub(a), L = d.length(); q.setFromUnitVectors(V(1, 0, 0), d.clone().normalize()); for (const [j, hh] of [[0, 1.05], [1, 0.55]]) rm.setMatrixAt(k * 2 + j, m4.compose(a.clone().add(b).multiplyScalar(0.5).add(V(0, hh, 0)), q, V(L, 1, 1))) })
        g.add(rm)
      }
    }
    // Blender 做的石板踏板（tools/make-gorge-rock-kit.py 裡的 step_a～d；同一份套件裡的岩拱、岩棚、緣石、掛燈是隧道用的，2026-11-12 隧道拆掉後不再用）：四種輪流、一半轉 180 度，載好就換掉上面的方塊
    new GLTFLoader().loadAsync(`models/props/gorge_rock_kit.glb?v=${VER}`).then((gl) => {
      const K = {}
      gl.scene.traverse((o) => { if (!o.isMesh) return; const ge = o.geometry.clone(); o.updateWorldMatrix(true, false); ge.applyMatrix4(o.matrixWorld); if (!ge.attributes.color && ge.attributes.color_1) ge.setAttribute('color', ge.attributes.color_1); K[o.name] = ge })
      const inst = (geo, list, mat, shadow = true) => { if (!geo || !list.length) return null; const im = new THREE.InstancedMesh(geo, mat, list.length); list.forEach((e, k) => { im.setMatrixAt(k, e.m); if (e.c) im.setColorAt(k, e.c) }); im.castShadow = shadow; im.receiveShadow = true; im.computeBoundingSphere(); g.add(im); return im }
      // 踏板：四種石板輪流用，一半轉 180 度
      { const names = ['step_a', 'step_b', 'step_c', 'step_d'].filter((n) => K[n]), lists = names.map(() => []), flip = new THREE.Matrix4().makeRotationY(Math.PI)
        if (names.length) {
          STEPS.forEach((e, n) => { const k = Math.floor(hsh(n * 3.7 + 1) * names.length) % names.length; lists[k].push({ m: hsh(n * 9.1) < 0.5 ? e.m.clone().multiply(flip) : e.m, c: e.c }) })
          names.forEach((n, k) => { const im = inst(K[n], lists[k], stepM); if (im) im.name = 'gorgeSteps_' + n })
          const old = g.getObjectByName('gorgeSteps'); if (old) { g.remove(old); old.geometry.dispose() }
        } }
    }).catch((e) => console.error('gorge rock kit', String(e?.stack ?? e)))
    // 岩壁頂上：觀景台（瀑布口東邊）欄杆＋後面不能走出去
    const ironM = new THREE.MeshStandardMaterial({ color: 0x3b3d3f, roughness: 0.5, metalness: 0.6 }), posts = []
    for (let x = 201.4; x < 250; x += 0.9) if (x < 236.4 || x > 243.2) posts.push(V(x, YOSE.topY(x), YOSE.topFront(x) + 0.15))   /* 2026-11-12 新的崖壁步道從 x 237～243 上來 */   // 2026-11-12 前緣整排欄杆，步道上來的地方（x 210～214）留開口
    for (let z = YOSE.topFront(201.4) + 0.15; z < YOSE.edge(201.4) - 2.2; z += 0.9) posts.push(V(201.3, YOSE.topY(201.3), z))   // 西邊（溪那側）
    for (const p of posts) addCollider(p.x, p.z, 0.2, p.y + 1.1, p.y)
    for (let x = 201.2; x < 251; x += 1) addCollider(x, YOSE.edge(x) - 1.9, 0.35, topYm + 3, topYm - 1.5)   // 2026-11-12 加底：沒有底的碰撞體會連岩體裡的隧道步道一起擋住
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
        const [spx, spz] = EAST.spring, back = (x) => YOSE.edge(x) - 6.5 + 1.2 * Math.min(1, Math.max(0, (x - 211) / 3))   /* 2026-11-13 步道加寬、最上層退得更深：x 214 以東的溪往後移 1.2 m，不然溪在岩壁頂的邊緣外面 */   // 平台後緣那一條（edge-4.5 以後）種了一排松樹：溪走在樹前面
        const groundY = (x, z) => x <= 249.5 ? YOSE.topY(x) : alpineHeight(x, z)
        const POOL = { x: 241, z: 120.1, rx: 3.4, rz: 2.0 }   // 2026-11-13 往後 1.5 m、縮小一點（前緣退進來了）
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
  for (let k = 0; k < 4000 && PINES.length < 30; k++) {   /* 2026-11-13 凹槽變湖：下面另外擋湖裡 */
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
        for (const [dxe, k2] of []) {   // 2026-11-12 出口改往西北之後這兩顆大石頭壓在最上面那段石階的頭上（影片裡鏡頭直接穿進石頭）→ 拿掉；出口旁邊溪潭的石頭就夠了
          const x = Math.min(249.2, e[0] + dxe * -Math.sign(ux)), z = YOSE.topFront(x) + 1.1   // 2026-11-12 擺在出口再過去那一側（新步道是往東上來的，舊的往西）
          gate[big].push({ p: V(x, YOSE.topY(x) - 0.35 * k2, z), q: new THREE.Quaternion().setFromEuler(new THREE.Euler(rnd() * 0.2, rnd() * TAU, rnd() * 0.2)), s: V(k2, k2 * 1.25, k2 * 0.8) })
          addCollider(x, z, 0.42 * k2, YOSE.topY(x) + k2, YOSE.topY(x) - 1.5)
        }
        scatter(g, lib[big], gate[big], { cast: true })
        const out = Object.fromEntries(names.map((n) => [n, []]))
        for (let k = 0, n = 0; k < 400 && n < 8; k++) {
          const x = 204 + rnd() * 44, zf = YOSE.topFront(x) + 2.5, ze = YOSE.edge(x) - 3, z = zf + rnd() * (ze - zf)
          if (ze < zf + 1 || Math.hypot(x - SHELTER.x, z - SHELTER.z) < 6 || Math.hypot(x - e[0], z - e[1]) < 9 || alpineTrailDist(x, z) < 2) continue
          const k2 = 1.0 + rnd() * 0.8, nm = names[Math.floor(rnd() * names.length)]
          out[nm].push({ p: V(x, YOSE.topY(x) - 0.45 * k2, z), q: new THREE.Quaternion().setFromEuler(new THREE.Euler(rnd() * 0.25, rnd() * TAU, rnd() * 0.25)), s: V(k2 * 1.3, k2 * 0.7, k2) }); n++
          addCollider(x, z, 0.55 * k2, YOSE.topY(x) + 0.4 * k2, YOSE.topY(x) - 1.5)
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
      addCollider(p.x, p.z, R * 1.1, p.y + p.H, p.y - 1.5)
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
      // 2026-11-12 使用者：走到瀑布後面就是死路，往上的步道接不過去——平台那半圈欄杆剛好橫在上山步道（YOSE.stairs）的起點上，欄杆柱擋在路中間。
      // 上山步道頭 14 個點兩側 1.5 m 內不立欄杆（開一個口，從平台直接走上去）
      const stP = YOSE.stairs().pts.slice(0, 15)
      const onStairs = (x, z) => { for (let i = 1; i < stP.length; i++) { const [ax, az] = stP[i - 1], [bx, bz] = stP[i], dx = bx - ax, dz = bz - az, t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz))); if (Math.hypot(x - ax - dx * t, z - az - dz * t) < 1.5) return true } return false }
      for (const [x, z] of rail) {
        if (onStairs(x, z)) { prev = null; continue }
        // 轉彎處相鄰兩段的柱子會擠進走道（量到離中線只有 0.5 m）：離岩窟步道中線不到 0.95 m 的柱子不立
        if (P.some((q, i) => { if (!i) return false; const [ax, az] = P[i - 1], [bx, bz] = q, dx = bx - ax, dz = bz - az, t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz))); return Math.hypot(x - ax - dx * t, z - az - dz * t) < 0.95 })) continue
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
  function tick(t) {
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
  // 2026-11-12 崖壁步道套件（tools/make-cliff-kit.py，ChatGPT 崖壁步道 V1 的修正）：鐵樁＋垂鍊、賞鳥台的矮石牆和平台、長在岩簷上的扭曲松樹
  new GLTFLoader().loadAsync(`models/props/cliff_kit.glb?v=${VER}`).then((gl) => {
    const K = {}; gl.scene.updateMatrixWorld(true)
    gl.scene.traverse((o) => { if (o.isMesh) { const ge = o.geometry.clone(); ge.applyMatrix4(o.matrixWorld); if (ge.attributes.color_1) { ge.setAttribute('color', ge.attributes.color_1); ge.deleteAttribute('color_1') } K[o.name] = ge } })
    const iron = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.75 })
    const stone = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.93 })
    const bark = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 })
    const needle = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 })
    needle.side = THREE.DoubleSide; needle.color.setScalar(2.6); stone.color.setRGB(1.55, 1.5, 1.4); bark.color.setScalar(1.5)   // 頂點色是照 Blender 的亮度給的，遊戲裡的光比較暗：調到跟旁邊的松樹、砂岩一樣亮
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), bm = new THREE.Matrix4(), UP = V(0, 1, 0)
    const inst = (geo, mat, list, name, cast = true) => { if (!geo || !list.length) return; const im = new THREE.InstancedMesh(geo, mat, list.length); list.forEach((m, i) => im.setMatrixAt(i, m)); im.castShadow = cast; im.receiveShadow = true; im.frustumCulled = false; im.name = name; g.add(im) }
    // 鐵樁、鐵鍊（鍊子兩端掛在樁頂的環上，高 0.92；零件長 1、垂 7 cm → 拉到柱距、垂度放大到約 12 cm）
    inst(K.chain_post, iron, CHAIN.posts.map((p) => new THREE.Matrix4().makeTranslation(p.x, p.y, p.z)), 'cliffChainPosts')
    inst(K.chain_span, iron, CHAIN.segs.map(([a, b]) => { const X = b.clone().sub(a), L = X.length(); X.normalize(); const Z = V().crossVectors(X, UP).normalize(), Y = V().crossVectors(Z, X); return new THREE.Matrix4().compose(V(a.x, a.y + 0.92, a.z), q.setFromRotationMatrix(bm.makeBasis(X, Y, Z)), V(L, 1.7, 1)) }), 'cliffChains')
    for (const p of CHAIN.posts) addCollider(p.x, p.z, 0.1, p.y + 1.1, p.y - 0.4)
    // 賞鳥台：平的石板地（往岩壁裡 1.9 m）＋外緣三段矮石牆（留縫，鏡頭可以從牆頭上拍）
    const T = YOSE.stairs(), par = { parapet_a: [], parapet_b: [] }
    const slabM = new THREE.MeshStandardMaterial({ color: new THREE.Color(0.46, 0.40, 0.31), roughness: 0.92 })
    for (const b of T.bays ?? []) {
      // 岩壁是斜的（每往東 1 m 往北約 0.55 m）：平台、矮牆都照岩壁的方向擺
      const zAt = (x) => YOSE.base(x) + b.d, ang = Math.atan2(zAt(b.x + 1) - zAt(b.x - 1), 2), ca = Math.cos(ang), len = (b.half * 2 + 0.3) / ca
      const slab = new THREE.Mesh(K.bay_floor ?? new THREE.BoxGeometry(4.9, 0.3, 3.6).translate(0, -0.15, 0), STEP_MAT ?? slabM); slab.scale.set(len / 4.9, 1, (b.depth + 2.0) / 3.6); slab.position.set(b.x - Math.sin(ang) * ((b.depth + 2.0) / 2 - 1.3), b.y + 0.065, zAt(b.x) + ca * ((b.depth + 2.0) / 2 - 1.3)); slab.rotation.y = -ang; slab.receiveShadow = true; slab.name = 'bay_' + b.name; g.add(slab)
      ;[-1.65, -0.55, 0.55, 1.65].forEach((dx, k) => { const x = b.x + dx * ca; par[k % 2 ? 'parapet_b' : 'parapet_a'].push(new THREE.Matrix4().compose(V(x + Math.sin(ang) * 1.2, b.y + 0.02, zAt(x) - ca * 1.2), q.setFromAxisAngle(UP, -ang + (k === 1 || k === 2 ? Math.PI : 0)), V(0.95, 1, 1))) })
      for (let dx = -b.half; dx <= b.half; dx += 0.5) { const x = b.x + dx; addCollider(x + Math.sin(ang) * 1.2, zAt(x) - ca * 1.2, 0.24, b.y + 0.9, b.y - 0.5) }
    }
    inst(K.parapet_a, stone, par.parapet_a, 'bayParapetA'); inst(K.parapet_b, stone, par.parapet_b, 'bayParapetB')
    // 崖壁上的樹（位置、枝梢在 layout.js YOSE.cliffTrees()；鳥的站點也用同一份）
    const byModel = {}
    for (const t of YOSE.cliffTrees()) (byModel[t.model] ||= []).push(new THREE.Matrix4().compose(V(t.x, t.y, t.z), q.setFromAxisAngle(UP, t.yaw), V(t.s, t.s, t.s)))
    for (const [n, list] of Object.entries(byModel)) { inst(K[n], bark, list, 'cliff_' + n); inst(K[n + '_needles'], needle, list, 'cliff_' + n + '_needles') }
  }).catch((e) => console.error('cliff kit', String(e?.stack ?? e)))
  return { group: g, tick, pines: PINES }
}
const mist = [], foams = []
let mistTex = null
let sprayU = null
