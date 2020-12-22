export class Server {
  private connectionMap = new Map<string, ConnectionPair>();

  onConnection(connection: Connection) {
    const responderId = connection.responderId;
    const connectionPair = this.getConnectionPair(responderId);
    switch (connection.role) {
      case 'initiator':
        if (connectionPair.initiatorConnection) {
          throw new Error('Existing initiator already connected.');
        } else {
          connectionPair.initiatorConnection = connection;
        }
        break;
      case 'responder':
        if (connectionPair.responderConnection) {
          throw new Error('Existing responder already connected.');
        } else {
          connectionPair.responderConnection = connection;
        }
        break;
    }
  }

  private getConnectionPair(responderId: string) {
    const entry = this.connectionMap.get(responderId);
    if (entry) {
      return entry;
    } else {
      const connectionPair: ConnectionPair = {
        initiatorConnection: null,
        responderConnection: null
      };
      this.connectionMap.set(responderId, connectionPair);
      return connectionPair;
    }
  }

  onMessage(connection: Connection, message: Message) {
    const responderId = connection.responderId;
    const connectionPair = this.getConnectionPair(responderId);
    switch (connection.role) {
      case 'initiator':
        if (connectionPair.responderConnection) {
          connectionPair.responderConnection.sendMessage(message.content);
        }
        break;
      case 'responder':
        if (connectionPair.initiatorConnection) {
          connectionPair.initiatorConnection.sendMessage(message.content);
        }
        break;
    }
  }

  onDisconnection(connection: Connection) {
    const responderId = connection.responderId;
    const connectionPair = this.getConnectionPair(connection.responderId);
    switch (connection.role) {
      case 'initiator':
        connectionPair.initiatorConnection = null;
        break;
      case 'responder':
        connectionPair.responderConnection = null;
    }

    if (connectionPair.initiatorConnection === null && connectionPair.responderConnection === null) {
      this.connectionMap.delete(responderId);
    }
  }
}

export type Role = 'initiator' | 'responder';

interface ConnectionPair {
  initiatorConnection: Connection;
  responderConnection: Connection;
};

export interface Connection {
  role: Role;
  responderId: string;
  sendMessage(message: string);
}

export interface Message {
  content: string;
}
