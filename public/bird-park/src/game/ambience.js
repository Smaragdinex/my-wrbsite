// 聲音：背景音樂＋溫室環境音（蟲叫、鳥叫、瀑布），全部用 WebAudio 現場合成，不用音檔——沒有授權問題（遊戲要上 Steam），也不用下載。
// 環境音：白天蟬鳴、晚上蟋蟀；鳥叫隨機（口哨、顫音、連續短啾、斑鳩咕咕），清晨最多、晚上很少；靠近中央的山聽得到瀑布。
// 在相機行裡：外面的聲音隔著玻璃（低通濾波＋小聲），音樂稍微大一點。
// 音樂：慢的環境音樂（D 大調，四個和弦輪流，每個 8 秒），鋪底和弦＋低音＋偶爾幾個撥弦音，經過殘響和回音。
// 瀏覽器規定要使用者先點過或按過鍵才能出聲，所以第一次點擊／按鍵時才建立 AudioContext。
// 2026-11-07 使用者挑的音檔（Pixabay，Pixabay Content License：遊戲可用、含商業，不用標示）：
//   背景音樂 audio/music-ambient-nature.mp3 =「Ambient Nature」AtlasAudio（pixabay.com/music/ambient-ambient-nature-518687/，轉 128k）
//   鳥叫環境音 audio/birds-forest.mp3 =「Birds Forest Nature」SoundReality（pixabay.com/sound-effects/…-445379/，頭尾 3 秒交叉淡化成無縫循環）
// 音檔載到之前（或載入失敗）照舊用合成的音樂和鳥叫。
import { STORE, distToMtn } from '../layout.js'

const VOL = { off: 0, low: 0.35, mid: 0.65, high: 1 }
// 音檔的音量（對到以前合成版的大小：中音量時溫室白天 音樂約 −45 dB、鳥叫約 −48 dB）
let MUSIC_K = 0.5, BIRD_K = 0.25   // 量過：中音量溫室白天 音樂約 −42 dB、鳥叫約 −40 dB（鳥叫是主角）
const rnd = (a, b) => a + Math.random() * (b - a)
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)]
const smooth = (p, v, t, k = 0.4) => p.setTargetAtTime(v, t, k)

