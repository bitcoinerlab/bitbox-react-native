import Bitboxnative
import ExpoModulesCore
import Foundation

private let bitboxNativeModuleName = "BitcoinerlabBitBox"
private let bitboxDefaultConnectTimeoutMs = 30_000

private func bitboxNotImplemented(_ methodName: String) -> Error {
  NSError(
    domain: bitboxNativeModuleName,
    code: 1,
    userInfo: [
      NSLocalizedDescriptionKey:
        "\(bitboxNativeModuleName).\(methodName) is not implemented yet on iOS. The initial BLE path only wires connect, disconnect, version, and rootFingerprint."
    ]
  )
}

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
      _ display: Bool
    ) throws -> String in
      _ = (sessionId, apiNetwork, keypath, display)
      throw bitboxNotImplemented("btcXpub")
    }

    AsyncFunction("btcAddress") { (
      _ sessionId: String,
      _ apiNetwork: String,
      _ keypath: Either<String, [Int]>,
      _ scriptConfig: [String: Any],
      _ display: Bool
    ) throws -> String in
      _ = (sessionId, apiNetwork, keypath, scriptConfig, display)
      throw bitboxNotImplemented("btcAddress")
    }

    AsyncFunction("btcRegisterScriptConfig") { (
      _ sessionId: String,
      _ apiNetwork: String,
      _ scriptConfig: [String: Any],
      _ keypathAccount: Either<String, [Int]>?,
      _ name: String?
    ) throws in
      _ = (sessionId, apiNetwork, scriptConfig, keypathAccount, name)
      throw bitboxNotImplemented("btcRegisterScriptConfig")
    }

    AsyncFunction("btcIsScriptConfigRegistered") { (
      _ sessionId: String,
      _ apiNetwork: String,
      _ scriptConfig: [String: Any],
      _ keypathAccount: Either<String, [Int]>?
    ) throws -> Bool in
      _ = (sessionId, apiNetwork, scriptConfig, keypathAccount)
      throw bitboxNotImplemented("btcIsScriptConfigRegistered")
    }

    AsyncFunction("btcSignPSBT") { (
      _ sessionId: String,
      _ apiNetwork: String,
      _ psbt: String,
      _ forceScriptConfig: [String: Any]?,
      _ formatUnit: String
    ) throws -> String in
      _ = (sessionId, apiNetwork, psbt, forceScriptConfig, formatUnit)
      throw bitboxNotImplemented("btcSignPSBT")
    }
  }
}
