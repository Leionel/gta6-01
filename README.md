[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/Leionel/gta6-01/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/Leionel/gta6-01/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

# Palm City — Sunset Heist

A top-down open-world crime game in the spirit of GTA 6, built for
make.fun's [gta6-01](https://make.fun/bounty/gta6-01) bounty. The city, the
characters, the cars, the story, the art and the sound are all original —
no Rockstar Games assets anywhere.

You are Rook, a getaway driver who owes Delia Voss $50,000. Five jobs stand
between you and a clean slate: steal a car, run a drop, shake a 3-star
wanted level, steal the Comet GT, and hit the bank.

## What's in Palm City

- A sun-soaked grid city, 2,880 × 2,880, with a beach, a marina, parks, a
  bank tower, a chop shop, a spray shop and a gun shop
- Driving and walking: sedans, taxis, sports cars, trucks and vans, any of
  them stealable — if anyone sees you take one, the cops will know
- Traffic that drives the road grid and pedestrians who walk the sidewalks
  and run when things get loud
- A wanted system: 1–5 stars, police cars and foot cops, escalation and
  escape, pay-n-spray to go clean
- Five story missions, plus taxi fares, hidden cash packages and rampages
- On-foot combat (punch, pistol), car chases, crashes, busted / wasted
- A live minimap, a HUD, synthesized engine / siren / gunshot audio, and a
  save in localStorage

## Controls

- WASD / arrows: move or drive · Shift: sprint · Space: handbrake
- E: enter / steal / exit a car · F: punch · G: shoot (buy a pistol first)
- P: pause · M: mute · R: restart

## Run it

```sh
node serve.ts
# open http://localhost:8080
```

`main.ts` (Node 22) copies `game/` and `screenshots/` to `/output` and
writes `/output/dossier.json` for the grader.
