/**
 * 空中交通:其他小飛機在星球上空各自巡航。
 *
 * 每架都複製玩家的機身模型、隨機換上馬卡龍配色,沿著球面自己轉彎、爬升、
 * 壓坡度。飛太遠(超出地平線很多)就重新配置到玩家附近的視野之外,
 * 這樣天上永遠有同伴,又不會看到憑空出現。
 */

export class Traffic {
    /**
     * @param protoScene 玩家機身的 GLTF scene(會被複製)
     * @param palette    可用的機身顏色(十六進位字串)
     */
    constructor(THREE, scene, protoScene, {
        count = 10, R = 93.6, altMin = 6.5, altMax = 20, palette = ['#f2a0a8'],
    } = {}) {
        this.THREE = THREE
        this.scene = scene
        this.R = R
        this.altMin = altMin
        this.altMax = altMax
        this.planes = []

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

    /** @param nightF 0=白天 1=夜晚,機身內光跟著亮起(與玩家同一套) */
    update(dt, playerPos, nightF = 0) {
        const { THREE } = this
        const playerDir = playerPos.clone().normalize()

        for (const p of this.planes) {
            if (p.alt === 0) this._place(p, playerDir)

            // 每隔一段時間換個轉彎方向,航線才不會呆板
            p.turnTimer -= dt
            if (p.turnTimer <= 0) {
                p.turn = (Math.random() - 0.5) * 0.5
                p.turnTimer = 4 + Math.random() * 9
            }

            p.fwd.applyAxisAngle(p.dir, p.turn * dt)

            // 沿球面前進,再把位置投影回自己的飛行高度
            const pos = p.dir.clone().multiplyScalar(p.alt).addScaledVector(p.fwd, p.speed * dt)
            p.dir.copy(pos).normalize()
            p.fwd.addScaledVector(p.dir, -p.fwd.dot(p.dir)).normalize()

            // 轉彎時壓坡度(與玩家同一套視覺語言)
            p.bank += (-p.turn * 2.2 - p.bank) * Math.min(1, dt * 3)
            this._sync(p)
            if (p.propeller) p.propeller.rotation.z += dt * 22
            for (const m of p.glowMats) m.emissiveIntensity = 0.18 + 0.42 * nightF

            // 飛出視野很遠就換到玩家附近的地平線外重生
            const arc = Math.acos(THREE.MathUtils.clamp(p.dir.dot(playerDir), -1, 1)) * this.R
            if (arc > this.horizon * 4.5) this._place(p, playerDir)
        }
    }
}
