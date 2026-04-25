// ─── Quality presets ───────────────────────────────────────────
export const QUALITY = {
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

// ─── Runner colors ─────────────────────────────────────────────
export const RUNNER_PALETTE = ["#ffffff", "#62e8ff", "#ff8ae6", "#8cff77", "#ff6f6f", "#8aa7ff"];

// ─── Path definitions ──────────────────────────────────────────
export const PATHS = {
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

// ─── Musical scales (MIDI note intervals from root) ────────────
export const SCALES = {
  chromatic:       { name: "Chromatic",       intervals: [0,1,2,3,4,5,6,7,8,9,10,11] },
  pentatonic:      { name: "Pentatonic",      intervals: [0,2,4,7,9] },
  major:           { name: "Major",           intervals: [0,2,4,5,7,9,11] },
  minor:           { name: "Minor",           intervals: [0,2,3,5,7,8,10] },
  dorian:          { name: "Dorian",          intervals: [0,2,3,5,7,9,10] },
  whole_tone:      { name: "Whole Tone",      intervals: [0,2,4,6,8,10] },
  harmonic_minor:  { name: "Harmonic Minor",  intervals: [0,2,3,5,7,8,11] },
};

// ─── Convergence modes ─────────────────────────────────────────
export const CONVERGENCE_MODES = {
  fractional:  { id: "fractional",  name: "Fractional (Zenón)" },
  fixed_step:  { id: "fixed_step",  name: "Fixed Step" },
  exponential: { id: "exponential", name: "Exponential Decay" },
  ping_pong:   { id: "ping_pong",   name: "Ping-Pong" },
};

// ─── Utility functions ─────────────────────────────────────────
export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const d2 = (a, b) => {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.hypot(dx, dy);
};

export function formatHalfExact(iteration, pow5, visibleDigits = 72) {
  if (iteration === 0) return "1.0";
  const digits = pow5.toString().padStart(iteration, "0");
  if (iteration <= visibleDigits) return `0.${digits}`;
  return `0.${digits.slice(0, visibleDigits)}...${digits.slice(-8)} [${iteration}d]`;
}

export function fmt(v, digits = 6) {
  if (!Number.isFinite(v)) return "NaN";
  if (v === 0) return "0";
  if (Math.abs(v) < 1e-5) return v.toExponential(6);
  return v.toFixed(digits).replace(/0+$/, "").replace(/\.$/, "");
}

export function fmtKm(v) {
  const n = Math.abs(Number(v));
  if (!Number.isFinite(n)) return "NaN";
  if (n >= 1000) return fmt(v, 3);
  if (n >= 10) return fmt(v, 5);
  return fmt(v, 8);
}

export function asymptoticPercent(iteration, ratio) {
  const r = clamp(Number(ratio), 0.000001, 0.999999);
  const n = Math.max(0, Number(iteration) || 0);
  const rem = Math.exp(Math.log1p(-r) * n);
  return clamp((1 - rem) * 100, 0, 99.999999999);
}

export function formatSubintervalCount(iteration) {
  if (iteration <= 52) return (2 ** iteration).toLocaleString("en-US");
  const log10 = iteration * Math.log10(2);
  const exponent = Math.floor(log10);
  const mantissa = 10 ** (log10 - exponent);
  return `~${mantissa.toFixed(3)}e${exponent}`;
}

// ─── Hex to RGB helper ─────────────────────────────────────────
export function hexToRgb(hex) {
  const value = hex.replace("#", "");
  const int = Number.parseInt(value, 16);
  if (!Number.isFinite(int)) return [255, 179, 71];
  return [(int >> 16) & 255, (int >> 8) & 255, int & 255];
}

// ─── Musical frequency quantization ───────────────────────────
export function quantizeToScale(freqHz, scaleName = "chromatic", baseNote = 48) {
  const scale = SCALES[scaleName] || SCALES.chromatic;
  const midi = 12 * Math.log2(freqHz / 440) + 69;
  const intervals = scale.intervals;
  const octaveSize = 12;

  let bestMidi = baseNote;
  let bestDist = Infinity;

  for (let octave = -2; octave <= 4; octave++) {
    for (const interval of intervals) {
      const candidate = baseNote + octave * octaveSize + interval;
      const dist = Math.abs(midi - candidate);
      if (dist < bestDist) {
        bestDist = dist;
        bestMidi = candidate;
      }
    }
  }

  return 440 * Math.pow(2, (bestMidi - 69) / 12);
}
