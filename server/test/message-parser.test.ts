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
        responderId: 'abc',
        role: 'initiator',
        expiry: 0
      })
    };
    messageParser = new MessageParser(authValidator, messageHandler);
  });

  it('calls the correct handler for a content message', function() {
    messageParser.parseMessage('{"type": "content", "content": "hello"}');
    assert.calledWithExactly(handleContentMessage, { content: 'hello' });
  });

  it('calls the correct handler for an auth message', function() {
    messageParser.parseMessage('{"type": "auth", "token": "abc"}');
    assert.calledWithExactly(handleAuthMessage, { responderId: 'abc', role: 'initiator', expiry: 0 });
  });

  it('throws error on invalid JSON', function() {
    expect(() => messageParser.parseMessage('foo')).to.throw('Unexpected token');
  });

  it('throws error on unknown type', function() {
    expect(() => messageParser.parseMessage('{"type": "hello"}')).to.throw('Unknown type.');
  });

  it('throws error on invalid auth message', function() {
    expect(() => messageParser.parseMessage('{"type": "auth", "foo": "bar"}')).to.throw('Invalid auth message.');
  });

  it('throws error on invalid content message', function() {
    expect(() => messageParser.parseMessage('{"type": "content", "foo": "bar"}')).to.throw('Invalid content message.');
  });
});
