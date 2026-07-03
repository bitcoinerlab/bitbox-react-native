const { withInfoPlist } = require('expo/config-plugins');

module.exports = function withBitcoinerlabBitBoxReactNative(config) {
  return withInfoPlist(config, config => {
    config.modResults.NSBluetoothAlwaysUsageDescription ??=
      'Connect to your BitBox Nova over Bluetooth.';
    return config;
  });
};
