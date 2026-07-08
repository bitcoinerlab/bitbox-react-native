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

/** Transport used by an active native BitBox session. */
export type BitBoxReactNativeTransport = 'ble' | 'usb';

/** Metadata returned by native code after a successful connection. */
export type BitBoxReactNativeSession = {
  id: string;
  transport: BitBoxReactNativeTransport;
  product?: string;
  version?: string;
};

/** Options shared by the explicit BLE and USB connect helpers. */
export type BitBoxConnectParams = {
  /** Native connection timeout in milliseconds. */
  timeoutMs?: number;
  /** Optional platform device identifier, such as a BLE peripheral id. */
  deviceId?: string;
};

/** Native Expo module surface used by the JavaScript client wrapper. */
export type BitBoxNativeModule = {
  /** Opens a BLE session, currently for BitBox Nova. */
  connectBle(params: BitBoxConnectParams): Promise<BitBoxReactNativeSession>;
  /** Opens a USB session. Android is the first supported USB platform. */
  connectUsb(params: BitBoxConnectParams): Promise<BitBoxReactNativeSession>;
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

/** Connected raw BitBox provider client. */
export type ConnectedBitBoxClient = BitBoxClient & {
  readonly session: BitBoxReactNativeSession;
  close(): Promise<void>;
};
