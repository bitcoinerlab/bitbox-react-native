import Bitboxnative
import ExpoModulesCore
import Foundation

private let bitboxNativeModuleName = "BitcoinerlabBitBox"
private let bitboxDefaultConnectTimeoutMs = 30_000
private let bitboxDefaultScanDurationMs = 5_000

private func bitboxPositiveInt(
  _ name: String,
  from params: [String: Any],
  defaultValue: Int
) -> Int {
  if let value = params[name] as? Int {
    return max(value, 1)
  }
  if let value = params[name] as? Double {
    return max(Int(value), 1)
  }
  if let value = params[name] as? NSNumber {
    return max(value.intValue, 1)
  }
  return defaultValue
}

private final class BitBoxSession {
  let id: String
  let transport: BitBoxBleTransport
  let client: BitcoinerlabBitBoxBitboxnativeClient
  let product: String
  let version: String

  init(
    id: String,
    transport: BitBoxBleTransport,
    client: BitcoinerlabBitBoxBitboxnativeClient,
    product: String,
    version: String
  ) {
    self.id = id
    self.transport = transport
    self.client = client
    self.product = product
    self.version = version
  }
}

private final class BitBoxSessionStore {
  private let lock = NSLock()
  private var sessions: [String: BitBoxSession] = [:]

  func insert(
    transport: BitBoxBleTransport,
    client: BitcoinerlabBitBoxBitboxnativeClient,
    product: String,
    version: String
  ) -> BitBoxSession {
    let session = BitBoxSession(
      id: UUID().uuidString,
      transport: transport,
      client: client,
      product: product,
      version: version
    )
    lock.lock()
    sessions[session.id] = session
    lock.unlock()
    return session
  }

  func session(_ sessionId: String) throws -> BitBoxSession {
    lock.lock()
    let session = sessions[sessionId]
    lock.unlock()
    guard let session = session else {
      throw BitBoxNativeError(message: "Unknown BitBox session: \(sessionId)")
    }
    return session
  }

  func remove(_ sessionId: String) throws {
    lock.lock()
    let session = sessions.removeValue(forKey: sessionId)
    lock.unlock()
    guard let session = session else {
      throw BitBoxNativeError(message: "Unknown BitBox session: \(sessionId)")
    }
    session.client.close()
    try? session.transport.close()
  }
}

private func bitboxCallString(_ call: (NSErrorPointer) -> String) throws -> String {
  var error: NSError?
  let result = call(&error)
  if let error = error {
    throw error
  }
  return result
}

private func bitboxBytes(_ bytes: [Int]) throws -> [UInt8] {
  try bytes.map { byte in
    guard byte >= 0, byte <= 255 else {
      throw BitBoxNativeError(message: "BitBox byte arrays must contain values from 0 to 255")
    }
    return UInt8(byte)
  }
}

// JS sends connect params as JSON so the React Native bridge only receives a
// string, never an object with nested undefined values.
private func bitboxConnectParams(from paramsJSON: String) throws -> [String: Any] {
  if paramsJSON.isEmpty {
    return [:]
  }
  return try bitboxJSONObject(paramsJSON)
}

private func bitboxJSONObject(_ string: String) throws -> [String: Any] {
  let data = Data(string.utf8)
  guard let object = try JSONSerialization.jsonObject(with: data, options: []) as? [String: Any] else {
    throw BitBoxNativeError(message: "BitBox JSON result was not an object")
  }
  return object
}

public class BitcoinerlabBitBoxModule: Module {
  private let sessions = BitBoxSessionStore()

