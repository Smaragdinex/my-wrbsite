// 畫質分級:一進網站就判斷這台裝置的顯示卡,決定用 high / medium / low 哪一級。
//   1) 顯示卡名稱(WEBGL_debug_renderer_info):軟體繪圖、老的手機 / 內顯 → low;獨立顯卡、Apple M 系列 → high
//   2) 很短的跑分(約 60ms):在 256×256 的小畫布上畫幾次很重的 shader,量花多久 → 太慢就往下降一級
//   3) 跑起來以後,main.mjs 還會看實際幀率:一直卡就自動降級(先降解析度,再降到 low)
// 網址加 ?q=high|medium|low 可以強制指定(測試用)。結果放在 window.__quality。
const TIERS = ['low', 'medium', 'high'];
// 當機足跡:每個載入 / 切換步驟記一筆到 localStorage(最後 30 筆、離開始幾秒)。網頁當掉後下一次載入,右下角顯示上次停在哪一步(?debug=1 也會顯示這次的),
// 這樣在實機上就知道是哪一步出事(模擬器重現不出來)
const T0 = performance.now(), trail = [];
window.__crumb = (s) => { trail.push(`${((performance.now() - T0) / 1000).toFixed(1)}s ${s}`); if (trail.length > 30) trail.shift(); try { localStorage.setItem('xarts-trail', JSON.stringify(trail)); } catch {} if (dbgBox) dbgBox.textContent = trail.slice(-8).join('\n'); };
let dbgBox = null;
function showNote(title, lines) {
  const d = document.createElement('div'); d.textContent = title + '\n' + lines.join('\n');
  Object.assign(d.style, { position: 'fixed', right: '10px', bottom: '10px', zIndex: 99, maxWidth: '78vw', whiteSpace: 'pre-wrap', font: '11px/1.45 Menlo, monospace', color: '#e8ecf4', background: 'rgba(10,14,28,.82)', padding: '8px 10px', borderRadius: '8px', pointerEvents: 'auto' });
  d.onclick = () => d.remove(); (document.body ? Promise.resolve() : new Promise((r) => addEventListener('DOMContentLoaded', r))).then(() => document.body.appendChild(d)); return d;
}

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

