// 場景:草地、草叢、樹、牛羊、遠處丘陵、天空漸層。
//
// 全部程式生成,一樣不下載任何檔案。棋盤以外原本是一整片空地,
// 這裡把它變成一片草原 —— 近處草叢與花、中距離樹與動物、遠處丘陵溶進霧裡。
//
// 草叢數量以百計,所以用 InstancedMesh:一份幾何、一次 draw call。
// 每關重建一次(棋盤大小不同,禁區跟著變),重建時舊的幾何要 dispose。
import * as THREE from 'three'
import { painted } from './wood.js?v=88'

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

// 地平線的顏色。天空球在這個高度就是這個色,霧也是這個色 ——
// 兩邊一致,遠處的地面才會無縫溶進天空
export const HORIZON = 0xdceff5

/**
 * 天空球。
 *
 * 原本用 scene.background 貼一張漸層圖,那是螢幕空間的:鏡頭一俯仰,
 * 地平線在畫面上的位置就變了,但背景圖不動,於是「被霧吃到底的遠處地面」
 * 接到的是天空漸層的隨便某一段,遠看就是一條白帶子。
 * 改成世界空間的天空球之後,地平線高度永遠對應漸層的同一個位置。
 */
function skyDome() {
    const m = new THREE.ShaderMaterial({
        side: THREE.BackSide, depthWrite: false, fog: false,
        uniforms: {
            top:  { value: new THREE.Color(0x54a9e0) },   // 晴天:藍要夠深
            horz: { value: new THREE.Color(HORIZON) },
        },
        vertexShader: `
            varying vec3 vP;
            void main() {
                vP = position;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }`,
        fragmentShader: `
            uniform vec3 top; uniform vec3 horz;
            varying vec3 vP;
            void main() {
                float h = normalize(vP).y;
                // 地平線以下也維持地平線色:鏡頭壓低時看到的那一圈才不會突然變色
                gl_FragColor = vec4(mix(horz, top, smoothstep(0.0, 0.26, h)), 1.0);
            }`,
    })
    const dome = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 16), m)
    dome.frustumCulled = false
    return dome
}

/**
 * 河在某個位置的橫向偏移。
 *
 * 棋盤範圍內必須是 0 —— 橋是格子對齊的直片,水也得剛好蓋滿那一格,
 * 一彎就會有半格是乾的、半格溢到隔壁。出了棋盤才慢慢彎起來,
 * 而且離得越遠彎得越大。
 */
export function riverOffset(t, hw) {
    const d = Math.max(0, Math.abs(t) - hw)
    const amp = Math.min(2.8, d * 0.24)
    return amp * (Math.sin(t * 0.19) + 0.5 * Math.sin(t * 0.33 + 1.3))
}

/**
 * 河岸的擾動,回傳 0~1。
 * 幾個不成比例的頻率疊起來,看不出週期。左右岸給不同的相位,
 * 兩邊才不會同進同出 —— 平行的兩條線正是「假河」最明顯的特徵。
 */
export function wob(t, phase) {
    return 0.5 + 0.5 * (0.55 * Math.sin(t * 0.9 + phase)
                      + 0.30 * Math.sin(t * 2.3 - phase * 1.7)
                      + 0.15 * Math.sin(t * 5.1 + phase * 0.6))
}

/**
 * 水面在某一點、某一岸的半寬。
 *
 * 棋盤範圍內的擾動只能「往外長」—— 水必須蓋滿那一格,往內縮就會露出
 * 半格乾地。出了棋盤才放開,而且離得越遠越寬、擺動越大。
 */
export function riverHalf(t, river, right) {
    const d = Math.max(0, Math.abs(t) - river.hw)
    const base = (1.0 + Math.min(1, d / 9) * 0.6) / 2
    const amt = 0.10 + Math.min(1, d / 7) * 0.30
    return base + wob(t, right ? 2.7 : 0) * amt
}

/** 沙洲永遠比水面寬,所以直接由水面的半寬加上一段會擺動的邊距 */
export function bankHalf(t, river, right) {
    return riverHalf(t, river, right) + 0.17 + wob(t, right ? 5.3 : 1.9) * 0.16
}

