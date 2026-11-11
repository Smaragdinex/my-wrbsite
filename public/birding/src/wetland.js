// 2026-11-11 濕地 V3 第一步（使用者：照 ChatGPT 概念圖把濕地升級成世界級的漂亮；Blender 做高模）：
// 站在水裡的銀灰色枯樹（畫面焦點，倒影最漂亮）、一排斜斜走進水裡的舊木樁、角落一片睡蓮。
// 模型：tools/make-wetland-kit.py → models/props/wetland_kit.glb；木紋是 Poly Haven 風化木板掃描（drift_*.jpg），這裡褪成漂流木的銀灰色
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { EAST, alpineHeight, addCollider } from './layout.js'

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
  return { geo, snagM: drift(1.65, [1, 0.98, 0.95]), postM: drift(1.05, [1, 0.92, 0.82]), lilyM: new THREE.MeshStandardMaterial({ vertexColors: true, color: new THREE.Color().setScalar(1.8), roughness: 0.42, side: THREE.DoubleSide }) }
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
  for (const [name, x, z, rot, s] of [['snag_2', 57.5, -110.5, 0.7, 1], ['snag_0', 69.5, -121, 2.4, 0.95], ['snag_1', 46.5, -107.5, 4.1, 1.05]]) {
    add(name, kit.snagM, x, z, bed(x, z) + 0.5, rot, s, [0.03, -0.04])
    addCollider(x, z, 0.4, bed(x, z) + 6)
  }
  // 舊木樁：一排從岸邊斜斜走進水裡（以前圍魚塭或棧道留下來的），高低不一、有的歪了
  for (let i = 0; i < 7; i++) {
    const t = i / 6, x = 49 + t * 11.5 + Math.sin(i * 2.1) * 0.35, z = -125.5 + t * 7.5 + Math.cos(i * 1.7) * 0.3
    add('post_' + (i % 4), kit.postM, x, z, bed(x, z) + 0.7, i * 1.3, 0.9 + 0.25 * Math.abs(Math.sin(i * 3.1)), [Math.sin(i * 1.9) * 0.08, Math.cos(i * 2.3) * 0.07])
  }
  // 睡蓮：主水域東北角、水道旁比較靜的水面（貼在水面上 4 mm）
  for (const [name, x, z, rot] of [['lily_0', 66.5, -104.5, 0.4], ['lily_1', 70.2, -108.8, 2.2], ['lily_1', 64, -101.5, 4.4]]) add(name, kit.lilyM, x, z, W + 0.004, rot)
  scene.add(g)
  return g
}
