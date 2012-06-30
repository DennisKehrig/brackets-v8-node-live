/*
 * The MIT License (MIT)
 * Copyright (c) 2012 Dennis Kehrig. All rights reserved.
 *
 * Permission is hereby granted, free of charge, to any person obtaining a
 * copy of this software and associated documentation files (the "Software"),
 * to deal in the Software without restriction, including without limitation
 * the rights to use, copy, modify, merge, publish, distribute, sublicense,
 * and/or sell copies of the Software, and to permit persons to whom the
 * Software is furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
 * FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
 * DEALINGS IN THE SOFTWARE.
 *
 */


/*jslint vars: true, plusplus: true, devel: true, nomen: true, indent: 4, forin: true, maxerr: 50, regexp: true */
/*global require, module, exports */

/**
 * Node script that creates a WebSocket to V8's native sockets
 */
(function () {
	'use strict';

	var net				= require('net');

	var io				= require('node-inspector/node_modules/socket.io'),
		Client			= require('./Client');

	// Function to summarize function parameters
	var summarize		= require('./summarize');

	// Configuration
	var _bridgePort			= 3858;
	var _debuggerPort		= 5858;
	var _reconnectInterval	= 1000;

	// State
	var _nextCallId			= 0;
	var _reconnecting		= false;
	// Web Socket
	var _bridge;
	// Client (Brackets)
	var _editor;
	// V8 debugger
	var _debugger;


	// Called at the end of the script
	function init() {
		_startBridge(_bridgePort);
	}



	// Start a socket.io server
	function _startBridge(port) {
		_bridge = io.listen(port);
		_bridge.set('log level', 1);
		_bridge.sockets.on('connection', _onEditorConnect);
	}


	// Called when somebody connects to the bridge socket
	function _onEditorConnect(editor) {
		console.log("Editor connected");

		// Called when a potential old editor was disconnected (i.e. multiple instances of Brackets are not supported)
		var next = function () {
			_setupEditor(editor);
			_connectDebugger();
		};

		if (_editor) {
			// Cleanup
			console.log("Disconnecting previous editor");
			_editor.on("disconnect", next);
			_editor.disconnect();
		} else {
			next();
		}
	}

	function _setupEditor(editor) {
		_editor = editor;
		_editor.on("call", _onEditorCall);
		_editor.on("disconnect", _onEditorDisconnect);
	}

	function _onEditorDisconnect() {
		console.log("Editor disconnected");
		_editor = null;
		_reconnecting = false;

		_disconnectDebugger();
	}

	function _onEditorCall(messageName, messageArgs, callbackId) {
		if (! _debugger) {
			return;
		}
		
		var callId = _nextCallId++;
		var prefix = "[" + callId + "] ";
		var call = "_debugger." + messageName + "(" + messageArgs.map(summarize).join(", ") + ")";
		console.log(prefix + "Calling " + call + ", replying to " + callbackId);

		messageArgs.push(function () {
			var args = Array.prototype.slice.call(arguments);
			console.log(prefix + "Got back " + args.map(summarize).join(", "));
			if (_editor && callbackId !== null && typeof callbackId !== 'undefined') {
				console.log(prefix + "Notifying callback " + callbackId);
				_editor.emit('callback', callbackId, args);
			}
		});
		
		_debugger[messageName].apply(_debugger, messageArgs);
	}

	function _disconnectEditor() {
		if (_editor) {
			console.log("Disconnecting from editor");
			_editor.disconnect();
		}
	}

	function _connectDebugger() {
		if (_debugger) {
			return;
		}
		
		_debugger = new Client();

		var didConnect = false;
		_debugger.on("connect", function () {
			console.log("Connected to debugger");
			didConnect = true;
			_onDebuggerConnect();
		});

		_debugger.on("close", function () {
			console.log("Disconnected from debugger");
			_debugger = null;
			_onDebuggerDisconnect();
		});
		
		_debugger.on("error", function (error) {
			console.log("Debugger sent error");
			if (didConnect) {
				_onDebuggerError(error);
			}
		});
		
		console.log("Connecting to debugger on port 5858");
		_debugger.connect(5858);
	}

	function _reconnectDebugger() {
		// Turned off when the debugger connects or when the editor disconnects
		_reconnecting = true;

		var reconnect = function () {
			console.log("Reconnecting to the debugger");
			_connectDebugger();
			setTimeout(function () {
				if (! _reconnecting) {
					return;
				}
				reconnect();
			}, _reconnectInterval);
		};
		setTimeout(reconnect, _reconnectInterval);
	}

	function _disconnectDebugger() {
		if (_debugger) {
			console.log("Disconnecting from debugger");
			_debugger.disconnect();
		}
	}

	function _onDebuggerConnect() {
		_reconnecting = false;
		if (_editor) {
			console.log("Telling editor we're connected to the debugger");
			_editor.emit('debuggerConnect');
		}
	}

	function _onDebuggerError(error) {
		if (_editor) {
			console.log("Telling editor about the error");
			_editor.emit("debuggerError", error);
		}
	}

	function _onDebuggerDisconnect() {
		if (_editor && ! _reconnecting) {
			console.log("Telling editor we're no longer connected to the debugger");
			_editor.emit('debuggerDisconnect');
			_reconnectDebugger();
		}
	}


	init();
}());