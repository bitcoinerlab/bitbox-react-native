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
- iOS BitBox Nova BLE has CoreBluetooth transport wiring for `connect`,
  `disconnect`, `version`, and `rootFingerprint` through the Go protocol layer.
- iOS BTC methods serialize Swift/JS parameters into the Go wrapper for
  `btcXpub`, `btcAddress`, `btcRegisterScriptConfig`,
  `btcIsScriptConfigRegistered`, `btcSignPSBT`, and `btcSignMessage`, and have
  been validated on physical iPhone plus BitBox Nova hardware.
- Android BLE and USB native methods are wired through Kotlin transports,
  gomobile, and `bitbox02-api-go`; USB has a native app-side pairing-code dialog.
  Approved USB Noise pairing state is persisted in app-private storage. Android
  USB and BLE have been validated on physical Android hardware through the
  integration app.
- Upstream BitBox API survey is documented in
  `docs/UPSTREAM_BITBOX_API_SURVEY.md`.
- A tiny Go wrapper package exists under `native/go` and imports upstream
  `bitbox02-api-go`.
- `native/go/build-gomobile.sh` builds gomobile artifacts into the ignored
  `native/go/build/` directory.
- A generated iOS gomobile xcframework is committed under
  `ios/Frameworks/Bitboxnative.xcframework`.
- A generated Android gomobile AAR is committed under
  `android/libs/bitboxnative-android.aar`.
- Artifact strategy is to commit generated gomobile artifacts under platform
  package directories once they are useful, then ship them in npm releases.
- Advanced users can rebuild those artifacts with `npm run native:go:build` and
  replace the committed copies for custom builds.
- The Go wrapper exposes a gomobile-friendly mobile transport interface.
- `app.plugin.js` adds `NSBluetoothAlwaysUsageDescription` for iOS BLE, Android
  Bluetooth permissions/features, Android USB host feature, and the BitBox USB
  attached intent filter metadata. It does not add iOS background modes.
- Expo Modules autolinking is declared in `expo-module.config.json`.
- `expo-module.config.json` must keep iOS `podspecPath` and `swiftModuleName`
  explicit because the podspec lives at the package root. Without those fields,
  CocoaPods can still link the pod through React Native autolinking while Expo
  Modules omits `BitcoinerlabBitBoxModule` from `ExpoModulesProvider.swift`,
  causing `requireNativeModule('BitcoinerlabBitBox')` to fail at runtime.
- `BitcoinerlabBitBoxReactNative.podspec` intentionally limits source files to
  `ios/*.swift` and adds framework search paths for the vendored gomobile
  `Bitboxnative.xcframework`. Avoid broad `ios/**/*` source globs plus
  `exclude_files = 'ios/Frameworks/**'`; that combination caused the Swift pod
  target to miss the vendored framework during integration testing.
- Bare React Native apps are acceptable hosts if they install/configure Expo
  Modules native infrastructure. A separate plain React Native
  TurboModule/codegen implementation does not exist yet.
- Calling `connectBitBoxNovaBle(...)` or `connectBitBoxUsb(...)` fails with a
  clear missing-native-module error if the native module is not linked. On iOS,
  only the BLE helper is supported. On Android, both explicit connect paths are
  wired and validated on physical hardware.
- `src/types.ts` intentionally owns the native BitBox client contract. Do not
  import types from `@bitcoinerlab/descriptors` just for convenience; that would
  couple this package to descriptors and recreate dependency issues.
- The separate `bitbox-rn-integration` Expo dev-client app validated iOS BitBox
  Nova BLE
  `connect`, `version`, `rootFingerprint`, `btcXpub`, `btcAddress`,
  `btcRegisterScriptConfig`, `btcIsScriptConfigRegistered`, `btcSignPSBT`, and
  `btcSignMessage` on physical hardware. It also validated descriptors
  sortedmulti registration/display and generic ordered `wsh(multi(...))`
  display/signing on physical hardware. Pairing UX is currently acceptable for
  the tested BLE reconnect path because the wrapper uses upstream optional Noise
  pairing confirmation over paired Bluetooth. A persisted Noise config backend is
  not designed yet and should be added only for a concrete non-BLE or explicit
  app-side pairing UX need.
- The separate integration app has buttons for read-only address derivation,
  device-displayed address derivation, multisig registration/isRegistered,
  fake-PSBT generation/signing, and shareable logs.
- The same integration app has validated Android USB on physical hardware,
  including connection, pairing, provider-client calls, descriptor-backed wallet
  flows, PSBT signing, and message signing.
- The same integration app has validated Android BLE on physical hardware,
  including connection, pairing, provider-client calls, descriptor-backed wallet
  flows, PSBT signing and message signing.

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
  needs the methods listed below.

## Public Contract

The JavaScript wrapper expects a React Native native module named
`BitcoinerlabBitBox`. Its internal TypeScript shape is `BitBoxNativeBridge` in
`src/types.ts`; do not export this native bridge as public package API.

JS serializes complex BitBox request payloads to JSON before calling native code.
This keeps Android parameter passing predictable because the React Native bridge
does not have to convert nested objects that may contain `undefined`.

The native module must manage device/session lifetime internally and return a
session from `connectBle(...)` or `connectUsb(...)`:

```ts
type BitBoxReactNativeSession = {
  id: string;
  transport: 'ble' | 'usb';
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
- `btcSignMessage(sessionId, apiNetwork, scriptConfigWithKeypath, message): Promise<BitBoxMessageSignature>`

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
  registerPolicy,
  signers
} from '@bitcoinerlab/descriptors/bitbox';

const client = await connectBitBoxNovaBle();
const store = {};
const session = connectors.fromClient({
  client,
  network,
  store
});

const key = await keyExpression({
  session,
  originPath: "/84'/0'/0'",
  keyPath: '/0/*'
});
// Build descriptors and pass them to registerPolicy/displayAddress/signers.
// Persist JSON.stringify(store) or JSON.stringify(session.store), not session.

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

Relevant upstream source references:

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

First target: BitBox Nova over CoreBluetooth.

Known UUIDs from official `Bluetooth.swift`:

- service: `e1511a45-f3db-44c0-82b8-6c880790d1f1`
- writer characteristic: `799d485c-d354-4ed0-b577-f8ee79ec275a`
- reader characteristic: `419572a5-9f53-4eb1-8db7-61bcab928867`
- product characteristic: `9d1c9a77-8b03-4e49-8053-3955cda7da93`

The official product mapping includes `bb02p-btconly` for BitBox02 Nova
BTC-only.

Implementation shape:

- Use Swift and CoreBluetooth.
- Implement scan, connect, service discovery, characteristic discovery, write,
  notify/read, disconnect.
- Route raw transport bytes into the Go protocol layer.
- Surface pairing code / user confirmation through React Native events or an
  explicit callback mechanism only if a transport/UX actually requires app-side
  Noise pairing confirmation.
- Add `NSBluetoothAlwaysUsageDescription` and any needed background mode in the
  Expo config plugin.

Do not try to make `bitbox-api` WASM work on iOS React Native.

## Android Transport Goal

Android supports both USB and BLE so apps can choose the transport that fits the
user's device and situation. Keep the public API explicit:
`connectBitBoxUsb(...)` for USB and `connectBitBoxNovaBle(...)` for BLE. USB is
Android-only for now, but the public helper name is platform-neutral so future
iOS USB support would not need a new app-facing API. Do not add automatic USB/BLE
fallback inside this package.

Android USB and BLE are wired and physically validated through the integration
app.

## Android USB Notes

Android USB target: classic BitBox02 and BitBox Nova over Android USB Host where
the hardware exposes the same BitBox USB interface.

Known IDs from the official app:

- vendor ID: `1003` / `0x03eb`
- product ID: `9219` / `0x2403`

Implemented shape:

- Use Android USB Host APIs.
- Add a device filter XML for the BitBox VID/PID.
- Request USB permission before opening the device.
- Identify input/output endpoints as in official `GoViewModel.java`.
- Bridge raw read/write operations into the Go protocol layer.
- Add `android.hardware.usb.host`, USB permissions/intent filters, and device
  filter resources through the Expo config plugin.
- Physical Android USB validation has covered connection, pairing,
  provider-client calls, descriptor-backed wallet flows, PSBT signing, and
  message signing through the integration app.

## Android BLE Notes

Android BLE target: BitBox Nova. The transport is wired and physically validated
through the integration app.

Implemented shape:

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
- Maintain BTC xpub/address/register/isRegistered/signPSBT wrappers.
- Convert JS-native serialized `scriptConfig` structures into Go structures.
- Keep PSBT input/output as base64 strings to match this package's BitBox client
  contract.

Suggested constraints:

- Do not expose a generic Go command surface to JS.
- Do not include non-Bitcoin APIs.
- Do not own descriptor parsing in Go; descriptor/wallet libraries remain the JS
  policy layer.

Pairing/config note:

- `NewClientWithMobileTransport(..., isBluetooth: true)` passes
  `firmware.WithOptionalNoisePairingConfirmation(true)`, matching upstream's
  guidance for Noise over paired Bluetooth.
- The current `newMemoryConfig()` is acceptable for the iOS BLE path tested on
  physical hardware. It intentionally does not create package-owned
  storage without a defined storage key, reset UX, and transport requirement.
- Android USB uses a persisted `firmware.ConfigInterface` backed by an
  app-private JSON file. Add broader reset/export UX only if a concrete app need
  appears.

## Expo Config Plugin

`app.plugin.js` currently adds only the native configuration required by the
implemented transports:

- iOS background mode only if the native implementation truly needs it.
- Android USB host feature, BitBox USB intent filter, and device filter XML.
- Android Bluetooth permissions and BLE feature declaration for BLE support.
- Any package-specific native module registration required by the chosen Expo
  Modules or React Native native-module setup.

Keep the plugin minimal and deterministic.

## Testing Plan

Add tests in phases:

- TypeScript compile checks for the public API.
- Native unit tests for serialization and error handling where practical.
- Manual iOS BitBox Nova BLE integration test on real hardware for each native
  method.
- Manual Android USB integration test on real hardware. Current status:
  validated through the integration app.
- Manual Android BitBox Nova BLE integration test on real hardware. Current
  status: validated through the integration app.
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

1. Decide whether USB/app-side pairing confirmation needs reset/export UX beyond
   app-private persisted Noise config.
