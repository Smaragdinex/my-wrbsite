// 2026-11-27 打電話問老闆鳥在哪（使用者：「讓老闆 你可以打電話問他 鳥哪裡找到 用語音的方式」）
// P：撥給老闆 Irene（2026-11-27 使用者：「給老闆一個名字 不要相機行 那叫Irene」）→ 響兩聲接起來 → 聽玩家講一句（瀏覽器的語音辨識；沒有就改打字）→ 老闆用語音回答（瀏覽器的語音合成）
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
  const q = norm(text), ql = ' ' + text.toLowerCase().replace(/[^a-z\s-]/g, ' ').replace(/\s+/g, ' ') + ' '; let best = null, bs = 0
  for (const b of birds) {
    const bt = birdText(b.def), names = [bt.name, bt.nick, b.def.name, b.def.nick].filter(Boolean)
    for (const raw of names) {
      const n = norm(raw), m = lcs(q, n)
      let s = q.includes(n) ? 1.5 + n.length * 0.01 : m < 2 ? 0 : m / n.length * (n.length >= 3 ? 1 : 0.5)   // 至少要對到兩個字（「鳥為什麼要遷徙」不會因為一個「鳥」字對到五色鳥）
      // 英文名常只講後半（kingfisher、night heron、moorhen）：後兩個字、最後一個字（5 個字母以上）整字出現也算
      const w = raw.toLowerCase().split(/[\s-]+/).filter(Boolean)
      if (w.length >= 2) { const l2 = ' ' + w.slice(-2).join(' ') + ' ', l1 = ' ' + w.at(-1) + ' '
        if (ql.includes(l2) || ql.replace(/-/g, ' ').includes(l2)) s = Math.max(s, 1.2); else if (w.at(-1).length >= 5 && (ql.includes(l1) || ql.includes(' ' + w.at(-1) + 's '))) s = Math.max(s, 1.0) }
      if (s > bs) { bs = s; best = b }
    }
  }
  if (best) best._exact = bs >= 1.5   // 講出完整的名字（「貓頭鷹」對到「XX貓頭鷹」不算）
  return bs >= 0.66 ? best : null
}
const WANT_RARE = /稀有|罕見|珍貴|rare|희귀|珍しい|レア/i
const WANT_ANY = /推薦|什麼鳥|哪些鳥|有什麼|好拍|附近|拍什麼|去哪|recommend|what bird|which bird|any bird|anything|nearby|near me|where should|추천|어떤 새|근처|おすすめ|どんな鳥|近く/i
const BYE = /掰|再見|謝謝|沒事了|bye|thanks|thank you|that's all|고마|안녕|ありがとう|じゃあね/i

