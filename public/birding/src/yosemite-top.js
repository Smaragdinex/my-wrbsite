// 2026-11-11 瀑布步道到山頂（使用者：上面太小，要變成真的山；山路上要有草、青苔；用 Blender 做更真實）
// 1) 山體：岩壁頂的平台後面（邊界外，走不到）一整座山往上長——平台變成山的肩膀：先一小段緩坡草地，再往上是針葉林、
//    陡的地方露出花崗岩岩稜，主峰比平台高 70 m（約 145 m），兩側山稜往下沉進雲海
// 2) 平台：一層草、長青苔的花崗岩塊、青苔墊、草叢、蕨類；石階出口→涼亭→觀景台留一條踩出來的小徑
// 3) 石階：靠岩壁那側的牆腳一路長青苔墊、草叢、蕨類；外側矮牆腳零星的草；踏板上的青苔在 yosemite.js 的 stepM
// 模型：tools/make-summit-kit.py → models/props/summit_kit.glb（頂點色；岩石部分在這裡配花崗岩 triplanar）
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { YOSE, alpineHeight, alpineStreamDist, addCollider } from './layout.js'
import { mulberry32, fbm2 } from './noise.js'
import { coniferGeo, needleMaterial } from './alpine.js'
import { scatter } from './plants.js'
import { bladeMesh } from './flora.js'
import { waterNormalTex } from './textures.js'
import { graniteMaterial } from './yosemite.js'

const VER = new URL(import.meta.url).searchParams.get('v') ?? ''
const TAU = Math.PI * 2, V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z)
const ss = (a, b, v) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t) }
const lerp = (a, b, t) => a + (b - a) * t

// 花崗岩 triplanar（跟岩壁同一張圖）；頂點色綠多於紅＝青苔（不吃花崗岩斑點，只留一點明暗）
export function mossRockMaterial() {
  const m = graniteMaterial({ scale: 0.6 })
  const ob = m.onBeforeCompile
  m.onBeforeCompile = (sh) => {
    ob(sh)
    sh.fragmentShader = sh.fragmentShader.replace('#include <color_fragment>', `
      { float mo = clamp((vColor.g - vColor.r) * 9.0, 0.0, 1.0);
        vec3 rockC = diffuseColor.rgb * vColor.rgb * 1.9;
        vec3 mossC = vColor.rgb * (0.75 + 0.5 * dot(tpC.rgb, vec3(0.33)));
        diffuseColor.rgb = mix(rockC, mossC, mo); }`)
  }
  m.customProgramCacheKey = () => 'mossRock'
  return m
}

export async function loadSummitKit() {
  const gl = await new GLTFLoader().loadAsync(`models/props/summit_kit.glb?v=${VER}`)
  const geo = {}
  gl.scene.updateMatrixWorld(true)
  gl.scene.traverse((o) => { if (o.isMesh) { const g = o.geometry.clone(); g.applyMatrix4(o.matrixWorld); if (g.attributes.color_1) { g.setAttribute('color', g.attributes.color_1); g.deleteAttribute('color_1') } geo[o.name] = g } })
  return {
    geo,
    rockM: mossRockMaterial(),
    mossM: new THREE.MeshStandardMaterial({ vertexColors: true, color: new THREE.Color().setScalar(0.95), roughness: 1 }),
    grassM: new THREE.MeshStandardMaterial({ vertexColors: true, color: new THREE.Color().setScalar(1.35), roughness: 0.75, side: THREE.DoubleSide }),
  }
}

