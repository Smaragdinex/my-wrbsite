// 首頁的介面音效(全部用 Web Audio 即時合成,不用載音檔):
//   hover 滑過可互動的東西:輕輕一聲「滴」;click 按下:清脆的確認音;open 機庫大門滑開:低沉的嗡聲 + 氣流;
//   whoosh 飛進門 / 退出:一陣風聲;swish 左右換艙:短短的刷一聲;greet 點機器人時它的電子招呼聲。
// 瀏覽器規定要使用者先點一下(或按鍵)才能出聲,所以第一次互動之前是靜音的。右下角的喇叭可以關掉音效(記在 localStorage)。
// 另外:背景音樂(即時合成的太空氛圍音樂:慢慢變化的和弦鋪底 + 低音 + 稀疏的鐘聲琶音,加回音和大殘響)、
//       超空間音效(充能嗡聲 → 跳躍時往上衝的掃頻 + 風聲 → 隧道裡的轟隆聲 → 跳出時一聲低沉的「轟」+ 抵達的鐘聲)、
//       點左上頭盔的機器人叫聲。全部共用同一個開關。
let ctx = null, master = null, muted = false, lastHover = 0;
try { muted = localStorage.getItem('xarts-sfx') === 'off'; } catch {}

function ac() {
  if (!ctx) { const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null;
    ctx = new AC(); master = ctx.createGain(); master.gain.value = .55; master.connect(ctx.destination); }
  return ctx;
}
function unlock() { try { const c = ac(); if (!c) return; const go = () => { if (!muted) startMusic(); }; if (c.state === 'suspended') c.resume().then(go, () => {}); else go(); } catch {} }
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
  enableMusic() { musicAllowed = true; if (ctx && ctx.state === 'running' && !muted) startMusic(); },
  get muted() { return muted; },
  toggle() { muted = !muted; try { localStorage.setItem('xarts-sfx', muted ? 'off' : 'on'); } catch {}
    if (!muted) { unlock(); setTimeout(() => sfx.click(), 30); } else stopAll(); return muted; },
};

