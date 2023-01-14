import { AuthValidator } from "./auth-validator";
import { AuthMessage } from "./message-parser";
import { ConnectionChannelFactory } from "./connection-channel";
import { ChannelSession } from "./channel-session";

/**
 * Manages the state machine for a single connection to the signalling server. Co-ordination with other connections is
 * managed through ConnectionChannels.
 */
export class ConnectionHandler {
  private authState: AuthedData = null;
  private channelSession: ChannelSession;
  private peerConnected: boolean = false;

  constructor(private channelFactory: ConnectionChannelFactory, private authValidator: AuthValidator, private connection: Connection) {}
    
  async onAuthMessage(message: AuthMessage) {
    if (this.authState !== null) {
      throw new Error('Auth message received on already-authed connection.');
    }

    const parsedToken = await this.authValidator.validateToken(message.token);
    const pairingId = parsedToken.pairingId;
    const role = parsedToken.role;
    const nonce = message.nonce;

    this.authState = {
      pairingId,
      role,
      nonce
    };

    const channel = await this.channelFactory.getConnectionChannel(pairingId);
    this.channelSession = new ChannelSession(channel, role, {
      onPeerConnect: async remoteNonce => {
        // Only handle if we're not connected.
        if (!this.peerConnected) {
          this.peerConnected = true;
          await this.channelSession.sendPeerConnect(nonce);
          this.sendPeerConnectMessage(remoteNonce);
        }
      },
      onMessage: message => {
        this.connection.sendMessage(message);
      },
      onPeerDisconnect: () => {
        this.peerConnected = false;
        this.sendPeerDisconnectMessage();
      }
    });

    await this.channelSession.sendPeerConnect(nonce);
  }
  
  private sendPeerConnectMessage(remoteNonce: string) {
    // Send each nonce to the other peer for them to include in signed messages.
    this.connection.sendMessage(JSON.stringify({
      type: 'peerConnect',
      nonce: remoteNonce
    }));
  }

  private sendPeerDisconnectMessage() {
    const message = JSON.stringify({
      type: 'peerDisconnect'
    });
    this.connection.sendMessage(message);
  }

  async onContentMessage(message: string) {
    if (this.authState === null) {
      throw new Error('Received content message without being authed.');
    }

    await this.channelSession.sendMessage(message);
  }
  
  async onDisconnection() {
    await this.channelSession.sendPeerDisconnect();
    this.authState = null;
    this.channelSession = null;
  }
}

export type Role = 'initiator' | 'responder';

interface AuthedData {
  role: Role;
  pairingId: string;
  nonce: string;
}

export interface Connection {
  sendMessage(message: string): void;
  disconnect(): void;
}
