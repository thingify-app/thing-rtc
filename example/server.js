'use strict';

const fs = require('fs');
const express = require('express');
const { ThingServer } = require('thingrtc-signalling-server');
const { Server } = require('thingrtc-pairing-server');

const privateKey = fs.readFileSync('privateKey.pem');

const port = process.env.PORT || 8080;

const server = express()
    .use(express.static('dist'))
    .listen(port, '0.0.0.0', () => console.log(`Listening on ${port}`));

new ThingServer(server);
new Server(privateKey, 8081);
