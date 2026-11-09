// 巨木林帶（2026-11-09 使用者：山區要像阿里山、紅杉國家公園那樣，走進山裡要有那種感覺）
// 步道中段（吊橋前後）兩側種一片紅檜／紅杉巨木：高 34～46 公尺、樹幹直徑 1.8～3.6 公尺，根部往外撐開成板根，
// 紅褐色帶縱向深裂紋的樹皮；樹冠只在上半段（下半段是光溜溜的巨大樹幹），一棵棵連起來把天空遮住。
// 樹冠縫隙有一束束斜射的陽光（跟著太陽方向和時間變，晚上沒有）。
// 全部用 InstancedMesh：一份樹幹、一份樹冠、一份光束，記憶體只多一點（學校電腦）。
import * as THREE from 'three'
import { ALP_TRAIL, ALP_BRIDGE, ALP_POND, ALP_SPURS, CABIN, CAMP, inAlpine, alpineHeight, alpineTrailDist, alpineStreamDist, domeY, domeRho, addCollider } from './layout.js'
import { mulberry32 } from './noise.js'
import { coniferGeo, needleMaterial } from './alpine.js'
import { lodRegister } from './lod.js'

const TAU = Math.PI * 2
// 巨木林的範圍：步道第 3～9 點附近（入口上坡之後、過吊橋、到南坡）
const SEG = [3, 9]
const bandDist = (x, z) => {
  let best = 1e9
  for (let i = SEG[0]; i < SEG[1]; i++) {
    const [ax, az] = ALP_TRAIL[i], [bx, bz] = ALP_TRAIL[i + 1], dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2))
    best = Math.min(best, Math.hypot(x - ax - dx * t, z - az - dz * t))
  }
  return best
}
const bridgeDist = (x, z) => {
  const a = ALP_TRAIL[ALP_BRIDGE.a], b = ALP_TRAIL[ALP_BRIDGE.a + 2], dx = b[0] - a[0], dz = b[1] - a[1]
  const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz)))
  return Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t)
}

// 巨木的位置：純地形計算（alpine.js 種其他樹時也要避開，所以先算好、記起來）
let SPOTS = null
export function giantSpots(avoid = []) {
  if (SPOTS) return SPOTS
  const rnd = mulberry32(4242), list = []
  for (let k = 0; k < 24000 && list.length < 170; k++) {
    const i = SEG[0] + Math.floor(rnd() * (SEG[1] - SEG[0])), t = rnd()
    const [ax, az] = ALP_TRAIL[i], [bx, bz] = ALP_TRAIL[i + 1], L = Math.hypot(bx - ax, bz - az)
    const side = rnd() < 0.5 ? -1 : 1, off = 4 + Math.pow(rnd(), 1.1) * 28
    const x = ax + (bx - ax) * t - (bz - az) / L * side * off, z = az + (bz - az) * t + (bx - ax) / L * side * off
    if (!inAlpine(x, z, 4) || domeRho(x, z) > 0.9) continue
    const D = 1.8 + Math.pow(rnd(), 1.6) * 1.8   // 樹幹直徑（多半 2 公尺上下，偶爾一棵特別粗）
    if (alpineTrailDist(x, z) < 3.2 + D * 0.9 || bridgeDist(x, z) < 6 + D || alpineStreamDist(x, z) < 3 + D * 0.6) continue
    if (Math.hypot(x - CABIN.x, z - CABIN.z) < CABIN.R + 6 || Math.hypot(x - CAMP.x, z - CAMP.z) < CAMP.R + 6 || Math.hypot(x - ALP_POND.x, z - ALP_POND.z) < ALP_POND.r + 4) continue
    if (avoid.some((b) => Math.hypot(x - b.x, z - b.z) < 4 + D)) continue
    if (list.some((g) => Math.hypot(g.x - x, g.z - z) < 3.6 + (g.D + D) * 0.6)) continue
    const y = alpineHeight(x, z)
    // 坡太陡不種（樹會一邊懸空）
    let sl = 0; for (const [dx, dz] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) sl = Math.max(sl, Math.abs(alpineHeight(x + dx * D, z + dz * D) - y))
    if (sl > D * 0.9) continue
    const H = Math.min(34 + rnd() * 12, domeY(x, z) - y - 2)
    if (H < 26) continue
    list.push({ x, z, y, D, H, rot: rnd() * TAU, lean: (rnd() - 0.5) * 0.03 })
  }
  SPOTS = list
  return list
}
// 0～1：這一點在巨木林帶裡面的程度（地面顏色、林下調暗用）
export const forestK = (x, z) => 1 - THREE.MathUtils.smoothstep(bandDist(x, z), 20, 32)
export const nearGiant = (x, z, pad = 0) => (SPOTS ?? []).some((g) => Math.hypot(g.x - x, g.z - z) < g.D * 0.5 + pad)

