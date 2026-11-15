// 畫面上的資訊：準星、錢、提示、短暫的訊息
import { t as tr } from '../i18n.js'
export function createHud(root) {
  root.innerHTML = '<div class="crosshair"></div><div class="money" hidden></div><div class="clock" hidden></div><div class="wx" hidden></div><div class="guide-new" hidden></div><div class="quest" hidden></div><div class="fade"></div><div class="status" hidden></div><div class="hint" hidden></div><div class="toast" style="opacity:0"></div>'
  const money = root.querySelector('.money'), hint = root.querySelector('.hint'), toast = root.querySelector('.toast'), status = root.querySelector('.status'), clock = root.querySelector('.clock'), guideNew = root.querySelector('.guide-new'), fade = root.querySelector('.fade'), quest = root.querySelector('.quest')
  let toastT = 0
  return {
    root,
    setMoney(v) { money.hidden = false; money.textContent = `$ ${v.toLocaleString()}` },
    // 圖鑑有沒讀過的新紀錄：右上角一直亮著，讀完（翻到那一頁）才消失
    setGuideNew(n) { guideNew.hidden = !n; if (n) guideNew.textContent = tr('圖鑑 {n} 筆新紀錄（E）', { n }) },
    setQuest(text) { quest.hidden = !text; if (text) quest.textContent = text },
    setStatus(text) { status.hidden = !text; if (text) status.textContent = text },
    // 時鐘：幾點幾分＋時段
    setClock(h) {
      clock.hidden = false
      const hh = Math.floor(h), mm = Math.floor((h - hh) * 60 / 10) * 10
      const part = tr(h < 5 ? '深夜' : h < 7 ? '清晨' : h < 11 ? '早上' : h < 16 ? '白天' : h < 18.5 ? '黃昏' : '夜晚')
      clock.textContent = `${part}　${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
    },
    // 2026-11-16 氣溫／露點／能見度（climate.js）：時鐘下面一行小字；溫度露點差小於 3°C 時露點變藍、起霧時顯示能見度
    setClimate(c) {
      const wx = root.querySelector('.wx')
      if (!c) { wx.hidden = true; return }
      wx.hidden = false
      const t = `${Math.round(c.T)}°C　${tr('露點')} ${Math.round(c.Td)}°C`
      const v = c.fog > 0.15 ? `　${tr('能見度')} ${c.vis < 1000 ? Math.round(c.vis / 10) * 10 + ' m' : (c.vis / 1000).toFixed(1) + ' km'}` : ''
      if (wx.textContent !== t + v) wx.textContent = t + v
      wx.classList.toggle('humid', c.T - c.Td < 3)
    },
    // 畫面淡出黑、做事、淡回來（坐下休息跳時段用）
    async fadeThrough(fn) {
      fade.classList.add('on'); await new Promise((r) => setTimeout(r, 700))
      fn(); await new Promise((r) => setTimeout(r, 500))
      fade.classList.remove('on')
    },
    setHint(text) { hint.hidden = !text; if (text) hint.textContent = text },
    toast(text, sec = 2.2) { toast.textContent = text; toast.style.opacity = 1; toastT = sec },
    update(dt) { if (toastT > 0 && (toastT -= dt) <= 0) toast.style.opacity = 0 },
  }
}
