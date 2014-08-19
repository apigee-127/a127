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

config.volosProxyDir = path.resolve(config.nodeModules, 'Volos/proxy');

module.exports = config;

// swagger editor //

config.swagger = {
  fileName: 'api/swagger/swagger.json',
  editorDir: path.resolve(config.nodeModules, 'swagger-editor-for-apigee-127')
};

// usergrid //

var USERGRID_TMP = tempDir('usergrid');

config.usergrid = {
  tmpDir:   USERGRID_TMP,
  outLog:  path.resolve(USERGRID_TMP, 'usergrid.log'),
  errLog:  path.resolve(USERGRID_TMP, 'usergrid.log'),
  pidFile:  path.resolve(USERGRID_TMP, 'usergrid.pid'),
  startOptions: [ '-nogui', '-db' ],
  startTimeout: 20000,
  portalURL: 'http://usergrid-portal.s3-website-us-west-2.amazonaws.com/?api_url=http://127.0.0.1:8080#!/login'
};


// account //

config.account = {
  file: path.resolve(config.tmpDir, 'accounts')
};


// project //

config.project = {
  port: 10010,
  skeletonDir: path.resolve(config.nodeModules, 'a127-skeleton')
};

// home directory config - load last

loadUserConfig();


// utility

function tempDir(relativePath) {
  if (!relativePath) { return config.tmpDir; }
  var dirPath = path.resolve(config.tmpDir, relativePath);
  mkDir(dirPath);
  return dirPath;
}

function mkDir(path) {
  try {
    fs.mkdirSync(path);
  } catch (err) {
    if (err.code !== 'EEXIST') { throw err; }
  }
}

function loadUserConfig() {
  try {
    var confPath = path.join(config.tmpDir, USER_CONFIG);
    var userConf = require(confPath);
    _.extend(config, userConf);
    if (config.debug) {
      console.log('user config loaded from ' + confPath);
    }
  } catch (err) {
    // ignore
  }
}
