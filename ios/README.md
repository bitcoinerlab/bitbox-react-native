# iOS Native Implementation Skeleton

This directory contains an Expo Modules API placeholder named
`BitcoinerlabBitBox`. It is only native package wiring for now; every exported
method throws a not-implemented error.

The expected next path is Swift/CoreBluetooth support for BitBox Nova devices.
The official BitBoxApp implementation to study first is:

https://github.com/BitBoxSwiss/bitbox-wallet-app/blob/master/frontends/ios/BitBoxApp/BitBoxApp/Bluetooth.swift

Do not try to use WebHID, BitBoxBridge, or `bitbox-api` WASM on iOS React
Native. The iOS path is native BLE plus the BitBox protocol implementation.
See `docs/AGENT_HANDOFF.md` for details.
