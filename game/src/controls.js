// Keyboard and mouse: the held keys each frame, and edge-triggered actions.
// WASD and arrows move; E enters/exits/steals a car; F punches; G shoots;
// Space is the handbrake; P or Escape pauses; Enter confirms; H honks; M mutes.

export const ACT = {
  CONFIRM: 1,
  PAUSE: 2,
  ENTER: 4,
  PUNCH: 8,
  SHOOT: 16,
  HORN: 32,
  MUTE: 64,
};

const KEY_ACTIONS = {
  Enter: ACT.CONFIRM, ' ': ACT.CONFIRM,
  p: ACT.PAUSE, P: ACT.PAUSE, Escape: ACT.PAUSE,
  e: ACT.ENTER, E: ACT.ENTER,
  f: ACT.PUNCH, F: ACT.PUNCH,
  g: ACT.SHOOT, G: ACT.SHOOT,
  h: ACT.HORN, H: ACT.HORN,
  m: ACT.MUTE, M: ACT.MUTE,
};

export function createControls(canvas) {
  const held = new Set();
  const queued = new Set();
  let pointer = { x: 0, y: 0, down: false };

  function keyDown(e) {
    if (e.repeat) return;
    held.add(e.key.length === 1 ? e.key.toLowerCase() : e.key);
    const a = KEY_ACTIONS[e.key];
    if (a !== undefined) queued.add(a);
    if ([' ', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) e.preventDefault();
  }
  function keyUp(e) {
    held.delete(e.key.length === 1 ? e.key.toLowerCase() : e.key);
  }
  function pointerMove(e) {
    const r = canvas.getBoundingClientRect();
    pointer = { x: e.clientX - r.left, y: e.clientY - r.top, down: pointer.down };
  }
  function pointerDown(e) {
    pointerMove(e);
    pointer.down = true;
    queued.add(ACT.CONFIRM);
  }
  function pointerUp() {
    pointer.down = false;
  }

  window.addEventListener('keydown', keyDown);
  window.addEventListener('keyup', keyUp);
  canvas.addEventListener('mousedown', pointerDown);
  canvas.addEventListener('mousemove', pointerMove);
  window.addEventListener('mouseup', pointerUp);

  const down = (...keys) => keys.some((k) => held.has(k));

  return {
    /** -1..1 steering/movement for this frame (WASD + arrows). */
    move() {
      const x = (down('d', 'ArrowRight') ? 1 : 0) - (down('a', 'ArrowLeft') ? 1 : 0);
      const y = (down('s', 'ArrowDown') ? 1 : 0) - (down('w', 'ArrowUp') ? 1 : 0);
      return { x, y };
    },
    throttle() {
      return down('w', 'ArrowUp') ? 1 : 0;
    },
    brake() {
      return down('s', 'ArrowDown') ? 1 : 0;
    },
    handbrake() {
      return down(' ');
    },
    /** Take the queued actions matching `mask`; the rest stay queued. */
    take(mask = 0xffff) {
      let bits = 0;
      for (const a of queued) {
        if (a & mask) {
          bits |= a;
          queued.delete(a);
        }
      }
      return bits;
    },
    /** Clear everything (used when the game state changes). */
    flush() {
      queued.clear();
      held.clear();
    },
    pointer() {
      return pointer;
    },
  };
}
