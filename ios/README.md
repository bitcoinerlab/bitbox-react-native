# iOS Native Implementation Placeholder

This directory is reserved for the future iOS implementation.

The expected path is an Expo Modules / React Native native module implemented
in Swift, using CoreBluetooth to talk to BitBox Nova devices. The official
BitBoxApp implementation to study first is:

https://github.com/BitBoxSwiss/bitbox-wallet-app/blob/master/frontends/ios/BitBoxApp/BitBoxApp/Bluetooth.swift

Do not try to use WebHID, BitBoxBridge, or `bitbox-api` WASM on iOS React
Native. The iOS path is native BLE plus the BitBox protocol implementation.
See `docs/AGENT_HANDOFF.md` for details.
