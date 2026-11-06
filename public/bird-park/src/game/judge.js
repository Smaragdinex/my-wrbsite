// 老闆評照片：價錢由遊戲算的客觀數據定（公平、穩定），評語先用寫好的規則；
// 之後換成本地 LLM（看照片＋這些數據講評，價錢在估價上下 20% 內調整）
import { t as tr, LANG } from '../i18n.js'
const pick = (a) => tr(a[Math.floor(Math.random() * a.length)])

export function ruleJudge(p) {
  const s = p.subject, lines = []
  if (p.score >= 85) lines.push(pick(['這張可以掛在店裡了！', '漂亮，構圖、對焦都到位。', '少見的好照片，我出高一點。']))
  else if (p.score >= 70) lines.push(pick(['拍得不錯。', '還行，可以收。', '這張有水準。']))
  else lines.push(pick(['普普通通，只能算你便宜。', '勉強收，下次拍好一點。', '這張……我只能算你便宜一點。']))
  if ((s.focusSharp ?? s.sharp) < 0.5) lines.push(tr('焦點跑掉了，鳥是糊的。'))
  else if (p.notes.includes(tr('手震，快門太慢'))) lines.push(tr('手抖了，整張都糊，快門要快一點。'))
  else if (p.notes.includes(tr('鳥在動，快門不夠快'))) lines.push(tr('鳥在動、快門太慢，拖出殘影了。'))
  if (p.notes.includes(tr('曝光過度，太亮'))) lines.push(tr('太亮了，白的地方都沒細節。'))
  if (p.notes.includes(tr('曝光不足，太暗'))) lines.push(tr('有點暗，看不太清楚。'))
  if (p.notes.includes(tr('雜訊很多'))) lines.push(tr('顆粒好粗，ISO 太高了吧。'))
  if (s.visible < 0.6) lines.push(tr('前面有東西擋住。'))
  if (s.inside < 0.85) lines.push(tr('鳥被切到了，留點空間。'))
  if (s.area < 0.006) lines.push(tr('鳥太小了，換支長一點的鏡頭吧。'))
  if (s.act === 'dive') lines.push(tr('入水那一瞬間！很難抓到。'))
  else if (s.act === 'strike' || s.act === 'worm') lines.push(tr('捕食的瞬間，好。'))
  else if (s.act === 'takeoff') lines.push(pick(['起飛那一下被你抓到了！', '翅膀剛張開，難得。']))
  else if (s.act === 'land') lines.push(tr('降落前翅膀張開的樣子，漂亮。'))
  else if (s.act === 'fly') lines.push(pick(['飛行中的鳥能拍清楚，不簡單。', '飛起來的樣子，客人喜歡。']))
  else if (s.act === 'run') lines.push(tr('牠在跑，你還跟得上。'))
  if (['mikado', 'bluemagpie', 'kingfisher', 'spoonbill', 'pheasant'].includes(s.id) && p.score >= 50) lines.push(tr('{name}啊，客人很愛這種。', { name: s.name }))
  return { price: p.price, comment: lines.join(LANG === 'zh' ? '' : ' ') }
}

// ---------- 本地 LLM（Qwen2.5-1.5B-Instruct，WebLLM，在 Web Worker 裡用 WebGPU 跑）----------
// 模型約 1 GB，第一次下載後瀏覽器會快取；之後包 Steam 版時改成放在遊戲資料夾裡。實測 Apple M 系列：載入 30 秒、每則評語 1～1.5 秒。
// （之前試過 transformers.js＋0.5B：這台 Mac 的 WebGPU 會算錯、CPU 一張 20 秒、評語也不穩，所以換成 WebLLM＋1.5B）
// 老闆看的是遊戲量出來的數據（鳥種、大小、對焦、遮擋、動作），用台灣老闆的口氣講評，最後給 80～120 的百分比調整估價。
const WEBLLM = 'https://cdn.jsdelivr.net/npm/@mlc-ai/web-llm@0.2.79/lib/index.js'
export const llm = { status: 'idle', progress: 0, device: '', model: '' }
let engine = null, loading = null

