// 貓咪股市大富翁 全球排行榜
//   GET  /api/board/top?limit=10        前 N 名
//   POST /api/board/submit  {name,char,assets,rounds,players,ai,lang}   回傳 {rank, top}
// 遊戲規則都在前端,所以分數是可以偽造的;這裡只做合理性檢查 + 每個 IP 的頻率限制,擋掉亂送的。
const CHARS = new Set(['cat', 'bunny', 'bear', 'dog', 'penguin', 'guinea', 'fox', 'pony']);
const AI = new Set(['easy', 'normal', 'hard']);
const MAX_ASSETS = 300000;        // 20~40 回合、起始 $10,000,正常玩不可能超過這個數
const MAX_PER_HOUR = 12;          // 同一個 IP 一小時最多送幾筆

const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });

async function sha256(s) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].slice(0, 12).map((b) => b.toString(16).padStart(2, '0')).join('');
}
const clean = (s, max) => String(s ?? '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, max);

async function top(env, limit) {
  const { results } = await env.DB.prepare('SELECT name, char, assets, rounds, players, ai, created_at FROM records ORDER BY assets DESC, created_at ASC LIMIT ?').bind(limit).all();
  return results;
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (req.method === 'GET' && url.pathname === '/api/board/top') {
      const limit = Math.min(50, Math.max(1, +url.searchParams.get('limit') || 10));
      return json({ top: await top(env, limit) });
    }
    if (req.method === 'POST' && url.pathname === '/api/board/submit') {
      let b; try { b = await req.json(); } catch { return json({ error: 'bad json' }, 400); }
      const name = clean(b.name, 12), char = String(b.char || ''), ai = String(b.ai || 'normal'), lang = clean(b.lang, 5) || 'zh';
      const assets = Math.round(+b.assets), rounds = +b.rounds, players = +b.players;
      if (!name) return json({ error: 'name' }, 400);
      if (!CHARS.has(char) || !AI.has(ai)) return json({ error: 'char/ai' }, 400);
      if (!Number.isFinite(assets) || assets < 0 || assets > MAX_ASSETS) return json({ error: 'assets' }, 400);
      if (![20, 25, 30, 35, 40].includes(rounds) || players < 2 || players > 4) return json({ error: 'rounds/players' }, 400);
      const ip = req.headers.get('cf-connecting-ip') || '0', ipHash = await sha256(ip + (env.SALT || 'catstreet')), now = Math.floor(Date.now() / 1000);
      const recent = await env.DB.prepare('SELECT COUNT(*) AS n FROM records WHERE ip_hash = ? AND created_at > ?').bind(ipHash, now - 3600).first('n');
      if (recent >= MAX_PER_HOUR) return json({ error: 'too many' }, 429);
      await env.DB.prepare('INSERT INTO records (name, char, assets, rounds, players, ai, lang, ip_hash, created_at) VALUES (?,?,?,?,?,?,?,?,?)')
        .bind(name, char, assets, rounds, players, ai, lang, ipHash, now).run();
      const rank = 1 + (await env.DB.prepare('SELECT COUNT(*) AS n FROM records WHERE assets > ?').bind(assets).first('n'));
      return json({ rank, top: await top(env, 10) });
    }
    return json({ error: 'not found' }, 404);
  },
};
