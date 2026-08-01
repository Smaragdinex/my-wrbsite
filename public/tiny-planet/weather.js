/**
 * 天氣系統:雲、霧、雨/雪、雷暴、螢幕水滴、天氣音效。
 *
 * - 雲:整顆星球外圍一層雲場(單一 Points,一次 draw call),雷暴時轉暗
 * - 降水:溫暖地區下雨(線段雨絲 + 鏡頭水滴),寒帶下雪(緩慢飄落的雪點)
 * - 雷暴:強降雨時隨機閃電,畫面爆白 + 依「光快聲慢」延遲的雷聲
 * - 霧:本模組提供 fogFactor,由 index.html 設定 scene.fog
 */

export class Weather {
    constructor(THREE, scene, startIntensity = null) {
        this.THREE = THREE
        this.scene = scene

        this.forced = startIntensity !== null
        if (this.forced) {
            this.intensity = this.target = startIntensity
            this.nextChange = Infinity
        } else {
            const raining = Math.random() < 0.4      // 四成機率一登入就在下
            this.target = raining ? this._randomRain() : 0
            this.intensity = this.target
            this.nextChange = raining ? 35 + Math.random() * 55 : 50 + Math.random() * 90
        }

        this.cold = 0            // 0=溫暖(下雨) 1=寒帶(下雪)
        this.storm = 0
        this.flash = 0           // 閃電亮度
        this.nextBolt = 4 + Math.random() * 8
        this.t = 0

        this._buildClouds()
        this._buildPrecip()
        this._buildScreen()
    }

    /** 雨勢:多數是普通陣雨,偶爾毛毛雨或傾盆大雨 */
    _randomRain() {
        const r = Math.random()
        if (r < 0.28) return 0.22 + Math.random() * 0.15    // 毛毛雨
        if (r < 0.82) return 0.45 + Math.random() * 0.30    // 一般陣雨
        return 0.85 + Math.random() * 0.15                  // 傾盆大雨
    }

