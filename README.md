[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/Leionel/gta6-01/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/Leionel/gta6-01/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

# Palm City — Sunset Heist

An open-world crime game in the spirit of GTA 6, built for make.fun's
[gta6-01](https://make.fun/bounty/gta6-01) bounty. Everything is original:
the city, the characters, the vehicles, the names, the story, the art and
the sound. No Rockstar Games assets.

You are Rook, a getaway driver who owes Delia Voss $50,000. Five jobs stand
between you and a clean slate: steal a car, run a drop, lose a 3-star
wanted level, steal the Comet GT, and hit the bank.

## What's in the city

- A sun-soaked grid city (2,880 × 2,880) with a beach and marina, parks,
  a bank tower, a chop shop, a spray shop and a gun shop
- Driving on foot and by car: sedans, taxis, sports cars, trucks, vans —
  steal any of them (if anyone sees you, the cops will know)
- Traffic that drives the road grid and pedestrians who walk the sidewalks
  (and flee when things get loud)
- A wanted system: 1–5 stars, police cars and foot cops, escalation and
  escape, pay-n-spray to go clean
- Five story missions plus taxi fares, hidden cash packages and rampages
- Combat on foot (punch, pistol), car chases, crashes, busted / wasted
- A live minimap, HUD, synthesized engine / siren / gunshot sound, and a
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
