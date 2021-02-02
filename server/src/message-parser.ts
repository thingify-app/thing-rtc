import { AuthValidator } from "./auth-validator";

export class MessageParser {
    constructor(private authValidator: AuthValidator, private messageHandler: MessageHandler) {}

    parseMessage(message: string): void {
        const json = JSON.parse(message);
        if (!json) {
            throw new Error('Invalid JSON.');
        }

        const type = json.type;
        switch (type) {
            case 'auth':
                this.messageHandler.handleAuthMessage(this.parseAuthMessage(json));
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

    private parseAuthMessage(json: any): AuthMessage {
        if (json.data && typeof(json.data) === 'string') {
            return this.authValidator.validateToken(json.data);
        } else {
            throw new Error('Invalid auth message.');
        }
    }
}

export interface MessageHandler {
    handleAuthMessage(authMessage: AuthMessage): void;
    handleContentMessage(contentMessage: string): void;
}

export type Role = 'initiator' | 'responder';

export interface AuthMessage {
    responderId: string;
    role: Role;
    expiry: number;
}

export interface ContentMessage {
    content: string;
}