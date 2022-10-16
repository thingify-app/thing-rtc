package thingrtc

import (
	"encoding/json"
	"testing"

	"github.com/gorilla/websocket"
	"github.com/pion/webrtc/v3"
)

type PeerConnectMessage struct {
	Type  string
	Nonce string
}

type Message struct {
	Type      string
	Signature string
	Data      string
}

func newTokenGenerator() MockTokenGenerator {
	return MockTokenGenerator{
		Role:         "initiator",
		PairingId:    "pairingId",
		Nonce:        "nonce",
		Signature:    "signature",
		VerifyResult: true,
	}
}

func TestSuccessfulOfferExchange(t *testing.T) {
	actions := func(conn *websocket.Conn) {
		// Assert that auth message is received
		auth := Message{}
		err := conn.ReadJSON(&auth)

		if err != nil {
			t.Error(err)
		}
		if auth.Type != "auth" {
			t.Errorf("First message was not auth: %v", auth)
		}

		authData := struct {
			Token string
			Nonce string
		}{}
		err = json.Unmarshal([]byte(auth.Data), &authData)
		if err != nil {
			t.Error(err)
		}
		if authData.Token != "token" || authData.Nonce != "nonce" {
			t.Errorf("Auth message has incorrect fields: %v", auth.Data)
		}

		// Send peer connect message
		peerConnect := PeerConnectMessage{
			Type:  "peerConnect",
			Nonce: "myNonce",
		}
		conn.WriteJSON(&peerConnect)

		// Assert that offer is received
		offer := Message{}
		err = conn.ReadJSON(&offer)

		if err != nil {
			t.Error(err)
		}
		if offer.Type != "offer" {
			t.Errorf("Next message was not offer: %v", offer)
		}
		if offer.Signature != "signature" {
			t.Errorf("Offer message has incorrect signature: %v", offer)
		}

		answer := Message{
			Type: "answer",
			Data: "{\"nonce\": \"nonce\"}",
		}
		conn.WriteJSON(&answer)

		// Assert close is received
	}

	signallingServer, channels := createSignallingServer(newTokenGenerator(), actions)
	signallingServer.Connect()

	select {
	case <-channels.peerConnect:
		// Continue
	case err := <-channels.err:
		t.Fatal(err)
	}

	signallingServer.SendOffer(webrtc.SessionDescription{})

	select {
	case <-channels.answer:
		// Continue
	case err := <-channels.err:
		t.Fatal(err)
	}
}

func TestSuccessfulAnswerExchange(t *testing.T) {
	actions := func(conn *websocket.Conn) {
		// Consume auth message
		conn.ReadMessage()

		// Send peer connect message
		peerConnect := PeerConnectMessage{
			Type:  "peerConnect",
			Nonce: "myNonce",
		}
		conn.WriteJSON(&peerConnect)

		// Send offer message
		offer := Message{
			Type: "offer",
			Data: "{\"nonce\": \"nonce\"}",
		}
		conn.WriteJSON(&offer)

		// Assert that answer is received
		answer := Message{}
		err := conn.ReadJSON(&answer)

		if err != nil {
			t.Error(err)
		}
		if answer.Type != "answer" {
			t.Errorf("Next message was not answer: %v", answer)
		}
		if answer.Signature != "signature" {
			t.Errorf("Answer message has incorrect signature: %v", offer)
		}

		// Send peer disconnect message
		peerDisconnect := PeerConnectMessage{
			Type:  "peerDisconnect",
			Nonce: "myNonce",
		}
		conn.WriteJSON(&peerDisconnect)

		// Assert close is received
	}

	signallingServer, channels := createSignallingServer(newTokenGenerator(), actions)
	signallingServer.Connect()

	select {
	case <-channels.peerConnect:
		// Continue
	case err := <-channels.err:
		t.Fatal(err)
	}

	select {
	case <-channels.offer:
		// Continue
	case err := <-channels.err:
		t.Fatal(err)
	}

	signallingServer.SendAnswer(webrtc.SessionDescription{})

	select {
	case <-channels.peerDisconnect:
		// Continue
	case err := <-channels.err:
		t.Fatal(err)
	}
}

