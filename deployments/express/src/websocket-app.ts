import * as http from 'http';
import { Socket } from 'net';
import * as WebSocket from 'ws';

export type WebSocketHandler = (ws: WebSocket) => void;

/**
 * Associates HTTP routes with WebSocket handlers on a http.Server.
 */
export class WebSocketApp {
    private routeMap = new Map<string, WebSocketHandler>();

    /** Create a handler for the given HTTP route. */
    route(path: string, handler: WebSocketHandler): WebSocketApp {
        this.routeMap.set(path, handler);
        return this;
    }

    /** Once routes are established, call to begin listening for WebSocket requests. */
    listen(server: http.Server) {
        const wss = new WebSocket.Server({ noServer: true });

        wss.on('connection', (ws, request) => {
            const path = this.getPath(request.url);
            const handler = this.routeMap.get(path);
            handler(ws);
        });

        server.on('upgrade', (request: http.IncomingMessage, socket: Socket, head: Buffer) => {
            const path = this.getPath(request.url);

            if (!this.routeMap.has(path)) {
                console.log(`Unknown path "${path}" requested.`)
                socket.end();
            }
            wss.handleUpgrade(request, socket, head, socket => {
                wss.emit('connection', socket, request);
            });
        });
    }

    private getPath(url: string): string {
        return '/' + url.split('/')[1];
    }
}
