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
/*global define, brackets, $, less, io, window */


/**
 * main integrates V8 LiveDevelopment into Brackets
 *
 * This module creates a "V8" toolbar button.
 *
 * There are four different states:
 * - Disconnected (white):  No connection to the socket bridge
 * - Connected (red):       Connected to the socket bridge, but no V8 debugger found
 * - Bridged (yellow):      Socket bridge is connected to a V8 debugger
 * - Live (green):          Current open file is run by V8
 *
 * @require DocumentManager
 */
define(function main(require, exports, module) {
	"use strict";


	// --- Required modules ---

	// Document Manager
	var DocumentManager     = brackets.getModule("document/DocumentManager");
	// Debugger class, implements an API by communicating with the socket bridge
	var Debugger            = require("./Debugger");

	
	// --- Settings ---
	
	// This directory
	var _moduleDirectory    = require.toUrl("./").replace(/\.\/$/, "");
	// Path to socket.io.js
	var _pathSocketIoJs     = _extensionDirUrl() + "node_modules/socket.io-client/dist/socket.io.js";
	// URL to the socket bridge
	var _socketBridgeUrl    = "http://localhost:3858";
	// socket.io options
	var _connectionOptions = {
		// Make a second io.connect() call actually do something (default: false)
		"force new connection": true,
		// If the server drops the connection, do not reconnect automatically (default: true)
		"reconnect": false
	};
	// What V8 wraps code in automatically
	var _codePrefix = "(function (exports, require, module, __filename, __dirname) {\n";
	var _codeSuffix = "\n});";
	// Will be shown as tooltips
	var _stateDescriptions = {
		disconnected: "Click to connect to the Socket Bridge",
		connected:    "Node.js/V8 does not seem to be running",
		bridged:      "The current file is not executed by Node.js/V8",
		live:         "Live connection to Node.js/V8"
	};
	
	
	// --- State ---

	// Where the socket.io library will be stored
	var _socketIO;
	// <style> tag containing CSS code compiled from LESS
	var _$styleTag;
	// The toolbar button
	var _$button;
	// WebSocket to the socket bridge, only set when connected
	var _socketBridge;
	// Debugger API, only set when bridged
	var _debugger;
	// Script objects as defined by the V8 debugger, only set when the document is a script running in V8
	var _script;
	// Current Brackets document, only set when the current document is a running script
	var _doc;
	
	
	// --- Event Handlers ---

	/** Handles clicks of the V8 toolbar button */
	function _onButtonClicked() {
		if (_socketBridge) {
			_disconnect();
		} else {
			_connect();
		}
	}
	
	/** Called after we connected from the socket bridge */
	function _onConnect() {
		console.log("[V8] Connected to socket bridge");
		_updateState();
	}

	/** Called after we disconnected from the socket bridge */
	function _onDisconnect() {
		_onBridgeDisconnect();
		
		console.log("[V8] Disconnected from socket bridge");
		_socketBridge = null;
		_updateState();
	}

	/** Called for errors from/with the socket bridge */
	function _onError(error) {
		console.log(error);
		alert("Failed to connect to " + _socketBridgeUrl + "\n\nIs the socket bridge running?\nRun npm start in the " + _moduleDirectory + " folder.");
		_disconnect();
	}

	/** Called after the socket bridge connected to the debugger */
	function _onBridgeConnect() {
		console.log("[V8] Socket bridge is connected to the debugger");
		_debugger = new Debugger(_socketBridge);
		_updateState();

		var currentDocument = DocumentManager.getCurrentDocument();
		$.each(DocumentManager.getAllOpenDocuments(), function (index, doc) {
			_searchForRunningScript(doc).done(function (script) {
				_updateDocument(doc, script, true);
				if (currentDocument.url === doc.url) {
					_onScriptFound(script);
				}
			});
		});
	}

	/** Called after the socket bridge disconnected from the debugger */
	function _onBridgeDisconnect() {
		_script = null;
		_onScriptLost();
		
		console.log("[V8] Socket bridge has disconnected from the debugger");
		_debugger = null;
		_updateState();
	}

	function _onScriptFound(script) {
		console.log("[V8] Found a running script matching the current document");
		
		_script = script;
		_updateState();

		_startObservingDocument();
	}

	function _onScriptLost() {
		console.log("[V8] There's no running script matching the current document");

		_script = null;
		_updateState();

		_stopObservingDocument();
	}
	
	/** Called when the socket bridge fowards us an error from/with the debugger */
	function _onBridgeError(error) {
		error = typeof error === "string" ? error : JSON.stringify(error);
		alert("[V8] Debugger error: " + error);
	}

	/** Called when the V8 debugger calls a callback we set */
	function _onCallback() {
		if (_debugger) {
			_debugger.onCallback.apply(_debugger, arguments);
		}
	}

	/** Called when the user switches to a different document */
	function _onCurrentDocumentChanged() {
		if (!_debugger) { return; }
		
		_onScriptLost();
		var doc = DocumentManager.getCurrentDocument();
		if (!doc) { return; }
		
		_searchForRunningScript(doc).done(_onScriptFound);
	}

	/** Called when the user modifies the current document */
	function _onDocumentChanged(event, doc) {
		// false: Don"t report errors
		_updateDocument(doc, _script, false);
	}

	/** Called when the user saves the current document */
	function _onDocumentSaved(event, doc) {
		// true: Report errors
		_updateDocument(doc, _script, true);
	}


	// --- Functionality ---

	function _updateState() {
		var state = "disconnected";
		if (_socketBridge) {
			state = "connected";
			if (_debugger) {
				state = "bridged";
				if (_script) {
					state = "live";
				}
			}
		}
		//console.log("[V8] State: " + state);

		// Remove/add appropriate CSS classes
		$.each(_stateDescriptions, function (otherState) {
			_$button.toggleClass(otherState, state === otherState);
		});
		
		// title isn"t working on the Mac, so we fake it via CSS
		_$button.attr("data-description", _stateDescriptions[state]);
	}

	/** Connects to the socket bridge */
	function _connect() {
		if (_socketBridge) {
			console.log("[V8] Already connected to socket bridge");
			return;
		}
		
		console.log("[V8] Connecting to socket bridge");
		_socketBridge = _socketIO.connect(_socketBridgeUrl, _connectionOptions);
		
		// Brackets <-> Bridge
		_socketBridge.on("connect",    _onConnect);
		_socketBridge.on("disconnect", _onDisconnect);
		_socketBridge.on("error",      _onError);

		// Bridge <-> Debugger
		_socketBridge.on("debuggerConnect",    _onBridgeConnect);
		_socketBridge.on("debuggerDisconnect", _onBridgeDisconnect);
		_socketBridge.on("debuggerError",      _onBridgeError);

		// Calls to callbacks we provided the debugger with
		_socketBridge.on("callback", _onCallback);
	}

	/** Disconnect from the socket bridge */
	function _disconnect() {
		if (!_socketBridge) {
			console.log("[V8] Already disconnected from the socket bridge");
			return;
		}

		console.log("[V8] Disconnecting from socket bridge");
		_socketBridge.disconnect();
		// Delete the socket no matter what (in case the disconnect event is never triggered)
		_socketBridge = null;
	}

	/** Sets _script */
	function _searchForRunningScript(doc) {
		var result = new $.Deferred();

		if (!doc) {
			console.log("[V8] No document to check");
			result.reject();
		}
		else if (!_debugger) {
			console.log("[V8] No debugger to ask for running scripts");
			result.reject();
		}
		else {
			console.log("[V8] Checking whether " + doc.file.name + " is a running script");
			
			var path = doc.file.fullPath;
			if (brackets.platform === "win") {
				// Replace / with \ on Windows
				path = path.replace(/\//g, "\\");
			}
			
			_debugger.getScripts({ filter: path }, function onGetScripts(err, scripts) {
				if (err) {
					result.reject(err);
					throw err;
				}
				
				if (scripts.length === 0) {
					result.reject();
				}
				else {
					if (scripts.length > 1) {
						console.log("[V8] Warning: More than one script matches path " + path);
					}
					result.resolve(scripts[scripts.length - 1]);
				}
			});
		}

		return result.promise();
	}
	
	function _startObservingDocument() {
		if (_doc) {
			console.log("[V8] Bug? Already observing a document");
		}

		_doc = DocumentManager.getCurrentDocument();
		
		if (!_doc) {
			console.log("[V8] No document to observe");
			return;
		}
		
		console.log("[V8] Observing document " + _doc.file.name);
		$(_doc).on("change", _onDocumentChanged);
		$(DocumentManager).on("documentSaved", _onDocumentSaved);
	}

	function _stopObservingDocument() {
		if (!_doc) {
			console.log("[V8] No document to stop observing");
			return;
		}
		
		console.log("[V8] No longer observing document " + _doc.file.name);
		$(DocumentManager).off("documentSaved", _onDocumentSaved);
		$(_doc).off("change", _onDocumentChanged);
		_doc = null;
	}

	/** Tell the debugger to update the code for this script */
	function _updateDocument(doc, script, reportError) {
		console.log("[V8] Updating document " + doc.file.name);
		
		if (!_debugger || !script || !doc) {
			console.log("[V8] No debugger, script and/or document to use for updating");
			return;
		}

		// Wrap the code as V8 does automatically
		var code = _codePrefix + doc.getText() + _codeSuffix;

		_debugger.changeLive(script.id, code, false, function (err) {
			if (!err) {
				console.log("[V8] Successfully updated script " + script.name);
			}
			else if (reportError) {
				alert("Error while updating " + script.name + "\n\n" + err);
			}
		});
	}


	// --- Helper Functions ---
	
	/** Load socket.io client library unless io is already defined, called by init */
	function _loadSocketIO() {
		var result = new $.Deferred();
		
		if (typeof io !== "undefined") {
			console.log("[V8] Socket.io client already loaded");
			_socketIO = io;
			result.resolve();
		}
		else {
			console.log("[V8] Loading socket.io client");
			require([_pathSocketIoJs], function (io) {
				_socketIO = io;
				result.resolve();
			});
		}
		
		return result.promise();
	}
	
	/** Find the URL to this extension's directory */
	function _extensionDirUrl() {
		var url = brackets.platform === "win" ? "file:///" : "file://localhost";
		url += require.toUrl("./").replace(/\.\/$/, "");
		
		return url;
	}

	/** Loads a less file as CSS into the document */
	function _loadLessFile(file, dir) {
		var result = $.Deferred();

		// Load the Less code
		$.get(dir + file)
			.done(function (code) {
				// Parse it
				var parser = new less.Parser({ filename: file, paths: [dir] });
				parser.parse(code, function onParse(err, tree) {
					console.assert(!err, err);
					// Convert it to CSS and append that to the document head
					$("<style>").text(tree.toCSS()).appendTo(window.document.head);
					result.resolve();
				});
			})
			.fail(function (request, error) {
				result.reject(error);
			})
		;
		
		return result.promise();
	}
	

	// --- Loaders and Unloaders ---

	function _loadStyle() {
		var file = "main.less";
		return _loadLessFile(file, _extensionDirUrl()).done(function ($node) {
			_$styleTag = $node;
		}).fail(function (error) {
			console.log("[V8] Failed to load " + file + " :(");
		});
	}

	function _unloadStyle() {
		_$styleTag.remove();
	}

	/** Setup the V8 toolbar button, called by init */
	function _loadButton() {
		_$button = $("<a>").text("V8").attr({ href: "#", id: "denniskehrig-v8live-button" });
		_$button.click(_onButtonClicked);
		_$button.insertBefore("#main-toolbar .buttons #toolbar-go-live");
	}

	
	function _loadDocumentManager() {
		$(DocumentManager).on("currentDocumentChange", _onCurrentDocumentChanged);
	}

	function _unloadDocumentManager() {
		$(DocumentManager).off("currentDocumentChange", _onCurrentDocumentChanged);
	}


	function load() {
		console.log("[V8] init");
		$.when(_loadSocketIO(), _loadStyle()).done(function () {
			_loadButton();
			_updateState();
		});
		_loadDocumentManager();
	}

	function unload() {
		_disconnect();
		_unloadDocumentManager();
	}

	
	// --- Exports ---
	
	exports.load = load;
	exports.unload = unload;

	
	// --- Initializiation ---
	
	load();
});