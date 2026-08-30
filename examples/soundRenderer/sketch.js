const MAX_X_MM = 400;
const MAX_Y_MM = 400;
const MOVE_THRESHOLD_MM = 1;
const BEAT_FLASH_MS = 150;

// All the pitch/beat -> movement mapping knobs, live-tunable from the
// slider panel built in setupAudioTuningUI(). `value` is just each
// slider's starting point; read the current value at AudioMotionTuning.<key>.value.
const AudioMotionTuning = {
  yAmplitudeMm: {
    value: 60, min: 0, max: 150, step: 1,
    label: 'Pitch Y amplitude (mm)', // how far up/down a pitch of 0/1 pushes the pen, from paperStartPos.y
  },
  sampleIntervalMs: {
    value: 250, min: 50, max: 1000, step: 10,
    // How often we sample dd.pitch for a new move. audioPenMoving still
    // guards against ever queueing a move on top of one still in flight,
    // regardless of how low this is set.
    label: 'Sample interval (ms)',
  },
  beatKickMm: {
    value: 30, min: 0, max: 100, step: 1,
    label: 'Beat X kick (mm)', // how far sideways each beat kicks the pen, from paperStartPos.x
  },
  xMaxMm: {
    value: 60, min: 0, max: 150, step: 1,
    label: 'Beat X max offset (mm)', // caps total sideways offset so fast beats can't push it off the paper
  },
  xRecenterDecay: {
    value: 0.8, min: 0, max: 0.99, step: 0.01,
    label: 'X recenter decay', // per-sample pull back toward 0; smaller = snappier, closer to 1 = lazier
  },
};

