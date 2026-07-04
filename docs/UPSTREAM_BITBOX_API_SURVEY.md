# Upstream BitBox API Survey

Survey date: 2026-07-03

## Sources Inspected

- `BitBoxSwiss/bitbox02-api-go` at commit
  `54ce69d38ae338a91a59ea73bf2dfee342c14284`.
- `BitBoxSwiss/bitbox-wallet-app` at commit
  `c277c0f4903786479e3d0a3416652a9ff99dfa65`.
- `bitbox-wallet-app/go.mod` pins `bitbox02-api-go` as
  `v0.0.0-20260701210453-54ce69d38ae3`.

Key files inspected:

- `bitbox02-api-go/api/firmware/device.go`
- `bitbox02-api-go/api/firmware/pairing.go`
- `bitbox02-api-go/api/firmware/btc.go`
- `bitbox02-api-go/api/firmware/psbt.go`
- `bitbox02-api-go/communication/u2fhid/u2fhid.go`
- `bitbox-wallet-app/backend/mobileserver/mobileserver.go`
- `bitbox-wallet-app/backend/devices/usb/manager.go`
- `bitbox-wallet-app/frontends/ios/BitBoxApp/BitBoxApp/Bluetooth.swift`
- `bitbox-wallet-app/frontends/android/BitBoxApp/app/src/main/java/ch/shiftcrypto/bitboxapp/UsbDeviceManager.java`
- `bitbox-wallet-app/frontends/android/BitBoxApp/app/src/main/java/ch/shiftcrypto/bitboxapp/GoViewModel.java`

## Decision

Use `github.com/BitBoxSwiss/bitbox02-api-go` directly. Do not import or embed
`bitbox-wallet-app` backend packages.

`bitbox-wallet-app/backend/mobileserver` is useful as a gomobile reference, but
it exposes the whole BitBoxApp backend and UI API. This package needs only a
small BitBox client boundary, so depending on the full app backend would add too
much surface area.

This repo should own only:

- React Native / Expo module API shape.
- iOS CoreBluetooth and Android USB/BLE transport adapters.
- Session lifecycle and JS/native serialization.
- A tiny Go wrapper around upstream `bitbox02-api-go`.
- Noise pairing config only where required by the chosen transport/UX.

This repo should not own:

- BitBox protocol state machine.
- Noise pairing internals.
- U2F HID framing.
- Bitcoin signing protocol details.
- Copied protobuf or firmware message implementations.
- BitBoxApp wallet/backend policy logic.

## Proposed Go Module Pin

When adding the Go wrapper, start with this module pin:

```go
module github.com/bitcoinerlab/bitbox-react-native/native/go

go 1.26

require github.com/BitBoxSwiss/bitbox02-api-go v0.0.0-20260701210453-54ce69d38ae3
```

This pin was verified with `go mod tidy`, `go test ./...`, and the gomobile
build script's `iossimulator` and `ios,iossimulator` targets. The initial iOS
gomobile artifact is committed at `ios/Frameworks/Bitboxnative.xcframework`.

Expected direct imports for the first wrapper:

- `github.com/BitBoxSwiss/bitbox02-api-go/api/common`
- `github.com/BitBoxSwiss/bitbox02-api-go/api/firmware`
- `github.com/BitBoxSwiss/bitbox02-api-go/api/firmware/messages`
- `github.com/BitBoxSwiss/bitbox02-api-go/communication/u2fhid`
- `github.com/BitBoxSwiss/bitbox02-api-go/util/semver`
- `github.com/btcsuite/btcd/btcutil/psbt`
- `github.com/flynn/noise`

## Thin Transport Boundary

The best boundary is native platform transport as `io.ReadWriteCloser`, then Go
wraps it with upstream U2F HID framing:

```go
communication := u2fhid.NewCommunication(readWriteCloser, 0xc1)
device := firmware.NewDevice(
  version,
  &product,
  config,
  communication,
  logger,
  firmware.WithOptionalNoisePairingConfirmation(isBluetooth),
)
```

Notes:

- `0xc1` is the BitBox02 command byte used by BitBoxApp for firmware devices.
- Android USB can adapt `UsbDeviceConnection.bulkTransfer` to `Read/Write/Close`.
- iOS BLE can adapt CoreBluetooth notifications/writes to `Read/Write/Close`.
- BitBoxApp uses the same shape for mobile, including BLE pretending to be a
  device info object that opens a read/write/close transport.
- `u2fhid.NewCommunication` should remain in Go so Swift/Kotlin do not duplicate
  U2F HID framing.

## Upstream Method Mapping

