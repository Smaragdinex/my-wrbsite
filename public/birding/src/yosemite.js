// 帳篷區後面的優勝美地風（2026-11-10）：yose 支線（主線第 13 點 → 營地）北邊，沿著溫室玻璃的邊緣立一整面花崗岩壁
// 岩壁：灰白、縱向一條條的稜溝（冰河磨過的花崗岩），表面有黑色的水痕（沿岩壁流下的水染黑）、淡色的剝落面；頂上往後收到玻璃邊
// 瀑布：從岩壁頂一條細長的水簾（像優勝美地瀑布），落到岩壁下的水潭，濺起水霧
// 樹：西黃松（Ponderosa）——高、直、橘紅色的鱗片樹皮，樹冠只在上半段、一簇簇的長針葉；這一區原本的冷杉、鐵杉讓開（alpine.js 用 inYose）
import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { ALP_SPURS, alpineHeight, alpineTrailDist, alpineStreamDist, domeRho, domeY, addCollider, YOSE, CAMP } from './layout.js'
import { mulberry32, fbm2 } from './noise.js'
import { coniferGeo, needleMaterial } from './alpine.js'
import { barkMaterial } from './bark.js'
import { parts, scatter } from './plants.js'
import { bladeMesh } from './flora.js'

const TAU = Math.PI * 2, V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z)
const lerpN = (a, b, t) => a + (b - a) * t
const ss = (a, b, v) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t) }

