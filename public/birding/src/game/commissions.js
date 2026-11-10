// 老闆委託（2026-11-09）：主線一次一個、照順序帶玩家從花園走到山上的巨木林；另外每天清晨（6 點）換 3 個隨機委託。
// 自由拍照照舊：任何照片都照原本的價錢賣；符合委託的那一張，老闆除了照片錢再多給委託獎金（一張照片只算一個委託）。
// 條件：bird 鳥種（null＝哪種鳥都可以）、min 最低分數、act 動作（下面 ACTS 的分類）、when 時段、wet 下雨
import { t as tr, birdName } from '../i18n.js'
import { ESCAPE } from './flight.js'
import { VALUE } from './scoring.js'
import { BIRDS } from '../birdinfo.js'

const nameOf = (id) => birdName(id, BIRDS.find((b) => b.id === id)?.name ?? id)

// 動作分類（scoring 的 act 名稱）
const ACTS = {
  flight: { acts: ['fly', 'takeoff', 'land'], label: '飛行中（起飛、降落也算）' },
  dive: { acts: ['dive'], label: '入水的瞬間' },
  strike: { acts: ['strike'], label: '出手捕食' },
  worm: { acts: ['worm'], label: '叼著蚯蚓' },
  fish: { acts: ['beat', 'gulp'], label: '叼著魚' },
  run: { acts: ['run'], label: '跑起來的樣子' },
}
// 時段（跟右上角時鐘一樣的分法）
const WHEN = {
  dawn: { label: '清晨', test: (h) => h >= 5 && h < 7 },
  day: { label: '白天', test: (h) => h >= 7 && h < 16 },
  dusk: { label: '黃昏', test: (h) => h >= 16 && h < 18.5 },
  night: { label: '夜晚', test: (h) => h >= 18.5 || h < 5 },
}

// 主線：老闆的話＋條件＋獎金
const MAIN = [
  { id: 'm1', bird: 'sparrow', min: 60, reward: 150, say: '先讓我看看你的本事。麻雀到處都有，拍一張像樣的來。' },
  { id: 'm2', bird: 'whiteeye', min: 70, reward: 250, say: '綠繡眼很小、又一直動，對焦要快。' },
  { id: 'm3', bird: 'egret', act: 'strike', min: 60, reward: 600, say: '池塘的小白鷺出手很快，我要牠啄下去那一瞬間。' },
  { id: 'm4', bird: 'kingfisher', act: 'dive', min: 60, reward: 1200, say: '翠鳥入水的照片，客人出多少錢都想要。耐心等牠盯著水面。' },
  { id: 'm5', bird: null, act: 'flight', min: 70, reward: 500, say: '停著的照片我看多了。拍一隻在飛的鳥，什麼鳥都可以。' },
  { id: 'm6', bird: 'nightheron', when: 'dusk', min: 60, reward: 700, say: '夜鷺天快黑才出來活動。黃昏去池邊等牠。' },
  { id: 'm7', bird: 'mikado', min: 70, reward: 1000, say: '該上山了。過了森林入口，帝雉在針葉林邊散步，牠不太怕人。' },
  { id: 'm8', bird: 'bluemagpie', act: 'flight', min: 60, reward: 900, say: '台灣藍鵲拖著長尾巴飛過去的樣子，那才叫漂亮。' },
  { id: 'm9', bird: 'flamecrest', min: 75, reward: 1500, say: '火冠戴菊是台灣最小的鳥，住在南坡冷杉林最裡面。拍清楚給我。' },
  { id: 'm10', bird: 'woodowl', when: 'night', min: 60, reward: 1500, say: '褐林鴞晚上才醒。帶好機身，夜裡去溪谷旁的森林找。' },
  { id: 'm11', bird: 'goshawk', act: 'flight', min: 60, reward: 2000, say: '鳳頭蒼鷹起飛的時候翅膀全開。這張拍到，你就是真正的鳥類攝影師了。' },
  { id: 'm12', bird: null, min: 100, reward: 3000, say: '最後一個：拿一張 100 分以上的照片來。什麼鳥都行，我要看到最好的那一刻。' },
]

// 照片符不符合這個委託
export function matches(c, p) {
  const s = p.subject
  if (!c || !s || p.sold) return false
  if (c.bird && s.id !== c.bird) return false
  if ((p.score ?? 0) < c.min) return false
  if (c.act && !ACTS[c.act].acts.includes(s.act)) return false
  if (c.when && !(p.hour != null && WHEN[c.when].test(p.hour))) return false
  if (c.wet && !((p.rain ?? 0) > 0.3)) return false
  return true
}

