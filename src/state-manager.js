import { clamp } from './constants.js';

// ─── Undo/Redo State Manager ───────────────────────────────────
export class StateManager {
  constructor(maxHistory = 50) {
    this.history = [];
    this.redoStack = [];
    this.maxHistory = maxHistory;
    this.lastSave = 0;
    this.debounceMs = 500;
  }

  // Push a state snapshot (debounced to avoid flooding on slider drag)
  pushState(collectFn) {
    const now = performance.now();
    if (now - this.lastSave < this.debounceMs) return;
    this.lastSave = now;

    const state = collectFn();
    this.history.push(JSON.stringify(state));
    if (this.history.length > this.maxHistory) this.history.shift();
    this.redoStack = []; // Clear redo on new action
  }

  canUndo() { return this.history.length > 1; }
  canRedo() { return this.redoStack.length > 0; }

  undo(applyFn) {
    if (!this.canUndo()) return;
    const current = this.history.pop();
    this.redoStack.push(current);
    const prev = this.history[this.history.length - 1];
    if (prev) applyFn(JSON.parse(prev));
  }

  redo(applyFn) {
    if (!this.canRedo()) return;
    const next = this.redoStack.pop();
    this.history.push(next);
    applyFn(JSON.parse(next));
  }
}

// ─── URL State Sharing ─────────────────────────────────────────
export function encodeStateToURL(preset) {
  try {
    const json = JSON.stringify(preset);
    const encoded = btoa(unescape(encodeURIComponent(json)));
    const url = new URL(window.location.href);
    url.hash = `preset=${encoded}`;
    return url.toString();
  } catch (e) {
    console.error('Failed to encode state to URL', e);
    return window.location.href;
  }
}

export function decodeStateFromURL() {
  try {
    const hash = window.location.hash;
    if (!hash.startsWith('#preset=')) return null;
    const encoded = hash.slice(8);
    const json = decodeURIComponent(escape(atob(encoded)));
    return JSON.parse(json);
  } catch (e) {
    console.error('Failed to decode state from URL', e);
    return null;
  }
}

export function clearURLState() {
  history.replaceState(null, '', window.location.pathname + window.location.search);
}

// ─── Local Storage Persistence ─────────────────────────────────
const AUTOSAVE_KEY = 'zenonsynth_autosave';

export function autoSave(collectFn) {
  try {
    const preset = collectFn();
    localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(preset));
  } catch (e) {
    // Silently fail
  }
}

export function autoRestore() {
  try {
    const saved = localStorage.getItem(AUTOSAVE_KEY);
    if (saved) return JSON.parse(saved);
  } catch (e) {
    // Ignore
  }
  return null;
}
