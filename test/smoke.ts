import { ReactNativeBitBoxClient } from '../src';
import type {
  BitBoxApiNetwork,
  BitBoxFormatUnit,
  BitBoxKeypath,
  BitBoxNativeModule,
  BitBoxScriptConfig,
  BitBoxScriptConfigWithKeypath,
  ConnectedBitBoxClient
} from '../src';

const nativeModule: BitBoxNativeModule = {
  connect: async () => ({ id: 'session', transport: 'ble' }),
  disconnect: async () => undefined,
  version: async () => '0.0.0',
  rootFingerprint: async () => '00000000',
  btcXpub: async (
    _sessionId: string,
    _apiNetwork: BitBoxApiNetwork,
    _keypath: BitBoxKeypath,
    _display: boolean
  ) => 'xpub',
  btcAddress: async (
    _sessionId: string,
    _apiNetwork: BitBoxApiNetwork,
    _keypath: BitBoxKeypath,
    _scriptConfig: BitBoxScriptConfig,
    _display: boolean
  ) => 'bc1qaddress',
  btcRegisterScriptConfig: async (
    _sessionId: string,
    _apiNetwork: BitBoxApiNetwork,
    _scriptConfig: BitBoxScriptConfig,
    _keypathAccount: BitBoxKeypath | undefined,
    _name?: string
  ) => undefined,
  btcIsScriptConfigRegistered: async (
    _sessionId: string,
    _apiNetwork: BitBoxApiNetwork,
    _scriptConfig: BitBoxScriptConfig,
    _keypathAccount?: BitBoxKeypath
  ) => true,
  btcSignPSBT: async (
    _sessionId: string,
    _apiNetwork: BitBoxApiNetwork,
    _psbt: string,
    _forceScriptConfig: BitBoxScriptConfigWithKeypath | undefined,
    _formatUnit: BitBoxFormatUnit
  ) => 'signed-psbt'
};

export const connectedClient: ConnectedBitBoxClient =
  new ReactNativeBitBoxClient({
    nativeModule,
    session: { id: 'session', transport: 'ble' }
  });
