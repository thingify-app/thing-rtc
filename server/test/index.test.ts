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
});
