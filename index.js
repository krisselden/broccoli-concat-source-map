var fs = require('fs');
var path = require('path');
var Writer = require('broccoli-writer');
var helpers = require('broccoli-kitchen-sink-helpers');
var mkdirp = require('mkdirp');
var ConcatSourceMap = require('concat-source-map');
var SourceMappingURL = require('source-map-url').SourceMappingURL;
var sourceMappingURL = new SourceMappingURL(['//','']);

function Concat(inputTree, options) {
  if (!(this instanceof Concat)) return new Concat(inputTree, options);
  options = options || {};
  this.inputTree = inputTree;

  this.files = options.files || ['**/*.js'];

  this.outputFile = options.outputFile;
  if (!this.outputFile) throw new Error('option outputFile is required');

  this.sourceMapFile = options.sourceMapFile || this.outputFile.replace(/\.js$/, '.map');

  this.sourcesContent = options.sourcesContent;

  helpers.assertAbsolutePaths([this.outputFile, this.sourceMapFile]);
}
Concat.prototype = Object.create(Writer.prototype);
Concat.prototype.constructor = Concat;

Concat.prototype.write = function (readTree, destDir) {
  var concatenate = function (srcDir) {
    return this.concatenate(srcDir, destDir);
  }.bind(this);
  return readTree(this.inputTree).then(concatenate);
};

// the sourceMappingURL is the sourceMapFile relative from the outputFile
// the "file" is the outputFile relative from the sourceMapFile
// the sources in the source map are relative from sourceMapFile
Concat.prototype.concatenate = function (srcDir, destDir) {
  var files = helpers.multiGlob(this.files, {
    cwd: srcDir,
    root: srcDir,
    nomount: false  // absolute paths should be mounted at root
  });

  var outputFile = this.outputFile; // absolute path in tree root
  var outputDir = path.dirname(outputFile);
  mkdirp.sync(path.join(destDir, outputDir));
  var resolvedOutputFile = path.join(destDir, outputFile);
  var sourceMapFile = this.sourceMapFile; // absolute path in tree
  var sourceMapDir = path.dirname(sourceMapFile);
  var resolvedSourceMapFile = path.join(destDir, sourceMapFile);
  mkdirp.sync(path.join(destDir, sourceMapDir));

  var concatSourceMap = new ConcatSourceMap({
    file: path.relative(sourceMapDir, outputFile)
  });

  files.forEach(function (file, index) {
    var resolvedSourceFile = path.resolve(srcDir, file);
    var stats = fs.statSync(resolvedSourceFile);
    if (stats.isDirectory()) return;
    var sourceContent = fs.readFileSync(resolvedSourceFile, {encoding:'utf8'});
    var sourceFile = absolutePathFromTree(srcDir, resolvedSourceFile);
    var relativeSourceFile = path.relative(sourceMapDir, sourceFile);
    var originalSourceMappingURL = sourceMappingURL.get(sourceContent);
    var resolvedOriginalSourceMapFile, relativeOriginalSourceMapFile, relativeOriginalSourceMapDir, originalSourceMap;
    if (originalSourceMappingURL) {
      sourceContent = sourceMappingURL.remove(sourceContent);
      resolvedOriginalSourceMapFile = path.resolve(
        path.dirname(resolvedSourceFile), originalSourceMappingURL
      );
      originalSourceMapFile = absolutePathFromTree(srcDir, resolvedOriginalSourceMapFile);
      relativeOriginalSourceMapFile = path.relative(sourceMapDir, originalSourceMapFile);
      relativeOriginalSourceMapDir = path.dirname(relativeOriginalSourceMapFile);
      if (fs.existsSync(resolvedOriginalSourceMapFile)) {
        originalSourceMap = fs.readFileSync(resolvedOriginalSourceMapFile, {encoding:'utf8'});
      }
    }

    concatSourceMap.addSourceFile(relativeSourceFile, sourceContent, originalSourceMap, relativeOriginalSourceMapDir);
    concatSourceMap.setSourceContent(relativeSourceFile, sourceContent);

    if (index === files.length-1) {
      sourceContent = sourceMappingURL.set(sourceContent, path.relative(outputDir, sourceMapFile));
    }
    if (index === 0) {
      fs.writeFileSync(resolvedOutputFile, sourceContent, {encoding:'utf8'});
    } else {
      fs.appendFileSync(resolvedOutputFile, sourceContent, {encoding:'utf8'});
    }
    fs.writeFileSync(resolvedSourceMapFile, concatSourceMap.toString(), {encoding:'utf8'});
  }, this);
};

// given a full path (including the treeDir)
// or a relative path from the treeDir
// make it an absolute path
function absolutePathFromTree(treeDir, resolvedFileInTree) {
  var relativePathFromTreeDir = path.relative(treeDir, resolvedFileInTree);
  return path.join('/', relativePathFromTreeDir);
}

module.exports = Concat;