export function loadLLM(onUpdate) {
  loading ??= (async () => {
    if (!navigator.gpu) throw new Error('這個瀏覽器沒有 WebGPU')
    const adapter = await navigator.gpu.requestAdapter()
    if (!adapter) throw new Error('沒有可用的顯示卡')
    // 顯示卡支援半精度就用 f16 版（小、快），不支援用 f32 版
    const model = `Qwen2.5-1.5B-Instruct-${adapter.features.has('shader-f16') ? 'q4f16_1' : 'q4f32_1'}-MLC`
    llm.status = 'loading'; llm.model = model; onUpdate?.()
    const W = await import(WEBLLM)
    const worker = new Worker(new URL('./judge-worker.js' + new URL(import.meta.url).search, import.meta.url), { type: 'module' })
    engine = await W.CreateWebWorkerMLCEngine(worker, model, { initProgressCallback: (r) => { llm.progress = r.progress; onUpdate?.() } })
    llm.status = 'ready'; llm.device = 'webgpu'; onUpdate?.()
  })().catch((e) => { console.warn('[judge] AI 老闆沒辦法啟動，改用寫好的評語：', e?.message ?? e); llm.status = 'failed'; engine = null; onUpdate?.() })
  return loading
}
const ask = async (messages, opts) => {
  const r = await engine.chat.completions.create({ messages, ...opts })
  return r.choices[0].message.content
}

