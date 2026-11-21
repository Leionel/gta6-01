// Synthesized sound: no audio files, everything is oscillators and noise
// through the Web Audio API. Every call is guarded — a browser without audio
// (or a muted tab) must never break the game.

export function createSound() {
  let ctx = null;
  let master = null;
  let muted = false;
  let engineOsc = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let sirenLfo = null;

  function ensure() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext ?? window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
      return true;
    } catch {
      return false;
    }
  }

  function resume() {
    if (ensure() && ctx.state === 'suspended') ctx.resume().catch(() => {});
  }

  function noiseBuffer(seconds) {
    const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  function blip(freq, dur, type, vol, slideTo) {
    if (!ensure() || muted) return;
    try {
      const t = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t);
      if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
      gain.gain.setValueAtTime(vol, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
      osc.connect(gain);
      gain.connect(master);
      osc.start(t);
      osc.stop(t + dur + 0.02);
    } catch { /* sound is never fatal */ }
  }

  function burst(dur, vol, filterFreq) {
    if (!ensure() || muted) return;
    try {
      const t = ctx.currentTime;
      const src = ctx.createBufferSource();
      src.buffer = noiseBuffer(dur);
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = filterFreq;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(vol, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
      src.connect(filter);
      filter.connect(gain);
      gain.connect(master);
      src.start(t);
      src.stop(t + dur + 0.02);
    } catch { /* sound is never fatal */ }
  }

  return {
    resume,
    setMuted(m) {
      muted = m;
      if (master) master.gain.value = m ? 0 : 0.5;
      if (m) this.engine(0);
    },
    isMuted() {
      return muted;
    },
    /** Continuous engine hum; call every frame with speed 0..1 (0 silences it). */
    engine(speed) {
      if (!ensure() || muted) {
        if (engineGain) engineGain.gain.value = 0;
        return;
      }
      try {
        if (!engineOsc) {
          engineOsc = ctx.createOscillator();
          engineOsc.type = 'sawtooth';
          engineGain = ctx.createGain();
          engineGain.gain.value = 0;
          const filter = ctx.createBiquadFilter();
          filter.type = 'lowpass';
          filter.frequency.value = 420;
          engineOsc.connect(filter);
          filter.connect(engineGain);
          engineGain.connect(master);
          engineOsc.start();
        }
        const t = ctx.currentTime;
        engineOsc.frequency.setTargetAtTime(55 + speed * 130, t, 0.08);
        engineGain.gain.setTargetAtTime(speed > 0.02 ? 0.05 + speed * 0.05 : 0, t, 0.1);
      } catch { /* never fatal */ }
    },
    /** Two-tone police siren; call with true to start, false to stop. */
    siren(on) {
      if (!ensure() || muted) {
        if (sirenGain) sirenGain.gain.value = 0;
        return;
      }
      try {
        if (on && !sirenOsc) {
          sirenOsc = ctx.createOscillator();
          sirenOsc.type = 'triangle';
          sirenOsc.frequency.value = 720;
          sirenLfo = ctx.createOscillator();
          sirenLfo.frequency.value = 0.9;
          const lfoGain = ctx.createGain();
          lfoGain.gain.value = 180;
          sirenLfo.connect(lfoGain);
          lfoGain.connect(sirenOsc.frequency);
          sirenGain = ctx.createGain();
          sirenGain.gain.value = 0.045;
          sirenOsc.connect(sirenGain);
          sirenGain.connect(master);
          sirenOsc.start();
          sirenLfo.start();
        } else if (!on && sirenGain) {
          sirenGain.gain.value = 0;
        }
      } catch { /* never fatal */ }
    },
    shot() { burst(0.14, 0.5, 1800); blip(160, 0.1, 'square', 0.2, 60); },
    punch() { burst(0.09, 0.4, 500); blip(110, 0.08, 'sine', 0.35, 55); },
    crash() { burst(0.3, 0.55, 900); blip(90, 0.25, 'sawtooth', 0.25, 40); },
    pickup() { blip(660, 0.09, 'sine', 0.3); setTimeout(() => blip(990, 0.12, 'sine', 0.3), 80); },
    denied() { blip(180, 0.16, 'square', 0.2, 120); },
    horn() { blip(330, 0.18, 'square', 0.18); blip(415, 0.18, 'square', 0.12); },
    jingle() {
      const notes = [523, 659, 784, 1047];
      notes.forEach((f, i) => setTimeout(() => blip(f, 0.22, 'triangle', 0.3), i * 110));
    },
    click() { blip(880, 0.05, 'sine', 0.2); },
  };
}
