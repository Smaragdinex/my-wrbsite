// 第二館：高山雲霧林。圓頂東門 → 玻璃通道（中間是氣候緩衝室，兩道自動門）→ 一棟玻璃溫室，裡面是台灣高山的地形：
// 入口平台、水池，往東爬升到約 30 公尺的山頂；溪流從山上沿山谷流下來（中途一段小瀑布），步道之字形上山、吊橋過溪谷，山頂有小木屋和三角點。
// 植物：冷杉（細長尖塔）、鐵杉（較寬、枝條下垂）——程式做的針葉卡片樹；坡上一整片玉山箭竹；溪邊蕨類、長苔的岩石；雲霧一直在飄。
// 地形、步道、溪、吊橋的形狀在 layout.js（玩家走路也要用）。
// 效能：外殼（通道、館的鋼構和霧玻璃）一開始就蓋，很便宜；館裡面等玩家走到東邊才蓋。
// 兩館不同時畫：玩家在館裡（或 B 門開著）才畫館內；在圓頂這邊（或 A 門開著）才畫圓頂裡面，緩衝室兩道門都關著的時候切換。
import * as THREE from 'three'
import { createMirror } from './mirror.js'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { buildSummit } from './summit.js'
import { ALP_WALKS, AS, CABIN, CAMP, ALP, ALP_STREAM, ALP_STREAMS, RIVER_BRIDGES, ALP_POND, ALP_TRAIL, ALP_BRIDGE, ALP_GRID, ALP_HEIGHTS, ALP_PEAK, BRIDGE_DIM, alpineHeight, alpineTrailDist, alpineStreamDist, alpineStreamS, streamWater, streamLatOff, inAlpine, domeY, domeRho, outerR, addCollider, gardenRho, pathClearAt, terrainHeight, YOSE, FIG_FORCED, eastZone, EAST, wetSD, inLagoon, grassSD } from './layout.js'
import { scatter, parts } from './plants.js'
import { nearGiant, forestK } from './giants.js'
import { barkMaterial } from './bark.js'
import { bladeMesh } from './flora.js'
import { addWind } from './wind.js'
import { lodRegister, lodRegisterGrass } from './lod.js'
import { mulberry32, fbm2 } from './noise.js'
import { dayLight, duskLight, mistLevel, wetify, sunDirU, weatherU } from './structures.js'

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z)
const TAU = Math.PI * 2
// 山區面積比 1.55 倍那版大多少（2026-11-08 再放大 ×1.3）：樹、石頭、蕨類、箭竹的數量照面積加，密度跟以前一樣
// 雀榕的位置（新的吃果子的鳥停在上面）
export const FIG_TREES = []
export const FLORA_SPOTS = {}   // 除錯／截圖用：鵝掌藤、野花的位置
const FIGPOS = []
const AK = Math.min((AS / 1.55) ** 2, (2.015 / 1.55) ** 2 * 1.2)   // 2026-11-09 山再放大 ×1.2：樹的密度不跟著全加（效能），多出來的地方給果樹、花
const { clamp, lerp } = THREE.MathUtils
const ss = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t) }   // 跟 layout.js 同樣的參數順序（three 的 smoothstep 是 (x, min, max)，第一版用錯，樹全沒長出來）

function canvasTex(w, h, draw, srgb = true) {
  const c = document.createElement('canvas'); c.width = w; c.height = h
  draw(c.getContext('2d'), w, h)
  const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8
  return t
}
const bar = (list, a, b, t = 0.14, t2 = t) => {
  const d = new THREE.Vector3().subVectors(b, a), len = d.length()
  const m = new THREE.Matrix4().lookAt(a, b, Math.abs(d.y) > 0.99 * len ? V(1, 0, 0) : V(0, 1, 0))
  m.setPosition(a.clone().add(b).multiplyScalar(0.5))
  list.push(new THREE.BoxGeometry(t, t2, len).applyMatrix4(m))
}
const quad = (pts, mat, parent, order = 5) => {
  const pos = []
  for (let i = 1; i < pts.length - 1; i++) pos.push(...pts[0].toArray(), ...pts[i].toArray(), ...pts[i + 1].toArray())
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.computeVertexNormals()
  const m = new THREE.Mesh(geo, mat); m.renderOrder = order; parent.add(m); return m
}

/* ---------- 針葉樹（程式做的卡片樹） ---------- */
// 2026-11-07 改寫得比較寫實：一根側枝＝主枝＋兩側一排排的小枝，小枝上密密的短針葉；針葉裡深外淺、枝梢是嫩綠的新芽，
// 沒有黑色描邊（原本每根針都描深色，看起來像漫畫）。透明底（alphaTest）。
export function needleTex() {
  // 2026-11-10 畫在兩倍大的畫布上（1024×512）：針葉更細、近看不糊。座標還是用 512×256 的單位畫
  const t = canvasTex(1024, 512, (x, W, H) => {
    x.clearRect(0, 0, W, H); x.scale(2, 2)
    const w = W / 2, h = H / 2
    const rnd = mulberry32(7)
    const needle = (px, py, a, len, tip) => {
      const g = 95 + rnd() * 45 + tip * 45, r = 48 + rnd() * 20 + tip * 45, b = 46 + rnd() * 16
      x.strokeStyle = `rgba(${r | 0},${g | 0},${b | 0},0.95)`; x.lineWidth = 1.5 + rnd() * 0.8
      x.beginPath(); x.moveTo(px, py); x.lineTo(px + Math.cos(a) * len, py + Math.sin(a) * len); x.stroke()
    }
    // 主枝：從左（樹幹那頭）往右，微微彎
    const main = (u) => [u * w * 0.97, h / 2 + Math.sin(u * 2.2) * h * 0.04]
    x.strokeStyle = 'rgba(70,52,36,0.9)'; x.lineWidth = 3; x.beginPath(); for (let i = 0; i <= 20; i++) x.lineTo(...main(i / 20)); x.stroke()
    // 小枝：兩側交錯，越往外越短；每根小枝上兩排針葉
    for (let i = 0; i < 18; i++) {
      const u = 0.05 + i / 18 * 0.88, [mx, my] = main(u), side = i % 2 ? 1 : -1
      const L = (0.42 - u * 0.25) * h * (0.8 + rnd() * 0.4), a = side * (0.75 + rnd() * 0.35) + 0.25
      const ex = mx + Math.cos(a) * L * 1.6, ey = my + Math.sin(a) * L
      // 先鋪一片實心的葉團（中間深、邊緣亮一點）：遠看是一團團的枝葉，不是一根根黑線
      const ang = Math.atan2(ey - my, ex - mx), ln = Math.hypot(ex - mx, ey - my)
      x.save(); x.translate((mx + ex) / 2, (my + ey) / 2); x.rotate(ang)
      const gr = x.createLinearGradient(0, -L * 0.35, 0, L * 0.35)
      gr.addColorStop(0, 'rgb(78,118,70)'); gr.addColorStop(0.5, 'rgb(46,82,48)'); gr.addColorStop(1, 'rgb(66,104,62)')
      x.fillStyle = gr; x.beginPath(); x.ellipse(0, 0, ln * 0.55, L * 0.26, 0, 0, TAU); x.fill(); x.restore()
      x.strokeStyle = 'rgba(80,60,40,0.8)'; x.lineWidth = 1.4; x.beginPath(); x.moveTo(mx, my); x.lineTo(ex, ey); x.stroke()
      for (let k = 0; k < 40; k++) {
        const v = rnd(), px = mx + (ex - mx) * v, py = my + (ey - my) * v, s2 = rnd() < 0.5 ? -1 : 1
        needle(px, py, a + s2 * (0.9 + rnd() * 0.5), 9 + rnd() * 7, v > 0.8 ? 1 : 0)
      }
    }
    for (let k = 0; k < 160; k++) { const u = rnd() * 0.97, [px, py] = main(u); needle(px, py, (rnd() - 0.5) * 3, 8 + rnd() * 8, u > 0.88 ? 1 : 0) }   // 主枝本身也長針
  })
  t.anisotropy = 8
  return t
}
// 針葉卡片的材質（山區的冷杉、鐵杉、圓柏和公園外面的樹林帶共用）
export function needleMaterial() {
  const tex = needleTex()
  const needleM = new THREE.MeshStandardMaterial({ map: tex, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.85, color: 0xd2dccb, vertexColors: true })
  // 遠處的樹：mipmap 把針葉的透明度平均掉，alphaTest 一切就只剩枝幹（遠看像一根根竹竿）。照 mip 層級把透明度補回來
  // 2026-11-10 白天補償 0.35 太弱，遠處冷杉只剩樹幹像一根根尖錐（ChatGPT QA 圖 2）→ 拉回 0.95～1.1
  // 2026-11-11 alphaToCoverage 拿掉：葉緣變成一圈白白的霧（白天看起來結霜、夜裡一點一點在閃，使用者回報）；遠處補透明度靠下面的 mip 補償就夠
  needleM.onBeforeCompile = (sh) => {
    // 2026-11-11 夜裡天比樹亮：針葉之間的小縫透出天空，遠處的樹看起來一點一點白白在閃（使用者回報）→ 夜裡遠處補得更多，樹冠比較實
    sh.uniforms.uDayN = dayLight
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uDayN;').replace('#include <alphatest_fragment>', `
      vec2 nDx = dFdx(vMapUv * vec2(512.0, 256.0)), nDy = dFdy(vMapUv * vec2(512.0, 256.0));
      diffuseColor.a *= 1.0 + max(0.0, 0.5 * log2(max(dot(nDx, nDx), dot(nDy, nDy)))) * mix(1.1, 0.95, uDayN);
      #include <alphatest_fragment>`)
  }
  needleM.customProgramCacheKey = () => 'needleMip'
  return needleM
}
// kind 'fir'：冷杉，細長尖塔、枝條平伸、層次分明；'hemlock'：鐵杉，比較寬、枝條下垂、頂端的芽歪向一邊。高度 1（擺放時縮放）
// 每根側枝兩片交叉的卡片（從側面、從上面看都有厚度）；每層枝數、長度、角度都有亂數，偶爾缺一枝（看得到樹幹，比較自然）
// 頂點顏色：樹冠裡面、下面比較暗（自己遮自己），外面、上面比較亮——卡片樹最缺的就是這個
// tiers：層數（2026-11-10 巨木的枝葉團用少層數的輕量版，一棵巨木掛幾十團）
// 2026-11-12 立體樹冠（tools/make-conifer-kit.py，使用者：山上那片冷杉是片狀樹冠、遠看像一層層平板 → 每根枝條一串朝各方向的針葉簇，從哪裡看都是圓蓬蓬的）。
// world.js 進場前先載（loadConiferKit）；載到之後 coniferGeo 一律用這套（同樣高 1、底在原點、同一張針葉貼圖），載不到才用下面原本的卡片版。
// 層數少的呼叫（巨木上的枝葉團、松樹上的小簇，tiersN ≤ 10）用輕量版 _lo
let CONIFER_KIT = null
const CVER = new URL(import.meta.url).searchParams.get('v') ?? ''
export async function loadConiferKit() {
  try {
    const gl = await new GLTFLoader().loadAsync(`models/props/conifer_kit.glb?v=${CVER}`); gl.scene.updateMatrixWorld(true)
    const K = {}; gl.scene.traverse((o) => { if (o.isMesh) { const ge = o.geometry.clone(); ge.applyMatrix4(o.matrixWorld); K[o.name] = ge } })
    if (K.fir && K.hemlock) CONIFER_KIT = K
  } catch (e) { console.warn('[conifer kit]', e) }
}
// 法線往上往外偏、頂點色裡面下面暗（跟卡片版同一套：樹冠自己遮自己）
function shadeConifer(g, fir) {
  const R = fir ? 0.19 : 0.29
  const p = g.attributes.position, n = g.attributes.normal ?? new THREE.BufferAttribute(new Float32Array(p.count * 3), 3), col = new Float32Array(p.count * 3)
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), l = Math.hypot(x, z) || 1
    n.setXYZ(i, x / l * 0.55, 0.8, z / l * 0.55)
    const rMax = R * Math.pow(Math.max(0, 1 - (y - 0.08) / 0.9), fir ? 0.9 : 0.72) + 0.03
    const out = Math.min(1, l / rMax), k = (0.45 + 0.55 * out) * (0.7 + 0.3 * y)
    col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = k
  }
  g.setAttribute('normal', n); g.setAttribute('color', new THREE.BufferAttribute(col, 3))
  return g
}
// 立體樹冠實際有多寬（高 1 的樹，水平半徑）：近的和遠的版本取大的。擺樹時照這個讓出步道（以前照卡片版的 0.19／0.29 估，鐵杉實際寬將近一倍）
export function coniferR(kind) {
  if (!CONIFER_KIT) return kind === 'fir' ? 0.19 : 0.29
  let r = 0; for (const n of [kind, kind + '_lo']) { const g = CONIFER_KIT[n]; if (!g) continue; if (!g.boundingBox) g.computeBoundingBox(); const b = g.boundingBox; r = Math.max(r, -b.min.x, b.max.x, -b.min.z, b.max.z) }
  return r || (kind === 'fir' ? 0.19 : 0.29)
}
export function coniferLoGeo(kind) { const K = CONIFER_KIT?.[kind + '_lo']; return K ? shadeConifer(K.clone().toNonIndexed(), kind === 'fir') : null }
export function coniferGeo(kind, tiersN) {
  if (CONIFER_KIT) { const K = CONIFER_KIT[(tiersN != null && tiersN <= 10) ? kind + '_lo' : kind]; if (K) return shadeConifer(K.clone().toNonIndexed(), kind === 'fir') }
  const fir = kind === 'fir', R = fir ? 0.19 : 0.29, tiers = tiersN ?? (fir ? 22 : 17), rnd = mulberry32(fir ? 3 : 5)
  const cards = []
  for (let i = 0; i < tiers; i++) {
    const t = i / (tiers - 1), y = 0.08 + Math.pow(t, 0.95) * 0.9 + (rnd() - 0.5) * 0.015
    const r = (R * Math.pow(1 - t, fir ? 0.9 : 0.72) + 0.025) * (0.85 + rnd() * 0.3)
    const n = Math.max(4, Math.round((fir ? 7 : 8) * (0.6 + 0.4 * (1 - t))))
    for (let k = 0; k < n; k++) {
      if (rnd() < 0.12 && t < 0.8) continue
      const a = (k / n) * TAU + i * 2.39 + rnd() * 0.5
      const len = r * (0.75 + rnd() * 0.5)
      const droop = fir ? 0.08 + t * 0.1 + rnd() * 0.12 : 0.35 + rnd() * 0.25 - t * 0.15
      for (const tw of [0, Math.PI / 2]) {
        const card = new THREE.PlaneGeometry(len, len * (fir ? 0.5 : 0.6), 2, 1).translate(len / 2, 0, 0)
        // 枝梢往下彎（鐵杉彎很多）：沿長度方向把外端壓下去
        const p = card.attributes.position
        for (let v = 0; v < p.count; v++) { const u = p.getX(v) / len; p.setY(v, p.getY(v) - u * u * len * (fir ? 0.12 : 0.35)) }
        card.rotateX(tw + (rnd() - 0.5) * 0.3)
        card.rotateZ(-droop)
        card.rotateY(a); card.translate(0, y, 0)
        cards.push(card)
      }
    }
  }
  // 頂芽：一根往上的小枝（鐵杉歪一邊）
  for (const tw of [0, Math.PI / 2]) { const c = new THREE.PlaneGeometry(0.1, 0.06).translate(0.05, 0, 0).rotateX(tw).rotateZ(fir ? Math.PI / 2 : Math.PI / 2 - 0.5).translate(0, 0.96, 0); cards.push(c) }
  const g = mergeGeometries(cards.map((c) => c.toNonIndexed()))
  const p = g.attributes.position, n = g.attributes.normal, col = new Float32Array(p.count * 3)
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), l = Math.hypot(x, z) || 1
    n.setXYZ(i, x / l * 0.55, 0.8, z / l * 0.55)   // 法線往上、往外偏：卡片樹不會一面亮一面黑
    const rMax = R * Math.pow(Math.max(0, 1 - (y - 0.08) / 0.9), fir ? 0.9 : 0.72) + 0.03
    const out = Math.min(1, l / rMax), k = (0.5 + 0.5 * out) * (0.72 + 0.28 * y)   // 裡面、下面暗
    col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = k
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3))
  return g
}

