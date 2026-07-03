import ExpoModulesCore
import Foundation

private let bitboxNativeModuleName = "BitcoinerlabBitBox"

private func bitboxNotImplemented(_ methodName: String) -> Error {
  NSError(
    domain: bitboxNativeModuleName,
    code: 1,
    userInfo: [
      NSLocalizedDescriptionKey:
        "\(bitboxNativeModuleName).\(methodName) is not implemented yet. Real BitBox BLE/USB/protocol support still needs native transport code and the Go protocol layer."
    ]
  )
}

public class BitcoinerlabBitBoxModule: Module {
  public func definition() -> ModuleDefinition {
    Name(bitboxNativeModuleName)

    AsyncFunction("connect") { (_ params: [String: Any]) throws -> [String: Any] in
      _ = params
      throw bitboxNotImplemented("connect")
    }

    AsyncFunction("disconnect") { (_ sessionId: String) throws in
      _ = sessionId
      throw bitboxNotImplemented("disconnect")
    }

    AsyncFunction("version") { (_ sessionId: String) throws -> String in
      _ = sessionId
      throw bitboxNotImplemented("version")
    }

    AsyncFunction("rootFingerprint") { (_ sessionId: String) throws -> String in
      _ = sessionId
      throw bitboxNotImplemented("rootFingerprint")
    }

    AsyncFunction("btcXpub") { (
      _ sessionId: String,
      _ apiNetwork: String,
      _ keypath: Either<String, [Int]>,
      _ xpubType: String,
      _ display: Bool
    ) throws -> String in
      _ = (sessionId, apiNetwork, keypath, xpubType, display)
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
      _ xpubType: String,
      _ name: String?
    ) throws in
      _ = (sessionId, apiNetwork, scriptConfig, keypathAccount, xpubType, name)
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
