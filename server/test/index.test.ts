import { Connection, Server } from "../src/server";
import { expect } from 'chai';
import { fake } from 'sinon';
import 'mocha';

describe('server', function() {
  it('initiator connection silently succeeds', function() {
    const server = new Server();
    const sendMessageCallback = fake();
    const connection: Connection = {
      role: 'initiator',
      responderId: 'abc',
      sendMessage: sendMessageCallback
    };
    server.onConnection(connection);
  });

  it('initiator connection fails if already connected', function() {
    const server = new Server();
    const sendMessageCallback = fake();
    const connection: Connection = {
      role: 'initiator',
      responderId: 'abc',
      sendMessage: sendMessageCallback
    };
    server.onConnection(connection);
    expect(() => server.onConnection(connection)).to.throw();
  });

  it('initiator connection succeeds if disconnected after connected', function() {
    const server = new Server();
    const sendMessageCallback = fake();
    const connection: Connection = {
      role: 'initiator',
      responderId: 'abc',
      sendMessage: sendMessageCallback
    };
    server.onConnection(connection);
    server.onDisconnection(connection);
    server.onConnection(connection);
  });

  it('message from initiator is relayed to responder', function() {
    const server = new Server();
    const initiatorSendMessage = fake();
    const responderSendMessage = fake();
    const initiator: Connection = {
      role: 'initiator',
      responderId: 'abc',
      sendMessage: initiatorSendMessage
    };
    server.onConnection(initiator);

    const responder: Connection = {
      role: 'responder',
      responderId: 'abc',
      sendMessage: responderSendMessage
    };
    server.onConnection(responder);

    server.onMessage(initiator, { content: 'hello' });
    expect(initiatorSendMessage.notCalled).to.be.true;
    expect(responderSendMessage.calledWith('hello')).to.be.true;
  });
});
