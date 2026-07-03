package bitboxnative

import (
	"encoding/hex"
	"errors"
	"sync"

	"github.com/BitBoxSwiss/bitbox02-api-go/api/firmware"
	"github.com/BitBoxSwiss/bitbox02-api-go/api/firmware/messages"
)

var errTransportNotConnected = errors.New("BitBox transport is not connected")

// Client wraps a single upstream BitBox firmware device session.
type Client struct {
	mu     sync.Mutex
	device *firmware.Device
}

// NewClient creates a disconnected client wrapper. Platform native code should
// use NewClientWithMobileTransport once it has opened a real transport.
func NewClient() *Client {
	return &Client{}
}

func newClientWithDevice(device *firmware.Device) *Client {
	return &Client{device: device}
}

func (client *Client) deviceOrError() (*firmware.Device, error) {
	client.mu.Lock()
	defer client.mu.Unlock()
	if client.device == nil {
		return nil, errTransportNotConnected
	}
	return client.device, nil
}

// Close closes the active BitBox session if one is connected.
func (client *Client) Close() {
	client.mu.Lock()
	device := client.device
	client.device = nil
	client.mu.Unlock()
	if device != nil {
		device.Close()
	}
}

// Version returns the connected device firmware version.
func (client *Client) Version() (string, error) {
	device, err := client.deviceOrError()
	if err != nil {
		return "", err
	}
	return device.Version().String(), nil
}

// RootFingerprint returns the connected device root fingerprint as lowercase hex.
func (client *Client) RootFingerprint() (string, error) {
	device, err := client.deviceOrError()
	if err != nil {
		return "", err
	}
	fingerprint, err := device.RootFingerprint()
	if err != nil {
		return "", err
	}
	return hex.EncodeToString(fingerprint), nil
}

// BTCXPub delegates xpub retrieval to upstream bitbox02-api-go.
func (client *Client) BTCXPub(apiNetwork string, keypath string, xpubType string, display bool) (string, error) {
	device, err := client.deviceOrError()
	if err != nil {
		return "", err
	}
	coin, err := btcCoin(apiNetwork)
	if err != nil {
		return "", err
	}
	parsedKeypath, err := parseKeypath(keypath)
	if err != nil {
		return "", err
	}
	parsedXpubType, err := btcXpubType(xpubType)
	if err != nil {
		return "", err
	}
	return device.BTCXPub(coin, parsedKeypath, parsedXpubType, display)
}

// BTCAddress delegates address retrieval/display to upstream bitbox02-api-go.
func (client *Client) BTCAddress(apiNetwork string, keypath string, scriptConfigJSON string, display bool) (string, error) {
	device, err := client.deviceOrError()
	if err != nil {
		return "", err
	}
	coin, err := btcCoin(apiNetwork)
	if err != nil {
		return "", err
	}
	parsedKeypath, err := parseKeypath(keypath)
	if err != nil {
		return "", err
	}
	scriptConfig, err := parseScriptConfigJSON(scriptConfigJSON)
	if err != nil {
		return "", err
	}
	return device.BTCAddress(coin, parsedKeypath, scriptConfig, display)
}

// BTCRegisterScriptConfig delegates script config registration to upstream bitbox02-api-go.
func (client *Client) BTCRegisterScriptConfig(apiNetwork string, scriptConfigJSON string, keypathAccount string, xpubType string, name string) error {
	_ = xpubType // Upstream BTCRegisterScriptConfig currently does not take this option.
	device, err := client.deviceOrError()
	if err != nil {
		return err
	}
	coin, err := btcCoin(apiNetwork)
	if err != nil {
		return err
	}
	scriptConfig, err := parseScriptConfigJSON(scriptConfigJSON)
	if err != nil {
		return err
	}
	parsedKeypathAccount, err := parseOptionalKeypath(keypathAccount)
	if err != nil {
		return err
	}
	return device.BTCRegisterScriptConfig(coin, scriptConfig, parsedKeypathAccount, name)
}

// BTCIsScriptConfigRegistered checks registration through upstream bitbox02-api-go.
func (client *Client) BTCIsScriptConfigRegistered(apiNetwork string, scriptConfigJSON string, keypathAccount string) (bool, error) {
	device, err := client.deviceOrError()
	if err != nil {
		return false, err
	}
	coin, err := btcCoin(apiNetwork)
	if err != nil {
		return false, err
	}
	scriptConfig, err := parseScriptConfigJSON(scriptConfigJSON)
	if err != nil {
		return false, err
	}
	parsedKeypathAccount, err := parseOptionalKeypath(keypathAccount)
	if err != nil {
		return false, err
	}
	return device.BTCIsScriptConfigRegistered(coin, scriptConfig, parsedKeypathAccount)
}

// BTCSignPSBT parses, signs, and serializes a base64 PSBT through upstream bitbox02-api-go.
func (client *Client) BTCSignPSBT(apiNetwork string, psbtBase64 string, forceScriptConfigJSON string, formatUnit string) (string, error) {
	device, err := client.deviceOrError()
	if err != nil {
		return "", err
	}
	coin, err := btcCoin(apiNetwork)
	if err != nil {
		return "", err
	}
	packet, err := parsePSBTBase64(psbtBase64)
	if err != nil {
		return "", err
	}
	options, err := psbtSignOptions(forceScriptConfigJSON, formatUnit)
	if err != nil {
		return "", err
	}
	if err := device.BTCSignPSBT(coin, packet, options); err != nil {
		return "", err
	}
	return encodePSBTBase64(packet)
}

func btcCoin(apiNetwork string) (messages.BTCCoin, error) {
	switch apiNetwork {
	case "btc":
		return messages.BTCCoin_BTC, nil
	case "tbtc":
		return messages.BTCCoin_TBTC, nil
	default:
		return 0, invalidValueError("apiNetwork", apiNetwork)
	}
}