// ---------- 鳥的知識（2026-11-27 使用者：「測試老闆 Irene 懂不懂鳥的知識」→ 測 12 題全答成「牠在哪」）----------
// 答案只從圖鑑資料來（birdinfo 的 intro＋facts，各語言版本）：照問題的主題（吃、巢、公母、叫聲、長相…）挑最對的一句
const ASK_WHERE = /在哪|哪裡|哪邊|去哪|怎麼找|找得到|找不到|where|find|어디|찾|どこ|探/i
const TOPICS = [
  [/吃|食|抓|獵|捕|魚|蟲|eat|food|feed|hunt|prey|catch|fish|insect|먹|사냥|食べ|狩り|餌/i, /吃|食|抓|獵|捕|啄|吞|踢|踩|夾|魚|蟲|蹴|踏|걷어차|차서|발로|kick|stomp|eat|feed|hunt|prey|catch|fish|insect|먹|사냥|잡|食べ|狩|捕|魚|虫/i],
  [/巢|窩|蛋|繁殖|育雛|寶寶|小鳥|nest|egg|breed|chick|baby|둥지|알|번식|巣|卵|ひな|子育て/i, /巢|窩|蛋|繁殖|育雛|雛|nest|egg|breed|chick|둥지|알|새끼|巣|卵|ひな/i],
  [/公|母|雄|雌|男生|女生|male|female|sex|수컷|암컷|암수|オス|メス|雄|雌/i, /雄|雌|公|母|male|female|수컷|암컷|オス|メス/i],
  [/叫|聲|唱|鳴|call|song|sing|sound|voice|울음|소리|노래|鳴き|声|歌/i, /叫聲|叫得|叫起|聲|唱|鳴|call|song|sing|sound|voice|울|소리|노래|鳴|声|歌/i],
  [/長什麼|長怎樣|長相|顏色|什麼顏色|嘴|喙|羽|腳|翅|認|分辨|look|colou?r|bill|beak|feather|leg|wing|identify|tell|생김|색|부리|깃|見た目|色|くちばし|羽/i, /色|嘴|喙|羽|腳|翅|頭|冠|眼|look|colou?r|bill|beak|feather|leg|wing|crest|eye|색|부리|깃|다리|날개|色|くちばし|羽|脚|翼/i],
  [/飛|遷徙|過冬|候鳥|fly|flight|migrat|winter|날|이동|겨울|飛|渡り|冬/i, /飛|遷徙|過冬|候鳥|fly|flight|migrat|winter|날|이동|겨울|飛|渡|冬/i],
]
const INTRO_ASK = /介紹|特別|特色|知識|了解|是什麼鳥|跟我說|講一下|tell me about|about the|special|interesting|fact|소개|특별|알려|紹介|特別|教えて/i
const STOP = /[的是了牠它在怎麼什為嗎呢啊有一會要那這個樣長鳥]/g
// 比對用的詞：中日韓用兩個字一組；英文用單字（取前 4 個字母當字根：swim／swimming、nest／nests）——英文用字母兩兩一組的話，越長的句子分數越高
const EN_STOP = new Set(['what', 'does', 'the', 'and', 'how', 'why', 'that', 'like', 'look', 'with', 'from', 'this', 'about', 'tell', 'have', 'there', 'its', 'you', 'your', 'can', 'are', 'for', 'one', 'into'])
const bigrams = (s) => { const o = new Set()
  for (const w of s.toLowerCase().match(/[a-z]{3,}/g) ?? []) if (!EN_STOP.has(w)) o.add('w:' + w.slice(0, 4))
  const t = norm(s).replace(/[a-z0-9]/g, ''); for (let i = 0; i < t.length - 1; i++) o.add(t.slice(i, i + 2)); return o }
