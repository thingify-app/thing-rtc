export interface TokenGenerator {
    /** Produces a token for authentication with the signalling server. */
    generateToken(): Promise<string>;

    /** Signs each signalling message for verification by the peer. */
    signMessage(message: string): Promise<ArrayBuffer>;

    /**
     * Verifies a signalling message signature received by the peer.
     * The signature must be base64-encoded.
     */
    verifyMessage(signature: string, message: string): Promise<boolean>;
}

/** Initial plain token generation without any signing, just to get started. */
export class BasicTokenGenerator implements TokenGenerator {
    constructor(private role: Role, private responderId: string) {}

    async generateToken(): Promise<string> {
        const token = {
            role: this.role,
            responderId: this.responderId,
            expiry: Number.MAX_SAFE_INTEGER
        };
        return JSON.stringify(token);
    }

    async signMessage(message: string): Promise<ArrayBuffer> {
        return new ArrayBuffer(0);
    }

    async verifyMessage(signature: string, message: string): Promise<boolean> {
        return true;
    }
}

export type Role = 'initiator' | 'responder';
