package bitboxnative

import (
	"bytes"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"strconv"
	"strings"

	"github.com/BitBoxSwiss/bitbox02-api-go/api/firmware"
	"github.com/BitBoxSwiss/bitbox02-api-go/api/firmware/messages"
	"github.com/btcsuite/btcd/btcutil/psbt"
)

const hardenedOffset = uint32(0x80000000)

type keyOriginInfoJSON struct {
	RootFingerprint string `json:"rootFingerprint"`
	Keypath         string `json:"keypath"`
	Xpub            string `json:"xpub"`
}

type multisigScriptConfigJSON struct {
	Threshold    uint32   `json:"threshold"`
	Xpubs        []string `json:"xpubs"`
	OurXpubIndex uint32   `json:"ourXpubIndex"`
	ScriptType   string   `json:"scriptType"`
}

type policyScriptConfigJSON struct {
	Policy string              `json:"policy"`
	Keys   []keyOriginInfoJSON `json:"keys"`
}

type scriptConfigJSON struct {
	SimpleType string                    `json:"simpleType"`
	Multisig   *multisigScriptConfigJSON `json:"multisig"`
	Policy     *policyScriptConfigJSON   `json:"policy"`
}

type scriptConfigWithKeypathJSON struct {
	ScriptConfig scriptConfigJSON `json:"scriptConfig"`
	Keypath      string           `json:"keypath"`
}

func invalidValueError(name string, value string) error {
	return fmt.Errorf("invalid %s: %q", name, value)
}

func parseOptionalKeypath(value string) ([]uint32, error) {
	if strings.TrimSpace(value) == "" {
		return nil, nil
	}
	return parseKeypath(value)
}

func parseKeypath(value string) ([]uint32, error) {
	value = strings.TrimSpace(value)
	if value == "" {
		return nil, invalidValueError("keypath", value)
	}
	if value == "m" {
		return []uint32{}, nil
	}
	if !strings.HasPrefix(value, "m/") {
		return nil, invalidValueError("keypath", value)
	}

	parts := strings.Split(strings.TrimPrefix(value, "m/"), "/")
	keypath := make([]uint32, len(parts))
	for index, part := range parts {
		hardened := strings.HasSuffix(part, "'") || strings.HasSuffix(part, "h") || strings.HasSuffix(part, "H")
		part = strings.TrimSuffix(strings.TrimSuffix(strings.TrimSuffix(part, "'"), "h"), "H")
		if part == "" {
			return nil, invalidValueError("keypath", value)
		}
		child, err := strconv.ParseUint(part, 10, 31)
		if err != nil {
			return nil, invalidValueError("keypath", value)
		}
		keypath[index] = uint32(child)
		if hardened {
			keypath[index] += hardenedOffset
		}
	}
	return keypath, nil
}

func btcXpubType(value string) (messages.BTCPubRequest_XPubType, error) {
	switch value {
	case "tpub":
		return messages.BTCPubRequest_TPUB, nil
	case "xpub":
		return messages.BTCPubRequest_XPUB, nil
	case "ypub":
		return messages.BTCPubRequest_YPUB, nil
	case "zpub":
		return messages.BTCPubRequest_ZPUB, nil
	case "vpub":
		return messages.BTCPubRequest_VPUB, nil
	case "upub":
		return messages.BTCPubRequest_UPUB, nil
	case "Vpub":
		return messages.BTCPubRequest_CAPITAL_VPUB, nil
	case "Zpub":
		return messages.BTCPubRequest_CAPITAL_ZPUB, nil
	case "Upub":
		return messages.BTCPubRequest_CAPITAL_UPUB, nil
	case "Ypub":
		return messages.BTCPubRequest_CAPITAL_YPUB, nil
	default:
		return 0, invalidValueError("xpubType", value)
	}
}

func formatUnit(value string) (messages.BTCSignInitRequest_FormatUnit, error) {
	switch value {
	case "default", "":
		return messages.BTCSignInitRequest_DEFAULT, nil
	case "sat":
		return messages.BTCSignInitRequest_SAT, nil
	default:
		return 0, invalidValueError("formatUnit", value)
	}
}

func parseScriptConfigJSON(value string) (*messages.BTCScriptConfig, error) {
	var parsed scriptConfigJSON
	if err := json.Unmarshal([]byte(value), &parsed); err != nil {
		return nil, err
	}
	return scriptConfig(parsed)
}

func scriptConfig(parsed scriptConfigJSON) (*messages.BTCScriptConfig, error) {
	setFields := 0
	if parsed.SimpleType != "" {
		setFields++
	}
	if parsed.Multisig != nil {
		setFields++
	}
	if parsed.Policy != nil {
		setFields++
	}
	if setFields != 1 {
		return nil, fmt.Errorf("scriptConfig must set exactly one variant")
	}

	if parsed.SimpleType != "" {
		typ, err := simpleScriptType(parsed.SimpleType)
		if err != nil {
			return nil, err
		}
		return firmware.NewBTCScriptConfigSimple(typ), nil
	}
	if parsed.Multisig != nil {
		return multisigScriptConfig(parsed.Multisig)
	}
	return policyScriptConfig(parsed.Policy)
}