export function createAmbience({ getMusic, getAmb }) {
  let ac = null, out, musicBus, ambBus, ambFilter, verb, ambVerb, cicadaG, cricketG, waterG
  const st = { hour: 9, store: 0, water: 0 }

  function start() {
    if (ac) { if (ac.state === 'suspended') ac.resume(); return }
    ac = new AudioContext()
    out = ac.createGain(); out.gain.value = 0.9
    const comp = ac.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 3
    out.connect(comp); comp.connect(ac.destination)
    // 殘響：自己做一段衰減的雜訊當空間（溫室挑高的感覺）
    verb = ac.createConvolver()
    const len = ac.sampleRate * 2.6, ir = ac.createBuffer(2, len, ac.sampleRate)
    for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2.6 }
    verb.buffer = ir
    const verbG = ac.createGain(); verbG.gain.value = 0.5; verb.connect(verbG); verbG.connect(out)
    musicBus = ac.createGain(); musicBus.gain.value = 0; musicBus.connect(out)
    ambFilter = ac.createBiquadFilter(); ambFilter.type = 'lowpass'; ambFilter.frequency.value = 18000
    ambBus = ac.createGain(); ambBus.gain.value = 0; ambBus.connect(ambFilter); ambFilter.connect(out)
    ambVerb = ac.createConvolver(); ambVerb.buffer = ir; const avg = ac.createGain(); avg.gain.value = 0.6; ambVerb.connect(avg); avg.connect(ambBus)   // 鳥叫的回音也要走環境音那一路（在店裡一起被玻璃擋掉）
    startCicadas(); startWater(); cricketG = ac.createGain(); cricketG.gain.value = 0; cricketG.connect(ambBus)
    loadFiles()
    loop()
  }
  for (const ev of ['pointerdown', 'keydown']) addEventListener(ev, start)
  document.addEventListener('visibilitychange', () => { if (!ac) return; document.hidden ? ac.suspend() : ac.resume() })

  const noiseBuf = () => {
    const b = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate), d = b.getChannelData(0)
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
    return b
  }
  const loopNoise = () => { const s = ac.createBufferSource(); s.buffer = noiseBuf(); s.loop = true; s.start(); return s }

  /* ---------- 音檔：背景音樂、鳥叫環境音（無縫循環） ---------- */
  let musicSrc = null, musicG = null, birdBedG = null
  async function loadBuf(url) { const r = await fetch(url); return ac.decodeAudioData(await r.arrayBuffer()) }
  const loopSrc = (buf, dest) => {
    const s = ac.createBufferSource(); s.buffer = buf; s.loop = true
    s.loopStart = 0.03; s.loopEnd = buf.duration - 0.03   // mp3 頭尾有一點點編碼器補的空白，跳過才不會「噗」一下
    s.connect(dest); s.start(); return s
  }
  function loadFiles() {
    loadBuf('audio/music-ambient-nature.mp3').then((b) => {
      musicG = ac.createGain(); musicG.gain.value = 0; musicG.connect(musicBus)
      musicSrc = loopSrc(b, musicG); musicG.gain.setTargetAtTime(MUSIC_K, ac.currentTime, 2)
    }).catch((e) => console.warn('[amb] 音樂載入失敗，用合成的', e))
    loadBuf('audio/birds-forest.mp3').then((b) => {
      birdBedG = ac.createGain(); birdBedG.gain.value = 0; birdBedG.connect(ambBus)
      loopSrc(b, birdBedG)
    }).catch((e) => console.warn('[amb] 鳥叫音檔載入失敗，用合成的', e))
  }

  /* ---------- 蟬：高頻雜訊、快速振幅抖動、慢慢起伏 ---------- */
  function startCicadas() {
    cicadaG = ac.createGain(); cicadaG.gain.value = 0; cicadaG.connect(ambBus)
    for (const [f, pan, am] of [[5200, -0.6, 43], [6100, 0.5, 37]]) {
      const n = loopNoise(), bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = 9
      const trem = ac.createGain(); trem.gain.value = 0.5
      const lfo = ac.createOscillator(); lfo.frequency.value = am; const lg = ac.createGain(); lg.gain.value = 0.5; lfo.connect(lg); lg.connect(trem.gain); lfo.start()
      const swell = ac.createGain(); swell.gain.value = 0.5
      const slow = ac.createOscillator(); slow.frequency.value = rnd(0.05, 0.11); const sg = ac.createGain(); sg.gain.value = 0.45; slow.connect(sg); sg.connect(swell.gain); slow.start()
      const p = ac.createStereoPanner(); p.pan.value = pan
      n.connect(bp); bp.connect(trem); trem.connect(swell); swell.connect(p); p.connect(cicadaG)
    }
  }
  /* ---------- 瀑布：低通雜訊，靠近山才大聲 ---------- */
  function startWater() {
    waterG = ac.createGain(); waterG.gain.value = 0; waterG.connect(ambBus)
    const n = loopNoise(), lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1100
    const hp = ac.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 120
    n.connect(lp); lp.connect(hp); hp.connect(waterG)
  }

  /* ---------- 單一聲音的小工具 ---------- */
  function voice(t, pan, gain, wet = 0.35) {
    const g = ac.createGain(); g.gain.value = 0
    const p = ac.createStereoPanner(); p.pan.value = pan
    const dry = ac.createGain(); dry.gain.value = 1 - wet * 0.5
    const send = ac.createGain(); send.gain.value = wet
    g.connect(p); p.connect(dry); dry.connect(ambBus); p.connect(send); send.connect(ambVerb)
    return { g, peak: gain }
  }
  function tone(dest, t, dur, f0, f1, peak, type = 'sine', fm = null) {
    const o = ac.createOscillator(); o.type = type
    o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur)
    if (fm) { const m = ac.createOscillator(); m.frequency.value = fm[0]; const mg = ac.createGain(); mg.gain.value = fm[1]; m.connect(mg); mg.connect(o.frequency); m.start(t); m.stop(t + dur + 0.05) }
    const e = ac.createGain(); e.gain.setValueAtTime(0.0001, t); e.gain.exponentialRampToValueAtTime(peak, t + Math.min(0.02, dur / 4)); e.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    o.connect(e); e.connect(dest); o.start(t); o.stop(t + dur + 0.02)
  }

  /* ---------- 鳥叫：幾種類型隨機組合 ---------- */
  const BIRDS = [
    (d, t) => { const base = rnd(2200, 3400); const n = 2 + (Math.random() * 3 | 0)   // 口哨：幾個音往上或往下
      for (let i = 0; i < n; i++) { const f = base * (1 + (Math.random() - 0.4) * 0.35); tone(d, t + i * 0.28, 0.22, f, f * rnd(0.85, 1.25), 0.5) } return n * 0.28 },
    (d, t) => { const f = rnd(3000, 4200); tone(d, t, rnd(0.5, 0.9), f, f * 0.92, 0.35, 'sine', [rnd(24, 34), rnd(250, 500)]); return 0.9 },   // 顫音
    (d, t) => { const n = 3 + (Math.random() * 5 | 0), f = rnd(3600, 5200)   // 連續短啾
      for (let i = 0; i < n; i++) tone(d, t + i * rnd(0.09, 0.14), 0.06, f, f * 0.6, 0.45); return n * 0.12 },
    (d, t) => { const f = rnd(420, 560)   // 斑鳩：咕—咕咕
      for (const [dt, len] of [[0, 0.45], [0.6, 0.25], [0.9, 0.5]]) tone(d, t + dt, len, f * 1.05, f * 0.92, 0.6, 'sine'); return 1.4 },
    (d, t) => { const f = rnd(1800, 2400); tone(d, t, 0.35, f, f * 1.6, 0.4); tone(d, t + 0.38, 0.5, f * 1.5, f * 0.9, 0.4); return 0.9 },   // 「啾—咿」兩段
  ]
  let nextBird = 0, nextCricket = 0
  function scheduleBirds(now) {
    if (now < nextBird) return
    const h = st.hour, dawn = Math.exp(-((h - 6.5) ** 2) / 2), night = h < 5 || h > 19.5
    const rate = night ? 0.08 : 0.35 + dawn * 0.9   // 每秒幾隻在叫
    const t = now + 0.05
    const kind = night ? 3 : Math.random() < 0.08 ? 3 : Math.floor(Math.random() * BIRDS.length)
    const v = voice(t, rnd(-0.9, 0.9), 1, rnd(0.2, 0.55)); v.g.gain.value = rnd(0.25, 0.7) * (night ? 0.6 : 1)   // 有遠有近
    const dur = BIRDS[kind](v.g, t)
    // 有時同一隻再叫一次
    if (Math.random() < 0.35) BIRDS[kind](v.g, t + dur + rnd(0.3, 0.8))
    nextBird = now + rnd(0.4, 2.2) / rate * 0.4
  }
  function scheduleCrickets(now) {
    if (now < nextCricket) return
    const t = now + 0.05, f = rnd(4100, 4700), p = ac.createStereoPanner(); p.pan.value = rnd(-0.8, 0.8); p.connect(cricketG)
    const n = 3 + (Math.random() * 2 | 0)
    for (let i = 0; i < n; i++) tone(p, t + i * 0.045, 0.03, f, f, 0.25)
    nextCricket = now + rnd(0.15, 0.6)
  }

  /* ---------- 音樂 ---------- */
  const mtof = (m) => 440 * 2 ** ((m - 69) / 12)
  const CHORDS = [[50, 62, 66, 69, 73], [47, 59, 62, 66, 69], [43, 55, 59, 62, 66], [45, 57, 61, 64, 69]]   // Dmaj7、Bm7、Gmaj7、A
  const SCALE = [74, 76, 78, 81, 83, 86, 88]   // D 大調五聲音階（高八度）
  let nextChord = 0, chordI = 0, nextNote = 0, mDelay = null
  function musicNode() {
    if (mDelay) return mDelay
    const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2400; lp.connect(musicBus)
    const dl = ac.createDelay(1); dl.delayTime.value = 0.42; const fb = ac.createGain(); fb.gain.value = 0.35
    dl.connect(fb); fb.connect(dl); dl.connect(lp)
    const toVerb = ac.createGain(); toVerb.gain.value = 0.4; lp.connect(toVerb); toVerb.connect(verb)
    mDelay = { lp, dl }
    return mDelay
  }
  function scheduleMusic(now) {
    const { lp, dl } = musicNode()
    if (now >= nextChord - 0.1) {
      const t = Math.max(now, nextChord), dur = 8, ch = CHORDS[chordI++ % CHORDS.length]
      ch.forEach((m, i) => {   // 鋪底：每個音兩個微微走音的三角波，慢慢進、慢慢出
        for (const det of [-5, 5]) {
          const o = ac.createOscillator(); o.type = i === 0 ? 'sine' : 'triangle'; o.frequency.value = mtof(m); o.detune.value = det
          const g = ac.createGain(); const pk = i === 0 ? 0.05 : 0.035
          g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(pk, t + 2.5); g.gain.setValueAtTime(pk, t + dur - 1); g.gain.linearRampToValueAtTime(0.0001, t + dur + 2.5)
          o.connect(g); g.connect(lp); o.start(t); o.stop(t + dur + 2.6)
        }
      })
      nextChord = t + dur
    }
    if (now >= nextNote) {   // 撥弦：大約每 1～3 秒一個音，有時兩個
      const t = now + 0.05
      if (Math.random() < 0.7) {
        const m = pick(SCALE), o = ac.createOscillator(), g = ac.createGain()
        o.type = 'sine'; o.frequency.value = mtof(m)
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.07, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.6)
        o.connect(g); g.connect(lp); g.connect(dl); o.start(t); o.stop(t + 1.7)
      }
      nextNote = now + pick([0.9, 1.3, 1.8, 2.6])
    }
  }

  /* ---------- 排程迴圈（每 100 毫秒排接下來的聲音） ---------- */
  function loop() {
    setInterval(() => {
      if (!ac || ac.state !== 'running') return
      const now = ac.currentTime, mv = VOL[getMusic()] ?? 0.65, av = VOL[getAmb()] ?? 1
      // 音量：店裡音樂大一點、外面的聲音悶一點
      smooth(musicBus.gain, mv * (0.3 + 0.4 * st.store), now, 1.2)   // 溫室裡讓鳥叫蟲鳴當主角
      smooth(ambBus.gain, av * (1 - 0.7 * st.store), now, 0.8)
      smooth(ambFilter.frequency, 18000 - 16800 * st.store, now, 0.6)
      const h = st.hour, day = h > 6 && h < 18.5 ? Math.min(1, (h - 6) / 1.5, (18.5 - h) / 1.5) : 0
      smooth(cicadaG.gain, 0.13 * day * (h > 10 && h < 16 ? 1 : 0.5), now, 2)
      smooth(cricketG.gain, (1 - day) * 0.5 + 0.03, now, 2)
      smooth(waterG.gain, 0.16 * st.water, now, 0.6)
      // 鳥叫環境音：白天整段、清晨最熱鬧，晚上只剩一點點
      const dawn = Math.exp(-((h - 6.5) ** 2) / 2)
      if (birdBedG) smooth(birdBedG.gain, BIRD_K * (0.1 + 0.9 * day) * (1 + 0.3 * dawn), now, 2)
      if (av > 0) { if (!birdBedG) scheduleBirds(now); if (Math.random() < 0.6) scheduleCrickets(now) }
      if (mv > 0 && !musicSrc) scheduleMusic(now); else nextChord = now
    }, 100)
  }

  // 每格更新：現在幾點、在店裡還是溫室、離瀑布多遠
  function tick(dt, { hour, pos }) {
    st.hour = hour
    const inStore = pos.x < STORE.X0 && pos.x > STORE.X1 && Math.abs(pos.z) < STORE.HZ ? 1 : pos.x < -70 && Math.abs(pos.z) < 5 ? 0.5 : 0
    st.store += (inStore - st.store) * Math.min(1, dt * 2)
    st.water = Math.max(0, 1 - Math.max(0, distToMtn(pos.x, pos.z) - 8) / 30)
  }
  return { tick, start, get ctx() { return ac }, get out() { return out }, dbg: { get musicG() { return musicG }, get birdBedG() { return birdBedG }, setK(m, b) { MUSIC_K = m; BIRD_K = b; if (musicG) musicG.gain.value = m } } }
}
