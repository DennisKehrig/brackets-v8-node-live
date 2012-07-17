var ws = require("ws");
var net = require("net");
var childProcess = require("child_process");

var DEBUG = true;

var BLACK = 30, RED = 31, GREEN = 32, YELLOW = 33, BLUE = 34, MAGENTA = 35, CYAN = 36, WHITE = 37;
function debugLog(color) {
	if (!DEBUG) return;
	function col(code) {
		return '\033[' + (code ? code : 0) + 'm';
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

var ParserStatus = { 
	waitingForContentSize: 0, 
	reading: 1
};

function Client(options) {
	//todo: make configurable
	this.file = "/Users/jpkraemer/Documents/Projects/RealTimeIDE/Source/Sample/1/sample.js"; 

	if (!options)
	{
		//we have to create our own node debugger - good thing about it is we can restart it 
		this.startChildProcess();
	} else { 
		this.setupSocket(options); 
	}

	this.dataParserStatus = ParserStatus.waitingForContentSize;
}

// Client methods
Client.prototype = {
	setFile: function (filePath) {
		this.file = filePath; 
	},

	restart: function () { 
		if (!this.nodeProcess)
		{
			//we do not manage the node process and cannot restart 
			return;
		}

		this.killChildProcess(); 
		this.startChildProcess();
	},

	setupSocket: function (options) {
		try {
			this.socket = net.connect(options);
		}
		catch (e) { 
			debugLog(RED, e.toString);
		}
		this.socket.on("connect", this.onConnect.bind(this));
		this.socket.on("data", this.onData.bind(this));
		this.socket.on("close", this.onClose.bind(this));

		if (this.bufferedMessages){
			for (var i = 0; i < this.bufferedMessages.length; i++) {
				this.socket.write(this.bufferedMessages[i]); 
			}

			this.bufferedMessages = [];
		}
	},

	killChildProcess: function () { 
		console.log('Killing Child Process');
		if (this.socket !== undefined) {
			this.socket.destroy(); 
			this.socket = undefined; 
		}
	
		this.nodeProcess.kill('SIGKILL');
	}, 

	startChildProcess: function () {
		this.nodeProcess = childProcess.spawn("node", [ "--debug-brk", this.file ], { stdio: 'inherit' });
		var options = { port: 5858 };
		this.bufferedMessages = [];
		setTimeout(this.setupSocket.bind(this,options), 700);
	},

	onConnect: function () {
		console.log("CONNECTED TO V8");
	},

	onData: function (buffer) {
		var message = buffer.toString();
		if (this.partialMessage) {
			message = this.partialMessage + message;
		}

		if (this.dataParserStatus == ParserStatus.waitingForContentSize){
			var regexpResults = /Content-Length: ([0-9]+)/.exec(message);	
			if (regexpResults === null){
				this.partialMessage = message;
				return;
			} else { 
				this.currentMessageSize = regexpResults[1];
				this.dataParserStatus = ParserStatus.reading; 
				message = message.slice(regexpResults.index);
			}
		}

		if (this.dataParserStatus == ParserStatus.reading){
			if (Buffer.byteLength(message.substr(message.indexOf("{"))) < this.currentMessageSize){
				this.partialMessage = message;
			} else {
				var aBuffer = new Buffer(message.substr(message.indexOf("{")));
				this.handleMessage(aBuffer.slice(0,this.currentMessageSize).toString());
				this.partialMessage = aBuffer.slice(this.currentMessageSize).toString();
				this.dataParserStatus = ParserStatus.waitingForContentSize;
			}
		}
	},

	onClose: function () {
		console.log("DISCONNECTED FROM V8");
		this.socket = undefined;
	},

	close: function () {
		this.socket.destroy();
	},

	send: function (message) {
		if (!this.socket)
		{
			//buffer messages 
			this.bufferedMessages.push("Content-Length: " + Buffer.byteLength(message) + "\r\n\r\n"); 
			this.bufferedMessages.push(message);
		} else { 
			this.socket.write("Content-Length: " + Buffer.byteLength(message) + "\r\n\r\n");
			this.socket.write(message);
		}
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
		var startOfJSON = data.indexOf("{");
		try {
			r = JSON.parse(data.substr(startOfJSON));
		} catch (e) {
			debugLog(YELLOW, "error: " + e + " parsing string:" + data);
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
			var done = function () {
				debugLog(GREEN, message, r);
				self.server.send(JSON.stringify(r));
			};
			var self = this;
			if (typeof r.then === "function") {
				r.then(done);
			} else {
				done();
			}
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
		switch (message.event) {
			case "break":
				return { method: "Debugger.paused", params: { reason: "other", data: message.body } };
		}

	},

	translateRequest: function (message) {
		var make = function (command, args) {
			return { seq: message.id, type: "request", command: command, arguments: args };
		};
		
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
			return make("evaluate", { expression: message.params.expression, disable_break:false });
		case "Debugger.setScriptSource":
			var source = message.params.scriptSource;
			source = "(function (exports, require, module, __filename, __dirname) { " + source + " });";
			return make("changelive", { script_id: message.params.scriptId, new_source: source });
		case "Debugger.setBreakpoint":
			return make("setbreakpoint", {	type:	"scriptId",
											target:	message.params.location.scriptId,
											line:	message.params.location.lineNumber,
											column:	message.params.location.columnNumber });
		//Special cases that are not bridged but handled here
		case "V8.restart": 
			this.client.restart();
			return;
		case "V8.setFile": 
			this.client.setFile(message.params.filePath);
			break;
		default: 
			if (message.method.substr(0, 3) === "V8.") {
				return make(message.method.substr(3), message.params);
			}
		// todo: more events!
		}
	},

	loadScripts: function () {
		
	}
};

var server = new Server({ port: 8080 });
server.configureSession = function (session) {
	if (process.argv[2] == "manageDebugger") {
		session.client = new Client (); 
	} else {
		session.client = new Client({ port: 5858 });
	}
	session.bridge = new Bridge(session);
};
