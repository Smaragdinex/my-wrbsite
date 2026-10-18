// 星艦裡的五間艙(一間一個作品;About 是另外的頁面)。每間照 catinsight-3d 那間 3D 房間的格局:厚底座 + 地板 + 兩面牆,鏡頭從前方 45° 看;
// 牆是艦艙面板 + 發光燈條 + 看得到太空的圓窗。佈置之後照使用者的描述 / 參考圖一間一間改(改這個檔就好)。
import * as THREE from 'three';
import { gltf } from './loaders.mjs?v=1';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { mat, glow, box, cyl, sphere, group, woodTex, panelTex, pot, leafyPlant, rand, textTex } from './kit.mjs?v=3';
import { holoGlobe } from './globe.mjs?v=4';
import { asset } from './quality.mjs?v=7';

export const S = 6.4, T = 0.42, H = 4.8;   // 地板邊長、牆厚、牆高(跟 3D room 一樣)

// ---------- 共用:窗外的太空(星星 + 一顆行星)----------
function spaceTex(planet = '#5b7be0', seed = 1) {
  const c = document.createElement('canvas'); c.width = c.height = 512; const g = c.getContext('2d'), r = rand(seed);
  const gr = g.createRadialGradient(256, 256, 30, 256, 256, 300); gr.addColorStop(0, '#16224d'); gr.addColorStop(1, '#04060f'); g.fillStyle = gr; g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 380; i++) { g.fillStyle = `rgba(255,255,255,${.2 + r() * .8})`; const s = r() * 2.2 + .4; g.fillRect(r() * 512, r() * 512, s, s); }
  const px = 330, py = 340, pr = 120; const pg = g.createRadialGradient(px - 40, py - 40, 10, px, py, pr); pg.addColorStop(0, planet); pg.addColorStop(1, '#0b0f24');
  g.fillStyle = pg; g.beginPath(); g.arc(px, py, pr, 0, Math.PI * 2); g.fill();
  g.strokeStyle = 'rgba(160,200,255,.35)'; g.lineWidth = 6; g.beginPath(); g.arc(px, py, pr + 4, Math.PI * 1.05, Math.PI * 1.65); g.stroke();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
// 圓窗:金屬框 + 窗外太空(貼在牆面上)
function porthole(parent, r, pos, rotY, sky) {
  const g = group(parent, pos.x, pos.y, pos.z, rotY);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(r, r * .14, 16, 48), mat(0xc7cfdd, { metalness: .55, roughness: .3, envMapIntensity: 1 })); ring.position.z = .06; ring.castShadow = true; g.add(ring);
  const inner = new THREE.Mesh(new THREE.TorusGeometry(r * .9, r * .05, 10, 48), mat(0x8c96ad, { metalness: .5, roughness: .35 })); inner.position.z = .04; g.add(inner);
  const view = new THREE.Mesh(new THREE.CircleGeometry(r * .9, 48), new THREE.MeshBasicMaterial({ map: sky, toneMapped: false })); view.position.z = .015; g.add(view);
  for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2; const b = new THREE.Mesh(new THREE.SphereGeometry(r * .045, 8, 6), mat(0x9aa4b8, { metalness: .6 })); b.position.set(Math.cos(a) * r, Math.sin(a) * r, r * .1); g.add(b); }
  return g;
}

