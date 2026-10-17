// 星際戰艦外觀(使用者參考圖:白色太空城艦):Blender 建模 + 烘焙貼圖(tools/blender/ship_build.py、ship_export.py → models/ship.glb)
//   白色箭頭艦身、中央玻璃穹頂花園、貫穿的高塔、艦尾半圈弧形環臂、艦首大環、上千個小窗;旁邊幾艘護航小艦慢慢飄。
//   機庫口(兩側 x = ±6.6、z = -3 ~ 9)的門 / 發光框 / 點擊範圍還是在這裡蓋,讓「點機庫口 → 開門飛進去」照舊。
//   底下一顆很大的星球(shader 畫的海洋、大陸、雲、大氣光暈、夜面城市燈),從任何角度看都是在軌道上。艦首朝 -z、艦尾 +z。
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { glow, rand } from './kit.mjs?v=3';

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
function glowTex() {
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(.3, 'rgba(255,255,255,.4)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128); return new THREE.CanvasTexture(c);
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
        float fr = pow(1. - max(dot(N, V), 0.), 6.);                                       // 很淡的一點邊緣藍(主要的大氣交給外面那層 atmo)
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
  const escorts = [], airlock = [], _ev = new THREE.Vector3(), clipU = { value: new THREE.Matrix4() }, gapU = { value: 0 };
  const portal = new THREE.Mesh(new THREE.CircleGeometry(1.75, 64), new THREE.MeshBasicMaterial({ color: 0xfff4e4 }));
  let progress = 0, failed = false, readyFn; const ready = new Promise((ok) => { readyFn = ok; });   // 載入進度(讀條用)
  const gl = new GLTFLoader(), draco = new DRACOLoader(); draco.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/'); gl.setDRACOLoader(draco);
  gl.load('/assets/starship/models/ship.glb?v=4', (gltf) => {
    const m = gltf.scene;
    m.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = true; o.receiveShadow = true;
      const mt = o.material, n = mt.name || '';
      if (n === 'ship_glass') { o.material = new THREE.MeshPhysicalMaterial({ color: 0xdcecff, roughness: .05, metalness: 0, transparent: true, opacity: .2, envMapIntensity: 1.6, depthWrite: false }); o.castShadow = false; }
      else if (n === 'ship_vault') { o.material = new THREE.MeshPhysicalMaterial({ color: 0xbfdcff, roughness: .04, metalness: 0, clearcoat: 1, transparent: true, opacity: .16, envMapIntensity: .9, emissive: 0x1d3a5c, emissiveIntensity: .12, side: THREE.DoubleSide, depthWrite: false }); o.castShadow = false; o.renderOrder = 2; }   // 環臂花園的薄玻璃拱頂:看得出一層玻璃,樹還是透得過來
      else if (n === 'ship_facade') { mt.emissive.set(0xffffff); mt.emissiveIntensity = 2.6; mt.envMapIntensity = 1.2; }
      else if (/window|goldglow|blueglow/.test(n)) { o.castShadow = false; mt.emissiveIntensity = Math.min(mt.emissiveIntensity, /blue/.test(n) ? 1.6 : 3.2); }   // 燈條亮度上限,不然 bloom 糊成一團
      else if (mt.isMeshStandardMaterial) mt.envMapIntensity = .6;
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
      escorts.push({ pivot, a, b: a * 1.3, h, sp, th0, ph: r() * 6 });
    }
    ship.add(m); ship.visible = true; loaded = true; progress = 1; readyFn();
  }, (x) => { if (x.total) progress = x.loaded / x.total; }, (e) => { console.warn('[exterior] 戰艦模型載入失敗', e); failed = true; window.__siteError = true; readyFn(); });

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
  const gt = glowTex(), flames = [];
  const fl = (() => { const c = document.createElement('canvas'); c.width = 32; c.height = 256; const g = c.getContext('2d'); const gr = g.createLinearGradient(0, 0, 0, 256);
    gr.addColorStop(0, 'rgba(190,225,255,.9)'); gr.addColorStop(.25, 'rgba(90,160,255,.6)'); gr.addColorStop(1, 'rgba(40,90,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 32, 256);
    const t = new THREE.CanvasTexture(c); t.flipY = false; return t; })();
  // 引擎在外環臂的最後面(tools/blender/ship_build.py 印出的 ENGINES:Blender (x, 噴口 y, z, 大小) → 這裡 (x, z, -y))
  for (const [x, y, nz0, big] of [[-6.726, -.5, 44.155, 1], [0, -.05, 45.1, 1.25], [6.726, -.5, 44.155, 1]]) {
    const nz = nz0 + .1, rr = 1.05 * big;
    const cone = new THREE.Mesh(new THREE.ConeGeometry(rr * .9, rr * 3.2, 24, 1, true), new THREE.MeshBasicMaterial({ map: fl, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    cone.geometry.translate(0, rr * 1.6, 0); cone.rotation.x = Math.PI / 2; cone.position.set(x, y, nz); ship.add(cone);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: gt, color: 0x7fc4ff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); halo.scale.setScalar(rr * 5); halo.position.set(x, y, nz + .4); ship.add(halo);
    flames.push({ cone, halo, ph: r() * 6 });
  }

  // 4) 航行燈:環臂兩端左紅右綠、塔頂與艦首白色閃光
  const blink = [];
  for (const [x, y, z, col, rate, ph] of [[-20.7, -.4, 9.5, 0xff5a5a, .9, .2], [20.9, -.4, 10.2, 0x5cff9a, .9, .2], [0, 43.4, 17, 0xffffff, 1.4, 0], [0, .5, -41.2, 0xffffff, 1.1, .5]]) {
    const l = new THREE.Mesh(new THREE.SphereGeometry(.25, 12, 8), glow(col, 4)); l.position.set(x, y, z); ship.add(l);
    const h = new THREE.Sprite(new THREE.SpriteMaterial({ map: gt, color: col, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); h.scale.setScalar(3.4); h.position.copy(l.position); ship.add(h);
    blink.push({ l, h, rate, ph });
  }

  // 太陽(有陰影)+ 冷色輪廓光 + 星球反射上來的淡藍光
  const sun = new THREE.DirectionalLight(0xfff1e0, 2.5); sun.position.set(40, 70, 10); sun.castShadow = true;
  sun.shadow.mapSize.set(Q.shadowSize || 2048, Q.shadowSize || 2048); Object.assign(sun.shadow.camera, { near: 10, far: 260, left: -60, right: 60, top: 60, bottom: -60 }); sun.shadow.bias = -.0006; sun.shadow.normalBias = .05;
  root.add(sun); root.add(sun.target);
  const rim = new THREE.DirectionalLight(0x8fb6ff, 1.2); rim.position.set(-50, 10, -60); root.add(rim);
  const bounce = new THREE.DirectionalLight(0x6f9cff, .55); bounce.position.set(0, -80, 0); root.add(bounce);
  const planet = createPlanet(root, sun.position.clone().normalize());

  let hov = 0, loaded = false;
  return {
    root, ship, hangarHits,
    setHangarOpen(k) { for (const { g, d } of hangarDoors) g.position.z = 3 + d * k * 6.7; hangarSeam.emissiveIntensity = 2.6 + k * 3; },   // 0 = 關、1 = 全開
    hangarWorld: (side = 1) => ship.localToWorld(new THREE.Vector3(side * 6.6, .3, 3)),   // 機庫口中心(side = 哪一側)
    setPose(yaw, pitch) { ship.rotation.y = yaw; ship.rotation.x = pitch; },   // 拖曳 / 自轉只轉戰艦(鏡頭、星球、護航小艦不動)
    portal,
    get loaded() { return loaded; }, get failed() { return failed; }, get progress() { return progress; }, ready,
    setAirlock(k) { gapU.value = k * 1.7; },  // 機庫最裡面的圓形氣閘門:0 = 關、1 = 左右滑開
    update(t, hover = false) {
      hov += ((hover ? 1 : 0) - hov) * .12;
      hangarGlow.emissiveIntensity = 1.2 + (Math.sin(t * 2.4) * .5 + .5) * 1.4 + hov * 4;
      ship.position.y = Math.sin(t * .35) * .5; ship.rotation.z = Math.sin(t * .25) * .015;
      for (const f of flames) { const k = .85 + Math.sin(t * 21 + f.ph) * .08 + Math.sin(t * 33 + f.ph * 2) * .05; f.cone.scale.set(1, k, 1); f.halo.material.opacity = .65 + (k - .85) * 2; }
      for (const b of blink) { const on = ((t * b.rate + b.ph) % 1) < .16; b.l.material.emissiveIntensity = on ? 6 : .3; b.h.material.opacity = on ? 1 : .05; }
      for (const e of escorts) {                                                 // 護航小艦各自繞軌道(最近也離戰艦中心 50 以上,不會穿過船身)
        const th = e.th0 + t * e.sp, x = Math.cos(th) * e.a, z = Math.sin(th) * e.b + 4, y = e.h + Math.sin(t * .3 + e.ph) * .8;
        e.pivot.position.set(x, y, z);
        _ev.set(x - Math.sin(th) * e.a * e.sp, y, z + Math.cos(th) * e.b * e.sp); e.pivot.lookAt(_ev); e.pivot.rotateZ(Math.sign(e.sp) * .22);
      }
      planet.update(t); ship.updateMatrixWorld(); clipU.value.copy(ship.matrixWorld).invert();
    },
  };
}