/**
 * 水面的顏色貼圖:底色 + 兩側的白色泡沫。
 * u 是橫向(0/1 是兩岸),v 是沿河的弧長。
 */
export function waterTexture() {
    const W = 64, H = 256
    const c = document.createElement('canvas')
    c.width = W; c.height = H
    const g = c.getContext('2d')
    // 亮松石綠的底 + 高對比的白色波紋條。這種卡通水的辨識度來自「稀疏但
    // 很亮的長條反光」,不是均勻的漸層 —— 用 pow(sin, n) 把正弦壓成窄峰,
    // 頻率取整數,所以垂直方向完美接合
    for (let y = 0; y < H; y++) {
        const t = (y / H) * Math.PI * 2
        for (let x = 0; x < W; x++) {
            const u = (x / W) * Math.PI * 2
            const wob = Math.sin(u * 2 + t * 0.5) * 0.35      // 讓條紋不要筆直
            const band = 0.5 + 0.22 * Math.sin(t * 3 + wob) + 0.14 * Math.sin(t * 7 - wob)
            // 指數決定亮帶多寬。之前用 16 / 24,峰只有 5 像素寬,遠看直接被
            // 過濾掉;3 / 5 才是看得見的寬帶
            const s1 = Math.pow(Math.max(0, Math.sin(t * 3 + wob * 1.6)), 3)
            const s2 = Math.pow(Math.max(0, Math.sin(t * 6 - wob * 2.2 + 1.7)), 5)
            const streak = Math.min(1, s1 * 0.72 + s2 * 0.45)
            const edge = Math.max(0, 1 - Math.min(x, W - 1 - x) / 6)
            const foam = edge * edge * 0.6
            const k = Math.min(1, streak + foam)
            // 底色 → 白:整條的亮度由波紋條主導
            const r = Math.round((36 + band * 30) * (1 - k) + 238 * k)
            const gg = Math.round((188 + band * 34) * (1 - k) + 252 * k)
            const b = Math.round((180 + band * 32) * (1 - k) + 248 * k)
            g.fillStyle = `rgb(${r}, ${gg}, ${b})`
            g.fillRect(x, y, 1, 1)
        }
    }
    const t = new THREE.CanvasTexture(c)
    t.wrapS = t.wrapT = THREE.RepeatWrapping
    t.colorSpace = THREE.SRGBColorSpace
    t.anisotropy = 8           // 河是大斜角看的,沒有這個水紋會被抹成平色
    return t
}

/**
 * 水面的法線貼圖 —— 這才是讓水看起來像水的東西。
 *
 * 平的藍色布面不管怎麼捲動都像塑膠布;有了法線起伏,陽光的鏡面反光會
 * 隨著波紋游動,那個閃爍才是眼睛認得的「水」。用幾道不同頻率的正弦疊
 * 成高度場,再取梯度當法線;頻率都取整數,所以四邊完美接合。
 */
export function waterNormal(size = 128) {
    const c = document.createElement('canvas')
    c.width = c.height = size
    const g = c.getContext('2d')
    const img = g.createImageData(size, size)
    const h = (x, y) => {
        const u = (x / size) * Math.PI * 2, v = (y / size) * Math.PI * 2
        return 0.50 * Math.sin(v * 3 + u * 1)
             + 0.30 * Math.sin(v * 7 - u * 2 + 1.1)
             + 0.18 * Math.sin(v * 13 + u * 4 + 2.2)
             + 0.14 * Math.sin(u * 5 + v * 2 + 0.7)
    }
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
        const w = (n) => (n + size) % size
        const dx = h(w(x + 1), y) - h(w(x - 1), y)
        const dy = h(x, w(y + 1)) - h(x, w(y - 1))
        const s = 2.2
        let nx = -dx * s, ny = -dy * s, nz = 1
        const l = Math.hypot(nx, ny, nz)
        const i = (y * size + x) * 4
        img.data[i]     = ((nx / l) * 0.5 + 0.5) * 255
        img.data[i + 1] = ((ny / l) * 0.5 + 0.5) * 255
        img.data[i + 2] = ((nz / l) * 0.5 + 0.5) * 255
        img.data[i + 3] = 255
    }
    g.putImageData(img, 0, 0)
    const t = new THREE.CanvasTexture(c)
    t.wrapS = t.wrapT = THREE.RepeatWrapping
    t.colorSpace = THREE.NoColorSpace     // 這是資料不是顏色,不能做 sRGB 轉換
    t.anisotropy = 8
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

