// Websocket layer which talks to server
// abstract websocket

export class SignallingServer {
    private socket?: WebSocket;

    private peerConnectListener?: () => void;
    private iceCandidateListener?: (candidate: RTCIceCandidate) => void;
    private offerListener?: (offer: RTCSessionDescriptionInit) => void;
    private answerListener?: (answer: RTCSessionDescriptionInit) => void;
    private peerDisconnectListener?: () => void;
    private errorListener?: () => void;

    constructor(private options: SignallingOptions) {}

    connect(token: string) {
        this.socket = new WebSocket(this.options.serverUrl);
        this.socket.addEventListener('open', () => {
            this.sendAuthMessage(token);
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
        this.socket?.send(JSON.stringify(data));
    }

    disconnect(): void {
        this.socket?.close();
        this.socket = undefined;
    }
}

export interface SignallingOptions {
    serverUrl: string;
}

export type Role = 'initiator' | 'responder';
