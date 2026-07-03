package com.bitcoinerlab.bitboxreactnative

import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

private const val BITBOX_NATIVE_MODULE_NAME = "BitcoinerlabBitBox"

private class BitcoinerlabBitBoxNotImplementedException(methodName: String) :
  CodedException(
    "$BITBOX_NATIVE_MODULE_NAME.$methodName is not implemented yet. Real BitBox BLE/USB/protocol support still needs native transport code and the Go protocol layer."
  )

@Suppress("UNUSED_PARAMETER")
class BitcoinerlabBitBoxModule : Module() {
  override fun definition() = ModuleDefinition {
    Name(BITBOX_NATIVE_MODULE_NAME)

    AsyncFunction("connect") { params: Map<String, Any?> ->
      throw BitcoinerlabBitBoxNotImplementedException("connect")
    }

    AsyncFunction("disconnect") { sessionId: String ->
      throw BitcoinerlabBitBoxNotImplementedException("disconnect")
    }

    AsyncFunction("version") { sessionId: String ->
      throw BitcoinerlabBitBoxNotImplementedException("version")
    }

    AsyncFunction("rootFingerprint") { sessionId: String ->
      throw BitcoinerlabBitBoxNotImplementedException("rootFingerprint")
    }

    AsyncFunction("btcXpub") { sessionId: String,
      apiNetwork: String,
      keypath: Any,
      display: Boolean ->
      throw BitcoinerlabBitBoxNotImplementedException("btcXpub")
    }

    AsyncFunction("btcAddress") { sessionId: String,
      apiNetwork: String,
      keypath: Any,
      scriptConfig: Map<String, Any?>,
      display: Boolean ->
      throw BitcoinerlabBitBoxNotImplementedException("btcAddress")
    }

    AsyncFunction("btcRegisterScriptConfig") { sessionId: String,
      apiNetwork: String,
      scriptConfig: Map<String, Any?>,
      keypathAccount: Any?,
      name: String? ->
      throw BitcoinerlabBitBoxNotImplementedException("btcRegisterScriptConfig")
    }

    AsyncFunction("btcIsScriptConfigRegistered") { sessionId: String,
      apiNetwork: String,
      scriptConfig: Map<String, Any?>,
      keypathAccount: Any? ->
      throw BitcoinerlabBitBoxNotImplementedException("btcIsScriptConfigRegistered")
    }

    AsyncFunction("btcSignPSBT") { sessionId: String,
      apiNetwork: String,
      psbt: String,
      forceScriptConfig: Map<String, Any?>?,
      formatUnit: String ->
      throw BitcoinerlabBitBoxNotImplementedException("btcSignPSBT")
    }
  }
}
