const path = require('node:path')
const { getDefaultConfig } = require('expo/metro-config')

const { desktopThemesRoot, hermesSharedFile, sharedRoot, tsFallback } = require('./shared-resolution')

const config = getDefaultConfig(__dirname)

// Metro only bundles files in these folders. The repo root's node_modules
// holds the web UI's packages, including its own React, and stays out.
config.watchFolders = [...(config.watchFolders ?? []), sharedRoot, desktopThemesRoot]
config.resolver.nodeModulesPaths = [path.resolve(__dirname, 'node_modules')]

config.resolver.resolveRequest = (context, moduleName, platform) => {
  const shared = hermesSharedFile(moduleName)

  if (shared) {
    return { type: 'sourceFile', filePath: shared }
  }

  const fallback = tsFallback(moduleName, context.originModulePath)

  return context.resolveRequest(context, fallback ?? moduleName, platform)
}

module.exports = config
