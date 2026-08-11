// 場景:草地、草叢、樹、牛羊、遠處丘陵、天空漸層。
//
// 全部程式生成,一樣不下載任何檔案。棋盤以外原本是一整片空地,
// 這裡把它變成一片草原 —— 近處草叢與花、中距離樹與動物、遠處丘陵溶進霧裡。
//
// 草叢數量以百計,所以用 InstancedMesh:一份幾何、一次 draw call。
// 每關重建一次(棋盤大小不同,禁區跟著變),重建時舊的幾何要 dispose。
import * as THREE from 'three'
import { painted } from './wood.js?v=42'

// 固定種子的亂數:同一關每次進來的草原長得一樣,不會每次重畫都跳動
function rng(seed) {
    let s = seed | 0
    return () => {
        s = s + 0x6D2B79F5 | 0
        let t = Math.imul(s ^ s >>> 15, 1 | s)
        t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t
        return ((t ^ t >>> 14) >>> 0) / 4294967296
    }
}

const C = {
    grass:  0x7fa65c,
    tuft:   0xa2c86e,
    hill:   0x86a878,
    trunk:  0x9a7448,
    leaf:   0x63a05a,
    fir:    0x3f8552,
    wool:   0xf2ece0,
    hide:   0xf0e6d6,
    dark:   0x4a4038,
}

const mat = (c, flat = true) => new THREE.MeshStandardMaterial({
    color: c, roughness: 0.95, metalness: 0, flatShading: flat })

/** 天空:上藍下淺的直向漸層,當成背景畫布 */
function skyTexture() {
    const c = document.createElement('canvas')
    c.width = 2; c.height = 256
    const g = c.getContext('2d')
    const grd = g.createLinearGradient(0, 0, 0, 256)
    grd.addColorStop(0, '#9fcde8')
    grd.addColorStop(0.62, '#cfe6ef')
    grd.addColorStop(1, '#e8f0ea')
    g.fillStyle = grd
    g.fillRect(0, 0, 2, 256)
    const t = new THREE.CanvasTexture(c)
    t.colorSpace = THREE.SRGBColorSpace
    return t
}

/** 一叢草:三片交錯的細長三角形。用圓錐會變成小尖刺,不像草 */
function tuftGeometry() {
    const pos = [], w = 0.055, h = 0.13
    for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2
        const cx = Math.cos(a), cz = Math.sin(a)
        const lean = 0.035
        pos.push(-cz * w, 0, cx * w,
                  cz * w, 0, -cx * w,
                  cx * lean, h, cz * lean)
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    g.computeVertexNormals()
    return g
}

function sheep() {
    const g = new THREE.Group()
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 7), mat(C.wool))
    body.scale.set(1.35, 1, 1)
    body.position.y = 0.20
    const head = new THREE.Group()
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.062, 8, 6), mat(C.dark))
    skull.scale.set(1, 1.15, 1.35)
    skull.position.set(0.185, 0.215, 0)
    head.add(skull)
    for (const sz of [-1, 1]) {                      // 耳朵
        const ear = new THREE.Mesh(new THREE.SphereGeometry(0.026, 6, 4), mat(C.dark))
        ear.scale.set(0.6, 0.5, 1.4)
        ear.position.set(0.16, 0.255, sz * 0.055)
        head.add(ear)
    }
    g.add(body, head)
    g.userData.head = head
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.015, 0.14, 5), mat(C.dark))
        leg.position.set(sx * 0.085, 0.07, sz * 0.06)
        g.add(leg)
    }
    g.traverse(o => { if (o.isMesh) o.castShadow = true })
    return g
}

function cow() {
    const g = new THREE.Group()
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 7), mat(C.hide))
    body.scale.set(1.5, 1, 1.05)
    body.position.y = 0.27
    g.add(body)
    for (const [sx, sy, sz, r] of [[0.05, 0.10, 0.17, 0.075], [-0.14, 0.02, -0.16, 0.06],
                                   [0.16, -0.02, -0.10, 0.05]]) {
        const spot = new THREE.Mesh(new THREE.SphereGeometry(r, 7, 5), mat(C.dark))
        spot.position.set(sx, 0.27 + sy, sz)
        spot.scale.set(1, 0.7, 0.7)
        g.add(spot)
    }
    const head = new THREE.Group()
    const skull = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.11, 0.10), mat(C.hide))
    skull.position.set(0.30, 0.28, 0)
    const muzzle = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.07, 0.08), mat(0xd8a49a))
    muzzle.position.set(0.375, 0.26, 0)
    head.add(skull, muzzle)
    for (const sz of [-1, 1]) {
        const horn = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.016, 0.05, 5), mat(0xe8dcc4))
        horn.position.set(0.28, 0.35, sz * 0.045)
        head.add(horn)
    }
    g.add(head)
    g.userData.head = head
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.022, 0.20, 5), mat(C.hide))
        leg.position.set(sx * 0.13, 0.10, sz * 0.085)
        g.add(leg)
    }
    g.traverse(o => { if (o.isMesh) o.castShadow = true })
    return g
}

