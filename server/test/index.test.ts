import { Connection, Server } from "../src/server";
import { expect } from 'chai';
import { fake } from 'sinon';
import 'mocha';

describe('server', function() {
  let server: Server;
  let sendMessageCallback: (message: string) => void;
  let disconnectCallback: () => void;
  let connection: Connection;

  beforeEach(() => {
    server = new Server();
    sendMessageCallback = fake();
    disconnectCallback = fake();
    connection = {
      sendMessage: sendMessageCallback,
      disconnect: disconnectCallback
    };
  });

  it('succeeds silently on connection', function() {
    server.onConnection(connection);
  });

  it('throws error if already connected', function() {
    server.onConnection(connection);
    expect(() => server.onConnection(connection)).to.throw('Connection reference already exists.');
  });

  it('succeeds silently on connection if disconnected after initial connection', function() {
    server.onConnection(connection);
    server.onDisconnection(connection);
    server.onConnection(connection);
  });
  
  it('succeeds silently on receiving valid auth message', function() {
    server.onConnection(connection);
    server.onMessage(connection, '{"type": "auth", "role": "initiator", "responderId": "abc"}');
  });

  it('throws error on invalid message JSON', function() {
    server.onConnection(connection);
    expect(() => server.onMessage(connection, 'this is invalid')).to.throw('Unexpected token');
  });

  it('throws error on invalid message type', function() {
    server.onConnection(connection);
    expect(() => server.onMessage(connection, '{"type": "foo"}')).to.throw('Invalid auth message.');
  });

  it('throws error if role/responderId pair is already connected', function() {
    server.onConnection(connection);
    server.onMessage(connection, '{"type": "auth", "role": "initiator", "responderId": "abc"}');
    const newConnection: Connection = {
      sendMessage: sendMessageCallback,
      disconnect: disconnectCallback
    };
    server.onConnection(newConnection);
    expect(() => server.onMessage(newConnection, '{"type": "auth", "role": "initiator", "responderId": "abc"}')).to.throw('Role already connected.');
  });
  
  it('succeeds silently if responderId is unique for a given role', function() {
    server.onConnection(connection);
    server.onMessage(connection, '{"type": "auth", "role": "initiator", "responderId": "abc"}');
    const newConnection: Connection = {
      sendMessage: sendMessageCallback,
      disconnect: disconnectCallback
    };
    server.onConnection(newConnection);
    server.onMessage(newConnection, '{"type": "auth", "role": "initiator", "responderId": "def"}');
  });

  it('succeeds silently if role is unique for given responderId', function() {
    server.onConnection(connection);
    server.onMessage(connection, '{"type": "auth", "role": "initiator", "responderId": "abc"}');
    const newConnection: Connection = {
      sendMessage: sendMessageCallback,
      disconnect: disconnectCallback
    };
    server.onConnection(newConnection);
    server.onMessage(newConnection, '{"type": "auth", "role": "responder", "responderId": "abc"}');
  });
});
