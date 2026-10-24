package expo.modules.hermesbackground

import android.content.Context

/** What the boot receiver needs to know without JavaScript: whether to start, and the notification's words. */
object BackgroundSettings {
  private const val FILE = "hermes-background"

  private fun prefs(context: Context) = context.getSharedPreferences(FILE, Context.MODE_PRIVATE)

  fun keepConnected(context: Context) = prefs(context).getBoolean("keepConnected", false)

  fun title(context: Context) = prefs(context).getString("title", null) ?: "Hermes"

  fun text(context: Context) = prefs(context).getString("text", null) ?: ""

  fun save(context: Context, keepConnected: Boolean, title: String, text: String) {
    prefs(context).edit()
      .putBoolean("keepConnected", keepConnected)
      .putString("title", title)
      .putString("text", text)
      .apply()
  }
}
