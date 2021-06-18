import * as fs from 'fs';
import * as express from 'express';
import { Server as PairingServer } from 'thingrtc-pairing-server';
import { WebSocketServer } from './websocket-server';

const publicKey = fs.readFileSync('../publicKey.pem');
const privateKey = fs.readFileSync('../privateKey.pem');

const port = parseInt(process.env.PORT || '8080');

const server = express()
    .use(express.static('node_modules/thingrtc-static-example/dist'))
    .listen(port, '0.0.0.0', () => console.log(`Listening on ${port}`));

new WebSocketServer(publicKey, server);
new PairingServer(privateKey, 8081);
