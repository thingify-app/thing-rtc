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

  onMessage(message: Message) {

  }

  onDisconnection(connection: Connection) {

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
  senderId: string;
  content: string;
}
