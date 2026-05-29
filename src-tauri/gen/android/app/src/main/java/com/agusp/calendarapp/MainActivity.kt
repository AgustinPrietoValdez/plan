package com.agusp.calendarapp

import android.Manifest
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

class MainActivity : TauriActivity() {
  private lateinit var notifPermLauncher: ActivityResultLauncher<String>

  override fun onCreate(savedInstanceState: Bundle?) {
    // Register BEFORE super.onCreate so the launcher is ready before the
    // activity reaches RESUMED. This sidesteps the upstream
    // tauri-plugin-notification bug where its lateinit launcher is bound too
    // late (post-RESUMED) and `requestPermission()` throws.
    notifPermLauncher = registerForActivityResult(ActivityResultContracts.RequestPermission()) { /* no-op; JS re-checks isPermissionGranted() */ }
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)

    // Auto-request POST_NOTIFICATIONS on cold start when missing (Android 13+).
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      val granted = ContextCompat.checkSelfPermission(
        this, Manifest.permission.POST_NOTIFICATIONS
      ) == PackageManager.PERMISSION_GRANTED
      if (!granted) {
        notifPermLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
      }
    }

    instance = this
  }

  override fun onDestroy() {
    if (instance === this) instance = null
    super.onDestroy()
  }

  /** Called from JS (via a Tauri command) when the user taps the "enable
   *  notifications" banner. If the OS still wants to show the dialog this
   *  fires it; if the OS has silenced the prompt (user denied twice or
   *  ticked "don't ask again") it falls back to opening the app's
   *  notification settings page. */
  fun requestNotificationsOrOpenSettings() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      val granted = ContextCompat.checkSelfPermission(
        this, Manifest.permission.POST_NOTIFICATIONS
      ) == PackageManager.PERMISSION_GRANTED
      if (!granted) {
        // If the system would still show the dialog, this launches it.
        // If not, it silently no-ops — we proactively also open settings.
        notifPermLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
        if (!shouldShowRequestPermissionRationale(Manifest.permission.POST_NOTIFICATIONS)) {
          openAppNotificationSettings()
        }
        return
      }
    }
    // Pre-Android 13 or already granted — open settings as a fallback so the
    // user can verify the toggle is on.
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

  companion object {
    @JvmStatic
    var instance: MainActivity? = null
  }
}
