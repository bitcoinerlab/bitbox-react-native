import { getBitBoxNativeModule } from './nativeModule';
import type {
  BitBoxApiNetwork,
  BitBoxBleDiscoveryParams,
  BitBoxConnectParams,
  BitBoxFormatUnit,
  BitBoxKeypath,
  BitBoxMessageSignature,
  BitBoxNativeBridge,
  BitBoxNovaBleDevice,
  BitBoxReactNativeSession,
  BitBoxRegisterXPubType,
  BitBoxScriptConfig,
  BitBoxScriptConfigWithKeypath,
  BitBoxXPubType,
  BitBoxUsbDevice,
  ConnectedBitBoxClient
} from './types';

function uint8Array(value: number[] | Uint8Array): Uint8Array {
  return value instanceof Uint8Array ? value : Uint8Array.from(value);
}

function bigintValue(value: number | string | bigint): bigint {
  return typeof value === 'bigint' ? value : BigInt(value);
}

/**
 * Converts a public BIP32 keypath into the string form used by the Go adapter.
 *
 * App code may pass either an `m/...` string or numeric BIP32 components. The
 * native layer always receives a string so Android and iOS do not need their own
 * keypath conversion code. Optional keypaths become `''`, which the Go adapter
 * treats as "not set".
 */
function keypathString(keypath: BitBoxKeypath | undefined): string {
  if (keypath === undefined) return '';
  if (typeof keypath === 'string') return keypath;
  if (keypath.length === 0) return 'm';
  return `m/${keypath
    .map(component => {
      if (!Number.isSafeInteger(component) || component < 0) {
        throw new Error(
          'BitBox keypath component must be a non-negative integer'
        );
      }
      const hardenedOffset = 0x80000000;
      return component >= hardenedOffset
        ? `${component - hardenedOffset}'`
        : String(component);
    })
    .join('/')}`;
}

/**
 * Converts a value into this package's private native-bridge JSON format.
 *
 * App code never passes these JSON strings directly. We create them here before
 * calling native code because React Native's Android bridge can fail on
 * `undefined`, including `undefined` inside nested wallet objects. JSON gives us
 * a simple wire format: object fields with `undefined` are omitted, keypath
 * arrays are converted to `m/...` strings, and a missing optional payload is sent
 * as `''`.
 */
function bridgeJSON(value?: unknown): string {
  if (value === undefined) return '';
  return (
    JSON.stringify(value, (key, item) => {
      if (key === 'keypath' && Array.isArray(item)) {
        return keypathString(item);
      }
      return item;
    }) ?? ''
  );
}

/** Wraps one native BitBox session and exposes the provider-client methods. */
export class ReactNativeBitBoxClient implements ConnectedBitBoxClient {
  readonly session: BitBoxReactNativeSession;

  private readonly nativeModule: BitBoxNativeBridge;

  constructor({
    nativeModule,
    session
  }: {
    nativeModule: BitBoxNativeBridge;
    session: BitBoxReactNativeSession;
  }) {
    this.nativeModule = nativeModule;
    this.session = session;
  }

  close(): Promise<void> {
    return this.nativeModule.disconnect(this.session.id);
  }

  version(): Promise<string> {
    return this.nativeModule.version(this.session.id);
  }

  rootFingerprint(): Promise<string> {
    return this.nativeModule.rootFingerprint(this.session.id);
  }

  btcXpub(
    apiNetwork: BitBoxApiNetwork,
    keypath: BitBoxKeypath,
    xpubType: BitBoxXPubType,
    display: boolean
  ): Promise<string> {
    return this.nativeModule.btcXpub(
      this.session.id,
      apiNetwork,
      keypathString(keypath),
      xpubType,
      display
    );
  }

  btcAddress(
    apiNetwork: BitBoxApiNetwork,
    keypath: BitBoxKeypath,
    scriptConfig: BitBoxScriptConfig,
    display: boolean
  ): Promise<string> {
    return this.nativeModule.btcAddress(
      this.session.id,
      apiNetwork,
      keypathString(keypath),
      bridgeJSON(scriptConfig),
      display
    );
  }

  btcRegisterScriptConfig(
    apiNetwork: BitBoxApiNetwork,
    scriptConfig: BitBoxScriptConfig,
    keypathAccount: BitBoxKeypath | undefined,
    xpubType: BitBoxRegisterXPubType,
    name?: string
  ): Promise<void> {
    return this.nativeModule.btcRegisterScriptConfig(
      this.session.id,
      apiNetwork,
      bridgeJSON(scriptConfig),
      keypathString(keypathAccount),
      xpubType,
      name ?? ''
    );
  }

  btcIsScriptConfigRegistered(
    apiNetwork: BitBoxApiNetwork,
    scriptConfig: BitBoxScriptConfig,
    keypathAccount?: BitBoxKeypath
  ): Promise<boolean> {
    return this.nativeModule.btcIsScriptConfigRegistered(
      this.session.id,
      apiNetwork,
      bridgeJSON(scriptConfig),
      keypathString(keypathAccount)
    );
  }

  btcSignPSBT(
    apiNetwork: BitBoxApiNetwork,
    psbt: string,
    forceScriptConfig: BitBoxScriptConfigWithKeypath | undefined,
    formatUnit: BitBoxFormatUnit
  ): Promise<string> {
    return this.nativeModule.btcSignPSBT(
      this.session.id,
      apiNetwork,
      psbt,
      bridgeJSON(forceScriptConfig),
      formatUnit
    );
  }

  async btcSignMessage(
    apiNetwork: BitBoxApiNetwork,
    scriptConfigWithKeypath: BitBoxScriptConfigWithKeypath,
    message: Uint8Array
  ): Promise<BitBoxMessageSignature> {
    if (!this.nativeModule.btcSignMessage) {
      throw new Error('BitBox native module does not support btcSignMessage');
    }
    const result = await this.nativeModule.btcSignMessage(
      this.session.id,
      apiNetwork,
      bridgeJSON(scriptConfigWithKeypath),
      Array.from(message)
    );
    return {
      sig: uint8Array(result.sig),
      recid: bigintValue(result.recid),
      electrumSig65: uint8Array(result.electrumSig65)
    };
  }
}

/** Connects to a BitBox Nova over Bluetooth. */
export async function connectBitBoxNovaBle(
  params: BitBoxConnectParams = {}
): Promise<ConnectedBitBoxClient> {
  const nativeModule = getBitBoxNativeModule();
  const session = await nativeModule.connectBle(bridgeJSON(params));
  return new ReactNativeBitBoxClient({ nativeModule, session });
}

/** Scans for nearby BitBox Nova devices over Bluetooth. */
export function discoverBitBoxNovaBleDevices(
  params: BitBoxBleDiscoveryParams = {}
): Promise<BitBoxNovaBleDevice[]> {
  return getBitBoxNativeModule().discoverBle(bridgeJSON(params));
}

/** Connects to a BitBox over USB. Android is the first supported USB platform. */
export async function connectBitBoxUsb(
  params: BitBoxConnectParams = {}
): Promise<ConnectedBitBoxClient> {
  const nativeModule = getBitBoxNativeModule();
  const session = await nativeModule.connectUsb(bridgeJSON(params));
  return new ReactNativeBitBoxClient({ nativeModule, session });
}

/** Lists BitBox USB devices currently attached to the Android device. */
export function listAttachedBitBoxUsbDevices(): Promise<BitBoxUsbDevice[]> {
  return getBitBoxNativeModule().listUsb();
}
