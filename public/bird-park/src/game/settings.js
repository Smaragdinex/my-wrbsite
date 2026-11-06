// 設定：畫質（自動／高／中／低，也可以一項一項調）、滑鼠靈敏度、顯示 FPS。存在 localStorage。
// 自動畫質（預設）＝GPU 偵測＋開頭幾秒的效能測試＋玩的時候看 FPS 動態調整，在 LADDER 這 6 級之間上下移動（見 createAuto）。
// 隱私：顯卡名稱只在記憶體裡拿來猜起始等級，不存、不傳出去；localStorage 只存最後的等級數字。
// 手動選高／中／低就不自動調，連續很卡才提示去設定降畫質。
// 每一項都可以馬上套用，不用重新載入：
//   解析度＝renderer 的 pixelRatio；陰影＝太陽陰影貼圖大小；倒影＝水面倒影的解析度／幾格更新一次；路燈＝晚上同時亮幾盞真的點光源
import { PHONE } from '../world.js'
import { lodSetScale } from '../lod.js'

const KEY = 'birdpark.settings'
const DPR = window.devicePixelRatio || 1
const OPTS = {
  res: { label: '解析度', hint: '畫面清晰度，最吃顯卡', items: { high: ['高', Math.min(DPR, 2)], mid: ['中', Math.min(DPR, 1.25)], low: ['低', Math.min(DPR, 1) * 0.8] } },
  shadow: { label: '陰影', hint: '樹影、人影的細緻度', items: { high: ['高', 4096], mid: ['中', 2048], low: ['低', 1024] } },
  reflect: { label: '水面倒影', hint: '水池倒影的清晰度', items: { high: ['高', [0.5, 2]], mid: ['中', [0.35, 3]], low: ['低', [0.2, 4]] } },
  lights: { label: '夜晚路燈光源', hint: '晚上同時照亮四周的路燈數', items: { high: ['高', 8], mid: ['中', 6], low: ['低', 4] } },
}
const PRESETS = { auto: '自動', high: '高', mid: '中', low: '低' }
// 自動畫質的 6 級：先降解析度（效果最大、最不明顯），再降陰影、LOD 距離，最後才是倒影
const LADDER = [
  { res: Math.min(DPR, 2), shadow: 4096, reflect: [0.5, 2], lights: 8, lod: 1, name: '高' },
  { res: Math.min(DPR, 1.6), shadow: 4096, reflect: [0.5, 2], lights: 8, lod: 1, name: '高' },
  { res: Math.min(DPR, 1.25), shadow: 2048, reflect: [0.35, 3], lights: 6, lod: 0.8, name: '中' },
  { res: Math.min(DPR, 1), shadow: 2048, reflect: [0.35, 3], lights: 6, lod: 0.65, name: '中' },
  { res: Math.min(DPR, 1) * 0.8, shadow: 1024, reflect: [0.2, 4], lights: 4, lod: 0.5, name: '低' },
  { res: Math.min(DPR, 1) * 0.65, shadow: 1024, reflect: [0.2, 4], lights: 4, lod: 0.4, name: '低' },
]
// GPU 偵測：只看顯卡名稱猜一個起始等級（Safari 一律回「Apple GPU」、Firefox 會簡化，猜不到就從中間開始，交給效能測試修正）
function guessLevel(renderer) {
  if (PHONE) return 4
  let name = ''
  try {
    const gl = renderer.getContext(), ext = gl.getExtension('WEBGL_debug_renderer_info')
    name = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER))
  } catch {}
  if (/swiftshader|llvmpipe|software|basic render/i.test(name)) return 5
  if (/apple m\d+ (pro|max|ultra)|rtx|radeon rx [67]\d{3}|radeon pro w|arc a7/i.test(name)) return 0
  if (/apple m\d|gtx 1[06-9]|gtx 16|rx [5-9]\d{2}\b|rx 5\d{3}|radeon pro/i.test(name)) return 2
  if (/intel|uhd|iris|hd graphics|mali|adreno|powervr|vega \d/i.test(name)) return 4
  return 1
}
const DEFAULT = { preset: 'auto', sens: 1, fps: false, sound: true, music: 'mid', amb: 'high' }
const LEVELS = { off: '關', low: '小', mid: '中', high: '大' }

