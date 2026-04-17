package peerconfig

type PeerAuth interface {
	// Signs each signalling message for verification by the peer.
	// Returns a base64-encoded string signature.
	SignMessage(message string) (string, error)

	// Verifies a signalling message signature received by the peer.
	// The signature must be base64-encoded.
	VerifyMessage(base64Signature string, message string) bool

	// Generates a one-time cryptographically strong random string.
	GenerateNonce() string
}
