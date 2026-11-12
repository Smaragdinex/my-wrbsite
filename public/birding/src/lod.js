// 植物 LOD：以前每一株、每一片草不管在哪都照畫（看任何方向都畫整個溫室，約 2,400 萬個三角形）。
// 1. 一般的 InstancedMesh（plants.js 的 scatter、flora.js 的 makeInst）：每隔幾格（鏡頭有動才做）逐株檢查——
//    在視野外（留一點邊，畫面外的植物影子才不會突然消失）就不畫；地面上矮的植物越遠越稀疏、太遠就不畫；
//    大樹、長在山上的（y > 2.5，遠景主角，第一版把整座山的植物都弄不見了）永遠不稀疏。
//    看得到的那幾株的矩陣擠到最前面、count 設成那麼多：繪製次數不變。
// 2. 草葉：切成一塊一塊（每塊自己的範圍，視野外整塊不畫），塊裡的草先打亂順序，越遠 instanceCount 越少＝越稀。
// 距離都照鏡頭變焦換算：長焦望遠看遠處時，遠處的植物在畫面上很大，不能變稀。
import * as THREE from 'three'
import { dayLight } from './structures.js'

const WALK_FOV = 62
const sets = [], grass = []
const _fr = new THREE.Frustum(), _pm = new THREE.Matrix4(), _c = new THREE.Vector3()
const last = { p: new THREE.Vector3(1e9, 0, 0), q: new THREE.Quaternion(), fov: 0 }
export const lodStats = { instances: 0, drawn: 0, grass: 0, grassDrawn: 0 }
// 自動畫質（settings.js）會調這個：所有 LOD 距離乘上它（1＝原本、0.5＝一半的距離就開始變稀）
export const lodQuality = { scale: 1 }
export const lodSetScale = (k) => { if (Math.abs(lodQuality.scale - k) > 1e-3) { lodQuality.scale = k; last.fov = 0 } }

