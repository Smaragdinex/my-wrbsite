// 畫面上的資訊：準星、錢、提示、短暫的訊息
export function createHud(root) {
  root.innerHTML = '<div class="crosshair"></div><div class="money" hidden></div><div class="status" hidden></div><div class="hint" hidden></div><div class="toast" style="opacity:0"></div>'
  const money = root.querySelector('.money'), hint = root.querySelector('.hint'), toast = root.querySelector('.toast'), status = root.querySelector('.status')
  let toastT = 0
  return {
    root,
    setMoney(v) { money.hidden = false; money.textContent = `$ ${v.toLocaleString()}` },
    setStatus(text) { status.hidden = !text; if (text) status.textContent = text },
    setHint(text) { hint.hidden = !text; if (text) hint.textContent = text },
    toast(text, sec = 2.2) { toast.textContent = text; toast.style.opacity = 1; toastT = sec },
    update(dt) { if (toastT > 0 && (toastT -= dt) <= 0) toast.style.opacity = 0 },
  }
}
