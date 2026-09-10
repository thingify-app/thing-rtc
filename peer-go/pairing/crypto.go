package pairing

import (
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"math/big"
)

const NONCE_BYTES = 18

// KeyOperations represents the set of starting points for a particular public
// key cryptography implementation.
type KeyOperations interface {
	ImportSpkiPublicKey(spki []byte) (PublicKey, error)
	ImportJwkPublicKey(jwk string) (PublicKey, error)
	ImportJwkPrivateKey(jwk string) (PrivateKey, error)
	GenerateKeyPair() (KeyPair, error)
}

type PublicKey interface {
	VerifyMessage(signature []byte, message string) bool
	ExportJwk() string
	ExportSpki() []byte
	Fingerprint() string
}

type PrivateKey interface {
	SignMessage(message string) ([]byte, error)
	ExportJwk() string
	PublicKey() PublicKey
}

type KeyPair struct {
	PublicKey  PublicKey
	PrivateKey PrivateKey
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

type ecdsaKeyOperations struct {
	rand io.Reader
}

// Returns a KeyOperations which implements ECDSA public/private keypairs using
// the P-256 curve.
func NewEcdsaKeyOperations() KeyOperations {
	return NewEcdsaKeyOperationsWithRand(rand.Reader)
}

func NewEcdsaKeyOperationsWithRand(rand io.Reader) KeyOperations {
	return ecdsaKeyOperations{rand}
}

func (ecdsaKeyOperations) ImportSpkiPublicKey(spki []byte) (key PublicKey, err error) {
	publicKey, err := x509.ParsePKIXPublicKey(spki)
	if err != nil {
		return nil, err
	}

	ecdsaPublicKey, ok := publicKey.(*ecdsa.PublicKey)
	if !ok {
		return nil, fmt.Errorf("Failed to parse key as ECDSA")
	}

	return newEcdsaPublicKey(ecdsaPublicKey)
}

// Imports a JWK-encoded ECDSA public key using the P-256 curve into our PublicKey representation.
func (ecdsaKeyOperations) ImportJwkPublicKey(jwk string) (key PublicKey, err error) {
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
	key, err = newEcdsaPublicKey(publicKey)

	return
}

func (e ecdsaKeyOperations) ImportJwkPrivateKey(data string) (PrivateKey, error) {
	members := struct {
		Kty string
		Crv string
		X   string
		Y   string
		D   string
	}{}
	err := json.Unmarshal([]byte(data), &members)
	if err != nil {
		return nil, err
	}

	if members.Kty != "EC" {
		err := fmt.Errorf("JWK algorithm %v is not acceptable", members.Kty)
		return nil, err
	}

	if members.Crv != "P-256" {
		err := fmt.Errorf("JWK curve %v is not acceptable", members.Crv)
		return nil, err
	}

	x, err := stringToBigInt(members.X)
	if err != nil {
		return nil, err
	}
	y, err := stringToBigInt(members.Y)
	if err != nil {
		return nil, err
	}
	d, err := stringToBigInt(members.D)
	if err != nil {
		return nil, err
	}

	privateKey := &ecdsa.PrivateKey{
		PublicKey: ecdsa.PublicKey{
			Curve: elliptic.P256(),
			X:     x,
			Y:     y,
		},
		D: d,
	}

	return newEcdsaPrivateKey(privateKey, e.rand)
}

// Generates an ECDSA key pair using the P-256 curve.
func (e ecdsaKeyOperations) GenerateKeyPair() (keyPair KeyPair, err error) {
	generatedKey, err := ecdsa.GenerateKey(elliptic.P256(), e.rand)
	if err != nil {
		return
	}

	p, err := newEcdsaPrivateKey(generatedKey, e.rand)
	if err != nil {
		return
	}

	keyPair = KeyPair{
		PublicKey:  p.PublicKey(),
		PrivateKey: p,
	}
	return
}

func newEcdsaPublicKey(publicKey *ecdsa.PublicKey) (PublicKey, error) {
	spki, err := x509.MarshalPKIXPublicKey(publicKey)
	if err != nil {
		return nil, err
	}

	keyDigest := sha256.Sum256(spki)
	fingerprint := base64.StdEncoding.EncodeToString(keyDigest[:])

	return ecdsaPublicKey{
		publicKey:   publicKey,
		spki:        spki,
		fingerprint: fingerprint,
	}, nil
}

type ecdsaPublicKey struct {
	publicKey *ecdsa.PublicKey

	// SPKI and fingerprint are derived from publicKey, but precomputed and
	// stored in the struct to catch all errors at creation time.
	spki        []byte
	fingerprint string
}

func newEcdsaPrivateKey(privateKey *ecdsa.PrivateKey, rand io.Reader) (PrivateKey, error) {
	publicKey, err := newEcdsaPublicKey(&privateKey.PublicKey)
	if err != nil {
		return nil, err
	}

	return &ecdsaPrivateKey{
		privateKey: privateKey,
		publicKey:  publicKey,
		rand:       rand,
	}, nil
}

type ecdsaPrivateKey struct {
	privateKey *ecdsa.PrivateKey
	rand       io.Reader

	// publicKey is derived from privateKey, but precomputed and stored in the
	// struct to catch all errors at creation time.
	publicKey PublicKey
}

func (e ecdsaPublicKey) VerifyMessage(signature []byte, message string) bool {
	hash := sha256.Sum256([]byte(message))

	signatureLen := len(signature)
	if signatureLen != 64 {
		// Each of r,s should be 32 bytes when padded. If they don't add up to 64, this indicates incorrect padding.
		return false
	}

	// Interpret signature as IEEE P1363 format as used by WebCrypto.
	r := big.Int{}
	s := big.Int{}
	r.SetBytes(signature[:signatureLen/2])
	s.SetBytes(signature[signatureLen/2:])

	return ecdsa.Verify(e.publicKey, hash[:], &r, &s)
}

func (e ecdsaPublicKey) ExportJwk() string {
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

func (e ecdsaPublicKey) ExportSpki() []byte {
	return e.spki
}

func (e ecdsaPublicKey) Fingerprint() string {
	return e.fingerprint
}

func (e ecdsaPrivateKey) SignMessage(message string) ([]byte, error) {
	hash := sha256.Sum256([]byte(message))
	r, s, err := ecdsa.Sign(e.rand, e.privateKey, hash[:])
	if err != nil {
		return nil, err
	}

	// Render signature as IEEE P1363 as used by WebCrypto.
	// This requires r,s values to be left-padded with zeros to make 32 bytes if they are less.
	signatureBytes := append(padBytes(r.Bytes(), 32), padBytes(s.Bytes(), 32)...)

	return signatureBytes, nil
}

func (e ecdsaPrivateKey) ExportJwk() string {
	members := struct {
		Kty string `json:"kty"`
		Crv string `json:"crv"`
		X   string `json:"x"`
		Y   string `json:"y"`
		D   string `json:"d"`
	}{
		Kty: "EC",
		Crv: "P-256",
		X:   bigIntToString(e.privateKey.X),
		Y:   bigIntToString(e.privateKey.Y),
		D:   bigIntToString(e.privateKey.D),
	}

	jwk, _ := json.Marshal(members)
	return string(jwk)
}

func (e ecdsaPrivateKey) PublicKey() PublicKey {
	return e.publicKey
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

// Left-pads input with zeros to make up to n bytes.
func padBytes(b []byte, n int) []byte {
	l := len(b)
	ret := make([]byte, n)
	copy(ret[n-l:], b)
	return ret
}
