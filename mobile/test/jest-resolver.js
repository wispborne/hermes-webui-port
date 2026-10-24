// Jest's side of shared-resolution.js. Metro does the same in metro.config.js.
const { hermesSharedFile, tsFallback } = require('../shared-resolution')

module.exports = (request, options) => {
  const shared = hermesSharedFile(request)

  if (shared) {
    return shared
  }

  return options.defaultResolver(tsFallback(request, `${options.basedir}/_`) ?? request, options)
}
