# @bitcoinerlab/bitbox-react-native

Use a BitBox from a React Native app, then pass it to
`@bitcoinerlab/descriptors` to build descriptors, show addresses, register
policies and sign PSBTs.

This package provides the mobile transport layer. Descriptors stays in charge of
wallet policy, Miniscript, PSBT creation and finalization.

## Quick Example

This example connects to a BitBox, builds a single-key relative timelock
descriptor, registers it on the device, signs a PSBT and finalizes the input.

```ts
import { connectBitBoxNovaBle } from '@bitcoinerlab/bitbox-react-native';
// This example uses the bitcoinjs-lib preset. If you prefer @scure/btc-signer
// and noble/scure types, use @bitcoinerlab/descriptors-scure instead.
import { networks, Output, Psbt } from '@bitcoinerlab/descriptors';
import {
  connectors,
  displayAddress,
  keyExpression,
  registerPolicy,
  signers
} from '@bitcoinerlab/descriptors/bitbox';

const network = networks.bitcoin;
// Stores & caches xpubs, fingerprint data and policy metadata as JSON.
const store = {};
const client = await connectBitBoxNovaBle({ timeoutMs: 60_000 });

try {
  const session = connectors.fromClient({ client, network, store });

  const bitboxKey = await keyExpression({
    session,
    originPath: "/48'/0'/0'/2'",
    keyPath: '/0/*'
  });

  const descriptor = `wsh(and_v(v:pk(${bitboxKey}),older(5)))`;

  await registerPolicy({
    session,
    descriptor,
    name: '5-block vault'
  });

  const receiveAddress = await displayAddress({
    session,
    descriptor,
    index: 0
  });

  const vaultOutput = new Output({ descriptor, index: 0, network });
  const psbt = new Psbt({ network });

  const finalizeInput = vaultOutput.updatePsbtAsInput({
    psbt,
    txHex: await fetchPreviousTransactionHex(),
    vout: 0
  });

  new Output({
    descriptor: `addr(${await chooseRecipientAddress()})`,
    network
  }).updatePsbtAsOutput({ psbt, value: 90_000n });

  // The BitBox signs after the user confirms on the device.
  await signers.sign({ psbt, session });

  // `updatePsbtAsInput(...)` returns the finalizer for this descriptor input.
  finalizeInput({ psbt });

  const transactionHex = psbt.extractTransaction().toHex();
  await broadcastTransaction(transactionHex);

  // session.store keeps track of policies and is JSON-serializable.
  saveWalletStoreJSON(session.store);
  console.log({ receiveAddress, transactionHex });
} finally {
  await client.close();
}
```

For USB on Android, use the same descriptors code and change only the connection
helper:

```ts
import { connectBitBoxUsb } from '@bitcoinerlab/bitbox-react-native';

const client = await connectBitBoxUsb({ timeoutMs: 60_000 });
```

If the app asks you to confirm a pairing code, continue only when it matches the
BitBox display. BLE pairing/bonding is handled by the operating system. USB
Noise pairing approvals are stored in app-private storage for later reconnects.

## Install

This package contains native code. It works in Expo development builds, EAS
builds, Expo prebuild apps and bare React Native apps with Expo Modules
installed. It does not work in Expo Go.

```sh
npx expo install @bitcoinerlab/bitbox-react-native
npx expo install expo-dev-client
npm install @bitcoinerlab/descriptors buffer
```

Add the config plugin to your Expo app config, usually `app.json` or
`app.config.js`:

```json
{
  "expo": {
    "plugins": ["expo-dev-client", "@bitcoinerlab/bitbox-react-native"]
  }
}
```

Rebuild the native app after installing the package or changing plugins:

```sh
npx expo run:ios --device
npx expo run:android --device
```

The plugin adds the iOS Bluetooth usage string plus the Android Bluetooth and USB
manifest entries used by the native transports.

## React Native Buffer Setup

`@bitcoinerlab/bitbox-react-native` does not need a Buffer polyfill by itself.
The bitcoinjs-based descriptors preset may need one in React Native/Hermes. Load
it before importing descriptors code:

```ts
import { Buffer as BufferPolyfill } from 'buffer';

(
  globalThis as typeof globalThis & { Buffer?: typeof BufferPolyfill }
).Buffer ??= BufferPolyfill;
```

## Public API

```ts
import {
  connectBitBoxNovaBle,
  connectBitBoxUsb
} from '@bitcoinerlab/bitbox-react-native';
```

- `connectBitBoxNovaBle(params?)`: connect to BitBox Nova over BLE.
- `connectBitBoxUsb(params?)`: connect to a BitBox over USB. Android is supported
  first. iOS USB is not implemented yet.

Both helpers return a connected Bitcoin-only provider client:

- `version()`
- `rootFingerprint()`
- `btcXpub(apiNetwork, keypath, xpubType, display)`
- `btcAddress(...)`
- `btcRegisterScriptConfig(...)`
- `btcIsScriptConfigRegistered(...)`
- `btcSignPSBT(...)`
- `btcSignMessage(...)`
- `close()`

Most apps should not call those methods directly. Pass the client to
`connectors.fromClient(...)` from `@bitcoinerlab/descriptors/bitbox` and use the
descriptor helpers instead.

The native module and its JSON bridge parameters are private implementation
details. App code passes normal typed BitBox and descriptors objects.

## Persist The Descriptors Store

Do not persist a live `session` or `client`. Persist the descriptors `store`:

```ts
const store = JSON.parse((await storage.getItem('bitbox-store')) ?? '{}');
const session = connectors.fromClient({ client, network, store });

// After registration, address display or signing:
await storage.setItem('bitbox-store', JSON.stringify(session.store));
```

The store caches xpubs, master fingerprint data and policy metadata needed to
display addresses or sign PSBTs for registered BitBox policies.

## Bare React Native

The native module uses Expo Modules API. A bare React Native app can use it, but
it must install Expo Modules native support first:

```sh
npx install-expo-modules@latest
npm install @bitcoinerlab/bitbox-react-native
npx pod-install
```

If your app does not use Expo prebuild or config plugins, add the native entries
manually:

- iOS: `NSBluetoothAlwaysUsageDescription` in `Info.plist`.
- Android: Bluetooth permissions, USB host feature, USB attached intent filter
  and `@xml/bitbox_device_filter` metadata.

The iOS pod currently requires deployment target `15.1` or newer.

## Platform Status

This package is still young. It is ready for integration testing, not for broad
production use.

- iOS BitBox Nova BLE: validated on physical iPhone plus BitBox Nova hardware.
  Tested flows include connection, xpub/address reads, address display, multisig
  and policy registration, PSBT signing and message signing.
- Android USB: validated on physical Android hardware through the integration
  app. Tested flows include connection, pairing, provider-client calls,
  descriptor-backed wallet flows, PSBT signing and message signing.
- Android BitBox Nova BLE: validated on physical Android hardware through the
  integration app. Tested flows include connection, pairing, provider-client
  calls, descriptor-backed wallet flows, PSBT signing and message signing.
- Expo Go: not supported because custom native code is required.

## Native Implementation

The package includes an Expo Modules API native module for iOS and Android.

- iOS uses CoreBluetooth for BitBox Nova BLE and the vendored gomobile framework
  at `ios/Frameworks/Bitboxnative.xcframework`.
- Android uses BLE, USB Host, a native USB pairing-code dialog, app-private USB
  Noise pairing storage and the vendored gomobile AAR at
  `android/libs/bitboxnative-android.aar`.
- The protocol layer is a small Go wrapper around `bitbox02-api-go` built with
  `gomobile bind`.

## Development

```sh
npm install
npm test
npm run native:go:test
npm run format:check
```

Go and `gomobile` are needed only by contributors who regenerate mobile bindings.
Normal app developers should get prebuilt artifacts from the npm package.

To rebuild bindings locally:

```sh
npm run native:go:build -- ios,iossimulator
npm run native:go:build -- android
```

The API throws a clear error if the `BitcoinerlabBitBox` native module is missing
or if an unsupported platform method is called.