/* ---------- 館內 ---------- */
// 鳥站附近：r 公尺內、或鳥到鏡頭那條線 w 公尺內就不放（樹不擋鏡頭、不插進停棲的樹）
function nearBird(avoid, x, z, r, w) {
  for (const b of avoid) {
    if (Math.hypot(x - b.x, z - b.z) < r) return true
    const dx = b.cx - b.x, dz = b.cz - b.z, L2 = dx * dx + dz * dz, t = Math.max(0, Math.min(1, ((x - b.x) * dx + (z - b.z) * dz) / L2))
    if (Math.hypot(x - b.x - dx * t, z - b.z - dz * t) < w) return true
  }
  return false
}
// 地上的鳥：身邊 r 公尺、和鳥到鏡頭那條線 0.9 公尺內不長草（2026-11-09 草鴞前面一叢箭竹把整隻鳥擋掉）
// b.clear：那隻鳥自己要更大一片空地（2026-11-10 湖前草地的環頸雉、小雲雀、棕扇尾鶯：箭竹清掉 5 公尺，換成草原）
function groundClear(avoid, x, z, r) {
  return nearBird(avoid.filter((b) => b.ground), x, z, r, 0.9) || avoid.some((b) => b.clear && Math.hypot(x - b.x, z - b.z) < b.clear)
}
// 到吊橋中線的距離（吊橋那段不算步道，alpineTrailDist 量不到）
function bridgeDist(x, z) {
  const a = ALP_TRAIL[ALP_BRIDGE.a], b = ALP_TRAIL[ALP_BRIDGE.a + 2], dx = b[0] - a[0], dz = b[1] - a[1]
  const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz)))
  return Math.min(Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t), newWalkDist(x, z))
}
// 2026-11-13 新木道（往左支線、神木環形、接環形的支線）不在步道上（alpineTrailDist 量不到）：草、灌木、石頭一樣要避開
const NEW_WALKS = ALP_WALKS.filter((w) => w.branch || w.closed)
function newWalkDist(x, z) {
  let m = 1e9
  for (const w of NEW_WALKS) {
    if (x < w.box[0] - 10 || x > w.box[1] + 10 || z < w.box[2] - 10 || z > w.box[3] + 10) continue
    for (let i = 0; i < w.N; i += 4) { const d = (x - w.xs[i]) ** 2 + (z - w.zs[i]) ** 2; if (d < m) m = d }
  }
  // 石拱橋（橋身＋兩頭鋪到路上的石板）：2026-11-13 使用者照片「那邊的草要移除」——草從橋腳、橋面邊長出來
  for (const b of RIVER_BRIDGES) {
    const ax = x - b.x, az = z - b.z, along = ax * b.dir[0] + az * b.dir[1], lat = -ax * b.dir[1] + az * b.dir[0], L = b.half + 1.7
    const d = Math.hypot(Math.max(0, Math.abs(along) - L), Math.max(0, Math.abs(lat) - 0.3))
    if (d * d < m) m = d * d
  }
  return Math.sqrt(m)
}
const GB_OUT = 22, GB_K = [1, 1, 1]   // 山區接花園那一圈的寬度（公尺）、顏色微調
// 2026-11-09 石頭要擋人：照模型的包圍盒算每顆石頭的腳印（XZ 半徑）和高度，加一個圓形碰撞；比腳印小一點（石頭是不規則的，邊緣斜下去），
// 太小（踩得過去）或埋在水裡的不加；top 是石頭頂，跳得比頂高就能站上去／跳過
const rockBox = new Map()
function rockColliders(node, list, { minR = 0.25, shrink = 0.78 } = {}) {
  if (!rockBox.has(node)) { node.updateMatrixWorld(true); rockBox.set(node, new THREE.Box3().setFromObject(node)) }
  const bb = rockBox.get(node), cx = (bb.min.x + bb.max.x) / 2, cz = (bb.min.z + bb.max.z) / 2
  const rx = (bb.max.x - bb.min.x) / 2, rz = (bb.max.z - bb.min.z) / 2, c = new THREE.Vector3()
  for (const it of list) {
    const sxz = Math.max(it.s.x, it.s.z), r = Math.min(rx, rz) * 0.5 + Math.max(rx, rz) * 0.5
    const R = r * sxz * shrink, top = it.p.y + bb.max.y * it.s.y
    if (R < minR || top < alpineHeight(it.p.x, it.p.z) + 0.2) continue
    c.set(cx * it.s.x, 0, cz * it.s.z).applyQuaternion(it.q)
    const X = it.p.x + c.x, Z = it.p.z + c.z
    if (alpineTrailDist(X, Z) < R + 0.7) continue   // 步道上（例如過溪的地方）不能被石頭的碰撞擋住
    addCollider(X, Z, R, top)
  }
}
function buildInterior(lib, avoid = []) {
  const g = new THREE.Group(); g.name = 'alpineInterior'
  const rnd = mulberry32(2026)
  const AG = ALP_GRID
  // 2026-11-09 使用者：山的入口左右很空。花園的植物只種到花園邊、山區的只從 inAlpine 開始（gardenRho 1.03 以外再留邊），
  // 中間那一圈（花園邊緣到山區）是光禿禿的草坡。BAND＝入口兩側這一圈：鐵杉、箭竹、岩石、蕨類也種過來；GY＝那裡看得到的地面高度
  const BAND = (x, z) => x > 46 && x < 104 && Math.abs(z) < 64 && gardenRho(x, z) > 0.95 && gardenRho(x, z) < 1.12 && pathClearAt(x, z) > 1.4
    && !(x < 80 && Math.abs(z) < 4.2)   // 步道一進來的那一段兩側留開：看得到山、也看得到入口的門
  const GY = (x, z) => inAlpine(x, z) ? alpineHeight(x, z) : terrainHeight(x, z)
  const OPEN = (x, z) => avoid.some((b) => b.ground && Math.hypot(x - b.x, z - b.z) < 10)   // 地上的鳥（草鴞）那片草原留開：不種樹、不放石頭
  // 地形網格：坡度決定顏色（緩坡箭竹草地的黃綠、陡坡岩石灰、步道泥土、溪邊濕的深色），再加一張細節雜訊貼圖
  {
    const nx = AG.nx, nz = AG.nz, pos = new Float32Array(nx * nz * 3), col = new Float32Array(nx * nz * 3), uv = new Float32Array(nx * nz * 2), idx = []
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const k = j * nx + i, x = AG.x0 + i * AG.cell, z = AG.z0 + j * AG.cell
      pos.set([x, ALP_HEIGHTS[k], z], k * 3); uv.set([x * 0.25, z * 0.25], k * 2)
    }
    // 只留山區（花園橢圓外、溫室裡）的格子；花園那邊有自己的地面
    const keep = new Uint8Array(nx * nz)
    for (let k = 0; k < nx * nz; k++) { const x = pos[k * 3], z = pos[k * 3 + 2]; keep[k] = inAlpine(x, z, -1) && (domeRho(x, z) < 1.0 || Math.hypot(x, z) < outerR(x, z) + 1) ? 1 : 0 }   // 2026-11-11 新地塊旁邊的凹口也畫
    for (let j = 0; j < nz - 1; j++) for (let i = 0; i < nx - 1; i++) { const a = j * nx + i, b = a + 1, c = a + nx, d = c + 1; if (keep[a] | keep[b] | keep[c] | keep[d]) idx.push(a, c, b, b, c, d) }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); geo.setIndex(idx)
    geo.computeVertexNormals()
    const nrm = geo.attributes.normal, c = new THREE.Color(), gardenCol = new THREE.Color()
    for (let k = 0; k < nx * nz; k++) {
      const x = pos[k * 3], z = pos[k * 3 + 2], ny = nrm.getY(k)
      const n = fbm2(x * 0.15, z * 0.15, 3)
      c.setHSL(0.17 + n * 0.04, 0.36, 0.21 + n * 0.06)                                      // 箭竹底下：偏暗的橄欖綠（草叢間的縫看起來是陰影，不是光禿禿的地）
      // 2026-11-09 跟花園的草地接起來：一進山區那一圈（花園邊往外約 15 公尺）從花園的綠慢慢變成山上的橄欖綠，不再一條線就換色
      // 花園地面 = 草地貼圖平均色 × 頂點色；這邊的細節貼圖是灰的，所以換算成「乘上灰貼圖後跟花園一樣」的顏色（線性色彩）
      const gr = gardenRho(x, z), gb = 1 - ss(0, GB_OUT, Math.hypot(x, z) * (1 - 1.03 / gr))   // 離花園邊幾公尺（沿著半徑量）
      if (gb > 0) c.lerp(gardenCol.setRGB((0.084 + n * 0.03) * GB_K[0], (0.19 + n * 0.05) * GB_K[1], (0.023 + n * 0.01) * GB_K[2]), gb)
      const rock = ss(0.86, 0.7, ny), fk = forestK(x, z)
      // 巨木林帶（giants.js）：地上是厚厚的落葉、針葉堆（暗紅褐）；陡坡不是灰石頭，是長滿青苔的土坡
      if (fk > 0) c.lerp(new THREE.Color().setHSL(0.07 + n * 0.03, 0.32, 0.15 + n * 0.05), 0.55 * fk)
      // 2026-11-12 使用者：瀑布岩壁是砂岩色、後面和旁邊的山是灰的 →「前後山都改一樣材質」。山區的陡坡全部改成同一種砂岩：
      // 暖的米褐色、一層層深淺不同的岩層（照高度分層，跟岩壁一樣往東微微傾斜），偶爾一片鐵鏽色
      const rockC = new THREE.Color().setHSL(0.1, 0.06, 0.36 + n * 0.08)
      { const sw = 1   /* 整個山區的陡坡都一樣（一開始只改瀑布周圍 150 m，後面那座山還是灰的） */
        if (sw > 0 && rock > 0) { const yy = pos[k * 3 + 1] + 0.1 * (x - 195), band = 0.8 + 0.34 * fbm2(yy * 0.85, 2.2 + Math.floor(yy / 7) * 3.1, 2), iron = Math.max(0, fbm2(x * 0.21 + 11, yy * 0.35 + 5, 3) - 0.6) * 1.2
          rockC.lerp(new THREE.Color().setRGB(lerp(0.52, 0.42, iron) * band, lerp(0.41, 0.2, iron) * band, lerp(0.27, 0.1, iron) * band), sw) } }
      c.lerp(rockC.lerp(new THREE.Color().setHSL(0.2 + n * 0.04, 0.35, 0.16 + n * 0.06), fk), rock)                     // 岩石（林裡是青苔）
      const tdd = alpineTrailDist(x, z), tr = ss(1.6, 0.9, tdd)
      // 2026-11-10 ChatGPT：路面不要一整片同樣的棕色 → 中間踩實的深色泥土、兩側碎石較淺、一塊塊沖刷的痕跡
      { const g1 = fbm2(x * 2.1, z * 2.1, 2), er = Math.max(0, fbm2(x * 0.6 + 3, z * 0.6, 2) - 0.6) * 2
        const dirt = new THREE.Color().setHSL(0.08, 0.28, 0.33 + n * 0.04)
        dirt.lerp(new THREE.Color().setHSL(0.075, 0.3, 0.25 + g1 * 0.05), ss(0.85, 0.15, tdd) * 0.65)
        dirt.lerp(new THREE.Color().setHSL(0.1, 0.1, 0.4 + g1 * 0.1), ss(0.55, 1.2, tdd) * ss(1.7, 1.15, tdd) * 0.55)
        dirt.lerp(new THREE.Color().setHSL(0.09, 0.2, 0.42), er * 0.35)
        c.lerp(dirt, tr * 0.9) }
      // 溪床、池底：濕的深色石頭和砂（水是透明的，看得到底下）；岸上一圈濕地
      const sd = alpineStreamDist(x, z), dp = Math.hypot(x - ALP_POND.x, z - ALP_POND.z) - ALP_POND.r
      const wet = Math.max(ss(4.5, 1.2, sd), ss(3, 0, dp))
      const stone = fbm2(x * 1.3, z * 1.3, 2)
      c.lerp(new THREE.Color().setHSL(0.11 + stone * 0.04, 0.16, 0.1 + stone * 0.07), wet)
      // 2026-11-11 山下湖的岸（ChatGPT 湖泊 V2）：水下泥底暗、水線一圈深色濕泥、往上草和土一塊塊混（以前一大圈灰褐泥地）
      if (dp < 10) {
        const hW = pos[k * 3 + 1] - ALP_POND.water, nt = 1 - tr
        c.lerp(new THREE.Color().setRGB(0.094, 0.088, 0.069), ss(0.0, -0.15, hW) * nt)
        c.lerp(new THREE.Color().setRGB(0.14, 0.12, 0.094), ss(-0.05, 0.0, hW) * ss(0.4, 0.12, hW) * nt)
        const patch = ss(0.42, 0.62, fbm2(x * 0.28 + 5, z * 0.28, 2))
        c.lerp(new THREE.Color().setHSL(0.2 + n * 0.05, 0.36, 0.17 + n * 0.05), ss(0.3, 1.1, hW) * ss(10, 5, dp) * nt * (0.45 + 0.45 * patch))
      }
      // 2026-11-11 瀑布湖的岸：陡的湖岸不畫成灰白的光岩（使用者：左岸一片米色的坡）→ 青苔、草的綠，水邊一圈濕的深色泥砂
      {
        const LK = YOSE.lake, e = Math.hypot((x - LK.x) / LK.rx, (z - LK.z) / LK.rz)
        if (e < 4.2 && !YOSE.behind(x, z)) {
          const shore = ss(4.2, 2.6, e) * (1 - tr)
          c.lerp(new THREE.Color().setHSL(0.21 + n * 0.05, 0.38, 0.17 + n * 0.07), shore * 0.85)
          c.lerp(new THREE.Color().setHSL(0.1 + stone * 0.03, 0.2, 0.11 + stone * 0.05), ss(1.22, 1.0, e) * 0.9)
        }
      }
      // 2026-11-10 東部：草原是乾一點的黃綠草地（陡的西緣照舊是岩坡）；濕地水裡、泥灘是濕的灰褐泥，岸上一圈深色濕泥，再往外是鹽地的黃綠矮草
      {
        let ez = eastZone(x, z)
        if (ez === 'hide') ez = grassSD(x, z) < 2 ? 'grass' : wetSD(x, z) < 14 ? 'wet' : null   // 觀察屋旁照所在的區上色（不然一圈圓形的色塊）
        if (ez === 'grass') {
          const dry = fbm2(x * 0.05 + 7, z * 0.05, 3)
          c.lerp(new THREE.Color().setHSL(0.15 + dry * 0.05, 0.36, 0.2 + n * 0.06 + dry * 0.05), (1 - rock * 0.7) * (1 - tr) * ss(-1, 3, -grassSD(x, z) + 2))
        } else if (ez === 'wet') {
          const wd = wetSD(x, z), y = pos[k * 3 + 1]
          const mud = new THREE.Color().setHSL(0.08 + stone * 0.02, 0.22, 0.13 + stone * 0.05)
          c.lerp(new THREE.Color().setHSL(0.17 + n * 0.04, 0.34, 0.2 + n * 0.05), ss(6, 2.5, wd) * (1 - tr))   // 岸上的矮草
          c.lerp(mud, Math.max(ss(2.6, 0.5, wd), ss(EAST.W + 0.5, EAST.W + 0.1, y)) * (1 - tr))
          if (inLagoon(x, z)) c.lerp(new THREE.Color().setHSL(0.09 + stone * 0.02, 0.22, 0.27 + stone * 0.06 + n * 0.04), ss(4, 0.5, wd) * 0.75 * (1 - tr))   // 2026-11-11 潟湖：岸邊、沙洲是淺色的鹽灘沙（不是沼澤的深色泥）
        }
      }
      col.set([c.r, c.g, c.b], k * 3)
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3))
    const detail = canvasTex(256, 256, (x, w, h) => {
      x.fillStyle = '#d0d0d0'; x.fillRect(0, 0, w, h)
      for (let i = 0; i < 5000; i++) { const l = 150 + Math.random() * 105; x.fillStyle = `rgba(${l},${l},${l},0.5)`; x.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 3, 1 + Math.random() * 3) }
    })
    detail.wrapS = detail.wrapT = THREE.RepeatWrapping
    const ground = new THREE.Mesh(geo, dappled(wetify(new THREE.MeshStandardMaterial({ vertexColors: true, map: detail, roughness: 0.95 }), { dark: 0.32, rough: 0.45 })))
    ground.receiveShadow = true; ground.userData.terrain = true; g.add(ground)   // terrain：拍照算遮擋時用高度表，不逐個三角形打射線（scoring.js）
  }
  // 水池＋溪：自己寫的水 shader（溪和池共用）。
  // 水面是平的（不沿著岸往上爬），岸邊靠深度測試自然切掉；每個頂點帶「水深」（水面 - 地形）和「坡度」：
  // 深的地方偏墨綠、淺的地方透出溪底，邊緣淡掉並有一圈白沫；看斜的地方反射天空（菲涅耳）、太陽方向有閃光；
  // 坡度大的那幾段流得快、一片白（小瀑布、急流）。水紋是兩層往下游捲動的雜訊，算法線用。
  const spray = [], fallFx = []
  const waterU = { uTime: { value: 0 }, uDay: dayLight, uSun: sunDirU }   // 2026-11-11 太陽方向照時間走（以前固定）
  // 2026-11-07 第三版（跟 ChatGPT 討論過，依截圖的三個問題改）：
  // 1. 反射：低角度看水面反射的是兩岸的樹和石壁（暗綠），不是白色天空；太陽高光縮小——原本像灰白塑膠
  // 2. 流向圖（uFlow，溪建好時預先算的一張貼圖）：水紋、白沫順著水流方向漂，碰到石頭會分開繞過去；
  //    石頭邊一圈白沫、上游那面堆起來、下游拖一道 V 字尾跡（B 通道）。兩個相位交替取樣，水紋才不會越拉越長
  // 3. 跌水分三段：門檻上的水是平滑發亮的（aLip）、往下是一股股白色水絲夾著深色水、底下一片翻滾的白沫
  const flowTexDummy = new THREE.DataTexture(new Uint8Array([128, 128, 0, 0]), 1, 1); flowTexDummy.needsUpdate = true
  const waterM = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, fog: true, side: THREE.DoubleSide,   // 三角形的方向不管（從上面看才不會被背面剔除）
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uTime: { value: 0 }, uDay: { value: 1 }, uDusk: { value: 0 }, uSun: { value: V() }, uFlowBox: { value: new THREE.Vector4(0, 0, 1, 1) } }]),
    vertexShader: `
      attribute float aDepth; attribute float aSlope; attribute float aFoam; attribute float aLip;
      varying vec2 vUv; varying float vDepth; varying float vSlope; varying float vFoam; varying float vLip; varying vec3 vW;
      #include <fog_pars_vertex>
      void main() {
        vUv = uv; vDepth = aDepth; vSlope = aSlope; vFoam = aFoam; vLip = aLip;
        vec4 wp = modelMatrix * vec4(position, 1.0); vW = wp.xyz;
        vec4 mvPosition = viewMatrix * wp;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: `
      uniform float uTime; uniform float uDay; uniform float uDusk; uniform float uRain; uniform vec3 uSun; uniform sampler2D uFlow; uniform vec4 uFlowBox;
      #ifdef MIRROR
        uniform sampler2D uRefl; uniform mat4 uReflMat; uniform float uReflOn;
      #endif
      varying vec2 vUv; varying float vDepth; varying float vSlope; varying float vFoam; varying float vLip; varying vec3 vW;
      #include <fog_pars_fragment>
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float vnoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y); }
      float fbm(vec2 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++) { s += a * vnoise(p); p = p * 2.03 + 7.1; a *= 0.5; } return s; }
      float fbm2(vec2 p) { return vnoise(p) * 0.65 + vnoise(p * 2.1 + 3.7) * 0.35; }
      // 2026-11-11 使用者：下雨時濕地的水面看不到漣漪（花園水池有，山區／濕地這支水面 shader 沒做）
      // 雨滴漣漪：水面切成一格格，每格一顆雨滴（位置、時間錯開），落下後一圈往外擴、越擴越淡。回傳 xy＝法線的偏移、z＝圈的亮邊
      vec3 rainRings(vec2 p, float cell, float seed) {
        vec3 acc = vec3(0.0);
        vec2 g = floor(p / cell);
        for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
          vec2 id = g + vec2(float(i), float(j));
          float h1 = hash(id + seed), h2 = hash(id * 1.7 + seed + 13.1), h3 = hash(id * 2.3 + seed + 41.7);
          float ph = fract(uTime * (0.75 + 0.5 * h3) + h1 * 7.0);                        // 這顆雨滴落下後過了多久（0～1）
          vec2 c = (id + 0.2 + 0.6 * vec2(h1, h2)) * cell, d = p - c;
          float dist = length(d), r = ph * cell * 0.85, w = cell * 0.07;
          float x = (dist - r) / w, env = exp(-x * x) * (1.0 - ph) * (1.0 - ph) * step(h3, uRain * 1.2);   // 雨越大，有雨滴的格子越多
          acc.xy += (d / max(dist, 1e-4)) * sin(x * 2.4) * env;
          acc.z += env * max(0.0, cos(x * 1.6));
        }
        return acc;
      }
      float ripple(vec2 p) { return fbm(p * 1.3) * 0.6 + fbm2(p * 3.4 + 11.0) * 0.4; }
      // 跌水面：沿著水流方向（uv）往下拉
      float fallWaves(vec2 p, float sp) {
        return fbm(p * vec2(1.6, 0.9) + vec2(0.0, -uTime * sp)) * 0.6 + fbm(p * vec2(3.1, 1.7) + vec2(3.0, -uTime * sp * 1.6)) * 0.4;
      }
      void main() {
        // 流向圖：rg＝水流方向（世界 xz，-1.5～1.5），b＝石頭的白沫、尾跡，a＝流速倍率（水池慢）
        vec2 fuv = (vW.xz - uFlowBox.xy) * uFlowBox.zw;
        vec4 fl = texture2D(uFlow, clamp(fuv, 0.0, 1.0));
        float inside = step(0.0, fuv.x) * step(fuv.x, 1.0) * step(0.0, fuv.y) * step(fuv.y, 1.0);
        vec2 flow = mix(vec2(0.08, 0.05), (fl.rg * 2.0 - 1.0) * 1.5 * mix(0.15, 1.0, fl.a), inside);
        float rockF = fl.b * inside;
        float fall = smoothstep(0.35, 1.2, vSlope);
        float lip = clamp(vLip, 0.0, 1.0);
        float fv = clamp(vFoam, 0.0, 1.2);
        // 兩個相位交替：水紋順著 flow 漂，一個相位拉長之前換另一個接手
        float spd = 0.55 + fv * 0.5 + rockF * 0.4;
        float ph0 = fract(uTime * 0.3), ph1 = fract(uTime * 0.3 + 0.5), wB = abs(ph0 - 0.5) * 2.0;
        vec2 o0 = flow * ph0 * 1.8 * spd, o1 = flow * ph1 * 1.8 * spd;
        vec2 q = vW.xz;
        float e = 0.05;
        float h0 = mix(ripple(q - o0), ripple(q - o1 + 17.3), wB);
        float hx = mix(ripple(q + vec2(e, 0.0) - o0), ripple(q + vec2(e, 0.0) - o1 + 17.3), wB);
        float hz = mix(ripple(q + vec2(0.0, e) - o0), ripple(q + vec2(0.0, e) - o1 + 17.3), wB);
        float rough = (0.55 + fv * 2.2 + rockF * 2.4) * (1.0 - lip * 0.85);      // 潭裡細紋、石頭邊和跌水底下翻滾、門檻上平滑
        vec3 Np = normalize(vec3((h0 - hx) / e * 0.06 * rough, 1.0, (h0 - hz) / e * 0.06 * rough));
        // 跌水那面：沿 uv 往下的水紋
        float sp = 0.45 + fall * 3.0;
        vec2 p = vec2(vUv.x * 1.4, vUv.y * 0.45);
        float g0 = fallWaves(p, sp), gx = fallWaves(p + vec2(0.06, 0.0), sp), gy = fallWaves(p + vec2(0.0, 0.06), sp);
        vec3 Nf = normalize(vec3((g0 - gx) * 4.0, 1.0, (g0 - gy) * 4.0));
        vec3 N = normalize(mix(Np, Nf, fall));
        float rainK = 0.0;
        if (uRain > 0.01) {
          // 兩層大小不同的圈（0.55、0.9 m 一格）；遠處的圈比像素小，淡掉（不然又是一片閃）
          float rf = (1.0 - fall) / (1.0 + 0.00035 * dot(cameraPosition - vW, cameraPosition - vW));
          vec3 rr = rainRings(q, 0.55, 3.0) + rainRings(q + 5.3, 0.9, 71.0) * 0.8;
          N = normalize(N + vec3(rr.x, 0.0, rr.y) * 0.42 * rf * min(1.0, uRain * 1.6));
          rainK = rr.z * rf * min(1.0, uRain * 1.6);
        }
        vec3 Vd = normalize(cameraPosition - vW);
        float fres = 0.02 + 0.98 * pow(1.0 - max(dot(N, Vd), 0.0), 5.0);
        float d = clamp(vDepth / 0.9, 0.0, 1.0);
        // 顏色是線性空間：山溪清澈，淺處透出黃褐石頭、深處青綠
        vec3 bed = vec3(0.10, 0.115, 0.08), mid = vec3(0.03, 0.13, 0.10), deep = vec3(0.006, 0.05, 0.045);   // 2026-11-12 參考圖：清澈、深處翡翠綠
        vec3 col = mix(bed, mid, smoothstep(0.0, 0.45, d));
        col = mix(col, deep, smoothstep(0.45, 1.0, d));
        #ifdef LAKE
          // 2026-11-11 使用者：湖邊很淡很透明、不像湖（ChatGPT 湖泊 V2，linear RGB）：前 0.35 m 就轉成看得出來的湖水色
          col = mix(vec3(0.075, 0.115, 0.085), vec3(0.030, 0.080, 0.070), smoothstep(0.02, 0.35, vDepth));
          col = mix(col, vec3(0.010, 0.040, 0.045), smoothstep(0.30, 0.95, vDepth));
          col += vec3(0.006, 0.014, 0.01) * (h0 - 0.5);
          #ifdef MIRROR
            // 2026-11-11 夕陽潟湖（x < 30）：鹹水的顏色——很淺的地方透出粉橘（鹽水裡的藻、像七股鹽田），往深一點是乳白帶綠的青綠色，深處藍綠
            float lagK = smoothstep(31.5, 28.5, vW.x);
            vec3 lagCol = mix(vec3(0.30, 0.14, 0.12), vec3(0.2, 0.15, 0.14), smoothstep(0.4, 1.6, vDepth));   // 深水道只比淺灘暗一點、偏灰玫瑰（以前一條硬邊的藍綠帶）
            lagCol = mix(lagCol, vec3(0.08, 0.1, 0.105), smoothstep(1.7, 2.6, vDepth));
            col = mix(col, lagCol, lagK);
          #endif
        #endif
        col += vec3(0.01, 0.026, 0.02) * (h0 - 0.5) * (1.0 - d * 0.5);
        #ifndef MIRROR
        {
          // 2026-11-12 焦散光（使用者參考圖：陽光透過水紋在溪底織出一張晃動的亮網）：兩層雜訊相減取細線，淺水最明顯、1 m 以下看不到；陰天、晚上沒有
          vec2 cp = vW.xz * 3.6 + N.xz * 0.6;
          float c1 = vnoise(cp + uTime * vec2(0.32, 0.21)), c2 = vnoise(cp * 1.37 + vec2(5.2, 1.3) - uTime * vec2(0.26, 0.34));
          float c3 = vnoise(cp * 2.9 + vec2(2.1, 7.7) + uTime * vec2(0.41, -0.3));
          float ca = pow(clamp(1.0 - abs(c1 - c2) * 2.6, 0.0, 1.0), 7.0) + 0.5 * pow(clamp(1.0 - abs(c2 - c3) * 2.6, 0.0, 1.0), 9.0);
          float shallow = smoothstep(0.0, 0.06, vDepth) * (1.0 - smoothstep(0.15, 1.0, vDepth));
          col += vec3(0.30, 0.46, 0.33) * ca * shallow * uDay * (1.0 - uRain) * 0.3 * smoothstep(0.25, 0.7, vnoise(vW.xz * 0.45 + 3.7));   // 一片一片（樹蔭下沒有、空曠處才有），不是整條溪都一樣
        }
        #endif
        // 反射：低角度看過去倒映的是兩岸的樹和石壁（暗綠、一塊深一塊淺），只有幾乎正上方的反射才是天空
        vec3 R = reflect(-Vd, N);
        vec3 sky = mix(fogColor, vec3(0.78, 0.85, 0.9), 0.5);
        float trees = fbm2(vW.xz * 0.3 + R.xz * 0.5);   // 倒影的明暗跟著位置慢慢變（太跟著反射角走，跌水那面會變成豹紋）
        vec3 bank = mix(vec3(0.008, 0.018, 0.011), vec3(0.03, 0.05, 0.032), trees);
        vec3 env = mix(bank, sky * 0.75, smoothstep(0.82, 0.99, R.y));
        #ifdef MIRROR
          // 2026-11-11 濕地 V3：真的倒影（mirror.js 鏡射鏡頭畫的）——天空、雲、枯樹、木樁、鳥都倒映在淺水上；水紋把倒影扭一點點
          vec4 rc = uReflMat * vec4(vW, 1.0);
          // 2026-11-11 使用者：倒影太 pixel、看了暈。水紋扭倒影的量原本固定 0.018（螢幕的 1.8%），遠處的水紋比一個像素還小，每個像素扭的方向都不一樣，
          // 倒影碎成一點一點、走動時整片閃 → 近處才扭、越遠越平（遠處的水面本來就像鏡子）
          float rd = 0.011 / (1.0 + 0.09 * distance(cameraPosition, vW));
          vec3 refl = texture2D(uRefl, rc.xy / rc.w + N.xz * rd).rgb;
          env = mix(env, refl, uReflOn);
        #endif
        #ifdef LAKE
          col = mix(col, env, 0.08 + 0.77 * fres);   // 菲涅耳只管倒影多少（俯視看水色、斜看越來越多天空和樹的倒影）
          #ifdef MIRROR
            col = mix(col, env, uReflOn * (0.3 + 0.55 * fres));   // 濕地的淺水像鏡子（概念圖）：俯視也有三成倒影，斜看幾乎全是
          #endif
        #else
        col = mix(col, env, clamp(fres * (1.0 + lip * 0.6) * (1.0 - fall * 0.75), 0.0, 0.92));
        #endif   // 跌水那面是碎水，幾乎不倒影
        // 太陽高光：小而亮（原本太大一片，看起來像塑膠）
        float sunUp = smoothstep(-0.03, 0.04, uSun.y);
        float sd = max(dot(reflect(-uSun, N), Vd), 0.0);
        float spec = pow(sd, 260.0);
        col += vec3(1.0, 0.97, 0.9) * spec * (1.6 + lip * 1.5) * sunUp;
        col += vec3(0.75, 0.8, 0.85) * rainK * 0.17 * (0.35 + 0.65 * uDay);   // 漣漪圈的亮邊（天光）
        // 2026-11-11 夕陽金光路徑（ChatGPT：顏色 (1,.7,.31)、HDR 2～3；遠處 2～4°、近處 10～16° 寬）：
        // 寬的一層暖光＋把水紋放大 3.5 倍算的碎金點（一閃一閃），只在黃昏／清晨太陽低的時候
        vec3 Ng = normalize(vec3(N.x * 3.5, 1.0, N.z * 3.5));
        float sg = max(dot(reflect(-uSun, Ng), Vd), 0.0);
        float spark = smoothstep(0.5, 0.9, vnoise(vW.xz * 7.0 + uTime * vec2(0.9, -0.5)) * 0.6 + vnoise(vW.xz * 17.0 - uTime * vec2(0.4, 0.8)) * 0.4);
        float glit = (pow(sd, 18.0) * 0.55 + pow(sg, 70.0) * (0.3 + 3.2 * spark)) * uDusk * sunUp;
        col += vec3(1.0, 0.58, 0.2) * glit * 3.6;
        col += vec3(1.0, 0.98, 0.93) * pow(sg, 110.0) * spark * 2.2 * uDay * sunUp * (1.0 - uDusk);   // 白天：水面上一點一點跳動的亮點
        col = mix(col, col * vec3(1.15, 0.92, 0.7), uDusk * sunUp * 0.35 * smoothstep(0.6, 0.98, sd));   // 太陽那個方向的水面整片偏金
        // 跌水：一股股白色水絲，中間夾著深色透明的水
        // 三層：粗的水股、細的水絲、最細的拉絲（長焦拉近看才不會是一片糊糊的白）
        float streak = fbm(vec2(vUv.x * 22.0, vUv.y * 0.35 - uTime * sp * 0.9)) * 0.5 + fbm(vec2(vUv.x * 38.0, vUv.y * 1.8 - uTime * sp * 1.25)) * 0.3 + vnoise(vec2(vUv.x * 110.0, vUv.y * 5.0 - uTime * sp * 1.6)) * 0.2;
        float curtain = fall * (0.4 + 0.6 * smoothstep(0.36, 0.52, streak)) * (0.75 + 0.25 * smoothstep(0.0, 0.6, vUv.x * (1.0 - vUv.x) * 4.0));
        // 2026-11-10 使用者：河口的水要 extremely realistic（ChatGPT：下緣分成 3～6 股、不要整片白）→ 水簾橫向分成幾股粗水柱（往下越分越開），股與股之間是很薄的水、透出後面濕黑的岩壁
        float strands = smoothstep(0.34, 0.6, fbm(vec2(vUv.x * 4.2 + 1.3, vUv.y * 0.05)) + 0.12 * (1.0 - fall) - 0.1 * fall * vnoise(vec2(vUv.x * 9.0, vUv.y * 0.3)));
        curtain *= mix(0.3, 1.0, strands);   // 2026-11-09：以前八成以上是白的，像一塊白色塑膠板 → 一股股白水絲之間露出透明的深色水；兩邊比中間薄
        // 白沫：跟著水流漂（同一組相位），一塊塊、邊緣碎；跌水底下＋石頭邊／尾跡
        float fb = mix(fbm(q * 2.6 - o0 * 1.2) * 0.55 + fbm2(q * 8.0 - o0 * 1.2) * 0.45, fbm(q * 2.6 - o1 * 1.2 + 9.1) * 0.55 + fbm2(q * 8.0 - o1 * 1.2 + 9.1) * 0.45, wB);   // 泡沫要碎（大塊模糊的白像抹上去的）
        float amt = clamp(fv * 0.75 + rockF * 1.1, 0.0, 1.2);
        float foam = smoothstep(0.78 - amt * 0.36, 0.86 - amt * 0.3, fb) * min(1.0, amt * 1.3);
        foam += smoothstep(0.05, 0.0, vDepth) * smoothstep(0.62, 0.78, fb) * 0.3;   // 岸邊一點點
        foam *= (1.0 - lip * 0.9) * (1.0 - fall);   // 跌水那面不用（白沫是照水平面排的，貼到幾乎垂直的面會拉成一條條糊糊的白），那面只用水絲
        foam = clamp(max(foam, curtain), 0.0, 1.0);
        vec3 white = vec3(0.8, 0.85, 0.86) * (0.82 + 0.18 * h0);
        col = mix(col, white, foam * 0.88);
        col *= mix(0.12, 1.0, uDay);
        float a = mix(0.13, 0.82, d) + foam * 0.55 + fres * 0.35 + fall * 0.1 + lip * 0.2;   // 淺的地方更透（看得到溪底的卵石）
        a = mix(a, mix(0.18, 0.4, strands) + 0.58 * curtain, fall);
        // 水簾兩側邊緣碎成一絲絲（越往下越碎），不是一條切齊的直邊
        float edgeD = min(vUv.x, 1.0 - vUv.x);
        a *= mix(1.0, smoothstep(0.0, 0.06 + 0.14 * vnoise(vec2(vUv.x * 40.0, vUv.y * 1.5 - uTime * 4.0)), edgeD), fall);
        col = mix(col, col * 0.45, fall * (1.0 - strands) * (1.0 - foam));   // 跌水那面：水絲不透明、水絲之間半透明   // 淺的地方看得到溪底
        a *= smoothstep(0.0, 0.05, vDepth);
        #ifdef LAKE
          #ifdef MIRROR
          a = clamp((0.55 + 0.42 * (1.0 - exp(-vDepth / 0.22)) + foam * 0.3) * smoothstep(0.0, 0.015, vDepth), 0.0, 0.97);
          #else
          a = clamp((0.26 + 0.70 * (1.0 - exp(-vDepth / 0.34)) + foam * 0.3 + fres * 0.3) * smoothstep(0.0, 0.015, vDepth), 0.0, 0.97);   // 2026-11-12 山上的湖：岸邊半公尺清澈見底，往裡才是湖水色
          #endif   // 1 cm 就 55%，水線只淡 1.5 cm（以前 5 cm 才 31%）
        #endif                                      // 岸邊淡掉，不會有一條硬邊
        gl_FragColor = vec4(col, clamp(a, 0.0, 1.0));
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  })
  waterM.uniforms.uFlow = { value: flowTexDummy }
  waterM.uniforms.uTime = waterU.uTime; waterM.uniforms.uDay = dayLight; waterM.uniforms.uDusk = duskLight; waterM.uniforms.uSun = waterU.uSun; waterM.uniforms.uRain = weatherU.rain
  {
    // 水池：一片比池子大一點的平面，每點的水深照地形算（沒水的地方深度 < 0 → 透明）
    const R = ALP_POND.r + 3, NR = 28, NA = 64, pos = [], uv = [], dep = [], slo = [], idx = []
    for (let i = 0; i <= NR; i++) for (let j = 0; j <= NA; j++) {
      const r = R * i / NR, a = j / NA * TAU, x = ALP_POND.x + Math.cos(a) * r, z = ALP_POND.z + Math.sin(a) * r
      pos.push(x, ALP_POND.water, z); uv.push(x * 0.35, z * 0.35); dep.push(ALP_POND.water - alpineHeight(x, z)); slo.push(0)
      if (i && j) { const A = (i - 1) * (NA + 1) + j - 1, B = A + 1, C = A + NA + 1, D = C + 1; idx.push(A, C, B, B, C, D) }
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
    geo.setAttribute('aDepth', new THREE.Float32BufferAttribute(dep, 1)); geo.setAttribute('aSlope', new THREE.Float32BufferAttribute(slo, 1)); geo.setAttribute('aFoam', new THREE.Float32BufferAttribute(new Float32Array(slo.length), 1)); geo.setAttribute('aLip', new THREE.Float32BufferAttribute(new Float32Array(slo.length), 1)); geo.setIndex(idx)
    const lakeM = waterM.clone(); lakeM.uniforms = waterM.uniforms; lakeM.defines = { ...(waterM.defines || {}), LAKE: 1 }
    const pond = new THREE.Mesh(geo, lakeM); pond.renderOrder = 2; g.add(pond)
    // 2026-11-10 東部人工濕地：方格水面蓋住整個盆地，每點水深照地形算（岸上深度 < 0 → 透明），岸線自然由深度測試切出來
    {
      const [x0, x1, z0, z1] = EAST.wetBox, cs = 0.75, nxw = Math.ceil((x1 - x0) / cs), nzw = Math.ceil((z1 - z0) / cs)
      const P = [], U = [], D = [], S0 = [], I = []
      for (let j = 0; j <= nzw; j++) for (let i = 0; i <= nxw; i++) {
        const x = x0 + i * cs, z = z0 + j * cs
        const dd = EAST.W - alpineHeight(x, z)
        P.push(x, EAST.W, z); U.push(x * 0.35, z * 0.35); D.push(dd > 0 ? dd * 1.7 + 0.07 : dd); S0.push(0)   // 濕地的水是混濁的（不像山溪清澈見底）：深度給 shader 加倍，比較不透、比較反光
      }
      for (let j = 0; j < nzw; j++) for (let i = 0; i < nxw; i++) {
        const a = j * (nxw + 1) + i, b = a + 1, c2 = a + nxw + 1, d = c2 + 1
        if (Math.max(D[a], D[b], D[c2], D[d]) > -0.05) I.push(a, c2, b, b, c2, d)   // 全部在岸上的格子不畫
      }
      const wg = new THREE.BufferGeometry()
      wg.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); wg.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2))
      wg.setAttribute('aDepth', new THREE.Float32BufferAttribute(D, 1)); wg.setAttribute('aSlope', new THREE.Float32BufferAttribute(S0, 1))
      wg.setAttribute('aFoam', new THREE.Float32BufferAttribute(new Float32Array(S0.length), 1))
      for (const nm of Object.keys(geo.attributes)) if (!wg.attributes[nm]) wg.setAttribute(nm, new THREE.Float32BufferAttribute(new Float32Array(S0.length * geo.attributes[nm].itemSize), geo.attributes[nm].itemSize))
      wg.setIndex(I)
      // 2026-11-11 濕地 V3：湖水的顏色／透明度曲線＋真的倒影（MIRROR）
      const wetMirror = createMirror({ Y: EAST.W, center: [(x0 + x1) / 2, (z0 + z1) / 2], maxDist: 120 })
      const wetM = waterM.clone(); wetM.uniforms = { ...waterM.uniforms, uRefl: wetMirror.uRefl, uReflMat: wetMirror.uReflMat, uReflOn: wetMirror.uReflOn }
      wetM.defines = { ...(waterM.defines || {}), LAKE: 1, MIRROR: 1 }
      const wet = new THREE.Mesh(wg, wetM); wet.renderOrder = 2; wet.name = 'eastWetland'; g.add(wet)
      wetMirror.hide.push(wet); g.userData.wetMirror = wetMirror
    }
    // 溪（2026-11-07 改成階梯式：一個個水潭、潭和潭之間一道跌水，layout.js buildSteps）
    // 沿著溪中線每 0.25 公尺一個斷面；水面高度照沿溪距離查（潭裡平的、跌水往下彎）。
    // 斷面寬度不是固定的：往兩邊找到岸比水面高的地方為止（再多 0.15 公尺讓岸自然切掉），水才不會凸出岸外。
    // 每個頂點帶：水深、坡度（跌水那幾格很陡）、白沫量（跌水底下最多，往下游漂散）。
    // 2026-11-11 兩條：原本的溪、瀑布湖流出來的河（同一套水面、石頭、流向圖；河另外一份材質，流向圖各自一張）
    for (const st of ALP_STREAMS) {
    const wm = st === ALP_STREAM ? waterM : (() => { const m = waterM.clone(); m.uniforms = { ...m.uniforms, uTime: waterU.uTime, uDay: dayLight, uDusk: duskLight, uSun: waterU.uSun, uRain: weatherU.rain }; return m })()
    const P = []
    for (let i = 0; i < st.length; i++) P.push(V(st[i][0], 0, st[i][1]))
    const curve = new THREE.CatmullRomCurve3(P, false, 'centripetal'), L = curve.getLength(), N = Math.ceil(L / 0.25), K = st.wide ? 26 : 16, WK = st.wide ? 2.1 : 1, LATR = st.wide ? 7.5 : 4   // 寬的河：斷面 26 個頂點、往兩邊找 7.5 公尺；石頭的位置照河寬放大 WK 倍
    const sp = [], su = [], sd = [], ss_ = [], sf = [], sl = [], si = []
    const S = []
    for (let i = 0; i <= N; i++) { const p = curve.getPointAt(i / N); S.push(st.sAt(p.x, p.z)) }
    const slopeAt = (s) => Math.max(0, (st.water(s - 0.25) - st.water(s + 0.25)) / 0.5)
    const foamAt = (s) => {
      let f = 0
      for (const d of st.drops) {
        const x = s - d.s
        if (x >= 0) f += Math.min(1.1, 0.25 + d.h * 0.55) * Math.exp(-x / (0.35 + d.h * 0.35))   // 跌水底下一片白沫，往下游很快散掉
      }
      // 2026-11-10 檢查員（ChatGPT「河流景觀優化規格」：落點白沫 45～70%、往下游拖 1.5～3 m）：
      // 陡的急流（riffle，不算 drop）以前底下完全沒有白水——河口那段 8 m 掉 6 m 像一片水泥溢洪道。陡坡本身和坡底往下游都加白沫
      let im = 0
      for (let x = 0; x <= 3.5; x += 0.25) im = Math.max(im, ss(0.18, 0.55, slopeAt(s - x)) * Math.exp(-x / 1.6))
      return Math.min(1.5, f + im * 0.95)
    }
    // 門檻上那一小段：水加速、變薄，表面平滑發亮（真的跌水邊緣是一道亮亮的「玻璃」，翻下去才碎成白色）
    const lipAt = (s) => { let l = 0; for (const d of st.drops) { const x = s - d.s; if (x > -0.9 && x < 0.15) l = Math.max(l, Math.min(1, d.h * 1.2) * Math.min(1, (x + 0.9) / 0.6) * (x > 0 ? 1 - x / 0.15 : 1)) } return l }
    let acc = 0, prev = null, prevRow = null
    for (let i = 0; i <= N; i++) {
      const p = curve.getPointAt(i / N), tg = curve.getTangentAt(i / N), side = V(-tg.z, 0, tg.x).normalize()
      // 2026-11-10 河口：河面延伸進湖約 3.5 m 就停（ChatGPT 3～5 m）；再往裡是湖面自己（以前一路鋪進湖裡，湖中間一圈河面的邊）
      if (st.wide && Math.hypot(p.x - ALP_POND.x, p.z - ALP_POND.z) < ALP_POND.r - 3.5) break
      if (prev) acc += p.distanceTo(prev); prev = p
      // 門檻是斜的、彎的（layout.js streamLatOff）：每一排頂點沿水流方向錯開 off，整排剛好落在同一條「等高線」上，
      // 一排的水面高度都一樣——網格不會被斜的門檻切成鋸齒（第一版每個頂點各查各的，跌水那面全是 V 字摺痕）
      const w = st.water(S[i]), slope = Math.max(0, (st.water(S[i] - 0.25) - st.water(S[i] + 0.25)) / 0.5), f = foamAt(S[i]), lp = lipAt(S[i])
      const at2 = (lat) => { const o = streamLatOff(S[i], lat); return [p.x + side.x * lat - tg.x * o, p.z + side.z * lat - tg.z * o] }
      // 2026-11-09：斷面以前從平滑曲線的中心往兩邊找岸，但溪谷是照折線挖的，轉彎處曲線會偏離溪谷快 1 公尺——
      // 中心落在岸上、只找到一小段，半條溪沒有水面（看起來是乾的溪床）。改成在 ±4 公尺內，從第一個比水面低的點到最後一個都鋪水面
      // 2026-11-10 使用者截圖（營地往瀑布看）：一大片河面浮在坡上 → 以前取「±7.5 公尺內第一個到最後一個比水面低的點」，
      // 岸外面（營地那側、比水面低的坡）也算進去，水面跨過河岸鋪到坡上。改成：先找離中心最近的水下點，再往兩邊延伸、碰到第一個比水面高的岸就停
      let a0 = null, b0 = null
      {
        const under = (lat) => { const [x, z] = at2(lat); return alpineHeight(x, z) < w }
        let c = null
        for (let d = 0; d <= LATR && c === null; d += 0.1) { if (under(d)) c = d; else if (under(-d)) c = -d }
        if (c !== null) {
          a0 = c; b0 = c
          // 河中間露出水面的石頭、沙洲（0.8 公尺以內）跳過去，不要把半條河切掉
          const grow = (x0, dir) => { let x = x0; for (;;) { let nx = null; for (let g = 0.1; g <= 0.8 + 1e-6; g += 0.1) { const t = x + dir * g; if (Math.abs(t) > LATR) break; if (under(t)) { nx = t; break } } if (nx === null) return x; x = nx } }
          a0 = grow(a0, -1); b0 = grow(b0, 1)
          // 出水口那幾排沒有岸（還在湖口）：最多鋪到河寬外 1.5 公尺（小溪 2.6 公尺），不會一路鋪到營地那邊的低地
          const cap = st.wide ? st.halfAt(S[i]) + 1.5 : 2.6
          a0 = Math.max(a0, -cap); b0 = Math.min(b0, cap)
        }
      }
      const best = a0 === null ? null : { a: a0, b: b0 }   // 中間凸出水面的石頭、沙洲：那幾格水深 < 0，shader 自己會透明
      let la = best ? best.a - 0.15 : -0.45, lb = best ? best.b + 0.15 : 0.45
      // 2026-11-10 使用者：石頭瀑布落下來的水最後插出地形 → 跌水下面那排如果比門檻寬（例如落進水池、下面整片都比水面低），
      // 水簾兩側會斜斜地往外張開、下緣兩角穿出岸邊的岩石。跌水正下方那排不能比上面門檻那排寬：水簾兩側直直落下、留在岸裡面
      const inFall = st.lipS != null && S[i] > st.lipS - 0.1 && S[i] < st.lipS + 1.8   // 2026-11-11 河口真瀑布：水簾越往下越散、越寬（每排最多外擴 0.12 m）
      if (prevRow && prevRow.w - w > 0.12) { la = Math.max(la, prevRow.la - (inFall ? 0.12 : 0)); lb = Math.min(lb, prevRow.lb + (inFall ? 0.12 : 0)); if (lb - la < 0.6) { const m = (la + lb) / 2; la = m - 0.3; lb = m + 0.3 } }
      prevRow = { w, la, lb }
      for (let k = 0; k <= K; k++) {
        const t = k / K, lat = la + (lb - la) * t, [x, z] = at2(lat)
        sp.push(x, w, z); su.push(t, acc - w * 1.2); sd.push(w - alpineHeight(x, z)); ss_.push(st.wide ? slope * lerp(0.6, 1.05, ss(0.25, 0.55, slope)) : slope); sf.push(f); sl.push(lp)   // 寬的河：淺灘是斜的，坡度白沫只留三成（ChatGPT：白沫主要在石頭邊、落水處）
      }
      if (i) for (let k = 0; k < K; k++) { const A = (i - 1) * (K + 1) + k, B = A + 1, C = A + K + 1, D = C + 1; si.push(A, C, B, B, C, D) }
    }
    const sg = new THREE.BufferGeometry()
    sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3)); sg.setAttribute('uv', new THREE.Float32BufferAttribute(su, 2))
    sg.setAttribute('aDepth', new THREE.Float32BufferAttribute(sd, 1)); sg.setAttribute('aSlope', new THREE.Float32BufferAttribute(ss_, 1))
    sg.setAttribute('aFoam', new THREE.Float32BufferAttribute(sf, 1)); sg.setAttribute('aLip', new THREE.Float32BufferAttribute(sl, 1)); sg.setIndex(si)
    const stream = new THREE.Mesh(sg, wm); stream.renderOrder = 2; g.add(stream)
    // 石頭：用溪的折線（地形就是照它挖的）放
    const rr = mulberry32(77), stones = {}
    const MOSS = ['mrock_8', 'mrock_10', 'mrock_2', 'mrock_5', 'mrock_11'], BIG = ['boulder', 'mrock_3', 'mrock_7', 'mrock_9', 'mrock_12']
    const at = (s) => { let i = 0; while (i < st.length - 2 && st.S[i + 1] < s) i++; const u = (s - st.S[i]) / (st.S[i + 1] - st.S[i]); const x = lerp(st[i][0], st[i + 1][0], u), z = lerp(st[i][1], st[i + 1][1], u), dx = st[i + 1][0] - st[i][0], dz = st[i + 1][1] - st[i][1], l = Math.hypot(dx, dz); return { x, z, sx: -dz / l, sz: dx / l } }
    const put = (names, x, z, y, k, flat = 0.75) => {
      if (st.wide && alpineTrailDist(x, z) < 1.5 + k * 0.9) return   // 寬的河的石頭不能擋到步道（河岸的大石頭以前滾到路上）
      const n = names[Math.floor(rr() * names.length)]
      ;(stones[n] ||= []).push({ p: V(x, y, z), q: new THREE.Quaternion().setFromEuler(new THREE.Euler((rr() - 0.5) * 0.4, rr() * TAU, (rr() - 0.5) * 0.4)), s: V(k, k * (flat + rr() * 0.35), k), c: new THREE.Color().setHSL(0.2, 0.1, 0.62 + rr() * 0.18) })
    }
    // 每道跌水：兩側各一兩顆大石頭夾著（水從中間的缺口翻下去），高的跌水門檻中間偶爾也有一顆把水分成兩股
    for (const d of st.drops) {
      const c = at(d.s - 0.15)
      for (const sgn of [-1, 1]) {
        const n = 1 + (rr() < 0.6 ? 1 : 0)
        for (let j = 0; j < n; j++) {
          const r = (0.75 + rr() * 0.7 + j * 0.8) * WK, x = c.x + c.sx * r * sgn, z = c.z + c.sz * r * sgn, back = (rr() - 0.3) * 0.8
          const k = 0.45 + Math.min(0.5, d.h * 0.3) + rr() * 0.3
          put(BIG, x - c.sz * back, z + c.sx * back, d.up - 0.35 - rr() * 0.2, k)
        }
      }
      // 門檻上：兩三顆石頭冒出水面，把翻下去的水切成幾股（門檻看起來才不是一條直線）
      for (let j = 0, n = 2 + (rr() < 0.5 ? 1 : 0); j < n; j++) { const o = (rr() - 0.5) * 2.2 * WK, b = at(d.s - 0.1 + (rr() - 0.5) * 0.5); put(MOSS, b.x + b.sx * o, b.z + b.sz * o, d.up - 0.3, 0.26 + rr() * 0.2, 0.6) }
      // 跌水正下方：幾顆被沖圓的石頭半沉在潭裡
      for (let j = 0; j < 2; j++) { const b = at(d.s + 1.2 + rr() * 1.8), o = (rr() - 0.5) * 1.6; put(MOSS, b.x + b.sx * o, b.z + b.sz * o, d.down - 0.3, 0.22 + rr() * 0.18, 0.55) }
    }
    // 2026-11-11 寬的河（ChatGPT：落差要有「石門檻」——整排大石頭橫過河道、兩端埋進岸裡、比上游水面高，中間留 1～2 個缺口讓水從缺口落下）
    if (st.wide) for (const d of st.drops) {
      if (d.fall) {
        // 2026-11-10 河口的真瀑布（layout.js lipS）：不排整排石門檻（會變成一道 5 m 的石牆擋在水簾前面）；
        // 水簾兩側沿著岩壁一顆顆往下疊（擋住 15～30% 的水、蓋住岸的直邊），消能潭兩側各兩三顆半沉的大石，正前方留空看得到瀑布
        const hw = st.halfAt(d.s - 0.3)
        for (const sgn of [-1, 1]) {
          for (let y = d.up - 0.2; y > d.down - 0.3; y -= 0.9 + rr() * 0.5) { const b = at(d.s - 0.5 - rr() * 0.4), o = (hw + 0.25 + rr() * 0.5) * sgn, k = 0.7 + rr() * 0.6, sx = b.x + b.sx * o, sz = b.z + b.sz * o, th = alpineHeight(sx, sz); if (y - 0.55 * k > th + 0.15 || Math.hypot(alpineHeight(sx + 0.6, sz) - th, alpineHeight(sx, sz + 0.6) - th) / 0.6 > 1.7) continue; put(rr() < 0.6 ? BIG : MOSS, b.x + b.sx * o, b.z + b.sz * o, y - 0.55 * k, k, 0.85) }   // 疊在水簾兩側的岩壁上（岩唇線往後、水寬外面），不擋在水前面
          for (let j = 0; j < 2 + (rr() < 0.5 ? 1 : 0); j++) { const b = at(d.s + 2 + rr() * 3), o = (hw + 0.6 + rr() * 1.4) * sgn, k = 0.7 + rr() * 0.6; put(rr() < 0.5 ? BIG : MOSS, b.x + b.sx * o, b.z + b.sz * o, d.down - 0.6 * k, k, 0.85) }
          // 檢查員：瀑布兩側、後方是一大片光滑的灰土坡（像水泥牆）；第二輪：rockface 像一片片扁平卡片 → 改成有厚度的大石頭（mrock 3/7/9/12、boulder）
          // 從潭邊一層層疊上去到岩唇高度，一半埋進坡裡；沿著潭岸往下游也排兩排（蓋住左邊那片大灰坡）
          for (let row = 0; row < 5; row++) for (let j = 0; j < 5; j++) {
            const b = at(d.s - 1.6 + j * 1.6 + rr() * 0.7), o = (hw + 0.6 + row * 1.5 + rr() * 0.7) * sgn, k = 1.1 + rr() * 0.8 - row * 0.12
            const x = b.x + b.sx * o, z = b.z + b.sz * o, h0r = alpineHeight(x, z)
            if (Math.hypot(alpineHeight(x + 0.6, z) - h0r, alpineHeight(x, z + 0.6) - h0r) / 0.6 > 1.7) continue   // 檢查員：坡度 > 60° 的牆面上不放（看起來黏在牆上懸空）
            put(rr() < 0.75 ? BIG : MOSS, x, z, Math.max(d.down - 0.5 * k, alpineHeight(x, z) - 0.45 * k), k, 0.8)   // 坐在坡面上、一半埋進去
          }
        }
        continue
      }
      const c = at(d.s - 0.2), hw = st.halfAt(d.s), gaps = [(rr() - 0.5) * hw * 0.8]
      if (hw > 2.2 && rr() < 0.6) gaps.push(-gaps[0] * 0.9 + (rr() - 0.5) * 0.6)
      for (let o = -hw - 0.6; o <= hw + 0.6; o += 0.55 + rr() * 0.35) {
        if (gaps.some((gp) => Math.abs(o - gp) < 0.55 + rr() * 0.2)) continue
        const k = 0.55 + d.h * 0.9 + rr() * 0.45, back = (rr() - 0.5) * 0.5
        put(rr() < 0.55 ? BIG : MOSS, c.x + c.sx * o - c.sz * back, c.z + c.sz * o + c.sx * back, d.down - 0.25, k, 0.85)
      }
    }
    // 2026-11-10 檢查員：陡的急流段（坡度 > 40%，不算 drop）兩岸是一條直直的土牆、水面一整片光滑 → 像水泥溢洪道。
    // 找出每一段陡坡；兩岸每 1 m 左右一顆大石頭（埋進岸裡、蓋住那條直邊），河道中間幾顆冒出水面把水切成幾股（ChatGPT：15～30% 的水被石頭擋住）
    const steep = []
    { let a = null; for (let x = 0; x <= st.len; x += 0.25) { const on = slopeAt(x) > 0.4; if (on && a === null) a = x; if (!on && a !== null) { const h = st.water(a) - st.water(x); if (h > 0.8) steep.push({ s0: a, s1: x, h, down: st.water(x) }); a = null } } }
    const putS = (n, x, z, y, k, f) => { if (alpineTrailDist(x, z) < 1.5 + k * 0.9) return; put(n, x, z, y, k, f) }   // 有碰撞，小溪也不能擋到步道
    for (const r of steep) {
      if (st.drops.some((d) => d.fall && d.s > r.s0 - 1.5 && d.s < r.s1 + 1.5)) continue   // 真瀑布那段另外放（上面 d.fall），不要在半空中的水簾裡放石頭
      for (let x = r.s0; x <= r.s1 + 0.6; x += 0.6 + rr() * 0.4) {
        const c = at(x), hw = st.wide ? st.halfAt(x) : 1.25, w = st.water(x)
        for (const sgn of [-1, 1]) { const o = (hw + 0.15 + rr() * 0.6) * sgn, k = (st.wide ? 0.75 : 0.5) + rr() * 0.6; putS(rr() < 0.6 ? BIG : MOSS, c.x + c.sx * o, c.z + c.sz * o, w - 0.45 * k, k, 0.8) }
        if (rr() < (st.wide ? 0.5 : 0.3)) { const o = (rr() - 0.5) * 1.5 * hw, k = (st.wide ? 0.5 : 0.35) + rr() * 0.4; putS(rr() < 0.5 ? BIG : MOSS, c.x + c.sx * o, c.z + c.sz * o, w - 0.25 * k, k, 0.7) }
      }
    }
    // 潭尾淺的地方、岸邊：零星的石頭（岸上的一半埋在土裡）
    // 寬的河：岸上的大石頭多一點、大一點（ChatGPT：每 20 公尺 3～7 顆巨石），三成埋進土裡
    for (let s = 1; s < st.len - 1; s += st.wide ? 0.9 : 1.6) {
      const c = at(s), sgn = rr() < 0.5 ? -1 : 1
      if (rr() < 0.55) { const r = st.wide ? st.halfAt(s) + 0.3 + rr() * 3 : 1.6 + rr() * 1.2, x = c.x + c.sx * r * sgn, z = c.z + c.sz * r * sgn, kk = st.wide ? (rr() < 0.25 ? 1.0 + rr() * 1.4 : 0.35 + rr() * 0.6) : 0.3 + rr() * 0.45; put(rr() < 0.4 ? BIG : MOSS, x, z, alpineHeight(x, z) - 0.3 * kk, kk) }
      if (rr() < 0.3) { const o = (rr() - 0.5) * 1.8 * WK, x = c.x + c.sx * o, z = c.z + c.sz * o, w = st.water(s); if (w - alpineHeight(x, z) < 0.45) put(MOSS, x, z, w - 0.18, 0.18 + rr() * 0.16, 0.5) }
    }
    // 溪床裡一顆顆圓圓的石頭（參考影片：水在石頭之間流，不是一條空的水道）：淺的地方多、冒出水面
    for (let s = 0.8; s < st.len - 0.8; s += st.wide ? 0.55 : 0.9) {
      const c = at(s)
      for (let j = 0; j < 2; j++) {
        if (rr() < 0.35) continue
        const o = (rr() - 0.5) * 3.2 * WK, x = c.x + c.sx * o, z = c.z + c.sz * o, w = st.water(s), dep = w - alpineHeight(x, z)
        if (dep < 0.02 || dep > 0.8) continue
        const k = 0.16 + rr() * 0.3 + (rr() < 0.15 ? 0.3 : 0)
        put(rr() < 0.25 ? BIG : MOSS, x, z, w - k * 0.55 - rr() * 0.1, k, 0.55)
      }
    }
    // 流向圖（給水的 shader，uFlow）：每 0.125 公尺一格，存這裡的水往哪流、石頭邊的白沫。
    // 基本方向＝最近那段溪的下游方向；碰到冒出水面的石頭：往石頭裡衝的分量拿掉（水從兩側繞過、兩側流快一點），
    // 石頭邊一圈白沫（上游那面堆得比較多），下游拖一道 V 字尾跡＋正後方一團亂流。
    {
      const CELL = 0.125, M = 7
      let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9
      for (const [x, z] of st) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z) }
      x0 -= M; x1 += M; z0 -= M; z1 += M
      const nx = Math.ceil((x1 - x0) / CELL), nz = Math.ceil((z1 - z0) / CELL)
      const fx = new Float32Array(nx * nz), fz = new Float32Array(nx * nz), fo = new Float32Array(nx * nz), sa = new Uint8Array(nx * nz)
      for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
        const x = x0 + (i + 0.5) * CELL, z = z0 + (j + 0.5) * CELL
        let best = 1e9, tx = 1, tz = 0
        for (let k = 0; k < st.length - 1; k++) {
          const ax = st[k][0], az = st[k][1], dx = st[k + 1][0] - ax, dz = st[k + 1][1] - az, l2 = dx * dx + dz * dz
          const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2)), ex = x - ax - dx * t, ez = z - az - dz * t, dd = ex * ex + ez * ez
          if (dd < best) { best = dd; const l = Math.sqrt(l2); tx = dx / l; tz = dz / l }
        }
        const id = j * nx + i
        fx[id] = tx; fz[id] = tz
        sa[id] = Math.hypot(x - ALP_POND.x, z - ALP_POND.z) < ALP_POND.r + 2 ? 40 : 255   // 水池裡流得慢
      }
      // 冒出水面的石頭（scatter 的原點在模型底部中心）
      const sizeOf = {}
      for (const n of Object.keys(stones)) if (lib[n]) { const b = new THREE.Box3().setFromObject(lib[n]), v = b.getSize(V()); sizeOf[n] = v }
      const rocks = []
      for (const [n, list] of Object.entries(stones)) {
        const sz = sizeOf[n]; if (!sz) continue
        for (const it of list) {
          const s = st.sAt(it.p.x, it.p.z), w = st.water(s), top = it.p.y + sz.y * it.s.y
          if (top < w + 0.04 || it.p.y > w - 0.02 || alpineStreamDist(it.p.x, it.p.z) > 3.2 * WK) continue
          rocks.push({ x: it.p.x, z: it.p.z, r: Math.max(0.12, 0.42 * Math.max(sz.x, sz.z) * it.s.x) })
        }
      }
      for (const rk of rocks) {
        const ext = rk.r * 9, i0 = Math.max(0, Math.floor((rk.x - ext - x0) / CELL)), i1 = Math.min(nx - 1, Math.ceil((rk.x + ext - x0) / CELL))
        const j0 = Math.max(0, Math.floor((rk.z - ext - z0) / CELL)), j1 = Math.min(nz - 1, Math.ceil((rk.z + ext - z0) / CELL))
        const ci = Math.min(nx - 1, Math.max(0, Math.floor((rk.x - x0) / CELL))), cj = Math.min(nz - 1, Math.max(0, Math.floor((rk.z - z0) / CELL)))
        const tx = fx[cj * nx + ci], tz = fz[cj * nx + ci], R = rk.r
        for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
          const x = x0 + (i + 0.5) * CELL, z = z0 + (j + 0.5) * CELL, dx = x - rk.x, dz = z - rk.z, r = Math.hypot(dx, dz) || 1e-4
          const along = dx * tx + dz * tz, lat = -dx * tz + dz * tx, id = j * nx + i
          // 繞過去：往石頭中心的分量拿掉、兩側加速
          if (r < R * 2.4) {
            const k = ss(R * 2.4, R, r), nxv = dx / r, nzv = dz / r, into = fx[id] * nxv + fz[id] * nzv
            if (into < 0) { fx[id] -= nxv * into * k; fz[id] -= nzv * into * k }
            const boost = 1 + 0.45 * k * Math.min(1, Math.abs(lat) / R)
            fx[id] *= boost; fz[id] *= boost
          }
          // 白沫：石頭邊一圈（上游那面多）、V 字尾跡、正後方亂流
          let f = Math.exp(-(((r - R) / 0.13) ** 2)) * (along < 0 ? 0.95 : 0.6)
          if (r < R) f = Math.max(f, 0.6)
          if (along > 0) {
            const spread = R * 0.7 + along * 0.3, wid = 0.1 + along * 0.05
            f = Math.max(f, Math.exp(-(((Math.abs(lat) - spread) / wid) ** 2)) * Math.exp(-along / (R * 4 + 0.6)) * 0.75)
            f = Math.max(f, Math.exp(-((lat / (R * 0.75)) ** 2)) * Math.exp(-along / (R * 2 + 0.3)) * 0.65)
          }
          fo[id] = Math.max(fo[id], f)
        }
      }
      const data = new Uint8Array(nx * nz * 4)
      for (let k = 0; k < nx * nz; k++) {
        data[k * 4] = Math.round(clamp(fx[k] / 1.5 * 0.5 + 0.5, 0, 1) * 255); data[k * 4 + 1] = Math.round(clamp(fz[k] / 1.5 * 0.5 + 0.5, 0, 1) * 255)
        data[k * 4 + 2] = Math.round(clamp(fo[k], 0, 1) * 255); data[k * 4 + 3] = sa[k]
      }
      const tex = new THREE.DataTexture(data, nx, nz); tex.magFilter = tex.minFilter = THREE.LinearFilter; tex.needsUpdate = true
      wm.uniforms.uFlow.value = tex
      wm.uniforms.uFlowBox.value.set(x0, z0, 1 / (x1 - x0), 1 / (z1 - z0))
      wm.userData.flowRocks = rocks.length
    }
    for (const [n, list] of Object.entries(stones)) if (lib[n]) { scatter(g, lib[n], list, { cast: true }); rockColliders(lib[n], list) }
    // 跌水底下的水花：一團團白霧貼著水面翻動（高的跌水比較多、比較大）
    const sprayT = canvasTex(64, 64, (x, w, h) => { const gr = x.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2); gr.addColorStop(0, 'rgba(255,255,255,0.9)'); gr.addColorStop(0.5, 'rgba(240,246,248,0.35)'); gr.addColorStop(1, 'rgba(240,246,248,0)'); x.fillStyle = gr; x.fillRect(0, 0, w, h) })
    for (const d of [...st.drops, ...steep.filter((r) => st.wide || r.h > 2.5).map((r) => ({ s: r.s1 - 0.6, h: Math.min(2, r.h * 0.6), down: r.down }))]) {   // 陡的急流底下也有水花（河口那段以前沒有）；每團水花是一個 sprite＝一個 draw call，小溪 18 段陡坡只挑落差大的
      if (d.h < 0.5) continue
      const n = d.h > 1.2 ? 3 : 2
      for (let k = 0; k < n; k++) {
        const c = at(d.s + 0.4 + rr() * 0.7), o = (rr() - 0.5) * 1.2
        const sp_ = new THREE.Sprite(new THREE.SpriteMaterial({ map: sprayT, transparent: true, depthWrite: false, fog: true, opacity: 0.4 }))
        const z0 = 0.5 + Math.min(1, d.h * 0.5) + rr() * 0.4; sp_.scale.set(z0 * 1.6, z0, 1)
        sp_.position.set(c.x + c.sx * o, d.down + 0.15 + rr() * 0.25, c.z + c.sz * o)
        sp_.userData = { y0: sp_.position.y, ph: rr() * TAU, s0: z0 }; sp_.renderOrder = 6
        g.add(sp_); spray.push(sp_)
      }
      if (d.fall) {
        // 2026-11-11 檢查員：5 m 瀑布落水處幾乎沒有白水（ChatGPT：落點白沫 45～70%、消能潭 20～40%、水霧往上翻 1～2 m）→
        // ① 落點一大團往上翻的水霧（10 團，從水面往上飄 1～2.2 m 再散掉）② 兩層白沫圈（落點密、消能潭疏）③ 4 道往外擴散的漣漪
        const P = at(d.s + 1.5), cx = P.x, cz = P.z, yW = d.down
        for (let k = 0; k < 20; k++) {
          // 前 10 團：往上翻的大團水霧；後 10 團：落點貼著水面翻滾的白水（小、密、亮，側面看也是一團白——平貼水面的白沫從低角度看只剩一條線）
          const low = k >= 10
          const sp_ = new THREE.Sprite(new THREE.SpriteMaterial({ map: sprayT, transparent: true, depthWrite: false, fog: true, opacity: 0 }))
          sp_.position.set(cx + (rr() - 0.5) * (low ? 3.6 : 3.4), yW, cz + (rr() - 0.5) * (low ? 1.0 : 1.6)); sp_.renderOrder = 6
          sp_.userData = low ? { rise: true, y0: yW + 0.05, x0: sp_.position.x, z0: sp_.position.z, ph: rr(), s0: 0.6 + rr() * 0.6, h: 0.3 + rr() * 0.5, sp: 0.5 + rr() * 0.4, op: 0.85 } : { rise: true, y0: yW + 0.1, x0: sp_.position.x, z0: sp_.position.z, ph: rr(), s0: 1.2 + rr() * 1.2, h: 1.0 + rr() * 1.2, sp: 0.18 + rr() * 0.12, op: 0.42 }
          g.add(sp_); spray.push(sp_)
        }
        // 檢查員第二輪：白沫是一片硬邊的正圓盤 → 逐像素畫：中心最白；往外用兩層雜訊打碎成一塊塊、加上往外放射的一條條泡沫紋，外緣在正方形裡面就淡到 0（沒有圓的邊界）
        const foamT = canvasTex(256, 256, (x, w, h) => {
          const img = x.createImageData(w, h), r9 = mulberry32(77), G = 32, gr = Array.from({ length: (G + 1) * (G + 1) }, () => r9())
          const vn = (u, v) => { const i = Math.floor(u), j = Math.floor(v), fu = u - i, fv = v - j, a = gr[(j % G) * (G + 1) + (i % G)], b = gr[(j % G) * (G + 1) + ((i + 1) % G)], c2 = gr[((j + 1) % G) * (G + 1) + (i % G)], d2 = gr[((j + 1) % G) * (G + 1) + ((i + 1) % G)], su = fu * fu * (3 - 2 * fu), sv = fv * fv * (3 - 2 * fv); return (a + (b - a) * su) * (1 - sv) + (c2 + (d2 - c2) * su) * sv }
          for (let py = 0; py < h; py++) for (let px = 0; px < w; px++) {
            const u = px / w - 0.5, v = py / h - 0.5, rr2 = Math.hypot(u, v) * 2, ang = Math.atan2(v, u)
            const n1 = vn(px / 16 + 3, py / 16 + 7), n2 = vn(px / 5, py / 5), streak = vn((ang + Math.PI) * 6, rr2 * 3)
            const fall = Math.max(0, 1 - Math.pow(rr2 + 0.25 * (n1 - 0.5), 1.4))
            const blot = Math.min(1, Math.max(0, (n1 * 0.6 + n2 * 0.4 - 0.5 + 0.6 * fall) * 3.2)) * (0.75 + 0.25 * streak)   // 檢查員：落點白水還是偏少 → 門檻放低
            const a = Math.min(1, Math.pow(fall, 1.6) * 1.15) * blot
            const k = (py * w + px) * 4; img.data[k] = img.data[k + 1] = img.data[k + 2] = 255; img.data[k + 3] = Math.round(a * 255)
          }
          x.putImageData(img, 0, 0)
        })
        const ang = Math.atan2(P.sx, P.sz)
        for (const [rad, op, sq] of [[2.6, 1.0, 0.7], [1.5, 0.95, 0.8], [5.5, 0.45, 0.75]]) {   // 落點再加一層小而密的白水（檢查員：白水偏淡、看不出力道）
          const fm = new THREE.Mesh(new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: foamT, transparent: true, depthWrite: false, opacity: op, fog: true }))   // 正方形：邊界由貼圖自己淡掉
          fm.position.set(cx, yW + 0.03 + (rad > 3 ? 0 : 0.01), cz); fm.rotation.y = ang; fm.scale.set(rad, 1, rad * sq); fm.renderOrder = 3
          fm.userData = { foam: true, op, rad, sq }; g.add(fm); fallFx.push(fm)
        }
        for (let k = 0; k < 4; k++) {
          const rg = new THREE.Mesh(new THREE.RingGeometry(0.92, 1, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xe8f2f2, transparent: true, depthWrite: false, opacity: 0, fog: true }))
          rg.position.set(cx, yW + 0.02, cz); rg.rotation.y = ang; rg.renderOrder = 3; rg.userData = { ring: true, ph: k / 4 }; g.add(rg); fallFx.push(rg)
        }
      }
    }
      }
  }
  // 2026-11-11 河過步道的石拱橋（layout.js RIVER_BRIDGES；走的高度 riverBridgeAt）
  // 第二版（使用者：石欄像一顆顆大方塊、太假）：照山裡老石橋做——
  // 橋身：不規則的亂石砌（灰褐、灰縫深），越靠水越暗、長青苔；拱圈一圈楔形拱石；
  // 橋面：磨舊的不規則石板（縫裡有土和青苔），兩頭延伸到步道上、壓進土裡；石欄：低矮的乾砌石牆（牆心＋一顆顆疊的石頭＋長條壓頂石），兩端往外撇
  if (RIVER_BRIDGES.length) {
    const rubbleT = canvasTex(512, 512, (x, w, h) => {
      x.fillStyle = '#3d3a35'; x.fillRect(0, 0, w, h); const r = mulberry32(31)
      for (let row = 0; row < 14; row++) {
        let cx = -r() * 30
        const y0 = row * 37 + (r() - 0.5) * 6
        while (cx < w) {
          const bw = 28 + r() * 46, bh = 26 + r() * 12, l = 95 + r() * 60, wm = r() * 18
          x.fillStyle = `rgb(${l + wm},${l + wm * 0.6},${l - 6})`
          // 2026-11-10 ChatGPT QA：以前是一顆顆橢圓（近看像圓點花紋）→ 不規則多邊形的砌石（6～8 個角、邊稍直）
          { const n = 6 + Math.floor(r() * 3), ccx = cx + bw / 2, ccy = y0 + bh / 2; x.beginPath()
            for (let k = 0; k < n; k++) { const a = (k / n) * TAU + r() * 0.5, sq = 1 / Math.max(Math.abs(Math.cos(a)), Math.abs(Math.sin(a))), rr = Math.min(sq, 1.25) * (0.86 + r() * 0.12); const px = ccx + Math.cos(a) * (bw / 2 - 2) * rr, py = ccy + Math.sin(a) * (bh / 2 - 2) * rr; k ? x.lineTo(px, py) : x.moveTo(px, py) }
            x.closePath(); x.fill() }
          for (let k = 0; k < 18; k++) { const v = r() < 0.5 ? 40 : 220; x.fillStyle = `rgba(${v},${v},${v},0.14)`; x.fillRect(cx + 4 + r() * (bw - 8), y0 + 3 + r() * (bh - 6), 2, 2) }
          cx += bw + 2
        }
      }
    })
    rubbleT.wrapS = rubbleT.wrapT = THREE.RepeatWrapping; rubbleT.repeat.set(0.32, 0.32)
    const flagT = canvasTex(512, 512, (x, w, h) => {
      x.fillStyle = '#4a4538'; x.fillRect(0, 0, w, h); const r = mulberry32(57)
      // 2026-11-10 ChatGPT QA：橋面像磁磚格子 → 每排高度不同（40～86）、石板長短差很多、邊緣歪斜、顏色各自不同、錯縫
      let y0 = 0
      while (y0 < h) {
        const rh = 40 + r() * 46
        let cx = -r() * 60
        while (cx < w) {
          const bw = 45 + r() * 95, l = 100 + r() * 46, wm = (r() - 0.5) * 14
          x.fillStyle = `rgb(${l + 6 + wm},${l + 2},${l - 8 - wm})`
          const j = () => (r() - 0.5) * 7
          x.beginPath(); x.moveTo(cx + 3 + j(), y0 + 3 + j()); x.lineTo(cx + bw * (0.4 + r() * 0.2), y0 + 2 + j()); x.lineTo(cx + bw - 3 + j(), y0 + 3 + j()); x.lineTo(cx + bw - 3 + j(), y0 + rh - 3 + j()); x.lineTo(cx + bw * (0.4 + r() * 0.2), y0 + rh - 2 + j()); x.lineTo(cx + 3 + j(), y0 + rh - 3 + j()); x.closePath(); x.fill()
          for (let k = 0; k < 40; k++) { const v = r() < 0.5 ? 50 : 200; x.fillStyle = `rgba(${v},${v},${v - 10},0.1)`; x.fillRect(cx + r() * bw, y0 + r() * rh, 2 + r() * 3, 2) }
          cx += bw
        }
        y0 += rh
      }
      for (let k = 0; k < 260; k++) { x.fillStyle = `rgba(${60 + r() * 30},${80 + r() * 30},${40},0.35)`; x.fillRect(r() * w, (Math.floor(r() * 8) * 64 + 62) % h, 3 + r() * 8, 2) }   // 縫裡的青苔
    })
    flagT.wrapS = flagT.wrapT = THREE.RepeatWrapping
    const bodyM = new THREE.MeshStandardMaterial({ map: rubbleT, vertexColors: true, roughness: 0.95 })
    const deckM = new THREE.MeshStandardMaterial({ map: flagT, vertexColors: true, roughness: 0.92 })
    // 石頭本身的質感：細的花崗岩顆粒（不能用 rubbleT，石頭上會再出現一顆顆石頭的花紋）
    const grainT = canvasTex(256, 256, (x, w, h) => { x.fillStyle = '#8a8478'; x.fillRect(0, 0, w, h); const r = mulberry32(91); for (let k = 0; k < 5000; k++) { const v = 60 + r() * 150; x.fillStyle = `rgba(${v},${v - 4},${v - 12},0.35)`; x.fillRect(r() * w, r() * h, 1 + r() * 2, 1 + r() * 2) } for (let k = 0; k < 40; k++) { x.fillStyle = `rgba(${70 + r() * 30},${90 + r() * 30},50,0.18)`; x.beginPath(); x.ellipse(r() * w, r() * h, 6 + r() * 18, 4 + r() * 10, r() * 3, 0, TAU); x.fill() } })
    grainT.wrapS = grainT.wrapT = THREE.RepeatWrapping
    const stoneM = new THREE.MeshStandardMaterial({ map: grainT, color: 0x9a9488, roughness: 0.95 })
    const rb = mulberry32(515), stones = [], cores = [], vous = []
    // 2026-11-10 ChatGPT QA：壓扁的十二面體切出很多白色尖片 → 封閉的低模方石（盒子邊角往內收一點，像磨圓的砌石），表面凸出 1～4 公分
    const stoneG = new THREE.BoxGeometry(1, 1, 1, 2, 2, 2); { const pp = stoneG.attributes.position; for (let i = 0; i < pp.count; i++) { const x = pp.getX(i), y = pp.getY(i), z = pp.getZ(i), corner = (Math.abs(x) > 0.4) + (Math.abs(y) > 0.4) + (Math.abs(z) > 0.4), k = corner >= 2 ? 0.9 : 1, jt = 0.04 * Math.sin(x * 17 + y * 11 + z * 7); pp.setXYZ(i, x * k + jt, y * k, z * k + jt * 0.5) } stoneG.computeVertexNormals() }
    // 壓頂石：不規則長方石板（12 點輪廓擠出、倒角、少數角崩掉），長的方向順著橋
    const copeG = (() => { const pts = [], N = 12, rr = mulberry32(77); for (let i = 0; i < N; i++) { const a = (i / N) * TAU + 0.26, cx = Math.cos(a), cz = Math.sin(a), sq = 1 / Math.max(Math.abs(cx), Math.abs(cz)), k = 0.5 * Math.min(sq, 1.3) * (1 - 0.07 * rr()); pts.push(new THREE.Vector2(cx * k, cz * k)) }
      const eg = new THREE.ExtrudeGeometry(new THREE.Shape(pts), { depth: 1, bevelEnabled: true, bevelThickness: 0.08, bevelSize: 0.03, bevelSegments: 1, curveSegments: 1, steps: 1 }); eg.rotateX(Math.PI / 2); eg.computeBoundingBox()
      const bb = eg.boundingBox, pp = eg.attributes.position
      for (let i = 0; i < pp.count; i++) pp.setXYZ(i, (pp.getX(i) - (bb.min.x + bb.max.x) / 2) / (bb.max.x - bb.min.x), (pp.getY(i) - bb.max.y) / (bb.max.y - bb.min.y) + 0.5, (pp.getZ(i) - (bb.min.z + bb.max.z) / 2) / (bb.max.z - bb.min.z))
      eg.computeVertexNormals(); return eg })()
    const copes = []
    for (const b of RIVER_BRIDGES) {
      const st = ALP_STREAMS[1], w = st.water(st.sAt(b.x, b.z)), L = b.half + 0.3, top0 = b.y
      const span = Math.min((b.river ?? 2.3) + 0.6, b.half - 0.8), archTop = Math.min(top0 - Math.abs(b.k) * span - 0.6, w + 1.9), bot = w - 1.2 - Math.abs(b.k) * L
      const deckY = (u) => top0 + b.k * u + 0.25 * Math.cos(Math.min(1, Math.abs(u) / b.half) * Math.PI / 2) ** 2
      const sh = new THREE.Shape(), N = 28
      sh.moveTo(-L, bot); sh.lineTo(-L, deckY(-L) - 0.12)
      for (let i = 0; i <= N; i++) { const u = -L + 2 * L * i / N; sh.lineTo(u, deckY(u) - 0.12) }
      sh.lineTo(L, bot); sh.lineTo(span, bot)
      for (let i = 0; i <= N; i++) { const a2 = Math.PI * i / N; sh.lineTo(span * Math.cos(a2), w - 0.4 + (archTop - (w - 0.4)) * Math.sin(a2)) }
      sh.lineTo(-span, bot); sh.lineTo(-L, bot)
      const D = (b.hw + 0.3) * 2, eg = new THREE.ExtrudeGeometry(sh, { depth: D, bevelEnabled: false }); eg.translate(0, 0, -D / 2)
      { const pp = eg.attributes.position, cc = new Float32Array(pp.count * 3)
        for (let i = 0; i < pp.count; i++) { const y = pp.getY(i), wet = ss(w + 1.4, w - 0.2, y), n = fbm2(pp.getX(i) * 0.8, y * 0.8 + pp.getZ(i), 2)   // 靠水越暗、帶青苔
          cc[i * 3] = (0.95 - 0.45 * wet) * (0.9 + 0.2 * n); cc[i * 3 + 1] = (0.93 - 0.32 * wet) * (0.9 + 0.2 * n); cc[i * 3 + 2] = (0.88 - 0.48 * wet) * (0.9 + 0.2 * n) }
        eg.setAttribute('color', new THREE.BufferAttribute(cc, 3)) }
      const basis = new THREE.Matrix4().makeBasis(V(b.dir[0], 0, b.dir[1]), V(0, 1, 0), V(-b.dir[1], 0, b.dir[0]))
      const m = new THREE.Mesh(eg, bodyM); m.quaternion.setFromRotationMatrix(basis); m.position.set(b.x, 0, b.z); m.castShadow = true; m.receiveShadow = true; g.add(m)
      const toW = (u, y, v) => V(b.x + b.dir[0] * u - b.dir[1] * v, y, b.z + b.dir[1] * u + b.dir[0] * v)
      // 橋面石板：一條帶子，兩頭各多 1.4 公尺鋪到步道上、慢慢壓進土裡
      { const E = 1.4, NU = 40, pos = [], uv = [], col = [], idx = []
        for (let i = 0; i <= NU; i++) {
          const u = -L - E + (2 * (L + E)) * i / NU, out = Math.max(0, Math.abs(u) - L), y = deckY(Math.max(-L, Math.min(L, u))) + b.k * Math.sign(u) * out + 0.005 - 0.07 * ss(0, E, out)
          for (const v of [-b.hw - 0.05, b.hw + 0.05]) { const p = toW(u, y, v); pos.push(p.x, p.y, p.z); uv.push(u * 0.42, v * 0.42); const f = 1 - 0.35 * ss(0.2, E, out); col.push(f, f, f) }
          if (i) { const a = (i - 1) * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2) }
        }
        const dg = new THREE.BufferGeometry(); dg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); dg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); dg.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); dg.setIndex(idx); dg.computeVertexNormals()
        const dm = new THREE.Mesh(dg, deckM); dm.receiveShadow = true; g.add(dm) }
      // 拱圈：兩面各一圈楔形拱石（比牆面凸一點、顏色淡一點）
      for (const sd of [-1, 1]) for (let i = 0; i <= 13; i++) {
        const a2 = Math.PI * i / 13, rx = span + 0.22, ry = archTop - (w - 0.4) + 0.22, u = rx * Math.cos(a2), y = w - 0.4 + ry * Math.sin(a2)
        const nrm = Math.atan2(Math.sin(a2) / ry, Math.cos(a2) / rx)
        vous.push({ p: toW(u, y, sd * (b.hw + 0.32)), q: new THREE.Quaternion().setFromRotationMatrix(basis).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, nrm - Math.PI / 2))), s: V(0.32, 0.5, 0.12) })
      }
      // 石欄：低矮的乾砌石牆，兩端往外撇（接到路邊）
      for (const sd of [-1, 1]) for (let u = -L - 0.6; u <= L + 0.6; u += 0.42) {
        const flare = Math.max(0, Math.abs(u) - L) * 0.7, v = sd * (b.hw + 0.12 + flare), y = deckY(Math.max(-L, Math.min(L, u))) + b.k * Math.sign(u) * Math.max(0, Math.abs(u) - L)
        { const q0 = toW(u, 0, v); if (Math.abs(u) > L && alpineTrailDist(q0.x, q0.z) < 1.35) continue }   // 橋頭外面那段石欄：路在橋頭轉彎時不能伸到路上（2026-11-13 橋身上的石欄一律保留：營地坡道把路畫寬了，以前連橋上的石欄都被拆光）
        cores.push({ p: toW(u, y + 0.26, v), q: new THREE.Quaternion().setFromRotationMatrix(basis), s: V(0.46, 0.55, 0.32) })
        for (let c = 0; c < 3; c++) for (let k = 0; k < 2; k++) stones.push({ p: toW(u + k * 0.21 + (c % 2) * 0.1 - 0.1, y + 0.09 + c * 0.17, v + (rb() - 0.5) * 0.03), q: new THREE.Quaternion().setFromRotationMatrix(basis).multiply(new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), (rb() - 0.5) * 0.3)), s: V(0.3 + rb() * 0.16, 0.17 + rb() * 0.05, 0.36), c: 0.62 + rb() * 0.3 })
        const cp = toW(u, 0, v); addCollider(cp.x, cp.z, 0.24, y + 0.8)
      }
      // 壓頂石：沿石欄一塊接一塊（0.45～0.9 公尺長、0.42 寬、0.14 厚，接縫 1 公分），順著橋面坡度、兩端往外撇的那段也跟著
      for (const sd of [-1, 1]) {
        let u = -L - 0.6
        while (u < L + 0.6) {
          const len = 0.45 + rb() * 0.45, um = u + len / 2
          const fl = (uu) => Math.max(0, Math.abs(uu) - L) * 0.7, yAt = (uu) => deckY(Math.max(-L, Math.min(L, uu))) + b.k * Math.sign(uu) * Math.max(0, Math.abs(uu) - L)
          const q0 = toW(um, 0, sd * (b.hw + 0.12 + fl(um)))
          if (Math.abs(um) <= L || alpineTrailDist(q0.x, q0.z) >= 1.35) {
            const ya = yAt(u), yb = yAt(u + len), va = sd * (b.hw + 0.12 + fl(u)), vb = sd * (b.hw + 0.12 + fl(u + len))
            const pa = toW(u, ya, va), pb = toW(u + len, yb, vb), d = pb.clone().sub(pa)
            const yaw = Math.atan2(-d.z, d.x), pitch = Math.atan2(d.y, Math.hypot(d.x, d.z))
            copes.push({ p: pa.clone().add(pb).multiplyScalar(0.5).add(V(0, 0.62, 0)), q: new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, pitch + (rb() - 0.5) * 0.02, 'YXZ')), s: V(len - 0.012, 0.13 + rb() * 0.03, 0.42 + rb() * 0.04), c: 0.82 + rb() * 0.22 })
          }
          u += len
        }
      }
    }
    const im = (list, geo, mat) => { const m = new THREE.InstancedMesh(geo, mat, list.length), m4b = new THREE.Matrix4(), cc = new THREE.Color(); list.forEach((c, i) => { m.setMatrixAt(i, m4b.compose(c.p, c.q, c.s)); if (c.c) m.setColorAt(i, cc.setScalar(c.c)) }); m.castShadow = true; m.receiveShadow = true; m.computeBoundingSphere(); g.add(m) }
    im(cores, new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ map: rubbleT, color: 0x77726a, roughness: 0.98 }))
    im(stones, stoneG, stoneM)
    im(copes, copeG, new THREE.MeshStandardMaterial({ map: grainT, color: 0xb3ada1, roughness: 0.9 }))
    im(vous, new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ map: rubbleT, color: 0xb0aa9e, roughness: 0.95 }))
  }
  // 吊橋：照台灣山區的人行吊橋做——兩端鋼構橋塔（H 形、漆成深綠，站在混凝土基座上），
  // 兩條主鋼纜從塔頂垂成拋物線、往後拉到地上的錨碇；每 0.6 公尺一根吊索拉著橋面的橫樑；
  // 橋面：橫樑上鋪縱向木板（板間留縫、每塊顏色和高度差一點）；兩側鋼絲網到扶手鋼索；橋面中間微微下垂（跟 layout.js bridgeAt 一樣）。
  {
    const a = ALP_TRAIL[ALP_BRIDGE.a], b = ALP_TRAIL[ALP_BRIDGE.a + 2], pa = ALP_TRAIL.prof[ALP_BRIDGE.a], pb = ALP_TRAIL.prof[ALP_BRIDGE.a + 2]
    const A = V(a[0], pa, a[1]), B = V(b[0], pb, b[1]), dir = B.clone().sub(A).setY(0), len = dir.length(); dir.normalize()
    const side = V(-dir.z, 0, dir.x), yaw = Math.atan2(dir.x, dir.z), HW = BRIDGE_DIM.hw
    const deck = (t) => A.clone().lerp(B, t).add(V(0, -BRIDGE_DIM.sag * Math.sin(Math.PI * t) + 0.06, 0))   // 橋面頂（跟 layout.js bridgeAt 一樣）
    const woodT = canvasTex(256, 64, (x, w, h) => {
      x.fillStyle = '#7a5d40'; x.fillRect(0, 0, w, h)
      for (let i = 0; i < 70; i++) { const y = Math.random() * h; x.strokeStyle = `rgba(${40 + Math.random() * 30},${28 + Math.random() * 20},18,${0.25 + Math.random() * 0.35})`; x.lineWidth = 0.6 + Math.random() * 1.6; x.beginPath(); x.moveTo(0, y); x.bezierCurveTo(w * 0.3, y + (Math.random() - 0.5) * 6, w * 0.7, y + (Math.random() - 0.5) * 6, w, y + (Math.random() - 0.5) * 4); x.stroke() }
      for (let i = 0; i < 4; i++) { x.fillStyle = 'rgba(40,26,15,0.45)'; x.beginPath(); x.ellipse(Math.random() * w, Math.random() * h, 3 + Math.random() * 3, 2, 0, 0, 7); x.fill() }
    })
    woodT.wrapS = woodT.wrapT = THREE.RepeatWrapping
    const wood = new THREE.MeshStandardMaterial({ map: woodT, roughness: 0.9, vertexColors: true })
    const steel = new THREE.MeshStandardMaterial({ color: 0x2f4a3c, roughness: 0.55, metalness: 0.5 })      // 橋塔：深綠漆
    const cable = new THREE.MeshStandardMaterial({ color: 0x55595c, roughness: 0.35, metalness: 0.85 })
    const conc = new THREE.MeshStandardMaterial({ color: 0x8d8b84, roughness: 0.95 })
    const meshT = canvasTex(64, 64, (x, w, h) => {            // 菱形鋼絲網（透明底）
      x.clearRect(0, 0, w, h); x.strokeStyle = '#c9cdd0'; x.lineWidth = 2.2
      x.beginPath(); x.moveTo(0, h / 2); x.lineTo(w / 2, 0); x.lineTo(w, h / 2); x.lineTo(w / 2, h); x.closePath(); x.stroke()
    }, false)
    meshT.wrapS = meshT.wrapT = THREE.RepeatWrapping; meshT.repeat.set(len / 0.12, 1.0 / 0.12)
    const netM = new THREE.MeshStandardMaterial({ map: meshT, alphaTest: 0.4, side: THREE.DoubleSide, metalness: 0.6, roughness: 0.5, color: 0x9aa0a4 })
    const woods = [], steels = [], cables = [], concs = [], col = new THREE.Color(), rnd2 = mulberry32(42)
    const box = (list, w, h, d, p, ry = yaw, rx = 0) => list.push(new THREE.BoxGeometry(w, h, d).applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, ry, 0, 'YXZ')).setPosition(p)))
    const tube = (list, pts, r, seg = 64) => list.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), seg, r, 6))
    // 2026-11-11 橋面（木板、鋼橫樑、邊樑、踢腳板）改用 Blender 做的零件，在 walkway.js 擺
    // 橋塔與橋台（2026-11-09 使用者：支撐和水泥不夠精準、要寫實、左右對稱）
    // 每一端：一整座混凝土橋台（橋面寬＋兩邊各 0.7 公尺、順著橋 2.6 公尺，往下一直埋到最低的地面下 0.6 公尺，頂面跟橋面齊），
    // 橋面最後一段木板鋪到橋台上；兩根鋼柱（下粗上細）用鋼底板鎖在橋台頂上，塔頂有鞍座讓主鋼纜跨過去；
    // 柱間：頭頂上一道門型上樑＋一道橫樑，兩者之間 X 型斜撐。兩端用同一個函式蓋，左右完全對稱
    const TH = 6.5, ends = [[0, -1], [1, 1]]
    const topOf = {}, abut = {}
    const lowestGround = (c, hw, hl, ry) => {   // 橋台底面：腳印範圍裡最低的地面
      let m = Infinity
      for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) { const q = c.clone().addScaledVector(side, hw * i / 2).addScaledVector(dir, hl * j / 2); m = Math.min(m, alpineHeight(q.x, q.z)) }
      return m
    }
    for (const [t, out] of ends) {
      const p = deck(t).addScaledVector(dir, out * 0.35)          // 橋塔中心（橋面端外 0.35）
      const AW = HW + 0.7, AL = 1.3, ac = p.clone().addScaledVector(dir, out * 0.3)
      const topY = deck(t).y - 0.05, botY = Math.min(lowestGround(ac, AW, AL), topY - 1.2) - 0.6
      box(concs, AW * 2, topY - botY, AL * 2, V(ac.x, (topY + botY) / 2, ac.z))                                 // 橋台
      box(concs, AW * 2 + 0.3, 0.12, AL * 2 + 0.3, V(ac.x, topY - 0.55, ac.z))                                  // 頂下一圈收邊（施工縫的線腳）
      abut[t] = { topY, ac }
      // 橋台上的木板 → walkway.js 的橋頭平台
      for (const sd of [-1, 1]) {
        const q = p.clone().addScaledVector(side, sd * (HW + 0.3)); q.y = topY
        box(steels, 0.62, 0.05, 0.62, q.clone().add(V(0, 0.025, 0)))                                            // 底板
        for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) steels.push(new THREE.CylinderGeometry(0.025, 0.025, 0.08, 6).translate(0, 0.08, 0).applyMatrix4(new THREE.Matrix4().makeRotationY(yaw).setPosition(q.clone().addScaledVector(side, dx * 0.24).addScaledVector(dir, dz * 0.24))))   // 地腳螺栓
        steels.push(new THREE.BoxGeometry(1, 1, 1).applyMatrix4(new THREE.Matrix4().makeRotationY(yaw)).applyMatrix4(new THREE.Matrix4().makeScale(1, 1, 1)))
        steels.pop()
        // 柱：下 0.42 上 0.3 的方管（用 4 邊的圓柱做錐形方柱）
        const colG = new THREE.CylinderGeometry(0.3 / Math.SQRT2, 0.42 / Math.SQRT2, TH, 4).rotateY(Math.PI / 4).translate(0, TH / 2 + 0.05, 0)
        steels.push(colG.applyMatrix4(new THREE.Matrix4().makeRotationY(yaw).setPosition(q)))
        const T0 = q.clone().add(V(0, TH + 0.05, 0))
        box(steels, 0.42, 0.22, 0.6, T0.clone().add(V(0, 0.11, 0)))                                              // 鞍座
        topOf[t + ',' + sd] = T0.clone().add(V(0, 0.26, 0))
      }
      const L = p.clone().addScaledVector(side, -(HW + 0.3)), R = p.clone().addScaledVector(side, HW + 0.3)
      const yTop = abut[t].topY + TH - 0.1, yLow = abut[t].topY + TH - 2.1
      box(steels, (HW + 0.3) * 2 + 0.5, 0.32, 0.34, V(p.x, yTop, p.z))                                            // 門型上樑
      box(steels, (HW + 0.3) * 2, 0.22, 0.26, V(p.x, yLow, p.z))                                                  // 第二道橫樑（頭頂 3.8 公尺以上）
      for (const [s0, s1] of [[-1, 1], [1, -1]]) tube(steels, [L.clone().lerp(R, (s0 + 1) / 2).setY(yTop - 0.15), L.clone().lerp(R, (s1 + 1) / 2).setY(yLow + 0.12)], 0.05, 2)   // X 斜撐
    }
    // 主鋼纜：塔頂到塔頂（拋物線，中間離橋面 1.1）；再從塔頂往外拉到地上的錨碇
    for (const s of [-1, 1]) {
      const T0 = topOf['0,' + s], T1 = topOf['1,' + s]
      // 鋼纜從這一端的鞍座拉到另一端的鞍座（塔在橋面端外 0.35 公尺，所以 u 跟橋面的 t 換算一下），中間垂到離橋面 1.25
      const span = len + 0.7, uOf = (t) => (t * len + 0.35) / span
      const cab = (u) => { const q = T0.clone().lerp(T1, u); return q }
      const sagMid = T0.clone().lerp(T1, 0.5).y - (deck(0.5).y + 1.25)
      const cableAt = (u) => cab(u).add(V(0, -sagMid * 4 * u * (1 - u), 0))
      const NC = Math.round(len / 0.6), pts = []
      for (let i = 0; i <= 80; i++) pts.push(cableAt(i / 80))
      tube(cables, pts, 0.06, 160)
      // 吊索：每根橫樑兩端一根，從鋼纜正下方垂直往下到橋面邊樑（鋼纜在塔上比橋面寬 0.26，吊索微微往內斜）
      for (let i = 1; i < NC; i++) {
        const t = i / NC, top = cableAt(uOf(t)), bot = deck(t).addScaledVector(side, s * (HW + 0.04)).add(V(0, -0.06, 0))
        tube(cables, [bot, top], 0.009, 1)
        steels.push(new THREE.SphereGeometry(0.03, 6, 4).translate(top.x, top.y, top.z))                         // 鋼纜上的夾具
      }
      // 扶手鋼索（離橋面 1.0）
      const rail = []; for (let i = 0; i <= 40; i++) rail.push(deck(i / 40).addScaledVector(side, s * (HW + 0.05)).add(V(0, 1.15, 0)))
      tube(cables, rail, 0.016, 120)
      // 錨碇（後拉）：主鋼纜跨過鞍座、沿著橋的方向往後 9 公尺斜下去，進到埋在地裡的混凝土錨碇。
      // 兩邊位置完全對稱（同一端左右兩塊在同一個高度：取兩邊比較低的地面，另一邊比較高就整塊埋進土裡）
      for (const [t, out] of ends) {
        const T = topOf[t + ',' + s]
        // 2026-11-10 使用者：錨碇擋在步道上、後來又變成鋼纜穿過木棧道（步道在橋頭轉彎，橋軸線往後拉的鋼纜會切過棧道）
        // → 錨碇的位置（往後多遠 back、往外多遠 off）用搜的：錨碇本身離步道中線 3 公尺以上，而且整條鋼纜在離地 2.4 公尺以下的那段都要離步道 2.3 公尺以上；
        //    左右兩塊用同一組 back/off（取兩邊都過的），保持對稱
        const okAt = (sg, back, o) => {
          const Ts = topOf[t + ',' + sg], p = Ts.clone().addScaledVector(dir, out * back).addScaledVector(side, sg * o)
          if (alpineTrailDist(p.x, p.z) < 3.0) return false
          const gq = alpineHeight(p.x, p.z) + 0.35
          for (let u = 0.05; u <= 1; u += 0.05) {
            const x = Ts.x + (p.x - Ts.x) * u, z = Ts.z + (p.z - Ts.z) * u, y = Ts.y + (gq - Ts.y) * u
            if (y - alpineHeight(x, z) < 2.4 && alpineTrailDist(x, z) < 2.3 && bridgeDist(x, z) > HW + 0.4) return false
          }
          return true
        }
        let back = 9, off = 0.6
        search: for (const b of [9, 7.5, 10.5, 6, 12, 4.5]) for (let o = 0.6; o <= 7; o += 0.4) if (okAt(1, b, o) && okAt(-1, b, o)) { back = b; off = o; break search }
        const q = T.clone().addScaledVector(dir, out * back).addScaledVector(side, s * off)
        const qo = T.clone().addScaledVector(dir, out * back).addScaledVector(side, -s * off).addScaledVector(side, -s * 2 * (HW + 0.3))
        const gy = Math.min(alpineHeight(q.x, q.z), alpineHeight(qo.x, qo.z))
        q.y = gy + 0.35
        tube(cables, [T, q], 0.05, 2)
        const bot = Math.min(gy, alpineHeight(q.x, q.z)) - 1.0
        box(concs, 1.4, q.y + 0.25 - bot, 1.6, V(q.x, (q.y + 0.25 + bot) / 2, q.z))
        box(steels, 0.3, 0.3, 0.5, q.clone().add(V(0, 0.32, 0)))                                                   // 鋼纜錨頭
      }
      // 兩側鋼絲網：橋面到扶手
      const np = [], nu = [], ni = []
      for (let i = 0; i <= 40; i++) {
        const t = i / 40, d = deck(t).addScaledVector(side, s * (HW + 0.05))
        np.push(d.x, d.y - 0.04, d.z, d.x, d.y + 1.15, d.z); nu.push(t, 0, t, 1)
        if (i) { const k = (i - 1) * 2; ni.push(k, k + 2, k + 1, k + 1, k + 2, k + 3) }
      }
      const ng = new THREE.BufferGeometry(); ng.setAttribute('position', new THREE.Float32BufferAttribute(np, 3)); ng.setAttribute('uv', new THREE.Float32BufferAttribute(nu, 2)); ng.setIndex(ni); ng.computeVertexNormals()
      const net = new THREE.Mesh(ng, netM); g.add(net)
    }
    for (const [list, m] of [[woods, wood], [steels, steel], [cables, cable], [concs, conc]]) {
      if (!list.length) continue
      const mesh = new THREE.Mesh(mergeGeometries(list.map((q) => q.index ? q.toNonIndexed() : q).map((q) => { if (!q.attributes.color) { const c = new Float32Array(q.attributes.position.count * 3).fill(1); q.setAttribute('color', new THREE.BufferAttribute(c, 3)) } return q })), m)
      mesh.castShadow = true; mesh.receiveShadow = true; g.add(mesh)
    }
  }
  // 山頂：小木屋、三角點、灌叢（summit.js）
  buildSummit({ g, avoid, printsUrl: 'models/store-prints.jpg' })
  // 針葉樹
  {
    const needleM = needleMaterial()
    const barkM = barkMaterial('pine_bark', { normal: 1.2, color: [1.3, 1.2, 1.1] })   // 2026-11-10 掃描的松樹皮（以前是一個純色）
    const coreM = new THREE.MeshStandardMaterial({ color: 0x223a26, roughness: 1 })   // 跟針葉同色系，從上面看不會是一顆黑色金字塔
    // 雀榕的位置先挑好（低海拔、步道邊 5～12 公尺、彼此隔 16 公尺），針葉樹再避開它周圍 9 公尺：不然雀榕整棵被鐵杉林包住看不到
    for (const f of FIG_FORCED) FIGPOS.push({ x: f.x, z: f.z, H: 9.5, forced: true, ref: f })   // 吃果實的鳥停的那幾棵（birds.js dressFig）
    for (let k = 0; k < 20000 && FIGPOS.length < 18; k++) {
      const x = ALP.X0 + rnd() * (ALP.X1 - ALP.X0), z = -ALP.HZ + rnd() * ALP.HZ * 2, td = alpineTrailDist(x, z)
      if (td < 5 || td > 12 || x > 230 || !inAlpine(x, z, 2) || domeRho(x, z) > 0.93 || alpineHeight(x, z) > 18 || eastZone(x, z)) continue   // 2026-11-11 濕地、草原搬到西邊之後雀榕會長進濕地的水裡
      if (alpineStreamDist(x, z) < 3 || bridgeDist(x, z) < 10 || (Math.hypot(x - CABIN.x, z - CABIN.z) < CABIN.R + 4 || Math.hypot(x - CAMP.x, z - CAMP.z) < CAMP.R + 4) || Math.hypot(x - ALP_POND.x, z - ALP_POND.z) < ALP_POND.r + 3 || nearBird(avoid, x, z, 5, 2.5)) continue
      if (FIGPOS.some((f) => Math.hypot(f.x - x, f.z - z) < 16) || nearGiant(x, z, 8)) continue
      FIGPOS.push({ x, z, H: 7 + rnd() * 3.5 })
    }
    for (const kind of ['fir', 'hemlock']) {
      const crown = coniferGeo(kind), trunk = new THREE.CylinderGeometry(0.006, 0.026, 0.86, 14, 6).translate(0, 0.43, 0)
      { const u = trunk.attributes.uv; for (let i = 0; i < u.count; i++) u.setXY(i, u.getX(i) * 2, u.getY(i) * 8) }   // 樹皮貼圖照真實大小重複   // 樹幹到 86% 就停：不然樹梢會冒出一根光禿禿的樹幹
      // 樹冠裡面一個實心的深綠圓錐：卡片樹側看會透光，遠看只剩枝幹像竹竿；有這個芯遠看才是一棵實心的針葉樹
      const core = new THREE.ConeGeometry(kind === 'fir' ? 0.075 : 0.12, 0.74, 9, 1, true).translate(0, 0.5, 0)
      const list = []
      for (let k = 0; k < 40000 * AK && list.length < (kind === 'fir' ? 400 : 430) * AK * 1.25; k++) {   // 2026-11-10 溫室往南北加寬 26%：樹的數量跟著加
        const x = ALP.X0 + rnd() * (ALP.X1 - ALP.X0), z = -ALP.HZ + rnd() * ALP.HZ * 2
        if (YOSE.behind(x, z) || YOSE.inEastLake(x, z, 0.4) || YOSE.inOutlet(x, z, 0.5)) continue
      if (YOSE.behind(x, z) || YOSE.inEastLake(x, z, 0.4) || YOSE.inOutlet(x, z, 0.5)) continue
        const inB = BAND(x, z)
        if ((!inAlpine(x, z, 3) && !inB) || domeRho(x, z) > 0.94 || (Math.hypot(x - CABIN.x, z - CABIN.z) < CABIN.R + 4.4 || Math.hypot(x - CAMP.x, z - CAMP.z) < CAMP.R + 4.4)) continue
        if (alpineTrailDist(x, z) < 3.2 || alpineStreamDist(x, z) < 2.5 || Math.hypot(x - ALP_POND.x, z - ALP_POND.z) < ALP_POND.r + 2.5) continue
        if (YOSE.inside(x, z) || YOSE.inEastLake(x, z, 0.6) || YOSE.inOutlet(x, z, 0.5)) continue   // 2026-11-10 優勝美地區：這裡種西黃松（yosemite.js），不種冷杉、鐵杉
        if (eastZone(x, z)) continue   // 2026-11-10 東部濕地、草原：不長針葉林（east.js 種草、蘆葦）
        const hgt = GY(x, z)
        // 冷杉在高處、鐵杉在中坡；山頂附近稀疏（箭竹草原）
        let want = kind === 'fir' ? ss(7, 16, hgt) * (1 - 0.85 * ss(17, 22, hgt)) : ss(2.5, 7, hgt) * (1 - ss(14, 20, hgt))
        // 2026-11-11 使用者：山頂要有高山樹 → 山頂 40 公尺內多長冷杉（矮、被風吹得歪一點，下面）
        if (kind === 'fir') want = Math.max(want, 0.4 * (1 - ss(28, 40, Math.hypot(x - ALP_TRAIL.at(-1)[0], z - ALP_TRAIL.at(-1)[1]))))
        // 一進山區（花園交界往東）：低處也長一片鐵杉、零星冷杉，不要是空地（2026-11-07 使用者：樹多一點但不要滿；2026-11-08 再多一點、延伸遠一點）
        const entry = ss(78, 86, x) * (1 - ss(118, 134, x))
        want = Math.max(want, entry * (kind === 'fir' ? 0.28 : 0.62))
        if (inB) want = Math.max(want, kind === 'fir' ? 0.18 : 0.55)   // 入口兩側：一片鐵杉林、零星冷杉
        if (rnd() > want * (0.55 + 0.45 * fbm2(x * 0.05, z * 0.05 + kind.length, 2) + 0.3)) continue
        // 越高越矮（高山上的冷杉長不高，山頂看得出去）；不能頂到玻璃
        const H = Math.min(((kind === 'fir' ? 9 : 8) + rnd() * 7) * (1 - 0.5 * ss(12, 22, hgt)), domeY(x, z) - hgt - 1.5)
        if (H < 4) continue
        // 樹冠（底下最寬）不能伸到步道、吊橋、溪上：離中線至少樹冠半徑 + 1.3 公尺
        const crownR = H * coniferR(kind) * 1.15   // 2026-11-13 照立體樹冠實際的寬度（含橫向縮放 1.15）； 2026-11-13 立體樹冠（conifer_kit）的枝梢針葉簇伸得比卡片版遠、加上橫向縮放最多 1.15：實際半徑約 1.6 倍（使用者：山區入口被樹擋住）
        if (alpineTrailDist(x, z) < crownR + 1.3 || bridgeDist(x, z) < crownR + 1.5 || alpineStreamDist(x, z) < crownR * 0.6 + 1.2) continue
        if (nearBird(avoid, x, z, 5.5, 2.5)) continue
        if (inB && (pathClearAt(x, z) < crownR + 1.2 || OPEN(x, z))) continue   // 花園步道上也不能有樹冠
        if (FIGPOS.some((f) => Math.hypot(f.x - x, f.z - z) < 9)) continue   // 雀榕四周留空
        if (nearGiant(x, z, 4.5)) continue   // 巨木（giants.js）四周留空
        if (Math.hypot(x - ALP_TRAIL[0][0], z - ALP_TRAIL[0][1]) < 7 + crownR) continue   // 步道一進來的地方留一小塊空地，看得到山
        const dTop = Math.hypot(x - ALP_TRAIL.at(-1)[0], z - ALP_TRAIL.at(-1)[1])
        if (dTop < 9 || (dTop < 16 && (kind !== 'fir' || rnd() < 0.45))) continue   // 山頂步道終點、小木屋門口那一小塊空著；外圈零星幾棵矮冷杉
        const lean = kind === 'fir' && hgt > 17 ? 0.08 : 0   // 高處的冷杉被風吹得往一邊歪一點
        list.push({ p: V(x, hgt - 0.2, z), q: new THREE.Quaternion().setFromEuler(new THREE.Euler(lean, rnd() * TAU, lean * 0.5)), s: V(H * (0.85 + rnd() * 0.3), H, H * (0.85 + rnd() * 0.3)), H })
        addCollider(x, z, 0.35, hgt + H)
      }
      const ms = []
      for (const [geo, mat] of [[crown, needleM], [trunk, barkM], [core, coreM]]) {
        const m = new THREE.InstancedMesh(geo, mat, list.length)
        const mm = new THREE.Matrix4(), c = new THREE.Color()
        list.forEach((it, i) => { m.setMatrixAt(i, mm.compose(it.p, it.q, it.s)); if (mat === needleM) m.setColorAt(i, c.setHSL(0.27 + (rnd() - 0.5) * 0.06, 0.2 + rnd() * 0.15, 0.7 + rnd() * 0.25)) })   // 每棵深淺、黃綠藍綠都差一點
        m.castShadow = true; m.receiveShadow = true; m.computeBoundingSphere(); g.add(m); ms.push(m)
      }
      // 遠處換輕量版的立體樹冠（同樣的擺放、顏色）
      const lo = coniferLoGeo(kind); let lows = []
      if (lo) { const lm = new THREE.InstancedMesh(lo, needleM, list.length); lm.instanceMatrix.array.set(ms[0].instanceMatrix.array); if (ms[0].instanceColor) lm.instanceColor = ms[0].instanceColor.clone(); lm.castShadow = true; lm.receiveShadow = true; lm.count = 0; g.add(lm); lows = [lm, null, null] }
      lodRegister(ms, 12, lows)   // 視野外的樹不畫（山區變大，樹多了一倍）
    }
    // 山頂一圈：玉山圓柏（矮、往旁邊爬的針葉灌叢，跟鐵杉同一套卡片壓扁）、玉山杜鵑（革質葉＋粉紅花，葉片卡片）
    {
      const leafT = canvasTex(256, 256, (x, w, h) => {
        x.clearRect(0, 0, w, h); const r = mulberry32(21)
        for (let i = 0; i < 46; i++) {   // 一叢叢輪生的長橢圓葉
          const cx = 20 + r() * (w - 40), cy = 30 + r() * (h - 50), a = r() * TAU, L = 22 + r() * 16
          const l = 26 + r() * 22; x.fillStyle = `rgb(${l},${l + 40 + r() * 20},${l + 8})`
          x.save(); x.translate(cx, cy); x.rotate(a); x.beginPath(); x.ellipse(L / 2, 0, L / 2, L * 0.2, 0, 0, TAU); x.fill()
          x.strokeStyle = 'rgba(200,220,170,0.35)'; x.lineWidth = 1; x.beginPath(); x.moveTo(0, 0); x.lineTo(L, 0); x.stroke(); x.restore()
        }
        for (let i = 0; i < 9; i++) {   // 花團：五六朵粉紅的鐘形花聚在枝頂
          const cx = 24 + r() * (w - 48), cy = 20 + r() * (h * 0.6)
          for (let k = 0; k < 6; k++) { const a = k / 6 * TAU + r(), d = 6 + r() * 5; x.fillStyle = `rgb(${236 + r() * 19},${160 + r() * 40},${190 + r() * 30})`; x.beginPath(); x.arc(cx + Math.cos(a) * d, cy + Math.sin(a) * d, 5 + r() * 2, 0, TAU); x.fill(); x.fillStyle = 'rgba(190,80,120,0.6)'; x.beginPath(); x.arc(cx + Math.cos(a) * d, cy + Math.sin(a) * d, 1.6, 0, TAU); x.fill() }
        }
      })
      const leafM = new THREE.MeshStandardMaterial({ map: leafT, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.6, vertexColors: true })
      const rhodo = (() => {   // 半球形的一叢：好幾片交叉的卡片
        const cs = [], r = mulberry32(8)
        for (let i = 0; i < 16; i++) {
          const a = r() * TAU, el = r() * 1.1, c = new THREE.PlaneGeometry(0.9, 0.7).rotateX(-el).rotateY(a).translate(Math.cos(a) * 0.25, 0.35 + Math.sin(el) * 0.2, Math.sin(a) * 0.25)
          cs.push(c.toNonIndexed())
        }
        const gg = mergeGeometries(cs), pp = gg.attributes.position, cc = new Float32Array(pp.count * 3)
        for (let i = 0; i < pp.count; i++) { const k = 0.6 + 0.4 * Math.min(1, pp.getY(i) / 0.7); cc[i * 3] = cc[i * 3 + 1] = cc[i * 3 + 2] = k }
        gg.setAttribute('color', new THREE.BufferAttribute(cc, 3)); return gg
      })()
      const jun = coniferGeo('hemlock')
      const E = ALP_TRAIL.at(-1), EY = ALP_TRAIL.prof.at(-1), J = [], RH = []
      for (let k = 0; k < 1500 * AK && (J.length < 60 * AK || RH.length < 40 * AK); k++) {
        const a = rnd() * TAU, d = 6 + Math.pow(rnd(), 0.7) * 36, x = E[0] + Math.cos(a) * d, z = E[1] + Math.sin(a) * d
        if (!inAlpine(x, z, 2) || domeRho(x, z) > 0.93 || alpineTrailDist(x, z) < 1.8 || (Math.hypot(x - CABIN.x, z - CABIN.z) < CABIN.R + 1.9 || Math.hypot(x - CAMP.x, z - CAMP.z) < CAMP.R + 1.9) || nearBird(avoid, x, z, 3.5, 1.5)) continue
        const y = alpineHeight(x, z); if (y < EY - 10) continue
        const sz = 0.7 + rnd() * 0.9, q = new THREE.Quaternion().setFromEuler(new THREE.Euler((rnd() - 0.5) * 0.3, rnd() * TAU, (rnd() - 0.5) * 0.3))
        if (rnd() < 0.6 ? J.length < 60 * AK : RH.length >= 40 * AK) J.push({ p: V(x, y - 0.1, z), q, s: V(3.2 * sz, 1.1 * sz, 3.2 * sz) })
        else RH.push({ p: V(x, y - 0.05, z), q, s: V(1, 1, 1).multiplyScalar(1.1 + rnd() * 0.9) })
      }
      for (const [geo, mat, list] of [[jun, needleM, J], [rhodo, leafM, RH]]) {
        const m = new THREE.InstancedMesh(geo, mat, list.length), mm = new THREE.Matrix4(), c = new THREE.Color()
        list.forEach((it, i) => { m.setMatrixAt(i, mm.compose(it.p, it.q, it.s)); m.setColorAt(i, mat === needleM ? c.setHSL(0.3 + (rnd() - 0.5) * 0.05, 0.25, 0.92 + rnd() * 0.15) : c.setHSL(0.3, 0.1, 0.9 + rnd() * 0.1)) })
        m.castShadow = true; m.receiveShadow = true; m.computeBoundingSphere(); g.add(m)
      }
    }
  }
  // 果樹和野花（2026-11-09 使用者：山上加果樹、花；照片是雀榕結滿粉紅果、鵝掌藤橘黃果串，五色鳥、紅嘴黑鵯來吃）
  // 雀榕：低海拔步道邊，粗幹、往外伸的主枝、寬圓樹冠（卵形亮綠葉卡片）；榕果直接長在枝幹上（一串串粉紅小球）
  // 鵝掌藤：灌叢，掌狀複葉＋一團團橘黃果；野花：步道兩側一叢叢，低處白色台灣百合、中段黃色玉山金絲桃、高處紫色龍膽
  {
    const leafCard = (seed, draw) => canvasTex(256, 256, (x, w, h) => { x.clearRect(0, 0, w, h); draw(x, w, h, mulberry32(seed)) })
    // 葉片卡片兩面都用同一個（朝上、朝外的）法線：預設雙面材質會把背面的法線翻過去，從樹下往上看背面朝天，整片樹冠是黑的
    const leafMat = (tex, extra = {}) => {
      const m = new THREE.MeshStandardMaterial({ map: tex, alphaTest: 0.42, side: THREE.DoubleSide, roughness: 0.55, vertexColors: true, ...extra })
      m.onBeforeCompile = (sh) => { sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\n#ifdef DOUBLE_SIDED\n normal *= faceDirection;\n#endif') }
      m.customProgramCacheKey = () => 'leafNoFlip'
      return m
    }
    // 2026-11-09 寫實化：葉子＝葉柄＋橢圓葉身（尾端漸尖）、正面亮暗漸層（光從上面來）、主脈＋側脈、葉緣一圈深色、反光的亮點
    // c：{h, s, l} 葉色（HSL）；wr：葉寬/葉長
    const leaf = (x, cx, cy, a, L, c, r, wr = 0.38) => {
      x.save(); x.translate(cx, cy); x.rotate(a)
      const W = L * wr, pt = L * 0.12
      x.strokeStyle = `hsl(${c.h - 10},${c.s - 10}%,${c.l - 4}%)`; x.lineWidth = Math.max(1, L * 0.035); x.beginPath(); x.moveTo(-pt, 0); x.lineTo(0, 0); x.stroke()   // 葉柄
      const path = () => { x.beginPath(); x.moveTo(0, 0); x.bezierCurveTo(L * 0.18, -W * 0.95, L * 0.62, -W * 0.85, L, 0); x.bezierCurveTo(L * 0.62, W * 0.85, L * 0.18, W * 0.95, 0, 0) }
      const gr = x.createLinearGradient(0, -W * 0.6, 0, W * 0.6)
      gr.addColorStop(0, `hsl(${c.h},${c.s}%,${c.l + 9}%)`); gr.addColorStop(0.5, `hsl(${c.h + 2},${c.s + 4}%,${c.l + 2}%)`); gr.addColorStop(1, `hsl(${c.h + 4},${c.s}%,${c.l - 7}%)`)
      path(); x.fillStyle = gr; x.fill()
      x.strokeStyle = `hsla(${c.h},${c.s}%,${c.l - 14}%,0.7)`; x.lineWidth = 1; x.stroke()                                         // 葉緣
      x.strokeStyle = `hsla(${c.h - 25},${c.s - 15}%,${c.l + 30}%,0.55)`; x.lineWidth = Math.max(0.8, L * 0.025)                  // 主脈（淡黃綠）
      x.beginPath(); x.moveTo(0, 0); x.quadraticCurveTo(L * 0.5, W * 0.06, L * 0.97, 0); x.stroke()
      x.lineWidth = Math.max(0.5, L * 0.012); x.strokeStyle = `hsla(${c.h - 20},${c.s - 15}%,${c.l + 22}%,0.35)`
      for (let k = 1; k <= 6; k++) { const t = k / 7.5; for (const sg of [-1, 1]) { x.beginPath(); x.moveTo(L * t, 0); x.quadraticCurveTo(L * (t + 0.06), sg * W * 0.35, L * (t + 0.12), sg * W * 0.62 * Math.sin(Math.PI * Math.min(1, t + 0.12))); x.stroke() } }   // 側脈
      const hl = x.createRadialGradient(L * 0.38, -W * 0.25, 0, L * 0.38, -W * 0.25, L * 0.32)                                    // 葉面的反光
      hl.addColorStop(0, 'rgba(255,255,240,0.22)'); hl.addColorStop(1, 'rgba(255,255,240,0)'); path(); x.fillStyle = hl; x.fill()
      x.restore()
    }
    // 雀榕的葉：橢圓、尾端尖，深綠有光澤；新芽是黃綠色、偶爾一片快掉的黃葉
    const figLeafT = leafCard(31, (x, w, h, r) => {
      for (let i = 0; i < 46; i++) {
        const cx = 26 + r() * (w - 52), cy = 26 + r() * (h - 52), u = r()
        const c = u < 0.07 ? { h: 82 + r() * 10, s: 50, l: 36 + r() * 6 } : u < 0.085 ? { h: 50 + r() * 8, s: 55, l: 44 } : { h: 104 + r() * 14, s: 36 + r() * 16, l: 19 + r() * 11 }
        leaf(x, cx, cy, r() * TAU, 26 + r() * 18, c, r, 0.36 + r() * 0.06)
      }
    })
    // 雀榕的樹皮：灰白、光滑，一塊塊淡綠/白色的地衣，一條條橫的皮孔
    const barkT = canvasTex(256, 256, (x, w, h) => {
      const r = mulberry32(77)
      x.fillStyle = '#a49e92'; x.fillRect(0, 0, w, h)
      for (let i = 0; i < 1400; i++) { const l = 120 + r() * 70; x.fillStyle = `rgba(${l},${l - 4},${l - 14},0.18)`; x.fillRect(r() * w, r() * h, 2 + r() * 10, 2 + r() * 14) }   // 斑駁
      for (let i = 0; i < 26; i++) {   // 地衣
        const cx = r() * w, cy = r() * h, rr = 6 + r() * 18, gr = x.createRadialGradient(cx, cy, 0, cx, cy, rr)
        const col = r() < 0.5 ? '210,214,196' : '176,190,160'; gr.addColorStop(0, `rgba(${col},0.55)`); gr.addColorStop(1, `rgba(${col},0)`); x.fillStyle = gr; x.fillRect(cx - rr, cy - rr, rr * 2, rr * 2)
      }
      for (let i = 0; i < 160; i++) { x.fillStyle = `rgba(70,62,52,${0.25 + r() * 0.3})`; x.fillRect(r() * w, r() * h, 3 + r() * 6, 1 + r() * 1.2) }                   // 皮孔（橫的短線）
      for (let i = 0; i < 9; i++) { const xx = r() * w; x.strokeStyle = 'rgba(80,72,62,0.22)'; x.lineWidth = 1 + r() * 2; x.beginPath(); x.moveTo(xx, 0); for (let y = 0; y <= h; y += 16) x.lineTo(xx + Math.sin(y * 0.05 + i) * 5, y); x.stroke() }   // 縱向的淺紋
    })
    barkT.wrapS = barkT.wrapT = THREE.RepeatWrapping; barkT.repeat.set(1, 3)
    // 鵝掌藤：掌狀複葉（7～9 片倒卵形小葉從葉柄頂端放射）、有光澤的深綠；果序是一把把放射的細梗，果子從橘黃熟成紅、紫黑
    const scheffT = leafCard(37, (x, w, h, r) => {
      for (let i = 0; i < 14; i++) {
        const cx = 34 + r() * (w - 68), cy = 34 + r() * (h - 68), n = 7 + Math.floor(r() * 3), a0 = r() * TAU, L = 22 + r() * 9
        const c = { h: 105 + r() * 12, s: 45 + r() * 15, l: 20 + r() * 10 }
        x.strokeStyle = `hsl(${c.h - 20},35%,30%)`; x.lineWidth = 1.6; x.beginPath(); x.moveTo(cx, cy); x.lineTo(cx + Math.cos(a0 + 2) * 30, cy + Math.sin(a0 + 2) * 30); x.stroke()   // 長葉柄
        for (let k = 0; k < n; k++) leaf(x, cx, cy, a0 + (k / n) * TAU * 0.92, L * (0.8 + 0.25 * Math.sin(k / (n - 1) * Math.PI)), c, r, 0.4)
      }
      for (let i = 0; i < 5; i++) {
        const cx = 34 + r() * (w - 68), cy = 22 + r() * (h * 0.55), ripe = r()
        for (let k = 0; k < 9; k++) {   // 一把果序：九根放射的梗，每根上面一小團果
          const a = -Math.PI / 2 + (r() - 0.5) * 2.6, d = 14 + r() * 14, ex = cx + Math.cos(a) * d, ey = cy + Math.sin(a) * d
          x.strokeStyle = 'rgba(140,120,60,0.9)'; x.lineWidth = 1.1; x.beginPath(); x.moveTo(cx, cy); x.lineTo(ex, ey); x.stroke()
          for (let m = 0; m < 6; m++) {
            const px = ex + (r() - 0.5) * 9, py = ey + (r() - 0.5) * 9, t = Math.min(1, ripe + (r() - 0.5) * 0.5), rr = 2.2 + r() * 1.3
            const col = t < 0.4 ? [244, 170 + r() * 40, 40] : t < 0.75 ? [222, 70 + r() * 30, 40] : [80, 30, 50]
            const gr = x.createRadialGradient(px - rr * 0.35, py - rr * 0.35, 0.3, px, py, rr)
            gr.addColorStop(0, `rgb(${Math.min(255, col[0] + 40)},${Math.min(255, col[1] + 50)},${col[2] + 40})`); gr.addColorStop(1, `rgb(${col[0] * 0.7},${col[1] * 0.6},${col[2] * 0.7})`)
            x.fillStyle = gr; x.beginPath(); x.arc(px, py, rr, 0, TAU); x.fill()
          }
        }
      }
    })
    // 野花：細長的莖、互生的線形葉，花用漸層畫出立體感
    const flowerT = (kind) => leafCard({ lily: 41, hyper: 43, gent: 47 }[kind], (x, w, h, r) => {
      const N = kind === 'lily' ? 7 : 11
      for (let i = 0; i < N; i++) {
        const bx = 18 + r() * (w - 36), top = h * (kind === 'lily' ? 0.12 + r() * 0.25 : 0.3 + r() * 0.35), tx = bx + (r() - 0.5) * 18
        x.strokeStyle = `hsl(${95 + r() * 15},40%,${28 + r() * 8}%)`; x.lineWidth = kind === 'lily' ? 3 : 2; x.beginPath(); x.moveTo(bx, h); x.quadraticCurveTo(bx + (r() - 0.5) * 24, (h + top) / 2, tx, top); x.stroke()
        const nl = kind === 'lily' ? 9 : 5
        for (let k = 0; k < nl; k++) {   // 葉：百合是很多片細長的線形葉，其他是小的對生葉
          const t = 0.12 + k / nl * 0.7, yy = h - (h - top) * t, xx = bx + (tx - bx) * t, sg = k % 2 ? 1 : -1
          leaf(x, xx, yy, -Math.PI / 2 + sg * (0.7 + r() * 0.4), kind === 'lily' ? 26 + r() * 10 : 12 + r() * 6, { h: 100 + r() * 10, s: 42, l: 30 + r() * 8 }, r, kind === 'lily' ? 0.12 : 0.34)
        }
        if (kind === 'lily') {   // 台灣百合：白色長喇叭花，側著或微微下垂，花瓣外側一條紫紅色帶，花口外翻
          x.save(); x.translate(tx, top); x.rotate(-0.2 + (r() - 0.5) * 1.2 + (r() < 0.5 ? Math.PI * 0.5 : -Math.PI * 0.5) * 0.5)
          const Lf = 34 + r() * 8
          for (const sg of [-1, 1, 0]) {
            const gr = x.createLinearGradient(0, 0, Lf, 0); gr.addColorStop(0, '#d9e6c8'); gr.addColorStop(0.35, '#fbfaf5'); gr.addColorStop(1, '#ffffff')
            x.fillStyle = gr; x.beginPath(); x.moveTo(0, 0); x.quadraticCurveTo(Lf * 0.6, sg * 5, Lf, sg * 12 + (sg ? 0 : -1)); x.quadraticCurveTo(Lf * 0.92, sg * 4, Lf * 0.98, sg * -2); x.quadraticCurveTo(Lf * 0.6, sg * 1.5, 0, 0); x.fill()
            x.strokeStyle = 'rgba(160,60,100,0.55)'; x.lineWidth = 1.6; x.beginPath(); x.moveTo(2, sg * 0.6); x.quadraticCurveTo(Lf * 0.5, sg * 2.6, Lf * 0.8, sg * 6); x.stroke()   // 紫紅色帶
            x.strokeStyle = 'rgba(190,190,170,0.6)'; x.lineWidth = 0.7; x.beginPath(); x.moveTo(0, 0); x.quadraticCurveTo(Lf * 0.6, sg * 5, Lf, sg * 12); x.stroke()
          }
          x.strokeStyle = '#e0b23a'; x.lineWidth = 1; for (let m = 0; m < 4; m++) { x.beginPath(); x.moveTo(Lf * 0.7, 0); x.lineTo(Lf * 1.08, (m - 1.5) * 3); x.stroke() }   // 花藥
          x.restore()
        } else if (kind === 'hyper') {   // 玉山金絲桃：五片金黃花瓣（微微歪斜、像風車），中間一大把細長的雄蕊
          const R0 = 7 + r() * 3, a0 = r() * TAU
          for (let k = 0; k < 5; k++) {
            const a = a0 + k / 5 * TAU, px = tx + Math.cos(a) * R0 * 0.75, py = top + Math.sin(a) * R0 * 0.6
            const gr = x.createRadialGradient(tx, top, 0, px, py, R0 * 1.1); gr.addColorStop(0, '#f2a80c'); gr.addColorStop(0.6, '#fbd23a'); gr.addColorStop(1, '#ffe57a')
            x.fillStyle = gr; x.beginPath(); x.ellipse(px, py, R0 * 0.85, R0 * 0.55, a + 0.3, 0, TAU); x.fill()
          }
          x.strokeStyle = 'rgba(230,170,20,0.95)'; x.lineWidth = 0.7
          for (let m = 0; m < 22; m++) { const a = r() * TAU, d = R0 * (0.4 + r() * 0.5); x.beginPath(); x.moveTo(tx, top); x.lineTo(tx + Math.cos(a) * d, top + Math.sin(a) * d * 0.8); x.stroke(); x.fillStyle = '#c87a0a'; x.fillRect(tx + Math.cos(a) * d - 0.8, top + Math.sin(a) * d * 0.8 - 0.8, 1.6, 1.6) }
          x.fillStyle = '#9a7a20'; x.beginPath(); x.arc(tx, top, 1.6, 0, TAU); x.fill()
        } else {   // 龍膽：直立的筒狀小鐘，藍紫色、花口五裂往外張，筒身有深色條紋，萼片綠
          const Hc = 13 + r() * 5, Wc = 5 + r() * 2
          const gr = x.createLinearGradient(tx - Wc, 0, tx + Wc, 0); gr.addColorStop(0, '#3b2f8a'); gr.addColorStop(0.45, '#6d5fd6'); gr.addColorStop(1, '#2f2672')
          x.fillStyle = gr; x.beginPath(); x.moveTo(tx - Wc * 0.45, top + Hc); x.quadraticCurveTo(tx - Wc * 0.8, top + Hc * 0.4, tx - Wc * 1.2, top); x.lineTo(tx + Wc * 1.2, top); x.quadraticCurveTo(tx + Wc * 0.8, top + Hc * 0.4, tx + Wc * 0.45, top + Hc); x.closePath(); x.fill()
          for (let k = 0; k < 5; k++) { const px = tx + (k - 2) * Wc * 0.55; x.fillStyle = k % 2 ? '#7f72e6' : '#6658d0'; x.beginPath(); x.ellipse(px, top - 1, Wc * 0.32, 3, (k - 2) * 0.35, 0, TAU); x.fill() }   // 花口的五個裂片
          x.strokeStyle = 'rgba(30,20,70,0.55)'; x.lineWidth = 0.8; for (let k = -1; k <= 1; k++) { x.beginPath(); x.moveTo(tx + k * Wc * 0.4, top + 2); x.lineTo(tx + k * Wc * 0.2, top + Hc - 1); x.stroke() }
          x.fillStyle = '#4f7a3a'; x.beginPath(); x.moveTo(tx - Wc * 0.5, top + Hc); x.lineTo(tx, top + Hc - 5); x.lineTo(tx + Wc * 0.5, top + Hc); x.lineTo(tx, top + Hc + 2); x.fill()   // 萼片
        }
      }
    })
    const crossCards = (n, w, hgt, rr, seed, spread = 0.25) => {   // 一叢交叉的直立卡片（花、灌叢）
      const cs = [], r = mulberry32(seed)
      for (let i = 0; i < n; i++) { const a = r() * TAU, c = new THREE.PlaneGeometry(w, hgt).translate(0, hgt / 2, 0).rotateX((r() - 0.5) * 0.4).rotateY(a).translate(Math.cos(a) * spread * r(), 0, Math.sin(a) * spread * r()); cs.push(c.toNonIndexed()) }
      const gg = mergeGeometries(cs), pp = gg.attributes.position, cc = new Float32Array(pp.count * 3)
      for (let i = 0; i < pp.count; i++) { const k = 0.65 + 0.35 * Math.min(1, pp.getY(i) / hgt); cc[i * 3] = cc[i * 3 + 1] = cc[i * 3 + 2] = k }
      gg.setAttribute('color', new THREE.BufferAttribute(cc, 3)); return gg
    }
    const vcol = (geo, k = 1) => { const c = new Float32Array(geo.attributes.position.count * 3).fill(k); geo.setAttribute('color', new THREE.BufferAttribute(c, 3)); return geo }
    // 雀榕的樣板（高 1、寬約 1.1；擺放時乘樹高）：樹幹＋5 根主枝、樹冠卡片、實心的深綠芯、榕果
    const r8 = mulberry32(53), branches = [], fruits = [], crown = [], limbs = [], roots = []
    // 榕果（2026-11-09 寫實化）：小小一顆（直徑約 1 公分多）、一大串擠在枝上；顏色從白綠、粉紅熟到紫紅、深紫，表面有淡色小斑點（用頂點色）
    const FIGC = [[0.82, 0.74, 0.66], [0.92, 0.55, 0.62], [0.86, 0.36, 0.5], [0.6, 0.16, 0.34], [0.36, 0.08, 0.2]]
    const figBall = (rad, x0, y0, z0) => {
      const q = new THREE.IcosahedronGeometry(rad * 0.62, 0).scale(1, 1.08, 1).toNonIndexed(), base = FIGC[[0, 1, 1, 2, 2, 2, 3, 3, 4][Math.floor(r8() * 9)]], cc = new Float32Array(q.attributes.position.count * 3)
      for (let i = 0; i < cc.length / 3; i++) { const sp = r8() < 0.18 ? 0.25 : 0, k = 0.9 + r8() * 0.15; cc[i * 3] = Math.min(1, base[0] * k + sp); cc[i * 3 + 1] = Math.min(1, base[1] * k + sp); cc[i * 3 + 2] = Math.min(1, base[2] * k + sp) }
      q.setAttribute('color', new THREE.BufferAttribute(cc, 3)); return q.translate(x0, y0, z0)
    }
    const limb = (a0, dir, len, r0, r1) => new THREE.CylinderGeometry(r1, r0, len, 8).translate(0, len / 2, 0).applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), dir.clone().normalize())).translate(a0.x, a0.y, a0.z)
    // 樹幹：三股扭在一起往上（雀榕是絞殺榕，氣根包著樹幹長成一束一束）
    const trunkG = []
    for (let i = 0; i < 3; i++) {
      const a = i / 3 * TAU, pts = []
      for (let k = 0; k <= 6; k++) { const t = k / 6, tw = a + t * 1.6; pts.push(V(Math.cos(tw) * (0.032 - t * 0.012), t * 0.5, Math.sin(tw) * (0.032 - t * 0.012))) }
      trunkG.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 8, 0.03, 7))
      const ft = pts[0].clone().multiplyScalar(2.2); trunkG.push(limb(V(0, 0.06, 0).add(pts[0]), ft.clone().setY(-0.06), 0.1, 0.028, 0.014))   // 底部往外撐的根
    }
    // 主枝：從 0.42 往外、往上分出 6 根，再各分兩根細枝；樹冠的葉團長在細枝末端
    const tips = []
    for (let i = 0; i < 6; i++) {
      const a = i / 6 * TAU + r8() * 0.5, el = 0.45 + r8() * 0.4, len = 0.34 + r8() * 0.12
      const a0 = V(0, 0.4 + r8() * 0.08, 0), dir = V(Math.cos(a) * Math.cos(el), Math.sin(el), Math.sin(a) * Math.cos(el)), b = a0.clone().addScaledVector(dir, len)
      branches.push(limb(a0, dir, len, 0.03, 0.016)); limbs.push({ a0, dir, len })
      for (let k = 0; k < 120; k++) {   // 榕果：沿著主枝一串串（雀榕的果長在老枝上）
        const t = 0.1 + r8() * 0.9, p = a0.clone().addScaledVector(dir, len * t), side = V(r8() - 0.5, r8() - 0.5, r8() - 0.5).normalize().multiplyScalar(0.022 + 0.008 * (1 - t))
        fruits.push(figBall(0.0055 + r8() * 0.0025, p.x + side.x, p.y + side.y, p.z + side.z))
      }
      for (const sgn of [-1, 1]) {
        const d2 = dir.clone().applyAxisAngle(V(0, 1, 0), sgn * (0.35 + r8() * 0.3)).setY(dir.y + 0.15).normalize(), l2 = 0.2 + r8() * 0.1
        branches.push(limb(b, d2, l2, 0.016, 0.008)); tips.push(b.clone().addScaledVector(d2, l2))
        for (let k = 0; k < 34; k++) { const t = r8(), p = b.clone().addScaledVector(d2, l2 * t); fruits.push(figBall(0.005 + r8() * 0.002, p.x + (r8() - 0.5) * 0.03, p.y + (r8() - 0.5) * 0.03, p.z + (r8() - 0.5) * 0.03)) }
      }
    }
    for (let k = 0; k < 60; k++) { const y = 0.1 + r8() * 0.32, a = r8() * TAU; fruits.push(figBall(0.006, Math.cos(a) * 0.062, y, Math.sin(a) * 0.062)) }   // 樹幹上也有
    // 氣根（2026-11-09 第二版：第一版太粗、筆直、一樣粗、整排插到地上，像竹竿）：
    // 從主枝下面一束一束垂下來，細、越往下越細、微微彎；大多掛在半空，少數幾條垂到地面；顏色偏紅褐（新的氣根）
    const taper = (pts, r0, r1, seg = 12) => {
      const curve = new THREE.CatmullRomCurve3(pts), tg = new THREE.TubeGeometry(curve, seg, r0, 4), p = tg.attributes.position, c = new THREE.Vector3(), v = new THREE.Vector3()
      for (let k = 0; k < p.count; k++) { const i = Math.floor(k / 5), t = i / seg; curve.getPointAt(Math.min(1, t), c); v.fromBufferAttribute(p, k).sub(c).multiplyScalar(1 + (r1 / r0 - 1) * t).add(c); p.setXYZ(k, v.x, v.y, v.z) }
      tg.computeVertexNormals(); return tg
    }
    for (const L of limbs) {
      const nb = 1 + Math.floor(r8() * 2)
      for (let b = 0; b < nb; b++) {
        const anc = L.a0.clone().addScaledVector(L.dir, L.len * (0.35 + r8() * 0.5)), n = 3 + Math.floor(r8() * 4)
        for (let k = 0; k < n; k++) {
          const ground = r8() < 0.12, len = ground ? anc.y : anc.y * (0.2 + r8() * 0.45)
          const ox = (r8() - 0.5) * 0.03, oz = (r8() - 0.5) * 0.03, sw = (r8() - 0.5) * 0.04, ph = r8() * 6, pts = []
          for (let j = 0; j <= 6; j++) { const t = j / 6; pts.push(V(anc.x + ox + Math.sin(t * 3 + ph) * 0.006 + sw * t * t, anc.y - 0.012 - len * t, anc.z + oz + Math.cos(t * 2.4 + ph) * 0.006 + sw * 0.5 * t * t)) }
          roots.push(taper(pts, 0.0017 + r8() * 0.0008, ground ? 0.0012 : 0.00035))
        }
      }
    }
    for (let i = 0; i < 6; i++) {
      const a = r8() * TAU, pts = []
      for (let k = 0; k <= 8; k++) { const t = k / 8, tw = a + t * (1.2 + r8() * 0.3); pts.push(V(Math.cos(tw) * (0.05 - t * 0.016), t * 0.44, Math.sin(tw) * (0.05 - t * 0.016))) }
      trunkG.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 10, 0.008 + r8() * 0.005, 6))
    }
    // 樹冠：每個枝梢一團葉（十幾片卡片圍成半球），團跟團之間有空隙，看得到枝和果
    for (const tp of [...tips, V(0, 0.98, 0), V(0.15, 0.92, 0.1), V(-0.12, 0.94, -0.12)]) {
      for (let k = 0; k < 17; k++) {
        const az = r8() * TAU, el = r8() * 1.2, rr = 0.1 + r8() * 0.07
        const c = tp.clone().add(V(Math.cos(az) * Math.cos(el) * rr, Math.sin(el) * rr * 0.8 - 0.02, Math.sin(az) * Math.cos(el) * rr))
        const cs = 0.75 + r8() * 0.5; crown.push(new THREE.PlaneGeometry(0.24 * cs, 0.2 * cs).rotateX(-0.6 - r8() * 0.8).rotateY(az + Math.PI / 2).translate(c.x, c.y, c.z).toNonIndexed())
      }
    }
    const colG = (q, r, gg, bb) => { q = q.index ? q.toNonIndexed() : q; const c = new Float32Array(q.attributes.position.count * 3); for (let i = 0; i < c.length; i += 3) { c[i] = r; c[i + 1] = gg; c[i + 2] = bb } q.setAttribute('color', new THREE.BufferAttribute(c, 3)); return q }
    const figTrunk = mergeGeometries([...trunkG.map((q) => colG(q, 1, 1, 1)), ...branches.map((q) => colG(q, 1, 1, 1)), ...roots.map((q) => colG(q, 0.78, 0.55, 0.42))])   // 氣根偏紅褐
    const figFruit = mergeGeometries(fruits)
    const figCrown = (() => { const gg = mergeGeometries(crown), pp = gg.attributes.position, nn = gg.attributes.normal, cc = new Float32Array(pp.count * 3)
      for (let i = 0; i < pp.count; i++) { const x = pp.getX(i), y = pp.getY(i), z = pp.getZ(i), l = Math.hypot(x, z) || 1; nn.setXYZ(i, x / l * 0.5, 0.85, z / l * 0.5); const k = (0.75 + 0.25 * Math.min(1, l / 0.5)) * (0.85 + 0.25 * Math.min(1, Math.max(0, y - 0.6) / 0.4)); cc[i * 3] = cc[i * 3 + 1] = cc[i * 3 + 2] = k }
      gg.setAttribute('color', new THREE.BufferAttribute(cc, 3)); return gg })()
    const figCore = vcol(new THREE.SphereGeometry(0.2, 10, 6).scale(1.2, 0.5, 1.2).translate(0, 0.8, 0), 1)
    const bark = new THREE.MeshStandardMaterial({ map: barkT, color: 0xe8e4dc, roughness: 0.85, vertexColors: true })   // 雀榕的樹皮灰白（地衣、皮孔）
    const figM = leafMat(figLeafT, { roughness: 0.4, color: 0xdfe8d8 }), coreM = new THREE.MeshStandardMaterial({ color: 0x3d6234, roughness: 1, vertexColors: true })
    const fruitM = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.38, vertexColors: true })
    const FIG = [], SCH = [], FLW = { lily: [], hyper: [], gent: [] }
    const okHere = (x, z, trail, r) => inAlpine(x, z, 2) && !eastZone(x, z) && domeRho(x, z) < 0.93 && trail >= r && alpineStreamDist(x, z) > 2.5 && bridgeDist(x, z) > 3 && Math.hypot(x - CABIN.x, z - CABIN.z) > CABIN.R + 3 && Math.hypot(x - CAMP.x, z - CAMP.z) > CAMP.R + 4 && Math.hypot(x - ALP_POND.x, z - ALP_POND.z) > ALP_POND.r + 2 && !nearBird(avoid, x, z, 4, 2)
    for (const f of FIGPOS) {
      const y = alpineHeight(f.x, f.z), H = f.H
      FIG.push({ p: V(f.x, y - 0.15, f.z), q: new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), rnd() * TAU), s: V(H * (1 + rnd() * 0.2), H, H * (1 + rnd() * 0.2)), H })
      if (f.ref) f.ref.T = FIG.at(-1)   // 吃果實的鳥那幾棵：記下擺放矩陣，world.js 要在這棵樹真正的枝條上找站的位置
      addCollider(f.x, f.z, 0.6, y + H)
    }
    const nearFig = (x, z, r) => FIGPOS.some((f) => Math.hypot(f.x - x, f.z - z) < r)
    for (let k = 0; k < 40000 && (SCH.length < 60 || FLW.lily.length + FLW.hyper.length + FLW.gent.length < 420); k++) {
      const x = ALP.X0 + rnd() * (ALP.X1 - ALP.X0), z = -ALP.HZ + rnd() * ALP.HZ * 2, td = alpineTrailDist(x, z)
      if (td > 14) continue
      const hgt = alpineHeight(x, z)
      if (nearFig(x, z, 1.5) || YOSE.behind(x, z)) continue   // 2026-11-10 岩簷裡（瀑布後面）不長花
      if (SCH.length < 60 && hgt < 30 && td > 2.6 && td < 7 && okHere(x, z, td, 2.6)) {
        SCH.push({ p: V(x, hgt - 0.05, z), q: new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), rnd() * TAU), s: V(1, 1, 1).multiplyScalar(1.1 + rnd() * 0.7) })
      } else if (td > 1.25 && td < 3.6 && okHere(x, z, td, 1.25)) {   // 2026-11-09 靠步道一點：以前 1.6～4.5 公尺常被箭竹整叢蓋住
        const kind = hgt < 14 ? 'lily' : hgt < 32 ? 'hyper' : 'gent'
        if (FLW[kind].length < 160) FLW[kind].push({ p: V(x, hgt - 0.02, z), q: new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), rnd() * TAU), s: V(1, 1, 1).multiplyScalar(kind === 'lily' ? 0.9 + rnd() * 0.5 : kind === 'hyper' ? 0.85 + rnd() * 0.35 : 0.65 + rnd() * 0.3) })
      }
    }
    const inst = (geo, mat, list, cast = true) => {
      const m = new THREE.InstancedMesh(geo, mat, list.length), mm = new THREE.Matrix4(), c = new THREE.Color()
      list.forEach((it, i) => { m.setMatrixAt(i, mm.compose(it.p, it.q, it.s)); m.setColorAt(i, c.setHSL(0.3, 0.1, 0.92 + rnd() * 0.12)) })
      m.castShadow = cast; m.receiveShadow = true; m.computeBoundingSphere(); g.add(m); return m
    }
    if (lib.figtree) {
      // 2026-11-10 寫實版：樹幹、枝條、葉子用掃描的樹（Poly Haven island_tree_01 縮減，tools/make-figtree.py）；
      // 榕果、氣根照這棵樹真正的枝條位置長：從細枝、樹幹上段的頂點挑點，一處一串榕果，少數幾處垂下氣根
      // 掃描的樹偏暗：雀榕的葉子是亮綠有光澤、樹皮灰白，材質顏色提亮
      // 風：只有葉子輕輕晃（樹高 9 公尺時樹梢約 5 公分）；樹幹、枝不動——以前整棵一起彎（樹梢擺 1 公尺），樹扭來扭去、榕果和氣根跟不上
      for (const { mat } of parts(lib.figtree)) { if (/leaves/.test(mat.name)) { mat.color.setRGB(1.3, 1.45, 1.1); mat.roughness = 0.55; addWind(mat, 0.006) } else mat.color.setRGB(1.6, 1.55, 1.5) }
      scatter(g, lib.figtree, FIG)
      const pts = []
      for (const { geo, mat } of parts(lib.figtree)) {
        if (/leaves/.test(mat.name)) continue
        const p = geo.attributes.position
        for (let i = 0; i < p.count; i += 7) { const y = p.getY(i); if (y > 0.3 && y < 0.82) pts.push(V(p.getX(i), y, p.getZ(i))) }
      }
      const rf = mulberry32(91), pick = () => pts[Math.floor(rf() * pts.length)]
      const fr = [], rt = []
      for (let c = 0; c < 90 && pts.length; c++) {   // 一串擠在枝上
        const o = pick(), n = 14 + Math.floor(rf() * 14)   // 果子小（樹高 9 公尺時直徑約 2～3 公分），一串擠在一起
        for (let k = 0; k < n; k++) fr.push(figBall(0.0022 + rf() * 0.0012, o.x + (rf() - 0.5) * 0.022, o.y + (rf() - 0.5) * 0.018, o.z + (rf() - 0.5) * 0.022))
      }
      for (let c = 0; c < 9 && pts.length; c++) {   // 氣根：從枝下垂，大多掛在半空
        const anc = pick(), n = 3 + Math.floor(rf() * 4)
        for (let k = 0; k < n; k++) {
          const ground = rf() < 0.15, len = ground ? anc.y : anc.y * (0.2 + rf() * 0.4), ox = (rf() - 0.5) * 0.025, oz = (rf() - 0.5) * 0.025, ph = rf() * 6, q = []
          for (let j = 0; j <= 6; j++) { const t = j / 6; q.push(V(anc.x + ox + Math.sin(t * 3 + ph) * 0.005, anc.y - 0.01 - len * t, anc.z + oz + Math.cos(t * 2.4 + ph) * 0.005)) }
          rt.push(colG(taper(q, 0.0016 + rf() * 0.0007, ground ? 0.0011 : 0.0003), 0.78, 0.55, 0.42))
        }
      }
      lodRegister([inst(mergeGeometries(fr), fruitM, FIG), inst(mergeGeometries(rt), bark, FIG)], 12)
    } else {
      const crownMesh = inst(figCrown, figM, FIG); crownMesh.receiveShadow = false   // 葉團自己互相遮的陰影會讓整片樹冠從下面看全黑
      lodRegister([crownMesh, inst(figTrunk, bark, FIG), inst(figFruit, fruitM, FIG)], 12)
    }
    // 2026-11-10 鵝掌藤立體版（以前是 9 片交叉的平面卡片）：6 根從基部彎上來的莖；每個節一片掌狀複葉＝葉柄＋7～9 片倒卵形小葉像傘一樣放射；
    // 莖頂一把把放射的果序（繖形），果子從橘黃熟到紅、紫黑。高約 1.1（擺放時再乘 1.1～1.8）
    {
      const r = mulberry32(64), stems = [], leaves = [], berries = []
      const leafletT = canvasTex(128, 256, (x, w, h) => { x.clearRect(0, 0, w, h); leaf(x, w / 2, h - 6, -Math.PI / 2, h - 14, { h: 108, s: 52, l: 24 }, mulberry32(3), 0.42) })
      leafletT.anisotropy = 8
      const leaflet = (L, W) => {   // 一片小葉：沿 +y 長 L，中間微微折起（V 形）、尾端往下彎
        const q = new THREE.PlaneGeometry(W, L, 2, 4).translate(0, L / 2, 0), p = q.attributes.position
        for (let i = 0; i < p.count; i++) { const t = p.getY(i) / L, sx = Math.abs(p.getX(i)) / (W / 2); p.setZ(i, sx * W * 0.18 - t * t * L * 0.3) }
        q.rotateX(-Math.PI / 2); q.computeVertexNormals(); return q
      }
      const berry = (c, rad, ripe) => {
        const q = new THREE.IcosahedronGeometry(rad, 0).toNonIndexed(), col = ripe < 0.45 ? [0.95, 0.55 + r() * 0.15, 0.08] : ripe < 0.8 ? [0.85, 0.2 + r() * 0.1, 0.07] : [0.25, 0.07, 0.15]
        const cc = new Float32Array(q.attributes.position.count * 3); for (let i = 0; i < cc.length; i += 3) { cc[i] = col[0]; cc[i + 1] = col[1]; cc[i + 2] = col[2] }
        q.setAttribute('color', new THREE.BufferAttribute(cc, 3)); return q.translate(c.x, c.y, c.z)
      }
      for (let s = 0; s < 6; s++) {
        const a = s / 6 * TAU + r() * 0.7, lean = 0.1 + r() * 0.22, H = 0.75 + r() * 0.4, pts = []
        for (let k = 0; k <= 6; k++) { const t = k / 6; pts.push(V(Math.cos(a) * lean * t * (0.6 + t), H * t, Math.sin(a) * lean * t * (0.6 + t))) }
        stems.push(taper(pts, 0.008, 0.0035, 8))
        const curve = new THREE.CatmullRomCurve3(pts), nL = 6 + Math.floor(r() * 3)
        for (let k = 0; k < nL; k++) {   // 葉：莖的上 2/3 互生
          const t = 0.35 + 0.62 * (k / nL), c0 = curve.getPointAt(t), b = a + k * 2.3 + r() * 0.5
          const dir = V(Math.cos(b) * 0.8, 0.45 + r() * 0.3, Math.sin(b) * 0.8).normalize(), pl = 0.09 + r() * 0.06
          stems.push(limb(c0, dir, pl, 0.0022, 0.0014))
          const c = c0.clone().addScaledVector(dir, pl), n = 7 + Math.floor(r() * 3), tilt = 0.15 + r() * 0.25
          for (let j = 0; j < n; j++) {
            const psi = j / n * TAU + b, L = (0.075 + r() * 0.03) * (0.8 + 0.25 * Math.cos(j / n * TAU))
            leaves.push(leaflet(L, L * 0.42).rotateX(tilt).rotateY(psi).translate(c.x, c.y + 0.004, c.z))
          }
        }
        if (s < 4) {   // 果序：莖頂一把，9～12 根放射的梗，每根末端一小團果
          const top = pts[6], ripe = r(), nr = 9 + Math.floor(r() * 4)
          for (let k = 0; k < nr; k++) {
            const ra = r() * TAU, d = V(Math.cos(ra) * 0.7, 0.55 + r() * 0.4, Math.sin(ra) * 0.7).normalize(), rl = 0.06 + r() * 0.04
            stems.push(limb(top, d, rl, 0.0018, 0.0012))
            const e2 = top.clone().addScaledVector(d, rl)
            for (let m = 0; m < 5; m++) berries.push(berry(e2.clone().add(V((r() - 0.5) * 0.022, (r() - 0.5) * 0.018, (r() - 0.5) * 0.022)), 0.0065 + r() * 0.002, Math.min(1, ripe + (r() - 0.5) * 0.4)))
          }
        }
      }
      const stemM = new THREE.MeshStandardMaterial({ color: 0x5c6b3c, roughness: 0.8 })
      const lg = vcol(mergeGeometries(leaves.map((q) => q.toNonIndexed())), 1)
      { const cc = lg.attributes.color, pp = lg.attributes.position; for (let i = 0; i < cc.count; i++) { const k = 0.7 + 0.3 * Math.min(1, pp.getY(i) / 1.1); cc.setXYZ(i, k, k, k) } }   // 下面的葉暗一點
      const sg = mergeGeometries(stems.map((q) => q.index ? q.toNonIndexed() : q).map((q) => { q.deleteAttribute('color'); return q }))
      const scheffM = leafMat(leafletT, { roughness: 0.35, color: 0xf0f6e8 })
      lodRegister([inst(lg, scheffM, SCH), inst(sg, stemM, SCH), inst(mergeGeometries(berries), fruitM, SCH)], 6)
    }
    for (const [kind, list] of Object.entries(FLW)) if (list.length) lodRegister([inst(crossCards(5, 0.7, 0.75, 0, 70 + kind.length, 0.12), leafMat(flowerT(kind)), list, false)], 3)
    FIG_TREES.push(...FIG.map((f) => ({ x: f.p.x, y: f.p.y, z: f.p.z, H: f.H })))
    Object.assign(FLORA_SPOTS, { sch: SCH.map((it) => it.p), ...Object.fromEntries(Object.entries(FLW).map(([k, l]) => [k, l.map((it) => it.p)])) })
  }
  // 登山口的門（2026-11-09 入口太空）：兩根原木柱＋上面一根橫樑、斜撐，橫樑下掛一塊木牌（燒刻山和鳥的圖案，不寫字），
  // 柱腳一圈石頭。跨在步道剛進山區那一段，從花園走過來第一眼就看到「這裡開始上山」
  {
    const [x0, z0] = ALP_TRAIL[0], [x1, z1] = ALP_TRAIL[1]
    const L = Math.hypot(x1 - x0, z1 - z0), dx = (x1 - x0) / L, dz = (z1 - z0) / L
    const gx = x0 + dx * 5, gz = z0 + dz * 5, sx = -dz, sz = dx, HW = 2.5, Hp = 3.6
    const barkT = canvasTex(128, 256, (x, w, h) => {
      x.fillStyle = '#6a4e36'; x.fillRect(0, 0, w, h); const r = mulberry32(77)
      for (let i = 0; i < 70; i++) { x.strokeStyle = `rgba(${30 + r() * 30},${20 + r() * 20},${12},${0.25 + r() * 0.35})`; x.lineWidth = 1 + r() * 3; const xx = r() * w; x.beginPath(); x.moveTo(xx, 0); x.bezierCurveTo(xx + (r() - 0.5) * 10, h * 0.3, xx + (r() - 0.5) * 10, h * 0.7, xx + (r() - 0.5) * 8, h); x.stroke() }
      for (let i = 0; i < 8; i++) { x.fillStyle = 'rgba(40,26,14,0.5)'; x.beginPath(); x.ellipse(r() * w, r() * h, 3 + r() * 4, 5 + r() * 6, 0, 0, TAU); x.fill() }
    })
    barkT.wrapS = barkT.wrapT = THREE.RepeatWrapping
    const logM = new THREE.MeshStandardMaterial({ map: barkT, roughness: 0.9 })
    const endM = new THREE.MeshStandardMaterial({ color: 0xb08a5e, roughness: 0.8 })
    const gate = new THREE.Group(); gate.name = 'trailheadGate'
    const log = (r0, r1, len) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, len, 12, 1), [logM, endM, endM]); m.castShadow = true; m.receiveShadow = true; return m }
    const between = (a, b, r) => { const d = b.clone().sub(a), m = log(r, r, d.length()); m.position.copy(a).add(b).multiplyScalar(0.5); m.quaternion.setFromUnitVectors(V(0, 1, 0), d.normalize()); return m }
    const gy0 = Math.max(GY(gx + sx * HW, gz + sz * HW), GY(gx - sx * HW, gz - sz * HW))
    for (const s of [-1, 1]) {
      const px = gx + sx * HW * s, pz = gz + sz * HW * s, py = GY(px, pz)
      const top = gy0 + Hp + 0.25, bot = py - 0.3
      const post = log(0.17, 0.15, top - bot); post.position.set(px, (top + bot) / 2, pz); gate.add(post)
      addCollider(px, pz, 0.25)
      // 斜撐：柱子和橫樑之間
      gate.add(between(V(px - sx * s * 0.1, gy0 + Hp - 0.85, pz - sz * s * 0.1), V(px - sx * s * 0.85, gy0 + Hp - 0.05, pz - sz * s * 0.85), 0.065))
      // 柱腳的石頭
      for (let i = 0; i < 6; i++) {
        const a = i / 6 * TAU + rnd(), st = new THREE.Mesh(new THREE.DodecahedronGeometry(0.14 + rnd() * 0.08, 0), new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(0.1, 0.06, 0.4 + rnd() * 0.15), roughness: 1, flatShading: true }))
        st.position.set(px + Math.cos(a) * 0.32, py + 0.02, pz + Math.sin(a) * 0.32); st.rotation.set(rnd() * 3, rnd() * 3, 0); st.scale.y = 0.6; st.castShadow = true; gate.add(st)
      }
    }
    gate.add(between(V(gx - sx * (HW + 0.45), gy0 + Hp, gz - sz * (HW + 0.45)), V(gx + sx * (HW + 0.45), gy0 + Hp, gz + sz * (HW + 0.45)), 0.15))
    // 木牌：燒刻圖案（山稜線＋一隻飛的鳥＋樹），兩條麻繩掛在橫樑下
    const cv = document.createElement('canvas'); cv.width = 512; cv.height = 192
    const c = cv.getContext('2d'), r = mulberry32(5)
    c.fillStyle = '#a27a50'; c.fillRect(0, 0, 512, 192)
    for (let i = 0; i < 60; i++) { c.strokeStyle = `rgba(80,52,30,${0.08 + r() * 0.15})`; c.lineWidth = 1 + r() * 2; const y = r() * 192; c.beginPath(); c.moveTo(0, y); c.bezierCurveTo(170, y + (r() - 0.5) * 10, 340, y + (r() - 0.5) * 10, 512, y + (r() - 0.5) * 8); c.stroke() }
    c.strokeStyle = '#3a2412'; c.lineWidth = 10; c.strokeRect(10, 10, 492, 172)
    c.fillStyle = '#3e2714'
    c.beginPath(); c.moveTo(40, 160); c.lineTo(140, 70); c.lineTo(190, 110); c.lineTo(270, 38); c.lineTo(350, 112); c.lineTo(400, 82); c.lineTo(472, 160); c.closePath(); c.fill()
    c.fillStyle = '#a27a50'; c.beginPath(); c.moveTo(270, 38); c.lineTo(292, 58); c.lineTo(276, 56); c.lineTo(262, 66); c.lineTo(252, 55); c.closePath(); c.fill()   // 山頂的雪
    for (const [tx, ts] of [[95, 1], [118, 0.8], [420, 0.9], [442, 1.1]]) { c.fillStyle = '#2c1a0c'; c.beginPath(); c.moveTo(tx, 160 - 56 * ts); c.lineTo(tx + 16 * ts, 160); c.lineTo(tx - 16 * ts, 160); c.closePath(); c.fill() }
    c.strokeStyle = '#2c1a0c'; c.lineWidth = 6; c.lineCap = 'round'
    c.beginPath(); c.moveTo(330, 52); c.quadraticCurveTo(350, 36, 368, 50); c.quadraticCurveTo(386, 36, 406, 52); c.stroke()   // 飛鳥
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace
    const boardM = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85 })
    const board = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.79, 0.07), [endM, endM, endM, endM, boardM, boardM])
    board.position.set(gx, gy0 + Hp - 0.75, gz); board.castShadow = true
    board.lookAt(gx - dx, gy0 + Hp - 0.75, gz - dz)   // 圖案朝花園那邊（走過來的方向）
    gate.add(board)
    const ropeM = new THREE.MeshStandardMaterial({ color: 0xc9b48a, roughness: 1 })
    for (const s of [-0.8, 0.8]) { const rp = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.36, 5), ropeM); rp.position.set(gx + sx * s, gy0 + Hp - 0.2, gz + sz * s); gate.add(rp) }
    g.add(gate)
  }
  // 岩石：陡坡上的大岩塊、溪邊的長苔石頭（用溫室那批岩石模型）
  {
    const lists = {}, put = (n, it) => (lists[n] ||= []).push(it)
    const big = ['rock_face', 'rock_face_02', 'boulder', 'mrock_3', 'mrock_7', 'mrock_9', 'mrock_12'], moss = ['rock_moss_set', 'rock_moss_set_02', 'mrock_8', 'mrock_10', 'boulder']
    const pick = (a) => a[Math.floor(rnd() * a.length)]
    for (let k = 0; k < 8000 * AK; k++) {
      const x = ALP.X0 + rnd() * (ALP.X1 - ALP.X0), z = -ALP.HZ + rnd() * ALP.HZ * 2
      if (YOSE.behind(x, z) || YOSE.inEastLake(x, z, 0.4) || YOSE.inOutlet(x, z, 0.5)) continue
      { const ez0 = eastZone(x, z); if (ez0 === 'wet' || ez0 === 'hide') continue }   // 濕地、觀察屋旁不放山區的石頭（草原留著零星的）
      if (!inAlpine(x, z, 2) || domeRho(x, z) > 0.95 || (Math.hypot(x - CABIN.x, z - CABIN.z) < CABIN.R + 2.4 || Math.hypot(x - CAMP.x, z - CAMP.z) < CAMP.R + 2.4) || alpineTrailDist(x, z) < 2.2 || bridgeDist(x, z) < 2.5 || nearBird(avoid, x, z, 3, 1.5)) continue
      const h = alpineHeight(x, z), slope = Math.hypot(alpineHeight(x + 1, z) - h, alpineHeight(x, z + 1) - h)
      if (h < ALP_POND.water - 0.2 && Math.hypot(x - ALP_POND.x, z - ALP_POND.z) < ALP_POND.r + 0.5) continue   // 2026-11-10 檢查員：河口挖深後一顆苔石留在湖底、像一團褐色珊瑚 → 湖裡（水深 > 0.2）不放
      const sd = alpineStreamDist(x, z)
      if (sd > 1.4 && sd < 4 && rnd() < 0.25) put(pick(moss), { p: V(x, h - 0.15, z), q: new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rnd() * TAU, 0)), s: V(1, 1, 1).multiplyScalar(0.8 + rnd() * 1.2), c: new THREE.Color().setHSL(0.25, 0.12, 0.85 + rnd() * 0.1) })
      else if (slope > 0.55 && rnd() < 0.06) {
        const k = 1.5 + rnd() * 2
        if (alpineTrailDist(x, z) < 2.2 + k * 1.3 || bridgeDist(x, z) < 2.5 + k * 1.3) continue   // 大岩塊不能壓到步道
        put(pick(big), { p: V(x, h - 0.6, z), q: new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rnd() * TAU, 0)), s: V(1, 1, 1).multiplyScalar(k), c: new THREE.Color().setHSL(0.1, 0.05, 0.8 + rnd() * 0.12) })
      }
    }
    for (const [n, list] of Object.entries(lists)) if (lib[n]) { scatter(g, lib[n], list, { cast: true }); rockColliders(lib[n], list) }
    // 溪邊、池邊的蕨類
    const ferns = []
    for (let k = 0; k < 12000 * AK && ferns.length < 420 * AK; k++) {
      const x = ALP.X0 + rnd() * (ALP.X1 - ALP.X0), z = -ALP.HZ + rnd() * ALP.HZ * 2
      if (YOSE.behind(x, z) || YOSE.inEastLake(x, z, 0.4) || YOSE.inOutlet(x, z, 0.5)) continue
      if (!inAlpine(x, z, 1) || domeRho(x, z) > 0.95 || eastZone(x, z)) continue
      const sd = alpineStreamDist(x, z), dp = Math.hypot(x - ALP_POND.x, z - ALP_POND.z)
      if (!((sd > 1.3 && sd < 4.5) || (dp > ALP_POND.r + 0.8 && dp < ALP_POND.r + 3.5)) || alpineTrailDist(x, z) < 1.6) continue
      if (dp < ALP_POND.r + 0.5 && alpineHeight(x, z) < ALP_POND.water + 0.15) continue   // 2026-11-10 河口挖深之後：湖裡不長蕨
      ferns.push({ p: V(x, alpineHeight(x, z) - 0.05, z), q: new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), rnd() * TAU), s: V(1, 1, 1).multiplyScalar(0.7 + rnd() * 0.5), c: new THREE.Color().setHSL(0.25, 0.15, 0.9) })
    }
    const fl = {}
    for (const f of ferns) (fl[pick(['fern_sa', 'fern_sb', 'fern2_b', 'fern2_c', 'fern_a'])] ||= []).push(f)
    for (const [n, list] of Object.entries(fl)) if (lib[n]) scatter(g, lib[n], list, { cast: false })
    // 入口兩側（BAND）：長苔的大石頭、一叢叢蕨類（林下）
    const bl = {}, bf = {}
    for (let k = 0; k < 9000; k++) {
      const x = 46 + rnd() * 58, z = -64 + rnd() * 128
      if (!BAND(x, z) || OPEN(x, z) || nearBird(avoid, x, z, 3.5, 1.5) || alpineTrailDist(x, z) < 2.4) continue
      const h = GY(x, z), r = rnd()
      if (r < 0.035) {
        const k2 = 0.7 + rnd() * 1.4
        if (pathClearAt(x, z) < 1.4 + k2 || alpineTrailDist(x, z) < 2.4 + k2) continue
        ;(bl[pick(rnd() < 0.5 ? moss : big)] ||= []).push({ p: V(x, h - 0.25 * k2, z), q: new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rnd() * TAU, 0)), s: V(1, 1, 1).multiplyScalar(k2), c: new THREE.Color().setHSL(0.22, 0.1, 0.78 + rnd() * 0.15) })
      } else if (r < 0.2 && fbm2(x * 0.09 + 5, z * 0.09, 2) > 0.45) {
        (bf[pick(['fern_sa', 'fern_sb', 'fern2_b', 'fern2_c', 'fern_a', 'fern_b'])] ||= []).push({ p: V(x, h - 0.05, z), q: new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), rnd() * TAU), s: V(1, 1, 1).multiplyScalar(0.8 + rnd() * 0.6), c: new THREE.Color().setHSL(0.25, 0.15, 0.85 + rnd() * 0.1) })
      }
    }
    for (const [n, list] of Object.entries(bl)) if (lib[n]) { scatter(g, lib[n], list, { cast: true }); rockColliders(lib[n], list) }
    for (const [n, list] of Object.entries(bf)) if (lib[n]) scatter(g, lib[n], list, { cast: false })
  }
  // 玉山箭竹（2026-11-07 改）：原本是一叢叢細長草葉、中間露出一大片地面，像稀稀落落的刺。
  // 真的箭竹草原是膝蓋到腰高、密密一整片：每叢幾根細竹稈，稈上不同高度長出披針形的葉子往外斜伸（bladeMesh 的 cane 模式）。
  // 顏色一片片不一樣：大部分黃綠、有些比較深綠、有些偏枯黃；切成 14 公尺一塊做 LOD（遠的變稀，地面顏色接得上）
  {
    const A = [], B = [], c = new THREE.Color(), MAXI = 450000 * AK
    for (let k = 0; k < 140000 * AK && A.length / 4 < MAXI; k++) {
      const x = ALP.X0 + rnd() * (ALP.X1 - ALP.X0), z = -ALP.HZ + rnd() * ALP.HZ * 2
      if (YOSE.behind(x, z) || YOSE.inEastLake(x, z, 0.4) || YOSE.inOutlet(x, z, 0.5)) continue
      if ((!inAlpine(x, z, 1) && !BAND(x, z)) || domeRho(x, z) > 0.955 || eastZone(x, z)) continue
            if (groundClear(avoid, x, z, 1.6)) continue   // 地上的鳥走動的地方、到鏡頭那條線：不長
            if (bridgeDist(x, z) < BRIDGE_DIM.hw + 0.8 || nearGiant(x, z, 0.1)) continue   // 吊橋兩端橋面貼近地面：箭竹會從木板縫長出來（2026-11-09）；巨木樹幹裡不長
      if ((Math.hypot(x - CABIN.x, z - CABIN.z) < CABIN.R || Math.hypot(x - CAMP.x, z - CAMP.z) < CAMP.R)) continue   // 小木屋裡面不長
      if (alpineTrailDist(x, z) < 1.5 || alpineStreamDist(x, z) < 1.4 || Math.hypot(x - ALP_POND.x, z - ALP_POND.z) < ALP_POND.r + 0.6) continue
      const h = GY(x, z)
      const patch = fbm2(x * 0.07, z * 0.07, 3)
      if (rnd() > 0.55 + 0.6 * patch) continue
      // 一片片的色調：黃綠為主、深綠、枯黃
      const tone = fbm2(x * 0.11 + 31, z * 0.11 - 17, 2)
      const hue = 0.21 + (tone - 0.5) * 0.06 + (rnd() - 0.5) * 0.02, dry = ss(0.62, 0.8, tone)
      c.setHSL(hue - dry * 0.05, 0.5 - dry * 0.1, 0.22 + rnd() * 0.06 + dry * 0.08)
      const tall = (0.45 + rnd() * 0.3 + 0.25 * ss(10, 22, h)) * (0.85 + 0.3 * patch)
      const stems = 2 + Math.floor(rnd() * 3)
      for (let s = 0; s < stems; s++) {
        const sx = x + (rnd() - 0.5) * 0.25, sz = z + (rnd() - 0.5) * 0.25, st = tall * (0.75 + rnd() * 0.35), sa = rnd() * TAU
        A.push(sx, h - 0.02, sz, sa); B.push(c.r * 0.8, c.g * 0.8, c.b * 0.7, st)   // 竹稈
        // 稈的上半段長葉子：越上面越多、越短
        const nl = 5 + Math.floor(rnd() * 4)
        for (let j = 0; j < nl; j++) {
          const t = 0.3 + (j / nl) * 0.62 + rnd() * 0.06, la = rnd() * TAU, len = (0.24 + rnd() * 0.14) * (1.15 - t * 0.4)
          const lean = 0.2 * st * t   // 稈本身也斜一點：葉子接在稈的位置上
          A.push(sx + Math.cos(sa) * lean * t, h - 0.02 + st * t, sz + Math.sin(sa) * lean * t, la)
          const k2 = 0.95 + rnd() * 0.15
          B.push(c.r * k2, c.g * k2, c.b * k2 * 0.9, -len)
        }
      }
    }
    const CELL = 14, cells = new Map()
    for (let i = 0; i < A.length / 4; i++) { const key = Math.floor(A[i * 4] / CELL) + ',' + Math.floor(A[i * 4 + 2] / CELL); (cells.get(key) || cells.set(key, []).get(key)).push(i) }
    for (const [key, idx] of cells) {
      for (let i = idx.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]] }
      const a = [], b = []
      for (const i of idx) { a.push(A[i * 4], A[i * 4 + 1], A[i * 4 + 2], A[i * 4 + 3]); b.push(B[i * 4], B[i * 4 + 1], B[i * 4 + 2], B[i * 4 + 3]) }
      const [cx, cz] = key.split(',').map((v) => (+v + 0.5) * CELL)
      const m = bladeMesh(a, b, { width: [0.042, 0.028], cane: true }); g.add(m)
      m.geometry.boundingSphere = new THREE.Sphere(V(cx, alpineHeight(cx, cz) + 0.6, cz), CELL * 0.75 + 3)   // 2026-11-10 每一塊自己的外框、打開視野剔除（以前全部關掉，視野外的箭竹也一塊一次 draw call）
      lodRegisterGrass(m, V(cx, alpineHeight(cx, cz) + 0.5, cz), CELL * 0.72 + 1)
    }
  }
  // 箭竹的「叢」：一張畫滿竹葉的透明貼圖，貼在三片交叉的面上（遊戲裡密草的標準做法）。
  // 一叢就有幾十片葉子，用很少的數量就能把整片坡蓋滿；近處再加上面那些立體的竹稈和葉子，拉近看才有層次。
  {
    const leafTex = canvasTex(512, 512, (x, w, h) => {
      const r = mulberry32(4242)
      x.clearRect(0, 0, w, h)
      const leaf = (px, py, ang, L, W, col, dark) => {
        const dx = Math.cos(ang), dy = Math.sin(ang), nx = -dy, ny = dx
        const tx = px + dx * L, ty = py + dy * L, droop = L * 0.12
        x.beginPath(); x.moveTo(px, py)
        x.quadraticCurveTo(px + dx * L * 0.3 + nx * W, py + dy * L * 0.3 + ny * W, tx, ty + droop)
        x.quadraticCurveTo(px + dx * L * 0.3 - nx * W, py + dy * L * 0.3 - ny * W, px, py)
        x.fillStyle = col; x.fill()
        x.strokeStyle = dark; x.lineWidth = 1; x.beginPath(); x.moveTo(px, py); x.lineTo(px + dx * L * 0.85, py + dy * L * 0.85 + droop * 0.7); x.stroke()   // 中肋
      }
      // 由後往前、由下往上畫：底下的葉子暗（被上面遮住），上面的亮
      // 叢的輪廓是圓頂、高低不齊（原本每根稈都長到差不多高，整叢像一塊方方的綠籬）；稈不畫到最底下那條邊（不然坡上會看到一排黑線）
      for (let i = 0; i < 70; i++) {
        const off = (r() + r() + r()) / 3 - 0.5, bx = w * 0.5 + off * w * 0.8
        const top = h * (0.06 + Math.abs(off) * 0.9 + r() * 0.3), lean = off * w * 0.35 + (r() - 0.5) * w * 0.1, base = h * (0.88 + r() * 0.1)
        x.strokeStyle = `hsl(${60 + r() * 15}, 32%, ${28 + r() * 10}%)`; x.lineWidth = 1.2 + r() * 0.8
        x.beginPath(); x.moveTo(bx, base); x.quadraticCurveTo(bx + lean * 0.3, (base + top) / 2, bx + lean, top); x.stroke()
        const nl = 4 + Math.floor(r() * 5)
        for (let j = 0; j < nl; j++) {
          const t = 0.3 + (j / nl) * 0.7, px = bx + lean * t * t, py = base + (top - base) * t
          const side = r() < 0.5 ? -1 : 1, ang = -Math.PI / 2 + side * (0.55 + r() * 0.75) + lean / w
          const L = w * (0.1 + r() * 0.09) * (1.1 - t * 0.3), W = L * (0.13 + r() * 0.06)
          const lum = 20 + t * 22 + r() * 8, hue = 68 + r() * 26, sat = 42 + r() * 18
          const dry = r() < 0.12
          leaf(px, py, ang, L, W, dry ? `hsl(${48 + r() * 8}, 40%, ${lum + 6}%)` : `hsl(${hue}, ${sat}%, ${lum}%)`, `hsla(${hue - 10}, 40%, ${lum * 0.6}%, 0.7)`)
        }
      }
    })
    leafTex.wrapS = leafTex.wrapT = THREE.ClampToEdgeWrapping
    const parts = [0, 1, 2].map((i) => new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0).rotateY(i * Math.PI / 3))
    const geo = mergeGeometries(parts)
    { const n = geo.attributes.normal; for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, 1, 0) }   // 法線朝上：三片交叉的面亮度一致（不然轉個角度就一片黑一片白）
    const mat = addWind(new THREE.MeshStandardMaterial({ map: leafTex, alphaTest: 0.42, side: THREE.DoubleSide, roughness: 0.85 }), 0.05)
    // 雙面材質從背面看，three 會把法線翻過來（變朝下）→ 那一面整片黑。這裡的法線本來就統一朝上，不要翻
    { const wind = mat.onBeforeCompile; mat.onBeforeCompile = (sh, r) => { wind(sh, r); sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>', THREE.ShaderChunk.normal_fragment_begin.replace('normal *= faceDirection;', '')) }; mat.customProgramCacheKey = () => 'caneCard' }
    const list = [], c = new THREE.Color()
    for (let k = 0; k < 160000 * AK && list.length < 90000 * AK; k++) {
      const x = ALP.X0 + rnd() * (ALP.X1 - ALP.X0), z = -ALP.HZ + rnd() * ALP.HZ * 2
      if (YOSE.behind(x, z) || YOSE.inEastLake(x, z, 0.4) || YOSE.inOutlet(x, z, 0.5)) continue
      if ((!inAlpine(x, z, 1) && !BAND(x, z)) || domeRho(x, z) > 0.955 || eastZone(x, z)) continue
      if (groundClear(avoid, x, z, 1.8) || bridgeDist(x, z) < BRIDGE_DIM.hw + 0.8 || nearGiant(x, z, 0.2)) continue
      if ((Math.hypot(x - CABIN.x, z - CABIN.z) < CABIN.R + 0.2 || Math.hypot(x - CAMP.x, z - CAMP.z) < CAMP.R + 0.2)) continue
      if (alpineTrailDist(x, z) < 1.7 || alpineStreamDist(x, z) < 1.6 || Math.hypot(x - ALP_POND.x, z - ALP_POND.z) < ALP_POND.r + 0.8) continue
      const patch = fbm2(x * 0.07, z * 0.07, 3)
      if (rnd() > 0.5 + 0.7 * patch) continue
      const hh = GY(x, z), tone = fbm2(x * 0.11 + 31, z * 0.11 - 17, 2), dry = ss(0.62, 0.8, tone)
      const tall = (0.55 + rnd() * 0.35 + 0.25 * ss(10, 22, hh)) * (0.85 + 0.3 * patch), wide = tall * (1.1 + rnd() * 0.5)
      c.setHSL(0.24 + (tone - 0.5) * 0.08 - dry * 0.06, 0.35, 0.85 + rnd() * 0.25 + dry * 0.15)   // 貼圖本身有顏色：這裡是一片片的色調（乘上去）
      // 坡上：叢的下緣要埋進最低的那一角（原本下坡那邊浮在半空、看得到底）
      const r2 = wide * 0.5, lo = Math.min(hh, GY(x + r2, z), GY(x - r2, z), GY(x, z + r2), GY(x, z - r2))
      list.push({ x, y: lo - 0.06, z, yaw: rnd() * TAU, w: wide, h: tall + (hh - lo), c: c.clone() })
    }
    const im = new THREE.InstancedMesh(geo, mat, list.length), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler()
    list.forEach((it, i) => {
      m4.compose(V(it.x, it.y, it.z), q.setFromEuler(e.set(0, it.yaw, 0)), V(it.w, it.h, it.w))
      im.setMatrixAt(i, m4); im.setColorAt(i, it.c)
    })
    im.receiveShadow = true; im.castShadow = false; im.layers.set(1)
    im.computeBoundingSphere(); g.add(im)
    lodRegister([im], 2.2)   // 比較高的「植物」：28 公尺開始變稀，遠一點才不畫（再遠是地面的顏色接上）
  }
  // 雲霧：一團團有雲紋的柔邊霧（四種紋路、各自旋轉），多半貼著山谷和低坡、少數掛在山腰；
  // 順著風慢慢往東飄、飄出山區就從西邊再進來，濃淡會慢慢變；鏡頭靠近就淡掉（走進霧裡不會看到一張平板）。
  // 遠近的整體霧氣在 fogzone.js（低處濃、高處淡）。
  const mist = []
  {
    const texs = [0, 1, 2, 3].map((seed) => canvasTex(256, 256, (x, w, h) => {
      const r = mulberry32(90 + seed)
      x.clearRect(0, 0, w, h)
      for (let i = 0; i < 70; i++) {
        const a = r() * TAU, d = Math.pow(r(), 0.7) * w * 0.3, rr = w * (0.08 + r() * 0.16)
        const cx = w / 2 + Math.cos(a) * d * 1.3, cy = h / 2 + Math.sin(a) * d * 0.6
        const gr = x.createRadialGradient(cx, cy, 0, cx, cy, rr)
        gr.addColorStop(0, `rgba(244,247,248,${0.05 + r() * 0.07})`); gr.addColorStop(1, 'rgba(244,247,248,0)')
        x.fillStyle = gr; x.fillRect(0, 0, w, h)
      }
      // 外圈收邊，不留方形的邊
      x.globalCompositeOperation = 'destination-in'
      const m = x.createRadialGradient(w / 2, h / 2, w * 0.18, w / 2, h / 2, w * 0.5)
      m.addColorStop(0, 'rgba(0,0,0,1)'); m.addColorStop(1, 'rgba(0,0,0,0)')
      x.fillStyle = m; x.fillRect(0, 0, w, h)
    }))
    const zMax = ALP.HZ - 4, X0 = 78, X1 = ALP.X1 - 10
    const place = (s, x) => {
      const u = s.userData
      for (let k = 0; k < 40; k++) {
        const z = -zMax + rnd() * zMax * 2
        if (!inAlpine(x, z, 4) || domeRho(x, z) > 0.9 || eastZone(x, z)) { x = X0 + rnd() * (X1 - X0); continue }
        if (Math.hypot(x - 198, z - 88) < 30) { x = X0 + rnd() * (X1 - X0); continue }   // 2026-11-13 Pass 1B（ChatGPT）：瀑布湖 25 m 內不要被大團山谷霧蓋住（瀑布自己有局部水霧）   // 2026-11-10 東部濕地／草原不要飄一團白霧（觀察屋旁一大團像牆）
        const gy = alpineHeight(x, z)
        // 偏好低處（山谷、溪邊）；高處的少一點
        if (rnd() > 1.15 - gy / 26) { x = X0 + rnd() * (X1 - X0); continue }
        u.x = x; u.z = z; u.y = gy + u.lift; return
      }
      u.x = x; u.z = 0; u.y = alpineHeight(x, 0) + u.lift
    }
    for (let i = 0; i < 165; i++) {   // 後面 45 團先放在入口那一段（一進山區就是霧茫茫）
      const mat = new THREE.SpriteMaterial({ map: texs[i % 4], depthWrite: false, transparent: true, fog: true, rotation: (rnd() - 0.5) * 0.4, opacity: 0 })
      const s = new THREE.Sprite(mat), sz = 9 + rnd() * 16
      s.scale.set(sz, sz * (0.38 + rnd() * 0.2), 1); s.renderOrder = 7
      s.userData = { sz, lift: sz * 0.22 + 0.5 + rnd() * 4, op: 0.45 + rnd() * 0.45, ph: rnd() * TAU, sp: 0.25 + rnd() * 0.35, x: 0, z: 0, y: 0 }
      place(s, i < 120 ? X0 + rnd() * (X1 - X0) : X0 + rnd() * 30)
      g.add(s); mist.push(s)
    }
    var updateMist = (t, dt, camera) => {
      const cp = camera.position
      for (const s of mist) {
        const u = s.userData
        u.x += u.sp * dt; u.z += Math.sin(t * 0.03 + u.ph) * 0.15 * dt
        if (u.x > X1 || !inAlpine(u.x, u.z, 3) || eastZone(u.x, u.z) || Math.hypot(u.x - 198, u.z - 88) < 26) place(s, X0 + rnd() * 6)
        // 地形變高就慢慢往上抬，不插進山坡
        const mk = mistLevel.value
        const gy = alpineHeight(u.x, u.z) + u.lift * (1 - 0.45 * mk)                   // 清晨、晚上的霧貼著地面、沉在山谷裡
        u.y += (gy - u.y) * Math.min(1, dt * 0.3)
        s.position.set(u.x, u.y + Math.sin(t * 0.2 + u.ph) * 0.4, u.z)
        const d = s.position.distanceTo(cp)
        const life = 0.6 + 0.4 * Math.sin(t * 0.05 + u.ph * 3)                     // 慢慢變濃變淡
        const edge = ss(X0, X0 + 8, u.x) * (1 - ss(X1 - 10, X1, u.x))                // 從西邊進來時淡入
        s.material.opacity = Math.min(1, u.op * life * (1 + 1.1 * mk)) * edge * ss(u.sz * 0.25, u.sz * 0.7, d)     // 太近就淡掉；有霧的時段濃一倍
        s.material.color.setScalar(0.12 + 0.88 * dayLight.value)   // 霧團不受光：跟著天色變暗（晚上原本白白亮亮的，像在發光）
        s.visible = s.material.opacity > 0.01
      }
    }
  }
  return { g, mist, spray, fallFx, waterU, updateMist, wetMirror: g.userData.wetMirror }
}

