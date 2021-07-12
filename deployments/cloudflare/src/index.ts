import { generateShortcode } from "thingrtc-pairing-server";
import { PairingServer } from "./pairing-server";
import { SignallingServer } from "./signalling-server";

export { SignallingServer } from './signalling-server';
export { PairingServer } from './pairing-server';

export default {
    async fetch(request: Request, env: any): Promise<Response> {
        return handleRequest(request, env);
    }
}

async function handleRequest(request: Request, env: any): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname.slice(1).split('/');
    const route = path[0];

    if (route === 'signalling') {
        const pairingId = env.SIGNALLING_SERVER.idFromName(path[1]);
        const server: SignallingServer = env.SIGNALLING_SERVER.get(pairingId);
        return server.fetch(request);
    } else if (route === 'pairing') {
        if (!path[1]) {
            // Generate the shortcode first, to key the Durable Object.
            const shortcode = generateShortcode();
            const shortcodeId = env.PAIRING_SERVER.idFromName(shortcode);
            const server: PairingServer = env.PAIRING_SERVER.get(shortcodeId);

            // Pass the shortcode into the Durable Object as a query parameter,
            // so that it can use this rather than re-generate another one.
            const urlWithShortcode = new URL(request.url);
            urlWithShortcode.searchParams.set('shortcode', shortcode);
            const requestWithShortcode = new Request(urlWithShortcode.toString(), request);
            return server.fetch(requestWithShortcode);
        } else if (path[1] === 'respondToPairing') {
            // Handle CORS preflight request.
            if (request.method === 'OPTIONS') {
                return new Response(null, {headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Headers': '*'
                }});
            } else if (request.method !== 'POST') {
                return new Response('Invalid method.', {status: 400});
            }
            const shortcode = path[2];
            if (!shortcode) {
                return new Response('Missing shortcode.', {status: 400});
            }
            const shortcodeId = env.PAIRING_SERVER.idFromName(shortcode);
            const server: PairingServer = env.PAIRING_SERVER.get(shortcodeId);
            return server.fetch(request);
        }
    } else {
        return new Response('Invalid path specified.', {status: 400});
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