// ---------- 艙室外殼 ----------
// cfg: { slab, wall, wallLow, accent, floor:'wood'|'tile'|'metal', tileA, tileB, planet }
export function shell(parent, cfg) {
  const R = group(parent);
  // 厚底座 + 前緣兩條發光燈(艦艙的感覺)
  box(R, S, .55, S, cfg.slab, { y: -.275, r: .05, seg: 2 });
  for (const [x, z, w, d] of [[0, S / 2 + .01, S - .3, .04], [S / 2 + .01, 0, .04, S - .3]]) {
    const l = new THREE.Mesh(new THREE.BoxGeometry(w, .06, d), glow(cfg.accent, 2.6)); l.position.set(x, -.3, z); R.add(l);
  }
  // 地板
  if (cfg.floor === 'wood') {
    const TONES = [['#d9a676', [120, 72, 38]], ['#cf9b6a', [110, 66, 34]], ['#e2b386', [128, 80, 44]]].map(([b, ink]) => woodTex(1024, 64, 'u', b, ink));
    const ROWS = 10, W = S - .2, RW = W / ROWS, r = rand(5);
    for (let i = 0; i < ROWS; i++) {
      const z = -S / 2 + .1 + (i + .5) * RW; let x = -W / 2; const cuts = [x];
      x -= r() * 1.4; while (true) { x += 1.1 + r() * 1.5; if (x >= W / 2) break; if (x > cuts[cuts.length - 1] + .3) cuts.push(x); }
      if (W / 2 - cuts[cuts.length - 1] < .3 && cuts.length > 1) cuts.pop(); cuts.push(W / 2);
      for (let c = 0; c < cuts.length - 1; c++) {
        const tex = TONES[r() * 3 | 0].clone(); tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set((cuts[c + 1] - cuts[c]) / 3.2, 1); tex.offset.set(r(), 0); tex.needsUpdate = true;
        box(R, cuts[c + 1] - cuts[c] - .012, .05, RW - .012, new THREE.MeshStandardMaterial({ map: tex, roughness: .62 }), { x: (cuts[c] + cuts[c + 1]) / 2, y: .025, z, r: .006, seg: 1, shadow: false });
      }
    }
  } else if (cfg.floor === 'tile') {
    const N = 8, w = (S - .2) / N;
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++)
      box(R, w - .02, .05, w - .02, (i + j) % 2 ? cfg.tileA : cfg.tileB, { x: -S / 2 + .1 + (i + .5) * w, y: .025, z: -S / 2 + .1 + (j + .5) * w, r: .008, seg: 1, shadow: false, m: { roughness: .35 } });
  } else {
    const t = panelTex('#8a93a8', 'rgba(40,46,64,.45)', 1024, 1024, 4, 4); t.repeat.set(1, 1);
    box(R, S - .2, .05, S - .2, new THREE.MeshStandardMaterial({ map: t, roughness: .45, metalness: .45 }), { y: .025, r: .01, seg: 1, shadow: false });
  }
  // 兩面牆:艙壁面板(上)+ 顏色比較深的護牆板(下)+ 牆頂發光線
  const wallM = new THREE.MeshStandardMaterial({ map: panelTex(cfg.wall, 'rgba(70,60,110,.22)', 1024, 1024, 3, 3), roughness: .7 });
  const wallMB = new THREE.MeshStandardMaterial({ map: panelTex(cfg.wallB || cfg.wall, 'rgba(70,60,110,.22)', 1024, 1024, 3, 3), roughness: .7 });
  const back = box(R, S, H, T, wallM, { y: H / 2, z: -S / 2 + T / 2, r: .04, seg: 2 });
  const side = box(R, T, H, S - T, wallMB, { x: -S / 2 + T / 2, y: H / 2, z: T / 2, r: .04, seg: 2 });
  box(R, S - T, 1.0, .06, cfg.wallLow, { x: T / 2, y: .55, z: -S / 2 + T + .03, r: .02 });
  box(R, .06, 1.0, S - T, cfg.wallLow, { x: -S / 2 + T + .03, y: .55, z: T / 2, r: .02 });
  for (const [x, z, w, d] of [[T / 2, -S / 2 + T + .02, S - T, .03], [-S / 2 + T + .02, T / 2, .03, S - T]]) {
    const l = new THREE.Mesh(new THREE.BoxGeometry(w, .05, d), glow(cfg.accent, 2.2)); l.position.set(x, H - .18, z); R.add(l);
    const l2 = new THREE.Mesh(new THREE.BoxGeometry(w, .03, d), glow(cfg.accent, 1.6)); l2.position.set(x, 1.07, z); R.add(l2);
  }
  // 圓窗
  const sky = spaceTex(cfg.planet || '#5b7be0', (cfg.seed || 1) * 7);
  if (cfg.windows !== false) {
    porthole(R, .62, new THREE.Vector3(-S / 2 + T + .02, 2.9, -.9), Math.PI / 2, sky);
    porthole(R, .62, new THREE.Vector3(-S / 2 + T + .02, 2.9, 1.3), Math.PI / 2, sky);
  }
  // 室內燈(每間自己的暖光,局部打亮)
  const lamp = new THREE.PointLight(cfg.lampColor ?? 0xffe2c4, 9, 9, 1.6); lamp.position.set(.6, 3.9, .4); R.add(lamp);
  R.userData.sky = sky;
  return R;
}

// ---------- 五間房的佈置 ----------
// 每個 builder 拿到房間 group,回傳 { update(t) } 做小動畫
export const ROOMS = [
  { key: 'kitty', title: 'KittyCafe', tag: 'Web · iOS · Casual Game', desc: 'Serve the pickiest cat customers before the clock runs out.', url: '/kitty-cafe/',
    cfg: { slab: 0xf3c9d6, wall: '#f9d6e1', wallB: '#e6c9f2', wallLow: 0xf3a9bd, accent: 0xff8fb0, floor: 'tile', tileA: 0xfff6f8, tileB: 0xf6c6d4, planet: '#e47aa9', seed: 1 } },
  { key: 'stocks', title: 'Cat Street Stocks', tag: 'Three.js · Board Game', desc: 'A board game about the stock market, with cats.', url: '/catinsight-3d/',
    cfg: { slab: 0xcbd5f3, wall: '#c9f0d8', wallB: '#b7c3f2', wallLow: 0x8fa3e8, accent: 0x7fe0a0, floor: 'wood', planet: '#5ccf8a', seed: 2 } },
  { key: 'ocean', title: 'Ocean Cleanup', tag: 'iOS Game', desc: 'A casual iOS game about cleaning up the beach.', url: 'https://apps.apple.com/tw/app/id6771914760',
    cfg: { slab: 0xbfe1f2, wall: '#cdeefa', wallB: '#9fd7f0', wallLow: 0x76bfe6, accent: 0x5ad0ff, floor: 'metal', planet: '#3aa0e6', seed: 3 } },
  { key: 'planet', title: 'Tiny Planet', tag: 'Three.js · Flight Sandbox', desc: 'Fly a little plane around a tiny planet.', url: '/tiny-planet/',
    cfg: { slab: 0xd5cbf3, wall: '#d9cdf7', wallB: '#b9a6ef', wallLow: 0xa48be8, accent: 0xb48bff, floor: 'wood', planet: '#9b7bea', seed: 4, lampColor: 0xd9c8ff } },
  { key: 'rails', title: 'Wooden Rails', tag: 'Three.js · Track Puzzle', desc: 'A track-laying puzzle built from wooden rails.', url: '/wooden-rails/',
    cfg: { slab: 0xf1d9bf, wall: '#f8e2c4', wallB: '#f2c79d', wallLow: 0xe3b17a, accent: 0xffb35c, floor: 'wood', planet: '#e6a35a', seed: 5 } },
];

