export interface AuthStorage {
    putEntry(entry: AuthEntry): void;
    getEntryByShortcode(shortcode: string): AuthEntry;
    getEntryByPairingId(pairingId: string): AuthEntry;
    deleteEntry(entry: AuthEntry): void;
}

export class InMemoryAuthStorage implements AuthStorage {
    private shortcodeMapping = new Map<string, AuthEntry>();
    private pairingIdMapping = new Map<string, AuthEntry>();

    putEntry(entry: AuthEntry) {
        this.shortcodeMapping.set(entry.shortcode, entry);
        this.pairingIdMapping.set(entry.pairingId, entry);
    }

    getEntryByShortcode(shortcode: string): AuthEntry {
        return this.shortcodeMapping.get(shortcode);
    }

    getEntryByPairingId(pairingId: string): AuthEntry {
        return this.pairingIdMapping.get(pairingId);
    }

    deleteEntry(entry: AuthEntry) {
        this.shortcodeMapping.delete(entry.shortcode);
        this.pairingIdMapping.delete(entry.pairingId);
    }
}

export interface AuthEntry {
    shortcode: string;
    pairingId: string;
    expiry: number;
    redeemed: boolean;
    initiatorPublicKey?: string;
    responderPublicKey: string;
}