  public func definition() -> ModuleDefinition {
    Name(bitboxNativeModuleName)

    AsyncFunction("discoverBle") { (_ paramsJSON: String) throws -> [[String: Any]] in
      let params = try bitboxConnectParams(from: paramsJSON)
      return try BitBoxBleDiscovery(timeoutMs: bitboxDefaultConnectTimeoutMs).discover(
        scanDurationMs: bitboxPositiveInt(
          "scanDurationMs",
          from: params,
          defaultValue: bitboxDefaultScanDurationMs
        )
      )
    }

    AsyncFunction("listUsb") { () throws -> [[String: Any]] in
      throw BitBoxNativeError(message: "USB is not supported on iOS")
    }

    AsyncFunction("connectBle") { (_ paramsJSON: String) throws -> [String: Any] in
      let params = try bitboxConnectParams(from: paramsJSON)
      let transport = BitBoxBleTransport(
        timeoutMs: bitboxPositiveInt(
          "timeoutMs",
          from: params,
          defaultValue: bitboxDefaultConnectTimeoutMs
        )
      )
      let productInfo = try transport.connect(deviceId: params["deviceId"] as? String)
      var goError: NSError?
      guard
        let client = BitcoinerlabBitBoxBitboxnativeNewClientWithMobileTransport(
          transport,
          productInfo.product,
          productInfo.version,
          true,
          &goError
        )
      else {
        try? transport.close()
        throw goError ?? BitBoxNativeError(message: "Failed to initialize BitBox Nova BLE session")
      }

      let session = self.sessions.insert(
        transport: transport,
        client: client,
        product: productInfo.product,
        version: productInfo.version
      )
      return [
        "id": session.id,
        "transport": "ble",
        "product": session.product,
        "version": session.version
      ]
    }

    AsyncFunction("connectUsb") { (_ paramsJSON: String) throws -> [String: Any] in
      _ = paramsJSON
      throw BitBoxNativeError(message: "USB is not supported on iOS; use connectBitBoxNovaBle")
    }

    AsyncFunction("disconnect") { (_ sessionId: String) throws in
      try self.sessions.remove(sessionId)
    }

    AsyncFunction("version") { (_ sessionId: String) throws -> String in
      let client = try self.sessions.session(sessionId).client
      return try bitboxCallString { error in
        client.version(error)
      }
    }

    AsyncFunction("rootFingerprint") { (_ sessionId: String) throws -> String in
      let client = try self.sessions.session(sessionId).client
      return try bitboxCallString { error in
        client.rootFingerprint(error)
      }
    }

    AsyncFunction("btcXpub") { (
      _ sessionId: String,
      _ apiNetwork: String,
      _ keypath: String,
      _ xpubType: String,
      _ display: Bool
    ) throws -> String in
      let client = try self.sessions.session(sessionId).client
      return try bitboxCallString { error in
        client.btcxPub(
          apiNetwork,
          keypath: keypath,
          xpubType: xpubType,
          display: display,
          error: error
        )
      }
    }

    // BitBox script configs arrive as JSON made in JS. This keeps parameter
    // passing predictable on both native platforms and matches the Go adapter.
    AsyncFunction("btcAddress") { (
      _ sessionId: String,
      _ apiNetwork: String,
      _ keypath: String,
      _ scriptConfigJSON: String,
      _ display: Bool
    ) throws -> String in
      let client = try self.sessions.session(sessionId).client
      return try bitboxCallString { error in
        client.btcAddress(
          apiNetwork,
          keypath: keypath,
          scriptConfigJSON: scriptConfigJSON,
          display: display,
          error: error
        )
      }
    }

    AsyncFunction("btcRegisterScriptConfig") { (
      _ sessionId: String,
      _ apiNetwork: String,
      _ scriptConfigJSON: String,
      _ keypathAccount: String,
      _ xpubType: String,
      _ name: String
    ) throws in
      let client = try self.sessions.session(sessionId).client
      try client.btcRegisterScriptConfig(
        apiNetwork,
        scriptConfigJSON: scriptConfigJSON,
        keypathAccount: keypathAccount,
        xpubType: xpubType,
        name: name
      )
    }

    AsyncFunction("btcIsScriptConfigRegistered") { (
      _ sessionId: String,
      _ apiNetwork: String,
      _ scriptConfigJSON: String,
      _ keypathAccount: String
    ) throws -> Bool in
      let client = try self.sessions.session(sessionId).client
      var registered = ObjCBool(false)
      try client.btcIsScriptConfigRegistered(
        apiNetwork,
        scriptConfigJSON: scriptConfigJSON,
        keypathAccount: keypathAccount,
        ret0_: &registered
      )
      return registered.boolValue
    }

    AsyncFunction("btcSignPSBT") { (
      _ sessionId: String,
      _ apiNetwork: String,
      _ psbt: String,
      _ forceScriptConfigJSON: String,
      _ formatUnit: String
    ) throws -> String in
      let client = try self.sessions.session(sessionId).client
      return try bitboxCallString { error in
        client.btcSignPSBT(
          apiNetwork,
          psbtBase64: psbt,
          forceScriptConfigJSON: forceScriptConfigJSON,
          formatUnit: formatUnit,
          error: error
        )
      }
    }

    AsyncFunction("btcSignMessage") { (
      _ sessionId: String,
      _ apiNetwork: String,
      _ scriptConfigWithKeypathJSON: String,
      _ message: [Int]
    ) throws -> [String: Any] in
      let client = try self.sessions.session(sessionId).client
      let messageData = Data(try bitboxBytes(message))
      let resultJSON = try bitboxCallString { error in
        client.btcSignMessage(
          apiNetwork,
          scriptConfigWithKeypathJSON: scriptConfigWithKeypathJSON,
          message: messageData,
          error: error
        )
      }
      return try bitboxJSONObject(resultJSON)
    }
  }
}
