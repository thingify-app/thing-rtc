// Websocket layer which talks to server
// abstract websocket

export class SignallingServer {

    constructor(private options: SignallingOptions) {}

    async connect(token: string): Promise<SignallingConnection> {
        throw new Error('Not implemented.');
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

export interface SignallingOptions {
    serverHost: string;
}

export type Role = 'initiator' | 'responder';
