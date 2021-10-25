import { PairingServer } from '../src/pairing-server';
import { expect, use } from 'chai';
import * as chaiAsPromised from 'chai-as-promised';
import { createPrivateKey, createPublicKey, generateKeyPairSync } from 'crypto';
import 'mocha';
import { Storage, InMemoryStorage } from '../src/storage';
import { jwtVerify } from 'jose';
import { Scheduler } from './scheduler';

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
  let server: PairingServer;
  let storage: Storage;

  beforeEach(() => {
    scheduler = new Scheduler();
    storage = new InMemoryStorage();
    server = new PairingServer(
      storage,
      privateKey,
      () => 'shortcode',
      () => 'pairingId',
      () => scheduler.getCurrentTimeMillis(),
      (callback, millis) => scheduler.schedule(callback, millis)
    );
  });

  it('pairing request returns expected values', async function() {
    const response = await server.createPairingRequest('abc');
    const verifiedToken = (await jwtVerify(response.pairingData.token, publicKey)).payload as any;

    expect(verifiedToken.role).to.equal('responder');
    expect(verifiedToken.pairingId).to.equal(response.pairingData.pairingId);
    expect(response.pairingData.expiry).to.equal(60000);
  });

  it('pairing redemption result returns paired state after redemption (before awaiting)', async function() {
    const response = await server.createPairingRequest('abc');
    await server.respondToPairingRequest(response.pairingData.shortcode, 'def');

    const redemptionResult = await response.redemptionResult();
    expect(redemptionResult.status).to.equal('paired');
    expect(redemptionResult.initiatorPublicKey).to.equal('def');
  });

  it('pairing redemption result returns paired state after redemption (after awaiting)', async function() {
    const response = await server.createPairingRequest('abc');

    // Put respondToPairingRequest on the end of the event queue, so it happens after the "await" is executed.
    setTimeout(() => {
      server.respondToPairingRequest(response.pairingData.shortcode, 'def');
    }, 1);

    const redemptionResult = await response.redemptionResult();
    expect(redemptionResult.status).to.equal('paired');
    expect(redemptionResult.initiatorPublicKey).to.equal('def');
  });

  it('pairing redemption result returns expired state after expiry', async function() {
    const response = await server.createPairingRequest('abc');
    scheduler.setCurrentTimeMillis(70000);

    const redemptionResult = await response.redemptionResult();
    expect(redemptionResult.status).to.equal('expired');
  });

  it('pairing response returns expected values', async function() {
    const responderResponse = await server.createPairingRequest('abc');
    const initiatorResponse = await server.respondToPairingRequest(responderResponse.pairingData.shortcode, 'def');
    const verifiedToken = (await jwtVerify(initiatorResponse.initiatorToken, publicKey)).payload as any;
  
    expect(verifiedToken.role).to.equal('initiator');
    expect(verifiedToken.pairingId).to.equal(initiatorResponse.pairingId);
    expect(initiatorResponse.pairingId).to.equal(responderResponse.pairingData.pairingId);
    expect(initiatorResponse.responderPublicKey).to.equal('abc');
  });

  it('pairing response throws after expiry', async function() {
    const responderResponse = await server.createPairingRequest('abc');
  
    scheduler.setCurrentTimeMillis(70000);

    await expect(server.respondToPairingRequest(responderResponse.pairingData.shortcode, 'def')).to.be.rejectedWith('Shortcode does not exist!');
  });

  it('pairing response throws on invalid shortcode', async function() {
    await expect(server.respondToPairingRequest('blah', 'abc')).to.be.rejectedWith('Shortcode does not exist!');
  });

  it('pairing response throws if tried again after redemption', async function() {
    const responderResponse = await server.createPairingRequest('abc');
    await server.respondToPairingRequest(responderResponse.pairingData.shortcode, 'def');

    await expect(server.respondToPairingRequest(responderResponse.pairingData.shortcode, 'ghi')).to.be.rejectedWith('Shortcode does not exist!');
  });
});
