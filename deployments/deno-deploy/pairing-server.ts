// @deno-types="./dist/pairing-server/index.d.ts"
import { PairingServer as Server, Socket } from './dist/pairing-server/index.js';
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

        try {
            const body = JSON.parse(await req.text());
            const response = await this.server.respondToPairingRequest(shortcode, body.publicKey);
            return new Response(JSON.stringify(response));
        } catch (err) {
            console.error(err);
            return new Response('error', { status: 400 });
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
