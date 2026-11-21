// Sound, synthesized with WebAudio only — no audio assets. Every effect is an
// oscillator or a burst of filtered noise.
export function createAudio() {
  let ctx = null;
  let muted = false;
  let engineOsc = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let sirenTimer = 0;
  let sirenHigh = false;

  // Lazily build the context and the two continuous voices (engine, siren).
  function ensure() {
    if (ctx) return ctx;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      ctx = new AC();
      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 50;
      engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      const engineFilter = ctx.createBiquadFilter();
      engineFilter.type = 'lowpass';
      engineFilter.frequency.value = 420;
      engineOsc.connect(engineFilter);
      engineFilter.connect(engineGain);
      engineGain.connect(ctx.destination);
      engineOsc.start();
      sirenOsc = ctx.createOscillator();
      sirenOsc.type = 'triangle';
      sirenGain = ctx.createGain();
      sirenGain.gain.value = 0;
      sirenOsc.connect(sirenGain);
      sirenGain.connect(ctx.destination);
      sirenOsc.start();
    } catch {
      ctx = null;
    }
    return ctx;
  }

  // A short burst of shaped noise (crashes, punches, gunshots, doors).
  function noiseBurst(duration, filterFreq, gainValue, type = 'bandpass') {
    const c = ensure();
    if (!c || muted) return;
    const len = Math.max(1, Math.floor(c.sampleRate * duration));
    const buf = c.createBuffer(1, len, c.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = c.createBufferSource();
    src.buffer = buf;
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.value = filterFreq;
    const g = c.createGain();
    g.gain.value = gainValue;
    src.connect(f);
    f.connect(g);
    g.connect(c.destination);
    src.start();
  }

  // A short pitched tone, optionally sliding (jingles, pickups, horns).
  function tone(freq, duration, gainValue, type = 'sine', slideTo = null) {
    const c = ensure();
    if (!c || muted) return;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    if (slideTo !== null) o.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), c.currentTime + duration);
    const g = c.createGain();
    g.gain.setValueAtTime(gainValue, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + duration);
    o.connect(g);
    g.connect(c.destination);
    o.start();
    o.stop(c.currentTime + duration + 0.02);
  }

  return {
    unlock() {
      ensure();
      if (ctx && ctx.state === 'suspended') ctx.resume();
    },
    toggleMute() {
      muted = !muted;
      if (engineGain) engineGain.gain.value = 0;
      if (sirenGain) sirenGain.gain.value = 0;
      return muted;
    },
    isMuted() {
      return muted;
    },
    // The engine hum follows speed 0..1; call every frame, 0 when on foot.
    engine(speed01, dt) {
      const c = ensure();
      if (!c || muted) {
        if (engineGain) engineGain.gain.value = 0;
        return;
      }
      engineOsc.frequency.value = 55 + speed01 * 165;
      engineGain.gain.value = 0.015 + speed01 * 0.05;
    },
    // The police siren follows whether any police unit is near; call every frame.
    siren(active, dt) {
      const c = ensure();
      if (!c || muted) {
        if (sirenGain) sirenGain.gain.value = 0;
        return;
      }
      if (!active) {
        sirenGain.gain.value = 0;
        return;
      }
      sirenTimer += dt;
      if (sirenTimer > 0.42) {
        sirenTimer = 0;
        sirenHigh = !sirenHigh;
      }
      sirenOsc.frequency.value = sirenHigh ? 920 : 660;
      sirenGain.gain.value = 0.028;
    },
    gunshot() {
      noiseBurst(0.12, 1800, 0.22);
      tone(160, 0.1, 0.12, 'square', 60);
    },
    punch() {
      noiseBurst(0.08, 300, 0.2, 'lowpass');
    },
    crash(strength01) {
      noiseBurst(0.18, 500, 0.1 + strength01 * 0.25, 'lowpass');
    },
    pickup() {
      tone(880, 0.09, 0.12, 'sine');
      setTimeout(() => tone(1320, 0.12, 0.12, 'sine'), 70);
    },
    cash() {
      tone(990, 0.08, 0.12, 'triangle');
      setTimeout(() => tone(1480, 0.14, 0.12, 'triangle'), 80);
    },
    mission() {
      [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => tone(f, 0.16, 0.13, 'triangle'), i * 90));
    },
    fail() {
      tone(220, 0.3, 0.12, 'sawtooth', 110);
    },
    horn() {
      tone(370, 0.18, 0.08, 'square');
      tone(466, 0.18, 0.06, 'square');
    },
    door() {
      noiseBurst(0.06, 900, 0.1, 'lowpass');
    },
    busted() {
      [392, 330, 262].forEach((f, i) => setTimeout(() => tone(f, 0.22, 0.12, 'triangle'), i * 160));
    },
  };
}
