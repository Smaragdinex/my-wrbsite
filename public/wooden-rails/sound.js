// 配樂與音效,全部用 Web Audio 即時合成,不下載任何音檔。
//
// 音色刻意選「打到木頭」那一類:音樂盒/馬林巴的短促泛音、木魚般的節拍、
// 鋪軌的喀答聲。用取樣音檔當然更真,但那是幾百 KB,而這整個遊戲的
// 程式碼加起來才 130 KB。
//
// 旋律只從五聲音階挑音 —— 隨機挑也不會難聽,所以永遠不重複又不出錯。

const PENTA = [523.25, 587.33, 659.25, 783.99, 880.00, 1046.50]
const CHORDS = [
    [130.81, 196.00, 246.94],   // C
    [146.83, 220.00, 261.63],   // Dm7 的骨架
    [174.61, 261.63, 329.63],   // F
    [196.00, 246.94, 293.66],   // G
]
import { get as sget, set as sset } from './store.js?v=88'

const KEY = 'wr.mute'

// 背景音樂關掉,只留音效。旋律是隨機生成的,聽久了會膩,
// 而火車本身的喀答與蒸汽聲才是這個遊戲該有的聲音。
// 要放回來就把這行改成 true —— _bar / _loop 都還在
const MUSIC = false

export class Sound {
    constructor() {
        this.ctx = null
        this.muted = sget(KEY) === '1'
        // CrazyGames 站方的靜音優先於遊戲內設定(平台明文要求)
        this.platformMute = false
        this.timers = []
        this.chuffAcc = 0
    }

    /** 瀏覽器要求先有使用者操作才能出聲,所以由「開始」那一下觸發 */
    start() {
        if (this.ctx) return
        const ctx = new (window.AudioContext || window.webkitAudioContext)()
        this.ctx = ctx

        this.master = ctx.createGain()
        this.master.gain.value = this.off ? 0 : 0.9
        this.master.connect(ctx.destination)

        // 簡易殘響:一條回授延遲。真的捲積殘響要脈衝響應檔,這裡不值得
        const dly = ctx.createDelay(0.6)
        dly.delayTime.value = 0.17
        const fb = ctx.createGain(); fb.gain.value = 0.28
        const wet = ctx.createGain(); wet.gain.value = 0.3
        dly.connect(fb); fb.connect(dly); dly.connect(wet); wet.connect(this.master)
        this.verb = dly

        this.musicGain = ctx.createGain()
        this.musicGain.gain.value = 0.34      // 配樂要退到音效後面
        this.musicGain.connect(this.master)
        this.musicGain.connect(dly)

        this.sfxGain = ctx.createGain()
        this.sfxGain.gain.value = 1
        this.sfxGain.connect(this.master)
        this.sfxGain.connect(dly)

        // 白噪音來源,喀答聲與蒸汽聲都靠它
        const n = ctx.sampleRate * 2
        this.noise = ctx.createBuffer(1, n, ctx.sampleRate)
        const d = this.noise.getChannelData(0)
        for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1

        if (MUSIC) this._loop()
    }

    /** 遊戲內靜音 or 平台靜音,任一個成立就不出聲 */
    get off() { return this.muted || this.platformMute }

    _applyGain() { if (this.master) this.master.gain.value = this.off ? 0 : 0.9 }

    /** 由 CrazyGames 的 settings 變更事件呼叫 */
    setPlatformMute(on) { this.platformMute = !!on; this._applyGain() }

    toggle() {
        this.muted = !this.muted
        sset(KEY, this.muted ? '1' : '0')
        this._applyGain()
        return !this.muted
    }

    /* ── 基本發聲 ────────────────────────────────────────────────── */

    /** 一個帶包絡的振盪器音;木頭的音色靠「快起快落」而不是波形 */
    _tone(freq, { at = 0, dur = 0.4, gain = 0.2, type = 'triangle', dest = null,
                  bend = 0, attack = 0.005 } = {}) {
        const ctx = this.ctx
        const t = ctx.currentTime + at
        const o = ctx.createOscillator()
        o.type = type
        o.frequency.setValueAtTime(freq, t)
        if (bend) o.frequency.exponentialRampToValueAtTime(freq * bend, t + dur)
        const g = ctx.createGain()
        g.gain.setValueAtTime(0.0001, t)
        g.gain.exponentialRampToValueAtTime(gain, t + attack)
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
        o.connect(g); g.connect(dest || this.sfxGain)
        o.start(t); o.stop(t + dur + 0.02)
    }

