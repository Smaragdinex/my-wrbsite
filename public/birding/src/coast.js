// 第三館：海岸。圓頂南門 → 玻璃通道（緩衝室兩道自動門）→ 一棟透明玻璃館蓋在海邊：北半邊沙丘（海灘松、濱草、海濱植物）、
// 木棧道穿過沙丘到沙灘，沙灘上有漂流木、海草、貝殼，西邊是伸進海裡的岩石岬角，東邊一排防波木樁走進海裡；館的南半邊是淺水潟湖，
// 玻璃外面整片都是海，一直到地平線（館外的海是外殼的一部分，從圓頂也看得到）。
// 美術：NatureManufacture「Coast Dunes Environment」（Unity Asset Store，跟《淨灘大作戰》同一套），抽出模型＋貼圖轉成 models/coast/coast.glb
// （一個模型一個節點，原點在底部中心；轉檔流程見 README）。地形、木棧道、走路規則在 layout.js。
import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js'
import { CST, CCORR, BOARDWALK, COAST_GRID, COAST_HEIGHTS, coastHeight, coastShoreZ, boardwalkAt, coastDoors, addCollider } from './layout.js'
import { scatter } from './plants.js'
import { mulberry32, fbm2 } from './noise.js'

const VER = new URL(import.meta.url).searchParams.get('v') ?? ''
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z)
const TAU = Math.PI * 2
const { clamp } = THREE.MathUtils
const ss = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t) }
const ZM = (CST.Z0 + CST.Z1) / 2
const waveTime = { value: 0 }

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

/* ---------- 海水材質：浪（只有館裡那片細的網格看得出起伏）、淺水透明、海岸線白浪 ---------- */
function seaMaterial() {
  const m = new THREE.MeshStandardMaterial({ color: 0x2f6f86, roughness: 0.08, metalness: 0.15, transparent: true, depthWrite: false })
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uT = waveTime
    const common = `
      uniform float uT;
      varying vec3 vSeaW;
      float shoreZ(float x) { return -128.0 + 5.0 * sin(x * 0.07) + 2.0 * sin(x * 0.19 + 1.0); }
      // 海水深度：館裡照 layout.js 的海岸坡度（水裡每往外 1 公尺深 7 公分）；館外當成深海
      float seaDepth(vec2 p) { bool inHall = abs(p.x) < ${CST.HX.toFixed(1)} && p.y < ${CST.Z0.toFixed(1)} && p.y > ${CST.Z1.toFixed(1)}; return inHall ? max(0.0, (shoreZ(p.x) - p.y) * 0.07) : 8.0; }`
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>' + common)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vec3 wp0 = (modelMatrix * vec4(transformed, 1.0)).xyz;
        float dp = seaDepth(wp0.xz);
        // 往岸邊推的長浪＋斜的小浪；越淺浪越陡、越高（到岸邊才消掉）
        float k = clamp(dp / 1.2, 0.0, 1.0);
        float w = sin((wp0.z - shoreZ(wp0.x)) * 0.55 + uT * 1.5) * 0.09 * mix(1.6, 1.0, k) * smoothstep(0.0, 0.15, dp)
                + sin(wp0.x * 0.31 + wp0.z * 0.23 - uT * 1.1) * 0.04;
        transformed.y += w;`)
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvSeaW = (modelMatrix * vec4(transformed, 1.0)).xyz;')
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>' + common)
      .replace('#include <color_fragment>', `#include <color_fragment>
        float dp = seaDepth(vSeaW.xz), dz = vSeaW.z - shoreZ(vSeaW.x);
        // 淺水偏綠、透明；深水深藍
        diffuseColor.rgb = mix(vec3(0.42, 0.66, 0.62), diffuseColor.rgb, smoothstep(0.0, 1.6, dp));
        diffuseColor.a = mix(0.25, 0.94, smoothstep(0.02, 1.2, dp));
        // 白浪：往岸邊推進的浪頭（越接近岸邊越白），加上岸邊來回的沖刷線
        float crest = smoothstep(0.82, 1.0, sin(dz * 0.55 + uT * 1.5)) * smoothstep(-16.0, -2.0, dz) * step(dp, 4.0);
        float swash = smoothstep(-2.2, -0.2, dz + 0.6 * sin(uT * 0.9 + vSeaW.x * 0.1)) * (1.0 - smoothstep(-0.2, 0.3, dz + 0.6 * sin(uT * 0.9 + vSeaW.x * 0.1)));
        float n = fract(sin(dot(floor(vSeaW.xz * 6.0), vec2(12.9898, 78.233))) * 43758.5453);
        float foam = clamp(crest * (0.55 + 0.45 * n) + swash * 0.9, 0.0, 1.0);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.95, 0.97, 0.97), foam);
        diffuseColor.a = max(diffuseColor.a, foam * 0.95);`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        // 小波紋：法線抖一下（反光一閃一閃）
        normal = normalize(normal + vec3(sin(vSeaW.x * 1.7 + uT * 2.0) * 0.06 + sin(vSeaW.z * 2.3 - uT * 1.4) * 0.05, 0.0, cos(vSeaW.z * 1.9 + uT * 1.7) * 0.06));`)
  }
  m.customProgramCacheKey = () => 'coastSea'
  return m
}

