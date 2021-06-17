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

    const id = env.RELAY.idFromName(path[0]);
    const relay: WebsocketRelay = env.RELAY.get(id);
    return relay.fetch(request);
}

export class WebsocketRelay {
    private sessions = new Set<WebSocket>();

    async fetch(request: Request): Promise<Response> {
        if (request.headers.get('Upgrade') !== 'websocket') {
            return new Response('Expected websocket.', {status: 400});
        }
        const pair = new WebSocketPair();
        const remote = pair[0];
        const local = pair[1];
        local.accept();
        this.sessions.add(local);
        local.addEventListener('message', async msg => {
            this.sessions.forEach(session => session.send(msg.data));
        });
        const closeHandler = () => {
            this.sessions.delete(local);
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
