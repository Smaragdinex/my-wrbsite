/**
 * 城市煙火:只在夜裡、只在指定的幾座城市上空隨機施放。
 *
 * 整套只用一個 Points 物件跑全部粒子(升空的火箭也是其中一顆),
 * 每顆粒子自己帶速度、壽命與顏色。爆開時把一批粒子從同一點往四面撒,
 * 再一律受星球中心的重力拉回去 —— 在球面世界裡「下」不是固定方向,
 * 每顆都要各自算,不能用一個共用的 -Y。
 */

// 只有這些城市會放。座標就是各城市市中心
export const FIREWORK_CITIES = [
    ['London', 51.51, -0.13],
    ['Paris', 48.86, 2.35],
    ['New York', 40.75, -73.98],
    ['Shanghai', 31.23, 121.51],
    ['Tokyo', 35.68, 139.75],
    ['Taipei', 25.03, 121.56],
    ['Sydney', -33.87, 151.21],
    ['Seoul', 37.57, 126.98],
    ['Singapore', 1.30, 103.85],
    ['Dubai', 25.20, 55.27],
]

// 煙火的配色:飽和度高、亮度也高,夜空裡才跳得出來
const PALETTE = [
    [1.00, 0.36, 0.42],   // 紅
    [1.00, 0.78, 0.24],   // 金
    [0.44, 0.86, 1.00],   // 冰藍
    [0.62, 1.00, 0.52],   // 綠
    [1.00, 0.55, 0.90],   // 粉
    [0.98, 0.98, 0.92],   // 白
]

const POOL = 1400            // 同時最多幾顆粒子
const BURST = 78             // 一朵花幾顆
const RISE = 5.2             // 火箭升空高度(遊戲單位)
const GRAV = 3.4             // 往星球中心的加速度
const DIM = 0.42            // 底色先壓暗,疊起來才不會爆白

