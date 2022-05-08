package main

import (
	"fmt"
	"time"

	thingrtc "github.com/thingify-app/thing-rtc-go/pkg"
)

func main() {
	tokenGenerator := thingrtc.BasicTokenGenerator{
		Role:        "responder",
		ResponderId: "123",
	}
	peer := thingrtc.NewPeer("ws://localhost:8080/")

	peer.OnConnectionStateChange(func(connectionState int) {
		switch connectionState {
		case thingrtc.Disconnected:
			fmt.Println("Disconnected")
		case thingrtc.Connecting:
			fmt.Println("Connecting...")
		case thingrtc.Connected:
			fmt.Println("Connected.")
			for range time.Tick(time.Second) {
				peer.SendMessage("Tick")
			}
		}
	})
	peer.OnMessage(func(message string) {
		fmt.Printf("Message received: %v\n", message)
	})

	err := peer.Connect(tokenGenerator)
	if err != nil {
		panic(err)
	}
	defer peer.Disconnect()

	select {}
}
