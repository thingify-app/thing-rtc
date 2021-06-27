import * as WebSocket from 'ws';
import { createPublicKey } from 'crypto';
import * as http from 'http';
import { Server, Connection, MessageParser, JwtAuthValidator } from 'thingrtc-signalling-server';

export class WebSocketSignallingServer {
    private authValidator = new JwtAuthValidator(createPublicKey(this.publicKey));
    private server = new Server(this.authValidator);
    private wss: WebSocket.Server;

    constructor(private publicKey: Buffer, existingServer: http.Server = null, port: number = null) {
        this.wss = new WebSocket.Server({ server: existingServer, port });
        console.log('Listening...');

        this.wss.on('error', error => {
            console.error(error);
        });
        
        this.wss.on('connection', ws => {
            console.log('Received new connection.');
        
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
        });
    }
}
