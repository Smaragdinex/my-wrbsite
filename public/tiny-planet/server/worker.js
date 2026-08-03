/**
 * Tiny Planet 的多人「同場」伺服器。
 *
 * 只做一件事:把每個人的飛機狀態轉發給同一個房間裡的其他人。
 * 沒有帳號、沒有暱稱、不存任何資料 —— 連線斷掉那個人就消失。
 *
 * 為什麼用 Durable Object:Worker 本身是無狀態的,同一時間可能有好幾個實例在跑,
 * 彼此看不到對方的連線。要廣播就需要一個「所有人都連到同一個地方」的協調點,
 * 那正是 Durable Object 的用途 —— 一個房間對應一個實例。
 *
 * 設計上刻意不用計時器:DO 沒有請求在跑的時候會被回收,setInterval 會直接停掉
 * (第一版就是這樣,收得到連線但永遠不廣播)。改成「收到誰的狀態就立刻轉發給
 * 其他人」,節流交給客戶端(它本來就只送 11 Hz)。
 */

export class Room {
    constructor(state) {
        this.state = state
        this.peers = new Map()          // id -> ws
        this.nextId = 1
    }

    async fetch(request) {
        if (request.headers.get('Upgrade') !== 'websocket') {
            return new Response('expected websocket', { status: 426 })
        }
        const pair = new WebSocketPair()
        const [client, server] = Object.values(pair)
        this._accept(server)
        return new Response(null, { status: 101, webSocket: client })
    }

    _accept(ws) {
        ws.accept()
        const id = this.nextId++
        this.peers.set(id, ws)
        // 告訴他自己的編號:之後轉發的內容裡看到同一個編號就略過(不要畫出自己)
        this._send(ws, { t: 'hi', id })

        ws.addEventListener('message', ev => {
            let m
            try { m = JSON.parse(ev.data) } catch { return }
            if (m.t !== 's' || !Array.isArray(m.p) || !Array.isArray(m.q)) return
            // 只留需要的欄位,順便擋掉想塞爆訊息的內容
            const out = JSON.stringify({
                t: 'w',
                a: [{
                    id,
                    p: m.p.slice(0, 3).map(Number),
                    q: m.q.slice(0, 4).map(Number),
                    c: typeof m.c === 'string' ? m.c.slice(0, 9) : '#f2a0a8',
                }],
            })
            for (const [oid, ows] of this.peers) {
                if (oid !== id) this._raw(oid, ows, out)
            }
        })

        const bye = () => {
            if (!this.peers.delete(id)) return
            const out = JSON.stringify({ t: 'bye', id })
            for (const [oid, ows] of this.peers) this._raw(oid, ows, out)
        }
        ws.addEventListener('close', bye)
        ws.addEventListener('error', bye)
    }

    _send(ws, obj) { this._raw(null, ws, JSON.stringify(obj)) }

    /** 送到已斷的 socket 會拋 Network connection lost,一定要包起來並順手清掉 */
    _raw(id, ws, data) {
        try { ws.send(data) } catch { if (id !== null) this.peers.delete(id) }
    }
}

export default {
    async fetch(request, env) {
        const url = new URL(request.url)
        if (url.pathname !== '/ws') return new Response('tiny-planet room', { status: 200 })
        // 全世界共用一個房間。要分流的話改成用網址參數當房名即可
        const id = env.ROOM.idFromName('world')
        return env.ROOM.get(id).fetch(request)
    },
}