const AppState = Object.freeze({
  NOT_CONNECTED: "not_connected",
  CONNECTED: "connected",
  READY: "ready",
  DRAWING: "drawing",
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

////
//// 
// p5
////
////

function setup(){
  createCanvas(400, 400);

  textAlign(CENTER);
  ellipseMode(CENTER);

  fill(0);

  lastPos = createVector(0, 0);
  paperStartPos = createVector(200,200);

  setupAudioUI();
  setupAudioTuningUI();
}

function draw(){
  switch(appState){
    case AppState.DRAWING:
      updateAudioPenMotion();
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

function mousePressed(){

}

function mouseReleased(){
  switch(appState){
    case AppState.CONNECTED:
      break;
    case AppState.NOT_CONNECTED:
      connectAxi();
      break;
  }
}

function keyPressed(){

}

function keyReleased(){
  switch(appState){
    case AppState.READY:
      if(key==='d'){
        startDrawing();
      }
      break;
    case AppState.DRAWING:
      if(key==='d'){
        preparePen();
      }
      break;
    default:
      break;
  }
}

////
////
// draw
////
////

function drawConnected(){
  background(255,255,0,255);
  text("["+getSimulatorString()+"] CONNECTED\nPreparing pen", width/2,20);
}

function drawDisconnected(){
  background(255,0,0,2550);
  text("["+getSimulatorString()+"] DISCONNECTED\nClick to connect", width/2,20);
}

function drawReady(){
  background(255,255,255,255);
  drawPen();
}

function drawPen(){
  push();
  if(penIsDown){
    stroke(0,255,0,255);
    fill(0,255,0,255);
  }else{
    stroke(255,0,0,255);
    noFill();
  }
  ellipse(lastScreenPenPos.x, lastScreenPenPos.y, 10,10);
  pop();
}

// Small live meters in the bottom-left corner, just to confirm audio is
// actually flowing into DeeDeeLib once an input is connected: energy,
// pitch, and a brief flash whenever a 'beat' event fires.
function drawAudioMeter(){
  if(!audioConnected || !dd) return;
  push();
  noStroke();

  fill(0,150,255);
  const energyHeight = dd.energy * 200;
  rect(10, height - 10 - energyHeight, 20, energyHeight);

  fill(255,150,0);
  const pitchHeight = dd.pitch * 200;
  rect(40, height - 10 - pitchHeight, 20, pitchHeight);

  if(millis() - lastBeatAt < BEAT_FLASH_MS){
    fill(255,0,150);
    rect(70, height - 30, 20, 20);
  }

  pop();
}

////
////
// utils
////
////

function isSimulator(){
  return window.AXIDRAW_SIMULATED;
}

function getSimulatorString(){
  return isSimulator?"SIM":"DEVICE";
}

function screenToPaper(x, y){
  return createVector(
    map(x, 0, width, 0, MAX_X_MM),
    map(y, 0, height, 0, MAX_Y_MM)
  );
}

function paperToScreen(x,y){
  return createVector(
    map(x, 0, MAX_X_MM, 0, width),
    map(y, 0, MAX_Y_MM, 0, height)
  );
}

////
////
// axi
////
////

function connectAxi(){
  axi.connect().then(() => {
      appState = AppState.CONNECTED;
      console.log("CONNECTED");
      preparePen();
    });
}

////
// position the pen over the start position on the border of the speaker
// notice the pen is up/not drawing
////
function preparePen(){
  axi.penUp();
  penIsDown = false;
  axi.moveTo(paperStartPos.x, paperStartPos.y)
    .then(()=>{
      appState = AppState.READY;
      lastScreenPenPos = paperToScreen(paperStartPos.x, paperStartPos.y);
      console.log("READY");
    });
}

function startDrawing(){
  axi.penDown();
  penIsDown = true;
  appState = AppState.DRAWING;
  console.log("DRAWING");
}

////
////
// audio (DeeDeeLib)
////
////

function setupAudioUI(){
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

// Browsers only report input device labels/ids once mic permission has
// been granted, so this makes a throwaway getUserMedia call just to
// unlock them, then lists the real devices for the dropdown.
async function enableMicrophone(){
  audioStatusP.html('Audio: requesting microphone permission...');
  try {
    const tempStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    tempStream.getTracks().forEach(track => track.stop());

    audioDevices = await DeeDeeLib.listInputDevices();

    audioDeviceSelect.html('');
    audioDevices.forEach((device, i) => {
      audioDeviceSelect.option(device.label || `Input ${i + 1}`, device.deviceId);
    });
    audioDeviceSelect.removeAttribute('disabled');
    audioConnectButton.removeAttribute('disabled');

    audioStatusP.html('Audio: choose an input and click Connect');
  } catch (err) {
    console.error(err);
    audioStatusP.html('Audio: microphone permission denied');
  }
}

// Called every frame while appState is DRAWING. Samples dd.pitch on an
// interval and nudges the pen up/down around paperStartPos.y to match it,
// while audioXOffset (kicked sideways by onBeat, decayed back toward 0
// here) pulls it back and forth on X. Both offsets stack on top of the
// same paperStartPos center, so the pen is always "attracted" back to it.
// audioPenMoving guards against sending a new moveTo before AxiDraw has
// finished the previous one, so the command queue can't run away from us
// no matter how low AudioMotionTuning.sampleIntervalMs is set.
function updateAudioPenMotion(){
  if(!audioConnected || !dd) return;
  if(audioPenMoving) return;
  if(millis() - lastAudioSampleAt < AudioMotionTuning.sampleIntervalMs.value) return;

  lastAudioSampleAt = millis();

  audioXOffset *= AudioMotionTuning.xRecenterDecay.value;

  const yAmplitudeMm = AudioMotionTuning.yAmplitudeMm.value;
  const targetX = constrain(paperStartPos.x + audioXOffset, 0, MAX_X_MM);
  const targetY = constrain(
    paperStartPos.y + map(dd.pitch, 0, 1, -yAmplitudeMm, yAmplitudeMm),
    0, MAX_Y_MM
  );

  audioPenMoving = true;
  axi.moveTo(targetX, targetY)
    .then(() => {
      audioPenMoving = false;
    });

  // Reflect the new target on screen right away; the physical pen catches
  // up asynchronously, same as the axi.moveTo() call above.
  lastScreenPenPos = paperToScreen(targetX, targetY);
}

// Builds one labeled slider per AudioMotionTuning entry, wired to update
// that entry's `.value` (and its own readout) live as it's dragged.
function setupAudioTuningUI(){
  const panel = createDiv().id('audio-tuning-panel');
  createElement('h4', 'Motion tuning').parent(panel);

  Object.values(AudioMotionTuning).forEach(cfg => {
    const row = createDiv().addClass('tuning-row').parent(panel);
    createSpan(cfg.label).addClass('tuning-label').parent(row);
    const valueSpan = createSpan(cfg.value).addClass('tuning-value').parent(row);
    const slider = createSlider(cfg.min, cfg.max, cfg.value, cfg.step).parent(row);

    slider.input(() => {
      cfg.value = slider.value();
      valueSpan.html(cfg.value);
    });
  });
}

function connectAudio(){
  const deviceId = audioDeviceSelect.value();
  const device = audioDevices.find(d => d.deviceId === deviceId);
  const label = device ? (device.label || 'Unnamed input') : 'default input';

  audioStatusP.html('Audio: connecting...');

  dd = new DeeDeeLib();
  dd.onBeat(() => {
    lastBeatAt = millis();
    const { beatKickMm, xMaxMm } = AudioMotionTuning;
    audioXOffset = constrain(audioXOffset + beatKickMm.value, -xMaxMm.value, xMaxMm.value);
  });
  dd.connect(deviceId)
    .then(() => {
      audioConnected = true;
      audioStatusP.html(`Audio: connected (${label})`);
    })
    .catch(err => {
      console.error(err);
      audioStatusP.html('Audio: connection failed');
    });
}