const osc = require("osc");
const { WebSocketServer } = require("ws");


// OSC from iPhone
const udpPort = new osc.UDPPort({
    localAddress: "0.0.0.0",
    localPort: 9000,
    metadata: true,
});


// WebSocket to browser
const wss = new WebSocketServer({
    port: 8081,
});

wss.on("connection", () => {
    console.log("BROWSER CONNECTED");
});


udpPort.on("ready", () => {
    console.log("OSC listening on port 9000");
    console.log("WebSocket listening on port 8081");
});


udpPort.on("message", (message) => {
    console.log(
        "OSC RECEIVED:",
        message.address,
        message.args
    );

    const data = JSON.stringify({
        address: message.address,
        args: message.args,
    });

    wss.clients.forEach(client => {
        if (client.readyState === 1) {
            client.send(data);
        }
    });
});


udpPort.open();