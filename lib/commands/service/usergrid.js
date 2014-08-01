'use strict';

var Tail = require('tail').Tail;
var fs = require('fs');
var Child = require('child_process');
var config = require('../../../config');
var emit = require('../../util/feedback').emit;
var usergrid = require('usergrid-installer');

module.exports = {
  start: start,
  stop: stop,
  pid: printPid,
  tail: tail,
  install: install
};

var START_DETECT = '[HttpServer] Started.';
var FAILED_START_DETECT = 'unable to start';

function start(options, cb) {

  usergrid.launcherFile(false, function(err, fileName) {
    var installing = false;
    if (options.install && !fileName) {
      installing = true;
      emit('Usergrid not installed. Installing...');
    }
    usergrid.launcherFile(options.install, function(err, fileName) {
      if (err) { return cb(err); }
      if (!fileName) { return cb(null, 'Usergrid not installed. Run with --install option or use "usergrid install"'); }
      if (installing) { emit(fileName + ' installed'); }

      var out = fs.openSync(config.usergrid.outLog, 'a');
      var err = fs.openSync(config.usergrid.errLog, 'a');
      var startOptions = config.usergrid.startOptions.slice();
      startOptions.unshift('-jar', fileName);

      emit('starting...');
      var launcher = Child.spawn('java', startOptions, { detached: true, stdio: [ 'ignore', out, err ] });
      when(START_DETECT, FAILED_START_DETECT, function(err) {
        if (err) {
          emit('failed to start. Log:');
          tail(null);
          cb(err);
        } else {
          writePid(launcher.pid);
          cb(null, 'started. (' + launcher.pid + ')');
        }
      });
      launcher.unref();
    });
  });
}

function install(options, cb) {
  emit('installing...');
  usergrid.launcherFile(true, function(err, fileName) {
    if (err) { return cb(err); }
    cb(null, fileName + ' installed');
  });
}

function stop(options, cb) {
  var pid = readPid();
  if (!pid) {
    cb(null, "Usergrid doesn't appear to be running");
  }
  emit('stopping...');
  var stopit = function(term) {
    try {
      process.kill(readPid(), term);
    } catch (err) {
      if (err.code === 'ESRCH') {
        deletePid();
        cb(null, 'stopped');
      }
    }
  }
  stopit('SIGTERM');
  var count = 0;
  var interval = setInterval(function() {
    stopit('SIGTERM');
    if (count++ > 5) {
      clearInterval(interval);
      stopit('SIGKILL');
    }
  }, 1000);

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
  var tail = Child.spawn('tail', [config.usergrid.outLog]);
  tail.stdout.on('data', function(buf) {
    emit(buf.toString());
    if (options.follow) {
      var tail = new Tail(config.usergrid.outLog);
      tail.on('line', function (line) {
        emit(line);
      });
    } else {
      if (cb) { cb(); }
    }
  });
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
  var tail = new Tail(config.usergrid.outLog);

  var timeout = setTimeout(function() {
    cb(new Error('timeout'));
  }, config.usergrid.startTimeout);

  var done = function(err, line) {
    clearTimeout(timeout);
    tail.unwatch();
    cb(err, line);
  }

  tail.on('line', function(line) {
    emit('.\\');

    if (line.indexOf(success) !== -1) {
      done(null, line);
    } else if (error && line.indexOf(error) !== -1) {
      done(new Error('error'), line);
    }
  });
}
