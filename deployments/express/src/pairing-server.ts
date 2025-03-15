import * as WebSocket from 'ws';
import { createPrivateKey } from 'crypto';
import { PairingServer as Server, InMemoryConnectionChannelFactory, Socket } from 'thingrtc-pairing-server';
import { Request, Response } from 'express';

export class PairingServer {
    private channelFactory = new InMemoryConnectionChannelFactory();
    private server = new Server(this.channelFactory, createPrivateKey(this.privateKey));

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

    async handleWebSocketConnection(ws: WebSocket) {
        let listener = (message: string) => {};
        ws.addEventListener('message', event => listener(event.data));

        const socket: Socket = {
            listenMessage: async () => {
                const response = await new Promise<string>((resolve, reject) => {
                    listener = resolve;
                });
                listener = () => {};
                return response;
            },
            sendMessage: async data => ws.send(data),
            close: async () => ws.close(),
        };

        await this.server.createPairingRequest(socket);
    }
}
