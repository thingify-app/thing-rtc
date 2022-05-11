package thingrtc

import (
	"encoding/json"
	"fmt"
	"net/http"
	"reflect"
	"time"

	"github.com/gorilla/websocket"
	"github.com/pion/webrtc/v3"
)

// SignallingServer handles signalling communications to establish a connection between peers.
type SignallingServer struct {
	URL            string
	TokenGenerator TokenGenerator

	socket    *websocket.Conn
	connected bool

	peerConnectListener    func()
	iceCandidateListener   func(candidate webrtc.ICECandidateInit)
	offerListener          func(offer webrtc.SessionDescription)
	answerListener         func(answer webrtc.SessionDescription)
	peerDisconnectListener func()
}

type serverMessage struct {
	Type string `json:"type"`
	Data string `json:"data"`
}

func (s *SignallingServer) Connect() {
	s.connected = true

	go func() {
		// This function blocks for as long as the websocket connection remains
		// active, so just retry if anything makes it quit.
		defer s.retryConnect()

		socket, _, err := websocket.DefaultDialer.Dial(s.URL, http.Header{})
		s.socket = socket
		if err != nil {
			return
		}

		token := s.TokenGenerator.GenerateToken()
		s.sendMessage("auth", token)

		for s.connected {
			message := serverMessage{}
			err := s.socket.ReadJSON(&message)
			if err != nil {
				break
			}
			s.handleMessage(message)
		}
	}()
}

func (s *SignallingServer) retryConnect() {
	if s.connected {
		time.AfterFunc(time.Second, s.Connect)
	}
}

func (s *SignallingServer) SendIceCandidate(candidate webrtc.ICECandidateInit) {
	s.sendMessage("iceCandidate", candidate)
}

func (s *SignallingServer) SendOffer(offer webrtc.SessionDescription) {
	s.sendMessage("offer", offer)
}

func (s *SignallingServer) SendAnswer(answer webrtc.SessionDescription) {
	s.sendMessage("answer", answer)
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

func (s *SignallingServer) Disconnect() {
	s.connected = false
	s.socket.Close()
	s.socket = nil
}

func (s *SignallingServer) sendMessage(msgType string, data interface{}) {
	if !s.connected {
		return
	}

	// If data is a string, put it in the JSON message verbatim.
	// If it is anything else, JSON encode it first and put it in a string.
	var jsonData string
	if reflect.TypeOf(data).Kind() == reflect.String {
		jsonData = data.(string)
	} else {
		jsonBytes, _ := json.Marshal(data)
		jsonData = string(jsonBytes)
	}

	message := serverMessage{
		Type: msgType,
		Data: jsonData,
	}
	err := s.socket.WriteJSON(message)
	if err != nil {
		fmt.Printf("Error: %v\n", err)
	}
}

func (s *SignallingServer) handleMessage(message serverMessage) {
	switch message.Type {
	case "peerConnect":
		s.peerConnectListener()
	case "iceCandidate":
		iceCandidate := webrtc.ICECandidateInit{}
		json.Unmarshal([]byte(message.Data), &iceCandidate)
		s.iceCandidateListener(iceCandidate)
	case "offer":
		offer := webrtc.SessionDescription{}
		json.Unmarshal([]byte(message.Data), &offer)
		s.offerListener(offer)
	case "answer":
		answer := webrtc.SessionDescription{}
		json.Unmarshal([]byte(message.Data), &answer)
		s.answerListener(answer)
	case "peerDisconnect":
		s.peerDisconnectListener()
	}
}
