# @bitcoinerlab/bitbox-react-native

Use this package as the native BitBox driver for `@bitcoinerlab/descriptors` to
build descriptors, show addresses, register policies and sign PSBTs.

This package provides the mobile transport and provider client. Descriptors
opens the connection through the driver and stays in charge of wallet policy,
Miniscript, PSBT creation and finalization.

## Quick Example

This example connects to a BitBox over BLE (Bluetooth), builds a single-key relative
timelock descriptor, registers it on the device, signs a PSBT and finalizes the
input.

```ts
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
// store: caches xpubs, fingerprint data and registered policies as JSON.
const store = {}; // Or load a previously saved store.

const session = await connectors.connect({
  driver: {
    module: import('@bitcoinerlab/bitbox-react-native'),
    mode: 'ble',
    timeoutMs: 60_000
  },
  network,
  store
});

try {
  const bitboxKey = await keyExpression({
    session,
    originPath: "/48'/0'/0'/2'",
    keyPath: '/0/*'
  });

  // Policy-language equivalent with @bitcoinerlab/miniscript-policies:
  // const { miniscript } = compilePolicy('and(pk(@bitbox),older(5))');
  // const descriptor = `wsh(${miniscript.replace('@bitbox', bitboxKey)})`;
  const descriptor = `wsh(and_v(v:pk(${bitboxKey}),older(5)))`;

  await registerPolicy({ session, descriptor, name: '5-block vault' });

  // session.store keeps track of registered policies and is JSON-serializable.
  saveWalletStoreJSON(session.store);

  const receiveAddress = await displayAddress({
    session,
    descriptor,
    index: 0
  });

  const vaultOutput = new Output({ descriptor, index: 0, network });
  const psbt = new Psbt({ network });

  // Adds the vault output as a PSBT input. Save the returned finalizer: after
  // the BitBox signs, it adds the witness data needed to finish this input.
  const finalizeInput = vaultOutput.updatePsbtAsInput({
    psbt,
    txHex: await fetchPreviousTransactionHex(),
    vout: 0
  });

  // Adds the recipient output: where this transaction sends the bitcoin.
  new Output({
    descriptor: `addr(${await chooseRecipientAddress()})`,
    network
  }).updatePsbtAsOutput({ psbt, value: 90_000n });

  // The BitBox signs after the user confirms on the device.
  await signers.sign({ psbt, session });

  // Call one finalizer per descriptor input AFTER signing.
  finalizeInput({ psbt });

  const transactionHex = psbt.extractTransaction().toHex();
  await broadcastTransaction(transactionHex);

  console.log({ receiveAddress, transactionHex });
} finally {
  await session.close();
}
```

For USB on Android, use the same descriptors code and change only the driver
mode:

```ts
const session = await connectors.connect({
  driver: {
    module: import('@bitcoinerlab/bitbox-react-native'),
    mode: 'usb',
    timeoutMs: 60_000
  },
  network,
  store
});
```

## Choose A Device

Without a selected device, the driver connects to the first match. To let the
user choose when several devices are available, list them first and pass the
selected record as `driver.device`:

```ts
const driver = await import('@bitcoinerlab/bitbox-react-native');

const devices = await driver.discoverBitBoxNovaBleDevices({
  scanDurationMs: 5_000
});
const device = await chooseDevice(devices);

const session = await connectors.connect({
  driver: { module: driver, mode: 'ble', device },
  network,
  store
});
```

For USB on Android:

```ts
const driver = await import('@bitcoinerlab/bitbox-react-native');

const devices = await driver.listAttachedBitBoxUsbDevices();
const device = await chooseDevice(devices);

const session = await connectors.connect({
  driver: { module: driver, mode: 'usb', device },
  network,
  store
});
```

BLE discovery scans only for BitBox Nova devices. USB listing does not request
permission or open a device; permission is requested when connecting. An Android
USB `deviceId` identifies the current attachment and may change after reconnecting,
so discover attached USB devices again instead of persisting that ID.

