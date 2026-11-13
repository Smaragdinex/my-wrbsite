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
import { dayLight, duskLight, weatherU, wetify } from './structures.js'
import { canopyGeometry, canopyBump, leafify, barkify, leafCardGeometry, leafCardMaterial } from './fju-foliage.js'
import { coniferGeo, needleMaterial , coniferLoGeo } from './alpine.js'
import { graniteMaterial } from './yosemite.js'
import { lodRegister } from './lod.js'
import * as T from './textures.js'

const groundH = (x, z) => inAlpine(x, z) ? alpineHeight(x, z) : terrainHeight(x, z)
const UP = new THREE.Vector3(0, 1, 0)
const ENTRY_W = 4.3   // 相機行門口（入口石材地板寬 ±4）圍籬留的開口

// 方位 a 往外走到 domeRho = rho 的那一點
function edgePoint(a, rho = 1) {
  const dx = Math.cos(a), dz = Math.sin(a)
  // 2026-11-11 西北、西南多了兩塊（LOBES）：同一方向可能出邊界又進邊界 → 從外面往裡找「最外面」那個交點，再二分
  let hi = 420, lo = 0
  for (let m = 420; m > 0; m -= 0.5) if (domeRho(dx * m, dz * m) < rho) { lo = m; hi = m + 0.5; break }
  for (let i = 0; i < 30; i++) { const m = (lo + hi) / 2; if (domeRho(dx * m, dz * m) < rho) lo = m; else hi = m }
  return [dx * lo, dz * lo, lo]
}

