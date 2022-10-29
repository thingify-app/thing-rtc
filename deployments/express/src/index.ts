import * as cors from 'cors';
import * as express from 'express';
import * as fs from 'fs';
import { PairingServer } from './pairing-server';
import { SignallingServer } from './signalling-server';
import { WebSocketApp } from './websocket-app';

const port = parseInt(process.env.PORT || '8081');
const publicKey: string = process.env.PUBLIC_KEY;
const privateKey: string = process.env.PRIVATE_KEY;

const webSocketApp = new WebSocketApp();
const pairingServer = new PairingServer(privateKey);
const signallingServer = new SignallingServer(publicKey);

webSocketApp.route('/signalling', ws => {
    signallingServer.handleConnection(ws);
});

webSocketApp.route('/pairing', ws => {
    pairingServer.handleWebSocketConnection(ws);
});

const server = express()
    .use(express.json())
    .use(cors())
    .get('/', (req, res) => {
        res.send('ThingRTC');
    })
    .post('/pairing/respondToPairing/:shortcode', async (req, res) => {
        await pairingServer.handleRespondToPairing(req, res);
    })
    .listen(port, '0.0.0.0', () => console.log(`Listening on ${port}`));

webSocketApp.listen(server);