/* ---------- 外殼：通道、緩衝室、館的鋼構和玻璃、館外的海 ---------- */
function buildShell() {
  const g = new THREE.Group(); g.name = 'coastShell'
  const steel = new THREE.MeshStandardMaterial({ color: 0xf2f4f5, roughness: 0.45, metalness: 0.5 })
  const alu = new THREE.MeshStandardMaterial({ color: 0x3c4246, roughness: 0.35, metalness: 0.8 })
  const glassM = new THREE.MeshStandardMaterial({ color: 0xcfe4ea, transparent: true, opacity: 0.12, roughness: 0.04, metalness: 0.1, side: THREE.DoubleSide, depthWrite: false })
  const geos = { steel: [], alu: [] }
  // 通道（沿 z）：人字屋頂、兩側玻璃
  const { Z0, Z1, W } = CCORR, EAVE = 3.2, RIDGE = 4.2, L = Z0 - Z1
  const posts = [Z0, Z0 - L / 3, Z0 - 2 * L / 3, Z1]
  for (const z of posts) for (const x of [-W, W]) bar(geos.steel, V(x, 0, z), V(x, EAVE, z), 0.22)
  for (const x of [-W, W]) bar(geos.steel, V(x, EAVE, Z0), V(x, EAVE, Z1), 0.28, 0.2)
  for (const z of posts) { bar(geos.steel, V(-W, EAVE, z), V(0, RIDGE, z), 0.24, 0.18); bar(geos.steel, V(W, EAVE, z), V(0, RIDGE, z), 0.24, 0.18) }
  bar(geos.steel, V(0, RIDGE, Z0), V(0, RIDGE, Z1), 0.18)
  for (const x of [-W, W]) {
    geos.steel.push(new THREE.BoxGeometry(0.12, 0.3, L).translate(x, 0.15, (Z0 + Z1) / 2))
    quad([V(x, 0.3, Z0), V(x, 0.3, Z1), V(x, EAVE, Z1), V(x, EAVE, Z0)], glassM, g)
    for (let z = Z0 - 1.2; z > Z1; z -= 1.2) bar(geos.alu, V(x, 0.3, z), V(x, EAVE, z), 0.05)
  }
  for (const s of [-1, 1]) quad([V(s * W, EAVE, Z0), V(s * W, EAVE, Z1), V(0, RIDGE, Z1), V(0, RIDGE, Z0)], glassM, g)
  const floor = new THREE.Mesh(new THREE.BoxGeometry(W * 2, 0.08, L + 1), new THREE.MeshStandardMaterial({ color: 0xd9d6cf, roughness: 0.6 }))
  floor.position.set(0, 0, (Z0 + Z1) / 2); floor.receiveShadow = true; g.add(floor)
  // 緩衝室：A、B 兩道玻璃自動門（兩片往兩邊 x 滑）
  const doors = {}
  for (const [k, z] of [['a', CCORR.A], ['b', CCORR.B]]) {
    bar(geos.alu, V(-W, 2.6, z), V(W, 2.6, z), 0.22, 0.16)
    for (const x of [-W, W]) bar(geos.alu, V(x * 0.97, 0, z), V(x * 0.97, 2.6, z), 0.1)
    quad([V(-W, 2.7, z), V(W, 2.7, z), V(W, EAVE, z), V(0, RIDGE, z), V(-W, EAVE, z)], glassM, g)
    const panels = [-1, 1].map((s) => {
      const p = new THREE.Group()
      const gl = new THREE.Mesh(new THREE.BoxGeometry(W - 0.05, 2.5, 0.03), glassM); gl.renderOrder = 6; p.add(gl)
      const fr = new THREE.Mesh(new THREE.BoxGeometry(0.06, 2.5, 0.06), alu); fr.position.x = -s * (W - 0.05) / 2; p.add(fr)
      p.position.set(s * (W / 2 - 0.02), 1.27, z); g.add(p)
      return { p, s }
    })
    doors[k] = { panels, z, open: 0 }
  }
  // 館：x ±40、z -74～-154；簷高 14、屋脊 22；10 公尺一榀；透明玻璃（看得到外面的海）
  const { Z0: H0, Z1: H1, HX, H } = CST, HE = 14
  for (let z = H0; z >= H1 - 0.01; z -= 10) {
    for (const x of [-HX, HX]) bar(geos.steel, V(x, 0, z), V(x, HE, z), 0.45)
    bar(geos.steel, V(-HX, HE, z), V(0, H, z), 0.6, 0.4); bar(geos.steel, V(HX, HE, z), V(0, H, z), 0.6, 0.4)
  }
  for (const x of [-HX, HX]) { bar(geos.steel, V(x, HE, H0), V(x, HE, H1), 0.45, 0.35); bar(geos.alu, V(x, 6, H0), V(x, 6, H1), 0.1) }
  bar(geos.steel, V(0, H, H0), V(0, H, H1), 0.35)
  for (const z of [H0, H1]) for (let x = -HX + 10; x < HX; x += 10) bar(geos.steel, V(x, -1, z), V(x, HE + (H - HE) * (1 - Math.abs(x) / HX), z), 0.35)
  for (const x of [-HX, HX]) quad([V(x, -2, H0), V(x, -2, H1), V(x, HE, H1), V(x, HE, H0)], glassM, g)
  for (const s of [-1, 1]) quad([V(s * HX, HE, H0), V(s * HX, HE, H1), V(0, H, H1), V(0, H, H0)], glassM, g)
  quad([V(-HX, -2, H1), V(HX, -2, H1), V(HX, HE, H1), V(0, H, H1), V(-HX, HE, H1)], glassM, g)
  // 北牆（入口那面）中間留通道開口：拆成凸的幾塊
  quad([V(W, 0, H0), V(HX, 0, H0), V(HX, HE, H0), V(W, HE, H0)], glassM, g)
  quad([V(-HX, 0, H0), V(-W, 0, H0), V(-W, HE, H0), V(-HX, HE, H0)], glassM, g)
  quad([V(-W, RIDGE + 0.4, H0), V(W, RIDGE + 0.4, H0), V(W, HE, H0), V(-W, HE, H0)], glassM, g)
  quad([V(-HX, HE, H0), V(HX, HE, H0), V(0, H, H0)], glassM, g)
  // 館名＋通道指標
  const signT = canvasTex(1024, 256, (x, w, h) => {
    x.fillStyle = '#1d5a7a'; x.fillRect(0, 0, w, h); x.fillStyle = '#f4f6f2'; x.textAlign = 'center'; x.textBaseline = 'middle'
    x.font = 'bold 120px "PingFang TC", "Noto Sans TC", sans-serif'; x.fillText('海岸沙丘', w / 2, h * 0.42)
    x.font = '600 46px "Helvetica Neue", Arial, sans-serif'; x.fillText('COASTAL DUNES', w / 2, h * 0.82)
  })
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(8, 2), new THREE.MeshStandardMaterial({ map: signT, emissive: 0xffffff, emissiveMap: signT, emissiveIntensity: 0.3 }))
  sign.position.set(0, 6.8, H0 + 0.3); g.add(sign)
  const tagT = canvasTex(512, 128, (x, w, h) => { x.fillStyle = '#1d5a7a'; x.fillRect(0, 0, w, h); x.fillStyle = '#fff'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.font = 'bold 56px "PingFang TC", sans-serif'; x.fillText('↓ 海岸沙丘', w / 2, h / 2) })
  const tag = new THREE.Mesh(new THREE.PlaneGeometry(2, 0.5), new THREE.MeshStandardMaterial({ map: tagT, emissive: 0xffffff, emissiveMap: tagT, emissiveIntensity: 0.4 }))
  tag.position.set(0, EAVE - 0.5, Z0 - 0.6); g.add(tag)
  for (const [k, m] of [['steel', steel], ['alu', alu]]) { const mesh = new THREE.Mesh(mergeGeometries(geos[k]), m); mesh.castShadow = true; mesh.receiveShadow = true; g.add(mesh) }
  // 館外的海：三大片（館的左、右、後面），一路到地平線；館裡那片另外做（有浪、有海岸線）
  const sea = seaMaterial(), R = 3000
  for (const [x0, x1, z0, z1] of [[-R, -HX, -62, -R], [HX, R, -62, -R], [-HX, HX, H1, -R]]) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z0 - z1, 8, 8).rotateX(-Math.PI / 2), sea)
    p.position.set((x0 + x1) / 2, CST.SEA, (z0 + z1) / 2); p.renderOrder = 1; g.add(p)
  }
  return { g, doors, sea }
}

