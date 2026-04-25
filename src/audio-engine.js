import { QUALITY, SCALES, clamp, quantizeToScale } from './constants.js';

// ─── Default voice spec (per-runner) ───────────────────────────
export function createDefaultVoiceSpec(index = 0) {
  const defaults = [
    { wave: "square", gain: 0.66, pan: -0.25, noiseColor: "pink", noiseGain: 0.02 },
    { wave: "saw",    gain: 0.56, pan: 0,     noiseColor: "brown", noiseGain: 0.03 },
    { wave: "sine",   gain: 0.48, pan: 0.24,  noiseColor: "white", noiseGain: 0.012 },
  ];
  const d = defaults[index % defaults.length];
  return {
    enabled: true,
    wave: d.wave,
    gain: d.gain,
    pan: d.pan,
    noiseColor: d.noiseColor,
    noiseGain: d.noiseGain,
    // Per-runner ADSR override (null = use global)
    attack: null,
    decay: null,
    sustain: null,
    release: null,
    // Per-runner osc layers override (null = use global)
    oscLayers: null,
  };
}

// ─── Mod Matrix Slot ───────────────────────────────────────────
export function createModSlot(source = 'remaining', destination = 'filter.lp.cutoff', amount = 0, transform = 'linear') {
  return { enabled: amount !== 0, source, destination, amount, transform };
}

export class ModularAudioEngine {
  constructor() {
    this.ctx = null;
    this.ready = false;
    this.qualityMode = 'normal';
    this.reverbDecayApplied = null;
    this.voiceCount = 0;
    this.noiseCache = new Map();

    // Analyzer data (exposed for renderer)
    this.analyser = null;
    this.fftData = null;
    this.timeDomainData = null;

    // Per-runner voice specs (keyed by runner id)
    this.runnerVoiceSpecs = new Map();

    // Global voice enable (legacy compat)
    this.globalVoiceEnabled = [true, true, true];

    // Mod matrix (4 slots)
    this.modMatrix = [
      createModSlot('remaining', 'filter.lp.cutoff', 0.62, 'linear'),
      createModSlot('jump', 'osc.detune', 0, 'linear'),
      createModSlot('iteration', 'amp.gain', 0, 'linear'),
      createModSlot('remaining', 'delay.mix', 0, 'linear'),
    ];

    this.params = {
      filterMode: "hp_lp",
      cutoffHz: 2200,
      highpassHz: 120,
      resonanceQ: 0.9,
      lfoRateHz: 1.8,
      lfoDepth: 0.35,
      modSource: "remaining",   // Legacy single mod source
      modAmount: 0.62,          // Legacy single mod amount
      oscLayers: 2,
      delayMix: 0.24,
      delayTimeMs: 220,
      delayFeedback: 0.32,
      reverbMix: 0.18,
      reverbDecaySec: 1.7,
      masterGain: 0.55,
      // ADSR (global defaults)
      attack: 0.003,
      decay: 0.07,
      sustain: 0.18,
      release: 0.09,
      // Musical scale
      scale: "chromatic",
      baseNote: 48,
      scaleEnabled: false,
    };
  }

  // ─── Per-runner voice management ────────────────────────
  getRunnerVoiceSpec(runnerId, voiceIndex) {
    if (!this.runnerVoiceSpecs.has(runnerId)) {
      this.runnerVoiceSpecs.set(runnerId, createDefaultVoiceSpec(voiceIndex));
    }
    return this.runnerVoiceSpecs.get(runnerId);
  }

  setRunnerVoiceSpec(runnerId, patch) {
    const spec = this.getRunnerVoiceSpec(runnerId, 0);
    Object.assign(spec, patch);
  }

  removeRunnerVoiceSpec(runnerId) {
    this.runnerVoiceSpecs.delete(runnerId);
  }

  setQuality(mode) {
    if (QUALITY[mode]) this.qualityMode = mode;
  }

