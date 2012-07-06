var ws = require("ws");
var net = require("net");

var DEBUG = true;

var RED = 1, GREEN = 2, YELLOW = 3, BLUE = 4, MAGENTA = 5, CYAN = 6;
function debugLog(color) {
	if (!DEBUG) return;
	function col(code) {
		return '\033[3' + (code ? code : 0) + 'm';
	}
	var args = Array.prototype.slice.call(arguments, 1);
	args.unshift(col(color));
	args.push(col());
	console.log.apply(console, args);
}

// Server Session
function ServerSession(socket) {
	this.socket = socket;
	this.socket.on("message", this.onMessage.bind(this));
	this.socket.on("close", this.onClose.bind(this));
}

ServerSession.prototype = {
	onMessage: function (message) {
		function sendResponse(response) {
			this.socket.send(response);
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

	onClose: function () {
		this.client.close();
	},

	send: function (message) {
		this.socket.send(message);
	},

	handleMessage: function (message) {}
};

// Server (WebSocket)
function Server(options) {
	this.wss = new ws.Server(options);
	this.wss.on("connection", this.onConnect.bind(this));
	this.sessions = [];
}

Server.prototype = {
	onConnect: function (socket) {
		var session = new ServerSession(socket);
		this.configureSession(session);
		socket.on("close", this.onClose.bind(this, session));
		this.sessions.push(session);
	},

	onClose: function (session) {
		for (var i in this.sessions) {
			if (session === this.sessions[i]) {
				delete this.sessions[i];
			}
		}
	},

	configureSession: function (session) {}
};

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

	close: function () {
		this.socket.destroy();
	},

	send: function (message) {
		this.socket.write("Content-Length: " + Buffer.byteLength(message) + "\r\n\r\n");
		this.socket.write(message);
	},

	handleMessage: function (message) {}
};


// Bridge between Server and Client
function Bridge(session) {
	this.server = session;
	this.client = session.client;

	this.server.handleMessage = this.serverToClient.bind(this);
	this.client.handleMessage = this.clientToServer.bind(this);

	this.loadScripts();
}

Bridge.prototype = {
	parse: function (data) {
		var r;
		try {
			r = JSON.parse(data);
		} catch (e) {
			// nothing
		}
		return r;
	},

	handlerForType: function (type) {
		switch (type) {
			case "event":
				return this.translateEvent;
			case "response":
				return this.translateResponse;
		}
	},

	// Brackets -> V8
	serverToClient: function (data) {
		var message = this.parse(data);
		if (!message) return;
		var r = this.translateRequest(message);
		if (r) {
			debugLog(RED, message, r);
			this.client.send(JSON.stringify(r));
		} else {
			debugLog(MAGENTA, message);
		}
	},

	// V8 -> Brackets
	clientToServer: function (data) {
		var message = this.parse(data);
		if (!message) return;
		var handler = this.handlerForType(message.type);
		var r = handler(message);
		if (r) {
			debugLog(GREEN, message, r);
			this.server.send(JSON.stringify(r));
		} else {
			debugLog(CYAN, message);
		}
	},

	translateResponse: function (message) {
		var make = function (result) {
			return { id: message.request_seq, result: result };
		};
		switch (message.command) {
			case "evaluate":
				return make({ result: message.body });
			default:
				return make(message.body);
		}
		// todo: forward error messages
	},

	translateEvent: function (message) {
		// todo
	},

	translateRequest: function (message) {
		var make = function (command, args) {
			return { seq: message.id, type: "request", command: command, arguments: args };
		};
		if (message.method.substr(0, 3) === "V8.") {
			return make(message.method.substr(3), message.params);
		}
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
		case "Debugger.setScriptSource":
			var source = message.params.scriptSource;
			source = "(function (exports, require, module, __filename, __dirname) { " + source + " });";
			return make("changelive", { script_id: message.params.scriptId, new_source: source });
		// todo: more events!
		}
	},

	loadScripts: function () {
		
	}
};


var server = new Server({ port: 8080 });
server.configureSession = function (session) {
	session.client = new Client({ port: 5858 });
	session.bridge = new Bridge(session);
};
