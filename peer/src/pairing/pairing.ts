import { PairingServer, PairingStatus } from './pairing-server';
import { PairingStorage } from './pairing-storage';
import { exportPublicKey, generateKeyPair, importPublicKey } from './crypto';
import { TokenGenerator } from '../token-generator';
import { PairingTokenGenerator } from './pairing-token-generator';

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

export class Pairing {

    constructor(
        private pairingServer: PairingServer,
        private pairingStorage: PairingStorage = new PairingStorage()
    ) {}

    async initiatePairing(): Promise<PendingPairing> {
        const keyPair = await generateKeyPair();
        const publicKey = await exportPublicKey(keyPair.publicKey);
        const response = await this.pairingServer.createPairingRequest(publicKey);
        const initialPairingData = response.pairingData;

        const initialData = {
            pairingId: initialPairingData.pairingId,
            serverToken: initialPairingData.token,
            shortcode: initialPairingData.shortcode,
            localKeyPair: keyPair,
            redemptionResult: () => response.redemptionResult()
        };

        return new ConcretePendingPairing(initialData, this.pairingStorage);
    }

    async respondToPairing(shortcode: string): Promise<PairingResponse> {
        const keyPair = await generateKeyPair();
        const publicKey = await exportPublicKey(keyPair.publicKey);
        const peerDetails = await this.pairingServer.respondToPairingRequest(shortcode, publicKey);
        const remotePublicKey = await importPublicKey(peerDetails.responderPublicKey);

        await this.pairingStorage.savePairing({
            pairingId: peerDetails.pairingId,
            role: 'initiator',
            serverToken: peerDetails.initiatorToken,
            localKeyPair: keyPair,
            remotePublicKey: remotePublicKey
        });

        return {
            pairingId: peerDetails.pairingId,
            serverToken: peerDetails.initiatorToken,
            localPublicKey: publicKey,
            remotePublicKey: peerDetails.responderPublicKey
        }
    }

    async getAllPairingIds(): Promise<string[]> {
        const pairings = await this.pairingStorage.getAllPairings();
        return pairings.map(pairing => pairing[0]);
    }

    async getTokenGenerator(pairingId: string): Promise<TokenGenerator> {
        const pairingData = await this.pairingStorage.getPairing(pairingId);
        if (!pairingData) {
            throw new Error(`Pairing ID '${pairingId}' not found!`);
        }
        return new PairingTokenGenerator(pairingData);
    }

    async clearAllPairings(): Promise<void> {
        await this.pairingStorage.clearAllPairings();
    }
}

export interface PendingPairing {
    shortcode: string;
    redemptionResult(): Promise<PairingRedemptionResponse>;
}

class ConcretePendingPairing implements PendingPairing {
    constructor(
        private initialData: PairingInitiation,
        private pairingStorage: PairingStorage
    ) {}

    get shortcode(): string {
        return this.initialData.shortcode;
    }

    async redemptionResult(): Promise<PairingRedemptionResponse> {
        const response = await this.initialData.redemptionResult();
        if (!response.initiatorPublicKey) {
            throw new Error('Missing public key in response.');
        }

        const remotePublicKey = await importPublicKey(response.initiatorPublicKey);
        await this.pairingStorage.savePairing({
            pairingId: this.initialData.pairingId,
            role: 'responder',
            serverToken: this.initialData.serverToken,
            localKeyPair: this.initialData.localKeyPair,
            remotePublicKey: remotePublicKey
        });

        return {
            remotePublicKey: response.initiatorPublicKey
        };
    }
}

interface PairingInitiation {
    pairingId: string;
    shortcode: string;
    serverToken: string;
    localKeyPair: CryptoKeyPair;
    redemptionResult(): Promise<PairingStatus>;
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
