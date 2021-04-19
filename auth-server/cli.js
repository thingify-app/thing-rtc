#!/usr/bin/env node

const server = require('./dist/index');
new server.AuthServer(8080);
