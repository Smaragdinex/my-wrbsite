// 植物與園藝小物：全部用 InstancedMesh，一種東西一次畫完
import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import {
  TAU, MTN, PATHS, RAMP, DOME, POOL, DECK, clamp, lerp,
  domeY, terrainHeight, pathClearAt, poolQ, mtnR, rampSample, rampHeights, rampInner, insideGarden, distToMtn,
  colliders, addCollider, inAlpine, alpineHeight, ALP_POND,
} from './layout.js'
import { mulberry32, fbm2 } from './noise.js'
import { addWind, windUniforms } from './wind.js'
import { scatter, nodeHeight, parts } from './plants.js'
import { lodRegister, lodRegisterGrass } from './lod.js'
import * as T from './textures.js'

const UP = new THREE.Vector3(0, 1, 0)
const _m = new THREE.Matrix4()

/* ---------- 幾何 ---------- */
// 花頭：一片片花瓣（基部在中心、往外伸、尖端往上翹成杯狀），貼花瓣貼圖；花心另外一顆扁球。單位：花的直徑約 1
function petalHead(n, len, wid, cup, tilt, seed = 1) {
  const r = mulberry32(seed), geos = []
  for (let i = 0; i < n; i++) {
    const g = new THREE.PlaneGeometry(wid, len, 1, 4), p = g.attributes.position
    const lift = (r() - 0.5) * 0.06
    for (let k = 0; k < p.count; k++) {
      const x = p.getX(k), y = p.getY(k) + len / 2, t = y / len
      p.setXYZ(k, y + 0.03, (cup * t * t + tilt * t + lift * t) * len, x * (1 - 0.15 * t))
    }
    g.rotateY((i + (r() - 0.5) * 0.25) / n * TAU)
    geos.push(g)
  }
  const m = mergeGeometries(geos)
  m.computeVertexNormals()
  return m
}
// 葉片：從地面斜斜往外長、往下垂的彎葉（長 1、寬 0.3）
function leafBlade() {
  const g = new THREE.PlaneGeometry(0.3, 1, 1, 5), p = g.attributes.position
  for (let k = 0; k < p.count; k++) {
    const x = p.getX(k), t = p.getY(k) + 0.5
    p.setXYZ(k, t * 0.85, 0.55 * Math.sin(t * Math.PI * 0.8) - 0.1 * t, x)
  }
  g.computeVertexNormals()
  return g
}
/* ---------- 擺放輔助 ---------- */
// lod：多高（公尺），矮的東西（花）越遠越稀；不填當成 10 公尺＝只做視野外不畫（長椅、路燈不會遠了就消失）
function makeInst(geo, mat, list, { cast = true, receive = true, colors = null, lod = 10 } = {}) {
  const m = new THREE.InstancedMesh(geo, mat, Math.max(1, list.length))
  list.forEach((it, i) => {
    _m.compose(it.p, it.q, it.s)
    m.setMatrixAt(i, _m)
    if (colors) m.setColorAt(i, it.c)
  })
  m.count = list.length
  m.castShadow = cast
  m.receiveShadow = receive
  m.computeBoundingSphere()
  lodRegister([m], lod)
  return m
}
const qY = (a) => new THREE.Quaternion().setFromAxisAngle(UP, a)
const v3 = (x, y, z) => new THREE.Vector3(x, y, z)
const sc = (s) => new THREE.Vector3(s, s, s)

const frontOfFall = (th) => Math.abs(Math.atan2(Math.sin(th - Math.PI), Math.cos(th - Math.PI))) < 0.42
function freeOfColliders(x, z, r) {
  for (const c of colliders) if (Math.hypot(x - c.x, z - c.z) < c.r + r) return false
  return true
}
function groundOK(x, z, { clear = 1, mtnPad = 1.2, pool = 1.3, rho = 0.94 } = {}) {
  if (!insideGarden(x, z, rho)) return false
  // 鳥活動的範圍（停棲樹、走路的草地）不種東西
  for (const r of reserved) if ((x - r.x) ** 2 + (z - r.z) ** 2 < r.r * r.r) return false
  if (pathClearAt(x, z) < clear) return false
  if (poolQ(x, z) < pool) return false
  const d = distToMtn(x, z)
  if (d < mtnR(Math.atan2(z - MTN.z, x - MTN.x), 0) + mtnPad) return false
  // 低矮步道正下方不種，免得穿出步道
  const gy = terrainHeight(x, z)
  if (d < 23 && rampHeights(x, z).some((h) => h - gy < 2.5)) return false
  return true
}
function randInGarden(rnd) {
  const a = rnd() * TAU, r = Math.sqrt(rnd()) * 0.94
  return [DOME.A * r * Math.cos(a), DOME.B * r * Math.sin(a)]
}

