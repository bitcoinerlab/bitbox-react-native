const {
  AndroidConfig,
  withAndroidManifest,
  withInfoPlist
} = require('expo/config-plugins');

const { getMainActivityOrThrow } = AndroidConfig.Manifest;

function ensureUsesPermission(manifest, name, attrs = {}) {
  manifest['uses-permission'] ??= [];
  const existing = manifest['uses-permission'].find(
    permission => permission.$?.['android:name'] === name
  );
  if (existing) {
    existing.$ = { ...existing.$, ...attrs };
    return;
  }
  manifest['uses-permission'].push({ $: { 'android:name': name, ...attrs } });
}

function ensureUsesFeature(manifest, name, required = false) {
  manifest['uses-feature'] ??= [];
  const existing = manifest['uses-feature'].find(
    feature => feature.$?.['android:name'] === name
  );
  if (existing) {
    existing.$['android:required'] = String(required);
    return;
  }
  manifest['uses-feature'].push({
    $: { 'android:name': name, 'android:required': String(required) }
  });
}

function ensureUsbAttachedIntentFilter(activity) {
  activity['intent-filter'] ??= [];
  const hasFilter = activity['intent-filter'].some(filter =>
    filter.action?.some(
      action =>
        action.$?.['android:name'] ===
        'android.hardware.usb.action.USB_DEVICE_ATTACHED'
    )
  );
  if (!hasFilter) {
    activity['intent-filter'].push({
      action: [
        {
          $: {
            'android:name': 'android.hardware.usb.action.USB_DEVICE_ATTACHED'
          }
        }
      ]
    });
  }
}

function ensureActivityMetaData(activity, name, resource) {
  activity['meta-data'] ??= [];
  const existing = activity['meta-data'].find(
    item => item.$?.['android:name'] === name
  );
  if (existing) {
    existing.$['android:resource'] = resource;
    return;
  }
  activity['meta-data'].push({
    $: { 'android:name': name, 'android:resource': resource }
  });
}

module.exports = function withBitcoinerlabBitBoxReactNative(config) {
  config = withInfoPlist(config, config => {
    config.modResults.NSBluetoothAlwaysUsageDescription ??=
      'Connect to your BitBox Nova over Bluetooth.';
    return config;
  });

  return withAndroidManifest(config, config => {
    const manifest = config.modResults.manifest;
    ensureUsesPermission(manifest, 'android.permission.BLUETOOTH', {
      'android:maxSdkVersion': '30'
    });
    ensureUsesPermission(manifest, 'android.permission.BLUETOOTH_ADMIN', {
      'android:maxSdkVersion': '30'
    });
    ensureUsesPermission(manifest, 'android.permission.ACCESS_FINE_LOCATION', {
      'android:maxSdkVersion': '30'
    });
    ensureUsesPermission(manifest, 'android.permission.BLUETOOTH_SCAN', {
      'android:usesPermissionFlags': 'neverForLocation'
    });
    ensureUsesPermission(manifest, 'android.permission.BLUETOOTH_CONNECT');
    ensureUsesFeature(manifest, 'android.hardware.bluetooth_le', false);
    ensureUsesFeature(manifest, 'android.hardware.usb.host', false);

    const activity = getMainActivityOrThrow(config.modResults);
    ensureUsbAttachedIntentFilter(activity);
    ensureActivityMetaData(
      activity,
      'android.hardware.usb.action.USB_DEVICE_ATTACHED',
      '@xml/bitbox_device_filter'
    );
    return config;
  });
};
