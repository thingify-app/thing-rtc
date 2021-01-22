// Websocket layer which talks to server
// abstract websocket

export class SignallingServer {

    constructor(private options: SignallingOptions) {}

    async connectAsInitiator(token: string): Promise<SignallingConnection> {
        throw new Error('Not implemented.');
    }

    async connectAsResponder(token: string): Promise<SignallingConnection> {
        throw new Error('Not implemented.');
    }
}

export interface SignallingConnection {
    on(type: 'peerConnect', callback: () => void): void;
    on(type: 'message', callback: (message: string) => void): void;
    on(type: 'peerDisconnect', callback: () => void): void;
    on(type: 'error', callback: () => void): void;
    sendMessage(message: string): void;
    disconnect(): void;
}

export interface SignallingOptions {
    serverHost: string;
}
