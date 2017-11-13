var Hapi = require('hapi')
var Inert = require('inert')
var h2o2 = require('h2o2')
var Path = require('path')
var Phantom = require('phantomjs-prebuilt')
var ChildProcess = require('child_process')
var PortFinder = require('portfinder')

module.exports = function (staticDir, route, options, callback) {
  function serveAndPrerenderRoute () {
    PortFinder.getPort(function (error, port) {
      if (error) throw error

      var Server = new Hapi.Server({
        connections: {
          routes: {
            files: {
              relativeTo: staticDir
            }
          }
        }
      })

      Server.connection({ port: port })

      Server.register([Inert, h2o2], function (error) {
        if (error) throw error
        var indexPath = options.indexPath ? options.indexPath : Path.join(staticDir, 'index.html')

        var proxyTable = options.proxyTable
        if (proxyTable) {
          Object.keys(proxyTable).forEach(function (path) {
            var proxy = proxyTable[path]
            Server.route({
              method: ['*', 'GET'],
              path: path + '/{path1}/{path2?}',
              handler: {
                proxy: {
                  mapUri: function (request, callback) {
                    var uri = (proxy.target || proxy) + request.url.path
                    callback(null, uri)
                    console.log('Hapi proxy on:', uri)
                  }
                }
              }
            })
          })
        }

        Server.route({
          method: 'GET',
          path: route,
          handler: function (request, reply) {
            reply.file(
              indexPath
            )
          }
        })

        var assetsPublicPath = options.assetsPublicPath || '/'
        if (assetsPublicPath.match(/^(http:|https:|\/\/)/)) {
          console.log('Assets path like CDN:', assetsPublicPath)
        } else {
          Server.route({
            method: 'GET',
            path: assetsPublicPath + '{param*}',
            handler: {
              directory: {
                path: '.',
                redirectToSlash: true,
                index: true,
                showHidden: true
              }
            }
          })
        }

        Server.start(function (error) {
          // If port is already bound, try again with another port
          if (error) return serveAndPrerenderRoute()

          var maxAttempts = options.maxAttempts || 5
          var attemptsSoFar = 0

          var phantomArguments = [
            Path.join(__dirname, 'phantom-page-render.js'),
            'http://localhost:' + port + route,
            JSON.stringify(options)
          ]

          if (options.phantomOptions) {
            phantomArguments.unshift(options.phantomOptions)
          }

          function capturePage () {
            attemptsSoFar += 1

            ChildProcess.execFile(
              Phantom.path,
              phantomArguments,
              {maxBuffer: 1048576},
              function (error, stdout, stderr) {
                if (error || stderr) {
                  // Retry if we haven't reached the max number of capture attempts
                  if (attemptsSoFar <= maxAttempts) {
                    return capturePage()
                  } else {
                    if (error) throw stdout
                    if (stderr) throw stderr
                  }
                }
                callback(stdout)
                Server.stop()
              }
            )
          }
          capturePage()
        })
      })
    })
  }
  serveAndPrerenderRoute()
}
