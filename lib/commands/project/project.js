'use strict';

var config = require('../../../config');
var browser = require('../../util/browser');

module.exports = {
  create: todo,
  start: todo,
  stop: todo,
  restart: todo,
  verify: todo,
  edit: todo,
  open: open,
  docs: todo,
  deploy: todo,
  undeploy: todo
}

function todo() {
  console.log('not implemented yet');
  process.exit(1);
}

function open() {
  browser.open('http://www.apigee.com');
}
