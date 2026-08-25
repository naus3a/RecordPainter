/**
 * RecordUtils.js
 *
 * Shared utilities describing the physical properties of a record being
 * painted/drawn on.
 */

/**
 * Holds the parameters of a record and derives the values needed to draw
 * on it.
 */
class RecordInfo {
  /**
   * @param {number} recordSpeed - Playback speed in RPM (e.g. 33 or 45).
   * @param {number} songDuration - Duration of the song, in seconds.
   * @param {number} stickerRadius - Radius of the sticker, in centimeters.
   */
  constructor(recordSpeed = 33, songDuration = 60, stickerRadius = 10.0) {
    this.recordSpeed = recordSpeed;
    this.songDuration = songDuration;
    this.stickerRadius = stickerRadius;

    // mm/sec needed for the drawing head to cover stickerRadius over songDuration.
    this.radialSpeed = 0;
    this.updateRadialSpeed();
  }

  /**
   * Recomputes radialSpeed (mm/sec) from the current stickerRadius (cm)
   * and songDuration (sec). Should be called whenever those change.
   * @returns {number} the updated radialSpeed.
   */
  updateRadialSpeed() {
    if (this.songDuration <= 0) {
      this.radialSpeed = 0;
      return this.radialSpeed;
    }

    const stickerRadiusMm = this.stickerRadius * 10;
    this.radialSpeed = stickerRadiusMm / this.songDuration;
    return this.radialSpeed;
  }
}