// 樹皮：紅褐色，縱向深裂紋（紅檜／紅杉），偶爾一條青苔
function barkTex() {
  const W = 256, H = 512, c = document.createElement('canvas'); c.width = W; c.height = H
  const x = c.getContext('2d'), r = mulberry32(77)
  x.fillStyle = '#7a4a32'; x.fillRect(0, 0, W, H)
  for (let i = 0; i < 140; i++) {   // 一條條長長的樹皮縱紋，亮暗交錯
    const x0 = r() * W, w = 2 + r() * 9, l = 0.55 + r() * 0.3
    x.fillStyle = `rgba(${150 + r() * 60},${85 + r() * 40},${55 + r() * 25},${0.25 + r() * 0.3})`
    x.beginPath(); x.moveTo(x0, 0)
    for (let y = 0; y <= H; y += 16) x.lineTo(x0 + Math.sin(y * 0.02 + i) * 3 + (r() - 0.5) * 2, y)
    for (let y = H; y >= 0; y -= 16) x.lineTo(x0 + w * l + Math.sin(y * 0.02 + i) * 3, y)
    x.fill()
  }
  for (let i = 0; i < 70; i++) {   // 深裂縫（暗）
    const x0 = r() * W; x.strokeStyle = `rgba(30,14,8,${0.45 + r() * 0.35})`; x.lineWidth = 1 + r() * 2.5
    x.beginPath(); x.moveTo(x0, r() * H * 0.3)
    let xx = x0; for (let y = 0; y <= H; y += 12) { xx += (r() - 0.5) * 2.2; x.lineTo(xx, y) } x.stroke()
  }
  x.fillStyle = 'rgba(70,95,45,0.22)'   // 背陰那一側一點青苔
  for (let i = 0; i < 30; i++) { x.beginPath(); x.ellipse(r() * W * 0.3, r() * H, 6 + r() * 14, 20 + r() * 40, 0, 0, TAU); x.fill() }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4
  return t
}

// 樹幹：高 1、底部半徑 1；往上收細，底部往外撐開成 5～6 片板根
function trunkGeo() {
  const RS = 24, HS = 40
  const g = new THREE.CylinderGeometry(1, 1, 1, RS, HS, true).translate(0, 0.5, 0)
  const p = g.attributes.position, uv = g.attributes.uv
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), a = Math.atan2(z, x)
    const taper = 0.5 * (1 - y) + 0.12 * (1 - y) * (1 - y) + 0.06   // 上面細
    const flare = Math.exp(-y * 28) * (0.9 + 0.55 * Math.max(0, Math.sin(a * 5 + 0.7)) ** 2)   // 板根
    const lumpy = 1 + 0.035 * Math.sin(a * 11 + y * 30) + 0.02 * Math.sin(a * 23 - y * 70)
    const r = (taper * 1.6 + flare) * lumpy
    p.setXYZ(i, x * r, y, z * r)
    uv.setXY(i, uv.getX(i) * 3, y * 9)
  }
  g.computeVertexNormals()
  return g
}

