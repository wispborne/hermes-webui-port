package expo.modules.hermesbackground

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import androidx.core.content.ContextCompat
import com.facebook.react.ReactApplication

/**
 * Keeps the app's process, and so its JavaScript and its gateway connection,
 * alive while the app isn't on screen. It only shows the ongoing notification;
 * all gateway logic stays in JavaScript.
 */
class ConnectionService : Service() {
  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    if (intent?.action == ACTION_STOP) {
      ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE)
      stopSelf()
      running = false

      return START_NOT_STICKY
    }

    val title = intent?.getStringExtra(EXTRA_TITLE) ?: lastTitle
    val text = intent?.getStringExtra(EXTRA_TEXT) ?: lastText
    lastTitle = title
    lastText = text

    val type = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
      ServiceInfo.FOREGROUND_SERVICE_TYPE_REMOTE_MESSAGING
    } else {
      0
    }
    ServiceCompat.startForeground(this, NOTIFICATION_ID, notification(this, title, text), type)
    running = true

    // Started after a reboot, with no JavaScript running yet: start it, so the
    // app's code opens the gateway connection without a screen.
    if (intent?.getBooleanExtra(EXTRA_START_JS, false) == true) {
      (application as? ReactApplication)?.reactHost?.start()
    }

    return START_NOT_STICKY
  }

  override fun onDestroy() {
    running = false
    super.onDestroy()
  }

  companion object {
    const val CHANNEL_ID = "connection"
    const val NOTIFICATION_ID = 7301
    const val ACTION_START = "expo.modules.hermesbackground.START"
    const val ACTION_STOP = "expo.modules.hermesbackground.STOP"
    const val EXTRA_TITLE = "title"
    const val EXTRA_TEXT = "text"
    const val EXTRA_START_JS = "startJs"

    @Volatile
    var running = false
      private set

    private var lastTitle = "Hermes"
    private var lastText = ""

    fun start(context: Context, title: String, text: String, startJs: Boolean = false) {
      ensureChannel(context)
      val intent = Intent(context, ConnectionService::class.java)
        .setAction(ACTION_START)
        .putExtra(EXTRA_TITLE, title)
        .putExtra(EXTRA_TEXT, text)
        .putExtra(EXTRA_START_JS, startJs)
      ContextCompat.startForegroundService(context, intent)
    }

    fun update(context: Context, title: String, text: String) {
      if (!running) {
        return
      }

      lastTitle = title
      lastText = text
      context.getSystemService(NotificationManager::class.java)
        .notify(NOTIFICATION_ID, notification(context, title, text))
    }

    fun stop(context: Context) {
      if (running) {
        context.startService(Intent(context, ConnectionService::class.java).setAction(ACTION_STOP))
      }
    }

    private fun ensureChannel(context: Context) {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        val manager = context.getSystemService(NotificationManager::class.java)
        if (manager.getNotificationChannel(CHANNEL_ID) == null) {
          manager.createNotificationChannel(
            NotificationChannel(CHANNEL_ID, "Connection", NotificationManager.IMPORTANCE_LOW).apply {
              description = "Shows while Hermes stays connected in the background."
              setShowBadge(false)
            }
          )
        }
      }
    }

    private fun notification(context: Context, title: String, text: String): Notification {
      val launch = context.packageManager.getLaunchIntentForPackage(context.packageName)
      val open = launch?.let {
        PendingIntent.getActivity(context, 0, it, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
      }

      return NotificationCompat.Builder(context, CHANNEL_ID)
        .setSmallIcon(context.applicationInfo.icon)
        .setContentTitle(title)
        .setContentText(text)
        .setOngoing(true)
        .setOnlyAlertOnce(true)
        .setSilent(true)
        .setCategory(NotificationCompat.CATEGORY_SERVICE)
        .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
        .setContentIntent(open)
        .build()
    }
  }
}
