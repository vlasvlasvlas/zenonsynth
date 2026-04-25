const canvas = document.getElementById("simCanvas");
const ctx = canvas.getContext("2d");

const els = {
  readout: document.getElementById("readout"),
  decimalWindow: document.getElementById("decimalWindow"),
  progressMain: document.getElementById("progressMain"),
  progressFill: document.getElementById("progressFill"),
  progressSub: document.getElementById("progressSub"),
  sceneAccordion: document.getElementById("sceneAccordion"),
  synthAccordion: document.getElementById("synthAccordion"),
  startBtn: document.getElementById("startBtn"),
  pauseBtn: document.getElementById("pauseBtn"),
  resetBtn: document.getElementById("resetBtn"),
  addRunnerBtn: document.getElementById("addRunnerBtn"),
  removeRunnerBtn: document.getElementById("removeRunnerBtn"),
  speed: document.getElementById("speed"),
  pathType: document.getElementById("pathType"),
  qualityMode: document.getElementById("qualityMode"),
  realLengthKm: document.getElementById("realLengthKm"),
  filterMode: document.getElementById("filterMode"),
  cutoff: document.getElementById("cutoff"),
  highpass: document.getElementById("highpass"),
  resonance: document.getElementById("resonance"),
  lfoRate: document.getElementById("lfoRate"),
  lfoDepth: document.getElementById("lfoDepth"),
  modSource: document.getElementById("modSource"),
  modAmount: document.getElementById("modAmount"),
  oscLayers: document.getElementById("oscLayers"),
  waveA: document.getElementById("waveA"),
  waveB: document.getElementById("waveB"),
  waveC: document.getElementById("waveC"),
  delayMix: document.getElementById("delayMix"),
  delayTime: document.getElementById("delayTime"),
  delayFeedback: document.getElementById("delayFeedback"),
  reverbMix: document.getElementById("reverbMix"),
  reverbDecay: document.getElementById("reverbDecay"),
  masterGain: document.getElementById("masterGain"),
  voiceA: document.getElementById("voiceA"),
  voiceB: document.getElementById("voiceB"),
  voiceC: document.getElementById("voiceC"),
  runnerList: document.getElementById("runnerList"),
  factoryPreset: document.getElementById("factoryPreset"),
  applyFactoryBtn: document.getElementById("applyFactoryBtn"),
  savePresetBtn: document.getElementById("savePresetBtn"),
  loadPresetInput: document.getElementById("loadPresetInput"),
};

const QUALITY = {
  eco: {
    gridLevels: 10,
    trailPoints: 56,
    minSpan: 0.003,
    pathSamples: 80,
    overviewSamples: 60,
    maxAudioEventsPerFrame: 2,
  },
  normal: {
    gridLevels: 16,
    trailPoints: 120,
    minSpan: 0.00045,
    pathSamples: 130,
    overviewSamples: 90,
    maxAudioEventsPerFrame: 4,
  },
  high: {
    gridLevels: 24,
    trailPoints: 220,
    minSpan: 0.00005,
    pathSamples: 190,
    overviewSamples: 130,
    maxAudioEventsPerFrame: 8,
  },
};

const RUNNER_PALETTE = ["#ffffff", "#62e8ff", "#ff8ae6", "#8cff77", "#ff6f6f", "#8aa7ff"];

const PATHS = {
  line: {
    id: "line",
    map: (s) => ({ x: 0.1 + 0.8 * s, y: 0.58 }),
    baseSpan: 0.86,
  },
  circle: {
    id: "circle",
    map: (s) => {
      // Semicircunferencia pronunciada (180 grados reales)
      const start = Math.PI * 1.15;
      const end = start + Math.PI;
      const a = start + (end - start) * s;
      return { x: 0.5 + Math.cos(a) * 0.34, y: 0.52 + Math.sin(a) * 0.34 };
    },
    baseSpan: 0.9,
  },
  spiral: {
    id: "spiral",
    map: (s) => {
      const theta0 = -Math.PI * 0.2;
      const turns = 5.8;
      const theta = theta0 + turns * Math.PI * 2 * s;
      const r = Math.max(0.0018, 0.42 * Math.pow(1 - s, 1.2));
      return { x: 0.5 + Math.cos(theta) * r, y: 0.52 + Math.sin(theta) * r };
    },
    baseSpan: 0.92,
  },
};

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const d2 = (a, b) => {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.hypot(dx, dy);
};

function formatHalfExact(iteration, pow5, visibleDigits = 72) {
  if (iteration === 0) return "1.0";
  const digits = pow5.toString().padStart(iteration, "0");
  if (iteration <= visibleDigits) return `0.${digits}`;
  return `0.${digits.slice(0, visibleDigits)}...${digits.slice(-8)} [${iteration}d]`;
}

function fmt(v, digits = 6) {
  if (!Number.isFinite(v)) return "NaN";
  if (v === 0) return "0";
  if (Math.abs(v) < 1e-5) return v.toExponential(6);
  return v.toFixed(digits).replace(/0+$/, "").replace(/\.$/, "");
}

function fmtKm(v) {
  const n = Math.abs(Number(v));
  if (!Number.isFinite(n)) return "NaN";
  if (n >= 1000) return fmt(v, 3);
  if (n >= 10) return fmt(v, 5);
  return fmt(v, 8);
}

function asymptoticPercent(iteration, ratio) {
  const r = clamp(Number(ratio), 0.000001, 0.999999);
  const n = Math.max(0, Number(iteration) || 0);
  const rem = Math.exp(Math.log1p(-r) * n);
  return clamp((1 - rem) * 100, 0, 99.999999999);
}

function formatSubintervalCount(iteration) {
  if (iteration <= 52) return (2 ** iteration).toLocaleString("en-US");
  const log10 = iteration * Math.log10(2);
  const exponent = Math.floor(log10);
  const mantissa = 10 ** (log10 - exponent);
  return `~${mantissa.toFixed(3)}e${exponent}`;
}

class SimCore {
  constructor() {
    this.running = false;
    this.speed = Number(els.speed.value);
    this.pathType = els.pathType.value;
    this.qualityMode = els.qualityMode.value;
    this.realLengthKm = clamp(Number(els.realLengthKm?.value ?? 1), 0.001, 1000000);
    this.baseIntervalMs = 520;
    this.intervalShrink = 0.92;
    this.minIntervalMs = 22;
    this.runnerCounter = 0;
    this.runners = [];
    this.arcSamples = 1024;
    this.arcLengthTable = new Float64Array(this.arcSamples + 1);
    this.pathTotalLength = 1;
    this.rebuildPathMetric();
    this.addDefaultRunners();
  }

  addDefaultRunners() {
    this.runners = [];
    this.runnerCounter = 0;
    this.addRunner({ name: "AQUILES", ratio: 0.5, startS: 0, voiceIndex: 0, color: RUNNER_PALETTE[0] });
    this.addRunner({ name: "RUNNER B", ratio: 0.58, startS: 0.05, voiceIndex: 1, color: RUNNER_PALETTE[1] });
    this.addRunner({ name: "RUNNER C", ratio: 0.44, startS: 0.08, voiceIndex: 2, color: RUNNER_PALETTE[2] });
  }

