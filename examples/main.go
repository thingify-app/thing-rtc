package main

import (
	"fmt"
	"time"

	thingrtc "github.com/thingify-app/thing-rtc-go"
	"github.com/thingify-app/thing-rtc-go/codec/openh264"

	_ "github.com/pion/mediadevices/pkg/driver/videotest"
	// Uncomment below and comment above to use the camera.
	// _ "github.com/thingify-app/thing-rtc-go/driver/camera"
)

func main() {
	videoSource := thingrtc.CreateVideoMediaSource(640, 480)
	codec, err := openh264.NewCodec(1_000_000)
	if err != nil {
		panic(err)
	}

	peer := thingrtc.NewPeer("wss://thingify-test.herokuapp.com/", codec, videoSource)

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

	tokenGenerator := thingrtc.BasicTokenGenerator{
		Role:        "responder",
		ResponderId: "123",
	}

	err = peer.Connect(tokenGenerator)
	if err != nil {
		panic(err)
	}
	defer peer.Disconnect()

	select {}
}
