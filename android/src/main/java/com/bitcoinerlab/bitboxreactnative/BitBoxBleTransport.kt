package com.bitcoinerlab.bitboxreactnative

import android.annotation.SuppressLint
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothGatt
import android.bluetooth.BluetoothGattCallback
import android.bluetooth.BluetoothGattCharacteristic
import android.bluetooth.BluetoothGattDescriptor
import android.bluetooth.BluetoothManager
import android.bluetooth.BluetoothProfile
import android.bluetooth.le.ScanCallback
import android.bluetooth.le.ScanFilter
import android.bluetooth.le.ScanResult
import android.bluetooth.le.ScanSettings
import android.content.Context
import android.os.Build
import android.os.ParcelUuid
import com.bitcoinerlab.bitboxreactnative.go.bitboxnative.MobileTransport
import java.io.ByteArrayOutputStream
import java.util.UUID
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import kotlin.math.max
import kotlin.math.min
import org.json.JSONObject

private val BITBOX_BLE_SERVICE_UUID: UUID = UUID.fromString("e1511a45-f3db-44c0-82b8-6c880790d1f1")
private val BITBOX_BLE_WRITER_UUID: UUID = UUID.fromString("799d485c-d354-4ed0-b577-f8ee79ec275a")
private val BITBOX_BLE_READER_UUID: UUID = UUID.fromString("419572a5-9f53-4eb1-8db7-61bcab928867")
private val BITBOX_BLE_PRODUCT_UUID: UUID = UUID.fromString("9d1c9a77-8b03-4e49-8053-3955cda7da93")
private val CLIENT_CHARACTERISTIC_CONFIG_UUID: UUID = UUID.fromString("00002902-0000-1000-8000-00805f9b34fb")
private const val BITBOX_BLE_MAX_CHARACTERISTIC_LENGTH = 5 * 64

