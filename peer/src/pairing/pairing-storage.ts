import { clear, createStore, del, entries, get, set } from 'idb-keyval';

export class PairingStorage {
    private store = createStore('thing-rtc-pairing', 'pairings');

    async savePairing(data: PairingData): Promise<void> {
        const privateKeyExtractable = data.localKeyPair.privateKey.extractable;
        const publicKeyIsPublic = data.remotePublicKey.type === 'public';
        if (privateKeyExtractable || !publicKeyIsPublic) {
            throw new Error('Invalid key data.');
        }

        // Combine pairingId with role so that we can store both peer pairs in
        // the one browser if desired (largely for testing).
        const id = `${data.pairingId}-${data.role}`;
        await set(id, data, this.store);
    }

    async deletePairing(pairingId: string): Promise<void> {
        await del(pairingId, this.store);
    }

    async getAllPairings(): Promise<[string, PairingData][]> {
        return await entries(this.store) as [string, PairingData][];
    }

    async getPairing(pairingId: string): Promise<PairingData|undefined> {
        return await get(pairingId, this.store);
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
