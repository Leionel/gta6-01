// The simulation: the player, traffic, pedestrians, police, the wanted
// system, and the street economy (taxis, hidden packages, rampages).
// Everything the game draws comes from the state built here.

import { WORLD, ECONOMY, PLAYER_TUNE, CAR_TUNE, TRAFFIC_TUNE, WANTED_TUNE, PLACES, PALETTE } from './constants.js';
import { clamp, lerp, dist, angleDelta, turnToward, astar, nearestNode } from './util.js';
import { onRoad, resolveCircle, blockedSight, randomRoadPoint, randomSidewalkPoint } from './map.js';
import { ACT } from './controls.js';

let nextCarId = 1;

export function createSim(city, rng, sound) {
  const sim = {
    city, rng, sound,
    time: 0,
    player: {
      x: city.playerSpawn.x, y: city.playerSpawn.y, angle: -Math.PI / 2,
      hp: PLAYER_TUNE.hp, cash: ECONOMY.startCash,
      car: null, hasGun: false, ammo: 0,
      punchCd: 0, gunCd: 0, downT: 0,
    },
    cars: [],
    peds: [],
    cops: [],
    wanted: { stars: 0, unseen: 0, lastSeenAt: 0 },
    taxi: { passenger: null, dest: null, waitT: 4 },
    rampage: { kills: 0, windowT: 0 },
    shots: [], // {x1,y1,x2,y2,ttl} tracer lines
    particles: [], // {x,y,vx,vy,ttl,colour,size}
    banners: [], // {text, ttl, colour}
    events: [], // {kind, ...} consumed by the engine/story
    busted: false,
    wasted: false,
    stats: { crimes: 0, pedsDown: 0, fares: 0, packages: 0 },
  };

  // Parked cars from the city's spots (the Comet GT is one of them).
  for (const spot of city.parkedSpots) {
    sim.cars.push(makeCar(sim, spot.model, spot.colour, spot.x, spot.y, spot.angle, 'parked'));
  }
  // Traffic.
  for (let i = 0; i < TRAFFIC_TUNE.count; i++) {
    const p = randomRoadPoint(rng);
    const car = makeCar(sim, 'sedan', PALETTE.carColours[i % PALETTE.carColours.length], p.x, p.y, rng() * Math.PI * 2, 'traffic');
    car.cruise = TRAFFIC_TUNE.cruiseMin + rng() * (TRAFFIC_TUNE.cruiseMax - TRAFFIC_TUNE.cruiseMin);
    car.node = nearestNode(city.nodes, p.x, p.y);
    car.next = pickNextNode(city, car.node, rng);
    sim.cars.push(car);
  }
  // Pedestrians.
  for (let i = 0; i < TRAFFIC_TUNE.pedCount; i++) {
    const p = randomSidewalkPoint(rng);
    sim.peds.push({
      x: p.x, y: p.y, angle: rng() * Math.PI * 2,
      speed: TRAFFIC_TUNE.pedSpeedMin + rng() * (TRAFFIC_TUNE.pedSpeedMax - TRAFFIC_TUNE.pedSpeedMin),
      state: 'walk', tx: p.x, ty: p.y, downT: 0, fleeT: 0, waitT: 0,
      colour: PALETTE.carColours[Math.floor(rng() * PALETTE.carColours.length)],
      taxi: false, id: i,
    });
  }
  return sim;
}

function makeCar(sim, model, colour, x, y, angle, kind) {
  return {
    id: nextCarId++, kind, model, colour,
    x, y, angle, speed: 0, vx: 0, vy: 0,
    hp: CAR_TUNE.carHp, maxHp: CAR_TUNE.carHp,
    node: 0, next: 0, cruise: 150, waitT: 0,
    topSpeed: model === 'comet' ? CAR_TUNE.cometTopSpeed : CAR_TUNE.topSpeed,
    driver: kind === 'traffic',
    wrecked: false,
  };
}

function pickNextNode(city, from, rng) {
  const links = city.nodes[from].links;
  return links[Math.floor(rng() * links.length)];
}

// --- crimes and heat ---------------------------------------------------------

