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
// 2026-11-14 使用者「跟 ChatGPT 要高品質的 natural rock texture」：ChatGPT 生的層狀砂岩貼圖（tools/make-rock-tex.py 做成無縫 1024）。
// 一張 ＝ 4 m × 4 m 的岩壁；岩壁、步道大岩塊、東頭陡山脊都照世界座標貼（只用兩個側面投影）
let _rockTex = null
export function rockTex() {
  if (_rockTex) return _rockTex
  _rockTex = new THREE.TextureLoader().load(`models/props/rock_sand_col.jpg?v=${new URL(import.meta.url).searchParams.get('v') ?? ''}`)
  _rockTex.colorSpace = THREE.SRGBColorSpace; _rockTex.wrapS = _rockTex.wrapT = THREE.RepeatWrapping; _rockTex.anisotropy = 8
  return _rockTex
}
export const GLSL_ROCK = `
  vec3 rockSample(sampler2D t, vec3 p, vec3 n) {   // 側面兩個投影（沿 x 的牆用 xy、沿 z 的牆用 zy），4 m 一張；垂直方向不鏡像
    vec2 w = pow(abs(n.xz), vec2(4.0)); w /= (w.x + w.y + 1e-4);
    return texture2D(t, vec2(p.z, p.y) * 0.25).rgb * w.x + texture2D(t, vec2(p.x, p.y) * 0.25).rgb * w.y;
  }`
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
  // 2026-11-13 Pass 1C（ChatGPT：改成優勝美地花崗岩）：使用者 11/12 指定過「整段 Watkins Glen 層狀岩壁」，兩種都做、讓使用者選——
  // 網址 ?rock=granite 或 localStorage birdpark.rock=granite 用花崗岩；預設維持層狀岩
  const GRANITE = (() => { try { return new URLSearchParams(location.search).get('rock') === 'granite' || localStorage.getItem('birdpark.rock') === 'granite' } catch { return false } })()
  // 2026-11-10 ChatGPT QA 第二輪：層厚不要固定（0.5～3.2 m 亂數）；每 6～12 m 一條主節理（直的深縫）；每 8～15 m 一片 2～5 m 寬的平整岩面；
  // 岩棚凸出 0.3～1.8 m；中尺度凹凸 0.03～0.12 m（波長 0.3～1.5 m）；每 15～25 m² 一塊凸出或缺掉的岩塊（0.4～1.5 m）
  const BED = [-30]; while (BED.at(-1) < 140) BED.push(BED.at(-1) + 0.5 + 2.7 * Math.pow(hsh(BED.length * 1.37), 1.4))
  const JX = [160]; while (JX.at(-1) < 230) JX.push(JX.at(-1) + 6 + 6 * hsh(JX.length * 2.11 + 5))
  const PAN = []; for (let x = 165; x < 225;) { x += 8 + 7 * hsh(x * 0.31); PAN.push([x, 2 + 3 * hsh(x * 0.77)]) }
  // 花崗岩：4～12 m 的大岩塊（兩組節理切出來：近垂直一組、斜的一組，方向各自偏一點）；每塊整片前後錯開、微微傾斜；
  // 塊裡有 1～4 m 的弧形剝落面（洋蔥狀一片片，邊緣一道淺階）；節理是深縫；水平岩棚很少
  const graniteAt = (x, y) => {
    const u = x + 0.18 * y + 3.2 * fbm2(x * 0.03, y * 0.025 + 3, 3), v = y * 0.82 - (0.25 + 0.35 * fbm2(x * 0.01 + 2, y * 0.01, 2)) * x + 5.0 * fbm2(x * 0.03 + 7, y * 0.025, 3)   // 節理不要是一條條等距的直線
    const su = 4.5 + 5.5 * hsh(Math.floor(v / 10) * 3.7 + 1), sv = 6 + 6 * hsh(Math.floor(u / su) * 2.3 + 5)
    const iu = Math.floor(u / su), iv = Math.floor(v / sv), fu = u / su - iu, fv = v / sv - iv, id = iu * 31 + iv * 7
    const lean = (hsh(id * 1.7) - 0.5) * 0.06
    let off = (hsh(id) - 0.62) * 1.25 + lean * (y - iv * sv) * 0.3
    const eu = Math.min(fu, 1 - fu) * su, ev = Math.min(fv, 1 - fv) * sv
    const joint = (0.32 + 0.3 * hsh(id * 3.1)) * Math.exp(-((eu / 0.2) ** 2)) + (0.18 + 0.2 * hsh(id * 5.3)) * Math.exp(-((ev / 0.16) ** 2))
    off += 0.18 * (1 - Math.exp(-eu * 0.9)) * (1 - Math.exp(-ev * 0.9))   // 塊的邊緣圓一點往裡收（風化）
    // 弧形剝落面：沿著塊的斜向一片片，每片 1～4 m，邊上一道 4～12 cm 的淺階
    const ex = (fu * su * 0.55 + fv * sv * 0.35) / (1.0 + 3.0 * hsh(id * 9.1)), ef = ex - Math.floor(ex)
    off += 0.22 * (1 - (ef * 2 - 1) ** 2) * hsh(id * 4.4) - 0.08 * ss(0.93, 1.0, ef)
    off += 0.12 * (fbm2(x * 1.1, y * 1.0, 3) - 0.5) + 0.04 * (fbm2(x * 3.7 + 3, y * 3.3, 2) - 0.5)
    const tone = 0.9 + 0.2 * hsh(id * 2.9)
    return { off: off + joint, ledge: ss(0.85, 0.98, fv) * ss(0.5, 0.0, Math.abs(fu - 0.5)) * 0.4 * (hsh(id * 6.6) > 0.7 ? 1 : 0), f: fv, tone, joint }
  }
  const bedAt = (x, y) => {
    if (GRANITE) return graniteAt(x, y)
    // 2026-11-13 Pass 1C（Watkins Glen 精修）：層界上下漂 ±1 m（20～40 m 一個起伏）→ 相鄰的層會互相收攏、變薄、像透鏡一樣在橫向消失，不再一條條橫跨整面岩壁
    const yy = y + 0.1 * (x - 195) + 1.2 * fbm2(x * 0.03, 2.2, 2) + 1.2 * (fbm2(x * 0.035 + 5, y * 0.018 + 9, 3) - 0.5)   /* ChatGPT：6～7 成的厚層要還認得出是連續的（2.2 → 1.2） */
    let lo = 0, hi = BED.length - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (BED[m] <= yy) lo = m; else hi = m }
    const id = lo, th = BED[hi] - BED[lo], f = (yy - BED[lo]) / th
    const jid = Math.floor((x + 3 * hsh(id)) / (2.5 + 3 * hsh(id + 7)))
    // 這層凸出多少：一半的層是凸出的岩棚（0.3～1.8 m），其他微凹
    // 差別侵蝕：頁岩（暗的層，tone 低）軟、被水和風化往裡吃 0.3～0.9 m；砂岩硬、懸出來，下緣變成岩簷（底下就是凹進去的頁岩）
    const shaleL = hsh(id * 3 + 1) < 0.42
    // 1C-Final：岩壁分區有疏有密（ChatGPT：約 5 成層理完整的安靜區、3 成差別侵蝕強、2 成節理破碎）
    const reg = fbm2(x * 0.022 + 31, y * 0.03 + 17, 2), calmR = ss(0.52, 0.42, reg), erodR = ss(0.5, 0.6, reg) * ss(0.72, 0.64, reg), fracR = ss(0.64, 0.72, reg)
    const prot = (shaleL ? 0.15 + 0.35 * hsh(id * 3 + 9) + (hsh(id * 13 + 4) > 0.85 ? 0.4 : 0) : -(0.2 + 1.2 * Math.pow(hsh(id * 5 + 2), 1.6))) * (1 - 0.45 * calmR + 0.6 * erodR)   // 頁岩一般內凹 0.15～0.5 m，少數重度侵蝕的到 0.9 m
    let off = prot + (hsh(id * 31 + jid) - 0.5) * 0.35 + 0.25 * Math.sin(f * Math.PI) * Math.min(1, th / 1.5) - 0.4 * ss(1 - Math.min(0.3, 0.35 / th), 1, f)
    if (!shaleL) off -= 0.22 * ss(0.3, 0.0, f)   // 砂岩層的下緣再往外一點：岩簷的滴水邊
    off *= 0.75 + 0.5 * fbm2(x * 0.06 + id, id * 0.7, 2)   // 同一層沿路凸出多少也不一樣
    // 平整岩面：這一段層理幾乎不見
    let pan = 0; for (const [px, pw] of PAN) pan = Math.max(pan, ss(pw / 2 + 0.8, pw / 2, Math.abs(x - px)))
    off *= 1 - 0.75 * pan
    // 主節理：直的深縫（深 0.2～0.7、寬約 0.15 m）
    let joint = 0; for (let i = 0; i < JX.length; i++) { const jx = JX[i] + 0.6 * Math.sin(y * 0.15 + i); joint = Math.max(joint, (0.2 + 0.5 * hsh(i * 3.3)) * Math.exp(-(((x - jx) / 0.14) ** 2))) }
    // 岩塊：4.5 m 一格，每格一塊凸出或缺損
    const ci = Math.floor(x / 4.5), cj = Math.floor(y / 4.5), bx = (ci + 0.2 + 0.6 * hsh(ci * 7 + cj * 13)) * 4.5, by = (cj + 0.2 + 0.6 * hsh(ci * 11 + cj * 3)) * 4.5, bs = 0.2 + 0.55 * hsh(ci * 5 + cj * 17)
    const inB = ss(bs + 0.12, bs, Math.max(Math.abs(x - bx), Math.abs(y - by) * 1.3))
    off += inB * (hsh(ci * 19 + cj) > 0.5 ? -0.45 : 0.4) * (0.5 + 1.3 * fracR)   // 破碎區：崩落的岩塊、缺口更多更深
    joint *= 0.7 + 1.1 * fracR
    off += 0.16 * (fbm2(x * 1.4, y * 1.3, 3) - 0.5) + 0.06 * (fbm2(x * 4.1 + 3, y * 3.7, 2) - 0.5)
    // 瀑布兩側 ±8 m：水長年切出來的直溝（寬 1～3 m、深 0.3～0.8 m）和幾個壺穴狀的圓凹
    { const dxF = x - YOSE.fall.x, fk2 = ss(8.5, 5.5, Math.abs(dxF)) * ss(1.5, 3.0, Math.abs(dxF))
      off += fk2 * 0.55 * Math.pow(0.5 + 0.5 * Math.sin(dxF * 2.6 + 0.8 * Math.sin(y * 0.13)), 2)
    }   // （壺穴：ChatGPT 說要在岩棚、潭底、舊水道上，不挖在乾的垂直岩壁 → 拿掉）
    const tone = (0.78 + 0.4 * hsh(id * 3 + 1)) * (0.92 + 0.16 * hsh(id * 17 + jid * 5)) * (1 - 0.12 * inB) * (0.9 + 0.2 * fbm2(x * 0.25 + id, y * 0.4, 2))   // 層內 2～5 m 的深淺變化
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
        // 2026-11-13 使用者（龍岩窟）：瀑布前後這一段改成有岩頂的廊道（高 3.6 m），不是往上整片挖開的階地——頭上是岩石、水簾在外側落下
        const roofed = x > YOSE.GAL[0] - 0.6 && x < YOSE.GAL[1] + 0.6 && y > YOSE.shelfY() - 1.0   // 只有那兩段岩廊（第 0 段的起點也在這個 x 範圍，但它在下面、不要加頂）
        out.push({ y0: y - (roofed ? 0.65 : 0.3), y1: roofed ? y + 3.6 : y + 90, depth: d + 1.25 })   // 岩廊多往地板下切 0.35 m：切口轉角那條岩壁的薄邊才會落在石板底下（以前在 x196～198 冒出地板 0.2～0.3 m）
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
      // 2026-11-13 Pass 1C：階地外牆再多一點天然岩層的起伏（ChatGPT：大片平滑立面像擋土牆）；踏面上下 0.35 m 內照舊不動
      const band = 0.35 * (0.5 + 0.5 * Math.sin(y * 2.1 + 1.3 * fbm2(x * 0.15, y * 0.3, 2) * 6.0))
      // 1C-Final（ChatGPT：外牆斷面太一致）：一段一段（3～8 m）不一樣——有的地方侵蝕掉一個 0.3～1.2 m 深的缺口（往裡，安全）；
      // 頭頂 2.6 m 以上有的地方是往外懸的大岩塊（0.4～1.2 m），踏面上方不往外凸，不會擋路
      const segN = fbm2(x * 0.17 + 3, Math.floor(y / 4) * 1.7, 2)
      const notch = ss(0.56, 0.7, segN) * (0.3 + 0.9 * fbm2(x * 0.45 + 11, y * 0.35, 2))
      return m * notch + m * (1.1 * chan   /* 驗收第 14 條：往外懸的岩塊（hang）在往上爬的階梯段會壓到路上、擋住半條路 → 拿掉，只留往裡凹的 */ + 0.8 * Math.max(0, Math.min(0.6, bo0)) + band * (0.4 + 0.6 * fbm2(x * 0.4 + 9, y * 0.2, 2))) - m2 * blk * (1 - chan) * (0.25 + Math.max(0, Math.min(0.5, -bo0)))
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
      const streak = Math.max(0, fbm2(px * 0.35, 7.1, 3) - (GRANITE ? 0.46 : 0.52)) * 3.2 * ss(g0, g0 + Ht, py) * (ri > FACE ? 0.1 : 1)   // 頂面不畫縱向水痕（會變一條條）
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
        const shl = GRANITE ? 0 : Math.min(1, Math.max(0, (1.0 - tone) * 3.2))
        let r0 = lerpN(lerpN(0.74, 0.42, shl), lerpN(0.25, 0.14, shl), wetF), g0c = lerpN(lerpN(0.58, 0.40, shl), lerpN(0.2, 0.15, shl), wetF), b0 = lerpN(lerpN(0.38, 0.35, shl), lerpN(0.14, 0.135, shl), wetF)
        if (GRANITE) { r0 = lerpN(0.66, 0.2, wetF); g0c = lerpN(0.64, 0.2, wetF); b0 = lerpN(0.6, 0.19, wetF) }   // 花崗岩：淺灰白（帶一點暖）、濕了深灰   // 乾砂岩再暖一點（底圖是灰的花崗岩貼圖，照規格的數字出來偏灰）
        { const iron = Math.max(0, fbm2(px * 0.21 + 11, py * 0.35 + 5, 3) - 0.6) * 2.4 * (1 - 0.6 * wetF) * (GRANITE ? 0.35 : 1); r0 = lerpN(r0, 0.5, iron * 0.5); g0c = lerpN(g0c, 0.19, iron * 0.5); b0 = lerpN(b0, 0.07, iron * 0.5) }
        r0 = lerpN(r0, 0.17, deep * 0.6); g0c = lerpN(g0c, 0.17, deep * 0.6); b0 = lerpN(b0, 0.155, deep * 0.6)   // 2026-11-13 Pass 1C：凹洞深處 0.11→0.17（ChatGPT：凹洞頂不能整片全黑）
        const crackD = 1 - 0.6 * Math.min(1, jnt * 2.2)
        { const sk = GRANITE ? 0.6 : 0.35; r0 *= tone * crackD * (1 - streak * sk); g0c *= tone * crackD * (1 - streak * sk); b0 *= tone * crackD * (1 - streak * sk) }   // 花崗岩的黑色水痕（water streak）更明顯
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
  const F0 = { x: YOSE.fall.x, zi: YOSE.base(YOSE.fall.x) - 3.5, py: YOSE.lake.water }, F0top = YOSE.topY(YOSE.fall.x)   // 濕岩範圍（落水帶、水簾）
  const cliffM = new THREE.MeshStandardMaterial({ map: graniteTex(), vertexColors: true, roughness: 0.86, side: THREE.DoubleSide })
  cliffM.userData.wetHook = true
  cliffM.onBeforeCompile = (sh) => {
    sh.uniforms.uPortal = { value: PORTALS }; sh.uniforms.uRock = { value: rockTex() }
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vTpW; varying vec3 vTpN;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvTpW = (modelMatrix * vec4(transformed, 1.0)).xyz; vTpN = normalize(mat3(modelMatrix) * objectNormal);')
    // 2026-11-10 使用者「低模」：加凹凸（用貼圖亮度當高度，螢幕空間導數擾動法線；不靠 UV）
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
      varying vec3 vTpW; varying vec3 vTpN; float tpH; uniform vec4 uPortal[6]; uniform sampler2D uRock;${GLSL_VNOISE}${GLSL_ROCK}
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
        #ifdef GRANITE
        { float sdist = length(vViewPosition), near = smoothstep(45.0, 6.0, sdist);
          // 花崗岩的礦物顆粒（1～8 cm）：黑雲母小黑點、長石的白點；高度也加一點，近看有顆粒感
          vec3 gp = vTpW * 22.0;
          float g1 = vn(gp.xy + gp.z * 0.71), g2 = vn(gp.zy * 1.9 + 5.0 + gp.x * 0.3), g3 = vn(vTpW.xz * 9.0 + vTpW.y * 3.1);
          float bio = smoothstep(0.78, 0.9, g1) * near, fel = smoothstep(0.8, 0.93, g2) * near;
          diffuseColor.rgb *= (1.0 - 0.45 * bio) * (1.0 + 0.18 * fel) * (0.94 + 0.12 * g3);
          // 大尺度的色斑（幾公尺一塊）：有的偏暖米色、有的偏冷灰，風化面亮、新鮮的崩落面暗一點
          float m1 = vn(vTpW.xy * 0.11 + vTpW.z * 0.07 + 13.0), m2 = vn(vTpW.zy * 0.23 + vTpW.x * 0.05 + 3.0);
          diffuseColor.rgb *= mix(vec3(0.86, 0.87, 0.9), vec3(1.12, 1.06, 0.96), m1) * (0.88 + 0.24 * m2);
          tpH += (g1 * 0.06 + g2 * 0.04 + g3 * 0.12) * near; }
        #else
        { float wallK = 1.0 - smoothstep(0.35, 0.75, abs(normalize(vTpN).y));
          float sdist = length(vViewPosition);
          // 2026-11-14 ChatGPT 的砂岩貼圖：垂直的岩面直接用它（顏色、層理、裂、地衣都在圖裡），下面那套程式畫的層理只留一點點
          vec3 rkC = rockSample(uRock, vTpW, normalize(vTpN));
          diffuseColor.rgb = mix(diffuseColor.rgb, rkC * 1.55, wallK);
          tpH += wallK * dot(rkC, vec3(0.33)) * 2.2;
          wallK *= 0.25;
          // 直的節理把岩壁切成 2～3 m 寬的一塊塊，每塊的層面上下錯開一點（不然整面像掃描線）；層的密度隨高度變（薄頁岩帶、厚砂岩帶交替）
          float cell = floor(vTpW.x / 3.3 + 0.37);   // 只看 x：混進 z 的話岩棚凹凸會讓格子來回跳，層線斷成一截一截的虛線
          // 層面只跟高度有關（加一點點沿 x 的起伏和每塊的錯位）：混進二維雜訊的話，層線會繞成一圈圈像木紋
          float vy = vTpW.y + 0.07 * sin(vTpW.x * 0.21) + 0.012 * (vTpW.x - 195.0) + 0.1 * fract(sin(cell * 17.3) * 4375.5);
          float u1 = vy * 0.85 + 0.9 * vn(vec2(vy * 0.45, 3.0));   /* 2026-11-14 概念圖：主岩層厚 0.35～1.4 m（以前每層 0.9 m 很整齊） */
          float b1 = fract(u1), h1 = fract(sin(floor(u1) * 78.233) * 43758.5453);
          // 每個厚層裡再分 1～6 片薄層（頁岩帶片數多、砂岩帶是整塊）
          float nThin = floor(1.0 + 5.99 * fract(h1 * 7.31)), u2 = b1 * nThin;
          float b2 = fract(u2), h2 = fract(sin((floor(u1) * 7.0 + floor(u2)) * 12.9898) * 43758.5453);
          float thin = smoothstep(75.0, 22.0, sdist);                         // 遠處薄層糊掉（比像素細，會閃）
          float cont = step(0.28, vn(vec2(vTpW.x * (0.25 + 0.3 * h1) + floor(u2) * 7.0, floor(u1) * 3.0)));   // 薄層的縫約 7 成連續、偶爾斷開
          float seam = max(smoothstep(0.12, 0.0, b2) * step(0.5, h2) * 0.2 * thin * cont, smoothstep(0.05, 0.0, b1) * 0.65 * (0.6 + 0.4 * cont));   /* 細層理淡很多（以前一條條細白線很規則） */
          vec3 tint = mix(vec3(0.95, 0.9, 0.86), vec3(1.12, 0.96, 0.78), h1) * mix(1.0, 0.9 + 0.2 * h2, thin);   // 冷灰的頁岩層／暖褐的砂岩層
          diffuseColor.rgb *= mix(vec3(1.0), tint * (1.0 - 0.42 * seam), wallK);
          tpH += wallK * ((1.0 - abs(b2 * 2.0 - 1.0)) * 0.22 * thin + (1.0 - abs(b1 * 2.0 - 1.0)) * 0.55); }
        #endif`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        { float dist = length(vViewPosition); vec2 dH = clamp(vec2(dFdx(tpH), dFdy(tpH)) * 2.2, -0.9, 0.9) * smoothstep(90.0, 15.0, dist); normal = tpPerturb(-vViewPosition, normal, dH, faceDirection); }   // clamp：層面那條線高度是跳的，導數會爆掉、變成一截一截的亮線`)
  }

  // 2026-11-14 概念圖 2（瀑布後岩廊）：岩頂、岩簷的底面朝下、只吃得到天光，渲染出來幾乎全黑 → 補一點從地板／水面反上來的暖光（白天才有）
  const addBounce = (m, k) => { const ob = m.onBeforeCompile, key = m.customProgramCacheKey?.bind(m)
    m.onBeforeCompile = (sh, r) => { ob?.(sh, r); sh.uniforms.uDayB = dayLight
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uDayB;').replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance += diffuseColor.rgb * vec3(1.0, 0.9, 0.75) * ${k.toFixed(2)} * uDayB * smoothstep(-0.15, -0.75, normalize(vTpN).y);`) }
    m.customProgramCacheKey = () => (key ? key() : '') + '|bounce' }
  addBounce(cliffM, 0.32)
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
  { const ob = cliffM.onBeforeCompile
    // 2026-11-13 Pass 1B：水流直接打到、水霧噴得到的岩面才濕（粗糙度 0.3～0.45、有一點反光）；其他乾的維持 0.65～0.9，不讓整面岩壁變亮面
    cliffM.onBeforeCompile = (sh) => { ob(sh); sh.fragmentShader = sh.fragmentShader.replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
      { float cur = exp(-pow((vTpW.x - ${F0.x.toFixed(1)}) / 5.2, 2.0)) * step(vTpW.y, ${(F0top + 0.5).toFixed(1)});
        float spr = smoothstep(14.0, 4.0, distance(vTpW.xz, vec2(${F0.x.toFixed(1)}, ${F0.zi.toFixed(1)}))) * smoothstep(${(F0.py + 12).toFixed(1)}, ${(F0.py + 1).toFixed(1)}, vTpW.y);
        float wetR = clamp(max(cur, spr * 0.85), 0.0, 1.0);
        roughnessFactor = mix(roughnessFactor, 0.36, wetR);
        diffuseColor.rgb *= 1.0 - 0.12 * wetR; }`) }
  }
  if (GRANITE) cliffM.defines = { GRANITE: 1 }
  cliffM.customProgramCacheKey = () => 'cliffTriplanarRock' + (GRANITE ? 'G' : '')
  const cliff = new THREE.Mesh(cg, cliffM); cliff.castShadow = true; cliff.receiveShadow = true; g.add(cliff)
  cliff.name = 'cliffFace'   // world.js 用射線在岩面上擺鳥（Pass 1D）
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
    const stOpen = YOSE.stairs().pts.slice(0, 26), TRall = YOSE.stairs()
    const stairD = (x, z) => { let m = 1e9; for (let i = 1; i < stOpen.length; i++) { const [ax, az] = stOpen[i - 1], [bx, bz] = stOpen[i], dx = bx - ax, dz = bz - az, t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz))); m = Math.min(m, Math.hypot(x - ax - dx * t, z - az - dz * t)) } return m }
    const putRock = (n, x, z, k2, sink = 0.25) => lists[n].push({ p: V(x, alpineHeight(x, z) - sink * k2, z), q: new THREE.Quaternion().setFromEuler(new THREE.Euler(rnd() * 0.3, rnd() * TAU, rnd() * 0.3)), s: V(k2, k2 * (0.7 + rnd() * 0.5), k2), c: wetC(x) })
    for (let k = 0; k < 260; k++) {
      const x = X0 + 4 + rnd() * (X1 - X0 - 8), z = YOSE.base(x) - 0.5 - rnd() * 4
      const n = names[Math.floor(rnd() * names.length)], k2 = (n === 'boulder' ? 0.25 + rnd() * 0.35 : 0.6 + rnd() * 0.9) * 1.6
      if (Math.hypot(x - 185.0, z - 90.3) < 6.5) continue   // 2026-11-13 凹槽入口的岩拱改成明確擺（下面 ARCH），這一圈不要再丟亂數落石進來疊
      if (alpineTrailDist(x, z) < 3.2 + k2 * (n === 'boulder' ? 2.2 : 0.7) || inPool(x, z, 0.6) || YOSE.inLake(x, z, 1.5) || alpineStreamDist(x, z) < 2.5 || (x > 204 && x < 244) || stairD(x, z) < 1.8 + k2 * 0.7) continue
      putRock(n, x, z, k2)
    }
    for (let k = 0, made = 0; k < 400 && made < 16; k++) {   // 水潭邊的大石頭（不擋住看瀑布的那一面：步道那側少放）
      const a = rnd() * TAU, x = FL.x + Math.cos(a) * (FL.rx + 0.6 + rnd() * 1.6), z = FL.z + Math.sin(a) * (FL.rz + 0.5 + rnd() * 1.4)
      const n = rnd() < 0.5 && lib.boulder ? 'boulder' : names[1 + Math.floor(rnd() * (names.length - 1))], k2 = n === 'boulder' ? 0.45 + rnd() * 0.5 : 1.6 + rnd() * 1.6
      if (!lists[n] || YOSE.behind(x, z - 1.5) || alpineTrailDist(x, z) < 3.4 + k2 * (n === 'boulder' ? 2.2 : 0.7) || (Math.sin(a) < -0.3 && rnd() < 0.7) || YOSE.inLake(x, z, -0.5) || stairD(x, z) < 1.7 + k2 * (n === 'boulder' ? 1.6 : 0.6)) continue
      if (alpineHeight(x, z) > YOSE.lake.water + 9) continue;   /* 2026-11-12 岩壁腳的地形格子是岩壁頂的高度：石頭被擺到 76 m 高、碰撞體沒有底，把底下的崖壁步道擋住 */ putRock(n, x, z, k2, 0.3); addCollider(x, z, k2 * (n === 'boulder' ? 1.6 : 0.6), alpineHeight(x, z) + k2 * 0.8, alpineHeight(x, z) - 1.5); made++
    }
    // 2026-11-13 使用者（瀑布後面水潭、圈潭邊靠步道那一圈）「這裡應該要用大石頭擋著」：潭邊（水線上、步道那側）一顆接一顆排大石頭當擋土／護欄，有碰撞
    { const W = YOSE.lake.water, C = YOSE.cave, cand = []
      for (let x = C.x0 + 1; x <= 196; x += 0.25) for (let z = YOSE.base(x) - 3.5; z <= YOSE.base(x) + 10; z += 0.25) {
        const h = alpineHeight(x, z); if (h < W - 0.05 || h > W + 0.5) continue
        let deep = false; for (const [dx, dz] of [[1.2, 0], [-1.2, 0], [0, 1.2], [0, -1.2], [0.85, 0.85], [-0.85, 0.85], [0.85, -0.85], [-0.85, -0.85]]) if (YOSE.inRecessWater(x + dx, z + dz) && W - alpineHeight(x + dx, z + dz) > 0.3) deep = true
        if (!deep || alpineTrailDist(x, z) < 1.7 || stairD(x, z) < 2.1) continue   // 鐵鍊欄杆外面（石頭不能壓到階梯、欄杆柱）
        { const hh = alpineHeight(x, z); let near = false; for (let q = 0; q < TRall.pts.length && !near; q += 2) if (Math.abs(TRall.yy[q] - hh) < 3 && Math.hypot(TRall.pts[q][0] - x, TRall.pts[q][1] - z) < 2.6) near = true; if (near) continue }   // 2026-11-13 岩廊鋪過來了：整條崖壁步道（不只前 26 點）旁邊都不放
        cand.push([x, z]) }
      const got = []
      for (let i = cand.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [cand[i], cand[j]] = [cand[j], cand[i]] }
      for (const [x, z] of cand) { if (got.some(([a, b]) => Math.hypot(a - x, b - z) < 1.25)) continue; got.push([x, z]) }
      const big = names.filter((n) => n !== 'boulder')
      for (const [x, z] of got) { const n = big[Math.floor(rnd() * big.length)], k2 = 0.65 + rnd() * 0.35; putRock(n, x, z, k2, 0.3); addCollider(x, z, 0.6, alpineHeight(x, z) + 1.1, alpineHeight(x, z) - 1.0) }
    }
    // 2026-11-13 使用者＋ChatGPT 驗收（十個角度）：凹槽入口那座「石頭拱門」本來是落石堆亂數剛好疊成的——
    // 從西側看是一疊各自分開的角礫石、仰視透得到天空、有大石平衡在很窄的尖點上，讀起來像「石砌拱門」而不是天然岩拱。
    // ChatGPT 的結論是「只連上面不夠」，順序要：先兩側拱腳 → 再拱肩 → 最後拱頂 → 背面接回岩壁。照它的數值重擺：
    // 跨距 5 m、洞高 3.2 m；拱腳埋進地形 0.6～1.2 m；拱肩靠長軸對齊切線自然內傾 20～40°；
    // 拱頂 3 顆連續（不是單顆橫跨，避免兩端尖點平衡）；相鄰石頭中心距 ~1.5 m、石長 2.6～3.2 m ⇒ 重疊約 45%；
    // 拱頂厚度／跨距 ≈ 0.3；背面 3 顆往岩壁穿插 0.5～1.0 m；左右洞高差 0.35 m（天然岩拱不是完美半圓）
    {
      const A = { cx: 185.0, cz: 90.3, span: 5.0, H: 3.4, ux: -0.645, uz: 0.763, vx: 0.763, vz: 0.645 }   // u＝跨距方向（垂直步道）、v＝前後厚度方向（順步道、+v 朝岩壁）
      // 每種掃描石頭的原始尺寸：模型大小不一，要先量過才能縮放到指定的世界長度
      const bbSize = {}
      for (const n of names) {
        const bb = new THREE.Box3()
        for (const { geo } of parts(lib[n])) { if (!geo.boundingBox) geo.computeBoundingBox(); bb.union(geo.boundingBox) }
        bbSize[n] = bb.getSize(new THREE.Vector3())
      }
      const sorted = (q) => [q.x, q.y, q.z].sort((m, n2) => n2 - m)
      const longAxis = (q) => q.x >= q.y && q.x >= q.z ? new THREE.Vector3(1, 0, 0) : (q.y >= q.z ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(0, 0, 1))
      // ang：沿拱的角度（180°＝左拱腳、90°＝拱頂、0°＝右拱腳）；len：這顆在世界裡多長；dep：往岩壁方向偏多少；
      // dy：再上下挪多少（負的＝埋進地形）；spin：繞自己長軸轉；wob：繞前後軸再歪一點
      // 關鍵：石頭要以「內緣」貼著拱線，不是把中心放在拱線上——否則整顆的厚度都往洞裡吃，開口會被壓掉一半
      const feet = []
      const put = (n, ang, len, dep, dy, spin, wob = 0) => {
        const a = ang * Math.PI / 180, t = Math.cos(a), hy = Math.sin(a)
        const sz = bbSize[n], la = longAxis(sz), ax = sorted(sz), k = len / ax[0]
        const halfCross = (ax[1] + ax[2]) / 4 * k            // 橫斷面半徑：往外推這麼多，內緣才剛好落在拱線上
        const nt = t / (A.span / 2), nh = hy / A.H, nl = Math.hypot(nt, nh) || 1   // 橢圓的外法線
        const ot = nt / nl * halfCross, oh = nh / nl * halfCross
        const tw = t * A.span / 2 + ot
        const x = A.cx + A.ux * tw + A.vx * dep, z = A.cz + A.uz * tw + A.vz * dep
        const y = alpineHeight(x, z) + hy * A.H + oh + dy
        const dt = -Math.sin(a), dh = Math.cos(a)   // 拱的切線：長軸對齊它，拱肩就自然內傾
        const dir = new THREE.Vector3(A.ux * dt * A.span / 2, dh * A.H, A.uz * dt * A.span / 2).normalize()
        const q = new THREE.Quaternion().setFromUnitVectors(la, dir).multiply(new THREE.Quaternion().setFromAxisAngle(la, spin))
        if (wob) q.premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(A.vx, 0, A.vz), wob))
        // 2026-11-13 使用者（凹槽口往上的石階）「這裡不是牆擋著了嗎」：背面接岩壁那幾顆 3 m 的大石頭壓在石階第一段上，近看像一整面牆。
        // 石頭跟步道（崖壁石階、凹槽支線）水平距離不到「半徑＋1.3 m」、高度又重疊的，不放
        { const rad = ax[0] * k * 0.5, blocks = (px, pz, py) => Math.hypot(px - x, pz - z) < rad * 0.8 + 1.3 && py > y - rad - 1.0 && py < y + rad + 0.5
          for (let q2 = 0; q2 < TRall.pts.length; q2++) if (blocks(TRall.pts[q2][0], TRall.pts[q2][1], TRall.yy[q2])) return null
          const cv = ALP_SPURS.find((sp) => sp.name === 'cave'); if (cv) for (let q2 = 1; q2 < cv.pts.length; q2++) for (let f = 0; f <= 1; f += 0.25) { const px = cv.pts[q2 - 1][0] + (cv.pts[q2][0] - cv.pts[q2 - 1][0]) * f, pz = cv.pts[q2 - 1][1] + (cv.pts[q2][1] - cv.pts[q2 - 1][1]) * f; if (blocks(px, pz, alpineHeight(px, pz))) return null } }
        lists[n].push({ p: V(x, y, z), q, s: V(k, k * (0.74 + rnd() * 0.22), k), c: wetC(x) })
        return { x, z }
      }
      // 拱腳（先做）：每邊兩顆，大的埋進地形約 1 m、寬面朝地，上面再壓一顆把尖端藏起來
      feet.push(put('mrock_8', 180, 3.2, 0.35, -1.05, 0.5, 0.10))
      put('mrock_3', 166, 2.7, -0.95, -0.45, 2.2, -0.08)
      feet.push(put('mrock_5', 0, 3.2, -0.3, -1.15, 1.7, -0.09))
      put('mrock_1', 14, 2.7, 1.0, -0.5, 3.1, 0.07)
      // 拱肩：左右各兩顆往中心靠（長軸對齊切線＝內傾 20～40°）
      put('mrock_1', 148, 2.8, 0.55, -0.15, 1.3, 0.06)
      put('mrock_5', 120, 2.7, -0.75, 0.0, 3.0, -0.05)
      put('mrock_8', 60, 2.7, 0.8, -0.3, 0.9, 0.05)
      put('mrock_3', 32, 2.8, -0.6, -0.1, 2.6, -0.06)
      // 拱頂：三顆連續（左右洞高差 0.35 m，不是完美半圓）
      put('mrock_11', 104, 2.9, 0.4, 0.05, 0.3, 0.04)
      put('mrock_3', 90, 3.0, -0.55, 0.3, 1.9, -0.03)
      put('mrock_5', 76, 2.9, 0.5, -0.05, 2.8, 0.03)
      // 背面：沿「兩側」往既有岩壁延伸（不能擺在拱頂正後方，會從開口看出去變成一道牆把凹槽擋掉）
      put('mrock_8', 156, 3.0, 2.5, -0.5, 1.1, 0.08)
      put('mrock_1', 24, 3.2, 2.9, -0.8, 2.3, -0.06)
      put('mrock_5', 162, 3.0, 4.6, -1.2, 0.7, 0.05)
      put('mrock_3', 18, 3.0, 4.8, -1.4, 2.0, -0.04)
      // 補縫：拱肩與拱頂的接縫各塞一顆小的
      put('boulder', 134, 1.5, 0.3, -0.05, 1.4, 0)
      put('boulder', 46, 1.5, -0.3, -0.05, 2.9, 0)
      for (const f of feet) if (f) addCollider(f.x, f.z, 1.0, alpineHeight(f.x, f.z) + 2.2, alpineHeight(f.x, f.z) - 1.5)
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
  // 2026-11-13 Pass 1A（ChatGPT 規格）：水簾 shader 接上場景霧（FogExp2）、日夜亮度、雲量（共用 uniform，不多開 program）；
  // o.strand：分股水簾用的版本（頂點橫向紊流＝寬度 2～6%、每股自己的亂數 aSeed、白沫集中在岩唇和落水段）
  const fallMat = (o) => {
    const u = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uSpd: { value: o.spd }, uA: { value: o.a }, uDark: { value: o.dark ?? 0 }, uLow: { value: o.low ?? 0 } }])
    u.uT = uT; u.uDay = dayLight; u.uCloud = weatherU.cloud
    return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: true, defines: o.strand ? { STRAND: 1 } : {},
    uniforms: u,
    vertexShader: `varying vec2 vUv; varying float vSeed; uniform float uT;
      #ifdef STRAND
      attribute float aSeed; attribute float aSway; attribute float aAlpha; varying float vA;
      #endif
      #include <fog_pars_vertex>
      void main(){ vUv = uv; vec3 p = position; vSeed = 0.0;
        #ifdef STRAND
        vSeed = aSeed; vA = aAlpha; p.x += aSway * (sin(uv.y * 7.0 - uT * 1.1 + aSeed * 6.3) * 0.7 + sin(uv.y * 17.0 - uT * 2.3 + aSeed * 11.0) * 0.3);
        #endif
        vec4 mvPosition = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: `
      varying vec2 vUv; varying float vSeed; uniform float uT, uSpd, uA, uDark, uLow, uDay, uCloud;
      #ifdef STRAND
      varying float vA;
      #endif
      #include <fog_pars_fragment>
      float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
      float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f); return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
      float fbm(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 4; i++){ s += a * n(p); p *= 2.03; a *= 0.5; } return s; }
      void main(){
        float x = vUv.x, y = vUv.y, sx = x + vSeed * 13.7;
        float fall = y * y * 1.6 + y * 0.6;                         // 越往下流越快（重力加速）
        float t = uT * uSpd;
        #ifdef STRAND
        // 2026-11-13 Pass 1A-R（ChatGPT：白線太直、太平行、等速）：每股自己的流速和相位；
        // 流速擾動兩個尺度（大 0.4～1.2 m、小 0.03～0.15 m）把「下落座標」扭曲，水絲不再是一條條等寬等亮的直線
        t *= 0.78 + 0.44 * fract(vSeed * 7.31);
        fall += 0.22 * (n(vec2(sx * 2.3, y * 2.6 - t * 0.45)) - 0.5) + 0.05 * (n(vec2(sx * 31.0, y * 40.0 - t * 3.1)) - 0.5);
        float s1 = n(vec2(sx * 19.0, fall * 7.5 - t * 2.4)), s2 = n(vec2(sx * 43.0 + 3.0, fall * 13.0 - t * 3.6));
        #else
        float s1 = n(vec2(sx * 26.0, fall * 4.0 - t * 2.4)), s2 = n(vec2(sx * 61.0 + 3.0, fall * 7.0 - t * 3.6));
        #endif
        float str = smoothstep(0.32, 0.86, s1 * 0.55 + s2 * 0.5);
        float plume = smoothstep(0.48, 0.8, fbm(vec2(sx * 7.0, fall * 2.2 - t * 1.7)));   // 白色的水團（馬尾瀑）
        #ifdef STRAND
        str *= 0.55 + 0.45 * n(vec2(sx * 6.0, fall * 1.3 - t * 0.7));                        // 同一條水絲沿路忽亮忽暗、忽粗忽細
        plume *= 0.5 + 0.45 * smoothstep(0.15, 0.0, y) + 0.35 * smoothstep(0.7, 1.0, y);    // 白沫集中在岩唇（剛翻出去）和落水段
        float brk = smoothstep(0.3, 0.5, fbm(vec2(sx * 4.2 + 7.0, fall * 2.6 - t * 1.9)));  // 局部破碎：約 7 成連續，其他是一團團斷開的水
        float spray = smoothstep(0.7, 1.0, y) * smoothstep(0.55, 0.85, n(vec2(sx * 38.0, fall * 22.0 - t * 5.0)));   // 落水前 25～30%：碎水、飛沫
        #endif
        float spread = mix(0.16, 0.06, y);
        float edge = smoothstep(0.0, spread, x) * smoothstep(1.0, 1.0 - spread, x);
        edge *= 0.75 + 0.25 * n(vec2(sx * 9.0, fall * 3.0 - t * 1.5));                     // 邊緣破碎
        float low = mix(1.0, smoothstep(0.35, 0.75, y), uLow);                               // 水霧簾只在下半段
        float a = (0.22 + 0.55 * str + 0.45 * plume) * edge * low * uA * mix(0.85, 1.0, y);
        #ifdef STRAND
        a = (a * mix(0.4, 1.0, brk) + spray * 0.35 * edge * low) * vA;
        plume = max(plume, spray * 0.7);
        #endif
        vec3 c = mix(vec3(0.72, 0.8, 0.84), vec3(1.0), clamp(str * 0.6 + plume, 0.0, 1.0));
        c = mix(c, c * 0.6, uDark);
        c *= (0.2 + 0.8 * uDay) * (1.0 - 0.25 * uCloud);                                   // 晚上、陰天跟著變暗（以前整晚發白）
        gl_FragColor = vec4(c, clamp(a, 0.0, 1.0));
        #include <fog_fragment>
      }`,
  }) }
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
    // 2026-11-13 Pass 1A：分股水簾。好幾股合成一個 BufferGeometry（一層一個 draw call）；每股是往前鼓的曲面（厚 0.15～0.45 m，側面不是一張卡片），
    // 寬度沿高度有 5～12% 的不規則變化，往下慢慢展開（spread：股的中心往外移、grow：股變寬）
    // 每股：a/b＝頂／底的中心（相對瀑布中線），w0/w1＝頂／底寬，th＝往前鼓的厚度，k＝橫移的曲線（>1 先直後散），
    // hit＝[v, 橫移, 外推]：在高度 v 撞到岩面凸出，水被往旁邊、往外撥開一點再落下；al＝這股的水量比例（不透明度）
    const strands = (yA, yB, zA, list, { back, outK, mat, ro, v0 = 0, N = 34, M = 6, sc = 1 }) => {
      const P = [], U = [], S = [], W = [], AL = [], I = []
      list.forEach((q, si) => {
        const seed = q.seed ?? (si * 0.618 + q.a * 0.37) % 1, base = P.length / 3, ya = yA - (q.yOff ?? 0)
        for (let k = 0; k <= N; k++) {
          const v = v0 + (1 - v0) * k / N, y = ya - (ya - yB) * v
          const wob = 1 + 0.07 * Math.sin(v * 9.0 + seed * 7) + 0.04 * Math.sin(v * 23.0 + seed * 3)
          let cx = F.x + (q.a + (q.b - q.a) * Math.pow(v, q.k ?? 1.3)) * sc, out = back + outK * v * v + 0.12 * Math.sin(seed * 5 + v * 4) * v
          if (q.hit) { const hk = THREE.MathUtils.smoothstep(v, q.hit[0], q.hit[0] + 0.1); cx += q.hit[1] * hk; out += q.hit[2] * hk }
          const w = (q.w0 + (q.w1 - q.w0) * v) * sc * wob * (q.hit ? 1 + 0.25 * Math.exp(-(((v - q.hit[0] - 0.06) / 0.06) ** 2)) : 1)
          for (let m = 0; m <= M; m++) { const u = m / M; P.push(cx + (u - 0.5) * w, y, zA - out - q.th * Math.sin(Math.PI * u) * (0.75 + 0.25 * Math.sin(v * 11 + seed * 9))); U.push(u, v); S.push(seed); W.push(w * 0.04 * Math.min(1, v * 3)); AL.push(q.al ?? 1) }
          if (k) for (let m = 0; m < M; m++) { const a2 = base + (k - 1) * (M + 1) + m, c = a2 + M + 1; I.push(a2, a2 + 1, c, a2 + 1, c + 1, c) }
        }
      })
      const fg = new THREE.BufferGeometry(); fg.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); fg.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2))
      fg.setAttribute('aSeed', new THREE.Float32BufferAttribute(S, 1)); fg.setAttribute('aSway', new THREE.Float32BufferAttribute(W, 1)); fg.setAttribute('aAlpha', new THREE.Float32BufferAttribute(AL, 1)); fg.setIndex(I)
      const m = new THREE.Mesh(fg, mat); m.renderOrder = ro; m.frustumCulled = false; g.add(m); return m
    }
    // 上段：6 股，頂寬約 7.6 m（ChatGPT 7.5～8.5）、落到岩棚展到約 8.2 m——岩棚上的步道繞水潭一圈，兩側的路在 x≈195.7 / 203.7，
    // 再寬會落在步道上（規格 9～11 m 要先把岩棚凹槽加寬，留到 Pass 1C）
    // 2026-11-13 Pass 1A-R：不再是等比例展開的扇形——左右不對稱、中間兩股往內收、三股在半路撞到岩面凸出被撥開
    const UP6 = [
      { a: -3.0, b: -3.4, w0: 1.1, w1: 1.15, th: 0.22, k: 1.6, hit: [0.42, -0.28, 0.18] },
      { a: -1.75, b: -2.2, w0: 1.3, w1: 1.5, th: 0.32, k: 1.1 },
      { a: -0.45, b: -0.35, w0: 1.45, w1: 1.7, th: 0.42, k: 1.0 },
      { a: 0.85, b: 0.7, w0: 1.4, w1: 1.55, th: 0.38, k: 1.2, hit: [0.63, 0.22, 0.15] },
      { a: 2.05, b: 2.35, w0: 1.2, w1: 1.3, th: 0.28, k: 1.4 },
      { a: 3.05, b: 3.3, w0: 0.95, w1: 1.0, th: 0.2, k: 2.0, hit: [0.3, 0.2, 0.12], al: 0.8 },
    ]
    strands(topY + 0.05, shelfY - 0.1, zUp, UP6, { back: 0.25, outK: 1.3, mat: fallMat({ spd: 0.7, a: 0.5, dark: 0.35, strand: 1 }), ro: 3 })
    strands(topY + 0.05, shelfY - 0.1, zUp, UP6.map((q) => ({ ...q, w0: q.w0 * 1.06, w1: q.w1 * 1.06 })), { back: 0.45, outK: 2.0, mat: fallMat({ spd: 1.0, a: 0.82, strand: 1 }), ro: 4 })
    // 上段（舊：兩片寬 3～5 m 的平面水簾）
    if (false) {
    tier(topY + 0.05, shelfY - 0.1, zUp, 1.4, 2.0, 0.2, 1.3, fallMat({ spd: 0.7, a: 0.55, dark: 0.35 }), 3)
    tier(topY + 0.05, shelfY - 0.1, zUp, 1.6, 2.4, 0.4, 2.0, fallMat({ spd: 1.0, a: 1.0 }), 4)
    }
    // 2026-11-12 使用者「中間瀑布下來那邊是不是要有水像湖」→ ChatGPT：不是整片湖，是上段瀑布沖出來的一個不規則水潭（7×5 m、腎形、靠後面的岩壁），
    // 水從前面的缺口（寬約 3 m）經過一小段水道流到岩簷口，接下段瀑布——水潭、水道、下段瀑布頂要連成一條。水潭邊一圈高出水面 0.2～0.6 m 的岩石，
    // 岩棚兩側各留 1～2 m 沒淹到的岩面。落點 3 m 內一團白色的氣泡水、外面一圈打轉的碎白沫、出口一條條順著流的白沫；中間深綠、邊上看得到底。
    // （岩棚是岩壁網格的一部分、沒辦法往下挖 → 水面比岩棚高 0.32 m，靠那圈岩石圍住；深淺用顏色和透明度做）
    const MP = { x: F.x + 0.2, z: zUp - 2.5, rx: 4.25, rz: 2.75,   /* 2026-11-13 Pass 1A：3.7 → 4.25（上段落水展到 8.2 m 要整片落進潭裡；兩側步道在 x≈195.7／203.7，不能再大） */ y: shelfY + 0.16, ix: F.x, iz: zUp - 1.9 }
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
            vec2 d = vW.xz - uImp; float dI = length(vec2(d.x * 0.5, d.y));   /* 2026-11-13 Pass 1A：落水帶跟著上段水簾拉成 8 m 寬（x 方向壓扁） */
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
        for (let k = 0; k <= N; k++) for (let m = 0; m <= M; m++) { const t = k / N, u = m / M, z = z0 + (zE - z0) * t, w = 2.05 + 0.15 * t; P2.push(F.x + (u * 2 - 1) * w, MP.y - 0.03 * t, z); E2.push(Math.sin(u * Math.PI) * 0.6) }
        for (let k = 0; k < N; k++) for (let m = 0; m < M; m++) { const a = k * (M + 1) + m, b = a + 1, c2 = a + M + 1, d2 = c2 + 1; I2.push(a, c2, b, b, c2, d2) }
        const fg = new THREE.BufferGeometry(); fg.setAttribute('position', new THREE.Float32BufferAttribute(P2, 3)); fg.setAttribute('aEdge', new THREE.Float32BufferAttribute(E2, 1)); fg.setIndex(I2)
        const m = new THREE.Mesh(fg, pm); m.renderOrder = 4; m.name = 'midChannel'; g.add(m)
        // 過了岩棚前緣：水往下彎、變成一片白白的水簾，接到下段瀑布的頂（用瀑布的材質；第一版整段用水潭的材質，懸在空中像一塊玻璃板）
        const P3 = [], U3 = [], I3 = [], N3 = 8
        for (let k = 0; k <= N3; k++) { const t = k / N3, z = zE + 0.25 + (zLipW - zE - 0.25) * t, w = 2.15 + 0.2 * t, y = lerpN(MP.y - 0.02, shelfY - 0.4, Math.pow(t, 1.7)); P3.push(F.x - w, y, z, F.x + w, y, z); U3.push(0, t, 1, t); if (k) { const a = (k - 1) * 2; I3.push(a, a + 1, a + 2, a + 1, a + 3, a + 2) } }
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
          if (ez < MP.z - MP.rz * 0.6 && Math.abs(ex - F.x) < 2.25) continue   // 出水口（2026-11-13 加寬到 4.4 m）
          const rr = 1.0 + rnd() * 0.1; put(MP.x + (ex - MP.x) * rr, MP.z + (ez - MP.z) * rr, 0.2 + rnd() * 0.4, rnd() < 0.3)
        }
        // 跨過出水口的踏腳石（扁的掃描石頭，頂面比水面高一點）
        { const FH = { mrock_10: 0.77, mrock_12: 0.74, mrock_7: 0.74 }, fn = Object.keys(FH).filter((n) => lib[n]), sl = {}
          fn.length && [197.95, 198.85, 199.75, 200.65, 201.55, 202.3].forEach((sx, k) => { const n = fn[k % fn.length], sc = 0.5 + 0.08 * (k % 2), near = SHP.filter(([px]) => Math.abs(px - sx) < 0.6 && true).sort((a, b) => a[1] - b[1])[0]; (sl[n] ||= []).push({ p: V(sx, shelfY - FH[n] * sc * 0.55 + 0.22, near ? near[1] : YOSE.base(sx) + 0.8), q: new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), k * 1.7), s: V(sc, sc * 0.55, sc) }) })
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
    { const pp = [], sg = []; let prev = null
      for (let x = 193.6; x <= 208.4; x += 1.2) { const p = V(x, shelfY, YOSE.base(x) - 0.25); if (Math.abs(x - F.x) < 2.4) { prev = null; continue } pp.push(p); addCollider(p.x, p.z, 0.12, p.y + 1.1, p.y - 0.4); if (prev) sg.push([prev, p]); prev = p }
      for (let x = 193.6; x <= 208.4; x += 0.45) addCollider(x, YOSE.base(x) - 0.45, 0.3, shelfY + 1.2, shelfY - 0.5)   // 整條前緣擋住（出水口那 3 m 也是）
      for (const p of pp) CHAIN.posts.push(p); for (const sgm of sg) CHAIN.segs.push(sgm)   // 2026-11-14 使用者「都改鐵鍊」
    }
    // 下段
    const yLipW = shelfY - 0.4
    // 2026-11-13 Pass 1A-R（ChatGPT：側邊的水不能從步道底下憑空冒出來）：下段 7 股全部從岩棚出水口（4.4 m）翻下來；
    // 中間 3 股是主水流（約 7 成水量），外側 4 股是從主流分出去、邊落邊往兩側散開的薄水（約 3 成），落到湖面展到約 14 m、左右不對稱
    const LOW7 = [
      { a: -1.9, b: -6.6, w0: 0.7, w1: 1.6, th: 0.15, k: 1.5, al: 0.55 },
      { a: -1.65, b: -4.5, w0: 0.8, w1: 1.8, th: 0.2, k: 1.25, al: 0.65, hit: [0.35, -0.3, 0.2] },
      { a: -1.2, b: -1.9, w0: 1.35, w1: 2.4, th: 0.38, k: 1.0 },
      { a: 0.05, b: 0.15, w0: 1.5, w1: 2.6, th: 0.45, k: 1.0 },
      { a: 1.3, b: 2.1, w0: 1.35, w1: 2.3, th: 0.36, k: 1.1 },
      { a: 1.7, b: 4.2, w0: 0.85, w1: 1.7, th: 0.2, k: 1.35, al: 0.65 },
      { a: 1.95, b: 6.9, w0: 0.65, w1: 1.5, th: 0.15, k: 1.7, al: 0.5, hit: [0.5, 0.35, 0.18] },
    ]
    strands(yLipW, poolY, zLipW, LOW7, { back: 0.1, outK: 2.0, mat: fallMat({ spd: 0.7, a: 0.45, dark: 0.35, strand: 1 }), ro: 3 })
    strands(yLipW, poolY, zLipW, LOW7.map((q) => ({ ...q, w0: q.w0 * 1.08, w1: q.w1 * 1.08 })), { back: 0.25, outK: 3.0, mat: fallMat({ spd: 1.0, a: 0.8, strand: 1 }), ro: 4 })
    strands(yLipW, poolY, zLipW, LOW7.map((q) => ({ ...q, w0: q.w0 * 1.2, w1: q.w1 * 1.25, th: q.th + 0.2 })), { back: 0.6, outK: 3.8, mat: fallMat({ spd: 1.35, a: 0.36, low: 1, strand: 1 }), ro: 5, v0: 0.3 })
    // 2026-11-13 使用者（ChatGPT 生的「龍岩窟」參考圖：「做一樣」）：岩廊外面整段都要有水簾，不是只有中間 8 m 那道瀑布。
    // 從上層岩廊的岩頂邊緣（滲出來的水）一路落到下層岩廊底下，貼著退進去的岩面（離岩面 0.35 m，往下越落越往外）。
    // 水簾 shader 的左右邊會淡出 → 用 6 m 寬、每 4 m 一片互相重疊的水簾拼成一整面；每片給不同的 aSeed，紋路才不會一模一樣
    { const T = YOSE.stairs(), G = YOSE.GAL, SHf = YOSE.shelfY()
      let yG2 = SHf; for (let i = 0; i < T.pts.length; i++) if (T.kind[i] === 'gal' && T.pts[i][0] > G[0] && T.pts[i][0] < G[1] && T.yy[i] > SHf + 3) yG2 = Math.max(yG2, T.yy[i])
      const yA = yG2 + 3.6 + 0.3, yB = SHf - 2.6, HW = 3.0, NX = 12, NY = 26
      const panels = []; for (let xc = G[0] - 1.0; xc <= G[1] + 1.0 + 1e-6; xc += 4.0) panels.push(xc)
      for (const [layer, mat] of [[0, fallMat({ spd: 0.6, a: 0.42, dark: 0.3, strand: 1 })], [1, fallMat({ spd: 0.95, a: 0.66, strand: 1 })]]) {
        panels.forEach((xc, pi) => {
          const P = [], U = [], SD = [], SW = [], AL = [], I = [], seed = (pi * 0.618 + layer * 0.37) % 1
          for (let j = 0; j <= NY; j++) { const v = j / NY, y = yA - (yA - yB) * v
            for (let i = 0; i <= NX; i++) { const u = i / NX, x = xc - HW + 2 * HW * u, z = YOSE.base(x) + YOSE.rec(x) - 0.35 - 0.3 * layer - 0.7 * v * v
              P.push(x, y, z); U.push(u, v); SD.push(seed); SW.push(0.05); AL.push(layer ? 0.8 : 0.65) } }
          for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) { const q = j * (NX + 1) + i; I.push(q, q + NX + 1, q + 1, q + 1, q + NX + 1, q + NX + 2) }
          const gg = new THREE.BufferGeometry(); gg.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); gg.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2))
          gg.setAttribute('aSeed', new THREE.Float32BufferAttribute(SD, 1)); gg.setAttribute('aSway', new THREE.Float32BufferAttribute(SW, 1)); gg.setAttribute('aAlpha', new THREE.Float32BufferAttribute(AL, 1)); gg.setIndex(I)
          const m = new THREE.Mesh(gg, mat); m.renderOrder = 3 + layer; m.name = 'galleryCurtain'; g.add(m)
        })
      }
    }
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
    // 2026-11-13 Pass 1B（ChatGPT）：湖面不再是一片固定的翡翠綠——照水深上色（淺處透、看得到湖底石頭，深處暗藍綠）、
    // 下段瀑布落水的地方是一條橫的衝擊帶（0～2.5 m 翻騰白水、2.5～5 m 破碎泡沫往外散、5～9 m 慢慢減弱），
    // 波紋：平靜處很細（0.5～2.5 cm）、落水附近大（4～12 cm），好幾個方向、波長 0.3～2.5 m 混在一起；岸邊零星的細白沫
    const zLipL = fc.lip ? fc.lip.z - 0.35 : fz, zImp = zLipL - 3.25   // 下段主水簾落到湖面的地方（水簾底部往外 3.25 m）
    const DB = { x0: 172, z0: 60, w: 79, h: 50, n: 0.5 }   // 2026-11-14 往西多 9 m（BASIN 到 x179）   // 水深貼圖範圍（湖＋凹槽＋東邊的湖）
    const depthTex = (() => { const nx = DB.w / DB.n, nz = DB.h / DB.n, d = new Uint8Array(nx * nz)
      for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) { const x = DB.x0 + (i + 0.5) * DB.n, z = DB.z0 + (j + 0.5) * DB.n; d[j * nx + i] = Math.round(255 * Math.min(1, Math.max(0, (poolY - alpineHeight(x, z)) / 4))) }
      const t = new THREE.DataTexture(d, nx, nz, THREE.RedFormat, THREE.UnsignedByteType); t.magFilter = t.minFilter = THREE.LinearFilter; t.needsUpdate = true; return t })()
    const poolM = new THREE.MeshStandardMaterial({ envMapIntensity: 0.55, color: 0x16604e, roughness: 0.14, metalness: 0.02, transparent: true, opacity: 0.74 })   /* 2026-11-12 ChatGPT：不透明的土耳其藍像油漆 → 深一點的翡翠綠、透一點（看得到岸邊水下的石頭） */   // 2026-11-12 翡翠綠（參考照的水色）
    // 2026-11-11 使用者：下雨時這座湖也要有漣漪（濕地那支水面 shader 已經有，這裡是一片平的標準材質）→ 同一套雨滴圈：改法線＋圈的亮邊
    poolM.onBeforeCompile = (sh) => {
      sh.uniforms.uRT = uT; sh.uniforms.uRain = weatherU.rain
      sh.uniforms.uDepth = { value: depthTex }; sh.uniforms.uDB = { value: new THREE.Vector4(DB.x0, DB.z0, DB.w, DB.h) }
      sh.uniforms.uImp = { value: new THREE.Vector3(F.x - 2.4, F.x + 2.5, zImp) }; sh.uniforms.uImp2 = { value: new THREE.Vector2(F.x - 7.0, F.x + 7.3) }
      sh.uniforms.uOutlet = { value: new THREE.Vector2(183.5, 76.5) }
      sh.uniforms.uLakeR = { value: Array.from(YOSE.lakeR.tab) }; sh.uniforms.uLK = { value: new THREE.Vector2(YOSE.lake.x, YOSE.lake.z) }
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vRW;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvRW = (modelMatrix * vec4(position, 1.0)).xyz;')
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
        varying vec3 vRW; uniform float uRT; uniform float uRain;
        uniform sampler2D uDepth; uniform vec4 uDB; uniform vec3 uImp; uniform vec2 uImp2; uniform vec2 uOutlet; uniform float uLakeR[64]; uniform vec2 uLK;
        float rhash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float lvn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(rhash(i), rhash(i + vec2(1, 0)), f.x), mix(rhash(i + vec2(0, 1)), rhash(i + vec2(1, 1)), f.x), f.y); }
        float lfbm(vec2 p) { return lvn(p) * 0.55 + lvn(p * 2.07 + 3.1) * 0.3 + lvn(p * 4.3 + 7.7) * 0.15; }
        float segD(vec2 p, float x0, float x1, float zc, out vec2 away) { vec2 c = vec2(clamp(p.x, x0, x1), zc), d = p - c; float L = length(d); away = L > 1e-3 ? d / L : vec2(0.0, -1.0); return L; }
        float lkFoam, lkImp, lkDep;
        vec2 lkGrad;
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
        .replace('#include <color_fragment>', `#include <color_fragment>
        {
          vec2 q = vRW.xz; float t = uRT;
          lkDep = texture2D(uDepth, clamp((q - uDB.xy) / uDB.zw, 0.0, 1.0)).r * 4.0;
          vec2 aw1, aw2; float d1 = segD(q, uImp.x, uImp.y, uImp.z, aw1), d2 = segD(q, uImp2.x, uImp2.y, uImp.z, aw2) + 1.8;   // 兩側薄水落點的衝擊小一號
          float dI = min(d1, d2); vec2 away = d1 < d2 ? aw1 : aw2;
          // 1B 收尾（ChatGPT：外圈像畫好的圓環）：衝擊範圍的邊界用低頻雜訊推進推出 ±0.8 m，每一段擴散速度不同
          float segK = lvn(q * 0.28 + 4.0);
          dI = max(0.0, dI + (lfbm(q * 0.35 + vec2(t * 0.04, 0.0)) - 0.5) * 1.7);
          lkImp = smoothstep(9.0, 0.0, dI);
          // 流向：從落水帶往外推，離遠了慢慢轉向出水口
          vec2 toOut = normalize(uOutlet - q + 1e-3), flow = normalize(mix(away, toOut, smoothstep(2.5, 8.0, dI)));   // 泡沫一離開落水帶就慢慢轉向出水口漂
          vec2 adv = q - flow * t * mix(0.9, 0.25, smoothstep(2.0, 12.0, dI)) * (0.65 + 0.7 * segK);
          float core = smoothstep(2.5, 0.8, dI), mid = smoothstep(5.0, 2.5, dI) * (1.0 - core), outer = smoothstep(9.0, 5.0, dI) * (1.0 - smoothstep(5.0, 2.5, dI));
          float nA = lfbm(adv * 1.6 + vec2(0.0, t * 0.7)), nB = lfbm(adv * 3.1 - t * 0.4 + 11.0), nC = lfbm(adv * 0.9 + 5.0);
          float holes = smoothstep(0.52, 0.66, lfbm(adv * 1.15 + vec2(33.0, t * 0.3)));     // 白水裡約 2 成露出深色的水（翻上來的水團之間）
          float foam = core * (0.58 + 0.42 * nA) * (1.0 - 0.85 * holes);                    // 0～2.5 m：翻騰的白水
          foam += mid * smoothstep(0.42, 0.68, nA * 0.6 + nB * 0.5) * 0.85 * smoothstep(0.2, 0.45, segK + nC * 0.4);   // 破碎的弧，一段段斷開           // 2.5～5 m：破碎、一塊塊往外散
          foam += outer * smoothstep(0.66, 0.86, nB * 0.7 + nC * 0.4) * 0.38;           // 5～9 m：零星的泡沫線
          foam += smoothstep(14.0, 8.0, dI) * (1.0 - lkImp) * smoothstep(0.8, 0.92, lfbm(adv * 2.2 + 21.0)) * 0.12;   // 再遠：順著流向的細泡沫
          float shore = smoothstep(0.32, 0.06, lkDep);                                // 岸邊 0.2～0.6 m：一小段一小段，不是一整圈白線
          foam += shore * smoothstep(0.55, 0.78, lfbm(q * 1.4 + t * 0.15)) * 0.5;
          lkFoam = clamp(foam, 0.0, 1.0);
          // 波紋（法線用的斜率）：四個方向、波長 0.35～2.4 m；平靜處振幅約 1 cm、落水附近 4～12 cm
          float A = mix(0.0045, 0.06, lkImp * lkImp);
          vec2 g = vec2(0.0);
          vec2 D1 = normalize(vec2(0.8, 0.6)), D2 = normalize(vec2(-0.5, 0.86)), D3 = normalize(vec2(0.95, -0.3)), D4 = normalize(vec2(-0.9, -0.42));
          g += D1 * 2.6 * cos(dot(D1, q) * 2.6 - t * 2.0) * 1.0; g += D2 * 4.5 * cos(dot(D2, q) * 4.5 - t * 2.7) * 0.6;
          g += D3 * 9.0 * cos(dot(D3, q) * 9.0 + nC * 3.0 - t * 3.8) * 0.22; g += D4 * 17.9 * cos(dot(D4, q) * 17.9 + nB * 4.0 - t * 5.3) * mix(0.06, 0.18, lkImp);   // 細波：平靜處很弱（不然太陽在湖面上灑一片白點）
          g += away * 6.0 * cos(dI * 6.0 + nC * 9.0 - t * 7.0) * 0.22 * lkImp * (0.3 + nA);   // 往外推的波，相位被雜訊打亂（不要一圈圈同心圓）        // 落水往外推的波
          lkGrad = g * A;
          // 水色：照水深（淺處透、偏綠褐看得到底；深處暗藍綠），翻騰的水帶一點氣泡的青白
          vec3 shallowC = vec3(0.13, 0.21, 0.16), deepC = vec3(0.016, 0.06, 0.075);
          diffuseColor.rgb = mix(shallowC, deepC, smoothstep(0.08, 2.6, lkDep));
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.62, 0.78, 0.78), core * 0.35 * (1.0 - holes));
          diffuseColor.a = mix(0.52, 0.94, smoothstep(0.05, 1.9, lkDep)) * smoothstep(0.0, 0.05, lkDep);   // 2026-11-14 使用者（淺水顏色錯誤）：0.3 太透，淺色沙底整片透出來變成乳白色 → 0.52
          // 2026-11-14 使用者（東湖照片）「這裡水不見」：這個材質東湖、凹槽也在用，淡出只能做在出水口那一側（西南），不然整片東湖被淡成透明
          if (vRW.x < 194.0 && vRW.z < 86.5) { float aL = atan(vRW.z - uLK.y, vRW.x - uLK.x), tL = (aL + 3.14159265) / 6.2831853 * 64.0; int iL = int(floor(tL)); float fL = tL - floor(tL);
            float rL = mix(uLakeR[((iL % 64) + 64) % 64], uLakeR[(((iL + 1) % 64) + 64) % 64], fL);
            diffuseColor.a *= smoothstep(0.0, 1.2, rL - length(vRW.xz - uLK)); }   // 2026-11-14 湖面外緣 1.2 m 淡掉（河面在這段底下是滿的）   // 2026-11-14 湖面外緣 1.2 m 淡掉，跟河面交叉淡化
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.9, 0.94, 0.95), lkFoam);
          diffuseColor.a = max(diffuseColor.a, lkFoam * smoothstep(0.0, 0.05, lkDep));
        }`)
        .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.75, lkFoam);')
        .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        normal = normalize(normal + (viewMatrix * vec4(-lkGrad.x, 0.0, -lkGrad.y, 0.0)).xyz);
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
    // 2026-11-13 使用者（石橋上往湖看）「這裡兩邊水沒接好」：湖面以前是一個正橢圓，走到出水口就切掉，
    // 但下游那片河面的網格是從 ALP_RIVER 第一點 (185,76) 才開始鋪 → 中間空著一條約 0.8 m 的乾溝（看得到挖下去的河床）。
    // 改成：橢圓邊界在出水口那個方向（±20°）往外推，一路推過河面網格的起點，兩片水重疊約 1.5 m，接縫被水花蓋住。
    // 推到岸上的部分不用管：shader 的 alpha 照水深算，地比水面高就是全透明（recessWater、eastLakeWater 也靠這個）
    const LK = YOSE.lake
    const poolG = new THREE.CircleGeometry(1, 128).rotateX(-Math.PI / 2)   // 用 CircleGeometry 改點（三角形繞向跟原本一樣，不會變成背面）
    { const pp = poolG.attributes.position   // 2026-11-14 湖面輪廓＝layout.js YOSE.lakeR（橢圓＋出水口＋挖掉的 BASIN），河面在 alpine.js 用同一張半徑表淡入
      for (let i = 1; i < pp.count; i++) { const a = Math.atan2(pp.getZ(i), pp.getX(i)), r = YOSE.lakeR(a); pp.setXYZ(i, Math.cos(a) * r, 0, Math.sin(a) * r) }
      pp.needsUpdate = true; poolG.computeBoundingSphere() }
    const pool = new THREE.Mesh(poolG, poolM); pool.position.set(LK.x, poolY, LK.z); pool.receiveShadow = true; g.add(pool)
    // 2026-11-13 凹槽也是湖：一條沿著岩壁的水面（從牆腳前 3 m 到凹槽最裡面），跟湖同一個材質、同一個高度；岩架比水面高，自然蓋住後面那一截
    { const P = [], I = [], C0 = YOSE.cave; let n = 0
      for (let x = C0.x0; x <= C0.x1 + 1e-6; x += 0.5) { const b = YOSE.base(x), D = YOSE.caveD(x); P.push(x, LK.water + 0.004, b - 3.2, x, LK.water + 0.004, b + D + 0.3); if (n) { const a = (n - 1) * 2; I.push(a, a + 1, a + 2, a + 1, a + 3, a + 2) } n++ }   // 2026-11-13 使用者「瀑布後面沒有水」：以前三角形繞反了（面朝下），從上面看被背面剔除、整片水面看不到
      const rg = new THREE.BufferGeometry(); rg.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); rg.setIndex(I); rg.computeVertexNormals()
      { const nn = rg.attributes.normal; for (let k = 0; k < nn.count; k++) nn.setXYZ(k, 0, 1, 0) }
      const rw = new THREE.Mesh(rg, poolM); rw.renderOrder = pool.renderOrder; rw.name = 'recessWater'; g.add(rw) }
    // 2026-11-13 驗收第 9 條：東邊那片湖的水面（從南岸到岩壁腳後面一點，岩壁網格蓋住後面那截），跟瀑布湖同一個材質、同一個高度
    { const P = [], I = [], E = YOSE.lakeE; let n = 0
      for (let x = E.x0 - 6; x <= E.x1 + 6 + 1e-6; x += 0.5) { const ex = THREE.MathUtils.smoothstep(x, E.x0 - 6, E.x0) * THREE.MathUtils.smoothstep(-x, -(E.x1 + 6), -E.x1), zs = E.zS(x) - 1.5 + (1 - ex) * 6; P.push(x, LK.water + 0.003, Math.min(zs, YOSE.base(x)), x, LK.water + 0.003, YOSE.base(x) + 0.6); if (n) { const a = (n - 1) * 2; I.push(a, a + 1, a + 2, a + 1, a + 3, a + 2) } n++ }   // 三角形朝上（反過來的話從上面看會被剔掉）
      const eg = new THREE.BufferGeometry(); eg.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); eg.setIndex(I); eg.computeVertexNormals()
      { const nn = eg.attributes.normal; for (let k = 0; k < nn.count; k++) nn.setXYZ(k, 0, 1, 0) }
      const ew = new THREE.Mesh(eg, poolM); ew.renderOrder = pool.renderOrder; ew.name = 'eastLakeWater'; g.add(ew) }
    const foamT = (() => { const c = document.createElement('canvas'); c.width = c.height = 256; const x = c.getContext('2d'), r = mulberry32(9); for (let i = 0; i < 1600; i++) { const a = r() * TAU, d = Math.pow(r(), 0.7) * 120; x.fillStyle = `rgba(255,255,255,${(0.1 + r() * 0.45) * (1 - d / 130)})`; x.beginPath(); x.arc(128 + Math.cos(a) * d, 128 + Math.sin(a) * d, 1 + r() * 5, 0, TAU); x.fill() } const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t })()
    for (const [k, sc] of []) {   // 2026-11-13 Pass 1B：落水白沫改在湖面 shader 裡（照落水帶的形狀），這兩片圓形貼圖拿掉
      const fm = new THREE.Mesh(new THREE.CircleGeometry(1, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: foamT, transparent: true, depthWrite: false, opacity: 0.8 }))
      fm.scale.set(sc, 1, sc * 0.6); fm.position.set(F.x, poolY + 0.02 + k * 0.01, fz - 3.2); fm.userData = { sc, k }; fm.renderOrder = 2; g.add(fm); foams.push(fm)
    }
    // 水霧：大片、慢慢飄、有的往步道那邊飄過來
    const zImpM = (fc.lip ? fc.lip.z - 0.35 : fz) - 3.25
    const mistT = mistTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'); const gr = x.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = gr; x.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c) })()
    // 2026-11-13 Pass 1B（ChatGPT：水霧太白、把森林洗白）：重新分配——落水帶附近 0～5 m 濃（12 團）、5～12 m 慢慢變淡（9 團）、
    // 12～25 m 只剩幾團很淡的（5 團）、再遠沒有；每團有自己的高度、會順著風往湖面飄；顏色跟著天色（晚上不再像發光的白煙）
    for (const [n, r0, r1, op, s0, s1, h0, h1] of [[12, 0, 5, 0.34, 3, 6, 0.4, 5], [9, 5, 12, 0.16, 4, 7, 0.8, 7], [5, 12, 25, 0.06, 5, 8, 1.5, 9]]) for (let k = 0; k < n; k++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: mistT, transparent: true, depthWrite: false, opacity: 0 })), dx = (rnd() - 0.5) * 2, r = r0 + rnd() * (r1 - r0)
      const p0 = V(F.x + dx * (r0 < 1 ? 5.5 : 8 + r * 0.4), poolY + h0 + rnd() * (h1 - h0), zImpM - r * (0.6 + 0.4 * rnd()))
      sp.position.copy(p0); sp.scale.setScalar(s0 + rnd() * (s1 - s0)); sp.userData = { ph: rnd() * TAU, p0, k: op * (0.7 + 0.6 * rnd()), drift: 0.6 + rnd() * 0.8 }; sp.renderOrder = 6; g.add(sp); mist.push(sp)
    }
    for (let k = 0; k < 9; k++) { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: mistT, transparent: true, depthWrite: false, opacity: 0.3 })); const p0 = V(F.x + (rnd() - 0.5) * 5, SHELF_Y + 0.6 + rnd() * 3.2, fz + YOSE.rec(F.x) - 1.2 - rnd() * 2.2); sp.position.copy(p0); sp.scale.setScalar(2.2 + rnd() * 3); sp.userData = { ph: rnd() * TAU, p0, k: 0.22, drift: 0.3 }; sp.renderOrder = 6; g.add(sp); mist.push(sp) }   // 2026-11-12 中段水潭上面的水霧（落點 2～3 m 內濃）
    // 2026-11-13 岩廊的氛圍（使用者：「氛圍也要對」，參考圖 docs/acceptance-1113/chatgpt_gallery_ref.png）：
    // 陽光穿過水簾斜斜照進廊道——一道道暖色光束（兩片交叉的面，從欄杆外的水簾斜到靠內側的地板）＋落在地板上一塊塊會晃的光斑（水簾晃，光就跟著閃）；
    // 廊道裡一團團水霧從靠岩壁那側飄向水簾（用上面瀑布水霧同一套 sprite、同一個更新）。晚上、陰天跟著變暗
    { const T = YOSE.stairs(), G = YOSE.GAL, SHf = YOSE.shelfY(), pts = []
      for (let i = 0; i < T.pts.length; i++) if (T.kind[i] === 'gal' && T.pts[i][0] > G[0] + 0.5 && T.pts[i][0] < G[1] - 0.5 && T.yy[i] > SHf - 1) pts.push(i)
      const outward = (x) => { const db = YOSE.base(x + 0.5) - YOSE.base(x - 0.5), l = Math.hypot(db, 1); return [db / l, -1 / l] }   // 岩壁面的外法線（xz）
      const shaftU = { uT, uDay: dayLight, uCloud: weatherU.cloud }
      const shaftM = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, uniforms: shaftU,
        vertexShader: 'varying vec2 vUv; varying vec3 vW; void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
        fragmentShader: `varying vec2 vUv; varying vec3 vW; uniform float uT, uDay, uCloud;
          float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
          float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f); return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
          void main(){
            float side = smoothstep(0.0, 0.35, vUv.x) * smoothstep(1.0, 0.65, vUv.x);
            float len = smoothstep(0.0, 0.12, vUv.y) * smoothstep(1.0, 0.7, vUv.y) * (1.0 - 0.45 * vUv.y);   // 進光那頭最亮，落到地板前淡掉
            float flick = 0.55 + 0.45 * n(vec2(vW.x * 0.9 + uT * 0.7, vW.y * 0.6 - uT * 1.9));               // 水簾晃動，光一下亮一下暗
            float streak = 0.7 + 0.3 * n(vec2(vUv.x * 9.0, vUv.y * 2.0 - uT * 0.4));
            float a = side * len * flick * streak * 0.16 * uDay * (1.0 - 0.75 * uCloud);
            gl_FragColor = vec4(vec3(1.0, 0.86, 0.62) * a, 1.0);
          }` })
      const patchM = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: shaftU, polygonOffset: true, polygonOffsetFactor: -2,
        vertexShader: 'varying vec2 vUv; varying vec3 vW; void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
        fragmentShader: `varying vec2 vUv; varying vec3 vW; uniform float uT, uDay, uCloud;
          float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
          float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f); return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
          void main(){
            vec2 d = vUv * 2.0 - 1.0; float e = smoothstep(1.0, 0.25, length(d));
            // 水簾後面的光斑：一條條會流動的亮紋（像焦散），不是一塊均勻的亮
            float c1 = n(vec2(vW.x * 3.1 + uT * 0.5, vW.z * 3.1 - uT * 1.4)), c2 = n(vec2(vW.x * 5.3 - uT * 0.8, vW.z * 4.7 + uT * 1.1));
            float caus = pow(clamp(1.0 - abs(c1 - c2) * 2.2, 0.0, 1.0), 4.0);
            float a = e * (0.35 + 0.9 * caus) * 0.22 * uDay * (1.0 - 0.75 * uCloud);
            gl_FragColor = vec4(vec3(1.0, 0.84, 0.58) * a, 1.0);
          }` })
      const SG = [], PG = []
      const quad = (A, B, W, U) => { const h2 = U.clone().multiplyScalar(W / 2); return [A.clone().sub(h2), A.clone().add(h2), B.clone().add(h2), B.clone().sub(h2)] }
      let last = -1e9, k = 0
      for (const i of pts) {
        const x = T.pts[i][0], z = T.pts[i][1], y = T.yy[i]
        if (Math.abs(x - last) < 2.3) continue
        last = x; k++
        const [ox, oz] = outward(x), tx = -oz, tz = ox, jit = hsh(k * 7.7 + y)
        const A = V(x + ox * (1.9 + 0.4 * jit), y + 3.25, z + oz * (1.9 + 0.4 * jit)), B = V(x - ox * (0.4 + 0.5 * jit), y + 0.05, z - oz * (0.4 + 0.5 * jit))
        const beam = B.clone().sub(A).normalize(), Tn = V(tx, 0, tz), W = 0.7 + 0.6 * hsh(k * 3.1)
        const N2 = V().crossVectors(beam, Tn).normalize()
        for (const U of [Tn, N2]) SG.push(quad(A, B, W, U))
        const Cn = B.clone().add(V(0, 0.015, 0)), L2 = 0.8 + 0.6 * jit, W2 = 0.55 + 0.35 * hsh(k * 5.3)
        PG.push([Cn.clone().add(Tn.clone().multiplyScalar(-L2)).add(V(ox, 0, oz).multiplyScalar(-W2)), Cn.clone().add(Tn.clone().multiplyScalar(L2)).add(V(ox, 0, oz).multiplyScalar(-W2)), Cn.clone().add(Tn.clone().multiplyScalar(L2)).add(V(ox, 0, oz).multiplyScalar(W2)), Cn.clone().add(Tn.clone().multiplyScalar(-L2)).add(V(ox, 0, oz).multiplyScalar(W2))])
        // 水霧：每道光束附近兩團，從靠岩壁那側飄向水簾
        for (let m2 = 0; m2 < 2; m2++) { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: mistT, transparent: true, depthWrite: false, opacity: 0 })), r2 = hsh(k * 11.3 + m2)
          const p0 = V(x - ox * (0.6 + r2) + tx * (r2 - 0.5) * 2, y + 0.5 + r2 * 1.8, z - oz * (0.6 + r2) + tz * (r2 - 0.5) * 2)
          sp.position.copy(p0); sp.scale.setScalar(1.6 + r2 * 1.6); sp.userData = { ph: r2 * TAU, p0, k: 0.12 + 0.1 * r2, drift: 0.35 + 0.3 * r2 }; sp.renderOrder = 6; g.add(sp); mist.push(sp) }
      }
      const mk = (list, mat, name) => { const P = [], U = [], I = []; list.forEach((q4, j) => { for (const v of q4) P.push(v.x, v.y, v.z); U.push(0, 0, 1, 0, 1, 1, 0, 1); const b = j * 4; I.push(b, b + 1, b + 2, b, b + 2, b + 3) })
        const gg = new THREE.BufferGeometry(); gg.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); gg.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2)); gg.setIndex(I); gg.computeBoundingSphere()
        const m = new THREE.Mesh(gg, mat); m.renderOrder = 7; m.name = name; m.frustumCulled = true; g.add(m) }
      if (SG.length) mk(SG, shaftM, 'galleryShafts')
      if (PG.length) mk(PG, patchM, 'galleryPatches')
    }
    // 水花：落點往上往外噴的小水滴（加色、會飄散）
    const NS = 500, sp = new Float32Array(NS * 3), sv = []
    const reset = (i, first) => { const x = F.x + (rnd() - 0.5) * 9, z = fz - 2.6 - rnd() * 1.8; sp[i * 3] = x; sp[i * 3 + 1] = poolY + (first ? rnd() * 5 : 0.1); sp[i * 3 + 2] = z; sv[i] = V((rnd() - 0.5) * 1.6, 2 + rnd() * 4.5, -(0.4 + rnd() * 2.2)) }
    for (let i = 0; i < NS; i++) reset(i, true)
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(sp, 3))
    const sprayM = new THREE.PointsMaterial({ color: 0xffffff, size: 0.12, transparent: true, opacity: 0.55, depthWrite: false, map: mistT, blending: THREE.AdditiveBlending })
    const spray = new THREE.Points(sg, sprayM); spray.frustumCulled = false; spray.renderOrder = 7; g.add(spray)
    sprayU = (dt) => { sprayM.color.setScalar(0.1 + 0.9 * dayLight.value); for (let i = 0; i < NS; i++) { sv[i].y -= 3.2 * dt; sv[i].multiplyScalar(1 - 0.9 * dt); sp[i * 3] += sv[i].x * dt; sp[i * 3 + 1] += sv[i].y * dt; sp[i * 3 + 2] += sv[i].z * dt; if (sp[i * 3 + 1] < poolY || rnd() < 0.004) reset(i, false) } sg.attributes.position.needsUpdate = true }
  }

  // ---------- 秘境瀑布步道（2026-11-12；路線 layout.js YOSE.stairs、設計 docs/GORGE_ROUTE.txt）----------
  // 以前這裡是岩壁東側 6 層平台的之字形石階，使用者要求拆掉，改成從瀑布後面的岩窟進去、在岩壁和岩體裡一路往上的一條路：
  // 岩壁上的迴廊是岩壁網格自己切出來的橫槽（上面 slotsAt）；隧道是岩體裡另外的管狀網格（下面 1）；整條路鋪石階踏板（2）；
  // 露天的地方外側加鐵欄杆（3）；隧道裡每 8 m 一盞壁燈，燈光直接算進隧道壁和踏板的顏色裡（不用真的光源）
  {
    const st = TR, topYm = YOSE.topY(214), NP = st.pts.length
    const stepM = new THREE.MeshStandardMaterial({ map: cliffM.map, color: new THREE.Color(0.66, 0.56, 0.45), roughness: 0.88, vertexColors: true })   /* 2026-11-14 概念圖：石階是暖灰褐的砂岩（以前冷灰白） */   /* 頂點色＝Blender 烘的環境遮蔽（岩石套件）；方塊踏板給全白 */
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
    const STEP_BASE_OBC = stepM.onBeforeCompile   // 2026-11-14 岩壁（sandstone_wall_kit）用：只要三向投影＋濕，不要踏板那套青苔
    { const ob = stepM.onBeforeCompile
      // 踏板：邊角、縫裡長青苔（踏面中間被踩的地方少），越靠瀑布越多
      stepM.onBeforeCompile = (sh) => { ob(sh); sh.fragmentShader = sh.fragmentShader.replace('roughnessFactor *= 1.0 - 0.5 * wet;', 'roughnessFactor *= 1.0 - 0.5 * wet; roughnessFactor = mix(roughnessFactor, 1.0, stMoss);').replace('#include <common>', '#include <common>\nfloat stMoss = 0.0;' + GLSL_VNOISE + `
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
          // 2026-11-14 使用者「地面要有青苔」（概念圖：石板縫、踏階邊、靠牆那側長滿青苔，踏面中間被踩的地方少）
          float ao = clamp(dot(vColor.rgb, vec3(0.333)), 0.0, 1.0);                                   // Blender 烘的 AO：縫、石塊交界暗
          float crev = smoothstep(0.66, 0.42, ao);                                                     // 縫裡
          float patchy = smoothstep(0.52 - 0.1 * wet, 0.66 - 0.1 * wet, nn + 0.2 * nf + 0.25 * (nz - 0.5));   // 一塊塊的苔蘚墊
          float fuzz = smoothstep(0.35, 0.65, nz);                                                     // 苔蘚邊緣毛毛的
          float cov = max(crev * (0.75 + 0.25 * fuzz), patchy * mix(1.0, 0.4, smoothstep(0.6, 0.95, upF)) * (0.6 + 0.4 * fuzz));
          cov = max(cov, (1.0 - abs(upF)) * smoothstep(0.45, 0.65, nn) * 0.75);                      // 踏階的立面
          cov = max(cov, smoothstep(0.25, 0.5, upF) * smoothstep(0.92, 0.7, upF) * (0.55 + 0.45 * fuzz));   // 踏階的邊（倒角那一圈）
          cov = clamp(cov * (0.75 + 0.45 * wet), 0.0, 1.0);
          vec3 mossC = mix(vec3(0.035, 0.085, 0.018), vec3(0.12, 0.2, 0.04), nf) * (0.7 + 0.6 * nz);
          diffuseColor.rgb = mix(diffuseColor.rgb, mossC, cov * 0.9); stMoss = cov;   /* 青苔的地方不反光（以前濕石頭的亮面蓋在青苔上，看起來一層淡綠） */
          /* 側面一條條細的層理（頁岩一片片的斷面） */
          float lam = vfbm(vec2(vTpW.y * 34.0, (vTpW.x + vTpW.z) * 0.7)), lam2 = vfbm(vec2(vTpW.y * 9.0 + 3.0, (vTpW.x - vTpW.z) * 0.4));
          diffuseColor.rgb *= 1.0 - (1.0 - smoothstep(0.3, 0.7, abs(upF))) * (0.34 * smoothstep(0.5, 0.72, lam) + 0.22 * smoothstep(0.45, 0.7, lam2)) * (1.0 - cov); }`) }
    }
    stepM.customProgramCacheKey = () => 'stepTriplanar7'
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
        const gal = st.kind[ii] === 'gal', alc = st.kind[ii] === 'alc', shf = st.kind[ii] === 'shelf', wet = shf && p.x > 197.55 && p.x < 202.65 && p.z < YOSE.base(p.x) + 3   /* 驗收第 23 條：出水口 1A 加寬成 4.4 m（F.x−2.3～+2.3），跨水那段的石板也要跟著讓出來（踏腳石接手） */, so = (h3 - 0.5) * (gal || alc ? 0.04 : 0.1) + (gal ? (SIDE[ii].z < 0 ? 1 : -1) * 0.3 : 0)   // 階地：踏板只鋪到內側的石壁（寬 1.8 m，往外移 0.27）
        const galF = gal && p.x > YOSE.GAL[0] - 0.3 && p.x < YOSE.GAL[1] + 0.3 && p.y > SHELF_Y - 1   /* 岩廊：不放方塊踏板，鋪 gallery_kit 的石板 */
        tm.setMatrixAt(n, m4.compose(V(p.x + SIDE[ii].x * so, yTop - 0.3 - h5 * 0.012, p.z + SIDE[ii].z * so), q, V(wet || galF ? 0.0001 : gal ? 0.86 : alc ? 0.75 : shf ? 0.62 : 1, 1, 0.93 + 0.12 * h2)))   /* 折返平台：踏板窄一點（2.5 m 寬的踏板在半徑 0.85 m 的彎上互相戳出來，像貼在岩壁上的大石塊） */
        const kk = 0.87 + 0.26 * h4, wm = (h5 - 0.5) * 0.08
        tm.setColorAt(n, c.setRGB(1.0 * kk + wm, 0.9 * kk, 0.74 * kk - wm))
        STEPS.push({ m: m4.clone(), c: c.clone() })
      }
      tm.castShadow = true; tm.receiveShadow = true; tm.computeBoundingSphere(); tm.name = 'gorgeSteps'; g.add(tm)
    }
    // 外側的欄杆（靠湖那一側）：折返平台用鐵管欄杆、一般路段的鐵樁和鐵鍊記在 CHAIN
    const WOOD = []   // 岩廊段的欄杆點（一段一段）
    { const ironR = new THREE.MeshStandardMaterial({ color: 0x33363a, roughness: 0.5, metalness: 0.6 }), pp = [], segs = []
      let acc = 9, prev = null
      for (let i = 1; i < NP; i++) {
        const k = st.kind[i], open = k === 'gal' || k === 'alc' || (k === 'open' && st.pts[i][0] > 189.5)   /* 2026-11-13 凹槽裡的岩架步道（湖那一側）也要欄杆 */
        if (!open) { prev = null; acc = 9; continue }
        // 2026-11-14 使用者三次圈圖（「欄杆邏輯不對」「中間沒有」「要到岩壁」）：折返平台的欄杆＝下面那段步道外側（湖那邊）那條，
        // 沿同一條線直直往前延伸，一直接到平台盡頭的端牆為止；平台裡面、靠端牆那側都不立柱；上面那段剛離開平台的頭兩點也不立（那邊是平台，不是落差）
        if (st.kind[i] === 'alc') {
          if (st.kind[i - 1] !== 'alc') {
            let s1 = i; while (s1 < NP - 1 && st.kind[s1 + 1] === 'alc') s1++
            const L0 = C3[i - 1], sx = Math.sign(C3[Math.round((i + s1) / 2)].x - L0.x) || 1, dl = L0.z - YOSE.base(L0.x)
            const xEnd = Math.max(...Array.from({ length: s1 - i + 1 }, (_, k) => sx * C3[i + k].x)) * sx + sx * 1.35, yA = C3[i].y
            for (let x = L0.x + sx * 1.3; sx * (xEnd - x) > -0.01; x += sx * 1.3) {
              const xx = sx * (x - xEnd) > 0 ? xEnd : x, q = V(xx, yA, YOSE.base(xx) + dl - 1.2)
              q.sturdy = false; if (prev && prev.distanceTo(q) < 3.8) CHAIN.segs.push([prev, q]); CHAIN.posts.push(q); prev = q
            }
            { const q = V(xEnd, yA, YOSE.base(xEnd) + dl - 1.2); if (prev && prev.distanceTo(q) > 0.3) { CHAIN.segs.push([prev, q]); CHAIN.posts.push(q) } }
          }
          prev = null; continue
        }
        if ((i > 0 && st.kind[i - 1] === 'alc') || (i > 1 && st.kind[i - 2] === 'alc')) { prev = null; continue }
        acc += st.S[i] - st.S[i - 1]; if (acc < 1.35) continue
        acc = 0
        const sd = SIDE[i].z < 0 ? 1 : -1
        const p = C3[i].clone().addScaledVector(SIDE[i], sd * 1.2)
        // 2026-11-12 ChatGPT：整條黑鐵管欄杆像都市樓梯 → 折返平台前後才用鐵管欄杆，一般路段是鑿進岩石的鐵樁＋垂鍊（Angels Landing），賞鳥台外緣是矮石牆
        if ((st.bays ?? []).some((b) => Math.abs(C3[i].x - b.x) < b.half + 0.2 && Math.abs(C3[i].y - b.y) < 0.8)) { prev = null; continue }
        // 2026-11-13（龍岩窟參考圖）：兩段岩廊不用鐵鍊，改成矮石緣上的原木欄杆（下面 WOOD 另外蓋）
        if (st.kind[i] === 'gal' && p.x > YOSE.GAL[0] - 0.5 && p.x < YOSE.GAL[1] + 0.5 && p.y > YOSE.shelfY() - 1.0) { const last = WOOD.at(-1); if (!last || last.at(-1).distanceTo(p) > 3.0) WOOD.push([]); WOOD.at(-1).push(p); prev = null; continue }
        const sturdy = false   // 2026-11-14 使用者「都改鐵鍊」：折返平台、岩壁頂的鐵管欄杆全部換成鐵樁＋鐵鍊
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
    // 2026-11-13 岩廊（龍岩窟參考圖，使用者：「都用 Blender 生成」）：tools/make-gallery-kit.py 做的原木柱、原木橫桿、矮石緣、不規則石板地。
    // 原木掛柳杉樹皮（淋濕褪色的灰褐）、石頭跟石階同一份三向投影石材；石板地另外一份「濕」的（粗糙度 0.32，反光一塊塊不一樣）
    // 2026-11-14 使用者「照這六張做」：岩壁改用 tools/make-sandstone-wall-kit.py 的大塊砂岩（sw_a～d、岩簷 sw_ovh_a/b），一起載進 K
    Promise.all([new GLTFLoader().loadAsync(`models/props/gallery_kit.glb?v=${VER}`), new GLTFLoader().loadAsync(`models/props/sandstone_wall_kit.glb?v=${VER}`).catch(() => null)]).then(([gl, gl2]) => {
      const K = {}
      gl.scene.updateMatrixWorld(true)
      for (const sc2 of [gl.scene, gl2?.scene]) { if (!sc2) continue; sc2.updateMatrixWorld(true); sc2.traverse((o) => { if (o.isMesh) { const gg = o.geometry.clone(); gg.applyMatrix4(o.matrixWorld); if (gg.attributes.color_1) gg.setAttribute('color', gg.attributes.color_1); K[o.name] = gg } }) }   /* 2026-11-14 Blender 匯出的 COLOR_0 是全白，烘好的 AO＋每塊深淺在 COLOR_1（以前石階、石板地一直是平平的白，縫裡沒有暗） */
      const logM = barkMaterial('japanese_cedar_bark', { normal: 1.4, color: [1.5, 1.34, 1.15] }); logM.vertexColors = true
      const wetM = stepM.clone(); wetM.onBeforeCompile = stepM.onBeforeCompile; wetM.customProgramCacheKey = () => 'stepTriplanarWet'; wetM.roughness = 0.3; wetM.envMapIntensity = 1.7; wetM.color.setRGB(0.86, 0.74, 0.58)   /* 參考圖：淋濕的暖褐色砂岩石板，不是冷灰 */
      const L = {}, put = (name, M) => (L[name] ||= []).push(M.clone()), X1 = V(1, 0, 0), q = new THREE.Quaternion(), UPv = V(0, 1, 0)
      const CURB_H = 0.34, POST_H = 0.8   // 柱子從石緣頂面往上 0.8 m（欄杆頂離地板約 1.12 m）
      for (const run of WOOD) for (let k = 0; k < run.length; k++) {
        const p = run[k], dir = run[Math.min(run.length - 1, k + 1)].clone().sub(run[Math.max(0, k - 1)]); dir.y = 0; dir.normalize()
        put('gal_post_' + 'abc'[Math.floor(hsh(p.x * 7.1 + p.z) * 3)], m4.compose(V(p.x, p.y + CURB_H - 0.04, p.z), q.setFromAxisAngle(UPv, hsh(p.x * 3.3) * 6.28), V(1, POST_H, 1)))
        addCollider(p.x, p.z, 0.15, p.y + 1.2, p.y - 0.4)
        if (!k) continue
        const a2 = run[k - 1], d = p.clone().sub(a2), Lh = Math.hypot(d.x, d.z)
        q.setFromUnitVectors(X1, d.clone().normalize())
        for (const [hh, j] of [[0.34, 0], [0.74, 1]]) put('gal_rail_' + 'ab'[(k + j) % 2], m4.compose(a2.clone().add(p).multiplyScalar(0.5).add(V(0, CURB_H + hh, 0)), q, V(d.length() + 0.14, 1, 1)))
        const qf = new THREE.Quaternion().setFromUnitVectors(X1, V(d.x, 0, d.z).normalize())
        put('gal_curb_' + 'abc'[k % 3], m4.compose(V((a2.x + p.x) / 2, Math.min(a2.y, p.y) - 0.04, (a2.z + p.z) / 2), qf, V(Lh + 0.06, 1 + Math.abs(a2.y - p.y) / CURB_H, 1)))
      }
      // 石板地：沿岩廊中線每 0.95 m 一塊（1.0 × 2.4），轉到路的方向
      { const G = YOSE.GAL, inGal = (i) => st.kind[i] === 'gal' && st.pts[i][0] > G[0] - 0.4 && st.pts[i][0] < G[1] + 0.4 && st.yy[i] > SHELF_Y - 1
        let next = -1, nf = 0
        for (let i = 1; i < NP; i++) {
          if (!inGal(i)) { next = -1; continue }
          if (next < 0) next = st.S[i - 1]
          while (next <= st.S[i]) {
            const t = (next - st.S[i - 1]) / Math.max(1e-6, st.S[i] - st.S[i - 1]), c = C3[i - 1].clone().lerp(C3[i], t), tn = TAN[i]
            q.setFromAxisAngle(UPv, Math.atan2(-tn.z, tn.x))
            put('gal_floor_' + 'abc'[nf++ % 3], m4.compose(V(c.x, c.y + 0.004, c.z), q, V(1, 1, 1)))
            next += 0.95
          }
        } }
      // 天然石階：整條崖壁步道的每一階（岩廊段已經是平鋪石板，那幾階本來就縮成 0）
      { const names = ['nat_step_a', 'nat_step_b', 'nat_step_c', 'nat_step_d'].filter((n) => K[n]), flip = new THREE.Matrix4().makeRotationY(Math.PI)
        if (names.length) {
          STEPS.forEach((e, n) => { const nm = names[Math.floor(hsh(n * 3.7 + 1) * names.length) % names.length]; const sc = new THREE.Vector3(); e.m.decompose(new THREE.Vector3(), new THREE.Quaternion(), sc); if (sc.x < 0.01) return
            (L[nm] ||= []).push(hsh(n * 9.1) < 0.5 ? e.m.clone().multiply(flip) : e.m.clone()); (L.__stepC ||= {})[nm] = (L.__stepC?.[nm] || []); L.__stepC[nm].push(e.c) })
          const old = g.getObjectByName('gorgeSteps'); if (old) { g.remove(old); old.geometry.dispose() }
        } }
      // 岩壁：沿整條崖壁步道內側（往岩壁那側 1.25 m＝鑿進去的那面牆）每 2.9 m 貼一片 3 m 寬、3.4 m 高的層疊砂岩；牆面朝步道
      { const names = ['sw_a', 'sw_b', 'sw_c', 'sw_d'].filter((n) => K[n]), ovh = ['sw_ovh_a', 'sw_ovh_b'].filter((n) => K[n]), WFERN = []
        if (names.length) { let acc = 99, k = 0
          for (let i = 1; i < NP; i++) {
            if (st.kind[i] !== 'gal' && st.kind[i] !== 'open') { acc = 99; continue }
            acc += st.S[i] - st.S[i - 1]; if (acc < 4.3) continue; acc = 0
            const sd = SIDE[i].z < 0 ? 1 : -1, inn = SIDE[i].clone().multiplyScalar(-sd)   // 欄杆在 +sd 那側，牆在另一側
            // 2026-11-14 使用者「步道岩壁都做仔細」：岩壁的槽是照 z（同一個 x 往岩壁裡量 1.25 m）切的，以前沿步道的垂直方向退 1.25 m，
            // 岩壁斜著走（每往東 1 m 往北 0.55 m），等於多退了 0.18 m → 一片片岩層幾乎整片埋在岩壁裡、只露出幾塊碎角。改成同一個 x 往裡 1.2 m（比牆面凸出 5 cm）
            const base = st.kind[i] === 'gal' ? V(C3[i].x, C3[i].y, C3[i].z + 1.2) : C3[i].clone().addScaledVector(inn, 1.25)
            const yaw = Math.atan2(-inn.x, -inn.z)                                              // 套件的 +z（凸出那面）朝步道
            // 2026-11-14 這片牆的上面常常就是上一層步道（階地往裡退 2.6 m，牆剛好在上一層外緣的正下方）：兩層高低差不到 3.4 m 的地方，
            // 牆會穿出上一層的地板、在欄杆外面露出一片片單面的岩層（從上面看像飄在空中的薄片）→ 牆頂壓到上一層地板下 0.12 m，太矮就不貼
            const dep = (j) => C3[j].z - YOSE.base(C3[j].x), di = dep(i); let ceil = 1e9; for (let j = 0; j < NP; j++) { const dy = C3[j].y - C3[i].y; if (dy < -0.3 || dy > 14 || dep(j) - di < 1.5 || Math.abs(C3[j].x - base.x) > 2.2) continue; ceil = Math.min(ceil, C3[j].y - 0.3) }   /* 上一層＝更往岩壁裡（深 1.5 m 以上）的那條；折返平台附近兩層幾乎一樣高 → 不貼 */
            // 往上疊到上一層的地板底下（最多三層、約 10 m）；露天、上面沒有步道的地方疊兩層。每層左右錯開一點、高低不一，接縫才不會排成一條線
            const qW = new THREE.Quaternion().setFromAxisAngle(UPv, yaw), top = Math.min(ceil - 0.12, C3[i].y + (ceil < 1e8 ? 10.5 : 6.6))
            let y0w = C3[i].y - 0.25
            for (let c = 0; c < 3 && y0w < top - 1.0; c++) {
              const sy = Math.min(0.95 + 0.12 * hsh(i * 2.3 + c * 5.1), (top - y0w) / 3.6)
              if (sy < 0.3) break
              const sh = c ? (hsh(i * 7.7 + c) - 0.5) * 1.2 : 0, ax = V(-inn.z, 0, inn.x)
              put(names[(k++ + c) % names.length], m4.compose(V(base.x + ax.x * sh, y0w, base.z + ax.z * sh + (c ? 0.03 * c : 0)), qW, V(1 + 0.04 * c, sy, 1)))
              // 概念圖 1、3：頭頂 2.8～3.2 m 偶爾一道往外伸的大岩簷（上面至少還要有 1 m 才放，不然會頂到上一層的地板）
              if (!c && ovh.length && hsh(i * 5.3) < 0.4 && top - (y0w + 3.6 * sy) > 1.0) put(ovh[Math.floor(hsh(i * 9.7) * ovh.length) % ovh.length], m4.compose(V(base.x, C3[i].y + 2.85 + 0.3 * hsh(i * 1.9), base.z + 0.02), qW, V(0.8 + 0.3 * hsh(i * 4.1), 1, 0.9)))
              // 概念圖 1、3：蕨類長在潮濕的縫——牆腳、第一層岩層的頂（岩架）；越靠瀑布越多
              { const wetK = Math.exp(-(((C3[i].x - YOSE.fall.x) / 22) ** 2)), pr = 0.25 + 0.45 * wetK
                if (!c && hsh(i * 3.9) < pr) WFERN.push({ p: V(base.x + ax.x * (hsh(i * 2.2) - 0.5) * 3, C3[i].y - 0.05, base.z - 0.25), s: 0.55 + 0.4 * hsh(i * 6.1) })
                if (hsh(i * 7.1 + c) < pr * 0.8) WFERN.push({ p: V(base.x + ax.x * (hsh(i * 4.4 + c) - 0.5) * 3.4, y0w + 3.6 * sy * (0.45 + 0.4 * hsh(i * 8.3 + c)), base.z + 0.12), s: 0.4 + 0.35 * hsh(i * 5.7 + c), hang: true }) }
              y0w += 3.6 * sy - 0.06
            }
          } }
        if (lib && WFERN.length) { const fn = ['fern_sa', 'fern_sb', 'fern2_b', 'fern2_c', 'fern_a'].filter((n) => lib[n]), fl = {}
          WFERN.forEach((f, j) => { if (!fn.length) return; const e = new THREE.Euler(f.hang ? -0.55 - 0.3 * hsh(j * 1.3) : (hsh(j * 2.1) - 0.5) * 0.3, hsh(j * 3.7) * 6.28, 0, 'YXZ')
            for (let r = 0; r < (f.hang ? 2 : 3); r++) (fl[fn[Math.floor(hsh(j * 5.1 + r) * fn.length) % fn.length]] ||= []).push({ p: f.p.clone().add(V((hsh(j + r * 7) - 0.5) * 0.7, 0, (hsh(j * 2 + r) - 0.5) * 0.2)), q: new THREE.Quaternion().setFromEuler(e), s: V(1, 1, 1).multiplyScalar(f.s * (0.8 + 0.4 * hsh(j * 9 + r))) }) })
          for (const [n, l2] of Object.entries(fl)) scatter(g, lib[n], l2, { cast: false }) } }
      // 2026-11-14 折返平台兩側那面彎的岩壁（階地的端牆）也貼岩層：從平台中心往外打射線找到岩面，照岩面的方向貼兩片、疊兩層
      { const names = ['sw_a', 'sw_b', 'sw_c', 'sw_d'].filter((n) => K[n]), cf = g.getObjectByName('cliffFace'), rc = new THREE.Raycaster(), groups = []
        for (let i = 0; i < NP; i++) if (st.kind[i] === 'alc') { if (!groups.length || groups.at(-1).at(-1) !== i - 1) groups.push([]); groups.at(-1).push(i) }
        if (names.length && cf) for (const G of groups) {
          const c = V(); for (const i of G) c.add(C3[i]); c.multiplyScalar(1 / G.length)
          const sx = Math.sign(c.x - C3[G[0]].x) || 1   /* 半圈往外鼓的那一側（平均點相對起點） */
          let n = 0
          for (const dz of [-2.4, -1.2, 0, 1.2, 2.4]) {
            rc.set(V(c.x, c.y + 1.6, c.z + dz), V(sx, 0, 0)); rc.far = 7
            const h = rc.intersectObject(cf, false)[0]; if (!h || !h.face) continue
            const nW = h.face.normal.clone().transformDirection(cf.matrixWorld); nW.y = 0; if (nW.lengthSq() < 0.2) continue; nW.normalize(); if (nW.x * sx > 0) nW.negate()
            const yaw = Math.atan2(nW.x, nW.z)
            for (let cc = 0, y0 = c.y - 0.25; cc < 2; cc++) { const sy = 0.95 + 0.12 * hsh(G[0] * 3.1 + dz + cc); put(names[(n++ + G[0]) % names.length], m4.compose(V(h.point.x - nW.x * 0.04, y0, h.point.z - nW.z * 0.04), new THREE.Quaternion().setFromAxisAngle(UPv, yaw), V(0.5, sy, 1))); y0 += 3.6 * sy - 0.06 }
          }
        } }
      // 2026-11-14 使用者（圈東頭陡山脊）「生成那種像岩石山、Zion 那種岩石，或者像概念圖這種」：光貼圖還是一面平牆 →
      // 從峽谷這側往山脊打射線，在陡的面上一格一格（橫 4.6 m、高 4.2 m）貼放大的砂岩岩塊（1.3～1.6 倍）、偶爾一道岩簷；
      // 岩塊往岩面裡埋 0.35 m、照岩面的方向轉（岩塊的背面是空的，要埋進去才不會從旁邊看到）
      { const names = ['sw_a', 'sw_b', 'sw_c', 'sw_d'].filter((n) => K[n]), ovh = ['sw_ovh_a', 'sw_ovh_b'].filter((n) => K[n]), terr = [], rc = new THREE.Raycaster()
        scene.traverse((o) => { if (o.isMesh && o.name === 'alpTerrain') terr.push(o) })
        let n = 0
        if (names.length && terr.length) for (let z = 80; z <= 114; z += 4.6) for (let y = 30; y <= 76; y += 4.2) {
          const jz = z + (hsh(z * 3.1 + y) - 0.5) * 1.6, jy = y + (hsh(z + y * 2.7) - 0.5) * 1.2
          rc.set(V(236, jy, jz), V(1, 0, 0)); rc.far = 26
          const h = rc.intersectObjects(terr, false)[0]; if (!h || !h.face || h.point.x < 243 || h.point.x > 262) continue
          const nW = h.face.normal.clone().transformDirection(h.object.matrixWorld); if (Math.abs(nW.y) > 0.62) continue
          if (st.pts.some((q, qi) => Math.abs(q[0] - h.point.x) < 4 && Math.abs(q[1] - h.point.z) < 4 && Math.abs(st.yy[qi] - h.point.y) < 6)) continue   // 步道旁邊不放
          nW.y = 0; nW.normalize()
          const sc = 1.3 + 0.3 * hsh(jz * 1.7 + jy), yaw = Math.atan2(nW.x, nW.z) + (hsh(jz + jy * 5.1) - 0.5) * 0.25
          put(names[n++ % names.length], m4.compose(V(h.point.x - nW.x * 0.35, h.point.y - 1.6 * sc, h.point.z - nW.z * 0.35), new THREE.Quaternion().setFromAxisAngle(UPv, yaw), V(sc, sc, sc)))
          if (ovh.length && hsh(jz * 9.3 + jy) < 0.18) put(ovh[n % ovh.length], m4.compose(V(h.point.x - nW.x * 0.3, h.point.y + 1.9 * sc, h.point.z - nW.z * 0.3), new THREE.Quaternion().setFromAxisAngle(UPv, yaw), V(sc * 0.9, sc * 0.8, sc)))
        }
        console.log('ridge rock blocks', n) }
      const wallM = stepM.clone(); wallM.map = rockTex(); wallM.onBeforeCompile = (sh) => { STEP_BASE_OBC(sh)
        // ChatGPT 砂岩貼圖：4 m 一張、整個顏色用貼圖的（以前是花崗岩貼圖 ×0.7 混灰）
        sh.fragmentShader = sh.fragmentShader.replace(/vTpW\.(zy|xz|xy) \* 0\.45/g, (m0, a) => 'vTpW.' + a + ' * 0.25').replace('diffuseColor *= mix(vec4(0.8), tpC, 0.7);', 'diffuseColor.rgb *= tpC.rgb * 1.9;')
        // 概念圖：暖橘褐砂岩、縫和凹處很暗（對比強）；頂點色裡烘的 AO 再壓深一點
        sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>' + GLSL_VNOISE).replace('#include <color_fragment>', `#include <color_fragment>
          { float l = dot(vColor.rgb, vec3(0.33)); diffuseColor.rgb *= mix(0.55, 1.12, smoothstep(0.25, 0.85, l));
            vec3 n = normalize(vTpN); vec3 p = vTpW;

            float tone = vfbm(vec2(p.x + p.z, p.y * 0.8) * 0.35);                               // 一塊塊偏黃／偏灰
            diffuseColor.rgb *= mix(vec3(0.92, 0.96, 1.04), vec3(1.08, 0.98, 0.86), tone);
            float li = 0.5;   /* 裂、地衣、細層理都在 ChatGPT 的貼圖裡了 */
            float up = smoothstep(0.55, 0.85, n.y), mo = smoothstep(0.45, 0.65, vfbm(p.xz * 1.3 + 7.0));   // 朝上的面：青苔
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.09, 0.15, 0.04) * (0.8 + 0.5 * li), up * mo * 0.85);
            float drip = smoothstep(0.62, 0.8, vfbm(vec2((p.x + p.z) * 2.4, p.y * 0.12)));        // 往下流的深色水痕
            diffuseColor.rgb *= 1.0 - 0.32 * drip * (1.0 - up); }`) }
      wallM.customProgramCacheKey = () => 'sandWallRock'; wallM.color.setRGB(1.0, 0.92, 0.85); addBounce(wallM, 0.3)   // 崖壁的暖砂岩色（石階那份偏冷灰）
      const mats = { post: logM, rail: logM, curb: stepM, floor: wetM, step: stepM, wall: wallM }
      for (const [name, list] of Object.entries(L)) {
        if (!K[name] || !list.length) continue
        if (name.startsWith('__')) continue
        const kind = name.startsWith('wall_') || name.startsWith('sw_') ? 'wall' : name.split('_')[1]
        const im = new THREE.InstancedMesh(K[name], mats[kind], list.length)
        const warm = new THREE.Color()
        list.forEach((mm, k) => { im.setMatrixAt(k, mm); const cc = L.__stepC?.[name]?.[k]; if (cc) im.setColorAt(k, cc); else if (kind === 'wall') im.setColorAt(k, warm.setRGB(0.92 + 0.12 * hsh(k * 1.7), 0.92 + 0.08 * hsh(k * 2.9), 0.92)) })   // 岩壁：每片暖砂岩色、深淺差一點
        im.castShadow = true; im.receiveShadow = true; im.computeBoundingSphere(); im.name = 'galKit_' + name; g.add(im)
      }
    }).catch((e) => console.error('gallery kit', String(e?.stack ?? e)))
    // Blender 做的石板踏板（tools/make-gorge-rock-kit.py 裡的 step_a～d；同一份套件裡的岩拱、岩棚、緣石、掛燈是隧道用的，2026-11-12 隧道拆掉後不再用）：四種輪流、一半轉 180 度，載好就換掉上面的方塊
    new GLTFLoader().loadAsync(`models/props/gorge_rock_kit.glb?v=${VER}`).then((gl) => {
      const K = {}
      gl.scene.traverse((o) => { if (!o.isMesh) return; const ge = o.geometry.clone(); o.updateWorldMatrix(true, false); ge.applyMatrix4(o.matrixWorld); if (!ge.attributes.color && ge.attributes.color_1) ge.setAttribute('color', ge.attributes.color_1); K[o.name] = ge })
      const inst = (geo, list, mat, shadow = true) => { if (!geo || !list.length) return null; const im = new THREE.InstancedMesh(geo, mat, list.length); list.forEach((e, k) => { im.setMatrixAt(k, e.m); if (e.c) im.setColorAt(k, e.c) }); im.castShadow = shadow; im.receiveShadow = true; im.computeBoundingSphere(); g.add(im); return im }
      // 踏板：四種石板輪流用，一半轉 180 度
      // 2026-11-13 使用者：「你也沒用 Blender 做啊，石階、岩壁」→ 方方正正的 step_a～d 不用了，改成 gallery_kit 的天然石階（下面 gallery kit 載好再換）
      if (false) { const names = ['step_a', 'step_b', 'step_c', 'step_d'].filter((n) => K[n]), lists = names.map(() => []), flip = new THREE.Matrix4().makeRotationY(Math.PI)
        if (names.length) {
          STEPS.forEach((e, n) => { const k = Math.floor(hsh(n * 3.7 + 1) * names.length) % names.length; lists[k].push({ m: hsh(n * 9.1) < 0.5 ? e.m.clone().multiply(flip) : e.m, c: e.c }) })
          names.forEach((n, k) => { const im = inst(K[n], lists[k], stepM); if (im) im.name = 'gorgeSteps_' + n })
          const old = g.getObjectByName('gorgeSteps'); if (old) { g.remove(old); old.geometry.dispose() }
        } }
    }).catch((e) => console.error('gorge rock kit', String(e?.stack ?? e)))
    // 岩壁頂上：觀景台（瀑布口東邊）欄杆＋後面不能走出去
    const posts = []
    for (let x = 201.4; x < 250; x += 0.9) if (x < 236.4 || x > 243.2) posts.push(V(x, YOSE.topY(x), YOSE.topFront(x) + 0.15))   /* 2026-11-12 新的崖壁步道從 x 237～243 上來 */   // 2026-11-12 前緣整排欄杆，步道上來的地方（x 210～214）留開口
    for (let z = YOSE.topFront(201.4) + 0.15; z < YOSE.edge(201.4) - 2.2; z += 0.9) posts.push(V(201.3, YOSE.topY(201.3), z))   // 西邊（溪那側）
    for (const p of posts) addCollider(p.x, p.z, 0.2, p.y + 1.1, p.y)
    for (let x = 201.2; x < 251; x += 1) addCollider(x, YOSE.edge(x) - 1.9, 0.35, topYm + 3, topYm - 1.5)   // 2026-11-12 加底：沒有底的碰撞體會連岩體裡的隧道步道一起擋住
    // 2026-11-14 使用者「都改鐵鍊」：岩壁頂前緣也是鐵樁＋垂鍊（每隔一根取一根，跨距約 1.8 m）
    { let pv = null; posts.forEach((p, i) => { if (i % 2 && i !== posts.length - 1) return; if (pv && pv.distanceTo(p) < 2.6) CHAIN.segs.push([pv, p]); CHAIN.posts.push(p); pv = p }) }

    // 岩壁頂上的溪：從後面（玻璃前）流到瀑布口，越靠瀑布口越寬、越快；兩岸一顆顆花崗岩
    {
      const F2 = YOSE.fall, zLip = YOSE.base(F2.x) + 0.45 + YOSE.rec(F2.x), zSrc = 101.6, NS = 40, P = [], U = [], I = []   // 2026-11-10 起點改在上游小溪接進來的地方（以前從公園邊界憑空冒出來）
      const cx = (t) => F2.x + 1.6 * Math.sin(t * 2.6 + 0.5) * (1 - t) - 0.8 * (1 - t)
      for (let i = 0; i <= NS; i++) {
        const t = i / NS, z = lerpN(zSrc, zLip, t), x = cx(t), w = lerpN(1.6, 4.0, t * t * t), dy = 0.07 - 0.02 * t   // 2026-11-13 Pass 1A：接近岩唇展到 8 m 寬的匯流岩槽（接上段 6 股，頂寬 7.6 m）
        P.push(x - w, YOSE.topY(x - w) + dy, z, x + w, YOSE.topY(x + w) + dy, z); U.push(0, t * 5, 1, t * 5)
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
          // 2026-11-14 山頂湖的出水小溪（layout.js YOSE.slakeOut）：湖面 → 平台上的溪；水面高度照湖面慢慢降到平台（溝是 yosemite-top.js 的山體挖的）
          { pts: YOSE.slakeOut, w: [0.75, 0.95], spd: 0.75, a: 0.85, gy: (t) => lerpN(YOSE.slakeW() + 0.03, YOSE.topY(205) + 0.07, t) },
          { pts: [[POOL.x - POOL.rx + 0.3, POOL.z - 0.2], [233, back(233)], [228, back(228)], [222, back(222)], [216, back(216)], [210, back(210)], [205, back(205) - 0.5], [201.2, 101]], w: [0.9, 1.1], spd: 0.45, a: 0.82 },
        ]
        for (const R of runs) {
          const pts = R.pts.map(([x, z]) => V(x, 0, z)), curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal'), Lr = curve.getLength(), NSr = Math.ceil(Lr / 0.4), P2 = [], U2 = [], I2 = []
          for (let i = 0; i <= NSr; i++) {
            const t = i / NSr, p = curve.getPointAt(t), tg = curve.getTangentAt(t), w = lerpN(R.w[0], R.w[1], t) * (0.85 + 0.15 * Math.sin(t * 17)), nx = -tg.z, nz = tg.x
            for (const sd of [-1, 1]) { const x = p.x + nx * w * sd, z = p.z + nz * w * sd; P2.push(x, R.gy ? R.gy(t) : groundY(x, z) + 0.07, z) }
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
    if (Math.hypot(x - CAMP.x, z - CAMP.z) < CAMP.R + 4 || YOSE.behind(x, z) || YOSE.inArch(x, z, 2.5) || YOSE.inLake(x, z, 4) || alpineStreamDist(x, z) < 4) continue   // 營地裡、石階、湖、河上不長
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
    const LK = YOSE.lake, ok = (x, z) => !YOSE.behind(x, z) && !YOSE.inArch(x, z, 2.5) && alpineTrailDist(x, z) > 1.3 && alpineStreamDist(x, z) > 1.6 && !YOSE.inLake(x, z, 0.4) && domeRho(x, z) < 0.93
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
      // 2026-11-13 使用者（沿步道逐幀看）「欄杆錯誤」：舊版是「每一段各自往外偏 1.2 m」。轉角處相鄰兩段的偏移點會互相擠進走道，
      // 被擠到的柱子就整根不立，但 prev 沒有跟著清掉，橫桿還是硬連到下一根（距離 >2.2 m 就乾脆不畫）→ 欄杆變成一截一截。
      // 而且柱子高度取腳下地形，路肩的地會往下掉，柱子就忽高忽低、看起來懸空。
      // 改法：(1) 先把整條路的偏移線算出來（轉角走角平分線、並補長度），偏移線本身就連續，不用再剔除柱子；
      //      (2) 欄杆頂面跟著步道的縱斷面（prof）走，柱子再各自往下長到地面，所以高度一致、腳也踩得到地。
      const LK = YOSE.lake
      const P = sp.pts, RP = P.slice(2)
      const sgn = (() => { const [ax, az] = RP[0], [bx, bz] = RP[RP.length - 1], L = Math.hypot(bx - ax, bz - az), nx = -(bz - az) / L, nz = (bx - ax) / L
        return (LK.x - (ax + bx) / 2) * nx + (LK.z - (az + bz) / 2) * nz > 0 ? 1 : -1 })()
      const segN = []
      for (let i = 1; i < RP.length; i++) { const dx = RP[i][0] - RP[i - 1][0], dz = RP[i][1] - RP[i - 1][1], L = Math.hypot(dx, dz); segN.push([-dz / L, dx / L]) }
      const off = RP.map((q, i) => {
        const a = segN[Math.max(0, i - 1)], b = segN[Math.min(segN.length - 1, i)]
        let nx = a[0] + b[0], nz = a[1] + b[1]; const L = Math.hypot(nx, nz) || 1; nx /= L; nz /= L
        const k = 1.2 / Math.max(0.55, nx * b[0] + nz * b[1])   // 角平分線要拉長，轉角的淨距才跟直線段一樣
        return [q[0] + nx * sgn * k, q[1] + nz * sgn * k]
      })
      const OS = [0]; for (let i = 1; i < off.length; i++) OS.push(OS[i - 1] + Math.hypot(off[i][0] - off[i - 1][0], off[i][1] - off[i - 1][1]))
      const rail = []
      for (let d = 0; d <= OS[OS.length - 1] + 1e-6; d += 1.4) {
        let i = 1; while (i < off.length - 1 && OS[i] < d) i++
        const t = (d - OS[i - 1]) / Math.max(1e-6, OS[i] - OS[i - 1])
        rail.push([off[i - 1][0] + (off[i][0] - off[i - 1][0]) * t, off[i - 1][1] + (off[i][1] - off[i - 1][1]) * t])
      }
      // 欄杆頂面的高度＝離中線最近那一點的步道縱斷面高
      const pathY = (x, z) => {
        let best = 1e9, by = alpineHeight(x, z)
        for (let i = 1; i < P.length; i++) {
          const [ax, az] = P[i - 1], [bx, bz] = P[i], dx = bx - ax, dz = bz - az
          const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)))
          const dd = Math.hypot(x - ax - dx * t, z - az - dz * t)
          if (dd < best) { best = dd; by = (+sp.prof[i - 1]) + ((+sp.prof[i]) - (+sp.prof[i - 1])) * t }
        }
        return by
      }
      let prev = null
      // 2026-11-12 使用者：走到瀑布後面就是死路，往上的步道接不過去——平台那半圈欄杆剛好橫在上山步道（YOSE.stairs）的起點上。
      // 上山步道頭 14 個點兩側 1.5 m 內不立欄杆（開一個口，從平台直接走上去）
      const stP = YOSE.stairs().pts.slice(0, 15)
      const onStairs = (x, z) => { for (let i = 1; i < stP.length; i++) { const [ax, az] = stP[i - 1], [bx, bz] = stP[i], dx = bx - ax, dz = bz - az, t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz))); if (Math.hypot(x - ax - dx * t, z - az - dz * t) < 1.5) return true } return false }
      for (const [x, z] of rail) {
        if (onStairs(x, z)) { prev = null; continue }   // 開口：橫桿也要跟著斷，不能飛過去
        const top = pathY(x, z) + 1.1
        const gy = Math.min(alpineHeight(x, z), top - 0.75)   // 柱腳踩到地：路肩比路面低就把柱子加長
        const len = top - gy + 0.06
        parts2.push(post.clone().scale(1, len, 1).translate(x, top - len / 2, z))
        if (prev && Math.hypot(prev[0] - x, prev[2] - z) < 2.2) CHAIN.segs.push([V(prev[0], prev[1] - 1.1, prev[2]), V(x, top - 1.1, z)])   // 2026-11-14 使用者「都改鐵鍊」：橫桿換成垂鍊（鍊子掛在柱頂下 0.18 m）
        prev = [x, top, z]
        addCollider(x, z, 0.12, top + 0.1)
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
    { const lit = 0.1 + 0.9 * dayLight.value
      for (const sp of mist) { const u = sp.userData, ph = ((t * 0.05 * u.drift + u.ph / TAU) % 1)   // 順著風（往湖面、微微往東）飄出去再從落水處重來，頭尾淡入淡出
        sp.material.opacity = u.k * (0.75 + 0.25 * Math.sin(t * 0.6 + u.ph)) * Math.sin(Math.PI * ph)
        sp.material.color.setScalar(lit)
        sp.position.set(u.p0.x + Math.sin(t * 0.13 + u.ph) * 1.2 + ph * 1.5 * u.drift, u.p0.y + Math.sin(t * 0.21 + u.ph) * 0.6 + ph * 1.2, u.p0.z - ph * 3.0 * u.drift) } }
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
        // 2026-11-14 使用者「枯木位置」：岩壁東端轉角的岩面上長出來的一棵。模型本身往 -z 斜伸 5 m
        const extra = []   // 山脊上那幾棵使用者說不要（只留岩壁轉角這棵）
        { const cf = g.getObjectByName('cliffFace'), rc = new THREE.Raycaster()
          for (const [cx, cy, yaw, sc] of [[247.6, 54.5, 0.3, 1.0]]) { rc.set(V(cx, cy, 60), V(0, 0, 1)); const h = cf ? rc.intersectObject(cf, false)[0] : null; if (h) extra.push({ x: cx, y: cy, z: h.point.z + 0.35, yaw, s: sc }) } }
        for (const e of extra) { const t2 = new THREE.Mesh(geo, m); t2.name = 'gorgeSnag'; t2.position.set(e.x, e.y, e.z); t2.rotation.y = e.yaw; t2.scale.setScalar(e.s); t2.castShadow = true; t2.receiveShadow = true; g.add(t2) }
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
