import { PATHS, QUALITY, clamp, fmt, fmtKm, asymptoticPercent } from './constants.js';
import { readAudioParamsFromEls } from './preset-store.js';

// ─── DOM element cache ─────────────────────────────────────────
export function getElements() {
  return {
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
    fullscreenBtn: document.getElementById("fullscreenBtn"),
    // ADSR elements
    attack: document.getElementById("attack"),
    decay: document.getElementById("decay"),
    sustain: document.getElementById("sustain"),
    release: document.getElementById("release"),
    // Scale elements
    scaleEnabled: document.getElementById("scaleEnabled"),
    scaleSelect: document.getElementById("scaleSelect"),
    baseNote: document.getElementById("baseNote"),
  };
}

// ─── Runner list rendering ─────────────────────────────────────
export function renderRunnerList(sim, els, audio) {
  els.runnerList.innerHTML = sim.runners
    .map((runner) => {
      const vspec = audio ? audio.getRunnerVoiceSpec(runner.id, runner.voiceIndex) : {};
      const currentWave = vspec.wave || 'square';
      const currentGain = vspec.gain ?? 0.6;
      const dirLabel = runner.direction > 0 ? 'FWD' : 'REV';
      return `
        <article class="runner-card" data-runner-id="${runner.id}">
          <div class="runner-top">
            <span class="runner-dot" style="background:${runner.color}"></span>
            <span class="runner-name">${runner.name}</span>
            <span class="runner-dir">${dirLabel}</span>
            <label class="runner-toggle"><input type="checkbox" data-field="enabled" ${runner.enabled ? "checked" : ""} /></label>
            <button class="runner-delete" data-delete-runner="${runner.id}" title="Eliminar">✕</button>
          </div>
          <div class="runner-controls">
            <label class="ctrl">WAVE <select data-field="synth-wave">
              <option value="square" ${currentWave === 'square' ? 'selected' : ''}>SQR</option>
              <option value="saw" ${currentWave === 'saw' ? 'selected' : ''}>SAW</option>
              <option value="triangle" ${currentWave === 'triangle' ? 'selected' : ''}>TRI</option>
              <option value="sine" ${currentWave === 'sine' ? 'selected' : ''}>SIN</option>
            </select></label>
            <label class="ctrl">GAIN <input type="range" min="0" max="1" step="0.01" data-field="synth-gain" value="${currentGain}" /></label>
            <label class="ctrl">DIR <select data-field="direction">
              <option value="1" ${runner.direction > 0 ? "selected" : ""}>FWD</option>
              <option value="-1" ${runner.direction < 0 ? "selected" : ""}>REV</option>
            </select></label>
            <label class="ctrl">RATIO <input type="range" min="0.05" max="0.95" step="0.01" data-field="ratio" value="${runner.ratio}" /></label>
            <label class="ctrl">SPEED <input type="range" min="0" max="2" step="0.01" data-field="speedMul" value="${runner.speedMul}" /></label>
            <label class="ctrl">START <input type="range" min="0" max="0.92" step="0.01" data-field="startS" value="${runner.startS}" /></label>
          </div>
          <span class="runner-status" data-status-for="${runner.id}"></span>
        </article>
      `;
    })
    .join("");

  updateRunnerStatusTexts(sim, els);
}

