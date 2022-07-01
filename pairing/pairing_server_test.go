package pairing

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gorilla/websocket"
)

func createWebsocketServer(actions func(conn *websocket.Conn)) *httptest.Server {
	upgrader := websocket.Upgrader{}
	handler := func(w http.ResponseWriter, r *http.Request) {
		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			return
		}

		defer conn.Close()

		actions(conn)
	}
	return httptest.NewServer(http.HandlerFunc(handler))
}

func createPairingServer(actions func(conn *websocket.Conn)) PairingServer {
	server := createWebsocketServer(actions)
	return PairingServer{baseUrl: server.URL}
}

func TestCreatePairingRequest(t *testing.T) {
	actions := func(conn *websocket.Conn) {
		conn.ReadMessage()
		conn.WriteMessage(websocket.TextMessage, []byte(`
		{
			"pairingId": "abc123",
			"shortcode": "short123",
			"token": "token123",
			"expiry": 123
		}`))
		conn.WriteMessage(websocket.TextMessage, []byte(`
		{
			"status": "paired",
			"initiatorPublicKey": "publicKey"
		}`))
	}

	pairingServer := createPairingServer(actions)
	pendingPairing, err := pairingServer.createPairingRequest("myToken")

	if err != nil {
		t.Error(err)
		return
	}

	if pendingPairing.pairingId != "abc123" {
		t.Errorf("Incorrect pairingId: %v.", pendingPairing.pairingId)
	}
	if pendingPairing.shortcode != "short123" {
		t.Errorf("Incorrect shortcode: %v.", pendingPairing.shortcode)
	}
	if pendingPairing.token != "token123" {
		t.Errorf("Incorrect token: %v.", pendingPairing.token)
	}
	if pendingPairing.expiry != 123 {
		t.Errorf("Incorrect expiry: %v.", pendingPairing.expiry)
	}

	completedPairing, err := pendingPairing.completedPairing()
	if err != nil {
		t.Error(err)
		return
	}

	if !completedPairing.success {
		t.Error("Unsuccessful pairing response.")
	}

	if completedPairing.initiatorPublicKey != "publicKey" {
		t.Errorf("Incorrect public key: %v.", completedPairing.initiatorPublicKey)
	}
}

func TestRespondToPairingRequest(t *testing.T) {
	handler := func(w http.ResponseWriter, r *http.Request) {
		requestUrl := r.URL
		if r.Method != "POST" {
			t.Errorf("Incorrect method used: %v", r.Method)
		}
		if requestUrl.Path != "/ABC123" {
			t.Errorf("Incorrect shortcode received: %v", requestUrl.Path)
		}

		body := make(map[string]string)
		err := json.NewDecoder(r.Body).Decode(&body)
		if err != nil {
			t.Error(err)
			return
		}
		if body["publicKey"] != "myJwk" {
			t.Errorf("Invalid body received: %v", body)
		}

		w.Write([]byte(`
		{
			"pairingId": "abc123",
			"responderPublicKey": "publicKey",
			"initiatorToken": "token123"
		}`))
	}
	server := httptest.NewServer(http.HandlerFunc(handler))
	pairingServer := PairingServer{baseUrl: server.URL}
	pairDetails, err := pairingServer.respondToPairingRequest("ABC123", "myJwk")

	if err != nil {
		t.Error(err)
		return
	}

	if pairDetails.pairingId != "abc123" {
		t.Errorf("Incorrect pairingId: %v.", pairDetails.pairingId)
	}
	if pairDetails.responderPublicKey != "publicKey" {
		t.Errorf("Incorrect responderPublicKey: %v.", pairDetails.responderPublicKey)
	}
	if pairDetails.initiatorToken != "token123" {
		t.Errorf("Incorrect initiatorToken: %v.", pairDetails.initiatorToken)
	}
}
