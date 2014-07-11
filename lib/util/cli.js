'use strict';

var _ = require('lodash');
var inquirer = require('inquirer');
var feedback = require('./feedback');
var config = require('../../config')

module.exports = {
  requireAnswers: requireAnswers,
  updateAnswers: updateAnswers,
  printAndExit: printAndExit,
  chooseOne: chooseOne,
  validate: validate,
  execute: execute,
  confirm: confirm
}

// questions are array of objects like these:
// { name: 'key', message: 'Your prompt?' }
// { name: 'key', message: 'Your prompt?', type: 'password' }
// { name: 'key', message: 'Your prompt?', type: 'list', choices: ['1', '2'] }
// results is an (optional) object containing existing results like this: { key: value }
function requireAnswers(questions, results, cb) {
  if (!cb) { cb = results; results = {}; }
  var unanswered = getUnanswered(questions, results);
  if (unanswered.length === 0) {
    return cb(results);
  }
  inquirer.prompt(unanswered, function(answers) {
    _.extend(results, answers);
    requireAnswers(questions, results, cb);
  });
}

function updateAnswers(questions, results, cb) {
  if (!cb) { cb = results; results = {}; }
  for (var i = 0; i < questions.length; i++) {
    var question = questions[i];
    if (question.type !== 'password') {
      question.default = results[question.name];
    }
  }
  inquirer.prompt(questions, function(answers) {
    _.extend(results, answers);
    requireAnswers(questions, results, cb);
  });
}

function getUnanswered(questions, results) {
  var unanswered = []
  for (var i = 0; i < questions.length; i++) {
    var question = questions[i];
    if (!results[question.name]) {
      unanswered.push(question);
    }
  }
  return unanswered;
}

function printAndExit(err, output, code) {
  if (err) {
    console.log(config.debug ? err.stack : err);
    code = code || 1;
  } else if (output !== null && output !== undefined) {
    print(output);
  }
  process.exit(code || 0);
}

function print(object, indent) {
  if (object !== null && object !== undefined) {
    if (_.isArray(object)) {
      for (var i = 0; i < object.length; i++) {
        if (!_.isObject(value)) {
          print(object[i]);
          if (i < object.length - 1) { console.log('--'); }
        } else {
          console.log(object);
        }
      }
    } else if (_.isObject(object)) {
      for (var k in object) {
        var value = object[k];
        if (!_.isObject(value)) {
          console.log(k + ': ' + value);
        } else {
          console.log(k + ':');
          print(value);
        }
      }
    } else {
      console.log(object);
    }
  } else {
    console.log();
  }
}

// prompt: 'Your prompt?', choices: ['1', '2'] }
// result passed to cb() is the choice selected
function chooseOne(prompt, choices, cb) {
  var questions = { name: 'x', message: prompt, type: 'list', choices: choices };
  inquirer.prompt(questions, function(answers) {
    cb(answers.x);
  });
}

// prompt: 'Your prompt?', choices: ['1', '2'] }
// defaultBool is optional (default == true)
// result passed to cb() is the choice selected
function confirm(prompt, defaultBool, cb) {
  if (!cb) { cb = defaultBool; defaultBool = true; }
  var questions = { name: 'x', message: prompt, type: 'confirm', default: defaultBool};
  inquirer.prompt(questions, function(answers) {
    cb(answers.x);
  });
}

function validate(app) {
  var commands = app.commands.map(function(command) { return command._name; });
  if (!_.contains(commands, app.rawArgs[2])) {
    if (app.rawArgs[2]) {
      console.log();
      console.log('error: invalid command: ' + app.rawArgs[2]);
    }
    app.help();
  }
}

function execute(command, header) {
  var cb = function(err, reply) {
    if (header && !err) {
      print();
      print(header);
      print(Array(header.length + 1).join("="));
    }
    if (!reply && !err) { reply = 'done'; }
    printAndExit(err, reply);
  };
  return function() {
    try {
      var args = Array.prototype.slice.call(arguments);
      args.push(cb);
      if (!command) {
        return cb(new Error('missing command method'));
      }
      if (args.length !== command.length) {
        return cb(new Error('incorrect arguments'));
      }
      var reply = command.apply(this, args);
      if (reply) {
        cb(null, reply);
      }
    } catch (err) {
      cb(err);
    }
  }
}

if (typeof String.prototype.endsWith !== 'function') {
  String.prototype.endsWith = function(suffix) {
    return this.indexOf(suffix, this.length - suffix.length) !== -1;
  };
}

feedback.on(function(feedback) {
  if (feedback.endsWith('\\')) {
    process.stdout.write(feedback.substr(0, feedback.length - 1));
  } else {
    console.log(feedback);
  }
});
