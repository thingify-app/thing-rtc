package main

import (
	"encoding/json"
	"fmt"
	"os"
	"path"
	"time"

	"github.com/urfave/cli/v2"

	thingrtc "github.com/thingify-app/thing-rtc/peer-go"
	"github.com/thingify-app/thing-rtc/peer-go/codec/x264"
	"github.com/thingify-app/thing-rtc/peer-go/pairing"

	_ "github.com/pion/mediadevices/pkg/driver/videotest"
	// Uncomment below and comment above to use the camera.
	// _ "github.com/thingify-app/thing-rtc/peer-go/driver/camera"
)

const PAIRING_SERVER_URL = "https://thingify.deno.dev/pairing"
const SIGNALLING_SERVER_URL = "wss://thingify.deno.dev/signalling"

func main() {
	metadataFlag := &cli.StringFlag{
		Name:     "metadata",
		Usage:    "JSON-formatted metadata consisting of string keys and values",
		Required: false,
		Value:    "{}",
	}

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
						Flags: []cli.Flag{
							metadataFlag,
						},
						Action: func(ctx *cli.Context) error {
							return initiatePairing(ctx.String("metadata"))
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
							metadataFlag,
						},
						Action: func(ctx *cli.Context) error {
							return respondToPairing(ctx.String("shortcode"), ctx.String("metadata"))
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
			{
				Name:  "connectAll",
				Usage: "Connect to all paired peers",
				Action: func(ctx *cli.Context) error {
					connectAll()
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

	return pairing.NewPairing(PAIRING_SERVER_URL, path.Join(configDir, "pairing.json"))
}

func parseMetadata(metadata string) (map[string]string, error) {
	var result map[string]string
	err := json.Unmarshal([]byte(metadata), &result)
	if err != nil {
		return nil, err
	}
	return result, nil
}

func initiatePairing(metadata string) error {
	pairing := createPairing()

	parsedMetadata, err := parseMetadata(metadata)
	if err != nil {
		return err
	}

	fmt.Printf("Creating pairing request...\n")
	pendingResult, err := pairing.InitiatePairingWithMetadata(parsedMetadata)
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

func respondToPairing(shortcode string, metadata string) error {
	pairing := createPairing()

	parsedMetadata, err := parseMetadata(metadata)
	if err != nil {
		return err
	}

	fmt.Printf("Responding to pairing...\n")
	result, err := pairing.RespondToPairingWithMetadata(shortcode, parsedMetadata)
	if err != nil {
		return err
	}

	fmt.Printf("Pairing succeeded, pairingId: %v\n", result.PairingId)
	return nil
}

func listPairings() error {
	pairing := createPairing()
	pairings, err := pairing.GetAllPairings()
	if err != nil {
		return err
	}
	for _, p := range pairings {
		fmt.Printf("Pairing: %v\nLocal metadata: %v\nRemote metadata: %v\n\n", p.PairingId, p.LocalMetadata, p.RemoteMetadata)
	}
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

func connectAll() {
	peerSet, err := thingrtc.NewPeerSet(SIGNALLING_SERVER_URL, createPairing(), createVideoSource())
	if err != nil {
		panic(err)
	}

	peerSet.Connect()
	defer peerSet.Disconnect()

	select {}
}

func connect(pairingId string) {
	pairing := createPairing()
	tokenGenerator, err := pairing.GetTokenGenerator(pairingId)
	if err != nil {
		panic(err)
	}

	peer := thingrtc.NewPeerWithMedia(SIGNALLING_SERVER_URL, tokenGenerator, createVideoSource())

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
