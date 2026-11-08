// 存檔：錢、裝備放 localStorage（小）；照片放 IndexedDB（每張一百多 KB，localStorage 裝不下）
const KEY = 'birdpark-save-v1'
const DEFAULT = { money: 500, owned: ['b1', 'l1'], bodyId: 'b1', lensId: 'l1', sold: 0, earned: 0 }

export function loadState() {
  try {
    const s = { ...DEFAULT, ...JSON.parse(localStorage.getItem(KEY) || '{}') }
    for (const k of ['money', 'sold', 'earned']) if (!Number.isFinite(s[k])) s[k] = DEFAULT[k]   // 壞掉的數字修回來
    return s
  } catch { return { ...DEFAULT } }
}
export function saveState(s) {
  try { localStorage.setItem(KEY, JSON.stringify(s)) } catch {}
}

// 照片資料庫
let dbp = null
function db() {
  return dbp ??= new Promise((res, rej) => {
    const r = indexedDB.open('birdpark-photos', 1)
    r.onupgradeneeded = () => r.result.createObjectStore('photos', { keyPath: 'time' })
    r.onsuccess = () => res(r.result)
    r.onerror = () => rej(r.error)
  })
}
const tx = async (mode, fn) => {
  const d = await db()
  return new Promise((res, rej) => {
    const t = d.transaction('photos', mode), s = t.objectStore('photos')
    const out = fn(s)
    t.oncomplete = () => res(out?.result ?? out)
    t.onerror = () => rej(t.error)
  })
}
export const putPhoto = (p) => tx('readwrite', (s) => s.put(p)).catch(() => {})
export const deletePhoto = (time) => tx('readwrite', (s) => s.delete(time)).catch(() => {})
export const allPhotos = () => tx('readonly', (s) => s.getAll()).then((r) => r ?? []).catch(() => [])
