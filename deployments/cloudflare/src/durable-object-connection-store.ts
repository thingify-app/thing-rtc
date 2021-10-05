import { ConnectionStore, StoredConnection, Role } from 'thingrtc-signalling-server';

/**
 * ConnectionStore implementation which co-ordinates connections and state with CloudFlare Durable Objects.
 */
export class DurableObjectConnectionStore implements ConnectionStore {
    private clientCache = new Map<string, ObjectClient>();

    constructor(private env: any) {}

    async putConnection(connection: StoredConnection): Promise<void> {
        await ObjectClient.createInstance(this.env, connection);
    }

    async getConnection(pairingId: string, role: Role): Promise<StoredConnection | null> {
        return await (await this.getClient(pairingId, role)).getStoredConnection();
    }

    async hasConnection(pairingId: string, role: Role): Promise<boolean> {
        return (await this.getConnection(pairingId, role)) !== null;
    }

    async deleteConnection(pairingId: string, role: Role): Promise<void> {
        await (await this.getClient(pairingId, role)).clearStoredConnection();
    }

    private async getClient(pairingId: string, role: Role): Promise<ObjectClient> {
        const cached = this.clientCache.get(this.getId(pairingId, role));
        if (cached) {
            return cached;
        } else {
            const client = new ObjectClient(this.env, pairingId, role);
            this.clientCache.set(this.getId(pairingId, role), client);
            return client;
        }
    }

    private getId(pairingId: string, role: Role): string {
        return `${pairingId}/${role}`;
    }
}

const DUMMY_URL = 'https://dummy';

/**
 * Provides an API which implements the communication protocol with the underlying Durable Object.
 */
class ObjectClient {
    private connection: DurableObjectConnection;

    static async createInstance(env: any, storedConnection: StoredConnection): Promise<void> {
        const connection = this.getObject(env, storedConnection.pairingId, storedConnection.role);
        const request = new Request(`${DUMMY_URL}/create`);
        const response = await connection.fetch(request);
        const websocket = (response as any).webSocket as WebSocket;

        websocket.accept();

        websocket.addEventListener('message', msg => {
            const data = msg.data;
            const type = data.type;
            
            if (type === 'peerConnect') {
                storedConnection.sendPeerConnect(data.nonce);
            } else if (type === 'peerDisconnect') {
                storedConnection.sendPeerDisconnect();
            } else {
                storedConnection.sendMessage(data);
            }
        });

        // Send connection data immediately on connection.
        const message: DurableObjectData = {
            pairingId: storedConnection.pairingId,
            role: storedConnection.role,
            nonce: storedConnection.nonce
        };
        websocket.send(JSON.stringify(message));
    }

    constructor(env: any, pairingId: string, role: Role) {
        this.connection = ObjectClient.getObject(env, pairingId, role);
    }

    private static getObject(env: any, pairingId: string, role: Role): DurableObjectConnection {
        const id = env.DURABLE_OBJECT_CONNECTION.idFromName(this.getId(pairingId, role));
        return env.DURABLE_OBJECT_CONNECTION.get(id);
    }

    private static getId(pairingId: string, role: Role): string {
        return `${pairingId}/${role}`;
    }

    async getStoredConnection(): Promise<StoredConnection | null> {
        const request = new Request(DUMMY_URL, { method: 'GET' });
        const response = await this.connection.fetch(request);
        const body = await response.json() as DurableObjectData;

        if (body === null) {
            return null;
        } else {
            return {
                pairingId: body.pairingId,
                role: body.role,
                nonce: body.nonce,
                sendMessage: msg => this.sendMessage(msg),
                sendPeerConnect: nonce => this.sendMessage(JSON.stringify({ type: "peerConnect", nonce })),
                sendPeerDisconnect: () => this.sendMessage(JSON.stringify({ type: "peerDisconnect" }))
            };
        }
    }

    private async sendMessage(message: string): Promise<void> {
        const request = new Request(DUMMY_URL, { method: 'POST', body: message });
        await this.connection.fetch(request);
    }

    async clearStoredConnection(): Promise<void> {
        const request = new Request(DUMMY_URL, { method: 'DELETE' });
        await this.connection.fetch(request);
    }
}

/**
 * The actual Durable Object which stores connection state and relays messages.
 */
export class DurableObjectConnection {
    private websocket: WebSocket = null;
    private data: DurableObjectData = null;

    constructor(state: any, private env: any) {}

    async fetch(request: Request): Promise<Response> {
        const url = new URL(request.url);
        if (url.pathname === '/create' && request.method === 'GET') {
            // Creation request with listeners setup.
            return await this.handleCreationRequest(request);
        } else if (request.method === 'GET') {
            // Get the current data state.
            return await this.handleGetRequest(request);
        } else if (request.method === 'POST') {
            // Send message to current listeners.
            return await this.handleSendMessageRequest(request);
        } else if (request.method === 'DELETE') {
            // Delete the data state.
            return await this.handleClearRequest(request);
        } else {
            return new Response('Invalid method.', {status: 400});
        }
    }

    private async handleCreationRequest(request: Request): Promise<Response> {
        if (this.websocket) {
            throw new Error('Websocket already connected!');
        }

        const pair = new WebSocketPair();
        const remote = pair[0];
        const local = pair[1];
        local.accept();

        local.addEventListener('message', msg => {
            const data = JSON.parse(msg.data) as DurableObjectData;
            this.data = data;
        });

        local.addEventListener('close', event => {
            local.close(event.code, event.reason);
        });
        
        this.websocket = local;

        return new Response(null, { status: 101, webSocket: remote });
    }

    private async handleGetRequest(request: Request): Promise<Response> {
        return new Response(JSON.stringify(this.data));
    }

    private async handleSendMessageRequest(request: Request): Promise<Response> {
        const message = await request.text();
        this.websocket?.send(message);
        return new Response('Success');
    }

    private async handleClearRequest(request: Request): Promise<Response> {
        this.data = null;
        this.websocket?.close();
        this.websocket = null;
        return new Response('Success');
    }
}

interface DurableObjectData {
    pairingId: string;
    role: Role;
    nonce: string;
}
