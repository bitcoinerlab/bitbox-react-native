# Agent Handoff

This repository is the starting point for `@bitcoinerlab/bitbox-react-native`, a
React Native native client package for BitBox devices. The goal is to provide a
mobile BitBox client implementation that can be used directly by mobile Bitcoin
apps and injected into descriptor/wallet libraries when their client contract is
structurally compatible.

## Current State

- TypeScript wrapper API exists in `src/`.
- Expo Modules API native modules exist for iOS and Android.
- The native foundation targets React Native's New Architecture-compatible Expo
  Modules path rather than legacy `NativeModules`/bridge modules.
- The native module is named `BitcoinerlabBitBox` on both platforms.
- iOS BitBox Nova BLE has initial CoreBluetooth transport wiring for `connect`,
  `disconnect`, `version`, and `rootFingerprint` through the Go protocol layer.
- iOS BTC methods still throw explicit not-implemented errors until Swift
  parameter serialization is wired into the Go wrapper.
- Android native methods still throw explicit not-implemented errors.
- Upstream BitBox API survey is documented in
  `docs/UPSTREAM_BITBOX_API_SURVEY.md`.
- A tiny Go wrapper package exists under `native/go` and imports upstream
  `bitbox02-api-go`.
- `native/go/build-gomobile.sh` builds gomobile artifacts into the ignored
  `native/go/build/` directory.
- A generated iOS gomobile xcframework is committed under
  `ios/Frameworks/Bitboxnative.xcframework`.
- Artifact strategy is to commit generated gomobile artifacts under platform
  package directories once they are useful, then ship them in npm releases.
- Advanced users can rebuild those artifacts with `npm run native:go:build` and
  replace the committed copies for custom builds.
- The Go wrapper exposes a gomobile-friendly mobile transport interface.
- `app.plugin.js` adds `NSBluetoothAlwaysUsageDescription` for iOS BLE. It does
  not add iOS background modes or Android permissions yet.
- Expo Modules autolinking is declared in `expo-module.config.json`.
- Bare React Native apps are acceptable hosts if they install/configure Expo
  Modules native infrastructure. A separate plain React Native
  TurboModule/codegen implementation does not exist yet.
- Calling `connectBitBox(...)` fails with a clear missing-native-module error if
  the native module is not linked. On iOS, BLE is attempted for `auto`/`ble`; on
  Android, the placeholder still throws not implemented.
- `src/types.ts` intentionally owns the native BitBox client contract. Do not
  import types from `@bitcoinerlab/descriptors` just for convenience; that would
  couple this package to descriptors and recreate dependency issues.

## Non-Goals

- Do not use WebHID in React Native.
- Do not use BitBoxBridge as the mobile path.
- Do not depend on Expo Go; it cannot load this custom native module.
- Do not add a legacy `react-native` `NativeModules` fallback unless the package
  intentionally grows a separate legacy implementation.
- Do not fake device behavior in production APIs.
- Do not change `@bitcoinerlab/descriptors` to know about React Native.
- Do not make this package depend on `@bitcoinerlab/descriptors` for types,
  tests, or examples that belong in an optional integration package/app.
- Do not expose a broad vendor API if the mobile Bitcoin client surface only
  needs the seven methods listed below.

## Public Contract

The JavaScript wrapper expects a React Native native module named
`BitcoinerlabBitBox`. Its TypeScript shape is defined by `BitBoxNativeModule` in
`src/types.ts`.

The native module must manage device/session lifetime internally and return a
session from `connect(...)`:

```ts
type BitBoxReactNativeSession = {
  id: string;
  transport: 'auto' | 'ble' | 'android-usb';
  product?: string;
  version?: string;
};
```

Every native device method receives the `sessionId` first. The wrapped client
exposed to application code removes the session argument and provides this raw
`bitbox-api`-compatible provider-client interface:

- `version(sessionId): Promise<string>`
- `rootFingerprint(sessionId): Promise<string>`
- `btcXpub(sessionId, apiNetwork, keypath, xpubType, display): Promise<string>`
- `btcAddress(sessionId, apiNetwork, keypath, scriptConfig, display): Promise<string>`
- `btcRegisterScriptConfig(sessionId, apiNetwork, scriptConfig, keypathAccount, xpubType, name?): Promise<void>`
- `btcIsScriptConfigRegistered(sessionId, apiNetwork, scriptConfig, keypathAccount?): Promise<boolean>`
- `btcSignPSBT(sessionId, apiNetwork, psbt, forceScriptConfig, formatUnit): Promise<string>`

