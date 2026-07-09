package com.bitcoinerlab.bitboxreactnative

import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.hardware.usb.UsbConstants
import android.hardware.usb.UsbDevice
import android.hardware.usb.UsbDeviceConnection
import android.hardware.usb.UsbEndpoint
import android.hardware.usb.UsbInterface
import android.hardware.usb.UsbManager
import android.os.Build
import com.bitcoinerlab.bitboxreactnative.go.bitboxnative.MobileTransport
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

private const val BITBOX_USB_VENDOR_ID = 1003
private const val BITBOX_USB_PRODUCT_ID = 9219

class BitBoxUsbTransport(
  private val context: Context,
  private val timeoutMs: Int,
  private val deviceId: String?
) : MobileTransport {
  private var connection: UsbDeviceConnection? = null
  private var usbInterface: UsbInterface? = null
  private var endpointIn: UsbEndpoint? = null
  private var endpointOut: UsbEndpoint? = null

  fun connect(): BitBoxProductInfo {
    val usbManager = context.getSystemService(Context.USB_SERVICE) as? UsbManager
      ?: throw BitBoxNativeException("USB manager is not available")
    val device = findBitBoxDevice(usbManager)
      ?: throw BitBoxNativeException("No BitBox USB device found")
    ensureUsbPermission(usbManager, device)
    val endpoints = findEndpoints(device)
    val openedConnection = usbManager.openDevice(device)
      ?: throw BitBoxNativeException("Failed to open BitBox USB device")
    if (!openedConnection.claimInterface(endpoints.usbInterface, true)) {
      openedConnection.close()
      throw BitBoxNativeException("Failed to claim BitBox USB interface")
    }
    connection = openedConnection
    usbInterface = endpoints.usbInterface
    endpointIn = endpoints.endpointIn
    endpointOut = endpoints.endpointOut
    return BitBoxProductInfo(
      product = device.productName ?: "BitBox",
      version = ""
    )
  }

  private fun findBitBoxDevice(usbManager: UsbManager): UsbDevice? =
    usbManager.deviceList.values.firstOrNull { device ->
      device.vendorId == BITBOX_USB_VENDOR_ID &&
        device.productId == BITBOX_USB_PRODUCT_ID &&
        (deviceId == null || device.deviceName.equals(deviceId, ignoreCase = true))
    }

  private fun ensureUsbPermission(usbManager: UsbManager, device: UsbDevice) {
    if (usbManager.hasPermission(device)) return
    val action = "${context.packageName}.bitcoinerlab.bitbox.USB_PERMISSION"
    val latch = CountDownLatch(1)
    var granted = false
    val receiver = object : BroadcastReceiver() {
      override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != action) return
        val receivedDevice = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
          intent.getParcelableExtra(UsbManager.EXTRA_DEVICE, UsbDevice::class.java)
        } else {
          @Suppress("DEPRECATION")
          intent.getParcelableExtra(UsbManager.EXTRA_DEVICE) as? UsbDevice
        }
        if (receivedDevice?.deviceName == device.deviceName) {
          granted = intent.getBooleanExtra(UsbManager.EXTRA_PERMISSION_GRANTED, false)
          latch.countDown()
        }
      }
    }
    val filter = IntentFilter(action)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      context.registerReceiver(receiver, filter, Context.RECEIVER_NOT_EXPORTED)
    } else {
      @Suppress("DEPRECATION")
      context.registerReceiver(receiver, filter)
    }
    try {
      val intent = Intent(action).setPackage(context.packageName)
      val pendingIntent = PendingIntent.getBroadcast(
        context,
        0,
        intent,
        PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
      )
      usbManager.requestPermission(device, pendingIntent)
      if (!latch.await(timeoutMs.toLong(), TimeUnit.MILLISECONDS)) {
        throw BitBoxNativeException("Timed out waiting for BitBox USB permission")
      }
      if (!granted) {
        throw BitBoxNativeException("BitBox USB permission was denied")
      }
    } finally {
      try {
        context.unregisterReceiver(receiver)
      } catch (_: Throwable) {}
    }
  }

  private fun findEndpoints(device: UsbDevice): BitBoxUsbEndpoints {
    for (interfaceIndex in 0 until device.interfaceCount) {
      val currentInterface = device.getInterface(interfaceIndex)
      var input: UsbEndpoint? = null
      var output: UsbEndpoint? = null
      for (endpointIndex in 0 until currentInterface.endpointCount) {
        val endpoint = currentInterface.getEndpoint(endpointIndex)
        when (endpoint.direction) {
          UsbConstants.USB_DIR_IN -> input = endpoint
          UsbConstants.USB_DIR_OUT -> output = endpoint
        }
      }
      if (input != null && output != null) {
        return BitBoxUsbEndpoints(currentInterface, input, output)
      }
    }
    throw BitBoxNativeException("BitBox USB input/output endpoints were not found")
  }

  override fun read(n: Long): ByteArray {
    if (n <= 0) return ByteArray(0)
    if (n > Int.MAX_VALUE) throw BitBoxNativeException("BitBox USB read length is too large")
    val localConnection = connection
      ?: throw BitBoxNativeException("BitBox USB device is not connected")
    val localEndpointIn = endpointIn
      ?: throw BitBoxNativeException("BitBox USB input endpoint is not available")
    val result = ByteArray(n.toInt())
    val transferred = localConnection.bulkTransfer(
      localEndpointIn,
      result,
      result.size,
      timeoutMs
    )
    if (transferred < 0) {
      throw BitBoxNativeException("BitBox USB read failed with error code $transferred")
    }
    return if (transferred == result.size) result else result.copyOf(transferred)
  }

  override fun write(data: ByteArray): Long {
    if (data.isEmpty()) return 0
    val localConnection = connection
      ?: throw BitBoxNativeException("BitBox USB device is not connected")
    val localEndpointOut = endpointOut
      ?: throw BitBoxNativeException("BitBox USB output endpoint is not available")
    val transferred = localConnection.bulkTransfer(
      localEndpointOut,
      data,
      data.size,
      timeoutMs
    )
    if (transferred < 0) {
      throw BitBoxNativeException("BitBox USB write failed with error code $transferred")
    }
    return transferred.toLong()
  }

  override fun close() {
    val localConnection = connection
    val localInterface = usbInterface
    if (localConnection != null && localInterface != null) {
      try {
        localConnection.releaseInterface(localInterface)
      } catch (_: Throwable) {}
    }
    try {
      localConnection?.close()
    } catch (_: Throwable) {}
    connection = null
    usbInterface = null
    endpointIn = null
    endpointOut = null
  }
}

private data class BitBoxUsbEndpoints(
  val usbInterface: UsbInterface,
  val endpointIn: UsbEndpoint,
  val endpointOut: UsbEndpoint
)