  getPath() {
    return PATHS[this.pathType] || PATHS.line;
  }

  mapS(s) {
    return this.getPath().map(clamp(s, 0, 1));
  }

  getGoalPoint() {
    return this.mapS(1);
  }

  rebuildPathMetric() {
    const path = this.getPath();
    let acc = 0;
    let prev = path.map(0);
    this.arcLengthTable[0] = 0;
    for (let i = 1; i <= this.arcSamples; i += 1) {
      const p = path.map(i / this.arcSamples);
      acc += d2(prev, p);
      this.arcLengthTable[i] = acc;
      prev = p;
    }
    this.pathTotalLength = Math.max(acc, 1e-9);
  }

  getArcLengthAtS(s) {
    const t = clamp(s, 0, 1) * this.arcSamples;
    const i = Math.floor(t);
    const frac = t - i;
    const i1 = Math.min(this.arcSamples, i + 1);
    return lerp(this.arcLengthTable[i], this.arcLengthTable[i1], frac);
  }

  distanceAlongPath(a, b) {
    return Math.abs(this.getArcLengthAtS(a) - this.getArcLengthAtS(b));
  }

  pathDistanceToKm(pathDistance) {
    return (pathDistance / this.pathTotalLength) * this.realLengthKm;
  }

  setRealLengthKm(km) {
    const parsed = Number(km);
    this.realLengthKm = clamp(Number.isFinite(parsed) ? parsed : 1, 0.001, 1000000);
    this.runners.forEach((runner) => {
      const remPath = runner.remainingNorm * runner.startGap;
      const jumpPath = runner.lastJumpNorm * runner.startGap;
      runner.remainingKm = this.pathDistanceToKm(remPath);
      runner.lastJumpKm = this.pathDistanceToKm(jumpPath);
    });
  }

  setRunning(v) {
    this.running = Boolean(v);
  }

  setSpeed(v) {
    this.speed = clamp(Number(v) || 1, 0.1, 4);
  }

  setPathType(pathType) {
    if (!PATHS[pathType]) return;
    this.pathType = pathType;
    this.rebuildPathMetric();
    this.resetAll(performance.now());
  }

  setQuality(mode) {
    if (!QUALITY[mode]) return;
    this.qualityMode = mode;
  }

  getQualityConfig() {
    return QUALITY[this.qualityMode] || QUALITY.normal;
  }

  addRunner({ name, ratio, startS, voiceIndex, color, trailColor, speedMul, direction } = {}) {
    if (this.runners.length >= 12) return;
    this.runnerCounter += 1;
    const idx = this.runners.length;
    const dir = Number(direction ?? 1) >= 0 ? 1 : -1;
    const runner = {
      id: `runner_${this.runnerCounter}`,
      name: name || `RUNNER ${this.runnerCounter}`,
      enabled: true,
      color: color || RUNNER_PALETTE[idx % RUNNER_PALETTE.length],
      trailColor: trailColor || color || RUNNER_PALETTE[idx % RUNNER_PALETTE.length],
      ratio: clamp(Number(ratio ?? (0.45 + (idx % 4) * 0.06)), 0.05, 0.95),
      startS: clamp(Number(startS ?? (idx * 0.04)), 0, 0.92),
      speedMul: clamp(Number(speedMul ?? 1), 0, 2),
      direction: dir,
      s: 0,
      targetS: dir > 0 ? 1 : 0,
      startGap: 1,
      voiceIndex: Number(voiceIndex ?? (idx % 3)),
      iteration: 0,
      lastStepAt: performance.now(),
      remainingNorm: 1,
      lastJumpNorm: 0,
      remainingKm: 0,
      lastJumpKm: 0,
      history: [],
      pow5: 1n,
      exactHalf: false,
      remainingExact: "1.0",
    };
    this.resetRunner(runner, performance.now());
    this.runners.push(runner);
  }

  removeRunner() {
    if (this.runners.length <= 1) return;
    this.runners.pop();
  }

  resetRunner(runner, now) {
    runner.s = clamp(runner.startS, 0, 0.96);
    runner.targetS = runner.direction > 0 ? 1 : 0;
    runner.startGap = Math.max(1e-12, this.distanceAlongPath(runner.s, runner.targetS));
    runner.iteration = 0;
    runner.lastStepAt = now;
    runner.remainingNorm = 1;
    runner.lastJumpNorm = 0;
    runner.remainingKm = this.pathDistanceToKm(runner.startGap);
    runner.lastJumpKm = 0;
    runner.history = [{ ...this.mapS(runner.s), n: 0 }];
    runner.exactHalf =
      runner.direction > 0 && Math.abs(runner.ratio - 0.5) < 1e-9 && Math.abs(runner.startS) < 1e-9;
    runner.pow5 = 1n;
    runner.remainingExact = "1.0";
  }

  resetAll(now = performance.now()) {
    this.runners.forEach((runner) => this.resetRunner(runner, now));
  }

  updateRunner(id, patch) {
    const runner = this.runners.find((r) => r.id === id);
    if (!runner) return;

    if (patch.name !== undefined) runner.name = String(patch.name).slice(0, 24) || runner.name;
    if (patch.enabled !== undefined) runner.enabled = Boolean(patch.enabled);
    if (patch.voiceIndex !== undefined) runner.voiceIndex = clamp(Number(patch.voiceIndex), 0, 2);
    if (patch.ratio !== undefined) {
      runner.ratio = clamp(Number(patch.ratio), 0.05, 0.95);
      this.resetRunner(runner, performance.now());
    }
    if (patch.startS !== undefined) {
      runner.startS = clamp(Number(patch.startS), 0, 0.92);
      this.resetRunner(runner, performance.now());
    }
    if (patch.speedMul !== undefined) {
      runner.speedMul = clamp(Number(patch.speedMul), 0, 2);
    }
    if (patch.direction !== undefined) {
      const dir = Number(patch.direction) >= 0 ? 1 : -1;
      runner.direction = dir;
      runner.targetS = dir > 0 ? 1 : 0;
      runner.startGap = Math.max(1e-12, this.distanceAlongPath(runner.s, runner.targetS));
      runner.lastStepAt = performance.now();
      runner.remainingNorm = 1;
      runner.lastJumpNorm = 0;
      runner.remainingKm = this.pathDistanceToKm(runner.startGap);
      runner.lastJumpKm = 0;
      runner.exactHalf = false;
    }
    if (patch.color !== undefined) runner.color = String(patch.color);
    if (patch.trailColor !== undefined) runner.trailColor = String(patch.trailColor);
  }

