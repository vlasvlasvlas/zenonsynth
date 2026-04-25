import { QUALITY, PATHS, RUNNER_PALETTE, clamp, lerp, d2, formatHalfExact } from './constants.js';

export class SimCore {
  constructor() {
    this.running = false;
    this.speed = 1;
    this.pathType = 'line';
    this.qualityMode = 'normal';
    this.realLengthKm = 1;
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

  removeRunnerById(id) {
    if (this.runners.length <= 1) return null;
    const idx = this.runners.findIndex((r) => r.id === id);
    if (idx === -1) return null;
    return this.runners.splice(idx, 1)[0];
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
      
      // Calculate how long since last step
      let timePassed = now - runner.lastStepAt;
      
      // Dynamic interval: speed also scales the absolute minimum time between steps
      // so a runner with 0.5x speed will visibly cap at a lower max speed (33ms) than one at 2x (8ms)
      const dynamicMinInterval = this.minIntervalMs / effectiveSpeed;
      
      const interval = Math.max(
        dynamicMinInterval,
        (this.baseIntervalMs * Math.pow(this.intervalShrink, runner.iteration)) / effectiveSpeed
      );
      
      if (timePassed < interval) return;

      // Calculate how many steps we should take this frame
      let stepsToTake = 1;
      if (interval < 16.66 && timePassed > interval) {
        stepsToTake = Math.floor(timePassed / interval);
        const maxSteps = this.getQualityConfig().maxAudioEventsPerFrame || 4;
        stepsToTake = Math.min(stepsToTake, maxSteps);
      }

      runner.lastStepAt = now;

      // Execute the steps
      for (let i = 0; i < stepsToTake; i++) {
        const prevS = runner.s;
        runner.s = prevS + (runner.targetS - prevS) * runner.ratio;
        runner.s = clamp(runner.s, 0, 1);
        runner.iteration += 1;

        if (runner.exactHalf) {
          runner.pow5 *= 5n;
          runner.remainingExact = formatHalfExact(runner.iteration, runner.pow5, 72);
        }
      }

      // Calculate metrics based on the final step
      const jump = this.distanceAlongPath(runner.history[runner.history.length-1]?.s ?? 0, runner.s);
      const rem = this.distanceAlongPath(runner.s, runner.targetS);
      runner.lastJumpNorm = jump / runner.startGap;
      runner.remainingNorm = rem / runner.startGap;
      runner.lastJumpKm = this.pathDistanceToKm(jump);
      runner.remainingKm = this.pathDistanceToKm(rem);

      const point = this.mapS(runner.s);
      runner.history.push({ ...point, s: runner.s, n: runner.iteration });
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
