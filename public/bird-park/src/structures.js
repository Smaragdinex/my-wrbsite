// 溫室本體、地面、步道、雲霧山、瀑布、空中步道
import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import {
  TAU, DOME, MTN, POOL, RAMP, DECK, PATHS, clamp, smoothstep, lerp, angDiff,
  domeRho, terrainHeight, mtnR, rampSample, rampHeights, rampInner, poolQ, addCollider,
} from './layout.js'
import { fbm3, noise3, mulberry32 } from './noise.js'
import * as T from './textures.js'

const tmpM = new THREE.Matrix4()

/* ---------- 天空與外面的城市 ---------- */
export function buildSky(scene) {
  const geo = new THREE.SphereGeometry(900, 32, 16)
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { sunDir: { value: new THREE.Vector3(-0.45, 0.8, 0.35).normalize() } },
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `varying vec3 vDir; uniform vec3 sunDir;
      void main(){
        float h = clamp(vDir.y, -0.2, 1.0);
        vec3 top = vec3(0.30,0.55,0.85), hor = vec3(0.86,0.91,0.93), gnd = vec3(0.55,0.6,0.58);
        vec3 c = h > 0.0 ? mix(hor, top, pow(h, 0.55)) : mix(hor, gnd, -h*5.0);
        float s = max(dot(normalize(vDir), sunDir), 0.0);
        c += vec3(1.0,0.9,0.7) * (pow(s, 600.0) * 4.0 + pow(s, 12.0) * 0.25);
        gl_FragColor = vec4(c, 1.0);
        #include <colorspace_fragment>
      }`,
  })
  const sky = new THREE.Mesh(geo, mat)
  sky.renderOrder = -10
  scene.add(sky)

  // 外面的草地
  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(700, 64).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0x6f8a58, roughness: 1 })
  )
  ground.position.y = -1.6   // 要低於池底（-1.5），不然整片蓋住池水
  ground.receiveShadow = true
  scene.add(ground)

  // 遠方天際線
  const rnd = mulberry32(77)
  const box = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0)
  const n = 90
  const city = new THREE.InstancedMesh(box, new THREE.MeshStandardMaterial({ color: 0xa9b6bf, roughness: 0.8 }), n)
  for (let i = 0; i < n; i++) {
    const a = rnd() * TAU, d = 330 + rnd() * 200
    const h = 15 + rnd() ** 2 * 70, w = 14 + rnd() * 24
    tmpM.compose(new THREE.Vector3(Math.cos(a) * d, 0, Math.sin(a) * d), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rnd() * TAU, 0)), new THREE.Vector3(w, h, w * (0.6 + rnd() * 0.8)))
    city.setMatrixAt(i, tmpM)
  }
  scene.add(city)
  return { sky, skyMat: mat }
}

