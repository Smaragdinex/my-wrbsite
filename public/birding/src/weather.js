// 天氣（2026-11-08）：晴 → 多雲 → 下雨 → 雷雨，遊戲裡自己隨機變（每段 2～5 分鐘，大部分時間是好天氣）。
// w：0 晴、0.45 多雲、0.7 下雨、1 雷雨，慢慢往目標值變（一兩分鐘轉變完），所有效果都從 w 算：
//   天空：雲量、變灰、太陽被遮（structures.js weatherU）；太陽光、天光、環境反射變暗；霧變濃、變灰；遠山被雨霧蓋住
//   雨：鏡頭四周一個 44×26×44 公尺的盒子裡幾千條雨絲（著色器裡算位置，跟著鏡頭繞回來，不用每格更新頂點）；在相機行、小木屋裡不畫
//   水池：雨滴打出漣漪（structures.js 的 ripple）
//   雷雨：隔幾秒一道閃電（遠處天空一條鋸齒狀的光，整片雲和地面一起亮兩三下），雷聲照距離晚幾秒到（onThunder 交給 ambience.js 出聲）
// 日夜（world.js setTime）每格把燈光設成「晴天的值」，這裡在它後面乘上天氣（包住 setTime，所以不會越乘越暗）。
import * as THREE from 'three'
import { weatherU, ripple } from './structures.js'
import { POOL, poolQ, STORE, CABIN } from './layout.js'

const { clamp, lerp, smoothstep, randFloat: rnd } = THREE.MathUtils
const ss = (a, b, v) => smoothstep(v, a, b)
export const WEATHER = { clear: 0, cloudy: 0.45, rain: 0.72, storm: 1 }
const NEXT = [['clear', 0.5], ['cloudy', 0.25], ['rain', 0.15], ['storm', 0.1]]

