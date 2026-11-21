// Palm City simulation: the player (on foot / driving), traffic, pedestrians,
// police, the wanted level, missions, fares, pickups and particles. Fixed-step,
// deterministic from a seed.
import { WORLD, PLAYER, CAR, WANTED, ECONOMY, MISSIONS, STEP } from './config.js';
import {
  createCity, collideCircle, carHitsBuilding, isOnRoad, nearestRoadPoint,
  randomRoadPoint, ROAD_LINES, BEACH_X0, WATER_X0,
  nearestIntersection, roadPath,
} from './city.js';
import { createRandom } from './random.js';

// Event bits the loop reads back from stepWorld.
export const EV_MISSION = 1;
export const EV_BUSTED = 2;
export const EV_WASTED = 4;
export const EV_CASH = 8;
export const EV_WANTED_UP = 16;

const CAR_COLORS = ['#e74c3c', '#3498db', '#f1c40f', '#ecf0f1', '#2ecc71', '#9b59b6', '#e67e22', '#1abc9c', '#fd79a8', '#636e72'];
const PED_SHIRTS = ['#e74c3c', '#3498db', '#f1c40f', '#2ecc71', '#9b59b6', '#e67e22', '#fd79a8', '#00cec9', '#636e72', '#d63031'];

function dist(ax, ay, bx, by) {
  return Math.hypot(ax - bx, ay - by);
}
function angleTo(ax, ay, bx, by) {
  return Math.atan2(by - ay, bx - ax);
}
function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}
function turnToward(angle, target, maxStep) {
  let d = target - angle;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return angle + clamp(d, -maxStep, maxStep);
}

function makeCar(random, kind, x, y, angle, driver) {
  const spec = CAR[kind];
  return {
    id: Math.floor(random.next() * 1e9),
    kind, spec,
    x, y, angle,
    speed: 0, lat: 0, hp: spec.hp,
    color: kind === 'police' ? '#2c3e50' : random.pick(CAR_COLORS),
    driver, wreck: false, dead: false,
    // Traffic AI state.
    route: null, routeTarget: null, stuck: 0,
    // Police AI state.
    siren: false, copOut: false,
  };
}

function makePed(random, x, y) {
  return {
    x, y,
    angle: random.range(0, Math.PI * 2),
    speed: random.range(40, 70),
    shirt: random.pick(PED_SHIRTS),
    state: 'walk', // walk | flee | down | fare
    fleeTimer: 0, downTimer: 0, target: null, fare: false, wave: false,
  };
}

export function createWorld(seed) {
  const random = createRandom(seed);
  const city = createCity(random);
  const world = {
    random, city, time: 0,
    player: {
      // Spawn just south of the safehouse door, outside the mission-start
      // radius, so the title screen's living-city stepping never starts
      // mission 0 by itself.
      x: city.spots.safehouse.x, y: city.spots.safehouse.y - 54, angle: -Math.PI / 2,
      hp: PLAYER.health, cash: 100, pistol: false, ammo: 0,
      car: null, punchCd: 0, shootCd: 0, hurtCd: 0,
    },
    cars: [], peds: [], cops: [], particles: [], bullets: [], pickups: [],
    wanted: 0, heat: 0, lastSeen: 0, decayTimer: 0, spawnTimer: 0,
    missionIndex: 0, mission: null, taxi: null, rampage: null,
    stats: { earned: 0, busted: 0, wasted: 0, missions: 0, fares: 0 },
    message: '', messageTimer: 0, banner: '', bannerTimer: 0,
    camera: { x: 0, y: 0 },
    events: 0,
  };
  resetWorld(world);
  return world;
}

function resetWorld(world) {
  const { random, city } = world;
  world.cars = [];
  world.peds = [];
  world.cops = [];
  world.particles = [];
  world.bullets = [];
  world.pickups = [];
  world.wanted = 0;
  world.heat = 0;
  world.mission = null;
  world.taxi = null;
  world.rampage = null;
  world.time = 0;

  // Parked cars: a few on roads and lots, plus the Comet GT at the marina.
  for (let i = 0; i < 9; i += 1) {
    const p = randomRoadPoint(random);
    const kind = random.pick(['sedan', 'sedan', 'taxi', 'sports', 'van', 'truck']);
    const angle = random.chance(0.5) ? 0 : Math.PI / 2;
    const offset = random.chance(0.5) ? 16 : -16;
    world.cars.push(makeCar(
      random, kind,
      p.x + (angle === 0 ? 0 : offset), p.y + (angle === 0 ? offset : 0),
      angle + (random.chance(0.5) ? 0 : Math.PI),
      'parked',
    ));
  }
  const comet = makeCar(random, 'sports', city.spots.marina.x, city.spots.marina.y, Math.PI / 2, 'parked');
  comet.color = '#e84393';
  comet.special = 'comet';
  world.cars.push(comet);

  // Traffic.
  for (let i = 0; i < 11; i += 1) {
    const p = randomRoadPoint(random);
    const kind = random.pick(['sedan', 'sedan', 'taxi', 'van', 'truck']);
    const car = makeCar(random, kind, p.x, p.y, random.pick([0, Math.PI / 2, Math.PI, -Math.PI / 2]), 'traffic');
    car.speed = random.range(90, 150);
    assignRoute(world, car);
    world.cars.push(car);
  }

  // Pedestrians on sidewalks.
  for (let i = 0; i < 26; i += 1) {
    const p = randomRoadPoint(random);
    world.peds.push(makePed(random, p.x + random.range(-30, 30), p.y + random.range(-30, 30)));
  }

  // Hidden cash packages on sidewalks.
  for (let i = 0; i < 10; i += 1) {
    const p = randomRoadPoint(random);
    world.pickups.push({ x: p.x + random.range(-44, 44), y: p.y + random.range(-44, 44), value: 50, taken: false });
  }
}

// Give a traffic car a new destination: a random point on a random road, with a
// right-hand lane offset implied by the target's side.
function assignRoute(world, car) {
  const { random } = world;
  const line = random.pick(ROAD_LINES);
  const along = random.range(100, WORLD - 100);
  const horizontal = random.chance(0.5);
  car.routeTarget = horizontal ? { x: along, y: line } : { x: line, y: along };
  car.route = { horizontal, line };
}

