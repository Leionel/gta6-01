// Boot and the one loop: input is read every frame, the world advances in fixed 1/60 s steps,
// and the renderer paints what is there. Screens: title, play, paused, busted, wasted, complete.
//
// ?seed=N fixes the city. ?shot=cover|foot|chase|mission (with &seed=N) stages that scene
// instead of running the loop, paints it twice and sets window.__shotReady for a screenshot.
import { SAVE_KEY, STEP } from './config.js';
import { createWorld, stepWorld, resetGame, serializeSave, applySave, EV_BUSTED, EV_WASTED, EV_MISSION } from './world.js';
import { ACTION_CONFIRM, ACTION_PAUSE, createInput } from './input.js';
import { createRenderer, SCREEN_TITLE, SCREEN_PLAY, SCREEN_PAUSED, SCREEN_BUSTED, SCREEN_WASTED, SCREEN_COMPLETE } from './render.js';
import { createAudio } from './audio.js';
import { stageShot } from './shots.js';
import { MISSIONS } from './config.js';

const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(seed);
const renderer = createRenderer(canvas);
const audio = createAudio();
world.viewW = canvas.width;
world.viewH = canvas.height;

function readSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeSave() {
  try {
    window.localStorage.setItem(SAVE_KEY, serializeSave(world));
  } catch {
    // Storage can be off (private windows): progress then lasts this visit only.
  }
}

function runShot(name) {
  const save = readSave();
  const scene = stageShot(name, world);
  let painted = 0;
  function paint() {
    renderer.draw(world, scene.screen, save);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let save = readSave();
  if (save) applySave(world, JSON.stringify(save));
  // Debug handle for headless playtests (read-only state inspection).
  window.__game = { world, get screen() { return screen; } };
  let accumulator = 0;
  let last = performance.now();
  let saveTimer = 0;

  function announce(message) {
    status.textContent = message;
  }

  function startGame() {
    audio.unlock();
    if (save && save.missionIndex > 0 && world.missionIndex === 0 && world.player.cash === 100) {
      // Continue: keep the loaded progress (applySave already ran at boot).
    }
    world.player.x = world.city.spots.safehouse.x;
    world.player.y = world.city.spots.safehouse.y - 54;
    screen = SCREEN_PLAY;
    announce('Playing. Steal a car and follow the yellow marker.');
  }

  function endTo(nextScreen) {
    screen = nextScreen;
    writeSave();
  }

  function handleActions() {
    const actions = input.takeActions(ACTION_CONFIRM | ACTION_PAUSE);
    if (actions & ACTION_CONFIRM) {
      if (screen === SCREEN_TITLE) startGame();
      else if (screen === SCREEN_BUSTED || screen === SCREEN_WASTED) {
        resetGame(world);
        save = readSave();
        startGame();
      } else if (screen === SCREEN_COMPLETE) {
        screen = SCREEN_PLAY;
      }
    }
    if (actions & ACTION_PAUSE) {
      if (screen === SCREEN_PLAY) { screen = SCREEN_PAUSED; announce('Paused.'); }
      else if (screen === SCREEN_PAUSED) { screen = SCREEN_PLAY; announce('Playing.'); }
    }
    if (input.mouse().down && screen === SCREEN_TITLE) startGame();
  }

  function step() {
    const actions = input.takeActions();
    const events = stepWorld(world, STEP, input, actions, audio);
    if (events & EV_BUSTED) endTo(SCREEN_BUSTED);
    else if (events & EV_WASTED) endTo(SCREEN_WASTED);
    else if (events & EV_MISSION) {
      if (world.missionIndex >= MISSIONS.length) endTo(SCREEN_COMPLETE);
      else writeSave();
    }
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    // Mute toggle is a key, not an action: check it directly.
    handleActions();
    if (screen === SCREEN_PLAY) {
      while (accumulator >= STEP && screen === SCREEN_PLAY) {
        step();
        accumulator -= STEP;
      }
      saveTimer += 1 / 60;
      if (saveTimer > 5) { saveTimer = 0; writeSave(); }
    } else if (screen === SCREEN_TITLE) {
      // A living city behind the title: traffic and pedestrians move, nobody plays.
      while (accumulator >= STEP) {
        stepWorld(world, STEP, { move: () => ({ x: 0, y: 0 }), sprint: () => false, handbrake: () => false, takeActions: () => 0, mouse: () => ({ x: 0, y: 0, down: false }) }, 0, { engine: () => {}, siren: () => {}, gunshot: () => {}, punch: () => {}, crash: () => {}, pickup: () => {}, cash: () => {}, mission: () => {}, fail: () => {}, horn: () => {}, door: () => {}, busted: () => {} });
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
    }
    renderer.draw(world, screen, save);
  }

  window.addEventListener('keydown', (e) => {
    if (e.key === 'm' || e.key === 'M') {
      const muted = audio.toggleMute();
      announce(muted ? 'Muted.' : 'Sound on.');
    }
    if (e.key === 'r' || e.key === 'R') {
      if (screen === SCREEN_PLAY) {
        resetGame(world);
        writeSave();
        announce('Restarted.');
      }
    }
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  announce('Palm City. Press Enter or click to start.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
