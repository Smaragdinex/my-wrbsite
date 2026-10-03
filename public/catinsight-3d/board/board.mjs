// Cat Street Stocks —— 股票大富翁(3D 初稿)
// 等軸測棋盤 + 立體格子 + 可擲的骰子 + 貓咪棋子;用「任務」決定過關,不用倒數計時。
// 公司都是虛構的,事件卡把總體經濟事件和各類股的連動寫成資料(EVENTS)。
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { OutlineEffect } from 'three/addons/effects/OutlineEffect.js';

const $ = (id) => document.getElementById(id);
const fmt = (n) => Math.round(n).toLocaleString('en-US');
const APP_URL = 'https://apps.apple.com/app/id6763914049';

/* ───────────── 語言 ───────────── */
// 預設跟瀏覽器語言;網址加 ?lang=en / ?lang=zh 可強制
// 順序:網址 ?lang= → 上次在主畫面選的(localStorage)→ 瀏覽器語言
const savedLang = (() => { try { return localStorage.getItem('css.lang'); } catch (e) { return null; } })();
const ZH = (new URLSearchParams(location.search).get('lang') || savedLang || navigator.language || 'en').toLowerCase().startsWith('zh');
const L = (en, zh) => (ZH ? zh : en);

/* ───────────── 資料 ───────────── */
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
  etf:     { name: L('Zoo ETF', '動物園 ETF'), code: L('ETF', '大盤ETF'),     color: 0x3d5a80, css: '#3d5a80', open: 100, div: 0.02, blurb: L('Owns a bit of every stock sector at once.', '一次買進所有產業,最簡單的分散。') },
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
  [4, 10, 19, 35, 50, 61].forEach((i) => { t[i] = 'chance'; });      // 市場事件
  [13, 27, 43, 54].forEach((i) => { t[i] = 'fate'; });                // 命運(只影響踩到的人)
  t[40] = 'ipo';      // 新股申購入口,走到就進 IPO 小路
  [22, 58].forEach((i) => { t[i] = 'gift'; });
  // 剩下 47 格:22 種資產各兩格,再插入 3 個銀行格
  const seq = [...KEYS, ...KEYS];
  [7, 22, 37].forEach((i) => seq.splice(i, 0, 'bank'));      // 落在第 9、30、51 格(避開兩條小路的出口 25、56)
  let j = 0; for (let i = 0; i < t.length; i++) if (!t[i]) t[i] = seq[j++];
  return t;
})();
const TILE_COLOR = { start: 0xff8fc0, chance: 0xffd24a, fate: 0xc08cf5, fee: 0x9aa0ad, shop: 0x5aa9ff, gift: 0xff9f6b, divi: 0x8f7cf0, ipo: 0x2fbf9f, bank: 0x4a63b0 };
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
// 特殊牌:混在市場事件的三張牌裡。抽到不會動股價,而是把你送進棋盤中間的小路
const ONES = Object.fromEntries(KEYS.map((k) => [k, 1]));
const BAIL = 1000, JAIL_WAIT = 3;         // 警察局:休息 JAIL_WAIT 回合才能出來,或付保釋金 BAIL 直接出來(出來都要擲一顆骰子決定走幾格)
const IPO_OFF = 0.8, IPO_FREE = 10;       // IPO 小路:每一格先免費送 IPO_FREE 股,想多買再用承銷價(市價 x 0.8)加購
const SPECIAL = {
  jail: { special: 'jail', m: ONES, t: L('Insider trading probe', '涉嫌內線交易'),
    w: L(`Trading on information the public does not have is illegal. You are sent to the police station: rest ${JAIL_WAIT} rounds (or pay $${fmt(BAIL)} bail), then roll one die to get out.`, `用還沒公開的消息買賣股票是違法的。被送進警察局:休息 ${JAIL_WAIT} 回合(或付 $${fmt(BAIL)} 保釋金),再擲一顆骰子走出來。`) },
  ipo: { special: 'ipo', m: ONES, t: L('You won the IPO lottery', '新股抽籤中籤'),
    w: L(`You go to the IPO booth: ${IPO_FREE} free shares of a random new listing, and you can buy more below the market price. Next turn you roll one die to get back on the road.`, `你去 IPO 攤位:免費獲得隨機一檔新股 ${IPO_FREE} 股,還能用比市價低的「承銷價」加購。下一回合擲一顆骰子走回外圈。`) },
};
const SPECIAL_RATE = 0.8;          // 每次抽牌,三張裡有一張是特殊牌的機率
// 銀行:走到銀行格可以借現金(最多欠 BANK_MAX),每次經過起點付欠款 5% 的利息;欠的錢會從總資產扣掉
const BANK_MAX = 5000, BANK_RATE = 0.05;
// 棋盤裡面的兩個特殊格(各一格):警察局、IPO 攤位。離開時擲一顆骰子,從 exit 那格起算走幾格回到外圈。座標是格網的 [x, z]
const LANES = {
  jail: { exit: 25, cell: [2, 7] },
  ipo: { exit: 56, cell: [14, 8] },
};
// 事件生效:改股價;有些事件(普發現金)還會直接發錢給每一位玩家
function applyEvent(e) {
  KEYS.forEach((k) => { S.price[k] *= e.m[k]; });
  if (e.cash) { S.players.forEach((p) => { p.cash += e.cash; }); sfx('coin'); }
  // 黑色星期一這類:記下「下一回合要反彈多少」,新的一回合開始時套用(見 turn)
  if (e.rebound) { const m = Object.fromEntries(KEYS.map((k) => [k, e.m[k] < 1 ? 1 + (1 / e.m[k] - 1) * e.rebound : 1])); S.after = { t: L(`Rebound after: ${e.t}`, `${e.t}後的反彈`), w: L('Part of a panic drop comes back once the panic passes. Selling at the bottom locks in the loss.', '恐慌過去後,跌掉的會漲回來一部分。在最低點賣掉,就是把虧損鎖死。'), m }; }
  S.lastEvent = e; marginCheck();
  // 迷因股軋空:這檔的空單不管進場價多少,全部強迫回補
  if (e.squeezeAll) for (const who of S.players) { const h = who.short[e.squeezeAll]; if (!h.n) continue;
    const n = h.n, back = shortValue(e.squeezeAll, who), put = h.entry * n; who.cash += back; h.n = 0; h.entry = 0;
    S.notices.push({ pi: who.i, k: e.squeezeAll, n, back, lost: put - back, squeeze: true }); impact(e.squeezeAll, buyF(n)); }
}
// 有些事件要「抽到的當下」才決定內容:迷因股軋空挑場上被放空最多的那檔(沒人放空就隨機挑一檔股票)
function instantiate(e) {
  if (!e.meme) return e;
  const tot = (k) => S.players.reduce((a, p) => a + p.short[k].n, 0);
  const pool = KEYS.filter((k) => !NON_EQUITY.has(k));
  const k = pool.some((x) => tot(x) > 0) ? pool.sort((a, b) => tot(b) - tot(a))[0] : pool[Math.floor(Math.random() * pool.length)];
  const eq = KEYS.filter((x) => !NON_EQUITY.has(x)).length;
  return { ...e, m: { ...ONES, [k]: 1.5, etf: Math.round((1 + 0.5 / eq) * 100) / 100 }, squeezeAll: k, t: `${e.t}:${SECTORS[k].name}` };
}
const cashChip = (e) => (e.cash ? `<span class="mv up">${L(`Everyone +$${fmt(e.cash)}`, `每人 +$${fmt(e.cash)}`)}</span>` : '');
const LOT = 10, START_CASH = 10000, SALARY = 1000, FEE = 200, MAX_ROLLS = 20;
// 玩法:走滿選定的回合數(選角畫面可以選 20 / 25 / 30 / 35 / 40),總資產最高的人獲勝
const ROUND_OPTS = [20, 25, 30, 35, 40];
// 電腦難度(選角畫面可以選):
//   三種都會買卡、放空、融資,差別在「機率」和「多狠」:
//   easy   簡單:放空、買卡、用卡的機率都低,很少融資,現金留得多
//   normal 一般:原本的策略(偶爾融資、漲多才放空、有閒錢買利空卡)
//   hard   兇狠:專打第一名 —— 常用融資、只要有人持有就放空、利空卡一有錢就買、現金留得少
//   shortP:符合放空條件時真的放空的機率;atkP:商店有利空卡時買、手上有利空卡時用的機率;greedy:買股時改用融資的機率
const AI_LEVELS = {
  easy:   { shortP: 0.35, atkP: 0.3, greedy: 0.12, reserve: 2500, shortAny: false },
  normal: { shortP: 1,    atkP: 1,   greedy: 0.35, reserve: 2000, shortAny: false },
  hard:   { shortP: 1,    atkP: 1,   greedy: 0.6,  reserve: 800,  shortAny: true },
};
const AI = () => AI_LEVELS[S.aiLevel] || AI_LEVELS.normal;
const maxRolls = () => S.maxRounds;
// 道具:放在背包裡,輪到自己、擲骰前可以用。商店格可以買,禮物格隨機送一個
const SALE_EVENTS = [0, 1, 2, 4, 6, 7, 8, 11, 12, 14, 16, 17, 20, 21];    // 商店會賣的事件卡(壞消息類的不賣)
const REMOTE_PRICE = 300, CARD_PRICE = 500, ATK_PRICE = 600, ATK_DROP = 0.82;
function itemInfo(id) {
  if (id === 'remote') return { icon: '🎲', name: L('Remote dice', '遙控骰子'), desc: L('Pick any total from 2 to 12 instead of rolling.', '不用擲骰,自己指定走 2 到 12 步。'), price: REMOTE_PRICE };
  if (id === 'atk') return { icon: '📉', name: L('Bad news card', '利空消息卡'), price: ATK_PRICE,
    desc: L('Pick any asset and knock its price down 18%. Whoever holds it takes the hit.', '指定一種資產,價格立刻下跌 18%。誰持有誰受傷。') };
  const e = EVENTS[+id.slice(2)];
  const best = KEYS.reduce((a, k) => (e.m[k] > e.m[a] ? k : a), KEYS[0]);
  return { icon: '🃏', name: L('Event card: ', '事件卡:') + e.t, event: e, best,
    desc: L(`Play it to trigger this event. ${SECTORS[best].code} +${Math.round((e.m[best] - 1) * 100)}%.`, `使用後立刻發生這個事件,${SECTORS[best].code} +${Math.round((e.m[best] - 1) * 100)}%。`), price: CARD_PRICE };
}
const randomItem = () => { const r = Math.random(); return r < 0.4 ? 'remote' : r < 0.6 ? 'atk' : 'ev' + SALE_EVENTS[Math.floor(Math.random() * SALE_EVENTS.length)]; };

/* ───────────── 音效與音樂 ─────────────
   全部用 WebAudio 即時合成,不載入任何音檔。瀏覽器規定要使用者先點一下才能出聲,
   所以第一次點擊 / 按鍵時才建立 AudioContext 並開始播音樂。右上角 ♪ 可以關掉(會記住) */
const EMBED = !!new URLSearchParams(location.search).get('embed') && parent !== window;
const AU = (() => {
  let ctx = null, master, mus, nbuf;
  let on = (() => { try { return localStorage.getItem('css.sound') !== '0'; } catch (e) { return true; } })();
  const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);
  // 一個音:m 是 MIDI 音高,t 是絕對時間;to 有給的話音高會滑過去
  function tone(m, t, dur, type = 'triangle', vol = 0.15, to = null, out = master) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(hz(m), t); if (to != null) o.frequency.exponentialRampToValueAtTime(hz(to), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(out); o.start(t); o.stop(t + dur + 0.03);
  }
  function noise(t, dur, vol = 0.15, freq = 3000, out = master) {
    const src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    src.buffer = nbuf; f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = 1.2;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(out); src.start(t, Math.random() * 0.4, dur + 0.02);
  }
  // 背景音樂:しゃろう「3:03 PM」(免費 BGM)。bgm.m4a 是從 30 分鐘版剪出來的一輪(剛好 128 秒)前後各多留 0.5 秒,
  // 用 loopStart / loopEnd 在檔案「裡面」循環 —— AAC 檔頭尾會被編碼器塞一點空白,直接整檔 loop 會聽到斷點。
  // 第一次點擊後才下載(約 1.5 MB)和解碼,好了就開始播
  const BGM_URL = new URL('./bgm.m4a?v=1', import.meta.url).href, LOOP_A = 0.5, LOOP_LEN = 128;
  let bgm = null;
  async function loadBgm() {
    try {
      const data = await (await fetch(BGM_URL)).arrayBuffer();
      const buf = await new Promise((ok, no) => { const p = ctx.decodeAudioData(data, ok, no); if (p && p.then) p.then(ok, no); });
      bgm = ctx.createBufferSource(); bgm.buffer = buf; bgm.loop = true; bgm.loopStart = LOOP_A; bgm.loopEnd = LOOP_A + LOOP_LEN;
      bgm.connect(mus); bgm.start(0, LOOP_A);
    } catch (e) { console.warn('bgm', e); }
  }
  function unlock() {
    if (ctx) { if (on && ctx.state !== 'running') ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) {}   // iPhone / iPad:靜音撥桿開著也要有聲音
    ctx = new AC(); ctx.resume();
    master = ctx.createGain(); master.gain.value = on ? 1.4 : 0; master.connect(ctx.destination);
    mus = ctx.createGain(); mus.gain.value = 0.42; mus.connect(master);
    nbuf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
    { const d = nbuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
    { const b = ctx.createBufferSource(); b.buffer = ctx.createBuffer(1, 1, ctx.sampleRate); b.connect(ctx.destination); b.start(0); }   // 在點擊當下播一個無聲的取樣,Safari 才會真的開始出聲
    if (!EMBED) loadBgm();      // 嵌在街機裡時,音樂由外面的房間頁播放(從選單就開始、進遊戲不中斷)
  }
  // Safari 只把 click / mouseup / touchend / keydown 當成「使用者操作」,只聽 pointerdown 的話用滑鼠永遠解不開 → 全部都聽
  ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'touchstart', 'touchend', 'click', 'keydown'].forEach((ev) => window.addEventListener(ev, unlock, { capture: true, passive: true }));
  document.addEventListener('visibilitychange', () => { if (!ctx) return; if (document.hidden) ctx.suspend(); else if (on) ctx.resume(); });
  // 每個音效是一小串音:[音高, 幾秒後, 長度, 波形, 音量, 滑到的音高]
  const SEQ = {
    click: [[88, 0, 0.04, 'square', 0.035]],
    hop: [[69, 0, 0.1, 'sine', 0.13, 76]], hopAi: [[62, 0, 0.1, 'sine', 0.07, 69]],
    buy: [[76, 0, 0.08, 'triangle', 0.16], [81, 0.07, 0.12, 'triangle', 0.16]],
    sell: [[88, 0, 0.06, 'square', 0.05], [93, 0.06, 0.06, 'square', 0.05], [100, 0.12, 0.14, 'square', 0.05]],
    short: [[67, 0, 0.2, 'sawtooth', 0.06, 58]],
    coin: [[84, 0, 0.07, 'triangle', 0.14], [91, 0.07, 0.2, 'triangle', 0.14]],
    item: [[83, 0, 0.07, 'triangle', 0.13], [88, 0.07, 0.07, 'triangle', 0.13], [95, 0.14, 0.16, 'triangle', 0.13]],
    good: [[72, 0, 0.1], [76, 0.08, 0.1], [79, 0.16, 0.1], [84, 0.24, 0.3]],
    bad: [[64, 0, 0.18, 'sawtooth', 0.07, 60], [57, 0.18, 0.4, 'sawtooth', 0.07, 50]],
    jail: [[40, 0, 0.5, 'square', 0.1, 36], [47, 0.02, 0.45, 'square', 0.05, 43]],
    bell: [[96, 0, 0.9, 'sine', 0.13], [103, 0, 0.6, 'sine', 0.05], [96, 0.3, 0.9, 'sine', 0.11], [103, 0.3, 0.6, 'sine', 0.04]],
    mission: [[79, 0, 0.08], [84, 0.07, 0.08], [88, 0.14, 0.08], [91, 0.21, 0.08], [96, 0.28, 0.35]],
    liq: [[70, 0, 0.16, 'square', 0.07, 64], [70, 0.2, 0.16, 'square', 0.07, 64], [70, 0.4, 0.3, 'square', 0.07, 60]],
    win: [[72, 0, 0.14], [76, 0.14, 0.14], [79, 0.28, 0.14], [84, 0.42, 0.2], [79, 0.62, 0.12], [84, 0.74, 0.7]],
    lose: [[67, 0, 0.3], [64, 0.3, 0.3], [60, 0.6, 0.8]],
  };
  function sfx(name) {
    if (!ctx || !on || skipRender) return;      // 自動測試快轉時不出聲
    if (ctx.state !== 'running') { ctx.resume(); return; }
    const t = ctx.currentTime;
    if (name === 'dice') { for (let i = 0; i < 9; i++) noise(t + i * 0.1 + Math.random() * 0.04, 0.035, 0.16 - i * 0.008, 2200 + Math.random() * 1200); return; }
    if (name === 'flip') { noise(t, 0.18, 0.12, 1400); noise(t + 0.08, 0.12, 0.08, 2600); return; }
    if (name === 'jail') noise(t, 0.35, 0.14, 900);
    for (const [m, at, dur, type = 'triangle', vol = 0.15, to = null] of SEQ[name]) tone(m, t + at, dur, type, vol, to);
  }
  function toggle() {
    on = !on; try { localStorage.setItem('css.sound', on ? '1' : '0'); } catch (e) {}
    unlock(); if (ctx) { master.gain.value = on ? 1.4 : 0; if (on) ctx.resume(); }
    if (EMBED) try { parent.postMessage({ type: 'css-sound', on }, location.origin); } catch (e) {}
    return on;
  }
  return { sfx, toggle, get on() { return on; }, get state() { return ctx ? `${ctx.state} bgm ${bgm ? Math.round(bgm.buffer.duration) : 'loading'}` : 'locked'; } };
})();
const sfx = AU.sfx;

/* ───────────── 狀態 ───────────── */
let S;
// 放空部位的價值 = 保證金(進場價 x 股數)+ 損益((進場價 - 現價) x 股數);最慘賠光保證金
const shortValue = (k, who = S) => { const h = who.short[k]; return h.n ? Math.max(0, h.n * (2 * h.entry - S.price[k])) : 0; };
// 融資:自備 4 成、借 6 成。維持率 = 股票市值 / 借款,跌破 130% 就被強迫平倉(斷頭);每經過起點付借款 2% 的利息
const MARGIN_LOAN = 0.6, MAINT = 1.3, MARGIN_FEE = 0.02;
// 軋空:放空的股票比進場價漲超過 30% 就被強迫回補(買回來還)。被迫買回的買盤又會把股價推得更高
const SQUEEZE = 1.3;
const squeezeGap = (h, k) => (h.entry * SQUEEZE / S.price[k] - 1) * 100;      // 再漲幾 % 會被軋
const ratioOf = (h, k) => (h.loan > 0 ? h.n * S.price[k] / h.loan : Infinity);
const assets = () => assetsOf(S.players[S.hi]);
// 買賣會推動價格(量大推得多):買進推高、賣出和放空壓低。所以賣空對手持有的資產,等於直接打擊對手
const impact = (k, f) => { S.price[k] = Math.max(8, S.price[k] * f); marginCheck(); };
// 強迫平倉:任何一次價格變動後都檢查。融資部位的維持率跌破 130% → 全部賣掉還款,剩多少拿回多少;
// 被迫賣出的賣壓又會把股價往下壓(可能連帶讓別人也斷頭)。結果先記在 S.notices,等流程走到可以停的地方再用卡片告訴玩家
function marginCheck() {
  for (const who of S.players) for (const k of KEYS) {
    const h = who.hold[k];
    if (!(h.loan > 0) || h.n * S.price[k] / h.loan >= MAINT) continue;
    const n = h.n, back = Math.max(0, n * S.price[k] - h.loan), put = h.cost - h.loan;
    who.cash += back; h.n = 0; h.cost = 0; h.loan = 0;
    S.notices.push({ pi: who.i, k, n, back, lost: put - back });
    impact(k, sellF(n));
  }
  for (const who of S.players) for (const k of KEYS) {
    const h = who.short[k];
    if (!h.n || S.price[k] < h.entry * SQUEEZE) continue;
    const n = h.n, back = shortValue(k, who), put = h.entry * n;
    who.cash += back; h.n = 0; h.entry = 0;
    S.notices.push({ pi: who.i, k, n, back, lost: put - back, squeeze: true });
    impact(k, buyF(n));
  }
}
async function flushNotices() {
  while (S.notices.length) {
    const x = S.notices.shift(), sec = SECTORS[x.k], who = nameOf(S.players[x.pi]); x.isMe = isYou(S.players[x.pi]);
    drawAll(); hud(); sfx('liq');
    if (x.squeeze) {
      await cardPanel(x.isMe ? L('Short squeeze: you were forced to cover', '軋空:你被強迫回補') : L(`${who} got squeezed`, `${who}被軋空了`),
        x.isMe
          ? L(`${sec.name} rose more than 30% above where you shorted it. Your ${x.n} shares were bought back at the high price. You got back $${fmt(x.back)} of your deposit and lost $${fmt(x.lost)}. A short loses when the price rises, and there is no limit to how high a price can go.`,
              `${sec.name}比你放空時漲了超過 30%,${x.n} 股被迫用高價買回來還。保證金只拿回 $${fmt(x.back)},賠掉 $${fmt(x.lost)}。放空是漲了就賠,而股價能漲多高沒有上限。`)
          : L(`${who} shorted ${sec.name} and the price rose more than 30%. It had to buy back ${x.n} shares, losing $${fmt(x.lost)}. That forced buying pushes the price up even more.`,
              `${who}放空的${sec.name}漲了超過 30%,被迫買回 ${x.n} 股,賠掉 $${fmt(x.lost)}。這波被迫的買盤又把股價往上推。`),
        `<span class="mv up">${sec.name} ${pct(buyF(x.n))}</span>`);
      continue;
    }
    await cardPanel(x.isMe ? L('Margin call: you were liquidated', '強迫平倉:你被斷頭了') : L(`${who} was force-liquidated`, `${who}被強迫平倉`),
      x.isMe
        ? L(`${sec.name} fell until your margin ratio dropped below 130%. Your ${x.n} shares were sold to repay the loan. You got back $${fmt(x.back)} and lost $${fmt(x.lost)}. Borrowing to buy means being forced to sell at the worst moment.`,
            `${sec.name}下跌,你的融資維持率跌破 130%。${x.n} 股被全部賣掉還款,只拿回 $${fmt(x.back)},賠掉 $${fmt(x.lost)}。借錢買股票,跌的時候會被迫賣在最低點。`)
        : L(`${who} bought ${sec.name} on margin and its ratio fell below 130%. Its ${x.n} shares were dumped, losing $${fmt(x.lost)}. The forced selling pushes the price down even more.`,
            `${who}用融資買的${sec.name}維持率跌破 130%,${x.n} 股被迫全部賣出,賠掉 $${fmt(x.lost)}。這波賣壓又把股價往下壓。`),
      `<span class="mv dn">${sec.name} ${pct(sellF(x.n))}</span>`);
  }
}
// 買越多推越高、賣越多壓越低:每股 0.4%(買 10 股 +4%、買 30 股 +12%),賣出每股 0.3%、最多 -15%。
// 所以先買的人買得便宜,下一個人要用更貴的價格買
const buyF = (n) => 1 + 0.004 * n, sellF = (n) => Math.max(0.85, 1 - 0.003 * n), shortF = (n) => Math.max(0.8, 1 - 0.005 * n), SHORT_F = shortF(LOT);   // 放空每股壓低 0.5%(最多 -20%)
const pct = (f) => `${f >= 1 ? '+' : ''}${Math.round((f - 1) * 100)}%`;
const aiAssets = () => assetsOf(S.ai);
const stockValue = () => KEYS.reduce((a, k) => a + S.hold[k].n * S.price[k], 0);
// 任務:同時有 3 個。完成一個領 $500 獎金並換一個新的,一路玩到回合用完;結算依完成數給星星。
// 每個任務在「抽出來的當下」才決定目標(例如資產成長的門檻跟著你現在的資產走),所以可以重複抽到
const REWARD = 500;
const heldCount = () => KEYS.filter((k) => S.hold[k].n > 0).length;
const MISSION_DEFS = [
  { id: 'spread', make: () => { const need = Math.min(7, Math.max(3, heldCount() + 1));
      return { title: L('Spread it out', '分散投資'), sub: L(`Hold ${need} different assets at once`, `同時持有 ${need} 種不同資產`), ok: () => heldCount() >= need }; } },
  { id: 'paid', make: () => { S.lastDividend = 0;
      return { title: L('Get paid to wait', '領到股利'), sub: L('Collect $150+ in dividends at one payout', '一次領到 $150 以上股利'), ok: () => S.lastDividend >= 150 }; } },
  { id: 'dip', make: () => { S.flags.dip = false;
      return { title: L('Buy the dip', '逢低買進'), sub: L('Buy an asset trading below its opening price', '買進一檔低於開盤價的資產'), ok: () => S.flags.dip }; } },
  { id: 'profit', make: () => { S.flags.profit = false;
      return { title: L('Take profit', '獲利了結'), sub: L('Sell a holding that is up 15% or more', '賣出一檔賺超過 15% 的持股'), ok: () => S.flags.profit }; } },
  { id: 'cash', make: () => { S.cashStreak = 0;
      return { title: L('Keep dry powder', '保留現金'), sub: L('Own assets and keep $2,000+ cash for 3 turns', '持有資產且連續 3 回合現金 $2,000 以上'), ok: () => S.cashStreak >= 3 }; } },
  { id: 'grow', make: () => { const goal = Math.max(11000, Math.ceil(assets() * 1.08 / 500) * 500);
      return { title: L('Grow the pile', '資產成長'), sub: L(`Reach $${fmt(goal)} in total assets`, `總資產達到 $${fmt(goal)}`), ok: () => assets() >= goal }; } },
  { id: 'haven', make: () => ({ title: L('Find a safe haven', '準備避險'), sub: L('Hold gold or bonds', '持有黃金或債券'), ok: () => S.hold.gold.n > 0 || S.hold.bond.n > 0 }) },
  { id: 'index', make: () => ({ title: L('Own the market', '買下整個市場'), sub: L('Hold the whole-market ETF', '持有大盤 ETF'), ok: () => S.hold.etf.n > 0 }) },
  { id: 'income', make: () => ({ title: L('Build income', '打造現金流'), sub: L('Hold 2 assets that pay 3% or more', '持有 2 種配息 3% 以上的資產'), ok: () => KEYS.filter((k) => S.hold[k].n > 0 && SECTORS[k].div >= 0.03).length >= 2 }) },
];
// 抽一個「現在還沒達成、而且場上沒有」的任務
function drawMission() {
  const active = new Set(S.missions.map((m) => m.id));
  const pool = MISSION_DEFS.filter((d) => !active.has(d.id)).sort(() => Math.random() - 0.5);
  for (const d of pool) { const m = { id: d.id, done: false, ...d.make() }; if (!m.ok()) return m; }
  const d = pool[0]; return { id: d.id, done: false, ...d.make() };
}
// 玩家:最多 4 位(真人最多 2 位,排在最前面;其餘是電腦)。每位都有自己的位置、現金、持股、背包……
// 為了不用把整份程式都改寫,S 上面留著「目前視角」的捷徑:
//   S.cash / S.hold / S.bag / S.missions …… → 現在輪到的那位真人(S.hi)
//   S.ai                                    → 現在在走的那位電腦(S.ci)
let CFG = (() => { try { const c = JSON.parse(localStorage.getItem('css.players')); if (c && c.n >= 2 && c.n <= 4 && c.humans >= 1 && c.humans <= 2) return c; } catch (e) {} return { n: 2, humans: 1 }; })();
const P_FIELDS = ['pos', 'lane', 'cash', 'debt', 'bag', 'hold', 'short', 'diceN', 'lastDividend', 'cashStreak', 'flags', 'missions', 'done'];
const mkPlayer = (i, human, char) => ({ i, human, char, pos: 0, lane: null, cash: START_CASH, debt: 0, bag: human ? ['remote'] : [],
  hold: Object.fromEntries(KEYS.map((k) => [k, { n: 0, cost: 0, loan: 0 }])), short: Object.fromEntries(KEYS.map((k) => [k, { n: 0, entry: 0 }])),
  diceN: 2, lastDividend: 0, cashStreak: 0, flags: { dip: false, profit: false }, missions: [], done: 0 });
