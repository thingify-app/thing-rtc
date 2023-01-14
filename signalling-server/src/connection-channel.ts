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
}

export class InMemoryConnectionChannelFactory implements ConnectionChannelFactory {
  private channels = new Map<string, InMemoryConnectionChannel>();

  async getConnectionChannel(channelId: string): Promise<ConnectionChannel> {
    const channel = this.channels.get(channelId);
    if (channel) {
      return channel;
    } else {
      const newChannel = new InMemoryConnectionChannel();
      this.channels.set(channelId, newChannel);
      return newChannel;
    }
  }
}

export class InMemoryConnectionChannel implements ConnectionChannel {
  private listeners: ((message: string) => void)[] = [];

  onMessage(listener: (message: string) => void): void {
    this.listeners.push(listener);
  }

  async sendMessage(message: string): Promise<void> {
    this.listeners.forEach(listener => listener(message));
  }
}
