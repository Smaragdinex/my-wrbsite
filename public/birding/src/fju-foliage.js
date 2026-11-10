// 從 fju-animals 的 foliage.js 搬來：停棲樹的樹冠、葉片卡、樹皮紋理（birds.js 的 heroTree 用）。
// 全校的樹都只套便宜的貼圖細節；真正的草葉和葉片只長在動物地點附近，而且一次只畫鏡頭所在的那一處。
import * as THREE from 'three'
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js'

export const foliageTime = { value: 0 }
// 鏡頭附近多遠以內的樹葉要溶掉：停在動物前面時小（樹冠才不會破洞），飛行途中大（不會整個畫面被葉子蓋住）
export const foliageNear = { value: 2.8 }
const hashR = (() => { let s = 11; return () => ((s = (s * 16807) % 2147483647) / 2147483647) })()

// 樹冠的起伏（樹冠幾何和葉片都照這個長，葉片才會貼在樹冠表面）
export function canopyBump(v) {
  return 1 + Math.sin(v.x * 5.1 + 1.3) * Math.sin(v.y * 4.7 + 0.4) * Math.sin(v.z * 5.3 + 2.1) * 0.13
    + Math.sin(v.x * 11 + v.z * 7) * Math.sin(v.y * 9 + 1) * 0.04
}

const NOISE = `
  float fHash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
  float fNoise(vec3 p) {
    vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(fHash(i), fHash(i + vec3(1,0,0)), f.x), mix(fHash(i + vec3(0,1,0)), fHash(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(fHash(i + vec3(0,0,1)), fHash(i + vec3(1,0,1)), f.x), mix(fHash(i + vec3(0,1,1)), fHash(i + vec3(1,1,1)), f.x), f.y), f.z);
  }`
// 頂點階段算出世界座標給片段用（有沒有 instancing 都適用）
const WORLD_VARY = (sh) => {
  sh.vertexShader = sh.vertexShader
    .replace('#include <common>', '#include <common>\nvarying vec3 vFw;')
    .replace('#include <project_vertex>', `#include <project_vertex>
      vec4 fw = vec4(transformed, 1.0);
      #ifdef USE_INSTANCING
        fw = instanceMatrix * fw;
      #endif
      vFw = (modelMatrix * fw).xyz;`)
  sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vFw;\nuniform float foliageNear;' + NOISE)
  sh.uniforms.foliageNear = foliageNear
}

/* ---------- 樹冠：一簇簇明暗、亮的葉尖偏黃 ---------- */
// 鏡頭附近的樹葉用網點慢慢溶掉：鏡頭從樹冠旁邊或中間升上去時，畫面才不會一下被葉子整個蓋住（閃圖）
const NEAR_FADE = `#include <clipping_planes_fragment>
      {
        float camD = length(vViewPosition);
        float keep = smoothstep(foliageNear * 0.3, foliageNear, camD);
        vec2 sp = floor(gl_FragCoord.xy);
        float dither = fract(dot(sp, vec2(0.5, 0.25)) + fract(sp.y * 0.5) * 0.5 + 0.0625);
        if (keep < 1.0 && dither > keep) discard;
      }`
const CLUMP = `#include <color_fragment>
      float c1 = fNoise(vFw * 1.2), c2 = fNoise(vFw * 3.6 + 7.0), c3 = fNoise(vFw * 12.0);
      float clump = smoothstep(0.25, 0.8, c1 * 0.55 + c2 * 0.45);
      diffuseColor.rgb *= 0.58 + 0.55 * clump + 0.25 * (c3 - 0.5);
      diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.06, 1.04, 0.88), clump * c3 * 0.35);`
export function leafify(m) {
  m.onBeforeCompile = (sh) => {
    WORLD_VARY(sh)
    sh.fragmentShader = sh.fragmentShader.replace('#include <color_fragment>', CLUMP).replace('#include <clipping_planes_fragment>', NEAR_FADE)
  }
  m.customProgramCacheKey = () => 'leafify'
  return m
}

