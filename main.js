/*
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
/*global define, brackets, $, less, io */

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
    'use strict';

    // Document Manager
    var DocumentManager     = brackets.getModule("document/DocumentManager");
    // Debugger class, implements an API by communicating with the socket bridge
    var Debugger            = require("./Debugger");

    // This directory
    var _moduleDirectory    = require.toUrl("./").replace(/\.\/$/, '');
    // Path to socket.io.js
    var _pathSocketIoJs     = _moduleDirectory + "/node_modules/socket.io-client/dist/socket.io.js";
    // URL to the socket bridge
    var _socketBridgeUrl    = 'http://localhost:3858';
    // socket.io options
    var _connectionOptions = {
        // Make a second io.connect() call actually do something (default: false)
        'force new connection': true,
        // If the server drops the connection, do not reconnect automatically (default: true)
        'reconnect': false
    };
    
    // The toolbar button
    var _$btnGoLive;
    // WebSocket to the socket bridge, only set when connected
    var _socketBridge;
    // Debugger API, only set when bridged
    var _debugger;
    // Current Brackets document, only set when a document is open
    var _document;
    // Script objects as defined by the V8 debugger, only set when the document is a script running in V8
    var _script;

    /** Load socket.io client library unless io is already defined, called by init */
    function _loadSocketIO() {
        if (typeof io === 'undefined') {
            console.log("[V8] Loading socket.io client");
            $("<script>").attr("src", _pathSocketIoJs).appendTo(window.document.head);
        } else {
            console.log("[V8] Socket.io client already loaded");
        }
    }
    
    /** Setup the V8 toolbar button, called by init */
    function _setupGoLiveButton() {
        _loadLessFile("main.less", _extensionDirForBrowser());

        _$btnGoLive = $("<a>").attr({ href: "#", id: "toolbar-go-live-v8" }).text("V8");
        _$btnGoLive.insertBefore('#main-toolbar .buttons #toolbar-go-live');
        _$btnGoLive.click(_handleGoLiveCommand);
    }

    /** Handles clicks of the V8 toolbar button */
    function _handleGoLiveCommand() {
        console.log("[V8] Button clicked");
        if (_socketBridge) {
            _disconnect();
        } else {
            _connect();
        }
    }

    /** Connects to the socket bridge */
    function _connect() {
        if (_socketBridge) {
            console.log("[V8] Already connected to socket bridge");
            return;
        }
        
        console.log("[V8] Connecting to socket bridge");
        
        _socketBridge = io.connect(_socketBridgeUrl, _connectionOptions);
        _setupSocketBridge();
    }

    /** Sets up socket event handlers */
    function _setupSocketBridge() {
        // Set a flag to decide in the error handler below whether we ever connected
        var didConnect = false;
        _socketBridge.on('connect', function () {
            console.log("[V8] Connected to socket bridge");
            didConnect = true;
            
            _onConnect();
        });
        
        // Make sure _socketBridge is null when disconnected
        _socketBridge.on('disconnect', function () {
            console.log("[V8] Disconnected from socket bridge");
            _socketBridge = null;
            
            _onDisconnect();
        });

        // Report connection errors, call _onError for later errors
        _socketBridge.on('error', function (error) {
            if (! didConnect) {
                alert("Failed to connect to " + _socketBridgeUrl + "\n\nIs the socket bridge running?\nRun npm start in the " + _moduleDirectory + " folder.");
                _disconnect();
            } else {
                _onError(error);
            }
        });

        // Callbacks to determine the bridged state
        _socketBridge.on('bridgeConnected', _onBridgeConnected);
        _socketBridge.on('bridgeDisconnected', _onBridgeDisconnected);

        // Calls to callbacks we provided the debugger with
        _socketBridge.on('callback', _onCallback);
    }

    /** Disconnect from the socket bridge */
    function _disconnect() {
        if (! _socketBridge) {
            return;
        }

        console.log("[V8] Disconnecting from socket bridge");
        _socketBridge.disconnect();
        // Delete the socket no matter what (in case the disconnect event is never triggered)
        _socketBridge = null;
    }

    /** Called after we disconnected from the socket bridge */
    function _onDisconnect()
    {
        _onBridgeDisconnected();
        _$btnGoLive.removeClass('connected').removeClass('live');
    }

    /** Called after we connected from the socket bridge */
    function _onConnect()
    {
        _$btnGoLive.addClass('connected');
    }

    /** Called after the socket bridge connected to the debugger */
    function _onBridgeConnected() {
        console.log("[V8] Socket bridge is connected to the debugger");
        _$btnGoLive.addClass('bridged');
        _debugger = new Debugger(_socketBridge);
        _updateLiveStatus();
    }

    /** Called after the socket bridge disconnected from the debugger */
    function _onBridgeDisconnected() {
        console.log("[V8] Socket bridge has disconnected from the debugger");
        _$btnGoLive.removeClass('bridged');
        _debugger = null;
        _updateLiveStatus();
    }

    /** Called when the V8 debugger calls a callback we set */
    function _onCallback() {
        if (_debugger) {
            _debugger.onCallback.apply(_debugger, arguments);
        }
    }

    /** Called when the socket bridge fowards us an error */
    function _onError(error) {
        error = typeof error === "string" ? error : JSON.stringify(error);
        alert("[V8] Error: " + error);
    }

    /** React to document events, called by init */
    function _setupDocumentManager() {
        $(DocumentManager).on("currentDocumentChange", _onCurrentDocumentChanged);
        $(DocumentManager).on('documentSaved', _onDocumentSaved);
    }

    /** Called when the user switches to a different document */
    function _onCurrentDocumentChanged() {
        _updateLiveStatus();

        if (_document) {
            $(_document).off('change', _onDocumentChanged);
            _document = null;
        }
        
        var document = DocumentManager.getCurrentDocument();
        if (document) {
            $(document).on('change', _onDocumentChanged);
            _document = document;
        }
    }

    /** Called when the user saves the current document */
    function _onDocumentSaved(event, document) {
        _updateDocument(document, true);
    }

    /** Called when the user modifies the current document */
    function _onDocumentChanged(event, document, changes) {
        _updateDocument(document, false);
    }

    /** Sets _script and manages the 'live' CSS class for the V8 button */
    function _updateLiveStatus() {
        console.log("[V8] Updating live status");
        
        var document = DocumentManager.getCurrentDocument();
        if (document && _debugger) {
            var path = document.file.fullPath;
            _debugger.getScripts(function (err, scripts) {
                if (err) {
                    _script = null;
                    throw err;
                }
                _script = _findScript(scripts, path);
                _$btnGoLive.toggleClass('live', _script ? true : false);
            });
        } else {
            _$btnGoLive.removeClass('live');
            _script = null;
        }
    }

    /** Find a script by name from a list of scripts */
    function _findScript(scripts, name) {
        for (var i in scripts) {
            if (scripts[i].name.search(name) >= 0) return scripts[i];
        }
        return null;
    }

    /** Tell the debugger to update the code for this script */
    function _updateDocument(document, reportError) {
        if (! _script || ! _debugger) {
            return;
        }
        
        console.log("[V8] Updating document");
        var path = document.file.fullPath;
        var code = document.getText();
        
        // V8 wrapper. Or something.
        code = "(function (exports, require, module, __filename, __dirname) {\n" + code + "\n});";

        _debugger.changeLive(_script.id, code, false, function (err) {
            if (! err) {
                console.log("[V8] Successfully updated script " + _script.name);
            }
            else if (reportError) {
                alert(err);
            }
        });
    }

    /** Find this extension's directory relative to the brackets root */
    function _extensionDirForBrowser() {
        var bracketsIndex = window.location.pathname;
        var bracketsDir   = bracketsIndex.substr(0, bracketsIndex.lastIndexOf('/') + 1);
        var extensionDir  = bracketsDir + require.toUrl('./');

        return extensionDir;
    }

    /** Loads a less file as CSS into the document */
    function _loadLessFile(file, dir) {
        // Load the Less code
        $.get(dir + file, function (code) {
            // Parse it
            var parser = new less.Parser({ filename: file, paths: [dir] });
            parser.parse(code, function onParse(err, tree) {
                console.assert(!err, err);
                // Convert it to CSS and append that to the document head
                $("<style>").text(tree.toCSS()).appendTo(window.document.head);
            });
        });
    }

    /** Initialize V8 LiveDevelopment */
    function init() {
        console.log("[V8] init");
        _loadSocketIO();
        _setupGoLiveButton();
        _setupDocumentManager();
    }
    window.setTimeout(init);

    // Export public functions
    exports.init = init;
});