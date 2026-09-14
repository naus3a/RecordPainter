// ============================================================
// ENGINE CONSTANTS
// Physical geometry lives in machine-config.js.
// Artistic sequence data lives in presets.json.
// ============================================================

if (typeof MachineConfig === "undefined") {
  throw new Error(
    "MachineConfig not found. Load machine-config.js before sketch.js."
  );
}

const MOVE_THRESHOLD_MM = 1;
const BEAT_FLASH_MS = 150;

const BEAT_PEN_MIN_MS = 40;
const BEAT_PEN_MAX_MS = 180;
const BEAT_ENERGY_MAX = 0.20;

let presets = null;

let remoteSocket;

let presetRunning = false;
let currentPresetName = null;
let currentTrackIndex = -1;
let currentTrack = null;
let presetAbortRequested = false;

let lastBeatPenTriggerAt = -Infinity;
let beatCurrentY = MachineConfig.label.topY;
let beatShiftMoving = false;

let beatPenDown = false;
let beatPenReleaseAt = 0;

// All live movement parameters.
// Manual controls change these directly.
// Preset tracks load their values into the same object.
const AudioMotionTuning = {

  drawSpeedMmPerSec: {
    value: 25,
    min: 5,
    max: 70,
    step: 5,
    label: 'AxiDraw XY speed (mm/s)',
  },

  yAmplitudeMm: {
    value: 10,
    min: 0,
    max: MachineConfig.label.radiusMm,
    step: 1,
    label: 'Pitch Y amplitude (mm)',
  },

  sampleIntervalMs: {
    value: 250,
    min: 50,
    max: 1000,
    step: 10,
    label: 'Sample interval (ms)',
  },

  beatKickMm: {
    value: 2,
    min: 0,
    max: 10,
    step: 1,
    label: 'Beat X kick (mm)',
  },

  xMaxMm: {
    value: 5,
    min: 0,
    max: 10,
    step: 1,
    label: 'Beat X max offset (mm)',
  },

  xRecenterDecay: {
    value: 0.8,
    min: 0,
    max: 0.99,
    step: 0.01,
    label: 'X recenter decay',
  },

  bBeatMinIntervalMs: {
    value: 350,
    min: 100,
    max: 1000,
    step: 10,
    label: 'B beat min interval (ms)',
  },

  beatYMaxTravelMm: {
    value: 10,
    min: 0,
    max: MachineConfig.label.bottomY - MachineConfig.label.topY,
    step: 0.5,
    label: 'B max Y travel (mm)',
  },

  beatYStepMm: {
    value: 0.2,
    min: 0.05,
    max: 1,
    step: 0.05,
    label: 'B Y step (mm)',
  },
};


const AppState = Object.freeze({
  NOT_CONNECTED: "not_connected",
  CONNECTED: "connected",
  READY: "ready",
  DRAWING: "drawing",
  BEAT_DRAWING: "beat_drawing",
});


const axi = new axidraw.AxiDraw();

let lastPos;
let paperStartPos;
let lastScreenPenPos;
let appState = AppState.NOT_CONNECTED;
let penIsDown = false;

let dd = null;
let audioConnected = false;
let audioDevices = [];
let audioEnableButton;
let audioDeviceSelect;
let audioConnectButton;
let audioStatusP;
let lastBeatAt = -Infinity;

let audioPenMoving = false;
let lastAudioSampleAt = -Infinity;
let audioXOffset = 0;

let lastAudioTargetX = null;
let lastAudioTargetY = null;


function setupRemoteControl() {
  remoteSocket = new WebSocket(
    "ws://127.0.0.1:8081"
  );

  remoteSocket.onopen = () => {
    console.log("REMOTE CONTROL CONNECTED");
  };

  remoteSocket.onclose = () => {
    console.log("REMOTE CONTROL DISCONNECTED");
  };

  remoteSocket.onerror = (err) => {
    console.error(
      "REMOTE CONTROL ERROR",
      err
    );
  };

  remoteSocket.onmessage = (event) => {
    const msg = JSON.parse(event.data);

    console.log(
      "REMOTE:",
      msg.address,
      msg.args
    );

    const value =
      msg.args?.[0]?.value;


    // iPhone START button:
    // react only to press = 1,
    // ignore release = 0.
    if (
      msg.address === "/start" &&
      value === 1 &&
      appState === AppState.READY
    ) {
      startBeatDrawing();
    }
  };
}