    /** 一段濾過的噪音;喀答、蒸汽、翻車都是它 */
    _noise({ at = 0, dur = 0.08, gain = 0.3, freq = 1200, q = 1, type = 'bandpass' } = {}) {
        const ctx = this.ctx
        const t = ctx.currentTime + at
        const src = ctx.createBufferSource()
        src.buffer = this.noise
        src.loop = true
        const f = ctx.createBiquadFilter()
        f.type = type; f.frequency.value = freq; f.Q.value = q
        const g = ctx.createGain()
        g.gain.setValueAtTime(gain, t)
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
        src.connect(f); f.connect(g); g.connect(this.sfxGain)
        src.start(t); src.stop(t + dur + 0.02)
    }

    /* ── 音效 ────────────────────────────────────────────────────── */

    play(name) {
        if (!this.ctx || this.off) return
        switch (name) {
            case 'place':                       // 木片放到墊子上
                this._noise({ dur: 0.06, gain: 0.35, freq: 1500, q: 1.2 })
                this._tone(320, { dur: 0.09, gain: 0.22, type: 'triangle' })
                break
            case 'rotate':                      // 轉方向,比放置輕
                this._noise({ dur: 0.035, gain: 0.2, freq: 2600, q: 2 })
                break
            case 'erase':
                this._tone(180, { dur: 0.13, gain: 0.18, type: 'sine', bend: 0.6 })
                break
            case 'whistle':                     // 汽笛:兩個略微失諧的音疊起來才有厚度
                this._tone(784, { dur: 0.55, gain: 0.16, type: 'triangle', attack: 0.05, bend: 0.96 })
                this._tone(1179, { dur: 0.55, gain: 0.09, type: 'triangle', attack: 0.06, bend: 0.96 })
                this._noise({ dur: 0.5, gain: 0.04, freq: 3000, q: 0.8 })
                break
            case 'board':                       // 乘客上車
                this._tone(1046.5, { dur: 0.18, gain: 0.2 })
                this._tone(1568, { at: 0.07, dur: 0.22, gain: 0.16 })
                break
            case 'arrive':                      // 進站
                ;[523.25, 659.25, 783.99, 1046.5].forEach((f, i) =>
                    this._tone(f, { at: i * 0.09, dur: 0.5, gain: 0.2 }))
                break
            case 'derail':                      // 翻車:幾下往下掉的撞擊
                for (let i = 0; i < 5; i++)
                    this._noise({ at: i * 0.07, dur: 0.12, gain: 0.3 - i * 0.04,
                                  freq: 900 - i * 130, q: 1.5 })
                this._tone(150, { at: 0.1, dur: 0.4, gain: 0.15, type: 'sine', bend: 0.5 })
                break
            case 'hint':                        // 提示
                ;[880, 1174.7, 1568].forEach((f, i) =>
                    this._tone(f, { at: i * 0.06, dur: 0.3, gain: 0.15 }))
                break
        }
    }

    /** 蒸汽聲:火車在跑的時候依速度一下一下噴 */
    chuff(dt, speed) {
        if (!this.ctx || this.off) return
        this.chuffAcc += dt * Math.max(0.35, speed / 1.9)
        if (this.chuffAcc < 0.34) return
        this.chuffAcc = 0
        this._noise({ dur: 0.11, gain: 0.075, freq: 520, q: 0.7 })
    }

    /* ── 配樂 ────────────────────────────────────────────────────── */

    /**
     * 一小節:和弦鋪底 + 木魚般的節拍 + 幾個五聲音階的音。
     * 每小節重排一次,所以不會聽出循環。
     */
    _bar() {
        if (this.off) return
        const chord = CHORDS[Math.floor(Math.random() * CHORDS.length)]
        for (const f of chord)
            this._tone(f, { dur: 3.4, gain: 0.05, type: 'sine', attack: 0.5, dest: this.musicGain })
        for (let b = 0; b < 4; b++)               // 木魚:每拍一下,弱拍更輕
            this._noise({ at: b * 0.85, dur: 0.04, gain: b % 2 ? 0.05 : 0.09, freq: 1800, q: 3 })
        for (let i = 0; i < 5; i++) {
            if (Math.random() < 0.35) continue     // 留白,不要每格都塞音
            const f = PENTA[Math.floor(Math.random() * PENTA.length)]
            this._tone(f, { at: 0.2 + i * 0.62, dur: 0.9, gain: 0.09,
                            type: 'triangle', dest: this.musicGain })
        }
    }

    _loop() {
        this._bar()
        this.timers.push(setTimeout(() => this._loop(), 3400))
    }
}
