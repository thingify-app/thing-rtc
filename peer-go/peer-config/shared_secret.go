package peerconfig

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"fmt"
	"io"

	"github.com/thingify-app/thing-rtc/peer-go/pairing"
)

const KEY_LENGTH = 64

type SharedSecretConfig struct {
	SecretBase64 string
	PeerConfig   *PeerConfig
}

func CreateInitiatorConfig() (*SharedSecretConfig, error) {
	return CreateInitiatorConfigWithRand(rand.Reader)
}

func CreateInitiatorConfigWithRand(randReader io.Reader) (*SharedSecretConfig, error) {
	keyBytes := make([]byte, KEY_LENGTH)
	_, err := randReader.Read(keyBytes)
	if err != nil {
		return nil, err
	}

	secretBase64 := base64.StdEncoding.EncodeToString(keyBytes)
	peerConfig, err := createPeerConfig(secretBase64, Initiator)
	if err != nil {
		return nil, err
	}

	return &SharedSecretConfig{
		SecretBase64: secretBase64,
		PeerConfig:   peerConfig,
	}, nil
}

func CreateInitiatorConfigWithSecret(sharedKeyBase64 string) (*PeerConfig, error) {
	return createPeerConfig(sharedKeyBase64, Initiator)
}

func CreateResponderConfig(sharedKeyBase64 string) (*PeerConfig, error) {
	return createPeerConfig(sharedKeyBase64, Responder)
}

func createPeerConfig(sharedKeyBase64 string, role Role) (*PeerConfig, error) {
	keyBytes, err := base64.StdEncoding.DecodeString(sharedKeyBase64)
	if err != nil {
		return nil, err
	}

	if len(keyBytes) != KEY_LENGTH {
		return nil, fmt.Errorf("Incorrect key length (%d)!", len(keyBytes))
	}

	pairingId := calculatePairingId(keyBytes)
	peerAuth := &sharedSecretPeerAuth{
		sharedKey: keyBytes,
	}

	return &PeerConfig{
		PeerAuth:  peerAuth,
		PairingId: pairingId,
		Role:      role,
	}, nil
}

func calculatePairingId(keyBytes []byte) string {
	// For shared secret keys, we use the hash of the key as the pairing ID:
	pairingIdBytes := sha256.Sum256(keyBytes)
	return base64.StdEncoding.EncodeToString(pairingIdBytes[:])
}

type sharedSecretPeerAuth struct {
	sharedKey []byte
}

func (s *sharedSecretPeerAuth) SignMessage(message string) (string, error) {
	mac := hmac.New(sha256.New, s.sharedKey)
	mac.Write([]byte(message))
	signatureBytes := mac.Sum(nil)

	return base64.StdEncoding.EncodeToString(signatureBytes), nil
}

func (s *sharedSecretPeerAuth) VerifyMessage(base64Signature string, message string) bool {
	signatureBytes, err := base64.StdEncoding.DecodeString(base64Signature)
	if err != nil {
		return false
	}

	mac := hmac.New(sha256.New, s.sharedKey)
	mac.Write([]byte(message))
	expected := mac.Sum(nil)
	return hmac.Equal(expected, signatureBytes)
}

func (*sharedSecretPeerAuth) GenerateNonce() string {
	return pairing.GenerateNonce()
}
