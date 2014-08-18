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

var config = require('../../../config');
var emit = require('../../util/feedback').emit;
var browser = require('../../util/browser');
var _ = require('lodash');
var util = require('util');
var path = require('path');
var express = require('express');

var SWAGGER_PROJECT_DIR = 'api/swagger';
var SWAGGER_FILE_NAME = 'swagger.json';

module.exports = {
  edit: edit
};

function edit(project, options, cb) {

  var projectSwaggerDir = path.resolve(project.dirname, SWAGGER_PROJECT_DIR);
  var app = express();

  app.use('/editor/spec',
    express.static(projectSwaggerDir, { index: SWAGGER_FILE_NAME })
  );

  app.put('/editor/spec', function(req, res) {
    var swaggerFile = path.resolve(projectSwaggerDir, SWAGGER_FILE_NAME);
    var stream = fs.createWriteStream(swaggerFile);
    var pipe = req.pipe(stream);

    pipe.on('end', function() {
      res.end('done');
    });
  });

  app.use('/editor', express.static(config.swaggerEditorDir));

  // start //

  var http = require('http');
  var server = http.createServer(app);
  server.listen(0, 'localhost', function() {
    var port = server.address().port;
    var editorUrl = util.format('http://localhost:%d/editor', port);
    emit('Swagger editor running: %s', editorUrl);
    browser.open(editorUrl);
  });
}
