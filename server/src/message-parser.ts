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
            case 'content':
                this.messageHandler.handleContentMessage(this.parseContentMessage(json));
                break;
            default:
                throw new Error('Unknown type.');
        }
    }

    private parseAuthMessage(json: any): AuthMessage {
        if (json.token && typeof(json.token) === 'string') {
            return this.authValidator.validateToken(json.token);
        } else {
            throw new Error('Invalid auth message.');
        }
    }

    private parseContentMessage(json: any): ContentMessage {
        if (json.content && typeof(json.content) === 'string') {
            return {
                content: json.content
            };
        } else {
            throw new Error('Invalid content message.');
        }
    }
}

export interface MessageHandler {
    handleAuthMessage(authMessage: AuthMessage): void;
    handleContentMessage(contentMessage: ContentMessage): void;
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