////
//// p5
////

function preload() {
  presets = loadJSON("presets.json");
}


function setup() {
  createCanvas(400, 400);

  textAlign(CENTER);
  ellipseMode(CENTER);
  fill(0);

  lastPos = createVector(0, 0);

  // Default manual drawing start.
  // Preset tracks overwrite this at runtime.
  paperStartPos = createVector(
    MachineConfig.label.centerX,
    MachineConfig.label.topY
  );

  setupAudioUI();
  setupAudioTuningUI();
  setupRemoteControl();

  console.log("PRESETS LOADED:", Object.keys(presets || {}));
}


function draw() {
  switch (appState) {
    case AppState.DRAWING:
      updateAudioPenMotion();
      drawReady();
      break;

    case AppState.BEAT_DRAWING:
      updateBeatPenMotion();
      drawReady();
      break;

    case AppState.READY:
      drawReady();
      break;

    case AppState.CONNECTED:
      drawConnected();
      break;

    case AppState.NOT_CONNECTED:
      drawDisconnected();
      break;
  }

  drawAudioMeter();
}


function mousePressed() {

}


function mouseReleased() {
  switch (appState) {
    case AppState.CONNECTED:
      break;

    case AppState.NOT_CONNECTED:
      connectAxi();
      break;
  }
}


function keyPressed() {

}


function keyReleased() {
  // While a preset is running, the sequencer owns the machine.
  // During preset playback ALL keyboard controls are blocked,
  // except S = immediate safety stop.
  if (presetRunning) {

    if (
      keyCode === BACKSPACE ||
      keyCode === DELETE
    ) {
      safetyStopPreset();
    }

    return;
  }

  switch (appState) {

    case AppState.READY:

      if (key === 'd') {
        startDrawing();
      }

      if (key === 'b') {
        startBeatDrawing();
      }

      if (key === 'p') {
        parkPen();
      }

      if (key === 'r') {
        returnToStart();
      }

      if (key === 'h') {
        goHome();
      }

      // Temporary local test trigger for PRESET1 "Energy".
      // Remote preset triggering can be added later.
      if (key === '1') {
        playPreset("energy");
      }

      if (key === '2') {
        playPreset("ambient");
      }

      break;


    case AppState.DRAWING:

      if (key === 'd') {
        stopDrawing();
      }

      break;


    case AppState.BEAT_DRAWING:

      if (key === 'b') {
        stopBeatDrawing();
      }

      break;


    default:
      break;
  }
}

////
//// draw
////

function drawConnected() {
  background(255, 255, 0, 255);

  text(
    "[" + getSimulatorString() + "] CONNECTED\nPreparing pen",
    width / 2,
    20
  );
}


function drawDisconnected() {
  background(255, 0, 0, 255);

  text(
    "[" + getSimulatorString() + "] DISCONNECTED\nClick to connect",
    width / 2,
    20
  );
}


function drawReady() {
  background(255, 255, 255, 255);
  drawPen();
}


function drawPen() {
  push();

  if (penIsDown) {
    stroke(0, 255, 0, 255);
    fill(0, 255, 0, 255);
  } else {
    stroke(255, 0, 0, 255);
    noFill();
  }

  ellipse(
    lastScreenPenPos.x,
    lastScreenPenPos.y,
    10,
    10
  );

  pop();
}


// Blue = energy
// Orange = pitch
// Pink = beat

