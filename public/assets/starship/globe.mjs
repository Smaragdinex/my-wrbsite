// 全息地球儀(原本在大廳正中央,現在放在 Tiny Planet 艙的台座上):藍色球體 + 金色點狀大陸 + 經緯線 + 大氣光圈 + 背光暈 + 兩圈軌道與小衛星
// holoGlobe() → { group, ball(點擊用), update(t) };半徑約 1(軌道到 1.72),放進場景時自己縮放
import * as THREE from 'three';
import { sphere, group, rand } from './kit.mjs?v=3';

const canvasTex = (w, h, draw) => { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t; };

export function holoGlobe() {
  // 大陸形狀:球面上的 3D 雜訊(fbm)決定哪裡是陸地 → 自然的不規則海岸線
  const hash = (x, y, z) => { const h = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return h - Math.floor(h); };
  const vnoise = (x, y, z) => { const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z), xf = x - xi, yf = y - yi, zf = z - zi, sm = (t) => t * t * (3 - 2 * t), u = sm(xf), v = sm(yf), w = sm(zf);
    const L = (a, b, t) => a + (b - a) * t, c = (dx, dy, dz) => hash(xi + dx, yi + dy, zi + dz);
    return L(L(L(c(0, 0, 0), c(1, 0, 0), u), L(c(0, 1, 0), c(1, 1, 0), u), v), L(L(c(0, 0, 1), c(1, 0, 1), u), L(c(0, 1, 1), c(1, 1, 1), u), v), w); };
  const fbm = (x, y, z) => { let a = .5, f = 1.6, s = 0; for (let o = 0; o < 4; o++) { s += a * vnoise(x * f + 11, y * f + 7, z * f + 3); a *= .5; f *= 2.1; } return s; };
  // ---- 陸地遮罩:跟 SphereGeometry 的 UV 對齊(u = 經度、v = 緯度),每格問 fbm「這裡是不是陸地」----
  const MW = 512, MH = 256, mask = new Uint8Array(MW * MH);
  for (let y = 0; y < MH; y++) { const th = (y + .5) / MH * Math.PI, st = Math.sin(th), ct = Math.cos(th);
    for (let x = 0; x < MW; x++) { const ph = (x + .5) / MW * Math.PI * 2, px = -Math.cos(ph) * st, pz = Math.sin(ph) * st;
      mask[y * MW + x] = fbm(px, ct, pz) > .495 && Math.abs(ct) < .9 ? 1 : 0; } }
  const isLand = (x, y) => mask[Math.min(MH - 1, Math.max(0, y)) * MW + ((x % MW) + MW) % MW];
  // ---- 金色大陸貼圖:柔和的金色底光 → 一層密密的光點(像夜裡的城市燈,赤道偏橘、往兩極變淡黃)→ 更亮的海岸線 ----
  const landTex = canvasTex(2048, 1024, (g, W, H) => {
    const mc = document.createElement('canvas'); mc.width = MW; mc.height = MH; const mg = mc.getContext('2d'), id = mg.createImageData(MW, MH);
    for (let i = 0; i < MW * MH; i++) { id.data[i * 4] = 255; id.data[i * 4 + 1] = 190; id.data[i * 4 + 2] = 80; id.data[i * 4 + 3] = mask[i] ? 42 : 0; }
    mg.putImageData(id, 0, 0); g.imageSmoothingEnabled = true; g.drawImage(mc, 0, 0, W, H);             // 放大時自然變柔 → 底光
    const r = rand(44), sx = W / MW, sy = H / MH;
    for (let y = 3; y < H; y += 7) for (let x = 3; x < W; x += 7) {
      if (!isLand(x / sx | 0, y / sy | 0)) continue;
      const lat = Math.abs(y / H - .5) * 2, k = r();                                                        // lat 0 = 赤道、1 = 極
      const R = 255, G = 200 + lat * 45 + k * 10 | 0, B = 90 + lat * 110 + k * 30 | 0;
      g.fillStyle = `rgba(${R},${G},${B},${.8 + k * .2})`; g.beginPath(); g.arc(x, y, 1.1 + k * 1.3, 0, Math.PI * 2); g.fill();
    }
    g.fillStyle = 'rgba(255,240,190,1)';                                                                    // 海岸線:陸地格子旁邊是海的地方
    for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) if (isLand(x, y) && (!isLand(x + 1, y) || !isLand(x - 1, y) || !isLand(x, y + 1) || !isLand(x, y - 1))) g.fillRect(x * sx, y * sy, sx * .9, sy * .9);
  });
  const globe = new THREE.Group();
  const spin = group(globe, 0, 0, 0); spin.rotation.z = .41;                                                    // 地軸傾斜
  // 地球本體:海洋從中心的深藏青 → 藍 → 邊緣帶一點紫(依視角漸層),金色大陸比白還亮 → 會發出柔光(bloom)
  const globeU = { uLand: { value: landTex }, uTime: { value: 0 } };
  const ball = new THREE.Mesh(new THREE.SphereGeometry(.97, 96, 64), new THREE.ShaderMaterial({ uniforms: globeU,
    vertexShader: 'varying vec2 vUv; varying vec3 vN, vV; void main(){ vUv = uv; vec4 wp = modelMatrix * vec4(position, 1.0); vN = normalize(mat3(modelMatrix) * normal); vV = normalize(cameraPosition - wp.xyz); gl_Position = projectionMatrix * viewMatrix * wp; }',
    fragmentShader: `uniform sampler2D uLand; uniform float uTime; varying vec2 vUv; varying vec3 vN, vV;
      void main(){
        float f = clamp(1.0 - abs(dot(normalize(vN), normalize(vV))), 0.0, 1.0);
        vec3 ocean = mix(vec3(.015, .04, .16), vec3(.05, .22, .62), smoothstep(.0, .75, f));
        ocean = mix(ocean, vec3(.42, .3, .95), smoothstep(.62, 1.0, f));
        vec4 land = texture2D(uLand, vUv);
        float flick = .92 + .08 * sin(uTime * 2.3 + vUv.x * 40.0);
        vec3 col = ocean * (1.0 - land.a * .55) + land.rgb * land.a * 2.0 * flick;
        col += vec3(1.0, .82, .45) * smoothstep(.985, 1.0, sin(vUv.y * 90.0 - uTime * 1.6)) * .06;     // 一道淡淡的掃描線往上跑
        gl_FragColor = vec4(col, 1.0);
      }` })); spin.add(ball);
  // 經緯線(淡青)
  const geoOf = (arr) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3)); return g; };
  { const v = [], R1 = 1.0, ring = (fn) => { for (let k = 0; k < 96; k++) { const a0 = k / 96 * Math.PI * 2, a1 = (k + 1) / 96 * Math.PI * 2; v.push(...fn(a0), ...fn(a1)); } };
    for (let lat = -60; lat <= 60; lat += 30) { const p = lat * Math.PI / 180, y = Math.sin(p) * R1, r = Math.cos(p) * R1; ring((a) => [Math.cos(a) * r, y, Math.sin(a) * r]); }
    for (let lon = 0; lon < 180; lon += 30) { const q = lon * Math.PI / 180; ring((a) => [Math.cos(a) * Math.cos(q) * R1, Math.sin(a) * R1, Math.cos(a) * Math.sin(q) * R1]); }
    spin.add(new THREE.LineSegments(geoOf(v), new THREE.LineBasicMaterial({ color: 0x7fd8ff, transparent: true, opacity: .22, depthWrite: false }))); }
  // 大氣層:輪廓一圈光,顏色由下往上從青 → 洋紅
  const rim = new THREE.Mesh(new THREE.SphereGeometry(1.07, 64, 48), new THREE.ShaderMaterial({ transparent: true, depthWrite: false,
    vertexShader: 'varying vec3 vN, vV, vP; void main(){ vP = position; vec4 wp = modelMatrix * vec4(position, 1.0); vN = normalize(mat3(modelMatrix) * normal); vV = normalize(cameraPosition - wp.xyz); gl_Position = projectionMatrix * viewMatrix * wp; }',
    fragmentShader: 'varying vec3 vN, vV, vP; void main(){ float f = pow(clamp(1.0 - abs(dot(normalize(vN), normalize(vV))), 0.0, 1.0), 2.2); vec3 c = mix(vec3(.25, .85, 1.0), vec3(1.0, .4, .95), smoothstep(-1.0, 1.0, vP.y)); gl_FragColor = vec4(c * 1.7, f * .9); }' }));
  globe.add(rim);
  // 背後的光暈:中心偏金、往外變藍再淡出
  const haloT = canvasTex(256, 256, (g) => { const gr = g.createRadialGradient(128, 128, 30, 128, 128, 128); gr.addColorStop(0, 'rgba(255,205,120,.55)'); gr.addColorStop(.45, 'rgba(110,170,255,.3)'); gr.addColorStop(1, 'rgba(160,110,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 256, 256); });
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloT, transparent: true, opacity: .85, depthWrite: false })); halo.scale.setScalar(3.6); halo.renderOrder = -1; globe.add(halo);
  // 兩圈軌道:沿著環流動的漸層(青 → 金 → 洋紅),各一顆金色小衛星
  const orbitU = { uTime: globeU.uTime };
  const orbit = (r, tiltX, tiltY, off) => { const p = group(globe, 0, 0, 0); p.rotation.set(tiltX, tiltY, 0);
    const ringM = new THREE.Mesh(new THREE.TorusGeometry(r, .011, 6, 200), new THREE.ShaderMaterial({ uniforms: orbitU, transparent: true, depthWrite: false,
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `uniform float uTime; varying vec2 vUv; void main(){ float t = fract(vUv.x + uTime * .06 + ${off.toFixed(2)});
        vec3 c = t < .33 ? mix(vec3(.3, .85, 1.0), vec3(1.0, .78, .35), t / .33) : t < .66 ? mix(vec3(1.0, .78, .35), vec3(1.0, .4, .9), (t - .33) / .33) : mix(vec3(1.0, .4, .9), vec3(.3, .85, 1.0), (t - .66) / .34);
        gl_FragColor = vec4(c * 1.15, .95); }` }));
    ringM.rotation.x = Math.PI / 2; p.add(ringM);
    const sat = sphere(p, .04, new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffd27a).multiplyScalar(2.6), toneMapped: false })); return { p, sat, r }; };
  const orbits = [orbit(1.5, -.35, 0, 0), orbit(1.72, .5, .6, .5)];
  return { group: globe, ball, update(t) {
    globeU.uTime.value = t; spin.rotation.y = t * .12;
    orbits.forEach((o, k) => { const a = t * (k ? -.5 : .7) + k * 2; o.sat.position.set(Math.cos(a) * o.r, 0, Math.sin(a) * o.r); });
  } };
}