function birdFact(b, q) {
  const bt = birdText(b.def)
  const intro = (bt.intro ?? '').split(/(?<=[。！？])\s*|(?<=[.!?])\s+/).filter(Boolean), facts = bt.facts ?? []   // 英文句點後面要有空白才算斷句（「1.2 m」不會被切開）
  const pool = [...intro.map((t) => ({ t, intro: 1 })), ...facts.map((t) => ({ t, intro: 0 }))]
  if (!pool.length) return null
  const names = [bt.name, bt.nick, b.def.name, b.def.nick].filter(Boolean).map(norm)
  let qq = norm(q); for (const n of names) qq = qq.split(n).join('')
  let qw = q.toLowerCase(); for (const raw of [bt.name, b.def.name].filter(Boolean)) for (const w of raw.toLowerCase().split(/[\s-]+/)) qw = qw.split(w).join(' ')
  const qb = bigrams(LANG === 'en' ? qw : qq), want = TOPICS.filter(([ask]) => ask.test(LANG === 'en' ? qw : qq))   // 用拿掉鳥名的問題判斷主題（「五色鳥」的「色」不算問顏色）
  let best = null, bs = -1
  for (const p of pool) {
    let sc = 0; for (const [, has] of want) if (has.test(p.t)) sc += 3
    const pb = bigrams(p.t); for (const x of qb) if (pb.has(x)) sc += 1
    for (const ch of new Set(qq.replace(STOP, ''))) if (/[\u4e00-\u9fff]/.test(ch) && p.t.includes(ch)) sc += 0.5   // 單字也算（「抓蛇」→「蛇還來不及反應」）
    if (/為什麼|為何|why|왜|なぜ/i.test(q) && /所以|因為|用來|才|方便|就|來自|吃出來|so |because|comes? from|to help|그래서|때문|에서 나와|덕분|ので|から/i.test(p.t)) sc += 1.5   // 問為什麼：有講原因的句子優先
    if (/叫|聲|call|song|sound|울음|소리|鳴き|声/i.test(q) && /「[^」]+」|"[^"]+"/.test(p.t) && /叫聲|叫得|聲|鳴|call|song|sound|울|소리|鳴|声/i.test(p.t)) sc += 2   // 問叫聲：有寫出叫聲（「咯、咯」）的那句
    if (sc >= 3 && !p.intro && !/為什麼|為何|why|왜|なぜ/i.test(q)) sc += 0.4   // 有對到主題、同分時小知識優先（介紹常常只是順帶提到）
    if (sc > bs) { bs = sc; best = p }
  }
  if (INTRO_ASK.test(q) || bs <= 0) return { text: [intro[0], facts[0]].filter(Boolean).join((LANG === 'zh' || LANG === 'ja' ? '' : ' ')), topic: false }
  // 問「為什麼／怎麼」又挑到介紹裡的句子：連下一句一起講（「嘴像飯匙」＋「左右掃、碰到小魚就夾」）
  if (best.intro && /為什麼|為何|怎麼|why|how|왜|어떻게|なぜ|どう/i.test(q)) {
    // 連後面一句一起講；後面那句還在講同一件事（同一個主題）就再多一句（「嘴像飯匙」→「最特別的是嘴」→「左右掃、碰到就夾」）
    const i = intro.indexOf(best.t), out = [best.t]
    if (intro[i + 1]) { out.push(intro[i + 1]); if (intro[i + 2] && want.some(([, has]) => has.test(intro[i + 1]))) out.push(intro[i + 2]) }
    return { text: out.join((LANG === 'zh' || LANG === 'ja' ? '' : ' ')), topic: true } }
  return { text: best.t, topic: true }
}
// 沒有指定哪種鳥的常識題（寫好的，Irene 不自己編）
const GENERAL = [
  { q: /鏡頭|焦段|相機|器材|lens|focal|camera|gear|렌즈|카메라|レンズ|カメラ/i,
    a: { zh: '拍鳥最重要是焦段夠長，鳥很怕人，靠太近就飛走了。至少 300 公釐起跳，小鳥最好 600。店裡的鏡頭你可以來看看，拍到好照片賣給我，就有錢換更長的。', en: "For birds, focal length is everything. They spook easily, so you want at least 300mm, and 600mm for the small ones. Come check the lenses at the shop. Sell me good shots and you can afford a longer one.", ko: '새를 찍을 땐 초점거리가 제일 중요해요. 새는 겁이 많아서 최소 300mm, 작은 새는 600mm가 좋아요. 가게에 와서 렌즈 구경해 보세요.', ja: '鳥を撮るなら焦点距離が一番大事。鳥は人を怖がるから、最低でも300ミリ、小鳥なら600ミリ欲しいね。店のレンズを見においで。' } },
  { q: /遷徙|候鳥|過冬|migrat|winter|이동|철새|渡り鳥|渡り/i,
    a: { zh: '鳥遷徙主要是為了吃的。冬天北方結冰、蟲子也少了，就往南飛到食物多的地方，春天再回去繁殖。有些鳥一年要飛上萬公里。', en: "Birds migrate mostly for food. Up north, winter freezes everything and the insects disappear, so they fly south where food is easy, then head back in spring to breed. Some fly over ten thousand kilometers a year.", ko: '새가 이동하는 건 주로 먹이 때문이에요. 겨울엔 북쪽이 얼고 벌레도 줄어서 먹이가 많은 남쪽으로 갔다가, 봄에 번식하러 돌아가요.', ja: '渡りは主に食べ物のため。冬は北が凍って虫もいなくなるから、餌の多い南へ行って、春になったら子育てに戻るんだ。' } },
  { q: /貓頭鷹|鴞|夜行|晚上.*看|owl|night vision|see at night|부엉이|올빼미|フクロウ|夜行性/i,
    a: { zh: '貓頭鷹的眼睛很大，裡面感光的細胞特別多，一點點月光就看得到。牠們的臉像個碟子，把聲音集中到耳朵，在全黑裡光聽老鼠走路的聲音也抓得到。晚上帶手電筒來，按 F。', en: "Owls have huge eyes packed with light-sensitive cells, so a little moonlight is plenty. Their dish-shaped face funnels sound to their ears, so they can catch a mouse in total darkness just by hearing it. Bring a flashlight at night, press F.", ko: '올빼미는 눈이 아주 크고 빛을 느끼는 세포가 많아서 달빛만 있어도 잘 봐요. 접시 같은 얼굴이 소리를 귀로 모아서 깜깜해도 쥐 소리만 듣고 잡아요.', ja: 'フクロウは目が大きくて光を感じる細胞が多いから、月明かりで十分見える。お皿みたいな顔が音を耳に集めるから、真っ暗でもネズミの足音だけで捕まえられるんだ。' } },
  { q: /怎麼拍|技巧|靠近|嚇跑|飛走|tips?|approach|scare|spook|get close|fly(ing)? away|keep flying|가까이|날아가|도망|コツ|近づ|逃げ/i,
    a: { zh: '慢慢走，按 C 蹲低靠近，鳥就比較不會被嚇跑。不要直直衝過去，從側面繞。等牠在做事的時候按快門，像吃東西、理毛、飛起來那一下，照片最值錢。', en: "Move slowly and hold C to crouch as you get close. Don't walk straight at it, circle in from the side. Shoot when it's doing something, eating, preening, taking off. Those are the shots worth the most.", ko: '천천히 걷고 C를 눌러 몸을 낮춰 다가가세요. 정면으로 가지 말고 옆으로 돌아가요. 먹거나 깃털을 다듬거나 날아오를 때 찍으면 제일 비싸요.', ja: 'ゆっくり歩いて、C でしゃがんで近づくこと。まっすぐ向かわず横から回り込む。食べてる時や羽づくろい、飛び立つ瞬間を撮ると一番高く売れるよ。' } },
]
const T_FACT = {
  zh: (n, t, topic) => `${n}啊，${topic ? '' : '我跟你說，'}${t}${topic ? '' : ''}要不要我告訴你牠現在在哪？`,
  en: (n, t) => `Ah, the ${n}. ${t} Want me to tell you where it is right now?`,
  ko: (n, t) => `${n} 말이죠. ${t} 지금 어디 있는지 알려 드릴까요?`,
  ja: (n, t) => `${n}ね。${t}今どこにいるか教えようか？`,
}

