# Android Native Implementation

This directory contains the Android Expo Modules API implementation for
`BitcoinerlabBitBox`.

Implemented transport paths:

- `connectBle(...)`: Android BLE transport for BitBox Nova using the same service
  and characteristic UUIDs as the iOS implementation.
- `connectUsb(...)`: Android USB Host transport for BitBox devices matching the
  BitBox VID/PID `1003:9219`.

Both paths bridge raw HID-style reads/writes into the vendored gomobile AAR at
`android/libs/bitboxnative-android.aar`. USB shows a native app-side pairing
dialog for the BitBox Noise pairing code before confirming pairing in the Go
firmware layer, and stores approved USB Noise pairing state in app-private
storage for later reconnects.

Android USB and BLE have been validated on physical Android hardware through the
integration app, including connection, pairing, provider-client calls,
descriptor-backed wallet flows, PSBT signing and message signing.

Official Android source pointers:

- https://github.com/BitBoxSwiss/bitbox-wallet-app/blob/master/frontends/android/BitBoxApp/app/src/main/java/ch/shiftcrypto/bitboxapp/UsbDeviceManager.java
- https://github.com/BitBoxSwiss/bitbox-wallet-app/blob/master/frontends/android/BitBoxApp/app/src/main/java/ch/shiftcrypto/bitboxapp/GoViewModel.java
- https://github.com/BitBoxSwiss/bitbox-wallet-app/blob/master/frontends/android/BitBoxApp/app/src/main/AndroidManifest.xml

See `docs/AGENT_HANDOFF.md` for the transport and Expo config plugin plan.
