// Screenshot scenes behind ?shot=cover|foot|chase|mission (with &seed=N). Each
// scene builds a deterministic moment from the real rules: the world is reset,
// staged, then stepped forward with a simple driving autopilot, so the frame is
// what real play looks like.
import { STEP } from './config.js';
import { SCREEN_PLAY, SCREEN_TITLE } from './render.js';
import { resetForShot, stepForShot } from './world.js';
import { ROAD_LINES, nearestIntersection, nearestRoadPoint, isOnRoad } from './city.js';

// Snap a staged car onto the nearest road and face along it. Parked cars live
// in lots inside blocks; starting the autopilot there wedges the car on a building.
function placeOnRoad(car) {
  const road = nearestRoadPoint(car.x, car.y);
  car.x = road.x;
  car.y = road.y;
  const onVertical = ROAD_LINES.some((l) => Math.abs(car.x - l) < 4);
  car.angle = onVertical ? Math.PI / 2 : 0;
  car.speed = 0;
}

// Drive along the road grid: steer to the next intersection on the same road
// line, never straight across blocks (that wedges the car on buildings). If the
// car is stuck (barely moved for a while), reverse briefly and pick a fresh
// waypoint.
function autopilot(world) {
  const car = world.player.car;
  if (!car) return { x: 0, y: 0 };
  if (world.shotReverse > 0) {
    world.shotReverse -= STEP;
    return { x: 0, y: 1 };
  }
  if (!world.shotStuck) world.shotStuck = { x: car.x, y: car.y, t: 0 };
  world.shotStuck.t += STEP;
  if (world.shotStuck.t > 1.2) {
    if (Math.hypot(car.x - world.shotStuck.x, car.y - world.shotStuck.y) < 10) {
      world.shotReverse = 0.7;
      world.shotTarget = null;
    }
    world.shotStuck = { x: car.x, y: car.y, t: 0 };
  }
  if (!isOnRoad(car.x, car.y)) {
    // Off the grid (lot, forecourt): head for the nearest road first.
    world.shotTarget = nearestRoadPoint(car.x, car.y);
  } else if (!world.shotTarget || Math.hypot(world.shotTarget.x - car.x, world.shotTarget.y - car.y) < 60) {
    const node = nearestIntersection(car.x, car.y);
    const n = ROAD_LINES.length;
    if (world.random.chance(0.5)) {
      const j = Math.floor(world.random.range(0, n));
      world.shotTarget = { x: ROAD_LINES[node.i], y: ROAD_LINES[j] };
    } else {
      const i = Math.floor(world.random.range(0, n));
      world.shotTarget = { x: ROAD_LINES[i], y: ROAD_LINES[node.j] };
    }
    if (Math.hypot(world.shotTarget.x - car.x, world.shotTarget.y - car.y) < 120) {
      world.shotTarget = { x: ROAD_LINES[(node.i + 3) % n], y: ROAD_LINES[node.j] };
    }
  }
  const t = world.shotTarget;
  const want = Math.atan2(t.y - car.y, t.x - car.x);
  let d = want - car.angle;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return { x: d > 0.12 ? 1 : d < -0.12 ? -1 : 0, y: -1 };
}

function driveSteps(world, seconds) {
  const steps = Math.floor(seconds / STEP);
  for (let i = 0; i < steps; i += 1) stepForShot(world, autopilot(world));
}

export function stageShot(name, world) {
  resetForShot(world);
  const spots = world.city.spots;
  const p = world.player;

  if (name === 'foot') {
    // On foot downtown, next to a parked car, pedestrians around.
    p.x = 1080;
    p.y = 720;
    p.angle = Math.PI / 4;
    for (let i = 0; i < 300; i += 1) stepForShot(world, { x: 0, y: 0 });
    return { screen: SCREEN_PLAY };
  }

  if (name === 'chase') {
    // Driving with 3 stars: police in pursuit, sirens on. The staged car gets
    // extra HP so the frame shows a chase, not a wreck (7s of rams and bumps).
    const car = world.cars.find((c) => c.driver === 'parked' && c.kind === 'sports');
    if (car) {
      p.car = car;
      car.driver = 'player';
      placeOnRoad(car);
      car.speed = 300;
      car.hp = 400;
    }
    p.x = p.car ? p.car.x : 720;
    p.y = p.car ? p.car.y : 720;
    world.wanted = 3;
    world.heat = 1;
    // A short drive: the car starts at speed and stays moving, and the police
    // that spawn on the first step close in — but a long drive lets their rams
    // shove the car into a building corner and wedge it at 0 mph.
    driveSteps(world, 3);
    return { screen: SCREEN_PLAY };
  }

  if (name === 'mission') {
    // At the bank for the final job: marker glowing, 4 stars already on.
    // Put the car on the road just south of the bank so the marker stays in frame.
    // The staged car gets extra HP so police rams don't wreck it mid-shot, and
    // the drive is short (2s) so the bank stays in frame.
    const car = world.cars.find((c) => c.driver === 'parked' && c.kind === 'sedan');
    if (car) {
      p.car = car;
      car.driver = 'player';
      car.x = spots.bank.x;
      car.y = spots.bank.y + 120;
      placeOnRoad(car);
      car.hp = 400;
    }
    p.x = spots.bank.x;
    p.y = spots.bank.y + 120;
    world.missionIndex = 4;
    world.mission = {
      def: { id: 'bigone', name: 'The Big One', reward: 1500, text: 'Hit the bank, grab the cash, lose 4 stars and reach the safehouse.' },
      marker: { x: spots.bank.x, y: spots.bank.y, label: 'Bank' },
      state: { step: 2, timer: 0 },
      started: true,
    };
    world.wanted = 4;
    world.heat = 1;
    driveSteps(world, 2);
    return { screen: SCREEN_PLAY };
  }

  // cover: driving through downtown in traffic, title overlay.
  const car = world.cars.find((c) => c.driver === 'parked');
  if (car) {
    p.car = car;
    car.driver = 'player';
    placeOnRoad(car);
    car.speed = 260;
    car.hp = 400;
  }
  p.x = 720;
  p.y = 720;
  driveSteps(world, 9);
  return { screen: SCREEN_TITLE };
}
