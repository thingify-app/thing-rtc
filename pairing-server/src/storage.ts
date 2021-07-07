export interface Storage {
    putEntry(entry: PairingEntry): void;
    getEntryByShortcode(shortcode: string): PairingEntry;
    deleteEntry(entry: PairingEntry): void;
}

export class InMemoryStorage implements Storage {
    private shortcodeMapping = new Map<string, PairingEntry>();
    private pairingIdMapping = new Map<string, PairingEntry>();

    putEntry(entry: PairingEntry) {
        this.shortcodeMapping.set(entry.shortcode, entry);
        this.pairingIdMapping.set(entry.pairingId, entry);
    }

    getEntryByShortcode(shortcode: string): PairingEntry {
        return this.shortcodeMapping.get(shortcode);
    }

    deleteEntry(entry: PairingEntry) {
        this.shortcodeMapping.delete(entry.shortcode);
        this.pairingIdMapping.delete(entry.pairingId);
    }
}

export interface PairingEntry {
    shortcode: string;
    pairingId: string;
    expiry: number;
    responderPublicKey: string;

    notifyComplete: (initiatorPublicKey: string) => void;
}