const D = {};
// KittyCafe:沿後牆的吧台(木頭檯面)+ 咖啡機 + 甜點櫃 + 吧台椅、兩張小圓桌、菜單看板、植物、壁燈
D.kitty = (R, ctx) => {
  const z0 = -S / 2 + T;
  const counterTop = new THREE.MeshStandardMaterial({ map: woodTex(1024, 128, 'u', '#e8c9a2'), roughness: .5 });
  box(R, 3.6, 1.0, .85, 0xffffff, { x: .4, y: .5, z: z0 + .5, r: .06, m: { color: 0xfff1f4 } });
  box(R, 3.75, .09, 1.0, counterTop, { x: .4, y: 1.05, z: z0 + .52, r: .03 });
  for (let k = 0; k < 6; k++) box(R, .52, .7, .02, 0xf7c8d6, { x: -1.0 + k * .57, y: .5, z: z0 + .94, r: .01 });
  // 咖啡機
  const cm = group(R, -.6, 1.1, z0 + .45);
  box(cm, .8, .62, .55, 0xd8dde6, { y: .31, r: .06, m: { metalness: .65, roughness: .25, envMapIntensity: 1 } });
  box(cm, .7, .08, .5, 0x2b2f3a, { y: .66, r: .02 });
  for (const x of [-.18, .18]) { cyl(cm, .05, .05, .16, 0x9aa4b8, { x, y: .2, z: .3, m: { metalness: .7, roughness: .2 } }); cyl(cm, .09, .07, .12, 0xffffff, { x, y: .06, z: .32 }); }
  const lightM = glow(0x9fffd0, 2); const led = new THREE.Mesh(new THREE.BoxGeometry(.12, .05, .01), lightM); led.position.set(.25, .5, .28); cm.add(led);
  // 甜點櫃(玻璃罩)+ 蛋糕
  const pc = group(R, 1.15, 1.1, z0 + .5);
  box(pc, 1.3, .06, .62, 0xf2d7e0, { y: .03, r: .02 });
  const glass = new THREE.Mesh(new THREE.BoxGeometry(1.26, .5, .58), new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: .05, transmission: .9, thickness: .05, transparent: true, opacity: .35 })); glass.position.y = .31; pc.add(glass);
  const cakes = [0xfff2c4, 0xff9fb8, 0xbfe4ff, 0xd9c4ff, 0xffd59a];
  cakes.forEach((c, k) => { const x = -.48 + k * .24; cyl(pc, .09, .09, .12, c, { x, y: .12, z: -.05 }); sphere(pc, .03, 0xff5a7a, { x, y: .2, z: -.05 }); });
  // 吧台椅
  for (let k = 0; k < 3; k++) { const s = group(R, -.7 + k * .95, 0, z0 + 1.45); cyl(s, .05, .07, .78, 0xc9ced9, { y: .39, m: { metalness: .6, roughness: .3 } }); cyl(s, .24, .22, .1, 0xff8fb0, { y: .8 }); cyl(s, .2, .2, .02, 0xd0d5e0, { y: .03 }); }
  // 小圓桌 + 椅子
  for (const [x, z] of [[1.6, 1.4], [.1, 2.2]]) {
    const t = group(R, x, 0, z);
    cyl(t, .45, .45, .05, 0xffffff, { y: .72 }); cyl(t, .04, .06, .7, 0xd4a5b5, { y: .36 }); cyl(t, .25, .25, .03, 0xd4a5b5, { y: .02 });
    cyl(t, .06, .06, .09, 0xffffff, { x: .12, y: .79 }); sphere(t, .07, 0xfff2c4, { x: -.15, y: .79 });
    for (const a of [0, Math.PI]) { const c = group(t, Math.cos(a) * .75, 0, Math.sin(a) * .75, -a + Math.PI / 2); box(c, .42, .06, .42, 0xf7a3bc, { y: .46, r: .03 }); box(c, .42, .5, .06, 0xf7a3bc, { y: .72, z: -.19, r: .03 }); for (const [lx, lz] of [[-.17, -.17], [.17, -.17], [-.17, .17], [.17, .17]]) cyl(c, .025, .025, .44, 0xe9d4dc, { x: lx, y: .22, z: lz }); }
  }
  // 菜單看板(牆上)
  const menu = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 1.05), new THREE.MeshBasicMaterial({ map: textTex(['KITTY CAFÉ', 'latte · taiyaki · ice cream'], { w: 1024, h: 540, bg: '#3a2a35', color: '#ffe6ef', font: '700 92px "Helvetica Neue", sans-serif' }), toneMapped: false }));
  menu.position.set(.3, 2.75, -S / 2 + T + .06); R.add(menu);
  box(R, 2.12, 1.17, .05, 0xf3a9bd, { x: .3, y: 2.75, z: -S / 2 + T + .025, r: .02 });
  // 植物
  leafyPlant(R, { x: 2.5, z: -2.3, pot: 0xffffff, leaf: 0x3fc9a0 });
  leafyPlant(R, { x: -2.4, z: 2.4, r: .22, h: .32, pot: 0xf3a9bd, len: .55 });
  return { update(t) { led.material.emissiveIntensity = 1.5 + Math.sin(t * 3) * .6; } };
};

