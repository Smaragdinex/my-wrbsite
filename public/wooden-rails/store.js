/**
 * 進度儲存。
 *
 * 平常就是 localStorage。在 CrazyGames 上,SDK 初始化完成後改走它的 Data Module ——
 * 那是同一組 getItem/setItem 介面,但資料綁在玩家帳號上,換裝置接得回來。
 *
 * 麻煩的地方是時序:遊戲一載入就要知道解鎖到第幾關,而 SDK.init() 是非同步的。
 * 所以先讀本機的把遊戲跑起來,等 SDK 好了再對一次帳 —— 解鎖關卡取兩邊較多的那個,
 * 不會因為換裝置而倒退。
 *
 * 每一個對 SDK 的呼叫都包 try/catch:在 CrazyGames 以外的網域(官網、本機測試)
 * 根本沒有這個物件,遊戲不能因此壞掉。
 */

let remote = null          // SDK 的 data module,初始化完成才會有

export function get(key) {
    try { return (remote || localStorage).getItem(key) } catch (e) { return null }
}

export function set(key, val) {
    // 本機一定要寫:Data Module 有 1 秒的節流,而且訪客模式本來就是存 localStorage
    try { localStorage.setItem(key, val) } catch (e) {}
    try { remote?.setItem(key, val) } catch (e) {}
}

/**
 * 等 SDK 初始化完成後接上 Data Module。
 * @param onReady 收到一個「讀雲端」的函式,由呼叫端決定怎麼合併與刷新畫面
 */
export async function connect(onReady) {
    const sdk = window.CrazyGames?.SDK
    if (!sdk) return                            // 不在 CrazyGames 上,維持 localStorage
    try { await sdk.init() } catch (e) { return }
    if (!sdk.data) return
    const read = k => { try { return sdk.data.getItem(k) } catch (e) { return null } }
    // 先接上再回呼 —— onReady 裡面會寫值(把本機較新的進度推上去),
    // 晚一步接的話那些寫入只會進 localStorage,雲端永遠是舊的
    remote = sdk.data
    onReady?.(read)
}
