package pairing

import (
	"fmt"

	thingrtc "github.com/thingify-app/thing-rtc-go"
)

// Pairing represents the API for initiating and responding to pairing requests.
type Pairing struct {
	pairingStorage PairingStorage
	pairingServer  PairingServer
	keyOperations  KeyOperations
}

// Represents a pairing result which is awaiting a response from the other peer.
type PendingPairingResult struct {
	Shortcode     string
	PairingResult func() (*PairingResult, error)
}

// Represents a complete, successful pairing result.
type PairingResult struct {
	PairingId string
}

// Create a Pairing API object referring to a pairing server at baseUrl.
func NewPairing(baseUrl string) Pairing {
	return Pairing{
		pairingStorage: NewInMemoryPairingStorage(),
		pairingServer:  PairingServer{baseUrl},
		keyOperations:  NewEcdsaKeyOperations(),
	}
}

// InitiatePairing creates a pairing request, resulting in a shortcode which
// must be provided to the peer.
func (p *Pairing) InitiatePairing() (*PendingPairingResult, error) {
	localKeyPair, err := p.keyOperations.generateKeyPair()
	if err != nil {
		return nil, fmt.Errorf("generating keypair failed: %w", err)
	}

	publicKeyJwk := localKeyPair.PublicKey.exportJwk()
	pendingPairing, err := p.pairingServer.createPairingRequest(publicKeyJwk)
	if err != nil {
		return nil, fmt.Errorf("creating pairing request failed: %w", err)
	}

	return &PendingPairingResult{
		Shortcode: pendingPairing.shortcode,
		PairingResult: func() (*PairingResult, error) {
			completedPairing, err := pendingPairing.completedPairing()
			if err != nil {
				return nil, fmt.Errorf("completing pending pairing failed: %w", err)
			}

			remotePublicKey, err := p.keyOperations.importJwkPublicKey(completedPairing.initiatorPublicKey)
			if err != nil {
				return nil, fmt.Errorf("importing public key failed: %w", err)
			}

			p.pairingStorage.savePairing(pairingData{
				pairingId:       pendingPairing.pairingId,
				role:            "responder",
				serverToken:     pendingPairing.token,
				remotePublicKey: remotePublicKey,
				localKeyPair:    localKeyPair,
			})

			return &PairingResult{
				PairingId: pendingPairing.pairingId,
			}, nil
		},
	}, nil
}

// RespondToPairing take a shortcode created by the initiating peer, and
// completes the pairing request with exchange of details with this peer.
func (p *Pairing) RespondToPairing(shortcode string) (*PairingResult, error) {
	localKeyPair, err := p.keyOperations.generateKeyPair()
	if err != nil {
		return nil, fmt.Errorf("generating keypair failed: %w", err)
	}

	publicKeyJwk := localKeyPair.PublicKey.exportJwk()
	pairDetails, err := p.pairingServer.respondToPairingRequest(shortcode, publicKeyJwk)
	if err != nil {
		return nil, fmt.Errorf("responding to pairing request failed: %w", err)
	}

	remotePublicKey, err := p.keyOperations.importJwkPublicKey(pairDetails.responderPublicKey)
	if err != nil {
		return nil, fmt.Errorf("importing public key failed: %w", err)
	}

	p.pairingStorage.savePairing(pairingData{
		pairingId:       pairDetails.pairingId,
		role:            "initiator",
		serverToken:     pairDetails.initiatorToken,
		remotePublicKey: remotePublicKey,
		localKeyPair:    localKeyPair,
	})

	return &PairingResult{
		PairingId: pairDetails.pairingId,
	}, nil
}

// GetTokenGenerator returns a TokenGenerator to be used when signalling to a
// paired peer given by the pairingId.
func (p *Pairing) GetTokenGenerator(pairingId string) thingrtc.TokenGenerator {
	pairingData := p.pairingStorage.getPairing(pairingId)
	return &PairingTokenGenerator{pairingData}
}
