import { expect } from 'chai';
import 'mocha';
import { assert, fake } from 'sinon';
import { AuthValidator } from "../src/auth-validator";
import { MessageHandler, MessageParser } from "../src/message-parser";

describe('MessageParser', function() {
  let messageParser: MessageParser;
  let messageHandler: MessageHandler;
  let handleAuthMessage;
  let handleContentMessage;
  let authValidator: AuthValidator;

  beforeEach(() => {
    handleAuthMessage = fake();
    handleContentMessage = fake();
    messageHandler = {
      handleAuthMessage,
      handleContentMessage
    };
    authValidator = {
      validateToken: () => ({
        pairingId: 'abc',
        role: 'initiator',
        expiry: 0
      })
    };
    messageParser = new MessageParser(messageHandler);
  });

  it('calls the correct handler for a content message', function() {
    messageParser.parseMessage('{"type": "offer", "data": "hello"}');
    assert.calledWithExactly(handleContentMessage, '{"type": "offer", "data": "hello"}');
  });

  it('calls the correct handler for an auth message', function() {
    messageParser.parseMessage('{"type": "auth", "data": "abc"}');
    assert.calledWithExactly(handleAuthMessage, 'abc');
  });

  it('throws error on invalid JSON', function() {
    expect(() => messageParser.parseMessage('foo')).to.throw('Unexpected token');
  });

  it('throws error on unknown type', function() {
    expect(() => messageParser.parseMessage('{"type": "hello"}')).to.throw('Unknown type.');
  });
});
