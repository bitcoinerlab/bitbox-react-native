# Go Native Layer Placeholder

The recommended implementation path is to wrap `bitbox02-api-go` with a tiny
mobile-friendly API that exactly matches the JavaScript `BitBoxNativeModule`
interface in `src/types.ts`.

Use `gomobile bind` to produce:

- an iOS framework or xcframework consumed by the Swift Expo module
- an Android AAR consumed by the Kotlin/Java Expo module

The official BitBoxApp already uses this approach through its `mobileserver`
package:

https://github.com/BitBoxSwiss/bitbox-wallet-app/blob/master/backend/mobileserver/mobileserver.go

This package should not embed the whole BitBoxApp backend. It only needs a
small BitBox client wrapper implementing the native contract in `src/types.ts`.
