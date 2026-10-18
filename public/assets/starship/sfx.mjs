// 首頁的介面音效(全部用 Web Audio 即時合成,不用載音檔):
//   hover 滑過可互動的東西:輕輕一聲「滴」;click 按下:清脆的確認音;open 機庫大門滑開:低沉的嗡聲 + 氣流;
//   whoosh 飛進門 / 退出:一陣風聲;swish 左右換艙:短短的刷一聲;greet 點機器人時它的電子招呼聲。
// 瀏覽器規定要使用者先點一下(或按鍵)才能出聲,所以第一次互動之前是靜音的。右下角的喇叭可以關掉音效(記在 localStorage)。
// 另外:背景音樂(Cat Street 3D 房間電台的歌單,從「Vastness」開始,串流播放;左下角有播放器)、
//       超空間音效(充能嗡聲 → 跳躍時往上衝的掃頻 + 風聲 → 隧道裡的轟隆聲 + 星線從左右呼嘯而過 → 跳出時一聲低沉的「轟」+ 抵達的鐘聲)、
//       點左上頭盔的機器人叫聲。全部共用同一個開關。
let ctx = null, master = null, muted = false, lastHover = 0;
try { muted = localStorage.getItem('xarts-sfx') === 'off'; } catch {}

function ac() {
  if (!ctx) { const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null;
    ctx = new AC(); master = ctx.createGain(); master.gain.value = .55; master.connect(ctx.destination); }
  return ctx;
}
function unlock() { try { const c = ac(); if (!c) return; if (musicAllowed && !muted && !userPaused) musicElement().play().catch(() => {}); const go = () => { if (!muted) startMusic(); }; if (c.state === 'suspended') c.resume().then(go, () => {}); else go(); } catch {} }   // 音樂的 play() 要在點擊當下呼叫
for (const ev of ['pointerdown', 'keydown', 'touchend']) addEventListener(ev, unlock, { passive: true });
const ready = () => !muted && ctx && ctx.state === 'running';

// 一個音:頻率可滑動、快速起音、指數衰減
function tone(freq, { at = 0, dur = .12, type = 'sine', vol = .08, to = null, lp = null } = {}) {
  const t = ctx.currentTime + at, o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t); if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + .006); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
  let node = o; if (lp) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lp; o.connect(f); node = f; }
  node.connect(g); g.connect(master); o.start(t); o.stop(t + dur + .05);
}
// 一段濾過的雜訊(風聲 / 氣流):帶通濾波的頻率從 f0 滑到 f1
let noiseBuf = null;
function noise({ at = 0, dur = .6, vol = .06, f0 = 400, f1 = 2400, q = 1.2 } = {}) {
  if (!noiseBuf) { noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
  const t = ctx.currentTime + at, s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  s.buffer = noiseBuf; f.type = 'bandpass'; f.Q.value = q; f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(f1, t + dur);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + dur * .35); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
  s.connect(f); f.connect(g); g.connect(master); s.start(t); s.stop(t + dur + .05);
}