// 山的高度：rim（平台後緣）→ 主峰；邊界外、走不到
const PEAKS = [[222, 172, 176, 52, 36], [186, 160, 128, 30, 24], [262, 165, 140, 32, 26], [212, 205, 162, 50, 28]]   // 一座連在一起的大山：主峰寬、兩側肩膀、後面一道高稜
const rimZ = (x) => YOSE.edge(x) - 4   // 從平台後緣裡面 4 m 開始（藏在岩壁頂面下 0.12 m），才不會在交界露出岩壁背面的黑縫
const rimH = (x) => {
  const inY = x >= YOSE.x0 && x <= YOSE.x1 ? YOSE.topY(x) : -1e9
  return Math.max(inY, alpineHeight(x, YOSE.edge(x) - 2.5))
}
function ridged(x, z) {
  const a = 1 - Math.abs(fbm2(x * 0.018, z * 0.018, 4) * 2 - 1), b = 1 - Math.abs(fbm2(x * 0.06 + 7, z * 0.06 + 3, 3) * 2 - 1)
  return a * 0.7 + b * 0.3
}
// 2026-11-12 ChatGPT（瀑布後山 V5）：四個高斯鐘形疊起來像光滑的圓錐 → 每座峰有 3～5 道放射狀的主稜（稜線之間是往下切的侵蝕溝）、
// 一階一階的岩肩（硬岩層形成的陡壁＋緩台）、南北兩側坡度不一樣、整座山再用低頻雜訊扭一下（輪廓不對稱）
const PK_RIDGE = [[4, 0.4, 2.3], [3, 2.1, 2.0], [5, 1.2, 2.6], [4, 3.3, 1.9]]   // 每座峰：[幾道主稜, 轉幾度, 坡形指數（小＝尖、大＝平頂陡壁）]
function mountain(x0, z0) {
  const wx0 = 9 * (fbm2(x0 * 0.012 + 3, z0 * 0.012, 3) - 0.5), wz0 = 9 * (fbm2(x0 * 0.012, z0 * 0.012 + 8, 3) - 0.5)
  const x = x0 + wx0, z = z0 + wz0
  let h = 12, gul = 0
  PEAKS.forEach(([px, pz, ph, wx, wz], pi) => {
    const [nr, ph0, ex] = PK_RIDGE[pi], dx = (x - px) / wx, dz = (z - pz) / (wz * (z < pz ? 0.82 : 1.3))   // 朝瀑布那面陡、背面緩
    const r0 = Math.sqrt(dx * dx + dz * dz), th = Math.atan2(dz, dx) + 0.5 * (fbm2(x * 0.02 + pi * 7, z * 0.02, 2) - 0.5)
    const rid = 0.5 + 0.5 * Math.cos(th * nr + ph0), rid2 = 0.5 + 0.5 * Math.cos(th * (nr * 2 + 1) + ph0 * 1.7)
    const r = r0 * (1.18 - 0.36 * Math.pow(rid, 1.6) - 0.1 * rid2 * ss(0.3, 1.0, r0))    // 稜線上伸得遠、溝裡縮回來
    const hp = 12 + (ph - 12) * Math.exp(-Math.pow(r, ex) * 0.8)
    if (hp > h) { h = hp; gul = (1 - rid) * ss(0.25, 0.9, r0) * ss(2.2, 1.2, r0) }
  })
  const k = (h - 12) / 150
  // 岩肩：每 17～26 m 一階，硬岩層的地方變陡、上面一段緩
  { const stp = 21 + 6 * (fbm2(x * 0.01 + 5, z * 0.01, 2) - 0.5), u = h / stp, f = u - Math.floor(u), bench = Math.floor(u) + ss(0.25, 0.75, f)
    h = lerp(h, bench * stp, 0.6 * ss(0.12, 0.4, k) * ss(0.35, 0.6, fbm2(x * 0.02 + 9, z * 0.02 + 4, 2) + 0.12)) }
  h -= gul * (5 + 9 * k)                                                             // 侵蝕溝
  h += k * 30 * (ridged(x, z) - 0.55) + 2.5 * (fbm2(x * 0.15, z * 0.15, 2) - 0.5)
  h += k * 7 * (1 - Math.abs(fbm2(x0 * 0.1 + 2, z0 * 0.1 + 6, 3) * 2 - 1) - 0.5)       // 2～4 m 的岩稜、凹槽
  return h
}
export function summitHeight(x, z) {
  const d = z - rimZ(x), rh = rimH(x), M = mountain(x, z)
  const w = ss(166, 182, x) * ss(272, 258, x)
  const bench = rh - 0.12 + 0.7 * ss(3, 10, d) + 1.8 * ss(8, 20, d)            // 平台後面先一小段緩坡草地
  const near = Math.max(bench, lerp(bench, Math.max(bench, M), ss(8, 33, d)))
  let h = lerp(M, near, w)
  // 2026-11-14 山頂湖：湖底往下挖（中間深 2.4 m）、湖岸一圈比水面高 0.12 m 再接回原本的坡；出水小溪挖一條淺溝
  const W = YOSE.slakeW(), lr = YOSE.slakeR(x, z)
  if (lr < 1.6) h = lr < 1 ? W - 0.15 - 2.4 * ss(0.95, 0.25, lr) : lerp(W + 0.12, h, ss(1.0, 1.6, lr))
  const o = YOSE.slakeOutDist(x, z)
  if (o.d < 2.0) { const cy = lerp(W, YOSE.topY(205) + 0.07, o.s) - 0.1; h = Math.min(h, lerp(cy, cy + 0.6, ss(0.6, 2.0, o.d))) }
  return h
}