function witnessCheck(sim, x, y) {
  // A ped or a cop with a clear view of the spot calls it in.
  for (const ped of sim.peds) {
    if (ped.state === 'down') continue;
    if (dist(ped.x, ped.y, x, y) < TRAFFIC_TUNE.witnessRange && !blockedSight(sim.city, ped.x, ped.y, x, y)) return true;
  }
  for (const cop of sim.cops) {
    if (dist(cop.x, cop.y, x, y) < TRAFFIC_TUNE.witnessRange) return true;
  }
  for (const car of sim.cars) {
    if (car.kind === 'police' && dist(car.x, car.y, x, y) < TRAFFIC_TUNE.witnessRange) return true;
  }
  return false;
}

export function addHeat(sim, n, why) {
  if (n <= 0) return;
  sim.wanted.stars = clamp(sim.wanted.stars + n, 0, WANTED_TUNE.maxStars);
  sim.wanted.unseen = 0;
  sim.wanted.lastSeenAt = sim.time;
  sim.stats.crimes++;
  sim.events.push({ kind: 'heat', stars: sim.wanted.stars, why });
}

export function reportCrime(sim, x, y, stars) {
  if (witnessCheck(sim, x, y)) {
    addHeat(sim, stars, 'witnessed');
    return true;
  }
  return false;
}

function burst(sim, x, y, colour, n, speed) {
  for (let i = 0; i < n; i++) {
    const a = sim.rng() * Math.PI * 2;
    const s = speed * (0.4 + sim.rng() * 0.8);
    sim.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, ttl: 0.5 + sim.rng() * 0.4, colour, size: 2 + sim.rng() * 3 });
  }
}

// --- the main step ------------------------------------------------------------

export function stepSim(sim, input, dt) {
  sim.time += dt;
  const p = sim.player;
  p.punchCd = Math.max(0, p.punchCd - dt);
  p.gunCd = Math.max(0, p.gunCd - dt);

  if (p.car) stepDriving(sim, input, dt);
  else stepOnFoot(sim, input, dt);

  stepTraffic(sim, dt);
  stepPeds(sim, dt);
  stepPolice(sim, dt);
  stepWanted(sim, dt);
  stepEconomy(sim, dt);

  // Decay tracers, particles and banners.
  for (const s of sim.shots) s.ttl -= dt;
  sim.shots = sim.shots.filter((s) => s.ttl > 0);
  for (const pt of sim.particles) {
    pt.x += pt.vx * dt;
    pt.y += pt.vy * dt;
    pt.ttl -= dt;
  }
  sim.particles = sim.particles.filter((pt) => pt.ttl > 0);
  for (const b of sim.banners) b.ttl -= dt;
  sim.banners = sim.banners.filter((b) => b.ttl > 0);

  // Engine and siren follow the action.
  const speed01 = p.car ? Math.abs(p.car.speed) / p.car.topSpeed : 0;
  sim.sound.engine(p.car ? speed01 : 0);
  sim.sound.siren(sim.wanted.stars > 0 && sim.cars.some((c) => c.kind === 'police'));

  if (p.hp <= 0 && !sim.wasted) {
    sim.wasted = true;
    sim.events.push({ kind: 'wasted' });
  }
}

function stepOnFoot(sim, input, dt) {
  const p = sim.player;
  const mv = input.move;
  const len = Math.hypot(mv.x, mv.y);
  if (len > 0.01) {
    const nx = mv.x / len;
    const ny = mv.y / len;
    p.angle = Math.atan2(ny, nx);
    const r = resolveCircle(sim.city, p.x + nx * PLAYER_TUNE.walkSpeed * dt, p.y + ny * PLAYER_TUNE.walkSpeed * dt, 14);
    p.x = r.x;
    p.y = r.y;
  }
  // Slow health recovery while nobody is watching.
  if (sim.wanted.stars === 0 && p.hp < PLAYER_TUNE.hp) {
    p.hp = Math.min(PLAYER_TUNE.hp, p.hp + PLAYER_TUNE.hpRegen * dt);
  }
  const acts = input.actions;
  if (acts & ACT.ENTER) tryEnterCar(sim);
  if (acts & ACT.PUNCH) tryPunch(sim);
  if (acts & ACT.SHOOT) tryShoot(sim);
  if (acts & ACT.HORN) sim.sound.horn();
}

function nearestCar(sim, x, y, maxD, filter) {
  let best = null;
  let bd = maxD;
  for (const car of sim.cars) {
    if (filter && !filter(car)) continue;
    const d = dist(x, y, car.x, car.y);
    if (d < bd) {
      bd = d;
      best = car;
    }
  }
  return best;
}

