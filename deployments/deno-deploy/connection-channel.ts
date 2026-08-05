/**
 * Returns the ConnectionChannel instance for a given ID.
 * A channel with a given ID will share the same group of listeners.
 */
export interface ConnectionChannelFactory {
  getConnectionChannel(channelId: string): Promise<ConnectionChannel>;
}

/**
 * A broadcast channel which simply relays any messages to all listeners.
 */
export interface ConnectionChannel {
  sendMessage(message: string): Promise<void>;
  onMessage(listener: (message: string) => void): void;
  close(): void;
}

export class BroadcastChannelConnectionChannelFactory implements ConnectionChannelFactory {  
  async getConnectionChannel(channelId: string): Promise<ConnectionChannel> {
    return await new BroadcastChannelConnectionChannel(new BroadcastChannel(channelId));
  }
}
  
export class BroadcastChannelConnectionChannel implements ConnectionChannel {
  constructor(private channel: BroadcastChannel) {}

  onMessage(listener: (message: string) => void): void {
    this.channel.addEventListener('message', event => {
      listener(event.data);
    });
  }

  async sendMessage(message: string): Promise<void> {
    await this.channel.postMessage(message);
  }

  close() {
    this.channel.close();
  }
}
