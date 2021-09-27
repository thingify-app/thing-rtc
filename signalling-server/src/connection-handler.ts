import { AuthValidator } from "./auth-validator";
import { AuthMessage } from "./message-parser";
import { ConnectionStore } from './connection-store';

/**
 * Manages the state machine for a single connection to the signalling server. Co-ordination with other connections is
 * managed through the provided Storage instance.
 */
export class ConnectionHandler {
  private authState: AuthedData = null;

  constructor(private storage: ConnectionStore, private authValidator: AuthValidator, private connection: Connection) {}
    
  async onAuthMessage(message: AuthMessage) {
    if (this.authState !== null) {
      throw new Error('Auth message received on already-authed connection.');
    }

    const parsedToken = await this.authValidator.validateToken(message.token);
    const pairingId = parsedToken.pairingId;
    const role = parsedToken.role;
    const nonce = message.nonce;
    const peerRole = oppositeRole(role);

    this.authState = {
      pairingId,
      role,
      nonce
    };

    if (await this.storage.hasConnection(pairingId, role)) {
      throw new Error('Role already connected.');
    }

    await this.storage.putConnection({
      pairingId,
      role,
      nonce,
      sendMessage: msg => this.connection.sendMessage(msg),
      sendPeerConnect: nonce => this.sendPeerConnectMessage(nonce),
      sendPeerDisconnect: () => this.sendPeerDisconnectMessage()
    });

    const peerConnection = await this.storage.getConnection(pairingId, peerRole);
    if (peerConnection) {
      // The most recently connected peer will get this message immediately, as their partner was already present.
      this.sendPeerConnectMessage(peerConnection.nonce);
      peerConnection.sendPeerConnect(message.nonce);
    }
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

    await this.relayMessage(message);
  }
  
  private async relayMessage(message: string) {
    const pairingId = this.authState.pairingId;
    const role = this.authState.role;

    const peerRole = oppositeRole(role);
    const peer = await this.storage.getConnection(pairingId, peerRole);
    peer.sendMessage(message);
  }
  
  async onDisconnection() {
    await this.storage.deleteConnection(this.authState.pairingId, this.authState.role);
    
    const peerRole = oppositeRole(this.authState.role);
    const peerConnection = await this.storage.getConnection(this.authState.pairingId, peerRole);
    peerConnection?.sendPeerDisconnect();
  }
}

export type Role = 'initiator' | 'responder';

function oppositeRole(role: Role): Role {
  return role === 'initiator' ? 'responder' : 'initiator';
}

interface AuthedData {
  role: Role;
  pairingId: string;
  nonce: string;
}

export interface Connection {
  sendMessage(message: string): void;
  disconnect(): void;
}
