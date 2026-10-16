// WebGPU 版的相容層:讓原本寫給 WebGLRenderer 的程式不用大改就能跑在 WebGPURenderer 上。
//
// 唯一真正不相容的是「點」:WebGPU 的點永遠只有 1 像素(沒有 gl_PointSize),
// 所以星星、城市燈火、煙火、雪這些有大小的點,要改成「一個 Sprite + 每顆點一個 instance」來畫。
// 這裡把 THREE.Points / THREE.PointsMaterial 換成這種畫法,外面的程式照樣 new THREE.Points(geo, mat)。
//
// 為了跟 WebGL 版看起來一樣,點的大小照 WebGL 的規則算(單位:裝置像素),而且補上 WebGL 兩個隱含行為:
//   1. 點的中心在畫面外就整顆不畫(GL 的點是看中心裁切的;sprite 是四邊形,會從畫面邊緣伸進來)
//   2. 點最大 511 像素(這台 GPU 的 ALIASED_POINT_SIZE_RANGE 上限;sprite 沒有上限,貼著相機的點會變成一大團)
import * as T from 'three'
import * as TSL from 'three/tsl'

const { instancedDynamicBufferAttribute, materialColor, materialPointSize, vec4, float, screenDPR, screenSize,
    positionView, cameraProjectionMatrix, select, abs, min, lessThanEqual, greaterThan } = TSL

const MAX_POINT = 511

/** 用 WebGL 的 gl_PointSize(裝置像素)算出 PointsNodeMaterial.sizeNode 要的值 */
export function pointSizeNode(deviceSize) {
    const clip = cameraProjectionMatrix.mul(vec4(positionView, 1))
    const inside = lessThanEqual(abs(clip.x), clip.w).and(lessThanEqual(abs(clip.y), clip.w)).and(greaterThan(clip.w, 0.1))
    // PointsNodeMaterial 會再乘上 DPR,這裡先除掉
    return select(inside, min(deviceSize, float(MAX_POINT)), float(0)).div(screenDPR)
}

// WebGL:sizeAttenuation 開 → size × (畫布高度/2) / 距離;關 → size × DPR。兩種都是裝置像素
class PointsMaterial extends T.PointsNodeMaterial {
    constructor(params = {}) {
        super(params)
        this.wantsVertexColors = this.vertexColors
        this.vertexColors = false          // 顏色改由 instance 屬性提供(sprite 的 quad 沒有 color 屬性)
        const device = this.sizeAttenuation
            ? materialPointSize.mul(screenSize.y.mul(0.5)).div(positionView.z.negate())
            : materialPointSize.mul(screenDPR)
        this.sizeNode = pointSizeNode(device)
        this.sizeAttenuation = false       // 大小已經自己算好了,不要讓 three 再算一次
    }
}

// 把 BufferGeometry 的屬性換成 InstancedBufferAttribute(共用同一個陣列),
// 外面照舊改陣列、設 needsUpdate 就會更新
function instanced(geo, name, itemSize) {
    const a = geo.getAttribute(name)
    if (!a) return null
    if (a.isInstancedBufferAttribute) return a
    const ia = new T.InstancedBufferAttribute(a.array, itemSize ?? a.itemSize)
    ia.setUsage(T.DynamicDrawUsage)
    geo.setAttribute(name, ia)
    return ia
}

class Points extends T.Sprite {
    constructor(geo, mat) {
        super(mat)
        this.pointsGeometry = geo
        this.isGPUPoints = true
        const pos = instanced(geo, 'position', 3)
        this.count = pos.count
        mat.positionNode = instancedDynamicBufferAttribute(pos)
        if (mat.wantsVertexColors && geo.getAttribute('color')) {
            const col = instanced(geo, 'color', 3)
            mat.colorNode = materialColor.mul(vec4(instancedDynamicBufferAttribute(col), 1))
        }
        this.frustumCulled = false        // instance 散在整顆星球上,用 sprite 自己的 bounding 會被誤裁
    }
}

export function makeTHREE() {
    return { ...T, Points, PointsMaterial, TSL, instancedFrom: instanced, pointSizeNode, isWebGPUCompat: true }
}
