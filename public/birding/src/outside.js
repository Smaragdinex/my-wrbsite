// 公園外面（2026-11-08 拿掉溫室後）：原本圓頂的範圍（domeRho = 1）就是公園的邊界，玩家一樣走到那裡被擋（player.js）。
// 這裡蓋邊界外看得到的東西：
//   圍籬：沿著邊界內側一圈木頭圍籬，跟著地形高低（相機行門口留開口）
//   草地：貼著邊界的地面高度接出去，往外慢慢起伏成小丘
//   樹林帶：邊界外 30～290 公尺。近的用園區裡同一套樹（闊葉樹＝停棲樹的樹冠＋葉片卡、針葉樹＝高山區的冷杉／鐵杉），
//          遠的換低面數版本（lod.js），視野外不畫
//   遠山：三層山脊（640、760、880 公尺），自己算空氣透視（不吃場景的霧），顏色跟著日夜
import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { TAU, domeRho, inAlpine, alpineHeight, terrainHeight, smoothstep, lerp } from './layout.js'
import { fbm3, mulberry32 } from './noise.js'
import { dayLight, duskLight, weatherU } from './structures.js'
import { canopyGeometry, canopyBump, leafify, barkify, leafCardGeometry, leafCardMaterial } from './fju-foliage.js'
import { coniferGeo, needleMaterial } from './alpine.js'
import { lodRegister } from './lod.js'
import * as T from './textures.js'

const groundH = (x, z) => inAlpine(x, z) ? alpineHeight(x, z) : terrainHeight(x, z)
const UP = new THREE.Vector3(0, 1, 0)
const ENTRY_W = 4.3   // 相機行門口（入口石材地板寬 ±4）圍籬留的開口

// 方位 a 往外走到 domeRho = rho 的那一點
function edgePoint(a, rho = 1) {
  const dx = Math.cos(a), dz = Math.sin(a)
  let lo = 0, hi = 400
  for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; if (domeRho(dx * m, dz * m) < rho) lo = m; else hi = m }
  return [dx * lo, dz * lo, lo]
}

