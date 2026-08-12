// 木頭軌道:片型定義、幾何生成、走軌判定。
//
// 座標:棋盤鋪在 XZ 平面,Y 朝上。方向索引 0=N(-Z) 1=E(+X) 2=S(+Z) 3=W(-X)。
// 旋轉 r 表示順時針轉 r 個 90 度,連接埠跟著位移 (d + r) % 4,幾何點跟著
// (x, z) → (-z, x)。兩者用同一個 r,所以「轉一片」永遠只是改一個整數。
import * as THREE from 'three'

export const DELTA = [[0, -1], [1, 0], [0, 1], [-1, 0]]
export const opposite = d => (d + 2) % 4

// segs 是中心線片段 [起, 迄];-1 代表格子正中央(月台的盡頭)。
// 一片可以有多段 —— 十字就是兩段互不相干的直線。
export const PIECES = {
    straight: { conns: [0, 2], segs: [[0, 2]] },
    curve:    { conns: [0, 1], segs: [[0, 1]] },
    cross:    { conns: [0, 1, 2, 3], segs: [[0, 2], [1, 3]] },
    // 橋:接法跟直軌一樣,但中段拱起來,而且只能鋪在水上。
    // 它存在的理由就是「跨過不能鋪軌道的地方」—— 拿來當漂亮的直軌沒有意義
    bridge:   { conns: [0, 2], segs: [[0, 2]], arch: 0.30, water: true },
    start:    { conns: [2], segs: [[2, -1]] },
    goal:     { conns: [2], segs: [[2, -1]] },
}

export const PLACEABLE = ['straight', 'curve', 'cross', 'bridge']

// 木軌斷面(x = 橫向,y = 高度)。上緣挖兩道凹槽 —— 這是木頭軌道一眼認得出來的特徵,
// 少了它就只是一條棕色的長條。輪廓是逆時針的簡單多邊形,端蓋直接拿它三角化。
const PROFILE = [
    [-0.170, 0.000], [0.170, 0.000],                                     // 底面
    [0.170, 0.060], [0.148, 0.088],                                      // 側面 + 倒角
    [0.108, 0.088], [0.108, 0.048], [0.046, 0.048], [0.046, 0.088],      // 右溝
    [-0.046, 0.088], [-0.046, 0.048], [-0.108, 0.048], [-0.108, 0.088],  // 左溝
    [-0.148, 0.088], [-0.170, 0.060],
]
export const GROOVE_Y = 0.048      // 凹槽底,火車輪子踩在這個高度
export const GROOVE_X = 0.077      // 凹槽中心

// 每一片的兩端各縮這麼多。只要能讓兩片的端蓋不重疊、留下一條髮絲縫就夠了 ——
// 縮太多會變成「兩片沒接上」:中間看得到墊子,榫頭懸在空中。實物是密合的,
// 縫細到剛好看得出是兩片,榫頭則整個埋進鄰片,只在縫上留下坐進孔裡的圓形輪廓
const JOINT = 0.004

// 斷面上屬於凹槽的邊(外壁 / 槽底 / 內壁),這些面要用深一階的材質。
// 只靠打光讓 0.04 深的槽現形,在俯視的距離下永遠不夠深
const GROOVE_EDGES = new Set([4, 5, 6, 8, 9, 10])

const ARC_SEG = 12                 // 四分之一圓切幾段:7.5 度一步,火車轉彎不會有稜角

// 月台軌道的內側盡頭。不是格子正中央,而是再往裡 0.3 —— 那個位置在車庫裡面,
// 火車才有「從屋子裡開出來 / 完全開進去」的空間可跑
const INNER = new THREE.Vector2(0, -0.30)

/** 某個方向的邊中點(格子局部座標,格子邊長 1);-1 = 月台內側盡頭 */
const edgeMid = d => d === -1 ? INNER.clone()
    : new THREE.Vector2(DELTA[d][0] * 0.5, DELTA[d][1] * 0.5)

/** 把局部點順時針轉 r 個 90 度 */
function rot2(p, r) {
    let { x, y } = p                       // y 在這裡是 z
    for (let i = 0; i < r; i++) { const t = x; x = -y; y = t }
    return new THREE.Vector2(x, y)
}

/**
 * 一段中心線的取樣點(格子局部座標)。
 * 相鄰兩邊 → 四分之一圓,圓心正好是兩個邊中點的和(N+E = 右上角),半徑 0.5。
 */
