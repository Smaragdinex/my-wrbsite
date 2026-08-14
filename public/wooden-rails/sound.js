// 配樂與音效,全部用 Web Audio 即時合成,不下載任何音檔。
//
// 音色刻意選「打到木頭」那一類:音樂盒/馬林巴的短促泛音、木魚般的節拍、
// 鋪軌的喀答聲。用取樣音檔當然更真,但那是幾百 KB,而這整個遊戲的
// 程式碼加起來才 130 KB。
//
// 配樂是自己寫的一段曲子,不是隨機取音 —— 隨機的版本永遠不難聽,
// 但也永遠哼不出來,而這種遊戲需要的正是一段記得住的調子。
import { get as sget, set as sset } from './store.js?v=90'

const KEY = 'wr.mute'

export class Sound {
    constructor() {
        this.ctx = null
        this.muted = sget(KEY) === '1'
        // CrazyGames 站方的靜音優先於遊戲內設定(平台明文要求)
        this.platformMute = false
        this.timers = []
        this.chuffAcc = 0
        this.sec = 0          // 目前排到第幾段
        this.nextAt = 0       // 下一段該從音訊時鐘的哪一刻開始
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

        this._loop()
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
        this.sec = 0          // 目前排到第幾段
        this.nextAt = 0       // 下一段該從音訊時鐘的哪一刻開始
        this._noise({ dur: 0.11, gain: 0.075, freq: 520, q: 0.7 })
    }

    /* ── 配樂 ────────────────────────────────────────────────────── */

    /**
     * 排一段(8 小節)。全部用音訊時鐘的絕對時間排,不靠 setTimeout ——
     * setTimeout 會漂,而輕快的曲子只要拍子一鬆就整個垮掉。
     */
    _section(t0, sec) {
        for (let b = 0; b < 8; b++) {
            const at = t0 + b * BAR
            const [rootName, triad] = CHORD[sec.ch[b]]
            const root = hz(rootName)
            // 低音踩正拍,第三拍換成五度 —— 這是往前走的推力
            this._m(root, at, BEAT * 0.85, { gain: .16, type: 'triangle', cut: 900 })
            this._m(root * 1.5, at + BEAT * 2, BEAT * 0.85, { gain: .14, type: 'triangle', cut: 900 })
            // 和弦切在反拍,短促。「輕快」是這一下決定的,不是音色
            for (let k = 0; k < 4; k++)
                for (const n of triad)
                    this._m(hz(n), at + BEAT * (k + .5), BEAT * .32,
                            { gain: .05, type: 'square', cut: 1800 })
            // 八分音符的細碎打點,正拍重一些
            for (let k = 0; k < 8; k++)
                this._mn(at + BEAT * k / 2, .03, k % 2 ? .02 : .045)
        }
        let t = 0
        for (const [n, beats] of sec.mel) {
            if (n) {
                const f = hz(n), dur = beats * BEAT * .92
                this._m(f, t0 + t * BEAT, dur, { gain: .11, type: 'square', cut: 3200 })
                // 疊一個略微失諧的同音,厚度就出來了
                this._m(f, t0 + t * BEAT, dur, { gain: .045, type: 'square', cut: 3200, detune: 8 })
            }
            t += beats
        }
        return BAR * 8
    }

    /** 配樂用的單音(絕對時間) */
    _m(freq, when, dur, { gain = .1, type = 'square', cut = 2600, detune = 0 } = {}) {
        const ctx = this.ctx
        const o = ctx.createOscillator()
        o.type = type; o.frequency.value = freq; o.detune.value = detune
        const f = ctx.createBiquadFilter()
        f.type = 'lowpass'; f.frequency.value = cut
        const g = ctx.createGain()
        g.gain.setValueAtTime(0.0001, when)
        g.gain.exponentialRampToValueAtTime(gain, when + .012)
        g.gain.exponentialRampToValueAtTime(0.0001, when + dur)
        o.connect(f); f.connect(g); g.connect(this.musicGain)
        o.start(when); o.stop(when + dur + .02)
    }

