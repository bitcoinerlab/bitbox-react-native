import Bitboxnative
import ExpoModulesCore
import Foundation

private let bitboxNativeModuleName = "BitcoinerlabBitBox"
private let bitboxDefaultConnectTimeoutMs = 30_000
private let bitboxHardenedOffset: UInt64 = 0x80000000
private let bitboxMaxKeypathComponent: UInt64 = 0xffffffff

private func bitboxTimeoutMs(from params: [String: Any]) -> Int {
  if let timeoutMs = params["timeoutMs"] as? Int {
    return timeoutMs
  }
  if let timeoutMs = params["timeoutMs"] as? Double {
    return Int(timeoutMs)
  }
  if let timeoutMs = params["timeoutMs"] as? NSNumber {
    return timeoutMs.intValue
  }
  return bitboxDefaultConnectTimeoutMs
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

private func bitboxKeypathString(_ keypath: Either<String, [Int]>) throws -> String {
  if let keypathString: String = keypath.get() {
    return keypathString
  }
  if let keypathComponents: [Int] = keypath.get() {
    return try bitboxKeypathString(from: keypathComponents)
  }
  throw BitBoxNativeError(message: "BitBox keypath must be a string or number array")
}

private func bitboxOptionalKeypathString(_ keypath: Either<String, [Int]>?) throws -> String {
  guard let keypath = keypath else {
    return ""
  }
  return try bitboxKeypathString(keypath)
}

private func bitboxKeypathString(from components: [Int]) throws -> String {
  if components.isEmpty {
    return "m"
  }
  let parts = try components.map { component -> String in
    guard component >= 0 else {
      throw BitBoxNativeError(message: "BitBox keypath component must be non-negative")
    }
    return try bitboxKeypathComponentString(UInt64(component))
  }
  return "m/" + parts.joined(separator: "/")
}

private func bitboxKeypathString(from value: Any?) throws -> String? {
  guard let value = value, !(value is NSNull) else {
    return nil
  }
  if let keypathString = value as? String {
    return keypathString
  }
  if let keypathComponents = value as? [Int] {
    return try bitboxKeypathString(from: keypathComponents)
  }
  if let keypathComponents = value as? [Any] {
    return try bitboxKeypathString(from: keypathComponents.map { try bitboxKeypathComponent($0) })
  }
  throw BitBoxNativeError(message: "BitBox keypath must be a string or number array")
}

private func bitboxKeypathComponent(_ value: Any) throws -> Int {
  if let component = value as? Int {
    return component
  }
  if let component = value as? NSNumber {
    return try bitboxKeypathComponent(component.doubleValue)
  }
  if let component = value as? Double {
    return try bitboxKeypathComponent(component)
  }
  throw BitBoxNativeError(message: "BitBox keypath component must be a number")
}

private func bitboxKeypathComponent(_ value: Double) throws -> Int {
  guard value.isFinite, value.rounded() == value, value >= 0, value <= Double(bitboxMaxKeypathComponent) else {
    throw BitBoxNativeError(message: "BitBox keypath component must be an unsigned 32-bit integer")
  }
  return Int(value)
}

private func bitboxKeypathComponentString(_ component: UInt64) throws -> String {
  guard component <= bitboxMaxKeypathComponent else {
    throw BitBoxNativeError(message: "BitBox keypath component must be an unsigned 32-bit integer")
  }
  if component >= bitboxHardenedOffset {
    return "\(component - bitboxHardenedOffset)'"
  }
  return String(component)
}

private func bitboxScriptConfigJSONString(_ scriptConfig: [String: Any]) throws -> String {
  try bitboxJSONString(bitboxNormalizeScriptConfig(scriptConfig))
}

private func bitboxScriptConfigWithKeypathJSONString(_ value: [String: Any]?) throws -> String {
  guard let value = value else {
    return ""
  }
  guard let scriptConfig = value["scriptConfig"] as? [String: Any] else {
    throw BitBoxNativeError(message: "forceScriptConfig.scriptConfig must be an object")
  }
  guard let keypath = try bitboxKeypathString(from: value["keypath"]) else {
    throw BitBoxNativeError(message: "forceScriptConfig.keypath is required")
  }
  return try bitboxJSONString([
    "scriptConfig": bitboxNormalizeScriptConfig(scriptConfig),
    "keypath": keypath
  ])
}

private func bitboxNormalizeScriptConfig(_ scriptConfig: [String: Any]) throws -> [String: Any] {
  let simpleType = scriptConfig["simpleType"] as? String
  let multisig = scriptConfig["multisig"] as? [String: Any]
  let policy = scriptConfig["policy"] as? [String: Any]
  let variantCount = [simpleType != nil, multisig != nil, policy != nil].filter { $0 }.count
  guard variantCount == 1 else {
    throw BitBoxNativeError(message: "scriptConfig must set exactly one variant")
  }
  if let simpleType = simpleType {
    return ["simpleType": simpleType]
  }
  if let multisig = multisig {
    return ["multisig": multisig]
  }
  if let policy = policy {
    return ["policy": try bitboxNormalizePolicyScriptConfig(policy)]
  }
  throw BitBoxNativeError(message: "scriptConfig must set exactly one variant")
}

private func bitboxNormalizePolicyScriptConfig(_ policy: [String: Any]) throws -> [String: Any] {
  guard let keys = policy["keys"] as? [Any] else {
    return policy
  }
  var normalized = policy
  normalized["keys"] = try keys.map { key -> [String: Any] in
    guard var normalizedKey = key as? [String: Any] else {
      throw BitBoxNativeError(message: "policy.keys entries must be objects")
    }
    if let keypath = try bitboxKeypathString(from: normalizedKey["keypath"]) {
      normalizedKey["keypath"] = keypath
    } else {
      normalizedKey.removeValue(forKey: "keypath")
    }
    return normalizedKey
  }
  return normalized
}

private func bitboxJSONString(_ value: Any) throws -> String {
  guard JSONSerialization.isValidJSONObject(value) else {
    throw BitBoxNativeError(message: "BitBox value cannot be serialized to JSON")
  }
  let data = try JSONSerialization.data(withJSONObject: value, options: [])
  guard let string = String(data: data, encoding: .utf8) else {
    throw BitBoxNativeError(message: "BitBox JSON serialization failed")
  }
  return string
}

public class BitcoinerlabBitBoxModule: Module {
  private let sessions = BitBoxSessionStore()

  public func definition() -> ModuleDefinition {
    Name(bitboxNativeModuleName)

    AsyncFunction("connect") { (_ params: [String: Any]) throws -> [String: Any] in
      let requestedTransport = (params["transport"] as? String) ?? "auto"
      if requestedTransport != "auto" && requestedTransport != "ble" {
        throw BitBoxNativeError(message: "iOS only supports BitBox Nova BLE transport")
      }

      let transport = BitBoxBleTransport(timeoutMs: bitboxTimeoutMs(from: params))
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
      _ keypath: Either<String, [Int]>,
      _ xpubType: String,
      _ display: Bool
    ) throws -> String in
      let client = try self.sessions.session(sessionId).client
      let keypathString = try bitboxKeypathString(keypath)
      return try bitboxCallString { error in
        client.btcxPub(
          apiNetwork,
          keypath: keypathString,
          xpubType: xpubType,
          display: display,
          error: error
        )
      }
    }

    AsyncFunction("btcAddress") { (
      _ sessionId: String,
      _ apiNetwork: String,
      _ keypath: Either<String, [Int]>,
      _ scriptConfig: [String: Any],
      _ display: Bool
    ) throws -> String in
      let client = try self.sessions.session(sessionId).client
      let keypathString = try bitboxKeypathString(keypath)
      let scriptConfigJSON = try bitboxScriptConfigJSONString(scriptConfig)
      return try bitboxCallString { error in
        client.btcAddress(
          apiNetwork,
          keypath: keypathString,
          scriptConfigJSON: scriptConfigJSON,
          display: display,
          error: error
        )
      }
    }

    AsyncFunction("btcRegisterScriptConfig") { (
      _ sessionId: String,
      _ apiNetwork: String,
      _ scriptConfig: [String: Any],
      _ keypathAccount: Either<String, [Int]>?,
      _ xpubType: String,
      _ name: String?
    ) throws in
      let client = try self.sessions.session(sessionId).client
      let scriptConfigJSON = try bitboxScriptConfigJSONString(scriptConfig)
      let keypathAccountString = try bitboxOptionalKeypathString(keypathAccount)
      try client.btcRegisterScriptConfig(
        apiNetwork,
        scriptConfigJSON: scriptConfigJSON,
        keypathAccount: keypathAccountString,
        xpubType: xpubType,
        name: name ?? ""
      )
    }

    AsyncFunction("btcIsScriptConfigRegistered") { (
      _ sessionId: String,
      _ apiNetwork: String,
      _ scriptConfig: [String: Any],
      _ keypathAccount: Either<String, [Int]>?
    ) throws -> Bool in
      let client = try self.sessions.session(sessionId).client
      let scriptConfigJSON = try bitboxScriptConfigJSONString(scriptConfig)
      let keypathAccountString = try bitboxOptionalKeypathString(keypathAccount)
      var registered = ObjCBool(false)
      try client.btcIsScriptConfigRegistered(
        apiNetwork,
        scriptConfigJSON: scriptConfigJSON,
        keypathAccount: keypathAccountString,
        ret0_: &registered
      )
      return registered.boolValue
    }

    AsyncFunction("btcSignPSBT") { (
      _ sessionId: String,
      _ apiNetwork: String,
      _ psbt: String,
      _ forceScriptConfig: [String: Any]?,
      _ formatUnit: String
    ) throws -> String in
      let client = try self.sessions.session(sessionId).client
      let forceScriptConfigJSON = try bitboxScriptConfigWithKeypathJSONString(forceScriptConfig)
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
  }
}
