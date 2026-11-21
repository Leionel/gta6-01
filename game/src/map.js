// Palm City itself: the road lattice, the blocks between the roads, the
// buildings, parks and shops, the beach, and the graph cars navigate on.
// The layout is seeded so a given seed always builds the same city.

import { WORLD, PLACES, PALETTE } from './constants.js';
import { makeRng, clamp, nearestNode as nearest } from './util.js';

const CENTERS = [180, 540, 900, 1260, 1620, 1980, 2340, 2700];
const BLOCK_MARGIN = 14;

export function buildCity(seed) {
  const rng = makeRng(seed);
  const S = WORLD.size;

  // --- the road graph: one node per intersection, linked to its neighbours
  const nodes = [];
  for (let j = 0; j < CENTERS.length; j++) {
    for (let i = 0; i < CENTERS.length; i++) {
      const links = [];
      if (i > 0) links.push(j * 8 + (i - 1));
      if (i < 7) links.push(j * 8 + (i + 1));
      if (j > 0) links.push((j - 1) * 8 + i);
      if (j < 7) links.push((j + 1) * 8 + i);
      nodes.push({ x: CENTERS[i], y: CENTERS[j], links });
    }
  }

  // --- blocks: the 7x7 squares between the roads
  const blocks = [];
  const shopBlocks = new Map();
  const placeBlock = (key, i, j) => shopBlocks.set(`${i},${j}`, key);
  placeBlock('garage', 1, 1);
  placeBlock('police', 4, 1);
  placeBlock('chopShop', 5, 2);
  placeBlock('spray', 3, 4);
  placeBlock('bank', 6, 5);
  placeBlock('safehouse', 1, 6);
  placeBlock('gunShop', 2, 6);

  const buildings = [];
  const parks = [];
  const lots = [];
  for (let j = 0; j < 7; j++) {
    for (let i = 0; i < 7; i++) {
      const x0 = CENTERS[i] + WORLD.roadHalf;
      const y0 = CENTERS[j] + WORLD.roadHalf;
      const x1 = CENTERS[i + 1] - WORLD.roadHalf;
      const y1 = CENTERS[j + 1] - WORLD.roadHalf;
      const key = shopBlocks.get(`${i},${j}`);
      const block = { i, j, x: x0, y: y0, w: x1 - x0, h: y1 - y0, kind: 'buildings', shop: key ?? null };
      blocks.push(block);
      if (key) {
        // One big shop building, centred, with its label.
        const place = PLACES[key];
        const bw = 150;
        const bh = 110;
        buildings.push({
          x: place.x - bw / 2, y: place.y - bh / 2, w: bw, h: bh,
          colour: place.colour, label: place.label, shop: key, roof: true,
        });
        continue;
      }
      const roll = rng();
      if (roll < 0.16) {
        block.kind = 'park';
        parks.push({ x: x0, y: y0, w: block.w, h: block.h, trees: treeSpots(rng, x0, y0, block.w, block.h, 7) });
      } else if (roll < 0.3) {
        block.kind = 'lot';
        lots.push({ x: x0, y: y0, w: block.w, h: block.h, spots: lotSpots(rng, x0, y0, block.w, block.h) });
      } else {
        // One to three ordinary buildings, placed with a margin.
        const n = 1 + Math.floor(rng() * 3);
        const colour = PALETTE.buildingRoof[Math.floor(rng() * PALETTE.buildingRoof.length)];
        for (let b = 0; b < n; b++) {
          const bw = 70 + rng() * 90;
          const bh = 70 + rng() * 90;
          const bx = x0 + BLOCK_MARGIN + rng() * Math.max(1, block.w - bw - BLOCK_MARGIN * 2);
          const by = y0 + BLOCK_MARGIN + rng() * Math.max(1, block.h - bh - BLOCK_MARGIN * 2);
          const rect = { x: bx, y: by, w: bw, h: bh, colour, label: null, shop: null, roof: true };
          if (buildings.some((o) => rectsOverlap(o, rect, 18))) continue;
          buildings.push(rect);
        }
      }
    }
  }

  // --- the beach: palms along the sand, the marina at the water's edge
  const palms = [];
  for (let y = 60; y < S - 60; y += 90 + rng() * 130) {
    palms.push({ x: 2732 + rng() * 42, y: clamp(y + rng() * 40, 40, S - 40), lean: rng() * Math.PI * 2 });
  }
  for (const park of parks) {
    for (const t of park.trees) palms.push({ x: t.x, y: t.y, lean: rng() * Math.PI * 2, park: true });
  }
  const marina = { x: 2660, y: 1260, dock: { x: 2720, y: 1180, w: 60, h: 170 } };

  // --- ten hidden cash packages, tucked into block corners and alleys
  const packages = [];
  const used = new Set();
  let guard = 0;
  while (packages.length < 10 && guard++ < 400) {
    const i = Math.floor(rng() * 7);
    const j = Math.floor(rng() * 7);
    const key = `${i},${j}`;
    if (used.has(key)) continue;
    used.add(key);
    const x0 = CENTERS[i] + WORLD.roadHalf + 26;
    const y0 = CENTERS[j] + WORLD.roadHalf + 26;
    packages.push({ x: x0 + rng() * 40, y: y0 + rng() * 40, taken: false });
  }

  // --- parked-car spots: two by the garage, the rest scattered in lots
  const parkedSpots = [
    { x: 660, y: 920, angle: Math.PI / 2, model: 'sedan', colour: '#c0392b' },
    { x: 790, y: 920, angle: Math.PI / 2, model: 'sedan', colour: '#2980b9' },
    { x: 2660, y: 1260, angle: 0, model: 'comet', colour: PALETTE.cometPink },
  ];
  for (const lot of lots) {
    for (const s of lot.spots) {
      if (rng() < 0.55) parkedSpots.push({ x: s.x, y: s.y, angle: s.angle, model: 'sedan', colour: PALETTE.carColours[Math.floor(rng() * PALETTE.carColours.length)] });
    }
  }

  const city = {
    seed, nodes, blocks, buildings, parks, lots, palms, marina, packages, parkedSpots,
    playerSpawn: { x: 720, y: 992 },
    jobMarker: { x: 720, y: 878 },
  };
  return city;
}

