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
var helpers = require('../../helpers');

describe('account', function() {

  var orginalAccountFile = config.account.file;

  before(function(done) {
    tmp.setGracefulCleanup();
    tmp.file(function(err, tmpFile) {
      should.not.exist(err);
      config.account.file = tmpFile;
      var sourceFile = path.join(__dirname, 'accounts.json');
      helpers.copyFile(sourceFile, tmpFile, done);
    });
  });

  after(function() {
    config.account.file = orginalAccountFile;
  });

  var accountStubs = {
    '../../util/cli' : {
      updateAnswers: function(fields, account, cb) {
        account.environment = 'tested';
        cb(account);
      }
    }
  };
  var account = proxyquire('../../../lib/commands/account/account', accountStubs);

  describe('lifecycle', function() {

    it('should list all accounts and indicate current', function(done) {
      account.list(null, function(err, names) {
        should.not.exist(err);
        names.should.containEql('apigee +');
        names.should.containEql('local');
        names.should.containEql('amazon');
        done();
      });
    });

    it('should create', function(done) {
      account.create('test', { provider: 'local' }, function(err, values) {
        should.not.exist(err);
        //values.should.have.property('provider', 'local');
        account.list(null, function(err, names) {
          should.not.exist(err);
          names.should.containEql('test +'); // should be created & selected
          done();
        });
      });
    });

    it('should delete', function(done) {
      account.delete('test', {}, function(err) {
        should.not.exist(err);
        account.list(null, function(err, names) {
          should.not.exist(err);
          names.should.not.containEql('test');
          names.should.not.containEql('test +');
          done();
        });
      });
    });

  });

  describe('select', function() {

    it('should select via name', function(done) {
      account.select('local', {}, function(err, result) {
        should.not.exist(err);
        result.should.containEql('local');
        account.list({}, function(err, names) {
          names.should.containEql('local +');
          done();
        });
      });
    });

    it('should select via options', function(done) {
      account.select(null, { account: 'apigee'}, function(err, result) {
        should.not.exist(err);
        result.should.containEql('apigee');
        account.list({}, function(err, names) {
          names.should.containEql('apigee +');
          done();
        });
      });
    });
  });

  describe('values', function() {

    describe('show', function() {

      it('should work with no selection', function(done) {
        account.show(null, {}, function(err, values) {
          should.not.exist(err);
          values.should.have.property('environment', 'test');
          values.should.have.property('organization', 'orgname');
          values.should.have.property('provider', 'apigee');
          done();
        });
      });

      it('work with name', function(done) {
        account.show('local', {}, function(err, values) {
          should.not.exist(err);
          values.should.have.property('provider', 'local');
          done();
        });
      });

      it('work with options', function(done) {
        account.show(null, { account: 'local' }, function(err, values) {
          should.not.exist(err);
          values.should.have.property('provider', 'local');
          done();
        });
      });
    });

    describe('should update', function() {

      it('should prompt for new values', function(done) {
        account.update('apigee', {}, function(err, values) {
          values.should.have.property('environment', 'tested');
          done();
        });
      });
    });

    describe('setValue', function() {

      it('should set a single value', function(done) {
        account.setValue('key1', 'value1', {}, function(err, values) {
          should.not.exist(err);
          values.should.have.property('key1', 'value1');
          account.show(null, {}, function(err, values) {
            values.should.have.property('key1', 'value1');
            done();
          })
        })
      });

      it('should not set provider', function(done) {
        account.setValue('provider', 'value1', {}, function(err, values) {
          should.exist(err);
          err.message.should.equal('Provider is immutable');
          done();
        })
      });
    });

    describe('deleteValue', function() {
      it('should delete a user-defined value', function(done) {
        account.deleteValue('key1', {}, function(err, values) {
          should.not.exist(err);
          values.should.not.have.property('key1', 'value1');
          account.show(null, {}, function(err, values) {
            values.should.not.have.property('key1', 'value1');
            done();
          })
        })
      });

      it('should not delete a required value', function(done) {
        account.deleteValue('provider', {}, function(err, values) {
          should.exist(err);
          err.message.should.equal('Provider is immutable');
          done();
        })
      });

    });
  });

  describe('providers', function() {
    it('should list providers', function(done) {
      account.providers({}, function(err, providerNames) {
        should.not.exist(err);
        providerNames.should.containEql('apigee');
        providerNames.should.containEql('local');
        providerNames.should.containEql('amazon');
        done();
      });
    });
  });

  describe('deployments', function() {

    var project;

    before(function(done) {
      tmp.dir({ unsafeCleanup: true }, function(err, path) {
        should.not.exist(err);
        project = {
          main: 'app.js',
          configdir: path,
          api: {
            name: 'name',
            basePath: '/'
          },
          dirname: path
        };
        done();
      });
    });

    it("should error for when provider doesn't support list", function(done) {
      account.deployments('local', {}, function(err, deployments) {
        should.exist(err);
        err.message.should.equal('Cannot list deployments on local accounts');
        done();
      });
    });

    it('should not be able to deploy when not supported', function(done) {
      var options = { account: 'local' };
      account.deployProject(project, options, function(err) {
        should.exist(err);
        err.message.should.equal('Command is not valid for local account');
        done();
      });
    });

    it('should not be able to undeploy when not supported', function(done) {
      var options = { account: 'local' };
      account.undeployProject(project, options, function(err) {
        should.exist(err);
        err.message.should.equal('Not valid for local account');
        done();
      });
    });

//    it('should list deployments when provider supported');
  });

//  describe('internal apis', function() {
//    it('should write deployment files');
//    it('should remove deployment files');
//  });

});
