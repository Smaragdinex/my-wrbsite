// 老闆評照片：價錢由遊戲算的客觀數據定（公平、穩定），評語先用寫好的規則；
// 之後換成本地 LLM（看照片＋這些數據講評，價錢在估價上下 20% 內調整）
const pick = (a) => a[Math.floor(Math.random() * a.length)]

export function ruleJudge(p) {
  const s = p.subject, lines = []
  if (p.score >= 85) lines.push(pick(['這張可以掛在店裡了！', '漂亮，構圖、對焦都到位。', '少見的好照片，我出高一點。']))
  else if (p.score >= 60) lines.push(pick(['拍得不錯。', '還行，可以收。', '這張有水準。']))
  else if (p.score >= 30) lines.push(pick(['普普通通。', '可以再好一點。', '勉強收。']))
  else lines.push(pick(['這張……我只能算你便宜一點。', '下次再靠近一點吧。']))
  if (s.sharp < 0.5) lines.push('焦點跑掉了，鳥是糊的。')
  if (s.visible < 0.6) lines.push('前面有東西擋住。')
  if (s.inside < 0.85) lines.push('鳥被切到了，留點空間。')
  if (s.area < 0.006) lines.push('鳥太小了，換支長一點的鏡頭吧。')
  if (s.act === 'dive') lines.push('入水那一瞬間！很難抓到。')
  else if (s.act === 'strike' || s.act === 'worm') lines.push('捕食的瞬間，好。')
  if (['mikado', 'bluemagpie', 'kingfisher'].includes(s.id) && p.score >= 50) lines.push(`${s.name}啊，客人很愛這種。`)
  return { price: p.price, comment: lines.join('') }
}

// ---------- 本地 LLM（Qwen2.5-0.5B-Instruct，transformers.js，在 Web Worker 裡跑）----------
// 模型約 480 MB（顯示卡版）／790 MB（CPU 版），第一次下載後瀏覽器會快取；之後包 Steam 版時改成放在遊戲資料夾裡。
// 老闆看的是遊戲量出來的數據（鳥種、大小、對焦、遮擋、動作），用台灣老闆的口氣講評，最後給 80～120 的百分比調整估價。
export const llm = { status: 'idle', progress: 0, device: '' }
let worker = null, loading = null, nextId = 1
const waiting = new Map()

// prefer：網址 ?llm=wasm 強制用 CPU（測試用）
export function loadLLM(onUpdate, prefer = new URLSearchParams(location.search).get('llm')) {
  loading ??= new Promise((resolve) => {
    llm.status = 'loading'; onUpdate?.()
    worker = new Worker(new URL('./judge-worker.js' + new URL(import.meta.url).search, import.meta.url), { type: 'module' })
    worker.onmessage = (e) => {
      const m = e.data
      if (m.type === 'progress') { llm.progress = m.p; onUpdate?.() }
      else if (m.type === 'log') console.warn('[judge]', m.msg)
      else if (m.type === 'ready') { llm.status = 'ready'; llm.device = m.device; onUpdate?.(); resolve(true) }
      else if (m.type === 'failed') { console.warn('[judge] LLM 載入失敗，改用寫好的評語', m.msg); llm.status = 'failed'; onUpdate?.(); resolve(false) }
      else if (m.type === 'out') { waiting.get(m.id)?.(m); waiting.delete(m.id) }
    }
    worker.onerror = (e) => { console.warn('[judge] worker 出錯', e.message); llm.status = 'failed'; onUpdate?.(); resolve(false) }
    worker.postMessage({ type: 'load', prefer, test: [{ role: 'system', content: SYSTEM }, ...EXAMPLE, { role: 'user', content: TEST }] })
  })
  return loading
}
const ask = (msgs, opts) => new Promise((res) => { const id = nextId++; waiting.set(id, res); worker.postMessage({ type: 'gen', id, msgs, opts }) })

