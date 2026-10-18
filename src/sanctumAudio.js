// ============================================================================
// Procedural Gothic Sanctum Web Audio Engine
// Synthesizes cathedral ambience, stone-on-stone slides & collisions,
// melee weapon strikes, and multi-layered stone shatter acoustics with zero
// external audio file dependencies.
// ============================================================================

export function createSanctumAudioEngine() {
  /** @type {AudioContext | null} */
  let ctx = null;
  /** @type {GainNode | null} */
  let masterGain = null;
  /** @type {GainNode | null} */
  let sfxBus = null;
  /** @type {GainNode | null} */
  let reverbSend = null;
  /** @type {GainNode | null} */
  let ambientBus = null;
  /** @type {AudioBuffer | null} */
  let noiseBuffer = null;

  let isMuted = false;
  let ambientStarted = false;
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

    // Distinct early reflections from stone nave columns + diffuse vaulted tail
    const earlyTapMs = [14, 27, 43, 68, 95, 132];
    const earlyGains = [0.42, 0.34, 0.28, 0.22, 0.17, 0.13];

    for (let i = 0; i < length; i++) {
      const t = i / rate;
      const env = Math.pow(1 - i / length, 2.45) * Math.exp(-t * 1.65);
      // High-frequency damping in stone hall
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
      masterGain.gain.value = isMuted ? 0 : 0.88;
      compressor.connect(masterGain);
      masterGain.connect(ctx.destination);

      sfxBus = ctx.createGain();
      sfxBus.gain.value = 0.92;
      sfxBus.connect(compressor);

      ambientBus = ctx.createGain();
      ambientBus.gain.value = 0.42;
      ambientBus.connect(compressor);

      // Cathedral Vault Convolution Reverb Bus
      reverbSend = ctx.createGain();
      reverbSend.gain.value = 0.36;
      try {
        const convolver = ctx.createConvolver();
        convolver.buffer = createCathedralImpulseResponse(ctx, 2.5);
        const reverbReturn = ctx.createGain();
        reverbReturn.gain.value = 0.52;
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

    return ctx;
  }

  // ==========================================================================
  // 1. Ambient Cathedral Background Soundscape (Nave Wind, Brazier Hearth & Drone)
  // ==========================================================================
  function startCathedralAmbience() {
    if (ambientStarted || !ctx || !ambientBus || !noiseBuffer) return;
    ambientStarted = true;

    const now = ctx.currentTime;
    ambientBus.gain.setValueAtTime(0.001, now);
    ambientBus.gain.exponentialRampToValueAtTime(0.42, now + 2.4);

    // Layer A: Cavernous Clerestory Wind & Stone Room Tone
    const windSource = ctx.createBufferSource();
    windSource.buffer = noiseBuffer;
    windSource.loop = true;

    const windFilter = ctx.createBiquadFilter();
    windFilter.type = 'bandpass';
    windFilter.frequency.value = 148;
    windFilter.Q.value = 2.6;

    const windLfo = ctx.createOscillator();
    windLfo.type = 'sine';
    windLfo.frequency.value = 0.11; // 9-second breathing draft cycle
    const windLfoGain = ctx.createGain();
    windLfoGain.gain.value = 54;
    windLfo.connect(windFilter.frequency);

    const windGain = ctx.createGain();
    windGain.gain.value = 0.34;
    windSource.connect(windFilter);
    windFilter.connect(windGain);
    windGain.connect(ambientBus);
    windSource.start(now);
    windLfo.start(now);

    // Layer B: Twin Brazier Fire Rumble
    const fireSource = ctx.createBufferSource();
    fireSource.buffer = noiseBuffer;
    fireSource.loop = true;
    const fireFilter = ctx.createBiquadFilter();
    fireFilter.type = 'lowpass';
    fireFilter.frequency.value = 115;
    const fireGain = ctx.createGain();
    fireGain.gain.value = 0.24;
    fireSource.connect(fireFilter);
    fireFilter.connect(fireGain);
    fireGain.connect(ambientBus);
    fireSource.start(now, 1.3);

    // Layer C: Sacred Dorian Cathedral Organ/Choir Resonance (D2 + A2 + D3)
    const droneFreqs = [73.42, 110.0, 146.83];
    droneFreqs.forEach((freq, idx) => {
      if (!ctx || !ambientBus) return;
      const osc = ctx.createOscillator();
      osc.type = idx === 0 ? 'sine' : 'triangle';
      osc.frequency.value = freq;
      osc.detune.value = (idx - 1) * 4.5;

      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 240;

      const g = ctx.createGain();
      g.gain.value = idx === 0 ? 0.055 : 0.024;

      osc.connect(lp);
      lp.connect(g);
      g.connect(ambientBus);
      if (reverbSend) g.connect(reverbSend);
      osc.start(now);
    });

    // Layer D: Stochastic Brazier Ember Crackle Impulses
    const scheduleCrackle = () => {
      if (!ctx) return;
      if (!isMuted && ctx.state === 'running' && ambientBus && noiseBuffer) {
        const t = ctx.currentTime;
        const popSrc = ctx.createBufferSource();
        popSrc.buffer = noiseBuffer;
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = 1600 + Math.random() * 2400;
        bp.Q.value = 6.0;

        const g = ctx.createGain();
        const amp = 0.015 + Math.random() * 0.028;
        g.gain.setValueAtTime(amp, t);
        g.gain.exponentialRampToValueAtTime(0.0005, t + 0.018 + Math.random() * 0.022);

        popSrc.connect(bp);
        bp.connect(g);
        g.connect(ambientBus);
        popSrc.start(t, Math.random() * 3.0, 0.045);
      }
      setTimeout(scheduleCrackle, 180 + Math.random() * 520);
    };
    setTimeout(scheduleCrackle, 600);
  }

  // ==========================================================================
  // 2. Stone Pickup, Continuous Stone-on-Stone Glide & Pedestal Thuds
  // ==========================================================================
  function playStonePickup(pieceType = 'pawn') {
    const audioCtx = ensureContext();
    if (!audioCtx || isMuted || !sfxBus || !noiseBuffer) return;

    const now = audioCtx.currentTime;
    const pitchMul = PIECE_WEIGHT_PITCH[pieceType] || 1.0;

    // Subtle stone unseating tap
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

    // Subtle Sanctum gold rune shimmer
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

    // Granular stone-on-obsidian friction layer
    const src = audioCtx.createBufferSource();
    src.buffer = noiseBuffer;
    src.loop = true;

    const filter = audioCtx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(340 * pitchMul, now);
    filter.Q.setValueAtTime(1.8, now);

    // Low stone pedestal resonance rumble
    const rumbleOsc = audioCtx.createOscillator();
    rumbleOsc.type = 'sawtooth';
    rumbleOsc.frequency.setValueAtTime(64 * pitchMul, now);

    const rumbleLp = audioCtx.createBiquadFilter();
    rumbleLp.type = 'lowpass';
    rumbleLp.frequency.setValueAtTime(135 * pitchMul, now);

    const rumbleGain = audioCtx.createGain();
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

    // 1. Heavy Stone Pedestal Sub-Bass Thump
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

    // 2. Granite-on-Obsidian Surface Knock
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

  // Stone-on-stone clack when a moving piece nudges past a bystander or when shards collide
  function playStoneCollision(intensity = 0.7) {
    const nowPerf = performance.now();
    if (nowPerf - lastBystanderBumpMs < 95) return;
    lastBystanderBumpMs = nowPerf;

    const audioCtx = ensureContext();
    if (!audioCtx || isMuted || !sfxBus || !noiseBuffer) return;

    const now = audioCtx.currentTime;
    const scale = Math.max(0.2, Math.min(1.3, intensity));

    // Dual-modal stone clack
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

    // Crisp mineral impact transient
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
  // 3. Melee Weapon Swing, Impact & Multi-Layered Stone Shatter Burst
  // ==========================================================================
  function playWeaponSwing(pieceType = 'queen') {
    const audioCtx = ensureContext();
    if (!audioCtx || isMuted || !sfxBus || !noiseBuffer) return;

    const now = audioCtx.currentTime;
    const pitchMul = PIECE_WEIGHT_PITCH[pieceType] || 1.0;

    // Heavy weapon air cleave whoosh
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

    // Forged steel blade / mace striking stone armor
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

    // Heavy stone fracture transient
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

    // Layer 1: Explosive Low-End Stone Detonation Boom
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

    // Layer 2: Wideband Granite Shatter Burst
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

    // Layer 3: Cascading Stone Shards & Rubble Clatter (12 staggered resonant impacts)
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

    // Deep ominous brass/stone groan during stagger + monumental crash at t + 1.05s
    const groanOsc = audioCtx.createOscillator();
    groanOsc.type = 'sawtooth';
    groanOsc.frequency.setValueAtTime(65.41, now); // C2
    groanOsc.frequency.exponentialRampToValueAtTime(43.65, now + 1.05); // F1

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
      masterGain.gain.setTargetAtTime(isMuted ? 0 : 0.88, ctx.currentTime, 0.04);
    }
    if (isMuted) {
      stopStoneSlide();
    }
    return !isMuted;
  }

  return {
    unlock: ensureContext,
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
