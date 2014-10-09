/****************************************************************************
 The MIT License (MIT)

 Copyright (c) 2014 Apigee Corporation

 Permission is hereby granted, free of charge, to any person obtaining a copy
 of this software and associated documentation files (the "Software"), to deal
 in the Software without restriction, including without limitation the rights
 to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 copies of the Software, and to permit persons to whom the Software is
 furnished to do so, subject to the following conditions:

 The above copyright notice and this permission notice shall be included in
 all copies or substantial portions of the Software.

 THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 THE SOFTWARE.
 ****************************************************************************/
'use strict';

var config = require('../../../config');
var browser = require('../../util/browser');
var account = require('../account/account');
var path = require('path');
var fs = require('fs');
var qs = require('querystring');
var nodemon = require('nodemon');
var emit = require('../../util/feedback').emit;
var ncp = require('ncp');
var editor = require('../service/swagger_editor');
var cp = require('child_process');
var swaggerSpec = require('swagger-tools').specs.v2_0;
var netutil = require('../../util/net');
var os = require('os');
var _ = require('lodash');
var fsutil = require('../../util/fs');
var async = require('async');

module.exports = {
  create: create,
  start: start,
  verify: verify,
  edit: edit,
  open: open,
  docs: docs,
  deploy: deploy,
  undeploy: undeploy,
  showConfig: showConfig,
  downloadSkeleton: downloadSkeleton
};

function create(name, options, cb) {
  var targetDir = path.resolve(process.cwd(), name);
  if (fs.existsSync(targetDir)) {
    return cb(new Error('Directory ' + targetDir + ' already exists.'));
  }
  cloneSkeleton(name, targetDir, function(err) {
    spawn('npm', ['install'], targetDir, function(err) {
      if (err) {
        emit('\'npm install\' failed. Please run \'npm install\' from the project directory.')
      } else {
        emit('Project %s created in %s', name, targetDir);
      }
      cb(err);
    });
  });
}

//.option('-d, --debug', 'start in debug mode')
//.option('-m, --mock', 'start in mock mode')
//.option('-o, --open', 'open the project in the browser after starting')
//.option('-a, --account', 'use specified account for configuration')
//.option('-p, --print', 'print configuration')
function start(directory, options, cb) {

  writeConfig(directory, options, function(err, project) {
    if (err) { cb(err); }

    var fullPath = path.join(project.dirname, project.api.main);
    emit('Starting: ' + fullPath + '...');
    if (project.dirname) { process.chdir(project.dirname); }
    var nodemonOpts = {
      script: project.api.main,
      ext: 'js,json,yaml'
    };
    if (options.debugBrk) {
      nodemonOpts.nodeArgs = '--debug-brk';
      if (typeof(options.debugBrk == 'String')) {
        nodemonOpts.nodeArgs += '=' + options.debugBrk;
      }
    } else if (options.debug) {
      nodemonOpts.nodeArgs = '--debug';
      if (typeof(options.debug == 'String')) {
        nodemonOpts.nodeArgs += '=' + options.debug;
      }
    }
    nodemon(nodemonOpts);
    nodemon.on('start', function () {
      emit('  project started here: ' + project.api.localUrl);
      emit('  project will restart on changes.');
      emit('  to restart at any time, enter `rs`');

      if (options.open) {
        setTimeout(function() {
          open(directory, options, cb);
        }, 500);
      }
    }).on('quit', function () {
      emit('Project quit.');
      account.removeDeploymentFiles(project);
    }).on('restart', function (files) {
      emit('Project restarted. Files changed: ', files);
    });
  });
}

function showConfig(directory, options, cb) {
  options.print = true;
  writeConfig(directory, options, function(err) {
    cb(err);
  })
}

