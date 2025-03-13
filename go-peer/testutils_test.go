package thingrtc

import (
	"net/http"
	"net/http/httptest"
	"strings"

	"github.com/gorilla/websocket"
	"github.com/pion/webrtc/v3"
	"github.com/thingify-app/thing-rtc/pairing"
)

type MockTokenGenerator struct {
	Role         string
	PairingId    string
	Nonce        string
	Signature    string
	VerifyResult bool
}

func (m MockTokenGenerator) GenerateToken() string {
	return "token"
}

func (m MockTokenGenerator) GetPairingId() string {
	return m.PairingId
}

func (m MockTokenGenerator) GetRole() string {
	return m.Role
}

func (m MockTokenGenerator) GenerateNonce() string {
	return m.Nonce
}

func (m MockTokenGenerator) SignMessage(message string) (string, error) {
	return m.Signature, nil
}

func (m MockTokenGenerator) VerifyMessage(base64Signature string, message string) bool {
	return m.VerifyResult
}

type ServerChannels struct {
	peerConnect    <-chan interface{}
	peerDisconnect <-chan interface{}
	iceCandidate   <-chan webrtc.ICECandidateInit
	offer          <-chan webrtc.SessionDescription
	answer         <-chan webrtc.SessionDescription
	err            <-chan error
}

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

func createSignallingServer(tokenGenerator pairing.TokenGenerator, actions func(conn *websocket.Conn)) (*SignallingServer, *ServerChannels) {
	server := createWebsocketServer(actions)
	// SignallingServer requires a "ws://" URL rather than "http://"
	url := strings.Replace(server.URL, "http", "ws", 1)

	signallingServer := NewSignallingServer(url, tokenGenerator)

	peerConnect := make(chan interface{})
	peerDisconnect := make(chan interface{})
	iceCandidate := make(chan webrtc.ICECandidateInit)
	offer := make(chan webrtc.SessionDescription)
	answer := make(chan webrtc.SessionDescription)
	err := make(chan error)

	signallingServer.OnPeerConnect(func() {
		peerConnect <- nil
	})
	signallingServer.OnPeerDisconnect(func() {
		peerDisconnect <- nil
	})
	signallingServer.OnIceCandidate(func(c webrtc.ICECandidateInit) {
		iceCandidate <- c
	})
	signallingServer.OnOffer(func(o webrtc.SessionDescription) {
		offer <- o
	})
	signallingServer.OnAnswer(func(a webrtc.SessionDescription) {
		answer <- a
	})
	signallingServer.OnError(func(e error) {
		err <- e
	})

	channels := ServerChannels{
		peerConnect,
		peerDisconnect,
		iceCandidate,
		offer,
		answer,
		err,
	}

	return &signallingServer, &channels
}
