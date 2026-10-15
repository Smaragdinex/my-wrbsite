// 艦內:①機庫 → 通道(鏡頭穿過兩道會滑開的艙門)②中央大廳(太空站控制中心的剖面:
// 圓形地板、後半圈弧形艙壁上六道艙門,一道門通一間作品艙;中間是全息投影台 + 迷你戰艦投影)。
// 跟作品艙同一套微縮模型風格(圓角方塊、白色艙壁面板、彩色發光線)。
import * as THREE from 'three';
import { mat, glow, box, cyl, group, panelTex, leafyPlant, textTex } from './kit.mjs';

// 圓環的一段(俯視是扇形環),沿 y 擠出:做弧形艙壁用。b0/b1 是方位角(0 = 正後方 -z,正值往 +x)
function ringSector(r0, r1, b0, b1, h, m) {
  const s = new THREE.Shape(), t0 = Math.PI / 2 - b0, t1 = Math.PI / 2 - b1;
  s.absarc(0, 0, r1, t0, t1, true); s.absarc(0, 0, r0, t1, t0, false); s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: h, bevelEnabled: false, curveSegments: 48 });
  g.rotateX(-Math.PI / 2);                       // 形狀的 (x, y) → 世界 (x, -z),擠出方向 → +y
  const mesh = new THREE.Mesh(g, m); mesh.castShadow = mesh.receiveShadow = true; return mesh;
}

export const HALL_R = 7.2;
const DOOR_W = 1.9, DOOR_H = 3.0, WALL_H = 4.6;

