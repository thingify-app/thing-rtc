import { PairingServer } from '../src/pairing-server';
import { expect, use } from 'chai';
import * as chaiAsPromised from 'chai-as-promised';
import { createPrivateKey, createPublicKey, generateKeyPairSync } from 'crypto';
import 'mocha';
import { jwtVerify } from 'jose';
import { Scheduler } from './scheduler';
import { ConnectionChannelFactory, InMemoryConnectionChannelFactory } from '../src/connection-channel';
import { timeoutWrapperFactory } from '../src/utils';
import { MockSocket } from './mock-socket';
import { runAfter } from './utils';

use(chaiAsPromised);

describe('server', function() {
  const keyPair = generateKeyPairSync('rsa', {
    modulusLength: 4096,
    publicKeyEncoding: {
      type: 'spki',
      format: 'pem'
    },
    privateKeyEncoding: {
      type: 'pkcs8',
      format: 'pem'
    }
  });
  const privateKey = createPrivateKey(keyPair.privateKey);
  const publicKey = createPublicKey(keyPair.publicKey);

  let scheduler: Scheduler;
  let socket: MockSocket;
  let server: PairingServer;
  let channelFactory: ConnectionChannelFactory;

  beforeEach(() => {
    scheduler = new Scheduler();
    socket = new MockSocket();
    channelFactory = new InMemoryConnectionChannelFactory();
    server = new PairingServer(
      channelFactory,
      privateKey,
      () => 'shortcode',
      () => 'pairingId',
      () => scheduler.getCurrentTimeMillis(),
      timeoutWrapperFactory(millis => new Promise((resolve, reject) => {
        scheduler.schedule(reject, scheduler.getCurrentTimeMillis() + millis);
      }))
    );
  });

  it('pairing request returns expected values', async function() {
    const result = async () => {
      socket.pushMessage('abc');
      const response = JSON.parse(await socket.getSentMessage());

      // Make it expire so we don't hang the test - we only care about the first
      // message.
      scheduler.setCurrentTimeMillis(70_000);
      return response;
    };

    const [response] = await Promise.all([result(), server.createPairingRequest(socket)]);
    
    const verifiedToken = (await jwtVerify(response.token, publicKey)).payload as any;
    expect(verifiedToken.role).to.equal('responder');
    expect(verifiedToken.pairingId).to.equal(response.pairingId);
    expect(response.expiry).to.equal(60000);
  });

  it('pairing redemption result returns paired state after redemption', async function() {
    const result = async () => {
      socket.pushMessage('abc');
      const response = JSON.parse(await socket.getSentMessage());
      
      await server.respondToPairingRequest(response.shortcode, 'def');
      return JSON.parse(await socket.getSentMessage());
    };

    const [redemptionResult] = await Promise.all([result(), server.createPairingRequest(socket)]);

    expect(redemptionResult.status).to.equal('paired');
    expect(redemptionResult.initiatorPublicKey).to.equal('def');
  });

  it('pairing redemption result returns paired state after redemption (after delay)', async function() {
    const result = async () => {
      socket.pushMessage('abc');
      const response = JSON.parse(await socket.getSentMessage());

      scheduler.setCurrentTimeMillis(50_000);

      await server.respondToPairingRequest(response.shortcode, 'def');
      return JSON.parse(await socket.getSentMessage());
    };
    
    const [redemptionResult] = await Promise.all([result(), server.createPairingRequest(socket)]);

    expect(redemptionResult.status).to.equal('paired');
    expect(redemptionResult.initiatorPublicKey).to.equal('def');
  });

  it('pairing redemption result returns expired state after expiry', async function() {
    const result = async () => {
      socket.pushMessage('abc');
      JSON.parse(await socket.getSentMessage());

      scheduler.setCurrentTimeMillis(70_000);

      return JSON.parse(await socket.getSentMessage());
    };

    const [redemptionResult] = await Promise.all([result(), server.createPairingRequest(socket)]);

    expect(redemptionResult.status).to.equal('expired');
  });

  it('pairing response returns expected values', async function() {
    const result = async () => {
      socket.pushMessage('abc');
      const responderResponse = JSON.parse(await socket.getSentMessage());

      const initiatorResponse = await server.respondToPairingRequest(responderResponse.shortcode, 'def');
      const verifiedToken = (await jwtVerify(initiatorResponse.initiatorToken, publicKey)).payload as any;

      expect(verifiedToken.role).to.equal('initiator');
      expect(verifiedToken.pairingId).to.equal(initiatorResponse.pairingId);
      expect(initiatorResponse.pairingId).to.equal(responderResponse.pairingId);
      expect(initiatorResponse.responderPublicKey).to.equal('abc');

      await socket.getSentMessage();
    };

    await Promise.all([server.createPairingRequest(socket), result()]);
  });

  it('pairing response throws after expiry', async function() {
    const result = async () => {
      socket.pushMessage('abc');

      const response = JSON.parse(await socket.getSentMessage());
      scheduler.setCurrentTimeMillis(70_000);
      return response;
    };

    const [responderResponse] = await Promise.all([result(), server.createPairingRequest(socket)]);

    // Allow for timeout of shortcode query.
    runAfter(async () => scheduler.setCurrentTimeMillis(80_000));

    await expect(server.respondToPairingRequest(responderResponse.shortcode, 'def')).to.be.rejectedWith('Shortcode does not exist!');
  });

  it('pairing response throws on invalid shortcode', async function() {
    // Allow for timeout of shortcode query.
    runAfter(async () => scheduler.setCurrentTimeMillis(11_000));
    await expect(server.respondToPairingRequest('blah', 'abc')).to.be.rejectedWith('Shortcode does not exist!');
  });

  it('pairing response throws if tried again after redemption', async function() {
    const result = async () => {
      socket.pushMessage('abc');
      const responderResponse = JSON.parse(await socket.getSentMessage());
      await server.respondToPairingRequest(responderResponse.shortcode, 'def');

      // Allow for timeout of shortcode query.
      runAfter(async () => scheduler.setCurrentTimeMillis(11_000));

      await expect(server.respondToPairingRequest(responderResponse.shortcode, 'ghi')).to.be.rejectedWith('Shortcode does not exist!');
    };

    await Promise.all([server.createPairingRequest(socket), result()]);
  });
});