function drawAudioMeter() {
  if (!audioConnected || !dd) return;

  push();
  noStroke();

  fill(0, 150, 255);

  const energyHeight = dd.energy * 200;

  rect(
    10,
    height - 10 - energyHeight,
    20,
    energyHeight
  );


  fill(255, 150, 0);

  const pitchHeight = dd.pitch * 200;

  rect(
    40,
    height - 10 - pitchHeight,
    20,
    pitchHeight
  );


  if (millis() - lastBeatAt < BEAT_FLASH_MS) {
    fill(255, 0, 150);

    rect(
      70,
      height - 30,
      20,
      20
    );
  }

  pop();
}



////
//// utils
////

function isSimulator() {
  return window.AXIDRAW_SIMULATED;
}


function getSimulatorString() {
  return isSimulator() ? "SIM" : "DEVICE";
}


function screenToPaper(x, y) {
  return createVector(
    map(x, 0, width, 0, MachineConfig.workspace.maxX),
    map(y, 0, height, 0, MachineConfig.workspace.maxY)
  );
}


function paperToScreen(x, y) {
  return createVector(
    map(x, 0, MachineConfig.workspace.maxX, 0, width),
    map(y, 0, MachineConfig.workspace.maxY, 0, height)
  );
}


function isInsideLabel(x, y) {
  const dx = x - MachineConfig.label.centerX;
  const dy = y - MachineConfig.label.centerY;

  return (
    dx * dx + dy * dy <=
    MachineConfig.label.radiusMm * MachineConfig.label.radiusMm + 0.000001
  );
}


// Final hard safety for all pen-down XY drawing targets.
// Pen-up transport does NOT use this because park/home live outside the label.
function constrainToLabel(x, y) {
  const cx = MachineConfig.label.centerX;
  const cy = MachineConfig.label.centerY;
  const radius = MachineConfig.label.radiusMm;

  const dx = x - cx;
  const dy = y - cy;
  const distance = Math.sqrt(dx * dx + dy * dy);

  if (distance <= radius || distance === 0) {
    return { x, y };
  }

  const scale = radius / distance;

  return {
    x: cx + dx * scale,
    y: cy + dy * scale,
  };
}


// Maximum safe +Y for a vertical B-mode path at a given X.
function maxLabelYAtX(x) {
  const dx = x - MachineConfig.label.centerX;
  const radius = MachineConfig.label.radiusMm;

  if (Math.abs(dx) > radius) {
    return null;
  }

  const yExtent =
    Math.sqrt(
      Math.max(
        0,
        radius * radius - dx * dx
      )
    );

  return MachineConfig.label.centerY + yExtent;
}


function waitMs(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}


function waitSeconds(seconds) {
  return waitMs(seconds * 1000);
}


////
//// AxiDraw
////

function connectAxi() {
  axi.connect().then(async () => {
    appState = AppState.CONNECTED;

    console.log("CONNECTED");

    axi.setSpeed(
      AudioMotionTuning.drawSpeedMmPerSec.value
    );

    await configurePenServoSpeed();
    await preparePen();
  });
}


async function configurePenServoSpeed() {
  await axi.ebb.stepperAndServoModeConfigure(
    11,
    MachineConfig.servo.rateUp
  );

  await axi.ebb.stepperAndServoModeConfigure(
    12,
    MachineConfig.servo.rateDown
  );

  console.log("PEN SERVO SPEED CONFIGURED");
}


function fastPenDown() {
  return axi.ebb.setPenState(true);
}


function fastPenUp() {
  return axi.ebb.setPenState(false);
}


// Move safely to the current active drawing start.
async function moveToActiveStart() {
  appState = AppState.CONNECTED;

  await axi.penUp();
  penIsDown = false;

  await axi.moveTo(
    paperStartPos.x,
    paperStartPos.y
  );

  lastScreenPenPos = paperToScreen(
    paperStartPos.x,
    paperStartPos.y
  );

  audioXOffset = 0;
  lastAudioTargetX = paperStartPos.x;
  lastAudioTargetY = paperStartPos.y;
}


// Fresh connection -> default manual drawing start.
async function preparePen() {
  await moveToActiveStart();

  appState = AppState.READY;

  console.log(
    "READY AT",
    paperStartPos.x,
    paperStartPos.y
  );
}


