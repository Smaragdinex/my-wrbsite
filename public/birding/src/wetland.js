// 2026-11-11 濕地 V3 第一步（使用者：照 ChatGPT 概念圖把濕地升級成世界級的漂亮；Blender 做高模）：
// 站在水裡的銀灰色枯樹（畫面焦點，倒影最漂亮）、一排斜斜走進水裡的舊木樁、角落一片睡蓮。
// 模型：tools/make-wetland-kit.py → models/props/wetland_kit.glb；木紋是 Poly Haven 風化木板掃描（drift_*.jpg），這裡褪成漂流木的銀灰色
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { EAST, alpineHeight, addCollider, alpineTrailDist, inLagoon, deckAt, deckFrame, walkAt, wetBoardAt } from './layout.js'
import { sunDirU, duskLight, mistLevel, dayLight } from './structures.js'
import { HIDES } from './east.js'
import { lampLit } from './walkway.js'

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
  const deckM = lampLit(drift(1.05, [1, 0.92, 0.82]))   // 觀景台的木頭：吃得到棧道矮燈的光
  return { geo, deckM, leafM: backlit(1.4, 0.25, 1.15), plumeM: backlit(4.5, 0.8, 1.25), headM: backlit(0.6, 0.1, 1), snagM: drift(1.65, [1, 0.98, 0.95]), postM: drift(1.05, [1, 0.92, 0.82]), lilyM: new THREE.MeshStandardMaterial({ vertexColors: true, color: new THREE.Color().setScalar(1.8), roughness: 0.42, side: THREE.DoubleSide }) }
}

