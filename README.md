[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/Leionel/gta6-01/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/Leionel/gta6-01/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

# Palm City — Sunset Heist

An original top-down open-world crime game in the spirit of GTA 6, built for
[make.fun's "Make GTA 6" bounty](https://make.fun/bounty/gta6-01) ($1,666 in
USDC). It plays offline in a desktop browser from static files under `game/`
— no network requests, no libraries, everything drawn and synthesized in code.

You are Rook, a getaway driver who owes Delia Voss $50,000. Palm City is a
2,880 × 2,880 open world: an 8×8 road grid with traffic and pedestrians, a
beach and a marina, eight named places (garage, chop shop, pay-n-spray, gun
shop, bank, safehouse, police HQ), and a wanted system with police cars and
foot cops. Five story missions pay the debt down, job by job, from $100 to
$3,550 — and taxis, hidden cash packages and rampages pay the rent in between.

## Play

```sh
node serve.ts   # then open http://localhost:8080
```

| Key | Action |
| --- | --- |
| WASD / arrows | Walk, drive, steer |
| E | Enter / steal a car |
| F | Punch |
| G | Shoot (after buying the pistol at the gun shop) |
| Space | Handbrake / drift |
| P or Esc | Pause |
| H | Horn |
| M | Mute |

## The five jobs

1. **Wheels** (+$150) — get a car, bring it to the chop shop.
2. **The Drop** (+$300) — a package, ninety seconds, no mistakes.
3. **Heat** (+$400) — make three stars, then vanish.
4. **The Collector** (+$600) — steal the pink Comet GT from the marina.
5. **The Big One** (+$500, then +$1,500) — rob the bank, lose four stars,
   reach the safehouse.

## Layout

- `game/index.html` — the page; `game/src/engine.js` — the loop and screens.
- `game/src/constants.js` — tuning, economy, mission definitions.
- `game/src/util.js` — seeded RNG, geometry, A\* pathfinding.
- `game/src/map.js` — the city: roads, blocks, buildings, beach, shops.
- `game/src/controls.js` — keyboard and mouse.
- `game/src/sound.js` — synthesized WebAudio (engine, sirens, gunshots).
- `game/src/actors.js` — player, traffic, pedestrians, police, wanted, economy.
- `game/src/story.js` — the five missions and the shop interactions.
- `game/src/interface.js` — world rendering, HUD, minimap, screens.
- `game/src/staging.js` — deterministic screenshot scenes and debug handles.
- `main.ts` — the hand-in program (copies `game/` + `screenshots/`, writes
   the dossier with the vendored `vendor/makefun-game.ts`).

## License

MIT — see [LICENSE](LICENSE).
