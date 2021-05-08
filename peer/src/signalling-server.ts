import { ConstantRetry, Retry } from "./retry";
import { TokenGenerator } from "./token-generator";

/** Abstracts two-way communication with the Signalling Server. */
export class SignallingServer {
    private socket?: WebSocket;
    private state: State = 'disconnected';
    private retry: Retry = new ConstantRetry();
    private messageQueue: {type: string, data: any}[] = [];

    private peerConnectListener?: () => void;
    private iceCandidateListener?: (candidate: RTCIceCandidate) => void;
    private offerListener?: (offer: RTCSessionDescriptionInit) => void;
    private answerListener?: (answer: RTCSessionDescriptionInit) => void;
    private peerDisconnectListener?: () => void;
    private errorListener?: () => void;

    constructor(private options: SignallingOptions) {}

    connect(): void {
        this.state = 'connected';
        this.socket = new WebSocket(this.options.serverUrl);
        this.socket.addEventListener('open', async () => {
            const token = await this.options.tokenGenerator.generateToken();
            this.sendAuthMessage(token);
            // TODO: look into whether we need to await some kind of auth confirmation.
            this.flushQueue();
        });
        this.socket.addEventListener('message', event => {
            this.handleMessage(event.data);
        });
        this.socket.addEventListener('error', () => {
            console.log('Socket error.');
            this.retry.retry(() => {
                this.socket?.close();
                this.connect();
            });
        });
        this.socket.addEventListener('close', () => {
            console.log('Socket close.');
            // Only retry if we are still actively trying to maintain a connection,
            // otherwise ourselves disconnecting will endlessly trigger this.
            if (this.state === 'connected') {
                this.retry.retry(() => {
                    this.socket?.close();
                    this.connect();
                });
            }
        });
    }

    private sendAuthMessage(token: string) {
        this.sendMessage('auth', token);
    }

    private flushQueue(): void {
        while (this.messageQueue.length > 0) {
            const message = this.messageQueue.shift()!;
            this.sendMessage(message.type, message.data);
        }
    }

    private handleMessage(message: any): void {
        if (message && typeof(message) === 'string') {
            const json = JSON.parse(message);
            if (json && json.type) {
                const data = json.data ? JSON.parse(json.data) : null;
                switch (json.type) {
                    case 'peerConnect':
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
        this.queueMessage('iceCandidate', candidate.toJSON());
    }

    sendOffer(offer: RTCSessionDescriptionInit): void {
        this.queueMessage('offer', offer);
    }

    sendAnswer(answer: RTCSessionDescriptionInit): void {
        this.queueMessage('answer', answer);
    }

    private queueMessage(type: string, data: any): void {
        if (this.isConnected()) {
            this.sendMessage(type, data);
        } else {
            this.messageQueue.push({type, data});
        }
    }

    private sendMessage(type: string, data: any): void {
        // Two levels of stringify, so that data can be parsed independently
        // after type is parsed.
        this.socket?.send(JSON.stringify({
            type: type,
            data: typeof(data) === 'string' ? data : JSON.stringify(data)
        }));
    }

    isConnected(): boolean {
        return this.socket?.readyState === WebSocket.OPEN;
    }

    disconnect(): void {
        this.state = 'disconnected';
        this.socket?.close();
        this.socket = undefined;
        this.messageQueue = [];
    }
}

export interface SignallingOptions {
    serverUrl: string;
    tokenGenerator: TokenGenerator;
}

/**
 * Current desired state - connected meaning that we want to be connected, not
 * necessarily that we are connected.
 */
type State = 'disconnected' | 'connected';
