// 照片的客觀數據：按快門那一刻，畫面裡每隻鳥的種類、大小、有沒有被切到、被擋住多少、有沒有對到焦、在做什麼動作。
// 這些數字給評分（和之後的 LLM 評審）用。
import * as THREE from 'three'

// 每種鳥的基本價（越少見、越難拍越貴）
export const VALUE = {
  sparrow: 40, dove: 50, bulbul: 60, whiteeye: 80, babbler: 140, barbet: 120, treepie: 90, heron: 110,
  nightheron: 100, egret: 90, moorhen: 90, waterhen: 110, kingfisher: 220, mikado: 300, bluemagpie: 240, blackbulbul: 100,
}
// 特別的瞬間（acts 的名字 → 加成倍數、說明）
const ACTION = {
  dive: [2.2, '入水的瞬間'], strike: [1.8, '出手捕食'], worm: [1.6, '叼著蚯蚓'], peck: [1.15, '低頭覓食'],
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
      _box.setFromObject(m.obj, false)
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
      const act = m.acts?.name ?? ''
      found.push({ id: b.def.id, name: b.def.name, dist, area, inside, visible, sharp, act, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 })
    }
  }
  return found
}

// 評分：挑畫面裡最好的那隻當主角，0～100 分 + 價錢
export function scorePhoto(found) {
  if (!found.length) return { score: 0, price: 0, subject: null, notes: ['畫面裡沒有鳥'] }
  const rate = (f) => {
    // 大小：鳥佔畫面面積 8%～35% 最好；太小一路扣、塞滿畫面也扣一點
    const size = THREE.MathUtils.smoothstep(f.area, 0.004, 0.09) * (1 - 0.35 * THREE.MathUtils.smoothstep(f.area, 0.45, 0.8))
    const comp = 1 - 0.25 * Math.min(1, Math.hypot(f.cx, f.cy))   // 太偏邊緣扣一點
    return size * (0.35 + 0.65 * f.sharp) * (0.3 + 0.7 * f.visible) * (0.4 + 0.6 * f.inside) * comp
  }
  found.sort((a, b) => rate(b) - rate(a))
  const s = found[0], q = rate(s)
  const [mult, actNote] = ACTION[s.act] ?? [1, '']
  // 一般的好照片最多 85 分；要拍到特別的瞬間（入水、捕食、鳴叫…）才會接近 100
  const score = Math.round(Math.min(100, q * 85 * Math.min(1.3, mult)))
  const same = found.filter((f) => f.id === s.id && f.visible > 0.5 && f.sharp > 0.5).length
  const price = Math.round((VALUE[s.id] ?? 50) * (0.15 + 1.6 * q) * mult * (same > 1 ? 1.2 : 1) / 5) * 5
  const notes = []
  if (s.sharp < 0.5) notes.push('沒對到焦，糊掉了')
  if (s.visible < 0.6) notes.push('被東西擋住')
  if (s.inside < 0.85) notes.push('鳥被畫面切到')
  if (s.area < 0.006) notes.push('鳥太小了，要再靠近或換長一點的鏡頭')
  if (actNote) notes.push(actNote)
  if (same > 1) notes.push(`同一張拍到 ${same} 隻`)
  return { score, price, subject: s, notes }
}
