# @bitcoinerlab/bitbox-react-native

React Native native BitBox client provider for mobile Bitcoin apps.

This package is an early mobile BitBox implementation. It exposes a small
TypeScript API for a native BitBox client and has native iOS BLE plus Android
BLE/USB transport wiring, but it is not production-ready yet.

## Status

- JavaScript API: scaffolded.
- Expo Modules / React Native New Architecture-compatible native package
  foundation: scaffolded.
- iOS BitBox Nova BLE `connect`, `disconnect`, `version`, `rootFingerprint`,
  `btcXpub`, `btcAddress`, `btcRegisterScriptConfig`,
  `btcIsScriptConfigRegistered`, `btcSignPSBT`, and `btcSignMessage`: wired
  through CoreBluetooth, gomobile, and `bitbox02-api-go`, and integration-tested
  on physical iPhone plus BitBox Nova hardware.
- Android BitBox USB transport/protocol: wired through Android USB Host,
  gomobile, and `bitbox02-api-go`; pending physical-device validation.
- Android BitBox Nova BLE transport/protocol: wired through Android BLE,
  gomobile, and `bitbox02-api-go`; pending physical-device validation.
- Expo Go support: not possible, because custom native code is required.

Do not treat this package as production-ready BitBox support until descriptor
integration and target transports have been validated on real devices.

## Why This Package Exists

Browser and desktop BitBox integrations can use `bitbox-api`, WebHID, or
BitBoxBridge. React Native mobile apps cannot rely on those transports.

The mobile path needs native code:

- iOS: CoreBluetooth for BitBox Nova BLE.
- Android: USB Host for BitBox USB and native BLE for BitBox Nova.
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
The plugin is required because it adds the iOS Bluetooth usage description and
Android Bluetooth/USB manifest entries needed by the native transports.

After installing the package or changing the plugin list, rebuild the native app.
A Metro reload is not enough for native module or `Info.plist` changes.

```sh
npx expo run:ios --device
npx expo run:android --device
```

Or build with EAS:

```sh
eas build --profile development --platform ios
eas build --profile development --platform android
```

Expected iOS prompts during development:

- Local Network: used by the development build to reach the Expo/Metro server.
- Bluetooth: used by this package to scan for and connect to the BitBox Nova.

Expected Android prompts during development:

- Nearby devices/Bluetooth: used by BLE to scan for and connect to the BitBox
  Nova on Android 12+.
- Location: used only on Android 11 and older where BLE scanning is gated behind
  location permission.
- USB device access: used by USB Host before opening an attached BitBox.
- BitBox pairing dialog: used by USB to show the Noise pairing code that must
  match the BitBox display before you approve pairing. Approved USB pairing
  state is stored in app-private storage for later reconnects.

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
`Info.plist`, and add the Android Bluetooth/USB permissions, USB host feature,
USB attached intent filter, and `@xml/bitbox_device_filter` metadata manually to
the Android app. The iOS pod currently requires deployment target `15.1` or
newer.

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

Current public API:

- `connectBitBoxNovaBle(params?)`: connect to BitBox Nova over BLE.
- `connectBitBoxUsb(params?)`: connect to a BitBox over USB. Android is the
  first supported USB platform; iOS USB is not implemented yet.

Both helpers return a connected, Bitcoin-only, raw `bitbox-api`-compatible
provider client:

- `version()`
- `rootFingerprint()`
- `btcXpub(apiNetwork, keypath, xpubType, display)`
- `btcAddress(...)`
- `btcRegisterScriptConfig(apiNetwork, scriptConfig, keypathAccount, xpubType, name?)`
- `btcIsScriptConfigRegistered(...)`
- `btcSignPSBT(...)`
- `btcSignMessage(...)`

The native module and its JSON bridge parameters are private implementation
details. App code should call the connection helpers and pass normal typed BitBox
request objects.

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
BitBox protocol. The Android module has BLE/USB transport wiring, a native USB
pairing-code confirmation dialog with app-private persisted Noise config, and
uses the vendored gomobile AAR at `android/libs/bitboxnative-android.aar`. The
separate `bitbox-rn-integration` dev-client app has
validated the current iOS native method set on a physical iPhone plus BitBox
Nova, including address display, sorted multisig registration/display, generic
ordered multisig policy display/signing, PSBT signing, and message signing.
Android BLE/USB still needs physical-device validation. The JavaScript resolver
intentionally does not fall back to legacy `react-native` `NativeModules`.

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
