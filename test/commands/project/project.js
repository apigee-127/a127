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
var config = require('../../../config');
var path = require('path');
var proxyquire =  require('proxyquire');
var tmp = require('tmp');
var fs = require('fs');
var yaml = require('js-yaml');
var helpers = require('../../helpers');
var _ = require('lodash');

/*
 create: create,
 start: start,
 verify: verify,
 edit: edit,
 open: open,
 docs: docs,
 deploy: deploy,
 undeploy: undeploy,
 showConfig: showConfig
 */

describe('project', function() {

  var tmpDir;
  var spawn = {};

  var orginalAccountFile = config.account.file;
  before(function(done) {
    tmp.setGracefulCleanup();

    // set up account
    tmp.file(function(err, tmpFile) {
      should.not.exist(err);
      config.account.file = tmpFile;
      var sourceFile = path.join(__dirname, '..', 'account', 'accounts.json');
      helpers.copyFile(sourceFile, tmpFile, function(err) {
        should.not.exist(err);

        // set up project dir
        tmp.dir({ unsafeCleanup: true }, function(err, path) {
          should.not.exist(err);
          tmpDir = path;
          process.chdir(tmpDir);
          done();
        });
      });
    });
  });

  after(function() {
    config.account.file = orginalAccountFile;
  });

  var capture;
  beforeEach(function() {
    capture = helpers.captureOutput();
  });

  afterEach(function() {
    capture.release();
  });

  var didEdit, didOpen, didDeploy, didUndeploy;
  var nodemonOpts = {};
  var projectStubs = {
    'child_process': {
      spawn: function(command, args, options) {
        spawn.command = command;
        spawn.args = args;
        spawn.options = options;

        var ret = {};
        ret.stdout = {
          on: function() {}
        };
        ret.stderr = {
          on: function() {}
        };
        ret.on = function(name, cb) {
          if (name === 'close') {
            setTimeout(function() { cb(0); }, 0);
          }
          return ret;
        };
        return ret;
      }
    },
    'nodemon': {
      on: function(name, cb) {
        if (name === 'start') {
          setTimeout(function() { cb(); nodemonOpts.cb(); }, 0);
        }
        return this;
      },
      _init: function(opts, cb) {
        nodemonOpts = opts;
        nodemonOpts.cb = cb;
      },
      '@noCallThru': true
    },
    '../service/swagger_editor': {
      edit: function(directory, options, cb) {
        didEdit = true;
        cb();
      }
    },
    '../../util/browser': {
      open: function(url, cb) {
        didOpen = true;
        cb();
      }
    },
    '../../util/net': {
      isPortOpen: function(port, cb) {
        cb(null, true);
      }
    },
    '../account/account': {
      deployProject: function(project, options, cb) {
        didDeploy = true;
        cb();
      },
      undeployProject: function(project, options, cb) {
        didUndeploy = true;
        cb();
      }
    }
  };
  var project = proxyquire('../../../lib/commands/project/project', projectStubs);

  describe('create', function() {

    it('should err if project directory already exists', function(done) {
      var name = 'create_err';
      var projPath = path.resolve(tmpDir, name);
      fs.mkdirSync(projPath);
      process.chdir(tmpDir);
      project.create(name, {}, function(err) {
        should.exist(err);
        done();
      });
    });

    it('should create a new project', function(done) {
      var name = 'create';
      var projPath = path.resolve(tmpDir, name);
      process.chdir(tmpDir);
      project.create(name, {}, function(err) {
        should.not.exist(err);
        // check a couple of files
        var packageJson = path.resolve(projPath, 'package.json');
        fs.existsSync(packageJson).should.be.ok;
        fs.existsSync(path.resolve(projPath, 'node_modules')).should.not.be.ok;
        fs.existsSync(path.resolve(projPath, '.gitignore')).should.be.ok;

        // check spawn `npm install`
        spawn.command.should.equal('npm');
        spawn.args.should.containEql('install');
        spawn.options.should.have.property('cwd', fs.realpathSync(projPath));

        // check package.json customization
        fs.readFile(packageJson, { encoding: 'utf8' }, function(err, string) {
          if (err) { return cb(err); }
          var project = JSON.parse(string);
          project.api.name.should.equal(name);
          done();
        });
      });
    });
  });

  describe('start', function() {

    var name = 'start';
    var projPath;

    before(function(done) {
      projPath = path.resolve(tmpDir, name);
      process.chdir(tmpDir);
      project.create(name, {}, done);
    });

    it('should pass debug options', function(done) {
      var options = { debug: 'true,test' };
      project.start(projPath, options, function(err) {
        should.not.exist(err);
        nodemonOpts.nodeArgs.should.containEql('--debug=' + options.debug);
        done();
      });
    });

    it('should start in debug break mode', function(done) {
      var options = { debugBrk: true };
      project.start(projPath, options, function(err) {
        should.not.exist(err);
        nodemonOpts.nodeArgs.should.containEql('--debug-brk');
        done();
      });
    });

    describe('write config', function() {

      var options = {
        mock: true,
        debug: 'true,test',
        account: 'apigee'
      };

      it('should write files', function(done) {

        project.start(projPath, options, function(err) {
          should.not.exist(err);

          var envFile = path.join(projPath, 'config', '.a127_env');
          var env = fs.readFileSync(envFile, { encoding: 'utf8' });
          env.should.equal(options.account);

          var secretsFile = path.join(projPath, 'config', '.a127_secrets');
          var secrets = yaml.safeLoad(fs.readFileSync(secretsFile, { encoding: 'utf8' }));

          secrets['_a127_start_config'].debug.should.equal(options.debug);
          secrets['_a127_start_config'].mock.should.equal(options.mock);

          secrets['name'].should.equal(options.account);

          done();
        });
      });

      it('should work with no account', function(done) {

        var oldAcct = config.account.file;
        config.account.file = undefined;
        project.start(projPath, _.omit(options, 'account'), function(err) {
          config.account.file = oldAcct;
          should.not.exist(err);

          var envFile = path.join(projPath, 'config', '.a127_env');
          var env = fs.readFileSync(envFile, { encoding: 'utf8' });
          env.should.eql('');

          var secretsFile = path.join(projPath, 'config', '.a127_secrets');
          var secrets = yaml.safeLoad(fs.readFileSync(secretsFile, { encoding: 'utf8' }));

          secrets['_a127_start_config'].debug.should.equal(options.debug);
          secrets['_a127_start_config'].mock.should.equal(options.mock);

          should.not.exist(secrets['name']);

          done();
        });
      });

      describe('includePasswordInSecrets', function() {

        it('should not include password if not specified', function(done) {
          project.start(projPath, options, function(err) {
            should.not.exist(err);

            var secretsFile = path.join(projPath, 'config', '.a127_secrets');
            var secrets = yaml.safeLoad(fs.readFileSync(secretsFile, { encoding: 'utf8' }));
            should.not.exist(secrets['password']);

            done();
          });
        });

        it('should include password if specified default.yaml', function(done) {
          var configFile = path.join(projPath, 'config', 'default.yaml');
          var config = {
            includePasswordInSecrets: true
          };
          fs.writeFileSync(configFile, yaml.safeDump(config, { skipInvalid: true }));

          project.start(projPath, options, function(err) {
            should.not.exist(err);

            var secretsFile = path.join(projPath, 'config', '.a127_secrets');
            var secrets = yaml.safeLoad(fs.readFileSync(secretsFile, { encoding: 'utf8' }));
            should.exist(secrets['password']);

            done();
          });
        });

        it('should include password if specified apigee.yaml', function(done) {
          var configFile = path.join(projPath, 'config', 'apigee.yaml');
          var config = {
            includePasswordInSecrets: true
          };
          fs.writeFileSync(configFile, yaml.safeDump(config, { skipInvalid: true }));

          project.start(projPath, options, function(err) {
            should.not.exist(err);

            var secretsFile = path.join(projPath, 'config', '.a127_secrets');
            var secrets = yaml.safeLoad(fs.readFileSync(secretsFile, { encoding: 'utf8' }));
            should.exist(secrets['password']);

            done();
          });
        });
      });

      describe('with print option', function() {

        it('should emit config', function(done) {

          var options = {
            account: 'local',
            print: true
          };
          project.start(projPath, options, function(err) {
            should.not.exist(err);

            var secretsFile = path.join(projPath, 'config', '.a127_secrets');
            var content = fs.readFileSync(secretsFile, { encoding: 'utf8' });
            var secrets = yaml.safeLoad(content);
            capture.output().should.containEql(yaml.safeDump(secrets, { skipInvalid: true }));
            done();
          })
        })

      });
    });
  });

  describe('show config', function() {

    var name = 'showConfig';
    var projPath;

    before(function(done) {
      projPath = path.resolve(tmpDir, name);
      process.chdir(tmpDir);
      project.create(name, {}, done);    });

    it('should emit config', function(done) {

      var options = {
        account: 'local',
        print: true
      };
      project.showConfig(projPath, options, function(err) {
        should.not.exist(err);

        var basicStuff = {
          provider: 'local',
          name: 'local'
        };
        capture.output().should.containEql(yaml.safeDump(basicStuff, { skipInvalid: true }));

        done();
      })
    });

    it('should work with no account', function(done) {

      var oldAcct = config.account.file;
      config.account.file = undefined;
      var options = {
        account: null,
        print: true
      };
      project.showConfig(projPath, options, function(err) {
        config.account.file = oldAcct;
        should.not.exist(err);

        var basicStuff = {};
        capture.output().should.containEql(yaml.safeDump(basicStuff, { skipInvalid: true }));

        done();
      })
    })
  });

  describe('verify', function() {

    describe('no errors', function() {

      var name = 'verifyGood';
      var projPath;

      before(function(done) {
        projPath = path.resolve(tmpDir, name);
        process.chdir(tmpDir);
        project.create(name, {}, done);
      });

      it('should emit nothing, return summary', function(done) {

        project.verify(projPath, {}, function(err, reply) {
          should.not.exist(err);

          capture.output().should.equal('');
          reply.should.equal('Results: 0 errors, 0 warnings');
          done();
        })
      });

      it('w/ json option should emit nothing, return nothing', function(done) {

        project.verify(projPath, { json: true }, function(err, reply) {
          should.not.exist(err);

          capture.output().should.equal('');
          reply.should.equal('');
          done();
        })
      })
    });


    describe('with errors', function() {

      var name = 'verifyBad';
      var projPath;

      before(function(done) {
        projPath = path.resolve(tmpDir, name);
        process.chdir(tmpDir);
        project.create(name, {}, function() {
          var sourceFile = path.join(__dirname, 'badswagger.yaml');
          var destFile = path.join(projPath, 'api', 'swagger', 'swagger.yaml');
          helpers.copyFile(sourceFile, destFile, done);
        });
      });

      it('should emit errors, return summary', function(done) {

        project.verify(projPath, {}, function(err, reply) {
          should.not.exist(err);

          capture.output().should.containEql('\nProject Errors\n--------------\n#/swagger:');
          reply.should.containEql('Results:');
          done();
        })
      });

      it('json option should emit as json', function(done) {

        project.verify(projPath, { json: true }, function(err, reply) {
          should.not.exist(err);

          var json = JSON.parse(reply);
          json.should.have.keys('errors', 'warnings')
          json.errors.should.be.an.Array;
          var error = json.errors[0];
          error.should.have.property('code', 'INVALID_TYPE');
          error.should.have.property('message');
          error.should.have.property('path', [ 'swagger' ]);
          error.should.have.property('description', 'The Swagger version of this document.');
          done();
        })
      })
    });
  });

  describe('basic functions', function() {

    var name = 'basic';
    var projPath;

    before(function(done) {
      projPath = path.resolve(tmpDir, name);
      process.chdir(tmpDir);
      project.create(name, {}, done);
    });

    it('edit should exec editor', function(done) {
      project.edit(projPath, {}, function(err) {
        should.not.exist(err);
        should(didEdit).true;
        done();
      });
    });

     it('edit should exec editor with --silent flag', function(done) {
      project.edit(projPath, {silent: true}, function(err) {
        should.not.exist(err);
        should(didEdit).true;
        done();
      });
    });

    it('open should exec browser', function(done) {
      project.open(projPath, {}, function(err) {
        should.not.exist(err);
        should(didOpen).true;
        done();
      });
    });

    it('deploy should call account deploy', function(done) {
      project.deploy(projPath, {}, function(err) {
        should.not.exist(err);
        should(didDeploy).true;
        done();
      });
    });

    it('undeploy should call account undeploy', function(done) {
      project.undeploy(projPath, {}, function(err) {
        should.not.exist(err);
        should(didUndeploy).true;
        done();
      });
    });
  });

});
