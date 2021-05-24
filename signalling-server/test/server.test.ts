import { Connection, Server } from "../src/server";
import { expect } from 'chai';
import { assert, fake, SinonSpy } from 'sinon';
import 'mocha';
import { ParseThroughAuthValidator } from "../src/auth-validator";

describe('server', function() {
  let server: Server;
  let sendMessageCallback: SinonSpy;
  let disconnectCallback: SinonSpy;
  let connection: Connection;

  beforeEach(() => {
    const authValidator = new ParseThroughAuthValidator();
    server = new Server(authValidator);
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

    const token = JSON.stringify({role: 'initiator', pairingId: 'abc', expiry: 0});
    server.onAuthMessage(connection, {token, nonce: 'a'});
  });

  it('throws error if role/pairingId pair is already connected', function() {
    server.onConnection(connection);

    const token = JSON.stringify({role: 'initiator', pairingId: 'abc', expiry: 0});
    server.onAuthMessage(connection, {token, nonce: 'a'});

    const newConnection: Connection = {
      sendMessage: sendMessageCallback,
      disconnect: disconnectCallback
    };
    server.onConnection(newConnection);
    expect(() => server.onAuthMessage(newConnection, {token, nonce: 'a'})).to.throw('Role already connected.');
  });
  
  it('succeeds silently if pairingId is unique for a given role', function() {
    server.onConnection(connection);
    const token = JSON.stringify({role: 'initiator', pairingId: 'abc', expiry: 0});
    server.onAuthMessage(connection, {token, nonce: 'a'});

    const newConnection: Connection = {
      sendMessage: sendMessageCallback,
      disconnect: disconnectCallback
    };
    server.onConnection(newConnection);
    const newToken = JSON.stringify({role: 'initiator', pairingId: 'def', expiry: 0});
    server.onAuthMessage(newConnection, {token: newToken, nonce: 'a'});
  });

  it('succeeds silently if role is unique for given pairingId', function() {
    server.onConnection(connection);
    const token = JSON.stringify({role: 'initiator', pairingId: 'abc', expiry: 0});
    server.onAuthMessage(connection, {token, nonce: 'a'});

    const newConnection: Connection = {
      sendMessage: sendMessageCallback,
      disconnect: disconnectCallback
    };
    server.onConnection(newConnection);
    const newToken = JSON.stringify({role: 'responder', pairingId: 'abc', expiry: 0});
    server.onAuthMessage(newConnection, {token: newToken, nonce: 'a'});
  });
  
  it('sends peerConnect message to opposite peer', function () {
    server.onConnection(connection);
    const token = JSON.stringify({role: 'initiator', pairingId: 'abc', expiry: 0});
    server.onAuthMessage(connection, {token, nonce: 'initiatorNonce'});

    const responderSendMessageCallback = fake();
    const responderDisconnectCallback = fake();
    const responderConnection: Connection = {
      sendMessage: responderSendMessageCallback,
      disconnect: responderDisconnectCallback
    };
    server.onConnection(responderConnection);
    const responderToken = JSON.stringify({role: 'responder', pairingId: 'abc', expiry: 0});
    server.onAuthMessage(responderConnection, {token: responderToken, nonce: 'responderNonce'});

    assert.calledOnceWithExactly(sendMessageCallback, '{"type":"peerConnect","nonce":"responderNonce"}');
    assert.calledOnceWithExactly(responderSendMessageCallback, '{"type":"peerConnect","nonce":"initiatorNonce"}');
  });

  it('sends peerDisconnect message to initiator', function () {
    server.onConnection(connection);
    const token = JSON.stringify({role: 'initiator', pairingId: 'abc', expiry: 0});
    server.onAuthMessage(connection, {token, nonce: 'a'});

    const responderConnection: Connection = {
      sendMessage: fake(),
      disconnect: fake()
    };
    server.onConnection(responderConnection);
    const responderToken = JSON.stringify({role: 'responder', pairingId: 'abc', expiry: 0});
    server.onAuthMessage(responderConnection, {token: responderToken, nonce: 'a'});

    server.onDisconnection(responderConnection);

    assert.calledWithExactly(sendMessageCallback, '{"type":"peerDisconnect"}');
  });
  
  it('sends peerDisconnect message to responder', function () {
    server.onConnection(connection);
    const token = JSON.stringify({role: 'responder', pairingId: 'abc', expiry: 0});
    server.onAuthMessage(connection, {token, nonce: 'a'});

    const initiatorConnection: Connection = {
      sendMessage: fake(),
      disconnect: fake()
    };
    server.onConnection(initiatorConnection);
    const initiatorToken = JSON.stringify({role: 'initiator', pairingId: 'abc', expiry: 0});
    server.onAuthMessage(initiatorConnection, {token: initiatorToken, nonce: 'a'});

    server.onDisconnection(initiatorConnection);

    assert.calledWithExactly(sendMessageCallback, '{"type":"peerDisconnect"}');
  });

  it('relays message from initiator to responder', function() {
    server.onConnection(connection);
    const token = JSON.stringify({role: 'initiator', pairingId: 'abc', expiry: 0});
    server.onAuthMessage(connection, {token, nonce: 'a'});

    const responderSendMessageCallback = fake();
    const responderDisconnectCallback = fake();
    const responderConnection: Connection = {
      sendMessage: responderSendMessageCallback,
      disconnect: responderDisconnectCallback
    };
    server.onConnection(responderConnection);
    const responderToken = JSON.stringify({role: 'responder', pairingId: 'abc', expiry: 0});
    server.onAuthMessage(responderConnection, {token: responderToken, nonce: 'a'});

    server.onContentMessage(connection, 'hello world');

    assert.calledWithExactly(responderSendMessageCallback, 'hello world');
  });

  it('relays message from responder to initiator', function() {
    server.onConnection(connection);
    const token = JSON.stringify({role: 'responder', pairingId: 'abc', expiry: 0});
    server.onAuthMessage(connection, {token, nonce: 'a'});

    const initiatorSendMessageCallback = fake();
    const initiatorDisconnectCallback = fake();
    const initiatorConnection: Connection = {
      sendMessage: initiatorSendMessageCallback,
      disconnect: initiatorDisconnectCallback
    };
    server.onConnection(initiatorConnection);
    const initiatorToken = JSON.stringify({role: 'initiator', pairingId: 'abc', expiry: 0});
    server.onAuthMessage(initiatorConnection, {token: initiatorToken, nonce: 'a'});

    server.onContentMessage(connection, 'hello world');

    assert.calledWithExactly(initiatorSendMessageCallback, 'hello world');
  });
});
