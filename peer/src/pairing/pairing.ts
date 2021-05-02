import { PairingServer, PairingStatus } from './pairing-server';

const subtle = crypto.subtle;

// API for creating a pairing request:
// * generates its own keypair.
// * sends pairing request to pairing server
// * returns shortcode, pairingId, server token, and local public key to the application
// * the application should display the shortcode to the user
// * keeps checking pairing status until expiry (~1min)
// * triggers failure callback if anything goes wrong (e.g. pairing request expires without redemption)
// * triggers success callback if pairing succeeded, and returns the peer's public key to the application
// * the application should show its own public key to the user, and verify the peer's public key e.g. by using SSH randomart-like representation to compare with other device.
// * if the user approves the pairing, it is committed into persistent storage (i.e. IndexedDB)

// API for responding to pairing request:
// * takes shortcode from the user as input
// * generates its own keypair
// * sends pairing response to pairing server
// * on failure, it returns an error response (e.g. the shortcode was incorrect).
// * on success, it returns the pairingId, local public key, server token and remote public key to the application
// * as above, the application should show the remote and local public keys to the user for confirmation
// * if the user approves the pairing, it is committed into persistent storage

// API for retrieving pairings:
// * returns list of pairs, each with human-readable name, pairingId, remote public key, local public key, server token, and method for signing with the non-extractable local private key.
// * provides method to delete pairings.

async function sleep(millis: number): Promise<void> {
    return new Promise(resolve => {
        setTimeout(resolve, millis);
    });
}

export class Pairing {

    constructor(
        private pairingServer: PairingServer,
        private sleeper: (millis: number) => Promise<void> = sleep
    ) {}

    async initiatePairing(): Promise<PairingInitiation> {
        const keyPair = await this.generateKeyPair();
        const publicKey = JSON.stringify(await subtle.exportKey('jwk', keyPair.publicKey));
        const response = await this.pairingServer.createPairingRequest(publicKey);
        return {
            pairingId: response.pairingId,
            serverToken: response.responderToken,
            shortcode: response.shortcode,
            localPublicKey: publicKey
        };
    }

    async pairingRedemptionResult(pairingId: string): Promise<PairingRedemptionResponse> {
        let response: PairingStatus | null = null;
        while (response?.status !== 'paired') {
            response = await this.pairingServer.checkPairingStatus(pairingId);
            await this.sleeper(1000);
        }
        if (!response.initiatorPublicKey) {
            throw new Error('Missing public key in response.');
        }
        return {
            remotePublicKey: response.initiatorPublicKey
        };
    }

    async respondToPairing(shortcode: string): Promise<PairingResponse> {
        const keyPair = await this.generateKeyPair();
        const publicKey = JSON.stringify(await subtle.exportKey('jwk', keyPair.publicKey));
        const peerDetails = await this.pairingServer.respondToPairingRequest(shortcode, publicKey);
        return {
            pairingId: peerDetails.pairingId,
            serverToken: peerDetails.initiatorToken,
            localPublicKey: publicKey,
            remotePublicKey: peerDetails.responderPublicKey
        }
    }

    private async generateKeyPair(): Promise<CryptoKeyPair> {
        return await subtle.generateKey({
            name: 'RSA-PSS',
            modulusLength: 4096,
            // This is the default public exponent to use:
            publicExponent: new Uint8Array([1, 0, 1]),
            hash: 'SHA-256'
        }, false, ['sign', 'verify']);
    }
}

export interface PairingInitiation {
    pairingId: string;
    shortcode: string;
    serverToken: string;
    localPublicKey: string;
}

export interface PairingResponse {
    pairingId: string;
    serverToken: string;
    localPublicKey: string;
    remotePublicKey: string;
}

export interface PairingRedemptionResponse {
    remotePublicKey: string;
}
