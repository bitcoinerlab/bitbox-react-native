import { ReactNativeBitBoxClient } from '../src/client';
import type {
  BitBoxApiNetwork,
  BitBoxFormatUnit,
  BitBoxRegisterXPubType,
  BitBoxScriptConfig,
  BitBoxXPubType,
  ConnectedBitBoxClient
} from '../src';
import type { BitBoxNativeBridge } from '../src/types';

type NativeCall = {
  name: string;
  args: unknown[];
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertNoUndefined(value: unknown, context: string): void {
  assert(value !== undefined, `${context} must not be undefined`);
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      assertNoUndefined(item, `${context}[${index}]`);
    });
    return;
  }
  if (value !== null && typeof value === 'object') {
    Object.entries(value as Record<string, unknown>).forEach(([key, item]) => {
      assertNoUndefined(item, `${context}.${key}`);
    });
  }
}

function record(calls: NativeCall[], name: string, args: unknown[]): void {
  assertNoUndefined(args, name);
  calls.push({ name, args });
}

function call(calls: NativeCall[], name: string): NativeCall {
  const nativeCall = calls.find(item => item.name === name);
  assert(nativeCall, `Missing native call: ${name}`);
  return nativeCall;
}

function createNativeModule(calls: NativeCall[]): BitBoxNativeBridge {
  return {
    connectBle: async (paramsJSON: string) => {
      record(calls, 'connectBle', [paramsJSON]);
      return { id: 'session', transport: 'ble' };
    },
    connectUsb: async (paramsJSON: string) => {
      record(calls, 'connectUsb', [paramsJSON]);
      return { id: 'session', transport: 'usb' };
    },
    disconnect: async (sessionId: string) => {
      record(calls, 'disconnect', [sessionId]);
    },
    version: async (sessionId: string) => {
      record(calls, 'version', [sessionId]);
      return '0.0.0';
    },
    rootFingerprint: async (sessionId: string) => {
      record(calls, 'rootFingerprint', [sessionId]);
      return '00000000';
    },
    btcXpub: async (
      sessionId: string,
      apiNetwork: BitBoxApiNetwork,
      keypath: string,
      xpubType: BitBoxXPubType,
      display: boolean
    ) => {
      record(calls, 'btcXpub', [
        sessionId,
        apiNetwork,
        keypath,
        xpubType,
        display
      ]);
      return 'xpub';
    },
    btcAddress: async (
      sessionId: string,
      apiNetwork: BitBoxApiNetwork,
      keypath: string,
      scriptConfigJSON: string,
      display: boolean
    ) => {
      record(calls, 'btcAddress', [
        sessionId,
        apiNetwork,
        keypath,
        scriptConfigJSON,
        display
      ]);
      return 'bc1qaddress';
    },
    btcRegisterScriptConfig: async (
      sessionId: string,
      apiNetwork: BitBoxApiNetwork,
      scriptConfigJSON: string,
      keypathAccount: string,
      xpubType: BitBoxRegisterXPubType,
      name: string
    ) => {
      record(calls, 'btcRegisterScriptConfig', [
        sessionId,
        apiNetwork,
        scriptConfigJSON,
        keypathAccount,
        xpubType,
        name
      ]);
    },
    btcIsScriptConfigRegistered: async (
      sessionId: string,
      apiNetwork: BitBoxApiNetwork,
      scriptConfigJSON: string,
      keypathAccount: string
    ) => {
      record(calls, 'btcIsScriptConfigRegistered', [
        sessionId,
        apiNetwork,
        scriptConfigJSON,
        keypathAccount
      ]);
      return true;
    },
    btcSignPSBT: async (
      sessionId: string,
      apiNetwork: BitBoxApiNetwork,
      psbt: string,
      forceScriptConfigJSON: string,
      formatUnit: BitBoxFormatUnit
    ) => {
      record(calls, 'btcSignPSBT', [
        sessionId,
        apiNetwork,
        psbt,
        forceScriptConfigJSON,
        formatUnit
      ]);
      return 'signed-psbt';
    },
    btcSignMessage: async (
      sessionId: string,
      apiNetwork: BitBoxApiNetwork,
      scriptConfigWithKeypathJSON: string,
      message: number[]
    ) => {
      record(calls, 'btcSignMessage', [
        sessionId,
        apiNetwork,
        scriptConfigWithKeypathJSON,
        message
      ]);
      return { sig: [1], recid: 0, electrumSig65: [2] };
    }
  };
}

