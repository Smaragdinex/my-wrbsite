/**
 * 漆彈系統:玩家與 AI 飛機互相射彩色顏料球。
 *
 * 彈道用直線 + 微弱重力(貼著星球表面飛,距離短到不需要算大圓)。
 * 被打到的飛機機身會沾上對方的顏色再慢慢褪掉;打到玩家則在螢幕上潑一片
 * 同色顏料(獨立的 2D 畫布,疊在雨滴層上面)。
 */

const SPEED = 46          // 漆彈速度(單位/秒)
const LIFE = 2.4          // 存活秒數 → 射程約 110 單位
const GRAV = 5.0          // 微弱下墜,看得出是拋物線
const HIT_R = 2.0         // 命中判定半徑(飛機翼展約 3)
const POOL = 48           // 同時最多幾顆

export class Paint {
    constructor(THREE, scene, R) {
        this.THREE = THREE
        this.scene = scene
        this.R = R
        this.balls = []
        this._v = new THREE.Vector3()
        this._d = new THREE.Vector3()

        const geo = new THREE.SphereGeometry(0.42, 10, 8)
        for (let i = 0; i < POOL; i++) {
            const m = new THREE.MeshStandardMaterial({
                color: 0xffffff, roughness: 0.35, emissive: 0xffffff, emissiveIntensity: 0.25,
            })
            const mesh = new THREE.Mesh(geo, m)
            mesh.visible = false
            scene.add(mesh)
            this.balls.push({
                mesh, mat: m, alive: false, owner: null,
                pos: new THREE.Vector3(), vel: new THREE.Vector3(), life: 0, color: 0xffffff,
            })
        }
        this._buildScreen()
    }

    /** 發射一顆。dir 不必先正規化;owner 用來避免打到自己 */
    fire(from, dir, color, owner) {
        const b = this.balls.find(x => !x.alive)
        if (!b) return null
        b.alive = true
        b.owner = owner
        b.color = color
        b.life = LIFE
        b.pos.copy(from)
        b.vel.copy(dir).normalize().multiplyScalar(SPEED)
        b.mat.color.set(color)
        b.mat.emissive.set(color)
        b.mesh.position.copy(from)
        b.mesh.visible = true
        return b
    }

    /**
     * @param player   { pos, onHit(color) } 玩家;onHit 由呼叫端決定要不要潑螢幕
     * @param npcs     traffic.planes,每個要有 rig.position;命中時呼叫 onNpcHit
     * @param onNpcHit (plane, color) => void
     */
    update(dt, player, npcs, onNpcHit) {
        const { THREE } = this
        for (const b of this.balls) {
            if (!b.alive) continue

            // 微弱重力朝星球中心
            const down = this._d.copy(b.pos).normalize().multiplyScalar(-GRAV * dt)
            b.vel.add(down)
            b.pos.addScaledVector(b.vel, dt)
            b.mesh.position.copy(b.pos)
            b.life -= dt

            let hit = false
            if (b.owner !== 'player' && player && b.pos.distanceTo(player.pos) < HIT_R) {
                player.onHit(b.color)
                hit = true
            }
            if (!hit && b.owner === 'player' && npcs) {
                for (const p of npcs) {
                    if (b.pos.distanceTo(p.rig.position) < HIT_R) {
                        onNpcHit && onNpcHit(p, b.color)
                        hit = true
                        break
                    }
                }
            }
            // 打到地面也算沒了
            if (!hit && b.pos.length() < this.R + 0.2) hit = true

            if (hit || b.life <= 0) {
                b.alive = false
                b.mesh.visible = false
            }
        }
        this._drawScreen(dt)
    }

    // ---------- 螢幕上的顏料 ----------
    _buildScreen() {
        const c = document.createElement('canvas')
        c.id = 'paintCanvas'
        Object.assign(c.style, {
            position: 'fixed', inset: '0', width: '100%', height: '100%',
            pointerEvents: 'none', zIndex: '6',      // 疊在雨滴層(5)上面
        })
        document.body.appendChild(c)
        this.canvas = c
        this.ctx = c.getContext('2d')
        this.splats = []
        this._resize()
        addEventListener('resize', () => this._resize())
    }

