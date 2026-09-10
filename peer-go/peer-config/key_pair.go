package peerconfig

import (
	"encoding/base64"
	"sort"

	"github.com/thingify-app/thing-rtc/peer-go/pairing"
)

var ecdsaKeyOperations = pairing.NewEcdsaKeyOperations()

func CreateLocalKeyPair() (pairing.KeyPair, error) {
	return CreateLocalKeyPairWithKeyOperations(ecdsaKeyOperations)
}

func CreateLocalKeyPairWithKeyOperations(keyOperations pairing.KeyOperations) (pairing.KeyPair, error) {
	return keyOperations.GenerateKeyPair()
}

func LoadLocalKeyPair(jwk string) (*pairing.KeyPair, error) {
	privateKey, err := ecdsaKeyOperations.ImportJwkPrivateKey(jwk)
	if err != nil {
		return nil, err
	}

	return &pairing.KeyPair{
		PublicKey:  privateKey.PublicKey(),
		PrivateKey: privateKey,
	}, nil
}

func CreateRemoteKey(spki string) (pairing.PublicKey, error) {
	return CreateRemoteKeyWithKeyOperations(ecdsaKeyOperations, spki)
}

func CreateRemoteKeyWithKeyOperations(keyOperations pairing.KeyOperations, spki string) (pairing.PublicKey, error) {
	spkiBytes, err := base64.StdEncoding.DecodeString(spki)
	if err != nil {
		return nil, err
	}

	return keyOperations.ImportSpkiPublicKey(spkiBytes)
}

func CreateKeyPairConfig(remotePublicKey pairing.PublicKey, localKeyPair pairing.KeyPair, role Role) (*PeerConfig, error) {
	pairingId := toPairingId(remotePublicKey, localKeyPair)
	peerAuth := &keyPairPeerAuth{
		remotePublicKey: remotePublicKey,
		localKeyPair:    localKeyPair,
	}

	return &PeerConfig{
		PeerAuth:  peerAuth,
		PairingId: pairingId,
		Role:      role,
	}, nil
}

func toPairingId(remotePublicKey pairing.PublicKey, localKeyPair pairing.KeyPair) string {
	// For public keys pairing IDs, we use the concatenated, sorted public key
	// fingerprints, separated by a ':' which is not present in the base64
	// fingerprints.
	fingerprints := [2]string{
		remotePublicKey.Fingerprint(),
		localKeyPair.PublicKey.Fingerprint(),
	}
	sort.Strings(fingerprints[:])

	return fingerprints[0] + ":" + fingerprints[1]
}

type keyPairPeerAuth struct {
	remotePublicKey pairing.PublicKey
	localKeyPair    pairing.KeyPair
}

func (k *keyPairPeerAuth) SignMessage(message string) (string, error) {
	signatureBytes, err := k.localKeyPair.PrivateKey.SignMessage(message)
	if err != nil {
		return "", err
	}

	return base64.StdEncoding.EncodeToString(signatureBytes), nil
}

func (k *keyPairPeerAuth) VerifyMessage(base64Signature string, message string) bool {
	signatureBytes, err := base64.StdEncoding.DecodeString(base64Signature)
	if err != nil {
		return false
	}

	return k.remotePublicKey.VerifyMessage(signatureBytes, message)
}

func (*keyPairPeerAuth) GenerateNonce() string {
	return pairing.GenerateNonce()
}
