import { PairingServer } from '../src/pairing-server';
import { expect } from 'chai';
import { generateKeyPairSync } from 'crypto';
import 'mocha';
import { Storage, InMemoryStorage } from '../src/storage';
import * as jwt from 'jsonwebtoken';

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
  let server: PairingServer;
  let storage: Storage;
  let currentTimeMillis: number;

  beforeEach(() => {
    currentTimeMillis = 0;
    storage = new InMemoryStorage();
    server = new PairingServer(storage, keyPair.privateKey, () => currentTimeMillis);
  });

  it('pairing request returns expected values', function() {
    const response = server.createPairingRequest('abc');
    const verifiedToken = jwt.verify(response.responderToken, keyPair.publicKey) as any;

    expect(verifiedToken.role).to.equal('responder');
    expect(verifiedToken.pairingId).to.equal(response.pairingId);
    expect(response.expiry).to.equal(60000);
  });
  
  it('pairing status returns awaiting prior to redemption', function() {
    const response = server.createPairingRequest('abc');
    const pairingId = response.pairingId;
    const pairingStatus = server.checkPairingStatus(pairingId);

    expect(pairingStatus.status).to.equal('awaiting');
  });
  
  it('pairing status returns awaiting prior to redemption', function() {
    const response = server.createPairingRequest('abc');
    const pairingId = response.pairingId;
    const pairingStatus = server.checkPairingStatus(pairingId);

    expect(pairingStatus.status).to.equal('awaiting');
  });

  it('pairing status throws on invalid pairingId', function() {
    expect(() => server.checkPairingStatus('blah')).to.throw('Pairing ID does not exist!');
  });

  it('pairing status throws after expiry', function() {
    const responderResponse = server.createPairingRequest('abc');
  
    currentTimeMillis = 70000;

    expect(() => server.checkPairingStatus(responderResponse.pairingId)).to.throw('Pairing ID does not exist!');
  });

  it('pairing response retuns expected values', function() {
    const responderResponse = server.createPairingRequest('abc');
    const initiatorResponse = server.respondToPairingRequest(responderResponse.shortcode, 'def');
    const verifiedToken = jwt.verify(initiatorResponse.initiatorToken, keyPair.publicKey) as any;
  
    expect(verifiedToken.role).to.equal('initiator');
    expect(verifiedToken.pairingId).to.equal(initiatorResponse.pairingId);
    expect(initiatorResponse.pairingId).to.equal(responderResponse.pairingId);
    expect(initiatorResponse.responderPublicKey).to.equal('abc');
  });

  it('pairing response throws after expiry', function() {
    const responderResponse = server.createPairingRequest('abc');
  
    currentTimeMillis = 70000;

    expect(() => server.respondToPairingRequest(responderResponse.shortcode, 'def')).to.throw('Shortcode does not exist!');
  });

  it('pairing response throws on invalid shortcode', function() {
    expect(() => server.respondToPairingRequest('blah', 'abc')).to.throw('Shortcode does not exist!');
  });

  it('pairing status returns expected values after redemption', function() {
    const responderResponse = server.createPairingRequest('abc');
    server.respondToPairingRequest(responderResponse.shortcode, 'def');
    const pairingStatus = server.checkPairingStatus(responderResponse.pairingId);

    expect(pairingStatus.status).to.equal('paired');
  });

  it('pairing response throws if tried again after redemption', function() {
    const responderResponse = server.createPairingRequest('abc');
    server.respondToPairingRequest(responderResponse.shortcode, 'def');

    expect(() => server.respondToPairingRequest(responderResponse.shortcode, 'ghi')).to.throw('Shortcode does not exist!');
  });

  it('pairing status throws if tried again after redemption', function() {
    const responderResponse = server.createPairingRequest('abc');
    server.respondToPairingRequest(responderResponse.shortcode, 'def');
    server.checkPairingStatus(responderResponse.pairingId);

    expect(() => server.checkPairingStatus(responderResponse.pairingId)).to.throw('Pairing ID does not exist!');
  });
});
