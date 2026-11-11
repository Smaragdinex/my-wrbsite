// 2026-11-11 濕地 V3 第一步（使用者：照 ChatGPT 概念圖把濕地升級成世界級的漂亮；Blender 做高模）：
// 站在水裡的銀灰色枯樹（畫面焦點，倒影最漂亮）、一排斜斜走進水裡的舊木樁、角落一片睡蓮。
// 模型：tools/make-wetland-kit.py → models/props/wetland_kit.glb；木紋是 Poly Haven 風化木板掃描（drift_*.jpg），這裡褪成漂流木的銀灰色
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { EAST, alpineHeight, addCollider, alpineTrailDist, inLagoon, deckAt, deckFrame, walkAt } from './layout.js'
import { sunDirU, duskLight, mistLevel, dayLight } from './structures.js'
import { HIDES } from './east.js'

const VER = new URL(import.meta.url).searchParams.get('v') ?? ''

export async function loadWetlandKit() {
  const gl = await new GLTFLoader().loadAsync(`models/props/wetland_kit.glb?v=${VER}`)
  const geo = {}
  gl.scene.updateMatrixWorld(true)
  gl.scene.traverse((o) => { if (o.isMesh) { const g = o.geometry.clone(); g.applyMatrix4(o.matrixWorld); if (g.attributes.color_1) { g.setAttribute('color', g.attributes.color_1); g.deleteAttribute('color_1') } geo[o.name] = g } })   // Blender 匯出時多一組全白的 COLOR_0，真的顏色在 COLOR_1
  const TL = new THREE.TextureLoader()
  const tex = (n, srgb) => { const t = TL.load(`models/props/drift_${n}.jpg?v=${VER}`); t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.flipY = false; t.anisotropy = 8; return t }
  const map = tex('col', true), normalMap = tex('nor', false), roughnessMap = tex('rough', false)
  // 漂流木：樹皮掉光、日曬雨淋褪成銀灰（木紋還在）；木樁泡水比較深
  const drift = (k, tint) => {
    const m = new THREE.MeshStandardMaterial({ map, normalMap, normalScale: new THREE.Vector2(1.2, -1.2), roughnessMap, roughness: 1 })
    m.onBeforeCompile = (sh) => {
      sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
        float lum = dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11));
        diffuseColor.rgb = mix(vec3(lum), diffuseColor.rgb, 0.22) * ${k.toFixed(2)} * vec3(${tint.map((v) => v.toFixed(3)).join(', ')});`)
    }
    m.customProgramCacheKey = () => 'drift' + k + tint.join()
    return m
  }
  // 2026-11-11 濕地夕陽（ChatGPT 黃金時刻規格）：Blender 蘆葦叢／香蒲叢（tools/make-reed-kit.py）；穗逆光時透出金橘色（邊光 (1,.61,.23)）
  const rk = await new GLTFLoader().loadAsync(`models/props/reed_kit.glb?v=${VER}`)
  rk.scene.updateMatrixWorld(true)
  rk.scene.traverse((o) => { if (o.isMesh) { const g = o.geometry.clone(); g.applyMatrix4(o.matrixWorld); if (g.attributes.color_1) { g.setAttribute('color', g.attributes.color_1); g.deleteAttribute('color_1') } geo[o.name] = g } })
  const backlit = (k1, k2, tint) => {
    const m = new THREE.MeshStandardMaterial({ vertexColors: true, color: new THREE.Color().setScalar(tint), roughness: 0.8, side: THREE.DoubleSide })
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uSun = sunDirU; sh.uniforms.uDusk = duskLight
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWp;').replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
        vec4 wq = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          wq = instanceMatrix * wq;
        #endif
        vWp = (modelMatrix * wq).xyz;`)
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform vec3 uSun; uniform float uDusk; varying vec3 vWp;').replace('#include <opaque_fragment>', `
        { vec3 vd = normalize(cameraPosition - vWp); float b = max(dot(-vd, uSun), 0.0);
          outgoingLight += diffuseColor.rgb * vec3(1.0, 0.61, 0.23) * (pow(b, 4.0) * ${k1.toFixed(2)} + pow(b, 1.5) * ${k2.toFixed(2)}) * (0.3 + uDusk) * smoothstep(-0.03, 0.04, uSun.y); }
        #include <opaque_fragment>`)
    }
    m.customProgramCacheKey = () => 'backlit' + k1 + k2
    return m
  }
  return { geo, leafM: backlit(1.4, 0.25, 1.15), plumeM: backlit(4.5, 0.8, 1.25), headM: backlit(0.6, 0.1, 1), snagM: drift(1.65, [1, 0.98, 0.95]), postM: drift(1.05, [1, 0.92, 0.82]), lilyM: new THREE.MeshStandardMaterial({ vertexColors: true, color: new THREE.Color().setScalar(1.8), roughness: 0.42, side: THREE.DoubleSide }) }
}

