// @deno-types="./dist/signalling-server/index.d.ts"
import { ConnectionChannel, ConnectionChannelFactory } from "./dist/signalling-server/index.js";
  
export class BroadcastChannelConnectionChannelFactory implements ConnectionChannelFactory {  
  async getConnectionChannel(channelId: string): Promise<ConnectionChannel> {
    return new BroadcastChannelConnectionChannel(new BroadcastChannel(channelId));
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
    this.channel.postMessage(message);
  }
}