function tryEnterCar(sim) {
  const p = sim.player;
  const car = nearestCar(sim, p.x, p.y, PLAYER_TUNE.stealRange, (c) => !c.wrecked && Math.abs(c.speed) < 30);
  if (!car) return;
  p.car = car;
  car.driver = true;
  car.kind = car.kind === 'police' ? 'police' : car.kind === 'traffic' ? 'player' : car.kind;
  if (car.model === 'comet') {
    sim.events.push({ kind: 'stoleComet', car });
    reportCrime(sim, p.x, p.y, 1);
  } else if (car.kind === 'player') {
    reportCrime(sim, p.x, p.y, 1);
    sim.events.push({ kind: 'stoleCar', car });
  } else if (car.kind === 'police') {
    reportCrime(sim, p.x, p.y, 2);
    sim.events.push({ kind: 'stoleCar', car });
  }
  sim.sound.click();
}

export function exitCar(sim) {
  const p = sim.player;
  if (!p.car) return;
  const car = p.car;
  car.speed = 0;
  car.vx = 0;
  car.vy = 0;
  if (car.kind === 'player') car.kind = 'parked';
  p.x = car.x + Math.cos(car.angle + Math.PI / 2) * 30;
  p.y = car.y + Math.sin(car.angle + Math.PI / 2) * 30;
  const r = resolveCircle(sim.city, p.x, p.y, 14);
  p.x = r.x;
  p.y = r.y;
  p.car = null;
}

function tryPunch(sim) {
  const p = sim.player;
  if (p.punchCd > 0) return;
  p.punchCd = PLAYER_TUNE.punchCooldown;
  sim.sound.punch();
  let hit = null;
  let bd = PLAYER_TUNE.punchRange;
  for (const ped of sim.peds) {
    if (ped.state === 'down' || ped.state === 'ride') continue;
    const d = dist(p.x, p.y, ped.x, ped.y);
    if (d > bd) continue;
    const ang = Math.atan2(ped.y - p.y, ped.x - p.x);
    if (Math.abs(angleDelta(p.angle, ang)) > 1.2) continue;
    bd = d;
    hit = ped;
  }
  if (hit) {
    downPed(sim, hit, 'punch');
    burst(sim, hit.x, hit.y, '#ffd32a', 8, 120);
  }
}

function tryShoot(sim) {
  const p = sim.player;
  if (p.gunCd > 0 || !p.hasGun || p.ammo <= 0) {
    if (p.hasGun && p.ammo <= 0) sim.sound.denied();
    return;
  }
  p.gunCd = PLAYER_TUNE.gunCooldown;
  p.ammo--;
  sim.sound.shot();
  const fx = Math.cos(p.angle);
  const fy = Math.sin(p.angle);
  const ex = p.x + fx * PLAYER_TUNE.gunRange;
  const ey = p.y + fy * PLAYER_TUNE.gunRange;
  sim.shots.push({ x1: p.x, y1: p.y, x2: ex, y2: ey, ttl: 0.12 });
  let hit = null;
  let bd = PLAYER_TUNE.gunRange;
  const candidates = [...sim.peds.filter((q) => q.state !== 'down'), ...sim.cops];
  for (const q of candidates) {
    const rx = q.x - p.x;
    const ry = q.y - p.y;
    const along = rx * fx + ry * fy;
    if (along < 0 || along > bd) continue;
    const perp = Math.abs(rx * fy - ry * fx);
    if (perp > 22) continue;
    if (blockedSight(sim.city, p.x, p.y, q.x, q.y)) continue;
    bd = along;
    hit = q;
  }
  if (hit) {
    if (hit.state !== undefined && 'downT' in hit) downPed(sim, hit, 'shot');
    else {
      hit.hp = (hit.hp ?? 100) - PLAYER_TUNE.gunDamage;
      burst(sim, hit.x, hit.y, '#e74c3c', 10, 140);
      if (hit.hp <= 0) {
        sim.cops = sim.cops.filter((c) => c !== hit);
        sim.stats.pedsDown++;
        reportCrime(sim, hit.x, hit.y, 2);
      }
    }
  }
  reportCrime(sim, p.x, p.y, 1);
}

function downPed(sim, ped, how) {
  ped.state = 'down';
  ped.downT = 4;
  sim.stats.pedsDown++;
  sim.rampage.kills++;
  sim.rampage.windowT = ECONOMY.rampageWindow;
  if (how === 'punch' || how === 'shot') reportCrime(sim, ped.x, ped.y, how === 'shot' ? 1 : 1);
  if (how === 'car') reportCrime(sim, ped.x, ped.y, 2);
  sim.events.push({ kind: 'pedDown', ped, how });
  // Nearby pedestrians flee and may report the crime.
  for (const other of sim.peds) {
    if (other === ped || other.state === 'down') continue;
    if (dist(other.x, other.y, ped.x, ped.y) < 220) {
      other.state = 'flee';
      other.fleeT = 2 + sim.rng() * 2;
    }
  }
}

