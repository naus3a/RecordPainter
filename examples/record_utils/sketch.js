/**
 * This example shows a set of basic UI controls for record-related
 * parameters: playback speed, song duration and sticker radius.
 * Values are stored in a RecordInfo instance (see libs/RecordUtils.js).
 */

let recordInfo;

let speedSelect;
let durationInput;
let radiusInput;

function setup() {
  createCanvas(400, 400).parent('sketch-holder');

  recordInfo = new RecordInfo();

  createControls();

  textAlign(CENTER, CENTER);
}

function createControls() {
  const controls = createDiv().id('controls').parent('controls-holder');

  // Speed dropdown: only 33 or 45, defaults to 33.
  const speedRow = createDiv().parent(controls);
  createElement('label', 'Speed (RPM)').parent(speedRow);
  speedSelect = createSelect().parent(speedRow);
  speedSelect.option('33');
  speedSelect.option('45');
  speedSelect.selected(String(recordInfo.recordSpeed));
  speedSelect.changed(onSpeedChanged);

  // Duration text field: integer numbers, defaults to 60.
  const durationRow = createDiv().parent(controls);
  createElement('label', 'Duration (s)').parent(durationRow);
  durationInput = createInput(String(recordInfo.songDuration), 'number').parent(durationRow);
  durationInput.attribute('step', '1');
  durationInput.input(onDurationChanged);

  // Radius text field: float numbers, defaults to 10.0.
  const radiusRow = createDiv().parent(controls);
  createElement('label', 'Sticker Radius').parent(radiusRow);
  radiusInput = createInput(recordInfo.stickerRadius.toFixed(1), 'number').parent(radiusRow);
  radiusInput.attribute('step', '0.1');
  radiusInput.input(onRadiusChanged);
}

function onSpeedChanged() {
  recordInfo.recordSpeed = Number(speedSelect.value());
  recordInfo.updateRadialSpeed();
}

function onDurationChanged() {
  const value = parseInt(durationInput.value(), 10);
  if (!Number.isNaN(value)) {
    recordInfo.songDuration = value;
  }
  recordInfo.updateRadialSpeed();
}

function onRadiusChanged() {
  const value = parseFloat(radiusInput.value());
  if (!Number.isNaN(value)) {
    recordInfo.stickerRadius = value;
  }
  recordInfo.updateRadialSpeed();
}

function draw() {
  background(240);

  fill(0);
  noStroke();
  text(`recordSpeed: ${recordInfo.recordSpeed}`, width / 2, height / 2 - 60);
  text(`songDuration: ${recordInfo.songDuration}`, width / 2, height / 2 - 20);
  text(`stickerRadius: ${recordInfo.stickerRadius}`, width / 2, height / 2 + 20);
  text(`radialSpeed: ${recordInfo.radialSpeed.toFixed(3)} mm/s`, width / 2, height / 2 + 60);
}