/* ---------- 主體 ---------- */
// 草葉：4 段、越上越窄、頂端收成一點；擺放、彎曲、風都在 shader 裡做。A：位置＋方向，B：顏色＋高度。
// 寫實一點的地方：葉面左右兩半法線往外歪（看起來是有弧度的葉子，不是平板）、背光時太陽從葉子後面透過來（偏黃綠的亮光）、
// 根部暗（被其他草擋住）、尖端偶爾枯黃
const _sunDefault = new THREE.Vector3(-0.45, 0.8, 0.3).normalize()
// lawn：短草坪用 2 段（3 個三角形）、法線大多朝上（像地面一樣均勻受光，不會一片亮一片黑）
// cane：玉山箭竹（2026-11-07）。gB.w > 0 是竹稈（細、直）；gB.w < 0 是葉子：從稈上某個高度長出來、往外斜伸、尾端微垂，葉形是披針形（下三分之一最寬、尖尾）
export function bladeMesh(A, B, { width = [0.014, 0.016], sun = _sunDefault, lawn = false, cane = false } = {}) {
  const ys = lawn ? [0, 0.5] : cane ? [0, 0.18, 0.42, 0.7] : [0, 0.3, 0.56, 0.78], ws = lawn ? [1, 0.55] : cane ? [0.3, 0.92, 1, 0.62] : [1, 0.85, 0.62, 0.36], P = [], I = []
  ys.forEach((y, i) => P.push(-0.5 * ws[i], y, 0, 0.5 * ws[i], y, 0))
  P.push(0, 1, 0)
  for (let i = 0; i < ys.length - 1; i++) { const k = i * 2; I.push(k, k + 1, k + 3, k, k + 3, k + 2) }
  const tip = ys.length * 2; I.push(tip - 2, tip - 1, tip)
  const g = new THREE.InstancedBufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3))
  g.setAttribute('normal', new THREE.Float32BufferAttribute(P.map((_, i) => (i % 3 === 1 ? 1 : 0)), 3))
  g.setIndex(I)
  g.setAttribute('gA', new THREE.InstancedBufferAttribute(new Float32Array(A), 4))
  g.setAttribute('gB', new THREE.InstancedBufferAttribute(new Float32Array(B), 4))
  g.instanceCount = A.length / 4
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 100)
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.85, side: THREE.DoubleSide })
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = windUniforms.uTime
    sh.uniforms.uSun = { value: sun.clone() }
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        uniform float uTime;
        attribute vec4 gA;   // x, y, z, 方向
        attribute vec4 gB;   // 顏色 + 高度
        varying vec3 vGcol; varying float vY; varying vec3 vGw;`)
      .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
        vec2 nd = vec2(cos(gA.w), sin(gA.w));
        vec3 side = vec3(-nd.y, 0.0, nd.x);
        // 葉面有弧度：左右兩半的法線各往外歪
        objectNormal = normalize(vec3(nd.x, 0.0, nd.y) * (fract(gA.w * 3.7) > 0.5 ? 1.0 : -1.0) * ${lawn ? '0.2' : '0.55'} + vec3(0.0, ${lawn ? '1.0' : '0.75'}, 0.0) + side * sign(position.x) * ${lawn ? '0.15' : '0.45'});`)
      .replace('#include <begin_vertex>', `
        float a = gA.w, h = abs(gB.w), y = position.y, leaf = ${cane ? 'step(gB.w, 0.0)' : '0.0'};
        float lean = mix(0.15 + fract(a * 7.13) * 0.6, 1.0 + fract(a * 7.13) * 0.9, leaf);
        float w = sin(uTime * 1.2 + gA.x * 0.3 + gA.z * 0.17) * 0.6 + sin(uTime * 2.9 + gA.x * 2.1 + gA.z * 1.7) * 0.2;
        vec2 dir = vec2(cos(a), sin(a));
        float wid = (${width[0].toFixed(4)} + fract(a * 5.3) * ${width[1].toFixed(4)}) * ${cane ? 'mix(0.22, 1.0, leaf)' : '1.0'};
        vec3 transformed = gA.xyz;
        transformed.xz += vec2(-dir.y, dir.x) * position.x * wid;
        transformed.xz += dir * lean * y * y * h + vec2(0.7, 0.35) * w * y * y * h * 0.25;
        transformed.y += y * h * (1.0 - 0.18 * lean) - leaf * y * y * h * 0.45;   // 葉子尾端微垂
        vY = y;
        // 每片草顏色都不一樣一點（亮度、偏黃偏藍），根部暗、往上變亮
        float jit = fract(sin(dot(gA.xz, vec2(12.9898, 78.233))) * 43758.5453);
        vGcol = gB.rgb * mix(0.82, 1.12, jit) * mix(mix(0.3, 0.62, leaf), ${lawn ? '0.95' : '1.08'}, smoothstep(0.0, 0.85, y));
        vGcol = mix(vGcol, vec3(0.7, 0.66, 0.4) * dot(gB.rgb, vec3(0.5)) * 1.5, smoothstep(0.7, 1.0, y) * step(0.82, fract(a * 13.7)) * 0.4);`)
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvGw = (modelMatrix * vec4(transformed, 1.0)).xyz;')
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uSun; varying vec3 vGcol; varying float vY; varying vec3 vGw;')
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= vGcol;')
      .replace('#include <opaque_fragment>', `
        // 背光透光：太陽在葉子後面時，葉子邊緣和上半部透出黃綠色的光
        vec3 vd = normalize(cameraPosition - vGw);
        float back = pow(max(dot(-vd, uSun), 0.0), 3.0);
        outgoingLight += vGcol * vec3(1.0, 1.15, 0.5) * back * smoothstep(0.3, 0.95, vY) * 0.35;
        #include <opaque_fragment>`)
  }
  mat.customProgramCacheKey = () => 'grassBlade2' + (lawn ? 'L' : '') + (cane ? 'C' : '')
  const m = new THREE.Mesh(g, mat)
  m.receiveShadow = true
  m.layers.set(1)   // 水面倒影不畫草葉（main.js 的鏡頭有開 layer 1）
  return m
}

