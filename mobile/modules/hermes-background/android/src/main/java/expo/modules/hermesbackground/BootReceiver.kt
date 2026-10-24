package expo.modules.hermesbackground

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/** Starts the connection again after the phone restarts, when "Keep connected" is on. */
class BootReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action != Intent.ACTION_BOOT_COMPLETED || !BackgroundSettings.keepConnected(context)) {
      return
    }

    ConnectionService.start(context, BackgroundSettings.title(context), BackgroundSettings.text(context), startJs = true)
  }
}
