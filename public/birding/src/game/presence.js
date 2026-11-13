// 鳥什麼時候在（2026-11-10，PARK_PLAN.md 第三節，ChatGPT 規劃）
// 玩家回饋：「轉個身就看到八色鳥」、「有些鳥應該晚上才飛出來、或某個時間點才飛來」。
// 1. 每個遊戲日先決定今天來不來：稀有 38%、非常稀有 16%（昨天來過的今天休息），一天最多 8 種稀有、3 種非常稀有
// 2. 今天有來的，在牠活動的時段才出現（夜行的晚上、晨昏的清晨跟黃昏），時段外只剩一點點機會；白天的鳥晚上睡了不出現
// 3. 換班的時候玩家在附近（130 公尺內）：會飛的鳥「飛進來降落」「飛走」，不會憑空出現消失；
//    不會飛的（或還在逃跑中的）等玩家離開 45 公尺再換
// 遊戲日數存在存檔（state.parkDay）：重新整理不會重抽同一天
import { RARITY } from './judge.js'
import { t as tr } from '../i18n.js'

// 時段（小時；跨午夜的寫成 > 24）
const DAWN = [4.5, 9.5], DUSK = [15.5, 19.5]
const KIND = {
  D: { win: [[5.5, 18.5]], off: 0, label: '白天' },
  DD: { win: [[4.5, 18.5]], off: 0, label: '清晨到白天' },
  DAWN: { win: [DAWN], off: 0.25, label: '清晨' },
  CREP: { win: [DAWN, DUSK], off: 0.35, label: '晨昏' },
  NIGHT: { win: [[18.5, 29]], off: 0.05, label: '夜間' },
  DN: { win: [[15.5, 29]], off: 0.1, label: '黃昏到夜間' },
  // 過境的：只有這段時間會飛來
  AM: { win: [[6.5, 11]], off: 0, label: '偶爾過境（上午）' },
  PASS: { win: [[8, 16]], off: 0, label: '偶爾過境（白天）' },
}
// 每種鳥的活動時段（PARK_PLAN.md 第二節「時段」欄）
const ACT = {
  sparrow: 'D', dove: 'D', heron: 'CREP', whiteeye: 'D', oriole: 'DD', babbler: 'DD', barbet: 'D', kingfisher: 'DD',
  waterhen: 'CREP', moorhen: 'D', nightheron: 'DN', egret: 'D', spoonbill: 'AM', mikado: 'CREP', blackbulbul: 'D',
  thrush: 'CREP', treepie: 'D', bulbul: 'D', pheasant: 'CREP', bluemagpie: 'D', yuhina: 'D', bushrobin: 'DAWN',
  yellowtit: 'D', niltava: 'DD', flamecrest: 'D', laughingthrush: 'D', rosefinch: 'D', goshawk: 'D', serpenteagle: 'D', woodowl: 'NIGHT',
  mandarin: 'CREP', spotbill: 'D', partridge: 'DAWN', minivet: 'D', pitta: 'DAWN', grassowl: 'DN', liocichla: 'D',
  whitebrow: 'CREP', bullfinch: 'D', barwing: 'D', islandthrush: 'CREP', tit: 'D', rustylt: 'D', whitethroat: 'D',
  hwamei: 'DAWN', styan: 'D', scimitar: 'CREP', fulvetta: 'D', bamboo: 'CREP', flowing: 'D', bushwarbler: 'DAWN',
  cupwing: 'D', shortwing: 'CREP', scopsowl: 'NIGHT', mtscops: 'NIGHT', jacana: 'D', psnipe: 'CREP', woodcock: 'DN',
  shelduck: 'AM', pheron: 'CREP', stilt: 'AM', harrier: 'PASS', rnpheasant: 'CREP', skylark: 'DD', cisticola: 'D',
  nutcracker: 'D', sibia: 'D', finchbill: 'D', nuthatch: 'D', wbwood: 'D',
  shoebill: 'D', flamingo: 'D', ajacana: 'D', gallinule: 'D', rspoonbill: 'D', sarus: 'DD', skimmer: 'D', redcrowned: 'DD', ruff: 'D', lapwing: 'D', grebe: 'D', peregrine: 'D', blackswift: 'D', greatgreyowl: 'CREP',
}
export const activityLabel = (id) => KIND[ACT[id] ?? 'D'].label

// 有巢的鳥（2026-11-10 使用者：23:00 去看草鴞，巢裡沒有鳥）：巢是場景、一直都在；鳥照「非常稀有」每天抽 16%，大部分日子巢是空的。
// 在繁殖的鳥是留鳥，不抽今天來不來；活動時段一定在巢
const NESTING = { grassowl: { stay: 1, off: 0.25 } }   // 2026-11-10 使用者：時間到牠都會在才正確 → 黃昏到清晨一定在巢裡；白天偶爾在
const DAILY = { '很常見': 1, '普通': 0.97, '不常見': 0.8, '稀有': 0.38, '非常稀有': 0.16 }
const CAP = { '稀有': 8, '非常稀有': 3 }
const STAY = { '很常見': 1, '普通': 0.95, '不常見': 0.85, '稀有': 0.85, '非常稀有': 0.8 }   // 今天有來、又在活動時段：這個小時在的機會
const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return ((h >>> 0) % 100000) / 100000 }
const inWin = (h, w) => w.some(([a, b]) => (h >= a && h < b) || (h + 24 >= a && h + 24 < b))
const isNight = (h) => h < 5 || h >= 19

