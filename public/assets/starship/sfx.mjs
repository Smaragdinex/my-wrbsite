// 首頁的介面音效(全部用 Web Audio 即時合成,不用載音檔):
//   hover 滑過可互動的東西:輕輕一聲「滴」;click 按下:清脆的確認音;open 機庫大門滑開:低沉的嗡聲 + 氣流;
//   whoosh 飛進門 / 退出:一陣風聲;swish 左右換艙:短短的刷一聲;greet 點機器人時它的電子招呼聲。
// 瀏覽器規定要使用者先點一下(或按鍵)才能出聲,所以第一次互動之前是靜音的。右下角的喇叭可以關掉音效(記在 localStorage)。
let ctx = null, master = null, muted = false, lastHover = 0;
try { muted = localStorage.getItem('xarts-sfx') === 'off'; } catch {}

function ac() {
  if (!ctx) { const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null;
    ctx = new AC(); master = ctx.createGain(); master.gain.value = .55; master.connect(ctx.destination); }
  return ctx;
}
function unlock() { try { const c = ac(); if (c && c.state === 'suspended') c.resume(); } catch {} }
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
  get muted() { return muted; },
  toggle() { muted = !muted; try { localStorage.setItem('xarts-sfx', muted ? 'off' : 'on'); } catch {} if (!muted) { unlock(); setTimeout(() => sfx.click(), 30); } return muted; },
};
