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

// see config.js to override or create user-specific properties //

var USER_CONFIG = 'config.js';

var path = require('path');
var fs = require('fs');
var _ = require('lodash');

var config = {
  rootDir: path.resolve(__dirname, '..'),
  userHome: process.env[(process.platform == 'win32') ? 'USERPROFILE' : 'HOME'],
  debug: !!process.env.DEBUG
};
config.nodeModules = path.resolve(config.rootDir, 'node_modules');
config.tmpDir = path.join(config.userHome, '.a127');
mkDir(config.tmpDir);

module.exports = config;

// swagger editor //

config.swagger = {
  fileName: 'api/swagger/swagger.yaml',
  editorDir: path.resolve(config.nodeModules, 'swagger-editor')
};

// usergrid //

var USERGRID_TMP = tempDir('usergrid');

config.usergrid = {
  tmpDir:   USERGRID_TMP,
  outLog:  path.resolve(USERGRID_TMP, 'usergrid.log'),
  errLog:  path.resolve(USERGRID_TMP, 'usergrid.log'),
  pidFile:  path.resolve(USERGRID_TMP, 'usergrid.pid'),
  startTimeout: 20000,
  port: 8080,
  thriftPort: 9160
};


// account //

config.account = {
  file: path.resolve(config.tmpDir, 'accounts')
};


// project //

config.project = {
  port: process.env.PORT || 10010,
  skeletonDir: path.resolve(__dirname, '..', 'project-skeleton')
};


// services //

config.services = {
  file: path.resolve(config.tmpDir, 'services')
};


// load home directory config
loadUserConfig();

// load env vars
loadEnvConfig();


// utility

function tempDir(relativePath) {
  if (!relativePath) { return config.tmpDir; }
  var dirPath = path.resolve(config.tmpDir, relativePath);
  mkDir(dirPath);
  return dirPath;
}

function mkDir(path) {
  try {
    fs.mkdirSync(path, '0700');
  } catch (err) {
    if (err.code !== 'EEXIST') { throw err; }
  }
}

function loadUserConfig() {
  try {
    var confPath = path.join(config.tmpDir, USER_CONFIG);
    var userConf = require(confPath);
    _.merge(config, userConf);
    if (config.debug) {
      console.log('user config loaded from ' + confPath);
    }
  } catch (err) {
    // ignore
  }
}

function loadEnvConfig() {
  _.each(process.env, function(value, key) {
    if (key.indexOf('a127_') == 0) {
      var split = key.split('_');
      var configItem = config;
      for (var i = 1; i < split.length; i++) {
        var subKey = split[i];
        if (i < split.length - 1) {
          if (!configItem[subKey]) { configItem[subKey] = {}; }
          configItem = configItem[subKey];
        } else {
          configItem[subKey] = value;
        }
      }
    }
  });
}