    /** 配樂用的打點(絕對時間) */
    _mn(when, dur, gain) {
        const ctx = this.ctx
        const src = ctx.createBufferSource()
        src.buffer = this.noise
        const f = ctx.createBiquadFilter()
        f.type = 'bandpass'; f.frequency.value = 7000; f.Q.value = 2
        const g = ctx.createGain()
        g.gain.setValueAtTime(gain, when)
        g.gain.exponentialRampToValueAtTime(0.0001, when + dur)
        src.connect(f); f.connect(g); g.connect(this.musicGain)
        src.start(when); src.stop(when + dur + .02)
    }

    _loop() {
        const t = ms => { this.timers = [setTimeout(() => this._loop(), ms)] }
        if (this.off) { this.nextAt = 0; return t(800) }
        const t0 = Math.max(this.ctx.currentTime + .08, this.nextAt || 0)
        this._section(t0, SECTIONS[this.sec++ % SECTIONS.length])
        this.nextAt = t0 + BAR * 8
        // 提前 0.25 秒排下一段:銜接處不能有縫,不然每 12 秒就頓一下
        t(Math.max(500, (this.nextAt - this.ctx.currentTime - .25) * 1000))
    }
}

/* ── 曲子本身 ─────────────────────────────────────────────────────── */
// 原創的小調子,不是任何既有曲目。A 段 B 段輪流,一輪約 25 秒。

const BPM = 152                     // 走路再快一點的速度,不會催
const BEAT = 60 / BPM
const BAR = BEAT * 4

const STEP = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }
/** 音名轉頻率:C4 = 中央 C */
const hz = n => 440 * Math.pow(2,
    (STEP[n[0]] + (n[1] === '#' ? 1 : 0) + (+n[n.length - 1] + 1) * 12 - 69) / 12)

const CHORD = {
    C:  ['C2', ['C4', 'E4', 'G4']],
    G:  ['G2', ['B3', 'D4', 'G4']],
    Am: ['A2', ['A3', 'C4', 'E4']],
    F:  ['F2', ['F3', 'A3', 'C4']],
}

// [音名, 幾拍];null 是休止。每段剛好 32 拍
const SECTIONS = [
    {   ch: ['C', 'G', 'Am', 'F', 'C', 'G', 'F', 'G'],
        mel: [
            ['E5', .5], ['G5', .5], ['E5', .5], ['C5', .5], ['D5', 1], ['E5', 1],
            ['D5', .5], ['F5', .5], ['D5', .5], ['B4', .5], ['C5', 1], ['D5', 1],
            ['C5', .5], ['E5', .5], ['A5', 1], ['G5', .5], ['E5', .5], ['C5', 1],
            ['A4', .5], ['C5', .5], ['F5', 1], ['E5', 1], ['D5', 1],
            ['E5', .5], ['G5', .5], ['C6', 1], ['B5', .5], ['G5', .5], ['E5', 1],
            ['D5', .5], ['G5', .5], ['B5', 1], ['A5', .5], ['F5', .5], ['D5', 1],
            ['A4', .5], ['C5', .5], ['F5', .5], ['A5', .5], ['G5', 1], ['F5', 1],
            ['D5', 1], ['B4', 1], ['G4', 2],
        ] },
    {   ch: ['F', 'G', 'C', 'Am', 'F', 'G', 'C', 'G'],
        mel: [
            ['F5', .5], ['G5', .5], ['A5', 1], ['F5', .5], ['G5', .5], ['A5', 1],
            ['G5', .5], ['A5', .5], ['B5', 1], ['G5', 1], ['D5', 1],
            ['E5', .5], ['G5', .5], ['C6', 1.5], ['B5', .5], ['G5', 1],
            ['A5', 1], ['G5', .5], ['E5', .5], ['C5', 2],
            ['F5', .5], ['A5', .5], ['C6', 1], ['A5', .5], ['F5', .5], ['C5', 1],
            ['D5', .5], ['F5', .5], ['B5', 1], ['A5', .5], ['G5', .5], ['D5', 1],
            ['E5', .5], ['G5', .5], ['C6', 1], ['E6', 1], ['D6', 1],
            ['D6', 1], ['B5', 1], ['G5', 2],
        ] },
]
