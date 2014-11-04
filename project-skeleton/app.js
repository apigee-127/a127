'use strict';

var a127 = require('a127-magic');
var express = require('express');
var app = express();

// uncomment the following if you need to parse incoming form data
//app.use(express.bodyParser());

app.use(a127.middleware());

app.listen(process.env.PORT || 10010);

console.log('try this:\ncurl http://localhost:10010/hello?name=Scott');
