package expo.modules.hermesbackground

import android.annotation.SuppressLint
import android.content.Intent
import android.net.Uri
import android.os.PowerManager
import android.provider.Settings
import android.webkit.CookieManager
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactContext
import com.facebook.react.bridge.UiThreadUtil
import com.facebook.react.jstasks.HeadlessJsTaskConfig
import com.facebook.react.jstasks.HeadlessJsTaskContext
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/** Android calls the app needs that React Native and Expo don't offer. */
class HermesBackgroundModule : Module() {
  private val context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  /** The headless task that keeps JavaScript timers running while the service is on. */
  private var timersTaskId: Int? = null

  /**
   * React Native pauses JavaScript timers when the app leaves the screen,
   * unless a headless task is running. The app's background rules need their
   * timers (the session checks, the service's stop delay, reconnect backoff),
   * so a task that never ends of its own runs for as long as the service does.
   * The JavaScript side registers it in src/background/boot.ts.
   */
  private fun keepTimersRunning(on: Boolean) {
    val reactContext = appContext.reactContext as? ReactContext ?: return

    UiThreadUtil.runOnUiThread {
      val tasks = HeadlessJsTaskContext.getInstance(reactContext)
      val id = timersTaskId

      if (on && id == null) {
        timersTaskId = tasks.startTask(HeadlessJsTaskConfig(TIMERS_TASK, Arguments.createMap(), 0, true))
      } else if (!on && id != null) {
        if (tasks.isTaskRunning(id)) {
          tasks.finishTask(id)
        }
        timersTaskId = null
      }
    }
  }

  override fun definition() = ModuleDefinition {
    Name("HermesBackground")

    // React Native's fetch keeps cookies in the system cookie store, which
    // writes them to disk on its own schedule. Flushing right after sign-in
    // keeps the sign-in if the app is killed straight away.
    Function("flushCookies") {
      CookieManager.getInstance().flush()
    }

    AsyncFunction("clearCookies") { promise: Promise ->
      val cookies = CookieManager.getInstance()
      cookies.removeAllCookies {
        cookies.flush()
        promise.resolve(null)
      }
    }

    // The foreground service. Android only lets it start while the app is on
    // screen, or from the boot receiver.
    Function("startService") { title: String, text: String ->
      ConnectionService.start(context, title, text)
      keepTimersRunning(true)
    }

    Function("updateService") { title: String, text: String ->
      ConnectionService.update(context, title, text)
    }

    Function("stopService") {
      ConnectionService.stop(context)
      keepTimersRunning(false)
    }

    Function("isServiceRunning") {
      ConnectionService.running
    }

    // Remembers "Keep connected" and the notification's words for the boot receiver.
    Function("setKeepConnected") { keepConnected: Boolean, title: String, text: String ->
      BackgroundSettings.save(context, keepConnected, title, text)
    }

    Function("isIgnoringBatteryOptimizations") {
      context.getSystemService(PowerManager::class.java).isIgnoringBatteryOptimizations(context.packageName)
    }

    // Play Store rules restrict this request, but the app is sideloaded.
    Function("requestIgnoreBatteryOptimizations") {
      @SuppressLint("BatteryLife")
      val intent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS)
        .setData(Uri.parse("package:${context.packageName}"))
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      context.startActivity(intent)
    }
  }

  companion object {
    /** The headless task's name. It matches `TIMERS_TASK` in src/background/boot.ts. */
    const val TIMERS_TASK = "HermesKeepTimers"
  }
}