// meshes：共用同一份擺放清單的 InstancedMesh（一種植物的各個材質）；h：這種植物大概多高（公尺）
// lows：（可選）跟 meshes 一一對應的低面數版本（plants.js 的 lowGeo），沒有的放 null；遠處的株改畫低面數版本
export function lodRegister(meshes, h, lows = [], { solid = false } = {}) {
  const keep = meshes.map((m, i) => m?.isInstancedMesh && m.count > 0 ? i : -1).filter((i) => i >= 0)
  meshes = keep.map((i) => meshes[i]); lows = keep.map((i) => lows[i] ?? null)
  if (!meshes.length) return
  const m0 = meshes[0], n = m0.count
  // 每株自己做視野剔除：整組的 three.js 剔除關掉（它的包圍球被 LOD 改過 count 之後會過時，整組被誤判在視野外、全部不畫）
  for (const m of [...meshes, ...lows]) if (m) { if (!m.boundingSphere) m.computeBoundingSphere(); m.userData.fullSphere ??= m.boundingSphere.clone(); m.frustumCulled = false }
  const base = m0.instanceMatrix.array.slice(0, n * 16)
  const pos = new Float32Array(n * 3), rad = new Float32Array(n), hash = new Float32Array(n)
  const g = m0.geometry
  if (!g.boundingSphere) g.computeBoundingSphere()
  const gs = g.boundingSphere
  const m4 = new THREE.Matrix4(), s = new THREE.Vector3()
  for (let i = 0; i < n; i++) {
    m4.fromArray(base, i * 16)
    _c.copy(gs.center).applyMatrix4(m4); pos.set([_c.x, _c.y, _c.z], i * 3)
    s.setFromMatrixScale(m4); rad[i] = gs.radius * Math.max(s.x, s.y, s.z)
    hash[i] = ((Math.sin(i * 12.9898 + n * 0.731) * 43758.5453) % 1 + 1) % 1
    if (solid || _c.y > 2.5) hash[i] = -1   // solid：石階、欄杆、蘆葦叢這種不能東缺一塊的（只做視野外、太遠太小不畫）。長在山上（離地面高）的植物是遠景的主角，從哪裡都看得到：不變稀，只做視野外不畫
  }
  const cols = meshes.map((m) => m.instanceColor ? m.instanceColor.array.slice(0, n * 3) : null)
  // 矮的（蕨類、地被）14～40 公尺開始變稀、更遠就不畫；4 公尺以上的樹只做視野外不畫
  const d0 = Math.max(14, h * 14), d1 = h >= 4 || solid ? Infinity : Math.max(32, h * 40)
  if (!solid) for (const m of [...meshes, ...lows]) if (m?.castShadow) m.userData.lodManaged = true   // 陰影由 lodShadowProxies 的替身負責（shadowcache.js）
  // 換成低面數的距離：一公尺的蕨類 10 公尺外、越高的越遠才換（長焦時照變焦倍率拉遠）
  // 2026-11-12 使用者：遠景的樹看起來是板狀的低模——「應該像人眼一樣：圓的、看不清楚，但不是低模」→ 4 m 以上的樹換低面數版本的距離拉遠一倍多（20 m 的樹 200 m → 440 m）
  const dL = h >= 4 ? h * 22 : Math.max(10, h * 10)
  const S0 = { meshes, lows, n, base, cols, pos, rad, hash, d0, d1, dL, vis: new Uint32Array(n), far: new Uint8Array(n), scl: new Float32Array(n), proxies: null }
  sets.push(S0)
  // 2026-11-12 遠景替身（ChatGPT：3A 遊戲的遠景不是整片烘成一張圖，是遠處的樹換成「多角度替身貼片」）：
  // 4 m 以上的樹，遠到在畫面上不到 IMP_PX 像素高的那幾棵不畫模型，改畫一片面向鏡頭的貼片（2 個三角形），貼圖是這種樹從 8 個方向拍下來的（第一次用到時烘）。
  // 一棵冷杉 1,000～5,000 個三角形 → 2 個；所以遠處的樹不用再變稀（以前 230～330 m 之間抽掉），整片森林都在
  // 2026-11-12 使用者：「還是用原本的吧，遠景根本糊掉。讓玩家載入久一點是可以的」——替身貼片在他的螢幕上是一塊塊方形（貼圖的透明邊沒去乾淨、解析度也不夠）→ 關掉，遠處照舊畫真的樹
  if (IMP_ON && h >= 4 && !solid && n >= 12 && typeof document !== 'undefined') {
    const org = new Float32Array(n * 3), sz = new Float32Array(n * 4), p3 = new THREE.Vector3(), q4 = new THREE.Quaternion(), e3 = new THREE.Euler()
    const bb = new THREE.Box3(); for (const m of meshes) { if (!m.geometry.boundingBox) m.geometry.computeBoundingBox(); bb.union(m.geometry.boundingBox) }
    const R = Math.max(-bb.min.x, bb.max.x, -bb.min.z, bb.max.z)
    for (let i = 0; i < n; i++) { m4.fromArray(base, i * 16); m4.decompose(p3, q4, s); e3.setFromQuaternion(q4, 'YXZ'); org.set([p3.x, p3.y, p3.z], i * 3); sz.set([R * Math.max(s.x, s.z), bb.min.y * s.y, bb.max.y * s.y, e3.y], i * 4) }
    S0.imp = { org, sz, R, y0: bb.min.y, y1: bb.max.y, idx: new Uint32Array(n), mesh: null, hM: (bb.max.y - bb.min.y) }
  }
  lodStats.instances += n * meshes.length
  last.fov = 0   // 下一格強制更新
}

// 草葉一塊：mesh（InstancedBufferGeometry，草已經打亂順序）、中心、半徑
export function lodRegisterGrass(mesh, center, r) {
  grass.push({ mesh, c: center.clone(), r, n: mesh.geometry.instanceCount })
  lodStats.grass += mesh.geometry.instanceCount
  last.fov = 0
}