`apiNetwork` is this package's Bitcoin-only BitBox network type:

- mainnet maps to `btc`
- testnet/signet/regtest maps to `tbtc`

Do not ask application code to pass BitBox vendor `coin` values.

Descriptors computes and passes the raw BitBox xpub arguments internally when a
mobile client is injected with `connectors.fromClient(...)`:

- `btcXpub`: `xpub` on mainnet, `tpub` on non-mainnet networks.
- `btcRegisterScriptConfig`: `autoXpubTpub`.

## Descriptors Integration

Consuming apps that use `@bitcoinerlab/descriptors` can install descriptors
separately and inject the connected native provider client:

```ts
import { connectBitBoxNovaBle } from '@bitcoinerlab/bitbox-react-native';
import {
  connectors,
  keyExpression,
  signers
} from '@bitcoinerlab/descriptors/bitbox';

const client = await connectBitBoxNovaBle();
const manager = connectors.fromClient({
  client,
  network,
  Output
});

const key = await keyExpression({ manager, keyPath: "m/84'/0'/0'" });
// Build/register/sign with @bitcoinerlab/descriptors/bitbox helpers.

await client.close();
```

Keep `@bitcoinerlab/descriptors` transport-free and device-agnostic.

## Recommended Architecture

Use a three-layer design:

1. JavaScript/TypeScript facade in this package.
2. Swift/Kotlin or Java React Native native modules for platform transport and
   session lifecycle.
3. A small Go protocol wrapper built with `gomobile bind`, using
   `bitbox02-api-go` for the BitBox protocol and BTC API.

The official BitBox mobile app already uses Go mobile bindings plus native
transport bridges. Do not embed the whole BitBoxApp backend. Create the minimum
mobile wrapper needed for the client methods in `src/types.ts`.

See `docs/UPSTREAM_BITBOX_API_SURVEY.md` for the selected upstream Go entry
points, module pin, and transport boundary.

## Official Source Pointers

Study these upstream files before implementation:

- iOS BLE transport:
  `BitBoxSwiss/bitbox-wallet-app/frontends/ios/BitBoxApp/BitBoxApp/Bluetooth.swift`
- iOS Bluetooth permissions/background mode:
  `BitBoxSwiss/bitbox-wallet-app/frontends/ios/BitBoxApp/BitBoxApp/Info.plist`
- Android USB device detection/permission:
  `BitBoxSwiss/bitbox-wallet-app/frontends/android/BitBoxApp/app/src/main/java/ch/shiftcrypto/bitboxapp/UsbDeviceManager.java`
- Android USB endpoint read/write bridge:
  `BitBoxSwiss/bitbox-wallet-app/frontends/android/BitBoxApp/app/src/main/java/ch/shiftcrypto/bitboxapp/GoViewModel.java`
- Android USB device filter:
  `BitBoxSwiss/bitbox-wallet-app/frontends/android/BitBoxApp/app/src/main/res/xml/device_filter.xml`
- Mobile Go bridge:
  `BitBoxSwiss/bitbox-wallet-app/backend/mobileserver/mobileserver.go`
- Device abstraction:
  `BitBoxSwiss/bitbox-wallet-app/backend/devices/usb/manager.go`
- Lower-level BTC API/protocol:
  `BitBoxSwiss/bitbox02-api-go/api/firmware/btc.go`

## iOS BLE Notes

Expected first target: BitBox Nova over CoreBluetooth.

Known UUIDs from official `Bluetooth.swift`:

- service: `e1511a45-f3db-44c0-82b8-6c880790d1f1`
- writer characteristic: `799d485c-d354-4ed0-b577-f8ee79ec275a`
- reader characteristic: `419572a5-9f53-4eb1-8db7-61bcab928867`
- product characteristic: `9d1c9a77-8b03-4e49-8053-3955cda7da93`

The official product mapping includes `bb02p-btconly` for BitBox02 Nova
BTC-only.

Implementation expectations:

- Use Swift and CoreBluetooth.
- Implement scan, connect, service discovery, characteristic discovery, write,
  notify/read, disconnect.
