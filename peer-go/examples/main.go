package main

import (
	"encoding/base64"
	"fmt"
	"os"
	"time"

	"github.com/urfave/cli/v2"

	thingrtc "github.com/thingify-app/thing-rtc/peer-go"
	"github.com/thingify-app/thing-rtc/peer-go/codec/x264"
	peerconfig "github.com/thingify-app/thing-rtc/peer-go/peer-config"

	_ "github.com/pion/mediadevices/pkg/driver/videotest"
	// Uncomment below and comment above to use the camera.
	// _ "github.com/thingify-app/thing-rtc/peer-go/driver/camera"
)

const SIGNALLING_SERVER_URL = "wss://signalling.thingify.app/signalling"

func main() {
	app := &cli.App{
		Name:  "thingrtc",
		Usage: "Explore thingrtc",
		Commands: []*cli.Command{
			{
				Name:  "connect",
				Usage: "Connect to a peer",
				Flags: []cli.Flag{
					&cli.StringFlag{
						Name:  "secret",
						Usage: "shared secret of the peer to connect to",
					},
					&cli.StringFlag{
						Name:  "peerPublicKey",
						Usage: "public key of the peer to connect to",
					},
					&cli.StringFlag{
						Name:  "role",
						Usage: "role to assume (either initiator or responder)",

						Required: true,
					},
				},
				Action: func(ctx *cli.Context) error {
					role := peerconfig.Role(ctx.String("role"))

					var peerConfig *peerconfig.PeerConfig
					var err error
					if ctx.IsSet("secret") {
						peerConfig, err = sharedSecretPeerConfig(ctx.String("secret"), role)
					} else if ctx.IsSet("peerPublicKey") {
						peerConfig, err = keyPairPeerConfig(ctx.String("peerPublicKey"), role)
					} else {
						err = fmt.Errorf("Either secret or peerPublicKey must be specified!")
					}

					if err != nil {
						return err
					}

					connect(peerConfig)
					return nil
				},
			},
		},
	}

	if err := app.Run(os.Args); err != nil {
		panic(err)
	}
}

func createVideoSource() *thingrtc.MediaSource {
	codec, err := x264.NewCodec(500_000)
	if err != nil {
		panic(err)
	}
	videoSource, err := thingrtc.CreateVideoMediaSource(codec, 640, 480)
	if err != nil {
		panic(err)
	}
	return videoSource
}

func sharedSecretPeerConfig(sharedSecretBase64 string, role peerconfig.Role) (*peerconfig.PeerConfig, error) {
	var peerConfig *peerconfig.PeerConfig
	var err error

	switch role {
	case "initiator":
		peerConfig, err = peerconfig.CreateInitiatorConfigWithSecret(sharedSecretBase64)
	case "responder":
		peerConfig, err = peerconfig.CreateResponderConfig(sharedSecretBase64)
	default:
		err = fmt.Errorf("Invalid role type, expected initiator/responder")
	}

	if err != nil {
		return nil, err
	}

	return peerConfig, nil
}

func keyPairPeerConfig(remoteKeySpki string, role peerconfig.Role) (*peerconfig.PeerConfig, error) {
	remoteKey, err := peerconfig.CreateRemoteKey(remoteKeySpki)
	if err != nil {
		return nil, err
	}

	localKeyPair, err := peerconfig.CreateLocalKeyPair()
	if err != nil {
		return nil, err
	}

	spki := base64.StdEncoding.EncodeToString(localKeyPair.PublicKey.ExportSpki())
	fmt.Printf("Local public key is: %v\n", spki)

	return peerconfig.CreateKeyPairConfig(remoteKey, localKeyPair, role)
}

func connect(peerConfig *peerconfig.PeerConfig) {
	serverAuth := thingrtc.CreateInsecureServerAuth(peerConfig.PairingId, peerConfig.Role)
	peer := thingrtc.NewPeerWithMedia(SIGNALLING_SERVER_URL, serverAuth, peerConfig, false, createVideoSource())

	peer.OnConnectionStateChange(func(connectionState int) {
		switch connectionState {
		case thingrtc.Disconnected:
			fmt.Println("Disconnected")
		case thingrtc.Connecting:
			fmt.Println("Connecting...")
		case thingrtc.Connected:
			fmt.Println("Connected.")
			dataChannel, err := peer.CreateDataChannel("tick", true)
			if err != nil {
				fmt.Printf("Failed to create data channel: %v\n", err)
			} else {
				for range time.Tick(time.Second) {
					dataChannel.SendStringMessage("Tick")
				}
			}
		}
	})
	peer.OnDataChannel(func(dataChannel thingrtc.DataChannel) {
		fmt.Printf("New data channel received: %v\n", dataChannel.GetLabel())

		dataChannel.OnStringMessage(func(message string) {
			fmt.Printf("String message received: %v\n", message)
		})
		dataChannel.OnBinaryMessage(func(message []byte) {
			fmt.Printf("Binary message received: %v\n", message)
		})
	})
	peer.OnError(func(err error) {
		fmt.Printf("Peer error: %v\n", err)
	})

	peer.Connect()
	defer peer.Disconnect()

	select {}
}