let reserved = []
export function buildFlora(scene, lib, { stopsFor, reserve = [] } = {}) {
  reserved = reserve
  const rnd = mulberry32(2024)
  const tex = {
    vine: T.vineTex(),
  }
  const foliage = (map, wind, extra = {}) => addWind(new THREE.MeshStandardMaterial({ map, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.85, ...extra }), wind)
  const mats = {
    vine: foliage(tex.vine, 0.004),
    flower: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, side: THREE.DoubleSide }),
    stem: new THREE.MeshStandardMaterial({ color: 0x4f7a2a, roughness: 0.9 }),
    wood: new THREE.MeshStandardMaterial({ color: 0x9a6a40, roughness: 0.8 }),
    metal: new THREE.MeshStandardMaterial({ color: 0x3e4447, roughness: 0.4, metalness: 0.7 }),
    lamp: Object.assign(new THREE.MeshStandardMaterial({ color: 0xfff2d0, emissive: 0xffd89a, emissiveIntensity: 1.2 }), { userData: { lamp: [0.1, 9] } }),   // 燈泡：白天關著、晚上很亮
  }

  /* --- 步道邊的長椅、路燈、解說牌 --- */
  const benches = [], lamps = [], signs = []
  // 鳥的活動範圍（和鏡頭那一側）不放長椅、路燈，不然會剛好擋在鳥前面
  // 岔路口：每條支線的頭尾（接到別條步道的地方）；環狀的 loop、ring 沒有頭尾
  const crossings = PATHS.filter((q) => q.name !== 'loop' && q.name !== 'ring').flatMap((q) => [q.points[0], q.points[q.points.length - 1]])
  const nearCrossing = (x, z, r) => crossings.some((pt) => (pt.x - x) ** 2 + (pt.z - z) ** 2 < r * r)
  const nearBird = (x, z) => reserved.some((r) => (x - r.x) ** 2 + (z - r.z) ** 2 < (r.r + 4) ** 2)
  for (const p of PATHS) {
    if (p.name === 'spur') continue
    const pts = p.points
    const every = p.name === 'loop' ? 70 : 45
    for (let k = 20; k < pts.length - 10; k += every) {
      const a = pts[k - 1], b = pts[k + 1]
      const tx = b.x - a.x, tz = b.z - a.z, tl = Math.hypot(tx, tz)
      const nx = -tz / tl, nz = tx / tl
      const side = (k / every) % 2 < 1 ? 1 : -1
      const off = p.w / 2 + 0.9
      const x = pts[k].x + nx * off * side, z = pts[k].z + nz * off * side
      if (!insideGarden(x, z, 0.92) || poolQ(x, z) < 1.4 || nearBird(x, z)) continue
      if (distToMtn(x, z) < mtnR(Math.atan2(z - MTN.z, x - MTN.x), 0) + 2) continue
      const face = Math.atan2(-nx * side, -nz * side)
      // 岔路口（支線接到別條步道的地方，7 公尺內）不放長椅（會擋路、也不好看），改放解說牌；不多抽亂數，其他位置的擺設才不會全部跑掉
      // 也不能落在別條步道上（步道交會處，往外推的位置可能剛好是另一條路），長椅之間至少 8 公尺（之前有兩張擠在一起）
      const roomy = pathClearAt(x, z) > 0.35 && !benches.some((b) => Math.hypot(b.p.x - x, b.p.z - z) < 8)
      if (rnd() < 0.55 && !nearCrossing(x, z, 7) && roomy) {
        benches.push({ p: v3(x, terrainHeight(x, z), z), q: qY(face), s: sc(1) })
        addCollider(x, z, 0.9, terrainHeight(x, z) + 1)
      }   // 其他位置原本放解說牌（空白的木板），2026-11-07 使用者說不要：不放（亂數照抽，其他擺設位置不變）
    }
    // 路燈：另一側、錯開
    for (let k = 35; k < pts.length - 10; k += 55) {
      const a = pts[k - 1], b = pts[k + 1]
      const tx = b.x - a.x, tz = b.z - a.z, tl = Math.hypot(tx, tz)
      const side = (k / 55) % 2 < 1 ? -1 : 1
      // 往外推到離所有步道邊至少 0.4 公尺（岔路口那盞原本站在路中間）；推 2 公尺還在路上就不放
      let off = p.w / 2 + 0.45, x, z
      for (; off < p.w / 2 + 2.5; off += 0.25) { x = pts[k].x - tz / tl * off * side; z = pts[k].z + tx / tl * off * side; if (pathClearAt(x, z) > 0.4) break }
      if (pathClearAt(x, z) <= 0.4) continue
      if (benches.some((b) => Math.hypot(b.p.x - x, b.p.z - z) < 3)) continue   // 不要貼著長椅
      if (lamps.some((l) => Math.hypot(l.p.x - x, l.p.z - z) < 12)) continue   // 2026-11-10 兩條步道並排的地方，兩邊的路燈會擠在一起：12 公尺內只留一盞
      if (!insideGarden(x, z, 0.92) || poolQ(x, z) < 1.3 || !freeOfColliders(x, z, 0.6) || nearBird(x, z)) continue
      if (distToMtn(x, z) < mtnR(Math.atan2(z - MTN.z, x - MTN.x), 0) + 1.5) continue
      lamps.push({ p: v3(x, terrainHeight(x, z), z), q: qY(0), s: sc(1) })
      addCollider(x, z, 0.18, terrainHeight(x, z) + 4)
    }
  }
  {
    const seat = []
    for (let i = 0; i < 4; i++) seat.push(new THREE.BoxGeometry(1.8, 0.05, 0.11).translate(0, 0.45, -0.2 + i * 0.13))
    for (let i = 0; i < 3; i++) seat.push(new THREE.BoxGeometry(1.8, 0.1, 0.04).rotateX(-0.2).translate(0, 0.62 + i * 0.13, -0.28 - i * 0.03))
    const legs = []
    for (const x of [-0.8, 0.8]) legs.push(new THREE.BoxGeometry(0.06, 0.45, 0.5).translate(x, 0.22, -0.05), new THREE.BoxGeometry(0.06, 0.5, 0.06).translate(x, 0.7, -0.32))
    const g = mergeGeometries([mergeGeometries(seat), mergeGeometries(legs)], true)
    scene.add(makeInst(g, [mats.wood, mats.metal], benches))
  }
  {
    // 公園路燈（鑄鐵、墨綠烤漆）：八角底座 → 有凹槽線條的錐形燈桿 → 裝飾環 → 六角燈籠（玻璃燈罩＋框條）→ 斗笠燈帽＋頂飾
    // 燈罩玻璃用 mats.lamp（白天霧面、晚上發光，world.js 的日夜在調）
    const prof = [[0, 0], [0.2, 0], [0.2, 0.06], [0.17, 0.09], [0.17, 0.32], [0.13, 0.36], [0.11, 0.42], [0.085, 0.5], [0.075, 1.6],
      [0.06, 2.55], [0.085, 2.58], [0.085, 2.64], [0.05, 2.68], [0.045, 2.84], [0.09, 2.88], [0.14, 2.9], [0.14, 2.94], [0, 2.94]].map(([r, y]) => new THREE.Vector2(r, y))
    const post = new THREE.LatheGeometry(prof, 8)
    // 燈桿上的凹槽：沿著桿身的細長條（比桿身稍微凸出一點，看起來有稜線）
    const flutes = []
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + Math.PI / 8
      flutes.push(new THREE.BoxGeometry(0.018, 1.9, 0.018).translate(0, 1.5, 0).translate(Math.cos(a) * 0.068, 0, Math.sin(a) * 0.068))
    }
    // 燈籠框：六根斜的框條＋上下兩圈
    const frame = [], gB = 2.95, gT = 3.38, rB = 0.13, rT = 0.18
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2
      const b = new THREE.Vector3(Math.cos(a) * rB, gB, Math.sin(a) * rB), t = new THREE.Vector3(Math.cos(a) * rT, gT, Math.sin(a) * rT)
      const len = b.distanceTo(t), bar = new THREE.CylinderGeometry(0.012, 0.012, len, 4)
      bar.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, t.clone().sub(b).normalize())).translate((b.x + t.x) / 2, (b.y + t.y) / 2, (b.z + t.z) / 2)
      frame.push(bar)
    }
    frame.push(new THREE.CylinderGeometry(rB + 0.015, rB + 0.015, 0.035, 6).translate(0, gB, 0), new THREE.CylinderGeometry(rT + 0.02, rT + 0.02, 0.04, 6).translate(0, gT, 0))
    // 燈帽：六角斗笠＋上面一小截＋頂飾小球
    const roof = new THREE.ConeGeometry(0.27, 0.2, 6).translate(0, gT + 0.12, 0)
    const top = new THREE.CylinderGeometry(0.035, 0.05, 0.08, 6).translate(0, gT + 0.25, 0)
    const fin = new THREE.SphereGeometry(0.035, 8, 6).translate(0, gT + 0.32, 0)
    const iron = mergeGeometries([post, ...flutes, ...frame, roof, top, fin].map((g) => g.index ? g.toNonIndexed() : g).map((g) => { g.deleteAttribute('uv'); return g }))   // 各自的法線（不重算，不然整支都變成一面一面的）
    // 玻璃燈罩：六角錐台，裡面再一顆小燈泡（晚上看起來中間最亮）
    // 玻璃燈罩：透明帶一點暖色、會反光；白天看得到裡面的燈泡，晚上整個燈罩泛光、燈泡最亮
    const glass = new THREE.CylinderGeometry(rT - 0.005, rB - 0.005, gT - gB, 6, 1, true).translate(0, (gB + gT) / 2, 0)
    const bulb = new THREE.SphereGeometry(0.045, 12, 10).scale(1, 1.35, 1).translate(0, (gB + gT) / 2 - 0.02, 0)
    const socket = new THREE.CylinderGeometry(0.03, 0.035, 0.07, 8).translate(0, gB + 0.05, 0)
    mats.iron = new THREE.MeshStandardMaterial({ color: 0x2b3b33, roughness: 0.38, metalness: 0.55 })   // 墨綠烤漆鑄鐵
    mats.lampGlass = Object.assign(new THREE.MeshStandardMaterial({ color: 0xfff4dc, emissive: 0xffc77a, emissiveIntensity: 0.05, transparent: true, opacity: 0.38,
      roughness: 0.08, metalness: 0.1, side: THREE.DoubleSide, depthWrite: false }), { userData: { lamp: [0.02, 1.6] } })
    const sock = socket.toNonIndexed(); sock.deleteAttribute('uv')
    scene.add(makeInst(mergeGeometries([iron, sock]), mats.iron, lamps))
    scene.add(makeInst(bulb, mats.lamp, lamps, { cast: false }))
    const gl = makeInst(glass, mats.lampGlass, lamps, { cast: false }); gl.renderOrder = 3
    scene.add(gl)
  }


  /* --- 寫實植物模型（plants.js） --- */
  const pick = (names) => names[Math.floor(rnd() * names.length)]
  const tint = (h = 0.06, l = 0.12) => new THREE.Color().setHSL(0.25 + (rnd() - 0.5) * h, 0.15, 0.92 + (rnd() - 0.5) * l)
  const lists = {}
  const put = (name, it) => (lists[name] ||= []).push(it)
  // 模型（縮放 1 時）離中心最遠的距離：岩塊轉向任意，所以用包圍盒對角線的一半
  const extCache = {}
  const rockExt = (name) => extCache[name] ??= (lib[name] ? new THREE.Box3().setFromObject(lib[name]).getSize(v3()).length() / 2 : 1)
  const H = (name) => nodeHeight(lib[name])

  // 導覽站用的「主角」：固定位置，鏡頭對著拍（stops.js 用回傳的 heroes）
  const heroes = {}
  const nearOK = (x0, z0, opts, r = 0) => {
    for (let k = 0; k < 200; k++) {
      const a = k * 2.4, d = k * 0.15
      const x = x0 + Math.cos(a) * d, z = z0 + Math.sin(a) * d
      if (groundOK(x, z, opts) && freeOfColliders(x, z, r)) return [x, z]
    }
    return [x0, z0]
  }
  {
    const [x, z] = nearOK(-31, 25, { clear: 4, rho: 0.86 }, 6)
    const gy = terrainHeight(x, z)
    put('jungle', { p: v3(x, gy - 0.15, z), q: qY(2.2), s: sc(1), c: tint(0, 0) })
    addCollider(x, z, 1.1, gy + 20)
    heroes.jungle = v3(x, gy, z)
  }
  {
    // 林下一角：龜背芋、香蕉、火鶴、竹芋擠在一起
    const [x, z] = nearOK(-21, 11.5, { clear: 1.2, mtnPad: 2 }, 1)
    heroes.understory = v3(x, terrainHeight(x, z), z)
    // 鏡頭在左前方（-x、-z）：龜背芋在前、香蕉在後面撐高度
    const ring = [['monstera_b', 0, 0, 1.25], ['monstera_d', -0.9, 1.3, 1.05], ['anthurium_a', -1.5, -0.7, 1.5], ['calathea_a', 0.7, -1.3, 1.5],
      ['banana_b', 1.8, 1.4, 1.15], ['banana_a', 2.6, -0.3, 1], ['fern_b', -0.6, -1.9, 1.05], ['anthurium_b', -2.3, 0.8, 1.4], ['monstera_a', 1.2, 2.6, 1]]
    for (const [name, dx, dz, sc0] of ring) {
      const px = x + dx, pz = z + dz, rot = rnd() * TAU, col = tint()
      if (pathClearAt(px, pz) < 0.5) continue   // 2026-11-10 這一叢往外散到 2.6 公尺，有幾株（火鶴、龜背芋）長在步道上、還有碰撞擋住人：落在步道上的不種（亂數照抽，其他植物不變）
      put(name, { p: v3(px, terrainHeight(px, pz) - 0.04, pz), q: qY(rot), s: sc(sc0), c: col })
      addCollider(px, pz, 0.5, terrainHeight(px, pz) + 2)
    }
  }

  // 導覽鏡頭的視線上不種東西：沿著鏡頭→注視點取樣，每點一個淨空圓
  const stops = stopsFor ? stopsFor(heroes) : []
  const sight = []
  for (const st of stops) {
    for (let k = 0; k <= 1.001; k += 0.05) {
      const x = st.pos.x + (st.target.x - st.pos.x) * k, z = st.pos.z + (st.target.z - st.pos.z) * k
      const y = st.pos.y + (st.target.y - st.pos.y) * k
      sight.push({ x, z, y, k })
    }
  }
  // h：要種的東西多高；只有會擋到視線（比視線那一點高）的才要避開
  const clearOK = (x, z, r, h) => {
    for (const p of sight) {
      if (p.k > 0.85) continue
      if (h < p.y - terrainHeight(p.x, p.z) - 0.6 && p.k > 0.12) continue
      const rr = r + 0.6 + p.k * 2.2
      if ((x - p.x) ** 2 + (z - p.z) ** 2 < rr * rr) return false
    }
    return true
  }

  // 雨林大樹：數量少、撐起上層樹冠
  let tries = 0, n = 1
  while (n < 13 && tries++ < 4000) {
    const [x, z] = randInGarden(rnd)
    if (!groundOK(x, z, { clear: 4, rho: 0.86 }) || distToMtn(x, z) < 27 || !freeOfColliders(x, z, 7) || !clearOK(x, z, 8, 25)) continue
    const gy = terrainHeight(x, z)
    const s = Math.min(0.7 + rnd() * 0.45, (domeY(x, z) - gy - 2) / H('jungle'))
    if (s < 0.5) continue
    put('jungle', { p: v3(x, gy - 0.15, z), q: qY(rnd() * TAU), s: sc(s), c: tint() })
    addCollider(x, z, 1.1 * s, gy + 20 * s)
    n++
  }
  // 入口大道兩旁一排棕櫚
  {
    const entry = PATHS.find((p) => p.name === 'entry'), pts = entry.points
    let last = -99
    for (let k = 2; k < pts.length - 2; k++) {
      const d = pts[k].distanceTo(pts[0])
      if (d - last < 7) continue
      last = d
      const a = pts[k - 1], b = pts[k + 1], tx = b.x - a.x, tz = b.z - a.z, tl = Math.hypot(tx, tz) || 1
      for (const side of [-1, 1]) {
        const off = entry.w / 2 + 2.2
        const x = pts[k].x - tz / tl * off * side, z = pts[k].z + tx / tl * off * side
        if (!insideGarden(x, z, 0.93) || !freeOfColliders(x, z, 1) || !clearOK(x, z, 3.5, 14)) continue
        const name = pick(['coco_a', 'coco_f', 'coco_c', 'coco_e']), gy = terrainHeight(x, z)
        const s = Math.min(0.85 + rnd() * 0.25, (domeY(x, z) - gy - 1.5) / H(name))
        if (s < 0.5) continue
        put(name, { p: v3(x, gy - 0.1, z), q: qY(rnd() * TAU), s: sc(s), c: tint() })
        addCollider(x, z, 0.35, gy + H(name) * s)
      }
    }
  }
  // 棕櫚（高的椰子類＋矮的叢生棕櫚）
  const palmNames = ['coco_a', 'coco_b', 'coco_c', 'coco_d', 'coco_e', 'coco_f', 'palm_a', 'palm_b', 'palm_c', 'palm_b']
  tries = 0; n = 0
  while (n < 48 && tries++ < 5000) {
    const [x, z] = randInGarden(rnd)
    if (!groundOK(x, z, { clear: 2, rho: 0.9 }) || distToMtn(x, z) < 22 || !freeOfColliders(x, z, 2.4) || !clearOK(x, z, 4.5, 14)) continue
    const name = pick(palmNames), gy = terrainHeight(x, z)
    const s = Math.min(0.8 + rnd() * 0.4, (domeY(x, z) - gy - 1.5) / H(name))
    if (s < 0.55) continue
    put(name, { p: v3(x, gy - 0.1, z), q: qY(rnd() * TAU), s: sc(s), c: tint() })
    addCollider(x, z, 0.35, gy + H(name) * s)
    n++
  }
  // 中層小樹（馬拉巴栗）與香蕉
  tries = 0; n = 0
  while (n < 90 && tries++ < 6000) {
    const [x, z] = randInGarden(rnd)
    if (!groundOK(x, z, { clear: 1.6, mtnPad: 2 }) || !freeOfColliders(x, z, 1.6) || !clearOK(x, z, 1.5, 4)) continue
    const name = pick(['pachira_c', 'pachira_d', 'banana_a', 'banana_b', 'banana_a'])
    const s = name.startsWith('pachira') ? 1 + rnd() * 0.5 : 0.8 + rnd() * 0.45
    put(name, { p: v3(x, terrainHeight(x, z) - 0.05, z), q: qY(rnd() * TAU), s: sc(s), c: tint() })
    addCollider(x, z, 0.3, terrainHeight(x, z) + H(name) * s)
    n++
  }
  // 大葉植物：龜背芋
  tries = 0; n = 0
  while (n < 170 && tries++ < 6000) {
    const [x, z] = randInGarden(rnd)
    if (!groundOK(x, z, { clear: 1.1, mtnPad: 1.4 }) || !freeOfColliders(x, z, 0.6) || !clearOK(x, z, 1.1, 2)) continue
    put(pick(['monstera_a', 'monstera_b', 'monstera_c', 'monstera_d']), { p: v3(x, terrainHeight(x, z) - 0.05, z), q: qY(rnd() * TAU), s: sc(0.75 + rnd() * 0.6), c: tint() })
    n++
  }
  // 步道邊的低矮觀葉植物（火鶴、竹芋），貼著路緣種
  for (const p of PATHS) {
    for (let k = 0; k < p.points.length; k += 2) {
      if (rnd() < 0.35) continue
      const a = p.points[Math.max(0, k - 1)], b = p.points[Math.min(p.points.length - 1, k + 1)]
      const tx = b.x - a.x, tz = b.z - a.z, tl = Math.hypot(tx, tz) || 1
      const side = rnd() < 0.5 ? -1 : 1, off = p.w / 2 + 0.45 + rnd() * 1.6
      const x = p.points[k].x - tz / tl * off * side, z = p.points[k].z + tx / tl * off * side
      if (!groundOK(x, z, { clear: 0.35, mtnPad: 1, pool: 1.15 }) || !freeOfColliders(x, z, 0.3)) continue
      const name = pick(['anthurium_a', 'anthurium_b', 'anthurium_c', 'calathea_a', 'calathea_b', 'calathea_c', 'fern2_b', 'fern2_c'])
      put(name, { p: v3(x, terrainHeight(x, z) - 0.03, z), q: qY(rnd() * TAU), s: sc(0.9 + rnd() * 0.5), c: tint() })
    }
  }
  // 地被蕨類
  tries = 0; n = 0
  while (n < 650 && tries++ < 9000) {
    const [x, z] = randInGarden(rnd)
    if (!groundOK(x, z, { clear: 0.5, mtnPad: 0.8, pool: 1.15 })) continue
    put(pick(['fern_sa', 'fern_sb', 'fern2_b', 'fern2_c', 'fern_b', 'fern_c']), { p: v3(x, terrainHeight(x, z) - 0.04, z), q: qY(rnd() * TAU), s: sc(0.7 + rnd() * 0.6), c: tint() })
    n++
  }
  // 山壁上的植物：方向往外偏
  const onMountain = (y0, y1) => {
    const th = rnd() * TAU, y = lerp(y0, y1, rnd())
    const gorge = Math.abs(((th % TAU) + TAU) % TAU - Math.PI)   // 離瀑布峽谷多遠
    if (gorge < 0.25) return null
    const r = mtnR(th, y)
    const out = v3(Math.cos(th), 0, Math.sin(th))
    const slope = (mtnR(th, y - 1) - mtnR(th, y + 1)) * 0.5
    const n = out.clone().multiplyScalar(1).add(v3(0, clamp(slope, 0, 2) + 0.4, 0)).normalize()
    return { th, y, r, n, p: v3(MTN.x + (r - 0.15) * Math.cos(th), y, MTN.z + (r - 0.15) * Math.sin(th)) }
  }
  const alignTo = (n, spin) => new THREE.Quaternion().setFromUnitVectors(UP, n.clone().lerp(UP, 0.35).normalize()).multiply(qY(spin))
  for (let k = 0; k < 1900; k++) {
    const m = onMountain(-0.5, MTN.h)
    if (!m) continue
    put(pick(['fern_sa', 'fern_sb', 'fern2_b', 'fern2_c', 'fern_a', 'fern_b']), { p: m.p, q: alignTo(m.n, rnd() * TAU), s: sc(0.8 + rnd() * 0.8), c: tint() })
  }
  for (let k = 0; k < 520; k++) {
    const m = onMountain(1, MTN.h)
    if (!m) continue
    put('brom', { p: m.p, q: alignTo(m.n, rnd() * TAU), s: sc(0.9 + rnd() * 0.9), c: new THREE.Color().setHSL(rnd(), 0.1, 0.95) })
  }
  for (let k = 0; k < 420; k++) {
    const m = onMountain(0, MTN.h - 2)
    if (!m) continue
    put(pick(['anthurium_a', 'anthurium_b', 'calathea_a', 'monstera_a', 'anthurium_c']), { p: m.p, q: alignTo(m.n, rnd() * TAU), s: sc(m.y > 3 ? 0.9 + rnd() * 0.5 : 1 + rnd() * 0.6), c: tint() })
  }
  // 山壁岩塊：大半埋進山體，只露出長苔的那一面，打散車床曲面的平滑感；不能凸出到空中步道
  const rockNames = ['mrock_1', 'mrock_2', 'mrock_4', 'mrock_5', 'mrock_6', 'mrock_11', 'mrock_13']
  for (let k = 0, placed = 0; k < 2000 && placed < 150; k++) {
    const th = rnd() * TAU, y = -1 + rnd() * (MTN.h - 1)
    if (Math.abs(((th % TAU) + TAU) % TAU - Math.PI) < 0.3) continue
    const r = mtnR(th, y)
    const room = y < RAMP.y1 + 3 ? rampInner(y) - r - 0.4 : 1.5
    if (room < 0.15) continue
    const s = 1.1 + rnd() * 0.9
    const show = Math.min(room, 0.35 * s)          // 露出山壁外多少
    const out = v3(Math.cos(th), 0, Math.sin(th))
    // 岩塊的「上面」（長苔那面）朝外上方
    const q = new THREE.Quaternion().setFromUnitVectors(UP, out.clone().add(v3(0, 1.2, 0)).normalize()).multiply(qY(rnd() * TAU))
    const d = r + show - 0.7 * s
    // 用模型真正的大小檢查：岩塊最外面要離步道內緣 25 公分以上（只在它的高度範圍內有步道經過時）
    const nm = pick(rockNames), ext = rockExt(nm) * s
    const lv = rampHeights(MTN.x + (rampInner(y) + 0.5) * out.x, MTN.z + (rampInner(y) + 0.5) * out.z)
    if (lv.some((h) => y - ext < h + 2.4 && y + ext > h - 0.5) && d + ext > rampInner(y) - 0.25) continue
    if (typeof window !== 'undefined') (window.__mtnRocks ||= []).push({ x: MTN.x + d * out.x, y, z: MTN.z + d * out.z, ext, th, d })   // 除錯：檢查有沒有凸到步道
    put(nm, { p: v3(MTN.x + d * out.x, y, MTN.z + d * out.z), q, s: sc(s), c: new THREE.Color().setHSL(0.22, 0.12, 0.85 + rnd() * 0.1) })
    placed++
  }
  // 地上散石與池邊石
  tries = 0; n = 0
  while (n < 70 && tries++ < 3000) {
    const [x, z] = randInGarden(rnd)
    const name = pick(['mrock_3', 'mrock_7', 'mrock_8', 'mrock_9', 'mrock_10', 'mrock_12', 'boulder'])
    const s = 0.5 + rnd() ** 2 * 1.1
    // 2026-11-10 使用者：石頭壓在石板路上 → 離步道的距離要算進石頭本身的大小（以前一律 0.8，大顆的半徑就超過了）
    if (!groundOK(x, z, { clear: 0.9 + s * 1.1 })) continue
    put(name, { p: v3(x, terrainHeight(x, z) - 0.12 * s, z), q: qY(rnd() * TAU), s: sc(s) })
    if (s > 0.8) addCollider(x, z, s, terrainHeight(x, z) + s * 0.6)
    n++
  }
  for (let i = 0; i < 64; i++) {
    const a = (i / 64) * TAU + rnd() * 0.06, k = 1.06 + rnd() * 0.12
    const x = POOL.x + POOL.rx * k * Math.cos(a), z = POOL.z + POOL.rz * k * Math.sin(a)
    if (distToMtn(x, z) < mtnR(Math.atan2(z - MTN.z, x - MTN.x), 0) + 0.3 || pathClearAt(x, z) < 0.6) continue
    const name = pick(['mrock_7', 'mrock_8', 'mrock_9', 'mrock_10', 'mrock_12', 'mrock_13'])
    put(name, { p: v3(x, terrainHeight(x, z) - 0.25, z), q: qY(-a + (rnd() - 0.5)), s: sc(0.7 + rnd() * 0.5) })
  }

  // 步道／觀景台的走道空間：山壁上的植物、岩塊用模型真正的頂點檢查，有任何一點伸進走道（或穿過玻璃欄杆）就不放。
  // 以前只檢查岩塊、而且用估計大小；蕨類、鳳梨、龜背芋完全沒檢查，葉子會伸到步道上
  const walkHit = (x, y, z) => {
    const dx = x - MTN.x, dz = z - MTN.z, r = Math.hypot(dx, dz)
    let base = (Math.atan2(dz, dx) - RAMP.theta0) % TAU
    if (base < 0) base += TAU
    for (let k = 0; k <= Math.ceil(RAMP.turns); k++) {
      const s = (base + k * TAU) / (RAMP.turns * TAU)
      if (s > 1) break
      const p = rampSample(s)
      if (r > p.ri - 0.12 && r < p.ro + 0.12 && y > p.y - 0.5 && y < p.y + 2.5) return true
    }
    return Math.hypot(x - DECK.x, z - DECK.z) < DECK.r + 0.12 && y > DECK.y - 0.5 && y < DECK.y + 2.5
  }
  const ptsCache = {}
  const modelPts = (name) => ptsCache[name] ??= (() => {
    const out = []
    for (const { geo } of parts(lib[name])) {
      const a = geo.attributes.position, step = Math.max(1, Math.floor(a.count / 1500))
      for (let i = 0; i < a.count; i += step) out.push(v3().fromBufferAttribute(a, i))
    }
    const R = out.reduce((m, p) => Math.max(m, p.length()), 0)
    return { out, R }
  })()
  const _mm = new THREE.Matrix4(), _pp = v3()
  const removed = {}
  for (const [name, list] of Object.entries(lists)) {
    if (!lib[name]) continue
    const keep = list.filter((it) => {
      const { out, R } = modelPts(name), ext = R * Math.max(it.s.x, it.s.y, it.s.z)
      const rc = Math.hypot(it.p.x - MTN.x, it.p.z - MTN.z)
      // 粗篩：離山太遠、或高度不在步道範圍
      if (rc - ext > 40 || it.p.y + ext < RAMP.y0 - 0.5 || it.p.y - ext > DECK.y + 2.5) return true
      _mm.compose(it.p, it.q, it.s)
      for (const q of out) { _pp.copy(q).applyMatrix4(_mm); if (walkHit(_pp.x, _pp.y, _pp.z)) return false }
      return true
    })
    if (keep.length !== list.length) { removed[name] = list.length - keep.length; lists[name] = keep }
  }
  if (typeof window !== 'undefined') window.__walkRemoved = removed

  // 風：樹梢擺幅（公尺）
  const windOf = (name) => name === 'jungle' ? 0.25 : name.startsWith('coco') || name.startsWith('palm') ? 0.35
    : name.startsWith('mrock') || name.startsWith('rock') || name === 'boulder' ? 0 : name.startsWith('fern') ? 0.06 : 0.1
  const counts = {}
  for (const [name, list] of Object.entries(lists)) {
    if (!lib[name]) { console.warn('缺模型', name); continue }
    const small = /^(fern|anthurium|calathea|brom)/.test(name)
    scatter(scene, lib[name], list, { wind: windOf(name), cast: !small })
    counts[name] = list.length
  }

  /* --- 花：四種常見的花（花瓣、花心、莖、基部葉片），花瓣顏色每朵不一樣 --- */
  // 雛菊（白、細瓣多、黃心）、波斯菊（粉紫、8 片寬瓣）、長春花（5 片圓瓣、白眼）、金光菊（黃橘、垂瓣、深棕心）
  const SPECIES = [
    { n: 16, len: 0.5, wid: 0.09, cup: 0.18, tilt: 0.06, shape: 0, center: 0xf0c02c, cr: 0.11, cols: [0xffffff, 0xfbf6ee, 0xf6f0f4] },
    { n: 8, len: 0.5, wid: 0.27, cup: 0.22, tilt: 0.08, shape: 1, center: 0xe8b02a, cr: 0.08, cols: [0xe9629c, 0xf3a2c6, 0xb867d6, 0xf7d4e4] },
    { n: 5, len: 0.42, wid: 0.34, cup: 0.12, tilt: 0.0, shape: 1, center: 0xf7eef4, cr: 0.06, cols: [0xd9659c, 0x8f86e6, 0xf27a7a, 0xffffff] },
    { n: 13, len: 0.48, wid: 0.13, cup: -0.12, tilt: -0.08, shape: 0, center: 0x4a2a14, cr: 0.16, cols: [0xf4b81c, 0xf08a28, 0xf7c94a] },
  ]
  const fl = SPECIES.map(() => ({ heads: [], centers: [] })), stems = [], leaves = []
  const addFlower = (x, y, z, sp, h, size, col) => {
    const S = SPECIES[sp]
    // 莖微微斜，花頭朝上偏一點（向光）
    const lean = (rnd() - 0.5) * 0.25, la = rnd() * TAU
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(lean * Math.cos(la), 0, lean * Math.sin(la)))
    stems.push({ p: v3(x, y, z), q, s: v3(1, h, 1) })
    const top = v3(0, h, 0).applyQuaternion(q).add(v3(x, y, z))
    const hq = new THREE.Quaternion().setFromEuler(new THREE.Euler((rnd() - 0.5) * 0.5, rnd() * TAU, (rnd() - 0.5) * 0.5))
    const c = new THREE.Color(col ?? S.cols[Math.floor(rnd() * S.cols.length)]).multiplyScalar(0.92 + rnd() * 0.12)
    fl[sp].heads.push({ p: top, q: hq, s: sc(size), c })
    fl[sp].centers.push({ p: top, q: hq, s: sc(size), c: new THREE.Color(S.center) })
    // 基部 2～3 片葉
    for (let j = 0, nL = 2 + Math.floor(rnd() * 2); j < nL; j++) leaves.push({ p: v3(x, y, z), q: qY(rnd() * TAU), s: sc(0.09 + rnd() * 0.08), c: new THREE.Color().setHSL(0.26 + (rnd() - 0.5) * 0.04, 0.45, 0.32 + rnd() * 0.08) })
  }
  // 花圃：沿步道邊成片（一圃一種花）
  const beds = []
  tries = 0
  while (beds.length < 26 && tries++ < 3000) {
    const p = PATHS[Math.floor(rnd() * PATHS.length)]
    const pt = p.points[Math.floor(rnd() * p.points.length)]
    const a = rnd() * TAU, off = p.w / 2 + 2.2 + rnd() * 1.5
    const x = pt.x + Math.cos(a) * off, z = pt.z + Math.sin(a) * off
    if (!groundOK(x, z, { clear: 1.2, mtnPad: 2 }) || !freeOfColliders(x, z, 1.5)) continue
    if (beds.some((b) => Math.hypot(b.x - x, b.z - z) < 8)) continue
    beds.push({ x, z })
  }
  for (const b of beds) {
    const sp = Math.floor(rnd() * SPECIES.length), col = SPECIES[sp].cols[Math.floor(rnd() * SPECIES[sp].cols.length)]
    const R = 1.6 + rnd() * 1.6
    for (let k = 0; k < 160; k++) {
      const a = rnd() * TAU, rr = Math.sqrt(rnd()) * R
      const x = b.x + Math.cos(a) * rr * 1.4, z = b.z + Math.sin(a) * rr
      if (pathClearAt(x, z) < 0.3) continue
      addFlower(x, terrainHeight(x, z), z, sp, 0.22 + rnd() * 0.35, 0.08 + rnd() * 0.04, rnd() < 0.85 ? col : null)
    }
  }
  // 零星野花（一區一種，像真的野地）
  for (let k = 0; k < 1600; k++) {
    const [x, z] = randInGarden(rnd)
    if (!groundOK(x, z, { clear: 0.4, mtnPad: 0.8, pool: 1.15 })) continue
    const sp = Math.floor(Math.abs(fbm2(x * 0.05, z * 0.05)) * 40) % SPECIES.length
    addFlower(x, terrainHeight(x, z), z, sp, 0.12 + rnd() * 0.3, 0.06 + rnd() * 0.035)
  }
  // 鳥站旁邊的野花（birdinfo 的 flowers：[[種類, 朵數], …]）：撒在鏡頭看得到的那片草坪（鏡頭前 0.8～7 公尺、
  // 越遠撒越寬），一小叢一小叢；鳥腳邊 0.5 公尺內不種
  for (const st of stops) {
    const d = st.bird?.def
    if (!d?.flowers) continue
    const f = v3(st.target.x - st.pos.x, 0, st.target.z - st.pos.z).normalize(), side = v3(-f.z, 0, f.x)
    for (const [sp, count] of d.flowers) {
      for (let k = 0, made = 0; k < count * 6 && made < count; k++) {
        const fwd = 0.8 + Math.pow(rnd(), 1.3) * 5.2, lat = (rnd() - 0.5) * (0.6 + fwd * 1.1)
        const x = st.pos.x + f.x * fwd + side.x * lat, z = st.pos.z + f.z * fwd + side.z * lat
        if (Math.hypot(x - d.spot[0], z - d.spot[1]) < 0.5) continue
        if (pathClearAt(x, z) < 0.15 || !insideGarden(x, z, 0.97)) continue
        // 一叢 1～4 朵
        for (let j = 0, n = 1 + Math.floor(rnd() * 4); j < n && made < count; j++, made++) {
          const xx = x + (rnd() - 0.5) * 0.25, zz = z + (rnd() - 0.5) * 0.25
          addFlower(xx, terrainHeight(xx, zz), zz, sp, 0.1 + rnd() * 0.16, 0.075 + rnd() * 0.04)
        }
      }
    }
  }
  // 山壁蘭花（只有花頭）：用寬瓣那種
  const orchids = [0xd65bc8, 0xf2f0f5, 0xb74fe0, 0xf5a0c8, 0xfff07a]
  for (let k = 0; k < 520; k++) {
    const m = onMountain(1, MTN.h)
    if (!m) continue
    const p = m.p.clone().addScaledVector(m.n, 0.35), q = alignTo(m.n, rnd() * TAU), s = sc(0.14 + rnd() * 0.08)
    fl[1].heads.push({ p, q, s, c: new THREE.Color(orchids[k % orchids.length]) })
    fl[1].centers.push({ p, q, s, c: new THREE.Color(0xf2e070) })
  }
  scene.add(makeInst(new THREE.CylinderGeometry(0.004, 0.006, 1, 5).translate(0, 0.5, 0), mats.stem, stems, { cast: false, lod: 0.5 }))
  const leafMat = new THREE.MeshStandardMaterial({ map: T.leafBladeTex(), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.75 })
  scene.add(makeInst(leafBlade(), leafMat, leaves, { colors: true, cast: false, lod: 0.5 }))
  const centerGeo = (r) => new THREE.SphereGeometry(r, 12, 6).scale(1, 0.45, 1).translate(0, 0.04, 0)
  SPECIES.forEach((S, i) => {
    const mat = new THREE.MeshStandardMaterial({ map: T.petalTex(S.shape), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.55 })
    scene.add(makeInst(petalHead(S.n, S.len, S.wid, S.cup, S.tilt, 7 + i), mat, fl[i].heads, { colors: true, cast: false, lod: 0.5 }))
    scene.add(makeInst(centerGeo(S.cr), new THREE.MeshStandardMaterial({ roughness: 0.85 }), fl[i].centers, { colors: true, cast: false, lod: 0.5 }))
  })

  /* --- 草：一片一片的草葉，成叢長 --- */
  {
    const A = [], B = []
    const base = new THREE.Color(), c = new THREE.Color()
    tries = 0
    let clumps = 0
    const GB_R0 = 3.5
    const groundBirds = stops.map((st) => st.bird?.def).filter((d) => d?.perch === 'ground' && d.water == null && !d.swim).map((d) => d.spot)
    window.__groundBirds = groundBirds
    // 一半撒全園，一半集中在步道兩旁 5 公尺內（鏡頭最常看的地方）
    while (clumps < 80000 && tries++ < 500000) {
      let x, z
      if (clumps % 2) [x, z] = randInGarden(rnd)
      else {
        const p = PATHS[Math.floor(rnd() * PATHS.length)], pt = p.points[Math.floor(rnd() * p.points.length)]
        const a = rnd() * TAU, d = p.w / 2 + rnd() * 5
        x = pt.x + Math.cos(a) * d; z = pt.z + Math.sin(a) * d
      }
      if (!groundOK(x, z, { clear: 0.12, mtnPad: 0.4, pool: 1.1, rho: 0.96 })) continue
      // 鏡頭腳下不長草（近距離的草葉會大到擋住畫面）
      if (stops.some((st) => (st.pos.x - x) ** 2 + (st.pos.z - z) ** 2 < 9)) continue
      // 地上走的鳥（斑鳩、麻雀…）四周不長高草：鳥只有 20～40 公分高，從步道拉長焦拍，中間隔一叢 50 公分的草就整隻擋住（2026-11-08）。
      // 走動範圍＋3.5 公尺內不長，再往外 3 公尺慢慢從矮草長回原本高度
      const gb = groundBirds.reduce((m, b) => Math.min(m, Math.hypot(x - b[0], z - b[1])), 99)
      if (gb < GB_R0) continue
      const gk = Math.min(1, 0.25 + 0.75 * (gb - GB_R0) / 3)
      // 大片的疏密：有的地方是草坪，有的只稀稀落落
      const dens = fbm2(x * 0.06 + 3, z * 0.06)
      if (rnd() > 0.45 + dens * 1.4) continue
      const gy = terrainHeight(x, z) - 0.01
      base.setHSL(0.24 + dens * 0.05 + (rnd() - 0.5) * 0.03, 0.5, 0.33 + rnd() * 0.08)
      const m = 4 + Math.floor(rnd() * 6), a0 = rnd() * TAU, tall = (0.22 + rnd() * 0.35 + Math.max(0, dens) * 0.3) * gk
      for (let j = 0; j < m; j++) {
        const a = a0 + (j / m) * TAU + (rnd() - 0.5) * 0.7, d = rnd() * 0.06
        c.copy(base)
        if (rnd() < 0.06) c.lerp(new THREE.Color(0.55, 0.5, 0.28), 0.5)
        A.push(x + Math.cos(a) * d, gy, z + Math.sin(a) * d, a)
        B.push(c.r, c.g, c.b, tall * (0.6 + rnd() * 0.6))
      }
      clumps++
    }
    // 切成 14 公尺一塊（lod.js：視野外整塊不畫、越遠越稀）；塊裡的草葉先打亂，instanceCount 變少時是均勻變稀，不是少掉一角
    const CELL = 14, cells = new Map()
    for (let i = 0; i < A.length / 4; i++) {
      const key = Math.floor(A[i * 4] / CELL) + ',' + Math.floor(A[i * 4 + 2] / CELL)
      let c = cells.get(key); if (!c) cells.set(key, c = [])
      c.push(i)
    }
    for (const [key, idx] of cells) {
      for (let i = idx.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]] }
      const a = [], b = []
      for (const i of idx) { a.push(A[i * 4], A[i * 4 + 1], A[i * 4 + 2], A[i * 4 + 3]); b.push(B[i * 4], B[i * 4 + 1], B[i * 4 + 2], B[i * 4 + 3]) }
      const [cx, cz] = key.split(',').map((v) => (+v + 0.5) * CELL)
      const grass = bladeMesh(a, b, { width: [0.014, 0.016] })
      grass.frustumCulled = false
      scene.add(grass)
      lodRegisterGrass(grass, new THREE.Vector3(cx, terrainHeight(cx, cz) + 0.4, cz), CELL * 0.72 + 1)
    }
  }

  /* --- 草坪：鳥站附近（鏡頭看得到的地方）一大片又短又密的草，鳥腳會陷進草裡一點；一站一塊，畫面外的整塊不畫 --- */
  {
    const sun = new THREE.Vector3()
    scene.traverse((o) => { if (o.isDirectionalLight) sun.copy(o.position).normalize() })
    for (const st of stops) {
      const d = st.bird?.def
      // 2026-11-10 山區湖前草地的鳥（d.lawn：環頸雉、小雲雀、棕扇尾鶯）也鋪一塊：地面用山區高度，草長一點（草原，不是草坪）
      const alp = !!d?.lawn && inAlpine(...d.spot)
      if (!d || (d.perch !== 'ground' && !alp) || d.water != null) continue
      const cx = d.spot[0], cz = d.spot[1], R = alp ? 8 : 6.5
      const hAt = alp ? alpineHeight : terrainHeight
      const A = [], B = [], base = new THREE.Color(), c = new THREE.Color()
      for (let k = 0; k < 150000 && A.length / 4 < 70000; k++) {
        const r = R * Math.sqrt(rnd()), a = rnd() * TAU
        const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r
        if (rnd() > 1.15 - r / R) continue                                   // 中間密、外圍漸漸稀
        if (alp ? (!inAlpine(x, z) || Math.hypot(x - ALP_POND.x, z - ALP_POND.z) < ALP_POND.r + 1) : (pathClearAt(x, z) < 0.05 || poolQ(x, z) < 1.15 || !insideGarden(x, z, 0.97))) continue
        const n = fbm2(x * 0.9, z * 0.9)
        base.setHSL(0.24 + n * 0.04 + (rnd() - 0.5) * 0.03, 0.5 + n * 0.1, (alp ? 0.31 : 0.24) + rnd() * 0.06)
        c.copy(base)
        if (rnd() < 0.04) c.lerp(new THREE.Color(0.5, 0.46, 0.28), 0.4)   // 零星枯黃
        if (alp && rnd() < 0.18) c.lerp(new THREE.Color(0.55, 0.5, 0.3), 0.5)   // 草原多一點枯黃
        A.push(x, hAt(x, z) - 0.005, z, rnd() * TAU)
        B.push(c.r, c.g, c.b, alp ? 0.04 + rnd() * 0.06 + Math.max(0, n) * 0.04 : 0.03 + rnd() * 0.04 + Math.max(0, n) * 0.03)   // 3～10 公分：鳥腳陷進去一點，身體不會被蓋住
      }
      const m = bladeMesh(A, B, { width: [0.004, 0.004], sun, lawn: true })
      m.geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(cx, hAt(cx, cz), cz), R + 0.5)
      m.frustumCulled = false
      scene.add(m)
      lodRegisterGrass(m, m.geometry.boundingSphere.center, R + 0.5)   // 草坪本來就是隨機順序，變稀也是均勻的
    }
  }

  /* --- 垂藤：步道外緣＋山壁凸出處 --- */
  {
    const geo = new THREE.PlaneGeometry(0.6, 1).translate(0, -0.5, 0)
    const list = []
    for (let k = 0; k < 420; k++) {
      const s = 0.03 + rnd() * 0.97, p = rampSample(s)
      if (frontOfFall(p.th)) continue                 // 瀑布前面不垂藤，不然會擋住水柱
      const r = p.ro + 0.05
      const L = 2 + rnd() * 5
      list.push({ p: v3(MTN.x + r * Math.cos(p.th), p.y - 0.3, MTN.z + r * Math.sin(p.th)), q: qY(Math.PI / 2 - p.th), s: v3(1, Math.min(L, p.y - RAMP.y0 + 0.5), 1) })
    }
    for (let k = 0; k < 1500 && list.length < 700; k++) {
      const th = rnd() * TAU, y = 4 + rnd() * (MTN.h - 5)
      if (frontOfFall(th)) continue
      const r0 = mtnR(th, y)
      let L = 0
      while (L < 9 && mtnR(th, y - L - 0.5) < r0 - 0.25) L += 0.5
      if (L < 2) continue
      list.push({ p: v3(MTN.x + (r0 - 0.1) * Math.cos(th), y, MTN.z + (r0 - 0.1) * Math.sin(th)), q: qY(Math.PI / 2 - th), s: v3(1.2, L, 1) })
    }
    // 垂藤不能垂進下一圈步道的走道（步道加寬後，上一圈外緣剛好在下一圈走道正上方）：往下量，碰到走道空間就截短
    const side = v3()
    for (let i = list.length - 1; i >= 0; i--) {
      const it = list[i], top = it.p.y
      side.set(1, 0, 0).applyQuaternion(it.q).multiplyScalar(0.3 * it.s.x)
      let L = 0.3
      while (L < it.s.y && ![-1, 0, 1].some((k) => walkHit(it.p.x + side.x * k, top - L, it.p.z + side.z * k))) L += 0.1
      L = Math.min(it.s.y, L - 0.15)
      if (L < 1) list.splice(i, 1)
      else it.s.y = L
    }
    scene.add(makeInst(geo, mats.vine, list, { receive: true }))
  }

  // 路燈燈頭、長椅的位置（遊戲的日夜：燈光、坐下休息）
  return { mats, counts, heroes, stops, lamps: lamps.map((l) => l.p.clone().setY(l.p.y + 3.15)), benches: benches.map((b) => ({ p: b.p.clone(), q: b.q.clone() })) }
}
