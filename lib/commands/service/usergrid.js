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

var Tail = require('tail').Tail;
var fs = require('fs');
var Child = require('child_process');
var config = require('../../../config');
var emit = require('../../util/feedback').emit;
var usergrid = require('usergrid-installer');
var async = require('async');
var browser = require('../../util/browser');
var path = require('path');
var util = require('util');
var netutil = require('../../util/net');
var proc = require('../../util/process');
var _ = require('lodash');

var START_OPTIONS =  [ '-nogui', '-db' ];

module.exports = {
  start: start,
  stop: stop,
  pid: printPid,
  tail: tail,
  download: download,
  portal: portal
};

var START_DETECT = '[HttpServer] Started.';
var FAILED_START_DETECT = 'unable to start';

//.option('-d, --download', 'download Usergrid if needed')
//.option('-r, --reset', 'reset your Usergrid to an empty database')
//.option('-p, --portal', 'open the web portal once started')
function start(options, cb) {

  if (usergridRunning()) { return cb(null, 'Usergrid is running.'); }

  async.parallel([
    function(cb) {
      ensureNotOpen('Usergrid', config.usergrid.port, cb);
    },
    function(cb) {
      ensureNotOpen('Cassandra', config.usergrid.thriftPort, cb);
    }],
    function(err, results) {
      if (err) { return cb(err); }

      usergrid.launcherFile(false, function(err, fileName) {
        var download = false;
        if (options.download && !fileName) {
          download = true;
          emit('Usergrid not present. Downloading...');
        }
        usergrid.launcherFile(options.download, function(err, fileName) {
          if (err) { return cb(err); }
          if (!fileName) { return cb(null, 'Usergrid not present. Run with --download option or execute "usergrid download" first.'); }
          if (download) { emit('downloaded to: ' + fileName); }

          var spawnArgs = START_OPTIONS.slice(0);
          // if not already initialized, do it..
          var cassConfigFile = path.resolve(config.usergrid.tmpDir, 'tmp/cassandra.yaml');
          if (options.reset || !fs.existsSync(cassConfigFile)) { spawnArgs.push('-init'); }

          spawnArgs.push('-port'); spawnArgs.push(config.usergrid.port);
          spawnArgs.unshift('-jar', fileName);

          var out = fs.openSync(config.usergrid.outLog, 'a');
          var err = fs.openSync(config.usergrid.errLog, 'a');
          var spawnOpts = { cwd: config.usergrid.tmpDir, detached: true, stdio: [ 'ignore', out, err ] };

          emit('starting...');
          if (config.debug) {
            console.log('spawnArgs: ' + spawnArgs);
            console.log('spawnOpts: ' + JSON.stringify(spawnOpts));
          }
          var launcher = Child.spawn('java', spawnArgs, spawnOpts);
          when(START_DETECT, FAILED_START_DETECT, function(err) {
            if (err) {
              emit(err.message);
              emit('failed to start. Log tail:');
              return tail(null, cb);
            }

            writePid(launcher.pid);

            emit('started. (' + launcher.pid + ')');
            emit('Note:');
            emit('  default Usergrid superuser: superuser/superuser');
            emit('  default test-organization admin: test/test');

            if (options.portal) {
              portal(options, cb);
            } else {
              cb();
            }
          });
          launcher.unref();
        });
      });
    }
  );
}

function ensureNotOpen(name, port, cb) {
  netutil.isPortOpen(port, function(err, open) {
    if (err) { return cb(err); }
    if (open) {
      var msg = util.format(
          'Port %d in use. Stop %s process (or other process using port) and try again.', port, name);
      return cb(new Error(msg));
    }
    cb();
  });
}

function download(options, cb) {
  emit('Downloading Usergrid and Portal as needed...');
  async.parallel([
    function(cb) {
      usergrid.launcherFile(true, cb);
    },
    function(cb) {
      usergrid.portalFile(true, cb);
    }
  ],
  function(err, results) {
    emit('downloaded');
    cb(null, results);
  });
}

