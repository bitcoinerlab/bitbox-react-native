# Go Native Layer Placeholder

The recommended implementation path is to wrap `bitbox02-api-go` with a tiny
mobile-friendly API that exactly matches the JavaScript `BitBoxNativeModule`
interface in `src/types.ts`.

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
