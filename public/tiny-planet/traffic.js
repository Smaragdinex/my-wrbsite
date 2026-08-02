/**
 * 空中交通:其他小飛機在星球上空各自巡航。
 *
 * 每架都複製玩家的機身模型、隨機換上馬卡龍配色,沿著球面自己轉彎、爬升、
 * 壓坡度。飛太遠(超出地平線很多)就重新配置到玩家附近的視野之外,
 * 這樣天上永遠有同伴,又不會看到憑空出現。
 */

const SHOOT_R = 58        // AI 進到這個距離、而且玩家大致在前方就開火
const SHOOT_AIM = 0.86    // 玩家要落在機頭前方這個餘弦角內
const PAINT_SPEED = 46    // 與 paint.js 一致,用來算提前量
const LOOK_R = 90         // 超過這個距離的直接跳過,省得算
const LOOKAHEAD = 4.5     // 往前預測幾秒;對衝相對速度可達 34/秒,要提早這麼久才來得及
const SAFE = 11           // 預計錯身距離小於這個就要修正
const AVOID_TURN = 1.1    // 閃避時最多額外壓多少舵(rad/s,玩家是 1.6)
const AVOID_CLIMB = 4.5   // 閃避時最多爬升/下降多快(單位/s)

export class Traffic {
    /**
     * @param protoScene 玩家機身的 GLTF scene(會被複製)
     * @param palette    可用的機身顏色(十六進位字串)
     */
    constructor(THREE, scene, protoScene, {
        count = 10, R = 280.8, altMin = 6.5, altMax = 20, palette = ['#f2a0a8'],
        onShoot = null,          // (plane, 發射點, 方向, 顏色) => void
    } = {}) {
        this.onShoot = onShoot
        this.THREE = THREE
        this.scene = scene
        this.R = R
        this.altMin = altMin
        this.altMax = altMax
        this.planes = []
        // 閃避運算用的暫存,避免每幀配置
        this._d = new THREE.Vector3()
        this._right = new THREE.Vector3()
        this._v1 = new THREE.Vector3()
        this._v2 = new THREE.Vector3()
        this._v3 = new THREE.Vector3()
        this._playerVel = new THREE.Vector3()
        this._prevPlayer = null

        // 地平線距離:飛在 R+8.5 時約 41 單位,重生要放在這之外才不會被看到憑空出現
        this.horizon = Math.sqrt((R + 8.5) ** 2 - R ** 2)

        for (let i = 0; i < count; i++) {
            const obj = protoScene.clone(true)
            const bodyMats = []
            const glowMats = []
            obj.traverse(o => {
                if (!o.isMesh) return
                o.material = o.material.clone()          // 每架要能獨立換色
                if (o.material.emissive) {
                    o.material.emissive = o.material.color.clone()
                    o.material.emissiveIntensity = 0.38
                    glowMats.push(o.material)
                }
                if (o.material.name && o.material.name.includes('PlaneRed')) bodyMats.push(o.material)
            })
            const hex = palette[Math.floor(Math.random() * palette.length)]
            for (const m of bodyMats) {
                m.color.set(hex)
                m.emissive.copy(m.color)
            }

            const rig = new THREE.Group()                // 位置 + 航向
            const tilt = new THREE.Group()               // 壓坡度
            const inner = new THREE.Group()
            inner.rotation.y = Math.PI                   // 機頭朝 rig 的 +Z
            inner.add(obj)
            tilt.add(inner)
            rig.add(tilt)
            scene.add(rig)

            this.planes.push({
                rig, tilt, bodyMats, glowMats,
                propeller: obj.getObjectByName('Propeller'),
                dir: new THREE.Vector3(),
                fwd: new THREE.Vector3(),
                alt: 0,
                speed: 0,
                turn: 0,
                turnTimer: 0,
                bank: 0,
                scale: 0.8 + Math.random() * 0.5,
                dodgeUp: i % 2 ? 1 : -1,   // 同高度對衝時固定往上/往下讓,才不會兩架一起爬
                color: hex,
                shootTimer: 2 + Math.random() * 5,
                splash: 0,                 // 被漆彈打中後的殘留時間
                baseColors: bodyMats.map(m => m.color.clone()),
            })
            obj.scale.setScalar(this.planes[i].scale)
        }
    }