function tree(r, tall) {
    const g = new THREE.Group()
    const trunk = new THREE.Mesh(
        new THREE.CylinderGeometry(r * 0.16, r * 0.2, tall * 0.42, 7), mat(C.trunk))
    trunk.position.y = tall * 0.21
    g.add(trunk)
    if (tall > 1.0) {                                  // 針葉樹:三層錐體
        for (let i = 0; i < 3; i++) {
            const c = new THREE.Mesh(new THREE.ConeGeometry(r * (1 - i * 0.22), tall * 0.4, 8), mat(C.fir))
            c.position.y = tall * (0.42 + i * 0.24)
            g.add(c)
        }
    } else {
        const top = new THREE.Mesh(new THREE.SphereGeometry(r, 9, 7), mat(C.leaf))
        top.position.y = tall * 0.62
        top.scale.set(1, 0.85, 1)
        g.add(top)
    }
    g.traverse(o => { if (o.isMesh) o.castShadow = true })
    return g
}

/**
 * 建一片草原。
 * @param hx,hz 棋盤(含墊子)的半寬半深:這個範圍內什麼都不能放,不然會擋住軌道
 */
export function buildWorld(scene, hx, hz, seed = 1) {
    const rand = rng(seed * 7919 + 13)
    const g = new THREE.Group()

    // 禁區用矩形判斷。用半徑會讓長方形棋盤的短邊塞不下東西、長邊又被吃掉
    const clear = (x, z, pad) => Math.abs(x) > hx + pad || Math.abs(z) > hz + pad
    const spot = (min, max, pad) => {
        for (let i = 0; i < 40; i++) {
            const a = rand() * Math.PI * 2, r = min + rand() * (max - min)
            const x = Math.cos(a) * r, z = Math.sin(a) * r
            if (clear(x, z, pad)) return [x, z]
        }
        return null
    }

    // 草叢:數量以百計,用 InstancedMesh 一次畫完
    const N = 900
    const tufts = new THREE.InstancedMesh(tuftGeometry(), mat(C.tuft), N)
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3()
    let n = 0
    for (let i = 0; i < N; i++) {
        const p = spot(1.0, 26, 0.14)
        if (!p) continue
        q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rand() * 6.283)
        const s = 0.7 + rand() * 0.9
        m4.compose(v.set(p[0], 0, p[1]), q, new THREE.Vector3(s, s * (0.8 + rand() * 0.6), s))
        tufts.setMatrixAt(n++, m4)
    }
    tufts.count = n
    tufts.receiveShadow = true
    g.add(tufts)

    // 小花:兩種顏色的小點,近處才看得到,但少了就很單調
    for (const [col, cnt] of [[0xf6f1e2, 60], [0xe8c85c, 40]]) {
        const fm = new THREE.InstancedMesh(new THREE.SphereGeometry(0.022, 5, 4), mat(col), cnt)
        let k = 0
        for (let i = 0; i < cnt; i++) {
            const p = spot(1.0, 14, 0.2)
            if (!p) continue
            m4.compose(v.set(p[0], 0.03, p[1]), new THREE.Quaternion(), new THREE.Vector3(1, 1, 1))
            fm.setMatrixAt(k++, m4)
        }
        fm.count = k
        g.add(fm)
    }

    // 樹:近的大、遠的小,遠處被霧吃掉一半剛好當背景
    for (let i = 0; i < 34; i++) {
        const p = spot(2.2, 30, 1.2)
        if (!p) continue
        const far = Math.hypot(p[0], p[1]) > 12
        const t = tree(0.32 + rand() * 0.3, rand() < 0.5 ? 0.9 : 1.3)
        t.position.set(p[0], 0, p[1])
        t.rotation.y = rand() * 6.283
        t.scale.setScalar(far ? 1.5 + rand() : 0.9 + rand() * 0.5)
        g.add(t)
    }

    // 牛羊:放在中近距離,太遠就看不出是什麼動物了
    const animals = []
    for (let i = 0; i < 9; i++) {
        const p = spot(2.6, 11, 1.1)
        if (!p) continue
        const a = i % 3 === 0 ? cow() : sheep()
        a.position.set(p[0], 0, p[1])
        a.rotation.y = rand() * 6.283
        a.userData.phase = rand() * 6.283
        g.add(a)
        animals.push(a)
    }

    // 遠處丘陵:壓扁的半球,顏色比草地淡,再交給霧氣把邊界化掉
    for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2 + rand() * 0.4
        const r = 34 + rand() * 14
        const hill = new THREE.Mesh(
            new THREE.SphereGeometry(6 + rand() * 7, 12, 7, 0, Math.PI * 2, 0, Math.PI / 2),
            mat(C.hill))
        hill.scale.set(1.6 + rand(), 0.32 + rand() * 0.25, 1.6 + rand())
        hill.position.set(Math.cos(a) * r, -0.4, Math.sin(a) * r)
        g.add(hill)
    }

    scene.add(g)
    return {
        group: g,
        /** 動物低頭吃草。單純上下擺頭就夠了,靜止不動的動物看起來像模型 */
        update(t) {
            for (const a of animals) {
                const k = Math.sin(t * 0.9 + a.userData.phase)
                a.userData.head.rotation.z = 0.34 + k * 0.30
                a.position.y = Math.max(0, k) * 0.006
            }
        },
        dispose() {
            g.traverse(o => { if (o.isMesh) o.geometry.dispose() })
            scene.remove(g)
        },
    }
}

export { skyTexture }
