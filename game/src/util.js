// Small deterministic toolkit: a seeded RNG, angle and geometry helpers, and
// A* over a graph of road intersections. Nothing here knows about the game.

/** Mulberry32: a tiny seeded generator with a decent period. */
export function makeRng(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A stable hash of a string, for seeding the RNG from a name. */
export function hashSeed(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);

/** Shortest signed turn from angle `a` to angle `b`, in (-PI, PI]. */
export function angleDelta(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d <= -Math.PI) d += Math.PI * 2;
  return d;
}

/** Turn `a` towards `b` by at most `maxStep` radians. */
export function turnToward(a, b, maxStep) {
  const d = angleDelta(a, b);
  if (Math.abs(d) <= maxStep) return b;
  return a + Math.sign(d) * maxStep;
}

/** Does the segment (x1,y1)-(x2,y2) cross the rectangle r? */
export function segmentHitsRect(x1, y1, x2, y2, r) {
  // Quick reject: both ends on one side.
  if ((x1 < r.x && x2 < r.x) || (x1 > r.x + r.w && x2 > r.x + r.w)) return false;
  if ((y1 < r.y && y2 < r.y) || (y1 > r.y + r.h && y2 > r.y + r.h)) return false;
  // An end inside the rect counts as a hit.
  const inside = (x, y) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
  if (inside(x1, y1) || inside(x2, y2)) return true;
  // Otherwise test the four edges.
  const edges = [
    [r.x, r.y, r.x + r.w, r.y],
    [r.x + r.w, r.y, r.x + r.w, r.y + r.h],
    [r.x + r.w, r.y + r.h, r.x, r.y + r.h],
    [r.x, r.y + r.h, r.x, r.y],
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

/** Circle (cx,cy,r) against an axis-aligned rectangle. */
export function circleHitsRect(cx, cy, r, rect) {
  const nx = clamp(cx, rect.x, rect.x + rect.w);
  const ny = clamp(cy, rect.y, rect.y + rect.h);
  const dx = cx - nx;
  const dy = cy - ny;
  return dx * dx + dy * dy < r * r;
}

/**
 * A* over a node list. `nodes` is an array of {x, y, links: [indices]}.
 * Returns an array of node indices from start to goal, or [] when none.
 */
export function astar(nodes, start, goal) {
  if (start === goal) return [start];
  const open = [{ node: start, f: 0 }];
  const came = new Map();
  const g = new Map([[start, 0]]);
  const h = (i) => dist(nodes[i].x, nodes[i].y, nodes[goal].x, nodes[goal].y);
  const closed = new Set();
  while (open.length > 0) {
    let best = 0;
    for (let i = 1; i < open.length; i++) if (open[i].f < open[best].f) best = i;
    const current = open.splice(best, 1)[0].node;
    if (current === goal) {
      const path = [goal];
      let c = goal;
      while (came.has(c)) {
        c = came.get(c);
        path.unshift(c);
      }
      return path;
    }
    if (closed.has(current)) continue;
    closed.add(current);
    for (const nb of nodes[current].links) {
      const ng = (g.get(current) ?? Infinity) + dist(nodes[current].x, nodes[current].y, nodes[nb].x, nodes[nb].y);
      if (ng < (g.get(nb) ?? Infinity)) {
        g.set(nb, ng);
        came.set(nb, current);
        open.push({ node: nb, f: ng + h(nb) });
      }
    }
  }
  return [];
}

/** Nearest node index to a point. */
export function nearestNode(nodes, x, y) {
  let best = 0;
  let bd = Infinity;
  for (let i = 0; i < nodes.length; i++) {
    const d = dist(x, y, nodes[i].x, nodes[i].y);
    if (d < bd) {
      bd = d;
      best = i;
    }
  }
  return best;
}
