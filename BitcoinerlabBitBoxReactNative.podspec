require 'json'

package = JSON.parse(File.read(File.join(__dir__, 'package.json')))

Pod::Spec.new do |s|
  s.name = 'BitcoinerlabBitBoxReactNative'
  s.version = package['version']
  s.summary = package['description']
  s.description = package['description']
  s.license = package['license']
  s.author = package['author']
  s.homepage = package['homepage']
  s.source = { :git => 'https://github.com/bitcoinerlab/bitbox-react-native.git' }
  s.platforms = { :ios => '15.1' }
  s.swift_version = '5.4'
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.frameworks = 'CoreBluetooth'
  s.source_files = 'ios/*.swift'
  s.vendored_frameworks = 'ios/Frameworks/Bitboxnative.xcframework'
  s.pod_target_xcconfig = {
    'FRAMEWORK_SEARCH_PATHS' => '$(inherited) "$(PODS_TARGET_SRCROOT)/ios/Frameworks/Bitboxnative.xcframework/ios-arm64" "$(PODS_TARGET_SRCROOT)/ios/Frameworks/Bitboxnative.xcframework/ios-arm64_x86_64-simulator"'
  }
end
