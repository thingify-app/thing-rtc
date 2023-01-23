import { Connection, Server } from "../src/server";
import { expect, use } from 'chai';
import * as chaiAsPromised from 'chai-as-promised';
import { assert, fake, SinonSpy } from 'sinon';
import 'mocha';
import { ParseThroughAuthValidator } from "../src/auth-validator";
import { InMemoryConnectionChannelFactory } from "../src/connection-channel";

use(chaiAsPromised);

describe('server', function() {
  let server: Server;
  let sendMessageCallback: SinonSpy;
  let disconnectCallback: SinonSpy;
  let connection: Connection;

  beforeEach(() => {
    const authValidator = new ParseThroughAuthValidator();
    const channelFactory = new InMemoryConnectionChannelFactory();
    server = new Server(authValidator, channelFactory);
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

  it('succeeds silently on connection if disconnected after initial connection', async function() {
    server.onConnection(connection);
    await server.onDisconnection(connection);
    server.onConnection(connection);
  });
  
  it('succeeds silently on receiving valid auth message', async function() {
    server.onConnection(connection);

    const token = JSON.stringify({role: 'initiator', pairingId: 'abc', expiry: 0});
    await server.onAuthMessage(connection, {token, nonce: 'a'});
  });
  
  it('succeeds silently if pairingId is unique for a given role', async function() {
    server.onConnection(connection);
    const token = JSON.stringify({role: 'initiator', pairingId: 'abc', expiry: 0});
    await server.onAuthMessage(connection, {token, nonce: 'a'});

    const newConnection: Connection = {
      sendMessage: sendMessageCallback,
      disconnect: disconnectCallback
    };
    server.onConnection(newConnection);
    const newToken = JSON.stringify({role: 'initiator', pairingId: 'def', expiry: 0});
    await server.onAuthMessage(newConnection, {token: newToken, nonce: 'a'});
  });

  it('succeeds silently if role is unique for given pairingId', async function() {
    server.onConnection(connection);
    const token = JSON.stringify({role: 'initiator', pairingId: 'abc', expiry: 0});
    await server.onAuthMessage(connection, {token, nonce: 'a'});

    const newConnection: Connection = {
      sendMessage: sendMessageCallback,
      disconnect: disconnectCallback
    };
    server.onConnection(newConnection);
    const newToken = JSON.stringify({role: 'responder', pairingId: 'abc', expiry: 0});
    await server.onAuthMessage(newConnection, {token: newToken, nonce: 'a'});
  });
  
  it('sends peerConnect message to opposite peer', async function () {
    server.onConnection(connection);
    const token = JSON.stringify({role: 'initiator', pairingId: 'abc', expiry: 0});
    await server.onAuthMessage(connection, {token, nonce: 'initiatorNonce'});

    const responderSendMessageCallback = fake();
    const responderDisconnectCallback = fake();
    const responderConnection: Connection = {
      sendMessage: responderSendMessageCallback,
      disconnect: responderDisconnectCallback
    };
    server.onConnection(responderConnection);
    const responderToken = JSON.stringify({role: 'responder', pairingId: 'abc', expiry: 0});
    await server.onAuthMessage(responderConnection, {token: responderToken, nonce: 'responderNonce'});

    assert.calledOnceWithExactly(sendMessageCallback, '{"type":"peerConnect","nonce":"responderNonce"}');
    assert.calledOnceWithExactly(responderSendMessageCallback, '{"type":"peerConnect","nonce":"initiatorNonce"}');
  });

  it('sends peerDisconnect message to initiator', async function () {
    server.onConnection(connection);
    const token = JSON.stringify({role: 'initiator', pairingId: 'abc', expiry: 0});
    await server.onAuthMessage(connection, {token, nonce: 'a'});

    const responderConnection: Connection = {
      sendMessage: fake(),
      disconnect: fake()
    };
    server.onConnection(responderConnection);
    const responderToken = JSON.stringify({role: 'responder', pairingId: 'abc', expiry: 0});
    await server.onAuthMessage(responderConnection, {token: responderToken, nonce: 'a'});

    await server.onDisconnection(responderConnection);

    assert.calledWithExactly(sendMessageCallback, '{"type":"peerDisconnect"}');
  });
  
  it('sends peerDisconnect message to responder', async function () {
    server.onConnection(connection);
    const token = JSON.stringify({role: 'responder', pairingId: 'abc', expiry: 0});
    await server.onAuthMessage(connection, {token, nonce: 'a'});

    const initiatorConnection: Connection = {
      sendMessage: fake(),
      disconnect: fake()
    };
    server.onConnection(initiatorConnection);
    const initiatorToken = JSON.stringify({role: 'initiator', pairingId: 'abc', expiry: 0});
    await server.onAuthMessage(initiatorConnection, {token: initiatorToken, nonce: 'a'});

    await server.onDisconnection(initiatorConnection);

    assert.calledWithExactly(sendMessageCallback, '{"type":"peerDisconnect"}');
  });

  it('relays message from initiator to responder', async function() {
    server.onConnection(connection);
    const token = JSON.stringify({role: 'initiator', pairingId: 'abc', expiry: 0});
    await server.onAuthMessage(connection, {token, nonce: 'a'});

    const responderSendMessageCallback = fake();
    const responderDisconnectCallback = fake();
    const responderConnection: Connection = {
      sendMessage: responderSendMessageCallback,
      disconnect: responderDisconnectCallback
    };
    server.onConnection(responderConnection);
    const responderToken = JSON.stringify({role: 'responder', pairingId: 'abc', expiry: 0});
    await server.onAuthMessage(responderConnection, {token: responderToken, nonce: 'a'});

    await server.onContentMessage(connection, 'hello world');

    assert.calledWithExactly(responderSendMessageCallback, 'hello world');
  });

  it('relays message from responder to initiator', async function() {
    server.onConnection(connection);
    const token = JSON.stringify({role: 'responder', pairingId: 'abc', expiry: 0});
    await server.onAuthMessage(connection, {token, nonce: 'a'});

    const initiatorSendMessageCallback = fake();
    const initiatorDisconnectCallback = fake();
    const initiatorConnection: Connection = {
      sendMessage: initiatorSendMessageCallback,
      disconnect: initiatorDisconnectCallback
    };
    server.onConnection(initiatorConnection);
    const initiatorToken = JSON.stringify({role: 'initiator', pairingId: 'abc', expiry: 0});
    await server.onAuthMessage(initiatorConnection, {token: initiatorToken, nonce: 'a'});

    await server.onContentMessage(connection, 'hello world');

    assert.calledWithExactly(initiatorSendMessageCallback, 'hello world');
  });

  it('closes gracefully when disconnecting before auth', async function() {
    const initiatorSendMessageCallback = fake();
    const initiatorDisconnectCallback = fake();
    const initiatorConnection: Connection = {
      sendMessage: initiatorSendMessageCallback,
      disconnect: initiatorDisconnectCallback
    };

    server.onConnection(initiatorConnection);
    server.onConnection(connection);
    await server.onDisconnection(connection);

    assert.notCalled(sendMessageCallback);
    assert.notCalled(disconnectCallback);
    assert.notCalled(initiatorSendMessageCallback);
    assert.notCalled(initiatorDisconnectCallback);
  });

  it('gracefully handles repeated calls of onDisconnection', async function() {
    server.onConnection(connection);
    await server.onDisconnection(connection);
    await server.onDisconnection(connection);
  });

  it('disconnected peer does not receive messages', async function() {
    server.onConnection(connection);
    const token = JSON.stringify({role: 'responder', pairingId: 'abc', expiry: 0});
    await server.onAuthMessage(connection, {token, nonce: 'a'});
    await server.onDisconnection(connection);

    const initiatorSendMessageCallback = fake();
    const initiatorDisconnectCallback = fake();
    const initiatorConnection: Connection = {
      sendMessage: initiatorSendMessageCallback,
      disconnect: initiatorDisconnectCallback
    };

    server.onConnection(initiatorConnection);
    const initiatorToken = JSON.stringify({role: 'initiator', pairingId: 'abc', expiry: 0});
    await server.onAuthMessage(initiatorConnection, {token: initiatorToken, nonce: 'a'});

    await server.onContentMessage(initiatorConnection, 'hello world');

    assert.notCalled(sendMessageCallback);
  });
});
