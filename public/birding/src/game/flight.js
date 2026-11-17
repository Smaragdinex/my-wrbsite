// 鳥會怕人：玩家靠太近（跑過來、站著不動、蹲低慢慢靠近的距離都不一樣），鳥就照牠真實的習性逃走——
// 會飛的起飛、飛到遠處躲起來，等玩家走開再飛回原本的地方降落；帝雉、小彎嘴用跑的；紅冠水雞、白腹秧雞游開。
// 飛的時候換成另一個翅膀張開的模型（ChatGPT 畫飛行姿勢 → Tripo → tools/rig-distance.py 的 fly 骨架：body、head、tail、wingL/R、wingtipL/R）。
import * as THREE from 'three'
import { rigged, AX, hasModel } from '../birds.js'
import { HIDES } from '../east.js'
import { clone as skClone } from 'three/addons/utils/SkeletonUtils.js'
import { savNest } from '../savanna.js'
// 2026-11-11 使用者：躲在觀察屋裡，鳥不會飛走（Threads 回饋：宣傳文寫了「躲在賞鳥屋裡鳥不會跑」，以前觀察屋只是一棟房子）。
// 觀察屋 6×3.2 m、正面朝 look；玩家在屋裡（各邊多 0.4 m，含門口）＝鳥看不到人，不會警戒
const inHide = (P) => HIDES.some((h) => { const a = Math.atan2(h.look[0] - h.x, h.look[1] - h.z), dx = P.x - h.x, dz = P.z - h.z, lz = dx * Math.sin(a) + dz * Math.cos(a), lx = dx * Math.cos(a) - dz * Math.sin(a); return Math.abs(lx) < h.w / 2 + 0.4 && Math.abs(lz) < h.d / 2 + 0.4 })
import { terrainHeight as gardenH, domeRho, domeY, mtnBase, MTN, inAlpine, alpineHeight, ALP_RIVER, colliders } from '../layout.js'
// 地面高度：山區查山區的地形（不然鳥會飛進山坡裡）
const terrainHeight = (x, z) => inAlpine(x, z) ? alpineHeight(x, z) : gardenH(x, z)

const { clamp, lerp, smoothstep: ss, randFloat: rnd } = THREE.MathUtils
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z)
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a))
const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt))

// 每種鳥：r 驚飛距離（公尺，走路靠近時）；fly 飛行（speed 公尺/秒、hz 拍翅頻率、style：flap 一直拍、bound 拍幾下收翅滑一段（雀類波浪飛）、glide 慢拍＋長滑翔（鷺）、
// （2026-11-09 新加的 14 隻：k ＝ 站姿模型的身長 × 真實的翼展／身長比，例如八色鳥 2、鴨 1.5、雉 1.1）
// k 飛行模型縮放（tools/fly-points.py 擺正後翼展約 1；和停棲模型並排比頭的大小定的），名稱照 models/birds/<id>-fly-rig.glb）；run 用跑的（速度倍數）；swim 游開
export const ESCAPE = {
  sparrow: { r: 5, fly: { speed: 8, hz: 13, style: 'bound', k: 0.58 } },
  whiteeye: { r: 5, fly: { speed: 7, hz: 14, style: 'bound', k: 0.8 } },
  bulbul: { r: 6, fly: { speed: 8, hz: 11, style: 'bound', k: 0.78 } },
  blackbulbul: { r: 6, fly: { speed: 8, hz: 11, style: 'bound', k: 0.88 } },
  barbet: { r: 7, excavate: [35, 75], fly: { speed: 8, hz: 10, style: 'bound', k: 1.1 } },   // excavate：每隔幾秒飛去枯木的樹洞鑿洞／餵雛（world.js __barbetNest）
  dove: { r: 6, display: true, fly: { speed: 10, hz: 8, style: 'flap', k: 1.15 } },   // display：求偶展示飛行（birds.js doveShow 打開 obj.userData.displayFlight）
  treepie: { r: 8, fly: { speed: 8, hz: 7, style: 'glide', k: 1.2 } },
  bluemagpie: { r: 9, fly: { speed: 8, hz: 6, style: 'glide', k: 1.35 } },
  kingfisher: { r: 10, fly: { speed: 11, hz: 12, style: 'flap', k: 0.82 } },
  egret: { r: 11, fly: { speed: 7, hz: 3.2, style: 'glide', k: 2.2 } },
  nightheron: { r: 9, fly: { speed: 7, hz: 3.5, style: 'glide', k: 1.9 } },
  heron: { r: 6, fly: { speed: 6, hz: 3.2, style: 'glide', k: 1.95 } },   // 黑冠麻鷺出了名的不怕人
  spoonbill: { r: 12, fly: { speed: 7, hz: 3, style: 'glide', k: 2.3 } },
  thrush: { r: 7, fly: { speed: 9, hz: 9, style: 'flap', k: 0.95 } },
  oriole: { r: 8, fly: { speed: 9, hz: 8, style: 'bound', k: 1.07 } },
  mikado: { r: 8, run: 7, fly: { speed: 9, hz: 9, style: 'glide', k: 1.49 } },   // 2026-11-09 雉類：平常用跑的，被逼急才「噗嚕嚕」快拍幾下滑到樹上
  pheasant: { r: 8, run: 7, fly: { speed: 9, hz: 9, style: 'glide', k: 1.18 } },
  babbler: { r: 5, run: 5, fly: { speed: 6, hz: 11, style: 'flap', k: 0.556 } },
  // 高山區 8 種（2026-11-07 飛行模型；k ≈ 停棲模型縮放 × 1.8，翼展約是身長的 1.6～1.8 倍）
  flamecrest: { r: 5, fly: { speed: 7, hz: 15, style: 'bound', k: 0.47 } },
  yuhina: { r: 5, fly: { speed: 7, hz: 14, style: 'bound', k: 0.54 } },
  yellowtit: { r: 6, fly: { speed: 7, hz: 13, style: 'bound', k: 0.65 } },
  niltava: { r: 7, fly: { speed: 8, hz: 11, style: 'flap', k: 0.8 } },
  sibia: { r: 7, fly: { speed: 8, hz: 9, style: 'bound', k: 1.0 } },
  goshawk: { r: 12, fly: { speed: 11, hz: 5, style: 'glide', k: 0.85 } },   // 2026-11-08 猛禽：翼展約 85 公分、拍幾下就滑翔
  serpenteagle: { r: 0, fly: { speed: 12, hz: 3.2, style: 'glide', k: 2.3 } },   // 2026-11-14 使用者：老鷹知道人碰不到牠，靠近也不飛（r 0＝不會被驚動）。2026-11-12 大冠鷲：翼展約 1.6 公尺，拍幾下就張著翅膀滑翔
  woodowl: { r: 8, fly: { speed: 7, hz: 3.5, style: 'glide', k: 0.95 } },   // 褐林鴞翼展約 1 公尺，飛得慢、很安靜
  bushrobin: { r: 4, fly: { speed: 7, hz: 13, style: 'flap', k: 0.47 } },   // 不太怕人
  rosefinch: { r: 6, fly: { speed: 8, hz: 12, style: 'bound', k: 0.49 } },
  laughingthrush: { r: 3.5, run: 5, fly: { speed: 6, hz: 10, style: 'flap', k: 0.509 } },                                   // 出了名的親人，靠太近才跑開
  moorhen: { r: 9, swim: 5, fly: { speed: 7, hz: 7, style: 'flap', k: 1.12 } },   // 秧雞飛的時候腳拖在後面（飛行模型照這樣畫的）
  mandarin: { r: 12, swim: 5, fly: { speed: 12, hz: 6, style: 'flap', k: 0.773 } },      // 2026-11-09：鴛鴦很怕人
  spotbill: { r: 10, swim: 5, fly: { speed: 12, hz: 5.5, style: 'flap', k: 1.0 } },
  partridge: { r: 7, run: 6, fly: { speed: 8, hz: 14, style: 'glide', k: 0.412 } },       // 林下三五成群，受驚快步跑進灌叢，逼急了才飛
  pitta: { r: 7, run: 5, fly: { speed: 7, hz: 11, style: 'flap', k: 0.43 } },
  shelduck: { r: 12, swim: 5, fly: { speed: 12, hz: 5, style: 'flap', k: 1.2 } },
  pheron: { r: 12, fly: { speed: 7, hz: 3, style: 'glide', k: 2.2 } },
  stilt: { r: 9, fly: { speed: 9, hz: 6, style: 'flap', k: 0.95 } },
  harrier: { r: 14, fly: { speed: 9, hz: 3.5, style: 'glide', k: 1.35 } },
  // 2026-11-11 世界濕地鳥：飛行模型補上了（使用者：只有一隻會飛）。都是先走開／游開，被逼近才起飛（跟雉類同一套）；
  // k＝翼展（公尺）× 遊戲放大 ÷ 模型翼展。飛行姿勢照各自的習性畫：鶴、紅鶴、琵鷺脖子和腳都伸直；鯨頭鸛像鷺一樣縮脖子；水雉、紫水雞、鸊鷉腳拖在後面
  shoebill: { r: 5, run: 2, fly: { speed: 7, hz: 2.4, style: 'glide', k: 2.8 } },
  flamingo: { r: 9, run: 2.2, fly: { speed: 10, hz: 4.2, style: 'flap', k: 2.0 } },
  ajacana: { r: 4, run: 3, fly: { speed: 7, hz: 7, style: 'flap', k: 0.8 } },
  gallinule: { r: 4, run: 3, fly: { speed: 7, hz: 7, style: 'flap', k: 0.82 } },
  rspoonbill: { r: 7, run: 2.5, fly: { speed: 8, hz: 3.4, style: 'glide', k: 2.0 } },
  sarus: { r: 9, run: 2, fly: { speed: 9, hz: 2.4, style: 'flap', k: 3.0 } },
  redcrowned: { r: 9, run: 2, fly: { speed: 9, hz: 2.5, style: 'flap', k: 2.9 } },
  ruff: { r: 5, run: 3, fly: { speed: 12, hz: 8, style: 'flap', k: 0.87 } },
  lapwing: { r: 6, run: 3, fly: { speed: 10, hz: 5, style: 'flap', k: 0.87 } },   // 2026-11-13 小辮鴴：先跑開；2026-11-15 飛行模型做好了（寬圓的翅膀、慢拍）
  grebe: { r: 9, swim: 4, fly: { speed: 11, hz: 9, style: 'flap', k: 1.25 } },
  // 2026-11-13 Pass 1D：遊隼巡航快、拍幾下就滑；黑雨燕又快又急（離步道 4～5 m 高，靠很近才飛）；烏林鴞慢、低、安靜
  peregrine: { r: 5,   /* 2026-11-15 使用者「81 完全沒看到」：驚飛 16 m，岩架離步道才 6～10 m → 走到上層岩廊就飛走、29 m 外才回來，永遠看不到。高高的岩架上、人在底下走，5 m 才飛 */ fly: { speed: 15, hz: 4.5, style: 'glide', k: 1.05 } },
  blackswift: { r: 2.5, sortie: [45, 100], colony: { loop: [[203.5, 34.5, 95], [199, 32, 90.5], [193, 31.5, 86], [186.5, 33, 79], [189, 35, 70.5], [199, 36, 66.5], [209, 34.5, 70], [212, 32, 78], [208, 31.5, 85.5]] }, fly: { speed: 14, hz: 8, style: 'glide', k: 0.48 } },   // 2026-11-15 使用者「黑雨燕會一直穿梭在瀑布飛嗎」→ 真的雨燕白天在空中覓食、穿過水簾回巢：沒人打擾也每 45～100 秒自己出去一趟（sortie）
  greatgreyowl: { r: 10, fly: { speed: 6, hz: 2.8, style: 'glide', k: 1.45 } },
  wbwood: { r: 8, fly: { speed: 8, hz: 9, style: 'bound', k: 0.42 } },
  nutcracker: { r: 10, fly: { speed: 9, hz: 5, style: 'glide', k: 0.55 } },
  rnpheasant: { r: 7, run: 3, fly: { speed: 9, hz: 10, style: 'flap', k: 1.2 } },
  skylark: { r: 5, fly: { speed: 7, hz: 9, style: 'flap', k: 0.42 } },
  cisticola: { r: 4, fly: { speed: 6, hz: 12, style: 'bound', k: 0.3 } },
  woodcock: { r: 4, fly: { speed: 7, hz: 9, style: 'flap', k: 0.55 } },   // 2026-11-10 山鷸：不太怕人，靠很近才「咻咻」飛起
  jacana: { r: 7, fly: { speed: 7, hz: 5, style: 'glide', k: 0.58 } },   // 2026-11-10 水雉：翅膀幾乎全白，飛起來長腳往後伸
  psnipe: { r: 5, run: 4, fly: { speed: 7, hz: 7, style: 'flap', k: 0.45 } },
  scopsowl: { r: 5, fly: { speed: 7, hz: 5, style: 'glide', k: 0.43 } },   // 2026-11-09 領角鴞：不太怕人，翅膀寬圓、飛得慢又安靜
  mtscops: { r: 5, fly: { speed: 6.5, hz: 6, style: 'glide', k: 0.35 } },
  grassowl: { r: 6, run: 3, fly: { speed: 6, hz: 3.5, style: 'glide', k: 1.01 } },
  nuthatch: { r: 5, fly: { speed: 7, hz: 14, style: 'bound', k: 0.26 } },
  finchbill: { r: 6, fly: { speed: 8, hz: 11, style: 'bound', k: 0.368 } },
  minivet: { r: 7, fly: { speed: 8, hz: 10, style: 'flap', k: 0.294 } },
  waterhen: { r: 9, swim: 5, fly: { speed: 7, hz: 7, style: 'flap', k: 1.07 } },
  // 2026-11-09 台灣特有種 17 種（k ≈ 停棲模型縮放 × 1.5）
  liocichla: { r: 4, fly: { speed: 7, hz: 12, style: 'flap', k: 0.506 } },   // 很親人
  whitebrow: { r: 5, fly: { speed: 7, hz: 13, style: 'flap', k: 0.413 } },
  bullfinch: { r: 5, fly: { speed: 8, hz: 11, style: 'bound', k: 0.484 } },   // 動作慢、不太怕人
  barwing: { r: 6, fly: { speed: 7, hz: 11, style: 'flap', k: 0.508 } },
  islandthrush: { r: 10, fly: { speed: 10, hz: 9, style: 'flap', k: 0.553 } },   // 非常警覺
  tit: { r: 6, fly: { speed: 7, hz: 14, style: 'bound', k: 0.415 } },
  rustylt: { r: 8, run: 5, fly: { speed: 7, hz: 10, style: 'flap', k: 0.677 } },   // 害羞，先跑進灌叢
  whitethroat: { r: 7, run: 5, fly: { speed: 7, hz: 10, style: 'flap', k: 0.629 } },
  hwamei: { r: 8, run: 5, fly: { speed: 7, hz: 10, style: 'flap', k: 0.597 } },
  styan: { r: 7, fly: { speed: 9, hz: 9, style: 'bound', k: 0.518 } },
  scimitar: { r: 7, run: 5, fly: { speed: 7, hz: 10, style: 'flap', k: 0.654 } },
  fulvetta: { r: 5, fly: { speed: 7, hz: 14, style: 'bound', k: 0.437 } },
  bamboo: { r: 7, run: 6, fly: { speed: 8, hz: 14, style: 'glide', k: 0.515 } },   // 受驚先快跑，逼急了才飛
  flowing: { r: 5, fly: { speed: 7, hz: 15, style: 'bound', k: 0.446 } },
  bushwarbler: { r: 6, run: 4, fly: { speed: 6, hz: 14, style: 'flap', k: 0.447 } },   // 很會躲
  cupwing: { r: 5, run: 4, fly: { speed: 5, hz: 16, style: 'flap', k: 0.254 } },
  shortwing: { r: 7, run: 4, fly: { speed: 6, hz: 14, style: 'flap', k: 0.290 } },   // 翅膀短，不太愛飛
  // 2026-11-15 溪鳥：river＝貼著溪面（0.5～0.9 m）沿河道飛走、再沿河道飛回來，不飛上樹
  dipper: { r: 5, river: true, fly: { speed: 9, hz: 14, style: 'flap', k: 0.5 } },
  forktail: { r: 4, river: true, fly: { speed: 7, hz: 15, style: 'bound', k: 0.34 } },
  redstart: { r: 5, fly: { speed: 7, hz: 14, style: 'flap', k: 0.37 } },   // 2026-11-15 瀑布湖
  harlequin: { r: 10, swim: 5, fly: { speed: 12, hz: 7, style: 'flap', k: 0.69 } },
  // 2026-11-15 使用者指定四種。hover：自己出去時在草原上空定點懸停，再收翅俯衝；hawk：飛出去繞一圈抓飛蟲／撲地上的蟲，馬上回原位
  avocet: { r: 10, fly: { speed: 10, hz: 5, style: 'flap', k: 1.0 } },
  pelican: { r: 12, swim: 3, fly: { speed: 9, hz: 2.2, style: 'glide', k: 3.3 } },   // 2026-11-16 白鵜鶘：先游開，逼近才起飛（大鳥、慢拍翅＋滑翔）
  cormorant: { r: 9, hawk: true, sortie: [40, 90], fly: { speed: 12, hz: 5, style: 'flap', k: 1.9 } },   // 鸕鷀：石頭上晾翅，偶爾飛出去繞一圈再回來
  smew: { r: 10, swim: 4, fly: { speed: 12, hz: 9, style: 'flap', k: 1.05 } }, fduck: { r: 10, swim: 4, fly: { speed: 12, hz: 9, style: 'flap', k: 1.07 } },   // 2026-11-16 潛鴨：先游開、逼近才飛
  cegret: { r: 10, fly: { speed: 8, hz: 3.5, style: 'flap', k: 1.3 } },
  // 2026-11-17 使用者「非洲都沒鳥」：這五種站的地方離步道 9～12 m，以前驚飛距離 11～13 m → 走在步道上就把牠們全部嚇跑（跑步經過更是直接飛走）。
  // 改成步道上走路不會驚動（r 7～8）；離開步道走進草原靠近才會跑、再靠近才飛
  sbstork: { r: 8, run: 2, fly: { speed: 8, hz: 1.8, style: 'glide', k: 2.8 } },   // 2026-11-17 三角洲四種
  bccrane: { r: 7.5, run: 2, fly: { speed: 9, hz: 2.4, style: 'flap', k: 1.95 } },
  ahoopoe: { r: 5, fly: { speed: 7, hz: 6, style: 'flap', k: 0.4 } },
  yhornbill: { r: 5.5, nest: [30, 70], fly: { speed: 6, hz: 5, style: 'flap', k: 0.66 } },   // nest：每隔幾秒飛去樹洞餵食一次（savanna.js savNest）
  secretarybird: { r: 8, run: 3, fly: { speed: 8, hz: 1.8, style: 'glide', k: 2.6 } },   // 2026-11-16 蛇鷲：先跑開（很會跑），逼近才起飛滑翔
  burrowowl: { r: 8, run: 5, burrow: true, fly: { speed: 8, hz: 7, style: 'flap', k: 0.6 } },   // 2026-11-16 穴鴞：人靠近先跑回洞裡躲（birds.js burrowowl 的 w.flee）；還在洞外又被逼到很近才飛
  pratincole: { r: 7, hawk: true, sortie: [20, 45], fly: { speed: 10, hz: 6, style: 'glide', k: 0.62 } },
  bwkite: { r: 9, hover: true, sortie: [35, 80], fly: { speed: 9, hz: 5, style: 'glide', k: 0.9 } },
  shrike: { r: 7, hawk: true, sortie: [25, 60], fly: { speed: 7, hz: 11, style: 'bound', k: 0.45 } },
}
// 飛行模型（存在才用；還沒做好的先借翠鳥的飛行模型，大小照停棲模型的身高換算）
const FLY_NAME = (id) => `${id}-fly-rig`
export const flyModels = () => Object.keys(ESCAPE).filter((id) => ESCAPE[id].fly?.k && id !== 'kingfisher').map(FLY_NAME)   // 沒有 k 的還沒做飛行模型，不去載

