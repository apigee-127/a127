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

module.exports = {
  create: create,
  start: start,
  verify: verify,
  edit: edit,
  open: open,
  docs: docs,
  deploy: deploy,
  undeploy: undeploy
}

function create(name, options, cb) {
  var targetDir = path.resolve(process.cwd(), name);
  cloneSkeleton(name, targetDir, cb);
}

//.option('-d, --debug', 'start in debug mode')
//.option('-m, --mock', 'start in mock mode')
//.option('-o, --open', 'open the project in the browser after starting')
function start(directory, options, cb) {

  readProject(directory, options, function(err, project) {

    var fullPath = path.join(project.api.directory, project.api.main);
    emit('Starting: ' + fullPath + '...');
    if (project.api.directory) { process.chdir(project.api.directory); }
    nodemon({
      script: project.api.main,
      ext: 'js,json'
    });
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
    }).on('restart', function (files) {
      emit('Project restarted. Files changed: ', files);
    });
  });
}

function verify(directory, options, cb) {
  // todo
  // verify the project
  cb(null, 'not implemented yet');
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
    isPortOpen(project.api.port, function(err, isOpen) {
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

    if (!project.api) { project.api = {}; }
    if (!project.api.name) { project.api.name = project.name; }
    if (!project.api.main) { project.api.main = project.script.start; }
    if (!project.api.basePath) { project.api.basePath = qs.escape(project.name); }
    if (!project.api.docsPath) { project.api.docsPath = '/docs'; }

    if (options.name) { project.api.name = options.name; }
    if (options.main) { project.api.main = options.main; }
    if (options.base) { project.api.basePath = options.base; }
    if (options.docs) { project.api.docsPath = options.docs; }

    project.api.directory = path.dirname(fileName); // todo: support project files outside of directory?

    // todo: temporary. need to figure out url dynamically
    project.api.port = config.project.port;
    project.api.localUrl = 'http://localhost:' + project.api.port;

    cb(null, project);
  });
}

// .option('-p, --project', 'use specified project file')
function findProjectFile(startDir, options, cb) {
  var current;
  var parent = startDir || process.cwd();
  while (current !== parent) {
    current = parent;
    var projectFile = path.resolve(current, 'package.json')
    if (fs.existsSync(projectFile)) {
      return cb(null, projectFile);
    }
    parent = path.join(current, '..');
  }
  cb(new Error('Project root not found in or above: ' + current));
}

function isPortOpen(port, cb) {
  var net = require('net');
  var timeout = 2000;

  var s = new net.Socket();

  s.setTimeout(timeout, function() {
    s.destroy();
    cb(null, false);
  });
  s.connect(port, function() {
    cb(null, true);
  });

  s.on('error', function(err) {
    s.destroy();
    cb(err, false);
  });
}

function cloneSkeleton(name, destDir, cb) {

  var sourceDir = config.project.skeletonDir;
  var nodeModulesPath = path.resolve(config.project.skeletonDir, 'node_modules');

  var filter = function(name) {
    if (name.indexOf(nodeModulesPath) >= 0) {
      return false;
    }
    var name = name.substr(config.project.skeletonDir.length + 1);
    if (name.length > 0) { emit('creating: ' + name); }
    return true;
  };

  var options = {
    clobber: false,
    filter: filter
  };

  ncp(sourceDir, destDir, options, function (err) {
    if (err) { return cb(error); }
    customizeClonedFiles(name, destDir, cb);
  });
}

function customizeClonedFiles(name, destDir, cb) {
  var fileName = path.resolve(destDir, 'package.json');
  fs.readFile(fileName, { encoding: 'utf8' }, function(err, string) {
    if (err) { return cb(error); }
    var project = JSON.parse(string);
    delete(project.readme);
    delete(project.readmeFilename);
    delete(project._from);
    delete(project._id);
    delete(project._resolved);
    delete(project._shasum);
    project.name = name;
    project.api.name = name;
    project.api.basePath = '/' + name;
    fs.writeFile(fileName, JSON.stringify(project, null, '  '), function(err) {
      if (err) { return cb(error); }
      cb(null, 'done!');
    });
  });
}