    /**
     * 隨機安置一架。
     * @param near true = 放在視野內(開場用),否則放在地平線外(重生用,才不會憑空出現)
     */
    _place(p, aroundDir, near = false) {
        const { THREE } = this
        const arc = near
            ? 10 + Math.random() * 26                                  // 看得到
            : this.horizon * 1.5 + Math.random() * this.horizon * 1.8  // 地平線外
        const dir = aroundDir ? this._offsetDir(aroundDir, arc) : new THREE.Vector3().randomDirection()
        p.dir.copy(dir)
        p.alt = this.R + this.altMin + Math.random() * (this.altMax - this.altMin)
        // 任意切線方向當航向
        const tmp = new THREE.Vector3(0, 1, 0)
        if (Math.abs(p.dir.dot(tmp)) > 0.95) tmp.set(1, 0, 0)
        p.fwd.crossVectors(p.dir, tmp).normalize()
        p.speed = 8 + Math.random() * 9
        p.turn = (Math.random() - 0.5) * 0.25
        p.turnTimer = 3 + Math.random() * 8
        p.bank = 0
        p.shootTimer = 2 + Math.random() * 5
        this._sync(p)                            // 立刻就位,不要有一幀停在球心
    }

    /** 把球面狀態寫進場景的 transform */
    _sync(p) {
        const world = p.dir.clone().multiplyScalar(p.alt)
        p.rig.position.copy(world)
        p.rig.up.copy(p.dir)
        p.rig.lookAt(world.clone().addScaledVector(p.fwd, 4))
        p.tilt.rotation.z = p.bank
    }

    /** 從某方向沿球面移動指定弧長,得到新的方向 */
    _offsetDir(dir, arc) {
        const { THREE } = this
        const tmp = new THREE.Vector3(0, 1, 0)
        if (Math.abs(dir.dot(tmp)) > 0.95) tmp.set(1, 0, 0)
        const t = new THREE.Vector3().crossVectors(dir, tmp).normalize()
            .applyAxisAngle(dir, Math.random() * Math.PI * 2)
        const a = arc / this.R
        return dir.clone().multiplyScalar(Math.cos(a)).addScaledVector(t, Math.sin(a)).normalize()
    }

    /** 玩家起飛後呼叫一次:前幾架就放在視野內,其餘散佈在地平線外 */
    spawnAround(playerDir) {
        this.planes.forEach((p, i) => this._place(p, playerDir, i < 4))
    }

    /**
     * 預測式閃避:用相對速度算出「最接近時刻」(TCA)和那時會錯身多遠,
     * 快要撞上才提早壓舵、順便錯開高度。單純看當下距離來不及 —— 對衝時
     * 兩機每秒逼近 30 幾單位,等進到十幾單位才反應已經來不及轉開。
     * 回傳 { steer, climb },都是 -1~1 的強度。
     */
    _avoid(p, playerPos, playerVel) {
        const { THREE, planes } = this
        const world = p.rig.position                                  // 上一幀的位置就夠準
        const right = this._right.crossVectors(p.fwd, p.dir)          // 機身右側 = fwd × up
        const myVel = this._v1.copy(p.fwd).multiplyScalar(p.speed)
        let steer = 0, climb = 0

        for (let k = 0; k <= planes.length; k++) {
            const isPlayer = k === planes.length
            const o = isPlayer ? null : planes[k]
            if (o === p) continue

            const rp = this._d.subVectors(isPlayer ? playerPos : o.rig.position, world)
            if (rp.lengthSq() > LOOK_R * LOOK_R) continue

            const rv = this._v2
            if (isPlayer) rv.copy(playerVel)
            else rv.copy(o.fwd).multiplyScalar(o.speed)
            rv.sub(myVel)

            const rvSq = rv.lengthSq()
            if (rvSq < 1e-6) continue
            const tca = -rp.dot(rv) / rvSq
            if (tca < 0 || tca > LOOKAHEAD) continue                  // 正在遠離,或還太遙遠

            const cpa = this._v3.copy(rp).addScaledVector(rv, tca)    // 最接近時對方在我的哪一側
            const miss = cpa.length()
            if (miss > SAFE) continue                                 // 本來就會錯開,不用管

            const w = (1 - tca / LOOKAHEAD) * (1 - miss / SAFE)       // 越急、錯得越險,反應越強
            const lat = cpa.dot(right)
            // 正對衝(橫向幾乎沒錯開)一律往右閃 —— 跟真實航空的會遇規則一樣,兩機左舷對左舷錯開
            steer += (Math.abs(lat) < 1 ? -1 : Math.sign(lat)) * w
            const vert = cpa.dot(p.dir)
            climb -= (Math.abs(vert) < 0.5 ? p.dodgeUp : Math.sign(vert)) * w
        }
        return {
            steer: THREE.MathUtils.clamp(steer, -1, 1),
            climb: THREE.MathUtils.clamp(climb, -1, 1),
        }
    }

