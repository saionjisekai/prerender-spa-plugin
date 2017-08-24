var FS = require('fs')
var Path = require('path')
var mkdirp = require('mkdirp')
var compileToHTML = require('./lib/compile-to-html')

function SimpleHtmlPrecompiler (staticDir, paths, options) {
  this.staticDir = staticDir
  this.paths = paths
  this.options = options || {}
}

SimpleHtmlPrecompiler.prototype.task = function () {
  var self = this
  return Promise.all(
    self.paths.map(function (outputPath) {
      if (typeof outputPath === 'string') {
        outputPath = {
          route: outputPath
        }
      }
      return new Promise(function (resolve, reject) {
        compileToHTML(self.staticDir, outputPath.route, self.options, function (prerenderedHTML) {
          if (outputPath.title) {
            prerenderedHTML = prerenderedHTML.replace(
              /<title>[^<]*<\/title>/i,
              '<title>' + outputPath.title + '</title>'
            )
          }
          if (self.options.postProcessHtml) {
            prerenderedHTML = self.options.postProcessHtml({
              html: prerenderedHTML,
              route: outputPath.route
            })
          }
          var folder = Path.join(
            self.options.outputDir || self.staticDir,
            outputPath.filename ? Path.dirname(outputPath.filename) : outputPath.route
          )
          mkdirp(folder, function (error) {
            if (error) {
              return reject('Folder could not be created: ' + folder + '\n' + error)
            }
            var file = Path.join(folder, Path.basename(outputPath.filename || 'index.html'))
            FS.writeFile(
              file,
              prerenderedHTML,
              function (error) {
                if (error) {
                  return reject('Could not write file: ' + file + '\n' + error)
                }
                resolve()
                console.log('Write file successfully:', file)
              }
            )
          })
        })
      })
    })
  )
}

SimpleHtmlPrecompiler.prototype.apply = function (compiler) {
  var self = this
  compiler.plugin('after-emit', function (compilation, done) {
    self.task()
    .then(function () { done() })
    .catch(function (error) {
      // setTimeout prevents the Promise from swallowing the throw
      setTimeout(function () { throw error })
    })
  })
}

SimpleHtmlPrecompiler.prototype.build = function () {
  this.task()
  .then(function () {
    console.log('render done...')
  })
  .catch(function (error) {
    setTimeout(function () { throw error })
  })
}

module.exports = SimpleHtmlPrecompiler
