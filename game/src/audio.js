// Synthesized sound: every effect is built from WebAudio oscillators and filtered noise,
// so the game ships zero audio assets and makes zero network requests. The context is
// created lazily on the first user gesture (the play click), which is also the only
// moment browsers allow it to start.
export function createAudio() {
  let context = null;
  let master = null;
  let noiseBuffer = null;

  function ensure() {
    if (context) return true;
    try {
      const Ctor = window.AudioContext || window.webkitAudioContext;
      if (!Ctor) return false;
      context = new Ctor();
      master = context.createGain();
      master.gain.value = 0.5;
      master.connect(context.destination);
      const length = context.sampleRate;
      noiseBuffer = context.createBuffer(1, length, context.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
      return true;
    } catch {
      return false;
    }
  }

  function noise({ duration, volume, filterFreq, type = 'lowpass', when = 0 }) {
    if (!ensure()) return;
    const t = context.currentTime + when;
    const source = context.createBufferSource();
    source.buffer = noiseBuffer;
    const filter = context.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = filterFreq;
    const gain = context.createGain();
    gain.gain.setValueAtTime(volume, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
    source.connect(filter).connect(gain).connect(master);
    source.start(t);
    source.stop(t + duration + 0.02);
  }

  function tone({ freq, endFreq = null, duration, volume, type = 'sine', when = 0 }) {
    if (!ensure()) return;
    const t = context.currentTime + when;
    const osc = context.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (endFreq !== null) osc.frequency.exponentialRampToValueAtTime(Math.max(1, endFreq), t + duration);
    const gain = context.createGain();
    gain.gain.setValueAtTime(volume, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
    osc.connect(gain).connect(master);
    osc.start(t);
    osc.stop(t + duration + 0.02);
  }

  return {
    unlock() {
      if (ensure() && context.state === 'suspended') context.resume().catch(() => {});
    },
    shot() {
      noise({ duration: 0.09, volume: 0.5, filterFreq: 2400 });
      tone({ freq: 190, endFreq: 55, duration: 0.1, volume: 0.35, type: 'square' });
    },
    enemyShot(distance) {
      const volume = Math.max(0.03, 0.28 - distance * 0.008);
      noise({ duration: 0.08, volume, filterFreq: 1100 });
    },
    dryFire() {
      tone({ freq: 1400, duration: 0.03, volume: 0.12, type: 'square' });
    },
    reload() {
      tone({ freq: 900, duration: 0.04, volume: 0.14, type: 'square', when: 0 });
      tone({ freq: 620, duration: 0.04, volume: 0.14, type: 'square', when: 0.55 });
      tone({ freq: 1100, duration: 0.05, volume: 0.16, type: 'square', when: 1.35 });
    },
    hit() {
      tone({ freq: 2100, duration: 0.05, volume: 0.22, type: 'sine' });
    },
    kill() {
      tone({ freq: 880, duration: 0.09, volume: 0.25, type: 'sine' });
      tone({ freq: 1318, duration: 0.14, volume: 0.22, type: 'sine', when: 0.07 });
    },
    hurt() {
      noise({ duration: 0.12, volume: 0.25, filterFreq: 500 });
      tone({ freq: 130, endFreq: 70, duration: 0.15, volume: 0.25, type: 'sawtooth' });
    },
    step() {
      noise({ duration: 0.04, volume: 0.05, filterFreq: 700 });
    },
    grenadeThrow() {
      noise({ duration: 0.15, volume: 0.12, filterFreq: 1800, type: 'bandpass' });
    },
    bounce() {
      tone({ freq: 320, endFreq: 180, duration: 0.07, volume: 0.15, type: 'triangle' });
    },
    explosion() {
      noise({ duration: 0.9, volume: 0.7, filterFreq: 900 });
      tone({ freq: 90, endFreq: 28, duration: 0.8, volume: 0.55, type: 'sine' });
    },
    beep(final = false) {
      tone({ freq: final ? 1500 : 1050, duration: final ? 0.3 : 0.09, volume: 0.2, type: 'square' });
    },
    plantStart() {
      tone({ freq: 700, duration: 0.12, volume: 0.2, type: 'square' });
      tone({ freq: 700, duration: 0.12, volume: 0.2, type: 'square', when: 0.2 });
    },
    buy() {
      tone({ freq: 660, duration: 0.06, volume: 0.18, type: 'sine' });
      tone({ freq: 990, duration: 0.09, volume: 0.18, type: 'sine', when: 0.06 });
    },
    denied() {
      tone({ freq: 220, duration: 0.12, volume: 0.18, type: 'square' });
    },
    roundWin() {
      [523, 659, 784].forEach((freq, i) => tone({ freq, duration: 0.16, volume: 0.2, type: 'triangle', when: i * 0.11 }));
    },
    roundLose() {
      [392, 330, 262].forEach((freq, i) => tone({ freq, duration: 0.18, volume: 0.2, type: 'triangle', when: i * 0.12 }));
    },
  };
}