// ================= 背景音樂 =================
// 四個和弦循環(每個約 9.6 秒):Cmaj9 → Am(add9) → Fmaj7(#11) → G6sus;鋪底 = 每個音兩支微微走音的鋸齒波 + 慢慢開合的低通,
// 低音 = 和弦根音的正弦波,琶音 = 偶爾一顆鐘聲(五聲音階,進回音),全部再送進一個長殘響。
const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);
const CHORDS = [[48, 55, 62, 64, 71], [45, 52, 59, 60, 67], [41, 48, 55, 57, 64], [43, 50, 57, 59, 62]];
const PENTA = [[60, 62, 64, 67, 71, 74, 76], [57, 60, 64, 67, 69, 72, 76], [57, 60, 64, 65, 67, 72, 76], [59, 62, 67, 69, 71, 74, 79]];
const CHORD_SEC = 9.6, MUSIC_LEVEL = .65;
let mus = null, musTimer = null, musicAllowed = false;   // 只有首頁(有喇叭開關)會開音樂;About 頁只有音效
function reverbIR(sec = 5, decay = 2.8) {
  const len = Math.floor(ctx.sampleRate * sec), b = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) { const d = b.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay); }
  return b;
}
function startMusic() {
  if (!musicAllowed) return;
  if (mus || !ctx || muted) { if (mus && !muted) mus.out.gain.setTargetAtTime(MUSIC_LEVEL * mus.duck, ctx.currentTime, 1.2); return; }
  const out = ctx.createGain(); out.gain.value = 0; out.connect(master);
  const verb = ctx.createConvolver(); verb.buffer = reverbIR(); const wet = ctx.createGain(); wet.gain.value = .6; verb.connect(wet); wet.connect(out);
  const dry = ctx.createGain(); dry.gain.value = .55; dry.connect(out);
  const bus = (send) => { const g = ctx.createGain(); g.connect(dry); const s_ = ctx.createGain(); s_.gain.value = send; g.connect(s_); s_.connect(verb); return g; };
  const padF = ctx.createBiquadFilter(); padF.type = 'lowpass'; padF.frequency.value = 820; padF.Q.value = .6; padF.connect(bus(.75));
  const lfo = ctx.createOscillator(), lfoG = ctx.createGain(); lfo.frequency.value = .045; lfoG.gain.value = 380; lfo.connect(lfoG); lfoG.connect(padF.frequency); lfo.start();
  const dl = ctx.createDelay(1.5), fb = ctx.createGain(), dlF = ctx.createBiquadFilter(), bell = bus(.85);
  dl.delayTime.value = .46; fb.gain.value = .36; dlF.type = 'lowpass'; dlF.frequency.value = 2800; dl.connect(dlF); dlF.connect(fb); fb.connect(dl); dlF.connect(bell);
  const bellIn = ctx.createGain(); bellIn.connect(bell); bellIn.connect(dl);
  mus = { out, padF, bellIn, bass: bus(.2), step: 0, next: ctx.currentTime + .2, arp: ctx.currentTime + 3.5, duck: 1 };
  out.gain.setValueAtTime(0, ctx.currentTime); out.gain.linearRampToValueAtTime(MUSIC_LEVEL * mus.duck, ctx.currentTime + 7);   // 慢慢淡入
  musTimer = setInterval(schedule, 250); schedule();
}
function voice(freq, t, dur, dest, { type = 'sawtooth', vol = .02, att = 2.8, rel = 4.5, detune = 0 } = {}) {
  const o = ctx.createOscillator(), g = ctx.createGain(); o.type = type; o.frequency.value = freq; o.detune.value = detune;
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + att); g.gain.setValueAtTime(vol, t + dur); g.gain.linearRampToValueAtTime(0, t + dur + rel);
  o.connect(g); g.connect(dest); o.start(t); o.stop(t + dur + rel + .1);
}
function schedule() {
  if (!mus || !ctx || ctx.state !== 'running') return;
  const now = ctx.currentTime;
  while (mus.next < now + 1.5) {                                      // 和弦:鋪底 + 低音
    const t = mus.next, ch = CHORDS[mus.step % CHORDS.length];
    for (const n of ch) for (const d of [-7, 6]) voice(midi(n), t, CHORD_SEC - 1, mus.padF, { vol: .05, detune: d });
    voice(midi(ch[0] - 12), t, CHORD_SEC - 1.5, mus.bass, { type: 'sine', vol: .2, att: 2.2, rel: 3 });
    if (mus.step % 2 === 1) voice(midi(ch[4] + 24), t + 2, 4, mus.padF, { type: 'sine', vol: .035, att: 3, rel: 4 });   // 偶爾一層很高的閃光
    mus.next += CHORD_SEC; mus.step++;
  }
  while (mus.arp < now + 1.5) {                                       // 鐘聲:稀疏、隨機
    const ch = PENTA[(mus.step - 1 + CHORDS.length) % CHORDS.length], n = ch[Math.random() * ch.length | 0] + (Math.random() < .3 ? 12 : 0), t = mus.arp;
    for (const [mul, v, d] of [[1, .13, 1.8], [2.01, .03, .9], [3.98, .014, .5]]) {   // 一點泛音 → 像鐘 / 鋼片琴
      const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'sine'; o.frequency.value = midi(n) * mul;
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + .008); g.gain.exponentialRampToValueAtTime(.0001, t + d);
      o.connect(g); g.connect(mus.bellIn); o.start(t); o.stop(t + d + .05);
    }
    mus.arp += .7 + Math.random() * 1.6 + (Math.random() < .2 ? 2.5 : 0);
  }
}
function duckMusic(v, sec = .8) { if (!mus) return; mus.duck = v; mus.out.gain.setTargetAtTime(muted ? 0 : MUSIC_LEVEL * v, ctx.currentTime, sec); }
function stopAll() {
  if (mus) { mus.out.gain.setTargetAtTime(0, ctx.currentTime, .3); clearInterval(musTimer); const m = mus; mus = null; setTimeout(() => { try { m.out.disconnect(); } catch {} }, 2500); }
  hypStop(.2);
}
window.__sfxTap = () => { const c = ac(); const d = c.createMediaStreamDestination(); master.connect(d); return d.stream; };   // 測試用:錄下網站的聲音
addEventListener('visibilitychange', () => { if (!ctx) return; if (document.hidden) ctx.suspend(); else if (!muted) ctx.resume(); });   // 切到別的分頁就停

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
  hyp = { out, rum, rumG, rumF, air, airG, airF, dr, fired: {} };
}
function hypStop(sec = 1.2) {
  if (!hyp) return; const h = hyp; hyp = null;
  h.out.gain.setTargetAtTime(0, ctx.currentTime, sec / 3);
  setTimeout(() => { try { h.rum.stop(); h.air.stop(); h.dr.forEach((d) => d.o.stop()); h.out.disconnect(); } catch {} }, sec * 1000 + 600);
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
  } else if (hyp) { hypStop(1.2); if (mus && mus.duck < 1) duckMusic(1, 2); }
}
