import { decode, encode } from 'base64-arraybuffer';
import { PeerAuth } from './peer-auth';
import { PeerConfig } from './peer-config';

const subtle = crypto.subtle;
const textEncoder = new TextEncoder();


export interface SharedSecretConfig {
    secretBase64: string;
    peerConfig: PeerConfig;
}

export async function createInitiatorConfig(): Promise<SharedSecretConfig> {
    const key = await subtle.generateKey({name: 'HMAC', hash: { name: 'SHA-256' }}, true, ['sign', 'verify']);
    const keyBytes = await subtle.exportKey('raw', key);
    const peerAuth = await SharedSecretPeerAuth.create(keyBytes);

    // For shared secret keys, we use the hash of the key as the pairing ID:
    const pairingIdBytes = await subtle.digest('SHA-256', keyBytes);
    const pairingId = encode(pairingIdBytes);

    const peerConfig: PeerConfig = {
        pairingId,
        peerAuth,
        role: 'initiator',
    };

    return {
        secretBase64: encode(keyBytes),
        peerConfig,
    };
}

export async function createResponderConfig(sharedKeyBase64: string): Promise<PeerConfig> {
    const keyBytes = decode(sharedKeyBase64)

    // For shared secret keys, we use the hash of the key as the pairing ID:
    const pairingIdBytes = await subtle.digest('SHA-256', keyBytes);
    const pairingId = encode(pairingIdBytes);

    const peerAuth = await SharedSecretPeerAuth.create(keyBytes);

    return {
        pairingId,
        peerAuth,
        role: 'responder',
    }
}

export class SharedSecretPeerAuth implements PeerAuth {
    /**
     * Creates an instance of PeerAuth where each peer knows the same shared
     * secret, and signs/verifies eachothers' messages with it.
     * 
     * @param sharedSecret raw bytes of the shared signing secret.
     */
    static async create(sharedSecret: ArrayBuffer): Promise<PeerAuth> {
        const sharedKey = await subtle.importKey(
            'raw',
            sharedSecret,
            {
                name: 'HMAC',
                hash: 'SHA-256'
            },
            false,
            ['sign', 'verify']
        );
        return new SharedSecretPeerAuth(sharedKey);
    }

    private constructor(private sharedKey: CryptoKey) {}

    async signMessage(message: string): Promise<string> {
        const signature = await subtle.sign(
            'HMAC',
            this.sharedKey,
            textEncoder.encode(message)
        );
        return encode(signature);
    }

    async verifyMessage(base64Signature: string, message: string): Promise<boolean> {
        return await subtle.verify(
            'HMAC',
            this.sharedKey,
            decode(base64Signature),
            textEncoder.encode(message)
        );
    }
}
