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
      script: project.api.main
    });
    nodemon.on('start', function () {
      emit('  project started here: http://localhost:' + config.project.port); // todo: dynamic path & port
      emit('  project will restart on changes.');
      emit('  to restart at any time, enter `rs`');

      if (options.open) {
        setTimeout(function() {
          emit('Attempting to open in browser...');
          isPortOpen(config.project.port, function(err, reply) {
            if (err) { return cb(err); }
            if (reply) { open(directory); }
          });
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

function edit(directory, options) {
  // todo
  // open the project in the swagger editor
  cb(null, 'not implemented yet');
}

function open(directory, options, cb) {
  // todo: dynamic path & port
  browser.open('http://localhost:' + config.project.port, cb);
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

    if (!project.api) { project.api = {}; }
    if (!project.api.name) { project.api.name = project.name; }
    if (!project.api.main) { project.api.main = project.script.start; }
    if (!project.api.basePath) { project.api.basePath = nameToUri(project.name); }
    if (!project.api.docsPath) { project.api.docsPath = '/docs'; }

    if (options.name) { project.api.name = options.name; }
    if (options.main) { project.api.main = options.main; }
    if (options.base) { project.api.basePath = nameToUri(options.base); }
    if (options.docs) { project.api.docsPath = nameToUri(options.docs); }

    project.api.directory = path.dirname(fileName); // todo: support project files outside of directory?

    cb(null, project);
  });
}

function nameToUri(name) {
  if (!name.startsWith('/')) {
    name = '/' + name;
  }
  return qs.escape(project.name);
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
    fs.writeFile(fileName, JSON.stringify(project, null, '  '), function(err) {
      if (err) { return cb(error); }
      cb(null, 'done!');
    });
  });
}
