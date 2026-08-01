/**
 * 天氣系統:3D 雨絲 + 螢幕水滴 + 雨聲。
 *
 * 螢幕水滴用一層 2D canvas 疊在 WebGL 之上:水珠會附著、滑落、拖出水痕,
 * 像鏡頭沾到雨水一樣。3D 雨絲則是跟著飛機移動的一箱線段,製造穿越雨中的感覺。
 */

export class Weather {
    /**
     * @param {object} THREE
     * @param {THREE.Scene} scene
     * @param {number} startIntensity 0~1,可由 ?rain= 指定;null 表示自動天氣
     */
    constructor(THREE, scene, startIntensity = null) {
        this.THREE = THREE
        this.scene = scene
        this.intensity = startIntensity ?? 0
        this.target = startIntensity ?? 0
        this.forced = startIntensity !== null
        this.nextChange = 45 + Math.random() * 60
        this.t = 0

        this._buildRain()
        this._buildScreen()
    }

    // ---------- 3D 雨絲 ----------
    _buildRain() {
        const { THREE } = this
        this.COUNT = 1400
        this.BOX = { w: 30, h: 22, d: 30 }          // 圍繞飛機的雨箱
        this.DROP_LEN = 1.1

        // 每滴雨在「飛機的當地座標」中的位置,每幀再轉成世界座標
        this.off = new Float32Array(this.COUNT * 3)
        for (let i = 0; i < this.COUNT; i++) {
            this.off[i * 3] = (Math.random() - 0.5) * this.BOX.w
            this.off[i * 3 + 1] = (Math.random() - 0.5) * this.BOX.h
            this.off[i * 3 + 2] = (Math.random() - 0.5) * this.BOX.d
        }

        const geo = new THREE.BufferGeometry()
        this.pos = new Float32Array(this.COUNT * 6)   // 每滴兩個端點
        geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3))
        this.rainMesh = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({
            color: 0xbcd6ee, transparent: true, opacity: 0, depthWrite: false
        }))
        this.rainMesh.frustumCulled = false
        this.rainMesh.visible = false
        this.scene.add(this.rainMesh)
    }

    // ---------- 螢幕水滴 ----------
    _buildScreen() {
        const c = document.createElement('canvas')
        c.id = 'rainCanvas'
        Object.assign(c.style, {
            position: 'fixed', inset: '0', width: '100%', height: '100%',
            pointerEvents: 'none', zIndex: '5', opacity: '0',
            transition: 'opacity .8s',
        })
        document.body.appendChild(c)
        this.canvas = c
        this.ctx = c.getContext('2d')
        this.drops = []
        this._resize()
        addEventListener('resize', () => this._resize())
    }

    _resize() {
        // 分頁在背景載入時 innerWidth 可能是 0,取下限避免畫布變成 0×0
        const dpr = Math.min(devicePixelRatio || 1, 2)
        const w = Math.max(1, innerWidth), h = Math.max(1, innerHeight)
        this.canvas.width = w * dpr
        this.canvas.height = h * dpr
        this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
        this.W = w
        this.H = h
    }

    _spawnDrop() {
        const big = Math.random() < 0.18
        this.drops.push({
            x: Math.random() * this.W,
            y: Math.random() * this.H * 0.85,
            r: big ? 5 + Math.random() * 7 : 1.6 + Math.random() * 3.2,
            vy: 0,                                   // 先附著,累積到一定大小才滑落
            slide: big ? 0.35 + Math.random() * 0.5 : 0,
            life: 2.5 + Math.random() * 4,
            trail: [],
        })
    }

    _drawDrops(dt) {
        const ctx = this.ctx
        ctx.clearRect(0, 0, this.W, this.H)
        if (this.intensity < 0.02) return

        // 依強度補充水滴
        const want = 20 + this.intensity * 110
        while (this.drops.length < want && Math.random() < 0.6) this._spawnDrop()

        for (let i = this.drops.length - 1; i >= 0; i--) {
            const d = this.drops[i]
            d.life -= dt
            if (d.slide > 0) {
                d.vy += d.slide * dt * 60          // 大水滴會加速滑落
                const move = d.vy * dt * 12
                if (move > 0.6) {
                    d.trail.push({ x: d.x, y: d.y, r: d.r * 0.42 })
                    if (d.trail.length > 14) d.trail.shift()
                }
                d.y += move
                d.x += Math.sin(d.y * 0.05) * 0.35   // 微微蜿蜒
            }
            if (d.life <= 0 || d.y - d.r > this.H) {
                this.drops.splice(i, 1)
                continue
            }

            const fade = Math.min(1, d.life / 1.2)

            // 水痕
            for (const t of d.trail) {
                const g = ctx.createRadialGradient(t.x, t.y, 0, t.x, t.y, t.r)
                g.addColorStop(0, `rgba(210,232,255,${0.16 * fade})`)
                g.addColorStop(1, 'rgba(210,232,255,0)')
                ctx.fillStyle = g
                ctx.beginPath()
                ctx.arc(t.x, t.y, t.r, 0, 6.283)
                ctx.fill()
            }

            // 水珠本體:邊緣亮、中間偏暗(像透鏡)
            const g = ctx.createRadialGradient(
                d.x - d.r * 0.3, d.y - d.r * 0.3, d.r * 0.1, d.x, d.y, d.r)
            g.addColorStop(0.0, `rgba(255,255,255,${0.55 * fade})`)
            g.addColorStop(0.35, `rgba(190,215,240,${0.20 * fade})`)
            g.addColorStop(0.85, `rgba(150,185,225,${0.30 * fade})`)
            g.addColorStop(1.0, `rgba(255,255,255,${0.42 * fade})`)
            ctx.fillStyle = g
            ctx.beginPath()
            ctx.arc(d.x, d.y, d.r, 0, 6.283)
            ctx.fill()

            // 高光
            ctx.fillStyle = `rgba(255,255,255,${0.6 * fade})`
            ctx.beginPath()
            ctx.arc(d.x - d.r * 0.32, d.y - d.r * 0.34, d.r * 0.18, 0, 6.283)
            ctx.fill()
        }
    }

    // ---------- 雨聲 ----------
    attachAudio(ctx, destination) {
        if (this.noiseGain || !ctx) return
        const len = ctx.sampleRate * 2
        const buf = ctx.createBuffer(1, len, ctx.sampleRate)
        const data = buf.getChannelData(0)
        for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1

        const src = ctx.createBufferSource()
        src.buffer = buf
        src.loop = true

        const bp = ctx.createBiquadFilter()          // 帶通讓白雜訊像雨聲而非嘶嘶聲
        bp.type = 'bandpass'
        bp.frequency.value = 1400
        bp.Q.value = 0.4

        const lp = ctx.createBiquadFilter()
        lp.type = 'lowpass'
        lp.frequency.value = 5200

        this.noiseGain = ctx.createGain()
        this.noiseGain.gain.value = 0

        src.connect(bp).connect(lp).connect(this.noiseGain).connect(destination)
        src.start()
    }

    // ---------- 每幀更新 ----------
    update(dt, pos, up, fwd, right) {
        this.t += dt
        // 視窗尺寸變了(或載入時還沒有尺寸)就重建畫布
        if (this.W !== Math.max(1, innerWidth) || this.H !== Math.max(1, innerHeight)) this._resize()

        // 自動天氣:每隔一段時間切換晴雨
        if (!this.forced) {
            this.nextChange -= dt
            if (this.nextChange <= 0) {
                this.target = this.target > 0.1 ? 0 : 0.45 + Math.random() * 0.55
                this.nextChange = this.target > 0.1
                    ? 40 + Math.random() * 50       // 一場雨
                    : 70 + Math.random() * 110      // 放晴一陣子
            }
        }
        this.intensity += (this.target - this.intensity) * Math.min(1, dt * 0.35)

        // --- 3D 雨絲 ---
        const on = this.intensity > 0.02
        this.rainMesh.visible = on
        this.canvas.style.opacity = String(Math.min(1, this.intensity * 1.2))
        if (on) {
            const speed = 26 + this.intensity * 22
            const half = this.BOX.h * 0.5
            const p = this.pos
            for (let i = 0; i < this.COUNT; i++) {
                const o = i * 3
                this.off[o + 1] -= speed * dt
                if (this.off[o + 1] < -half) {
                    this.off[o + 1] += this.BOX.h            // 從頂端循環
                    this.off[o] = (Math.random() - 0.5) * this.BOX.w
                    this.off[o + 2] = (Math.random() - 0.5) * this.BOX.d
                }
                const ox = this.off[o], oy = this.off[o + 1], oz = this.off[o + 2]
                const bx = pos.x + right.x * ox + up.x * oy + fwd.x * oz
                const by = pos.y + right.y * ox + up.y * oy + fwd.y * oz
                const bz = pos.z + right.z * ox + up.z * oy + fwd.z * oz
                const L = this.DROP_LEN * (0.6 + this.intensity * 0.8)
                const v = i * 6
                p[v] = bx; p[v + 1] = by; p[v + 2] = bz
                p[v + 3] = bx - up.x * L
                p[v + 4] = by - up.y * L
                p[v + 5] = bz - up.z * L
            }
            this.rainMesh.geometry.attributes.position.needsUpdate = true
            this.rainMesh.material.opacity = 0.10 + this.intensity * 0.32
        }

        this._drawDrops(dt)
        if (this.noiseGain) this.noiseGain.gain.value = this.intensity * 0.10
        return this.intensity
    }
}
