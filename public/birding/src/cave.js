// 2026-11-11 瀑布後面的岩窟步道（使用者：從山上走到瀑布，走進洞穴、在旁邊看瀑布；要有草、青苔，高模、更有臨場感。
// 參考：貴州黃果樹水簾洞、冰島 Seljalandsfoss 走到瀑布後面、ChatGPT 概念圖——岩拱門、濕石板路、長滿青苔和蕨類的岩壁、鐵欄杆）
// 模型：tools/make-cave-kit.py → models/props/cave_kit.glb（頂點色：綠多於紅＝青苔，其餘配花崗岩 triplanar）
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { ALP_SPURS, YOSE, alpineHeight, addCollider } from './layout.js'
import { mulberry32 } from './noise.js'
import { scatter } from './plants.js'
import { mossRockMaterial } from './yosemite-top.js'

const VER = new URL(import.meta.url).searchParams.get('v') ?? ''
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z)

export async function loadCaveKit() {
  const gl = await new GLTFLoader().loadAsync(`models/props/cave_kit.glb?v=${VER}`)
  const geo = {}
  gl.scene.updateMatrixWorld(true)
  gl.scene.traverse((o) => { if (o.isMesh) { const g = o.geometry.clone(); g.applyMatrix4(o.matrixWorld); if (g.attributes.color_1) { g.setAttribute('color', g.attributes.color_1); g.deleteAttribute('color_1') } geo[o.name] = g } })
  const rockM = mossRockMaterial(); rockM.roughness = 0.62          // 水霧裡的岩石是濕的
  const slabM = mossRockMaterial(); slabM.roughness = 0.42; slabM.color.setScalar(0.72)          // 石板路：濕得發亮
  return { geo, rockM, slabM }
}

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

  // 1) 濕石板路：沿步道兩到三塊並排、錯縫；盡頭的平台鋪滿
  for (let i = 0; i < line.length; i += 3) {
    const [x, z, tx, tz] = line[i]
    for (const lat of [-0.62, 0.02, 0.66]) {
      if (rnd() < 0.08) continue
      const px = x - tz * (lat + (rnd() - 0.5) * 0.14) + tx * (rnd() - 0.5) * 0.2, pz = z + tx * (lat + (rnd() - 0.5) * 0.14) + tz * (rnd() - 0.5) * 0.2
      const sc = 0.7 + rnd() * 0.75; put('slab_' + Math.floor(rnd() * 4), px, alpineHeight(px, pz) - 0.075 - rnd() * 0.02, pz, rnd() * 6.28, V(sc * (0.8 + rnd() * 0.5), 1, sc * (0.8 + rnd() * 0.5)), 0.05)
    }
  }
  for (let k = 0; k < 26; k++) { const a = rnd() * 6.28, d = Math.sqrt(rnd()) * 2.1, px = ex + 0.4 + Math.cos(a) * d, pz = ez + Math.sin(a) * d * 0.9; put('slab_' + Math.floor(rnd() * 4), px, alpineHeight(px, pz) - 0.075, pz, rnd() * 6.28, 0.9 + rnd() * 0.4, 0.03) }

  // 2) 岩拱門：步道進岩簷的地方，從拱門底下走進去（拱的兩隻腳各一個碰撞）
  const gate = (name, t, s) => {
    const [x, z, tx, tz] = line[Math.floor(line.length * t)], y = alpineHeight(x, z), yaw = Math.atan2(tx, tz)
    put(name, x, y - 0.25, z, yaw, s)
    const half = (name === 'arch_0' ? 3.4 / 2 + 1.5 * 0.55 : 2.9 / 2 + 1.2 * 0.55) * s
    for (const sd of [-1, 1]) for (const k of [0.85, 1.25]) addCollider(x - tz * sd * half * k, z + tx * sd * half * k, 0.75 * s, y + 3)
  }
  gate('arch_0', 0.5, 1.12)
  gate('arch_1', 0.8, 1.05)
  // 岩柱：平台和水簾中間偏西，跟拱門、岩壁圍出一個看水簾的「窗」
  { const x = ex - 4.4, z = ez - 3.6, y = alpineHeight(x, z); put('pillar_0', x, y - 0.5, z, 2.7, V(1.15, 0.9, 1.3), 0.25); addCollider(x, z, 1.0, y + 4) }
  // 後壁的大岩塊：平的那面貼岩壁（北邊），一塊接一塊
  for (const [name, t, off, s, yaw] of [['wall_2', 0.56, 2.7, 1.0, 0.25], ['wall_0', 0.68, 2.9, 1.05, -0.1], ['wall_1', 0.86, 2.6, 1.0, 0.15], ['wall_0', 0.98, 3.0, 0.9, -0.3], ['wall_2', 0.4, 2.8, 0.8, 0.5]]) {
    const [x0, z0, tx, tz] = line[Math.min(line.length - 1, Math.floor(line.length * t))], x = x0 - tz * off, z = z0 + tx * off
    const yw = Math.atan2(tx, tz) + Math.PI / 2 + yaw
    put(name, x, alpineHeight(x, z) - 0.3 * s, z, yw + Math.PI, s)
    addCollider(x, z, 1.2 * s, alpineHeight(x, z) + 2)
  }
  for (const [name, list] of Object.entries(lists)) {
    const im = new THREE.InstancedMesh(kit.geo[name], name.startsWith('slab') ? kit.slabM : kit.rockM, list.length)
    list.forEach((m, i) => im.setMatrixAt(i, m)); im.castShadow = true; im.receiveShadow = true; im.computeBoundingSphere(); g.add(im)
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

  // 4) 岩簷底下的補光：水簾把天光漫射進來（以前整個岩窟是黑的，看不到岩壁）。不投影
  { const [x, z] = [ex - 3.5, ez + 1.2], lt = new THREE.PointLight(0xb4cbd8, 34, 19, 1.7); lt.position.set(x, alpineHeight(x, z) + 3.2, z); g.add(lt)
    const l2 = new THREE.PointLight(0xb4cbd8, 20, 15, 1.7), [x2, z2, ] = line[Math.floor(line.length * 0.55)]; l2.position.set(x2, alpineHeight(x2, z2) + 2.6, z2 + 1); g.add(l2) }
  return g
}
