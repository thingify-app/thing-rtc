package thingrtc

import (
	"fmt"
	"time"

	"github.com/pion/webrtc/v3"
	"github.com/thingify-app/thing-rtc/peer-go/codec"
	peerconfig "github.com/thingify-app/thing-rtc/peer-go/peer-config"
)

// Peer represents a connection (attempted or actual) to a ThingRTC peer.
type Peer interface {
	Connect()
	CreateDataChannel(label string, reliable bool) (DataChannel, error)
	Disconnect()

	OnConnectionStateChange(f func(connectionState int))
	OnDataChannel(f func(dataChannel DataChannel))
	OnError(f func(err error))
}

func NewPeer(serverUrl string, serverAuth ServerAuth, peerConfig *peerconfig.PeerConfig, detachDataChannels bool) Peer {
	return NewPeerWithMedia(serverUrl, serverAuth, peerConfig, detachDataChannels)
}

func NewPeerWithMedia(serverUrl string, serverAuth ServerAuth, peerConfig *peerconfig.PeerConfig, detachDataChannels bool, sources ...*MediaSource) Peer {
	// Only map sources to tracks once at initialisation - otherwise we break Pion driver state.
	codecs, tracks := sourcesToCodecsTracks(sources)
	return &peerImpl{
		serverUrl:          serverUrl,
		serverAuth:         serverAuth,
		peerConfig:         peerConfig,
		detachDataChannels: detachDataChannels,
		codecs:             codecs,
		tracks:             tracks,

		// Initialise listeners as empty functions to allow them to be optional.
		connectionStateListener: func(connectionState int) {},
		dataChannelListener:     func(dataChannel DataChannel) {},
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
	serverUrl          string
	serverAuth         ServerAuth
	peerConfig         *peerconfig.PeerConfig
	detachDataChannels bool
	codecs             []*codec.Codec
	tracks             []webrtc.TrackLocal

	peerTask  *peerTask
	connected bool

	connectionStateListener func(connectionState int)
	dataChannelListener     func(dataChannel DataChannel)
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
					dataChannelListener:     func(dataChannel DataChannel) { go p.dataChannelListener(dataChannel) },
					errorListener:           func(err error) { go p.errorListener(err) },
				}
				err := p.peerTask.AttemptConnect(p.serverAuth, p.peerConfig, p.detachDataChannels)
				if err != nil {
					p.errorListener(err)
				}
				time.Sleep(time.Second)
			}
		}()
	}
}

func (p *peerImpl) CreateDataChannel(label string, reliable bool) (DataChannel, error) {
	return p.peerTask.CreateDataChannel(label, reliable)
}

func (p *peerImpl) OnConnectionStateChange(f func(connectionState int)) {
	p.connectionStateListener = f
}

func (p *peerImpl) OnDataChannel(f func(dataChannel DataChannel)) {
	p.dataChannelListener = f
}

func (p *peerImpl) OnError(f func(err error)) {
	p.errorListener = f
}

func (p *peerImpl) Disconnect() {
	p.connected = false
	if p.peerTask != nil {
		p.peerTask.Disconnect()
	}
}
