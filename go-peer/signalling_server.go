package thingrtc

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"

	"github.com/gorilla/websocket"
	"github.com/pion/webrtc/v3"
	"github.com/thingify-app/thing-rtc-go/pairing"
)

// SignallingServer handles signalling communications to establish a connection
// between peers.
// It is conceptually simple in that it can connect to a server (handling auth
// messages etc), send and receive messages, and disconnect from a server.
// If there are any failures in the connection or processing of messages, it
// will report these and return to a disconnected state.
type SignallingServer struct {
	URL            string
	TokenGenerator pairing.TokenGenerator

	socket      *websocket.Conn
	connected   bool
	remoteNonce string

	sendChan chan interface{}

	peerConnectListener    func()
	iceCandidateListener   func(candidate webrtc.ICECandidateInit)
	offerListener          func(offer webrtc.SessionDescription)
	answerListener         func(answer webrtc.SessionDescription)
	peerDisconnectListener func()
	errorListener          func(err error)
}

func NewSignallingServer(serverUrl string, tokenGenerator pairing.TokenGenerator) SignallingServer {
	return SignallingServer{
		URL:            serverUrl,
		TokenGenerator: tokenGenerator,

		sendChan: make(chan interface{}),

		// Initialise listeners as empty functions to allow them to be optional.
		peerConnectListener:    func() {},
		iceCandidateListener:   func(candidate webrtc.ICECandidateInit) {},
		offerListener:          func(offer webrtc.SessionDescription) {},
		answerListener:         func(answer webrtc.SessionDescription) {},
		peerDisconnectListener: func() {},
		errorListener:          func(err error) {},
	}
}

type signedMessage struct {
	Type      string `json:"type"`
	Signature string `json:"signature"`
	Data      string `json:"data"`
	Nonce     string `json:"nonce"` // only present in peerConnect message
}

// Attempt to connect with a signalling server and exchange peer details.
func (s *SignallingServer) Connect() {
	s.connected = true

	go func() {
		socket, _, err := websocket.DefaultDialer.Dial(s.URL, http.Header{})
		s.socket = socket
		if err != nil {
			s.errorListener(err)
			return
		}

		s.startSendLoop()

		localNonce := s.TokenGenerator.GenerateNonce()
		token := s.TokenGenerator.GenerateToken()
		err = s.sendAuthMessage(localNonce, token)
		if err != nil {
			s.errorListener(err)
			return
		}

		for s.connected {
			message := signedMessage{}
			err := s.socket.ReadJSON(&message)
			if err != nil {
				s.errorListener(err)
				break
			}
			err = s.handleMessage(localNonce, message)
			if err != nil {
				s.errorListener(err)
				break
			}
		}
	}()
}

func (s *SignallingServer) SendIceCandidate(candidate webrtc.ICECandidateInit) {
	s.sendSignedMessage("iceCandidate", candidate)
}

func (s *SignallingServer) SendOffer(offer webrtc.SessionDescription) {
	s.sendSignedMessage("offer", offer)
}

func (s *SignallingServer) SendAnswer(answer webrtc.SessionDescription) {
	s.sendSignedMessage("answer", answer)
}

func (s *SignallingServer) OnPeerConnect(f func()) {
	s.peerConnectListener = f
}

func (s *SignallingServer) OnIceCandidate(f func(candidate webrtc.ICECandidateInit)) {
	s.iceCandidateListener = f
}

func (s *SignallingServer) OnOffer(f func(offer webrtc.SessionDescription)) {
	s.offerListener = f
}

func (s *SignallingServer) OnAnswer(f func(answer webrtc.SessionDescription)) {
	s.answerListener = f
}

func (s *SignallingServer) OnPeerDisconnect(f func()) {
	s.peerDisconnectListener = f
}

func (s *SignallingServer) OnError(f func(err error)) {
	s.errorListener = f
}

func (s *SignallingServer) Disconnect() {
	s.connected = false
	s.socket.Close()
	s.socket = nil
}

