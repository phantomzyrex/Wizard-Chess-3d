// ============================================================================
// Procedural Gothic Sanctum Web Audio Engine + Looping Background Music
// Synthesizes:
// 1. Continuous Looping Background Music (84 BPM Neo-Soul / Lo-Fi Jazz-Hop
//    arrangement matching the uploaded track: Rhodes electric piano 9th chords,
//    warm vinyl/rain texture, swung boom-bap drums, deep electric bass,
//    crystalline bell melody, and expressive guitar + string ensemble bridge),
//    plus seamless support for custom uploaded audio files (persisted in IndexedDB).
// 2. Cathedral acoustics, stone-on-stone slides & collisions, melee weapon
//    strikes, and multi-layered stone shatter explosions.
// ============================================================================

export function createSanctumAudioEngine() {
  /** @type {AudioContext | null} */
  let ctx = null;
  /** @type {GainNode | null} */
  let masterGain = null;
  /** @type {GainNode | null} */
  let sfxBus = null;
  /** @type {GainNode | null} */
  let bgmBus = null;
  /** @type {GainNode | null} */
  let reverbSend = null;
  /** @type {GainNode | null} */
  let ambientBus = null;
  /** @type {AudioBuffer | null} */
  let noiseBuffer = null;

  let isMuted = false;
  let ambientStarted = false;
  let bgmStarted = false;
  let customBgmActive = false;
  /** @type {AudioBufferSourceNode | null} */
  let customBgmSource = null;
  /** @type {AudioBuffer | null} */
  let customBgmBuffer = null;
  /** @type { number | null } */
  let bgmSchedulerTimer = null;

  let lastShardClatterMs = 0;
  let lastBystanderBumpMs = 0;

  // Active continuous stone slide state (for moving or dragged pieces)
  /** @type {{ source: AudioBufferSourceNode, filter: BiquadFilterNode, rumbleOsc: OscillatorNode, gain: GainNode } | null} */
  let activeSlideNodes = null;

  const PIECE_WEIGHT_PITCH = {
    pawn: 1.18,
    bishop: 1.04,
    knight: 0.98,
    queen: 0.90,
    rook: 0.82,
    king: 0.76
  };

  function midiToFreq(midi) {
    return 440 * Math.pow(2, (midi - 69) / 12);
  }

  function createPinkNoiseBuffer(audioCtx, durationSec = 4.0) {
    const sampleRate = audioCtx.sampleRate;
    const length = Math.floor(sampleRate * durationSec);
    const buffer = audioCtx.createBuffer(1, length, sampleRate);
    const data = buffer.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < length; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.96900 * b2 + white * 0.1538520;
      b3 = 0.86650 * b3 + white * 0.3104856;
      b4 = 0.55000 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.0168980;
      data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.045;
      b6 = white * 0.115926;
    }
    return buffer;
  }

  function createCathedralImpulseResponse(audioCtx, durationSec = 2.6) {
    const rate = audioCtx.sampleRate;
    const length = Math.floor(rate * durationSec);
    const impulse = audioCtx.createBuffer(2, length, rate);
    const left = impulse.getChannelData(0);
    const right = impulse.getChannelData(1);

    const earlyTapMs = [14, 27, 43, 68, 95, 132];
    const earlyGains = [0.42, 0.34, 0.28, 0.22, 0.17, 0.13];

    for (let i = 0; i < length; i++) {
      const t = i / rate;
      const env = Math.pow(1 - i / length, 2.45) * Math.exp(-t * 1.65);
      const damp = Math.exp(-t * 2.2);
      left[i] = ((Math.random() * 2 - 1) * 0.7 + (Math.random() * 2 - 1) * 0.3 * damp) * env * 0.38;
      right[i] = ((Math.random() * 2 - 1) * 0.7 + (Math.random() * 2 - 1) * 0.3 * damp) * env * 0.38;
    }

    for (let k = 0; k < earlyTapMs.length; k++) {
      const idx = Math.floor((earlyTapMs[k] / 1000) * rate);
      if (idx < length) {
        left[idx] += (k % 2 === 0 ? 1 : -0.8) * earlyGains[k];
        right[idx] += (k % 2 === 0 ? -0.8 : 1) * earlyGains[k];
      }
    }

    return impulse;
  }

  // ==========================================================================
  // IndexedDB Persistence for User-Provided Custom Audio File
  // ==========================================================================
  function openAudioDb() {
    return new Promise((resolve) => {
      if (typeof indexedDB === 'undefined') {
        resolve(null);
        return;
      }
      try {
        const req = indexedDB.open('wizard_chess_audio_db', 1);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains('tracks')) {
            db.createObjectStore('tracks');
          }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
      } catch (e) {
        resolve(null);
      }
    });
  }

  async function saveCustomAudioBufferToDb(arrayBuffer) {
    const db = await openAudioDb();
    if (!db) return;
    try {
      const tx = db.transaction('tracks', 'readwrite');
      tx.objectStore('tracks').put(arrayBuffer, 'custom_bgm');
    } catch (e) {}
  }

  async function loadCustomAudioBufferFromDb() {
    const db = await openAudioDb();
    if (!db) return null;
    return new Promise((resolve) => {
      try {
        const tx = db.transaction('tracks', 'readonly');
        const req = tx.objectStore('tracks').get('custom_bgm');
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => resolve(null);
      } catch (e) {
        resolve(null);
      }
    });
  }

  function ensureContext() {
    if (typeof window === 'undefined') return null;
    if (navigator.webdriver) return null; // Skip audio synthesis in headless test runners

    if (!ctx) {
      const AudioCtx = window.AudioContext || window['webkitAudioContext'];
      if (!AudioCtx) return null;
      try {
        ctx = new AudioCtx();
      } catch (e) {
        return null;
      }

      const compressor = ctx.createDynamicsCompressor();
      compressor.threshold.value = -14;
      compressor.knee.value = 18;
      compressor.ratio.value = 4;
      compressor.attack.value = 0.004;
      compressor.release.value = 0.18;

      masterGain = ctx.createGain();
      masterGain.gain.value = isMuted ? 0 : 0.90;
      compressor.connect(masterGain);
      masterGain.connect(ctx.destination);

      sfxBus = ctx.createGain();
      sfxBus.gain.value = 0.95;
      sfxBus.connect(compressor);

      bgmBus = ctx.createGain();
      bgmBus.gain.value = 0.56;
      bgmBus.connect(compressor);

      ambientBus = ctx.createGain();
      ambientBus.gain.value = 0.24;
      ambientBus.connect(compressor);

      // Cathedral Vault Convolution Reverb Bus
      reverbSend = ctx.createGain();
      reverbSend.gain.value = 0.34;
      try {
        const convolver = ctx.createConvolver();
        convolver.buffer = createCathedralImpulseResponse(ctx, 2.5);
        const reverbReturn = ctx.createGain();
        reverbReturn.gain.value = 0.48;
        reverbSend.connect(convolver);
        convolver.connect(reverbReturn);
        reverbReturn.connect(compressor);
      } catch (e) {
        reverbSend.connect(compressor);
      }

      noiseBuffer = createPinkNoiseBuffer(ctx, 4.0);
    }

    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }

    if (!ambientStarted && ctx.state === 'running') {
      startCathedralAmbience();
    }
    if (!bgmStarted && ctx.state === 'running') {
      startBackgroundMusicLoop();
    }

    return ctx;
  }

  // ==========================================================================
  // 1. Looping Background Music Engine (84 BPM Neo-Soul / Lo-Fi Jazz-Hop
  //    Arrangement + Automatic Custom Audio File / IndexedDB Loop Support)
  // ==========================================================================
  // Transcribed from the 2:58 uploaded track:
  // - Key: G# minor / B major (84 BPM, 16-step swung 16th grid per bar)
  // - 20-bar cycle:
  //   Bars 0..3:   Warm Rhodes 9th Chords + Vinyl/Rain Intro
  //   Bars 4..11:  Main Boom-Bap Groove + Deep Neo-Soul Bass + Rhodes + Bell Melody
  //   Bars 12..15: Expressive Acoustic Guitar Lead + Lush String Ensemble Bridge
  //   Bars 16..19: Full Climax Groove & Warm Rhodes Turnaround into seamless loop
  const BGM_BPM = 84;
  const STEP_SEC = 60 / BGM_BPM / 4; // 16th note = 0.17857s
  const TOTAL_BARS = 20;

  const CHORD_PROGRESSION = [
    // G#m9 (G#2, D#3, F#3, A#3, B3, D#4)
    { root: 44, notes: [56, 59, 63, 66, 70], guitar: [68, 70, 71, 75, 73, 71, 68, 66] },
    // C#m9 (C#2, G#2, B2, D#3, E3, G#3)
    { root: 37, notes: [52, 56, 59, 63, 68], guitar: [64, 68, 71, 73, 75, 71, 68, 64] },
    // F#13 (F#2, C#3, E3, G#3, A#3, D#4)
    { root: 42, notes: [54, 58, 61, 64, 68], guitar: [66, 70, 73, 75, 78, 75, 73, 70] },
    // Bmaj9 -> D#7(b9) turnaround
    { root: 35, altRoot: 39, notes: [54, 58, 61, 63, 66], altNotes: [55, 58, 63, 64, 69], guitar: [63, 66, 70, 71, 75, 70, 67, 63] }
  ];

  // Crystalline Rhodes/Bell upper melody notes (indexed by 16th step 0..15 across 4-bar phrases)
  const BELL_MELODY_STEPS = [
    { step: 2, midi: 75, dur: 0.45 },
    { step: 5, midi: 73, dur: 0.35 },
    { step: 7, midi: 71, dur: 0.55 },
    { step: 11, midi: 70, dur: 0.40 },
    { step: 14, midi: 68, dur: 0.65 },
    { step: 18, midi: 71, dur: 0.45 },
    { step: 22, midi: 75, dur: 0.55 },
    { step: 27, midi: 78, dur: 0.50 },
    { step: 30, midi: 75, dur: 0.65 },
    { step: 34, midi: 73, dur: 0.45 },
    { step: 38, midi: 70, dur: 0.55 },
    { step: 43, midi: 71, dur: 0.50 },
    { step: 46, midi: 68, dur: 0.70 },
    { step: 50, midi: 66, dur: 0.50 },
    { step: 54, midi: 70, dur: 0.55 },
    { step: 58, midi: 67, dur: 0.60 },
    { step: 61, midi: 68, dur: 0.80 }
  ];

  function triggerRhodesChord(notes, time, duration, velocity = 0.14) {
    if (!ctx || !bgmBus || customBgmActive) return;

    notes.forEach((midi, idx) => {
      if (!ctx || !bgmBus) return;
      // Gentle harp-like roll across chord tones (22ms per voice)
      const noteTime = time + idx * 0.024;
      const freq = midiToFreq(midi);

      // Warm Electric Piano (Rhodes) tine + body synthesis
      const bodyOsc = ctx.createOscillator();
      bodyOsc.type = 'sine';
      bodyOsc.frequency.setValueAtTime(freq, noteTime);

      const tineOsc = ctx.createOscillator();
      tineOsc.type = 'triangle';
      tineOsc.frequency.setValueAtTime(freq * 2, noteTime);
      tineOsc.detune.setValueAtTime((idx - 2) * 3.5, noteTime);

      const tineGain = ctx.createGain();
      tineGain.gain.setValueAtTime(velocity * 0.28, noteTime);
      tineGain.gain.exponentialRampToValueAtTime(0.0005, noteTime + Math.min(0.45, duration * 0.4));

      const voiceGain = ctx.createGain();
      const noteVel = velocity * (1 - idx * 0.06);
      voiceGain.gain.setValueAtTime(0.0008, noteTime);
      voiceGain.gain.linearRampToValueAtTime(noteVel, noteTime + 0.018);
      voiceGain.gain.exponentialRampToValueAtTime(noteVel * 0.42, noteTime + duration * 0.55);
      voiceGain.gain.exponentialRampToValueAtTime(0.0006, noteTime + duration);

      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(1450, noteTime);
      lp.frequency.exponentialRampToValueAtTime(620, noteTime + duration * 0.8);

      bodyOsc.connect(lp);
      tineOsc.connect(tineGain);
      tineGain.connect(lp);
      lp.connect(voiceGain);
      voiceGain.connect(bgmBus);
      if (reverbSend) voiceGain.connect(reverbSend);

      bodyOsc.start(noteTime);
      tineOsc.start(noteTime);
      bodyOsc.stop(noteTime + duration + 0.04);
      tineOsc.stop(noteTime + duration + 0.04);
    });
  }

  function triggerWarmBassNote(midi, time, duration, velocity = 0.28) {
    if (!ctx || !bgmBus || customBgmActive) return;
    const freq = midiToFreq(midi);

    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, time);

    const subOsc = ctx.createOscillator();
    subOsc.type = 'sine';
    subOsc.frequency.setValueAtTime(freq, time);

    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(310, time);
    lp.frequency.exponentialRampToValueAtTime(135, time + duration * 0.85);

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.001, time);
    g.gain.linearRampToValueAtTime(velocity, time + 0.016);
    g.gain.setValueAtTime(velocity * 0.82, time + duration * 0.65);
    g.gain.exponentialRampToValueAtTime(0.0008, time + duration);

    osc.connect(lp);
    subOsc.connect(lp);
    lp.connect(g);
    g.connect(bgmBus);

    osc.start(time);
    subOsc.start(time);
    osc.stop(time + duration + 0.03);
    subOsc.stop(time + duration + 0.03);
  }

  function triggerBellNote(midi, time, duration, velocity = 0.075) {
    if (!ctx || !bgmBus || customBgmActive) return;
    const freq = midiToFreq(midi);

    const osc1 = ctx.createOscillator();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(freq, time);

    const osc2 = ctx.createOscillator();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(freq * 3.0, time);

    const overtoneGain = ctx.createGain();
    overtoneGain.gain.setValueAtTime(velocity * 0.25, time);
    overtoneGain.gain.exponentialRampToValueAtTime(0.0004, time + 0.14);

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0008, time);
    g.gain.linearRampToValueAtTime(velocity, time + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0006, time + duration);

    osc1.connect(g);
    osc2.connect(overtoneGain);
    overtoneGain.connect(g);
    g.connect(bgmBus);
    if (reverbSend) g.connect(reverbSend);

    osc1.start(time);
    osc2.start(time);
    osc1.stop(time + duration + 0.03);
    osc2.stop(time + duration + 0.03);
  }

  function triggerAcousticGuitarPluck(midi, time, duration, velocity = 0.11) {
    if (!ctx || !bgmBus || customBgmActive) return;
    const freq = midiToFreq(midi);

    const osc1 = ctx.createOscillator();
    osc1.type = 'sawtooth';
    osc1.frequency.setValueAtTime(freq, time);

    const osc2 = ctx.createOscillator();
    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(freq, time);
    osc2.detune.setValueAtTime(4.5, time);

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(2400, time);
    filter.frequency.exponentialRampToValueAtTime(580, time + duration * 0.75);
    filter.Q.value = 2.1;

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.001, time);
    g.gain.linearRampToValueAtTime(velocity, time + 0.009);
    g.gain.exponentialRampToValueAtTime(0.0008, time + duration);

    osc1.connect(filter);
    osc2.connect(filter);
    filter.connect(g);
    g.connect(bgmBus);
    if (reverbSend) g.connect(reverbSend);

    osc1.start(time);
    osc2.start(time);
    osc1.stop(time + duration + 0.03);
    osc2.stop(time + duration + 0.03);
  }

  function triggerLushStringsPad(notes, time, duration, velocity = 0.048) {
    if (!ctx || !bgmBus || customBgmActive) return;
    notes.forEach((midi, idx) => {
      if (!ctx || !bgmBus) return;
      const freq = midiToFreq(midi + 12);
      const oscA = ctx.createOscillator();
      const oscB = ctx.createOscillator();
      oscA.type = 'sawtooth';
      oscB.type = 'sawtooth';
      oscA.frequency.setValueAtTime(freq, time);
      oscB.frequency.setValueAtTime(freq, time);
      oscA.detune.setValueAtTime(-7 - idx * 1.5, time);
      oscB.detune.setValueAtTime(7 + idx * 1.5, time);

      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(1150, time);

      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0008, time);
      g.gain.linearRampToValueAtTime(velocity, time + Math.min(0.65, duration * 0.35));
      g.gain.setValueAtTime(velocity * 0.85, time + duration * 0.72);
      g.gain.exponentialRampToValueAtTime(0.0008, time + duration);

      oscA.connect(lp);
      oscB.connect(lp);
      lp.connect(g);
      g.connect(bgmBus);
      if (reverbSend) g.connect(reverbSend);

      oscA.start(time);
      oscB.start(time);
      oscA.stop(time + duration + 0.05);
      oscB.stop(time + duration + 0.05);
    });
  }

  function triggerBoomBapKick(time, velocity = 0.34) {
    if (!ctx || !bgmBus || customBgmActive) return;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(122, time);
    osc.frequency.exponentialRampToValueAtTime(48, time + 0.045);
    osc.frequency.exponentialRampToValueAtTime(34, time + 0.16);

    const g = ctx.createGain();
    g.gain.setValueAtTime(velocity, time);
    g.gain.exponentialRampToValueAtTime(0.001, time + 0.19);

    osc.connect(g);
    g.connect(bgmBus);
    osc.start(time);
    osc.stop(time + 0.20);
  }

  function triggerBoomBapSnare(time, velocity = 0.20) {
    if (!ctx || !bgmBus || !noiseBuffer || customBgmActive) return;

    // Warm wood rim/body
    const bodyOsc = ctx.createOscillator();
    bodyOsc.type = 'triangle';
    bodyOsc.frequency.setValueAtTime(210, time);
    bodyOsc.frequency.exponentialRampToValueAtTime(118, time + 0.065);

    const bodyGain = ctx.createGain();
    bodyGain.gain.setValueAtTime(velocity * 0.75, time);
    bodyGain.gain.exponentialRampToValueAtTime(0.001, time + 0.075);

    bodyOsc.connect(bodyGain);
    bodyGain.connect(bgmBus);
    bodyOsc.start(time);
    bodyOsc.stop(time + 0.08);

    // Crisp snare wires
    const snapSrc = ctx.createBufferSource();
    snapSrc.buffer = noiseBuffer;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(1850, time);
    bp.Q.value = 1.4;

    const snapGain = ctx.createGain();
    snapGain.gain.setValueAtTime(velocity, time);
    snapGain.gain.exponentialRampToValueAtTime(0.0008, time + 0.125);

    snapSrc.connect(bp);
    bp.connect(snapGain);
    snapGain.connect(bgmBus);
    if (reverbSend) snapGain.connect(reverbSend);
    snapSrc.start(time, Math.random() * 2.0, 0.14);
  }

  function triggerBoomBapHat(time, isOpen = false, velocity = 0.065) {
    if (!ctx || !bgmBus || !noiseBuffer || customBgmActive) return;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer;

    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.setValueAtTime(5800, time);

    const dur = isOpen ? 0.16 : 0.038;
    const g = ctx.createGain();
    g.gain.setValueAtTime(velocity, time);
    g.gain.exponentialRampToValueAtTime(0.0006, time + dur);

    src.connect(hp);
    hp.connect(g);
    g.connect(bgmBus);
    src.start(time, Math.random() * 2.5, dur + 0.02);
  }

  function scheduleBgmBar(barIndex, barStartTime) {
    if (!ctx || customBgmActive) return;
    const cycleBar = barIndex % TOTAL_BARS;
    const phraseBar = cycleBar % 4;
    const chord = CHORD_PROGRESSION[phraseBar];
    const barDur = STEP_SEC * 16;

    const isIntro = cycleBar < 4;
    const isBridge = cycleBar >= 12 && cycleBar < 16;

    // 1. Warm Rhodes Electric Piano Chords
    if (phraseBar === 3 && chord.altNotes) {
      triggerRhodesChord(chord.notes, barStartTime, barDur * 0.52, isIntro ? 0.15 : 0.125);
      triggerRhodesChord(chord.altNotes, barStartTime + barDur * 0.5, barDur * 0.50, isIntro ? 0.14 : 0.12);
    } else {
      triggerRhodesChord(chord.notes, barStartTime, barDur * 0.96, isIntro ? 0.15 : 0.125);
    }

    // 2. Lush Strings + Expressive Acoustic Guitar Lead in Bridge (Bars 12..15) & Climax (Bars 16..19)
    if (isBridge || cycleBar >= 16) {
      triggerLushStringsPad(chord.notes.slice(0, 4), barStartTime, barDur * 0.98, isBridge ? 0.046 : 0.034);
      const gNotes = chord.guitar;
      for (let s = 0; s < 8; s++) {
        const gMidi = gNotes[s % gNotes.length];
        const swingOffset = (s % 2 === 1) ? STEP_SEC * 0.18 : 0;
        const tStep = barStartTime + s * (STEP_SEC * 2) + swingOffset;
        triggerAcousticGuitarPluck(gMidi, tStep, STEP_SEC * 2.1, isBridge ? 0.105 : 0.075);
      }
    }

    // 3. Crystalline Bell Counter-Melody (Bars 6..11 and 16..19)
    if ((cycleBar >= 6 && cycleBar < 12) || cycleBar >= 16) {
      for (const bm of BELL_MELODY_STEPS) {
        if (Math.floor(bm.step / 16) === phraseBar) {
          const localStep = bm.step % 16;
          const swing = (localStep % 2 === 1) ? STEP_SEC * 0.22 : 0;
          triggerBellNote(bm.midi, barStartTime + localStep * STEP_SEC + swing, bm.dur, 0.072);
        }
      }
    }

    // 4. Boom-Bap Swung Drum Groove & Deep Neo-Soul Bassline (Bars 4..19)
    if (!isIntro) {
      // Pickup snare/kick at the very end of Bar 3 is handled below; here is full groove:
      for (let step = 0; step < 16; step++) {
        const swing = (step % 2 === 1) ? STEP_SEC * 0.24 : 0;
        const t = barStartTime + step * STEP_SEC + swing;

        // Kick on 0, ghost on 7, kick on 8, ghost on 10, pickup on 14
        if (step === 0 || step === 8) {
          triggerBoomBapKick(t, 0.34);
        } else if (step === 7 || step === 10 || (phraseBar === 3 && step === 14)) {
          triggerBoomBapKick(t, 0.21);
        }

        // Crisp Boom-Bap Snare on Beat 2 (step 4) and Beat 4 (step 12)
        if (step === 4 || step === 12) {
          triggerBoomBapSnare(t, 0.21);
        }

        // Swung 8th & 16th Hi-Hats
        if (step % 2 === 0) {
          triggerBoomBapHat(t, false, 0.062);
        } else if (step === 15) {
          triggerBoomBapHat(t, true, 0.075);
        } else if (step === 3 || step === 11) {
          triggerBoomBapHat(t, false, 0.036);
        }
      }

      // Deep Neo-Soul Bassline locking with the kick
      const root = chord.root;
      const fifth = root + 7;
      const octave = root + 12;
      triggerWarmBassNote(root, barStartTime, STEP_SEC * 6.5, 0.28);
      triggerWarmBassNote(fifth, barStartTime + STEP_SEC * 7 + STEP_SEC * 0.24, STEP_SEC * 1.2, 0.19);
      if (phraseBar === 3 && chord.altRoot) {
        triggerWarmBassNote(chord.altRoot, barStartTime + STEP_SEC * 8, STEP_SEC * 5.5, 0.27);
        triggerWarmBassNote(chord.altRoot + 7, barStartTime + STEP_SEC * 14, STEP_SEC * 2.0, 0.21);
      } else {
        triggerWarmBassNote(root, barStartTime + STEP_SEC * 8, STEP_SEC * 5.5, 0.26);
        triggerWarmBassNote(octave, barStartTime + STEP_SEC * 14, STEP_SEC * 2.0, 0.20);
      }
    } else if (cycleBar === 3) {
      // Iconic drum drop pickup on beat 4 of Bar 3 (matching 0:11 in the uploaded track!)
      const tSnarePickup = barStartTime + 12 * STEP_SEC;
      const tKickPickup = barStartTime + 14 * STEP_SEC + STEP_SEC * 0.22;
      triggerBoomBapSnare(tSnarePickup, 0.24);
      triggerBoomBapKick(tKickPickup, 0.28);
    }
  }

  function startCustomBufferPlayback(audioBuf) {
    if (!ctx || !bgmBus || !audioBuf) return;
    customBgmBuffer = audioBuf;
    customBgmActive = true;
    if (customBgmSource) {
      try {
        customBgmSource.stop();
      } catch (e) {}
      customBgmSource = null;
    }
    const src = ctx.createBufferSource();
    src.buffer = audioBuf;
    src.loop = true;
    src.connect(bgmBus);
    src.start(0);
    customBgmSource = src;
  }

  async function tryAutoLoadCustomBgm() {
    if (!ctx) return false;
    // 1. Check IndexedDB for a previously uploaded custom track
    const savedBuf = await loadCustomAudioBufferFromDb();
    if (savedBuf && ctx) {
      try {
        const decoded = await ctx.decodeAudioData(savedBuf.slice(0));
        startCustomBufferPlayback(decoded);
        return true;
      } catch (e) {}
    }
    // 2. Load the default bundled track from /assets/audio/bgm.wav (or bgm.mp3) in public/assets/audio/
    const candidateUrls = [
      '/assets/audio/bgm.wav',
      './assets/audio/bgm.wav',
      '/assets/audio/bgm.mp3',
      './assets/audio/bgm.mp3'
    ];
    for (const url of candidateUrls) {
      try {
        const res = await fetch(url);
        if (res.ok) {
          const ct = (res.headers.get('content-type') || '').toLowerCase();
          if (!ct.includes('text/html')) {
            const arrBuf = await res.arrayBuffer();
            if (arrBuf.byteLength > 1024 && ctx) {
              const decoded = await ctx.decodeAudioData(arrBuf);
              startCustomBufferPlayback(decoded);
              return true;
            }
          }
        }
      } catch (e) {}
    }
    return false;
  }

  function startBackgroundMusicLoop() {
    if (bgmStarted || !ctx || !bgmBus) return;
    bgmStarted = true;

    // Check if a custom audio file is stored in IndexedDB or /assets/audio/bgm.mp3
    tryAutoLoadCustomBgm();

    // Start sample-accurate Web Audio lookahead scheduler for the looping background music
    let nextBarIndex = 0;
    let nextBarTime = ctx.currentTime + 0.08;
    const barDuration = STEP_SEC * 16;

    const tickScheduler = () => {
      if (!ctx) return;
      if (!customBgmActive && ctx.state === 'running') {
        while (nextBarTime < ctx.currentTime + 1.5) {
          scheduleBgmBar(nextBarIndex, nextBarTime);
          nextBarTime += barDuration;
          nextBarIndex = (nextBarIndex + 1) % TOTAL_BARS;
        }
      } else if (ctx.state === 'running') {
        nextBarTime = ctx.currentTime + 0.1;
      }
    };

    tickScheduler();
    bgmSchedulerTimer = window.setInterval(tickScheduler, 350);
  }

  async function loadUserAudioFile(file) {
    if (!file) return false;
    const audioCtx = ensureContext();
    if (!audioCtx) return false;
    try {
      const arrBuf = await file.arrayBuffer();
      await saveCustomAudioBufferToDb(arrBuf.slice(0));
      const decoded = await audioCtx.decodeAudioData(arrBuf.slice(0));
      startCustomBufferPlayback(decoded);
      return true;
    } catch (e) {
      console.warn('Could not decode audio file:', e);
      return false;
    }
  }

  // ==========================================================================
  // 2. Ambient Cathedral Background Soundscape (Nave Wind & Brazier Hearth)
  // ==========================================================================
  function startCathedralAmbience() {
    if (ambientStarted || !ctx || !ambientBus || !noiseBuffer) return;
    ambientStarted = true;

    const now = ctx.currentTime;
    ambientBus.gain.setValueAtTime(0.001, now);
    ambientBus.gain.exponentialRampToValueAtTime(0.24, now + 2.0);

    // Layer A: Warm Vinyl Rain / Clerestory Draft Texture
    const windSource = ctx.createBufferSource();
    windSource.buffer = noiseBuffer;
    windSource.loop = true;

    const windFilter = ctx.createBiquadFilter();
    windFilter.type = 'bandpass';
    windFilter.frequency.value = 420;
    windFilter.Q.value = 1.4;

    const windGain = ctx.createGain();
    windGain.gain.value = 0.22;
    windSource.connect(windFilter);
    windFilter.connect(windGain);
    windGain.connect(ambientBus);
    windSource.start(now);

    // Layer B: Stochastic Vinyl / Brazier Hearth Crackle Impulses
    const scheduleCrackle = () => {
      if (!ctx) return;
      if (!isMuted && ctx.state === 'running' && ambientBus && noiseBuffer) {
        const t = ctx.currentTime;
        const popSrc = ctx.createBufferSource();
        popSrc.buffer = noiseBuffer;
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = 1800 + Math.random() * 2600;
        bp.Q.value = 5.5;

        const g = ctx.createGain();
        const amp = 0.012 + Math.random() * 0.022;
        g.gain.setValueAtTime(amp, t);
        g.gain.exponentialRampToValueAtTime(0.0005, t + 0.016 + Math.random() * 0.02);

        popSrc.connect(bp);
        bp.connect(g);
        g.connect(ambientBus);
        popSrc.start(t, Math.random() * 3.0, 0.04);
      }
      setTimeout(scheduleCrackle, 140 + Math.random() * 380);
    };
    setTimeout(scheduleCrackle, 400);
  }

  // ==========================================================================
  // 3. Stone Pickup, Continuous Stone-on-Stone Glide & Pedestal Thuds
  // ==========================================================================
  function playStonePickup(pieceType = 'pawn') {
    const audioCtx = ensureContext();
    if (!audioCtx || isMuted || !sfxBus || !noiseBuffer) return;

    const now = audioCtx.currentTime;
    const pitchMul = PIECE_WEIGHT_PITCH[pieceType] || 1.0;

    const osc = audioCtx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(145 * pitchMul, now);
    osc.frequency.exponentialRampToValueAtTime(68 * pitchMul, now + 0.075);

    const g = audioCtx.createGain();
    g.gain.setValueAtTime(0.18, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.085);

    osc.connect(g);
    g.connect(sfxBus);
    if (reverbSend) g.connect(reverbSend);
    osc.start(now);
    osc.stop(now + 0.09);

    const runeOsc = audioCtx.createOscillator();
    runeOsc.type = 'sine';
    runeOsc.frequency.setValueAtTime(587.33 * pitchMul, now);
    runeOsc.frequency.exponentialRampToValueAtTime(880 * pitchMul, now + 0.14);
    const runeGain = audioCtx.createGain();
    runeGain.gain.setValueAtTime(0.032, now);
    runeGain.gain.exponentialRampToValueAtTime(0.0008, now + 0.16);
    runeOsc.connect(runeGain);
    if (reverbSend) runeGain.connect(reverbSend);
    runeOsc.start(now);
    runeOsc.stop(now + 0.17);
  }

  function startStoneSlide(pieceType = 'pawn') {
    const audioCtx = ensureContext();
    if (!audioCtx || isMuted || !sfxBus || !noiseBuffer) return;
    stopStoneSlide();

    const now = audioCtx.currentTime;
    const pitchMul = PIECE_WEIGHT_PITCH[pieceType] || 1.0;

    const src = audioCtx.createBufferSource();
    src.buffer = noiseBuffer;
    src.loop = true;

    const filter = audioCtx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(340 * pitchMul, now);
    filter.Q.setValueAtTime(1.8, now);

    const rumbleOsc = ctx.createOscillator();
    rumbleOsc.type = 'sawtooth';
    rumbleOsc.frequency.setValueAtTime(64 * pitchMul, now);

    const rumbleLp = audioCtx.createBiquadFilter();
    rumbleLp.type = 'lowpass';
    rumbleLp.frequency.setValueAtTime(135 * pitchMul, now);

    const rumbleGain = ctx.createGain();
    rumbleGain.gain.setValueAtTime(0.08, now);

    const slideGain = audioCtx.createGain();
    slideGain.gain.setValueAtTime(0.001, now);
    slideGain.gain.linearRampToValueAtTime(0.16, now + 0.06);

    src.connect(filter);
    filter.connect(slideGain);
    rumbleOsc.connect(rumbleLp);
    rumbleLp.connect(rumbleGain);
    rumbleGain.connect(slideGain);

    slideGain.connect(sfxBus);
    if (reverbSend) slideGain.connect(reverbSend);

    src.start(now, Math.random() * 2.0);
    rumbleOsc.start(now);

    activeSlideNodes = {
      source: src,
      filter,
      rumbleOsc,
      gain: slideGain
    };
  }

  function updateStoneSlide(normalizedSpeed = 0.5, pieceType = 'pawn') {
    if (!activeSlideNodes || !ctx || isMuted) return;
    const now = ctx.currentTime;
    const pitchMul = PIECE_WEIGHT_PITCH[pieceType] || 1.0;
    const clamped = Math.max(0, Math.min(1.5, normalizedSpeed));
    const targetFreq = (240 + clamped * 320) * pitchMul;
    const targetGain = Math.min(0.24, 0.03 + clamped * 0.16);
    activeSlideNodes.filter.frequency.setTargetAtTime(targetFreq, now, 0.03);
    activeSlideNodes.gain.gain.setTargetAtTime(targetGain, now, 0.03);
  }

  function stopStoneSlide() {
    if (!activeSlideNodes) return;
    const nodes = activeSlideNodes;
    activeSlideNodes = null;
    try {
      if (ctx) {
        const now = ctx.currentTime;
        nodes.gain.gain.cancelScheduledValues(now);
        nodes.gain.gain.setValueAtTime(nodes.gain.gain.value, now);
        nodes.gain.gain.exponentialRampToValueAtTime(0.0008, now + 0.08);
        nodes.source.stop(now + 0.09);
        nodes.rumbleOsc.stop(now + 0.09);
      } else {
        nodes.source.stop();
        nodes.rumbleOsc.stop();
      }
    } catch (e) {}
  }

  function playStoneThud(pieceType = 'pawn', intensity = 1.0) {
    const audioCtx = ensureContext();
    if (!audioCtx || isMuted || !sfxBus || !noiseBuffer) return;

    const now = audioCtx.currentTime;
    const pitchMul = PIECE_WEIGHT_PITCH[pieceType] || 1.0;
    const scale = Math.max(0.3, Math.min(1.6, intensity));

    const subOsc = audioCtx.createOscillator();
    subOsc.type = 'sine';
    subOsc.frequency.setValueAtTime(98 * pitchMul, now);
    subOsc.frequency.exponentialRampToValueAtTime(34 * pitchMul, now + 0.14);

    const subGain = audioCtx.createGain();
    subGain.gain.setValueAtTime(0.34 * scale, now);
    subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.17);

    subOsc.connect(subGain);
    subGain.connect(sfxBus);
    if (reverbSend) subGain.connect(reverbSend);
    subOsc.start(now);
    subOsc.stop(now + 0.18);

    const knockSrc = audioCtx.createBufferSource();
    knockSrc.buffer = noiseBuffer;
    const knockFilter = audioCtx.createBiquadFilter();
    knockFilter.type = 'bandpass';
    knockFilter.frequency.setValueAtTime(420 * pitchMul, now);
    knockFilter.Q.setValueAtTime(3.2, now);

    const knockGain = audioCtx.createGain();
    knockGain.gain.setValueAtTime(0.26 * scale, now);
    knockGain.gain.exponentialRampToValueAtTime(0.001, now + 0.065);

    knockSrc.connect(knockFilter);
    knockFilter.connect(knockGain);
    knockGain.connect(sfxBus);
    if (reverbSend) knockGain.connect(reverbSend);
    knockSrc.start(now, Math.random() * 2.0, 0.08);
  }

  function playStoneCollision(intensity = 0.7) {
    const nowPerf = performance.now();
    if (nowPerf - lastBystanderBumpMs < 95) return;
    lastBystanderBumpMs = nowPerf;

    const audioCtx = ensureContext();
    if (!audioCtx || isMuted || !sfxBus || !noiseBuffer) return;

    const now = audioCtx.currentTime;
    const scale = Math.max(0.2, Math.min(1.3, intensity));

    const freqs = [310 + Math.random() * 80, 690 + Math.random() * 140];
    for (const f of freqs) {
      const osc = audioCtx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(f, now);
      osc.frequency.exponentialRampToValueAtTime(f * 0.52, now + 0.055);

      const g = audioCtx.createGain();
      g.gain.setValueAtTime(0.14 * scale, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.06);

      osc.connect(g);
      g.connect(sfxBus);
      if (reverbSend) g.connect(reverbSend);
      osc.start(now);
      osc.stop(now + 0.065);
    }

    const src = audioCtx.createBufferSource();
    src.buffer = noiseBuffer;
    const bp = audioCtx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1150 + Math.random() * 450;
    bp.Q.value = 4.0;

    const ng = audioCtx.createGain();
    ng.gain.setValueAtTime(0.18 * scale, now);
    ng.gain.exponentialRampToValueAtTime(0.001, now + 0.04);

    src.connect(bp);
    bp.connect(ng);
    ng.connect(sfxBus);
    if (reverbSend) ng.connect(reverbSend);
    src.start(now, Math.random() * 2.0, 0.05);
  }

  function playShardBounce(speed = 1.0) {
    const nowPerf = performance.now();
    if (nowPerf - lastShardClatterMs < 38) return;
    lastShardClatterMs = nowPerf;

    const audioCtx = ensureContext();
    if (!audioCtx || isMuted || !sfxBus || !noiseBuffer) return;

    const now = audioCtx.currentTime;
    const amp = Math.min(0.16, Math.max(0.025, speed * 0.045));

    const src = audioCtx.createBufferSource();
    src.buffer = noiseBuffer;
    const bp = audioCtx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 950 + Math.random() * 1650;
    bp.Q.value = 5.5;

    const g = audioCtx.createGain();
    g.gain.setValueAtTime(amp, now);
    g.gain.exponentialRampToValueAtTime(0.0008, now + 0.032);

    src.connect(bp);
    bp.connect(g);
    g.connect(sfxBus);
    if (reverbSend) g.connect(reverbSend);
    src.start(now, Math.random() * 2.5, 0.04);
  }

  // ==========================================================================
  // 4. Melee Weapon Swing, Impact & Multi-Layered Stone Shatter Burst
  // ==========================================================================
  function playWeaponSwing(pieceType = 'queen') {
    const audioCtx = ensureContext();
    if (!audioCtx || isMuted || !sfxBus || !noiseBuffer) return;

    const now = audioCtx.currentTime;
    const pitchMul = PIECE_WEIGHT_PITCH[pieceType] || 1.0;

    const src = audioCtx.createBufferSource();
    src.buffer = noiseBuffer;
    const bp = audioCtx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(190 * pitchMul, now);
    bp.frequency.exponentialRampToValueAtTime(620 * pitchMul, now + 0.14);
    bp.frequency.exponentialRampToValueAtTime(140 * pitchMul, now + 0.28);
    bp.Q.value = 2.2;

    const g = audioCtx.createGain();
    g.gain.setValueAtTime(0.001, now);
    g.gain.linearRampToValueAtTime(0.28, now + 0.12);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.30);

    src.connect(bp);
    bp.connect(g);
    g.connect(sfxBus);
    if (reverbSend) g.connect(reverbSend);
    src.start(now, Math.random() * 2.0, 0.32);
  }

  function playWeaponImpact(pieceType = 'queen') {
    const audioCtx = ensureContext();
    if (!audioCtx || isMuted || !sfxBus || !noiseBuffer) return;

    const now = audioCtx.currentTime;
    const pitchMul = PIECE_WEIGHT_PITCH[pieceType] || 1.0;

    const partials = [520 * pitchMul, 890 * pitchMul, 1480 * pitchMul];
    partials.forEach((freq, i) => {
      const osc = audioCtx.createOscillator();
      osc.type = i === 0 ? 'sawtooth' : 'triangle';
      osc.frequency.setValueAtTime(freq, now);
      osc.frequency.exponentialRampToValueAtTime(freq * 0.65, now + 0.12);

      const g = audioCtx.createGain();
      g.gain.setValueAtTime(0.16 / (i + 1), now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.13);

      osc.connect(g);
      g.connect(sfxBus);
      if (reverbSend) g.connect(reverbSend);
      osc.start(now);
      osc.stop(now + 0.14);
    });

    const crackSrc = audioCtx.createBufferSource();
    crackSrc.buffer = noiseBuffer;
    const hp = audioCtx.createBiquadFilter();
    hp.type = 'bandpass';
    hp.frequency.setValueAtTime(1350, now);
    hp.Q.value = 1.6;

    const cg = audioCtx.createGain();
    cg.gain.setValueAtTime(0.38, now);
    cg.gain.exponentialRampToValueAtTime(0.001, now + 0.09);

    crackSrc.connect(hp);
    hp.connect(cg);
    cg.connect(sfxBus);
    if (reverbSend) cg.connect(reverbSend);
    crackSrc.start(now, Math.random() * 2.0, 0.10);
  }

  function playStoneShatter() {
    const audioCtx = ensureContext();
    if (!audioCtx || isMuted || !sfxBus || !noiseBuffer) return;

    const now = audioCtx.currentTime;

    const boomOsc = audioCtx.createOscillator();
    boomOsc.type = 'sine';
    boomOsc.frequency.setValueAtTime(112, now);
    boomOsc.frequency.exponentialRampToValueAtTime(26, now + 0.38);

    const boomGain = audioCtx.createGain();
    boomGain.gain.setValueAtTime(0.55, now);
    boomGain.gain.exponentialRampToValueAtTime(0.001, now + 0.42);

    boomOsc.connect(boomGain);
    boomGain.connect(sfxBus);
    if (reverbSend) boomGain.connect(reverbSend);
    boomOsc.start(now);
    boomOsc.stop(now + 0.44);

    const burstSrc = audioCtx.createBufferSource();
    burstSrc.buffer = noiseBuffer;
    const burstFilter = audioCtx.createBiquadFilter();
    burstFilter.type = 'bandpass';
    burstFilter.frequency.setValueAtTime(980, now);
    burstFilter.frequency.exponentialRampToValueAtTime(320, now + 0.34);
    burstFilter.Q.value = 1.1;

    const burstGain = audioCtx.createGain();
    burstGain.gain.setValueAtTime(0.52, now);
    burstGain.gain.exponentialRampToValueAtTime(0.001, now + 0.36);

    burstSrc.connect(burstFilter);
    burstFilter.connect(burstGain);
    burstGain.connect(sfxBus);
    if (reverbSend) burstGain.connect(reverbSend);
    burstSrc.start(now, Math.random() * 1.5, 0.38);

    for (let i = 0; i < 12; i++) {
      const delay = 0.03 + i * 0.048 + Math.random() * 0.035;
      const t = now + delay;
      const shardFreq = 420 + Math.random() * 1750;
      const shardAmp = Math.max(0.02, (0.20 - i * 0.013) * (0.7 + Math.random() * 0.5));

      const shardSrc = audioCtx.createBufferSource();
      shardSrc.buffer = noiseBuffer;
      const bp = audioCtx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(shardFreq, t);
      bp.Q.value = 4.8 + Math.random() * 4.0;

      const sg = audioCtx.createGain();
      sg.gain.setValueAtTime(shardAmp, t);
      sg.gain.exponentialRampToValueAtTime(0.0008, t + 0.042 + Math.random() * 0.03);

      shardSrc.connect(bp);
      bp.connect(sg);
      sg.connect(sfxBus);
      if (reverbSend) sg.connect(reverbSend);
      shardSrc.start(t, Math.random() * 2.5, 0.08);
    }
  }

  function playCheckmateKingFall() {
    const audioCtx = ensureContext();
    if (!audioCtx || isMuted || !sfxBus || !noiseBuffer) return;

    const now = audioCtx.currentTime;

    const groanOsc = audioCtx.createOscillator();
    groanOsc.type = 'sawtooth';
    groanOsc.frequency.setValueAtTime(65.41, now);
    groanOsc.frequency.exponentialRampToValueAtTime(43.65, now + 1.05);

    const groanLp = audioCtx.createBiquadFilter();
    groanLp.type = 'lowpass';
    groanLp.frequency.setValueAtTime(180, now);

    const groanGain = audioCtx.createGain();
    groanGain.gain.setValueAtTime(0.001, now);
    groanGain.gain.linearRampToValueAtTime(0.22, now + 0.25);
    groanGain.gain.exponentialRampToValueAtTime(0.001, now + 1.15);

    groanOsc.connect(groanLp);
    groanLp.connect(groanGain);
    groanGain.connect(sfxBus);
    if (reverbSend) groanGain.connect(reverbSend);
    groanOsc.start(now);
    groanOsc.stop(now + 1.18);
  }

  function toggleMute(forceMuted) {
    ensureContext();
    isMuted = typeof forceMuted === 'boolean' ? forceMuted : !isMuted;
    if (masterGain && ctx) {
      masterGain.gain.setTargetAtTime(isMuted ? 0 : 0.90, ctx.currentTime, 0.04);
    }
    if (isMuted) {
      stopStoneSlide();
    }
    return !isMuted;
  }

  return {
    unlock: ensureContext,
    loadUserAudioFile,
    playStonePickup,
    startStoneSlide,
    updateStoneSlide,
    stopStoneSlide,
    playStoneThud,
    playStoneCollision,
    playShardBounce,
    playWeaponSwing,
    playWeaponImpact,
    playStoneShatter,
    playCheckmateKingFall,
    toggleMute,
    isAudioEnabled: () => !isMuted
  };
}
