package pairing

type PairingStorage interface {
	savePairing(pairingData pairingData)
	deletePairing(pairingId string)
	getAllPairingIds() []string
	getAllPairings() []pairingData
	getPairing(pairingId string) pairingData
	clearAllPairings()
}

type inMemoryPairingStorage struct {
	storage map[string]pairingData
}

func NewInMemoryPairingStorage() PairingStorage {
	return &inMemoryPairingStorage{
		storage: make(map[string]pairingData),
	}
}

func (s *inMemoryPairingStorage) savePairing(pairingData pairingData) {
	s.storage[pairingData.pairingId] = pairingData
}

func (s *inMemoryPairingStorage) deletePairing(pairingId string) {
	delete(s.storage, pairingId)
}

func (s *inMemoryPairingStorage) getAllPairingIds() []string {
	keys := make([]string, 0, len(s.storage))
	for k := range s.storage {
		keys = append(keys, k)
	}

	return keys
}

func (s *inMemoryPairingStorage) getAllPairings() []pairingData {
	pairings := make([]pairingData, 0, len(s.storage))
	for k := range s.storage {
		pairings = append(pairings, s.storage[k])
	}
	return pairings
}

func (s *inMemoryPairingStorage) getPairing(pairingId string) pairingData {
	return s.storage[pairingId]
}

func (s *inMemoryPairingStorage) clearAllPairings() {
	for k := range s.storage {
		delete(s.storage, k)
	}
}
