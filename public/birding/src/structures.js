// 溫室本體、地面、步道、雲霧山、瀑布、空中步道
import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { t as tr, FONT_SANS } from './i18n.js'
import {
  TAU, DOME, MTN, POOL, RAMP, DECK, PATHS, clamp, smoothstep, lerp, angDiff,
  domeRho, domeB, inAlpine, alpineHeight, terrainHeight, mtnR, rampSample, rampHeights, rampInner, poolQ, addCollider, G, pathClear,
  CCORR, COAST_ON, gardenRho,
} from './layout.js'
import { fbm3, noise3, mulberry32 } from './noise.js'
import * as T from './textures.js'

const tmpM = new THREE.Matrix4()

/* ---------- 天空與外面的城市 ---------- */
// 日夜共用的亮度：dayLight 白天 1 → 晚上 0；duskLight 黃昏、清晨的那一段（0～1）。world.setTime 改值，各個著色器直接讀
export const dayLight = { value: 1 }, duskLight = { value: 0 }
// 霧氣量：白天 0；晚上 0.75、清晨（6 點前後）最濃 1，9 點前散掉。world.setTime 改值，霧、山頂雲、山區的霧團照它加濃
export const mistLevel = { value: 0 }
// 天氣（weather.js 改值）：雲量 0～1、陰暗 0～1、閃電亮光 0～1、遠處的雨霧 0～1
export const weatherU = { cloud: { value: 0 }, gloom: { value: 0 }, flash: { value: 0 }, haze: { value: 0 }, rain: { value: 0 }, wet: { value: 0 } }   // rain 正在下多大、wet 地面濕到什麼程度（雨停後慢慢乾）
// 下雨地面變濕（2026-11-08）：顏色變深、表面變亮滑（粗糙度降低，會反天光）。地面、山區地形、圍牆外草地、雲霧山的岩壁都套
export function wetify(mat, { dark = 0.36, rough = 0.32 } = {}) {
  const prev = mat.onBeforeCompile, prevKey = mat.customProgramCacheKey?.bind(mat)
  mat.onBeforeCompile = (sh, r) => {
    prev?.call(mat, sh, r)
    sh.uniforms.uWet = weatherU.wet
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uWet;')
      .replace('#include <color_fragment>', `#include <color_fragment>\n diffuseColor.rgb *= 1.0 - ${dark.toFixed(2)} * uWet;`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>\n roughnessFactor = mix(roughnessFactor, ${rough.toFixed(2)}, uWet * 0.85);`)
  }
  mat.customProgramCacheKey = () => (prevKey ? prevKey() : '') + '|wet'
  return mat
}
export function buildSky(scene) {
  const geo = new THREE.SphereGeometry(900, 32, 16)
  // 日夜：uDay 白天 1、晚上 0；uDusk 黃昏／清晨那一段地平線變橘；晚上有星星和月亮（world.setTime 在改）
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { sunDir: { value: new THREE.Vector3(-0.45, 0.8, 0.35).normalize() }, moonDir: { value: new THREE.Vector3(0.45, 0.6, -0.5).normalize() }, uDay: dayLight, uDusk: duskLight, uTime: waterTime, uCloud: weatherU.cloud, uGloom: weatherU.gloom, uFlash: weatherU.flash },
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `varying vec3 vDir; uniform vec3 sunDir; uniform vec3 moonDir; uniform float uDay; uniform float uDusk; uniform float uTime; uniform float uCloud; uniform float uGloom; uniform float uFlash;
      float hash(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
      float h2(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(h2(i), h2(i + vec2(1, 0)), f.x), mix(h2(i + vec2(0, 1)), h2(i + vec2(1, 1)), f.x), f.y); }
      float fbm(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 6; i++) { s += a * vn(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; } return s; }
      void main(){
        vec3 d = normalize(vDir);
        float h = clamp(d.y, -0.2, 1.0);
        vec3 top = mix(vec3(0.012, 0.02, 0.05), vec3(0.30,0.55,0.85), uDay);
        vec3 hor = mix(vec3(0.035, 0.05, 0.09), vec3(0.86,0.91,0.93), uDay);
        // 黃昏：太陽那一側的地平線橘紅、天頂偏紫
        float sunSide = 0.5 + 0.5 * dot(normalize(d.xz + 1e-4), normalize(sunDir.xz + 1e-4));
        hor = mix(hor, vec3(0.98, 0.58, 0.34) * (0.35 + 0.65 * sunSide), uDusk);
        top = mix(top, vec3(0.28, 0.32, 0.55), uDusk * 0.55);
        vec3 gnd = hor * 0.6;
        vec3 c = h > 0.0 ? mix(hor, top, pow(h, 0.55)) : mix(hor, gnd, -h*5.0);
        float s = max(dot(d, sunDir), 0.0);
        // 太陽（2026-11-08 加大）：看得到的日輪（半徑約 0.6 度、邊緣暗一點），日出日落時變橘紅、光暈變大；
        // 在地平線下就看不到日輪（光暈留一點，天邊還有餘暉）。雲（下面）會蓋住它
        float sunUp = smoothstep(-0.02, 0.012, d.y);
        vec3 sunCol = mix(vec3(1.0, 0.42, 0.12), vec3(1.0, 0.96, 0.88), smoothstep(0.02, 0.3, sunDir.y));
        float disk = smoothstep(0.99989, 0.999945, s) * (0.75 + 0.25 * smoothstep(0.99989, 1.0, s));
        float glow = pow(s, 900.0) * 2.5 + pow(s, 60.0) * (0.25 + 0.6 * uDusk) + pow(s, 8.0) * (0.08 + 0.25 * uDusk);
        c += sunCol * (disk * 26.0 * sunUp + glow) * smoothstep(-0.12, 0.0, sunDir.y) * (1.0 - 0.95 * uGloom);
        // 陰天：整片天空變灰（亮度照原本的天色），太陽被雲遮住
        c = mix(c, vec3(dot(c, vec3(0.3, 0.5, 0.2))) * vec3(0.92, 0.95, 1.0) * (1.0 - 0.35 * uGloom), uGloom * 0.85);
        // 雲（2026-11-08 拿掉溫室後加）：天空投影到一片高空的平面上，fbm 雜訊當雲量，慢慢往東飄；
        // 雲底偏灰、迎著太陽那邊亮，黃昏染橘、晚上變暗；靠地平線淡掉（遠山前面不會有一條白邊）
        float cloudA = 0.0;
        if (d.y > 0.0) {
          vec2 cp = d.xz / (d.y + 0.12) * 1.6 + vec2(uTime * 0.006, uTime * 0.002);
          float n = fbm(cp), n2 = fbm(cp * 2.1 + 5.0);
          float cov = smoothstep(0.48 - 0.42 * uCloud, 0.75 - 0.3 * uCloud, n + 0.12 * n2);   // 雲量：陰天、下雨整片蓋滿
          cloudA = cov * smoothstep(0.0, 0.18, d.y);
          float lit = 0.72 + 0.28 * smoothstep(0.35, 0.85, n2) + 0.35 * pow(max(dot(d, sunDir), 0.0), 6.0);
          vec3 cc = mix(vec3(0.05, 0.06, 0.09), vec3(0.97, 0.98, 1.0), uDay) * lit;
          cc = mix(cc, vec3(1.0, 0.68, 0.48) * lit, uDusk * 0.7);
          cc *= 1.0 - 0.55 * uGloom * (0.6 + 0.4 * n);   // 雨雲：灰黑、厚的地方更暗
          c = mix(c, cc, cloudA * 0.92);
        }
        c += vec3(0.75, 0.8, 1.0) * uFlash * (0.6 + 0.4 * cloudA);   // 閃電：整片雲被照亮
        float night = (1.0 - uDay) * (1.0 - cloudA);
        if (d.y > 0.0 && night > 0.01) {
          vec3 cell = d * 260.0, g = floor(cell);
          float r = hash(g), star = step(0.996, r) * smoothstep(0.42, 0.0, length(fract(cell) - 0.5));
          c += vec3(0.85, 0.9, 1.0) * star * night * (0.4 + 0.9 * hash(g + 3.0)) * smoothstep(0.02, 0.25, d.y);
        }
        float m = dot(d, moonDir);
        c += vec3(0.92, 0.94, 1.0) * (smoothstep(0.99935, 0.9996, m) * 1.4 + pow(max(m, 0.0), 80.0) * 0.06) * night;
        gl_FragColor = vec4(c, 1.0);
        #include <colorspace_fragment>
      }`,
  })
  const sky = new THREE.Mesh(geo, mat)
  sky.renderOrder = -10
  scene.add(sky)

  return { sky, skyMat: mat }
}

/* ---------- 玻璃圓頂 ---------- */
// 蛋形：西半邊半軸 A、東半邊 AE（layout.js DOME）。ex(p)：方位 p 的 x 半徑
const ex = (p) => (Math.cos(p) > 0 ? DOME.AE : DOME.A) * Math.cos(p)
// 方位 p、半徑比例 r 的 z（短半軸照 x 變：山區那側比較寬，layout.js domeB）
const ez = (p, r = 1) => domeB(ex(p) * r) * r * Math.sin(p)
// 赤道一圈：u 照弧長分配（東半邊比較長，格網的格子才不會被拉寬），PERIM 是周長
const EQ = (() => {
  const n = 2048, acc = [0]
  for (let i = 1; i <= n; i++) { const p0 = ((i - 1) / n) * TAU, p1 = (i / n) * TAU; acc.push(acc[i - 1] + Math.hypot(ex(p1) - ex(p0), ez(p1) - ez(p0))) }
  return { n, acc, L: acc[n] }
})()
export const DOME_PERIM = EQ.L
// 弧長比例 u（0～1）→ 方位角
function eqAngle(u) {
  const t = u * EQ.L, a = EQ.acc
  let lo = 0, hi = EQ.n
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (a[m] < t) lo = m; else hi = m }
  const f = (t - a[lo]) / Math.max(1e-9, a[hi] - a[lo])
  return ((lo + f) / EQ.n) * TAU
}
function domeGeometry(scale = 1, nu = 320, nv = 56) {
  const pos = [], uv = [], idx = []
  for (let j = 0; j <= nv; j++) {
    const v = j / nv, a = v * Math.PI / 2
    const rho = Math.cos(a), y = DOME.H * Math.sin(a) * scale
    for (let i = 0; i <= nu; i++) {
      const u = i / nu, p = eqAngle(u)
      pos.push(ex(p) * scale * rho, y, ez(p, scale * rho))
      uv.push(u, v)
    }
  }
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
    const a = j * (nu + 1) + i, b = a + 1, c = a + nu + 1, d = c + 1
    idx.push(a, c, b, b, c, d)
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  g.setIndex(idx)
  g.computeVertexNormals()
  return g
}


/* ---------- 寫實材質（著色器裡畫細節，不用貼圖檔） ---------- */
// 用世界座標算的雜訊、磚縫、模板紋；細節小於一個像素時淡掉，遠看不閃。
const SURF_GLSL = `
  varying vec3 vSW; varying vec3 vSN;
  float sHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float sNoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(sHash(i), sHash(i + vec2(1, 0)), f.x), mix(sHash(i + vec2(0, 1)), sHash(i + vec2(1, 1)), f.x), f.y); }
  float sFbm(vec2 p) { return sNoise(p) * 0.55 + sNoise(p * 2.13 + 7.1) * 0.3 + sNoise(p * 4.7 - 3.3) * 0.15; }
  // 整數位置（x = 0, 1, 2…）上的一條線，寬 w（以一格為 1）；抗鋸齒
  float sLine(float x, float w) { float f = abs(fract(x) - 0.5); float aa = fwidth(x) + 1e-4; return smoothstep(0.5 - w - aa, 0.5 - w + aa, f); }
`
function surface(mat, key, body) {
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vSW; varying vec3 vSN;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvSW = (modelMatrix * vec4(transformed, 1.0)).xyz; vSN = normalize(mat3(modelMatrix) * objectNormal);')
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\n' + SURF_GLSL)
      .replace('#include <color_fragment>', '#include <color_fragment>\n{\n' + body + '\n}')
  }
  mat.customProgramCacheKey = () => key
  return mat
}
// 牆腳矮牆：清水模（一塊塊模板的接縫、繫結螺栓孔、深淺斑），頂上一條花崗石壓頂，牆腳返潮變深、帶一點青苔
function kneeWallMaterial(H) {
  return surface(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.92, side: THREE.DoubleSide }), 'kneeWall1', `
    vec3 c = vec3(0.70, 0.69, 0.66);
    float top = step(0.5, vSN.y);
    float u = vSW.x * 0.71 + vSW.z * 0.7;            // 沿牆的大約距離
    float near = 1.0 - smoothstep(4.0, 30.0, length(vViewPosition));
    // 模板：1.2 公尺一塊，接縫和螺栓孔
    float seam = sLine(u / 1.2, 0.012) * (1.0 - top);
    vec2 cell = vec2(fract(u / 0.6), fract((vSW.y + 0.5) / 0.55));
    float hole = (1.0 - smoothstep(0.02, 0.04, length((cell - 0.5) * vec2(0.6, 0.55)))) * (1.0 - top) * near;
    c *= 0.9 + 0.16 * sFbm(vec2(u, vSW.y) * 1.3) + 0.05 * sNoise(vec2(u, vSW.y) * 9.0) * near;
    c *= 1.0 - 0.18 * seam - 0.35 * hole;
    // 壓頂：最上面 8 公分＋頂面是深一點的花崗石，細碎斑點
    float cope = max(top, smoothstep(${(H - 0.09).toFixed(3)}, ${(H - 0.08).toFixed(3)}, vSW.y));
    vec3 g = vec3(0.56, 0.56, 0.55) * (0.88 + 0.2 * sNoise(vSW.xz * 70.0) * near + 0.1 * sFbm(vSW.xz * 0.8));
    c = mix(c, g, cope);
    // 牆腳返潮、青苔
    float damp = (1.0 - smoothstep(0.0, 0.35, vSW.y)) * (1.0 - top);
    c = mix(c, c * vec3(0.62, 0.68, 0.58), damp * (0.6 + 0.4 * sFbm(vec2(u * 2.0, vSW.y * 3.0))));
    // 雨水流下的痕跡
    c *= 1.0 - 0.08 * smoothstep(0.55, 0.8, sNoise(vec2(u * 3.0, 0.5))) * (1.0 - top) * smoothstep(${H.toFixed(2)}, 0.2, vSW.y);
    diffuseColor.rgb = c;`)
}
// 通道地板：60 公分見方的灰色花崗石磚，石縫、每塊深淺不同、細碎晶斑；靠溫室那頭一條不鏽鋼排水溝蓋
function corridorFloorMaterial(xGrate) {
  return surface(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.55 }), 'corridorFloor1', `
    vec2 q = vSW.xz / 0.6;
    vec2 id = floor(q);
    float grout = max(sLine(q.x, 0.022), sLine(q.y, 0.022));
    float near = 1.0 - smoothstep(3.0, 20.0, length(vViewPosition));
    vec3 c = vec3(0.74, 0.73, 0.70) * (0.9 + 0.14 * sHash(id));
    c *= 0.92 + 0.1 * sFbm(vSW.xz * 3.0);
    c *= 1.0 + (sNoise(vSW.xz * 90.0) - 0.5) * 0.18 * near + (sNoise(vSW.xz * 23.0) - 0.5) * 0.08;      // 花崗石的晶斑
    c = mix(c, vec3(0.42, 0.42, 0.40), grout * 0.85);
    // 排水溝蓋：一條 20 公分寬的不鏽鋼格柵
    float gx = abs(vSW.x - (${xGrate.toFixed(2)}));
    float grate = 1.0 - smoothstep(0.1, 0.105, gx);
    float slot = sLine(vSW.z / 0.025, 0.18) * (1.0 - smoothstep(0.085, 0.09, gx));
    c = mix(c, mix(vec3(0.62, 0.63, 0.64), vec3(0.08), slot), grate);
    // 走道中間被踩得比較亮、比較光滑的一條
    c *= 1.0 + 0.05 * (1.0 - smoothstep(0.4, 1.6, abs(vSW.z)));
    diffuseColor.rgb = c;`)
}
// 玻璃：正面看幾乎透明，斜斜看反射天空、地面變亮（菲涅耳）；有一點點綠色的玻璃邊色
function realGlass(mat) {
  const prev = mat.onBeforeCompile
  mat.onBeforeCompile = (sh, r) => {
    prev?.(sh, r)
    sh.fragmentShader = sh.fragmentShader.replace('#include <dithering_fragment>', `#include <dithering_fragment>
      { vec3 Vv = normalize(vViewPosition); float fr = pow(1.0 - abs(dot(normalize(vNormal), Vv)), 4.0);
        gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(0.86, 0.92, 0.95), fr * 0.7);
        gl_FragColor.a = clamp(gl_FragColor.a + fr * 0.55, 0.0, 0.85); }`)
  }
  const k = mat.customProgramCacheKey?.() ?? ''
  mat.customProgramCacheKey = () => k + 'glassF'
  return mat
}

// 入口：圓頂門口到相機行（溫室外面另一棟店，store.js）之間的玻璃通道。
// 鋼構漆白（跟圓頂主拱肋同色）：角柱、簷樑、人字屋頂、玻璃分隔條；兩頭都是開口，靠溫室那頭上面掛綠色「出口」燈箱。
// 圓頂的玻璃和斜格網在門口挖掉（cutDoor），主拱肋錯開半格，門中間不會有柱子。
const DOOR = { W: 4.0, X0: -73.0, X1: -75.6, EAVE: 3.4, RIDGE: 4.5 }   // X1 接到相機行那棟（layout.js STORE.X0）
const doorTop = (z) => DOOR.EAVE + (DOOR.RIDGE - DOOR.EAVE) * Math.max(0, 1 - Math.abs(z) / DOOR.W)
function cutDoor(mat) {
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vDoorW;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvDoorW = (modelMatrix * vec4(transformed, 1.0)).xyz;')
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vDoorW;')
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
        if (vDoorW.x < -60.0 && abs(vDoorW.z) < ${(DOOR.W + 0.02).toFixed(2)} && vDoorW.y < ${DOOR.EAVE.toFixed(2)} + ${(DOOR.RIDGE - DOOR.EAVE).toFixed(2)} * max(0.0, 1.0 - abs(vDoorW.z) / ${DOOR.W.toFixed(1)}) + 0.05) discard;
        ${COAST_ON ? '' : '//'}if (vDoorW.z < -50.0 && abs(vDoorW.x) < ${(CCORR.W + 0.02).toFixed(2)} && vDoorW.y < 3.2 + 1.0 * max(0.0, 1.0 - abs(vDoorW.x) / ${CCORR.W.toFixed(1)}) + 0.05) discard;   // 南門（往海岸館，coast.js）`)
  }
  mat.customProgramCacheKey = () => 'cutDoor4'
}
function entranceFloor() {
  const { W, X0, X1 } = DOOR, L = X0 - X1
  const floor = new THREE.Mesh(new THREE.BoxGeometry(L + 0.2, 0.08, W * 2), corridorFloorMaterial(X0 - 0.35))
  floor.position.set((X0 + X1) / 2, 0.0, 0); floor.receiveShadow = true
  return floor
}
function buildEntrance() {
  const g = new THREE.Group()
  const steel = new THREE.MeshStandardMaterial({ color: 0xf2f4f5, roughness: 0.45, metalness: 0.5 })
  const alu = new THREE.MeshStandardMaterial({ color: 0x3c4246, roughness: 0.35, metalness: 0.8 })
  const glassM = realGlass(new THREE.MeshStandardMaterial({ color: 0xcfe4ea, transparent: true, opacity: 0.12, roughness: 0.04, metalness: 0.1, side: THREE.DoubleSide, depthWrite: false }))
  const { W, X0, X1, EAVE, RIDGE } = DOOR, L = X0 - X1, XM = (X0 + X1) / 2
  const geos = { steel: [], alu: [] }
  // 兩點之間拉一根方管（a、b 世界座標、t 管徑）
  const bar = (list, a, b, t = 0.14, t2 = t) => {
    const d = new THREE.Vector3().subVectors(b, a), len = d.length()
    const m = new THREE.Matrix4().lookAt(a, b, Math.abs(d.y) > 0.99 * len ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0))
    m.setPosition(a.clone().add(b).multiplyScalar(0.5))
    list.push(new THREE.BoxGeometry(t, t2, len).applyMatrix4(m))
  }
  const V = (x, y, z) => new THREE.Vector3(x, y, z)
  const glassPane = (pts) => {   // 平面多邊形玻璃（凸的）
    const pos = []
    for (let i = 1; i < pts.length - 1; i++) pos.push(...pts[0].toArray(), ...pts[i].toArray(), ...pts[i + 1].toArray())
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.computeVertexNormals()
    const m = new THREE.Mesh(geo, glassM); m.renderOrder = 5; g.add(m)
  }
  // 柱子：四角＋側牆中間；每根底下一塊底板
  for (const x of [X0, XM, X1]) for (const z of [-W, W]) {
    bar(geos.steel, V(x, 0, z), V(x, EAVE, z), 0.24)
    geos.steel.push(new THREE.BoxGeometry(0.5, 0.04, 0.5).translate(x, 0.02, z))
  }
  // 簷樑、人字屋架（每個柱位一榀）、屋脊、檁條
  for (const z of [-W, W]) bar(geos.steel, V(X0, EAVE, z), V(X1, EAVE, z), 0.22, 0.3)
  for (const x of [X0, XM, X1]) {
    bar(geos.steel, V(x, EAVE, -W), V(x, RIDGE, 0), 0.2, 0.26); bar(geos.steel, V(x, EAVE, W), V(x, RIDGE, 0), 0.2, 0.26)
    bar(geos.steel, V(x, EAVE, -W), V(x, EAVE, W), 0.08)                     // 拉桿
  }
  bar(geos.steel, V(X0, RIDGE, 0), V(X1, RIDGE, 0), 0.2)
  for (const f of [1 / 3, 2 / 3]) for (const s of [-1, 1]) {
    const z = s * W * (1 - f), y = EAVE + (RIDGE - EAVE) * f
    bar(geos.alu, V(X0, y, z), V(X1, y, z), 0.06)
  }
  // 側牆：直的分隔條（約 1 公尺一格）＋ 腰帶（2.6 公尺）＋ 底下的踢腳板
  const nSide = 5
  for (const z of [-W, W]) {
    for (let i = 1; i < nSide; i++) { const x = X0 - L * i / nSide; bar(geos.alu, V(x, 0.3, z), V(x, EAVE, z), 0.06) }
    bar(geos.alu, V(X0, 2.6, z), V(X1, 2.6, z), 0.07)
    geos.steel.push(new THREE.BoxGeometry(L, 0.3, 0.12).translate(XM, 0.15, z))
    glassPane([V(X0, 0.3, z), V(X1, 0.3, z), V(X1, EAVE, z), V(X0, EAVE, z)])
  }
  // 屋頂玻璃
  for (const s of [-1, 1]) glassPane([V(X0, EAVE, s * W), V(X1, EAVE, s * W), V(X1, RIDGE, 0), V(X0, RIDGE, 0)])
  // 內側（接圓頂）：開口的門框，上面一根大樑
  bar(geos.steel, V(X0, EAVE, -W), V(X0, EAVE, W), 0.26, 0.4)
  // 地板：通道鋪石材
  const floor = new THREE.Mesh(new THREE.BoxGeometry(L + 0.2, 0.08, W * 2), corridorFloorMaterial(X0 - 0.35))
  floor.position.set(XM, 0.0, 0); floor.receiveShadow = true; g.add(floor)
  for (const [k, m] of [['steel', steel], ['alu', alu]]) {
    const mesh = new THREE.Mesh(mergeGeometries(geos[k]), m)
    mesh.castShadow = true; mesh.receiveShadow = true
    g.add(mesh)
  }
  // 綠色出口燈箱（自己發光），掛在內側大樑下面、面向園區
  const c = document.createElement('canvas'); c.width = 256; c.height = 96
  const x2 = c.getContext('2d'); x2.fillStyle = '#1f9a4c'; x2.fillRect(0, 0, 256, 96)
  x2.fillStyle = '#fff'; x2.font = `bold 52px ${FONT_SANS}`; x2.textAlign = 'center'; x2.textBaseline = 'middle'
  x2.fillText(tr('出口 EXIT'), 128, 50, 240)
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace
  const sign = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.3, 0.06), [alu, alu, alu, alu, new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 0.9 }), alu])
  sign.material[4].userData.lamp = [0.9, 1.6]
  sign.rotation.y = Math.PI / 2   // 有字的那面（+z）轉到朝 +x（園區那邊）
  sign.position.set(X0 + 0.2, EAVE - 0.42, 0)
  g.add(sign)
  return g
}

