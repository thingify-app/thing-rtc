package pairing

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/url"
	"time"

	"github.com/gorilla/websocket"
)

type PairingServer struct {
	baseUrl string
}

type PendingPairing struct {
	pairingId        string
	shortcode        string
	token            string
	expiry           uint64
	completedPairing <-chan CompletedPairing
}

type CompletedPairing struct {
	initiatorPublicKey string
	success            bool
}

type InitiatorPairDetails struct {
	pairingId          string
	responderPublicKey string
	initiatorToken     string
}

var netClient = &http.Client{
	Timeout: time.Second * 10,
}

func (ps PairingServer) createPairingRequest(responderPublicKey string) (<-chan PendingPairing, <-chan error) {
	pendingPairing := make(chan PendingPairing)
	completedPairing := make(chan CompletedPairing)
	errors := make(chan error)

	go func() {
		wsUrl, err := url.Parse(ps.baseUrl)
		if err != nil {
			errors <- err
			return
		}

		if wsUrl.Scheme == "https" {
			wsUrl.Scheme = "wss"
		} else if wsUrl.Scheme == "http" {
			wsUrl.Scheme = "ws"
		} else {
			errors <- err
			return
		}

		conn, _, err := websocket.DefaultDialer.Dial(wsUrl.String(), nil)
		if err != nil {
			errors <- err
			return
		}
		defer conn.Close()

		err = conn.WriteMessage(websocket.TextMessage, []byte(responderPublicKey))
		if err != nil {
			errors <- err
			return
		}

		pairingData := struct {
			PairingId string
			Shortcode string
			Token     string
			Expiry    uint64
		}{}

		err = conn.ReadJSON(&pairingData)
		if err != nil {
			errors <- err
			return
		}

		pendingPairing <- PendingPairing{
			pairingId:        pairingData.PairingId,
			shortcode:        pairingData.Shortcode,
			token:            pairingData.Token,
			expiry:           pairingData.Expiry,
			completedPairing: completedPairing,
		}

		completedPairingData := struct {
			Status             string
			InitiatorPublicKey string
		}{}

		err = conn.ReadJSON(&completedPairingData)
		if err != nil {
			errors <- err
			return
		}

		completedPairing <- CompletedPairing{
			success:            completedPairingData.Status == "paired",
			initiatorPublicKey: completedPairingData.InitiatorPublicKey,
		}
	}()

	return pendingPairing, errors
}

func (ps PairingServer) respondToPairingRequest(shortcode, publicKeyJwk string) (<-chan InitiatorPairDetails, <-chan error) {
	pairDetails := make(chan InitiatorPairDetails)
	errors := make(chan error)

	apiUrl, err := url.Parse(ps.baseUrl)
	if err != nil {
		errors <- err
		return pairDetails, errors
	}

	postBody, _ := json.Marshal(map[string]string{
		"publicKey": publicKeyJwk,
	})

	go func() {
		resp, err := http.Post(apiUrl.String(), "application/json", bytes.NewBuffer(postBody))
		if err != nil {

		}
		defer resp.Body.Close()

		pairDetails <- InitiatorPairDetails{}
	}()

	return pairDetails, errors
}
