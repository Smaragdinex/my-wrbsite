// 星際戰艦外觀(使用者參考圖:白色太空城艦):Blender 建模 + 烘焙貼圖(tools/blender/ship_build.py、ship_export.py → models/ship.glb)
//   白色箭頭艦身、中央玻璃穹頂花園、貫穿的高塔、艦尾半圈弧形環臂、艦首大環、上千個小窗;旁邊幾艘護航小艦慢慢飄。
//   機庫口(兩側 x = ±6.6、z = -3 ~ 9)的門 / 發光框 / 點擊範圍還是在這裡蓋,讓「點機庫口 → 開門飛進去」照舊。
//   底下一顆很大的星球(shader 畫的海洋、大陸、雲、大氣光暈、夜面城市燈),從任何角度看都是在軌道上。艦首朝 -z、艦尾 +z。
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { glow, rand } from './kit.mjs?v=3';
import { asset } from './quality.mjs?v=4';

// 機庫門的白色裝甲板貼圖(大小不一的長方形板塊 + 接縫)
function plateTex(seed = 5) {
  const N = 512, r = rand(seed), c = document.createElement('canvas'); c.width = c.height = N; const g = c.getContext('2d');
  g.fillStyle = '#e4e4e2'; g.fillRect(0, 0, N, N);
  for (let i = 0; i < 90; i++) {
    const w = 40 + r() * 160, h = 30 + r() * 90, x = r() * N, y = r() * N, v = 214 + r() * 30 | 0;
    g.fillStyle = `rgb(${v},${v},${v - 2})`; g.fillRect(x, y, w, h); g.strokeStyle = 'rgba(40,44,52,.35)'; g.lineWidth = 2; g.strokeRect(x, y, w, h);
  }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.repeat.set(1 / 6, 1 / 6); return t;
}
function glareTex() {                                                   // 燈的眩光:很亮的小核心 + 平方反比衰減的柔光(像相機拍到的燈)
  const N = 256, c = document.createElement('canvas'); c.width = c.height = N; const g = c.getContext('2d'), im = g.createImageData(N, N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const r = Math.hypot(x - N / 2 + .5, y - N / 2 + .5) / (N / 2), a = r >= 1 ? 0 : Math.min(1, 1 / (1 + (r * 14) ** 2) * 1.4 + .25 * (1 - r) ** 3) * (1 - r) ** 1.5;
    const i = (y * N + x) * 4; im.data[i] = im.data[i + 1] = im.data[i + 2] = 255; im.data[i + 3] = a * 255; }
  g.putImageData(im, 0, 0); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function starTex() {                                                    // 閃光燈亮的那一下:水平 / 垂直兩道細長的光芒 + 淡淡的斜向光芒
  const N = 512, c = document.createElement('canvas'); c.width = c.height = N; const g = c.getContext('2d'), im = g.createImageData(N, N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const dx = (x - N / 2 + .5) / (N / 2), dy = (y - N / 2 + .5) / (N / 2), r = Math.hypot(dx, dy);
    const ray = (u, v) => Math.exp(-(v * v) / .00012) * Math.max(0, 1 - Math.abs(u)) ** 2.2;
    let a = ray(dx, dy) + ray(dy, dx) * .8 + .35 * (ray((dx + dy) * .7071, (dx - dy) * .7071) + ray((dx - dy) * .7071, (dx + dy) * .7071)) * .5 + Math.exp(-r * r / .002);
    a = Math.min(1, a) * (r < 1 ? 1 : 0); const i = (y * N + x) * 4; im.data[i] = im.data[i + 1] = im.data[i + 2] = 255; im.data[i + 3] = a * 255; }
  g.putImageData(im, 0, 0); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
// 引擎噴焰:沿長度 aT(0 = 噴口、1 = 尾端)上色 —— 白熱的核心 → 藍 → 紫,邊緣依視角變淡(菲涅耳),加上往後流的條紋雜訊、靠近噴口的「震波鑽石」亮帶
const plumeVS = `uniform float uLen; varying float aT; varying vec3 vN, vV; varying vec2 vA;
  void main(){ aT = clamp(position.y / uLen, 0., 1.); vA = vec2(atan(position.x, position.z), aT);
    vec4 wp = modelMatrix * vec4(position, 1.); vN = normalize(mat3(modelMatrix) * normal); vV = normalize(cameraPosition - wp.xyz); gl_Position = projectionMatrix * viewMatrix * wp; }`;
const plumeFS = `uniform float uTime, uK, uCore, uSeed; uniform vec3 uHot, uMid, uTail; varying float aT; varying vec3 vN, vV; varying vec2 vA;
  float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float n2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f); return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + 1.), f.x), f.y); }
  void main(){
    float fres = mix(.3, 1., pow(clamp(abs(dot(normalize(vN), normalize(vV))), 0., 1.), 2.2));   // 火焰中間最亮、邊緣淡掉;從正後方看(沿噴焰方向)也還看得到
    float streak = n2(vec2(vA.x * 5. + uSeed, aT * 6. - uTime * 9.)) * .6 + n2(vec2(vA.x * 11. + uSeed * 3., aT * 14. - uTime * 15.)) * .4;
    float diamonds = (.5 + .5 * cos(aT * 38. - uTime * 2.)) * exp(-aT * 5.);                   // 震波鑽石:靠近噴口一圈圈的亮帶
    float fade = pow(clamp(1. - aT, 0., 1.), 1.7) * smoothstep(0., .04, aT + .02);
    vec3 col = mix(uHot, uMid, smoothstep(.0, .35, aT)); col = mix(col, uTail, smoothstep(.3, 1., aT));
    float a = fade * fres * (.55 + .45 * streak) * uK * (1. + diamonds * .8) * uCore;
    gl_FragColor = vec4(col * a, a);
  }`;
function plume(rr, len, core, seed, cols) {                              // 一層噴焰(圓錐,沿 +y 長出去;外面再轉方向)
  const g = new THREE.CylinderGeometry(rr * (core ? .18 : .3), rr * (core ? .55 : 1), len, 48, 24, true); g.translate(0, len / 2, 0);
  const u = { uTime: { value: 0 }, uK: { value: 1 }, uCore: { value: core ? 2.4 : 1.5 }, uSeed: { value: seed }, uLen: { value: len },
    uHot: { value: new THREE.Color(cols[0]) }, uMid: { value: new THREE.Color(cols[1]) }, uTail: { value: new THREE.Color(cols[2]) } };
  const m = new THREE.ShaderMaterial({ uniforms: u, vertexShader: plumeVS, fragmentShader: plumeFS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false });
  const mesh = new THREE.Mesh(g, m); mesh.frustumCulled = false; mesh.renderOrder = 3; return mesh;
}

// 窗戶裡的「假 3D 房間」(interior mapping,3A 遊戲做城市窗戶的作法):每格窗後面用光線算出一個盒子房間 ——
//   天花板(中間一條燈板)、地板、左右牆、後牆,牆角陰影;中間一層家具 / 人影;有的拉了百葉。鏡頭一動房間有視差。
//   每間亮度(全暗 / 半亮 / 亮)、色溫(暖黃 / 中性 / 螢幕冷藍)用格子編號亂數決定。
//   facade:船身 / 環臂的小方窗(窗框來自烘好的底色貼圖)。gallery:環臂長廊大窗(窗框在這裡算)
const IM_GLSL = `
uniform float imK; varying vec3 vImP, vImN, vImC;
float imH(vec2 c, float s){ return fract(sin(dot(vec3(c, s), vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
vec3 imRoom(vec2 id, vec2 f, vec3 d, vec3 S){
  float r = imH(id, 1.), r2 = imH(id, 2.), r3 = imH(id, 3.), r4 = imH(id, 4.), r5 = imH(id, 5.);
  float lvl = r < .2 ? .025 : (r < .48 ? .28 : .6 + .45 * r);
  vec3 col = r2 < .55 ? vec3(1., .64, .34) : (r2 < .86 ? vec3(1., .85, .64) : vec3(.6, .75, 1.));
  vec3 p = vec3(f * S.xy, 0.);
  vec3 tt = (step(0., d) * S - p) / d;
  float t = min(min(tt.x, tt.y), tt.z);
  vec3 q = (p + d * t) / S, e = min(q, 1. - q), c; float ed;
  if (t == tt.z) { c = col * (.36 + .5 * q.y); ed = min(e.x, e.y); }
  else if (t == tt.x) { c = col * (.26 + .4 * q.y) * (.7 + .3 * q.z); ed = min(e.y, e.z); }
  else if (d.y > 0.) { c = col * (.6 + 1.5 * smoothstep(.2, .0, abs(q.x - .5)) * smoothstep(.12, .45, q.z) * smoothstep(.96, .72, q.z)); ed = min(e.x, e.z); }
  else { c = col * .13 * (.45 + .55 * q.z); ed = min(e.x, e.z); }
  c *= .5 + .5 * smoothstep(0., .14, ed);
  float tm = S.z * (.42 + .25 * r4) / d.z;
  if (tm < t && r3 > .42) {
    vec2 m = (p.xy + d.xy * tm) / S.xy; float x0 = .08 + .5 * r5, px = x0 + .42 + .1 * r4;
    bool sofa = m.x > x0 && m.x < x0 + .36 && (m.y < .14 || (m.y < .24 && m.x < x0 + .06));   /* 矮沙發(有扶手) */
    bool person = r3 > .72 && ((abs(m.x - px) < .05 && m.y < .5) || (length(vec2((m.x - px) * 1.4, m.y - .58)) < .07));
    if (sofa || person) c = col * .045;
  }
  if (r4 > .76 && f.y > 1. - .75 * r5) c = mix(c, col * .5, step(.5, fract(f.y * S.y * 22.)) * .85);
  return c * lvl;
}`;
function interiorWindows(mt, kind) {                                    // kind: 'facade' | 'gallery'
  mt.customProgramCacheKey = () => 'im_' + kind;
  mt.onBeforeCompile = (sh) => {
    sh.uniforms.imK = { value: kind === 'gallery' ? 1.15 : 1.5 };
    sh.vertexShader = 'varying vec3 vImP, vImN, vImC;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vImP = position; vImN = normal; vImC = (inverse(modelMatrix) * vec4(cameraPosition, 1.)).xyz;');
    sh.fragmentShader = IM_GLSL + '\n' + sh.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
    {
      vec3 N = normalize(vImN), P = vImP; vec2 rv = vec2(P.x, P.z - 17.); float rad = length(rv);
      bool arm = rad > 12.5 && rad < 26. && abs(dot(normalize(rv), normalize(N.xz + 1e-5))) > .85;
      vec3 T; float u;
      if (arm) { u = atan(17. - P.z, P.x) * rad; T = vec3(-(17. - P.z) / rad, 0., -P.x / rad); } else { u = -P.z; T = vec3(0., 0., -1.); }
      vec3 dv = normalize(P - vImC), d = vec3(dot(dv, T), dv.y, dot(dv, -N));
      ${kind === 'gallery' ? `
      bool outer = rad > 18.5; float H = outer ? 1.024 : .768, W = .9, fv = (P.y - (outer ? -.656 : .508)) / H, uu = u / W, fu = fract(uu);
      vec2 id = vec2(floor(uu), outer ? 1. : 2.);
      float glass = step(.035, fu) * step(fu, .965) * step(.07, fv) * step(fv, .93);
      vec2 gf = vec2((fu - .035) / .93, (fv - .07) / .86); vec3 S = vec3(W * .93, H * .86, .95);` : `
      float H = .36, W = .5, row = floor(P.y / H), fv = fract(P.y / H), uu = u / W + row * .5, fu = fract(uu);
      vec2 id = vec2(floor(uu), row + (arm ? 0. : (P.x > 0. ? 300. : 600.)));
      float glass = 1. - smoothstep(.03, .09, dot(diffuseColor.rgb, vec3(.3333)));
      vec2 gf = vec2((fu - .07) / .86, (fv - .12) / .76); vec3 S = vec3(W * .86, H * .76, .42);`}
      totalEmissiveRadiance = (d.z > .02 && glass > 0.) ? imRoom(id, clamp(gf, 0., 1.), d, S) * glass * imK : vec3(0.);
    }`);
  };
}

// ---------- 大星球:3D simplex 雜訊(Ashima Arts, MIT)做大陸 / 雲,自己算日照(不吃船的影子)----------
const NOISE = `
vec3 mod289(vec3 x){return x-floor(x*(1./289.))*289.;} vec4 mod289(vec4 x){return x-floor(x*(1./289.))*289.;}
vec4 permute(vec4 x){return mod289(((x*34.)+1.)*x);} vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-.85373472095314*r;}
float snoise(vec3 v){ const vec2 C=vec2(1./6.,1./3.); const vec4 D=vec4(0.,.5,1.,2.);
  vec3 i=floor(v+dot(v,C.yyy)); vec3 x0=v-i+dot(i,C.xxx); vec3 g=step(x0.yzx,x0.xyz); vec3 l=1.-g; vec3 i1=min(g.xyz,l.zxy); vec3 i2=max(g.xyz,l.zxy);
  vec3 x1=x0-i1+C.xxx; vec3 x2=x0-i2+C.yyy; vec3 x3=x0-D.yyy; i=mod289(i);
  vec4 p=permute(permute(permute(i.z+vec4(0.,i1.z,i2.z,1.))+i.y+vec4(0.,i1.y,i2.y,1.))+i.x+vec4(0.,i1.x,i2.x,1.));
  float n_=.142857142857; vec3 ns=n_*D.wyz-D.xzx; vec4 j=p-49.*floor(p*ns.z*ns.z); vec4 x_=floor(j*ns.z); vec4 y_=floor(j-7.*x_);
  vec4 x=x_*ns.x+ns.yyyy; vec4 y=y_*ns.x+ns.yyyy; vec4 h=1.-abs(x)-abs(y); vec4 b0=vec4(x.xy,y.xy); vec4 b1=vec4(x.zw,y.zw);
  vec4 s0=floor(b0)*2.+1.; vec4 s1=floor(b1)*2.+1.; vec4 sh=-step(h,vec4(0.)); vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy; vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
  vec3 p0=vec3(a0.xy,h.x); vec3 p1=vec3(a0.zw,h.y); vec3 p2=vec3(a1.xy,h.z); vec3 p3=vec3(a1.zw,h.w);
  vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3))); p0*=norm.x; p1*=norm.y; p2*=norm.z; p3*=norm.w;
  vec4 m=max(.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.); m=m*m;
  return 42.*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3))); }