// Cat Street Stocks:木地板上的大棋盤桌 + 骰子 + 小棋子、牆上的即時股價看板、街機、懶骨頭、霓虹招牌
D.stocks = (R, ctx) => {
  // 股價看板(會動的線圖)
  const cv = document.createElement('canvas'); cv.width = 1024; cv.height = 560; const g = cv.getContext('2d');
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
  let series = Array.from({ length: 60 }, (_, i) => 50 + Math.sin(i * .3) * 10 + Math.random() * 6);
  const drawChart = () => {
    g.fillStyle = '#121a33'; g.fillRect(0, 0, 1024, 560);
    g.strokeStyle = 'rgba(120,150,220,.18)'; g.lineWidth = 2; for (let y = 80; y < 560; y += 80) { g.beginPath(); g.moveTo(0, y); g.lineTo(1024, y); g.stroke(); }
    g.fillStyle = '#7fe0a0'; g.font = '700 54px "Helvetica Neue", sans-serif'; g.fillText('CATS  ▲ ' + (series[59] - 40).toFixed(1) + '%', 40, 70);
    g.strokeStyle = '#7fe0a0'; g.lineWidth = 7; g.beginPath(); series.forEach((v, i) => { const x = 30 + i * 16.4, y = 540 - v * 5; i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.stroke();
    tex.needsUpdate = true;
  };
  drawChart();
  const scr = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.42), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false })); scr.position.set(.4, 2.9, -S / 2 + T + .095); R.add(scr);
  box(R, 2.78, 1.6, .08, 0x2b3150, { x: .4, y: 2.9, z: -S / 2 + T + .04, r: .03 });
  // 霓虹招牌(側牆)
  const neon = new THREE.Mesh(new THREE.PlaneGeometry(2.4, .6), new THREE.MeshBasicMaterial({ map: textTex('CAT STREET', { color: '#9fffc8', font: '800 150px "Helvetica Neue", sans-serif' }), transparent: true, toneMapped: false }));
  neon.position.set(-S / 2 + T + .05, 4.05, .2); neon.rotation.y = Math.PI / 2; neon.scale.setScalar(.8); R.add(neon);
  // 棋盤桌:一圈彩色格子 + 中間草地
  const tb = group(R, .5, 0, .6);
  box(tb, 2.6, .12, 2.2, new THREE.MeshStandardMaterial({ map: woodTex(1024, 256, 'u', '#c9935f', [100, 60, 30]), roughness: .55 }), { y: .74, r: .04 });
  for (const [x, z] of [[-1.1, -.9], [1.1, -.9], [-1.1, .9], [1.1, .9]]) cyl(tb, .06, .05, .7, 0x6b4a33, { x, y: .36, z });
  box(tb, 2.2, .04, 1.8, 0x9ee3a8, { y: .82, r: .02 });
  const cols = [0xff8fa3, 0xffd166, 0x6cc6ff, 0xb48bff, 0x5cc77a];
  for (let k = 0; k < 22; k++) { const per = k / 22, a = per * Math.PI * 2; const x = Math.cos(a) * .95, z = Math.sin(a) * .72; box(tb, .24, .05, .24, cols[k % 5], { x, y: .86, z, r: .02, ry: -a }); }
  const dice = [];
  for (const dx of [-.15, .2]) dice.push(box(tb, .2, .2, .2, 0xffffff, { x: dx, y: 1.0, z: .05, r: .045 }));
  for (const [x, z, c] of [[.8, .3, 0xff8fa3], [-.6, -.5, 0x6cc6ff], [.3, -.6, 0xffd166]]) { cyl(tb, .07, .09, .16, c, { x, y: .95, z }); sphere(tb, .07, c, { x, y: 1.08, z }); }
  // 街機(簡化版:機身 + 斜螢幕 + 搖桿)
  const ar = group(R, -2.15, 0, -1.6, .55);
  box(ar, 1.0, 1.9, .9, 0xb89ad3, { y: .95, r: .08 });
  box(ar, .9, .14, .95, 0xf27a5a, { y: 1.95, r: .05 });
  const aScr = new THREE.Mesh(new THREE.PlaneGeometry(.72, .55), glow(0x7fe0a0, 1.2)); aScr.position.set(0, 1.45, .46); aScr.rotation.x = -.18; ar.add(aScr);
  box(ar, .9, .12, .4, 0x5a4d80, { y: 1.05, z: .45, r: .04, rx: -.3 });
  cyl(ar, .025, .025, .14, 0x333333, { x: -.2, y: 1.15, z: .5 }); sphere(ar, .05, 0xff5a5a, { x: -.2, y: 1.23, z: .5 });
  for (const x of [.08, .22]) cyl(ar, .04, .04, .03, x > .1 ? 0xffd166 : 0x6cc6ff, { x, y: 1.13, z: .5 });
  // 懶骨頭
  for (const [x, z, c] of [[1.9, 2.2, 0x7fe0a0], [-.9, 2.4, 0xb48bff]]) { const b = sphere(R, .5, c, { x, y: .33, z, m: { roughness: .9 } }); b.scale.set(1.1, .66, 1.1); }
  leafyPlant(R, { x: 2.5, z: -2.3, pot: 0xffffff });
  let acc = 0;
  return { update(t, dt) {
    dice.forEach((d, k) => { d.rotation.set(t * (1.2 + k * .4), t * (.9 + k * .3), 0); d.position.y = 1.0 + Math.abs(Math.sin(t * 2.2 + k)) * .18; });
    acc += dt; if (acc > .25) { acc = 0; series.push(Math.max(20, Math.min(95, series[59] + (Math.random() - .45) * 4))); series.shift(); drawChart(); }
  } };
};