/* ---------- 樹皮：直向的裂紋 + 幾塊淡綠的地衣 ---------- */
export function barkify(m) {
  m.onBeforeCompile = (sh) => {
    WORLD_VARY(sh)
    sh.fragmentShader = sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      float ridge = fNoise(vFw * vec3(14.0, 1.6, 14.0)) * 0.65 + fNoise(vFw * vec3(38.0, 4.0, 38.0)) * 0.35;
      diffuseColor.rgb *= 0.62 + 0.6 * smoothstep(0.2, 0.75, ridge);
      float lich = smoothstep(0.62, 0.8, fNoise(vFw * 2.2 + 3.0)) * smoothstep(0.3, 0.6, fNoise(vFw * 9.0));
      diffuseColor.rgb *= mix(vec3(1.0), vec3(0.95, 1.12, 0.85), lich * 0.6);`)
  }
  m.customProgramCacheKey = () => 'barkify'
  return m
}

/* ---------- 葉片貼圖：一團密密的葉簇，邊緣參差 ---------- */
// 顏色接近白色、只帶明暗：乘上樹冠本身的顏色後和樹冠一致，只多了葉子的形狀和不規則的輪廓
let _leafTex
function leafTexture() {
  if (_leafTex) return _leafTex
  const N = 256, cv = document.createElement('canvas')
  cv.width = cv.height = N
  const c = cv.getContext('2d')
  const leaf = (x, y, a, L, W, fill) => {
    c.save(); c.translate(x, y); c.rotate(a)
    c.beginPath(); c.moveTo(0, 0)
    c.bezierCurveTo(W, L * 0.25, W * 0.8, L * 0.75, 0, L)
    c.bezierCurveTo(-W * 0.8, L * 0.75, -W, L * 0.25, 0, 0)
    c.fillStyle = fill; c.fill()
    c.restore()
  }
  const leaves = []
  for (let i = 0; i < 90; i++) {
    // 中心密、外圍疏，葉尖朝外
    const r = N * 0.36 * Math.sqrt(hashR()), t = hashR() * Math.PI * 2
    leaves.push([N / 2 + Math.cos(t) * r, N / 2 + Math.sin(t) * r, t - Math.PI / 2 + (hashR() - 0.5) * 1.2, 30 + hashR() * 18, 11 + hashR() * 5, hashR()])
  }
  // 先畫一層暗的當作葉子之間的陰影，再畫亮的葉面
  for (const [x, y, a, L, W] of leaves) leaf(x + 2, y + 3, a, L, W, 'rgb(120,128,110)')
  for (const [x, y, a, L, W, t] of leaves) leaf(x, y, a, L * 0.94, W * 0.9, `rgb(${200 + t * 50 | 0},${212 + t * 43 | 0},${185 + t * 50 | 0})`)
  const tex = new THREE.CanvasTexture(cv)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  return (_leafTex = tex)
}

/* ---------- 葉片卡：貼在單位樹冠表面的一圈小方片，法線朝外，光影才會跟樹冠一致 ---------- */
const _cards = {}
// spray：小枝末端用的鬆散葉叢，葉片散在整個體積裡、數量少，看得到枝條和空隙
export function leafCardGeometry(n = 200, spray = false) {
  const key = n + (spray ? 's' : '')
  if (_cards[key]) return _cards[key]
  const pos = [], nor = [], uv = [], col = [], idx = []
  const d = new THREE.Vector3(), t1 = new THREE.Vector3(), t2 = new THREE.Vector3(), cn = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0)
  for (let i = 0; i < n; i++) {
    // 球面上平均分布（Fibonacci）再加一點亂
    const u = (i + 0.5) / n, phi = i * 2.399963 + hashR() * 0.3
    const y = 1 - 2 * u, s = Math.sqrt(1 - y * y)
    d.set(Math.cos(phi) * s, y, Math.sin(phi) * s).normalize()
    const r = spray ? 0.25 + 0.75 * Math.cbrt(hashR()) : canopyBump(d) * (0.9 + hashR() * 0.12)
    const c = d.clone().multiplyScalar(r)
    if (c.y < 0) c.y *= 0.75
    // 方片大致朝外，再隨機傾斜
    cn.copy(d).add(t1.set(hashR() - 0.5, hashR() - 0.5, hashR() - 0.5).multiplyScalar(1.4)).normalize()
    t1.crossVectors(cn, Math.abs(cn.y) > 0.9 ? t2.set(1, 0, 0) : up).normalize()
    t2.crossVectors(cn, t1).normalize()
    const rot = hashR() * Math.PI * 2, cs = Math.cos(rot), sn = Math.sin(rot)
    const a = t1.clone().multiplyScalar(cs).addScaledVector(t2, sn), b = t1.clone().multiplyScalar(-sn).addScaledVector(t2, cs)
    const S = 0.26 + hashR() * 0.1
    const k = THREE.MathUtils.lerp(0.72, 1.08, THREE.MathUtils.smoothstep(c.y, -0.8, 0.9)) * (0.88 + hashR() * 0.2)
    const base = pos.length / 3
    for (const [sx, sy, uu, vv] of [[-1, -1, 0, 0], [1, -1, 1, 0], [1, 1, 1, 1], [-1, 1, 0, 1]]) {
      pos.push(c.x + (a.x * sx + b.x * sy) * S, c.y + (a.y * sx + b.y * sy) * S, c.z + (a.z * sx + b.z * sy) * S)
      const nn = d.clone().multiplyScalar(0.8).addScaledVector(cn, 0.2).normalize()
      nor.push(nn.x, nn.y, nn.z); uv.push(uu, vv); col.push(k, k, k)
    }
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3)
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
  g.setIndex(idx)
  g.computeBoundingSphere()
  return (_cards[key] = g)
}

const _cardMats = {}
export function leafCardMaterial(color = 0xffffff) {
  if (_cardMats[color]) return _cardMats[color]
  const m = new THREE.MeshStandardMaterial({
    color, map: leafTexture(), vertexColors: true, roughness: 0.8,
    alphaTest: 0.45, side: THREE.DoubleSide,   // 2026-11-11 拿掉 alphaToCoverage（葉緣一圈白霧、夜裡閃）
  })
  m.onBeforeCompile = (sh) => {
    WORLD_VARY(sh)
    sh.fragmentShader = sh.fragmentShader.replace('#include <color_fragment>', CLUMP).replace('#include <clipping_planes_fragment>', NEAR_FADE)
    sh.uniforms.uTime = foliageTime
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        // 葉子微微晃
        float ph = dot(position, vec3(3.1, 2.3, 1.7));
        transformed += vec3(sin(uTime * 1.9 + ph), sin(uTime * 2.3 + ph * 1.3) * 0.5, cos(uTime * 1.6 + ph)) * 0.012;`)
    // 雙面但不翻法線：背面也照樹冠朝外的方向打光，不然會一片黑
    sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>',
      'float faceDirection = 1.0;\nvec3 normal = normalize( vNormal );\nvec3 nonPerturbedNormal = normal;')
      // 葉子薄，背光面也透一點光，樹冠底下才不會一片黑
      .replace('#include <lights_fragment_end>', '#include <lights_fragment_end>\n#if NUM_HEMI_LIGHTS > 0\nfloat leafDay = clamp(dot(hemisphereLights[0].skyColor, vec3(0.33)) * 2.5, 0.0, 1.0);\n#else\nfloat leafDay = 1.0;\n#endif\nreflectedLight.indirectDiffuse += leafDay * diffuseColor.rgb * vec3(0.06, 0.08, 0.03);')
  }
  m.customProgramCacheKey = () => 'leafcard'
  return (_cardMats[color] = m)
}


let _canopy
export function canopyGeometry() {
  if (_canopy) return _canopy
  let g = new THREE.IcosahedronGeometry(1, 3)
  g.deleteAttribute('normal'); g.deleteAttribute('uv')
  g = mergeVertices(g)
  const p = g.attributes.position, col = new Float32Array(p.count * 3), v = new THREE.Vector3()
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i)
    // 一團團的葉簇：幾個不同頻率的起伏疊起來
    v.multiplyScalar(canopyBump(v))
    if (v.y < 0) v.y *= 0.75     // 底部比較平
    p.setXYZ(i, v.x, v.y, v.z)
    const k = THREE.MathUtils.lerp(0.55, 1.08, THREE.MathUtils.smoothstep(v.y, -0.8, 0.9))
    col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = k
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3))
  g.computeVertexNormals()
  return (_canopy = g)
}
