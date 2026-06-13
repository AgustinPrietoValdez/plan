package com.agusp.calendarapp

import android.Manifest
import android.bluetooth.*
import android.bluetooth.le.*
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.ActivityResultLauncher
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat
import java.util.UUID
import java.util.concurrent.ArrayBlockingQueue
import java.util.concurrent.ConcurrentHashMap

class MainActivity : TauriActivity() {

    // ── Notification permission ──────────────────────────────────────────
    private lateinit var notifPermLauncher: ActivityResultLauncher<String>

    // ── BLE permission ───────────────────────────────────────────────────
    private lateinit var blePermLauncher: ActivityResultLauncher<Array<String>>

    // ── BLE state ────────────────────────────────────────────────────────
    private var bleAdapter: BluetoothAdapter? = null
    private var bleGatt: BluetoothGatt? = null

    // 0 = idle, 1 = connecting, 2 = ready, -1 = remote disconnect, 0 (reset by user disconnect)
    @Volatile private var gattState: Int = 0

    // Scan results: addr -> name ("" if device has no name; ConcurrentHashMap forbids null values)
    private val scanMap = ConcurrentHashMap<String, String>()

    // Non-zero if onScanFailed was called
    @Volatile private var scanError: Int = 0

    // Incoming notifications from the scale
    private val notifQueue = ArrayBlockingQueue<ByteArray>(50)

    // ── Lifecycle ────────────────────────────────────────────────────────
    override fun onCreate(savedInstanceState: Bundle?) {
        // Register launchers BEFORE super.onCreate (required by Android).
        notifPermLauncher = registerForActivityResult(
            ActivityResultContracts.RequestPermission()
        ) { /* no-op; JS re-checks */ }

        blePermLauncher = registerForActivityResult(
            ActivityResultContracts.RequestMultiplePermissions()
        ) { /* no-op; JS re-checks via bleCheckPermissions */ }

        enableEdgeToEdge()
        super.onCreate(savedInstanceState)

        // Give Rust the JavaVM + Activity reference it needs for JNI calls.
        // Must run on the Android main thread (here) where JNIEnv is available.
        // ndk_context::android_context() panics on tokio worker threads, so we
        // bypass it entirely and inject context directly via this JNI callback.
        nativeInit()

        // Auto-request POST_NOTIFICATIONS on cold start (Android 13+).
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            val granted = ContextCompat.checkSelfPermission(
                this, Manifest.permission.POST_NOTIFICATIONS
            ) == PackageManager.PERMISSION_GRANTED
            if (!granted) notifPermLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
        }

