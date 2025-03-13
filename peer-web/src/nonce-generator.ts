import { encode } from 'base64-arraybuffer';

/**
 * Generates a base64-encoded cryptographically-strong random nonce.
 */
export function generateNonce(): string {
    const array = new Uint8Array(18);
    window.crypto.getRandomValues(array);
    return encode(array);
}
