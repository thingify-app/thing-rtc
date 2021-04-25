#!/usr/bin/env node

const fs = require('fs');
const server = require('./dist/index');
const privateKey = fs.readFileSync('privateKey.pem');
new server.Server(privateKey, 8080);
