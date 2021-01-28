import * as WebSocket from 'ws';
import { ParseThroughAuthValidator } from './auth-validator';
import { MessageParser } from './message-parser';
import { Connection, Server } from "./server";

export class ThingServer {
    private server = new Server();
    private authValidator = new ParseThroughAuthValidator();
    private wss: WebSocket.Server;

    constructor(port: number) {
        this.wss = new WebSocket.Server({ port });
        console.log(`Listening on port ${port}...`);

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
                const messageParser = new MessageParser(this.authValidator, {
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
