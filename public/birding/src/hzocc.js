// ※ 2026-11-20 沒有接進遊戲（world.js 沒 import）：畫面逐像素相同，但量起來反而慢 1～3 ms——
//   Chrome 同步讀回小圖固定要等 2～3 ms（跟畫多少無關），而被擋住的 draw call 大多是「整座園區一個 InstancedMesh」，整批剔不掉（只剔得到 1/4）。
//   要接回來：world.js render() 開頭 hz.begin(scene, cam)、主畫面前 hz.prepare、畫完 hz.end；驗證用 tools/record/hzcheck.js、dcwho.js
// 2026-11-20 FPS 第 5 項（使用者：「改善 FPS 但不要減少美術材質」→「Do 4 and 5」）：遮擋剔除（全園通用、每一格當場算，不延遲）。
// 量到的：五個測試視角，主畫面畫的物件有 55～88% 一個像素都沒露出來（被山、岩壁、地形、店的牆擋住）；全部不畫，每格快 35～45%。
// 做法（每一格主畫面之前）：
//   1. 只把「大的、不透明、不挖洞」的東西（地形、岩壁、牆…）用一個極簡的材質畫一張半解析度的深度圖（替身物件共用原本的幾何、位置每格照抄）
//   2. 在顯示卡上縮成 1/4（每格取「最遠」的深度，還往外多看一格 → 只會少擋、不會多擋），讀回 CPU（約 240×135）
//   3. 每個物件用它的包圍球（three.js 自己做視野剔除也是用這個）算出在畫面上的範圍和最近的距離；範圍裡每一格的遮擋物都比它近 → 這一格主畫面不畫它
// 只影響主畫面（這一台鏡頭、這一格）：影子、水面倒影、拍照照常畫全部。
// 當遮擋物的條件：材質的頂點著色器沒有改頂點位置（風吹的草、水波…不算）——直接拿編譯好的著色器原始碼跟 three.js 原版比對，不靠名字猜。
import * as THREE from 'three'