// --- driving -------------------------------------------------------------------

function stepDriving(sim, input, dt) {
  const p = sim.player;
  const car = p.car;
  const acts = input.actions;
  if (acts & ACT.ENTER) {
    exitCar(sim);
    return;
  }
  if (acts & ACT.HORN) sim.sound.horn();

  const steer = input.move.x; // -1 left, +1 right
  const fwd = { x: Math.cos(car.angle), y: Math.sin(car.angle) };
  let along = car.vx * fwd.x + car.vy * fwd.y;

  if (input.throttle) along += CAR_TUNE.accel * dt;
  if (input.brake) {
    along -= (along > 0 ? CAR_TUNE.brake : CAR_TUNE.reverseAccel) * dt;
    if (along < 0 && along > -CAR_TUNE.reverseTop) along = Math.max(along, -CAR_TUNE.reverseTop);
  }
  along *= Math.exp(-CAR_TUNE.drag * dt);
  along = clamp(along, -CAR_TUNE.reverseTop, car.topSpeed);

  const speedFactor = clamp(Math.abs(along) / 130, 0, 1) * (1 - CAR_TUNE.steerSpeedFalloff * Math.abs(along) / car.topSpeed);
  const turn = steer * CAR_TUNE.steerRate * speedFactor * dt * Math.sign(along || 1);
  car.angle += turn;

  const nfwd = { x: Math.cos(car.angle), y: Math.sin(car.angle) };
  const lat = { x: car.vx - (car.vx * nfwd.x + car.vy * nfwd.y) * nfwd.x, y: car.vy - (car.vx * nfwd.x + car.vy * nfwd.y) * nfwd.y };
  const grip = input.handbrake ? CAR_TUNE.driftGrip : CAR_TUNE.grip;
  const decay = Math.exp(-grip * dt);
  lat.x *= decay;
  lat.y *= decay;
  car.vx = nfwd.x * along + lat.x;
  car.vy = nfwd.y * along + lat.y;
  car.speed = along;

  const nx = car.x + car.vx * dt;
  const ny = car.y + car.vy * dt;
  const impact = Math.abs(along);
  const r = resolveCircle(sim.city, nx, ny, 17);
  if (r.hit) {
    if (impact > CAR_TUNE.crashSpeed) {
      damageCar(sim, car, CAR_TUNE.crashDamage, 'building');
      sim.sound.crash();
      burst(sim, r.x, r.y, '#f39c12', 12, 180);
    }
    car.vx *= 0.35;
    car.vy *= 0.35;
    car.speed *= 0.35;
  }
  car.x = r.x;
  car.y = r.y;
  p.x = car.x;
  p.y = car.y;
  p.angle = car.angle;

  // Running a pedestrian over is a crime when someone sees it.
  for (const ped of sim.peds) {
    if (ped.state === 'down' || ped.state === 'ride') continue;
    if (dist(car.x, car.y, ped.x, ped.y) < 20 && Math.abs(along) > 80) {
      downPed(sim, ped, 'car');
      burst(sim, ped.x, ped.y, '#e74c3c', 10, 150);
    }
  }
  // Car-to-car bumps.
  for (const other of sim.cars) {
    if (other === car || other.wrecked) continue;
    const d = dist(car.x, car.y, other.x, other.y);
    if (d < 34 && d > 0.01) {
      const push = (34 - d) / 2;
      const nx2 = (other.x - car.x) / d;
      const ny2 = (other.y - car.y) / d;
      car.x -= nx2 * push;
      car.y -= ny2 * push;
      other.x += nx2 * push;
      other.y += ny2 * push;
      const rel = Math.abs(along - other.speed);
      if (rel > 200) {
        damageCar(sim, car, 8, 'traffic');
        damageCar(sim, other, 8, 'traffic');
        sim.sound.crash();
      }
      car.vx *= 0.7;
      car.vy *= 0.7;
    }
  }
}