export function buildWetlandProps(scene, kit, wk) {
  const g = new THREE.Group(); g.name = 'wetlandProps'
  const W = EAST.W, bed = (x, z) => Math.min(W, alpineHeight(x, z))
  const add = (name, mat, x, z, y, rot, s = 1, lean = [0, 0]) => {
    const m = new THREE.Mesh(kit.geo[name], mat)
    m.position.set(x, y, z); m.rotation.set(lean[0], rot, lean[1], 'YXZ'); m.scale.setScalar(s)
    m.castShadow = true; m.receiveShadow = true; g.add(m); return m
  }
  // 枯樹：一棵站在主水域中間（從觀察屋、環湖步道都看得到它和倒影），兩棵在水邊（模型從水面下 0.6 m 開始，插進泥底）
  // 2026-11-11 兩座濕地：沼澤兩棵（水道旁、兩片鶴草甸中間），潟湖兩棵（夕陽從後面落下，剪影＋倒影）
  for (const [name, x, z, rot, s] of [['snag_0', 51.5, -113, 2.4, 0.95], ['snag_2', 76, -115, 0.7, 1],   /* 2026-11-13 使用者：澤鵟換到右邊比較遠那棵 → 兩棵對調（澤鵟站的是 snag_2 的主幹斷口） */ ['snag_1', -21, -109.5, 4.1, 1.1], ['snag_2', -1, -121, 2.0, 0.85], ['snag_0', -40, -138, 1.1, 1.05], ['snag_1', 58, -149, 3.0, 1]]) {
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
  buildDecks(g, kit, wk)
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
  // 2026-11-12 使用者：木道上長草、要移開 → 所有蘆葦／香蒲／紙莎草一律離棧道、觀景灣邊緣 2 m 以上（葉子會往外倒 1 m 多；以前只擋 1.5 m，新蓋的環線上長了一排）
  const OFF = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [2, 0], [-2, 0], [0, 2], [0, -2], [1.4, 1.4], [-1.4, 1.4], [1.4, -1.4], [-1.4, -1.4]]
  const onWood = (x, z) => OFF.some(([a, b]) => walkAt(x + a, z + b) != null || deckAt(x + a, z + b) != null)
  const push = (n, x, y, z, s, yaw, lean) => (L[n] ||= []).push(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(lean[0], yaw, lean[1], 'YXZ')), new THREE.Vector3(s, s * (0.85 + rnd() * 0.3), s)))
  const M = EAST.marsh, inE = (o, x, z, k = 1) => Math.hypot((x - o.x) / o.rx, (z - o.z) / o.rz) < k
  // 紙莎草角落：一大叢一大叢（鯨頭鸛藏在裡面）
  { const P = M.papyrus; for (let i = 0; i < 28; i++) { const a = rnd() * 6.283, d = Math.sqrt(rnd()), x = P.x + Math.cos(a) * P.rx * d, z = P.z + Math.sin(a) * P.rz * d; if (alpineTrailDist(x, z) < 2.2 || onWood(x, z)) continue; const v = rnd() < 0.5 ? 0 : 1, s = 0.85 + rnd() * 0.35; push('pap_' + v, x, Math.min(alpineHeight(x, z), W) - 0.02, z, s, rnd() * 6.28, [(rnd() - 0.5) * 0.1, (rnd() - 0.5) * 0.1]); (L['pap_' + v + '_plume'] ||= []).push(L['pap_' + v].at(-1)) } }
  let nr = 0, nc = 0
  for (let k = 0; k < 140000 && (nr < 420 || nc < 210); k++) {
    const x = x0 + rnd() * (x1 - x0), z = z0 + rnd() * (z1 - z0), y = alpineHeight(x, z), dep = W - y
    if (dep > 0.25 || dep < -0.3 || alpineTrailDist(x, z) < 2.2 || fan(x, z) || onWood(x, z) || [[0, 0], [1.5, 0], [-1.5, 0], [0, 1.5], [0, -1.5]].some(([a, b]) => walkAt(x + a, z + b) != null || deckAt(x + a * 0.95, z + b * 0.95) != null || wetBoardAt(x + a * 0.6, z + b * 0.6) != null)) continue   // 2026-11-11 觀景台底下也不種（蘆葦從台面穿出來）
    const lag = inLagoon(x, z)
    if (!lag && (inE(M.lily, x, z, 1.1) || inE(M.papyrus, x, z, 1.15) || M.meadows.some((o) => inE(o, x, z, 1.1)))) continue
    if (lag && (z < -112 || rnd() < 0.7)) continue   // 潟湖：只有北岸、東北岸零星幾叢（夕陽從後面照的那一排）
    const p = patch(x, z) + 0.15
    if (p < 0.62 || rnd() > p) continue
    const base = Math.min(y, W) - 0.02, lean = [(rnd() - 0.5) * 0.08, (rnd() - 0.5) * 0.08]
    if (!lag && dep > 0.03 && dep < 0.22 && nc < 210 && rnd() < 0.4) { const v = rnd() < 0.5 ? 0 : 1, s = 0.85 + rnd() * 0.35; push('cat_' + v, x, base, z, s, rnd() * 6.28, lean); push('cat_' + v + '_head', x, base, z, s, 0, lean); L['cat_' + v + '_head'].pop(); L['cat_' + v + '_head'].push(L['cat_' + v].at(-1)); nc++ }
    else if (nr < 420) { const v = Math.floor(rnd() * 3), s = 0.85 + rnd() * 0.3; push('reed_' + v, x, base, z, s, rnd() * 6.28, lean); (L['reed_' + v + '_plume'] ||= []).push(L['reed_' + v].at(-1)); nr++ }
  }
  for (const [n, list] of Object.entries(L)) {
    if (!kit.geo[n] || !list.length) continue
    const mat = n.endsWith('_plume') ? kit.plumeM : n.endsWith('_head') ? kit.headM : kit.leafM
    const im = new THREE.InstancedMesh(kit.geo[n], mat, list.length)
    list.forEach((m, i) => im.setMatrixAt(i, m)); im.castShadow = !n.endsWith('_plume'); im.receiveShadow = true; im.computeBoundingSphere(); g.add(im)
  }
}
// 觀景台（EAST.decks）：木板台面、底下的托梁和木樁、前面跟兩側 1.05 m 的欄杆（後面接步道，開著）
// 2026-11-11 使用者：觀景台的木頭跟木棧道不一樣（灰的方木條 vs. 棧道的暖色木紋），要一樣 → 整座改用木棧道那套 Blender 零件和同一個木頭材質
// （wk＝walkway.js 的 kit：bw_plank_0～3 木板、bw_stringer 托梁、bw_pile 木樁、bw_post 欄杆柱、bw_rail_top／bw_rail_mid 橫桿）
function buildDecks(g, kit, wk) {
  const M = {}, m4 = new THREE.Matrix4(), mf = new THREE.Matrix4(), ml = new THREE.Matrix4(), q = new THREE.Quaternion(), E = new THREE.Euler()
  const V = (x, y, z) => new THREE.Vector3(x, y, z)
  // 零件放在觀景台自己的座標（lx 橫向、lz 朝景觀方向）：世界＝平移(F) × 轉 F.a × 平移(lx,y,lz) × 自轉 × 縮放
  const put = (part, F, lx, y, lz, sc = [1, 1, 1], rot = [0, 0, 0]) => { ml.compose(V(lx, y, lz), q.setFromEuler(E.set(rot[0], rot[1], rot[2], 'YXZ')), V(sc[0], sc[1], sc[2])); (M[part] ||= []).push(m4.copy(mf).multiply(ml).clone()) }
  for (const D of EAST.decks) {
    const F = { ...deckFrame(D), x: D.x, z: D.z }, Y = deckAt(D.x, D.z), r = mulberry(D.x * 13)
    mf.makeTranslation(F.x, 0, F.z).multiply(m4.makeRotationY(F.a))
    // 台面木板（橫的）：零件一片 3.1 m，台面寬的話接兩三片（接縫每排錯開）
    const np = Math.ceil(D.w / 3.3), pl = D.w / np
    let row = 0
    // join（接沼澤環線的灣）：前緣多鋪一排、低 4 mm（最後一排到棧道第一片木板之間原本有 5～15 cm 的縫，看得到水）
    for (let lz = -D.d / 2 + 0.08; lz < D.d / 2 + (D.join ? 0.16 : 0); lz += 0.165, row++) for (let k = 0; k < np; k++) put('bw_plank_' + Math.floor(r() * 4), F, -D.w / 2 + pl * (k + 0.5) + (r() - 0.5) * 0.02, lz > D.d / 2 ? Y - 0.004 : Y, lz, [pl / 3.1 * 0.995, 1, 1], [0, row % 2 ? Math.PI : 0, 0])
    for (const lx of [-D.w / 2 + 0.1, -D.w / 6, D.w / 6, D.w / 2 - 0.1]) put('bw_stringer', F, lx, Y, 0, [1, 1, D.d / 2.4])            // 托梁
    for (const lx of [-D.w / 2 + 0.1, 0, D.w / 2 - 0.1]) for (const lz of [-D.d / 2 + 0.1, 0, D.d / 2 - 0.1]) { const wx = D.x + lx * F.c + lz * F.s, wz = D.z - lx * F.s + lz * F.c, gy = Math.min(alpineHeight(wx, wz), EAST.W) - 0.4; put('bw_pile', F, lx, Y - 0.24, lz, [1.1, Math.max(0.3, Y - 0.24 - gy), 1.1]) }
    // 欄杆：前面＋左右兩側（柱子、上橫桿 1.04、中間兩道，跟棧道一樣）
    const posts = new Set()
    const rail = (x0, z0, x1, z1) => {
      const L = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.round(L / 1.4)), yaw = Math.atan2(x1 - x0, z1 - z0) - Math.PI / 2
      for (let i = 0; i <= n; i++) { const lx = x0 + (x1 - x0) * i / n, lz = z0 + (z1 - z0) * i / n, key = lx.toFixed(2) + ',' + lz.toFixed(2); if (!posts.has(key)) { posts.add(key); put('bw_post', F, lx, Y, lz, [1, 1, 1], [0, yaw, 0]) } }
      for (let i = 0; i < n; i++) { const t = (i + 0.5) / n; for (const [part, hh] of [['bw_rail_top', 1.04], ['bw_rail_mid', 0.64], ['bw_rail_mid', 0.27]]) put(part, F, x0 + (x1 - x0) * t, Y + hh, z0 + (z1 - z0) * t, [L / n, 1, 1], [0, yaw, 0]) }
    }
    const hw = D.w / 2 - 0.05, hd = D.d / 2 - 0.05, back = D.bay ? 0 : 0.6   // 觀景灣：兩側欄杆一路接回棧道
    if (D.join) { rail(-hw, hd, -1.55, hd); rail(1.55, hd, hw, hd) } else rail(-hw, hd, hw, hd)   // join：前緣中間 3.1 m 開著，接沼澤木道的平台
    rail(-hw, -hd + back, -hw, hd); rail(hw, -hd + back, hw, hd)
    if (D.bench) {   // 面向夕陽的長椅（1.8 m）：椅面三片木板、椅背兩片（往後仰一點）、兩隻腳
      for (const [k, lz] of [-0.655, -0.5, -0.345].entries()) put('bw_plank_' + k, F, 0, Y + 0.47, lz, [1.8 / 3.1, 1.2, 0.95])
      for (const [k, yy] of [0.66, 0.83].entries()) put('bw_plank_' + (k + 2), F, 0, Y + yy, -0.74 - k * 0.03, [1.8 / 3.1, 1.2, 0.95], [Math.PI / 2 - 0.17, 0, 0])
      for (const lx of [-0.72, 0.72]) { put('bw_pile', F, lx, Y + 0.425, -0.5, [0.6, 0.43, 2.6]); put('bw_pile', F, lx, Y + 0.92, -0.8, [0.5, 0.5, 0.45], [-0.17, 0, 0]) }
      addCollider(D.x - 0.5 * F.s, D.z - 0.5 * F.c, 0.45, Y + 0.6, Y - 0.2)
    }
    // 欄杆擋人：前緣、兩側一排碰撞圓
    for (const [x0, z0, x1, z1] of [[-hw, hd, hw, hd], [-hw, -hd + back, -hw, hd], [hw, -hd + back, hw, hd]]) for (let t = 0; t <= 1.001; t += 0.12) { const lx = x0 + (x1 - x0) * t, lz = z0 + (z1 - z0) * t; if (D.join && lz > hd - 0.01 && Math.abs(lx) < 1.45) continue; addCollider(D.x + lx * F.c + lz * F.s, D.z - lx * F.s + lz * F.c, 0.12, Y + 1.1, Y - 0.5) }
  }
  for (const [part, list] of Object.entries(M)) {
    if (!wk?.geo?.[part] || !list.length) continue
    const im = new THREE.InstancedMesh(wk.geo[part], wk.wood, list.length)
    list.forEach((m, k) => im.setMatrixAt(k, m)); im.castShadow = true; im.receiveShadow = true; im.computeBoundingSphere(); im.name = 'deck_' + part; g.add(im)
  }
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
  for (const [px, pz, w] of [[52, -110, 11], [63, -118, 9], [72, -103, 9], [72, -127, 9], [-18, -112, 12], [-4, -126, 10], [8, -108, 9], [-26, -124, 8], [-40, -140, 12], [-10, -150, 10], [66, -148, 10], [50, -140, 8]]) {   // 2026-11-11 兩座濕地都有（鶴草甸的晨霧、潟湖的夕陽薄霧）
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
