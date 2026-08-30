/**
 * DeeDeeLib
 * A small, dependency-free library for realtime audio manipulation.
 * Designed to drop into a p5.js sketch, but works standalone with any Web Audio setup.
 *
 * Features:
 *  - connect() to an audio input (mic / line-in)
 *  - realtime per-frame processing (AnalyserNode polled via requestAnimationFrame)
 *  - beat detection -> 'beat' event
 *  - pitch detection -> normalized 0-1 value (+ raw Hz), range customizable
 *
 * Usage:
 *   const dd = new DeeDeeLib();
 *   await dd.connect();                 // prompts for mic permission
 *   dd.onBeat(e => console.log('beat!', e.detail));
 *   dd.onPitch(e => console.log(dd.pitch, dd.pitchHz));
 *   // or just read dd.pitch / dd.pitchHz / dd.energy in your draw() loop
 *
 * Vendored from https://github.com/naus3a/DeeDeeLib as a plain classic
 * script (the upstream `export` was dropped) to match how the other libs
 * in this project are included as global classes, e.g. RecordUtils.js.
 */

class DeeDeeLib extends EventTarget {
  constructor(options = {}) {
    super();

    // --- pitch normalization range (customizable) ---
    this.pitchMinHz = options.pitchMinHz ?? 65;   // ~C2
    this.pitchMaxHz = options.pitchMaxHz ?? 1050; // ~C6

    // --- beat detection tuning ---
    this.beatThreshold = options.beatThreshold ?? 1.3; // instant energy must exceed avg * this
    this.beatDecay = options.beatDecay ?? 0.98;         // rolling average smoothing
    this.beatHoldMs = options.beatHoldMs ?? 200;        // debounce window between beats

    // --- public readable state, updated every frame ---
    this.pitchHz = 0;
    this.pitch = 0;   // normalized 0-1
    this.energy = 0;

    // --- internal ---
    this._audioContext = null;
    this._analyser = null;
    this._source = null;
    this._buffer = null;
    this._running = false;
    this._avgEnergy = 0;
    this._lastBeatTime = 0;
  }

  /** List available audio input devices (mic / line-in). Browsers may need a prior permission grant to show labels. */
  static async listInputDevices() {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.filter(d => d.kind === 'audioinput');
  }

  /** Connect to a mic/line-in device (optionally a specific deviceId) and start processing. */
  async connect(deviceId = null) {
    const constraints = { audio: deviceId ? { deviceId: { exact: deviceId } } : true };
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    this._audioContext = new (window.AudioContext || window.webkitAudioContext)();
    this._source = this._audioContext.createMediaStreamSource(stream);
    this._setupAnalyser();
    this._start();
    return this;
  }

  /** Connect to an existing Web Audio node (e.g. from a p5.SoundFile) instead of a live device. */
  connectNode(audioNode, audioContext) {
    this._audioContext = audioContext;
    this._source = audioNode;
    this._setupAnalyser();
    this._start();
    return this;
  }

  stop() {
    this._running = false;
  }

  /** Change the Hz range used to normalize pitch, e.g. dd.setPitchRange(80, 800). */
  setPitchRange(minHz, maxHz) {
    this.pitchMinHz = minHz;
    this.pitchMaxHz = maxHz;
  }

  /** Convenience registration, equivalent to addEventListener('beat', cb). Fires with detail: {time, energy}. */
  onBeat(callback) {
    this.addEventListener('beat', callback);
  }

  /** Convenience registration, equivalent to addEventListener('pitch', cb). Fires with detail: {hz, normalized}. */
  onPitch(callback) {
    this.addEventListener('pitch', callback);
  }

  // ---------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------

  _setupAnalyser() {
    this._analyser = this._audioContext.createAnalyser();
    this._analyser.fftSize = 2048;
    this._source.connect(this._analyser);
    this._buffer = new Float32Array(this._analyser.fftSize);
  }