async function startDrawing() {
  if (!audioConnected) {
    console.log("AUDIO NOT CONNECTED");
    return;
  }

  await moveToActiveStart();

  audioXOffset = 0;
  lastAudioSampleAt = -Infinity;
  lastAudioTargetX = paperStartPos.x;
  lastAudioTargetY = paperStartPos.y;

  appState = AppState.CONNECTED;
  await axi.penDown();

  penIsDown = true;
  appState = AppState.DRAWING;

  console.log("DRAWING");
}


async function stopDrawing() {
  // Stop sending new audio movements.
  appState = AppState.CONNECTED;

  // Finish the movement already in progress.
  while (audioPenMoving) {
    await waitMs(10);
  }

  // Lift only — no XY movement.
  await axi.penUp();

  penIsDown = false;
  appState = AppState.READY;

  console.log("DRAWING STOPPED");
}


async function startBeatDrawing() {
  if (!audioConnected) {
    console.log("AUDIO NOT CONNECTED");
    return;
  }

  await moveToActiveStart();

  beatCurrentY = paperStartPos.y;
  beatShiftMoving = false;
  lastBeatPenTriggerAt = -Infinity;

  audioXOffset = 0;
  beatPenDown = false;
  beatPenReleaseAt = 0;

  await fastPenUp();

  penIsDown = false;
  appState = AppState.BEAT_DRAWING;

  console.log("BEAT DRAWING");
}


async function stopBeatDrawing() {
  console.log("BEAT DRAWING STOPPING");

  // Immediately prevent any new beats from doing anything.
  appState = AppState.CONNECTED;

  beatPenReleaseAt = 0;
  beatPenDown = false;
  beatShiftMoving = false;

  // Immediate UP command, without p5.axidraw wrapper delay.
  await fastPenUp();

  penIsDown = false;
  appState = AppState.READY;

  console.log("BEAT DRAWING STOPPED");
}


async function updateBeatPenMotion() {
  if (
    beatPenDown &&
    millis() >= beatPenReleaseAt &&
    !beatShiftMoving
  ) {
    beatPenDown = false;
    penIsDown = false;
    beatShiftMoving = true;

    await fastPenUp();

    const maxYFromTrack =
      paperStartPos.y +
      AudioMotionTuning.beatYMaxTravelMm.value;

    const maxYFromLabel =
      maxLabelYAtX(paperStartPos.x);

    // If the start X itself is outside the circular label,
    // do not send a drawing move.
    if (maxYFromLabel === null) {
      console.error(
        "B MODE START X OUTSIDE LABEL:",
        paperStartPos.x
      );

      beatShiftMoving = false;
      return;
    }

    beatCurrentY =
      Math.min(
        beatCurrentY +
        AudioMotionTuning.beatYStepMm.value,
        maxYFromTrack,
        maxYFromLabel
      );

    await axi.moveTo(
      paperStartPos.x,
      beatCurrentY
    );

    lastScreenPenPos = paperToScreen(
      paperStartPos.x,
      beatCurrentY
    );

    console.log(
      "BEAT Y SHIFT:",
      beatCurrentY
    );

    beatShiftMoving = false;
  }
}


function triggerBeatPen() {
  if (beatShiftMoving) return;

  const strength =
    constrain(
      dd.energy / BEAT_ENERGY_MAX,
      0,
      1
    );

  const dwellMs =
    lerp(
      BEAT_PEN_MIN_MS,
      BEAT_PEN_MAX_MS,
      strength
    );

  // If another beat occurs while the pen
  // is already down, keep it down longer.
  beatPenReleaseAt =
    Math.max(
      beatPenReleaseAt,
      millis() + dwellMs
    );

  if (!beatPenDown) {
    beatPenDown = true;
    penIsDown = true;

    fastPenDown();
  }

  console.log(
    "BEAT PEN",
    "energy:", dd.energy.toFixed(3),
    "down:", Math.round(dwellMs), "ms"
  );
}


