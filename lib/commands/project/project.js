'use strict';

var config = require('../../../config');
var browser = require('../../util/browser');

module.exports = {
  create: todo,
  init: todo,
  deploy: todo,
  undeploy: todo,
  start: todo,
  stop: todo,
  show: todo,
  mock: todo,
  open: open,
  docs: todo
}

function todo() {
  console.log('not implemented yet');
  process.exit(1);
}

function open() {
  browser.open('http://www.apigee.com');
}
