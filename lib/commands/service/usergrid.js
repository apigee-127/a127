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
var _ = require('lodash');

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

      var spawnArgs = config.usergrid.startOptions.slice();
      // if not already initialized, do it..
      var cassConfigFile = path.resolve(config.usergrid.tmpDir, 'tmp/cassandra.yaml');
      if (options.reset || !fs.existsSync(cassConfigFile)) { spawnArgs.push('-init'); }
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
          emit('failed to start. Log tail:');
          tail(null, cb);
        } else {
          writePid(launcher.pid);

          emit('started. (' + launcher.pid + ')');
          emit('Note:');
          emit('  default Usergrid superuser: superuser/superuser');
          emit('  default test-organization admin: test/test');

          if (options.portal) {
            portal(null, cb);
          } else {
            cb();
          }
        }
      });
      launcher.unref();
    });
  });
}

function download(options, cb) {
  emit('downloading...');
  usergrid.launcherFile(true, function(err, fileName) {
    if (err) { return cb(err); }
    cb(null, 'downloaded to: ' + fileName);
  });
}

function stop(options, cb) {
  var pid = readPid();
  if (!pid) { return cb(null, "Usergrid doesn't appear to be running"); }
  emit('stopping...');
  var stopped = false;
  var count = 0;

  var stopIt = function(term, cb) {
    try {
      var pid = readPid();
      if (!pid) { stopped = true; cb(); }
      process.kill(readPid(), term);
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
  }

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
        cb(null, 'killed');
      });
    }
  );
}

function printPid(options, cb) {
  var pid = readPid();
  if (!pid) {
    cb(null, "Usergrid doesn't appear to be running");
  } else {
    cb(null, pid);
  }
}

// options: { follow: true } // if follow, cb() will never be called
function tail(options, cb) {
  var t = Child.spawn('tail', [config.usergrid.outLog]);
  t.stdout.on('data', function(buf) {
    emit(buf.toString());
    if (options && options.follow) {
      var tail = new Tail(config.usergrid.outLog);
      tail.on('line', function (line) {
        emit(line);
      });
    } else {
      if (cb) { cb(); }
    }
  });
}

function portal(options, cb) {
  var pid = readPid();
  if (!pid) {
    cb(null, "Usergrid doesn't appear to be running");
  } else {
    emit('Opening Usergrid portal...');
    browser.open(config.usergrid.portalURL, cb);
  }
}


// utility

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
  var t = new Tail(config.usergrid.outLog);

  var timeout = setTimeout(function() {
    cb(new Error('timeout'));
  }, config.usergrid.startTimeout);

  var done = function(err, line) {
    clearTimeout(timeout);
    t.unwatch();
    cb(err, line);
  }

  t.on('line', function(line) {
    emit('.\\');

    if (line.indexOf(success) !== -1) {
      done(null, line);
    } else if (error && line.indexOf(error) !== -1) {
      done(new Error('error'), line);
    }
  });
}
