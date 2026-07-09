package com.bitcoinerlab.bitboxreactnative

import android.Manifest
import android.os.Build
import com.bitcoinerlab.bitboxreactnative.go.bitboxnative.Bitboxnative
import com.bitcoinerlab.bitboxreactnative.go.bitboxnative.Client
import com.bitcoinerlab.bitboxreactnative.go.bitboxnative.MobileTransport
import expo.modules.interfaces.permissions.PermissionsResponse
import expo.modules.interfaces.permissions.PermissionsResponseListener
import expo.modules.interfaces.permissions.PermissionsStatus
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.io.File
import org.json.JSONArray
import org.json.JSONObject

private const val BITBOX_NATIVE_MODULE_NAME = "BitcoinerlabBitBox"
private const val BITBOX_DEFAULT_CONNECT_TIMEOUT_MS = 30_000

class BitBoxNativeException(message: String, cause: Throwable? = null) :
  CodedException(message, cause)

data class BitBoxProductInfo(val product: String, val version: String)

private data class BitBoxSession(
  val id: String,
  val transportName: String,
  val transport: MobileTransport,
  val client: Client,
  val product: String,
  val version: String
)

private class BitBoxSessionStore {
  private val sessions = ConcurrentHashMap<String, BitBoxSession>()

  fun insert(
    transportName: String,
    transport: MobileTransport,
    client: Client,
    product: String,
    version: String
  ): BitBoxSession {
    val session = BitBoxSession(
      id = UUID.randomUUID().toString(),
      transportName = transportName,
      transport = transport,
      client = client,
      product = product,
      version = version
    )
    sessions[session.id] = session
    return session
  }

  fun session(sessionId: String): BitBoxSession = sessions[sessionId]
    ?: throw BitBoxNativeException("Unknown BitBox session: $sessionId")

  fun remove(sessionId: String) {
    val session = sessions.remove(sessionId)
      ?: throw BitBoxNativeException("Unknown BitBox session: $sessionId")
    session.client.close()
    session.transport.close()
  }
}

private fun bitboxTimeoutMs(params: Map<String, Any?>): Int {
  val timeoutMs = params["timeoutMs"]
  return when (timeoutMs) {
    is Number -> timeoutMs.toInt()
    else -> BITBOX_DEFAULT_CONNECT_TIMEOUT_MS
  }.coerceAtLeast(1)
}

private fun bitboxBytes(bytes: List<*>): ByteArray = bytes.map { value ->
  val byteValue = when (value) {
    is Number -> value.toInt()
    else -> throw BitBoxNativeException("BitBox byte arrays must contain numbers")
  }
  if (byteValue < 0 || byteValue > 255) {
    throw BitBoxNativeException("BitBox byte arrays must contain values from 0 to 255")
  }
  byteValue.toByte()
}.toByteArray()

// JS sends connect params as JSON so the React Native bridge only receives a
// string, never an object with nested undefined values.
private fun bitboxConnectParams(paramsJSON: String): Map<String, Any?> =
  if (paramsJSON.isEmpty()) emptyMap() else bitboxJSONObject(paramsJSON)

private fun bitboxJSONObject(string: String): Map<String, Any?> =
  bitboxJSONObjectToMap(JSONObject(string))

private fun bitboxJSONObjectToMap(jsonObject: JSONObject): Map<String, Any?> {
  val result = mutableMapOf<String, Any?>()
  val keys = jsonObject.keys()
  while (keys.hasNext()) {
    val key = keys.next()
    result[key] = bitboxJSONValue(jsonObject.get(key))
  }
  return result
}

private fun bitboxJSONArrayToList(jsonArray: JSONArray): List<Any?> =
  (0 until jsonArray.length()).map { index -> bitboxJSONValue(jsonArray.get(index)) }

private fun bitboxJSONValue(value: Any?): Any? = when (value) {
  null, JSONObject.NULL -> null
  is JSONObject -> bitboxJSONObjectToMap(value)
  is JSONArray -> bitboxJSONArrayToList(value)
  else -> value
}

private fun requiredBlePermissions(): Array<String> = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
  arrayOf(Manifest.permission.BLUETOOTH_SCAN, Manifest.permission.BLUETOOTH_CONNECT)
} else {
  arrayOf(Manifest.permission.ACCESS_FINE_LOCATION)
}

private fun ensureBlePermissions(module: Module, timeoutMs: Int) {
  val permissionsManager = module.appContext.permissions
    ?: throw BitBoxNativeException("Expo permissions service is not available; cannot request Android Bluetooth permissions")
  val permissions = requiredBlePermissions()
  val missingManifestPermissions = permissions.filterNot { permission ->
    permissionsManager.isPermissionPresentInManifest(permission)
  }
  if (missingManifestPermissions.isNotEmpty()) {
    throw BitBoxNativeException(
      "Missing Android Bluetooth manifest permissions: ${missingManifestPermissions.joinToString()}. Add @bitcoinerlab/bitbox-react-native/app.plugin to the Expo config."
    )
  }
  if (permissionsManager.hasGrantedPermissions(*permissions)) return

  val latch = CountDownLatch(1)
  var result: Map<String, PermissionsResponse>? = null
  permissionsManager.askForPermissions(
    PermissionsResponseListener { response ->
      result = response
      latch.countDown()
    },
    *permissions
  )
  if (!latch.await(timeoutMs.toLong(), TimeUnit.MILLISECONDS)) {
    throw BitBoxNativeException("Timed out waiting for Android Bluetooth permission response")
  }
  val denied = permissions.filter { permission ->
    result?.get(permission)?.status != PermissionsStatus.GRANTED
  }
  if (denied.isNotEmpty()) {
    throw BitBoxNativeException("Android Bluetooth permissions were denied: ${denied.joinToString()}")
  }
}

