// The engine: boot, the main loop, the screen state machine, the camera,
// saving and loading, and the debug handles the tests drive.
//
// Screens: title → playing ⇄ paused → arrested → playing, and storydone → playing.
// The title runs an "attract" mode: traffic and pedestrians keep the city
// alive behind the title while the camera drifts across it.

import { WORLD, ECONOMY, PLAYER_TUNE } from './constants.js';
import { makeRng } from './util.js';
import { buildCity } from './map.js';
import { createControls, ACT } from './controls.js';
import { createSound } from './sound.js';
import { createSim, stepSim, exitCar, resetAfterArrest } from './actors.js';
import { createStory, updateStory, currentObjective, interactShop } from './story.js';
import { drawWorld, drawHUD, drawMinimap, drawTitle, drawPause, drawArrested, drawStoryDone } from './interface.js';
import { parseShot, setupShot, autopilot, makeDebug } from './staging.js';

const SAVE_KEY = 'palm-city-save-v1';

window.__errors = [];
window.__requests = [];
window.addEventListener('error', (e) => window.__errors.push(String(e.message ?? e.error ?? 'error')));
window.addEventListener('unhandledrejection', (e) => window.__errors.push(`rejection: ${String(e.reason ?? '')}`));

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

function fitCanvas() {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.floor(window.innerWidth * dpr);
  canvas.height = Math.floor(window.innerHeight * dpr);
  canvas.style.width = `${window.innerWidth}px`;
  canvas.style.height = `${window.innerHeight}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
fitCanvas();
window.addEventListener('resize', fitCanvas);

const params = new URLSearchParams(window.location.search);
const seed = Number(params.get('seed') ?? 20261121) || 20261121;
const shot = parseShot(window.location.search);

const sound = createSound();
const controls = createControls(canvas);
const rng = makeRng(seed);
const city = buildCity(seed);
const sim = createSim(city, rng, sound);
const story = createStory(sim);

let screen = 'title';
let camera = { x: WORLD.size / 2, y: WORLD.size / 2 };
let titleAngle = 0;
let arrestFine = 0;
let arrestKind = 'busted';
let lastT = performance.now();
let fps = 0;
let fpsFrames = 0;
let fpsT = 0;
let attractT = 0;

let auto = null;
let shotReadyAt = 0;
if (shot) {
  auto = setupShot(sim, story, shot);
  if (shot.shot === 'cover') screen = 'title';
  else screen = 'playing';
  shotReadyAt = performance.now() + 2200;
  window.__shot = { name: shot.shot, ready: false };
}

function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (typeof data.cash !== 'number' || typeof data.mission !== 'number') return null;
    return data;
  } catch {
    return null;
  }
}

function saveGame() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      cash: sim.player.cash,
      mission: story.index,
      hasGun: sim.player.hasGun,
      ammo: sim.player.ammo,
      hp: Math.round(sim.player.hp),
    }));
  } catch { /* saving is best-effort */ }
}

function applySave(data) {
  sim.player.cash = data.cash;
  sim.player.hasGun = !!data.hasGun;
  sim.player.ammo = data.ammo || 0;
  sim.player.hp = data.hp ?? PLAYER_TUNE.hp;
  story.index = Math.min(data.mission, 5);
  story.state = story.index >= 5 ? 'done' : 'idle';
}

const save = loadSave();

function startPlaying(fresh) {
  if (fresh) {
    try { localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ }
  } else if (save) {
    applySave(save);
  }
  screen = 'playing';
  controls.flush();
  sound.resume();
  sound.click();
}

function restartRun() {
  // A fresh run in the same city: rebuild the simulation, keep the seed.
  const fresh = createSim(city, makeRng(seed), sound);
  Object.assign(sim, fresh);
  const freshStory = createStory(sim);
  Object.assign(story, freshStory);
  screen = 'playing';
  controls.flush();
}

function frame(now) {
  requestAnimationFrame(frame);
  let dt = (now - lastT) / 1000;
  lastT = now;
  dt = Math.min(dt, 0.05);
  fpsFrames++;
  if (now - fpsT >= 1000) {
    fps = fpsFrames;
    fpsFrames = 0;
    fpsT = now;
  }

  const w = window.innerWidth;
  const h = window.innerHeight;
  const acts = controls.take();

  if (acts & ACT.MUTE) sound.setMuted(!sound.isMuted());

  if (screen === 'title') {
    // Attract mode: the city lives, the camera drifts, nobody plays.
    attractT += dt;
    titleAngle += dt * 0.05;
    stepSim(sim, { move: { x: 0, y: 0 }, throttle: 0, brake: 0, handbrake: false, actions: 0 }, dt);
    camera.x = WORLD.size / 2 + Math.cos(titleAngle) * 620;
    camera.y = WORLD.size / 2 + Math.sin(titleAngle * 0.8) * 520;
    drawWorld(ctx, sim, story, camera, w, h, sim.time);
    drawTitle(ctx, w, h, !!save);
    if (acts & ACT.CONFIRM) startPlaying(false);
    if (shot && shot.shot === 'cover' && now >= shotReadyAt) window.__shot.ready = true;
    return;
  }

  if (screen === 'paused') {
    drawWorld(ctx, sim, story, camera, w, h, sim.time);
    drawHUD(ctx, sim, story, w, h);
    drawMinimap(ctx, sim, story, w - 216, 12, 200);
    drawPause(ctx, w, h);
    if (acts & (ACT.PAUSE | ACT.CONFIRM)) {
      screen = 'playing';
      controls.flush();
      sound.click();
    } else if (window.__restartKey) {
      window.__restartKey = false;
      restartRun();
    }
    return;
  }

  if (screen === 'arrested') {
    drawWorld(ctx, sim, story, camera, w, h, sim.time);
    drawArrested(ctx, w, h, arrestFine, arrestKind);
    if (acts & ACT.CONFIRM) {
      screen = 'playing';
      controls.flush();
    }
    return;
  }

  if (screen === 'storydone') {
    drawWorld(ctx, sim, story, camera, w, h, sim.time);
    drawHUD(ctx, sim, story, w, h);
    drawStoryDone(ctx, w, h);
    if (acts & ACT.CONFIRM) {
      screen = 'playing';
      controls.flush();
    }
    return;
  }

  // Playing.
  if (acts & ACT.PAUSE) {
    screen = 'paused';
    saveGame();
    controls.flush();
    sound.click();
    return;
  }

  let input;
  if (auto && auto.kind === 'drive') {
    input = autopilot(sim, auto, dt);
  } else if (auto && auto.kind === 'cover') {
    input = { move: { x: 0, y: 0 }, throttle: 0, brake: 0, handbrake: false, actions: 0 };
  } else {
    input = {
      move: controls.move(),
      throttle: controls.throttle(),
      brake: controls.brake(),
      handbrake: controls.handbrake(),
      actions: acts,
    };
  }
  if (!auto && acts & ACT.ENTER && !sim.player.car) interactShop(story);

  stepSim(sim, input, dt);
  updateStory(story, dt);

  // Drain simulation events into screen changes.
  for (const ev of sim.events.splice(0)) {
    if (ev.kind === 'busted') {
      arrestFine = resetAfterArrest(sim);
      arrestKind = 'busted';
      screen = 'arrested';
      saveGame();
    } else if (ev.kind === 'wasted') {
      arrestFine = resetAfterArrest(sim);
      arrestKind = 'wasted';
      screen = 'arrested';
      saveGame();
    } else if (ev.kind === 'missionComplete') {
      saveGame();
    } else if (ev.kind === 'storyComplete') {
      screen = 'storydone';
      saveGame();
    }
  }

  // Camera follows the player, smoothly.
  const targetX = sim.player.x;
  const targetY = sim.player.y;
  camera.x += (targetX - camera.x) * Math.min(1, dt * 6);
  camera.y += (targetY - camera.y) * Math.min(1, dt * 6);
  camera.x = Math.max(w / 2 - 200, Math.min(WORLD.size - w / 2 + 200, camera.x));
  camera.y = Math.max(h / 2 - 200, Math.min(WORLD.size - h / 2 + 200, camera.y));

  drawWorld(ctx, sim, story, camera, w, h, sim.time);
  drawHUD(ctx, sim, story, w, h);
  drawMinimap(ctx, sim, story, w - 216, 12, 200);

  if (shot && now >= shotReadyAt) window.__shot.ready = true;
}

// The R key restarts a run from the pause screen.
window.addEventListener('keydown', (e) => {
  if ((e.key === 'r' || e.key === 'R') && screen === 'paused') window.__restartKey = true;
  if ((e.key === 'n' || e.key === 'N') && screen === 'title' && save) startPlaying(true);
});

window.__game = makeDebug(sim, story, () => screen, () => fps);
window.__game.save = saveGame;
window.__game.city = city;

requestAnimationFrame(frame);