func TestSuccessfulIceCandidateExchange(t *testing.T) {
	actions := func(conn *websocket.Conn) {
		// Consume auth message
		conn.ReadMessage()

		// Send peer connect message
		peerConnect := PeerConnectMessage{
			Type:  "peerConnect",
			Nonce: "myNonce",
		}
		conn.WriteJSON(&peerConnect)

		// Assert that iceCandidate is received
		remoteIceCandidate := Message{}
		err := conn.ReadJSON(&remoteIceCandidate)

		if err != nil {
			t.Error(err)
		}
		if remoteIceCandidate.Type != "iceCandidate" {
			t.Errorf("Next message was not iceCandidate: %v", remoteIceCandidate)
		}
		if remoteIceCandidate.Signature != "signature" {
			t.Errorf("IceCandidate message has incorrect signature: %v", remoteIceCandidate)
		}

		// Send iceCandidate
		localIceCandidate := Message{
			Type: "iceCandidate",
			Data: "{\"nonce\": \"nonce\"}",
		}
		conn.WriteJSON(&localIceCandidate)

		// Assert close is received
	}

	signallingServer, channels := createSignallingServer(newTokenGenerator(), actions)
	signallingServer.Connect()

	select {
	case <-channels.peerConnect:
		// Continue
	case err := <-channels.err:
		t.Fatal(err)
	}

	signallingServer.SendIceCandidate(webrtc.ICECandidateInit{})

	select {
	case <-channels.iceCandidate:
		// Continue
	case err := <-channels.err:
		t.Fatal(err)
	}
}

func TestMissingPeerConnectNonce(t *testing.T) {
	actions := func(conn *websocket.Conn) {
		// Consume auth message
		conn.ReadMessage()

		// Send invalid peer connect message
		peerConnect := struct {
			Type string
		}{
			Type: "peerConnect",
		}
		conn.WriteJSON(&peerConnect)
	}

	signallingServer, channels := createSignallingServer(newTokenGenerator(), actions)
	signallingServer.Connect()

	select {
	case <-channels.peerConnect:
		t.Fatalf("peerConnect listener should not be triggered on invalid message")
	case <-channels.err:
		// Continue
	}
}

func TestInvalidDataMessageNonce(t *testing.T) {
	actions := func(conn *websocket.Conn) {
		// Consume auth message
		conn.ReadMessage()

		// Send peer connect message
		peerConnect := PeerConnectMessage{
			Type:  "peerConnect",
			Nonce: "myNonce",
		}
		conn.WriteJSON(&peerConnect)

		// Send offer message
		offer := Message{
			Type: "offer",
			Data: "{\"nonce\": \"wrongNonce\"}",
		}
		conn.WriteJSON(&offer)
	}

	signallingServer, channels := createSignallingServer(newTokenGenerator(), actions)
	signallingServer.Connect()

	select {
	case <-channels.peerConnect:
		// Continue
	case err := <-channels.err:
		t.Fatal(err)
	}

	select {
	case <-channels.offer:
		t.Fatalf("offer listener should not be triggered on invalid nonce")
	case <-channels.err:
		// Continue
	}
}

func TestMissingDataMessageNonce(t *testing.T) {
	actions := func(conn *websocket.Conn) {
		// Consume auth message
		conn.ReadMessage()

		// Send peer connect message
		peerConnect := PeerConnectMessage{
			Type:  "peerConnect",
			Nonce: "myNonce",
		}
		conn.WriteJSON(&peerConnect)

		// Send offer message
		offer := Message{
			Type: "offer",
			Data: "{}",
		}
		conn.WriteJSON(&offer)
	}

	signallingServer, channels := createSignallingServer(newTokenGenerator(), actions)
	signallingServer.Connect()

	select {
	case <-channels.peerConnect:
		// Continue
	case err := <-channels.err:
		t.Fatal(err)
	}

	select {
	case <-channels.offer:
		t.Fatalf("offer listener should not be triggered on missing nonce")
	case <-channels.err:
		// Continue
	}
}

func TestInvalidSignatureMessage(t *testing.T) {
	tokenGenerator := newTokenGenerator()
	tokenGenerator.VerifyResult = false

	actions := func(conn *websocket.Conn) {
		// Consume auth message
		conn.ReadMessage()

		// Send peer connect message
		peerConnect := PeerConnectMessage{
			Type:  "peerConnect",
			Nonce: "myNonce",
		}
		conn.WriteJSON(&peerConnect)

		// Send iceCandidate
		localIceCandidate := Message{
			Type: "iceCandidate",
			Data: "{\"nonce\": \"nonce\"}",
		}
		conn.WriteJSON(&localIceCandidate)

		// Assert close is received
	}

	signallingServer, channels := createSignallingServer(tokenGenerator, actions)
	signallingServer.Connect()

	select {
	case <-channels.peerConnect:
		// Continue
	case err := <-channels.err:
		t.Fatal(err)
	}

	select {
	case <-channels.iceCandidate:
		t.Fatalf("iceCandidate listener should not be triggered on invalid signature")
	case <-channels.err:
		// Continue
	}
}