async function parkPen() {
  console.log("PARKING...");

  appState = AppState.CONNECTED;

  await axi.penUp();
  penIsDown = false;

  await axi.moveTo(
    MachineConfig.park.x,
    MachineConfig.park.y
  );

  lastScreenPenPos = paperToScreen(
    MachineConfig.park.x,
    MachineConfig.park.y
  );

  audioXOffset = 0;

  console.log(
    "PARKED AT",
    MachineConfig.park.x,
    MachineConfig.park.y
  );

  appState = AppState.READY;
}


async function returnToStart() {
  console.log("RETURNING TO START...");

  await moveToActiveStart();

  console.log(
    "AT DRAW START",
    paperStartPos.x,
    paperStartPos.y
  );

  appState = AppState.READY;
}


// H = return to origin of current session.
async function goHome() {
  console.log("HOMING...");

  appState = AppState.CONNECTED;

  await axi.penUp();
  penIsDown = false;

  await axi.moveTo(0, 0);

  lastScreenPenPos = paperToScreen(0, 0);

  audioXOffset = 0;

  console.log("HOME X0 Y0");

  appState = AppState.READY;
}


////
//// preset sequencer
////

function setTuningValue(key, value) {
  const cfg = AudioMotionTuning[key];

  if (!cfg || value === undefined) {
    return;
  }

  cfg.value = value;

  if (cfg.slider) {
    cfg.slider.value(value);
  }

  if (cfg.valueSpan) {
    cfg.valueSpan.html(value);
  }

  if (key === "drawSpeedMmPerSec") {
    axi.setSpeed(value);
  }
}


function applyTrackParameters(track) {
  const params = track.params || {};

  setTuningValue(
    "drawSpeedMmPerSec",
    params.speedMmPerSec
  );

  setTuningValue(
    "yAmplitudeMm",
    params.pitchYAmplitudeMm
  );

  setTuningValue(
    "sampleIntervalMs",
    params.sampleIntervalMs
  );

  setTuningValue(
    "beatKickMm",
    params.beatKickMm
  );

  setTuningValue(
    "xMaxMm",
    params.xMaxMm
  );

  setTuningValue(
    "xRecenterDecay",
    params.xRecenterDecay
  );

  setTuningValue(
    "bBeatMinIntervalMs",
    params.beatMinIntervalMs
  );

  setTuningValue(
    "beatYMaxTravelMm",
    params.maxYTravelMm
  );

  setTuningValue(
    "beatYStepMm",
    params.yStepMm
  );
}


function validatePreset(presetId) {
  const preset = presets?.[presetId];
  const errors = [];

  if (!preset) {
    return {
      valid: false,
      errors: [`Unknown preset: ${presetId}`],
    };
  }

  if (!Array.isArray(preset.tracks) ||
    preset.tracks.length === 0) {
    return {
      valid: false,
      errors: [`Preset ${presetId} has no tracks.`],
    };
  }

  preset.tracks.forEach((track, index) => {
    const label = `Track ${index + 1}`;
    const params = track.params || {};

    if (!track.start ||
      !Number.isFinite(track.start.x) ||
      !Number.isFinite(track.start.y)) {
      errors.push(`${label}: invalid start position.`);
      return;
    }

    if (!isInsideLabel(
      track.start.x,
      track.start.y
    )) {
      errors.push(
        `${label}: start (${track.start.x}, ${track.start.y}) is outside label.`
      );
    }

    if (!Number.isFinite(track.durationSec) ||
      track.durationSec <= 0) {
      errors.push(`${label}: durationSec must be > 0.`);
    }

    if (track.mode === "B") {
      const maxTravel =
        params.maxYTravelMm ?? 0;

      const endY =
        track.start.y + maxTravel;

      if (!isInsideLabel(
        track.start.x,
        endY
      )) {
        errors.push(
          `${label}: B travel reaches (${track.start.x}, ${endY}), outside label.`
        );
      }
    }

    else if (track.mode === "D") {
      const yAmplitude =
        params.pitchYAmplitudeMm ?? 0;

      const xMax =
        params.xMaxMm ?? 0;

      const corners = [
        {
          x: track.start.x - xMax,
          y: track.start.y - yAmplitude,
        },
        {
          x: track.start.x + xMax,
          y: track.start.y - yAmplitude,
        },
        {
          x: track.start.x - xMax,
          y: track.start.y + yAmplitude,
        },
        {
          x: track.start.x + xMax,
          y: track.start.y + yAmplitude,
        },
      ];

      corners.forEach(point => {
        if (!isInsideLabel(
          point.x,
          point.y
        )) {
          errors.push(
            `${label}: D envelope can exceed label near (${point.x}, ${point.y}).`
          );
        }
      });
    }

    else {
      errors.push(
        `${label}: unknown mode "${track.mode}".`
      );
    }
  });

  return {
    valid: errors.length === 0,
    errors,
  };
}


