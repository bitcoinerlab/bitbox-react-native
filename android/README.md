# Android Native Implementation Placeholder

This directory is reserved for the future Android implementation.

The first practical Android target is USB Host support for classic BitBox02,
mirroring the official BitBoxApp Java code. A second Android target can be BLE
for BitBox Nova, mirroring the iOS BLE service and characteristics.

Official Android source pointers:

- https://github.com/BitBoxSwiss/bitbox-wallet-app/blob/master/frontends/android/BitBoxApp/app/src/main/java/ch/shiftcrypto/bitboxapp/UsbDeviceManager.java
- https://github.com/BitBoxSwiss/bitbox-wallet-app/blob/master/frontends/android/BitBoxApp/app/src/main/java/ch/shiftcrypto/bitboxapp/GoViewModel.java
- https://github.com/BitBoxSwiss/bitbox-wallet-app/blob/master/frontends/android/BitBoxApp/app/src/main/AndroidManifest.xml

See `docs/AGENT_HANDOFF.md` for the transport and Expo config plugin plan.