const others = (i = S.hi) => S.players.filter((p) => p.i !== i);
const nameOf = (p) => p.name || CHARS[p.char].name;      // 真人可以在選角時取名字;沒取就用角色名
const isYou = (p) => p.human && S.nh === 1;                 // 只有一位真人時才用「你」稱呼;兩位真人一律叫角色名字
const assetsOf = (p) => p.cash - p.debt + KEYS.reduce((a, k) => a + p.hold[k].n * S.price[k] - p.hold[k].loan + shortValue(k, p), 0);
function setPlayers(chars, humans, names = []) {
  S.players = chars.map((c, i) => mkPlayer(i, i < humans, c)); names.forEach((nm, i) => { if (nm && S.players[i]) S.players[i].name = nm; }); S.nh = humans; S.hi = 0; S.ci = Math.min(humans, chars.length - 1);
  for (let h = 0; h < humans; h++) { S.hi = h; for (let i = 0; i < 3; i++) S.missions.push(drawMission()); }
  S.hi = 0;
}
function newState() {
  S = {
    rolls: 0, busy: false, over: false, maxRounds: MAX_ROLLS, aiLevel: 'normal', players: [], nh: 1, hi: 0, ci: 1, turn: 0, view: null,      // turn:現在輪到誰;view:資產框手動選看誰(null = 跟著 turn)
    price: Object.fromEntries(KEYS.map((k) => [k, SECTORS[k].open])),
    shop: { round: -1, stock: [], sold: [] }, notices: [], lastEvent: null, after: null,
  };
  for (const f of P_FIELDS) Object.defineProperty(S, f, { get: () => S.players[S.hi][f], set: (v) => { S.players[S.hi][f] = v; } });
  Object.defineProperty(S, 'ai', { get: () => S.players[S.ci] });
  Object.defineProperty(S, 'me', { get: () => S.players[S.hi].char });
  Object.defineProperty(S, 'foe', { get: () => S.players[S.ci].char });
  setPlayers(['cat', 'bear'], 1);       // 先放兩位佔位,選完角色後 start() 會換成真正的名單
}

/* ───────────── Three.js 場景 ───────────── */
const renderer = new THREE.WebGLRenderer({ canvas: $('gl'), antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const outline = new OutlineEffect(renderer, { defaultThickness: 0.006, defaultColor: [0.36, 0.25, 0.2], defaultAlpha: 1 });
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xc9e8b8);

const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
// 棋盤很大,鏡頭平常拉近跟著「現在在走的那顆棋子」;按地圖鈕可以拉遠看全貌
const CAM_OFF = new THREE.Vector3(12, 11, 12), camT = new THREE.Vector3(0, 0.2, 0);
cam.position.copy(camT).add(CAM_OFF);
cam.lookAt(camT);
const view = { half: 5, near: 5, far: 16, overview: false, aspect: 1 };
function applyFrustum() {
  const h = view.half, a = view.aspect;
  cam.left = -h * a; cam.right = h * a; cam.top = h * 0.92; cam.bottom = -h * 1.08;
  cam.updateProjectionMatrix();
}
function resize() {
  const w = innerWidth, h = innerHeight, a = w / h;
  // 文字大小跟著螢幕走:以短邊 640 為基準,手機維持 1 倍,iPad 約 1.2~1.3 倍,最大 1.4 倍
  document.documentElement.style.setProperty('--fs', Math.max(1, Math.min(1.4, Math.min(w, h) / 640)).toFixed(3));
  renderer.setSize(w, h, false);
  // 棋盤在等軸測下大約寬 9、高 6;兩個方向都要塞得下,下方再留一點給按鈕
  view.aspect = a;
  view.near = Math.max(4.6, 5.6 / a);
  view.far = Math.max(8.6, (N * 1.14 + 1) * 0.74 / a);
  view.stageHalf = Math.max(2.3, 2.9 / a);          // 選角舞台:中間一個 + 左右各一個要放得下
  if (!view.half0) { view.half0 = true; view.half = view.near; }
  applyFrustum();
}
addEventListener('resize', resize);

scene.add(new THREE.HemisphereLight(0xffffff, 0xffe9c9, 1.15));
const sun = new THREE.DirectionalLight(0xfff2dd, 1.7);
const SUN_OFF = new THREE.Vector3(-7, 14, 6); sun.position.copy(SUN_OFF); scene.add(sun.target);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -16, right: 16, top: 16, bottom: -16, near: 1, far: 60 });
sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.03;
scene.add(sun);

const STEP = 1.14, TOP = 0.40;
// 卡通渲染:光影不是連續漸層,而是切成三階色塊(gradientMap),再由 OutlineEffect 補上描邊
const toonRamp = (() => {
  const t = new THREE.DataTexture(new Uint8Array([150, 150, 150, 255, 215, 215, 215, 255, 255, 255, 255, 255]), 3, 1, THREE.RGBAFormat);
  t.minFilter = t.magFilter = THREE.NearestFilter; t.needsUpdate = true; return t;
})();
const mat = (c, o = {}) => { const { roughness, metalness, ...rest } = o; return new THREE.MeshToonMaterial({ color: c, gradientMap: toonRamp, ...rest }); };
function box(w, h, d, color, x, y, z, r = 0.06, parent = scene) {
  const m = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 3, Math.min(r, h / 2 - 0.001)), mat(color));
  m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m;
}
// 地面、人行道、草地
{
  const g = new THREE.Mesh(new THREE.PlaneGeometry(140, 140), mat(0xc9e8b8)); g.material.userData.outlineParameters = { visible: false }; g.rotation.x = -Math.PI / 2; g.receiveShadow = true; scene.add(g);
  box(N * STEP + 0.7, 0.12, N * STEP + 0.7, 0xf6e3c2, 0, 0.06, 0, 0.05);
  box((N - 2) * STEP - 0.12, 0.16, (N - 2) * STEP - 0.12, 0x9bdc7a, 0, 0.10, 0, 0.05);
}
// 小鎮裝飾:樹和房子(純幾何)
function tree(x, z, s = 1) {
  const g = new THREE.Group(); g.position.set(x, 0, z); g.scale.setScalar(s); scene.add(g);
  const t = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 0.45, 8), mat(0x9a6b4a)); t.position.y = 0.22; t.castShadow = true; g.add(t);
  [[0.48, 0.62, 0.7], [0.38, 0.52, 1.05], [0.26, 0.42, 1.36]].forEach(([r, h, y], i) => {
    const c = new THREE.Mesh(new THREE.ConeGeometry(r, h, 8), mat(i % 2 ? 0x5fb87a : 0x4fa86c)); c.position.y = y; c.castShadow = true; g.add(c);
  });
}
function house(x, z, wall, roof, ry = 0) {
  const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry; scene.add(g);
  box(1.5, 0.95, 1.2, wall, 0, 0.48, 0, 0.05, g);
  const r = new THREE.Mesh(new THREE.ConeGeometry(1.18, 0.62, 4), mat(roof)); r.position.y = 1.26; r.rotation.y = Math.PI / 4; r.scale.set(1, 1, 0.82); r.castShadow = true; g.add(r);
  box(0.3, 0.46, 0.05, 0x9a6b4a, 0.3, 0.24, 0.61, 0.02, g);
  box(0.34, 0.3, 0.05, 0xbfe6ff, -0.35, 0.55, 0.61, 0.02, g);
}
function lamp(x, z) {
  const g = new THREE.Group(); g.position.set(x, 0, z); scene.add(g);
  const p = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, 1.1, 8), mat(0x4a5568)); p.position.y = 0.55; p.castShadow = true; g.add(p);
  const b = new THREE.Mesh(new THREE.SphereGeometry(0.13, 14, 10), new THREE.MeshStandardMaterial({ color: 0xfff2b8, emissive: 0xffd76a, emissiveIntensity: 0.9 })); b.position.y = 1.18; g.add(b);
  box(0.2, 0.05, 0.2, 0x4a5568, 0, 1.34, 0, 0.02, g);
}
function fence(x, z, len, alongX) {
  for (let i = 0; i < len; i++) { const o = (i - (len - 1) / 2) * 0.42;
    box(alongX ? 0.36 : 0.08, 0.34, alongX ? 0.08 : 0.36, 0xd9a86c, x + (alongX ? o : 0), 0.2, z + (alongX ? 0 : o), 0.02); }
}
const E = N / 2 * STEP + 0.62;
[[-E, -E], [E, -E], [-E, E]].forEach(([x, z]) => lamp(x, z));   // 最靠鏡頭的那個角不放,會擋到起點
// 外圍:只在「鏡頭對面」的兩側放樹和房子,靠鏡頭這兩側放了會擋到格子
{
  const walls = [0xfff1dc, 0xffe6ee, 0xeef4ff, 0xfdf6e3], roofs = [0x6fb7c9, 0xf2a35e, 0xe2726b, 0xd9b24a, 0x8fbf6a];
  let k = 0;
  for (let t = -E; t <= E; t += 2.3) {
    const far = E + 1.7 + (k % 3) * 0.7;
    if (k % 4 === 1) { house(-far - 0.8, t, walls[k % 4], roofs[k % 5], Math.PI / 2 + 0.1); house(t, -far - 0.8, walls[(k + 2) % 4], roofs[(k + 3) % 5], 0.1); }
    else { tree(-far, t, 1 + (k % 3) * 0.15); tree(t, -far, 1 + ((k + 1) % 3) * 0.15); }
    if (k % 2 === 0) { fence(-E - 0.5, t, 3, false); fence(t, -E - 0.5, 3, true); }
    k++;
  }
}
// 中間的大草地:一個小公園(池塘、樹、房子、花),都離內圈 3.5 格以上,留給骰子滾
{
  const pond = new THREE.Mesh(new THREE.CylinderGeometry(1.9, 1.9, 0.06, 40), mat(0x8fd3ff)); pond.position.set(-0.8, 0.2, 0.6); pond.scale.z = 0.7; scene.add(pond);
  const rim = new THREE.Mesh(new THREE.CylinderGeometry(2.1, 2.1, 0.05, 40), mat(0xf6e3c2)); rim.position.set(-0.8, 0.185, 0.6); rim.scale.z = 0.72; scene.add(rim);
  [[-3.4, -2.6, 1.2], [-2.2, -3.6, 1], [2.6, -3.2, 1.3], [3.6, -1.4, 1], [3.2, 2.6, 1.1], [-3.8, 2.4, 1.1], [1.2, 3.6, 1], [-1.6, 3.4, 1.2], [0.6, -3.9, 1.1]].forEach(([x, z, sc]) => tree(x, z, sc));
  house(1.9, -0.9, 0xfff1dc, 0xe2726b, 0.4);
  lamp(0.6, 2.2); lamp(-2.4, 1.9);
}
// 花很多(幾百朵),每朵各自一個 Mesh 的話一幀要多畫上千次 → 用 InstancedMesh 併成兩次繪製,而且不描邊
function flowers(n) {
  const cols = [0xffffff, 0xffd24a, 0xff9ec4, 0xffffff].map((c) => new THREE.Color(c));
  const R = (N - 2) * STEP - 0.8, pts = [];
  for (let i = 0; i < n; i++) {
    const x = (Math.random() - 0.5) * R, z = (Math.random() - 0.5) * R;
    if (Math.hypot((x + 0.8) / 2.3, (z - 0.6) / 1.7) < 1) continue;   // 不要長在池塘裡
    pts.push([x, z]);
  }
  const noLine = (m) => { m.userData.outlineParameters = { visible: false }; return m; };
  const petals = new THREE.InstancedMesh(new THREE.SphereGeometry(0.045, 8, 6), noLine(mat(0xffffff)), pts.length);
  const leaves = new THREE.InstancedMesh(new THREE.SphereGeometry(0.07, 8, 6), noLine(mat(0x86c96f)), pts.length);
  const m4 = new THREE.Matrix4();
  pts.forEach(([x, z], i) => {
    petals.setMatrixAt(i, m4.makeTranslation(x, 0.21, z)); petals.setColorAt(i, cols[i % cols.length]);
    leaves.setMatrixAt(i, m4.makeScale(1, 0.5, 1).setPosition(x + 0.05, 0.19, z + 0.03));
  });
  petals.instanceColor.needsUpdate = true;
  scene.add(petals, leaves);
}
flowers(320);

/* ───────────── 棋盤 ───────────── */
// 5x5 外圈,從最靠近鏡頭的角開始逆時針走
const COORD = [];
const M = N - 1;
for (let x = M; x >= 0; x--) COORD.push([x, M]);
for (let z = M - 1; z >= 0; z--) COORD.push([0, z]);
for (let x = 1; x <= M; x++) COORD.push([x, 0]);
for (let z = 1; z <= M - 1; z++) COORD.push([M, z]);
const tilePos = (i) => new THREE.Vector3((COORD[i][0] - M / 2) * STEP, 0, (COORD[i][1] - M / 2) * STEP);

