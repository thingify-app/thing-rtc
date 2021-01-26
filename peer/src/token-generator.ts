export interface TokenGenerator {
    generateToken(): string;
}

/** Initial plain token generation without any signing, just to get started. */
export class BasicTokenGenerator implements TokenGenerator {
    constructor(private role: Role, private responderId: string) {}

    generateToken(): string {
        const token = {
            role: this.role,
            responderId: this.responderId,
            expiry: Number.MAX_SAFE_INTEGER
        };
        return JSON.stringify(token);
    }
}

export type Role = 'initiator' | 'responder';
