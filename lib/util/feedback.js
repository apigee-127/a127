'use strict';

var EventEmitter = require('events').EventEmitter;
var feedback = new EventEmitter();
var CHANNEL = 'feedback';
var util = require('util');

module.exports = {

  on: function(cb) {
    feedback.on(CHANNEL, function(feedback) {
      cb(feedback);
    });
  },

  emit: function(string) {
    if (arguments.length > 1) {
      string = util.format.apply(this, arguments);
    }
    feedback.emit(CHANNEL, string);
  }
}
