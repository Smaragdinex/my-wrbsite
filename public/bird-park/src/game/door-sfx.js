// 自動門的聲音（WebAudio 現場合成，沒有音檔）：
//   馬達＋皮帶＋滾輪：門在動時才有，音量、音高跟著門的速度（起步慢慢變大聲、快到時變小）
//   啟動：繼電器「喀」一聲；開到底：橡膠擋塊悶悶的「咚」；關到底：兩片門碰在一起的「碰」＋鎖舌「喀」
// 聲音有距離衰減和左右聲道（看門在玩家的左邊還右邊）。
export function createDoorSfx({ getSound }) {
  let ac = null, out = null, pan = null, motorG = null, motor = null, belt = null, click = null
  function init() {
    ac = new AudioContext()
    out = ac.createGain(); out.gain.value = 0
    pan = ac.createStereoPanner(); out.connect(pan); pan.connect(ac.destination)
    // 馬達：低頻鋸齒波＋二倍頻，濾掉刺耳的高頻
    motorG = ac.createGain(); motorG.gain.value = 0; motorG.connect(out)
    const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 700; lp.Q.value = 0.7; lp.connect(motorG)
    motor = [ac.createOscillator(), ac.createOscillator()]
    motor[0].type = 'sawtooth'; motor[1].type = 'triangle'
    const g0 = ac.createGain(); g0.gain.value = 0.35; const g1 = ac.createGain(); g1.gain.value = 0.25
    motor[0].connect(g0); g0.connect(lp); motor[1].connect(g1); g1.connect(lp)
    motor.forEach((o) => o.start())
    // 皮帶、滾輪在軌道上滾的沙沙聲：帶通雜訊
    const len = ac.sampleRate * 2, nb = ac.createBuffer(1, len, ac.sampleRate), d = nb.getChannelData(0)
    let b = 0
    for (let i = 0; i < len; i++) { b = b * 0.97 + (Math.random() * 2 - 1) * 0.03; d[i] = b * 6 + (Math.random() * 2 - 1) * 0.15 }
    belt = ac.createBufferSource(); belt.buffer = nb; belt.loop = true
    const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 520; bp.Q.value = 0.9
    const bg = ac.createGain(); bg.gain.value = 0.55
    belt.connect(bp); bp.connect(bg); bg.connect(motorG); belt.start()
    // 撞擊聲用的短雜訊
    const cl = Math.floor(ac.sampleRate * 0.12)
    click = ac.createBuffer(1, cl, ac.sampleRate)
    const c = click.getChannelData(0)
    for (let i = 0; i < cl; i++) c[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ac.sampleRate * 0.012))
  }
  const ready = () => {
    if (!getSound()) { if (ac) out.gain.value = 0; return false }
    if (!ac) init()
    if (ac.state === 'suspended') ac.resume()
    return ac.state === 'running'
  }
  function hit(at, { f = 2000, type = 'bandpass', q = 1, gain = 0.3, rate = 1 }) {
    const s = ac.createBufferSource(); s.buffer = click; s.playbackRate.value = rate
    const fl = ac.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q
    const g = ac.createGain(); g.gain.value = gain
    s.connect(fl); fl.connect(g); g.connect(out); s.start(at)
  }
  function thud(at, f, gain, dur) {
    const o = ac.createOscillator(), g = ac.createGain(); o.type = 'sine'
    o.frequency.setValueAtTime(f, at); o.frequency.exponentialRampToValueAtTime(f * 0.55, at + dur)
    g.gain.setValueAtTime(gain, at); g.gain.exponentialRampToValueAtTime(0.0001, at + dur)
    o.connect(g); g.connect(out); o.start(at); o.stop(at + dur + 0.02)
  }

  // 每格：speed＝門的速度（0～1，相對最快速度）；vol＝距離衰減後的音量；p＝左右（-1～1）
  function tick(speed, vol, p) {
    if (!ready()) return
    const t = ac.currentTime
    out.gain.setTargetAtTime(vol, t, 0.05)
    pan.pan.setTargetAtTime(Math.max(-0.85, Math.min(0.85, p)), t, 0.05)
    motorG.gain.setTargetAtTime(Math.min(1, speed) * 0.24, t, 0.04)
    motor[0].frequency.setTargetAtTime(62 + speed * 58, t, 0.06)     // 轉速越快音越高
    motor[1].frequency.setTargetAtTime(124 + speed * 116, t, 0.06)
    belt.playbackRate.setTargetAtTime(0.7 + speed * 0.6, t, 0.06)
  }
  function start() { if (!ready()) return; const t = ac.currentTime; hit(t, { f: 3200, q: 2, gain: 0.12 }); hit(t + 0.012, { f: 1800, q: 2, gain: 0.08 }) }
  function openStop() { if (!ready()) return; const t = ac.currentTime; thud(t, 95, 0.22, 0.12); hit(t, { type: 'lowpass', f: 600, gain: 0.25, rate: 0.6 }) }
  function closeStop() {
    if (!ready()) return
    const t = ac.currentTime
    thud(t, 120, 0.3, 0.1); hit(t, { type: 'lowpass', f: 900, gain: 0.35, rate: 0.7 }); hit(t + 0.002, { f: 2600, q: 1.5, gain: 0.12 })
    hit(t + 0.09, { f: 4200, q: 3, gain: 0.08 })   // 鎖舌
  }
  return { tick, start, openStop, closeStop }
}
