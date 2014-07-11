'use strict';

var EventEmitter = require('events').EventEmitter;
var feedback = new EventEmitter();
var CHANNEL = 'feedback';

module.exports = {

  on: function(cb) {
    feedback.on(CHANNEL, function(feedback) {
      cb(feedback);
    });
  },

  emit: function(string) {
    feedback.emit(CHANNEL, string);
  }

}