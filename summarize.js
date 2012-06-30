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
/*global define, module */

/**
 * Simple function to summarize function parameters
 * Can be used in Node.js and in the browser (with require.js)
 */
(function () {
    'use strict';

    if (typeof define !== 'undefined') {
        define(function main(require, exports, module) {
            module.exports = _summarize;
        });
    }
    else if (typeof module !== 'undefined') {
        module.exports = _summarize;
    }
    else {
        console.log("Unknown module system");
    }

    function _summarize(arg) {
        if (typeof arg === 'undefined') {
            return 'undefined';
        }
        if (arg === null) {
            return 'undefined';
        }
        if (typeof arg === 'string') {
            if (arg.length > 50) {
                arg = arg.slice(0, 47) + '...';
            }
            return JSON.stringify(arg);
        }
        if (! isNaN(arg)) {
            return arg;
        }

        var c = arg.constructor;

        if (c && c.name === 'Array') {
            return 'Array(' + arg.length + ")";
        }

        return arg.constructor.name;
    }
}());