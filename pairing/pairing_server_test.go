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

	select {
	case p := <-pendingPairing:
		if p.pairingId != "abc123" {
			t.Errorf("Incorrect pairingId: %v.", p.pairingId)
		}
		if p.shortcode != "short123" {
			t.Errorf("Incorrect shortcode: %v.", p.shortcode)
		}
		if p.token != "token123" {
			t.Errorf("Incorrect token: %v.", p.token)
		}
		if p.expiry != 123 {
			t.Errorf("Incorrect expiry: %v.", p.expiry)
		}
		select {
		case c := <-p.completedPairing:
			if c.initiatorPublicKey != "publicKey" {
				t.Errorf("Incorrect public key: %v.", c.initiatorPublicKey)
			}
			if !c.success {
				t.Errorf("Unsuccessful pairing completion.")
			}
		case e := <-err:
			t.Error(e)
		}
	case e := <-err:
		t.Error(e)
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

	select {
	case p := <-pairDetails:
		if p.pairingId != "abc123" {
			t.Errorf("Incorrect pairingId: %v.", p.pairingId)
		}
		if p.responderPublicKey != "publicKey" {
			t.Errorf("Incorrect responderPublicKey: %v.", p.responderPublicKey)
		}
		if p.initiatorToken != "token123" {
			t.Errorf("Incorrect initiatorToken: %v.", p.initiatorToken)
		}
	case e := <-err:
		t.Error(e)
	}
}
