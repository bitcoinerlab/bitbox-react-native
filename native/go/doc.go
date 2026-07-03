// Package bitboxnative is the gomobile boundary for the React Native BitBox module.
//
// It intentionally wraps upstream bitbox02-api-go instead of reimplementing the
// BitBox protocol. Native Swift/Kotlin code owns platform transport; this package
// owns only the small mobile-friendly API and conversions needed by src/types.ts.
package bitboxnative
