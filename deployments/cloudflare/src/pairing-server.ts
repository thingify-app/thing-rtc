import { PairingServer as Server, InMemoryStorage } from "thingrtc-pairing-server";
import { Lazy } from "./utils";

export class PairingServer {
    private shortcode: string;
    private privateKey = new Lazy<CryptoKey>(async () => {
        const algorithm = {name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256'};
        const parsedKey = JSON.parse(this.env.private_key);
        return await crypto.subtle.importKey('jwk', parsedKey, algorithm, false, ['sign']);
    });
    private storage = new InMemoryStorage();
    private server = new Lazy<Server>(async () => new Server(this.storage, await this.privateKey.get(), () => this.shortcode));

    constructor(private state: any, private env: any) {}

    async fetch(request: Request): Promise<Response> {
        const url = new URL(request.url);
        const path = url.pathname.slice(1).split('/');
        const route = path[1];

        this.shortcode = url.searchParams.get('shortcode');
        if (!route) {
            return await this.createPairingRequest(request);
        } else if (route === 'respondToPairing') {
            return await this.respondToPairingRequest(path[2], (await request.json()).publicKey);
        } else {
            return new Response('Invalid path.', {status: 400});
        }
    }

    private async createPairingRequest(request: Request): Promise<Response> {
        const server = await this.server.get();

        if (request.headers.get('Upgrade') !== 'websocket') {
            return new Response('Expected websocket.', {status: 400});
        }
        const pair = new WebSocketPair();
        const remote = pair[0];
        const local = pair[1];
        local.accept();

        let messageReceived = false;

        local.addEventListener('message', async msg => {
            if (messageReceived) {
                local.close();
                return;
            }

            messageReceived = true;

            const pendingPairing = await server.createPairingRequest(msg.data);
            const pairingData = pendingPairing.pairingData;

            local.send(JSON.stringify(pairingData));

            const status = await pendingPairing.redemptionResult();
            local.send(JSON.stringify(status));
            local.close();
        });

        return new Response(null, { status: 101, webSocket: remote });
    }

    private async respondToPairingRequest(shortcode: string, publicKey: string): Promise<Response> {
        const server = await this.server.get();
        try {
            const peerDetails = await server.respondToPairingRequest(shortcode, publicKey);
            return new Response(JSON.stringify(peerDetails), {headers: {'Access-Control-Allow-Origin': '*'}});
        } catch (error) {
            console.error(error);
            return new Response(`Shortcode ${shortcode} does not exist!`, {status: 404, headers: {'Access-Control-Allow-Origin': '*'}});
        }
    }
}