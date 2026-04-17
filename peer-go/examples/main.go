package main

import (
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

const SIGNALLING_SERVER_URL = "wss://thingify.deno.dev/signalling"

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
						Name:     "secret",
						Usage:    "shared secret of the peer to connect to",
						Required: true,
					},
					&cli.StringFlag{
						Name:  "role",
						Usage: "role to assume (either initiator or responder)",

						Required: true,
					},
				},
				Action: func(ctx *cli.Context) error {
					return connect(ctx.String("secret"), ctx.String("role"))
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

func connect(sharedSecretBase64 string, role string) error {
	var peerConfig *peerconfig.PeerConfig
	var err error

	switch role {
	case "initiator":
		peerConfig, err = peerconfig.CreateInitiatorConfigWithSecret(sharedSecretBase64)
	case "responder":
		peerConfig, err = peerconfig.CreateResponderConfig(sharedSecretBase64)
	default:
		return fmt.Errorf("Invalid role type, expected initiator/responder")
	}

	if err != nil {
		return err
	}

	serverAuth := thingrtc.CreateInsecureServerAuth(peerConfig.PairingId, peerConfig.Role)
	peer := thingrtc.NewPeerWithMedia(SIGNALLING_SERVER_URL, serverAuth, peerConfig, createVideoSource())

	peer.OnConnectionStateChange(func(connectionState int) {
		switch connectionState {
		case thingrtc.Disconnected:
			fmt.Println("Disconnected")
		case thingrtc.Connecting:
			fmt.Println("Connecting...")
		case thingrtc.Connected:
			fmt.Println("Connected.")
			for range time.Tick(time.Second) {
				peer.SendStringMessage("Tick")
			}
		}
	})
	peer.OnStringMessage(func(message string) {
		fmt.Printf("String message received: %v\n", message)
	})
	peer.OnBinaryMessage(func(message []byte) {
		fmt.Printf("Binary message received: %v\n", message)
	})
	peer.OnError(func(err error) {
		fmt.Printf("Peer error: %v\n", err)
	})

	peer.Connect()
	defer peer.Disconnect()

	select {}
}