- Route raw transport bytes into the Go protocol layer.
- Surface pairing code / user confirmation through React Native events or an
  explicit callback mechanism.
- Add `NSBluetoothAlwaysUsageDescription` and any needed background mode in the
  Expo config plugin.

Do not try to make `bitbox-api` WASM work on iOS React Native.

## Android USB Notes

Expected first Android target: classic BitBox02 over Android USB Host.

Known IDs from the official app:

- vendor ID: `1003` / `0x03eb`
- product ID: `9219` / `0x2403`

Implementation expectations:

- Use Android USB Host APIs.
- Add a device filter XML for the BitBox VID/PID.
- Request USB permission before opening the device.
- Identify input/output endpoints as in official `GoViewModel.java`.
- Bridge raw read/write operations into the Go protocol layer.
- Add `android.hardware.usb.host`, USB permissions/intent filters, and device
  filter resources through the Expo config plugin.

## Android BLE Notes

Android BLE should be feasible for BitBox Nova, but it is not the first proven
path from the official Android source pointers above. Reuse the iOS BLE UUIDs
and flow, then validate on real Nova hardware.

Implementation expectations:

- Add Android Bluetooth permissions according to the target SDK.
- Use runtime permission requests for nearby devices on modern Android.
- Keep the JS API the same as iOS BLE.

## Go/Gomobile Layer

The Go layer should expose a small, stable API to native Swift/Kotlin/Java.
Go and `gomobile` are package maintainer/contributor requirements only. Normal
app consumers should not need them when installing a published package; published
native artifacts or equivalent package wiring should cover that path. Any local
install method is acceptable as long as the commands are available on `PATH`.

Suggested responsibilities:

- Pair/unlock device if required.
- Return firmware version.
- Return root fingerprint as lowercase hex string.
- Implement BTC xpub/address/register/isRegistered/signPSBT wrappers.
- Convert JS-native serialized `scriptConfig` structures into Go structures.
- Keep PSBT input/output as base64 strings to match this package's BitBox client
  contract.

Suggested constraints:

- Do not expose a generic Go command surface to JS.
- Do not include non-Bitcoin APIs.
- Do not own descriptor parsing in Go; descriptor/wallet libraries remain the JS
  policy layer.

## Expo Config Plugin Plan

`app.plugin.js` currently returns config unchanged. Once real native transport
code exists, it should add:

- iOS Bluetooth usage description.
- iOS background mode only if the native implementation truly needs it.
- Android USB host feature.
- Android BitBox USB intent filter and device filter XML.
- Android Bluetooth permissions for BLE support.
- Any package-specific native module registration required by the chosen Expo
  Modules or React Native native-module setup.

Keep the plugin minimal and deterministic.

## Testing Plan

Add tests in phases:

- TypeScript compile checks for the public API.
- Native unit tests for serialization and error handling where practical.
- Manual iOS BitBox Nova BLE smoke test on real hardware.
- Manual Android USB smoke test on real hardware.
- Manual descriptors integration test that uses `connectors.fromClient(...)` to
  derive xpubs, register/display a wallet, and sign a PSBT.

Real-device tests should not run in normal CI.

## Known Descriptor-Side BitBox Limits

The descriptors package currently guards these BitBox behaviors:

- Top-level legacy `pkh(KEY)` / P2PKH accounts are rejected for BitBox.
- Miniscript hash fragments `sha256`, `hash256`, `hash160`, and `ripemd160` are
  rejected before BitBox policy display/signing because BitBox firmware marks
  them unsupported and firmware 9.26.1 was observed to crash while deriving
  `sha256(...)`.
- Miniscript `pkh(KEY)` inside `wsh(...)` is not the same as top-level P2PKH and
  should not be rejected by the top-level legacy guard.

Keep native behavior aligned with these JS-side checks. Do not duplicate policy
parsing in native code unless absolutely necessary.

## Immediate Next Steps

1. Validate iOS BitBox Nova BLE `connect`, `version`, and `rootFingerprint` on
   physical hardware.
2. Wire iOS Swift serialization for BTC xpub/address/register/signPSBT methods
   into the existing Go wrapper.
3. Add persisted Noise pairing config instead of the current in-memory Go config.
4. Wire Android USB for classic BitBox02.
5. Validate with descriptors' `connectors.fromClient(...)` once BTC methods are
   wired.
