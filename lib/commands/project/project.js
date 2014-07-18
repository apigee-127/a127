'use strict';

var config = require('../../../config');
var browser = require('../../util/browser');
var async = require('async');
var account = require('../account');
var Url = require('url');
var Path = require('path');
var fs = require('fs');
var qs = require('querystring');

module.exports = {
  create: create,
  start: start,
  stop: stop,
  restart: restart,
  verify: verify,
  edit: edit,
  open: open,
  docs: docs,
  deploy: deploy,
  undeploy: undeploy
}

function todo() {
  console.log('not implemented yet');
  process.exit(1);
}

function create(name, options, cb) {
  // todo
  console.log('not implemented yet');
}

//.option('-d, --debug', 'start in debug mode')
//.option('-m, --mock', 'start in mock mode')
function start(directory, options, cb) {
  // todo
  // verify project
  // start the server
  // send user to local web page
  console.log('not implemented yet');
}

function stop(directory, options, cb) {
  // todo
  // stop the server
  console.log('not implemented yet');
}

// todo: do we need this?
function restart(directory, options, cb) {
  // todo
  console.log('not implemented yet');
}

function verify(directory, options, cb) {
  // todo
  // verify the project
  console.log('not implemented yet');
}

function edit(directory, options) {
  // todo
  // open the project in the swagger editor
  console.log('not implemented yet');
}

function open(directory, options, cb) {
  // todo
  browser.open('http://www.apigee.com');
}

function docs(directory, options, cb) {
  // todo
  console.log('not implemented yet');
}

// .option('-a, --account [account]', 'use specified account')
function deploy(directory, options, cb) {
  var project = readProject(directory, options);
  account.deployProject(project, options, cb);
}

// .option('-a, --account [account]', 'use specified account')
function undeploy(directory, options, cb) {
  var project = readProject(directory, options);
  account.undeployProject(project, options, cb);
}

function open() {
  browser.open('http://www.apigee.com');
}


// Utility

//.option('-n, --name [name]', 'override deployment name')
//.option('-m, --main [main]', 'override deployment main file')
//.option('-b, --base [base]', 'override deployment base uri')
function readProject(directory, options) {
  var fileName = findProjectFile(directory, options);

  var string = fs.readFileSync(fileName, { encoding: 'utf8' });
  var project = JSON.parse(string);

  if (!project.api) { project.api = {}; }
  if (!project.api.name) { project.api.name = project.name; }
  if (!project.api.main) { project.api.main = project.script.start; }
  if (!project.api.basePath) { project.api.basePath = nameToUri(project.name); }

  if (options.name) { project.api.name = options.name; }
  if (options.main) { project.api.name = options.main; }
  if (options.base) { project.api.base = nameToUri(options.base); }

  project.api.directory = Path.dirname(fileName); // todo: support project files outside of directory?

  return project;
}

function nameToUri(name) {
  if (!name.startsWith('/')) {
    name = '/' + name;
  }
  return qs.escape(project.name);
}

// .option('-p, --project', 'use specified project file')
function findProjectFile(startDir, options) {
  var current = startDir || process.cwd();
  var parent;
  while (current !== '/') { // todo: probably won't work on Windoze
    var projectFile = Path.resolve(current, 'package.json')
    if (fs.existsSync(projectFile)) {
      return projectFile;
    }
    current = Path.join('..', current);
  }
  throw new Error('Project root not found in or above: ' + current);
}

/* Potential directory structure...

/api
  /swagger
  /controllers
  /helpers
  /models
  /views
/bin
/config
  /profiles
/docs
/logs
/scripts
/test
.gitignore
LICENSE
api.js
README.md
package.json

*/
