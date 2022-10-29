import * as WebSocket from 'ws';
import { createPublicKey } from 'crypto';
import { Server, Connection, MessageParser, JwtAuthValidator } from 'thingrtc-signalling-server';

export class SignallingServer {
    private authValidator = new JwtAuthValidator(createPublicKey(this.publicKey));
    private server = new Server(this.authValidator);

    constructor(private publicKey: string) {}

    handleConnection(ws: WebSocket) {
        const connection: Connection = {
            disconnect: () => ws.close(),
            sendMessage: message => ws.send(message)
        };
    
        this.server.onConnection(connection);
    
        ws.on('message', data => {
            console.log(`Message received: ${data}`);
            const messageParser = new MessageParser({
                handleAuthMessage: message => this.server.onAuthMessage(connection, message),
                handleContentMessage: message => this.server.onContentMessage(connection, message)
            });
            try {
                messageParser.parseMessage(data.toString());
            } catch (error: any) {
                console.error(error);
            }
        });
    
        ws.on('close', () => {
            this.server.onDisconnection(connection);
            console.log('Connection closed.');
        });
    }
}