/* ---------- 館內 ---------- */
async function loadLib() {
  const draco = new DRACOLoader().setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.174.0/examples/jsm/libs/draco/gltf/')
  const gl = await new GLTFLoader().setDRACOLoader(draco).loadAsync(`models/coast/coast.glb?v=${VER}`)
  const lib = {}
  for (const o of [...gl.scene.children]) lib[o.name] = o
  draco.dispose()
  return lib
}
function buildInterior(lib, sea) {
  const g = new THREE.Group(); g.name = 'coastInterior'
  const rnd = mulberry32(77)
  const CG = COAST_GRID
  const hAt = coastHeight, shoreDz = (x, z) => z - coastShoreZ(x)
  // 沙地網格：乾沙淺米、濕沙（海岸線附近）深一點、沙丘上偏灰綠（有植物的地方）、岬角偏灰（岩石）
  {
    const nx = CG.nx, nz = CG.nz, pos = new Float32Array(nx * nz * 3), col = new Float32Array(nx * nz * 3), uv = new Float32Array(nx * nz * 2), idx = []
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) { const k = j * nx + i, x = CG.x0 + i * CG.cell, z = CG.z0 + j * CG.cell; pos.set([x, COAST_HEIGHTS[k], z], k * 3); uv.set([x * 0.3, z * 0.3], k * 2) }
    for (let j = 0; j < nz - 1; j++) for (let i = 0; i < nx - 1; i++) { const a = j * nx + i, b = a + 1, c = a + nx, d = c + 1; idx.push(a, c, b, b, c, d) }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); geo.setIndex(idx); geo.computeVertexNormals()
    const nrm = geo.attributes.normal, c = new THREE.Color()
    for (let k = 0; k < nx * nz; k++) {
      const x = pos[k * 3], z = pos[k * 3 + 2], ny = nrm.getY(k), dz = shoreDz(x, z), n = fbm2(x * 0.2, z * 0.2, 3)
      c.setHSL(0.11, 0.32, 0.72 + n * 0.05)                                            // 乾沙
      c.lerp(new THREE.Color().setHSL(0.1, 0.28, 0.5), ss(3.5, 0.5, dz) * ss(-3, -0.2, dz) + (dz < 0 ? 1 : 0) * 0.6)   // 濕沙、水下
      c.lerp(new THREE.Color().setHSL(0.17, 0.18, 0.55 + n * 0.05), ss(-104, -92, z) * 0.45)   // 沙丘上
      c.lerp(new THREE.Color().setHSL(0.08, 0.07, 0.45 + n * 0.06), ss(0.85, 0.65, ny))        // 陡的地方（岬角）
      col.set([c.r, c.g, c.b], k * 3)
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3))
    const grain = canvasTex(256, 256, (x, w, h) => { x.fillStyle = '#e0e0e0'; x.fillRect(0, 0, w, h); for (let i = 0; i < 9000; i++) { const l = 170 + Math.random() * 85; x.fillStyle = `rgba(${l},${l},${l},0.6)`; x.fillRect(Math.random() * w, Math.random() * h, 1, 1) } })
    grain.wrapS = grain.wrapT = THREE.RepeatWrapping
    const ground = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, map: grain, roughness: 0.97 }))
    ground.receiveShadow = true; g.add(ground)
  }
  // 館裡的海：細網格（看得出浪），從沙丘前面到館的南牆
  {
    const w = CST.HX * 2, d = CST.Z0 - 22 - CST.Z1   // z 從 -96 到 -154
    const water = new THREE.Mesh(new THREE.PlaneGeometry(w, d, 160, 116).rotateX(-Math.PI / 2), sea)
    water.position.set(0, CST.SEA, CST.Z1 + d / 2); water.renderOrder = 1; g.add(water)
  }
  // 木棧道：木板＋兩側木柱和麻繩扶手
  {
    const B = BOARDWALK, wood = new THREE.MeshStandardMaterial({ color: 0x8a6a4a, roughness: 0.85 }), rope = new THREE.MeshStandardMaterial({ color: 0xb8a27a, roughness: 0.9 })
    const planks = [], posts = [], ropes = []
    for (let z = B.z0 - 0.12; z > B.z1; z -= 0.26) planks.push(new THREE.BoxGeometry(B.w, 0.05, 0.22).translate(B.x0, boardwalkAt(B.x0, z) - 0.025, z))
    for (const s of [-1, 1]) {
      const pts = []
      for (let z = B.z0 - 0.3; z > B.z1 + 0.1; z -= 2) { const y = boardwalkAt(B.x0, z); posts.push(new THREE.BoxGeometry(0.1, 1.0 + y - hAt(B.x0 + s * (B.w / 2 + 0.05), z) + 0.3, 0.1).translate(B.x0 + s * (B.w / 2 + 0.05), (y + 0.9 + hAt(B.x0 + s * (B.w / 2 + 0.05), z) - 0.3) / 2, z)); pts.push(V(B.x0 + s * (B.w / 2 + 0.05), y + 0.85, z)) }
      ropes.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), pts.length * 6, 0.02, 5))
    }
    for (const [list, mat] of [[planks, wood], [posts, wood], [ropes, rope]]) { const m = new THREE.Mesh(mergeGeometries(list), mat); m.castShadow = m.receiveShadow = true; g.add(m) }
  }
  // 植物、岩石、漂流木：照位置挑模型（沙丘上松樹、濱草、海濱植物；岬角上岩壁；高潮線上漂流木、海草、貝殼；東邊防波木樁）
  const lists = {}, put = (n, it) => { if (lib[n]) (lists[n] ||= []).push(it) }
  const pick = (a) => a[Math.floor(rnd() * a.length)]
  const qy = (a) => new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), a)
  const onBW = (x, z, m) => Math.abs(x - BOARDWALK.x0) < BOARDWALK.w / 2 + m && z < BOARDWALK.z0 + 1 && z > BOARDWALK.z1 - 1
  const inside = (x, z, m = 1) => Math.abs(x) < CST.HX - m && z < CST.Z0 - m && z > CST.Z1 + m
  // 海灘松：沙丘上、岬角上，不擋木棧道和入口
  for (let k = 0; k < 2000 && (lists.__pines ?? 0) < 48; k++) {
    const x = -CST.HX + 3 + rnd() * (CST.HX * 2 - 6), z = CST.Z0 - 6 - rnd() * 40
    if (onBW(x, z, 4) || !inside(x, z, 3) || shoreDz(x, z) < 12) continue
    const h = hAt(x, z); if (h < 1.2) continue
    const big = rnd() < 0.45
    put(pick(big ? ['Pine_beach_01_A', 'Pine_beach_02_A', 'Pine_beach_03_A'] : ['Pine_beach_medium_01', 'Pine_beach_medium_03', 'Pine_beach_crooked_01', 'Pine_beach_small_01', 'Pine_beach_small_03']),
      { p: V(x, h - 0.15, z), q: qy(rnd() * TAU), s: V(1, 1, 1).multiplyScalar(0.85 + rnd() * 0.35) })
    addCollider(x, z, big ? 0.35 : 0.25, h + 9)
    lists.__pines = (lists.__pines ?? 0) + 1
  }
  delete lists.__pines
  // 濱草（一叢一叢）＋海濱植物：沙丘上密、沙灘上稀，水邊沒有
  for (let k = 0; k < 9000; k++) {
    const x = -CST.HX + 1 + rnd() * (CST.HX * 2 - 2), z = CST.Z0 - 1 - rnd() * 60
    if (onBW(x, z, 0.4) || !inside(x, z, 0.8)) continue
    const dz = shoreDz(x, z); if (dz < 5) continue
    const dens = ss(5, 24, dz) * (0.5 + 0.5 * fbm2(x * 0.08, z * 0.08, 2) + 0.35)
    if (rnd() > dens) continue
    const r = rnd(), y = hAt(x, z) - 0.05
    const name = r < 0.8 ? pick(['beach_grass_01_1', 'beach_grass_01_2', 'beach_grass_01_3', 'beach_grass_01_4', 'beach_grass_02_1'])
      : r < 0.87 ? 'sea_holly_01' : r < 0.93 ? 'sea_wormwood_01'
      : r < 0.975 ? pick(['beach_rose_01_with_pink_flowers', 'beach_rose_03_with_white_flowers', 'beach_rose_01_with_white_flowers', 'beach_rose_03_with_pink_flowers']) : 'sea_buckthorn_01_fruits'
    put(name, { p: V(x, y, z), q: qy(rnd() * TAU), s: V(1, 1, 1).multiplyScalar(0.8 + rnd() * 0.5) })
  }
  // 西邊岬角：岩壁一塊接一塊，面朝東（沙灘那邊）和南（海）；前面堆幾塊斷崖
  for (let z = -100; z > CST.Z1 + 4; z -= 7) {
    const x = -24 - rnd() * 3, y = hAt(x + 3, z)
    put(pick(['beach_cliff_01_A', 'beach_cliff_01_B', 'beach_cliff_01_C']), { p: V(x, Math.min(y, 0.5) - 0.8, z), q: qy(-Math.PI / 2 + (rnd() - 0.5) * 0.4), s: V(1, 1, 1).multiplyScalar(0.9 + rnd() * 0.3) })
  }
  put('beach_cliff_01_B', { p: V(-31, -1.2, CST.Z1 + 3), q: qy(Math.PI + 0.2), s: V(1.1, 1.1, 1.1) })
  // 沙丘前緣的小斷崖（沙丘被浪削出來的）
  for (let x = -18; x < 34; x += 10 + rnd() * 3) { const z = coastShoreZ(x) + 21 + rnd() * 3; if (onBW(x, z, 3)) continue; put(pick(['beach_escarpment_02_A', 'beach_escarpment_02_B']), { p: V(x, hAt(x, z) - 0.9, z), q: qy((rnd() - 0.5) * 0.3), s: V(0.9, 0.9, 0.9) }) }   // 斷崖正面是 -z（朝海）
  // 高潮線：漂流木、海草、貝殼沿著海岸線上方 2～5 公尺散一排
  for (let k = 0; k < 220; k++) {
    const x = -22 + rnd() * 60, z = coastShoreZ(x) + 1.5 + rnd() * 4.5
    if (onBW(x, z, 1) || !inside(x, z, 1)) continue
    const r = rnd(), y = hAt(x, z)
    if (r < 0.12) put(pick(['beach_driftwood_01', 'beach_driftwood_02', 'beach_driftwood_03', 'beach_driftwood_04']), { p: V(x, y - 0.05, z), q: qy(rnd() * TAU), s: V(1, 1, 1) })
    else if (r < 0.32) put(pick(['seaweed_01_A', 'seaweed_01_B', 'seaweed_01_C']), { p: V(x, y + 0.01, z), q: qy(rnd() * TAU), s: V(1, 1, 1).multiplyScalar(0.45 + rnd() * 0.3) })   // 海草少一點、小一點（太多會像一灘一灘黑的）
    else put(pick(['shells_01_A', 'shells_01_B']), { p: V(x, y + 0.01, z), q: qy(rnd() * TAU), s: V(1, 1, 1) })
  }
  // 東邊防波木樁：一排從沙灘走進海裡
  for (let i = 0; i < 16; i++) { const z = coastShoreZ(24) + 6 - i * 2.2, x = 24 + Math.sin(i * 0.4) * 0.6; put('wooden_pales_2_01', { p: V(x, Math.min(hAt(x, z), 0.2) - 0.9, z), q: qy(rnd() * 0.4), s: V(1, 1, 1) }) }
  for (const [n, list] of Object.entries(lists)) {
    const small = /grass|holly|wormwood|seaweed|shells|rose|buckthorn/.test(n)
    scatter(g, lib[n], list, { cast: !/seaweed|shells/.test(n), wind: /Pine/.test(n) ? 0.12 : small ? 0.05 : 0 })
  }
  return { g }
}