  step(now) {
    if (!this.running) return [];
    const events = [];

    this.runners.forEach((runner) => {
      if (!runner.enabled) return;
      const effectiveSpeed = this.speed * runner.speedMul;
      if (effectiveSpeed <= 0.00001) return;
      const interval = Math.max(
        this.minIntervalMs,
        (this.baseIntervalMs * Math.pow(this.intervalShrink, runner.iteration)) / effectiveSpeed
      );
      if (now - runner.lastStepAt < interval) return;

      runner.lastStepAt = now;
      const prevS = runner.s;
      runner.s = prevS + (runner.targetS - prevS) * runner.ratio;
      runner.s = clamp(runner.s, 0, 1);
      runner.iteration += 1;

      const jump = this.distanceAlongPath(prevS, runner.s);
      const rem = this.distanceAlongPath(runner.s, runner.targetS);
      runner.lastJumpNorm = jump / runner.startGap;
      runner.remainingNorm = rem / runner.startGap;
      runner.lastJumpKm = this.pathDistanceToKm(jump);
      runner.remainingKm = this.pathDistanceToKm(rem);

      if (runner.exactHalf) {
        runner.pow5 *= 5n;
        runner.remainingExact = formatHalfExact(runner.iteration, runner.pow5, 72);
      }

      const point = this.mapS(runner.s);
      runner.history.push({ ...point, n: runner.iteration });
      const keep = this.getQualityConfig().trailPoints + 80;
      if (runner.history.length > keep) runner.history.shift();

      events.push({
        type: "runner_step",
        runnerId: runner.id,
        iteration: runner.iteration,
        t: now / 1000,
        remainingNorm: Math.max(runner.remainingNorm, 1e-16),
        jumpNorm: Math.max(runner.lastJumpNorm, 1e-16),
        worldPos: point,
        normalizedPosition: point.x,
        pathPhase: runner.s,
        runner,
      });
    });

    return events;
  }

  getLeadRunner() {
    let lead = null;
    this.runners.forEach((runner) => {
      if (!runner.enabled) return;
      if (!lead || runner.remainingNorm < lead.remainingNorm) lead = runner;
    });
    return lead;
  }

  getMaxIteration() {
    return this.runners.reduce((max, runner) => Math.max(max, runner.iteration), 0);
  }

  serializeRunners() {
    return this.runners.map((runner) => ({
      name: runner.name,
      enabled: runner.enabled,
      color: runner.color,
      trailColor: runner.trailColor,
      ratio: runner.ratio,
      startS: runner.startS,
      speedMul: runner.speedMul,
      direction: runner.direction,
      voiceIndex: runner.voiceIndex,
    }));
  }

  loadRunners(serialized) {
    if (!Array.isArray(serialized) || serialized.length === 0) return;
    this.runners = [];
    this.runnerCounter = 0;
    serialized.slice(0, 12).forEach((item, idx) => {
      this.addRunner({
        name: item.name || `RUNNER ${idx + 1}`,
        enabled: item.enabled,
        color: item.color || RUNNER_PALETTE[idx % RUNNER_PALETTE.length],
        trailColor: item.trailColor || item.color || RUNNER_PALETTE[idx % RUNNER_PALETTE.length],
        ratio: item.ratio,
        startS: item.startS,
        speedMul: item.speedMul,
        direction: item.direction,
        voiceIndex: item.voiceIndex,
      });
      const runner = this.runners[this.runners.length - 1];
      runner.enabled = item.enabled !== false;
    });
    this.resetAll(performance.now());
  }
}

class ModularAudioEngine {
  constructor() {
    this.ctx = null;
    this.ready = false;
    this.qualityMode = els.qualityMode.value;
    this.reverbDecayApplied = null;
    this.voiceCount = 0;
    this.noiseCache = new Map();

    this.voiceSpecs = [
      { id: "A", enabled: true, wave: els.waveA.value, gain: 0.66, pan: -0.25, noiseColor: "pink", noiseGain: 0.02 },
      { id: "B", enabled: true, wave: els.waveB.value, gain: 0.56, pan: 0, noiseColor: "brown", noiseGain: 0.03 },
      { id: "C", enabled: true, wave: els.waveC.value, gain: 0.48, pan: 0.24, noiseColor: "white", noiseGain: 0.012 },
    ];

    this.params = this.readParamsFromUI();
  }

  readParamsFromUI() {
    return {
      filterMode: els.filterMode.value,
      cutoffHz: Number(els.cutoff.value),
      highpassHz: Number(els.highpass.value),
      resonanceQ: Number(els.resonance.value),
      lfoRateHz: Number(els.lfoRate.value),
      lfoDepth: Number(els.lfoDepth.value),
      modSource: els.modSource.value,
      modAmount: Number(els.modAmount.value),
      oscLayers: Number(els.oscLayers.value),
      delayMix: Number(els.delayMix.value),
      delayTimeMs: Number(els.delayTime.value),
      delayFeedback: Number(els.delayFeedback.value),
      reverbMix: Number(els.reverbMix.value),
      reverbDecaySec: Number(els.reverbDecay.value),
      masterGain: Number(els.masterGain.value),
    };
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
    this.delayFeedback = this.ctx.createGain();
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

    this.lfo = this.ctx.createOscillator();
    this.lfo.type = "triangle";
    this.lfoGain = this.ctx.createGain();
    this.lfo.connect(this.lfoGain);
    this.lfoGain.connect(this.lp.frequency);
    this.lfo.start();

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
    this.delayTone.connect(this.delayFeedback);
    this.delayFeedback.connect(this.delay);

    this.sat.connect(this.reverbSend);
    this.reverbSend.connect(this.reverbConvolver);
    this.reverbConvolver.connect(this.reverbWet);
    this.reverbWet.connect(this.comp);

    this.comp.connect(this.master);
    this.master.connect(this.ctx.destination);
  }

  setVoiceEnabled(index, enabled) {
    if (!this.voiceSpecs[index]) return;
    this.voiceSpecs[index].enabled = Boolean(enabled);
  }

