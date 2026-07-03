import type { BitBoxNativeModule } from './types';

const MODULE_NAME = 'BitcoinerlabBitBox';

type ExpoModulesRequire = (specifier: string) => {
  requireNativeModule?: (moduleName: string) => unknown;
};

declare const require: ExpoModulesRequire;

function nativeModuleMissingError(moduleName: string): Error {
  return new Error(
    `${moduleName} native module is not installed. This package requires a custom React Native native module and cannot run in Expo Go. See docs/AGENT_HANDOFF.md.`
  );
}

export function getBitBoxNativeModule(
  moduleName = MODULE_NAME
): BitBoxNativeModule {
  try {
    const expoModule =
      require('expo-modules-core').requireNativeModule?.(moduleName);
    if (expoModule) return expoModule as BitBoxNativeModule;
  } catch (error) {
    void error;
  }

  throw nativeModuleMissingError(moduleName);
}
