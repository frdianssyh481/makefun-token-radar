# makefun-token-radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/frdianssyh481/makefun-token-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/frdianssyh481/makefun-token-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Token Radar, model radar-2: a program that reads a sealed DefiLlama snapshot of 758 protocols
and writes a web dashboard ranking the pre-token ones by what their launch would be worth —
each with the steps to farm it.

The board covers every protocol the watchlist rule keeps, without its $50M floor: the
watchlist's 40 plus 158 more below it. No wrapped, staked or bridged product is ranked —
WBTC, USDT0 and the bridges are off this board, as the field guide says. A pre-token
protocol is priced at what live tokens in its own category already trade at per dollar of
TVL (the category median mcap / TVL, shrunk toward the global median), times a growth
multiplier from its seven-day TVL change and a maturity multiplier from how long it has run
with no token:

```
implied = round(tvl_usd x multiple x (1 + clamp(change_7d, -60, 120) / 100 x 0.5)
                x (0.6 + min(age_days, 1095) / 1095 x 0.4))
```

The dashboard adds an early radar (young and fast-growing protocols, the launches to find
first), a model sandbox that re-ranks the board live, a live-token view set aside with the
market's own values, and a seven-step farm plan with costs and times for every row.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json>
```

(Node 22.18+; the program runs twice in grading and both runs write the same bytes.)

## Layout

- `main.ts` — the program: reads the snapshot, writes `board.json`, `data.js`, the
  dashboard, the screenshots and `dossier.json`
- `lib/model.ts` — the radar-2 model: comparable multiples, the board, the farm plans
- `dashboard/` — the static page (no network): board, detail view, filters, model sandbox
- `screenshots/` — the board, a protocol's detail view and a filtered view
- `vendor/makefun-board.ts` — make.fun's dossier library, byte for byte as the kit ships it

---

<sub>Entered on [make.fun](https://make.fun/?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
