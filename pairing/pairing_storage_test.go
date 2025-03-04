package pairing

import (
	"os"
	"testing"
)

func createFilePairingStorage() (PairingStorage, *os.File) {
	file, err := os.CreateTemp("", "thingrtc_pairing_storage_test_*.json")
	if err != nil {
		panic(err)
	}

	return NewFilePairingStorage(file.Name()), file
}

func createPairingData(pairingId string) pairingData {
	keyOperations := NewEcdsaKeyOperationsWithRand(onesReader)
	remoteKeyPair, err := keyOperations.generateKeyPair()
	if err != nil {
		panic(err)
	}
	localKeyPair, err := keyOperations.generateKeyPair()
	if err != nil {
		panic(err)
	}

	return pairingData{
		pairingId:       pairingId,
		role:            "initiator",
		serverToken:     "testServerToken",
		remotePublicKey: remoteKeyPair.PublicKey,
		localKeyPair:    localKeyPair,
		remoteMetadata:  map[string]string{"foo": "bar"},
		localMetadata:   map[string]string{"baz": "bat"},
	}
}

func TestFileStorageEmpty(t *testing.T) {
	pairingStorage, _ := createFilePairingStorage()
	pairingIds := pairingStorage.getAllPairingIds()

	if len(pairingIds) != 0 {
		t.Errorf("Non-empty pairings list: %v", pairingIds)
	}
}

func TestFileStorageOneEntry(t *testing.T) {
	pairingStorage, _ := createFilePairingStorage()
	pairingData := createPairingData("testPairing123")

	err := pairingStorage.savePairing(pairingData)
	if err != nil {
		t.Error(err)
		return
	}

	pairingIds := pairingStorage.getAllPairingIds()

	if len(pairingIds) != 1 {
		t.Errorf("Pairing list does not contain one item: %v", pairingIds)
		return
	}

	if pairingIds[0] != "testPairing123" {
		t.Errorf("Incorrect pairingId: %v", pairingIds[0])
	}
}

func TestFileRoundTrip(t *testing.T) {
	pairingStorage, _ := createFilePairingStorage()
	pairingData := createPairingData("testPairing123")

	err := pairingStorage.savePairing(pairingData)
	if err != nil {
		t.Error(err)
		return
	}

	savedPairingData, err := pairingStorage.getPairing(pairingData.pairingId)
	if err != nil {
		t.Error(err)
		return
	}

	if savedPairingData.pairingId != "testPairing123" {
		t.Errorf("Incorrect pairingId: %v", savedPairingData.pairingId)
	}
	if savedPairingData.localMetadata["baz"] != "bat" {
		t.Errorf("Incorrect metadata: %v", savedPairingData.localMetadata)
	}
	if savedPairingData.remoteMetadata["foo"] != "bar" {
		t.Errorf("Incorrect metadata: %v", savedPairingData.remoteMetadata)
	}
}

func TestInvalidMetadata(t *testing.T) {
	pairingStorage, file := createFilePairingStorage()
	file.WriteString("{}a")

	pairingStorage.getAllPairingIds()
}

func TestMissingMetadata(t *testing.T) {
	pairingStorage, _ := createFilePairingStorage()

	keyOperations := NewEcdsaKeyOperationsWithRand(onesReader)
	remoteKeyPair, err := keyOperations.generateKeyPair()
	if err != nil {
		panic(err)
	}
	localKeyPair, err := keyOperations.generateKeyPair()
	if err != nil {
		panic(err)
	}

	pairingData := pairingData{
		pairingId:       "testPairing123",
		role:            "initiator",
		serverToken:     "testServerToken",
		remotePublicKey: remoteKeyPair.PublicKey,
		localKeyPair:    localKeyPair,
	}

	err = pairingStorage.savePairing(pairingData)
	if err != nil {
		t.Error(err)
		return
	}

	savedPairingData, err := pairingStorage.getPairing("testPairing123")
	if err != nil {
		t.Error(err)
		return
	}

	if savedPairingData.remoteMetadata != nil {
		t.Errorf("nil metadata")
	}
}

func TestFileDelete(t *testing.T) {
	pairingStorage, _ := createFilePairingStorage()
	pairingData := createPairingData("testPairing123")

	err := pairingStorage.savePairing(pairingData)
	if err != nil {
		t.Error(err)
		return
	}

	pairingStorage.deletePairing("testPairing123")
	_, err = pairingStorage.getPairing("testPairing123")
	if err == nil {
		t.Errorf("Expected error on non-existent pairingId")
	}
}

func TestFileClearing(t *testing.T) {
	pairingStorage, _ := createFilePairingStorage()
	pairingData := createPairingData("testPairing123")

	err := pairingStorage.savePairing(pairingData)
	if err != nil {
		t.Error(err)
		return
	}

	pairingStorage.clearAllPairings()
	pairingIds := pairingStorage.getAllPairingIds()

	if len(pairingIds) != 0 {
		t.Errorf("Non-empty pairings list after clearing: %v", pairingIds)
	}
}

func TestGetNonExistentPairingId(t *testing.T) {
	pairingStorage, _ := createFilePairingStorage()
	pairingData := createPairingData("testPairing123")

	err := pairingStorage.savePairing(pairingData)
	if err != nil {
		t.Error(err)
		return
	}

	_, err = pairingStorage.getPairing("testPairingNonExistent")
	if err == nil {
		t.Errorf("Expected error on non-existent pairingId")
	}
}

func TestDeleteNonExistentPairingId(t *testing.T) {
	pairingStorage, _ := createFilePairingStorage()

	// Just expect no panic
	pairingStorage.deletePairing("testPairing123")
}