export function createWeather({ scene, camera, sun, hemi, renderer, time }) {
  const st = { w: 0, target: 0, name: 'clear', auto: false, seg: rnd(120, 240), flash: 0, rain: 0, storm: 0, cloud: 0, nextBolt: 8 }
  const thunderCbs = []

  /* ---------- 包住日夜：setTime 之後記下「晴天」的燈光，再套天氣 ---------- */
  const base = { sun: 1, hemi: 1, env: 1, fog: 0.003, fogC: new THREE.Color(), exp: 1 }
  const grab = () => { base.sun = sun.intensity; base.hemi = hemi.intensity; base.env = scene.environmentIntensity; base.fog = scene.fog.density; base.fogC.copy(scene.fog.color); base.exp = renderer.toneMappingExposure }
  if (time) { const orig = time.setTime; time.setTime = (h) => { orig(h); grab(); apply() } }
  grab()
  const grey = new THREE.Color()
  function apply() {
    const cl = st.cloud, r = st.rain, f = st.flash
    sun.intensity = base.sun * (1 - 0.82 * cl) + f * 2.5
    hemi.intensity = base.hemi * (1 - 0.3 * cl) + f * 6
    scene.environmentIntensity = base.env * (1 - 0.45 * cl)
    scene.fog.density = base.fog * (1 + 0.6 * cl + 1.6 * r)
    const lum = base.fogC.r * 0.3 + base.fogC.g * 0.5 + base.fogC.b * 0.2
    scene.fog.color.copy(base.fogC).lerp(grey.setRGB(lum * 0.86, lum * 0.9, lum * 0.94), cl * 0.75)
    weatherU.cloud.value = cl
    weatherU.gloom.value = Math.min(1, cl * 0.75 + st.storm * 0.25)
    weatherU.flash.value = f
    weatherU.haze.value = cl * 0.5 + r * 0.4
  }

  /* ---------- 雨絲 ---------- */
  const N = 9000, B = new THREE.Vector3(44, 26, 44)
  const pos = new Float32Array(N * 2 * 3), aB = new Float32Array(N * 2 * 4), aEnd = new Float32Array(N * 2)
  for (let i = 0; i < N; i++) {
    const b = [Math.random(), Math.random(), Math.random(), Math.random()]
    for (let e = 0; e < 2; e++) { aB.set(b, (i * 2 + e) * 4); aEnd[i * 2 + e] = e }
  }
  const rg = new THREE.BufferGeometry()
  rg.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  rg.setAttribute('aB', new THREE.BufferAttribute(aB, 4))
  rg.setAttribute('aEnd', new THREE.BufferAttribute(aEnd, 1))
  const rainM = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, fog: true,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uCam: { value: new THREE.Vector3() }, uT: { value: 0 }, uRain: { value: 0 }, uB: { value: B }, uLight: { value: 1 } }]),
    vertexShader: `attribute vec4 aB; attribute float aEnd; uniform vec3 uCam; uniform float uT; uniform float uRain; uniform vec3 uB; varying float vA;
      #include <fog_pars_vertex>
      void main(){
        vec3 vel = vec3(1.6, -11.0 - 3.0 * aB.w, 0.7);
        vec3 p = aB.xyz * uB + vel * uT;
        vec3 rel = mod(p - uCam, uB) - uB * 0.5;          // 盒子跟著鏡頭，掉出去的雨絲從另一邊繞回來
        vec3 wp = uCam + rel - normalize(vel) * (0.6 + 0.4 * aB.w) * aEnd;
        float r = length(rel.xz) / (uB.x * 0.5);
        vA = step(aB.w, uRain) * (1.0 - smoothstep(0.7, 1.0, r)) * (0.55 + 0.45 * aEnd);
        vec4 mvPosition = viewMatrix * vec4(wp, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: `uniform float uLight; varying float vA;
      #include <fog_pars_fragment>
      void main(){
        gl_FragColor = vec4(vec3(0.8, 0.84, 0.9) * uLight, vA * 0.6);
        #include <fog_fragment>
      }`,
  })
  const rain = new THREE.LineSegments(rg, rainM)
  rain.frustumCulled = false; rain.renderOrder = 7; rain.visible = false
  scene.add(rain)

  /* ---------- 閃電 ---------- */
  const boltM = new THREE.LineBasicMaterial({ color: 0xeef2ff, transparent: true, opacity: 0, fog: false, blending: THREE.AdditiveBlending, depthWrite: false })
  const bolt = new THREE.LineSegments(new THREE.BufferGeometry(), boltM)
  bolt.frustumCulled = false; bolt.visible = false; scene.add(bolt)
  function makeBolt(x, z, top) {
    const pts = []
    const branch = (p, dir, len, depth) => {
      let cur = p.clone()
      const n = Math.round(len / 9)
      for (let i = 0; i < n; i++) {
        const nx = cur.clone().add(new THREE.Vector3(dir.x * 9 + rnd(-6, 6), -9 * (0.7 + Math.random() * 0.6), dir.z * 9 + rnd(-6, 6)))
        pts.push(cur.x, cur.y, cur.z, nx.x, nx.y, nx.z)
        if (depth < 2 && Math.random() < 0.12) branch(nx, new THREE.Vector3(rnd(-1, 1), 0, rnd(-1, 1)), len * 0.35, depth + 1)
        cur = nx; if (cur.y < 0) break
      }
    }
    branch(new THREE.Vector3(x, top, z), new THREE.Vector3(0, 0, 0), top, 0)
    bolt.geometry.dispose()
    bolt.geometry = new THREE.BufferGeometry(); bolt.geometry.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3))
  }
  let strike = null   // { t, bright }
  function lightning() {
    const a = Math.random() * Math.PI * 2, d = rnd(220, 750), c = camera.position
    makeBolt(c.x + Math.cos(a) * d, c.z + Math.sin(a) * d, rnd(220, 300))
    strike = { t: 0, bright: lerp(1, 0.45, (d - 220) / 530) }
    const delay = d / 343, strength = clamp(1.15 - d / 800, 0.25, 1)
    for (const cb of thunderCbs) cb(delay, strength)
  }
  // 閃光的亮暗：亮一下、暗、再亮一下、慢慢退
  const flashAt = (t) => t < 0.07 ? 1 : t < 0.15 ? 0.15 : t < 0.24 ? 0.85 : t < 0.32 ? 0.3 : t < 0.38 ? 0.6 : Math.max(0, 0.6 * (1 - (t - 0.38) / 0.35))

  /* ---------- 每格 ---------- */
  const inside = (p) => (p.x < STORE.X0 + 0.3 && p.x > STORE.X1 - 0.3 && Math.abs(p.z) < STORE.HZ + 0.3) ||
    (() => { const dx = p.x - CABIN.x, dz = p.z - CABIN.z, u = dx * Math.cos(CABIN.yaw) - dz * Math.sin(CABIN.yaw), v = dx * Math.sin(CABIN.yaw) + dz * Math.cos(CABIN.yaw); return Math.abs(u) < CABIN.W / 2 && Math.abs(v) < CABIN.D / 2 && p.y < CABIN.y + 4 })()
  let ripAcc = 0
  function tick(t, dt) {
    // 自動換天氣
    if (st.auto && (st.seg -= dt) <= 0) {
      let x = Math.random(), pickName = 'clear'
      for (const [n, wgt] of NEXT) { if ((x -= wgt) <= 0) { pickName = n; break } }
      setName(pickName); st.seg = rnd(120, 300)
    }
    st.w += clamp(st.target - st.w, -dt / 45, dt / 45)   // 一個等級大概 30～45 秒變過去
    st.cloud = ss(0.08, 0.55, st.w); st.rain = ss(0.5, 0.72, st.w); st.storm = ss(0.82, 0.98, st.w)
    // 閃電
    if (st.storm > 0.3 && (st.nextBolt -= dt) <= 0) { lightning(); st.nextBolt = rnd(7, 22) / st.storm }
    if (strike) {
      strike.t += dt
      st.flash = flashAt(strike.t) * strike.bright
      bolt.visible = strike.t < 0.4; boltM.opacity = Math.min(1, st.flash * 1.6)
      if (strike.t > 0.8) { strike = null; st.flash = 0; bolt.visible = false }
    }
    // 雨
    const cp = camera.position, indoor = inside(cp)
    rain.visible = st.rain > 0.01 && !indoor
    rainM.uniforms.uCam.value.copy(cp); rainM.uniforms.uT.value = t; rainM.uniforms.uRain.value = st.rain
    rainM.uniforms.uLight.value = 0.35 + 0.65 * Math.min(1, base.hemi / 1.2) + st.flash
    if (st.rain > 0.05) {
      ripAcc += dt * 40 * st.rain
      for (; ripAcc >= 1; ripAcc--) {
        const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * 0.95
        const x = POOL.x + Math.cos(a) * r * POOL.rx, z = POOL.z + Math.sin(a) * r * POOL.rz
        if (poolQ(x, z) < 0.9) ripple(x, z, 0.18 + Math.random() * 0.12)
      }
    }
    apply()
  }
  function setName(n) { st.name = n; st.target = WEATHER[n] ?? 0 }
  // set('rain')：慢慢變過去；set('rain', true)：馬上變
  function set(n, now = false) { setName(n); if (now) st.w = st.target; st.seg = rnd(180, 300) }
  return {
    tick, set, apply,
    auto(on = true) { st.auto = on },
    onThunder(cb) { thunderCbs.push(cb) },
    get name() { return st.name }, get rain() { return st.rain }, get storm() { return st.storm }, get cloud() { return st.cloud }, get flash() { return st.flash },
    st, lightning,
  }
}