export function buildWetlandProps(scene, kit) {
  const g = new THREE.Group(); g.name = 'wetlandProps'
  const W = EAST.W, bed = (x, z) => Math.min(W, alpineHeight(x, z))
  const add = (name, mat, x, z, y, rot, s = 1, lean = [0, 0]) => {
    const m = new THREE.Mesh(kit.geo[name], mat)
    m.position.set(x, y, z); m.rotation.set(lean[0], rot, lean[1], 'YXZ'); m.scale.setScalar(s)
    m.castShadow = true; m.receiveShadow = true; g.add(m); return m
  }
  // 枯樹：一棵站在主水域中間（從觀察屋、環湖步道都看得到它和倒影），兩棵在水邊（模型從水面下 0.6 m 開始，插進泥底）
  // 2026-11-11 兩座濕地：沼澤兩棵（水道旁、兩片鶴草甸中間），潟湖兩棵（夕陽從後面落下，剪影＋倒影）
  for (const [name, x, z, rot, s] of [['snag_2', 51.5, -113, 0.7, 1], ['snag_0', 76, -115, 2.4, 0.95], ['snag_1', -21, -109.5, 4.1, 1.1], ['snag_2', -1, -121, 2.0, 0.85]]) {
    add(name, kit.snagM, x, z, bed(x, z) + 0.5, rot, s, [0.03, -0.04])
    addCollider(x, z, 0.4, bed(x, z) + 6)
  }
  // 舊木樁：一排從岸邊斜斜走進水裡（以前圍魚塭或棧道留下來的），高低不一、有的歪了
  for (let i = 0; i < 7; i++) {
    const t = i / 6, x = 6 - t * 13 + Math.sin(i * 2.1) * 0.35, z = -99 - t * 9 + Math.cos(i * 1.7) * 0.3   // 2026-11-11 搬到潟湖：從東北泥灘斜斜走進水裡（夕陽觀景台看過去在逆光裡）
    add('post_' + (i % 4), kit.postM, x, z, bed(x, z) + 0.7, i * 1.3, 0.9 + 0.25 * Math.abs(Math.sin(i * 3.1)), [Math.sin(i * 1.9) * 0.08, Math.cos(i * 2.3) * 0.07])
  }
  // 睡蓮：主水域東北角、水道旁比較靜的水面（貼在水面上 4 mm）
  // 荷葉盆地（觀察屋 O8 正前方，水雉、紫水雞走在上面）：一整片睡蓮
  { const LB = EAST.marsh.lily, r = mulberry(909)
    for (let i = 0; i < 26; i++) { const a = r() * 6.283, d = Math.sqrt(r()) * 0.92, x = LB.x + Math.cos(a) * LB.rx * d, z = LB.z + Math.sin(a) * LB.rz * d; if (alpineHeight(x, z) > W - 0.08) continue; add(i % 3 ? 'lily_1' : 'lily_0', kit.lilyM, x, z, W + 0.004, r() * 6.283, 0.9 + r() * 0.5) } }
  buildDecks(g, kit)
  buildReeds(g, kit)
  buildMist(g)
  scene.add(g)
  return g
}

