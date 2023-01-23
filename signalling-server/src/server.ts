import { AuthValidator } from "./auth-validator";
import { ConnectionChannelFactory, InMemoryConnectionChannelFactory } from "./connection-channel";
import { ConnectionHandler } from "./connection-handler";
import { AuthMessage } from "./message-parser";

export class Server {
  private connectionHandlerMap = new Map<Connection, ConnectionHandler>();

  constructor(
    private authValidator: AuthValidator,
    private channelFactory: ConnectionChannelFactory = new InMemoryConnectionChannelFactory()
  ) {}

  onConnection(connection: Connection) {
    if (this.connectionHandlerMap.has(connection)) {
      throw new Error('Connection reference already exists.');
    }
  
    this.connectionHandlerMap.set(connection, new ConnectionHandler(this.channelFactory, this.authValidator, connection));
  }

  async onAuthMessage(connection: Connection, message: AuthMessage) {
    await this.connectionHandlerMap.get(connection).onAuthMessage(message);
  }

  async onContentMessage(connection: Connection, message: string) {
    await this.connectionHandlerMap.get(connection).onContentMessage(message);
  }

  async onDisconnection(connection: Connection) {
    const connectionHandler = this.connectionHandlerMap.get(connection);
    this.connectionHandlerMap.delete(connection);
    await connectionHandler?.onDisconnection();
  }
}

export interface Connection {
  sendMessage(message: string): void;
  disconnect(): void;
}
