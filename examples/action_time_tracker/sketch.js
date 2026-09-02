// --------------------------------------------------
// AxiDraw timing experiments
// --------------------------------------------------

const axi = new axidraw.AxiDraw();

let connected = false;
let running = false;


// ==================================================
// EXPERIMENT SETTINGS
// ==================================================

// Choose:
//
// "LINE"
// "PEN_CYCLE"

const EXPERIMENT = "PEN_CYCLE";


// Reference duration:
// ~one revolution at 33⅓ RPM

const TEST_DURATION_SEC = 18;


// Used only by LINE experiment

const DRAW_SPEED_MM_S = 10;


// Safety limit for linear movement

const MAX_DISTANCE_MM = 40;


// ==================================================
// Results
// ==================================================

let resultText = "";


// --------------------------------------------------
// Setup
// --------------------------------------------------

function setup() {

  createCanvas(400, 400);

  textAlign(CENTER, CENTER);
  textSize(16);

}


// --------------------------------------------------
// Click
//
// First click  = connect
// Later clicks = run selected experiment
// --------------------------------------------------

function mouseClicked() {

  if (!connected) {

    axi.connect().then(() => {

      connected = true;

      console.log("AxiDraw connected");

    });

    return;
  }


  if (!running) {

    runExperiment();

  }

}


// --------------------------------------------------
// Experiment selector
// --------------------------------------------------

async function runExperiment() {

  if (EXPERIMENT === "LINE") {

    await runLineExperiment();

  }


  if (EXPERIMENT === "PEN_CYCLE") {

    await runPenCycleExperiment();

  }

}


// ==================================================
// EXPERIMENT 1
//
// Continuous Y line
// for specified duration
// ==================================================

async function runLineExperiment() {

  running = true;

  resultText = "";


  const commandedDistance =
    DRAW_SPEED_MM_S *
    TEST_DURATION_SEC;


  if (
    commandedDistance >
    MAX_DISTANCE_MM
  ) {

    console.error(
      `Requested distance ${commandedDistance.toFixed(1)} mm ` +
      `exceeds safety limit of ${MAX_DISTANCE_MM} mm.`
    );

    resultText =
      "Distance exceeds safety limit";

    running = false;

    return;
  }


  console.log("-----------------------");
  console.log("LINE EXPERIMENT");

  console.log(
    `Target time: ${TEST_DURATION_SEC} s`
  );

  console.log(
    `Speed: ${DRAW_SPEED_MM_S} mm/s`
  );

  console.log(
    `Distance: ${commandedDistance.toFixed(2)} mm`
  );


  axi.setSpeed(
    DRAW_SPEED_MM_S
  );


  // Pen-down delay happens BEFORE
  // timed drawing interval.

  await axi.penDown();


  const start =
    performance.now();


  await axi.moveTo(
    0,
    commandedDistance
  );


  const elapsed =
    (
      performance.now() -
      start
    ) / 1000;


  await axi.penUp();


  console.log(
    `Actual movement time: ${elapsed.toFixed(3)} s`
  );


  resultText =
    `${commandedDistance.toFixed(1)} mm in ${elapsed.toFixed(3)} s`;


  running = false;

}


// ==================================================
// EXPERIMENT 2
//
// Pen down / pen up only.
//
// No XY movement.
//
// Timer STARTS immediately before
// the first pen-down command.
//
// Existing internal AxiDraw library
// delays are left untouched.
// ==================================================

async function runPenCycleExperiment() {

  running = true;

  resultText = "";


  const targetTimeMs =
    TEST_DURATION_SEC * 1000;


  console.log("-----------------------");
  console.log("PEN CYCLE EXPERIMENT");

  console.log(
    `Target time: ${TEST_DURATION_SEC} s`
  );


  // Make sure we start with the pen UP.
  //
  // This setup happens BEFORE timing starts.

  await axi.penUp();


  let transitionsExecuted = 0;
  let transitionsWithinWindow = 0;

  let penIsDown = false;


  // -----------------------------------------
  // TIMER START
  //
  // First thing measured is PEN DOWN.
  // -----------------------------------------

  const start =
    performance.now();


  while (true) {


    // Alternate:
    //
    // UP -> DOWN
    // DOWN -> UP

    if (!penIsDown) {

      await axi.penDown();

      penIsDown = true;

    } else {

      await axi.penUp();

      penIsDown = false;

    }


    transitionsExecuted++;


    const elapsed =
      performance.now() -
      start;


    // Only count a transition as fitting
    // inside the requested time window
    // if it COMPLETED before the deadline.

    if (
      elapsed <= targetTimeMs
    ) {

      transitionsWithinWindow++;

    }


    console.log(
      `Transition ${transitionsExecuted} completed at ` +
      `${(elapsed / 1000).toFixed(3)} s`
    );


    // Stop once a completed operation
    // has crossed the target duration.

    if (
      elapsed >= targetTimeMs
    ) {

      break;

    }

  }


  const actualElapsed =
    (
      performance.now() -
      start
    ) / 1000;


  // Safety cleanup:
  // leave the physical pen UP.
  //
  // This happens AFTER measurement.

  if (penIsDown) {

    await axi.penUp();

  }


  console.log(
    `Transitions completed inside ${TEST_DURATION_SEC}s: ` +
    transitionsWithinWindow
  );


  console.log(
    `Total transitions physically executed: ` +
    transitionsExecuted
  );


  console.log(
    `Measured sequence ended at: ` +
    `${actualElapsed.toFixed(3)} s`
  );


  console.log("-----------------------");


  resultText =
    `${transitionsWithinWindow} transitions fit inside ${TEST_DURATION_SEC}s`;


  running = false;

}


// --------------------------------------------------
// Display
// --------------------------------------------------

function draw() {


  // ---------------------------
  // Not connected
  // ---------------------------

  if (!connected) {

    background(255, 0, 0);

    fill(0);

    text(
      "Click to Connect",
      width / 2,
      height / 2
    );

    return;

  }


  // ---------------------------
  // Running
  // ---------------------------

  if (running) {

    background(255, 200, 0);

    fill(0);

    text(
      `${EXPERIMENT}

Running...

Target time:
${TEST_DURATION_SEC} s`,
      width / 2,
      height / 2
    );

    return;

  }


  // ---------------------------
  // Ready
  // ---------------------------

  background(0, 255, 0);

  fill(0);


  if (EXPERIMENT === "LINE") {

    const distance =
      DRAW_SPEED_MM_S *
      TEST_DURATION_SEC;


    text(
      `EXPERIMENT: LINE

Click to run

Time: ${TEST_DURATION_SEC} s
Speed: ${DRAW_SPEED_MM_S} mm/s
Distance: ${distance.toFixed(1)} mm

${resultText}`,
      width / 2,
      height / 2
    );

  }


  if (EXPERIMENT === "PEN_CYCLE") {

    text(
      `EXPERIMENT: PEN CYCLE

Click to run

Time: ${TEST_DURATION_SEC} s
XY movement: none
XY speed: N/A

${resultText}`,
      width / 2,
      height / 2
    );

  }

}