function segPoints(a, b) {
    const pa = edgeMid(a), pb = edgeMid(b)
    if (a === -1 || b === -1 || opposite(a) === b) return [pa, pb]   // 直線
    const c = new THREE.Vector2().addVectors(pa, pb)                 // 轉角圓心
    const a0 = Math.atan2(pa.y - c.y, pa.x - c.x)
    let a1 = Math.atan2(pb.y - c.y, pb.x - c.x)
    while (a1 - a0 > Math.PI) a1 -= Math.PI * 2                      // 一律走短弧
    while (a0 - a1 > Math.PI) a1 += Math.PI * 2
    const out = []
    for (let i = 0; i <= ARC_SEG; i++) {
        const t = a0 + (a1 - a0) * (i / ARC_SEG)
        out.push(new THREE.Vector2(c.x + Math.cos(t) * 0.5, c.y + Math.sin(t) * 0.5))
    }
    return out
}

// 橋面的取樣數。直線本來只要兩點,拱起來就得多切幾段才不會變成折線
const ARCH_SEG = 14

/** 一片(含旋轉)的所有中心線段,局部座標;arch 是這一段的拱高 */
export function pieceSegs(type, rot) {
    const arch = PIECES[type].arch || 0
    return PIECES[type].segs.map(([a, b]) => {
        let pts = segPoints(a, b)
        if (arch) {                       // 直線切細,好讓中段拱得平順
            const [p0, p1] = pts
            pts = Array.from({ length: ARCH_SEG + 1 }, (_, i) =>
                new THREE.Vector2().lerpVectors(p0, p1, i / ARCH_SEG))
        }
        return {
            a: a === -1 ? -1 : (a + rot) % 4,
            b: b === -1 ? -1 : (b + rot) % 4,
            pts: pts.map(p => rot2(p, rot)),
            arch,
        }
    })
}

export const connsOf = cell => PIECES[cell.type].conns.map(d => (d + cell.rot) % 4)

/* ── 幾何 ───────────────────────────────────────────────────────────── */

/**
 * 把斷面沿著一條路徑掃出實體。
 * 用固定的 up 算副法線,不用 Frenet frame —— 路徑都在水平面上,Frenet 在直線段
 * 會退化、在轉彎處會扭轉,掃出來的軌道會翻面。
 */
export function sweep(pts) {
    const up = new THREE.Vector3(0, 1, 0)
    const n = pts.length, m = PROFILE.length
    const pos = [], idx = [], idxG = [], uv = []
    const tan = new THREE.Vector3(), right = new THREE.Vector3()
    let arc = 0
    for (let i = 0; i < n; i++) {
        const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)]
        tan.subVectors(b, a).normalize()
        right.crossVectors(up, tan).normalize()
        if (i) arc += pts[i].distanceTo(pts[i - 1])
        for (let j = 0; j < PROFILE.length; j++) {
            const [px, py] = PROFILE[j]
            pos.push(pts[i].x + right.x * px, pts[i].y + py, pts[i].z + right.z * px)
            // 木紋順著軌道長邊走,轉彎處也跟著弧長延伸,接縫才不會錯開
            uv.push(j / (PROFILE.length - 1), arc * 1.6)
        }
    }
    for (let i = 0; i < n - 1; i++) for (let j = 0; j < m; j++) {
        const k = (j + 1) % m
        const A = i * m + j, B = i * m + k, C = (i + 1) * m + j, D = (i + 1) * m + k
        const t = GROOVE_EDGES.has(j) ? idxG : idx
        t.push(A, B, C, B, D, C)        // 這個繞序才會讓法線朝外(斷面是逆時針)
    }
    // 端蓋:斷面是凹多邊形(有凹槽),不能用扇形,得真的三角化
    const contour = PROFILE.map(([x, y]) => new THREE.Vector2(x, y))
    const faces = THREE.ShapeUtils.triangulateShape(contour, [])
    const last = (n - 1) * m
    for (const [a, b, c] of faces) { idx.push(c, b, a); idx.push(last + a, last + b, last + c) }

    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
    g.setIndex(idx.concat(idxG))
    g.addGroup(0, idx.length, 0)              // 0 = 木頭本色
    g.addGroup(idx.length, idxG.length, 1)    // 1 = 凹槽,深一階
    g.computeVertexNormals()
    return g
}

/** 一片軌道的世界座標中心線(給渲染和走軌共用) */
export function segWorld(seg, cx, cz, w, h) {
    const n = seg.pts.length - 1
    return seg.pts.map((p, i) => new THREE.Vector3(
        cx - (w - 1) / 2 + p.x,
        // 拱形:兩端回到 0,中段最高,火車跟著俯仰
        seg.arch ? seg.arch * Math.sin(Math.PI * (i / n)) : 0,
        cz - (h - 1) / 2 + p.y))
}

