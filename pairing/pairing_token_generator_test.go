package pairing

import (
	"testing"
)

func createPairingTokenGenerator() (p PairingTokenGenerator, err error) {
	keyPair, err := GenerateEcdsaKeyPairWithRand(zeroReader{})
	if err != nil {
		return
	}

	pairingData := pairingData{
		pairingId:   "ABC123",
		role:        "initiator",
		serverToken: "token123",
		// Use the generated public key as the remote peer's, just for ease of testing.
		remotePublicKey: keyPair.PublicKey,
		localKeyPair:    keyPair,
	}
	p = PairingTokenGenerator{pairingData}
	return
}

func TestBasicParameters(t *testing.T) {
	p, err := createPairingTokenGenerator()
	if err != nil {
		t.Error(err)
	}

	if pairingId := p.GetPairingId(); pairingId != "ABC123" {
		t.Errorf("Incorrect pairingId: %v", pairingId)
	}

	if role := p.GetRole(); role != "initiator" {
		t.Errorf("Incorrect role: %v", role)
	}

	if token := p.GenerateToken(); token != "token123" {
		t.Errorf("Incorrect token: %v", token)
	}
}

func TestSignatureValue(t *testing.T) {
	p, err := createPairingTokenGenerator()
	if err != nil {
		t.Error(err)
	}

	signature, err := p.SignMessage("hello")
	if err != nil {
		t.Error(err)
	}

	if signature != "MEYCIQC0Z0Cw7rqAbPN8LLjvR2I0R0k6VAaZnR0B+FZbjXwzgAIhAN1LWGjQG0g5RIopyEG+vTXMrPDNyj0nP4prVYNKVEAd" {
		t.Errorf("Incorrect signature: %v", signature)
	}
}

func TestSigningRoundTrip(t *testing.T) {
	p, err := createPairingTokenGenerator()
	if err != nil {
		t.Error(err)
	}

	signature, err := p.SignMessage("hello")
	if err != nil {
		t.Error(err)
	}

	verified := p.VerifyMessage(signature, "hello")

	if !verified {
		t.Errorf("Failed to verify own signature: %v", signature)
	}
}

func TestSigningRoundTripFailure(t *testing.T) {
	p, err := createPairingTokenGenerator()
	if err != nil {
		t.Error(err)
	}

	signature, err := p.SignMessage("hello")
	if err != nil {
		t.Error(err)
	}

	verified := p.VerifyMessage(signature, "blah")

	if verified {
		t.Errorf("Verified incorrect message: %v", signature)
	}
}
