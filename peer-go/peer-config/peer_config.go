package peerconfig

type Role string

const (
	Initiator Role = "initiator"
	Responder Role = "responder"
)

type PeerConfig struct {
	PeerAuth  PeerAuth
	PairingId string
	Role      Role
}
