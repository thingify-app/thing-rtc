package pairing

import (
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"math/big"
)

const NONCE_BYTES = 18

type PublicKey interface {
	verifyMessage(signature []byte, message string) bool
	exportJwk() string
}

type PrivateKey interface {
	signMessage(message string) ([]byte, error)
}

type KeyPair struct {
	PublicKey
	PrivateKey
}

// Generates a cryptographically-secure random string.
func GenerateNonce() string {
	return GenerateNonceWithRand(rand.Reader)
}

func GenerateNonceWithRand(rand io.Reader) string {
	bytes := make([]byte, 18)
	rand.Read(bytes)
	return base64.StdEncoding.EncodeToString(bytes)
}

// Imports a JWK-encoded ECDSA public key using the P-256 curve into our PublicKey representation.
func ImportEcdsaPublicKey(jwk string) (key PublicKey, err error) {
	members := struct {
		Kty string
		Crv string
		X   string
		Y   string
	}{}
	err = json.Unmarshal([]byte(jwk), &members)
	if err != nil {
		return
	}

	if members.Kty != "EC" {
		err = fmt.Errorf("JWK algorithm %v is not acceptable", members.Kty)
		return
	}

	if members.Crv != "P-256" {
		err = fmt.Errorf("JWK curve %v is not acceptable", members.Crv)
		return
	}

	x, err := stringToBigInt(members.X)
	if err != nil {
		return
	}
	y, err := stringToBigInt(members.Y)
	if err != nil {
		return
	}

	publicKey := &ecdsa.PublicKey{
		Curve: elliptic.P256(),
		X:     x,
		Y:     y,
	}
	key = ecdsaPublicKey{
		publicKey,
	}

	return
}

// Generates an ECDSA key pair using the P-256 curve.
func GenerateEcdsaKeyPair() (KeyPair, error) {
	return GenerateEcdsaKeyPairWithRand(rand.Reader)
}

func GenerateEcdsaKeyPairWithRand(rand io.Reader) (keyPair KeyPair, err error) {
	privateKey, err := ecdsa.GenerateKey(elliptic.P256(), rand)
	if err != nil {
		return
	}

	keyPair = KeyPair{
		PublicKey: ecdsaPublicKey{
			&privateKey.PublicKey,
		},
		PrivateKey: ecdsaPrivateKey{
			privateKey,
			rand,
		},
	}
	return
}

type ecdsaPublicKey struct {
	publicKey *ecdsa.PublicKey
}

type ecdsaPrivateKey struct {
	privateKey *ecdsa.PrivateKey
	rand       io.Reader
}

func (e ecdsaPublicKey) verifyMessage(signature []byte, message string) bool {
	hash := sha256.Sum256([]byte(message))
	return ecdsa.VerifyASN1(e.publicKey, hash[:], signature)
}

func (e ecdsaPublicKey) exportJwk() string {
	members := struct {
		Kty string `json:"kty"`
		Crv string `json:"crv"`
		X   string `json:"x"`
		Y   string `json:"y"`
	}{
		Kty: "EC",
		Crv: "P-256",
		X:   bigIntToString(e.publicKey.X),
		Y:   bigIntToString(e.publicKey.Y),
	}

	jwk, _ := json.Marshal(members)
	return string(jwk)
}

func (e ecdsaPrivateKey) signMessage(message string) ([]byte, error) {
	hash := sha256.Sum256([]byte(message))
	return ecdsa.SignASN1(e.rand, e.privateKey, hash[:])
}

func stringToBigInt(str string) (val *big.Int, err error) {
	val = &big.Int{}

	// SetBytes accepts big-endian bytes, which is conveniently also the format used by JWK (only base64-encoded).
	bytes, err := base64.RawURLEncoding.DecodeString(str)
	if err != nil {
		return
	}

	val.SetBytes(bytes)
	return
}

func bigIntToString(val *big.Int) string {
	return base64.RawURLEncoding.EncodeToString(val.Bytes())
}
