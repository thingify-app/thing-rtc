package pairing

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/url"

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
	completedPairing func() (*CompletedPairing, error)
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

func (ps PairingServer) createPairingRequest(responderPublicKey string) (*PendingPairing, error) {
	wsUrl, err := url.Parse(ps.baseUrl)
	if err != nil {
		return nil, err
	}

	if wsUrl.Scheme == "https" {
		wsUrl.Scheme = "wss"
	} else if wsUrl.Scheme == "http" {
		wsUrl.Scheme = "ws"
	} else {
		return nil, err
	}

	conn, _, err := websocket.DefaultDialer.Dial(wsUrl.String(), nil)
	if err != nil {
		return nil, err
	}

	err = conn.WriteMessage(websocket.TextMessage, []byte(responderPublicKey))
	if err != nil {
		return nil, err
	}

	pairingData := struct {
		PairingId string
		Shortcode string
		Token     string
		Expiry    uint64
	}{}

	err = conn.ReadJSON(&pairingData)
	if err != nil {
		return nil, err
	}

	pendingPairing := PendingPairing{
		pairingId: pairingData.PairingId,
		shortcode: pairingData.Shortcode,
		token:     pairingData.Token,
		expiry:    pairingData.Expiry,
		completedPairing: func() (*CompletedPairing, error) {
			defer conn.Close()

			completedPairingData := struct {
				Status             string
				InitiatorPublicKey string
			}{}

			err = conn.ReadJSON(&completedPairingData)

			if err != nil {
				return nil, err
			}

			completedPairing := CompletedPairing{
				success:            completedPairingData.Status == "paired",
				initiatorPublicKey: completedPairingData.InitiatorPublicKey,
			}
			return &completedPairing, nil
		},
	}

	return &pendingPairing, nil
}

func (ps PairingServer) respondToPairingRequest(shortcode, publicKeyJwk string) (*InitiatorPairDetails, error) {
	apiUrl, err := url.Parse(ps.baseUrl)
	if err != nil {
		return nil, err
	}

	apiUrl.Path = "respondToPairing/" + shortcode

	postBody, _ := json.Marshal(map[string]string{
		"publicKey": publicKeyJwk,
	})

	resp, err := http.Post(apiUrl.String(), "application/json", bytes.NewBuffer(postBody))
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	pairDetailsResponse := struct {
		PairingId          string
		ResponderPublicKey string
		InitiatorToken     string
	}{}

	decoder := json.NewDecoder(resp.Body)
	err = decoder.Decode(&pairDetailsResponse)
	if err != nil {
		return nil, err
	}

	pairDetails := InitiatorPairDetails{
		pairingId:          pairDetailsResponse.PairingId,
		responderPublicKey: pairDetailsResponse.ResponderPublicKey,
		initiatorToken:     pairDetailsResponse.InitiatorToken,
	}

	return &pairDetails, nil
}
