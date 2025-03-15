import { Socket } from '../src/socket';
import { MessageQueue } from '../src/utils';

export class MockSocket implements Socket {
    private incomingQueue = new MessageQueue<string>();
    private outgoingQueue = new MessageQueue<string>();
    private closed = false;

    async listenMessage(): Promise<string> {
        this.assertNotClosed();
        console.log('Listening for message...');
        return await this.incomingQueue.waitForMessage();
    }

    async sendMessage(message: string): Promise<void> {
        this.assertNotClosed();
        console.log(`Sending message: ${message}`);
        this.outgoingQueue.pushMessage(message);
    }

    async close(): Promise<void> {
        this.closed = true;
    }

    pushMessage(message: string) {
        this.incomingQueue.pushMessage(message);
    }

    async getSentMessage(): Promise<string> {
        return await this.outgoingQueue.waitForMessage();
    }
    
    isClosed(): boolean {
        return this.closed;
    }

    private assertNotClosed() {
        if (this.closed) {
            throw new Error('Attempted to use closed socket!');
        }
    }
}