// 陰影替身：LOD 只留看得到的那幾株，陰影卻要整片都有（陰影貼圖會留著重複用）。
// 每種會投影的植物多放一份「全部的株、不變稀、不剔除」的 InstancedMesh，只放在陰影層（shadowcache.js），主畫面看不到。
// 共用幾何和材質，只多一份矩陣。
export function lodShadowProxies() {
  for (const S of sets) {
    if (S.proxies) continue
    if (!S.meshes.every((m) => m.parent)) continue   // 還沒加進場景：下次再做
    S.proxies = []
    // 2026-11-10 整片陰影只有一張 1024 貼圖蓋 380×260 公尺（一個貼素約 37 公分）：2 公尺以下的植物（蕨類、草叢、花）投的影子只剩一團糊，
    // 但它們的替身佔了陰影重畫一半以上的三角形 → 不投影
    if (S.d0 < 28) continue
    for (const [mi, m] of S.meshes.entries()) {
      if (!m.userData.lodManaged) continue
      // 影子用低面數版本（陰影貼圖每個貼素約 9 公分，看不出差別，重畫陰影比較快）
      const px = new THREE.InstancedMesh(S.lows[mi]?.geometry ?? m.geometry, m.material, S.n)
      px.instanceMatrix.array.set(S.base)
      px.position.copy(m.position); px.quaternion.copy(m.quaternion); px.scale.copy(m.scale)
      px.castShadow = true; px.receiveShadow = false
      px.customDepthMaterial = m.customDepthMaterial
      px.layers.set(5); px.userData.shadowProxy = true; px.name = (m.name || 'lod') + ':shadow'
      px.computeBoundingSphere()
      m.parent.add(px)
      S.proxies.push(px)
    }
  }
}

// 2026-11-10 玩家回饋「好卡」：每次重畫陰影都把替身「全部」的株（整座山上幾千棵）畫進陰影貼圖（一次多 600 萬個三角形、一格 26→56 毫秒，每秒一次頓一下）。
// 陰影貼圖只蓋太陽目標附近 r 公尺：重畫前只留那一圈裡的株
export function lodShadowCull(cx, cz, r) {
  for (const S of sets) {
    if (!S.proxies?.length) continue
    let k = 0
    const src = S.base, n = S.n
    S.shIdx ??= new Uint32Array(n)
    for (let i = 0; i < n; i++) {
      const dx = S.pos[i * 3] - cx, dz = S.pos[i * 3 + 2] - cz, rr = r + S.rad[i]
      if (dx * dx + dz * dz < rr * rr) S.shIdx[k++] = i
    }
    for (const px of S.proxies) {
      const a = px.instanceMatrix.array
      for (let j = 0; j < k; j++) { const i = S.shIdx[j]; for (let e = 0; e < 16; e++) a[j * 16 + e] = src[i * 16 + e] }
      px.count = k; px.instanceMatrix.needsUpdate = true
    }
  }
}

