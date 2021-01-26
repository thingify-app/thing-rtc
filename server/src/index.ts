import * as WebSocket from 'ws';
import { ParseThroughAuthValidator } from './auth-validator';
import { MessageParser } from './message-parser';
import { Connection, Server } from "./server";

const server = new Server();
const authValidator = new ParseThroughAuthValidator();

const port = 8080;
const wss = new WebSocket.Server({ port });
console.log(`Listening on port ${port}...`);

wss.on('error', error => {
    console.error(error);
});

wss.on('connection', ws => {
    console.log('Received new connection.');

    const connection: Connection = {
        disconnect: () => ws.close(),
        sendMessage: message => ws.send(message)
    };

    server.onConnection(connection);

    ws.on('message', data => {
        console.log(`Message received: ${data}`);
        const messageParser = new MessageParser(authValidator, {
            handleAuthMessage: message => server.onAuthMessage(connection, message),
            handleContentMessage: message => server.onContentMessage(connection, message.content)
        });
        try {
            messageParser.parseMessage(data.toString());
        } catch (error: any) {
            console.error(error);
        }
    });

    ws.on('close', () => {
        server.onDisconnection(connection);
        console.log('Connection closed.');
    });
});
