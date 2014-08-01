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
config.tmpDir = path.join(config.userHome, '.a127');
mkDir(config.tmpDir);

// todo: temporary - remove github volos from package and just get the proxy for install
config.volosProxyDir = path.resolve(config.rootDir, 'node_modules/Volos/proxy');

module.exports = config;


// usergrid //

var USERGRID_TMP = tempDir('usergrid');

config.usergrid = {
  tmpDir:   USERGRID_TMP,
  outLog:  path.resolve(USERGRID_TMP, 'usergrid.log'),
  errLog:  path.resolve(USERGRID_TMP, 'usergrid.log'),
  pidFile:  path.resolve(USERGRID_TMP, 'usergrid.pid'),
  startOptions: [ '-nogui', '-db', '-init' ],
  startTimeout: 20000
};


// profile //

config.account = {
  file: path.resolve(config.tmpDir, 'accounts')
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
