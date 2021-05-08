import { clear, createStore, del, set, values } from 'idb-keyval';

export class PairingStorage {
    private store = createStore('thing-rtc-pairing', 'pairings');

    async savePairing(data: PairingData): Promise<void> {
        const privateKeyExtractable = data.localKeyPair.privateKey.extractable;
        const publicKeyIsPublic = data.remotePublicKey.type === 'public';
        if (privateKeyExtractable || !publicKeyIsPublic) {
            throw new Error('Invalid key data.');
        }
        await set(data.pairingId, data, this.store);
    }

    async deletePairing(pairingId: string): Promise<void> {
        await del(pairingId, this.store);
    }

    async getAllPairings(): Promise<PairingData[]> {
        return await values(this.store);
    }

    async clearAllPairings(): Promise<void> {
        await clear(this.store);
    }
}

export type Role = 'initiator' | 'responder';

export interface PairingData {
    pairingId: string;
    role: Role;
    serverToken: string;
    localKeyPair: CryptoKeyPair;
    remotePublicKey: CryptoKey;
}
