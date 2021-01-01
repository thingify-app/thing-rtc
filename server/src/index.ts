import * as WebSocket from 'ws';
import { Connection, Server } from "./server";

const server = new Server();

const port = 8080;
const wss = new WebSocket.Server({ port });
console.log(`Listening on port ${port}...`);
wss.on('connection', ws => {
    console.log('Received new connection.');

    const connection: Connection = {
        disconnect: () => ws.close(),
        sendMessage: message => ws.send(message)
    };

    server.onConnection(connection);

    ws.on('message', data => {
        console.log(`Message received: ${data}`);
        server.onMessage(connection, data.toString());
    });

    ws.on('close', () => {
        server.onDisconnection(connection);
        console.log('Connection closed.');
    });
});
