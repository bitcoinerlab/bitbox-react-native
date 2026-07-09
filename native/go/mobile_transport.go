package bitboxnative

import (
	"fmt"
	"io"
	"strings"
	"sync"

	"github.com/BitBoxSwiss/bitbox02-api-go/api/common"
	"github.com/BitBoxSwiss/bitbox02-api-go/api/firmware"
	"github.com/BitBoxSwiss/bitbox02-api-go/communication/u2fhid"
	"github.com/BitBoxSwiss/bitbox02-api-go/util/semver"
	"github.com/flynn/noise"
)

const bitbox02FirmwareCommand = 0xc1

// MobileTransport is implemented by platform native code and provides raw U2F
// HID report reads and writes over the platform transport, such as iOS BLE.
type MobileTransport interface {
	Read(n int) ([]byte, error)
	Write(data []byte) (int, error)
	Close() error
}

// MobilePairingConfirmation lets platform code show and confirm a BitBox Noise
// pairing code. ShowPairingCode must return quickly; ConfirmPairingCode may
// block until the user accepts or rejects the code in the app UI.
type MobilePairingConfirmation interface {
	ShowPairingCode(code string, deviceVerified bool) error
	ConfirmPairingCode(code string) (bool, error)
}

type mobileTransportAdapter struct {
	transport MobileTransport
}

func (adapter *mobileTransportAdapter) Read(p []byte) (int, error) {
	if len(p) == 0 {
		return 0, nil
	}
	data, err := adapter.transport.Read(len(p))
	if err != nil {
		return 0, err
	}
	if len(data) > len(p) {
		return 0, io.ErrShortBuffer
	}
	return copy(p, data), nil
}

func (adapter *mobileTransportAdapter) Write(p []byte) (int, error) {
	if len(p) == 0 {
		return 0, nil
	}
	n, err := adapter.transport.Write(p)
	if n < 0 || n > len(p) {
		return 0, fmt.Errorf("invalid transport write count: %d", n)
	}
	if n == 0 && err == nil {
		return 0, io.ErrShortWrite
	}
	return n, err
}

func (adapter *mobileTransportAdapter) Close() error {
	return adapter.transport.Close()
}

// NewClientWithMobileTransport creates and initializes a BitBox client using a
// platform-provided transport. productString may be the BitBox USB product
// string or the short BitBox Nova BLE product string. If productString and
// versionString are empty, the firmware API infers them through OP_INFO during
// initialization, which is suitable for modern USB devices.
func NewClientWithMobileTransport(transport MobileTransport, productString string, versionString string, isBluetooth bool) (*Client, error) {
	return newClientWithMobileTransport(transport, productString, versionString, isBluetooth, nil, nil)
}

// NewClientWithMobileTransportAndPairing creates a client and routes app-side
// pairing confirmation through pairingConfirmation. This is required for USB,
// where there is no secure OS transport pairing layer around the Noise channel.
func NewClientWithMobileTransportAndPairing(transport MobileTransport, productString string, versionString string, isBluetooth bool, pairingConfirmation MobilePairingConfirmation) (*Client, error) {
	return newClientWithMobileTransport(transport, productString, versionString, isBluetooth, pairingConfirmation, nil)
}

// NewClientWithMobileTransportAndPairingConfig creates a client with app-side
// pairing confirmation and a persisted Noise config file.
func NewClientWithMobileTransportAndPairingConfig(transport MobileTransport, productString string, versionString string, isBluetooth bool, pairingConfirmation MobilePairingConfirmation, configPath string) (*Client, error) {
	config, err := newPersistentConfig(configPath)
	if err != nil {
		return nil, err
	}
	return newClientWithMobileTransport(transport, productString, versionString, isBluetooth, pairingConfirmation, config)
}

