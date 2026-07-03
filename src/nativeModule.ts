import type { BitBoxNativeModule } from './types';

const MODULE_NAME = 'BitcoinerlabBitBox';

type ReactNativeRequire = (specifier: string) => {
  NativeModules?: Record<string, unknown>;
};

declare const require: ReactNativeRequire;

function nativeModuleMissingError(moduleName: string): Error {
  return new Error(
    `${moduleName} native module is not installed. This package requires a custom React Native native module and cannot run in Expo Go. See docs/AGENT_HANDOFF.md.`
  );
}

export function getBitBoxNativeModule(
  moduleName = MODULE_NAME
): BitBoxNativeModule {
  let reactNative: ReturnType<ReactNativeRequire>;
  try {
    reactNative = require('react-native');
  } catch (error) {
    void error;
    throw nativeModuleMissingError(moduleName);
  }

  const nativeModule = reactNative.NativeModules?.[moduleName];
  if (!nativeModule) throw nativeModuleMissingError(moduleName);
  return nativeModule as BitBoxNativeModule;
}