function nearestCar(world, x, y, maxDist, filter) {
  let best = null;
  let bestD = maxDist;
  for (const c of world.cars) {
    if (c.wreck || c.dead) continue;
    if (filter && !filter(c)) continue;
    const d = dist(x, y, c.x, c.y);
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  return best;
}

function addParticles(world, x, y, n, color, speed = 120, life = 0.6, size = 3) {
  for (let i = 0; i < n; i += 1) {
    const a = world.random.range(0, Math.PI * 2);
    const s = world.random.range(speed * 0.3, speed);
    world.particles.push({
      x, y,
      vx: Math.cos(a) * s, vy: Math.sin(a) * s,
      life: world.random.range(life * 0.5, life), maxLife: life,
      color, size,
    });
  }
}

// A witnessed crime raises the wanted level (capped at 5) and the heat meter.
function crime(world, stars, why) {
  world.wanted = Math.min(5, world.wanted + stars);
  world.heat = Math.min(1, world.heat + 0.25 * stars);
  world.events |= EV_WANTED_UP;
  world.message = `Wanted: ${why}`;
  world.messageTimer = 2.2;
}

// A cop or a pedestrian close enough sees the crime.
function witnessedBy(world, x, y, radius) {
  for (const c of world.cops) {
    if (dist(x, y, c.x, c.y) < radius) return true;
  }
  for (const p of world.peds) {
    if (p.state !== 'down' && dist(x, y, p.x, p.y) < radius * 0.8) return true;
  }
  return false;
}

function distToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const l2 = dx * dx + dy * dy;
  let t = l2 === 0 ? 0 : ((px - x1) * dx + (py - y1) * dy) / l2;
  t = clamp(t, 0, 1);
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

function earn(world, amount, sfx) {
  world.player.cash += amount;
  world.stats.earned += amount;
  world.events |= EV_CASH;
  if (sfx) sfx.cash();
}

function stealCar(world, car, sfx) {
  const p = world.player;
  if (car.driver === 'traffic') {
    // The driver bails out and flees on foot.
    const driver = makePed(world.random, car.x, car.y);
    driver.state = 'flee';
    driver.fleeTimer = 3;
    world.peds.push(driver);
  }
  const seen = witnessedBy(world, car.x, car.y, 220) || world.cops.length > 0;
  car.driver = 'player';
  p.car = car;
  car.speed = 0;
  car.lat = 0;
  sfx.door();
  if (seen) crime(world, 1, 'Grand theft auto');
  if (car.special === 'comet') {
    world.message = 'The Comet GT. Nice.';
    world.messageTimer = 2;
  }
}

// ---- the player on foot ----

function updatePlayerOnFoot(world, dt, input, actions, sfx) {
  const p = world.player;
  const mv = input.move();
  const sprint = input.sprint();
  const speed = sprint ? PLAYER.sprintSpeed : PLAYER.walkSpeed;
  let dx = mv.x;
  let dy = mv.y;
  const len = Math.hypot(dx, dy);
  if (len > 0) {
    dx /= len;
    dy /= len;
    p.angle = Math.atan2(dy, dx);
    let nx = p.x + dx * speed * dt;
    let ny = p.y + dy * speed * dt;
    nx = clamp(nx, 12, WORLD - 12);
    ny = clamp(ny, 12, WORLD - 12);
    const fixed = collideCircle(world.city.buildings, nx, ny, PLAYER.radius);
    p.x = fixed.x;
    p.y = fixed.y;
  }
  if (p.punchCd > 0) p.punchCd -= dt;
  if (p.shootCd > 0) p.shootCd -= dt;
  if (p.hurtCd > 0) p.hurtCd -= dt;

  // Enter a car.
  if (actions & 4) { // ACTION_ENTER
    const car = nearestCar(world, p.x, p.y, 46, (c) => c.driver !== 'player');
    if (car) stealCar(world, car, sfx);
  }

  // Punch: hits whatever is 34px ahead, within 26px of that point.
  if ((actions & 8) && p.punchCd <= 0) { // ACTION_PUNCH
    p.punchCd = PLAYER.punchCooldown;
    sfx.punch();
    const px = p.x + Math.cos(p.angle) * PLAYER.punchRange;
    const py = p.y + Math.sin(p.angle) * PLAYER.punchRange;
    let hit = false;
    for (const ped of world.peds) {
      if (ped.state === 'down') continue;
      if (dist(px, py, ped.x, ped.y) < 26) {
        ped.state = 'down';
        ped.downTimer = 4;
        addParticles(world, ped.x, ped.y, 6, '#ffd32a', 90, 0.4, 3);
        hit = true;
        if (witnessedBy(world, ped.x, ped.y, 300)) crime(world, 1, 'Assault witnessed');
      }
    }
    for (const cop of world.cops) {
      if (cop.downTimer > 0) continue;
      if (dist(px, py, cop.x, cop.y) < 26) {
        cop.downTimer = 5;
        addParticles(world, cop.x, cop.y, 8, '#ffd32a', 110, 0.4, 3);
        hit = true;
        crime(world, 1, 'Assault on an officer');
      }
    }
    if (!hit) addParticles(world, px, py, 2, '#ffffff', 40, 0.25, 2);
  }

  // Shoot toward the mouse.
  if ((actions & 16) && p.shootCd <= 0 && p.pistol && p.ammo > 0) { // ACTION_SHOOT
    p.shootCd = 0.22;
    p.ammo -= 1;
    sfx.gunshot();
    const m = input.mouse();
    const wx = world.camera.x + m.x;
    const wy = world.camera.y + m.y;
    const a = angleTo(p.x, p.y, wx, wy);
    p.angle = a;
    const range = 420;
    const tx = p.x + Math.cos(a) * range;
    const ty = p.y + Math.sin(a) * range;
    world.bullets.push({ x: p.x, y: p.y, tx, ty, life: 0.09 });
    // The first ped or cop along the line takes the bullet.
    let bestD = range;
    let victim = null;
    let victimIsCop = false;
    for (const ped of world.peds) {
      if (ped.state === 'down') continue;
      if (distToSegment(ped.x, ped.y, p.x, p.y, tx, ty) < 16) {
        const along = (ped.x - p.x) * Math.cos(a) + (ped.y - p.y) * Math.sin(a);
        if (along > 0 && along < bestD) {
          bestD = along;
          victim = ped;
          victimIsCop = false;
        }
      }
    }
    for (const cop of world.cops) {
      if (cop.downTimer > 0) continue;
      if (distToSegment(cop.x, cop.y, p.x, p.y, tx, ty) < 16) {
        const along = (cop.x - p.x) * Math.cos(a) + (cop.y - p.y) * Math.sin(a);
        if (along > 0 && along < bestD) {
          bestD = along;
          victim = cop;
          victimIsCop = true;
        }
      }
    }
    if (victim) {
      if (victimIsCop) {
        victim.downTimer = 6;
        crime(world, 1, 'Shot an officer');
      } else {
        victim.state = 'down';
        victim.downTimer = 6;
        if (witnessedBy(world, victim.x, victim.y, 320)) crime(world, 1, 'Shooting witnessed');
      }
      addParticles(world, victim.x, victim.y, 10, '#ff6b6b', 140, 0.5, 3);
    }
    // Nearby pedestrians flee the gunshot.
    for (const ped of world.peds) {
      if (dist(p.x, p.y, ped.x, ped.y) < 320 && ped.state !== 'down') {
        ped.state = 'flee';
        ped.fleeTimer = 2.5;
      }
    }
    if (world.wanted === 0 && world.cops.some((c) => dist(p.x, p.y, c.x, c.y) < 520)) {
      crime(world, 1, 'Shots fired');
    }
    world.heat = Math.min(1, world.heat + 0.2);
  }

  // Pick up cash packages.
  for (const pk of world.pickups) {
    if (!pk.taken && dist(p.x, p.y, pk.x, pk.y) < 26) {
      pk.taken = true;
      earn(world, pk.value, sfx);
      world.message = `Found a hidden package: +$${pk.value}`;
      world.messageTimer = 2;
    }
  }
}

// ---- the player driving ----

function updatePlayerDriving(world, dt, input, actions, sfx) {
  const p = world.player;
  const car = p.car;
  const spec = car.spec;
  const mv = input.move();
  const forward = mv.y < 0 ? 1 : mv.y > 0 ? -0.55 : 0; // W = gas, S = brake/reverse
  const steer = mv.x; // A/D
  const handbrake = input.handbrake();

  // Arcade car model: speed along the heading, lateral velocity damped by grip.
  const targetSpeed = forward * spec.top;
  const accel = forward !== 0 ? spec.accel : spec.accel * 0.5;
  car.speed += clamp(targetSpeed - car.speed, -accel * dt * 2.2, accel * dt);
  if (forward === 0) car.speed *= Math.pow(0.4, dt); // coast
  const steerAuthority = clamp(Math.abs(car.speed) / 160, 0, 1) * (handbrake ? 1.5 : 1);
  const turnRate = steer * 2.6 * steerAuthority * (car.speed >= 0 ? 1 : -1);
  car.angle += turnRate * dt;
  if (handbrake) car.lat *= Math.pow(0.12, dt);
  else car.lat *= Math.pow(1 - spec.grip, dt * 0.96); // grip damps lateral slide
  car.lat = clamp(car.lat, -140, 140);
  // A touch of drift when steering hard at speed.
  if (Math.abs(steer) > 0.5 && Math.abs(car.speed) > 240) {
    car.lat += steer * 26 * dt * Math.abs(car.speed) / 300;
  }

  const fx = Math.cos(car.angle);
  const fy = Math.sin(car.angle);
  const lx = -fy;
  const ly = fx;
  let nx = car.x + (fx * car.speed + lx * car.lat) * dt;
  let ny = car.y + (fy * car.speed + ly * car.lat) * dt;
  nx = clamp(nx, 14, WORLD - 14);
  ny = clamp(ny, 14, WORLD - 14);

  // Buildings: bounce off, take damage.
  const hit = carHitsBuilding(world.city.buildings, nx, ny, spec.len, spec.wid, car.angle);
  if (hit) {
    const impact = Math.abs(car.speed);
    if (impact > 90) {
      sfx.crash(clamp(impact / 500, 0.15, 1));
      addParticles(world, nx, ny, Math.floor(impact / 40), '#f2c94c', 130, 0.5, 3);
      damageCar(world, car, impact * 0.06, sfx);
    }
    car.speed *= -0.25;
    car.lat *= -0.4;
    nx = car.x;
    ny = car.y;
  }
  car.x = nx;
  car.y = ny;
  p.x = car.x;
  p.y = car.y;
  p.angle = car.angle;

  // Car vs car: push apart, damage both on a hard hit.
  for (const other of world.cars) {
    if (other === car || other.wreck || other.dead) continue;
    const d = dist(car.x, car.y, other.x, other.y);
    const minD = (spec.len + other.spec.len) / 2 - 6;
    if (d < minD && d > 0.01) {
      const push = (minD - d) / 2;
      const ux = (car.x - other.x) / d;
      const uy = (car.y - other.y) / d;
      car.x += ux * push;
      car.y += uy * push;
      other.x -= ux * push;
      other.y -= uy * push;
      const impact = Math.abs(car.speed - other.speed);
      if (impact > 80) {
        sfx.crash(clamp(impact / 500, 0.15, 1));
        addParticles(world, (car.x + other.x) / 2, (car.y + other.y) / 2, 8, '#f2c94c', 120, 0.5, 3);
        damageCar(world, car, impact * 0.05, sfx);
        damageCar(world, other, impact * 0.05, sfx);
        if (other.driver === 'traffic') other.stuck = 1.2;
      }
      other.speed *= 0.6;
      car.speed *= 0.85;
    }
  }

  // Running over pedestrians.
  for (const ped of world.peds) {
    if (ped.state === 'down') continue;
    if (dist(car.x, car.y, ped.x, ped.y) < spec.len / 2 + 4 && Math.abs(car.speed) > 70) {
      ped.state = 'down';
      ped.downTimer = 5;
      addParticles(world, ped.x, ped.y, 10, '#ff6b6b', 150, 0.5, 3);
      sfx.crash(0.4);
      if (witnessedBy(world, ped.x, ped.y, 320)) crime(world, 1, 'Hit and run');
    } else if (dist(car.x, car.y, ped.x, ped.y) < 130 && Math.abs(car.speed) > 200 && ped.state !== 'flee') {
      ped.state = 'flee';
      ped.fleeTimer = 2;
    }
  }

  // Exit the car.
  if (actions & 4) { // ACTION_ENTER
    const side = { x: car.x - Math.sin(car.angle) * 30, y: car.y + Math.cos(car.angle) * 30 };
    const fixed = collideCircle(world.city.buildings, side.x, side.y, PLAYER.radius);
    p.x = fixed.x;
    p.y = fixed.y;
    p.angle = car.angle;
    car.driver = 'parked';
    car.speed = 0;
    p.car = null;
    sfx.door();
  }
  if (actions & 32) sfx.horn(); // ACTION_HORN
  sfx.engine(clamp(Math.abs(car.speed) / spec.top, 0, 1), dt);
}

function damageCar(world, car, amount, sfx) {
  if (car.wreck) return;
  car.hp -= amount;
  if (car.hp <= 0) {
    car.hp = 0;
    car.wreck = true;
    car.speed = 0;
    addParticles(world, car.x, car.y, 26, '#ff9f43', 220, 0.9, 4);
    addParticles(world, car.x, car.y, 18, '#576574', 120, 1.2, 5);
    if (sfx) sfx.crash(1);
    if (car.driver === 'player') {
      // Ejected, hurt.
      world.player.car = null;
      world.player.hp -= 25;
      const p = world.player;
      const side = { x: car.x - Math.sin(car.angle) * 34, y: car.y + Math.cos(car.angle) * 34 };
      const fixed = collideCircle(world.city.buildings, side.x, side.y, PLAYER.radius);
      p.x = fixed.x;
      p.y = fixed.y;
      world.message = 'Your car is wrecked!';
      world.messageTimer = 2.5;
      if (world.player.hp <= 0) wastePlayer(world, sfx);
    }
  }
}

// ---- traffic ----

function updateTraffic(world, dt) {
  for (const car of world.cars) {
    if (car.driver !== 'traffic' || car.wreck || car.dead) continue;
    if (car.stuck > 0) {
      car.stuck -= dt;
      car.speed *= Math.pow(0.2, dt);
      continue;
    }
    const t = car.routeTarget;
    if (!t) {
      assignRoute(world, car);
      continue;
    }
    const d = dist(car.x, car.y, t.x, t.y);
    if (d < 30) {
      assignRoute(world, car);
      continue;
    }
    // Drive toward the target along the road: steer to the target angle, slow
    // for cars ahead.
    const targetAngle = angleTo(car.x, car.y, t.x, t.y);
    car.angle = turnToward(car.angle, targetAngle, 2.4 * dt);
    let wantSpeed = car.spec.top * 0.42;
    // Stop for a car ahead — and for the player on foot ahead (traffic does
    // not casually run people over).
    for (const other of world.cars) {
      if (other === car || other.wreck || other.dead) continue;
      const ox = other.x - car.x;
      const oy = other.y - car.y;
      const ahead = ox * Math.cos(car.angle) + oy * Math.sin(car.angle);
      const side = Math.abs(-ox * Math.sin(car.angle) + oy * Math.cos(car.angle));
      if (ahead > 0 && ahead < 64 && side < 22) {
        wantSpeed = 0;
        break;
      }
    }
    if (wantSpeed > 0 && !world.player.car) {
      const px = world.player.x - car.x;
      const py = world.player.y - car.y;
      const ahead = px * Math.cos(car.angle) + py * Math.sin(car.angle);
      const side = Math.abs(-px * Math.sin(car.angle) + py * Math.cos(car.angle));
      if (ahead > 0 && ahead < 64 && side < 22) wantSpeed = 0;
    }
    car.speed += clamp(wantSpeed - car.speed, -260 * dt, 200 * dt);
    car.x += Math.cos(car.angle) * car.speed * dt;
    car.y += Math.sin(car.angle) * car.speed * dt;
    car.x = clamp(car.x, 8, WORLD - 8);
    car.y = clamp(car.y, 8, WORLD - 8);
  }
}

// ---- pedestrians ----

function updatePeds(world, dt) {
  for (const ped of world.peds) {
    if (ped.state === 'down') {
      ped.downTimer -= dt;
      if (ped.downTimer <= 0) ped.state = 'walk';
      continue;
    }
    if (ped.state === 'flee') {
      ped.fleeTimer -= dt;
      const p = world.player;
      const a = angleTo(p.x, p.y, ped.x, ped.y);
      ped.angle = a;
      ped.x += Math.cos(a) * 150 * dt;
      ped.y += Math.sin(a) * 150 * dt;
      const fixed = collideCircle(world.city.buildings, ped.x, ped.y, 9);
      ped.x = fixed.x;
      ped.y = fixed.y;
      if (ped.fleeTimer <= 0) ped.state = 'walk';
      continue;
    }
    // Walk along the sidewalk: keep to a road edge, turn at intersections sometimes.
    if (!ped.target || dist(ped.x, ped.y, ped.target.x, ped.target.y) < 14 || world.random.chance(dt * 0.08)) {
      const p = nearestRoadPoint(ped.x, ped.y);
      const line = world.random.chance(0.5) ? p.x : p.y;
      const along = world.random.range(120, WORLD - 120);
      ped.target = world.random.chance(0.5)
        ? { x: along, y: line + 44 }
        : { x: line + 44, y: along };
      if (!isOnRoad(ped.target.x, ped.target.y)) ped.target = { x: p.x, y: p.y };
    }
    const a = angleTo(ped.x, ped.y, ped.target.x, ped.target.y);
    ped.angle = a;
    ped.x += Math.cos(a) * ped.speed * dt;
    ped.y += Math.sin(a) * ped.speed * dt;
    const fixed = collideCircle(world.city.buildings, ped.x, ped.y, 9);
    ped.x = fixed.x;
    ped.y = fixed.y;
    ped.x = clamp(ped.x, 8, WORLD - 8);
    ped.y = clamp(ped.y, 8, WORLD - 8);
  }
  // Keep the streets populated.
  if (world.peds.length < 24 && world.random.chance(dt * 0.25)) {
    const p = randomRoadPoint(world.random);
    world.peds.push(makePed(world.random, p.x, p.y));
  }
}

// ---- police & the wanted level ----

function updatePolice(world, dt, sfx) {
  const p = world.player;
  // Spawn police while wanted.
  if (world.wanted > 0) {
    world.spawnTimer -= dt;
    const wantUnits = WANTED.units[world.wanted];
    const activeUnits = world.cars.filter((c) => c.driver === 'police' && !c.wreck).length + world.cops.length;
    if (world.spawnTimer <= 0 && activeUnits < wantUnits) {
      world.spawnTimer = WANTED.spawnEvery[world.wanted];
      spawnPolice(world, world.wanted >= 3);
    }
  }
  // Police cars pursue.
  for (const car of world.cars) {
    if (car.driver !== 'police' || car.wreck || car.dead) continue;
    const d = dist(car.x, car.y, p.x, p.y);
    if (d > 900) {
      // Too far: despawn quietly.
      car.dead = true;
      continue;
    }
    // Pursue along the road grid: BFS a route to the player's intersection and
    // follow it, then ram directly on the final leg. Driving straight at the
    // player cuts across blocks and wedges the car on buildings.
    const pNode = nearestIntersection(p.x, p.y);
    const cNode = nearestIntersection(car.x, car.y);
    const targetKey = pNode.i * ROAD_LINES.length + pNode.j;
    if (!car.path || car.pathTarget !== targetKey || car.pathIdx >= car.path.length) {
      car.path = roadPath(cNode, pNode);
      car.pathIdx = 1; // path[0] is our own intersection
      car.pathTarget = targetKey;
    }
    let tx;
    let ty;
    const lead = 0.35;
    const lx = p.car ? Math.cos(p.angle) * p.car.speed * lead : 0;
    const ly = p.car ? Math.sin(p.angle) * p.car.speed * lead : 0;
    const wp = car.path[car.pathIdx];
    if (wp) {
      if (dist(car.x, car.y, wp.x, wp.y) < 46) car.pathIdx += 1;
      const wp2 = car.path[car.pathIdx];
      if (wp2) {
        tx = wp2.x;
        ty = wp2.y;
      } else {
        tx = p.x + lx;
        ty = p.y + ly;
      }
    } else {
      tx = p.x + lx;
      ty = p.y + ly;
    }
    const targetAngle = angleTo(car.x, car.y, tx, ty);
    car.angle = turnToward(car.angle, targetAngle, 3.0 * dt);
    const wantSpeed = car.spec.top * (world.wanted >= 4 ? 0.98 : 0.88);
    car.speed += clamp(wantSpeed - car.speed, -420 * dt, 380 * dt);
    let nx = car.x + Math.cos(car.angle) * car.speed * dt;
    let ny = car.y + Math.sin(car.angle) * car.speed * dt;
    const hit = carHitsBuilding(world.city.buildings, nx, ny, car.spec.len, car.spec.wid, car.angle);
    if (hit) {
      car.speed *= 0.4;
      nx = car.x;
      ny = car.y;
      addParticles(world, nx, ny, 4, '#f2c94c', 80, 0.4, 3);
    }
    car.x = clamp(nx, 8, WORLD - 8);
    car.y = clamp(ny, 8, WORLD - 8);
    car.siren = true;
    // Ram the player's car. A ram dents it at about 11.5 damage per second of
    // continuous ramming — roughly 9 seconds to wreck a full-health car, not
    // under 2 seconds.
    if (p.car) {
      const dd = dist(car.x, car.y, p.car.x, p.car.y);
      if (dd < (car.spec.len + p.car.spec.len) / 2 - 4) {
        const ux = (p.car.x - car.x) / Math.max(dd, 1);
        const uy = (p.car.y - car.y) / Math.max(dd, 1);
        p.car.x += ux * 249.6 * dt;
        p.car.y += uy * 249.6 * dt;
        p.car.speed *= 0.94;
        damageCar(world, p.car, 11.52 * dt, sfx);
        car.speed *= 0.7;
      }
    } else if (d < 90 && world.cops.filter((c) => c.downTimer <= 0).length < 3) {
      // A cop gets out on foot when close to a player on foot.
      world.cops.push({ x: car.x, y: car.y, angle: car.angle, speed: 205, downTimer: 0, arrest: 0 });
      car.copOut = true;
    }
  }
  // Foot cops chase and arrest.
  for (const cop of world.cops) {
    if (cop.downTimer > 0) {
      cop.downTimer -= dt;
      continue;
    }
    const d = dist(cop.x, cop.y, p.x, p.y);
    if (d > 700 || world.wanted === 0) {
      cop.gone = true;
      continue;
    }
    const a = angleTo(cop.x, cop.y, p.x, p.y);
    cop.angle = a;
    if (p.car) {
      // Can't catch a car on foot: head for it anyway, slower.
      cop.x += Math.cos(a) * 150 * dt;
      cop.y += Math.sin(a) * 150 * dt;
    } else {
      cop.x += Math.cos(a) * cop.speed * dt;
      cop.y += Math.sin(a) * cop.speed * dt;
      if (d < 26) {
        cop.arrest += dt;
        if (cop.arrest > 0.55) {
          bustPlayer(world, sfx);
          return;
        }
      } else cop.arrest = 0;
    }
    const fixed = collideCircle(world.city.buildings, cop.x, cop.y, 10);
    cop.x = fixed.x;
    cop.y = fixed.y;
  }
  world.cops = world.cops.filter((c) => !c.gone && !(c.downTimer <= 0 && world.wanted === 0 && dist(c.x, c.y, p.x, p.y) > 700));
  world.cars = world.cars.filter((c) => !c.dead);
  // Wanted decay: out of sight of every police unit for a while.
  const anyNear = world.cars.some((c) => c.driver === 'police' && !c.wreck && dist(c.x, c.y, p.x, p.y) < 460)
    || world.cops.some((c) => c.downTimer <= 0 && dist(c.x, c.y, p.x, p.y) < 460);
  if (world.wanted > 0) {
    if (anyNear) {
      world.decayTimer = 0;
      world.lastSeen = world.time;
    } else {
      world.decayTimer += dt;
      if (world.decayTimer > WANTED.decayAfter[world.wanted]) {
        world.wanted -= 1;
        world.decayTimer = 0;
        world.message = world.wanted === 0
          ? 'You lost them. Clean.'
          : `Wanted level down: ${world.wanted} star${world.wanted === 1 ? '' : 's'}`;
        world.messageTimer = 2.5;
      }
    }
  }
  world.heat = Math.max(0, world.heat - dt * 0.02);
}

function spawnPolice(world, inCar) {
  const p = world.player;
  const a = world.random.range(0, Math.PI * 2);
  const r = world.random.range(420, 560);
  let x = clamp(p.x + Math.cos(a) * r, 20, WORLD - 20);
  let y = clamp(p.y + Math.sin(a) * r, 20, WORLD - 20);
  const road = nearestRoadPoint(x, y);
  x = road.x;
  y = road.y;
  if (inCar || world.random.chance(0.6)) {
    const car = makeCar(world.random, 'police', x, y, angleTo(x, y, p.x, p.y), 'police');
    car.speed = 200;
    world.cars.push(car);
  } else {
    world.cops.push({ x, y, angle: angleTo(x, y, p.x, p.y), speed: 205, downTimer: 0, arrest: 0 });
  }
}

function bustPlayer(world, sfx) {
  const p = world.player;
  const fine = Math.min(p.cash, ECONOMY.bustFine);
  p.cash -= fine;
  world.stats.busted += 1;
  if (p.car) {
    p.car.driver = 'parked';
    p.car.speed = 0;
    p.car = null;
  }
  p.x = world.city.spots.police.x;
  p.y = world.city.spots.police.y + 60;
  p.hp = PLAYER.health;
  world.wanted = 0;
  world.heat = 0;
  world.cops = [];
  world.cars = world.cars.filter((c) => c.driver !== 'police');
  world.events |= EV_BUSTED;
  world.banner = `BUSTED — fined $${fine}`;
  world.bannerTimer = 3;
  sfx.busted();
}

function wastePlayer(world, sfx) {
  const p = world.player;
  const fine = Math.min(p.cash, ECONOMY.wasteFine);
  p.cash -= fine;
  world.stats.wasted += 1;
  if (p.car) {
    p.car.driver = 'parked';
    p.car.speed = 0;
    p.car = null;
  }
  p.x = world.city.spots.safehouse.x;
  p.y = world.city.spots.safehouse.y - 54;
  p.hp = PLAYER.health;
  world.wanted = 0;
  world.heat = 0;
  world.cops = [];
  world.cars = world.cars.filter((c) => c.driver !== 'police');
  world.events |= EV_WASTED;
  world.banner = `WASTED — hospital bill $${fine}`;
  world.bannerTimer = 3;
  sfx.fail();
}

// ---- missions ----

function startMission(world, sfx) {
  const def = MISSIONS[world.missionIndex];
  if (!def) return;
  const spots = world.city.spots;
  const mk = (x, y, label) => ({ x, y, label });
  let marker;
  let state = {};
  if (def.id === 'wheels') {
    marker = mk(spots.garage.x, spots.garage.y, 'Garage');
    state = { step: 0 };
  } else if (def.id === 'drop') {
    marker = mk(spots.bank.x, spots.bank.y, 'Pickup');
    state = { step: 0, timer: 0 };
  } else if (def.id === 'heat') {
    // The Heat mission's start marker IS the pay-n-spray: an already-wanted
    // player driving there is charged $100 and cleared before the mission's
    // "make heat" step. That is the design, not a bug.
    marker = mk(spots.spray.x, spots.spray.y, 'Make heat');
    state = { step: 0 };
  } else if (def.id === 'collector') {
    marker = mk(spots.marina.x, spots.marina.y, 'Comet GT');
    state = { step: 0 };
  } else {
    marker = mk(spots.bank.x, spots.bank.y, 'Bank');
    state = { step: 0, timer: 0 };
  }
  world.mission = { def, marker, state, started: true };
  world.banner = `${def.name} — ${def.text}`;
  world.bannerTimer = 4;
  sfx.mission();
}

function completeMission(world, sfx) {
  const m = world.mission;
  earn(world, m.def.reward, sfx);
  world.stats.missions += 1;
  world.banner = `${m.def.name} complete! +$${m.def.reward}`;
  world.bannerTimer = 3.5;
  world.mission = null;
  world.missionIndex += 1;
  world.events |= EV_MISSION;
  sfx.mission();
}

function failMission(world, sfx, why) {
  world.banner = `Mission failed — ${why}. Return to the marker to retry.`;
  world.bannerTimer = 3.5;
  world.mission = null;
  sfx.fail();
}

function updateMission(world, dt, sfx) {
  const p = world.player;
  const spots = world.city.spots;
  // Start a mission by entering its start marker (the marker for the next mission).
  if (!world.mission && world.missionIndex < MISSIONS.length) {
    const startSpots = [spots.safehouse, spots.garage, spots.spray, spots.marina, spots.bank];
    const start = startSpots[world.missionIndex];
    if (start && dist(p.x, p.y, start.x, start.y) < 44) startMission(world, sfx);
    return;
  }
  if (!world.mission) return;
  const m = world.mission;
  const id = m.def.id;
  const at = (x, y, r = 44) => dist(p.x, p.y, x, y) < r;

  if (id === 'wheels') {
    if (m.state.step === 0 && p.car) {
      m.state.step = 1;
      m.marker = { x: spots.garage.x, y: spots.garage.y, label: 'Garage' };
      world.message = 'Now bring it to the garage.';
      world.messageTimer = 2.5;
    } else if (m.state.step === 1 && p.car && at(spots.garage.x, spots.garage.y, 52)) {
      completeMission(world, sfx);
    }
  } else if (id === 'drop') {
    if (m.state.step === 0 && at(spots.bank.x, spots.bank.y, 52)) {
      m.state.step = 1;
      m.state.timer = 90;
      m.marker = { x: spots.chopshop.x, y: spots.chopshop.y, label: 'Deliver' };
      world.message = 'Package picked up. 90 seconds — go!';
      world.messageTimer = 2.5;
    } else if (m.state.step === 1) {
      m.state.timer -= dt;
      if (m.state.timer <= 0) failMission(world, sfx, 'out of time');
      else if (p.car && at(spots.chopshop.x, spots.chopshop.y, 52)) completeMission(world, sfx);
    }
  } else if (id === 'heat') {
    if (m.state.step === 0 && world.wanted >= 3) {
      m.state.step = 1;
      m.marker = { x: spots.safehouse.x, y: spots.safehouse.y, label: 'Lay low' };
      world.message = '3 stars! Now lose them.';
      world.messageTimer = 2.5;
    } else if (m.state.step === 1 && world.wanted === 0) {
      completeMission(world, sfx);
    }
  } else if (id === 'collector') {
    if (m.state.step === 0 && p.car && p.car.special === 'comet') {
      m.state.step = 1;
      m.marker = { x: spots.chopshop.x, y: spots.chopshop.y, label: 'Chop Shop' };
      world.message = 'Got the Comet. Deliver it.';
      world.messageTimer = 2.5;
    } else if (m.state.step === 1 && p.car && p.car.special === 'comet' && at(spots.chopshop.x, spots.chopshop.y, 52)) {
      completeMission(world, sfx);
    }
  } else if (id === 'bigone') {
    if (m.state.step === 0 && at(spots.bank.x, spots.bank.y, 52)) {
      m.state.step = 1;
      m.state.timer = 2;
      world.message = 'Grabbing the cash…';
      world.messageTimer = 2;
    } else if (m.state.step === 1) {
      m.state.timer -= dt;
      if (m.state.timer <= 0) {
        m.state.step = 2;
        earn(world, 500, sfx);
        world.wanted = Math.max(world.wanted, 4);
        world.events |= EV_WANTED_UP;
        m.marker = { x: spots.safehouse.x, y: spots.safehouse.y, label: 'Safehouse' };
        world.message = '4 stars! Get to the safehouse.';
        world.messageTimer = 3;
      }
    } else if (m.state.step === 2 && at(spots.safehouse.x, spots.safehouse.y, 52)) {
      completeMission(world, sfx);
    }
  }
}

// ---- taxi fares, rampage, shops ----

function updateSide(world, dt, sfx) {
  const p = world.player;
  const spots = world.city.spots;

  // Pay-n-spray: drive in, pay, the wanted level clears and the car repaints.
  if (p.car && dist(p.x, p.y, spots.spray.x, spots.spray.y) < 52 && world.wanted > 0 && p.cash >= ECONOMY.sprayCost) {
    p.cash -= ECONOMY.sprayCost;
    world.wanted = 0;
    world.heat = 0;
    world.cops = [];
    world.cars = world.cars.filter((c) => c.driver !== 'police');
    p.car.color = world.random.pick(['#e74c3c', '#3498db', '#f1c40f', '#2ecc71', '#9b59b6']);
    p.car.hp = p.car.spec.hp;
    world.message = `Resprayed — $${ECONOMY.sprayCost}. Clean.`;
    world.messageTimer = 2.5;
    sfx.cash();
  }

  // Gun shop: walk in to buy the pistol and ammo.
  if (!p.car && dist(p.x, p.y, spots.gunshop.x, spots.gunshop.y) < 52) {
    if (!p.pistol && p.cash >= ECONOMY.pistolCost) {
      p.cash -= ECONOMY.pistolCost;
      p.pistol = true;
      p.ammo = ECONOMY.ammoPack;
      world.message = `Pistol bought — $${ECONOMY.pistolCost}. G to shoot.`;
      world.messageTimer = 2.5;
      sfx.cash();
    } else if (p.pistol && p.ammo < 12 && p.cash >= ECONOMY.ammoCost) {
      p.cash -= ECONOMY.ammoCost;
      p.ammo += ECONOMY.ammoPack;
      world.message = `Ammo +${ECONOMY.ammoPack} — $${ECONOMY.ammoCost}.`;
      world.messageTimer = 2;
      sfx.cash();
    }
  }

  // Taxi fare: a waving pedestrian near the road wants a ride.
  if (!world.taxi && p.car) {
    for (const ped of world.peds) {
      if (ped.state === 'walk' && dist(p.x, p.y, ped.x, ped.y) < 60 && world.random.chance(dt * 0.12)) {
        ped.wave = true;
        world.taxi = { ped, stage: 0, timer: 0, dest: randomRoadPoint(world.random), fare: 0 };
        world.message = 'A fare is waving! Press E to pick up.';
        world.messageTimer = 3;
        break;
      }
    }
  }
  if (world.taxi) {
    const t = world.taxi;
    if (t.stage === 0) {
      if (p.car && dist(p.x, p.y, t.ped.x, t.ped.y) < 46) {
        t.stage = 1;
        t.timer = 75;
        t.fare = 60 + Math.floor(dist(t.ped.x, t.ped.y, t.dest.x, t.dest.y) / 12);
        t.ped.state = 'down'; // riding: hidden in the car
        world.message = `Fare picked up — $${t.fare} if you're quick.`;
        world.messageTimer = 2.5;
      } else if (dist(p.x, p.y, t.ped.x, t.ped.y) > 500) {
        t.ped.wave = false;
        world.taxi = null;
      }
    } else {
      t.timer -= dt;
      if (t.timer <= 0) {
        world.taxi = null;
        world.message = 'Fare lost — too slow.';
        world.messageTimer = 2;
      } else if (p.car && dist(p.x, p.y, t.dest.x, t.dest.y) < 52) {
        const tip = t.timer > 30 ? 25 : 0;
        earn(world, t.fare + tip, sfx);
        world.stats.fares += 1;
        world.banner = `Fare delivered! +$${t.fare + tip}`;
        world.bannerTimer = 2.5;
        world.taxi = null;
      }
    }
  }

  // Rampage: at the docks marker, wreck 5 cars in 60s for $250.
  if (!world.rampage) {
    const dock = { x: BEACH_X0 + 60, y: 2160 };
    if (p.car && dist(p.x, p.y, dock.x, dock.y) < 52) {
      world.rampage = { timer: 60, count: 0, need: 5, reward: 250 };
      world.banner = 'RAMPAGE — wreck 5 cars in 60s!';
      world.bannerTimer = 3;
      sfx.mission();
    }
  } else {
    const r = world.rampage;
    r.timer -= dt;
    if (r.timer <= 0) {
      world.banner = `Rampage over — ${r.count}/5 cars.`;
      world.bannerTimer = 2.5;
      world.rampage = null;
    }
  }
  // Count wrecks during a rampage.
  if (world.rampage) {
    const now = world.cars.filter((c) => c.wreck).length;
    if (now > (world.rampage.seenWrecks ?? 0)) {
      world.rampage.count += now - (world.rampage.seenWrecks ?? 0);
      world.rampage.seenWrecks = now;
      if (world.rampage.count >= world.rampage.need) {
        earn(world, world.rampage.reward, sfx);
        world.banner = `Rampage complete! +$${world.rampage.reward}`;
        world.bannerTimer = 3;
        world.rampage = null;
      }
    }
  }
}

// ---- the main step ----

export function stepWorld(world, dt, input, actions, sfx) {
  world.events = 0;
  world.time += dt;
  if (world.messageTimer > 0) world.messageTimer -= dt;
  if (world.bannerTimer > 0) world.bannerTimer -= dt;

  const p = world.player;
  if (p.car) updatePlayerDriving(world, dt, input, actions, sfx);
  else updatePlayerOnFoot(world, dt, input, actions, sfx);

  // A traffic car can hurt the player on foot.
  if (!p.car && p.hurtCd <= 0) {
    for (const car of world.cars) {
      if (car.wreck || car.dead) continue;
      if (dist(p.x, p.y, car.x, car.y) < car.spec.len / 2 + 8 && Math.abs(car.speed) > 60) {
        p.hp -= 20;
        p.hurtCd = 1;
        addParticles(world, p.x, p.y, 8, '#ff6b6b', 120, 0.5, 3);
        sfx.crash(0.5);
        if (p.hp <= 0) {
          wastePlayer(world, sfx);
          break;
        }
      }
    }
  }
  // Slow health regen out of danger.
  if (world.wanted === 0 && p.hp > 0 && p.hp < PLAYER.health) {
    p.hp = Math.min(PLAYER.health, p.hp + dt * 2);
  }

  updateTraffic(world, dt);
  updatePeds(world, dt);
  updatePolice(world, dt, sfx);
  updateMission(world, dt, sfx);
  updateSide(world, dt, sfx);

  // Bullets and particles.
  for (const b of world.bullets) b.life -= dt;
  world.bullets = world.bullets.filter((b) => b.life > 0);
  for (const pt of world.particles) {
    pt.x += pt.vx * dt;
    pt.y += pt.vy * dt;
    pt.vx *= Math.pow(0.1, dt);
    pt.vy *= Math.pow(0.1, dt);
    pt.life -= dt;
  }
  world.particles = world.particles.filter((pt) => pt.life > 0);

  // The camera follows the player (or the car).
  const vw = world.viewW || 1280;
  const vh = world.viewH || 720;
  world.camera.x = clamp(p.x - vw / 2, 0, Math.max(0, WORLD - vw));
  world.camera.y = clamp(p.y - vh / 2, 0, Math.max(0, WORLD - vh));

  // Engine sound off when on foot; siren when police are near.
  if (!p.car) sfx.engine(0, dt);
  const policeNear = world.cars.some((c) => c.driver === 'police' && !c.wreck && dist(c.x, c.y, p.x, p.y) < 700);
  sfx.siren(policeNear || world.cops.length > 0, dt);

  return world.events;
}

export function resetGame(world) {
  const p = world.player;
  // Spawn just south of the safehouse door, outside the mission-start radius,
  // so the title screen's living-city stepping never starts mission 0 by itself.
  p.x = world.city.spots.safehouse.x;
  p.y = world.city.spots.safehouse.y - 54;
  p.angle = -Math.PI / 2;
  p.hp = PLAYER.health;
  p.cash = 100;
  p.pistol = false;
  p.ammo = 0;
  p.car = null;
  world.missionIndex = 0;
  world.stats = { earned: 0, busted: 0, wasted: 0, missions: 0, fares: 0 };
  resetWorld(world);
}

export function serializeSave(world) {
  return JSON.stringify({
    cash: world.player.cash,
    missionIndex: world.missionIndex,
    pistol: world.player.pistol,
    ammo: world.player.ammo,
    stats: world.stats,
  });
}

export function applySave(world, data) {
  try {
    const s = JSON.parse(data);
    if (typeof s.cash === 'number') world.player.cash = s.cash;
    if (typeof s.missionIndex === 'number') world.missionIndex = Math.min(s.missionIndex, MISSIONS.length);
    if (typeof s.pistol === 'boolean') world.player.pistol = s.pistol;
    if (typeof s.ammo === 'number') world.player.ammo = s.ammo;
    if (s.stats) world.stats = { ...world.stats, ...s.stats };
  } catch {
    // A corrupt save: start fresh.
  }
}

// ---- deterministic staging helpers (screenshots / tests) ----

const SILENT_SFX = {
  engine() {}, siren() {}, gunshot() {}, punch() {}, crash() {}, pickup() {},
  cash() {}, mission() {}, fail() {}, horn() {}, door() {}, busted() {},
};

function shotInput(mv) {
  return {
    move: () => mv,
    sprint: () => false,
    handbrake: () => false,
    takeActions: () => 0,
    mouse: () => ({ x: 640, y: 360, down: false }),
  };
}

// Reset the world to a fresh deterministic state for a staged screenshot. It
// does not touch the player's save (cash, mission progress): the shot is a
// moment, not a game.
export function resetForShot(world) {
  resetWorld(world);
  const p = world.player;
  p.x = world.city.spots.safehouse.x;
  p.y = world.city.spots.safehouse.y - 54;
  p.angle = -Math.PI / 2;
  p.hp = PLAYER.health;
  p.car = null;
  p.pistol = false;
  p.ammo = 0;
  world.missionIndex = 0;
  world.viewW = 1280;
  world.viewH = 720;
  world.camera.x = 0;
  world.camera.y = 0;
}

// Advance the world one fixed step with a synthetic input (autopilot), silently.
export function stepForShot(world, mv) {
  stepWorld(world, STEP, shotInput(mv), 0, SILENT_SFX);
}