const RED = 4                         // 半解析度 → 再縮 4 倍（一格＝螢幕 8×8 像素）
const SHADER_ID = { MeshStandardMaterial: 'physical', MeshPhysicalMaterial: 'physical', MeshLambertMaterial: 'lambert', MeshPhongMaterial: 'phong', MeshBasicMaterial: 'basic', MeshToonMaterial: 'toon', MeshMatcapMaterial: 'matcap' }
const MOVE = /\b(transformed|gl_Position|mvPosition)\b(\.[xyzw]{1,4})?\s*([-+*/]?=)(?!=)/
const CALL = /(\w+)\s*\(([^()]*\btransformed\b[^()]*)\)/g
const SAFE_FN = new Set(['vec2', 'vec3', 'vec4', 'mat3', 'mat4', 'length', 'normalize', 'dot', 'distance', 'abs', 'floor', 'fract', 'clamp', 'min', 'max', 'step', 'smoothstep', 'sin', 'cos', 'mix'])
const resolve = (s, d = 0) => d > 8 ? s : s.replace(/#include <(\w+)>/g, (m, n) => THREE.ShaderChunk[n] != null ? resolve(THREE.ShaderChunk[n], d + 1) : m)
const moveLines = (src) => {
  const out = []
  for (const raw of src.split('\n')) {
    const l = raw.trim(); if (!l || l.startsWith('//')) continue
    if (MOVE.test(l)) out.push(l)
    for (const m of l.matchAll(CALL)) if (!SAFE_FN.has(m[1])) out.push('CALL ' + l)
  }
  return out.sort().join('\n')
}
const refMoves = {}
// 著色器「動到頂點位置的那幾行」跟 three.js 原版一模一樣才算安全（加 varying、讀 transformed 都沒關係）
function vertexSafe(src, type) {
  const id = SHADER_ID[type]; if (!id || !src) return false
  const ref = refMoves[id] ??= moveLines(resolve(THREE.ShaderLib[id].vertexShader))
  return moveLines(src) === ref
}

export function createOcclusion(renderer) {
  const gl = renderer.getContext()
  const st = { on: !/[?&]noocc/.test(location.search), ok: !!(renderer.capabilities.isWebGL2 && renderer.extensions.has('EXT_color_buffer_float')), occluders: 0, cand: 0, culled: 0, ms: 0, safe: 0, unsafe: 0 }
  const occScene = new THREE.Scene(); occScene.matrixWorldAutoUpdate = false
  const vs = `#include <common>
varying float vD;
void main() {
#include <begin_vertex>
#include <project_vertex>
  vD = -mvPosition.z;
}`
  const fs = 'varying float vD; void main() { gl_FragColor = vec4(1.0 / (1.0 + max(vD, 0.0)), 0.0, 0.0, 1.0); }'
  const depthMat = [THREE.FrontSide, THREE.BackSide, THREE.DoubleSide].map((side) => new THREE.ShaderMaterial({ side, vertexShader: vs, fragmentShader: fs }))
  const redMat = new THREE.ShaderMaterial({
    uniforms: { t: { value: null }, sz: { value: new THREE.Vector2() } }, depthTest: false, depthWrite: false,
    vertexShader: 'void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: `uniform highp sampler2D t; uniform vec2 sz;
      void main() {
        ivec2 c = ivec2(gl_FragCoord.xy) * ${RED}, hi = ivec2(sz) - 1; float m = 1.0;
        for (int y = -1; y <= ${RED}; y++) for (int x = -1; x <= ${RED}; x++) m = min(m, texelFetch(t, clamp(c + ivec2(x, y), ivec2(0), hi), 0).r);
        gl_FragColor = vec4(m, 0.0, 0.0, 1.0);
      }`,
  })
  const redScene = new THREE.Scene(), redCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
  { const q = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), redMat); q.frustumCulled = false; redScene.add(q) }
  let rt1 = null, rt2 = null, buf = null, D = null, D2 = null, w2 = 0, h2 = 0, w3 = 0, h3 = 0
  const size = new THREE.Vector2()
  function ensure() {
    renderer.getDrawingBufferSize(size)
    const w1 = Math.ceil(size.x / 2), h1 = Math.ceil(size.y / 2)
    if (rt1 && rt1.width === w1 && rt1.height === h1) return
    rt1?.dispose(); rt2?.dispose()
    rt1 = new THREE.WebGLRenderTarget(w1, h1, { type: THREE.FloatType, format: THREE.RedFormat, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: true })
    w2 = Math.ceil(w1 / RED); h2 = Math.ceil(h1 / RED)
    rt2 = new THREE.WebGLRenderTarget(w2, h2, { type: THREE.FloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: false })
    buf = new Float32Array(w2 * h2 * 4); D = new Float32Array(w2 * h2)
    w3 = Math.ceil(w2 / 8); h3 = Math.ceil(h2 / 8); D2 = new Float32Array(w3 * h3)
    redMat.uniforms.t.value = rt1.texture; redMat.uniforms.sz.value.set(w1, h1)
  }

  // ---------- 遮擋物（替身） ----------
  const proxies = new Map()           // 原物件 → 替身
  const matSafe = new WeakMap()       // 材質 → true/false（看過編譯好的程式才定）
  function materialOK(m) {
    if (!m || m.transparent || m.alphaTest > 0 || m.alphaMap || m.alphaHash || m.wireframe || !m.depthWrite || !m.depthTest || !m.colorWrite || !m.visible || m.displacementMap || m.clippingPlanes?.length || m.isShaderMaterial) return false
    return materialSafe(m)
  }
  function materialSafe(m) {
    if (m.displacementMap) return false
    let s = matSafe.get(m); if (s !== undefined) return s
    const P = renderer.properties.get(m), progs = P.programs ? [...P.programs.values()] : P.currentProgram ? [P.currentProgram] : []
    if (!progs.length) return false   // 還沒畫過：下次再看
    s = progs.every((p) => { try { return vertexSafe(gl.getShaderSource(p.vertexShader), m.type) } catch { return false } })
    matSafe.set(m, s); s ? st.safe++ : st.unsafe++
    return s
  }
  function occluderOK(o) {
    if (!o.isMesh || o.isSkinnedMesh || o.isBatchedMesh || o.geometry?.isInstancedBufferGeometry || !o.geometry?.attributes.position) return false
    if (o.morphTargetInfluences?.length || Object.keys(o.geometry.morphAttributes ?? {}).length) return false
    const ms = Array.isArray(o.material) ? o.material : [o.material]
    if (!ms.every(materialOK)) return false
    if (ms.some((m) => m.side !== ms[0].side)) return false
    if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere()
    const O = globalThis.__hzOpt ?? {}
    if (O.noInst && o.isInstancedMesh) return false
    if (O.maxTris && (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3 * (o.isInstancedMesh ? o.count : 1) > O.maxTris) return false
    return o.geometry.boundingSphere.radius * o.matrixWorld.getMaxScaleOnAxis() >= (O.minR ?? 1.5)
  }
  // ---------- 要判斷的物件 ----------
  let cands = [], scanT = -1e9
  function scan(scene) {
    const seen = new Set(); cands = []
    scene.traverse((o) => {
      if (!o.isMesh || o.isSkinnedMesh) return
      const ms = Array.isArray(o.material) ? o.material : [o.material]
      if (ms.some((m) => !m || m.depthTest === false)) return
      // 沒開視野剔除的（three.js 不信它的範圍）：材質沒改頂點位置、不是自訂實例幾何，才自己算範圍
      if (o.frustumCulled === false && (o.geometry?.isInstancedBufferGeometry || !ms.every((m) => !m.isShaderMaterial && materialSafe(m)))) return
      cands.push(o)
      if (occluderOK(o)) {
        seen.add(o)
        if (!proxies.has(o)) {
          const side = (Array.isArray(o.material) ? o.material[0] : o.material).side
          const p = o.isInstancedMesh ? new THREE.InstancedMesh(o.geometry, depthMat[side], 0) : new THREE.Mesh(o.geometry, depthMat[side])
          if (o.isInstancedMesh) { p.instanceMatrix = o.instanceMatrix; p.instanceColor = null }
          p.matrixAutoUpdate = false; p.frustumCulled = true
          occScene.add(p); proxies.set(o, p)
        }
      }
    })
    for (const [o, p] of proxies) if (!seen.has(o)) { occScene.remove(p); proxies.delete(o) }
    st.occluders = proxies.size; st.cand = cands.length
  }
  const shown = (o, cam) => { if (!o.layers.test(cam.layers)) return false; for (let p = o; p; p = p.parent) if (!p.visible) return false; return true }

  // 範圍：three.js 視野剔除用的那個球；沒開視野剔除的自己算（實例：株數或矩陣一變就重算）
  const own = new WeakMap()
  function sphereOf(o) {
    if (o.frustumCulled !== false) return o.isInstancedMesh ? (o.userData.fullSphere ?? o.boundingSphere) : o.geometry?.boundingSphere
    if (!o.isInstancedMesh) { const g = o.geometry; if (!g.boundingSphere) g.computeBoundingSphere(); return g.boundingSphere }
    let c = own.get(o)
    if (!c || c.v !== o.instanceMatrix.version || c.n !== o.count || c.g !== o.geometry) {
      const g = o.geometry; if (!g.boundingSphere) g.computeBoundingSphere()
      const sp = new THREE.Sphere(), one = new THREE.Sphere(), m = new THREE.Matrix4(); sp.makeEmpty()
      for (let i = 0; i < o.count; i++) { o.getMatrixAt(i, m); one.copy(g.boundingSphere).applyMatrix4(m); sp.union(one) }
      c = { v: o.instanceMatrix.version, n: o.count, g: o.geometry, s: o.count ? sp : null }; own.set(o, c)
    }
    return c.s
  }
  // ---------- 每一格 ----------
  let stamp = 0, skipCam = null; const last = new Map(); let dbg = false
  const frustum = new THREE.Frustum(), pv = new THREE.Matrix4(), sph = new THREE.Sphere(), cc = new THREE.Color()
  // 前半（畫面一開始就做）：畫遮擋物深度、縮小、排進「讀回」佇列（PBO）。真的拿資料在 finish()——中間 CPU 去忙影子、倒影，顯示卡同時把這張小圖做完
  let pbo = null, fence = null, pending = false, camKey = null
  const keyOf = (cam) => { const a = cam.matrixWorld.elements, b = cam.projectionMatrix.elements; return a.join(',') + '|' + b[0] + ',' + b[5] + ',' + b[8] + ',' + b[9] }
  function begin(scene, cam) {
    skipCam = null; pending = false
    if (!st.on || !st.ok) return
    const t0 = performance.now()
    if (t0 - scanT > 1000) { scanT = t0; scan(scene) }
    ensure()
    // 1. 替身跟著原物件（位置、顯示、幾何、株數）
    for (const [o, p] of proxies) {
      const vis = shown(o, cam) && (!o.isInstancedMesh || o.count > 0)
      p.visible = vis; if (!vis) continue
      p.matrixWorld.copy(o.matrixWorld); p.geometry = o.geometry
      if (o.isInstancedMesh) { p.instanceMatrix = o.instanceMatrix; p.count = o.count; p.boundingSphere = o.boundingSphere }
    }
    // 2. 畫深度、縮小、排進讀回
    const prevRT = renderer.getRenderTarget(), prevA = renderer.getClearAlpha(); renderer.getClearColor(cc)
    const sNeed = renderer.shadowMap.needsUpdate
    renderer.setClearColor(0x000000, 0)
    cam.updateMatrixWorld()
    renderer.setRenderTarget(rt1); renderer.render(occScene, cam); st.occCalls = renderer.info.render.calls; st.occTris = renderer.info.render.triangles
    renderer.setRenderTarget(rt2); renderer.render(redScene, redCam)
    if (!pbo || pbo.n !== buf.byteLength) { if (pbo) gl.deleteBuffer(pbo); pbo = gl.createBuffer(); pbo.n = buf.byteLength; gl.bindBuffer(gl.PIXEL_PACK_BUFFER, pbo); gl.bufferData(gl.PIXEL_PACK_BUFFER, buf.byteLength, gl.STREAM_READ) }
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, pbo); gl.readPixels(0, 0, w2, h2, gl.RGBA, gl.FLOAT, 0); gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null)
    if (fence) gl.deleteSync(fence)
    fence = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0); gl.flush()
    renderer.setRenderTarget(prevRT); renderer.setClearColor(cc, prevA); renderer.shadowMap.needsUpdate = sNeed
    pending = true; camKey = keyOf(cam); st.msA = +(performance.now() - t0).toFixed(2)
  }
  // 後半（主畫面之前）：拿回縮圖、判斷每個物件
  function prepare(scene, cam) {
    skipCam = null
    if (!pending) return
    pending = false
    if (keyOf(cam) !== camKey) return   // 中間鏡頭動了：這一格不剔除
    const t0 = performance.now()
    st.ready = gl.getSyncParameter(fence, gl.SYNC_STATUS) === gl.SIGNALED
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, pbo); gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, 0, buf); gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null)
    const tD = performance.now()
    // 遠近：存的是 1/(1+距離)，0＝沒有遮擋物（無限遠）
    D2.fill(0)
    for (let y = 0; y < h2; y++) for (let x = 0; x < w2; x++) {
      const e = buf[(y * w2 + x) * 4], d = e > 0 ? 1 / e - 1 : Infinity
      D[y * w2 + x] = d
      const k = (y >> 3) * w3 + (x >> 3); if (d > D2[k]) D2[k] = d
    }
    // 3. 每個物件
    stamp++; st.skipped = 0; st.drawn = 0; dbg = !!globalThis.__hzDbg; last.clear()
    const V = cam.matrixWorldInverse.elements, P = cam.projectionMatrix.elements, near = cam.near
    pv.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse); frustum.setFromProjectionMatrix(pv)
    const sx = size.x / (2 * RED), sy = size.y / (2 * RED)   // 0～1 → 縮圖格（半解析度一格＝2 像素，再 4 格併 1）
    let culled = 0
    const cm = cam.layers.mask
    for (let i = 0; i < cands.length; i++) {
      const o = cands[i]
      if (!o.visible || !(o.layers.mask & cm) || (o.isInstancedMesh && o.count === 0)) continue
      const bs = sphereOf(o)
      if (!bs) continue
      sph.copy(bs).applyMatrix4(o.matrixWorld); sph.radius += 0.3
      if (!frustum.intersectsSphere(sph)) continue
      const c = sph.center, r = sph.radius
      const vx = V[0] * c.x + V[4] * c.y + V[8] * c.z + V[12], vy = V[1] * c.x + V[5] * c.y + V[9] * c.z + V[13], vz = V[2] * c.x + V[6] * c.y + V[10] * c.z + V[14]
      const zn = -vz - r, zf = -vz + r
      if (zn <= near) continue
      const x1 = P[0] * (vx + r) / (vx + r > 0 ? zn : zf) - P[8], x0 = P[0] * (vx - r) / (vx - r < 0 ? zn : zf) - P[8]
      const y1 = P[5] * (vy + r) / (vy + r > 0 ? zn : zf) - P[9], y0 = P[5] * (vy - r) / (vy - r < 0 ? zn : zf) - P[9]
      let ax = Math.floor((x0 * 0.5 + 0.5) * sx), bx = Math.floor((x1 * 0.5 + 0.5) * sx), ay = Math.floor((y0 * 0.5 + 0.5) * sy), by = Math.floor((y1 * 0.5 + 0.5) * sy)
      if (ax < 0) ax = 0; if (ay < 0) ay = 0; if (bx > w2 - 1) bx = w2 - 1; if (by > h2 - 1) by = h2 - 1
      if (ax > bx || ay > by) continue
      const lim = zn - 0.2 - zn * 0.002
      let hid = true
      if ((bx - ax + 1) * (by - ay + 1) > 256) {   // 大的：用再縮 8 倍那張（取最遠，只會比較保守）
        for (let y = ay >> 3; y <= by >> 3 && hid; y++) for (let x = ax >> 3; x <= bx >> 3; x++) if (!(D2[y * w3 + x] < lim)) { hid = false; break }
      } else {
        for (let y = ay; y <= by && hid; y++) for (let x = ax; x <= bx; x++) if (!(D[y * w2 + x] < lim)) { hid = false; break }
      }
      if (hid) { o.__hz = stamp; culled++ } else if (dbg) last.set(o, { ax, bx, ay, by, zn: +zn.toFixed(1), lim: +lim.toFixed(1), maxD: (() => { let m = 0; for (let y = ay; y <= by; y++) for (let x = ax; x <= bx; x++) m = Math.max(m, D[y * w2 + x]); return m })() })
    }
    const tE = performance.now(); st.culled = culled; st.ms = +(tE - t0).toFixed(2); st.parts = [st.msA, tD - t0, tE - tD].map((v) => +(+v).toFixed(2))
    skipCam = cam
  }
  const end = () => { skipCam = null }
  const rbd = renderer.renderBufferDirect.bind(renderer)
  renderer.renderBufferDirect = function (camera, sc, geo, mat, obj, grp) {
    if (camera === skipCam && sc !== null) { if (obj.__hz === stamp) { st.skipped++; return } st.drawn++ }
    return rbd(camera, sc, geo, mat, obj, grp)
  }
  return { begin, prepare, end, stats: st, occScene, proxies, debug: () => ({ D, w2, h2, cands, stamp, last }) }
}
