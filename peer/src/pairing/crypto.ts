const subtle = crypto.subtle;
const textEncoder = new TextEncoder();

/**
 * Imports a JWK-formatted public key into a web CryptoKey object.
 */
export async function importPublicKey(jwk: string): Promise<CryptoKey> {
    const algorithm = {
        name: 'RSA-PSS',
        hash: 'SHA-256'
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
        name: 'RSA-PSS',
        modulusLength: 4096,
        // This is the default public exponent to use:
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: 'SHA-256'
    }, false, ['sign', 'verify']);
}

export async function signMessage(privateKey: CryptoKey, message: string): Promise<ArrayBuffer> {
    const buffer = textEncoder.encode(message);
    return await subtle.sign({
        name: 'RSA-PSS',
        saltLength: 32
    }, privateKey, buffer);
}

export async function verifyMessage(publicKey: CryptoKey, signature: string, message: string): Promise<boolean> {
    const signatureBuffer = textEncoder.encode(signature);
    const messageBuffer = textEncoder.encode(message);
    return await subtle.verify({
        name: 'RSA-PSS',
        saltLength: 32
    }, publicKey, signatureBuffer, messageBuffer);
}
