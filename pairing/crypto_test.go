package pairing

import (
	"encoding/json"
	"testing"
)

var keyOperations KeyOperations = NewEcdsaKeyOperations()

func TestPublicKeyRoundTrip(t *testing.T) {
	// Example JWK values taken from RFC 7517.
	key, err := keyOperations.importJwkPublicKey(`
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

func TestPublicKeyImportExtraValues(t *testing.T) {
	_, err := keyOperations.importJwkPublicKey(`
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

func TestPublicKeyImportInvalidJson(t *testing.T) {
	_, err := keyOperations.importJwkPublicKey(`blah`)
	if err == nil {
		t.Error("Failed to raise error on invalid JSON.")
	}
}

func TestPublicKeyImportInvalidAlgorithm(t *testing.T) {
	_, err := keyOperations.importJwkPublicKey(`
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

func TestPublicKeyImportInvalidCurve(t *testing.T) {
	_, err := keyOperations.importJwkPublicKey(`
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

func TestPublicKeyImportInvalidParameters(t *testing.T) {
	_, err := keyOperations.importJwkPublicKey(`
	{
		"kty": "EC",
		"crv": "P-256",
		"x": "0",
		"y": "0"
	}
	`)
	if err == nil {
		t.Error("Failed to raise error on invalid parameters.")
	}
}

func TestGenerateExportPublicKey(t *testing.T) {
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

func TestPrivateKeyRoundTrip(t *testing.T) {
	// Example JWK values taken from RFC 7517.
	key, err := keyOperations.importJwkPrivateKey(`
	{
		"kty": "EC",
		"crv": "P-256",
		"x": "MKBCTNIcKUSDii11ySs3526iDZ8AiTo7Tu6KPAqv7D4",
		"y": "4Etl6SRW2YiLUrN5vfvVHuhp7x8PxltmWWlbbM4IFyM",
		"d": "870MB6gfuTJ4HtUnUvYMyJpr5eUZNP4Bk43bVdj3eAE"
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
	if parsedKey["d"] != "870MB6gfuTJ4HtUnUvYMyJpr5eUZNP4Bk43bVdj3eAE" {
		t.Errorf("Round-trip with invalid y: %v", parsedKey["y"])
	}
}

func TestGenerateExportPrivateKey(t *testing.T) {
	keyPair, err := GenerateEcdsaKeyPairWithRand(zeroReader{})
	if err != nil {
		t.Error(err)
	}

	exportedKey := keyPair.PrivateKey.exportJwk()
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
	if parsedKey["d"] != "AQ" {
		t.Errorf("Export with invalid d: %v", parsedKey["d"])
	}
}

func TestGenerateFullRoundTrip(t *testing.T) {
	keyPair, err := GenerateEcdsaKeyPairWithRand(zeroReader{})
	if err != nil {
		t.Error(err)
	}

	// Export then import the public key.
	exportedPublicKey := keyPair.PublicKey.exportJwk()
	importedPublicKey, err := keyOperations.importJwkPublicKey(exportedPublicKey)
	if err != nil {
		t.Error(err)
	}

	// Export then import the private key.
	exportedPrivateKey := keyPair.PrivateKey.exportJwk()
	importedPrivateKey, err := keyOperations.importJwkPrivateKey(exportedPrivateKey)
	if err != nil {
		t.Error(err)
	}

	// Sign a message and then verify with the imported public key.
	signature, err := importedPrivateKey.signMessage("hello")
	if err != nil {
		t.Error(err)
	}

	verified := importedPublicKey.verifyMessage(signature, "hello")
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
