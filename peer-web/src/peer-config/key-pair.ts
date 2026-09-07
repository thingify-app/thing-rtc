import { decode, encode } from 'base64-arraybuffer';
import { createStore, del, get, set } from 'idb-keyval';
import { PeerAuth } from './peer-auth';
import { PeerConfig, Role } from './peer-config';

const subtle = crypto.subtle;
const textEncoder = new TextEncoder();

const LOCAL_KEY_NAME = 'local-key';
const store = createStore('thing-rtc', 'local-key-pairs');

/**
 * Keypair representing the identity of our local client.
 */
export class LocalKeyPair {
    /**
     * Generate a new public/private keypair for local use.
     */
    static async createLocalKeyPair(): Promise<LocalKeyPair> {
        return await LocalKeyPair.createFromKeyPair(await generateKeyPair());
    }

    /**
     * Load the saved local public/private keypair from storage.
     */
    static async loadLocalKeyPair(): Promise<LocalKeyPair|null> {
        const cryptoKeyPair = await get(LOCAL_KEY_NAME, store);
        if (cryptoKeyPair) {
            return await LocalKeyPair.createFromKeyPair(cryptoKeyPair);
        } else {
            return null;
        }
    }

    /**
     * Clear the local public/private keypair storage.
     */
    static async clearLocalKeyPair(): Promise<void> {
        await del(LOCAL_KEY_NAME, store);
    }

    private static async createFromKeyPair(keyPair: CryptoKeyPair): Promise<LocalKeyPair> {
        const digest = await publicKeyDigest(keyPair.publicKey);
        const spki = await exportPublicKey(keyPair.publicKey);
        return new LocalKeyPair(keyPair, digest, spki);
    }

    private constructor(private keyPair: CryptoKeyPair, readonly publicKeyDigest: string, readonly publicKeySpki: string) {}

    async sign(message: ArrayBuffer): Promise<ArrayBuffer> {
        return await subtle.sign({
            name: 'ECDSA',
            hash: 'SHA-256'
        }, this.keyPair.privateKey, message);
    }

    /**
     * Save this key pair to storage, overwriting any existing keypair.
     */
    async save(): Promise<void> {
        await set(LOCAL_KEY_NAME, this.keyPair, store);
    }
}

/**
 * Public key representing the identity of a trusted remote peer.
 */
export class RemoteKey {
    /**
     * Create a RemoteKey representation of the provided SPKI, base64-encoded
     * public key.
     */
    static async createRemoteKey(spki: string): Promise<RemoteKey> {
        const publicKey = await importPublicKey(spki);
        const digest = await publicKeyDigest(publicKey);
        return new RemoteKey(publicKey, digest, spki);
    }

    private constructor(private publicKey: CryptoKey, readonly publicKeyDigest: string, readonly publicKeySpki: string) {}

    async verify(signature: ArrayBuffer, message: ArrayBuffer): Promise<boolean> {
        return await subtle.verify({
            name: 'ECDSA',
            hash: 'SHA-256'
        }, this.publicKey, signature, message);
    }
}

export namespace KeyPair {
    /**
     * Creates the PeerConfig representing a connection between the local client
     * and a provided remote peer.
     */
    export async function createConfig(remotePublicKey: RemoteKey, localKeyPair: LocalKeyPair, role: Role): Promise<PeerConfig> {
        const peerAuth = new WebCryptoPeerAuth(remotePublicKey, localKeyPair);
        const pairingId = await toPairingId(remotePublicKey, localKeyPair);

        return {
            pairingId,
            peerAuth,
            role,
        };
    }
}

export class WebCryptoPeerAuth implements PeerAuth {
    constructor(private remotePublicKey: RemoteKey, private localKeyPair: LocalKeyPair) {}

    async signMessage(message: string): Promise<string> {
        return encode(await this.localKeyPair.sign(textEncoder.encode(message).buffer));
    }

    async verifyMessage(base64Signature: string, message: string): Promise<boolean> {
        const messageBuffer = textEncoder.encode(message);
        return await this.remotePublicKey.verify(decode(base64Signature), messageBuffer.buffer);
    }
}

async function generateKeyPair(): Promise<CryptoKeyPair> {
    return await subtle.generateKey({
        name: 'ECDSA',
        namedCurve: 'P-256'
    }, false, ['sign', 'verify']);
}

/**
 * Imports a base64-encoded SPKI public key into a web CryptoKey object.
 */
async function importPublicKey(spki: string): Promise<CryptoKey> {
    const algorithm = {
        name: 'ECDSA',
        namedCurve: 'P-256'
    };
    return await subtle.importKey('spki', decode(spki), algorithm, true, ['verify']);
}

/**
 * Exports a SPKI public key from a web CryptoKey object.
 */
async function exportPublicKey(key: CryptoKey): Promise<string> {
    return encode(await subtle.exportKey('spki', key));
}

async function publicKeyDigest(key: CryptoKey): Promise<string> {
    const spki = await subtle.exportKey('spki', key);
    const hash = await subtle.digest('SHA-256', spki);
    return encode(hash);
}

async function toPairingId(remotePublicKey: RemoteKey, localKeyPair: LocalKeyPair): Promise<string> {
    // For public keys pairing IDs, we use the concatenated, sorted public key
    // fingerprints, separated by a ':' which is not present in the base64
    // fingerprints.
    const fingerprints = [
        remotePublicKey.publicKeyDigest,
        localKeyPair.publicKeyDigest
    ];
    return fingerprints.toSorted().join(':');
}
