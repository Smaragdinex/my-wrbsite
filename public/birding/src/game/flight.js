// 鳥會怕人：玩家靠太近（跑過來、站著不動、蹲低慢慢靠近的距離都不一樣），鳥就照牠真實的習性逃走——
// 會飛的起飛、飛到遠處躲起來，等玩家走開再飛回原本的地方降落；帝雉、小彎嘴用跑的；紅冠水雞、白腹秧雞游開。
// 飛的時候換成另一個翅膀張開的模型（ChatGPT 畫飛行姿勢 → Tripo → tools/rig-distance.py 的 fly 骨架：body、head、tail、wingL/R、wingtipL/R）。
import * as THREE from 'three'
import { rigged, AX, hasModel, REAL_CM } from '../birds.js'
import { HIDES } from '../east.js'
import { clone as skClone } from 'three/addons/utils/SkeletonUtils.js'
import { savNest } from '../savanna.js'
// 2026-11-11 使用者：躲在觀察屋裡，鳥不會飛走（Threads 回饋：宣傳文寫了「躲在賞鳥屋裡鳥不會跑」，以前觀察屋只是一棟房子）。
// 觀察屋 6×3.2 m、正面朝 look；玩家在屋裡（各邊多 0.4 m，含門口）＝鳥看不到人，不會警戒
const inHide = (P) => HIDES.some((h) => { const a = Math.atan2(h.look[0] - h.x, h.look[1] - h.z), dx = P.x - h.x, dz = P.z - h.z, lz = dx * Math.sin(a) + dz * Math.cos(a), lx = dx * Math.cos(a) - dz * Math.sin(a); return Math.abs(lx) < h.w / 2 + 0.4 && Math.abs(lz) < h.d / 2 + 0.4 })
import { terrainHeight as gardenH, domeRho, domeY, mtnBase, MTN, inAlpine, alpineHeight, ALP_RIVER, colliders, EAST, alpineTrailDist, YOSE } from '../layout.js'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { grassPush } from '../flora.js'
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
  greatgreyowl: { r: 10, hunt: 'perch', flyLegs: { y: [-1, -0.13], z: [-0.05, 0.22] }, hipZ: 0.09, fly: { speed: 6, hz: 2.8, style: 'glide', k: 1.45 } },
  wbwood: { r: 8, fly: { speed: 8, hz: 9, style: 'bound', k: 0.42 } },
  nutcracker: { r: 10, fly: { speed: 9, hz: 5, style: 'glide', k: 0.55 } },
  rnpheasant: { r: 7, run: 3, fly: { speed: 9, hz: 10, style: 'flap', k: 1.2 } },
  skylark: { r: 5, songflight: [40, 90], fly: { speed: 7, hz: 9, style: 'flap', k: 0.42 } },
  cisticola: { r: 4, fly: { speed: 6, hz: 12, style: 'bound', k: 0.3 } },
  woodcock: { r: 4, fly: { speed: 7, hz: 9, style: 'flap', k: 0.55 } },   // 2026-11-10 山鷸：不太怕人，靠很近才「咻咻」飛起
  jacana: { r: 7, fly: { speed: 7, hz: 5, style: 'glide', k: 0.58 } },   // 2026-11-10 水雉：翅膀幾乎全白，飛起來長腳往後伸
  psnipe: { r: 5, run: 4, fly: { speed: 7, hz: 7, style: 'flap', k: 0.45 } },
  scopsowl: { r: 5, fly: { speed: 7, hz: 5, style: 'glide', k: 0.43 } },   // 2026-11-09 領角鴞：不太怕人，翅膀寬圓、飛得慢又安靜
  mtscops: { r: 5, fly: { speed: 6.5, hz: 6, style: 'glide', k: 0.35 } },
  grassowl: { r: 6, run: 3, hunt: 'quarter', flyLegs: { bone: 'tail', y: [-1, 0.015], z: [-1, -0.12], tip: { z: -0.2, y: 0.008 } }, hipZ: -0.07, fly: { speed: 6, hz: 3.5, style: 'glide', k: 1.01 } },
  nuthatch: { r: 5, climb: {}, fly: { speed: 7, hz: 14, style: 'bound', k: 0.26 } },   // climb：神木上爬上爬下、頭朝下下樹（nutTick）
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
  const homeObj = (s) => s.nut?.sit.visible ? s.nut.sit : s.m.obj   // 2026-11-18 茶腹鳾：停著時看得到的是 nutTick 的那一份
  function flush(u, t, short = false) {
    u.state = 'away'
    const P = world.camera.position
    if (u.esc.fly) {
      for (const s of u.ms) restoreWalker(s)   // 剛剛在跑：起飛前把走路速度還原（落地後照平常走）
      let flock = null
      u.ms.forEach((s, i) => {
        const m = s.m
        const ho = homeObj(s); ho.updateMatrixWorld(true)
        _box.setFromObject(ho)
        _box.getCenter(s.home)
        ho.getWorldDirection(_w); s.faceH = Math.atan2(_w.x, _w.z)
        if (s.nut) { s.nut.sit.visible = false; s.nut.grub.visible = false }
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
    const head = bone('head'), neck = bone('neck'), legs = ['thighL', 'shinL', 'footL', 'thighR', 'shinR', 'footR'].map((n) => bone(n))
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
    // 抓樹幹的姿勢（2026-11-18 改成用試的）：以前固定往後仰 0.55 rad，量到髖關節離樹皮 10～12 cm、腳只有 6 cm 長 → 腳碰不到樹。
    // 現在試往後仰 0.3～1.4 rad：每個角度都先讓嘴尖落在洞口下緣、再往外推到身體（腳以外）不插進樹皮，挑兩邊髖關節離樹皮最近的
    const hole = V(N.x, N.y, N.z), baseQ = new THREE.Quaternion().setFromAxisAngle(AX.y, -turn).multiply(m.obj.getWorldQuaternion(new THREE.Quaternion()))
    const hips = ['thighL', 'thighR'].map((n) => bone(n)).filter(Boolean)
    // 2026-11-18 第二版：先擺身體、再用脖子去搆——髖關節放在洞正下方、離樹皮 4 cm（腳 6 cm 搆得到），嘴尖高度對齊洞口下緣，
    // 試往後仰 -0.2～1.2 rad，挑「嘴尖剛好在洞口那個面（±1.5 cm）、身體沒插進樹皮」的
    const nV = V(N.nx, 0, N.nz)
    // 腳（大腿、小腿、腳掌、腳趾）的頂點不算穿模：腳之後用 IK 擺到樹皮上（量過：沒排除時「插進樹皮最深」的是腳趾）
    const isLeg = new Uint8Array(skin.geometry.attributes.position.count)
    { const si = sk.geometry.attributes.skinIndex, sw = sk.geometry.attributes.skinWeight; for (let i = 0; i < isLeg.length; i++) { let bw = -1, bn = ''; for (let c = 0; c < 4; c++) if (sw.getComponent(i, c) > bw) { bw = sw.getComponent(i, c); bn = sk.skeleton.bones[si.getComponent(i, c)]?.name ?? '' } if (/thigh|shin|foot|toe/.test(bn)) isLeg[i] = 1 } }
    const tryPitch = (p) => {
      const q = new THREE.Quaternion().setFromAxisAngle(side, -p).multiply(baseQ)
      sit.position.copy(P0); sit.quaternion.copy(q); sit.updateMatrixWorld(true)
      sk.getVertexPosition(tip, v).applyMatrix4(sk.matrixWorld); const tipO = v.clone().sub(P0)
      const hipO = hips.reduce((a, b) => a.add(b.getWorldPosition(V())), V()).divideScalar(Math.max(1, hips.length)).sub(P0)
      // 擺位：髖關節沿洞口法線離洞口那個面 +4 cm、左右對準洞軸；嘴尖的高度＝洞口下緣往上 0.15 倍洞半徑
      const st = hole.clone().sub(hipO)
      st.addScaledVector(nV, 0.04 + hipO.dot(nV) - hipO.dot(nV))   // 先讓 hip 在洞口面前 4 cm
      st.y = hole.y - N.hr * 0.85 - tipO.y
      sit.position.copy(st); sit.updateMatrixWorld(true)
      const hipW = hips.reduce((a, b) => a.add(b.getWorldPosition(V())), V()).divideScalar(Math.max(1, hips.length))
      st.addScaledVector(nV, 0.04 - hipW.clone().sub(hole).dot(nV)); st.addScaledVector(side, -hipW.clone().sub(hole).dot(side))
      sit.position.copy(st); sit.updateMatrixWorld(true)
      sk.getVertexPosition(tip, v).applyMatrix4(sk.matrixWorld); const tipN = v.clone().sub(hole).dot(nV)
      const P = sk.geometry.attributes.position, w = V(), bx = new THREE.Box3().setFromObject(sit), yCut = bx.min.y + (bx.max.y - bx.min.y) * 0.25
      let dep = 0, deepI = -1, deepH = 0
      for (let i = 0; i < P.count; i += 2) {
        if (isLeg[i]) continue
        sk.getVertexPosition(i, w).applyMatrix4(sk.matrixWorld)
        const rx = w.x - N.x, ry = w.y - N.y, rz = w.z - N.z, al = rx * N.nx + rz * N.nz
        if (Math.hypot(rx - al * N.nx, ry, rz - al * N.nz) < N.hr * 0.95 && al < 0.03) continue
        const dd = N.r - Math.hypot(w.x - N.cx, w.z - N.cz); if (dd > dep) { dep = dd; deepI = i; deepH = (w.y - bx.min.y) / (bx.max.y - bx.min.y) }
      }
      let deepB = ''; if (deepI >= 0) { const si = sk.geometry.attributes.skinIndex, sw = sk.geometry.attributes.skinWeight; let bw = -1; for (let c = 0; c < 4; c++) if (sw.getComponent(deepI, c) > bw) { bw = sw.getComponent(deepI, c); deepB = sk.skeleton.bones[si.getComponent(deepI, c)]?.name } }
      const hd = head ? head.getWorldPosition(V()) : st.clone(), bill = v.clone().sub(hd), billIn = (bill.x * toT.x + bill.z * toT.z) / (bill.length() || 1)
      const up = hd.y - hipW.y, gap = Math.hypot(hipW.x - N.cx, hipW.z - N.cz) - N.r
      return { q, st, dep, gap, tipN, deepB, deepH: +deepH.toFixed(2), billIn: +billIn.toFixed(2), up: +up.toFixed(3), score: Math.abs(tipN) + 3 * dep }
    }
    let bp = null
    s._pitchTable = []
    for (let p = -0.2; p <= 1.21; p += 0.1) { const r = tryPitch(p); r.p = p; s._pitchTable.push([+p.toFixed(1), +r.dep.toFixed(3), +r.tipN.toFixed(3), r.deepB, r.deepH]); if (r.billIn > 0.2 && r.up > 0 && (!bp || r.score < bp.score)) bp = r }
    if (!bp) bp = tryPitch(0.55)
    if (bp.dep > 0) { bp.st.addScaledVector(nV, bp.dep + 0.003) }
    const Q = bp.q, stand = bp.st
    s._digPush = +bp.dep.toFixed(3); s._digPitch = +bp.p.toFixed(2); s._hipGap = +bp.gap.toFixed(3)
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
    // 進洞的姿勢：身體往前倒 1.4 rad（順著通道），量身體重心（頂點平均）相對原點的位移 → 進洞時重心先對準洞的中心軸、在洞口外 6 cm，再往裡推
    const Qd = new THREE.Quaternion().setFromAxisAngle(side, 1.4).multiply(Q)
    sit.position.copy(P0); sit.quaternion.copy(Qd); sit.updateMatrixWorld(true)
    const cm = V(); { const P = sk.geometry.attributes.position; let c = 0; for (let i = 0; i < P.count; i += 3) { sk.getVertexPosition(i, v).applyMatrix4(sk.matrixWorld); cm.add(v); c++ } cm.divideScalar(c).sub(P0) }
    const entry = V(N.x, N.y, N.z).addScaledVector(V(N.nx, 0, N.nz), 0.06).sub(cm)
    const cmL = cm.clone().applyQuaternion(Qd.clone().invert())
    // 餵雛把頭伸進洞：身體往前倒 0.5 rad，嘴尖伸進洞裡 d（從 6 cm 往淺試，挑胸口、肚子都不碰到樹皮的最深那個）
    const Qp = new THREE.Quaternion().setFromAxisAngle(side, 0.5).multiply(Q), hole0 = V(N.x, N.y, N.z), nn = V(N.nx, 0, N.nz)
    sit.position.copy(P0); sit.quaternion.copy(Qp); sit.updateMatrixWorld(true); sk.getVertexPosition(tip, v).applyMatrix4(sk.matrixWorld); const offP = v.clone().sub(P0)
    let poke = hole0.clone().addScaledVector(nn, 0.02).sub(offP)
    for (let d = 0.06; d >= -0.02; d -= 0.01) {
      const p = hole0.clone().addScaledVector(nn, -d).sub(offP); sit.position.copy(p); sit.updateMatrixWorld(true)
      let bad = 0; const PP = sk.geometry.attributes.position, w = V()
      for (let i = 0; i < PP.count && !bad; i += 3) {
        sk.getVertexPosition(i, w).applyMatrix4(sk.matrixWorld)
        if (N.r - Math.hypot(w.x - N.cx, w.z - N.cz) < 0.002) continue
        const rx = w.x - N.x, ry = w.y - N.y, rz = w.z - N.z, al = rx * nn.x + rz * nn.z
        if (Math.hypot(rx - al * nn.x, ry, rz - al * nn.z) > N.hr * 0.95) bad = 1
      }
      if (!bad) { poke = p; s._pokeD = +d.toFixed(2); break }
    }   // 重心在模型自己座標裡的位置（任何姿勢 q：重心 = 原點 + q·cmL）
    const rest = { head: head?.quaternion.clone(), neck: neck?.quaternion.clone(), legs: legs.map((b) => b?.quaternion.clone()) }
    // 2026-11-18 腳的 IK（使用者：「腿要在木上、要匍匐前進」）：抓樹幹的姿勢下量兩隻腳——腳踝（foot 骨頭）的位置、離樹皮多高（d0）、
    // 在洞軸左右哪一邊（lat）、膝蓋往哪邊彎（pole，存在鳥自己的座標裡，身體轉了跟著轉）
    sit.position.copy(stand); sit.quaternion.copy(Q); sit.updateMatrixWorld(true)
    const qInv = Q.clone().invert(), legIK = []
    for (const sd of ['L', 'R']) {
      const th = bone('thigh' + sd), sh = bone('shin' + sd), ft = bone('foot' + sd)
      if (!th || !sh || !ft) { legIK.length = 0; break }
      const Hp = th.getWorldPosition(V()), Kp = sh.getWorldPosition(V()), Ap = ft.getWorldPosition(V())
      const mid = Hp.clone().lerp(Ap, 0.5), pole = Kp.clone().sub(mid).normalize().applyQuaternion(qInv)
      // 腳要踩在樹皮上：站姿模型往後仰之後腳會翹離樹幹 5～11 cm → 抓的點投影到樹皮表面（離表面 d0＝0.8 cm，腳踝在腳趾上面一點）
      const d0 = 0.011, rx = Ap.x - N.cx, rz = Ap.z - N.cz, rl = Math.hypot(rx, rz) || 1
      const A0 = V(N.cx + rx / rl * (N.r + d0), Ap.y, N.cz + rz / rl * (N.r + d0)), lat = A0.clone().sub(V(N.x, N.y, N.z)).dot(side)
      const toes = []; ft.traverse((o) => { if (o.isBone && o !== ft && /toe/.test(o.name) && o.children.every((c) => !c.isBone || !/toe/.test(c.name))) toes.push(o) })   // 腳趾的尖端
      legIK.push({ th, sh, ft, toes, A0, d0, lat, pole, gap0: +(rl - N.r).toFixed(3), legLen: +(Hp.distanceTo(Kp) + Kp.distanceTo(Ap)).toFixed(3), hipGap: +(Math.hypot(Hp.x - N.cx, Hp.z - N.cz) - N.r).toFixed(3), hipToA0: +Hp.distanceTo(A0).toFixed(3) })
    }
    const fruit = new THREE.Mesh(new THREE.SphereGeometry(0.011, 10, 8), new THREE.MeshStandardMaterial({ color: 0xb3261e, roughness: 0.35 })); fruit.visible = false; scene.add(fruit)
    s.dig = { legIK, sit, sk, tip, Q, Q2, Qp, poke, off2, entry, cmL, hole, stand, side, toT, head, neck, legs, rest, fruit, wait: rnd(10, 25), on: false, ph: '', k: 0, home: V(), plan: null }
  }
  const _bq = new THREE.Quaternion(), _bv = V(), _bw = V(), _bv2 = V(), _bq2 = new THREE.Quaternion()
  // 骨頭繞世界座標的軸轉 a（從靜止姿勢算）
  const boneTurn = (b, rest, axis, a) => { if (!b) return; b.quaternion.copy(rest); if (!a) return; b.parent.getWorldQuaternion(_bq).invert(); _bv.copy(axis).applyQuaternion(_bq).normalize(); b.quaternion.premultiply(_bq.setFromAxisAngle(_bv, a)) }
  // 兩節 IK：大腿（thigh）→ 小腿（shin）→ 腳踝（foot 骨頭的位置）對準 T；pole＝膝蓋要往哪邊彎（世界座標）
  const _i1 = V(), _i2 = V(), _i3 = V(), _i4 = V(), _iq = new THREE.Quaternion(), _iq2 = new THREE.Quaternion()
  const aimBone = (b, from, to) => {   // 把骨頭轉一下，讓它原本指向 from 的方向改指向 to（世界座標）
    _iq.setFromUnitVectors(from.normalize(), to.normalize())
    b.getWorldQuaternion(_iq2); _iq2.premultiply(_iq)
    b.parent.getWorldQuaternion(_iq).invert(); b.quaternion.copy(_iq.multiply(_iq2)); b.updateMatrixWorld(true)
  }
  function ik2(L, T, poleW) {
    const H = L.th.getWorldPosition(_i1), K = L.sh.getWorldPosition(_i2), A = L.ft.getWorldPosition(_i3)
    const L1 = H.distanceTo(K), L2 = K.distanceTo(A)
    const dir = _i4.subVectors(T, H); let d = dir.length(); dir.divideScalar(d || 1)
    d = clamp(d, Math.abs(L1 - L2) + 1e-4, (L1 + L2) * 0.999)
    const a = (L1 * L1 - L2 * L2 + d * d) / (2 * d), h = Math.sqrt(Math.max(0, L1 * L1 - a * a))
    const pole = poleW.clone().addScaledVector(dir, -poleW.dot(dir)).normalize()
    const Kt = H.clone().addScaledVector(dir, a).addScaledVector(pole, h)
    aimBone(L.th, K.clone().sub(H), Kt.clone().sub(H))
    const K2 = L.sh.getWorldPosition(V()), A2 = L.ft.getWorldPosition(V())
    aimBone(L.sh, A2.sub(K2), H.clone().addScaledVector(dir, d).sub(K2))
    // 腳掌貼著樹皮：腳趾的方向去掉「往樹裡」的分量（只留沿著樹皮的方向）再稍微往樹皮勾一點點
    if (L.toes?.length && L.radial) {
      const Af = L.ft.getWorldPosition(V()), tc = L.toes.reduce((a, b) => a.add(b.getWorldPosition(V())), V()).divideScalar(L.toes.length), td = tc.clone().sub(Af)
      const want = td.clone().addScaledVector(L.radial, -td.dot(L.radial)).addScaledVector(L.radial, -0.05 * td.length())
      if (want.lengthSq() > 1e-8) aimBone(L.ft, td, want)
    }
  }
  // 往上蹦 n 跳（u 在 [a, b] 之間）：climb 0→1 一階一階上去，crouch 起跳前蹲、落地後一壓
  function hopClimb(u, a, b, n) {
    if (u <= a) return { climb: 0, crouch: 0 }
    if (u >= b) return { climb: 1, crouch: 0 }
    const t = (u - a) / (b - a) * n, i = Math.floor(t), f = t - i
    return { climb: (i + ss(f, 0.35, 0.75)) / n, crouch: f < 0.35 ? ss(f, 0, 0.3) : f > 0.75 ? 0.5 * (1 - ss(f, 0.8, 1)) : 1 - ss(f, 0.35, 0.5) }
  }
  function digPlan(type) {
    if (type === 'feed') return [['look', 1.0], ['poke', 1.6], ['look', 1.2]]
    const P = [['look', 2], ['peck', rnd(4, 7)], ['look', 2], ['chip', rnd(2, 3)]]
    if (Math.random() < 0.5) P.push(['peck', rnd(2, 3.5)])
    P.push(['enter', 4.5], ['inside', rnd(6, 12)], ['peek', 2.2])
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
    let fwd = 0, neckA = 0, headA = 0, yaw = 0, hide = false, climb = 0, dive = 0, crouch = 0
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
    } else if (name === 'enter' && X.legIK.length) {
      // 2026-11-18 匍匐爬進洞（使用者：「腿要在木上、要匍匐前進」）：8 步，左右腳輪流。每一步前半：一隻腳抬起來（離樹皮 1.5 cm 的弧）
      // 往前抓住下一個點（樹皮 → 洞口下緣 → 洞裡的底）；後半：身體往前拉一段。踩著的腳一直釘在樹皮上，大腿、小腿用 IK 跟著身體彎
      const STEPS = 8, t8 = u01 * STEPS, k = Math.min(STEPS - 1, Math.floor(t8)), f = t8 - k
      const aB = (k + ss(f, 0.5, 1)) / STEPS                                   // 身體進度（後半拍才前進）
      const qd = _bq2.setFromAxisAngle(X.side, 1.4 * ss(aB, 0.15, 0.55)).multiply(X.Q)
      X.sit.quaternion.copy(qd)
      // 重心：抓樹幹的位置 → 洞軸上洞口外 5 cm（aB 0～0.5）→ 洞裡 22 cm（0.5～1）
      const cSt = _bw.copy(X.cmL).applyQuaternion(X.Q).add(X.stand), mouth = X.hole.clone().addScaledVector(n, 0.05), deep = X.hole.clone().addScaledVector(n, -0.22)
      const c = aB < 0.5 ? cSt.lerp(mouth, ss(aB, 0, 0.5)) : mouth.lerp(deep, ss(aB, 0.5, 1))
      X.sit.position.copy(c).sub(_bv2.copy(X.cmL).applyQuaternion(qd)); X.sit.updateMatrixWorld(true)
      boneTurn(X.neck, X.rest.neck, X.side, -0.25 * ss(aB, 0.2, 0.6)); boneTurn(X.head, X.rest.head, X.side, -0.15 * ss(aB, 0.2, 0.6))
      X.legs.forEach((b, i) => { if (b) b.quaternion.copy(X.rest.legs[i]) })
      X.sit.updateMatrixWorld(true)
      // 腳的軌跡（s 0→1）：起點（抓樹幹時的腳踝）→ 洞口下緣（s 0.6）→ 洞裡的底（s 1），離樹皮保持 d0
      const footAt = (L, sv, lift) => {
        const lat = sv < 0.6 ? L.lat : L.lat * (1 - 0.4 * ss(sv, 0.6, 1)), rim = X.hole.clone().add(V(0, -N.hr * 0.95, 0)).addScaledVector(X.side, clamp(lat, -N.hr * 0.6, N.hr * 0.6)).addScaledVector(n, L.d0)
        const p = sv < 0.6 ? L.A0.clone().lerp(rim, sv / 0.6) : rim.clone().lerp(X.hole.clone().add(V(0, -N.hr * 0.8, 0)).addScaledVector(X.side, lat * 0.5).addScaledVector(n, -0.07), (sv - 0.6) / 0.4)
        return p.addScaledVector(n, lift)
      }
      X.legIK.forEach((L, li) => {
        const mine = Array.from({ length: STEPS }, (_, j) => j).filter((j) => j % 2 === li)   // 這隻腳在第幾步動
        let done = mine.filter((j) => j < k).length, sw = 0
        if (k % 2 === li) sw = ss(f, 0, 0.5)
        const sv = (done + sw) / mine.length, T = footAt(L, sv, 0.015 * Math.sin(Math.PI * sw))
        L.radial = sv < 0.6 ? V(T.x - N.cx, 0, T.z - N.cz).normalize() : V(0, 1, 0)   // 洞裡：腳掌貼著洞的底（往上是「離開表面」）
        ik2(L, T, L.pole.clone().applyQuaternion(X.sit.quaternion))
      })
      X.sit.visible = u01 < 0.985; s.act = 'nestenter'; X.fruit.visible = false
      return
    } else if (name === 'enter') {
      // 鑽進洞（以前直接往樹幹滑，會像沉進樹皮裡）：先往上爬到身體對準洞口（0～0.45），
      // 再身體往前倒、頭先鑽進去（0.35～1，往裡 24 cm；洞口外圈的樹皮把超出洞口的部分遮掉），最後不畫
      // 2026-11-17 使用者「往上爬進去沒有腳動」：分兩跳往上（五色鳥、啄木鳥在樹幹上是兩腳一起往上蹦）——
      // 每一跳：蹲（腳彎、身體貼近樹幹）→ 蹬（腳伸直、身體往上跳一段）→ 落（腳再抓住樹幹）
      { const H = hopClimb(u01, 0.0, 0.5, 2); climb = H.climb; crouch = H.crouch }
      dive = ss(u01, 0.45, 0.7); fwd = 0.3 * ss(u01, 0.68, 1); crouch *= 1 - dive   // 往前倒時腳回到抓握的樣子（試過收腳：會往外岔開）   // 先倒到水平、重心對準洞軸（entry），再往裡推
      neckA = 0.3 * dive; headA = 0.15 * dive; s.act = 'nestenter'
      if (u01 > 0.97) hide = true
    } else if (name === 'inside') { hide = true; s.act = '' }
    else if (name === 'peek') {
      // 探頭：在洞裡已經轉身臉朝外，頭從洞口慢慢伸出來（嘴尖從洞裡 3 cm → 洞外 5 cm），左右看一看；結束後直接從洞口飛走
      const e = -0.03 + 0.09 * ss(u01, 0, 0.35)
      X.sit.visible = true
      X.sit.position.copy(X.hole).addScaledVector(n, e).sub(X.off2)
      X.sit.quaternion.copy(X.Q2).premultiply(_bq.setFromAxisAngle(up, u01 > 0.35 ? 0.1 * Math.sin((u01 - 0.35) * 11) : 0))   /* 身體幾乎不轉：在洞裡轉了會插進洞壁 */
      boneTurn(X.neck, X.rest.neck, X.side, 0); boneTurn(X.head, X.rest.head, X.side, 0)
      if (u01 > 0.35 && X.head) { const yw = 0.4 * Math.sin((u01 - 0.35) * 9); X.head.parent.getWorldQuaternion(_bq).invert(); _bv.copy(up).applyQuaternion(_bq).normalize(); X.head.quaternion.premultiply(_bq.setFromAxisAngle(_bv, yw)) }
      X.sit.updateMatrixWorld(true); X.fromHole = true; s.act = 'look'
      return
    } else if (name === 'poke') {
      // 餵雛：頭伸進洞裡（身體往前 6 cm），停一下，果子不見，退出來
      // 小跳一下到洞口（腳蹬），身體往前倒、頭伸進洞裡（深度在 barbetSetup 量好，胸口不碰樹皮）
      const inn = ss(u01, 0.05, 0.35) * (1 - ss(u01, 0.72, 1)); { const H = hopClimb(u01, 0, 0.35, 1); crouch = H.crouch }
      s.act = 'feedchick'
      X.sit.quaternion.copy(X.Q).slerp(X.Qp, inn); X.sit.position.copy(X.stand).lerp(X.poke, inn); X.sit.updateMatrixWorld(true)
      boneTurn(X.neck, X.rest.neck, X.side, 0); boneTurn(X.head, X.rest.head, X.side, 0)
      X.legs.forEach((b, i) => { if (b) b.quaternion.copy(X.rest.legs[i]) })
      X.sit.visible = true; X.sit.updateMatrixWorld(true)
      // 2026-11-18 腳用 IK 踩在樹皮上：小跳到洞口時，腳的落點跟著身體往上移（投影回樹皮表面），起跳那下離開樹皮 1.5 cm
      if (X.legIK.length) for (const L of X.legIK) {
        const T = L.A0.clone(); T.y += (X.poke.y - X.stand.y) * inn
        const rl = Math.hypot(T.x - N.cx, T.z - N.cz) || 1; L.radial = V((T.x - N.cx) / rl, 0, (T.z - N.cz) / rl)
        T.x = N.cx + L.radial.x * (N.r + L.d0 + 0.015 * crouch); T.z = N.cz + L.radial.z * (N.r + L.d0 + 0.015 * crouch)
        ik2(L, T, L.pole.clone().applyQuaternion(X.sit.quaternion))
      }
      if (u01 > 0.5) X.fruitOn = false
      if (X.fruitOn) { X.sk.getVertexPosition(X.tip, _bw).applyMatrix4(X.sk.matrixWorld); X.fruit.position.copy(_bw); X.fruit.visible = true } else X.fruit.visible = false
      return
    } else if (!name) {   // 做完：飛回樹冠
      X.sit.visible = false; X.ph = 'back'; s.t = 0
      const A = X.fromHole ? X.hole.clone().addScaledVector(n, 0.12) : X.stand.clone().add(V(0, 0.1, 0)).addScaledVector(n, 0.1), B = X.home.clone(); X.fromHole = false
      const sd = V(-n.z, 0, n.x); if (sd.dot(V(B.x - A.x, 0, B.z - A.z)) < 0) sd.negate()
      X.curve = new THREE.CubicBezierCurve3(A, A.clone().addScaledVector(n, 1.4).addScaledVector(sd, 1.2).add(V(0, 0.3, 0)), B.clone().add(V(0, 1.0, 0)).addScaledVector(sd, 0.6), B); X.len = X.curve.getLength(); X.dist = 0
      s.head = Math.atan2(n.x, n.z); return
    }
    X.sit.visible = !hide
    // climb：往上爬到身體中心對準洞口（約 1.6 倍洞口半徑）；dive：身體往前倒 0.9 rad（頭朝洞裡）
    X.sit.quaternion.copy(X.Q).premultiply(_bq.setFromAxisAngle(X.side, (name === 'enter' ? 1.4 : 0.9) * dive)).premultiply(_bq.setFromAxisAngle(up, yaw * 0.25))   /* 進洞：身體轉到幾乎水平、順著洞的通道（斜著穿過洞口，切面會比洞大）*/
    if (name === 'enter') {
      // 繞重心轉（以前繞腳轉：往前倒時整隻甩離樹幹）：重心沿直線從抓樹幹的位置移到洞軸上、洞口外 6 cm，再往裡推
      const cSt = _bw.copy(X.cmL).applyQuaternion(X.Q).add(X.stand), cEn = _bv2.copy(X.cmL).applyQuaternion(_bq2.setFromAxisAngle(X.side, 1.4).multiply(X.Q)).add(X.entry)
      const c = cSt.lerp(cEn, Math.min(1, 0.55 * climb + 0.45 * dive)).addScaledVector(X.toT, fwd)
      X.sit.position.copy(c).sub(_bv2.copy(X.cmL).applyQuaternion(X.sit.quaternion))
    } else X.sit.position.copy(X.stand).addScaledVector(X.toT, fwd).add(V(0, climb * N.hr * 1.6, 0))
    X.sit.updateMatrixWorld(true)
    boneTurn(X.neck, X.rest.neck, X.side, -neckA); boneTurn(X.head, X.rest.head, X.side, -headA)
    // 腳：蹲＝大腿往前收、小腿往後折、腳掌往上翻（貼著樹幹）；平常微微抓動（抓樹皮換位置）
    { const grip = name === 'peck' || name === 'look' ? 0.06 * Math.sin(X.k * 1.7) : 0
      X.legs.forEach((b, i) => { const sg = [-1, 1.6, -0.9][i % 3]; boneTurn(b, X.rest.legs[i], X.side, sg * (0.55 * crouch + grip * (i < 3 ? 1 : -1))) })   /* 方向截圖驗過：正的會把腳往前伸直 */
      // 2026-11-18 腳釘在樹皮上（IK）：抓著樹幹的時候（張望、啄、叼木屑）腳踝對準樹皮上的那兩個點
      if (X.legIK.length && (name === 'look' || name === 'peck' || name === 'chip') && X.sit.visible) { X.sit.updateMatrixWorld(true); for (const L of X.legIK) { L.radial = V(L.A0.x - N.cx, 0, L.A0.z - N.cz).normalize(); ik2(L, L.A0, L.pole.clone().applyQuaternion(X.sit.quaternion)) } } }
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

  /* ---------- 2026-11-18 貓頭鷹狩獵（使用者規格：#039 草鴞、#083 烏林鴞，兩種策略要一看就分得出來）----------
     草鴞：白天躲在巢的高草裡；起飛 → 在草頂上 0.5～1.5 m 來回低飛搜（S 形兩趟）→ 聽到了減速、頭朝下 → 撲進草裡 → 抓到（約六成）就帶著老鼠飛到旁邊的高草裡吃，吃完飛回巢
     烏林鴞：停在林緣枝頭；靜靜看（慢慢轉頭、呼吸）→ 臉盤對著老鼠歪頭左右聽 → 身體前傾離枝、一路滑下去撲地上的老鼠 → 抓到帶回枝頭吃
     腳：飛行模型沒有腳的骨頭 → 站姿模型再複製一份、只留腳的三角形（同一張貼圖），掛在飛行模型肚子下面，撲下去時往前伸、落地時踩在地上
     老鼠：最多 4 隻輪流用（物件池），HIDDEN／MOVING／TARGETED／CAPTURED／ESCAPED；平常不畫，被鎖定前後才出來跑一跑 */
  const prey = { list: [], geo: null, mat: null }
  function preyGeo() {
    if (prey.geo) return
    const C = new THREE.Color(), part = (g, hex) => {
      g.deleteAttribute('uv'); C.set(hex)
      const n = g.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) { a[i * 3] = C.r; a[i * 3 + 1] = C.g; a[i * 3 + 2] = C.b }
      g.setAttribute('color', new THREE.BufferAttribute(a, 3)); if (!g.index) g.setIndex([...Array(n).keys()]); return g
    }
    // 頭朝 +z；身體長約 0.12（鼻尖到屁股），尾巴另外 0.09。實際大小照貓頭鷹的遊戲放大倍率縮放（preyGet）
    prey.geo = mergeGeometries([
      part(new THREE.SphereGeometry(1, 10, 7).scale(0.026, 0.022, 0.046).translate(0, 0.023, 0), 0x6b5847),
      part(new THREE.SphereGeometry(1, 9, 6).scale(0.018, 0.017, 0.024).translate(0, 0.028, 0.048), 0x735e4b),
      part(new THREE.ConeGeometry(0.009, 0.018, 7).rotateX(Math.PI / 2).translate(0, 0.025, 0.074), 0x6e5a48),
      part(new THREE.SphereGeometry(0.0035, 5, 4).translate(0, 0.024, 0.083), 0x2a1f1a),
      part(new THREE.SphereGeometry(0.0032, 5, 4).translate(0.011, 0.034, 0.06), 0x111111),
      part(new THREE.SphereGeometry(0.0032, 5, 4).translate(-0.011, 0.034, 0.06), 0x111111),
      part(new THREE.CircleGeometry(0.009, 8).rotateY(0.5).translate(0.012, 0.046, 0.042), 0x9b7c6c),
      part(new THREE.CircleGeometry(0.009, 8).rotateY(-0.5).translate(-0.012, 0.046, 0.042), 0x9b7c6c),
      part(new THREE.CylinderGeometry(0.0032, 0.0012, 0.09, 5).rotateX(Math.PI / 2 + 0.22).translate(0, 0.013, -0.088), 0x8b7565),
    ])
    prey.mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, side: THREE.DoubleSide })
  }
  function preyGet(scale) {
    preyGeo()
    let M = prey.list.find((q) => q.state === 'HIDDEN' && !q.owner)
    if (!M && prey.list.length < 4) {
      const mesh = new THREE.Mesh(prey.geo, prey.mat); mesh.visible = false; mesh.name = 'owlPrey'; mesh.userData.noOcc = true; mesh.receiveShadow = true; scene.add(mesh)
      M = { mesh, state: 'HIDDEN', p: V(), spot: V(), h: 0, t: 0, v: 0, goal: null, pause: 0, owner: null }; prey.list.push(M)
    }
    if (M) M.mesh.scale.setScalar(scale)
    return M
  }
  const preySet = (M, st) => { if (!M) return; M.state = st; M.t = 0; M.goal = null; M.pause = 0; M.mesh.visible = st !== 'HIDDEN'; if (st === 'HIDDEN') M.owner = null; if (st !== 'CAPTURED' && st !== 'HIDDEN') { M.p.y = terrainHeight(M.p.x, M.p.z); M.mesh.position.copy(M.p) } }
  // 被嚇跑：往背離貓頭鷹的方向跑 2～2.5 m，鑽進草裡不見
  const preyEscape = (M, from) => { if (!M || M.state === 'HIDDEN') return; preySet(M, 'ESCAPED'); const d = V(M.p.x - from.x, 0, M.p.z - from.z); if (d.lengthSq() < 1e-4) d.set(1, 0, 0); d.normalize(); M.goal = M.p.clone().addScaledVector(d, rnd(2, 2.5)); M.spot.copy(M.goal) }
  function preyTick(dt) {
    for (const M of prey.list) {
      if (M.state === 'HIDDEN' || M.state === 'CAPTURED') continue
      M.t += dt
      if (!M.goal || Math.hypot(M.p.x - M.goal.x, M.p.z - M.goal.z) < 0.03) {
        if (M.state === 'ESCAPED') { preySet(M, 'HIDDEN'); continue }
        M.pause = M.state === 'TARGETED' ? rnd(0.15, 0.4) : rnd(0.4, 1.4)   // 跑一小段、停一下（鎖定之後停得比較短、比較緊張）
        const a = rnd(0, Math.PI * 2), r = rnd(0.08, M.state === 'TARGETED' ? 0.22 : 0.45)
        M.goal = V(M.spot.x + Math.sin(a) * r, 0, M.spot.z + Math.cos(a) * r)
      }
      if ((M.pause -= dt) > 0) M.v = 0
      else {
        const sp = M.state === 'ESCAPED' ? 1.4 : M.state === 'TARGETED' ? 0.8 : 0.5
        const dx = M.goal.x - M.p.x, dz = M.goal.z - M.p.z, d = Math.hypot(dx, dz) || 1, st = Math.min(d, sp * dt)
        M.p.x += dx / d * st; M.p.z += dz / d * st; M.h = Math.atan2(dx, dz); M.v = sp
      }
      M.p.y = terrainHeight(M.p.x, M.p.z)
      M.mesh.position.copy(M.p); if (M.v) M.mesh.position.y += 0.004 * M.mesh.scale.x * Math.abs(Math.sin(M.t * 26))
      M.mesh.rotation.set(0, M.h, M.v ? 0.06 * Math.sin(M.t * 26) : 0)
    }
  }

  const _oq = new THREE.Quaternion(), _oq2 = new THREE.Quaternion(), _ov = V(), _ov2 = V(), _ov3 = V(), _ov4 = V(), YAX = V(0, 1, 0)
  const boneOf = (root, n) => { let b = null; root.traverse((o) => { if (o.isBone && o.name === n && !b) b = o }); return b }
  // 骨頭繞世界座標的軸依序轉（從 rest 姿勢算）
  function boneWorld(b, rest, turns) {
    if (!b) return
    b.quaternion.copy(rest); b.parent.updateWorldMatrix(true, false); b.parent.getWorldQuaternion(_oq).invert()
    for (const [ax, a] of turns) { if (!a) continue; _ov.copy(ax).applyQuaternion(_oq).normalize(); b.quaternion.premultiply(_oq2.setFromAxisAngle(_ov, a)) }
    b.updateMatrixWorld(true)
  }
  // 停棲模型的骨頭姿勢（照順序）複製到 sit：換模型那一格姿勢一模一樣，看不出換了
  const syncPose = (from, to) => { for (let i = 0; i < from.length; i++) { to[i].quaternion.copy(from[i].quaternion); to[i].position.copy(from[i].position) } }

  function owlSetup(u) {
    const s = u.ms[0], m = s.m
    if (s.hunt || !s.root || !m.obj) return
    m.obj.updateMatrixWorld(true)
    let skin = null; m.obj.traverse((o) => { if (o.isSkinnedMesh && !skin) skin = o })
    if (!skin || !boneOf(m.obj, 'thighL') || !boneOf(m.obj, 'footL')) return
    const P0 = m.obj.getWorldPosition(V()), Q0 = m.obj.getWorldQuaternion(new THREE.Quaternion()), S0 = m.obj.getWorldScale(V())
    // 朝向：Tripo 模型頭朝模型的 -x
    const fw = V(-1, 0, 0).transformDirection(skin.matrixWorld).setY(0).normalize(), h0 = Math.atan2(fw.x, fw.z)
    const sit = skClone(m.obj); sit.traverse((o) => { o.visible = true; o.frustumCulled = false; if (o.isMesh) o.castShadow = false }); sit.visible = false; scene.add(sit)   // 有骨架的鳥不投太陽影子（shadowcache.js noSun）
    const mB = [], sB = []; m.obj.traverse((o) => { if (o.isBone) mB.push(o) }); sit.traverse((o) => { if (o.isBone) sB.push(o) })
    // 腳：只留小腿、腳掌、腳趾（跟它們相連的大腿下緣）的三角形
    const legs = skClone(m.obj); let lsk = null; legs.traverse((o) => { o.visible = true; o.frustumCulled = false; if (o.isSkinnedMesh && !lsk) lsk = o })
    {
      const g = lsk.geometry, si = g.attributes.skinIndex, sw = g.attributes.skinWeight, bn = lsk.skeleton.bones.map((b) => b.name)
      const leg = new Uint8Array(g.attributes.position.count)
      for (let i = 0; i < leg.length; i++) { let bw = -1, nm = ''; for (let c = 0; c < 4; c++) if (sw.getComponent(i, c) > bw) { bw = sw.getComponent(i, c); nm = bn[si.getComponent(i, c)] ?? '' } leg[i] = /shin|foot|toe/.test(nm) ? 2 : /thigh/.test(nm) ? 1 : 0 }
      const ix = g.index.array, keep = []
      for (let i = 0; i < ix.length; i += 3) { const a = leg[ix[i]], b = leg[ix[i + 1]], c = leg[ix[i + 2]]; if (a && b && c && (a === 2 || b === 2 || c === 2)) keep.push(ix[i], ix[i + 1], ix[i + 2]) }
      const g2 = g.clone(); g2.setIndex(keep); lsk.geometry = g2
    }
    lsk.castShadow = false
    legs.traverse((o) => { if (o.isMesh && o !== lsk) o.visible = false })
    const lb = (n) => boneOf(legs, n), L = { thL: lb('thighL'), thR: lb('thighR'), shL: lb('shinL'), shR: lb('shinR'), ftL: lb('footL'), ftR: lb('footR'), toesL: [], toesR: [], rest: new Map() }
    legs.traverse((o) => { if (o.isBone) { L.rest.set(o, o.quaternion.clone()); if (/^toeL/.test(o.name)) L.toesL.push(o); if (/^toeR/.test(o.name)) L.toesR.push(o) } })
    const mb = (n) => boneOf(m.obj, n).getWorldPosition(V())
    const hipW = mb('thighL').add(mb('thighR')).multiplyScalar(0.5)
    const legLen = mb('thighL').distanceTo(mb('shinL')) + mb('shinL').distanceTo(mb('footL'))
    const qy = new THREE.Quaternion().setFromAxisAngle(YAX, -h0), hipRel = hipW.clone().sub(P0).applyQuaternion(qy)
    // 飛行模型肚子的高度：root 暫時放原點、不轉，量身體中段最低的頂點
    const R0 = s.root, keepP = R0.position.clone(), keepR = R0.rotation.clone()
    R0.position.set(0, 0, 0); R0.rotation.set(0, 0, 0); R0.updateMatrixWorld(true)
    let fsk = null; s.r.model.traverse((o) => { if (o.isSkinnedMesh && !fsk) fsk = o })
    s.r.reset(); s.r.model.updateMatrixWorld(true)
    const fbox = new THREE.Box3().setFromObject(s.r.model), fl = fbox.max.z - fbox.min.z, fspan = fbox.max.x - fbox.min.x
    // 飛行模型自己畫的腳（草鴞：拖在尾巴下面、綁在 tail 骨頭；烏林鴞：垂在肚子下面）：腳伸出來的時候把那幾片面拿掉，不然會有四隻腳
    // （位置是 root 座標、公尺；tools/record/owlfly.js 畫側視散佈圖量的）
    const FL = u.esc.flyLegs, FP = fsk.geometry.attributes.position, fsi = fsk.geometry.attributes.skinIndex, fsw = fsk.geometry.attributes.skinWeight, fbn = fsk.skeleton.bones.map((b) => b.name)
    const isFL = new Uint8Array(FP.count), fv = []
    let belly = 0, v = V(), hz = u.esc.hipZ ?? 0
    for (let i = 0; i < FP.count; i++) {
      fsk.getVertexPosition(i, v).applyMatrix4(fsk.matrixWorld); fv.push(v.x, v.y, v.z)
      let bw = -1, bn = ''; for (let c = 0; c < 4; c++) if (fsw.getComponent(i, c) > bw) { bw = fsw.getComponent(i, c); bn = fbn[fsi.getComponent(i, c)] }
      if (FL && ((v.y > FL.y[0] && v.y < FL.y[1] && v.z > FL.z[0] && v.z < FL.z[1] && (!FL.bone || bn === FL.bone)) || (FL.tip && v.z < FL.tip.z && v.y < FL.tip.y))) isFL[i] = 1   // tip：尾巴後下方的腳趾（有的綁在 body 骨頭）
    }
    for (let i = 0; i < FP.count; i++) if (!isFL[i] && Math.abs(fv[i * 3]) < fspan * 0.06 && Math.abs(fv[i * 3 + 2] - hz) < 0.04) belly = Math.min(belly, fv[i * 3 + 1])
    fsk.geometry = fsk.geometry.clone()
    const idxFull = fsk.geometry.index, ia = idxFull.array, keepF = []
    for (let i = 0; i < ia.length; i += 3) if (!(isFL[ia[i]] && isFL[ia[i + 1]] && isFL[ia[i + 2]])) keepF.push(ia[i], ia[i + 1], ia[i + 2])
    const idxNoLeg = new THREE.BufferAttribute(ia.length > 65535 * 3 || FP.count > 65535 ? new Uint32Array(keepF) : new Uint16Array(keepF), 1)
    legs.quaternion.copy(qy).multiply(Q0); legs.scale.copy(S0)
    legs.position.copy(V(0, belly + legLen * 0.3, hz)).sub(hipRel)
    legs.visible = false; R0.add(legs)  ; R0.updateMatrixWorld(true)
    // 大腿往前轉的正負號用試的（腳掌往 +z＝前面走的那個方向）
    const f0 = L.ftL.getWorldPosition(V()).z
    boneWorld(L.thL, L.rest.get(L.thL), [[V(1, 0, 0), 0.5]])
    L.sgn = L.ftL.getWorldPosition(V()).z > f0 ? 1 : -1
    boneWorld(L.thL, L.rest.get(L.thL), [])
    L.len = legLen
    R0.position.copy(keepP); R0.rotation.copy(keepR); R0.updateMatrixWorld(true)
    const realK = s.m.obj && REAL_CM[u.b.def.id] ? (u.b.size || 0.5) / (REAL_CM[u.b.def.id] / 100) : 1.4
    const H = { kind: u.esc.hunt, sit, mB, sB, legs, L, P0, Q0, S0, h0, fw, fl, fsk, idxFull, idxNoLeg, nFL: isFL.reduce((a, b) => a + b, 0), belly: -belly * 0.9, on: false, ph: '', pt: 0, wait: rnd(15, 35), mouse: null, mouseK: realK * 0.8, retry: 0, acc: 0, fr: 0, n: 0, log: [] }
    s.hunt = H
    if (H.kind === 'quarter') grassSetup(u, s, H)
    else ggSetup(u, s, H)
  }
  // ---- 草鴞的場地：西北草原。巢＝EAST.owlNest；狩獵區 25 × 35 m（巢的南邊、觀察屋 O7 看得到）；草頂高度表、獵物點、安全降落點 ----
  function grassSetup(u, s, H) {
    const [nx, nz] = EAST.owlNest
    const Z = { x0: nx - 16, x1: nx + 9, z0: nz - 28, z1: nz + 7 }
    H.zone = Z; H.nest = V(nx, 0, nz)
    // 草頂高度（每 1 m 一格，取格子裡最高的草尖；再取周圍 1 格的最大值，飛的時候不會擦過草尖）
    const gx0 = Z.x0 - 6, gz0 = Z.z0 - 6, NX = Math.ceil(Z.x1 - Z.x0 + 12), NZ = Math.ceil(Z.z1 - Z.z0 + 12), top = new Float32Array(NX * NZ)
    scene.traverse((o) => {
      const A = o.geometry?.attributes?.gA, B = o.geometry?.attributes?.gB; if (!A || !B || !o.geometry.isInstancedBufferGeometry) return
      const a = A.array, b = B.array
      for (let i = 0; i < a.length; i += 4) {
        const ix = Math.floor(a[i] - gx0), iz = Math.floor(a[i + 2] - gz0); if (ix < 0 || iz < 0 || ix >= NX || iz >= NZ) continue
        const t = a[i + 1] + Math.abs(b[i + 3]) - terrainHeight(a[i], a[i + 2]); if (t > top[iz * NX + ix]) top[iz * NX + ix] = t
      }
    })
    const top2 = new Float32Array(NX * NZ)
    for (let z = 0; z < NZ; z++) for (let x = 0; x < NX; x++) { let mx = 0; for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) { const X = x + dx, Zz = z + dz; if (X >= 0 && Zz >= 0 && X < NX && Zz < NZ) mx = Math.max(mx, top[Zz * NX + X]) } top2[z * NX + x] = mx }
    const T2 = (ix, iz) => top2[clamp(iz, 0, NZ - 1) * NX + clamp(ix, 0, NX - 1)]
    H.top = (x, z) => { const fx = x - gx0 - 0.5, fz = z - gz0 - 0.5, ix = Math.floor(fx), iz = Math.floor(fz), u = fx - ix, w = fz - iz; return lerp(lerp(T2(ix, iz), T2(ix + 1, iz), u), lerp(T2(ix, iz + 1), T2(ix + 1, iz + 1), u), w) }   // 雙線性（以前一格一格跳，飛行高度會突然差 0.6 m）
    H.topRaw = (x, z) => { const ix = clamp(Math.floor(x - gx0), 0, NX - 1), iz = clamp(Math.floor(z - gz0), 0, NZ - 1); return top[iz * NX + ix] }
    // 獵物可能出現的點：狩獵區南半邊（芒草塊的邊緣、中高草裡），離步道 4 m 以上、離觀察屋 6 m 以上
    const hide = EAST.hides[0]
    H.prey = [[-10, -23.5], [-3, -25], [4, -23], [-13, -17], [6, -18.5]].map(([dx, dz]) => V(nx + dx, 0, nz + dz))
      .filter((p) => alpineTrailDist(p.x, p.z) > 4 && Math.hypot(p.x - hide[0], p.z - hide[1]) > 6 && p.x > Z.x0 && p.x < Z.x1 && p.z > Z.z0 && p.z < Z.z1)
    for (const p of H.prey) p.y = terrainHeight(p.x, p.z)
    { const near = nearMeshes(V(nx, 0, nz - 20), 22); H.prey = H.prey.filter((p) => !spotClutter(near, p)) }   // 灌木、石頭、孤樹旁邊不要
    // 安全降落點：巢附近 6～12 m、草最高最密、離步道 8 m 以上的地方（吃老鼠的地方）
    let best = -1; H.safe = H.nest.clone().add(V(-6, 0, -3))
    for (let a = 0; a < 24; a++) for (const r of [6, 8, 10, 12]) {
      const x = nx + Math.sin(a / 24 * Math.PI * 2) * r, z = nz + Math.cos(a / 24 * Math.PI * 2) * r
      if (alpineTrailDist(x, z) < 8) continue
      const sc = H.topRaw(x, z) + H.topRaw(x + 1, z) + H.topRaw(x - 1, z) + H.topRaw(x, z + 1) + H.topRaw(x, z - 1)
      if (sc > best) { best = sc; H.safe.set(x, 0, z) }
    }
    H.routes = new Map()
    H.grassH = (x, z) => terrainHeight(x, z) + Math.max(0.5, H.top(x, z))
  }
  // 巡獵路線（照獵物點、從哪一邊開始掃 快取起來）：巢 → 第一趟橫掃 → U 形轉彎 → 第二趟往獵物那邊 → 聽音的起點
  function grassRoute(H, pi, vr) {
    const key = pi * 2 + vr
    if (H.routes.has(key)) return H.routes.get(key)
    const Z = H.zone, p = H.prey[pi], W = Z.x0 + 2.5, E = Z.x1 - 2.5, s0 = vr ? W : E, s1 = vr ? E : W
    const zA = H.nest.z - 6, zB = p.z + 2.5, dir = Math.sign(s1 - s0)
    const sgn = Math.abs(s1 - p.x) > 4 ? Math.sign(s1 - p.x) : -dir   // 第二趟從 s1 那邊往獵物飛
    const Ls = V(p.x + sgn * 4.2, 0, zB), Le = V(p.x + sgn * 1.4, 0, p.z + 0.7)
    const r = Math.max(2.5, (zA - zB) / 2)
    const pts = [H.nest.clone(), V(H.nest.x + (s0 - H.nest.x) * 0.45, 0, zA + 2.2), V(s0, 0, zA), V((s0 + s1) / 2, 0, zA - 0.6), V(s1, 0, zA),
      V(s1 + dir * r * 0.55, 0, (zA + zB) / 2), V(s1, 0, zB)]
    if (Math.abs(s1 - Ls.x) > 7) pts.push(V((s1 + Ls.x) / 2, 0, zB + 0.4))
    pts.push(Ls)
    const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal'), len = curve.getLength()
    const listen = new THREE.QuadraticBezierCurve3(Ls, V(p.x + sgn * 2.4, 0, zB - 0.3), Le), R = { curve, len, listen, llen: listen.getLength(), p, Le }
    H.routes.set(key, R); return R
  }
  // ---- 烏林鴞：停的枝頭不動；地上找 3 個老鼠點（7～13 m、在枝頭前方、不在步道和水裡、坡平、滑下去的路上沒有樹幹） ----
  function ggSetup(u, s, H) {
    const P = s.m.obj.getWorldPosition(V()), fw = H.fw
    H.home = P.clone()
    const box = new THREE.Box3().setFromObject(s.m.obj); H.homeC = box.getCenter(V()); H.perchH = box.max.y - box.min.y
    const trunks = colliders.filter((c) => c.top < 60 && (c.x - P.x) ** 2 + (c.z - P.z) ** 2 < 30 * 30)
    const cands = [], rej = H.rej = { drop: 0, trail: 0, slope: 0, river: 0, lake: 0, front: 0, trunk: 0 }
    for (let a = 0; a < 48; a++) for (let r = 6; r <= 13; r += 1) {
      const th = a / 48 * Math.PI * 2, x = P.x + Math.sin(th) * r, z = P.z + Math.cos(th) * r, g = terrainHeight(x, z)
      if (P.y - g < 1.4) { rej.drop++; continue } if (alpineTrailDist(x, z) < 2.2) { rej.trail++; continue }
      const sl = Math.max(Math.abs(terrainHeight(x + 0.6, z) - g), Math.abs(terrainHeight(x, z + 0.6) - g))
      if (sl > 0.42) { rej.slope++; continue }   // 緩坡（0.6 m 內高差 42 cm 以內）
      if (riverDist(x, z) < 4) { rej.river++; continue }
      if (lakeWater != null && g < lakeWater + 0.8) { rej.lake++; continue }   // 湖邊、河谷底（比瀑布湖水面高不到 0.8 m）不要
      // 2026-11-18 不看牠現在面向哪邊（停著會自己轉身，每次不一樣）：在背後的話，靜候時身體先在枝上轉過去。這根枝朝西看河谷（西邊是 8～10 m 深的河谷、東邊坡比枝還高）→ 能撲的大多是北邊緩坡
      // 滑下去的路（直線，從枝頭往下）離每根樹幹至少 0.9 m
      let clear = 9
      for (let k = 1; k <= 12; k++) {
        const t = k / 12, qx = P.x + (x - P.x) * t, qz = P.z + (z - P.z) * t, qy = P.y + (g - P.y) * t
        for (const c of trunks) { if (qy > c.top) continue; const d = Math.hypot(qx - c.x, qz - c.z) - (c.r ?? 0.3); if (Math.hypot(c.x - P.x, c.z - P.z) < 1.2) continue; clear = Math.min(clear, d) }
      }
      if (clear < 0.9) { rej.trunk++; continue }
      cands.push({ p: V(x, g, z), score: Math.min(clear, 3) - Math.abs(r - 8.5) * 0.25 - sl * 2, th })
    }
    cands.sort((a, b) => b.score - a.score)
    const near = nearMeshes(P, 16), cam = u.b.cam ? V(u.b.cam.x, u.b.cam.y, u.b.cam.z) : null
    H.prey = []; rej.clutter = 0; rej.unseen = 0; spotClutter.hits = []; H.hits = spotClutter.hits
    for (const c of cands) {
      if (H.prey.some((q) => q.distanceTo(c.p) < 1.4)) continue
      if (spotClutter(near, c.p)) { rej.clutter++; continue }
      if (cam && (!spotSeen(near, cam, c.p) || trunkBlock(trunks, cam, c.p))) { rej.unseen++; continue }
      H.prey.push(c.p); if (H.prey.length >= 3) break
    }
    H.cands = cands.length
    const mb = (n) => boneOf(H.sit, n)
    H.head = mb('head'); H.neck = mb('neck'); H.body = mb('body'); H.wingL = mb('wingL'); H.wingR = mb('wingR')
    H.ok = H.prey.length > 0
  }
  // 獵物點附近的東西（石頭、灌木、樹幹、步道欄杆…）：獵物點旁邊 0.8 m 內有東西 → 貓頭鷹撲下去會插進去，不要；
  // 從觀察點（鳥的 cam）看過去被擋住 → 玩家看不到，扣分。草（InstancedBufferGeometry）、地形（很大的 mesh）、會動的不算
  function nearMeshes(c, R) {
    const out = [], sp = new THREE.Sphere()
    scene.traverse((o) => {
      if (!o.isMesh || o.isSkinnedMesh || o.geometry?.isInstancedBufferGeometry || !o.geometry?.attributes?.position || o.name === 'owlPrey' || /terrain|ground/i.test(o.name)) return   // 地形另外用高度表算（斜坡會被水平射線打到）
      // 不看 visible（遠近版本、遮擋剔除會暫時藏起來，結果每次不一樣）
      if (o.isInstancedMesh) { if (!o.boundingSphere) o.computeBoundingSphere(); sp.copy(o.boundingSphere) } else { if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere(); sp.copy(o.geometry.boundingSphere) }
      sp.applyMatrix4(o.matrixWorld)
      if (sp.radius < 60 && sp.center.distanceTo(c) < R + sp.radius) out.push(o)
    })
    return out
  }
  const _rc = new THREE.Raycaster()
  function spotClutter(list, p) {   // 0.8 m 內、離地 0.1～1.0 m 有東西
    for (const h of [0.15, 0.5, 0.9]) for (let a = 0; a < 8; a++) {
      _rc.set(V(p.x, p.y + h, p.z), V(Math.sin(a * Math.PI / 4), 0, Math.cos(a * Math.PI / 4))); _rc.far = 0.8
      const hit = _rc.intersectObjects(list, false)[0]
      if (hit) { (spotClutter.hits ??= []).push((hit.object.name || hit.object.parent?.name || '?') + '|' + (hit.object.material?.name ?? '') + '|' + h + '|' + hit.distance.toFixed(2)); return true }
    }
    return false
  }
  function spotSeen(list, from, p) {   // 觀察點看獵物點（離地 0.3 m）有沒有被擋住
    const to = V(p.x, p.y + 0.3, p.z), d = to.clone().sub(from), L = d.length()
    _rc.set(from, d.divideScalar(L)); _rc.far = L - 0.4
    return _rc.intersectObjects(list, false).length === 0
  }
  // 視線（觀察點 → 獵物點上方 0.3 m）有沒有穿過樹幹（碰撞圓柱，樹幹比視線高的才算）
  const trunkBlock = (trunks, A, p) => {
    for (const c of trunks) {
      const bx = p.x - A.x, bz = p.z - A.z, t = clamp(((c.x - A.x) * bx + (c.z - A.z) * bz) / (bx * bx + bz * bz), 0, 1)
      const d = Math.hypot(A.x + bx * t - c.x, A.z + bz * t - c.z), y = A.y + (p.y + 0.3 - A.y) * t
      if (d < (c.r ?? 0.3) + 0.25 && y < c.top && t > 0.02 && t < 0.98) return true
    }
    return false
  }
  const riverDist = (x, z) => { let d = 1e9; const R = ALP_RIVER; for (let i = 0; i < R.length - 1; i++) { const ax = R[i][0], az = R[i][1], bx = R[i + 1][0] - ax, bz = R[i + 1][1] - az, t = clamp(((x - ax) * bx + (z - az) * bz) / (bx * bx + bz * bz), 0, 1); d = Math.min(d, Math.hypot(x - ax - bx * t, z - az - bz * t)) } return d }
  const lakeWater = YOSE.lake?.water ?? null

  // ---- 飛行模型的姿勢 ----
  // 翅膀固定姿勢：up 往上抬（+1 高舉成 V 字、-1 往下垂、蓋住獵物），sweep 往前收（+）往後收（-）
  function wingHold(s, up, sweep = 0, flut = 0, t = 0) {
    const r = s.r
    for (const [n, sg] of [['L', 1], ['R', -1]]) {
      const f = flut * Math.sin(t * 13 + (sg > 0 ? 0 : 0.4))
      r.turn('wing' + n, AX.y, sg * sweep); r.turn('wingtip' + n, AX.y, sg * sweep * 0.6)
      r.turn('wing' + n, AX.x, -sg * (up * 0.85 + f)); r.turn('wingtip' + n, AX.x, -sg * (up * 0.45 + f * 0.6))
    }
  }
  // 頭：pitch 往下看（+）、yaw 往左右轉
  const headTurn = (s, pitch, yaw = 0) => { s.r.turn('head', AX.z, pitch * OWL_HEAD_SGN); if (yaw) s.r.turn('head', AX.y, yaw) }
  const OWL_HEAD_SGN = 1
  // 腳：ext -1 往後收、0 垂直（站姿）、1 往前下方伸直
  function legPose(s, H, ext) {
    const L = H.L, lat = _ov3.set(1, 0, 0).applyQuaternion(s.root.quaternion)
    for (const sd of ['L', 'R']) {
      boneWorld(L['th' + sd], L.rest.get(L['th' + sd]), [[lat, L.sgn * ext * 0.95]])
      boneWorld(L['sh' + sd], L.rest.get(L['sh' + sd]), [[lat, -L.sgn * Math.max(0, ext) * 0.3]])
      boneWorld(L['ft' + sd], L.rest.get(L['ft' + sd]), [[lat, L.sgn * ext * 0.4]])
    }
  }
  // 兩隻腳腳趾最低的高度、兩腳中間（抓老鼠的點）
  function feetInfo(H, out) {
    const L = H.L; let lo = 1e9
    for (const tb of [...L.toesL, ...L.toesR]) { tb.getWorldPosition(_ov4); lo = Math.min(lo, _ov4.y) }
    L.ftL.getWorldPosition(out); L.ftR.getWorldPosition(_ov4); out.add(_ov4).multiplyScalar(0.5)
    return lo
  }
  // 沿著曲線飛（curve 是 3D 的；speed 公尺/秒）：位置、航向、側傾、俯仰都平滑
  function owlFly(s, X, curve, len, sp, dt, { pitchAdd = 0, yFn = null } = {}) {
    X.dist = Math.min(len, X.dist + sp * dt); const k = X.dist / len
    curve.getPointAt(k, _ov); curve.getTangentAt(Math.min(k, 0.999), _ov2)
    if (yFn) { const yt = yFn(_ov.x, _ov.z, k); X.yS = X.yS == null || X.ySreset ? yt : X.yS + (yt - X.yS) * (1 - Math.exp(-3 * dt)); X.ySreset = false; _ov.y = Math.max(X.yS, yt - 0.25); const k2 = Math.min(1, k + 0.02); curve.getPointAt(k2, _ov4); _ov2.y = (yFn(_ov4.x, _ov4.z, k2) - _ov.y) / Math.max(0.05, len * (k2 - k)); _ov2.normalize() }
    s.root.position.copy(_ov)
    const h = Math.atan2(_ov2.x, _ov2.z), dh = wrap(h - s.head)
    s.head += dh * (1 - Math.exp(-5 * dt)); s.roll = damp(s.roll, clamp(-dh * 2.4, -0.55, 0.55), 3, dt)
    s.pitch = damp(s.pitch, -Math.asin(clamp(_ov2.y, -1, 1)) * 0.7 + pitchAdd, 4, dt)
    s.root.rotation.set(s.pitch, s.head, s.roll); s.root.updateMatrixWorld(true)
    return k >= 1
  }
  // 腳伸出來（借的腳）↔ 收起來（飛行模型自己畫的腳）
  const legsOut = (H, on) => { if (H.legs.visible === on) return; H.legs.visible = on; H.fsk.geometry.setIndex(on ? H.idxNoLeg : H.idxFull) }
  const showRoot = (s, H, on) => { s.root.visible = on; if (!on) legsOut(H, false) }
  function setPh(s, H, ph) { H.ph = ph; H.pt = 0; H.log.push(ph); if (H.log.length > 60) H.log.shift() }
  // 收尾：回到原本的停棲模型（換模型那一格同一個姿勢）
  function huntEnd(u, s, H) {
    H.on = false; H.ph = ''; H.retry = 0; H.n++
    showRoot(s, H, false); H.sit.visible = false; s.m.obj.visible = true; s.mode = 'perch'; s.act = ''
    if (H.mouse) { preySet(H.mouse, 'HIDDEN'); H.mouse = null }
    H.pushK = 0; huntPush(H)
    H.wait = H.kind === 'quarter' ? grassWait() : rnd(35, 75)
  }
  const grassWait = () => { const h = world.time?.hour ?? 12; return h < 6.5 || h > 16.5 ? rnd(25, 55) : rnd(150, 300) }   // 黃昏、夜間、清晨常出來巡獵；白天大多在睡
  function huntPush(H) { const P = grassPush.value[H.kind === 'quarter' ? 0 : 1]; if (!H.pushK) { P.w = 0; return } P.set(H.pushP.x, H.pushP.z, H.pushR ?? 1.1, H.pushK) }
  // 玩家逼太近：中斷，照驚飛那一套從現在的位置飛走（抓到的老鼠一起帶走；還沒抓到的老鼠跑掉）
  function huntAbort(u, s, H) {
    const pos = (H.sit.visible ? H.sit.getWorldPosition(V()) : s.root.position.clone())
    if (H.mouse && H.mouse.state !== 'CAPTURED') preyEscape(H.mouse, pos)
    if (H.mouse?.state === 'CAPTURED') preySet(H.mouse, 'HIDDEN')
    H.mouse = null; H.on = false; H.ph = ''; H.retry = 0; H.sit.visible = false; legsOut(H, false); H.pushK = 0; huntPush(H)
    s.m.obj.updateMatrixWorld(true); _box.setFromObject(s.m.obj); _box.getCenter(s.home)
    s.m.obj.getWorldDirection(_w); s.faceH = Math.atan2(_w.x, _w.z)
    const P = world.camera.position, away = pos.clone().sub(P).setY(0); if (away.lengthSq() < 1e-4) away.set(1, 0, 0)
    s.curve = outbound(pos, away.normalize(), null); s.len = s.curve.getLength(); s.dist = 0; s.t = 0
    s.mode = 'out'; s.root.visible = true; s.m.obj.visible = false; s.wait = rnd(20, 38)
    u.state = 'away'; u.trip = false; u.alarm = 0
    H.wait = H.kind === 'quarter' ? grassWait() : rnd(35, 75); H.aborts = (H.aborts ?? 0) + 1; H.log.push('ABORT')
  }

  /* ---- 草鴞：GRASS_REST → TAKEOFF → QUARTERING → LISTEN → POUNCE → CAPTURE／MISS → DEPART → （安全點吃）→ 回巢 → REST ---- */
  function grassStart(u, s, H, opt = {}) {
    if (!H.prey.length) return false
    const pi = opt.prey ?? Math.floor(Math.random() * H.prey.length), vr = opt.side ?? (Math.random() < 0.5 ? 0 : 1)
    H.R = grassRoute(H, pi, vr); H.result = opt.result ?? (Math.random() < 0.6 ? 'catch' : 'miss'); H.retry = 0
    H.mouse = preyGet(H.mouseK * 0.7)
    if (H.mouse) { H.mouse.owner = H; H.mouse.spot.copy(H.R.p); H.mouse.p.copy(H.R.p); preySet(H.mouse, 'HIDDEN') }
    // 起飛點：巢裡的模型現在站的地方
    s.m.obj.getWorldPosition(H.from = V()); H.R.curve.points[0].set(H.from.x, 0, H.from.z); H.R.curve.updateArcLengths?.(); H.R.len = H.R.curve.getLength()
    syncPose(H.mB, H.sB); H.sit.visible = false
    s.m.obj.visible = false; s.root.visible = true; legsOut(H, false)
    s.r.reset(); s.mode = 'hunt'; H.on = true; H.dist = 0; H.qv = clamp(H.R.len / 15, 2.6, 4.0)   // 巡獵 2.6～4 m/s，整段 15 秒左右
    s.head = H.h0; s.pitch = -0.3; s.roll = 0
    H.pushP = H.from.clone(); H.pushR = 1.4; H.pushK = 1; H.ySreset = true
    s.root.position.copy(H.from).add(V(0, 0.15, 0)); s.root.rotation.set(s.pitch, s.head, 0); s.root.updateMatrixWorld(true)   // 同一格就擺好（不然第一格飛行模型還在上次的位置）
    setPh(s, H, 'takeoff'); s.act = 'takeoff'
    return true
  }
  function grassStep(u, s, H, t, dt) {
    H.pt += dt; s.t += dt
    const R = H.R, alt = (x, z, k) => H.grassH(x, z) + 0.75 + 0.3 * Math.sin(k * R.len * 0.32)   // 草頂上 0.45～1.05 m（草頂取周圍 1 m 最高的，平均草頂上約 0.7～1.6 m）
    if (H.ph === 'takeoff' || H.ph === 'quarter') {
      // 起飛：前 1.5 秒用力拍、從草裡慢慢升到巡獵高度；之後滑翔為主、偶爾拍幾下
      const tk = H.ph === 'takeoff' ? 1 - ss(H.pt, 0.2, 1.5) : 0, sp = H.ph === 'takeoff' ? lerp(0.9, H.qv, ss(H.pt, 0, 1.5)) : H.qv
      const g0 = H.from.y + 0.15, rise = ss(H.dist, 0, 3.2)
      const done = owlFly(s, H, R.curve, R.len, sp, dt, { pitchAdd: -0.35 * tk, yFn: (x, z, k) => lerp(g0, alt(x, z, k), rise) })
      s.r.reset(); wings(s, u.esc.fly, t, dt, tk, 0)
      headTurn(s, 0.3 + 0.1 * Math.sin(H.pt * 0.9), 0.35 * Math.sin(H.pt * 0.55))   // 頭微微朝下、左右慢慢掃
      H.pushK = H.ph === 'takeoff' ? 1 - ss(H.pt, 0.6, 1.6) : 0; huntPush(H)
      if (H.ph === 'takeoff' && H.pt > 1.5) setPh(s, H, 'quarter')
      s.act = H.ph === 'takeoff' ? 'takeoff' : 'quarter'
      if (done) { setPh(s, H, 'listen'); H.dist = 0; H.lv = sp; H.ly0 = s.root.position.y - H.grassH(s.root.position.x, s.root.position.z); if (H.mouse) { H.mouse.p.copy(R.p); preySet(H.mouse, 'MOVING') } }
      return
    }
    if (H.ph === 'listen') {
      // 聽音定位：速度降到 1 m/s 左右、頭往下對著聲音、身體微調方向（不定點懸停）
      H.lv = damp(H.lv, 0.95, 2.2, dt)
      const done = owlFly(s, H, R.listen, R.llen, H.lv, dt, { pitchAdd: -0.2, yFn: (x, z) => H.grassH(x, z) + lerp(H.ly0 ?? 1.15, 1.35, ss(H.pt, 0, 1.5)) })   // 從巡獵結束的高度慢慢升到草頂上 1.35 m（不跳）
      s.r.reset(); wings(s, u.esc.fly, t, dt, 0.25, 0.35)
      const d = R.p.clone().sub(s.root.position), yaw = wrap(Math.atan2(d.x, d.z) - s.head)
      headTurn(s, 0.55 + 0.25 * ss(H.pt, 0, 1), clamp(yaw, -1.2, 1.2) * 0.8)
      s.act = 'quarter'
      if (done || H.pt > 3) {
        setPh(s, H, 'pounce'); H.p0 = s.root.position.clone(); H.pitch0 = s.pitch
        if (H.mouse) preySet(H.mouse, 'TARGETED'), (H.mouse.mesh.visible = true)
        legsOut(H, true)
      }
      return
    }
    if (H.ph === 'pounce') return pounceStep(u, s, H, t, dt, 1.15, 'pounce', () => setPh(s, H, H.result === 'catch' ? 'capture' : 'miss'))
    if (H.ph === 'capture' || H.ph === 'miss') {
      groundStep(u, s, H, t, dt)
      if (H.ph === 'capture' && H.pt > 2.6) { departStart(u, s, H, H.safe, 'depart') }
      if (H.ph === 'miss' && H.pt > 1.7) {
        // 沒抓到：一半機率再巡一小段找別的老鼠（一次），不然就回去
        const others = H.prey.filter((q) => q.distanceTo(R.p) > 3)
        if (H.retry < 1 && others.length && Math.random() < 0.5) {
          H.retry++; const p = others[Math.floor(Math.random() * others.length)]
          const A = s.root.position.clone().setY(0), sgn = Math.sign(A.x - p.x) || 1
          const Ls = V(p.x + sgn * 4.2, 0, p.z + 2.5), Le = V(p.x + sgn * 1.4, 0, p.z + 0.7)
          const curve = new THREE.CatmullRomCurve3([A, A.clone().lerp(Ls, 0.5).add(V(0, 0, 3)), Ls], false, 'centripetal')
          H.R = { curve, len: curve.getLength(), listen: new THREE.QuadraticBezierCurve3(Ls, V(p.x + sgn * 2.4, 0, p.z + 2.2), Le), p, Le }; H.R.llen = H.R.listen.getLength()
          H.result = Math.random() < 0.7 ? 'catch' : 'miss'
          H.mouse = preyGet(H.mouseK * 0.7); if (H.mouse) { H.mouse.owner = H; H.mouse.spot.copy(p); H.mouse.p.copy(p); preySet(H.mouse, 'HIDDEN') }
          H.from = s.root.position.clone(); H.dist = 0; H.qv = 3.0; H.ySreset = true; legsOut(H, false)
          H.pushP = H.from.clone(); H.pushR = 1.2; H.pushK = 1
          setPh(s, H, 'takeoff'); s.act = 'takeoff'
        } else departStart(u, s, H, H.safe, 'depart')
      }
      return
    }
    if (H.ph === 'depart' || H.ph === 'home') {
      const done = departStep(u, s, H, t, dt)
      if (done) {
        if (H.ph === 'depart') {
          // 降落在安全點的高草裡：換站姿模型（大部分被草蓋住），吃老鼠 6～10 秒
          setPh(s, H, 'eat'); showRoot(s, H, false)
          const g = terrainHeight(H.safe.x, H.safe.z)
          H.sit.position.set(H.safe.x, g + (H.P0.y - terrainHeight(H.P0.x, H.P0.z)), H.safe.z); H.sit.quaternion.copy(H.Q0).premultiply(_oq.setFromAxisAngle(YAX, wrap(s.head - H.h0))); H.sit.scale.copy(H.S0); H.sit.visible = true
          H.eatT = rnd(6, 10); H.pushP = H.safe.clone(); H.pushR = 1.0; H.pushK = 0.5
          if (H.mouse) { preySet(H.mouse, 'HIDDEN'); H.mouse = null }   // 在草裡吃（看不到）
        } else huntEnd(u, s, H)
      }
      return
    }
    if (H.ph === 'eat') {
      H.pushK = 0.5 * (1 - ss(H.pt, 0.5, 1.5)); huntPush(H)
      if (H.mouse && H.pt > 1.5) { preySet(H.mouse, 'HIDDEN'); H.mouse = null }
      if (H.pt > H.eatT) {   // 吃完：低低地飛回巢
        H.sit.visible = false
        const to = s.m.obj.getWorldPosition(V())
        departStart(u, s, H, to, 'home', H.sit.position.clone())
      }
    }
  }
  // 撲下去（兩種共用）：dur 秒從 H.p0 落到獵物上；身體先頭朝下、最後半秒往後仰讓腳往前伸，翅膀高舉
  function pounceStep(u, s, H, t, dt, dur, tag, next) {
    const k = clamp(H.pt / dur, 0, 1), P = H.R.p, gy = terrainHeight(P.x, P.z)
    const e = k * k * (3 - 2 * k), drop = Math.pow(k, 1.5)
    const tgt = _ov.set(lerp(H.p0.x, P.x, e), 0, lerp(H.p0.z, P.z, e))
    tgt.y = H.p0.y
    s.root.position.copy(tgt)
    const dx = P.x - H.p0.x, dz = P.z - H.p0.z; if (dx * dx + dz * dz > 0.01) s.head = s.head + wrap(Math.atan2(dx, dz) - s.head) * (1 - Math.exp(-6 * dt))
    s.pitch = lerp(H.pitch0 + 0.55 * ss(k, 0, 0.35), -0.55, ss(k, 0.55, 0.95)); s.roll = damp(s.roll, 0, 6, dt)
    s.root.rotation.set(s.pitch, s.head, s.roll); s.root.updateMatrixWorld(true)
    s.r.reset(); wingHold(s, lerp(0.2, 1.05, ss(k, 0.1, 0.6)), lerp(0, -0.25, ss(k, 0.4, 1)))
    headTurn(s, 0.6 - 0.3 * ss(k, 0.6, 1))
    legsOut(H, true); legPose(s, H, lerp(-0.6, 1.0, ss(k, 0.2, 0.85)))
    // 高度：最後腳趾剛好碰到地面（姿勢擺好後量身體中心到腳趾的距離）
    s.root.updateMatrixWorld(true); const off = s.root.position.y - feetInfo(H, _ov2)
    s.root.position.y = Math.max(lerp(H.p0.y, gy + 0.004 + off, drop), gy + 0.004 + off, gy + H.belly); s.root.updateMatrixWorld(true)   // 腳趾、肚子都不能到地面下
    if (k > 0.75) { H.pushP = P.clone(); H.pushR = 1.3; H.pushK = ss(k, 0.75, 1); huntPush(H) }
    s.act = tag
    if (k >= 1) { next(); H.p0 = s.root.position.clone(); if (H.mouse) { if (H.result === 'catch') { preySet(H.mouse, 'CAPTURED'); H.mouse.mesh.visible = true; holdMouse(H, true) } else preyEscape(H.mouse, P) } }
  }
  // 地上：翅膀垂下張開蓋住獵物（mantling）、身體前傾、偶爾拍一下保持平衡；腳踩在地上（用腳趾最低點對齊地面）
  function groundStep(u, s, H, t, dt) {
    const P = H.R.p, gy = terrainHeight(P.x, P.z), catchIt = H.ph === 'capture' || H.ph === 'mcapture'
    const lean = catchIt ? 0.42 + 0.06 * Math.sin(H.pt * 2.1) : 0.15
    s.pitch = damp(s.pitch, lean, 5, dt); s.roll = damp(s.roll, 0.05 * Math.sin(H.pt * 1.7), 4, dt)
    s.root.rotation.set(s.pitch, s.head, s.roll); s.root.updateMatrixWorld(true)
    s.r.reset()
    const settle = 1 - ss(H.pt, 0, 0.5)
    if (catchIt) wingHold(s, lerp(1.0, -0.55, ss(H.pt, 0, 0.45)), lerp(-0.25, 0.25, ss(H.pt, 0, 0.45)), 0.12 * ss(Math.sin(H.pt * 1.3), 0.6, 1), H.pt)
    else wingHold(s, lerp(1.0, -0.05, ss(H.pt, 0, 0.4)), lerp(-0.25, -0.6, ss(H.pt, 0, 0.4)))
    headTurn(s, catchIt ? 0.75 : 0.35, catchIt ? 0 : 0.9 * Math.sin(H.pt * 2.4) * ss(H.pt, 0.3, 0.6))
    legPose(s, H, lerp(1.0, catchIt ? 0.35 : 0.15, ss(H.pt, 0, 0.35)))
    // 腳趾最低點貼地
    s.root.updateMatrixWorld(true); const lo = feetInfo(H, _ov2)
    s.root.position.y += gy + 0.004 - lo; if (s.root.position.y < gy + H.belly) s.root.position.y = gy + H.belly
    s.root.updateMatrixWorld(true)
    H.pushP = P.clone(); H.pushR = 1.3; H.pushK = 0.85 + 0.15 * Math.sin(H.pt * 9) * settle; huntPush(H)
    if (catchIt && H.mouse) holdMouse(H, true)
    s.act = catchIt ? (H.kind === 'quarter' ? 'capture' : 'mousecapture') : 'look'
  }
  // 老鼠在兩腳中間（地上：踩著；飛的時候：吊在腳下）
  function holdMouse(H, ground) {
    const M = H.mouse; if (!M) return
    feetInfo(H, _ov2)
    M.mesh.position.copy(_ov2); M.mesh.position.y -= ground ? 0.03 * M.mesh.scale.x : 0.045 * M.mesh.scale.x
    M.mesh.rotation.set(ground ? 0 : 0.35, H.holdH ?? 0, ground ? 0.25 : 0); M.p.copy(M.mesh.position)
    if (!ground) M.mesh.position.y -= 0
  }
  // 從地上（或安全點）起飛，飛到 to（降落在地上）：從地面往上升到草頂上，再滑下去
  function departStart(u, s, H, to, ph, from = null) {
    const A = from ?? s.root.position.clone(), B = to.clone(), gB = terrainHeight(B.x, B.z), dist = Math.hypot(B.x - A.x, B.z - A.z)
    A.y = Math.max(A.y, terrainHeight(A.x, A.z) + H.belly + 0.03)   // 從地上（安全點）起飛：身體中心先放在肚子不碰地的高度
    const cruise = (x, z) => (H.kind === 'quarter' ? H.grassH(x, z) + 1.0 : terrainHeight(x, z) + 2.2)
    const dir = V(B.x - A.x, 0, B.z - A.z).normalize()
    const A1 = A.clone().addScaledVector(dir, Math.min(3, dist * 0.3)); A1.y = Math.max(A.y + 1.0, cruise(A1.x, A1.z))
    const B1 = B.clone().addScaledVector(dir, -Math.min(3, dist * 0.3)); B1.y = cruise(B1.x, B1.z) + 0.3
    B.y = gB + H.L.len * 0.85
    H.dc = new THREE.CubicBezierCurve3(A.clone(), A1, B1, B); H.dlen = H.dc.getLength(); H.dist = 0
    H.holdH = Math.atan2(dir.x, dir.z)
    s.root.visible = true; legsOut(H, !!(H.mouse?.state === 'CAPTURED' || ph !== 'home'))
    if (ph === 'home') { s.r.reset(); s.head = Math.atan2(dir.x, dir.z); s.pitch = -0.3; s.roll = 0 }
    H.pushP = A.clone(); H.pushR = 1.3; H.pushK = 1
    setPh(s, H, ph); s.act = 'takeoff'
  }
  function departStep(u, s, H, t, dt) {
    const rem = H.dlen - H.dist, sp = lerp(1.2, 4.2, ss(H.pt, 0, 1.2)) * clamp(rem / 2.5, 0.35, 1)
    const done = owlFly(s, H, H.dc, H.dlen, sp, dt)
    const tk = 1 - ss(H.pt, 0.3, 1.4), flare = ss(1 - rem / 2.2, 0, 1)
    s.r.reset(); wings(s, u.esc.fly, t, dt, tk, flare)
    const carry = H.mouse?.state === 'CAPTURED'
    if (H.legs.visible) { legPose(s, H, carry ? lerp(0.6, 0.1, ss(H.pt, 0, 1)) + flare * 0.5 : lerp(0.4, -0.6, ss(H.pt, 0, 0.8)) + flare * 1.2); if (!carry && H.pt > 0.8 && flare < 0.05) legsOut(H, false) }
    else if (flare > 0.05) { legsOut(H, true); legPose(s, H, -0.6 + flare * 1.4) }
    if (H.legs.visible) { s.root.updateMatrixWorld(true); const gy = terrainHeight(s.root.position.x, s.root.position.z), lo = feetInfo(H, _ov2); if (lo < gy + 0.004) { s.root.position.y += gy + 0.004 - lo; s.root.updateMatrixWorld(true) } }   // 剛起飛、腳往下伸的那幾格腳趾不能插進地面
    if (carry) holdMouse(H, false)
    H.pushK = 1 - ss(H.pt, 0.4, 1.4); huntPush(H)
    s.act = carry ? (H.kind === 'quarter' ? 'capture' : 'mousecapture') : H.pt < 1.2 ? 'takeoff' : flare > 0.05 ? 'land' : 'fly'
    if (done) { H.pushK = 0; huntPush(H) }
    return done
  }

  /* ---- 烏林鴞：OWL_PERCH → LISTEN（靜候）→ HEAD_TILT → LAUNCH → GROUND_POUNCE → CAPTURE／MISS → RETURN → PERCH ---- */
  function ggStart(u, s, H, opt = {}) {
    if (!H.ok) return false
    const pi = opt.prey ?? Math.floor(Math.random() * H.prey.length), p = H.prey[pi]
    H.R = { p }; H.result = opt.result ?? (Math.random() < 0.65 ? 'catch' : 'miss')
    H.mouse = preyGet(H.mouseK * 0.85)
    if (H.mouse) { H.mouse.owner = H; H.mouse.spot.copy(p); H.mouse.p.copy(p); preySet(H.mouse, 'MOVING') }
    // 換成 sit（同一個姿勢），之後頭、身體的動作都在 sit 上做
    s.m.obj.updateMatrixWorld(true)
    syncPose(H.mB, H.sB); s.m.obj.matrixWorld.decompose(H.sit.position, H.sit.quaternion, H.sit.scale); H.sit.visible = true; s.m.obj.visible = false
    H.sit.updateMatrixWorld(true)
    H.restHead = H.head?.quaternion.clone(); H.restNeck = H.neck?.quaternion.clone(); H.restBody = H.body?.quaternion.clone(); H.restWL = H.wingL?.quaternion.clone(); H.restWR = H.wingR?.quaternion.clone()
    H.sitP = H.sit.position.clone(); H.sitQ = H.sit.quaternion.clone()
    // 現在面向（Tripo 頭朝 -x）；獵物在背後（頭要轉超過 60°）：靜候時身體在枝上慢慢轉過去，剩下的用頭轉
    let skin = null; H.sit.traverse((o) => { if (o.isSkinnedMesh && !skin) skin = o })
    H.fw = V(-1, 0, 0).transformDirection(skin.matrixWorld).setY(0).normalize(); H.h0 = Math.atan2(H.fw.x, H.fw.z)
    const yp = wrap(Math.atan2(p.x - H.sitP.x, p.z - H.sitP.z) - H.h0)
    H.byT = Math.abs(yp) > 1.0 ? yp - Math.sign(yp) * 0.7 : 0; H.by = 0
    s.mode = 'hunt'; H.on = true; H.watchT = rnd(5, 8); H.tiltT = rnd(2.4, 3.4); H.side = Math.random() < 0.5 ? 1 : -1
    setPh(s, H, 'watch'); s.act = 'look'
    return true
  }
  // 頭：yaw 往獵物轉、pitch 往下看、roll 歪頭（世界座標的軸；從換進來那一格的姿勢算）
  function ggHead(H, yaw, pitch, roll) {
    if (!H.head) return
    const f = _ov2.copy(H.fw).applyAxisAngle(YAX, yaw + (H.by ?? 0)), lat = _ov4.crossVectors(YAX, f).normalize()
    if (H.neck) boneWorld(H.neck, H.restNeck, [[YAX, yaw * 0.35]])
    boneWorld(H.head, H.restHead, [[YAX, yaw * 0.65], [lat, pitch], [f, roll]])
  }
  function ggStep(u, s, H, t, dt) {
    H.pt += dt; s.t += dt
    const p = H.R.p, toP = V(p.x - H.sitP.x, 0, p.z - H.sitP.z)
    // 身體在枝上轉（繞腳下的原點，前 2.5 秒轉完）
    if (H.ph === 'watch' || H.ph === 'tilt') { H.by = H.byT * ss(H.ph === 'watch' ? H.pt : 9, 0.3, 2.5); H.sit.quaternion.copy(H.sitQ).premultiply(_oq.setFromAxisAngle(YAX, H.by)) }
    const yawP = wrap(Math.atan2(toP.x, toP.z) - H.h0 - H.by)
    const pitchP = Math.atan2(H.sitP.y - p.y, toP.length()) * 0.6
    const breathe = () => { if (H.body) { H.body.quaternion.copy(H.restBody); H.body.scale.setScalar(1 + 0.008 * Math.sin(H.pt * 1.9)) } }
    if (H.ph === 'watch') {
      // 靜候：身體不動、慢慢轉頭（兩三秒一次），胸口起伏
      const look = 0.75 * Math.sin(H.pt * 0.5) * ss(Math.sin(H.pt * 0.35 + 1), -0.2, 0.6) + 0.35 * ss(H.pt, H.watchT - 1.6, H.watchT) * yawP
      ggHead(H, clamp(look, -1.6, 1.6), 0.08, 0); breathe()
      s.act = 'look'
      if (H.pt > H.watchT) { setPh(s, H, 'tilt'); H.tilt0 = clamp(look, -1.6, 1.6) }
      return
    }
    if (H.ph === 'tilt') {
      // 歪頭聽：臉盤轉向老鼠、往一邊歪 19° 停一下，再往另一邊 15°（身體不動）
      const k = H.pt, yaw = lerp(H.tilt0, clamp(yawP, -1.7, 1.7), ss(k, 0, 0.6))
      const roll = H.side * (0.33 * ss(k, 0.3, 0.7) * (1 - ss(k, 1.3, 1.7)) - 0.26 * ss(k, 1.4, 1.8) * (1 - ss(k, H.tiltT - 0.4, H.tiltT)))   // 19° → 另一邊 15°
      ggHead(H, yaw, pitchP * ss(k, 0, 0.8), roll); breathe()
      s.act = 'headtilt'
      if (k > H.tiltT) { setPh(s, H, 'lean'); H.yawEnd = yaw; if (H.mouse) preySet(H.mouse, 'TARGETED') }
      return
    }
    if (H.ph === 'lean') {
      // 起飛前：身體轉向獵物、往前傾、翅膀微微抬起（0.5 秒）→ 換飛行模型
      const k = ss(H.pt, 0, 0.5), turn = yawP * 0.5 * k
      const side = _ov2.crossVectors(YAX, _ov4.copy(H.fw).applyAxisAngle(YAX, H.by + turn)).normalize()
      H.sit.quaternion.copy(H.sitQ).premultiply(_oq.setFromAxisAngle(YAX, H.by + turn)).premultiply(_oq2.setFromAxisAngle(side, -0.45 * k))
      ggHead(H, (H.yawEnd - turn) * (1 - k * 0.6), pitchP, 0)
      if (H.wingL) { boneWorld(H.wingL, H.restWL, [[_ov4.copy(H.fw).applyAxisAngle(YAX, H.by + turn), 0.25 * k]]); boneWorld(H.wingR, H.restWR, [[_ov4.copy(H.fw).applyAxisAngle(YAX, H.by + turn), -0.25 * k]]) }
      s.act = 'takeoff'
      if (H.pt > 0.5) {
        // 換飛行模型：位置＝sit 的身體中心，航向朝獵物，往前傾
        _box.setFromObject(H.sit); const c = _box.getCenter(V())
        H.sit.visible = false; s.root.visible = true; s.r.reset()
        s.head = Math.atan2(toP.x, toP.z); s.pitch = 0.35; s.roll = 0; s.root.position.copy(c); s.root.rotation.set(s.pitch, s.head, 0)
        const gy = terrainHeight(p.x, p.z), d = toP.length(), dir = toP.clone().normalize()
        const end = V(p.x, gy + 2.2, p.z).addScaledVector(dir, -1.6)
        H.dc = new THREE.CubicBezierCurve3(c.clone(), c.clone().addScaledVector(dir, d * 0.3).add(V(0, -0.9, 0)), end.clone().addScaledVector(dir, -d * 0.25).add(V(0, 0.6, 0)), end); H.dlen = H.dc.getLength(); H.dist = 0
        setPh(s, H, 'glide')
      }
      return
    }
    if (H.ph === 'glide') {
      // 從枝頭滑下去：先拍兩三下、翅膀張開滑，最後 1.6 m 換成撲擊
      const rem = H.dlen - H.dist, sp = lerp(2.2, 5.2, ss(H.pt, 0, 0.8)) * clamp(rem / 3, 0.6, 1)
      const done = owlFly(s, H, H.dc, H.dlen, sp, dt, { pitchAdd: 0.15 })
      s.r.reset(); if (H.pt < 0.9) wings(s, u.esc.fly, t, dt, 1 - ss(H.pt, 0.2, 0.9), 0); else wingHold(s, 0.12 + 0.05 * Math.sin(H.pt * 3), 0)
      headTurn(s, 0.45)
      s.act = H.pt < 0.6 ? 'takeoff' : 'groundpounce'
      if (done) { setPh(s, H, 'pounce'); H.p0 = s.root.position.clone(); H.pitch0 = s.pitch; legsOut(H, true) }
      return
    }
    if (H.ph === 'pounce') return pounceStep(u, s, H, t, dt, 0.9, 'groundpounce', () => setPh(s, H, H.result === 'catch' ? 'mcapture' : 'mmiss'))
    if (H.ph === 'mcapture' || H.ph === 'mmiss') {
      groundStep(u, s, H, t, dt)
      if (H.pt > (H.ph === 'mcapture' ? 2.5 : 2.0)) {
        // 回枝頭：降落點＝原本站的位置（身體中心），最後從前方滑進來
        const B = H.homeC.clone(), A = s.root.position.clone(), dir = V(B.x - A.x, 0, B.z - A.z).normalize()
        const A1 = A.clone().addScaledVector(dir, 1.8).add(V(0, 1.4, 0)), B1 = B.clone().addScaledVector(dir, -2.4).add(V(0, -0.3, 0))
        H.dc = new THREE.CubicBezierCurve3(A, A1, B1, B); H.dlen = H.dc.getLength(); H.dist = 0; H.holdH = Math.atan2(dir.x, dir.z)
        setPh(s, H, 'return'); s.act = 'takeoff'
      }
      return
    }
    if (H.ph === 'return') {
      const rem = H.dlen - H.dist, sp = lerp(1.5, 4.6, ss(H.pt, 0, 1.0)) * clamp(rem / 2.5, 0.3, 1)
      const flare = ss(1 - rem / 2.0, 0, 1)
      const done = owlFly(s, H, H.dc, H.dlen, sp, dt, { pitchAdd: -0.5 * flare })
      s.r.reset(); wings(s, u.esc.fly, t, dt, 1 - ss(H.pt, 0.3, 1.3), flare)
      const carry = H.mouse?.state === 'CAPTURED'
      legPose(s, H, carry ? lerp(0.5, 0.1, ss(H.pt, 0, 1)) + flare * 0.4 : lerp(0.3, -0.6, ss(H.pt, 0, 0.7)) + flare * 1.0)
      legsOut(H, !!(carry || H.pt < 0.7 || flare > 0.05))
      if (carry) holdMouse(H, false)
      H.pushK = 1 - ss(H.pt, 0.3, 1.2); huntPush(H)
      s.act = carry ? 'mousecapture' : flare > 0.05 ? 'land' : 'fly'
      if (done) {
        // 回到枝頭：換回 sit（原本的站姿、方向），抓著老鼠站一下 → 低頭吞下去 → 換回停棲模型
        // 降落時面向飛來的方向（背對獵物），之後在枝上慢慢轉回原本的方向（跟停棲模型一樣，換回去才不會跳）
        showRoot(s, H, false); H.by = H.byL = wrap(s.head - H.h0); H.sit.position.copy(H.sitP); H.sit.quaternion.copy(H.sitQ).premultiply(_oq.setFromAxisAngle(YAX, H.by)); H.sit.visible = true
        if (H.wingL) { H.wingL.quaternion.copy(H.restWL); H.wingR.quaternion.copy(H.restWR) }
        ggHead(H, 0, 0, 0); H.sit.updateMatrixWorld(true)
        setPh(s, H, carry ? 'swallow' : 'settle')
      }
      return
    }
    if (H.ph === 'swallow' || H.ph === 'settle') {
      const k = H.pt
      H.by = H.byL * (1 - ss(k, H.ph === 'swallow' ? 0.6 : 0.3, H.ph === 'swallow' ? 3.2 : 1.8)); H.sit.quaternion.copy(H.sitQ).premultiply(_oq.setFromAxisAngle(YAX, H.by))
      if (H.ph === 'swallow') {
        const down = ss(k, 1.6, 2.2) * (1 - ss(k, 2.8, 3.3))
        ggHead(H, 0, 0.9 * down, 0); breathe()
        if (H.mouse) {
          if (k < 2.3) { // 抓在腳下：sit 的兩腳中間
            const fl = boneOf(H.sit, 'footL'), fr = boneOf(H.sit, 'footR')
            if (fl && fr) { fl.getWorldPosition(_ov2); fr.getWorldPosition(_ov4); _ov2.add(_ov4).multiplyScalar(0.5); H.mouse.mesh.position.copy(_ov2); H.mouse.mesh.position.y -= 0.02 * H.mouse.mesh.scale.x; H.mouse.mesh.rotation.set(0.3, H.h0, 0) }
          } else { preySet(H.mouse, 'HIDDEN'); H.mouse = null }
        }
        s.act = k < 2.3 ? 'mousecapture' : 'look'
        if (k > 3.6) huntEnd(u, s, H)
      } else { ggHead(H, 0, 0, 0); if (k > 2.0) huntEnd(u, s, H) }
    }
  }

  /* ---------- 2026-11-18 小雲雀鳴唱飛行（使用者規格 Bird #043 Song Flight）----------
     地上那隻每 40～90 秒（沒被驚動、玩家不在 8 m 內）：起飛 → 快拍翅膀繞小圈往上爬（一邊唱）→ 在離地 10～16 m 慢慢繞圈、高度微微起伏、一直振翅唱 10～16 秒
     → 一段一段往下（還在唱）→ 最後 3 m 翅膀半張、尾羽張開滑下來 → 降落回原本的草地。歌聲是真的錄音（audio/birds/skylark_song*.mp3，跟著鳥移動）
     爬升的圓圈中心挑附近沒有樹幹、不在步道上的方向；玩家走近（水平 7 m）就中斷，照驚飛那套飛走 */
  const songCfg = { noAbort: false, off: /[?&]nosong/.test(location.search) }   // off：效能 A/B 測試
  function songStart(u, s) {
    const m = s.m, X = s.song
    m.obj.updateMatrixWorld(true); _box.setFromObject(m.obj); const home = _box.getCenter(V())
    const g0 = terrainHeight(home.x, home.z)
    // 圈的中心：8 個方向試，離樹幹（碰撞圓）5 m 以上、不在步道上的
    let best = null, bs = -1
    for (let k = 0; k < 8; k++) {
      const a = X.a0 + k * Math.PI / 4, c = V(home.x + Math.sin(a) * 2.5, 0, home.z + Math.cos(a) * 2.5)
      let mn = 99; for (const cl of colliders) if (cl.top > g0 + 1) mn = Math.min(mn, Math.hypot(cl.x - c.x, cl.z - c.z) - (cl.r ?? 0.3))
      const sc = Math.min(mn, 12) + Math.min(4, alpineTrailDist(c.x, c.z))
      if (sc > bs) { bs = sc; best = c }
    }
    X.c = best; X.g0 = g0; X.home = home; X.top = rnd(10, 16); X.singT = rnd(10, 16); X.R = rnd(3, 4.5); X.dir = Math.random() < 0.5 ? 1 : -1
    X.ang = Math.atan2(home.x - best.x, home.z - best.z); X.r0 = Math.hypot(home.x - best.x, home.z - best.z)
    X.on = true; X.ph = 'climb'; X.t = 0; X.y = home.y; X.sung = null
    m.obj.getWorldDirection(_w); s.head = Math.atan2(_w.x, _w.z); s.pitch = -0.5; s.roll = 0
    s.root.position.copy(home); s.root.rotation.set(s.pitch, s.head, 0); s.root.visible = true; m.obj.visible = false
    s.mode = 'song'; s.act = 'takeoff'; s.t = 0
  }
  function songStop(X, fade) { if (X.voice) { X.voice.stop(fade); X.voice = null } }
  const _sp = V(), _sp2 = V()
  function songStep(u, s, t, dt) {
    const X = s.song, f = u.esc.fly
    X.t += dt; s.t += dt
    const gNow = terrainHeight(s.root.position.x, s.root.position.z)
    let r, w, yT, flut = 0.35, act = 'songflight'
    if (X.ph === 'climb') {
      // 一邊爬升一邊把圈拉大到 R；速度一開始快、後面慢（約 1.4 → 0.9 m/s）
      const k = ss(X.t, 0, 1.2)
      r = lerp(X.r0, X.R, ss(X.t, 0, 3)); w = X.dir * 0.42
      X.y += lerp(0.6, lerp(1.6, 0.9, ss(X.y - X.g0, 2, X.top)), k) * dt; yT = X.y
      flut = lerp(1, 0.45, ss(X.t, 0, 1.5)); act = X.t < 1 ? 'takeoff' : 'songflight'
      if (X.y >= X.g0 + X.top) { X.ph = 'sing'; X.t = 0; X.yS = X.y }
    } else if (X.ph === 'sing') {
      // 高空慢慢繞圈（不定點懸停），高度微微起伏
      r = X.R; w = X.dir * 0.3; yT = X.yS + 0.5 * Math.sin(X.t * 0.9); X.y = yT
      if (X.t > X.singT) { X.ph = 'down'; X.t = 0 }
    } else if (X.ph === 'down') {
      // 一段一段往下：降 1.5 s、停 0.8 s（還在唱、還在拍），最後 3 m 換成滑翔降落
      const cyc = X.t % 2.3, desc = cyc < 1.5 ? 1.6 : 0.15
      X.y -= desc * dt; yT = X.y; r = lerp(X.R, X.r0, 1 - ss(X.y - X.g0, 4, X.top * 0.7)); w = X.dir * 0.32
      if (X.y < X.g0 + 3.2) { X.ph = 'land'; X.t = 0; songStop(X, 1.0)
        const P = s.root.position.clone(); X.lc = new THREE.CubicBezierCurve3(P, P.clone().lerp(X.home, 0.35).add(V(0, -0.6, 0)), X.home.clone().add(V(0, 0.8, 0)).addScaledVector(_sp2.set(X.home.x - P.x, 0, X.home.z - P.z).normalize(), -0.8), X.home.clone()); X.ll = X.lc.getLength(); X.ld = 0 }
    }
    if (X.ph === 'land') {
      // 滑下來：翅膀半張不拍、尾羽張開，最後一下張翅煞車
      const rem = X.ll - X.ld; X.ld = Math.min(X.ll, X.ld + clamp(rem / 1.2, 0.6, 3.0) * dt); const k = X.ld / X.ll
      X.lc.getPointAt(k, _sp); X.lc.getTangentAt(Math.min(k, 0.999), _sp2)
      s.root.position.copy(_sp); const h = Math.atan2(_sp2.x, _sp2.z); s.head += wrap(h - s.head) * (1 - Math.exp(-5 * dt))
      const flare = ss(1 - rem / 0.9, 0, 1)
      s.pitch = damp(s.pitch, -Math.asin(clamp(_sp2.y, -1, 1)) * 0.6 - 0.6 * flare, 5, dt); s.roll = damp(s.roll, 0, 4, dt)
      s.root.rotation.set(s.pitch, s.head, s.roll)
      if (flare > 0.05) wings(s, f, t, dt, 0, flare); else { s.r.reset(); for (const [n, sg] of [['L', 1], ['R', -1]]) { s.r.turn('wing' + n, AX.x, -sg * 0.35); s.r.turn('wing' + n, AX.y, sg * 0.25) } }
      fanTail(s, X, 1 - flare)
      s.act = flare > 0.05 ? 'land' : 'fly'
      if (X.ld >= X.ll) songEnd(u, s)
      return
    }
    // 繞圈：位置＝圈中心＋半徑；航向＝切線方向；側傾跟著轉彎
    X.ang += w * dt
    const px = X.c.x + Math.sin(X.ang) * r, pz = X.c.z + Math.cos(X.ang) * r
    const y = Math.max(yT, terrainHeight(px, pz) + (X.ph === 'climb' ? Math.min(0.6, 0.05 + X.t * 0.6) : 0.6))   // 離地至少 0.6 m（剛起飛那一秒從草地上慢慢升，不跳）
    const vx = px - s.root.position.x, vz = pz - s.root.position.z, vy = y - s.root.position.y
    s.root.position.set(px, y, pz)
    if (vx * vx + vz * vz > 1e-8) { const h = Math.atan2(vx, vz), dh = wrap(h - s.head); s.head += dh * (1 - Math.exp(-6 * dt)); s.roll = damp(s.roll, clamp(-X.dir * 0.28, -0.4, 0.4), 3, dt) }
    const climb = vy / Math.max(dt, 1e-3)
    s.pitch = damp(s.pitch, X.ph === 'climb' ? -0.75 + 0.25 * ss(X.y - X.g0, 3, X.top) : -0.25 - clamp(climb * 0.1, -0.2, 0.2), 4, dt)
    s.root.rotation.set(s.pitch, s.head, s.roll)
    // 振翅：雲雀唱歌時是快速、幅度小的顫翅（不是滑翔）
    wings(s, { ...f, hz: 13, style: 'flap' }, t, dt, flut, 0)
    fanTail(s, X, X.ph === 'climb' ? 0.4 : 0.7)
    s.act = act
    // 歌：起飛 1 秒後開始
    if (!X.voice && X.t > 0.8 && X.ph === 'climb' && !X.sung) { X.voice = globalThis.__birdSong?.('skylark') ?? null; X.sung = true }
    X.voice?.update(s.root.position, world.camera)
  }
  function fanTail(s, X, k) {
    const tb = s.r.bones.tail; if (!tb) return
    if (!X.fanAx) { const a = V(1, 0, 0).applyQuaternion(tb.userData.inv); const ax = Math.abs(a.x), ay = Math.abs(a.y), az = Math.abs(a.z); X.fanAx = ax >= ay && ax >= az ? 'x' : ay >= az ? 'y' : 'z' }
    X.fan = damp(X.fan ?? 0, k, 4, 1 / 30); tb.scale.set(1, 1, 1); tb.scale[X.fanAx] = 1 + 0.35 * X.fan
  }
  function songEnd(u, s) {
    const X = s.song; songStop(X, 0.6)
    X.on = false; X.ph = ''; s.root.visible = false; s.m.obj.visible = true; s.mode = 'perch'; s.act = ''
    if (s.r.bones.tail) s.r.bones.tail.scale.set(1, 1, 1)
    X.wait = X.force ? 5 : rnd(...u.esc.songflight); X.n = (X.n ?? 0) + 1
  }
  /* ---------- 2026-11-18 #35 茶腹鳾 Headfirst Tree Descent（ChatGPT 規格：先沿樹幹往上攀，接著頭朝下沿樹皮下降，途中停下用尖嘴探裂縫找蟲）----------
     停在神木上的時候整隻改由這裡接手（站姿模型 m.obj 藏起來，換一份複製的 sit）：
     - 樹皮表面：從樹幹外面往中心打射線（4 cm 一格）存成「半徑表」r(y, a)，表面點、法線、某一點插進樹皮多深都查表
     - 身體：肚子朝樹皮、背朝外；前後方向在樹皮平面上（h＝0 頭朝上、π 頭朝下）；髖關節離樹皮的高度在 setup 量（身體不插進樹皮＋4 mm）
     - 腳：兩節 IK，腳踝釘在樹皮上的固定點（世界座標，跳之間不會滑），腳掌轉到腳趾貼著樹皮；頭朝下時一腳在上（吊著）一腳在下（撐著）
     - 跳：兩腳一起離開、身體往外弧一點；探裂縫：脖子＋頭往樹皮轉，嘴尖用回授控制剛好碰到樹皮，啄幾下，有時叼出一隻小蟲吞下去 */
  const nutRC = new THREE.Raycaster()
  const _uq = new THREE.Quaternion(), _uq2 = new THREE.Quaternion(), _uv = V(), _uv2 = V(), _um = new THREE.Matrix4(), _um2 = new THREE.Matrix4()
  function nutSetup(u) {
    const s = u.ms[0], m = s.m, T = globalThis.__sacredTree, mesh = scene.getObjectByName('sacredTrunk')
    if (s.nut || !T || !mesh || !m.obj.parent) return
    scene.updateMatrixWorld(true)
    const P0 = m.obj.getWorldPosition(V()), R0 = Math.hypot(P0.x - T.x, P0.z - T.z)
    const aH = Math.atan2(P0.x - T.x, P0.z - T.z), yH = P0.y
    // 半徑表：y 從家往下 1.4 m 到往上 1.0 m、左右 ±32 cm，每格 4 cm
    const dY = 0.04, NY = 61, Y0 = yH - 1.4, dA = 0.04 / R0, NA = 17, A0 = aH - dA * (NA - 1) / 2
    const Rm = new Float32Array(NY * NA)
    for (let j = 0; j < NY; j++) for (let i = 0; i < NA; i++) {
      const a = A0 + i * dA, y = Y0 + j * dY
      nutRC.set(V(T.x + Math.sin(a) * 12, y, T.z + Math.cos(a) * 12), V(-Math.sin(a), 0, -Math.cos(a))); nutRC.far = 12
      const h = nutRC.intersectObject(mesh, false)[0]
      Rm[j * NA + i] = h ? 12 - h.distance : NaN
    }
    for (let k = 0; k < Rm.length; k++) if (!(Rm[k] > 0)) Rm[k] = R0   // 沒打到（不應該）就當圓柱
    const rAt = (y, a) => {
      const fj = clamp((y - Y0) / dY, 0, NY - 1.001), fi = clamp((a - A0) / dA, 0, NA - 1.001), j = Math.floor(fj), i = Math.floor(fi), tj = fj - j, ti = fi - i
      const r00 = Rm[j * NA + i], r01 = Rm[j * NA + i + 1], r10 = Rm[(j + 1) * NA + i], r11 = Rm[(j + 1) * NA + i + 1]
      return (r00 * (1 - ti) + r01 * ti) * (1 - tj) + (r10 * (1 - ti) + r11 * ti) * tj
    }
    const surf = (y, a, out = V()) => { const r = rAt(y, a); return out.set(T.x + Math.sin(a) * r, y, T.z + Math.cos(a) * r) }
    const toYA = (p) => ({ y: p.y, a: aH + wrap(Math.atan2(p.x - T.x, p.z - T.z) - aH) })
    const depth = (p) => { const q = toYA(p); return rAt(q.y, q.a) - Math.hypot(p.x - T.x, p.z - T.z) }   // > 0：在樹皮裡面
    const _s1 = V(), _s2 = V(), _s3 = V(), _s4 = V()
    const normAt = (y, a, out = V(), e = 0.06) => {   // 法線：±6 cm 的差分（樹幹是 33 cm 寬的平面拼起來的，取平均才不會在稜線上突然翻）
      const ea = e / R0
      const dy = _s1.copy(surf(y + e, a, _s3)).sub(surf(y - e, a, _s4)), da = _s2.copy(surf(y, a + ea, _s3)).sub(surf(y, a - ea, _s4))
      out.crossVectors(da, dy).normalize()
      if (out.x * Math.sin(a) + out.z * Math.cos(a) < 0) out.negate()
      return out
    }
    // 複製一份來動（停棲時一直用這份）：把 perchRigged 自己加的上下位移、壓扁拿掉，骨頭回到原始姿勢
    const sit = skClone(m.obj); sit.traverse((o) => { o.visible = true; o.frustumCulled = false }); sit.visible = false
    sit.position.set(0, 0, 0); sit.quaternion.identity(); sit.scale.copy(m.obj.getWorldScale(V())); scene.add(sit)
    const lift = sit.children[0]; if (lift) { lift.position.set(0, 0, 0); lift.rotation.set(0, 0, 0); lift.children[0]?.scale.set(1, 1, 1) }
    const restQ = new Map(); m.obj.traverse((o) => { if (o.isBone && o.userData.rest) restQ.set(o.name, o.userData.rest) })
    const bones = {}; sit.traverse((o) => { if (o.isBone) { bones[o.name] = o; o.userData.nRest = (restQ.get(o.name) ?? o.quaternion).clone(); o.quaternion.copy(o.userData.nRest) } })
    const allB = Object.values(bones)
    let sk = null; sit.traverse((o) => { if (o.isSkinnedMesh && (!sk || o.geometry.attributes.position.count > sk.geometry.attributes.position.count)) sk = o })
    sit.updateMatrixWorld(true)
    // 量：身體前後軸（嘴尖相對身體中心的水平方向）、背（模型 +y）、兩邊髖關節、腳的頂點
    const PP = sk.geometry.attributes.position, v = V(), NV = PP.count
    const isLeg = new Uint8Array(NV), si = sk.geometry.attributes.skinIndex, sw = sk.geometry.attributes.skinWeight
    for (let i = 0; i < NV; i++) { let bw = -1, bn = ''; for (let c = 0; c < 4; c++) if (sw.getComponent(i, c) > bw) { bw = sw.getComponent(i, c); bn = sk.skeleton.bones[si.getComponent(i, c)]?.name ?? '' } if (/thigh|shin|foot|toe/.test(bn)) isLeg[i] = 1 }
    const rest = []; for (let i = 0; i < NV; i++) { sk.getVertexPosition(i, v).applyMatrix4(sk.matrixWorld); rest.push(v.clone()) }
    const cm = V(); let cn = 0; for (let i = 0; i < NV; i += 3) if (!isLeg[i]) { cm.add(rest[i]); cn++ } cm.divideScalar(cn)
    const box = new THREE.Box3().setFromPoints(rest)
    let tip = -1, best = -1; for (let i = 0; i < NV; i++) { const w = rest[i]; if (isLeg[i] || w.y < box.min.y + (box.max.y - box.min.y) * 0.45) continue; const d = Math.hypot(w.x - cm.x, w.z - cm.z); if (d > best) { best = d; tip = i } }
    const up0 = V(0, 1, 0), fwd0 = V(rest[tip].x - cm.x, 0, rest[tip].z - cm.z).normalize(), side0 = V().crossVectors(up0, fwd0)
    const hipL = bones.thighL.getWorldPosition(V()), hipR = bones.thighR.getWorldPosition(V()), hipM = hipL.clone().add(hipR).multiplyScalar(0.5)
    // 身體前傾角 p（繞 side 軸，正的＝頭離樹皮）：試 -1.0～0.6，每個角度量「身體（腳以外）最低點在髖關節下面多深」→ 髖關節要離樹皮多高
    const axisP = V().crossVectors(fwd0, up0).normalize()
    const hdB = bones.head.getWorldPosition(V()), tlB = bones.tail.getWorldPosition(V())
    const pitchTab = []
    let pBest = 0, hBest = 1e9
    for (let p = -1.0; p <= 0.61; p += 0.05) {
      _uq.setFromAxisAngle(axisP, p); let lo = 0
      for (let i = 0; i < NV; i += 2) { if (isLeg[i]) continue; const d = _uv.copy(rest[i]).sub(hipM).applyQuaternion(_uq).dot(up0); if (d < lo) lo = d }
      // 身體軸（尾巴骨頭→頭骨頭）跟樹皮的夾角：茶腹鳾抓樹幹時身體幾乎平貼、只有頭抬起來 → 挑夾角最接近 0.3 rad（17°）而且髖關節搆得到的
      const ang = Math.asin(clamp(_uv.copy(hdB).sub(tlB).applyQuaternion(_uq).normalize().dot(up0), -1, 1))
      pitchTab.push([+p.toFixed(2), +(-lo).toFixed(4), +ang.toFixed(2)])
      const score = Math.abs(ang - 0.3) + (-lo > 0.016 ? 9 : 0)
      if (score < hBest) { hBest = score; pBest = p }
    }
    let pitch = u.esc.climb?.pitch ?? pBest
    _uq.setFromAxisAngle(axisP, pitch); let lo = 0
    for (let i = 0; i < NV; i += 2) { if (isLeg[i]) continue; const d = _uv.copy(rest[i]).sub(hipM).applyQuaternion(_uq).dot(up0); if (d < lo) lo = d }
    const hipH = -lo + 0.0055   // 身體最低點離樹皮 5.5 mm（4 mm 時走步轉身偶爾擦進樹皮 1 mm）
    const bellyAt = (p) => { const f = clamp((p + 1.0) / 0.05, 0, pitchTab.length - 1.001), i = Math.floor(f); return lerp(pitchTab[i][1], pitchTab[i + 1][1], f - i) }
    // 腳：兩節 IK 的資料（膝蓋往哪彎存在身體座標）；腳踝離樹皮 d0；腳趾長
    const legs = ['L', 'R'].map((sd) => {
      const th = bones['thigh' + sd], sh = bones['shin' + sd], ft = bones['foot' + sd]
      const H = th.getWorldPosition(V()), K = sh.getWorldPosition(V()), A = ft.getWorldPosition(V())
      const pole = K.clone().sub(H.clone().lerp(A, 0.5)).normalize()
      const toes = [], fwdT = []; ft.traverse((o) => { if (o.isBone && /toe.\db$/.test(o.name)) (/toe.3b$/.test(o.name) ? toes : fwdT).push(o) })   // toe?3 是後趾
      const tc = fwdT.reduce((a, b) => a.add(b.getWorldPosition(V())), V()).divideScalar(Math.max(1, fwdT.length))
      return { sd, th, sh, ft, hip0: H.clone(), toes: fwdT, hallux: toes, pole, sg: Math.sign(H.clone().sub(hipM).dot(side0)) || (sd === 'L' ? 1 : -1), toeLen: tc.distanceTo(A), legLen: H.distanceTo(K) + K.distanceTo(A), hold: V(), from: V(), to: V(), dir: V() }
    })
    const neck = bones.neck, head = bones.head, tail = bones.tail
    const grub = new THREE.Mesh(new THREE.CapsuleGeometry(0.0022, 0.007, 3, 6).rotateZ(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xd9c9a3, roughness: 0.6 }))
    grub.visible = false; grub.castShadow = true; scene.add(grub)
    s.nut = { sit, sk, bones, allB, tip, isLeg, rest, up0, fwd0, side0, axisP, hipM, pitch, pitchTab, hipH, pBest, legs, neck, head, tail, grub, bellyAt, lean: 0,
      T, R0, aH, yH, rAt, surf, toYA, depth, normAt, yMin: yH - 1.15, yMax: yH + 0.7, aMin: aH - 0.2 / R0, aMax: aH + 0.2 / R0,
      y: yH, a: aH, h: Math.PI, q: [], step: null, st: 0, tag: '', theta: 0, pk: 0, look: 0, lookW: 0, lookT: 2, upper: Math.random() < 0.5 ? 0 : 1,
      wait: rnd(1.5, 4), planted: false, wasHome: false, log: [], cycle: 0, tipD: 0, swallow: 0, force: null, info: {} }
  }
  // 計畫：往上爬幾跳（頭朝上）→ 原地轉兩下（頭朝下）→ 往下好幾跳、中間停下探裂縫 1～2 次 → 停一下 → 轉回頭朝上
  function nutPlan(X) {
    // 2026-11-18 ChatGPT REVISE：不要每次都兩腳一起、同樣距離的跳 → 七成「走步」（一腳換位、身體跟上、另一腳換位，3～5 cm）、
    // 三成跳步（5～8 cm，兩腳錯開 30～50 ms 離開）；每 2～4 步停 0.2～0.6 秒看樹皮；頭朝下時多停 0.8～1.2 秒（玩家才拍得到）
    const q = X.q, up = Math.cos(X.h) > 0
    let y = X.y, a = X.a, h = X.h, sinceRest = 0, restAt = 2 + Math.floor(Math.random() * 3)
    const move = (dy, da, hh, kind) => {
      kind ??= Math.random() < 0.7 ? 'step' : 'hop'
      const sc = kind === 'step' ? rnd(0.02, 0.03) / Math.max(1e-3, Math.hypot(dy, da)) : 1   // 走步 2～3.5 cm（腳只有 2.5 cm 長，一步搆不到更遠）
      y = clamp(y + dy * sc, X.yMin, X.yMax); a = clamp(a + da * sc / X.R0, X.aMin, X.aMax); h = hh
      q.push(kind === 'step' ? { k: 'step', y, a, h, dur: rnd(0.36, 0.5), pre: 0 } : { k: 'hop', y, a, h, dur: rnd(0.17, 0.22), pre: 0.07, stag: rnd(0.03, 0.06) })
      if (++sinceRest >= restAt) { sinceRest = 0; restAt = 2 + Math.floor(Math.random() * 3); q.push({ k: 'rest', dur: Math.cos(hh) < 0 ? rnd(0.8, 1.2) : rnd(0.2, 0.6), look: 1 }) }
      else q.push({ k: 'rest', dur: rnd(0.04, 0.18), look: 0 })
    }
    if (up) {
      const n = 5 + Math.floor(Math.random() * 5)
      for (let i = 0; i < n && y < X.yMax - 0.05; i++) move(rnd(0.05, 0.08), rnd(-0.015, 0.015), rnd(-0.25, 0.25))
      if (Math.random() < 0.6) q.push({ k: 'rest', dur: rnd(0.8, 1.8), look: 1 })
      // 轉身：兩個走步各轉 ~90°
      const sg = Math.random() < 0.5 ? 1 : -1
      move(-0.008, 0.015 * sg, sg * Math.PI / 2, 'hop'); move(-0.012, 0.012 * sg, Math.PI + rnd(-0.3, 0.3), 'hop')   // 轉身用跳（兩腳錯開）：走步轉 90° 腳搆不到
      q.push({ k: 'rest', dur: rnd(0.8, 1.2), look: 1 })
      X.upper = Math.random() < 0.5 ? 0 : 1
    } else {
      const n = 9 + Math.floor(Math.random() * 7)
      const probes = new Set([2 + Math.floor(Math.random() * 3)]); if (Math.random() < 0.6) probes.add(n - 3 - Math.floor(Math.random() * 2))
      let zig = Math.random() < 0.5 ? 1 : -1
      for (let i = 0; i < n && y > X.yMin + 0.05; i++) {
        if (Math.random() < 0.3) zig = -zig
        move(-rnd(0.04, 0.07), zig * rnd(0.005, 0.02), Math.PI + zig * rnd(0.1, 0.35))
        if (probes.has(i)) { q.push({ k: 'probe', dur: rnd(2.6, 3.8), ok: Math.random() < 0.6 }); q.push({ k: 'rest', dur: rnd(0.3, 0.8), look: 1 }) }
      }
      q.push({ k: 'rest', dur: rnd(1.0, 2.5), look: 1 })
      const sg = Math.random() < 0.5 ? 1 : -1
      move(0.008, 0.015 * sg, Math.PI + sg * Math.PI / 2, 'hop'); move(0.012, 0.012 * sg, rnd(-0.2, 0.2), 'hop')
      q.push({ k: 'rest', dur: rnd(0.3, 0.8), look: 1 })
    }
  }
  // 腳的落點：身體中心在 (y,a)、頭的方向 h → 每隻腳在樹皮上的點（往外 d0）＋腳趾要指的方向
  const NUT_D0 = 0.004
  const NUT_OFF = typeof location !== 'undefined' && /[?&]noclimb/.test(location.search)   // 效能 A/B：?noclimb＝茶腹鳾照舊（停枝模型）
  function nutHolds(X, y, a, h, out) {
    const N = X.normAt(y, a, V()), tu = V(0, 1, 0).addScaledVector(N, -N.y).normalize(), ts = V().crossVectors(N, tu)
    const F = tu.clone().multiplyScalar(Math.cos(h)).addScaledVector(ts, Math.sin(h)), S = V().crossVectors(N, F)
    const P = X.surf(y, a, V()), down = Math.cos(h) < 0
    X.legs.forEach((L, i) => {
      const upper = down && i === X.upper
      // 往上爬：兩腳在髖部兩側稍前；頭朝下：上面那隻腳在身體後上方（吊著、腳趾朝上），下面那隻在前下方（撐著、腳趾朝下斜外）
      const fo = !down ? -0.008 : upper ? -0.012 : 0.008, la = !down ? 0.0145 : upper ? 0.011 : 0.0155
      const pt = P.clone().addScaledVector(F, fo).addScaledVector(S, L.sg * la)
      const q = X.toYA(pt), sp = X.surf(q.y, q.a, V()), n2 = X.normAt(q.y, q.a, V())
      out[i] = { p: sp.addScaledVector(n2, NUT_D0), n: n2, dir: (upper ? F.clone().negate() : F.clone()).addScaledVector(S, L.sg * (upper ? 0.5 : 0.7)).normalize() }
    })
    return out
  }
  function nutPose(X, t, dt) {
    const st = X.step, mv = st?.k === 'hop' || st?.k === 'step', k01 = mv ? clamp((X.st - st.pre) / st.dur, 0, 1) : 0
    // 身體位置：跳的時候 (y,a,h) 從起點平滑到終點，身體往外弧；走步：先換第一隻腳、身體在中段跟上、最後換第二隻腳
    let y = X.y, a = X.a, h = X.h, out = 0, crouch = 0
    if (st?.k === 'step') {
      // 身體往前的進度 e：照時間要到 ss(k, 0, 0.85)，但踩著的腳一定要搆得到（髖到腳踝 ≤ 腳長 97%）→ 搆不到就二分法退回去，慢一點跟上
      const pN = X.pitch - 0.45 * X.lean, hN = Math.max(X.hipH, X.bellyAt(pN) + 0.004)
      const okAt = (e) => {
        const yy = lerp(st.y0, st.y, e), aa = lerp(st.a0, st.a, e), hh = st.h0 + wrap(st.h - st.h0) * e
        const N2 = X.normAt(yy, aa, V()), tu2 = V(0, 1, 0).addScaledVector(N2, -N2.y).normalize(), ts2 = V().crossVectors(N2, tu2)
        const F2 = tu2.multiplyScalar(Math.cos(hh)).addScaledVector(ts2, Math.sin(hh))
        _um.makeBasis(X.fwd0, X.up0, V().crossVectors(X.fwd0, X.up0)); _um2.makeBasis(F2, N2, V().crossVectors(F2, N2))
        const Q2 = new THREE.Quaternion().setFromRotationMatrix(_um2.multiply(_um.transpose())).multiply(_uq2.setFromAxisAngle(X.axisP, pN))
        const base = X.surf(yy, aa, V()).addScaledVector(N2, hN + 0.0025 * Math.sin(Math.PI * e))
        return X.legs.every((L, i) => {
          const fk = i === st.lead ? ss(k01, 0.03, 0.45) : ss(k01, 0.5, 0.9)
          if (fk > 0.001 && fk < 0.999) return true
          const T2 = fk >= 0.999 ? L.to : L.from
          const dd = base.clone().add(L.hip0.clone().sub(X.hipM).applyQuaternion(Q2)).distanceTo(T2); return dd <= L.legLen * 0.97 && dd >= 0.007
        })
      }
      const want = ss(k01, 0.0, 0.85), e0 = st.eAch ?? 0
      let e = want
      if (want > e0 && !okAt(want)) { let lo = e0, hi = want; for (let it = 0; it < 7; it++) { const m = (lo + hi) / 2; if (okAt(m)) lo = m; else hi = m } e = lo }
      st.eAch = Math.max(e0, e)
      e = st.eAch
      y = lerp(st.y0, st.y, e); a = lerp(st.a0, st.a, e); h = st.h0 + wrap(st.h - st.h0) * e
      out = 0.0025 * Math.sin(Math.PI * e)
    }
    if (st?.k === 'hop') {
      const e = k01 * k01 * (3 - 2 * k01)
      y = lerp(st.y0, st.y, e); a = lerp(st.a0, st.a, e); h = st.h0 + wrap(st.h - st.h0) * e
      out = 0.009 * Math.sin(Math.PI * k01)
      crouch = X.st < st.pre ? ss(X.st, 0, st.pre) : k01 >= 1 ? 1 - ss(X.st - st.pre - st.dur, 0, 0.08) : 0
    }
    const N = X.normAt(y, a, V()), tu = V(0, 1, 0).addScaledVector(N, -N.y).normalize(), ts = V().crossVectors(N, tu)
    const F = tu.clone().multiplyScalar(Math.cos(h)).addScaledVector(ts, Math.sin(h)), S = V().crossVectors(N, F)
    // 身體轉向：模型的 fwd0 → F、up0 → N，再繞 side 前傾 pitch（頭朝下時多抬頭一點：茶腹鳾頭朝下時胸口離樹皮、頭往外翹）
    const down = -Math.cos(h)
    _um.makeBasis(X.fwd0, X.up0, V().crossVectors(X.fwd0, X.up0)); _um2.makeBasis(F, N, V().crossVectors(F, N))
    _uq.setFromRotationMatrix(_um2.multiply(_um.transpose()))
    // 探裂縫時上半身往樹皮壓（繞髖關節前傾），髖關節跟著抬高到肚子不碰樹皮
    const pNow = X.pitch - 0.45 * X.lean, hipNow = Math.max(X.hipH, X.bellyAt(pNow) + 0.004)
    _uq.multiply(_uq2.setFromAxisAngle(X.axisP, pNow))
    X.sit.quaternion.copy(_uq)
    const P = X.surf(y, a, V()).addScaledVector(N, hipNow + out - 0.002 * crouch)
    X.sit.position.copy(P).sub(_uv.copy(X.hipM).applyQuaternion(_uq))
    for (const b of X.allB) b.quaternion.copy(b.userData.nRest)
    X.sit.updateMatrixWorld(true)
    // 頭、脖子：平常頭往外抬（頭朝下時抬多一點）、偶爾左右看；探裂縫時往樹皮轉（theta 由嘴尖回授控制）
    const lookOut = 0.35 + 0.35 * Math.max(0, down)
    const pr = st?.k === 'probe'
    const th = pr ? X.theta : 0
    const sw = X.swallow > 0 ? Math.sin(Math.PI * (1 - X.swallow)) : 0
    const yaw = X.look * (pr ? 0 : 1)
    const turnB = (b, list) => { if (!b) return; b.parent.getWorldQuaternion(_uq).invert(); for (const [ax, an] of list) { _uv2.copy(ax).applyQuaternion(_uq).normalize(); b.quaternion.premultiply(_uq2.setFromAxisAngle(_uv2, an)) } b.updateMatrixWorld(true) }
    turnB(X.neck, [[S, (-lookOut + th) * 0.55 - 0.3 * sw], [N, yaw * 0.4]])
    turnB(X.head, [[S, (-lookOut + th) * 0.45 - 0.35 * sw], [N, yaw * 0.6]])
    if (X.tail) turnB(X.tail, [[S, -0.08 + 0.05 * Math.sin(t * 1.3)]])
    // 腳
    X.legs.forEach((L, i) => {
      // 這隻腳換位的進度 fk（0＝還在舊點、1＝已在新點）：跳步兩腳錯開 stag；走步先 lead 腳（0～0.32）、另一腳（0.6～0.92）
      const fk = st?.k === 'hop' ? ss(k01, 0.1 + (i === st.lead ? 0 : st.stag), 0.82 + (i === st.lead ? 0 : st.stag)) : st?.k === 'step' ? (i === st.lead ? ss(k01, 0.03, 0.45) : ss(k01, 0.5, 0.9)) : 1
      L.fk = fk; L.state = fk > 0.001 && fk < 0.999 ? 'SWING' : 'PLANT'
      const T = mv ? L.from.clone().lerp(L.to, fk).addScaledVector(N, (st.k === 'hop' ? 0.007 : 0.006) * Math.sin(Math.PI * fk)) : L.hold
      L.target = T
      const poleW = L.pole.clone().applyQuaternion(X.sit.quaternion)
      L.radial = null; ik2(L, T, poleW)
      // 腳掌：腳趾指向 dir（樹皮平面上），往樹皮斜 asin(d0/趾長) → 趾尖剛好碰到樹皮；跳起來時腳趾放鬆一點（往外翹）
      const dir = mv ? L.dirFrom.clone().lerp(L.dirTo, fk).normalize() : L.dir
      const sn = clamp(NUT_D0 / Math.max(0.004, L.toeLen), 0, 0.9) * (mv ? 1 - 1.6 * Math.sin(Math.PI * fk) : 1)
      const want = dir.clone().multiplyScalar(Math.sqrt(1 - Math.min(0.81, sn * sn))).addScaledVector(N, -sn)
      const Af = L.ft.getWorldPosition(V()), tc = L.toes.reduce((a2, b) => a2.add(b.getWorldPosition(V())), V()).divideScalar(L.toes.length)
      aimBone(L.ft, tc.sub(Af), want)
      // 腳趾抓樹皮：每根腳趾的第一節轉一下，讓趾尖剛好離樹皮 1 mm（踩著的時候；跳起來時放開）
      const gw = mv ? 1 - Math.sin(Math.PI * fk) : 1
      if (gw > 0.02) for (const tb of L.toes.concat(L.hallux)) {
        const ta = tb.parent; if (!ta?.isBone || ta === L.ft) continue
        const J = ta.getWorldPosition(V()), Tt = tb.getWorldPosition(V()), d = X.depth(Tt)
        const Tw = Tt.clone().addScaledVector(N, (d + 0.001) * gw)
        if (Tw.distanceTo(Tt) > 1e-4) aimBone(ta, Tt.sub(J), Tw.sub(J))
      }
    })
    X.cur = { y, a, h, N, F, S }
  }
  function nutStep(u, s, X, t, dt) {
    if (!X.step) {
      if (!X.q.length) nutPlan(X)
      X.step = X.q.shift(); X.st = 0
      const st = X.step
      if (st.k === 'hop' || st.k === 'step') {
        st.y0 = X.y; st.a0 = X.a; st.h0 = X.h
        // 先動哪隻腳：頭朝下往下走＝下面那隻（前腳）；其他時候左右輪流
        // 先動「落在後面」的那隻腳（沿移動方向最後面的；不然身體走過去會把它拉超過腳長 2.5 cm）；一樣的話左右輪流
        { const P0 = X.surf(X.y, X.a, V()), M = X.surf(st.y, st.a, V()).sub(P0), b = X.legs.map((L) => L.hold.clone().sub(P0).dot(M))
          st.lead = Math.abs(b[0] - b[1]) > 1e-5 ? (b[0] < b[1] ? 0 : 1) : 1 - (X.lastLead ?? 0); X.lastLead = st.lead; st.stag ??= 0 }
        // 頭先看下一個落點（往左右偏的那邊）
        X.lookW = clamp(wrap(st.h - X.h) * 0.8 + (st.a - X.a) * X.R0 * 15, -0.6, 0.6); X.lookT = st.dur + 0.3
        const to = nutHolds(X, st.y, st.a, st.h, [])
        X.legs.forEach((L, i) => { L.from.copy(L.hold); L.to.copy(to[i].p); L.dirFrom = L.dir.clone(); L.dirTo = to[i].dir; L.nTo = to[i].n })
        X.log.push([st.k, +(st.y - X.yH).toFixed(3), +st.h.toFixed(2)])
      } else if (st.k === 'probe') { X.theta = 0; X.pk = 0; X.caught = false; X.log.push(['probe', st.ok]) }
    }
    const st = X.step
    X.st += dt
    if ((st.k === 'hop' && X.st >= st.pre + st.dur + 0.08) || (st.k === 'step' && X.st >= st.dur + 0.02 && (st.eAch ?? 1) >= 0.999)) {
      X.y = st.y; X.a = st.a; X.h = st.h
      X.legs.forEach((L) => { L.hold.copy(L.to); L.dir = L.dirTo })
      X.step = null
    } else if (st.k !== 'hop' && st.k !== 'step' && X.st >= st.dur) {
      if (st.k === 'probe') { X.grub.visible = false; if (X.caught) X.swallow = 1; X.caught = false; X.probeDone = true }
      X.step = null
    }
    // 探裂縫：前 0.5 秒頭往樹皮靠近（嘴尖離樹皮 4 mm），之後啄 4～6 下（每下嘴尖伸進裂縫 3 mm），抓到的話最後 0.9 秒叼著蟲抬頭
    if (st.k === 'probe') {
      const k = X.st, hold = st.ok && k > st.dur - 0.9
      const peckPh = k > 0.6 && !hold ? ((k - 0.6) * 2.2) % 1 : 0
      const want = hold ? 0.012 : k < 0.6 ? 0.004 : 0.004 - 0.007 * Math.sin(Math.PI * peckPh) ** 2
      X.tipWant = want
      if (hold && !X.caught) X.caught = true
    }
    X.lean = damp(X.lean, st.k === 'probe' && X.st < st.dur - (st.ok ? 0.9 : 0.3) ? 1 : 0, 6, dt)
    if (X.swallow > 0) X.swallow = Math.max(0, X.swallow - dt / 0.5)
    // 平常偶爾轉頭看
    if ((X.lookT -= dt) <= 0) { X.lookT = rnd(0.6, 2.2); X.lookW = rnd(-0.7, 0.7) }
    X.look = damp(X.look, X.lookW, 10, dt)
    nutPose(X, t, dt)
    // 嘴尖：量這一格的位置（離樹皮多遠），下一格調 theta
    const tipW = X.sk.getVertexPosition(X.tip, _uv).applyMatrix4(X.sk.matrixWorld)
    X.tipD = -X.depth(tipW)
    if (st.k === 'probe') {
      X.theta = clamp(X.theta + clamp((X.tipD - X.tipWant) * 18, -0.07, 0.07) * Math.min(1, dt * 30), -0.4, 2.0)   // 增益太大會每格來回跳（量到 2 格一循環）
      if (X.caught && X.step === st) { X.grub.visible = true; X.grub.position.copy(tipW).addScaledVector(X.cur.N, 0.002); X.grub.quaternion.setFromUnitVectors(V(1, 0, 0), X.cur.S); X.grub.rotateY(0.4 * Math.sin(t * 25)) }
    } else X.theta = damp(X.theta, 0, 10, dt)
    // 拍照標籤
    const down = Math.cos(X.cur.h) < -0.3
    X.tag = st.k === 'probe' ? (X.caught ? 'barkcatch' : 'barkprobe') : down ? 'headdown' : Math.cos(X.cur.h) > 0.3 && (X.step?.k === 'hop' || X.step?.k === 'step' || X.q.some((q) => (q.k === 'hop' || q.k === 'step') && q.y > X.y)) ? 'climbup' : 'look'
  }
  function nutTick(t, dt) {
    for (const u of units) {
      if (!u.esc.climb || NUT_OFF) continue
      const s = u.ms[0]; if (!s?.m?.obj) continue
      if (!s.nut) { nutSetup(u); if (!s.nut) continue }
      const X = s.nut
      const home = !u.b.absent && u.state === 'home' && s.mode === 'perch'
      if (!home) { if (X.sit.visible) { X.sit.visible = false; X.grub.visible = false } X.wasHome = false; continue }
      if (!X.wasHome) {
        // 剛回到樹上（一開始、飛回來）：從降落的那一點開始，頭朝下停著
        if (X.everAway && s.home) { const q = X.toYA(s.home); X.y = clamp(q.y, X.yMin, X.yMax); X.a = clamp(q.a, X.aMin, X.aMax) }
        X.h = Math.PI; X.q.length = 0; X.step = { k: 'rest', dur: rnd(1, 3), look: 1 }; X.st = 0
        nutHolds(X, X.y, X.a, X.h, []).forEach((o, i) => { X.legs[i].hold.copy(o.p); X.legs[i].dir = o.dir })
        X.wasHome = true
      }
      X.everAway = true
      s.m.obj.visible = false; X.sit.visible = true
      if (X.force) { X.q.length = 0; X.step = null; if (X.force === 'down') X.h = Math.PI; if (X.force === 'probe') X.q.push({ k: 'probe', dur: 3.6, ok: true }); X.force = null }
      const P = world.camera.position
      if (X.cur && P.distanceTo(X.surf(X.y, X.a, _uv)) > 90) continue   // 太遠不更新（省效能）
      try { nutStep(u, s, X, t, dt) } catch (e) { X.err = (X.err ?? 0) + 1; X.errMsg = e.message + ' ' + (e.stack ?? '').split('\n')[1] }
    }
  }
  function songTick(t, dt) {
    if (songCfg.off) return
    for (const u of units) {
      if (!u.esc.songflight) continue
      const s = u.ms[0]; if (!s?.root) continue
      const X = s.song ??= { on: false, wait: rnd(12, 30), a0: Math.random() * 6.28, n: 0, aborts: 0 }
      const P = world.camera.position
      if (X.on) {
        if (u.b.absent) { songStop(X, 0.3); X.on = false; s.root.visible = false; s.m.obj.visible = true; s.mode = 'perch'; s.act = ''; continue }
        // 玩家走近（不在觀察屋裡）：中斷，照驚飛那套從現在的位置飛走
        const d = Math.hypot(P.x - s.root.position.x, P.z - s.root.position.z)
        if (!songCfg.noAbort && !inHide(P) && (d < 5 || (d < 7 && speed > 0.6))) {   // 站在步道上看不會打斷；走進草地到牠底下 5 m（或走著靠近到 7 m）才會
          songStop(X, 0.4); X.on = false; X.ph = ''; X.aborts++
          if (s.r.bones.tail) s.r.bones.tail.scale.set(1, 1, 1)
          const pos = s.root.position.clone(), away = pos.clone().sub(P).setY(0); if (away.lengthSq() < 1e-4) away.set(1, 0, 0)
          s.home.copy(X.home); s.faceH = s.head
          s.curve = outbound(pos, away.normalize(), null); s.len = s.curve.getLength(); s.dist = 0; s.t = 0
          s.mode = 'out'; s.wait = rnd(20, 38); u.state = 'away'; u.trip = false; u.alarm = 0
          X.wait = rnd(...u.esc.songflight)
          continue
        }
        u.alarm = 0
        // 離玩家 90 m 外：每 3 格算一次
        X.fr = (X.fr ?? 0) + 1; X.acc = (X.acc ?? 0) + dt
        if (P.distanceTo(s.root.position) > 90 && X.fr % 3) continue
        songStep(u, s, t, Math.min(X.acc, 0.1)); X.acc = 0
        if (X.t > 40) songEnd(u, s)   // 保險
        continue
      }
      if (u.b.absent || u.state !== 'home' || s.mode !== 'perch' || u.alarm > 0.2) continue
      if ((X.wait -= dt) > 0 && !X.force) continue
      s.m.obj.getWorldPosition(_sp)
      const d = Math.hypot(P.x - _sp.x, P.z - _sp.z)
      if (!X.force && (d < 8 || d > 150)) { X.wait = 4; continue }   // 人太近不飛起來唱；沒人在附近也不唱（省效能）
      X.force = false; songStart(u, s)
    }
  }

  const huntCfg = { noAbort: false, off: /[?&]nohunt/.test(location.search) }   // off：效能 A/B 測試（整個狩獵系統不跑）   // 測試錄影用：鏡頭跟拍時不要被當成玩家逼近
  function owlTick(t, dt) {
    if (huntCfg.off) return
    preyTick(dt)
    for (const u of units) {
      if (!u.esc.hunt) continue
      const s = u.ms[0]; if (!s?.root) continue
      if (!s.hunt) { owlSetup(u); if (!s.hunt) continue }
      const H = s.hunt
      if (H.on) {
        if (u.b.absent) { huntEnd(u, s, H); continue }
        // 玩家逼太近（不在觀察屋裡）：中斷狩獵、飛走
        const P = world.camera.position, at = H.sit.visible ? H.sit.position : s.root.position
        const d = P.distanceTo(at), lim = (u.esc.huntR ?? 6) * (speed > 4 ? 1.4 : 1)   // 狩獵中：玩家 6 m 內（用跑的 8.4 m）就中斷
        if (!huntCfg.noAbort && !inHide(P) && d < lim) { huntAbort(u, s, H); continue }
        // 離玩家很遠（80 m 外）：每 3 格才算一次（動作照樣進行，只是更新頻率低）
        H.acc += dt; H.fr++
        if (d > 80 && H.fr % 3) continue
        const step = Math.min(H.acc, 0.1); H.acc = 0
        u.alarm = 0
        if (H.kind === 'quarter') grassStep(u, s, H, t, step); else ggStep(u, s, H, t, step)
        if (H.pt > 25) { H.log.push('WATCHDOG:' + H.ph); huntEnd(u, s, H) }   // 保險：任何一個階段卡超過 25 秒就收掉
        continue
      }
      if (u.b.absent || u.state !== 'home' || s.mode !== 'perch' || u.alarm > 0.2) continue
      if ((H.wait -= dt) > 0 && !H.force) continue
      const P = world.camera.position, at = s.m.obj.getWorldPosition(_ov)
      if (!H.force && (P.distanceTo(at) > 140 || P.distanceTo(at) < u.esc.r)) { H.wait = 5; continue }   // 沒人在附近不出去（省效能）；人就在旁邊也不出去
      const opt = H.force ?? {}; H.force = null
      if (!(H.kind === 'quarter' ? grassStart(u, s, H, opt) : ggStart(u, s, H, opt))) H.wait = 30
    }
  }

  function tick(t, dt, { sneak = false } = {}) {
    colonyTick(t, dt)
    nestTick(t, dt)
    displayTick(t, dt)
    digTick(t, dt)
    owlTick(t, dt)
    songTick(t, dt)
    nutTick(t, dt)
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
      if (u.ms[0]?.nest?.on || u.ms[0]?.disp?.on || u.ms[0]?.dig?.on || u.ms[0]?.hunt?.on || u.ms[0]?.song?.on) continue   // 正在樹洞餵食／展示飛行（nestTick、displayTick 管）
      if (u.state === 'home') {
        // 自己出巢覓食（ESCAPE.sortie）：沒在警戒時倒數，時間到就照驚飛那一套從岩面朝外（穿過水簾）飛出去，在遠處待一陣子再飛回巢
        if (u.esc.sortie && u.alarm < 0.2) {
          u.sortT = (u.sortT ?? rnd(8, u.esc.sortie[0])) - dt
          if (u.sortT <= 0) { u.sortT = rnd(...u.esc.sortie); flush(u, t, !!(u.esc.hover || u.esc.hawk)); u.trip = true; for (const s2 of u.ms) s2.wait = rnd(14, 26); continue }
        }
        let d = Infinity
        for (const s of u.ms) { homeObj(s).getWorldPosition(_v); d = Math.min(d, _v.distanceTo(P)) }
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
    if (s.nut?.sit.visible) return { obj: s.nut.sit, act: s.nut.tag || 'look' }   // 2026-11-18 茶腹鳾在神木上
    if (s.song?.on) return { obj: s.root, act: s.act || 'songflight' }   // 2026-11-18 小雲雀鳴唱飛行
    if (s.hunt?.on) { const H = s.hunt; if (H.sit.visible) return { obj: H.sit, act: s.act || 'look' }; return s.root.visible ? { obj: s.root, act: s.act || 'fly' } : null }   // 2026-11-18 貓頭鷹狩獵
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
  window.__flight = { units, prey, nutGo: (f = 'down') => { const u = units.find((x) => x.b.def.id === 'nuthatch'); if (u?.ms[0]?.nut) u.ms[0].nut.force = f; return !!u?.ms[0]?.nut }, huntCfg, songCfg, songGo: () => { const u = units.find((x) => x.b.def.id === 'skylark'); const X = u?.ms[0]?.song; if (X) { X.force = true; X.wait = 0 } return !!X }, huntGo: (id, opt = {}) => { const u = units.find((x) => x.b.def.id === id); const H = u?.ms[0]?.hunt; if (H) { H.force = opt; H.wait = 0 } return !!H }, hunt: (id) => units.find((x) => x.b.def.id === id)?.ms[0]?.hunt, digGo: (type = 'dig') => { const u = units.find((x) => x.b.def.id === 'barbet'); const X = u?.ms[0]?.dig; if (X) { X.wait = 0; X.force = type } }, shotOf: (m) => shotOf(m), displayGo: (id) => { const u = units.find((x) => x.b.def.id === id); const m = u?.ms[0]?.m; if (m) m.obj.userData.displayFlight = true }, nestGo: (id) => { const u = units.find((x) => x.b.def.id === id); const N = u?.ms[0]?.nest; if (N) N.wait = 0 }, flush: (id) => { const u = units.find((x) => x.b.def.id === id); if (u && u.state === 'home') flush(u, 0) } }
  // 鏡頭被程式直接搬走時呼叫：這一跳不算玩家在跑（不然手會狂晃、鳥會被嚇飛）
  const snap = () => { last.copy(world.camera.position); speed = 0 }
  return { tick, units, shotOf, snap, arrive, depart, gone, canFly, add: addUnit, get speed() { return speed } }
}