// 花崗岩的顏色貼圖：淺灰底、黑白雲母、石英的小斑點，淡淡的鐵鏽色
function graniteTex() {
  const c = document.createElement('canvas'); c.width = c.height = 512
  const x = c.getContext('2d'), r = mulberry32(17)
  x.fillStyle = '#b9b6ae'; x.fillRect(0, 0, 512, 512)
  for (let i = 0; i < 26000; i++) {
    const k = r(), s = 0.8 + r() * 1.4
    x.fillStyle = k < 0.08 ? `rgba(55,52,50,${0.35 + r() * 0.3})` : k < 0.5 ? `rgba(235,233,226,${0.35 + r() * 0.4})` : k < 0.56 ? `rgba(170,120,80,${0.2 + r() * 0.2})` : `rgba(150,148,140,${0.3 + r() * 0.3})`
    x.fillRect(r() * 512, r() * 512, s, s)
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8
  return t
}

export function buildYosemite(scene, { lib } = {}) {
  const M0 = YOSE.mist
  const g = new THREE.Group(); g.name = 'yosemite'; scene.add(g)
  const rnd = mulberry32(1851)
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = V()

  // ---------- 岩壁 ----------
  // 每一欄（沿 x）一個斷面：牆腳在 YOSE.base(x)，往上幾乎垂直（微微往後仰），頂上往後收到玻璃邊
  const X0 = YOSE.x0, X1 = YOSE.x1, NX = Math.round((X1 - X0) / 0.5), FACE = 44, TOP = 6
  const pos = [], col = [], uv = [], idx = []
  const cols = []
  for (let i = 0; i <= NX; i++) {
    const x = X0 + (X1 - X0) * i / NX, zb = YOSE.base(x), ze = YOSE.edge(x) - 0.8
    const g0 = alpineHeight(x, zb)
    const Ht = YOSE.Ht(x)   // layout.js：兩端收矮；瀑布口到石階頂那段頂上是平的
    // 2026-11-11 石階平台那一段（XA～XB）：岩壁本體往後退到最上一層平台的後面，前面是一階一階的平台（下面另外畫）
    const M = YOSE.mist, terr = x > M.XA - 1.6 && x < M.XB + 1.6, push = terr ? zb + M.D0 + M.W * (M.NL - 0.5) + 0.15 : -1e9, fk = YOSE.flatK(x)
    const fallK = Math.exp(-(((x - YOSE.fall.x) / 8) ** 2))   // 瀑布口那幾公尺：岩壁不往後仰、頂上不凸，水簾貼著岩壁落下（以前瀑布口浮在岩壁前面）
    cols.push({ x, zb, g0, Ht, terr })
    const row = []
    for (let k = 0; k <= FACE + TOP; k++) {
      let y, z
      if (k <= FACE) {
        const v = k / FACE
        y = g0 - 1.5 + (Ht + 1.5) * v
        // 往後仰一點；縱向的稜溝（x 方向變化快、y 方向變化慢）＋大塊的凹凸；頂端圓圓地收
        const flute = 0.45 * Math.sin(x * 1.7 + Math.sin(y * 0.11) * 2.2) + 0.25 * Math.sin(x * 4.3 + y * 0.05)
        const lump = 1.6 * (fbm2(x * 0.09, y * 0.07, 4) - 0.5)
        z = Math.max(push, zb + v * 1.8 * (1 - 0.85 * fallK) + (flute + lump) * ss(0, 0.08, v) * (1 - 0.6 * fallK) + ss(0.9, 1, v) * 1.2 * (1 - fallK))
      } else {
        const t = (k - FACE) / TOP, z0 = Math.max(zb + 3.0 - 2.4 * fallK, push)
        y = g0 + Ht + lerpN(Math.sin(t * Math.PI * 0.5) * 0.8 - t * t * 0.6, -0.04 * t, fk)   // 平的那段：頂上平平的、往後微微低一點
        z = z0 + (ze - z0) * t
      }
      row.push([x, y, z])
    }
    for (const [ri, [px, py, pz]] of row.entries()) {
      pos.push(px, py, pz); uv.push(px * 0.22, ri > FACE ? pz * 0.22 + 40 : py * 0.22)   // 頂上那幾排用 z 當貼圖座標（以前用 y，頂面被拉成一條條）
      // 黑色水痕：一條條縱向（只看 x），從上往下淡；淡色剝落面：大塊
      const streak = Math.max(0, fbm2(px * 0.35, 7.1, 3) - 0.52) * 3.2 * ss(g0, g0 + Ht, py) * (ri > FACE ? 0.1 : 1)   // 頂面不畫縱向水痕（會變一條條）
      const pale = Math.max(0, fbm2(px * 0.06, py * 0.06 + 4, 3) - 0.55) * 1.6
      const wet = Math.exp(-(((px - YOSE.fall.x) / 4.2) ** 2)) * (0.55 + 0.45 * ss(g0, g0 + 3, py))   // 瀑布後面濕掉的黑色岩壁
      const k = Math.max(0.3, (1 - streak * 0.75 + pale * 0.25) * (1 - 0.55 * wet))
      col.push(k * (1 - streak * 0.05), k, k * (1 + streak * 0.02))
    }
  }
  const W = FACE + TOP + 1
  for (let i = 0; i < NX; i++) for (let k = 0; k < W - 1; k++) { const a = i * W + k, b = a + W; idx.push(a, a + 1, b, a + 1, b + 1, b) }
  const cg = new THREE.BufferGeometry()
  cg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); cg.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); cg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  cg.setIndex(idx); cg.computeVertexNormals()
  const rockN = lib?.rockface_a ? parts(lib.rockface_a).find((p) => p.mat.normalMap)?.mat.normalMap : null   // 掃描岩石的法線圖借來當細部凹凸
  if (rockN) { rockN.wrapS = rockN.wrapT = THREE.RepeatWrapping }
  // 2026-11-11 ChatGPT：垂直岩面用 triplanar（照世界座標從三個方向投影，依法線混合），不靠 UV——以前平台的石壁、岩壁頂面貼圖被拉成一條條
  // 法線貼圖拿掉（它也是照 UV 貼的，一樣會拉長）；粗糙度 0.86；大尺度的深淺另外用頂點色
  const cliffM = new THREE.MeshStandardMaterial({ map: graniteTex(), vertexColors: true, roughness: 0.86, side: THREE.DoubleSide })
  cliffM.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vTpW; varying vec3 vTpN;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvTpW = (modelMatrix * vec4(transformed, 1.0)).xyz; vTpN = normalize(mat3(modelMatrix) * objectNormal);')
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vTpW; varying vec3 vTpN;')
      .replace('#include <map_fragment>', `
        vec3 tpB = pow(abs(normalize(vTpN)), vec3(5.0)); tpB /= (tpB.x + tpB.y + tpB.z + 1e-4);
        vec4 tpC = texture2D(map, vTpW.zy * 0.3) * tpB.x + texture2D(map, vTpW.xz * 0.3) * tpB.y + texture2D(map, vTpW.xy * 0.3) * tpB.z;
        vec4 tpL = texture2D(map, vTpW.zy * 0.045 + 0.37) * tpB.x + texture2D(map, vTpW.xz * 0.045 + 0.61) * tpB.y + texture2D(map, vTpW.xy * 0.045 + 0.13) * tpB.z;
        diffuseColor *= mix(tpC, tpC * (0.75 + 0.5 * tpL), 0.6);`)
  }
  cliffM.customProgramCacheKey = () => 'cliffTriplanar'
  const cliff = new THREE.Mesh(cg, cliffM); cliff.castShadow = true; cliff.receiveShadow = true; g.add(cliff)
  // 岩壁封起來（ChatGPT：要是有厚度的封閉岩體）：兩端各一片側面（從岩壁斷面一路接到後下角）、後面一道牆往下埋進地裡——
  // 以前從岩壁尾端下面往上看，頂面是一片懸空的薄板
  {
    const P = cg.attributes.position, sp = [], si = []
    const add = (x, y, z) => { sp.push(x, y, z); return sp.length / 3 - 1 }
    for (const ci of [0, NX]) {
      const c = cols[ci], base = add(c.x, c.g0 - 3, YOSE.edge(c.x) - 0.8)
      let prev = null, first = null
      for (let k = 0; k < W; k++) { const i = ci * W + k, v = add(P.getX(i), P.getY(i), P.getZ(i)); if (first == null) first = v; if (prev != null) si.push(base, prev, v); prev = v }
      const b0 = add(c.x, c.g0 - 3, c.zb - 0.5); si.push(base, b0, first)   // 底下那一角也封起來
    }
    for (let ci = 0; ci < NX; ci++) {   // 後面：頂面最後一排往下到地裡
      const i0 = ci * W + W - 1, i1 = (ci + 1) * W + W - 1
      const a = add(P.getX(i0), P.getY(i0), P.getZ(i0)), b = add(P.getX(i1), P.getY(i1), P.getZ(i1))
      const a2 = add(P.getX(i0), cols[ci].g0 - 3, P.getZ(i0)), b2 = add(P.getX(i1), cols[ci + 1].g0 - 3, P.getZ(i1))
      si.push(a, b, a2, b, b2, a2)
    }
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3))
    sg.setAttribute('color', new THREE.Float32BufferAttribute(new Array(sp.length).fill(0.82), 3)); sg.setAttribute('uv', new THREE.Float32BufferAttribute(new Array(sp.length / 3 * 2).fill(0), 2))
    sg.setIndex(si); sg.computeVertexNormals()
    const sm = new THREE.Mesh(sg, cliffM); sm.castShadow = true; sm.receiveShadow = true; g.add(sm)
  }
  for (const c of cols) if (!(c.x > YOSE.mist.XA - 3.4 && c.x < YOSE.mist.XB + 3.4) && Math.round(c.x * 2) % 3 === 0) addCollider(c.x, c.zb + 0.9, 1.3, c.g0 + c.Ht)   // 石階平台兩端外面也不放（半徑 1.3 會伸進轉彎的平台）

  // 岩壁腳下的落石堆：掃描的岩石、大石頭，沿牆腳 1～4 公尺
  if (lib) {
    const names = ['boulder', 'mrock_1', 'mrock_3', 'mrock_5', 'mrock_8', 'mrock_11'].filter((n) => lib[n]), lists = Object.fromEntries(names.map((n) => [n, []]))
    // 2026-11-10 使用者：石頭再大、再寫實 → 落石堆的石頭放大 1.6 倍；水潭四周一圈 1.5～4 公尺的大石頭（濕的、顏色深）；石頭不能壓到步道（照石頭大小算）
    const FL = YOSE.fall, inPool = (x, z, pad) => ((x - FL.x) / (FL.rx + pad)) ** 2 + ((z - FL.z) / (FL.rz + pad)) ** 2 < 1
    const wetC = (x) => { const w = Math.exp(-(((x - FL.x) / 9) ** 2)); return new THREE.Color().setScalar(1.35 - 0.3 * w) }
    const putRock = (n, x, z, k2, sink = 0.25) => lists[n].push({ p: V(x, alpineHeight(x, z) - sink * k2, z), q: new THREE.Quaternion().setFromEuler(new THREE.Euler(rnd() * 0.3, rnd() * TAU, rnd() * 0.3)), s: V(k2, k2 * (0.7 + rnd() * 0.5), k2), c: wetC(x) })
    for (let k = 0; k < 260; k++) {
      const x = X0 + 4 + rnd() * (X1 - X0 - 8), z = YOSE.base(x) - 0.5 - rnd() * 4
      const n = names[Math.floor(rnd() * names.length)], k2 = (n === 'boulder' ? 0.25 + rnd() * 0.35 : 0.6 + rnd() * 0.9) * 1.6
      if (alpineTrailDist(x, z) < 3.2 + k2 * (n === 'boulder' ? 2.2 : 0.7) || inPool(x, z, 0.6) || YOSE.inLake(x, z, 1.5) || alpineStreamDist(x, z) < 2.5 || (x > YOSE.mist.XA - 5 && x < YOSE.mist.XB + 5)) continue
      putRock(n, x, z, k2)
    }
    for (let k = 0, made = 0; k < 400 && made < 16; k++) {   // 水潭邊的大石頭（不擋住看瀑布的那一面：步道那側少放）
      const a = rnd() * TAU, x = FL.x + Math.cos(a) * (FL.rx + 0.6 + rnd() * 1.6), z = FL.z + Math.sin(a) * (FL.rz + 0.5 + rnd() * 1.4)
      const n = rnd() < 0.5 && lib.boulder ? 'boulder' : names[1 + Math.floor(rnd() * (names.length - 1))], k2 = n === 'boulder' ? 0.45 + rnd() * 0.5 : 1.6 + rnd() * 1.6
      if (!lists[n] || alpineTrailDist(x, z) < 3.4 + k2 * (n === 'boulder' ? 2.2 : 0.7) || (Math.sin(a) < -0.3 && rnd() < 0.7) || YOSE.inLake(x, z, -0.5)) continue
      putRock(n, x, z, k2, 0.3); addCollider(x, z, k2 * (n === 'boulder' ? 1.6 : 0.6), alpineHeight(x, z) + k2 * 0.8); made++
    }
    // 岩石改成灰白（花崗岩）：材質複製一份、顏色去飽和再提亮（原本掃描的是褐色、長青苔的石頭），跟岩壁一致
    for (const n of names) {
      if (!lists[n].length) continue
      for (const { geo, mat } of parts(lib[n])) {
        const m2 = mat.clone()
        m2.onBeforeCompile = (sh) => { sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
          float gl = dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11)); diffuseColor.rgb = mix(vec3(gl) * vec3(1.5, 1.48, 1.43) + 0.03, diffuseColor.rgb * 1.25, 0.3);`) }   // 留三成原本的顏色（青苔、鏽斑），比較寫實
        m2.customProgramCacheKey = () => 'granite'
        const im = new THREE.InstancedMesh(geo, m2, lists[n].length)
        lists[n].forEach((it, i) => { im.setMatrixAt(i, m4.compose(it.p, it.q, it.s)); im.setColorAt(i, it.c) })
        im.castShadow = true; im.receiveShadow = true; im.computeBoundingSphere(); g.add(im)
      }
    }
  }

  // ---------- 瀑布＋水潭（2026-11-10 使用者：更大、更長、更寫實、更有臨場感）----------
  // 三層水簾：後面一層慢、暗（有厚度）；主水簾一條條往下加速的水絲＋白色的「馬尾」水團；前面下半段一層水霧簾
  // 落點：500 顆水花往上往外噴、慢慢飄散；大片水霧；橢圓水潭（13×6.4 公尺）、兩層白沫一圈圈往外；岩壁背後濕黑一條
  const F = YOSE.fall, fc = cols.reduce((a, c) => Math.abs(c.x - F.x) < Math.abs(a.x - F.x) ? c : a)
  const poolY = YOSE.lake.water   // 2026-11-11 落到湖裡（layout.js YOSE.lake）
  const topY = fc.g0 + fc.Ht, fz = fc.zb + 0.6
  const uT = { value: 0 }
  const fallMat = (o) => new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    uniforms: { uT, uSpd: { value: o.spd }, uA: { value: o.a }, uDark: { value: o.dark ?? 0 }, uLow: { value: o.low ?? 0 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `
      varying vec2 vUv; uniform float uT, uSpd, uA, uDark, uLow;
      float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
      float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f); return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
      float fbm(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 4; i++){ s += a * n(p); p *= 2.03; a *= 0.5; } return s; }
      void main(){
        float x = vUv.x, y = vUv.y;
        float fall = y * y * 1.6 + y * 0.6;                         // 越往下流越快（重力加速）
        float t = uT * uSpd;
        float s1 = n(vec2(x * 26.0, fall * 4.0 - t * 2.4)), s2 = n(vec2(x * 61.0 + 3.0, fall * 7.0 - t * 3.6));
        float str = smoothstep(0.32, 0.86, s1 * 0.55 + s2 * 0.5);
        float plume = smoothstep(0.48, 0.8, fbm(vec2(x * 7.0, fall * 2.2 - t * 1.7)));   // 白色的水團（馬尾瀑）
        float spread = mix(0.16, 0.06, y);
        float edge = smoothstep(0.0, spread, x) * smoothstep(1.0, 1.0 - spread, x);
        edge *= 0.75 + 0.25 * n(vec2(x * 9.0, fall * 3.0 - t * 1.5));                     // 邊緣破碎
        float low = mix(1.0, smoothstep(0.35, 0.75, y), uLow);                               // 水霧簾只在下半段
        float a = (0.22 + 0.55 * str + 0.45 * plume) * edge * low * uA * mix(0.85, 1.0, y);
        vec3 c = mix(vec3(0.72, 0.8, 0.84), vec3(1.0), clamp(str * 0.6 + plume, 0.0, 1.0));
        gl_FragColor = vec4(mix(c, c * 0.6, uDark), clamp(a, 0.0, 1.0));
      }`,
  })
  {
    const sheet = (wTop, wBot, back, outK, mat, ro, v0 = 0) => {
      const N = 40, P = [], U = [], I = []
      for (let k = 0; k <= N; k++) {
        const v = v0 + (1 - v0) * k / N, y = topY + 0.05 - (topY + 0.05 - poolY) * v, w = wTop + (wBot - wTop) * v, out = back + outK * v * v
        P.push(F.x - w, y, fz - out, F.x + w, y, fz - out); U.push(0, v, 1, v)
        if (k) { const a = (k - 1) * 2; I.push(a, a + 1, a + 2, a + 1, a + 3, a + 2) }
      }
      const fg = new THREE.BufferGeometry(); fg.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); fg.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2)); fg.setIndex(I)
      const m = new THREE.Mesh(fg, mat); m.renderOrder = ro; g.add(m)
    }
    sheet(2.6, 5.4, 0.25, 2.2, fallMat({ spd: 0.7, a: 0.55, dark: 0.35 }), 3)          // 後層
    sheet(3.0, 6.2, 0.5, 3.6, fallMat({ spd: 1.0, a: 1.0 }), 4)                         // 主水簾（岩壁變高了，下面往外拋多一點）
    sheet(3.6, 7.8, 0.9, 4.6, fallMat({ spd: 1.35, a: 0.45, low: 1 }), 5, 0.3)          // 前面的水霧簾
    // 水潭：橢圓、深綠帶一點藍
    const poolM = new THREE.MeshStandardMaterial({ color: 0x2c5a55, roughness: 0.06, metalness: 0.15, transparent: true, opacity: 0.9 })
    // 湖：剛好到湖岸那一圈（湖裡往下挖、岸往上一階，邊緣接在那一階上；以前放大 12%，出水口那邊水面浮在河道上面）
    const LK = YOSE.lake, pool = new THREE.Mesh(new THREE.CircleGeometry(1, 72).rotateX(-Math.PI / 2), poolM); pool.scale.set(LK.rx * 1.015, 1, LK.rz * 1.015); pool.position.set(LK.x, poolY, LK.z); pool.receiveShadow = true; g.add(pool)
    const foamT = (() => { const c = document.createElement('canvas'); c.width = c.height = 256; const x = c.getContext('2d'), r = mulberry32(9); for (let i = 0; i < 1600; i++) { const a = r() * TAU, d = Math.pow(r(), 0.7) * 120; x.fillStyle = `rgba(255,255,255,${(0.1 + r() * 0.45) * (1 - d / 130)})`; x.beginPath(); x.arc(128 + Math.cos(a) * d, 128 + Math.sin(a) * d, 1 + r() * 5, 0, TAU); x.fill() } const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t })()
    for (const [k, sc] of [[0, 6.5], [1, 4.2]]) {
      const fm = new THREE.Mesh(new THREE.CircleGeometry(1, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: foamT, transparent: true, depthWrite: false, opacity: 0.8 }))
      fm.scale.set(sc, 1, sc * 0.6); fm.position.set(F.x, poolY + 0.02 + k * 0.01, fz - 3.2); fm.userData = { sc, k }; fm.renderOrder = 2; g.add(fm); foams.push(fm)
    }
    // 水霧：大片、慢慢飄、有的往步道那邊飄過來
    const mistT = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'); const gr = x.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = gr; x.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c) })()
    for (let k = 0; k < 26; k++) { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: mistT, transparent: true, depthWrite: false, opacity: 0.4 })); const p0 = V(F.x + (rnd() - 0.5) * 11, poolY + 0.6 + rnd() * 9, fz - 2.8 - rnd() * 4); sp.position.copy(p0); sp.scale.setScalar(4 + rnd() * 6); sp.userData = { ph: rnd() * TAU, p0 }; sp.renderOrder = 6; g.add(sp); mist.push(sp) }
    // 水花：落點往上往外噴的小水滴（加色、會飄散）
    const NS = 500, sp = new Float32Array(NS * 3), sv = []
    const reset = (i, first) => { const x = F.x + (rnd() - 0.5) * 9, z = fz - 2.6 - rnd() * 1.8; sp[i * 3] = x; sp[i * 3 + 1] = poolY + (first ? rnd() * 5 : 0.1); sp[i * 3 + 2] = z; sv[i] = V((rnd() - 0.5) * 1.6, 2 + rnd() * 4.5, -(0.4 + rnd() * 2.2)) }
    for (let i = 0; i < NS; i++) reset(i, true)
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(sp, 3))
    const sprayM = new THREE.PointsMaterial({ color: 0xffffff, size: 0.12, transparent: true, opacity: 0.55, depthWrite: false, map: mistT, blending: THREE.AdditiveBlending })
    const spray = new THREE.Points(sg, sprayM); spray.frustumCulled = false; spray.renderOrder = 7; g.add(spray)
    sprayU = (dt) => { for (let i = 0; i < NS; i++) { sv[i].y -= 3.2 * dt; sv[i].multiplyScalar(1 - 0.9 * dt); sp[i * 3] += sv[i].x * dt; sp[i * 3 + 1] += sv[i].y * dt; sp[i * 3 + 2] += sv[i].z * dt; if (sp[i * 3 + 1] < poolY || rnd() < 0.004) reset(i, false) } sg.attributes.position.needsUpdate = true }
  }

  // ---------- 瀑布步道（2026-11-11 重做）：岩壁被鑿成 8 層平台、之字形石階一路爬到岩壁頂 ----------
  // 1) 平台的石壁：一張網格（x × 高度），每個高度 y 的「前緣」在哪一層：y 在第 k 段和第 k+1 段踏面之間 → 前緣＝第 k 段的內側（d_k＋W/2）。
  //    踏面那一排網格剛好跨過一層，等於一塊平台；石壁表面往裡加一點凹凸（只往裡，不會擋到步道）
  // 2) 石階：每 0.2 公尺一階的花崗岩踏板（踏板下面墊高，蓋住平台）
  // 3) 外側矮石牆：一顆顆花崗岩砌的（像優勝美地步道邊那種），轉彎處留開口
  // 4) 兩端的側面封起來；頂上：觀景台欄杆、溪從後面流到瀑布口
  {
    const M = YOSE.mist, st = YOSE.stairs(), XL = M.XA - 1.3, XR = M.XB + 1.3, topYm = YOSE.topY(M.XB)
    const dEdge = (x, k) => YOSE.base(x) + M.D0 + M.W * k + M.W / 2          // 第 k 段的內側（上一層石壁的腳）
    const Hk = (k, x) => st.legH(k, x)
    const faceZ = (x, y) => {
      if (y <= Hk(0, x)) return YOSE.base(x) + M.D0 - M.W / 2
      for (let k = 0; k < M.NL - 1; k++) if (y <= Hk(k + 1, x)) return dEdge(x, k)
      return dEdge(x, M.NL - 1)
    }
    // 2026-11-11 使用者：平台兩端那條白白的直縫 → 不再用一片平的側面封口；平台在兩端外面 TAP 公尺內慢慢「收」回岩壁裡
    // （每個高度的前緣從平台的前緣，平滑地退回原本岩壁的表面），看起來是岩壁自己的一道突出的岩稜
    const TAP = 3.2, cliffZ = (x, y) => { const zb = YOSE.base(x), v = Math.min(1, Math.max(0, (y - YOSE.g0(x) + 1.5) / (YOSE.Ht(x) + 1.5))); return zb + v * 1.8 + ss(0.9, 1, v) * 1.2 - 0.25 }
    const faceAt = (x, y) => {
      if (x >= XL && x <= XR) return faceZ(x, y)
      const xe = x < XL ? XL : XR, t = ss(0, 1, Math.abs(x - xe) / TAP)   // 0＝平台端、1＝回到岩壁
      return lerpN(faceZ(xe, y), Math.max(faceZ(xe, y), cliffZ(x, y)), t)
    }
    const XL2 = XL - TAP, XR2 = XR + TAP
    const yLo = Math.min(st.h0, alpineHeight(XR, YOSE.base(XR) + M.D0)) - 2.5, NXF = Math.round((XR2 - XL2) / 0.3), NYF = Math.round((topYm + 0.05 - yLo) / 0.12)
    const fp = [], fu = [], fc = [], fi = []
    for (let i = 0; i <= NXF; i++) {
      const x = XL2 + (XR2 - XL2) * i / NXF
      for (let j = 0; j <= NYF; j++) {
        const y = yLo + (topYm + 0.05 - yLo) * j / NYF, z0 = faceAt(x, y)
        const bump = 0.45 * Math.max(0, fbm2(x * 0.55, y * 0.45, 3) - 0.32) + 0.12 * Math.sin(x * 2.3 + y * 0.7)   // 只往裡凹
        const edge = x < XL || x > XR ? ss(0, 1, Math.min(Math.abs(x - XL), Math.abs(x - XR)) / TAP) : 0
        const z = z0 + Math.max(0, bump) * (1 - edge) + edge * 0.6 * (fbm2(x * 0.35, y * 0.3, 3) - 0.5)   // 收回岩壁那段：凹凸改成跟岩壁一樣的大塊起伏
        fp.push(x, y, z); fu.push(x * 0.22, y * 0.22)
        const kc = 0.85 + 0.3 * fbm2(x * 0.3, y * 0.3 + 9, 2); fc.push(kc, kc, kc * 0.98)
      }
    }
    const R = NYF + 1
    for (let i = 0; i < NXF; i++) for (let j = 0; j < NYF; j++) { const a = i * R + j, b = a + R; fi.push(a, b, a + 1, a + 1, b, b + 1) }
    // 兩端側面：從石壁前緣一路接到後面的岩壁本體
    const cap = (x, flip) => {
      const base = fp.length / 3, zBack = YOSE.base(x) + M.D0 + M.W * (M.NL - 0.5) + 0.3
      for (let j = 0; j <= NYF; j++) { const y = yLo + (topYm + 0.05 - yLo) * j / NYF; fp.push(x, y, faceZ(x, y) - 0.02, x, y, zBack); fu.push(0, y * 0.22, 3, y * 0.22); fc.push(0.9, 0.9, 0.88, 0.9, 0.9, 0.88) }
      for (let j = 0; j < NYF; j++) { const a = base + j * 2, b = a + 1, c = a + 2, d = a + 3; if (flip) fi.push(a, b, c, b, d, c); else fi.push(a, c, b, b, c, d) }
    }
    const tg = new THREE.BufferGeometry()
    tg.setAttribute('position', new THREE.Float32BufferAttribute(fp, 3)); tg.setAttribute('uv', new THREE.Float32BufferAttribute(fu, 2)); tg.setAttribute('color', new THREE.Float32BufferAttribute(fc, 3))
    tg.setIndex(fi); tg.computeVertexNormals()
    const terr = new THREE.Mesh(tg, cliffM); terr.castShadow = true; terr.receiveShadow = true; g.add(terr)

    // 石階：每一階一塊花崗岩踏板，下面墊到平台（看不到懸空）
    const stepM = new THREE.MeshStandardMaterial({ map: cliffM.map, color: 0xd9d5cd, roughness: 0.88, ...(rockN ? { normalMap: rockN } : {}) })
    const steps = []
    let lastY = -1e9
    for (let s0 = 0.2; s0 < st.L; s0 += 0.1) {
      const y = Math.floor(st.h(s0) / 0.2) * 0.2 + 0.2
      if (y === lastY) continue
      lastY = y
      // 這一階從 s0 到下一階開始（同一高度那一段）的中間
      let s1 = s0; while (s1 < st.L && Math.floor(st.h(s1) / 0.2) * 0.2 + 0.2 === y) s1 += 0.05
      const pa = at(st, s0), pb = at(st, Math.min(st.L, s1)), mx = (pa[0] + pb[0]) / 2, mz = (pa[1] + pb[1]) / 2, len = Math.hypot(pb[0] - pa[0], pb[1] - pa[1]) + 0.06
      const yaw = Math.atan2(pb[0] - pa[0], pb[1] - pa[1]), under = Math.min(1.4, y - alpineHeight(mx, mz) + 0.5)
      steps.push({ p: V(mx, y - under / 2, mz), yaw, s: V(M.W - 0.45, Math.max(0.2, under), Math.max(0.15, len)), c: 0.9 + rnd() * 0.18 })
    }
    function at(st, s) { let i = 1; while (i < st.S.length - 1 && st.S[i] < s) i++; const u = (s - st.S[i - 1]) / Math.max(1e-6, st.S[i] - st.S[i - 1]); return [lerpN(st.pts[i - 1][0], st.pts[i][0], u), lerpN(st.pts[i - 1][1], st.pts[i][1], u)] }
    const box = new THREE.BoxGeometry(1, 1, 1)
    {
      const im = new THREE.InstancedMesh(box, stepM, steps.length), cc = new THREE.Color()
      steps.forEach((b, i) => { im.setMatrixAt(i, m4.compose(b.p, q.setFromAxisAngle(V(0, 1, 0), b.yaw), b.s)); im.setColorAt(i, cc.setScalar(b.c)) })
      im.castShadow = true; im.receiveShadow = true; im.computeBoundingSphere(); g.add(im)
    }
    // 矮石牆：沿每段外側（第 0 段是前面、其他段是跟下一層之間），兩層砌石；碰撞也照這條線
    const stones = [], cores = [], wallLine = (k, x0, x1, zOf, yOf, open0, open1) => {
      // 2026-11-11 第一版一疊一疊分開像石堆 → 中間一道連續的牆心（盒子），外面再貼一顆顆互相交疊的砌石、上面一排長條蓋頂石
      for (let x = x0; x < x1; x += 0.5) {
        if (x > open0 && x < open1) continue
        const y = yOf(x), z = zOf(x), y2 = yOf(x + 0.5)
        cores.push({ p: V(x + 0.25, (y + y2) / 2 + 0.33, z), yaw: 0, s: V(0.56, 0.72, 0.4), c: 0.88 })
        for (let c = 0; c < 3; c++) for (let j = 0; j < 2; j++) {
          const w = 0.34 + rnd() * 0.22, h = 0.2 + rnd() * 0.08
          stones.push({ p: V(x + j * 0.27 + (c % 2) * 0.13, y + 0.12 + c * 0.22, z + (rnd() - 0.5) * 0.05), yaw: (rnd() - 0.5) * 0.2, s: V(w, h, 0.47), c: 0.78 + rnd() * 0.3 })
        }
        stones.push({ p: V(x + 0.25, (y + y2) / 2 + 0.74, z), yaw: (rnd() - 0.5) * 0.06, s: V(0.62, 0.09, 0.5), c: 0.95 + rnd() * 0.1 })   // 蓋頂石
        addCollider(x + 0.25, z, 0.3, y + 0.95)
      }
    }
    const OPEN = 3.4
    for (let k = 0; k < M.NL; k++) {
      // 第 k 段外側那條線：第 0 段在最前面；k ≥ 1 在第 k-1 段的內側（同一條線，牆的高度以第 k 段為準）
      const zOf = (x) => YOSE.base(x) + M.D0 + M.W * k - M.W / 2 + 0.2
      const turnX = k === 0 ? M.XB + 0.8 : (k % 2 === 1 ? M.XA - 0.8 : M.XB + 0.8)   // 這段的起點（從上一段轉上來的那頭）留開口
      wallLine(k, M.XA - 1.0, M.XB + 0.8, zOf, (x) => Hk(k, x), turnX - OPEN, turnX + OPEN)   // 只沿著有踏面的那段（以前到平台端外面，石牆懸在半空）
    }
    // 最上一層平台前緣（站在岩壁頂上往下看石階）：石牆，轉上來那頭留開口
    wallLine(M.NL, XL + 0.3, XR - 0.3, (x) => YOSE.base(x) + M.D0 + M.W * (M.NL - 0.5) + 0.2, () => topYm, M.XB + 0.8 - OPEN, M.XB + 0.8 + OPEN)
    {
      const wallM = new THREE.MeshStandardMaterial({ color: 0xc9c4ba, roughness: 0.95 }), coreM = new THREE.MeshStandardMaterial({ map: cliffM.map, color: 0xa9a49b, roughness: 0.98 })
      const stoneG = new THREE.DodecahedronGeometry(0.5, 1); { const pp = stoneG.attributes.position; for (let i = 0; i < pp.count; i++) { const k = 0.9 + 0.2 * Math.sin(i * 12.9898) ; pp.setXYZ(i, pp.getX(i) * k, Math.sign(pp.getY(i)) * Math.min(Math.abs(pp.getY(i)), 0.32), pp.getZ(i) * k) } stoneG.computeVertexNormals() }
      for (const [list, geo, mat] of [[stones, stoneG, wallM], [cores, new THREE.BoxGeometry(1, 1, 1), coreM]]) {
        const im = new THREE.InstancedMesh(geo, mat, list.length), cc = new THREE.Color()
        list.forEach((b, i) => { im.setMatrixAt(i, m4.compose(b.p, q.setFromAxisAngle(V(0, 1, 0), b.yaw), b.s)); im.setColorAt(i, cc.setScalar(b.c)) })
        im.castShadow = true; im.receiveShadow = true; im.computeBoundingSphere(); g.add(im)
      }
    }
    // 兩端腳下：一堆落石（岩稜底下自然會有的崩落的石塊），蓋住平台跟地面的交界
    if (lib) {
      const names = ['boulder', 'mrock_1', 'mrock_3', 'mrock_5'].filter((n) => lib[n]), list = Object.fromEntries(names.map((n) => [n, []]))
      for (const xe of [XL2 + 1, XR2 - 1]) for (let i = 0; i < 9; i++) {
        const x = xe + (rnd() - 0.5) * 4.5, z = YOSE.base(x) + M.D0 - M.W / 2 - 0.5 - rnd() * 3.5
        if (alpineTrailDist(x, z) < 2.4 || Math.hypot(x - M.start[0], z - M.start[1]) < 4) continue
        const n = names[Math.floor(rnd() * names.length)], k2 = n === 'boulder' ? 0.3 + rnd() * 0.4 : 0.7 + rnd() * 1.1
        list[n].push({ p: V(x, alpineHeight(x, z) - 0.25 * k2, z), q: new THREE.Quaternion().setFromEuler(new THREE.Euler(rnd() * 0.3, rnd() * TAU, rnd() * 0.3)), s: V(k2, k2 * (0.7 + rnd() * 0.4), k2) })
      }
      for (const n of names) if (list[n].length) scatter(g, lib[n], list[n], { cast: true })
    }
    // 每一層內側的石壁：碰撞（站在第 k 段，往裡是第 k+1 段的石壁，高到第 k+1 段的踏面）
    for (let k = 0; k < M.NL; k++) for (let x = XL + 0.3; x < XR - 0.3; x += 0.5) {
      const top = k + 1 < M.NL ? Hk(k + 1, x) : topYm
      const turnEnd = k % 2 === 0 ? M.XA - 0.8 : M.XB + 0.8   // 第 k 段的終點＝轉上第 k+1 段的地方：那裡不擋
      if (top - Hk(k, x) > 0.45 && Math.abs(x - turnEnd) > 1.7) addCollider(x, YOSE.base(x) + M.D0 + M.W * k + M.W / 2 + 0.35, 0.3, top - 0.1)
    }
    // 兩端：不能從平台側面走出去（掉下去）
    for (const xe of [XL - 0.6, XR + 0.6]) for (let k = 0; k <= M.NL; k++) for (const o of [-0.8, 0, 0.8]) if (!(xe > XR && (k === 0 || k >= M.NL - 1)) && k < M.NL) addCollider(xe, YOSE.base(xe) + M.D0 + M.W * k - M.W / 2 + M.W / 2 + o, 0.42, topYm + 1)   // 轉彎平台在 XA-0.8／XB+0.8，柱子放在外面 0.6 才不會擋到轉彎

    // 岩壁頂上：觀景台（瀑布口東邊）欄杆＋後面不能走出去
    const ironM = new THREE.MeshStandardMaterial({ color: 0x3b3d3f, roughness: 0.5, metalness: 0.6 }), posts = []
    for (let x = 201.4; x < XL; x += 0.9) posts.push(V(x, YOSE.topY(x), YOSE.topFront(x) + 0.15))
    for (let x = XR + 0.4; x < 250; x += 0.9) posts.push(V(x, YOSE.topY(x), YOSE.topFront(x) + 0.15))   // 石階頂東邊的平地前緣
    for (let z = YOSE.topFront(XR + 0.4) + 0.15; z < YOSE.base(XR) + M.D0 + M.W * (M.NL - 1.5) - 0.2; z += 0.9) posts.push(V(XR + 0.2, YOSE.topY(XR), z))   // 只到最後一段的前緣：最後一段東端直接走上平地
    for (let z = YOSE.topFront(250) + 0.5; z < YOSE.edge(250) - 2.2; z += 1) addCollider(250.2, z, 0.4, topYm + 3)   // 平地東邊盡頭
    for (let z = YOSE.topFront(XL - 0.2) + 0.15; z < YOSE.base(XL) + M.D0 + M.W * (M.NL - 0.5); z += 0.9) posts.push(V(XL - 0.2, YOSE.topY(XL), z))
    for (let z = YOSE.topFront(201.4) + 0.15; z < YOSE.edge(201.4) - 2.2; z += 0.9) posts.push(V(201.3, YOSE.topY(201.3), z))   // 西邊（溪那側）
    for (const p of posts) addCollider(p.x, p.z, 0.2, p.y + 1.1)
    for (let x = 201.2; x < 251; x += 1) addCollider(x, YOSE.edge(x) - 1.9, 0.35, topYm + 3)
    const pg = new THREE.CylinderGeometry(0.035, 0.035, 1.05, 6).translate(0, 0.52, 0), pm = new THREE.InstancedMesh(pg, ironM, posts.length)
    posts.forEach((p, i) => pm.setMatrixAt(i, m4.makeTranslation(p.x, p.y, p.z))); pm.castShadow = true; g.add(pm)
    for (let i = 1; i < posts.length; i++) { const a = posts[i - 1], b = posts[i]; if (a.distanceTo(b) > 1.4) continue; const d = b.clone().sub(a), r = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, d.length(), 5), ironM); r.position.copy(a).add(b).multiplyScalar(0.5).setY((a.y + b.y) / 2 + 1.0); r.quaternion.setFromUnitVectors(V(0, 1, 0), d.normalize()); g.add(r) }

    // 岩壁頂上的溪：從後面（玻璃前）流到瀑布口，越靠瀑布口越寬、越快；兩岸一顆顆花崗岩
    {
      const F2 = YOSE.fall, zLip = YOSE.base(F2.x) + 0.45, zSrc = YOSE.edge(F2.x) - 2.5, NS = 40, P = [], U = [], I = []
      const cx = (t) => F2.x + 1.6 * Math.sin(t * 2.6 + 0.5) * (1 - t) - 0.8 * (1 - t)
      for (let i = 0; i <= NS; i++) {
        const t = i / NS, z = lerpN(zSrc, zLip, t), x = cx(t), w = lerpN(1.6, 3.0, t * t), y = YOSE.topY(x) + 0.07 - 0.02 * t
        P.push(x - w, y, z, x + w, y, z); U.push(0, t * 5, 1, t * 5)
        if (i) { const a = (i - 1) * 2; I.push(a, a + 2, a + 1, a + 1, a + 2, a + 3) }
      }
      const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); sg.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2)); sg.setIndex(I)
      const creek = new THREE.Mesh(sg, fallMat({ spd: 0.55, a: 0.85, dark: 0.15 })); creek.renderOrder = 3; g.add(creek)
      const bed = new THREE.Mesh(sg.clone(), new THREE.MeshStandardMaterial({ color: 0x3d4f4c, roughness: 0.3, metalness: 0.1 })); bed.position.y = -0.03; g.add(bed)
      if (lib) {
        const names = ['boulder', 'mrock_3', 'mrock_5', 'mrock_8'].filter((n) => lib[n])
        const list = Object.fromEntries(names.map((n) => [n, []]))
        for (let i = 0; i < 46; i++) {
          const t = rnd(), z = lerpN(zSrc, zLip, t), w = lerpN(1.6, 3.0, t * t), sd = rnd() < 0.5 ? -1 : 1, x = cx(t) + sd * (w + 0.2 + rnd() * 1.4)
          if (x > 201) continue   // 觀景台那邊不放（會擋路）
          const n = names[Math.floor(rnd() * names.length)], k2 = n === 'boulder' ? 0.25 + rnd() * 0.3 : 0.5 + rnd() * 0.7
          list[n].push({ p: V(x, YOSE.topY(x) - 0.15 * k2, z), q: new THREE.Quaternion().setFromEuler(new THREE.Euler(rnd() * 0.3, rnd() * TAU, rnd() * 0.3)), s: V(k2, k2 * 0.8, k2) })
        }
        for (const n of names) if (list[n].length) scatter(g, lib[n], list[n], { cast: true })
      }
    }
  }

  // ---------- 西黃松 ----------
  const PINES = []
  for (let k = 0; k < 4000 && PINES.length < 30; k++) {
    const x = X0 - 6 + rnd() * (X1 - X0 + 10), z = YOSE.base(x) - 3 - rnd() * 30
    if (!YOSE.inside(x, z) || domeRho(x, z) > 0.9) continue
    if (alpineTrailDist(x, z) < 3 || Math.hypot(x - F.x, z - F.z) < 14 || PINES.some((p) => Math.hypot(p.x - x, p.z - z) < 7)) continue
    if (Math.hypot(x - CAMP.x, z - CAMP.z) < CAMP.R + 4 || YOSE.behind(x, z) || YOSE.inLake(x, z, 4) || alpineStreamDist(x, z) < 4) continue   // 營地裡、石階、湖、河上不長
    const y = alpineHeight(x, z), H = 18 + rnd() * 10
    if (H < 10) continue
    PINES.push({ x, z, y, H, rot: rnd() * TAU, lean: (rnd() - 0.5) * 0.05 })
  }
  // 2026-11-11 岩壁頂上的休息站（使用者：山頂要有大平地、加休息站；ChatGPT：國家公園那種簡樸的——木造涼亭、長椅、步道指標、解說牌、望遠鏡，不要商業化）
  {
    const wood = new THREE.MeshStandardMaterial({ color: 0x7a5a3a, roughness: 0.85 }), dark = new THREE.MeshStandardMaterial({ color: 0x4b3a2a, roughness: 0.9 })
    const stone = new THREE.MeshStandardMaterial({ color: 0x9a968e, roughness: 0.95 }), metal = new THREE.MeshStandardMaterial({ color: 0x3a3d3f, roughness: 0.45, metalness: 0.6 })
    const panelT = (() => { const c = document.createElement('canvas'); c.width = 512; c.height = 320; const x = c.getContext('2d'); x.fillStyle = '#5b3f26'; x.fillRect(0, 0, 512, 320); x.fillStyle = '#efe6cf'; x.fillRect(14, 14, 484, 292)
      x.fillStyle = '#2f4a2e'; x.font = 'bold 34px Georgia, serif'; x.fillText('Upper Fall Overlook', 34, 62); x.fillStyle = '#4a4a40'; x.font = '20px Georgia, serif'
      ;['Granite walls carved by glaciers', 'Watch for swifts and ravens', 'riding the updraft along the cliff.'].forEach((t, i) => x.fillText(t, 34, 112 + i * 30))
      x.strokeStyle = '#7c8f6a'; x.lineWidth = 4; x.beginPath(); x.moveTo(34, 240); x.bezierCurveTo(140, 180, 260, 280, 470, 210); x.stroke(); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t })()
    const signT = (() => { const c = document.createElement('canvas'); c.width = 512; c.height = 160; const x = c.getContext('2d'); x.fillStyle = '#6b4a2c'; x.fillRect(0, 0, 512, 160); x.fillStyle = '#f3e7c8'; x.font = 'bold 40px Georgia, serif'; x.fillText('UPPER FALL TRAIL', 30, 62); x.font = '30px Georgia, serif'; x.fillText('Valley  ↓   ·   Overlook  ←', 30, 120); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t })()
    const parts = { wood: [], dark: [], stone: [], metal: [] }
    const box = (k, w, h, d, x, y, z, ry = 0) => parts[k].push(new THREE.BoxGeometry(w, h, d).applyMatrix4(new THREE.Matrix4().makeRotationY(ry).setPosition(x, y, z)))
    const Y0 = (x) => YOSE.topY(x) + 0.05
    // 涼亭（4.4 × 5 m）：四根粗木柱站在石墩上，人字形屋頂
    const sx = 244.5, sz = YOSE.base(244.5) + 9.5, sy = Y0(sx)
    for (const dx of [-2.0, 2.0]) for (const dz of [-2.3, 2.3]) { box('stone', 0.5, 0.35, 0.5, sx + dx, sy + 0.17, sz + dz); box('wood', 0.26, 2.6, 0.26, sx + dx, sy + 1.6, sz + dz); addCollider(sx + dx, sz + dz, 0.25, sy + 3) }
    for (const dz of [-2.3, 2.3]) box('wood', 4.6, 0.22, 0.24, sx, sy + 2.95, sz + dz)
    for (const sgn of [-1, 1]) { const r = new THREE.BoxGeometry(2.9, 0.12, 5.8).applyMatrix4(new THREE.Matrix4().makeRotationZ(sgn * 0.42).setPosition(sx + sgn * 1.3, sy + 3.55, sz)); parts.dark.push(r) }
    box('wood', 0.2, 0.25, 5.8, sx, sy + 4.1, sz)
    // 涼亭裡：野餐桌＋兩條長椅
    box('wood', 1.0, 0.07, 2.2, sx, sy + 0.78, sz); for (const dz of [-0.85, 0.85]) box('wood', 0.9, 0.74, 0.1, sx, sy + 0.4, sz + dz)
    for (const dx of [-0.85, 0.85]) { box('wood', 0.32, 0.06, 2.2, sx + dx, sy + 0.46, sz); for (const dz of [-0.9, 0.9]) box('wood', 0.08, 0.44, 0.08, sx + dx, sy + 0.22, sz + dz) }
    addCollider(sx, sz, 1.0, sy + 0.9)
    // 看出去的原木長椅（面向山谷）
    for (const bx of [214, 222, 247]) { const bz = YOSE.topFront(bx) + 1.6, by = Y0(bx); box('wood', 1.8, 0.1, 0.4, bx, by + 0.45, bz); box('wood', 1.8, 0.4, 0.08, bx, by + 0.7, bz + 0.2); for (const dx of [-0.7, 0.7]) box('wood', 0.12, 0.42, 0.36, bx + dx, by + 0.21, bz); addCollider(bx, bz, 0.5, by + 0.6) }
    // 步道指標（石階頂）
    { const x = M0.XB + 2.2, z = YOSE.topFront(M0.XB) + 1.8, y = Y0(x); box('wood', 0.14, 1.9, 0.14, x, y + 0.95, z); const sg = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.38), new THREE.MeshStandardMaterial({ map: signT, roughness: 0.8 })); sg.position.set(x, y + 1.6, z + 0.08); g.add(sg); addCollider(x, z, 0.15, y + 2) }
    // 解說牌＋望遠鏡（瀑布口旁的觀景台）
    { const x = 204.2, z = YOSE.topFront(204.2) + 1.2, y = Y0(x); for (const dx of [-0.5, 0.5]) box('wood', 0.1, 0.9, 0.1, x + dx, y + 0.45, z); const pm = new THREE.Mesh(new THREE.PlaneGeometry(1.25, 0.78), new THREE.MeshStandardMaterial({ map: panelT, roughness: 0.7 })); pm.rotation.x = -0.6; pm.position.set(x, y + 1.05, z + 0.05); g.add(pm); addCollider(x, z, 0.5, y + 1.2) }
    { const x = 206.4, z = YOSE.topFront(206.4) + 0.9, y = Y0(x); box('metal', 0.12, 1.1, 0.12, x, y + 0.55, z); box('metal', 0.22, 0.2, 0.5, x, y + 1.2, z - 0.05); parts.metal.push(new THREE.CylinderGeometry(0.06, 0.06, 0.2, 10).rotateX(Math.PI / 2).translate(x - 0.06, y + 1.22, z - 0.35), new THREE.CylinderGeometry(0.06, 0.06, 0.2, 10).rotateX(Math.PI / 2).translate(x + 0.06, y + 1.22, z - 0.35)); addCollider(x, z, 0.2, y + 1.3) }
    // 垃圾桶（防熊的那種鐵箱）
    { const x = 241, z = YOSE.base(241) + 6.5, y = Y0(x); box('metal', 0.9, 1.0, 0.6, x, y + 0.5, z); addCollider(x, z, 0.5, y + 1.1) }
    for (const [k, list] of Object.entries(parts)) if (list.length) { const m = new THREE.Mesh(mergeGeometries(list.map((q) => q.index ? q.toNonIndexed() : q)), { wood, dark, stone, metal }[k]); m.castShadow = true; m.receiveShadow = true; g.add(m) }
  }
  // 2026-11-11 岩壁頂上也長樹（以前光禿禿）：西黃松、矮一點，離邊 4 公尺以上；觀景台、走道、溪讓開
  for (let k = 0, n = 0; k < 3000 && n < 16; k++) {
    const x = X0 + 8 + rnd() * (X1 - X0 - 16), zb = YOSE.base(x), ze = YOSE.edge(x) - 2, zf = (x > YOSE.mist.XA - 2 && x < YOSE.mist.XB + 2) ? YOSE.topFront(x) : zb + 3
    const z = zf + 4 + rnd() * (ze - zf - 4)
    if (ze - zf < 6 || Math.abs(x - YOSE.fall.x) < 6 || (x > 199 && x < 252 && z < YOSE.edge(x) - 4.5) || Math.hypot(x - 244.5, z - YOSE.base(244.5) - 9.5) < 6 || PINES.some((p) => Math.hypot(p.x - x, p.z - z) < 6)) continue
    PINES.push({ x, z, y: YOSE.topY(x) - 0.2, H: 9 + rnd() * 6, rot: rnd() * TAU, lean: (rnd() - 0.5) * 0.08 }); n++
  }
  if (PINES.length) {
    const pbark = barkMaterial('pine_bark', { normal: 1.5, color: [1.75, 1.15, 0.8] })   // 西黃松的樹皮：橘紅色的大鱗片，裂縫黑
    const tg = new THREE.CylinderGeometry(0.55, 1, 1, 18, 12, true).translate(0, 0.5, 0)
    { const u = tg.attributes.uv; for (let i = 0; i < u.count; i++) u.setXY(i, u.getX(i) * 2, u.getY(i) * 10) }
    const trunk = new THREE.InstancedMesh(tg, pbark, PINES.length)
    const limbs = [], tufts = [], cc = new THREE.Color()
    PINES.forEach((p, i) => {
      const R = 0.32 + p.H * 0.012
      m4.compose(V(p.x, p.y - 0.3, p.z), q.setFromEuler(e.set(p.lean, p.rot, 0)), s.set(R, p.H * 0.93, R)); trunk.setMatrixAt(i, m4)
      addCollider(p.x, p.z, R * 1.1, p.y + p.H)
      // 樹冠：上半段 10～14 根往上翹的枝，枝梢一簇簇長針葉（樹冠開闊、看得到天空）
      const nL = 10 + Math.floor(rnd() * 5)
      for (let k = 0; k < nL; k++) {
        const h = p.H * (0.5 + 0.42 * k / nL), a = k * 2.4 + rnd() * 0.6, up = 0.15 + rnd() * 0.35 + 0.3 * (k / nL)
        const len = p.H * (0.13 + rnd() * 0.07) * (1.15 - k / nL * 0.6), dir = V(Math.cos(a) * Math.cos(up), Math.sin(up), Math.sin(a) * Math.cos(up))
        const base = V(p.x, p.y + h, p.z)
        limbs.push({ p: base, q: new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), dir), s: V(R * 0.18, len, R * 0.18) })
        for (const u of [0.55, 0.85, 1.05]) {
          const S = 2.0 + rnd() * 1.4, cp = base.clone().addScaledVector(dir, len * u).add(V(0, -S * 0.3, 0))
          tufts.push({ p: cp, q: new THREE.Quaternion().setFromEuler(new THREE.Euler((rnd() - 0.5) * 1.2, rnd() * TAU, (rnd() - 0.5) * 1.2)), s: V(S * 1.3, S, S * 1.3), c: cc.setHSL(0.27 + (rnd() - 0.5) * 0.04, 0.3, 0.6 + rnd() * 0.12).clone() })
        }
      }
      tufts.push({ p: V(p.x, p.y + p.H * 0.86, p.z), q: new THREE.Quaternion(), s: V(3, p.H * 0.16, 3), c: cc.setHSL(0.27, 0.3, 0.65).clone() })   // 樹梢
    })
    const lg = new THREE.CylinderGeometry(0.3, 1, 1, 8, 1, true).translate(0, 0.5, 0)
    const limbM = new THREE.InstancedMesh(lg, pbark, limbs.length); limbs.forEach((l, i) => limbM.setMatrixAt(i, m4.compose(l.p, l.q, l.s)))
    const tuftM = new THREE.InstancedMesh(coniferGeo('hemlock', 7), needleMaterial(), tufts.length); tufts.forEach((t, i) => { tuftM.setMatrixAt(i, m4.compose(t.p, t.q, t.s)); tuftM.setColorAt(i, t.c) })
    for (const m of [trunk, limbM, tuftM]) { m.castShadow = true; m.receiveShadow = true; m.computeBoundingSphere(); g.add(m) }
  }

  // 2026-11-11 瀑布湖的岸（使用者：左岸一片光禿的米色坡）：一層草（花園那套草葉）、蕨類、長青苔的石頭；步道、河道、石階、岩壁讓開
  {
    const LK = YOSE.lake, ok = (x, z) => !YOSE.behind(x, z) && alpineTrailDist(x, z) > 1.3 && alpineStreamDist(x, z) > 1.6 && !YOSE.inLake(x, z, 0.4) && domeRho(x, z) < 0.93
    const A = [], B = [], c = new THREE.Color(), sunV = V(-0.45, 0.8, 0.3).normalize()
    for (let k = 0; k < 120000 && A.length / 4 < 40000; k++) {
      const a = rnd() * TAU, e = 1.03 + Math.pow(rnd(), 1.4) * 2.6, x = LK.x + Math.cos(a) * LK.rx * e, z = LK.z + Math.sin(a) * LK.rz * e
      if (!ok(x, z)) continue
      const n = fbm2(x * 0.7, z * 0.7, 2)
      c.setHSL(0.22 + n * 0.06 + (rnd() - 0.5) * 0.03, 0.45, 0.2 + rnd() * 0.08)
      if (rnd() < 0.12) c.lerp(new THREE.Color(0.55, 0.5, 0.3), 0.45)
      A.push(x, alpineHeight(x, z) - 0.02, z, rnd() * TAU)
      B.push(c.r, c.g, c.b, (0.12 + rnd() * 0.2 + Math.max(0, n - 0.4) * 0.4) * (e < 1.15 ? 1.4 : 1))   // 水邊的草長一點
    }
    if (A.length) { const gm = bladeMesh(A, B, { width: [0.006, 0.008], sun: sunV }); gm.frustumCulled = false; g.add(gm) }
    if (lib) {
      const ferns = ['fern_sa', 'fern_sb', 'fern2_b', 'fern2_c', 'fern_a'].filter((n) => lib[n]), rocks = ['mrock_2', 'mrock_5', 'mrock_8', 'mrock_10', 'mrock_11'].filter((n) => lib[n])
      const fl = {}, rl = {}
      for (let k = 0, nf = 0, nr = 0; k < 4000 && (nf < 70 || nr < 34); k++) {
        const a = rnd() * TAU, e = 1.05 + rnd() * 1.3, x = LK.x + Math.cos(a) * LK.rx * e, z = LK.z + Math.sin(a) * LK.rz * e
        if (!ok(x, z)) continue
        const y = alpineHeight(x, z)
        if (nf < 70 && ferns.length && rnd() < 0.7) { (fl[ferns[Math.floor(rnd() * ferns.length)]] ||= []).push({ p: V(x, y - 0.05, z), q: new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), rnd() * TAU), s: V(1, 1, 1).multiplyScalar(0.8 + rnd() * 0.7) }); nf++ }
        else if (nr < 34 && rocks.length) { const k2 = 0.35 + rnd() * 0.75; (rl[rocks[Math.floor(rnd() * rocks.length)]] ||= []).push({ p: V(x, y - 0.25 * k2, z), q: new THREE.Quaternion().setFromEuler(new THREE.Euler(rnd() * 0.3, rnd() * TAU, rnd() * 0.3)), s: V(k2, k2 * (0.6 + rnd() * 0.4), k2) }); nr++ }
      }
      for (const [n, list] of [...Object.entries(fl), ...Object.entries(rl)]) scatter(g, lib[n], list, { cast: true })
    }
  }

  let lastT = 0
  function tick(t) {
    const dt = Math.min(0.1, Math.max(0, t - lastT)); lastT = t
    uT.value = t
    for (const sp of mist) { const u = sp.userData; sp.material.opacity = 0.28 + 0.16 * Math.sin(t * 0.6 + u.ph); sp.position.set(u.p0.x + Math.sin(t * 0.13 + u.ph) * 1.5, u.p0.y + Math.sin(t * 0.21 + u.ph) * 0.8, u.p0.z - (0.5 + 0.5 * Math.sin(t * 0.09 + u.ph)) * 2.5) }
    for (const f of foams) { const k = (t * (f.userData.k ? 0.35 : 0.22) + f.userData.k * 0.5) % 1; f.rotation.y = t * (f.userData.k ? -0.05 : 0.03); f.material.opacity = 0.85 * (1 - k * 0.6) }
    if (sprayU && dt > 0) sprayU(dt)
  }
  return { group: g, tick, pines: PINES }
}
const mist = [], foams = []
let sprayU = null