function treeSpots(rng, x, y, w, h, n) {
  const out = [];
  for (let k = 0; k < n; k++) out.push({ x: x + 24 + rng() * (w - 48), y: y + 24 + rng() * (h - 48) });
  return out;
}

function lotSpots(rng, x, y, w, h) {
  const out = [];
  const rows = 2;
  const cols = 3;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      out.push({
        x: x + 40 + (c * (w - 80)) / (cols - 1),
        y: y + 46 + (r * (h - 92)) / (rows - 1),
        angle: rng() < 0.5 ? 0 : Math.PI,
      });
    }
  }
  return out;
}

function rectsOverlap(a, b, pad) {
  return a.x - pad < b.x + b.w && a.x + a.w + pad > b.x && a.y - pad < b.y + b.h && a.y + a.h + pad > b.y;
}

// --- queries the simulation uses -------------------------------------------

export function onRoad(city, x, y) {
  if (x < 0 || y < 0 || x > WORLD.size || y > WORLD.size) return false;
  for (const c of CENTERS) {
    if (Math.abs(x - c) <= WORLD.roadHalf || Math.abs(y - c) <= WORLD.roadHalf) return true;
  }
  return false;
}

/** Push a circle out of buildings, the water and the world edge. Returns {x, y, hit}. */
export function resolveCircle(city, x, y, r) {
  let hit = false;
  x = clamp(x, r, WORLD.size - r);
  y = clamp(y, r, WORLD.size - r);
  // The water is solid ground for anything that drives or walks.
  if (x > WORLD.waterX - r) {
    x = WORLD.waterX - r;
    hit = true;
  }
  for (const b of city.buildings) {
    const nx = clamp(x, b.x, b.x + b.w);
    const ny = clamp(y, b.y, b.y + b.h);
    const dx = x - nx;
    const dy = y - ny;
    const d2 = dx * dx + dy * dy;
    if (d2 >= r * r) continue;
    hit = true;
    if (d2 === 0) {
      // Dead centre: push out along the smallest axis.
      const left = x - b.x;
      const right = b.x + b.w - x;
      const top = y - b.y;
      const bottom = b.y + b.h - y;
      const m = Math.min(left, right, top, bottom);
      if (m === left) x = b.x - r;
      else if (m === right) x = b.x + b.w + r;
      else if (m === top) y = b.y - r;
      else y = b.y + b.h + r;
    } else {
      const d = Math.sqrt(d2);
      x = nx + (dx / d) * r;
      y = ny + (dy / d) * r;
    }
  }
  return { x, y, hit };
}

