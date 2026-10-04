# tools

- `tournament.mjs` — 讓三種電腦對手(rule 規則式 / ev 期望值 / mc 蒙地卡羅)在 `sim.mjs` 裡互打,算勝率和平均資產。
  `node tools/tournament.mjs [局數] [回合] [mc 模擬次數] [mc 深度] [評分 lead|own|mix] ["ev,mc;rule,ev,mc"]`
  `SLIP=1` 可以測「成交價用推動後的價格」這個規則變體。
- `bench.mjs` — 量一次蒙地卡羅決策要幾毫秒。
- `tournament-results.txt` — 最近一次 100 局的結果。