const COIN_GEO = new THREE.CylinderGeometry(0.17, 0.17, 0.065, 20), COIN_MAT = mat(0xffd24a), COIN_MAT2 = mat(0xf5b82e);
const tiles = [];
TILES.forEach((type, i) => {
  const p = tilePos(i), sec = SECTORS[type];
  const g = new THREE.Group(); g.position.copy(p); scene.add(g);
  const special = !sec;
  box(1.04, 0.30, 1.04, sec ? sec.color : TILE_COLOR[type], 0, 0.21, 0, 0.09, g);
  box(1.0, 0.10, 1.0, special ? TILE_COLOR[type] : 0xfff8ec, 0, TOP - 0.05, 0, 0.045, g);
  // 標籤:畫在 canvas 上貼在格子頂面,朝鏡頭方向轉 45° 讓字是正的
  const cv = document.createElement('canvas'); cv.width = cv.height = 256;
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const holder = new THREE.Group(); holder.rotation.y = Math.PI / 4; holder.position.y = TOP + 0.004; g.add(holder);
  const lab = new THREE.Mesh(new THREE.PlaneGeometry(0.98, 0.98), Object.assign(new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }), { userData: { outlineParameters: { visible: false } } }));
  lab.rotation.x = -Math.PI / 2; holder.add(lab);
  // 你的持股:格子角落疊金幣,每 10 股一枚(最多 6 枚)。以前是一根方柱加白色頂蓋,從介面後面露出來像破圖
  let bld = null;
  if (sec) {
    bld = new THREE.Group(); bld.position.set(0.36, TOP, -0.36);   // 放在畫面右側那個角,不擋圖示和價格
    bld.visible = false; g.add(bld);
    for (let i = 0; i < 6; i++) {
      const coin = new THREE.Mesh(COIN_GEO, i % 2 ? COIN_MAT2 : COIN_MAT); coin.position.set((i % 2) * 0.02, 0.035 + i * 0.07, (i % 3) * 0.015); coin.castShadow = true; bld.add(coin);
    }
  }
  tiles.push({ type, g, cv, tex, bld, bldH: 0 });
});
// 中間的小路:拘留小路(灰)和 IPO 小路(綠)。格子做法和外圈一樣,標籤是固定的所以只畫一次
const cellPos = (x, z) => new THREE.Vector3((x - M / 2) * STEP, 0, (z - M / 2) * STEP);
const LANE_COLOR = { jail: 0x7b8494, ipo: 0x2fbf9f };
const laneTiles = {};
for (const [type, def] of Object.entries(LANES)) laneTiles[type] = [def.cell].map(([x, z]) => {
  const g = new THREE.Group(); g.position.copy(cellPos(x, z)); scene.add(g);
  box(1.04, 0.30, 1.04, type === 'jail' ? 0x565e6c : 0x1f9a80, 0, 0.21, 0, 0.09, g);
  box(1.0, 0.10, 1.0, LANE_COLOR[type], 0, TOP - 0.05, 0, 0.045, g);
  const cv = document.createElement('canvas'); cv.width = cv.height = 256; const c = cv.getContext('2d');
  const F = (px) => `900 ${px}px "Avenir Next","PingFang TC","Helvetica Neue",Arial,sans-serif`;
  c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = '#fff'; c.strokeStyle = '#fff';
  if (type === 'jail') {
    c.lineWidth = 13; c.beginPath(); c.arc(128, 76, 27, Math.PI, 0); c.lineTo(155, 96); c.moveTo(101, 76); c.lineTo(101, 96); c.stroke();   // 鎖頭
    c.beginPath(); c.roundRect(84, 92, 88, 62, 12); c.fill();
    c.font = F(ZH ? 40 : 34); c.fillText(L('POLICE', '警察局'), 128, 202);
  } else {
    c.font = F(84); c.fillText('IPO', 128, 96);
    c.font = F(ZH ? 40 : 36); c.fillText(L(`${IPO_FREE} FREE`, `送 ${IPO_FREE} 股`), 128, 186);
  }
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const holder = new THREE.Group(); holder.rotation.y = Math.PI / 4; holder.position.y = TOP + 0.004; g.add(holder);
  const lab = new THREE.Mesh(new THREE.PlaneGeometry(0.98, 0.98), Object.assign(new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }), { userData: { outlineParameters: { visible: false } } }));
  lab.rotation.x = -Math.PI / 2; holder.add(lab);
  return { g };
});
// 小路旁的建築:警察局(拘留小路)和交易所(IPO 小路,白色、金色的鐘)
{
  // 警察局:放在拘留小路「後面」那一側(才不會擋到站在格子上的棋子)。藍白色的建築、鐵窗、屋頂的紅藍警示燈,
  // 再立一塊面向鏡頭的招牌寫「警察局 POLICE」,玩家一看就知道被送到哪裡
  const j = new THREE.Group(); j.position.copy(cellPos(2, 5.75));
  scene.add(j);
  box(1.5, 1.0, 1.0, 0xf4f7ff, 0, 0.69, 0, 0.05, j);                                                // 主體(白)
  box(1.54, 0.2, 1.04, 0x2f5fd0, 0, 0.3, 0, 0.03, j);                                               // 底部藍色腰帶
  box(1.62, 0.14, 1.12, 0x2f5fd0, 0, 1.26, 0, 0.04, j);                                             // 屋頂(藍)
  box(0.34, 0.56, 0.04, 0x33415c, 0, 0.47, 0.51, 0.02, j);                                          // 門
  for (const wx of [-0.5, 0.5]) { box(0.3, 0.3, 0.03, 0x9fd0ff, wx, 0.78, 0.51, 0.02, j);           // 兩扇窗 + 鐵窗
    for (let i = -1; i <= 1; i++) box(0.03, 0.3, 0.04, 0x33415c, wx + i * 0.09, 0.78, 0.53, 0.01, j); }
  for (let i = -1; i <= 1; i++) box(0.04, 0.34, 0.05, 0x33415c, 0.76, 0.78, i * 0.14, 0.01, j);     // 側面的鐵窗
  { const red = new THREE.Mesh(new THREE.SphereGeometry(0.1, 14, 10), new THREE.MeshBasicMaterial({ color: 0xff4d4d })); red.position.set(-0.14, 1.43, 0); j.add(red);
    const blue = new THREE.Mesh(new THREE.SphereGeometry(0.1, 14, 10), new THREE.MeshBasicMaterial({ color: 0x4d8dff })); blue.position.set(0.14, 1.43, 0); j.add(blue);
    box(0.5, 0.06, 0.2, 0x33415c, 0, 1.35, 0, 0.02, j); }
  { const cv = document.createElement('canvas'); cv.width = 512; cv.height = 160; const c = cv.getContext('2d');
    c.fillStyle = '#2f5fd0'; c.beginPath(); c.roundRect(0, 0, 512, 160, 26); c.fill();
    c.strokeStyle = '#fff'; c.lineWidth = 8; c.beginPath(); c.roundRect(8, 8, 496, 144, 20); c.stroke();
    c.fillStyle = '#fff'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.font = '900 76px "PingFang TC","Noto Sans TC","Helvetica Neue",Arial,sans-serif'; c.fillText(L('POLICE', '警察局'), 256, ZH ? 64 : 84);
    if (ZH) { c.font = '900 34px "Helvetica Neue",Arial,sans-serif'; c.fillText('POLICE', 256, 124); }
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.47), Object.assign(new THREE.MeshBasicMaterial({ map: tex, transparent: true }), { userData: { outlineParameters: { visible: false } } }));
    sign.position.set(0, 1.86, 0); sign.rotation.y = Math.PI / 4; j.add(sign);                      // 招牌轉 45 度,正對鏡頭
    box(0.06, 0.34, 0.06, 0x33415c, -0.3, 1.5, 0.3, 0.01, j); box(0.06, 0.34, 0.06, 0x33415c, 0.3, 1.5, -0.3, 0.01, j); }   // 招牌的兩根支柱
  const x = new THREE.Group(); x.position.copy(cellPos(12.95, 8)); scene.add(x);
  box(1.0, 0.7, 1.0, 0xfff8ec, 0, 0.53, 0, 0.05, x); box(1.14, 0.12, 1.14, 0x2fbf9f, 0, 0.94, 0, 0.04, x);
  for (const sx of [-0.32, 0, 0.32]) box(0.1, 0.5, 0.1, 0xffffff, sx, 0.45, 0.52, 0.03, x);         // 柱子
  box(0.5, 0.3, 0.5, 0xfff8ec, 0, 1.15, 0, 0.04, x);
  const bell = new THREE.Mesh(new THREE.SphereGeometry(0.2, 20, 14), mat(0xffc93c)); bell.position.y = 1.5; bell.castShadow = true; x.add(bell);
}
// 類股圖示:自己用 canvas 畫的簡單圖形(不用任何真實公司的商標)
function icon(c, type, x, y, r, color) {
  c.save(); c.translate(x, y); c.fillStyle = color; c.strokeStyle = color; c.lineWidth = r * 0.16; c.lineJoin = 'round'; c.lineCap = 'round';
  const rr = (X, Y, W, H, R) => { c.beginPath(); c.roundRect(X, Y, W, H, R); };
  if (type === 'soft') { c.lineWidth = r * 0.22; c.beginPath(); c.moveTo(-r * 0.35, -r * 0.6); c.lineTo(-r, 0); c.lineTo(-r * 0.35, r * 0.6); c.moveTo(r * 0.35, -r * 0.6); c.lineTo(r, 0); c.lineTo(r * 0.35, r * 0.6); c.stroke();
    c.beginPath(); c.moveTo(r * 0.18, -r * 0.9); c.lineTo(-r * 0.18, r * 0.9); c.stroke(); }
  else if (type === 'tech') { rr(-r, -r * 0.78, r * 2, r * 1.3, r * 0.18); c.fill(); c.fillRect(-r * 0.14, r * 0.5, r * 0.28, r * 0.3); rr(-r * 0.55, r * 0.74, r * 1.1, r * 0.2, r * 0.1); c.fill();
    c.fillStyle = '#fff'; rr(-r * 0.78, -r * 0.58, r * 1.56, r * 0.9, r * 0.08); c.fill(); }
  else if (type === 'chip') { for (let i = -1; i <= 1; i++) { c.beginPath(); c.moveTo(i * r * 0.45, -r); c.lineTo(i * r * 0.45, r); c.moveTo(-r, i * r * 0.45); c.lineTo(r, i * r * 0.45); c.stroke(); }
    rr(-r * 0.72, -r * 0.72, r * 1.44, r * 1.44, r * 0.2); c.fill(); c.fillStyle = '#fff'; rr(-r * 0.34, -r * 0.34, r * 0.68, r * 0.68, r * 0.1); c.fill(); }
  else if (type === 'agri') { c.lineWidth = r * 0.16; c.beginPath(); c.moveTo(0, r); c.lineTo(0, -r * 0.3); c.stroke();
    for (let i = 0; i < 4; i++) { const y = r * 0.6 - i * r * 0.36; for (const sgn of [-1, 1]) { c.beginPath(); c.ellipse(sgn * r * 0.3, y, r * 0.3, r * 0.16, sgn * 0.6, 0, 7); c.fill(); } }
    c.beginPath(); c.ellipse(0, -r * 0.72, r * 0.18, r * 0.32, 0, 0, 7); c.fill(); }
  else if (type === 'yield') { for (let i = 0; i < 4; i++) { const hgt = r * (0.5 + i * 0.45); c.beginPath(); c.roundRect(-r * 0.95 + i * r * 0.5, r * 0.9 - hgt, r * 0.36, hgt, r * 0.08); c.fill(); }
    c.beginPath(); c.arc(-r * 0.78, -r * 0.5, r * 0.14, 0, 7); c.fill(); c.lineWidth = r * 0.1; c.beginPath(); c.arc(-r * 0.78, -r * 0.5, r * 0.36, -2.2, -0.9); c.stroke(); }
  else if (type === 'oil') { c.beginPath(); c.moveTo(r * 0.25, -r); c.lineTo(-r * 0.6, r * 0.15); c.lineTo(-r * 0.05, r * 0.15); c.lineTo(-r * 0.3, r); c.lineTo(r * 0.6, -r * 0.2); c.lineTo(r * 0.05, -r * 0.2); c.closePath(); c.fill(); }
  else if (type === 'health') { rr(-r, -r, r * 2, r * 2, r * 0.4); c.fill(); c.fillStyle = '#fff'; c.fillRect(-r * 0.2, -r * 0.62, r * 0.4, r * 1.24); c.fillRect(-r * 0.62, -r * 0.2, r * 1.24, r * 0.4); }
  else if (type === 'reit') { c.beginPath(); c.moveTo(0, -r); c.lineTo(r * 1.05, -r * 0.1); c.lineTo(-r * 1.05, -r * 0.1); c.closePath(); c.fill(); c.fillRect(-r * 0.72, -r * 0.1, r * 1.44, r * 1.05);
    c.fillStyle = '#fff'; c.fillRect(-r * 0.2, r * 0.3, r * 0.4, r * 0.65); }
  else if (type === 'fin') { c.beginPath(); c.moveTo(0, -r); c.lineTo(r * 1.05, -r * 0.35); c.lineTo(-r * 1.05, -r * 0.35); c.closePath(); c.fill();
    for (let i = -1; i <= 1; i++) c.fillRect(i * r * 0.6 - r * 0.14, -r * 0.2, r * 0.28, r * 0.85); c.fillRect(-r, r * 0.72, r * 2, r * 0.26); }
  else if (type === 'trans') { c.beginPath(); c.moveTo(-r, r * 0.15); c.lineTo(r, r * 0.15); c.lineTo(r * 0.68, r * 0.85); c.lineTo(-r * 0.68, r * 0.85); c.closePath(); c.fill();
    c.fillRect(-r * 0.5, -r * 0.5, r * 0.75, r * 0.55); c.fillRect(r * 0.32, -r * 0.95, r * 0.2, r * 1.0); c.fillStyle = '#fff'; c.fillRect(-r * 0.36, -r * 0.36, r * 0.2, r * 0.2); c.fillRect(-r * 0.06, -r * 0.36, r * 0.2, r * 0.2); }
  else if (type === 'bio') { c.beginPath(); c.moveTo(-r * 0.24, -r); c.lineTo(r * 0.24, -r); c.lineTo(r * 0.24, -r * 0.3); c.lineTo(r * 0.85, r * 0.78); c.quadraticCurveTo(r * 0.9, r, r * 0.65, r); c.lineTo(-r * 0.65, r); c.quadraticCurveTo(-r * 0.9, r, -r * 0.85, r * 0.78); c.lineTo(-r * 0.24, -r * 0.3); c.closePath(); c.fill();
    c.fillRect(-r * 0.38, -r * 1.02, r * 0.76, r * 0.16); c.fillStyle = '#fff'; c.beginPath(); c.arc(-r * 0.15, r * 0.5, r * 0.14, 0, 7); c.arc(r * 0.25, r * 0.3, r * 0.1, 0, 7); c.fill(); }
  else if (type === 'staples') { c.beginPath(); c.arc(0, -r * 0.05, r, 0, Math.PI); c.closePath(); c.fill(); c.fillRect(-r * 0.5, r * 0.85, r, r * 0.16);
    for (const [x, y] of [[-0.5, -0.4], [0, -0.55], [0.5, -0.4], [-0.25, -0.25], [0.25, -0.25]]) { c.beginPath(); c.arc(x * r, y * r, r * 0.17, 0, 7); c.fill(); } }
  else if (type === 'disc') { rr(-r, -r * 0.5, r * 2, r * 1.4, r * 0.2); c.fill(); c.lineWidth = r * 0.2; rr(-r * 0.4, -r * 0.95, r * 0.8, r * 0.6, r * 0.15); c.stroke();
    c.fillStyle = '#fff'; c.fillRect(-r, r * 0.05, r * 2, r * 0.16); }
  else if (type === 'util') { c.beginPath(); c.arc(0, -r * 0.25, r * 0.75, 0, 7); c.fill(); c.fillRect(-r * 0.36, r * 0.35, r * 0.72, r * 0.3); rr(-r * 0.26, r * 0.72, r * 0.52, r * 0.24, r * 0.08); c.fill();
    c.fillStyle = '#fff'; c.beginPath(); c.moveTo(r * 0.12, -r * 0.7); c.lineTo(-r * 0.28, -r * 0.18); c.lineTo(0, -r * 0.18); c.lineTo(-r * 0.12, r * 0.22); c.lineTo(r * 0.28, -r * 0.34); c.lineTo(0, -r * 0.34); c.closePath(); c.fill(); }
  else if (type === 'mat') { for (const [x, y] of [[-0.55, 0.45], [0.55, 0.45], [0, -0.45]]) { c.beginPath(); c.moveTo((x - 0.5) * r, (y + 0.4) * r); c.lineTo((x - 0.32) * r, (y - 0.4) * r); c.lineTo((x + 0.32) * r, (y - 0.4) * r); c.lineTo((x + 0.5) * r, (y + 0.4) * r); c.closePath(); c.fill(); } }
  else if (type === 'gold') { c.beginPath(); c.moveTo(-r, r * 0.6); c.lineTo(-r * 0.6, -r * 0.6); c.lineTo(r * 0.6, -r * 0.6); c.lineTo(r, r * 0.6); c.closePath(); c.fill();
    c.fillStyle = '#fff'; c.beginPath(); c.moveTo(-r * 0.42, -r * 0.34); c.lineTo(r * 0.1, -r * 0.34); c.lineTo(r * 0.02, -r * 0.1); c.lineTo(-r * 0.5, -r * 0.1); c.closePath(); c.fill(); }
  else if (type === 'bond') { rr(-r * 0.75, -r, r * 1.5, r * 2, r * 0.14); c.fill(); c.fillStyle = '#fff'; for (let i = 0; i < 3; i++) c.fillRect(-r * 0.48, -r * 0.62 + i * r * 0.38, r * 0.96, r * 0.14);
    c.beginPath(); c.arc(r * 0.22, r * 0.6, r * 0.2, 0, 7); c.fill(); }
  else if (type === 'etf') { c.beginPath(); c.arc(0, 0, r, 0, 7); c.fill(); c.strokeStyle = '#fff'; c.lineWidth = r * 0.14;
    for (const a of [-Math.PI / 2, Math.PI / 6, Math.PI * 5 / 6]) { c.beginPath(); c.moveTo(0, 0); c.lineTo(Math.cos(a) * r, Math.sin(a) * r); c.stroke(); } }
  else if (type === 'green') { c.beginPath(); c.moveTo(-r * 0.85, r * 0.85); c.quadraticCurveTo(-r, -r, r * 0.9, -r * 0.9); c.quadraticCurveTo(r, r * 0.9, -r * 0.85, r * 0.85); c.fill();
    c.strokeStyle = '#fff'; c.lineWidth = r * 0.13; c.beginPath(); c.moveTo(-r * 0.6, r * 0.6); c.lineTo(r * 0.45, -r * 0.45); c.stroke(); }
  else if (type === 'def') { c.beginPath(); c.moveTo(0, -r); c.lineTo(r * 0.9, -r * 0.6); c.lineTo(r * 0.9, r * 0.1); c.quadraticCurveTo(r * 0.7, r * 0.8, 0, r); c.quadraticCurveTo(-r * 0.7, r * 0.8, -r * 0.9, r * 0.1); c.lineTo(-r * 0.9, -r * 0.6); c.closePath(); c.fill();
    c.fillStyle = '#fff'; c.beginPath(); c.arc(0, -r * 0.05, r * 0.3, 0, 7); c.fill(); }
  else if (type === 'game') { rr(-r, -r * 0.55, r * 2, r * 1.2, r * 0.5); c.fill(); c.fillStyle = '#fff'; c.fillRect(-r * 0.68, -r * 0.08, r * 0.5, r * 0.16); c.fillRect(-r * 0.51, -r * 0.25, r * 0.16, r * 0.5);
    c.beginPath(); c.arc(r * 0.38, -r * 0.12, r * 0.13, 0, 7); c.arc(r * 0.64, r * 0.12, r * 0.13, 0, 7); c.fill(); }
  else if (type === 'crypto') { c.beginPath(); c.arc(0, 0, r, 0, 7); c.fill(); c.strokeStyle = '#fff'; c.lineWidth = r * 0.1; c.beginPath(); c.arc(0, 0, r * 0.78, 0, 7); c.stroke();
    c.fillStyle = '#fff'; c.font = `900 ${r * 1.1}px Arial`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('M', 0, r * 0.06); }
  c.restore();
}
function drawLabel(i) {
  const t = tiles[i], c = t.cv.getContext('2d'), sec = SECTORS[t.type];
  c.clearRect(0, 0, 256, 256); c.textAlign = 'center'; c.textBaseline = 'middle';
  const F = (px) => `900 ${px}px "Avenir Next","PingFang TC","Helvetica Neue",Arial,sans-serif`;
  if (sec) {
    icon(c, t.type, 128, 62, 34, sec.css);
    c.fillStyle = sec.css; c.font = F(sec.code.length > 8 ? 28 : ZH ? (sec.code.length > 3 ? 34 : 38) : 34); c.fillText(sec.code, 128, 136);
    c.fillStyle = '#3b2f2a'; c.font = F(62); c.fillText('$' + Math.round(S.price[t.type]), 128, 196);
  } else if (t.type === 'chance') {
    c.fillStyle = '#b0780a'; c.font = F(150); c.fillText('?', 128, 112);
    c.font = F(34); c.fillText(L('EVENT', '市場事件'), 128, 208);
  } else if (t.type === 'fate') {
    c.fillStyle = '#fff'; c.font = F(130); c.fillText('★', 128, 112);
    c.font = F(ZH ? 44 : 40); c.fillText(L('FATE', '命運'), 128, 208);
  } else {
    const [a, b] = { start: [L('GO', '起點'), L('+$' + SALARY, '領薪水股利')], fee: [L('FEE', '手續費'), '-$' + FEE], shop: [L('SHOP', '商店'), L('buy items', '買道具')], gift: [L('GIFT', '禮物'), L('free item', '送道具')], fate: [L('FATE', '命運'), L('flip a card', '翻一張牌')], bank: [L('BANK', '銀行'), L('loans', '借錢 還錢')], ipo: ['IPO', L('enter lane', '新股申購')], divi: [L('DIVIDEND', '股息結算'), L('paid here', '在此領股利')] }[t.type];
    c.fillStyle = '#fff'; c.font = F(a.length > 5 ? 40 : (ZH && a !== 'IPO' ? (a.length > 3 ? 50 : 60) : 72)); c.fillText(a, 128, 104);
    c.font = F(ZH ? 34 : 40); c.fillText(b, 128, 168);
  }
  t.tex.needsUpdate = true;
}
const drawAll = () => tiles.forEach((_, i) => drawLabel(i));