export function createHall(scene, rooms) {
  const root = new THREE.Group(); scene.add(root);
  const n = rooms.length, span = 150 * Math.PI / 180;
  const bearings = rooms.map((_, i) => -span / 2 + span * (i + .5) / n);   // 六道門平均排在後半圈

  // 地板:厚圓底座 + 金屬面板地板 + 兩圈發光環
  cyl(root, 7.9, 7.9, .6, 0xc9d3e6, { y: -.3, seg: 96 });
  const ft = panelTex('#9aa3b8', 'rgba(40,46,64,.4)', 1024, 1024, 6, 6); ft.repeat.set(2, 2);
  cyl(root, 7.7, 7.7, .05, new THREE.MeshStandardMaterial({ map: ft, roughness: .45, metalness: .45 }), { y: .025, seg: 96 });
  for (const [r0, r1, c] of [[7.72, 7.88, 0x6cc6ff], [2.15, 2.25, 0x6cc6ff], [5.0, 5.06, 0x9fd6ff]]) {
    const ring = new THREE.Mesh(new THREE.RingGeometry(r0, r1, 96), glow(c, 2.2)); ring.rotation.x = -Math.PI / 2; ring.position.y = r0 > 7 ? .005 : .06; root.add(ring);
  }

  // 弧形艙壁:門與門之間是整片牆,門上方是門楣;牆頂一圈發光線
  const wallM = new THREE.MeshStandardMaterial({ map: panelTex('#e9edf5', 'rgba(70,80,120,.22)', 1024, 1024, 3, 3), roughness: .7 });
  const lowM = mat(0xb9c4dc);
  const half = (DOOR_W / 2 + .3) / HALL_R, B0 = -97 * Math.PI / 180, B1 = 97 * Math.PI / 180;
  let prev = B0;
  for (const b of [...bearings, B1 + half]) {
    if (b - half > prev + .001) {
      root.add(ringSector(HALL_R, HALL_R + .45, prev, b - half, WALL_H, wallM));
      const low = ringSector(HALL_R - .05, HALL_R, prev, b - half, 1.0, lowM); root.add(low);
    }
    prev = b + half;
  }
  for (const b of bearings) { const lin = ringSector(HALL_R, HALL_R + .45, b - half, b + half, WALL_H - DOOR_H - .3, wallM); lin.position.y = DOOR_H + .3; root.add(lin); }
  const topGlow = ringSector(HALL_R - .06, HALL_R, B0, B1, .06, glow(0x6cc6ff, 2.4)); topGlow.position.y = WALL_H - .2; root.add(topGlow);
  const midGlow = ringSector(HALL_R - .08, HALL_R - .02, B0, B1, .04, glow(0x9fd6ff, 1.6)); midGlow.position.y = 1.02; root.add(midGlow);

  // 六道艙門:門框 + 彩色發光邊 + 兩片會滑開的門板 + 門上招牌 + 門後的彩色光(開門時看得到)+ 地上通往門口的發光線
  const doors = rooms.map((room, i) => {
    const b = bearings[i], acc = room.cfg.accent;
    const g = group(root, Math.sin(b) * HALL_R, 0, -Math.cos(b) * HALL_R, -b);
    for (const x of [-1, 1]) box(g, .26, DOOR_H + .3, .55, 0xdfe6f2, { x: x * (DOOR_W / 2 + .13), y: (DOOR_H + .3) / 2, z: .1, r: .05 });
    box(g, DOOR_W + .52, .3, .55, 0xdfe6f2, { y: DOOR_H + .15, z: .1, r: .05 });
    const edgeM = glow(acc, 2.2);
    for (const [x, y, w, h] of [[-(DOOR_W / 2 + .02), DOOR_H / 2, .05, DOOR_H], [DOOR_W / 2 + .02, DOOR_H / 2, .05, DOOR_H], [0, DOOR_H + .02, DOOR_W + .1, .05]]) {
      const e = new THREE.Mesh(new THREE.BoxGeometry(w, h, .04), edgeM); e.position.set(x, y, .39); g.add(e);
    }
    const behind = new THREE.Mesh(new THREE.PlaneGeometry(DOOR_W, DOOR_H), new THREE.MeshBasicMaterial({ color: new THREE.Color(room.cfg.wall).multiplyScalar(.9), toneMapped: false }));
    behind.position.set(0, DOOR_H / 2, -.25); g.add(behind);
    const panels = [-1, 1].map((sx) => {
      const p = group(g, sx * DOOR_W / 4, 0, .05);
      box(p, DOOR_W / 2 - .02, DOOR_H - .04, .12, 0xf4f6fb, { y: DOOR_H / 2, r: .03 });
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(.06, DOOR_H * .7, .02), glow(acc, 1.8)); stripe.position.set(-sx * (DOOR_W / 4 - .12), DOOR_H / 2, .07); p.add(stripe);
      box(p, DOOR_W / 2 - .3, .5, .02, room.cfg.wallLow, { y: DOOR_H * .3, z: .07, r: .02 });
      return { p, sx };
    });
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.1, .5), new THREE.MeshBasicMaterial({
      map: textTex([`${String(i + 1).padStart(2, '0')}  ${room.hall || room.title}`], { w: 1024, h: 244, bg: '#141b33', color: '#ffffff', font: '700 80px "Helvetica Neue", sans-serif' }), toneMapped: false }));
    sign.position.set(0, DOOR_H + .78, .47); g.add(sign);
    box(g, 2.2, .6, .08, 0x2b3150, { y: DOOR_H + .78, z: .42, r: .03 });
    const lineM = glow(acc, 1.4);
    const line = new THREE.Mesh(new THREE.BoxGeometry(.08, .02, HALL_R - 2.6), lineM); line.position.set(0, .07, (HALL_R - 2.6) / 2 + .3); g.add(line);
    const hit = new THREE.Mesh(new THREE.BoxGeometry(2.6, 4.6, 1.6), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })); hit.position.set(0, 2.3, .4); g.add(hit);
    hit.userData.door = i;
    return { i, b, g, panels, edgeM, lineM, hit, open: 0, hover: 0,
      world: (dist = 0, y = 1.5) => g.localToWorld(new THREE.Vector3(0, y, dist)) };
  });

  // 中央全息投影台:底座 + 發光台面 + 迷你戰艦投影(會轉)+ 兩個轉環
  const ped = group(root, 0, 0, .4);
  cyl(ped, 1.25, 1.45, .8, 0xdfe6f2, { y: .4, seg: 48 });
  cyl(ped, 1.2, 1.2, .05, new THREE.MeshStandardMaterial({ color: 0x0b1530, emissive: 0x2a7fd0, emissiveIntensity: .9 }), { y: .83, seg: 48 });
  const holoM = new THREE.MeshBasicMaterial({ color: 0x4fa8ff, transparent: true, opacity: .16, depthWrite: false, blending: THREE.AdditiveBlending });
  const holoW = new THREE.MeshBasicMaterial({ color: 0x8fd4ff, wireframe: true, transparent: true, opacity: .55, depthWrite: false });
  const holo = group(ped, 0, 1.55, 0); holo.scale.setScalar(.62);
  for (const [w, h, d, y, z] of [[1.1, .5, 2.6, 0, 0], [.8, .3, 2.0, .38, .2], [.55, .3, 1.2, .66, .35], [.32, .32, .5, .95, .4]]) {
    const geo = new THREE.BoxGeometry(w, h, d);
    for (const m of [holoM, holoW]) { const mesh = new THREE.Mesh(geo, m); mesh.position.set(0, y, z); holo.add(mesh); }
  }
  const ringA = new THREE.Mesh(new THREE.TorusGeometry(1.0, .015, 8, 64), glow(0x7fd0ff, 2.4)); ringA.position.y = 1.15; ringA.rotation.x = Math.PI / 2; ped.add(ringA);
  const ringB = new THREE.Mesh(new THREE.TorusGeometry(1.45, .012, 8, 64), glow(0x9fd6ff, 1.8)); ringB.position.y = 1.75; ped.add(ringB);
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.1, .9, 1.6, 32, 1, true), new THREE.MeshBasicMaterial({ color: 0x5fb4ff, transparent: true, opacity: .05, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
  beam.position.y = 1.65; ped.add(beam);

  // 前方兩側的操控台(斜面發光螢幕)+ 椅子 + 植物
  for (const s of [-1, 1]) {
    const c = group(root, s * 3.5, 0, 3.2, s * .6);
    box(c, 1.8, .85, .7, 0xdfe6f2, { y: .43, r: .06 });
    box(c, 1.7, .08, .8, 0xb9c4dc, { y: .9, z: .05, rx: .35, r: .03 });
    for (const x of [-.45, .45]) { const scr = new THREE.Mesh(new THREE.PlaneGeometry(.7, .4), glow(s > 0 ? 0x7fe0a0 : 0x7fd0ff, 1.4)); scr.position.set(x, .96, .06); scr.rotation.x = -(Math.PI / 2 - .35); c.add(scr); }
    const ch = group(c, 0, 0, 1.0); cyl(ch, .05, .05, .45, 0xc9ced9, { y: .23 }); box(ch, .55, .1, .55, 0x6cc6ff, { y: .5, r: .04 }); box(ch, .55, .55, .1, 0x6cc6ff, { y: .78, z: .25, r: .04 });
  }
  leafyPlant(root, { x: -6.3, z: 2.4, pot: 0xffffff }); leafyPlant(root, { x: 6.3, z: 2.4, pot: 0xffffff });

  // 燈:大廳自己的暖白點光
  const lamp = new THREE.PointLight(0xe8f2ff, 9, 16, 1.4); lamp.position.set(0, 5.5, 0); root.add(lamp);
  const holoLight = new THREE.PointLight(0x6cc6ff, 6, 6, 1.6); holoLight.position.set(0, 2, .4); root.add(holoLight);

  return {
    root, doors, hits: doors.map((d) => d.hit),
    update(t, dt) {
      holo.rotation.y = t * .35; ringA.rotation.z = t * .6; ringB.rotation.y = -t * .4; ringB.rotation.x = .3 + Math.sin(t * .5) * .1;
      for (const d of doors) {
        const k = Math.max(d.open, d.hover * .22);
        d.panels.forEach(({ p, sx }) => { p.position.x = sx * (DOOR_W / 4 + k * (DOOR_W / 2 - .05)); });
        d.edgeM.emissiveIntensity = 2.2 + d.hover * 2.5 + Math.sin(t * 3 + d.i) * .25 * d.hover;
        d.lineM.emissiveIntensity = 1.4 + d.hover * 2.4;
      }
    },
  };
}

// 機庫 → 通道:八角形的長走道(艙壁面板、每隔一段一圈肋骨、天花板燈、地上兩條藍燈),兩道會滑開的艙門
export function createCorridor(scene) {
  const root = new THREE.Group(); scene.add(root);
  scene.fog = new THREE.Fog(0x0a0f1e, 12, 52);
  const L = 70, R = 3.0;
  const wt = panelTex('#dfe4ee', 'rgba(70,80,120,.3)', 1024, 1024, 4, 4); wt.repeat.set(2, 18);
  const tube = new THREE.Mesh(new THREE.CylinderGeometry(R, R, L, 8, 1, true), new THREE.MeshStandardMaterial({ map: wt, roughness: .6, side: THREE.BackSide }));
  tube.rotation.set(Math.PI / 2, 0, 0); tube.rotateY(Math.PI / 8); tube.position.z = -L / 2 + 16; tube.receiveShadow = true; root.add(tube);
  const ap = R * Math.cos(Math.PI / 8);
  const ft = panelTex('#5a6378', 'rgba(20,24,36,.6)', 512, 1024, 2, 8); ft.repeat.set(1, 10);
  box(root, 2.4, .06, L, new THREE.MeshStandardMaterial({ map: ft, roughness: .5, metalness: .5 }), { y: -ap + .03, z: -L / 2 + 16, r: 0, shadow: false });
  for (const x of [-1.25, 1.25]) { const s = new THREE.Mesh(new THREE.BoxGeometry(.07, .05, L), glow(0x5fb4ff, 2.6)); s.position.set(x, -ap + .06, -L / 2 + 16); root.add(s); }
  const ribM = mat(0xb9c4dc, { roughness: .4, metalness: .4 });
  for (let z = 14; z > -L + 16; z -= 4) {
    const rib = new THREE.Mesh(new THREE.TorusGeometry(R - .05, .16, 6, 8), ribM); rib.rotation.z = Math.PI / 8; rib.position.z = z; root.add(rib);
    const lt = new THREE.Mesh(new THREE.BoxGeometry(1.2, .06, .3), glow(0xfff2dc, 3)); lt.position.set(0, ap - .05, z - 2); root.add(lt);
    for (const s of [-1, 1]) { const w = new THREE.Mesh(new THREE.BoxGeometry(.04, .5, 1.2), glow(0x9fd6ff, 1.2)); w.position.set(s * (ap - .03), .4, z - 2); root.add(w); }
  }
  // 艙門:八角框 + 左右兩片門板(往兩邊滑開)
  function door(z, color) {
    const g = group(root, 0, 0, z);
    const frame = new THREE.Mesh(new THREE.TorusGeometry(R - .2, .35, 6, 8), mat(0x8c96ad, { metalness: .5, roughness: .35 })); frame.rotation.z = Math.PI / 8; g.add(frame);
    const edge = new THREE.Mesh(new THREE.TorusGeometry(R - .55, .03, 4, 8), glow(color, 2.6)); edge.rotation.z = Math.PI / 8; g.add(edge);
    const panels = [-1, 1].map((s) => {
      const p = group(g, 0, 0, 0);
      box(p, R - .1, (R - .2) * 2, .2, 0xe8ecf4, { x: s * (R - .1) / 2, r: .04 });
      const st = new THREE.Mesh(new THREE.BoxGeometry(.08, R * 1.2, .02), glow(color, 2)); st.position.set(s * .15, 0, .12); p.add(st);
      return { p, s };
    });
    return { set(k) { panels.forEach(({ p, s }) => { p.position.x = s * k * (R - .1); }); } };
  }
  const d1 = door(0, 0x6cc6ff), d2 = door(-44, 0xffb35c);
  // 走道盡頭的光(大廳)
  const endGlow = new THREE.Mesh(new THREE.PlaneGeometry(6, 6), new THREE.MeshBasicMaterial({ color: 0xeaf4ff, toneMapped: false })); endGlow.position.z = -48; root.add(endGlow);
  scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x2a2f48, 1.1));
  for (const z of [8, -8, -24, -40]) { const l = new THREE.PointLight(0xffeedd, 14, 18, 1.5); l.position.set(0, 1.8, z); root.add(l); }
  const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  return {
    root, START: 13, END: -47,
    // 依鏡頭目前的 z 開門(靠近時滑開)
    update(camZ) { d1.set(smooth(9, 3, camZ)); d2.set(smooth(-33, -39, camZ)); },
  };
}
