// 設定：畫質（高／中／低三個預設，也可以一項一項調）、滑鼠靈敏度、顯示 FPS。存在 localStorage。
// 瀏覽器測不出玩家的顯卡，所以預設給「高」（手機「低」），玩的時候一直很卡（低於 30 FPS 幾秒）就提示去設定降畫質。
// 每一項都可以馬上套用，不用重新載入：
//   解析度＝renderer 的 pixelRatio；陰影＝太陽陰影貼圖大小；倒影＝水面倒影的解析度／幾格更新一次；路燈＝晚上同時亮幾盞真的點光源
import { PHONE } from '../world.js'

const KEY = 'birdpark.settings'
const DPR = window.devicePixelRatio || 1
const OPTS = {
  res: { label: '解析度', hint: '畫面清晰度，最吃顯卡', items: { high: ['高', Math.min(DPR, 2)], mid: ['中', Math.min(DPR, 1.25)], low: ['低', Math.min(DPR, 1) * 0.8] } },
  shadow: { label: '陰影', hint: '樹影、人影的細緻度', items: { high: ['高', 4096], mid: ['中', 2048], low: ['低', 1024] } },
  reflect: { label: '水面倒影', hint: '水池倒影的清晰度', items: { high: ['高', [0.5, 2]], mid: ['中', [0.35, 3]], low: ['低', [0.2, 4]] } },
  lights: { label: '夜晚路燈光源', hint: '晚上同時照亮四周的路燈數', items: { high: ['高', 8], mid: ['中', 6], low: ['低', 4] } },
}
const PRESETS = { high: '高', mid: '中', low: '低' }
const DEFAULT = { preset: PHONE ? 'low' : 'high', sens: 1, fps: false, sound: true, music: 'mid', amb: 'high' }
const LEVELS = { off: '關', low: '小', mid: '中', high: '大' }

export function createSettings({ world, player }) {
  const { renderer, sun } = world
  let st
  try { st = { ...DEFAULT, ...JSON.parse(localStorage.getItem(KEY) || '{}') } } catch { st = { ...DEFAULT } }
  for (const k of Object.keys(OPTS)) if (!OPTS[k].items[st[k]]) st[k] = st.preset === 'custom' ? 'high' : st.preset
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(st)) } catch {} }

  function apply() {
    const val = (k) => OPTS[k].items[st[k]][1]
    if (Math.abs(renderer.getPixelRatio() - val('res')) > 1e-3) renderer.setPixelRatio(val('res'))
    if (sun.shadow.mapSize.x !== val('shadow')) {
      sun.shadow.mapSize.setScalar(val('shadow'))
      sun.shadow.map?.dispose(); sun.shadow.map = null   // 下一格用新的大小重建
    }
    ;[world.quality.reflScale, world.quality.reflEvery] = val('reflect')
    world.time.lights.forEach((l, i) => { l.visible = i < val('lights') })   // 最近的燈排在前面，關後面的
    player.controls.pointerSpeed = st.sens
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
    acc += dt; n++
    if (acc < 0.5) return
    const fps = n / acc; acc = 0; n = 0
    fpsEl.textContent = `${Math.round(fps)} FPS`
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

  /* ---------- 設定畫面 ---------- */
  const el = document.createElement('div')
  el.className = 'panel menu-sheet settings'
  el.hidden = true
  const seg = (name, items, cur) => `<div class="seg" data-k="${name}">${Object.entries(items).map(([k, v]) =>
    `<button data-v="${k}" class="${k === cur ? 'on' : ''}">${Array.isArray(v) ? v[0] : v}</button>`).join('')}</div>`
  function render() {
    el.innerHTML = `<h2>設定</h2>
      <h3>畫質</h3>
      <div class="row main"><div><b>整體畫質</b><small>電腦跑不順就調低${st.preset === 'custom' ? '（目前是自訂）' : ''}</small></div>${seg('preset', PRESETS, st.preset)}</div>
      ${Object.entries(OPTS).map(([k, o]) => `<div class="row"><div><b>${o.label}</b><small>${o.hint}</small></div>${seg(k, o.items, st[k])}</div>`).join('')}
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
    if (k === 'preset') { st.preset = v; for (const o of Object.keys(OPTS)) st[o] = v }
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
  return { el, tick, get state() { return st } }
}
