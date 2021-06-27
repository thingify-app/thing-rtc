import { SignJWT, KeyLike } from 'jose/jwt/sign';
import { PairingEntry, Storage } from './storage';
import { generatePairingId, generateShortcode } from './utils';

const EXPIRY_MILLIS = 60*1000;

export class PairingServer {

    constructor(
        private storage: Storage,
        private privateKey: KeyLike,
        private currentMillis: () => number = () => Date.now()
    ) {}

    async createPairingRequest(responderPublicKey: string): Promise<ResponderPairDetails> {
        const pairingId = generatePairingId();
        const shortcode = generateShortcode();
        const expiry = this.currentMillis() + EXPIRY_MILLIS;

        const entry: PairingEntry = {
            pairingId,
            expiry,
            shortcode,
            responderPublicKey,
            redeemed: false
        };
        this.storage.putEntry(entry);

        const token: PairingToken = {
            role: 'responder',
            pairingId
        };
        const signedToken = await new SignJWT(token as any)
            .setProtectedHeader({ alg: 'RS256' })
            .sign(this.privateKey);

        return {
            pairingId,
            expiry,
            shortcode,
            responderToken: signedToken,
        };
    }

    async checkPairingStatus(pairingId: string): Promise<PairingStatus> {
        const entry = this.storage.getEntryByPairingId(pairingId);
        const now = this.currentMillis();

        if (!entry || entry.expiry <= now) {
            throw new Error('Pairing ID does not exist!');
        }

        if (entry.redeemed) {
            this.storage.deleteEntry(entry);
            return {
                status: 'paired',
                initiatorPublicKey: entry.initiatorPublicKey
            };
        } else {
            return {
                status: 'awaiting'
            };
        }
    }

    async respondToPairingRequest(shortcode: string, initiatorPublicKey: string): Promise<InitiatorPairDetails> {
        const entry = this.storage.getEntryByShortcode(shortcode);
        const now = this.currentMillis();

        if (!entry || entry.redeemed || entry.expiry <= now) {
            throw new Error('Shortcode does not exist!');
        }

        entry.initiatorPublicKey = initiatorPublicKey;
        entry.redeemed = true;
        this.storage.putEntry(entry);

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

export interface ResponderPairDetails {
    pairingId: string;
    shortcode: string;
    responderToken: string;
    expiry: number;
}

export interface PairingStatus {
    status: 'awaiting' | 'paired';
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
