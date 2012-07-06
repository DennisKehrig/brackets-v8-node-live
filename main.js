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

	// Brackets Modules
	var Inspector = brackets.getModule("LiveDevelopment/Inspector/Inspector");

	// Settings
	var V8BRIDGE_URL = 'ws://127.0.0.1:8080';
	
	// <style> tag containing CSS code compiled from LESS
	var _$styleTag;
	// The toolbar button
	var _$button;
	
	
	// --- Event Handlers ---

	/** Handles clicks of the V8 toolbar button */
	function _toggleLiveV8() {
		if (Inspector.connected()) {
			Inspector.disconnect();
			_$button.removeClass("connected");
		} else {
			Inspector.connect(V8BRIDGE_URL, "V8");
			_$button.addClass("connected");
		}
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
		var result = $.Deferred();
		
		// Load the Less code
		$.get(dir + file, function (code) {
			// Parse it
			var parser = new less.Parser({ filename: file, paths: [dir] });
			parser.parse(code, function onParse(err, tree) {
				console.assert(!err, err);
				// Convert it to CSS and append that to the document head
				$("<style>").text(tree.toCSS()).appendTo(window.document.head);
				result.resolve();
			});
		});
		
		return result.promise();
	}
	

	// --- Loaders and Unloaders ---

	function _loadStyle() {
		return _loadLessFile("main.less", _extensionDirForBrowser()).done(function ($node) {
			_$styleTag = $node;
		});
	}

	function _unloadStyle() {
		_$styleTag.remove();
	}

	/** Setup the V8 toolbar button, called by init */
	function _loadButton() {
		var result = new $.Deferred();
		
		_loadStyle().done(function () {
			_$button = $("<a>").text("V8").attr({ href: "#", id: "denniskehrig-v8live-button" });
			_$button.click(_toggleLiveV8);
			_$button.insertBefore('#main-toolbar .buttons #toolbar-go-live');
			result.resolve();
		}).fail(result.reject);
		
		return result.promise();
	}

	function load() {
		_loadStyle().done(function () {
			_loadButton();
		});
	}

	function unload() {
	}

	load();

	exports.load = load;
	exports.unload = unload;
	
});