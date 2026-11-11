// 帳篷區後面的優勝美地風（2026-11-10）：yose 支線（主線第 13 點 → 營地）北邊，沿著溫室玻璃的邊緣立一整面花崗岩壁
// 岩壁：灰白、縱向一條條的稜溝（冰河磨過的花崗岩），表面有黑色的水痕（沿岩壁流下的水染黑）、淡色的剝落面；頂上往後收到玻璃邊
// 瀑布：從岩壁頂一條細長的水簾（像優勝美地瀑布），落到岩壁下的水潭，濺起水霧
// 樹：西黃松（Ponderosa）——高、直、橘紅色的鱗片樹皮，樹冠只在上半段、一簇簇的長針葉；這一區原本的冷杉、鐵杉讓開（alpine.js 用 inYose）
import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { ALP_SPURS, alpineHeight, alpineTrailDist, alpineStreamDist, domeRho, domeY, addCollider, YOSE, CAMP, EAST } from './layout.js'
import { mulberry32, fbm2 } from './noise.js'
import { coniferGeo, needleMaterial } from './alpine.js'
import { barkMaterial } from './bark.js'
import { parts, scatter } from './plants.js'
import { bladeMesh } from './flora.js'

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
  const M0 = YOSE.mist
  const g = new THREE.Group(); g.name = 'yosemite'; scene.add(g)
  const rnd = mulberry32(1851)
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = V()

  // ---------- 岩壁 ----------
  // 每一欄（沿 x）一個斷面：牆腳在 YOSE.base(x)，往上幾乎垂直（微微往後仰），頂上往後收到玻璃邊
  // 2026-11-10 使用者：「你現在根本低模」→ 岩壁一欄 44 排 → 100 排；瀑布那一帶（176～214）一欄 0.25 m（其他 0.5 m）
  const X0 = YOSE.x0, X1 = YOSE.x1, FACE = 100, TOP = 14   // 頂面 6→14 排：才畫得出岩縫、磨光面（2026-11-10）
  const XS = []; for (let x = X0; x < X1 - 1e-6;) { XS.push(x); x += x >= 176 && x < 214 ? 0.25 : 0.5 } XS.push(X1)
  const NX = XS.length - 1
  const pos = [], col = [], uv = [], idx = [], caveQ = [], ledgeSpots = []
  const cols = []
  // 岩簷＋層理：這一欄的岩面斷面（d＝離牆腳往裡幾公尺、y），照弧長重新取 FACE+1 個點
  const hsh = (n) => { const v = Math.sin(n * 127.1 + 311.7) * 43758.5453; return v - Math.floor(v) }
  const SED = (x) => ss(172, 184, x) * ss(216, 207, x)   // 層狀、深褐、潮濕的岩壁範圍（松龍岩那種），兩側慢慢回到花崗岩
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
    if (A > 0.02) {
      P.push([0, g0 - 1.5, 0], [Dp * 0.5, g0 - 1.5, 1], [Dp, g0 - 1.5, 1])
      for (let j = 0; j <= 10; j++) P.push([Dp + 0.6 * A * Math.sin(j / 10 * Math.PI), g0 - 1.5 + (Ho * 0.5 + 1.5) * j / 10, 1])
      for (let j = 1; j <= 16; j++) { const th = j / 16 * Math.PI / 2; P.push([lip + (Dp - lip) * Math.cos(th), g0 + Ho * 0.5 + Ho * 0.5 * Math.sin(th), 1 - 0.7 * j / 16]) }
      P.push([lip - 0.35 * A, yL + 0.5, 0], [lip * 0.6, yL + 1.6, 0])
      for (let y = yL + 2.5; y < yTop; y += 0.5) P.push([Math.min(lip * 0.6 * ss(yL + 8, yL + 2, y), 0) + normalD(y) * ss(yL + 2, yL + 9, y), y, 0])
    } else for (let y = g0 - 1.5; y < yTop; y += 0.5) P.push([normalD(y), y, 0])
    P.push([normalD(yTop), yTop, 0])
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
    return out
  }
  for (let i = 0; i <= NX; i++) {
    const x = XS[i], zb = YOSE.base(x), ze = YOSE.edge(x) - 0.8
    const g0 = alpineHeight(x, zb)
    const Ht = YOSE.Ht(x)   // layout.js：兩端收矮；瀑布口到石階頂那段頂上是平的
    // 2026-11-11 石階平台那一段（XA～XB）：岩壁本體往後退到最上一層平台的後面，前面是一階一階的平台（下面另外畫）
    const M = YOSE.mist, terr = x > M.XA - 1.6 && x < M.XB + 1.6, push = terr ? zb + M.D0 + M.W * (M.NL - 0.5) + 0.15 : -1e9, fk = YOSE.flatK(x)
    const fallK = Math.exp(-(((x - YOSE.fall.x) / 8) ** 2))   // 瀑布口那幾公尺：岩壁不往後仰、頂上不凸，水簾貼著岩壁落下（以前瀑布口浮在岩壁前面）
    const row = []
    const prof = faceProfile(x, zb, g0, Ht, push, fallK), sed = SED(x)
    cols.push({ x, zb, g0, Ht, terr, lip: prof.lip })
    for (let k = 0; k <= FACE + TOP; k++) {
      let y, z
      if (k <= FACE) {
        y = prof[k][0]; z = prof[k][1]
      } else {
        const t = (k - FACE) / TOP, z0 = Math.max(zb + 3.0 - 2.4 * fallK, push)
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
        let r0 = lerpN(0.38, 0.14, wetF), g0c = lerpN(0.32, 0.145, wetF), b0 = lerpN(0.26, 0.12, wetF)
        r0 = lerpN(r0, 0.11, deep * 0.7); g0c = lerpN(g0c, 0.115, deep * 0.7); b0 = lerpN(b0, 0.1, deep * 0.7)
        const crackD = 1 - 0.6 * Math.min(1, jnt * 2.2)
        r0 *= tone * crackD * (1 - streak * 0.35); g0c *= tone * crackD * (1 - streak * 0.35); b0 *= tone * crackD * (1 - streak * 0.35)
        const moss = Math.min(1, ledge * (0.4 + 0.7 * wetF) + Math.min(1, jnt * 2) * 0.5 * wetF + 0.6 * Math.max(0, fbm2(px * 0.6, py * 0.5 + 7, 3) - 0.55) * 2 * wetF) * (1 - 0.7 * deep)
        const cr = lerpN(r0, 0.09, moss), cg2 = lerpN(g0c, 0.17, moss), cb = lerpN(b0, 0.07, moss)
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
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vTpW; varying vec3 vTpN;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvTpW = (modelMatrix * vec4(transformed, 1.0)).xyz; vTpN = normalize(mat3(modelMatrix) * objectNormal);')
    // 2026-11-10 使用者「低模」：加凹凸（用貼圖亮度當高度，螢幕空間導數擾動法線；不靠 UV）
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
      varying vec3 vTpW; varying vec3 vTpN; float tpH;
      vec3 tpPerturb(vec3 surf_pos, vec3 surf_norm, vec2 dHdxy, float faceDirection) {
        vec3 vSigmaX = normalize(dFdx(surf_pos)), vSigmaY = normalize(dFdy(surf_pos)), vN = surf_norm;
        vec3 R1 = cross(vSigmaY, vN), R2 = cross(vN, vSigmaX); float fDet = dot(vSigmaX, R1) * faceDirection;
        vec3 vGrad = sign(fDet) * (dHdxy.x * R1 + dHdxy.y * R2); return normalize(abs(fDet) * surf_norm - vGrad);
      }`)
      .replace('#include <map_fragment>', `
        vec3 tpB = pow(abs(normalize(vTpN)), vec3(5.0)); tpB /= (tpB.x + tpB.y + tpB.z + 1e-4);
        vec4 tpC = texture2D(map, vTpW.zy * 0.3) * tpB.x + texture2D(map, vTpW.xz * 0.3) * tpB.y + texture2D(map, vTpW.xy * 0.3) * tpB.z;
        vec4 tpL = texture2D(map, vTpW.zy * 0.045 + 0.37) * tpB.x + texture2D(map, vTpW.xz * 0.045 + 0.61) * tpB.y + texture2D(map, vTpW.xy * 0.045 + 0.13) * tpB.z;
        vec4 tpM = texture2D(map, vTpW.zy * 0.11 + 0.21) * tpB.x + texture2D(map, vTpW.xz * 0.11 + 0.47) * tpB.y + texture2D(map, vTpW.xy * 0.11 + 0.71) * tpB.z;
        tpH = dot(tpC.rgb, vec3(0.33)) * 0.35 + dot(tpM.rgb, vec3(0.33)) * 0.9 + dot(tpL.rgb, vec3(0.33)) * 1.6;
        diffuseColor *= mix(tpC, tpC * (0.75 + 0.5 * tpL), 0.6);`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        { float dist = length(vViewPosition); vec2 dH = vec2(dFdx(tpH), dFdy(tpH)) * 2.2 * smoothstep(90.0, 15.0, dist); normal = tpPerturb(-vViewPosition, normal, dH, faceDirection); }`)
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
  for (const c of cols) if (!(c.x > YOSE.mist.XA - 3.4 && c.x < YOSE.mist.XB + 3.4) && YOSE.caveA(c.x) < 0.08 && Math.abs(c.x * 2 - Math.round(c.x * 2)) < 1e-6 && Math.round(c.x * 2) % 3 === 0) addCollider(c.x, c.zb + 0.9, 1.3, c.g0 + c.Ht)
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
      if (alpineTrailDist(x, z) < 3.2 + k2 * (n === 'boulder' ? 2.2 : 0.7) || inPool(x, z, 0.6) || YOSE.inLake(x, z, 1.5) || alpineStreamDist(x, z) < 2.5 || (x > YOSE.mist.XA - 5 && x < YOSE.mist.XB + 5)) continue
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
    sheet(2.6, 4.4, 0.25, 2.2, fallMat({ spd: 0.7, a: 0.55, dark: 0.35 }), 3)          // 後層（2026-11-10 底部收窄，整片落在湖面上）
    sheet(3.0, 5.4, 0.5, 3.6, fallMat({ spd: 1.0, a: 1.0 }), 4)                         // 主水簾（岩壁變高了，下面往外拋多一點）
    sheet(3.6, 6.4, 0.9, 4.6, fallMat({ spd: 1.35, a: 0.45, low: 1 }), 5, 0.3)          // 前面的水霧簾
    // 水潭：橢圓、深綠帶一點藍
    const poolM = new THREE.MeshStandardMaterial({ color: 0x2c5a55, roughness: 0.06, metalness: 0.15, transparent: true, opacity: 0.9 })
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

  // ---------- 瀑布步道（2026-11-11 重做）：岩壁被鑿成 8 層平台、之字形石階一路爬到岩壁頂 ----------
  // 1) 平台的石壁：一張網格（x × 高度），每個高度 y 的「前緣」在哪一層：y 在第 k 段和第 k+1 段踏面之間 → 前緣＝第 k 段的內側（d_k＋W/2）。
  //    踏面那一排網格剛好跨過一層，等於一塊平台；石壁表面往裡加一點凹凸（只往裡，不會擋到步道）
  // 2) 石階：每 0.2 公尺一階的花崗岩踏板（踏板下面墊高，蓋住平台）
  // 3) 外側矮石牆：一顆顆花崗岩砌的（像優勝美地步道邊那種），轉彎處留開口
  // 4) 兩端的側面封起來；頂上：觀景台欄杆、溪從後面流到瀑布口
  {
    const M = YOSE.mist, st = YOSE.stairs(), XL = M.XA - 1.3, XR = M.XB + 1.3, topYm = YOSE.topY(M.XB)
    const dEdge = (x, k) => YOSE.base(x) + M.D0 + M.W * k + M.W / 2          // 第 k 段的內側（上一層石壁的腳）
    const Hk = (k, x) => st.legH(k, x)
    // 2026-11-10 ChatGPT QA：石階右半邊一條條閃的條紋＝這片石壁在兩層之間轉折的那條斜面（照坡道高度 Hk）從踏板中間穿出來（踏板是一階一階的，斜面忽上忽下）。
    // 轉折點壓低 0.25 公尺：斜面永遠藏在踏板底下
    const DROP = 0.25
    // 第二輪（ChatGPT：上段岩壁頂一排直條紋仍在）：轉折以前是硬切（高度網格 0.12 公尺一排，斜的轉折線切成鋸齒）→ 改成 0.36 公尺內平滑過渡，鋸齒變成一道緩的岩階
    const B = 0.18
    const faceZ = (x, y) => {
      let z = YOSE.base(x) + M.D0 - M.W / 2
      z += (dEdge(x, 0) - z) * ss(Hk(0, x) - DROP - B, Hk(0, x) - DROP + B, y)
      for (let k = 0; k < M.NL - 1; k++) z += (dEdge(x, k + 1) - dEdge(x, k)) * ss(Hk(k + 1, x) - DROP - B, Hk(k + 1, x) - DROP + B, y)
      return z
    }
    // 2026-11-11 使用者：平台兩端那條白白的直縫 → 不再用一片平的側面封口；平台在兩端外面 TAP 公尺內慢慢「收」回岩壁裡
    // （每個高度的前緣從平台的前緣，平滑地退回原本岩壁的表面），看起來是岩壁自己的一道突出的岩稜
    const TAP = 3.2, cliffZ = (x, y) => { const zb = YOSE.base(x), v = Math.min(1, Math.max(0, (y - YOSE.g0(x) + 1.5) / (YOSE.Ht(x) + 1.5))); return zb + v * 1.8 + ss(0.9, 1, v) * 1.2 - 0.25 }
    const faceAt = (x, y) => {
      if (x >= XL && x <= XR) return faceZ(x, y)
      const xe = x < XL ? XL : XR, t = ss(0, 1, Math.abs(x - xe) / TAP)   // 0＝平台端、1＝回到岩壁
      return lerpN(faceZ(xe, y), Math.max(faceZ(xe, y), cliffZ(x, y)), t)
    }
    const XL2 = XL - TAP, XR2 = XR + TAP
    const yLo = Math.min(st.h0, alpineHeight(XR, YOSE.base(XR) + M.D0)) - 2.5, NXF = Math.round((XR2 - XL2) / 0.3), NYF = Math.round((topYm + 0.05 - yLo) / 0.12)
    const fp = [], fu = [], fc = [], fi = []
    for (let i = 0; i <= NXF; i++) {
      const x = XL2 + (XR2 - XL2) * i / NXF
      for (let j = 0; j <= NYF; j++) {
        const y = yLo + (topYm + 0.05 - yLo) * j / NYF, z0 = faceAt(x, y)
        // 2026-11-10 ChatGPT QA：內側岩壁像一面平滑的水泥牆 → 大塊凹凸（每 1～3 公尺、深 10～35 公分）＋ 直的節理裂縫 ＋ 細碎起伏；一樣只往裡凹（不擋石階）
        const crack = 0.22 * Math.pow(Math.max(0, 1 - Math.abs(Math.sin(x * 1.9 + 1.3 * fbm2(x * 0.2, y * 0.15, 2)))), 6)
        const bump = 0.9 * Math.max(0, fbm2(x * 0.45, y * 0.38, 3) - 0.15) + 0.1 * Math.abs(fbm2(x * 1.6, y * 1.3 + 4, 2)) + crack + 0.08 * Math.sin(x * 2.3 + y * 0.7)
        const edge = x < XL || x > XR ? ss(0, 1, Math.min(Math.abs(x - XL), Math.abs(x - XR)) / TAP) : 0
        const z = z0 + Math.max(0, bump) * (1 - edge) + edge * 0.6 * (fbm2(x * 0.35, y * 0.3, 3) - 0.5)   // 收回岩壁那段：凹凸改成跟岩壁一樣的大塊起伏
        fp.push(x, y, z); fu.push(x * 0.22, y * 0.22)
        // 2026-11-10 ChatGPT QA：石壁一整片淺灰像水泥牆 → 底色壓暗、加往下流的水痕（垂直深色條）、每層踏面下緣一圈青苔、越低越髒
        let dTop = 9; for (let k = 0; k < M.NL; k++) { const hk = Hk(k, x); if (hk >= y) dTop = Math.min(dTop, hk - y) }
        const moss = 0.65 * ss(0.7, 0.05, dTop) * (0.6 + 0.4 * fbm2(x * 0.8, y * 0.8 + 3, 2))
        const streak = Math.max(0, fbm2(x * 1.6 + 4, y * 0.05, 2) - 0.35) * 1.1, low = 0.12 * ss(st.h0 + 3, st.h0 - 1, y)
        const kc = (0.66 + 0.24 * fbm2(x * 0.3, y * 0.3 + 9, 2)) * (1 - streak - low)
        fc.push(kc * (1 - 0.38 * moss), kc * (1 - 0.1 * moss), kc * (0.97 - 0.5 * moss))
      }
    }
    const R = NYF + 1
    for (let i = 0; i < NXF; i++) for (let j = 0; j < NYF; j++) { const a = i * R + j, b = a + R; fi.push(a, b, a + 1, a + 1, b, b + 1) }
    // 兩端側面：從石壁前緣一路接到後面的岩壁本體
    const cap = (x, flip) => {
      const base = fp.length / 3, zBack = YOSE.base(x) + M.D0 + M.W * (M.NL - 0.5) + 0.3
      for (let j = 0; j <= NYF; j++) { const y = yLo + (topYm + 0.05 - yLo) * j / NYF; fp.push(x, y, faceZ(x, y) - 0.02, x, y, zBack); fu.push(0, y * 0.22, 3, y * 0.22); fc.push(0.9, 0.9, 0.88, 0.9, 0.9, 0.88) }
      for (let j = 0; j < NYF; j++) { const a = base + j * 2, b = a + 1, c = a + 2, d = a + 3; if (flip) fi.push(a, b, c, b, d, c); else fi.push(a, c, b, b, c, d) }
    }
    const tg = new THREE.BufferGeometry()
    tg.setAttribute('position', new THREE.Float32BufferAttribute(fp, 3)); tg.setAttribute('uv', new THREE.Float32BufferAttribute(fu, 2)); tg.setAttribute('color', new THREE.Float32BufferAttribute(fc, 3))
    tg.setIndex(fi); tg.computeVertexNormals()
    const terr = new THREE.Mesh(tg, cliffM); terr.castShadow = true; terr.receiveShadow = true; g.add(terr)

    // 石階：每一階一塊花崗岩踏板，下面墊到平台（看不到懸空）
    // 2026-11-10 ChatGPT QA：踏板是盒子，整張花崗岩圖照 UV 貼在 3 公尺寬的側面上，白色晶斑被放大成一個個白色「鳥形」→ 也改成照世界座標投影（triplanar），不用 UV、不用法線圖
    const stepM = new THREE.MeshStandardMaterial({ map: cliffM.map, color: 0xc4c0b8, roughness: 0.88 })
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
    stepM.customProgramCacheKey = () => 'stepTriplanar'
    const steps = []
    // 轉彎（水平半圓）：圓心＝這段終點（段尾縮進 1.5 m 的那點），side：西端 -1、東端 +1；rO＝外緣半徑
    const turns = []
    for (let i = 1; i < st.pts.length; i++) if (st.legOf[i] === -2 && st.legOf[i - 1] >= 0) {
      const k = st.legOf[i - 1], [ex, ez] = st.pts[i - 1], side = k % 2 === 0 ? -1 : 1
      turns.push({ k, cx: ex, cz: ez + M.W / 2, side, s: st.S[i - 1], rO: M.W / 2 + (M.W - 0.45) / 2 })
    }
    const stepTop = (s) => Math.floor(st.h(s) / 0.2) * 0.2 + 0.2
    const inTurn = (b) => turns.some((t) => (b.p.x - t.cx) * t.side > -0.35 && Math.hypot(b.p.x - t.cx, b.p.z - t.cz) < t.rO + 0.6)
    let lastY = -1e9
    for (let s0 = 0.2; s0 < st.L; s0 += 0.1) {
      const y = Math.floor(st.h(s0) / 0.2) * 0.2 + 0.2
      if (y === lastY) continue
      lastY = y
      // 這一階從 s0 到下一階開始（同一高度那一段）的中間
      let s1 = s0; while (s1 < st.L && Math.floor(st.h(s1) / 0.2) * 0.2 + 0.2 === y) s1 += 0.05
      const pa = at(st, s0), pb = at(st, Math.min(st.L, s1)), mx = (pa[0] + pb[0]) / 2, mz = (pa[1] + pb[1]) / 2, len = Math.hypot(pb[0] - pa[0], pb[1] - pa[1]) + 0.06
      const yaw = Math.atan2(pb[0] - pa[0], pb[1] - pa[1]), under = Math.min(1.4, y - alpineHeight(mx, mz) + 0.5)
      steps.push({ p: V(mx, y - under / 2, mz), yaw, s: V(M.W - 0.45, Math.max(0.2, under), Math.max(0.15, len)), c: 0.9 + rnd() * 0.18 })
    }
    function at(st, s) { let i = 1; while (i < st.S.length - 1 && st.S[i] < s) i++; const u = (s - st.S[i - 1]) / Math.max(1e-6, st.S[i] - st.S[i - 1]); return [lerpN(st.pts[i - 1][0], st.pts[i][0], u), lerpN(st.pts[i - 1][1], st.pts[i][1], u)] }
    const box = new THREE.BoxGeometry(1, 1, 1)
    {
      // 2026-11-10 ChatGPT QA：一階一個灰色方盒子太整齊 → 每階 1～3 塊不規則花崗岩石板（55% 一塊、35% 兩塊錯縫、10% 三塊），
      // 石板輪廓 12 點、邊緣崩角、上面微微起伏、下緣倒角；10 種外形輪流用（InstancedMesh，一種一個）。踏面主要落腳區維持平（±1.5 公分）
      const rr = (a, b) => a + rnd() * (b - a)
      const NV = 10, slabGeo = []
      for (let v = 0; v < NV; v++) {
        const pts = [], N = 12
        for (let i = 0; i < N; i++) {
          const a = (i / N) * Math.PI * 2 + 0.26, cx = Math.cos(a), cz = Math.sin(a)
          // 圓角方形（四個角各兩點）＋每點往內崩 0～6%
          const sq = 1 / Math.max(Math.abs(cx), Math.abs(cz)), k = 0.5 * Math.min(sq, 1.32) * (1 - 0.06 * rnd())
          pts.push(new THREE.Vector2(cx * k, cz * k))
        }
        const sh = new THREE.Shape(pts)
        const eg = new THREE.ExtrudeGeometry(sh, { depth: 1, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.025, bevelSegments: 1, curveSegments: 1, steps: 1 })
        eg.rotateX(Math.PI / 2)   // 擠出方向朝下：y 0（上面）→ -1
        eg.computeBoundingBox()
        const bb = eg.boundingBox, pp = eg.attributes.position
        for (let i = 0; i < pp.count; i++) {
          let x = (pp.getX(i) - (bb.min.x + bb.max.x) / 2) / (bb.max.x - bb.min.x), z = (pp.getZ(i) - (bb.min.z + bb.max.z) / 2) / (bb.max.z - bb.min.z)
          let y = (pp.getY(i) - bb.max.y) / (bb.max.y - bb.min.y) + 0.5   // 上面 0.5、下面 -0.5
          if (y > 0.45) y += 0.03 * Math.sin(x * 7 + v) * Math.cos(z * 5 + v * 1.7)   // 表面微微起伏
          pp.setXYZ(i, x, y, z)
        }
        eg.computeVertexNormals(); slabGeo.push(eg)
      }
      const lists = Array.from({ length: NV }, () => [])
      // 2026-11-10 ChatGPT QA 圖 4：轉彎處兩層的最後幾階和轉上去那段的台階疊在一起 → 轉彎處（路徑在 x 不變、往 +z 走的那段）兩端的整段寬度
      // 拿掉沿著層走的台階，改鋪一塊獨立的石板平台（2～4 塊不規則大石板），高度＝轉彎起點／終點那一階
      // 2026-11-10 V→U：轉彎是水平的半圓（YOSE.stairs 的 legOf -2），整片鋪成一個半圓形石板平台（約 1 公尺見方的不規則石板，邊緣被外側弧牆蓋住）
      for (const t of turns) {
        const top = stepTop(t.s)
        for (let gx = -0.2; gx < t.rO + 0.5; gx += 1.0) for (let gz = -t.rO - 0.5; gz < t.rO + 0.5; gz += 1.0) {
          if (Math.hypot(gx, gz) > t.rO + 0.25) continue
          const x = t.cx + t.side * (gx + rr(-0.06, 0.06)), z = t.cz + gz + rr(-0.06, 0.06)
          const under = Math.max(0.7, Math.min(1.8, top - alpineHeight(x, z) + 0.5))
          lists[Math.floor(rnd() * NV)].push({ p: V(x, top - under / 2 + rr(-0.01, 0.01), z), yaw: rr(-0.08, 0.08), s: V(1.1, under, 1.1), c: rr(0.9, 1.05) })
        }
      }
      for (const b of steps) {
        if (inTurn(b)) continue
        const r = rnd(), n = r < 0.55 ? 1 : r < 0.9 ? 2 : 3
        // 寬度方向（盒子的 x）切幾塊，切點亂一點；往內側（+z，靠岩壁）多 0.1 公尺嵌進牆裡
        const W = b.s.x + 0.1, cuts = n === 1 ? [0, 1] : n === 2 ? [0, rr(0.35, 0.65), 1] : [0, rr(0.25, 0.4), rr(0.6, 0.75), 1]
        const ax = V(1, 0, 0).applyAxisAngle(V(0, 1, 0), b.yaw)
        const shift = ax.z >= 0 ? 0.05 : -0.05
        for (let j = 0; j < n; j++) {
          const u0 = cuts[j], u1 = cuts[j + 1], w = (u1 - u0) * W - 0.025, off = ((u0 + u1) / 2 - 0.5) * W + shift
          const p = b.p.clone().addScaledVector(ax, off)
          p.y += rr(-0.012, 0.012)
          lists[Math.floor(rnd() * NV)].push({ p, yaw: b.yaw + rr(-0.025, 0.025), s: V(w, b.s.y, b.s.z * rr(0.97, 1.02)), c: b.c * rr(0.9, 1.08) })
        }
      }
      const cc = new THREE.Color()
      lists.forEach((list, v) => {
        if (!list.length) return
        const im = new THREE.InstancedMesh(slabGeo[v], stepM, list.length)
        list.forEach((b, i) => { im.setMatrixAt(i, m4.compose(b.p, q.setFromAxisAngle(V(0, 1, 0), b.yaw), b.s)); im.setColorAt(i, cc.setScalar(b.c)) })
        im.castShadow = true; im.receiveShadow = true; im.computeBoundingSphere(); g.add(im)
      })
    }
    // 矮石牆：沿每段外側（第 0 段是前面、其他段是跟下一層之間），兩層砌石；碰撞也照這條線
    const stones = [], cores = [], wallLine = (k, x0, x1, zOf, yOf, open0, open1) => {
      // 2026-11-11 第一版一疊一疊分開像石堆 → 中間一道連續的牆心（盒子），外面再貼一顆顆互相交疊的砌石、上面一排長條蓋頂石
      for (let x = x0; x < x1; x += 0.5) {
        if (x > open0 && x < open1) continue
        const y = yOf(x), z = zOf(x), y2 = yOf(x + 0.5)
        cores.push({ p: V(x + 0.25, (y + y2) / 2 + 0.3, z), yaw: 0, s: V(0.56, 0.62, 0.26), c: 0.88 })   // 2026-11-10 牆心變薄（0.4→0.26）：砌石的角以前剛好戳出牆心表面，一片片白色「鳥形」
        for (let c = 0; c < 3; c++) for (let j = 0; j < 2; j++) {
          const w = 0.34 + rnd() * 0.22, h = 0.2 + rnd() * 0.08
          stones.push({ p: V(x + j * 0.27 + (c % 2) * 0.13, y + 0.12 + c * 0.22, z + (rnd() - 0.5) * 0.05), yaw: (rnd() - 0.5) * 0.2, s: V(w, h, 0.5), c: 0.72 + rnd() * 0.3 })
        }
        stones.push({ p: V(x + 0.25, (y + y2) / 2 + 0.74, z), yaw: (rnd() - 0.5) * 0.06, s: V(0.62, 0.09, 0.5), c: 0.95 + rnd() * 0.1 })   // 蓋頂石
        addCollider(x + 0.25, z, 0.3, y + 0.95)
      }
    }
    const OPEN = 3.4
    // 2026-11-10 V→U：每段石階外側的牆只到兩端轉彎的圓心（xcW～xcE）；轉彎外緣另砌一道半圓弧牆
    const xcW = M.XA + 1.5, xcE = M.XB - 1.5
    const legX1 = (k) => k === 0 ? M.XB + 0.8 - OPEN : k === M.NL - 1 ? M.XB + 0.8 : xcE
    for (let k = 0; k < M.NL; k++) {
      // 第 k 段外側那條線：第 0 段在最前面；k ≥ 1 在第 k-1 段的內側（同一條線，牆的高度以第 k 段為準）
      const zOf = (x) => YOSE.base(x) + M.D0 + M.W * k - M.W / 2 + 0.2
      wallLine(k, xcW - 0.25, legX1(k), zOf, (x) => Hk(k, x), 1e9, -1e9)
    }
    const wallArc = (t) => {
      const r = t.rO + 0.05, top = stepTop(t.s) - 0.2, n = Math.ceil(Math.PI * r / 0.5)
      for (let i = 0; i < n; i++) {
        const a = -Math.PI / 2 + Math.PI * (i + 0.5) / n, x = t.cx + t.side * r * Math.cos(a), z = t.cz + r * Math.sin(a)
        const yaw = Math.atan2(-t.side * Math.sin(a), Math.cos(a)) + Math.PI / 2
        cores.push({ p: V(x, top + 0.3, z), yaw, s: V(0.56, 0.62, 0.26), c: 0.88 })
        for (let c = 0; c < 3; c++) for (let j = 0; j < 2; j++) {
          const w = 0.34 + rnd() * 0.22, h = 0.2 + rnd() * 0.08, off = (j - 0.5) * 0.27 + (c % 2) * 0.06
          stones.push({ p: V(x + Math.cos(yaw) * off, top + 0.12 + c * 0.22, z - Math.sin(yaw) * off), yaw: yaw + (rnd() - 0.5) * 0.2, s: V(w, h, 0.5), c: 0.72 + rnd() * 0.3 })
        }
        stones.push({ p: V(x, top + 0.74, z), yaw, s: V(0.62, 0.09, 0.5), c: 0.95 + rnd() * 0.1 })
        addCollider(x, z, 0.3, top + 0.95)
      }
    }
    for (const t of turns) wallArc(t)
    // 最上一層平台前緣（站在岩壁頂上往下看石階）：石牆，轉上來那頭留開口
    wallLine(M.NL, XL + 0.3, XR - 0.3, (x) => YOSE.base(x) + M.D0 + M.W * (M.NL - 0.5) + 0.2, () => topYm, M.XB + 0.8 - OPEN, M.XB + 0.8 + OPEN)
    // 2026-11-10 ChatGPT：高處外側（落差大的第 3 層以上）石牆上加深灰色鐵管欄杆：離踏面 1.05 公尺、柱距 1.8 公尺、上下兩根橫管；轉彎開口不裝
    {
      const parts = [], post = new THREE.CylinderGeometry(0.025, 0.025, 1, 6), bar = new THREE.CylinderGeometry(0.02, 0.02, 1, 6).rotateZ(Math.PI / 2)
      for (let k = 2; k < M.NL; k++) {
        const zOf = (x) => YOSE.base(x) + M.D0 + M.W * k - M.W / 2 + 0.2
        let prev = null
        for (let x = xcW; x <= legX1(k) - 0.2; x += 1.8) {
          const y0 = Hk(k, x), z = zOf(x), top = y0 + 1.05, wallTop = y0 + 0.78
          parts.push(post.clone().scale(1, top - wallTop + 0.05, 1).translate(x, (top + wallTop) / 2, z))
          if (prev) for (const h of [0, -0.38]) {
            const a = V(prev.x, prev.top + h, prev.z), b = V(x, top + h, z), len = a.distanceTo(b)
            parts.push(bar.clone().scale(len, 1, 1).applyMatrix4(new THREE.Matrix4().makeRotationZ(Math.atan2(b.y - a.y, b.x - a.x))).translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2))
          }
          prev = { x, top, z }
        }
      }
      if (parts.length) { const m = new THREE.Mesh(mergeGeometries(parts.map((q) => q.index ? q.toNonIndexed() : q)), new THREE.MeshStandardMaterial({ color: 0x3b3d3f, roughness: 0.45, metalness: 0.65 })); m.castShadow = true; g.add(m) }
    }
    // 石階上的水霧（ChatGPT：照離瀑布的距離，越近越濃，不要整條一樣）：離瀑布 25 公尺內的台階上方飄幾團
    {
      const near = steps.filter((b) => Math.hypot(b.p.x - F.x, b.p.z - F.z) < 25)
      for (let k = 0; k < Math.min(18, near.length); k++) {
        const b = near[Math.floor(rnd() * near.length)], d = Math.hypot(b.p.x - F.x, b.p.z - F.z)
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: mistTex, transparent: true, depthWrite: false, opacity: 0.2 }))
        const p0 = V(b.p.x + (rnd() - 0.5) * 2, b.p.y + b.s.y / 2 + 0.6 + rnd() * 2.2, b.p.z + (rnd() - 0.5) * 1.5)
        sp.position.copy(p0); sp.scale.setScalar(3 + rnd() * 3); sp.userData = { ph: rnd() * TAU, p0, op: 0.35 + 0.5 * (1 - d / 25) }; sp.renderOrder = 6; g.add(sp); mist.push(sp)
      }
    }
    {
      // 2026-11-10 ChatGPT QA：牆心盒子貼整張花崗岩圖 → 圖上的白色晶斑被放大成一個個白色「鳥形」；牆心改素色、砌石壓暗一點
      const wallM = new THREE.MeshStandardMaterial({ color: 0xaaa59b, roughness: 0.95 }), coreM = new THREE.MeshStandardMaterial({ color: 0x8f8a80, roughness: 0.98 })
      // 第二輪（ChatGPT：石牆像一堆碎紙片、白色尖破面）：壓扁的十二面體切出很多細長三角形 → 改成低面數的圓石（球面＋輕微凹凸），封閉、沒有尖片
      const stoneG = new THREE.SphereGeometry(0.5, 9, 6); { const pp = stoneG.attributes.position; for (let i = 0; i < pp.count; i++) { const x = pp.getX(i), y = pp.getY(i), z = pp.getZ(i), k = 0.92 + 0.1 * Math.sin(x * 9.1 + y * 5.3 + z * 7.7); pp.setXYZ(i, x * k, Math.sign(y) * Math.min(Math.abs(y) * k, 0.36), z * k) } stoneG.computeVertexNormals() }
      for (const [list, geo, mat] of [[stones, stoneG, wallM], [cores, new THREE.BoxGeometry(1, 1, 1), coreM]]) {
        const im = new THREE.InstancedMesh(geo, mat, list.length), cc = new THREE.Color()
        list.forEach((b, i) => { im.setMatrixAt(i, m4.compose(b.p, q.setFromAxisAngle(V(0, 1, 0), b.yaw), b.s)); im.setColorAt(i, cc.setScalar(b.c)) })
        im.castShadow = true; im.receiveShadow = true; im.computeBoundingSphere(); g.add(im)
      }
    }
    // 兩端腳下：一堆落石（岩稜底下自然會有的崩落的石塊），蓋住平台跟地面的交界
    if (lib) {
      const names = ['boulder', 'mrock_1', 'mrock_3', 'mrock_5'].filter((n) => lib[n]), list = Object.fromEntries(names.map((n) => [n, []]))
      for (const xe of [XL2 + 1, XR2 - 1]) for (let i = 0; i < 9; i++) {
        const x = xe + (rnd() - 0.5) * 4.5, z = YOSE.base(x) + M.D0 - M.W / 2 - 0.5 - rnd() * 3.5
        if (alpineTrailDist(x, z) < 2.4 || Math.hypot(x - M.start[0], z - M.start[1]) < 4) continue
        const n = names[Math.floor(rnd() * names.length)], k2 = n === 'boulder' ? 0.3 + rnd() * 0.4 : 0.7 + rnd() * 1.1
        list[n].push({ p: V(x, alpineHeight(x, z) - 0.25 * k2, z), q: new THREE.Quaternion().setFromEuler(new THREE.Euler(rnd() * 0.3, rnd() * TAU, rnd() * 0.3)), s: V(k2, k2 * (0.7 + rnd() * 0.4), k2) })
      }
      for (const n of names) if (list[n].length) scatter(g, lib[n], list[n], { cast: true })
    }
    // 每一層內側的石壁：碰撞（站在第 k 段，往裡是第 k+1 段的石壁，高到第 k+1 段的踏面）
    for (let k = 0; k < M.NL; k++) for (let x = XL + 0.3; x < XR - 0.3; x += 0.5) {
      const top = k + 1 < M.NL ? Hk(k + 1, x) : topYm
      const past = k % 2 === 0 ? x < xcW + 0.3 : x > xcE - 0.3   // 第 k 段的終點＝轉上第 k+1 段的半圓：那裡不擋
      if (top - Hk(k, x) > 0.45 && !past) addCollider(x, YOSE.base(x) + M.D0 + M.W * k + M.W / 2 + 0.35, 0.3, top - 0.1)
    }
    // 兩端：不能從平台側面走出去（掉下去）
    for (const xe of [XL - 0.6, XR + 0.6]) for (let k = 0; k <= M.NL; k++) for (const o of [-0.8, 0, 0.8]) if (!(xe > XR && (k === 0 || k >= M.NL - 1)) && k < M.NL) addCollider(xe, YOSE.base(xe) + M.D0 + M.W * k - M.W / 2 + M.W / 2 + o, 0.42, topYm + 1)   // 轉彎平台在 XA-0.8／XB+0.8，柱子放在外面 0.6 才不會擋到轉彎

    // 岩壁頂上：觀景台（瀑布口東邊）欄杆＋後面不能走出去
    const ironM = new THREE.MeshStandardMaterial({ color: 0x3b3d3f, roughness: 0.5, metalness: 0.6 }), posts = []
    for (let x = 201.4; x < XL; x += 0.9) posts.push(V(x, YOSE.topY(x), YOSE.topFront(x) + 0.15))
    for (let x = XR + 0.4; x < 250; x += 0.9) posts.push(V(x, YOSE.topY(x), YOSE.topFront(x) + 0.15))   // 石階頂東邊的平地前緣
    for (let z = YOSE.topFront(XR + 0.4) + 0.15; z < YOSE.base(XR) + M.D0 + M.W * (M.NL - 1.5) - 0.2; z += 0.9) posts.push(V(XR + 0.2, YOSE.topY(XR), z))   // 只到最後一段的前緣：最後一段東端直接走上平地
    // 2026-11-10 平地東邊盡頭不再擋：接到往東南下降的岩脊（layout.js EAST.ridge），從這裡走到東部草原
    for (let z = YOSE.topFront(XL - 0.2) + 0.15; z < YOSE.base(XL) + M.D0 + M.W * (M.NL - 0.5); z += 0.9) posts.push(V(XL - 0.2, YOSE.topY(XL), z))
    for (let z = YOSE.topFront(201.4) + 0.15; z < YOSE.edge(201.4) - 2.2; z += 0.9) posts.push(V(201.3, YOSE.topY(201.3), z))   // 西邊（溪那側）
    for (const p of posts) addCollider(p.x, p.z, 0.2, p.y + 1.1, p.y)
    for (let x = 201.2; x < 251; x += 1) addCollider(x, YOSE.edge(x) - 1.9, 0.35, topYm + 3)
    const pg = new THREE.CylinderGeometry(0.035, 0.035, 1.05, 6).translate(0, 0.52, 0), pm = new THREE.InstancedMesh(pg, ironM, posts.length)
    posts.forEach((p, i) => pm.setMatrixAt(i, m4.makeTranslation(p.x, p.y, p.z))); pm.castShadow = true; g.add(pm)
    for (let i = 1; i < posts.length; i++) { const a = posts[i - 1], b = posts[i]; if (a.distanceTo(b) > 1.4) continue; const d = b.clone().sub(a), r = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, d.length(), 5), ironM); r.position.copy(a).add(b).multiplyScalar(0.5).setY((a.y + b.y) / 2 + 1.0); r.quaternion.setFromUnitVectors(V(0, 1, 0), d.normalize()); g.add(r) }

    // 岩壁頂上的溪：從後面（玻璃前）流到瀑布口，越靠瀑布口越寬、越快；兩岸一顆顆花崗岩
    {
      const F2 = YOSE.fall, zLip = YOSE.base(F2.x) + 0.45, zSrc = 101.6, NS = 40, P = [], U = [], I = []   // 2026-11-10 起點改在上游小溪接進來的地方（以前從公園邊界憑空冒出來）
      const cx = (t) => F2.x + 1.6 * Math.sin(t * 2.6 + 0.5) * (1 - t) - 0.8 * (1 - t)
      for (let i = 0; i <= NS; i++) {
        const t = i / NS, z = lerpN(zSrc, zLip, t), x = cx(t), w = lerpN(1.6, 3.0, t * t), y = YOSE.topY(x) + 0.07 - 0.02 * t
        P.push(x - w, y, z, x + w, y, z); U.push(0, t * 5, 1, t * 5)
        if (i) { const a = (i - 1) * 2; I.push(a, a + 2, a + 1, a + 1, a + 2, a + 3) }
      }
      const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); sg.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2)); sg.setIndex(I)
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
          const rg = new THREE.BufferGeometry(); rg.setAttribute('position', new THREE.Float32BufferAttribute(P2, 3)); rg.setAttribute('uv', new THREE.Float32BufferAttribute(U2, 2)); rg.setIndex(I2)
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
    const stone = new THREE.MeshStandardMaterial({ color: 0x9a968e, roughness: 0.95 }), metal = new THREE.MeshStandardMaterial({ color: 0x3a3d3f, roughness: 0.45, metalness: 0.6 })
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
    for (const bx of [214, 231, 247]) { const bz = YOSE.topFront(bx) + 1.6, by = Y0(bx); box('wood', 1.8, 0.1, 0.4, bx, by + 0.45, bz); box('wood', 1.8, 0.4, 0.08, bx, by + 0.7, bz + 0.2); for (const dx of [-0.7, 0.7]) box('wood', 0.12, 0.42, 0.36, bx + dx, by + 0.21, bz); addCollider(bx, bz, 0.5, by + 0.6) }
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
    const x = X0 + 8 + rnd() * (X1 - X0 - 16), zb = YOSE.base(x), ze = YOSE.edge(x) - 2, zf = (x > YOSE.mist.XA - 2 && x < YOSE.mist.XB + 2) ? YOSE.topFront(x) : zb + 3
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
      const woodM = new THREE.MeshStandardMaterial({ color: 0x4a3426, roughness: 0.9 }), parts2 = []
      const post = new THREE.CylinderGeometry(0.06, 0.07, 1, 7), bar = new THREE.CylinderGeometry(0.045, 0.045, 1, 6).rotateZ(Math.PI / 2)
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
  function tick(t) {
    const dt = Math.min(0.1, Math.max(0, t - lastT)); lastT = t
    uT.value = t
    for (const sp of mist) { const u = sp.userData; sp.material.opacity = (u.op ?? 1) * (0.28 + 0.16 * Math.sin(t * 0.6 + u.ph)); sp.position.set(u.p0.x + Math.sin(t * 0.13 + u.ph) * 1.5, u.p0.y + Math.sin(t * 0.21 + u.ph) * 0.8, u.p0.z - (0.5 + 0.5 * Math.sin(t * 0.09 + u.ph)) * 2.5) }
    for (const f of foams) { const k = (t * (f.userData.k ? 0.35 : 0.22) + f.userData.k * 0.5) % 1; f.rotation.y = t * (f.userData.k ? -0.05 : 0.03); f.material.opacity = 0.85 * (1 - k * 0.6) }
    if (sprayU && dt > 0) sprayU(dt)
  }
  return { group: g, tick, pines: PINES }
}
const mist = [], foams = []
let mistTex = null
let sprayU = null
