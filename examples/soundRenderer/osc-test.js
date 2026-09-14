const osc = require("osc");

const udpPort = new osc.UDPPort({
    localAddress: "0.0.0.0",
    localPort: 9000,
    metadata: true,
});

udpPort.on("ready", () => {
    console.log("Listening for OSC on port 9000");
});

udpPort.on("message", (message) => {
    console.log(
        "OSC RECEIVED:",
        message.address,
        message.args
    );
});

udpPort.open();