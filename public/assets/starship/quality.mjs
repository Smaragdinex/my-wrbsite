// 畫質分級:一進網站就判斷這台裝置的顯示卡,決定用 high / medium / low 哪一級。
//   1) 顯示卡名稱(WEBGL_debug_renderer_info):軟體繪圖、老的手機 / 內顯 → low;獨立顯卡、Apple M 系列 → high
//   2) 很短的跑分(約 60ms):在 256×256 的小畫布上畫幾次很重的 shader,量花多久 → 太慢就往下降一級
//   3) 跑起來以後,main.mjs 還會看實際幀率:一直卡就自動降級(先降解析度,再降到 low)
// 網址加 ?q=high|medium|low 可以強制指定(測試用)。結果放在 window.__quality。
const TIERS = ['low', 'medium', 'high'];

function gpuName() {
  try {
    const c = document.createElement('canvas'), gl = c.getContext('webgl2') || c.getContext('webgl');
    if (!gl) return { name: '', gl: null };
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return { name: String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)), gl };
  } catch { return { name: '', gl: null }; }
}

// 跑分:256×256 畫 6 次 12 層 fbm,最後讀一個像素強迫 GPU 做完,回傳每次平均毫秒
function bench(gl) {
  try {
    const vs = 'attribute vec2 p; void main(){ gl_Position = vec4(p, 0., 1.); }';
    const fs = `precision highp float; uniform float t;
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
        return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + 1.), f.x), f.y); }
      void main(){ vec2 p = gl_FragCoord.xy * .02 + t; float s = 0., a = .5;
        for (int k = 0; k < 12; k++) { s += a * n(p); p = p * 2.03 + s; a *= .55; }
        gl_FragColor = vec4(vec3(s), 1.); }`;
    const sh = (type, src) => { const o = gl.createShader(type); gl.shaderSource(o, src); gl.compileShader(o); return o; };
    const pr = gl.createProgram(); gl.attachShader(pr, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(pr);
    if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) return null;
    gl.useProgram(pr);
    const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(pr, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    gl.canvas.width = gl.canvas.height = 256; gl.viewport(0, 0, 256, 256);
    const px = new Uint8Array(4), tl = gl.getUniformLocation(pr, 't');
    gl.uniform1f(tl, 0); gl.drawArrays(gl.TRIANGLES, 0, 3); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);   // 暖機(編譯)
    const t0 = performance.now(), N = 6;
    for (let i = 0; i < N; i++) { gl.uniform1f(tl, i + 1); gl.drawArrays(gl.TRIANGLES, 0, 3); }
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    return (performance.now() - t0) / N;
  } catch { return null; } finally { try { gl.getExtension('WEBGL_lose_context')?.loseContext(); } catch {} }
}

function detect() {
  const forced = new URLSearchParams(location.search).get('q');
  if (TIERS.includes(forced)) return { tier: forced, why: 'forced', gpu: '', ms: null };
  const { name, gl } = gpuName(), g = name.toLowerCase();
  const mobile = /android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /macintosh/i.test(navigator.userAgent));
  const cores = navigator.hardwareConcurrency || 4, mem = navigator.deviceMemory || 8;
  let tier = mobile ? 'medium' : 'high', why = mobile ? 'mobile' : 'desktop';
  if (!gl || /swiftshader|llvmpipe|software|basic render/.test(g)) { tier = 'low'; why = 'software'; }
  else if (/mali-(4|t[6-8])|adreno \(tm\) [3-5]\d\d|powervr|intel\(r\) hd graphics [2-5]|gma/.test(g)) { tier = 'low'; why = 'old gpu'; }
  else if (/intel/.test(g) && !/iris|arc/.test(g)) { tier = 'medium'; why = 'intel igpu'; }
  else if (/rtx|gtx 1[06-9]|radeon rx|radeon pro|apple m\d|apple gpu/.test(g) && !mobile) { tier = 'high'; why = 'discrete / apple silicon'; }
  if (mobile && (mem <= 3 || cores <= 4)) { tier = 'low'; why += ', low-end phone'; }
  const ms = gl ? bench(gl) : null;                               // 跑分只往下修
  if (ms != null) {
    if (ms > 22 && tier !== 'low') { tier = 'low'; why += `, slow bench ${ms.toFixed(1)}ms`; }
    else if (ms > 9 && tier === 'high') { tier = 'medium'; why += `, bench ${ms.toFixed(1)}ms`; }
  }
  return { tier, why, gpu: name, ms };
}

const Q = window.__quality = detect();
// 每一級的設定(main.mjs / exterior.mjs / hall.mjs 讀這裡);warpN / tunSeg / tun2 / shake = 超空間跳躍的星線數、隧道細緻度、外層第二道隧道、鏡頭震動
const SETTINGS = {
  high:   { dprMax: 2,   bloom: true,  shadows: true,  shadowSize: 2048, planetOct: [6, 5], planetSeg: 256, mirror: true,  hallBloom: true,  warpN: 2600, tunSeg: 96, tun2: true,  shake: true },
  medium: { dprMax: 1.5, bloom: true,  shadows: true,  shadowSize: 1024, planetOct: [4, 4], planetSeg: 160, mirror: true,  hallBloom: true,  warpN: 1500, tunSeg: 64, tun2: false, shake: true },
  low:    { dprMax: 1,   bloom: false, shadows: false, shadowSize: 512,  planetOct: [3, 3], planetSeg: 96,  mirror: false, hallBloom: false, warpN: 650,  tunSeg: 28, tun2: false, shake: false },
};
export const quality = Q;
export const Q_SET = SETTINGS[Q.tier];
console.info(`[quality] ${Q.tier} (${Q.why}) gpu="${Q.gpu}" bench=${Q.ms == null ? '-' : Q.ms.toFixed(1) + 'ms'}`);