| JS native method                   | Upstream Go call                                                                              |
| ---------------------------------- | --------------------------------------------------------------------------------------------- |
| `connect(params)`                  | Open native transport, create `u2fhid.Communication`, create `firmware.Device`, call `Init()` |
| `disconnect(sessionId)`            | `device.Close()`                                                                              |
| `version(sessionId)`               | `device.Version().String()`                                                                   |
| `rootFingerprint(sessionId)`       | `device.RootFingerprint()`, hex-encode 4 bytes                                                |
| `btcXpub(...)`                     | `device.BTCXPub(...)`                                                                         |
| `btcAddress(...)`                  | `device.BTCAddress(...)`                                                                      |
| `btcRegisterScriptConfig(...)`     | `device.BTCRegisterScriptConfig(...)`                                                         |
| `btcIsScriptConfigRegistered(...)` | `device.BTCIsScriptConfigRegistered(...)`                                                     |
| `btcSignPSBT(...)`                 | Parse base64 PSBT, call `device.BTCSignPSBT(...)`, serialize base64 PSBT                      |

The JS contract mirrors the raw `bitbox-api` provider-client boundary for
Bitcoin methods. Descriptors computes and passes the xpub arguments internally
when a mobile client is injected with `connectors.fromClient(...)`:

- `btcXpub`: `xpub` on mainnet, `tpub` on non-mainnet networks.
- `btcRegisterScriptConfig`: `autoXpubTpub`.

The Go wrapper converts `btcXpub`'s `xpubType` into the upstream protobuf enum.
Current upstream Go `BTCRegisterScriptConfig` does not take an xpub type, so the
wrapper accepts the argument for provider compatibility and ignores it.

## Type Conversion Boundary

The Go wrapper should convert this package's structural JS types into upstream
protobuf message types:

| JS type/value              | Upstream type/value                            |
| -------------------------- | ---------------------------------------------- |
| `apiNetwork: 'btc'`        | `messages.BTCCoin_BTC`                         |
| `apiNetwork: 'tbtc'`       | `messages.BTCCoin_TBTC`                        |
| `simpleType: 'p2wpkhP2sh'` | `messages.BTCScriptConfig_P2WPKH_P2SH`         |
| `simpleType: 'p2wpkh'`     | `messages.BTCScriptConfig_P2WPKH`              |
| `simpleType: 'p2tr'`       | `messages.BTCScriptConfig_P2TR`                |
| `scriptType: 'p2wsh'`      | `messages.BTCScriptConfig_Multisig_P2WSH`      |
| `scriptType: 'p2wshP2sh'`  | `messages.BTCScriptConfig_Multisig_P2WSH_P2SH` |
| `formatUnit: 'default'`    | `messages.BTCSignInitRequest_DEFAULT`          |
| `formatUnit: 'sat'`        | `messages.BTCSignInitRequest_SAT`              |

Useful upstream helpers:

- `firmware.NewBTCScriptConfigSimple(...)`
- `firmware.NewBTCScriptConfigMultisig(...)`
- `firmware.NewBTCScriptConfigPolicy(...)`
- `firmware.NewXPub(...)`

`NewBTCScriptConfigMultisig` currently leaves `ScriptType` at the protobuf
default (`P2WSH`). The wrapper must set `ScriptType` explicitly for
`p2wshP2sh`.

The wrapper should own only small conversion helpers:

- Parse keypaths from `m/...` strings or number arrays into `[]uint32`.
- Convert xpub strings to upstream `messages.XPub` through `firmware.NewXPub`.
- Convert policy keys to `messages.KeyOriginInfo`.
- Convert PSBT base64 to/from `*psbt.Packet`.

## Pairing Boundary

`firmware.Device.Init()` owns unlock, attestation, and Noise pairing. Pairing
state is surfaced through:

- `device.SetOnEvent(...)`
- `firmware.EventChannelHashChanged`
- `device.ChannelHash()`
- `device.ChannelHashVerify(ok)`
- `device.Status()`

The Go wrapper should expose a small event/callback bridge to native code and a
pairing confirmation method. The public JS `onPairingCode` flow should be wired
on top of that later; do not add a generic command channel.

For BLE, the wrapper passes
`firmware.WithOptionalNoisePairingConfirmation(true)`. Upstream documents this
option as appropriate only when the Noise channel is wrapped in another secure
transport, such as paired Bluetooth. In that mode, app-side trust of the device
Noise static pubkey is intentionally optional; if the device still requires its
own pairing confirmation, `Init()` enters `StatusUnpaired` and the wrapper only
calls `ChannelHashVerify(true)` after the device-side verification query has
succeeded.

The current in-memory `ConfigInterface` therefore does not block the proven iOS
BitBox Nova BLE reconnect path. Persisted Noise config remains a deliberate
future design item for non-BLE transports, explicit app-side pairing UX, or if
physical-device testing reveals a BLE case that cannot rely on platform
Bluetooth pairing/bonding alone.

## Open Implementation Risks

- A reproducible gomobile build script exists. The initial generated iOS
  artifact is committed at `ios/Frameworks/Bitboxnative.xcframework`; Android
  artifact paths are still pending.
- The exact JS pairing UX still needs a small design pass for non-BLE or app-side
  pairing confirmation flows. The initial iOS BLE path auto-confirms app-side
  pairing after device-side confirmation, matching upstream Bluetooth guidance.
- The current Go pairing config is in-memory. Persist it only after defining the
  exact non-BLE or explicit pairing UX requirement.
- Real behavior must be validated on physical BitBox Nova BLE and BitBox02 USB
  devices.
