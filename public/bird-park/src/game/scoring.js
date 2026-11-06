// 照片的客觀數據：按快門那一刻，畫面裡每隻鳥的種類、大小、有沒有被切到、被擋住多少、有沒有對到焦、在做什麼動作。
// 這些數字給評分（和之後的 LLM 評審）用。
import * as THREE from 'three'

// 每種鳥的基本價（越少見、越難拍越貴）
export const VALUE = {
  sparrow: 40, dove: 50, bulbul: 60, whiteeye: 80, babbler: 140, barbet: 120, treepie: 90, heron: 110,
  nightheron: 100, egret: 90, moorhen: 90, waterhen: 110, kingfisher: 220, mikado: 300, bluemagpie: 240, blackbulbul: 100,
  spoonbill: 320, thrush: 150, pheasant: 280, oriole: 220,
}
// 收購價：藝術是主觀的，相機行不是資源回收——60 分以下不收；60～70 給正常價的 10%、70～80 25%、80～90 50%、90～99 70%，
// 100 分才是正常價（基本價 × 3）；超過 100 分每多 1 分多給 5%。同一張拍到好幾隻同種的鳥再 ×1.2
export const MIN_SCORE = 60
const TIERS = [[100, 1], [90, 0.7], [80, 0.5], [70, 0.25], [60, 0.1]]
export function priceFor(id, score, same = 1) {
  if (!(score >= MIN_SCORE)) return 0
  const full = (VALUE[id] ?? 50) * 3 * (same > 1 ? 1.2 : 1)
  const k = score > 100 ? 1 + (score - 100) * 0.05 : TIERS.find(([s]) => score >= s)[1]
  return Math.max(5, Math.round(full * k / 5) * 5)
}
// 特別的瞬間（acts 的名字 → 加成倍數、說明）
const ACTION = {
  dive: [2.2, '入水的瞬間'], strike: [1.8, '出手捕食'], worm: [1.6, '叼著蚯蚓'], peck: [1.15, '低頭覓食'],
  takeoff: [2.0, '起飛的瞬間'], land: [1.8, '降落的瞬間'], fly: [1.7, '飛行中'], run: [1.25, '逃跑中'],
  call: [1.2, '正在鳴叫'], preen: [1.15, '理毛'], hunt: [1.1, '盯著獵物'], walk: [1.0, ''], look: [1.05, '抬頭張望'],
}

const _box = new THREE.Box3(), _v = new THREE.Vector3(), _c = new THREE.Vector3(), _s = new THREE.Vector3()
const ray = new THREE.Raycaster()

// 一隻鳥（一群的話是每一隻）
function members(b) { return b.built.birds ?? [b.built] }

// cam：拍照用的鏡頭；focusDist：對焦距離；dofTol：景深容許的距離誤差（公尺）
export function measurePhoto(world, cam, { focusDist, dofTol }) {
  cam.updateMatrixWorld()
  const occluders = []
  world.scene.traverse((o) => { if ((o.isMesh || o.isInstancedMesh) && o.visible && !o.isSkinnedMesh && o.layers.test(ray.layers) && !o.material?.transparent) occluders.push(o) })
  const found = []
  for (const b of world.birds) {
    const d0 = b.target.distanceTo(cam.position)
    if (d0 > 160) continue
    for (const m of members(b)) {
      // 遊戲裡鳥會飛走：飛行中量飛行模型、飛遠躲起來的不算（world.shotOf 由 flight.js 提供）
      const sh = world.shotOf ? world.shotOf(m) : { obj: m.obj, act: m.acts?.name ?? '' }
      if (!sh) continue
      _box.setFromObject(sh.obj, false)
      if (_box.isEmpty()) continue
      _box.getCenter(_c); _box.getSize(_s)
      // 投影到畫面：8 個角 → 畫面上的框
      let x0 = 9, x1 = -9, y0 = 9, y1 = -9, behind = false
      for (let i = 0; i < 8; i++) {
        _v.set(i & 1 ? _box.max.x : _box.min.x, i & 2 ? _box.max.y : _box.min.y, i & 4 ? _box.max.z : _box.min.z).project(cam)
        if (_v.z > 1) behind = true
        x0 = Math.min(x0, _v.x); x1 = Math.max(x1, _v.x); y0 = Math.min(y0, _v.y); y1 = Math.max(y1, _v.y)
      }
      if (behind || !Number.isFinite(x0 + x1 + y0 + y1) || x1 < -1 || x0 > 1 || y1 < -1 || y0 > 1) continue
      const area = (x1 - x0) * (y1 - y0) / 4                        // 佔畫面的比例
      const inside = (Math.min(x1, 1) - Math.max(x0, -1)) * (Math.min(y1, 1) - Math.max(y0, -1)) / ((x1 - x0) * (y1 - y0))
      // 被擋住：從鏡頭打 9 條射線到鳥身上（中心＋往內縮的 8 個角）
      let seen = 0
      const dist = cam.position.distanceTo(_c)
      for (let i = 0; i < 9; i++) {
        if (i === 8) _v.copy(_c)
        else _v.set(i & 1 ? 0.3 : -0.3, i & 2 ? 0.3 : -0.3, i & 4 ? 0.3 : -0.3).multiply(_s).add(_c)
        ray.set(cam.position, _v.clone().sub(cam.position).normalize())
        ray.far = cam.position.distanceTo(_v) - 0.05
        if (!ray.intersectObjects(occluders, false).length) seen++
      }
      const visible = seen / 9
      if (visible === 0) continue
      const focusErr = Math.abs(dist - focusDist)
      const sharp = 1 - THREE.MathUtils.smoothstep(focusErr, dofTol, dofTol * 3)
      const act = sh.act
      const f = { id: b.def.id, name: b.def.name, dist, area, inside, visible, sharp, act, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, box: [x0, y0, x1, y1] }
      Object.defineProperty(f, 'obj', { value: sh.obj, enumerable: false })   // 相機算動態模糊用；不可列舉，存檔時不會被存進去
      found.push(f)
    }
  }
  return found
}

