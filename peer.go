package thingrtc

import (
	"errors"

	"github.com/pion/webrtc/v3"

	"github.com/thingify-app/thing-rtc-go/codec"
)

// Peer represents a connection (attempted or actual) to a ThingRTC peer.
type Peer interface {
	Connect(tokenGenerator TokenGenerator) error
	Disconnect()

	OnConnectionStateChange(f func(connectionState int))
	OnStringMessage(f func(message string))
	OnBinaryMessage(f func(message []byte))
	OnError(f func(err error))

	SendStringMessage(message string)
	SendBinaryMessage(message []byte)
}

func NewPeer(serverUrl string, codec *codec.Codec, sources ...MediaSource) Peer {
	// Initialise listeners as empty functions to allow them to be optional.
	return &peerImpl{
		serverUrl: serverUrl,
		codec:     codec,
		sources:   sources,

		connectionStateListener: func(connectionState int) {},
		stringMessageListener:   func(message string) {},
		binaryMessageListener:   func(message []byte) {},
		errorListener:           func(err error) {},
	}
}

type peerImpl struct {
	serverUrl string
	codec     *codec.Codec
	sources   []MediaSource

	server         *SignallingServer
	peerConnection *webrtc.PeerConnection
	dataChannel    *webrtc.DataChannel

	connectionStateListener func(connectionState int)
	stringMessageListener   func(message string)
	binaryMessageListener   func(message []byte)
	errorListener           func(err error)
}

// Connection state.
const (
	Disconnected = iota
	Connecting
	Connected
)

func (p *peerImpl) Connect(tokenGenerator TokenGenerator) error {
	role := tokenGenerator.GetRole()
	server := SignallingServer{
		URL:            p.serverUrl,
		TokenGenerator: tokenGenerator,
	}
	peerConnection, err := createPeerConnection(*p.codec)
	if err != nil {
		return err
	}

	p.peerConnection = peerConnection
	p.server = &server

	p.setupCommon()

	switch role {
	case "initiator":
		p.setupInitiator()
	case "responder":
		p.setupResponder()
	default:
		return errors.New("Invalid role provided.")
	}

	server.Connect()

	return nil
}

func (p *peerImpl) OnConnectionStateChange(f func(connectionState int)) {
	p.connectionStateListener = f
}

func (p *peerImpl) OnStringMessage(f func(message string)) {
	p.stringMessageListener = f
}

func (p *peerImpl) OnBinaryMessage(f func(message []byte)) {
	p.binaryMessageListener = f
}

func (p *peerImpl) OnError(f func(err error)) {
	p.errorListener = f
}

func (p *peerImpl) SendStringMessage(message string) {
	p.dataChannel.SendText(message)
}

func (p *peerImpl) SendBinaryMessage(message []byte) {
	p.dataChannel.Send(message)
}

func (p *peerImpl) Disconnect() {
	p.server.Disconnect()
	p.connectionStateListener(Disconnected)
}

func createPeerConnection(codec codec.Codec) (*webrtc.PeerConnection, error) {
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

func (p *peerImpl) setupCommon() {
	p.peerConnection.OnConnectionStateChange(func(state webrtc.PeerConnectionState) {
		if state == webrtc.PeerConnectionStateConnected {
			p.connectionStateListener(Connected)
			p.server.Disconnect()
		} else if state == webrtc.PeerConnectionStateClosed || state == webrtc.PeerConnectionStateFailed {
			p.Disconnect()
			p.server.Connect()
		}
	})

	p.peerConnection.OnICECandidate(func(candidate *webrtc.ICECandidate) {
		if candidate != nil {
			p.server.SendIceCandidate(candidate.ToJSON())
		}
	})

	p.server.OnIceCandidate(func(candidate webrtc.ICECandidateInit) {
		p.peerConnection.AddICECandidate(candidate)
	})

	p.server.OnPeerDisconnect(func() {})

	for _, source := range p.sources {
		mediaStream, err := source.mediaStream(p.codec.CodecSelector)
		if err != nil {
			panic(err)
		}
		for _, track := range mediaStream.GetTracks() {
			p.peerConnection.AddTrack(track)
		}
	}
}

func (p *peerImpl) setupInitiator() {
	p.server.OnPeerConnect(func() {
		p.handlePeerConnect()

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
		dataChannel.OnMessage(p.handleDataChannelMessage)
	}
}

func (p *peerImpl) setupResponder() {
	p.server.OnPeerConnect(func() {
		p.handlePeerConnect()
	})

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

func (p *peerImpl) handlePeerConnect() {
	p.connectionStateListener(Connecting)
}

func (p *peerImpl) handleDataChannelMessage(msg webrtc.DataChannelMessage) {
	if msg.IsString {
		p.stringMessageListener(string(msg.Data))
	} else {
		p.binaryMessageListener(msg.Data)
	}
}
