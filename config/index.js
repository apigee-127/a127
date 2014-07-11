'use strict';

var Path = require('path');
var fs = require('fs');

var config = {
  rootDir: Path.resolve(__dirname, '..'),
  userHome: process.env[(process.platform == 'win32') ? 'USERPROFILE' : 'HOME'],
  debug: !!process.env.DEBUG
}
config.tmpDir = Path.join(config.userHome, '.a127');
mkDir(config.tmpDir);

// todo: temporary - remove github volos from package and just get the proxy for install
config.volosProxyDir = Path.resolve(config.rootDir, 'node_modules/Volos/proxy');

module.exports = config;


// usergrid //

var USERGRID_TMP = tempDir('usergrid');

config.usergrid = {
  tmpDir:   USERGRID_TMP,
  outLog:  Path.resolve(USERGRID_TMP, 'usergrid.log'),
  errLog:  Path.resolve(USERGRID_TMP, 'usergrid.log'),
  pidFile:  Path.resolve(USERGRID_TMP, 'usergrid.pid'),
  jarFile:  Path.resolve(config.rootDir, 'usergrid-launcher.jar'), // todo: temporary - download from somewhere...
  startOptions: [ '-nogui', '-db', '-init' ],
  startTimeout: 20000
}


// profile //

config.account = {
  file: Path.resolve(config.tmpDir, 'accounts')
}


// utility

function tempDir(relativePath) {
  if (!relativePath) { return config.tmpDir; }
  var path = Path.resolve(config.tmpDir, relativePath);
  mkDir(path);
  return path;
}

function mkDir(path) {
  try {
    fs.mkdirSync(path);
  } catch (err) {
    if (err.code !== 'EEXIST') { throw err; }
  }
}
