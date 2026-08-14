import { ParseThroughAuthValidator } from './auth-validator.ts';
import { Socket } from './websocket.ts';
import { SignallingServer } from './signalling-server.ts';
import { assert } from '@std/assert';
import { assertEquals } from '@std/assert/equals';
import { FakeTime } from '@std/testing/time';
import { KvClaimer } from './kv.ts';
import { BroadcastChannelConnectionChannelFactory } from './connection-channel.ts';


class FakeSocket implements Socket {
  private messageHandler: (msg: string) => void = () => {};
  private closeHandler: () => void = () => {};
  private messageResolver: (message: string) => void = () => {};
  private closeResolver: () => void = () => {};

  sent: string[] = [];
  waitQueue: string[] = [];
  closed = false;

  onMessage(cb: (msg: string) => void | Promise<void>): void {
    this.messageHandler = cb;
  }

  onClose(cb: () => void | Promise<void>): void {
    this.closeHandler = cb;
  }

  async sendMessage(msg: string): Promise<void> {
    this.sent.push(msg);
    this.waitQueue.push(msg);
    this.messageResolver(msg);
  }

  async close(): Promise<void> {
    if (this.closed) return; // guard against double-close firing twice
    this.closed = true;
    this.closeHandler();
    this.closeResolver();
  }

  /** Test helper: simulate the peer sending `msg` to this socket. */
  async receive(msg: string): Promise<void> {
    this.messageHandler(msg);
  }

  get lastSent(): string | undefined {
    return this.sent[this.sent.length - 1];
  }

  async waitForMessage(): Promise<string> {
    const queued = this.waitQueue.shift();
    if (queued) {
      console.log('Queued entry returned:');
      console.log(queued);
      return queued;
    } else {
      const {promise, resolve, reject} = Promise.withResolvers<string>();
      this.messageResolver = resolve;
      console.log('Waiting to resolve....');
      setTimeout(() => reject('Timed out waiting for message'), 5000);

      const result = await promise;
      // If we have a result, shift it out of the queue.
      this.waitQueue.shift();
      return result;
    }
  }

  async waitForClose(): Promise<void> {
    if (this.closed) {
      return;
    } else {
      const {promise, resolve, reject} = Promise.withResolvers<void>();
      this.closeResolver = resolve;
      setTimeout(() => reject('Timed out waiting for close'), 5000);
      return promise;
    }
  }
}

function authMsg(pairingId: string, role: string, nonce: string): string {
  const token = JSON.stringify({
    pairingId: pairingId,
    role: role,
    expiry: Number.MAX_SAFE_INTEGER,
  });
  return JSON.stringify({
    type: 'auth',
    data: JSON.stringify({ token, nonce }),
  });
}

const authValidator = new ParseThroughAuthValidator();
const connectionChannelFactory = new BroadcastChannelConnectionChannelFactory();

let signallingServer: SignallingServer;

Deno.test.beforeEach(async () => {
  const claimer = await KvClaimer.create(true);
  signallingServer = new SignallingServer(authValidator, claimer, connectionChannelFactory);
});

Deno.test('invalid outer JSON -> sends "error" and closes socket', async () => {
  const socket = new FakeSocket();
  signallingServer.handleSignalling(socket);
  await socket.receive('not json{{{');
  assertEquals(socket.lastSent, 'error');
  assert(socket.closed);
});

Deno.test('outer message failing Message schema -> error + close', async () => {
  const socket = new FakeSocket();
  signallingServer.handleSignalling(socket);

  // missing required `type` field
  await socket.receive(JSON.stringify({ notType: 'x' }));

  assertEquals(socket.lastSent, 'error');
  assert(socket.closed);
});

Deno.test('auth data missing token/nonce -> error + close', async () => {
  const socket = new FakeSocket();
  signallingServer.handleSignalling(socket);

  await socket.receive(JSON.stringify({ type: 'auth' })); // data defaults to '{}'

  assertEquals(socket.lastSent, 'error');
  assert(socket.closed);
});