// 評分：挑畫面裡最好的那隻當主角，0～100 分 + 價錢
// ex：曝光的結果 { over 過曝幾格（負＝欠曝）, noise 雜訊強度, shake 手震像素 }（camera.js 算的）
export function scorePhoto(found, ex = {}) {
  if (!found.length) return { score: 0, price: 0, subject: null, notes: ['畫面裡沒有鳥'] }
  // 曝光差半格以內不扣；差越多扣越多（最多扣到 0.3）。雜訊輕微不扣
  const over = ex.over ?? 0, expo = Math.max(0.3, 1 - 0.2 * Math.max(0, Math.abs(over) - 0.5))
  const grain = 1 - THREE.MathUtils.clamp(((ex.noise ?? 0) - 6) / 40, 0, 0.5)
  const rate = (f) => {
    // 大小：鳥佔畫面面積 8%～35% 最好；太小一路扣、塞滿畫面也扣一點
    const size = THREE.MathUtils.smoothstep(f.area, 0.004, 0.09) * (1 - 0.35 * THREE.MathUtils.smoothstep(f.area, 0.45, 0.8))
    const comp = 1 - 0.25 * Math.min(1, Math.hypot(f.cx, f.cy))   // 太偏邊緣扣一點
    return size * (0.35 + 0.65 * f.sharp) * (0.3 + 0.7 * f.visible) * (0.4 + 0.6 * f.inside) * comp
  }
  found.sort((a, b) => rate(b) - rate(a))
  const s = found[0], q = rate(s) * expo * grain
  const [mult, actNote] = ACTION[s.act] ?? [1, '']
  // 一般的好照片最多 85 分；要拍到特別的瞬間（入水、捕食、起飛…）才會到 100 以上（最高 110）
  const score = Math.round(Math.min(110, q * 85 * Math.min(1.3, mult)))
  // 0 分＝等於沒拍到鳥（太小、太糊、被擋住、太暗…）：不算主角、0 元，相機行不收
  if (score <= 0) return { score: 0, price: 0, subject: null, notes: ['沒拍到鳥（太小、太糊或看不清楚）'] }
  const same = found.filter((f) => f.id === s.id && f.visible > 0.5 && f.sharp > 0.5).length
  const price = priceFor(s.id, score, same)
  const notes = []
  if (score < MIN_SCORE) notes.push(`未滿 ${MIN_SCORE} 分，相機行不收`)
  if ((s.focusSharp ?? s.sharp) < 0.5) notes.push('沒對到焦，糊掉了')
  else if ((ex.shake ?? 0) > 2) notes.push('手震，快門太慢')
  else if ((s.motion ?? 0) > 3) notes.push('鳥在動，快門不夠快')
  else if (s.act === 'fly' || s.act === 'takeoff' || s.act === 'land') { if ((s.motion ?? 9) < 1) notes.push('飛行中凍結得很清楚') }
  if (over > 1) notes.push('曝光過度，太亮')
  else if (over < -1) notes.push('曝光不足，太暗')
  if ((ex.noise ?? 0) > 14) notes.push('雜訊很多')
  if (s.visible < 0.6) notes.push('被東西擋住')
  if (s.inside < 0.85) notes.push('鳥被畫面切到')
  if (s.area < 0.006) notes.push('鳥太小了，要再靠近或換長一點的鏡頭')
  if (actNote) notes.push(actNote)
  if (same > 1) notes.push(`同一張拍到 ${same} 隻`)
  return { score, price, subject: s, notes }
}