const pct = (x) => `${Math.round(x * 100)}%`
function facts(p) {
  const s = p.subject
  const rare = { mikado: '非常稀有', bluemagpie: '稀有', kingfisher: '稀有', babbler: '不常見', waterhen: '普通', sparrow: '很常見', dove: '很常見', bulbul: '很常見' }[s.id] ?? '普通'
  return [
    `鳥：${s.name}（${rare}）`,
    `遊戲評分：${p.score} 分（滿分 100）`,
    `鳥在畫面裡的大小：佔 ${pct(s.area)}`,
    `對焦：${s.sharp > 0.8 ? '清楚' : s.sharp > 0.4 ? '有點糊' : '糊掉了'}`,
    `遮擋：${s.visible > 0.9 ? '沒有' : s.visible > 0.6 ? '有一點被擋' : '被擋住很多'}`,
    s.inside < 0.85 ? '鳥有被畫面切到' : '鳥完整在畫面裡',
    p.notes.length ? `其他：${p.notes.join('、')}` : '',
    `用的鏡頭：${p.lens}，${p.focal}mm`,
  ].filter(Boolean).join('\n')
}
const SYSTEM = `你是溫室生態園門口「相機行」的老闆，專門收購遊客拍的鳥照片。你講話像台灣的老闆：親切、直接、有點幽默。
一定要用繁體中文（台灣用字），不要用簡體字。評語一到兩句，30 字以內，要具體講到這張照片的優點或缺點。
最後一行寫「價格：」加一個 80 到 120 的整數，代表你願意出估價的百分之幾（拍得好給高、有明顯缺點給低）。`
// 載入時拿來測顯示卡算得對不對的題目
const TEST = '鳥：帝雉（非常稀有）\n遊戲評分：80 分（滿分 100）\n鳥在畫面裡的大小：佔 15%\n對焦：清楚\n遮擋：沒有\n鳥完整在畫面裡\n其他：低頭覓食\n用的鏡頭：18–55mm 標準變焦，40mm'
const EXAMPLE = [
  { role: 'user', content: '鳥：翠鳥（稀有）\n遊戲評分：88 分（滿分 100）\n鳥在畫面裡的大小：佔 21%\n對焦：清楚\n遮擋：沒有\n鳥完整在畫面裡\n其他：入水的瞬間\n用的鏡頭：150–600mm 超望遠，420mm' },
  { role: 'assistant', content: '哇，入水那一下被你抓到了，水花都清清楚楚！這張我收。\n價格：118' },
  { role: 'user', content: '鳥：麻雀（很常見）\n遊戲評分：34 分（滿分 100）\n鳥在畫面裡的大小：佔 1%\n對焦：有點糊\n遮擋：有一點被擋\n鳥完整在畫面裡\n用的鏡頭：18–55mm 標準變焦，30mm' },
  { role: 'assistant', content: '麻雀小小一隻還有點糊，下次靠近一點、換支長鏡頭吧。\n價格：85' },
]

export async function judgePhoto(p) {
  const base = ruleJudge(p)
  if (llm.status !== 'ready') return { ...base, by: 'rule' }
  try {
    // 稍微有一點隨機（同樣的照片不會每次講一樣的話），但不要太大，小模型溫度高容易亂講
    const out = await ask([{ role: 'system', content: SYSTEM }, ...EXAMPLE, { role: 'user', content: facts(p) }], { max_new_tokens: 60, do_sample: true, temperature: 0.4, top_p: 0.85, repetition_penalty: 1.15 })
    if (out.error) throw new Error(out.error)
    const text = out.text.trim()
    if (/(.{4,})\1\1/s.test(text) || !text) throw new Error('模型輸出重複：' + text)
    const m = text.match(/價格[:：]\s*(\d{2,3})/)
    // 小模型的判斷不太穩：價錢最多只讓它在估價上下 10% 內調整
    const k = Math.min(110, Math.max(90, m ? +m[1] : 100))
    const comment = text.replace(/\n?價格[:：].*$/s, '').trim().slice(0, 80) || base.comment
    return { price: Math.round(p.price * k / 100 / 5) * 5, comment, by: 'llm', pct: k }
  } catch (e) {
    console.warn('[judge] LLM 出錯，改用寫好的評語', e)
    return { ...base, by: 'rule' }
  }
}
// 除錯：直接丟訊息給模型
export const rawGen = (msgs, opts = { max_new_tokens: 60, do_sample: false }) => ask(msgs, opts).then((o) => o.text ?? o.error)
