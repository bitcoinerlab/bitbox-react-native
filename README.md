# @bitcoinerlab/bitbox-react-native

React Native native BitBox client provider for mobile Bitcoin apps.

This package is an early mobile BitBox implementation. It exposes a small
TypeScript API for a native BitBox client and has working iOS BitBox Nova BLE
transport wiring, but it is not production-ready yet.

## Status

- JavaScript API: scaffolded.
- Expo Modules / React Native New Architecture-compatible native package
  foundation: scaffolded.
- iOS BitBox Nova BLE `connect`, `disconnect`, `version`, `rootFingerprint`,
  and non-displaying `btcXpub`: wired through CoreBluetooth, gomobile, and
  `bitbox02-api-go`; smoke-tested on physical hardware.
- iOS `btcAddress`, `btcRegisterScriptConfig`, `btcIsScriptConfigRegistered`,
  and `btcSignPSBT`: wired through the gomobile Go wrapper and compile-checked;
  still need physical hardware validation.
- Android BitBox02 USB transport/protocol: not implemented.
- Android BitBox Nova BLE transport/protocol: not implemented.
- Expo Go support: not possible, because custom native code is required.

Do not treat this package as production-ready BitBox support until every native
method and target transport has been validated on real devices.

## Why This Package Exists

Browser and desktop BitBox integrations can use `bitbox-api`, WebHID, or
BitBoxBridge. React Native mobile apps cannot rely on those transports.

The mobile path needs native code:

- iOS: CoreBluetooth for BitBox Nova BLE.
- Android: USB Host for classic BitBox02, and likely native BLE for BitBox Nova.
- Protocol layer: preferably `bitbox02-api-go` via `gomobile bind`, mirroring
  the official BitBoxApp approach.

Descriptor and wallet libraries should stay transport-free. Apps can inject this
native client into those libraries when their client contract is structurally
compatible.

## Installation

```sh
npm install @bitcoinerlab/bitbox-react-native
```

This package will require a React Native app that can load custom native code.
It can be a bare React Native app with Expo Modules installed/configured, or an
Expo prebuild/dev-client/EAS build. It will not work in Expo Go.

The native foundation uses Expo Modules API rather than legacy React Native
`NativeModules` wiring. A bare React Native app does not need to use the Expo
managed workflow, but it does need the Expo Modules native infrastructure. A
separate plain React Native TurboModule/codegen implementation is not included.

This package does not depend on `@bitcoinerlab/descriptors`. Its TypeScript
types intentionally define the BitBox provider-client contract locally so the
package can be used independently.

## API

```ts
import { connectBitBoxNovaBle } from '@bitcoinerlab/bitbox-react-native';

const client = await connectBitBoxNovaBle();

try {
  const fingerprint = await client.rootFingerprint();
  const version = await client.version();
} finally {
  await client.close();
}
```

Current connection helpers:

- `connectBitBox(params?)`: native transport auto-selection.
- `connectBitBoxNovaBle(params?)`: iOS/Android BLE intent for BitBox Nova.
- `connectBitBoxAndroidUsb(params?)`: Android USB intent for classic BitBox02.
- `ReactNativeBitBoxClient`: thin wrapper around the native module session.

The native module is named `BitcoinerlabBitBox` and is expected to expose this
Bitcoin-only, raw `bitbox-api`-compatible provider-client surface:

- `version()`
- `rootFingerprint()`
- `btcXpub(apiNetwork, keypath, xpubType, display)`
- `btcAddress(...)`
- `btcRegisterScriptConfig(apiNetwork, scriptConfig, keypathAccount, xpubType, name?)`
- `btcIsScriptConfigRegistered(...)`
- `btcSignPSBT(...)`

## Optional Descriptors Integration

Apps that use `@bitcoinerlab/descriptors` can install it separately and inject
the connected client with `connectors.fromClient(...)`:

```sh
npm install @bitcoinerlab/descriptors
```

```ts
import { connectBitBoxNovaBle } from '@bitcoinerlab/bitbox-react-native';
import { connectors } from '@bitcoinerlab/descriptors/bitbox';

const client = await connectBitBoxNovaBle();

const manager = connectors.fromClient({
  client,
  network,
  Output
});

try {
  // Use manager with keyExpression/registerWallet/signers from
  // @bitcoinerlab/descriptors/bitbox.
} finally {
  await client.close();
}
```

## Native Implementation

This repository includes an Expo Modules API native module for iOS and Android.
The iOS module has CoreBluetooth transport wiring for BitBox Nova and uses the
vendored gomobile framework at `ios/Frameworks/Bitboxnative.xcframework` for the
BitBox protocol. A local dev-client smoke app has validated connect/version/root
fingerprint and non-displaying xpub retrieval on a physical iPhone plus BitBox
Nova. Android remains placeholder-only. The JavaScript resolver intentionally
does not fall back to legacy `react-native` `NativeModules`.

## Development

```sh
npm install
npm run build
npm run lint
```

Go and `gomobile` are developer-only requirements for contributors working on
the native Go wrapper or regenerating mobile bindings. They should not be needed
by normal app developers installing a published package. Any installation method
is fine as long as `go` and `gomobile` are available on `PATH`.

For simplicity, generated gomobile artifacts are committed and published in the
npm package once they are useful. Normal app developers should get those
prebuilt artifacts from npm. Advanced users can rebuild them with
`npm run native:go:build -- <target>` and replace the committed artifacts if
they need a custom build.

The API throws a clear error if the `BitcoinerlabBitBox` native module is
missing or if an unwired platform method is called.