const IMP_ON = false
const TF0 = 230, TF1 = 330, PXK = 750, MINPX = 5, IMP_PX = 150, IMP_N = 8, IMP_W = 128, IMP_H = 256
// ---------- 遠景替身 ----------
let impCtx = null   // { renderer, sun, hemi }（world.js 建好之後給）
export const lodInit = (ctx) => { impCtx = ctx; last.fov = 0 }
const impLight = { value: 1 }
const QUAD = (() => { const g = new THREE.InstancedBufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute([-1, 0, 0, 1, 0, 0, 1, 1, 0, -1, 1, 0], 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2)); g.setIndex([0, 1, 2, 0, 2, 3]); return g })()
function impBake(S) {
  const { renderer, sun, hemi } = impCtx, I = S.imp
  const rt = new THREE.WebGLRenderTarget(IMP_W * IMP_N, IMP_H, { minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: true, depthBuffer: true })
  const sc = new THREE.Scene(), cx = 0, hh = (I.y1 - I.y0), W = Math.max(I.R, hh * IMP_W / IMP_H / 2)
  for (const m of S.meshes) { const o = new THREE.Mesh(m.geometry, m.material); o.frustumCulled = false; sc.add(o) }
  sc.add(new THREE.HemisphereLight(hemi.color, hemi.groundColor, hemi.intensity))
  const dl = new THREE.DirectionalLight(sun.color, sun.intensity); sc.add(dl); sc.add(dl.target)
  const cam = new THREE.OrthographicCamera(-W, W, I.y1, I.y0, 0.1, W * 6 + 200)
  const prevRT = renderer.getRenderTarget(), prevC = renderer.getClearColor(new THREE.Color()), prevA = renderer.getClearAlpha(), prevAuto = renderer.autoClear, sh = renderer.shadowMap.autoUpdate, vp = renderer.getViewport(new THREE.Vector4()), scT = renderer.getScissorTest()
  renderer.shadowMap.autoUpdate = false; renderer.setRenderTarget(rt); renderer.setClearColor(0x1a2a14, 0); renderer.autoClear = false; renderer.setScissorTest(false); renderer.clear()
  for (let a = 0; a < IMP_N; a++) {
    const an = a / IMP_N * Math.PI * 2, D = W * 3 + 50
    cam.position.set(Math.sin(an) * D, 0, Math.cos(an) * D); cam.up.set(0, 1, 0); cam.lookAt(0, 0, 0); cam.updateMatrixWorld()
    dl.position.set(Math.sin(an + 0.7) * 10, 9, Math.cos(an + 0.7) * 10)   // 光從鏡頭的斜上方來：每個角度的貼圖都是亮面為主，轉著看不會忽明忽暗
    renderer.setViewport(a * IMP_W, 0, IMP_W, IMP_H); renderer.render(sc, cam)
  }
  renderer.setRenderTarget(prevRT); renderer.setClearColor(prevC, prevA); renderer.autoClear = prevAuto; renderer.shadowMap.autoUpdate = sh; renderer.setViewport(vp); renderer.setScissorTest(scT)
  I.W = W; I.day0 = 0.12 + 0.95 * dayLight.value
  const g = QUAD.clone(); g.instanceCount = 0
  g.setAttribute('iPos', new THREE.InstancedBufferAttribute(new Float32Array(S.n * 3), 3)); g.setAttribute('iSz', new THREE.InstancedBufferAttribute(new Float32Array(S.n * 4), 4)); g.setAttribute('iCol', new THREE.InstancedBufferAttribute(new Float32Array(S.n * 3).fill(1), 3))
  const mat = new THREE.ShaderMaterial({ fog: true, side: THREE.DoubleSide,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { map: { value: null }, uLight: { value: 1 }, uK: { value: W / Math.max(1e-3, I.R) } }]),
    vertexShader: `attribute vec3 iPos; attribute vec4 iSz; attribute vec3 iCol; uniform float uK; varying vec2 vUv; varying vec3 vCol;
      #include <fog_pars_vertex>
      void main(){
        vec3 toC = cameraPosition - iPos; float ang = atan(toC.x, toC.z) - iSz.w;
        float cell = floor(mod(ang / 6.2831853 * ${IMP_N}.0 + 0.5, ${IMP_N}.0));
        vec3 right = normalize(vec3(toC.z, 0.0, -toC.x));
        vec3 wp = iPos + right * position.x * iSz.x * uK + vec3(0.0, mix(iSz.y, iSz.z, position.y), 0.0);
        vUv = vec2((cell + uv.x) / ${IMP_N}.0, uv.y); vCol = iCol;
        vec4 mvPosition = viewMatrix * vec4(wp, 1.0); gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: `uniform sampler2D map; uniform float uLight; varying vec2 vUv; varying vec3 vCol;
      #include <common>
      #include <fog_pars_fragment>
      void main(){
        vec4 t = texture2D(map, vUv); if (t.a < 0.45) discard;
        gl_FragColor = vec4(t.rgb / max(t.a, 0.45) * vCol * uLight, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }` })
  mat.uniforms.map.value = rt.texture; mat.uniforms.uLight = impLight
  const mesh = new THREE.Mesh(g, mat); mesh.frustumCulled = false; mesh.name = 'lod:impostor'; mesh.renderOrder = -1
  S.meshes[0].parent?.add(mesh); mesh.matrixAutoUpdate = false
  I.mesh = mesh; I.rt = rt
  lodStats.impSets = (lodStats.impSets ?? 0) + 1
}
function impFill(S, n) {
  const I = S.imp
  if (!I.mesh) { if (!n || !impCtx || !S.meshes[0].parent) return; try { impBake(S) } catch (e) { console.error('[impostor]', e); S.imp = null; return } }
  const g = I.mesh.geometry, P = g.attributes.iPos.array, Z = g.attributes.iSz.array, C = g.attributes.iCol.array, co = S.cols[0]
  for (let j = 0; j < n; j++) { const i = I.idx[j]; P[j * 3] = I.org[i * 3]; P[j * 3 + 1] = I.org[i * 3 + 1]; P[j * 3 + 2] = I.org[i * 3 + 2]; Z[j * 4] = I.sz[i * 4]; Z[j * 4 + 1] = I.sz[i * 4 + 1]; Z[j * 4 + 2] = I.sz[i * 4 + 2]; Z[j * 4 + 3] = I.sz[i * 4 + 3]; if (co) { C[j * 3] = co[i * 3]; C[j * 3 + 1] = co[i * 3 + 1]; C[j * 3 + 2] = co[i * 3 + 2] } }
  g.instanceCount = n; g.attributes.iPos.needsUpdate = true; g.attributes.iSz.needsUpdate = true; if (co) g.attributes.iCol.needsUpdate = true
  I.mesh.visible = n > 0 && S.meshes[0].visible !== false
  impLight.value = (0.12 + 0.95 * dayLight.value) / (I.day0 || 1)
  lodStats.impDrawn = (lodStats.impDrawn ?? 0) + n
}
export function lodUpdate(camera, force = false) {
  camera.updateMatrixWorld()
  const p = camera.getWorldPosition(_c.clone()), q = camera.getWorldQuaternion(new THREE.Quaternion())
  if (!force && p.distanceToSquared(last.p) < 0.25 && Math.abs(q.dot(last.q)) > 0.9997 && Math.abs(camera.fov - last.fov) < 0.5) return
  last.p.copy(p); last.q.copy(q); last.fov = camera.fov
  _pm.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse); _fr.setFromProjectionMatrix(_pm)
  const zoom = Math.max(1, Math.tan(THREE.MathUtils.degToRad(WALK_FOV / 2)) / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))) * lodQuality.scale
  const P = _fr.planes
  let drawn = 0, lowTris = 0, nearN = 0; lodStats.impDrawn = 0
  for (const S of sets) {
    const d0 = S.d0 * zoom, d1 = S.d1 * zoom, d1s = d1 * d1, dLs = (S.dL * zoom) ** 2
    let k = 0, ki = 0
    for (let i = 0; i < S.n; i++) {
      const x = S.pos[i * 3] - p.x, y = S.pos[i * 3 + 1] - p.y, z = S.pos[i * 3 + 2] - p.z
      const dd = x * x + y * y + z * z
      if (dd > d1s && S.hash[i] >= 0) continue
      let sc0 = 1
      // 2026-11-12 使用者「場景太重，學校打不開、家裡開始卡」：站在入口一格畫 2,790 萬個三角形——山上的小東西（蕨、石頭、石階）以前多遠都畫。
      // 在畫面上半徑不到 MINPX 像素的不畫（照鏡頭焦距和畫質等級算：長鏡頭拉近、畫質高就畫得遠）。半徑 0.4 m 的蕨約 60 m、1.5 m 的石頭 225 m、6 m 的樹 900 m
      { const rr = S.rad[i] * PXK * zoom, q2 = rr * rr / (MINPX * MINPX * dd); if (q2 < 1) continue; if (q2 < 2.2) sc0 = 0.2 + 0.8 * (Math.sqrt(q2) - 1) / 0.483 }
      // 2026-11-10 玩家回饋「好卡」：高的樹以前多遠都畫（站在花園水池邊，山區、巨木林幾千棵樹全畫，一格 1000 多萬個三角形）。
      // 230～330 公尺之間慢慢變稀（150～210 試過：山頂往下看整片森林不見）（每株照自己的雜湊值，不會一條線整排消失），再遠不畫；霧已經把那麼遠的樹蓋得很淡。長鏡頭拉近時照倍率拉遠
      // 2026-11-12 使用者：「邊走有些樹才跑出來」——以前過了門檻整棵突然出現。現在快要出現的那一段從很小慢慢長到原本大小（sc 0.15→1），看起來是從遠處淡進來，不是蹦出來
      let sc = 1
      if (!S.imp && dd > TF0 * TF0 * zoom * zoom) { const d = Math.sqrt(dd) / zoom; if (d > TF1) continue; const m = 1 - (d - TF0) / (TF1 - TF0) - ((i * 0.6180339887) % 1); if (m < 0) continue; sc = Math.min(sc, 0.15 + 0.85 * Math.min(1, m / 0.22)) }
      if (d1 !== Infinity) { const d = Math.sqrt(dd); if (d > d0) { const m = 1 - (d - d0) / (d1 - d0) - S.hash[i]; if (m < 0) continue; sc = Math.min(sc, 0.15 + 0.85 * Math.min(1, m / 0.2)) } }
      // 視野外不畫；邊界多留 6 公尺（畫面外的植物影子會投進畫面）＋距離的 8%（約 4.6 度）：
      // 鏡頭轉不到 2.8 度不重算，遠處的樹以前只留 6 公尺（200 公尺外不到 2 度），慢慢轉頭時畫面邊緣的樹會突然冒出來、消失（2026-11-08 山上）
      const r = S.rad[i] + 6 + Math.sqrt(dd) * 0.08, cx = S.pos[i * 3], cy = S.pos[i * 3 + 1], cz = S.pos[i * 3 + 2]
      let out = false
      for (let j = 0; j < 6; j++) { const pl = P[j]; if (pl.normal.x * cx + pl.normal.y * cy + pl.normal.z * cz + pl.constant < -r) { out = true; break } }
      if (out) continue
      if (S.imp) { const hpx = (S.imp.sz[i * 4 + 2] - S.imp.sz[i * 4 + 1]) * PXK * zoom; if (hpx * hpx < IMP_PX * IMP_PX * dd) { S.imp.idx[ki++] = i; continue } }
      S.far[k] = dd > dLs ? 1 : 0
      S.scl[k] = Math.min(sc, sc0)
      S.vis[k++] = i
    }
    // 把選到的株的矩陣擠到最前面；pick(j)：這一株要不要放進這個 mesh
    const fill = (m, mi, pick) => {
      const a = m.instanceMatrix.array, ca = m.instanceColor?.array, co = S.cols[mi]
      let c = 0
      for (let j = 0; j < k; j++) {
        if (!pick(j)) continue
        const i = S.vis[j]
        a.set(S.base.subarray(i * 16, i * 16 + 16), c * 16)
        const sk = S.scl[j]; if (sk < 0.999) { const o = c * 16; for (let e = 0; e < 11; e++) if (e !== 3 && e !== 7) a[o + e] *= sk }   // 快要出現／消失的：縮小（只縮 3×3 的部分，位置不動）
        if (ca && co) { ca[c * 3] = co[i * 3]; ca[c * 3 + 1] = co[i * 3 + 1]; ca[c * 3 + 2] = co[i * 3 + 2] }
        c++
      }
      m.count = c   // 不動 visible：高山館切換兩館時會整批藏起來（alpine.js），這裡設 visible 會把它又打開
      m.instanceMatrix.clearUpdateRanges(); m.instanceMatrix.addUpdateRange(0, Math.max(1, c) * 16); m.instanceMatrix.needsUpdate = true
      if (ca && co) { m.instanceColor.clearUpdateRanges(); m.instanceColor.addUpdateRange(0, Math.max(1, c) * 3); m.instanceColor.needsUpdate = true }
      return c
    }
    S.meshes.forEach((m, mi) => {
      const lo = S.lows[mi]
      if (!lo) { fill(m, mi, () => true); return }
      const near = fill(m, mi, (j) => !S.far[j]), far = fill(lo, mi, (j) => S.far[j])
      const vc = (q) => q.index ? q.index.count : q.attributes.position.count   // 沒有索引的幾何（outside.js 的樹）用頂點數
      lowTris += far * (vc(m.geometry) - vc(lo.geometry)) / 3; nearN += near
    })
    drawn += k * S.meshes.length
    if (S.imp) impFill(S, ki)
  }
  // 草：15 公尺內全密，到 60 公尺漸漸剩兩成，90 公尺外不畫（地面本身是綠的）
  let gd = 0
  const sph = new THREE.Sphere()
  for (const G of grass) {
    sph.set(G.c, G.r)
    const d = Math.max(0, G.c.distanceTo(p) - G.r * 0.5) / zoom
    let f = d < 15 ? 1 : d < 60 ? 1 - 0.8 * (d - 15) / 45 : d < 90 ? 0.2 : 0
    if (!_fr.intersectsSphere(sph)) f = 0
    G.mesh.geometry.instanceCount = Math.round(G.n * f)
    gd += G.mesh.geometry.instanceCount
  }
  lodStats.drawn = drawn; lodStats.grassDrawn = gd; lodStats.trisSaved = Math.round(lowTris)
}
if (typeof window !== 'undefined') window.__lod = { update: lodUpdate, stats: lodStats, sets, grass }
