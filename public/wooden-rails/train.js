// 木頭小火車:車輛外型 + 沿軌道前進 + 脫軌後摔在墊子上。
//
// 造型照實物玩具做:圓桶鍋爐、拱形車頂、開窗的車廂、外露的大圓輪加軸釘。
// 全部是程式生成的基本形狀 —— 這種造型本來就是車床加方料車出來的,
// 換成 GLB 只會多幾百 KB 的下載,換不到辨識度。
import * as THREE from 'three'
import { Path } from './track.js?v=61'
import { painted, C } from './wood.js?v=61'

const SWALLOW = 0.04     // 車身尾端越過門多少就消失
const AXLE = 0.175              // 輪軸高度:輪子下緣剛好陷進軌道凹槽
const WHEEL_X = 0.145           // 輪距,略小於軌道半寬,輪子看得見才有玩具味

const M = {
    red:    painted(C.red,    { rx: 2, ry: 2 }),
    blue:   painted(C.blue,   { rx: 2, ry: 2 }),
    green:  painted(C.green,  { rx: 2, ry: 2 }),
    yellow: painted(C.yellow, { rx: 2, ry: 2 }),
    pale:   painted(C.pale,   { rx: 3, ry: 3 }),
    hub:    new THREE.MeshStandardMaterial({ color: C.hub, roughness: 0.55 }),
    dark:   new THREE.MeshStandardMaterial({ color: 0x3d2e22, roughness: 0.95 }),
}

const put = (mesh, x, y, z) => { mesh.position.set(x, y, z); mesh.castShadow = true; return mesh }
const box = (w, h, d, mat) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat)

/** 沿 Z 躺著的圓柱(鍋爐);r2 不同就是錐形 */
function tube(r, len, mat, seg = 20, r2 = r) {
    const g = new THREE.CylinderGeometry(r, r2, len, seg)
    g.rotateX(Math.PI / 2)
    return new THREE.Mesh(g, mat)
}

/**
 * 拱形車頂:內外兩條圓弧圍成的帶狀斷面,沿車長擠出。
 * 實物的車頂就是一塊彎木片,用方塊做會立刻失去那個味道。
 */
export function barrelRoof(width, len, thick, mat) {
    const R = width * 0.78
    const a = Math.asin(Math.min(1, width / 2 / R))
    const sh = new THREE.Shape()
    sh.absarc(0, 0, R, Math.PI / 2 - a, Math.PI / 2 + a, false)
    sh.absarc(0, 0, R - thick, Math.PI / 2 + a, Math.PI / 2 - a, true)
    const g = new THREE.ExtrudeGeometry(sh, { depth: len, bevelEnabled: false, curveSegments: 20 })
    g.translate(0, -R * Math.cos(a), -len / 2)      // 弧底落在 y=0,長度置中
    const m = new THREE.Mesh(g, mat)
    m.castShadow = true
    return m
}

/** 一組輪子:大圓盤 + 突出的軸釘。這對「像不像木頭玩具」的貢獻比車身還大 */
function wheels(group, zs, mat, r = 0.10) {
    const wg = new THREE.CylinderGeometry(r, r, 0.045, 22)
    wg.rotateZ(Math.PI / 2)
    const hg = new THREE.CylinderGeometry(0.028, 0.028, 0.055, 12)
    hg.rotateZ(Math.PI / 2)
    for (const z of zs) for (const s of [-1, 1]) {
        group.add(put(new THREE.Mesh(wg, mat), s * WHEEL_X, AXLE, z))
        group.add(put(new THREE.Mesh(hg, M.hub), s * (WHEEL_X + 0.026), AXLE, z))
    }
}

/** 車體外框:下半實心 + 四根角柱 + 上緣橫樑,中間空出來的就是窗 */
function cabin(w, h, d, mat, mullions = 0) {
    const g = new THREE.Group()
    const sill = h * 0.34, post = 0.035
    g.add(put(box(w, sill, d, mat), 0, sill / 2, 0))                     // 窗台以下
    g.add(put(box(w, h * 0.14, d, mat), 0, h - h * 0.07, 0))             // 上緣橫樑
    for (const sx of [-1, 1]) for (const sz of [-1, 1])                  // 角柱
        g.add(put(box(post, h, post, mat), sx * (w / 2 - post / 2), h / 2, sz * (d / 2 - post / 2)))
    for (let i = 1; i <= mullions; i++) {                                // 窗框直櫺
        const z = -d / 2 + (d * i) / (mullions + 1)
        for (const sx of [-1, 1])
            g.add(put(box(post * 0.8, h, post * 0.8, mat), sx * (w / 2 - post / 2), h / 2, z))
    }
    // 窗內的暗面。少了它,從側面會直接看穿到墊子,窗就不成立
    g.add(put(box(w - post * 2.4, h * 0.52, d - post * 2.4, M.dark), 0, sill + h * 0.26, 0))
    return g
}