export function buildGiants(scene, { sun, avoid = [] } = {}) {
  const spots = giantSpots(avoid)
  const g = new THREE.Group(); g.name = 'giantForest'
  if (!spots.length) return { group: g, tick() {}, inside: () => 0 }
  const rnd = mulberry32(99)
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), s = new THREE.Vector3()
  // 樹幹
  const barkM = new THREE.MeshStandardMaterial({ map: barkTex(), roughness: 0.95, color: 0xe6d6cc })
  const trunk = new THREE.InstancedMesh(trunkGeo(), barkM, spots.length)
  // 樹冠：冷杉的卡片樹冠拉高變窄，從樹高 55% 開始（下面是光禿的樹幹）；再加一層比較寬的鐵杉樹冠在中段，冠幅才夠大、連得起來
  const crownA = new THREE.InstancedMesh(coniferGeo('fir'), needleMaterial(), spots.length)
  const crownB = new THREE.InstancedMesh(coniferGeo('hemlock'), crownA.material, spots.length)
  const col = new THREE.Color()
  spots.forEach((t, i) => {
    const R = t.D / 2
    q.setFromEuler(e.set(t.lean, t.rot, t.lean * 0.6))
    m4.compose(v.set(t.x, t.y - 0.6, t.z), q, s.set(R, t.H * 0.97, R)); trunk.setMatrixAt(i, m4)
    const c0 = t.H * 0.52, cH = t.H * 0.52
    m4.compose(v.set(t.x, t.y + c0, t.z), q, s.set(cH * 1.5, cH, cH * 1.5)); crownA.setMatrixAt(i, m4)   // 加寬：樹冠要在步道上方連成一片
    m4.compose(v.set(t.x, t.y + t.H * 0.6, t.z), q.setFromEuler(e.set(0, t.rot + 1.3, 0)), s.set(cH * 1.25, cH * 0.55, cH * 1.25)); crownB.setMatrixAt(i, m4)
    trunk.setColorAt(i, col.setHSL(0.05 + (rnd() - 0.5) * 0.02, 0.15, 0.85 + rnd() * 0.2))
    const cc = col.setHSL(0.3 + (rnd() - 0.5) * 0.05, 0.22, 0.62 + rnd() * 0.15)   // 比一般冷杉暗一點的深綠
    crownA.setColorAt(i, cc); crownB.setColorAt(i, cc)
    addCollider(t.x, t.z, R * 1.05, t.y + t.H)
  })
  for (const m of [trunk, crownA, crownB]) { m.castShadow = true; m.receiveShadow = true; m.computeBoundingSphere(); g.add(m) }
  lodRegister([trunk], 40); lodRegister([crownA, crownB], 40)

  // 光束：樹冠縫隙斜射下來的陽光。細長的面，順著太陽方向放，繞自己的軸轉向鏡頭（圓柱型看板），加色、兩端淡出
  const N = 46, beams = []
  for (let k = 0; k < 400 && beams.length < N; k++) {
    const t = spots[Math.floor(rnd() * spots.length)], a = rnd() * TAU, d = t.D * 0.5 + 3 + rnd() * 4
    const x = t.x + Math.cos(a) * d, z = t.z + Math.sin(a) * d
    if (!inAlpine(x, z, 2) || bandDist(x, z) > 22) continue
    beams.push({ x, z, y: alpineHeight(x, z), w: 0.8 + rnd() * 2.2, ph: rnd() * TAU })
  }
  const beamGeo = new THREE.PlaneGeometry(1, 1, 1, 8).translate(0, 0.5, 0)
  const beamMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
    uniforms: { uDir: { value: new THREE.Vector3(0, 1, 0) }, uK: { value: 1 }, uTime: { value: 0 }, uCol: { value: new THREE.Color(1, 0.93, 0.78) } },
    vertexShader: `
      uniform vec3 uDir; uniform float uTime;
      attribute vec4 aBeam;   // x, y, z（光落地的點）, 寬
      attribute float aPh;
      varying vec2 vUv; varying float vPh;
      void main() {
        vUv = uv; vPh = aPh;
        vec3 axis = normalize(uDir);
        float len = 30.0;
        vec3 base = aBeam.xyz;
        vec3 p = base + axis * (position.y * len);
        vec3 toCam = normalize(cameraPosition - p);
        vec3 side = normalize(cross(axis, toCam));
        p += side * position.x * aBeam.w * (0.6 + 0.4 * position.y);
        gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: `
      uniform float uK, uTime; uniform vec3 uCol;
      varying vec2 vUv; varying float vPh;
      void main() {
        float across = 1.0 - abs(vUv.x - 0.5) * 2.0;
        float a = smoothstep(0.0, 0.7, across) * smoothstep(0.0, 0.25, vUv.y) * smoothstep(1.0, 0.55, vUv.y);
        a *= 0.75 + 0.25 * sin(uTime * 0.4 + vPh + vUv.y * 3.0);   // 慢慢明暗（像雲飄過、樹梢搖）
        gl_FragColor = vec4(uCol * a * 0.09 * uK, 1.0);
      }`,
  })
  const ig = new THREE.InstancedBufferGeometry(); ig.index = beamGeo.index
  ig.setAttribute('position', beamGeo.attributes.position); ig.setAttribute('uv', beamGeo.attributes.uv)
  ig.setAttribute('aBeam', new THREE.InstancedBufferAttribute(new Float32Array(beams.flatMap((b) => [b.x, b.y, b.z, b.w])), 4))
  ig.setAttribute('aPh', new THREE.InstancedBufferAttribute(new Float32Array(beams.map((b) => b.ph)), 1))
  ig.instanceCount = beams.length
  const beamMesh = new THREE.Mesh(ig, beamMat); beamMesh.frustumCulled = false; beamMesh.renderOrder = 9
  g.add(beamMesh)

  scene.add(g)
  const tmp = new THREE.Vector3()
  function tick(t, camera, { day = 1 } = {}) {
    beamMat.uniforms.uTime.value = t
    if (sun) { tmp.copy(sun.position).sub(sun.target.position).normalize(); beamMat.uniforms.uDir.value.copy(tmp) }
    // 太陽越低越斜、越金黃；晚上沒有；鏡頭在林帶外面（遠看）淡掉，不會在遠景看到一根根發光的棍子
    const low = 1 - Math.max(0, tmp.y)
    beamMat.uniforms.uCol.value.setRGB(1, 0.92 - 0.15 * low, 0.75 - 0.3 * low)
    const inBand = 1 - THREE.MathUtils.smoothstep(bandDist(camera.position.x, camera.position.z), 25, 55)
    beamMat.uniforms.uK.value = Math.max(0, day) * inBand * (tmp.y > 0.05 ? 1 : 0)
    beamMesh.visible = beamMat.uniforms.uK.value > 0.01
  }
  // 鏡頭在林帶裡面的程度（0 外面～1 裡面）：world.js 拿來把林下調暗、霧帶一點藍綠
  const inside = (camera) => 1 - THREE.MathUtils.smoothstep(bandDist(camera.position.x, camera.position.z), 16, 34)
  return { group: g, tick, spots, inside }
}
