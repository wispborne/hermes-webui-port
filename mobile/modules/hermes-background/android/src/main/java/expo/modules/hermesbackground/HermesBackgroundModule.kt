package expo.modules.hermesbackground

import android.webkit.CookieManager
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/** Android calls the app needs that React Native and Expo don't offer. */
class HermesBackgroundModule : Module() {
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
  }
}