    /** 被漆彈打中:機身沾色,6 秒後褪回原本的馬卡龍色 */
    splash(plane, color) {
        if (!plane.splashColor) plane.splashColor = new this.THREE.Color()
        plane.splashColor.set(color)
        plane.splash = 6
    }

    /** @param nightF 0=白天 1=夜晚,機身內光跟著亮起(與玩家同一套) */
    update(dt, playerPos, nightF = 0) {
        const { THREE } = this
        const playerDir = playerPos.clone().normalize()

        // 玩家的速度要自己從位移推,閃避預測需要它
        if (!this._prevPlayer) this._prevPlayer = playerPos.clone()
        const playerVel = this._playerVel.subVectors(playerPos, this._prevPlayer)
            .divideScalar(Math.max(dt, 1e-4))
        this._prevPlayer.copy(playerPos)

        for (const p of this.planes) {
            if (p.alt === 0) this._place(p, playerDir)

            // 每隔一段時間換個轉彎方向,航線才不會呆板
            p.turnTimer -= dt
            if (p.turnTimer <= 0) {
                p.turn = (Math.random() - 0.5) * 0.5
                p.turnTimer = 4 + Math.random() * 9
            }

            const { steer, climb } = this._avoid(p, playerPos, playerVel)
            const turn = p.turn + steer * AVOID_TURN                  // 閃避壓過原本的巡航轉彎
            p.alt = THREE.MathUtils.clamp(p.alt + climb * AVOID_CLIMB * dt,
                this.R + this.altMin, this.R + this.altMax)

            p.fwd.applyAxisAngle(p.dir, turn * dt)

            // 沿球面前進,再把位置投影回自己的飛行高度
            const pos = p.dir.clone().multiplyScalar(p.alt).addScaledVector(p.fwd, p.speed * dt)
            p.dir.copy(pos).normalize()
            p.fwd.addScaledVector(p.dir, -p.fwd.dot(p.dir)).normalize()

            // 轉彎時壓坡度(與玩家同一套視覺語言);閃避時看得出來是在急轉
            p.bank += (-turn * 2.2 - p.bank) * Math.min(1, dt * 3)
            this._sync(p)
            if (p.propeller) p.propeller.rotation.z += dt * 22
            for (const m of p.glowMats) m.emissiveIntensity = 0.18 + 0.42 * nightF

            // 中彈後機身沾上對方的顏色,再慢慢褪回原色
            if (p.splash > 0) {
                p.splash -= dt
                const k = Math.max(0, p.splash / 6)
                p.bodyMats.forEach((m, bi) => {
                    m.color.copy(p.splashColor).lerp(p.baseColors[bi], 1 - k)
                    m.emissive.copy(m.color)
                })
            }

            // 開火:玩家夠近、又大致在機頭前方才射,並算一點提前量
            p.shootTimer -= dt
            if (this.onShoot && p.shootTimer <= 0) {
                const toP = this._v3.subVectors(playerPos, p.rig.position)
                const dist = toP.length()
                if (dist < SHOOT_R && toP.clone().normalize().dot(p.fwd) > SHOOT_AIM) {
                    // 提前量:漆彈飛過去要時間,朝玩家「等一下會在的地方」射
                    // 提前量要夾住:玩家若因為某些原因瞬移,速度會爆掉把瞄準帶到外太空
                    const lead = this._v1.copy(playerVel).clampLength(0, 30)
                        .multiplyScalar(dist / PAINT_SPEED)
                    const aim = toP.add(lead).normalize()
                    aim.x += (Math.random() - 0.5) * 0.06      // 一點誤差,不然百發百中很煩
                    aim.y += (Math.random() - 0.5) * 0.06
                    aim.z += (Math.random() - 0.5) * 0.06
                    this.onShoot(p, p.rig.position.clone().addScaledVector(p.fwd, 1.6),
                                 aim.normalize(), p.color)
                    p.shootTimer = 2.5 + Math.random() * 4
                } else {
                    p.shootTimer = 0.6            // 沒對準就過一下再看
                }
            }

            // 飛出視野很遠就換到玩家附近的地平線外重生
            const arc = Math.acos(THREE.MathUtils.clamp(p.dir.dot(playerDir), -1, 1)) * this.R
            if (arc > this.horizon * 4.5) this._place(p, playerDir)
        }
    }
}