export const sfx = {
  hover() { if (!ready()) return; const now = performance.now(); if (now - lastHover < 70) return; lastHover = now;
    tone(1900, { dur: .07, type: 'triangle', vol: .035, to: 2400 }); },
  click() { if (!ready()) return; tone(880, { dur: .1, vol: .07 }); tone(1320, { at: .055, dur: .16, vol: .06 }); tone(2640, { at: .055, dur: .08, vol: .015 }); },
  open() { if (!ready()) return; tone(95, { dur: 1.1, type: 'sawtooth', vol: .05, to: 70, lp: 380 }); noise({ dur: 1.1, vol: .05, f0: 300, f1: 1400, q: .8 }); tone(1500, { at: .9, dur: .12, type: 'triangle', vol: .03 }); },
  whoosh(inward = true) { if (!ready()) return; noise(inward ? { dur: .8, vol: .07, f0: 350, f1: 2600 } : { dur: .7, vol: .06, f0: 2400, f1: 380 }); },
  // 機器人打招呼:「嗶—嘟嗶!」上揚的電子啁啾,笑臉亮起時再「叮叮」兩聲;第一次互動就點機器人的話,等聲音解鎖再播
  greet() { if (muted) return; const c = ac(); if (!c) return; if (c.state !== 'running') { c.resume().then(() => sfx.greet()).catch(() => {}); return; }
    tone(880, { dur: .09, type: 'square', vol: .035, to: 1320, lp: 3200 }); tone(1320, { at: .11, dur: .07, type: 'square', vol: .03, lp: 3200 });
    tone(990, { at: .2, dur: .14, type: 'square', vol: .034, to: 1760, lp: 3600 });
    tone(2093, { at: .42, dur: .22, type: 'sine', vol: .05 }); tone(2637, { at: .52, dur: .3, type: 'sine', vol: .045 }); tone(3136, { at: .6, dur: .35, type: 'triangle', vol: .02 }); },
  swish() { if (!ready()) return; noise({ dur: .28, vol: .045, f0: 1200, f1: 3400, q: 1.6 }); },
  // 點左上的頭盔:機器人「嗶—嘟—啵」(三種隨機)+ 一點閃亮聲;第一次互動就點的話等聲音解鎖再播
  robot() { if (muted) return; const c = ac(); if (!c) return; if (c.state !== 'running') { c.resume().then(() => { startMusic(); sfx.robot(); }).catch(() => {}); return; }
    const v = Math.random() * 3 | 0, o = { type: 'square', lp: 2600 };
    if (v === 0) { tone(660, { ...o, dur: .08, vol: .03, to: 990 }); tone(990, { ...o, at: .09, dur: .07, vol: .028, to: 740 }); tone(1180, { ...o, at: .18, dur: .12, vol: .03, to: 1760 }); }
    else if (v === 1) { tone(1320, { ...o, dur: .1, vol: .028, to: 660 }); tone(880, { ...o, at: .12, dur: .09, vol: .03, to: 1480 }); }
    else { for (let k = 0; k < 4; k++) tone(700 + k * 260, { ...o, at: k * .055, dur: .05, vol: .024 }); tone(1975, { ...o, at: .24, dur: .16, vol: .026, to: 2350 }); }
    tone(2637, { at: .3, dur: .3, type: 'sine', vol: .03 }); tone(3520, { at: .36, dur: .35, type: 'sine', vol: .018 }); },
  // 超空間:每幀由 main.mjs 呼叫(XP = window.__xp),依讀條 / 跳躍時間軸自己決定出什麼聲音
  hyperspace(XP) { hyper(XP); },
  enableMusic() { musicAllowed = true; musicElement(); notify(); if (ctx && ctx.state === 'running' && !muted) startMusic(); },
  music: {                                                             // 左下角播放器用
    get list() { return PLAYLIST; },                                   // getter:PLAYLIST 宣告在下面
    get index() { return trackI; },
    get playing() { return !!musicEl && !musicEl.paused && !muted; },
    play(i) { playTrack(i ?? trackI); },
    toggle() { if (this.playing) { userPaused = true; musicEl.pause(); notify(); } else playTrack(trackI); },
    next() { playTrack(trackI + 1); }, prev() { playTrack(trackI - 1); },
    on(f) { listeners.add(f); return () => listeners.delete(f); },
  },
  get muted() { return muted; },
  get unlocked() { return !!ctx && ctx.state === 'running'; },        // 瀏覽器允許出聲了沒(第一次點擊 / 按鍵 / 觸控之後)
  toggle() { muted = !muted; try { localStorage.setItem('xarts-sfx', muted ? 'off' : 'on'); } catch {}
    if (!muted) { unlock(); setTimeout(() => sfx.click(), 30); } else stopAll(); notify(); return muted; },
};