// 2026-11-11 遠處的樹（ChatGPT：不要三層圓錐、圓球，用近處那棵寫實樹烘成的貼圖 impostor）：
// 開場把近處用的樹（樹冠＋葉片卡＋樹幹，一棵、高 1）用正交相機拍成一張透明底的貼圖，遠處的樹換成兩片十字交叉的貼圖板
function bakeImpostor(renderer, parts, W, H = 1, px = 256) {
  const sc = new THREE.Scene(), cam = new THREE.OrthographicCamera(-W / 2, W / 2, H, 0, -5, 5)
  cam.position.set(0, 0, 2); cam.lookAt(0, 0, 0)
  sc.add(new THREE.AmbientLight(0xffffff, Math.PI * 2.6)); const dl = new THREE.DirectionalLight(0xffffff, 2.4);   // 烘出來的是「本色」：第一版光太弱，貼圖平均只有 5/255，遠處的樹一片黑
   dl.position.set(0.4, 1, 0.8); sc.add(dl)
  for (const [geo, mat, c] of parts) { const m = new THREE.InstancedMesh(geo, mat, 1); m.setMatrixAt(0, new THREE.Matrix4()); if (c) m.setColorAt(0, c); m.frustumCulled = false; sc.add(m) }
  const rt = new THREE.WebGLRenderTarget(px, Math.round(px * H / W), { samples: 4 })
  const prev = renderer.getRenderTarget(), pc = new THREE.Color(), pa = renderer.getClearAlpha(); renderer.getClearColor(pc)
  renderer.setRenderTarget(rt); renderer.setClearColor(0x000000, 0); renderer.clear(); renderer.render(sc, cam)
  renderer.setRenderTarget(prev); renderer.setClearColor(pc, pa)
  rt.texture.generateMipmaps = true; rt.texture.minFilter = THREE.LinearMipmapLinearFilter
  return rt.texture
}
// 十字交叉的兩片板（寬 W、高 H，底在 y=0），法線朝上（跟樹冠一樣吃天光，不會因為板子的方向一片亮一片暗）
function crossBoards(W, H = 1) {
  const a = new THREE.PlaneGeometry(W, H).translate(0, H / 2, 0), b = a.clone().rotateY(Math.PI / 2)
  const g = mergeGeometries([a, b]), n = g.attributes.normal
  for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, 1, 0)
  return g
}
export function buildOutside(renderer = null) {
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
    const ground = new THREE.Mesh(geo, wetify(new THREE.MeshStandardMaterial({ map: T.grassGroundTex(), vertexColors: true, roughness: 1 }), { dark: 0.3, rough: 0.55 }))
    ground.receiveShadow = true; ground.userData.terrain = true
    g.add(ground)
  }

  /* ---------- 圍籬：邊界內側（玩家在 0.955 被擋），每 2.4 公尺一根柱子、兩條橫木，跟著地形 ----------
     2026-11-11 使用者：邊邊的木頭要跟木道一樣高材質 → 改用木棧道那套 Blender 零件（bw_post、bw_rail_top、bw_rail_mid：倒角、木紋、法線貼圖），
     材質也是同一個。零件要等 boardwalk_kit.glb 載完，所以 world.js 載完後才呼叫 g.userData.buildFence(kit) */
  g.userData.buildFence = (kit) => {
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
    const yAt = (x, z) => { const h = groundH(x, z); return Math.abs(h) < 100 ? h : 0 }
    const M = { bw_post: [], bw_rail_top: [], bw_rail_mid: [] }
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), X = new THREE.Vector3(), Yv = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(), bm = new THREE.Matrix4()
    for (let k = 0; k < posts.length; k++) {
      const [x, z] = posts[k], [x2, z2] = posts[(k + 1) % posts.length]
      if (gap(x, z)) continue
      const y = yAt(x, z), y2 = yAt(x2, z2)
      M.bw_post.push(m4.compose(new THREE.Vector3(x, y, z), q.setFromAxisAngle(Yv, Math.atan2(x2 - x, z2 - z)), new THREE.Vector3(1, 1, 1)).clone())
      if (gap(x2, z2)) continue
      // 橫木：零件長 1 公尺（沿 x），拉長到柱距、順著地形斜
      const a = new THREE.Vector3(x, y, z), b = new THREE.Vector3(x2, y2, z2), L = a.distanceTo(b)
      X.copy(b).sub(a).normalize(); Z.crossVectors(X, Yv).normalize(); const Y2 = new THREE.Vector3().crossVectors(Z, X)
      q.setFromRotationMatrix(bm.makeBasis(X, Y2, Z))
      for (const [part, hy] of [['bw_rail_top', 1.04], ['bw_rail_mid', 0.58]]) M[part].push(m4.compose(a.clone().add(b).multiplyScalar(0.5).add(new THREE.Vector3(0, hy, 0)), q, new THREE.Vector3(L, 1, 1)).clone())
    }
    for (const [part, list] of Object.entries(M)) {
      if (!kit?.geo?.[part] || !list.length) continue
      const im = new THREE.InstancedMesh(kit.geo[part], kit.wood, list.length)
      list.forEach((m, k) => im.setMatrixAt(k, m)); im.castShadow = true; im.receiveShadow = true; im.frustumCulled = false; im.name = 'fence_' + part
      g.add(im)
    }
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
      // 2026-11-12 使用者「遠景是板樹，應該像人眼一樣圓的、看不清楚，但不是低模」：遠處不再換成交叉看板，用同形狀的圓形實心樹冠（320 面，有凹凸和上亮下暗）
      let lows = [fill(crown(2), leafM, broadL, sc, col), null, null]
      if (false && renderer) {
        const midC = new THREE.Color().setHSL(0.25, 0.45, 0.92)
        const tex = bakeImpostor(renderer, [[crown(3), leafM, midC], [cards, leafCardMaterial(0x5a8a42), midC], [trunk, barkM, null]], 0.9)
        const impM = new THREE.MeshStandardMaterial({ map: tex, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.9 })
        lows = [fill(crossBoards(0.9), impM, broadL, sc, (it, c) => c.setScalar(0.82 + it.c * 0.3)), null, null]
      }
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
        const core = new THREE.ConeGeometry(kind === 'fir' ? 0.045 : 0.07, 0.66, 9, 1, true).translate(0, 0.52, 0)   /* 2026-11-14 新針葉簇夠密，芯縮細（以前從簇之間露出一根平滑的綠圓錐） */
        // 遠處：疊三層圓錐（樹冠的輪廓），顏色跟近處的針葉一樣有深淺
        const R0 = kind === 'fir' ? 0.19 : 0.27
        const farCore = mergeGeometries([[0.3, 0.42, 1], [0.52, 0.34, 0.75], [0.72, 0.28, 0.5]].map(([y, h, r]) => new THREE.ConeGeometry(R0 * r * 1.1, h, 7, 1).translate(0, y, 0).toNonIndexed()))
        const col = (it, c) => c.setHSL(0.27 + (it.c - 0.5) * 0.06, 0.2 + it.c * 0.15, 0.7 + it.c * 0.25)
        const ms = [fill(crown, needleM, list, sc, col), fill(trunk, barkM, list, sc), fill(core, coreM, list, sc)]
        let lows = [fill(farCore, farM, list, sc, col), null, null]
        const loG = coniferLoGeo(kind)   // 2026-11-12 使用者「遠景是板樹」：遠處不再用交叉看板（烘好的替身），改用立體樹冠的輕量版
        if (loG) lows = [fill(loG, needleM, list, sc, col), null, null]
        else if (renderer) {
          const W = R0 * 2.3, midC = new THREE.Color().setHSL(0.27, 0.27, 0.82)
          const tex = bakeImpostor(renderer, [[crown, needleM, midC], [trunk, barkM, null], [core, coreM, null]], W)
          const impM = new THREE.MeshStandardMaterial({ map: tex, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.95 })
          lows = [fill(crossBoards(W), impM, list, sc, (it, c) => c.setScalar(0.8 + it.c * 0.3)), null, null]
        }
        for (const m of [...ms, ...lows]) if (m) g.add(m)
        lows.forEach((m) => { if (m) m.count = 0 })
        lodRegister(ms, 10, lows)
      }
    }
  }

  /* ---------- 遠山 ---------- */
  // 2026-11-11 使用者：夜晚、下雨遠景只有一片灰（ChatGPT：每層山自己的空氣透視，夜裡近山深、遠山淡、地平線天空最亮；下雨對比變低但不能全部消失）
  // aLayer：0 近山（640）、1 中山（760）、2 遠山（880）、3 山腳的森林帶（420 公尺，蓋住地平線那一圈平平的深色地面）
  // aV：0 山腳、1 稜線（稜線上一點點月光／天光的亮邊）
  {
    const mtnMat = new THREE.ShaderMaterial({
      fog: false,
      uniforms: { uDay: dayLight, uDusk: duskLight, uHaze: weatherU.haze, uFlash: weatherU.flash },
      vertexShader: `attribute float aLayer; attribute float aV; varying float vL; varying float vV;
        void main(){ vL = aLayer; vV = aV; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `varying float vL; varying float vV; uniform float uDay; uniform float uDusk; uniform float uHaze; uniform float uFlash;
        vec3 pick4(float l, vec3 a, vec3 b, vec3 c, vec3 d){ return l < 0.5 ? a : l < 1.5 ? b : l < 2.5 ? c : d; }
        float pickf(float l, float a, float b, float c, float d){ return l < 0.5 ? a : l < 1.5 ? b : l < 2.5 ? c : d; }
        void main(){
          // 白天：原本的做法（山的本色往地平線的天色混，遠的混多一點）
          vec3 dHor = mix(vec3(0.86, 0.91, 0.93), vec3(0.9, 0.6, 0.42), uDusk * 0.6);
          vec3 dBase = pick4(vL, vec3(0.085, 0.15, 0.11), vec3(0.16, 0.22, 0.22), vec3(0.3, 0.36, 0.42), vec3(0.11, 0.2, 0.12));   // 2026-11-11 近層偏森林綠、中層藍綠灰、遠層藍灰（ChatGPT #718780／#91A5A8／#B5C4CF 的方向）
          float dW = pickf(vL, 0.4, 0.55, 0.7, 0.22) + 0.08 * (1.0 - vV);   // 山腳不要淡成天色（以前 0.22：下緣跟天空一樣亮，整座山像浮在雲上）
          dHor = mix(dHor, vec3(dot(dHor, vec3(0.3, 0.5, 0.2))) * 0.8, uHaze);
          vec3 day = mix(dBase, dHor, clamp(dW + 0.45 * uHaze, 0.0, 1.0));
          // 夜晚：近山 #202D42、中山 #343F56、遠山 #51596E、森林帶更深；霧色冷藍灰 #343D55（線性色）
          vec3 nBase = pick4(vL, vec3(0.006, 0.011, 0.024), vec3(0.013, 0.02, 0.038), vec3(0.024, 0.032, 0.056), vec3(0.003, 0.006, 0.01));   // 2026-11-11 第一版照 ChatGPT 的色太亮：遠山比夜空還亮像在發光 → 整體壓一半，一層比一層淡、但都比天暗
          vec3 nFog = vec3(0.016, 0.022, 0.044);
          float nW = mix(pickf(vL, 0.25, 0.42, 0.58, 0.12), pickf(vL, 0.5, 0.65, 0.78, 0.35), uHaze) + 0.15 * (1.0 - vV);
          vec3 night = mix(nBase, nFog, clamp(nW, 0.0, 1.0));
          night += vec3(0.018, 0.024, 0.04) * smoothstep(0.82, 1.0, vV) * (1.0 - 0.7 * uHaze) * step(vL, 2.5);   // 稜線的冷光邊
          vec3 c = mix(night, day, uDay);
          gl_FragColor = vec4(c + vec3(0.5, 0.55, 0.7) * uFlash * 0.4, 1.0);
          #include <colorspace_fragment>
        }`,
    })
    // 2026-11-11 ChatGPT 遠山 V2：近層 450～650 m 森林圓稜（峰 110～145）、中層 750～1000 m 破碎岩稜（155～200）、遠層 1200～1700 m（230～310）
    for (const [R, layer, H, seed] of [[560, 0, 130, 11], [880, 1, 185, 23], [1350, 2, 270, 37], [420, 3, 0, 53]]) {
      const N = layer === 3 ? 2400 : 768, P = [], AL = [], AV = [], I = []
      for (let i = 0; i <= N; i++) {
        const a = (i / N) * TAU, cx = Math.cos(a), sz = Math.sin(a)
        let ridge
        if (layer === 3) {
          // 森林帶：起伏的山腳＋一棵棵針葉樹尖（每 1～3 公尺一個尖，高低不一）
          const n = fbm3(cx * 3 + seed, 1.7, sz * 3, 3)
          // 樹尖：兩組不同間距的尖、高低用雜訊調（第一版只有一組，像一排一樣的鋸齒）
          const u = a * 330, m1 = fbm3(cx * 17, 2.2, sz * 17, 2), m2 = fbm3(cx * 31, 5.1, sz * 31, 2)
          const tip = Math.pow(Math.max(0, Math.sin(u / 2.1 + 6 * m1)), 4) * (0.6 + 0.8 * Math.abs(m2) * 2) + 0.6 * Math.pow(Math.max(0, Math.sin(u / 1.33 + 3 + 9 * m2)), 6) * (0.4 + Math.abs(m1) * 2)
          ridge = 16 + 12 * n + 3.2 * tip
        } else {
          const n = fbm3(cx * 2.2 + seed, seed * 0.3, sz * 2.2, 5)
          // 日出、日落的方向壓成山谷：太陽從谷口升起、落下
          const valley = 1 - 0.8 * smoothstep(0.82, 0.97, Math.max(...[[-0.8, 0.35], [0.8, 0.35]].map(([sx, szz]) => (cx * sx + sz * szz) / Math.hypot(sx, szz))))
          ridge = H * valley * (0.25 + 0.75 * Math.max(0, n * 0.9 + 0.45)) * (0.55 + 0.45 * Math.abs(fbm3(cx * 0.7, seed, sz * 0.7, 2) * 2))
          ridge += H * 0.06 * fbm3(cx * 14 + seed, 4.4, sz * 14, 3)   // 次級山脊、岩稜（ChatGPT：不要只有幾個圓圓的波峰）
        }
        const RR = layer === 3 ? edgePoint(a)[2] + 310 : R   // 森林帶貼著公園邊界外 310 公尺（樹林帶外面），東邊山區比較寬也不會穿過樹林
        P.push(cx * RR, -80, sz * RR, cx * RR, ridge, sz * RR)   // 山腳拉到 -80（ChatGPT：往下接進雲層 40～80 m）
        AL.push(layer, layer); AV.push(0, 1)
      }
      for (let i = 0; i < N; i++) { const a = i * 2; I.push(a, a + 2, a + 1, a + 1, a + 2, a + 3) }
      const geo = new THREE.BufferGeometry()
      geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3))
      geo.setAttribute('aLayer', new THREE.Float32BufferAttribute(AL, 1)); geo.setAttribute('aV', new THREE.Float32BufferAttribute(AV, 1))
      geo.setIndex(I)
      const m = new THREE.Mesh(geo, mtnMat)
      m.frustumCulled = false
      g.add(m)
    }
  }

  /* ---------- 雪山（第四層） ---------- */
  // 2026-11-10 使用者：瀑布頂上面看出去加背景雪山（ChatGPT「台灣高山雪景遠景設計規格」）：
  // 東北方 1,200～1,500 m 三座主峰（雪山式圈谷主峰 440 m、玉山式尖岩脊 370 m、南湖式寬稜 410 m），比 230 m 的遠山高，從高處才看得到。
  // 台灣的雪薄、只在冬春 → 少量殘雪（主峰 8～18%）：只在高處、緩一點的坡、背陽面、岩溝圈谷；陡岩壁露岩。不是一整排白三角形。
  // 一個 mesh（極座標網格 ~3,500 點）、一個材質；空氣透視自己算（不吃場景霧）
  {
    const PEAKS = [[35, 1350, 330, 260, 1], [58, 1250, 285, 170, 2], [78, 1450, 310, 300, 3]].map(([b, d, h, r, k]) => {   // 2026-11-11 高度 440/370/410 → ChatGPT 遠層 230～310（太高像浮在半空中的灰色三角形）.map(([b, d, h, r, k]) => {
      const a = b * Math.PI / 180
      return { x: Math.sin(a) * d, z: Math.cos(a) * d, h, r, k }
    })
    const heightAt = (x, z) => {
      let y = -40
      for (const p of PEAKS) {
        const d = Math.hypot(x - p.x, z - p.z) / p.r
        if (d > 2.2) continue
        // 山體：中間尖、往外凹的錐；玉山型（k 2）更尖，南湖型（k 3）頂上寬
        const core = p.k === 2 ? Math.pow(Math.max(0, 1 - d / 1.9), 1.9) : p.k === 3 ? Math.pow(Math.max(0, 1 - Math.pow(d / 2.1, 1.6)), 1.4) : Math.pow(Math.max(0, 1 - d / 2.0), 1.6)
        y = Math.max(y, p.h * core)
      }
      // 稜線、岩溝：ridged 雜訊（1-|n|）往上疊，越高越多
      // 2026-11-10 第一版太平滑（像三個乾淨的三角形）→ ridged 加大、加一層細的岩溝
      const n1 = fbm3(x * 0.005, 7.3, z * 0.005, 4), n2 = fbm3(x * 0.014 + 3, 1.1, z * 0.014, 3), n3 = fbm3(x * 0.035 - 5, 2.7, z * 0.035, 2)
      const ridged = (1 - Math.abs(n1 * 2)) * 0.5 + (1 - Math.abs(n2 * 2)) * 0.35 + (1 - Math.abs(n3 * 2)) * 0.15
      y += (y + 40) * 0.42 * (ridged - 0.6)
      // 主峰朝公園那側（西南）一個冰河圈谷：碗狀凹地（積雪最多的地方）
      const A = PEAKS[0], cx = A.x - 0.35 * A.r * Math.sin(35 * Math.PI / 180), cz = A.z - 0.35 * A.r * Math.cos(35 * Math.PI / 180)
      y -= 70 * Math.exp(-((Math.hypot(x - cx, z - cz) / 85) ** 2))
      return y
    }
    const NB = 110, NR = 32, B0 = 18, B1 = 100, R0 = 1000, R1 = 1750
    const P = [], N = [], I = [], TR = [], NZ = []
    const hs = []
    for (let j = 0; j <= NR; j++) for (let i = 0; i <= NB; i++) {
      const a = (B0 + (B1 - B0) * i / NB) * Math.PI / 180, r = R0 + (R1 - R0) * j / NR
      const x = Math.sin(a) * r, z = Math.cos(a) * r
      const y = heightAt(x, z); hs.push(y); P.push(x, y, z)
    }
    const W = NB + 1
    for (let j = 0; j <= NR; j++) for (let i = 0; i <= NB; i++) {
      const k = j * W + i, x = P[k * 3], z = P[k * 3 + 2], y = hs[k], e = 6
      // 法線（直接用高度函數差分）、岩溝圈谷（周圍比中間高＝凹）
      const dx = heightAt(x + e, z) - heightAt(x - e, z), dz = heightAt(x, z + e) - heightAt(x, z - e)
      const n = new THREE.Vector3(-dx, 2 * e, -dz).normalize(); N.push(n.x, n.y, n.z)
      const ring = (heightAt(x + 30, z) + heightAt(x - 30, z) + heightAt(x, z + 30) + heightAt(x, z - 30)) / 4
      TR.push(THREE.MathUtils.clamp((ring - y) / 12, 0, 1))
      NZ.push(fbm3(x * 0.018, 3.3, z * 0.018, 3) + 0.5)
    }
    for (let j = 0; j < NR; j++) for (let i = 0; i < NB; i++) { const a = j * W + i, b = a + 1, c = a + W, d = c + 1; I.push(a, c, b, b, c, d) }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); geo.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3))
    geo.setAttribute('aTrap', new THREE.Float32BufferAttribute(TR, 1)); geo.setAttribute('aNoise', new THREE.Float32BufferAttribute(NZ, 1))
    geo.setIndex(I)
    const snowMat = new THREE.ShaderMaterial({
      fog: false,
      uniforms: { uDay: dayLight, uDusk: duskLight, uHaze: weatherU.haze, uFlash: weatherU.flash, uSun: { value: new THREE.Vector3(-0.45, 0.8, 0.3).normalize() } },
      vertexShader: `attribute float aTrap; attribute float aNoise; varying vec3 vN; varying float vY; varying float vTrap; varying float vNoise; varying float vDist;
        void main(){ vN = normal; vY = position.y; vTrap = aTrap; vNoise = aNoise; vec4 wp = modelMatrix * vec4(position, 1.0); vDist = distance(wp.xyz, cameraPosition);
          gl_Position = projectionMatrix * viewMatrix * wp; }`,
      fragmentShader: `uniform float uDay; uniform float uDusk; uniform float uHaze; uniform float uFlash; uniform vec3 uSun;
        varying vec3 vN; varying float vY; varying float vTrap; varying float vNoise; varying float vDist;
        void main(){
          vec3 n = normalize(vN);
          // 雪遮罩（ChatGPT 公式，春天殘雪）：高度比例 H、坡度、背陽、岩溝，加雜訊讓邊緣破碎；山體 70% 以下沒有雪
          float H = clamp(vY / 440.0, 0.0, 1.0);
          float altitude = smoothstep(0.58, 0.86, H);
          float slopeMask = smoothstep(0.35, 0.75, n.y);
          float sun = max(dot(n, uSun), 0.0);
          float snow = clamp(altitude * slopeMask * (0.55 + 0.25 * (1.0 - sun) + 0.45 * vTrap) + (vNoise - 0.5) * 0.3, 0.0, 1.0);
          snow *= smoothstep(0.55, 0.7, H);
          snow = smoothstep(0.35, 0.6, snow);
          // 岩石：深灰褐、冷灰；陽面亮一點
          vec3 rockD = mix(vec3(0.07, 0.066, 0.062), vec3(0.1, 0.105, 0.12), vNoise) * (0.4 + 1.0 * sun);
          vec3 snowD = mix(vec3(0.42, 0.48, 0.58), vec3(0.72, 0.79, 0.86), sun);                  // 正午：冷白偏藍；陰面藍灰
          vec3 snowDusk = mix(vec3(0.25, 0.32, 0.46), vec3(0.80, 0.47, 0.30), sun);              // 黃昏：受光面暖橘粉、陰面藍紫灰
          vec3 snowC = mix(snowD, snowDusk, uDusk);
          vec3 day = mix(rockD, snowC, snow);
          // 空氣透視：遠的往地平線天色混（55～75%），比 230 m 的遠山還淡
          vec3 dHor = mix(vec3(0.86, 0.91, 0.93), vec3(0.9, 0.6, 0.42), uDusk * 0.6);
          dHor = mix(dHor, vec3(dot(dHor, vec3(0.3, 0.5, 0.2))) * 0.8, uHaze);
          float fogA = clamp(0.36 + 0.2 * smoothstep(1100.0, 1700.0, vDist) - 0.1 * snow + 0.35 * uHaze, 0.0, 0.97);   // 第一版 0.5：整座山淡到看不出岩石和雪
          day = mix(day, dHor, fogA);
          // 夜晚：暗藍灰，雪只比岩石亮一點點
          vec3 night = mix(vec3(0.012, 0.016, 0.028), vec3(0.025, 0.035, 0.055), snow);
          night = mix(night, vec3(0.016, 0.022, 0.044), 0.55 + 0.3 * uHaze);
          vec3 c = mix(night, day, uDay);
          gl_FragColor = vec4(c + vec3(0.5, 0.55, 0.7) * uFlash * 0.3, 1.0);
          #include <colorspace_fragment>
        }`,
    })
    const snowMtn = new THREE.Mesh(geo, snowMat)
    snowMtn.name = 'snowMountains'; snowMtn.frustumCulled = false; snowMtn.renderOrder = -1
    g.add(snowMtn)
  }

  /* ---------- 花崗岩圓頂（邊界外、不能走） ---------- */
  // 2026-11-10 使用者：瀑布頂要像優勝美地高地（Tenaya Lake 那種冰河磨光的花崗岩圓頂）；ChatGPT P0：北邊邊界外兩座純遠景圓頂，
  // 瀑布頂往後看不再是空的。A 在瀑布頂正北（155 m）；B ChatGPT 原本放東北，會擋住雪山 → 改到西北（120 m）。
  // 形狀：非對稱橢圓圓頂（朝公園那面比較陡），大片光滑岩板＋幾道節理岩溝、黑色水痕；山腳一圈深綠針葉林色；顏色照 ChatGPT 的 linear 花崗岩
  {
    const ss = smoothstep
    // 2026-11-11 使用者：「那個山長得非常怪」——兩顆圓頂一條條放射狀的岩片，看起來像南瓜／大蒜 → ChatGPT：刪掉圓頂，
    // 換成一道連續、不規則的山稜（2～4 個不對稱的山頭＋寬鞍部，比山腳高 35～65 m）；下半是森林、上半露出幾塊花崗岩，山腳往下接進林子
    const P = [], C = [], I = [], c = new THREE.Color()
    const X0 = 70, X1 = 345, Z0 = 168, Z1 = 300, CS = 3, NA = Math.round((X1 - X0) / CS), NR = Math.round((Z1 - Z0) / CS)
    const crestZ = (x) => 228 + 16 * Math.sin(x * 0.019 + 0.8) + 7 * Math.sin(x * 0.051 + 2.1)          // 稜線不是一條直線
    const relief = (x) => {                                                                             // 沿稜線的高度：三個山頭、中間寬鞍部
      const peaks = [[112, 74, 55], [208, 66, 60], [300, 70, 50]]   /* 2026-11-11 中間那座綠山頭被瀑布頂後面的新山（summit.js）取代，壓低 */   // 第一版 52～66 m、寬 30 m：雲海（32 m）只露出兩個尖尖的綠山頭 → 加高加寬，鞍部也在雲海上面
      let h = 52 + 10 * (fbm3(x * 0.02, 3.3, 1.1, 3) - 0.5)
      for (const [px, ph, pw] of peaks) h = Math.max(h, ph * Math.exp(-(((x - px) / pw) ** 2)) + 10 * (fbm3(x * 0.05, 7.7, 2.2, 2) - 0.5))
      return h
    }
    for (let j = 0; j <= NR; j++) for (let i = 0; i <= NA; i++) {
      const x = X0 + i * CS, z = Z0 + j * CS, zc = crestZ(x), H = relief(x)
      const dz = z - zc, w = dz < 0 ? 58 : 75                                                           // 朝公園（南）那面陡一點
      const n = fbm3(x * 0.025, 1.7, z * 0.025, 4) - 0.5, n2 = fbm3(x * 0.08, 4.4, z * 0.08, 3) - 0.5
      const spur = 0.18 * Math.sin(x * 0.11 + n * 3) * Math.exp(-((dz / w) ** 2) * 0.6)               // 山腹的支稜和山溝（從稜線往下，不是同心圓）
      let h = H * Math.exp(-((dz / w) ** 2) * 1.6) * (1 + spur) + 9 * n + 2.2 * n2
      const ex = Math.min(1, (x - X0) / 30, (X1 - x) / 30), ez = Math.min(1, (z - Z0) / 22)               // 邊上收到地面下（不會看到一片懸空的邊）
      h = h * Math.max(0, ex) * Math.max(0, ez) - 12 * (1 - Math.min(ex, ez))
      P.push(x, 4 + h, z)
      // 顏色：大部分是林子（深綠、遠一點偏藍灰），稜線附近、陡的地方露出米灰花崗岩和黑色水痕
      const rock = smoothstep(0.55, 0.85, h / Math.max(20, H)) * smoothstep(-0.05, 0.25, n2 + 0.2 * Math.abs(spur) * 5)
      c.setRGB(0.05, 0.085, 0.05).lerp(new THREE.Color(0.07, 0.1, 0.075), 0.5 + n)
      c.lerp(new THREE.Color(0.46, 0.44, 0.4).multiplyScalar(0.9 + 0.3 * n2), rock)
      if (rock > 0.3 && n2 < -0.15) c.lerp(new THREE.Color(0.12, 0.12, 0.11), 0.5)
      C.push(c.r, c.g, c.b)
    }
    for (let j = 0; j < NR; j++) for (let i = 0; i < NA; i++) { const a = j * (NA + 1) + i, b = a + 1, cc = a + NA + 1, d = cc + 1; I.push(a, cc, b, b, cc, d) }
    // 三角形朝外：拿圓頂頂點附近第一個三角形檢查，朝下就全部翻過來
    { const v = (k) => new THREE.Vector3(P[k * 3], P[k * 3 + 1], P[k * 3 + 2]), t0 = (NA + 1) * 2 + 3, n = v(I[t0 * 3 + 1]).sub(v(I[t0 * 3])).cross(v(I[t0 * 3 + 2]).sub(v(I[t0 * 3]))); if (n.y < 0) for (let k = 0; k < I.length; k += 3) { const t = I[k + 1]; I[k + 1] = I[k + 2]; I[k + 2] = t } }
    const dg = new THREE.BufferGeometry()
    dg.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); dg.setAttribute('color', new THREE.Float32BufferAttribute(C, 3)); dg.setIndex(I); dg.computeVertexNormals()
    // 場景的霧在 100 多公尺外會把顏色洗掉一半（第三版整座山一片淡灰、看不到水痕和林子）→ 不吃場景霧，自己在頂點色裡混一點點天色
    // 花崗岩貼圖本身會再壓暗一半（岩壁的頂點色都在 1 左右）→ 頂點色 ×2（第四版整座山變黑灰）；再混一點點天色當空氣透視
    { const C2 = dg.attributes.color.array; for (let k = 0; k < C2.length; k += 3) { C2[k] = Math.min(1, C2[k] * 2.0) * 0.86 + 0.62 * 0.14; C2[k + 1] = Math.min(1, C2[k + 1] * 2.0) * 0.86 + 0.7 * 0.14; C2[k + 2] = Math.min(1, C2[k + 2] * 2.0) * 0.86 + 0.8 * 0.14 } }
    dg.attributes.color.needsUpdate = true
    const domeM = new THREE.Mesh(dg, graniteMaterial({ fog: false, scale: 0.08 }))   // 跟瀑布岩壁同一套花崗岩貼圖（第三版沒貼圖，像塑膠）
    domeM.name = 'graniteDomes'; domeM.receiveShadow = false; domeM.castShadow = false
    g.add(domeM)
  }
  return g
}