export function buildOutside() {
  const g = new THREE.Group()
  g.name = 'ground'   // halls.js：永遠畫

  /* ---------- 草地 ---------- */
  const NA = 720, RINGS = [0, 2, 5, 10, 18, 30, 45, 65, 90, 120, 160, 210, 270, 340, 420, 520, 640]
  const edge = [], hE = []
  for (let i = 0; i < NA; i++) {
    const a = (i / NA) * TAU, e = edgePoint(a)
    let h = groundH(e[0] * 0.995, e[1] * 0.995)   // 邊界內側一點的地面高度（山區格子外面會回傳很大的數，那種當 0）
    if (!(Math.abs(h) < 100)) h = 0
    edge.push(e); hE.push(h)
  }
  const hills = (x, z, d) => {
    const n = fbm3(x * 0.006, 0, z * 0.006, 4), n2 = fbm3(x * 0.02 + 5, 0, z * 0.02, 3)
    return smoothstep(15, 220, d) * (4 + 18 * Math.max(0, n + 0.25) + 3 * n2) + smoothstep(3, 25, d) * 0.6 * n2
  }
  const outY = (i, t, x, z, d) => lerp(lerp(hE[i], hE[(i + 1) % NA], t), 0, smoothstep(0, 40, d)) + hills(x, z, d)
  {
    const pos = [], col = [], uv = [], idx = [], c = new THREE.Color(), NR = RINGS.length
    for (let i = 0; i < NA; i++) {
      const [ex, ez, r0] = edge[i], ux = ex / r0, uz = ez / r0
      for (let k = 0; k < NR; k++) {
        const d = RINGS[k], x = ex + ux * d, z = ez + uz * d
        pos.push(x, outY(i, 0, x, z, d) - (k === 0 ? 0.02 : 0), z); uv.push(x / 5, z / 5)
        const n = fbm3(x * 0.03, 0, z * 0.03, 3)
        c.setRGB(0.42 + n * 0.12, 0.52 + n * 0.12, 0.3 + n * 0.08)
        col.push(c.r, c.g, c.b)
      }
    }
    for (let i = 0; i < NA; i++) {
      const j = (i + 1) % NA
      for (let k = 0; k < NR - 1; k++) { const a = i * NR + k, b = j * NR + k; idx.push(a, b, a + 1, b, b + 1, a + 1) }
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
    geo.setIndex(idx); geo.computeVertexNormals()
    const ground = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: T.grassGroundTex(), vertexColors: true, roughness: 1 }))
    ground.receiveShadow = true; ground.userData.terrain = true
    g.add(ground)
  }

  /* ---------- 圍籬：邊界內側（玩家在 0.955 被擋），每 2.4 公尺一根柱子、兩條橫木，跟著地形 ---------- */
  {
    const wood = barkify(new THREE.MeshStandardMaterial({ color: 0x7a5c42, roughness: 0.9 }))
    const parts = []
    const N = 1600, pts = []
    for (let i = 0; i <= N; i++) { const e = edgePoint((i / N) * TAU, 0.963); pts.push(e) }
    // 照弧長每 2.4 公尺放一根
    const posts = []
    let acc = 0
    for (let i = 0; i < N; i++) {
      const [x0, z0] = pts[i], [x1, z1] = pts[i + 1], L = Math.hypot(x1 - x0, z1 - z0)
      while (acc <= L) { const t = acc / L; posts.push([lerp(x0, x1, t), lerp(z0, z1, t)]); acc += 2.4 }
      acc -= L
    }
    const gap = (x, z) => x < 0 && Math.abs(z) < ENTRY_W
    const post = new THREE.BoxGeometry(0.12, 1.25, 0.12).translate(0, 0.5, 0)
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion()
    const yAt = (x, z) => { const h = groundH(x, z); return Math.abs(h) < 100 ? h : 0 }
    for (let k = 0; k < posts.length; k++) {
      const [x, z] = posts[k], [x2, z2] = posts[(k + 1) % posts.length]
      if (gap(x, z)) continue
      const y = yAt(x, z), y2 = yAt(x2, z2)
      parts.push(post.clone().applyMatrix4(m4.makeTranslation(x, y, z)))
      if (gap(x2, z2)) continue
      // 兩條橫木（0.45、0.95 公尺高）
      const a = new THREE.Vector3(x, y, z), b = new THREE.Vector3(x2, y2, z2), L = a.distanceTo(b)
      q.setFromUnitVectors(new THREE.Vector3(1, 0, 0), b.clone().sub(a).normalize())
      for (const hy of [0.45, 0.95]) {
        const rail = new THREE.BoxGeometry(L, 0.09, 0.05)
        m4.compose(a.clone().add(b).multiplyScalar(0.5).add(new THREE.Vector3(0, hy, 0)), q, new THREE.Vector3(1, 1, 1))
        parts.push(rail.applyMatrix4(m4))
      }
    }
    const fence = new THREE.Mesh(mergeGeometries(parts), wood)
    fence.castShadow = true; fence.receiveShadow = true
    g.add(fence)
  }

  /* ---------- 樹林帶 ---------- */
  {
    const rnd = mulberry32(91)
    const place = (a, d) => {
      const f = (a / TAU) * NA, i = Math.floor(f) % NA, t = f - Math.floor(f), e = edge[i]
      const x = e[0] + Math.cos(a) * d, z = e[1] + Math.sin(a) * d
      return [x, z, outY(i, t, x, z, d)]
    }
    const broadL = [], conL = []
    for (let tries = 0; tries < 60000 && broadL.length + conL.length < 3600; tries++) {
      const a = rnd() * TAU, d = 30 + Math.pow(rnd(), 0.9) * 260
      const [x, z, y] = place(a, d)
      if (x < -70 && Math.abs(z) < 30 && d < 60) continue   // 相機行門口那一片空著
      if (rnd() > 0.2 + 0.8 * smoothstep(30, 130, d)) continue   // 近的稀稀落落、看得到草地，越遠越密
      // 山區那側（東邊）多針葉樹，花園那側多闊葉樹
      const con = rnd() < 0.1 + 0.8 * smoothstep(-20, 140, x)
      const H = (con ? 11 : 8) + rnd() * 7
      const it = { p: new THREE.Vector3(x, y - 0.2, z), q: new THREE.Quaternion().setFromAxisAngle(UP, rnd() * TAU), H, w: 0.85 + rnd() * 0.35, c: rnd() }
      ;(con ? conL : broadL).push(it)
    }
    const fill = (geo, mat, list, sc, color) => {
      const m = new THREE.InstancedMesh(geo, mat, list.length), mm = new THREE.Matrix4(), c = new THREE.Color()
      list.forEach((it, i) => { m.setMatrixAt(i, mm.compose(it.p, it.q, sc(it))); if (color) m.setColorAt(i, color(it, c)) })
      m.castShadow = false; m.receiveShadow = true; m.computeBoundingSphere()
      return m
    }
    // 闊葉樹：樹幹＋兩團樹冠（主冠、側冠），近的加葉片卡；遠的樹冠換成 80 面的同形狀
    {
      const crown = (detail) => {
        let base = detail === 3 ? canopyGeometry().clone() : (() => {
          const q = new THREE.IcosahedronGeometry(1, detail), p = q.attributes.position, v = new THREE.Vector3(), col = new Float32Array(p.count * 3)
          for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); v.multiplyScalar(canopyBump(v)); if (v.y < 0) v.y *= 0.75; p.setXYZ(i, v.x, v.y, v.z); const k = lerp(0.55, 1.08, THREE.MathUtils.smoothstep(v.y, -0.8, 0.9)); col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = k }
          q.setAttribute('color', new THREE.BufferAttribute(col, 3)); q.deleteAttribute('uv'); q.computeVertexNormals(); return q
        })()
        if (base.index) base = base.toNonIndexed()
        return mergeGeometries([base.clone().scale(0.36, 0.3, 0.36).translate(0, 0.66, 0), base.clone().scale(0.26, 0.22, 0.26).translate(0.18, 0.55, 0.08)])
      }
      const cards = (() => { const c = leafCardGeometry(140); return mergeGeometries([c.clone().scale(0.36, 0.3, 0.36).translate(0, 0.66, 0), c.clone().scale(0.26, 0.22, 0.26).translate(0.18, 0.55, 0.08)]) })()
      const trunk = new THREE.CylinderGeometry(0.018, 0.035, 0.6, 7).translate(0, 0.3, 0)
      const leafM = leafify(new THREE.MeshStandardMaterial({ color: 0x4f7f3a, roughness: 0.85, vertexColors: true }))
      const barkM = barkify(new THREE.MeshStandardMaterial({ color: 0x6d5544, roughness: 0.9 }))
      const sc = (it) => new THREE.Vector3(it.H * it.w, it.H, it.H * it.w)
      const col = (it, c) => c.setHSL(0.25 + (it.c - 0.5) * 0.08, 0.35 + it.c * 0.2, 0.75 + it.c * 0.35)
      const ms = [fill(crown(3), leafM, broadL, sc, col), fill(cards, leafCardMaterial(0x5a8a42), broadL, sc, col), fill(trunk, barkM, broadL, sc)]
      const lows = [fill(crown(1), leafM, broadL, sc, col), null, null]
      for (const m of [...ms, ...lows]) if (m) g.add(m)
      lows.forEach((m) => { if (m) m.count = 0 })
      lodRegister(ms, 8, lows)
    }
    // 針葉樹：高山區同一套冷杉、鐵杉卡片＋實心芯；遠的只畫芯（深綠圓錐）和樹幹
    {
      const needleM = needleMaterial()
      const barkM = new THREE.MeshStandardMaterial({ color: 0x5a4636, roughness: 0.95 })
      const coreM = new THREE.MeshStandardMaterial({ color: 0x223a26, roughness: 1 })
      const farM = new THREE.MeshStandardMaterial({ color: 0x3e6243, roughness: 1, flatShading: true })   // 遠處三層圓錐：比芯亮（芯在針葉裡面，遠處沒有針葉蓋著會太黑）
      const sc = (it) => new THREE.Vector3(it.H * it.w, it.H, it.H * it.w)
      for (const kind of ['fir', 'hemlock']) {
        const list = conL.filter((_, i) => (i % 2 === 0) === (kind === 'fir'))
        const crown = coniferGeo(kind), trunk = new THREE.CylinderGeometry(0.006, 0.026, 0.86, 8).translate(0, 0.43, 0)
        const core = new THREE.ConeGeometry(kind === 'fir' ? 0.075 : 0.12, 0.74, 9, 1, true).translate(0, 0.5, 0)
        // 遠處：疊三層圓錐（樹冠的輪廓），顏色跟近處的針葉一樣有深淺
        const R0 = kind === 'fir' ? 0.19 : 0.27
        const farCore = mergeGeometries([[0.3, 0.42, 1], [0.52, 0.34, 0.75], [0.72, 0.28, 0.5]].map(([y, h, r]) => new THREE.ConeGeometry(R0 * r * 1.1, h, 7, 1).translate(0, y, 0).toNonIndexed()))
        const col = (it, c) => c.setHSL(0.27 + (it.c - 0.5) * 0.06, 0.2 + it.c * 0.15, 0.7 + it.c * 0.25)
        const ms = [fill(crown, needleM, list, sc, col), fill(trunk, barkM, list, sc), fill(core, coreM, list, sc)]
        const lows = [fill(farCore, farM, list, sc, col), null, null]
        for (const m of [...ms, ...lows]) if (m) g.add(m)
        lows.forEach((m) => { if (m) m.count = 0 })
        lodRegister(ms, 10, lows)
      }
    }
  }

  /* ---------- 遠山 ---------- */
  {
    const mtnMat = new THREE.ShaderMaterial({
      fog: false,
      uniforms: { uDay: dayLight, uDusk: duskLight, uHaze: weatherU.haze, uFlash: weatherU.flash },
      vertexShader: `attribute float aHaze; varying float vHaze;
        void main(){ vHaze = aHaze; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `varying float vHaze; uniform float uDay; uniform float uDusk; uniform float uHaze; uniform float uFlash;
        void main(){
          vec3 hor = mix(vec3(0.035, 0.05, 0.09), vec3(0.86, 0.91, 0.93), uDay);
          hor = mix(hor, vec3(0.9, 0.6, 0.42), uDusk * 0.6);
          vec3 base = mix(vec3(0.02, 0.03, 0.04), vec3(0.22, 0.32, 0.28), uDay);
          hor = mix(hor, vec3(dot(hor, vec3(0.3, 0.5, 0.2))) * 0.8, uHaze);   // 下雨：地平線灰掉
          gl_FragColor = vec4(mix(base, hor, clamp(vHaze + 0.5 * uHaze, 0.0, 1.0)) + vec3(0.5, 0.55, 0.7) * uFlash * 0.4, 1.0);
          #include <colorspace_fragment>
        }`,
    })
    for (const [R, haze, H, seed] of [[640, 0.42, 120, 11], [760, 0.58, 170, 23], [880, 0.72, 230, 37]]) {
      const N = 512, P = [], HZ = [], I = []
      for (let i = 0; i <= N; i++) {
        const a = (i / N) * TAU, cx = Math.cos(a), sz = Math.sin(a)
        const n = fbm3(cx * 2.2 + seed, seed * 0.3, sz * 2.2, 5)
        const ridge = H * (0.25 + 0.75 * Math.max(0, n * 0.9 + 0.45)) * (0.55 + 0.45 * Math.abs(fbm3(cx * 0.7, seed, sz * 0.7, 2) * 2))
        P.push(cx * R, -20, sz * R, cx * R, ridge, sz * R)
        HZ.push(haze + 0.22, haze)   // 山腳在地面的霧氣裡更淡
      }
      for (let i = 0; i < N; i++) { const a = i * 2; I.push(a, a + 2, a + 1, a + 1, a + 2, a + 3) }
      const geo = new THREE.BufferGeometry()
      geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3))
      geo.setAttribute('aHaze', new THREE.Float32BufferAttribute(HZ, 1))
      geo.setIndex(I)
      const m = new THREE.Mesh(geo, mtnMat)
      m.frustumCulled = false
      g.add(m)
    }
  }
  return g
}
