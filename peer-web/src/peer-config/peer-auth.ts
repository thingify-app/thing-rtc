export interface PeerAuth {
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
