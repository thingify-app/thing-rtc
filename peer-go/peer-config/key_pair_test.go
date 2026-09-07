package peerconfig

import (
	"testing"

	"github.com/thingify-app/thing-rtc/peer-go/pairing"
)

var keyOperations = pairing.NewEcdsaKeyOperationsWithRand(constReader{2})

const sampleSpki = "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEQcqwkgbIa9GR/GGHcxmHmI7BIGiEr7S9nX61AdwE4IXEs3fyA0HRNQ8qA4BqKwr8+XhXqFgzQ+qw3GebiEcEqQ=="

func createKeyPairConfig(remoteKeySpki string, role Role) (*PeerConfig, error) {
	localKeyPair, err := CreateLocalKeyPairWithKeyOperations(keyOperations)
	if err != nil {
		return nil, err
	}

	remoteKey, err := CreateRemoteKey(remoteKeySpki)
	if err != nil {
		return nil, err
	}

	return CreateKeyPairConfig(remoteKey, localKeyPair, role)
}

func TestKeyPairInitiatorParameters(t *testing.T) {
	p, err := createKeyPairConfig(sampleSpki, "initiator")
	if err != nil {
		t.Error(err)
	}

	if pairingId := p.PairingId; pairingId != "WgenI8eVaDCuLmvg73GzmRFi9epC0tVLhpzyFnNNeNM=:vExMDHRTaFli82FggAlJNZ1K1P7X6EDB7YQi2G4EYGE=" {
		t.Errorf("Incorrect pairingId: %v", pairingId)
	}

	if role := p.Role; role != "initiator" {
		t.Errorf("Incorrect role: %v", role)
	}
}

func TestKeyPairResponderParameters(t *testing.T) {
	p, err := createKeyPairConfig(sampleSpki, "responder")
	if err != nil {
		t.Error(err)
	}

	if pairingId := p.PairingId; pairingId != "WgenI8eVaDCuLmvg73GzmRFi9epC0tVLhpzyFnNNeNM=:vExMDHRTaFli82FggAlJNZ1K1P7X6EDB7YQi2G4EYGE=" {
		t.Errorf("Incorrect pairingId: %v", pairingId)
	}

	if role := p.Role; role != "responder" {
		t.Errorf("Incorrect role: %v", role)
	}
}

func TestKeyPairPairingIdSorting(t *testing.T) {
	spki := "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEsjhV0zj45ktZNE2vX4t9RZh775xF6ckQR04WgeZYRaHvgpFx9vxop0xenxRFA2+FWd+bA18ytq7KamJDTLd3JA=="
	p, err := createKeyPairConfig(spki, "responder")
	if err != nil {
		t.Error(err)
	}

	if pairingId := p.PairingId; pairingId != "LmvG0IL2q/VVJa8e5qV0kl+Pfxqo09Npf35xTLkzQdY=:WgenI8eVaDCuLmvg73GzmRFi9epC0tVLhpzyFnNNeNM=" {
		t.Errorf("Incorrect pairingId: %v", pairingId)
	}
}
