// Palm City: a deterministic grid city — roads, blocks, buildings, parks, beach and water,
// plus the special spots (safehouse, garage, chop shop, bank, marina, spray shop, gun shop,
// police station) and the road graph traffic drives on.
import { WORLD, PITCH, ROAD_W, PALETTE } from './config.js';

// Road centre lines (both axes). The strip east of the last road is beach, then water.
export const ROAD_LINES = [0, 360, 720, 1080, 1440, 1800, 2160, 2520];
export const BEACH_X0 = 2556;
export const WATER_X0 = 2740;

const SPOT_BLOCKS = {
  safehouse: { bx: 0, by: 6, label: 'Safehouse' },
  garage: { bx: 3, by: 7, label: 'Garage' },
  chopshop: { bx: 6, by: 0, label: 'Chop Shop' },
  bank: { bx: 3, by: 3, label: 'Bank' },
  spray: { bx: 5, by: 1, label: 'Spray Shop' },
  gunshop: { bx: 1, by: 5, label: 'Gun Shop' },
  police: { bx: 0, by: 0, label: 'Police HQ' },
};

function blockRect(bx, by) {
  const x0 = ROAD_LINES[bx] + ROAD_W / 2;
  const y0 = ROAD_LINES[by] + ROAD_W / 2;
  return { x: x0, y: y0, w: PITCH - ROAD_W, h: PITCH - ROAD_W };
}

export function createCity(random) {
  const buildings = [];
  const parks = [];
  const trees = [];
  const parkingLots = [];
  const spots = {};

  for (let by = 0; by < 8; by += 1) {
    for (let bx = 0; bx < 7; bx += 1) {
      const rect = blockRect(bx, by);
      const spotKey = Object.keys(SPOT_BLOCKS).find(
        (k) => SPOT_BLOCKS[k].bx === bx && SPOT_BLOCKS[k].by === by,
      );
      if (spotKey === 'bank') {
        // Downtown bank tower: one tall building, plaza in front.
        buildings.push({
          x: rect.x + 40, y: rect.y + 40, w: rect.w - 80, h: rect.h - 110,
          roof: '#d9c06a', wall: '#b89a4e', height: 64, kind: 'bank',
        });
        spots.bank = { x: rect.x + rect.w / 2, y: rect.y + rect.h - 24, label: 'Bank' };
        continue;
      }
      if (spotKey) {
        // Special spots are low buildings with a marked forecourt.
        const h = 90 + random.range(0, 40);
        buildings.push({
          x: rect.x + 30, y: rect.y + 30, w: rect.w - 60, h,
          roof: random.pick(PALETTE.buildingRoof), wall: random.pick(PALETTE.buildingWall),
          height: 14 + random.range(0, 14), kind: spotKey,
        });
        const spot = { x: rect.x + rect.w / 2, y: rect.y + rect.h - 30, label: SPOT_BLOCKS[spotKey].label, kind: spotKey };
        spots[spotKey] = spot;
        continue;
      }
      const roll = random.next();
      if (roll < 0.14) {
        parks.push({ ...rect, kind: 'park' });
        const n = random.int(5, 9);
        for (let i = 0; i < n; i += 1) {
          trees.push({ x: rect.x + random.range(24, rect.w - 24), y: rect.y + random.range(24, rect.h - 24), r: 12 + random.range(0, 8) });
        }
        continue;
      }
      if (roll < 0.22) {
        parkingLots.push({ ...rect, kind: 'lot' });
        continue;
      }
      // Buildings block: 1-4 buildings with alleys between them.
      const cols = random.chance(0.5) ? 2 : 1;
      const rows = random.chance(0.5) ? 2 : 1;
      const cw = (rect.w - 24 * (cols + 1)) / cols;
      const ch = (rect.h - 24 * (rows + 1)) / rows;
      for (let r = 0; r < rows; r += 1) {
        for (let c = 0; c < cols; c += 1) {
          const bw = cw * random.range(0.72, 1);
          const bh = ch * random.range(0.72, 1);
          buildings.push({
            x: rect.x + 24 + c * (cw + 24) + (cw - bw) / 2,
            y: rect.y + 24 + r * (ch + 24) + (ch - bh) / 2,
            w: bw, h: bh,
            roof: random.pick(PALETTE.buildingRoof), wall: random.pick(PALETTE.buildingWall),
            height: 10 + random.range(0, 42), kind: 'building',
          });
        }
      }
    }
  }

  // Palm trees lining the beach promenade and a few main roads.
  for (let y = 60; y < WORLD - 60; y += 120) {
    trees.push({ x: BEACH_X0 + 26, y, r: 11, palm: true });
  }
  for (let i = 0; i < 26; i += 1) {
    const line = random.pick(ROAD_LINES);
    trees.push({ x: line + ROAD_W / 2 + 14, y: random.range(80, WORLD - 80), r: 10, palm: true });
  }

  // Marina: the Comet GT parks on the beach promenade, east edge.
  spots.marina = { x: BEACH_X0 + 90, y: 1080, label: 'Marina', kind: 'marina' };
  // Safehouse door is on the road side of its block.
  if (spots.safehouse) spots.safehouse = { x: blockRect(0, 6).x + 144, y: blockRect(0, 6).y + blockRect(0, 6).h + 10, label: 'Safehouse', kind: 'safehouse' };

  return { buildings, parks, trees, parkingLots, spots };
}

