import { Server, JwtAuthValidator, Connection, MessageParser, AuthValidator } from 'thingrtc-signalling-server';

export default {
    async fetch(request: Request, env: any) {
        return await handleRequest(request, env);
    }
}

async function handleRequest(request: Request, env: any): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname.slice(1).split('/');
    
    if (!path[0]) {
        return new Response('No path specified.', {status: 400});
    }

    const pairingId = env.SIGNALLING_SERVER.idFromName(path[0]);
    const server: SignallingServer = env.SIGNALLING_SERVER.get(pairingId);
    return server.fetch(request);
}

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

// @cloudflare/workers-types doesn't currently include types for WebSockets:
declare global {
    interface WebSocket {
      accept(): void;
    }
  
    class WebSocketPair {
      0: WebSocket;
      1: WebSocket;
    }
  
    interface ResponseInit {
      webSocket?: WebSocket;
    }
}

class Lazy<T> {
    private value: T = null;

    constructor(private producer: () => Promise<T>) {}

    async get(): Promise<T> {
        if (this.value === null) {
            this.value = await this.producer();
        }
        return this.value;
    }
}