// 2026-11-08 拿掉溫室：玻璃、格網、拱肋都不畫了，原本圓頂的範圍就是公園的邊界（玩家一樣走到那裡被擋，layout.js domeRho）。
// 牆腳的矮牆也拿掉（大部分埋在土裡，只露出一段段白色）：改成 outside.js 沿著地形的木頭圍籬；入口的玻璃通道也拿掉，走出相機行就是公園（只留通道的石材地板）
export function buildDome(scene) {
  const group = new THREE.Group()
  group.add(entranceFloor())

  group.name = 'domeShell'
  scene.add(group)
}

/* ---------- 地面與步道 ---------- */
export function buildGround(scene) {
  const W = 168, D = 124, nx = 336, nz = 248
  const g = new THREE.PlaneGeometry(W, D, nx, nz).rotateX(-Math.PI / 2)
  const pos = g.attributes.position, col = []
  const uv = g.attributes.uv
  const c = new THREE.Color()
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i)
    const h = terrainHeight(x, z)
    // 2026-11-09 邊界接縫：以前邊界外第一排格點直接壓低 0.5 公尺，跨邊界那格變成一道陡坡（邊界內側凹一條溝、法線歪掉照得特別亮），
    // 從店門口看過去是一整圈亮白的線。改成邊界外慢慢壓下去（從 5 公分開始，約 2 公尺壓到 0.5 公尺），一直藏在外面草地底下（邊界外地形還會先微微隆起）
    const rho = domeRho(x, z)
    // 2026-11-09 山區那邊也一樣：以前一進山區就直接壓到 -0.6（3 公尺的斷崖，從上面看是一條鋸齒狀的黑線），改成貼著山區地面底下慢慢往下
    pos.setY(i, inAlpine(x, z) ? Math.min(h, alpineHeight(x, z)) - 0.05 - 0.55 * smoothstep(1.03, 1.09, gardenRho(x, z)) : rho > 1 ? h - Math.min(0.5, 0.05 + 20 * (rho - 1)) : h)   // 山區有自己的地形（alpine.js），這片壓到底下；圍牆外是 buildOutside 那片草地
    uv.setXY(i, x / 5, z / 5)
    const n = fbm3(x * 0.08, 0, z * 0.08, 3)
    c.setRGB(0.5 + n * 0.2, 0.56 + n * 0.18, 0.4 + n * 0.14)   // 偏暗的林下地面，草葉之間不會露出亮綠草坪
    // 靠邊界慢慢換成外面草地的顏色（outside.js 同一個算法），接起來看不出兩塊
    const ko = smoothstep(0.95, 0.995, rho)
    if (ko > 0) { const n2 = fbm3(x * 0.03, 0, z * 0.03, 3); c.lerp(new THREE.Color(0.42 + n2 * 0.12, 0.52 + n2 * 0.12, 0.3 + n2 * 0.08), ko) }
    const q = poolQ(x, z)
    if (q < 1.3) c.lerp(new THREE.Color(0.35, 0.3, 0.22), smoothstep(1.3, 0.8, q))
    col.push(c.r, c.g, c.b)
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
  g.computeVertexNormals()
  const ground = new THREE.Mesh(g, wetify(new THREE.MeshStandardMaterial({ map: T.grassGroundTex(), vertexColors: true, roughness: 1 }), { dark: 0.3, rough: 0.55 }))
  ground.receiveShadow = true
  ground.userData.terrain = true   // 拍照算遮擋時用高度表（scoring.js）：16 萬個三角形逐個打射線，一張照片要好幾秒
  scene.add(ground)

  // 步道帶
  // 步道：不規則的石板（照世界座標算，所以兩條步道交會、疊在一起的地方花紋一模一樣，不會有接縫），
  // 石板之間是凹下去的灰縫，每塊顏色不一樣、邊緣有亮暗（有厚度）、表面有細紋和磨損；
  // 兩側一圈深色收邊石（用「到所有步道邊的距離」算，所以交會處也順）、靠邊的地方髒一點、帶點泥土和青苔
  const distTex = (() => {
    const d = new Uint8Array(G.nx * G.nz)
    for (let i = 0; i < d.length; i++) d[i] = Math.round(255 * Math.min(1, Math.max(0, (pathClear[i] + 2) / 4)))
    const t = new THREE.DataTexture(d, G.nx, G.nz, THREE.RedFormat)
    t.magFilter = t.minFilter = THREE.LinearFilter; t.needsUpdate = true
    return t
  })()
  const pathMat = new THREE.MeshStandardMaterial({ roughness: 0.85, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })
  pathMat.onBeforeCompile = (sh) => {
    sh.uniforms.uDist = { value: distTex }
    sh.uniforms.uWet = weatherU.wet
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWp;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWp = (modelMatrix * vec4(transformed, 1.0)).xyz;')
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vWp;
        uniform sampler2D uDist;
        ${GLSL_NOISE}
        vec2 h22(vec2 p) { p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3))); return fract(sin(p) * 43758.5453); }
        // Voronoi：回傳 (離最近石板中心, 離石縫的距離, 石板編號亂數)
        vec3 stones(vec2 p) {
          vec2 i = floor(p), f = fract(p);
          vec2 mg, mr; float md = 8.0;
          for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
            vec2 g = vec2(float(x), float(y)), o = 0.15 + 0.7 * h22(i + g), r = g + o - f;
            float d = dot(r, r);
            if (d < md) { md = d; mr = r; mg = g; }
          }
          float ed = 8.0;
          for (int y = -2; y <= 2; y++) for (int x = -2; x <= 2; x++) {
            vec2 g = mg + vec2(float(x), float(y)), o = 0.15 + 0.7 * h22(i + g), r = g + o - f;
            if (dot(mr - r, mr - r) > 0.0001) ed = min(ed, dot(0.5 * (mr + r), normalize(r - mr)));
          }
          return vec3(sqrt(md), ed, h22(i + mg).x);
        }
        float pathEdge;   // 到步道邊的距離（公尺，負的在步道裡）
        float stoneH;     // 石板高度（給法線用）
        uniform float uWet; float wetPud;   // 下雨：整片變濕＋一灘灘積水`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        {
          vec2 gp = (vWp.xz - vec2(${G.x0.toFixed(1)}, ${G.z0.toFixed(1)})) / ${G.cell.toFixed(2)};
          pathEdge = texture2D(uDist, (gp + 0.5) / vec2(${G.nx}.0, ${G.nz}.0)).r * 4.0 - 2.0;
          vec2 p = vWp.xz * 2.1 + vec2(snoise(vWp.xz * 0.9), snoise(vWp.xz * 0.9 + 7.0)) * 0.12;
          vec3 st = stones(p);
          float mortar = 1.0 - smoothstep(0.03, 0.075, st.y);
          // 石板顏色：暖灰、米黃、偏紅的砂岩，每塊不一樣
          float id = st.z;
          vec3 stone = mix(vec3(0.44, 0.42, 0.38), vec3(0.55, 0.5, 0.42), fract(id * 3.7));
          stone = mix(stone, vec3(0.5, 0.4, 0.34), step(0.78, fract(id * 7.3)) * 0.7);    // 偏紅的砂岩
          stone = mix(stone, vec3(0.4, 0.42, 0.43), step(0.85, fract(id * 5.1)) * 0.6);    // 偏藍灰的
          stone *= (0.8 + 0.32 * fract(id * 13.1)) * 0.72;   // 溫室裡陽光很強，石頭本身要暗一點才不會被照成白的
          // 表面：細的顆粒、大片的深淺（磨損、雨痕）
          float grain = snoise(vWp.xz * 38.0) * 0.5 + 0.5, blot = snoise(vWp.xz * 1.3 + id * 9.0) * 0.5 + 0.5;
          stone *= 0.9 + 0.12 * grain;
          stone *= mix(0.88, 1.06, blot);
          // 邊緣磨圓：靠石縫的地方稍暗
          stone *= mix(0.8, 1.0, smoothstep(0.07, 0.2, st.y));
          vec3 col = mix(stone, vec3(0.2, 0.19, 0.17) * (0.85 + 0.3 * grain), mortar);
          stoneH = smoothstep(0.03, 0.12, st.y) * 0.012 + grain * 0.0015;
          // 收邊石：步道邊往內 0.28 公尺一圈深灰色的長條石（每 0.6 公尺一道縫）
          float curb = smoothstep(-0.34, -0.28, pathEdge);
          float joint = 1.0 - smoothstep(0.0, 0.03, abs(fract((vWp.x + vWp.z) * 0.8) - 0.5) - 0.47);
          vec3 curbCol = vec3(0.32, 0.31, 0.3) * (0.9 + 0.15 * grain) * (1.0 - 0.45 * joint);
          col = mix(col, curbCol, curb);
          stoneH = mix(stoneH, 0.016 - joint * 0.006, curb);
          // 靠邊髒一點：泥土、一點青苔
          float dirt = smoothstep(-1.0, -0.2, pathEdge) * (0.5 + 0.5 * snoise(vWp.xz * 2.3));
          col = mix(col, col * vec3(0.78, 0.8, 0.66), clamp(dirt, 0.0, 1.0) * 0.55);
          // 濕：整片變深；積水（低頻雜訊的窪處）更深、表面平（不畫石縫起伏）、很亮滑會倒映天空
          wetPud = smoothstep(0.32, 0.55, snoise(vWp.xz * 0.21) * 0.7 + snoise(vWp.xz * 0.83 + 3.0) * 0.3) * uWet;
          col *= (1.0 - 0.38 * uWet) * (1.0 - 0.3 * wetPud);
          stoneH *= 1.0 - wetPud;
          diffuseColor.rgb = col;
        }`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = mix(roughnessFactor, 0.3, uWet * 0.8);
        roughnessFactor = mix(roughnessFactor, 0.03, wetPud);`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        {
          // 石板凸、石縫凹：用高度的螢幕空間微分去歪法線（three 的 perturbNormalArb 同一套算法）
          vec3 dpdx = dFdx(-vViewPosition), dpdy = dFdy(-vViewPosition);
          float dhx = dFdx(stoneH), dhy = dFdy(stoneH);
          vec3 r1 = cross(dpdy, normal), r2 = cross(normal, dpdx);
          float det = dot(dpdx, r1);
          vec3 grad = sign(det) * (dhx * r1 + dhy * r2);
          normal = normalize(abs(det) * normal - grad);
        }`)
  }
  pathMat.customProgramCacheKey = () => 'flagstonePath-wet'
  const geos = []
  PATHS.forEach((p, pi) => {
    const pts = p.points
    const P = [], U = [], I = []
    let dist = 0
    for (let k = 0; k < pts.length; k++) {
      const a = pts[Math.max(0, k - 1)], b = pts[Math.min(pts.length - 1, k + 1)]
      const tx = b.x - a.x, tz = b.z - a.z, tl = Math.hypot(tx, tz) || 1
      const nx2 = -tz / tl, nz2 = tx / tl
      if (k > 0) dist += pts[k].distanceTo(pts[k - 1])
      for (let s = 0; s <= 4; s++) {
        const o = (s / 4 - 0.5) * p.w
        const x = pts[k].x + nx2 * o, z = pts[k].z + nz2 * o
        P.push(x, terrainHeight(x, z) + 0.035 + pi * 0.004, z)
        U.push((s / 4) * p.w / 3, dist / 3)
      }
    }
    for (let k = 0; k < pts.length - 1; k++) for (let s = 0; s < 4; s++) {
      const a = k * 5 + s, b = a + 1, c2 = a + 5, d = c2 + 1
      I.push(a, b, c2, b, d, c2)
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3))
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2))
    geo.setIndex(I)
    geo.computeVertexNormals()
    geos.push(geo)
  })
  const paths = new THREE.Mesh(mergeGeometries(geos), pathMat)
  paths.receiveShadow = true
  scene.add(paths)
}

/* ---------- 雲霧山 ---------- */
export function buildMountain(scene) {
  const NT = 160, NY = 120, Y0 = -2, Y1 = MTN.h
  const pos = [], uv = [], col = [], idx = []
  const c = new THREE.Color()
  const rock = new THREE.Color(0.62, 0.6, 0.56), rockD = new THREE.Color(0.38, 0.36, 0.33)
  const moss = new THREE.Color(0.32, 0.46, 0.17), mossD = new THREE.Color(0.18, 0.3, 0.1)
  for (let j = 0; j <= NY; j++) {
    const y = Y0 + (Y1 - Y0) * (j / NY)
    for (let i = 0; i <= NT; i++) {
      const th = (i / NT) * TAU
      const r = mtnR(th, y)
      pos.push(MTN.x + r * Math.cos(th), y, MTN.z + r * Math.sin(th))
      uv.push((i / NT) * 14, y / 5)
      const n = fbm3(Math.cos(th) * 3 + 2, y * 0.18, Math.sin(th) * 3, 4)
      const ledge = clamp((mtnR(th, y - 0.6) - r) * 1.2, 0, 1)   // 往外凸出的岩棚上面長苔
      const m = smoothstep(-0.1, 0.35, n) * 0.85 + ledge * 0.5
      c.copy(rock).lerp(rockD, smoothstep(0.2, -0.5, n)).lerp(n > 0.2 ? moss : mossD, clamp(m, 0, 1))
      const gorge = Math.exp(-(((Math.abs(((th % TAU) + TAU) % TAU - Math.PI)) / 0.2) ** 2))
      c.multiplyScalar(1 - 0.35 * gorge)
      col.push(c.r, c.g, c.b)
    }
  }
  for (let j = 0; j < NY; j++) for (let i = 0; i < NT; i++) {
    const a = j * (NT + 1) + i, b = a + 1, cc = a + NT + 1, d = cc + 1
    idx.push(a, cc, b, b, cc, d)
  }
  // 山頂封口
  const top = pos.length / 3
  pos.push(MTN.x, Y1 + 1.6, MTN.z); uv.push(0.5, Y1 / 5); col.push(moss.r, moss.g, moss.b)
  const last = NY * (NT + 1)
  for (let i = 0; i < NT; i++) idx.push(last + i, top, last + i + 1)
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
  g.setIndex(idx)
  g.computeVertexNormals()
  // 接縫：首尾兩欄法線取平均
  const nrm = g.attributes.normal
  for (let j = 0; j <= NY; j++) {
    const a = j * (NT + 1), b = a + NT
    const v = new THREE.Vector3(nrm.getX(a) + nrm.getX(b), nrm.getY(a) + nrm.getY(b), nrm.getZ(a) + nrm.getZ(b)).normalize()
    nrm.setXYZ(a, v.x, v.y, v.z); nrm.setXYZ(b, v.x, v.y, v.z)
  }
  const tex = T.rockTex()
  const mesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, map: tex, bumpMap: tex, bumpScale: 1.2, roughness: 0.92 }))
  mesh.castShadow = mesh.receiveShadow = true
  scene.add(mesh)
  return mesh
}

/* ---------- 瀑布、水池 ---------- */
// 共用的 GLSL 小工具：value noise
const GLSL_NOISE = `
  // 2D simplex noise（Ashima Arts / Ian McEwan，MIT）：比 value noise 平滑，拉長後不會出現方格
  vec3 sPerm(vec3 x) { return mod(((x * 34.0) + 1.0) * x, 289.0); }
  float snoise(vec2 v) {
    const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
    vec2 i = floor(v + dot(v, C.yy)), x0 = v - i + dot(i, C.xx);
    vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
    vec4 x12 = x0.xyxy + C.xxzz; x12.xy -= i1;
    i = mod(i, 289.0);
    vec3 p = sPerm(sPerm(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
    vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
    m = m * m; m = m * m;
    vec3 x = 2.0 * fract(p * C.www) - 1.0, h = abs(x) - 0.5, ox = floor(x + 0.5), a0 = x - ox;
    m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
    vec3 g; g.x = a0.x * x0.x + h.x * x0.y; g.yz = a0.yz * x12.xz + h.yz * x12.yw;
    return 130.0 * dot(m, g);
  }
  float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
  float vnoise(vec2 p) {
    vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y);
  }`
export const waterTime = { value: 0 }
// 水波紋：鳥踩水、啄水時加一圈（12 個位置輪流用）
const RIPPLES = 20
const ripVal = { value: Array.from({ length: RIPPLES }, () => new THREE.Vector4(0, 0, -99, 0)) }
let ripN = 0
export function ripple(x, z, amp = 1) { ripVal.value[ripN++ % RIPPLES].set(x, z, waterTime.value, amp) }

export function buildWater(scene) {
  const out = {}
  // 瀑布落點（峽谷底部、池子靠山那側）
  // 跟下面核心水柱的拋物線落點一致
  const fallR = Math.min(mtnR(Math.PI, 0) + 0.3 + 0.28 * Math.sqrt(30.5 - POOL.water), rampInner(0) - 0.25)
  const FX = MTN.x - fallR, FZ = MTN.z
  out.fallBase = new THREE.Vector3(FX, POOL.water, FZ)

  // 水池：不動頂點，在片段著色器算水面斜率去歪法線（細浪＋瀑布落點一圈圈往外的波），
  // 落點附近一片白沫，靠岸淺的地方顏色變淡
  // 真的倒影：每格把場景對水面鏡射畫到一張小貼圖（out.reflect），水面用波浪斜率扭一下再取樣，
  // 照菲涅耳：斜斜看時幾乎全是倒影、往下看時看到水本身（淺的地方透明看得到池底和光紋）
  const reflRT = new THREE.WebGLRenderTarget(512, 512, { type: THREE.HalfFloatType })
  const uRefl = { value: reflRT.texture }, uReflMat = { value: new THREE.Matrix4() }, uReflOn = { value: 0 }
  const poolMat = new THREE.MeshStandardMaterial({ color: 0x1b4644, roughness: 0.05, metalness: 0.0, transparent: true, opacity: 0.93, envMapIntensity: 1.4 })
  poolMat.onBeforeCompile = (sh) => {
    sh.uniforms.uWT = waterTime; sh.uniforms.uRip = ripVal; sh.uniforms.uDayL = dayLight
    sh.uniforms.uRefl = uRefl; sh.uniforms.uReflMat = uReflMat; sh.uniforms.uReflOn = uReflOn; sh.uniforms.uRainW = weatherU.rain
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWp;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWp = (modelMatrix * vec4(transformed, 1.0)).xyz;')
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vWp;
        uniform float uWT; uniform float uDayL;
        uniform vec4 uRip[${RIPPLES}];
        uniform sampler2D uRefl; uniform mat4 uReflMat; uniform float uReflOn; uniform float uRainW;
        ${GLSL_NOISE}
        const vec2 FALL = vec2(${FX.toFixed(2)}, ${FZ.toFixed(2)});
        float foamLace(vec2 p) {
          float patchy = smoothstep(-0.2, 0.6, snoise(p * 0.7 + 11.0));
          return (smoothstep(0.62, 0.92, 1.0 - abs(snoise(p * 1.6))) * 0.7 + smoothstep(0.2, 0.75, snoise(p * 1.1 + 5.0)) * 0.5) * patchy;
        }
        float foamSpeck(vec2 p) { return smoothstep(0.62, 0.9, snoise(p * 7.0 + 3.0)); }
        // 池底光紋：兩層錯開移動的網狀亮線（abs 噪聲取細線）
        float caustic(vec2 p) {
          float a = 1.0 - abs(snoise(p * 1.7 + vec2(uWT * 0.21, uWT * 0.13)));
          float b = 1.0 - abs(snoise(p * 2.3 - vec2(uWT * 0.17, -uWT * 0.19) + 4.0));
          return pow(a, 6.0) * 0.6 + pow(b, 7.0) * 0.5;
        }
        float gRing = 0.0;   // 水紋環的波峰（顏色也提亮一點，不靠反光也看得到一圈圈）
        vec2 waterSlope(vec2 p) {
          vec2 g = vec2(0.0);
          const vec2 W[8] = vec2[8](vec2(6.3, 0.0), vec2(8.9, 0.55), vec2(11.7, -0.6), vec2(15.1, 0.95), vec2(19.6, -1.1), vec2(24.3, 0.3), vec2(31.0, -0.35), vec2(39.5, 1.3));
          float gust = 0.55 + 0.45 * sin(p.x * 0.31 + uWT * 0.23) * sin(p.y * 0.47 - uWT * 0.17 + 1.3);
          for (int i = 0; i < 8; i++) {
            float k = W[i].x, a = 0.4 + W[i].y;
            vec2 d = vec2(cos(a), sin(a));
            g += d * gust * (0.048 / sqrt(k)) * cos(dot(d, p) * k + uWT * sqrt(9.8 * k) * 0.6 + float(i) * 1.7);
          }
          // 瀑布打進水裡：一直往外推的同心波，越遠越弱
          vec2 d = p - FALL; float r = length(d) + 1e-3;
          float env = exp(-r * 0.32);
          g += (d / r) * env * 0.22 * cos(r * 9.0 - uWT * 7.0 + vnoise(d * 1.3) * 3.0);
          g += (vec2(vnoise(p * 3.0 + uWT * 1.7), vnoise(p * 3.0 - uWT * 1.3 + 7.0)) - 0.5) * env * 0.5;
          for (int j = 0; j < ${RIPPLES}; j++) {
            vec4 R = uRip[j];
            float age = uWT - R.z;
            if (age < 0.0 || age > 5.0) continue;
            vec2 q = p - R.xy; float rr = length(q) + 1e-4;
            // 真的水波紋是一小串波（前面一圈最明顯，後面跟著幾圈越來越細），
            // 往外走波長慢慢變長、整串變寬、越擴越淡；不是一圈圈等距發亮的線
            float front = rr - 0.42 * age;
            float width = 0.18 + 0.12 * age;
            float packet = exp(-front * front / (width * width)) * step(-1.5 * width, front);
            float k = 32.0 / (1.0 + 0.7 * age);
            float e2 = R.w * exp(-age * 0.5) * packet / sqrt(1.0 + 1.5 * rr);
            float wv = sin(front * k);
            g += (q / rr) * e2 * 1.8 * wv;
            gRing += e2 * wv;
          }
          return g;
        }`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        normal = normalize((viewMatrix * vec4(normalize(vec3(-ws.x, 1.0, -ws.y)), 0.0)).xyz);`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        vec2 ws = waterSlope(vWp.xz);
        // 靠岸變淺：偏黃綠、透一點
        float q = length((vWp.xz - vec2(${POOL.x.toFixed(2)}, ${POOL.z.toFixed(2)})) / vec2(${(POOL.rx * 1.12).toFixed(2)}, ${(POOL.rz * 1.12).toFixed(2)}));
        // 水深（照 layout.js 的池底形狀算，不用另外讀深度）：中間深（墨綠、不透）、靠岸淺（透明、看得到池底）
        float pq = (q * 1.12) * (q * 1.12);
        float depth = max(0.0, ${POOL.water.toFixed(2)} - mix(-1.5, 0.0, smoothstep(0.55, 1.25, pq)));
        float shallow = 1.0 - smoothstep(0.05, 0.75, depth);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.2, 0.3, 0.22), shallow * 0.6);
        diffuseColor.a = mix(0.95, 0.35, shallow);
        // 淺水池底的光紋（隔著水看到的）
        diffuseColor.rgb += vec3(0.55, 0.62, 0.5) * caustic(vWp.xz + ws * 2.0) * shallow * 0.55 * uDayL;   // 池底光紋是太陽照的，晚上沒有
        // 落點白沫（照影片）：打下來的地方一大片翻滾的白，往外是網狀的泡沫紋、零星的泡泡，慢慢往外漂
        vec2 dd = vWp.xz - FALL; float fr = length(dd); vec2 dir = dd / (fr + 1e-3);
        // 往外漂的泡沫用兩組錯開半個週期的位移交替淡入淡出（直接用 時間×速度 位移的話，
        // 時間一久整片紋路會沿著放射方向被拉長，變成一條條放射線）
        float ph1 = fract(uWT * 0.1), ph2 = fract(uWT * 0.1 + 0.5);
        float w1 = 1.0 - abs(2.0 * ph1 - 1.0);
        vec2 dr1 = dd - dir * ph1 * 3.0, dr2 = dd - dir * ph2 * 3.0 + vec2(17.3, 9.1);
        float core = smoothstep(2.8, 0.9, fr + snoise(dd * 1.4 + uWT * 0.9) * 0.7);
        float lace = mix(foamLace(dr2), foamLace(dr1), w1) * smoothstep(7.5, 1.6, fr);
        float speck = mix(foamSpeck(dr2), foamSpeck(dr1), w1) * smoothstep(4.5, 1.2, fr);
        float foam = clamp(core + lace * 0.75 + speck * 0.55, 0.0, 1.0);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.93, 0.97, 0.97), foam * 0.92);
        // 波峰稍亮、波谷稍暗（像光被水面折射），很淡，主要還是靠反光看到水紋
        // 從上往下看時水面幾乎不反光，水紋要靠「波峰亮、波谷暗」（光被折射聚散）才看得到：
        // 用乘的（不是加一圈白），亮暗都很柔和，跟著水本身的顏色走
        float rg = clamp(gRing * 4.0, -1.0, 1.0);
        diffuseColor.rgb *= 1.0 + rg * 0.45;
        diffuseColor.rgb += vec3(0.05, 0.07, 0.07) * max(rg, 0.0);`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.6, foam);')
      .replace('#include <opaque_fragment>', `
        // 菲涅耳＋倒影：倒影貼圖用水面位置投影，再照波浪斜率歪一點（近的歪多、白沫的地方沒有倒影）
        vec3 vdir = normalize(cameraPosition - vWp);
        vec3 wn = normalize(vec3(-ws.x, 1.0, -ws.y));
        float cosT = clamp(dot(vdir, wn), 0.0, 1.0);
        float fres = 0.03 + 0.97 * pow(1.0 - cosT, 5.0);
        fres = mix(fres, 1.0, 0.18) * (1.0 - foam);
        if (uReflOn > 0.5) {
          vec4 rc = uReflMat * vec4(vWp, 1.0);
          vec2 ruv = rc.xy / rc.w + ws * 0.1;
          vec3 refl = texture2D(uRefl, ruv).rgb;
          // 下雨：水面被雨打得坑坑巴巴，倒影散開（四點模糊＋一點亂抖）、變淡，不再像鏡子
          if (uRainW > 0.01) {
            vec2 j = vec2(snoise(vWp.xz * 6.0 + uWT * 3.0), snoise(vWp.xz * 6.0 - uWT * 2.7)) * 0.012 * uRainW;
            float o = 0.008 * uRainW;
            refl = (texture2D(uRefl, ruv + j + vec2(o, 0.0)).rgb + texture2D(uRefl, ruv + j - vec2(o, 0.0)).rgb + texture2D(uRefl, ruv + j + vec2(0.0, o)).rgb + texture2D(uRefl, ruv + j - vec2(0.0, o)).rgb) * 0.25;
          }
          // 水面倒影比實景暗一點、帶水的顏色（不是鏡子）
          refl = mix(refl, refl * vec3(0.75, 0.88, 0.85), 0.5) * 0.85;
          outgoingLight = mix(outgoingLight, refl, clamp(fres * 1.1, 0.0, 0.8) * (1.0 - 0.45 * uRainW));
          diffuseColor.a = mix(diffuseColor.a, 1.0, fres);
        }
        #include <opaque_fragment>`)
  }
  const water = new THREE.Mesh(new THREE.CircleGeometry(1, 96).rotateX(-Math.PI / 2).scale(POOL.rx * 1.12, 1, POOL.rz * 1.12), poolMat)
  water.position.set(POOL.x, POOL.water, POOL.z)
  water.receiveShadow = true
  scene.add(water)

  // 倒影：鏡射鏡頭（對 y = 水面），斜切近平面讓水面以下的東西（池底、鳥腳）不會畫進倒影。
  // 草葉放在 layer 1，倒影不畫（最花效能、倒影裡也看不出來）；鏡頭離水池太遠就不更新
  const vCam = new THREE.PerspectiveCamera(), clip = new THREE.Plane(), cp = new THREE.Vector4(), qv = new THREE.Vector4()
  const center = new THREE.Vector3(POOL.x, POOL.water, POOL.z)
  let frame = 0
  // every：每幾格更新一次倒影（水面一直在晃，看不出來；手機 3 格一次省效能）
  out.reflect = (renderer, scene, camera, scale = 0.5, every = 2) => {
    const far = camera.position.distanceTo(center) > 90 || camera.position.y < POOL.water + 0.05
    uReflOn.value = far ? 0 : 1
    if (far || frame++ % every) return   // 沒更新的那幾格沿用上一張（投影矩陣跟著那張，位置還是對的）
    const w = Math.max(64, Math.round(renderer.domElement.width * scale)), h = Math.max(64, Math.round(renderer.domElement.height * scale))
    if (reflRT.width !== w || reflRT.height !== h) reflRT.setSize(w, h)
    camera.updateMatrixWorld()
    vCam.copy(camera, false)   // 不要連子物件一起複製：鏡頭底下掛著手和相機（360 個物件），以前每次倒影都多複製一份，越玩越卡
    vCam.layers.set(0)
    // 鏡射：位置、朝向都對水面翻過去
    const Y = POOL.water
    vCam.position.set(camera.position.x, 2 * Y - camera.position.y, camera.position.z)
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion)
    dir.y = -dir.y
    vCam.up.set(0, 1, 0)
    vCam.lookAt(vCam.position.clone().add(dir))
    vCam.updateMatrixWorld()
    vCam.projectionMatrix.copy(camera.projectionMatrix)
    uReflMat.value.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1).multiply(vCam.projectionMatrix).multiply(vCam.matrixWorldInverse)
    // 斜切近平面（Lengyel）
    clip.setFromNormalAndCoplanarPoint(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, Y, 0)).applyMatrix4(vCam.matrixWorldInverse)
    cp.set(clip.normal.x, clip.normal.y, clip.normal.z, clip.constant)
    const pm = vCam.projectionMatrix, e = pm.elements
    qv.set((Math.sign(cp.x) + e[8]) / e[0], (Math.sign(cp.y) + e[9]) / e[5], -1, (1 + e[10]) / e[14])
    cp.multiplyScalar(2 / cp.dot(qv))
    e[2] = cp.x; e[6] = cp.y; e[10] = cp.z + 1 - 0.003; e[14] = cp.w
    water.visible = false
    const prevRT = renderer.getRenderTarget(), prevAuto = renderer.shadowMap.autoUpdate
    renderer.shadowMap.autoUpdate = false
    renderer.setRenderTarget(reflRT); renderer.clear()
    renderer.render(scene, vCam)
    renderer.setRenderTarget(prevRT); renderer.shadowMap.autoUpdate = prevAuto
    water.visible = true
  }

  // 瀑布：從山頂峽谷口衝出來，拋物線往下（離岩壁越來越遠，但不能超過空中步道內緣），三層：
  // 核心水柱（白、厚）、外層水幕（比較透、快）、最外面的水霧（很淡、往下越散越寬）。
  // 顏色和透明度全在 shader：沿流向拉長的條紋＋一團團往下掉的白色氣泡水塊，邊緣碎成水滴。
  const yTop = 30.5, yBot = POOL.water + 0.02, L = yTop - yBot
  const make = ({ offset, width, spread, arc, speed, opacity, seed, white, solid = 0, foamOnly = false }) => {
    const NY = 140, NX = 14, P = [], U = [], I = []
    for (let j = 0; j <= NY; j++) {
      const t = j / NY, y = lerp(yTop, yBot, t), drop = yTop - y
      const w = width * (0.8 + spread * t)
      for (let i = 0; i <= NX; i++) {
        const sx = (i / NX - 0.5) * w
        const r0 = mtnR(Math.PI, y)
        const th = Math.PI + sx / Math.max(r0, 1)
        const wall = Math.max(mtnR(th, y), r0)
        // 水柱中間比兩邊鼓出來一點（有厚度的感覺）
        const bulge = 0.25 * (1 - (2 * i / NX - 1) ** 2)
        const r = Math.min(wall + offset + arc * Math.sqrt(drop) + bulge, rampInner(y) - 0.25)
        P.push(MTN.x + r * Math.cos(th), y, MTN.z + r * Math.sin(th))
        U.push(i / NX, drop)
      }
    }
    for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
      const a = j * (NX + 1) + i, b = a + 1, c = a + NX + 1, d = c + 1
      I.push(a, c, b, b, c, d)
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3))
    g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2))
    g.setIndex(I)
    g.computeVertexNormals()
    const m = new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, depthWrite: false, side: THREE.DoubleSide, roughness: 0.35, metalness: 0, envMapIntensity: 1.3, emissive: 0xd8e8ea, emissiveIntensity: 0.22 })
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uWT = waterTime
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec2 vFall;')
        .replace('#include <uv_vertex>', '#include <uv_vertex>\nvFall = uv;')
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>
          varying vec2 vFall;
          uniform float uWT;
          ${GLSL_NOISE}`)
        .replace('#include <color_fragment>', `#include <color_fragment>
          float u = vFall.x, v = vFall.y, t = v / ${L.toFixed(2)};
          float W = ${(width * 2.2).toFixed(2)} * (0.8 + ${spread.toFixed(2)} * t);
          // 自由落體：越往下越快（速度 ∝ 1 + 1.4t）。不能寫成 v - 時間×速度(t)：時間一直加，幾秒後花紋會倒過來往上跑。
          // 改用「水從崖口落到這裡要多久」當座標（∫dv/速度），花紋永遠往下走、越往下拉得越長
          float fl = ${(L / 1.4).toFixed(2)} * log(1.0 + 1.4 * t) - uWT * ${speed.toFixed(2)};
          float x = u * W + ${seed.toFixed(1)};
          // 細長的水柱紋：沿流向拉得很長（y 的頻率比 x 低很多）
          float s1 = snoise(vec2(x * 1.8, fl * 0.05)) * 0.5 + 0.5;
          float s2 = snoise(vec2(x * 5.5, fl * 0.14 + 3.0)) * 0.5 + 0.5;
          float s3 = snoise(vec2(x * 15.0, fl * 0.4 + 9.0)) * 0.5 + 0.5;
          // 一團團往下掉的白色氣泡水（比條紋短、會被看到在往下走）
          float c1 = snoise(vec2(x * 1.1, fl * 0.45 + 5.0)) * 0.5 + 0.5;
          float c2 = snoise(vec2(x * 4.0, fl * 0.5 + 11.0)) * 0.5 + 0.5;
          float dens = s1 * 0.38 + s2 * 0.22 + s3 * 0.05 + c1 * 0.23 + c2 * 0.12 + t * 0.1;
          // 邊緣：越往下越碎
          float fray = 0.1 + 0.25 * t;
          float e = min(u, 1.0 - u);
          float edge = smoothstep(0.0, fray, e + (c1 - 0.5) * fray * 1.2);
          float a = smoothstep(0.28 - 0.06 * t, 0.78, dens) * edge;
          // 核心水柱中間是滿的水（不會透出後面的岩石變成黑斑），只有靠邊才有縫
          float solidA = ${solid.toFixed(2)} * smoothstep(fray * 0.8, fray + 0.22, e) * smoothstep(0.0, 1.2, v);
          // 頂端剛衝出來那一段比較集中、透明
          a *= smoothstep(0.0, 1.2, v);
          // 寫實的高瀑布：大部分是打進空氣的白水，但白之間有一條條比較暗、帶藍灰的水（沒那麼多氣泡、透光），
          // 剛從崖口衝出來那一兩公尺還是一整片透明發亮的水（還沒散開），之後才慢慢變白
          float fine = snoise(vec2(x * 24.0, fl * 0.22 + 2.0)) * 0.5 + 0.5;       // 很細的直條紋
          float lip = 1.0 - smoothstep(0.6, 3.5, v);
          float wh = smoothstep(0.42, 0.8, dens + ${white.toFixed(2)} + fine * 0.08) * (1.0 - 0.75 * lip);
          vec3 deep = vec3(0.46, 0.55, 0.57), body = vec3(0.66, 0.74, 0.76), foam = vec3(0.95, 0.97, 0.98);
          vec3 wcol = mix(deep, body, smoothstep(0.2, 0.62, dens));
          diffuseColor.rgb = mix(wcol, foam, wh) * (0.86 + 0.28 * fine);
          // 外層只畫白色的水花部分：透明的水疊在白色水柱上反而會變灰、看起來像髒斑
          diffuseColor.a = max(a * ${foamOnly ? 'wh * wh' : 'mix(0.22, 1.0, wh)'} * ${opacity.toFixed(2)}, solidA);
          ${foamOnly ? 'diffuseColor.rgb = foam;' : ''}`)
        // 透明的水很光滑（有反光的亮條），白色水花粗糙；自發光只給白水一點點（照到光才亮，不是一張發光的貼紙）
        .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(0.08, 0.6, wh);')
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance *= wh;')
    }
    const mesh = new THREE.Mesh(g, m)
    mesh.renderOrder = 3
    scene.add(mesh)
    return mesh
  }
  // 後面一層薄薄的水幕（半透明，讓水柱之間不會直接看到岩石），前面是一條條的水柱
  out.falls = [make({ offset: 0.2, width: 2.6, spread: 0.5, arc: 0.24, speed: 4.5, opacity: 0.55, seed: 0, white: 0.0, solid: 0.35 })]

  // 水柱：真實的高瀑布其實是很多股寬窄不一的水並排落下，彼此交疊、中間有縫，越往下越散、碎成水滴。
  // 每股是一條面向外的窄帶，各自的起點、寬度、速度、左右飄移都不一樣；全部合成一個網格一次畫完
  {
    const rnd = mulberry32(77)
    const NS = 30, NY = 90
    const P = [], A = [], I = []          // A：u（橫向 0～1）、v（落下距離）、股的編號、厚度
    let base = 0
    for (let k = 0; k < NS; k++) {
      const sx0 = (rnd() - 0.5) * 2.6                       // 起點在峽谷口的左右位置
      const w0 = 0.12 + rnd() ** 1.5 * 0.55                 // 寬度
      const drift = (rnd() - 0.5) * 0.9                     // 落到底時往左右偏多少
      const out0 = 0.15 + rnd() * 0.5                       // 離岩壁多遠
      const arc = 0.22 + rnd() * 0.12
      const thick = 0.45 + rnd() * 0.55
      const top = yTop - rnd() * 1.5                        // 有的股從稍低一點的地方才冒出來
      for (let j = 0; j <= NY; j++) {
        const t = j / NY, y = lerp(top, yBot, t), drop = top - y
        const w = w0 * (1 + 1.8 * t)                        // 越往下越散開
        const cx = sx0 + drift * t * t + 0.12 * Math.sin(t * 6 + k)
        for (const side of [-0.5, 0.5]) {
          const sx = cx + side * w
          const r0 = mtnR(Math.PI, y)
          const th = Math.PI + sx / Math.max(r0, 1)
          const wall = Math.max(mtnR(th, y), r0)
          const r = Math.min(wall + out0 + arc * Math.sqrt(drop), rampInner(y) - 0.25)
          P.push(MTN.x + r * Math.cos(th), y, MTN.z + r * Math.sin(th))
          A.push(side + 0.5, drop, k, thick)
        }
      }
      for (let j = 0; j < NY; j++) { const a0 = base + j * 2; I.push(a0, a0 + 2, a0 + 1, a0 + 1, a0 + 2, a0 + 3) }
      base += (NY + 1) * 2
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3))
    g.setAttribute('aFall', new THREE.Float32BufferAttribute(A, 4))
    g.setIndex(I)
    g.computeVertexNormals()
    const m = new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, depthWrite: false, side: THREE.DoubleSide, roughness: 0.3, metalness: 0, envMapIntensity: 1.3, emissive: 0xdde9eb, emissiveIntensity: 0.22 })
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uWT = waterTime
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute vec4 aFall;\nvarying vec4 vFall;')
        .replace('#include <uv_vertex>', '#include <uv_vertex>\nvFall = aFall;')
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>
          varying vec4 vFall;
          uniform float uWT;
          ${GLSL_NOISE}`)
        .replace('#include <color_fragment>', `#include <color_fragment>
          float u = vFall.x, v = vFall.y, id = vFall.z, thick = vFall.w;
          float t = clamp(v / ${L.toFixed(2)}, 0.0, 1.0);
          float spd = 5.0 + fract(id * 0.618) * 3.0;
          float fl = ${(L / 1.3).toFixed(2)} * log(1.0 + 1.3 * t) - uWT * spd;   // 同上：落下的時間當座標，不會倒流
          // 每股自己的紋：沿流向很長的條紋＋往下掉的一團團白
          float s1 = snoise(vec2(u * 3.0 + id * 7.1, fl * 0.07)) * 0.5 + 0.5;
          float s2 = snoise(vec2(u * 8.0 + id * 3.3, fl * 0.22)) * 0.5 + 0.5;
          float c1 = snoise(vec2(u * 2.0 + id * 1.7, fl * 0.6)) * 0.5 + 0.5;
          // 橫向：中間厚、兩邊薄，邊緣隨流向抖動
          float e = 1.0 - abs(u * 2.0 - 1.0);
          float body = smoothstep(0.0, 0.55 + 0.25 * (c1 - 0.5), e);
          // 越往下越碎：用流動的雜訊挖洞，碎成一顆顆水滴
          float holes = snoise(vec2(u * 10.0 + id * 9.0, fl * 0.45)) * 0.5 + 0.5;   // 細長的縫（水往下拉成一條條），不是圓洞
          float breakup = smoothstep(0.35, 1.0, t) * 0.75;
          float dens = (s1 * 0.5 + s2 * 0.25 + c1 * 0.25) * body;
          float a = smoothstep(0.12, 0.55, dens) * smoothstep(breakup - 0.1, breakup + 0.25, holes + 0.25);
          a *= smoothstep(0.0, 0.6, v) * thick;
          float fine = snoise(vec2(u * 18.0 + id * 5.0, fl * 0.3)) * 0.5 + 0.5;
          float lip = 1.0 - smoothstep(0.5, 3.0, v);
          float wh = smoothstep(0.32, 0.72, dens + 0.12 + fine * 0.08) * (1.0 - 0.7 * lip);
          vec3 wcol = mix(vec3(0.48, 0.56, 0.58), vec3(0.66, 0.74, 0.76), smoothstep(0.15, 0.55, dens));
          diffuseColor.rgb = mix(wcol, vec3(0.95, 0.97, 0.98), wh) * (0.86 + 0.28 * fine);
          diffuseColor.a = a * mix(0.3, 1.0, wh);   // 薄的地方是透明的（看得到後面），不是一塊暗斑`)
        .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(0.08, 0.6, wh);')
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance *= wh;')
    }
    const strands = new THREE.Mesh(g, m)
    strands.renderOrder = 4
    scene.add(strands)
    out.falls.push(strands)
  }

  // 落點（照瀑布底部的影片做）：
  // 1. 一團翻滾的白色水花丘：水柱打進水裡冒起來的白，一直在翻
  // 2. 往外甩出去的水滴：拉成一條條（看起來有動態模糊），拋物線掉回水面
  // 3. 一大片往上捲的水霧，把落點包住
  const impact = new THREE.Vector3(FX, POOL.water, FZ)
  {
    const g = new THREE.SphereGeometry(1, 40, 16, 0, TAU, 0, Math.PI / 2)
    const m = new THREE.MeshStandardMaterial({ color: 0xf2f6f7, transparent: true, depthWrite: false, roughness: 0.75, emissive: 0xdfeaec, emissiveIntensity: 0.18 })
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uWT = waterTime
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uWT;\nvarying vec3 vLp;\n' + GLSL_NOISE)
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          vLp = position;
          // 表面一直在鼓起、塌下
          float bump = snoise(vec2(atan(position.z, position.x) * 3.0, position.y * 3.0 - uWT * 2.2)) * 0.5 + 0.5;
          transformed *= 0.8 + 0.35 * bump;`)
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform float uWT;\nvarying vec3 vLp;\n' + GLSL_NOISE)
        .replace('#include <color_fragment>', `#include <color_fragment>
          float ang = atan(vLp.z, vLp.x);
          float n = snoise(vec2(ang * 4.0, vLp.y * 5.0 - uWT * 3.0)) * 0.5 + 0.5;
          float n2 = snoise(vec2(ang * 11.0, vLp.y * 12.0 - uWT * 5.0)) * 0.5 + 0.5;
          float edge = smoothstep(0.0, 0.35, vLp.y + (n - 0.5) * 0.3);
          // 水花丘不是一顆光滑的白球：一坨坨翻起來、中間有縫看得到下面的水
          diffuseColor.a = smoothstep(0.38, 0.78, n * 0.6 + n2 * 0.4 + vLp.y * 0.2) * edge * 0.9;
          diffuseColor.rgb *= 0.85 + 0.25 * n2;`)
    }
    const boil = new THREE.Mesh(g, m)
    boil.scale.set(1.5, 0.7, 1.8)
    boil.position.copy(impact).add(new THREE.Vector3(0, -0.15, 0))
    boil.renderOrder = 5
    scene.add(boil)
  }
  // 拉長的水滴：每顆是一片面向鏡頭、沿速度方向拉長的小方片
  const streakTex = (() => {
    const c = document.createElement('canvas'); c.width = 16; c.height = 64
    const x = c.getContext('2d'), gr = x.createRadialGradient(8, 32, 0, 8, 32, 32)
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.6)'); gr.addColorStop(1, 'rgba(255,255,255,0)')
    x.setTransform(0.25, 0, 0, 1, 6, 0); x.fillStyle = gr; x.fillRect(-32, 0, 64, 64)
    return new THREE.CanvasTexture(c)
  })()
  const ND = 900
  const drops = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: streakTex, color: 0xf2f8fa, transparent: true, depthWrite: false, fog: true }), ND)
  drops.frustumCulled = false
  drops.renderOrder = 6
  scene.add(drops)
  const dp = [], dv = [], dl = new Float32Array(ND), ds = new Float32Array(ND)
  const spawnDrop = (i) => {
    const a = Math.random() * TAU, r = 0.4 + Math.random() * 1.4
    dp[i].set(impact.x + Math.cos(a) * r, POOL.water + 0.1 + Math.random() * 0.4, impact.z + Math.sin(a) * r * 1.2)
    // 大部分往外低低地甩，少數高高噴起
    const up = Math.random() < 0.25 ? 3.5 + Math.random() * 3 : 1.2 + Math.random() * 2.2
    const out = 1.2 + Math.random() * 3
    dv[i].set(Math.cos(a) * out, up, Math.sin(a) * out * 1.2)
    dl[i] = 0; ds[i] = 0.025 + Math.random() * 0.045
  }
  for (let i = 0; i < ND; i++) { dp.push(new THREE.Vector3()); dv.push(new THREE.Vector3()); spawnDrop(i); dl[i] = Math.random() }
  const _m4 = new THREE.Matrix4(), _x = new THREE.Vector3(), _y = new THREE.Vector3(), _z = new THREE.Vector3(), _vd = new THREE.Vector3()
  const updateDrops = (dt, cam) => {
    for (let i = 0; i < ND; i++) {
      dv[i].y -= 9.8 * dt
      dp[i].addScaledVector(dv[i], dt)
      dl[i] += dt
      if (dp[i].y < POOL.water || dl[i] > 2) spawnDrop(i)
      // 面向鏡頭、沿速度拉長（長度 ≈ 一格裡走的距離 × 3，像相機的動態模糊）
      _z.subVectors(cam.position, dp[i]).normalize()
      _vd.copy(dv[i]).addScaledVector(_z, -dv[i].dot(_z))
      const sp = _vd.length() + 1e-4
      _y.copy(_vd).divideScalar(sp)
      _x.crossVectors(_y, _z).normalize()
      const len = ds[i] * 2 + sp * 0.045, w = ds[i]
      _m4.makeBasis(_x.multiplyScalar(w), _y.multiplyScalar(len), _z)
      _m4.setPosition(dp[i])
      drops.setMatrixAt(i, _m4)
    }
    drops.instanceMatrix.needsUpdate = true
  }
  // 水霧（照瀑布影片）：面向鏡頭的方片，用捲動的雜訊貼圖做成一絲一絲、一直在翻的霧（不是一顆顆圓球）。三種：
  // 1. 落點翻滾上來的大團霧：往上捲、往池子那邊（遠離山）擴散，越長越大
  // 2. 沿瀑布兩側飄出來的細霧
  // 3. 貼著水面往外滾的低霧（壓扁）
  // 碰到水面的地方慢慢淡掉（沒有一條硬邊），每片自己轉、自己長大
  const MIST = [
    { n: 70, life: [5, 8], size: [1.2, 4.6], alpha: 0.55, squash: 1,   // 落點的水霧：看得到後面的水花，不是一大團白
      spawn: (p, v) => { p.set(impact.x + rs(1.2), POOL.water + 0.15 + Math.random() * 0.6, impact.z + rs(1.8)); v.set(-0.45 - Math.random() * 0.9, 0.3 + Math.random() * 0.7, rs(1.3)) } },
    { n: 45, life: [3, 5.5], size: [0.7, 3.0], alpha: 0.6, squash: 1,
      spawn: (p, v) => { const y = POOL.water + 1 + Math.random() ** 0.7 * 13; const r = mtnR(Math.PI, y) + 0.9 + 0.28 * Math.sqrt(Math.max(0, 30.5 - y)); p.set(MTN.x - Math.min(r, rampInner(y) - 0.4), y, MTN.z + rs(1.6)); v.set(-0.35 - Math.random() * 0.6, -0.25 - Math.random() * 0.4, rs(0.6)) } },
    { n: 30, life: [7, 11], size: [2.5, 8.0], alpha: 0.45, squash: 0.35,
      spawn: (p, v) => { p.set(impact.x - 0.5 + rs(1.5), POOL.water + 0.12, impact.z + rs(2.0)); const a = Math.PI + rs(1.8); v.set(Math.cos(a) * (0.5 + Math.random() * 0.7), 0.02, Math.sin(a) * (0.5 + Math.random() * 0.7)) } },
  ]
  function rs(k) { return (Math.random() - 0.5) * 2 * k }
  const NM = MIST.reduce((a, m) => a + m.n, 0)
  const mGeo = new THREE.InstancedBufferGeometry().copy(new THREE.PlaneGeometry(1, 1))
  const iPos = new THREE.InstancedBufferAttribute(new Float32Array(NM * 3), 3), iDat = new THREE.InstancedBufferAttribute(new Float32Array(NM * 4), 4), iSq = new THREE.InstancedBufferAttribute(new Float32Array(NM), 1)
  iPos.setUsage(THREE.DynamicDrawUsage); iDat.setUsage(THREE.DynamicDrawUsage)
  mGeo.setAttribute('iPos', iPos); mGeo.setAttribute('iDat', iDat); mGeo.setAttribute('iSq', iSq)
  mGeo.instanceCount = NM
  const mistMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, fog: true,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uNoise: { value: null }, uT: { value: 0 }, uWater: { value: POOL.water }, uDay: dayLight }]),
    vertexShader: `
      attribute vec3 iPos; attribute vec4 iDat; attribute float iSq;
      varying vec2 vUv; varying float vA; varying float vRot; varying float vSeed; varying float vY;
      #include <fog_pars_vertex>
      void main() {
        vUv = uv; vA = iDat.y; vRot = iDat.z; vSeed = iDat.w;
        vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
        vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
        vec3 wp = iPos + (right * position.x + up * position.y * iSq) * iDat.x;
        vY = wp.y;
        vec4 mvPosition = viewMatrix * vec4(wp, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: `
      uniform sampler2D uNoise; uniform float uT; uniform float uWater; uniform float uDay;
      varying vec2 vUv; varying float vA; varying float vRot; varying float vSeed; varying float vY;
      #include <fog_pars_fragment>
      void main() {
        vec2 q = vUv - 0.5;
        float r = length(q) * 2.0;
        float cs = cos(vRot), sn = sin(vRot);
        vec2 p = vec2(cs * q.x - sn * q.y, sn * q.x + cs * q.y);
        // 兩層雜訊往不同方向捲：一絲一絲、一直在翻
        float n1 = texture2D(uNoise, p * 0.8 + vSeed + vec2(uT * 0.025, -uT * 0.04)).r;
        float n2 = texture2D(uNoise, p * 1.9 - vSeed * 1.7 + vec2(-uT * 0.05, uT * 0.03)).r;
        float n = n1 * 0.62 + n2 * 0.38;
        float mask = smoothstep(1.0, 0.15, r + (n - 0.5) * 0.7);
        float a = mask * smoothstep(0.18, 0.68, n) * vA;
        a *= smoothstep(uWater, uWater + 0.4, vY);                       // 碰到水面淡掉
        vec3 col = mix(vec3(0.8, 0.86, 0.88), vec3(0.97, 0.99, 1.0), clamp(vUv.y * 0.6 + n * 0.5, 0.0, 1.0));
        col *= mix(0.1, 1.0, uDay);   // 不受光的水霧，晚上跟著暗
        gl_FragColor = vec4(col, a);
        #include <fog_fragment>
      }`,
  })
  mistMat.uniforms.uNoise.value = T.mistNoiseTex()
  const mist = new THREE.Mesh(mGeo, mistMat)
  mist.frustumCulled = false; mist.renderOrder = 7
  scene.add(mist)
  const mP = [], mV = [], mL = new Float32Array(NM), mSpan = new Float32Array(NM), mKind = new Uint8Array(NM), mRot = new Float32Array(NM), mSpin = new Float32Array(NM)
  {
    let i = 0
    MIST.forEach((M, k) => { for (let j = 0; j < M.n; j++, i++) { mKind[i] = k; mP.push(new THREE.Vector3()); mV.push(new THREE.Vector3()); iSq.array[i] = M.squash; iDat.array[i * 4 + 3] = Math.random() * 10 } })
  }
  const spawnMist = (i) => {
    const M = MIST[mKind[i]]
    M.spawn(mP[i], mV[i])
    mL[i] = 0; mSpan[i] = M.life[0] + Math.random() * (M.life[1] - M.life[0])
    mRot[i] = Math.random() * TAU; mSpin[i] = rs(0.25)
  }
  for (let i = 0; i < NM; i++) { spawnMist(i); mL[i] = Math.random() * mSpan[i] }
  const updateMist = (dt) => {
    mistMat.uniforms.uT.value += dt
    for (let i = 0; i < NM; i++) {
      const M = MIST[mKind[i]]
      mL[i] += dt
      if (mL[i] > mSpan[i]) spawnMist(i)
      mP[i].addScaledVector(mV[i], dt)
      mV[i].multiplyScalar(1 - dt * 0.18)
      if (mP[i].y < POOL.water + 0.1) mP[i].y = POOL.water + 0.1
      mRot[i] += mSpin[i] * dt
      const f = mL[i] / mSpan[i]
      iPos.array.set([mP[i].x, mP[i].y, mP[i].z], i * 3)
      iDat.array[i * 4] = M.size[0] + (M.size[1] - M.size[0]) * Math.sqrt(f)          // 越長越大
      iDat.array[i * 4 + 1] = M.alpha * Math.min(1, f * 6) * (1 - f) ** 1.3             // 很快出現、慢慢散掉
      iDat.array[i * 4 + 2] = mRot[i]
    }
    iPos.needsUpdate = true; iDat.needsUpdate = true
  }
  out.mist = { update(dt, cam) { updateDrops(dt, cam); updateMist(dt) } }
  out.fallBase = impact
  return out
}