function damageCar(sim, car, amount, why) {
  if (car.wrecked) return;
  car.hp -= amount;
  if (car.hp <= 0) {
    car.hp = 0;
    car.wrecked = true;
    car.speed = 0;
    car.vx = 0;
    car.vy = 0;
    burst(sim, car.x, car.y, '#7f8c8d', 24, 220);
    sim.sound.crash();
    sim.events.push({ kind: 'carWrecked', car, why });
    if (sim.player.car === car) {
      // The player is thrown out on foot.
      sim.player.car = null;
      sim.player.x = car.x + 30;
      sim.player.y = car.y + 30;
      sim.player.hp = Math.max(1, sim.player.hp - 15);
    }
  }
}

// --- traffic ---------------------------------------------------------------------

function stepTraffic(sim, dt) {
  for (const car of sim.cars) {
    if (car.kind !== 'traffic') continue;
    if (car.wrecked) continue;
    const target = sim.city.nodes[car.next];
    const tx = target.x;
    const ty = target.y;
    const d = dist(car.x, car.y, tx, ty);
    if (d < 26) {
      car.node = car.next;
      car.next = pickNextNode(sim.city, car.node, sim.rng);
      continue;
    }
    // Brake for anything in the way ahead.
    const fx = Math.cos(car.angle);
    const fy = Math.sin(car.angle);
    let blocked = false;
    for (const other of sim.cars) {
      if (other === car || other.wrecked) continue;
      const rx = other.x - car.x;
      const ry = other.y - car.y;
      const along = rx * fx + ry * fy;
      if (along > 0 && along < TRAFFIC_TUNE.brakeGap && Math.abs(rx * fy - ry * fx) < 26) { blocked = true; break; }
    }
    if (!blocked) {
      for (const ped of sim.peds) {
        if (ped.state === 'down' || ped.state === 'ride') continue;
        const rx = ped.x - car.x;
        const ry = ped.y - car.y;
        const along = rx * fx + ry * fy;
        if (along > 0 && along < TRAFFIC_TUNE.brakeGap && Math.abs(rx * fy - ry * fx) < 24) { blocked = true; break; }
      }
    }
    // The player on foot, standing in the road, makes traffic stop.
    const p = sim.player;
    if (!p.car) {
      const rx = p.x - car.x;
      const ry = p.y - car.y;
      const along = rx * fx + ry * fy;
      if (along > 0 && along < TRAFFIC_TUNE.brakeGap && Math.abs(rx * fy - ry * fx) < 24) blocked = true;
    }
    const wantAngle = Math.atan2(ty - car.y, tx - car.x);
    car.angle = turnToward(car.angle, wantAngle, 2.2 * dt);
    const targetSpeed = blocked ? 0 : car.cruise;
    car.speed = lerp(car.speed, targetSpeed, clamp(1.6 * dt, 0, 1));
    car.vx = Math.cos(car.angle) * car.speed;
    car.vy = Math.sin(car.angle) * car.speed;
    const r = resolveCircle(sim.city, car.x + car.vx * dt, car.y + car.vy * dt, 16);
    car.x = r.x;
    car.y = r.y;
    if (r.hit) {
      car.angle += Math.PI / 2;
      car.node = nearestNode(sim.city.nodes, car.x, car.y);
      car.next = pickNextNode(sim.city, car.node, sim.rng);
    }
  }
}

// --- pedestrians -----------------------------------------------------------------