/* ───────────── 棋子(貓) ───────────── */
const piece = new THREE.Group(); scene.add(piece);
const body = new THREE.Group(); piece.add(body);
// 棋子可選:預設是原創的幾何兔子;網址加 ?piece=cat 換回房間那隻貓的模型
const PRESET = new URLSearchParams(location.search).get('piece');   // ?piece=cat|bunny|bear|dog 可以跳過選角
// 原創兔子(純幾何):奶油色、一隻耳朵折下來、腮紅、粉紅圓點鼻、橘色圍巾。正面朝 +z
function makeBunny() {
  const g = new THREE.Group();
  const fur = mat(0xfff4e2, { roughness: 0.9 }), pink = mat(0xffb3c7), dark = mat(0x2b2420, { roughness: 0.5 }), scarf = mat(0xff8a3d);
  const add = (geo, m, x, y, z, sx = 1, sy = 1, sz = 1) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.scale.set(sx, sy, sz); o.castShadow = true; g.add(o); return o; };
  const sph = (r) => new THREE.SphereGeometry(r, 24, 18);
  add(sph(0.22), fur, 0, 0.24, 0, 1, 1.08, 0.92);                    // 身體
  add(sph(0.075), fur, -0.11, 0.045, 0.07, 1, 0.6, 1.3);             // 腳
  add(sph(0.075), fur, 0.11, 0.045, 0.07, 1, 0.6, 1.3);
  add(sph(0.06), fur, -0.2, 0.27, 0.05, 0.8, 1.3, 0.8);              // 手
  add(sph(0.06), fur, 0.2, 0.27, 0.05, 0.8, 1.3, 0.8);
  add(sph(0.07), fur, 0, 0.2, -0.2);                                 // 尾巴
  add(new THREE.TorusGeometry(0.15, 0.05, 10, 24), scarf, 0, 0.43, 0).rotation.x = Math.PI / 2;   // 圍巾
  add(new THREE.BoxGeometry(0.09, 0.2, 0.04), scarf, 0.1, 0.33, 0.15).rotation.z = -0.25;
  add(sph(0.24), fur, 0, 0.62, 0, 1.12, 0.95, 1);                    // 頭(偏扁寬)
  // 耳朵:左耳直立,右耳折下來
  const earGeo = new THREE.CapsuleGeometry(0.062, 0.26, 6, 14), inGeo = new THREE.CapsuleGeometry(0.032, 0.2, 4, 10);
  const earL = add(earGeo, fur, -0.11, 0.98, 0); earL.rotation.z = 0.12;
  const inL = add(inGeo, pink, -0.11, 0.98, 0.04); inL.rotation.z = 0.12; inL.castShadow = false;
  const earR = add(new THREE.CapsuleGeometry(0.062, 0.12, 6, 14), fur, 0.12, 0.9, 0); earR.rotation.z = -0.2;
  const tip = add(new THREE.CapsuleGeometry(0.06, 0.13, 6, 14), fur, 0.24, 0.98, 0.02); tip.rotation.z = -1.35;   // 折下來的那一段
  add(sph(0.028), dark, -0.095, 0.65, 0.215);                        // 眼睛
  add(sph(0.028), dark, 0.095, 0.65, 0.215);
  add(sph(0.024), pink, 0, 0.595, 0.24);                             // 粉紅圓點鼻
  add(sph(0.045), pink, -0.165, 0.575, 0.17, 1, 0.6, 0.5).castShadow = false;   // 腮紅
  add(sph(0.045), pink, 0.165, 0.575, 0.17, 1, 0.6, 0.5).castShadow = false;
  return g;
}
// 載入棋子模型:先放幾何佔位,模型到了再換。貼圖保留,材質換成卡通著色讓它和場景同一種畫風
// 模型只下載、解壓一次(快取成 Promise),要用的地方拿 clone。貼圖保留,材質換成卡通著色讓它和場景同一種畫風
const pieceLoader = (() => { const d = new DRACOLoader(); d.setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.174.0/examples/jsm/libs/draco/'); const l = new GLTFLoader(); l.setDRACOLoader(d); return l; })();
const modelCache = {};
function loadModel(url, height) {
  return (modelCache[url] ||= new Promise((res, rej) => pieceLoader.load(url, (gltf) => {
    const m = gltf.scene;
    const bb = new THREE.Box3().setFromObject(m), size = bb.getSize(new THREE.Vector3()), ctr = bb.getCenter(new THREE.Vector3());
    const k = height / size.y;
    m.scale.setScalar(k); m.position.set(-ctr.x * k, -bb.min.y * k, -ctr.z * k);
    m.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = true;
      const old = o.material;
      o.material = new THREE.MeshToonMaterial({ map: old.map || null, gradientMap: toonRamp, side: old.side });
      // 生成模型在 UV 接縫處法線不連續,描邊會沿接縫裂開變成臉上的髒線 → 這個模型不描邊
      o.material.userData.outlineParameters = { visible: false };
    });
    const wrap = new THREE.Group(); wrap.add(m); res(wrap);
  }, undefined, rej)));
}
// 先放幾何佔位,模型到了再換
function loadPiece(url, height, placeholder, target = body) {
  placeholder.name = 'ph'; target.add(placeholder);
  const token = (target.userData.token = (target.userData.token || 0) + 1);   // 之後又換角色的話,舊的載入結果就丟掉
  loadModel(url, height).then((tpl) => {
    if (target.userData.token !== token) return;
    target.remove(target.getObjectByName('ph')); target.add(tpl.clone(true));
  }).catch((e) => console.warn(`[board] ${url} 載入失敗,維持幾何佔位`, e));
}
body.rotation.y = Math.PI / 4;
// 對手(電腦控制)。和玩家站同一格時各往一邊偏一點才不會疊在一起
const bearPiece = new THREE.Group(); scene.add(bearPiece);
const bearBody = new THREE.Group(); bearPiece.add(bearBody); bearBody.rotation.y = Math.PI / 4;
// 四個角色:開局選一隻當自己,電腦從剩下的挑一隻當對手。模型都是 Meshy 生成後壓到約 250 KB
const CHARS = {
  cat:   { url: './kitty.glb?v=1', h: 1.25, name: L('Kitty', '貓咪'), icon: '🐱', color: 0xffb057 },
  bunny: { url: './bunny.glb?v=1', h: 1.3,  name: L('Bunny', '兔子'), icon: '🐰', color: 0xfff4e2 },
  bear:  { url: './bear.glb?v=1',  h: 1.25, name: L('Bear', '小熊'),  icon: '🐻', color: 0xb9793f },
  dog:   { url: './pup.glb?v=1',   h: 1.25, name: L('Pup', '狗狗'),   icon: '🐶', color: 0xe8c9a0 },
  penguin: { url: './penguin.glb?v=1', h: 1.2,  name: L('Penguin', '小企鵝'),   icon: '🐧', color: 0x4a5a78 },
  guinea:  { url: './guinea.glb?v=1',  h: 1.15, name: L('Guinea pig', '天竺鼠'), icon: '🐹', color: 0xe9b97a },
  fox:     { url: './fox.glb?v=1',     h: 1.25, name: L('Fox', '小狐狸'),       icon: '🦊', color: 0xf08a3c },
  pony:    { url: './pony.glb?v=1',    h: 1.3,  name: L('Pony', '小馬'),        icon: '🐴', color: 0xd9b48a },
};
function setChar(target, key) {
  while (target.children.length) target.remove(target.children[0]);
  const c = CHARS[key], ph = new THREE.Group(), m = mat(c.color);
  const b = new THREE.Mesh(new THREE.SphereGeometry(0.26, 20, 16), m); b.position.y = 0.26; b.scale.y = 1.1; ph.add(b);
  const h = new THREE.Mesh(new THREE.SphereGeometry(0.22, 20, 16), m); h.position.y = 0.68; ph.add(h);
  loadPiece(c.url, c.h, ph, target);
}
// 選角舞台:在起點外側的空地。選到的角色站在正中間、最大;左右各露出一個「上一個 / 下一個」,比較小、退後一點;
// 其他的收起來看不到。按左右(或直接點旁邊那個)時整排滑過去,像翻唱片封面。被選到的會跳一下、慢慢自轉
const STAGE = new THREE.Vector3(11.6, 0, 11.6), STAGE_KEYS = Object.keys(CHARS);
const stage = new THREE.Group(); stage.position.copy(STAGE); stage.visible = false; scene.add(stage);
const FRONT = Math.PI / 4;          // 從舞台中心看向鏡頭的方向(世界座標的 +x+z)
const slots = STAGE_KEYS.map((key, i) => {
  const top = 0.14;
  const g = new THREE.Group();                                       // 位置每一幀由 stageStep 依「離選到的那個多遠」決定
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.68, top, 40), mat(0xfff8ec)); base.position.y = top / 2; base.receiveShadow = true; base.castShadow = true; g.add(base);
  const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.76, 0.06, 40), mat(0xff7a59)); ring.position.y = 0.03; g.add(ring);
  const holder = new THREE.Group(); holder.position.y = top; holder.rotation.y = Math.PI / 4; g.add(holder);
  stage.add(g);
  return { key, g, holder, ring, hop: 0, top, spin: 0 };
});
let stageSel = 0, stageOn = false, stageCur = 0;                 // stageCur:目前滑到第幾個(小數),慢慢追上 stageSel
let pickWho = 0;                                              // 現在是第幾位真人在選(0 或 1)
// 選第 i 個;如果那個角色已經被第一位真人選走,就往 dir 方向找下一個
function stageSelect(i, dir = 1) {
  const n = slots.length; i = (i % n + n) % n;
  for (let c = 0; c < n && slots[i].taken; c++) i = (i + dir + n) % n;
  stageSel = i; slots[i].hop = 1; paintStage();
}
function paintStage() {
  const c = CHARS[slots[stageSel].key];
  $('pname').textContent = c.name;
  // 沒有標題,所以兩位真人時用按鈕文字說明現在是誰在選
  $('pok').textContent = CFG.humans > 1 ? (pickWho === 0 ? L(`Player 1 takes ${c.name}`, `玩家 1 選${c.name}`) : L(`Player 2 takes ${c.name} · start`, `玩家 2 選${c.name},開始`)) : L(`Play as ${c.name}`, `用${c.name}開始`);
  // 人數設定:只有第一位在選的時候可以改
  $('pcfg').classList.toggle('hide', pickWho > 0);
  $('pcN').textContent = L('Players', '人數'); $('pcH').textContent = L('Humans', '真人玩家');
  $('pcD').textContent = L('Computer', '電腦'); document.getElementById('pcDrow').classList.toggle('hide', CFG.n - CFG.humans <= 0);
  { const names = { easy: L('Easy', '簡單'), normal: L('Normal', '一般'), hard: L('Hard', '兇狠') };
    document.querySelectorAll('#pcfg [data-d]').forEach((b) => { b.textContent = names[b.dataset.d]; b.classList.toggle('on', b.dataset.d === (CFG.ai || 'normal')); }); }
  $('pcAI').textContent = CFG.n - CFG.humans > 0 ? L(`${CFG.n - CFG.humans} computer rival${CFG.n - CFG.humans > 1 ? 's' : ''}`, `電腦對手 ${CFG.n - CFG.humans} 位`) : L('No computer rivals', '沒有電腦對手');
  document.querySelectorAll('#pcfg [data-n]').forEach((b) => b.classList.toggle('on', +b.dataset.n === CFG.n));
  document.querySelectorAll('#pcfg [data-h]').forEach((b) => b.classList.toggle('on', +b.dataset.h === CFG.humans));
  { const R = ROUND_OPTS.includes(CFG.rounds) ? CFG.rounds : MAX_ROLLS;
    // 回合數的上下選擇;到頭的那一邊按鈕變灰
    $('pcM').textContent = L('Rounds', '回合數'); $('pcRv').textContent = R;
    document.querySelector('#pcR [data-r="-1"]').disabled = R === ROUND_OPTS[0]; document.querySelector('#pcR [data-r="1"]').disabled = R === ROUND_OPTS[ROUND_OPTS.length - 1];
    $('pcRule').textContent = L(`Highest total assets after ${R} rounds wins`, `走滿 ${R} 回合,總資產最高的獲勝`); }
}
function stageStep(dt) {
  // 被玩家 1 選走的角色整個(連底座)從輪播拿掉:輪播只排剩下的角色,位置用「在剩下名單裡的第幾個」算
  const order = slots.map((_, i) => i).filter((i) => !slots[i].taken), n = order.length, R = Math.SQRT1_2;
  const wrap = (v) => ((v % n) + n + n / 2) % n - n / 2;      // 繞一圈的最短距離(-n/2 ~ n/2)
  stageCur += wrap(order.indexOf(stageSel) - stageCur) * Math.min(1, dt * 7);
  slots.forEach((sl, i) => {
    if (sl.taken) { sl.g.visible = false; return; }
    const on = i === stageSel, rel = wrap(order.indexOf(i) - stageCur), a = Math.abs(rel);
    // 位置:rel = 0 在正中間;±1 在左右兩邊、往後退一點;再遠的縮小到看不見
    const o = rel * 1.95, back = Math.min(a, 2) * 0.75, k = Math.max(0, 1 - Math.max(0, a - 1) * 1.7);
    const fwd = 1.6 - back;                                           // 整排往鏡頭這邊挪一點,才不會頂到上面的標題
    sl.g.position.set(o * R + fwd * R, 0, -o * R + fwd * R);
    sl.g.visible = k > 0.02; sl.g.scale.setScalar(Math.max(0.001, k));
    sl.hop = Math.max(0, sl.hop - dt * 2.2);
    const sT = Math.max(0.78, 1.3 - a * 0.52); sl.holder.scale.x += (sT - sl.holder.scale.x) * Math.min(1, dt * 10); sl.holder.scale.z = sl.holder.scale.y = sl.holder.scale.x;
    sl.holder.position.y = sl.top + Math.sin((1 - sl.hop) * Math.PI) * (sl.hop > 0 ? 0.35 : 0);
    // 被選到的慢慢轉一圈給你看;沒選到的轉回正面
    if (on) sl.spin += dt * 1.1;
    else { const d = Math.atan2(Math.sin(-sl.spin), Math.cos(-sl.spin)); sl.spin += d * Math.min(1, dt * 6); }
    sl.holder.rotation.y = FRONT + sl.spin;
    sl.ring.visible = on;
  });
}
const pickRay = new THREE.Raycaster(), pickNdc = new THREE.Vector2();
renderer.domElement.addEventListener('pointerup', (e) => {
  if (!stageOn) return;
  pickNdc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  pickRay.setFromCamera(pickNdc, cam);
  const hit = pickRay.intersectObjects(slots.map((sl) => sl.g), true)[0];
  if (!hit) return;
  const i = slots.findIndex((sl) => { let o = hit.object; while (o) { if (o === sl.g) return true; o = o.parent; } return false; });
  if (i >= 0 && !slots[i].taken) stageSelect(i);
});
addEventListener('keydown', (e) => {
  if (!stageOn || e.target.tagName === 'INPUT') return;      // 在名字欄打字時,空白鍵和方向鍵不要當成選角操作
  if (e.key === 'ArrowLeft') stageSelect(stageSel - 1, -1); else if (e.key === 'ArrowRight') stageSelect(stageSel + 1);
  else if (e.key === 'Enter' || e.key === ' ') $('pok').click();
});
function pickStage() {
  return new Promise((res) => {
    slots.forEach((sl) => { if (!sl.holder.children.length) { const c = CHARS[sl.key], ph = new THREE.Group(), m = mat(c.color);
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.26, 20, 16), m); b.position.y = 0.26; b.scale.y = 1.1; ph.add(b);
      const h = new THREE.Mesh(new THREE.SphereGeometry(0.22, 20, 16), m); h.position.y = 0.68; ph.add(h);
      loadPiece(c.url, c.h, ph, sl.holder); } });
    stage.visible = true; stageOn = true; document.body.classList.add('picking');
    showPieces(false);      // 選角時把棋子藏起來:再玩一次時,上一局的角色不會還站在起點
    if (!pickStage.seen) { pickStage.seen = true; camT.x = STAGE.x; camT.z = STAGE.z; view.half = view.stageHalf; applyFrustum(); }   // 第一次直接從舞台開場,不用從起點慢慢滑過來
    pickWho = 0; const picked = [], names = [];
    // 名字欄:每局都重新打(不記住上次的,因為可能換人玩)
    const nameIn = $('pnameIn'); nameIn.placeholder = L('Your name', '你的名字'); nameIn.value = '';
    slots.forEach((sl) => { sl.taken = false; });
    stageCur = stageSel; stageSelect(stageSel);
    $('pprev').onclick = () => stageSelect(stageSel - 1, -1); $('pnext').onclick = () => stageSelect(stageSel + 1);
    document.querySelectorAll('#pcfg button').forEach((b) => { b.onclick = () => {
      if (b.dataset.n) CFG.n = +b.dataset.n; else if (b.dataset.h) CFG.humans = +b.dataset.h;
      else if (b.dataset.d) CFG.ai = b.dataset.d;
      else if (b.dataset.r) { const i = Math.max(0, ROUND_OPTS.indexOf(CFG.rounds || MAX_ROLLS)); CFG.rounds = ROUND_OPTS[Math.min(ROUND_OPTS.length - 1, Math.max(0, i + +b.dataset.r))]; }
      try { localStorage.setItem('css.players', JSON.stringify(CFG)); } catch (e) {}
      paintStage();
    }; });
    $('pok').onclick = () => {
      picked.push(slots[stageSel].key);
      names.push(nameIn.value.trim().slice(0, 12)); nameIn.value = '';
      if (picked.length < CFG.humans) {            // 換第二位真人選:第一位選走的角色從轉盤上拿掉
        slots[stageSel].taken = true; pickWho = 1; stageSelect(stageSel + 1);
        stageCur = slots.map((_, i) => i).filter((i) => !slots[i].taken).indexOf(stageSel); return;
      }
      stageOn = false; stage.visible = false; document.body.classList.remove('picking');
      slots.forEach((sl) => { sl.taken = false; });
      // 電腦對手:從剩下的角色裡隨機挑
      const rest = Object.keys(CHARS).filter((k) => !picked.includes(k)).sort(() => Math.random() - 0.5);
      res({ chars: [...picked, ...rest.slice(0, CFG.n - picked.length)], humans: picked.length, rounds: CFG.rounds, ai: CFG.ai, names });
    };
  });
}
// 角色頭像:把模型單獨拍一張正面半身照(離屏渲染到 RenderTarget,讀回像素轉成圖片),給左上角頭像和對手面板用
const portraitCache = {};
async function portrait(key) {
  if (portraitCache[key]) return portraitCache[key];
  const c = CHARS[key], tpl = await loadModel(c.url, c.h), SZ = 192;
  const sc = new THREE.Scene(); sc.add(new THREE.HemisphereLight(0xffffff, 0xffe9c9, 1.3)); const dl = new THREE.DirectionalLight(0xffffff, 1.6); dl.position.set(-1, 2, 3); sc.add(dl);
  sc.add(tpl.clone(true));
  const pc = new THREE.OrthographicCamera(-0.5, 0.5, 0.5, -0.5, 0.1, 10); pc.position.set(0, c.h * 0.66, 3); pc.lookAt(0, c.h * 0.66, 0);
  const rt = new THREE.WebGLRenderTarget(SZ, SZ); rt.texture.colorSpace = THREE.SRGBColorSpace;
  const prev = renderer.getRenderTarget(), oc = renderer.getClearColor(new THREE.Color()), oa = renderer.getClearAlpha();
  renderer.setRenderTarget(rt); renderer.setClearColor(0x000000, 0); renderer.clear(); renderer.render(sc, pc);
  const px = new Uint8Array(SZ * SZ * 4); renderer.readRenderTargetPixels(rt, 0, 0, SZ, SZ, px);
  renderer.setRenderTarget(prev); renderer.setClearColor(oc, oa); rt.dispose();
  const cv = document.createElement('canvas'); cv.width = cv.height = SZ; const g = cv.getContext('2d'), img = g.createImageData(SZ, SZ);
  for (let y = 0; y < SZ; y++) img.data.set(px.subarray((SZ - 1 - y) * SZ * 4, (SZ - y) * SZ * 4), y * SZ * 4);   // WebGL 的原點在左下,要上下翻
  g.putImageData(img, 0, 0);
  return (portraitCache[key] = cv.toDataURL());
}
function setPortraits() {
  const put = (el, key) => portrait(key).then((url) => { if (el) el.style.backgroundImage = `url(${url})`; }).catch(() => {});
  put($('avaMe'), (S.players[S.turn] || S.players[S.hi]).char);
  document.querySelectorAll('#assetTabs button').forEach((b) => put(b, S.players[+b.dataset.i].char));
}
let focus;
// 四個棋子(第 3、4 個只有 3~4 人局才會出現)。同一格上四個角落各站一位
const mkPiece = () => { const piece = new THREE.Group(); scene.add(piece); const body = new THREE.Group(); body.rotation.y = Math.PI / 4; piece.add(body); piece.visible = false; return { piece, body }; };
const PIECES = [{ piece, body }, { piece: bearPiece, body: bearBody }, mkPiece(), mkPiece()];
[[-0.3, 0.2], [0.3, -0.2], [0.26, 0.26], [-0.26, -0.26]].forEach(([x, z], i) => { PIECES[i].off = new THREE.Vector3(x, 0, z); });
const PM = () => PIECES[S.hi], PA = () => PIECES[S.ci];      // 現在這位真人 / 現在這位電腦的棋子
const showPieces = (on) => PIECES.forEach((P, i) => { P.piece.visible = on && i < S.players.length; });
focus = PIECES[0];
function placePiece(i, P = PM()) { const p = tilePos(i); P.piece.position.set(p.x + P.off.x, TOP, p.z + P.off.z); }
const onLane = (v) => Object.values(LANES).some((d) => [d.cell].some(([x, z]) => { const p = cellPos(x, z); return Math.abs(p.x - v.x) < 0.95 && Math.abs(p.z - v.z) < 0.95; }));

/* ───────────── 骰子 ───────────── */
const DIE = 0.56;
function pipTex(n) {
  const cv = document.createElement('canvas'); cv.width = cv.height = 128; const c = cv.getContext('2d');
  c.fillStyle = '#fffdf8'; c.fillRect(0, 0, 128, 128);
  const P = { 1: [[64, 64]], 2: [[36, 36], [92, 92]], 3: [[34, 34], [64, 64], [94, 94]], 4: [[36, 36], [92, 36], [36, 92], [92, 92]],
    5: [[36, 36], [92, 36], [64, 64], [36, 92], [92, 92]], 6: [[36, 30], [92, 30], [36, 64], [92, 64], [36, 98], [92, 98]] }[n];
  c.fillStyle = n === 1 ? '#e2483d' : '#2b2420';
  P.forEach(([x, y]) => { c.beginPath(); c.arc(x, y, n === 1 ? 17 : 12, 0, Math.PI * 2); c.fill(); });
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
}
// BoxGeometry 的面順序是 +x,-x,+y,-y,+z,-z;對面加起來是 7
const FACE = [3, 4, 1, 6, 2, 5];
const dieMats = FACE.map((n) => new THREE.MeshToonMaterial({ map: pipTex(n), gradientMap: toonRamp }));
const DIE_REST = [new THREE.Vector3(), new THREE.Vector3()];
// 骰子落在「擲的人」旁邊的草地上:從棋子往棋盤中心退 2.6 格
function diceSpots(P) {
  const p = P.piece.position, d = new THREE.Vector3(-p.x, 0, -p.z);
  if (d.lengthSq() < 0.01) d.set(-1, 0, -1);
  d.normalize();
  const side = new THREE.Vector3(-d.z, 0, d.x), y = 0.18 + DIE / 2;
  DIE_REST[0].set(p.x + d.x * 2.6 + side.x * 0.42, y, p.z + d.z * 2.6 + side.z * 0.42);
  DIE_REST[1].set(p.x + d.x * 2.9 - side.x * 0.42, y, p.z + d.z * 2.9 - side.z * 0.42);
  // 落點剛好在小路的格子上 → 往旁邊挪,不然骰子會陷進格子裡
  for (let n = 0; n < 2 && DIE_REST.some(onLane); n++) DIE_REST.forEach((v) => { v.x += side.x * 1.7; v.z += side.z * 1.7; });
}
const dice = DIE_REST.map((p) => { const d = new THREE.Mesh(new RoundedBoxGeometry(DIE, DIE, DIE, 4, 0.08), dieMats); d.castShadow = true; d.position.copy(p); scene.add(d); return d; });
// 讓點數 n 朝上的姿態
const UPQ = {
  1: new THREE.Quaternion(),
  6: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI),
  3: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2),
  4: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -Math.PI / 2),
  2: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2),
  5: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2),
};

/* ───────────── 補間動畫(用自己的時鐘,面板隱藏時也能手動推進) ───────────── */
let T = 0; const tweens = [];
const tween = (dur, fn) => new Promise((res) => tweens.push({ t0: T, dur, fn, res }));
const wait = (dur) => tween(dur, () => {});
const ease = (k) => 1 - Math.pow(1 - k, 3);
let skipRender = false;
function step(dt) {
  T += dt;
  for (let i = tweens.length - 1; i >= 0; i--) {
    const a = tweens[i], k = Math.min(1, (T - a.t0) / a.dur);
    a.fn(k);
    if (k >= 1) { tweens.splice(i, 1); a.res(); }
  }
  // 待機:貓輕輕呼吸;小樓平滑長高
  PIECES.forEach((P, i) => {
    if (!S.busy) { P.body.scale.y = 1 + Math.sin(T * (3 - i * 0.3) + i) * 0.025; P.body.rotation.z = Math.sin(T * (1.6 - i * 0.2) + i * 2) * 0.04; }
    else P.body.rotation.z *= 0.85;
  });
  tiles.forEach((t) => {
    if (!t.bld) return;
    const coins = Math.min(6, Math.round(S.hold[t.type].n / LOT)), target = coins > 0 ? 1 : 0;
    t.bldH += (target - t.bldH) * Math.min(1, dt * 8);
    t.bld.visible = t.bldH > 0.01; t.bld.scale.setScalar(Math.max(0.001, t.bldH));
    t.bld.children.forEach((c, i) => { c.visible = i < coins; });
  });
  // 鏡頭:跟著現在在走的棋子(全覽模式則看棋盤中心),視野大小平滑過渡
  const fp = focus.piece.position;
  // 目標點往棋盤中心偏 1.6 格:棋子在畫面偏下方,前方要走的格子和骰子落點都看得到
  const fl = Math.hypot(fp.x, fp.z) || 1, ox = -fp.x / fl * 1.6, oz = -fp.z / fl * 1.6;
  const tx = stageOn ? STAGE.x : (view.overview ? 0 : fp.x + ox) + pan.x, tz = stageOn ? STAGE.z : (view.overview ? 0 : fp.z + oz) + pan.z, kf = Math.min(1, dt * 3.2);
  if (stageOn) stageStep(dt);
  // 放手後,如果拖到範圍外就彈回來
  if (!panDrag && !stageOn) { const kb = Math.min(1, dt * 7);
    if (Math.abs(tx) > PAN_LIM) pan.x += (Math.sign(tx) * PAN_LIM - tx) * kb;
    if (Math.abs(tz) > PAN_LIM) pan.z += (Math.sign(tz) * PAN_LIM - tz) * kb; }
  camT.x += (tx - camT.x) * kf; camT.z += (tz - camT.z) * kf;
  cam.position.copy(camT).add(CAM_OFF);
  sun.position.copy(camT).add(SUN_OFF); sun.target.position.copy(camT);
  const hGoal = stageOn ? view.stageHalf : view.overview ? view.far : view.near;
  if (Math.abs(hGoal - view.half) > 0.002) { view.half += (hGoal - view.half) * Math.min(1, dt * 4); applyFrustum(); }
  if (!skipRender) outline.render(scene, cam);
}
/* ───────────── 拖曳看地圖 ─────────────
   按住畫面拖曳 = 平移鏡頭(pan 是加在「跟著棋子」的目標點上的偏移)。下一次擲骰、換對手走、或按地圖鈕時歸零,鏡頭自己滑回棋子 */
const pan = new THREE.Vector3(), PAN_LIM = N / 2 * STEP + 10;   // 鏡頭中心最遠可以到棋盤外 10 格
let panDrag = false;
{
  const cv = $('gl'), R = Math.SQRT1_2, TILT = CAM_OFF.y / CAM_OFF.length();   // TILT:地面往前 1 格,在畫面上只移動這個比例(鏡頭是斜著看的)
  let drag = null;
  cv.style.touchAction = 'none'; cv.style.cursor = 'grab';
  // 聽整個視窗而不是只聽 canvas:按鈕列、頂端資訊列這些「容器」的空白處蓋在 canvas 上面,從那裡開始拖也要能拖。
  // 只有真的按在按鈕 / 面板 / 資訊框上才不算拖曳
  const UI = 'button, a, .bar, .ava, .m, .box, .bubble, .panel, .draw, .end, .pickui, .round, .steps, .dsel, .toast';
  window.addEventListener('pointerdown', (e) => { if (stageOn || drag || e.target.closest?.(UI)) return; panDrag = true; drag = { id: e.pointerId, x: e.clientX, y: e.clientY }; cv.style.cursor = 'grabbing'; });
  window.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const upp = 2 * view.half / innerHeight, dx = (e.clientX - drag.x) * upp, dy = (e.clientY - drag.y) * upp / TILT;
    drag.x = e.clientX; drag.y = e.clientY;
    // 畫面往右 = 世界的 (1,0,-1);畫面往上 = 世界的 (-1,0,-1)。拖曳時地圖跟著手指走,所以目標點往反方向移
    let mx = (-dx - dy) * R, mz = (dx - dy) * R;
    // 超出範圍不硬擋:越往外拖越「重」(橡皮筋),放手後 step() 會把鏡頭彈回範圍內
    const soft = (c, m) => { const over = Math.abs(c + m) - PAN_LIM; return over > 0 && (c + m) * m > 0 ? m / (1 + over * 0.9) : m; };
    mx = soft(camT.x, mx); mz = soft(camT.z, mz);
    pan.x += mx; pan.z += mz; camT.x += mx; camT.z += mz;                        // camT 也直接動,拖起來才不會有延遲
  });
  const end = (e) => { if (drag && e.pointerId === drag.id) { drag = null; panDrag = false; cv.style.cursor = 'grab'; } };
  window.addEventListener('pointerup', end); window.addEventListener('pointercancel', end);
}
let last = performance.now();
function loop(now) { const dt = Math.min(0.05, (now - last) / 1000); last = now; step(dt); requestAnimationFrame(loop); }
// 測試用:手動推進時間。fast = true 時只算邏輯和動畫、不繪製(跑整局自動測試用)
window.__tick = (ms = 16, fast = false) => { skipRender = fast; for (let t = 0; t < ms; t += 16) step(0.016); skipRender = false; };