export class Fireworks {
    constructor(THREE, scene, R, latLonDir) {
        this.THREE = THREE
        this.R = R
        this.sites = FIREWORK_CITIES.map(([name, lat, lon]) => ({
            name, dir: latLonDir(lat, lon).normalize(),
        }))

        this.pos = new Float32Array(POOL * 3)
        this.col = new Float32Array(POOL * 3)   // 實際送進 shader 的顏色(已乘上淡出)
        this.base = new Float32Array(POOL * 3)  // 原本的顏色,淡出時要拿它重算
        this.vel = new Float32Array(POOL * 3)
        this.life = new Float32Array(POOL)      // 剩餘壽命(秒)
        this.full = new Float32Array(POOL)      // 出生時的壽命,用來算淡出
        this.kind = new Uint8Array(POOL)        // 0=閒置 1=上升中的火箭 2=爆開的火花
        this.head = 0

        const g = new THREE.BufferGeometry()
        g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3))
        g.setAttribute('color', new THREE.BufferAttribute(this.col, 3))
        this.geo = g

        // 加成混合下,粒子只要一大一亮就會整團疊成死白(第一版 size 1.25 + 全亮
        // 就是這樣)。尺寸壓小、底色先乘 DIM,再靠數量堆出亮度
        this.mat = new THREE.PointsMaterial({
            size: 0.62, sizeAttenuation: true, vertexColors: true,
            map: this._sprite(), transparent: true, opacity: 1,
            blending: THREE.AdditiveBlending, depthWrite: false,
        })
        this.points = new THREE.Points(g, this.mat)
        this.points.frustumCulled = false       // 粒子散得開,整包一起裁切會突然消失
        this.points.visible = false
        scene.add(this.points)

        this.cool = 1.5                          // 距離下一次施放的秒數
        this._v = new THREE.Vector3()
        this._u = new THREE.Vector3()
        // 全部粒子先塞到星球中心外的無效位置,避免第一幀出現在 (0,0,0)
        for (let i = 0; i < POOL; i++) this.pos[i * 3 + 1] = -1e6
    }

    /** 一顆柔邊圓點,直接畫在 canvas 上當貼圖 */
    _sprite() {
        const c = document.createElement('canvas')
        c.width = c.height = 64
        const x = c.getContext('2d')
        const g = x.createRadialGradient(32, 32, 0, 32, 32, 32)
        g.addColorStop(0, 'rgba(255,255,255,1)')
        g.addColorStop(0.35, 'rgba(255,255,255,0.75)')
        g.addColorStop(1, 'rgba(255,255,255,0)')
        x.fillStyle = g
        x.fillRect(0, 0, 64, 64)
        const t = new this.THREE.CanvasTexture(c)
        t.colorSpace = this.THREE.SRGBColorSpace
        return t
    }

    _alloc() {
        for (let n = 0; n < POOL; n++) {
            const i = (this.head + n) % POOL
            if (!this.kind[i]) { this.head = (i + 1) % POOL; return i }
        }
        return -1                                // 池滿了就這一顆不放
    }

    /** 從某座城市射一發 */
    _launch(site) {
        const i = this._alloc()
        if (i < 0) return
        const up = site.dir
        // 落點在市中心附近散開一點,才不會每次都從同一個點上去
        const a = Math.random() * Math.PI * 2
        const e = this._u.set(0, 1, 0).cross(up).normalize()
        const n = this._v.copy(up).cross(e).normalize()
        const off = e.multiplyScalar(Math.cos(a) * Math.random() * 2.2)
            .addScaledVector(n, Math.sin(a) * Math.random() * 2.2)
        const base = up.clone().multiplyScalar(this.R + 0.6).add(off)

        this.pos[i * 3] = base.x; this.pos[i * 3 + 1] = base.y; this.pos[i * 3 + 2] = base.z
        // 初速取「剛好在頂點停住」:v = sqrt(2gh)
        const v0 = Math.sqrt(2 * GRAV * RISE) * (0.92 + Math.random() * 0.16)
        this.vel[i * 3] = up.x * v0; this.vel[i * 3 + 1] = up.y * v0; this.vel[i * 3 + 2] = up.z * v0
        const c = PALETTE[(Math.random() * PALETTE.length) | 0]
        for (let k = 0; k < 3; k++) {
            this.base[i * 3 + k] = c[k]
            this.col[i * 3 + k] = c[k] * DIM
        }
        this.life[i] = this.full[i] = v0 / GRAV * (0.86 + Math.random() * 0.12)
        this.kind[i] = 1
    }

    /** 火箭到頂:原地炸開成一球火花 */
    _burst(x, y, z, cr, cg, cb) {
        const R2 = this.R
        const up = this._u.set(x, y, z).normalize()
        const spd = 4.2 + Math.random() * 3.0
        const twoTone = Math.random() < 0.45
        const c2 = PALETTE[(Math.random() * PALETTE.length) | 0]
        for (let k = 0; k < BURST; k++) {
            const i = this._alloc()
            if (i < 0) return
            // 球面均勻取向,再往上偏一點點,看起來比較像從高處綻開
            const u = Math.random() * 2 - 1
            const t = Math.random() * Math.PI * 2
            const s = Math.sqrt(1 - u * u)
            const dx = s * Math.cos(t), dy = u, dz = s * Math.sin(t)
            const m = spd * (0.55 + Math.random() * 0.45)
            this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z
            this.vel[i * 3] = dx * m + up.x * 0.6
            this.vel[i * 3 + 1] = dy * m + up.y * 0.6
            this.vel[i * 3 + 2] = dz * m + up.z * 0.6
            const c = (twoTone && k % 2) ? c2 : [cr, cg, cb]
            for (let q = 0; q < 3; q++) {
                this.base[i * 3 + q] = c[q]
                this.col[i * 3 + q] = c[q] * DIM
            }
            this.life[i] = this.full[i] = 1.5 + Math.random() * 1.1
            this.kind[i] = 2
        }
    }

    /**
     * @param night 0~1,1 是全黑。白天完全不放
     */
    update(dt, night) {
        const alive = night > 0.55
        this.cool -= dt
        if (alive && this.cool <= 0) {
            // 越黑放越密;一次可能連放兩三發(同一座城的連發)
            this.cool = 0.5 + Math.random() * 2.2 * (1.4 - night)
            const site = this.sites[(Math.random() * this.sites.length) | 0]
            const n = 1 + ((Math.random() * 3) | 0)
            for (let k = 0; k < n; k++) this._launch(site)
        }

        let any = false
        for (let i = 0; i < POOL; i++) {
            if (!this.kind[i]) continue
            any = true
            const p = i * 3
            this.life[i] -= dt
            if (this.life[i] <= 0) {
                if (this.kind[i] === 1) {
                    this._burst(this.pos[p], this.pos[p + 1], this.pos[p + 2],
                                this.base[p], this.base[p + 1], this.base[p + 2])
                }
                this.kind[i] = 0
                this.pos[p + 1] = -1e6           // 挪到看不見的地方
                continue
            }
            // 重力:方向是「粒子指向星球中心」,球面世界裡每顆都不一樣
            const x = this.pos[p], y = this.pos[p + 1], z = this.pos[p + 2]
            const r = Math.hypot(x, y, z) || 1
            const g = GRAV * dt / r
            this.vel[p] -= x * g
            this.vel[p + 1] -= y * g
            this.vel[p + 2] -= z * g
            if (this.kind[i] === 2) {             // 火花有空氣阻力,尾巴才會收
                const k = 1 - 0.85 * dt
                this.vel[p] *= k; this.vel[p + 1] *= k; this.vel[p + 2] *= k
            }
            this.pos[p] += this.vel[p] * dt
            this.pos[p + 1] += this.vel[p + 1] * dt
            this.pos[p + 2] += this.vel[p + 2] * dt
            // 依剩餘壽命淡出。第一版沒做這件事,火花會一直全亮到消失那一幀
            const f = this.life[i] / this.full[i]
            const k2 = DIM * f * f
            this.col[p] = this.base[p] * k2
            this.col[p + 1] = this.base[p + 1] * k2
            this.col[p + 2] = this.base[p + 2] * k2
        }

        this.points.visible = any && night > 0.3
        if (any) {
            this.geo.attributes.position.needsUpdate = true
            this.geo.attributes.color.needsUpdate = true
        }
        // 天沒全黑就整體壓暗,黃昏才不會突兀
        this.mat.opacity = Math.min(1, Math.max(0, (night - 0.3) / 0.35))
    }
}
