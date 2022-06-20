package thingrtc

import (
	"encoding/json"
	"math"
)

// TokenGenerator allows various forms of auth token to be presented to the signalling server.
type TokenGenerator interface {
	GenerateToken() string
	GetPairingId() string
	GetRole() string

	// Generates a one-time cryptographically strong random string.
	GenerateNonce() string

	// Signs each signalling message for verification by the peer.
	// Returns a base64-encoded string signature.
	SignMessage(message string) (string, error)

	// Verifies a signalling message signature received by the peer.
	// The signature must be base64-encoded.
	VerifyMessage(base64Signature string, message string) bool
}

// BasicTokenGenerator produces plain tokens without any signing, just to get started.
type BasicTokenGenerator struct {
	Role        string
	ResponderId string
}

func (b BasicTokenGenerator) GenerateToken() string {
	token := struct {
		Role        string `json:"role"`
		ResponderId string `json:"responderId"`
		Expiry      uint64 `json:"expiry"`
	}{
		Role:        b.Role,
		ResponderId: b.ResponderId,
		Expiry:      math.MaxUint64,
	}
	jsonToken, err := json.Marshal(token)
	if err != nil {
		panic(err)
	}
	return string(jsonToken)
}

func (b BasicTokenGenerator) GetPairingId() string {
	return b.ResponderId
}

func (b BasicTokenGenerator) GetRole() string {
	return b.Role
}

func (b BasicTokenGenerator) GenerateNonce() string {
	return "nonce"
}

func (b BasicTokenGenerator) SignMessage(message string) (string, error) {
	return "", nil
}

func (b BasicTokenGenerator) VerifyMessage(base64Signature string, message string) bool {
	return true
}
