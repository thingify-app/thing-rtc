package pairing

// Internal representation of a stored, completed pairing.
type pairingData struct {
	pairingId       string
	role            string
	serverToken     string
	remotePublicKey PublicKey
	localKeyPair    KeyPair
	remoteMetadata  map[string]string
	localMetadata   map[string]string
}
