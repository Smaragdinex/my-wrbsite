// 星際戰艦外觀(照使用者給的設定圖):長而厚的裝甲艦身、鈍的艦首(正面兩道藍光縫)、
// 中後段一階一階往上疊的艦橋塔 + 天線、甲板上的雙管砲塔、側面亮著暖光的機庫口、
// 艦尾八角形引擎艙(2×2 四顆藍色引擎)、深灰裝甲板 + 很多橘色小窗 + 藍色燈條。艦首朝 -z、艦尾 +z。
import * as THREE from 'three';
import { mat, glow, cyl, rand } from './kit.mjs';

// 裝甲板貼圖:大小不一的長方形板塊 + 接縫(顏色由材質決定,貼圖只給明暗)
function plateTex(seed = 5) {
  const N = 1024, r = rand(seed), c = document.createElement('canvas'); c.width = c.height = N; const g = c.getContext('2d');
  g.fillStyle = '#cfd2d8'; g.fillRect(0, 0, N, N);
  for (let i = 0; i < 300; i++) {
    const w = 60 + r() * 260, h = 40 + r() * 140, x = r() * N, y = r() * N, v = 192 + r() * 34 | 0;
    g.fillStyle = `rgb(${v},${v + 2},${v + 6})`; g.fillRect(x, y, w, h);
    g.strokeStyle = 'rgba(30,34,44,.4)'; g.lineWidth = 2.5; g.strokeRect(x, y, w, h);
    if (r() < .12) { g.fillStyle = 'rgba(30,34,44,.35)'; for (let k = 0; k < 4; k++) g.fillRect(x + 6, y + 6 + k * 6, w - 12, 2); }   // 通風格柵
  }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  t.repeat.set(1 / 20, 1 / 20); return t;
}
// 機庫內部:暖光、天花板燈、地板、一排排貨箱和小飛機的剪影
function hangarTex() {
  const W = 512, H = 192, c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
  const bg = g.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, '#2a1d14'); bg.addColorStop(.55, '#6b4325'); bg.addColorStop(1, '#c98a4a');
  g.fillStyle = bg; g.fillRect(0, 0, W, H);
  for (let x = 10; x < W; x += 34) { g.fillStyle = '#ffe2b0'; g.fillRect(x, 10, 18, 4); }          // 天花板燈
  g.fillStyle = 'rgba(20,14,10,.75)'; for (let x = 0; x < W; x += 64) g.fillRect(x, 0, 6, H);   // 結構柱
  const r = rand(3);
  for (let i = 0; i < 22; i++) { const x = r() * W, w = 14 + r() * 26, h = 12 + r() * 26; g.fillStyle = `rgba(${40 + r() * 30 | 0},${30 + r() * 20 | 0},${24},.9)`; g.fillRect(x, H - 22 - h, w, h); }
  g.fillStyle = 'rgba(25,18,14,.9)'; for (const x of [120, 330]) { g.beginPath(); g.moveTo(x, H - 40); g.lineTo(x + 70, H - 52); g.lineTo(x + 90, H - 40); g.lineTo(x + 70, H - 34); g.closePath(); g.fill(); }
  g.fillStyle = 'rgba(255,220,160,.6)'; g.fillRect(0, H - 22, W, 3);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function glowTex() {
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(.3, 'rgba(255,255,255,.4)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128); return new THREE.CanvasTexture(c);
}

export function createExterior(scene) {
  const root = new THREE.Group(); scene.add(root);
  const ship = new THREE.Group(); root.add(ship);
  const r = rand(7), tex = plateTex();
  const armor = (color, rough = .58) => new THREE.MeshStandardMaterial({ color, map: tex, roughness: rough, metalness: .5, envMapIntensity: .6 });
  const M = { hull: armor(0x7d828e), light: armor(0x9a9fa9), dark: armor(0x4a4f5a, .7), deep: mat(0x23262e, { roughness: .8, metalness: .3 }) };
  const BLUE = 0x5fb4ff, ORANGE = 0xffb25e;

  // 八角斷面的長方塊(四個角削掉):沿 z 擠出;front 讓前端收窄(艦首用)
  function block(w, h, z0, z1, { x = 0, y = 0, c = .25, m = M.hull, front = 0, frontK = 1, shadow = true } = {}) {
    const ch = Math.min(c * Math.min(w, h), w / 2 - .01, h / 2 - .01), s = new THREE.Shape();
    s.moveTo(-w / 2 + ch, -h / 2); s.lineTo(w / 2 - ch, -h / 2); s.lineTo(w / 2, -h / 2 + ch); s.lineTo(w / 2, h / 2 - ch);
    s.lineTo(w / 2 - ch, h / 2); s.lineTo(-w / 2 + ch, h / 2); s.lineTo(-w / 2, h / 2 - ch); s.lineTo(-w / 2, -h / 2 + ch); s.closePath();
    const g = new THREE.ExtrudeGeometry(s, { depth: z1 - z0, bevelEnabled: true, bevelThickness: .08, bevelSize: .06, bevelSegments: 1, steps: front ? 4 : 1 });
    g.translate(0, 0, z0);
    if (front) { const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) { const z = p.getZ(i); if (z < z0 + front) { const k = frontK + (1 - frontK) * Math.max(0, (z - z0) / front); p.setX(i, p.getX(i) * k); p.setY(i, p.getY(i) * (.6 + .4 * k)); } }
      g.computeVertexNormals(); }
    const mesh = new THREE.Mesh(g, m); mesh.position.set(x, y, 0); mesh.castShadow = shadow; mesh.receiveShadow = true; ship.add(mesh); return mesh;
  }
  const wins = [], greeb = [];     // 之後一次做成 InstancedMesh
  // 側面一排排小窗:兩側、每一列 y、沿 z 隨機間隔
  function windowRows(xAbs, ys, z0, z1, p = .55) {
    for (const s of [-1, 1]) for (const y of ys) for (let z = z0; z < z1; z += .32 + r() * .3) if (r() < p) wins.push([s * xAbs, y, z]);
  }
  // 頂面(y > 0 往上長)或底面(y < 0 往下長)的小結構:管線箱、天線座、散熱片
  function scatter(x0, x1, z0, z1, y, n, hMax = .5) {
    for (let i = 0; i < n; i++) greeb.push([x0 + r() * (x1 - x0), y, z0 + r() * (z1 - z0), .2 + r() * .9, .08 + r() * hMax, .2 + r() * 1.2]);
  }
  function stripLine(x, y, z0, z1, color = BLUE, th = .09) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(th, th, z1 - z0), glow(color, 3)); b.position.set(x, y, (z0 + z1) / 2); ship.add(b); return b;
  }

  // 1) 下艦身(最厚的那段)+ 艦首:前端收窄成鈍的楔形
  block(13, 6.2, -30, 25, { y: 0, c: .22, front: 7, frontK: .72 });
  block(10.4, 4.4, -33.4, -27, { y: -.2, c: .28, m: M.dark });                         // 艦首最前端那塊深色鼻子
  for (const s of [-1, 1]) {                                                          // 艦首正面兩道直的藍光縫
    const slit = new THREE.Mesh(new THREE.BoxGeometry(.55, 2.6, .1), glow(BLUE, 4)); slit.position.set(s * 2.4, -.1, -33.52); ship.add(slit);
  }
  block(8.5, 2.2, -24, 20, { y: -3.7, c: .3, m: M.dark });                            // 艦腹龍骨
  scatter(-3.6, 3.6, -22, 18, -4.9, 50, .4);
  // 側面分段的大裝甲板(中間留一段給機庫口)
  let seg = 0;
  for (const s of [-1, 1]) for (let z = -26; z < 23; z += 6.2) {
    if (z > -3 && z < 9) continue;
    block(.7, 4.6, z, z + 5.9, { x: s * 6.7, y: .2, c: .3, m: seg++ % 2 ? M.light : M.hull });
  }
  for (const s of [-1, 1]) {
    block(.9, .7, -29, 24, { x: s * 6.6, y: -2.6, c: .3, m: M.deep });                 // 下緣深色溝
    stripLine(s * 7.1, -2.6, -27, 22);                                               // 下緣藍燈條
    stripLine(s * 7.08, 2.55, -24, 21, BLUE, .07);
  }
  windowRows(7.08, [-1.6, -1.05, 1.0, 1.55], -26, 23, .42);

  // 2) 機庫口(兩側):暖光內部 + 黑色框 + 欄杆
  const hT = hangarTex(), hangarGlow = glow(0x7fd0ff, 1.5), hangarHits = [], hangarInside = [];
  for (const s of [-1, 1]) {
    const inside = new THREE.Mesh(new THREE.PlaneGeometry(11.6, 3.6), new THREE.MeshStandardMaterial({ map: hT, emissiveMap: hT, emissive: 0xffffff, emissiveIntensity: 1.3, roughness: 1 }));
    inside.position.set(s * 6.6, .3, 3); inside.rotation.y = s * Math.PI / 2; ship.add(inside);
    block(.9, .5, -3.2, 9.2, { x: s * 6.7, y: 2.35, c: .3, m: M.dark }); block(.9, .5, -3.2, 9.2, { x: s * 6.7, y: -1.75, c: .3, m: M.dark });
    for (const z of [-3, 1, 5, 9]) block(.9, 4.6, z - .25, z + .25, { x: s * 6.7, y: .3, c: .2, m: M.dark });
    const rail = new THREE.Mesh(new THREE.BoxGeometry(.05, .05, 11.6), glow(ORANGE, 1.6)); rail.position.set(s * 6.9, -1.1, 3); ship.add(rail);
    // 入口外圈的發光框(平常慢慢呼吸,滑鼠移上去變亮)+ 比較大的隱形點擊範圍
    for (const [y, z, h, d] of [[2.66, 3, .1, 12.9], [-2.06, 3, .1, 12.9], [.3, -3.48, 4.8, .1], [.3, 9.48, 4.8, .1]]) {
      const e = new THREE.Mesh(new THREE.BoxGeometry(.08, h, d), hangarGlow); e.position.set(s * 7.18, y, z); ship.add(e);
    }
    const hit = new THREE.Mesh(new THREE.BoxGeometry(2.2, 6, 14), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })); hit.position.set(s * 7, .3, 3); ship.add(hit); hangarHits.push(hit);
    hangarInside.push(inside.material);
  }

  // 3) 上甲板 + 一階一階的艦橋塔
  block(11.4, 2.2, -28, 22, { y: 4.1, c: .3, front: 6, frontK: .8 });
  const deckTop = 5.2;
  const trench = new THREE.Mesh(new THREE.BoxGeometry(1.1, .12, 22), M.deep); trench.position.set(0, deckTop + .02, -16); ship.add(trench);   // 前甲板中間的深色長溝
  stripLine(0, deckTop + .1, -27, -5, BLUE, .06);
  scatter(-5, -1.2, -27, -6, deckTop, 26); scatter(1.2, 5, -27, -6, deckTop, 26);
  windowRows(5.76, [3.7, 4.4], -26, 21, .5);
  const tiers = [ // [寬, 高, z0, z1, 底 y]
    [9.6, 1.7, -9, 21, deckTop], [7.6, 1.6, -4, 19, deckTop + 1.7], [5.8, 1.5, 0, 16, deckTop + 3.3], [4.2, 1.4, 3, 13.5, deckTop + 4.8], [2.8, 1.3, 5, 10.5, deckTop + 6.2],
  ];
  tiers.forEach(([w, h, z0, z1, y0], i) => {
    block(w, h, z0, z1, { y: y0 + h / 2, c: .3, m: i % 2 ? M.light : M.hull, front: 1.4, frontK: .8 });
    windowRows(w / 2 + .05, [y0 + h * .45, y0 + h * .72], z0 + .6, z1 - .4, .6);
    if (i < 3) scatter(-w / 2 + .3, w / 2 - .3, z0 + .5, z1 - .5, y0 + h, 14 - i * 3, .35);
  });
  // 艦橋前窗(藍)+ 尖塔天線
  const bridgeY = deckTop + 6.2 + .75;
  const bw = new THREE.Mesh(new THREE.BoxGeometry(2.4, .26, .06), glow(0xbfe6ff, 3.2)); bw.position.set(0, bridgeY, 4.93); ship.add(bw);
  const bw2 = new THREE.Mesh(new THREE.BoxGeometry(3.8, .22, .06), glow(BLUE, 2.6)); bw2.position.set(0, deckTop + 4.8 + .9, 2.93); ship.add(bw2);
  const spireM = mat(0x8d929d, { roughness: .45, metalness: .6 });
  for (const [x, z, h, rr] of [[0, 7.5, 5.2, .22], [.9, 9.4, 3.2, .12], [-1, 9, 2.6, .12], [2.4, 12, 2.2, .14], [-2.6, 12.5, 2.6, .14], [3.6, 16, 2, .12], [-3.4, 3, 1.8, .12], [4.4, 0, 1.6, .1], [-4.6, 17, 1.8, .12]]) {
    const yb = x === 0 ? deckTop + 7.5 : (Math.abs(x) < 2 ? deckTop + 6.2 : Math.abs(x) < 3 ? deckTop + 4.8 : deckTop + 3.3);
    const c = new THREE.Mesh(new THREE.ConeGeometry(rr, h, 8), spireM); c.position.set(x, yb + h / 2, z); c.castShadow = true; ship.add(c);
  }
  cyl(ship, .05, .05, 2.2, 0x9aa0ab, { y: deckTop + 7.5 + 4.5, z: 7.5, rz: Math.PI / 2, m: { metalness: .6 } });   // 天線橫桿

  // 4) 砲塔(雙管,朝前)
  function turret(x, y, z, s = 1) {
    const g = new THREE.Group(); g.position.set(x, y, z); g.scale.setScalar(s); ship.add(g);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.25, .45, 8), M.dark); base.position.y = .22; base.castShadow = true; g.add(base);
    const shp = new THREE.Shape(); shp.moveTo(-1.1, 0); shp.lineTo(1.1, 0); shp.lineTo(.9, .9); shp.lineTo(-.6, .9); shp.lineTo(-1.1, .4); shp.closePath();
    const hg = new THREE.ExtrudeGeometry(shp, { depth: 1.8, bevelEnabled: false }); hg.translate(0, 0, -.9); hg.rotateY(-Math.PI / 2);
    const head = new THREE.Mesh(hg, M.hull); head.position.y = .45; head.castShadow = true; g.add(head);
    for (const bx of [-.35, .35]) { const b = new THREE.Mesh(new THREE.CylinderGeometry(.11, .14, 2.8, 10), M.light); b.rotation.x = Math.PI / 2; b.position.set(bx, .9, -2.3); b.castShadow = true; g.add(b); }
    return g;
  }
  turret(0, deckTop, -23, 1.05); turret(0, deckTop, -17); turret(-3.3, deckTop, -11, .85); turret(3.3, deckTop, -11, .85);
  turret(0, deckTop + 1.7, -7, .9); turret(0, deckTop + 3.3, 17.5, .8);

  // 5) 側邊八角形艙(後段兩側,外側一道藍光縫)+ 艦尾引擎艙(2×2 藍色引擎)
  for (const s of [-1, 1]) {
    block(2.6, 5.4, 11, 21, { x: s * 7.6, y: 1.2, c: .32, m: M.hull });
    const slit = new THREE.Mesh(new THREE.BoxGeometry(.06, 2.6, .6), glow(BLUE, 4)); slit.position.set(s * 8.94, 1.2, 16); ship.add(slit);
    windowRows(8.95, [3.2, -.9], 11.4, 20.6, .5);
    block(2.2, 3.6, 22, 30, { x: s * 6.4, y: 6.4, c: .3, m: M.light });              // 引擎艙上方兩側的方塊
  }
  block(14.2, 10.4, 22, 30.5, { y: 1.4, c: .3, m: M.hull });
  scatter(-6, 6, 22.5, 30, 6.6, 24, .5);
  windowRows(7.15, [-2, 4.4, 5], 22.4, 30, .5);
  const gt = glowTex(), flames = [];
  const fl = (() => { const c = document.createElement('canvas'); c.width = 32; c.height = 256; const g = c.getContext('2d'); const gr = g.createLinearGradient(0, 0, 0, 256);
    gr.addColorStop(0, 'rgba(190,225,255,.9)'); gr.addColorStop(.25, 'rgba(90,160,255,.6)'); gr.addColorStop(1, 'rgba(40,90,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 32, 256);
    const t = new THREE.CanvasTexture(c); t.flipY = false; return t; })();
  for (const [x, y] of [[-3.4, -1.1], [3.4, -1.1], [-3.4, 3.9], [3.4, 3.9]]) {
    const nz = 31.4, rr = 2.05;
    const n = new THREE.Mesh(new THREE.CylinderGeometry(rr * 1.1, rr * 1.2, 2, 8), M.dark); n.rotation.set(Math.PI / 2, Math.PI / 8, 0); n.position.set(x, y, nz); n.castShadow = true; ship.add(n);
    const ring = new THREE.Mesh(new THREE.RingGeometry(rr * .62, rr * .9, 8, 1, Math.PI / 8), glow(BLUE, 3)); ring.position.set(x, y, nz + 1.02); ship.add(ring);
    const core = new THREE.Mesh(new THREE.CircleGeometry(rr * .62, 24), glow(0x9fd6ff, 2.6)); core.position.set(x, y, nz + 1.0); ship.add(core);
    const cone = new THREE.Mesh(new THREE.ConeGeometry(rr * .55, rr * 1.4, 24, 1, true), new THREE.MeshBasicMaterial({ map: fl, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    cone.geometry.translate(0, rr * .7, 0); cone.rotation.x = Math.PI / 2; cone.position.set(x, y, nz + 1.0); ship.add(cone);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: gt, color: 0x7fc4ff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); halo.scale.setScalar(rr * 3.6); halo.position.set(x, y, nz + 1.4); ship.add(halo);
    flames.push({ cone, halo, ph: r() * 6 });
  }

  // 6) InstancedMesh:橘色小窗、頂面 / 底面小結構
  { const im = new THREE.InstancedMesh(new THREE.BoxGeometry(.06, .13, .2), glow(ORANGE, 2.6), wins.length), m4 = new THREE.Matrix4();
    wins.forEach((p, i) => { m4.makeTranslation(...p); im.setMatrixAt(i, m4); }); ship.add(im); }
  { const im = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), M.dark, greeb.length), m4 = new THREE.Matrix4(), q = new THREE.Quaternion();
    greeb.forEach(([x, y, z, sx, sy, sz], i) => { const dn = y < 0 ? -1 : 1; m4.compose(new THREE.Vector3(x, y + dn * sy / 2, z), q, new THREE.Vector3(sx, sy, sz)); im.setMatrixAt(i, m4); });
    im.castShadow = im.receiveShadow = true; ship.add(im); }

  // 7) 航行燈:左紅右綠、塔頂白色閃光、艦首兩顆
  const blink = [];
  for (const [x, y, z, col, rate, ph] of [[-7.4, -2.6, 24, 0xff5a5a, .9, .2], [7.4, -2.6, 24, 0x5cff9a, .9, .2], [0, deckTop + 7.5 + 5.3, 7.5, 0xffffff, 1.4, 0], [-4.6, 2.2, -33.4, 0xffffff, 1.1, .5], [4.6, 2.2, -33.4, 0xffffff, 1.1, .5]]) {
    const l = new THREE.Mesh(new THREE.SphereGeometry(.2, 12, 8), glow(col, 4)); l.position.set(x, y, z); ship.add(l);
    const h = new THREE.Sprite(new THREE.SpriteMaterial({ map: gt, color: col, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); h.scale.setScalar(2.6); h.position.copy(l.position); ship.add(h);
    blink.push({ l, h, rate, ph });
  }

  // 太陽光(有陰影,讓一層層的結構有立體感)+ 冷色輪廓光
  const sun = new THREE.DirectionalLight(0xfff1e0, 3.2); sun.position.set(40, 70, 10); sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera, { near: 10, far: 200, left: -40, right: 40, top: 40, bottom: -40 }); sun.shadow.bias = -.0006; sun.shadow.normalBias = .05;
  root.add(sun); root.add(sun.target);
  const rim = new THREE.DirectionalLight(0x8fb6ff, 1.4); rim.position.set(-50, 10, -60); root.add(rim);

  let hov = 0;
  return {
    root, ship, hangarHits,
    hangarWorld: (side = 1) => ship.localToWorld(new THREE.Vector3(side * 6.6, .3, 3)),   // 機庫口中心(side = 哪一側)
    update(t, hover = false) {
      hov += ((hover ? 1 : 0) - hov) * .12;
      hangarGlow.emissiveIntensity = 1.2 + (Math.sin(t * 2.4) * .5 + .5) * 1.4 + hov * 4;
      for (const m of hangarInside) m.emissiveIntensity = 1.3 + hov * 1.2;
      ship.position.y = Math.sin(t * .35) * .5; ship.rotation.z = Math.sin(t * .25) * .02;
      for (const f of flames) { const k = .85 + Math.sin(t * 21 + f.ph) * .08 + Math.sin(t * 33 + f.ph * 2) * .05; f.cone.scale.set(1, k, 1); f.halo.material.opacity = .65 + (k - .85) * 2; }
      for (const b of blink) { const on = ((t * b.rate + b.ph) % 1) < .16; b.l.material.emissiveIntensity = on ? 6 : .3; b.h.material.opacity = on ? 1 : .05; }
    },
  };
}