Deno.test('both peers receive peerConnect once claimed', async () => {
  const socketA = new FakeSocket();
  signallingServer.handleSignalling(socketA);
  await socketA.receive(authMsg('pairIdFoo', 'initiator', 'nonce-INIT'));

  const socketB = new FakeSocket();
  signallingServer.handleSignalling(socketB);
  await socketB.receive(authMsg('pairIdFoo', 'responder', 'nonce-RESP'));

  assertEquals(JSON.parse(await socketA.waitForMessage()), { type: 'peerConnect', nonce: 'nonce-RESP' });
  assertEquals(JSON.parse(await socketB.waitForMessage()), { type: 'peerConnect', nonce: 'nonce-INIT' });

  await socketA.receive(JSON.stringify({ type: 'offer', data: 'sdp...' }));
  await socketB.receive(JSON.stringify({ type: 'answer', data: 'sdp...' }));

  assertEquals(
    JSON.parse(await socketB.waitForMessage()),
    { type: 'offer', data: 'sdp...' },
  );

  assertEquals(
    JSON.parse(await socketA.waitForMessage()),
    { type: 'answer', data: 'sdp...' },
  );
});

Deno.test('responder: no matching initiator entry -> error + close', async () => {
  const time = new FakeTime();

  const socket = new FakeSocket();
  signallingServer.handleSignalling(socket);

  await socket.receive(authMsg('pairIdFoo', 'responder', 'nonce-RESP'));

  // Wait for responder to time out waiting.
  await time.tickAsync(10 * 60 * 1000);

  assertEquals(await socket.waitForMessage(), 'error');
  assert(socket.closed);
});

Deno.test('responder: claims entry and exchanges peerConnect nonces both ways', async () => {
  const initSocket = new FakeSocket();

  signallingServer.handleSignalling(initSocket);
  await initSocket.receive(authMsg('pairIdFoo', 'initiator', 'nonce-INIT'));

  const respSocket = new FakeSocket();
  signallingServer.handleSignalling(respSocket);
  await respSocket.receive(authMsg('pairIdFoo', 'responder', 'nonce-RESP'));

  // Responder's own socket gets the initiator's nonce back.
  const respPeerConnect = JSON.parse(await respSocket.waitForMessage());
  assertEquals(respPeerConnect, { type: 'peerConnect', nonce: 'nonce-INIT' });

  // Initiator's socket gets the responder's nonce via the channel relay.
  const initPeerConnect = JSON.parse(await initSocket.waitForMessage());
  assertEquals(initPeerConnect, { type: 'peerConnect', nonce: 'nonce-RESP' });
});

Deno.test('peerDisconnect from channel closes the local socket', async () => { 
  const initSocket = new FakeSocket();

  signallingServer.handleSignalling(initSocket);
  await initSocket.receive(authMsg('pairIdFoo', 'initiator', 'nonce-INIT'));

  const respSocket = new FakeSocket();
  signallingServer.handleSignalling(respSocket);
  await respSocket.receive(authMsg('pairIdFoo', 'responder', 'nonce-RESP'));

  // Responder disconnects -> its onClose handler broadcasts peerDisconnect.
  await respSocket.waitForMessage();
  await respSocket.close();

  // Initiator socket should close on peerDisconnect.
  await initSocket.waitForClose();
});

Deno.test('socket is force-closed after SESSION_TIMEOUT even if never authed', async () => {
  using time = new FakeTime();
  const socket = new FakeSocket();
  signallingServer.handleSignalling(socket);

  assert(!socket.closed);
  await time.tickAsync(10 * 60 * 1000);
  assert(socket.closed);
});

Deno.test('sending a second auth message post-auth does not create a second entry/channel', async () => {
  const socket = new FakeSocket();
  signallingServer.handleSignalling(socket);

  await socket.receive(authMsg('pairIdFoo', 'initiator', 'nonce-1'));
  assertEquals(socket.sent.length, 0);

  // Re-sending an auth-shaped message: `authed` is already true so the
  // `if (!authed)` branch is skipped and this should be a silent no-op
  // (not an error, not a second entry).
  await socket.receive(authMsg('pairIdFoo', 'initiator', 'nonce-2'));
  assertEquals(socket.sent.length, 0);
  assert(!socket.closed);
});