const _v = V(), _w = V(), _box = new THREE.Box3(), _q = new THREE.Quaternion()

// 一隻飛行中的鳥：外層 root 管位置和航向（YXZ：先轉航向、再俯仰、最後側傾），inner 讓 Tripo 模型（頭朝 -x）頭朝 +z
function makeFlier(id, perchH) {
  const own = hasModel(FLY_NAME(id)), r = rigged(own ? FLY_NAME(id) : 'kingfisher-fly-rig')
  const root = new THREE.Group(), inner = new THREE.Group()
  root.rotation.order = 'YXZ'
  inner.rotation.y = Math.PI / 2
  inner.add(r.model); root.add(inner)
  // Tripo 的白色、灰色羽毛貼圖帶半透明（小白鷺、夜鷺會變成半透明），一律畫成不透明
  r.model.traverse((o) => { if (o.isMesh) { o.material.transparent = false; o.material.opacity = 1; o.material.depthWrite = true } })
  // 縮放：有自己的飛行模型用表裡的 k；借用的先用停棲模型高度粗估（之後用 tools/compare-scale.py 對齊）
  r.model.updateMatrixWorld(true)
  _box.setFromObject(r.model)
  const size = _box.getSize(V()), c = _box.getCenter(V())
  const k = ESCAPE[id].fly.k ?? (perchH * 2.2) / Math.max(size.x, size.z)
  r.model.scale.setScalar(k)
  r.model.position.copy(c).multiplyScalar(-k)   // 身體中心在原點
  root.visible = false
  return { root, r }
}

// 從鳥（一群就是每一隻）找出 { obj, acts, hopper, walker }，把牠的 update 包起來：飛走的時候凍結原本的動畫
function membersOf(b) { return b.built.birds ?? [b.built] }

