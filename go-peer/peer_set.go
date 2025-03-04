package thingrtc

import "github.com/thingify-app/thing-rtc-go/pairing"

type PeerSet struct {
	peers []*Peer
}

func NewPeerSet(serverUrl string, pairing pairing.Pairing, mediaSources ...*MediaSource) (*PeerSet, error) {
	peerSet := PeerSet{make([]*Peer, 0)}
	pairingIds := pairing.GetAllPairingIds()
	for _, id := range pairingIds {
		tokenGenerator, err := pairing.GetTokenGenerator(id)
		if err != nil {
			return nil, err
		}
		peer := NewPeerWithMedia(serverUrl, tokenGenerator, mediaSources...)
		peerSet.peers = append(peerSet.peers, &peer)
	}
	return &peerSet, nil
}

func (p *PeerSet) Connect() {
	for _, peer := range p.peers {
		(*peer).Connect()
	}
}

func (p *PeerSet) Disconnect() {
	for _, peer := range p.peers {
		(*peer).Disconnect()
	}
}