    _softTexture(inner, mid) {
        const c = document.createElement('canvas')
        c.width = c.height = 64
        const ctx = c.getContext('2d')
        const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32)
        g.addColorStop(0.0, inner)
        g.addColorStop(0.45, mid)
        g.addColorStop(1.0, 'rgba(255,255,255,0)')
        ctx.fillStyle = g
        ctx.fillRect(0, 0, 64, 64)
        return new this.THREE.CanvasTexture(c)
    }

    // ---------- 雲場 ----------
    _buildClouds() {
        const { THREE } = this
        const CLUSTERS = 1000, PUFFS = 16, R_PLANET = 93.6
        const pos = new Float32Array(CLUSTERS * PUFFS * 3)
        const siz = new Float32Array(CLUSTERS * PUFFS)
        const v = new THREE.Vector3()
        let i = 0
        for (let c = 0; c < CLUSTERS; c++) {
            v.randomDirection()
            // 飛行高度是 R+8.5,雲層要橫跨其上下才會同時出現在天空與腳下
            const alt = R_PLANET + 6.0 + Math.random() * 12.0
            const up = v.clone()
            let e = new THREE.Vector3().crossVectors(up, new THREE.Vector3(0, 1, 0))
            if (e.lengthSq() < 1e-6) e = new THREE.Vector3(1, 0, 0)
            e.normalize()
            const n = new THREE.Vector3().crossVectors(up, e).normalize()
            const spread = 2.6 + Math.random() * 4.0        // 雲的水平尺度
            for (let p = 0; p < PUFFS; p++) {
                const gx = (Math.random() + Math.random() + Math.random() - 1.5) / 1.5
                const gy = (Math.random() + Math.random() + Math.random() - 1.5) / 1.5
                const o = up.clone().multiplyScalar(alt)
                    .addScaledVector(e, gx * spread)          // 中心密、邊緣疏
                    .addScaledVector(n, gy * spread)
                    .addScaledVector(up, (Math.random() - 0.5) * 1.6)
                pos.set([o.x, o.y, o.z], i * 3)
                siz[i] = (3.2 + Math.random() * 3.4) * (0.6 + spread * 0.18)
                i++
            }
        }
        const geo = new THREE.BufferGeometry()
        geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
        geo.setAttribute('size', new THREE.BufferAttribute(siz, 1))

        // 自訂 shader:PointsMaterial 只能統一尺寸,雲朵需要大小不一
        this.cloudMat = new THREE.ShaderMaterial({
            uniforms: {
                map: { value: this._softTexture('rgba(255,255,255,0.95)', 'rgba(255,255,255,0.55)') },
                tint: { value: new THREE.Color(1, 1, 1) },
                opacity: { value: 0.85 },
                scale: { value: 480 },
            },
            vertexShader: `
                attribute float size;
                uniform float scale;
                void main() {
                    vec4 mv = modelViewMatrix * vec4(position, 1.0);
                    gl_PointSize = size * scale / max(1.0, -mv.z);
                    gl_Position = projectionMatrix * mv;
                }`,
            fragmentShader: `
                uniform sampler2D map;
                uniform vec3 tint;
                uniform float opacity;
                void main() {
                    vec4 t = texture2D(map, gl_PointCoord);
                    if (t.a < 0.01) discard;
                    gl_FragColor = vec4(tint, t.a * opacity);
                }`,
            transparent: true, depthWrite: false,
        })
        this.clouds = new THREE.Points(geo, this.cloudMat)
        this.clouds.frustumCulled = false
        this.scene.add(this.clouds)
    }

    // ---------- 降水(雨絲 / 雪點)----------
    _buildPrecip() {
        const { THREE } = this
        this.COUNT = 1400
        this.BOX = { w: 30, h: 22, d: 30 }
        this.off = new Float32Array(this.COUNT * 3)
        for (let i = 0; i < this.COUNT; i++) {
            this.off[i * 3] = (Math.random() - 0.5) * this.BOX.w
            this.off[i * 3 + 1] = (Math.random() - 0.5) * this.BOX.h
            this.off[i * 3 + 2] = (Math.random() - 0.5) * this.BOX.d
        }

        const rgeo = new THREE.BufferGeometry()
        this.rainPos = new Float32Array(this.COUNT * 6)          // 每滴兩個端點
        rgeo.setAttribute('position', new THREE.BufferAttribute(this.rainPos, 3))
        this.rainMesh = new THREE.LineSegments(rgeo, new THREE.LineBasicMaterial({
            color: 0xbcd6ee, transparent: true, opacity: 0, depthWrite: false, fog: false
        }))
        this.rainMesh.frustumCulled = false
        this.rainMesh.visible = false
        this.scene.add(this.rainMesh)

        const sgeo = new THREE.BufferGeometry()
        this.snowPos = new Float32Array(this.COUNT * 3)
        sgeo.setAttribute('position', new THREE.BufferAttribute(this.snowPos, 3))
        this.snowMesh = new THREE.Points(sgeo, new THREE.PointsMaterial({
            map: this._softTexture('rgba(255,255,255,1)', 'rgba(255,255,255,0.7)'),
            color: 0xffffff, size: 0.3, sizeAttenuation: true,
            transparent: true, opacity: 0, depthWrite: false, fog: false
        }))
        this.snowMesh.frustumCulled = false
        this.snowMesh.visible = false
        this.scene.add(this.snowMesh)
    }

    // ---------- 螢幕水滴 ----------
    _buildScreen() {
        const c = document.createElement('canvas')
        c.id = 'rainCanvas'
        Object.assign(c.style, {
            position: 'fixed', inset: '0', width: '100%', height: '100%',
            pointerEvents: 'none', zIndex: '5', opacity: '0', transition: 'opacity .8s',
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
            vy: 0,
            slide: big ? 0.35 + Math.random() * 0.5 : 0,
            life: 2.5 + Math.random() * 4,
            trail: [],
        })
    }

    _drawScreen(dt) {
        const ctx = this.ctx
        ctx.clearRect(0, 0, this.W, this.H)

        if (this.flash > 0.001) {                     // 閃電:整個畫面爆白
            ctx.fillStyle = `rgba(226,238,255,${this.flash * 0.55})`
            ctx.fillRect(0, 0, this.W, this.H)
        }

        // 下雪時鏡頭不會沾水珠
        const wetness = this.intensity * (1 - this.cold)
        if (wetness > 0.03) {
            const want = 20 + wetness * 110
            while (this.drops.length < want && Math.random() < 0.6) this._spawnDrop()
        }

        for (let i = this.drops.length - 1; i >= 0; i--) {
            const d = this.drops[i]
            d.life -= dt
            if (d.slide > 0) {
                d.vy += d.slide * dt * 60                 // 大水滴會加速滑落
                const move = d.vy * dt * 12
                if (move > 0.6) {
                    d.trail.push({ x: d.x, y: d.y, r: d.r * 0.42 })
                    if (d.trail.length > 14) d.trail.shift()
                }
                d.y += move
                d.x += Math.sin(d.y * 0.05) * 0.35        // 微微蜿蜒
            }
            if (d.life <= 0 || d.y - d.r > this.H) {
                this.drops.splice(i, 1)
                continue
            }
            const fade = Math.min(1, d.life / 1.2)
            for (const t of d.trail) {
                const g = ctx.createRadialGradient(t.x, t.y, 0, t.x, t.y, t.r)
                g.addColorStop(0, `rgba(210,232,255,${0.16 * fade})`)
                g.addColorStop(1, 'rgba(210,232,255,0)')
                ctx.fillStyle = g
                ctx.beginPath()
                ctx.arc(t.x, t.y, t.r, 0, 6.283)
                ctx.fill()
            }
            // 水珠:邊緣亮、中間偏暗,像個小透鏡
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
            ctx.fillStyle = `rgba(255,255,255,${0.6 * fade})`
            ctx.beginPath()
            ctx.arc(d.x - d.r * 0.32, d.y - d.r * 0.34, d.r * 0.18, 0, 6.283)
            ctx.fill()
        }
    }

    // ---------- 音效 ----------
    attachAudio(ctx, destination) {
        if (this.audio || !ctx) return
        const len = ctx.sampleRate * 2
        const buf = ctx.createBuffer(1, len, ctx.sampleRate)
        const data = buf.getChannelData(0)
        for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1

        const src = ctx.createBufferSource()
        src.buffer = buf
        src.loop = true
        const bp = ctx.createBiquadFilter()      // 帶通讓白雜訊像雨聲,而不是嘶嘶聲
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

        this.audio = { ctx, destination, noiseBuf: buf }
    }

    /** 雷聲:低頻噪音突波,依距離延遲(光快聲慢) */
    _thunder(delay) {
        if (!this.audio) return
        const { ctx, destination, noiseBuf } = this.audio
        const t0 = ctx.currentTime + delay
        const src = ctx.createBufferSource()
        src.buffer = noiseBuf
        const lp = ctx.createBiquadFilter()
        lp.type = 'lowpass'
        lp.frequency.setValueAtTime(400, t0)
        lp.frequency.exponentialRampToValueAtTime(90, t0 + 2.2)
        const g = ctx.createGain()
        g.gain.setValueAtTime(0.0001, t0)
        g.gain.linearRampToValueAtTime(0.34, t0 + 0.08)
        g.gain.exponentialRampToValueAtTime(0.0008, t0 + 2.6)
        src.connect(lp).connect(g).connect(destination)
        src.start(t0)
        src.stop(t0 + 2.8)
    }

    /** 霧的濃度:下雨、雷暴時更濃 */
    get fogFactor() {
        return this.intensity * (0.55 + this.storm * 0.45)
    }

    // ---------- 每幀更新 ----------
    /**
     * @param cold 0~1,由緯度換算的寒冷程度(>0.5 就下雪)
     * @param dayF 0~1,白天程度(雲在夜裡要跟著變暗)
     */
    update(dt, pos, up, fwd, right, cold = 0, dayF = 1) {
        this.t += dt
        if (this.W !== Math.max(1, innerWidth) || this.H !== Math.max(1, innerHeight)) this._resize()

        this.cold += (cold - this.cold) * Math.min(1, dt * 0.6)

        if (!this.forced) {
            this.nextChange -= dt
            if (this.nextChange <= 0) {
                const wasRaining = this.target > 0.1
                this.target = wasRaining ? 0 : this._randomRain()
                this.nextChange = this.target > 0.1
                    ? 40 + Math.random() * 50       // 一場雨
                    : 70 + Math.random() * 110      // 放晴一陣子
            }
        }
        this.intensity += (this.target - this.intensity) * Math.min(1, dt * 0.35)

        // --- 雷暴:雨夠大才打雷,寒帶不打 ---
        this.storm = Math.max(0, (this.intensity - 0.72) / 0.28) * (1 - this.cold)
        this.flash *= Math.pow(0.02, dt)
        if (this.storm > 0.15) {
            this.nextBolt -= dt * this.storm
            if (this.nextBolt <= 0) {
                this.flash = 0.7 + Math.random() * 0.3
                this._thunder(0.4 + Math.random() * 2.2)
                this.nextBolt = 3 + Math.random() * 11
            }
        }

        // --- 雲 ---
        const dark = 1 - this.storm * 0.55 - this.intensity * 0.12
        const night = 0.28 + 0.72 * dayF
        const k = dark * night
        this.cloudMat.uniforms.tint.value.setRGB(k * (1 - this.storm * 0.06), k, k * (1 + this.storm * 0.08))
        this.cloudMat.uniforms.opacity.value = 0.55 + this.intensity * 0.35

        // --- 降水 ---
        const on = this.intensity > 0.02
        const snowing = this.cold > 0.5
        this.rainMesh.visible = on && !snowing
        this.snowMesh.visible = on && snowing
        this.canvas.style.opacity = String(Math.min(1, Math.max(this.intensity * 1.2, this.flash)))

        if (on) {
            const speed = snowing ? 3.4 + this.intensity * 2.5 : 26 + this.intensity * 22
            const half = this.BOX.h * 0.5
            for (let i = 0; i < this.COUNT; i++) {
                const o = i * 3
                this.off[o + 1] -= speed * dt
                if (snowing) {                                   // 雪會左右飄
                    this.off[o] += Math.sin(this.t * 0.7 + i) * dt * 1.6
                    this.off[o + 2] += Math.cos(this.t * 0.5 + i * 1.7) * dt * 1.6
                }
                if (this.off[o + 1] < -half) {
                    this.off[o + 1] += this.BOX.h                // 從頂端循環
                    this.off[o] = (Math.random() - 0.5) * this.BOX.w
                    this.off[o + 2] = (Math.random() - 0.5) * this.BOX.d
                }
                const ox = this.off[o], oy = this.off[o + 1], oz = this.off[o + 2]
                const bx = pos.x + right.x * ox + up.x * oy + fwd.x * oz
                const by = pos.y + right.y * ox + up.y * oy + fwd.y * oz
                const bz = pos.z + right.z * ox + up.z * oy + fwd.z * oz
                if (snowing) {
                    const v = i * 3
                    this.snowPos[v] = bx; this.snowPos[v + 1] = by; this.snowPos[v + 2] = bz
                } else {
                    const L = 1.1 * (0.6 + this.intensity * 0.8)
                    const v = i * 6
                    this.rainPos[v] = bx; this.rainPos[v + 1] = by; this.rainPos[v + 2] = bz
                    this.rainPos[v + 3] = bx - up.x * L
                    this.rainPos[v + 4] = by - up.y * L
                    this.rainPos[v + 5] = bz - up.z * L
                }
            }
            if (snowing) {
                this.snowMesh.geometry.attributes.position.needsUpdate = true
                this.snowMesh.material.opacity = 0.35 + this.intensity * 0.5
            } else {
                this.rainMesh.geometry.attributes.position.needsUpdate = true
                this.rainMesh.material.opacity = 0.10 + this.intensity * 0.32
            }
        }

        this._drawScreen(dt)
        if (this.noiseGain) {
            this.noiseGain.gain.value = this.intensity * (snowing ? 0.025 : 0.10)   // 雪聲很小
        }
        return this.intensity
    }
}
