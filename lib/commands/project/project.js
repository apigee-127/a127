'use strict';

var config = require('../../../config');
var browser = require('../../util/browser');

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

function create(name, options) {
  // todo
  console.log('not implemented yet');
}

//.option('-d, --debug', 'start in debug mode')
//.option('-m, --mock', 'start in mock mode')
function start(directory, options) {
  // todo
  // verify project
  // start the express server
  // send user to local web page
  console.log('not implemented yet');
}

function stop(directory, options) {
  // todo
  // stop the express server
  console.log('not implemented yet');
}

// do we need this?
function restart(directory, options) {
  // todo
  console.log('not implemented yet');
}

function verify(directory, options) {
  // todo
  // verify the project
  console.log('not implemented yet');
}

function edit(directory, options) {
  // todo
  // open the project in the swagger editor
  console.log('not implemented yet');
}

function open(directory, options) {
  // todo
  browser.open('http://www.apigee.com');
}

function docs(directory, options) {
  // todo
  console.log('not implemented yet');
}

// .option('-a, --account', 'use specified account')
function deploy(directory, options) {
  // todo
  console.log('not implemented yet');
}

// .option('-a, --account', 'use specified account')
function undeploy(directory, options) {
  // todo
  console.log('not implemented yet');
}

function open() {
  browser.open('http://www.apigee.com');
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