// Ocean Cleanup:沿側牆的大水族箱(水 + 魚 + 海草)、沙地、螃蟹、三色回收桶、躺椅
D.ocean = (R, ctx) => {
  const r = rand(9);
  // 水族箱(側牆前面)
  const tank = group(R, -S / 2 + T + .55, 0, .3);
  box(tank, .9, .5, 4.6, 0x2d3b5a, { y: .25, r: .04 });
  const water = new THREE.Mesh(new THREE.BoxGeometry(.8, 1.9, 4.5), new THREE.MeshPhysicalMaterial({ color: 0x5ad0ff, roughness: .1, transmission: .6, thickness: .4, transparent: true, opacity: .55 }));
  water.position.y = 1.47; tank.add(water);
  box(tank, .92, .1, 4.62, 0x2d3b5a, { y: 2.46, r: .03 });
  const fish = [];
  for (let k = 0; k < 9; k++) { const f = new THREE.Mesh(new THREE.CapsuleGeometry(.05, .12, 4, 8), mat([0xffa24a, 0xffd166, 0xff6b9a][k % 3])); f.rotation.z = Math.PI / 2; tank.add(f); fish.push({ f, ph: r() * 6, y: .9 + r() * 1.1, sp: .4 + r() * .4 }); }
  const weeds = [];
  for (let k = 0; k < 10; k++) { const w = cyl(tank, .03, .05, .6 + r() * .6, 0x3fb36a, { x: (r() - .5) * .5, y: .9, z: -2 + k * .42 }); weeds.push(w); }
  // 沙地 + 貝殼
  const sand = box(R, 3.2, .06, 3.0, 0xf4e3b5, { x: .9, y: .07, z: .9, r: .03 });
  for (let k = 0; k < 8; k++) sphere(R, .06, [0xffffff, 0xffc7d1, 0xffe0a8][k % 3], { x: -.5 + r() * 2.8, y: .12, z: -.4 + r() * 2.6 }).scale.set(1, .5, 1);
  // 螃蟹
  const crab = group(R, .9, .1, 1.2); const body = sphere(crab, .2, 0xff6b5a); body.scale.set(1.3, .6, 1); body.position.y = .14;
  for (const s of [-1, 1]) { sphere(crab, .08, 0xff6b5a, { x: s * .3, y: .2, z: .12 }); sphere(crab, .035, 0x222222, { x: s * .07, y: .28, z: .14 }); }
  // 回收桶
  [[0x5cc77a, 'P'], [0x6cc6ff, 'G'], [0xffd166, 'M']].forEach(([c], k) => { const b = group(R, 1.2 + k * .62, 0, -2.2); cyl(b, .25, .22, .7, c, { y: .35 }); cyl(b, .27, .27, .06, c, { y: .72, m: { roughness: .5 } }); });
  // 躺椅 + 陽傘
  const ch = group(R, 2.2, 0, 2.2, -.6); box(ch, .7, .08, 1.5, 0xff8fa3, { y: .35, r: .03, rx: -.2 }); for (const [x, z] of [[-.3, -.6], [.3, -.6], [-.3, .6], [.3, .6]]) cyl(ch, .02, .02, .35, 0xffffff, { x, y: .17, z });
  const um = group(R, 1.5, 0, 2.6); cyl(um, .03, .03, 2.2, 0xffffff, { y: 1.1 }); const cap = new THREE.Mesh(new THREE.ConeGeometry(1.0, .45, 12, 1, true), mat(0x5ad0ff, { side: THREE.DoubleSide })); cap.position.y = 2.25; cap.castShadow = true; um.add(cap);
  return { update(t) {
    fish.forEach((o, k) => { const z = Math.sin(t * o.sp + o.ph) * 1.9; o.f.position.set(Math.sin(t * .7 + k) * .15, o.y + Math.sin(t * 1.3 + k) * .08, z); o.f.rotation.y = Math.cos(t * o.sp + o.ph) > 0 ? 0 : Math.PI; });
    weeds.forEach((w, k) => { w.rotation.x = Math.sin(t * 1.1 + k) * .12; });
    crab.position.x = .9 + Math.sin(t * .6) * .9;
  } };
};

