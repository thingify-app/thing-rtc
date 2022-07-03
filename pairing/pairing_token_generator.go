package pairing

import "encoding/base64"

type PairingTokenGenerator struct {
	pairingData pairingData
}

func (p *PairingTokenGenerator) GenerateToken() string {
	return p.pairingData.serverToken
}

func (p *PairingTokenGenerator) GetPairingId() string {
	return p.pairingData.pairingId
}

func (p *PairingTokenGenerator) GetRole() string {
	return p.pairingData.role
}

func (p *PairingTokenGenerator) GenerateNonce() string {
	return GenerateNonce()
}

func (p *PairingTokenGenerator) SignMessage(message string) (string, error) {
	signatureBytes, err := p.pairingData.localKeyPair.PrivateKey.signMessage(message)
	if err != nil {
		return "", err
	}

	return base64.StdEncoding.EncodeToString(signatureBytes), nil
}

func (p *PairingTokenGenerator) VerifyMessage(base64Signature string, message string) bool {
	signatureBytes, err := base64.StdEncoding.DecodeString(base64Signature)
	if err != nil {
		return false
	}

	return p.pairingData.remotePublicKey.verifyMessage(signatureBytes, message)
}
