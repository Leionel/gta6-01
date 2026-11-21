// Shot staging and the debug handles the verification scripts use.
// A shot is a deterministic scene: the world is rebuilt from a seed, the
// player and the police are placed by hand, and an autopilot drives so the
// frame shows the game moving. None of this is reachable in normal play —
// it only runs when the page is opened with ?shot=<name>&seed=<n>.

import { PLACES } from './constants.js';
import { astar, nearestNode, dist } from './util.js';

/** The scene a shot name asks for. */
export function parseShot(search) {
  const params = new URLSearchParams(search);
  const shot = params.get('shot');
  const seed = Number(params.get('seed') ?? 7);
  return shot ? { shot, seed: Number.isFinite(seed) ? seed : 7 } : null;
}

/**
 * Place the world for a shot. Returns an autopilot object (or null) that the
 * engine calls every frame to drive. The sim and story are already built.
 */
export function setupShot(sim, story, scene) {
  const p = sim.player;
  const city = sim.city;
  // Clear the street so the frame is exactly the staged one.
  sim.cops = [];
  for (const car of sim.cars) {
    if (car.kind === 'police') car.kind = 'leaving';
  }
  sim.wanted.stars = 0;
  sim.wanted.unseen = 0;

  if (scene.shot === 'cover') {
    // Title screen over the living city; the engine pans the camera.
    return { kind: 'cover', t: 0 };
  }
  if (scene.shot === 'foot') {
    // On foot downtown, HUD and minimap visible, the city alive around.
    p.x = 1440;
    p.y = 1500;
    p.angle = -Math.PI / 2;
    p.car = null;
    return { kind: 'foot', t: 0 };
  }
  if (scene.shot === 'chase') {
    // Rook in the pink Comet GT, three stars, two police cars closing in.
    const comet = sim.cars.find((c) => c.model === 'comet');
    comet.x = 900;
    comet.y = 1260;
    comet.angle = 0;
    comet.speed = 0;
    comet.vx = 0;
    comet.vy = 0;
    comet.hp = comet.maxHp;
    p.car = comet;
    comet.driver = true;
    p.x = comet.x;
    p.y = comet.y;
    p.angle = 0;
    sim.wanted.stars = 3;
    sim.wanted.unseen = 0;
    spawnPoliceBehind(sim, 2, comet.x - 260, comet.y);
    return { kind: 'drive', t: 0, route: routeEast(sim, comet.x, comet.y) };
  }
  if (scene.shot === 'mission') {
    // The Big One: four stars, the bank ahead, a sedan at speed.
    const sedan = sim.cars.find((c) => c.kind === 'parked' && c.model === 'sedan');
    sedan.x = 2340;
    sedan.y = 2160;
    sedan.angle = 0;
    sedan.speed = 0;
    sedan.vx = 0;
    sedan.vy = 0;
    sedan.hp = sedan.maxHp;
    p.car = sedan;
    sedan.driver = true;
    p.x = sedan.x;
    p.y = sedan.y;
    p.angle = 0;
    sim.wanted.stars = 4;
    sim.wanted.unseen = 0;
    // The mission is on its robbery step so the bank marker shows.
    story.index = 4;
    story.state = 'active';
    story.step = 1;
    story.timer = 0;
    story.robT = 0;
    spawnPoliceBehind(sim, 2, sedan.x - 260, sedan.y);
    return { kind: 'drive', t: 0, route: routeEast(sim, sedan.x, sedan.y) };
  }
  return null;
}

function spawnPoliceBehind(sim, n, x, y) {
  for (let i = 0; i < n; i++) {
    const car = {
      id: 9000 + i, kind: 'police', model: 'sedan', colour: '#22252a',
      x: x - i * 90, y: y + (i === 0 ? -14 : 14), angle: 0, speed: 0, vx: 0, vy: 0,
      hp: 100, maxHp: 100, node: nearestNode(sim.city.nodes, x, y), next: 0,
      cruise: 320, waitT: 0, topSpeed: 430, driver: true, wrecked: false,
      replanT: 0, route: [], routeI: 1,
    };
    sim.cars.push(car);
  }
}

