package thingrtc

import (
	"errors"
	"fmt"
	"time"

	"github.com/pion/webrtc/v3"

	"github.com/thingify-app/thing-rtc-go/codec"
)

type peerTask struct {
	serverUrl string
	codecs    []*codec.Codec
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
	peerConnection, err := createPeerConnection(p.codecs)
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
			fmt.Printf("Peer connected.\n")
			peerConnectionSuccess <- nil
		} else if state == webrtc.PeerConnectionStateClosed || state == webrtc.PeerConnectionStateFailed {
			fmt.Printf("Peer failed.\n")
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
		// Only disconnect from the server if the peer failed (don't try to disconnect the peer).
		server.Disconnect()
		p.server = nil
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
	fmt.Printf("peerTask disconnecting...\n")
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

func createPeerConnection(codecs []*codec.Codec) (*webrtc.PeerConnection, error) {
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

	settingEngine := webrtc.SettingEngine{}
	settingEngine.SetICETimeouts(5*time.Second, 5*time.Second, 2*time.Second)

	mediaEngine := webrtc.MediaEngine{}
	// Need to register defaults in case we have no codecs specified (i.e. we
	// are using RTSP where the encoder is remote).
	err := mediaEngine.RegisterDefaultCodecs()
	if err != nil {
		return nil, err
	}
	for _, codec := range codecs {
		codec.CodecSelector.Populate(&mediaEngine)
	}

	api := webrtc.NewAPI(
		webrtc.WithMediaEngine(&mediaEngine),
		webrtc.WithSettingEngine(settingEngine),
	)
	return api.NewPeerConnection(config)
}

func (p *peerTask) setupListeners(role string) error {
	err := p.setupCommon()
	if err != nil {
		return err
	}

	switch role {
	case "initiator":
		p.setupInitiator()
	case "responder":
		p.setupResponder()
	default:
		return errors.New("invalid role provided")
	}

	return nil
}

func (p *peerTask) setupCommon() error {
	p.peerConnection.OnICECandidate(func(candidate *webrtc.ICECandidate) {
		if candidate != nil && p.server != nil {
			p.server.SendIceCandidate(candidate.ToJSON())
		}
	})

	p.server.OnIceCandidate(func(candidate webrtc.ICECandidateInit) {
		err := p.peerConnection.AddICECandidate(candidate)
		if err != nil {
			p.errorListener(err)
		}
	})

	p.server.OnPeerDisconnect(func() {})

	for _, track := range p.tracks {
		_, err := p.peerConnection.AddTrack(track)
		if err != nil {
			return err
		}
	}
	return nil
}

func (p *peerTask) setupInitiator() {
	p.server.OnPeerConnect(func() {
		if len(p.tracks) > 0 {
			p.peerConnection.AddTransceiverFromKind(webrtc.RTPCodecTypeVideo)
		}

		offer, err := p.peerConnection.CreateOffer(nil)
		if err != nil {
			p.errorListener(err)
			return
		}
		err = p.peerConnection.SetLocalDescription(offer)
		if err != nil {
			p.errorListener(err)
			return
		}
		p.server.SendOffer(offer)
	})

	p.server.OnAnswer(func(answer webrtc.SessionDescription) {
		err := p.peerConnection.SetRemoteDescription(answer)
		if err != nil {
			p.errorListener(err)
		}
	})

	dataChannel, err := p.peerConnection.CreateDataChannel("dataChannel", nil)
	if err != nil {
		p.errorListener(err)
		return
	}

	p.dataChannel = dataChannel
	dataChannel.OnMessage(p.handleDataChannelMessage)
}

func (p *peerTask) setupResponder() {
	p.server.OnOffer(func(offer webrtc.SessionDescription) {
		err := p.peerConnection.SetRemoteDescription(offer)
		if err != nil {
			p.errorListener(err)
			return
		}

		answer, err := p.peerConnection.CreateAnswer(nil)
		if err != nil {
			p.errorListener(err)
			return
		}
		err = p.peerConnection.SetLocalDescription(answer)
		if err != nil {
			p.errorListener(err)
			return
		}
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
