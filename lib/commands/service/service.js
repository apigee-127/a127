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

/*
file schema:
  name: {
    metadata: {
      account: 'apigee',
      type: 'RemoteProxy',
    }
    data: { // the following fields are provider and type dependant. They will be included in the deployment config...
      apigeeProxyUri: 'uri',
      apigeeProxyKey: 'key'
    }
  }
*/

var config = require('../../../config');
var fs = require('fs');
var _ = require('lodash');
var path = require('path');
var accountCmd = require('../account/account');
var cli = require('../../util/cli');
var browser = require('../../util/browser');
var emit = require('../../util/feedback').emit;
var yaml = require('yamljs');
var debug = require('debug')('true');
var util = require('util');

module.exports = {
  list: list,
  create: create,
  delete: del,
  types: listTypes
};

function list(options, cb) {
  var servicesData = readServicesFile(options);
  var list = _.map(servicesData, function(service, name) {
    var each = {};
    each[name] = service.metadata;
    return each;
  });
  cb(null, list);
}

function create(name, options, cb) {
  var servicesData = readServicesFile(options);
  if (servicesData[name]) { return cb(new Error(util.format('Service named %s already exists', name))); }
  accountCmd.createService(name, options, function(err, service) {
    if (err) { return cb(err); }
    writeService(name, service, servicesData);
    cb(null, service);
  });
}

function del(name, options, cb) {
  var servicesData = readServicesFile(options);
  var service = servicesData[name];
  if (!service) { return cb(new Error(util.format('No service named %s', name))); }
  accountCmd.deleteService(name, service, options, function(err, reply) {
    if (err) { return cb(err); }
    delete servicesData[name];
    writeServicesFile(servicesData);
    cb(null, reply);
  });
}

function listTypes(account, options, cb) {
  accountCmd.listServiceTypes(account, options, cb);
}

// util

function readServicesFile() {
  try {
    var string = fs.readFileSync(config.services.file, { encoding: 'utf8' });
    return JSON.parse(string);
  } catch (err) {
    return {};
  }
}

// servicesData is optional
function writeService(name, service, servicesData) {
  if (!servicesData) { servicesData = readServicesFile(options); }
  servicesData[name] = service;
  writeServicesFile(servicesData);
}

function writeServicesFile(servicesData) {
  var stringified = JSON.stringify(servicesData);
  fs.writeFileSync(config.services.file, stringified);
}
