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
var _ = require('lodash');
var path = require('path');
var fs = require('fs');
var qs = require('querystring');
var nodemon = require('nodemon');
var emit = require('../../util/feedback').emit;
var editor = require('../service/swagger_editor');
var cp = require('child_process');
var swaggerSpec = require('swagger-tools').specs.v2_0;
var netutil = require('../../util/net');
var os = require('os');
var serviceCmd = require('../service/service');
var yaml = require('js-yaml');
var debug = require('debug')('true');
var util = require('util');
var async = require('async');
var cli = require('../../util/cli');
var Url = require('url');
var cpr = require('cpr');

var REDEPLOY_MESSAGE = 'If this project is deployed, you will need to redeploy to activate the new configuration.';

module.exports = {
  create: create,
  start: start,
  verify: verify,
  edit: edit,
  open: open,
  deploy: deploy,
  undeploy: undeploy,
  showConfig: showConfig,
  logs: logs,
  test: test,
  showDocs: showDocs,

  bind: bind,
  unbind: unbind,
  bindings: bindings,

  // for internal use
  read: readProject
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

//.option('-d, --debug [port]', 'start in remote debug mode')
//.option('-b, --debug-brk [port]', 'start in remote debug mode, wait for debugger connect')
//.option('-m, --mock', 'start in mock mode')
//.option('-o, --open', 'open in browser')
//.option('-a, --account <account>', 'use specified account for configuration')
//.option('-p, --print', 'print configuration')
//.option('-n, --nocors', 'omit cors headers')
function start(directory, options, cb) {

  if (!options.nocors) {
    options.corsOptions = {};
  }
  writeConfig(directory, options, function(err, project) {
    if (err) { return cb(err); }

    var fullPath = path.join(project.dirname, project.api.main);
    emit('Starting: %s...', fullPath);
    if (project.dirname) { process.chdir(project.dirname); }
    var nodemonOpts = {
      script: project.api.main,
      ext: 'js,json,yaml,coffee'
    };
    if (options.debugBrk) {
      nodemonOpts.nodeArgs = '--debug-brk';
      if (typeof(options.debugBrk == 'String')) {
        nodemonOpts.nodeArgs += '=' + options.debugBrk;
      }
    }
    if (options.debug) {
      nodemonOpts.nodeArgs = '--debug';
      if (typeof(options.debug == 'String')) {
        nodemonOpts.nodeArgs += '=' + options.debug;
      }
    }
    // hack to enable proxyquire stub for testing...
    if (_.isFunction(nodemon)) {
      nodemon(nodemonOpts);
    } else {
      nodemon._init(nodemonOpts, cb);
    }
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

//.option('-d, --debug [port]', 'start in remote debug mode')
//.option('-b, --debug-brk [port]', 'start in remote debug mode, wait for debugger connect')
//.option('-m, --mock', 'start in mock mode')
//.option('-o, --open', 'open in browser')
//.option('-a, --account <account>', 'use specified account for configuration')
//.option('-p, --print', 'print configuration')
function test(directory, options, cb) {

  var Mocha = require('mocha');
  var MochaUtils = require('mocha/lib/utils');

  writeConfig(directory, options, function(err, project) {
    if (err) { return cb(err); }

    var testPath = project.dirname;
    if (directory) {
      try {
        testPath = fs.realpathSync(directory);
      } catch (err) {
        return cb(new Error(util.format('no such file or directory %s', directory)));
      }
    }
    if (testPath === project.dirname) {
      testPath = path.resolve(testPath, 'test');
    }

    var opts = undefined;
    var optsFile = path.join(testPath, 'mocha-opts.yaml');
    if (fs.existsSync(optsFile)) {
      var yamlString = fs.readFileSync(optsFile, { encoding: 'utf8' });
      opts = yaml.safeLoad(yamlString);
    }

    var mocha = new Mocha(opts);

    if (fs.statSync(testPath).isFile()) {
      if (testPath.substr(-3) !== '.js') { return cb(new Error('file is not a javascript file')); }
      mocha.addFile(testPath);
    } else {
      MochaUtils.lookupFiles(testPath, ['js'], true)
        .forEach(function(file) {
          mocha.addFile(file);
        });
    }

    var fullPath = path.join(project.dirname, project.api.main);
    emit('Loading server: %s...', fullPath);
    var app = require(fullPath);
    if (!Object.keys(app).length) {
      return cb(new Error(util.format('Ensure %s exports the server. eg. "module.exports = app;"', project.api.main)));
    }

    emit('Running tests in: %s...', testPath);

    mocha.run(function(failures) {
      process.exit(failures);
    });
  });
}

function showConfig(directory, options, cb) {
  options.print = true;
  writeConfig(directory, options, function(err) {
    if (err) { return cb(err); }
    cb();
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
      mock: options.mock,
      corsOptions: options.corsOptions
    }};

    try {
      var selectedAccount = account.getSelected(options);
      debug('active account: %s', selectedAccount.name);
    } catch (err) {
      if (options.account) { cb(err); }
      emit('No default account. No account settings used.');
    }
    var files = account.writeDeploymentFiles(project, selectedAccount, additionalConfig);
    debug('files written: %s', files);

    if (options.print) {
      process.env.A127_APPROOT = project.dirname;
      var a127Magic = require('a127-magic');
      a127Magic.config.load(function(config) {

        var displayConfig = _.clone(config);
        delete(displayConfig['a127.magic']);
        emit();
        emit('Configuration');
        emit('=============');
        emit(displayConfig);
        emit('--------------');

        cb(null, project);
      });
    } else {
      cb(null, project);
    }
  });
}

function verify(directory, options, cb) {
  readProject(directory, options, function(err, project) {
    if (err) { return cb(err); }

    swaggerSpec.validate(project.api.swagger, function(err, results) {
      if (err) { return cb(err); }

      var toJsonPointer = function (path) {
        // http://tools.ietf.org/html/rfc6901#section-4
        return '#/' + path.map(function (part) {
            return part.replace(/\//g, '~1');
          }).join('/');
      };

      if (results) {
        if (options.json) {
          cb(null, JSON.stringify(results, null, '  '));
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

          cb(null, 'Results: ' + results.errors.length + ' errors, ' + results.warnings.length + ' warnings');
        }
      } else {
        if (options.json) {
          cb(null, '');
        } else {
          cb(null, 'Results: 0 errors, 0 warnings');
        }
      }
    });
  });
}

function edit(directory, options, cb) {
  readProject(directory, options, function(err, project) {
    if (err) { return cb(err); }
    editor.edit(project, options, cb);
  });
}

function open(directory, options, cb) {
  readProject(directory, options, function(err, project) {
    if (err) { return cb(err); }
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

function showDocs(directory, options, cb) {
  readProject(directory, options, function(err, project) {
    if (err) { return cb(err); }
    netutil.isPortOpen(project.api.port, function(err, isOpen) {
      if (err) { return cb(err); }
      if (isOpen) {
        var a127Magic = require('a127-magic');
        a127Magic.config.load(function(config) {
          if (config.docEndpoints && config.docEndpoints.docs) {
            browser.open(Url.resolve(project.api.localUrl, config.docEndpoints.docs), cb);
          } else {
            emit('Project does not expose the docEndpoints docs path. Check your config.');
          }
        });
      } else {
        emit('Project does not appear to be listening on port ' + project.api.port + '.');
      }
    });
  });
}

function logs(directory, options, cb) {
  readProject(directory, options, function(err, project) {
    if (err) { return cb(err); }
    account.logs(project, options, cb);
  });
}

// .option('-a, --account [account]', 'use specified account')
function deploy(directory, options, cb) {
  readProject(directory, options, function(err, project) {
    if (err) { return cb(err); }
    account.deployProject(project, options, cb);
  });
}

// .option('-a, --account [account]', 'use specified account')
function undeploy(directory, options, cb) {
  readProject(directory, options, function(err, project) {
    if (err) { return cb(err); }
    account.undeployProject(project, options, cb);
  });
}

function bind(name, directory, options, cb) {
  var project;
  async.waterfall(
    [
      function(cb) {
        readProject(directory, options, cb);
      },
      function(proj, cb) {
        project = proj;
        if (name && project.services[name]) {
          return cb(new Error(util.format('Service %s already bound to project %s.', name, project.name)));
        }
        cb();
      },
      function(cb) {
        if (name) { return cb(); }
        serviceCmd.list(null, function(err, services) {
          if (err) { return cb(err); }
          var unboundServices = _.difference(Object.keys(services), Object.keys(project.services));
          cli.chooseOne('Service to bind?', unboundServices, function(selected) {
            name = selected;
            cb();
          });
        });
      },
      function(cb) {
        serviceCmd.get(name, null, cb);
      },
      function(service, cb) {
        project.services[name] = service.data;
        writeServices(project);
        emit('Service %s bound to Project %s.', name, project.name);
        cb(null, REDEPLOY_MESSAGE);
      }
    ],
    cb);
}

function unbind(name, directory, options, cb) {
  var project;
  async.waterfall(
    [
      function(cb) {
        readProject(directory, options, cb);
      },
      function(proj, cb) {
        project = proj;
        if (!Object.keys(project.services).length) {
          return cb(new Error(util.format('No services bound to project %s.', project.name)));
        }
        if (name) { return cb(); }
        cli.chooseOne('Service to unbind?', Object.keys(project.services), function(selected) {
          name = selected;
          cb();
        });
      },
      function(cb) {
        if (!project.services[name]) {
          return cb(new Error(util.format('No service %s bound to project %s.', name, project.name)));
        }
        cb();
      },
      function(cb) {
        delete(project.services[name]);
        writeServices(project);
        util.format('Service %s unbound from project %s.', name, project.name);
        cb(null, REDEPLOY_MESSAGE);
      }
    ],
    cb);
}

function bindings(directory, options, cb) {
  readProject(directory, options, function(err, project) {
    if (err) { return cb(err); }
    var hasServices = Object.keys(project.services).length;
    cb(null, hasServices ? project.services : util.format('No services bound to project %s.', project.name));
  });
}


// Utility

//.option('-n, --name [name]', 'override deployment name')
//.option('-m, --main [main]', 'override deployment main file')
//.option('-b, --base [path]', 'override deployment base path (default is /projectName)')
function readProject(directory, options, cb) {
  findProjectFile(directory, options, function(err, fileName) {
    if (err) { return cb(err); }

    var string = fs.readFileSync(fileName, { encoding: 'utf8' });
    var project = JSON.parse(string);
    project.filename = fileName;
    project.dirname = path.dirname(fileName);
    project.deploymentsDir = path.resolve(project.dirname, 'deployments');

    if (!project.api) { project.api = {}; }
    if (!project.api.name) { project.api.name = project.name; }
    if (!project.api.main && project.script) { project.api.main = project.script.start; }
    if (!project.api.basePath) { project.api.basePath = qs.escape(project.name); }
    if (!project.api.swagger) {
      var file = path.resolve(project.dirname, config.swagger.fileName);
      project.api.swagger = yaml.safeLoad(fs.readFileSync(file, 'utf8'));
    }

    if (options.name && !_.isFunction(options.name)) { project.api.name = options.name; }
    if (options.main) { project.api.main = options.main; }
    if (options.base) { project.api.basePath = options.base; }

    project.configdir = path.resolve(project.dirname, 'config');

    project.services = readServices(project);

    // todo: temporary. need to figure out url dynamically
    project.api.port = config.project.port;
    project.api.localUrl = 'http://localhost:' + project.api.port;

    cb(null, project);
  });
}

function readServices(project) {
  var serviceFile = path.resolve(project.dirname, 'config', '.a127_services');
  if (!fs.existsSync(serviceFile)) { return {}; }
  var yamlString = fs.readFileSync(serviceFile, { encoding: 'utf8' });
  return yaml.safeLoad(yamlString);
}

function writeServices(project) {
  var serviceFile = path.resolve(project.dirname, 'config', '.a127_services');
  var servicesYaml = yaml.safeDump(project.services, { skipInvalid: true  });
  if (debug.enabled) { debug('writing services file: ' + serviceFile); }
  fs.writeFileSync(serviceFile, servicesYaml);
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

  var filter = function(fileName) {
    fileName = fileName.substr(sourceDir.length + 1);
    if (fileName.length > 0) { emit('creating: ' + fileName); }
    return true;
  };

  emit('Copying files to %s...', destDir);
  cpr(sourceDir, destDir, { filter: filter }, function (err) {
    if (err) { return cb(err); }
    customizeClonedFiles(name, destDir, cb);
  });
}

function customizeClonedFiles(name, destDir, cb) {
  // ensure .npmignore is renamed to .gitignore (damn you, npm!)
  var npmignore = path.resolve(destDir, '.npmignore');
  var gitignore = path.resolve(destDir, '.gitignore');
  fs.rename(npmignore, gitignore, function(err) {
    if (err && !fs.existsSync(gitignore)) { return cb(err); }

    npmignore = path.resolve(destDir, 'deployments', '.npmignore');
    gitignore = path.resolve(destDir, 'deployments', '.gitignore');
    fs.rename(npmignore, gitignore, function(err) {
      if (err && !fs.existsSync(gitignore)) { return cb(err); }

      // rewrite package.json
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