/** 車頭。+Z 是車頭朝向 */
function locomotive() {
    const g = new THREE.Group()
    const deck = 0.235                                    // 底板上緣
    g.add(put(box(0.30, 0.06, 0.66, M.red), 0, deck - 0.03, 0))

    g.add(put(tube(0.118, 0.36, M.red, 24), 0, deck + 0.125, 0.17))         // 鍋爐
    g.add(put(tube(0.132, 0.035, M.red, 24), 0, deck + 0.125, 0.345))       // 煙箱前緣凸邊
    const dome = new THREE.Mesh(
        new THREE.SphereGeometry(0.052, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), M.red)
    g.add(put(dome, 0, deck + 0.238, 0.10))
    // 煙囪上寬下窄 —— 實物就是這個喇叭形,做成直筒馬上變成工廠煙囪
    g.add(put(new THREE.Mesh(new THREE.CylinderGeometry(0.062, 0.038, 0.145, 16), M.red),
        0, deck + 0.30, 0.285))

    const cabW = 0.27, cabH = 0.20, cabD = 0.24
    const cab = cabin(cabW, cabH, cabD, M.red)
    cab.position.set(0, deck, -0.17)
    g.add(cab)
    g.add(put(barrelRoof(cabW + 0.07, cabD + 0.07, 0.03, M.red), 0, deck + cabH, -0.17))

    wheels(g, [-0.20, 0.13], M.yellow, 0.10)     // 大黃輪是這台車最搶眼的地方
    return g
}

/** 客車廂:藍車身 + 綠底盤,側面三個窗 */
function coach() {
    const g = new THREE.Group()
    const deck = 0.225
    g.add(put(box(0.30, 0.055, 0.62, M.green), 0, deck - 0.028, 0))
    const w = 0.27, h = 0.21, d = 0.52
    const body = cabin(w, h, d, M.blue, 2)
    body.position.set(0, deck, 0)
    g.add(body)
    g.add(put(barrelRoof(w + 0.07, d + 0.07, 0.03, M.blue), 0, deck + h, 0))
    wheels(g, [-0.19, 0.19], M.green, 0.085)
    return g
}

/** 敞車:四面矮牆的木箱。乘客站在裡面,看得見才有意義 */
function wagon() {
    const g = new THREE.Group()
    const deck = 0.225
    g.add(put(box(0.30, 0.055, 0.58, M.green), 0, deck - 0.028, 0))
    const w = 0.28, d = 0.50, wall = 0.028, hh = 0.135
    g.add(put(box(w, 0.03, d, M.pale), 0, deck + 0.015, 0))
    for (const sz of [-1, 1]) g.add(put(box(w, hh, wall, M.pale), 0, deck + hh / 2, sz * (d / 2)))
    for (const sx of [-1, 1]) g.add(put(box(wall, hh, d, M.pale), sx * (w / 2), deck + hh / 2, 0))
    wheels(g, [-0.17, 0.17], M.green, 0.085)
    g.userData.seatsAll = [[-0.062, 0.11], [0.062, 0.11], [-0.062, -0.09], [0.062, -0.09]]
    g.userData.seats = [...g.userData.seatsAll]
    g.userData.floorY = deck + 0.03
    return g
}

/** 木頭釘子人:圓球頭 + 圓錐身 */
export function pegPerson(color) {
    const g = new THREE.Group()
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.05, 0.105, 12),
        painted(color, { rx: 2, ry: 2 }))
    body.position.y = 0.053
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.04, 14, 10),
        painted(0xe8c49c, { rx: 2, ry: 2 }))
    head.position.y = 0.145
    body.castShadow = head.castShadow = true
    g.add(body, head)
    return g
}

