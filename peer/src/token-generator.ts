/** Initial plain token generation without any signing, just to get started. */
export function generateToken(role: 'initiator' | 'responder', responderId: string): string {
    const token = {
        role,
        responderId,
        expiry: Number.MAX_SAFE_INTEGER
    };
    return JSON.stringify(token);
}