/* ---------- 玻璃圓頂 ---------- */
function domeGeometry(scale = 1, nu = 160, nv = 48) {
  const pos = [], uv = [], idx = []
  for (let j = 0; j <= nv; j++) {
    const v = j / nv, a = v * Math.PI / 2
    const rho = Math.cos(a), y = DOME.H * Math.sin(a) * scale
    for (let i = 0; i <= nu; i++) {
      const u = i / nu, p = u * TAU
      pos.push(DOME.A * scale * rho * Math.cos(p), y, DOME.B * scale * rho * Math.sin(p))
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

export function buildDome(scene) {
  const group = new THREE.Group()
  const glass = new THREE.Mesh(domeGeometry(1), new THREE.MeshStandardMaterial({
    color: 0xdfeff5, transparent: true, opacity: 0.1, roughness: 0.05, metalness: 0.1,
    side: THREE.DoubleSide, depthWrite: false,
  }))
  glass.renderOrder = 5
  group.add(glass)

  const grid = T.domeGridTex()
  grid.repeat.set(56, 14)
  const frame = new THREE.Mesh(domeGeometry(0.998), new THREE.MeshStandardMaterial({
    color: 0xe8ecee, map: grid, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.5, metalness: 0.4,
  }))
  frame.castShadow = true
  group.add(frame)

  // 主拱肋
  const ribs = []
  const RIBS = 20
  for (let k = 0; k < RIBS; k++) {
    const p = (k / RIBS) * TAU, pts = []
    for (let j = 0; j <= 24; j++) {
      const a = (j / 24) * Math.PI / 2 * 0.985
      pts.push(new THREE.Vector3(DOME.A * 0.99 * Math.cos(a) * Math.cos(p), DOME.H * 0.99 * Math.sin(a), DOME.B * 0.99 * Math.cos(a) * Math.sin(p)))
    }
    ribs.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 0.32, 6))
  }
  for (const v of [0.18, 0.42, 0.66, 0.86]) {
    const a = v * Math.PI / 2, pts = []
    for (let i = 0; i < 64; i++) {
      const p = (i / 64) * TAU
      pts.push(new THREE.Vector3(DOME.A * 0.99 * Math.cos(a) * Math.cos(p), DOME.H * 0.99 * Math.sin(a), DOME.B * 0.99 * Math.cos(a) * Math.sin(p)))
    }
    ribs.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), 128, 0.26, 6, true))
  }
  const ribMesh = new THREE.Mesh(mergeGeometries(ribs), new THREE.MeshStandardMaterial({ color: 0xf2f4f5, roughness: 0.45, metalness: 0.5 }))
  ribMesh.castShadow = true
  group.add(ribMesh)

  // 牆腳矮牆（入口留缺口）
  const wallPos = [], wallIdx = []
  const N = 240, s1 = 0.975, s2 = 0.99, H = 1.1
  for (let i = 0; i <= N; i++) {
    const p = (i / N) * TAU
    const c = Math.cos(p), s = Math.sin(p)
    for (const [sc, y] of [[s1, -0.5], [s1, H], [s2, H], [s2, -0.5]]) wallPos.push(DOME.A * sc * c, y, DOME.B * sc * s)
  }
  for (let i = 0; i < N; i++) {
    const p = ((i + 0.5) / N) * TAU
    const x = DOME.A * Math.cos(p), z = DOME.B * Math.sin(p)
    if (x < 0 && Math.abs(z) < 3.6) continue
    const a = i * 4, b = (i + 1) * 4
    for (let f = 0; f < 3; f++) wallIdx.push(a + f, b + f, a + f + 1, a + f + 1, b + f, b + f + 1)
  }
  const wg = new THREE.BufferGeometry()
  wg.setAttribute('position', new THREE.Float32BufferAttribute(wallPos, 3))
  wg.setIndex(wallIdx)
  wg.computeVertexNormals()
  const wall = new THREE.Mesh(wg, new THREE.MeshStandardMaterial({ color: 0xcfc8ba, roughness: 0.9, side: THREE.DoubleSide }))
  wall.receiveShadow = true
  group.add(wall)

  // 入口門框
  const steel = new THREE.MeshStandardMaterial({ color: 0x5a5f63, roughness: 0.4, metalness: 0.7 })
  const door = new THREE.Group()
  for (const z of [-3.4, 3.4]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.5, 4.2, 0.5), steel)
    post.position.set(0, 2.1, z); door.add(post)
  }
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 7.3), steel)
  lintel.position.set(0, 4.3, 0); door.add(lintel)
  const pane = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 4), new THREE.MeshStandardMaterial({ color: 0xbfd8e0, transparent: true, opacity: 0.25, roughness: 0.05, side: THREE.DoubleSide, depthWrite: false }))
  pane.rotation.y = Math.PI / 2; pane.position.set(0, 2, 0)
  door.add(pane)
  door.position.set(-DOME.A * 0.975, 0, 0)
  group.add(door)

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
    pos.setY(i, h)
    uv.setXY(i, x / 5, z / 5)
    const n = fbm3(x * 0.08, 0, z * 0.08, 3)
    c.setRGB(0.5 + n * 0.2, 0.56 + n * 0.18, 0.4 + n * 0.14)   // 偏暗的林下地面，草葉之間不會露出亮綠草坪
    const q = poolQ(x, z)
    if (q < 1.3) c.lerp(new THREE.Color(0.35, 0.3, 0.22), smoothstep(1.3, 0.8, q))
    if (domeRho(x, z) > 0.975) c.setRGB(0.75, 0.72, 0.65)
    col.push(c.r, c.g, c.b)
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
  g.computeVertexNormals()
  const ground = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: T.grassGroundTex(), vertexColors: true, roughness: 1 }))
  ground.receiveShadow = true
  scene.add(ground)

  // 步道帶
  const pav = T.paverTex()
  const pathMat = new THREE.MeshStandardMaterial({ map: pav, roughness: 0.85, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })
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
  const poolMat = new THREE.MeshStandardMaterial({ color: 0x1b4644, roughness: 0.05, metalness: 0.0, transparent: true, opacity: 0.93, envMapIntensity: 1.4 })
  poolMat.onBeforeCompile = (sh) => {
    sh.uniforms.uWT = waterTime; sh.uniforms.uRip = ripVal
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWp;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWp = (modelMatrix * vec4(transformed, 1.0)).xyz;')
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vWp;
        uniform float uWT;
        uniform vec4 uRip[${RIPPLES}];
        ${GLSL_NOISE}
        const vec2 FALL = vec2(${FX.toFixed(2)}, ${FZ.toFixed(2)});
        float foamLace(vec2 p) {
          float patchy = smoothstep(-0.2, 0.6, snoise(p * 0.7 + 11.0));
          return (smoothstep(0.62, 0.92, 1.0 - abs(snoise(p * 1.6))) * 0.7 + smoothstep(0.2, 0.75, snoise(p * 1.1 + 5.0)) * 0.5) * patchy;
        }
        float foamSpeck(vec2 p) { return smoothstep(0.62, 0.9, snoise(p * 7.0 + 3.0)); }
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
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.24, 0.32, 0.2), smoothstep(0.7, 1.0, q));
        diffuseColor.a *= mix(1.0, 0.75, smoothstep(0.8, 1.0, q));
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
  }
  const water = new THREE.Mesh(new THREE.CircleGeometry(1, 96).rotateX(-Math.PI / 2).scale(POOL.rx * 1.12, 1, POOL.rz * 1.12), poolMat)
  water.position.set(POOL.x, POOL.water, POOL.z)
  water.receiveShadow = true
  scene.add(water)

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
    const m = new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, depthWrite: false, side: THREE.DoubleSide, roughness: 0.35, emissive: 0xd8e8ea, emissiveIntensity: 0.55 })
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
          // 自由落體：越往下越快，流動的位置用 v - 速度×時間
          float fl = v - uWT * ${speed.toFixed(2)} * (1.0 + 1.4 * t);
          float x = u * W + ${seed.toFixed(1)};
          // 細長的水柱紋：沿流向拉得很長（y 的頻率比 x 低很多）
          float s1 = snoise(vec2(x * 1.8, fl * 0.05)) * 0.5 + 0.5;
          float s2 = snoise(vec2(x * 5.5, fl * 0.14 + 3.0)) * 0.5 + 0.5;
          float s3 = snoise(vec2(x * 15.0, fl * 0.4 + 9.0)) * 0.5 + 0.5;
          // 一團團往下掉的白色氣泡水（比條紋短、會被看到在往下走）
          float c1 = snoise(vec2(x * 1.1, fl * 0.45 + 5.0)) * 0.5 + 0.5;
          float c2 = snoise(vec2(x * 3.2, fl * 1.1 + 11.0)) * 0.5 + 0.5;
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
          vec3 clear = vec3(0.8, 0.88, 0.9), foam = vec3(0.97, 0.99, 1.0);
          float wh = smoothstep(0.4, 0.75, dens + ${white.toFixed(2)});
          diffuseColor.rgb = mix(clear, foam, wh);
          // 外層只畫白色的水花部分：透明的水疊在白色水柱上反而會變灰、看起來像髒斑
          diffuseColor.a = max(a * ${foamOnly ? 'wh * wh' : 'mix(0.22, 1.0, wh)'} * ${opacity.toFixed(2)}, solidA);
          ${foamOnly ? 'diffuseColor.rgb = foam;' : ''}`)
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance *= mix(0.8, 1.0, wh);')
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
    const m = new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, depthWrite: false, side: THREE.DoubleSide, roughness: 0.3, emissive: 0xdde9eb, emissiveIntensity: 0.55 })
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
          float fl = v - uWT * spd * (1.0 + 1.3 * t);
          // 每股自己的紋：沿流向很長的條紋＋往下掉的一團團白
          float s1 = snoise(vec2(u * 3.0 + id * 7.1, fl * 0.07)) * 0.5 + 0.5;
          float s2 = snoise(vec2(u * 8.0 + id * 3.3, fl * 0.22)) * 0.5 + 0.5;
          float c1 = snoise(vec2(u * 2.0 + id * 1.7, fl * 0.6)) * 0.5 + 0.5;
          // 橫向：中間厚、兩邊薄，邊緣隨流向抖動
          float e = 1.0 - abs(u * 2.0 - 1.0);
          float body = smoothstep(0.0, 0.55 + 0.25 * (c1 - 0.5), e);
          // 越往下越碎：用流動的雜訊挖洞，碎成一顆顆水滴
          float holes = snoise(vec2(u * 6.0 + id * 9.0, fl * 1.4)) * 0.5 + 0.5;
          float breakup = smoothstep(0.35, 1.0, t) * 0.75;
          float dens = (s1 * 0.5 + s2 * 0.25 + c1 * 0.25) * body;
          float a = smoothstep(0.12, 0.55, dens) * smoothstep(breakup - 0.1, breakup + 0.25, holes + 0.25);
          a *= smoothstep(0.0, 0.6, v) * thick;
          float wh = smoothstep(0.3, 0.7, dens + 0.15);
          diffuseColor.rgb = mix(vec3(0.82, 0.89, 0.91), vec3(0.98, 0.99, 1.0), wh);
          diffuseColor.a = a * mix(0.55, 1.0, wh);`)
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
    const m = new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, depthWrite: false, roughness: 0.7, emissive: 0xdfeaec, emissiveIntensity: 0.5 })
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
          diffuseColor.a = smoothstep(0.25, 0.7, n * 0.65 + n2 * 0.35 + vLp.y * 0.3) * edge * 0.95;`)
    }
    const boil = new THREE.Mesh(g, m)
    boil.scale.set(1.9, 0.9, 2.3)
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
  // 水霧：大團、慢慢往上捲、往外飄
  const NM = 150
  const mistTex = T.softDotTex()
  const mistMat = new THREE.PointsMaterial({ map: mistTex, size: 6.5, transparent: true, opacity: 0.36, depthWrite: false, vertexColors: true, color: 0xf6fafb })
  const mp = new Float32Array(NM * 3), mc = new Float32Array(NM * 4), mv = [], ml = new Float32Array(NM), mspan = new Float32Array(NM)
  const mg = new THREE.BufferGeometry()
  mg.setAttribute('position', new THREE.BufferAttribute(mp, 3)); mg.setAttribute('color', new THREE.BufferAttribute(mc, 4))
  const mist = new THREE.Points(mg, mistMat)
  mist.frustumCulled = false; mist.renderOrder = 7
  scene.add(mist)
  const spawnMist = (i) => {
    mp.set([impact.x + (Math.random() - 0.5) * 2, POOL.water + 0.2 + Math.random() * 0.8, impact.z + (Math.random() - 0.5) * 2.6], i * 3)
    mv[i].set(-0.4 - Math.random() * 0.8, 0.5 + Math.random() * 0.9, (Math.random() - 0.5) * 1.0)
    ml[i] = 0; mspan[i] = 3 + Math.random() * 3
  }
  for (let i = 0; i < NM; i++) { mv.push(new THREE.Vector3()); spawnMist(i); ml[i] = Math.random() * 5 }
  const updateMist = (dt) => {
    for (let i = 0; i < NM; i++) {
      ml[i] += dt
      if (ml[i] > mspan[i]) spawnMist(i)
      mp[i * 3] += mv[i].x * dt; mp[i * 3 + 1] += mv[i].y * dt; mp[i * 3 + 2] += mv[i].z * dt
      mv[i].multiplyScalar(1 - dt * 0.2)
      const f = ml[i] / mspan[i]
      mc[i * 4] = mc[i * 4 + 1] = mc[i * 4 + 2] = 1; mc[i * 4 + 3] = Math.min(1, f * 5) * (1 - f)
    }
    mg.attributes.position.needsUpdate = true; mg.attributes.color.needsUpdate = true
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
    for (let f = 0; f < 3; f++) sideI.push(s + f, t + f, s + f + 1, s + f + 1, t + f, t + f + 1)
    quads(ledI, k, false, false)
    // 起點前 0.6 公尺不裝欄杆；跟觀景台重疊的那段外側欄杆拿掉
    const p = rampSample(k / N)
    if (p.y - RAMP.y0 < 0.6) continue
    const B = at(k / N, p.ro)
    quads(glassI, k, false, inDeck(B.x, B.z, B.y))
    quads(edgeI, k, false, inDeck(B.x, B.z, B.y))
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
    ...splitRuns(railOut.slice(startK), (v) => !inDeck(v.x, v.z, v.y - GH)).map((run) => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(run), Math.max(8, run.length), 0.035, 10)),
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
      if (r > p.ri + 1 && inDeck(q.x, q.z, q.y)) continue
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
  const platform = new THREE.Mesh(dg, deckMat)
  platform.position.set(DECK.x, DECK.y + 0.005, DECK.z)
  platform.receiveShadow = platform.castShadow = true
  const rim = new THREE.Mesh(new THREE.CylinderGeometry(DECK.r, DECK.r, TH, 48, 1, true), steel)
  rim.position.set(DECK.x, DECK.y - TH / 2, DECK.z)
  const under = new THREE.Mesh(new THREE.CircleGeometry(DECK.r, 48).rotateX(Math.PI / 2), steel)
  under.position.set(DECK.x, DECK.y - TH, DECK.z)
  scene.add(platform, rim, under)
  // 觀景台欄杆：跟步道相接的地方留開口
  const gp = [], gi = [], ring = []
  const NR = 96
  let started = false
  for (let i = 0; i <= NR; i++) {
    const a = (i / NR) * TAU
    const x = DECK.x + DECK.r * Math.cos(a), z = DECK.z + DECK.r * Math.sin(a)
    const open = rampHeights(x, z).some((h) => Math.abs(h - DECK.y) < 0.6)
    gp.push(x, DECK.y + 0.08, z, x, DECK.y + GH, z)
    if (i > 0 && !open && started) gi.push((i - 1) * 2, i * 2, (i - 1) * 2 + 1, (i - 1) * 2 + 1, i * 2, i * 2 + 1)
    started = !open
    ring.push({ v: new THREE.Vector3(x, DECK.y + GH + 0.03, z), open })
  }
  scene.add(Object.assign(new THREE.Mesh(mk(gp, gi), glassMat), { renderOrder: 4 }))
  const runs = splitRuns(ring, (r) => !r.open).map((run) => run.map((r) => r.v))
  const deckRails = runs.filter((r) => r.length > 2).map((r) => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(r), r.length * 2, 0.035, 10))
  if (deckRails.length) scene.add(new THREE.Mesh(mergeGeometries(deckRails), stainless))
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