// ================= 背景音樂(播放清單)=================
// 歌單(全部 Mixkit 免費授權):使用者挑的 Relaxation 05(Lily J)、Valley Sunset(Alejandro Magaña)放在 /assets/music/,
// 後面接 Cat Street 3D 房間電台的四首(/catinsight-3d/music/ 那份,不另外放);一首播完接下一首。用 <audio> 串流(不用整首下載完),接進 Web Audio 做淡入、超空間時壓低。
// 各曲母帶音量差很多 → trim 統一到 Vastness 的響度(-13.5 LUFS)。左下角的播放器(main.mjs)用 sfx.music 控制。
const MUSIC_DIR = '/catinsight-3d/music/', MUSIC_LEVEL = .3;
const trackURL = (t) => (t.file.startsWith('/') ? t.file : MUSIC_DIR + t.file);   // 我們自己下載的放在 /assets/music/,其他是 Cat Street 房間那份
const PLAYLIST = [
  { title: 'Relaxation 05', artist: 'Lily J', mood: 'Ambient · Meditative', file: '/assets/music/relaxation-05.m4a', trim: .86, cover: ['#e0c3fc', '#8ec5fc', '#c2e9fb'] },
  { title: 'Valley Sunset', artist: 'Alejandro Magaña', mood: 'Ambient · Mysterious', file: '/assets/music/valley-sunset.m4a', trim: 1.58, cover: ['#f6d365', '#fda085', '#5b3a7a'] },
  { title: 'Opalescent', artist: 'Eugenio Mininni', mood: 'Ambient', file: 'opalescent.m4a', trim: .79, cover: ['#a18cd1', '#fbc2eb', '#8fd3f4'] },
  { title: 'Home', artist: 'Eugenio Mininni', mood: 'Ambient · Warm', file: 'home.m4a', trim: .84, cover: ['#43e97b', '#38f9d7', '#4facfe'] },
  { title: 'Finding Myself', artist: 'Michael Ramir C.', mood: 'Ambient · Warm', file: 'finding-myself.m4a', trim: 2.6, cover: ['#f6d365', '#fda085', '#c471f5'] },
  { title: 'Relax Beat', artist: 'Arulo', mood: 'Ambient beat', file: 'relax-beat.m4a', trim: 7, cover: ['#ff9a8b', '#ff6a88', '#ffd3a5'] },
];
let mus = null, musicAllowed = false, musicEl = null, trackI = 0, userPaused = false;
addEventListener('pagehide', () => { if (!musicEl) return; try { sessionStorage.setItem('xarts-music', JSON.stringify({ i: trackI, t: musicEl.currentTime, paused: userPaused, at: Date.now() })); } catch {} });   // 只有首頁(有喇叭開關)會開音樂;About 頁只有音效
const listeners = new Set(), notify = () => listeners.forEach((f) => { try { f(); } catch {} });
const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);
function musicElement() {                                             // 在使用者點擊的那一刻就呼叫 play()(Safari 規定要在點擊當下)
  if (!musicEl) {
    let saved = null; try { saved = JSON.parse(sessionStorage.getItem('xarts-music') || 'null'); } catch {}   // 從首頁 / About 換頁過來:接著同一首、同一個位置
    if (saved && PLAYLIST[saved.i] && Date.now() - saved.at < 30 * 60e3) { trackI = saved.i; userPaused = !!saved.paused; }
    musicEl = new Audio(); musicEl.preload = 'none'; musicEl.crossOrigin = 'anonymous'; musicEl.src = trackURL(PLAYLIST[trackI]);
    if (saved && saved.i === trackI && saved.t > 1) musicEl.addEventListener('loadedmetadata', () => { try { musicEl.currentTime = saved.t; } catch {} }, { once: true });
    musicEl.addEventListener('ended', () => playTrack((trackI + 1) % PLAYLIST.length));
    for (const ev of ['play', 'pause']) musicEl.addEventListener(ev, notify);
  }
  return musicEl;
}
function startMusic() {
  if (!musicAllowed || !ctx || muted || userPaused) return;
  if (mus) { mus.out.gain.setTargetAtTime(MUSIC_LEVEL * mus.duck, ctx.currentTime, 1.2); musicElement().play().catch(() => {}); return; }
  const el = musicElement(), out = ctx.createGain(), trim = ctx.createGain(); out.gain.value = 0; trim.gain.value = PLAYLIST[trackI].trim; trim.connect(out); out.connect(master);
  ctx.createMediaElementSource(el).connect(trim);
  mus = { out, trim, duck: 1 };
  out.gain.setValueAtTime(0, ctx.currentTime); out.gain.linearRampToValueAtTime(MUSIC_LEVEL, ctx.currentTime + 6);   // 慢慢淡入
  el.play().catch(() => {});
}
function playTrack(i) {                                               // 換歌(點歌單 / 下一首 / 播完自動接)
  trackI = (i + PLAYLIST.length) % PLAYLIST.length; userPaused = false;
  const el = musicElement(); el.src = trackURL(PLAYLIST[trackI]);
  if (mus) mus.trim.gain.setValueAtTime(PLAYLIST[trackI].trim, ctx.currentTime);
  if (muted) { muted = false; try { localStorage.setItem('xarts-sfx', 'on'); } catch {} }   // 主動選歌 = 要聽:音效開關一起打開
  el.play().catch(() => {}); unlock(); notify();
}
function duckMusic(v, sec = .8) { if (!mus) return; mus.duck = v; mus.out.gain.setTargetAtTime(muted ? 0 : MUSIC_LEVEL * v, ctx.currentTime, sec); }
function stopAll() {
  if (mus) { mus.out.gain.setTargetAtTime(0, ctx.currentTime, .3); setTimeout(() => { if (muted) musicEl?.pause(); }, 1200); }   // 淡出後暫停(重新打開從原處接著播)
  hypStop(.2);
}
window.__sfxTap = () => { const c = ac(); const d = c.createMediaStreamDestination(); master.connect(d); return d.stream; };   // 測試用:錄下網站的聲音
addEventListener('visibilitychange', () => { if (!ctx) return; if (document.hidden) { ctx.suspend(); musicEl?.pause(); } else if (!muted) { ctx.resume(); if (mus && !userPaused) musicEl?.play().catch(() => {}); } });   // 切到別的分頁就停

