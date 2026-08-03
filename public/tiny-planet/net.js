/**
 * 同場飛行:把其他真人玩家的飛機畫出來。
 *
 * 沒有帳號、沒有暱稱、不顯示人數 —— 真人就跟 AI 飛機一樣自然地出現在天上。
 * 這也是刻意的:世界本來就有 10 架 AI,多幾架真人不會有「空房間」的問題。
 *
 * 機身沿用 traffic.js 那套(同一個 GLTF、同樣的 rig/tilt 結構),遠端玩家
 * 只是位置改成從網路來。收到的座標一律用插值逼近,直接指派會一格一格跳。
 */

const SEND_MS = 90            // 送出自己的狀態:約 11 Hz。再密也只是浪費頻寬
const LERP = 7.0              // 位置插值速度(每秒逼近比例),越大越跟手也越抖
const GONE_MS = 6000          // 這麼久沒更新就移除
const RETRY_MS = [1000, 2000, 5000, 10000, 20000]   // 斷線重連的退避

export class Net {
    /**
     * @param protoScene 玩家機身的 GLTF scene(會被複製,跟 traffic.js 同一份)
     * @param getState   () => ({ pos: Vector3, quat: Quaternion, color: string })
     */
    constructor(THREE, scene, protoScene, url, getState) {
        this.THREE = THREE
        this.scene = scene
        this.proto = protoScene
        this.url = url
        this.getState = getState
        this.peers = new Map()        // id -> { rig, bodyMats, target, quat, seen }
        this.selfId = null
        this.ws = null
        this.retry = 0
        this.acc = 0
        this._v = new THREE.Vector3()
        this._q = new THREE.Quaternion()
        if (url) this._connect()
    }

    _connect() {
        let ws
        try { ws = new WebSocket(this.url) } catch { return this._scheduleRetry() }
        this.ws = ws
        ws.addEventListener('open', () => { this.retry = 0 })
        ws.addEventListener('message', ev => {
            let m
            try { m = JSON.parse(ev.data) } catch { return }
            if (m.t === 'hi') this.selfId = m.id
            else if (m.t === 'bye') this._remove(m.id)
            else if (m.t === 'w') this._world(m.a)
        })
        // 兩種收場都要重連:伺服器重啟、網路切換、分頁休眠醒來都會走到這裡
        ws.addEventListener('close', () => this._scheduleRetry())
        ws.addEventListener('error', () => { try { ws.close() } catch {} })
    }

    _scheduleRetry() {
        this.ws = null
        const wait = RETRY_MS[Math.min(this.retry++, RETRY_MS.length - 1)]
        setTimeout(() => this._connect(), wait)
    }

    /** 建一架遠端飛機。結構要跟 traffic.js 一致,才會有一樣的朝向行為 */
    _spawn(id, color) {
        const { THREE } = this
        const obj = this.proto.clone(true)
        const bodyMats = []
        obj.traverse(o => {
            if (!o.isMesh) return
            o.material = o.material.clone()
            if (o.material.emissive) {
                o.material.emissive = o.material.color.clone()
                o.material.emissiveIntensity = 0.38
            }
            if (o.material.name && o.material.name.includes('PlaneRed')) bodyMats.push(o.material)
        })
        for (const m of bodyMats) { m.color.set(color); m.emissive.copy(m.color) }

        const rig = new THREE.Group()
        const inner = new THREE.Group()
        inner.rotation.y = Math.PI              // 機頭朝 rig 的 +Z,跟 traffic.js 同一個約定
        inner.add(obj)
        rig.add(inner)
        rig.visible = false                     // 等收到第一筆座標再顯示,免得閃一下球心
        this.scene.add(rig)

        const p = { rig, bodyMats, color,
            target: new THREE.Vector3(), quat: new THREE.Quaternion(), seen: performance.now() }
        this.peers.set(id, p)
        return p
    }

    _remove(id) {
        const p = this.peers.get(id)
        if (!p) return
        this.scene.remove(p.rig)
        p.rig.traverse(o => { if (o.isMesh) { o.geometry?.dispose?.(); o.material?.dispose?.() } })
        this.peers.delete(id)
    }

    _world(list) {
        const now = performance.now()
        for (const o of list) {
            if (o.id === this.selfId) continue          // 不要把自己畫兩次
            let p = this.peers.get(o.id)
            if (!p) p = this._spawn(o.id, o.c)
            else if (o.c !== p.color) {                 // 對方中途換了機身顏色
                p.color = o.c
                for (const m of p.bodyMats) { m.color.set(o.c); m.emissive.copy(m.color) }
            }
            p.target.set(o.p[0], o.p[1], o.p[2])
            p.quat.set(o.q[0], o.q[1], o.q[2], o.q[3])
            if (!p.rig.visible) { p.rig.position.copy(p.target); p.rig.quaternion.copy(p.quat); p.rig.visible = true }
            p.seen = now
        }
    }

    update(dt) {
        // ---- 送出自己 ----
        this.acc += dt * 1000
        if (this.acc >= SEND_MS) {
            this.acc = 0
            if (this.ws && this.ws.readyState === 1) {
                const s = this.getState()
                if (s) this.ws.send(JSON.stringify({
                    t: 's',
                    p: [+s.pos.x.toFixed(2), +s.pos.y.toFixed(2), +s.pos.z.toFixed(2)],
                    q: [+s.quat.x.toFixed(4), +s.quat.y.toFixed(4), +s.quat.z.toFixed(4), +s.quat.w.toFixed(4)],
                    c: s.color,
                }))
            }
        }
        // ---- 別人:插值逼近,不要直接指派 ----
        const k = 1 - Math.exp(-LERP * dt)      // 跟畫格率無關的指數逼近
        const now = performance.now()
        for (const [id, p] of this.peers) {
            if (now - p.seen > GONE_MS) { this._remove(id); continue }
            p.rig.position.lerp(p.target, k)
            p.rig.quaternion.slerp(p.quat, k)
        }
    }
}
