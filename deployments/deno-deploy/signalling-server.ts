// @deno-types="./dist/signalling-server/index.d.ts"
import { Server, Connection, ParseThroughAuthValidator, MessageParser } from './dist/signalling-server/index.js';
import { BroadcastChannelConnectionChannelFactory } from './connection-channel.ts';

export class SignallingServer {
    private server: Server;

    constructor(publicKey: CryptoKey) {
        const authValidator = new ParseThroughAuthValidator();
        this.server = new Server(authValidator, new BroadcastChannelConnectionChannelFactory());
    }

    handleConnection(ws: WebSocket) {
        const connection: Connection = {
            // TODO: handle case where sendMessage is called after disconnect.
            disconnect: () => ws.close(),
            sendMessage: message => {
                if (ws.readyState === 1) {
                    ws.send(message);
                }
            }
        };
    
        this.server.onConnection(connection);
    
        ws.onmessage = event => {
            const data = event.data;
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
        };
    
        ws.onclose = () => {
            this.server.onDisconnection(connection);
            console.log('Connection closed.');
        };

        ws.onerror = error => {
            this.server.onDisconnection(connection);
            console.error(`Connection error: ${error}`);
        }
    }
}
