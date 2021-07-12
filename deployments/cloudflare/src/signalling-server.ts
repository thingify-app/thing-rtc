import { Server, JwtAuthValidator, Connection, MessageParser, AuthValidator } from 'thingrtc-signalling-server';
import { Lazy } from "./utils";

export class SignallingServer {
    private authValidator = new Lazy<AuthValidator>(async () => {
        const algorithm = {name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256'};
        const parsedKey = JSON.parse(this.env.public_key);
        const publicKey = await crypto.subtle.importKey('jwk', parsedKey, algorithm, true, ['verify']);
        return new JwtAuthValidator(publicKey);
    });
    private server = new Lazy<Server>(async () => new Server(await this.authValidator.get()));

    constructor(state: any, private env: any) {}

    async fetch(request: Request): Promise<Response> {
        if (request.headers.get('Upgrade') !== 'websocket') {
            return new Response('Expected websocket.', {status: 400});
        }
        const pair = new WebSocketPair();
        const remote = pair[0];
        const local = pair[1];
        local.accept();

        const connection: Connection = {
            sendMessage: message => local.send(message),
            disconnect: () => local.close()
        };
        const server = await this.server.get();
        server.onConnection(connection);

        local.addEventListener('message', async msg => {
            const messageParser = new MessageParser({
                handleAuthMessage: message => server.onAuthMessage(connection, message),
                handleContentMessage: message => server.onContentMessage(connection, message)
            });
            try {
                messageParser.parseMessage(msg.data);
            } catch (error: any) {
                console.error(error);
            }
        });

        const closeHandler = () => {
            server.onDisconnection(connection);
        };
        local.addEventListener('close', closeHandler);
        local.addEventListener('error', closeHandler);

        return new Response(null, { status: 101, webSocket: remote });
    }
}