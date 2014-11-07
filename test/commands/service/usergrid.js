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

var should = require('should');
var util = require('util');
var path = require('path');
var proxyquire =  require('proxyquire');
var tmp = require('tmp');
var fs = require('fs');
var config = require('../../../config');
var helpers = require('../../helpers');
var _ = require('lodash');

var START_DETECT = '[HttpServer] Started.';
var FAILED_START_DETECT = 'unable to start';

describe('usergrid', function() {

  var tmpDir;
  var portsOpen = [];
  var launcherFileExists = false;
  var portalFileExists = false;
  var launcherFile, portalFile;
  var spawn = {};
  var didOpenBrowser;
  var killed = {};
  var processGone;

  var usergridStubs = {
    'usergrid-installer': {
      launcherFile: function(download, cb) {
        cb(null, (launcherFileExists || download) ? launcherFile : null);
      },
      portalFile: function(download, cb) {
        cb(null, (portalFileExists || download) ? portalFile : null);
      }
    },
    '../../util/net': {
      isPortOpen: function(port, cb) {
        cb(null, _.contains(portsOpen, port));
      }
    },
    'child_process': {
      spawn: function(command, args, options) {
        spawn.command = command;
        spawn.args = args;
        spawn.options = options;

        return {
          unref: function() {},
          pid: 1234
        };
      }
    },
    '../../util/browser': {
      open: function(url, cb) {
        didOpenBrowser = true;
        cb();
      }
    },
    '../../util/process': {
      kill: function(pid, term) {
        killed.pid = pid;
        killed.term = term;
        if (processGone) {
          var err = new Error();
          err.code = 'ESRCH';
          throw err;
        }
      }
    }
  };
  var usergrid = proxyquire('../../../lib/commands/service/usergrid', usergridStubs);

  before(function(done) {
    tmp.setGracefulCleanup();
    tmp.dir({ unsafeCleanup: true }, function(err, dir) {
      should.not.exist(err);
      tmpDir = dir;
      process.chdir(tmpDir);

      config.debug = true;
      config.usergrid.tmpDir = tmpDir;
      config.usergrid.pidFile = path.resolve(tmpDir, 'pidfile');
      config.usergrid.outLog = path.resolve(tmpDir, 'outlog');
      config.usergrid.errLog = path.resolve(tmpDir, 'errlog');

      launcherFile = path.resolve(tmpDir, 'launcher_file');
      portalFile = path.resolve(tmpDir, 'portal_file');

      done();
    });
  });

  after(function() {
    config.debug = false;
  });

  describe('pid', function() {

    after(function() {
      try{ fs.unlinkSync(config.usergrid.pidFile); } catch(err) {}
    });

    it('should return message if not running', function(done) {
      usergrid.pid({}, function(err, reply) {
        should.not.exist(err);
        reply.should.equal("Usergrid doesn't appear to be running");
        done();
      });
    });

    it('should return pid if running', function(done) {
      fs.writeFileSync(config.usergrid.pidFile, '1234');
      usergrid.pid({}, function(err, reply) {
        reply.should.equal('1234');
        done();
      });
    });
  });

  describe('tail', function() {

    var outputLines = '';

    before(function(done) {
      config.usergrid.outLog = path.resolve(tmpDir, 'tailLog');
      for (var i = 0; i < 20; i++) {
        outputLines += 'line' + i + '\n';
      }
      fs.writeFile(config.usergrid.outLog, outputLines, done);
    });

    var capture;
    beforeEach(function() {
      capture = helpers.captureOutput();
    });

    afterEach(function() {
      capture.release();
    });

    // follow: true   (note: if true, cb() will never be called)
    // lines: # lines to return
    it('should display tail', function(done) {
      usergrid.tail(null, function(err, reply) {
        should.not.exist(err);
        reply.should.containEql('line11');
        reply.should.containEql('line19');
        reply.should.not.containEql('line10');
        done();
      });
    });

    it('should display requested number of lines', function(done) {
      var options = { lines: 5 };
      usergrid.tail(options, function(err, reply) {
        should.not.exist(err);
        reply.should.containEql('line16');
        reply.should.containEql('line19');
        reply.should.not.containEql('line15');
        done();
      });
    });

    it('should be able to follow', function(done) {
      var options = {
        follow: true,
        tail_cb: function(tail) {
          tail.on('line', function (line) { // 3. check follow
            line.should.equal('moar data');
            var logged = capture.output();
            logged.should.containEql('moar data');
            done();
          });
          setTimeout(function() { // 2. write to log
            fs.appendFileSync(config.usergrid.outLog, 'moar data\n');
          }, 100);
        }
      };
      // 1. check initial tail
      usergrid.tail(options);
      setTimeout(function() {
        // 2. check logged
        var logged = capture.output();
        logged.should.containEql('line11');
        logged.should.containEql('line19');
        logged.should.not.containEql('line10');
        logged.should.not.containEql('moar data');
      }, 100);
    });
  });

//.option('-p, --portal', 'open the web portal once started')
  describe('start', function() {

    var cassConfigFile;
    var count = 0;

    before(function() {
      config.usergrid.outLog = path.resolve(tmpDir, 'startLog');
      cassConfigFile = path.resolve(config.usergrid.tmpDir, 'tmp/cassandra.yaml');
      fs.mkdirSync(path.dirname(cassConfigFile));
    });

    beforeEach(function() {
      config.usergrid.outLog = path.resolve(tmpDir, 'startLog' + count++);
      launcherFileExists = true;
      spawn = {};
      try{ fs.unlinkSync(config.usergrid.pidFile); } catch(err) {}
    });

    describe('should error if already running', function() {

      after(function() {
        portsOpen = [];
      });

      it('Usergrid', function(done) {
        portsOpen = [config.usergrid.port];
        usergrid.start({}, function(err, reply) {
          should.exist(err);
          var msg = util.format(
            'Port %d in use. Stop %s process (or other process using port) and try again.', config.usergrid.port, 'Usergrid');
          err.message.should.equal(msg);
          done();
        });
      });

      it('Cassandra', function(done) {
        portsOpen = [config.usergrid.thriftPort];
        usergrid.start({}, function(err, reply) {
          should.exist(err);
          var msg = util.format(
            'Port %d in use. Stop %s process (or other process using port) and try again.', config.usergrid.thriftPort, 'Cassandra');
          err.message.should.equal(msg);
          done();
        });
      });
    });

    it('should not download if not requested', function(done) {
      launcherFileExists = false;
      usergrid.start({}, function(err, reply) {
        should.not.exist(err);
        reply.should.equal('Usergrid not present. Run with --download option or execute "usergrid download" first.');
        done();
      });
    });

    it('should download on request', function(done) {
      launcherFileExists = false;
      fakeStartUsergrid();
      usergrid.start({ download: true }, function(err) {
        should.not.exist(err);

        spawn.command.should.eql('java');
        spawn.args.should.eql(['-jar', launcherFile, '-nogui', '-db', '-init', '-port', 8080]);
        spawn.options.should.have.property('cwd', tmpDir);
        spawn.options.should.have.property('detached', true);

        done();
      });
    });

    describe('if no database', function() {

      it('should init', function(done) {
        try { fs.unlinkSync(cassConfigFile); } catch (err) {}
        fakeStartUsergrid();
        usergrid.start({}, function(err) {
          should.not.exist(err);

          spawn.command.should.eql('java');
          spawn.args.should.eql(['-jar', launcherFile, '-nogui', '-db', '-init', '-port', 8080]);
          spawn.options.should.have.property('cwd', tmpDir);
          spawn.options.should.have.property('detached', true);

          done();
        });
      });
    });

    describe('if database exists', function() {

      before(function() {
        fs.writeFileSync(cassConfigFile, '1234');
      });

      it('should start without init', function(done) {
        fakeStartUsergrid();
        usergrid.start({}, function(err, reply) {
          should.not.exist(err);

          spawn.command.should.eql('java');
          spawn.args.should.eql(['-jar', launcherFile, '-nogui', '-db', '-port', config.usergrid.port]);
          spawn.options.should.have.property('cwd', tmpDir);
          spawn.options.should.have.property('detached', true);

          done();
        });
      });

      it('should detect startup error', function(done) {
        setTimeout(function() {
          fs.writeFileSync(config.usergrid.outLog, FAILED_START_DETECT + '\n');
        }, 50);
        usergrid.start({}, function(err, reply) {
          should.not.exist(err);
          reply.should.eql('unable to start\n');
          done();
        });
      });

      it('should do a timeout log check on start', function(done) {
        config.usergrid.startTimeout = 100;
        fs.writeFileSync(config.usergrid.outLog, START_DETECT);
        usergrid.start({}, function(err, reply) {
          should.not.exist(err);

          spawn.command.should.eql('java');
          spawn.args.should.eql(['-jar', launcherFile, '-nogui', '-db', '-port', config.usergrid.port]);
          spawn.options.should.have.property('cwd', tmpDir);
          spawn.options.should.have.property('detached', true);

          done();
        });
      });

      it('should reset on request', function(done) {
        fakeStartUsergrid();
        usergrid.start({ reset: true }, function(err, reply) {
          should.not.exist(err);

          spawn.command.should.eql('java');
          spawn.args.should.eql(['-jar', launcherFile, '-nogui', '-db', '-init', '-port', config.usergrid.port]);
          spawn.options.should.have.property('cwd', tmpDir);
          spawn.options.should.have.property('detached', true);

          done();
        });
      });
    });

    it('should skip if already running', function(done) {
      fs.writeFileSync(config.usergrid.pidFile, '1234');
      usergrid.start({}, function(err, reply) {
        should.not.exist(err);
        reply.should.equal('Usergrid is running.');
        done();
      });
    });
  });

  describe('download', function() {

    it('should download launcher if missing', function(done) {
      launcherFileExists = false;
      portalFileExists = true;
      usergrid.download({}, function(err, reply) {
        should.not.exist(err);
        checkDownloadReply(reply);
        done();
      })
    })
  });

  it('should download portal if missing', function(done) {
    launcherFileExists = true;
    portalFileExists = false;
    usergrid.download({}, function(err, reply) {
      should.not.exist(err);
      checkDownloadReply(reply);
      done();
    })
  });

  it('download launcher and portal if both are missing', function(done) {
    launcherFileExists = false;
    portalFileExists = false;
    usergrid.download({}, function(err, reply) {
      should.not.exist(err);
      checkDownloadReply(reply);
      done();
    })
  });

  it('should do nothing if launcher and portal are present', function(done) {
    launcherFileExists = true;
    portalFileExists = true;
    usergrid.download({}, function(err, reply) {
      should.not.exist(err);
      checkDownloadReply(reply);
      done();
    })
  });

  function checkDownloadReply(reply) {
    should(reply).exist;
    reply.should.be.an.Array;
    reply.length.should.eql(2);
    reply[0].should.eql(launcherFile);
    reply[1].should.eql(portalFile);
  }

  describe('portal', function(done) {

    it('should fail if usergrid not running', function(done) {
      portalFileExists = true;
      try{ fs.unlinkSync(config.usergrid.pidFile); } catch(err) {}
      usergrid.portal({}, function(err, reply) {
        should.not.exist(err);
        reply.should.equal("Usergrid doesn't appear to be running. Run with --start option or execute 'a127 usergrid start' first.")
        done();
      });
    });

    it('should fail if portal not downloaded', function(done) {
      portalFileExists = false;
      fs.writeFileSync(config.usergrid.pidFile, '1234');
      usergrid.portal({}, function(err, reply) {
        should.not.exist(err);
        reply.should.equal("Usergrid portal not present. Run with --download option or execute 'a127 usergrid download' first.")
        done();
      });
    });

    it('should start usergrid if requested', function(done) {
      portalFileExists = true;
      try{ fs.unlinkSync(config.usergrid.pidFile); } catch(err) {}
      fakeStartUsergrid();
      usergrid.portal({ start: true }, function(err, reply) {
        should.not.exist(err);
        should(didOpenBrowser).be.true;
        done();
      });
    });

    it('should start if usergrid running', function(done) {
      portalFileExists = true;
      fs.writeFileSync(config.usergrid.pidFile, '1234');
      usergrid.portal({ start: true }, function(err, reply) {
        should.not.exist(err);
        should(didOpenBrowser).be.true;
        done();
      });
    })
  });

  describe('stop', function() {

    it('should do nothing if no pid', function(done) {
      try{ fs.unlinkSync(config.usergrid.pidFile); } catch(err) {}
      usergrid.stop({}, function(err, reply) {
        should.not.exist(err);
        reply.should.eql("Usergrid isn't running (or process id is unknown).");
        done();
      });
    });

    it('should recognize when the process is gone', function(done) {
      processGone = true;
      fs.writeFileSync(config.usergrid.pidFile, '0');
      usergrid.stop({}, function(err, reply) {
        should.not.exist(err);
        reply.should.eql('stopped');
        fs.existsSync(config.usergrid.pidFile).should.be.false;
        done();
      });
    });


    it('should kill the running process', function(done) {
      processGone = false;
      this.timeout(6000);
      fs.writeFileSync(config.usergrid.pidFile, '0');
      usergrid.stop({}, function(err, reply) {
        should.not.exist(err);
        reply.should.eql('killed');
        fs.existsSync(config.usergrid.pidFile).should.be.false;
        done();
      });
    });
  });

});

function fakeStartUsergrid() {
  setTimeout(function() {
    fs.writeFileSync(config.usergrid.outLog, START_DETECT + '\n\n');
  }, 50);
}