// 小模型偶爾冒出簡體字：常見的幾個換成繁體（只換不會有歧義的）
const S2T = { 这: '這', 个: '個', 张: '張', 对: '對', 过: '過', 还: '還', 没: '沒', 头: '頭', 鸟: '鳥', 鲜: '鮮', 画: '畫', 准: '準', 种: '種', 拍摄: '拍攝', 镜: '鏡', 稀: '稀', 么: '麼', 们: '們', 时: '時', 会: '會', 让: '讓', 说: '說', 点: '點', 远: '遠', 观: '觀', 动: '動', 当: '當', 实: '實', 质: '質', 价: '價', 钱: '錢', 卖: '賣', 买: '買', 难: '難', 应: '應', 该: '該', 话: '話', 后: '後', 为: '為', 处: '處', 体: '體' }
const toTrad = (t) => t.replace(/拍摄|[这个张对过还没头鸟鲜画准种镜么们时会让说点远观动当实质价钱卖买难应该话后为处体]/g, (c) => S2T[c] ?? c).replace(/這只/g, '這隻')
// 稀有度（評語和圖鑑用）
export const RARITY = { yellowtit: '非常稀有', flamecrest: '稀有', rosefinch: '不常見', niltava: '不常見', mikado: '非常稀有', spoonbill: '非常稀有', pheasant: '稀有', oriole: '稀有', thrush: '不常見', bluemagpie: '稀有', kingfisher: '稀有', babbler: '不常見', waterhen: '普通', sparrow: '很常見', dove: '很常見', bulbul: '很常見' }
const pct = (x) => `${Math.round(x * 100)}%`
function facts(p) {
  const s = p.subject
  const rare = tr(RARITY[s.id] ?? '普通')
  return [
    tr('鳥：{name}（{rare}）', { name: s.name, rare }),
    tr('遊戲評分：{n} 分（100 分是好照片的標準，超過 100 是難得的瞬間）', { n: p.score }),
    tr('鳥在畫面裡的大小：佔 {pct}', { pct: pct(s.area) }),
    tr('對焦：{v}', { v: tr(s.sharp > 0.8 ? '清楚' : s.sharp > 0.4 ? '有點糊' : '糊掉了') }),
    tr('遮擋：{v}', { v: tr(s.visible > 0.9 ? '沒有' : s.visible > 0.6 ? '有一點被擋' : '被擋住很多') }),
    tr(s.inside < 0.85 ? '鳥有被畫面切到' : '鳥完整在畫面裡'),
    p.notes.length ? tr('其他：{v}', { v: p.notes.join(tr('、')) }) : '',
    tr('用的鏡頭：{lens}，{f}mm', { lens: p.lens, f: p.focal }),
    p.exif ? tr('相機設定：f/{N}、快門 {t}、ISO {iso}', { N: p.exif.N, t: p.exif.t >= 0.5 ? tr('{n} 秒', { n: p.exif.t }) : '1/' + Math.round(1 / p.exif.t), iso: p.exif.iso }) : '',
  ].filter(Boolean).join('\n')
}
// 其他語言：整段換成那個語言的版本（語言檔裡用這段中文當 key）
const SYSTEM = tr(`你是溫室生態園門口「相機行」的老闆，專門收購遊客拍的鳥照片。你講話像台灣的老闆：親切、直接、有點幽默。
一定要用繁體中文（台灣用字），不要用簡體字。評語一到兩句，30 字以內，要具體講到這張照片的優點或缺點；照片沒有缺點就不要硬挑毛病、不要說「可惜」。
最後一行寫「價格：」加一個 80 到 120 的整數，代表你願意出估價的百分之幾（拍得好給高、有明顯缺點給低）。`)
const EXAMPLE = [
  { role: 'user', content: tr('鳥：翠鳥（稀有）\n遊戲評分：88 分（滿分 100）\n鳥在畫面裡的大小：佔 21%\n對焦：清楚\n遮擋：沒有\n鳥完整在畫面裡\n其他：入水的瞬間\n用的鏡頭：150–600mm 超望遠，420mm') },
  { role: 'assistant', content: tr('哇，入水那一下被你抓到了，水花都清清楚楚！這張我收。\n價格：118') },
  { role: 'user', content: tr('鳥：麻雀（很常見）\n遊戲評分：34 分（滿分 100）\n鳥在畫面裡的大小：佔 1%\n對焦：有點糊\n遮擋：有一點被擋\n鳥完整在畫面裡\n用的鏡頭：18–55mm 標準變焦，30mm') },
  { role: 'assistant', content: tr('麻雀小小一隻還有點糊，下次靠近一點、換支長鏡頭吧。\n價格：85') },
]

export async function judgePhoto(p) {
  const base = ruleJudge(p)
  if (llm.status !== 'ready') return { ...base, by: 'rule' }
  try {
    // 稍微有一點隨機（同樣的照片不會每次講一樣的話）
    const text = (await ask([{ role: 'system', content: SYSTEM }, ...EXAMPLE, { role: 'user', content: facts(p) }], { max_tokens: 70, temperature: 0.6, top_p: 0.9 })).trim()
    if (/(.{4,})\1\1/s.test(text) || !text) throw new Error('模型輸出重複：' + text)
    const m = text.match(new RegExp(`(?:價格|${tr('價格')})\\s*[:：]\\s*(\\d{2,3})`, 'i'))
    const k = Math.min(120, Math.max(80, m ? +m[1] : 100))
    const body = text.replace(new RegExp(`\\n?(?:價格|${tr('價格')})\\s*[:：].*$`, 'si'), '').trim()
    const comment = (LANG === 'zh' ? toTrad(body) : body).slice(0, LANG === 'zh' ? 80 : 200) || base.comment
    return { price: Math.round(p.price * k / 100 / 5) * 5, comment, by: 'llm', pct: k }
  } catch (e) {
    console.warn('[judge] LLM 出錯，改用寫好的評語', e)
    return { ...base, by: 'rule' }
  }
}
// 除錯：直接丟訊息給模型
export const rawGen = (msgs, opts = { max_tokens: 60, temperature: 0 }) => engine ? ask(msgs, opts) : Promise.resolve('(no model)')
