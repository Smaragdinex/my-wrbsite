// 多語系（2026-11-07）：英文、中文（繁體）、韓文、日文。
// 程式裡的字照舊寫中文，外面包 t('中文', { 變數 })；其他語言在 src/i18n/<語言>.js 的 UI 表用「中文原文」當 key 查（找不到就顯示中文）。
// 鳥的名字、棲地、介紹、小知識在各語言檔的 BIRDS 表（用鳥的 id 查）；中文直接用 birdinfo.js 的。
// 語言存在 localStorage 'lang'（只存語言代碼）；換語言就重新載入頁面（畫在貼圖上的字、3D 招牌都是一開始畫好的）。
import { UI as EN, BIRDS as EN_B } from './i18n/en.js'
import { UI as KO, BIRDS as KO_B } from './i18n/ko.js'
import { UI as JA, BIRDS as JA_B } from './i18n/ja.js'

export const LANGS = [
  { id: 'en', label: 'English' },
  { id: 'zh', label: '中文' },
  { id: 'ko', label: '한국어' },
  { id: 'ja', label: '日本語' },
]
const TABLES = { en: [EN, EN_B], ko: [KO, KO_B], ja: [JA, JA_B], zh: [{}, {}] }
function detect() {
  let v = null
  try { v = localStorage.getItem('lang') } catch {}
  if (v && TABLES[v]) return v
  const n = (navigator.language || 'en').toLowerCase()
  return n.startsWith('zh') ? 'zh' : n.startsWith('ko') ? 'ko' : n.startsWith('ja') ? 'ja' : 'en'
}
export const LANG = detect()
const [UI, BIRD_T] = TABLES[LANG]
document.documentElement.lang = { en: 'en', zh: 'zh-Hant', ko: 'ko', ja: 'ja' }[LANG]

// t('已記錄 {n} / {m} 種', { n: 3, m: 28 })
export function t(zh, vars) {
  let s = UI[zh] ?? zh
  if (vars) s = s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m))
  return s
}
export function setLang(id) {
  try { localStorage.setItem('lang', id) } catch {}
  location.reload()
}
// 鳥的文字：b 是 birdinfo 的一筆（中文），回傳這個語言的 { name, nick, where, intro, facts }（沒翻的欄位用中文）
export function birdText(b) {
  const o = BIRD_T[b.id] || {}
  return { name: o.name ?? b.name, nick: o.nick ?? b.nick, where: o.where ?? b.where, intro: o.intro ?? b.intro, facts: o.facts ?? b.facts }
}
// 只有 id 的時候（照片存的 subject）
export function birdName(id, fallback) {
  if (LANG === 'zh') return fallback
  return BIRD_T[id]?.name ?? fallback
}
// 字型：韓文、日文要有對應的字（canvas 用）
export const FONT_SANS = LANG === 'ko' ? '"Apple SD Gothic Neo","Noto Sans KR","Malgun Gothic",sans-serif'
  : LANG === 'ja' ? '"Hiragino Sans","Hiragino Kaku Gothic ProN","Noto Sans JP","Yu Gothic",sans-serif'
  : '"PingFang TC","Noto Sans TC","Microsoft JhengHei",sans-serif'
export const FONT_SERIF = LANG === 'ko' ? '"AppleMyungjo","Noto Serif KR","Batang",serif'
  : LANG === 'ja' ? '"Hiragino Mincho ProN","Noto Serif JP","Yu Mincho",serif'
  : '"Songti TC","Noto Serif TC","PMingLiU",serif'
