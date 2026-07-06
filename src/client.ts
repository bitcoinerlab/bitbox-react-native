import { getBitBoxNativeModule } from './nativeModule';
import type {
  BitBoxApiNetwork,
  BitBoxConnectParams,
  BitBoxFormatUnit,
  BitBoxKeypath,
  BitBoxMessageSignature,
  BitBoxNativeModule,
  BitBoxReactNativeSession,
  BitBoxRegisterXPubType,
  BitBoxScriptConfig,
  BitBoxScriptConfigWithKeypath,
  BitBoxXPubType,
  ConnectedBitBoxClient,
  NativeBitBoxConnectParams
} from './types';

function uint8Array(value: number[] | Uint8Array): Uint8Array {
  return value instanceof Uint8Array ? value : Uint8Array.from(value);
}

function bigintValue(value: number | string | bigint): bigint {
  return typeof value === 'bigint' ? value : BigInt(value);
}

function nativeConnectParams({
  onPairingCode,
  ...params
}: BitBoxConnectParams): NativeBitBoxConnectParams {
  void onPairingCode;
  return params;
}

export class ReactNativeBitBoxClient implements ConnectedBitBoxClient {
  readonly session: BitBoxReactNativeSession;

  private readonly nativeModule: BitBoxNativeModule;

  constructor({
    nativeModule,
    session
  }: {
    nativeModule: BitBoxNativeModule;
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
      keypath,
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
      keypath,
      scriptConfig,
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
      scriptConfig,
      keypathAccount,
      xpubType,
      name
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
      scriptConfig,
      keypathAccount
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
      forceScriptConfig,
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
      scriptConfigWithKeypath,
      Array.from(message)
    );
    return {
      sig: uint8Array(result.sig),
      recid: bigintValue(result.recid),
      electrumSig65: uint8Array(result.electrumSig65)
    };
  }
}

export async function connectBitBox(
  params: BitBoxConnectParams = {}
): Promise<ConnectedBitBoxClient> {
  const nativeModule = getBitBoxNativeModule();
  const session = await nativeModule.connect(nativeConnectParams(params));
  return new ReactNativeBitBoxClient({ nativeModule, session });
}

export function connectBitBoxNovaBle(
  params: Omit<BitBoxConnectParams, 'transport'> = {}
): Promise<ConnectedBitBoxClient> {
  return connectBitBox({ ...params, transport: 'ble' });
}

export function connectBitBoxAndroidUsb(
  params: Omit<BitBoxConnectParams, 'transport'> = {}
): Promise<ConnectedBitBoxClient> {
  return connectBitBox({ ...params, transport: 'android-usb' });
}