// ================= 超空間 =================
let hyp = null, charge = null;
function hypStart() {
  const out = ctx.createGain(); out.gain.value = 0; out.connect(master);
  if (!noiseBuf) { noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
  const rum = ctx.createBufferSource(), rumF = ctx.createBiquadFilter(), rumG = ctx.createGain(); rum.buffer = noiseBuf; rum.loop = true;
  rumF.type = 'lowpass'; rumF.frequency.value = 180; rumG.gain.value = 0; rum.connect(rumF); rumF.connect(rumG); rumG.connect(out); rum.start();
  const air = ctx.createBufferSource(), airF = ctx.createBiquadFilter(), airG = ctx.createGain(); air.buffer = noiseBuf; air.loop = true; air.playbackRate.value = .8;
  airF.type = 'bandpass'; airF.Q.value = 1.4; airF.frequency.value = 900; airG.gain.value = 0; air.connect(airF); airF.connect(airG); airG.connect(out); air.start();
  const dr = [55, 82.5].map((f) => { const o = ctx.createOscillator(), g = ctx.createGain(), lp = ctx.createBiquadFilter(); o.type = 'sawtooth'; o.frequency.value = f; lp.type = 'lowpass'; lp.frequency.value = 300; g.gain.value = 0; o.connect(lp); lp.connect(g); g.connect(out); o.start(); return { o, g, lp }; });
  out.gain.setTargetAtTime(1, ctx.currentTime, .3);
  hyp = { out, rum, rumG, rumF, air, airG, airF, dr, fired: {}, nextPass: 0 };
}
function hypStop(sec = 1.2) {
  if (!hyp) return; const h = hyp; hyp = null;
  h.out.gain.setTargetAtTime(0, ctx.currentTime, sec / 3);
  setTimeout(() => { try { h.rum.stop(); h.air.stop(); h.dr.forEach((d) => d.o.stop()); h.out.disconnect(); } catch {} }, sec * 1000 + 600);
}
function streak(vol) {                                                // 一道星線從旁邊呼嘯而過:高頻風聲往下滑(都卜勒)、從畫面中間甩到左或右
  const t = ctx.currentTime, dur = .3 + Math.random() * .5, side = Math.random() < .5 ? -1 : 1, f0 = 2200 + Math.random() * 3000;
  const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain(), p = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
  s.buffer = noiseBuf; s.playbackRate.value = .85 + Math.random() * .4; f.type = 'bandpass'; f.Q.value = 2.4;
  f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(f0 * .25, t + dur);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + dur * .4); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
  s.connect(f); f.connect(g);
  if (p) { p.pan.setValueAtTime(side * .15, t); p.pan.linearRampToValueAtTime(side * .95, t + dur); g.connect(p); p.connect(hyp.out); } else g.connect(hyp.out);
  s.start(t, Math.random() * 1.5); s.stop(t + dur + .05);
}
function chargeHum(v) {                                               // 讀條充能:越滿越高、越大聲
  if (v > .01 && !charge) { const o = ctx.createOscillator(), o2 = ctx.createOscillator(), g = ctx.createGain(), lp = ctx.createBiquadFilter(); o.type = 'sawtooth'; o2.type = 'sine'; lp.type = 'lowpass'; lp.frequency.value = 600; g.gain.value = 0; o.connect(lp); o2.connect(g); lp.connect(g); g.connect(master); o.start(); o2.start(); charge = { o, o2, g, lp }; }
  if (!charge) return;
  const t = ctx.currentTime;
  charge.o.frequency.setTargetAtTime(60 + 170 * v, t, .08); charge.o2.frequency.setTargetAtTime(120 + 340 * v, t, .08); charge.lp.frequency.setTargetAtTime(400 + 2200 * v, t, .1);
  charge.g.gain.setTargetAtTime(.07 * v, t, .1);
  if (v <= .01) { const c = charge; charge = null; c.g.gain.setTargetAtTime(0, t, .1); setTimeout(() => { try { c.o.stop(); c.o2.stop(); } catch {} }, 600); }
}
function hyper(XP) {
  if (!XP || !ready()) { if (hyp) hypStop(.3); return; }
  chargeHum(XP.state === 'gate' ? XP.charge || 0 : 0);
  if (XP.state === 'launch') {
    const lt = XP.lt || 0;
    if (!hyp) { hypStart(); duckMusic(.3, 1.5); }
    const t = ctx.currentTime, once = (k, at, fn) => { if (lt >= at && !hyp.fired[k]) { hyp.fired[k] = 1; fn(); } };
    once('jump', 1.9, () => {                                         // 跳躍:往上衝的掃頻 + 一陣強風 + 低頻一沉
      tone(110, { dur: 1.6, type: 'sawtooth', vol: .085, to: 1400, lp: 2600 }); tone(220, { at: .05, dur: 1.4, type: 'triangle', vol: .05, to: 2200 });
      noise({ dur: 1.6, vol: .15, f0: 250, f1: 5200, q: .7 }); tone(70, { at: .35, dur: 1.2, type: 'sine', vol: .2, to: 38 });
    });
    once('exit', 5.85, () => {                                        // 跳出:反向的風 + 一聲低沉的「轟」
      noise({ dur: 1.1, vol: .13, f0: 4200, f1: 300, q: .8 }); tone(90, { at: .25, dur: 1.6, type: 'sine', vol: .26, to: 32 }); tone(180, { at: .25, dur: .5, type: 'triangle', vol: .07, to: 60 });
    });
    once('arrive', 6.4, () => {                                       // 抵達:一串明亮的鐘聲(C 大九和弦往上)
      [72, 76, 79, 83, 86].forEach((n, k) => tone(midi(n), { at: k * .07, dur: 1.8, type: 'sine', vol: .07 }));
      duckMusic(1, 2.5);
    });
    // 隧道裡持續的轟隆聲(跳躍後 → 跳出前);等載入時(停在隧道裡)一直有,還會慢慢起伏
    const tun = Math.min(1, Math.max(0, (lt - 2.2) / 1.2)) * (1 - Math.min(1, Math.max(0, (lt - 5.6) / .5)));
    const wob = .75 + .25 * Math.sin(t * 1.7);
    hyp.rumG.gain.setTargetAtTime(.36 * tun, t, .15); hyp.rumF.frequency.setTargetAtTime(140 + 120 * wob, t, .2);
    hyp.airG.gain.setTargetAtTime(.09 * tun * wob, t, .2); hyp.airF.frequency.setTargetAtTime(700 + 900 * (.5 + .5 * Math.sin(t * .9)), t, .2);
    hyp.dr.forEach((d, k) => { d.g.gain.setTargetAtTime(.06 * tun, t, .2); d.lp.frequency.setTargetAtTime(200 + 260 * wob + k * 80, t, .2); });
    if (tun > .25 && t >= hyp.nextPass) { streak((.035 + Math.random() * .05) * tun); hyp.nextPass = t + .14 + Math.random() * .4; }   // 飛在隧道裡:星線一道道從身邊掠過
  } else if (hyp) { hypStop(1.2); if (mus && mus.duck < 1) duckMusic(1, 2); }
}
