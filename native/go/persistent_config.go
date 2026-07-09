package bitboxnative

import (
	"encoding/base64"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"sync"

	"github.com/flynn/noise"
)

type persistentConfig struct {
	mu    sync.Mutex
	path  string
	state persistentConfigState
}

type persistentConfigState struct {
	DeviceStaticPubkeys   []string            `json:"deviceStaticPubkeys"`
	AppNoiseStaticKeypair *persistentNoiseKey `json:"appNoiseStaticKeypair,omitempty"`
}

type persistentNoiseKey struct {
	Private string `json:"private"`
	Public  string `json:"public"`
}

func newPersistentConfig(path string) (*persistentConfig, error) {
	config := &persistentConfig{path: path}
	if err := config.load(); err != nil {
		return nil, err
	}
	return config, nil
}

func (config *persistentConfig) ContainsDeviceStaticPubkey(pubkey []byte) bool {
	config.mu.Lock()
	defer config.mu.Unlock()
	encoded := base64.StdEncoding.EncodeToString(pubkey)
	for _, item := range config.state.DeviceStaticPubkeys {
		if item == encoded {
			return true
		}
	}
	return false
}

func (config *persistentConfig) AddDeviceStaticPubkey(pubkey []byte) error {
	config.mu.Lock()
	defer config.mu.Unlock()
	encoded := base64.StdEncoding.EncodeToString(pubkey)
	for _, item := range config.state.DeviceStaticPubkeys {
		if item == encoded {
			return config.saveLocked()
		}
	}
	config.state.DeviceStaticPubkeys = append(config.state.DeviceStaticPubkeys, encoded)
	return config.saveLocked()
}

func (config *persistentConfig) GetAppNoiseStaticKeypair() *noise.DHKey {
	config.mu.Lock()
	defer config.mu.Unlock()
	if config.state.AppNoiseStaticKeypair == nil {
		return nil
	}
	privateKey, err := base64.StdEncoding.DecodeString(config.state.AppNoiseStaticKeypair.Private)
	if err != nil {
		return nil
	}
	publicKey, err := base64.StdEncoding.DecodeString(config.state.AppNoiseStaticKeypair.Public)
	if err != nil {
		return nil
	}
	return &noise.DHKey{Private: privateKey, Public: publicKey}
}

func (config *persistentConfig) SetAppNoiseStaticKeypair(key *noise.DHKey) error {
	config.mu.Lock()
	defer config.mu.Unlock()
	if key == nil {
		config.state.AppNoiseStaticKeypair = nil
		return config.saveLocked()
	}
	config.state.AppNoiseStaticKeypair = &persistentNoiseKey{
		Private: base64.StdEncoding.EncodeToString(key.Private),
		Public:  base64.StdEncoding.EncodeToString(key.Public),
	}
	return config.saveLocked()
}

func (config *persistentConfig) load() error {
	config.mu.Lock()
	defer config.mu.Unlock()
	data, err := os.ReadFile(config.path)
	if errors.Is(err, os.ErrNotExist) {
		config.state = persistentConfigState{}
		return nil
	}
	if err != nil {
		return err
	}
	if len(data) == 0 {
		config.state = persistentConfigState{}
		return nil
	}
	return json.Unmarshal(data, &config.state)
}

func (config *persistentConfig) saveLocked() error {
	data, err := json.Marshal(config.state)
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(config.path), 0o700); err != nil {
		return err
	}
	tmpPath := config.path + ".tmp"
	if err := os.WriteFile(tmpPath, data, 0o600); err != nil {
		return err
	}
	return os.Rename(tmpPath, config.path)
}