/** 一朵雲:三四顆壓扁的球黏成一團。不吃光照,免得背光那面變灰 */
function cloud(rand) {
    const g = new THREE.Group()
    const m = new THREE.MeshBasicMaterial({ color: 0xffffff })
    const n = 3 + Math.floor(rand() * 3)
    for (let i = 0; i < n; i++) {
        const r = 1.1 + rand() * 1.5
        const puff = new THREE.Mesh(new THREE.SphereGeometry(r, 8, 6), m)
        puff.position.set((i - n / 2) * 1.5 + rand(), rand() * 0.5, rand() * 1.4 - 0.7)
        puff.scale.y = 0.55
        g.add(puff)
    }
    return g
}

/**
 * 熱氣球。球皮用 8 片獨立的 lathe 楔形拼成,兩色交錯 —— 這樣才有真正的
 * 直向布瓣。整顆用一個 lathe 再貼條紋貼圖也行,但那要多一張貼圖。
 */
function balloon() {
    const g = new THREE.Group()
    // 淚滴形剖面:上圓下收,最後收成一個點
    const prof = [[0.02, 0], [0.16, 0.10], [0.34, 0.26], [0.45, 0.50],
                  [0.46, 0.72], [0.38, 0.92], [0.21, 1.08], [0, 1.13]]
        .map(([x, y]) => new THREE.Vector2(x, y))
    const skin = [mat(0xd4574a), mat(0xf2e6cf)]
    const GORE = 8
    for (let i = 0; i < GORE; i++) {
        const wedge = new THREE.Mesh(
            new THREE.LatheGeometry(prof, 5, (i / GORE) * Math.PI * 2, Math.PI * 2 / GORE),
            skin[i % 2])
        wedge.castShadow = true
        g.add(wedge)
    }
    const basket = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.15, 0.19), mat(0xc9a06a))
    basket.position.y = -0.30
    basket.castShadow = true
    g.add(basket)
    const burner = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.06, 8), mat(C.dark))
    burner.position.y = -0.19
    g.add(burner)
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {      // 吊索
        const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.22, 4), mat(C.dark))
        rope.position.set(sx * 0.075, -0.16, sz * 0.075)
        g.add(rope)
    }
    return g
}

/**
 * 建一片草原。
 * @param hx,hz 棋盤(含墊子)的半寬半深:這個範圍內什麼都不能放,不然會擋住軌道
 */
