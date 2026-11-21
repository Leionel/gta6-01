// The story: Rook owes Delia Voss $50,000. Five jobs, in order, each picked
// up at a job marker — the garage for most, the pay-n-spray for Heat, where
// an already-wanted driver gets charged and cleared before the job starts.

import { MISSIONS, PLACES, ECONOMY } from './constants.js';
import { dist } from './util.js';
import { paySpray, buyGun } from './actors.js';

// Where each job is picked up.
const JOB_MARKERS = [
  { x: 720, y: 806, label: 'Garage' },
  { x: 720, y: 806, label: 'Garage' },
  { x: 1440, y: 1886, label: 'Pay-n-Spray' },
  { x: 720, y: 806, label: 'Garage' },
  { x: 720, y: 806, label: 'Garage' },
];

export function createStory(sim) {
  return {
    sim,
    index: 0, // which mission is next
    step: 0,
    state: 'idle', // idle | active | done
    timer: 0,
    robT: 0,
    inSpray: false,
    startedAt: 0,
  };
}

export function currentMission(story) {
  return story.index < MISSIONS.length ? MISSIONS[story.index] : null;
}

export function currentStep(story) {
  const m = currentMission(story);
  return m ? m.steps[story.step] : null;
}

/** What the HUD should point at right now, or null. */
export function currentObjective(story) {
  const m = currentMission(story);
  if (!m) return null;
  if (story.state === 'idle') {
    const job = JOB_MARKERS[story.index];
    return { label: `New job: ${m.name} — go to the ${job.label}`, x: job.x, y: job.y, r: 52, job: true };
  }
  const step = m.steps[story.step];
  if (!step) return null;
  return { label: step.label, x: step.x, y: step.y, r: step.r, job: false };
}

function startMission(story) {
  const m = currentMission(story);
  if (!m) return;
  story.state = 'active';
  story.step = 0;
  story.timer = m.timer ?? 0;
  story.robT = 0;
  story.startedAt = story.sim.time;
  story.sim.banners.push({ text: `${m.name} — ${m.intro}`, ttl: 3.5, colour: '#f2b705' });
  story.sim.events.push({ kind: 'missionStarted', index: story.index, id: m.id });
}

function completeMission(story) {
  const sim = story.sim;
  const m = currentMission(story);
  sim.player.cash += m.reward;
  let text = `${m.name} complete!`;
  if (m.reward > 0) text += ` +$${m.reward}`;
  if (m.bonus) {
    sim.player.cash += m.bonus;
    text += ` +$${m.bonus}`;
  }
  sim.banners.push({ text, ttl: 3, colour: '#00b894' });
  sim.sound.jingle();
  sim.events.push({ kind: 'missionComplete', index: story.index, id: m.id, cash: sim.player.cash });
  story.index++;
  story.step = 0;
  story.timer = 0;
  story.robT = 0;
  story.state = story.index >= MISSIONS.length ? 'done' : 'idle';
  if (story.state === 'done') {
    sim.banners.push({ text: 'The debt is paid. Palm City is yours, Rook.', ttl: 5, colour: '#ffd32a' });
    sim.events.push({ kind: 'storyComplete', cash: sim.player.cash });
  }
}

function failMission(story, why) {
  const sim = story.sim;
  sim.banners.push({ text: why, ttl: 3, colour: '#e74c3c' });
  sim.events.push({ kind: 'missionFailed', index: story.index, why });
  story.state = 'idle';
  story.step = 0;
  story.timer = 0;
  story.robT = 0;
}

export function updateStory(story, dt) {
  const sim = story.sim;
  const p = sim.player;
  const m = currentMission(story);
  if (!m) return;

  // The pay-n-spray: driving in while wanted charges $100 and clears the
  // heat. On foot it does nothing. (This is also how Heat's job marker works:
  // a wanted driver arriving there is cleaned before the job starts.)
  const spray = PLACES.spray;
  const nearSpray = dist(p.x, p.y, spray.mx, spray.my) < 58;
  if (nearSpray && p.car && sim.wanted.stars > 0 && !story.inSpray) {
    paySpray(sim);
    story.inSpray = true;
  }
  if (!nearSpray) story.inSpray = false;

  if (story.state === 'idle') {
    const job = JOB_MARKERS[story.index];
    if (dist(p.x, p.y, job.x, job.y) < 52) startMission(story);
    return;
  }

  // Timed jobs run out.
  if (story.timer > 0) {
    story.timer -= dt;
    if (story.timer <= 0) {
      failMission(story, 'Too slow — the job is gone. Go back to the garage.');
      return;
    }
  }

  const step = m.steps[story.step];
  if (!step) {
    completeMission(story);
    return;
  }
  const d = dist(p.x, p.y, step.x, step.y);

  switch (step.kind) {
    case 'goto':
      if (d < step.r) story.step++;
      break;
    case 'enterCar':
      if (p.car && d < step.r) story.step++;
      break;
    case 'heat':
      if (sim.wanted.stars >= 3) story.step++;
      break;
    case 'loseHeat':
      if (sim.wanted.stars === 0) story.step++;
      break;
    case 'steal':
      if (p.car && p.car.model === 'comet') story.step++;
      break;
    case 'rob': {
      if (d < step.r && !p.car) {
        story.robT += dt;
        if (story.robT >= 3) {
          p.cash += 500;
          sim.wanted.stars = 4;
          sim.wanted.unseen = 0;
          sim.banners.push({ text: 'The vault is open! +$500 — and every cop in the city knows', ttl: 3, colour: '#d63031' });
          sim.sound.jingle();
          sim.events.push({ kind: 'robbed', cash: p.cash });
          story.step++;
        }
      } else {
        story.robT = Math.max(0, story.robT - dt * 2);
      }
      break;
    }
    case 'escape':
      if (d < step.r) story.step++;
      break;
    default:
      break;
  }
  if (story.step >= m.steps.length && story.state === 'active') completeMission(story);
}

/** The ENTER key while on foot near a shop that sells something. */
export function interactShop(story) {
  const sim = story.sim;
  const p = sim.player;
  if (p.car) return false;
  const gun = PLACES.gunShop;
  if (dist(p.x, p.y, gun.mx, gun.my) < 64) {
    const ok = buyGun(sim);
    if (!ok) {
      sim.banners.push({ text: p.hasGun ? 'Need $50 for ammo' : 'A pistol costs $300', ttl: 2, colour: '#e74c3c' });
      sim.sound.denied();
    } else {
      sim.banners.push({ text: p.hasGun ? `Ammo +${ECONOMY.ammoPack}` : 'Pistol bought — G to shoot', ttl: 2, colour: '#6c5ce7' });
    }
    return true;
  }
  return false;
}

/** How much of the robbery hold is done, 0..1, for the progress ring. */
export function robProgress(story) {
  return Math.min(1, story.robT / 3);
}