class BitBoxBleTransport(
  private val context: Context,
  private val timeoutMs: Int,
  private val deviceId: String?
) : MobileTransport {
  private val readLock = Object()
  private val writeLock = Object()
  private val readyLatch = CountDownLatch(1)
  private val normalizedDeviceId = deviceId?.uppercase()

  @Volatile private var scanner: android.bluetooth.le.BluetoothLeScanner? = null
  @Volatile private var gatt: BluetoothGatt? = null
  @Volatile private var writerCharacteristic: BluetoothGattCharacteristic? = null
  @Volatile private var readerReady = false
  @Volatile private var closed = false
  @Volatile private var connectionError: Throwable? = null
  @Volatile private var productInfo: BitBoxProductInfo? = null
  @Volatile private var maxWriteLength = 20

  private var readBuffer = ByteArray(0)
  private var pendingWriteLatch: CountDownLatch? = null
  private var pendingWriteError: Throwable? = null

  @SuppressLint("MissingPermission")
  fun connect(): BitBoxProductInfo {
    val bluetoothManager = context.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager
      ?: throw BitBoxNativeException("Bluetooth manager is not available")
    val adapter = bluetoothManager.adapter
      ?: throw BitBoxNativeException("Bluetooth is not supported on this device")
    if (!adapter.isEnabled) {
      throw BitBoxNativeException("Bluetooth is powered off")
    }
    scanner = adapter.bluetoothLeScanner
      ?: throw BitBoxNativeException("Bluetooth LE scanner is not available")

    val filter = ScanFilter.Builder()
      .setServiceUuid(ParcelUuid(BITBOX_BLE_SERVICE_UUID))
      .build()
    val settings = ScanSettings.Builder()
      .setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY)
      .build()
    scanner?.startScan(listOf(filter), settings, scanCallback)

    if (!readyLatch.await(timeoutMs.toLong(), TimeUnit.MILLISECONDS)) {
      close()
      throw BitBoxNativeException("Timed out waiting for a BitBox Nova BLE device")
    }
    currentConnectionError()?.let { throw it }
    return productInfo
      ?: throw BitBoxNativeException("BitBox Nova BLE product information was not received")
  }

  private val scanCallback = object : ScanCallback() {
    @SuppressLint("MissingPermission")
    override fun onScanResult(callbackType: Int, result: ScanResult) {
      val device = result.device ?: return
      if (normalizedDeviceId != null && device.address.uppercase() != normalizedDeviceId) {
        return
      }
      try {
        scanner?.stopScan(this)
      } catch (_: Throwable) {}
      gatt = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
        device.connectGatt(context, false, gattCallback, BluetoothDevice.TRANSPORT_LE)
      } else {
        device.connectGatt(context, false, gattCallback)
      }
    }

    override fun onScanFailed(errorCode: Int) {
      fail("Bluetooth LE scan failed with code $errorCode")
    }
  }

  private val gattCallback = object : BluetoothGattCallback() {
    @SuppressLint("MissingPermission")
    override fun onConnectionStateChange(gatt: BluetoothGatt, status: Int, newState: Int) {
      if (status != BluetoothGatt.GATT_SUCCESS) {
        fail("BitBox Nova BLE connection failed with GATT status $status")
        return
      }
      when (newState) {
        BluetoothProfile.STATE_CONNECTED -> {
          if (!gatt.requestMtu(517)) {
            gatt.discoverServices()
          }
        }
        BluetoothProfile.STATE_DISCONNECTED -> {
          if (!closed) fail("BitBox Nova BLE peripheral disconnected")
        }
      }
    }

    @SuppressLint("MissingPermission")
    override fun onMtuChanged(gatt: BluetoothGatt, mtu: Int, status: Int) {
      if (status == BluetoothGatt.GATT_SUCCESS) {
        val payloadLength = max(20, mtu - 3)
        maxWriteLength = if (payloadLength >= 64) {
          min(BITBOX_BLE_MAX_CHARACTERISTIC_LENGTH, (payloadLength / 64) * 64)
        } else {
          payloadLength
        }
      }
      gatt.discoverServices()
    }

    @SuppressLint("MissingPermission")
    override fun onServicesDiscovered(gatt: BluetoothGatt, status: Int) {
      if (status != BluetoothGatt.GATT_SUCCESS) {
        fail("BitBox Nova BLE service discovery failed with GATT status $status")
        return
      }
      val service = gatt.getService(BITBOX_BLE_SERVICE_UUID)
      if (service == null) {
        fail("BitBox Nova BLE service was not found")
        return
      }
      writerCharacteristic = service.getCharacteristic(BITBOX_BLE_WRITER_UUID)
      val readerCharacteristic = service.getCharacteristic(BITBOX_BLE_READER_UUID)
      val productCharacteristic = service.getCharacteristic(BITBOX_BLE_PRODUCT_UUID)
      if (writerCharacteristic == null || readerCharacteristic == null || productCharacteristic == null) {
        fail("BitBox Nova BLE characteristics were not found")
        return
      }
      writerCharacteristic?.writeType = BluetoothGattCharacteristic.WRITE_TYPE_DEFAULT
      enableNotifications(gatt, readerCharacteristic, "reader")
    }

    @SuppressLint("MissingPermission")
    override fun onDescriptorWrite(
      gatt: BluetoothGatt,
      descriptor: BluetoothGattDescriptor,
      status: Int
    ) {
      if (status != BluetoothGatt.GATT_SUCCESS) {
        val name = characteristicName(descriptor.characteristic)
        fail(
          "BitBox Nova BLE $name notification setup failed with GATT status $status " +
            "and properties ${descriptor.characteristic.properties}"
        )
        return
      }
      val characteristic = descriptor.characteristic
      if (characteristic.uuid == BITBOX_BLE_READER_UUID) {
        readerReady = true
        val productCharacteristic = gatt.getService(BITBOX_BLE_SERVICE_UUID)
          ?.getCharacteristic(BITBOX_BLE_PRODUCT_UUID)
        if (productCharacteristic == null) {
          fail("BitBox Nova BLE product characteristic was not found")
          return
        }
        enableNotifications(gatt, productCharacteristic, "product")
        return
      }
      if (characteristic.uuid == BITBOX_BLE_PRODUCT_UUID) {
        gatt.readCharacteristic(characteristic)
      }
    }

    override fun onCharacteristicChanged(
      gatt: BluetoothGatt,
      characteristic: BluetoothGattCharacteristic
    ) {
      @Suppress("DEPRECATION")
      handleCharacteristicValue(characteristic, characteristic.value ?: ByteArray(0))
    }

    override fun onCharacteristicChanged(
      gatt: BluetoothGatt,
      characteristic: BluetoothGattCharacteristic,
      value: ByteArray
    ) {
      handleCharacteristicValue(characteristic, value)
    }

    override fun onCharacteristicRead(
      gatt: BluetoothGatt,
      characteristic: BluetoothGattCharacteristic,
      status: Int
    ) {
      if (status != BluetoothGatt.GATT_SUCCESS) return
      @Suppress("DEPRECATION")
      handleCharacteristicValue(characteristic, characteristic.value ?: ByteArray(0))
    }

    override fun onCharacteristicRead(
      gatt: BluetoothGatt,
      characteristic: BluetoothGattCharacteristic,
      value: ByteArray,
      status: Int
    ) {
      if (status == BluetoothGatt.GATT_SUCCESS) {
        handleCharacteristicValue(characteristic, value)
      }
    }

    override fun onCharacteristicWrite(
      gatt: BluetoothGatt,
      characteristic: BluetoothGattCharacteristic,
      status: Int
    ) {
      synchronized(writeLock) {
        if (status != BluetoothGatt.GATT_SUCCESS) {
          pendingWriteError = BitBoxNativeException("BitBox Nova BLE write failed with GATT status $status")
        }
        pendingWriteLatch?.countDown()
      }
    }
  }

  @SuppressLint("MissingPermission")
  private fun enableNotifications(
    gatt: BluetoothGatt,
    characteristic: BluetoothGattCharacteristic,
    name: String
  ) {
    val cccdValue = when {
      characteristic.properties and BluetoothGattCharacteristic.PROPERTY_NOTIFY != 0 ->
        BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE
      characteristic.properties and BluetoothGattCharacteristic.PROPERTY_INDICATE != 0 ->
        BluetoothGattDescriptor.ENABLE_INDICATION_VALUE
      else -> {
        fail(
          "BitBox Nova BLE $name characteristic does not support notifications or indications " +
            "(properties ${characteristic.properties})"
        )
        return
      }
    }
    if (!gatt.setCharacteristicNotification(characteristic, true)) {
      fail(
        "Failed to enable BitBox Nova BLE $name notifications " +
          "(properties ${characteristic.properties})"
      )
      return
    }
    val descriptor = characteristic.getDescriptor(CLIENT_CHARACTERISTIC_CONFIG_UUID)
    if (descriptor == null) {
      fail("BitBox Nova BLE $name notification descriptor was not found")
      return
    }
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      val status = gatt.writeDescriptor(descriptor, cccdValue)
      if (status != 0) {
        fail(
          "Failed to write BitBox Nova BLE $name notification descriptor " +
            "(write status $status, properties ${characteristic.properties})"
        )
      }
    } else {
      @Suppress("DEPRECATION")
      descriptor.value = cccdValue
      @Suppress("DEPRECATION")
      if (!gatt.writeDescriptor(descriptor)) {
        fail(
          "Failed to write BitBox Nova BLE $name notification descriptor " +
            "(properties ${characteristic.properties})"
        )
      }
    }
  }

  private fun characteristicName(characteristic: BluetoothGattCharacteristic): String =
    when (characteristic.uuid) {
      BITBOX_BLE_READER_UUID -> "reader"
      BITBOX_BLE_PRODUCT_UUID -> "product"
      BITBOX_BLE_WRITER_UUID -> "writer"
      else -> characteristic.uuid.toString()
    }

  private fun handleCharacteristicValue(
    characteristic: BluetoothGattCharacteristic,
    value: ByteArray
  ) {
    when (characteristic.uuid) {
      BITBOX_BLE_READER_UUID -> {
        synchronized(readLock) {
          readBuffer += value
          readLock.notifyAll()
        }
      }
      BITBOX_BLE_PRODUCT_UUID -> {
        if (value.isEmpty()) return
        try {
          val json = JSONObject(String(value, Charsets.UTF_8))
          productInfo = BitBoxProductInfo(
            product = json.getString("p"),
            version = json.getString("v")
          )
          checkReady()
        } catch (error: Throwable) {
          fail(BitBoxNativeException("Failed to parse BitBox Nova product information", error))
        }
      }
    }
  }

  override fun read(n: Long): ByteArray {
    if (n <= 0) return ByteArray(0)
    if (n > Int.MAX_VALUE) throw BitBoxNativeException("BitBox BLE read length is too large")
    val output = ByteArrayOutputStream(n.toInt())
    val deadline = System.currentTimeMillis() + timeoutMs
    while (output.size() < n.toInt()) {
      currentConnectionError()?.let { throw it }
      synchronized(readLock) {
        if (readBuffer.isNotEmpty()) {
          val count = min(n.toInt() - output.size(), readBuffer.size)
          output.write(readBuffer, 0, count)
          readBuffer = readBuffer.copyOfRange(count, readBuffer.size)
          return@synchronized
        }
        val remainingMs = deadline - System.currentTimeMillis()
        if (remainingMs <= 0) {
          throw BitBoxNativeException("Timed out reading from BitBox Nova BLE peripheral")
        }
        readLock.wait(remainingMs)
      }
    }
    return output.toByteArray()
  }

  @SuppressLint("MissingPermission")
  override fun write(data: ByteArray): Long {
    if (data.isEmpty()) return 0
    currentConnectionError()?.let { throw it }
    val localGatt = gatt ?: throw BitBoxNativeException("BitBox Nova BLE peripheral is not connected")
    val characteristic = writerCharacteristic
      ?: throw BitBoxNativeException("BitBox Nova BLE writer characteristic is not available")
    val count = min(data.size, min(BITBOX_BLE_MAX_CHARACTERISTIC_LENGTH, maxWriteLength))
    if (count <= 0) return 0
    val chunk = data.copyOfRange(0, count)
    val latch = CountDownLatch(1)
    synchronized(writeLock) {
      if (pendingWriteLatch != null) {
        throw BitBoxNativeException("BitBox Nova BLE write already in progress")
      }
      pendingWriteError = null
      pendingWriteLatch = latch
    }
    val started = try {
      @Suppress("DEPRECATION")
      characteristic.value = chunk
      characteristic.writeType = BluetoothGattCharacteristic.WRITE_TYPE_DEFAULT
      localGatt.writeCharacteristic(characteristic)
    } catch (error: Throwable) {
      synchronized(writeLock) {
        pendingWriteLatch = null
      }
      throw error
    }
    if (!started) {
      synchronized(writeLock) {
        pendingWriteLatch = null
      }
      throw BitBoxNativeException("Failed to write to BitBox Nova BLE peripheral")
    }
    if (!latch.await(timeoutMs.toLong(), TimeUnit.MILLISECONDS)) {
      synchronized(writeLock) {
        pendingWriteLatch = null
      }
      throw BitBoxNativeException("Timed out writing to BitBox Nova BLE peripheral")
    }
    synchronized(writeLock) {
      val error = pendingWriteError
      pendingWriteError = null
      pendingWriteLatch = null
      if (error != null) throw error
    }
    return count.toLong()
  }

  @SuppressLint("MissingPermission")
  override fun close() {
    closed = true
    try {
      scanner?.stopScan(scanCallback)
    } catch (_: Throwable) {}
    scanner = null
    try {
      gatt?.disconnect()
      gatt?.close()
    } catch (_: Throwable) {}
    gatt = null
    writerCharacteristic = null
    synchronized(readLock) {
      readLock.notifyAll()
    }
    synchronized(writeLock) {
      pendingWriteLatch?.countDown()
    }
    readyLatch.countDown()
  }

  private fun checkReady() {
    if (writerCharacteristic != null && readerReady && productInfo != null) {
      readyLatch.countDown()
    }
  }

  private fun currentConnectionError(): Throwable? = connectionError

  private fun fail(message: String) {
    fail(BitBoxNativeException(message))
  }

  private fun fail(error: Throwable) {
    if (connectionError == null) {
      connectionError = error
    }
    synchronized(readLock) {
      readLock.notifyAll()
    }
    synchronized(writeLock) {
      pendingWriteLatch?.countDown()
    }
    readyLatch.countDown()
  }
}
