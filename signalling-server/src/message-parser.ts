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
                this.handleAuthMessage(json.data);
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

    private handleAuthMessage(json: string) {
        const data = JSON.parse(json);
        if (data.token && data.nonce) {
            this.messageHandler.handleAuthMessage(data);
        } else {
            throw new Error(`Invalid auth message: ${json}`);
        }
    }
}

export interface MessageHandler {
    handleAuthMessage(authMessage: AuthMessage): void;
    handleContentMessage(contentMessage: string): void;
}

export type Role = 'initiator' | 'responder';

export interface AuthMessage {
    nonce: string;
    token: string;
}

export interface ContentMessage {
    content: string;
}