function stepPeds(sim, dt) {
  for (const ped of sim.peds) {
    if (ped.state === 'down') {
      ped.downT -= dt;
      if (ped.downT <= 0) {
        ped.state = 'flee';
        ped.fleeT = 3;
      }
      continue;
    }
    if (ped.state === 'ride') continue;
    if (ped.state === 'flee') {
      ped.fleeT -= dt;
      // Run away from the nearest car.
      let threat = null;
      let bd = 320;
      for (const car of sim.cars) {
        const d = dist(ped.x, ped.y, car.x, car.y);
        if (d < bd) { bd = d; threat = car; }
      }
      const p = sim.player;
      if (!p.car && dist(ped.x, ped.y, p.x, p.y) < bd) { bd = dist(ped.x, ped.y, p.x, p.y); threat = p; }
      if (threat) {
        const away = Math.atan2(ped.y - threat.y, ped.x - threat.x);
        ped.angle = away;
        const r = resolveCircle(sim.city, ped.x + Math.cos(away) * TRAFFIC_TUNE.fleeSpeed * dt, ped.y + Math.sin(away) * TRAFFIC_TUNE.fleeSpeed * dt, 10);
        ped.x = r.x;
        ped.y = r.y;
      }
      if (ped.fleeT <= 0) ped.state = 'walk';
      continue;
    }
    // Walking: head for the waypoint, pick a new one on arrival.
    const d = dist(ped.x, ped.y, ped.tx, ped.ty);
    if (d < 14) {
      const np = randomSidewalkPoint(sim.rng);
      ped.tx = np.x;
      ped.ty = np.y;
      ped.waitT = sim.rng() < 0.25 ? 1 + sim.rng() * 2 : 0;
    }
    if (ped.waitT > 0) {
      ped.waitT -= dt;
      continue;
    }
    const want = Math.atan2(ped.ty - ped.y, ped.tx - ped.x);
    ped.angle = turnToward(ped.angle, want, 5 * dt);
    const r = resolveCircle(sim.city, ped.x + Math.cos(ped.angle) * ped.speed * dt, ped.y + Math.sin(ped.angle) * ped.speed * dt, 10);
    ped.x = r.x;
    ped.y = r.y;
    // A fast car bearing down makes a pedestrian flee.
    for (const car of sim.cars) {
      if (car.kind === 'parked' || car.wrecked) continue;
      if (Math.abs(car.speed) > 140 && dist(ped.x, ped.y, car.x, car.y) < 110) {
        ped.state = 'flee';
        ped.fleeT = 2;
        break;
      }
    }
  }
}

// --- police -----------------------------------------------------------------------

function stepPolice(sim, dt) {
  const stars = sim.wanted.stars;
  const wantCars = clamp(stars * WANTED_TUNE.policeCarPerStar, 0, WANTED_TUNE.policeCarCap);
  const wantCops = stars >= 2 ? clamp(stars - 1, 0, WANTED_TUNE.footCopCap) : 0;
  const p = sim.player;

  // Spawn police cars at the HQ road, or near the player when the heat is on.
  const liveCars = sim.cars.filter((c) => c.kind === 'police' && !c.wrecked);
  if (liveCars.length < wantCars) {
    const spawn = stars <= 1 ? { x: PLACES.police.mx, y: PLACES.police.my } : { x: p.x + (sim.rng() - 0.5) * 700, y: p.y + (sim.rng() - 0.5) * 700 };
    const r = resolveCircle(sim.city, spawn.x, spawn.y, 18);
    const car = makeCar(sim, 'sedan', PALETTE.policeBody, r.x, r.y, sim.rng() * Math.PI * 2, 'police');
    car.cruise = 300;
    car.node = nearestNode(sim.city.nodes, r.x, r.y);
    car.replanT = 0;
    car.route = [];
    sim.cars.push(car);
  }
  while (sim.cops.length < wantCops) {
    const a = sim.rng() * Math.PI * 2;
    const r = resolveCircle(sim.city, p.x + Math.cos(a) * 260, p.y + Math.sin(a) * 260, 12);
    sim.cops.push({ x: r.x, y: r.y, angle: a, speed: WANTED_TUNE.copSpeed, touchT: 0, hp: 100 });
  }
  if (stars === 0) {
    // Everyone stands down and drives off.
    for (const car of sim.cars) if (car.kind === 'police') car.kind = 'leaving';
    sim.cops = [];
  }
  for (const car of sim.cars) {
    if (car.kind === 'leaving') {
      car.cruise = 220;
      const target = sim.city.nodes[car.next ?? car.node];
      const want = Math.atan2(target.y - car.y, target.x - car.x);
      car.angle = turnToward(car.angle, want, 2.4 * dt);
      car.speed = lerp(car.speed, car.cruise, dt);
      car.vx = Math.cos(car.angle) * car.speed;
      car.vy = Math.sin(car.angle) * car.speed;
      car.x += car.vx * dt;
      car.y += car.vy * dt;
      if (dist(car.x, car.y, PLACES.police.mx, PLACES.police.my) < 120) {
        sim.cars = sim.cars.filter((c) => c !== car);
      }
      continue;
    }
    if (car.kind !== 'police' || car.wrecked) continue;
    car.replanT = (car.replanT ?? 0) - dt;
    const playerNode = nearestNode(sim.city.nodes, p.x, p.y);
    if (car.replanT <= 0 || !car.route || car.route.length === 0) {
      car.replanT = WANTED_TUNE.chaseReplan;
      const from = nearestNode(sim.city.nodes, car.x, car.y);
      car.route = astar(sim.city.nodes, from, playerNode);
      car.routeI = 1;
    }
    const dPlayer = dist(car.x, car.y, p.x, p.y);
    let want;
    if (dPlayer < 170) {
      // Close enough to ram: steer straight at the player.
      want = Math.atan2(p.y - car.y, p.x - car.x);
    } else if (car.route && car.routeI < car.route.length) {
      const node = sim.city.nodes[car.route[car.routeI]];
      want = Math.atan2(node.y - car.y, node.x - car.x);
      if (dist(car.x, car.y, node.x, node.y) < 30) car.routeI++;
    } else {
      want = Math.atan2(p.y - car.y, p.x - car.x);
    }
    car.angle = turnToward(car.angle, want, 3.0 * dt);
    const targetSpeed = dPlayer < 170 ? 330 : 300;
    car.speed = lerp(car.speed, targetSpeed, clamp(2.2 * dt, 0, 1));
    car.vx = Math.cos(car.angle) * car.speed;
    car.vy = Math.sin(car.angle) * car.speed;
    const r = resolveCircle(sim.city, car.x + car.vx * dt, car.y + car.vy * dt, 17);
    car.x = r.x;
    car.y = r.y;
    // Ramming the player hurts: ~11.5 damage per second of contact.
    if (dPlayer < 40) {
      if (p.car) {
        damageCar(sim, p.car, CAR_TUNE.ramDamagePerSec * dt, 'police');
        p.car.vx += Math.cos(car.angle) * 60 * dt;
        p.car.vy += Math.sin(car.angle) * 60 * dt;
      } else {
        p.hp -= CAR_TUNE.ramDamagePerSec * dt;
        burst(sim, p.x, p.y, '#e74c3c', 2, 80);
      }
    }
  }
  // Foot cops run the player down.
  for (const cop of [...sim.cops]) {
    const d = dist(cop.x, cop.y, p.x, p.y);
    if (p.car) {
      // Cops cannot catch a car; they hold position.
      continue;
    }
    const want = Math.atan2(p.y - cop.y, p.x - cop.x);
    cop.angle = turnToward(cop.angle, want, 6 * dt);
    const r = resolveCircle(sim.city, cop.x + Math.cos(cop.angle) * cop.speed * dt, cop.y + Math.sin(cop.angle) * cop.speed * dt, 12);
    cop.x = r.x;
    cop.y = r.y;
    if (d < 28) {
      cop.touchT += dt;
      if (cop.touchT >= WANTED_TUNE.copTouchTime && !sim.busted) {
        sim.busted = true;
        sim.events.push({ kind: 'busted' });
      }
    } else {
      cop.touchT = 0;
    }
  }
}

