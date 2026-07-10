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

export type NativeBridgeMessageSignature = {
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
  /** Optional identifier returned by the corresponding device listing API. */
  deviceId?: string;
};

export type BitBoxBleDiscoveryParams = {
  /** BLE scan duration in milliseconds. Defaults to 5 seconds. */
  scanDurationMs?: number;
};

export type BitBoxNovaBleDevice = {
  transport: 'ble';
  deviceId: string;
  name?: string;
  rssi?: number;
};

export type BitBoxUsbDevice = {
  transport: 'usb';
  deviceId: string;
  product?: string;
};

/**
 * Internal Expo native-module bridge.
 *
 * This is not the public BitBox client API. Complex BitBox request payloads are
 * passed as JSON strings so the React Native bridge never has to convert nested
 * app objects that may contain `undefined`.
 */
export type BitBoxNativeBridge = {
  /** Scans for BitBox Nova BLE devices. Params are private bridge JSON. */
  discoverBle(paramsJSON: string): Promise<BitBoxNovaBleDevice[]>;
  /** Lists attached BitBox USB devices. */
  listUsb(): Promise<BitBoxUsbDevice[]>;
  /** Opens a BLE session. Params are private bridge JSON, not public API. */
  connectBle(paramsJSON: string): Promise<BitBoxReactNativeSession>;
  /** Opens a USB session. Params are private bridge JSON, not public API. */
  connectUsb(paramsJSON: string): Promise<BitBoxReactNativeSession>;
  disconnect(sessionId: string): Promise<void>;
  version(sessionId: string): Promise<string>;
  rootFingerprint(sessionId: string): Promise<string>;
  btcXpub(
    sessionId: string,
    apiNetwork: BitBoxApiNetwork,
    keypath: string,
    xpubType: BitBoxXPubType,
    display: boolean
  ): Promise<string>;
  btcAddress(
    sessionId: string,
    apiNetwork: BitBoxApiNetwork,
    keypath: string,
    scriptConfigJSON: string,
    display: boolean
  ): Promise<string>;
  btcRegisterScriptConfig(
    sessionId: string,
    apiNetwork: BitBoxApiNetwork,
    scriptConfigJSON: string,
    keypathAccount: string,
    xpubType: BitBoxRegisterXPubType,
    name: string
  ): Promise<void>;
  btcIsScriptConfigRegistered(
    sessionId: string,
    apiNetwork: BitBoxApiNetwork,
    scriptConfigJSON: string,
    keypathAccount: string
  ): Promise<boolean>;
  btcSignPSBT(
    sessionId: string,
    apiNetwork: BitBoxApiNetwork,
    psbt: string,
    forceScriptConfigJSON: string,
    formatUnit: BitBoxFormatUnit
  ): Promise<string>;
  btcSignMessage?(
    sessionId: string,
    apiNetwork: BitBoxApiNetwork,
    scriptConfigWithKeypathJSON: string,
    message: number[]
  ): Promise<NativeBridgeMessageSignature>;
};

/** Connected raw BitBox provider client. */
export type ConnectedBitBoxClient = BitBoxClient & {
  readonly session: BitBoxReactNativeSession;
  close(): Promise<void>;
};
