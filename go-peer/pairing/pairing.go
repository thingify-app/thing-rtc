package pairing

import (
	"fmt"
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
	PairingId      string
	LocalMetadata  map[string]string
	RemoteMetadata map[string]string
}

// Create a Pairing API object referring to a pairing server at baseUrl.
func NewPairing(baseUrl string, pairingFilename string) Pairing {
	return Pairing{
		pairingStorage: NewFilePairingStorage(pairingFilename),
		pairingServer:  PairingServer{baseUrl},
		keyOperations:  NewEcdsaKeyOperations(),
	}
}

// InitiatePairing creates a pairing request, resulting in a shortcode which
// must be provided to the peer.
func (p *Pairing) InitiatePairing() (*PendingPairingResult, error) {
	return p.InitiatePairingWithMetadata(make(map[string]string))
}

func (p *Pairing) InitiatePairingWithMetadata(metadata map[string]string) (*PendingPairingResult, error) {
	localKeyPair, err := p.keyOperations.generateKeyPair()
	if err != nil {
		return nil, fmt.Errorf("generating keypair failed: %w", err)
	}

	publicKeyJwk := localKeyPair.PublicKey.exportJwk()
	pendingPairing, err := p.pairingServer.createPairingRequest(publicKeyJwk, metadata)
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

			err = p.pairingStorage.savePairing(pairingData{
				pairingId:       pendingPairing.pairingId,
				role:            "responder",
				serverToken:     pendingPairing.token,
				remotePublicKey: remotePublicKey,
				localKeyPair:    localKeyPair,
				remoteMetadata:  completedPairing.metadata,
				localMetadata:   metadata,
			})
			if err != nil {
				return nil, err
			}

			return &PairingResult{
				PairingId:      pendingPairing.pairingId,
				LocalMetadata:  metadata,
				RemoteMetadata: completedPairing.metadata,
			}, nil
		},
	}, nil
}

// RespondToPairing take a shortcode created by the initiating peer, and
// completes the pairing request with exchange of details with this peer.
func (p *Pairing) RespondToPairing(shortcode string) (*PairingResult, error) {
	return p.RespondToPairingWithMetadata(shortcode, make(map[string]string))
}

func (p *Pairing) RespondToPairingWithMetadata(shortcode string, metadata map[string]string) (*PairingResult, error) {
	localKeyPair, err := p.keyOperations.generateKeyPair()
	if err != nil {
		return nil, fmt.Errorf("generating keypair failed: %w", err)
	}

	publicKeyJwk := localKeyPair.PublicKey.exportJwk()
	pairDetails, err := p.pairingServer.respondToPairingRequest(shortcode, publicKeyJwk, metadata)
	if err != nil {
		return nil, fmt.Errorf("responding to pairing request failed: %w", err)
	}

	remotePublicKey, err := p.keyOperations.importJwkPublicKey(pairDetails.responderPublicKey)
	if err != nil {
		return nil, fmt.Errorf("importing public key failed: %w", err)
	}

	err = p.pairingStorage.savePairing(pairingData{
		pairingId:       pairDetails.pairingId,
		role:            "initiator",
		serverToken:     pairDetails.initiatorToken,
		remotePublicKey: remotePublicKey,
		localKeyPair:    localKeyPair,
		remoteMetadata:  pairDetails.metadata,
		localMetadata:   metadata,
	})
	if err != nil {
		return nil, err
	}

	return &PairingResult{
		PairingId:      pairDetails.pairingId,
		LocalMetadata:  metadata,
		RemoteMetadata: pairDetails.metadata,
	}, nil
}

// GetTokenGenerator returns a TokenGenerator to be used when signalling to a
// paired peer given by the pairingId.
func (p *Pairing) GetTokenGenerator(pairingId string) (TokenGenerator, error) {
	pairingData, err := p.pairingStorage.getPairing(pairingId)
	if err != nil {
		return nil, err
	}

	return &PairingTokenGenerator{pairingData}, nil
}

func (p *Pairing) GetAllPairingIds() []string {
	return p.pairingStorage.getAllPairingIds()
}

func (p *Pairing) GetAllPairings() ([]*PairingResult, error) {
	var results []*PairingResult
	for _, id := range p.pairingStorage.getAllPairingIds() {
		pairing, err := p.pairingStorage.getPairing(id)
		if err != nil {
			return nil, err
		}
		results = append(results, &PairingResult{
			PairingId:      id,
			LocalMetadata:  pairing.localMetadata,
			RemoteMetadata: pairing.remoteMetadata,
		})
	}
	return results, nil
}

func (p *Pairing) DeletePairing(pairingId string) {
	p.pairingStorage.deletePairing(pairingId)
}

func (p *Pairing) ClearAllPairings() {
	p.pairingStorage.clearAllPairings()
}