const nativeCalls: NativeCall[] = [];
const nativeModule = createNativeModule(nativeCalls);

export const connectedClient: ConnectedBitBoxClient =
  new ReactNativeBitBoxClient({
    nativeModule,
    session: { id: 'session', transport: 'ble' }
  });

export async function smokeNativeBoundary(): Promise<void> {
  const calls: NativeCall[] = [];
  const smokeNativeModule = createNativeModule(calls);
  const client = new ReactNativeBitBoxClient({
    nativeModule: smokeNativeModule,
    session: { id: 'session', transport: 'ble' }
  });
  const scriptConfig = {
    policy: {
      policy: 'wsh(multi(2,@0,@1))',
      keys: [
        {
          rootFingerprint: '00000000',
          keypath: [0x80000030, 0x80000000, 0x80000000],
          xpub: 'xpub-a'
        },
        {
          rootFingerprint: undefined,
          keypath: undefined,
          xpub: 'xpub-b'
        }
      ]
    }
  } as unknown as BitBoxScriptConfig;

  await smokeNativeModule.connectBle('{"timeoutMs":60000}');
  await smokeNativeModule.connectUsb('{"deviceId":"bitbox"}');
  await client.btcXpub(
    'btc',
    [0x80000054, 0x80000000, 0x80000000],
    'xpub',
    false
  );
  await client.btcAddress(
    'btc',
    [0x80000054, 0x80000000, 0x80000000, 0, 0],
    scriptConfig,
    false
  );
  await client.btcRegisterScriptConfig(
    'btc',
    scriptConfig,
    undefined,
    'autoXpubTpub'
  );
  await client.btcIsScriptConfigRegistered('btc', scriptConfig);
  await client.btcSignPSBT('btc', 'psbt', undefined, 'default');
  await client.btcSignMessage(
    'btc',
    {
      scriptConfig,
      keypath: [0x80000054, 0x80000000, 0x80000000, 0, 0]
    },
    Uint8Array.from([1, 2, 3])
  );

  assert(
    call(calls, 'connectBle').args[0] === '{"timeoutMs":60000}',
    'connectBle params must be JSON'
  );
  assert(
    call(calls, 'connectUsb').args[0] === '{"deviceId":"bitbox"}',
    'connectUsb params must be JSON'
  );
  assert(
    call(calls, 'btcXpub').args[2] === "m/84'/0'/0'",
    'btcXpub keypath must be a string'
  );
  assert(
    call(calls, 'btcAddress').args[2] === "m/84'/0'/0'/0/0",
    'btcAddress keypath must be a string'
  );
  const addressConfig = JSON.parse(
    call(calls, 'btcAddress').args[3] as string
  ) as {
    policy: { keys: Array<Record<string, unknown>> };
  };
  assert(
    addressConfig.policy.keys[0]?.['keypath'] === "m/48'/0'/0'",
    'policy keypath must be a string'
  );
  assert(
    !('keypath' in addressConfig.policy.keys[1]!),
    'undefined keypath must be omitted'
  );
  assert(
    !('rootFingerprint' in addressConfig.policy.keys[1]!),
    'undefined rootFingerprint must be omitted'
  );
  assert(
    call(calls, 'btcRegisterScriptConfig').args[3] === '',
    'missing account keypath must be an empty string'
  );
  assert(
    call(calls, 'btcRegisterScriptConfig').args[5] === '',
    'missing name must be an empty string'
  );
  assert(
    call(calls, 'btcIsScriptConfigRegistered').args[3] === '',
    'missing registered-account keypath must be an empty string'
  );
  assert(
    call(calls, 'btcSignPSBT').args[3] === '',
    'missing PSBT force config must be an empty string'
  );
  const messageConfig = JSON.parse(
    call(calls, 'btcSignMessage').args[2] as string
  ) as {
    keypath: string;
  };
  assert(
    messageConfig.keypath === "m/84'/0'/0'/0/0",
    'message keypath must be a string'
  );
}