function stepWanted(sim, dt) {
  const w = sim.wanted;
  if (w.stars === 0) return;
  const p = sim.player;
  // Seen if a police car or cop is close with a clear view.
  let seen = false;
  for (const car of sim.cars) {
    if (car.kind !== 'police') continue;
    if (dist(car.x, car.y, p.x, p.y) < WANTED_TUNE.sightRange && !blockedSight(sim.city, car.x, car.y, p.x, p.y)) { seen = true; break; }
  }
  if (!seen) {
    for (const cop of sim.cops) {
      if (dist(cop.x, cop.y, p.x, p.y) < WANTED_TUNE.sightRange) { seen = true; break; }
    }
  }
  if (seen) {
    w.unseen = 0;
    w.lastSeenAt = sim.time;
  } else {
    w.unseen += dt;
    if (w.unseen >= WANTED_TUNE.decayDelay) {
      w.stars = Math.max(0, w.stars - 1);
      w.unseen = 0;
      sim.events.push({ kind: 'heatDrop', stars: w.stars });
    }
  }
}

// --- street economy -----------------------------------------------------------------

function stepEconomy(sim, dt) {
  const p = sim.player;
  // Rampage window.
  if (sim.rampage.windowT > 0) {
    sim.rampage.windowT -= dt;
    if (sim.rampage.windowT <= 0) sim.rampage.kills = 0;
  } else if (sim.rampage.kills >= ECONOMY.rampageKills) {
    sim.rampage.kills = 0;
  }
  if (sim.rampage.kills >= ECONOMY.rampageKills && sim.rampage.windowT > 0) {
    p.cash += ECONOMY.rampageBonus;
    sim.rampage.kills = 0;
    sim.rampage.windowT = 0;
    sim.banners.push({ text: `RAMPAGE! +$${ECONOMY.rampageBonus}`, ttl: 2.5, colour: '#e74c3c' });
    sim.sound.jingle();
    sim.events.push({ kind: 'rampage' });
  }
  // Hidden packages.
  for (const pack of sim.city.packages) {
    if (pack.taken) continue;
    if (dist(p.x, p.y, pack.x, pack.y) < 30) {
      pack.taken = true;
      p.cash += ECONOMY.packageValue;
      sim.stats.packages++;
      sim.banners.push({ text: `Hidden package +$${ECONOMY.packageValue}`, ttl: 2, colour: '#f2b705' });
      sim.sound.pickup();
      burst(sim, pack.x, pack.y, '#f2b705', 12, 120);
    }
  }
  // Taxi: a passenger waits, boards when the player drives up, pays on delivery.
  const taxi = sim.taxi;
  taxi.waitT -= dt;
  if (!taxi.passenger && taxi.waitT <= 0) {
    const spot = randomSidewalkPoint(sim.rng);
    const ped = sim.peds.find((q) => q.state === 'walk' && dist(q.x, q.y, spot.x, spot.y) < 200);
    if (ped) {
      ped.state = 'wait';
      ped.taxi = true;
      ped.tx = spot.x;
      ped.ty = spot.y;
      taxi.passenger = ped;
      taxi.dest = null;
    }
    taxi.waitT = 6;
  }
  if (taxi.passenger && !taxi.dest && p.car) {
    const ped = taxi.passenger;
    if (dist(p.car.x, p.car.y, ped.x, ped.y) < 46) {
      ped.state = 'ride';
      const dest = randomRoadPoint(sim.rng);
      taxi.dest = dest;
      sim.banners.push({ text: 'Passenger aboard — take them to the marker', ttl: 2.5, colour: '#0984e3' });
    }
  }
  if (taxi.passenger && taxi.dest && p.car) {
    if (dist(p.car.x, p.car.y, taxi.dest.x, taxi.dest.y) < 52) {
      const fare = ECONOMY.taxiFareMin + Math.floor(sim.rng() * (ECONOMY.taxiFareMax - ECONOMY.taxiFareMin));
      p.cash += fare;
      sim.stats.fares++;
      sim.banners.push({ text: `Fare +$${fare}`, ttl: 2, colour: '#00b894' });
      sim.sound.pickup();
      taxi.passenger.state = 'walk';
      taxi.passenger.taxi = false;
      const np = randomSidewalkPoint(sim.rng);
      taxi.passenger.tx = np.x;
      taxi.passenger.ty = np.y;
      taxi.passenger = null;
      taxi.dest = null;
      taxi.waitT = 8;
    }
  }
}

