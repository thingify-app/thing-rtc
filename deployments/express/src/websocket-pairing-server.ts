import * as express from 'express';
import * as cors from 'cors';
import * as WebSocket from 'ws';
import { createPrivateKey } from 'crypto';
import { PairingServer, InMemoryStorage } from 'thingrtc-pairing-server';

export class WebSocketPairingServer {
    constructor(privateKey: Buffer, port: number) {
        const parsedPort = port || parseInt(process.env.PORT || '8080');
        const storage = new InMemoryStorage();
        const server = new PairingServer(storage, createPrivateKey(privateKey));
        const app = express();

        app.use(express.json());
        app.use(cors());
    
        app.get('/', (req, res) => {
            res.send('ThingRTC Pairing Server');
        });

        app.post('/respondToPairing/:shortcode', async (req, res) => {
            const response = await server.respondToPairingRequest(req.params.shortcode, req.body.publicKey);
            res.json(response);
        });
        
        const httpServer = app.listen(parsedPort, '0.0.0.0', () => console.log(`Listening on ${parsedPort}`));
        const wss = new WebSocket.Server({ server: httpServer });

        wss.on('error', error => {
            console.error(error);
        });
        
        wss.on('connection', ws => {
            console.log('Received new connection.');
            let messageReceived = false;
        
            ws.on('message', async data => {
                console.log(`Message received: ${data}`);

                if (messageReceived) {
                    ws.close();
                    return;
                }

                messageReceived = true;

                const pendingPairing = await server.createPairingRequest(data as string);
                const pairingData = pendingPairing.pairingData;

                ws.send(JSON.stringify(pairingData));

                const status = await pendingPairing.redemptionResult();
                ws.send(JSON.stringify(status));
                ws.close();
            });
        
            ws.on('close', () => {
                console.log('Connection closed.');
            });
        });
    }
}
