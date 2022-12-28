package thingrtc

import (
	"errors"
	"fmt"

	"github.com/pion/webrtc/v3"

	"github.com/thingify-app/thing-rtc-go/codec"
)

type peerTask struct {
	serverUrl string
	codec     *codec.Codec
	tracks    []webrtc.TrackLocal

	server         *SignallingServer
	peerConnection *webrtc.PeerConnection
	dataChannel    *webrtc.DataChannel

	connectionStateListener func(connectionState int)
	stringMessageListener   func(message string)
	binaryMessageListener   func(message []byte)
	errorListener           func(err error)
}

// Attempts to connect to a peer once, and blocks until the connection fails for any reason.
// Must not be called again on the same instance.
func (p *peerTask) AttemptConnect(tokenGenerator TokenGenerator) error {
	serverFailed := make(chan interface{})
	peerConnectionFailed := make(chan interface{})
	peerConnectionSuccess := make(chan interface{})

	server := NewSignallingServer(p.serverUrl, tokenGenerator)
	peerConnection, err := createPeerConnection(p.codec)
	if err != nil {
		return err
	}

	p.server = &server
	p.peerConnection = peerConnection

	server.OnError(func(err error) {
		fmt.Printf("Server error: %v\n", err)
		serverFailed <- nil
	})

	peerConnection.OnConnectionStateChange(func(state webrtc.PeerConnectionState) {
		if state == webrtc.PeerConnectionStateConnected {
			peerConnectionSuccess <- nil
		} else if state == webrtc.PeerConnectionStateClosed || state == webrtc.PeerConnectionStateFailed {
			peerConnectionFailed <- nil
		}
	})

	err = p.setupListeners(tokenGenerator.GetRole())
	if err != nil {
		return err
	}

	p.connectionStateListener(Connecting)

	server.Connect()

	// Block until the connection fails for any reason.
	select {
	case <-peerConnectionSuccess:
		// After the peer connection is established, disconnect from the signalling server.
		server.Disconnect()
		p.server = nil
		p.connectionStateListener(Connected)
		// Now block until the peer connection fails.
		<-peerConnectionFailed
	case <-serverFailed:
		p.Disconnect()
	case <-peerConnectionFailed:
		p.Disconnect()
	}

	p.connectionStateListener(Disconnected)

	return nil
}

func (p *peerTask) SendStringMessage(message string) {
	if p.dataChannel != nil {
		p.dataChannel.SendText(message)
	}
}

func (p *peerTask) SendBinaryMessage(message []byte) {
	if p.dataChannel != nil {
		p.dataChannel.Send(message)
	}
}

func (p *peerTask) Disconnect() {
	if p.server != nil {
		p.server.Disconnect()
	}
	if p.peerConnection != nil {
		p.peerConnection.Close()
	}
	p.server = nil
	p.peerConnection = nil
	p.dataChannel = nil
}

func createPeerConnection(codec *codec.Codec) (*webrtc.PeerConnection, error) {
	config := webrtc.Configuration{
		ICEServers: []webrtc.ICEServer{
			{
				URLs: []string{
					"stun:stun1.l.google.com:19302",
					"stun:stun2.l.google.com:19302",
				},
			},
		},
	}

	mediaEngine := webrtc.MediaEngine{}
	codec.CodecSelector.Populate(&mediaEngine)
	api := webrtc.NewAPI(webrtc.WithMediaEngine(&mediaEngine))
	return api.NewPeerConnection(config)
}

func (p *peerTask) setupListeners(role string) error {
	p.setupCommon()

	switch role {
	case "initiator":
		p.setupInitiator()
	case "responder":
		p.setupResponder()
	default:
		return errors.New("Invalid role provided.")
	}

	return nil
}

func (p *peerTask) setupCommon() {
	p.peerConnection.OnICECandidate(func(candidate *webrtc.ICECandidate) {
		if candidate != nil {
			p.server.SendIceCandidate(candidate.ToJSON())
		}
	})

	p.server.OnIceCandidate(func(candidate webrtc.ICECandidateInit) {
		p.peerConnection.AddICECandidate(candidate)
	})

	p.server.OnPeerDisconnect(func() {})

	for _, track := range p.tracks {
		p.peerConnection.AddTrack(track)
	}
}

func (p *peerTask) setupInitiator() {
	p.server.OnPeerConnect(func() {
		p.peerConnection.AddTransceiverFromKind(webrtc.RTPCodecTypeVideo)
		offer, err := p.peerConnection.CreateOffer(nil)
		if err != nil {

		}
		p.peerConnection.SetLocalDescription(offer)
		p.server.SendOffer(offer)
	})

	p.server.OnAnswer(func(answer webrtc.SessionDescription) {
		p.peerConnection.SetRemoteDescription(answer)
	})

	dataChannel, err := p.peerConnection.CreateDataChannel("dataChannel", nil)
	if err == nil {
		p.dataChannel = dataChannel
		dataChannel.OnMessage(p.handleDataChannelMessage)
	}
}

func (p *peerTask) setupResponder() {
	p.server.OnOffer(func(offer webrtc.SessionDescription) {
		p.peerConnection.SetRemoteDescription(offer)

		answer, err := p.peerConnection.CreateAnswer(nil)
		if err != nil {
		}
		p.peerConnection.SetLocalDescription(answer)
		p.server.SendAnswer(answer)
	})

	p.peerConnection.OnDataChannel(func(dc *webrtc.DataChannel) {
		p.dataChannel = dc
		dc.OnMessage(p.handleDataChannelMessage)
	})
}

func (p *peerTask) handleDataChannelMessage(msg webrtc.DataChannelMessage) {
	if msg.IsString {
		p.stringMessageListener(string(msg.Data))
	} else {
		p.binaryMessageListener(msg.Data)
	}
}
