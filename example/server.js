'use strict';

const express = require('express');
const { ThingServer } = require('thingrtc-server');

const port = process.env.PORT || 8080;

const server = express()
    .use(express.static('dist'))
    .listen(port, () => console.log(`Listening on ${port}`));

new ThingServer(server);
