'use strict';

var Tail = require('tail').Tail;
var fs = require('fs');
var Child = require('child_process');
var config = require('../../../config');
var emit = require('../../util/feedback').emit;

module.exports = {
  start: start,
  stop: stop,
  pid: printPid,
  tail: tail
};

var START_DETECT = '[HttpServer] Started.';
var FAILED_START_DETECT = 'unable to start';

function start(options, cb) {
  var out = fs.openSync(config.usergrid.outLog, 'a');
  var err = fs.openSync(config.usergrid.errLog, 'a');
  var startOptions = config.usergrid.startOptions.slice();
  startOptions.unshift('-jar', config.usergrid.jarFile);

  emit('starting...');
  var usergrid = Child.spawn('java', startOptions, { detached: true, stdio: [ 'ignore', out, err ] });
  when(START_DETECT, FAILED_START_DETECT, function(err) {
    if (err) {
      emit('failed to start. Log:');
      tail(null);
      cb(err);
    } else {
      writePid(usergrid.pid);
      cb(null, 'started. (' + usergrid.pid + ')');
    }
  });
  usergrid.unref();
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
