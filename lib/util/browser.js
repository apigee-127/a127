'use strict';

var Child = require('child_process');
var config = require('../../config');
var emit = require('./feedback').emit;

var platform = process.platform;
if (platform !== 'darwin' && platform !== 'win32') { platform = 'other'; }

var browser = escape(config.browser);

var platformOpen = {

  darwin: function(url, cb) {
    if (browser) {
      open('open -a ' + browser, url, cb);
    } else {
      open('open', url, cb);
    }
  },

  win32: function(url, cb) {
    if (browser) {
      open('start "" "' + browser + '"', url, cb);
    } else {
      open('start ""', url, cb);
    }
  },

  other: function(url, cb) {
    if (browser) {
      open(browser, url), cb;
    } else {
      cb(new Error('must specify browser in config'));
    }
  }
}

module.exports = {
  open: platformOpen[platform]
}

function open(command, url, cb) {
  if (config.debug) { emit('command: ' + command); }
  emit('opening browser to: ' + url)
  Child.exec(command + ' "' + escape(url) + '"', cb);
}

function escape(s) {
  if (!s) { return s; }
  return s.replace(/"/g, '\\\"');
}