export function createSettings({ world, player }) {
  const { renderer, sun } = world
  let st
  try { st = { ...DEFAULT, ...JSON.parse(localStorage.getItem(KEY) || '{}') } } catch { st = { ...DEFAULT } }
  if (!PRESETS[st.preset] && st.preset !== 'custom') st.preset = 'auto'
  // 2026-11-06 以前的預設是「高」（手機「低」），不是玩家自己選的：改成自動一次（自己選過「中」或自訂的不動）
  if (!st.q2) { if (st.preset === 'high' || st.preset === 'low') st.preset = 'auto'; st.q2 = true }
  for (const k of Object.keys(OPTS)) if (!OPTS[k].items[st[k]]) st[k] = st.preset === 'custom' || st.preset === 'auto' ? 'high' : st.preset
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(st)) } catch {} }

  const auto = createAuto()
  function apply() {
    const L = LADDER[auto.level]
    const val = st.preset === 'auto' ? (k) => L[k] : (k) => OPTS[k].items[st[k]][1]
    lodSetScale(st.preset === 'auto' ? L.lod : 1)
    if (Math.abs(renderer.getPixelRatio() - val('res')) > 1e-3) renderer.setPixelRatio(val('res'))
    if (sun.shadow.mapSize.x !== val('shadow')) {
      sun.shadow.mapSize.setScalar(val('shadow'))
      sun.shadow.map?.dispose(); sun.shadow.map = null   // 下一格用新的大小重建
    }
    ;[world.quality.reflScale, world.quality.reflEvery] = val('reflect')
    world.time.lights.forEach((l, i) => { l.visible = i < val('lights') })   // 最近的燈排在前面，關後面的
    player.controls.userSens = st.sens   // camera.js 每格用它乘上焦段的比例（直接設 pointerSpeed 會被蓋掉）
    fpsEl.hidden = !st.fps
  }

  /* ---------- FPS ---------- */
  const fpsEl = document.createElement('div')
  fpsEl.className = 'fps'
  document.body.append(fpsEl)
  const tipEl = document.createElement('div')
  tipEl.className = 'perf-tip'; tipEl.hidden = true
  document.body.append(tipEl)
  let acc = 0, n = 0, slow = 0, tipped = false
  function tick(dt, playing) {
    if (st.preset === 'auto') auto.tick(dt)
    acc += dt; n++
    if (acc < 0.5) return
    const fps = n / acc; acc = 0; n = 0
    fpsEl.textContent = `${Math.round(fps)} FPS` + (st.preset === 'auto' ? ` · 自動 ${auto.level + 1}/6` : '')
    if (st.preset === 'auto') return
    // 玩的時候連續 6 秒低於 30 FPS：提示降畫質（一次就好；已經是全部最低就不提示）
    const allLow = Object.keys(OPTS).every((k) => st[k] === 'low')
    slow = playing && fps < 30 ? slow + 0.5 : 0
    if (slow >= 6 && !tipped && !allLow) {
      tipped = true
      tipEl.textContent = '畫面有點卡？按 Esc → 設定，把畫質改成「中」或「低」'
      tipEl.hidden = false
      setTimeout(() => { tipEl.hidden = true }, 9000)
    }
  }

  /* ---------- 自動畫質 ---------- */
  // 1. 起始等級：上次自動調到的等級（已經量過這台電腦）；沒有就用 GPU 名稱猜
  // 2. 效能測試：開始的 8 秒每 1.5 秒看一次平均 FPS，太低就馬上降、很高就升（快速收斂）
  // 3. 動態調整：之後每 4 秒看一次。低於目標 85% 就降一級；連續 12 秒都貼著螢幕更新率才試著升一級，
  //    升上去又掉下來就把那一級鎖 60 秒（不會一直跳）。分頁在背景（瀏覽器會降速）或一格超過 0.25 秒（卡頓、切出去）的不算。
  //    目標固定 55 FPS（60Hz 螢幕的 92%；120Hz 螢幕也不硬追 120）。不從遊戲自己的幀去估螢幕更新率：遊戲卡在 30 FPS 時會被誤判成 30Hz 螢幕、以為跑滿了又升級
  function createAuto() {
    const a = { level: Number.isInteger(st.autoLevel) ? Math.max(0, Math.min(5, st.autoLevel)) : guessLevel(renderer), t: 0, win: 0, frames: 0, fast: 0, good: 0, lock: new Float64Array(6) }
    let clock = 0
    const set = (lv, why) => {
      lv = Math.max(0, Math.min(LADDER.length - 1, lv))
      if (lv === a.level) return
      if (lv < a.level) a.tried = { from: a.level, at: clock }   // 升級：記下來，升了又掉就鎖住
      a.level = lv; st.autoLevel = lv; save(); apply(); render?.()
      a.win = 0; a.frames = 0; a.good = 0
    }
    document.addEventListener('visibilitychange', () => { a.win = 0; a.frames = 0; a.last = 0 })
    // 自己量真實的每格時間（主迴圈的 dt 上限 0.05 秒，20 FPS 以下會被算成比實際快）；now 可以傳進來做測試
    a.tick = (_, now = performance.now()) => {
      const dt = a.last ? (now - a.last) / 1000 : 0; a.last = now
      clock += dt; a.t += dt
      if (document.hidden || dt > 0.25 || dt <= 0) return
      a.win += dt; a.frames++
      const span = a.t < 8 ? 1.5 : 4
      if (a.win < span) return
      const fps = a.frames / a.win, target = 55
      a.win = 0; a.frames = 0
      if (fps < target * 0.85) {
        if (a.tried && clock - a.tried.at < 15) a.lock[a.tried.from - 1] = clock + 60   // 剛升上來就撐不住：這一級 60 秒內不再試
        a.tried = null
        set(a.level + (a.t < 8 && fps < target * 0.5 ? 2 : 1))
      } else if (fps > target * 0.97 && a.level > 0) {
        a.good += span
        if ((a.t < 8 || a.good >= 12) && a.lock[a.level - 1] < clock) set(a.level - 1)
      } else a.good = 0
    }
    return a
  }

  /* ---------- 設定畫面 ---------- */
  const el = document.createElement('div')
  el.className = 'panel menu-sheet settings'
  el.hidden = true
  const seg = (name, items, cur) => `<div class="seg" data-k="${name}">${Object.entries(items).map(([k, v]) =>
    `<button data-v="${k}" class="${k === cur ? 'on' : ''}">${Array.isArray(v) ? v[0] : v}</button>`).join('')}</div>`
  function render() {
    el.innerHTML = `<h2>設定</h2>
      <h3>畫質</h3>
      <div class="row main"><div><b>整體畫質</b><small>${st.preset === 'auto' ? `依這台電腦的速度自動調整（目前第 ${auto.level + 1}／6 級，約等於「${LADDER[auto.level].name}」）。顯示卡型號和效能只在你的電腦上用來挑畫質，不會傳出去、也不會存下來` : st.preset === 'custom' ? '電腦跑不順就調低（目前是自訂）' : '電腦跑不順就調低，或選「自動」'}</small></div>${seg('preset', PRESETS, st.preset)}</div>
      ${st.preset === 'auto' ? '' : Object.entries(OPTS).map(([k, o]) => `<div class="row"><div><b>${o.label}</b><small>${o.hint}</small></div>${seg(k, o.items, st[k])}</div>`).join('')}
      <h3>操作</h3>
      <div class="row"><div><b>滑鼠靈敏度</b><small>轉頭的速度</small></div><div class="slider"><input type="range" min="0.3" max="2.5" step="0.1" value="${st.sens}"><span>${st.sens.toFixed(1)}</span></div></div>
      <div class="row"><div><b>顯示 FPS</b><small>右下角顯示每秒幾格，判斷順不順</small></div>${seg('fps', { off: '關', on: '開' }, st.fps ? 'on' : 'off')}</div>
      <h3>聲音</h3>
      <div class="row"><div><b>背景音樂</b><small>輕柔的環境音樂</small></div>${seg('music', LEVELS, st.music)}</div>
      <div class="row"><div><b>環境音</b><small>鳥叫、蟲鳴、瀑布水聲</small></div>${seg('amb', LEVELS, st.amb)}</div>
      <div class="row"><div><b>音效</b><small>按鈕、對焦嗶聲、快門聲</small></div>${seg('sound', { off: '關', on: '開' }, st.sound ? 'on' : 'off')}</div>
      <button class="back">返回</button>`
  }
  el.addEventListener('click', (e) => {
    const b = e.target.closest('.seg button'); if (!b) return
    const k = b.parentElement.dataset.k, v = b.dataset.v
    if (k === 'preset') { st.preset = v; if (v !== 'auto') for (const o of Object.keys(OPTS)) st[o] = v }
    else if (k === 'fps' || k === 'sound') st[k] = v === 'on'
    else if (k === 'music' || k === 'amb') st[k] = v
    else {
      st[k] = v
      const ks = Object.keys(OPTS)
      st.preset = ks.every((o) => st[o] === st[ks[0]]) ? st[ks[0]] : 'custom'
    }
    save(); apply(); render()
  })
  el.addEventListener('input', (e) => {
    if (e.target.type !== 'range') return
    st.sens = +e.target.value; e.target.nextElementSibling.textContent = st.sens.toFixed(1)
    save(); apply()
  })
  render(); apply()
  return { el, tick, auto, get state() { return st } }
}
