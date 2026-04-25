import { clamp, lerp, hexToRgb, asymptoticPercent, fmt, fmtKm, formatSubintervalCount } from './constants.js';

export class Renderer {
  constructor(sim, canvas, ctx) {
    this.sim = sim;
    this.canvas = canvas;
    this.ctx = ctx;
    this.qualityMode = 'normal';
    this.cameraAnchor = { x: 0.5, y: 0.5 };

    // Audio reactivity data (populated externally)
    this.audioRMS = 0;
    this.audioFFT = null;
  }

  setQuality(mode) {
    if (!({ eco: 1, normal: 1, high: 1 }[mode])) return;
    this.qualityMode = mode;
  }

  getQualityConfig() {
    const QUALITY = {
      eco:    { gridLevels: 10, trailPoints: 56,  minSpan: 0.003,    pathSamples: 80,  overviewSamples: 60  },
      normal: { gridLevels: 16, trailPoints: 120, minSpan: 0.00045,  pathSamples: 130, overviewSamples: 90  },
      high:   { gridLevels: 24, trailPoints: 220, minSpan: 0.00005,  pathSamples: 190, overviewSamples: 130 },
    };
    return QUALITY[this.qualityMode] || QUALITY.normal;
  }

  draw() {
    const canvas = this.canvas;
    const ctx = this.ctx;
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
    const canvas = this.canvas;
    const ctx = this.ctx;
    const base = 0.25;
    // Audio reactivity: subtle grid vibration
    const audioJitter = this.audioRMS * 0.5;

    ctx.save();
    for (let level = 0; level < levels; level += 1) {
      const step = base / Math.pow(2, level);
      const px = (step / viewW) * canvas.width;
      if (px < 8 || px > 220) continue;

      const focus = Math.max(0, 1 - Math.abs(px - 72) / 80);
      let alpha = 0.035 + focus * (level % 2 ? 0.13 : 0.19);
      // Modulate alpha by audio RMS
      alpha += audioJitter * 0.08;
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
        const dotRadius = clamp(px / 95, 0.6, 1.7) + audioJitter * 0.4;
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
    const ctx = this.ctx;
    const alpha = 0.22 + this.audioRMS * 0.15;
    ctx.save();
    ctx.strokeStyle = `rgba(255, 179, 71, ${alpha.toFixed(4)})`;
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
    const ctx = this.ctx;
    this.sim.runners.forEach((runner) => {
      if (!runner.enabled) return;
      const trail = runner.history.slice(-maxPoints);
      if (trail.length < 2) return;
      const trailRgb = hexToRgb(runner.trailColor || runner.color);

      for (let i = 1; i < trail.length; i += 1) {
        const t = i / (trail.length - 1);
        const alphaBase = 0.08 + t * 0.52;
        // Boost trail opacity with audio
        const alpha = Math.min(1, alphaBase + this.audioRMS * 0.2);
        ctx.strokeStyle = `rgba(${trailRgb.join(",")}, ${alpha.toFixed(4)})`;
        ctx.lineWidth = 1 + this.audioRMS * 1.5;
        ctx.beginPath();
        ctx.moveTo(toX(trail[i - 1].x), toY(trail[i - 1].y));
        ctx.lineTo(toX(trail[i].x), toY(trail[i].y));
        ctx.stroke();
      }
    });
  }

  drawGoal(goal, toX, toY) {
    const ctx = this.ctx;
    const x = toX(goal.x);
    const y = toY(goal.y);
    // Audio-reactive goal pulsation
    const pulseSize = 18 + this.audioRMS * 12;
    ctx.save();
    ctx.strokeStyle = "rgba(255, 127, 80, 0.95)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x - pulseSize, y);
    ctx.lineTo(x + pulseSize, y);
    ctx.moveTo(x, y - pulseSize);
    ctx.lineTo(x, y + pulseSize);
    ctx.stroke();
    ctx.restore();
  }

  drawRunners(toX, toY) {
    const canvas = this.canvas;
    const ctx = this.ctx;
    ctx.save();
    ctx.font = '13px "Courier New", monospace';

    this.sim.runners.forEach((runner) => {
      if (!runner.enabled) return;
      const p = this.sim.mapS(runner.s);
      const x = toX(p.x);
      const y = toY(p.y);
      const [r, g, b] = hexToRgb(runner.color);

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

      // Audio-reactive glow
      const audioGlowBoost = this.audioRMS * 40;
      const coneLen = 54 + (1 - clamp(runner.remainingNorm, 0, 1)) * 92 + audioGlowBoost;
      const glowAlpha = 0.26 + this.audioRMS * 0.2;
      const glow = ctx.createRadialGradient(x, y, 1, x, y, coneLen * 0.86);
      glow.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${glowAlpha.toFixed(3)})`);
      glow.addColorStop(0.45, `rgba(${r}, ${g}, ${b}, ${(glowAlpha * 0.46).toFixed(3)})`);
      glow.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0.0)`);
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(x, y, coneLen * 0.86, 0, Math.PI * 2);
      ctx.fill();

      // Beam
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

      // ─── Convergence FX (Phase 3 addition) ──────────
      if (runner.remainingNorm < 0.01) {
        const intensity = clamp(-Math.log10(Math.max(runner.remainingNorm, 1e-16)) / 16, 0, 1);
        const pulseRadius = 30 + intensity * 120 + Math.sin(performance.now() * 0.008) * 15;
        const convergenceGlow = ctx.createRadialGradient(x, y, 2, x, y, pulseRadius);
        convergenceGlow.addColorStop(0, `rgba(255, 255, 255, ${(0.4 * intensity).toFixed(3)})`);
        convergenceGlow.addColorStop(0.3, `rgba(${r}, ${g}, ${b}, ${(0.3 * intensity).toFixed(3)})`);
        convergenceGlow.addColorStop(0.6, `rgba(255, 127, 80, ${(0.15 * intensity).toFixed(3)})`);
        convergenceGlow.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0.0)`);
        ctx.fillStyle = convergenceGlow;
        ctx.beginPath();
        ctx.arc(x, y, pulseRadius, 0, Math.PI * 2);
        ctx.fill();

        // Radial particles effect
        const particleCount = Math.floor(intensity * 12);
        const time = performance.now() * 0.003;
        for (let pi = 0; pi < particleCount; pi++) {
          const angle = (pi / particleCount) * Math.PI * 2 + time;
          const dist = 8 + Math.sin(time * 2 + pi) * pulseRadius * 0.6;
          const px = x + Math.cos(angle) * dist;
          const py = y + Math.sin(angle) * dist;
          const pAlpha = intensity * (0.3 + 0.4 * Math.sin(time * 3 + pi * 1.7));
          ctx.fillStyle = `rgba(255, 255, 255, ${clamp(pAlpha, 0, 1).toFixed(3)})`;
          ctx.beginPath();
          ctx.arc(px, py, 1.5 + intensity * 1.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Runner dot
      const dotRadius = 6 + this.audioRMS * 3;
      ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.95)`;
      ctx.beginPath();
      ctx.arc(x, y, dotRadius, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "rgba(255, 179, 71, 0.85)";
      ctx.fillText(`${runner.name} n=${runner.iteration}`, x + 10, y - 10);
    });

    ctx.restore();
  }

  drawOverview(path, viewLeft, viewTop, viewW, viewH, samples) {
    const canvas = this.canvas;
    const ctx = this.ctx;
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
      const [r, g, b] = hexToRgb(runner.color);
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
    const canvas = this.canvas;
    const ctx = this.ctx;
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
    const ctx = this.ctx;
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
}
