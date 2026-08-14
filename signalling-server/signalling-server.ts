import { ConnectionChannel, ConnectionChannelFactory } from './connection-channel.ts';
import { AuthValidator } from './auth-validator.ts';
import { Socket } from './websocket.ts';
import { z } from 'zod';

const SESSION_TIMEOUT = 10 * 60 * 1000; // 10min

export class SignallingServer {
  constructor(
    private authValidator: AuthValidator,
    private claimer: Claimer,
    private connectionChannelFactory: ConnectionChannelFactory,
  ) {}

  handleSignalling(socket: Socket): void {
    let authed = false;

    // Automatically close the connection after timeout.
    setTimeout(() => socket.close(), SESSION_TIMEOUT);

    socket.onMessage(async message => {
      try {
        if (!authed) {
          const authMessage = Message.parse(JSON.parse(message));
          const authData = AuthData.parse(JSON.parse(authMessage.data ?? '{}'));
          const parsedToken = await this.authValidator.validateToken(authData.token);
          const pairingId = parsedToken.pairingId;
          const role = parsedToken.role;
          const nonce = authData.nonce;

          let channelId: string;
          let channel: ConnectionChannel;

          if (role === 'initiator') {
            // Initiator creates a channel and entry for responders to find.
            channelId = crypto.randomUUID();
            channel = await this.connectionChannelFactory.getConnectionChannel(channelId);
            await this.claimer.createEntry(pairingId, channelId, nonce, SESSION_TIMEOUT);
            console.log(`Created entry for channel ID ${channelId}`);
          } else {
            // Responder looks for any matching initiator entries, and tries to
            // claim one.
            const entry = await this.claimer.attemptClaim(pairingId, SESSION_TIMEOUT);
            if (!entry) {
              throw new Error('Could not claim!');
            }
            channelId = entry.channelId;
            channel = await this.connectionChannelFactory.getConnectionChannel(channelId);

            // Send a peerConnect message to initiator at the other end of the
            // channel with our nonce.
            await channel.sendMessage(JSON.stringify({
              type: 'peerConnect',
              nonce: nonce,
            }));

            // Send a peerConnect to our client, with the initiator's nonce.
            await socket.sendMessage(JSON.stringify({
              type: 'peerConnect',
              nonce: entry.nonce,
            }));
          }

          // We are now authed and set up, connect channel/socket to relay
          // messages between peers now.
          socket.onMessage(async message => await channel.sendMessage(message));

          channel.onMessage(async message => {
            console.log(`Received channel message: ${message}`);
            const parsed = Message.parse(JSON.parse(message));
            if (parsed.type === 'peerDisconnect') {
              console.log('Peer disconnected, closing socket...');
              await socket.close();
            } else {
              // Otherwise just relay all messages to our peer.
              await socket.sendMessage(message);
            }
          });

          socket.onClose(async () => {
            // Notify the peer that we have disconnected, so they can reset their
            // state.
            await channel.sendMessage(JSON.stringify({
              type: 'peerDisconnect'
            }));

            // In case we were an initiator and didn't find a partner, clear our entry.
            await this.claimer.clearEntry(pairingId, channelId);
            channel.close();
          });

          authed = true;
        }
      } catch (error) {
        console.error(error);
        await socket.sendMessage('error');
        await socket.close();
      }
    });
  }
}

export interface Entry {
  channelId: string;
  nonce: string;
}

export interface Claimer {
  createEntry(pairingId: string, channelId: string, nonce: string, expiryMillis: number): Promise<void>;
  attemptClaim(pairingId: string, timeoutMillis: number): Promise<Entry|null>;
  clearEntry(pairingId: string, channelId: string): Promise<void>;
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