  _start() {
    if (this._running) return;
    this._running = true;
    const loop = () => {
      if (!this._running) return;
      this._processFrame();
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  _processFrame() {
    this._analyser.getFloatTimeDomainData(this._buffer);

    // --- energy / beat detection ---
    const energy = this._computeRMS(this._buffer);
    this.energy = energy;
    this._avgEnergy = this._avgEnergy === 0
      ? energy
      : this._avgEnergy * this.beatDecay + energy * (1 - this.beatDecay);

    const now = performance.now();
    if (
      energy > this._avgEnergy * this.beatThreshold &&
      energy > 0.01 && // ignore near-silence so quiet noise floor doesn't self-trigger
      now - this._lastBeatTime > this.beatHoldMs
    ) {
      this._lastBeatTime = now;
      this.dispatchEvent(new CustomEvent('beat', { detail: { time: now, energy } }));
    }

    // --- pitch detection ---
    const hz = this._autocorrelate(this._buffer, this._audioContext.sampleRate);
    if (hz > 0) {
      this.pitchHz = hz;
      this.pitch = this._normalizePitch(hz);
      this.dispatchEvent(new CustomEvent('pitch', { detail: { hz, normalized: this.pitch } }));
    }
  }

  _computeRMS(buffer) {
    let sum = 0;
    for (let i = 0; i < buffer.length; i++) sum += buffer[i] * buffer[i];
    return Math.sqrt(sum / buffer.length);
  }

  _normalizePitch(hz) {
    const clamped = Math.min(Math.max(hz, this.pitchMinHz), this.pitchMaxHz);
    const logMin = Math.log2(this.pitchMinHz);
    const logMax = Math.log2(this.pitchMaxHz);
    return (Math.log2(clamped) - logMin) / (logMax - logMin);
  }

  /**
   * ACF2+ autocorrelation pitch detection (the standard, well-tested approach
   * for monophonic time-domain pitch tracking in the browser).
   * Returns frequency in Hz, or -1 if no clear pitch is present (e.g. silence/noise).
   */
  _autocorrelate(buffer, sampleRate) {
    const SIZE = buffer.length;
    let rms = 0;
    for (let i = 0; i < SIZE; i++) rms += buffer[i] * buffer[i];
    rms = Math.sqrt(rms / SIZE);
    if (rms < 0.01) return -1; // too quiet for a reliable read

    // trim near-silent samples from both ends
    let r1 = 0, r2 = SIZE - 1;
    const threshold = 0.2;
    for (let i = 0; i < SIZE / 2; i++) {
      if (Math.abs(buffer[i]) < threshold) { r1 = i; break; }
    }
    for (let i = 1; i < SIZE / 2; i++) {
      if (Math.abs(buffer[SIZE - i]) < threshold) { r2 = SIZE - i; break; }
    }
    const trimmed = buffer.slice(r1, r2);
    const n = trimmed.length;

    const c = new Array(n).fill(0);
    for (let lag = 0; lag < n; lag++) {
      for (let i = 0; i < n - lag; i++) {
        c[lag] += trimmed[i] * trimmed[i + lag];
      }
    }

    let d = 0;
    while (d + 1 < n && c[d] > c[d + 1]) d++;

    let maxVal = -1, maxPos = -1;
    for (let i = d; i < n; i++) {
      if (c[i] > maxVal) { maxVal = c[i]; maxPos = i; }
    }
    let T0 = maxPos;
    if (T0 <= 0) return -1;

    // parabolic interpolation around the peak for sub-sample precision
    const x1 = c[T0 - 1] ?? c[T0];
    const x2 = c[T0];
    const x3 = c[T0 + 1] ?? c[T0];
    const a = (x1 + x3 - 2 * x2) / 2;
    const b = (x3 - x1) / 2;
    if (a) T0 = T0 - b / (2 * a);

    return sampleRate / T0;
  }
}