  setVoiceWave(index, wave) {
    if (!this.voiceSpecs[index]) return;
    this.voiceSpecs[index].wave = wave;
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
    this.delayFeedback.gain.setTargetAtTime(p.delayFeedback, t, 0.03);
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

  computeModValue(evt) {
    const src = this.params.modSource;
    if (src === "none") return 0;
    if (src === "remaining") return 1 - clamp(evt.remainingNorm, 0, 1);
    if (src === "jump") return clamp(Math.log10(1 / evt.jumpNorm) / 16, 0, 1);
    if (src === "iteration") return clamp(evt.iteration / 140, 0, 1);
    return 0;
  }

  triggerRunnerStep(evt) {
    const runner = evt.runner;
    const voiceSpec = this.voiceSpecs[runner.voiceIndex % this.voiceSpecs.length];
    if (!voiceSpec || !voiceSpec.enabled || !runner.enabled) return;

    const t = this.ctx.currentTime + 0.005;
    const p = this.params;

    const modVal = this.computeModValue(evt);
    const cutoffMod = p.cutoffHz * (1 + p.modAmount * (modVal * 0.9));
    this.lp.frequency.setTargetAtTime(clamp(cutoffMod, 80, 22050), t, 0.01);

    const freq = 92 + (1 - evt.remainingNorm) * 480 + Math.min(160, evt.iteration * 1.4);
    this.triggerVoice(voiceSpec, freq, evt, t);
  }

  triggerVoice(spec, baseFreq, evt, t0) {
    const env = this.ctx.createGain();
    const panNode = this.ctx.createStereoPanner();

    const spatial = clamp(evt.worldPos.x * 2 - 1, -1, 1);
    panNode.pan.setValueAtTime(clamp(spec.pan + spatial * 0.24, -1, 1), t0);

    const jumpInfluence = clamp(Math.log10(1 / evt.jumpNorm) / 10, 0, 1);
    const peak = clamp(spec.gain * (0.45 + jumpInfluence * 0.6), 0.02, 0.95);
    const attack = 0.0012;
    const decay = 0.07;
    const sustain = 0.18;
    const hold = 0.018 + (1 - evt.remainingNorm) * 0.035;
    const release = 0.09;
    const stopTime = t0 + attack + decay + hold + release + 0.012;

    env.gain.setValueAtTime(0.0001, t0);
    env.gain.exponentialRampToValueAtTime(peak, t0 + attack);
    env.gain.exponentialRampToValueAtTime(Math.max(0.0001, peak * sustain), t0 + attack + decay);
    env.gain.setValueAtTime(Math.max(0.0001, peak * sustain), t0 + attack + decay + hold);
    env.gain.exponentialRampToValueAtTime(0.0001, stopTime);

    env.connect(panNode);
    panNode.connect(this.inputBus);

    const layers = clamp(Math.round(this.params.oscLayers), 1, 4);
    const wave = spec.wave === "saw" ? "sawtooth" : spec.wave;
    const spread = 10 + evt.iteration * 0.03;

    for (let i = 0; i < layers; i += 1) {
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      const center = (layers - 1) * 0.5;
      const detune = (i - center) * spread;
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
}

class Renderer {
  constructor(sim) {
    this.sim = sim;
    this.qualityMode = els.qualityMode.value;
    this.cameraAnchor = { x: 0.5, y: 0.5 };
  }

  setQuality(mode) {
    if (!QUALITY[mode]) return;
    this.qualityMode = mode;
  }

  getQualityConfig() {
    return QUALITY[this.qualityMode] || QUALITY.normal;
  }

  draw() {
    const q = this.getQualityConfig();
    const path = this.sim.getPath();
    const lead = this.sim.getLeadRunner();
    const goal = lead ? this.sim.mapS(lead.targetS) : this.sim.getGoalPoint();
    const leadRemaining = lead ? clamp(lead.remainingNorm, 1e-12, 1) : 1;
    const leadPoint = lead ? this.sim.mapS(lead.s) : goal;

    const baseSpan = path.baseSpan;
    const span = clamp(baseSpan * Math.max(leadRemaining * 6.2, q.minSpan / baseSpan), q.minSpan, baseSpan);
    const lockToGoal = clamp(1 - leadRemaining * 3.4, 0, 1);
    const anchorTarget = {
      x: lerp(leadPoint.x, goal.x, lockToGoal),
      y: lerp(leadPoint.y, goal.y, lockToGoal),
    };
    this.cameraAnchor.x = lerp(this.cameraAnchor.x, anchorTarget.x, 0.18);
    this.cameraAnchor.y = lerp(this.cameraAnchor.y, anchorTarget.y, 0.18);

    const viewW = span;
    const viewH = span * (canvas.height / canvas.width);
    const anchorBiasX = this.sim.pathType === "line" ? 0.82 : 0.56;
    const viewLeft = this.cameraAnchor.x - viewW * anchorBiasX;
    const viewTop = this.cameraAnchor.y - viewH * 0.5;
    const viewRight = viewLeft + viewW;
    const viewBottom = viewTop + viewH;

    const toX = (wx) => ((wx - viewLeft) / viewW) * canvas.width;
    const toY = (wy) => ((wy - viewTop) / viewH) * canvas.height;

    ctx.fillStyle = "#050401";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    this.drawGrid(toX, toY, viewLeft, viewRight, viewTop, viewBottom, viewW, q.gridLevels);
    this.drawPathGuide(path, toX, toY, q.pathSamples);
    this.drawTrails(toX, toY, q.trailPoints);
    this.drawGoal(goal, toX, toY);
    this.drawRunners(toX, toY);
    this.drawOverview(path, viewLeft, viewTop, viewW, viewH, q.overviewSamples);
    this.drawGauge();
    this.drawTopMetrics(span);
  }

  drawGrid(toX, toY, viewLeft, viewRight, viewTop, viewBottom, viewW, levels) {
    const base = 0.25;
    ctx.save();
    for (let level = 0; level < levels; level += 1) {
      const step = base / Math.pow(2, level);
      const px = (step / viewW) * canvas.width;
      if (px < 8 || px > 220) continue;

      const focus = Math.max(0, 1 - Math.abs(px - 72) / 80);
      const alpha = 0.035 + focus * (level % 2 ? 0.13 : 0.19);
      ctx.strokeStyle = `rgba(255, 179, 71, ${alpha.toFixed(4)})`;
      ctx.lineWidth = level % 4 === 0 ? 1.2 : 1;

      const sx = Math.floor(viewLeft / step) * step;
      for (let x = sx; x <= viewRight + step; x += step) {
        const screenX = toX(x);
        if (screenX < -3 || screenX > canvas.width + 3) continue;
        ctx.beginPath();
        ctx.moveTo(screenX + 0.5, 0);
        ctx.lineTo(screenX + 0.5, canvas.height);
        ctx.stroke();
      }

      const sy = Math.floor(viewTop / step) * step;
      for (let y = sy; y <= viewBottom + step; y += step) {
        const screenY = toY(y);
        if (screenY < -3 || screenY > canvas.height + 3) continue;
        ctx.beginPath();
        ctx.moveTo(0, screenY + 0.5);
        ctx.lineTo(canvas.width, screenY + 0.5);
        ctx.stroke();
      }

      if (px >= 18 && px <= 140) {
        const dotAlpha = Math.min(0.8, alpha * 1.3);
        const dotRadius = clamp(px / 95, 0.6, 1.7);
        ctx.fillStyle = `rgba(255, 179, 71, ${dotAlpha.toFixed(4)})`;
        for (let x = sx; x <= viewRight + step; x += step) {
          const screenX = toX(x);
          if (screenX < -3 || screenX > canvas.width + 3) continue;
          for (let y = sy; y <= viewBottom + step; y += step) {
            const screenY = toY(y);
            if (screenY < -3 || screenY > canvas.height + 3) continue;
            ctx.beginPath();
            ctx.arc(screenX, screenY, dotRadius, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }
    }
    ctx.restore();
  }

  drawPathGuide(path, toX, toY, samples) {
    ctx.save();
    ctx.strokeStyle = "rgba(255, 179, 71, 0.22)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i <= samples; i += 1) {
      const p = path.map(i / samples);
      const x = toX(p.x);
      const y = toY(p.y);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.restore();
  }

  drawTrails(toX, toY, maxPoints) {
    this.sim.runners.forEach((runner) => {
      if (!runner.enabled) return;
      const trail = runner.history.slice(-maxPoints);
      if (trail.length < 2) return;
      const trailRgb = this.hexToRgb(runner.trailColor || runner.color);

      for (let i = 1; i < trail.length; i += 1) {
        const t = i / (trail.length - 1);
        ctx.strokeStyle = `rgba(${trailRgb.join(",")}, ${(0.08 + t * 0.52).toFixed(4)})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(toX(trail[i - 1].x), toY(trail[i - 1].y));
        ctx.lineTo(toX(trail[i].x), toY(trail[i].y));
        ctx.stroke();
      }
    });
  }

  drawGoal(goal, toX, toY) {
    const x = toX(goal.x);
    const y = toY(goal.y);
    ctx.save();
    ctx.strokeStyle = "rgba(255, 127, 80, 0.95)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x - 18, y);
    ctx.lineTo(x + 18, y);
    ctx.moveTo(x, y - 18);
    ctx.lineTo(x, y + 18);
    ctx.stroke();
    ctx.restore();
  }

  drawRunners(toX, toY) {
    ctx.save();
    ctx.font = '13px "Courier New", monospace';

    this.sim.runners.forEach((runner) => {
      if (!runner.enabled) return;
      const p = this.sim.mapS(runner.s);
      const x = toX(p.x);
      const y = toY(p.y);
      const [r, g, b] = this.hexToRgb(runner.color);

      const aheadS = clamp(runner.s + 0.02 * runner.direction, 0, 1);
      const aheadP = this.sim.mapS(aheadS);
      let dx = toX(aheadP.x) - x;
      let dy = toY(aheadP.y) - y;
      let mag = Math.hypot(dx, dy);
      if (mag < 1e-5) {
        dx = runner.direction;
        dy = 0;
        mag = 1;
      }
      const ux = dx / mag;
      const uy = dy / mag;

      const coneLen = 54 + (1 - clamp(runner.remainingNorm, 0, 1)) * 92;
      const glow = ctx.createRadialGradient(x, y, 1, x, y, coneLen * 0.86);
      glow.addColorStop(0, `rgba(${r}, ${g}, ${b}, 0.26)`);
      glow.addColorStop(0.45, `rgba(${r}, ${g}, ${b}, 0.12)`);
      glow.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0.0)`);
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(x, y, coneLen * 0.86, 0, Math.PI * 2);
      ctx.fill();

      const spread = 0.52;
      const lx = ux * Math.cos(spread) - uy * Math.sin(spread);
      const ly = ux * Math.sin(spread) + uy * Math.cos(spread);
      const rx = ux * Math.cos(-spread) - uy * Math.sin(-spread);
      const ry = ux * Math.sin(-spread) + uy * Math.cos(-spread);
      const tipX = x + ux * coneLen;
      const tipY = y + uy * coneLen;
      const leftX = x + lx * coneLen * 0.82;
      const leftY = y + ly * coneLen * 0.82;
      const rightX = x + rx * coneLen * 0.82;
      const rightY = y + ry * coneLen * 0.82;

      const beam = ctx.createLinearGradient(x, y, tipX, tipY);
      beam.addColorStop(0, `rgba(${r}, ${g}, ${b}, 0.28)`);
      beam.addColorStop(0.65, `rgba(${r}, ${g}, ${b}, 0.1)`);
      beam.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0.0)`);
      ctx.fillStyle = beam;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(leftX, leftY);
      ctx.lineTo(tipX, tipY);
      ctx.lineTo(rightX, rightY);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.95)`;
      ctx.beginPath();
      ctx.arc(x, y, 6, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "rgba(255, 179, 71, 0.85)";
      ctx.fillText(`${runner.name} n=${runner.iteration}`, x + 10, y - 10);
    });

    ctx.restore();
  }

  drawOverview(path, viewLeft, viewTop, viewW, viewH, samples) {
    const w = Math.min(390, canvas.width * 0.39);
    const h = 118;
    const x = canvas.width - w - 14;
    const y = 14;

    const mapX = (wx) => x + 14 + wx * (w - 28);
    const mapY = (wy) => y + 28 + wy * (h - 40);

    ctx.save();
    ctx.fillStyle = "rgba(7, 4, 1, 0.8)";
    ctx.strokeStyle = "rgba(255, 179, 71, 0.46)";
    ctx.lineWidth = 1;
    ctx.fillRect(x, y, w, h);
    ctx.strokeRect(x + 0.5, y + 0.5, w, h);

    ctx.fillStyle = "rgba(255, 179, 71, 0.9)";
    ctx.font = '12px "Courier New", monospace';
    ctx.fillText("MAPA GLOBAL", x + 9, y + 16);

    ctx.strokeStyle = "rgba(255, 179, 71, 0.35)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i <= samples; i += 1) {
      const p = path.map(i / samples);
      if (i === 0) ctx.moveTo(mapX(p.x), mapY(p.y));
      else ctx.lineTo(mapX(p.x), mapY(p.y));
    }
    ctx.stroke();

    this.sim.runners.forEach((runner) => {
      if (!runner.enabled) return;
      const p = this.sim.mapS(runner.s);
      const [r, g, b] = this.hexToRgb(runner.color);
      ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.96)`;
      ctx.beginPath();
      ctx.arc(mapX(p.x), mapY(p.y), 3, 0, Math.PI * 2);
      ctx.fill();
    });

    const vx = mapX(clamp(viewLeft, 0, 1));
    const vy = mapY(clamp(viewTop, 0, 1));
    const vw = Math.max(2, mapX(clamp(viewLeft + viewW, 0, 1)) - vx);
    const vh = Math.max(2, mapY(clamp(viewTop + viewH, 0, 1)) - vy);
    ctx.strokeStyle = "rgba(255, 127, 80, 0.8)";
    ctx.strokeRect(vx, vy, vw, vh);

    ctx.restore();
  }

  drawGauge() {
    const maxN = this.sim.getMaxIteration();
    const gx = 20;
    const gy = canvas.height - 36;
    const gw = Math.min(480, canvas.width * 0.52);
    const gh = 12;

    const minN = Math.max(0, maxN - 64);
    const nToX = (n) => gx + ((n - minN) / 64) * gw;

    ctx.save();
    ctx.fillStyle = "rgba(6, 4, 1, 0.75)";
    ctx.strokeStyle = "rgba(255, 179, 71, 0.42)";
    ctx.lineWidth = 1;
    ctx.fillRect(gx, gy, gw, gh);
    ctx.strokeRect(gx + 0.5, gy + 0.5, gw, gh);

    for (let n = minN; n <= minN + 64; n += 4) {
      const x = nToX(n);
      const major = n % 8 === 0;
      ctx.strokeStyle = major ? "rgba(255, 179, 71, 0.6)" : "rgba(255, 179, 71, 0.24)";
      ctx.beginPath();
      ctx.moveTo(x + 0.5, gy - (major ? 8 : 4));
      ctx.lineTo(x + 0.5, gy + gh + 2);
      ctx.stroke();
      if (major) {
        ctx.fillStyle = "rgba(255, 179, 71, 0.8)";
        ctx.font = '11px "Courier New", monospace';
        ctx.fillText(`${n}`, x - 7, gy - 10);
      }
    }

    const px = nToX(clamp(maxN, minN, minN + 64));
    ctx.strokeStyle = "rgba(255, 127, 80, 0.95)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(px + 0.5, gy - 12);
    ctx.lineTo(px + 0.5, gy + gh + 3);
    ctx.stroke();

    ctx.fillStyle = "rgba(255, 179, 71, 0.9)";
    ctx.font = '13px "Courier New", monospace';
    ctx.fillText(`PROFUNDIDAD MAX n=${maxN} :: SUBTRAMOS 2^n=${formatSubintervalCount(maxN)}`, gx, gy - 21);
    ctx.restore();
  }

  drawTopMetrics(span) {
    const lead = this.sim.getLeadRunner();
    if (!lead) return;
    const totalKm = this.sim.pathDistanceToKm(lead.startGap);
    const doneKm = Math.max(0, totalKm - lead.remainingKm);
    const pct = asymptoticPercent(lead.iteration, lead.ratio);

    ctx.save();
    ctx.fillStyle = "rgba(255, 179, 71, 0.88)";
    ctx.font = '13px "Courier New", monospace';
    ctx.fillText(
      `LEAD ${lead.name} :: KM ${fmtKm(doneKm)}/${fmtKm(totalKm)} :: REM_KM ${fmtKm(lead.remainingKm)} :: ${pct.toFixed(6)}% :: ZOOM~${(0.8 / span).toFixed(2)}X`,
      22,
      28
    );
    if (lead.exactHalf) {
      const exact = lead.remainingExact.length > 86 ? `${lead.remainingExact.slice(0, 86)}...` : lead.remainingExact;
      ctx.fillText(`REM EXACTA ${exact}`, 22, 50);
    }
    ctx.restore();
  }

  hexToRgb(hex) {
    const value = hex.replace("#", "");
    const int = Number.parseInt(value, 16);
    if (!Number.isFinite(int)) return [255, 179, 71];
    return [(int >> 16) & 255, (int >> 8) & 255, int & 255];
  }
}

const sim = new SimCore();
const audio = new ModularAudioEngine();
const renderer = new Renderer(sim);

function syncCanvasSize() {
  const rect = canvas.getBoundingClientRect();
  canvas.width = Math.max(320, Math.floor(rect.width));
  canvas.height = Math.max(260, Math.floor(rect.width * 0.58));
}

function readAudioParamsFromUI() {
  return audio.readParamsFromUI();
}

function applyAudioParamsFromUI() {
  audio.applyParams(readAudioParamsFromUI());
}

function renderRunnerList() {
  els.runnerList.innerHTML = sim.runners
    .map(
      (runner) => `
        <article class="runner-item" data-runner-id="${runner.id}">
          <div class="runner-header">
            <span class="color-chip" style="background:${runner.color}"></span>
            <strong>${runner.name}</strong>
            <label class="small"><input type="checkbox" data-field="enabled" ${runner.enabled ? "checked" : ""} /> ON</label>
          </div>
          <div class="runner-grid">
            <label class="control small">
              DOT
              <input type="color" data-field="color" value="${runner.color}" />
            </label>
            <label class="control small">
              LINE
              <input type="color" data-field="trailColor" value="${runner.trailColor || runner.color}" />
            </label>
            <label class="control small">
              RATIO
              <input type="range" min="0.05" max="0.95" step="0.01" data-field="ratio" value="${runner.ratio}" />
            </label>
            <label class="control small">
              START S
              <input type="range" min="0" max="0.92" step="0.01" data-field="startS" value="${runner.startS}" />
            </label>
            <label class="control small">
              SPEED
              <input type="range" min="0" max="2" step="0.01" data-field="speedMul" value="${runner.speedMul}" />
            </label>
            <label class="control small">
              VOICE
              <select data-field="voiceIndex">
                <option value="0" ${runner.voiceIndex === 0 ? "selected" : ""}>A</option>
                <option value="1" ${runner.voiceIndex === 1 ? "selected" : ""}>B</option>
                <option value="2" ${runner.voiceIndex === 2 ? "selected" : ""}>C</option>
              </select>
            </label>
            <label class="control small">
              DIR
              <select data-field="direction">
                <option value="1" ${runner.direction > 0 ? "selected" : ""}>FWD</option>
                <option value="-1" ${runner.direction < 0 ? "selected" : ""}>REV</option>
              </select>
            </label>
          </div>
          <div class="small">
            <span class="runner-status" data-status-for="${runner.id}">KM 0 / 0 :: REM 0 :: 0%</span>
          </div>
        </article>
      `
    )
    .join("");

  updateRunnerStatusTexts();
}

function updateRunnerStatusTexts() {
  sim.runners.forEach((runner) => {
    const node = els.runnerList.querySelector(`[data-status-for="${runner.id}"]`);
    if (!node) return;
    const totalKm = sim.pathDistanceToKm(runner.startGap);
    const doneKm = Math.max(0, totalKm - runner.remainingKm);
    const pct = asymptoticPercent(runner.iteration, runner.ratio);
    node.textContent =
      `KM ${fmtKm(doneKm)} / ${fmtKm(totalKm)} :: REM ${fmtKm(runner.remainingKm)} :: ${pct.toFixed(6)}%`;
  });
}

function updateReadout() {
  updateRunnerStatusTexts();

  const lead = sim.getLeadRunner();
  const activeRunners = sim.runners.filter((r) => r.enabled).length;
  if (!lead) {
    els.readout.textContent = `PATH ${sim.pathType.toUpperCase()} :: RUNNERS 0 :: SCALE ${fmt(sim.realLengthKm, 4)}km`;
    if (els.decimalWindow) els.decimalWindow.textContent = "REM EXACTA: N/A";
    if (els.progressMain) els.progressMain.textContent = `KM: 0 / ${fmtKm(sim.realLengthKm)} (LIDER N/A)`;
    if (els.progressSub) els.progressSub.textContent = "AVANCE: 0.000000% (LIMITE <100%) :: REM: N/A";
    if (els.progressFill) els.progressFill.style.width = "0%";
    return;
  }

  const totalKm = sim.pathDistanceToKm(lead.startGap);
  const doneKm = Math.max(0, totalKm - lead.remainingKm);
  const remainingKm = lead.remainingKm;
  const percentAsym = asymptoticPercent(lead.iteration, lead.ratio);
  const barPercent = clamp(percentAsym, 0, 99.9);

  const remText = lead.exactHalf
    ? (lead.remainingExact.length > 92 ? `${lead.remainingExact.slice(0, 92)}...` : lead.remainingExact)
    : lead.remainingNorm.toExponential(7);
  els.readout.textContent =
    `PATH ${sim.pathType.toUpperCase()} :: RUNNERS ${activeRunners} :: LEAD ${lead.name} :: ` +
    `n=${String(lead.iteration).padStart(4, "0")} :: REM ${remText} :: REM_KM ${fmtKm(remainingKm)}km :: ` +
    `Δ ${fmt(lead.lastJumpNorm)} (${fmtKm(lead.lastJumpKm)}km) :: ` +
    `DIR ${lead.direction > 0 ? "FWD" : "REV"} :: v=${lead.speedMul.toFixed(2)} :: AUDIO_EVT ${audio.voiceCount}`;

  if (els.progressMain) {
    els.progressMain.textContent =
      `LIDER ${lead.name} :: KM ${fmtKm(doneKm)} / ${fmtKm(totalKm)} :: RESTANTE ${fmtKm(remainingKm)} km`;
  }
  if (els.progressSub) {
    els.progressSub.textContent =
      `AVANCE ASINTOTICO ${percentAsym.toFixed(9)}% (LIMITE <100%) :: SCALE TOTAL ${fmtKm(sim.realLengthKm)} km`;
  }
  if (els.progressFill) {
    els.progressFill.style.width = `${barPercent}%`;
  }

  if (els.decimalWindow) {
    if (lead.exactHalf) {
      const digits = String(lead.iteration);
      els.decimalWindow.textContent = `REM EXACTA [n=${lead.iteration}, digits=${digits}] :: ${lead.remainingExact}`;
    } else {
      els.decimalWindow.textContent =
        `REM APROX [n=${lead.iteration}] :: ${lead.remainingNorm.toExponential(12)} :: ` +
        `RATIO=${lead.ratio.toFixed(3)} :: DIR=${lead.direction > 0 ? "FWD" : "REV"} :: SPEED=${lead.speedMul.toFixed(2)} :: ` +
        `REM_KM=${fmtKm(lead.remainingKm)} :: ΔKM=${fmtKm(lead.lastJumpKm)} :: SCALE=${fmtKm(sim.realLengthKm)}km`;
    }
    els.decimalWindow.scrollLeft = els.decimalWindow.scrollWidth;
  }
}

function collectPreset() {
  return {
    meta: {
      name: "User Preset",
      version: "1.0.0",
      createdAt: new Date().toISOString(),
    },
    scene: {
      pathType: sim.pathType,
      speed: sim.speed,
      qualityMode: sim.qualityMode,
      realLengthKm: sim.realLengthKm,
    },
    synth: {
      ...readAudioParamsFromUI(),
      voiceEnabled: [els.voiceA.checked, els.voiceB.checked, els.voiceC.checked],
      voiceWaves: [els.waveA.value, els.waveB.value, els.waveC.value],
    },
    runners: sim.serializeRunners(),
  };
}

function applyPreset(preset) {
  if (!preset || typeof preset !== "object") return;

  const scene = preset.scene || {};
  const synth = preset.synth || {};

  if (scene.pathType && PATHS[scene.pathType]) {
    els.pathType.value = scene.pathType;
    sim.setPathType(scene.pathType);
  }
  if (scene.speed !== undefined) {
    els.speed.value = String(clamp(Number(scene.speed), 0.3, 2.6));
    sim.setSpeed(els.speed.value);
  }
  if (scene.qualityMode && QUALITY[scene.qualityMode]) {
    els.qualityMode.value = scene.qualityMode;
    sim.setQuality(scene.qualityMode);
    renderer.setQuality(scene.qualityMode);
    audio.setQuality(scene.qualityMode);
  }
  if (scene.realLengthKm !== undefined) {
    const km = clamp(Number(scene.realLengthKm), 0.001, 1000000);
    if (els.realLengthKm) els.realLengthKm.value = String(km);
    sim.setRealLengthKm(km);
  }

  const setIf = (el, v) => {
    if (!el || v === undefined || v === null) return;
    el.value = String(v);
  };

  setIf(els.filterMode, synth.filterMode);
  setIf(els.cutoff, synth.cutoffHz);
  setIf(els.highpass, synth.highpassHz);
  setIf(els.resonance, synth.resonanceQ);
  setIf(els.lfoRate, synth.lfoRateHz);
  setIf(els.lfoDepth, synth.lfoDepth);
  setIf(els.modSource, synth.modSource);
  setIf(els.modAmount, synth.modAmount);
  setIf(els.oscLayers, synth.oscLayers);
  setIf(els.delayMix, synth.delayMix);
  setIf(els.delayTime, synth.delayTimeMs);
  setIf(els.delayFeedback, synth.delayFeedback);
  setIf(els.reverbMix, synth.reverbMix);
  setIf(els.reverbDecay, synth.reverbDecaySec);
  setIf(els.masterGain, synth.masterGain);

  if (Array.isArray(synth.voiceWaves)) {
    if (synth.voiceWaves[0]) els.waveA.value = synth.voiceWaves[0];
    if (synth.voiceWaves[1]) els.waveB.value = synth.voiceWaves[1];
    if (synth.voiceWaves[2]) els.waveC.value = synth.voiceWaves[2];
  }
  if (Array.isArray(synth.voiceEnabled)) {
    els.voiceA.checked = synth.voiceEnabled[0] !== false;
    els.voiceB.checked = synth.voiceEnabled[1] !== false;
    els.voiceC.checked = synth.voiceEnabled[2] !== false;
  }

  if (Array.isArray(preset.runners) && preset.runners.length > 0) {
    sim.loadRunners(preset.runners);
  }

  audio.setVoiceWave(0, els.waveA.value);
  audio.setVoiceWave(1, els.waveB.value);
  audio.setVoiceWave(2, els.waveC.value);
  audio.setVoiceEnabled(0, els.voiceA.checked);
  audio.setVoiceEnabled(1, els.voiceB.checked);
  audio.setVoiceEnabled(2, els.voiceC.checked);
  applyAudioParamsFromUI();

  renderRunnerList();
  updateReadout();
}

function factoryPresetById(id) {
  const presets = {
    zenon_dry: {
      scene: { pathType: "line", speed: 1.15, qualityMode: "normal", realLengthKm: 5 },
      synth: {
        filterMode: "hp_lp",
        cutoffHz: 1800,
        highpassHz: 110,
        resonanceQ: 1.2,
        lfoRateHz: 2.1,
        lfoDepth: 0.28,
        modSource: "remaining",
        modAmount: 0.64,
        oscLayers: 2,
        delayMix: 0.08,
        delayTimeMs: 180,
        delayFeedback: 0.16,
        reverbMix: 0.04,
        reverbDecaySec: 1.2,
        masterGain: 0.56,
        voiceEnabled: [true, true, true],
        voiceWaves: ["square", "saw", "triangle"],
      },
      runners: [
        { name: "AQUILES", enabled: true, color: "#ffffff", trailColor: "#ffffff", ratio: 0.5, startS: 0, speedMul: 1, direction: 1, voiceIndex: 0 },
        { name: "RUNNER B", enabled: true, color: "#62e8ff", trailColor: "#62e8ff", ratio: 0.56, startS: 0.05, speedMul: 1, direction: 1, voiceIndex: 1 },
        { name: "RUNNER C", enabled: true, color: "#ff8ae6", trailColor: "#ff8ae6", ratio: 0.43, startS: 0.08, speedMul: 1, direction: 1, voiceIndex: 2 },
      ],
    },
    infinite_drone: {
      scene: { pathType: "circle", speed: 0.8, qualityMode: "high", realLengthKm: 12 },
      synth: {
        filterMode: "bandpass",
        cutoffHz: 950,
        highpassHz: 70,
        resonanceQ: 8.8,
        lfoRateHz: 0.33,
        lfoDepth: 0.62,
        modSource: "iteration",
        modAmount: 0.72,
        oscLayers: 4,
        delayMix: 0.36,
        delayTimeMs: 460,
        delayFeedback: 0.55,
        reverbMix: 0.44,
        reverbDecaySec: 4.2,
        masterGain: 0.52,
        voiceEnabled: [true, true, true],
        voiceWaves: ["sine", "triangle", "sine"],
      },
      runners: [
        { name: "AQUILES", enabled: true, color: "#63f6ff", trailColor: "#63f6ff", ratio: 0.47, startS: 0.02, speedMul: 1, direction: 1, voiceIndex: 0 },
        { name: "ORBIT B", enabled: true, color: "#9cff6a", trailColor: "#9cff6a", ratio: 0.52, startS: 0.12, speedMul: 1, direction: 1, voiceIndex: 1 },
        { name: "ORBIT C", enabled: true, color: "#e2a8ff", trailColor: "#e2a8ff", ratio: 0.41, startS: 0.2, speedMul: 1, direction: 1, voiceIndex: 2 },
      ],
    },
    pursuit_percussive: {
      scene: { pathType: "spiral", speed: 1.45, qualityMode: "normal", realLengthKm: 2.5 },
      synth: {
        filterMode: "highpass",
        cutoffHz: 4200,
        highpassHz: 620,
        resonanceQ: 3.2,
        lfoRateHz: 6.2,
        lfoDepth: 0.22,
        modSource: "jump",
        modAmount: 0.78,
        oscLayers: 1,
        delayMix: 0.22,
        delayTimeMs: 160,
        delayFeedback: 0.3,
        reverbMix: 0.18,
        reverbDecaySec: 1.4,
        masterGain: 0.6,
        voiceEnabled: [true, true, false],
        voiceWaves: ["square", "saw", "triangle"],
      },
      runners: [
        { name: "AQUILES", enabled: true, color: "#ffffff", trailColor: "#ffffff", ratio: 0.62, startS: 0, speedMul: 1, direction: 1, voiceIndex: 0 },
        { name: "SPIRAL B", enabled: true, color: "#ff6f6f", trailColor: "#ff6f6f", ratio: 0.5, startS: 0.12, speedMul: 1, direction: 1, voiceIndex: 1 },
        { name: "SPIRAL C", enabled: false, color: "#8aa7ff", trailColor: "#8aa7ff", ratio: 0.38, startS: 0.2, speedMul: 1, direction: 1, voiceIndex: 2 },
      ],
    },
  };
  return presets[id] || presets.zenon_dry;
}

function bindUI() {
  els.startBtn.addEventListener("click", async () => {
    await audio.ensureStarted();
    sim.setRunning(true);
  });

  els.pauseBtn.addEventListener("click", () => {
    sim.setRunning(false);
  });

  els.resetBtn.addEventListener("click", () => {
    sim.setRunning(false);
    sim.resetAll(performance.now());
  });

  els.addRunnerBtn.addEventListener("click", () => {
    sim.addRunner();
    renderRunnerList();
  });

  els.removeRunnerBtn.addEventListener("click", () => {
    sim.removeRunner();
    renderRunnerList();
  });

  els.speed.addEventListener("input", () => {
    sim.setSpeed(els.speed.value);
  });

  els.pathType.addEventListener("change", () => {
    sim.setPathType(els.pathType.value);
  });

  els.qualityMode.addEventListener("change", () => {
    sim.setQuality(els.qualityMode.value);
    renderer.setQuality(els.qualityMode.value);
    audio.setQuality(els.qualityMode.value);
  });

  els.realLengthKm.addEventListener("input", () => {
    sim.setRealLengthKm(els.realLengthKm.value);
  });

  [
    els.filterMode,
    els.cutoff,
    els.highpass,
    els.resonance,
    els.lfoRate,
    els.lfoDepth,
    els.modSource,
    els.modAmount,
    els.oscLayers,
    els.delayMix,
    els.delayTime,
    els.delayFeedback,
    els.reverbMix,
    els.reverbDecay,
    els.masterGain,
  ].forEach((el) => el.addEventListener("input", applyAudioParamsFromUI));

  els.waveA.addEventListener("change", () => {
    audio.setVoiceWave(0, els.waveA.value);
  });
  els.waveB.addEventListener("change", () => {
    audio.setVoiceWave(1, els.waveB.value);
  });
  els.waveC.addEventListener("change", () => {
    audio.setVoiceWave(2, els.waveC.value);
  });

  els.voiceA.addEventListener("change", () => {
    audio.setVoiceEnabled(0, els.voiceA.checked);
  });
  els.voiceB.addEventListener("change", () => {
    audio.setVoiceEnabled(1, els.voiceB.checked);
  });
  els.voiceC.addEventListener("change", () => {
    audio.setVoiceEnabled(2, els.voiceC.checked);
  });

  const onRunnerControl = (event) => {
    const target = event.target;
    const card = target.closest("[data-runner-id]");
    if (!card) return;
    const runnerId = card.getAttribute("data-runner-id");
    const field = target.getAttribute("data-field");
    if (!field) return;

    if (field === "enabled") {
      sim.updateRunner(runnerId, { enabled: target.checked });
      return;
    }
    if (field === "voiceIndex") {
      sim.updateRunner(runnerId, { voiceIndex: Number(target.value) });
      return;
    }
    if (field === "ratio") {
      sim.updateRunner(runnerId, { ratio: Number(target.value) });
      return;
    }
    if (field === "startS") {
      sim.updateRunner(runnerId, { startS: Number(target.value) });
      return;
    }
    if (field === "speedMul") {
      sim.updateRunner(runnerId, { speedMul: Number(target.value) });
      return;
    }
    if (field === "direction") {
      sim.updateRunner(runnerId, { direction: Number(target.value) });
      return;
    }
    if (field === "color") {
      sim.updateRunner(runnerId, { color: String(target.value) });
      renderRunnerList();
      return;
    }
    if (field === "trailColor") {
      sim.updateRunner(runnerId, { trailColor: String(target.value) });
    }
  };
  els.runnerList.addEventListener("input", onRunnerControl);
  els.runnerList.addEventListener("change", onRunnerControl);

  els.applyFactoryBtn.addEventListener("click", () => {
    applyPreset(factoryPresetById(els.factoryPreset.value));
  });

  els.savePresetBtn.addEventListener("click", () => {
    const preset = collectPreset();
    const blob = new Blob([JSON.stringify(preset, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `zenonsynth-preset-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  });

  els.loadPresetInput.addEventListener("change", async () => {
    const file = els.loadPresetInput.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const preset = JSON.parse(text);
      applyPreset(preset);
    } catch (err) {
      console.error("No se pudo cargar preset", err);
    } finally {
      els.loadPresetInput.value = "";
    }
  });

  window.addEventListener("resize", () => {
    syncCanvasSize();
  });

  document.querySelectorAll(".accordion").forEach((panel) => {
    panel.addEventListener("toggle", () => {
      requestAnimationFrame(() => {
        syncCanvasSize();
      });
    });
  });
}

function animate(now) {
  const events = sim.step(now);
  audio.consumeEvents(events);
  renderer.draw();
  updateReadout();
  requestAnimationFrame(animate);
}

syncCanvasSize();
bindUI();
renderRunnerList();
applyAudioParamsFromUI();
applyPreset(factoryPresetById("zenon_dry"));
requestAnimationFrame(animate);
