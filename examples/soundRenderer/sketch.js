const MAX_X_MM = 400;
const MAX_Y_MM = 400;
const MOVE_THRESHOLD_MM = 1;

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