If the app asks you to confirm a pairing code, continue only when it matches the
BitBox display. BLE pairing/bonding is handled by the operating system. USB
Noise pairing approvals are stored in app-private storage for later reconnects.
The React Native driver does not use descriptors' `onPairingCode` callback; that
callback belongs to the browser and BitBoxBridge `bitbox-api` flow.

## Descriptor Expressions

Write wallet templates as descriptor expressions and let
`@bitcoinerlab/descriptors/bitbox` choose the right BitBox flow.

- Standard single-key scripts use descriptors such as `wpkh(${keyExpression})`
  or `tr(${keyExpression})`. They use the BitBox standard address and signing
  flow and do not need policy registration.
- Sorted multisig uses
  `wsh(sortedmulti(2,${keyExpressionA},${keyExpressionB},${keyExpressionC}))`.
  Register it with `registerPolicy(...)`; the BitBox helpers detect it and use
  the device's specialized multisig registration flow internally.
- Custom Miniscript policies use descriptors such as
  `wsh(and_v(v:pk(${keyExpression}),older(5)))`. Register them with
  `registerPolicy(...)` before address display or signing.

App code can stay focused on descriptors. It does not need to know which BitBox
API call is used for each script type.

For address display and message signing, pass only the position fields needed by
the descriptor:

- Fixed descriptor, such as `wpkh(KEY/0/7)`: pass neither `change` nor `index`.
- Ranged fixed-branch descriptor, such as `wpkh(KEY/0/*)`: pass `index` only.
- Multipath ranged descriptor, such as `wpkh(KEY/**)` or
  `wpkh(KEY/<0;1>/*)`: pass both `change` and `index`.

The descriptors helpers derive the concrete BitBox path from the expanded
descriptor and reject extra or missing position fields, so the device path cannot
diverge from the descriptor supplied by the app.

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

## Driver API

```ts
import {
  connectBitBoxNovaBle,
  connectBitBoxUsb,
  discoverBitBoxNovaBleDevices,
  listAttachedBitBoxUsbDevices
} from '@bitcoinerlab/bitbox-react-native';
```

- `discoverBitBoxNovaBleDevices(params?)`: scan for nearby BitBox Nova devices.
- `listAttachedBitBoxUsbDevices()`: list attached BitBox USB devices on Android.
- `connectBitBoxNovaBle(params?)`: connect to BitBox Nova over BLE.
- `connectBitBoxUsb(params?)`: connect to a BitBox over USB. Android is
  supported. iOS USB is not supported.

Descriptors calls the connection helpers when this package is supplied as
`driver.module`. Apps can also call them directly; both return a connected
Bitcoin-only provider client:

- `version()`
- `rootFingerprint()`
- `btcXpub(apiNetwork, keypath, xpubType, display)`
- `btcAddress(...)`
- `btcRegisterScriptConfig(...)`
- `btcIsScriptConfigRegistered(...)`
- `btcSignPSBT(...)`
- `btcSignMessage(...)`
- `close()`

With the recommended `connectors.connect(...)` flow, the session owns the client;
call `session.close()` when finished. If the app calls a connection helper
directly, pass that client to `connectors.fromClient(...)`. The app then owns the
client and must call `client.close()` itself.

## Descriptors Store

Do not persist a live `session` or `client`. Keep the descriptors `store` in
memory for the current session or save it if the app wants to reuse it in future
sessions:

```ts
const store = JSON.parse((await storage.getItem('bitbox-store')) ?? '{}');
const session = await connectors.connect({
  driver: {
    module: import('@bitcoinerlab/bitbox-react-native'),
    mode: 'ble'
  },
  network,
  store
});

// If the app wants to reuse the cache in future sessions:
await storage.setItem('bitbox-store', JSON.stringify(session.store));

// When finished:
await session.close();
```

The store caches xpubs, master fingerprint data and the descriptor policies the
user has registered on the BitBox for each session. Whether that cache is
temporary or permanent is an app decision.

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

The supported BLE and USB flows have been validated on physical BitBox hardware.

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
