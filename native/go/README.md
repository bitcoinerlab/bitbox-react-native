# Go Native Layer

This directory contains a tiny mobile-friendly wrapper around
`bitbox02-api-go`. It is intentionally limited to the JavaScript
`BitBoxNativeModule` contract in `src/types.ts`.

The wrapper currently contains session methods and conversion helpers, but no
platform transport is wired in yet. Until Swift/Kotlin supplies a real
read/write/close transport, device methods return a clear transport error.

Use `gomobile bind` to produce:

- an iOS framework or xcframework consumed by the Swift Expo module
- an Android AAR consumed by the Kotlin/Java Expo module

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
