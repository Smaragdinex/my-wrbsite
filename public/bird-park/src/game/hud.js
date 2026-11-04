// 畫面上的資訊：準星、錢、提示、短暫的訊息
export function createHud(root) {
  root.innerHTML = '<div class="crosshair"></div><div class="money" hidden></div><div class="clock" hidden></div><div class="fade"></div><div class="status" hidden></div><div class="hint" hidden></div><div class="toast" style="opacity:0"></div>'
  const money = root.querySelector('.money'), hint = root.querySelector('.hint'), toast = root.querySelector('.toast'), status = root.querySelector('.status'), clock = root.querySelector('.clock'), fade = root.querySelector('.fade')
  let toastT = 0
  return {
    root,
    setMoney(v) { money.hidden = false; money.textContent = `$ ${v.toLocaleString()}` },
    setStatus(text) { status.hidden = !text; if (text) status.textContent = text },
    // 時鐘：幾點幾分＋時段
    setClock(h) {
      clock.hidden = false
      const hh = Math.floor(h), mm = Math.floor((h - hh) * 60 / 10) * 10
      const part = h < 5 ? '深夜' : h < 7 ? '清晨' : h < 11 ? '早上' : h < 16 ? '白天' : h < 18.5 ? '黃昏' : '夜晚'
      clock.textContent = `${part}　${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
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
