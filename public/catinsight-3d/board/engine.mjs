// 遊戲引擎(唯一一份規則,不碰畫面):買賣、融資、放空 / 回補、股價推動、斷頭 / 軋空、資產計算。
// board.mjs(真正的遊戲)和 sim.mjs(電腦模擬、對戰工具)都呼叫這裡,所以電腦模擬的世界 = 玩家玩的世界。
//
// 狀態 st 只需要 { price, players, turn }:board 傳 S、sim 傳自己的局面,形狀一樣。
// 玩家 p 需要 { cash, hold: {k: {n, cost, loan}}, short: {k: {n, entry}} },有 flags 的話會順便記成就旗標。
// hooks:遊戲畫面需要知道的副作用 —— onLiquidate(st, who, info) / onSqueeze(st, who, info),
//        info = { k, n, back, lost }。模擬器不用傳。
export function makeEngine(D, opts = {}) {
  const { KEYS, SECTORS, buyF, sellF, shortF, MARGIN_LOAN, MAINT, SQUEEZE, SALARY, MARGIN_FEE, BANK_RATE, DIV_ROUND,
    NON_EQUITY, MARKET_DRIFT = 0, DIV_STEP = 0.01, DIV_MAX = 0.08, DIV_MIN = 0.005, DIV_UP_PRICE = 1.04, DIV_CUT_PRICE = 0.92 } = D;
  const EQ = KEYS.filter((k) => !NON_EQUITY.has(k));                                   // 股票類股(大盤 ETF = 它們的平均)
  const ONES = Object.fromEntries(KEYS.map((k) => [k, 1]));
  const DIV_PAYERS = KEYS.filter((k) => SECTORS[k].div > 0 && k !== 'etf' && k !== 'bond');   // 股利事件只挑原本就有配息的公司
  const DRIFT = opts.drift ?? MARKET_DRIFT, DRIFTS = (k) => k === 'etf' || !NON_EQUITY.has(k);   // 大盤長期趨勢:股票和大盤 ETF
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

  /* ───────── 配息、薪水、利息 ───────── */
  // 殖利率是每局動態的(st.div,股利事件會改)。dividends:這位玩家持股的「全額」股利(股息格、特別股利牌)
  const dividendsOf = (st, p) => KEYS.reduce((a, k) => a + p.hold[k].n * st.price[k] * st.div[k], 0);
  // 每回合配息:每位玩家領年率的 DIV_ROUND(四分之一),四捨五入。回傳有領到錢的 [{ p, div }](畫面拿去跳提示)
  function roundDividends(st) {
    const paid = [];
    for (const p of st.players) {
      const div = Math.round(KEYS.reduce((a, k) => a + p.hold[k].n * st.price[k] * st.div[k] * DIV_ROUND, 0));
      if (div <= 0) continue;
      p.cash += div; p.divTotal = (p.divTotal || 0) + div; p.lastDividend = div;
      paid.push({ p, div });
    }
    return paid;
  }
  // 經過起點(atStart):領薪水(升職加薪時加倍,用掉就恢復),付融資利息和銀行貸款利息;
  // 股息格 / 特別股利(!atStart):領全額股利。回傳各項金額給畫面顯示
  function payday(st, p, atStart) {
    const salary = atStart ? SALARY * (p.salary2 ? 2 : 1) : 0; if (atStart) p.salary2 = false;
    const div = atStart ? 0 : dividendsOf(st, p);
    const interest = atStart ? KEYS.reduce((a, k) => a + p.hold[k].loan * MARGIN_FEE, 0) : 0, bank = atStart ? p.debt * BANK_RATE : 0;
    p.cash += salary + div - (interest + bank);
    if (!atStart) { p.lastDividend = div; p.divTotal = (p.divTotal || 0) + div; }   // 股息格的股利也算進成就(領到股利、股息大戶)
    return { salary, div, interest, bank };
  }

  /* ───────── 事件卡 ───────── */
  // 有些牌要「抽到的當下」才決定內容(rand:亂數來源,遊戲傳 Math.random、模擬器傳自己的種子亂數):
  //   divUp:隨機挑 n 家有配息、但不是目前配最多的公司,殖利率 +1 個百分點、股價 +4%
  //   divCut:'top' 配最多的那家(同分隨機)/ 'any' 隨機一家,殖利率 −1 個百分點(最低 0.5%)、股價 −8%
  //   meme:場上被放空最多的那檔(沒人放空就隨機一檔股票)暴漲 50%,所有空單強迫回補
  // 回傳新的事件物件;divTo 記好「從幾 % 到幾 %」,牌面顯示和生效用同一組數字。標題由畫面自己加
  function instantiate(st, e, rand) {
    if (e.divUp || e.divCut) {
      let keys;
      if (e.divUp) { const top = Math.max(...DIV_PAYERS.map((k) => st.div[k])); keys = DIV_PAYERS.filter((k) => st.div[k] < top - 1e-9 && st.div[k] < DIV_MAX - 1e-9).sort(() => rand() - 0.5).slice(0, e.divUp); }
      else { let pool = DIV_PAYERS.filter((k) => st.div[k] > DIV_MIN + 1e-9); if (e.divCut === 'top') { const top = Math.max(...pool.map((k) => st.div[k])); pool = pool.filter((k) => st.div[k] >= top - 1e-9); } keys = pool.length ? [pool[Math.floor(rand() * pool.length)]] : []; }
      const up = !!e.divUp, m = { ...ONES }; keys.forEach((k) => { m[k] = up ? DIV_UP_PRICE : DIV_CUT_PRICE; }); m.etf = EQ.reduce((a, x) => a + m[x], 0) / EQ.length;
      const divTo = Object.fromEntries(keys.map((k) => [k, [st.div[k], up ? Math.min(DIV_MAX, st.div[k] + DIV_STEP) : Math.max(DIV_MIN, st.div[k] - DIV_STEP)]]));
      return { ...e, m, divKeys: keys, divTo };
    }
    if (!e.meme) return e;
    const tot = (k) => st.players.reduce((a, p) => a + p.short[k].n, 0);
    const k = EQ.some((x) => tot(x) > 0) ? EQ.slice().sort((a, b) => tot(b) - tot(a))[0] : EQ[Math.floor(rand() * EQ.length)];
    return { ...e, m: { ...ONES, [k]: 1.5, etf: Math.round((1 + 0.5 / EQ.length) * 100) / 100 }, squeezeAll: k };
  }
  // 事件生效:改股價、發錢、改殖利率、記下崩盤後的反彈(st.after,下一回合開始時套用),再檢查斷頭 / 軋空
  function applyEvent(st, e) {
    const bad = (e.m.etf || 1) < 0.97, worth = (p) => KEYS.reduce((a, k) => a + p.hold[k].n * st.price[k], 0), before = bad ? st.players.map(worth) : null;
    KEYS.forEach((k) => { st.price[k] *= e.m[k]; });
    if (bad) st.players.forEach((p, i) => { if (before[i] > 0 && worth(p) > before[i]) flag(p, 'dodge'); });   // 壞消息裡持股反而漲:躲過黑天鵝
    if (e.cash) st.players.forEach((p) => { p.cash += e.cash; });
    if (e.divTo) e.divKeys.forEach((k) => { st.div[k] = e.divTo[k][1]; });
    if (e.rebound) st.after = { m: Object.fromEntries(KEYS.map((k) => [k, e.m[k] < 1 ? 1 + (1 / e.m[k] - 1) * e.rebound : 1])), from: e };   // 跌掉的部分下回合漲回 rebound 比例
    marginCheck(st);
    if (e.squeezeAll) for (const p of st.players) { if (p.short[e.squeezeAll].n) squeeze(st, p, e.squeezeAll); }
  }
  // 新的一回合開始:回合數 +1 → 每回合配息 → 套用上回合留下的反彈 → 所有價格小幅隨機波動(股票和大盤 ETF 再加上長期趨勢)
  // 回傳 { paid: 領到配息的人, after: 套用的反彈事件 } 給畫面顯示
  function newRound(st, rand) {
    st.rolls++;
    const paid = roundDividends(st), after = st.after;
    if (after) { st.after = null; applyEvent(st, after); }
    KEYS.forEach((k) => { const v = SECTORS[k].vol ?? 0.03; st.price[k] = Math.max(FLOOR, st.price[k] * (1 - v + rand() * v * 2) * (DRIFTS(k) ? 1 + DRIFT : 1)); });
    return { paid, after };
  }

  return { instantiate, applyEvent, newRound, roundDividends, payday, dividendsOf, fill, shortValue, coverBack, assetsOf, acctRatio, ratioOf, marginCheck, impact, squeeze, buy, sell, short, cover, trade, SLIP };
}
