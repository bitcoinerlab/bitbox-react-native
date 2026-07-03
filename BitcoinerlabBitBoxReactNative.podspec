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
  s.source_files = 'ios/**/*.{h,m,mm,swift,hpp,cpp}'
end
