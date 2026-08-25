/**
 * This example shows a set of basic UI controls for record-related
 * parameters: playback speed, song duration and sticker radius.
 */

let recordSpeed = 33;
let songDuration = 60;
let stickerRadius = 10.0;

// mm/sec needed for the drawing head to cover stickerRadius (cm) over songDuration (sec).
let radialSpeed = 0;

let speedSelect;
let durationInput;
let radiusInput;

function setup() {
  createCanvas(400, 400).parent('sketch-holder');

  createControls();
  updateRadialSpeed();

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
  speedSelect.selected('33');
  speedSelect.changed(onSpeedChanged);

  // Duration text field: integer numbers, defaults to 60.
  const durationRow = createDiv().parent(controls);
  createElement('label', 'Duration (s)').parent(durationRow);
  durationInput = createInput(String(songDuration), 'number').parent(durationRow);
  durationInput.attribute('step', '1');
  durationInput.input(onDurationChanged);

  // Radius text field: float numbers, defaults to 10.0.
  const radiusRow = createDiv().parent(controls);
  createElement('label', 'Sticker Radius').parent(radiusRow);
  radiusInput = createInput(stickerRadius.toFixed(1), 'number').parent(radiusRow);
  radiusInput.attribute('step', '0.1');
  radiusInput.input(onRadiusChanged);
}

function onSpeedChanged() {
  recordSpeed = Number(speedSelect.value());
  updateRadialSpeed();
}

function onDurationChanged() {
  const value = parseInt(durationInput.value(), 10);
  if (!Number.isNaN(value)) {
    songDuration = value;
  }
  updateRadialSpeed();
}

function onRadiusChanged() {
  const value = parseFloat(radiusInput.value());
  if (!Number.isNaN(value)) {
    stickerRadius = value;
  }
  updateRadialSpeed();
}

function updateRadialSpeed() {
  if (songDuration <= 0) {
    radialSpeed = 0;
    return;
  }

  const stickerRadiusMm = stickerRadius * 10;
  radialSpeed = stickerRadiusMm / songDuration;
}

function draw() {
  background(240);

  fill(0);
  noStroke();
  text(`recordSpeed: ${recordSpeed}`, width / 2, height / 2 - 60);
  text(`songDuration: ${songDuration}`, width / 2, height / 2 - 20);
  text(`stickerRadius: ${stickerRadius}`, width / 2, height / 2 + 20);
  text(`radialSpeed: ${radialSpeed.toFixed(3)} mm/s`, width / 2, height / 2 + 60);
}
