import { serve } from "https://deno.land/std@0.140.0/http/server.ts";
import { PairingServer } from "./pairing-server.ts";
import { SignallingServer } from "./signalling-server.ts";

serve(async req => {
  const url = new URL(req.url);
  const path = url.pathname.split('/')[1];
  console.log(`Request for URL: ${url}`);

  if (path === 'pairing') {
    return await handlePairingRoute(req);
  } else if (path === 'signalling') {
    return await handleSignallingRoute(req);
  } else {
    return new Response('Invalid URL path', {status: 404});
  }
});

async function handlePairingRoute(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname.split('/')[2];

  const pairingServer = new PairingServer(await getPrivateKey());
  
  if (!path) {
    // Empty path is our handler for the createPairingRequest websocket.
    try {
      const { socket, response } = toWebSocket(req);
      pairingServer.handleWebSocketConnection(socket);
      return response;
    } catch (_) {
      return new Response("request isn't trying to upgrade to websocket.");
    }
  } else if (path === 'respondToPairing') {
    if (req.method === 'OPTIONS') {
      // CORS preflight.
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': '*'
        }
      });
    } else if (req.method === 'POST') {
      const response = await pairingServer.handleRespondToPairing(req);
      // Add CORS header.
      response.headers.append('Access-Control-Allow-Origin', '*');
      return response;
    } else {
      return new Response('invalid method');
    }
  } else {
    return new Response("invalid path for pairing.");
  }
}

async function handleSignallingRoute(req: Request): Promise<Response> {
  try {
    const { socket, response } = toWebSocket(req);
    const signallingServer = new SignallingServer(await getPublicKey());

    socket.onopen = () => signallingServer.handleConnection(socket);
    
    return response;
  } catch (_) {
    return new Response("request isn't trying to upgrade to websocket.");
  }
}

function toWebSocket(req: Request): Deno.WebSocketUpgrade {
  const upgrade = req.headers.get("upgrade") || "";
  if (upgrade.toLowerCase() != "websocket") {
    throw new Error("request isn't trying to upgrade to websocket.");
  }
  
  return Deno.upgradeWebSocket(req);
}

async function getPublicKey(): Promise<CryptoKey> {
  const keyString = Deno.env.get('PUBLIC_KEY');
  if (!keyString) {
    throw new Error('PUBLIC_KEY env var missing!');
  }
  
  const algorithm = {name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256'};
  const parsedKey = JSON.parse(keyString);
  return await crypto.subtle.importKey('jwk', parsedKey, algorithm, true, ['verify']);
}

async function getPrivateKey(): Promise<CryptoKey> {
  const keyString = Deno.env.get('PRIVATE_KEY');
  if (!keyString) {
    throw new Error('PRIVATE_KEY env var missing!');
  }
  
  const algorithm = {name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256'};
  const parsedKey = JSON.parse(keyString);
  return await crypto.subtle.importKey('jwk', parsedKey, algorithm, false, ['sign']);
}
