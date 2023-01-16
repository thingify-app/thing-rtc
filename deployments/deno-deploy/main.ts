import { serve } from "https://deno.land/std@0.140.0/http/server.ts";
import { SignallingServer } from "./signalling-server.ts";

serve(async req => {
  const keyString = Deno.env.get('PUBLIC_KEY');
  if (!keyString) {
    throw new Error('Key env var missing!');
  }
  
  const algorithm = {name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256'};
  const parsedKey = JSON.parse(keyString);
  const publicKey = await crypto.subtle.importKey('jwk', parsedKey, algorithm, true, ['verify']);

  const signallingServer = new SignallingServer(publicKey);

  const upgrade = req.headers.get("upgrade") || "";
  if (upgrade.toLowerCase() != "websocket") {
    return new Response("request isn't trying to upgrade to websocket.");
  }
  
  const { socket, response } = Deno.upgradeWebSocket(req);
  socket.onopen = () => signallingServer.handleConnection(socket);
  
  return response;
});
