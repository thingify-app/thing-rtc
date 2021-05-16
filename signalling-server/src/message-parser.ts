export class MessageParser {
    constructor(private messageHandler: MessageHandler) {}

    parseMessage(message: string): void {
        const json = JSON.parse(message);
        if (!json) {
            throw new Error('Invalid JSON.');
        }

        const type = json.type;
        switch (type) {
            case 'auth':
                this.messageHandler.handleAuthMessage(json.data);
                break;
            case 'offer':
            case 'answer':
            case 'iceCandidate':
                this.messageHandler.handleContentMessage(message);
                break;
            default:
                throw new Error('Unknown type.');
        }
    }
}

export interface MessageHandler {
    handleAuthMessage(token: string): void;
    handleContentMessage(contentMessage: string): void;
}

export type Role = 'initiator' | 'responder';

export interface ContentMessage {
    content: string;
}