float fbm(vec3 p, int oct){ float s=0., a=.5; for(int i=0;i<8;i++){ if(i>=oct) break; s+=a*snoise(p); p*=2.03; a*=.5; } return s; }`;
function createPlanet(root, sunDir, Q = {}) {
  const [O1, O2] = Q.planetOct || [6, 5], SEG = Q.planetSeg || 256;   // 畫質分級:雜訊層數、球的細分
  const R = 2400, g = new THREE.Group(); g.position.set(0, -2650, 0); root.add(g);
  const vs = `varying vec3 vObj; varying vec3 vN; varying vec3 vW;
    void main(){ vObj = normalize(position); vN = normalize(mat3(modelMatrix) * normal); vec4 w = modelMatrix * vec4(position, 1.); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
  const surface = new THREE.ShaderMaterial({
    uniforms: { uSun: { value: sunDir } },
    vertexShader: vs,
    fragmentShader: NOISE + `
      uniform vec3 uSun; varying vec3 vObj; varying vec3 vN; varying vec3 vW;
      void main(){
        vec3 p = vObj * 4.2;
        float h = fbm(p + vec3(3.1, 7.7, 1.3), ${O1}) + .12 * fbm(p * 6.0, 2);
        float land = smoothstep(.02, .06, h);
        vec3 deep = vec3(.012,.07,.2), shallow = vec3(.05,.27,.46), sand = vec3(.72,.66,.47), green = vec3(.2,.32,.13), dry = vec3(.4,.33,.21), rock = vec3(.66,.63,.57);
        vec3 ocean = mix(deep, shallow, smoothstep(-.25, .03, h));
        vec3 ground = mix(sand, green, smoothstep(.06, .13, h)); ground = mix(ground, dry, smoothstep(.2, .32, h + .1 * snoise(p * 3.))); ground = mix(ground, rock, smoothstep(.36, .5, h));
        vec3 col = mix(ocean, ground, land);
        col = mix(col, vec3(.9,.94,1.), smoothstep(.8, .88, abs(vObj.y)));                 // 極地冰帽
        vec3 N = normalize(vN), V = normalize(cameraPosition - vW);
        float nd = dot(N, uSun), lit = clamp((nd + .08) / .98, 0., 1.);
        vec3 c = col * lit;
        float spec = pow(max(dot(reflect(-uSun, N), V), 0.), 60.) * (1. - land) * lit;     // 海面的太陽反光
        c += vec3(1., .93, .8) * spec * .55;
        float night = smoothstep(-.02, -.2, nd);
        float city = smoothstep(.55, .75, snoise(vObj * 90.) * .5 + .5) * smoothstep(.08, .14, h) * night;
        c += vec3(1., .66, .32) * city * 1.4;
        float fr = pow(clamp(1. - dot(N, V), 0., 1.), 6.);                                       // 很淡的一點邊緣藍(主要的大氣交給外面那層 atmo)
        c = mix(c, vec3(.3,.55,.95) * (.1 + lit * .7), fr * .12);
        gl_FragColor = vec4(c, 1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }` });
  const clouds = new THREE.ShaderMaterial({
    uniforms: { uSun: { value: sunDir }, uT: { value: 0 } }, transparent: true, depthWrite: false,
    vertexShader: vs,
    fragmentShader: NOISE + `
      uniform vec3 uSun; uniform float uT; varying vec3 vObj; varying vec3 vN; varying vec3 vW;
      void main(){
        vec3 p = vObj * 7.5 + vec3(uT * .01, 0., uT * .006);
        float d = fbm(p + fbm(p * .7, 2) * .6, ${O2});
        float a = smoothstep(.2, .45, d);
        a *= smoothstep(.03, .25, dot(normalize(vN), normalize(cameraPosition - vW)));     // 越接近地平線(斜著看)雲越淡,不然會疊成一大片白霧
        float lit = clamp((dot(normalize(vN), uSun) + .1) / .9, 0., 1.);
        gl_FragColor = vec4(vec3(.96, .97, 1.) * (.06 + lit * .9), a * .85);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }` });
  // 大氣:沿著視線算穿過一層薄薄的空氣有多少 → 天邊一條細細的亮藍光,往下看的地方只有很淡、透明的霧(不是一整圈厚厚的藍)
  const atmo = new THREE.ShaderMaterial({
    uniforms: { uSun: { value: sunDir }, uC: { value: new THREE.Vector3() }, uR: { value: R } }, transparent: true, depthWrite: false,
    vertexShader: vs,
    fragmentShader: `uniform vec3 uSun; uniform vec3 uC; uniform float uR; varying vec3 vObj; varying vec3 vN; varying vec3 vW;
      void main(){
        vec3 d = normalize(vW - cameraPosition), oc = uC - cameraPosition;
        float tc = dot(oc, d), b = sqrt(max(dot(oc, oc) - tc * tc, 0.));             // 視線離星球中心最近的距離
        float H = 14.;                                                            // 大氣厚度的尺度(星球半徑 2400,很薄)
        vec3 blue = vec3(.33, .6, 1.), col; float a;
        if (b > uR) {                                                             // 視線從地平線上方掠過:最近點越貼地越亮
          vec3 pc = cameraPosition + d * tc, n = normalize(pc - uC);
          float day = clamp(dot(n, uSun) * .8 + .45, .08, 1.);
          float dens = exp(-(b - uR) / H);
          col = mix(blue, vec3(.75, .88, 1.), dens * .6) * day; a = clamp(dens * 1.15, 0., 1.) * .85;
        } else {                                                                  // 視線打到地面:越斜霧越多,但保持透明
          float th = tc - sqrt(uR * uR - b * b); vec3 hp = cameraPosition + d * th, n = normalize(hp - uC);
          float mu = max(dot(n, -d), 0.), day = clamp(dot(n, uSun) * .8 + .4, .06, 1.);
          col = blue * day; a = exp(-mu * 9.) * .38;
        }
        gl_FragColor = vec4(col, a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }` });
  const geo = new THREE.SphereGeometry(R, SEG, SEG / 2);
  const ground = new THREE.Mesh(geo, surface); g.add(ground);
  const cl = new THREE.Mesh(new THREE.SphereGeometry(R * 1.004, SEG * .75, SEG * .375), clouds); g.add(cl);
  const at = new THREE.Mesh(new THREE.SphereGeometry(R * 1.03, 160, 80), atmo); g.add(at); at.renderOrder = 2;
  g.rotation.set(1.45, 0, .3);                                                   // 轉一下:從軌道上看下去是赤道附近(不是一整片極地冰帽)
  return { group: g, update(t) { g.getWorldPosition(atmo.uniforms.uC.value); ground.rotation.y = t * .0025; cl.rotation.y = t * .0032; clouds.uniforms.uT.value = t; } };
}