  // ─── Global voice compat (for UI) ────────────────────────────
  setVoiceEnabled(index, enabled) {
    this.globalVoiceEnabled[index] = enabled;
  }

  setVoiceWave(index, wave) {
    // We could broadcast to runners that don't have overrides
    // For now, it's just a UI state holder
  }

  // ─── Setup ───────────────────────────────────────────────────
  setModSlot(index, patch) {
    if (index >= 0 && index < this.modMatrix.length) {
      Object.assign(this.modMatrix[index], patch);
    }
  }

  // ─── Legacy compat ──────────────────────────────────────
  setVoiceEnabled(index, enabled) {
    if (index >= 0 && index < 3) this.globalVoiceEnabled[index] = Boolean(enabled);
  }

  setVoiceWave(index, wave) {
    // Legacy: update all runner specs that match this voice index
    // New per-runner specs take priority
  }

  updateParams(newParams) {
    this.params = { ...this.params, ...newParams };
  }

  setQuality(mode) {
    if (!QUALITY[mode]) return;
    this.qualityMode = mode;
  }

  getQualityConfig() {
    return QUALITY[this.qualityMode] || QUALITY.normal;
  }

  async ensureStarted() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC({ latencyHint: "interactive" });
      this.setupGraph();
      this.applyParams(this.params);
    }
    if (this.ctx.state === "suspended") {
      await this.ctx.resume();
    }
    this.ready = true;
  }

  setupGraph() {
    this.inputBus = this.ctx.createGain();

    this.hp = this.ctx.createBiquadFilter();
    this.hp.type = "highpass";

    this.lp = this.ctx.createBiquadFilter();
    this.lp.type = "lowpass";

    this.satDrive = this.ctx.createGain();
    this.sat = this.ctx.createWaveShaper();
    this.sat.oversample = "2x";

    this.dry = this.ctx.createGain();

    this.delaySend = this.ctx.createGain();
    this.delay = this.ctx.createDelay(4);
    this.delayFB = this.ctx.createGain();
    this.delayTone = this.ctx.createBiquadFilter();
    this.delayTone.type = "lowpass";
    this.delayWet = this.ctx.createGain();

    this.reverbSend = this.ctx.createGain();
    this.reverbConvolver = this.ctx.createConvolver();
    this.reverbWet = this.ctx.createGain();

    this.comp = this.ctx.createDynamicsCompressor();
    this.comp.threshold.value = -20;
    this.comp.knee.value = 12;
    this.comp.ratio.value = 3.2;
    this.comp.attack.value = 0.004;
    this.comp.release.value = 0.1;

    this.master = this.ctx.createGain();

    // Analyzer
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 256;
    this.fftData = new Uint8Array(this.analyser.frequencyBinCount);
    this.timeDomainData = new Uint8Array(this.analyser.fftSize);

    this.lfo = this.ctx.createOscillator();
    this.lfo.type = "triangle";
    this.lfoGain = this.ctx.createGain();
    this.lfo.connect(this.lfoGain);
    this.lfoGain.connect(this.lp.frequency);
    this.lfo.start();

    // Signal chain
    this.inputBus.connect(this.hp);
    this.hp.connect(this.lp);
    this.lp.connect(this.satDrive);
    this.satDrive.connect(this.sat);

    this.sat.connect(this.dry);
    this.dry.connect(this.comp);

    this.sat.connect(this.delaySend);
    this.delaySend.connect(this.delay);
    this.delay.connect(this.delayTone);
    this.delayTone.connect(this.delayWet);
    this.delayWet.connect(this.comp);
    this.delayTone.connect(this.delayFB);
    this.delayFB.connect(this.delay);

    this.sat.connect(this.reverbSend);
    this.reverbSend.connect(this.reverbConvolver);
    this.reverbConvolver.connect(this.reverbWet);
    this.reverbWet.connect(this.comp);

    this.comp.connect(this.analyser);
    this.analyser.connect(this.master);
    this.master.connect(this.ctx.destination);
  }

  buildSaturationCurve(amount) {
    const k = Math.max(1, amount * 120);
    const n = 512;
    const curve = new Float32Array(n);
    for (let i = 0; i < n; i += 1) {
      const x = (i * 2) / n - 1;
      curve[i] = ((1 + k) * x) / (1 + k * Math.abs(x));
    }
    return curve;
  }

  getNoiseBuffer(color) {
    if (this.noiseCache.has(color)) return this.noiseCache.get(color);
    const length = Math.floor(this.ctx.sampleRate * 1.25);
    const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let brown = 0;
    for (let i = 0; i < length; i += 1) {
      const white = Math.random() * 2 - 1;
      if (color === "brown") {
        brown = (brown + 0.02 * white) / 1.02;
        data[i] = brown * 3.4;
      } else if (color === "pink") {
        data[i] = (white + (Math.random() * 2 - 1) * 0.7 + (Math.random() * 2 - 1) * 0.4) * 0.34;
      } else {
        data[i] = white;
      }
    }
    this.noiseCache.set(color, buffer);
    return buffer;
  }

  buildImpulse(decaySec) {
    const len = Math.floor(this.ctx.sampleRate * clamp(decaySec, 0.2, 10));
    const impulse = this.ctx.createBuffer(2, len, this.ctx.sampleRate);
    for (let ch = 0; ch < 2; ch += 1) {
      const data = impulse.getChannelData(ch);
      for (let i = 0; i < len; i += 1) {
        const t = i / len;
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, decaySec * 1.3);
      }
    }
    return impulse;
  }

  applyParams(next) {
    this.params = { ...this.params, ...next };
    if (!this.ctx) return;
    const p = this.params;
    const t = this.ctx.currentTime + 0.01;

    let hpHz = p.highpassHz;
    let lpHz = p.cutoffHz;
    if (p.filterMode === "lowpass") {
      hpHz = 20;
    } else if (p.filterMode === "highpass") {
      lpHz = 20000;
    } else if (p.filterMode === "bandpass") {
      hpHz = clamp(p.cutoffHz * 0.55, 20, 17000);
      lpHz = clamp(p.cutoffHz * 1.7, hpHz + 20, 22050);
    }

    this.hp.frequency.setTargetAtTime(hpHz, t, 0.02);
    this.hp.Q.setTargetAtTime(Math.max(0.0001, p.resonanceQ * 0.16), t, 0.02);
    this.lp.frequency.setTargetAtTime(lpHz, t, 0.02);
    this.lp.Q.setTargetAtTime(p.resonanceQ, t, 0.02);

    this.lfo.frequency.setTargetAtTime(p.lfoRateHz, t, 0.04);
    this.lfoGain.gain.setTargetAtTime(p.lfoDepth * 1900, t, 0.05);

    const satAmount = 0.16 + p.resonanceQ * 0.008;
    this.sat.curve = this.buildSaturationCurve(satAmount);
    this.satDrive.gain.setTargetAtTime(1 + satAmount * 1.8, t, 0.03);

    this.delay.delayTime.setTargetAtTime(p.delayTimeMs / 1000, t, 0.03);
    this.delaySend.gain.setTargetAtTime(p.delayMix * 0.48, t, 0.03);
    this.delayWet.gain.setTargetAtTime(p.delayMix * 0.7, t, 0.03);
    this.delayFB.gain.setTargetAtTime(p.delayFeedback, t, 0.03);
    this.delayTone.frequency.setTargetAtTime(Math.max(600, lpHz * 1.4), t, 0.03);

    this.reverbSend.gain.setTargetAtTime(p.reverbMix * 0.45, t, 0.03);
    this.reverbWet.gain.setTargetAtTime(p.reverbMix * 0.7, t, 0.03);
    if (this.reverbDecayApplied === null || Math.abs(this.reverbDecayApplied - p.reverbDecaySec) > 0.01) {
      this.reverbConvolver.buffer = this.buildImpulse(p.reverbDecaySec);
      this.reverbDecayApplied = p.reverbDecaySec;
    }

    this.dry.gain.setTargetAtTime(0.92, t, 0.03);
    this.master.gain.setTargetAtTime(p.masterGain, t, 0.03);
  }

  consumeEvents(events) {
    if (!this.ready || events.length === 0) {
      this.voiceCount = 0;
      return;
    }

    const limit = this.getQualityConfig().maxAudioEventsPerFrame;
    let fired = 0;
    events.forEach((evt) => {
      if (fired >= limit) return;
      this.triggerRunnerStep(evt);
      fired += 1;
    });
    this.voiceCount = fired;
  }

  // ─── Mod Matrix evaluation ──────────────────────────────
  computeModSource(sourceName, evt) {
    switch (sourceName) {
      case 'remaining': return 1 - clamp(evt.remainingNorm, 0, 1);
      case 'jump':      return clamp(Math.log10(1 / evt.jumpNorm) / 16, 0, 1);
      case 'iteration': return clamp(evt.iteration / 140, 0, 1);
      case 'lfo1':      return 0.5; // LFO handled by Web Audio node directly
      case 'none':      return 0;
      default:          return 0;
    }
  }

  applyModTransform(value, transform) {
    switch (transform) {
      case 'exp': return Math.pow(value, 2);
      case 'log': return value > 0 ? Math.log1p(value * 9) / Math.log(10) : 0;
      case 'step': return value > 0.5 ? 1 : 0;
      default: return value; // linear
    }
  }

  evaluateModMatrix(evt) {
    const mods = {
      'filter.lp.cutoff': 0,
      'filter.lp.q': 0,
      'filter.hp.cutoff': 0,
      'osc.detune': 0,
      'amp.gain': 0,
      'pan': 0,
      'delay.mix': 0,
      'reverb.mix': 0,
    };

    for (const slot of this.modMatrix) {
      if (!slot.enabled || slot.amount === 0) continue;
      const rawVal = this.computeModSource(slot.source, evt);
      const transformed = this.applyModTransform(rawVal, slot.transform);
      if (mods[slot.destination] !== undefined) {
        mods[slot.destination] += transformed * slot.amount;
      }
    }

    // Also apply legacy single mod source (backward compat)
    const legacyVal = this.computeModSource(this.params.modSource, evt);
    mods['filter.lp.cutoff'] += legacyVal * this.params.modAmount;

    return mods;
  }

  triggerRunnerStep(evt) {
    const runner = evt.runner;

    // Get per-runner voice spec
    const spec = this.getRunnerVoiceSpec(runner.id, runner.voiceIndex);

    // Check if enabled (global voice enable by index + per-runner)
    if (!spec.enabled || !runner.enabled) return;
    if (!this.globalVoiceEnabled[runner.voiceIndex % 3]) return;

    const t = this.ctx.currentTime + 0.005;
    const p = this.params;

    // Evaluate mod matrix
    const mods = this.evaluateModMatrix(evt);

    // Apply cutoff modulation
    const cutoffMod = p.cutoffHz * (1 + mods['filter.lp.cutoff'] * 0.9);
    this.lp.frequency.setTargetAtTime(clamp(cutoffMod, 80, 22050), t, 0.01);

    // Compute frequency — direction affects pitch direction
    // Forward: frequency RISES as runner converges (approaching = higher pitch)
    // Reverse: frequency FALLS as runner converges (retreating = lower pitch)
    const convergence = 1 - evt.remainingNorm;
    let freq;
    if (runner.direction >= 0) {
      // Forward: pitch ascends with convergence
      freq = 92 + convergence * 480 + Math.min(160, evt.iteration * 1.4);
    } else {
      // Reverse: pitch descends — starts high and drops as runner converges backward
      freq = 572 - convergence * 380 + Math.min(80, evt.iteration * 0.6);
    }

    // Apply musical scale if enabled
    if (p.scaleEnabled && p.scale !== 'chromatic') {
      freq = quantizeToScale(freq, p.scale, p.baseNote);
    }

    this.triggerVoice(spec, freq, evt, t, mods);
  }

  triggerVoice(spec, baseFreq, evt, t0, mods = {}) {
    const env = this.ctx.createGain();
    const panNode = this.ctx.createStereoPanner();

    const spatial = clamp(evt.worldPos.x * 2 - 1, -1, 1);
    const modPan = mods['pan'] || 0;
    panNode.pan.setValueAtTime(clamp(spec.pan + spatial * 0.24 + modPan * 0.5, -1, 1), t0);

    const jumpInfluence = clamp(Math.log10(1 / evt.jumpNorm) / 10, 0, 1);
    const modGain = mods['amp.gain'] || 0;
    const peak = clamp(spec.gain * (0.45 + jumpInfluence * 0.6) * (1 + modGain * 0.4), 0.02, 0.95);

    // ADSR: per-runner override or global
    const attack  = spec.attack  ?? this.params.attack;
    const decay   = spec.decay   ?? this.params.decay;
    const sustain = spec.sustain ?? this.params.sustain;
    const release = spec.release ?? this.params.release;
    const hold = 0.018 + (1 - evt.remainingNorm) * 0.035;
    const stopTime = t0 + attack + decay + hold + release + 0.012;

    env.gain.setValueAtTime(0.0001, t0);
    env.gain.exponentialRampToValueAtTime(peak, t0 + attack);
    env.gain.exponentialRampToValueAtTime(Math.max(0.0001, peak * sustain), t0 + attack + decay);
    env.gain.setValueAtTime(Math.max(0.0001, peak * sustain), t0 + attack + decay + hold);
    env.gain.exponentialRampToValueAtTime(0.0001, stopTime);

    env.connect(panNode);
    panNode.connect(this.inputBus);

    const layers = spec.oscLayers ?? clamp(Math.round(this.params.oscLayers), 1, 4);
    const wave = spec.wave === "saw" ? "sawtooth" : spec.wave;
    const spread = 10 + evt.iteration * 0.03;
    const modDetune = (mods['osc.detune'] || 0) * 100;

    for (let i = 0; i < layers; i += 1) {
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      const center = (layers - 1) * 0.5;
      const detune = (i - center) * spread + modDetune;
      osc.type = wave;
      osc.frequency.setValueAtTime(baseFreq * (1 + i * 0.01), t0);
      osc.detune.setValueAtTime(detune, t0);
      g.gain.setValueAtTime(0.82 / layers, t0);
      osc.connect(g);
      g.connect(env);
      osc.start(t0);
      osc.stop(stopTime);
    }

    if (spec.noiseGain > 0) {
      const noise = this.ctx.createBufferSource();
      noise.buffer = this.getNoiseBuffer(spec.noiseColor);
      noise.loop = true;
      const nGain = this.ctx.createGain();
      nGain.gain.setValueAtTime(spec.noiseGain, t0);
      nGain.gain.exponentialRampToValueAtTime(0.0001, stopTime);
      noise.connect(nGain);
      nGain.connect(env);
      noise.start(t0);
      noise.stop(stopTime);
    }
  }

  // ─── Analyzer methods ───────────────────────────────────
  getFrequencyData() {
    if (!this.analyser) return null;
    this.analyser.getByteFrequencyData(this.fftData);
    return this.fftData;
  }

  getTimeDomainData() {
    if (!this.analyser) return null;
    this.analyser.getByteTimeDomainData(this.timeDomainData);
    return this.timeDomainData;
  }

  getRMS() {
    if (!this.analyser) return 0;
    this.analyser.getByteTimeDomainData(this.timeDomainData);
    let sum = 0;
    for (let i = 0; i < this.timeDomainData.length; i++) {
      const v = (this.timeDomainData[i] - 128) / 128;
      sum += v * v;
    }
    return Math.sqrt(sum / this.timeDomainData.length);
  }
}
