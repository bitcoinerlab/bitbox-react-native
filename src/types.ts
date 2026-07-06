export type BitBoxApiNetwork = 'btc' | 'tbtc';

export type BitBoxFormatUnit = 'default' | 'sat';

export type BitBoxXPubType =
  | 'tpub'
  | 'xpub'
  | 'ypub'
  | 'zpub'
  | 'vpub'
  | 'upub'
  | 'Vpub'
  | 'Zpub'
  | 'Upub'
  | 'Ypub';

export type BitBoxRegisterXPubType = 'autoElectrum' | 'autoXpubTpub';

export type BitBoxKeypath = string | number[];

export type BitBoxSimpleType = 'p2wpkhP2sh' | 'p2wpkh' | 'p2tr';

export type BitBoxMultisigScriptType = 'p2wsh' | 'p2wshP2sh';

export type BitBoxKeyOriginInfo = {
  rootFingerprint?: string;
  keypath?: BitBoxKeypath;
  xpub: string;
};

export type BitBoxPolicyScriptConfig = {
  policy: string;
  keys: BitBoxKeyOriginInfo[];
};

export type BitBoxMultisigScriptConfig = {
  threshold: number;
  xpubs: string[];
  ourXpubIndex: number;
  scriptType: BitBoxMultisigScriptType;
};

export type BitBoxScriptConfig =
  | { simpleType: BitBoxSimpleType }
  | { multisig: BitBoxMultisigScriptConfig }
  | { policy: BitBoxPolicyScriptConfig };

export type BitBoxScriptConfigWithKeypath = {
  scriptConfig: BitBoxScriptConfig;
  keypath: BitBoxKeypath;
};

export type BitBoxMessageSignature = {
  sig: Uint8Array;
  recid: bigint;
  electrumSig65: Uint8Array;
};

export type NativeBitBoxMessageSignature = {
  sig: number[] | Uint8Array;
  recid: number | string | bigint;
  electrumSig65: number[] | Uint8Array;
};

export type BitBoxClient = {
  version(): string | Promise<string>;
  rootFingerprint(): string | Promise<string>;
  btcXpub(
    apiNetwork: BitBoxApiNetwork,
    keypath: BitBoxKeypath,
    xpubType: BitBoxXPubType,
    display: boolean
  ): Promise<string>;
  btcAddress(
    apiNetwork: BitBoxApiNetwork,
    keypath: BitBoxKeypath,
    scriptConfig: BitBoxScriptConfig,
    display: boolean
  ): Promise<string>;
  btcRegisterScriptConfig(
    apiNetwork: BitBoxApiNetwork,
    scriptConfig: BitBoxScriptConfig,
    keypathAccount: BitBoxKeypath | undefined,
    xpubType: BitBoxRegisterXPubType,
    name?: string
  ): Promise<void>;
  btcIsScriptConfigRegistered(
    apiNetwork: BitBoxApiNetwork,
    scriptConfig: BitBoxScriptConfig,
    keypathAccount?: BitBoxKeypath
  ): Promise<boolean>;
  btcSignPSBT(
    apiNetwork: BitBoxApiNetwork,
    psbt: string,
    forceScriptConfig: BitBoxScriptConfigWithKeypath | undefined,
    formatUnit: BitBoxFormatUnit
  ): Promise<string>;
  btcSignMessage?(
    apiNetwork: BitBoxApiNetwork,
    scriptConfigWithKeypath: BitBoxScriptConfigWithKeypath,
    message: Uint8Array
  ): Promise<BitBoxMessageSignature>;
};

export type BitBoxReactNativeTransport = 'auto' | 'ble' | 'android-usb';

export type BitBoxReactNativeSession = {
  id: string;
  transport: BitBoxReactNativeTransport;
  product?: string;
  version?: string;
};

export type BitBoxConnectParams = {
  /**
   * Connection transport. On iOS, only `ble` is expected to work for BitBox
   * Nova. On Android, `android-usb` is possible for classic BitBox02 and BLE
   * should be possible for Nova once implemented.
   *
   * @default 'auto'
   */
  transport?: BitBoxReactNativeTransport;
  /** Optional native timeout in milliseconds. */
  timeoutMs?: number;
  /** Optional platform-specific device identifier to connect to. */
  deviceId?: string;
  /**
   * Pairing code callback. The first native implementation will likely deliver
   * this through an event emitter rather than the direct `connect()` call.
   */
  onPairingCode?: (pairingCode: string) => void | Promise<void>;
};

export type NativeBitBoxConnectParams = Omit<
  BitBoxConnectParams,
  'onPairingCode'
>;

export type BitBoxNativeModule = {
  connect(params: NativeBitBoxConnectParams): Promise<BitBoxReactNativeSession>;
  disconnect(sessionId: string): Promise<void>;
  version(sessionId: string): Promise<string>;
  rootFingerprint(sessionId: string): Promise<string>;
  btcXpub(
    sessionId: string,
    apiNetwork: BitBoxApiNetwork,
    keypath: BitBoxKeypath,
    xpubType: BitBoxXPubType,
    display: boolean
  ): Promise<string>;
  btcAddress(
    sessionId: string,
    apiNetwork: BitBoxApiNetwork,
    keypath: BitBoxKeypath,
    scriptConfig: BitBoxScriptConfig,
    display: boolean
  ): Promise<string>;
  btcRegisterScriptConfig(
    sessionId: string,
    apiNetwork: BitBoxApiNetwork,
    scriptConfig: BitBoxScriptConfig,
    keypathAccount: BitBoxKeypath | undefined,
    xpubType: BitBoxRegisterXPubType,
    name?: string
  ): Promise<void>;
  btcIsScriptConfigRegistered(
    sessionId: string,
    apiNetwork: BitBoxApiNetwork,
    scriptConfig: BitBoxScriptConfig,
    keypathAccount?: BitBoxKeypath
  ): Promise<boolean>;
  btcSignPSBT(
    sessionId: string,
    apiNetwork: BitBoxApiNetwork,
    psbt: string,
    forceScriptConfig: BitBoxScriptConfigWithKeypath | undefined,
    formatUnit: BitBoxFormatUnit
  ): Promise<string>;
  btcSignMessage?(
    sessionId: string,
    apiNetwork: BitBoxApiNetwork,
    scriptConfigWithKeypath: BitBoxScriptConfigWithKeypath,
    message: number[]
  ): Promise<NativeBitBoxMessageSignature>;
};

export type ConnectedBitBoxClient = BitBoxClient & {
  readonly session: BitBoxReactNativeSession;
  close(): Promise<void>;
};
