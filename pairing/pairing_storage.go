package pairing

import (
	"encoding/json"
	"fmt"
	"io"
	"os"
)

type PairingStorage interface {
	savePairing(pairingData pairingData) error
	deletePairing(pairingId string)
	getAllPairingIds() []string
	getPairing(pairingId string) (pairingData, error)
	clearAllPairings()
}

type pairingMap map[string]pairingData

type inMemoryPairingStorage struct {
	storage pairingMap
}

func NewInMemoryPairingStorage() PairingStorage {
	return &inMemoryPairingStorage{
		storage: make(map[string]pairingData),
	}
}

func (s *inMemoryPairingStorage) savePairing(pairingData pairingData) error {
	s.storage[pairingData.pairingId] = pairingData
	return nil
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

func (s *inMemoryPairingStorage) getPairing(pairingId string) (pairingData, error) {
	return s.storage[pairingId], nil
}

func (s *inMemoryPairingStorage) clearAllPairings() {
	for k := range s.storage {
		delete(s.storage, k)
	}
}

type filePairingStorage struct {
	filename      string
	keyOperations KeyOperations
}

func NewFilePairingStorage(filename string) PairingStorage {
	return &filePairingStorage{filename, NewEcdsaKeyOperations()}
}

func (s *filePairingStorage) savePairing(pairingData pairingData) error {
	pairingMap, err := s.parseFile()
	if err != nil {
		return err
	}

	pairingMap[pairingData.pairingId] = pairingData
	return s.commitFile(pairingMap)
}

func (s *filePairingStorage) deletePairing(pairingId string) {
	pairingMap, _ := s.parseFile()
	delete(pairingMap, pairingId)
	s.commitFile(pairingMap)
}

func (s *filePairingStorage) getAllPairingIds() []string {
	pairingMap, _ := s.parseFile()

	keys := make([]string, 0, len(pairingMap))
	for k := range pairingMap {
		keys = append(keys, k)
	}

	return keys
}

func (s *filePairingStorage) getPairing(pairingId string) (pairingData, error) {
	pairingMap, err := s.parseFile()
	if err != nil {
		return pairingData{}, nil
	}

	if pairingData, ok := pairingMap[pairingId]; ok {
		return pairingData, nil
	}

	err = fmt.Errorf("pairingId %v not found", pairingId)
	return pairingData{}, err
}

func (s *filePairingStorage) clearAllPairings() {
	pairingMap, _ := s.parseFile()
	for k := range pairingMap {
		delete(pairingMap, k)
	}
	s.commitFile(pairingMap)
}

type storedPairingData struct {
	Role               string
	ServerToken        string
	RemotePublicKeyJwk string
	LocalPublicKeyJwk  string
	LocalPrivateKeyJwk string
}

func createIfNotExists(filename string) (*os.File, error) {
	file, err := os.OpenFile(filename, os.O_CREATE|os.O_RDWR, os.ModePerm)
	if err != nil {
		return nil, fmt.Errorf("unable to open file '%v': %w", filename, err)
	}

	info, err := file.Stat()
	if err != nil {
		return nil, fmt.Errorf("unable to stat file '%v': %w", filename, err)
	}

	if info.Size() == 0 {
		// Write an empty JSON object.
		_, err := file.WriteString("{}")
		if err != nil {
			return nil, fmt.Errorf("unable to write empty JSON to file '%v': %w", filename, err)
		}

		// Seek back to the start for future operations
		_, err = file.Seek(0, 0)
		if err != nil {
			return nil, fmt.Errorf("unable to seek file to start '%v': %w", filename, err)
		}
	}

	return file, nil
}

func (s *filePairingStorage) parseFile() (pairingMap, error) {
	file, err := createIfNotExists(s.filename)
	if err != nil {
		return nil, fmt.Errorf("unable to open file '%v': %w", s.filename, err)
	}
	defer file.Close()

	fileBytes, err := io.ReadAll(file)
	if err != nil {
		return nil, fmt.Errorf("unable to read file contents '%v': %w", s.filename, err)
	}

	storedData := make(map[string]storedPairingData)

	err = json.Unmarshal(fileBytes, &storedData)
	if err != nil {
		return nil, fmt.Errorf("unable to parse file '%v': %w", s.filename, err)
	}

	data := make(map[string]pairingData)
	for k, v := range storedData {
		remotePublicKey, err := s.keyOperations.importJwkPublicKey(v.RemotePublicKeyJwk)
		if err != nil {
			return nil, err
		}

		localPublicKey, err := s.keyOperations.importJwkPublicKey(v.LocalPublicKeyJwk)
		if err != nil {
			return nil, err
		}

		localPrivateKey, err := s.keyOperations.importJwkPrivateKey(v.LocalPrivateKeyJwk)
		if err != nil {
			return nil, err
		}

		data[k] = pairingData{
			pairingId:       k,
			role:            v.Role,
			serverToken:     v.ServerToken,
			remotePublicKey: remotePublicKey,
			localKeyPair: KeyPair{
				PublicKey:  localPublicKey,
				PrivateKey: localPrivateKey,
			},
		}
	}

	return data, nil
}

func (s *filePairingStorage) commitFile(data pairingMap) error {
	storedData := make(map[string]storedPairingData)
	for k, v := range data {
		storedData[k] = storedPairingData{
			Role:               v.role,
			ServerToken:        v.serverToken,
			RemotePublicKeyJwk: v.remotePublicKey.exportJwk(),
			LocalPublicKeyJwk:  v.localKeyPair.PublicKey.exportJwk(),
			LocalPrivateKeyJwk: v.localKeyPair.PrivateKey.exportJwk(),
		}
	}

	jsonData, err := json.Marshal(&storedData)
	if err != nil {
		return err
	}

	err = os.WriteFile(s.filename, jsonData, 0)
	if err != nil {
		return err
	}

	return nil
}
