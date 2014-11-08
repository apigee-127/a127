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
var project = proxyquire('../../../../../lib/commands/project/project.js', projectStubs);


describe('amazon', function() {

  describe('deployProject', function() {

    var tmpDir;

    var orginalAccountFile = config.account.file;
    before(function(done) {
      tmp.setGracefulCleanup();

      // set up account
      tmp.file(function(err, tmpFile) {
        should.not.exist(err);

        config.account.file = tmpFile;
        var sourceFile = path.join(__dirname, 'accounts.json');
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


    it('should create a zip file', function(done) {
      var name = 'create_zip';
      var projPath = path.resolve(tmpDir, name);
      process.chdir(tmpDir);

      project.create(name, {}, function(err) {
        should.not.exist(err);

        project.read(projPath, {}, function(err, proj) {
          should.not.exist(err);

          project.deploy(proj.deploymentsDir, {}, function(err, reply) {
            should.not.exist(err);

            var zipfile = path.resolve(proj.deploymentsDir, 'amazon.zip');
            fs.existsSync(zipfile).should.be.true;

            reply.should.eql('You may now upload this file to Elastic Beanstalk.');

            done();
          });
        });
      });
    });

  });
});

