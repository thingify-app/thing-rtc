import { z } from 'zod';
import { ConnectionChannel } from './connection-channel';
import { MessageQueue } from './utils';

/**
 * Wraps a ConnectionChannel to parse/handle the types of message we send/receive.
 */
export class ChannelSession {
  private responseQueue = new MessageQueue<PairingResponse>();
  private confirmQueue = new MessageQueue<PairingEntry>();

  constructor(private channel: ConnectionChannel) {
    this.channel.onMessage(message => {
      const parsed = ChannelMessage.parse(JSON.parse(message));
      if (parsed.type === 'response') {
        this.responseQueue.pushMessage(parsed.data);
      } else if (parsed.type === 'confirm') {
        this.confirmQueue.pushMessage(parsed.data);
      }
    });
  }

  async waitForResponse(): Promise<PairingResponse> {
    return await this.responseQueue.waitForMessage();
  }

  async waitForConfirmation(): Promise<PairingEntry> {
    return await this.confirmQueue.waitForMessage();
  }

  async sendResponse(initiatorPublicKey: string, metadata: Record<string, string>): Promise<void> {
    await this.sendChannelMessage({
      type: 'response',
      data: {
        publicKey: initiatorPublicKey,
        metadata
      }
    });
  }

  async confirmResponse(entry: PairingEntry): Promise<void> {
    await this.sendChannelMessage({
      type: 'confirm',
      data: entry
    });
  }

  private async sendChannelMessage(message: ChannelMessage) {
    await this.channel.sendMessage(JSON.stringify(message));
  }
}

export const PairingEntry = z.object({
  shortcode: z.string(),
  pairingId: z.string(),
  responderPublicKey: z.string(),
  metadata: z.record(z.string(), z.string())
});
export type PairingEntry = z.infer<typeof PairingEntry>;

export const PairingResponse = z.object({
  publicKey: z.string(),
  metadata: z.record(z.string(), z.string())
});
export type PairingResponse = z.infer<typeof PairingResponse>;

const ChannelMessage = z.discriminatedUnion('type', [
  z.object({ type: z.literal('response'), data: PairingResponse }),
  z.object({ type: z.literal('confirm'), data: PairingEntry }),
]);

export type ChannelMessage = z.infer<typeof ChannelMessage>;