async function prepareTrack(track) {
  appState = AppState.CONNECTED;

  await axi.penUp();
  penIsDown = false;

  paperStartPos.set(
    track.start.x,
    track.start.y
  );

  applyTrackParameters(track);

  audioXOffset = 0;
  lastAudioSampleAt = -Infinity;
  lastAudioTargetX = paperStartPos.x;
  lastAudioTargetY = paperStartPos.y;

  beatCurrentY = paperStartPos.y;
  beatPenDown = false;
  beatPenReleaseAt = 0;
  beatShiftMoving = false;
  lastBeatPenTriggerAt = -Infinity;

  await axi.moveTo(
    paperStartPos.x,
    paperStartPos.y
  );

  lastScreenPenPos =
    paperToScreen(
      paperStartPos.x,
      paperStartPos.y
    );

  console.log(
    "TRACK READY:",
    track.mode,
    "START",
    paperStartPos.x,
    paperStartPos.y
  );
}


async function startTrack(track) {
  if (track.mode === "B") {
    await startBeatDrawing();
    return;
  }

  if (track.mode === "D") {
    await startDrawing();
    return;
  }

  throw new Error(
    `Unknown mode: ${track.mode}`
  );
}


async function stopTrack(track) {
  if (track.mode === "B") {
    await stopBeatDrawing();
    return;
  }

  if (track.mode === "D") {
    await stopDrawing();
    return;
  }
}

async function safetyStopPreset() {
  if (!presetRunning) return;

  console.warn("SAFETY STOP");

  // This must happen BEFORE any await.
  // It tells the sequencer not to continue to the next track.
  presetAbortRequested = true;

  // Stop draw() from generating any further movement commands.
  appState = AppState.CONNECTED;

  // Clear mode state.
  beatPenDown = false;
  beatPenReleaseAt = 0;
  beatShiftMoving = false;

  audioPenMoving = false;
  audioXOffset = 0;

  try {
    // Immediate XY emergency stop.
    await axi.stop();
  }
  catch (err) {
    console.error(
      "AXIDRAW STOP ERROR:",
      err
    );
  }

  try {
    // Raise pen immediately using the fast servo command.
    await fastPenUp();
  }
  catch (err) {
    console.error(
      "PEN UP ERROR:",
      err
    );
  }

  penIsDown = false;

  // Restore normal speed for whatever you do next.
  setTuningValue(
    "drawSpeedMmPerSec",
    25
  );

  appState = AppState.READY;

  console.warn(
    "PRESET ABORTED — MACHINE STOPPED"
  );
}

async function waitPresetSeconds(seconds) {
  const endTime =
    performance.now() +
    seconds * 1000;

  while (
    performance.now() < endTime
  ) {
    if (presetAbortRequested) {
      return false;
    }

    await waitMs(50);
  }

  return true;
}

