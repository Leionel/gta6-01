// Palm City renderer: sun-soaked top-down city, cars, pedestrians, HUD with a live minimap,
// and the title / pause / busted / wasted / story-complete screens. One canvas, all code-drawn.
import { WORLD, PITCH, ROAD_W, PALETTE, MISSIONS } from './config.js';
import { ROAD_LINES, BEACH_X0, WATER_X0 } from './city.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_BUSTED = 'busted';
export const SCREEN_WASTED = 'wasted';
export const SCREEN_COMPLETE = 'complete';

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');

  function drawGround(world) {
    const cam = world.camera;
    ctx.fillStyle = PALETTE.grass;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    // Beach and water on the east edge.
    ctx.fillStyle = PALETTE.sand;
    ctx.fillRect(BEACH_X0 - cam.x, -cam.y, WORLD - BEACH_X0, WORLD);
    ctx.fillStyle = PALETTE.water;
    ctx.fillRect(WATER_X0 - cam.x, -cam.y, WORLD - WATER_X0, WORLD);
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 2;
    for (let y = 0; y < WORLD; y += 90) {
      const wob = Math.sin(world.time * 1.2 + y * 0.05) * 6;
      ctx.beginPath();
      ctx.moveTo(WATER_X0 - cam.x + wob, y - cam.y);
      ctx.lineTo(WATER_X0 - cam.x + 26 + wob, y - cam.y);
      ctx.stroke();
    }
    // Parks.
    for (const park of world.city.parks) {
      ctx.fillStyle = PALETTE.park;
      ctx.fillRect(park.x - cam.x, park.y - cam.y, park.w, park.h);
    }
    // Parking lots.
    for (const lot of world.city.parkingLots) {
      ctx.fillStyle = PALETTE.asphaltDark;
      ctx.fillRect(lot.x - cam.x, lot.y - cam.y, lot.w, lot.h);
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = 2;
      for (let x = lot.x + 30; x < lot.x + lot.w - 20; x += 46) {
        ctx.beginPath();
        ctx.moveTo(x - cam.x, lot.y + 14 - cam.y);
        ctx.lineTo(x - cam.x, lot.y + 44 - cam.y);
        ctx.stroke();
      }
    }
    // Roads: asphalt bands + pale sidewalks + dashed centre lines.
    for (const line of ROAD_LINES) {
      ctx.fillStyle = PALETTE.asphalt;
      ctx.fillRect(-cam.x, line - ROAD_W / 2 - cam.y, WORLD, ROAD_W);
      ctx.fillRect(line - ROAD_W / 2 - cam.x, -cam.y, ROAD_W, WORLD);
      ctx.fillStyle = PALETTE.sidewalk;
      ctx.fillRect(-cam.x, line - ROAD_W / 2 - 8 - cam.y, WORLD, 8);
      ctx.fillRect(-cam.x, line + ROAD_W / 2 - cam.y, WORLD, 8);
      ctx.fillRect(line - ROAD_W / 2 - 8 - cam.x, -cam.y, 8, WORLD);
      ctx.fillRect(line + ROAD_W / 2 - cam.x, -cam.y, 8, WORLD);
    }
    ctx.strokeStyle = PALETTE.roadLine;
    ctx.lineWidth = 3;
    ctx.setLineDash([18, 22]);
    for (const line of ROAD_LINES) {
      ctx.beginPath();
      ctx.moveTo(-cam.x, line - cam.y);
      ctx.lineTo(WORLD - cam.x, line - cam.y);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(line - cam.x, -cam.y);
      ctx.lineTo(line - cam.x, WORLD - cam.y);
      ctx.stroke();
    }
    ctx.setLineDash([]);
  }

  function drawBuildings(world) {
    const cam = world.camera;
    for (const b of world.city.buildings) {
      const x = b.x - cam.x;
      const y = b.y - cam.y;
      const lift = b.height * 0.45;
      // Long afternoon shadow to the north-east.
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.fillRect(x + 10, y + 8, b.w, b.h);
      // Wall faces (extrusion) then the roof on top.
      ctx.fillStyle = b.wall;
      ctx.fillRect(x + 6, y - lift + 8, b.w, b.h);
      ctx.fillStyle = b.roof;
      ctx.fillRect(x, y - lift, b.w, b.h);
      ctx.strokeStyle = 'rgba(0,0,0,0.25)';
      ctx.lineWidth = 2;
      ctx.strokeRect(x, y - lift, b.w, b.h);
      // Roof details: a lighter inset panel, and a helipad mark on the bank.
      ctx.fillStyle = 'rgba(255,255,255,0.16)';
      ctx.fillRect(x + 10, y - lift + 10, b.w - 20, b.h - 20);
      if (b.kind === 'bank') {
        ctx.fillStyle = '#f2c94c';
        ctx.font = 'bold 20px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('$', x + b.w / 2, y - lift + b.h / 2 + 7);
      }
      if (b.kind && b.kind !== 'building' && b.kind !== 'bank') {
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.font = 'bold 13px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(b.kind.toUpperCase(), x + b.w / 2, y - lift + b.h / 2 + 5);
      }
    }
    // Trees and palms.
    for (const t of world.city.trees) {
      const x = t.x - cam.x;
      const y = t.y - cam.y;
      ctx.fillStyle = 'rgba(0,0,0,0.2)';
      ctx.beginPath();
      ctx.ellipse(x + 5, y + 6, t.r, t.r * 0.6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = t.palm ? PALETTE.palm : PALETTE.tree;
      ctx.beginPath();
      ctx.arc(x, y, t.r, 0, Math.PI * 2);
      ctx.fill();
      if (t.palm) {
        ctx.strokeStyle = '#2f8f5b';
        ctx.lineWidth = 3;
        for (let i = 0; i < 5; i += 1) {
          const a = (i / 5) * Math.PI * 2 + 0.4;
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x + Math.cos(a) * (t.r + 7), y + Math.sin(a) * (t.r + 7));
          ctx.stroke();
        }
      }
    }
  }

  function drawMarker(world, x, y, label, color) {
    const cam = world.camera;
    const pulse = 1 + Math.sin(world.time * 4) * 0.12;
    const sx = x - cam.x;
    const sy = y - cam.y;
    ctx.save();
    ctx.globalAlpha = 0.25;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(sx, sy, 34 * pulse, 12 * pulse, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = color;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(sx, sy, 26 * pulse, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(sx, sy - 34);
    ctx.lineTo(sx - 8, sy - 18);
    ctx.lineTo(sx + 8, sy - 18);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 13px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(label, sx, sy - 42);
  }

  function drawCar(world, car) {
    const cam = world.camera;
    const spec = car.spec;
    ctx.save();
    ctx.translate(car.x - cam.x, car.y - cam.y);
    ctx.rotate(car.angle);
    if (car.wreck) {
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = '#2d3436';
      roundRect(ctx, -spec.len / 2, -spec.wid / 2, spec.len, spec.wid, 8);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(-spec.len / 2 + 4, -spec.wid / 2 + 4, spec.len - 8, spec.wid - 8);
      ctx.restore();
      return;
    }
    // Shadow.
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    roundRect(ctx, -spec.len / 2 + 3, -spec.wid / 2 + 4, spec.len, spec.wid, 8);
    ctx.fill();
    // Body.
    ctx.fillStyle = car.color;
    roundRect(ctx, -spec.len / 2, -spec.wid / 2, spec.len, spec.wid, 8);
    ctx.fill();
    // Cabin + windshield.
    ctx.fillStyle = 'rgba(20,28,38,0.85)';
    roundRect(ctx, -spec.len * 0.18, -spec.wid / 2 + 4, spec.len * 0.36, spec.wid - 8, 5);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.fillRect(spec.len * 0.18, -spec.wid / 2 + 4, 4, spec.wid - 8);
    // Headlights.
    ctx.fillStyle = '#ffeaa7';
    ctx.fillRect(spec.len / 2 - 3, -spec.wid / 2 + 3, 3, 5);
    ctx.fillRect(spec.len / 2 - 3, spec.wid / 2 - 8, 3, 5);
    if (car.kind === 'taxi') {
      ctx.fillStyle = '#f2c94c';
      ctx.font = 'bold 10px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('TAXI', 0, -spec.wid / 2 - 5);
    }
    if (car.kind === 'police') {
      const flash = Math.floor(world.time * 6) % 2 === 0;
      ctx.fillStyle = flash ? '#ff4757' : '#3742fa';
      ctx.fillRect(-6, -spec.wid / 2 - 2, 12, 5);
      ctx.fillStyle = flash ? '#3742fa' : '#ff4757';
      ctx.fillRect(-6, spec.wid / 2 - 3, 12, 5);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 9px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('POLICE', 0, 3);
    }
    if (car.special === 'comet') {
      ctx.strokeStyle = '#ff6b81';
      ctx.lineWidth = 2;
      roundRect(ctx, -spec.len / 2 - 2, -spec.wid / 2 - 2, spec.len + 4, spec.wid + 4, 10);
      ctx.stroke();
    }
    // Damage smoke.
    if (car.hp < car.spec.hp * 0.4 && !car.wreck) {
      ctx.fillStyle = 'rgba(87,101,116,0.7)';
      ctx.beginPath();
      ctx.arc(-spec.len / 4 + Math.sin(world.time * 9) * 3, -spec.wid / 4, 6, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawPed(world, ped, isPlayer) {
    const cam = world.camera;
    const x = ped.x - cam.x;
    const y = ped.y - cam.y;
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.ellipse(x + 3, y + 4, 9, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = isPlayer ? '#ff4757' : ped.shirt;
    ctx.beginPath();
    ctx.arc(x, y, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f5d0a9';
    ctx.beginPath();
    ctx.arc(x + Math.cos(ped.angle) * 3, y + Math.sin(ped.angle) * 3, 5, 0, Math.PI * 2);
    ctx.fill();
    if (ped.wave) {
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, y - 8);
      ctx.lineTo(x + 10, y - 20);
      ctx.stroke();
    }
  }

  function drawMinimap(world) {
    const size = 176;
    const x0 = canvas.width - size - 14;
    const y0 = 14;
    const s = size / WORLD;
    ctx.save();
    ctx.fillStyle = 'rgba(10,14,20,0.72)';
    roundRect(ctx, x0 - 6, y0 - 6, size + 12, size + 12, 10);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x0 - 6, y0 - 6, size + 12, size + 12);
    ctx.beginPath();
    ctx.rect(x0, y0, size, size);
    ctx.clip();
    ctx.fillStyle = '#1d6f7a';
    ctx.fillRect(x0, y0, size, size);
    ctx.fillStyle = '#2f8f5b';
    ctx.fillRect(x0, y0, size * 0.94, size);
    ctx.fillStyle = '#e8d39a';
    ctx.fillRect(x0 + size * 0.94, y0, size * 0.06, size);
    ctx.strokeStyle = '#5a5a64';
    ctx.lineWidth = 2;
    for (const line of ROAD_LINES) {
      ctx.beginPath();
      ctx.moveTo(x0 + line * s, y0);
      ctx.lineTo(x0 + line * s, y0 + size);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x0, y0 + line * s);
      ctx.lineTo(x0 + size, y0 + line * s);
      ctx.stroke();
    }
    const dot = (x, y, color, r = 2.5) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x0 + x * s, y0 + y * s, r, 0, Math.PI * 2);
      ctx.fill();
    };
    // Mission / taxi / rampage markers.
    const m = world.mission;
    if (m) dot(m.marker.x, m.marker.y, '#f2c94c', 4);
    else if (world.missionIndex < MISSIONS.length) {
      const starts = [world.city.spots.safehouse, world.city.spots.garage, world.city.spots.spray, world.city.spots.marina, world.city.spots.bank];
      const st = starts[world.missionIndex];
      if (st) dot(st.x, st.y, '#f2c94c', 4);
    }
    if (world.taxi && world.taxi.stage === 1) dot(world.taxi.dest.x, world.taxi.dest.y, '#00cec9', 4);
    for (const car of world.cars) {
      if (car.wreck || car.dead) continue;
      if (car.driver === 'police') dot(car.x, car.y, Math.floor(world.time * 4) % 2 ? '#ff4757' : '#3742fa', 3);
      else if (car.driver === 'player') continue;
      else dot(car.x, car.y, 'rgba(255,255,255,0.7)', 1.6);
    }
    for (const cop of world.cops) if (cop.downTimer <= 0) dot(cop.x, cop.y, '#3742fa', 2.5);
    // Player arrow.
    const p = world.player;
    ctx.fillStyle = '#fff';
    ctx.save();
    ctx.translate(x0 + p.x * s, y0 + p.y * s);
    ctx.rotate(p.angle);
    ctx.beginPath();
    ctx.moveTo(7, 0);
    ctx.lineTo(-5, -5);
    ctx.lineTo(-5, 5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.restore();
  }

  function drawHud(world) {
    const p = world.player;
    ctx.textAlign = 'left';
    // Cash + objective.
    ctx.fillStyle = 'rgba(10,14,20,0.66)';
    roundRect(ctx, 12, 12, 350, 62, 10);
    ctx.fill();
    ctx.fillStyle = '#2ecc71';
    ctx.font = 'bold 26px sans-serif';
    ctx.fillText(`$${p.cash}`, 24, 42);
    ctx.fillStyle = '#fff';
    ctx.font = '13px sans-serif';
    const obj = world.mission
      ? `${world.mission.def.name}: ${world.mission.def.text}`
      : world.missionIndex < MISSIONS.length
        ? `Next: ${MISSIONS[world.missionIndex].name} — head to the yellow marker`
        : 'Story complete — free roam. Enjoy Palm City.';
    ctx.fillText(obj.slice(0, 48), 24, 62);
    if (world.mission && world.mission.state.timer !== undefined && world.mission.state.step === 1) {
      ctx.fillStyle = world.mission.state.timer < 15 ? '#ff6b6b' : '#f2c94c';
      ctx.font = 'bold 18px sans-serif';
      ctx.fillText(`${Math.ceil(world.mission.state.timer)}s`, 24, 84);
    }
    // Wanted stars, top centre.
    const cx = canvas.width / 2;
    ctx.fillStyle = 'rgba(10,14,20,0.66)';
    roundRect(ctx, cx - 90, 12, 180, 40, 10);
    ctx.fill();
    ctx.font = '24px sans-serif';
    ctx.textAlign = 'center';
    for (let i = 0; i < 5; i += 1) {
      ctx.fillStyle = i < world.wanted ? '#f2c94c' : 'rgba(255,255,255,0.25)';
      ctx.fillText('★', cx - 64 + i * 32, 40);
    }
    // Health, bottom left.
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(10,14,20,0.66)';
    roundRect(ctx, 12, canvas.height - 52, 210, 40, 10);
    ctx.fill();
    ctx.fillStyle = '#ff6b6b';
    roundRect(ctx, 24, canvas.height - 38, 120 * (p.hp / 100), 12, 6);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = '13px sans-serif';
    ctx.fillText(`HP ${Math.ceil(p.hp)}${p.pistol ? `  •  Pistol ${p.ammo}` : ''}`, 150, canvas.height - 27);
    // Speed, bottom right (driving).
    if (p.car) {
      ctx.textAlign = 'right';
      ctx.fillStyle = 'rgba(10,14,20,0.66)';
      roundRect(ctx, canvas.width - 152, canvas.height - 52, 140, 40, 10);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 22px sans-serif';
      ctx.fillText(`${Math.round(Math.abs(p.car.speed) * 0.22)} mph`, canvas.width - 24, canvas.height - 24);
      ctx.font = '11px sans-serif';
      ctx.fillStyle = '#f2c94c';
      ctx.fillText(p.car.spec.name, canvas.width - 24, canvas.height - 40);
    }
    // Message + banner.
    if (world.messageTimer > 0) {
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(10,14,20,0.7)';
      const w = ctx.measureText(world.message).width + 28;
      roundRect(ctx, canvas.width / 2 - w / 2, 64, w, 30, 8);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = '14px sans-serif';
      ctx.fillText(world.message, canvas.width / 2, 84);
    }
    if (world.bannerTimer > 0) {
      ctx.textAlign = 'center';
      ctx.font = 'bold 30px sans-serif';
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.fillText(world.banner, canvas.width / 2 + 2, canvas.height / 2 - 98);
      ctx.fillStyle = '#f2c94c';
      ctx.fillText(world.banner, canvas.width / 2, canvas.height / 2 - 100);
    }
    drawMinimap(world);
    // Controls hint, bottom centre.
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.font = '12px sans-serif';
    ctx.fillText(p.car ? 'WASD drive • Space handbrake • E exit • P pause • M mute' : 'WASD move • Shift run • E enter car • F punch • G shoot • P pause', canvas.width / 2, canvas.height - 8);
  }

  function drawScreen(world, screen, save) {
    if (screen === SCREEN_PLAY) return;
    // The title is a lighter veil so the living city reads behind it; other
    // screens dim harder.
    ctx.fillStyle = screen === SCREEN_TITLE ? 'rgba(8,10,16,0.55)' : 'rgba(8,10,16,0.72)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.textAlign = 'center';
    if (screen === SCREEN_TITLE) {
      ctx.fillStyle = '#f2c94c';
      ctx.font = 'bold 64px sans-serif';
      ctx.fillText('PALM CITY', canvas.width / 2, 190);
      ctx.fillStyle = '#ff6b81';
      ctx.font = 'bold 30px sans-serif';
      ctx.fillText('— SUNSET HEIST —', canvas.width / 2, 232);
      ctx.fillStyle = '#fff';
      ctx.font = '17px sans-serif';
      ctx.fillText('You are Rook, a getaway driver who owes Delia Voss $50,000.', canvas.width / 2, 280);
      ctx.fillText('Five jobs stand between you and a clean slate. Steal, drive, escape, earn.', canvas.width / 2, 306);
      ctx.fillStyle = '#f2c94c';
      ctx.font = '15px sans-serif';
      ctx.fillText('WASD move / drive  •  E enter & steal cars  •  F punch  •  G shoot (buy a pistol first)', canvas.width / 2, 356);
      ctx.fillText('Space handbrake  •  P pause  •  M mute  •  Progress saves automatically', canvas.width / 2, 380);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 22px sans-serif';
      const label = save && save.missionIndex > 0 ? `Continue — ${save.missionIndex} of 5 jobs done ($${save.cash})` : 'Press Enter or click to start';
      ctx.fillText(label, canvas.width / 2, 448);
      if (save && save.stats) {
        ctx.fillStyle = 'rgba(255,255,255,0.65)';
        ctx.font = '14px sans-serif';
        ctx.fillText(`Career: $${save.stats.earned} earned • ${save.stats.missions} jobs • ${save.stats.fares} fares`, canvas.width / 2, 480);
      }
    } else if (screen === SCREEN_PAUSED) {
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 44px sans-serif';
      ctx.fillText('PAUSED', canvas.width / 2, 330);
      ctx.font = '16px sans-serif';
      ctx.fillText('Press P or Enter to resume', canvas.width / 2, 372);
    } else if (screen === SCREEN_BUSTED || screen === SCREEN_WASTED) {
      ctx.fillStyle = screen === SCREEN_BUSTED ? '#3742fa' : '#ff6b6b';
      ctx.font = 'bold 64px sans-serif';
      ctx.fillText(screen === SCREEN_BUSTED ? 'BUSTED' : 'WASTED', canvas.width / 2, 320);
      ctx.fillStyle = '#fff';
      ctx.font = '17px sans-serif';
      ctx.fillText(screen === SCREEN_BUSTED ? 'The Palm City PD sends its regards. You keep the story, not the cash.' : 'You wake up at the safehouse, lighter by a hospital bill.', canvas.width / 2, 364);
      ctx.font = 'bold 20px sans-serif';
      ctx.fillText('Press Enter to get back out there', canvas.width / 2, 420);
    } else if (screen === SCREEN_COMPLETE) {
      ctx.fillStyle = '#f2c94c';
      ctx.font = 'bold 52px sans-serif';
      ctx.fillText('CLEAN SLATE', canvas.width / 2, 300);
      ctx.fillStyle = '#fff';
      ctx.font = '17px sans-serif';
      ctx.fillText('All five jobs done. Delia is paid. Palm City is yours — free roam.', canvas.width / 2, 344);
      ctx.font = 'bold 20px sans-serif';
      ctx.fillText('Press Enter to keep driving', canvas.width / 2, 396);
    }
  }

  function draw(world, screen, save) {
    const cam = world.camera;
    // Sky-tinted frame outside the world bounds.
    ctx.fillStyle = '#87b5c9';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    drawGround(world);
    drawBuildings(world);
    // Cash pickups.
    for (const pk of world.pickups) {
      if (pk.taken) continue;
      const x = pk.x - cam.x;
      const y = pk.y - cam.y;
      const bob = Math.sin(world.time * 3 + pk.x) * 3;
      ctx.fillStyle = '#2ecc71';
      ctx.fillRect(x - 7, y - 7 + bob, 14, 14);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 11px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('$', x, y + 4 + bob);
    }
    // Mission marker (and the next mission's start marker).
    if (world.mission) {
      drawMarker(world, world.mission.marker.x, world.mission.marker.y, world.mission.marker.label, '#f2c94c');
    } else if (world.missionIndex < MISSIONS.length) {
      const starts = [world.city.spots.safehouse, world.city.spots.garage, world.city.spots.spray, world.city.spots.marina, world.city.spots.bank];
      const st = starts[world.missionIndex];
      if (st) drawMarker(world, st.x, st.y, MISSIONS[world.missionIndex].name, '#f2c94c');
    }
    if (world.taxi && world.taxi.stage === 1) {
      drawMarker(world, world.taxi.dest.x, world.taxi.dest.y, 'Fare', '#00cec9');
    }
    if (world.rampage) {
      drawMarker(world, BEACH_X0 + 60, 2160, `Wreck ${world.rampage.count}/5`, '#ff6b6b');
    }
    // Cars, peds, player, effects.
    const cars = [...world.cars].sort((a, b) => a.y - b.y);
    for (const car of cars) {
      if (car.dead) continue;
      drawCar(world, car);
    }
    for (const ped of world.peds) {
      if (ped.state === 'down') {
        const x = ped.x - cam.x;
        const y = ped.y - cam.y;
        ctx.fillStyle = ped.shirt;
        ctx.beginPath();
        ctx.ellipse(x, y, 11, 6, 0.4, 0, Math.PI * 2);
        ctx.fill();
        continue;
      }
      drawPed(world, ped, false);
    }
    for (const cop of world.cops) {
      if (cop.downTimer > 0) {
        const x = cop.x - cam.x;
        const y = cop.y - cam.y;
        ctx.fillStyle = '#2c3e50';
        ctx.beginPath();
        ctx.ellipse(x, y, 11, 6, 0.4, 0, Math.PI * 2);
        ctx.fill();
        continue;
      }
      drawPed(world, { ...cop, shirt: '#2c3e50' }, false);
    }
    if (!world.player.car) drawPed(world, world.player, true);
    // Bullets.
    ctx.strokeStyle = '#ffeaa7';
    ctx.lineWidth = 2;
    for (const b of world.bullets) {
      ctx.beginPath();
      ctx.moveTo(b.x - cam.x, b.y - cam.y);
      ctx.lineTo(b.tx - cam.x, b.ty - cam.y);
      ctx.stroke();
    }
    // Particles.
    for (const pt of world.particles) {
      ctx.globalAlpha = Math.max(0, pt.life / pt.maxLife);
      ctx.fillStyle = pt.color;
      ctx.fillRect(pt.x - cam.x - pt.size / 2, pt.y - cam.y - pt.size / 2, pt.size, pt.size);
    }
    ctx.globalAlpha = 1;
    if (screen === SCREEN_PLAY || screen === SCREEN_PAUSED) drawHud(world);
    drawScreen(world, screen, save);
  }

  return { draw };
}
