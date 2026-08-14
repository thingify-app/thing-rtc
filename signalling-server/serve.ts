import { SignallingServer } from './signalling-server.ts';
import { websocketToSocket } from './websocket.ts';

export async function serve(signallingServer: SignallingServer) {
  Deno.serve(async req => {
    const url = new URL(req.url);
    const path = url.pathname.split('/')[1];
    console.log(`Request for URL: ${url}`);

    if (path === 'signalling') {
      return await handleSignallingRoute(signallingServer, req);
    } else {
      return new Response('Invalid URL path', {status: 404});
    }
  });
}

async function handleSignallingRoute(signallingServer: SignallingServer, req: Request): Promise<Response> {
  try {
    const { socket, response } = toWebSocket(req);
    socket.onopen = () => signallingServer.handleSignalling(websocketToSocket(socket));
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
