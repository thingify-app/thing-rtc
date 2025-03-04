import { SignJWT, KeyLike } from 'jose';
import { ChannelSession, PairingEntry } from './channel-session';
import { ConnectionChannelFactory } from './connection-channel';
import { generatePairingId, generateShortcode, realTimeoutWrapper, TimeoutWrapper } from './utils';

const EXPIRY_MILLIS = 60*1000;
const RESPONSE_TIMEOUT = 10_000;

export class PairingServer {

    constructor(
        private channelFactory: ConnectionChannelFactory,
        private privateKey: KeyLike,
        private shortcodeGenerator: () => string = generateShortcode,
        private pairingIdGenerator: () => string = generatePairingId,
        private currentMillis: () => number = () => Date.now(),
        private withTimeout: TimeoutWrapper = realTimeoutWrapper
    ) {}

    async createPairingRequest(responderPublicKey: string): Promise<PendingPairing> {
        const shortcode = this.shortcodeGenerator();
        const pairingId = this.pairingIdGenerator();
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
            shortcode,
            responderPublicKey
        };

        const channel = await this.channelFactory.getConnectionChannel(shortcode);
        const session = new ChannelSession(channel);

        // We can't await on the response promise, as we need to return the
        // pending pairing first (including shortcode). We handle the response
        // asynchronously and call the relevant callback on the pendingPairing.
        this.withTimeout(session.waitForResponse(), EXPIRY_MILLIS).then(async initiatorPublicKey => {
            await session.confirmResponse(entry);
            pendingPairing.complete(initiatorPublicKey);
        }).catch(_ => {
            pendingPairing.expire();
        });

        return pendingPairing;
    }

    async respondToPairingRequest(shortcode: string, initiatorPublicKey: string): Promise<InitiatorPairDetails> {
        const channel = await this.channelFactory.getConnectionChannel(shortcode);
        const session = new ChannelSession(channel);

        await session.sendResponse(initiatorPublicKey);

        try {
            const entry = await this.withTimeout(session.waitForConfirmation(), RESPONSE_TIMEOUT);

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
        } catch (err) {
            console.error(err);
            // A timeout on waiting for confirmation could mean the shortcode
            // used to exist but expired, or has never existed. In any case, the
            // shortcode does not exist for the client.
            throw new Error('Shortcode does not exist!');
        }
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
