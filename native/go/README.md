# Go Native Layer

This directory contains a tiny mobile-friendly wrapper around
`bitbox02-api-go`. It is intentionally limited to the JavaScript
`BitBoxNativeBridge` contract in `src/types.ts`.

The wrapper contains session methods, conversion helpers, and a gomobile-friendly
transport constructor. iOS supplies a CoreBluetooth read/write/close transport
for the BitBox Nova BLE path. Android supplies BLE and USB Host read/write/close
transports.

Use `gomobile bind` to produce:

- an iOS framework or xcframework consumed by the Swift Expo module
- an Android AAR consumed by the Kotlin/Java Expo module

The build script writes temporary artifacts under `native/go/build/`, which is
intentionally not committed:

```sh
npm run native:go:test
npm run native:go:build -- iossimulator
npm run native:go:build -- ios,iossimulator
npm run native:go:build -- android
```

For package simplicity, generated iOS/Android artifacts are committed under
platform package directories once they are useful, then shipped in npm releases.
The iOS artifact is committed at
`../../ios/Frameworks/Bitboxnative.xcframework`. Normal app developers should not
need Go tooling. Advanced users can rebuild the artifacts with the commands above
and replace the committed copies if they need a custom build.

Go and `gomobile` are required only for package contributors who build or update
these bindings. Normal app developers installing a published package should not
need Go tooling. Any installation method is fine if `go` and `gomobile` are on
`PATH`.

The official BitBoxApp already uses this approach through its `mobileserver`
package:

https://github.com/BitBoxSwiss/bitbox-wallet-app/blob/master/backend/mobileserver/mobileserver.go

This package should not embed the whole BitBoxApp backend. It only needs a
small BitBox client wrapper implementing the native contract in `src/types.ts`.

See `../../docs/UPSTREAM_BITBOX_API_SURVEY.md` for the selected upstream module
pin, Go imports, and transport boundary.
