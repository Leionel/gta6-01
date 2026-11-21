// Keyboard and mouse. Movement is read as a held set each frame; one-off
// actions (enter, punch, shoot, pause…) are edge-triggered through a queue.
export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_ENTER = 4;
export const ACTION_PUNCH = 8;
export const ACTION_SHOOT = 16;
export const ACTION_HORN = 32;

const KEY_TO_ACTION = {
  Enter: ACTION_CONFIRM,
  ' ': ACTION_CONFIRM,
  p: ACTION_PAUSE,
  P: ACTION_PAUSE,
  Escape: ACTION_PAUSE,
  e: ACTION_ENTER,
  E: ACTION_ENTER,
  f: ACTION_PUNCH,
  F: ACTION_PUNCH,
  g: ACTION_SHOOT,
  G: ACTION_SHOOT,
  h: ACTION_HORN,
  H: ACTION_HORN,
};

export function createInput(canvas) {
  const held = new Set();
  const queued = new Set();
  let mouse = { x: 0, y: 0, down: false };

  function keyDown(e) {
    if (e.repeat) return;
    held.add(e.key.length === 1 ? e.key.toLowerCase() : e.key);
    const action = KEY_TO_ACTION[e.key];
    if (action !== undefined) queued.add(action);
    if ([' ', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) e.preventDefault();
  }
  function keyUp(e) {
    held.delete(e.key.length === 1 ? e.key.toLowerCase() : e.key);
  }
  function mouseEvent(e) {
    const rect = canvas.getBoundingClientRect();
    mouse = { x: e.clientX - rect.left, y: e.clientY - rect.top, down: e.type === 'mousedown' };
    if (e.type === 'mousedown') queued.add(ACTION_CONFIRM);
  }

  window.addEventListener('keydown', keyDown);
  window.addEventListener('keyup', keyUp);
  canvas.addEventListener('mousedown', mouseEvent);
  canvas.addEventListener('mousemove', mouseEvent);
  canvas.addEventListener('mouseup', mouseEvent);

  function isDown(...keys) {
    return keys.some((k) => held.has(k));
  }

  return {
    // Steering / movement for this frame, each component -1, 0 or 1 (WASD + arrows).
    move() {
      const x = (isDown('d', 'ArrowRight') ? 1 : 0) - (isDown('a', 'ArrowLeft') ? 1 : 0);
      const y = (isDown('s', 'ArrowDown') ? 1 : 0) - (isDown('w', 'ArrowUp') ? 1 : 0);
      return { x, y };
    },
    sprint() {
      return isDown('shift');
    },
    handbrake() {
      return isDown(' ');
    },
    // Take the queued actions whose bits are in `mask`; the rest stay queued
    // for the next caller. The loop takes CONFIRM/PAUSE first (they change
    // screens), the world step takes the rest.
    takeActions(mask = 0xffff) {
      let bits = 0;
      for (const a of queued) {
        if (a & mask) {
          bits |= a;
          queued.delete(a);
        }
      }
      return bits;
    },
    mouse() {
      return mouse;
    },
  };
}
