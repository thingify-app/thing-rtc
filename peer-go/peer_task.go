package thingrtc

import (
	"errors"
	"fmt"
	"time"

	"github.com/pion/webrtc/v3"

	"github.com/thingify-app/thing-rtc/peer-go/codec"
	peerconfig "github.com/thingify-app/thing-rtc/peer-go/peer-config"
)

const DEFAULT_DATA_CHANNEL_NAME = "default"

type peerTask struct {
	serverUrl string
	codecs    []*codec.Codec
	tracks    []webrtc.TrackLocal

	server         *SignallingServer
	peerConnection *webrtc.PeerConnection
	dataChannels   []DataChannel

	connectionStateListener func(connectionState int)
	dataChannelListener     func(dataChannel DataChannel)
	errorListener           func(err error)
}

// Attempts to connect to a peer once, and blocks until the connection fails for any reason.
// Must not be called again on the same instance.
func (p *peerTask) AttemptConnect(serverAuth ServerAuth, peerConfig *peerconfig.PeerConfig, detachDataChannels bool) error {
	serverFailed := make(chan interface{})
	peerConnectionFailed := make(chan interface{})
	peerConnectionSuccess := make(chan interface{})

	server := NewSignallingServer(p.serverUrl, serverAuth, peerConfig.PeerAuth)
	peerConnection, err := createPeerConnection(p.codecs, detachDataChannels)
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

	err = p.setupListeners(string(peerConfig.Role))
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

func (p *peerTask) CreateDataChannel(label string, reliable bool) (DataChannel, error) {
	channelConfig := webrtc.DataChannelInit{}
	if reliable {
		ordered := true
		channelConfig.Ordered = &ordered
	} else {
		ordered := false
		maxRetransmits := uint16(0)
		channelConfig.Ordered = &ordered
		channelConfig.MaxRetransmits = &maxRetransmits
	}

	dataChannel, err := p.peerConnection.CreateDataChannel(label, &channelConfig)
	if err != nil {
		return nil, err
	}

	wrapped := createDataChannelWrapper(dataChannel)
	p.dataChannels = append(p.dataChannels, wrapped)
	p.dataChannelListener(wrapped)

	return wrapped, nil
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
	p.dataChannels = nil
}

func createPeerConnection(codecs []*codec.Codec, detachDataChannels bool) (*webrtc.PeerConnection, error) {
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

	if detachDataChannels {
		// Required to allow us to "detach" a ReadWriteCloser from data channels.
		settingEngine.DetachDataChannels()
	}

	mediaEngine := webrtc.MediaEngine{}

	if len(codecs) == 0 {
		// Need to register defaults if we have no codecs specified (i.e. we are
		// using RTSP where the encoder is remote).
		err := mediaEngine.RegisterDefaultCodecs()
		if err != nil {
			return nil, err
		}
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
		return p.setupInitiator()
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

	p.peerConnection.OnDataChannel(func(dc *webrtc.DataChannel) {
		// Do not expose the default data channel to users.
		if dc.Label() != DEFAULT_DATA_CHANNEL_NAME {
			wrapped := createDataChannelWrapper(dc)
			p.dataChannels = append(p.dataChannels, wrapped)
			p.dataChannelListener(wrapped)
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

func (p *peerTask) setupInitiator() error {
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

	_, err := p.peerConnection.CreateDataChannel(DEFAULT_DATA_CHANNEL_NAME, nil)
	if err != nil {
		return err
	}

	return nil
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
}
