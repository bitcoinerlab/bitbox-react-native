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
- A local physical-device smoke test connected to a BitBox Nova over BLE and
  printed the root fingerprint. Pairing UX is still rough and persisted pairing
  storage is not implemented yet.

Packaging notes:

- Keep the package's Expo module config explicit about the root podspec path and
  Swift module name so `ExpoModulesProvider.swift` registers
  `BitcoinerlabBitBoxModule`.
- Keep the podspec's vendored `Bitboxnative.xcframework` visible to the Swift
  pod target; the Swift sources import `Bitboxnative` directly.

The official BitBoxApp implementation used as the transport reference is:

https://github.com/BitBoxSwiss/bitbox-wallet-app/blob/master/frontends/ios/BitBoxApp/BitBoxApp/Bluetooth.swift

Do not try to use WebHID, BitBoxBridge, or `bitbox-api` WASM on iOS React
Native. The iOS path is native BLE plus the BitBox protocol implementation.
See `docs/AGENT_HANDOFF.md` for details.
