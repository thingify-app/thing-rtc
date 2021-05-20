export interface TokenGenerator {
    /** Produces a token for authentication with the signalling server. */
    generateToken(): Promise<string>;

    getRole(): Role;

    /**
     * Signs each signalling message for verification by the peer.
     * Returns a base64-encoded string signature.
     */
    signMessage(message: string): Promise<string>;

    /**
     * Verifies a signalling message signature received by the peer.
     * The signature must be base64-encoded.
     */
    verifyMessage(base64Signature: string, message: string): Promise<boolean>;
}

/** Initial plain token generation without any signing, just to get started. */
export class BasicTokenGenerator implements TokenGenerator {
    constructor(private role: Role, private pairingId: string) {}

    async generateToken(): Promise<string> {
        const token = {
            role: this.role,
            pairingId: this.pairingId,
            expiry: Number.MAX_SAFE_INTEGER
        };
        return JSON.stringify(token);
    }

    getRole(): Role {
        return this.role;
    }

    async signMessage(message: string): Promise<string> {
        return '';
    }

    async verifyMessage(base64Signature: string, message: string): Promise<boolean> {
        return true;
    }
}

export type Role = 'initiator' | 'responder';
