import { PATHS, QUALITY, clamp } from './constants.js';

export function collectPreset(sim, audio, els) {
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
      ...audio.params,
      voiceEnabled: [els.voiceA.checked, els.voiceB.checked, els.voiceC.checked],
      voiceWaves: [els.waveA.value, els.waveB.value, els.waveC.value],
    },
    runners: sim.serializeRunners(),
  };
}

export function applyPreset(preset, sim, audio, renderer, els, renderRunnerList, updateReadout) {
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
  // ADSR
  setIf(els.attack, synth.attack);
  setIf(els.decay, synth.decay);
  setIf(els.sustain, synth.sustain);
  setIf(els.release, synth.release);

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

  // Read all params from UI elements and apply
  const uiParams = readAudioParamsFromEls(els);
  audio.applyParams(uiParams);

  renderRunnerList();
  updateReadout();
}

export function readAudioParamsFromEls(els) {
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
    // ADSR
    attack: Number(els.attack?.value ?? 0.003),
    decay: Number(els.decay?.value ?? 0.07),
    sustain: Number(els.sustain?.value ?? 0.18),
    release: Number(els.release?.value ?? 0.09),
  };
}

export function validatePreset(preset) {
  const errors = [];
  if (!preset || typeof preset !== 'object') {
    errors.push('Preset must be a non-null object');
    return { valid: false, errors };
  }
  if (!preset.scene && !preset.synth && !preset.runners) {
    errors.push('Preset must contain at least one of: scene, synth, runners');
  }
  if (preset.scene) {
    if (preset.scene.pathType && !PATHS[preset.scene.pathType]) {
      errors.push(`Invalid pathType: ${preset.scene.pathType}`);
    }
    if (preset.scene.qualityMode && !QUALITY[preset.scene.qualityMode]) {
      errors.push(`Invalid qualityMode: ${preset.scene.qualityMode}`);
    }
  }
  if (preset.runners && !Array.isArray(preset.runners)) {
    errors.push('runners must be an array');
  }
  if (preset.runners && preset.runners.length > 12) {
    errors.push('Maximum 12 runners allowed');
  }
  return { valid: errors.length === 0, errors };
}

export function factoryPresetById(id) {
  const presets = {
    zenon_dry: {
      scene: { pathType: "line", speed: 1.15, qualityMode: "normal", realLengthKm: 5 },
      synth: {
        filterMode: "hp_lp", cutoffHz: 1800, highpassHz: 110, resonanceQ: 1.2,
        lfoRateHz: 2.1, lfoDepth: 0.28, modSource: "remaining", modAmount: 0.64,
        oscLayers: 2, delayMix: 0.08, delayTimeMs: 180, delayFeedback: 0.16,
        reverbMix: 0.04, reverbDecaySec: 1.2, masterGain: 0.56,
        attack: 0.003, decay: 0.07, sustain: 0.18, release: 0.09,
        voiceEnabled: [true, true, true], voiceWaves: ["square", "saw", "triangle"],
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
        filterMode: "bandpass", cutoffHz: 950, highpassHz: 70, resonanceQ: 8.8,
        lfoRateHz: 0.33, lfoDepth: 0.62, modSource: "iteration", modAmount: 0.72,
        oscLayers: 4, delayMix: 0.36, delayTimeMs: 460, delayFeedback: 0.55,
        reverbMix: 0.44, reverbDecaySec: 4.2, masterGain: 0.52,
        attack: 0.008, decay: 0.12, sustain: 0.45, release: 0.22,
        voiceEnabled: [true, true, true], voiceWaves: ["sine", "triangle", "sine"],
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
        filterMode: "highpass", cutoffHz: 4200, highpassHz: 620, resonanceQ: 3.2,
        lfoRateHz: 6.2, lfoDepth: 0.22, modSource: "jump", modAmount: 0.78,
        oscLayers: 1, delayMix: 0.22, delayTimeMs: 160, delayFeedback: 0.3,
        reverbMix: 0.18, reverbDecaySec: 1.4, masterGain: 0.6,
        attack: 0.001, decay: 0.04, sustain: 0.1, release: 0.05,
        voiceEnabled: [true, true, false], voiceWaves: ["square", "saw", "triangle"],
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
