import * as WebSocket from 'ws';
import { createPrivateKey } from 'crypto';
import { PairingServer as Server, InMemoryStorage } from 'thingrtc-pairing-server';
import { Request, Response } from 'express';

export class PairingServer {
    private storage = new InMemoryStorage();
    private server = new Server(this.storage, createPrivateKey(this.privateKey));

    constructor(private privateKey: string) {}

    async handleRespondToPairing(req: Request, res: Response) {
        try {
            const response = await this.server.respondToPairingRequest(req.params.shortcode, req.body.publicKey);
            res.json(response);
        } catch (err) {
            console.error(err);
            res.sendStatus(400);
        }
    }

    handleWebSocketConnection(ws: WebSocket) {
        let messageReceived = false;
    
        ws.on('message', async data => {
            console.log(`Message received: ${data}`);

            if (messageReceived) {
                ws.close();
                return;
            }

            messageReceived = true;

            const pendingPairing = await this.server.createPairingRequest(data as string);
            const pairingData = pendingPairing.pairingData;

            ws.send(JSON.stringify(pairingData));

            const status = await pendingPairing.redemptionResult();
            ws.send(JSON.stringify(status));
            ws.close();
        });
    
        ws.on('close', () => {
            console.log('Connection closed.');
        });
    }
}
