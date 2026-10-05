// Entry point for the browser build. The bridge goes first so it exists
// before the desktop renderer's modules run. The right-click blocker goes
// before the desktop entry so its listener runs before the app's. Then the
// unchanged desktop entry.
import './bridge/install'
import './context-menu'
import '@/main'