//.option('-a, --account', 'use specified account for configuration')
//.option('-p, --print', 'print configuration')
// returns project in callback
function writeConfig(directory, options, cb) {

  readProject(directory, options, function(err, project) {
    if (err) { throw err; }

    var additionalConfig = { '_a127_start_config': {
      debug: options.debug,
      mock: options.mock
    }};

    try {
      var selectedAccount = account.getSelected(options);
      var files = account.writeDeploymentFiles(project, selectedAccount, additionalConfig);
      emit('active account: ' + selectedAccount.name);
      emit('files written: ' + files);
    } catch (err) {
      if (options.account) { throw err; }
      emit('No default account. No account settings used.');
    }

    if (options.print) {
      process.env.A127_APPROOT = project.dirname;
      var a127Magic = require('a127-magic');
      var config = _.extend({}, a127Magic.config.load());
      delete(config['a127.magic']);
      emit('configuration:');
      emit('--------------');
      emit(config);
      emit('--------------');
    }

    cb(null, project);
  });
}

function verify(directory, options, cb) {
  readProject(directory, options, function(err, project) {
    if (err) { cb(err); }

    var results = swaggerSpec.validate(project.api.swagger);
    var toJsonPointer = function (path) {
      // http://tools.ietf.org/html/rfc6901#section-4
      return '#/' + path.map(function (part) {
        return part.replace(/\//g, '~1');
      }).join('/');
    };

    if (typeof results !== 'undefined') {
      if (options.json) {
        emit(JSON.stringify(results, null, '  '));
      } else {
        if (results.errors.length > 0) {
          emit('\nProject Errors');
          emit('--------------');

          results.errors.forEach(function (vErr) {
            emit(toJsonPointer(vErr.path) + ': ' + vErr.message);
          });
        }

        if (results.warnings.length > 0) {
          emit('\nProject Warnings');
          emit('----------------');

          results.warnings.forEach(function (vWarn) {
            emit(toJsonPointer(vWarn.path) + ': ' + vWarn.message);
          });
        }

        emit('\nResults: ' + results.errors.length + ' errors, ' + results.warnings.length + ' warnings');
      }
    }
  });
  cb();
}

function edit(directory, options, cb) {
  readProject(directory, options, function(err, project) {
    if (err) { cb(err); }
    editor.edit(project, options, cb);
  });
}

function open(directory, options, cb) {
  readProject(directory, options, function(err, project) {
    if (err) { cb(err); }
    netutil.isPortOpen(project.api.port, function(err, isOpen) {
      if (err) { return cb(err); }
      if (isOpen) {
        browser.open(project.api.localUrl, cb);
      } else {
        emit('Project does not appear to be listening on port ' + project.api.port + '.');
      }
    });
  });
}

function docs(directory, options, cb) {
  // todo
  cb(null, 'not implemented yet');
}

// .option('-a, --account [account]', 'use specified account')
function deploy(directory, options, cb) {
  readProject(directory, options, function(err, project) {
    if (err) { cb(err); }
    account.deployProject(project, options, cb);
  });
}

// .option('-a, --account [account]', 'use specified account')
function undeploy(directory, options, cb) {
  readProject(directory, options, function(err, project) {
    if (err) { cb(err); }
    account.undeployProject(project, options, cb);
  });
}


// Utility

//.option('-n, --name [name]', 'override deployment name')
//.option('-m, --main [main]', 'override deployment main file')
//.option('-b, --base [path]', 'override deployment base path (default is /projectName)')
//.option('-d, --docs [path]', 'override deployment docs path (default is /docs)')
function readProject(directory, options, cb) {
  findProjectFile(directory, options, function(err, fileName) {
    if (err) { cb(err); }

    var string = fs.readFileSync(fileName, { encoding: 'utf8' });
    var project = JSON.parse(string);
    project.filename = fileName;
    project.dirname = path.dirname(fileName);
    project.deploymentsDir = path.resolve(project.dirname, 'deployments');

    if (!project.api) { project.api = {}; }
    if (!project.api.name) { project.api.name = project.name; }
    if (!project.api.main) { project.api.main = project.script.start; }
    if (!project.api.basePath) { project.api.basePath = qs.escape(project.name); }
    if (!project.api.docsPath) { project.api.docsPath = '/docs'; }
    if (!project.api.swagger) {
      project.api.swagger = require(path.resolve(project.dirname, 'api', 'swagger', 'swagger.yaml'));
    }

    if (options.name) { project.api.name = options.name; }
    if (options.main) { project.api.main = options.main; }
    if (options.base) { project.api.basePath = options.base; }
    if (options.docs) { project.api.docsPath = options.docs; }

    project.configdir = path.resolve(project.dirname, 'config');

    // todo: temporary. need to figure out url dynamically
    project.api.port = config.project.port;
    project.api.localUrl = 'http://localhost:' + project.api.port;

    cb(null, project);
  });
}

// .option('-p, --project', 'use specified project file')
function findProjectFile(startDir, options, cb) {
  var current;
  var parent = startDir = startDir || process.cwd();
  var maxDepth = 50;
  while (current !== parent && maxDepth-- > 0) {
    current = parent;
    var projectFile = path.resolve(current, 'package.json');
    if (fs.existsSync(projectFile)) {
      return cb(null, projectFile);
    }
    parent = path.join(current, '..');
  }
  cb(new Error('Project root not found in or above: ' + startDir));
}

function cloneSkeleton(name, destDir, cb) {
  var sourceDir = config.project.skeletonDir;

  async.waterfall([
    function(cb) {
      if (fs.existsSync(sourceDir)) { return cb(); }
      emit('Project skeleton not found. Downloading...');
      downloadSkeleton(function(err) {
        cb(err);
      });
    },
    function(cb) {
      var nodeModulesPath = path.resolve(sourceDir, 'node_modules');

      var filter = function(fileName) {
        fileName = fileName.substr(sourceDir.length + 1);

        if (fileName.indexOf('node_modules') === 0) {
          return false;
        }
        if (fileName.length > 0) { emit('creating: ' + fileName); }
        return true;
      };

      var options = {
        clobber: false,
        filter: filter
      };

      emit('Copying files to %s...', destDir);
      ncp(sourceDir, destDir, options, function (err) {
        if (err) { return cb(err); }
        customizeClonedFiles(name, destDir, cb);
      });
    }
  ], cb);
}

function customizeClonedFiles(name, destDir, cb) {
  var fileName = path.resolve(destDir, 'package.json');
  fs.readFile(fileName, { encoding: 'utf8' }, function(err, string) {
    if (err) { return cb(err); }
    var project = JSON.parse(string);
    project.name = name;
    project.api.name = name;
    project.api.basePath = '/' + name;
    fs.writeFile(fileName, JSON.stringify(project, null, '  '), function(err) {
      if (err) { return cb(error); }
      cb(null, 'done!');
    });
  });
}

function spawn(command, options, cwd, cb) {
  var isWin = /^win/.test(os.platform());

  emit('Running \'%s %s\'...', command, options.join(' '));

  var npm = cp.spawn(isWin ?
                       process.env.comspec :
                       command,
                     isWin ?
                       ['/c'].concat(command, options) :
                       options,
                     { cwd: cwd });
  npm.stdout.on('data', function (data) {
    emit(data);
  });
  npm.stderr.on('data', function(data) {
    emit('%s', data);
  });
  npm
    .on('close', function(exitCode) {
      if (exitCode !== 0) { var err = new Error('exit code: ' + exitCode); }
      cb(err);
    })
    .on('error', function(err) {
      cb(err);
    });
}

function downloadSkeleton(cb) {
  var sourceUrl = config.project.skeletonZipUrl;
  var zipFile = path.resolve(config.tmpDir, 'skeleton.zip');
  netutil.download(sourceUrl, zipFile, function(err) {
    if (err) {
      emit('Failed to download project skeleton.');
      return cb(err);
    }
    fsutil.unzip(zipFile, config.tmpDir, function(err) {
      if (err) { emit('Failed to unzip project skeleton.'); }
      cb(err);
    });
  });
}
