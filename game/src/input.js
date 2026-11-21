// Keyboard + mouse input. Keys are read as a held set each frame; actions are edge-triggered.
export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_ENTER = 4;
export const ACTION_PUNCH = 8;
export const ACTION_SHOOT = 16;
export const ACTION_HORN = 32;

const KEY_ACTIONS = {
  Enter: ACTION_CONFIRM, ' ': ACTION_CONFIRM,
  p: ACTION_PAUSE, P: ACTION_PAUSE, Escape: ACTION_PAUSE,
  e: ACTION_ENTER, E: ACTION_ENTER,
  f: ACTION_PUNCH, F: ACTION_PUNCH,
  g: ACTION_SHOOT, G: ACTION_SHOOT,
  h: ACTION_HORN, H: ACTION_HORN,
};

export function createInput(canvas) {
  const held = new Set();
  const queued = new Set();
  let mouse = { x: 0, y: 0, down: false };

  function onKeyDown(e) {
    if (e.repeat) return;
    held.add(e.key.length === 1 ? e.key.toLowerCase() : e.key);
    const a = KEY_ACTIONS[e.key];
    if (a !== undefined) queued.add(a);
    if ([' ', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) e.preventDefault();
  }
  function onKeyUp(e) {
    held.delete(e.key.length === 1 ? e.key.toLowerCase() : e.key);
  }
  function onMouse(e) {
    const r = canvas.getBoundingClientRect();
    mouse = { x: e.clientX - r.left, y: e.clientY - r.top, down: e.type === 'mousedown' };
    if (e.type === 'mousedown') queued.add(ACTION_CONFIRM);
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  canvas.addEventListener('mousedown', onMouse);
  canvas.addEventListener('mousemove', onMouse);
  canvas.addEventListener('mouseup', onMouse);

  function down(...keys) { return keys.some((k) => held.has(k)); }

  return {
    // -1..1 steering / movement for this frame (WASD + arrows).
    move() {
      const x = (down('d', 'ArrowRight') ? 1 : 0) - (down('a', 'ArrowLeft') ? 1 : 0);
      const y = (down('s', 'ArrowDown') ? 1 : 0) - (down('w', 'ArrowUp') ? 1 : 0);
      return { x, y };
    },
    sprint() { return down('shift'); },
    handbrake() { return down(' '); },
    takeActions(mask = 0xffff) {
      // Only the bits in `mask` are taken; the rest stay queued for the next caller.
      // The loop takes CONFIRM/PAUSE first (screen changes), the world step takes the rest.
      let bits = 0;
      for (const a of queued) {
        if (a & mask) { bits |= a; queued.delete(a); }
      }
      return bits;
    },
    mouse() { return mouse; },
  };
}
