// Entry point for the browser build. The bridge goes first so it exists
// before the desktop renderer's modules run; then the unchanged desktop entry.
import './bridge/install'
import '@/main'
