import { AuthValidator } from "./auth-validator";

export class Server {
  private connectionAuthMap = new Map<Connection, AuthedData>();
  private responderConnectionMap = new Map<string, ConnectionPair>();

  constructor(private authValidator: AuthValidator) {}

  onConnection(connection: Connection) {
    if (this.connectionAuthMap.has(connection)) {
      throw new Error('Connection reference already exists.');
    } else {
      this.connectionAuthMap.set(connection, {
        authed: false,
        role: null,
        pairingId: null
      });
    }
  }

  private getConnectionPair(pairingId: string) {
    const entry = this.responderConnectionMap.get(pairingId);
    if (entry) {
      return entry;
    } else {
      const connectionPair: ConnectionPair = {
        initiatorConnection: null,
        responderConnection: null
      };
      this.responderConnectionMap.set(pairingId, connectionPair);
      return connectionPair;
    }
  }

  onAuthMessage(connection: Connection, token: string) {
    const parsedToken = this.authValidator.validateToken(token);
    const pairingId = parsedToken.pairingId;
    const role = parsedToken.role;

    this.connectionAuthMap.set(connection, {
      authed: true,
      pairingId,
      role
    });

    const connectionPair = this.getConnectionPair(pairingId);
    if ((role === 'initiator' && connectionPair.initiatorConnection) || (role === 'responder' && connectionPair.responderConnection)) {
      connection.disconnect();
      throw new Error('Role already connected.');
    } else {
      if (role === 'initiator') {
        connectionPair.initiatorConnection = connection;
      } else if (role === 'responder') {
        connectionPair.responderConnection = connection;
      }

      // If we now have both peers, send a peerConnection message to each.
      // The most recently connected peer will get this message immediately, as their partner was already present.
      if (connectionPair.initiatorConnection && connectionPair.responderConnection) {
        this.sendPeerConnectMessage(connectionPair);
      }
    }
  }

  private sendPeerConnectMessage(connectionPair: ConnectionPair) {
    const message = JSON.stringify({
      type: 'peerConnect'
    });
    connectionPair.initiatorConnection.sendMessage(message);
    connectionPair.responderConnection.sendMessage(message);
  }

  onContentMessage(connection: Connection, message: string) {
    const authState = this.connectionAuthMap.get(connection);
    if (authState === null) {
      connection.disconnect();
      throw new Error('Received message from unknown connection.');
    } else if (authState.authed === false) {
      connection.disconnect();
      throw new Error('Received content message without being authed.');
    } else if (authState.authed === true) {
      this.relayMessage(connection, message);
    } else {
      connection.disconnect();
      throw new Error('Unknown auth state.');
    }
  }

  private relayMessage(connection: Connection, message: string) {
    const authState = this.connectionAuthMap.get(connection);
    const pairingId = authState.pairingId;
    const role = authState.role;

    const connectionPair = this.getConnectionPair(pairingId);
    let peer: Connection;
    if (role === 'initiator') {
      peer = connectionPair.responderConnection;
    } else {
      peer = connectionPair.initiatorConnection;
    }
    peer.sendMessage(message);
  }

  onDisconnection(connection: Connection) {
    const authState = this.connectionAuthMap.get(connection);
    this.connectionAuthMap.delete(connection);
    if (authState) {
      if (authState.pairingId) {
        const connectionPair = this.getConnectionPair(authState.pairingId);
        switch (authState.role) {
          case 'initiator':
            connectionPair.initiatorConnection = null;
            this.sendPeerDisconnectMessage(connectionPair.responderConnection);
            break;
          case 'responder':
            connectionPair.responderConnection = null;
            this.sendPeerDisconnectMessage(connectionPair.initiatorConnection);
        }

        if (connectionPair.initiatorConnection === null && connectionPair.responderConnection === null) {
          this.responderConnectionMap.delete(authState.pairingId);
        }
      }
    }
  }
  
  private sendPeerDisconnectMessage(connection: Connection) {
    const message = JSON.stringify({
      type: 'peerDisconnect'
    });
    if (connection) {
      connection.sendMessage(message);
    }
  }
}

export type Role = 'initiator' | 'responder';

interface ConnectionPair {
  initiatorConnection: Connection;
  responderConnection: Connection;
};

interface AuthedData {
  authed: boolean;
  role: Role;
  pairingId: string;
}

export interface AuthMessage {
  pairingId: string;
  role: Role;
  expiry: number;
}

export interface Connection {
  sendMessage(message: string): void;
  disconnect(): void;
}
