// 2026-11-12 溪床與湖岸（使用者參考圖：清澈見底的溪——滿滿的鵝卵石、長青苔的圓石四周一圈白沫、水裡順著水流倒的水草）
// 模型：tools/make-streambed-kit.py → models/props/streambed_kit.glb（卵石 5 種、苔石 3 種、水草 3 種，頂點色）
// 擺放：兩條溪（ALP_STREAMS）的溪床和兩岸、山下湖（ALP_POND）和瀑布湖（YOSE.lake）的淺水帶；全部 InstancedMesh，遠了照大小自動不畫（lodRegister）
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { ALP_STREAMS, ALP_POND, YOSE, alpineHeight, alpineTrailDist, addCollider } from './layout.js'
import { mulberry32, fbm2 } from './noise.js'
import { lodRegister } from './lod.js'

const VER = new URL(import.meta.url).searchParams.get('v') ?? ''
const timeU = { value: 0 }
export const streambedTick = (t) => { timeU.value = t }

export async function buildStreambed(scene) {
  const gl = await new GLTFLoader().loadAsync(`models/props/streambed_kit.glb?v=${VER}`)
  const geo = {}
  gl.scene.updateMatrixWorld(true)
  gl.scene.traverse((o) => { if (o.isMesh) { const g = o.geometry.clone(); g.applyMatrix4(o.matrixWorld); if (g.attributes.color_1) { g.setAttribute('color', g.attributes.color_1); g.deleteAttribute('color_1') } geo[o.name] = g } })
  const G = new THREE.Group(); G.name = 'streambed'
  const rnd = mulberry32(20261112)
  const L = {}   // 零件 → [{ m: Matrix4, c: Color }]
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler()
  const put = (part, x, y, z, sx, sy, sz, yaw, c, tilt = 0) => (L[part] ||= []).push({ m: m4.compose(new THREE.Vector3(x, y, z), q.setFromEuler(e.set((rnd() - 0.5) * tilt, yaw, (rnd() - 0.5) * tilt, 'YXZ')), new THREE.Vector3(sx, sy, sz)).clone(), c })
  // 卵石的顏色（線性）：灰、藍灰、米、鐵鏽紅、奶白、深灰、帶綠——參考圖岸邊那一片五顏六色的小石頭
  const PAL = [[0.30, 0.30, 0.29], [0.22, 0.25, 0.28], [0.38, 0.31, 0.22], [0.33, 0.17, 0.10], [0.52, 0.49, 0.42], [0.11, 0.11, 0.115], [0.21, 0.26, 0.2], [0.42, 0.40, 0.38], [0.27, 0.21, 0.17]]
  const pebble = (x, z, water, big = 1) => {
    const h = alpineHeight(x, z), dep = water - h
    // ChatGPT：大小三群——65% 小礫（直徑 4～7 cm）、25% 卵石（7～15 cm）、10% 大卵石（15～34 cm）
    const u = rnd(), r = (u < 0.45 ? 0.03 + 0.02 * rnd() : u < 0.85 ? 0.05 + 0.04 * rnd() : 0.09 + 0.08 * rnd()) * big   /* 最小的那群放大到直徑 6～10 cm：再小的隔幾公尺就看不到，溪床又變回一片沙 */
    const p = PAL[Math.floor(rnd() * PAL.length)], wet = dep > -0.03 ? 0.62 : 1, k = (0.8 + 0.4 * rnd()) * wet   // 水裡和水線邊的石頭是濕的：深一點
    put('pebble_' + (rnd() < 0.12 ? (rnd() < 0.5 ? 2 : 4) : [0, 1, 3][Math.floor(rnd() * 3)]), x, h - r * 0.22, z, r * 2, r * 2 * (0.75 + 0.5 * rnd()), r * 2, rnd() * 6.283, new THREE.Color().setRGB(p[0] * k, p[1] * k, p[2] * k), 0.5)
  }
  const boulders = []
  /* ---------- 兩條溪 ---------- */
  for (const st of ALP_STREAMS) {
    const at = (s) => { let i = 0; while (i < st.length - 2 && st.S[i + 1] < s) i++; const t = (s - st.S[i]) / (st.S[i + 1] - st.S[i]), dx = st[i + 1][0] - st[i][0], dz = st[i + 1][1] - st[i][1], l = Math.hypot(dx, dz); return { x: st[i][0] + dx * t, z: st[i][1] + dz * t, dx: dx / l, dz: dz / l } }
    const half = (s) => st.halfAt ? st.halfAt(s) : 2.0
    const end = st.mouthS ? st.mouthS - 1 : st.len - 1
    let nb = 3.5 + rnd() * 3, nw = 1
    for (let s = 1; s < end; s += 0.2) {
      const c = at(s), hw = half(s), w = st.water(s), steep = Math.abs(st.water(s + 0.6) - st.water(s - 0.6)) > 0.3
      // 卵石：溪床整片＋兩岸 1.3 m（岸上越遠越稀）
      for (let k = 0; k < 20; k++) {   // 礫石灘一堆一堆（雜訊分群：有的地方鋪滿、有的露出沙），急流處少
        const o = (rnd() * 2 - 1) * (hw + 1.3), x = c.x - c.dz * o + (rnd() - 0.5) * 0.2, z = c.z + c.dx * o + (rnd() - 0.5) * 0.2
        if (Math.abs(o) > hw && rnd() < (Math.abs(o) - hw) / 1.3 * 0.8) continue
        if (alpineTrailDist(x, z) < 1.25) continue
        if (YOSE.inOutlet?.(x, z, 0.6)) continue   // 驗收第 11 條：湖接溪的水道裡（挖下去之後泡在水裡）不放卵石、溪岸植物
        if (fbm2(x * 0.55, z * 0.55, 2) < 0.26 + (steep ? 0.15 : 0) && rnd() < 0.45) continue
        pebble(x, z, w)
      }
      if (steep) continue
      // 長青苔的大圓石：5～9 m 一顆，站在淺水裡、頂面露出水面
      if ((nb -= 0.2) <= 0) {
        nb = 4.5 + rnd() * 4.5
        const o = (rnd() * 2 - 1) * hw * 0.62, x = c.x - c.dz * o, z = c.z + c.dx * o, dep = w - alpineHeight(x, z)
        if (dep > 0.05 && dep < 0.7 && alpineTrailDist(x, z) > 2.2) { const sz = 0.75 + rnd() * 0.75; boulders.push({ x, z, y: w, s: sz, yaw: rnd() * 6.283, v: Math.floor(rnd() * 3), flow: Math.atan2(-c.dz, c.dx) }) }
      }
      // 水草：水流慢、0.12～0.6 m 深的地方，一叢一叢順著水流倒
      if ((nw -= 0.2) <= 0) {
        nw = 0.3 + rnd() * 1.0
        const o = (rnd() * 2 - 1) * hw * 0.85, x = c.x - c.dz * o, z = c.z + c.dx * o, h = alpineHeight(x, z), dep = w - h
        if (dep > 0.12 && dep < 0.65) { const sc = (0.7 + rnd() * 0.7) * Math.min(1.3, dep / 0.3); put('weed_' + Math.floor(rnd() * 3), x, h + 0.01, z, sc, sc * Math.min(1, dep / 0.35), sc, Math.atan2(-c.dz, c.dx) + (rnd() - 0.5) * 0.5, new THREE.Color().setScalar(0.8 + 0.4 * rnd())) }
      }
    }
  }
  /* ---------- 兩座湖的淺水帶：水線上下一圈卵石、淺水裡的水草、幾顆苔石 ---------- */
  const shore = (cx, cz, rx, rz, water, nP, nW, nB) => {
    for (let i = 0, got = 0; i < nP * 30 && got < nP; i++) {
      const a = rnd() * 6.283, k = 0.72 + rnd() * 0.5, x = cx + Math.cos(a) * rx * k, z = cz + Math.sin(a) * rz * k, dep = water - alpineHeight(x, z)
      if (dep < -0.14 || dep > 0.5 || alpineTrailDist(x, z) < 1.25) continue
      if (YOSE.inOutlet?.(x, z, 0.6)) continue   // 驗收第 11 條：湖接溪的水道裡（挖下去之後泡在水裡）不放卵石、溪岸植物
      pebble(x, z, water, 1.1); got++
    }
    for (let i = 0, got = 0; i < nW * 40 && got < nW; i++) {
      const a = rnd() * 6.283, k = 0.6 + rnd() * 0.5, x = cx + Math.cos(a) * rx * k, z = cz + Math.sin(a) * rz * k, h = alpineHeight(x, z), dep = water - h
      if (dep < 0.15 || dep > 0.8) continue
      if (YOSE.inOutlet?.(x, z, 0.6)) continue   // 驗收第 11 條：湖接溪的水道裡（挖下去之後泡在水裡）不放卵石、溪岸植物
      const sc = 0.8 + rnd() * 0.8; put('weed_' + Math.floor(rnd() * 3), x, h + 0.01, z, sc, sc * Math.min(1.2, dep / 0.35), sc, rnd() * 6.283, new THREE.Color().setScalar(0.8 + 0.4 * rnd())); got++
    }
    for (let i = 0, got = 0; i < nB * 60 && got < nB; i++) {
      const a = rnd() * 6.283, k = 0.7 + rnd() * 0.35, x = cx + Math.cos(a) * rx * k, z = cz + Math.sin(a) * rz * k, dep = water - alpineHeight(x, z)
      if (dep < 0.08 || dep > 0.5 || alpineTrailDist(x, z) < 2.5 || boulders.some((b) => Math.hypot(b.x - x, b.z - z) < 2.5)) continue
      if (YOSE.inOutlet?.(x, z, 0.6)) continue   // 驗收第 11 條：湖接溪的水道裡（挖下去之後泡在水裡）不放卵石、溪岸植物
      boulders.push({ x, z, y: water, s: 0.8 + rnd() * 0.8, yaw: rnd() * 6.283, v: Math.floor(rnd() * 3) }); got++
    }
  }
  shore(ALP_POND.x, ALP_POND.z, ALP_POND.r, ALP_POND.r, ALP_POND.water, 4200, 260, 9)
  shore(YOSE.lake.x, YOSE.lake.z, YOSE.lake.rx, YOSE.lake.rz, YOSE.lake.water, 2400, 140, 6)
  // 2026-11-13 使用者（瀑布後面的水潭照片）「Add some seaweed and 鵝卵石」：凹槽變湖之後湖底是一片光禿的平底 → 整片鋪卵石（清水看得到底）、水草一叢叢，兩三顆苔石
  { const C = YOSE.cave, W = YOSE.lake.water, inR = (x, z) => YOSE.inRecessWater(x, z) && W - alpineHeight(x, z) > 0.04
    const rx = () => C.x0 + 1.5 + rnd() * (C.x1 - C.x0 - 2.5)
    for (let i = 0, got = 0; i < 40000 && got < 1700; i++) { const x = rx(), z = YOSE.base(x) - 3 + rnd() * (YOSE.recPath(x) + 1.4); if (!inR(x, z) || alpineTrailDist(x, z) < 1.25) continue; if (fbm2(x * 0.5 + 3, z * 0.5, 2) < 0.3 && rnd() < 0.5) continue; pebble(x, z, W, 1.15); got++ }
    for (let i = 0, got = 0; i < 30000 && got < 150; i++) { const x = rx(), z = YOSE.base(x) - 3 + rnd() * (YOSE.recPath(x) + 1.4), h = alpineHeight(x, z), dep = W - h; if (!inR(x, z) || dep < 0.2 || dep > 1.1) continue; if (fbm2(x * 0.35 - 7, z * 0.35 + 2, 2) < 0.45) continue
      const sc = 0.8 + rnd() * 0.9; put('weed_' + Math.floor(rnd() * 3), x + (rnd() - 0.5) * 0.3, h + 0.01, z, sc, sc * Math.min(1.5, dep / 0.35), sc, rnd() * 6.283, new THREE.Color().setScalar(0.75 + 0.45 * rnd())); got++ }
    for (let i = 0, got = 0; i < 4000 && got < 3; i++) { const x = rx(), z = YOSE.base(x) - 2 + rnd() * (YOSE.recPath(x) - 1), dep = W - alpineHeight(x, z); if (!inR(x, z) || dep < 0.3 || Math.abs(x - YOSE.fall.x) < 5 || boulders.some((b) => Math.hypot(b.x - x, b.z - z) < 3)) continue
      boulders.push({ x, z, y: W, s: 0.9 + rnd() * 0.6, yaw: rnd() * 6.283, v: Math.floor(rnd() * 3) }); got++ } }
  // 2026-11-14 使用者（湖口照片）「還是你用石頭擋住，不然看得出縫隙」：湖水流進河的地方排一道石堰——橫跨河口 7 顆大苔石，
  // 頂面露出水面 0.15～0.45 m、中間留兩三道縫讓水流出去；湖面跟河面交接的那條線、底下挖深的暗洞都藏在石堰後面
  { const W = YOSE.lake.water, C = [180.9, 74.6], px = 0.96, pz = -0.26, rw = mulberry32(777)
    for (const [o, sz] of [[-3.9, 1.9], [-2.7, 1.5], [-1.45, 1.25], [-0.2, 1.05], [1.15, 1.3], [2.45, 1.55], [3.7, 1.95]]) {
      const x = C[0] + px * o + (rw() - 0.5) * 0.35, z = C[1] + pz * o + (rw() - 0.5) * 0.5, s2 = sz * (0.9 + rw() * 0.25)
      boulders.push({ x, z, y: W - 0.5 * s2 + 0.15 + rw() * 0.3, s: s2, yaw: rw() * 6.283, v: Math.floor(rw() * 3), weir: true })
    } }
  for (const b of boulders) if (!b.weir) b.y = Math.min(b.y, alpineHeight(b.x, b.z) + 0.42 * b.s)   // 2026-11-14 使用者（石頭浮在水上）：河床、湖底挖深之後照水面放的苔石底下是空的 → 最多只能比水底高 0.42×大小（石頭坐在水底）
  for (const b of boulders) { put('boulder_' + b.v, b.x, b.y, b.z, b.s, b.s, b.s, b.yaw, new THREE.Color().setScalar(0.9 + 0.25 * rnd()), 0.12); addCollider(b.x, b.z, b.s * 0.5, b.y + b.s * 0.4) }

  /* ---------- 材質 ---------- */
  const stoneM = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.48, metalness: 0 })     // 濕的石頭：有一點反光
  const mossM = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0 })
  const weedM = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, side: THREE.DoubleSide })
  weedM.onBeforeCompile = (sh) => {
    sh.uniforms.uT = timeU
    // 順著水流擺：離根越遠擺越大（頂點色的 alpha＝離根多遠），每叢相位不同
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uT;').replace('#include <begin_vertex>', `#include <begin_vertex>
      #ifdef USE_INSTANCING
        float ph = instanceMatrix[3].x * 1.7 + instanceMatrix[3].z * 2.3;
      #else
        float ph = 0.0;
      #endif
      float tt = color.a;
      transformed.z += sin(uT * 1.7 + ph + tt * 3.0) * 0.09 * tt * tt + sin(uT * 3.1 + ph * 1.3 + tt * 6.0) * 0.03 * tt * tt;
      transformed.y += sin(uT * 1.3 + ph * 0.7 + tt * 2.0) * 0.035 * tt * tt;`)
  }
  weedM.customProgramCacheKey = () => 'bedweed'
  for (const [part, list] of Object.entries(L)) {
    if (!geo[part] || !list.length) continue
    const isW = part.startsWith('weed'), isB = part.startsWith('boulder')
    if (isW && geo[part].attributes.color?.itemSize !== 4) { const c = geo[part].attributes.color, n = c.count, a = new Float32Array(n * 4); for (let i = 0; i < n; i++) { a[i * 4] = c.getX(i); a[i * 4 + 1] = c.getY(i); a[i * 4 + 2] = c.getZ(i); a[i * 4 + 3] = 0.5 } geo[part].setAttribute('color', new THREE.BufferAttribute(a, 4)) }
    const im = new THREE.InstancedMesh(geo[part], isW ? weedM : isB ? mossM : stoneM, list.length)
    list.forEach((it, k) => { im.setMatrixAt(k, it.m); im.setColorAt(k, it.c) })
    im.castShadow = isB; im.receiveShadow = true; im.name = 'bed_' + part; im.computeBoundingSphere()
    lodRegister([im], isB ? 1.2 : isW ? 0.5 : 0.16)
    G.add(im)
  }
  // 苔石四周一圈白沫（貼在水面上的環，邊緣碎碎的、慢慢轉）
  {
    // ChatGPT：不要完整的白圈——迎水面一道碎碎的新月形白沫（寬 3～15 cm）＋下游一條 0.3～1.5 m 的尾流，順著水流漂；湖裡的石頭沒有水流，只有貼著石頭一點點
    const ring = new THREE.PlaneGeometry(3.2, 1.7, 1, 1).rotateX(-Math.PI / 2).translate(0.75, 0, 0)   // 本地 +X＝下游
    const foamM = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, uniforms: { uT: timeU },
      vertexShader: `varying vec2 vP; varying float vPh; varying float vFlow; void main(){ vP = position.xz; vPh = instanceMatrix[3].x * 3.1 + instanceMatrix[3].z * 1.7; vFlow = step(1.5, length(instanceMatrix[1].xyz)) > 0.5 ? 0.0 : 1.0; gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position.x, 0.0, position.z, 1.0); }`,
      fragmentShader: `uniform float uT; varying vec2 vP; varying float vPh; varying float vFlow;
        float h2(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h2(i), h2(i + vec2(1, 0)), f.x), mix(h2(i + vec2(0, 1)), h2(i + vec2(1, 1)), f.x), f.y); }
        void main(){ float r = length(vP), a = atan(vP.y, vP.x);
          float n = vn(vec2(vP.x * 5.0 - uT * 1.3 * vFlow + vPh, vP.y * 7.0)) * 0.6 + vn(vec2(vP.x * 13.0 - uT * 2.0 * vFlow, vP.y * 15.0 + vPh)) * 0.4;
          float up = pow(max(0.0, -cos(a)), 1.6);                                   // 迎水面
          float w = mix(0.035, 0.035 + 0.11 * up, vFlow);
          float cres = smoothstep(0.50, 0.515, r) * (1.0 - smoothstep(0.50 + w * (0.5 + n), 0.52 + w * (0.5 + n), r)) * mix(0.7, 0.35 + 0.65 * up, vFlow);
          float wake = vFlow * smoothstep(0.25, 0.6, vP.x) * (1.0 - smoothstep(1.0, 2.2, vP.x)) * (1.0 - smoothstep(0.0, 0.5 * (1.0 - vP.x / 2.6), abs(abs(vP.y) - 0.34 + 0.1 * vP.x))) * step(0.5, r);
          float al = max(cres * smoothstep(0.3, 0.6, n + 0.15), wake * smoothstep(0.42, 0.7, n) * 0.75);
          if (al < 0.02) discard;
          gl_FragColor = vec4(vec3(0.93, 0.96, 0.97), al * 0.8);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }` })
    // 2026-11-13 使用者「石頭旁邊的波紋沒動，這是放在溪流吧」：湖裡的石頭那一圈不會動的白環拿掉——白沫只給有水流的溪
    const fb = boulders.filter((b) => b.flow != null)
    const fm = new THREE.InstancedMesh(ring, foamM, Math.max(1, fb.length)); fm.count = fb.length
    // 石頭在水線的截面半徑約 0.5 × 尺寸；有水流的照下游方向擺（高度的縮放當旗標：1＝有水流、2＝湖裡）
    fb.forEach((b, k) => fm.setMatrixAt(k, m4.compose(new THREE.Vector3(b.x, b.y + 0.012, b.z), q.setFromEuler(e.set(0, b.flow ?? b.yaw, 0)), new THREE.Vector3(b.s * 1.15, b.flow != null ? 1 : 2, b.s * 1.15))))
    fm.renderOrder = 6; fm.frustumCulled = false; fm.name = 'bed_foam'; G.add(fm)
  }
  scene.add(G)
  return { counts: Object.fromEntries(Object.entries(L).map(([k, v]) => [k, v.length])), boulders: boulders.length }
}
