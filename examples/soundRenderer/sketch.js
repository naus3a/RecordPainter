const MAX_X_MM = 430;
const MAX_Y_MM = 297;
const MOVE_THRESHOLD_MM = 1;
const BEAT_FLASH_MS = 150;

const PEN_SERVO_RATE_UP = 2000;
const PEN_SERVO_RATE_DOWN = 2000;
// ============================================================
// ONLY CHANGE THESE TWO VALUES WHEN THE PHYSICAL SETUP MOVES
// ============================================================

const DRAW_START_X = 147;
const DRAW_START_Y = 125;
const PARK_Y_MM = 5;

// ============================================================
// FIXED RECORD GEOMETRY
// ============================================================

const LABEL_RADIUS_MM = 45;
const SAFE_Y_HALF_RANGE_MM = 20;

// Everything below is derived automatically.
const SAFE_Y_MIN = DRAW_START_Y - SAFE_Y_HALF_RANGE_MM;
const SAFE_Y_MAX = DRAW_START_Y + SAFE_Y_HALF_RANGE_MM;

const LABEL_CENTER_X = DRAW_START_X;
const LABEL_CENTER_Y =
  DRAW_START_Y + (LABEL_RADIUS_MM - SAFE_Y_HALF_RANGE_MM);

// ============================================================
// BEAT PARAMS
// ============================================================

const BEAT_PEN_MIN_MS = 40;
const BEAT_PEN_MAX_MS = 180;
const BEAT_ENERGY_MAX = 0.20;

// B-mode calibration
const BEAT_Y_STEP_MM = 0.2;

let lastBeatPenTriggerAt = -Infinity;
let beatCurrentY = DRAW_START_Y;
let beatShiftMoving = false;  


let beatPenDown = false;
let beatPenReleaseAt = 0;
// All pitch/beat -> movement mapping parameters.
// Values are live-tunable from the browser sliders.

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
    max: SAFE_Y_HALF_RANGE_MM,
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
    min: 1,
    max: LABEL_CENTER_Y - DRAW_START_Y,
    step: 0.5,
    label: 'B max Y travel (mm)',
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



////
//// p5
////

function setup() {
  createCanvas(400, 400);

  textAlign(CENTER);
  ellipseMode(CENTER);
  fill(0);

  lastPos = createVector(0, 0);

  paperStartPos = createVector(
    DRAW_START_X,
    DRAW_START_Y
  );

  setupAudioUI();
  setupAudioTuningUI();
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
    map(x, 0, width, 0, MAX_X_MM),
    map(y, 0, height, 0, MAX_Y_MM)
  );
}


function paperToScreen(x, y) {
  return createVector(
    map(x, 0, MAX_X_MM, 0, width),
    map(y, 0, MAX_Y_MM, 0, height)
  );
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
    PEN_SERVO_RATE_UP
  );

  await axi.ebb.stepperAndServoModeConfigure(
    12,
    PEN_SERVO_RATE_DOWN
  );

  console.log("PEN SERVO SPEED CONFIGURED");
}


function fastPenDown() {
  return axi.ebb.setPenState(true);
}


function fastPenUp() {
  return axi.ebb.setPenState(false);
}

// Move to drawing start with pen up.

async function preparePen() {
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

  appState = AppState.READY;

  console.log("READY");
}


function startDrawing() {
  axi.penDown();

  penIsDown = true;
  appState = AppState.DRAWING;

  console.log("DRAWING");
}

async function stopDrawing() {
  // Stop sending new audio movements.
  appState = AppState.CONNECTED;

  // Finish the movement already in progress.
  while (audioPenMoving) {
    await new Promise(resolve => setTimeout(resolve, 10));
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

  beatCurrentY = DRAW_START_Y;
  beatShiftMoving = false;
  lastBeatPenTriggerAt = -Infinity;

  audioXOffset = 0;
  beatPenDown = false;
  beatPenReleaseAt = 0;
  beatShiftMoving = false;

  await fastPenUp();

  beatCurrentY = DRAW_START_Y;

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

    beatCurrentY = Math.min(
      beatCurrentY + BEAT_Y_STEP_MM,
      DRAW_START_Y +
      AudioMotionTuning.beatYMaxTravelMm.value
    );

    await axi.moveTo(
      DRAW_START_X,
      beatCurrentY
    );

    lastScreenPenPos = paperToScreen(
      DRAW_START_X,
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

    // Direct servo command: DOWN.
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
    DRAW_START_X,
    PARK_Y_MM
  );

  lastScreenPenPos = paperToScreen(
    DRAW_START_X,
    PARK_Y_MM
  );

  audioXOffset = 0;

  console.log("PARKED");

  appState = AppState.READY;
}


async function returnToStart() {
  console.log("RETURNING TO START...");

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

  console.log("AT DRAW START");

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


  // -----------------------------------------
  // Y from pitch
  // -----------------------------------------

  const rawTargetY =
    paperStartPos.y +
    map(
      dd.pitch,
      0,
      1,
      -yAmplitudeMm,
      yAmplitudeMm
    );


  // Hard safety limit:
  // always stay +/-20 mm around DRAW_START_Y.

  const targetY =
    constrain(
      rawTargetY,
      SAFE_Y_MIN,
      SAFE_Y_MAX
    );


  // -----------------------------------------
  // X from beat
  // -----------------------------------------

  const rawTargetX =
    paperStartPos.x +
    audioXOffset;


  // -----------------------------------------
  // Circular label safety
  // -----------------------------------------

  const labelDy =
    targetY -
    LABEL_CENTER_Y;


  const maxXOffsetAtThisY =
    Math.sqrt(
      Math.max(
        0,
        LABEL_RADIUS_MM * LABEL_RADIUS_MM -
        labelDy * labelDy
      )
    );


  const safeXMin =
    Math.max(
      0,
      LABEL_CENTER_X - maxXOffsetAtThisY
    );


  const safeXMax =
    Math.min(
      MAX_X_MM,
      LABEL_CENTER_X + maxXOffsetAtThisY
    );


  const targetX =
    constrain(
      rawTargetX,
      safeXMin,
      safeXMax
    );


  // -----------------------------------------
  // Ignore tiny movements
  // -----------------------------------------

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