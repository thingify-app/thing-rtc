import { DurableObject } from 'cloudflare:workers';
import { ParseThroughAuthValidator } from './auth-validator';
import { z } from 'zod';

const authValidator = new ParseThroughAuthValidator();

export class SignallingServer extends DurableObject<Env> {
  private sessions: Map<WebSocket, Session>;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.sessions = new Map();

    // As part of constructing the Durable Object, we wake up any hibernating
    // WebSockets and place them back in the `sessions` map.

    // Get all WebSocket connections from the Durable Object:
    for (const ws of this.ctx.getWebSockets()) {
      const attachment = ws.deserializeAttachment() as SessionMetadata;
      if (attachment) {
        // If we previously attached state to our WebSocket, add it to the
        // `sessions` map to restore the state of the connection.
        this.sessions.set(ws, { partner: null, metadata: attachment });
      } else {
        // Close the WebSocket if we don't have a session associated with it.
        ws.close();
      }
    }

    // Rehydrate the partner fields now that we have all our sessions:
    for (const [ws, session] of this.sessions) {
      for (const [wsInner, sessionInner] of this.sessions) {
        if (
          ws !== wsInner &&
          sessionInner.metadata.id === session.metadata.partnerId &&
          session.metadata.id === sessionInner.metadata.partnerId
        ) {
          sessionInner.partner = ws;
          session.partner = wsInner;
        }
      }
    }

    // Sets an application level auto response that does not wake hibernated
    // WebSockets.
    this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
  }

  async fetch(request: Request): Promise<Response> {
    // Creates two ends of a WebSocket connection.
    const webSocketPair = new WebSocketPair();
    const [client, server] = Object.values(webSocketPair);

    // Accept the WebSocket using the Hibernation API, so that this Durable
    // Object can hibernate when all WebSockets are idle.
    this.ctx.acceptWebSocket(server);

    return new Response(null, {
      status: 101,
      webSocket: client,
    });
  }

  async webSocketMessage(ws: WebSocket, message: ArrayBuffer | string) {
    // Get the session associated with the WebSocket connection.
    const session = this.sessions.get(ws);

    if (session) {
      // If the session exists, just relay messages to its partner (if any):
      session.partner?.send(message);
    } else {
      // Otherwise, the WebSocket has not yet been authenticated, so expect the
      // first message to be an auth message.
      const authMessage = Message.parse(JSON.parse(message as string));
      const authData = AuthData.parse(JSON.parse(authMessage.data ?? '{}'));
      const parsedToken = await authValidator.validateToken(authData.token);

      // Check if pairingId agrees with this Durable Object's name:
      const pairingId = this.ctx.id.name;
      if (parsedToken.pairingId !== pairingId) {
        console.error('Parsed pairingId does not match Durable Object!');
        ws.close();
        return;
      }

      // Generate a random UUID and populate metadata for the session.
      const id = crypto.randomUUID();
      const metadata: SessionMetadata = {
        id: id,
        role: parsedToken.role,
        nonce: authData.nonce,
        partnerId: null,
      };

      // Find a partner from the connected WebSockets:
      let partner: WebSocket| null = null;
      for (const [partnerWs, partnerSession] of this.sessions) {
        if (
          partnerSession.metadata.role !== metadata.role &&
          partnerSession.metadata.partnerId === null
        ) {
          partner = partnerWs;
          metadata.partnerId = partnerSession.metadata.id;
          partnerSession.partner = ws;
          partnerSession.metadata.partnerId = id;

          // Send a peerConnect message to our partner with our nonce.
          partner.send(JSON.stringify({
            type: 'peerConnect',
            nonce: metadata.nonce,
          }));

          // Send a peerConnect to our client, with the partner's nonce.
          ws.send(JSON.stringify({
            type: 'peerConnect',
            nonce: partnerSession.metadata.nonce,
          }));

          // Update the partner's state to restore if we hibernate.
          partner.serializeAttachment(partnerSession.metadata);
          break;
        }
      }

      // Attach the metadata to the WebSocket connection and serialize it.
      // This is necessary to restore the state of the connection when the
      // Durable Object wakes up.
      ws.serializeAttachment(metadata);

      // Add the WebSocket connection to the in-memory map of active sessions.
      this.sessions.set(ws, {partner: partner, metadata: metadata});
    }
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string, wasClean: boolean) {
    const session = this.sessions.get(ws);
    session?.partner?.close();
    this.sessions.delete(ws);
  }
}

interface Session {
  partner: WebSocket|null;
  metadata: SessionMetadata;
}

interface SessionMetadata {
  id: string;
  role: 'initiator'|'responder';
  nonce: string;
  partnerId: string|null;
}

const Message = z.object({
  type: z.string(),
  data: z.optional(z.string()),
});

type Message = z.infer<typeof Message>;

const AuthData = z.object({
  nonce: z.string(),
  token: z.string(),
});

type AuthData = z.infer<typeof AuthData>;
