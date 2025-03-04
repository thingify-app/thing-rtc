// @deno-types="./dist/pairing-server/index.d.ts"
import { PairingServer as Server } from './dist/pairing-server/index.js';
import { BroadcastChannelConnectionChannelFactory } from './connection-channel.ts';

export class PairingServer {
    private server: Server;

    constructor(privateKey: CryptoKey) {
        this.server = new Server(new BroadcastChannelConnectionChannelFactory(), privateKey);
    }

    async handleRespondToPairing(req: Request): Promise<Response> {
        const url = new URL(req.url);
        const path = url.pathname.slice(1).split('/');
        const shortcode = path[2];
        const body = JSON.parse(await req.text());

        try {
            const response = await this.server.respondToPairingRequest(shortcode, body.publicKey);
            return new Response(JSON.stringify(response));
        } catch (err) {
            console.error(err);
            return new Response('error', { status: 400 });
        }
    }

    handleWebSocketConnection(ws: WebSocket) {
        let messageReceived = false;
    
        ws.onmessage = async event => {
            const data = event.data;
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
        };
    
        ws.onclose = () => {
            console.log('Connection closed.');
        };
    }
}
