package bitboxnative

import (
	"errors"
	"reflect"
	"testing"

	"github.com/BitBoxSwiss/bitbox02-api-go/api/firmware"
	"github.com/BitBoxSwiss/bitbox02-api-go/api/firmware/messages"
)

func TestDisconnectedClientReturnsTransportError(t *testing.T) {
	client := NewClient()
	_, err := client.Version()
	if !errors.Is(err, errTransportNotConnected) {
		t.Fatalf("expected transport error, got %v", err)
	}
}

func TestParseKeypath(t *testing.T) {
	got, err := parseKeypath("m/84'/0'/1'/0/25")
	if err != nil {
		t.Fatal(err)
	}
	want := []uint32{
		84 + hardenedOffset,
		0 + hardenedOffset,
		1 + hardenedOffset,
		0,
		25,
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("got %v, want %v", got, want)
	}
}

func TestScriptConfigSimple(t *testing.T) {
	config, err := parseScriptConfigJSON(`{"simpleType":"p2tr"}`)
	if err != nil {
		t.Fatal(err)
	}
	if got := config.GetSimpleType(); got != messages.BTCScriptConfig_P2TR {
		t.Fatalf("got %v", got)
	}
}

func TestScriptConfigMultisigSetsScriptType(t *testing.T) {
	xpub := "xpub6ERApfZwUNrhLCkDtcHTcxd75RbzS1ed54G1LkBUHQVHQKqhMkhgbmJbZRkrgZw4koxb5JaHWkY4ALHY2grBGRjaDMzQLcgJvLJuZZvRcEL"
	config, err := parseScriptConfigJSON(`{
    "multisig": {
      "threshold": 2,
      "xpubs": [` + quote(xpub) + `, ` + quote(xpub) + `],
      "ourXpubIndex": 0,
      "scriptType": "p2wshP2sh"
    }
  }`)
	if err != nil {
		t.Fatal(err)
	}
	if got := config.GetMultisig().GetScriptType(); got != messages.BTCScriptConfig_Multisig_P2WSH_P2SH {
		t.Fatalf("got %v", got)
	}
}

func TestPSBTSignOptions(t *testing.T) {
	options, err := psbtSignOptions(`{"scriptConfig":{"simpleType":"p2wpkh"},"keypath":"m/84'/0'/0'"}`, "sat")
	if err != nil {
		t.Fatal(err)
	}
	if options.FormatUnit != messages.BTCSignInitRequest_SAT {
		t.Fatalf("unexpected format unit: %v", options.FormatUnit)
	}
	if options.ForceScriptConfig.GetScriptConfig().GetSimpleType() != messages.BTCScriptConfig_P2WPKH {
		t.Fatal("unexpected force script config")
	}
	want := []uint32{84 + hardenedOffset, 0 + hardenedOffset, 0 + hardenedOffset}
	if !reflect.DeepEqual(options.ForceScriptConfig.GetKeypath(), want) {
		t.Fatalf("got %v, want %v", options.ForceScriptConfig.GetKeypath(), want)
	}
}

func TestBTCXPubTypeDerivesFromCoin(t *testing.T) {
	if got := btcXpubType(messages.BTCCoin_BTC); got != messages.BTCPubRequest_XPUB {
		t.Fatalf("got %v, want %v", got, messages.BTCPubRequest_XPUB)
	}
	if got := btcXpubType(messages.BTCCoin_TBTC); got != messages.BTCPubRequest_TPUB {
		t.Fatalf("got %v, want %v", got, messages.BTCPubRequest_TPUB)
	}
}

func TestClientCloseWithoutDevice(t *testing.T) {
	NewClient().Close()
}

func TestUpstreamHelperStillParsesXpub(t *testing.T) {
	_, err := firmware.NewXPub("not-an-xpub")
	if err == nil {
		t.Fatal("expected invalid xpub error")
	}
}

func quote(value string) string {
	return `"` + value + `"`
}
