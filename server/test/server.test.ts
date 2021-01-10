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
    server.onAuthMessage(connection, {role: 'initiator', responderId: 'abc', expiry: 0});
  });

  it('throws error if role/responderId pair is already connected', function() {
    server.onConnection(connection);
    server.onAuthMessage(connection, {role: 'initiator', responderId: 'abc', expiry: 0});
    const newConnection: Connection = {
      sendMessage: sendMessageCallback,
      disconnect: disconnectCallback
    };
    server.onConnection(newConnection);
    expect(() => server.onAuthMessage(newConnection, {role: 'initiator', responderId: 'abc', expiry: 0})).to.throw('Role already connected.');
  });
  
  it('succeeds silently if responderId is unique for a given role', function() {
    server.onConnection(connection);
    server.onAuthMessage(connection, {role: 'initiator', responderId: 'abc', expiry: 0});
    const newConnection: Connection = {
      sendMessage: sendMessageCallback,
      disconnect: disconnectCallback
    };
    server.onConnection(newConnection);
    server.onAuthMessage(newConnection, {role: 'initiator', responderId: 'def', expiry: 0});
  });

  it('succeeds silently if role is unique for given responderId', function() {
    server.onConnection(connection);
    server.onAuthMessage(connection, {role: 'initiator', responderId: 'abc', expiry: 0});
    const newConnection: Connection = {
      sendMessage: sendMessageCallback,
      disconnect: disconnectCallback
    };
    server.onConnection(newConnection);
    server.onAuthMessage(newConnection, {role: 'responder', responderId: 'abc', expiry: 0});
  });
  
  it('relays message from initiator to responder', function() {
    server.onConnection(connection);
    server.onAuthMessage(connection, {role: 'initiator', responderId: 'abc', expiry: 0});
    const responderSendMessageCallback = fake();
    const responderDisconnectCallback = fake();
    const responderConnection: Connection = {
      sendMessage: responderSendMessageCallback,
      disconnect: responderDisconnectCallback
    };
    server.onConnection(responderConnection);
    server.onAuthMessage(responderConnection, {role: 'responder', responderId: 'abc', expiry: 0});

    server.onContentMessage(connection, 'hello world');

    expect(responderSendMessageCallback.calledOnceWith('hello world')).to.be.true;
  });

  it('relays message from responder to initiator', function() {
    server.onConnection(connection);
    server.onAuthMessage(connection, {role: 'responder', responderId: 'abc', expiry: 0});
    const initiatorSendMessageCallback = fake();
    const initiatorDisconnectCallback = fake();
    const initiatorConnection: Connection = {
      sendMessage: initiatorSendMessageCallback,
      disconnect: initiatorDisconnectCallback
    };
    server.onConnection(initiatorConnection);
    server.onAuthMessage(initiatorConnection, {role: 'initiator', responderId: 'abc', expiry: 0});

    server.onContentMessage(connection, 'hello world');

    expect(initiatorSendMessageCallback.calledOnceWith('hello world')).to.be.true;
  });
});
