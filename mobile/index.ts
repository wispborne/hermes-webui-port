// The app's entry. The start check and the background rules start here, as
// soon as the JavaScript loads, so they also run when the foreground service
// starts the app after a reboot with no screen shown. Then expo-router.
import './src/background/boot'
import 'expo-router/entry'
