package pairing

import (
	"encoding/json"
	"testing"
)

func TestJwkRoundTrip(t *testing.T) {
	// Example JWK values taken from RFC 7517.
	key, err := ImportEcdsaPublicKey(`
	{
		"kty": "EC",
		"crv": "P-256",
		"x": "MKBCTNIcKUSDii11ySs3526iDZ8AiTo7Tu6KPAqv7D4",
		"y": "4Etl6SRW2YiLUrN5vfvVHuhp7x8PxltmWWlbbM4IFyM"
	}
	`)

	if err != nil {
		t.Error(err)
	}

	exportedKey := key.exportJwk()
	var parsedKey map[string]interface{}
	err = json.Unmarshal([]byte(exportedKey), &parsedKey)
	if err != nil {
		t.Error(err)
	}

	if parsedKey["kty"] != "EC" {
		t.Errorf("Round-trip with invalid kty: %v", parsedKey["kty"])
	}
	if parsedKey["crv"] != "P-256" {
		t.Errorf("Round-trip with invalid crv: %v", parsedKey["crv"])
	}
	if parsedKey["x"] != "MKBCTNIcKUSDii11ySs3526iDZ8AiTo7Tu6KPAqv7D4" {
		t.Errorf("Round-trip with invalid x: %v", parsedKey["x"])
	}
	if parsedKey["y"] != "4Etl6SRW2YiLUrN5vfvVHuhp7x8PxltmWWlbbM4IFyM" {
		t.Errorf("Round-trip with invalid y: %v", parsedKey["y"])
	}
}

func TestJwkImportExtraValues(t *testing.T) {
	_, err := ImportEcdsaPublicKey(`
	{
		"kty": "EC",
		"crv": "P-256",
		"x": "MKBCTNIcKUSDii11ySs3526iDZ8AiTo7Tu6KPAqv7D4",
		"y": "4Etl6SRW2YiLUrN5vfvVHuhp7x8PxltmWWlbbM4IFyM",
		"kid": "1",
		"use": "sig"
	}
	`)

	// Extra JSON values should be ignored and not cause failure.
	if err != nil {
		t.Error(err)
	}
}

func TestJwkImportInvalidJson(t *testing.T) {
	_, err := ImportEcdsaPublicKey(`blah`)
	if err == nil {
		t.Error("Failed to raise error on invalid JSON.")
	}
}

func TestJwkImportInvalidAlgorithm(t *testing.T) {
	_, err := ImportEcdsaPublicKey(`
	{
		"kty": "RSA",
		"crv": "P-256",
		"x": "0",
		"y": "0"
	}
	`)
	if err == nil {
		t.Error("Failed to raise error on invalid algorithm.")
	}
}

func TestJwkImportInvalidCurve(t *testing.T) {
	_, err := ImportEcdsaPublicKey(`
	{
		"kty": "EC",
		"crv": "P-384",
		"x": "0",
		"y": "0"
	}
	`)
	if err == nil {
		t.Error("Failed to raise error on invalid curve.")
	}
}

func TestJwkImportInvalidParameters(t *testing.T) {
	_, err := ImportEcdsaPublicKey(`
	{
		"kty": "EC",
		"crv": "P-256",
		"x": "0",
		"y": "0"
	}
	`)
	if err == nil {
		t.Error("Failed to raise error on invalid algorithm.")
	}
}

func TestGenerateJwkExport(t *testing.T) {
	keyPair, err := GenerateEcdsaKeyPairWithRand(zeroReader{})
	if err != nil {
		t.Error(err)
	}

	exportedKey := keyPair.PublicKey.exportJwk()
	var parsedKey map[string]interface{}
	err = json.Unmarshal([]byte(exportedKey), &parsedKey)
	if err != nil {
		t.Error(err)
	}

	if parsedKey["kty"] != "EC" {
		t.Errorf("Export with invalid kty: %v", parsedKey["kty"])
	}
	if parsedKey["crv"] != "P-256" {
		t.Errorf("Export with invalid crv: %v", parsedKey["crv"])
	}
	if parsedKey["x"] != "axfR8uEsQkf4vOblY6RA8ncDfYEt6zOg9KE5RdiYwpY" {
		t.Errorf("Export with invalid x: %v", parsedKey["x"])
	}
	if parsedKey["y"] != "T-NC4v4af5uO5-tKfA-eFivOM1drMV7Oy7ZAaDe_UfU" {
		t.Errorf("Export with invalid y: %v", parsedKey["y"])
	}
}

func TestGenerateJwkFullRoundTrip(t *testing.T) {
	keyPair, err := GenerateEcdsaKeyPairWithRand(zeroReader{})
	if err != nil {
		t.Error(err)
	}

	// Export then import the public key.
	exportedKey := keyPair.PublicKey.exportJwk()
	importedKey, err := ImportEcdsaPublicKey(exportedKey)
	if err != nil {
		t.Error(err)
	}

	// Sign a message and then verify with the imported public key.
	signature, err := keyPair.PrivateKey.signMessage("hello")
	if err != nil {
		t.Error(err)
	}

	verified := importedKey.verifyMessage(signature, "hello")
	if !verified {
		t.Errorf("Failed to verify own signature: %v", signature)
	}
}

func TestGenerateNonce(t *testing.T) {
	nonce := GenerateNonceWithRand(zeroReader{})
	if nonce != "AAAAAAAAAAAAAAAAAAAAAAAA" {
		t.Errorf("Unexpected nonce value: %v", nonce)
	}
}