// Tiny Planet:觀測艙 —— 浮空的全息小星球(小飛機繞著飛)、望遠鏡、星圖、圓地毯、扶手椅
D.planet = (R, ctx) => {
  const ped = group(R, .5, 0, .3);
  cyl(ped, .6, .75, .5, 0xd9cff5, { y: .25 }); cyl(ped, .5, .5, .04, 0xb48bff, { y: .52, m: { emissive: 0x6a4cc0, emissiveIntensity: .8 } });
  const holo = new THREE.Mesh(new THREE.IcosahedronGeometry(.75, 3), new THREE.MeshStandardMaterial({ color: 0x6fb7ff, flatShading: true, roughness: .5, emissive: 0x16306a, emissiveIntensity: .6 }));
  holo.position.y = 1.85; ped.add(holo);
  const land = new THREE.Mesh(new THREE.IcosahedronGeometry(.77, 2), new THREE.MeshStandardMaterial({ color: 0x7fd67f, flatShading: true, transparent: true, opacity: .85 })); holo.add(land);
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(.5, .6, 1.2, 32, 1, true), new THREE.MeshBasicMaterial({ color: 0xb48bff, transparent: true, opacity: .14, side: THREE.DoubleSide, depthWrite: false })); beam.position.y = 1.15; ped.add(beam);
  const plane = group(ped); box(plane, .32, .08, .1, 0xff8fa3, { r: .03 }); box(plane, .08, .03, .42, 0xffffff, { r: .01 });
  // 望遠鏡
  const tel = group(R, -1.9, 0, -1.7, .7);
  for (let k = 0; k < 3; k++) { const a = k / 3 * Math.PI * 2; cyl(tel, .025, .025, 1.3, 0x8a6a4a, { x: Math.cos(a) * .3, y: .6, z: Math.sin(a) * .3, rx: Math.sin(a) * .25, rz: -Math.cos(a) * .25 }); }
  const tube = cyl(tel, .12, .16, 1.2, 0xf2f2f8, { y: 1.35, rx: -.9, m: { metalness: .3, roughness: .35 } }); cyl(tel, .17, .17, .1, 0xb48bff, { y: 1.58, z: -.33, rx: -.9 });
  // 星圖(牆上)
  const sc = document.createElement('canvas'); sc.width = sc.height = 512; { const g = sc.getContext('2d'); g.fillStyle = '#141a3a'; g.fillRect(0, 0, 512, 512); const rr = rand(4);
    const pts = Array.from({ length: 16 }, () => [40 + rr() * 432, 40 + rr() * 432]); g.strokeStyle = 'rgba(180,160,255,.6)'; g.lineWidth = 2; g.beginPath(); pts.slice(0, 8).forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)); g.stroke();
    pts.forEach(([x, y]) => { g.fillStyle = '#fff'; g.beginPath(); g.arc(x, y, 4, 0, Math.PI * 2); g.fill(); }); }
  const stex = new THREE.CanvasTexture(sc); stex.colorSpace = THREE.SRGBColorSpace;
  const map = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.6), new THREE.MeshBasicMaterial({ map: stex, toneMapped: false })); map.position.set(1.4, 2.9, -S / 2 + T + .06); R.add(map);
  box(R, 1.72, 1.72, .05, 0xa48be8, { x: 1.4, y: 2.9, z: -S / 2 + T + .025, r: .02 });
  // 圓地毯 + 扶手椅
  const rug = cyl(R, 1.6, 1.6, .03, 0x6a58c9, { x: .5, y: .07, z: .3, seg: 64 }); rug.castShadow = false;
  const chair = group(R, 2.1, 0, 2.0, -2.4);
  box(chair, 1.0, .4, .9, 0xb48bff, { y: .32, r: .12 }); box(chair, 1.0, .8, .25, 0xa07ae8, { y: .7, z: -.35, r: .12 }); for (const s of [-1, 1]) box(chair, .22, .55, .9, 0xa07ae8, { x: s * .45, y: .5, r: .1 });
  leafyPlant(R, { x: -2.3, z: 2.3, pot: 0xd9cff5, leaf: 0x7fd67f });
  return { update(t) { holo.rotation.y = t * .35; const a = t * .9; plane.position.set(Math.cos(a) * 1.05, 1.9 + Math.sin(a * 2) * .15, Math.sin(a) * 1.05); plane.rotation.y = -a; beam.material.opacity = .12 + Math.sin(t * 2) * .03; } };
};