func simpleScriptType(value string) (messages.BTCScriptConfig_SimpleType, error) {
	switch value {
	case "p2wpkhP2sh":
		return messages.BTCScriptConfig_P2WPKH_P2SH, nil
	case "p2wpkh":
		return messages.BTCScriptConfig_P2WPKH, nil
	case "p2tr":
		return messages.BTCScriptConfig_P2TR, nil
	default:
		return 0, invalidValueError("simpleType", value)
	}
}

func multisigScriptConfig(parsed *multisigScriptConfigJSON) (*messages.BTCScriptConfig, error) {
	config, err := firmware.NewBTCScriptConfigMultisig(parsed.Threshold, parsed.Xpubs, parsed.OurXpubIndex)
	if err != nil {
		return nil, err
	}
	multisig := config.GetMultisig()
	if multisig == nil {
		return nil, fmt.Errorf("unexpected multisig script config")
	}
	scriptType, err := multisigScriptType(parsed.ScriptType)
	if err != nil {
		return nil, err
	}
	multisig.ScriptType = scriptType
	return config, nil
}

func multisigScriptType(value string) (messages.BTCScriptConfig_Multisig_ScriptType, error) {
	switch value {
	case "p2wsh":
		return messages.BTCScriptConfig_Multisig_P2WSH, nil
	case "p2wshP2sh":
		return messages.BTCScriptConfig_Multisig_P2WSH_P2SH, nil
	default:
		return 0, invalidValueError("scriptType", value)
	}
}

func policyScriptConfig(parsed *policyScriptConfigJSON) (*messages.BTCScriptConfig, error) {
	keys := make([]*messages.KeyOriginInfo, len(parsed.Keys))
	for index, key := range parsed.Keys {
		converted, err := keyOriginInfo(key)
		if err != nil {
			return nil, err
		}
		keys[index] = converted
	}
	return firmware.NewBTCScriptConfigPolicy(parsed.Policy, keys), nil
}

func keyOriginInfo(parsed keyOriginInfoJSON) (*messages.KeyOriginInfo, error) {
	xpub, err := firmware.NewXPub(parsed.Xpub)
	if err != nil {
		return nil, err
	}
	var rootFingerprint []byte
	if parsed.RootFingerprint != "" {
		rootFingerprint, err = hex.DecodeString(parsed.RootFingerprint)
		if err != nil {
			return nil, err
		}
		if len(rootFingerprint) != 4 {
			return nil, fmt.Errorf("rootFingerprint must be 4 bytes")
		}
	}
	keypath, err := parseOptionalKeypath(parsed.Keypath)
	if err != nil {
		return nil, err
	}
	return &messages.KeyOriginInfo{
		RootFingerprint: rootFingerprint,
		Keypath:         keypath,
		Xpub:            xpub,
	}, nil
}

func psbtSignOptions(forceScriptConfigJSON string, formatUnitValue string) (*firmware.PSBTSignOptions, error) {
	unit, err := formatUnit(formatUnitValue)
	if err != nil {
		return nil, err
	}
	options := &firmware.PSBTSignOptions{FormatUnit: unit}
	if strings.TrimSpace(forceScriptConfigJSON) == "" {
		return options, nil
	}

	var parsed scriptConfigWithKeypathJSON
	if err := json.Unmarshal([]byte(forceScriptConfigJSON), &parsed); err != nil {
		return nil, err
	}
	scriptConfig, err := scriptConfig(parsed.ScriptConfig)
	if err != nil {
		return nil, err
	}
	keypath, err := parseKeypath(parsed.Keypath)
	if err != nil {
		return nil, err
	}
	options.ForceScriptConfig = &messages.BTCScriptConfigWithKeypath{
		ScriptConfig: scriptConfig,
		Keypath:      keypath,
	}
	return options, nil
}

func parseScriptConfigWithKeypathJSON(value string) (*messages.BTCScriptConfigWithKeypath, error) {
	var parsed scriptConfigWithKeypathJSON
	if err := json.Unmarshal([]byte(value), &parsed); err != nil {
		return nil, err
	}
	scriptConfig, err := scriptConfig(parsed.ScriptConfig)
	if err != nil {
		return nil, err
	}
	keypath, err := parseKeypath(parsed.Keypath)
	if err != nil {
		return nil, err
	}
	return &messages.BTCScriptConfigWithKeypath{
		ScriptConfig: scriptConfig,
		Keypath:      keypath,
	}, nil
}

func parsePSBTBase64(value string) (*psbt.Packet, error) {
	return psbt.NewFromRawBytes(bytes.NewBufferString(value), true)
}

func encodePSBTBase64(packet *psbt.Packet) (string, error) {
	return packet.B64Encode()
}
