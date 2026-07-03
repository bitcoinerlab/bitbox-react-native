# Android Native Implementation Skeleton

This directory contains an Expo Modules API placeholder named
`BitcoinerlabBitBox`. It is only native package wiring for now; every exported
method throws a not-implemented error.

The first practical Android target is USB Host support for classic BitBox02,
mirroring the official BitBoxApp Java code. A second Android target can be BLE
for BitBox Nova, mirroring the iOS BLE service and characteristics.

Official Android source pointers:

- https://github.com/BitBoxSwiss/bitbox-wallet-app/blob/master/frontends/android/BitBoxApp/app/src/main/java/ch/shiftcrypto/bitboxapp/UsbDeviceManager.java
- https://github.com/BitBoxSwiss/bitbox-wallet-app/blob/master/frontends/android/BitBoxApp/app/src/main/java/ch/shiftcrypto/bitboxapp/GoViewModel.java
- https://github.com/BitBoxSwiss/bitbox-wallet-app/blob/master/frontends/android/BitBoxApp/app/src/main/AndroidManifest.xml

See `docs/AGENT_HANDOFF.md` for the transport and Expo config plugin plan.