/** A route east along the current road, then a turn — the autopilot's path. */
function routeEast(sim, x, y) {
  const from = nearestNode(sim.city.nodes, x, y);
  const east = sim.city.nodes.findIndex((n) => n.y === y && n.x > x + 300);
  const goal = east >= 0 ? east : sim.city.nodes.length - 1;
  const path = astar(sim.city.nodes, from, goal);
  return path.length > 1 ? path.slice(1) : [goal];
}

/**
 * The autopilot: follow the route, throttle on, steer at the next node,
 * reverse out when stuck. Returns the input the sim should use this frame.
 */
export function autopilot(sim, auto, dt) {
  auto.t += dt;
  const p = sim.player;
  const input = { move: { x: 0, y: 0 }, throttle: 0, brake: 0, handbrake: false, actions: 0 };
  if (!p.car) return input;
  const car = p.car;
  // Stuck recovery: barely moving for a while means reverse and re-route.
  const speed = Math.abs(car.speed);
  if (speed < 25) auto.stuckT = (auto.stuckT ?? 0) + dt;
  else auto.stuckT = 0;
  if (auto.stuckT > 1.6) {
    input.brake = 1;
    input.move = { x: speed < 5 ? 1 : -1, y: 0 };
    if (auto.stuckT > 2.6) {
      auto.stuckT = 0;
      auto.route = routeEast(sim, car.x, car.y);
      auto.routeI = 0;
    }
    return input;
  }
  const node = sim.city.nodes[auto.route?.[auto.routeI ?? 0] ?? 0];
  if (node) {
    if (dist(car.x, car.y, node.x, node.y) < 46) {
      auto.routeI = Math.min((auto.routeI ?? 0) + 1, (auto.route?.length ?? 1) - 1);
    }
    const want = Math.atan2(node.y - car.y, node.x - car.x);
    const d = ((want - car.angle + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    input.move = { x: Math.abs(d) > 0.12 ? Math.sign(d) : 0, y: 0 };
  }
  input.throttle = 1;
  return input;
}

// --- debug handles --------------------------------------------------------------

/** The object the verification scripts drive the game through. */
export function makeDebug(sim, story, getScreen, getFps) {
  return {
    version: 'palm-city-cleanroom-1',
    sim,
    story,
    screen: () => getScreen(),
    fps: () => getFps(),
    state() {
      const p = sim.player;
      const obj = story.state === 'done' ? null : (story.state === 'idle' ? 'job' : 'step');
      return {
        screen: getScreen(),
        cash: p.cash,
        hp: Math.round(p.hp),
        wanted: sim.wanted.stars,
        x: Math.round(p.x),
        y: Math.round(p.y),
        inCar: !!p.car,
        carModel: p.car ? p.car.model : null,
        carHp: p.car ? Math.round(p.car.hp) : null,
        speed: p.car ? Math.round(Math.abs(p.car.speed)) : 0,
        mission: story.index,
        missionState: story.state,
        step: story.step,
        hasGun: p.hasGun,
        ammo: p.ammo,
        policeCars: sim.cars.filter((c) => c.kind === 'police').length,
        cops: sim.cops.length,
        pedsDown: sim.stats.pedsDown,
        time: Math.round(sim.time * 10) / 10,
      };
    },
    teleport(x, y) {
      const p = sim.player;
      if (p.car) {
        p.car.x = x;
        p.car.y = y;
        p.car.speed = 0;
        p.car.vx = 0;
        p.car.vy = 0;
      }
      p.x = x;
      p.y = y;
    },
    setWanted(n) {
      sim.wanted.stars = n;
      sim.wanted.unseen = 0;
    },
    setCash(n) {
      sim.player.cash = n;
    },
    giveComet() {
      const comet = sim.cars.find((c) => c.model === 'comet');
      if (!comet) return false;
      comet.x = sim.player.x + 40;
      comet.y = sim.player.y;
      comet.hp = comet.maxHp;
      return true;
    },
    startMission(i) {
      story.index = i;
      story.state = 'idle';
      story.step = 0;
      story.timer = 0;
      story.robT = 0;
    },
    clearPolice() {
      sim.cops = [];
      for (const car of sim.cars) if (car.kind === 'police') car.kind = 'leaving';
      sim.wanted.stars = 0;
      sim.wanted.unseen = 0;
    },
    errors() {
      return window.__errors ?? [];
    },
    requests() {
      return window.__requests ?? [];
    },
  };
}
