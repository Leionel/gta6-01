// Everything the player sees: the city drawn from the simulation state, the
// HUD (cash, objective, stars, health, speed), the live minimap, and the
// title, pause, busted and wasted screens.

import { WORLD, PALETTE, PLACES } from './constants.js';
import { clamp, dist } from './util.js';
import { currentObjective, robProgress } from './story.js';

const CENTERS = [180, 540, 900, 1260, 1620, 1980, 2340, 2700];

export function drawWorld(ctx, sim, story, cam, w, h, time) {
  const city = sim.city;
  const vx = cam.x - w / 2;
  const vy = cam.y - h / 2;
  ctx.save();
  ctx.translate(-vx, -vy);

  // Ground: grass everywhere, then the beach and water on the east edge.
  ctx.fillStyle = PALETTE.grass;
  ctx.fillRect(vx - 20, vy - 20, w + 40, h + 40);
  ctx.fillStyle = PALETTE.sand;
  ctx.fillRect(WORLD.beachX, vy - 20, WORLD.size - WORLD.beachX, h + 40);
  ctx.fillStyle = PALETTE.water;
  ctx.fillRect(WORLD.waterX, vy - 20, WORLD.size - WORLD.waterX, h + 40);
  ctx.strokeStyle = PALETTE.waterDeep;
  ctx.lineWidth = 2;
  for (let y = Math.floor(vy / 46) * 46; y < vy + h; y += 46) {
    ctx.beginPath();
    ctx.moveTo(WORLD.waterX + Math.sin(time * 1.4 + y * 0.05) * 5, y);
    ctx.lineTo(WORLD.waterX + 26 + Math.sin(time * 1.4 + y * 0.05 + 1) * 5, y);
    ctx.stroke();
  }

  // Blocks: sidewalk slabs.
  ctx.fillStyle = PALETTE.sidewalk;
  for (const b of city.blocks) ctx.fillRect(b.x, b.y, b.w, b.h);
  // Parks.
  for (const park of city.parks) {
    ctx.fillStyle = PALETTE.parkGrass;
    ctx.fillRect(park.x, park.y, park.w, park.h);
    ctx.fillStyle = '#4c7a3d';
    for (const t of park.trees) {
      ctx.beginPath();
      ctx.arc(t.x, t.y, 13, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // Parking lots.
  ctx.fillStyle = '#43484f';
  for (const lot of city.lots) ctx.fillRect(lot.x, lot.y, lot.w, lot.h);

  // Roads: asphalt strips with dashed centrelines.
  ctx.fillStyle = PALETTE.asphalt;
  for (const c of CENTERS) {
    ctx.fillRect(c - WORLD.roadHalf, vy - 20, WORLD.roadHalf * 2, h + 40);
    ctx.fillRect(vx - 20, c - WORLD.roadHalf, w + 40, WORLD.roadHalf * 2);
  }
  ctx.strokeStyle = PALETTE.roadLine;
  ctx.lineWidth = 2;
  ctx.setLineDash([22, 26]);
  for (const c of CENTERS) {
    ctx.beginPath();
    ctx.moveTo(c, vy - 20);
    ctx.lineTo(c, vy + h + 20);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(vx - 20, c);
    ctx.lineTo(vx + w + 20, c);
    ctx.stroke();
  }
  ctx.setLineDash([]);

  // Buildings: roof, edge, windows, and a label for shops.
  for (const b of city.buildings) {
    ctx.fillStyle = b.colour;
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 3;
    ctx.strokeRect(b.x, b.y, b.w, b.h);
    ctx.fillStyle = 'rgba(255,255,255,0.16)';
    const cols = Math.max(1, Math.floor(b.w / 26));
    const rows = Math.max(1, Math.floor(b.h / 26));
    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rows; j++) {
        ctx.fillRect(b.x + 8 + i * 26, b.y + 8 + j * 26, 12, 9);
      }
    }
    if (b.label) {
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.font = 'bold 13px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(b.label, b.x + b.w / 2, b.y + b.h / 2 + 5);
    }
  }
  // The marina dock.
  ctx.fillStyle = '#8a6d3b';
  ctx.fillRect(city.marina.dock.x, city.marina.dock.y, city.marina.dock.w, city.marina.dock.h);
  ctx.fillStyle = '#0984e3';
  ctx.font = 'bold 13px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Marina', city.marina.x, city.marina.y - 24);

  // Palms.
  for (const palm of city.palms) {
    ctx.strokeStyle = '#7a5230';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(palm.x, palm.y);
    ctx.lineTo(palm.x + Math.cos(palm.lean) * 8, palm.y - 14);
    ctx.stroke();
    ctx.fillStyle = '#3f8f3a';
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2 + palm.lean;
      ctx.beginPath();
      ctx.ellipse(palm.x + Math.cos(palm.lean) * 8 + Math.cos(a) * 9, palm.y - 14 + Math.sin(a) * 9, 11, 4, a, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Hidden packages: a glinting case.
  for (const pack of city.packages) {
    if (pack.taken) continue;
    const pulse = 0.6 + 0.4 * Math.sin(time * 4 + pack.x);
    ctx.fillStyle = `rgba(242,183,5,${pulse})`;
    ctx.fillRect(pack.x - 6, pack.y - 6, 12, 12);
    ctx.strokeStyle = '#7a5c00';
    ctx.lineWidth = 2;
    ctx.strokeRect(pack.x - 6, pack.y - 6, 12, 12);
  }

  // The objective / job marker: a pulsing ring and a light beam.
  const obj = currentObjective(story);
  if (obj) {
    const pulse = 1 + 0.18 * Math.sin(time * 5);
    ctx.strokeStyle = obj.job ? '#ffd32a' : '#ff5fa2';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(obj.x, obj.y, obj.r * 0.55 * pulse, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = obj.job ? 'rgba(255,211,42,0.12)' : 'rgba(255,95,162,0.12)';
    ctx.beginPath();
    ctx.arc(obj.x, obj.y, obj.r * 0.55 * pulse, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = obj.job ? '#ffd32a' : '#ff5fa2';
    ctx.font = 'bold 13px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(obj.job ? 'JOB' : '▼', obj.x, obj.y - obj.r * 0.55 - 8);
  }
  // Taxi destination.
  if (sim.taxi.dest) {
    ctx.strokeStyle = '#0984e3';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(sim.taxi.dest.x, sim.taxi.dest.y, 26 + 4 * Math.sin(time * 5), 0, Math.PI * 2);
    ctx.stroke();
  }
  // Robbery hold ring.
  if (story.state === 'active' && robProgress(story) > 0) {
    const m = sim.player;
    ctx.strokeStyle = '#d63031';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(m.x, m.y, 34, -Math.PI / 2, -Math.PI / 2 + robProgress(story) * Math.PI * 2);
    ctx.stroke();
  }

  // Pedestrians.
  for (const ped of sim.peds) {
    if (ped.state === 'ride') continue;
    ctx.save();
    ctx.translate(ped.x, ped.y);
    if (ped.state === 'down') {
      ctx.fillStyle = '#5a5a5a';
      ctx.beginPath();
      ctx.ellipse(0, 0, 12, 6, ped.angle, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.rotate(ped.angle);
      ctx.fillStyle = ped.taxi ? '#0984e3' : ped.colour;
      ctx.beginPath();
      ctx.arc(0, 0, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#f5d7b0';
      ctx.beginPath();
      ctx.arc(5, 0, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      if (ped.taxi) {
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 15px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('!', ped.x, ped.y - 16 - 3 * Math.sin(time * 4));
      }
      continue;
    }
    ctx.restore();
  }

  // Cars.
  for (const car of sim.cars) drawCar(ctx, car, sim, time);
  // Foot cops.
  for (const cop of sim.cops) {
    ctx.save();
    ctx.translate(cop.x, cop.y);
    ctx.rotate(cop.angle);
    ctx.fillStyle = '#1e3799';
    ctx.beginPath();
    ctx.arc(0, 0, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f5d7b0';
    ctx.beginPath();
    ctx.arc(5, 0, 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  // The player on foot.
  const p = sim.player;
  if (!p.car) {
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.angle);
    ctx.fillStyle = PALETTE.playerJacket;
    ctx.beginPath();
    ctx.arc(0, 0, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#2d3436';
    ctx.beginPath();
    ctx.arc(6, 0, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    // Facing tick.
    ctx.strokeStyle = 'rgba(255,211,42,0.8)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x + Math.cos(p.angle) * 20, p.y + Math.sin(p.angle) * 20);
    ctx.stroke();
  }
  // Tracers and particles.
  for (const s of sim.shots) {
    ctx.strokeStyle = `rgba(255,240,150,${clamp(s.ttl / 0.12, 0, 1)})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(s.x1, s.y1);
    ctx.lineTo(s.x2, s.y2);
    ctx.stroke();
  }
  for (const pt of sim.particles) {
    ctx.fillStyle = pt.colour;
    ctx.globalAlpha = clamp(pt.ttl * 2, 0, 1);
    ctx.fillRect(pt.x - pt.size / 2, pt.y - pt.size / 2, pt.size, pt.size);
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}

function drawCar(ctx, car, sim, time) {
  ctx.save();
  ctx.translate(car.x, car.y);
  ctx.rotate(car.angle);
  const L = 46;
  const W = 22;
  if (car.wrecked) {
    ctx.fillStyle = '#4a4a4a';
    ctx.fillRect(-L / 2, -W / 2, L, W);
    ctx.fillStyle = 'rgba(120,120,120,0.5)';
    ctx.beginPath();
    ctx.arc(0, -6, 8 + 3 * Math.sin(time * 3 + car.id), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return;
  }
  // Wheels.
  ctx.fillStyle = '#111';
  ctx.fillRect(-L / 2 + 6, -W / 2 - 3, 10, 5);
  ctx.fillRect(-L / 2 + 6, W / 2 - 2, 10, 5);
  ctx.fillRect(L / 2 - 16, -W / 2 - 3, 10, 5);
  ctx.fillRect(L / 2 - 16, W / 2 - 2, 10, 5);
  // Body.
  ctx.fillStyle = car.colour;
  ctx.beginPath();
  ctx.roundRect(-L / 2, -W / 2, L, W, 7);
  ctx.fill();
  // Windshield and roof.
  ctx.fillStyle = 'rgba(200,225,255,0.85)';
  ctx.fillRect(6, -W / 2 + 4, 10, W - 8);
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillRect(-8, -W / 2 + 4, 12, W - 8);
  if (car.model === 'comet') {
    ctx.fillStyle = '#fff';
    ctx.fillRect(-L / 2 + 2, -3, L - 4, 6);
  }
  // Headlights.
  ctx.fillStyle = '#ffe98a';
  ctx.fillRect(L / 2 - 2, -W / 2 + 3, 3, 4);
  ctx.fillRect(L / 2 - 2, W / 2 - 7, 3, 4);
  // Police light bar, flashing.
  if (car.kind === 'police') {
    const on = Math.floor(time * 4) % 2 === 0;
    ctx.fillStyle = on ? '#ff2d2d' : '#2d6bff';
    ctx.fillRect(-4, -W / 2 - 2, 8, 4);
    ctx.fillStyle = on ? '#2d6bff' : '#ff2d2d';
    ctx.fillRect(-4, W / 2 - 2, 8, 4);
  }
  // The player's car gets a white ring so it is easy to spot.
  if (sim.player.car === car) {
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(-L / 2 - 4, -W / 2 - 4, L + 8, W + 8, 10);
    ctx.stroke();
  }
  ctx.restore();
}

// --- HUD ----------------------------------------------------------------------

export function drawHUD(ctx, sim, story, w, h) {
  const p = sim.player;
  // Top-left panel.
  ctx.fillStyle = 'rgba(10,12,16,0.72)';
  ctx.fillRect(12, 12, 352, 108);
  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  ctx.lineWidth = 1;
  ctx.strokeRect(12, 12, 352, 108);
  ctx.fillStyle = '#ffd32a';
  ctx.font = 'bold 26px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(`$${p.cash}`, 24, 44);
  const obj = currentObjective(story);
  ctx.fillStyle = '#fff';
  ctx.font = '14px sans-serif';
  const label = obj ? obj.label : 'All jobs done — Palm City is yours.';
  wrapText(ctx, label, 24, 66, 328, 18);
  // Health bar.
  ctx.fillStyle = '#333';
  ctx.fillRect(24, 96, 150, 10);
  ctx.fillStyle = p.hp > 40 ? '#2ecc71' : '#e74c3c';
  ctx.fillRect(24, 96, 150 * clamp(p.hp / 100, 0, 1), 10);
  ctx.fillStyle = '#fff';
  ctx.font = '11px sans-serif';
  ctx.fillText(`HP ${Math.ceil(p.hp)}`, 182, 105);
  // Stars, top-right of the panel.
  ctx.font = '22px sans-serif';
  for (let i = 0; i < 5; i++) {
    ctx.fillStyle = i < sim.wanted.stars ? '#ff4757' : 'rgba(255,255,255,0.25)';
    ctx.fillText('★', 268 + i * 18, 44);
  }
  // Speed and gun, bottom-left.
  if (p.car) {
    const mph = Math.round(Math.abs(p.car.speed) * 0.12);
    ctx.fillStyle = 'rgba(10,12,16,0.72)';
    ctx.fillRect(12, h - 58, 130, 46);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 24px sans-serif';
    ctx.fillText(`${mph}`, 24, h - 26);
    ctx.font = '12px sans-serif';
    ctx.fillText('mph', 66, h - 26);
    if (p.car.hp < 100) {
      ctx.fillStyle = '#e74c3c';
      ctx.fillRect(24, h - 18, 106 * clamp(p.car.hp / 100, 0, 1), 5);
    }
  }
  if (p.hasGun) {
    ctx.fillStyle = 'rgba(10,12,16,0.72)';
    ctx.fillRect(150, h - 58, 110, 46);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 18px sans-serif';
    ctx.fillText(`PISTOL ${p.ammo}`, 160, h - 28);
  }
  // Banners, centre-top.
  let by = 132;
  for (const b of sim.banners) {
    ctx.globalAlpha = clamp(b.ttl, 0, 1);
    ctx.fillStyle = 'rgba(10,12,16,0.78)';
    ctx.font = 'bold 17px sans-serif';
    const tw = ctx.measureText(b.text).width;
    ctx.fillRect(w / 2 - tw / 2 - 14, by - 20, tw + 28, 30);
    ctx.fillStyle = b.colour;
    ctx.textAlign = 'center';
    ctx.fillText(b.text, w / 2, by);
    ctx.textAlign = 'left';
    ctx.globalAlpha = 1;
    by += 36;
  }
  // Contextual hint.
  const hint = hintFor(sim, story);
  if (hint) {
    ctx.fillStyle = 'rgba(10,12,16,0.72)';
    ctx.font = '14px sans-serif';
    const tw = ctx.measureText(hint).width;
    ctx.fillRect(w / 2 - tw / 2 - 10, h - 40, tw + 20, 26);
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.fillText(hint, w / 2, h - 22);
    ctx.textAlign = 'left';
  }
}

function hintFor(sim, story) {
  const p = sim.player;
  const obj = currentObjective(story);
  if (!p.car) {
    const gun = PLACES.gunShop;
    if (dist(p.x, p.y, gun.mx, gun.my) < 64) return 'E — buy a pistol ($300) or ammo ($50)';
    for (const car of sim.cars) {
      if (!car.wrecked && Math.abs(car.speed) < 30 && dist(p.x, p.y, car.x, car.y) < 60) {
        return car.kind === 'traffic' ? 'E — steal this car' : 'E — get in';
      }
    }
    if (obj && obj.job) return 'Walk into the yellow ring to take the job';
  } else {
    if (sim.wanted.stars > 0) {
      const spray = PLACES.spray;
      if (dist(p.x, p.y, spray.mx, spray.my) < 140) return 'Drive into the spray shop to clear the heat ($100)';
    }
  }
  return null;
}

function wrapText(ctx, text, x, y, maxW, lineH) {
  const words = text.split(' ');
  let line = '';
  let yy = y;
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxW && line) {
      ctx.fillText(line, x, yy);
      line = word;
      yy += lineH;
    } else {
      line = test;
    }
  }
  if (line) ctx.fillText(line, x, yy);
}

// --- minimap --------------------------------------------------------------------

export function drawMinimap(ctx, sim, story, x, y, size) {
  const scale = size / WORLD.size;
  ctx.fillStyle = 'rgba(10,12,16,0.78)';
  ctx.fillRect(x - 4, y - 4, size + 8, size + 8);
  ctx.fillStyle = '#3d6b34';
  ctx.fillRect(x, y, size, size);
  ctx.fillStyle = '#e0c98f';
  ctx.fillRect(x + WORLD.beachX * scale, y, (WORLD.size - WORLD.beachX) * scale, size);
  ctx.fillStyle = '#2e86ab';
  ctx.fillRect(x + WORLD.waterX * scale, y, (WORLD.size - WORLD.waterX) * scale, size);
  ctx.fillStyle = '#33373d';
  for (const c of CENTERS) {
    ctx.fillRect(x + (c - WORLD.roadHalf) * scale, y, WORLD.roadHalf * 2 * scale, size);
    ctx.fillRect(x, y + (c - WORLD.roadHalf) * scale, size, WORLD.roadHalf * 2 * scale);
  }
  for (const b of sim.city.buildings) {
    ctx.fillStyle = b.shop ? b.colour : '#7a6a53';
    ctx.fillRect(x + b.x * scale, y + b.y * scale, Math.max(2, b.w * scale), Math.max(2, b.h * scale));
  }
  const obj = currentObjective(story);
  if (obj) {
    ctx.fillStyle = obj.job ? '#ffd32a' : '#ff5fa2';
    ctx.beginPath();
    ctx.arc(x + obj.x * scale, y + obj.y * scale, 5, 0, Math.PI * 2);
    ctx.fill();
  }
  for (const car of sim.cars) {
    if (car.kind === 'police') {
      ctx.fillStyle = '#2d6bff';
      ctx.fillRect(x + car.x * scale - 2, y + car.y * scale - 2, 4, 4);
    }
  }
  const p = sim.player;
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(x + p.x * scale, y + p.y * scale, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#ffd32a';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x + p.x * scale, y + p.y * scale, 6, 0, Math.PI * 2);
  ctx.stroke();
}

// --- screens ----------------------------------------------------------------------

export function drawTitle(ctx, w, h, hasSave) {
  ctx.fillStyle = 'rgba(8,10,18,0.55)';
  ctx.fillRect(0, 0, w, h);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffd32a';
  ctx.font = 'bold 84px sans-serif';
  ctx.fillText('PALM CITY', w / 2, h / 2 - 90);
  ctx.fillStyle = '#ff5fa2';
  ctx.font = 'bold 34px sans-serif';
  ctx.fillText('— SUNSET HEIST —', w / 2, h / 2 - 44);
  ctx.fillStyle = '#fff';
  ctx.font = '20px sans-serif';
  ctx.fillText('Rook owes Delia Voss $50,000. Five jobs. One city. No rules.', w / 2, h / 2 + 4);
  ctx.font = 'bold 22px sans-serif';
  ctx.fillStyle = Math.floor(performance.now() / 500) % 2 === 0 ? '#fff' : '#ffd32a';
  ctx.fillText(hasSave ? 'ENTER — continue  •  N — new game' : 'ENTER — start', w / 2, h / 2 + 56);
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.font = '15px sans-serif';
  ctx.fillText('WASD / arrows — move & drive    E — enter / steal a car    F — punch    G — shoot', w / 2, h / 2 + 110);
  ctx.fillText('SPACE — handbrake    P — pause    H — horn    M — mute', w / 2, h / 2 + 136);
  ctx.textAlign = 'left';
}

export function drawPause(ctx, w, h) {
  ctx.fillStyle = 'rgba(8,10,18,0.62)';
  ctx.fillRect(0, 0, w, h);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 52px sans-serif';
  ctx.fillText('PAUSED', w / 2, h / 2 - 20);
  ctx.font = '18px sans-serif';
  ctx.fillText('ENTER or P — resume    R — restart the run    M — mute', w / 2, h / 2 + 24);
  ctx.textAlign = 'left';
}

export function drawArrested(ctx, w, h, fine, kind) {
  ctx.fillStyle = 'rgba(8,10,18,0.68)';
  ctx.fillRect(0, 0, w, h);
  ctx.textAlign = 'center';
  ctx.fillStyle = kind === 'busted' ? '#2d6bff' : '#e74c3c';
  ctx.font = 'bold 64px sans-serif';
  ctx.fillText(kind === 'busted' ? 'BUSTED!' : 'WASTED', w / 2, h / 2 - 20);
  ctx.fillStyle = '#fff';
  ctx.font = '20px sans-serif';
  ctx.fillText(`The city takes its cut: -$${fine}.`, w / 2, h / 2 + 24);
  ctx.fillText('ENTER — back on the street', w / 2, h / 2 + 56);
  ctx.textAlign = 'left';
}

export function drawStoryDone(ctx, w, h) {
  ctx.fillStyle = 'rgba(8,10,18,0.55)';
  ctx.fillRect(0, 0, w, h);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffd32a';
  ctx.font = 'bold 56px sans-serif';
  ctx.fillText('THE DEBT IS PAID', w / 2, h / 2 - 20);
  ctx.fillStyle = '#fff';
  ctx.font = '20px sans-serif';
  ctx.fillText('Five jobs, $3,550 banked, and Palm City is yours, Rook.', w / 2, h / 2 + 24);
  ctx.fillText('ENTER — keep driving', w / 2, h / 2 + 56);
  ctx.textAlign = 'left';
}