class BitcoinerlabBitBoxModule : Module() {
  private val sessions = BitBoxSessionStore()

  override fun definition() = ModuleDefinition {
    Name(BITBOX_NATIVE_MODULE_NAME)

    AsyncFunction("connectBle") { paramsJSON: String ->
      val params = bitboxConnectParams(paramsJSON)
      val timeoutMs = bitboxTimeoutMs(params)
      ensureBlePermissions(this@BitcoinerlabBitBoxModule, timeoutMs)
      val context = appContext.reactContext
        ?: throw BitBoxNativeException("React context is not available")
      val transport = BitBoxBleTransport(
        context = context,
        timeoutMs = timeoutMs,
        deviceId = params["deviceId"] as? String
      )
      val productInfo = try {
        transport.connect()
      } catch (error: Throwable) {
        try { transport.close() } catch (_: Throwable) {}
        throw error
      }
      val client = try {
        Bitboxnative.newClientWithMobileTransport(
          transport,
          productInfo.product,
          productInfo.version,
          true
        )
      } catch (error: Throwable) {
        try { transport.close() } catch (_: Throwable) {}
        throw error
      }
      val session = sessions.insert(
        transportName = "ble",
        transport = transport,
        client = client,
        product = productInfo.product,
        version = productInfo.version
      )
      mapOf(
        "id" to session.id,
        "transport" to session.transportName,
        "product" to session.product,
        "version" to session.version
      )
    }

    AsyncFunction("connectUsb") { paramsJSON: String ->
      val params = bitboxConnectParams(paramsJSON)
      val timeoutMs = bitboxTimeoutMs(params)
      val activity = appContext.throwingActivity
      val context = appContext.reactContext
        ?: throw BitBoxNativeException("React context is not available")
      val transport = BitBoxUsbTransport(
        context = context,
        timeoutMs = timeoutMs,
        deviceId = params["deviceId"] as? String
      )
      val productInfo = try {
        transport.connect()
      } catch (error: Throwable) {
        try { transport.close() } catch (_: Throwable) {}
        throw error
      }
      val client = try {
        Bitboxnative.newClientWithMobileTransportAndPairingConfig(
          transport,
          "",
          "",
          false,
          BitBoxPairingConfirmation(activity, timeoutMs),
          File(context.filesDir, "bitbox-usb-noise-config.json").absolutePath
        )
      } catch (error: Throwable) {
        try { transport.close() } catch (_: Throwable) {}
        throw error
      }
      val version = client.version()
      val session = sessions.insert(
        transportName = "usb",
        transport = transport,
        client = client,
        product = productInfo.product,
        version = version
      )
      mapOf(
        "id" to session.id,
        "transport" to session.transportName,
        "product" to session.product,
        "version" to session.version
      )
    }

    AsyncFunction("disconnect") { sessionId: String ->
      sessions.remove(sessionId)
    }

    AsyncFunction("version") { sessionId: String ->
      sessions.session(sessionId).client.version()
    }

    AsyncFunction("rootFingerprint") { sessionId: String ->
      sessions.session(sessionId).client.rootFingerprint()
    }

    AsyncFunction("btcXpub") { sessionId: String,
      apiNetwork: String,
      keypath: String,
      xpubType: String,
      display: Boolean ->
      sessions.session(sessionId).client.btcxPub(
        apiNetwork,
        keypath,
        xpubType,
        display
      )
    }

    // BitBox script configs arrive as JSON made in JS. This keeps parameter
    // passing predictable on Android and matches the Go mobile adapter.
    AsyncFunction("btcAddress") { sessionId: String,
      apiNetwork: String,
      keypath: String,
      scriptConfigJSON: String,
      display: Boolean ->
      sessions.session(sessionId).client.btcAddress(
        apiNetwork,
        keypath,
        scriptConfigJSON,
        display
      )
    }

    AsyncFunction("btcRegisterScriptConfig") { sessionId: String,
      apiNetwork: String,
      scriptConfigJSON: String,
      keypathAccount: String,
      xpubType: String,
      name: String ->
      sessions.session(sessionId).client.btcRegisterScriptConfig(
        apiNetwork,
        scriptConfigJSON,
        keypathAccount,
        xpubType,
        name
      )
    }

    AsyncFunction("btcIsScriptConfigRegistered") { sessionId: String,
      apiNetwork: String,
      scriptConfigJSON: String,
      keypathAccount: String ->
      sessions.session(sessionId).client.btcIsScriptConfigRegistered(
        apiNetwork,
        scriptConfigJSON,
        keypathAccount
      )
    }

    AsyncFunction("btcSignPSBT") { sessionId: String,
      apiNetwork: String,
      psbt: String,
      forceScriptConfigJSON: String,
      formatUnit: String ->
      sessions.session(sessionId).client.btcSignPSBT(
        apiNetwork,
        psbt,
        forceScriptConfigJSON,
        formatUnit
      )
    }

    AsyncFunction("btcSignMessage") { sessionId: String,
      apiNetwork: String,
      scriptConfigWithKeypathJSON: String,
      message: List<Any> ->
      val resultJSON = sessions.session(sessionId).client.btcSignMessage(
        apiNetwork,
        scriptConfigWithKeypathJSON,
        bitboxBytes(message)
      )
      bitboxJSONObject(resultJSON)
    }
  }
}
