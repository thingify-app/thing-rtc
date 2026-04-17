package peerconfig

import (
	"strings"
	"testing"
)

func TestInitiatorParameters(t *testing.T) {
	p, err := CreateInitiatorConfigWithRand(onesReader)
	if err != nil {
		t.Error(err)
	}

	if pairingId := p.PeerConfig.PairingId; pairingId != "fIl14eYKXIM38o7fjDPDsYA2C3J5ZEqbwa88UeYiC/U=" {
		t.Errorf("Incorrect pairingId: %v", pairingId)
	}

	if role := p.PeerConfig.Role; role != "initiator" {
		t.Errorf("Incorrect role: %v", role)
	}
}

func TestResponderParameters(t *testing.T) {
	i, err := CreateInitiatorConfigWithRand(onesReader)
	if err != nil {
		t.Error(err)
	}

	r, err := CreateResponderConfig(i.SecretBase64)
	if err != nil {
		t.Error(err)
	}

	if pairingId := r.PairingId; pairingId != "fIl14eYKXIM38o7fjDPDsYA2C3J5ZEqbwa88UeYiC/U=" {
		t.Errorf("Incorrect pairingId: %v", pairingId)
	}

	if role := r.Role; role != "responder" {
		t.Errorf("Incorrect role: %v", role)
	}
}

func TestSignatureValue(t *testing.T) {
	p, err := CreateInitiatorConfigWithRand(onesReader)
	if err != nil {
		t.Error(err)
	}

	signature, err := p.PeerConfig.PeerAuth.SignMessage("hello")
	if err != nil {
		t.Error(err)
	}

	if signature != "Lqh/T31+67jCdnoee+riMa1cmrQltbQy2Bpx+i4UNJY=" {
		t.Errorf("Incorrect signature: %v", signature)
	}
}

func TestSigningRoundTrip(t *testing.T) {
	i, err := CreateInitiatorConfigWithRand(onesReader)
	if err != nil {
		t.Error(err)
	}

	r, err := CreateResponderConfig(i.SecretBase64)
	if err != nil {
		t.Error(err)
	}

	signature, err := i.PeerConfig.PeerAuth.SignMessage("hello")
	if err != nil {
		t.Error(err)
	}

	verified := r.PeerAuth.VerifyMessage(signature, "hello")

	if !verified {
		t.Errorf("Failed to verify own signature: %v", signature)
	}
}

func TestSigningRoundTripFailure(t *testing.T) {
	i, err := CreateInitiatorConfigWithRand(onesReader)
	if err != nil {
		t.Error(err)
	}

	r, err := CreateResponderConfig(i.SecretBase64)
	if err != nil {
		t.Error(err)
	}

	signature, err := i.PeerConfig.PeerAuth.SignMessage("hello")
	if err != nil {
		t.Error(err)
	}

	verified := r.PeerAuth.VerifyMessage(signature, "blah")

	if verified {
		t.Errorf("Verified incorrect message: %v", signature)
	}
}

func TestRepeatedSignatures(t *testing.T) {
	i, err := CreateInitiatorConfigWithRand(onesReader)
	if err != nil {
		t.Error(err)
	}

	// Same message should yield same signature
	signature1, err := i.PeerConfig.PeerAuth.SignMessage("hello")
	if err != nil {
		t.Error(err)
	}

	signature2, err := i.PeerConfig.PeerAuth.SignMessage("hello")
	if err != nil {
		t.Error(err)
	}

	if signature1 != signature2 {
		t.Errorf("Signatures do not match: (%s, %s)!", signature1, signature2)
	}
}

func TestInvalidBase64(t *testing.T) {
	_, err := CreateResponderConfig("not base64")

	if err == nil || !strings.Contains(err.Error(), "illegal base64 data") {
		t.Error("Should return error!", err)
	}
}

func TestIncorrectKeyLength(t *testing.T) {
	_, err := CreateResponderConfig("ab==")

	if err == nil || !strings.Contains(err.Error(), "Incorrect key length") {
		t.Error("Should return error!", err)
	}
}
