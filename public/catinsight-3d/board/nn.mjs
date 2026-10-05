// 神經網路推論(純 JavaScript,不用任何函式庫):讀 tools/nn/train_policy.py 匯出的權重,做多層感知器的前向計算。
// 第一層已經把特徵標準化併進去了,直接吃 sim.features() 的原始數字。瀏覽器、Web Worker、Node 都能用
export function makePolicy(m) {
  const prep = (L) => ({ in: L.in, out: L.out, w: Float32Array.from(L.w), b: Float32Array.from(L.b) });
  const layers = m.layers.map(prep), trade = prep(m.trade), dice = prep(m.dice);
  function dense(L, x, relu) {
    const o = new Float32Array(L.out);
    for (let j = 0; j < L.out; j++) { let s = L.b[j]; const off = j * L.in; for (let i = 0; i < L.in; i++) s += L.w[off + i] * x[i]; o[j] = relu && s < 0 ? 0 : s; }
    return o;
  }
  const body = (x) => layers.reduce((h, L) => dense(L, h, true), x);
  return { trade: (x) => dense(trade, body(x), false), dice: (x) => dense(dice, body(x), false), meta: { trained: m.trained, val: m.val } };
}