export class Train {
    constructor(scene) {
        this.group = new THREE.Group()
        this.cars = [locomotive(), coach(), wagon()]
        for (const c of this.cars) this.group.add(c)
        scene.add(this.group)
        this.gap = 0.74                 // 車鉤間距,配合加長後的車身
        this._p = new THREE.Vector3()
        this._t = new THREE.Vector3()
        this.riders = []
        this.reset(null)
    }

    reset(path, swallow = false) {
        this.path = path
        // swallow:終點是車庫,火車要一路開進去直到最後一節也不見。
        // 脫軌時不能開,那邊的路徑盡頭是斷掉的軌道,不是屋子
        this.swallow = swallow
        this.s = 0
        this.speed = 0
        this.state = path ? 'idle' : 'hidden'
        this.fall = null
        this.group.visible = !!path
        for (const c of this.cars) { c.rotation.set(0, 0, 0); c.scale.setScalar(1) }
        for (const r of this.riders) r.parent?.remove(r)
        this.riders = []
        // 座位在 board() 裡是用 shift() 消耗掉的,重來時要補回去
        for (const c of this.cars) if (c.userData.seatsAll) c.userData.seats = [...c.userData.seatsAll]
        if (path) this._place()
    }

    start() { if (this.state === 'idle') this.state = 'run' }

    /** 讓乘客上車:塞進敞車的空位,之後跟著車廂一起動 */
    board(peg) {
        for (const car of this.cars) {
            const seats = car.userData.seats
            if (!seats || !seats.length) continue
            const [x, z] = seats.shift()
            peg.parent?.remove(peg)
            peg.position.set(x, car.userData.floorY, z)
            peg.rotation.y = 0
            car.add(peg)
            this.riders.push(peg)
            return true
        }
        return false
    }

    /** 取位置。超過軌道盡頭就沿著最後的切線往前外推 —— 車庫裡沒有軌道 */
    _at(s, p, t) {
        const L = this.path.length
        this.path.at(Math.min(s, L), p, t)
        if (s > L) p.addScaledVector(t, s - L)
    }

    _place() {
        for (let i = 0; i < this.cars.length; i++) {
            const s = this.s - i * this.gap
            const car = this.cars[i]
            if (s < 0) { car.visible = false; continue }   // 還沒出站的車廂先藏著
            // 整節車身都過了門就藏起來。車庫只有 0.6 深、整列車 2.1 長,
            // 「開進門後消失」才做得出整列開進去的感覺
            if (this.swallow && s > this.path.length + SWALLOW) { car.visible = false; continue }
            car.visible = true
            this._at(s, this._p, this._t)
            car.position.copy(this._p)
            car.lookAt(this._p.clone().add(this._t))
        }
    }

    update(dt) {
        if (this.state === 'run') {
            const past = this.s > this.path.length
            // 進了車庫就放慢,一節一節開進去才看得清楚
            this.speed = past ? Math.max(0.75, this.speed - dt * 2.2)
                              : Math.min(1.9, this.speed + dt * 2.2)
            this.s += this.speed * dt
            if (!this.swallow && this.s >= this.path.length) {
                this.s = this.path.length
                this.state = 'end'                          // 脫軌:由外面決定怎麼飛出去
            } else if (this.swallow &&
                       this.s - (this.cars.length - 1) * this.gap > this.path.length + SWALLOW) {
                this.state = 'end'                          // 最後一節也進車庫了
            }
            this._place()
        } else if (this.state === 'fall') {
            const f = this.fall
            f.v.y -= 9.8 * dt
            let allDown = true
            for (const car of this.cars) {
                if (!car.visible) continue
                car.position.addScaledVector(f.v, dt)
                car.rotation.x += f.spin * dt
                car.rotation.z += f.spin * 0.6 * dt
                if (car.position.y > 0.1) allDown = false
                else car.position.y = 0.1                     // 躺在墊子上,不要掉到桌子底下
            }
            if (allDown) { f.v.set(0, 0, 0); f.spin *= 0.82 }  // 落地後翻滾慢慢停
        }
    }

    /** 脫軌:整列車帶著當下的速度飛出去 */
    derail() {
        this.path.at(this.path.length, this._p, this._t)
        this.state = 'fall'
        this.fall = { v: this._t.clone().multiplyScalar(this.speed).setY(1.1), spin: 3.4 }
    }

    /** 進站:輕輕停下 */
    arrive() { this.state = 'done'; this.speed = 0 }
}
