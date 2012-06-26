# Node.js/V8 Live Development with the Brackets editor

When active, this extension maintains a connection to a Node.js/V8 debugger running on localhost:5858.
Changes to scripts running in that VM are updated live.

## Requirements

To let Brackets talk with the debugger, a separate node-based socket bridge needs to be started first.
It maintains a regular socket-based connection to the debugger and can be accessed by Brackets via a WebSocket.

## Install

Clone the extension into the disabled extensions folder of Brackets:

    git clone git://github.com/DennisKehrig/brackets-v8-node-live.git brackets/src/extensions/disabled/v8-node-live

Create a link to enable the extension:

    ln -s ../disabled/v8-node-live brackets/src/extensions/user/v8-node-live

Install [Node.js](http://nodejs.org/) and npm, then install the necessary node modules:

    cd brackets/src/extensions/disabled/v8-node-live
    npm install

## Run

First launch the [Node.js](http://nodejs.org/) based socket bridge:

    cd brackets/src/extensions/disabled/ExtensionManager
    node socket-bridge

Now start Brackets. The extension adds a V8 toolbar button with the following states:

- Disconnected (white):  No connection to the socket bridge
- Connected (red):       Connected to the socket bridge, but no V8 debugger found
- Bridged (yellow):      Socket bridge is connected to a V8 debugger
- Live (green):          Current open file is run by V8

## Todo

- Allow updating only on save
- Add Coffee-Script compatibility

## License

Copyright (c) 2012 Dennis Kehrig. All rights reserved.
 
Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
 
The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
 
THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
