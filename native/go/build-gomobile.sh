#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH= cd "$(dirname "$0")" && pwd)
OUT_DIR=${BITBOX_GO_BUILD_DIR:-"$SCRIPT_DIR/build"}
PACKAGE=${BITBOX_GO_PACKAGE:-.}
TARGET=${1:-iossimulator}
JAVA_PACKAGE=${BITBOX_GO_JAVA_PACKAGE:-com.bitcoinerlab.bitboxreactnative.go}
OBJC_PREFIX=${BITBOX_GO_OBJC_PREFIX:-BitcoinerlabBitBox}

usage() {
  cat <<EOF
Usage: sh native/go/build-gomobile.sh [target]

Targets:
  iossimulator        Build an iOS simulator xcframework (default)
  ios                 Build an iOS device xcframework
  ios,iossimulator    Build a combined iOS xcframework
  android             Build an Android AAR
  all                 Build ios,iossimulator and android

Environment:
  BITBOX_GO_BUILD_DIR     Output directory (default: native/go/build)
  BITBOX_GO_PACKAGE       Go package to bind (default: .)
  BITBOX_GO_JAVA_PACKAGE  Android Java package prefix
  BITBOX_GO_OBJC_PREFIX   Apple Objective-C prefix
EOF
}

if [ "$TARGET" = "-h" ] || [ "$TARGET" = "--help" ]; then
  usage
  exit 0
fi

if ! command -v go >/dev/null 2>&1; then
  echo "error: go is required on PATH" >&2
  exit 1
fi

export PATH="$(go env GOPATH)/bin:$PATH"

if ! command -v gomobile >/dev/null 2>&1 || ! command -v gobind >/dev/null 2>&1; then
  MOBILE_VERSION=$(go list -m -f '{{.Version}}' golang.org/x/mobile 2>/dev/null || printf latest)
  echo "error: gomobile and gobind are required on PATH" >&2
  echo "install with:" >&2
  echo "  go install golang.org/x/mobile/cmd/gomobile@$MOBILE_VERSION" >&2
  echo "  go install golang.org/x/mobile/cmd/gobind@$MOBILE_VERSION" >&2
  echo "  gomobile init" >&2
  exit 1
fi

cd "$SCRIPT_DIR"
mkdir -p "$OUT_DIR"

echo "Running Go tests..."
go test ./...

safe_target_name() {
  printf '%s' "$1" | tr ',/' '--'
}

build_one() {
  target=$1
  case "$target" in
    android)
      output="$OUT_DIR/bitboxnative-android.aar"
      rm -f "$output"
      gomobile bind \
        -target="$target" \
        -javapkg="$JAVA_PACKAGE" \
        -o "$output" \
        "$PACKAGE"
      ;;
    ios|iossimulator|macos|maccatalyst|ios,iossimulator)
      output="$OUT_DIR/bitboxnative-$(safe_target_name "$target").xcframework"
      rm -rf "$output"
      gomobile bind \
        -target="$target" \
        -prefix="$OBJC_PREFIX" \
        -o "$output" \
        "$PACKAGE"
      ;;
    *)
      usage >&2
      exit 1
      ;;
  esac
  echo "Built $output"
}

case "$TARGET" in
  all)
    build_one "ios,iossimulator"
    build_one "android"
    ;;
  *)
    build_one "$TARGET"
    ;;
esac
