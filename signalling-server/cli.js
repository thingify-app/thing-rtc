#!/usr/bin/env node

const server = require('./dist/index');
new server.WebSocketServer(null, 8080);