// 兩顆骰子一起擲:各自有自己的起點、旋轉軸和落點,最後停在指定點數朝上
async function rollDice(vals, P = PM()) {
  diceSpots(P); sfx('dice');
  dice.forEach((d, i) => { d.visible = i < vals.length; });      // 只擲一顆時,第二顆收起來
  const plan = dice.slice(0, vals.length).map((d, i) => {
    const yaw = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.random() * Math.PI * 2);
    return { d, rest: DIE_REST[i], final: yaw.multiply(UPQ[vals[i]]),
      axis: new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.4, Math.random() - 0.5).normalize(),
      from: new THREE.Vector3(DIE_REST[i].x - 1.8 + i * 0.6, 2.8, DIE_REST[i].z - 1.8 - i * 0.4), turns: 6 + i * 2, bounce: 2.5 + i * 0.4 };
  });
  const spin = new THREE.Quaternion();
  await tween(1.0, (k) => {
    const e = ease(k);
    for (const q of plan) {
      q.d.position.lerpVectors(q.from, q.rest, e);
      q.d.position.y = q.rest.y + Math.abs(Math.cos(k * Math.PI * q.bounce)) * (1 - k) * 2.3;   // 落地彈兩下
      spin.setFromAxisAngle(q.axis, (1 - k) * (1 - k) * Math.PI * q.turns);
      q.d.quaternion.copy(q.final).multiply(spin);
    }
  });
  await wait(0.25);
}
const hopTo = (i, P = PM()) => hopOnto(tiles[i].g, P);
// 跳到某一格上(外圈或小路都用這個)。far = 被送進小路時的大跳躍
async function hopOnto(g, P = PM(), far = false) {
  const a = P.piece.position.clone(), p = g.position, b = new THREE.Vector3(p.x + P.off.x, TOP, p.z + P.off.z);
  await tween(far ? 0.8 : 0.22, (k) => {
    P.piece.position.lerpVectors(a, b, k);
    P.piece.position.y = TOP + Math.sin(k * Math.PI) * (far ? 2.4 : 0.5);
    P.body.scale.y = 1 + Math.sin(k * Math.PI) * 0.18;
  });
  // 落地把格子壓一下
  sfx(far ? 'coin' : S.players[PIECES.indexOf(P)]?.human ? 'hop' : 'hopAi');
  tween(0.18, (k) => { g.position.y = -Math.sin(k * Math.PI) * 0.06; });
  P.body.scale.y = 1;
}