// 裝置等級(level):0 電腦(原版)、1 手機 / 平板(小貼圖,五間房全載)、2 舊平板(同 1,再加 1x、不開抗鋸齒、沒有地板倒影)、
//   3 省記憶體(房間一次只載一間、低畫質)、4 精簡(大廳 / 通道 / 房間都不載烘焙模型,用程式蓋的輕量版)、5 平面(不進 3D 艦內,改成作品卡片頁)
//   使用者要求:平板跟手機一樣(五間房都要真的載、一樣的畫質),除非是很舊的平板(跑分慢 / 核心少 → 2);真的當掉才再往下降
// 決定方式:①依裝置給預設 ②超空間(讀取畫面)量實際幀率,太慢就往下降一級(stepDown,main.mjs 呼叫)
//          ③當機保護:進艦內時記一筆 xarts-crash,正常就擦掉;下次載入還在 = 上次當掉 → 比上次用的等級再低一級,而且這台記住(14 天)
//   ?level=0~5 強制、?safe=0 清掉記住的等級
const LEVEL_KEY = 'xarts-floor', P = new URLSearchParams(location.search);
let FLOOR = 0, CRASHED = null;
try {
  if (P.get('safe') === '0') { localStorage.removeItem(LEVEL_KEY); localStorage.removeItem('xarts-safe'); }
  const fl = JSON.parse(localStorage.getItem(LEVEL_KEY) || 'null'); if (fl && Date.now() - fl.t < 14 * 864e5) FLOOR = fl.level;
  localStorage.removeItem('xarts-safe');                                // 舊版的安全模式旗標:不沿用(重新從裝置預設開始,真的當掉才降)
  const m = JSON.parse(localStorage.getItem('xarts-crash') || 'null'), used = +(localStorage.getItem('xarts-used') || 0);
  if (m && Date.now() - m.t < 864e5) { FLOOR = Math.min(5, Math.max(FLOOR, used + 1)); localStorage.setItem(LEVEL_KEY, JSON.stringify({ level: FLOOR, t: Date.now() })); CRASHED = JSON.parse(localStorage.getItem('xarts-trail') || '[]'); }
  localStorage.removeItem('xarts-crash');
} catch {}
const UA = navigator.userAgent, IS_MOBILE = /iphone|ipad|ipod|android/i.test(UA) || (/macintosh/i.test(UA) && navigator.maxTouchPoints > 1) || (matchMedia('(pointer: coarse)').matches && !matchMedia('(any-pointer: fine)').matches);
const IS_TABLET = IS_MOBILE && Math.min(screen.width, screen.height) >= 700;
let LEVEL = Math.max(IS_MOBILE ? 1 : 0, FLOOR);
if (/^[0-5]$/.test(P.get('level') || '')) LEVEL = +P.get('level');
const SAFE = LEVEL >= 3;
function detect() {
  const forced = new URLSearchParams(location.search).get('q');
  if (SAFE && !TIERS.includes(forced)) return { tier: 'low', why: `level ${LEVEL}`, gpu: '', ms: null };
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
// 每一級的設定(main.mjs / exterior.mjs / hall.mjs 讀這裡);warpN / tunSeg / tun2 / shake = 超空間跳躍的星線數、隧道細緻度、外層第二道隧道、鏡頭震動。lights:戰艦外觀真的打光的點光源(2 全部:航行燈 + 引擎、1 只有閃光燈 + 中間引擎、0 不打光)
const SETTINGS = {
  high:   { dprMax: 2,   bloom: true,  shadows: true,  shadowSize: 2048, planetOct: [6, 5], planetSeg: 256, mirror: true,  hallBloom: true,  warpN: 2600, tunSeg: 96, tun2: true,  shake: true,  lights: 2 },
  medium: { dprMax: 1.5, bloom: true,  shadows: true,  shadowSize: 1024, planetOct: [4, 4], planetSeg: 160, mirror: true,  hallBloom: true,  warpN: 1500, tunSeg: 64, tun2: false, shake: true,  lights: 1 },
  low:    { dprMax: 1,   bloom: false, shadows: false, shadowSize: 512,  planetOct: [3, 3], planetSeg: 96,  mirror: false, hallBloom: false, warpN: 650,  tunSeg: 28, tun2: false, shake: false, lights: 0 },
};
// 模型版本:手機、平板(iPhone / iPad / Android / 觸控為主的裝置)載 _m 小貼圖版(tools/blender/make_mobile.py 產生),電腦載原版。
//   原版大貼圖全部加起來 GPU 要 2.5GB,iPhone / iPad Safari 會直接當掉;小貼圖版約 1/4 ~ 1/8。網址加 ?assets=full|mobile 可以強制(測試用)
const MOBILE_ASSETS = (() => {
  const f = new URLSearchParams(location.search).get('assets'); if (f === 'full') return false; if (f === 'mobile') return true;
  if (LEVEL >= 1) return true;                                         // 手機以下(含當機後降級的電腦)都載小貼圖版
  const ua = navigator.userAgent;
  return /iphone|ipad|ipod|android/i.test(ua) || (/macintosh/i.test(ua) && navigator.maxTouchPoints > 1) || (matchMedia('(pointer: coarse)').matches && !matchMedia('(any-pointer: fine)').matches);
})();
Q.assets = MOBILE_ASSETS ? 'mobile' : 'full';
Q.tablet = IS_TABLET;
// 很舊的平板(啟動時的 GPU 跑分 > 6ms;M1 以後的 iPad 大約 1~2ms)→ 等級 2。不看 CPU 核心數(iPad 的 Safari 回報的不準)
Q.oldTablet = IS_TABLET && (Q.ms == null || Q.ms > 6);
if (Q.oldTablet && !/^[0-5]$/.test(P.get('level') || '')) LEVEL = Math.max(LEVEL, 2);
function applyLevel(lv) {                                               // 等級 → 各模組讀的旗標(之後降級也走這裡)
  Q.level = lv; Q.lean = lv >= 2; Q.lite = lv >= 3; Q.minimal = lv >= 4; Q.flat = lv >= 5; Q.safe = lv > (Q.oldTablet ? 2 : IS_MOBILE ? 1 : 0);   // lean:1x / 不開抗鋸齒 / 沒倒影;lite:房間一次一間
  try { localStorage.setItem('xarts-used', String(lv)); } catch {}
}
applyLevel(MOBILE_ASSETS ? Math.max(LEVEL, 1) : LEVEL);
// 讀取畫面(超空間)量到太慢 / 其他原因要降級:只影響還沒載的東西(大廳、通道、房間的模型是飛到戰艦之後才開始載)
Q.stepDown = (why) => { if (Q.level >= 5) return; applyLevel(Math.max(Q.level + 1, 3)); window.__crumb?.(`step down → level ${Q.level} (${why})`); console.info(`[quality] step down → level ${Q.level} (${why})`); };
export const asset = (u) => (MOBILE_ASSETS ? u.replace(/(\.glb|\.webp)(\?|$)/, '_m$1$2') : u);   // models/ship.glb?v=12 → models/ship_m.glb?v=12
export const quality = Q;
if (CRASHED) { showNote(`Level ${Q.level} · ${navigator.userAgent.match(/OS [\d_]+|Version\/[\d.]+/g)?.join(' ') || ''}\n上次停在(最後幾步):`, CRASHED.slice(-8)); }
if (new URLSearchParams(location.search).get('debug') === '1') dbgBox = showNote('debug', []);
window.__crumb(`start level ${Q.level} ${Q.tier} ${Q.assets}${Q.tablet ? (Q.oldTablet ? ' old-tablet' : ' tablet') : ''} bench ${Q.ms == null ? '-' : Q.ms.toFixed(1)}ms ${screen.width}x${screen.height}@${devicePixelRatio}`);
export const Q_SET = Q.lean ? { ...SETTINGS[Q.tier], dprMax: 1, mirror: false } : SETTINGS[Q.tier];   // 平板也不做地板即時倒影(整個大廳要多畫一次)
console.info(`[quality] level ${Q.level} ${Q.tier} (${Q.why}) assets=${Q.assets} gpu="${Q.gpu}" bench=${Q.ms == null ? '-' : Q.ms.toFixed(1) + 'ms'}`);
