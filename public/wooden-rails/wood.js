// 木頭質感。用 canvas 畫出來,不下載任何貼圖檔。
//
// 純色的 MeshStandardMaterial 會讓木頭看起來像塑膠 —— 真正把「這是木頭玩具」
// 講清楚的是兩件事:順著紋路的深淺條紋,還有邊角被玩到掉漆的淺色斑。
// 兩者都只是灰階遮罩,乘上各自的漆色就好,一張貼圖全部零件共用。
import * as THREE from 'three'

let _grain = null
const _cache = new Map()

function grainCanvas(size = 256) {
    const c = document.createElement('canvas')
    c.width = c.height = size
    const g = c.getContext('2d')
    g.fillStyle = '#fff'
    g.fillRect(0, 0, size, size)

    // 木紋:略帶彎曲的縱向條紋。畫成直線會像塑膠條,彎一點才像鋸開的木頭
    for (let i = 0; i < 110; i++) {
        const x = Math.random() * size
        g.strokeStyle = `rgba(96,64,38,${0.018 + Math.random() * 0.042})`
        g.lineWidth = 0.5 + Math.random() * 2.6
        g.beginPath()
        g.moveTo(x, -6)
        g.bezierCurveTo(x + (Math.random() - 0.5) * 22, size * 0.34,
                        x + (Math.random() - 0.5) * 22, size * 0.68,
                        x + (Math.random() - 0.5) * 12, size + 6)
        g.stroke()
    }
    // 掉漆:淺色斑塊,舊玩具的漆一定是斑駁的
    for (let i = 0; i < 16; i++) {
        const x = Math.random() * size, y = Math.random() * size
        const r = 3 + Math.random() * 16
        const grd = g.createRadialGradient(x, y, 0, x, y, r)
        grd.addColorStop(0, 'rgba(255,255,255,0.32)')
        grd.addColorStop(1, 'rgba(255,255,255,0)')
        g.fillStyle = grd
        g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill()
    }
    return c
}

/** 取得某個重複倍率的木紋貼圖。repeat 不同就得是不同的 texture,所以快取起來 */
export function woodMap(rx = 1, ry = 1) {
    const key = `${rx}x${ry}`
    if (_cache.has(key)) return _cache.get(key)
    if (!_grain) _grain = grainCanvas()
    const t = new THREE.CanvasTexture(_grain)
    t.wrapS = t.wrapT = THREE.RepeatWrapping
    t.repeat.set(rx, ry)
    t.anisotropy = 4
    t.colorSpace = THREE.SRGBColorSpace
    _cache.set(key, t)
    return t
}

/**
 * 上漆的木頭材質。
 * @param flat 方塊零件用平面著色(稜角分明),車輪鍋爐這種車床件不要,
 *             不然圓柱會變成多邊形柱
 */
export function painted(color, { rough = 0.8, flat = false, rx = 1, ry = 1 } = {}) {
    return new THREE.MeshStandardMaterial({
        color, roughness: rough, metalness: 0,
        map: woodMap(rx, ry), flatShading: flat,
    })
}

// 參考實物玩具的配色:都是帶灰的舊漆色,飽和度一高就變成塑膠玩具
export const C = {
    red:    0xc25a4c,
    blue:   0x6fa3bd,
    green:  0x71905d,
    yellow: 0xd6b34c,
    beech:  0xd8b483,      // 軌道與原木色
    pale:   0xdfc9a2,      // 車廂內側、原木堆
    hub:    0x9a9086,      // 輪軸的金屬釘
    dark:   0x4a3b2c,
}