function stop(options, cb) {
  if (!usergridRunning()) { return cb(null, "Usergrid isn't running (or process id is unknown)."); }
  emit('stopping...');
  var stopped = false;
  var count = 0;

  var stopIt = function(term, cb) {
    try {
      var pid = readPid();
      if (!pid) { stopped = true; cb(); }
      proc.kill(pid, term);
      cb();
    } catch (err) {
      if (err.code === 'ESRCH') {
        stopped = true;
        deletePid();
        cb();
      } else {
        cb(err);
      }
    }
  };

  async.whilst(
    function() { return !stopped && ++count < 5; },
    function(cb) {
      stopIt('SIGTERM', function(err) {
        if (err) { return cb(err); }
        setTimeout(cb, 1000);
      });
    },
    function(err) {
      if (err) { return cb(err); }
      if (stopped) { return cb(null, 'stopped'); }

      stopIt('SIGKILL', function(err) {
        if (err) { return cb(err); }
        deletePid();
        cb(null, 'killed');
      });
    }
  );
}

function printPid(options, cb) {
  if (!usergridRunning()) {
    cb(null, "Usergrid doesn't appear to be running");
  } else {
    cb(null, readPid());
  }
}

// follow: true   (note: if true, cb() will never be called)
// lines: # lines to return
function tail(options, cb) {
  if (!options) { options = {}; }
  var lines = [];
  var fsR = require('fs-reverse');
  var instream = fsR(config.usergrid.outLog, { bufferSize: 1 });
  var count = 0, numLines = options.lines || 10;
  instream.on('data', function(line) {
    if (++count > numLines) { return instream.destroy(); }
    lines.unshift(line);
  });
  instream.on('error', function(err) {
    return cb(err);
  });
  instream.on('close', function(err) {
    if (!options.follow) { return cb(null, lines.join('\n')); }
    for (var i = 0; i < lines.length; i++) {
      emit(lines[i]);
    }
    var tail = new Tail(config.usergrid.outLog);
    tail.on('line', function(line) {
      emit(line);
    });
    if (options.tail_cb) { options.tail_cb(tail); }
  });
}

function portal(options, cb) {

  usergrid.portalFile(false, function(err, fileName) {
    if (!usergridRunning() && !options.start) {
      return cb(null, "Usergrid doesn't appear to be running. Run with --start option or execute 'a127 usergrid start' first.");
    }

    if (!fileName && !options.download) {
      return cb(null, "Usergrid portal not present. Run with --download option or execute 'a127 usergrid download' first.");
    }

    start(options, function(err) {
      usergrid.portalFile(options.download, function(err, fileName) {
        if (path.sep === '\\') {
          fileName = fileName.split(path.sep).join('/');
        }
        browser.open(fileName, cb);
      });
    });
  });
}


// utility

function usergridRunning() {
  return !!readPid();
}

function writePid(pid) {
  fs.writeFileSync(config.usergrid.pidFile, '' + pid);
}

function readPid() {
  try {
    return fs.readFileSync(config.usergrid.pidFile).toString();
  } catch (err) {
    if (err.code !== 'ENOENT') { throw err; }
    return null;
  }
}

function deletePid() {
  fs.unlinkSync(config.usergrid.pidFile);
}

function when(success, error, cb) {
  cb = _.once(cb);
  var finished = false;
  var t = new Tail(config.usergrid.outLog);

  var timeout = setTimeout(function() {
    if (finished) { return; }
    // one final check (this is for Windows)
    tail({ lines: 1}, function(err, data) {
      if (data.indexOf(success) !== -1) {
        done(null, data)
      }
    });
    done(new Error('timeout'));
  }, config.usergrid.startTimeout);

  var done = function(err, line) {
    finished = true;
    clearTimeout(timeout);
    t.unwatch();
    cb(err, line);
  };

  t.on('line', function(line) {
    if (finished) { return; }
    emit('.\\');

    if (line.indexOf(success) !== -1) {
      done(null, line);
    } else if (error && line.indexOf(error) !== -1) {
      done(new Error('error'), line);
    }
  });
}
