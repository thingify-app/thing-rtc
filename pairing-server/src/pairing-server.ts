import { SignJWT, KeyLike } from 'jose/jwt/sign';
import { PairingEntry, Storage } from './storage';
import { generatePairingId, generateShortcode } from './utils';

const EXPIRY_MILLIS = 60*1000;
const SET_TIMEOUT = (callback: () => void, millis: number) => {
    setTimeout(callback, millis);
};

export class PairingServer {

    constructor(
        private storage: Storage,
        private privateKey: KeyLike,
        private currentMillis: () => number = () => Date.now(),
        private scheduleMillis: (callback: () => void, millis: number) => void = SET_TIMEOUT
    ) {}

    async createPairingRequest(responderPublicKey: string): Promise<PendingPairing> {
        const pairingId = generatePairingId();
        const shortcode = generateShortcode();
        const expiry = this.currentMillis() + EXPIRY_MILLIS;

        const token: PairingToken = {
            role: 'responder',
            pairingId
        };
        const signedToken = await new SignJWT(token as any)
            .setProtectedHeader({ alg: 'RS256' })
            .sign(this.privateKey);

        const initialData: InitialPairingData = {
            pairingId,
            expiry,
            shortcode,
            token: signedToken
        };

        const pendingPairing = new PendingPairing(initialData);
        
        const entry: PairingEntry = {
            pairingId,
            expiry,
            shortcode,
            responderPublicKey,
            notifyComplete: publicKey => pendingPairing.complete(publicKey)
        };
        this.storage.putEntry(entry);

        this.scheduleMillis(() => {
            pendingPairing.expire();
            this.storage.deleteEntry(entry);
        }, EXPIRY_MILLIS);

        return pendingPairing;
    }

    async respondToPairingRequest(shortcode: string, initiatorPublicKey: string): Promise<InitiatorPairDetails> {
        const entry = this.storage.getEntryByShortcode(shortcode);
        const now = this.currentMillis();

        if (!entry || entry.expiry <= now) {
            throw new Error('Shortcode does not exist!');
        }

        this.storage.deleteEntry(entry);
        entry.notifyComplete(initiatorPublicKey);

        const token: PairingToken = {
            role: 'initiator',
            pairingId: entry.pairingId
        };
        const signedToken = await new SignJWT(token as any)
            .setProtectedHeader({ alg: 'RS256' })
            .sign(this.privateKey);

        return {
            pairingId: entry.pairingId,
            responderPublicKey: entry.responderPublicKey,
            initiatorToken: signedToken
        };
    }
}

export class PendingPairing {
    private resolve = (pairingStatus: PairingStatus) => { this.result = pairingStatus; };
    private result: PairingStatus = null;

    constructor(private initialData: InitialPairingData) {}

    get pairingData(): InitialPairingData {
        return this.initialData;
    }

    async redemptionResult(): Promise<PairingStatus> {
        if (this.result) {
            return this.result;
        }
        return new Promise((resolve, reject) => {
            this.resolve = resolve;
        });
    }

    complete(publicKey: string) {
        this.resolve({
            status: 'paired',
            initiatorPublicKey: publicKey
        });
    }

    expire() {
        this.resolve({
            status: 'expired'
        });
    }
}

export interface InitialPairingData {
    pairingId: string;
    shortcode: string;
    token: string;
    expiry: number;
}

export interface PairingStatus {
    status: 'paired' | 'expired';
    initiatorPublicKey?: string;
}

export interface InitiatorPairDetails {
    pairingId: string;
    responderPublicKey: string;
    initiatorToken: string;
}

export interface PairingToken {
    role: 'initiator' | 'responder';
    pairingId: string;
}