export function createFlight(world, player) {
  const { scene } = world
  const units = []   // 一個站點一組
  // 2026-11-11 串流載入：模型還沒載到的鳥（b.pending）先跳過，載到後 main.js 再呼叫 flight.add(b)
  /* ---------- 2026-11-15 黑雨燕一小群（使用者「3 個巢，至少 1 隻一直在瀑布底下和湖上飛，另外兩隻隨機飛或停在巢上」）----------
     第 82 號那隻本身照舊（巢裡坐著、每 45～100 秒自己出去一趟）；另外兩隻是同一筆圖鑑的成員（拍到一樣算黑雨燕）：
     A：一直沿一圈路線飛（湖上 → 瀑布前 → 鑽進水簾後面的凹洞 → 出來），巢是空的；B：在第三個巢坐 25～70 秒，出去跟著繞 1～3 圈再回巢 */
  const colonies = []
  function addColony(b, esc) {
    const main = membersOf(b)[0]
    main.obj.updateMatrixWorld(true); b.group?.updateMatrixWorld(true)
    const P0 = main.obj.getWorldPosition(V()), Q0 = main.obj.getWorldQuaternion(new THREE.Quaternion()), S0 = main.obj.getWorldScale(V())
    const base = b.group ? b.group.getWorldPosition(V()) : b.target.clone(), off = P0.clone().sub(base)
    _box.setFromObject(main.obj); const perchH = _box.getSize(_v).y
    const L = esc.colony.loop.map(([x, y, z]) => V(x, y, z)), loop = new THREE.CatmullRomCurve3(L, true, 'centripetal'), len = loop.getLength()
    const mk = (k) => {
      const spot = b.def.colonySpots[k], f = makeFlier(b.def.id, perchH); scene.add(f.root)
      const sit = skClone(main.obj); sit.traverse((o) => { o.visible = true; o.frustumCulled = false }); sit.position.copy(V(spot.x, spot.y, spot.z).add(off)); sit.quaternion.copy(Q0); sit.scale.copy(S0); scene.add(sit)
      const c = { b, f: esc.fly, root: f.root, r: f.r, sit, spot: V(spot.x, spot.y + 0.05, spot.z), head: 0, roll: 0, pitch: 0, phase: Math.random() * 6, t: 0 }
      const mem = { get obj() { return c.mode === 'nest' ? c.sit : c.root }, acts: { get name() { return c.mode === 'nest' ? 'stand' : 'fly' } } }
      return { c, mem }
    }
    const A = mk(1), B = mk(0)
    A.c.mode = 'loop'; A.c.u = Math.random(); A.c.sit.visible = false; A.c.alt = 0
    B.c.mode = 'nest'; B.c.wait = 8 + Math.random() * 30; B.c.alt = 1.2; B.c.root.visible = false
    b.built.birds = [main, A.mem, B.mem]   // 拍照、對焦、出現／不在都把這兩隻算進黑雨燕
    colonies.push({ b, loop, len, list: [A.c, B.c] })
  }
  const _cq = V(), _ct = V()
  function colonyTick(t, dt) {
    for (const C of colonies) {
      const off = C.b.absent
      for (const c of C.list) {
        if (off) { c.root.visible = false; c.sit.visible = false; continue }
        c.t += dt
        if (c.mode === 'nest') {
          c.sit.visible = true; c.root.visible = false
          if ((c.wait -= dt) <= 0) {   // 出巢：從巢接到圈上最近的那一點前面一段
            let best = 0, bd = 1e9; for (let i = 0; i < 40; i++) { const p = C.loop.getPointAt(i / 40); const d = p.distanceTo(c.spot); if (d < bd) { bd = d; best = i / 40 } }
            c.u = (best + 0.08) % 1; const E = C.loop.getPointAt(c.u), dir = C.loop.getTangentAt(c.u)
            c.curve = new THREE.CubicBezierCurve3(c.spot.clone(), c.spot.clone().add(V(0, 0.6, -1.5)), E.clone().addScaledVector(dir, -4), E); c.len = c.curve.getLength(); c.dist = 0
            c.mode = 'out'; c.laps = 1 + Math.floor(Math.random() * 3); c.t = 0
          }
          continue
        }
        c.sit.visible = false; c.root.visible = true
        const sp = c.f.speed * (c.mode === 'back' ? THREE.MathUtils.clamp((c.len - c.dist) / 5, 0.15, 1) : c.mode === 'out' ? Math.min(1, 0.35 + c.t / 1.2) : 0.8)
        if (c.mode === 'loop') {
          const du = sp * dt / C.len, before = c.u; c.u = (c.u + du) % 1
          if (c.laps != null && c.u < before && --c.laps <= 0) {   // 繞完：從這一點回巢
            const S = C.loop.getPointAt(c.u), dir = C.loop.getTangentAt(c.u)
            c.curve = new THREE.CubicBezierCurve3(S, S.clone().addScaledVector(dir, 5), c.spot.clone().add(V(0, 0.8, -2.2)), c.spot.clone()); c.len = c.curve.getLength(); c.dist = 0; c.mode = 'back'
          } else { C.loop.getPointAt(c.u, _cq); _cq.y += c.alt; C.loop.getTangentAt(c.u, _ct) }
        }
        if (c.mode === 'out' || c.mode === 'back') {
          c.dist = Math.min(c.len, c.dist + sp * dt); const k = c.dist / c.len
          c.curve.getPointAt(k, _cq); c.curve.getTangentAt(Math.min(k, 0.999), _ct)
          if (c.dist >= c.len) { if (c.mode === 'out') { c.mode = 'loop'; c.t = 0 } else { c.mode = 'nest'; c.wait = 25 + Math.random() * 45; c.laps = null; continue } }
        }
        c.root.position.copy(_cq)
        const h = Math.atan2(_ct.x, _ct.z), dh = wrap(h - c.head)
        c.head += dh * (1 - Math.exp(-7 * dt)); c.roll = damp(c.roll, clamp(-dh * 2.6, -0.8, 0.8), 4, dt)
        c.pitch = damp(c.pitch, -Math.asin(clamp(_ct.y, -1, 1)) * 0.7, 6, dt)
        c.root.rotation.set(c.pitch, c.head, c.roll)
        const flare = c.mode === 'back' ? ss(1 - (c.len - c.dist) / 3, 0, 1) : 0
        wings(c, c.f, t, dt, c.mode === 'out' ? 1 - ss(c.t, 0.3, 1.4) : 0, flare)
      }
    }
  }
  function addUnit(b) {
    const esc = ESCAPE[b.def.id]
    if (!esc || b.pending || units.some((u) => u.b === b)) return
    const ms = membersOf(b).map((m) => {
      const s = { m, mode: 'perch', home: V(), from: V(), curve: null, len: 0, dist: 0, t: 0, wait: 0, delay: 0, head: 0, roll: 0, pitch: 0, phase: Math.random() * 6, act: '' }
      if (esc.fly) {
        m.obj.updateMatrixWorld(true)
        _box.setFromObject(m.obj)
        const f = makeFlier(b.def.id, _box.getSize(_v).y)
        scene.add(f.root)
        Object.assign(s, f)
      }
      // 原本的 update：perch 以外都不跑（停在原地、不再動）
      const orig = m.update
      m.update = (t, dt) => { if (s.mode === 'perch' || s.mode === 'flee') orig(t, dt) }
      m.flight = s
      return s
    })
    units.push({ b, esc, ms, alarm: 0, calm: 0, state: 'home', home: b.target.clone(), base: { ...b.def } })
    if (esc.colony && b.def.colonySpots?.length) addColony(b, esc)
  }
  for (const b of world.birds) addUnit(b)

  // 玩家速度（用鏡頭位置差算）、蹲低
  const last = V().copy(world.camera.position)
  let speed = 0

  /* ---------- 飛行路線 ---------- */
  // 飛到遠處的避難點：往背離玩家的方向（左右亂偏一點），30～45 公尺外、離地 9～14 公尺；不能穿過山、不能出溫室
  const blockedPath = (curve) => {
    for (let i = 1; i <= 24; i++) {
      const p = curve.getPoint(i / 24)
      const rh = Math.hypot(p.x - MTN.x, p.z - MTN.z)
      if (p.y < MTN.h + 4 && rh < mtnBase(Math.max(0, p.y)) + 5) return true
      if (domeRho(p.x, p.z) > 0.9 || p.y > domeY(p.x, p.z) - 3) return true
      if (p.y < terrainHeight(p.x, p.z) + 0.3 && i > 3 && i < 21) return true
    }
    return false
  }
  // short：地上的鳥被逼到很近才起飛，只飛一小段（10～18 公尺）到旁邊的樹上（離地 4～8 公尺）躲著
  function outbound(S, away, flock, short = false) {
    for (let i = 0; i < 60; i++) {
      const a = Math.atan2(away.x, away.z) + rnd(-0.6, 0.6) * (1 + i / 20)
      const d = V(Math.sin(a), 0, Math.cos(a)), dist = short ? rnd(10, 18) : rnd(30, 45)
      const F = flock?.F.clone() ?? S.clone().addScaledVector(d, dist)
      if (!flock) F.y = short ? terrainHeight(F.x, F.z) + rnd(4, 8) : Math.max(terrainHeight(F.x, F.z) + rnd(9, 14), S.y + 5)
      else F.add(V(rnd(-1.5, 1.5), rnd(-1, 1), rnd(-1.5, 1.5)))
      const dir = F.clone().sub(S).setY(0).normalize()
      const curve = new THREE.CubicBezierCurve3(S.clone(), S.clone().addScaledVector(dir, 2.5).add(V(0, 3, 0)), F.clone().addScaledVector(dir, short ? -4 : -10), F)
      if (!blockedPath(curve)) return curve
      if (flock) flock = null
    }
    // 找不到：往上飛
    return new THREE.CubicBezierCurve3(S.clone(), S.clone().add(V(0, 3, 0)), S.clone().add(V(0, 9, 0)), S.clone().add(V(0, 12, 0)))
  }
  // 2026-11-15 溪鳥（河烏、小剪尾）：沿著 ALP_RIVER 往背離玩家的方向貼著水面飛 18～26 m，跟著河道轉彎；回程沿同一條路倒回來
  const riverPt = (s, h) => {
    const R = ALP_RIVER, i = clamp(R.S.findIndex((v) => v > s) - 1, 0, R.length - 2), t = clamp((s - R.S[i]) / (R.S[i + 1] - R.S[i]), 0, 1)
    return V(lerp(R[i][0], R[i + 1][0], t), R.water(s) + h, lerp(R[i][1], R[i + 1][1], t))
  }
  function riverOut(S, away) {
    const R = ALP_RIVER, s0 = R.sAt(S.x, S.z), tg = riverPt(s0 + 1, 0).sub(riverPt(s0 - 1, 0))
    let dir = tg.x * away.x + tg.z * away.z >= 0 ? 1 : -1
    const L = rnd(18, 26)
    if (s0 + dir * L > R.len - 6 || s0 + dir * L < 2) dir = -dir
    const pts = [S.clone()]
    for (let d = 3; d <= L; d += 3) pts.push(riverPt(s0 + dir * d, 0.55 + 0.35 * Math.sin(d * 0.4)))
    const curve = new THREE.CatmullRomCurve3(pts); curve.v3 = pts.at(-1).clone(); curve.river = pts
    return curve
  }
  // 回家：從避難點飛回來，最後從斜上方、正前方滑進原本的位置
  function inbound(F, S, faceH, out) {
    if (out?.river) { const pts = out.river.slice().reverse(); pts[pts.length - 1] = S.clone(); const c = new THREE.CatmullRomCurve3(pts); c.v3 = pts.at(-1); c.river = out.river; return c }
    const fwd = V(Math.sin(faceH), 0, Math.cos(faceH))
    const dir = S.clone().sub(F).setY(0).normalize()
    // 從鳥原本面對的方向的反方向進場（落地後剛好面向原本的方向），但不要從玩家身上穿過去
    const app = fwd.clone().multiplyScalar(0.5).add(dir).normalize()
    return new THREE.CubicBezierCurve3(F.clone(), F.clone().addScaledVector(dir, 10), S.clone().addScaledVector(app, -4).add(V(0, 2.2, 0)), S.clone())
  }

  /* ---------- 驚飛 ---------- */
  function flush(u, t, short = false) {
    u.state = 'away'
    const P = world.camera.position
    if (u.esc.fly) {
      for (const s of u.ms) restoreWalker(s)   // 剛剛在跑：起飛前把走路速度還原（落地後照平常走）
      let flock = null
      u.ms.forEach((s, i) => {
        const m = s.m
        m.obj.updateMatrixWorld(true)
        _box.setFromObject(m.obj)
        _box.getCenter(s.home)
        m.obj.getWorldDirection(_w); s.faceH = Math.atan2(_w.x, _w.z)
        // 2026-11-13 Pass 1D：岩壁上的鳥（def.flyAway）照岩面朝外的方向飛出去——不然背離玩家的方向可能是往岩壁裡飛（黑雨燕從凹洞橫著穿進岩體）
        const away = u.b.def.flyAway ? V(u.b.def.flyAway[0], 0, u.b.def.flyAway[1]) : s.home.clone().sub(P).setY(0)
        if (away.lengthSq() < 1e-4) away.set(1, 0, 0)
        s.curve = u.esc.river ? riverOut(s.home, away.normalize()) : outbound(s.home, away.normalize(), flock, short)
        flock ??= { F: s.curve.v3 }
        s.len = s.curve.getLength(); s.dist = 0; s.t = 0
        s.delay = i === 0 ? 0 : rnd(0.05, 0.45)   // 一群裡第一隻先飛，其他跟著
        s.mode = 'wait'; s.head = s.faceH
        s.wait = short ? rnd(12, 25) : rnd(20, 38)
      })
    } else {
      u.ms.forEach((s) => fleeOnGround(u, s))
    }
  }
  const restoreWalker = (s) => { const w = s.m.walker; if (w && s.mode === 'flee') { w.speed = s.speed0; w.turn = s.turn0; s.mode = 'perch'; s.act = '' } }
  // 跑或游開：目的地在背離玩家的方向 2～3 公尺（游泳的要在開闊水面）；會飛的地上鳥沒有 run/swim 就用跳的（走路速度 2.5 倍）
  function fleeOnGround(u, s) {
    const m = s.m, w = m.walker
    if (!w) return
    if (s.mode !== 'flee') { s.speed0 = w.speed; s.turn0 = w.turn; s.radius0 = w.radius }
    s.mode = 'flee'
    w.speed = s.speed0 * (u.esc.run ?? u.esc.swim ?? 2.5); w.turn = 7
    if (u.esc.burrow) { w.flee = true; if (!w.inBurrow && w.home) { w.goal = new THREE.Vector2(...w.home); w.want = null; m.acts.next('walk') } return }   // 穴鴞：跑回洞口（鑽進去由 birds.js 接手）
    const g = u.b.group.position, P = world.camera.position
    const a0 = Math.atan2(g.x + w.p.x - P.x, g.z + w.p.y - P.z)
    m.acts.next('walk')
    for (let i = 0; i < 24; i++) {
      const a = a0 + (i % 2 ? 1 : -1) * Math.floor((i + 1) / 2) * 0.35
      const d = rnd(2.2, 3.2)
      let x = w.p.x + Math.sin(a) * d, z = w.p.y + Math.cos(a) * d
      const rr = Math.hypot(x - w.center[0], z - w.center[1]), lim = s.radius0 * 2.2 + 1
      if (rr > lim) { x = w.center[0] + (x - w.center[0]) * lim / rr; z = w.center[1] + (z - w.center[1]) * lim / rr }
      if (w.avoid?.(x, z, w.p)) continue
      w.goal = new THREE.Vector2(x, z); w.want = null
      return
    }
  }

  /* ---------- 每格 ---------- */
  function flyStep(u, s, t, dt) {
    const f = u.esc.fly, root = s.root
    if (s.mode === 'wait') {
      if ((s.delay -= dt) > 0) return
      // 起飛：停棲的模型藏起來、換飛行模型
      s.m.obj.visible = false; root.visible = true
      root.position.copy(s.home); s.mode = 'out'; s.t = 0
    }
    if (s.mode === 'away') {
      if (u.leaving) return   // 時段到了飛走（presence.js）：不回來
      s.wait -= dt
      const far = world.camera.position.distanceTo(s.home) > u.esc.r * (u.trip ? 1.0 : 1.8)   // 自己出去覓食的（sortie）：玩家在旁邊看也照樣回巢，只要不貼在巢前 5 m 內
      if (s.wait <= 0 && far) {
        s.curve = inbound(s.curve.v3, s.home, s.faceH, s.curve); s.len = s.curve.getLength(); s.dist = 0; s.t = 0
        s.mode = 'back'; root.visible = true
      }
      return
    }
    // 2026-11-15 黑翅鳶：懸停（翅膀快拍、身體幾乎不動、頭朝下看）→ 俯衝（收翅往下）→ 貼地抓一下再飛回枝頭
    if (s.mode === 'hover') {
      s.t += dt; s.ht -= dt
      root.position.copy(s.hp); root.position.y += 0.06 * Math.sin(s.t * 3.1); root.position.x += 0.04 * Math.sin(s.t * 1.7)
      root.rotation.set(-0.45, s.head, 0.05 * Math.sin(s.t * 2.3)); s.act = 'hover'
      wings(s, f, t, dt, 0.9, 0)
      if (s.ht <= 0) { s.mode = 'swoop'; s.gy = terrainHeight(root.position.x, root.position.z) + 0.3 }
      return
    }
    if (s.mode === 'swoop') {
      s.t += dt; root.position.y -= 7 * dt; root.rotation.set(0.85, s.head, 0); s.act = 'swoop'
      wings(s, f, t, dt, 0, 1)
      if (root.position.y <= s.gy) {
        root.position.y = s.gy
        s.curve = inbound(root.position.clone(), s.home, s.faceH); s.len = s.curve.getLength(); s.dist = 0; s.t = 0; s.mode = 'back'
      }
      return
    }
    s.t += dt
    const rem = s.len - s.dist
    // 速度：起飛慢慢加速；回程最後幾公尺減速、拉起機頭（煞車）
    const v = s.mode === 'out' ? f.speed * Math.min(1, 0.3 + s.t / 1.2) : f.speed * clamp(rem / 6, 0.12, 1)
    s.dist = Math.min(s.len, s.dist + v * dt)
    const k = s.dist / s.len
    s.curve.getPointAt(k, root.position)
    s.curve.getTangentAt(Math.min(k, 0.999), _v)
    const h = Math.atan2(_v.x, _v.z)
    const dh = wrap(h - s.head)
    s.head += dh * (1 - Math.exp(-6 * dt))
    s.roll = damp(s.roll, clamp(-dh * 2.2, -0.7, 0.7), 4, dt)
    const flare = s.mode === 'back' ? ss(1 - rem / 3, 0, 1) : 0
    s.pitch = damp(s.pitch, -Math.asin(clamp(_v.y, -1, 1)) * 0.7 - 0.7 * flare, 6, dt)
    root.rotation.set(s.pitch, s.head, s.roll)
    s.act = s.mode === 'out' && s.t < 1.2 ? 'takeoff' : flare > 0.05 ? 'land' : 'fly'
    wings(s, f, t, dt, s.mode === 'out' ? 1 - ss(s.t, 0.3, 1.6) : 0, flare)
    if (s.dist >= s.len) {
      if (s.mode === 'out' && u.trip && u.esc.hover) { s.mode = 'hover'; s.ht = rnd(4, 8); s.hp = root.position.clone(); s.t = 0 }
      else if (s.mode === 'out' && u.trip && u.esc.hawk) { s.curve = inbound(root.position.clone(), s.home, s.faceH); s.len = s.curve.getLength(); s.dist = 0; s.t = 0; s.mode = 'back' }
      else if (s.mode === 'out') { s.mode = 'away'; root.visible = false }
      else {
        // 落地：換回停棲模型，原本的動畫接著跑
        s.mode = 'perch'; root.visible = false; s.m.obj.visible = true
        if (s.m.hopper) s.m.hopper.landed = 0
      }
    }
  }
  // 翅膀：繞身體前後軸上下拍（AX.x），翼尖慢一點跟上；takeoff（0～1）拍得最用力；flare 落地前翅膀往前張開煞車
  function wings(s, f, t, dt, takeoff, flare) {
    const r = s.r
    r.reset()
    // 拍翅節奏：bound 拍 0.5 秒、收翅 0.35 秒；glide 拍 3～4 下、滑 1.5 秒；起飛和降落一直拍
    let beat = 1, fold = 0
    const cyc = (s.t + s.phase)
    if (f.style === 'bound' && !takeoff && !flare) { const c = cyc % 0.85; beat = c < 0.5 ? 1 : 0; fold = ss(c, 0.5, 0.58) * (1 - ss(c, 0.78, 0.85)) }
    if (f.style === 'glide' && !takeoff && !flare) { const c = cyc % (3.5 / f.hz + 1.5); beat = c < 3.5 / f.hz ? 1 : 0 }
    s.beat = damp(s.beat ?? 1, beat, 10, dt)
    const hz = f.hz * (1 + 0.25 * takeoff + 0.3 * flare)
    s.phase2 = (s.phase2 ?? 0) + hz * Math.PI * 2 * dt
    const A = (0.55 + 0.35 * takeoff + 0.3 * flare) * s.beat
    const a = A * Math.sin(s.phase2) + 0.1 * A, a2 = A * Math.sin(s.phase2 - 0.9)
    const sweep = 0.9 * fold - 0.35 * flare
    for (const [n, sg] of [['L', 1], ['R', -1]]) {
      r.turn('wing' + n, AX.y, sg * sweep); r.turn('wingtip' + n, AX.y, sg * sweep * 0.8)
      r.turn('wing' + n, AX.x, -sg * a); r.turn('wingtip' + n, AX.x, -sg * a2 * 0.7)
    }
    r.turn('tail', AX.z, -0.4 * flare)
  }

  /* ---------- 2026-11-17 南方黃嘴犀鳥：樹洞餵食（使用者：每隻鳥一個特別的行為；「親鳥餵食」）----------
     母鳥孵蛋時把自己用泥封在樹洞裡、只留一條縫，公鳥一趟趟送蟲來。這裡：地上覓食的那隻每 30～70 秒（沒被驚動時）
     叼著一條綠色毛毛蟲飛到巢樹，站在洞口下面的短枝上，把嘴伸進縫裡兩下（蟲不見），張望一下再飛回地上原本的位置 */
  function nestSetup(u) {
    const s = u.ms[0], m = s.m
    if (s.nest || !savNest.ready || !s.root) return
    m.obj.updateMatrixWorld(true)
    let skin = null; m.obj.traverse((o) => { if (o.isSkinnedMesh && !skin) skin = o })
    if (!skin) return
    const sit = skClone(m.obj); sit.traverse((o) => { o.visible = true; o.frustumCulled = false }); sit.visible = false; scene.add(sit)
    let sk = null; sit.traverse((o) => { if (o.isSkinnedMesh && !sk) sk = o })
    // 嘴尖：上半身最往前的頂點（照目前朝向）
    const P0 = m.obj.getWorldPosition(V()), pos = skin.geometry.attributes.position, v = V(), box = new THREE.Box3().setFromObject(m.obj)
    let tip = -1, best = -Infinity, fw = V()
    { let cx = 0, cz = 0, n = 0; for (let i = 0; i < pos.count; i += 7) { skin.getVertexPosition(i, v).applyMatrix4(skin.matrixWorld); cx += v.x; cz += v.z; n++ } fw.set(cx / n, 0, cz / n) }
    // 前方：離身體中心最遠、又在上半身的頂點方向（就是嘴）
    for (let i = 0; i < pos.count; i++) { skin.getVertexPosition(i, v).applyMatrix4(skin.matrixWorld); if (v.y < box.min.y + (box.max.y - box.min.y) * 0.45) continue; const d = Math.hypot(v.x - fw.x, v.z - fw.z); if (d > best) { best = d; tip = i } }
    skin.getVertexPosition(tip, v).applyMatrix4(skin.matrixWorld)
    const f = V(v.x - fw.x, 0, v.z - fw.z).normalize(), toTrunk = V(-savNest.nx, 0, -savNest.nz)
    // 轉成面向樹幹
    const turn = Math.atan2(f.x * toTrunk.z - f.z * toTrunk.x, f.dot(toTrunk))
    const Q = new THREE.Quaternion().setFromAxisAngle(AX.y, -turn).multiply(m.obj.getWorldQuaternion(new THREE.Quaternion()))
    const off = v.clone().sub(P0).applyQuaternion(new THREE.Quaternion().setFromAxisAngle(AX.y, -turn))
    const slit = V(savNest.x, savNest.y, savNest.z), stand = slit.clone().addScaledVector(V(savNest.nx, 0, savNest.nz), 0.035).sub(off)
    // 腳下的斷枝（tools/make-hornbill-nest.py 的 nest_stub：沿 +z 長 0.3、末端往上彎 3.5 cm、半徑 3.2→2.2 cm）：
    // 根部在樹幹表面，長度縮放到腳站的地方再往外 6 cm；高度讓腳那一點的枝頂剛好在腳底
    const dF = Math.hypot(stand.x - savNest.cx, stand.z - savNest.cz) - savNest.r, Ls = Math.max(0.12, dF + 0.06), fz = clamp(dF / Ls, 0, 1)
    const stubY = stand.y - 0.035 * fz * fz - 0.032 * (1 - 0.3 * fz) + 0.004
    const stub = new THREE.Group(); stub.name = 'hornbillStub'
    stub.position.set(savNest.cx + savNest.nx * savNest.r, stubY, savNest.cz + savNest.nz * savNest.r); stub.rotation.y = Math.atan2(savNest.nx, savNest.nz); stub.scale.set(1, 1, Ls / 0.3)
    if (savNest.stub) {
      const S = savNest.stub
      const a = new THREE.Mesh(S.stub.geometry, S.bark), b = S.end && new THREE.Mesh(S.end.geometry, S.end.material)
      if (!a.geometry.attributes.color) a.geometry.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(a.geometry.attributes.position.count * 3).fill(0.62), 3))
      stub.add(a); if (b) stub.add(b)
    } else stub.add(new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.032, 0.3, 8).rotateX(Math.PI / 2).translate(0, 0, 0.15), new THREE.MeshStandardMaterial({ color: 0x4a3a2c, roughness: 1 })))
    stub.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true } })
    scene.add(stub)
    const food = new THREE.Mesh(new THREE.CapsuleGeometry(0.006, 0.03, 3, 6), new THREE.MeshStandardMaterial({ color: 0x6f9a2e, roughness: 0.6 }))
    food.visible = false; scene.add(food)
    s.nest = { sit, sk, tip, Q, stand, food, wait: rnd(8, 20), on: false, k: 0, ph: '', curve: null, len: 0, dist: 0, home: V() }
  }
  const _nq = V(), _nt = V()
  function nestStep(u, s, t, dt) {
    const N = s.nest, m = s.m
    if (N.ph === 'out' || N.ph === 'back') {
      N.dist = Math.min(N.len, N.dist + u.esc.fly.speed * 0.8 * clamp((N.len - N.dist) / 3, 0.3, 1) * dt); const k = N.dist / N.len
      N.curve.getPointAt(k, _nq); N.curve.getTangentAt(Math.min(k, 0.999), _nt)
      s.root.position.copy(_nq); s.root.visible = true
      const h = Math.atan2(_nt.x, _nt.z), dh = wrap(h - s.head)
      s.head += dh * (1 - Math.exp(-7 * dt)); s.roll = damp(s.roll, clamp(-dh * 2.6, -0.8, 0.8), 4, dt); s.pitch = damp(s.pitch, -Math.asin(clamp(_nt.y, -1, 1)) * 0.7, 6, dt)
      s.root.rotation.set(s.pitch, s.head, s.roll); s.t += dt
      wings(s, u.esc.fly, t, dt, 1 - ss(N.dist, 0, 1.2), ss(1 - (N.len - N.dist) / 2.5, 0, 1))
      if (N.dist >= N.len) {
        s.root.visible = false
        if (N.ph === 'out') { N.ph = 'feed'; N.k = 0; N.sit.visible = true; N.food.visible = true; s.act = 'nestfeed'; nestStep(u, s, t, 0) }   // 同一格就擺到洞口（不然那一格站姿模型還在舊位置，鳥會閃一下不見）
        else { N.ph = ''; N.on = false; m.obj.visible = true; s.mode = 'perch'; s.act = ''; N.wait = rnd(...u.esc.nest) }
      }
      return
    }
    if (N.ph === 'feed') {
      // 0～1.2 s 站穩張望 → 兩下把嘴伸進縫裡（第二下蟲留在洞裡）→ 再張望 → 飛回去
      N.k += dt
      const k = N.k, poke = ss(k, 1.2, 1.45) * (1 - ss(k, 1.8, 2.05)) + ss(k, 2.3, 2.55) * (1 - ss(k, 3.0, 3.3))
      const look = k < 1.2 || k > 3.4 ? 0.35 * Math.sin(k * 2.2) * ss(Math.sin(k * 0.9 + 1), -0.2, 0.4) : 0
      N.sit.position.copy(N.stand).addScaledVector(V(-savNest.nx, 0, -savNest.nz), 0.045 * poke)
      N.sit.quaternion.copy(N.Q).premultiply(_qq.setFromAxisAngle(AX.y, look))
      N.sit.updateMatrixWorld(true)
      if (N.food.visible) {
        N.sk.getVertexPosition(N.tip, _nq).applyMatrix4(N.sk.matrixWorld)
        N.food.position.copy(_nq).addScaledVector(V(savNest.nx, 0, savNest.nz), 0.012); N.food.position.y -= 0.006
        N.food.rotation.set(0, Math.atan2(savNest.nx, savNest.nz) + 1.4, 0.2 * Math.sin(t * 9))
        if (k > 2.75) N.food.visible = false
      }
      if (k > 5.2) {   // 飛回去
        N.sit.visible = false; N.ph = 'back'; s.act = 'fly'; s.t = 0
        const A = N.stand.clone().add(V(0, 0.15, 0)), B = N.home.clone().add(V(0, 0.2, 0))
        N.curve = new THREE.CubicBezierCurve3(A, A.clone().add(V(savNest.nx * 1.6, 0.3, savNest.nz * 1.6)), B.clone().add(V(0, 1.6, 0)), B); N.len = N.curve.getLength(); N.dist = 0
      }
    }
  }
  const _qq = new THREE.Quaternion()
  /* ---------- 2026-11-17 珠頸斑鳩展示飛行（Display Flight）----------
     鞠躬完的雄鳥（birds.js doveShow）偶爾起飛：快拍翅膀陡陡爬升 6 m → 翅膀平伸、尾羽張開，畫一個大弧滑翔下來 → 繞回原地降落。
     跟樹洞餵食一樣：地上那隻先藏起來，飛行模型飛完一圈再換回來 */
  // 樹冠：每棵樹的樹幹碰撞圓（layout.js colliders，top＝樹頂）當成半徑＝樹高 40%（至少 2.5 m）的樹冠，路線上任一點在樹冠範圍內就算撞到
  let near = []
  const treesNear = (A) => { near = colliders.filter((c) => c.top < 60 && (c.x - A.x) ** 2 + (c.z - A.z) ** 2 < 30 * 30).map((c) => { const g = terrainHeight(c.x, c.z); return { x: c.x, z: c.z, top: c.top, g, R: Math.max(2.5, Math.min(8, (c.top - g) * 0.45)) + 1.5 /* 樹冠半徑估樹高 45%（上限 8 m）＋1.5 m 餘裕 */ } }) }
  const treeHit = (curve) => {
    for (let i = 2; i <= 30; i++) {
      const p = curve.getPoint(i / 30)
      for (const c of near) if (p.y < c.top + 1 && p.y > c.g + 1.2 && (p.x - c.x) ** 2 + (p.z - c.z) ** 2 < c.R * c.R) return true
    }
    return false
  }
  function displayStep(u, s, t, dt) {
    const X = s.disp, f = u.esc.fly
    const seg = X.ph === 'climb' ? X.c1 : X.c2, len = X.ph === 'climb' ? X.l1 : X.l2
    const sp = X.ph === 'climb' ? 5.2 * Math.min(1, 0.35 + s.t / 0.8) : 6.0 * clamp((len - X.dist) / 2.5, 0.35, 1)
    X.dist = Math.min(len, X.dist + sp * dt); const k = X.dist / len
    seg.getPointAt(k, _nq); seg.getTangentAt(Math.min(k, 0.999), _nt)
    s.root.position.copy(_nq); s.root.visible = true; s.t += dt
    const h = Math.atan2(_nt.x, _nt.z), dh = wrap(h - s.head)
    s.head += dh * (1 - Math.exp(-6 * dt)); s.roll = damp(s.roll, clamp(-dh * 3, -0.7, 0.7), 4, dt); s.pitch = damp(s.pitch, -Math.asin(clamp(_nt.y, -1, 1)) * 0.8, 5, dt)
    s.root.rotation.set(s.pitch, s.head, s.roll)
    const landing = X.ph === 'glide' && len - X.dist < 1.6
    if (X.ph === 'climb') { wings(s, f, t, dt, 1, 0); s.act = 'displayflight' }
    else if (!landing) {   // 滑翔：翅膀平伸（飛行模型本身的張翅姿勢）微微上反、不拍；尾羽張開
      s.r.reset(); for (const [n, sg] of [['L', 1], ['R', -1]]) { s.r.turn('wing' + n, AX.x, -sg * 0.1); s.r.turn('wingtip' + n, AX.x, -sg * 0.06) }
      s.act = 'displayflight'
    } else { wings(s, f, t, dt, 0, ss(1 - (len - X.dist) / 1.6, 0, 1)); s.act = 'land' }
    const tb = s.r.bones.tail
    if (tb) { if (!X.fanAx) { const a = V(1, 0, 0).applyQuaternion(tb.userData.inv); const ax = Math.abs(a.x), ay = Math.abs(a.y), az = Math.abs(a.z); X.fanAx = ax >= ay && ax >= az ? 'x' : ay >= az ? 'y' : 'z' }
      X.fan = damp(X.fan ?? 0, X.ph === 'glide' && !landing ? 1 : 0, 5, dt); tb.scale.set(1, 1, 1); tb.scale[X.fanAx] = 1 + 0.45 * X.fan }
    if (X.dist >= len) {
      if (X.ph === 'climb') { X.ph = 'glide'; X.dist = 0 }
      else { s.root.visible = false; X.on = false; s.m.obj.visible = true; s.mode = 'perch'; s.act = ''; if (tb) tb.scale.set(1, 1, 1) }
    }
  }
  function displayTick(t, dt) {
    for (const u of units) {
      if (!u.esc.display) continue
      const s = u.ms[0]; if (!s?.root) continue
      const m = s.m, X = s.disp ??= { on: false }
      if (X.on) {
        if (u.b.absent) { X.on = false; s.root.visible = false; m.obj.visible = true; s.mode = 'perch'; s.act = ''; continue }
        u.alarm = 0; displayStep(u, s, t, dt); continue
      }
      if (!m.obj.userData.displayFlight) continue
      m.obj.userData.displayFlight = false
      if (u.b.absent || u.state !== 'home' || s.mode !== 'perch' || u.alarm > 0.2) continue
      // 起飛方向：試 16 個方向，挑爬升＋滑翔整圈都不穿過樹冠的（使用者規格：要有合適的空間）；都不行就不飛
      // 爬升 6 m、往前 4 m，滑翔一個大弧回到原地
      const A = m.obj.getWorldPosition(V()).add(V(0, 0.15, 0)), a0 = Math.random() * Math.PI * 2, side = Math.random() < 0.5 ? 1 : -1
      let ok = false; treesNear(A)
      for (let tr = 0; tr < 16 && !ok; tr++) {
        const a = a0 + tr * Math.PI * 2 / 16, fw = V(Math.sin(a), 0, Math.cos(a)), sd = V(fw.z, 0, -fw.x).multiplyScalar(side)
        const B = A.clone().addScaledVector(fw, 4).add(V(0, 6, 0))
        X.c1 = new THREE.CubicBezierCurve3(A.clone(), A.clone().addScaledVector(fw, 0.6).add(V(0, 2.5, 0)), B.clone().addScaledVector(fw, -1.2).add(V(0, -0.4, 0)), B); X.l1 = X.c1.getLength()
        X.c2 = new THREE.CubicBezierCurve3(B.clone(), B.clone().addScaledVector(fw, 6).addScaledVector(sd, 2).add(V(0, -1.2, 0)), A.clone().addScaledVector(sd, 6).addScaledVector(fw, -2).add(V(0, 1.8, 0)), A.clone()); X.l2 = X.c2.getLength()
        ok = !blockedPath(X.c1) && !treeHit(X.c1) && !treeHit(X.c2) && !blockedPath(X.c2); if (ok) s.head = a
      }
      if (!ok) continue
      { let mn = 1e9; for (const cv of [X.c1, X.c2]) for (let i = 2; i <= 30; i++) { const p = cv.getPoint(i / 30); for (const c of near) if (p.y < c.top + 1) mn = Math.min(mn, Math.hypot(p.x - c.x, p.z - c.z) - c.R) } X.clear = +mn.toFixed(2); X.nTrees = near.length }
      X.on = true; X.ph = 'climb'; X.dist = 0; s.mode = 'display'; s.t = 0; s.act = 'takeoff'
      m.obj.visible = false; s.pitch = 0; s.roll = 0
    }
  }
  /* ---------- 2026-11-17 五色鳥啄鑿樹洞（使用者規格 Bird #004 Nest Excavation）----------
     停在樹冠的那隻每 35～75 秒（沒被驚動時）飛到枯木的樹洞口（world.js __barbetNest），抓在樹幹上：
       鑿洞（65%）：張望 2 s → 對著洞口邊緣連續啄 4～7 s（脖子、頭的骨頭往前點，木屑往外噴）→ 停下張望 2 s →
                    叼一片木屑、轉頭甩出去 2～3 s →（再啄一陣）→ 鑽進洞裡 3 s → 在裡面待 6～12 s → 探頭出來 → 飛回樹冠
       餵雛（35%，加分）：叼著一顆紅果子飛來 → 張望 1 s → 頭伸進洞裡 1.5 s（果子不見）→ 退出來張望 → 飛走
     動作只動脖子、頭的骨頭（整隻只有很小的前後移），木屑是 24 片的小碎片（InstancedMesh，簡單拋物線，不做物理） */
  const BN = () => globalThis.__barbetNest
  const chips = { mesh: null, list: [], held: null }
  function chipSys() {
    if (chips.mesh) return chips
    const g = new THREE.BoxGeometry(0.014, 0.003, 0.008), m = new THREE.MeshStandardMaterial({ color: 0xc9a77a, roughness: 0.9 })
    chips.mesh = new THREE.InstancedMesh(g, m, 24); chips.mesh.count = 0; chips.mesh.frustumCulled = false; chips.mesh.name = 'barbetChips'; scene.add(chips.mesh)
    chips.held = new THREE.Mesh(g, m); chips.held.visible = false; scene.add(chips.held)
    return chips
  }
  const _che = new THREE.Euler(), _cm = new THREE.Matrix4(), _chq = new THREE.Quaternion(), _cs = V(1, 1, 1)
  function chipSpawn(p, n, side, k = 1) {
    const C = chipSys()
    for (let i = 0; i < k; i++) {
      if (C.list.length >= 24) C.list.shift()
      const sp = rnd(0.35, 0.9)
      C.list.push({ p: p.clone(), v: V(n.x * sp + side.x * rnd(-0.4, 0.4), rnd(0.1, 0.6), n.z * sp + side.z * rnd(-0.4, 0.4)), r: V(rnd(0, 6), rnd(0, 6), rnd(0, 6)), w: V(rnd(-15, 15), rnd(-15, 15), rnd(-15, 15)), life: 0, ground: false })
    }
  }
  function chipTick(dt) {
    const C = chips; if (!C.mesh || !C.list.length) { if (C.mesh) C.mesh.count = 0; return }
    let n = 0
    for (let i = C.list.length - 1; i >= 0; i--) {
      const c = C.list[i]; c.life += dt
      if (!c.ground) {
        c.v.y -= 9.8 * dt; c.p.addScaledVector(c.v, dt); c.r.addScaledVector(c.w, dt)
        const gy = terrainHeight(c.p.x, c.p.z) + 0.004
        if (c.p.y < gy) { c.p.y = gy; c.ground = true; c.r.x = 0; c.r.z = 0; c.t0 = c.life }
      } else if (c.life - c.t0 > 2.5) { C.list.splice(i, 1); continue }
    }
    for (const c of C.list) { C.mesh.setMatrixAt(n++, _cm.compose(c.p, _chq.setFromEuler(_che.set(c.r.x, c.r.y, c.r.z)), _cs)) }
    C.mesh.count = n; C.mesh.instanceMatrix.needsUpdate = true
  }
  function barbetSetup(u) {
    const s = u.ms[0], m = s.m, N = BN()
    if (s.dig || !N || !s.root) return
    m.obj.updateMatrixWorld(true)
    let skin = null; m.obj.traverse((o) => { if (o.isSkinnedMesh && !skin) skin = o })
    if (!skin) return
    const sit = skClone(m.obj); sit.traverse((o) => { o.visible = true; o.frustumCulled = false }); sit.visible = false; scene.add(sit)
    let sk = null; sit.traverse((o) => { if (o.isSkinnedMesh && !sk) sk = o })
    const bone = (n) => { let b = null; sit.traverse((o) => { if (o.isBone && o.name === n && !b) b = o }); return b }
    const head = bone('head'), neck = bone('neck')
    // 嘴尖（上半身離中心最遠的頂點）、身體朝向
    const pos = skin.geometry.attributes.position, v = V(), box = new THREE.Box3().setFromObject(m.obj), P0 = m.obj.getWorldPosition(V())
    let cx = 0, cz = 0, cn = 0; for (let i = 0; i < pos.count; i += 7) { skin.getVertexPosition(i, v).applyMatrix4(skin.matrixWorld); cx += v.x; cz += v.z; cn++ }
    cx /= cn; cz /= cn
    let tip = -1, best = -1
    for (let i = 0; i < pos.count; i++) { skin.getVertexPosition(i, v).applyMatrix4(skin.matrixWorld); if (v.y < box.min.y + (box.max.y - box.min.y) * 0.45) continue; const d = Math.hypot(v.x - cx, v.z - cz); if (d > best) { best = d; tip = i } }
    skin.getVertexPosition(tip, v).applyMatrix4(skin.matrixWorld)
    const f = V(v.x - cx, 0, v.z - cz).normalize(), toT = V(-N.nx, 0, -N.nz)
    const turn = Math.atan2(f.x * toT.z - f.z * toT.x, f.dot(toT))
    // 抓樹幹的姿勢：先面向樹幹，再把身體往後仰 0.55 rad（停枝的站姿身體是斜的；抓在直立的樹幹上要更直）
    const side = V(0, 1, 0).cross(toT).normalize()
    const Q = new THREE.Quaternion().setFromAxisAngle(side, -0.55).multiply(new THREE.Quaternion().setFromAxisAngle(AX.y, -turn)).multiply(m.obj.getWorldQuaternion(new THREE.Quaternion()))
    // 用這個姿勢量嘴尖相對原點的位移，讓嘴尖落在洞口下緣前 1.5 cm
    sit.position.copy(P0); sit.quaternion.copy(Q); sit.updateMatrixWorld(true)
    sk.getVertexPosition(tip, v).applyMatrix4(sk.matrixWorld); const off = v.clone().sub(P0)
    const hole = V(N.x, N.y, N.z), stand = hole.clone().addScaledVector(V(N.nx, 0, N.nz), 0.015).add(V(0, -N.hr * 0.75, 0)).sub(off)
    // 探頭用：在洞裡轉身、臉朝外（繞上下軸轉 180°、身體稍微往前趴），嘴尖相對原點的位移另外量
    // 臉朝外（面向樹幹的方向再轉 180°），身體往前倒到「身體在嘴後面、跟嘴差不多高」＝趴在洞裡的通道裡，只有頭伸出洞口。
    // 往前倒幾度：試 -1.2～1.2 rad，挑身體中心在嘴尖正後方（往洞裡）、高度差最小的
    const Qout = new THREE.Quaternion().setFromAxisAngle(AX.y, Math.PI - turn).multiply(m.obj.getWorldQuaternion(new THREE.Quaternion()))
    const nOut = V(N.nx, 0, N.nz), sideOut = V(0, 1, 0).cross(nOut).normalize(), bb = new THREE.Box3(), bc = V()
    let Q2 = Qout.clone(), off2 = V(), bestS = Infinity
    for (let k = -12; k <= 12; k++) {
      const q = new THREE.Quaternion().setFromAxisAngle(sideOut, k * 0.1).multiply(Qout)
      sit.quaternion.copy(q); sit.updateMatrixWorld(true); sk.getVertexPosition(tip, v).applyMatrix4(sk.matrixWorld)
      bb.setFromObject(sit); bb.getCenter(bc)
      const back = -(bc.x - v.x) * nOut.x - (bc.z - v.z) * nOut.z, sc = Math.abs(bc.y - v.y) + (back > 0.03 ? 0 : 1)
      if (sc < bestS) { bestS = sc; Q2 = q.clone(); off2 = v.clone().sub(P0) }
    }
    const rest = { head: head?.quaternion.clone(), neck: neck?.quaternion.clone() }
    const fruit = new THREE.Mesh(new THREE.SphereGeometry(0.011, 10, 8), new THREE.MeshStandardMaterial({ color: 0xb3261e, roughness: 0.35 })); fruit.visible = false; scene.add(fruit)
    s.dig = { sit, sk, tip, Q, Q2, off2, hole, stand, side, toT, head, neck, rest, fruit, wait: rnd(10, 25), on: false, ph: '', k: 0, home: V(), plan: null }
  }
  const _bq = new THREE.Quaternion(), _bv = V(), _bw = V()
  // 骨頭繞世界座標的軸轉 a（從靜止姿勢算）
  const boneTurn = (b, rest, axis, a) => { if (!b) return; b.quaternion.copy(rest); if (!a) return; b.parent.getWorldQuaternion(_bq).invert(); _bv.copy(axis).applyQuaternion(_bq).normalize(); b.quaternion.premultiply(_bq.setFromAxisAngle(_bv, a)) }
  function digPlan(type) {
    if (type === 'feed') return [['look', 1.0], ['poke', 1.6], ['look', 1.2]]
    const P = [['look', 2], ['peck', rnd(4, 7)], ['look', 2], ['chip', rnd(2, 3)]]
    if (Math.random() < 0.5) P.push(['peck', rnd(2, 3.5)])
    P.push(['enter', 3], ['inside', rnd(6, 12)], ['peek', 2.2])
    return P
  }
  function digStep(u, s, t, dt) {
    const X = s.dig, m = s.m, N = BN(), n = V(N.nx, 0, N.nz)
    if (X.ph === 'out' || X.ph === 'back') {
      X.dist = Math.min(X.len, X.dist + u.esc.fly.speed * 0.75 * clamp((X.len - X.dist) / 2.5, 0.3, 1) * dt); const k = X.dist / X.len
      X.curve.getPointAt(k, _nq); X.curve.getTangentAt(Math.min(k, 0.999), _nt)
      s.root.position.copy(_nq); s.root.visible = true; s.t += dt
      const h = Math.atan2(_nt.x, _nt.z), dh = wrap(h - s.head)
      s.head += dh * (1 - Math.exp(-7 * dt)); s.roll = damp(s.roll, clamp(-dh * 2.6, -0.8, 0.8), 4, dt); s.pitch = damp(s.pitch, -Math.asin(clamp(_nt.y, -1, 1)) * 0.7, 6, dt)
      s.root.rotation.set(s.pitch, s.head, s.roll)
      wings(s, u.esc.fly, t, dt, 1 - ss(X.dist, 0, 1), ss(1 - (X.len - X.dist) / 1.6, 0, 1)); s.act = 'fly'
      if (X.fruitOn) { s.root.updateMatrixWorld(true); X.fruit.visible = true; X.fruit.position.copy(s.root.position).addScaledVector(_nt, 0.12) }
      if (X.dist >= X.len) {
        s.root.visible = false
        if (X.ph === 'out') { X.ph = 'cling'; X.step = 0; X.k = 0; X.sit.visible = true; digStep(u, s, t, 0) }
        else { X.on = false; X.ph = ''; m.obj.visible = true; s.mode = 'perch'; s.act = ''; X.fruit.visible = false; X.wait = rnd(...u.esc.excavate) }
      }
      return
    }
    // 抓在樹幹上
    X.k += dt
    let [name, dur] = X.plan[X.step] ?? ['', 0]
    if (X.k >= dur && name) { X.step++; X.k = 0; [name, dur] = X.plan[X.step] ?? ['', 0] }
    const u01 = dur ? X.k / dur : 1
    let fwd = 0, neckA = 0, headA = 0, yaw = 0, hide = false, climb = 0, dive = 0
    const up = AX.y
    if (name === 'look') { yaw = 0.55 * Math.sin(X.k * 2.3) * ss(Math.sin(X.k * 1.1 + 0.6), -0.3, 0.5); headA = -0.15; s.act = X.type === 'dig' && X.step > 0 ? 'excavate' : 'look' }   // 鑿洞中間停下來張望也算鑿洞
    else if (name === 'peck') {
      // 一陣一陣：連啄 5～8 下（每下 0.22 s）停 0.4 s；啄到的那一刻噴 1～2 片木屑
      const cyc = X.k % 2.0, burst = cyc < 1.6, ph = (cyc / 0.22) % 1
      const strike = burst ? Math.pow(Math.max(0, Math.sin(ph * Math.PI)), 3) : 0
      neckA = 0.28 * strike; headA = 0.32 * strike; fwd = 0.01 * strike
      const hit = burst && ph > 0.45 && ph < 0.6
      if (hit && !X.hit) { X.sk.getVertexPosition(X.tip, _bw).applyMatrix4(X.sk.matrixWorld); chipSpawn(_bw, n, X.side, Math.random() < 0.6 ? 1 : 2) }
      X.hit = hit; s.act = 'excavate'
    } else if (name === 'chip') {
      // 叼著一片木屑：先低頭在洞口叼起來（0～0.3）→ 頭轉向一邊（0.3～0.7）→ 甩出去（0.75）→ 頭轉回來
      const C = chipSys()
      if (u01 < 0.3) { neckA = 0.25 * ss(u01, 0, 0.2); headA = 0.25 * ss(u01, 0, 0.2) }
      else { yaw = 0.9 * ss(u01, 0.3, 0.55) * (1 - ss(u01, 0.8, 1)); headA = -0.1 }
      const hold = u01 > 0.22 && u01 < 0.75
      if (hold) { X.sk.getVertexPosition(X.tip, _bw).applyMatrix4(X.sk.matrixWorld); C.held.position.copy(_bw); C.held.rotation.set(0.3, t * 0.5, 0.2); C.held.visible = true }
      else if (C.held.visible) { C.held.visible = false; chipSpawn(C.held.position, V(X.side.x * 0.8 + n.x * 0.5, 0, X.side.z * 0.8 + n.z * 0.5), X.side, 1) }
      s.act = 'excavate'
    } else if (name === 'enter') {
      // 鑽進洞（以前直接往樹幹滑，會像沉進樹皮裡）：先往上爬到身體對準洞口（0～0.45），
      // 再身體往前倒、頭先鑽進去（0.35～1，往裡 24 cm；洞口外圈的樹皮把超出洞口的部分遮掉），最後不畫
      climb = ss(u01, 0.05, 0.45); dive = ss(u01, 0.35, 0.8); fwd = 0.24 * ss(u01, 0.4, 1)
      neckA = 0.3 * dive; headA = 0.15 * dive; s.act = 'nestenter'
      if (u01 > 0.97) hide = true
    } else if (name === 'inside') { hide = true; s.act = '' }
    else if (name === 'peek') {
      // 探頭：在洞裡已經轉身臉朝外，頭從洞口慢慢伸出來（嘴尖從洞裡 3 cm → 洞外 5 cm），左右看一看；結束後直接從洞口飛走
      const e = -0.03 + 0.08 * ss(u01, 0, 0.35)
      X.sit.visible = true
      X.sit.position.copy(X.hole).addScaledVector(n, e).sub(X.off2)
      X.sit.quaternion.copy(X.Q2).premultiply(_bq.setFromAxisAngle(up, u01 > 0.35 ? 0.35 * Math.sin((u01 - 0.35) * 11) : 0))
      boneTurn(X.neck, X.rest.neck, X.side, 0); boneTurn(X.head, X.rest.head, X.side, 0)
      if (u01 > 0.35 && X.head) { const yw = 0.7 * Math.sin((u01 - 0.35) * 9); X.head.parent.getWorldQuaternion(_bq).invert(); _bv.copy(up).applyQuaternion(_bq).normalize(); X.head.quaternion.premultiply(_bq.setFromAxisAngle(_bv, yw)) }
      X.sit.updateMatrixWorld(true); X.fromHole = true; s.act = 'look'
      return
    } else if (name === 'poke') {
      // 餵雛：頭伸進洞裡（身體往前 6 cm），停一下，果子不見，退出來
      const inn = ss(u01, 0, 0.3) * (1 - ss(u01, 0.7, 1)); climb = 0.9 * inn; dive = 0.5 * inn; fwd = 0.09 * inn; neckA = 0.25 * inn; headA = 0.15 * inn; s.act = 'feedchick'   // 往上一點、頭伸進洞裡
      if (u01 > 0.5) X.fruitOn = false
    } else if (!name) {   // 做完：飛回樹冠
      X.sit.visible = false; X.ph = 'back'; s.t = 0
      const A = X.fromHole ? X.hole.clone().addScaledVector(n, 0.12) : X.stand.clone().add(V(0, 0.1, 0)).addScaledVector(n, 0.1), B = X.home.clone(); X.fromHole = false
      const sd = V(-n.z, 0, n.x); if (sd.dot(V(B.x - A.x, 0, B.z - A.z)) < 0) sd.negate()
      X.curve = new THREE.CubicBezierCurve3(A, A.clone().addScaledVector(n, 1.4).addScaledVector(sd, 1.2).add(V(0, 0.3, 0)), B.clone().add(V(0, 1.0, 0)).addScaledVector(sd, 0.6), B); X.len = X.curve.getLength(); X.dist = 0
      s.head = Math.atan2(n.x, n.z); return
    }
    X.sit.visible = !hide
    // climb：往上爬到身體中心對準洞口（約 1.6 倍洞口半徑）；dive：身體往前倒 0.9 rad（頭朝洞裡）
    X.sit.position.copy(X.stand).addScaledVector(X.toT, fwd).add(V(0, climb * N.hr * 2.4, 0))
    X.sit.quaternion.copy(X.Q).premultiply(_bq.setFromAxisAngle(X.side, 0.9 * dive)).premultiply(_bq.setFromAxisAngle(up, yaw * 0.25))
    X.sit.updateMatrixWorld(true)
    boneTurn(X.neck, X.rest.neck, X.side, -neckA); boneTurn(X.head, X.rest.head, X.side, -headA)
    if (yaw && X.head) { X.head.parent.getWorldQuaternion(_bq).invert(); _bv.copy(up).applyQuaternion(_bq).normalize(); X.head.quaternion.premultiply(_bq.setFromAxisAngle(_bv, yaw * 0.75)) }
    X.sit.updateMatrixWorld(true)
    if (X.fruitOn) { X.sk.getVertexPosition(X.tip, _bw).applyMatrix4(X.sk.matrixWorld); X.fruit.position.copy(_bw).addScaledVector(n, 0.006); X.fruit.visible = !hide } else X.fruit.visible = false
  }
  function digTick(t, dt) {
    chipTick(dt)
    for (const u of units) {
      if (!u.esc.excavate) continue
      const s = u.ms[0]; if (!s?.root) continue
      if (!s.dig) { barbetSetup(u); if (!s.dig) continue }
      const X = s.dig
      if (X.on) {
        if (u.b.absent) { X.on = false; X.ph = ''; X.sit.visible = false; X.fruit.visible = false; s.root.visible = false; s.m.obj.visible = true; s.mode = 'perch'; s.act = ''; continue }
        u.alarm = 0; digStep(u, s, t, dt); continue
      }
      if (u.b.absent || u.state !== 'home' || s.mode !== 'perch' || u.alarm > 0.2) continue
      if ((X.wait -= dt) > 0) continue
      const type = X.force ?? (Math.random() < 0.35 ? 'feed' : 'dig'); X.force = null
      X.plan = digPlan(type); X.type = type; X.fruitOn = type === 'feed'
      X.on = true; X.ph = 'out'; s.mode = 'dig'; s.act = 'takeoff'; s.t = 0
      s.m.obj.getWorldPosition(X.home); s.m.obj.visible = false
      const n = V(BN().nx, 0, BN().nz), A = X.home.clone(), B = X.stand.clone().add(V(0, 0.1, 0)).addScaledVector(n, 0.1)
      // 繞過樹幹到洞口那一面：中間的控制點往洞口前方＋從家那一側偏過去（不穿過樹幹）
      const sd = V(-n.z, 0, n.x); if (sd.dot(V(A.x - B.x, 0, A.z - B.z)) < 0) sd.negate()
      X.curve = new THREE.CubicBezierCurve3(A, A.clone().add(V(0, 0.8, 0)).addScaledVector(sd, 0.8), B.clone().addScaledVector(n, 1.6).addScaledVector(sd, 1.2).add(V(0, 0.4, 0)), B); X.len = X.curve.getLength(); X.dist = 0
      s.head = Math.atan2(B.x - A.x, B.z - A.z); s.pitch = 0; s.roll = 0
    }
  }
  function nestTick(t, dt) {
    for (const u of units) {
      if (!u.esc.nest) continue
      const s = u.ms[0]; if (!s?.root) continue
      if (!s.nest) { nestSetup(u); if (!s.nest) continue }
      const N = s.nest
      if (N.on) {
        if (u.b.absent) { N.on = false; N.ph = ''; N.sit.visible = false; N.food.visible = false; s.root.visible = false; s.m.obj.visible = true; s.mode = 'perch'; s.act = ''; continue }
        u.alarm = 0; nestStep(u, s, t, dt); continue
      }
      if (u.b.absent || u.state !== 'home' || s.mode !== 'perch' || u.alarm > 0.2) continue
      if ((N.wait -= dt) > 0) continue
      // 出發：從地上目前的位置
      N.on = true; N.ph = 'out'; s.mode = 'nest'; s.act = 'takeoff'; s.t = 0
      s.m.obj.getWorldPosition(N.home); s.m.obj.visible = false
      const A = N.home.clone().add(V(0, 0.2, 0)), B = N.stand.clone().add(V(0, 0.15, 0))
      N.curve = new THREE.CubicBezierCurve3(A, A.clone().add(V(0, 1.6, 0)), B.clone().add(V(savNest.nx * 1.6, 0.35, savNest.nz * 1.6)), B); N.len = N.curve.getLength(); N.dist = 0
      s.head = Math.atan2(B.x - A.x, B.z - A.z); s.pitch = 0; s.roll = 0
    }
  }

  function tick(t, dt, { sneak = false } = {}) {
    colonyTick(t, dt)
    nestTick(t, dt)
    displayTick(t, dt)
    digTick(t, dt)
    // 2026-11-17 警戒旗標給 birds.js（斑鳩求偶：玩家太近就停）
    for (const u of units) { const al = u.state !== 'home' || u.alarm > 0.3; for (const s of u.ms) if (s.m.obj) s.m.obj.userData.alert = al }
    const P = world.camera.position
    speed = damp(speed, P.distanceTo(last) / Math.max(dt, 1e-3), 8, dt)
    last.copy(P)
    // 玩家越快越容易驚動；蹲低慢慢走只有一半距離；站著不動也會被注意到，但比較近才會
    const hidden = inHide(P)
    const mult = hidden ? 0 : sneak ? 0.5 : speed > 6 ? 1.5 : speed > 0.6 ? 1 : 0.7
    for (const u of units) {
      if (u.b.absent) continue   // 這個時段不在（main.js presence）
      if (u.ms[0]?.nest?.on || u.ms[0]?.disp?.on || u.ms[0]?.dig?.on) continue   // 正在樹洞餵食／展示飛行（nestTick、displayTick 管）
      if (u.state === 'home') {
        // 自己出巢覓食（ESCAPE.sortie）：沒在警戒時倒數，時間到就照驚飛那一套從岩面朝外（穿過水簾）飛出去，在遠處待一陣子再飛回巢
        if (u.esc.sortie && u.alarm < 0.2) {
          u.sortT = (u.sortT ?? rnd(8, u.esc.sortie[0])) - dt
          if (u.sortT <= 0) { u.sortT = rnd(...u.esc.sortie); flush(u, t, !!(u.esc.hover || u.esc.hawk)); u.trip = true; for (const s2 of u.ms) s2.wait = rnd(14, 26); continue }
        }
        let d = Infinity
        for (const s of u.ms) { s.m.obj.getWorldPosition(_v); d = Math.min(d, _v.distanceTo(P)) }
        const R = u.esc.r * mult
        // 警戒值：靠得越近漲得越快（距離 R 不漲、0.7R 一秒、0.5R 三分之一秒），走遠就慢慢消
        if (d < R) u.alarm += dt * Math.min(10, (R / d) ** 2 - 1)
        else u.alarm = Math.max(0, u.alarm - dt * 0.4)
        // 2026-11-09 使用者：不怕人的先跳開，人真的很近才飛一下到樹上。地上走的鳥（有 walker）先跑／跳／游開（'ground'），
        // 玩家還是逼到 near（預設驚飛距離的一半）以內才起飛、只飛到旁邊的樹上；停在樹上的鳥照舊直接飛走
        if (u.alarm >= 1) {
          u.alarm = 0
          if (u.esc.fly && u.ms.some((s) => s.m.walker)) { u.state = 'ground'; u.calm = 0; for (const s of u.ms) fleeOnGround(u, s) }
          else { flush(u, t); u.trip = false }
        }
      } else if (u.state === 'ground') {
        let d = Infinity
        for (const s of u.ms) { s.m.obj.getWorldPosition(_v); d = Math.min(d, _v.distanceTo(P)) }
        // 慢慢走過去：牠一直往後退、保持距離（跑回家附近的範圍內，退到底被追上才飛）；用跑的衝過來（> 4 m/s），還有 0.7 倍距離就起飛
        const near = hidden ? 0 : speed > 4 ? u.esc.r * 0.7 : (u.esc.near ?? u.esc.r * 0.45) * mult
        if (d < near && !(u.esc.burrow && u.ms.some((s) => s.m.walker?.inBurrow))) { flush(u, t, true); continue }   // 穴鴞：已經有一隻躲進洞了就不飛（另一隻也正在跑回洞）
        u.calm = d > u.esc.r * mult * 1.3 ? u.calm + dt : 0
        for (const s of u.ms) { if (s.m.walker && !s.m.walker.goal && u.calm < 1.5) fleeOnGround(u, s); s.act = 'run' }
        if (u.calm > 4) { for (const s of u.ms) restoreWalker(s); u.state = 'home'; u.alarm = 0 }
      } else if (u.esc.fly) {
        for (const s of u.ms) if (s.mode !== 'perch') flyStep(u, s, t, dt)
        if (u.ms.every((s) => s.mode === 'perch')) { u.state = 'home'; u.trip = false }
      } else {
        // 跑／游：到了目的地玩家還很近就再逃一次；遠了就慢下來、恢復平常的範圍
        let d = Infinity
        for (const s of u.ms) { s.m.obj.getWorldPosition(_v); d = Math.min(d, _v.distanceTo(P)) }
        u.calm = d > u.esc.r * mult * 1.3 ? u.calm + dt : 0
        for (const s of u.ms) {
          const w = s.m.walker
          if (!w) continue
          if (!w.goal && u.calm < 1.5) fleeOnGround(u, s)
          s.act = 'run'
        }
        if (u.calm > 4) {
          for (const s of u.ms) if (s.m.walker && s.mode === 'flee') { const w = s.m.walker; w.speed = s.speed0; w.turn = s.turn0; s.mode = 'perch'; s.act = '' }
          u.state = 'home'; u.alarm = 0
        }
      }
    }
  }
  // 拍照用：這隻鳥現在畫面上是哪個物件、在做什麼（飛行中是飛行模型；飛遠躲起來的不算）
  const shotOf = (m) => {
    const s = m.flight
    if (!s) return { obj: m.obj, act: m.acts?.name ?? '' }
    if (s.mode === 'away' || (s.mode === 'wait' && !m.obj.visible)) return null
    if (s.dig?.on) { const X = s.dig; if (X.ph === 'out' || X.ph === 'back') return { obj: s.root, act: 'fly' }; return X.sit.visible ? { obj: X.sit, act: s.act || 'look' } : null }
    if (s.disp?.on) return { obj: s.root, act: s.act || 'displayflight' }
    if (s.nest?.on) return s.nest.ph === 'feed' ? { obj: s.nest.sit, act: 'nestfeed' } : { obj: s.root, act: s.act || 'fly' }
    if (s.mode === 'out' || s.mode === 'back' || s.mode === 'hover' || s.mode === 'swoop') return { obj: s.root, act: s.act }
    return { obj: m.obj, act: s.mode === 'flee' ? 'run' : m.acts?.name ?? '' }
  }
  // 2026-11-10 時間到才飛來、時間到飛走（presence.js；PARK_PLAN.md 第三節）
  // arrive：從 30～45 公尺外、離地 9～14 公尺的地方飛進來，降落在原本的位置（一群的話一起飛來）
  const unitOf = (b) => units.find((x) => x.b === b)
  function arrive(b) {
    const u = unitOf(b)
    if (!u?.esc.fly || (u.state !== 'home' && !u.leaving)) return false
    u.leaving = false; u.state = 'away'; u.alarm = 0
    let flock = null
    for (const s of u.ms) {
      const m = s.m
      restoreWalker(s)
      m.obj.updateMatrixWorld(true)
      _box.setFromObject(m.obj)
      _box.getCenter(s.home)
      m.obj.getWorldDirection(_w); s.faceH = Math.atan2(_w.x, _w.z)
      const a = Math.random() * Math.PI * 2
      const out = u.esc.river ? riverOut(s.home, V(Math.sin(a), 0, Math.cos(a))) : outbound(s.home, V(Math.sin(a), 0, Math.cos(a)), flock)
      flock ??= { F: out.v3 }
      s.curve = inbound(out.v3, s.home, s.faceH, out); s.len = s.curve.getLength(); s.dist = 0; s.t = 0
      s.curve.getTangentAt(0, _v); s.head = Math.atan2(_v.x, _v.z)
      s.mode = 'back'; m.obj.visible = false; s.root.visible = true
      s.root.position.copy(out.v3)
    }
    return true
  }
  // depart：照驚飛的方式飛走，但飛遠之後不回來；gone＝全部都飛走了
  function depart(b) {
    const u = unitOf(b)
    if (!u?.esc.fly || u.state !== 'home') return false
    u.leaving = true; flush(u, 0)
    return true
  }
  const gone = (b) => { const u = unitOf(b); return !u || u.ms.every((s) => s.mode === 'away') }
  const canFly = (b) => !!unitOf(b)?.esc.fly
  window.__flight = { units, digGo: (type = 'dig') => { const u = units.find((x) => x.b.def.id === 'barbet'); const X = u?.ms[0]?.dig; if (X) { X.wait = 0; X.force = type } }, shotOf: (m) => shotOf(m), displayGo: (id) => { const u = units.find((x) => x.b.def.id === id); const m = u?.ms[0]?.m; if (m) m.obj.userData.displayFlight = true }, nestGo: (id) => { const u = units.find((x) => x.b.def.id === id); const N = u?.ms[0]?.nest; if (N) N.wait = 0 }, flush: (id) => { const u = units.find((x) => x.b.def.id === id); if (u && u.state === 'home') flush(u, 0) } }
  // 鏡頭被程式直接搬走時呼叫：這一跳不算玩家在跑（不然手會狂晃、鳥會被嚇飛）
  const snap = () => { last.copy(world.camera.position); speed = 0 }
  return { tick, units, shotOf, snap, arrive, depart, gone, canFly, add: addUnit, get speed() { return speed } }
}