// --- helpers the story and the interface use ----------------------------------------

export function paySpray(sim) {
  const p = sim.player;
  if (p.cash < ECONOMY.sprayCost) return false;
  p.cash -= ECONOMY.sprayCost;
  sim.wanted.stars = 0;
  sim.wanted.unseen = 0;
  if (p.car) p.car.colour = PALETTE.carColours[Math.floor(sim.rng() * PALETTE.carColours.length)];
  sim.banners.push({ text: 'Clean — and a fresh coat of paint', ttl: 2, colour: '#17a398' });
  sim.sound.jingle();
  return true;
}

export function buyGun(sim) {
  const p = sim.player;
  if (p.hasGun) {
    if (p.cash < ECONOMY.ammoCost) return false;
    p.cash -= ECONOMY.ammoCost;
    p.ammo += ECONOMY.ammoPack;
    sim.sound.pickup();
    return true;
  }
  if (p.cash < ECONOMY.gunCost) return false;
  p.cash -= ECONOMY.gunCost;
  p.hasGun = true;
  p.ammo = ECONOMY.ammoPack;
  sim.sound.pickup();
  return true;
}

export function resetAfterArrest(sim) {
  const p = sim.player;
  const fine = clamp(Math.floor(p.cash * ECONOMY.bustFineRate), ECONOMY.bustFineMin, ECONOMY.bustFineMax);
  p.cash = Math.max(0, p.cash - fine);
  if (p.car) {
    p.car.kind = 'parked';
    p.car = null;
  }
  p.hp = PLAYER_TUNE.hp;
  p.x = PLACES.police.mx;
  p.y = PLACES.police.my + 60;
  sim.wanted.stars = 0;
  sim.wanted.unseen = 0;
  sim.cops = [];
  sim.busted = false;
  sim.wasted = false;
  return fine;
}
