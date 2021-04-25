#!/usr/bin/env node

const server = require('./dist/index');
new server.Server(8080);
