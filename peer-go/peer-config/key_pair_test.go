package peerconfig

import (
	"encoding/json"
	"maps"
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

func TestLoadLocalKeyPair(t *testing.T) {
	// Example JWK values taken from RFC 7517.
	jwk := `
	{
		"kty": "EC",
		"crv": "P-256",
		"x": "MKBCTNIcKUSDii11ySs3526iDZ8AiTo7Tu6KPAqv7D4",
		"y": "4Etl6SRW2YiLUrN5vfvVHuhp7x8PxltmWWlbbM4IFyM",
		"d": "870MB6gfuTJ4HtUnUvYMyJpr5eUZNP4Bk43bVdj3eAE"
	}
	`

	keyPair, err := LoadLocalKeyPair(jwk)
	if err != nil {
		t.Fatal(err)
	}

	privateJwk := keyPair.PrivateKey.ExportJwk()
	publicJwk := keyPair.PublicKey.ExportJwk()

	var parsedPrivateKey map[string]interface{}
	err = json.Unmarshal([]byte(privateJwk), &parsedPrivateKey)
	if err != nil {
		t.Fatal(err)
	}

	expectedPrivateKey := map[string]interface{}{
		"crv": "P-256",
		"kty": "EC",
		"x":   "MKBCTNIcKUSDii11ySs3526iDZ8AiTo7Tu6KPAqv7D4",
		"y":   "4Etl6SRW2YiLUrN5vfvVHuhp7x8PxltmWWlbbM4IFyM",
		"d":   "870MB6gfuTJ4HtUnUvYMyJpr5eUZNP4Bk43bVdj3eAE",
	}
	if !maps.Equal(expectedPrivateKey, parsedPrivateKey) {
		t.Errorf("Private key does not match expected: %v\n", privateJwk)
	}

	var parsedPublicKey map[string]interface{}
	err = json.Unmarshal([]byte(publicJwk), &parsedPublicKey)
	if err != nil {
		t.Fatal(err)
	}

	expectedPublicKey := map[string]interface{}{
		"crv": "P-256",
		"kty": "EC",
		"x":   "MKBCTNIcKUSDii11ySs3526iDZ8AiTo7Tu6KPAqv7D4",
		"y":   "4Etl6SRW2YiLUrN5vfvVHuhp7x8PxltmWWlbbM4IFyM",
	}
	if !maps.Equal(expectedPublicKey, parsedPublicKey) {
		t.Errorf("Public key does not match expected: %v\n", publicJwk)
	}
}
