# @bitcoinerlab/bitbox-react-native

React Native native BitBox client provider for mobile Bitcoin apps.

This package is a scaffold for mobile BitBox support. It exposes a small
TypeScript API for a native BitBox client, but the native iOS/Android modules
are not implemented yet.

## Status

- JavaScript API: scaffolded.
- Expo Modules / React Native New Architecture-compatible native package
  foundation: scaffolded.
- iOS BitBox Nova BLE transport/protocol: not implemented.
- Android BitBox02 USB transport/protocol: not implemented.
- Android BitBox Nova BLE transport/protocol: not implemented.
- Expo Go support: not possible, because custom native code is required.

Do not use this package as proof that BitBox works in React Native today. It is
the starting point for the native implementation.

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
types intentionally define the native client contract locally so the package can
be used independently.

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
minimal Bitcoin-only BitBox client surface:

- `version()`
- `rootFingerprint()`
- `btcXpub(...)`
- `btcAddress(...)`
- `btcRegisterScriptConfig(...)`
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
  bitboxClient: client,
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

This repository now includes Expo Modules API placeholders for iOS and Android.
They are build-time wiring only and throw explicit "not implemented" errors for
every method. The JavaScript resolver intentionally does not fall back to legacy
`react-native` `NativeModules`. See `docs/AGENT_HANDOFF.md` before implementing
native transport or protocol code. It includes the official BitBoxApp source
pointers, BLE UUIDs, Android USB IDs, Expo config plugin requirements, and the
recommended Go/gomobile boundary.

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

The real native transport/protocol implementation is intentionally absent for
now. Until it exists, the API throws a clear error if the `BitcoinerlabBitBox`
native module is missing or if the placeholder native module is called.