// 輕量版冷杉樹冠的頂芽在遠處變成一根浮在樹梢上的黑點 → 拿掉（y > 0.93 的那幾片卡）
function noBud(g) {
  const p = g.attributes.position, keep = []
  for (let t = 0; t < p.count; t += 3) if (Math.min(p.getY(t), p.getY(t + 1), p.getY(t + 2)) < 0.93) keep.push(t, t + 1, t + 2)
  const out = new THREE.BufferGeometry()
  for (const [nm, a] of Object.entries(g.attributes)) { const arr = new a.array.constructor(keep.length * a.itemSize); keep.forEach((t, i) => { for (let c = 0; c < a.itemSize; c++) arr[i * a.itemSize + c] = a.array[t * a.itemSize + c] }); out.setAttribute(nm, new THREE.BufferAttribute(arr, a.itemSize)) }
  return out
}
export function buildSummit(scene, kit, lib) {
  const g = new THREE.Group(); g.name = 'summit'; scene.add(g)
  const rnd = mulberry32(7731), m4 = new THREE.Matrix4(), q = new THREE.Quaternion()
  const Q = (yaw, tilt = 0) => new THREE.Quaternion().setFromEuler(new THREE.Euler((rnd() - 0.5) * tilt, yaw, (rnd() - 0.5) * tilt))

  // ---------- 1) 山體 ----------
  const XA = 150, XB = 300, ZE = 222, NX = 120, NU = 96
  const P = new Float32Array((NX + 1) * (NU + 1) * 3), info = []
  for (let i = 0; i <= NX; i++) {
    const x = XA + (XB - XA) * i / NX, z0 = rimZ(x)
    for (let j = 0; j <= NU; j++) {
      const u = j / NU, z = z0 + (ZE - z0) * Math.pow(u, 1.5)
      let h = summitHeight(x, z)
      const ex = Math.min(1, (x - XA) / 18, (XB - x) / 18), ez = Math.min(1, (ZE - z) / 14)
      h = lerp(-25, h, Math.max(0, Math.min(ex, ez)))   // 邊上沉到雲海下面
      const k = (i * (NU + 1) + j) * 3; P[k] = x; P[k + 1] = h; P[k + 2] = z
    }
  }
  const I = []
  for (let i = 0; i < NX; i++) for (let j = 0; j < NU; j++) { const a = i * (NU + 1) + j, b = a + 1, c = a + NU + 1, d = c + 1; I.push(a, b, c, b, d, c) }
  const mg = new THREE.BufferGeometry(); mg.setAttribute('position', new THREE.BufferAttribute(P, 3)); mg.setIndex(I); mg.computeVertexNormals()
  if (mg.attributes.normal.getY(Math.round(NU / 2)) < 0) { for (let t = 0; t < I.length; t += 3) { const s = I[t + 1]; I[t + 1] = I[t + 2]; I[t + 2] = s } mg.setIndex(I); mg.computeVertexNormals() }
  // 頂點色＋aRock：陡的、高的、雜訊打到的露岩；平緩處草地；中間針葉林地（深綠褐）；靠平台那圈青苔多
  const N = mg.attributes.normal, n = P.length / 3, C = new Float32Array(n * 3), R = new Float32Array(n), c = new THREE.Color()
  const forest = new THREE.Color(0.075, 0.095, 0.045), meadow = new THREE.Color(0.2, 0.25, 0.08), moss = new THREE.Color(0.1, 0.17, 0.04), dry = new THREE.Color(0.33, 0.3, 0.16)
  for (let v = 0; v < n; v++) {
    const x = P[v * 3], y = P[v * 3 + 1], z = P[v * 3 + 2], slope = 1 - N.getY(v), nz = fbm2(x * 0.07, z * 0.07, 3), d = z - rimZ(x)
    let rock = Math.min(1, ss(0.4, 0.62, slope + (nz - 0.5) * 0.3) + ss(126, 140, y) * 0.9 + ss(0.72, 0.92, ridged(x, z)) * ss(105, 135, y) * 0.7)
    c.copy(forest).lerp(meadow, ss(0.12, 0.03, slope) * ss(0.35, 0.65, nz)).lerp(meadow, ss(16, 4, d) * 0.7).lerp(dry, ss(0.62, 0.8, nz) * 0.4)
    c.multiplyScalar(0.85 + 0.3 * fbm2(x * 0.3, z * 0.3, 2))
    { const lr = YOSE.slakeR(x, z); if (lr < 1.12) { c.setRGB(0.13, 0.12, 0.075).lerp(new THREE.Color(0.06, 0.1, 0.035), ss(1.12, 0.9, lr) * 0.5); rock = 0 } }   // 湖底：濕泥、青苔
    C.set([c.r, c.g, c.b], v * 3); R[v] = rock
    info.push({ x, y, z, slope, rock, d })
  }
  mg.setAttribute('color', new THREE.BufferAttribute(C, 3)); mg.setAttribute('aRock', new THREE.BufferAttribute(R, 1))
  const mm = graniteMaterial({ scale: 0.12 })
  { const ob = mm.onBeforeCompile
    mm.onBeforeCompile = (sh) => {
      ob(sh)
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aRock; varying float vRock;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvRock = aRock;')
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
        varying float vRock;
        float vnH(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float vn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(vnH(i), vnH(i + vec2(1, 0)), f.x), mix(vnH(i + vec2(0, 1)), vnH(i + vec2(1, 1)), f.x), f.y); }
        float vfbm(vec2 p) { return vn(p) * 0.55 + vn(p * 2.3 + 7.1) * 0.3 + vn(p * 5.1 + 3.7) * 0.15; }`).replace('#include <color_fragment>', `
        { /* 2026-11-12 使用者「前後山都改一樣材質，不然後面是灰色的山」：灰花崗岩 → 跟瀑布岩壁一樣的砂岩（暖米褐、一層層水平的岩層） */
          vec3 rockC = diffuseColor.rgb * vec3(0.58, 0.43, 0.255) * (0.75 + 0.5 * dot(tpL.rgb, vec3(0.33)));
          { /* 岩層：厚薄差很多（0.6～3 m）；一塊塊斷層把橫紋錯開 1～4 m；約四分之一的面積是塊狀、看不出層理；直的裂隙和侵蝕溝把橫帶切斷 */
            vec2 fb = floor(vec2(vTpW.x + vTpW.z * 0.35 + 6.0 * vfbm(vTpW.xz * 0.03), vTpW.z - vTpW.x * 0.2) / vec2(19.0, 31.0));
            float flt = (vnH(fb) - 0.5) * 7.0;
            float yb = vTpW.y + 0.1 * (vTpW.x - 195.0) + flt + 3.0 * vfbm(vTpW.xz * 0.035) + 0.6 * vfbm(vTpW.xz * 0.3);
            float thick = 0.45 + 1.1 * vn(vec2(yb * 0.11, 3.7));
            float band = vfbm(vec2(yb * thick, floor(yb / 9.0) * 3.1 + 2.2));
            float massive = smoothstep(0.52, 0.68, vfbm(vTpW.xz * 0.028 + vec2(4.0, vTpW.y * 0.01)));
            rockC *= mix(0.5 + 0.85 * smoothstep(0.25, 0.75, band), 0.92 + 0.12 * vfbm(vTpW.xz * 0.5 + vTpW.y * 0.4), massive);
            float crack = vfbm(vec2((vTpW.x + vTpW.z * 0.6) * 0.75, vTpW.y * 0.06 + 2.0)), crack2 = vfbm(vec2((vTpW.x - vTpW.z) * 0.22, vTpW.y * 0.03 + 9.0));
            rockC *= 1.0 - 0.42 * smoothstep(0.66, 0.74, crack) - 0.3 * smoothstep(0.6, 0.72, crack2);
            rockC *= 0.82 + 0.36 * vfbm(vec2(vTpW.x + vTpW.z, vTpW.y * 1.3) * 0.3); }
          // 花崗岩面：一條條往下流的黑色水痕、橫的節理（深一點的帶）、偶爾鐵鏽色
          float streak = vfbm(vec2((vTpW.x + vTpW.z) * 0.22, vTpW.y * 0.015));
          rockC *= 1.0 - 0.3 * smoothstep(0.55, 0.75, streak);
          rockC *= 0.85 + 0.3 * vfbm(vec2((vTpW.x - vTpW.z) * 0.05, vTpW.y * 0.35));
          rockC = mix(rockC, rockC * vec3(1.15, 0.95, 0.75), smoothstep(0.7, 0.85, vfbm(vTpW.xz * 0.08 + 9.0)) * 0.6);
          vec3 gnd = vColor.rgb * (0.8 + 0.45 * dot(tpL.rgb, vec3(0.33)));
          float rk = smoothstep(0.35, 0.65, vRock + (dot(tpL.rgb, vec3(0.33)) - 0.45) * 0.5);
          diffuseColor.rgb = mix(gnd, rockC, rk); }`)
    }
    mm.customProgramCacheKey = () => 'summitMassifSand3' }
  const massif = new THREE.Mesh(mg, mm); massif.name = 'summitMassif'; massif.receiveShadow = true; massif.castShadow = true; g.add(massif)

  // 山上的針葉林：冷杉卡片樹冠（輕量版）＋深色芯＋樹幹；林線 130 m，露岩、太陡的地方不長；有一塊塊林間空地
  {
    const trees = []
    for (let k = 0; k < 60000 && trees.length < 1350; k++) {
      const v = info[Math.floor(rnd() * info.length)], x = v.x + (rnd() - 0.5) * 1.3, z = v.z + (rnd() - 0.5) * 1.1
      if (v.y < 26 || v.y > 130 + 8 * fbm2(v.x * 0.05, v.z * 0.05, 2) || v.d < 9) continue
      // 2026-11-12 ChatGPT：樹林到裸岩一條線切斷 → 露岩邊上 10～20 m 零星長幾棵小的（岩縫裡的矮樹），真正的陡壁還是光的
      const edge = v.rock > 0.35 || v.slope > 0.68
      if (edge && (v.rock > 0.8 || v.slope > 0.84 || rnd() > 0.1)) continue
      if (!edge && fbm2(x * 0.035 + 11, z * 0.035, 3) < 0.38 && rnd() < 0.85) continue   // 林間空地
      if (YOSE.slakeR(x, z) < 1.75 || YOSE.slakeOutDist(x, z).d < 3.2) continue   // 山頂湖、出水小溪
      if (trees.some((t) => Math.abs(t.x - x) < 2.6 && Math.abs(t.z - z) < 2.6)) continue
      const H = edge ? 3.5 + rnd() * 4.5 : (v.y > 118 ? 7 : 11) + rnd() * 9
      trees.push({ x, z, y: summitHeight(x, z) - 0.3, H, w: 0.75 + rnd() * 0.35, c: rnd() })
    }
    const crown = noBud(coniferGeo('fir', 14)), trunk = new THREE.CylinderGeometry(0.006, 0.026, 0.86, 6).translate(0, 0.43, 0)
    const core = new THREE.ConeGeometry(0.085, 0.76, 8, 1, true).translate(0, 0.5, 0)
    const mats = [needleMaterial(), new THREE.MeshStandardMaterial({ color: 0x5a4636, roughness: 0.95 }), new THREE.MeshStandardMaterial({ color: 0x1f3522, roughness: 1 })]
    ;[crown, trunk, core].forEach((geo, gi) => {
      const im = new THREE.InstancedMesh(geo, mats[gi], trees.length)
      trees.forEach((t, i) => { im.setMatrixAt(i, m4.compose(V(t.x, t.y, t.z), q.setFromAxisAngle(V(0, 1, 0), t.c * 40), V(t.H * t.w, t.H, t.H * t.w))); if (gi === 0) im.setColorAt(i, c.setHSL(0.27 + (t.c - 0.5) * 0.06, 0.22 + t.c * 0.15, 0.62 + t.c * 0.25)) })
      im.castShadow = gi !== 1; im.receiveShadow = true; im.computeBoundingSphere(); g.add(im)
    })
  }
  // （山腰的大塊掃描岩石拿掉：陡坡上一半懸空；露岩改在山體 shader 裡畫）

  // ---------- 2) 平台＋山腳那一圈：草地、青苔岩塊、青苔墊、草叢、蕨類 ----------
  const st = YOSE.stairs(), exitP = st.pts.at(-1), SH = { x: 209, z: 102 }
  // 踩出來的小徑：石階出口 → 涼亭 → 瀑布口觀景台（不長草）
  const PATH = [st.pts.at(-10), st.pts.at(-6), [exitP[0], exitP[1]], [exitP[0] - 2, YOSE.topFront(exitP[0] - 2) + 2.5], [226, YOSE.topFront(226) + 2.6], [SH.x + 3, SH.z - 1.2], [SH.x - 3, SH.z - 1.8], [205, YOSE.topFront(205) + 1.5]]
  const pathDist = (x, z) => { let b = 1e9; for (let i = 1; i < PATH.length; i++) { const [ax, az] = PATH[i - 1], [bx, bz] = PATH[i], dx = bx - ax, dz = bz - az, t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz))); b = Math.min(b, Math.hypot(x - ax - dx * t, z - az - dz * t)) } return b }
  const onTop = (x, z) => x > 201.5 && x < 250 && z > YOSE.topFront(x) + 0.4 && z < YOSE.edge(x) - 0.3
  // 平台上的溪（yosemite.js：沿 edge-6.5 往西流到瀑布口、上游一個潭）不長草
  const inCreek = (x, z) => (x > 200 && x < 243 && Math.abs(z - (YOSE.edge(x) - 6.5 + 1.2 * Math.min(1, Math.max(0, (x - 211) / 3)))) < 1.7) || Math.hypot((x - 241) / 4.4, (z - 120.1) / 3.0) < 1 || (x > 196 && x < 205 && z < 102.5 && z > YOSE.base(200))
  const free = (x, z) => YOSE.slakeR(x, z) > 1.06 && YOSE.slakeOutDist(x, z).d > 1.1 && !(Math.abs(x - SH.x) < 2.7 && Math.abs(z - SH.z) < 3.0) && pathDist(x, z) > 0.75 && alpineStreamDist(x, z) > 1.2 && !inCreek(x, z)
  const groundY = (x, z) => onTop(x, z) && z < YOSE.edge(x) - 1.2 ? YOSE.topY(x) + 0.05 : summitHeight(x, z)
  // 平台以外、山腳那圈也鋪（rim 後面 0～14 m）
  const sample = () => {
    const x = 196 + rnd() * 58
    if (rnd() < 0.62) { const zf = YOSE.topFront(x) + 0.4, ze = YOSE.edge(x) - 0.3; return [x, zf + rnd() * Math.max(0, ze - zf)] }
    return [x, rimZ(x) + rnd() * 14]
  }
  const ok = (x, z) => (onTop(x, z) || (z > rimZ(x) && z < rimZ(x) + 15)) && free(x, z)
  { // 草地：花園那套草葉（細、密）
    const A = [], B = [], cc = new THREE.Color()
    for (let k = 0; k < 160000 && A.length / 4 < 42000; k++) {
      const [x, z] = sample()
      if (!ok(x, z)) continue
      const nz = fbm2(x * 0.4, z * 0.4, 2)
      if (nz < 0.36 && rnd() < 0.7) continue   // 一塊塊稀疏、露出地面
      cc.setHSL(0.2 + nz * 0.07 + (rnd() - 0.5) * 0.03, 0.42, 0.2 + rnd() * 0.08)
      if (rnd() < 0.18) cc.lerp(new THREE.Color(0.55, 0.5, 0.3), 0.5)
      A.push(x, groundY(x, z) - 0.02, z, rnd() * TAU)
      B.push(cc.r, cc.g, cc.b, 0.12 + rnd() * 0.22 + Math.max(0, nz - 0.5) * 0.4)
    }
    if (A.length) { const gm = bladeMesh(A, B, { width: [0.006, 0.008] }); gm.frustumCulled = false; g.add(gm) }
  }
  const place = (name, list) => { if (!list.length || !kit.geo[name]) return; const mat = name.startsWith('mrockm') ? kit.rockM : name.startsWith('moss') ? kit.mossM : kit.grassM; const im = new THREE.InstancedMesh(kit.geo[name], mat, list.length); list.forEach((t, i) => im.setMatrixAt(i, m4.compose(t.p, t.q, t.s))); im.castShadow = !name.startsWith('grass'); im.receiveShadow = true; im.computeBoundingSphere(); g.add(im) }
  const L = {}; const push = (name, item) => (L[name] ||= []).push(item)
  for (let k = 0, nr = 0, np = 0, ng = 0; k < 20000 && (nr < 34 || np < 70 || ng < 260); k++) {
    const [x, z] = sample()
    if (!ok(x, z)) continue
    const y = groundY(x, z), r = rnd()
    if (nr < 34 && r < 0.12) {
      const S = 0.45 + Math.pow(rnd(), 1.6) * 1.5; if (pathDist(x, z) < 1.3 + S) continue
      push('mrockm_' + Math.floor(rnd() * 4), { p: V(x, y - 0.06 * S, z), q: Q(rnd() * TAU, 0.2), s: V(S, S * (0.8 + rnd() * 0.4), S) })
      if (S > 0.7) addCollider(x, z, 0.75 * S, y + 0.6 * S, y - 1.5)   // 2026-11-12 加底：沒有底的碰撞體把正下方的崖壁步道也擋住
      // 岩塊腳邊：一圈青苔墊、草
      for (let j = 0; j < 3; j++) { const a = rnd() * TAU, rr = S * (0.9 + rnd() * 0.4); push('grass_' + Math.floor(rnd() * 3), { p: V(x + Math.cos(a) * rr, y - 0.02, z + Math.sin(a) * rr), q: Q(rnd() * TAU), s: V(1, 1, 1).multiplyScalar(0.8 + rnd() * 0.6) }) }
      nr++
    } else if (np < 70 && r < 0.4) {
      const S = 0.6 + rnd() * 0.9; push('mosspad_' + Math.floor(rnd() * 3), { p: V(x, y - 0.03, z), q: Q(rnd() * TAU), s: V(S, S * (0.7 + rnd() * 0.6), S) }); np++
    } else if (ng < 260) {
      push('grass_' + Math.floor(rnd() * 3), { p: V(x, y - 0.02, z), q: Q(rnd() * TAU, 0.15), s: V(1, 1, 1).multiplyScalar(0.8 + rnd() * 0.8) }); ng++
    }
  }
  // 蕨類：岩塊、樹下那種背陰處
  if (lib) {
    const ferns = ['fern_sa', 'fern_sb', 'fern2_b', 'fern2_c', 'fern_a'].filter((nm) => lib[nm]), fl = {}
    for (let k = 0, nf = 0; k < 4000 && nf < 46 && ferns.length; k++) {
      const [x, z] = sample()
      if (!ok(x, z) || fbm2(x * 0.2, z * 0.2, 2) < 0.48) continue
      ;(fl[ferns[Math.floor(rnd() * ferns.length)]] ||= []).push({ p: V(x, groundY(x, z) - 0.05, z), q: Q(rnd() * TAU), s: V(1, 1, 1).multiplyScalar(0.7 + rnd() * 0.6) }); nf++
    }
    for (const [nm, list] of Object.entries(fl)) scatter(g, lib[nm], list, { cast: true })
  }

  // ---------- 3) 石階：牆腳的青苔、草、蕨類 ----------（2026-11-12 之字形石階拆掉了，這段不跑；新步道的植栽在 yosemite.js）
  if (false) {
    const M = YOSE.mist, stepTop = (k, x) => Math.floor(st.legH(k, x) / 0.2) * 0.2 + 0.2
    const fernN = lib ? ['fern_sa', 'fern_sb', 'fern2_b'].filter((nm) => lib[nm]) : [], fl = {}
    for (let k = 0; k < M.NL; k++) {
      for (let x = M.XA + 1.8; x < M.XB - 1.8; x += 0.35 + rnd() * 0.5) {
        const zc = st.zAt(x, k), y = stepTop(k, x), r = rnd()
        // 內側（靠上一層平台的石壁，+z）牆腳
        const zi = zc + M.W / 2 - 0.25 - rnd() * 0.2
        if (r < 0.42) { const S = 0.35 + rnd() * 0.5; push('mosspad_' + Math.floor(rnd() * 3), { p: V(x, y - 0.03, zi), q: Q(rnd() * TAU), s: V(S, S * (0.8 + rnd() * 0.7), S * 0.8) }) }
        else if (r < 0.8) push('grass_' + Math.floor(rnd() * 3), { p: V(x, y - 0.02, zi), q: Q(rnd() * TAU, 0.2), s: V(1, 1, 1).multiplyScalar(0.6 + rnd() * 0.6) })
        else if (fernN.length && r < 0.9) (fl[fernN[Math.floor(rnd() * fernN.length)]] ||= []).push({ p: V(x, y - 0.05, zi + 0.1), q: Q(rnd() * TAU), s: V(1, 1, 1).multiplyScalar(0.45 + rnd() * 0.35) })
        // 外側矮牆腳：零星的草、小青苔
        if (rnd() < 0.22) push(rnd() < 0.6 ? 'grass_1' : 'mosspad_1', { p: V(x, y - 0.02, zc - M.W / 2 + 0.55), q: Q(rnd() * TAU), s: V(1, 1, 1).multiplyScalar(0.5 + rnd() * 0.4) })
        // 踏板中間偶爾一小撮（踏面跟踏面之間的縫）
        if (rnd() < 0.07) push('grass_1', { p: V(x, y - 0.03, zc + (rnd() - 0.5) * 2), q: Q(rnd() * TAU), s: V(0.5, 0.4, 0.5) })
      }
    }
    for (const [nm, list] of Object.entries(fl)) scatter(g, lib[nm], list, { cast: true })
  }
  // ---------- 4) 山頂湖（2026-11-14）：湖面＋湖岸的石頭、青苔、蕨、草 ----------
  {
    const LK = YOSE.slake, W = YOSE.slakeW(), NA = 120, NR = 14, Pp = [], Cc = [], Ii = []
    const shape = (th) => 1 + 0.13 * Math.sin(3 * th + 1) + 0.07 * Math.sin(5 * th + 2.3)
    for (let j = 0; j <= NR; j++) for (let a = 0; a < NA; a++) {
      const th = a / NA * TAU, r = (j / NR) * 1.04 * shape(th), x = LK.x + Math.cos(th) * LK.rx * r, z = LK.z + Math.sin(th) * LK.rz * r
      Pp.push(x, W, z)
      const k = ss(0.25, 1.0, j / NR)   // 0＝湖心（深）、1＝岸邊（淺、看得到湖底）
      Cc.push(lerp(0.02, 0.2, k), lerp(0.16, 0.36, k), lerp(0.15, 0.28, k), lerp(0.96, 0.5, k))
    }
    for (let j = 0; j < NR; j++) for (let a = 0; a < NA; a++) { const i0 = j * NA + a, i1 = j * NA + (a + 1) % NA; Ii.push(i0, i0 + NA, i1, i1, i0 + NA, i1 + NA) }
    const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(Pp, 3)); lg.setAttribute('color', new THREE.Float32BufferAttribute(Cc, 4)); lg.setIndex(Ii); lg.computeVertexNormals()
    { const nrm = lg.attributes.normal; if (nrm.getY(0) < 0) { for (let t = 0; t < Ii.length; t += 3) { const s2 = Ii[t + 1]; Ii[t + 1] = Ii[t + 2]; Ii[t + 2] = s2 } lg.setIndex(Ii); lg.computeVertexNormals() } }
    const uvA = new Float32Array(Pp.length / 3 * 2); for (let v = 0; v < Pp.length / 3; v++) { uvA[v * 2] = Pp[v * 3] * 0.09; uvA[v * 2 + 1] = Pp[v * 3 + 2] * 0.09 } lg.setAttribute('uv', new THREE.BufferAttribute(uvA, 2))
    const nt = waterNormalTex()
    const lm = new THREE.MeshStandardMaterial({ vertexColors: true, transparent: true, roughness: 0.04, metalness: 0.0, normalMap: nt, normalScale: new THREE.Vector2(0.18, 0.18), envMapIntensity: 1.6, depthWrite: false })
    const lake = new THREE.Mesh(lg, lm); lake.name = 'summitLake'; lake.renderOrder = 3; lake.receiveShadow = false   /* 湖面收影子會在陰影快取的格子邊界切出一條直線 */
    lake.onBeforeRender = () => { const t = performance.now() * 0.001; nt.offset.set(t * 0.006, t * 0.0035) }
    g.add(lake)
    // 湖岸：大小石頭一圈（出水口留開）、石頭腳邊青苔墊和草、北岸（背陰、靠山）多蕨類
    const out0 = YOSE.slakeOut[0], aOut = Math.atan2((out0[1] - LK.z) / LK.rz, (out0[0] - LK.x) / LK.rx)
    for (let i = 0, n = 0; i < 400 && n < 70; i++) {
      const th = rnd() * TAU; if (Math.abs(Math.atan2(Math.sin(th - aOut), Math.cos(th - aOut))) < 0.22) continue
      const r = (0.98 + rnd() * 0.16) * shape(th), x = LK.x + Math.cos(th) * LK.rx * r, z = LK.z + Math.sin(th) * LK.rz * r, y = summitHeight(x, z), u = rnd()
      if (u < 0.45) { const S = 0.35 + Math.pow(rnd(), 1.8) * 1.3; push('mrockm_' + Math.floor(rnd() * 4), { p: V(x, Math.min(y, W + 0.1) - 0.12 * S, z), q: Q(rnd() * TAU, 0.25), s: V(S, S * (0.6 + rnd() * 0.4), S) }) }
      else if (u < 0.7) { const S = 0.5 + rnd() * 0.7; push('mosspad_' + Math.floor(rnd() * 3), { p: V(x, y - 0.03, z), q: Q(rnd() * TAU), s: V(S, S * 0.8, S) }) }
      else push('grass_' + Math.floor(rnd() * 3), { p: V(x, y - 0.02, z), q: Q(rnd() * TAU, 0.15), s: V(1, 1, 1).multiplyScalar(0.9 + rnd() * 0.8) })
      n++
    }
    // 出水小溪兩岸
    for (let i = 0; i < 26; i++) { const P = YOSE.slakeOut, k = Math.floor(rnd() * (P.length - 1)), t = rnd(), x0 = lerp(P[k][0], P[k + 1][0], t), z0 = lerp(P[k][1], P[k + 1][1], t), sd = rnd() < 0.5 ? -1 : 1, x = x0 + sd * (1.0 + rnd() * 0.8), z = z0 + (rnd() - 0.5) * 0.6
      const top = z < YOSE.edge(x) - 1.2, y = top ? YOSE.topY(x) + 0.05 : summitHeight(x, z), S = 0.3 + rnd() * 0.6
      push(rnd() < 0.5 ? 'mrockm_' + Math.floor(rnd() * 4) : 'mosspad_' + Math.floor(rnd() * 3), { p: V(x, y - 0.1 * S, z), q: Q(rnd() * TAU, 0.2), s: V(S, S * 0.7, S) }) }
    if (lib) {
      const ferns = ['fern_sa', 'fern_sb', 'fern2_b', 'fern2_c', 'fern_a'].filter((nm) => lib[nm]), fl = {}
      for (let i = 0, n = 0; i < 300 && n < 40 && ferns.length; i++) {
        const th = rnd() * TAU, north = Math.sin(th) > -0.2; if (!north && rnd() < 0.7) continue
        const r = (1.08 + rnd() * 0.3) * shape(th), x = LK.x + Math.cos(th) * LK.rx * r, z = LK.z + Math.sin(th) * LK.rz * r
        if (YOSE.slakeOutDist(x, z).d < 1.3) continue
        ;(fl[ferns[Math.floor(rnd() * ferns.length)]] ||= []).push({ p: V(x, summitHeight(x, z) - 0.05, z), q: Q(rnd() * TAU), s: V(1, 1, 1).multiplyScalar(0.7 + rnd() * 0.7) }); n++
      }
      for (const [nm, list] of Object.entries(fl)) scatter(g, lib[nm], list, { cast: true })
    }
  }
  // ---------- 5) 瀑布步道的地面青苔（2026-11-14 使用者「地面要有青苔」；概念圖 docs/GORGE_WALLS_SPEC.txt）：
  // 靠岩壁那側的牆腳一路青苔墊、偶爾一叢草；踏階外側（欄杆那邊）零星幾塊；越靠瀑布越密。踏面中間不放（被踩的地方）
  {
    const T = YOSE.stairs(), F = YOSE.fall
    let acc = 0
    for (let i = 1; i < T.pts.length; i++) {
      const k = T.kind[i]; if (k !== 'gal' && k !== 'open' && k !== 'alc') continue
      const [ax, az] = T.pts[i - 1], [bx, bz] = T.pts[i], d = Math.hypot(bx - ax, bz - az); acc += d
      if (acc < 0.55) continue; acc = 0
      const wetK = Math.exp(-(((bx - F.x) / 24) ** 2)), y = T.yy[i]
      const tx = (bx - ax) / (d || 1), tz = (bz - az) / (d || 1)
      const nx = 0, nz = 1   // 岩壁的槽是照 z 切的：牆在同一個 x 往 +z 1.25 m
      const step = (T.yy[i] - T.yy[i - 1]) / (d || 1) > 0.05, yTop = step ? Math.floor(y / 0.16) * 0.16 + 0.1 : y + 0.02
      if (rnd() < 0.55 + 0.35 * wetK) { const S = 0.4 + rnd() * 0.4, o = 0.82 + rnd() * 0.15
        push('mosspad_' + Math.floor(rnd() * 3), { p: V(bx + nx * o, yTop - 0.06, bz + nz * o), q: Q(rnd() * TAU, 0.1), s: V(S * 1.3, S * 0.55, S * 0.8) }) }
      if (rnd() < 0.18 + 0.2 * wetK) push('grass_' + Math.floor(rnd() * 3), { p: V(bx + nx * 0.95, yTop - 0.02, bz + nz * 0.95), q: Q(rnd() * TAU, 0.15), s: V(1, 1, 1).multiplyScalar(0.5 + rnd() * 0.4) })
      if (false) { const S = 0.3 + rnd() * 0.35; push('mosspad_' + Math.floor(rnd() * 3), { p: V(bx - nx * 1.05, yTop - 0.05, bz - nz * 1.05), q: Q(rnd() * TAU, 0.1), s: V(S, S * 0.5, S) }) }
    }
  }
  for (const [nm, list] of Object.entries(L)) place(nm, list)
  return g
}
