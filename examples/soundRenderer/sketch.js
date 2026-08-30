const MAX_X_MM = 400;
const MAX_Y_MM = 400;
const MOVE_THRESHOLD_MM = 1;
const BEAT_FLASH_MS = 150;

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
}

function draw(){
  switch(appState){
    case AppState.READY:
    case AppState.DRAWING:
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

function connectAudio(){
  const deviceId = audioDeviceSelect.value();
  const device = audioDevices.find(d => d.deviceId === deviceId);
  const label = device ? (device.label || 'Unnamed input') : 'default input';

  audioStatusP.html('Audio: connecting...');

  dd = new DeeDeeLib();
  dd.onBeat(() => {
    lastBeatAt = millis();
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