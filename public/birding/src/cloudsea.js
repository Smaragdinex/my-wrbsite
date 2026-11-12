// 雲海（2026-11-09 使用者：山上濕氣重，往下看應該是一片雲海）
// 三層疊在一起的半透明雲層（高度 SEA.y 起，每層隔 1.6 公尺），雜訊畫出一團團雲、照太陽方向打亮打暗、慢慢往東飄。
// 只在山區那一側（花園上空是晴的）；碰到山坡會照山區地形高度表慢慢變薄（不會一刀切在山坡上）；
// 鏡頭低於雲層就看不到（從花園抬頭不會看到一片天花板），爬到雲層上面才浮出來；鏡頭穿過雲層時近的地方淡掉。
import * as THREE from 'three'
import { ALP_GRID, ALP_HEIGHTS } from './layout.js'

export const SEA = { y: 32, layers: 3, gap: 1.6 }

export function createCloudSea(scene, { sun }) {
  // 山區地形高度 → 低解析度的貼圖（每 2 公尺一格，0～80 公尺壓成 0～255）
  const AG = ALP_GRID, K = 4, nx = Math.floor(AG.nx / K), nz = Math.floor(AG.nz / K)
  const hd = new Uint8Array(nx * nz)
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const h = ALP_HEIGHTS[(j * K) * AG.nx + i * K]
    hd[j * nx + i] = Math.max(0, Math.min(255, Math.round((Number.isFinite(h) && h < 1e5 ? h : 0) / 80 * 255)))
    { const x = AG.x0 + i * K * AG.cell, z = AG.z0 + j * K * AG.cell, sx = Math.max(198, Math.min(247, x)), d = Math.hypot((x - sx) / 1.15, z - (86 + (sx - 198) * 0.18))   /* 2026-11-13 驗收第 9 條之後：湖往東延伸到 x 247，雲海讓開的範圍沿著湖拉長 */   // 2026-11-13 Pass 1B（ChatGPT：水霧把湖和森林洗白）：
      if (d < 95) hd[j * nx + i] = Math.max(hd[j * nx + i], Math.round(255 * Math.min(1, (95 - d) / 25))) }   // 驗收第 24 條：從瀑布步道往下看整個河谷（湖西邊的營地、溪谷）也是一片白 → 範圍 44 → 70 m 全清、70～95 m 接回        // 瀑布盆地（湖面 27.5 m、雲海 32 m）往下看是一整片白 → 盆地 30 m 內不放雲海、30～44 m 慢慢接回
    if (AG.x0 + i * K * AG.cell > 250) hd[j * nx + i] = 255   // 2026-11-11 東邊（原本的濕地、草原）改成紅杉林：林子在雲海的高度裡，一片平的白霧把樹幹攔腰切斷 → 那裡不放雲海
  }
  const hTex = new THREE.DataTexture(hd, nx, nz, THREE.RedFormat)
  hTex.magFilter = hTex.minFilter = THREE.LinearFilter; hTex.needsUpdate = true
  const gridMin = new THREE.Vector2(AG.x0, AG.z0), gridSize = new THREE.Vector2((nx - 1) * K * AG.cell, (nz - 1) * K * AG.cell)

  const common = {
    uTime: { value: 0 }, uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uSunCol: { value: new THREE.Color(1, 1, 1) },
    uShade: { value: new THREE.Color(0.62, 0.68, 0.76) }, uCamFade: { value: 0 }, uHeight: { value: hTex }, uGridMin: { value: gridMin }, uGridSize: { value: gridSize },
  }
  const mats = []
  const group = new THREE.Group(); group.name = 'cloudSea'
  for (let L = 0; L < SEA.layers; L++) {
    const y = SEA.y + L * SEA.gap
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, fog: true, side: THREE.DoubleSide,
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uLayer: { value: L }, uY: { value: y } }]),
      vertexShader: /* glsl */`
        #include <fog_pars_vertex>
        varying vec3 vW;
        void main() {
          vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz;
          vec4 mvPosition = viewMatrix * w; gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }`,
      fragmentShader: /* glsl */`
        #include <fog_pars_fragment>
        uniform float uTime, uLayer, uY, uCamFade; uniform vec3 uSunDir, uSunCol, uShade;
        uniform sampler2D uHeight; uniform vec2 uGridMin, uGridSize;
        varying vec3 vW;
        float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float vn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
        float fbm(vec2 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a * vn(p); p = p * 2.03 + vec2(17.1, 9.2); a *= 0.5; } return s; }
        float dens(vec2 p) {
          vec2 q = p + vec2(fbm(p * 0.6 + uTime * 0.01), fbm(p * 0.6 - 3.7)) * 0.9;   // 扭一下，雲團邊緣才有捲的樣子
          return fbm(q) + uLayer * 0.04;
        }
        void main() {
          vec2 p = vW.xz * 0.018 + vec2(uTime * 0.006, uTime * 0.0015) + uLayer * 0.37;
          float d = dens(p);
          float cov = smoothstep(0.42 - uLayer * 0.03, 0.6, d);
          // 法線：雜訊的斜率當成雲頂起伏
          float e = 0.04, dx = dens(p + vec2(e, 0.0)) - d, dz = dens(p + vec2(0.0, e)) - d;
          vec3 n = normalize(vec3(-dx * 14.0, 1.0, -dz * 14.0));
          float lit = 0.3 + 0.7 * clamp(dot(n, normalize(uSunDir)), 0.0, 1.0);
          lit *= 0.8 + 0.2 * smoothstep(0.45, 0.8, d);   // 雲團中間厚的地方亮、邊緣薄的地方透一點灰
          vec3 col = mix(uShade, uSunCol, lit * (0.75 + 0.25 * uLayer / 2.0));
          // 碰到山：地形離雲層越近越薄
          vec2 g = (vW.xz - uGridMin) / uGridSize;
          float th = (g.x >= 0.0 && g.x <= 1.0 && g.y >= 0.0 && g.y <= 1.0) ? texture2D(uHeight, g).r * 80.0 : 0.0;
          float shore = smoothstep(-1.0, 7.0, uY - th);
          // 只在山區那邊（花園上空晴）、鏡頭近的地方淡掉（穿過雲層時不會一片貼臉）、遠的地方被霧吃掉
          float region = smoothstep(70.0, 130.0, vW.x);
          float near = smoothstep(3.0, 22.0, distance(vW, cameraPosition));
          float a = cov * shore * region * near * uCamFade * (0.7 + 0.25 * uLayer / 2.0);
          if (a < 0.003) discard;
          gl_FragColor = vec4(col, a);
          vec3 lit0 = gl_FragColor.rgb;
          #include <fog_fragment>
          // 霧只吃掉一部分：雲海本身就是白的，整片被山區的濃霧蓋掉會跟背景糊成一片（遠的還是會淡進天色）
          gl_FragColor.rgb = mix(lit0, gl_FragColor.rgb, 0.45 * smoothstep(60.0, 900.0, distance(vW, cameraPosition)) + 0.15);
        }`,
    })
    for (const k of Object.keys(common)) mat.uniforms[k] = common[k]   // 三層共用同一組（太陽、時間）
    const m = new THREE.Mesh(new THREE.PlaneGeometry(3200, 3200, 1, 1).rotateX(-Math.PI / 2), mat)
    m.position.set(200, y, 0); m.renderOrder = 7; m.frustumCulled = false
    group.add(m); mats.push(mat)
  }
  scene.add(group)

  const tmp = new THREE.Vector3()
  function tick(t, camera, { day = 1 } = {}) {
    common.uTime.value = t
    tmp.copy(sun.position).sub(sun.target.position).normalize(); common.uSunDir.value.copy(tmp)
    // 雲的顏色：白天白、黃昏帶一點暖色（照太陽光色）、晚上暗藍灰
    common.uSunCol.value.copy(sun.color).multiplyScalar(0.3 + 0.95 * day).lerp(new THREE.Color(0.07, 0.085, 0.13), 1 - Math.min(1, day * 1.5))   // 2026-11-11 夜裡的雲海原本一大片平平的亮灰（使用者：遠景只有一片灰）→ 暗一點、偏藍，山的剪影才出得來
    common.uShade.value.setRGB(0.5, 0.56, 0.66).multiplyScalar(0.1 + 0.9 * day)
    // 2026-11-10 使用者：瀑布山下面破洞、左邊也是 → 其實是雲海的底面：瀑布湖邊鏡頭約 31 公尺，以前從 26 公尺就開始出現，一條灰色的「天花板」橫切過岩壁，看起來像破洞看到外面。改成鏡頭在雲層上面才出現
    common.uCamFade.value = THREE.MathUtils.smoothstep(camera.position.y, SEA.y + 1, SEA.y + 8)
    group.visible = common.uCamFade.value > 0.001
  }
  return { tick, group }
}