    _resize() {
        const dpr = Math.min(devicePixelRatio || 1, 2)
        this.W = Math.max(1, innerWidth)
        this.H = Math.max(1, innerHeight)
        this.canvas.width = this.W * dpr
        this.canvas.height = this.H * dpr
        this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }

    /** 被打中:在螢幕上潑一片顏料 */
    splat(color) {
        const { THREE } = this
        const c = new THREE.Color(color)
        const rgb = `${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)}`
        const base = Math.min(this.W, this.H)
        const cx = this.W * (0.25 + Math.random() * 0.5)
        const cy = this.H * (0.25 + Math.random() * 0.5)

        // 每坨用不規則多邊形而不是圓形,才不會像一顆顆泡泡
        const blob = (x, y, r) => {
            const n = 9 + Math.floor(Math.random() * 5)
            const pts = []
            for (let i = 0; i < n; i++) {
                const a = (i / n) * Math.PI * 2
                const rr = r * (0.66 + Math.random() * 0.6)
                pts.push([x + Math.cos(a) * rr, y + Math.sin(a) * rr])
            }
            return pts
        }

        const blobs = [blob(cx, cy, base * (0.11 + Math.random() * 0.05))]
        for (let i = 0; i < 11; i++) {          // 周圍濺開的小點
            const a = Math.random() * Math.PI * 2
            const d = base * (0.06 + Math.random() * 0.20)
            blobs.push(blob(cx + Math.cos(a) * d, cy + Math.sin(a) * d,
                            base * (0.012 + Math.random() * 0.04)))
        }
        // 往下流的幾道痕跡:長度會隨時間拉長
        const drips = []
        for (let i = 0; i < 4; i++) {
            drips.push({
                x: cx + (Math.random() - 0.5) * base * 0.16,
                y: cy + base * (0.04 + Math.random() * 0.07),
                w: base * (0.008 + Math.random() * 0.016),
                len: base * (0.05 + Math.random() * 0.14),
            })
        }
        this.splats.push({ rgb, blobs, drips, t: 0, life: 5.5 })
    }

    _drawScreen(dt) {
        if (this.W !== Math.max(1, innerWidth) || this.H !== Math.max(1, innerHeight)) this._resize()
        const ctx = this.ctx
        ctx.clearRect(0, 0, this.W, this.H)
        if (!this.splats.length) return

        for (const s of this.splats) {
            s.t += dt
            const k = 1 - s.t / s.life
            if (k <= 0) continue
            ctx.fillStyle = `rgba(${s.rgb},${Math.min(0.85, k * 1.5).toFixed(3)})`
            // 整片一次描邊再一次填色,重疊處才不會疊出深淺不一的圓
            ctx.beginPath()
            for (const pts of s.blobs) {
                ctx.moveTo((pts[0][0] + pts[pts.length - 1][0]) / 2,
                           (pts[0][1] + pts[pts.length - 1][1]) / 2)
                for (let i = 0; i < pts.length; i++) {
                    const cur = pts[i]
                    const nxt = pts[(i + 1) % pts.length]
                    ctx.quadraticCurveTo(cur[0], cur[1], (cur[0] + nxt[0]) / 2, (cur[1] + nxt[1]) / 2)
                }
                ctx.closePath()
            }
            const grow = Math.min(1, s.t * 0.55)          // 顏料慢慢往下流
            for (const d of s.drips) {
                ctx.moveTo(d.x - d.w, d.y)
                ctx.lineTo(d.x + d.w, d.y)
                ctx.lineTo(d.x + d.w * 0.5, d.y + d.len * grow)
                ctx.quadraticCurveTo(d.x, d.y + d.len * grow + d.w * 1.6,
                                     d.x - d.w * 0.5, d.y + d.len * grow)
                ctx.closePath()
            }
            ctx.fill()
        }
        this.splats = this.splats.filter(s => s.t < s.life)
    }
}