async function playPreset(presetId) {
  if (presetRunning) {
    console.log("A PRESET IS ALREADY RUNNING");
    return;
  }

  if (appState !== AppState.READY) {
    console.log("SYSTEM NOT READY");
    return;
  }

  if (!audioConnected) {
    console.log("AUDIO NOT CONNECTED");
    return;
  }

  const validation =
    validatePreset(presetId);

  if (!validation.valid) {
    console.error(
      `PRESET "${presetId}" INVALID`
    );

    validation.errors.forEach(error => {
      console.error(error);
    });

    return;
  }

  const preset =
    presets[presetId];

  presetRunning = true;
  presetAbortRequested = false;
  currentPresetName = presetId;

  console.log(
    `PRESET "${preset.name}" START`
  );

  try {
    for (
      let i = 0;
      i < preset.tracks.length;
      i++
    ) {
      currentTrackIndex = i;
      currentTrack = preset.tracks[i];

      console.log(
        `TRACK ${i + 1}/${preset.tracks.length}`,
        currentTrack.mode,
        `${currentTrack.durationSec}s`
      );

      await prepareTrack(currentTrack);
      await startTrack(currentTrack);

      const trackCompleted =
        await waitPresetSeconds(
          currentTrack.durationSec
        );

      if (!trackCompleted) {
        break;
      }

      await stopTrack(currentTrack);

      // Pause between tracks.
      // Skip pause after the final track.
      if (i < preset.tracks.length - 1) {
        console.log("TRACK PAUSE: 5s");
        const pauseCompleted =
          await waitPresetSeconds(1);

        if (!pauseCompleted) {
          break;
        }
      }

      await stopTrack(currentTrack);
    }

    if (!presetAbortRequested) {

      setTuningValue(
        "drawSpeedMmPerSec",
        25
      );

      await parkPen();

      console.log(
        `PRESET "${preset.name}" FINISHED`
      );

    } else {

      console.warn(
        `PRESET "${preset.name}" ABORTED`
      );
    }
  }

  catch (err) {
    console.error(
      "PRESET ERROR:",
      err
    );

    // Fail safe: pen up, then park.
    try {
      appState = AppState.CONNECTED;
      await axi.penUp();
      penIsDown = false;
      await parkPen();
    }

    catch (parkErr) {
      console.error(
        "FAILED TO PARK:",
        parkErr
      );
    }
  }

  finally {
    currentTrack = null;
    currentTrackIndex = -1;
    currentPresetName = null;
    presetRunning = false;
    presetAbortRequested = false;
  }
}



////
//// audio
////

function setupAudioUI() {
  audioStatusP = createP('Audio: not connected');

  audioEnableButton = createButton('Enable Microphone');
  audioEnableButton.mousePressed(enableMicrophone);

  audioDeviceSelect = createSelect();
  audioDeviceSelect.option('(enable microphone first)');
  audioDeviceSelect.attribute('disabled', '');

  audioConnectButton = createButton('Connect Audio');
  audioConnectButton.attribute('disabled', '');
  audioConnectButton.mousePressed(connectAudio);
}


async function enableMicrophone() {
  audioStatusP.html(
    'Audio: requesting microphone permission...'
  );

  try {
    const tempStream =
      await navigator.mediaDevices.getUserMedia({
        audio: true
      });

    tempStream
      .getTracks()
      .forEach(track => track.stop());

    audioDevices =
      await DeeDeeLib.listInputDevices();

    audioDeviceSelect.html('');

    audioDevices.forEach((device, i) => {
      audioDeviceSelect.option(
        device.label || `Input ${i + 1}`,
        device.deviceId
      );
    });

    audioDeviceSelect.removeAttribute('disabled');
    audioConnectButton.removeAttribute('disabled');

    audioStatusP.html(
      'Audio: choose an input and click Connect'
    );

  } catch (err) {
    console.error(err);

    audioStatusP.html(
      'Audio: microphone permission denied'
    );
  }
}



////
//// audio -> movement
////