// 條件寫成一句話：「綠繡眼・70 分以上・飛行中」
export function condText(c) {
  const parts = [c.bird ? nameOf(c.bird) : tr('任何鳥')]
  parts.push(tr('{n} 分以上', { n: c.min }))
  if (c.act) parts.push(tr(ACTS[c.act].label))
  if (c.when) parts.push(tr(WHEN[c.when].label))
  if (c.wet) parts.push(tr('下雨天'))
  return parts.join('・')
}

// 每日委託：從玩家拍過的鳥（加上門口幾種常見鳥）挑，保證做得到
const EASY = ['sparrow', 'dove', 'bulbul', 'whiteeye', 'egret', 'heron', 'moorhen']
const OWLS = ['woodowl', 'grassowl', 'scopsowl', 'mtscops']
function rollDaily(seen, rnd) {
  const pool = [...new Set([...EASY, ...seen])].filter((id) => VALUE[id])
  const pick = (a) => a[Math.floor(rnd() * a.length)]
  const out = [], used = new Set()
  const kinds = ['score', 'flight', 'when', 'wet', 'score'].sort(() => rnd() - 0.5)
  for (const kind of kinds) {
    if (out.length >= 3) break
    let c = null
    if (kind === 'score') { const b = pick(pool); c = { bird: b, min: pick([75, 80, 85, 90]) } }
    // 飛行：用跑的、用游的鳥很少真的飛起來，不出
    else if (kind === 'flight') { const fl = pool.filter((id) => ESCAPE[id]?.fly?.k && !ESCAPE[id].run && !ESCAPE[id].swim); if (fl.length) c = { bird: pick(fl), act: 'flight', min: 60 } }
    else if (kind === 'when') { const b = pick(pool); c = { bird: b, when: OWLS.includes(b) ? 'night' : pick(['dawn', 'dusk']), min: 65 } }
    else if (kind === 'wet') c = { bird: null, wet: true, min: 75 }
    if (!c || used.has(c.bird ?? '*')) continue
    used.add(c.bird ?? '*')
    // 獎金：鳥越貴、條件越難給越多（大約是那種鳥 100 分照片的一半～兩倍）
    const base = (VALUE[c.bird] ?? 120) * 3
    const hard = 0.5 + (c.min - 60) / 40 + (c.act ? 0.6 : 0) + (c.when ? 0.4 : 0) + (c.wet ? 0.3 : 0)
    c.reward = Math.max(100, Math.round(base * hard / 50) * 50)
    c.id = 'd' + out.length
    out.push(c)
  }
  return out
}

// state.comm = { main: 下一個主線的 index, day: 第幾天, daily: [...], done: [今天做完的每日 id] }
export function createCommissions(state, { onChange } = {}) {
  const cs = (state.comm ??= { main: 0, day: 1, daily: [], done: [] })
  const seedRnd = (n) => () => ((n = (n * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff)
  if (!cs.daily.length) cs.daily = rollDaily(state.seen ?? [], seedRnd(cs.day * 7919 + Date.now() % 997))
  let lastHour = null
  const mainC = () => MAIN[cs.main] ?? null
  // 現在接著的委託（主線在前、每日照獎金高到低）
  function active() {
    const out = []
    const m = mainC(); if (m) out.push({ ...m, kind: 'main' })
    for (const d of cs.daily) if (!cs.done.includes(d.id)) out.push({ ...d, kind: 'daily' })
    return out
  }
  // 這張照片符合哪一個（獎金最高的那個）
  function matchFor(p) {
    return active().filter((c) => matches(c, p)).sort((a, b) => b.reward - a.reward)[0] ?? null
  }
  // 賣掉時結算：回傳完成的委託（或 null）
  function complete(c) {
    if (c.kind === 'main') cs.main++
    else cs.done.push(c.id)
    onChange?.()
  }
  // 每幀叫：過了清晨 6 點就換一天、換新的每日委託
  function tickHour(h) {
    if (lastHour != null && ((lastHour < 6 && h >= 6) || (lastHour > h && h >= 6))) {
      cs.day++; cs.done = []
      cs.daily = rollDaily(state.seen ?? [], seedRnd(cs.day * 7919 + Date.now() % 997))
      onChange?.('day')
    }
    lastHour = h
  }
  return {
    active, matchFor, complete, tickHour, condText,
    get main() { return mainC() }, get mainIndex() { return cs.main }, get mainTotal() { return MAIN.length },
    get daily() { return cs.daily.map((d) => ({ ...d, kind: 'daily', done: cs.done.includes(d.id) })) },
    get day() { return cs.day },
  }
}
