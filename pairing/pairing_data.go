package pairing

type pairingData struct {
	pairingId       string
	role            string
	serverToken     string
	remotePublicKey PublicKey
	localKeyPair    KeyPair
}
