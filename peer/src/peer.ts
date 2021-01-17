// Websocket layer which talks to server
// abstract websocket

export class Peer {
    connect(serverUrl: string) {
        console.log('Connecting...');
    }

    on(type: 'open' | '') {

    }
}

export interface Connection {
    connect(url: string): void;
    sendMessage(message: string): void;
    disconnect(): void;
}
