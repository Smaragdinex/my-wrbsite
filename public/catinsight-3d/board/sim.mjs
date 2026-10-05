import { makeEngine } from './engine.mjs?v=5';
// 遊戲模擬器(純邏輯,不碰畫面)。兩個用途:
//   1. board.mjs 裡的電腦對手用它做「蒙地卡羅模擬」:每個決策把後面幾回合隨機跑很多次,挑平均最好的那個動作
//   2. Node 可以直接 import,讓三種電腦(規則 / 期望值 / 蒙地卡羅)互打幾百局,算勝率(tournament.mjs)
// 規則照 board.mjs 搬過來:骰子、走格、起點薪水、每回合配息、融資維持率 130% 斷頭、放空軋空、事件卡、命運牌、
// 警察局 / IPO 小路、商店、銀行。畫面才有的東西(動畫、任務成就、聊天)不在這裡;道具只保留利空卡(其他對模擬結果影響很小)。
//
// 三種電腦策略(policy):
//   rule  規則式:固定規則(漲 15% 賣、便宜就買、永遠擲兩顆)
//   ev    期望值:擲骰用「前方每格的分數 × 機率」算期望值;買賣用「事件卡的平均漲跌 + 配息 − 風險」算每檔的期望報酬
//   mc    蒙地卡羅:每個決策(擲幾顆、買賣多少)對每個候選動作模擬後面 D 回合 × N 次,取平均資產領先幅度最高的
export function makeSim(D, opts = {}) {
  const { MARKET_DRIFT = 0, DIV_STEP = 0.01, DIV_MAX = 0.08, DIV_MIN = 0.005, DIV_UP_PRICE = 1.04, DIV_CUT_PRICE = 0.92, SECTORS, KEYS, TILES, NON_EQUITY, EVENTS, ONES, FATE, LOT, START_CASH, SALARY, FEE, DIV_ROUND, BAIL, JAIL_WAIT, LANE_LEN, IPO_OFF, IPO_FREE,
    SPECIAL_RATE, BANK_MAX, BANK_RATE, MARGIN_LOAN, MAINT, MARGIN_FEE, SQUEEZE, buyF, sellF, shortF, ATK_DROP, ATK_PRICE } = D;
  const EQ = KEYS.filter((k) => !NON_EQUITY.has(k));
  const DRIFT = opts.drift ?? MARKET_DRIFT, DRIFTS = (k) => k === 'etf' || !NON_EQUITY.has(k);
  // 自己的亂數(mulberry32):可以重設種子 → 蒙地卡羅比較不同動作時用「同一組未來」(common random numbers),雜訊小很多
  let seed = (opts.seed ?? Math.floor(Math.random() * 2 ** 31)) | 0;
  const rand = () => { seed = (seed + 0x6D2B79F5) | 0; let t = seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const getSeed = () => seed, setSeed = (x) => { seed = x | 0; };
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];

  // 難度參數(和 board.mjs 的 AI_LEVELS 一樣):reserve 現金底線、lots 一次最多買幾手、greedy 融資機率、shortP 放空機率…
  const LEVELS = {
    easy:   { shortP: 0.15, atkP: 0.3, greedy: 0.1, reserve: 2500, shortAny: false, lots: 2, buyP: 0.6 },
    normal: { shortP: 0.35, atkP: 0.8, greedy: 0.3, reserve: 1500, shortAny: false, lots: 3, buyP: 1 },
    hard:   { shortP: 0.5,  atkP: 1,   greedy: 0.5, reserve: 800,  shortAny: true,  lots: 5, buyP: 1 },
  };
  // 蒙地卡羅的預算:每個候選動作模擬 n 次、每次往後看 depth 回合
  // z:只有比「期望值策略的建議」好超過 z 個標準誤才換動作(避免挑到雜訊);z = 0 就是單純挑平均最高的
  const MC = Object.assign({ n: 120, depth: 3, score: 'lead', z: 1.5 }, opts.mc || {});

  /* ───────── 狀態 ───────── */
  const mkPlayer = (i, alg = 'ev', level = 'normal') => ({ i, alg, lv: LEVELS[level] || LEVELS.normal, cash: START_CASH, debt: 0, pos: 0, lane: null, bag: [], salary2: false, plan: null,
    hold: Object.fromEntries(KEYS.map((k) => [k, { n: 0, cost: 0, loan: 0 }])), short: Object.fromEntries(KEYS.map((k) => [k, { n: 0, entry: 0 }])) });
  const newGame = (algs, maxRounds = 20, levels = []) => ({
    price: Object.fromEntries(KEYS.map((k) => [k, SECTORS[k].open])), div: Object.fromEntries(KEYS.map((k) => [k, SECTORS[k].div])), rolls: 0, maxRounds, turn: 0, after: null, over: false, lanePath: {},
    players: algs.map((a, i) => mkPlayer(i, a, levels[i] || 'normal')),
  });
  const clonePlayer = (p) => ({ ...p, lane: p.lane ? { ...p.lane } : null, bag: p.bag.slice(), plan: p.plan ? { ...p.plan } : null,
    hold: Object.fromEntries(KEYS.map((k) => [k, { n: p.hold[k].n, cost: p.hold[k].cost, loan: p.hold[k].loan }])),
    short: Object.fromEntries(KEYS.map((k) => [k, { n: p.short[k].n, entry: p.short[k].entry }])) });
  const clone = (st) => ({ ...st, price: { ...st.price }, div: { ...st.div }, after: st.after ? { ...st.after } : null, lanePath: { ...st.lanePath }, players: st.players.map(clonePlayer) });

  /* ───────── 基本算式 ───────── */
  // 買賣、融資、放空、斷頭 / 軋空、資產計算全部用遊戲引擎(engine.mjs),和真正的遊戲是同一份規則
  const ENG = makeEngine(D, { slippage: opts.slippage, drift: opts.drift });
  const { shortValue, assetsOf, acctRatio, marginCheck, impact, coverBack } = ENG;
  const fill = ENG.fill;
  const others = (st, p) => st.players.filter((q) => q !== p);
  const leader = (st, p) => others(st, p).sort((a, b) => assetsOf(st, b) - assetsOf(st, a))[0];

  /* ───────── 交易動作 ───────── */
  // act = { a: 'buy'|'margin'|'sell'|'short'|'cover'|'skip', q }
  // 現金扣掉 reserve 之後,最多買得起幾手(上限 max 手),用真正的成交價算
  const maxLots = (st, p, k, max, reserve) => { for (let l = max; l > 0; l--) if (p.cash - fill(st, k, buyF(LOT * l)) * LOT * l >= reserve) return l; return 0; };
  const doTrade = (st, p, k, act) => { ENG.trade(st, p, k, act); };
  // 這一格可以做哪些動作(給蒙地卡羅列候選用)
  function tradeOptions(st, p, k) {
    const h = p.hold[k], sh = p.short[k], price = st.price[k], out = [{ a: 'skip' }];
    if (sh.n) { out.push({ a: 'cover' }); return out; }
    if (h.n) out.push({ a: 'sell' });
    for (const lots of [1, 2, 3, 5]) { if (p.cash >= fill(st, k, buyF(LOT * lots)) * LOT * lots) out.push({ a: 'buy', q: LOT * lots }); }
    if (!h.loan && p.cash >= fill(st, k, buyF(LOT * 3)) * LOT * 3 * (1 - MARGIN_LOAN)) out.push({ a: 'margin', q: LOT * 3 });
    if (!h.n && p.cash >= fill(st, k, shortF(LOT)) * LOT) out.push({ a: 'short', q: LOT });
    return out;
  }

  /* ───────── 事件、命運 ───────── */
  // 事件卡:抽到時決定內容、生效,都用遊戲引擎(和真正的遊戲同一份規則)
  const instantiate = (st, e) => ENG.instantiate(st, e, rand);
  const applyEvent = (st, e) => ENG.applyEvent(st, e);
  const randomEvent = (st) => instantiate(st, pick(EVENTS));
  // 市場事件格:三張牌裡有 SPECIAL_RATE 的機率混一張特殊牌(警察局 / IPO),電腦隨機挑 → 抽到特殊牌的機率 = SPECIAL_RATE / 3
  function chance(st, p, special) {
    if (special && rand() < SPECIAL_RATE / 3) { enterLane(st, p, rand() < 0.5 ? 'jail' : 'ipo'); return; }
    applyEvent(st, randomEvent(st));
  }
  const payday = (st, p, atStart) => { ENG.payday(st, p, atStart); };

  // 命運牌:效果在引擎;瞬間移動要重新結算換到的那一格、IPO 要進小路
  function applyFate(st, p, c) {
    const r = ENG.fate(st, p, c, rand);
    if (r.other) land(st, p, true);
    if (r.lane) enterLane(st, p, r.lane);
  }


  /* ───────── 小路、移動(規則在引擎,這裡是電腦的決定)───────── */
  function enterLane(st, p, type) { ENG.enterLane(st, p, type, rand); if (type === 'ipo') ipo(st, p); }
  // 電腦在 IPO 攤位加購幾手:現金夠就買 3 手,不然 1 手(遊戲裡的電腦也用這個)
  const ipoLots = (st, p, k) => { const price = st.price[k] * IPO_OFF; return p.cash >= price * LOT * 3 + 1500 ? 3 : p.cash >= price * LOT + 500 ? 1 : 0; };
  function ipo(st, p) { const k = ENG.ipoPick(st, p, rand); ENG.ipoGrant(st, p, k); const lots = ipoLots(st, p, k); if (lots) ENG.ipoBuy(st, p, k, LOT * lots); }
  function walk(st, p, n) { for (let i = 0; i < n; i++) ENG.advance(st, p); }
  const leaveLane = (st, p) => walk(st, p, ENG.dice(1, 0, rand)[0]);

  /* ───────── 踩格 ───────── */
  function land(st, p, relanding = false) {
    if (p.lane) {
      if (!p.lane.at) return;                                   // 還在攤位 / 警察局裡
      const k = ENG.tileType(st, p, rand);
      if (k === '_chance') chance(st, p, false); else if (k === 'fate') applyFate(st, p, pick(FATE));
      else if (k === '_gift') gift(p); else ENG.pathEffect(st, p, k);
      return;
    }
    const t = TILES[p.pos];
    if (SECTORS[t]) { const act = decideTrade(st, p, t); doTrade(st, p, t, act); }
    else if (t === 'chance') chance(st, p, true);
    else if (t === 'fate') applyFate(st, p, pick(FATE));
    else if (t === 'ipo') enterLane(st, p, 'ipo');
    else if (t === 'fee') ENG.payFee(st, p);
    else if (t === 'gift') gift(p);
    else if (t === 'shop') { if (p.cash >= ATK_PRICE + p.lv.reserve && rand() < p.lv.atkP * 0.5) ENG.buyItem(st, p, 'atk', ATK_PRICE); }
    else if (t === 'bank') {
      if (p.debt > 0 && p.cash >= p.debt + 4000) ENG.bank(st, p, -p.debt);
      else if (p.cash < 1500 && p.debt + 2000 <= BANK_MAX) ENG.bank(st, p, Math.min(3000, BANK_MAX - p.debt));
    }
    marginCheck(st);
  }
  const gift = (p) => { if (rand() < 0.25) p.bag.push('atk'); };
  function useAtk(st, p) {
    const T = leader(st, p); if (!T) return;
    const k = KEYS.filter((x) => T.hold[x].n > 0).sort((x, y) => T.hold[y].n * st.price[y] - T.hold[x].n * st.price[x])[0];
    if (!k) return;
    p.bag.splice(p.bag.indexOf('atk'), 1); st.price[k] *= ATK_DROP; marginCheck(st);
  }

  /* ───────── 一個人的回合 ───────── */
  // forced:蒙地卡羅指定這回合擲幾顆 { dice: 1|2 }(只對第一步有效,之後都交給 policy)
  function playTurn(st, p, forced = null) {
    if (p.lane) {
      if (p.lane.type === 'jail' && p.lane.wait > 0) {
        if (p.cash >= BAIL + 2500) { ENG.bail(st, p); leaveLane(st, p); }   // 電腦:現金夠多就付保釋金
        else { ENG.rest(st, p); afterMove(st, p); return; }
      } else leaveLane(st, p);
    } else {
      if (p.bag.includes('atk') && rand() < p.lv.atkP) useAtk(st, p);
      const nd = forced && forced.dice ? forced.dice : decideDice(st, p);
      walk(st, p, ENG.dice(nd === 1 ? 1 : 2, 0, rand).reduce((a, b) => a + b, 0));
    }
    afterMove(st, p);
    land(st, p);
  }
  function afterMove(st, p) {
    if (p.i === 0) {       // 第一位走完 = 新回合:回合數 +1、配息、反彈、所有價格小幅隨機波動
      ENG.newRound(st, rand);                                  // 回合數 +1、配息、反彈、價格隨機波動 + 大盤趨勢(引擎)
    }
    marginCheck(st);
  }
  // 從 st.turn 那位開始走,直到 untilRolls 回合結束(或遊戲結束)
  function run(st, untilRolls, forcedFirst = null) {
    let first = true;
    while (!st.over) {
      const p = st.players[st.turn];
      playTurn(st, p, first ? forcedFirst : null); first = false;
      if (opts.onTurn) opts.onTurn(st, p);
      st.turn = (st.turn + 1) % st.players.length;
      if (st.turn === 0) { applyEvent(st, randomEvent(st)); if (st.rolls >= st.maxRounds) { st.over = true; break; } }
      if (st.rolls >= untilRolls && st.turn === 0) break;
    }
    return st;
  }
  const playGame = (st) => run(st, Infinity);

  /* ───────── 策略:規則式 ───────── */
  function focus(st, p) {
    if (p.plan && (p.hold[p.plan.k].n > 0 || st.rolls - p.plan.since < 6)) return p.plan.k;
    const score = (k) => { const sec = SECTORS[k], pr = st.price[k]; let v = (sec.open / pr - 1) * 10 + st.div[k] * 40;
      if (p.hold[k].n) v += 2 + Math.min(3, p.hold[k].n / 10); if (NON_EQUITY.has(k)) v -= 1.5;
      if (others(st, p).some((q) => q.short[k].n > 0)) v += 1; return v + rand(); };
    const k = KEYS.slice().sort((a, b) => score(b) - score(a))[0]; p.plan = { k, since: st.rolls }; return k;
  }
  function ruleTrade(st, p, k) {
    const h = p.hold[k], sh = p.short[k], price = st.price[k], sec = SECTORS[k], lv = p.lv, F = focus(st, p);
    const mine = Math.max(0, ...others(st, p).map((q) => q.hold[k].n));
    if (sh.n) return Math.abs((sh.entry - price) / sh.entry) >= 0.12 ? { a: 'cover' } : { a: 'skip' };
    if (h.n && (price * h.n - h.cost) / h.cost >= (k === F ? 0.35 : 0.15)) { if (k === F) p.plan = null; return { a: 'sell' }; }
    if (k === F) {
      const lots = maxLots(st, p, k, lv.lots, lv.reserve);
      if (lots < lv.lots && !h.loan && rand() < lv.greedy && p.cash >= fill(st, k, buyF(LOT * lv.lots)) * LOT * lv.lots * (1 - MARGIN_LOAN) + 500) return { a: 'margin', q: LOT * lv.lots };
      return lots > 0 ? { a: 'buy', q: LOT * lots } : { a: 'skip' };
    }
    if (!h.n && p.cash >= price * LOT + lv.reserve && rand() < lv.shortP && mine >= 30 && price > sec.open * (lv.shortAny ? 1.05 : 1.15)) return { a: 'short', q: LOT };
    const rich = p.cash >= 6000;
    const lots = price < sec.open * 0.93 && p.cash >= price * LOT * 2 + lv.reserve + 1500 ? (rich ? 3 : 2) : price < sec.open * 1.05 && p.cash >= price * LOT + lv.reserve + 1500 ? (rich && h.n ? 2 : 1) : 0;
    const ok = lots ? maxLots(st, p, k, lots, lv.reserve) : 0;
    return ok && rand() < lv.buyP ? { a: 'buy', q: LOT * ok } : { a: 'skip' };
  }

  /* ───────── 策略:期望值 ───────── */
  // 每檔資產「一張事件卡平均會讓它漲跌多少」(μ)和波動(σ),從 EVENTS 資料直接算出來
  const EVSTAT = Object.fromEntries(KEYS.map((k) => { const xs = EVENTS.map((e) => (e.meme || e.divUp || e.divCut ? 0 : e.m[k] - 1)); const mu = xs.reduce((a, b) => a + b, 0) / xs.length;
    const sd = Math.sqrt(xs.reduce((a, b) => a + (b - mu) ** 2, 0) / xs.length); return [k, { mu, sd }]; }));
  const EVENTS_PER_ROUND = (st) => 1 + 10 / TILES.length * st.players.length;          // 每回合固定一張 + 踩到事件格的
  // 期望值策略的參數(tools/tournament.mjs 掃過,預設是最好的那組;可以用 opts.ev 覆蓋做實驗)
  //   risk 風險懲罰、buyTh 期望報酬超過多少才買、step 每多幾 % 多買一手、cheap 比開盤便宜的加分、
  //   rebound 知道「崩盤後下回合會反彈」、endSell 最後一回合清倉、takeProfit 賺多少就賣(0 = 不因為賺錢賣)
  // 2026-10 規則修正後(成交價含推動、牌組平衡)重新掃過:長期抱著、不因賺錢賣、股利蓋得過利息就融資(維持率留 200% 以上)、
  // 知道崩盤後會反彈。舊參數 { risk 0.35, buyTh 0.025, cheap 0.15, endSell, takeProfit 0.35 } 對規則式勝率 54%,這組約 60%
  const EVP = Object.assign({ risk: 0.15, buyTh: 0, step: 0.02, cheap: 0, rebound: true, endSell: false, takeProfit: 0, sellTh: -0.01, lever: true, safeRatio: 2.0, reserve: 500, maxLots: 5 }, opts.ev || {});
  // 持有一檔到遊戲結束的期望報酬率(扣掉風險)
  function evOf(st, k, p) {
    const left = Math.max(1, st.maxRounds - st.rolls), ev = EVENTS_PER_ROUND(st) * left, s = EVSTAT[k];
    const drift = s.mu * ev, div = st.div[k] * DIV_ROUND * left, risk = EVP.risk * s.sd * Math.sqrt(ev) / Math.sqrt(Math.max(1, left));
    const cheap = (SECTORS[k].open / st.price[k] - 1) * EVP.cheap;
    const reb = EVP.rebound && st.after ? st.after.m[k] - 1 : 0;                              // 下回合確定會反彈的部分(黑色星期一)
    return drift + div - risk + cheap + reb + (DRIFTS(k) ? DRIFT * left : 0);   // 大盤長期漲幅也算進去
  }
  function evTrade(st, p, k) {
    const h = p.hold[k], sh = p.short[k], price = st.price[k], lv = p.lv, e = evOf(st, k, p), left = st.maxRounds - st.rolls, reserve = EVP.reserve ?? lv.reserve;
    if (sh.n) { const r = (sh.entry - price) / sh.entry; return (e > 0.02 || Math.abs(r) >= 0.12 || (EVP.endSell && left <= 1)) ? { a: 'cover' } : { a: 'skip' }; }
    const pl = h.n ? (price * h.n - h.cost) / h.cost : 0;
    if (h.n && (e < EVP.sellTh || (EVP.takeProfit && pl >= EVP.takeProfit) || (EVP.endSell && left <= 1))) return { a: 'sell' };
    if (left <= 1) return { a: 'skip' };
    if (e > EVP.buyTh) {
      const want = Math.min(EVP.maxLots ?? lv.lots, Math.max(1, Math.floor(e / EVP.step))), lots = maxLots(st, p, k, want, reserve);
      if (lots <= 0) return { a: 'skip' };
      if (EVP.lever) {
        // 融資:這檔每回合的股利 > 借款每回合的利息(每 8 回合左右經過起點付 2%),而且買完整個帳戶的維持率還在 safeRatio 以上才借
        const px = fill(st, k, buyF(LOT * want)), cost = px * LOT * want, loan = cost * MARGIN_LOAN;
        let v = 0, l = 0; for (const x of KEYS) { v += p.hold[x].n * st.price[x]; l += p.hold[x].loan; }
        const ratioAfter = (v + cost) / (l + loan), carry = st.div[k] * DIV_ROUND - MARGIN_FEE / 8;
        if (carry > 0 && ratioAfter >= EVP.safeRatio && p.cash >= cost - loan + reserve) return { a: 'margin', q: LOT * want };
      } else if (e > 0.08 && !h.loan && rand() < lv.greedy && p.cash >= fill(st, k, buyF(LOT * want)) * LOT * want * (1 - MARGIN_LOAN) + lv.reserve) return { a: 'margin', q: LOT * want };
      return { a: 'buy', q: LOT * lots };
    }
    if (e < -0.04 && !h.n && p.cash >= price * LOT + lv.reserve && rand() < lv.shortP) return { a: 'short', q: LOT };
    return { a: 'skip' };
  }
  // 走到前方第 i 格有多好(擲骰期望值用)
  function tileScore(st, p, i) {
    const t = TILES[(p.pos + i) % TILES.length], sec = SECTORS[t]; let v = 0;
    if (sec) { const h = p.hold[t], sh = p.short[t], e = evOf(st, t, p);
      if (h.n && (st.price[t] * h.n - h.cost) / h.cost >= 0.15) v += 3; else if (sh.n && Math.abs((sh.entry - st.price[t]) / sh.entry) >= 0.12) v += 2;
      else if (h.loan > 0 && acctRatio(st, p) < 1.5) v += 2;
      else v += Math.max(0.3, Math.min(4.5, e * 40)) * (p.cash >= st.price[t] * LOT + p.lv.reserve ? 1 : 0.3); }
    else if (t === 'shop') v += p.cash >= 2500 ? 1.5 : 0.3; else if (t === 'ipo') v += 2.5; else if (t === 'gift') v += 1.5; else if (t === 'chance') v += 0.8;
    else if (t === 'bank') v += p.cash < 1500 ? 1.5 : 0; else if (t === 'fee') v -= 1;
    for (let j = 1; j <= i; j++) { const tt = TILES[(p.pos + j) % TILES.length]; if (tt === 'start') v += 2; else if (tt === 'divi') v += 0.8; }
    return v;
  }
  function evDice(st, p) {
    let e1 = 0, e2 = 0.3;
    for (let i = 1; i <= 6; i++) e1 += tileScore(st, p, i) / 6;
    for (let a = 1; a <= 6; a++) for (let b = 1; b <= 6; b++) e2 += tileScore(st, p, a + b) / 36;
    return e1 > e2 ? 1 : 2;
  }

  /* ───────── 策略:蒙地卡羅 ───────── */
  // 評分:自己的總資產領先「最強對手」多少(不是只看自己,這樣會順便學到打壓第一名)
  // 模擬只跑 depth 回合,剩下的回合用期望值估:持股 × 到結束的期望報酬(這樣 3 回合的模擬也知道「這檔長期好」)
  const terminal = (st, p) => (MC.terminal === false ? 0 : KEYS.reduce((a, k) => a + (p.hold[k].n - p.short[k].n) * st.price[k] * evOf(st, k, p), 0));
  const lead = (st, i) => { const me = assetsOf(st, st.players[i]) + terminal(st, st.players[i]); let best = -Infinity;
    st.players.forEach((q, j) => { if (j !== i) best = Math.max(best, assetsOf(st, q) + terminal(st, q)); });
    return MC.score === 'own' ? me : MC.score === 'mix' ? me - 0.5 * best : me - best; };
  // 從 st(輪到 p、還沒擲骰)用 forced 動作模擬 depth 回合,回傳平均領先。模擬裡所有人都用期望值策略
  const seedsFor = (n) => { const out = []; for (let i = 0; i < n; i++) out.push((rand() * 2 ** 31) | 0); return out; };
  function rolloutMean(st, p, forced, seeds, depth) {
    let sum = 0; const keep = getSeed();
    for (const sd of seeds) {
      setSeed(sd);
      const c = clone(st); c.players.forEach((q) => { q.alg = 'ev'; });
      run(c, c.rolls + depth, forced);
      sum += lead(c, p.i);
    }
    setSeed(keep); return sum / seeds.length;
  }
  // 從 st 用 forced 擲法模擬,回傳每個種子各自的分數(配對比較用)
  function rolloutAll(st, p, forced, seeds, depth) {
    const keep = getSeed(), out = [];
    for (const sd of seeds) { setSeed(sd); const c = clone(st); c.players.forEach((q) => { q.alg = 'ev'; }); run(c, c.rolls + depth, forced); out.push(lead(c, p.i)); }
    setSeed(keep); return out;
  }
  // 配對差的平均和標準誤:a、b 是同一組未來(同種子)底下兩個動作的分數
  const pairStat = (a, b) => { const n = a.length; let m = 0; for (let i = 0; i < n; i++) m += a[i] - b[i]; m /= n;
    let v = 0; for (let i = 0; i < n; i++) v += (a[i] - b[i] - m) ** 2; return { m, se: Math.sqrt(v / Math.max(1, n - 1) / n) }; };
  function mcDice(st, p) {
    const seeds = seedsFor(Math.max(20, Math.round(MC.n * 0.6))), base = evDice(st, p), other = base === 1 ? 2 : 1;
    const a = rolloutAll(st, p, { dice: other }, seeds, MC.depth), b = rolloutAll(st, p, { dice: base }, seeds, MC.depth);
    const { m, se } = pairStat(a, b);
    return m > MC.z * se ? other : base;
  }
  // 踩到股票格:st 是「已經走到這格、還沒交易」的狀態。每個候選動作先做掉,再從下一位開始模擬
  // 每個候選動作都用同一組種子模擬,和「期望值策略的建議」做配對比較;顯著比較好(> z 個標準誤)的裡面挑平均差最大的
  function mcTrade(st, p, k) {
    const opts = tradeOptions(st, p, k), evAct = evTrade(st, p, k), same = (x, y) => x.a === y.a && (x.q || 0) === (y.q || 0);
    if (!opts.some((o) => same(o, evAct))) opts.push({ a: evAct.a, q: evAct.q });          // 期望值建議的動作(例如融資 50 股)不在清單上就補進去
    if (opts.length === 1) return opts[0];
    const base = opts.find((o) => same(o, evAct));
    const seeds = seedsFor(MC.n), keep = getSeed();
    const scores = opts.map((act) => seeds.map((sd) => {
      setSeed(sd);
      const c = clone(st), q = c.players[p.i]; c.players.forEach((x) => { x.alg = 'ev'; });
      doTrade(c, q, k, act); marginCheck(c);
      c.turn = (p.i + 1) % c.players.length;
      if (c.turn === 0) { applyEvent(c, randomEvent(c)); if (c.rolls >= c.maxRounds) c.over = true; }
      run(c, c.rolls + MC.depth);
      return lead(c, p.i);
    }));
    setSeed(keep);
    const bi = opts.indexOf(base); let best = base, bestM = 0;
    opts.forEach((act, i) => { if (i === bi) return; const { m, se } = pairStat(scores[i], scores[bi]); if (m > MC.z * se && m > bestM) { bestM = m; best = act; } });
    return best;
  }

  /* ───────── 派發 ───────── */
  function decideDice(st, p) { if (POL[p.alg]) return POL[p.alg].dice ? POL[p.alg].dice(st, p, api) : evDice(st, p); return p.alg === 'mc' ? mcDice(st, p) : p.alg === 'ev' ? evDice(st, p) : 2; }
  // opts.policies:實驗用的自訂策略 { 名字: (st, p, k, api) => 動作 },玩家的 alg 設成那個名字就會用它(tools/ 的分析腳本用)
  const POL = opts.policies || {};
  function decideTrade(st, p, k) { if (POL[p.alg]) return POL[p.alg](st, p, k, api); return p.alg === 'mc' ? mcTrade(st, p, k) : p.alg === 'ev' ? evTrade(st, p, k) : ruleTrade(st, p, k); }

  const api = { fill: (st, k, f) => fill(st, k, f), maxLots, acctRatio, assetsOf, evOf, evTrade, tradeOptions, buyF, sellF, shortF, LOT, MARGIN_LOAN };
  return { newGame, clone, playGame, run, playTurn, land, doTrade, tradeOptions, assetsOf, acctRatio, lead, evOf, EVSTAT, evDice, evTrade, ruleTrade, mcDice, mcTrade, rolloutMean, rolloutAll, tileScore, ipoLots, setSeed, getSeed, rand, MC, EVP, LEVELS, mkPlayer };
}
