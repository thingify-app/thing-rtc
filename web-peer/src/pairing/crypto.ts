const subtle = crypto.subtle;
const textEncoder = new TextEncoder();

/**
 * Imports a JWK-formatted public key into a web CryptoKey object.
 */
export async function importPublicKey(jwk: string): Promise<CryptoKey> {
    const algorithm = {
        name: 'ECDSA',
        namedCurve: 'P-256'
    };
    return await subtle.importKey('jwk', JSON.parse(jwk), algorithm, true, ['verify']);
}

/**
 * Exports a JWK-formatted public key from a web CryptoKey object.
 */
export async function exportPublicKey(key: CryptoKey): Promise<string> {
    return JSON.stringify(await subtle.exportKey('jwk', key));
}

export async function generateKeyPair(): Promise<CryptoKeyPair> {
    return await subtle.generateKey({
        name: 'ECDSA',
        namedCurve: 'P-256'
    }, false, ['sign', 'verify']);
}

export async function signMessage(privateKey: CryptoKey, message: string): Promise<ArrayBuffer> {
    const buffer = textEncoder.encode(message);
    return await subtle.sign({
        name: 'ECDSA',
        hash: 'SHA-256'
    }, privateKey, buffer);
}

export async function verifyMessage(publicKey: CryptoKey, signature: ArrayBuffer, message: string): Promise<boolean> {
    const messageBuffer = textEncoder.encode(message);
    return await subtle.verify({
        name: 'ECDSA',
        hash: 'SHA-256'
    }, publicKey, signature, messageBuffer);
}
