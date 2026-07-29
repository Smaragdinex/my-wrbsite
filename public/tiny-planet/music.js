/**
 * 程式生成的環境配樂:柔和的和弦鋪底 + 隨機五聲音階旋律 + 空間殘響。
 * 全部用 Web Audio API 即時合成,不需要音檔,永遠不會重複。
 */

const CHORDS = [
    [130.81, 164.81, 196.00, 246.94],  // Cmaj7
    [110.00, 164.81, 196.00, 261.63],  // Am7
    [87.31, 130.81, 174.61, 220.00],   // Fmaj7
    [98.00, 146.83, 196.00, 246.94],   // Gsus
]

// 五聲音階(C 大調),旋律只從這裡挑音 → 怎麼隨機都不會難聽
const PENTATONIC = [523.25, 587.33, 659.25, 783.99, 880.00, 1046.50]

export class Music {
    constructor() {
        this.ctx = null
        this.enabled = true
        this.chordIndex = 0
        this.timers = []
    }

    /** 瀏覽器政策要求使用者互動後才能出聲,所以由第一次按鍵/點擊觸發 */
    start() {
        if (this.ctx) return
        const ctx = new (window.AudioContext || window.webkitAudioContext)()
        this.ctx = ctx

        this.master = ctx.createGain()
        this.master.gain.value = 0.0
        this.master.connect(ctx.destination)
        // 淡入,避免一開始就突然出聲
        this.master.gain.linearRampToValueAtTime(0.5, ctx.currentTime + 4)

        // 殘響:用衰減白雜訊當脈衝響應,做出空曠的空間感
        this.reverb = ctx.createConvolver()
        this.reverb.buffer = this._impulse(3.6, 2.4)
        this.reverbGain = ctx.createGain()
        this.reverbGain.gain.value = 0.55
        this.reverb.connect(this.reverbGain).connect(this.master)

        // 乾聲總線
        this.dry = ctx.createGain()
        this.dry.gain.value = 0.7
        this.dry.connect(this.master)

        // 旋律用的回聲
        this.delay = ctx.createDelay(1.5)
        this.delay.delayTime.value = 0.62
        this.fb = ctx.createGain()
        this.fb.gain.value = 0.32
        this.delay.connect(this.fb).connect(this.delay)
        this.delay.connect(this.reverb)

        this._scheduleChord()
        this._scheduleMelody()
    }

    toggle() {
        if (!this.ctx) { this.start(); return true }
        this.enabled = !this.enabled
        const t = this.ctx.currentTime
        this.master.gain.cancelScheduledValues(t)
        this.master.gain.setValueAtTime(this.master.gain.value, t)
        this.master.gain.linearRampToValueAtTime(this.enabled ? 0.5 : 0, t + 0.8)
        return this.enabled
    }

    /** 夜晚時音色變得更朦朧安靜 */
    setNight(nightF) {
        if (!this.reverbGain) return
        this.reverbGain.gain.value = 0.5 + 0.3 * nightF
        this.dry.gain.value = 0.72 - 0.18 * nightF
    }

    // ---------- 內部 ----------

    _impulse(seconds, decay) {
        const ctx = this.ctx
        const len = Math.floor(ctx.sampleRate * seconds)
        const buf = ctx.createBuffer(2, len, ctx.sampleRate)
        for (let ch = 0; ch < 2; ch++) {
            const data = buf.getChannelData(ch)
            for (let i = 0; i < len; i++) {
                data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay)
            }
        }
        return buf
    }

    /** 和弦鋪底:每個音兩顆微失諧的振盪器,慢起慢落像呼吸 */
    _pad(freqs, dur) {
        const ctx = this.ctx
        const t0 = ctx.currentTime
        for (const f of freqs) {
            for (const detune of [-5, 5]) {
                const osc = ctx.createOscillator()
                osc.type = 'sine'
                osc.frequency.value = f
                osc.detune.value = detune

                const lp = ctx.createBiquadFilter()
                lp.type = 'lowpass'
                lp.frequency.value = 900

                const g = ctx.createGain()
                g.gain.value = 0
                g.gain.linearRampToValueAtTime(0.085, t0 + dur * 0.35)   // 慢慢浮現
                g.gain.linearRampToValueAtTime(0, t0 + dur)              // 慢慢消失

                osc.connect(lp).connect(g)
                g.connect(this.dry)
                g.connect(this.reverb)
                osc.start(t0)
                osc.stop(t0 + dur + 0.1)
            }
        }
    }

    _scheduleChord() {
        const DUR = 9
        const play = () => {
            if (this.enabled) this._pad(CHORDS[this.chordIndex % CHORDS.length], DUR)
            this.chordIndex++
        }
        play()
        this.timers.push(setInterval(play, DUR * 1000))
    }

    /** 旋律:隨機挑五聲音階的音,像風鈴一樣偶爾響一下 */
    _note(freq) {
        const ctx = this.ctx
        const t0 = ctx.currentTime
        const osc = ctx.createOscillator()
        osc.type = 'triangle'
        osc.frequency.value = freq

        const lp = ctx.createBiquadFilter()
        lp.type = 'lowpass'
        lp.frequency.value = 2200

        const g = ctx.createGain()
        g.gain.value = 0
        g.gain.linearRampToValueAtTime(0.13, t0 + 0.04)
        g.gain.exponentialRampToValueAtTime(0.0008, t0 + 2.6)

        osc.connect(lp).connect(g)
        g.connect(this.dry)
        g.connect(this.delay)
        osc.start(t0)
        osc.stop(t0 + 2.8)
    }

    _scheduleMelody() {
        const next = () => {
            if (this.enabled && Math.random() < 0.72) {
                this._note(PENTATONIC[Math.floor(Math.random() * PENTATONIC.length)])
            }
            this.timers.push(setTimeout(next, 1400 + Math.random() * 3200))
        }
        this.timers.push(setTimeout(next, 2500))
    }
}