// Wooden Rails:木工房 —— 地毯上的木頭軌道(橢圓)+ 會跑的小火車、工作台(工具)、玩具層架
D.rails = (R, ctx) => {
  const rug = box(R, 4.2, .03, 3.2, 0x7fb38a, { x: .6, y: .065, z: .7, r: .02, shadow: false });
  const rx = 1.6, rz = 1.05, cx = .6, cz = .7;
  const railM = mat(0xc08a52, { roughness: .6 });
  for (const k of [1, .84]) { const ring = new THREE.Mesh(new THREE.TorusGeometry(1, .045, 8, 96), railM); ring.rotation.x = Math.PI / 2; ring.scale.set(rx * k, rz * k, 1); ring.position.set(cx, .13, cz); ring.castShadow = true; R.add(ring); }
  for (let k = 0; k < 36; k++) { const a = k / 36 * Math.PI * 2; box(R, .1, .04, .42, 0xdcae78, { x: cx + Math.cos(a) * rx * .92, y: .1, z: cz + Math.sin(a) * rz * .92, ry: -Math.atan2(Math.sin(a) * rz, Math.cos(a) * rx) - Math.PI / 2 + Math.PI / 2, r: .01 }); }
  const train = group(R);
  const cars = [];
  const loco = group(train); box(loco, .5, .3, .3, 0xe65a4f, { y: .3, r: .05 }); box(loco, .2, .2, .28, 0xe65a4f, { x: -.15, y: .5, r: .04 }); cyl(loco, .05, .06, .18, 0x333a4a, { x: .14, y: .54 }); cars.push(loco);
  for (const c of [0x5cb7f0, 0xffd166]) { const car = group(train); box(car, .42, .24, .28, c, { y: .28, r: .05 }); cars.push(car); }
  // 工作台 + 工具
  const wb = group(R, -.2, 0, -S / 2 + T + .55);
  box(wb, 2.6, .1, .9, new THREE.MeshStandardMaterial({ map: woodTex(1024, 256, 'u', '#d8a36a', [110, 70, 35]), roughness: .55 }), { y: .95, r: .03 });
  for (const [x, z] of [[-1.2, -.35], [1.2, -.35], [-1.2, .35], [1.2, .35]]) box(wb, .1, .9, .1, 0x8a6040, { x, y: .45, z, r: .02 });
  box(wb, .5, .06, .3, 0xd0d5df, { x: -.7, y: 1.04, r: .02, m: { metalness: .6 } });
  for (let k = 0; k < 5; k++) box(wb, .2, .2, .2, [0xff8fa3, 0xffd166, 0x6cc6ff, 0x5cc77a, 0xb48bff][k], { x: .2 + (k % 3) * .25, y: 1.1 + (k > 2 ? .2 : 0), z: .1, r: .03 });
  const pegM = 0xc49a6c; box(wb, 2.4, 1.0, .05, pegM, { y: 1.9, z: -.42, r: .02 });
  for (const [x, len] of [[-.8, .5], [-.4, .4], [0, .55]]) box(wb, .06, len, .03, 0x9aa4b8, { x, y: 2.0, z: -.38, m: { metalness: .6 } });
  // 玩具層架(側牆)
  const sh = group(R, -S / 2 + T + .25, 0, 1.4);
  for (const y of [.9, 1.7, 2.5]) box(sh, .45, .06, 1.8, new THREE.MeshStandardMaterial({ map: woodTex(512, 128, 'u'), roughness: .6 }), { y, r: .02 });
  for (let k = 0; k < 9; k++) box(sh, .18, .18, .18, [0xff8fa3, 0xffd166, 0x6cc6ff][k % 3], { y: .99 + Math.floor(k / 3) * .8, z: -.6 + (k % 3) * .55, r: .04 });
  leafyPlant(R, { x: 2.5, z: -2.3, pot: 0xffffff });
  return { update(t) {
    cars.forEach((c, k) => { const a = t * .55 - k * .32; c.position.set(cx + Math.cos(a) * rx * .92, .02, cz + Math.sin(a) * rz * .92); c.rotation.y = -Math.atan2(Math.cos(a) * rz, -Math.sin(a) * rx); });
  } };
};

// ---------- 真的房間(Blender 建模 + 烘光,tools/blender/room_build.py / room_bake.py)----------
// 從大廳的門走進去是一間完整的房間(第一人稱,跟大廳一樣站著看),不是小模型。還沒載好之前先顯示上面的小模型。
// 房間裡不放作品截圖(使用者:截圖跟環境不搭),點房間裡的家具 / 擺設就進作品。
// 房間座標:入口在 z 0,往 -z 走進去(深 9、寬 10、高 4.2)。
const REAL = { kitty: { v: 3, props: true }, stocks: { v: 2, props: true }, ocean: { v: 2, props: true }, planet: { v: 6, props: true }, rails: { v: 2, props: true } };
// 窗外:星空 + 底下一大片星球(依視線方向算,有真的視差;跟通道的窗一樣)
const winMat = (hzOff = 0) => new THREE.ShaderMaterial({ uniforms: { uHz: { value: hzOff } }, vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
  fragmentShader: `varying vec3 vW; uniform float uHz;
    float h(vec3 p){ return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
    float h2(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f); return mix(mix(h2(i), h2(i + vec2(1, 0)), f.x), mix(h2(i + vec2(0, 1)), h2(i + 1.), f.x), f.y); }
    float fb(vec2 p){ float s = 0., a = .5; for (int k = 0; k < 5; k++) { s += a * vn(p); p *= 2.07; a *= .5; } return s; }
    void main(){ vec3 d = normalize(vW - cameraPosition);
      vec3 q = floor(d * 260.); float st = step(.9965, h(q)) * (.5 + .5 * h(q + 3.1));
      vec3 c = vec3(.006, .009, .02) + vec3(st);
      float hz = .03 + .04 * d.z + uHz; float below = smoothstep(hz + .01, hz - .03, d.y);
      vec3 planet = mix(vec3(.05, .22, .45), vec3(.02, .07, .18), smoothstep(hz, hz - .5, d.y));
      vec2 g = d.xz / max(hz - d.y + .025, .025) * .9;
      float land = smoothstep(.52, .56, fb(g * .35 + 7.)); planet = mix(planet, mix(vec3(.16, .3, .14), vec3(.5, .45, .32), fb(g * 1.3)), land * .8);
      float cl = smoothstep(.5, .72, fb(g + vec2(3.1, 1.7))); planet = mix(planet, vec3(.92, .95, 1.), cl * .85);
      c = mix(c, planet, below); c += vec3(.35, .6, 1.) * exp(-abs(d.y - hz) * 40.) * .9;
      gl_FragColor = vec4(c, 1.);
      #include <colorspace_fragment>
    }` });