function updateAudioPenMotion() {
  if (!audioConnected || !dd) return;
  if (audioPenMoving) return;

  if (
    millis() - lastAudioSampleAt <
    AudioMotionTuning.sampleIntervalMs.value
  ) {
    return;
  }

  lastAudioSampleAt = millis();


  // Gradually recenter beat-driven X offset.
  audioXOffset *=
    AudioMotionTuning.xRecenterDecay.value;


  const yAmplitudeMm =
    AudioMotionTuning.yAmplitudeMm.value;


  // Y from pitch around the ACTIVE track/manual start.
  const rawTargetY =
    paperStartPos.y +
    map(
      dd.pitch,
      0,
      1,
      -yAmplitudeMm,
      yAmplitudeMm
    );


  // X from beat around the ACTIVE track/manual start.
  const rawTargetX =
    paperStartPos.x +
    audioXOffset;


  // Final hard circular label safety.
  const safeTarget =
    constrainToLabel(
      rawTargetX,
      rawTargetY
    );

  const targetX = safeTarget.x;
  const targetY = safeTarget.y;


  // Ignore tiny movements.
  if (
    lastAudioTargetX !== null &&
    lastAudioTargetY !== null
  ) {
    const dx =
      targetX -
      lastAudioTargetX;

    const dy =
      targetY -
      lastAudioTargetY;

    const distance =
      Math.sqrt(
        dx * dx +
        dy * dy
      );

    if (distance < MOVE_THRESHOLD_MM) {
      return;
    }
  }


  lastAudioTargetX = targetX;
  lastAudioTargetY = targetY;

  audioPenMoving = true;


  console.log(
    "MOVE",
    "pitch:", dd.pitch.toFixed(3),
    "X:", targetX.toFixed(3),
    "Y:", targetY.toFixed(3)
  );


  axi.moveTo(
    targetX,
    targetY
  )
    .then(() => {
      audioPenMoving = false;
    })
    .catch(err => {
      audioPenMoving = false;
      console.error(
        "MOVE ERROR:",
        err
      );
    });


  lastScreenPenPos =
    paperToScreen(
      targetX,
      targetY
    );
}



////
//// motion tuning UI
////

function setupAudioTuningUI() {
  const panel =
    createDiv().id('audio-tuning-panel');

  createElement(
    'h4',
    'Motion tuning'
  ).parent(panel);


  Object.values(AudioMotionTuning).forEach(cfg => {
    const row =
      createDiv()
        .addClass('tuning-row')
        .parent(panel);

    createSpan(cfg.label)
      .addClass('tuning-label')
      .parent(row);

    const valueSpan =
      createSpan(cfg.value)
        .addClass('tuning-value')
        .parent(row);

    const slider =
      createSlider(
        cfg.min,
        cfg.max,
        cfg.value,
        cfg.step
      )
        .parent(row);

    cfg.valueSpan = valueSpan;
    cfg.slider = slider;

    slider.input(() => {
      cfg.value = slider.value();
      valueSpan.html(cfg.value);

      if (cfg === AudioMotionTuning.drawSpeedMmPerSec) {
        axi.setSpeed(cfg.value);
      }
    });
  });
}



////
//// audio connection
////

function connectAudio() {
  const deviceId =
    audioDeviceSelect.value();

  const device =
    audioDevices.find(
      d => d.deviceId === deviceId
    );

  const label =
    device
      ? (device.label || 'Unnamed input')
      : 'default input';


  audioStatusP.html(
    'Audio: connecting...'
  );


  dd = new DeeDeeLib();

  dd.onBeat(() => {
    lastBeatAt = millis();

    // B MODE:
    // beat controls pen up/down
    if (appState === AppState.BEAT_DRAWING) {
      const now = millis();

      if (
        now - lastBeatPenTriggerAt >=
        AudioMotionTuning.bBeatMinIntervalMs.value
      ) {
        lastBeatPenTriggerAt = now;
        triggerBeatPen();
      }

      return;
    }

    // D MODE:
    // ORIGINAL beat -> X movement
    if (appState === AppState.DRAWING) {
      const {
        beatKickMm,
        xMaxMm
      } = AudioMotionTuning;

      audioXOffset =
        constrain(
          audioXOffset + beatKickMm.value,
          -xMaxMm.value,
          xMaxMm.value
        );
    }
  });

  dd.connect(deviceId)
    .then(() => {
      audioConnected = true;

      audioStatusP.html(
        `Audio: connected (${label})`
      );
    })
    .catch(err => {
      console.error(err);

      audioStatusP.html(
        'Audio: connection failed'
      );
    });
}