/* ───────────── 介面 ───────────── */
// 貓咪顧問:只講棋盤上看得到的事實和任務提示,**不預測漲跌**
function advise() {
  const todo = new Set(S.missions.filter((m) => !m.done).map((m) => m.id));
  const held = KEYS.filter((k) => S.hold[k].n > 0);
  const cheap = KEYS.filter((k) => S.price[k] < SECTORS[k].open * 0.97);
  const up = held.find((k) => (S.price[k] * S.hold[k].n - S.hold[k].cost) / S.hold[k].cost >= 0.15);
  if (S.lane?.type === 'jail') return L(`Resting at the police station (${S.lane.wait} rounds left, or pay $${fmt(BAIL)} bail). You cannot trade, but a margin position can still be liquidated.`, `在警察局休息(再 ${S.lane.wait} 回合,或付 $${fmt(BAIL)} 保釋金)。不能買賣,但融資部位一樣可能被斷頭。`);
  if (S.lane?.type === 'ipo') return L('At the IPO booth. Roll one die to get back on the road.', '在 IPO 攤位。擲一顆骰子走回外圈。');
  let d = 0; for (let i = 1; i <= 6; i++) if (TILES[(S.pos + i) % TILES.length] === 'chance') { d = i; break; }
  if (todo.has('profit') && up) return L(`${SECTORS[up].name} is up over 15%. Land on it to take profit.`, `${SECTORS[up].name}已經賺超過 15%,走到它的格子就能獲利了結。`);
  if (todo.has('dip') && cheap.length) return L(`${SECTORS[cheap[0]].name} is below its opening price. Buying it counts as buying the dip.`, `${SECTORS[cheap[0]].name}現在低於開盤價,買進就算逢低買進。`);
  if (todo.has('spread') && held.length < 3) return L(`You hold ${held.length} sector${held.length === 1 ? '' : 's'}. Three different ones spread your risk.`, `你現在持有 ${held.length} 種類股,湊滿 3 種可以分散風險。`);
  if (todo.has('paid')) return L('Telecom and REIT pay the most each lap. Hold them when you pass GO.', '電信和不動產配息最多,持有它們再繞回起點就能領股利。');
  if (todo.has('cash') && S.cash < 2000) return L('Cash is low. Keep $2,000 so you can buy when a chance shows up.', '現金偏低。留 $2,000 以上,好機會出現時才買得起。');
  { let best = null;                                           // 對手裡融資維持率最低的那一檔
    for (const p of others()) for (const k of KEYS) if (p.hold[k].loan > 0) { const r = ratioOf(p.hold[k], k); if (!best || r < best.r) best = { p, k, r }; }
    if (best) { const drop = Math.max(1, Math.ceil((1 - MAINT / best.r) * 100));
      return L(`${nameOf(best.p)} bought ${SECTORS[best.k].name} on margin (ratio ${Math.round(best.r * 100)}%). A ${drop}% drop forces it to sell.`, `${nameOf(best.p)}用融資買了${SECTORS[best.k].name},維持率 ${Math.round(best.r * 100)}%。再跌 ${drop}% 就會被強迫平倉。`); } }
  { const my = KEYS.filter((k) => S.hold[k].loan > 0 && ratioOf(S.hold[k], k) < 1.5)[0];
    if (my) return L(`Careful: your ${SECTORS[my].name} margin ratio is ${Math.round(ratioOf(S.hold[my], my) * 100)}%. Below 130% it is sold for you.`, `小心:你的${SECTORS[my].name}融資維持率只剩 ${Math.round(ratioOf(S.hold[my], my) * 100)}%,跌破 130% 會被強迫平倉。`); }
  { const sq = KEYS.filter((k) => S.short[k].n > 0 && squeezeGap(S.short[k], k) < 12)[0];
    if (sq) return L(`Careful: your ${SECTORS[sq].name} short is squeezed if it rises ${Math.max(1, Math.ceil(squeezeGap(S.short[sq], sq)))}% more.`, `小心:你放空的${SECTORS[sq].name}再漲 ${Math.max(1, Math.ceil(squeezeGap(S.short[sq], sq)))}% 就會被軋空。`); }
  { let best = null;                                           // 對手裡最接近被軋空的那一檔
    for (const p of others()) for (const k of KEYS) if (p.short[k].n > 0) { const g = squeezeGap(p.short[k], k); if (!best || g < best.g) best = { p, k, g }; }
    if (best) return L(`${nameOf(best.p)} is short ${SECTORS[best.k].name}. Push it up ${Math.max(1, Math.ceil(best.g))}% (buy it, or play a good-news card) and it is squeezed.`, `${nameOf(best.p)}放空了${SECTORS[best.k].name}。把它推高 ${Math.max(1, Math.ceil(best.g))}%(買進,或用利多事件卡)就能軋掉。`); }
  if (S.bag.includes('atk')) { let best = null;
    for (const p of others()) for (const k of KEYS) if (p.hold[k].n > 0) { const v = p.hold[k].n * S.price[k]; if (!best || v > best.v) best = { p, k, v }; }
    if (best) return L(`${nameOf(best.p)} holds a lot of ${SECTORS[best.k].name}. A bad news card would hit it.`, `${nameOf(best.p)}持有不少${SECTORS[best.k].name},用利空消息卡可以打擊。`); }
  const card = S.bag.find((id) => id.startsWith('ev'));
  if (card) { const it = itemInfo(card), sec = SECTORS[it.best];
    return S.hold[it.best].n > 0
      ? L(`You hold ${sec.name} and a card that lifts it. Open your backpack to play it.`, `你持有${sec.name},背包裡有一張會讓它上漲的事件卡,可以打開背包使用。`)
      : L(`Your event card lifts ${sec.name}. Buy that sector first, then play the card.`, `你的事件卡會讓${sec.name}上漲。先買進那個類股,再使用卡片。`); }
  if (d) return L(`A market event is ${d} step${d > 1 ? 's' : ''} ahead. Every price may move.`, `前方第 ${d} 格是市場事件,所有價格都可能變動。`);
  return L('No one knows the next roll. Spread out and keep some cash.', '沒有人知道下一步會擲出幾點,分散持股、留點現金最穩。');
}
// 融資部位的小標:維持率,低於 150% 用紅字警告
const marginTag = (h, k) => (h.loan > 0 ? ` <b style="color:${ratioOf(h, k) < 1.5 ? '#c4472f' : '#8a5cf5'}">${L('M', '融')}${Math.round(ratioOf(h, k) * 100)}%</b>` : '');
const squeezeTag = (h, k) => { const g = Math.max(0, squeezeGap(h, k)); return ` <b style="color:${g < 10 ? '#c4472f' : '#8a5cf5'}">${L('sq', '軋')}+${Math.ceil(g)}%</b>`; };
const debtRow = (d) => (d > 0 ? `<div class="row"><i style="background:#4a63b0"></i><span>${L('Bank loan', '銀行貸款')}</span><span></span><span style="color:#c4472f">-${fmt(d)}</span></div>` : '');
// 資產框上面那排頭像:每局開始時依人數建一次。點誰就看誰的資產
function buildFoes() {
  const el = $('assetTabs'); el.innerHTML = '';
  S.players.forEach((p) => {
    const b = document.createElement('button'); b.dataset.i = p.i; b.setAttribute('aria-label', nameOf(p));
    b.onclick = () => { S.view = p.i; hud(); };
    el.appendChild(b);
  });
}
function hud() {
  // 上方資訊列跟著「現在輪到誰」:電腦在走的時候顯示牠的現金、總資產、股票市值和背包(左上頭像也會換成牠)
  { const T = S.players[S.turn] || S.players[S.hi];
    $('cash').textContent = fmt(T.cash);
    $('assets').textContent = fmt(assetsOf(T));
    $('stocks').textContent = fmt(KEYS.reduce((a, k) => a + T.hold[k].n * S.price[k], 0));
    $('bagCount').textContent = T.bag.length;
    $('mcount').textContent = T.done; }
  // 目前名次:依總資產排(同分算同名次)。回合條旁邊顯示;手機沒有回合條,所以擲骰鈕底下也帶一份
  const myA = assets(), rank = 1 + S.players.filter((p) => assetsOf(p) > myA + 0.5).length;
  $('rankTxt').textContent = L(`#${rank} of ${S.players.length}`, `目前第 ${rank} 名`); $('rankTxt').classList.toggle('top', rank === 1);

  document.querySelectorAll('#dsel button').forEach((b) => b.classList.toggle('on', +b.dataset.n === S.diceN));
  $('rollTxt').textContent = S.lane ? (S.lane.type === 'jail' && S.lane.wait > 0 ? L('REST', '休息中') : L('ROLL OUT', '擲骰出去')) : L('ROLL', '擲骰子');
  $('dsel').style.visibility = S.lane ? 'hidden' : '';
  $('miss').innerHTML = S.missions.map((m) =>
    `<div class="m ${m.done ? 'done' : ''}"><span class="ck">${m.done ? '✓' : ''}</span><span>${m.title}<small>${m.sub}</small></span></div>`).join('');
  $('tip').textContent = advise();
  // 資產框:一次只顯示一位。預設跟著「現在輪到誰」;點上面的頭像可以改看別人(下一位開始走的時候會自動切回去)
  { const A = S.players[S.view ?? S.turn] || S.players[S.hi], mine = A.i === S.hi;
    $('assetTitle').textContent = (isYou(A) ? L('My assets', '我的資產') : L(`${nameOf(A)}'s assets`, `${nameOf(A)}的資產`)) + ' · $' + fmt(assetsOf(A));
    document.querySelectorAll('#assetTabs button').forEach((b) => { b.classList.toggle('on', +b.dataset.i === A.i); b.classList.toggle('turn', +b.dataset.i === S.turn); });
    const held = KEYS.filter((k) => A.hold[k].n > 0).sort((x, y) => A.hold[y].n * S.price[y] - A.hold[x].n * S.price[x]);
    $('assetRows').innerHTML =
      `<div class="row"><i style="background:#57b86b"></i><span>${L('Cash', '現金')}</span><span></span><span>${fmt(A.cash)}</span></div>` + debtRow(A.debt) +
      (held.length ? held.map((k) => `<div class="row"><i style="background:${SECTORS[k].css}"></i><span>${SECTORS[k].code}</span><span class="q">${A.hold[k].n} ${L('sh', '股')}${marginTag(A.hold[k], k)}</span><span>${fmt(A.hold[k].n * S.price[k])}</span></div>`).join('')
        : `<div class="row" style="display:block;color:#9a8676;font-weight:600">${L('No holdings yet', '還沒有持股')}</div>`) +
      KEYS.filter((k) => A.short[k].n > 0).map((k) => { const pl = (A.short[k].entry - S.price[k]) * A.short[k].n;
        return `<div class="row"><i style="background:${SECTORS[k].css}"></i><span>${SECTORS[k].code}</span><span class="q">${L('short', '空')} ${A.short[k].n}${squeezeTag(A.short[k], k)}</span><span style="color:${pl >= 0 ? '#1c8a4a' : '#c4472f'}">${pl >= 0 ? '+' : '-'}${fmt(Math.abs(pl))}</span></div>`; }).join('') +
      (A.bag.length && !mine ? `<div class="row" style="display:block;color:#c4472f">${L('Cards in hand: ', '手上的卡:')}${A.bag.map((id) => itemInfo(id).icon).join(' ')}</div>` : ''); }
  const e = S.lastEvent;
  $('evtBody').innerHTML = e
    ? `<div>${e.t}</div><div class="why">${e.w}</div>` + (e.cash ? `<div class="mvrow"><span>${L('Everyone', '每位玩家')}</span><span style="color:#1c8a4a">+$${fmt(e.cash)}</span></div>` : '') + KEYS.filter((k) => Math.round((e.m[k] - 1) * 100)).sort((x, y) => Math.abs(e.m[y] - 1) - Math.abs(e.m[x] - 1)).slice(0, 7).map((k) => { const d = Math.round((e.m[k] - 1) * 100);   // 只列變動最大的 7 檔,不然面板會蓋到任務
        return `<div class="mvrow"><span>${SECTORS[k].code}</span><span style="color:${d > 0 ? '#1c8a4a' : '#c4472f'}">${d > 0 ? '+' : ''}${d}% ${d > 0 ? '▲' : '▼'}</span></div>`; }).join('')
    : `<div class="why">${L('No event yet. Land on a ? tile to draw one.', '還沒有事件。走到「?」格會抽一張。')}</div>`;
  $('roundTxt').textContent = L(`Round ${S.rolls} / ${maxRolls()}`, `回合 ${S.rolls} / ${maxRolls()}`);
  $('roundBar').style.width = (S.rolls / maxRolls() * 100) + '%';
}
function staticText() {
  document.documentElement.lang = ZH ? 'zh-Hant' : 'en';
  document.title = L('Cat Street Stocks', '貓咪股市大富翁');
  $('lblAssets').textContent = L('Total assets', '總資產'); $('lblStocks').textContent = L('Stocks', '股票市值'); 
  $('bagBtn').textContent = L('Backpack', '背包'); { // 擲幾顆骰子的切換:直接畫骰子圖(一顆 = 一個骰子,兩顆 = 兩個骰子),比文字直覺
    // 骰子圖示:實心的骰子(選中時白底橘點、未選時淺底),點數用 5 和 2 / 3,看起來才像骰子而不是一個方框
    const die = (x, pips, tilt) => `<g transform="rotate(${tilt} ${x + 11} 11)"><rect x="${x + 1.5}" y="1.5" width="19" height="19" rx="5.5" fill="currentColor" opacity=".95"/>` +
      pips.map(([px, py]) => `<circle cx="${x + px}" cy="${py}" r="2.2" class="pip"/>`).join('') + '</g>';
    $('d1').innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${die(1, [[6.5, 6.5], [15.5, 6.5], [11, 11], [6.5, 15.5], [15.5, 15.5]], -8)}</svg>`;
    $('d2').innerHTML = `<svg viewBox="0 0 50 24" aria-hidden="true">${die(1, [[7, 7], [15, 15]], -10)}${die(27, [[7, 7], [11, 11], [15, 15]], 8)}</svg>`;
    $('d1').setAttribute('aria-label', L('Roll 1 die', '擲 1 顆骰子')); $('d2').setAttribute('aria-label', L('Roll 2 dice', '擲 2 顆骰子')); } $('mapBtn').textContent = L('Map', '地圖'); $('rollTxt').textContent = L('ROLL', '擲骰子');
  $('assetTitle').textContent = L('My assets', '我的資產'); $('evtTitle').textContent = L('Market event', '市場事件');
  // 頁尾加上版本號(取 board.mjs?v=N 的 N),方便確認拿到的是不是最新版
  const ver = (new URL(import.meta.url).searchParams.get('v') || '?');
  $('note').textContent = L('Fictional companies · for learning, not investment advice · Music: Sharou', '公司皆為虛構 · 學習用途,非投資建議 · 音樂:しゃろう') + ` · v${ver}`;
}
let toastTimer;
function toast(msg) { const t = $('toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('on'), 1900); }
function showCtl(on) { $('ctl').classList.toggle('hide', !on); $('stepCtl').classList.add('hide'); }
function panel(html) { const p = $('panel'); p.innerHTML = html; p.classList.remove('hide'); p.classList.toggle('over', !!(S && S.over)); return p; }
const closePanel = () => $('panel').classList.add('hide');

// 買賣面板:一條拉桿選股數(10 ~ 50 股,每 10 股一格),底下四顆按鈕:買進、融資買、放空、賣出(有空單時「放空」變成「回補」)。
// 按鈕上的金額和價格影響會跟著拉桿即時變
function buyPanel(k) {
  return new Promise((res) => {
    const sec = SECTORS[k], h = S.hold[k], sh = S.short[k], price = S.price[k];
    const gain = h.n ? (price * h.n - h.cost) / h.cost * 100 : 0;
    const spl = sh.n ? (sh.entry - price) / sh.entry * 100 : 0;
    const vs = (price / sec.open - 1) * 100, ratio = ratioOf(h, k);
    const rivalTxt = others().map((p) => { const rh = p.hold[k], rs = p.short[k], nm = nameOf(p);
      return (rh.n ? ` <b style="color:#c4472f">${L(`${nm} holds ${rh.n}`, `${nm}持有 ${rh.n} 股`)}${rh.loan > 0 ? L(` on margin (ratio ${Math.round(ratioOf(rh, k) * 100)}%)`, `(融資,維持率 ${Math.round(ratioOf(rh, k) * 100)}%)`) : ''}${L('.', '。')}</b>` : '') +
        (rs.n ? ` <b style="color:#8a5cf5">${L(`${nm} is short ${rs.n}: a ${Math.max(1, Math.ceil(squeezeGap(rs, k)))}% rise squeezes it out.`, `${nm}放空 ${rs.n} 股,再漲 ${Math.max(1, Math.ceil(squeezeGap(rs, k)))}% 會被軋空。`)}</b>` : ''); }).join('');
    const p = panel(`
      <h3><span class="tag" style="background:${sec.css}">${sec.code}</span>${sec.name}</h3>
      <p>${sec.blurb}${rivalTxt}</p>
      <div class="kv">
        <div>${L('Price', '股價')}<b>$${Math.round(price)}</b></div>
        <div>${L('Since open', '相對開盤')}<b style="color:${vs >= 0 ? '#1c8a4a' : '#c4472f'}">${vs >= 0 ? '+' : ''}${vs.toFixed(0)}%</b></div>
        <div>${sh.n ? L('Short', '放空') : h.loan > 0 ? L('Margin', '融資持有') : L('You hold', '持有')}<b>${sh.n || h.n}${(sh.n || h.n) ? ` <span style="font-size:calc(11px * var(--fs));color:${(sh.n ? spl : gain) >= 0 ? '#1c8a4a' : '#c4472f'}">${(sh.n ? spl : gain) >= 0 ? '+' : ''}${(sh.n ? spl : gain).toFixed(0)}%</span>` : ''}${h.loan > 0 ? `<span style="display:block;font-size:calc(11px * var(--fs));color:${ratio < 1.5 ? '#c4472f' : '#8a786c'}">${L('ratio', '維持率')} ${Math.round(ratio * 100)}%</span>` : ''}</b></div>
      </div>
      <div class="slider"><span>${L('Shares', '股數')}</span><input type="range" id="qty" min="10" max="50" step="10" value="10"><b id="qtyVal"></b></div>
      <div class="btns">
        <button class="b-buy" data-a="buy" ${sh.n ? 'disabled' : ''}>${L('Buy', '買進')}<br><span id="tBuy"></span></button>
        <button class="b-margin" data-a="margin" ${sh.n ? 'disabled' : ''}>${L('Margin', '融資買')}<br><span id="tMargin"></span></button>
        ${sh.n
          ? `<button class="b-ok" data-a="cover">${L('Cover', '回補')}<br><span>${spl >= 0 ? '+' : '-'}$${fmt(Math.abs((sh.entry - price) * sh.n))}</span></button>`
          : `<button class="b-short" data-a="short" ${h.n ? 'disabled' : ''}>${L('Short', '放空')}<br><span id="tShort"></span></button>`}
        <button class="b-sell" data-a="sell" ${h.n ? '' : 'disabled'}>${L('Sell', '賣出')}<br><span id="tSell"></span></button>
      </div>
      <div class="btns" style="margin-top:8px"><button class="b-skip" data-a="skip">${L('Skip', '跳過')}</button></div>
      <p style="font-size:calc(11.5px * var(--fs))">${L('Buying pushes the price up, so whoever buys next pays more; selling and shorting push it down.', '買進會推高股價,下一個買的人要付更貴;賣出和放空會壓低股價。')}<br>
      ${L('Margin: pay 40% and borrow 60%. If the ratio (stock value / loan) falls below 130%, everything is sold for you. Interest is 2% of the loan each lap.', '融資:自備 4 成、借 6 成。維持率(市值÷借款)跌破 130% 會被強迫平倉;每圈付借款 2% 的利息。')}<br>
      ${L('Short: sell borrowed shares, buy back later. You win if the price falls. If it rises 30% above your entry you are squeezed: forced to buy back at the high price.', '放空:先借股票賣掉、之後買回來還,跌了你賺、漲了你賠。比進場價漲超過 30% 會被軋空:強迫用高價買回。')}</p>`);
    const qty = $('qty'), n = () => +qty.value;
    // 拉桿一動,四顆按鈕的金額、價格影響、能不能按都跟著更新
    const paint = () => {
      const q = n(), cost = price * q, sellN = Math.min(q, h.n);
      $('qtyVal').textContent = L(`${q} shares · $${fmt(cost)}`, `${q} 股 · $${fmt(cost)}`);
      $('tBuy').textContent = `$${fmt(cost)} ${pct(buyF(q))}`; p.querySelector('[data-a=buy]').disabled = !!sh.n || S.cash < cost;
      $('tMargin').textContent = `${L('pay', '自備')} $${fmt(cost * (1 - MARGIN_LOAN))}`; p.querySelector('[data-a=margin]').disabled = !!sh.n || S.cash < cost * (1 - MARGIN_LOAN);
      if ($('tShort')) { $('tShort').textContent = `$${fmt(cost)} ${pct(shortF(q))}`; p.querySelector('[data-a=short]').disabled = !!h.n || S.cash < cost; }
      $('tSell').textContent = h.n ? `${sellN} ${L('sh', '股')} ${pct(sellF(sellN))}` : '—';
    };
    qty.oninput = paint; paint();
    p.querySelectorAll('button').forEach((b) => b.onclick = () => {
      const a = b.dataset.a, q = n();
      if (a === 'buy' || a === 'margin') {
        const cost = price * q, loan = a === 'margin' ? cost * MARGIN_LOAN : 0;
        S.cash -= cost - loan; h.n += q; h.cost += cost; h.loan += loan;
        if (price < sec.open * 0.97) S.flags.dip = true;
        impact(k, buyF(q)); sfx('buy');
        toast(a === 'margin' ? L(`Margin-bought ${q} ${sec.name}, borrowed $${fmt(loan)}`, `融資買進 ${sec.name} ${q} 股,借了 $${fmt(loan)}`)
          : L(`Bought ${q} ${sec.name}. Price ${pct(buyF(q))}`, `買進 ${sec.name} ${q} 股,股價被推高 ${pct(buyF(q))}`));
      } else if (a === 'sell') {
        // 賣拉桿上的股數(不夠就全賣);借款按賣掉的比例一起還
        const sn = Math.min(q, h.n), part = sn / h.n, value = price * sn, cost = h.cost * part, loan = h.loan * part;
        if ((value - cost) / cost >= 0.15) S.flags.profit = true;
        toast(L('Sold for', '賣出得') + ` $${fmt(value)} (${value >= cost ? '+' : '-'}$${fmt(Math.abs(value - cost))})` + (loan ? L(`, repaid $${fmt(loan)}`, `,還款 $${fmt(loan)}`) : ''));
        S.cash += value - loan; h.n -= sn; h.cost -= cost; h.loan -= loan;
        if (h.n <= 0) { h.n = 0; h.cost = 0; h.loan = 0; }
        impact(k, sellF(sn)); sfx('sell');      // 先把部位清掉再動價格,不然自己的賣壓會觸發自己的斷頭檢查
      } else if (a === 'short') {
        S.cash -= price * q; sh.entry = price; sh.n = q; impact(k, shortF(q)); sfx('short');
        toast(L(`Shorted ${q} ${sec.name}. Price ${pct(shortF(q))}`, `放空 ${sec.name} ${q} 股,股價被壓低 ${pct(shortF(q))}`));
      } else if (a === 'cover') {
        const cn = sh.n, back = shortValue(k), pl = (sh.entry - price) * cn;
        if (pl / (sh.entry * cn) >= 0.15) S.flags.profit = true;
        S.cash += back; sh.n = 0; sh.entry = 0; impact(k, buyF(cn)); sfx('sell');
        toast(L('Covered:', '回補:') + ` ${pl >= 0 ? '+' : '-'}$${fmt(Math.abs(pl))}`);
      }
      drawAll(); hud(); closePanel(); res();
    });
  });
}
function cardPanel(title, text, moves = '', auto = 0) {
  return new Promise((res) => {
    const p = panel(`<h3>${title}</h3><p>${text}</p>${moves ? `<div class="moves">${moves}</div>` : ''}<div class="btns"><button class="b-ok">${L('Continue', '繼續')}</button></div>`);
    let done = false;
    const go = () => { if (done) return; done = true; closePanel(); res(); };
    p.querySelector('button').onclick = go;
    if (auto > 0) wait(auto).then(go);
  });
}
const AI_CARD_WAIT = 3;       // 電腦出牌後,說明卡停留幾秒

/* ───────────── 回合流程(狀態機:idle → rolling → moving → landing → idle / over) ───────────── */
// 起點:薪水 + 股利;對面的「股息結算」格:只發股利
function payday(atStart = true) {
  const salary = atStart ? SALARY * (S.salary2 ? 2 : 1) : 0; if (atStart) S.salary2 = false;   // 升職加薪(命運牌)時下一次薪水加倍
  const div = KEYS.reduce((a, k) => a + S.hold[k].n * S.price[k] * SECTORS[k].div, 0);
  const interest = atStart ? KEYS.reduce((a, k) => a + S.hold[k].loan * MARGIN_FEE, 0) : 0;   // 融資利息:每經過起點付一次
  const bank = atStart ? S.debt * BANK_RATE : 0;                                                // 銀行貸款利息:也是每經過起點付一次
  S.lastDividend = div; S.cash += salary + div - interest - bank; sfx('coin');
  toast((salary ? L('Payday', '發薪日') + ` +$${fmt(salary)} · ` : '') + `${L('dividends', '股利')} +$${fmt(div)}` + (interest ? ` · ${L('margin interest', '融資利息')} -$${fmt(interest)}` : '') + (bank ? ` · ${L('loan interest', '貸款利息')} -$${fmt(bank)}` : ''));
  hud(); checkMissions();
}
function checkMissions() {
  // 上一次完成的任務先換成新的(所以完成的那張會亮綠色停留到下一次檢查)
  S.missions.forEach((m, i) => { if (m.done) { S.missions[i] = { id: '_' }; S.missions[i] = drawMission(); } });
  S.missions.forEach((m) => { if (!m.done && m.ok()) { m.done = true; S.done++; S.cash += REWARD; sfx('mission'); toast(L('Mission complete: ', '任務完成:') + m.title + ` +$${REWARD}`); } });
  hud();
}
// 市場事件格:桌上發三張背面朝上的牌,玩家自己挑一張翻開(對手走到時由牠自動挑)。
// 翻開的那張生效;另外兩張隨後也翻開,讓你看到「本來可能抽到什麼」。計時用遊戲自己的時鐘(wait),測試時可以快轉
// auto = 電腦抽(自動挑、自動繼續);round = 一輪結束系統抽(同樣自動,但不會出特殊牌,因為沒有「誰」被送進小路)
function drawEventCards(auto, round = false) {
  return new Promise((res) => {
    const picks = EVENTS.slice().sort(() => Math.random() - 0.5).slice(0, 3).map(instantiate), who = CHARS[S.foe].name;
    if (!round && Math.random() < SPECIAL_RATE) picks[Math.floor(Math.random() * 3)] = SPECIAL[Math.random() < 0.5 ? 'jail' : 'ipo'];
    const face = (e) => {
      const top = KEYS.filter((k) => Math.round((e.m[k] - 1) * 100)).sort((x, y) => Math.abs(e.m[y] - 1) - Math.abs(e.m[x] - 1)).slice(0, 6);
      if (e.special) return `<div class="dhead ${e.special === 'ipo' ? 'good' : 'bad'}">${e.t}</div><div class="dwhy">${e.w}</div><div class="dmv">` +
        (e.special === 'ipo' ? `<span class="mv up">${L('IPO lane', '進入 IPO 小路')}</span>` : `<span class="mv dn">${L('Detention lane', '送進拘留小路')}</span>`) + '</div>';
      return `<div class="dhead ${e.m.etf >= 1 ? 'good' : 'bad'}">${e.t}</div><div class="dwhy">${e.w}</div><div class="dmv">` + cashChip(e) +
        top.map((k) => { const d = Math.round((e.m[k] - 1) * 100); return `<span class="mv ${d > 0 ? 'up' : 'dn'}">${SECTORS[k].code} ${d > 0 ? '+' : ''}${d}%</span>`; }).join('') + '</div>';
    };
    const ov = $('draw');
    ov.innerHTML = `<h2>${round ? L(`Round ${S.rolls} is over: market event`, `第 ${S.rolls} 回合結束,市場事件`) : auto ? L(`${who} draws a market event`, `${who}抽市場事件`) : L('Pick a card', '抽一張市場事件')}</h2>` +
      `<div class="dcards">${picks.map((e, i) => `<div class="dcard" data-i="${i}" style="--i:${i}"><div class="dinner"><div class="dback"><span>?</span></div><div class="dfront">${face(e)}</div></div></div>`).join('')}</div>` +
      `<button class="dgo hide" id="dgo">${L('Continue', '繼續')}</button>`;
    ov.classList.remove('hide'); ov.classList.toggle('auto', !!auto);
    const cards = [...ov.querySelectorAll('.dcard')]; let chosen = -1;
    const choose = (i) => {
      if (chosen >= 0) return;
      chosen = i; ov.classList.add('done'); cards[i].classList.add('flip', 'picked'); sfx('flip');
      const e = picks[i];
      wait(0.45).then(() => sfx(e.special ? (e.special === 'ipo' ? 'good' : 'bad') : e.m.etf >= 1 ? 'good' : 'bad'));
      if (!e.special) applyEvent(e);
      drawAll(); hud();
      wait(0.9).then(() => {
        cards.forEach((c, j) => { if (j !== i) c.classList.add('flip', 'lost'); }); $('dgo').classList.remove('hide');
        // 對手抽的牌:給你 2 秒看完事件,然後自動按「繼續」(想快一點也可以自己先按)
        if (auto) wait(2).then(() => { if (!done) $('dgo').click(); });
      });
    };
    cards.forEach((c, i) => { c.onclick = () => { if (!auto) choose(i); }; });
    if (auto) wait(1.2).then(() => choose(Math.floor(Math.random() * 3)));
    let done = false;
    $('dgo').onclick = () => { if (done) return; done = true; ov.classList.add('hide'); ov.classList.remove('done'); res(picks[chosen]); };
  });
}
async function playEvent(e, auto = 0) {
  applyEvent(e); drawAll(); hud(); sfx(e.m.etf >= 1 ? 'good' : 'bad');
  const moves = cashChip(e) + KEYS.map((k) => { const d = Math.round((e.m[k] - 1) * 100); return d ? `<span class="mv ${d > 0 ? 'up' : 'dn'}">${SECTORS[k].name} ${d > 0 ? '+' : ''}${d}%</span>` : ''; }).join('');
  await cardPanel(e.t, e.w, moves, auto);
}
// 商店:每樣只有一個,你和對手共用同一批貨(兩個商店格也是同一家),誰先買走就沒了。
// 每 SHOP_EVERY 回合才進一次新貨 —— 以前是每回合進貨,而每回合都是你先走,等於對手買什麼都影響不到你
const SHOP_EVERY = 4;
const shopLeft = () => SHOP_EVERY - (S.rolls % SHOP_EVERY);       // 再幾回合進新貨
function shopStock() {
  const batch = Math.floor(S.rolls / SHOP_EVERY);
  if (S.shop.round !== batch) {
    const cards = SALE_EVENTS.slice().sort(() => Math.random() - 0.5).slice(0, 2).map((i) => 'ev' + i);
    S.shop = { round: batch, stock: ['remote', ...cards, 'atk'], sold: [] };
  }
  return S.shop.stock;
}
function shopPanel() {
  const stock = shopStock();
  return new Promise((res) => {
    const draw = () => {
      const left = shopLeft(), who = CHARS[S.foe].name;
      const p = panel(`<h3>${L('Item shop', '道具商店')}</h3><p>${L(`One of each, shared with your rival: whoever buys first gets it. New stock in ${left} round${left > 1 ? 's' : ''}.`, `每樣只有一個,和對手共用同一批貨,誰先買走就沒了。再 ${left} 回合進新貨。`)}</p>` +
        (stock.length ? stock.map((id, i) => { const it = itemInfo(id);
          return `<div class="it"><span class="ic">${it.icon}</span><span class="tx"><b>${it.name}</b><small>${it.desc}</small></span><button class="b-buy" data-i="${i}" ${S.cash < it.price ? 'disabled' : ''}>$${it.price}</button></div>`; }).join('')
          : `<div class="it"><span class="tx"><small>${L('Sold out.', '全部賣完了。')}</small></span></div>`) +
        S.shop.sold.map((x) => { const it = itemInfo(x.id);
          return `<div class="it" style="opacity:.5"><span class="ic">${it.icon}</span><span class="tx"><b>${it.name}</b><small>${x.by === S.hi ? L('You bought it', '你買走了') : L(`${nameOf(S.players[x.by])} bought it`, `${nameOf(S.players[x.by])}買走了`)}</small></span><button class="b-skip" disabled>${L('Sold', '售完')}</button></div>`; }).join('') +
        `<div class="btns"><button class="b-skip" data-i="-1">${L('Leave', '離開')}</button></div>`);
      p.querySelectorAll('button').forEach((b) => b.onclick = () => {
        const i = +b.dataset.i;
        if (i < 0) { closePanel(); return res(); }
        const id = stock[i], it = itemInfo(id); S.cash -= it.price; S.bag.push(id); stock.splice(i, 1); S.shop.sold.push({ id, by: S.hi }); sfx('item'); toast(L('Bought ', '買了 ') + it.name); hud(); draw();
      });
    };
    draw();
  });
}
// 利空消息卡:挑一種資產讓它下跌。列表先列對手持有的(打擊對手),再列你自己放空的(幫自己賺)
function attackPanel() {
  return new Promise((res) => {
    const heldBy = (k) => others().reduce((a, p) => a + p.hold[k].n, 0);       // 所有對手合計持有幾股
    const foe = KEYS.filter((k) => heldBy(k) > 0).sort((a, b) => heldBy(b) * S.price[b] - heldBy(a) * S.price[a]);
    const mine = KEYS.filter((k) => S.short[k].n > 0 && !foe.includes(k));
    const rest = KEYS.filter((k) => !foe.includes(k) && !mine.includes(k));
    const chip = (k, note) => `<button data-k="${k}" style="border-color:${SECTORS[k].css}"><i style="background:${SECTORS[k].css}"></i>${SECTORS[k].code}${note ? `<small>${note}</small>` : ''}</button>`;
    const p = panel(`<h3>📉 ${L('Bad news card', '利空消息卡')}</h3><p>${L('Pick the asset to hit. It drops 18%.', '選一種資產,價格下跌 18%。')}</p>` +
      (foe.length ? `<p><b>${L('Your rival holds', '對手持有')}</b></p><div class="chips">${foe.map((k) => chip(k, `${heldBy(k)}${L(' sh', ' 股')}`)).join('')}</div>` : `<p>${L('Your rival holds nothing yet.', '對手還沒有持股。')}</p>`) +
      (mine.length ? `<p><b>${L('You are short', '你放空的')}</b></p><div class="chips">${mine.map((k) => chip(k, `${L('short', '空')} ${S.short[k].n}`)).join('')}</div>` : '') +
      `<p><b>${L('Other assets', '其他資產')}</b></p><div class="chips">${rest.map((k) => chip(k)).join('')}</div>` +
      `<div class="btns"><button class="b-skip" data-k="">${L('Cancel', '取消')}</button></div>`);
    p.querySelectorAll('button').forEach((b) => b.onclick = () => { closePanel(); res(b.dataset.k || null); });
  });
}
// 利空消息生效:價格下跌,並說明誰受傷
async function badNews(k, by) {
  const sec = SECTORS[k], byYou = isYou(by), who = nameOf(by);
  // 受傷的人:出牌的人以外、持有這檔的每一位
  const hurt = others(by.i).filter((p) => p.hold[k].n > 0).map((p) => { const loss = p.hold[k].n * S.price[k] * (1 - ATK_DROP);
    return isYou(p) ? L(`You lose about $${fmt(loss)}.`, `你損失約 $${fmt(loss)}。`) : L(`${nameOf(p)} loses about $${fmt(loss)}.`, `${nameOf(p)}損失約 $${fmt(loss)}。`); }).join(' ');
  S.price[k] *= ATK_DROP; marginCheck(); sfx('bad');
  S.lastEvent = { t: L(`Bad news about ${sec.name}`, `${sec.name}傳出利空`), w: L('Rumors and bad headlines can sink a price fast.', '壞消息和傳言可以讓股價快速下跌。'), m: Object.fromEntries(KEYS.map((x) => [x, x === k ? ATK_DROP : 1])) };
  drawAll(); hud();
  await cardPanel(byYou ? L(`You spread bad news about ${sec.name}`, `你放出${sec.name}的利空消息`) : L(`${who} spreads bad news about ${sec.name}`, `${who}放出${sec.name}的利空消息`),
    (hurt ? hurt + ' ' : '') +
    L('Anyone short this asset profits.', '放空這檔資產的人則會獲利。'),
    `<span class="mv dn">${sec.name} -${Math.round((1 - ATK_DROP) * 100)}%</span>`, by.human ? 0 : AI_CARD_WAIT);
}
// 背包:只有輪到自己、還沒擲骰時能開
function bagPanel() {
  if (S.busy || S.over) return;
  if (S.lane?.type === 'jail') return toast(L('At the police station: items cannot be used', '在警察局裡不能使用道具'));
  S.busy = true; $('ctl').classList.add('hide');
  const close = () => { closePanel(); S.busy = false; showCtl(true); };
  const kinds = [...new Set(S.bag)];
  const p = panel(`<h3>${L('Backpack', '背包')}</h3>` +
    (kinds.length ? kinds.map((id) => { const it = itemInfo(id), c = S.bag.filter((x) => x === id).length;
      return `<div class="it"><span class="ic">${it.icon}</span><span class="tx"><b>${it.name}${c > 1 ? ' ×' + c : ''}</b><small>${it.desc}</small></span><button class="b-ok" data-id="${id}">${L('Use', '使用')}</button></div>`; }).join('')
      : `<p>${L('Empty. Buy items at a shop tile.', '背包是空的。走到商店格可以買道具。')}</p>`) +
    `<div class="btns"><button class="b-skip" data-id="">${L('Close', '關閉')}</button></div>`);
  p.querySelectorAll('button').forEach((b) => b.onclick = async () => {
    const id = b.dataset.id;
    if (!id) return close();
    closePanel();
    if (id === 'remote' && S.lane) { toast(L('You leave with a normal die roll', '離開這裡要擲真的骰子')); S.busy = false; showCtl(true); }
    else if (id === 'remote') {
      $('steps').innerHTML = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((n) => `<button data-n="${n}">${n}</button>`).join('') + '<button data-n="0" style="background:#a99b90;box-shadow:0 4px 0 #857a70">×</button>';
      $('stepCtl').classList.remove('hide');
      $('steps').querySelectorAll('button').forEach((x) => x.onclick = () => {
        const n = +x.dataset.n; $('stepCtl').classList.add('hide'); S.busy = false;
        if (!n) return showCtl(true);
        S.bag.splice(S.bag.indexOf('remote'), 1); hud(); turn(n);
      });
    } else if (id === 'atk') {
      const k = await attackPanel();
      if (k) { S.bag.splice(S.bag.indexOf('atk'), 1); await badNews(k, S.players[S.hi]); await flushNotices(); checkMissions(); }
      S.busy = false; showCtl(true);
    } else {
      S.bag.splice(S.bag.indexOf(id), 1);
      await playEvent(instantiate(itemInfo(id).event)); await flushNotices();
      checkMissions(); S.busy = false; showCtl(true);
    }
  });
}
/* ───────────── 中間的小路 ───────────── */
// 被送進小路:大跳躍到第一格。拘留小路 = 帳戶凍結(不能買賣、不能用道具);IPO 小路 = 每格都能用承銷價申購新股
async function enterLane(isMe, type) {
  const who = isMe ? S : S.ai, P = isMe ? PM() : PA(), name = CHARS[S.foe].name;
  who.lane = { type, wait: type === 'jail' ? JAIL_WAIT : 0 }; hud();
  await hopOnto(laneTiles[type][0].g, P, true); sfx(type === 'jail' ? 'jail' : 'bell');
  if (type === 'ipo') return isMe ? ipoPanel() : aiIpo();
  if (isMe) await cardPanel(L('Sent to the police station', '被送進警察局'),
    L(`Rest here ${JAIL_WAIT} rounds. You cannot buy, sell, cover or use items, but prices keep moving: a margin position below 130% is still sold for you. On your turn you can pay $${fmt(BAIL)} bail to leave at once. Leaving, you roll one die and walk that many tiles from the station exit.`,
      `在這裡休息 ${JAIL_WAIT} 回合。期間不能買賣、不能回補、不能用道具,但股價照樣會動:融資部位跌破 130% 一樣會被強迫平倉。輪到你時可以付 $${fmt(BAIL)} 保釋金立刻離開。離開時擲一顆骰子,從警察局出口走幾格回到外圈。`));
  else { toast(L(`${name} is sent to the police station`, `${name}被送進警察局了`)); await wait(1.3); }
}
// 沿著外圈走 n 格(經過起點 / 股息結算格會結算)。真人和電腦都用這個
async function stepAlong(isMe, n) {
  const who = isMe ? S : S.ai, P = isMe ? PM() : PA();
  for (let i = 0; i < n; i++) {
    who.pos = (who.pos + 1) % TILES.length;
    await hopTo(who.pos, P);
    if (who.pos === 0 || TILES[who.pos] === 'divi') { if (isMe) payday(who.pos === 0); else aiPayday(who, who.pos === 0); }
  }
}
// 離開警察局 / IPO 攤位:擲一顆骰子,先跳到出口那格,再往前走骰子的點數
async function leaveLane(isMe) {
  const who = isMe ? S : S.ai, P = isMe ? PM() : PA(), def = LANES[who.lane.type], d = r6(), name = isMe ? L('You', '你') : CHARS[S.foe].name;
  toast(L(`${name} roll${isMe ? '' : 's'} one die to leave`, `${name}擲一顆骰子離開`)); await wait(0.5);
  await rollDice([d], P); toast(`${name}: ${d}`);
  who.lane = null; who.pos = def.exit; await hopTo(def.exit, P); hud();
  await stepAlong(isMe, d);
}
function jailPanel() {
  return new Promise((res) => {
    const left = S.lane.wait, risky = KEYS.filter((k) => S.hold[k].loan > 0);
    const p = panel(`<h3><span class="tag" style="background:#7b8494">${L('POLICE', '警察局')}</span>${L('Resting', '休息中')}</h3>
      <p>${L(`${left} more round${left > 1 ? 's' : ''} before you can roll out. You cannot trade in here.`, `再休息 ${left} 回合才能擲骰子出去,在這裡不能買賣。`)}${risky.length ? ` <b style="color:#c4472f">${L(`Margin at risk: ${risky.map((k) => `${SECTORS[k].code} ${Math.round(ratioOf(S.hold[k], k) * 100)}%`).join(', ')}`, `融資部位有風險:${risky.map((k) => `${SECTORS[k].code} 維持率 ${Math.round(ratioOf(S.hold[k], k) * 100)}%`).join('、')}`)}</b>` : ''}</p>
      <div class="btns">
        <button class="b-ok" data-a="bail" ${S.cash < BAIL ? 'disabled' : ''}>${L('Pay bail', '付保釋金')}<br><span style="font-size:calc(11px * var(--fs))">$${fmt(BAIL)} · ${L('roll out now', '立刻擲骰出去')}</span></button>
        <button class="b-skip" data-a="wait">${L('Rest', '休息')}<br><span style="font-size:calc(11px * var(--fs))">${L('one more round', '再等一回合')}</span></button>
      </div>`);
    p.querySelectorAll('button').forEach((b) => b.onclick = () => { closePanel(); res(b.dataset.a === 'bail'); });
  });
}
// IPO:隨機一檔股票,用承銷價(市價 8 折)申購。新股是公司新發行的,所以不會推高市價
const ipoPick = (who) => { const pool = KEYS.filter((k) => !NON_EQUITY.has(k) && !who.short[k].n); return pool[Math.floor(Math.random() * pool.length)]; };
// 送的股票成本算承銷價(只是不用付錢),這樣損益百分比才有意義
function ipoGrant(who, k) { const h = who.hold[k]; h.n += IPO_FREE; h.cost += S.price[k] * IPO_OFF * IPO_FREE; }
function ipoPanel() {
  return new Promise((res) => {
    const k = ipoPick(S), sec = SECTORS[k], h = S.hold[k], mkt = S.price[k], price = mkt * IPO_OFF;
    ipoGrant(S, k); sfx('coin'); drawAll(); hud();
    const p = panel(`<h3><span class="tag" style="background:#2fbf9f">IPO</span>${L('New shares: ', '新股中籤:')}${sec.name}</h3>
      <p><b style="color:#1c8a4a">${L(`You get ${IPO_FREE} shares for free (worth $${fmt(mkt * IPO_FREE)}).`, `免費獲得 ${IPO_FREE} 股(市值 $${fmt(mkt * IPO_FREE)})。`)}</b> ${L('You can also buy more at the IPO price, which is set below the market so the shares sell out. The price can still fall afterwards. Next turn you roll one die to get back on the road.', '想多買還可以用承銷價加購:新股為了順利賣完,承銷價會訂得比市價低。不過之後股價還是可能下跌。下一回合擲一顆骰子走回外圈。')}</p>
      <div class="kv">
        <div>${L('Market price', '市價')}<b>$${Math.round(mkt)}</b></div>
        <div>${L('IPO price', '承銷價')}<b style="color:#1c8a4a">$${Math.round(price)}</b></div>
        <div>${L('You hold', '持有')}<b>${h.n}</b></div>
      </div>
      <div class="slider"><span>${L('Buy more', '加購')}</span><input type="range" id="ipoQty" min="10" max="50" step="10" value="10"><b id="ipoVal"></b></div>
      <div class="btns">
        <button class="b-buy" data-a="buy">${L('Buy more', '加購')}<br><span id="ipoBtn"></span></button>
        <button class="b-skip" data-a="x">${L('Continue', '繼續')}</button>
      </div>`);
    const qty = $('ipoQty');
    const paint = () => { const q = +qty.value; $('ipoVal').textContent = `${q} ${L('sh', '股')} · $${fmt(price * q)}`; $('ipoBtn').textContent = `$${fmt(price * q)}`; p.querySelector('[data-a=buy]').disabled = S.cash < price * q; };
    qty.oninput = paint; paint();
    p.querySelectorAll('button').forEach((b) => b.onclick = () => {
      if (b.dataset.a === 'buy') { const n = +qty.value; S.cash -= price * n; h.n += n; h.cost += price * n; sfx('buy'); toast(L(`Bought ${n} more ${sec.name} at $${Math.round(price)}`, `用承銷價 $${Math.round(price)} 加購 ${sec.name} ${n} 股`)); }
      drawAll(); hud(); closePanel(); res();
    });
  });
}
async function aiIpo() {
  const A = S.ai, who = CHARS[S.foe].name, k = ipoPick(A), sec = SECTORS[k], price = S.price[k] * IPO_OFF;
  const lots = A.cash >= price * LOT * 3 + 1500 ? 3 : A.cash >= price * LOT + 500 ? 1 : 0;
  ipoGrant(A, k);
  if (lots) { const n = LOT * lots; A.cash -= price * n; A.hold[k].n += n; A.hold[k].cost += price * n;
    toast(L(`${who} got ${IPO_FREE} free ${sec.name} shares and bought ${n} more`, `${who}免費獲得${sec.name} ${IPO_FREE} 股,又加購 ${n} 股`)); }
  else toast(L(`${who} got ${IPO_FREE} free ${sec.name} shares`, `${who}免費獲得${sec.name} ${IPO_FREE} 股`));
  drawAll(); hud(); await wait(1.1);
}
// 銀行:借現金 / 還錢。每次走到銀行只做一個動作,選完面板就關掉、換下一位
function bankPanel() {
  return new Promise((res) => {
    const draw = () => {
      const room = BANK_MAX - S.debt, fee = S.debt * BANK_RATE;
      const p = panel(`<h3><span class="tag" style="background:#4a63b0">${L('BANK', '銀行')}</span>${L('Cat Street Bank', '貓街銀行')}</h3>
        <p>${L(`Borrow cash now and pay it back later. Each time you pass GO you pay ${Math.round(BANK_RATE * 100)}% interest on what you owe, and the loan counts against your total assets. Borrowing only pays off if what you buy earns more than the interest.`,
              `先借現金、之後再還。每次經過起點要付欠款 ${Math.round(BANK_RATE * 100)}% 的利息,欠的錢也會從總資產扣掉。借來的錢賺得比利息多,才划算。`)}</p>
        <div class="kv">
          <div>${L('You owe', '目前欠款')}<b style="color:${S.debt ? '#c4472f' : 'inherit'}">$${fmt(S.debt)}</b></div>
          <div>${L('Interest per lap', '每圈利息')}<b>$${fmt(fee)}</b></div>
          <div>${L('Can still borrow', '還能借')}<b>$${fmt(room)}</b></div>
        </div>
        ${room >= 1000 ? `<div class="slider"><span>${L('Borrow', '借款')}</span><input type="range" id="bkAmt" min="1000" max="${Math.floor(room / 500) * 500}" step="500" value="${Math.min(2000, Math.floor(room / 500) * 500)}"><b id="bkVal"></b></div>` : ''}
        ${S.debt > 0 ? `<div class="slider"><span>${L('Repay', '還款')}</span><input type="range" id="bkRep" min="500" max="${Math.max(500, Math.min(S.debt, Math.floor(S.cash / 500) * 500))}" step="500" value="${Math.max(500, Math.min(S.debt, Math.floor(S.cash / 500) * 500))}"><b id="bkRepVal"></b></div>` : ''}
        <div class="btns">
          <button class="b-buy" data-a="borrow" ${room < 1000 ? 'disabled' : ''}>${L('Borrow', '借')} <span id="bkBtn"></span></button>
          <button class="b-ok" data-a="repay" ${S.debt > 0 && S.cash >= 500 ? '' : 'disabled'}>${L('Repay', '還')} <span id="bkRepBtn"></span></button>
          <button class="b-skip" data-a="x">${L('Leave', '離開')}</button>
        </div>`);
      // 拉桿:借 1,000 ~ 5,000(每 500 一格),還款 500 ~ 欠款(受現金限制)。拉動時即時顯示金額和利息
      const amt = $('bkAmt'), rep = $('bkRep');
      const paint = () => {
        if (amt) { const v = +amt.value; $('bkVal').textContent = `$${fmt(v)} · ${L('interest', '利息')} $${fmt(v * BANK_RATE)}${L(' / lap', ' / 圈')}`; $('bkBtn').textContent = `$${fmt(v)}`; }
        else $('bkBtn').textContent = '—';
        if (rep) { const v = +rep.value; $('bkRepVal').textContent = `$${fmt(v)}${v >= S.debt ? L(' (all)', '(全部還清)') : ''}`; $('bkRepBtn').textContent = `$${fmt(v)}`; }
        else $('bkRepBtn').textContent = '—';
      };
      if (amt) amt.oninput = paint; if (rep) rep.oninput = paint; paint();
      p.querySelectorAll('button').forEach((b) => b.onclick = () => {
        const a = b.dataset.a;
        if (a === 'x') { closePanel(); return res(); }
        const d = a === 'borrow' ? +amt.value : -Math.min(S.debt, +rep.value);
        S.cash += d; S.debt += d; sfx(d > 0 ? 'coin' : 'sell');
        toast(d > 0 ? L(`Borrowed $${fmt(d)}`, `借了 $${fmt(d)}`) : L(`Repaid $${fmt(-d)}`, `還了 $${fmt(-d)}`));
        hud(); closePanel(); res();        // 選一個動作就結束,不用再按離開
      });
    };
    draw();
  });
}
// 命運牌:只影響踩到的那個人(市場事件是影響所有人的股價)。有好有壞,有些會把你移到別的地方
const FATE = [
  { id: 'lottery', good: true, t: L('You won the lottery', '中樂透'), w: L('Pure luck. Luck is not a strategy, but take it.', '純運氣。運氣不是策略,但該拿還是拿。'), fx: L('+$1,500', '+$1,500') },
  { id: 'tax', good: false, t: L('Tax season', '報稅季'), w: L('Profits get taxed. Keep some cash for it.', '賺的錢要繳稅,手上要留一點現金。'), fx: L('−5% of your cash', '現金 −5%') },
  { id: 'birthday', good: true, t: L('Birthday', '生日'), w: L('Every other player chips in.', '其他每位玩家各包一個紅包給你。'), fx: L('+$200 from each player', '每人給你 +$200') },
  { id: 'gostart', good: true, t: L('Shortcut to GO', '抄捷徑回起點'), w: L('Collect your salary and dividends early.', '提早領薪水和股利。'), fx: L('Move to GO', '直接移到起點') },
  { id: 'back3', good: false, t: L('Missed the bus', '錯過公車'), w: L('Three tiles back. Whatever is there, you land on it.', '退三格,那一格是什麼就算什麼。'), fx: L('Back 3 tiles', '退後 3 格') },
  { id: 'jail', good: false, t: L('Insider tip gone wrong', '收到內線消息'), w: L('You traded on it. Straight to the police station.', '你照著買了,直接送警察局。'), fx: L('Go to the police station', '送去警察局') },
  { id: 'ipo', good: true, t: L('IPO lottery win', '新股抽籤中籤'), w: L('Off to the IPO booth for free shares.', '去 IPO 攤位領免費新股。'), fx: L('Go to the IPO booth', '前往 IPO 攤位') },
  { id: 'remote', good: true, t: L('Found a remote dice', '撿到遙控骰子'), w: L('A dice you can set. It is in your backpack.', '可以指定點數的骰子,放進背包了。'), fx: L('+1 Remote dice', '+1 遙控骰子') },
  { id: 'atk', good: true, t: L('A rumor to spread', '聽到一個八卦'), w: L('A bad-news card for your backpack. Use it on a rival.', '一張利空消息卡進背包,拿去打對手。'), fx: L('+1 Bad news card', '+1 利空消息卡') },
  { id: 'divi', good: true, t: L('Special dividend', '特別股利'), w: L('All your holdings pay out once, right now.', '你所有持股立刻配息一次。'), fx: L('Dividends now', '立刻領一次股利') },
  { id: 'phone', good: false, t: L('Dropped your phone', '手機掉進水裡'), w: L('Life happens. Emergency fund matters.', '生活總有意外,所以要有緊急預備金。'), fx: L('−$300', '−$300') },
  { id: 'richest', good: true, t: L('The leader treats', '第一名請客'), w: L('The richest other player buys you dinner.', '最有錢的對手請你吃飯。'), fx: L('+$500 from the leader', '第一名給你 +$500') },
  { id: 'fine', good: false, t: L('Parking ticket', '違規停車罰單'), w: L('Small, annoying, unavoidable.', '小錢,但很煩。'), fx: L('−$500', '−$500') },
  { id: 'salary2', good: true, t: L('Promotion', '升職加薪'), w: L('Your next salary is doubled.', '下一次經過起點薪水加倍。'), fx: L('Next salary ×2', '下次薪水 ×2') },
];
// 翻命運牌:三張背面朝上挑一張(電腦自動挑)。回傳抽到的牌,效果由 applyFate 處理
function drawFateCards(auto) {
  return new Promise((res) => {
    const picks = FATE.slice().sort(() => Math.random() - 0.5).slice(0, 3), who = CHARS[S.foe].name;
    const face = (c) => `<div class="dhead ${c.good ? 'good' : 'bad'}">${c.t}</div><div class="dwhy">${c.w}</div><div class="dmv"><span class="mv ${c.good ? 'up' : 'dn'}">${c.fx}</span></div>`;
    const ov = $('draw');
    ov.innerHTML = `<h2>★ ${auto ? L(`${who} flips a fate card`, `${who}翻命運牌`) : L('Flip a fate card', '翻一張命運牌')}</h2>` +
      `<div class="dcards">${picks.map((c, i) => `<div class="dcard" data-i="${i}" style="--i:${i}"><div class="dinner"><div class="dback" style="background:#c08cf5"><span>★</span></div><div class="dfront">${face(c)}</div></div></div>`).join('')}</div>` +
      `<button class="dgo hide" id="dgo">${L('Continue', '繼續')}</button>`;
    ov.classList.remove('hide'); ov.classList.toggle('auto', !!auto);
    const cards = [...ov.querySelectorAll('.dcard')]; let chosen = -1, done = false;
    const choose = (i) => {
      if (chosen >= 0) return;
      chosen = i; ov.classList.add('done'); cards[i].classList.add('flip', 'picked'); sfx('flip');
      wait(0.45).then(() => sfx(picks[i].good ? 'good' : 'bad'));
      wait(0.9).then(() => { cards.forEach((c, j) => { if (j !== i) c.classList.add('flip', 'lost'); }); $('dgo').classList.remove('hide'); if (auto) wait(2).then(() => { if (!done) $('dgo').click(); }); });
    };
    cards.forEach((c, i) => { c.onclick = () => { if (!auto) choose(i); }; });
    if (auto) wait(1.2).then(() => choose(Math.floor(Math.random() * 3)));
    $('dgo').onclick = () => { if (done) return; done = true; ov.classList.add('hide'); ov.classList.remove('done'); res(picks[chosen]); };
  });
}
// 命運牌生效。會移動的牌(回起點、退三格、警察局、IPO)在這裡處理;退三格之後要重新結算那一格
async function applyFate(c, isMe) {
  const who = isMe ? S : S.ai, name = isMe ? L('You', '你') : CHARS[S.foe].name;
  const say = (en, zh) => toast(L(en, zh));
  if (c.id === 'lottery') { who.cash += 1500; sfx('coin'); say(`${name} +$1,500`, `${name} +$1,500`); }
  else if (c.id === 'tax') { const t = Math.round(Math.max(0, who.cash) * 0.05); who.cash -= t; sfx('short'); say(`${name} paid $${fmt(t)} tax`, `${name}繳稅 $${fmt(t)}`); }
  else if (c.id === 'birthday') { let got = 0; others(who.i).forEach((p) => { p.cash -= 200; got += 200; }); who.cash += got; sfx('coin'); say(`${name} +$${fmt(got)} in gifts`, `${name}收到紅包 +$${fmt(got)}`); }
  else if (c.id === 'phone') { who.cash -= 300; sfx('short'); say(`${name} −$300`, `${name} −$300`); }
  else if (c.id === 'fine') { who.cash -= 500; sfx('short'); say(`${name} −$500`, `${name} −$500`); }
  else if (c.id === 'richest') { const r = others(who.i).sort((a, b) => assetsOf(b) - assetsOf(a))[0]; r.cash -= 500; who.cash += 500; sfx('coin'); say(`${nameOf(r)} pays ${name} $500`, `${nameOf(r)}請客,${name} +$500`); }
  else if (c.id === 'remote' || c.id === 'atk') { who.bag.push(c.id); sfx('item'); say(`${name}: ${itemInfo(c.id).name} added`, `${name}獲得${itemInfo(c.id).name}`); }
  else if (c.id === 'divi') { if (isMe) payday(false); else aiPayday(who, false); }
  else if (c.id === 'salary2') { who.salary2 = true; say(`${name}: next salary doubled`, `${name}下次薪水加倍`); }
  else if (c.id === 'gostart') { const P = isMe ? PM() : PA(); who.pos = 0; await hopOnto(tiles[0].g, P, true); if (isMe) payday(true); else aiPayday(who, true); }
  else if (c.id === 'back3') { const P = isMe ? PM() : PA(); for (let i = 0; i < 3; i++) { who.pos = (who.pos + TILES.length - 1) % TILES.length; await hopTo(who.pos, P); } hud(); await wait(0.2); return isMe ? landOn() : aiLand(); }
  else if (c.id === 'jail' || c.id === 'ipo') { await enterLane(isMe, c.id); }
  hud(); await wait(0.6);
}
const r6 = () => 1 + Math.floor(Math.random() * 6);
// 對手決定擲 1 顆還是 2 顆:把「每個可能落點對牠有多好」算成分數,比較兩種擲法的期望值。
// 一顆骰子走 1~6 格(機率相同),兩顆走 2~12 格(7 最常出現)
function aiDiceChoice() {
  const A = S.ai;
  const score = (i) => {
    const t = TILES[(A.pos + i) % TILES.length], sec = SECTORS[t]; let v = 0;
    if (sec) { const h = A.hold[t], sh = A.short[t], p = S.price[t];
      if (h.n && (p * h.n - h.cost) / h.cost >= 0.15) v += 3;                       // 可以獲利了結
      else if (sh.n && Math.abs((sh.entry - p) / sh.entry) >= 0.12) v += 2;          // 空單該回補了
      else if (h.loan > 0 && ratioOf(h, t) < 1.5) v += 2;                            // 融資快斷頭,想去處理
      else v += p < sec.open * 0.95 ? 1.5 : 0.5; }                                   // 便宜的比較想買
    else if (t === 'shop') v += A.cash >= 2500 ? 2 : 0.3;
    else if (t === 'ipo') v += 2.5;
    else if (t === 'fate') v += 0.5;
    else if (t === 'bank') v += A.cash < 1500 || (A.debt && A.cash > 6000) ? 1.5 : 0;
    else if (t === 'fee') v -= 2;
    for (let j = 1; j <= i; j++) { const tt = TILES[(A.pos + j) % TILES.length]; if (tt === 'start') v += 2; else if (tt === 'divi') v += 0.8; }   // 經過發薪 / 股息格
    return v;
  };
  let e1 = 0, e2 = 0.3;                                                              // 兩顆走得遠,給一點基本分
  for (let i = 1; i <= 6; i++) e1 += score(i) / 6;
  for (let a = 1; a <= 6; a++) for (let b = 1; b <= 6; b++) e2 += score(a + b) / 36;
  return e1 > e2 ? 1 : 2;
}
// 小熊的回合。策略很單純,但都是看得懂的規則:
//   賺超過 15% 就賣;價格比開盤低 5% 以上且現金夠就多買;否則留 $1,500 現金後買 10 股
// 電腦經過起點 / 股息結算:薪水(升職加薪時加倍)、股利、融資與貸款利息
function aiPayday(A, atStart) {
  const div = KEYS.reduce((x, k) => x + A.hold[k].n * S.price[k] * SECTORS[k].div, 0);
  const salary = atStart ? SALARY * (A.salary2 ? 2 : 1) : 0; if (atStart) A.salary2 = false;
  A.cash += salary + div - (atStart ? KEYS.reduce((x, k) => x + A.hold[k].loan * MARGIN_FEE, 0) + A.debt * BANK_RATE : 0); hud();
}
async function aiTurn() {
  const A = S.ai, who = CHARS[S.foe].name;
  focus = PA(); pan.set(0, 0, 0); toast(L(`${who}'s turn`, `${who}的回合`)); await wait(0.9);
  // 對手出牌:利空卡打你持有最多的資產;事件卡在牠持有受惠類股時才用
  if (A.bag.includes('atk') && Math.random() < AI().atkP) {
    // 打「目前最有錢的那位對手」持有最多的資產
    const T = others(A.i).sort((x, y) => assetsOf(y) - assetsOf(x))[0];
    const k = KEYS.filter((x) => T.hold[x].n > 0).sort((x, y) => T.hold[y].n * S.price[y] - T.hold[x].n * S.price[x])[0];
    if (k) { A.bag.splice(A.bag.indexOf('atk'), 1); await badNews(k, A); }
  }
  { const id = A.bag.find((x) => x.startsWith('ev') && A.hold[itemInfo(x).best].n > 0);
    if (id) { A.bag.splice(A.bag.indexOf(id), 1); toast(L(`${who} plays an event card`, `${who}使用事件卡`)); await wait(0.6); await playEvent(itemInfo(id).event, AI_CARD_WAIT); } }
  if (A.lane) {
    // 在警察局:錢夠多就付保釋金,不然休息一回合;能走了就擲一顆骰子出去。IPO 攤位:下一回合直接擲骰出去
    if (A.lane.type === 'jail' && A.lane.wait > 0) {
      if (A.cash >= BAIL + 2500) { A.cash -= BAIL; A.lane.wait = 0; toast(L(`${who} pays $${fmt(BAIL)} bail`, `${who}付了 $${fmt(BAIL)} 保釋金`)); await wait(0.8); await leaveLane(false); }
      else { A.lane.wait--; toast(L(`${who} rests at the police station (${A.lane.wait} left)`, `${who}在警察局休息(再 ${A.lane.wait} 回合)`)); await wait(0.9); }
    } else await leaveLane(false);
  } else {
  const nd = aiDiceChoice(), vals = nd === 1 ? [r6()] : [r6(), r6()], n = vals.reduce((x, y) => x + y, 0);
  toast(L(`${who} rolls ${nd === 1 ? 'one die' : 'two dice'}`, `${who}選擇擲 ${nd} 顆骰子`)); await wait(0.7);
  await rollDice(vals, PA()); toast(vals.length === 1 ? `${who}: ${n}` : `${who}: ${vals[0]} + ${vals[1]} = ${n}`);
  await stepAlong(false, n);
  }
  await wait(0.2);
  await aiLand();
  hud(); pan.set(0, 0, 0); await wait(0.5);
}
// 電腦踩到的那一格要做什麼
async function aiLand() {
  const A = S.ai, who = CHARS[S.foe].name;
  const type = A.lane ? '_' + A.lane.type : TILES[A.pos], sec = SECTORS[type];
  if (type === '_jail') { await wait(0.2); }
  else if (type === '_ipo') { await wait(0.2); }
  else if (type === 'ipo') await enterLane(false, 'ipo');
  else if (type === 'fate') { await wait(0.3); const c = await drawFateCards(true); await applyFate(c, false); }
  else if (sec) {
    const h = A.hold[type], sh = A.short[type], price = S.price[type], mine = Math.max(...others(A.i).map((p) => p.hold[type].n));   // mine:別人最多持有幾股
    if (sh.n) {
      // 有空單:賺 12% 以上就回補落袋,虧 12% 以上就停損,不然續抱
      const r = (sh.entry - price) / sh.entry;
      if (Math.abs(r) >= 0.12) { const pl = (sh.entry - price) * sh.n; A.cash += shortValue(type, A); const cn = sh.n; sh.n = 0; sh.entry = 0; impact(type, buyF(cn));
        toast(L(`${who} covered its ${sec.name} short (${pl >= 0 ? '+' : '-'}$${fmt(Math.abs(pl))})`, `${who}回補${sec.name}空單(${pl >= 0 ? '+' : '-'}$${fmt(Math.abs(pl))})`)); }
      else toast(L(`${who} keeps its ${sec.name} short`, `${who}續抱${sec.name}空單`));
    } else if (h.n && (price * h.n - h.cost) / h.cost >= 0.15) {
      const n = h.n; A.cash += price * n - h.loan; h.n = 0; h.cost = 0; h.loan = 0;
      toast(L(`${who} took profit on ${sec.name}. Price ${pct(sellF(n))}`, `${who}賣出${sec.name}獲利了結,股價 ${pct(sellF(n))}`)); impact(type, sellF(n));
    } else if (!h.n && A.cash >= price * LOT + AI().reserve && Math.random() < AI().shortP && ((mine >= LOT && (AI().shortAny || price > sec.open * 1.08)) || price > sec.open * 1.3)) {
      // 放空:你持有而且已經漲了一段(打擊你),或是漲太多(賭它回檔)
      A.cash -= price * LOT; sh.entry = price; sh.n = LOT; impact(type, SHORT_F);
      toast(mine >= LOT ? L(`${who} shorts ${sec.name} to hit its holders. Price ${pct(SHORT_F)}`, `${who}放空${sec.name}打擊持有的人,股價 ${pct(SHORT_F)}`) : L(`${who} shorts ${sec.name}. Price ${pct(SHORT_F)}`, `${who}放空${sec.name},股價 ${pct(SHORT_F)}`));
    } else {
      const lots = ((price < sec.open * 0.95 || others(A.i).some((p) => p.short[type].n > 0)) && A.cash >= price * LOT * 3 + 2000) ? 3 : (A.cash >= price * LOT + 1500 ? 1 : 0);
      // 三次裡有一次會貪心用融資買 30 股(只付 4 成)—— 這就是你可以用放空和利空卡逼牠斷頭的機會
      const greedy = lots && !h.loan && Math.random() < AI().greedy && A.cash >= price * LOT * 3 * (1 - MARGIN_LOAN) + 1500;
      if (greedy) { const q = LOT * 3, cost = price * q; A.cash -= cost * (1 - MARGIN_LOAN); h.n += q; h.cost += cost; h.loan += cost * MARGIN_LOAN; impact(type, buyF(q));
        toast(L(`${who} margin-bought ${q} ${sec.name}. Price ${pct(buyF(q))}`, `${who}融資買進${sec.name} ${q} 股,股價 ${pct(buyF(q))}`)); }
      else if (lots) { const q = LOT * lots; A.cash -= price * q; h.n += q; h.cost += price * q; impact(type, buyF(q)); toast(L(`${who} bought ${q} ${sec.name}. Price ${pct(buyF(q))}`, `${who}買進${sec.name} ${q} 股,股價 ${pct(buyF(q))}`)); }
      else toast(L(`${who} keeps cash and skips`, `${who}保留現金,跳過`));
    }
    drawAll(); hud(); await wait(1.0);
  } else if (type === 'shop') {
    // 逛商店:有閒錢就買利空卡;不然買一張對牠持股有利的事件卡。買走的你就買不到了
    const stock = shopStock(); let got = null;
    if (stock.includes('atk') && A.cash >= ATK_PRICE + AI().reserve && Math.random() < AI().atkP) got = 'atk';
    else got = stock.find((x) => x.startsWith('ev') && A.hold[itemInfo(x).best].n > 0 && A.cash >= 2000) || null;
    if (got) { const it = itemInfo(got); A.cash -= it.price; A.bag.push(got); stock.splice(stock.indexOf(got), 1); S.shop.sold.push({ id: got, by: A.i }); toast(L(`${who} bought: ${it.name}`, `${who}買走了:${it.name}`)); }
    else toast(L(`${who} looks around the shop`, `${who}逛了逛商店`));
    hud(); await wait(1.2);
  } else if (type === 'chance') { await wait(0.3); const c = await drawEventCards(true); if (c.special) await enterLane(false, c.special); }
  else if (type === 'bank') {
    // 銀行:現金太少就借 $2,000 來周轉;手頭寬裕又有欠款就先還清,省利息
    if (A.debt > 0 && A.cash >= A.debt + 4000) { toast(L(`${who} repaid its $${fmt(A.debt)} loan`, `${who}把 $${fmt(A.debt)} 貸款還清了`)); A.cash -= A.debt; A.debt = 0; }
    else if (A.cash < 1500 && A.debt + 2000 <= BANK_MAX) { A.cash += 2000; A.debt += 2000; toast(L(`${who} borrowed $2,000 from the bank`, `${who}向銀行借了 $2,000`)); }
    else toast(L(`${who} walks past the bank`, `${who}路過銀行`));
    hud(); await wait(1.1);
  }
  else if (type === 'fee') { A.cash -= FEE; toast(L(`${who} paid $${FEE} in fees`, `${who}付了 $${FEE} 手續費`)); hud(); await wait(0.9); }
  else { toast(L(`${who} takes a break`, `${who}休息一下`)); await wait(0.7); }
}
async function turn(forced) {
  if (S.busy || S.over) return;
  S.busy = true; showCtl(false); pan.set(0, 0, 0);
  // 擲 1 顆或 2 顆由玩家選(S.diceN)。遙控骰子(forced):6 以內用一顆顯示,7 以上拆成兩顆的點數
  if (S.lane) {
    // 在警察局:付保釋金或再休息一回合;能走了(或在 IPO 攤位)就擲一顆骰子出去
    if (S.lane.type === 'jail' && S.lane.wait > 0) {
      if (await jailPanel()) { S.cash -= BAIL; S.lane.wait = 0; hud(); sfx('sell'); toast(L(`Paid $${fmt(BAIL)} bail`, `付了 $${fmt(BAIL)} 保釋金`)); await leaveLane(true); }
      else { S.lane.wait--; S.lane.rested = true; hud(); toast(L(`Resting (${S.lane.wait} left)`, `休息中(再 ${S.lane.wait} 回合)`)); await wait(0.6); }
    } else await leaveLane(true);      // 休息夠了(或在 IPO 攤位):擲一顆骰子出去
  } else {
  const vals = forced ? (forced <= 6 ? [forced] : [Math.floor(forced / 2), forced - Math.floor(forced / 2)]) : (S.diceN === 1 ? [r6()] : [r6(), r6()]);
  const n = vals.reduce((x, y) => x + y, 0);
  await rollDice(vals);
  toast(vals.length === 1 ? `${n}` : `${vals[0]} + ${vals[1]} = ${n}`);
  await stepAlong(true, n);
  }
  if (S.hi === 0) {           // 第一位走完 = 新的一回合開始:回合數 +1,所有價格小幅隨機波動
    S.rolls++;
    if (S.after) { const a = S.after; S.after = null; applyEvent(a); drawAll(); hud(); toast(a.t); sfx('good'); }
    KEYS.forEach((k) => { const v = SECTORS[k].vol ?? 0.03; S.price[k] = Math.max(8, S.price[k] * (1 - v + Math.random() * v * 2)); });
  }
  marginCheck();
  drawAll(); hud();
  await wait(0.15);

  await landOn();

  await flushNotices();
  S.cashStreak = (stockValue() > 0 && S.cash >= 2000) ? S.cashStreak + 1 : 0;
  checkMissions();
  await nextTurns();
}
// 輪到下一位:電腦自己走完;遇到真人就停下來等他擲骰。繞回第一位時,如果回合數用完就結算
// 玩家踩到的那一格要做什麼(命運牌「退三格」之後也會再呼叫一次)
async function landOn() {
  const type = S.lane ? '_' + S.lane.type : TILES[S.pos];
  if (type === '_jail') { toast(L('Resting at the police station: no trading this turn', '在警察局休息,這回合不能交易')); await wait(0.9); }
  else if (type === '_ipo') { await wait(0.2); }
  else if (type === 'ipo') await enterLane(true, 'ipo');
  else if (type === 'fate') { const c = await drawFateCards(false); await applyFate(c, true); }
  else if (SECTORS[type]) await buyPanel(type);
  else if (type === 'chance') {
    const c = await drawEventCards(false);
    if (c.special) await enterLane(true, c.special);
  } else if (type === 'fee') { S.cash -= FEE; hud(); sfx('short'); await cardPanel(L('Trading fees', '交易手續費'), L(`Every trade has a cost. You paid $${FEE}.`, `每筆交易都有成本,這次付了 $${FEE}。`)); }
  else if (type === 'shop') await shopPanel();
  else if (type === 'bank') await bankPanel();
  else if (type === 'gift') { const id = randomItem(), it = itemInfo(id); S.bag.push(id); hud(); sfx('item');
    await cardPanel(L('A gift', '收到禮物'), `${it.icon} ${it.name}<br>${it.desc}<br>${L('It is in your backpack.', '已放進背包。')}`); }
  else if (type === 'divi') await cardPanel(L('Dividend day', '股息結算'), L(`You collected $${fmt(S.lastDividend)} in dividends. Assets that pay nothing, like gold, biotech and crypto, only make money if the price rises.`, `領到股利 $${fmt(S.lastDividend)}。黃金、生技、加密貨幣不配息,只能靠價格上漲賺錢。`));
  else await cardPanel(L('Payday', '發薪日'), L(`Salary $${fmt(SALARY)}${S.lastDividend > 0 ? ` plus $${fmt(S.lastDividend)} in dividends` : ''}. Holding stocks pays you every lap.`, `薪水 $${fmt(SALARY)}${S.lastDividend > 0 ? `,加上股利 $${fmt(S.lastDividend)}` : ''}。持有股票,每繞一圈都會配息。`));
}
async function nextTurns() {
  let i = S.hi;
  for (;;) {
    i = (i + 1) % S.players.length;
    if (i === 0) {
      // 大家都走完一輪:系統自動抽一張市場事件(事件才不會太久才出現一次),再檢查有沒有人被斷頭 / 軋空
      await wait(0.3); await drawEventCards(true, true); await flushNotices(); checkMissions();
      if (S.rolls >= maxRolls()) { await wait(0.4); return finish(); }
    }
    const p = S.players[i];
    if (p.human) {
      S.turn = i; S.view = null; S.hi = i; if (S.players.length > S.nh) S.ci = S.players.findIndex((x) => !x.human); else S.ci = (i + 1) % S.players.length;
      focus = PM(); pan.set(0, 0, 0);
      setPortraits();
      if (S.nh > 1) { toast(L(`${nameOf(p)}'s turn (Player ${i + 1})`, `輪到${nameOf(p)}(玩家 ${i + 1})`)); }
      checkMissions();          // 別人走的時候股價會變,輪到自己先檢查一次任務
      S.busy = false; showCtl(true); return;
    }
    S.ci = i; S.turn = i; S.view = null; hud(); setPortraits(); await aiTurn(); await flushNotices();
  }
}
// 本機排行榜:每局結束存一筆到瀏覽器(只有第一位真人的成績),留最好的 10 筆(依總資產)
const loadRecords = () => { try { return JSON.parse(localStorage.getItem('css.records')) || []; } catch (e) { return []; } };
function saveRecord(r) {
  const list = loadRecords(); list.push(r); list.sort((a, b) => b.assets - a.assets);
  try { localStorage.setItem('css.records', JSON.stringify(list.slice(0, 10))); } catch (e) {}
}
// 這一局在排行榜裡的那一筆(用內容比對,因為存進去再讀出來已經不是同一個物件)
const findRecord = (r) => loadRecords().find((x) => x.date === r.date && x.assets === r.assets && x.char === r.char && x.rounds === r.rounds) || null;
const bestOf = () => { const l = loadRecords(); return { games: l.length, best: l[0] || null, stars3: l.filter((r) => r.stars === 3).length, wins: l.filter((r) => r.rank === 1).length }; };
// 結算畫面右側的排行榜:1~10 名,這一局的那筆會亮起來
function recordsBox(cur) {
  const list = loadRecords(), best = bestOf();
  const same = (a, b) => a && b && a.date === b.date && a.assets === b.assets && a.char === b.char && a.rounds === b.rounds;
  const rows = list.map((r, i) => `<div class="rrow ${same(r, cur) ? 'me' : ''}">
      <span class="rk">${i + 1}</span><span class="ic">${CHARS[r.char]?.icon || ''}</span>
      <div class="c"><b>${r.name ? `${r.name} · ` : ''}$${fmt(r.assets)}</b><small>${r.rounds}${L(' rd', ' 回合')} · ${r.n}${L('p', ' 人')} · ${L('#', '第 ')}${r.rank}${L('', ' 名')} · ${r.date.slice(5)}</small></div>
      <span class="st">${'★'.repeat(r.stars)}<i>${'★'.repeat(3 - r.stars)}</i></span></div>`).join('');
  return `<div class="rbox"><h4>🏆 ${L('Leaderboard', '排行榜')}</h4>
    <p>${L(`${best.games} game${best.games > 1 ? 's' : ''} · ${best.wins} win${best.wins === 1 ? '' : 's'} · ${best.stars3} three-star`, `已記錄 ${best.games} 局 · 第一名 ${best.wins} 次 · 三顆星 ${best.stars3} 次`)}</p>
    ${rows || `<p>${L('No games finished yet.', '還沒有完成過的對局。')}</p>`}
    <small class="note2">${L('Top 10 by total assets, saved in this browser.', '依總資產排前 10 名,只存在這個瀏覽器裡。')}</small></div>`;
}
function finish() {
  S.over = true; S.hi = S.players.findIndex((p) => p.human);      // 結算畫面用第一位真人的視角
  // 星星:完成 2 / 4 / 6 個任務
  const done = S.done >= 6 ? 3 : S.done >= 4 ? 2 : S.done >= 2 ? 1 : 0;
  let top = 'cash', tv = S.cash;
  KEYS.forEach((k) => { const v = S.hold[k].n * S.price[k]; if (v > tv) { tv = v; top = k; } });
  const style = {
    cash: L('Careful saver. Lots of cash, little growth.', '謹慎存錢派:現金很多,但成長有限。'),
    tech: L('Growth believer. Big swings, big upside.', '成長信仰派:波動大,潛力也大。'),
    soft: L('Subscription fan. You pay up for steady, growing profits.', '訂閱信徒:願意為穩定成長的獲利付高估值。'),
    chip: L('Cycle rider. You chase supply and demand.', '循環騎士:跟著供需循環進出。'),
    yield: L('Income collector. Telecom pays steadily every lap.', '領息一族:電信股每圈穩穩收股利。'),
    agri: L('Farmer at heart. You hedge with things people must eat.', '農夫派:用大家一定要吃的東西避險。'),
    oil: L('Macro trader. You bet on world events.', '總經交易者:押注國際事件。'),
    health: L('Defender. You like sectors that hold up in a storm.', '防禦派:偏好抗跌的類股。'),
    reit: L('Landlord. You collect rent and watch interest rates.', '包租公:收租配息,緊盯利率。'),
    fin: L('Banker. You like steady payers that enjoy higher rates.', '銀行家:偏好配息穩、升息受惠的金融股。'),
    trans: L('Trade watcher. You ride the shipping cycle.', '景氣觀察家:跟著運價循環進出。'),
    bio: L('Moonshot hunter. High risk, no dividends, big dreams.', '夢想獵人:高風險、不配息,賭新藥成功。'),
    staples: L('Steady hand. You pick what people always need.', '穩健派:選大家一定會買的東西。'),
    disc: L('Good-times rider. You bet on people spending.', '景氣樂觀派:押注大家願意花錢。'),
    util: L('Sleep-well investor. Boring, steady, paid every lap.', '安心睡覺派:無聊、穩定、每圈領息。'),
    mat: L('Builder. You bet on steel, cement and inflation.', '建設派:押注鋼鐵水泥與通膨。'),
    gold: L('Safe-haven seeker. You prepare for storms.', '避險派:隨時為風暴做準備。'),
    bond: L('Balancer. You pair stocks with bonds.', '平衡派:用債券平衡股票的波動。'),
    etf: L('Index investor. You own the whole market and skip the guessing.', '指數投資人:買下整個市場,不猜個股。'),
    green: L('Future believer. You back industries that are not profitable yet.', '未來信仰者:支持還沒賺錢的新產業。'),
    def: L('World watcher. You trade on global tension.', '國際觀察家:跟著國際情勢布局。'),
    game: L('Hit chaser. You wait for the next big title.', '大作獵人:等待下一款熱門作品。'),
    crypto: L('Thrill seeker. Most of your money rides on hype.', '刺激追求者:大部分資金押在熱度上。'),
  }[top];
  const title = [L('Rough market', '行情不順'), L('Curious rookie', '好奇新手'), L('Sharp analyst', '精明分析師'), L('Top investor', '頂尖投資人')][done];
  const a = assets();
  const rank = S.players.slice().sort((x, y) => assetsOf(y) - assetsOf(x)), medal = ['🥇', '🥈', '🥉', '4'];
  const table = rank.map((p, i) => `<div style="display:flex;align-items:center;gap:10px;padding:5px 10px;border-radius:10px;${p.human ? 'background:#fff3d6;' : ''}font-weight:800">
      <span style="width:1.6em;text-align:center">${medal[i]}</span><span style="flex:1;text-align:left">${CHARS[p.char].icon} ${nameOf(p)}${p.name ? `(${CHARS[p.char].name})` : ''}${p.human ? (S.nh > 1 ? ` · ${L('Player', '玩家')} ${p.i + 1}` : (p.name ? '' : L(' (you)', '(你)'))) : ''}</span><b>${assetsOf(p) < 0 ? '-' : ''}$${fmt(Math.abs(assetsOf(p)))}</b></div>`).join('');
  const won = rank[0].human;
  // 存紀錄(第一位真人),並拿歷史最佳來比
  const me0 = S.players[S.hi], myRank = 1 + rank.findIndex((p) => p === me0), rec = { date: new Date().toISOString().slice(0, 10), char: me0.char, name: me0.name || '', n: S.players.length, rounds: S.rolls, assets: Math.round(assetsOf(me0)), done: S.done, stars: done, rank: myRank };
  const prev = bestOf(); saveRecord(rec); const after = bestOf();
  const newBest = !prev.best || rec.assets > prev.best.assets;
  // 成績卡上一個「看排行榜」按鈕,點了才疊一塊 1~10 名的排行榜(內容和右側版一樣)
  const recLine = `<p style="font-size:calc(12.5px * var(--fs))">${newBest ? `🏆 <b>${L('New personal best!', '新的個人最佳紀錄!')}</b> ` : ''}<button class="lnk" id="recBtn">🏆 ${L('Leaderboard', '看排行榜')}</button></p>`;
  const myRec = findRecord(rec);
  $('end').innerHTML = (S.nh > 1
    ? `<div class="card">
    <h2>🏆 ${L(`${nameOf(rank[0])} wins`, `${nameOf(rank[0])}獲勝`)}</h2>
    <div style="margin:10px 0">${table}</div>${recLine}
    <p>${S.players.filter((p) => p.human).map((p) => L(`Player ${p.i + 1}: ${p.done} missions`, `玩家 ${p.i + 1} 完成 ${p.done} 個任務`)).join(' · ')} · ${L(`${S.rolls} rounds`, `${S.rolls} 回合`)}</p>
    <p style="font-size:calc(12.5px * var(--fs))">${L('Want real charts, rankings, and an AI you can talk to? CatInsight Stock has them.', '想看真實線圖、排行,還有能對話的 AI?CatInsight Stock 都有。')}</p>
    <div class="btns"><button class="b-skip" id="again">${L('Play again', '再玩一次')}</button><button class="b-ok" id="app">${L('Get the app', '下載 App')}</button></div></div>`
    : `<div class="card">
    <div class="stars">${[0, 1, 2].map((i) => i < done ? '<b>★</b>' : '★').join('')}</div>
    <h2>${title}</h2>
    <p>${L('Total assets', '總資產')} <b>$${fmt(a)}</b> (${a >= START_CASH ? '+' : ''}${((a / START_CASH - 1) * 100).toFixed(0)}%) · ${L(`${S.rolls} rounds`, `${S.rolls} 回合`)} · ${L(`${S.done} missions completed`, `完成 ${S.done} 個任務`)}</p>
    <div style="margin:10px 0">${table}</div>${recLine}
    <p>${style}</p>
    <p style="font-size:calc(12.5px * var(--fs))">${L('Want real charts, rankings, and an AI you can talk to? CatInsight Stock has them.', '想看真實線圖、排行,還有能對話的 AI?CatInsight Stock 都有。')}</p>
    <div class="btns"><button class="b-skip" id="again">${L('Play again', '再玩一次')}</button><button class="b-ok" id="app">${L('Get the app', '下載 App')}</button></div></div>`);
  $('end').classList.remove('hide'); sfx(won ? 'win' : 'lose');
  $('again').onclick = start;
  $('recBtn').onclick = () => {
    const p = panel(recordsBox(myRec) + `<div class="btns"><button class="b-skip" id="recClose">${L('Close', '關閉')}</button></div>`);
    p.querySelector('#recClose').onclick = closePanel;
  };
  $('app').onclick = () => window.open(APP_URL, '_blank', 'noopener');
}
// 選角:在 3D 轉盤上選(pickStage),同時決定人數(2~4)和真人數(1~2)。電腦對手從剩下的角色裡隨機挑。
// 網址 ?piece=cat 可以跳過選角(測試用),還可以加 &n=4&h=2 指定人數和真人數
async function start() {
  newState(); $('end').classList.add('hide'); closePanel(); $('toast').classList.remove('on');   // 上一局最後的提示不要留到選角畫面
  staticText(); PIECES.forEach((P) => placePiece(0, P)); focus = PIECES[0]; diceSpots(PIECES[0]); dice.forEach((d, i) => d.position.copy(DIE_REST[i])); drawAll();
  S.busy = true; showCtl(false); hud();
  let cfg;
  if (CHARS[PRESET]) { const q = new URLSearchParams(location.search), n = Math.min(4, Math.max(2, +q.get('n') || 2)), h = Math.min(2, Math.max(1, +q.get('h') || 1));
    const rest = Object.keys(CHARS).filter((k) => k !== PRESET).sort(() => Math.random() - 0.5);
    cfg = { chars: [PRESET, ...rest.slice(0, n - 1)], humans: h, rounds: q.get('rounds'), ai: q.get('ai'), names: [q.get('name') || ''] };
  } else cfg = await pickStage();
  setPlayers(cfg.chars, cfg.humans, cfg.names || []); S.maxRounds = ROUND_OPTS.includes(+cfg.rounds) ? +cfg.rounds : MAX_ROLLS; S.aiLevel = AI_LEVELS[cfg.ai] ? cfg.ai : 'normal';
  PIECES.forEach((P, i) => { if (i < S.players.length) { setChar(P.body, S.players[i].char); placePiece(0, P); } });
  showPieces(true); focus = PIECES[0];
  buildFoes(); setPortraits();
  hud();
  // 開局先講清楚怎麼算贏
  const rule = L(`After ${S.maxRounds} rounds, whoever has the highest total assets wins.`, `${S.maxRounds} 回合結束時,總資產最高的人獲勝。`);
  await cardPanel(L('How to win', '獲勝條件'),
    rule + L(` Total assets = cash + the value of your holdings − loans. Everyone starts with $${fmt(START_CASH)}.<br><br>The missions on the left are a bonus: each one pays $${REWARD}, and the more you finish the more stars you get. They do not decide the winner.<br><br>Your current place is shown next to the round bar.`,
      `總資產 = 現金 + 持有資產的市值 − 貸款,每個人都從 $${fmt(START_CASH)} 開始。<br><br>左邊的任務是加分項:每完成一個得 $${REWARD},完成越多星星越多,但不決定輸贏。<br><br>回合條旁邊會顯示你目前第幾名。`));
  S.busy = false; showCtl(true);
  if (S.nh > 1) toast(L(`${nameOf(S.players[0])} goes first (Player 1)`, `${nameOf(S.players[0])}先走(玩家 1)`));
}

$('rollBtn').onclick = () => turn();
document.addEventListener('click', (e) => { if (e.target.closest('button')) sfx('click'); });
{ const b = $('sndBtn'), paint = () => { b.classList.toggle('off', !AU.on); b.setAttribute('aria-label', AU.on ? 'sound on' : 'sound off'); };
  b.onclick = () => { AU.toggle(); paint(); }; paint(); }
$('bagBtn').onclick = bagPanel;
document.querySelectorAll('#dsel button').forEach((b) => { b.onclick = () => { if (S.busy) return; S.diceN = +b.dataset.n; hud(); }; });
$('mapBtn').onclick = () => { pan.set(0, 0, 0); view.overview = !view.overview; $('mapBtn').classList.toggle('on', view.overview); };

if (new URLSearchParams(location.search).get('embed')) document.body.classList.add('embed');   // 嵌在街機裡:右上角留位置給離開鈕
// 右側兩個面板的標題可以點:三角箭頭收合 / 展開
document.querySelectorAll('.side > .box h4').forEach((h) => { h.onclick = () => h.parentElement.classList.toggle('fold'); });
resize(); start();
requestAnimationFrame(loop);
window.__game = { get S() { return S; }, AU, EVENTS, applyEvent, instantiate, turn, enterLane, tiles, dice, piece, bearPiece, PIECES, bagPanel, aiAssets, assetsOf, get CFG() { return CFG; }, view, TILES, slots, stageSelect };