func newClientWithMobileTransport(transport MobileTransport, productString string, versionString string, isBluetooth bool, pairingConfirmation MobilePairingConfirmation, config firmware.ConfigInterface) (*Client, error) {
	if transport == nil {
		return nil, fmt.Errorf("transport is required")
	}
	var product *common.Product
	var version *semver.SemVer
	if strings.TrimSpace(productString) != "" || strings.TrimSpace(versionString) != "" {
		parsedProduct, err := mobileProduct(productString)
		if err != nil {
			return nil, err
		}
		parsedVersion, err := semver.NewSemVerFromString(versionString)
		if err != nil {
			return nil, err
		}
		product = &parsedProduct
		version = parsedVersion
	}

	if config == nil {
		config = newMemoryConfig()
	}

	communication := u2fhid.NewCommunication(&mobileTransportAdapter{transport: transport}, bitbox02FirmwareCommand)
	// BLE is already wrapped by platform Bluetooth pairing/bonding, so the
	// upstream app-side Noise trust cache can remain in-memory for this initial
	// mobile path. Non-BLE transports may need persisted config before app-side
	// pairing confirmation is exposed.
	device := firmware.NewDevice(
		version,
		product,
		config,
		communication,
		noopLogger{},
		firmware.WithOptionalNoisePairingConfirmation(isBluetooth),
	)
	var pairingCallbackErr error
	if pairingConfirmation != nil {
		device.SetOnEvent(func(event firmware.Event, _ interface{}) {
			if event != firmware.EventChannelHashChanged {
				return
			}
			code, deviceVerified := device.ChannelHash()
			if code == "" {
				return
			}
			if err := pairingConfirmation.ShowPairingCode(code, deviceVerified); err != nil && pairingCallbackErr == nil {
				pairingCallbackErr = err
			}
		})
	}
	if err := device.Init(); err != nil {
		communication.Close()
		return nil, err
	}
	if pairingCallbackErr != nil {
		communication.Close()
		return nil, pairingCallbackErr
	}
	if isBluetooth && device.Status() == firmware.StatusUnpaired {
		device.ChannelHashVerify(true)
	}
	if !isBluetooth && device.Status() == firmware.StatusUnpaired {
		if pairingConfirmation == nil {
			communication.Close()
			return nil, fmt.Errorf("BitBox app-side pairing confirmation is required")
		}
		code, _ := device.ChannelHash()
		if code == "" {
			communication.Close()
			return nil, fmt.Errorf("BitBox pairing code is unavailable")
		}
		ok, err := pairingConfirmation.ConfirmPairingCode(code)
		if err != nil {
			communication.Close()
			return nil, err
		}
		device.ChannelHashVerify(ok)
		if !ok || device.Status() == firmware.StatusPairingFailed {
			communication.Close()
			return nil, fmt.Errorf("BitBox pairing was rejected")
		}
	}
	return newClientWithDevice(device), nil
}

func mobileProduct(productString string) (common.Product, error) {
	productString = strings.TrimSpace(productString)
	switch productString {
	case "bb02p-multi":
		productString = common.FirmwareDeviceProductStringBitBox02PlusMulti
	case "bb02p-btconly":
		productString = common.FirmwareDeviceProductStringBitBox02PlusBTCOnly
	case "bb02p-bl-multi", common.BootloaderDeviceProductStringBitBox02PlusMulti,
		"bb02p-bl-btconly", common.BootloaderDeviceProductStringBitBox02PlusBTCOnly:
		return "", fmt.Errorf("BitBox bootloader mode is not supported")
	}
	return common.ProductFromDeviceProductString(productString)
}

type memoryConfig struct {
	mu                    sync.Mutex
	deviceStaticPubkeys   map[string]struct{}
	appNoiseStaticKeypair *noise.DHKey
}

func newMemoryConfig() *memoryConfig {
	return &memoryConfig{deviceStaticPubkeys: map[string]struct{}{}}
}

func (config *memoryConfig) ContainsDeviceStaticPubkey(pubkey []byte) bool {
	config.mu.Lock()
	defer config.mu.Unlock()
	_, ok := config.deviceStaticPubkeys[string(pubkey)]
	return ok
}

func (config *memoryConfig) AddDeviceStaticPubkey(pubkey []byte) error {
	config.mu.Lock()
	defer config.mu.Unlock()
	config.deviceStaticPubkeys[string(pubkey)] = struct{}{}
	return nil
}

func (config *memoryConfig) GetAppNoiseStaticKeypair() *noise.DHKey {
	config.mu.Lock()
	defer config.mu.Unlock()
	return cloneNoiseKey(config.appNoiseStaticKeypair)
}

func (config *memoryConfig) SetAppNoiseStaticKeypair(key *noise.DHKey) error {
	config.mu.Lock()
	defer config.mu.Unlock()
	config.appNoiseStaticKeypair = cloneNoiseKey(key)
	return nil
}

func cloneNoiseKey(key *noise.DHKey) *noise.DHKey {
	if key == nil {
		return nil
	}
	return &noise.DHKey{
		Private: append([]byte(nil), key.Private...),
		Public:  append([]byte(nil), key.Public...),
	}
}

type noopLogger struct{}

func (noopLogger) Error(string, error) {}
func (noopLogger) Info(string)         {}
func (noopLogger) Debug(string)        {}
