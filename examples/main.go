package main

import (
	"fmt"
	"os"
	"path"
	"time"

	"github.com/urfave/cli/v2"

	thingrtc "github.com/thingify-app/thing-rtc-go"
	"github.com/thingify-app/thing-rtc-go/codec/openh264"
	"github.com/thingify-app/thing-rtc-go/pairing"

	_ "github.com/pion/mediadevices/pkg/driver/videotest"
	// Uncomment below and comment above to use the camera.
	// _ "github.com/thingify-app/thing-rtc-go/driver/camera"
)

func main() {
	app := &cli.App{
		Name:  "thingrtc",
		Usage: "Explore thingrtc",
		Commands: []*cli.Command{
			{
				Name:  "pair",
				Usage: "Manage pairing with a peer",
				Subcommands: []*cli.Command{
					{
						Name:  "initiate",
						Usage: "Initiate a pairing request",
						Action: func(ctx *cli.Context) error {
							return initiatePairing()
						},
					},
					{
						Name:  "respond",
						Usage: "Respond to a pairing request with the provided shortcode",
						Flags: []cli.Flag{
							&cli.StringFlag{
								Name:     "shortcode",
								Usage:    "shortcode provided by initiating peer",
								Required: true,
							},
						},
						Action: func(ctx *cli.Context) error {
							return respondToPairing(ctx.String("shortcode"))
						},
					},
					{
						Name:  "list",
						Usage: "List all saved pairings",
						Action: func(ctx *cli.Context) error {
							return listPairings()
						},
					},
					{
						Name:  "delete",
						Usage: "Delete a particular pairing",
						Flags: []cli.Flag{
							&cli.StringFlag{
								Name:     "id",
								Usage:    "pairingId of the pairing to delete",
								Required: true,
							},
						},
						Action: func(ctx *cli.Context) error {
							return deletePairing(ctx.String("id"))
						},
					},
					{
						Name:  "clear",
						Usage: "Clear all saved pairings",
						Action: func(ctx *cli.Context) error {
							return clearPairings()
						},
					},
				},
			},
			{
				Name:  "connect",
				Usage: "Connect to a peer",
				Flags: []cli.Flag{
					&cli.StringFlag{
						Name:     "id",
						Usage:    "pairingId of the peer to connect to",
						Required: true,
					},
				},
				Action: func(ctx *cli.Context) error {
					connect(ctx.String("id"))
					return nil
				},
			},
		},
	}

	if err := app.Run(os.Args); err != nil {
		panic(err)
	}
}

func createPairing() pairing.Pairing {
	userConfigDir, err := os.UserConfigDir()
	if err != nil {
		panic(err)
	}

	// Create our config dir if it doesn't exist.
	configDir := path.Join(userConfigDir, "thingrtc")
	err = os.MkdirAll(configDir, os.ModePerm)
	if err != nil {
		panic(err)
	}

	return pairing.NewPairing("http://localhost:8081/", path.Join(configDir, "pairing.json"))
}

func initiatePairing() error {
	pairing := createPairing()

	fmt.Printf("Creating pairing request...\n")
	pendingResult, err := pairing.InitiatePairing()
	if err != nil {
		return err
	}

	fmt.Printf("Shortcode: %v\n", pendingResult.Shortcode)

	result, err := pendingResult.PairingResult()
	if err != nil {
		return err
	}

	fmt.Printf("Pairing succeeded, pairingId: %v\n", result.PairingId)
	return nil
}

func respondToPairing(shortcode string) error {
	pairing := createPairing()

	fmt.Printf("Responding to pairing...\n")
	result, err := pairing.RespondToPairing(shortcode)
	if err != nil {
		return err
	}

	fmt.Printf("Pairing succeeded, pairingId: %v\n", result.PairingId)
	return nil
}

func listPairings() error {
	pairing := createPairing()
	fmt.Printf("All pairings:\n%v\n", pairing.GetAllPairingIds())
	return nil
}

func deletePairing(pairingId string) error {
	pairing := createPairing()
	pairing.DeletePairing(pairingId)
	return nil
}

func clearPairings() error {
	pairing := createPairing()
	pairing.ClearAllPairings()
	return nil
}

func connect(pairingId string) {
	videoSource := thingrtc.CreateVideoMediaSource(640, 480)
	codec, err := openh264.NewCodec(1_000_000)
	if err != nil {
		panic(err)
	}

	peer := thingrtc.NewPeer("ws://localhost:8080/", codec, videoSource)

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

	pairing := createPairing()
	tokenGenerator, err := pairing.GetTokenGenerator(pairingId)
	if err != nil {
		panic(err)
	}

	err = peer.Connect(tokenGenerator)
	if err != nil {
		panic(err)
	}
	defer peer.Disconnect()

	select {}
}
