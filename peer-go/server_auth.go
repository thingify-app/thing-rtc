package thingrtc

import (
	"encoding/json"
	"math"

	peerconfig "github.com/thingify-app/thing-rtc/peer-go/peer-config"
)

type ServerAuth interface {
	GenerateToken() string
}

func CreateInsecureServerAuth(pairingId string, role peerconfig.Role) ServerAuth {
	token, err := json.Marshal(map[string]interface{}{
		"pairingId": pairingId,
		"role":      role,
		"expiry":    math.MaxUint32,
	})
	if err != nil {
		panic(err)
	}

	return &insecureServerAuth{
		token: string(token),
	}
}

type insecureServerAuth struct {
	token string
}

func (i *insecureServerAuth) GenerateToken() string {
	return i.token
}