const loadGLB = (url) => new Promise((ok, fail) => gltf().load(url, (g) => ok(g.scene), undefined, fail));   // 全站共用的載入器(loaders.mjs)
function realRoom(R, key, ctx) {
  const cfg = REAL[key], top = new THREE.Group(); top.visible = false; R.add(top);
  const st = { ready: false, eye: new THREE.Vector3(0, 1.65, -.9), look: new THREE.Vector3(0, 1.35, -9), hits: [], loading: null };
  st.load = () => st.loading ??= (window.__crumb?.(`room ${key} load`), Promise.all([loadGLB(asset(`/assets/starship/models/room_${key}.glb?v=${cfg.v}`)), cfg.props ? loadGLB(asset(`/assets/starship/models/room_${key}_props.glb?v=${cfg.v}`)) : null])).then(([m, props]) => { window.__crumb?.(`room ${key} loaded`);
    let mirror = null;
    if (ctx.mirror) {                                                          // 亮面地磚的倒影(低解析度 → 柔柔的,像拋光的磚)
      const dpr = Math.min(devicePixelRatio, 2);
      mirror = new Reflector(new THREE.PlaneGeometry(10, 9), { clipBias: .003, color: 0x555555, textureWidth: innerWidth * dpr * .28, textureHeight: innerHeight * dpr * .28 });
      mirror.rotation.x = -Math.PI / 2; mirror.position.set(0, -.012, -4.5); mirror.renderOrder = -3; top.add(mirror);
      const orig = mirror.onBeforeRender; let f = 0; mirror.onBeforeRender = function (...a) { if ((f++ & 1) === 0) orig.apply(this, a); };
    }
    m.traverse((o) => {
      if (!o.isMesh) return;
      const src = o.material, n = o.name;
      if (n.startsWith('window_')) { o.material = winMat(n.startsWith('window_round') ? .05 : 0); return; }   // 圓窗(正對著看):地平線拉高,下半看得到星球
      let mm;
      if (n.startsWith('neon_')) mm = new THREE.MeshBasicMaterial({ color: src.emissive.clone().multiplyScalar(1.1), toneMapped: false });
      else mm = new THREE.MeshBasicMaterial({ map: src.map || src.emissiveMap, toneMapped: false });
      if (n.startsWith('baked_furn') || n.startsWith('neon_')) st.hits.push(o);    // 點房間裡的東西(家具、擺設、招牌)就進作品;牆、地板、天花板不算
      if (n.startsWith('baked_floor') && mirror) { mm.transparent = true; mm.opacity = .9; o.renderOrder = -2; st.floorM = mm; }
      o.material = mm; src.dispose(); o.matrixAutoUpdate = false; o.updateMatrix();
    });
    st.mirror = mirror; top.add(m);
    if (props) { props.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; st.hits.push(o); } }); top.add(props); st.props = props; }
    const warm = new THREE.PointLight(0xffe6cc, 6, 12, 1.4); warm.position.set(0, 3.6, -4.5); top.add(warm);   // 給植物的暖光(建築的光已經烘在貼圖裡)
    if (key === 'planet') {                                                    // Tiny Planet:原本大廳中間的全息地球儀,浮在左後方的台座上(台座在 Blender 的 (-2.2, 5.4),頂面高 .63)
      const g = holoGlobe(); g.group.scale.setScalar(.64); g.group.position.set(-2.2, 1.75, -5.4); top.add(g.group); st.hits.push(g.ball);
      st.tick = (t) => { g.update(t); g.group.position.y = 1.75 + Math.sin(t * .8) * .03; };
    }
    for (const c of [...R.children]) if (c !== top) c.visible = false;          // 小模型收起來
    top.visible = true; st.ready = true;
    st.unload = () => {                                                  // 平板記憶體不夠:離開時卸掉(幾何、材質、貼圖都釋放),換回小模型,之後要再進來會重新載
      st.ready = false; st.loading = null; st.hits = []; st.props = null; st.tick = null; top.visible = false;
      top.traverse((o) => { if (o.geometry) o.geometry.dispose(); for (const mm of [].concat(o.material || [])) { for (const k in mm) if (mm[k]?.isTexture) mm[k].dispose(); mm.dispose?.(); } });
      if (mirror) mirror.dispose?.(); top.clear(); st.mirror = null;
      for (const c of R.children) if (c !== top) c.visible = true;
    };
  }).catch((e) => { console.warn('[rooms] 房間模型載入失敗,用小模型', key, e); });
  return st;
}

export function buildRoom(parent, room, ctx) {
  const R = shell(parent, room.cfg);
  const api = D[room.key](R, ctx) || {};
  const real = REAL[room.key] ? realRoom(R, room.key, ctx) : null;
  return { group: R, real, update: (t, dt) => { if (!real?.ready) api.update?.(t, dt); else real.tick?.(t); } };
}