// 2026-11-11 使用者：太陽出來的光要很漂亮（ChatGPT 光照 V2「陽光斑駁比雲隙光更重要」：樹冠間隙讓 10～25% 的林地有光斑）
// 做法：樹投下的影子裡（平行光的 shadow map）再透出一塊塊光斑——shadow 值取 max(影子, 光斑)；沒有樹影的地方（空地）完全不變。
// 光斑＝世界座標的兩層雜訊（大塊 1.5～4 m、小塊 0.3～0.8 m），跟著風輕輕晃
export const dapU = { uDapT: { value: 0 } }
export function dappled(mat) {
  const prev = mat.onBeforeCompile, prevKey = mat.customProgramCacheKey?.bind(mat)
  mat.onBeforeCompile = (sh, r) => {
    prev?.call(mat, sh, r)
    sh.uniforms.uDapT = dapU.uDapT
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vDapW;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvDapW = (modelMatrix * vec4(transformed, 1.0)).xyz;')
    const fn = `
      varying vec3 vDapW; uniform float uDapT;
      float dHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float dNoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(dHash(i), dHash(i + vec2(1, 0)), f.x), mix(dHash(i + vec2(0, 1)), dHash(i + vec2(1, 1)), f.x), f.y); }
      float dapFleck() {
        vec2 q = vDapW.xz + vec2(sin(uDapT * 0.6), cos(uDapT * 0.45)) * 0.12;
        float big = dNoise(q * 0.45) * 0.6 + dNoise(q * 0.9 + 3.1) * 0.4;
        float sm = dNoise(q * 2.2 + 7.7) * 0.6 + dNoise(q * 4.1 + 1.3) * 0.4;
        return smoothstep(0.54, 0.6, big * 0.55 + sm * 0.45) * 0.85;   // 門檻 0.6→0.54：樹影裡約兩成透出光斑
      }`
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>' + fn)
      .replace('#include <lights_fragment_begin>', THREE.ShaderChunk.lights_fragment_begin.replace(
        'directLight.color *= ( directLight.visible && receiveShadow ) ? getShadow( directionalShadowMap[ i ],',
        'directLight.color *= ( directLight.visible && receiveShadow ) ? max( dapFleck() * step( 0.0, dot( geometryNormal, directLight.direction ) ), getShadow( directionalShadowMap[ i ],').replace(
        'directionalLightShadow.shadowRadius, vDirectionalShadowCoord[ i ] ) : 1.0;',
        'directionalLightShadow.shadowRadius, vDirectionalShadowCoord[ i ] ) ) : 1.0;'))
  }
  mat.customProgramCacheKey = () => (prevKey ? prevKey() : '') + '|dap'
  return mat
}

