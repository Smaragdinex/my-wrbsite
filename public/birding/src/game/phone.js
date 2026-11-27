// 2026-11-27 打電話問老闆鳥在哪（使用者：「讓老闆 你可以打電話問他 鳥哪裡找到 用語音的方式」）
// P：撥給老闆 Tom（2026-11-27 使用者：「給老闆一個名字 不要相機行 那叫Tom」）→ 響兩聲接起來 → 聽玩家講一句（瀏覽器的語音辨識；沒有就改打字）→ 老闆用語音回答（瀏覽器的語音合成）
// 老闆講的內容全部來自遊戲資料，不讓模型自己想：
//   這隻鳥今天有沒有來（presence 的每日名單）、現在是不是牠活動的時段、牠在哪一區、離玩家多遠、在玩家的哪個方向（照玩家現在面對的方向講「右前方」）
//   AI 老闆（本機 Gemma，有載入的話）只負責把這些事實講成口語；講出來的話少了地名或距離就不用，改用寫好的句子
// 問法：問某一種鳥（「黑面琵鷺在哪」）、問推薦（「附近有什麼好拍的」「有什麼稀有的」）
import * as THREE from 'three'
import { t as tr, LANG, birdText } from '../i18n.js'
import { LOBES, lobeSweep, savK, deltaK } from '../layout.js'
import { forestK } from '../giants.js'
import { RARITY, llm, rawGen } from './judge.js'

const L = (o) => o[LANG] ?? o.en
// ---------- 分區（老闆講地名用；北＝+z、東＝+x，但玩家沒有指南針，方向一律照玩家面對的方向講）----------
const REGION = {
  delta: { zh: '非洲那邊的奧卡萬戈三角洲', en: 'the Okavango Delta in the Africa area', ko: '아프리카 구역의 오카방고 삼각주', ja: 'アフリカエリアのオカバンゴ・デルタ' },
  savanna: { zh: '非洲稀樹草原', en: 'the African savanna', ko: '아프리카 사바나', ja: 'アフリカのサバンナ' },
  lagoon: { zh: '夕陽潟湖', en: 'Sunset Lagoon', ko: '석양 석호', ja: '夕陽ラグーン' },
  marsh: { zh: '翡翠沼澤', en: 'Emerald Marsh', ko: '에메랄드 습지', ja: 'エメラルド湿地' },
  meadow: { zh: '北邊的大草原', en: 'the big meadow', ko: '큰 초원', ja: '大きな草原' },
  redwoods: { zh: '紅杉巨木林', en: 'the giant redwood forest', ko: '거대 삼나무 숲', ja: 'セコイアの巨木の森' },
  gorge: { zh: '瀑布峽谷', en: 'the waterfall gorge', ko: '폭포 협곡', ja: '滝の峡谷' },
  garden: { zh: '入口花園', en: 'the entrance garden', ko: '입구 정원', ja: '入口の庭園' },
  lotus: { zh: '荷花湖', en: 'the lotus lake', ko: '연꽃 호수', ja: 'ハスの池' },
  alpine: { zh: '高山上', en: 'up in the high mountains', ko: '높은 산 위', ja: '高い山の上' },
  lowforest: { zh: '低海拔的闊葉林', en: 'the lowland forest', ko: '저지대 활엽수림', ja: '低地の広葉樹林' },
  midforest: { zh: '山區的森林', en: 'the mountain forest', ko: '산림 지대', ja: '山の森' },
}
// 棲地說明（birdinfo 的 where）本身就寫了地名（「翡翠沼澤的紙莎草角落」）→ 不再加分區名稱，免得講兩次、或兩個地名對不上
const PLACE_WORD = /潟湖|沼澤|草原|三角洲|峽谷|瀑布|花園|荷花|紅杉|高山|山頂|溪|lagoon|marsh|savanna|delta|gorge|waterfall|garden|lotus|redwood|alpine|summit|stream|석호|습지|사바나|삼각주|협곡|폭포|정원|ラグーン|湿地|サバンナ|デルタ|峡谷|滝|庭園/i
export function regionOf(x, y, z) {
  if (savK(x, z) > 0.3) return deltaK(x, z) > 0.3 ? 'delta' : 'savanna'
  { const lb = [['lagoon', LOBES.lagoon], ['marsh', LOBES.wet], ['meadow', LOBES.grass]].map(([k, o]) => [k, Math.hypot((x - o.x) / o.rx, (z - o.z) / o.rz)]).sort((a, b) => a[1] - b[1])[0]
    if (lb[1] < 1.05) return lb[0] }   // 兩塊濕地的橢圓有重疊：取比較近的那塊
  if (Math.hypot(x, z) < 45) return 'garden'
  if (x > 70 && x < 140 && z > -75 && z < -10) return 'lotus'
  if (x > 158 && x < 280 && z > 50 && z < 140) return 'gorge'
  if (forestK(x, z) > 0.5) return 'redwoods'
  if (y > 48) return 'alpine'
  return x < 135 ? 'lowforest' : 'midforest'
}
// 玩家面對的方向 → 八個方位
const DIRS = {
  zh: ['正前方', '右前方', '右手邊', '右後方', '後面', '左後方', '左手邊', '左前方'],
  en: ['straight ahead of you', 'ahead to your right', 'to your right', 'behind you on the right', 'behind you', 'behind you on the left', 'to your left', 'ahead to your left'],
  ko: ['바로 앞쪽', '오른쪽 앞', '오른쪽', '오른쪽 뒤', '뒤쪽', '왼쪽 뒤', '왼쪽', '왼쪽 앞'],
  ja: ['正面', '右前', '右手', '右後ろ', '後ろ', '左後ろ', '左手', '左前'],
}
function relDir(camera, tx, tz) {
  const f = camera.getWorldDirection(new THREE.Vector3()); f.y = 0; f.normalize()
  const dx = tx - camera.position.x, dz = tz - camera.position.z
  const ang = Math.atan2(f.x * dz - f.z * dx, f.x * dx + f.z * dz)   // 右手為正（three.js：y 朝上、右手座標）
  const i = ((Math.round(-ang / (Math.PI / 4)) % 8) + 8) % 8
  return L(DIRS)[i]
}
const roundDist = (d) => d < 60 ? Math.max(10, Math.round(d / 10) * 10) : d < 400 ? Math.round(d / 50) * 50 : Math.round(d / 100) * 100
const RARE = (id) => RARITY[id] ?? '普通'
const isRare = (id) => /稀有/.test(RARE(id))

