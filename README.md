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
  `btcXpub`, `btcAddress`, `btcRegisterScriptConfig`,
  `btcIsScriptConfigRegistered`, `btcSignPSBT`, and `btcSignMessage`: wired
  through CoreBluetooth, gomobile, and `bitbox02-api-go`. The current native
  method set except `btcSignMessage` has been integration-tested on physical
  hardware; message signing still needs physical validation.
- Android BitBox02 USB transport/protocol: not implemented.
- Android BitBox Nova BLE transport/protocol: not implemented.
- Expo Go support: not possible, because custom native code is required.

Do not treat this package as production-ready BitBox support until descriptor
integration and target transports have been validated on real devices.

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

This package contains custom native code. It works in apps that can build and
load native modules, such as Expo development builds, EAS builds, Expo prebuild
apps, or bare React Native apps with Expo Modules installed. It does not work in
Expo Go.

### Expo Development Builds / EAS

```sh
npx expo install @bitcoinerlab/bitbox-react-native
```

If you are creating a local development build, install `expo-dev-client` too:

```sh
npx expo install expo-dev-client
```

Add this package's config plugin to your Expo app config:

```json
{
  "expo": {
    "plugins": ["@bitcoinerlab/bitbox-react-native"]
  }
}
```

If the same app config also uses `expo-dev-client`, include both plugins:

```json
{
  "expo": {
    "plugins": ["expo-dev-client", "@bitcoinerlab/bitbox-react-native"]
  }
}
```

Expo autolinking links this native module automatically after installation, but
Expo does not generally add third-party config plugins to `app.json` for you.
The plugin is required on iOS because it adds
`NSBluetoothAlwaysUsageDescription`, which CoreBluetooth needs before the app can
scan for and connect to a BitBox Nova.

After installing the package or changing the plugin list, rebuild the native app.
A Metro reload is not enough for native module or `Info.plist` changes.

```sh
npx expo run:ios --device
```

Or build with EAS:

```sh
eas build --profile development --platform ios
```

Expected iOS prompts during development:

- Local Network: used by the development build to reach the Expo/Metro server.
- Bluetooth: used by this package to scan for and connect to the BitBox Nova.

### Bare React Native

The native foundation uses Expo Modules API rather than legacy React Native
`NativeModules` wiring. A bare React Native app does not need to use the Expo
managed workflow, but it does need the Expo Modules native infrastructure. A
separate plain React Native TurboModule/codegen implementation is not included.

For an existing bare React Native app, first install and configure Expo Modules:

```sh
npx install-expo-modules@latest
```

Then install this package:

```sh
npm install @bitcoinerlab/bitbox-react-native
```

For iOS, install pods and rebuild the app:

```sh
npx pod-install
```

If your bare app does not use Expo prebuild/config plugins to generate native
projects, add `NSBluetoothAlwaysUsageDescription` manually to your iOS
`Info.plist`. The iOS pod currently requires deployment target `15.1` or newer.

Android native BitBox transport methods are placeholders for now and throw
not-implemented errors.

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
- `btcSignMessage(...)`

## Optional Descriptors Integration

Apps that use `@bitcoinerlab/descriptors` can install it separately and inject
the connected client with `connectors.fromClient(...)`:

```sh
npm install @bitcoinerlab/descriptors
```

When using the bitcoinjs-based `@bitcoinerlab/descriptors` preset in React
Native/Hermes, your app may also need a global `Buffer` polyfill before importing
the descriptors package:

```sh
npm install buffer
```

```ts
import { Buffer as BufferPolyfill } from 'buffer';

(
  globalThis as typeof globalThis & { Buffer?: typeof BufferPolyfill }
).Buffer ??= BufferPolyfill;
```

The `Buffer` polyfill is not required by `@bitcoinerlab/bitbox-react-native`
itself; it is only for app code that chooses the bitcoinjs descriptors preset.

```ts
import { connectBitBoxNovaBle } from '@bitcoinerlab/bitbox-react-native';
import { connectors } from '@bitcoinerlab/descriptors/bitbox';

const client = await connectBitBoxNovaBle();
const store = {};

const session = connectors.fromClient({
  client,
  network,
  Output,
  store
});

try {
  // Use session with keyExpression/registerPolicy/displayAddress/signers from
  // @bitcoinerlab/descriptors/bitbox.
  // Persist JSON.stringify(store) or JSON.stringify(session.store), not session.
} finally {
  await client.close();
}
```

## Native Implementation

This repository includes an Expo Modules API native module for iOS and Android.
The iOS module has CoreBluetooth transport wiring for BitBox Nova and uses the
vendored gomobile framework at `ios/Frameworks/Bitboxnative.xcframework` for the
BitBox protocol. The separate `bitbox-rn-integration` dev-client app has
validated the current iOS native method set on a physical iPhone plus BitBox
Nova, including address display, multisig registration checks, and PSBT signing.
`btcSignMessage` is wired but still needs physical-device validation. Android
remains placeholder-only. The JavaScript resolver intentionally does not fall
back to legacy `react-native` `NativeModules`.

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