/** Is there a building between two points? (line-of-sight test) */
export function blockedSight(city, x1, y1, x2, y2) {
  for (const b of city.buildings) {
    if (segmentHitsRect(x1, y1, x2, y2, b)) return true;
  }
  return false;
}

function segmentHitsRect(x1, y1, x2, y2, r) {
  if ((x1 < r.x && x2 < r.x) || (x1 > r.x + r.w && x2 > r.x + r.w)) return false;
  if ((y1 < r.y && y2 < r.y) || (y1 > r.y + r.h && y2 > r.y + r.h)) return false;
  const inside = (x, y) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
  if (inside(x1, y1) || inside(x2, y2)) return true;
  const edges = [
    [r.x, r.y, r.x + r.w, r.y], [r.x + r.w, r.y, r.x + r.w, r.y + r.h],
    [r.x + r.w, r.y + r.h, r.x, r.y + r.h], [r.x, r.y + r.h, r.x, r.y],
  ];
  for (const [ax, ay, bx, by] of edges) {
    const d = (x2 - x1) * (by - ay) - (y2 - y1) * (bx - ax);
    if (d === 0) continue;
    const t = ((ax - x1) * (by - ay) - (ay - y1) * (bx - ax)) / d;
    const u = ((ax - x1) * (y2 - y1) - (ay - y1) * (x2 - x1)) / d;
    if (t >= 0 && t <= 1 && u >= 0 && u <= 1) return true;
  }
  return false;
}

export function nearestNode(city, x, y) {
  return nearest(city.nodes, x, y);
}

/** A random point on a road, for spawning traffic. */
export function randomRoadPoint(rng) {
  const vertical = rng() < 0.5;
  const c = CENTERS[Math.floor(rng() * CENTERS.length)];
  const along = 40 + rng() * (WORLD.size - 80);
  return vertical ? { x: c, y: along } : { x: along, y: c };
}

/** A random point on a block edge (a sidewalk), for spawning pedestrians. */
export function randomSidewalkPoint(rng) {
  const i = Math.floor(rng() * 7);
  const j = Math.floor(rng() * 7);
  const x0 = CENTERS[i] + WORLD.roadHalf;
  const y0 = CENTERS[j] + WORLD.roadHalf;
  const x1 = CENTERS[i + 1] - WORLD.roadHalf;
  const y1 = CENTERS[j + 1] - WORLD.roadHalf;
  const side = Math.floor(rng() * 4);
  if (side === 0) return { x: x0 + rng() * (x1 - x0), y: y0 + 8 };
  if (side === 1) return { x: x0 + rng() * (x1 - x0), y: y1 - 8 };
  if (side === 2) return { x: x0 + 8, y: y0 + rng() * (y1 - y0) };
  return { x: x1 - 8, y: y0 + rng() * (y1 - y0) };
}