// ---------- 聽懂玩家問什麼 ----------
const norm = (s) => s.toLowerCase().replace(/[\s,.?!，。？！、'’"「」-]/g, '')
function lcs(a, b) { let best = 0; for (let i = 0; i < a.length; i++) for (let j = 0; j < b.length; j++) { let k = 0; while (a[i + k] && a[i + k] === b[j + k]) k++; if (k > best) best = k } return best }
function findBird(text, birds) {
  const q = norm(text); let best = null, bs = 0
  for (const b of birds) {
    const bt = birdText(b.def), names = [bt.name, bt.nick, b.def.name, b.def.nick].filter(Boolean).map(norm)
    for (const n of names) {
      const s = q.includes(n) ? 1 + n.length * 0.01 : lcs(q, n) / n.length * (n.length >= 3 ? 1 : 0.5)
      if (s > bs) { bs = s; best = b }
    }
  }
  return bs >= 0.66 ? best : null
}
const WANT_RARE = /稀有|罕見|珍貴|rare|희귀|珍しい|レア/i
const WANT_ANY = /推薦|什麼鳥|哪些鳥|有什麼|好拍|附近|拍什麼|去哪|recommend|what bird|which bird|any bird|anything|nearby|near me|where should|추천|어떤 새|근처|おすすめ|どんな鳥|近く/i
const BYE = /掰|再見|謝謝|沒事了|bye|thanks|thank you|that's all|고마|안녕|ありがとう|じゃあね/i

export function createPhone({ world, camera, hud, state, presence, getHour, player }) {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition
  const el = document.createElement('div'); el.className = 'phone'; el.hidden = true
  el.innerHTML = `<div class="ph-top"><b>Tom</b><span class="ph-t"></span></div><div class="ph-log"></div>
    <div class="ph-st"></div><input class="ph-in" hidden placeholder="${tr('打字問 Tom，Enter 送出')}"><div class="ph-help"></div>`
  document.body.appendChild(el)
  const log = el.querySelector('.ph-log'), st = el.querySelector('.ph-st'), tEl = el.querySelector('.ph-t'), input = el.querySelector('.ph-in'), help = el.querySelector('.ph-help')
  let on = false, t0 = 0, listening = false, busy = false, rec = null, idle = 0, ac = null, ringing = null
  const helpText = () => SR ? tr('P 說話・Backspace 掛斷') : tr('P 打字・Backspace 掛斷')
  function line(who, text) { const d = document.createElement('div'); d.className = 'ph-' + who; d.textContent = text; log.appendChild(d); while (log.children.length > 6) log.firstChild.remove(); log.scrollTop = 1e6 }
  function status(s) { st.textContent = s }

  // ---------- 鈴聲（嘟——嘟——）----------
  function ring(n = 2) {
    return new Promise((res) => {
      try { ac ??= new AudioContext() } catch { return res() }
      const g = ac.createGain(); g.gain.value = 0; g.connect(ac.destination)
      const o1 = ac.createOscillator(), o2 = ac.createOscillator(); o1.frequency.value = 440; o2.frequency.value = 480; o1.connect(g); o2.connect(g)
      const t = ac.currentTime + 0.05
      for (let i = 0; i < n; i++) { g.gain.setValueAtTime(0.06, t + i * 2.2); g.gain.setValueAtTime(0, t + i * 2.2 + 1.1) }
      o1.start(t); o2.start(t); o1.stop(t + n * 2.2); o2.stop(t + n * 2.2)
      ringing = setTimeout(res, n * 2200 - 600)
    })
  }
  // ---------- 老闆的聲音 ----------
  const VLANG = { zh: 'zh-TW', en: 'en-US', ko: 'ko-KR', ja: 'ja-JP' }[LANG]
  function pickVoice() {
    const vs = speechSynthesis.getVoices().filter((v) => v.lang.replace('_', '-').toLowerCase().startsWith(VLANG.slice(0, 2)))
    const pref = vs.filter((v) => v.lang.replace('_', '-') === VLANG)
    const male = (a) => a.find((v) => /male|man|男|daniel|alex|fred|aaron|tom|reed|rocko|eddy|grandpa|ralph|otoya|hattori|yuna/i.test(v.name) && !/female/i.test(v.name))
    return male(pref) ?? male(vs) ?? pref[0] ?? vs[0] ?? null
  }
  function say(text) {
    line('boss', text)
    return new Promise((res) => {
      if (!window.speechSynthesis) return res()
      speechSynthesis.cancel()
      const u = new SpeechSynthesisUtterance(text); u.lang = VLANG; const v = pickVoice(); if (v) u.voice = v
      u.rate = LANG === 'en' ? 1.0 : 1.05; u.pitch = 0.8
      let done = false; const fin = () => { if (!done) { done = true; res() } }
      u.onend = fin; u.onerror = fin; setTimeout(fin, 3000 + text.length * 260)
      speechSynthesis.speak(u)
    })
  }

  // ---------- 回答（全部從遊戲資料來）----------
  const nameOf = (b) => birdText(b.def).name
  function facts(b) {
    const p = b.target, d = Math.hypot(p.x - camera.position.x, p.z - camera.position.z)
    const where = birdText(b.def).where, region = L(REGION[regionOf(p.x, p.y, p.z)])
    return { name: nameOf(b), where, region, loc: PLACE_WORD.test(where) ? where : L({ zh: `${region}的${where}`, en: `${where.toLowerCase()} in ${region}`, ko: `${region} ${where}`, ja: `${region}の${where}` }), dir: relDir(camera, p.x, p.z), dist: roundDist(d), rare: isRare(b.def.id), seen: (state.seen ?? []).includes(b.def.id), ...presence.status(b.def.id, getHour()), here: !b.absent }
  }
  // f.loc：地點（棲地說明已經有地名就只講它；沒有就「分區＋棲地」）
  const T = {
    here: { zh: (f) => `${f.name}啊，現在在${f.loc}那一帶。從你那邊看，在${f.dir}，大概 ${f.dist} 公尺。${f.rare ? '牠不常出現，動作放輕一點。' : ''}`,
      en: (f) => `The ${f.name}? Right now it's at ${f.loc}. From where you're standing it's ${f.dir}, about ${f.dist} meters.${f.rare ? " It's a rare one, so move quietly." : ''}`,
      ko: (f) => `${f.name} 말이죠? 지금 ${f.loc} 근처에 있어요. 지금 서 있는 곳에서 ${f.dir}, 약 ${f.dist}미터예요.${f.rare ? ' 흔하지 않은 새니까 조용히 다가가세요.' : ''}`,
      ja: (f) => `${f.name}ね。今は${f.loc}のあたりにいるよ。君のところから${f.dir}、だいたい${f.dist}メートル。${f.rare ? '珍しい鳥だから、静かに近づいてね。' : ''}` },
    later: { zh: (f) => `${f.name}今天有來，不過牠${f.label}才比較活躍，現在不好找。到時候去${f.loc}找找看。`,
      en: (f) => `The ${f.name} is around today, but it's mostly active ${f.labelEn}. Not easy to find right now. Try ${f.loc} then.`,
      ko: (f) => `${f.name}는 오늘 왔어요. 그런데 ${f.labelEn} 시간대에 주로 활동해서 지금은 찾기 어려워요. 그때 ${f.loc} 쪽을 찾아보세요.`,
      ja: (f) => `${f.name}は今日来てるよ。でも${f.labelEn}によく動く鳥だから、今は見つけにくいね。その時間に${f.loc}あたりを探してみて。` },
    away: { zh: (f) => `${f.name}喔……今天好像沒人看到牠。${f.rare ? '牠本來就少見，' : ''}改天再來碰碰運氣，平常是在${f.loc}。`,
      en: (f) => `The ${f.name}... nobody's seen it today.${f.rare ? " It's rare to begin with." : ''} Try another day. It usually shows up at ${f.loc}.`,
      ko: (f) => `${f.name}요… 오늘은 본 사람이 없네요.${f.rare ? ' 원래 보기 힘든 새예요.' : ''} 다른 날 다시 와 보세요. 보통은 ${f.loc}에 있어요.`,
      ja: (f) => `${f.name}か…今日は誰も見てないみたい。${f.rare ? 'もともと珍しい鳥だしね。' : ''}別の日にまた来てみて。いつもは${f.loc}にいるよ。` },
    rec: { zh: (f) => `你還沒拍過${f.name}吧？牠現在就在${f.loc}，你的${f.dir}大概 ${f.dist} 公尺。`,
      en: (f) => `Have you got the ${f.name} yet? It's at ${f.loc} right now, ${f.dir}, about ${f.dist} meters.`,
      ko: (f) => `${f.name}는 아직 못 찍었죠? 지금 ${f.loc}에 있어요. ${f.dir}, 약 ${f.dist}미터예요.`,
      ja: (f) => `${f.name}はまだ撮ってないでしょ？今${f.loc}にいるよ。${f.dir}、だいたい${f.dist}メートル。` },
    recRare: { zh: (f) => `今天運氣不錯，${f.name}有出來，在${f.loc}，你的${f.dir}大概 ${f.dist} 公尺。這種很少見，值得跑一趟。`,
      en: (f) => `You're in luck, the ${f.name} is out today, at ${f.loc}, ${f.dir}, about ${f.dist} meters. That one's rare, worth the walk.`,
      ko: (f) => `오늘 운이 좋네요. ${f.name}가 나왔어요. ${f.loc}, ${f.dir} 약 ${f.dist}미터예요. 보기 힘든 새라 가 볼 만해요.`,
      ja: (f) => `今日はついてるね、${f.name}が出てるよ。${f.loc}、${f.dir}だいたい${f.dist}メートル。珍しいから行く価値あるよ。` },
    none: { zh: () => '這個時間鳥都休息了，等天亮再出來吧。', en: () => "The birds are all resting at this hour. Come back after sunrise.", ko: () => '이 시간엔 새들이 다 쉬고 있어요. 해 뜨고 다시 오세요.', ja: () => 'この時間は鳥もみんな休んでるよ。夜が明けてからまたおいで。' },
    huh: { zh: () => '嗯？收訊不太好。你想找哪一種鳥？還是要我推薦附近好拍的？', en: () => "Hm? Bad signal. Which bird are you looking for? Or should I suggest something nearby?", ko: () => '네? 잘 안 들려요. 어떤 새를 찾으세요? 아니면 근처에 찍기 좋은 새를 알려 드릴까요?', ja: () => 'ん？電波が悪いな。どの鳥を探してる？それとも近くのおすすめを教えようか？' },
    hello: { zh: () => '喂，我是 Tom。怎麼了，找不到鳥嗎？', en: () => "Hey, Tom here. What's up, can't find a bird?", ko: () => '여보세요, 톰이에요. 새를 못 찾겠어요?', ja: () => 'もしもし、トムだよ。どうした、鳥が見つからない？' },
    bye: { zh: () => '好，拍到好照片記得拿來給我看。', en: () => 'Alright. Bring me the good shots.', ko: () => '네, 좋은 사진 찍으면 가져와요.', ja: () => 'はいよ。いい写真が撮れたら持ってきてね。' },
  }
  const LBL_EN = { '白天': 'during the day', '清晨到白天': 'from early morning through the day', '清晨': 'in the early morning', '晨昏': 'at dawn and dusk', '夜間': 'at night', '黃昏到夜間': 'from dusk into the night', '偶爾過境（上午）': 'in the morning, when it passes through', '偶爾過境（白天）': 'during the day, when it passes through' }
  function answer(text) {
    const birds = world.birds.filter((b) => b.def?.id)
    const b = findBird(text, birds)
    if (b) {
      const f = facts(b); f.labelEn = LBL_EN[f.label] ?? f.label
      return { kind: f.here ? 'here' : f.today ? 'later' : 'away', f, text: L(f.here ? T.here : f.today ? T.later : T.away)(f) }
    }
    if (WANT_RARE.test(text) || WANT_ANY.test(text)) {
      const here = birds.filter((x) => !x.absent).map((x) => ({ x, d: x.target.distanceTo(camera.position) })).sort((a, c) => a.d - c.d)
      if (!here.length) return { kind: 'none', text: L(T.none)() }
      const seen = new Set(state.seen ?? [])
      const rare = here.find((h) => isRare(h.x.def.id) && !seen.has(h.x.def.id)) ?? here.find((h) => isRare(h.x.def.id))
      const pick = WANT_RARE.test(text) ? rare : here.find((h) => !seen.has(h.x.def.id)) ?? rare ?? here[0]
      if (pick) { const f = facts(pick.x); return { kind: 'rec', f, text: L(isRare(pick.x.def.id) ? T.recRare : T.rec)(f) } }
    }
    if (BYE.test(text)) return { kind: 'bye', text: L(T.bye)() }
    return { kind: 'huh', text: L(T.huh)() }
  }
  // AI 老闆（有載入才用）：只換說法。講出來少了鳥名、地名或距離就不用
  async function polish(a) {
    if (llm.status !== 'ready' || !a.f) return a.text
    const lang = { zh: '繁體中文', en: 'English', ko: '한국어', ja: '日本語' }[LANG]
    const msg = `你是 Tom，鳥類公園旁邊相機行的老闆，個性親切、愛拍鳥，現在在電話裡回答客人。用${lang}、像講電話一樣，把下面這段話換個自然的說法，兩句以內。不准加新的地點、鳥、時間或數字，鳥名、地名、方向、距離都要照抄：\n${a.text}`
    try {
      const out = (await Promise.race([rawGen([{ role: 'user', content: msg }], { max_tokens: 90, temperature: 0.5 }), new Promise((_, no) => setTimeout(() => no(new Error('timeout')), 6000))])).trim().replace(/^["「]|["」]$/g, '')
      const must = [a.f.name, a.f.loc.slice(0, LANG === 'en' ? 8 : 3)]; if (a.f.here || a.kind === 'rec') must.push(String(a.f.dist))
      if (out && out.length < a.text.length * 2 && must.every((m) => out.includes(m))) return out
    } catch {}
    return a.text
  }

  // ---------- 聽 ----------
  function listen() {
    if (!on || listening || busy) return
    if (!SR) { input.hidden = false; player?.controls.unlock(); input.value = ''; input.focus(); status(tr('打字問 Tom')); return }
    rec = new SR(); rec.lang = VLANG; rec.interimResults = true; rec.maxAlternatives = 1
    let heard = '', interim = null
    rec.onresult = (e) => { let s = ''; for (const r of e.results) s += r[0].transcript; heard = s
      if (!interim) { interim = document.createElement('div'); interim.className = 'ph-me ph-interim'; log.appendChild(interim) } interim.textContent = s }
    rec.onerror = (e) => { if (e.error === 'not-allowed' || e.error === 'service-not-allowed') { status(tr('麥克風被擋住了，改用打字')); input.hidden = false; player?.controls.unlock(); input.focus() } }
    rec.onend = () => { listening = false; interim?.remove(); if (heard.trim()) ask(heard.trim()); else if (on && !busy) status('') }
    try { rec.start(); listening = true; status('🎤 ' + tr('請說…')) } catch { listening = false }
  }
  async function ask(text) {
    if (!on) return
    busy = true; line('me', text); status(tr('老闆在想…'))
    const a = answer(text)
    const out = await polish(a)
    status(''); await say(out)
    busy = false; idle = 0
    if (a.kind === 'bye') return hang(0.4)
    status('')
  }
  input.addEventListener('keydown', (e) => {
    e.stopPropagation()
    if (e.key === 'Enter' && input.value.trim()) { const v = input.value.trim(); input.value = ''; input.hidden = true; ask(v) }
    if (e.key === 'Escape') { input.hidden = true; status('') }
  })

  // ---------- 撥號、掛斷 ----------
  async function call() {
    if (on) return
    on = true; el.hidden = false; log.textContent = ''; t0 = performance.now(); idle = 0; help.textContent = ''
    status(tr('撥號中…')); busy = true
    await ring(2); if (!on) return
    await say(L(T.hello)()); busy = false; if (!on) return
    help.textContent = helpText(); listen()
    window.gtag?.('event', 'phone_call', { sr: !!SR, ai: llm.status === 'ready' })
  }
  function hang(delay = 0) {
    setTimeout(() => { on = false; listening = false; busy = false; try { rec?.abort() } catch {} ; clearTimeout(ringing); speechSynthesis?.cancel(); el.hidden = true; input.hidden = true }, delay * 1000)
  }
  function key(e) {
    if (input === document.activeElement) return false
    if (e.code === 'KeyP') { if (!on) call(); else listen(); return true }
    if (on && e.code === 'Backspace') { say(L(T.bye)()).then(() => hang(0.2)); return true }
    return false
  }
  function update(dt) {
    if (!on) return
    const s = Math.floor((performance.now() - t0) / 1000); tEl.textContent = `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
    if (!busy && !listening && input.hidden && (idle += dt) > 30) hang()   // 30 秒沒講話自動掛斷
  }
  window.__phone = { answer, ask, call, hang, regionOf, get on() { return on } }
  return { key, update, call, hang, get on() { return on }, answer }
}
