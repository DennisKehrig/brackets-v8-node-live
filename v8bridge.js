var ws = require("ws");
var net = require("net");


// Client (V8 Socket Connection)
function Client(options) {
	this.socket = net.connect(options);
	this.socket.on("connect", this.onConnect.bind(this));
	this.socket.on("data", this.onData.bind(this));
	this.socket.on("close", this.onClose.bind(this));
}

// Client methods
Client.prototype = {
	onConnect: function () {
		console.log("CONNECTED TO V8");
	},

	onData: function (buffer) {
		var message = buffer.toString();
		this.handleMessage(message);
	},

	onClose: function () {
		console.log("DISCONNECTED FROM V8");
	},

	send: function (message) {
		this.socket.write("Content-Length: " + Buffer.byteLength(message) + "\r\n\r\n");
		this.socket.write(message);
	},

	handleMessage: function (message) {}
};


// Server (WebSocket)
function Server(options) {
	this.wss = new ws.Server(options);
	this.wss.on("connection", this.onConnect.bind(this));
}

Server.prototype = {
	onConnect: function (socket) {
		socket.on("message", this.onMessage.bind(this, socket));
		socket.on("close", this.onClose.bind(this, socket));
	},

	onMessage: function (socket, message) {
		function sendResponse(response) {
			socket.send(response);
		}
		var response = this.handleMessage(message);
		if (response !== undefined) {
			if (response && typeof response.then === "function") {
				response.then(sendResponse);
			} else {
				sendResponse(response);
			}
		}
	},

	onClose: function (socket) {
	},

	send: function (message) {
		for (var i in this.wss.clients) {
			this.wss.clients[i].send(message);
		}
	},

	handleMessage: function (message) {}
};

// Bridge between Server and Client
function Bridge(server, client) {
	this.server = server;
	this.client = client;

	this.translateResponseOrEvent = this.translateResponseOrEvent.bind(this);
	this.translateCommand = this.translateCommand.bind(this);

	this.server.handleMessage = this.forward.bind(this, this.client, this.translateCommand);
	this.client.handleMessage = this.forward.bind(this, this.server, this.translateResponseOrEvent);
}

Bridge.prototype = {
	makeRequest: function (seq, command, args) {
		var req = { seq: seq, type: "request", command: command };
		var length = 0;
		for (var i in args) {
			if (args[i] === undefined || args[i] === null) delete args[i];
			else length++;
		}
		if (length > 0) req.arguments = args;
		return req;
	},

	makeResponse: function (seq, result) {
		var res = { id: seq };
		if (result !== undefined) res.result = result;
		return res;
	},

	forward: function (receiver, translator, data) {
		var inc, out;
		try {
			inc = JSON.parse(data);
		} catch (e) {
			return;
		}
		out = JSON.stringify(translator(inc));
		if (out) {
			console.log("<<", inc);
			console.log(">>", out);
			receiver.send(out);
		}
	},

	translateResponse: function (message) {
		var make = this.makeResponse.bind(this, message.request_seq);
		switch (message.command) {
			case "evaluate":
				return make({ result: message.body });
		}
	},

	translateEvent: function (message) {

	},

	translateResponseOrEvent: function (message) {
		switch (message.type) {
		case "event":
			return this.translateEvent(message);
		case "response":
			return this.translateResponse(message);
		default:
			throw "Invalid message type: " + message.type;
		}
	},

	translateCommand: function(message) {
		var make = this.makeRequest.bind(this, message.id);
		switch (message.method) {
		case "Debugger.resume":
			return make("continue");
		case "Debugger.stepOver":
			return make("continue", { stepaction: "next" });
		case "Debugger.stepInto":
			return make("continue", { stepaction: "in" });
		case "Debugger.stepOut":
			return make("continue", { stepaction: "out" });
		case "Debugger.pause":
			return make("suspend");
		case "Runtime.evaluate":
			return make("evaluate", { expression: message.params.expression });
		}
	}
};


var client = new Client({ port: 5858 });
var server = new Server({ port: 8080 });
var bridge = new Bridge(server, client);
