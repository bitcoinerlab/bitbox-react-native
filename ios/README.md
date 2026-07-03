# iOS Native Implementation

This directory contains the Expo Modules API implementation named
`BitcoinerlabBitBox`.

Current status:

- CoreBluetooth scan/connect/discover/read/write/close is wired for BitBox Nova
  BLE.
- `connect`, `disconnect`, `version`, and `rootFingerprint` call the gomobile Go
  wrapper.
- The BTC xpub/address/register/signing methods still throw not-implemented
  errors until Swift serialization into the Go wrapper is added.
- Real behavior still needs validation on physical BitBox Nova hardware.

The official BitBoxApp implementation used as the transport reference is:

https://github.com/BitBoxSwiss/bitbox-wallet-app/blob/master/frontends/ios/BitBoxApp/BitBoxApp/Bluetooth.swift

Do not try to use WebHID, BitBoxBridge, or `bitbox-api` WASM on iOS React
Native. The iOS path is native BLE plus the BitBox protocol implementation.
See `docs/AGENT_HANDOFF.md` for details.
