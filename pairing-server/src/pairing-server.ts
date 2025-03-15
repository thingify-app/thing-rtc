import { SignJWT, KeyLike } from 'jose';
import { ChannelSession, PairingEntry } from './channel-session';
import { ConnectionChannelFactory } from './connection-channel';
import { generatePairingId, generateShortcode, realTimeoutWrapper, TimeoutWrapper } from './utils';
import { Socket } from './socket';

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

    async createPairingRequest(socket: Socket): Promise<void> {
        const responderPublicKey = await socket.listenMessage();

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

        const channel = await this.channelFactory.getConnectionChannel(shortcode);
        const session = new ChannelSession(channel);

        await socket.sendMessage(JSON.stringify(initialData));

        const entry: PairingEntry = {
            pairingId,
            shortcode,
            responderPublicKey
        };

        try {
            const initiatorPublicKey = await this.withTimeout(session.waitForResponse(), EXPIRY_MILLIS);

            await session.confirmResponse(entry);

            await socket.sendMessage(JSON.stringify({
                status: 'paired',
                initiatorPublicKey,
            }));
        } catch (err) {
            await socket.sendMessage(JSON.stringify({
                status: 'expired',
            }));
        }

        await socket.close();
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
