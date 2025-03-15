import { ConnectionChannel } from './connection-channel';
import { MessageQueue } from './utils';

/**
 * Wraps a ConnectionChannel to parse/handle the types of message we send/receive.
 */
export class ChannelSession {
  private responseQueue = new MessageQueue<string>();
  private confirmQueue = new MessageQueue<PairingEntry>();

  constructor(private channel: ConnectionChannel) {
    this.channel.onMessage(message => {
      const parsed = this.parseChannelMessage(message);
      if (parsed.type === 'response') {
        this.responseQueue.pushMessage(parsed.message);
      } else if (parsed.type === 'confirm') {
        this.confirmQueue.pushMessage(JSON.parse(parsed.message));
      }
    });
  }

  async waitForResponse(): Promise<string> {
    return await this.responseQueue.waitForMessage();
  }

  async waitForConfirmation(): Promise<PairingEntry> {
    return await this.confirmQueue.waitForMessage();
  }

  async sendResponse(initiatorPublicKey: string): Promise<void> {
    await this.sendChannelMessage('response', initiatorPublicKey);
  }

  async confirmResponse(entry: PairingEntry): Promise<void> {
    await this.sendChannelMessage('confirm', JSON.stringify(entry));
  }

  private parseChannelMessage(message: string): ChannelMessage {
    return JSON.parse(message) as ChannelMessage;
  }

  private async sendChannelMessage(type: string, message: string) {
    const jsonMessage = JSON.stringify({
      type,
      message
    });
    await this.channel.sendMessage(jsonMessage);
  }
}

export interface PairingEntry {
    shortcode: string;
    pairingId: string;
    responderPublicKey: string;
}

interface ChannelMessage {
  type: string;
  message: string;
}
