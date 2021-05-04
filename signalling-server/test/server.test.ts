import { Connection, Server } from "../src/server";
import { expect } from 'chai';
import { assert, fake, SinonSpy } from 'sinon';
import 'mocha';

describe('server', function() {
  let server: Server;
  let sendMessageCallback: SinonSpy;
  let disconnectCallback: SinonSpy;
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
  
  it('sends peerConnect message to opposite peer', function () {
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

    assert.calledOnceWithExactly(sendMessageCallback, '{"type":"peerConnect"}');
    assert.calledOnceWithExactly(responderSendMessageCallback, '{"type":"peerConnect"}');
  });

  it('sends peerDisconnect message to initiator', function () {
    server.onConnection(connection);
    server.onAuthMessage(connection, {role: 'initiator', responderId: 'abc', expiry: 0});

    const responderConnection: Connection = {
      sendMessage: fake(),
      disconnect: fake()
    };
    server.onConnection(responderConnection);
    server.onAuthMessage(responderConnection, {role: 'responder', responderId: 'abc', expiry: 0});

    server.onDisconnection(responderConnection);

    assert.calledWithExactly(sendMessageCallback, '{"type":"peerDisconnect"}');
  });
  
  it('sends peerDisconnect message to responder', function () {
    server.onConnection(connection);
    server.onAuthMessage(connection, {role: 'responder', responderId: 'abc', expiry: 0});

    const initiatorConnection: Connection = {
      sendMessage: fake(),
      disconnect: fake()
    };
    server.onConnection(initiatorConnection);
    server.onAuthMessage(initiatorConnection, {role: 'initiator', responderId: 'abc', expiry: 0});

    server.onDisconnection(initiatorConnection);

    assert.calledWithExactly(sendMessageCallback, '{"type":"peerDisconnect"}');
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

    assert.calledWithExactly(responderSendMessageCallback, 'hello world');
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

    assert.calledWithExactly(initiatorSendMessageCallback, 'hello world');
  });
});