// 蘆葦叢、香蒲叢：水邊淺水（水深 0.25 到岸上 0.3 m）一塊塊群落；步道 2.2 m、觀察屋看出去的扇形讓開；西岸（夕陽那側，從東岸看過去逆光）多
function buildReeds(g, kit) {
  const W = EAST.W, [x0, x1, z0, z1] = EAST.wetBox, rnd = mulberry(4242), L = {}
  const H8 = HIDES.find((h) => h.name === 'O8')
  const fan = (x, z) => { if (!H8) return false; const dx = x - H8.x, dz = z - H8.z, d = Math.hypot(dx, dz); if (d > 20) return false; const lx = H8.look[0] - H8.x, lz = H8.look[1] - H8.z; return (dx * lx + dz * lz) / (d * Math.hypot(lx, lz)) > Math.cos(0.75) }
  const ss = (a, b, v) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t) }
  const patch = (x, z) => 0.5 + 0.35 * Math.sin(x * 0.21 + Math.sin(z * 0.13) * 2) * Math.cos(z * 0.17 + 1.3) + 0.15 * Math.sin(x * 0.7 + z * 0.5)
  const push = (n, x, y, z, s, yaw, lean) => (L[n] ||= []).push(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(lean[0], yaw, lean[1], 'YXZ')), new THREE.Vector3(s, s * (0.85 + rnd() * 0.3), s)))
  const M = EAST.marsh, inE = (o, x, z, k = 1) => Math.hypot((x - o.x) / o.rx, (z - o.z) / o.rz) < k
  // 紙莎草角落：一大叢一大叢（鯨頭鸛藏在裡面）
  { const P = M.papyrus; for (let i = 0; i < 28; i++) { const a = rnd() * 6.283, d = Math.sqrt(rnd()), x = P.x + Math.cos(a) * P.rx * d, z = P.z + Math.sin(a) * P.rz * d; if (alpineTrailDist(x, z) < 2.2) continue; const v = rnd() < 0.5 ? 0 : 1, s = 0.85 + rnd() * 0.35; push('pap_' + v, x, Math.min(alpineHeight(x, z), W) - 0.02, z, s, rnd() * 6.28, [(rnd() - 0.5) * 0.1, (rnd() - 0.5) * 0.1]); (L['pap_' + v + '_plume'] ||= []).push(L['pap_' + v].at(-1)) } }
  let nr = 0, nc = 0
  for (let k = 0; k < 90000 && (nr < 300 || nc < 150); k++) {
    const x = x0 + rnd() * (x1 - x0), z = z0 + rnd() * (z1 - z0), y = alpineHeight(x, z), dep = W - y
    if (dep > 0.25 || dep < -0.3 || alpineTrailDist(x, z) < 2.2 || fan(x, z) || [[0, 0], [1.5, 0], [-1.5, 0], [0, 1.5], [0, -1.5]].some(([a, b]) => walkAt(x + a, z + b) != null)) continue
    const lag = inLagoon(x, z)
    if (!lag && (inE(M.lily, x, z, 1.1) || inE(M.papyrus, x, z, 1.15) || M.meadows.some((o) => inE(o, x, z, 1.1)))) continue
    if (lag && (z < -112 || rnd() < 0.7)) continue   // 潟湖：只有北岸、東北岸零星幾叢（夕陽從後面照的那一排）
    const p = patch(x, z) + 0.15
    if (p < 0.62 || rnd() > p) continue
    const base = Math.min(y, W) - 0.02, lean = [(rnd() - 0.5) * 0.08, (rnd() - 0.5) * 0.08]
    if (!lag && dep > 0.03 && dep < 0.22 && nc < 150 && rnd() < 0.4) { const v = rnd() < 0.5 ? 0 : 1, s = 0.85 + rnd() * 0.35; push('cat_' + v, x, base, z, s, rnd() * 6.28, lean); push('cat_' + v + '_head', x, base, z, s, 0, lean); L['cat_' + v + '_head'].pop(); L['cat_' + v + '_head'].push(L['cat_' + v].at(-1)); nc++ }
    else if (nr < 300) { const v = Math.floor(rnd() * 3), s = 0.85 + rnd() * 0.3; push('reed_' + v, x, base, z, s, rnd() * 6.28, lean); (L['reed_' + v + '_plume'] ||= []).push(L['reed_' + v].at(-1)); nr++ }
  }
  for (const [n, list] of Object.entries(L)) {
    if (!kit.geo[n] || !list.length) continue
    const mat = n.endsWith('_plume') ? kit.plumeM : n.endsWith('_head') ? kit.headM : kit.leafM
    const im = new THREE.InstancedMesh(kit.geo[n], mat, list.length)
    list.forEach((m, i) => im.setMatrixAt(i, m)); im.castShadow = !n.endsWith('_plume'); im.receiveShadow = true; im.computeBoundingSphere(); g.add(im)
  }
}
// 觀景台（EAST.decks）：木板台面、底下的托梁和木樁、前面跟兩側 1.05 m 的欄杆（後面接步道，開著）
function buildDecks(g, kit) {
  const geos = []
  const box = (w, h, d, lx, y, lz, F) => { const b = new THREE.BoxGeometry(w, h, d); b.translate(lx, y, lz); b.applyMatrix4(new THREE.Matrix4().makeRotationY(F.a)); b.translate(F.x, 0, F.z); geos.push(b.toNonIndexed()) }
  for (const D of EAST.decks) {
    const F = { ...deckFrame(D), x: D.x, z: D.z }, Y = deckAt(D.x, D.z), r = mulberry(D.x * 13)
    for (let lz = -D.d / 2 + 0.08; lz < D.d / 2; lz += 0.165) box(D.w, 0.045, 0.15, (r() - 0.5) * 0.03, Y - 0.023, lz, F)   // 台面木板（橫的）
    for (const lx of [-D.w / 2 + 0.1, -D.w / 6, D.w / 6, D.w / 2 - 0.1]) box(0.08, 0.2, D.d, lx, Y - 0.15, 0, F)            // 托梁
    for (const lx of [-D.w / 2 + 0.1, 0, D.w / 2 - 0.1]) for (const lz of [-D.d / 2 + 0.1, 0, D.d / 2 - 0.1]) { const wx = D.x + lx * F.c + lz * F.s, wz = D.z - lx * F.s + lz * F.c, gy = Math.min(alpineHeight(wx, wz), EAST.W) - 0.4; box(0.16, Y - gy, 0.16, lx, (Y + gy) / 2 - 0.2, lz, F) }
    // 欄杆：前面＋左右兩側
    const rail = (x0, z0, x1, z1) => { const L = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.round(L / 1.4)); for (let i = 0; i <= n; i++) box(0.09, 1.05, 0.09, x0 + (x1 - x0) * i / n, Y + 0.52, z0 + (z1 - z0) * i / n, F); const ang = Math.atan2(x1 - x0, z1 - z0); for (const [hh, th] of [[1.05, 0.07], [0.55, 0.05]]) { const b = new THREE.BoxGeometry(0.06, th, L); b.rotateY(ang); b.translate((x0 + x1) / 2, Y + hh, (z0 + z1) / 2); b.applyMatrix4(new THREE.Matrix4().makeRotationY(F.a)); b.translate(F.x, 0, F.z); geos.push(b.toNonIndexed()) } }
    const hw = D.w / 2 - 0.05, hd = D.d / 2 - 0.05
    rail(-hw, hd, hw, hd); rail(-hw, -hd + 0.6, -hw, hd); rail(hw, -hd + 0.6, hw, hd)
    // 欄杆擋人：前緣、兩側一排碰撞圓
    for (const [x0, z0, x1, z1] of [[-hw, hd, hw, hd], [-hw, -hd + 0.6, -hw, hd], [hw, -hd + 0.6, hw, hd]]) for (let t = 0; t <= 1.001; t += 0.12) { const lx = x0 + (x1 - x0) * t, lz = z0 + (z1 - z0) * t; addCollider(D.x + lx * F.c + lz * F.s, D.z - lx * F.s + lz * F.c, 0.12, Y + 1.1, Y - 0.5) }
  }
  if (!geos.length) return
  const m = new THREE.Mesh(mergeGeometries(geos), kit.postM); m.castShadow = true; m.receiveShadow = true; g.add(m)
}
function mulberry(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296 } }

