// 介面手感：滑鼠變成一個圓圈（移到按鈕上縮小變實心）、按鈕的滑過／按下音效。
// 只在滑鼠沒被鎖住的時候出現（首頁、設定、相簿、相機行）；玩的時候滑鼠鎖住就藏起來。手機（沒有滑鼠）不啟用。
// 音效用 WebAudio 現場合成，不用音檔，也就沒有授權問題。
const HOT = 'button, a, input, select, label, .tab, .grid figure'

export function createUiFx({ getSound }) {
  let ac = null   // 放最前面：手機提早 return 的時候 play 也要用得到
  if (!matchMedia('(pointer: fine)').matches) return { play }   // 手機：沒有滑鼠圓圈，但圖鑑翻頁之類的音效照樣可以叫
  const ring = document.createElement('div')
  ring.className = 'cursor-ring'
  document.body.append(ring)
  document.body.classList.add('has-ring')
  let x = -100, y = -100
  addEventListener('pointermove', (e) => {
    x = e.clientX; y = e.clientY
    ring.style.transform = `translate(${x}px, ${y}px)`
    ring.classList.add('show')
    if (e.target.tagName === 'CANVAS') ring.classList.toggle('hot', e.target.style.cursor === 'pointer')   // 相機螢幕的選項是畫在 canvas 上的
  })
  document.addEventListener('pointerleave', () => ring.classList.remove('show'))
  document.addEventListener('pointerlockchange', () => document.body.classList.toggle('locked', !!document.pointerLockElement))

  // 移到可以點的東西上：圓圈縮小；進到新的按鈕播一聲輕的
  let hot = null
  addEventListener('pointerover', (e) => {
    const h = e.target.closest?.(HOT)
    ring.classList.toggle('hot', !!h)
    if (h && h !== hot && h.tagName === 'BUTTON' && !h.disabled) play('hover')
    hot = h
  })
  addEventListener('pointerdown', (e) => {
    ring.classList.add('down')
    if (e.target.closest?.('button:not(:disabled), .tab, .grid figure')) play('click')
  })
  addEventListener('pointerup', () => ring.classList.remove('down'))

  /* ---------- 音效 ---------- */
  function play(kind) {
    if (!getSound()) return
    ac ??= new AudioContext()
    if (ac.state === 'suspended') ac.resume()
    const t = ac.currentTime
    const out = ac.createGain(); out.connect(ac.destination)
    if (kind === 'page') {
      // 翻紙（圖鑑翻頁）：一段帶通雜訊，頻率從低往高掃、先大後小，像紙擦過去的沙沙聲
      const len = Math.floor(ac.sampleRate * 0.42)
      const buf = ac.createBuffer(1, len, ac.sampleRate), d = buf.getChannelData(0)
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.sin(Math.PI * i / len) ** 1.5
      const s = ac.createBufferSource(); s.buffer = buf
      const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 0.9
      bp.frequency.setValueAtTime(900, t); bp.frequency.exponentialRampToValueAtTime(3800, t + 0.35)
      out.gain.value = 0.16
      s.connect(bp); bp.connect(out); s.start(t)
      return
    }
    if (kind === 'hover') {
      // 很輕的「滴」：短正弦波，音高往上滑一點
      const o = ac.createOscillator(); o.type = 'sine'
      o.frequency.setValueAtTime(1250, t); o.frequency.exponentialRampToValueAtTime(1600, t + 0.05)
      out.gain.setValueAtTime(0.0001, t); out.gain.exponentialRampToValueAtTime(0.035, t + 0.006); out.gain.exponentialRampToValueAtTime(0.0001, t + 0.07)
      o.connect(out); o.start(t); o.stop(t + 0.08)
    } else {
      // 按下：像相機快門的「喀嚓」——兩下很短的雜訊（高通），加一點低音的「咚」
      const len = Math.floor(ac.sampleRate * 0.03)
      const buf = ac.createBuffer(1, len, ac.sampleRate), d = buf.getChannelData(0)
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3
      const hp = ac.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 2200
      hp.connect(out); out.gain.value = 0.22
      for (const dt of [0, 0.055]) { const s = ac.createBufferSource(); s.buffer = buf; s.connect(hp); s.start(t + dt) }
      const o = ac.createOscillator(), g = ac.createGain(); o.type = 'sine'
      o.frequency.setValueAtTime(220, t); o.frequency.exponentialRampToValueAtTime(110, t + 0.08)
      g.gain.setValueAtTime(0.12, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.1)
      o.connect(g); g.connect(ac.destination); o.start(t); o.stop(t + 0.12)
    }
  }
  return { play }
}
