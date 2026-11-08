// 相機音效：對焦合焦的「嗶嗶」、按快門的「喀—嚓」。跟 ui-fx.js 一樣用 WebAudio 現場合成，不用音檔、沒有授權問題。
// 快門照單眼的順序合成：反光鏡彈起（低沉的「咚」）→ 前簾開（脆的「喀」）→ 曝光 t 秒 → 後簾關（「喀」）→ 反光鏡落下＋上片馬達。
// 所以快門越慢，兩聲之間隔越久（1/1000 聽起來是一聲「喀嚓」，1 秒就是「喀……嚓」），跟真的相機一樣。
export function createCameraSfx({ getSound }) {
  let ac = null, out = null, click = null
  function ctx() {
    if (!ac) {
      ac = new AudioContext()
      out = ac.createGain(); out.gain.value = 0.9; out.connect(ac.destination)
      // 一小段衰減很快的雜訊，快門簾、機械聲都拿它來濾
      const len = Math.floor(ac.sampleRate * 0.06)
      click = ac.createBuffer(1, len, ac.sampleRate)
      const d = click.getChannelData(0)
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ac.sampleRate * 0.006))
    }
    if (ac.state === 'suspended') ac.resume()
    return ac
  }
  // 濾過的雜訊脈衝：type/頻率/Q 決定是「喀」還是「咚」
  function burst(t, { type = 'bandpass', f = 3000, q = 1, gain = 0.3, rate = 1 }) {
    const s = ac.createBufferSource(); s.buffer = click; s.playbackRate.value = rate
    const fl = ac.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q
    const g = ac.createGain(); g.gain.value = gain
    s.connect(fl); fl.connect(g); g.connect(out); s.start(t)
  }
  // 有音高、會很快衰減的共振（機身金屬、反光鏡箱的「咚」）
  function thud(t, f, gain, dur) {
    const o = ac.createOscillator(), g = ac.createGain(); o.type = 'sine'
    o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f * 0.6, t + dur)
    g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    o.connect(g); g.connect(out); o.start(t); o.stop(t + dur + 0.02)
  }

  // 合焦：兩聲短的「嗶嗶」（約 2.7 kHz 方波，跟一般單眼的提示音差不多）
  let lastBeep = -1
  function focusBeep() {
    if (!getSound()) return
    ctx()
    const t = ac.currentTime
    if (t - lastBeep < 0.45) return   // 鏡頭掃來掃去一直重新合焦時不要嗶成一串
    lastBeep = t
    const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 5000; lp.connect(out)
    for (const dt of [0, 0.085]) {
      const o = ac.createOscillator(), g = ac.createGain(); o.type = 'square'; o.frequency.value = 2730
      g.gain.setValueAtTime(0.0001, t + dt); g.gain.exponentialRampToValueAtTime(0.045, t + dt + 0.004)
      g.gain.setValueAtTime(0.045, t + dt + 0.05); g.gain.exponentialRampToValueAtTime(0.0001, t + dt + 0.06)
      o.connect(g); g.connect(lp); o.start(t + dt); o.stop(t + dt + 0.07)
    }
  }

  // 快門：t＝快門秒數（決定前後簾隔多久）、fast＝高速連拍的機身（聲音短、乾一點）
  function shutter(t, { fast = false } = {}) {
    if (!getSound()) return
    ctx()
    const n = ac.currentTime + 0.005
    const gap = Math.min(Math.max(t, 0.012), 2)   // 太快的快門兩片簾幾乎同時，留一點間隔才聽得出是兩聲
    // 反光鏡彈起：低頻的「咚」＋寬頻的悶響
    thud(n, 150, 0.32, 0.07)
    burst(n, { type: 'lowpass', f: 900, gain: 0.55, rate: 0.7 })
    // 前簾
    burst(n + 0.012, { f: 4200, q: 1.4, gain: 0.7 })
    burst(n + 0.014, { type: 'highpass', f: 7000, gain: 0.25 })
    // 後簾（曝光完）
    const e = n + 0.012 + gap
    burst(e, { f: 3400, q: 1.2, gain: 0.75 })
    burst(e + 0.002, { type: 'highpass', f: 6500, gain: 0.3 })
    // 反光鏡落下＋快門上緊（馬達「嗞」一下）
    const m = e + 0.03
    thud(m, 120, 0.22, 0.06)
    burst(m, { type: 'lowpass', f: 700, gain: 0.4, rate: 0.6 })
    if (!fast) {
      const len = 0.07, o = ac.createOscillator(), g = ac.createGain(), bp = ac.createBiquadFilter()
      o.type = 'sawtooth'; o.frequency.setValueAtTime(260, m + 0.01); o.frequency.linearRampToValueAtTime(330, m + len)
      bp.type = 'bandpass'; bp.frequency.value = 1400; bp.Q.value = 2
      g.gain.setValueAtTime(0.0001, m + 0.01); g.gain.exponentialRampToValueAtTime(0.05, m + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, m + len)
      o.connect(bp); bp.connect(g); g.connect(out); o.start(m + 0.01); o.stop(m + len + 0.02)
    }
  }
  return { focusBeep, shutter, get ctx() { return ac } }
}
