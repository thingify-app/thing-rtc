// Websocket layer which talks to server
// abstract websocket

export class SignallingServer {
    private socket?: WebSocket;

    constructor(private options: SignallingOptions) {}

    async connect(token: string): Promise<SignallingConnection> {
        return new Promise((resolve, reject) => {
            this.socket = new WebSocket(this.options.serverHost);
            this.socket.addEventListener('open', () => {
                resolve(new InternalSignallingConnection(this.socket!, token));
            });
        });
    }
}

export interface SignallingConnection {
    on(type: 'peerConnect', callback: () => void): void;
    on(type: 'iceCandidate', callback: (candidate: RTCIceCandidate) => void): void;
    on(type: 'offer', callback: (offer: RTCSessionDescriptionInit) => void): void;
    on(type: 'answer', callback: (answer: RTCSessionDescriptionInit) => void): void;
    on(type: 'peerDisconnect', callback: () => void): void;
    on(type: 'error', callback: () => void): void;
    sendIceCandidate(candidate: RTCIceCandidate): void;
    sendOffer(offer: RTCSessionDescriptionInit): void;
    sendAnswer(answer: RTCSessionDescriptionInit): void;
    disconnect(): void;
}

class InternalSignallingConnection implements SignallingConnection {
    private peerConnectListener?: () => void;
    private iceCandidateListener?: (candidate: RTCIceCandidate) => void;
    private offerListener?: (offer: RTCSessionDescriptionInit) => void;
    private answerListener?: (answer: RTCSessionDescriptionInit) => void;
    private peerDisconnectListener?: () => void;
    private errorListener?: () => void;

    constructor(private socket: WebSocket, private token: string) {
        socket.addEventListener('open', () => {
            this.sendAuthMessage();
        });
        socket.addEventListener('message', event => {
            this.handleMessage(event.data);
        });
        socket.addEventListener('error', () => {
            this.errorListener?.();
        });
        socket.addEventListener('close', () => {
            this.errorListener?.();
        });
    }

    private sendAuthMessage() {
        this.sendMessage({
            type: 'auth',
            token: this.token
        });
    }

    private handleMessage(message: any) {
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
        this.sendMessage({
            type: 'iceCandidate',
            candidate: candidate.toJSON()
        });
    }

    sendOffer(offer: RTCSessionDescriptionInit): void {
        this.sendMessage({
            type: 'offer',
            offer: offer
        });
    }

    sendAnswer(answer: RTCSessionDescriptionInit): void {
        this.sendMessage({
            type: 'answer',
            answer: answer
        });
    }

    private sendMessage(data: any) {
        this.socket.send(JSON.stringify(data));
    }

    disconnect(): void {
        this.socket.close();
    }
}

export interface SignallingOptions {
    serverHost: string;
}

export type Role = 'initiator' | 'responder';
