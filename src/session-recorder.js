// ─── Session Recorder ──────────────────────────────────────────
// Records audio, video, or combined A/V from the canvas + audio context

export class SessionRecorder {
  constructor() {
    this.audioRecorder = null;
    this.videoRecorder = null;
    this.audioChunks = [];
    this.videoChunks = [];
    this.isRecordingAudio = false;
    this.isRecordingVideo = false;
  }

  // ─── Audio Recording ────────────────────────────────────
  startAudioRecording(audioCtx) {
    if (this.isRecordingAudio) return;
    try {
      const dest = audioCtx.createMediaStreamDestination();
      // Connect master to the recording destination
      // We need to tap into the signal - the caller should connect their master node
      this.audioDestNode = dest;
      this.audioRecorder = new MediaRecorder(dest.stream, {
        mimeType: this.getSupportedMimeType('audio'),
      });
      this.audioChunks = [];
      this.audioRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) this.audioChunks.push(e.data);
      };
      this.audioRecorder.start(100);
      this.isRecordingAudio = true;
    } catch (e) {
      console.error('Audio recording not supported', e);
    }
  }

  stopAudioRecording() {
    if (!this.isRecordingAudio || !this.audioRecorder) return Promise.resolve(null);
    return new Promise((resolve) => {
      this.audioRecorder.onstop = () => {
        const blob = new Blob(this.audioChunks, { type: this.audioRecorder.mimeType });
        this.isRecordingAudio = false;
        this.audioRecorder = null;
        resolve(blob);
      };
      this.audioRecorder.stop();
    });
  }

  // ─── Video Recording ────────────────────────────────────
  startVideoRecording(canvas, fps = 30) {
    if (this.isRecordingVideo) return;
    try {
      const stream = canvas.captureStream(fps);
      this.videoRecorder = new MediaRecorder(stream, {
        mimeType: this.getSupportedMimeType('video'),
        videoBitsPerSecond: 5000000,
      });
      this.videoChunks = [];
      this.videoRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) this.videoChunks.push(e.data);
      };
      this.videoRecorder.start(100);
      this.isRecordingVideo = true;
    } catch (e) {
      console.error('Video recording not supported', e);
    }
  }

  stopVideoRecording() {
    if (!this.isRecordingVideo || !this.videoRecorder) return Promise.resolve(null);
    return new Promise((resolve) => {
      this.videoRecorder.onstop = () => {
        const blob = new Blob(this.videoChunks, { type: this.videoRecorder.mimeType });
        this.isRecordingVideo = false;
        this.videoRecorder = null;
        resolve(blob);
      };
      this.videoRecorder.stop();
    });
  }

  // ─── Data Export ────────────────────────────────────────
  static exportRunnerData(sim, format = 'csv') {
    const rows = [];
    const headers = ['runner_id', 'runner_name', 'direction', 'iteration', 'position_s', 'remaining_norm', 'remaining_km', 'last_jump_km'];

    sim.runners.forEach((runner) => {
      rows.push([
        runner.id,
        runner.name,
        runner.direction > 0 ? 'FWD' : 'REV',
        runner.iteration,
        runner.s.toFixed(12),
        runner.remainingNorm.toExponential(8),
        runner.remainingKm.toFixed(8),
        runner.lastJumpKm.toFixed(8),
      ]);
    });

    if (format === 'json') {
      const data = rows.map((row) => {
        const obj = {};
        headers.forEach((h, i) => { obj[h] = row[i]; });
        return obj;
      });
      return new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    }

    // CSV
    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    return new Blob([csv], { type: 'text/csv' });
  }

  // ─── Download helper ────────────────────────────────────
  static download(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  // ─── Mime type detection ────────────────────────────────
  getSupportedMimeType(type) {
    if (type === 'audio') {
      const types = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg'];
      return types.find((t) => MediaRecorder.isTypeSupported(t)) || '';
    }
    const types = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4'];
    return types.find((t) => MediaRecorder.isTypeSupported(t)) || '';
  }
}