/** 把折線兩端各往內縮 d,用來留出片與片之間的接縫(只給渲染用) */
export function trimEnds(pts, d = JOINT) {
    if (pts.length < 2) return pts
    const out = pts.map(p => p.clone())
    const pull = (i, j) => out[i].addScaledVector(
        new THREE.Vector3().subVectors(out[j], out[i]).normalize(), d)
    pull(0, 1)
    pull(out.length - 1, out.length - 2)
    return out
}

/* ── 走軌 ───────────────────────────────────────────────────────────── */

/** 依弧長取位置與切線;火車、乘客判定、脫軌起點都靠它 */
export class Path {
    constructor(pts) {
        this.pts = pts
        this.acc = [0]
        for (let i = 1; i < pts.length; i++)
            this.acc.push(this.acc[i - 1] + pts[i].distanceTo(pts[i - 1]))
        this.length = this.acc[this.acc.length - 1] || 0
    }
    at(s, outPos, outTan) {
        const a = this.acc
        s = Math.max(0, Math.min(this.length, s))
        let lo = 0, hi = a.length - 1
        while (lo < hi - 1) { const m = (lo + hi) >> 1; a[m] <= s ? lo = m : hi = m }
        const seg = a[hi] - a[lo] || 1
        const t = (s - a[lo]) / seg
        outPos.lerpVectors(this.pts[lo], this.pts[hi], t)
        outTan.subVectors(this.pts[hi], this.pts[lo]).normalize()
    }
}

/**
 * 從起點站走一遍玩家鋪的軌道。
 * 回傳 { path, ok, marks } —— marks 記下每個經過的格子與它的弧長位置,
 * 乘客判定直接比對弧長,不必每幀去掃格子。
 * ok=false 代表走到開口或空格,火車會在 path 盡頭衝出去。
 */
export function walk(level, cells) {
    const { w, h } = level
    const pts = [], marks = []
    // arch 一定要跟著傳:拱形只做在渲染的幾何裡的話,火車會從橋「裡面」穿過去
    const push = (segPts, cx, cz, arch = 0) => {
        const world = segWorld({ pts: segPts, arch }, cx, cz, w, h)
        // 接縫上的點會重複一次,去掉才不會讓弧長出現零長段
        for (const p of world) if (!pts.length || p.distanceTo(pts[pts.length - 1]) > 1e-6) pts.push(p)
    }
    const arcAt = () => {
        let s = 0
        for (let i = 1; i < pts.length; i++) s += pts[i].distanceTo(pts[i - 1])
        return s
    }

    let [x, z] = level.start
    const startCell = cells[z][x]
    // 起點站的中心線是「邊 → 中心」,火車要從中心開出去,所以倒著走
    const s0 = pieceSegs('start', startCell.rot)[0]
    push([...s0.pts].reverse(), x, z)
    marks.push({ x, z, s: arcAt() })
    let dir = connsOf(startCell)[0]

    for (let step = 0; step < 500; step++) {
        x += DELTA[dir][0]; z += DELTA[dir][1]
        if (x < 0 || z < 0 || x >= w || z >= h) break            // 衝出棋盤
        const cell = cells[z][x]
        if (!cell) break                                          // 沒鋪 → 開口
        // 單行軌:只能照箭頭的方向開進來。限制的是「路線往哪個方向走」,
        // 不是「這格放什麼片」—— 這是片數與障礙都做不到的約束
        if (cell.oneWay != null && cell.oneWay !== dir) break
        const seg = pieceSegs(cell.type, cell.rot)
            .find(s => s.a === opposite(dir) || s.b === opposite(dir))
        if (!seg) break                                           // 有片但接不上
        const forward = seg.a === opposite(dir)
        push(forward ? seg.pts : [...seg.pts].reverse(), x, z, seg.arch)
        marks.push({ x, z, s: arcAt() })
        const exit = forward ? seg.b : seg.a
        if (exit === -1)                                          // 走到月台盡頭
            return { path: new Path(pts), ok: cell.type === 'goal', marks }
        dir = exit
    }
    // 脫軌:讓車頭多衝出去一格,摔下去才看得清楚是從哪裡飛出去的
    const tail = pts[pts.length - 1], prev = pts[pts.length - 2] || tail
    const d = new THREE.Vector3().subVectors(tail, prev).normalize()
    pts.push(tail.clone().addScaledVector(d, 0.5))
    return { path: new Path(pts), ok: false, marks }
}
