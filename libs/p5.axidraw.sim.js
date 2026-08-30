/**
 * Drop-in simulation of p5.axidraw.js's `axidraw.AxiDraw` class.
 *
 * Implements the same public methods with the same call signatures and
 * roughly the same timing (moveTo takes as long as the real move would,
 * pen toggles take ~1s) so sketches written against the real library run
 * unmodified with no AxiDraw plugged in and no Web Serial API required.
 *
 * This is a stand-in for testing/development only — swap p5.axidraw.js
 * back in for real plotting. See examples/mouse_controlled_axidraw/index.html
 * for how the two are selected.
 */
(function (global) {
  const STEPS_PER_MM = 80;
  const MAX_MM_PER_SEC = 380;
  const MIN_MM_PER_SEC = 1.31 / STEPS_PER_MM;

  function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  class AxiDraw {
    constructor() {
      this.connected = false;
      this.targetPos = { x: 0, y: 0 };
      this.lastCommandedPos = { x: 0, y: 0 };
      this.mmPerSec = 25;
      this.penIsDown = false;
      this._analogChannels = {};
      this._pending = 0;
      this._queue = Promise.resolve();
    }

    // Mirrors the real library: queue async work so calls made back-to-back
    // (e.g. moveTo, moveTo) still play out in order and one at a time.
    _enqueue(fn) {
      this._pending += 1;
      const result = this._queue.then(fn);
      this._queue = result.catch(() => {});
      result.finally(() => {
        this._pending -= 1;
      });
      return result;
    }

    isBusy() {
      return this._pending > 0;
    }

    async connect() {
      if (this.connected) return;
      console.log('[axidraw sim] connected — no hardware attached');
      await wait(50);
      this.connected = true;
    }

    async disconnect() {
      if (!this.connected) return;
      this.connected = false;
      console.log('[axidraw sim] disconnected');
    }

    async enable() {
      if (!this.connected) return;
      console.log('[axidraw sim] motors enabled');
    }

    async disable() {
      if (!this.connected) return;
      console.log('[axidraw sim] motors disabled');
    }

    async currentPosition() {
      if (!this.connected) throw new Error('Not connected');
      return { ...this.lastCommandedPos };
    }

    async penUp() {
      if (!this.connected) return;
      return this._enqueue(async () => {
        const wasDown = this.penIsDown;
        this.penIsDown = false;
        if (wasDown) await wait(1000);
      });
    }

    async penDown() {
      if (!this.connected) return;
      return this._enqueue(async () => {
        const wasDown = this.penIsDown;
        this.penIsDown = true;
        if (!wasDown) await wait(1000);
      });
    }

    setSpeed(mmPerSec) {
      this.mmPerSec = Math.max(Math.min(mmPerSec, MAX_MM_PER_SEC), MIN_MM_PER_SEC);
    }

    async moveTo(x, y) {
      if (!this.connected) return;
      this.targetPos = { x, y };
      const dx = this.targetPos.x - this.lastCommandedPos.x;
      const dy = this.targetPos.y - this.lastCommandedPos.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const durationMs = (dist / this.mmPerSec) * 1000;
      this.lastCommandedPos = this.targetPos;
      if (durationMs < 1) return;
      return this._enqueue(() => wait(durationMs));
    }

    async stop() {
      if (!this.connected) return Promise.resolve();
      this.commands = [];
    }

    async analogConfigure(channel, enable) {
      if (!this.connected) return;
      if (channel < 0 || channel > 12) throw new Error('Invalid channel number');
      return this._enqueue(async () => {
        this._analogChannels[channel] = !!enable;
      });
    }

    async analogRead(channel) {
      if (!this.connected) return Promise.resolve();
      return this._enqueue(async () => {
        if (!this._analogChannels[channel]) {
          throw new Error(
            `Channel not enabled. Enable it with analogConfigure(${channel}, true) first.`,
          );
        }
        return 0;
      });
    }
  }

  global.axidraw = { AxiDraw, MAX_MM_PER_SEC, MIN_MM_PER_SEC, STEPS_PER_MM };
})(typeof window !== 'undefined' ? window : globalThis);
