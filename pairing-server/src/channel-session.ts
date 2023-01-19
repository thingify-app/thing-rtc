import { ConnectionChannel } from './connection-channel';

/**
 * Wraps a ConnectionChannel to parse/handle the types of message we send/receive.
 */
export class ChannelSession {
  constructor(private channel: ConnectionChannel) {}

  async waitForResponse(): Promise<string> {
    return await this.waitForMessage().then(message => {
        const parsed = this.parseChannelMessage(message);
        if (parsed.type === 'response') {
            return Promise.resolve(parsed.message);
        }
    });
  }

  async waitForConfirmation(): Promise<PairingEntry> {
    return await this.waitForMessage().then(message => {
        const parsed = this.parseChannelMessage(message);
        if (parsed.type === 'confirm') {
            return Promise.resolve(JSON.parse(parsed.message));
        }
    });
  }

  async sendResponse(initiatorPublicKey: string): Promise<void> {
    await this.sendChannelMessage('response', initiatorPublicKey);
  }

  async confirmResponse(entry: PairingEntry): Promise<void> {
    await this.sendChannelMessage('confirm', JSON.stringify(entry));
  }

  private async waitForMessage(): Promise<string> {
    return new Promise<string>((resolve, reject) => {
        this.channel.onMessage(message => resolve(message));
    });
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
