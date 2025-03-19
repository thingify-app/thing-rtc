import { SignJWT, KeyLike } from 'jose';
import { ChannelSession, PairingEntry } from './channel-session';
import { ConnectionChannelFactory } from './connection-channel';
import { generatePairingId, generateShortcode, realTimeoutWrapper, TimeoutWrapper } from './utils';
import { Socket } from './socket';
import { z } from 'zod';

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
        let message: string;
        try {
            message = await this.withTimeout(socket.listenMessage(), RESPONSE_TIMEOUT);
        } catch (err) {
            console.error(err);
            await socket.close();
            return;
        }

        let parsedMessage: OpeningMessage;
        try {
            parsedMessage = OpeningMessage.parse(JSON.parse(message));
        } catch (err) {
            console.error(err);
            await socket.sendMessage('Invalid message!');
            await socket.close();
            return;
        }

        const responderPublicKey = parsedMessage.publicKey;

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
            responderPublicKey,
            metadata: parsedMessage.metadata
        };

        try {
            const response = await this.withTimeout(session.waitForResponse(), EXPIRY_MILLIS);

            await session.confirmResponse(entry);

            await socket.sendMessage(JSON.stringify({
                status: 'paired',
                initiatorPublicKey: response.publicKey,
                metadata: response.metadata
            }));
        } catch (err) {
            await socket.sendMessage(JSON.stringify({
                status: 'expired',
            }));
        }

        await socket.close();
    }

    async respondToPairingRequest(shortcode: string, initiatorPublicKey: string, metadata: Record<string, string>): Promise<InitiatorPairDetails> {
        const channel = await this.channelFactory.getConnectionChannel(shortcode);
        const session = new ChannelSession(channel);

        await session.sendResponse(initiatorPublicKey, metadata);

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
                initiatorToken: signedToken,
                metadata: entry.metadata
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

const OpeningMessage = z.object({
    publicKey: z.string(),
    metadata: z.record(z.string(), z.string()),
});
type OpeningMessage = z.infer<typeof OpeningMessage>;


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
    metadata: Record<string, string>;
}

export interface PairingToken {
    role: 'initiator' | 'responder';
    pairingId: string;
}
