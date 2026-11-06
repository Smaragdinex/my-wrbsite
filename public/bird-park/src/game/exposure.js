// 曝光：真的單眼那一套。場景亮度用 EV（ISO 100 時的曝光值）：大太陽約 13、樹蔭 10、黃昏 7～8、晚上路燈下 4、月光 1。
// 相機設定的 EV = log2(光圈² ÷ 快門) − log2(ISO ÷ 100)；場景 EV − 設定 EV = 過曝幾格（正）／欠曝幾格（負）。
// 模式：自動（光圈全開、快門至少 1/焦距、ISO 自動，ISO 到頂還不夠就拉慢快門，最慢 1/15，再不夠就暗）、
// A 光圈優先（自己定光圈和 ISO，快門自動）、S 快門優先（自己定快門和 ISO，光圈自動）、M 全手動。
import * as THREE from 'three'
import { t as tr } from '../i18n.js'

export const APERTURES = [1.4, 2, 2.8, 4, 5.6, 6.3, 8, 11, 16, 22]
export const SHUTTERS = [1 / 8000, 1 / 4000, 1 / 2000, 1 / 1000, 1 / 500, 1 / 250, 1 / 125, 1 / 60, 1 / 30, 1 / 15, 1 / 8, 1 / 4, 1 / 2, 1]
export const ISOS = [100, 200, 400, 800, 1600, 3200, 6400, 12800, 25600]
export const MODES = [
  { id: 'auto', name: tr('自動'), tip: tr('相機全部幫你決定。白天很好用；晚上快門會變慢、照片會糊或偏暗。') },
  { id: 'A', name: tr('A 光圈優先'), tip: tr('你定光圈和 ISO，快門自動。光圈開大（數字小）背景比較糊、也比較亮。') },
  { id: 'S', name: tr('S 快門優先'), tip: tr('你定快門和 ISO，光圈自動。拍飛的鳥要 1/2000 以上才凍得住。') },
  { id: 'M', name: tr('M 手動'), tip: tr('全部自己來，看下面的測光表調到 0。') },
]
export const fmtShutter = (t) => (t >= 0.5 ? `${Math.round(t * 10) / 10}"` : `1/${Math.round(1 / t)}`)
export const fmtAp = (n) => `f/${n}`
const log2 = Math.log2

// 機身的雜訊（同樣 ISO，旗艦機乾淨很多）
export const NOISE = { b1: 1, b2: 0.6, b3: 0.35 }

export function evOf(N, t, iso) { return log2((N * N) / t) - log2(iso / 100) }

// 照目前模式算出真正用的光圈／快門／ISO 和過曝幾格
// cam：{ mode, ap, t, iso }（使用者選的）；lens、body；ev：場景亮度；focal：焦距
export function settle(cam, { lens, body, ev, focal }) {
  const isoMax = body.iso, nMin = lens.ap
  let N = Math.max(cam.ap, nMin), t = cam.t, iso = Math.min(cam.iso, isoMax)
  const tFor = (N, iso) => (N * N) / 2 ** (ev + log2(iso / 100))
  if (cam.mode === 'auto') {
    N = nMin
    t = Math.min(1 / Math.max(250, 1.5 * focal), tFor(N, 100))
    iso = THREE.MathUtils.clamp(100 * 2 ** (log2((N * N) / t) - ev), 100, isoMax)
    if (iso >= isoMax) t = Math.min(1 / 15, tFor(N, isoMax))   // ISO 到頂：拉慢快門，最慢 1/15
    t = Math.max(t, 1 / 8000)
    if (tFor(N, 100) < 1 / 8000) N = Math.min(22, Math.sqrt((1 / 8000) * 2 ** ev))   // 太亮：縮光圈
  } else if (cam.mode === 'A') {
    t = THREE.MathUtils.clamp(tFor(N, iso), 1 / 8000, 30)
  } else if (cam.mode === 'S') {
    N = THREE.MathUtils.clamp(Math.sqrt(t * 2 ** (ev + log2(iso / 100))), nMin, 22)
  }
  const over = ev - evOf(N, t, iso)
  return { N: Math.round(N * 10) / 10, t, iso: Math.round(iso), over }
}

// 測光：用小張 HDR 圖（還沒色調映射的線性亮度）量觀景窗中間的平均亮度，換成 EV。
// 畫面的亮度跟真實世界差太多（晚上其實只暗 3、4 格），所以亮度差放大 K 倍：白天 13～14、黃昏 11→6、晚上 3～5（路燈下更亮；入門機身晚上很吃力，要升級）
const MW = 48, MH = 32, K = 2.0, L_REF = 0.115   // L_REF：白天 11 點在入口量到的平均亮度
export function createMeter(renderer) {
  const rt = new THREE.WebGLRenderTarget(MW, MH, { type: THREE.HalfFloatType })
  const buf = new Uint16Array(MW * MH * 4)
  let lum = L_REF
  function measure(scene, cam) {
    const prev = renderer.getRenderTarget(), au = renderer.shadowMap.autoUpdate
    renderer.shadowMap.autoUpdate = false   // 陰影貼圖沿用畫面那張，不重畫（很貴）
    const l2 = cam.layers.isEnabled(2); cam.layers.disable(2)   // 光暈、螢火蟲不算（world.js 的 layer 2）
    renderer.setRenderTarget(rt); renderer.render(scene, cam); renderer.setRenderTarget(prev)
    if (l2) cam.layers.enable(2)
    renderer.shadowMap.autoUpdate = au
    renderer.readRenderTargetPixels(rt, 0, 0, MW, MH, buf)
    // 中央重點測光：中間三分之一權重 3 倍
    let s = 0, w = 0, peak = 0
    const h = THREE.DataUtils.fromHalfFloat
    for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
      const i = (y * MW + x) * 4
      const L = 0.2126 * h(buf[i]) + 0.7152 * h(buf[i + 1]) + 0.0722 * h(buf[i + 2])
      const c = Math.abs(x - MW / 2) < MW / 6 && Math.abs(y - MH / 2) < MH / 6 ? 3 : 1
      s += Math.log2(Math.max(L, 1e-5)) * c; w += c; peak = Math.max(peak, L)
    }
    // 整張全黑＝著色器還在背景編譯、這一格什麼都沒畫：沿用上一次的值
    if (peak > 0) lum = 2 ** (s / w)
    return lum
  }
  return {
    measure,
    get lum() { return lum },
    lum0: L_REF,   // 還沒量到之前的預設值
    get ev() { return 13 + K * log2(lum / L_REF) },
    // 照片的亮度：先把場景拉到「正常」亮度（晚上的長曝光照片本來就會比眼睛看到的亮，但不拉滿，留一點夜晚的感覺），再乘上過曝／欠曝
    photoGain(over) { return (L_REF / lum) ** 0.85 * 2 ** over },
  }
}
