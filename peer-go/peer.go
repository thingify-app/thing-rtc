package thingrtc

import (
	"fmt"
	"time"

	"github.com/pion/webrtc/v3"
	"github.com/thingify-app/thing-rtc/peer-go/codec"
	"github.com/thingify-app/thing-rtc/peer-go/pairing"
)

// Peer represents a connection (attempted or actual) to a ThingRTC peer.
type Peer interface {
	Connect()
	Disconnect()

	OnConnectionStateChange(f func(connectionState int))
	OnStringMessage(f func(message string))
	OnBinaryMessage(f func(message []byte))
	OnError(f func(err error))

	SendStringMessage(message string)
	SendBinaryMessage(message []byte)
}

func NewPeer(serverUrl string, tokenGenerator pairing.TokenGenerator) Peer {
	return NewPeerWithMedia(serverUrl, tokenGenerator)
}

func NewPeerWithMedia(serverUrl string, tokenGenerator pairing.TokenGenerator, sources ...*MediaSource) Peer {
	// Only map sources to tracks once at initialisation - otherwise we break Pion driver state.
	codecs, tracks := sourcesToCodecsTracks(sources)
	return &peerImpl{
		serverUrl:      serverUrl,
		tokenGenerator: tokenGenerator,
		codecs:         codecs,
		tracks:         tracks,

		// Initialise listeners as empty functions to allow them to be optional.
		connectionStateListener: func(connectionState int) {},
		stringMessageListener:   func(message string) {},
		binaryMessageListener:   func(message []byte) {},
		errorListener:           func(err error) {},
	}
}

func sourcesToCodecsTracks(sources []*MediaSource) ([]*codec.Codec, []webrtc.TrackLocal) {
	var codecs []*codec.Codec
	var tracks []webrtc.TrackLocal

	for _, source := range sources {
		tracks = append(tracks, source.tracks...)

		if source.codec != nil {
			codecs = append(codecs, source.codec)
		}
	}
	return codecs, tracks
}

type peerImpl struct {
	serverUrl      string
	tokenGenerator pairing.TokenGenerator
	codecs         []*codec.Codec
	tracks         []webrtc.TrackLocal

	peerTask  *peerTask
	connected bool

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

func (p *peerImpl) Connect() {
	// No-op if we're already connecting/connected.
	if !p.connected {
		p.connected = true
		attempts := 0
		go func() {
			// Keep attempting to connect forever until connected is false.
			for p.connected {
				fmt.Printf("Attempting to connect (attempt %v)...\n", attempts)
				attempts++
				p.peerTask = &peerTask{
					serverUrl: p.serverUrl,
					codecs:    p.codecs,
					tracks:    p.tracks,
					// Wrap listeners so they can be dynamically updated, and run them in goroutines in case they block.
					connectionStateListener: func(connectionState int) { go p.connectionStateListener(connectionState) },
					stringMessageListener:   func(message string) { go p.stringMessageListener(message) },
					binaryMessageListener:   func(message []byte) { go p.binaryMessageListener(message) },
					errorListener:           func(err error) { go p.errorListener(err) },
				}
				err := p.peerTask.AttemptConnect(p.tokenGenerator)
				if err != nil {
					p.errorListener(err)
				}
				time.Sleep(time.Second)
			}
		}()
	}
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
	p.peerTask.SendStringMessage(message)
}

func (p *peerImpl) SendBinaryMessage(message []byte) {
	p.peerTask.SendBinaryMessage(message)
}

func (p *peerImpl) Disconnect() {
	p.connected = false
	if p.peerTask != nil {
		p.peerTask.Disconnect()
	}
}
