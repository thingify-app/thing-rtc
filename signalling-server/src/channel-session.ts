import { ConnectionChannel } from './connection-channel';

/**
 * Wraps a ConnectionChannel to parse/handle the types of message we send/receive.
 */
export class ChannelSession {
  constructor(
    private channel: ConnectionChannel,
    private role: string,
    private handlers: ChannelSessionHandlers
  ) {}

  start(): void {
    this.channel.onMessage(message => this.handleMessage(message));
  }

  async sendPeerConnect(nonce: string): Promise<void> {
    this.sendChannelMessage('peerConnect', nonce);
  }

  async sendMessage(message: string): Promise<void> {
    this.sendChannelMessage('message', message);
  }

  async sendPeerDisconnect(): Promise<void> {
    this.sendChannelMessage('peerDisconnect', null);
  }

  close(): void {
    this.channel.close();
  }
  
  private handleMessage(message: string) {
    const parsed = this.parseChannelMessage(message);

    // Only process a message if it came from a role other than our own.
    if (parsed.role !== this.role) {
      switch (parsed.type) {
        case 'peerConnect':
          this.handlers.onPeerConnect(parsed.message);
          break;
        case 'message':
          this.handlers.onMessage(parsed.message);
          break;
        case 'peerDisconnect':
          this.handlers.onPeerDisconnect();
          break;
      }
    }
  }

  private parseChannelMessage(message: string): ChannelMessage {
    return JSON.parse(message) as ChannelMessage;
  }

  private async sendChannelMessage(type: string, message: string) {
    const jsonMessage = JSON.stringify({
      type,
      role: this.role,
      message
    });
    await this.channel.sendMessage(jsonMessage);
  }
}

export interface ChannelSessionHandlers {
  onPeerConnect: (remoteNonce: string) => void;
  onMessage: (message: string) => void;
  onPeerDisconnect: () => void;
}

interface ChannelMessage {
  type: string;
  role: string;
  message: string;
}