export function buildWorld(scene, hx, hz, seed = 1, river = null) {
    const rand = rng(seed * 7919 + 13)
    const g = new THREE.Group()

    // 遠處丘陵先建 —— 後面的草木動物要避開它們,不然會有樹半截插進山裡。
    // 壓扁的半球在地面上的輪廓是橢圓,記下來當作第二個禁區
    const hills = []
    const HILL_KEEP = 22        // 山的內緣至少離中心這麼遠
    for (let i = 0; i < 9; i++) {
        for (let tryN = 0; tryN < 12; tryN++) {
            const a = (i / 9) * Math.PI * 2 + (rand() - 0.5) * 0.6
            const R = 6 + rand() * 7
            const sx = 1.6 + rand(), sz = 1.6 + rand()
            // 半徑要先算,再決定山心放多遠。原本山心固定在 34~48,但橫向縮放後
            // 半徑最大到 33.8,內緣可以逼近原點 —— 整座山壓在棋盤上
            const rx = R * sx, rz = R * sz
            const r = HILL_KEEP + Math.max(rx, rz) + rand() * 8
            const x = Math.cos(a) * r, z = Math.sin(a) * r
            // 兩座山穿插的話,交線會在山坡上切出一道假懸崖。寧可少放一座
            if (hills.some(h => Math.hypot(x - h.x, z - h.z) <
                    Math.max(rx, rz) + Math.max(h.rx, h.rz) * 0.95)) continue
            const hill = new THREE.Mesh(
                new THREE.SphereGeometry(R, 12, 7, 0, Math.PI * 2, 0, Math.PI / 2), mat(C.hill))
            hill.scale.set(sx, 0.32 + rand() * 0.25, sz)
            hill.position.set(x, -0.4, z)
            g.add(hill)
            hills.push({ x, z, rx: rx * 1.06, rz: rz * 1.06 })
            break
        }
    }
    // 更遠一圈的大山:沒有霧之後地平線是一條直線,要有東西把它切開。
    // 這圈的半徑最大到 100,所以更要先算半徑再決定山心 —— 上一版直接把
    // 山心固定在 75~145,結果內緣跑到 r = -14,整座山把棋盤包在裡面
    const FAR_KEEP = 60
    for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2 + (rand() - 0.5) * 0.5
        const R = 18 + rand() * 22
        const sx = 1.5 + rand(), sz = 1.5 + rand()
        const rx = R * sx, rz = R * sz
        const r = FAR_KEEP + Math.max(rx, rz) + rand() * 40
        const far = new THREE.Mesh(
            new THREE.SphereGeometry(R, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat(0x93b189))
        far.scale.set(sx, 0.30 + rand() * 0.22, sz)
        far.position.set(Math.cos(a) * r, -1.5, Math.sin(a) * r)
        g.add(far)
        hills.push({ x: far.position.x, z: far.position.z, rx: rx * 1.06, rz: rz * 1.06 })
    }

    const onHill = (x, z) => hills.some(h =>
        ((x - h.x) / h.rx) ** 2 + ((z - h.z) / h.rz) ** 2 < 1)

    // 棋盤禁區用矩形判斷。用半徑會讓長方形棋盤的短邊塞不下東西、長邊又被吃掉
    // 河也是禁區 —— 樹長在河中間會很奇怪
    const onRiver = (x, z) => {
        if (!river) return false
        const along = river.axis ? x : z              // 沿著河的方向
        const lat = (river.axis ? z : x) - river.at - riverOffset(along, river.hw)
        return Math.abs(lat) < 1.05
    }
    const clear = (x, z, pad) =>
        (Math.abs(x) > hx + pad || Math.abs(z) > hz + pad) && !onHill(x, z) && !onRiver(x, z)
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

    // 雲
    const clouds = []
    for (let i = 0; i < 7; i++) {
        const c = cloud(rand)
        const a = rand() * Math.PI * 2, r = 16 + rand() * 40
        c.position.set(Math.cos(a) * r, 13 + rand() * 9, Math.sin(a) * r)
        c.scale.setScalar(1.3 + rand() * 1.6)
        g.add(c)
        clouds.push({ obj: c, vx: 0.06 + rand() * 0.05 })
    }

    // 熱氣球:一顆就好,慢慢飄過天空
    const bal = balloon()
    bal.scale.setScalar(1.5)
    g.add(bal)

    g.add(skyDome())

    scene.add(g)
    return {
        group: g,
        balloon: bal,
        /** 動物低頭吃草。單純上下擺頭就夠了,靜止不動的動物看起來像模型 */
        update(t) {
            // 兩個週期不同的正弦疊起來,路線才不會是一個看得出來的圓
            bal.position.set(Math.cos(t * 0.062) * 7.5 + Math.cos(t * 0.023) * 2.5,
                             4.2 + Math.sin(t * 0.10) * 0.4,
                             Math.sin(t * 0.051) * 8.5 + Math.sin(t * 0.037) * 2.5)
            bal.rotation.y = t * 0.06
            for (const c of clouds) {
                c.obj.position.x += c.vx * 0.016
                if (c.obj.position.x > 70) c.obj.position.x = -70
            }
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

export { skyDome }