export function rockGeometry(detail = 1, seed = 0) {
  const g = new THREE.IcosahedronGeometry(1, detail)
  const p = g.attributes.position
  for (let i = 0; i < p.count; i++) {
    const v = new THREE.Vector3().fromBufferAttribute(p, i)
    const k = 1 + 0.35 * noise3(v.x * 1.7 + seed, v.y * 1.7, v.z * 1.7)
    v.multiplyScalar(k)
    p.setXYZ(i, v.x, v.y, v.z)
  }
  g.computeVertexNormals()
  return g
}

/* ---------- 環山空中步道 ---------- */
export function buildRamp(scene) {
  const N = 900
  const deckP = [], deckU = [], deckI = []
  const sideP = [], sideI = []
  const glassP = [], glassI = [], edgeP = [], edgeI = [], ledP = [], ledI = []
  const railIn = [], railOut = []
  let len = 0, prev = null
  const TH = 0.4, GH = 1.08   // 底板厚、玻璃高
  // 只有跟觀景台同一層的那一段才算「在觀景台上」；下面幾圈剛好從觀景台底下經過，欄杆不能拿掉
  const inDeck = (x, z, y) => Math.abs(y - DECK.y) < 1.5 && Math.hypot(x - DECK.x, z - DECK.z) < DECK.r - 0.1
  // 觀景台欄杆那一圈（跟步道欄杆一樣往內縮 6 公分）：步道外側欄杆進到這圈裡面才拿掉，兩邊的欄杆剛好接在一起
  const RR = DECK.r - 0.06
  const inRing = (x, z, y) => Math.abs(y - DECK.y) < 1.5 && Math.hypot(x - DECK.x, z - DECK.z) < RR - 0.01
  const at = (s, r) => {
    const p = rampSample(s)
    return new THREE.Vector3(MTN.x + r * Math.cos(p.th), p.y, MTN.z + r * Math.sin(p.th))
  }
  const lens = []
  for (let k = 0; k <= N; k++) {
    const s = k / N, p = rampSample(s)
    const A = at(s, p.ri), B = at(s, p.ro)
    const mid = A.clone().add(B).multiplyScalar(0.5)
    if (prev) len += mid.distanceTo(prev)
    prev = mid
    lens.push(len)
    deckP.push(A.x, A.y, A.z, B.x, B.y, B.z)
    deckU.push(0, len / 2, 1, len / 2)
    // 側板＋底板：內上、內下、外下、外上
    sideP.push(A.x, A.y, A.z, A.x, A.y - TH, A.z, B.x, B.y - TH, B.z, B.x, B.y, B.z)
    // 玻璃：內外各一道，稍微往內縮，夾在不鏽鋼柱之間
    const Ai = at(s, p.ri + 0.06), Bi = at(s, p.ro - 0.06)
    glassP.push(Ai.x, Ai.y + 0.08, Ai.z, Ai.x, Ai.y + GH, Ai.z, Bi.x, Bi.y + 0.08, Bi.z, Bi.x, Bi.y + GH, Bi.z)
    // 玻璃頂端的厚度邊（低鐵玻璃側面看是淡綠色）
    edgeP.push(Ai.x, Ai.y + GH - 0.018, Ai.z, Ai.x, Ai.y + GH, Ai.z, Bi.x, Bi.y + GH - 0.018, Bi.z, Bi.x, Bi.y + GH, Bi.z)
    // 側板上的 LED 燈條（內外兩側）
    const Ao = at(s, p.ri - 0.012), Bo = at(s, p.ro + 0.012)
    ledP.push(Ao.x, Ao.y - 0.09, Ao.z, Ao.x, Ao.y - 0.06, Ao.z, Bo.x, Bo.y - 0.09, Bo.z, Bo.x, Bo.y - 0.06, Bo.z)
    railIn.push(new THREE.Vector3(Ai.x, Ai.y + GH + 0.03, Ai.z))
    railOut.push(new THREE.Vector3(Bi.x, Bi.y + GH + 0.03, Bi.z))
  }
  const quads = (I, k, skipIn, skipOut) => {
    const s = k * 4, t = s + 4
    if (!skipIn) I.push(s, t, s + 1, s + 1, t, t + 1)
    if (!skipOut) I.push(s + 2, t + 2, s + 3, s + 3, t + 2, t + 3)
  }
  for (let k = 0; k < N; k++) {
    const a = k * 2, b = a + 2
    deckI.push(a, b, a + 1, a + 1, b, b + 1)
    const s = k * 4, t = s + 4
    // 跟觀景台重疊的那段：外側的側板和燈條不畫（以前側板的上緣會變成一根金屬條橫過平台地板）
    const pk = rampSample(k / N), Bk = at(k / N, pk.ro), Bk1 = at((k + 1) / N, rampSample((k + 1) / N).ro)
    const outOnDeck = inDeck(Bk.x, Bk.z, Bk.y) || inDeck(Bk1.x, Bk1.z, Bk1.y)
    for (let f = 0; f < 3; f++) if (!(outOnDeck && f >= 1)) sideI.push(s + f, t + f, s + f + 1, s + f + 1, t + f, t + f + 1)
    quads(ledI, k, false, outOnDeck)
    // 起點前 0.6 公尺不裝欄杆；跟觀景台重疊的那段外側欄杆拿掉
    const p = rampSample(k / N)
    if (p.y - RAMP.y0 < 0.6) continue
    const B = at(k / N, p.ro - 0.06), B1 = at((k + 1) / N, rampSample((k + 1) / N).ro - 0.06)
    const cut = inRing(B.x, B.z, B.y) || inRing(B1.x, B1.z, B1.y)
    quads(glassI, k, false, cut)
    quads(edgeI, k, false, cut)
  }
  const mk = (P, I, U) => {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3))
    if (U) g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2))
    g.setIndex(I)
    g.computeVertexNormals()
    return g
  }
  const wood = T.woodDeckTex()
  const deckMat = new THREE.MeshStandardMaterial({ map: wood, roughness: 0.72, metalness: 0.05, side: THREE.DoubleSide })
  const steel = new THREE.MeshStandardMaterial({ color: 0xd9dddd, roughness: 0.5, metalness: 0.35, side: THREE.DoubleSide })
  const stainless = new THREE.MeshStandardMaterial({ color: 0xf2f5f5, roughness: 0.28, metalness: 0.55, envMapIntensity: 1.6 })
  // 玻璃：正面幾乎全透明，斜看越來越反光（菲涅耳），反射天空和周圍的綠
  const glassMat = new THREE.MeshPhysicalMaterial({ color: 0xdff0ee, transparent: true, opacity: 0.08, roughness: 0.03, metalness: 0, envMapIntensity: 2.2, clearcoat: 1, clearcoatRoughness: 0.02, side: THREE.DoubleSide, depthWrite: false })
  glassMat.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <opaque_fragment>', `
      float fres = pow(1.0 - abs(dot(normalize(vNormal), normalize(vViewPosition))), 2.5);
      diffuseColor.a = mix(diffuseColor.a, 0.62, fres);
      outgoingLight += vec3(0.04, 0.07, 0.06) * fres;
      #include <opaque_fragment>`)
  }
  glassMat.customProgramCacheKey = () => 'fresnelGlass'
  const edgeMat = new THREE.MeshStandardMaterial({ color: 0x8fc4b2, roughness: 0.1, transparent: true, opacity: 0.85 })
  const ledMat = new THREE.MeshStandardMaterial({ color: 0xfff2d8, emissive: 0xffe2b0, emissiveIntensity: 1.6, roughness: 0.4 })
  ledMat.userData.lamp = [0.6, 3.5]   // 日夜：白天、晚上的發光強度
  const deck = new THREE.Mesh(mk(deckP, deckI, deckU), deckMat)
  deck.receiveShadow = deck.castShadow = true
  const side = new THREE.Mesh(mk(sideP, sideI), steel)
  side.castShadow = true
  const glass = new THREE.Mesh(mk(glassP, glassI), glassMat)
  glass.renderOrder = 4
  const edge = new THREE.Mesh(mk(edgeP, edgeI), edgeMat)
  edge.renderOrder = 5
  scene.add(deck, side, glass, edge, new THREE.Mesh(mk(ledP, ledI), ledMat))

  // 扶手（不鏽鋼圓管，壓在玻璃頂上）
  const startK = railIn.findIndex((v) => v.y - GH - RAMP.y0 > 0.6)
  const rails = [
    new THREE.TubeGeometry(new THREE.CatmullRomCurve3(railIn.slice(startK)), 900, 0.035, 10),
    ...splitRuns(railOut.slice(startK), (v) => !inRing(v.x, v.z, v.y - GH - 0.03)).map((run) => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(run), Math.max(8, run.length), 0.035, 10)),
  ]
  // 玻璃之間的不鏽鋼立柱：每 1.5 公尺一支，順便當作玻璃分片的接縫
  const posts = []
  const postGeo = new THREE.BoxGeometry(0.05, GH + 0.03, 0.05).translate(0, (GH + 0.03) / 2, 0)
  const shoe = new THREE.BoxGeometry(0.09, 0.12, 0.09).translate(0, 0.06, 0)
  let nextPost = 0
  for (let k = startK; k <= N; k++) {
    if (lens[k] < nextPost) continue
    nextPost = lens[k] + 1.5
    const s = k / N, p = rampSample(s)
    for (const r of [p.ri + 0.06, p.ro - 0.06]) {
      const q = at(s, r)
      if (r > p.ri + 1 && inRing(q.x, q.z, q.y)) continue
      for (const g of [postGeo, shoe]) posts.push(g.clone().rotateY(-p.th).translate(q.x, q.y, q.z))
    }
  }
  scene.add(new THREE.Mesh(mergeGeometries([...rails, ...posts.map((g) => g.toNonIndexed())].map((g) => (g.index ? g.toNonIndexed() : g))), stainless))

  // 底下的橫樑：每 2.4 公尺一根工字樑，從下面看才有結構感
  {
    const list = []
    const beam = new THREE.BoxGeometry(RAMP.width + 0.3, 0.22, 0.14)
    let next = 0
    for (let k = 0; k <= N; k++) {
      if (lens[k] < next) continue
      next = lens[k] + 2.4
      const s = k / N, p = rampSample(s)
      const c = at(s, (p.ri + p.ro) / 2)
      list.push(beam.clone().rotateY(-p.th).translate(c.x, c.y - TH - 0.11, c.z))
    }
    const m = new THREE.Mesh(mergeGeometries(list), steel)
    m.castShadow = true
    scene.add(m)
  }

  // 支撐：第一圈用落地柱（混凝土基座＋底板＋柱頭托架），上面幾圈用一對斜撐插進山壁（壁上有錨定鋼板），
  // 瀑布前面不能插進山壁，改用吊桿掛在上一圈步道底下
  const beams = [], plates = [], concrete = []
  const col = new THREE.CylinderGeometry(0.16, 0.2, 1, 16).translate(0, 0.5, 0)
  const footing = new THREE.CylinderGeometry(0.42, 0.48, 0.35, 20).translate(0, 0.05, 0)
  const basePlate = new THREE.BoxGeometry(0.62, 0.04, 0.62).translate(0, 0.24, 0)
  const capArm = new THREE.BoxGeometry(0.16, 0.12, RAMP.width * 0.85)
  const anchor = new THREE.BoxGeometry(0.06, 0.55, 0.55)
  const bolts = [], boltGeo = new THREE.CylinderGeometry(0.025, 0.025, 0.08, 8).rotateZ(Math.PI / 2)
  const turnRise = (RAMP.y1 - RAMP.y0) / RAMP.turns
  const wallPoint = (th, y) => { const r = mtnR(th, y) - 0.35; return new THREE.Vector3(MTN.x + r * Math.cos(th), y, MTN.z + r * Math.sin(th)) }
  const addAnchor = (q, th) => {
    plates.push(anchor.clone().rotateY(-th).translate(q.x, q.y, q.z))
    for (const [dy, dt] of [[0.18, 0.18], [0.18, -0.18], [-0.18, 0.18], [-0.18, -0.18]]) {
      const b = boltGeo.clone().rotateY(-th)
      const off = new THREE.Vector3(-Math.sin(th), 0, Math.cos(th)).multiplyScalar(dt)
      bolts.push(b.translate(q.x + off.x + Math.cos(th) * 0.04, q.y + dy, q.z + off.z + Math.sin(th) * 0.04))
    }
  }
  let acc = 0
  for (let k = 1; k <= N; k++) {
    const s = k / N, p = rampSample(s)
    acc += at(s, (p.ri + p.ro) / 2).distanceTo(at((k - 1) / N, (p.ri + p.ro) / 2))
    if (acc < 5) continue
    acc = 0
    const firstTurn = (s * RAMP.turns) < 1
    const waterfall = Math.abs(angDiff(p.th, Math.PI)) < 0.35
    if (firstTurn) {
      if (p.y - RAMP.y0 < 0.9) continue
      // 內外各一根柱子，柱頭用一支橫向托架撐住整個步道寬
      const mid = at(s, (p.ri + p.ro) / 2)
      plates.push(capArm.clone().rotateY(-p.th + Math.PI / 2).rotateY(0).translate(mid.x, mid.y - TH - 0.28, mid.z))
      for (const r of [p.ro - 0.3, p.ri + 0.3]) {
        const q = at(s, r)
        if (poolQ(q.x, q.z) < 1.15) continue           // 池子裡不立柱
        const gy = terrainHeight(q.x, q.z)
        const h = q.y - TH - 0.34 - gy
        if (h < 0.3) continue
        beams.push(col.clone().scale(1, h, 1).translate(q.x, gy, q.z))
        concrete.push(footing.clone().translate(q.x, gy, q.z))
        plates.push(basePlate.clone().translate(q.x, gy, q.z))
        addCollider(q.x, q.z, 0.3, q.y - 0.5)
      }
    } else if (waterfall) {
      // 吊桿：外緣、內緣各一根，往上掛在上一圈步道的底樑
      if (s * RAMP.turns + 1 > RAMP.turns) continue
      for (const r of [p.ro - 0.25, p.ri + 0.25]) {
        const q = at(s, r); q.y -= TH
        const top = q.clone(); top.y = q.y + turnRise - 0.15
        beams.push(beamBetween(q, top, 0.035))
        plates.push(new THREE.BoxGeometry(0.14, 0.1, 0.14).translate(q.x, q.y, q.z), new THREE.BoxGeometry(0.14, 0.1, 0.14).translate(top.x, top.y, top.z))
      }
    } else {
      // 一對斜撐：外緣往下斜插進山壁、內緣水平拉到山壁；兩端都有鋼板
      for (const dth of [-0.035, 0.035]) {
        const th = p.th + dth
        const top = at(s, p.ro - 0.3); top.y -= TH
        const bot = wallPoint(th, p.y - 3.4)
        beams.push(beamBetween(top, bot, 0.1))
        addAnchor(bot, th)
      }
      const top2 = at(s, p.ri + 0.2); top2.y -= TH
      const w2 = wallPoint(p.th, p.y - TH)
      beams.push(beamBetween(top2, w2, 0.09))
      addAnchor(w2, p.th)
    }
  }

  // 觀景台
  const dg = new THREE.CircleGeometry(DECK.r, 48).rotateX(-Math.PI / 2)
  const du = dg.attributes.uv
  for (let i = 0; i < du.count; i++) du.setXY(i, du.getX(i) * DECK.r * 0.5, du.getY(i) * DECK.r)
  const platform = new THREE.Mesh(dg, new THREE.MeshStandardMaterial({ map: T.woodDeckTex(false), roughness: 0.72, metalness: 0.05 }))
  platform.position.set(DECK.x, DECK.y + 0.012, DECK.z)   // 蓋在步道末段上面（同高，差 1 公分才不會閃）
  platform.receiveShadow = platform.castShadow = true
  const rim = new THREE.Mesh(new THREE.CylinderGeometry(DECK.r, DECK.r, TH, 48, 1, true), steel)
  rim.position.set(DECK.x, DECK.y - TH / 2, DECK.z)
  const under = new THREE.Mesh(new THREE.CircleGeometry(DECK.r, 48).rotateX(Math.PI / 2), steel)
  under.position.set(DECK.x, DECK.y - TH, DECK.z)
  scene.add(platform, rim, under)
  // 觀景台欄杆：只有步道進來的那一段開口。開口兩端剛好接上步道內側（山壁那邊、步道終點）和外側的欄杆；
  // 跟步道一樣有玻璃頂邊、不鏽鋼立柱（以前沒有立柱、扶手跟步道扶手之間還斷了半公尺，看起來像破洞）
  {
    const aTan = Math.atan2(MTN.z - DECK.z, MTN.x - DECK.x)   // 平台內緣貼著步道終點內緣的地方
    const ringPt = (a) => new THREE.Vector3(DECK.x + RR * Math.cos(a), DECK.y, DECK.z + RR * Math.sin(a))
    const roEnd = rampSample(1).ro - 0.06
    // 從貼山壁那點往步道進來的方向找：圈上的點離山的距離超過步道外側欄杆，就是開口的另一端
    let aEnd = aTan
    for (let i = 1; i < 4000; i++) {
      const a = aTan + i * 0.0015, q = ringPt(a)
      if (Math.hypot(q.x - MTN.x, q.z - MTN.z) >= roEnd) { aEnd = a; break }
    }
    // 開口方向要對：步道是從 aEnd 那邊進來的（那邊步道高度跟平台一樣）
    const span = TAU - (aEnd - aTan)
    const M = Math.ceil(span / 0.03)
    const gp = [], gi = [], ep = [], ring = []
    for (let i = 0; i <= M; i++) {
      const q = ringPt(aEnd + span * (i / M))
      gp.push(q.x, q.y + 0.08, q.z, q.x, q.y + GH, q.z)
      ep.push(q.x, q.y + GH - 0.018, q.z, q.x, q.y + GH, q.z)
      ring.push(new THREE.Vector3(q.x, q.y + GH + 0.03, q.z))
      if (i > 0) gi.push((i - 1) * 2, i * 2, (i - 1) * 2 + 1, (i - 1) * 2 + 1, i * 2, i * 2 + 1)
    }
    scene.add(Object.assign(new THREE.Mesh(mk(gp, gi), glassMat), { renderOrder: 4 }))
    scene.add(Object.assign(new THREE.Mesh(mk(ep, gi), edgeMat), { renderOrder: 5 }))
    const dposts = []
    const nP = Math.max(2, Math.round(span * RR / 1.5))
    for (let i = 0; i <= nP; i++) {
      const a = aEnd + span * (i / nP), q = ringPt(a)
      for (const g of [postGeo, shoe]) dposts.push(g.clone().rotateY(-a).translate(q.x, q.y, q.z).toNonIndexed())
    }
    const tube = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(ring), M * 2, 0.035, 10)
    scene.add(new THREE.Mesh(mergeGeometries([tube.toNonIndexed(), ...dposts]), stainless))
    if (typeof window !== 'undefined') window.__deckRing = { aTan, aEnd, span, RR }
  }
  {
    const e = rampSample(1)
    for (const da of [-0.35, 0, 0.35]) {
      const th = e.th + da * 0.4
      const rIn = mtnR(th, DECK.y - 6) - 0.4
      const inner = new THREE.Vector3(MTN.x + rIn * Math.cos(th), DECK.y - 6, MTN.z + rIn * Math.sin(th))
      const a = Math.atan2(DECK.z - MTN.z, DECK.x - MTN.x) + da
      const outer = new THREE.Vector3(DECK.x + Math.cos(a) * DECK.r * 0.8, DECK.y - TH, DECK.z + Math.sin(a) * DECK.r * 0.8)
      beams.push(beamBetween(outer, inner, 0.22))
    }
  }
  const flat = (list) => mergeGeometries(list.map((b) => (b.index ? b.toNonIndexed() : b)))
  const plateMesh = new THREE.Mesh(flat([...plates, ...bolts]), new THREE.MeshStandardMaterial({ color: 0x9aa2a3, roughness: 0.45, metalness: 0.6 }))
  plateMesh.castShadow = true
  const conc = new THREE.Mesh(flat(concrete), new THREE.MeshStandardMaterial({ color: 0xb8b4aa, roughness: 0.95 }))
  conc.receiveShadow = true
  scene.add(plateMesh, conc)
  const beamMesh = new THREE.Mesh(flat(beams), steel)
  beamMesh.castShadow = true
  scene.add(beamMesh)
}

function splitRuns(arr, keep) {
  const runs = []
  let cur = []
  for (const v of arr) {
    if (keep(v)) cur.push(v)
    else { if (cur.length > 1) runs.push(cur); cur = [] }
  }
  if (cur.length > 1) runs.push(cur)
  return runs
}

function beamBetween(a, b, r) {
  const d = b.clone().sub(a), L = d.length()
  const g = new THREE.CylinderGeometry(r, r, L, 12).translate(0, L / 2, 0)
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize())
  g.applyQuaternion(q).translate(a.x, a.y, a.z)
  return g
}
