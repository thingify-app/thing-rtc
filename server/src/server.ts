export class Server {
  private connectionAuthMap = new Map<Connection, AuthedData>();
  private responderConnectionMap = new Map<string, ConnectionPair>();

  onConnection(connection: Connection) {
    if (this.connectionAuthMap.has(connection)) {
      throw new Error('Connection reference already exists.');
    } else {
      this.connectionAuthMap.set(connection, {
        authed: false,
        role: null,
        responderId: null
      });
    }
  }

  private getConnectionPair(responderId: string) {
    const entry = this.responderConnectionMap.get(responderId);
    if (entry) {
      return entry;
    } else {
      const connectionPair: ConnectionPair = {
        initiatorConnection: null,
        responderConnection: null
      };
      this.responderConnectionMap.set(responderId, connectionPair);
      return connectionPair;
    }
  }

  onMessage(connection: Connection, message: string) {
    const authState = this.connectionAuthMap.get(connection);
    if (authState === null) {
      connection.disconnect();
      throw new Error('Received message from unknown connection.');
    } else if (authState.authed === false) {
      const authMessage = this.validateAuthMessage(message);
      const responderId = authMessage.responderId;
      const role = authMessage.role;
      // TODO add actual auth logic
      this.connectionAuthMap.set(connection, {
        authed: true,
        responderId,
        role
      });
      const connectionPair = this.getConnectionPair(responderId);
      if ((role === 'initiator' && connectionPair.initiatorConnection) || (role === 'responder' && connectionPair.responderConnection)) {
        connection.disconnect();
        throw new Error('Role already connected.');
      } else {
        if (role === 'initiator') {
          connectionPair.initiatorConnection = connection;
        } else if (role === 'responder') {
          connectionPair.responderConnection = connection;
        }
      }
    } else if (authState.authed === true) {
      const relayMessage = this.validateRelayMessage(message);
      this.relayMessage(connection, relayMessage.message);
    } else {
      connection.disconnect();
      throw new Error('Expected auth message.');
    }
  }

  private validateAuthMessage(message: string): AuthMessage {
    const json = JSON.parse(message);
    if (json && json.type === 'auth' && json.responderId && (json.role === 'initiator' || json.role === 'responder')) {
      return {
        type: 'auth',
        role: json.role,
        responderId: json.responderId
      };
    } else {
      throw new Error('Invalid auth message.');
    }
  }

  private validateRelayMessage(message: string): RelayMessage {
    const json = JSON.parse(message);
    if (json && json.type === 'relay' && json.message) {
      return {
        type: 'relay',
        message: json.message
      };
    } else {
      throw new Error('Invalid relay message');
    }
  }

  private relayMessage(connection: Connection, message: string) {
    const authState = this.connectionAuthMap.get(connection);
    const responderId = authState.responderId;
    const role = authState.role;

    const connectionPair = this.getConnectionPair(responderId);
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
      if (authState.responderId) {
        const connectionPair = this.getConnectionPair(authState.responderId);
        switch (authState.role) {
          case 'initiator':
            connectionPair.initiatorConnection = null;
            break;
          case 'responder':
            connectionPair.responderConnection = null;
        }

        if (connectionPair.initiatorConnection === null && connectionPair.responderConnection === null) {
          this.responderConnectionMap.delete(authState.responderId);
        }
      }
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
  responderId: string;
}

interface AuthMessage {
  type: 'auth';
  role: Role;
  responderId: string;
}

interface RelayMessage {
  type: 'relay';
  message: string;
}

export interface Connection {
  sendMessage(message: string): void;
  disconnect(): void;
}