// ─── Status updates ────────────────────────────────────────────
export function updateRunnerStatusTexts(sim, els) {
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

export function updateReadout(sim, audio, els) {
  updateRunnerStatusTexts(sim, els);

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

// ─── Bind all UI events ────────────────────────────────────────
export function bindUI(sim, audio, renderer, els, { renderList, readout, applyPresetFn, collectPresetFn, factoryPresetByIdFn }) {
  const canvas = renderer.canvas;

  // About Modal
  const aboutBtn = document.getElementById("aboutBtn");
  const aboutModal = document.getElementById("aboutModal");
  const closeAboutBtn = document.getElementById("closeAboutBtn");
  if (aboutBtn && aboutModal) {
    aboutBtn.addEventListener("click", () => aboutModal.classList.remove("hidden"));
    closeAboutBtn.addEventListener("click", () => aboutModal.classList.add("hidden"));
    aboutModal.addEventListener("click", (e) => {
      if (e.target === aboutModal) aboutModal.classList.add("hidden");
    });
  }

  // Tab switching
  document.querySelectorAll('.tab-bar .tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach((c) => c.classList.remove('active'));
      tab.classList.add('active');
      const target = document.getElementById(`tab-${tab.dataset.tab}`);
      if (target) target.classList.add('active');
    });
  });

  const applyAudioFromUI = () => {
    const params = readAudioParamsFromEls(els);
    audio.applyParams(params);
  };

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
    renderList();
  });

  els.removeRunnerBtn.addEventListener("click", () => {
    sim.removeRunner();
    renderList();
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

  // Synth params
  [
    els.filterMode, els.cutoff, els.highpass, els.resonance,
    els.lfoRate, els.lfoDepth, els.modSource, els.modAmount,
    els.oscLayers, els.delayMix, els.delayTime, els.delayFeedback,
    els.reverbMix, els.reverbDecay, els.masterGain,
    els.attack, els.decay, els.sustain, els.release,
  ].filter(Boolean).forEach((el) => el.addEventListener("input", applyAudioFromUI));

  // Voice waves
  els.waveA.addEventListener("change", () => audio.setVoiceWave(0, els.waveA.value));
  els.waveB.addEventListener("change", () => audio.setVoiceWave(1, els.waveB.value));
  els.waveC.addEventListener("change", () => audio.setVoiceWave(2, els.waveC.value));

  // Voice enable
  els.voiceA.addEventListener("change", () => audio.setVoiceEnabled(0, els.voiceA.checked));
  els.voiceB.addEventListener("change", () => audio.setVoiceEnabled(1, els.voiceB.checked));
  els.voiceC.addEventListener("change", () => audio.setVoiceEnabled(2, els.voiceC.checked));

  // Scale controls
  if (els.scaleEnabled) {
    els.scaleEnabled.addEventListener("change", () => {
      audio.applyParams({ scaleEnabled: els.scaleEnabled.checked });
    });
  }
  if (els.scaleSelect) {
    els.scaleSelect.addEventListener("change", () => {
      audio.applyParams({ scale: els.scaleSelect.value });
    });
  }
  if (els.baseNote) {
    els.baseNote.addEventListener("input", () => {
      audio.applyParams({ baseNote: Number(els.baseNote.value) });
    });
  }

  // Mod matrix controls (delegated)
  document.querySelector('.mod-matrix')?.addEventListener('input', (e) => {
    const slot = e.target.closest('[data-mod-index]');
    if (!slot) return;
    const index = Number(slot.getAttribute('data-mod-index'));
    const field = e.target.getAttribute('data-mod-field');
    if (!field) return;
    if (field === 'amount') {
      const amount = Number(e.target.value);
      audio.setModSlot(index, { amount, enabled: amount !== 0 });
    }
  });
  document.querySelector('.mod-matrix')?.addEventListener('change', (e) => {
    const slot = e.target.closest('[data-mod-index]');
    if (!slot) return;
    const index = Number(slot.getAttribute('data-mod-index'));
    const field = e.target.getAttribute('data-mod-field');
    if (!field || field === 'amount') return;
    audio.setModSlot(index, { [field]: e.target.value });
  });

  // Runner controls (delegated)
  const onRunnerControl = (event) => {
    const target = event.target;
    const card = target.closest("[data-runner-id]");
    if (!card) return;
    const runnerId = card.getAttribute("data-runner-id");
    const field = target.getAttribute("data-field");
    if (!field) return;

    // Per-runner synth fields → audio engine voice spec
    if (field === "synth-wave") {
      audio.setRunnerVoiceSpec(runnerId, { wave: target.value });
      return;
    }
    if (field === "synth-gain") {
      audio.setRunnerVoiceSpec(runnerId, { gain: Number(target.value) });
      return;
    }

    // Sim runner fields
    if (field === "enabled") {
      sim.updateRunner(runnerId, { enabled: target.checked });
    } else if (field === "color") {
      sim.updateRunner(runnerId, { color: String(target.value) });
      renderList();
    } else if (field === "trailColor") {
      sim.updateRunner(runnerId, { trailColor: String(target.value) });
    } else {
      sim.updateRunner(runnerId, { [field]: Number(target.value) });
    }
  };
  els.runnerList.addEventListener("input", onRunnerControl);
  els.runnerList.addEventListener("change", onRunnerControl);

  // Per-runner delete button
  els.runnerList.addEventListener("click", (e) => {
    const deleteBtn = e.target.closest("[data-delete-runner]");
    if (!deleteBtn) return;
    const runnerId = deleteBtn.getAttribute("data-delete-runner");
    const removed = sim.removeRunnerById(runnerId);
    if (removed) {
      audio.removeRunnerVoiceSpec(runnerId);
      renderList();
    }
  });

  // Factory presets
  els.applyFactoryBtn.addEventListener("click", () => {
    applyPresetFn(factoryPresetByIdFn(els.factoryPreset.value));
  });

  // Save preset
  els.savePresetBtn.addEventListener("click", () => {
    const preset = collectPresetFn();
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

  // Load preset
  els.loadPresetInput.addEventListener("change", async () => {
    const file = els.loadPresetInput.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const preset = JSON.parse(text);
      applyPresetFn(preset);
    } catch (err) {
      console.error("No se pudo cargar preset", err);
    } finally {
      els.loadPresetInput.value = "";
    }
  });

  // Fullscreen
  if (els.fullscreenBtn) {
    els.fullscreenBtn.addEventListener("click", () => {
      if (!document.fullscreenElement) {
        canvas.requestFullscreen?.() || canvas.webkitRequestFullscreen?.();
      } else {
        document.exitFullscreen?.();
      }
    });
  }

  // ─── Keyboard shortcuts ──────────────────────────────────────
  document.addEventListener("keydown", (e) => {
    // Don't capture when typing in inputs
    if (e.target.tagName === "INPUT" || e.target.tagName === "SELECT" || e.target.tagName === "TEXTAREA") return;

    switch (e.code) {
      case "Space":
        e.preventDefault();
        if (sim.running) {
          sim.setRunning(false);
        } else {
          audio.ensureStarted().then(() => sim.setRunning(true));
        }
        break;
      case "KeyR":
        sim.setRunning(false);
        sim.resetAll(performance.now());
        break;
      case "Equal": // +
      case "NumpadAdd":
        sim.addRunner();
        renderList();
        break;
      case "Minus":
      case "NumpadSubtract":
        sim.removeRunner();
        renderList();
        break;
      case "KeyF":
        if (!document.fullscreenElement) {
          canvas.requestFullscreen?.() || canvas.webkitRequestFullscreen?.();
        } else {
          document.exitFullscreen?.();
        }
        break;
      case "KeyM":
        if (audio.master) {
          const current = audio.master.gain.value;
          audio.master.gain.setTargetAtTime(current < 0.01 ? audio.params.masterGain : 0, audio.ctx.currentTime, 0.02);
        }
        break;
      case "BracketLeft":
        { const types = Object.keys(PATHS);
          const idx = types.indexOf(sim.pathType);
          const next = types[(idx - 1 + types.length) % types.length];
          els.pathType.value = next;
          sim.setPathType(next);
        }
        break;
      case "BracketRight":
        { const types = Object.keys(PATHS);
          const idx = types.indexOf(sim.pathType);
          const next = types[(idx + 1) % types.length];
          els.pathType.value = next;
          sim.setPathType(next);
        }
        break;
      case "Digit1": case "Digit2": case "Digit3":
        { const presetNames = ["zenon_dry", "infinite_drone", "pursuit_percussive"];
          const pi = Number(e.code.slice(5)) - 1;
          if (presetNames[pi]) applyPresetFn(factoryPresetByIdFn(presetNames[pi]));
        }
        break;
    }
  });

  // Resize handling
  const syncCanvasSize = () => {
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.max(320, Math.floor(rect.width));
    canvas.height = Math.max(260, Math.floor(rect.width * 0.58));
  };

  window.addEventListener("resize", syncCanvasSize);
  document.querySelectorAll(".accordion").forEach((panel) => {
    panel.addEventListener("toggle", () => requestAnimationFrame(syncCanvasSize));
  });

  syncCanvasSize();
  return { syncCanvasSize };
}