        instance = this
    }

    private external fun nativeInit()

    override fun onDestroy() {
        if (instance === this) instance = null
        super.onDestroy()
    }

    // ── Notification settings (called from Rust via JNI) ─────────────────
    fun requestNotificationsOrOpenSettings() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            val granted = ContextCompat.checkSelfPermission(
                this, Manifest.permission.POST_NOTIFICATIONS
            ) == PackageManager.PERMISSION_GRANTED
            if (!granted) {
                notifPermLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
                if (!shouldShowRequestPermissionRationale(Manifest.permission.POST_NOTIFICATIONS)) {
                    openAppNotificationSettings()
                }
                return
            }
        }
        openAppNotificationSettings()
    }

    private fun openAppNotificationSettings() {
        val intent = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).apply {
                putExtra(Settings.EXTRA_APP_PACKAGE, packageName)
            }
        } else {
            Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
                data = Uri.parse("package:$packageName")
            }
        }
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        startActivity(intent)
    }

    // ── BLE helpers (called from Rust via JNI) ────────────────────────────

    private fun bleInitAdapter(): Boolean {
        if (bleAdapter == null) {
            val mgr = getSystemService(BLUETOOTH_SERVICE) as? BluetoothManager ?: return false
            bleAdapter = mgr.adapter
        }
        return bleAdapter?.isEnabled == true
    }

    fun bleCheckPermissions(): Boolean {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            ContextCompat.checkSelfPermission(this, Manifest.permission.BLUETOOTH_SCAN) ==
                    PackageManager.PERMISSION_GRANTED &&
            ContextCompat.checkSelfPermission(this, Manifest.permission.BLUETOOTH_CONNECT) ==
                    PackageManager.PERMISSION_GRANTED
        } else {
            ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) ==
                    PackageManager.PERMISSION_GRANTED
        }
    }

    fun bleRequestPermissions() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            blePermLauncher.launch(
                arrayOf(
                    Manifest.permission.BLUETOOTH_SCAN,
                    Manifest.permission.BLUETOOTH_CONNECT,
                )
            )
        } else {
            blePermLauncher.launch(arrayOf(Manifest.permission.ACCESS_FINE_LOCATION))
        }
    }

    fun bleStartScan(): Boolean {
        if (!bleInitAdapter()) return false
        // Stop any previous scan first to avoid SCAN_FAILED_ALREADY_STARTED on repeat scans
        bleAdapter?.bluetoothLeScanner?.stopScan(bleScanCb)
        scanMap.clear()
        scanError = 0
        val settings = ScanSettings.Builder()
            .setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY)
            .build()
        bleAdapter?.bluetoothLeScanner?.startScan(null, settings, bleScanCb) ?: return false
        return true
    }

    fun bleStopScan() {
        bleAdapter?.bluetoothLeScanner?.stopScan(bleScanCb)
    }

    fun bleGetScanResults(): String {
        val items = scanMap.entries.toList()
        if (items.isEmpty()) return "[]"
        val sb = StringBuilder("[")
        var first = true
        for ((addr, name) in items) {
            if (!first) sb.append(",")
            first = false
            val nameJson = if (name != null && name.isNotEmpty())
                "\"${name.replace("\\", "\\\\").replace("\"", "\\\"")}\""
            else "null"
            sb.append("""{"address":"$addr","name":$nameJson}""")
        }
        sb.append("]")
        return sb.toString()
    }

    private val bleScanCb = object : ScanCallback() {
        override fun onScanResult(callbackType: Int, result: ScanResult) {
            val dev = result.device
            // dev.name requires BLUETOOTH_CONNECT; fall back to advertisement local name
            val name = try { dev.name } catch (e: SecurityException) { null }
                ?: result.scanRecord?.deviceName
            // ConcurrentHashMap does not allow null values — store empty string for unnamed devices
            scanMap[dev.address] = name ?: ""
        }

        override fun onScanFailed(errorCode: Int) {
            scanError = errorCode
        }
    }

    fun bleConnect(address: String): Boolean {
        if (!bleInitAdapter()) return false
        gattState = 1
        notifQueue.clear()
        return try {
            val dev = bleAdapter!!.getRemoteDevice(address)
            bleGatt = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                dev.connectGatt(this, false, gattCb, BluetoothDevice.TRANSPORT_LE)
            } else {
                @Suppress("DEPRECATION")
                dev.connectGatt(this, false, gattCb)
            }
            bleGatt != null
        } catch (e: Exception) {
            gattState = -1
            false
        }
    }

    fun bleIsConnected(): Int = gattState

    private val gattCb = object : BluetoothGattCallback() {
        override fun onConnectionStateChange(g: BluetoothGatt, status: Int, newState: Int) {
            if (newState == BluetoothProfile.STATE_CONNECTED) {
                if (!g.discoverServices()) gattState = -1
            } else if (newState == BluetoothProfile.STATE_DISCONNECTED) {
                gattState = -1
                bleGatt?.close()
                bleGatt = null
            }
        }

        override fun onServicesDiscovered(g: BluetoothGatt, status: Int) {
            gattState = if (status == BluetoothGatt.GATT_SUCCESS) 2 else -1
        }

        @Suppress("DEPRECATION")
        override fun onCharacteristicChanged(
            g: BluetoothGatt,
            c: BluetoothGattCharacteristic
        ) {
            @Suppress("DEPRECATION")
            notifQueue.offer(c.value?.copyOf() ?: return)
        }

        // Called on Android 13+ (API 33+); shadows the deprecated variant.
        override fun onCharacteristicChanged(
            g: BluetoothGatt,
            c: BluetoothGattCharacteristic,
            value: ByteArray
        ) {
            notifQueue.offer(value)
        }
    }

    fun bleSubscribe(charUuid: String): Boolean {
        val g = bleGatt ?: return false
        if (gattState != 2) return false
        val uuid = try { UUID.fromString(charUuid) } catch (e: Exception) { return false }
        for (service in g.services) {
            val gattChar = service.getCharacteristic(uuid) ?: continue
            if (!g.setCharacteristicNotification(gattChar, true)) continue
            val cccd = UUID.fromString("00002902-0000-1000-8000-00805f9b34fb")
            val desc = gattChar.getDescriptor(cccd)
            if (desc != null) {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                    g.writeDescriptor(desc, BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE)
                } else {
                    @Suppress("DEPRECATION")
                    desc.value = BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE
                    @Suppress("DEPRECATION")
                    g.writeDescriptor(desc)
                }
            }
            return true
        }
        return false
    }

    /** Returns the scan error code (0 = no error, matches ScanCallback.SCAN_FAILED_* codes). */
    fun bleGetScanError(): Int = scanError

    /** Returns the next queued BLE notification as a JSON int array, or "" if none. */
    fun bleGetNotification(): String {
        val data = notifQueue.poll() ?: return ""
        val sb = StringBuilder("[")
        data.forEachIndexed { i, b ->
            if (i > 0) sb.append(",")
            sb.append(b.toInt() and 0xFF)
        }
        sb.append("]")
        return sb.toString()
    }

    /** dataJson: JSON int array, e.g. "[3,10,7,0,0,0]". Avoids byte-array JNI. */
    fun bleWriteJson(charUuid: String, dataJson: String): Boolean {
        val data = try {
            val trimmed = dataJson.trim().removePrefix("[").removeSuffix("]")
            if (trimmed.isEmpty()) return false
            trimmed.split(",").map { it.trim().toInt().toByte() }.toByteArray()
        } catch (e: Exception) { return false }
        return bleWriteRaw(charUuid, data)
    }

    private fun bleWriteRaw(charUuid: String, data: ByteArray): Boolean {
        val g = bleGatt ?: return false
        if (gattState != 2) return false
        val uuid = try { UUID.fromString(charUuid) } catch (e: Exception) { return false }
        for (service in g.services) {
            val gattChar = service.getCharacteristic(uuid) ?: continue
            return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                // BluetoothStatusCodes.SUCCESS == 0 (available since API 31)
                g.writeCharacteristic(
                    gattChar, data,
                    BluetoothGattCharacteristic.WRITE_TYPE_DEFAULT
                ) == 0
            } else {
                @Suppress("DEPRECATION")
                gattChar.value = data
                @Suppress("DEPRECATION")
                gattChar.writeType = BluetoothGattCharacteristic.WRITE_TYPE_DEFAULT
                @Suppress("DEPRECATION")
                g.writeCharacteristic(gattChar)
            }
        }
        return false
    }

    fun bleDisconnect() {
        bleStopScan()
        notifQueue.clear()
        gattState = 0  // 0 = user-initiated, loop exits without "ble-disconnected" event
        bleGatt?.disconnect()
        bleGatt?.close()
        bleGatt = null
    }

    // ── Kettle (Pava Eléctrica) GATT ──────────────────────────────────────────

    private var kettleGatt: BluetoothGatt? = null
    @Volatile private var kettleState: Int = 0
    private val kettleNotifQueue = ArrayBlockingQueue<ByteArray>(50)

    fun kettleConnect(address: String): Boolean {
        if (!bleInitAdapter()) return false
        kettleState = 1
        kettleNotifQueue.clear()
        return try {
            val dev = bleAdapter!!.getRemoteDevice(address)
            kettleGatt = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                dev.connectGatt(this, false, kettleCb, BluetoothDevice.TRANSPORT_LE)
            } else {
                @Suppress("DEPRECATION")
                dev.connectGatt(this, false, kettleCb)
            }
            kettleGatt != null
        } catch (e: Exception) {
            kettleState = -1
            false
        }
    }

    fun kettleIsConnected(): Int = kettleState

    private val kettleCb = object : BluetoothGattCallback() {
        override fun onConnectionStateChange(g: BluetoothGatt, status: Int, newState: Int) {
            if (newState == BluetoothProfile.STATE_CONNECTED) {
                if (!g.discoverServices()) kettleState = -1
            } else if (newState == BluetoothProfile.STATE_DISCONNECTED) {
                kettleState = -1
                kettleGatt?.close()
                kettleGatt = null
            }
        }

        override fun onServicesDiscovered(g: BluetoothGatt, status: Int) {
            kettleState = if (status == BluetoothGatt.GATT_SUCCESS) 2 else -1
        }

        @Suppress("DEPRECATION")
        override fun onCharacteristicChanged(
            g: BluetoothGatt,
            c: BluetoothGattCharacteristic
        ) {
            @Suppress("DEPRECATION")
            kettleNotifQueue.offer(c.value?.copyOf() ?: return)
        }

        override fun onCharacteristicChanged(
            g: BluetoothGatt,
            c: BluetoothGattCharacteristic,
            value: ByteArray
        ) {
            kettleNotifQueue.offer(value)
        }
    }

    fun kettleSubscribe(charUuid: String): Boolean {
        val g = kettleGatt ?: return false
        if (kettleState != 2) return false
        val uuid = try { UUID.fromString(charUuid) } catch (e: Exception) { return false }
        for (service in g.services) {
            val gattChar = service.getCharacteristic(uuid) ?: continue
            if (!g.setCharacteristicNotification(gattChar, true)) continue
            val cccd = UUID.fromString("00002902-0000-1000-8000-00805f9b34fb")
            val desc = gattChar.getDescriptor(cccd)
            if (desc != null) {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                    g.writeDescriptor(desc, BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE)
                } else {
                    @Suppress("DEPRECATION")
                    desc.value = BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE
                    @Suppress("DEPRECATION")
                    g.writeDescriptor(desc)
                }
            }
            return true
        }
        return false
    }

    fun kettleGetNotification(): String {
        val data = kettleNotifQueue.poll() ?: return ""
        val sb = StringBuilder("[")
        data.forEachIndexed { i, b ->
            if (i > 0) sb.append(",")
            sb.append(b.toInt() and 0xFF)
        }
        sb.append("]")
        return sb.toString()
    }

    /** Writes ASCII text to the given characteristic (used for set-temp: "80" = 80°C, "20" = off). */
    fun kettleWriteAscii(charUuid: String, text: String): Boolean {
        val g = kettleGatt ?: return false
        if (kettleState != 2) return false
        val data = text.toByteArray(Charsets.US_ASCII)
        val uuid = try { UUID.fromString(charUuid) } catch (e: Exception) { return false }
        for (service in g.services) {
            val gattChar = service.getCharacteristic(uuid) ?: continue
            return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                g.writeCharacteristic(
                    gattChar, data,
                    BluetoothGattCharacteristic.WRITE_TYPE_DEFAULT
                ) == 0
            } else {
                @Suppress("DEPRECATION")
                gattChar.value = data
                @Suppress("DEPRECATION")
                gattChar.writeType = BluetoothGattCharacteristic.WRITE_TYPE_DEFAULT
                @Suppress("DEPRECATION")
                g.writeCharacteristic(gattChar)
            }
        }
        return false
    }

    fun kettleDisconnect() {
        kettleNotifQueue.clear()
        kettleState = 0
        kettleGatt?.disconnect()
        kettleGatt?.close()
        kettleGatt = null
    }

    companion object {
        @JvmStatic
        var instance: MainActivity? = null
    }
}