// 水面薄霧（ChatGPT：離水面 0.1～0.75 m、一片 4～12 m、最濃 0.05～0.14、5～9 片、不要整片）：
// 面向鏡頭的柔邊霧片，黃昏、清晨、夜裡濃；朝太陽那邊染暖色 (.75,.47,.35)、背光那邊灰藍 (.40,.43,.48)
function buildMist(g) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 64
  const x = c.getContext('2d'), img = x.createImageData(256, 64), r = mulberry(77)
  const nz = Array.from({ length: 9 }, () => [r() * 6.28, 1 + r() * 4, r()])
  for (let j = 0; j < 64; j++) for (let i = 0; i < 256; i++) {
    const u = i / 255, v = j / 63, edge = Math.sin(Math.PI * u) ** 1.5 * Math.exp(-(((v - 0.55) / 0.26) ** 2))
    let n = 0; for (const [ph, f, w] of nz) n += Math.sin(u * f * 6.28 + ph + Math.sin(v * 5 + ph) * 1.5) * (0.5 + w)
    const a = Math.max(0, edge * (0.6 + 0.08 * n)), k = (j * 256 + i) * 4
    img.data[k] = img.data[k + 1] = img.data[k + 2] = 255; img.data[k + 3] = Math.min(255, a * 255)
  }
  x.putImageData(img, 0, 0)
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace
  const W = EAST.W, warm = new THREE.Color().setRGB(0.75, 0.47, 0.35), cool = new THREE.Color().setRGB(0.4, 0.43, 0.48), tmp = new THREE.Vector3()
  for (const [px, pz, w] of [[52, -110, 11], [63, -118, 9], [72, -103, 9], [72, -127, 9], [-18, -112, 12], [-4, -126, 10], [8, -108, 9], [-26, -124, 8]]) {   // 2026-11-11 兩座濕地都有（鶴草甸的晨霧、潟湖的夕陽薄霧）
    const m = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0, color: cool.clone() })
    const sp = new THREE.Sprite(m); sp.scale.set(w, w * 0.2, 1); sp.position.set(px, W + 0.55, pz); sp.renderOrder = 4
    sp.onBeforeRender = (renderer, scene, camera) => {
      const lvl = Math.max(duskLight.value * 0.9, mistLevel.value)
      m.opacity = 0.07 + 0.2 * lvl
      tmp.copy(sp.position).sub(camera.position).normalize()
      const toSun = Math.max(0, tmp.dot(sunDirU.value)) * duskLight.value
      m.color.copy(cool).lerp(warm, toSun).multiplyScalar(0.15 + 0.85 * dayLight.value)
    }
    g.add(sp)
  }
}
