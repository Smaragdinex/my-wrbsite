// 2026-11-17 水面升級（使用者看了 3ditions 的溪流、海岸：「這水 這石頭 完全另一個等級」→「把水都升級看看」）
// 全園的水共用的兩個效果（GLSL 字串，插進各支水面 shader）：
//   wfxGlitter：陽光在細碎水波上的閃光——水面切成 5～7 cm 一格，每格一小片會晃的「微小水面」，
//               剛好把太陽反射進眼睛的那幾格亮成一顆星（HDR），白天整片水面一閃一閃，不再只在黃昏
//   wfxCaustic：焦散光網（陽光透過水波在水底聚成的亮線），兩層會流動的網疊起來
// 遠處的格子比一個像素還小，會整片閃（鋸齒）→ 照距離放大格子、再淡掉
export const WATER_FX = /* glsl */ `
  float wfxH(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float wfxN(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(wfxH(i), wfxH(i + vec2(1, 0)), f.x), mix(wfxH(i + vec2(0, 1)), wfxH(i + vec2(1, 1)), f.x), f.y); }
  float wfxGlitterL(vec2 q, vec3 Vd, vec3 sun, float t, float cell, float spread) {
    vec2 p = q / cell, i = floor(p), f = fract(p);
    float h = wfxH(i), h2 = wfxH(i + 7.13), h3 = wfxH(i + 3.71);
    vec2 tilt = (vec2(h, h2) - 0.5) * spread + 0.06 * vec2(sin(t * (2.2 + 2.0 * h3) + h * 30.0), cos(t * (1.9 + 1.7 * h) + h2 * 30.0));
    vec3 n = normalize(vec3(tilt.x, 1.0, tilt.y));
    float s = max(dot(reflect(-sun, n), Vd), 0.0);
    vec2 c = vec2(0.25 + 0.5 * h3, 0.25 + 0.5 * h) - f;
    float spot = smoothstep(0.32, 0.0, length(c));
    return pow(s, 900.0) * spot;
  }
  float wfxGlitter(vec3 W, vec3 Vd, vec3 sun, float t) {
    float dist = length(cameraPosition - W);
    float k = 1.0 + dist / 22.0;                                // 遠處格子放大（不然比像素小、整片閃）
    float g = wfxGlitterL(W.xz, Vd, sun, t, 0.055 * k, 0.55) + 0.7 * wfxGlitterL(W.xz + 3.7, Vd, sun, t * 1.3, 0.09 * k, 0.4);
    return g * smoothstep(-0.02, 0.08, sun.y) * (1.0 - smoothstep(60.0, 140.0, dist));
  }
  float wfxCaustic(vec2 p, float t) {
    vec2 q = p * 2.6;
    float c1 = wfxN(q + t * vec2(0.32, 0.21)), c2 = wfxN(q * 1.37 + vec2(5.2, 1.3) - t * vec2(0.26, 0.34));
    float c3 = wfxN(q * 2.3 + vec2(2.1, 7.7) + t * vec2(0.41, -0.3)), c4 = wfxN(q * 1.9 + vec2(9.4, 3.3) - t * vec2(0.2, 0.37));
    return pow(clamp(1.0 - abs(c1 - c2) * 2.4, 0.0, 1.0), 6.0) + 0.7 * pow(clamp(1.0 - abs(c3 - c4) * 2.4, 0.0, 1.0), 8.0);
  }
`
