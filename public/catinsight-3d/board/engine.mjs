// 遊戲引擎(唯一一份規則,不碰畫面):買賣、融資、放空 / 回補、股價推動、斷頭 / 軋空、資產計算。
// board.mjs(真正的遊戲)和 sim.mjs(電腦模擬、對戰工具)都呼叫這裡,所以電腦模擬的世界 = 玩家玩的世界。
//
// 狀態 st 只需要 { price, players, turn }:board 傳 S、sim 傳自己的局面,形狀一樣。
// 玩家 p 需要 { cash, hold: {k: {n, cost, loan}}, short: {k: {n, entry}} },有 flags 的話會順便記成就旗標。
// hooks:遊戲畫面需要知道的副作用 —— onLiquidate(st, who, info) / onSqueeze(st, who, info),
//        info = { k, n, back, lost }。模擬器不用傳。
export function makeEngine(D, opts = {}) {
  const { KEYS, SECTORS, buyF, sellF, shortF, MARGIN_LOAN, MAINT, SQUEEZE } = D;
  const hooks = opts.hooks || {};
  // slippage === false:舊規則(先用舊價成交再推價),只給對照實驗用
  const SLIP = opts.slippage !== false;
  const FLOOR = 8;                                                    // 股價最低 $8

  /* ───────── 計價 ───────── */
  // 成交價 = 這筆交易把價格推動「之後」的價格:買 30 股推高 12%,就用 +12% 的價格成交
  const fill = (st, k, f) => (SLIP ? Math.max(FLOOR, st.price[k] * f) : st.price[k]);
  // 空單現值:保證金 + (進場價 − 現價) × 股數
  const shortValue = (st, p, k) => { const h = p.short[k]; return h.n ? Math.max(0, h.n * (2 * h.entry - st.price[k])) : 0; };
  // 回補拿回多少:用回補這筆把價格推高之後的價格算
  const coverBack = (st, k, h) => Math.max(0, h.n * (2 * h.entry - fill(st, k, buyF(h.n))));
  // 總資產 = 現金 − 銀行貸款 + 持股市值 − 融資借款 + 空單現值
  const assetsOf = (st, p) => p.cash - p.debt + KEYS.reduce((a, k) => a + p.hold[k].n * st.price[k] - p.hold[k].loan + shortValue(st, p, k), 0);
  // 維持率看整個帳戶:所有持股市值 ÷ 所有融資借款
  const acctRatio = (st, p) => { let v = 0, l = 0; for (const k of KEYS) { v += p.hold[k].n * st.price[k]; l += p.hold[k].loan; } return l > 0 ? v / l : Infinity; };
  const ratioOf = (st, h, k) => (h.loan > 0 ? h.n * st.price[k] / h.loan : Infinity);   // 單一檔的維持率(只拿來排先砍哪一檔)
  const flag = (p, name) => { if (p && p.flags) p.flags[name] = true; };

  /* ───────── 股價推動與強制平倉 ───────── */
  // 任何一次價格變動後都檢查:帳戶維持率 < 130% → 從最差的那檔融資部位開始賣,賣到回到 130% 以上(斷頭);
  // 空單比進場價漲 30% 以上 → 強迫回補(軋空)。被迫的買賣盤又會推動價格,可能連鎖
  function marginCheck(st) {
    const by = st.players[st.turn];                                    // 這回合在走的人:把價格打下去 / 拉上去算他的(成就)
    for (const who of st.players) {
      for (let guard = 0; guard < KEYS.length && acctRatio(st, who) < MAINT; guard++) {
        let k = null; for (const x of KEYS) { if (who.hold[x].loan > 0 && (k === null || ratioOf(st, who.hold[x], x) < ratioOf(st, who.hold[k], k))) k = x; }
        if (k === null) break;
        const h = who.hold[k], n = h.n, back = Math.max(0, n * fill(st, k, sellF(n)) - h.loan), put = h.cost - h.loan;
        who.cash += back; h.n = 0; h.cost = 0; h.loan = 0;
        if (hooks.onLiquidate) hooks.onLiquidate(st, who, { k, n, back, lost: put - back });
        if (by && by !== who) flag(by, 'liquidator');
        impact(st, k, sellF(n));
      }
    }
    for (const who of st.players) for (const k of KEYS) {
      const h = who.short[k];
      if (!h.n || st.price[k] < h.entry * SQUEEZE) continue;
      squeeze(st, who, k);
      if (by && by !== who) flag(by, 'squeezer');
    }
  }
  function impact(st, k, f) { st.price[k] = Math.max(FLOOR, st.price[k] * f); marginCheck(st); }
  // 強迫回補一筆空單(軋空、迷因股事件都用這個)
  function squeeze(st, who, k) {
    const h = who.short[k], n = h.n, back = coverBack(st, k, h), put = h.entry * n;
    who.cash += back; h.n = 0; h.entry = 0;
    if (hooks.onSqueeze) hooks.onSqueeze(st, who, { k, n, back, lost: put - back });
    impact(st, k, buyF(n));
  }

  /* ───────── 交易 ───────── */
  // 買進 q 股;margin = true 用融資(自備 4 成、借 6 成)
  function buy(st, p, k, q, margin = false) {
    const h = p.hold[k], price = st.price[k], cost = fill(st, k, buyF(q)) * q, loan = margin ? cost * MARGIN_LOAN : 0;
    p.cash -= cost - loan; h.n += q; h.cost += cost; h.loan += loan;
    if (price < SECTORS[k].open * 0.97) flag(p, 'dip');                // 逢低買進
    impact(st, k, buyF(q));
    return { q, cost, loan, pay: cost - loan };
  }
  // 賣出 q 股(不傳就全賣);融資借款按賣掉的比例一起還。先把部位清掉再動價格,自己的賣壓才不會觸發自己的斷頭
  // forced = true:不是自己決定賣的(命運牌「手滑」),不算成就
  function sell(st, p, k, q = Infinity, forced = false) {
    const h = p.hold[k], sn = Math.min(q, h.n); if (!sn) return null;
    const part = sn / h.n, value = fill(st, k, sellF(sn)) * sn, cost = h.cost * part, loan = h.loan * part;
    if (!forced && (value - cost) / cost >= 0.15) flag(p, 'profit');   // 獲利了結
    if (!forced && loan > 0 && value > cost) flag(p, 'marginWin');     // 借力使力:融資部位獲利出場
    p.cash += value - loan; h.n -= sn; h.cost -= cost; h.loan -= loan;
    if (h.n <= 0) { h.n = 0; h.cost = 0; h.loan = 0; }
    impact(st, k, sellF(sn));
    return { n: sn, value, cost, loan, pl: value - cost };
  }
  // 放空 q 股:用壓低後的價格進場,付出等額保證金
  function short(st, p, k, q) {
    const sh = p.short[k], e = fill(st, k, shortF(q));
    p.cash -= e * q; sh.entry = e; sh.n = q;
    impact(st, k, shortF(q));
    return { q, entry: e, pay: e * q };
  }
  // 自己回補整筆空單
  function cover(st, p, k) {
    const sh = p.short[k], n = sh.n; if (!n) return null;
    const back = coverBack(st, k, sh), pl = back - sh.entry * n, r = pl / (sh.entry * n);
    if (r >= 0.15) flag(p, 'profit');
    if (r >= 0.2) flag(p, 'shortWin');                                 // 空軍總司令
    p.cash += back; sh.n = 0; sh.entry = 0;
    impact(st, k, buyF(n));
    return { n, back, pl };
  }
  // act = { a: 'buy'|'margin'|'sell'|'short'|'cover'|'skip', q }
  function trade(st, p, k, act) {
    if (act.a === 'buy' || act.a === 'margin') return buy(st, p, k, act.q, act.a === 'margin');
    if (act.a === 'sell') return sell(st, p, k, act.q);
    if (act.a === 'short') return short(st, p, k, act.q);
    if (act.a === 'cover') return cover(st, p, k);
    return null;
  }

  return { fill, shortValue, coverBack, assetsOf, acctRatio, ratioOf, marginCheck, impact, squeeze, buy, sell, short, cover, trade, SLIP };
}
