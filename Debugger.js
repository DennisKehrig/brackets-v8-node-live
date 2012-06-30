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
/*global define, $ */

/**
 * Debugger class
 *
 * Implements the V8 API by calling the socket bridge
 */
define(function main(require, exports, module) {
    'use strict';

    // Function to summarize function parameters
    var summarize = require("./summarize");

    function Debugger(socket) {
        this.nextCallbackId = 0;
        this.callbacks = {};
        this.socket = socket;
    }

    /**
     * Invokes debugger functions via the socket bridge.
     * @param methodName   Name of the method to call
     * @param args...      Method parameters
     * @param [callback]   Optional callback
     */
    Debugger.prototype.call = function () {
        // debugger.call('foo', 'bar', callback) => v8.foo('bar', callback)
        var args = Array.prototype.slice.call(arguments);
        var method = args.shift();

        // Extract the callback
        var callback = null;
        if ($.isFunction(args[args.length - 1])) {
            callback = args.pop();
        }

        // Remember the callback, it will be called by onCallback() below
        var callbackId = null;
        if (callback) {
            callbackId = this.nextCallbackId++;
            this.callbacks[callbackId] = callback;
        }

        // Let the socket bridge do its magic
        this.socket.emit('call', method, args, callbackId);
    };

    /** Call the callback */
    Debugger.prototype.onCallback = function (callbackId, args) {
        var callback = this.callbacks[callbackId];
        var name = (callback && callback.name) || "anonymous";
        //console.log("[V8] Callback " + callbackId + " (" + name + ") called with args " + args.map(summarize).join(", "));
        
        if (callback) {
            delete this.callbacks[callbackId];
            callback.apply(null, args);
        } else {
            throw new Error("No callback with ID " + callbackId);
        }
    };

    /** Extends the debugger with a generic method that is implemented via call() */
    function _addMethod(method) {
        // debugger.foo('bar', callback) => debugger.call('foo', 'bar', callback)
        Debugger.prototype[method] = function () {
            var args = Array.prototype.slice.call(arguments);
            args.unshift(method);
            this.call.apply(this, args);
        };
    }

    // add the following methods
    var methods = ['getScripts', 'getScriptSource', 'changeLive', 'request'];
    for (var i = 0; i < methods.length; i++) {
        _addMethod(methods[i]);
    }

    // The whole module is this class
    module.exports = Debugger;
});