export function createPhone({ world, camera, hud, state, presence, getHour, player }) {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition
  const el = document.createElement('div'); el.className = 'phone'; el.hidden = true
  el.innerHTML = `<div class="ph-top"><b>Irene</b><span class="ph-t"></span></div><div class="ph-log"></div>
    <div class="ph-st"></div><input class="ph-in" hidden placeholder="${tr('打字問 Irene，Enter 送出')}"><div class="ph-help"></div>`
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
    // 2026-11-28 使用者：「語音改成年輕女生」。照名單順序挑（越前面越像年輕女生），Mac／Windows／Chrome 內建 Google 語音都列；都沒有才用該語言第一個
    const GIRL = ['meijia', 'hsiaochen', 'hsiaoyu', 'hanhan', 'yating', 'google 國語', 'samantha', 'ava', 'zoe', 'allison', 'aria', 'jenny', 'zira', 'google us english',
      'yuna', 'sora', 'sunhi', 'heami', 'google 한국', 'kyoko', 'o-ren', 'nanami', 'haruka', 'ayumi', 'google 日本', 'flo', 'sandy', 'shelley', 'female', '女']
    const girl = (a) => { for (const k of GIRL) { const v = a.find((x) => x.name.toLowerCase().includes(k) && !/\bmale\b/i.test(x.name)); if (v) return v } }
    return girl(pref) ?? girl(vs) ?? pref[0] ?? vs[0] ?? null
  }
  function say(text) {
    line('boss', text)
    return new Promise((res) => {
      if (!window.speechSynthesis) return res()
      speechSynthesis.cancel()
      const u = new SpeechSynthesisUtterance(text); u.lang = VLANG; const v = pickVoice(); if (v) u.voice = v
      u.rate = LANG === 'en' ? 1.02 : 1.08; u.pitch = 1.15   // 年輕女生：音調稍高、語速稍快
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
    hello: { zh: () => '喂，我是 Irene。怎麼了，找不到鳥嗎？', en: () => "Hey, Irene here. What's up, can't find a bird?", ko: () => '여보세요, 아이린이에요. 새를 못 찾겠어요?', ja: () => 'もしもし、アイリーンだよ。どうした、鳥が見つからない？' },
    bye: { zh: () => '好，拍到好照片記得拿來給我看。', en: () => 'Alright. Bring me the good shots.', ko: () => '네, 좋은 사진 찍으면 가져와요.', ja: () => 'はいよ。いい写真が撮れたら持ってきてね。' },
  }
  const LBL_EN = { '白天': 'during the day', '清晨到白天': 'from early morning through the day', '清晨': 'in the early morning', '晨昏': 'at dawn and dusk', '夜間': 'at night', '黃昏到夜間': 'from dusk into the night', '偶爾過境（上午）': 'in the morning, when it passes through', '偶爾過境（白天）': 'during the day, when it passes through' }
  let lastBird = null
  function answer(text) {
    const birds = world.birds.filter((b) => b.def?.id)
    const b = findBird(text, birds)
    if (!b?._exact) { const gq = GENERAL.find((x) => x.q.test(text)); if (gq) return { kind: 'general', text: L(gq.a) } }   // 「貓頭鷹為什麼晚上看得到」問的是貓頭鷹這一類，不是某一種
    if (b && !ASK_WHERE.test(text) && norm(text).length > norm(birdText(b.def).name).length + 1) {   // 問的不是「在哪」、也不只講鳥名 → 知識題
      const k = birdFact(b, text)
      if (k) { lastBird = b; return { kind: 'fact', text: L(T_FACT)(nameOf(b), k.text, k.topic) } }
    }
    if (!b && lastBird && /^(要|好|好啊|好喔|好的|嗯|對|要啊|在哪|在哪裡|告訴我|yes|yeah|sure|ok|okay|please|where|네|좋아요?|응|うん|はい|どこ|教えて)$/i.test(norm(text))) return answer(birdText(lastBird.def).name + '在哪')   // 「要」：接著問剛剛那隻在哪
    if (b) {
      const f = facts(b); f.labelEn = LBL_EN[f.label] ?? f.label
      return { kind: f.here ? 'here' : f.today ? 'later' : 'away', f, text: L(f.here ? T.here : f.today ? T.later : T.away)(f) }
    }
    { const gq = GENERAL.find((x) => x.q.test(text)); if (gq) return { kind: 'general', text: L(gq.a) } }
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
    const msg = `你是 Irene，鳥類公園旁邊相機行的老闆，個性親切、愛拍鳥，現在在電話裡回答客人。用${lang}、像講電話一樣，把下面這段話換個自然的說法，兩句以內。不准加新的地點、鳥、時間或數字，鳥名、地名、方向、距離都要照抄：\n${a.text}`
    try {
      const out = (await Promise.race([rawGen([{ role: 'user', content: msg }], { max_tokens: 90, temperature: 0.5 }), new Promise((_, no) => setTimeout(() => no(new Error('timeout')), 6000))])).trim().replace(/^["「]|["」]$/g, '')
      const must = [a.f.name, a.f.loc.slice(0, LANG === 'en' ? 8 : 3)]; if (a.f.here || a.kind === 'rec') must.push(String(a.f.dist))
      if (out && out.length < a.text.length * 2 && must.every((m) => out.includes(m))) return out
    } catch {}
    return a.text
  }

  // ---------- 聽 ----------
  // 2026-11-28 使用者「不能給網站權限麥克風」：遊戲中滑鼠被鎖住，Chrome 的「允許」按不到、按 Esc 就算拒絕（拒絕幾次會自動封鎖）。
  // 改成按 P 當下（還算使用者手勢）就先放開滑鼠、主動問麥克風；被擋就直接寫出怎麼解除，先用打字
  let micOK = false, micAsk = false
  const isSafari = /^((?!chrome|android|crios|fxios).)*safari/i.test(navigator.userAgent)
  function typeMode(msg) { if (msg) status(msg); input.hidden = false; player?.controls.unlock(); input.value = ''; input.focus() }
  function micHelp(kind) {
    typeMode(kind === 'system' ? tr('電腦沒讓瀏覽器用麥克風：系統設定 → 隱私權與安全性 → 麥克風，打開這個瀏覽器。現在先打字')
      : kind === 'service' ? tr('Safari 要先打開聽寫：系統設定 → 鍵盤 → 聽寫。現在先打字')
      : kind === 'nomic' ? tr('找不到麥克風，先打字')
      : kind === 'net' ? tr('語音辨識連不上網路，先打字')
      : tr('麥克風被封鎖了：點網址列左邊的圖示 → 麥克風 → 允許，再重新整理。現在先打字'))
  }
  async function ensureMic() {
    if (micOK) return true
    try { const p = await navigator.permissions?.query({ name: 'microphone' }); if (p?.state === 'granted') return (micOK = true); if (p?.state === 'denied') { micHelp('denied'); return false } } catch {}
    if (!navigator.mediaDevices?.getUserMedia) return (micOK = true)   // 舊瀏覽器：交給語音辨識自己問
    micAsk = true; player?.controls.unlock(); status(tr('請按瀏覽器上方的「允許」使用麥克風'))
    try { const s = await navigator.mediaDevices.getUserMedia({ audio: true }); s.getTracks().forEach((t) => t.stop()); return (micOK = true) }
    catch (e) { micHelp(e?.name === 'NotFoundError' ? 'nomic' : /system/i.test(e?.message ?? '') ? 'system' : 'denied'); return false }
    finally { micAsk = false }
  }
  async function listen() {
    if (!on || listening || busy) return
    if (!SR) { typeMode(tr('打字問 Irene')); return }
    if (!micOK && !(await ensureMic())) return
    if (!on || listening || busy) return
    rec = new SR(); rec.lang = VLANG; rec.interimResults = true; rec.maxAlternatives = 1
    let heard = '', interim = null
    rec.onresult = (e) => { let s = ''; for (const r of e.results) s += r[0].transcript; heard = s
      if (!interim) { interim = document.createElement('div'); interim.className = 'ph-me ph-interim'; log.appendChild(interim) } interim.textContent = s }
    rec.onerror = (e) => { const k = { 'not-allowed': 'denied', 'service-not-allowed': isSafari ? 'service' : 'denied', 'audio-capture': 'nomic', network: 'net' }[e.error]; if (k) { micOK = false; micHelp(k) } }
    rec.onend = () => { listening = false; interim?.remove(); if (heard.trim()) ask(heard.trim()); else if (on && !busy && input.hidden) status('') }
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
    const mic = SR ? ensureMic() : null   // 趁按 P 的當下先問麥克風（響鈴時同時等玩家按允許）
    await ring(2); if (!on) return
    const okMic = await mic; if (!on) return
    if (okMic !== false) status('')
    await say(L(T.hello)()); busy = false; if (!on) return
    help.textContent = helpText(); if (okMic !== false) listen()
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
  return { key, update, call, hang, get on() { return on }, get cursor() { return on && (micAsk || !input.hidden) }, answer }
}
