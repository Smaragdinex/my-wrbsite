// 遊戲資料:類股、棋盤格、事件卡、命運牌、數值常數。board.mjs(畫面)和 sim.mjs(模擬 / 電腦 AI)共用,
// 所以這裡不能碰 DOM。L(en, zh) 是語言函式、fmt 是數字格式,由呼叫端傳進來(Node 跑模擬時隨便給)。
export function gameData(L, fmt) {
const SECTORS = {
  tech:   { name: L('Meow Tech', '喵科技'),       code: L('TECH', '科技股'),   color: 0x8b7cff, css: '#7d6cf0', open: 120, div: 0.01, blurb: L('Fast growth, big swings.', '成長快,波動也大。') },
  soft:    { name: L('Hop Bunny Software', '跳跳兔軟體'), code: L('SOFTWARE', '軟體股'), color: 0x5fb3f5, css: '#3f97db', open: 95, div: 0.005, blurb: L('Subscriptions keep profits growing, but high valuations fall hard when rates rise.', '訂閱制讓獲利穩定成長;但估值高,升息時跌得特別多。') },
  chip:   { name: L('Paw Chips', '貓掌半導體'),   code: L('CHIPS', '半導體'),  color: 0x4f8ef0, css: '#3f7de0', open: 90,  div: 0.01, blurb: L('Booms and busts with supply.', '跟著供需循環大起大落。') },
  yield:   { name: L('Sloth Telecom', '樹懶電信'),   code: L('TELECOM', '電信股'),  color: 0xf5b942, css: '#d99a12', open: 60,  div: 0.05, blurb: L('Everyone pays the phone bill in good times and bad. Slow mover, pays 5% every lap.', '景氣好壞大家都要繳電話費。漲得慢,但每圈配息 5%。') },
  oil:     { name: L('Camel Energy', '駱駝能源'),   code: L('ENERGY', '能源股'), color: 0xf2796b, css: '#e2604f', open: 80,  div: 0.02, blurb: L('Moves with world events.', '跟著國際事件走。') },
  health:  { name: L('Penguin Health', '企鵝醫療'), code: L('HEALTH', '醫療股'), color: 0x54c98a, css: '#35ad6d', open: 70,  div: 0.02, blurb: L('Steady when markets panic.', '市場恐慌時相對抗跌。') },
  reit:    { name: L('Beaver REIT', '海狸不動產'), code: L('REIT', '不動產'), color: 0xc48ad6, css: '#ad6cc4', open: 100, div: 0.04, blurb: L('Pays 4% a lap. Hates rate hikes.', '每圈配息 4%,最怕升息。') },
  fin:     { name: L('Squirrel Bank', '松鼠金控'),       code: L('FINANCE', '金融股'),  color: 0x2a9db5, css: '#1f8aa1', open: 85,  div: 0.03, blurb: L('Likes higher rates. Steady 3% a lap.', '升息時受惠,每圈配息 3%。') },
  trans:   { name: L('Cheetah Shipping', '獵豹航運'), code: L('TRANSPORT', '運輸股'), color: 0x9a7b66, css: '#86654f', open: 75,  div: 0.02, blurb: L('Shipping and airlines: hurt by fuel costs, lifted by trade and travel booms.', '航運和航空:油價漲就受傷,運價漲、旅遊旺就大賺。') },
  bio:    { name: L('Catnip Bio', '貓草生技'),       code: L('BIOTECH', '生技股'),  color: 0xe85d9b, css: '#d44a88', open: 110, div: 0,    blurb: L('No dividends. Drug news makes it soar or crash.', '不配息,新藥消息決定大漲或大跌。') },
  staples: { name: L('Hamster Foods', '倉鼠食品'),      code: L('STAPLES', '民生消費'), color: 0x7fb069, css: '#62964b', open: 65,  div: 0.03, blurb: L('People buy food in any economy. Falls least in a panic.', '景氣再差也要吃飯,恐慌時跌最少。') },
  disc:    { name: L('Seagull Travel', '海鷗旅遊'),   code: L('LEISURE', '觀光餐飲'), color: 0xff8c69, css: '#ef6f48', open: 85,  div: 0.01, blurb: L('People spend here only when times are good.', '有閒錢才會花,景氣好壞差很多。') },
  util:    { name: L('Eel Power', '電鰻電力'),     code: L('UTILITY', '公用事業'), color: 0x5c7cba, css: '#4a69a8', open: 55,  div: 0.04, blurb: L('Boring and steady. Pays 4% a lap.', '無聊但穩定,每圈配息 4%。') },
  mat:     { name: L('Rhino Steel', '犀牛鋼鐵'),     code: L('MATERIALS', '原物料'), color: 0x8a8f98, css: '#6f757f', open: 70,  div: 0.02, blurb: L('Rises with inflation and building booms.', '跟著通膨和景氣走。') },
  agri:    { name: L('Dairy Cow Farms', '乳牛農產'),  code: L('AGRI', '農產品'),   color: 0xa3c45a, css: '#7fa33a', open: 60,  div: 0.02, blurb: L('Grain, meat and milk. Moves with inflation, weather and war, not with the stock market.', '穀物、肉、奶。跟著通膨、天氣和戰爭走,跟股市關聯不大。') },
  gold:    { name: L('Goldfish Gold', '金魚黃金'),         code: L('GOLD', '黃金'),       color: 0xe6b422, css: '#c4950c', open: 100, div: 0,    blurb: L('A safe haven. Rises when markets panic.', '避險資產,市場恐慌時反而上漲。') },
  bond:    { name: L('Tortoise Bond', '烏龜債券'),          code: L('BOND', '債券'),       color: 0x6aa5a9, css: '#4f8c90', open: 100, div: 0.03, blurb: L('Up when rates fall, down when they rise.', '降息漲、升息跌,和股票互補。') },
  etf:     { name: L('Zoo ETF', '動物園 ETF'), code: L('ETF', '大盤ETF'),     color: 0x3d5a80, css: '#3d5a80', open: 100, div: 0.035, blurb: L('Owns a bit of every stock sector at once.', '一次買進所有產業,最簡單的分散。') },
  green:   { name: L('Hummingbird EV', '蜂鳥電動車'),    code: L('GREEN', '綠能車'),    color: 0x2ec4b6, css: '#1fa799', open: 95,  div: 0,    blurb: L('Lives on subsidies and cheap loans.', '靠政策補助和低利率成長。') },
  def:     { name: L('Eagle Defense', '老鷹軍工'),      code: L('DEFENSE', '軍工'),    color: 0x6b7d3a, css: '#5a6b2c', open: 90,  div: 0.02, blurb: L('Rises when the world gets tense.', '國際情勢緊張時上漲。') },
  game:    { name: L('Fox Games', '狐狸遊戲'),   code: L('GAMES', '遊戲'),      color: 0xb5179e, css: '#a01389', open: 80,  div: 0.01, blurb: L('One hit title can change everything.', '一款大作就能改變一切。') },
  crypto:  { name: L('ParrotCoin', '鸚鵡幣'),            code: L('CRYPTO', '加密貨幣'), color: 0xf7931a, css: '#dd7d0a', open: 100, div: 0,    vol: 0.14, blurb: L('Not a stock. No earnings behind it, wild swings.', '不是股票,背後沒有獲利,波動極大。') },
};
const KEYS = Object.keys(SECTORS);
// 16x16 外圈共 60 格。四個角:起點 / 商店 / 股息結算 / 商店
const N = 17;   // 17x17 外圈 = 64 格
const TILES = (() => {
  const t = new Array(4 * (N - 1)).fill(null);
  t[0] = 'start'; t[16] = 'shop'; t[32] = 'divi'; t[48] = 'shop';     // 四個角
  [4, 10, 13, 19, 28, 35, 43, 50, 54, 60].forEach((i) => { t[i] = 'chance'; });      // 市場事件(28、60 是兩條小路的出口,一出來就抽事件)
  t[40] = 'ipo';      // 新股申購入口,走到就進 IPO 小路
  [22, 58].forEach((i) => { t[i] = 'gift'; });
  // 剩下 47 格:22 種資產各兩格,再插入 3 個銀行格
  const seq = [...KEYS, ...KEYS];
  [7, 22, 37].forEach((i) => seq.splice(i, 0, 'bank'));      // 落在第 9、30、51 格(避開兩條小路的出口 28、60)
  let j = 0; for (let i = 0; i < t.length; i++) if (!t[i]) t[i] = seq[j++];
  return t;
})();
const TILE_COLOR = { start: 0xff8fc0, chance: 0xffd24a, fate: 0xc08cf5, fee: 0x9aa0ad, shop: 0x5aa9ff, gift: 0xf27a98, divi: 0x8f7cf0, ipo: 0x2fbf9f, bank: 0x4a63b0 };
// 事件卡:只寫「有變動的資產」,沒寫的就是不動。
// 大盤 ETF 不用自己寫 —— 它等於所有「股票類股」這次漲跌的平均(黃金、債券、加密貨幣不算)
const NON_EQUITY = new Set(['gold', 'bond', 'crypto', 'etf', 'agri']);
const EV = (t, w, m) => {
  const full = Object.fromEntries(KEYS.map((k) => [k, m[k] ?? 1]));
  const eq = KEYS.filter((k) => !NON_EQUITY.has(k));
  full.etf = m.etf ?? Math.round(eq.reduce((a, k) => a + full[k], 0) / eq.length * 100) / 100;
  return { t, w, m: full };
};
const EVENTS = [
  EV(L('Rate cut announced', '央行宣布降息'), L('Cheaper borrowing lifts growth stocks, property and bonds; banks earn less on loans.', '借錢變便宜,成長股、不動產、債券受惠;銀行利差縮小。'),
    {agri: 1.02, soft: 1.16,  tech: 1.20, chip: 1.10, yield: 0.97, reit: 1.12, fin: 0.94, trans: 1.04, bio: 1.12, bond: 1.08, util: 1.05, gold: 1.04, green: 1.12, disc: 1.06, game: 1.08, mat: 1.03, crypto: 1.15 }),
  EV(L('AI server demand booms', 'AI 伺服器需求爆發'), L('Scarce chips let makers raise prices. Data centers need more power too.', '晶片供不應求,廠商有漲價空間;資料中心也更吃電。'),
    {soft: 1.08,  tech: 1.10, chip: 1.25, oil: 0.95, trans: 1.03, game: 1.05, util: 1.04 }),
  EV(L('Oil supply shock', '原油供給吃緊'), L('Energy gains; fuel-hungry shippers and travel suffer.', '能源股受惠;最吃燃料的運輸和旅遊受傷最重。'),
    {soft: 0.96,  tech: 0.93, chip: 0.95, oil: 1.25, reit: 0.97, fin: 0.98, trans: 0.82, mat: 1.06, disc: 0.92, staples: 0.97, green: 1.10, gold: 1.04, util: 0.96, def: 1.03 }),
  EV(L('Black swan', '黑天鵝事件'), L('Panic selling hits the riskiest assets hardest. Gold and bonds are where money hides.', '恐慌賣壓下風險高的跌最多,資金躲進黃金和債券。'),
    {agri: 0.95, soft: 0.82,  tech: 0.80, chip: 0.80, yield: 0.95, oil: 0.90, health: 0.98, reit: 0.90, fin: 0.85, trans: 0.85, bio: 0.78, gold: 1.15, bond: 1.06, staples: 0.97, util: 0.97, disc: 0.82, mat: 0.86, green: 0.80, game: 0.88, def: 1.02, crypto: 0.65 }),
  EV(L('Strong earnings season', '財報季優於預期'), L('Profits beat forecasts across the board.', '企業獲利普遍優於預期。'),
    {agri: 1.02, soft: 1.10,  tech: 1.12, chip: 1.12, yield: 1.04, oil: 1.04, health: 1.06, reit: 1.03, fin: 1.08, trans: 1.08, bio: 1.05, staples: 1.03, disc: 1.10, util: 1.02, mat: 1.07, green: 1.08, game: 1.10, def: 1.04, gold: 0.98, bond: 0.99, crypto: 1.05 }),
  EV(L('Rate hike surprise', '意外升息'), L('Higher rates hurt growth, property and bonds, but banks earn more on loans.', '升息壓抑成長股、不動產和債券,銀行利差反而擴大。'),
    {agri: 0.97, soft: 0.86,  tech: 0.90, chip: 0.92, yield: 1.03, oil: 1.02, reit: 0.88, fin: 1.12, trans: 0.96, bio: 0.88, bond: 0.92, util: 0.94, gold: 0.96, green: 0.88, disc: 0.94, game: 0.92, staples: 0.99, mat: 0.97, crypto: 0.82 }),
  EV(L('Flu season hits', '流感疫情升溫'), L('Demand for medicine jumps; people stay home, travel less and play more games.', '藥品需求大增;大家待在家,少出遊、多打電動。'),
    {soft: 1.06,  tech: 0.98, oil: 0.96, health: 1.20, trans: 0.94, bio: 1.22, disc: 0.85, staples: 1.06, game: 1.12 }),
  EV(L('New drug approved', '新藥獲准上市'), L('One approval can change everything for a biotech.', '一張藥證就能改變一家生技公司的命運。'),
    { health: 1.08, bio: 1.35 }),
  EV(L('Shipping rates surge', '運價大漲'), L('Ports are jammed and ships are scarce, so freight prices jump.', '港口塞港、運力不足,運費跟著漲。'),
    { tech: 0.98, oil: 1.05, trans: 1.28, mat: 1.04, staples: 0.98, disc: 0.98 }),
  EV(L('Clinical trial fails', '臨床試驗失敗'), L('Biotech has no profits to fall back on, so bad news hits hard.', '生技公司沒有獲利撐腰,壞消息一來跌很深。'),
    { health: 0.97, bio: 0.70 }),
  EV(L('Geopolitical tension rises', '國際情勢緊張'), L('Money moves to defense, energy and gold; trade and travel suffer.', '資金流向軍工、能源和黃金;貿易與旅遊受影響。'),
    {agri: 1.06, soft: 0.96,  def: 1.28, gold: 1.10, oil: 1.12, trans: 0.92, disc: 0.90, tech: 0.95, chip: 0.93, bond: 1.03, crypto: 0.92 }),
  EV(L('Green subsidy passed', '綠能補助通過'), L('Policy support matters most for industries that are not yet profitable.', '還沒賺錢的產業,最吃政策支持。'),
    { green: 1.30, util: 1.05, mat: 1.05, oil: 0.94 }),
  EV(L('Hit game launches', '遊戲大作上市'), L('A single hit can carry a game company for years.', '一款大作可以養一家遊戲公司好幾年。'),
    {soft: 1.03,  game: 1.30, tech: 1.04, chip: 1.03 }),
  EV(L('Inflation runs hot', '通膨升溫'), L('Hard assets hold value; bonds and growth stocks lose it.', '實體資產保值;債券和成長股受壓。'),
    {agri: 1.12, soft: 0.92,  gold: 1.10, mat: 1.12, oil: 1.08, staples: 1.04, reit: 1.03, bond: 0.94, tech: 0.93, disc: 0.92, crypto: 1.05 }),
  EV(L('Holiday shopping boom', '年終消費旺季'), L('When people feel rich, they travel, eat out and shop.', '大家手頭寬裕時,會出遊、聚餐、買東西。'),
    { disc: 1.22, staples: 1.06, trans: 1.08, fin: 1.03, game: 1.06 }),
  EV(L('Crypto exchange hacked', '加密貨幣交易所遭駭'), L('With no earnings behind it, confidence is all crypto has.', '加密貨幣背後沒有獲利,信心一垮就崩。'),
    { crypto: 0.55, fin: 0.98, gold: 1.03 }),
  EV(L('Crypto mania', '幣圈狂熱'), L('Prices can soar on hype alone, and fall the same way.', '純靠熱度也能暴漲,當然也能同樣暴跌。'),
    {soft: 1.03,  crypto: 1.60, chip: 1.05, tech: 1.02 }),
  EV(L('Commodity boom', '原物料行情'), L('Building booms push up steel, cement and energy.', '基礎建設需求推升鋼鐵、水泥和能源。'),
    { mat: 1.25, oil: 1.08, trans: 1.04 }),
  // ── 戰爭、總經數據、疫情、金融風暴 ──
  EV(L('War breaks out in the Middle East', '中東爆發戰爭'), L('Oil routes are at risk, so crude jumps. Money runs to defense and gold; shipping and travel get hit.', '產油區和航道有風險,油價飆漲。資金湧向軍工和黃金,運輸與旅遊受創。'),
    {agri: 1.10, soft: 0.94,  oil: 1.30, def: 1.22, gold: 1.12, green: 1.06, mat: 1.05, bond: 1.03, trans: 0.85, disc: 0.88, tech: 0.94, chip: 0.94, fin: 0.96, crypto: 0.92 }),
  EV(L('A major war breaks out', '大規模戰爭爆發'), L('Almost everything falls. Only defense, gold and energy rise as investors flee risk.', '幾乎所有資產都下跌,只有軍工、黃金、能源上漲,資金全面避險。'),
    {agri: 1.15, soft: 0.88,  def: 1.35, gold: 1.18, oil: 1.15, bond: 1.05, mat: 1.04, staples: 1.03, chip: 0.85, tech: 0.88, disc: 0.80, trans: 0.85, fin: 0.90, reit: 0.92, crypto: 0.85, green: 0.92, game: 0.94, bio: 0.95 }),
  EV(L('CPI comes in lower than expected', 'CPI 低於預期'), L('Cooling inflation means rate cuts may come sooner. Growth stocks, property and bonds cheer.', '通膨降溫代表可能提早降息,成長股、不動產、債券上漲。'),
    {soft: 1.09,  tech: 1.10, crypto: 1.10, chip: 1.08, reit: 1.08, green: 1.08, bio: 1.07, bond: 1.06, game: 1.06, disc: 1.05, fin: 0.97, gold: 0.97, oil: 0.98 }),
  EV(L('Strong jobs report', '非農就業強勁'), L('More people working means more spending, but rates may stay high for longer.', '就業好代表消費有力,但利率可能維持高檔更久。'),
    {soft: 0.97,  disc: 1.08, fin: 1.06, trans: 1.05, mat: 1.04, staples: 1.02, bond: 0.95, gold: 0.97, reit: 0.97, tech: 0.98 }),
  EV(L('Weak jobs report', '非農就業疲弱'), L('Fewer jobs means less spending. Money moves to bonds, gold and steady payers.', '就業轉弱代表消費降溫,資金轉向債券、黃金和穩定配息的資產。'),
    {agri: 1.02, soft: 1.02,  bond: 1.06, gold: 1.05, util: 1.03, staples: 1.02, tech: 1.02, disc: 0.92, fin: 0.94, trans: 0.95, mat: 0.96 }),
  EV(L('Global pandemic', '全球疫情爆發'), L('People stay home: medicine, games and groceries rise; travel, transport and oil collapse.', '大家待在家:醫藥、遊戲、民生上漲;旅遊、運輸、油價重挫。'),
    {agri: 1.06, soft: 1.12,  bio: 1.30, health: 1.18, game: 1.15, staples: 1.08, tech: 1.06, gold: 1.06, bond: 1.04, disc: 0.70, trans: 0.78, oil: 0.80, reit: 0.88, fin: 0.90, mat: 0.92 }),
  EV(L('Financial crisis', '金融風暴'), L('Banks fail and credit freezes. Nearly everything falls together; only gold and bonds hold.', '銀行倒閉、信用緊縮,幾乎所有資產一起跌,只有黃金和債券撐住。'),
    {agri: 0.92, soft: 0.80,  gold: 1.20, bond: 1.10, fin: 0.65, crypto: 0.60, reit: 0.75, disc: 0.75, tech: 0.78, chip: 0.78, green: 0.78, mat: 0.80, trans: 0.82, oil: 0.82, bio: 0.82, game: 0.85, yield: 0.90, def: 0.95, staples: 0.95, util: 0.94, health: 0.94 }),
  // 兩個歷史上真的發生過的泡沫破裂:網路泡沫(2000)、次級房貸風暴(2008)
  EV(L('Dot-com bubble bursts', '網路泡沫破裂'), L('Internet companies with no profits were priced as if they would rule the world. When the money ran out, tech crashed hardest; old-economy and safe assets held up.', '還沒賺錢的網路公司被當成未來霸主炒作。資金一抽走,科技股跌最慘;傳統產業和避險資產撐得住。'),
    {soft: 0.70,  tech: 0.65, chip: 0.75, game: 0.80, crypto: 0.70, green: 0.85, fin: 0.94, disc: 0.95, bond: 1.06, gold: 1.05, staples: 1.03, util: 1.04, health: 1.02, yield: 1.02 }),
  EV(L('Subprime mortgage crisis', '次級房貸風暴'), L('Banks lent to people who could not pay, packaged the loans and sold them on. When house prices fell, property and banks collapsed together and dragged everything that depends on borrowing.', '銀行把錢借給還不起的人,再把房貸包裝成商品賣出去。房價一跌,不動產和銀行一起崩,靠借錢運作的產業全被拖下水。'),
    {soft: 0.90,  reit: 0.65, fin: 0.65, disc: 0.85, mat: 0.88, trans: 0.90, tech: 0.90, chip: 0.90, green: 0.90, crypto: 0.85, yield: 0.92, gold: 1.12, bond: 1.08, staples: 1.02, util: 1.01 }),
  // ── 更多金融史上的事件 ──
  // 黑色星期一:恐慌一天崩盤,但下一回合會自動反彈一半(rebound)—— 教「恐慌殺低不一定是對的」
  Object.assign(EV(L('Black Monday', '黑色星期一'), L('In 1987 program trading sold into a falling market and stocks dropped 22% in one day. Panic feeds on itself, and part of the drop came back soon after.', '1987 年程式交易在下跌中自動賣出,股市一天崩 22%。恐慌會自我放大,但之後有一部分很快就漲回來了。'),
    {agri: 0.95,  tech: 0.82, soft: 0.82, chip: 0.82, yield: 0.88, oil: 0.85, health: 0.88, reit: 0.85, fin: 0.80, trans: 0.84, bio: 0.82, staples: 0.90, disc: 0.82, util: 0.90, mat: 0.85, green: 0.82, def: 0.88, game: 0.82, crypto: 0.80, gold: 1.05, bond: 1.03 }), { rebound: 0.5 }),
  EV(L('Asian financial crisis', '亞洲金融風暴'), L('In 1997 hot money fled Thailand and Korea, currencies collapsed and anything tied to Asian trade fell with them.', '1997 年熱錢撤出泰國、韓國,貨幣崩盤,跟亞洲貿易有關的全被拖下水。'),
    {agri: 0.95,  trans: 0.85, mat: 0.88, fin: 0.88, disc: 0.90, chip: 0.93, tech: 0.95, gold: 1.06, bond: 1.05 }),
  EV(L('European debt crisis', '歐債危機'), L('From 2010 Greece could not pay its debts. Even government bonds can default, and the banks holding them bleed.', '2010 年起希臘還不出國債。連國債都可能違約,抱著國債的銀行跟著失血。'),
    { bond: 0.88, fin: 0.85, reit: 0.92, disc: 0.95, gold: 1.08, def: 1.02 }),
  EV(L('Bank run', '銀行擠兌'), L('In 2023 a bank serving tech startups lost its deposits in two days. Confidence is all a bank has.', '2023 年一家服務科技新創的銀行兩天內被提光存款。銀行靠的就是信心。'),
    { fin: 0.80, soft: 0.90, tech: 0.92, bio: 0.94, bond: 1.06, gold: 1.03 }),
  EV(L('Trade war and tariffs', '中美貿易戰'), L('From 2018 tariffs hit chips, metals and shipping; the extra cost gets passed to consumers.', '2018 年起關稅打到晶片、原物料和航運,多出來的成本轉嫁給消費者。'),
    {agri: 0.90,  chip: 0.88, mat: 0.90, trans: 0.92, staples: 0.96, tech: 0.95, def: 1.05, gold: 1.02 }),
  EV(L('Chip shortage', '晶片荒'), L('In 2021 there were not enough chips: chip makers raised prices while car and console makers waited.', '2021 年晶片不夠用:晶片廠漲價,汽車和遊戲機廠只能等。'),
    { chip: 1.20, tech: 0.95, green: 0.88, game: 0.94 }),
  // 迷因股軋空:挑「場上被放空最多」的那檔暴漲 50%,所有空單強迫回補(meme:抽到時才決定是哪一檔)
  Object.assign(EV(L('Meme stock squeeze', '迷因股軋空'), L('In 2021 retail traders piled into the most-shorted stock and squeezed the short sellers out. Every short on it is forced to buy back.', '2021 年散戶一起買被放空最多的股票,把放空的人全部軋出場。這檔的空單全部強迫回補。'), {}), { meme: true }),
  EV(L('Antitrust fine', '反壟斷巨額罰款'), L('Regulators fine a platform giant for abusing its position. Big tech carries regulatory risk.', '監管機關對平台巨頭開出巨額罰款。大型科技公司有監管風險。'),
    { tech: 0.88, soft: 0.90, game: 0.97 }),
  EV(L('Massive data breach', '大型資安事件'), L('Personal data of millions leaks. Trust is expensive to rebuild, and security costs go up for everyone.', '數百萬人的個資外洩。信任很難重建,所有公司的資安成本都上升。'),
    { soft: 0.90, fin: 0.94, tech: 0.96 }),
  EV(L('Infrastructure bill passes', '基礎建設法案通過'), L('Government spending on roads, grids and ports flows to materials, transport and utilities; more borrowing weighs on bonds.', '政府砸錢修路、電網、港口,原物料、運輸和公用事業受惠;多借錢讓債券承壓。'),
    {agri: 1.02,  mat: 1.15, trans: 1.08, util: 1.05, green: 1.06, bond: 0.97 }),
  EV(L('Nuclear accident', '核災事故'), L('In 2011 the Fukushima disaster turned countries away from nuclear power and toward renewables and fossil fuels.', '2011 年福島核災讓各國遠離核電,轉向再生能源和化石燃料。'),
    { util: 0.85, green: 1.12, oil: 1.06, gold: 1.04, reit: 0.97 }),
  EV(L('Property bubble bursts', '房市泡沫破裂'), L('Japan in 1990, China in 2021: when borrowed money stops flowing into property, prices fall and banks and builders fall with them.', '1990 年的日本、2021 年的中國:借來的錢不再流進房地產,房價一跌,銀行和建商跟著倒。'),
    { reit: 0.75, fin: 0.90, mat: 0.92, staples: 0.97, disc: 0.96, gold: 1.04, bond: 1.03 }),
  EV(L('Drought and crop failure', '乾旱歉收'), L('A bad harvest sends grain prices up. Farms that still have crops earn more; food makers and restaurants pay more for ingredients.', '歉收讓穀物價格大漲。還有收成的農場賺更多;食品廠和餐廳的原料變貴。'),
    { agri: 1.25, staples: 0.94, disc: 0.96, trans: 1.02 }),
  // 政府普發現金:除了股價變動,每位玩家還直接拿到現金(cash)
  Object.assign(EV(L('Government cash handout', '政府普發現金'), L('Everyone gets cash from the government. People spend it, so shops, restaurants and travel do well; the government borrows more, so bonds dip.', '政府發現金給每個人。大家拿到錢會去消費,零售、餐飲、旅遊受惠;政府要多借錢,債券小跌。'),
    {agri: 1.03, soft: 1.02,  disc: 1.12, staples: 1.06, game: 1.06, trans: 1.04, fin: 1.03, reit: 1.02, gold: 1.02, bond: 0.96 }), { cash: 1000 }),
];
// 牌組平衡:原本每檔資產在整副牌裡的漲跌不對稱(黃金平均每張 +3.5%、金融 −4.5%),玩越久越固定往一邊走,
// 看懂牌組的人(或電腦)只要固定做多 / 放空就贏。這裡在載入時把每檔資產調成「整副牌的漲跌互相抵消」(幾何平均 = 1):
//   上漲的卡 log 漲幅 × s、下跌的卡 ÷ s,s = √(−下跌總和 / 上漲總和) → 每張卡的方向不變,只有幅度變
//   黑色星期一的「下回合反彈」也算進去;單張卡被放大時不超過 −22% / +25%(加密貨幣 −40% / +40%),原本就更大的不動
//   大盤 ETF 用平衡後的股票類股平均重算,再平衡一次。迷因股軋空是抽到才決定的,不算
{
  const deck = EVENTS.filter((e) => !e.meme), eq = KEYS.filter((k) => !NON_EQUITY.has(k));
  const eff = (e, k) => { let l = Math.log(e.m[k]); if (e.rebound && e.m[k] < 1) l += Math.log(1 + (1 / e.m[k] - 1) * e.rebound); return l; };
  const balance = (k) => {
    const [lo, hi] = k === 'crypto' ? [0.6, 1.4] : [0.78, 1.25];
    for (let it = 0; it < 60; it++) {
      let up = 0, dn = 0; for (const e of deck) { const l = eff(e, k); if (l > 0) up += l; else dn += l; }
      if (up <= 0 || dn >= 0) return;
      const s = Math.sqrt(-dn / up); if (Math.abs(s - 1) < 1e-5) return;
      for (const e of deck) { const l = Math.log(e.m[k]);
        if (l > 0) e.m[k] = Math.min(Math.max(hi, e.m[k]), Math.exp(l * s)); else if (l < 0) e.m[k] = Math.max(Math.min(lo, e.m[k]), Math.exp(l / s)); }
    }
  };
  for (const k of KEYS) if (k !== 'etf') balance(k);
  for (const e of deck) e.m.etf = eq.reduce((a, k) => a + e.m[k], 0) / eq.length;
  balance('etf');
}
// 特殊牌:混在市場事件的三張牌裡。抽到不會動股價,而是把你送進棋盤中間的小路
const ONES = Object.fromEntries(KEYS.map((k) => [k, 1]));
const BAIL = 1000, JAIL_WAIT = 3;         // 警察局:休息 JAIL_WAIT 回合才能出來,或付保釋金 BAIL 直接出來(出來都要擲一顆骰子決定走幾格)
const LANE_LEN = 6;                       // 警察局 / IPO 出來的小路有幾格(定義在 LANES)
const IPO_OFF = 0.8, IPO_FREE = 10;       // IPO 小路:每一格先免費送 IPO_FREE 股,想多買再用承銷價(市價 x 0.8)加購
const SPECIAL = {
  jail: { special: 'jail', m: ONES, t: L('Insider trading probe', '涉嫌內線交易'),
    w: L(`Trading on information the public does not have is illegal. You are sent to the police station: rest ${JAIL_WAIT} rounds, or pay $${fmt(BAIL)} bail.`, `用還沒公開的消息買賣股票是違法的。被送進警察局:休息 ${JAIL_WAIT} 回合,或付 $${fmt(BAIL)} 保釋金。`) },
  ipo: { special: 'ipo', m: ONES, t: L('You won the IPO lottery', '新股抽籤中籤'),
    w: L(`You go to the IPO booth: ${IPO_FREE} free shares of a random new listing, and you can buy more below the market price.`, `你去 IPO 攤位:免費獲得隨機一檔新股 ${IPO_FREE} 股,還能用比市價低的「承銷價」加購。`) },
};
const SPECIAL_RATE = 0.8;          // 每次抽牌,三張裡有一張是特殊牌的機率
// 銀行:走到銀行格可以借現金(最多欠 BANK_MAX),每次經過起點付欠款 5% 的利息;欠的錢會從總資產扣掉
const BANK_MAX = 5000, BANK_RATE = 0.05;
const LOT = 10, START_CASH = 10000, SALARY = 1000, FEE = 200, MAX_ROLLS = 20;
const DIV_ROUND = 0.25;   // 股利每一回合配一次(每回合配年率的 1/4;股息格另外多配一次全額),不用等繞回起點
const REMOTE_PRICE = 300, CARD_PRICE = 500, ATK_PRICE = 600, ATK_DROP = 0.82, SPY_PRICE = 400, SPY_ROUNDS = 3, DICE3_PRICE = 350;
const MARGIN_LOAN = 0.6, MAINT = 1.3, MARGIN_FEE = 0.02;
const SQUEEZE = 1.3;
const buyF = (n) => 1 + 0.004 * n, sellF = (n) => Math.max(0.85, 1 - 0.003 * n), shortF = (n) => Math.max(0.8, 1 - 0.005 * n), SHORT_F = shortF(LOT);   // 放空每股壓低 0.5%(最多 -20%)
const FATE = [
  { id: 'lottery', good: true, t: L('You won the lottery', '中樂透'), w: L('Pure luck. Luck is not a strategy, but take it.', '純運氣。運氣不是策略,但該拿還是拿。'), fx: L('+$1,500', '+$1,500') },
  { id: 'tax', good: false, t: L('Tax season', '報稅季'), w: L('Profits get taxed. Keep some cash for it.', '賺的錢要繳稅,手上要留一點現金。'), fx: L('−5% of your cash', '現金 −5%') },
  { id: 'birthday', good: true, t: L('Birthday', '生日'), w: L('Every other player chips in.', '其他每位玩家各包一個紅包給你。'), fx: L('+$200 from each player', '每人給你 +$200') },
  { id: 'gostart', good: true, t: L('Shortcut to GO', '抄捷徑回起點'), w: L('Collect your salary early.', '提早領薪水。'), fx: L('Move to GO', '直接移到起點') },
  { id: 'fat', good: false, t: L('Fat-finger trade', '不小心按錯'), w: L('You tapped the wrong button and dumped a whole position at market price. Double-check before you confirm.', '手滑按錯鍵,把一檔股票整筆用市價賣掉了。下單前要再看一眼。'), fx: L('Sell one holding, all of it', '隨機一檔持股全部賣出') },
  { id: 'swap', good: true, t: L('Teleport', '瞬間移動'), w: L('You swap places with a random rival. Wherever you land, you land.', '和隨機一位對手互換位置。換到哪一格,就算踩到那一格。'), fx: L('Swap places with a rival', '和一位對手互換位置') },
  { id: 'ipo', good: true, t: L('IPO lottery win', '新股抽籤中籤'), w: L('Off to the IPO booth for free shares.', '去 IPO 攤位領免費新股。'), fx: L('Go to the IPO booth', '前往 IPO 攤位') },
  { id: 'remote', good: true, t: L('Found a remote dice', '撿到遙控骰子'), w: L('A dice you can set. It is in your backpack.', '可以指定點數的骰子,放進背包了。'), fx: L('+1 Remote dice', '+1 遙控骰子') },
  { id: 'atk', good: true, t: L('A rumor to spread', '聽到一個八卦'), w: L('A bad-news card for your backpack. Use it on a rival.', '一張利空消息卡進背包,拿去打對手。'), fx: L('+1 Bad news card', '+1 利空消息卡') },
  { id: 'divi', good: true, t: L('Special dividend', '特別股利'), w: L('All your holdings pay out once, right now.', '你所有持股立刻配息一次。'), fx: L('Dividends now', '立刻領一次股利') },
  { id: 'phone', good: false, t: L('Dropped your phone', '手機掉進水裡'), w: L('Life happens. Emergency fund matters.', '生活總有意外,所以要有緊急預備金。'), fx: L('−$300', '−$300') },
  { id: 'richest', good: true, t: L('The leader treats', '第一名請客'), w: L('The richest other player buys you dinner.', '最有錢的對手請你吃飯。'), fx: L('+$500 from the leader', '第一名給你 +$500') },
  { id: 'fine', good: false, t: L('Parking ticket', '違規停車罰單'), w: L('Small, annoying, unavoidable.', '小錢,但很煩。'), fx: L('−$500', '−$500') },
  { id: 'salary2', good: true, t: L('Promotion', '升職加薪'), w: L('Your next salary is doubled.', '下一次經過起點薪水加倍。'), fx: L('Next salary ×2', '下次薪水 ×2') },
];
return { SECTORS, KEYS, N, TILES, TILE_COLOR, NON_EQUITY, EV, EVENTS, ONES, BAIL, JAIL_WAIT, LANE_LEN, IPO_OFF, IPO_FREE, SPECIAL, SPECIAL_RATE, BANK_MAX, BANK_RATE, LOT, START_CASH, SALARY, FEE, MAX_ROLLS, DIV_ROUND, FATE, MARGIN_LOAN, MAINT, MARGIN_FEE, SQUEEZE, buyF, sellF, shortF, SHORT_F, REMOTE_PRICE, CARD_PRICE, ATK_PRICE, ATK_DROP, SPY_PRICE, SPY_ROUNDS, DICE3_PRICE };
}
