import { ParseThroughAuthValidator } from "./auth-validator.ts";
import { BroadcastChannelConnectionChannelFactory } from "./connection-channel.ts";
import { KvClaimer } from "./kv.ts";
import { handleSignalling } from "./signalling-server.ts";
import { websocketToSocket } from "./websocket.ts";

Deno.serve(async req => {
  const url = new URL(req.url);
  const path = url.pathname.split('/')[1];
  console.log(`Request for URL: ${url}`);

  if (path === 'signalling') {
    return await handleSignallingRoute(req);
  } else {
    return new Response('Invalid URL path', {status: 404});
  }
});

const authValidator = new ParseThroughAuthValidator();
const claimer = await KvClaimer.create();
const connectionChannelFactory = new BroadcastChannelConnectionChannelFactory();

async function handleSignallingRoute(req: Request): Promise<Response> {
  try {
    const { socket, response } = toWebSocket(req);
    socket.onopen = () => handleSignalling(websocketToSocket(socket), authValidator, claimer, connectionChannelFactory);
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
