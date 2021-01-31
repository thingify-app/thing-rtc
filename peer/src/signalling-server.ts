import { TokenGenerator } from "./token-generator";

/** Abstracts two-way communication with the Signalling Server. */
export class SignallingServer {
    private socket?: WebSocket;
    private messageQueue: any[] = [];

    private peerConnectListener?: () => void;
    private iceCandidateListener?: (candidate: RTCIceCandidate) => void;
    private offerListener?: (offer: RTCSessionDescriptionInit) => void;
    private answerListener?: (answer: RTCSessionDescriptionInit) => void;
    private peerDisconnectListener?: () => void;
    private errorListener?: () => void;

    constructor(private options: SignallingOptions) {}

    connect(tokenGenerator: TokenGenerator): void {
        this.socket = new WebSocket(this.options.serverUrl);
        this.socket.addEventListener('open', () => {
            const token = tokenGenerator.generateToken();
            this.sendAuthMessage(token);
            // TODO: look into whether we need to await some kind of auth confirmation.
            this.flushQueue();
        });
        this.socket.addEventListener('message', event => {
            this.handleMessage(event.data);
        });
        this.socket.addEventListener('error', () => {
            this.errorListener?.();
        });
        this.socket.addEventListener('close', () => {
            this.errorListener?.();
        });
    }

    private sendAuthMessage(token: string) {
        this.sendMessage({
            type: 'auth',
            token: token
        });
    }

    private flushQueue(): void {
        while (this.messageQueue.length > 0) {
            this.sendMessage(this.messageQueue.shift());
        }
    }

    private handleMessage(message: any): void {
        if (message && typeof(message) === 'string') {
            const json = JSON.parse(message);
            if (json && json.type) {
                switch (json.type) {
                    case 'peerConnect':
                        this.peerConnectListener?.();
                        break;
                    case 'iceCandidate':
                        this.iceCandidateListener?.(json.candidate);
                        break;
                    case 'offer':
                        this.offerListener?.(json.offer);
                        break;
                    case 'answer':
                        this.answerListener?.(json.answer);
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
            default:
                throw new Error(`Unknown event type: ${type}`);
        }
    }

    sendIceCandidate(candidate: RTCIceCandidate): void {
        this.queueMessage({
            type: 'iceCandidate',
            candidate: candidate.toJSON()
        });
    }

    sendOffer(offer: RTCSessionDescriptionInit): void {
        this.queueMessage({
            type: 'offer',
            offer: offer
        });
    }

    sendAnswer(answer: RTCSessionDescriptionInit): void {
        this.queueMessage({
            type: 'answer',
            answer: answer
        });
    }

    private queueMessage(data: any): void {
        if (this.isConnected()) {
            this.sendMessage(data);
        } else {
            this.messageQueue.push(data);
        }
    }

    private sendMessage(data: any): void {
        this.socket?.send(JSON.stringify(data));
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

export interface SignallingOptions {
    serverUrl: string;
}