/* ---------- 對外 ---------- */
// 山區就是溫室東半邊（2026-11-07 改成一個館）：館內一開始就蓋好、一直畫；animate 每格跑（溪水、雲霧）
export function createAlpine({ scene, lib, avoid = [] }) {
  let interior = null
  return {
    build() { if (!interior) { interior = buildInterior(lib, avoid); scene.add(interior.g) } return interior.g },
    get group() { return interior?.g },
    get wetMirror() { return interior?.wetMirror },   // 濕地鏡面倒影（world.js 跟花園水池一起更新）
    animate(t, dt, camera) {
      if (!interior) return
      interior.waterU.uTime.value = t
      dapU.uDapT.value = t
      for (const o of interior.fallFx) {
        const u = o.userData, dl = 0.12 + 0.88 * dayLight.value
        if (u.foam) { o.material.map.offset.set(Math.sin(t * 0.3) * 0.02, t * 0.015 % 1); o.material.map.center.set(0.5, 0.5); o.material.map.rotation = t * (u.rad > 3 ? 0.03 : -0.06); o.material.opacity = u.op * (0.85 + 0.15 * Math.sin(t * 2.1)); o.material.color.setScalar(dl) }
        else if (u.ring) { const f = (t * 0.33 + u.ph) % 1, r = 1.5 + f * 6; o.scale.set(r * (1 + 0.08 * Math.sin(t + u.ph * 7)), 1, r * 0.75); o.material.opacity = 0.06 * (1 - f) * Math.min(1, f * 6); o.material.color.setScalar(dl) }
      }
      for (const sp of interior.spray) { const u = sp.userData; if (u.rise) { const f = (t * u.sp + u.ph) % 1; sp.position.set(u.x0 + Math.sin(t * 0.7 + u.ph * 9) * 0.3, u.y0 + f * u.h, u.z0); const k = u.s0 * (0.7 + f * 0.9); sp.scale.set(k * 1.5, k, 1); sp.material.opacity = (u.op ?? 0.42) * Math.sin(f * Math.PI); sp.material.color.setScalar(0.12 + 0.88 * dayLight.value); continue } sp.position.y = u.y0 + Math.sin(t * 2.3 + u.ph) * 0.15; sp.material.opacity = 0.35 + 0.2 * Math.sin(t * 3.1 + u.ph * 2); const k = u.s0 * (1 + 0.12 * Math.sin(t * 1.7 + u.ph)); sp.scale.set(k * 1.6, k, 1); sp.material.color.setScalar(0.12 + 0.88 * dayLight.value) }
      interior.updateMist(t, dt, camera)
    },
  }
}
