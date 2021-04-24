import * as jwt from 'jsonwebtoken';
import { AuthEntry, AuthStorage } from './storage';
import { generatePairingId, generateShortcode } from './utils';

const JWT_OPTIONS: jwt.SignOptions = {
    algorithm: 'RS256'
};
const EXPIRY_MILLIS = 60*1000;

export class AuthServer {

    constructor(
        private storage: AuthStorage,
        private privateKey: string,
        private currentMillis: () => number = () => Date.now()
    ) {}

    createPairingRequest(responderPublicKey: string): ResponderPairDetails {
        const pairingId = generatePairingId();
        const shortcode = generateShortcode();
        const expiry = this.currentMillis() + EXPIRY_MILLIS;

        const entry: AuthEntry = {
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
        const signedToken = jwt.sign(token, this.privateKey, JWT_OPTIONS);

        return {
            pairingId,
            expiry,
            shortcode,
            responderToken: signedToken,
        };
    }

    checkPairingStatus(pairingId: string): PairingStatus {
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

    respondToPairingRequest(shortcode: string, initiatorPublicKey: string): InitiatorPairDetails {
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
        const signedToken = jwt.sign(token, this.privateKey, JWT_OPTIONS);

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