export function createExterior(scene, Q = {}) {
  const root = new THREE.Group(); scene.add(root);
  const ship = new THREE.Group(); root.add(ship); ship.visible = false;           // 模型載入完才顯示(那時候飛船還在超空間裡,看不到空檔)
  const r = rand(7), BLUE = 0x5fb4ff, ORANGE = 0xffb25e;
  const plate = plateTex();
  const M = { light: new THREE.MeshStandardMaterial({ color: 0xe2e3e6, map: plate, roughness: .35, metalness: .25, envMapIntensity: .8 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x2c3038, roughness: .6, metalness: .4 }) };
  const box = (w, h, d, m, x, y, z) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); b.castShadow = true; b.receiveShadow = true; ship.add(b); return b; };

  // 1) Blender 模型
  const gl_ = glareTex(), st_ = starTex(), LIGHTS = Q.lights ?? 2;   // 眩光 / 四芒星貼圖,LIGHTS:依顯示卡分級放幾盞真的點光源
  const escorts = [], airlock = [], _ev = new THREE.Vector3(), clipU = { value: new THREE.Matrix4() }, gapU = { value: 0 };
  const portal = new THREE.Mesh(new THREE.CircleGeometry(1.75, 64), new THREE.MeshBasicMaterial({ color: 0xfff4e4 }));
  let progress = 0, failed = false, readyFn; const ready = new Promise((ok) => { readyFn = ok; });   // 載入進度(讀條用)
  const gl = new GLTFLoader(), draco = new DRACOLoader(); draco.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/'); gl.setDRACOLoader(draco);
  const lightMapP = new Promise((ok) => new THREE.TextureLoader().load(asset('/assets/starship/models/ship_light.webp?v=2'), (t) => { t.flipY = false; t.colorSpace = THREE.SRGBColorSpace; t.channel = 0; ok(t); }, undefined, () => ok(null)));   // 燈具打在船殼上的光照(Blender 烘的):燈旁邊亮、越遠越暗
  const LIGHT_K = .5 * Math.PI / .1593;                                   // 烘的時候除過的 scale(ship_light.json)× 亮度
  gl.load(asset('/assets/starship/models/ship.glb?v=12'), (gltf) => lightMapP.then((lightMap) => {
    const m = gltf.scene;
    m.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = true; o.receiveShadow = true;
      const mt = o.material, n = mt.name || '';
      if (n === 'ship_glass') { o.material = new THREE.MeshPhysicalMaterial({ color: 0xdcecff, roughness: .05, metalness: 0, transparent: true, opacity: .2, envMapIntensity: 1.6, depthWrite: false }); o.castShadow = false; }
      else if (n === 'ship_vault') { o.material = new THREE.MeshPhysicalMaterial({ color: 0xbfdcff, roughness: .04, metalness: 0, clearcoat: 1, transparent: true, opacity: .16, envMapIntensity: .9, emissive: 0x1d3a5c, emissiveIntensity: .12, side: THREE.DoubleSide, depthWrite: false }); o.castShadow = false; o.renderOrder = 2; }   // 環臂花園的薄玻璃拱頂:看得出一層玻璃,樹還是透得過來
      else if (n === 'ship_viewglass') { o.material = new THREE.MeshPhysicalMaterial({ color: 0xdcecff, roughness: .05, metalness: 0, transparent: true, opacity: .1, envMapIntensity: .45, depthWrite: false }); o.castShadow = false; }   // 觀景窗玻璃:反光壓低,看得到裡面
      else if (/^ship_lounge/.test(n)) { mt.emissive.set(0xffc690); mt.emissiveIntensity = { ship_lounge: .24, ship_lounge_dim: .1, ship_lounge_dark: .025 }[n] ?? .1; mt.color.set(0x2a2018); }   // 觀景窗裡的內牆:一格亮、一格半亮、一格暗
      else if (/^ship_facade/.test(n)) { mt.emissive.set(0xffffff); mt.emissiveMap = null; mt.envMapIntensity = 1.0; interiorWindows(mt, 'facade'); }   /* 匯出後叫 ship_facade.001;窗框用烘好的底色貼圖,窗裡面的房間用 shader 算 */
      else if (/^ship_led/.test(n)) { o.castShadow = false; mt.emissiveIntensity = /cool/.test(n) ? 1.7 : 2.4; }   /* 頂部燈具的發光面 */
      else if (/^ship_gallery/.test(n)) { mt.emissive.set(0xffffff); mt.emissiveMap = null; mt.envMapIntensity = .8; o.castShadow = false; interiorWindows(mt, 'gallery'); }   /* 環臂長廊窗:烘好的室內(天花燈、牆、剪影、窗框) */
      else if (/window|goldglow|blueglow/.test(n)) { o.castShadow = false; mt.emissiveIntensity = Math.min(mt.emissiveIntensity, /blue/.test(n) ? 1.6 : /_dark/.test(n) ? 1 : /_dim/.test(n) ? .8 : 2.05); }   // 燈條 / 窗帶亮度上限(比之前暗約 35%,而且分亮、半亮、暗三種)
      else if (n === 'ship_hull') { hullLight(mt); mt.envMapIntensity = .42; }
      else if (mt.isMeshStandardMaterial) mt.envMapIntensity = .42;   // 環境反光少一點,背光面才夠暗
    });
    const bay = m.getObjectByName('ship_bay');
    if (bay) bay.traverse((o) => { if (o.isMesh) { const src = o.material; o.material = new THREE.MeshBasicMaterial({ map: src.map, toneMapped: false }); o.material.color.setScalar(1.22); src.dispose(); o.castShadow = false; o.receiveShadow = false; } });   // 光影烘在貼圖裡(機庫裡的燈)
    // 氣閘門後面:一個「窗」,畫的是通道裡的畫面(main.mjs 每幀從對應的位置渲染通道),門一開就看得到通道的深度
    portal.position.set(0, .35, -6.995); ship.add(portal);
    for (const n of ['airlock_L', 'airlock_R']) { const a = m.getObjectByName(n); if (a) airlock.push({ o: a, x: a.position.x, s: n.endsWith('L') ? -1 : 1 }); }
    // 氣閘門:門板不動,從中間開一道直的縫往兩邊變寬(像兩片門收進圓形門框);圓框外面的部分一律不畫
    for (const { o } of airlock) o.traverse((x) => { if (!x.isMesh) return;
      x.material = x.material.clone();
      x.material.onBeforeCompile = (sh) => { sh.uniforms.uInv = clipU; sh.uniforms.uGap = gapU;
        sh.vertexShader = 'uniform mat4 uInv; varying vec3 vLp;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvLp = (uInv * modelMatrix * vec4(transformed, 1.0)).xyz;');
        sh.fragmentShader = 'uniform float uGap; varying vec3 vLp;\n' + sh.fragmentShader.replace('void main() {', 'void main() {\n  if (length(vLp.xy - vec2(0., .35)) > 1.56 || abs(vLp.x) < uGap) discard;'); }; });
    // 護航小艦:從戰艦上拿下來,各自在戰艦外圍的大橢圓軌道上飛(戰艦轉的時候它們不跟著轉);機頭轉到朝 +Z,再用 lookAt 對準飛行方向
    const YAW = [.3, -.4, .9, .1, .5], ORB = [[52, 6, .05], [58, -10, -.04], [64, 14, .035], [55, -15, -.055], [72, 2, .03]];
    for (const o of [...m.children]) {
      const k = /^escort_(\d+)$/.exec(o.name)?.[1]; if (k == null) continue;
      const pivot = new THREE.Group(); root.add(pivot); m.remove(o); pivot.add(o);
      o.position.set(0, 0, 0); o.rotation.set(0, -(YAW[k] + Math.PI), 0);
      const [a, h, sp] = ORB[k], th0 = r() * Math.PI * 2;
      const e = { pivot, a, b: a * 1.3, h, sp, th0, ph: r() * 6, flames: [] };
      o.traverse((x) => {                                                      // 兩具引擎艙的藍色噴口:依 x 正負分成左右兩顆,各接一束小噴焰 + 眩光
        if (!x.isMesh || x.material.name !== 'ship_blueglow') return;
        x.material = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x9fd6ff).multiplyScalar(2.2), toneMapped: false });
        const pos = x.geometry.attributes.position, sides = { L: [], R: [] };
        for (let i = 0; i < pos.count; i++) (pos.getX(i) < 0 ? sides.L : sides.R).push(i);
        for (const ids of Object.values(sides)) {
          if (!ids.length) continue;
          let cx = 0, cy = 0, zmax = -1e9, rmax = 0; for (const i of ids) { cx += pos.getX(i); cy += pos.getY(i); zmax = Math.max(zmax, pos.getZ(i)); } cx /= ids.length; cy /= ids.length;
          for (const i of ids) rmax = Math.max(rmax, Math.hypot(pos.getX(i) - cx, pos.getY(i) - cy));
          const g = new THREE.Group(); g.position.set(cx, cy, zmax + .02); g.rotation.x = Math.PI / 2; x.add(g);
          const pl = plume(rmax, rmax * 6, false, r() * 9, ['#eaf6ff', '#5aa8ff', '#4a3cff']); pl.material.uniforms.uCore.value = 1.3; g.add(pl);
          const gs = new THREE.Sprite(new THREE.SpriteMaterial({ map: gl_, color: new THREE.Color(0x8fcfff).multiplyScalar(1.4), transparent: true, opacity: .8, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
          gs.scale.setScalar(rmax * 5); gs.position.set(cx, cy, zmax + .15); x.add(gs);
          e.flames.push(pl);
        }
      });
      escorts.push(e);
    }
    radars = ['radar_0', 'radar_1'].map((n) => m.getObjectByName(n)).filter(Boolean);   // 甲板上兩座雷達會轉的頭
    m.traverse((o) => { if (o.isMesh && o.material.name === 'ship_radarled') radarLed = o.material; });
    ship.add(m); ship.visible = true; loaded = true; progress = 1; readyFn();
    function hullLight(mt) { if (lightMap) { mt.lightMap = lightMap; mt.lightMapIntensity = LIGHT_K; mt.needsUpdate = true; } }
  }), (x) => { if (x.total) progress = x.loaded / x.total; }, (e) => { console.warn('[exterior] 戰艦模型載入失敗', e); failed = true; window.__siteError = true; readyFn(); });

  // 2) 機庫口(兩側):暖光內部 + 柱子 + 欄杆 + 發光框 + 兩片會滑開的大門 + 隱形點擊範圍
  const hangarGlow = glow(0x7fd0ff, 1.5), hangarHits = [], hangarDoors = [], hangarSeam = glow(0xffe2bc, 2.6);
  for (const s of [-1, 1]) {
    for (const [y, z, h, d] of [[2.4, 3, .06, 13.3], [-1.8, 3, .06, 13.3], [.3, -3.64, 4.2, .06], [.3, 9.64, 4.2, .06]]) {   // 開口外緣一圈細的藍色燈框(貼著船殼)
      const e = new THREE.Mesh(new THREE.BoxGeometry(.04, h, d), hangarGlow); e.position.set(s * 6.62, y, z); ship.add(e);
    }
    const hit = new THREE.Mesh(new THREE.BoxGeometry(2.2, 6, 14), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })); hit.position.set(s * 7, .3, 3); ship.add(hit); hangarHits.push(hit);
    const leaves = [-1, 1].map((d) => {
      const g = new THREE.Group(); g.position.set(s * 6.46, .3, 3); ship.add(g);          // 門板縮在開口裡面一點,打開時滑進船殼(看不到)
      const pnl = new THREE.Mesh(new THREE.BoxGeometry(.1, 4.1, 6.6), M.light); pnl.position.z = d * 3.3; pnl.castShadow = true; g.add(pnl);
      const seam = new THREE.Mesh(new THREE.BoxGeometry(.03, 3.9, .06), hangarSeam); seam.position.set(s * .07, 0, d * .05); g.add(seam);
      const band = new THREE.Mesh(new THREE.BoxGeometry(.03, .08, 5.9), glow(0x7fd0ff, 2.4)); band.position.set(s * .07, -.9, d * 3.15); g.add(band);
      for (const y of [1.3, .2]) { const rib = new THREE.Mesh(new THREE.BoxGeometry(.05, .12, 5.6), M.dark); rib.position.set(s * .07, y, d * 3.15); g.add(rib); }
      return { g, d };
    });
    hangarDoors.push(...leaves);
  }

  // 3) 艦尾三顆引擎的藍色噴焰(噴口朝外太空,後面沒有建築)
  const flames = [];
  // 引擎在外環臂底下(tools/blender/ship_build.py 印出的 ENGINES:Blender (x, 噴口 y, z, 大小) → 這裡 (x, z, -y))
  const ENG_COLS = ['#f4fbff', '#5aa8ff', '#5b3cff'];
  [[-5.274, -4.047, 40.481, .807], [0, -4.228, 41.2, .935], [5.274, -4.047, 40.481, .807]].forEach(([x, y, nz0, s], k) => {   // 貼在外環臂下緣(環臂最後面是觀景窗)
    const big = s / .85, nz = nz0 + .05, rr = .78 * s, g = new THREE.Group(); g.position.set(x, y, nz); g.rotation.x = Math.PI / 2; ship.add(g);   // +y → 朝船尾(+z);噴焰只比噴嘴中間那圈發光面大一點
    const outer = plume(rr, rr * 5.2, false, k * 3.1, ENG_COLS), core = plume(rr, rr * 2.6, true, k * 5.7, ['#ffffff', '#cfe8ff', '#5aa8ff']); g.add(outer, core);
    outer.material.uniforms.uCore.value = 1.05;                           // 外圈淡、中心亮
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: gl_, color: new THREE.Color(0x8fcfff).multiplyScalar(1.6), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
    halo.scale.setScalar(rr * 4); halo.position.set(x, y, nz + .3); ship.add(halo);
    let light = null;
    if (LIGHTS >= 2 || (LIGHTS === 1 && k === 1)) { light = new THREE.PointLight(0x6fb6ff, 0, 14 * big, 2); light.position.set(x, y - .4, nz + 2.6); ship.add(light); }   // 噴焰真的照亮引擎座和環臂尾端
    flames.push({ outer, core, halo, light, ph: r() * 6, big });
  });

  // 4) 航行燈(照真的船 / 飛機):左舷紅、右舷綠是「一直亮」的位置燈;塔頂和艦首是白色防撞閃光燈(每 1.4 秒連閃兩下)
  //    每顆燈 = 小燈泡 + 跟距離無關的眩光(相機拍燈的感覺)+ 閃的那一下四芒星光芒;高階顯示卡再加真的點光源照亮旁邊的船殼
  const blink = [];
  for (const [x, y, z, col, kind, ph, mount] of [[-20.57, -.4, 9.2, 0xff2a22, 'steady', 0, [-20.67, -.4, 9.48]], [20.83, -.4, 9.91, 0x22ff66, 'steady', 0, [20.92, -.4, 10.2]],   /* 紅綠:外環臂兩端的端面往外 .3,有一小截燈座 */ [0, 43.4, 17, 0xffffff, 'strobe', 0], [0, .5, -41.2, 0xffffff, 'strobe', .47]]) {
    const c = new THREE.Color(col);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(.14, 12, 8), new THREE.MeshBasicMaterial({ color: c.clone().lerp(new THREE.Color(1, 1, 1), kind === 'steady' ? .22 : .5).multiplyScalar(3), toneMapped: false })); bulb.position.set(x, y, z); ship.add(bulb);   // 燈泡中心偏白(太亮的燈看起來是白熱的),顏色在外圈光暈
    if (mount) {                                                          // 燈座:從環臂端面伸出來的一小截 + 燈罩
      const a = new THREE.Vector3(...mount), b_ = new THREE.Vector3(x, y, z), d = b_.clone().sub(a), rod = new THREE.Mesh(new THREE.CylinderGeometry(.06, .08, d.length(), 10), M.dark);
      rod.position.copy(a).add(b_).multiplyScalar(.5); rod.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()); ship.add(rod);
      const cap = new THREE.Mesh(new THREE.TorusGeometry(.16, .035, 8, 20), M.dark); cap.position.copy(b_).addScaledVector(d, -.05); cap.quaternion.copy(rod.quaternion).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2)); ship.add(cap);
    }
    const sp = (map, size, op) => { const s_ = new THREE.Sprite(new THREE.SpriteMaterial({ map, color: c.clone().multiplyScalar(kind === 'strobe' ? 2.2 : 1.6), transparent: true, opacity: op, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: false, toneMapped: false })); s_.scale.setScalar(size); s_.position.set(x, y, z); ship.add(s_); return s_; };
    const glare = sp(gl_, kind === 'strobe' ? .03 : .034, kind === 'strobe' ? .25 : .95), star = kind === 'strobe' ? sp(st_, .06, 0) : null;
    if (kind === 'steady') { const core = sp(gl_, .009, 1); core.material.color.copy(c).lerp(new THREE.Color(1, 1, 1), .45).multiplyScalar(2.4); }   // 白熱的小核心
    let light = null;
    if (LIGHTS >= 2 || (LIGHTS === 1 && kind === 'strobe')) { light = new THREE.PointLight(col, kind === 'strobe' ? 0 : 5, kind === 'strobe' ? 26 : 12, 2); light.position.set(x, y + .3, z); ship.add(light); }
    blink.push({ bulb, glare, star, light, kind, ph, c });
  }

  // 太陽(有陰影)+ 冷色輪廓光 + 星球反射上來的淡藍光
  const sun = new THREE.DirectionalLight(0xfff1e0, 2.5); sun.position.set(40, 70, 10); sun.castShadow = true;
  sun.shadow.mapSize.set(Q.shadowSize || 2048, Q.shadowSize || 2048); Object.assign(sun.shadow.camera, { near: 10, far: 260, left: -60, right: 60, top: 60, bottom: -60 }); sun.shadow.bias = -.0006; sun.shadow.normalBias = .05;
  root.add(sun); root.add(sun.target);
  const rim = new THREE.DirectionalLight(0x8fb6ff, 1.5); rim.position.set(-50, 10, -60); root.add(rim);
  const bounce = new THREE.DirectionalLight(0x6f9cff, .3); bounce.position.set(0, -80, 0); root.add(bounce);
  const planet = createPlanet(root, sun.position.clone().normalize());

  let hov = 0, loaded = false, radars = [], radarLed = null;
  return {
    root, ship, hangarHits,
    setHangarOpen(k) { for (const { g, d } of hangarDoors) g.position.z = 3 + d * k * 6.7; hangarSeam.emissiveIntensity = 2.6 + k * 3; },   // 0 = 關、1 = 全開
    hangarWorld: (side = 1) => ship.localToWorld(new THREE.Vector3(side * 6.6, .3, 3)),   // 機庫口中心(side = 哪一側)
    setPose(yaw, pitch) { ship.rotation.y = yaw; ship.rotation.x = pitch; },   // 拖曳 / 自轉只轉戰艦(鏡頭、星球、護航小艦不動)
    portal,
    get escorts() { return escorts; },                                 // 測試用
    get loaded() { return loaded; }, get failed() { return failed; }, get progress() { return progress; }, ready,
    setAirlock(k) { gapU.value = k * 1.7; },  // 機庫最裡面的圓形氣閘門:0 = 關、1 = 左右滑開
    update(t, hover = false) {
      hov += ((hover ? 1 : 0) - hov) * .12;
      hangarGlow.emissiveIntensity = 1.2 + (Math.sin(t * 2.4) * .5 + .5) * 1.4 + hov * 4;
      ship.position.y = Math.sin(t * .35) * .5; ship.rotation.z = Math.sin(t * .25) * .015;
      radars.forEach((r, i) => { r.rotation.y = i ? 2.1 - t * .21 : t * .3; });   // 雷達:兩座不同速度、不同方向慢慢掃
      if (radarLed) radarLed.emissiveIntensity = ((t * .9) % 1) < .12 ? 4 : .25;   // 雷達頂端紅色警示燈:一秒閃一下
      for (const f of flames) {                                                  // 噴焰:快速的小抖動 + 偶爾一點長短變化
        const k = .9 + Math.sin(t * 23 + f.ph) * .05 + Math.sin(t * 37 + f.ph * 2) * .04 + Math.sin(t * 3.1 + f.ph) * .03;
        for (const m of [f.outer, f.core]) { m.material.uniforms.uTime.value = t + f.ph; m.material.uniforms.uK.value = k; }
        f.outer.scale.y = .94 + (k - .9) * 1.2; f.core.scale.y = .96 + (k - .9) * .8;
        f.halo.material.opacity = .75 + (k - .9) * 2.4;
        if (f.light) f.light.intensity = 32 * f.big * k;
      }
      for (const b of blink) {
        if (b.kind === 'steady') { if (b.light) b.light.intensity = 5; continue; }
        const p = ((t / 1.4 + b.ph) % 1) * 1.4, f1 = p < .5 ? Math.exp(-p / .028) : 0, f2 = p > .16 ? Math.exp(-(p - .16) / .028) : 0, fl = Math.max(f1, f2);   // 連閃兩下(很快亮、很快暗)
        b.bulb.material.color.copy(b.c).multiplyScalar(.6 + fl * 6); b.glare.material.opacity = .22 + fl * .9; b.glare.scale.setScalar(.03 + fl * .035);
        b.star.material.opacity = fl; b.star.scale.setScalar(.04 + fl * .05);
        if (b.light) b.light.intensity = fl * 220;
      }
      for (const e of escorts) {                                                 // 護航小艦各自繞軌道(最近也離戰艦中心 50 以上,不會穿過船身)
        const th = e.th0 + t * e.sp, x = Math.cos(th) * e.a, z = Math.sin(th) * e.b + 4, y = e.h + Math.sin(t * .3 + e.ph) * .8;
        e.pivot.position.set(x, y, z);
        for (const pl of e.flames) { pl.material.uniforms.uTime.value = t + e.ph; pl.material.uniforms.uK.value = .9 + Math.sin(t * 29 + e.ph) * .07; }
        _ev.set(x - Math.sin(th) * e.a * e.sp, y, z + Math.cos(th) * e.b * e.sp); e.pivot.lookAt(_ev); e.pivot.rotateZ(Math.sign(e.sp) * .22);
      }
      planet.update(t); ship.updateMatrixWorld(); clipU.value.copy(ship.matrixWorld).invert();
    },
  };
}
