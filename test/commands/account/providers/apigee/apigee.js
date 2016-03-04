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
var config = require('../../../../../config/index');
var path = require('path');
var proxyquire =  require('proxyquire');
var tmp = require('tmp');
var fs = require('fs');
var helpers = require('../../../../helpers');
var account_cmd = require('../../../../../lib/commands/account/account');

var apigeetoolOpts, createAppOpts;
var apigeeStubs = {
  apigeetool: {
    deployNodeApp: function(opts, cb) {
      apigeetoolOpts = opts;
      cb();
    },
    undeploy: function(opts, cb) {
      apigeetoolOpts = opts;
      cb();
    },
    listDeployments: function(opts, cb) {
      apigeetoolOpts = opts;
      var deployments = [{
          name: 'apigee-remote-proxy',
          state: 'deployed',
          uris: [ 'url_1' ]
      }];
      cb(null, { deployments: deployments });
    },
    deployRemoteProxy: function(opts, cb) {
      apigeetoolOpts = opts;
      cb();
    },
    getLogs: function(opts, cb) {
      apigeetoolOpts = opts;
      cb();
    }
  },
  'volos-management-apigee': {
    create: function() {
      return {
        getDeveloperApp: function(email, name, cb) {
          cb();
        },
        createDeveloper: function(devRequest, cb) {
          cb(null, { id: 0 });
        },
        createApp: function(appRequest, cb) {
          createAppOpts = appRequest;
          var reply = {
            credentials: [{ key: 0 }]
          };
          cb(null, reply);
        }
      }
    }
  },
  'apigee-remote-proxy': {
    deployRemoteProxy: function(opts, cb) {
      cb(null, { uris: [] });
    }
  }
};
var apigee = proxyquire('../../../../../lib/commands/account/providers/apigee.js', apigeeStubs);

var projectStubs = {
  child_process: {
    spawn: function(command, args, options) {
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
  }
};
var project_cmd = proxyquire('../../../../../lib/commands/project/project.js', projectStubs);

describe('apigee', function() {

  var account;

  before(function(done) {
    tmp.setGracefulCleanup();

    // set up account
    tmp.file(function(err, tmpFile) {
      should.not.exist(err);

      config.account.file = tmpFile;
      var sourceFile = path.join(__dirname, 'accounts.json');
      helpers.copyFile(sourceFile, tmpFile, function(err) {
        should.not.exist(err);

        account = account_cmd.getSelected();
        done();
      });
    });
  });

  beforeEach(function() {
    apigeetoolOpts = null;
    createAppOpts = null;
  });

  describe('project', function() {

    var tmpDir, project;

    var orginalAccountFile = config.account.file;
    before(function(done) {

      // set up project dir
      tmp.dir({ unsafeCleanup: true }, function(err, dir) {
        should.not.exist(err);
        tmpDir = dir;
        process.chdir(tmpDir);

        // create project
        var name = 'apigee_deploy';
        var projPath = path.resolve(tmpDir, name);
        process.chdir(tmpDir);

        project_cmd.create(name, {}, function(err) {
          should.not.exist(err);

          project_cmd.read(projPath, {}, function(err, reply) {
            should.not.exist(err);
            project = reply;

            done();
          });
        });
      });
    });

    after(function() {
      config.account.file = orginalAccountFile;
    });

    it('deploy should call apigeetool', function(done) {

      var options = {};

      apigee.deployProject(account, project, options, function(err, reply) {
        should.not.exist(err);

        should.exist(apigeetoolOpts);

        var expected = {
          baseuri: account.baseuri,
          organization: account.organization,
          environments: account.environment,
          username: account.username,
          password: account.password,
          debug: config.debug,
          verbose: config.debug,
          api: project.api.name,
          main: project.api.main,
          directory: project.dirname,
          'base-path': project.api.basePath,
          'import-only': !!options.importOnly,
          'resolve-modules': !options.upload,
          virtualhosts: account.virtualhosts
        };

        apigeetoolOpts.should.eql(expected);

        done();
      });
    });

    it('undeploy should call apigeetool', function(done) {

      apigee.undeployProject(account, project, {}, function(err, reply) {
        should.not.exist(err);

        should.exist(apigeetoolOpts);

        var expected = {
          baseuri: account.baseuri,
          organization: account.organization,
          environment: account.environment,
          username: account.username,
          password: account.password,
          debug: config.debug,
          verbose: config.debug,
          api: project.api.name
        };

        apigeetoolOpts.should.eql(expected);

        done();
      });
    });
  });

  it('listDeployments should call apigeetool', function(done) {

    var options = { long: true };
    apigee.listDeployments(account, options, function(err, reply) {
      should.not.exist(err);

      should.exist(apigeetoolOpts);

      var expected = {
        baseuri: account.baseuri,
        organization: account.organization,
        environment: account.environment,
        username: account.username,
        password: account.password,
        debug: config.debug,
        verbose: config.debug,
        long: options.long
      };

      apigeetoolOpts.should.eql(expected);

      done();
    })
  });

  it('should create remote proxy service', function(done) {

    var options = { long: true };
    apigee.createService('name', account, 'RemoteProxy', options, function(err) {
      should.not.exist(err);

      should.exist(createAppOpts);
      createAppOpts.should.have.property('environments');
      createAppOpts.environments.should.eql([account.environment]);

      should.exist(apigeetoolOpts);

      var expected = {
        baseuri: account.baseuri,
        organization: account.organization,
        environment: account.environment,
        username: account.username,
        password: account.password,
        debug: config.debug,
        verbose: config.debug,
        long: options.long
      };

      apigeetoolOpts.should.eql(expected);

      done();
    })
  });

  it('should retrieve logs', function(done) {

    var project = { name: 'myname' };
    apigee.logs(account, project, {}, function(err, reply) {
      should.not.exist(err);

      should.exist(apigeetoolOpts);

      var expected = {
        baseuri: account.baseuri,
        organization: account.organization,
        environment: account.environment,
        username: account.username,
        password: account.password,
        debug: config.debug,
        verbose: config.debug,
        api: project.name
      };

      apigeetoolOpts.should.eql(expected);

      done();
    })
  })
});
