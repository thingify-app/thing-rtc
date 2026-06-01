import { generateNonce } from "./nonce-generator";
import { PeerAuth } from "./peer-config/peer-auth";
import { ServerAuth } from "./server-auth";

/** Abstracts two-way communication with the Signalling Server. */
export class SignallingServer {
    private socket?: WebSocket;
    private messageQueue: {type: string, data: object}[] = [];
    private localNonce?: string;
    private remoteNonce?: string;

    private peerConnectListener?: () => void;
    private iceCandidateListener?: (candidate: RTCIceCandidate) => void;
    private offerListener?: (offer: RTCSessionDescriptionInit) => void;
    private answerListener?: (answer: RTCSessionDescriptionInit) => void;
    private peerDisconnectListener?: () => void;
    private errorListener?: () => void;
    private closeListener?: () => void;

    constructor(
        private serverUrl: string,
        private serverAuth: ServerAuth,
        private peerAuth: PeerAuth,
        private pairingId: string,
        private nonceGenerator: () => string = generateNonce
    ) {}

    connect(): void {
        const url = `${this.serverUrl}/${this.pairingId}`;
        this.socket = new WebSocket(url);
        this.socket.addEventListener('open', async () => {
            const token = await this.serverAuth.generateToken();
            this.sendAuthMessage(token);
            // TODO: look into whether we need to await some kind of auth confirmation.
            this.flushQueue();
        });
        this.socket.addEventListener('message', async event => {
            try {
                await this.handleMessage(event.data);
            } catch (e) {
                this.disconnect();
            }
        });
        this.socket.addEventListener('error', () => {
            console.log('Socket error.');
            this.errorListener?.();
        });
        this.socket.addEventListener('close', () => {
            console.log('Socket close.');
            this.closeListener?.();
        });
    }

    private sendAuthMessage(token: string) {
        this.localNonce = this.nonceGenerator();
        const message = {
            nonce: this.localNonce,
            token
        };
        this.sendMessage('auth', message, false);
    }

    private flushQueue(): void {
        while (this.messageQueue.length > 0) {
            const message = this.messageQueue.shift()!;
            this.sendMessage(message.type, message.data, true);
        }
    }

    private async handleMessage(message: any): Promise<void> {
        if (message && typeof(message) === 'string') {
            const json = JSON.parse(message);
            if (json && json.type) {
                let data = null;
                if (json.data) {
                    data = JSON.parse(json.data);
                    if (this.localNonce !== data.nonce) {
                        throw new Error('Nonce did not match expected value.');
                    }
                    if (!json.signature) {
                        throw new Error('Signature missing from received message.');
                    }
                    const verified = await this.peerAuth.verifyMessage(json.signature, json.data);
                    if (!verified) {
                        throw new Error('Signature did not match message.');
                    }
                    delete data.nonce;
                }
                switch (json.type) {
                    case 'peerConnect':
                        if (!json.nonce) {
                            throw new Error('Nonce missing from peerConnect message.');
                        }
                        this.remoteNonce = json.nonce;
                        this.peerConnectListener?.();
                        break;
                    case 'iceCandidate':
                        this.iceCandidateListener?.(data);
                        break;
                    case 'offer':
                        this.offerListener?.(data);
                        break;
                    case 'answer':
                        this.answerListener?.(data);
                        break;
                    case 'peerDisconnect':
                        this.peerDisconnectListener?.();
                        break;
                    default:
                        throw new Error(`Unknown message type received: ${json.type}`);
                }
            } else {
                throw new Error('Unknown message received');
            }
        }
    }

    on(type: 'peerConnect', callback: () => void): void;
    on(type: 'iceCandidate', callback: (candidate: RTCIceCandidate) => void): void;
    on(type: 'offer', callback: (offer: RTCSessionDescriptionInit) => void): void;
    on(type: 'answer', callback: (answer: RTCSessionDescriptionInit) => void): void;
    on(type: 'peerDisconnect', callback: () => void): void;
    on(type: 'error', callback: () => void): void;
    on(type: 'close', callback: () => void): void;
    on(type: string, callback: any) {
        switch (type) {
            case 'peerConnect':
                this.peerConnectListener = callback;
                break;
            case 'iceCandidate':
                this.iceCandidateListener = callback;
                break;
            case 'offer':
                this.offerListener = callback;
                break;
            case 'answer':
                this.answerListener = callback;
                break;
            case 'peerDisconnect':
                this.peerDisconnectListener = callback;
                break;
            case 'error':
                this.errorListener = callback;
                break;
            case 'close':
                this.closeListener = callback;
                break;
            default:
                throw new Error(`Unknown event type: ${type}`);
        }
    }

    sendIceCandidate(candidate: RTCIceCandidate): void {
        this.queueMessage('iceCandidate', candidate.toJSON());
    }

    sendOffer(offer: RTCSessionDescriptionInit): void {
        // The type and sdp properties are actually accessors, so we pull them
        // out into plain properties here (spread fails on accessors).
        this.queueMessage('offer', {
            type: offer.type,
            sdp: offer.sdp
        });
    }

    sendAnswer(answer: RTCSessionDescriptionInit): void {
        // The type and sdp properties are actually accessors, so we pull them
        // out into plain properties here (spread fails on accessors).
        this.queueMessage('answer', {
            type: answer.type,
            sdp: answer.sdp
        });
    }

    private queueMessage(type: string, data: object): void {
        if (this.isConnected()) {
            this.sendMessage(type, data, true);
        } else {
            this.messageQueue.push({type, data});
        }
    }

    private async sendMessage(type: string, data: object, sign: boolean): Promise<void> {
        let signature = undefined;
        let stringData: string;

        if (sign) {            
            const dataWithNonce = {
                ...data,
                nonce: this.remoteNonce
            };
            // Two levels of stringify, so that data can be parsed independently
            // after type is parsed.
            stringData = JSON.stringify(dataWithNonce);
            signature = await this.peerAuth.signMessage(stringData);
        } else {
            stringData = JSON.stringify(data);
        }

        this.socket?.send(JSON.stringify({
            type: type,
            signature: signature,
            data: stringData
        }));
    }

    isConnected(): boolean {
        return this.socket?.readyState === WebSocket.OPEN;
    }

    disconnect(): void {
        this.socket?.close();
        this.socket = undefined;
        this.messageQueue = [];
    }
}
