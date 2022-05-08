package thingrtc

import (
	"encoding/json"
	"math"
)

// TokenGenerator allows various forms of auth token to be presented to the signalling server.
type TokenGenerator interface {
	GenerateToken() string
	GetRole() string
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

func (b BasicTokenGenerator) GetRole() string {
	return b.Role
}
