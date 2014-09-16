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

var fs = require('fs');
var config = require('../../../../config/index');
var emit = require('../../../util/feedback').emit;
var JSZip = require('jszip');
var util = require('util');
var path = require('path');

var NAME = 'amazon';
var SIGNUP_URI = 'https://aws.amazon.com';

var FIELDS = [
];

module.exports = {
  name: NAME,
  signupUri: SIGNUP_URI,
  fields: FIELDS,
  deployProject: deployProject
};

function deployProject(account, project, options, cb) {
  emit('Creating zip of project for upload...');
  var fqfile = path.resolve(project.deploymentsDir, account.name + '.zip');
  writeZip(project.dirname, fqfile, function(err) {
    if (err) { return cb(err); }
    emit('Created deployment file: ' + fqfile);
    cb(null, 'You may now upload this file to Elastic Beanstalk.');
  });
}


// Utility

// Amazon requires zip to be the contents of the top-level folder
function writeZip(srcDirectory, zipFile, cb) {

  var zip = new JSZip();

  var files = getFiles(srcDirectory);

  for (var i = 0; i < files.length; i++) {
    var name = files[i].slice(srcDirectory.length + 1);
    zip.file(name, fs.readFileSync(files[i]));
  }

  var buffer = zip.generate({ type:'nodebuffer' });

  fs.writeFile(zipFile, buffer, cb);
}

// returns all files in a directory
// except: node_modules dir, dirs starting with '.', .DS_Store files,
function getFiles(dir, files) {
  files = files || [];
  var dirFiles = fs.readdirSync(dir);
  for (var i = 0; i < dirFiles.length; i++) {

    var name = dir + '/' + dirFiles[i];
    if (fs.statSync(name).isDirectory()) {
      if (dirFiles[i] === 'node_modules') { continue; }
      if (dirFiles[i][0] === '.') { continue; }

      getFiles(name, files);
    } else {
      if (dirFiles[i] === '.DS_Store') { continue; }
      files.push(name);
    }
  }
  return files;
}