/* ---------- 對外：給 halls.js 的附屬館 ---------- */
export function createCoast({ scene }) {
  const shell = buildShell()
  scene.add(shell.g)
  let interior = null, loading = null
  const near = (d, px, pz) => Math.abs(pz - d.z) < 3.2 && Math.abs(px) < CCORR.W
  const hall = {
    name: 'coast', shell: shell.g, center: { x: 0, z: ZM }, fog: 0.0035,
    get interior() { return interior?.g },
    build() {
      if (interior || loading) return loading
      loading = loadLib().then((lib) => { interior = buildInterior(lib, shell.sea); interior.g.visible = false; scene.add(interior.g) })
      return loading
    },
    inside: (p) => p.z < CCORR.B + 0.5,
    nearOpen: () => shell.doors.a.open > 0.02, farOpen: () => shell.doors.b.open > 0.02,
    approach: (p) => p.z < -50,   // 導覽頁最南的鳥站（藍鵲 z≈-40）不會觸發下載
    doors(t, dt, p) {
      waveTime.value = t
      for (const k of ['a', 'b']) {
        const d = shell.doors[k], want = near(d, p.x, p.z) ? 1 : 0
        d.open = clamp(d.open + (want ? 2.0 : -1.0) * dt, 0, 1)
        const e = d.open * d.open * (3 - 2 * d.open)
        for (const { p: pn, s } of d.panels) pn.position.x = s * (CCORR.W / 2 - 0.02 + e * (CCORR.W / 2 - 0.1))
        coastDoors[k] = d.open
      }
    },
    animate() {},
  }
  return hall
}
