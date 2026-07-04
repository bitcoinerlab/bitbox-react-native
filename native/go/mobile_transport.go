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
// string or the short BitBox Nova BLE product string.
func NewClientWithMobileTransport(transport MobileTransport, productString string, versionString string, isBluetooth bool) (*Client, error) {
	if transport == nil {
		return nil, fmt.Errorf("transport is required")
	}
	product, err := mobileProduct(productString)
	if err != nil {
		return nil, err
	}
	version, err := semver.NewSemVerFromString(versionString)
	if err != nil {
		return nil, err
	}

	communication := u2fhid.NewCommunication(&mobileTransportAdapter{transport: transport}, bitbox02FirmwareCommand)
	// BLE is already wrapped by platform Bluetooth pairing/bonding, so the
	// upstream app-side Noise trust cache can remain in-memory for this initial
	// mobile path. Non-BLE transports may need persisted config before app-side
	// pairing confirmation is exposed.
	device := firmware.NewDevice(
		version,
		&product,
		newMemoryConfig(),
		communication,
		noopLogger{},
		firmware.WithOptionalNoisePairingConfirmation(isBluetooth),
	)
	if err := device.Init(); err != nil {
		communication.Close()
		return nil, err
	}
	if isBluetooth && device.Status() == firmware.StatusUnpaired {
		device.ChannelHashVerify(true)
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