export function pointInRect(x, y, r) {
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
}

// Is this point on a road (drivable asphalt)? Roads run along both axes at ROAD_LINES.
export function isOnRoad(x, y) {
  const half = ROAD_W / 2;
  for (const line of ROAD_LINES) {
    if (Math.abs(x - line) <= half || Math.abs(y - line) <= half) return true;
  }
  return false;
}

// Nearest point on the road network to (x, y): used to snap pedestrians and traffic.
export function nearestRoadPoint(x, y) {
  let best = null;
  let bestD = Infinity;
  for (const lx of ROAD_LINES) {
    for (const ly of ROAD_LINES) {
      // closest point on the two lines through this intersection
      const candidates = [
        { x: lx, y: Math.max(0, Math.min(WORLD, y)) },
        { x: Math.max(0, Math.min(WORLD, x)), y: ly },
      ];
      for (const c of candidates) {
        const d = (c.x - x) ** 2 + (c.y - y) ** 2;
        if (d < bestD) { bestD = d; best = c; }
      }
    }
  }
  return best;
}

// Push a circle (x, y, radius) out of every building rect it overlaps. Returns corrected {x, y}.
export function collideCircle(buildings, x, y, radius) {
  for (const b of buildings) {
    const cx = Math.max(b.x, Math.min(x, b.x + b.w));
    const cy = Math.max(b.y, Math.min(y, b.y + b.h));
    const dx = x - cx;
    const dy = y - cy;
    const d2 = dx * dx + dy * dy;
    if (d2 < radius * radius) {
      if (d2 < 0.0001) {
        // Centre inside the rect: push out along the smallest penetration axis.
        const left = x - b.x;
        const right = b.x + b.w - x;
        const top = y - b.y;
        const bottom = b.y + b.h - y;
        const m = Math.min(left, right, top, bottom);
        if (m === left) x = b.x - radius;
        else if (m === right) x = b.x + b.w + radius;
        else if (m === top) y = b.y - radius;
        else y = b.y + b.h + radius;
      } else {
        const d = Math.sqrt(d2);
        x = cx + (dx / d) * radius;
        y = cy + (dy / d) * radius;
      }
    }
  }
  return { x, y };
}

// Does an oriented rectangle (centre x, y, length, width, angle) hit any building? Returns the
// first building hit, or null. Used for cars: sample the 4 corners + centre.
export function carHitsBuilding(buildings, x, y, len, wid, angle) {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const hl = len / 2;
  const hw = wid / 2;
  const pts = [
    { x, y },
    { x: x + cos * hl - sin * hw, y: y + sin * hl + cos * hw },
    { x: x + cos * hl + sin * hw, y: y + sin * hl - cos * hw },
    { x: x - cos * hl - sin * hw, y: y - sin * hl + cos * hw },
    { x: x - cos * hl + sin * hw, y: y - sin * hl - cos * hw },
  ];
  for (const p of pts) {
    for (const b of buildings) {
      if (pointInRect(p.x, p.y, b)) return b;
    }
  }
  return null;
}

// Random point on a road, for spawning traffic and pedestrians.
export function randomRoadPoint(random) {
  const horizontal = random.chance(0.5);
  const line = random.pick(ROAD_LINES);
  const along = random.range(80, WORLD - 80);
  return horizontal ? { x: along, y: line } : { x: line, y: along };
}

// Nearest road-grid intersection (roads form a grid, so this is the road path's
// natural node).
export function nearestIntersection(x, y) {
  let bi = 0;
  let bj = 0;
  let bd = Infinity;
  for (let i = 0; i < ROAD_LINES.length; i += 1) {
    for (let j = 0; j < ROAD_LINES.length; j += 1) {
      const d = Math.hypot(ROAD_LINES[i] - x, ROAD_LINES[j] - y);
      if (d < bd) { bd = d; bi = i; bj = j; }
    }
  }
  return { i: bi, j: bj, x: ROAD_LINES[bi], y: ROAD_LINES[bj] };
}

// BFS over the intersection grid: the shortest road route between two
// intersections, as a list of intersection points (first = start).
export function roadPath(from, to) {
  const n = ROAD_LINES.length;
  const key = (i, j) => i * n + j;
  const prev = new Map();
  const queue = [key(from.i, from.j)];
  prev.set(key(from.i, from.j), -1);
  while (queue.length > 0) {
    const cur = queue.shift();
    const ci = Math.floor(cur / n);
    const cj = cur % n;
    if (ci === to.i && cj === to.j) break;
    for (const [ni, nj] of [[ci + 1, cj], [ci - 1, cj], [ci, cj + 1], [ci, cj - 1]]) {
      if (ni < 0 || nj < 0 || ni >= n || nj >= n) continue;
      if (prev.has(key(ni, nj))) continue;
      prev.set(key(ni, nj), cur);
      queue.push(key(ni, nj));
    }
  }
  const pts = [];
  let cur = key(to.i, to.j);
  if (!prev.has(cur)) return pts;
  while (cur !== -1) {
    pts.unshift({ x: ROAD_LINES[Math.floor(cur / n)], y: ROAD_LINES[cur % n] });
    cur = prev.get(cur);
  }
  return pts;
}