func (s *SignallingServer) sendAuthMessage(localNonce string, token string) error {
	if !s.connected {
		return errors.New("not connected - cannot send message")
	}

	authData := struct {
		Nonce string `json:"nonce"`
		Token string `json:"token"`
	}{
		Nonce: localNonce,
		Token: token,
	}

	jsonBytes, err := json.Marshal(authData)
	if err != nil {
		return err
	}
	jsonData := string(jsonBytes)

	authMessage := struct {
		Type string `json:"type"`
		Data string `json:"data"`
	}{
		Type: "auth",
		Data: jsonData,
	}

	s.sendChan <- authMessage

	return nil
}

func (s *SignallingServer) sendSignedMessage(msgType string, data interface{}) error {
	if !s.connected {
		return errors.New("not connected - cannot send message")
	}

	// Add the nonce field to whatever data we have.
	dataWithNonce, err := addField(data, "nonce", s.remoteNonce)
	if err != nil {
		return err
	}

	jsonBytes, err := json.Marshal(dataWithNonce)
	if err != nil {
		return err
	}

	jsonData := string(jsonBytes)

	signature, err := s.TokenGenerator.SignMessage(jsonData)
	if err != nil {
		return err
	}

	message := signedMessage{
		Type:      msgType,
		Signature: signature,
		Data:      jsonData,
	}

	s.sendChan <- message

	return nil
}

// Avoids concurrent writes to the socket by queueing them up with a channel.
func (s *SignallingServer) startSendLoop() {
	go func() {
		for s.connected {
			message := <-s.sendChan
			fmt.Printf("Sending message: %v\n", message)
			err := s.socket.WriteJSON(message)
			if err != nil {
				fmt.Printf("Error sending message: %v\n", err)
			}
		}
	}()
}

func (s *SignallingServer) handleMessage(localNonce string, message signedMessage) error {
	fmt.Printf("Message received: %v\n", message)
	if message.Type == "peerConnect" {
		// Extract the desired nonce from our peer.
		nonce := message.Nonce
		if nonce == "" {
			return errors.New("empty nonce received")
		}
		s.remoteNonce = nonce
		s.peerConnectListener()
	} else if message.Type == "peerDisconnect" {
		// No nonce on peerDisconnect.
		s.peerDisconnectListener()
	} else {
		// All other messages require a valid nonce and signature.
		err := s.verifyMessage(localNonce, message)
		if err != nil {
			return err
		}

		switch message.Type {
		case "iceCandidate":
			iceCandidate := webrtc.ICECandidateInit{}
			err := json.Unmarshal([]byte(message.Data), &iceCandidate)
			if err != nil {
				return err
			}
			s.iceCandidateListener(iceCandidate)
		case "offer":
			offer := webrtc.SessionDescription{}
			err := json.Unmarshal([]byte(message.Data), &offer)
			if err != nil {
				return err
			}
			s.offerListener(offer)
		case "answer":
			answer := webrtc.SessionDescription{}
			err := json.Unmarshal([]byte(message.Data), &answer)
			if err != nil {
				return err
			}
			s.answerListener(answer)
		}
	}

	return nil
}

// Returns an error if the message is invalid, otherwise nil.
func (s *SignallingServer) verifyMessage(localNonce string, message signedMessage) error {
	nonceData := struct {
		Nonce string `json:"nonce"`
	}{}
	err := json.Unmarshal([]byte(message.Data), &nonceData)
	if err != nil {
		return err
	}

	validNonce := localNonce != "" && nonceData.Nonce == localNonce
	if !validNonce {
		return fmt.Errorf("invalid nonce received: '%v', expected: '%v'", nonceData.Nonce, localNonce)
	}

	validSignature := s.TokenGenerator.VerifyMessage(message.Signature, message.Data)
	if !validSignature {
		return fmt.Errorf("invalid signature '%v' on message: '%v'", message.Signature, message.Data)
	}

	return nil
}

// Adds a field to the given object and returns it as a key-value map.
func addField(data interface{}, key string, value interface{}) (map[string]interface{}, error) {
	jsonBytes, err := json.Marshal(data)
	if err != nil {
		return nil, err
	}

	// Parse marshalled JSON back into a map, so we can add our field.
	parsed := make(map[string]interface{})
	err = json.Unmarshal(jsonBytes, &parsed)
	if err != nil {
		return nil, err
	}

	parsed[key] = value

	return parsed, nil
}
