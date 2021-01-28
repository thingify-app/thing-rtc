#!/usr/bin/env node

const server = require('./dist/index');
new server.ThingServer(8080);
