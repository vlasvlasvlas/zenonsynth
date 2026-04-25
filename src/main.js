// ─── ZenonSynth — Main Entry Point ─────────────────────────────
import { SimCore } from './sim-core.js';
import { ModularAudioEngine } from './audio-engine.js';
import { Renderer } from './renderer.js';
import { getElements, renderRunnerList, updateReadout, bindUI } from './ui-controller.js';
import { collectPreset, applyPreset, readAudioParamsFromEls, factoryPresetById } from './preset-store.js';
import { StateManager, encodeStateToURL, decodeStateFromURL, autoSave, autoRestore } from './state-manager.js';
import { SessionRecorder } from './session-recorder.js';

// ─── Initialize DOM references ─────────────────────────────────
const els = getElements();
const canvas = document.getElementById("simCanvas");
const ctx = canvas.getContext("2d");

// ─── Create core instances ─────────────────────────────────────
const sim = new SimCore();
const audio = new ModularAudioEngine();
const renderer = new Renderer(sim, canvas, ctx);
const stateManager = new StateManager(50);
const recorder = new SessionRecorder();

// ─── Sync initial state from UI to modules ─────────────────────
sim.speed = Number(els.speed.value);
sim.pathType = els.pathType.value;
sim.qualityMode = els.qualityMode.value;
sim.realLengthKm = Number(els.realLengthKm?.value ?? 1);
audio.setQuality(sim.qualityMode);
renderer.setQuality(sim.qualityMode);

// ─── Helper closures for dependency injection ──────────────────
const renderList = () => renderRunnerList(sim, els, audio);
const readout = () => updateReadout(sim, audio, els);
const applyPresetFn = (preset) => {
  applyPreset(preset, sim, audio, renderer, els, renderList, readout);
  stateManager.pushState(collectPresetFn);
};
const collectPresetFn = () => collectPreset(sim, audio, els);
const factoryPresetByIdFn = factoryPresetById;

// ─── Bind UI events ───────────────────────────────────────────
const { syncCanvasSize } = bindUI(sim, audio, renderer, els, {
  renderList,
  readout,
  applyPresetFn,
  collectPresetFn,
  factoryPresetByIdFn,
});

// ─── Undo/Redo keyboard integration ──────────────────────────
document.addEventListener("keydown", (e) => {
  if (e.target.tagName === "INPUT" || e.target.tagName === "SELECT" || e.target.tagName === "TEXTAREA") return;

  if ((e.ctrlKey || e.metaKey) && e.code === "KeyZ" && !e.shiftKey) {
    e.preventDefault();
    stateManager.undo(applyPresetFn);
  }
  if ((e.ctrlKey || e.metaKey) && e.code === "KeyZ" && e.shiftKey) {
    e.preventDefault();
    stateManager.redo(applyPresetFn);
  }
  if ((e.ctrlKey || e.metaKey) && e.code === "KeyS") {
    e.preventDefault();
    const preset = collectPresetFn();
    const blob = new Blob([JSON.stringify(preset, null, 2)], { type: "application/json" });
    SessionRecorder.download(blob, `zenonsynth-preset-${Date.now()}.json`);
  }
});

// ─── URL State ────────────────────────────────────────────────
const shareBtn = document.getElementById("shareBtn");
if (shareBtn) {
  shareBtn.addEventListener("click", () => {
    const preset = collectPresetFn();
    const url = encodeStateToURL(preset);
    navigator.clipboard?.writeText(url).then(() => {
      shareBtn.textContent = "COPIED!";
      setTimeout(() => { shareBtn.textContent = "SHARE URL"; }, 2000);
    }).catch(() => {
      prompt("Copiar URL:", url);
    });
  });
}

// ─── Recording controls ───────────────────────────────────────
const recAudioBtn = document.getElementById("recAudioBtn");
const recVideoBtn = document.getElementById("recVideoBtn");
const exportDataBtn = document.getElementById("exportDataBtn");

if (recAudioBtn) {
  recAudioBtn.addEventListener("click", async () => {
    if (!recorder.isRecordingAudio) {
      await audio.ensureStarted();
      // Connect master to recording destination
      recorder.startAudioRecording(audio.ctx);
      if (recorder.audioDestNode) {
        audio.master.connect(recorder.audioDestNode);
      }
      recAudioBtn.textContent = "⏹ STOP AUDIO";
      recAudioBtn.classList.add("recording");
    } else {
      const blob = await recorder.stopAudioRecording();
      recAudioBtn.textContent = "REC AUDIO";
      recAudioBtn.classList.remove("recording");
      if (blob) SessionRecorder.download(blob, `zenonsynth-audio-${Date.now()}.webm`);
    }
  });
}

if (recVideoBtn) {
  recVideoBtn.addEventListener("click", async () => {
    if (!recorder.isRecordingVideo) {
      recorder.startVideoRecording(canvas, 30);
      recVideoBtn.textContent = "⏹ STOP VIDEO";
      recVideoBtn.classList.add("recording");
    } else {
      const blob = await recorder.stopVideoRecording();
      recVideoBtn.textContent = "REC VIDEO";
      recVideoBtn.classList.remove("recording");
      if (blob) SessionRecorder.download(blob, `zenonsynth-video-${Date.now()}.webm`);
    }
  });
}

if (exportDataBtn) {
  exportDataBtn.addEventListener("click", () => {
    const blob = SessionRecorder.exportRunnerData(sim, 'csv');
    SessionRecorder.download(blob, `zenonsynth-data-${Date.now()}.csv`);
  });
}

// ─── Auto-save (debounced) ─────────────────────────────────────
let autosaveTimer = null;
function scheduleAutosave() {
  if (autosaveTimer) clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(() => autoSave(collectPresetFn), 5000);
}

// ─── Animation loop ────────────────────────────────────────────
function animate(now) {
  const events = sim.step(now);
  audio.consumeEvents(events);

  // Feed audio data to renderer for reactivity
  renderer.audioRMS = audio.getRMS();
  renderer.audioFFT = audio.getFrequencyData();

  renderer.draw();
  readout();

  // Schedule autosave when running
  if (sim.running) scheduleAutosave();

  requestAnimationFrame(animate);
}

// ─── Bootstrap ─────────────────────────────────────────────────
syncCanvasSize();
renderList();

// Apply initial audio params
const initialParams = readAudioParamsFromEls(els);
audio.applyParams(initialParams);

// Priority: URL state > localStorage > factory preset
const urlState = decodeStateFromURL();
if (urlState) {
  applyPresetFn(urlState);
} else {
  const saved = autoRestore();
  if (saved) {
    applyPresetFn(saved);
  } else {
    applyPresetFn(factoryPresetById("zenon_dry"));
  }
}

// Push initial state for undo
stateManager.pushState(collectPresetFn);

requestAnimationFrame(animate);

console.log("🔊 ZenonSynth v2.0 :: Modular Engine Loaded");
console.log("⌨️ Shortcuts: Space=Play/Pause, R=Reset, +/-=Runners, F=Fullscreen, M=Mute, [/]=Path, 1-3=Presets");
console.log("⌨️ Ctrl+Z=Undo, Ctrl+Shift+Z=Redo, Ctrl+S=Save Preset");
