package com.bitcoinerlab.bitboxreactnative

import android.app.Activity
import android.app.AlertDialog
import android.os.Handler
import android.os.Looper
import com.bitcoinerlab.bitboxreactnative.go.bitboxnative.MobilePairingConfirmation
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

class BitBoxPairingConfirmation(
  private val activity: Activity,
  private val timeoutMs: Int
) : MobilePairingConfirmation {
  private val mainHandler = Handler(Looper.getMainLooper())
  private val latch = CountDownLatch(1)

  @Volatile private var accepted: Boolean? = null
  @Volatile private var shownCode: String? = null

  private var dialog: AlertDialog? = null

  override fun showPairingCode(code: String, deviceVerified: Boolean) {
    if (shownCode == code) return
    shownCode = code
    mainHandler.post {
      if (activity.isFinishing || activity.isDestroyed) {
        accepted = false
        latch.countDown()
        return@post
      }
      dialog?.dismiss()
      dialog = AlertDialog.Builder(activity)
        .setTitle("Confirm BitBox pairing")
        .setMessage(
          "Compare this code with the BitBox display:\n\n" +
            "$code\n\n" +
            "Only continue if both codes match."
        )
        .setPositiveButton("Pair") { _, _ ->
          accepted = true
          latch.countDown()
        }
        .setNegativeButton("Cancel") { _, _ ->
          accepted = false
          latch.countDown()
        }
        .setOnCancelListener {
          accepted = false
          latch.countDown()
        }
        .show()
    }
  }

  override fun confirmPairingCode(code: String): Boolean {
    showPairingCode(code, true)
    if (!latch.await(timeoutMs.toLong(), TimeUnit.MILLISECONDS)) {
      dismissDialog()
      throw BitBoxNativeException("Timed out waiting for BitBox pairing confirmation in the app")
    }
    dismissDialog()
    return accepted == true
  }

  private fun dismissDialog() {
    mainHandler.post {
      dialog?.dismiss()
      dialog = null
    }
  }
}