export function createPresence({ world, camera, flight, hud, state, save, rec }) {
  let day = state.parkDay ?? 0, lastH = null, slot = null, check = 0
  const want = new Map()
  // 今天來的鳥：照稀有度抽，稀有／非常稀有有上限；非常稀有的昨天來過就休息（冷卻）
  const memo = new Map()
  function todaySet(d, cool = true) {
    const key = d + ':' + cool
    if (memo.has(key)) return memo.get(key)
    const on = new Set(), count = {}
    const yesterday = cool && d > 0 ? todaySet(d - 1, false) : null
    const ids = world.birds.map((b) => b.def.id).sort((a, b) => hash(a + '#' + d) - hash(b + '#' + d))   // 每天順序不同，上限不會老是卡掉同幾種
    for (const id of ids) {
      if (NESTING[id]) { on.add(id); continue }
      const r = RARITY[id] ?? '普通'
      if (hash(id + '@' + d) >= (DAILY[r] ?? 0.97)) continue
      if (r === '非常稀有' && yesterday?.has(id)) continue
      if (CAP[r] && (count[r] = (count[r] ?? 0) + 1) > CAP[r]) continue
      on.add(id)
    }
    memo.set(key, on)
    return on
  }
  function wanted(id, h0) {
    const h = (h0 - hash(id + '~') * 0.8 + 24) % 24   // 每種鳥換班的時間錯開 0～48 分鐘，天亮時不會全部同一秒飛進來
    if (!todaySet(day).has(id)) return false
    const k = KIND[ACT[id] ?? 'D'], r = RARITY[id] ?? '普通'
    // 時段外：白天還有 off 的機會（夜行的白天偶爾看得到在睡覺）；晚上不在時段內的一律不在
    const N = NESTING[id]
    const p = inWin(h, k.win) ? N?.stay ?? STAY[r] ?? 0.95 : isNight(h) ? 0 : N?.off ?? k.off
    return hash(id + ':' + day + ':' + Math.floor(h)) < p
  }
  const members = (b) => b.built.birds ?? [b.built]
  function show(b, on) {
    b.absent = !on; b.leaving = false
    for (const m of members(b)) m.obj.visible = on
    if (b.built.extra) b.built.extra.visible = on
  }
  const busy = (b) => members(b).some((m) => m.flight && m.flight.mode !== 'perch')
  // 換班：w＝這個小時該不該在
  function step(b, w, first) {
    const d = b.target.distanceTo(camera.position)
    if (first) { show(b, w); return }
    if (b.leaving) {
      if (w) { b.absent = false; if (flight.arrive(b)) b.leaving = false; return }
      if (flight.gone(b)) { b.absent = true; b.leaving = false; if (b.built.extra) b.built.extra.visible = false }
      return
    }
    if (w === !b.absent) return
    if (w) {
      // 飛進來：玩家在附近看得到才飛（遠的直接出現，省事）
      if (d < 130 && d > 6 && flight.canFly(b)) {
        b.absent = false
        if (b.built.extra) b.built.extra.visible = true
        flight.arrive(b)
        const r = RARITY[b.def.id]
        if (d < 90 && (r === '稀有' || r === '非常稀有')) hud.toast(tr('聽到翅膀聲，好像有鳥飛過來了'))
        return
      }
      if (d < 45) return
      show(b, true)
    } else {
      if (busy(b)) return
      if (d < 130 && flight.canFly(b)) { if (flight.depart(b)) b.leaving = true; return }
      if (d < 45) return
      show(b, false)
    }
  }
  function update(hour, dt) {
    if (rec) return   // 錄宣傳影片（rec=1）：鳥全部都在
    if (lastH !== null && hour < lastH - 12) { day++; state.parkDay = day; save() }
    lastH = hour
    const s = day * 96 + Math.floor(hour * 4), first = slot === null   // 每 15 遊戲分鐘重算一次
    if (s !== slot) { slot = s; for (const b of world.birds) want.set(b, wanted(b.def.id, hour)) }
    if (!first && (check -= dt) > 0) return
    check = 0.5
    for (const b of world.birds) step(b, want.get(b), first)
  }
  // 測試用：__presence.today() 今天來的鳥；force(id, on) 直接改
  window.__presence = { today: () => [...todaySet(day)], get day() { return day }, set day(v) { day = v; slot = null; memo.clear() }, wanted, want }
  // 2026-11-11 串流載入：鳥的模型晚到，換上真的之後照現在這個時段該不該在重設一次（替身上的顯示狀態不會帶過去）
  const sync = (b) => { if (rec) return; const w = want.get(b); if (w !== undefined) show(b, w) }
  return { update, activityLabel, sync }
}
