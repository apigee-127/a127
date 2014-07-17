'use strict';

/*
file schema:
  selected: 'name',
  accounts: {
    name: {
      provider: 'apigee', // the following fields are dependant on provider...
      environment: 'test',
      organization: '',
      username: '',
      password: ''
    }
  }
 */

var config = require('../../../config');
var fs = require('fs');
var _ = require('lodash');
var path = require('path');
var cli = require('../../util/cli');
var browser = require('../../util/browser');
var async = require('async');
var emit = require('../../util/feedback').emit;

module.exports = {
  list: list,
  create: create,
  delete: del,
  select: select,
  show: show,
  update: update,
  providers: listProviders,
  deployments: listDeployments,
  deployVolosProxy: deployVolosProxy,
  deployProject: deployProject
}

function list(options, cb) {
  var accountsData = readFile();
  cb(null, Object.keys(accountsData.accounts));
}

function select(name, options, cb) {
  var accountsData = readFile();
  name = name || options.account;
  var account = accountsData.accounts[name];
  var select = function(name) {
    accountsData.selected = name;
    writeFile(accountsData);
    cb(null, accountsData.accounts[name]);
  }
  if (account) {
    select(name);
  } else {
    cli.chooseOne('Account?', Object.keys(accountsData.accounts), function(a) {
      select(a);
    });
  }
}

function listProviders(options, cb) {
  cb(null, _.keys(getProviders()));
}

function show(name, options, cb) {
  var accountsData = readFile(options);
  name = name || options.account || accountsData.selected;
  cb(null, accountsData.accounts[name]);
}

function create(name, options, cb) {
  var accountsData = readFile(options);
  if (accountsData.accounts[name]) {
    cb(new Error('account "' + name + '" already exists'));
  }
  var providers = getProviders();

  async.waterfall([
    function(cb) {
      if (options.provider) {
        var p = providers[options.provider];
        if (!p) { var err = new Error('unknown provider: ' + options.provider); }
        cb(err, p);
      } else {
        cli.chooseOne('Provider?', Object.keys(providers), function(name) {
          cb(null, providers[name]);
        });
      }
    },
    function(provider, cb) {
      if (provider.signupUri) {
        cli.confirm('Do you have an account?', function(yes) {
          if (!yes) {
            emit('Opening browser to provider signup link: ' + provider.signupUri);
            browser.open(provider.signupUri, function(err) {
              cb(err, provider);
            });
          } else {
            cb(null, provider);
          }
        });
      } else {
        cb(null, provider);
      }
    },
    function(provider, cb) {
      var fields = provider.fields;

      cli.requireAnswers(fields, function(results) {
        results.provider = provider.name;
        writeAccount(name, results, accountsData);
        cb(null, results);
      });
    }
  ], cb)
}

function update(name, options, cb) {
  var accountsData = readFile(options);
  name = name || options.account || accountsData.selected;
  var account = accountsData.accounts[name];
  if (!account) { cb(new Error('No account named: ' + name)); }

  var provider = getProvider(account.provider);
  var fields = provider.fields;

  cli.updateAnswers(fields, account, function(account) {
    writeAccount(name, account, accountsData);
    cb(null, account);
  });
}

function del(name, options, cb) {
  var accountsData = readFile(options);
  if (accountsData.accounts[name]) {
    delete accountsData.accounts[name];
    if (name === accountsData.selected) { delete accountsData.selected; }
    writeFile(accountsData);
  }
  cb();
}

function getSelected(options, name) {
  var accountsData = readFile(options);
  var accountName = name || options.account || accountsData.selected;
  var account = accountsData.accounts[accountName];
  if (!account) { throw new Error('Unknown account: ' + accountName); }
  return account;
}

function listDeployments(name, options, cb) {
  var account = getSelected(options, name);
  getProvider(account.provider).listDeployments(account, options, cb);
}

// todo: test and make this happen by magic. (how to handle provider-specific extensions?)
function deployVolosProxy(name, options, cb) {
  var account = getSelected(options, name);
  if (account.provider !== 'apigee') {
    return cb(new Error('Current account must be for Apigee provider'));
  }
  getProvider(account.provider).deployVolosProxy(account, options, cb);
}

// project: { api, main, basePath, directory }
function deployProject(project, options, cb) {
  var account = getSelected(options);
  getProvider(account.provider).deployProject(account, project, options, cb);
}

// utility

var providers;

function getProvider(name) {
  return getProviders()[name];
}

// returns name -> provider
function getProviders() {
  if (!providers) {
    var providerDir = path.resolve(__dirname, 'providers');
    var files = readdirSyncFilesOnly(providerDir);
    providers = {};
    for (var i = 0; i < files.length; i++) {
      var file = files[i];
      try {
        var module = require('./providers/' + file);
        if (module.name) {
          providers[module.name] = module;
        }
      } catch (err) {
        if (config.debug) { console.log(err); }
      }
    }
  }
  return providers;
}

function readFile() {
  try {
    var string = fs.readFileSync(config.account.file, { encoding: 'utf8' });
    return JSON.parse(string);
  } catch (err) {
    return { accounts: {}};
  }
}

// accountsData is optional
function writeAccount(name, account, accountsData) {
  if (!accountsData) { accountsData = readFile(options); }
  accountsData.accounts[name] = account;
  if (!accountsData.selected) {
    accountsData.selected = name;
  }
  writeFile(accountsData);
}

function writeFile(accountsData) {
  var stringified = JSON.stringify(accountsData);
  fs.writeFileSync(config.account.file, stringified);
}

function readdirSyncFilesOnly(p) {
  var allFiles = fs.readdirSync(p);
  var files = [];
  for (var f in allFiles) {
    var fn = path.join(p, allFiles[f]);
    var s = fs.statSync(fn);
    if (s.isFile()) {
      files.push(allFiles[f]);
    }
  }
  return files;
};
