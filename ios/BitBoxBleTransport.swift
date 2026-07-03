import Bitboxnative
import CoreBluetooth
import Foundation

private let bitboxBleServiceUUID = CBUUID(string: "e1511a45-f3db-44c0-82b8-6c880790d1f1")
private let bitboxBleWriterUUID = CBUUID(string: "799d485c-d354-4ed0-b577-f8ee79ec275a")
private let bitboxBleReaderUUID = CBUUID(string: "419572a5-9f53-4eb1-8db7-61bcab928867")
private let bitboxBleProductUUID = CBUUID(string: "9d1c9a77-8b03-4e49-8053-3955cda7da93")
private let bitboxBleMaxCharacteristicLength = 5 * 64

struct BitBoxNativeError: LocalizedError {
  let message: String

  var errorDescription: String? {
    message
  }
}

struct BitBoxBleProductInfo: Decodable {
  let product: String
  let version: String

  enum CodingKeys: String, CodingKey {
    case product = "p"
    case version = "v"
  }
}

final class BitBoxBleTransport: NSObject, CBCentralManagerDelegate, CBPeripheralDelegate,
  BitcoinerlabBitBoxBitboxnativeMobileTransportProtocol
{
  private let queue = DispatchQueue(label: "com.bitcoinerlab.bitboxreactnative.ble")
  private let poweredOnSemaphore = DispatchSemaphore(value: 0)
  private let readySemaphore = DispatchSemaphore(value: 0)
  private let readSemaphore = DispatchSemaphore(value: 0)
  private let readBufferLock = NSLock()
  private let operationTimeoutMs: Int

  private var centralManager: CBCentralManager?
  private var targetDeviceId: String?
  private var peripheral: CBPeripheral?
  private var writerCharacteristic: CBCharacteristic?
  private var readerCharacteristic: CBCharacteristic?
  private var productCharacteristic: CBCharacteristic?
  private var readerReady = false
  private var readySignaled = false
  private var closed = false
  private var connectionError: Error?
  private var readBuffer = Data()
  private var maxWriteLength = 64

  private(set) var productInfo: BitBoxBleProductInfo?

  init(timeoutMs: Int) {
    operationTimeoutMs = max(timeoutMs, 1)
    super.init()
  }

  func connect(deviceId: String?) throws -> BitBoxBleProductInfo {
    let deadline = DispatchTime.now() + .milliseconds(operationTimeoutMs)
    queue.sync {
      targetDeviceId = deviceId?.uppercased()
      centralManager = CBCentralManager(delegate: self, queue: queue)
    }

    if poweredOnSemaphore.wait(timeout: deadline) == .timedOut {
      try? close()
      throw BitBoxNativeError(message: "Timed out waiting for Bluetooth to become available")
    }
    if let error = currentConnectionError() {
      throw error
    }

    queue.sync {
      centralManager?.scanForPeripherals(withServices: [bitboxBleServiceUUID], options: nil)
    }

    if readySemaphore.wait(timeout: deadline) == .timedOut {
      try? close()
      throw BitBoxNativeError(message: "Timed out waiting for a BitBox Nova BLE device")
    }
    if let error = currentConnectionError() {
      throw error
    }
    guard let productInfo = queue.sync(execute: { self.productInfo }) else {
      throw BitBoxNativeError(message: "BitBox Nova BLE product information was not received")
    }
    return productInfo
  }

  func centralManagerDidUpdateState(_ central: CBCentralManager) {
    switch central.state {
    case .poweredOn:
      poweredOnSemaphore.signal()
    case .unauthorized:
      fail("Bluetooth permission was denied")
    case .poweredOff:
      fail("Bluetooth is powered off")
    case .unsupported:
      fail("Bluetooth is not supported on this device")
    case .resetting, .unknown:
      break
    @unknown default:
      fail("Bluetooth entered an unknown state")
    }
  }

  func centralManager(
    _ central: CBCentralManager,
    didDiscover peripheral: CBPeripheral,
    advertisementData: [String: Any],
    rssi RSSI: NSNumber
  ) {
    _ = (advertisementData, RSSI)
    if let targetDeviceId = targetDeviceId,
      peripheral.identifier.uuidString.uppercased() != targetDeviceId
    {
      return
    }
    self.peripheral = peripheral
    peripheral.delegate = self
    central.stopScan()
    central.connect(peripheral, options: nil)
  }

  func centralManager(_ central: CBCentralManager, didConnect peripheral: CBPeripheral) {
    peripheral.discoverServices([bitboxBleServiceUUID])
  }

  func centralManager(_ central: CBCentralManager, didFailToConnect peripheral: CBPeripheral, error: Error?) {
    _ = central
    fail(error?.localizedDescription ?? "Failed to connect to BitBox Nova BLE peripheral")
  }

  func centralManager(_ central: CBCentralManager, didDisconnectPeripheral peripheral: CBPeripheral, error: Error?) {
    _ = (central, peripheral)
    if !closed {
      fail(error?.localizedDescription ?? "BitBox Nova BLE peripheral disconnected")
    }
    readSemaphore.signal()
  }

  func peripheral(_ peripheral: CBPeripheral, didDiscoverServices error: Error?) {
    if let error = error {
      fail(error.localizedDescription)
      return
    }
    guard let service = peripheral.services?.first(where: { $0.uuid == bitboxBleServiceUUID }) else {
      fail("BitBox Nova BLE service was not found")
      return
    }
    peripheral.discoverCharacteristics(
      [bitboxBleWriterUUID, bitboxBleReaderUUID, bitboxBleProductUUID],
      for: service
    )
  }

  func peripheral(
    _ peripheral: CBPeripheral,
    didDiscoverCharacteristicsFor service: CBService,
    error: Error?
  ) {
    _ = service
    if let error = error {
      fail(error.localizedDescription)
      return
    }
    for characteristic in service.characteristics ?? [] {
      switch characteristic.uuid {
      case bitboxBleWriterUUID:
        writerCharacteristic = characteristic
        let mtuLength = peripheral.maximumWriteValueLength(for: .withoutResponse)
        maxWriteLength = max(64, (mtuLength / 64) * 64)
      case bitboxBleReaderUUID:
        readerCharacteristic = characteristic
        peripheral.setNotifyValue(true, for: characteristic)
      case bitboxBleProductUUID:
        productCharacteristic = characteristic
        peripheral.setNotifyValue(true, for: characteristic)
      default:
        break
      }
    }
    if writerCharacteristic == nil || readerCharacteristic == nil || productCharacteristic == nil {
      fail("BitBox Nova BLE characteristics were not found")
    }
  }

  func peripheral(_ peripheral: CBPeripheral, didUpdateNotificationStateFor characteristic: CBCharacteristic, error: Error?) {
    _ = peripheral
    if let error = error {
      fail(error.localizedDescription)
      return
    }
    if characteristic.uuid == bitboxBleReaderUUID {
      readerReady = characteristic.isNotifying
      checkReady()
    }
  }

  func peripheral(_ peripheral: CBPeripheral, didUpdateValueFor characteristic: CBCharacteristic, error: Error?) {
    _ = peripheral
    if let error = error {
      fail(error.localizedDescription)
      return
    }
    guard let value = characteristic.value else {
      return
    }

    if characteristic.uuid == bitboxBleReaderUUID {
      readBufferLock.lock()
      readBuffer.append(value)
      readBufferLock.unlock()
      readSemaphore.signal()
      return
    }

    if characteristic.uuid == bitboxBleProductUUID {
      if value.isEmpty {
        return
      }
      do {
        productInfo = try JSONDecoder().decode(BitBoxBleProductInfo.self, from: value)
        checkReady()
      } catch {
        fail("Failed to parse BitBox Nova product information")
      }
    }
  }

  func read(_ n: Int) throws -> Data {
    if n <= 0 {
      return Data()
    }

    let deadline = DispatchTime.now() + .milliseconds(operationTimeoutMs)
    var data = Data()
    while data.count < n {
      readBufferLock.lock()
      if !readBuffer.isEmpty {
        let count = min(n - data.count, readBuffer.count)
        data.append(readBuffer.prefix(count))
        readBuffer.removeSubrange(0..<count)
        readBufferLock.unlock()
        continue
      }
      readBufferLock.unlock()

      if let error = currentConnectionError() {
        throw error
      }
      if !isConnected() {
        throw BitBoxNativeError(message: "BitBox Nova BLE peripheral is not connected")
      }
      if readSemaphore.wait(timeout: deadline) == .timedOut {
        throw BitBoxNativeError(message: "Timed out reading from BitBox Nova BLE peripheral")
      }
    }
    return data
  }

  func write(_ data: Data?, ret0_: UnsafeMutablePointer<Int>?) throws {
    guard let data = data, !data.isEmpty else {
      ret0_?.pointee = 0
      return
    }

    let written = try queue.sync { () throws -> Int in
      if let connectionError = connectionError {
        throw connectionError
      }
      guard !closed,
        let peripheral = peripheral,
        let writerCharacteristic = writerCharacteristic
      else {
        throw BitBoxNativeError(message: "BitBox Nova BLE peripheral is not connected")
      }
      let count = min(bitboxBleMaxCharacteristicLength, maxWriteLength, data.count)
      guard count > 0 else {
        return 0
      }
      peripheral.writeValue(Data(data.prefix(count)), for: writerCharacteristic, type: .withResponse)
      return count
    }
    ret0_?.pointee = written
  }

  func close() throws {
    queue.sync {
      closed = true
      centralManager?.stopScan()
      if let peripheral = peripheral {
        centralManager?.cancelPeripheralConnection(peripheral)
      }
      peripheral = nil
      writerCharacteristic = nil
      readerCharacteristic = nil
      productCharacteristic = nil
      readerReady = false
    }
    readSemaphore.signal()
  }

  private func currentConnectionError() -> Error? {
    queue.sync {
      connectionError
    }
  }

  private func isConnected() -> Bool {
    queue.sync {
      !closed && peripheral != nil && writerCharacteristic != nil && readerReady
    }
  }

  private func fail(_ message: String) {
    fail(BitBoxNativeError(message: message))
  }

  private func fail(_ error: Error) {
    if connectionError == nil {
      connectionError = error
    }
    poweredOnSemaphore.signal()
    readySemaphore.signal()
    readSemaphore.signal()
  }

  private func checkReady() {
    guard !readySignaled, writerCharacteristic != nil, readerReady, productInfo != nil else {
      return
    }
    readySignaled = true
    readySemaphore.signal()
  }
}
