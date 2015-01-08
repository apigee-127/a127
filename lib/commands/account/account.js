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
var yaml = require('yamljs');
var debug = require('debug')('true');
var util = require('util');

module.exports = {
  list: list,
  create: create,
  delete: del,
  select: select,
  show: show,
  update: update,
  providers: listProviders,
  deployments: listDeployments,
  deployProject: deployProject,
  undeployProject: undeployProject,
  setValue: setValue,
  deleteValue: deleteValue,
  logs: logs,

  // for internal use
  writeDeploymentFiles: writeDeploymentFiles,
  removeDeploymentFiles: removeDeploymentFiles,
  getSelected: getSelected
};

function list(options, cb) {
  var accountsData = readAccountFile();
  var names = Object.keys(accountsData.accounts);
  names = _.map(names, function(name) {
    return (name !== accountsData.selected) ? name : name + ' +'
  });
  cb(null, names);
}

function select(name, options, cb) {
  chooseAccount(name, options, function(err, accountName, accountsData) {
    if (err) { return cb(err); }
    accountsData.selected = accountName;
    writeAccountFile(accountsData);
    cb(null, util.format('Selected account: %s', accountName));
  });
}

function listProviders(options, cb) {
  cb(null, _.keys(getProviders()));
}

function show(name, options, cb) {
  cb(null, getSelected(options, name));
}

function create(name, options, cb) {
  var accountsData = readAccountFile(options);
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
      if (provider.signupUri && !options.username) {
        cli.confirm('Do you have an account?', function(yes) {
          if (!yes) {
            emit('Opening browser to provider signup link: %s', provider.signupUri);
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
      var results = {};
      provider.fields.forEach(function(field) {
        results[field.name] = options[field.name]
      });

      cli.requireAnswers(provider.fields, results, function(results) {
        results.provider = provider.name;
        cb(null, results);
      });
    },
    function(account, cb) { // post-create - create proxy if apigee and is necessary - todo: move to provider
      if (account.provider !== 'apigee') { return cb(null, account); }
      emit('Ensuring Apigee Remote Proxy is in place...');
      var done = function(err) {
        if (err) { return cb(err); }
        emit('Apigee Remote Proxy verified.');
        cb(null, account);
      };
      var provider = providers[account.provider];
      provider.deployRemoteProxy(account, options, function(err) {
        if (err) {
          // super ugly... apigeetool only returns statusCode in the message
          // todo: so much hackiness follows... fix it
          var split = err.message.split(' ');
          var statusCode = split[split.length - 1];
          if (err.statusCode === 401 || statusCode === '401') { // retry
            emit('Error: Invalid credentials. Please check your answers.');
            delete(account.apigeeProxyKey);
            delete(account.apigeeProxyUri);
            updateAccount(account, function(account) {
              provider.deployRemoteProxy(account, options, done);
            });
          } else {
            done(err);
          }
        } else {
          done();
        }
      });
    },
    function(account, cb) {
      writeAccount(name, account, accountsData);
      cb(null, account);
    }
  ], function(err, reply) {
    if (err) { emit('Error: Account creation failed. Please try again.'); }
    cb(err, reply);
  })
}

function update(name, options, cb) {
  var accountsData = readAccountFile(options);
  name = name || options.account || accountsData.selected;
  var account = accountsData.accounts[name];
  if (!account) { cb(new Error('No account named: ' + name)); }

  updateAccount(account, function(account) {
    writeAccount(name, account, accountsData);
    cb(null, account);
  });
}

function updateAccount(account, cb) {
  var provider = getProvider(account.provider);
  var fields = provider.fields;

  // add in any custom fields
  var fieldNames = _.map(fields, function(ea) { return ea.name });
  var customKeys = Object.keys(account);
  customKeys.forEach(function(key) {
    if (fieldNames.indexOf(key) < 0 && key !== 'provider') {
      fields.push({ name: key, message: key + '?' });
    }
  });

  cli.updateAnswers(fields, account, cb);
}

function del(name, options, cb) {
  chooseAccount(name, options, function(err, accountName, accountsData) {
    if (err) { return cb(err); }
    delete accountsData.accounts[name];
    writeAccountFile(accountsData);
    cb();
  });
}

function chooseAccount(name, options, cb) {
  var accountsData = readAccountFile();
  name = name || options.account;
  var account = accountsData.accounts[name];
  if (account) {
    cb(null, name, accountsData);
  } else {
    if (name) { emit('Account %s not found.', name) }
    cli.chooseOne('Account?', Object.keys(accountsData.accounts), function(name) {
      cb(null, name, accountsData);
    });
  }
}

function getSelected(options, name) {
  var accountsData = readAccountFile(options);
  var accountName = name || (options ? options.account : null) || accountsData.selected;
  var account = accountsData.accounts[accountName];
  if (!account) { throw new Error('Unknown account: ' + accountName); }
  account.name = accountName;
  if (debug.enabled) { debug('account: ' + account.name); }
  return account;
}

function listDeployments(name, options, cb) {
  var account = getSelected(options, name);
  var provider = getProvider(account.provider);
  if (provider.listDeployments) {
    emit('Listing deployments proxy to %s...', account.name);
    provider.listDeployments(account, options, cb);
  } else {
    cb(new Error(util.format('cannot list deployments on %s accounts', provider.name)));
  }
}

// project: { api, main, basePath, directory }
function logs(project, options, cb) {
  var account = getSelected(options);
  var provider = getProvider(account.provider);
  if (provider.logs) {
  emit('Retrieving logs for project %s from account %s...', project.name, account.name);
    provider.logs(account, project, options, cb);
  } else {
    cb(new Error(util.format('Cannot retrieve logs for %s accounts', provider.name)));
  }
}

// project: { api, main, basePath, directory }
function deployProject(project, options, cb) {
  var account = getSelected(options);

  // write secrets file
  var deploymentFiles = writeDeploymentFiles(project, account, options.debug);

  emit('Deploying project %s to %s...', project.name, account.name);
  getProvider(account.provider).deployProject(account, project, options, function(err, reply) {
    if (debug.enabled) {
      debug('debug enabled. leaving deployment files: ' + deploymentFiles);
    } else {
      removeDeploymentFiles(project);
    }
    cb(err, reply);
  });
}

function writeDeploymentFiles(project, account, additionalConfig) {

  var envFile = path.resolve(project.configdir, '.a127_env');
  if (debug.enabled) { debug('writing environment: ' + account.environment + ' to ' + envFile); }
  fs.writeFileSync(envFile, account.name);

  if (additionalConfig) {
    account = _.extend(account, additionalConfig);
  }
  var accountYaml = yaml.stringify(account);
  var secretsFile = path.resolve(project.configdir, '.a127_secrets');
  if (debug.enabled) { debug('writing secrets file: ' + secretsFile); }
  fs.writeFileSync(secretsFile, accountYaml);

  return [envFile, secretsFile];
}

function removeDeploymentFiles(project) {
  var envFile = path.resolve(project.configdir, '.a127_env');
  fs.unlinkSync(envFile);
  var secretsFile = path.resolve(project.configdir, '.a127_secrets');
  fs.unlinkSync(secretsFile);
}

// project: { api, main, basePath, directory }
function undeployProject(project, options, cb) {
  var account = getSelected(options);
  var provider = getProvider(account.provider);
  if (provider.undeployProject) {
    emit('Undeploying project %s from %s...', project.name, account.name);
    provider.undeployProject(account, project, options, cb);
  } else {
    cb(new Error(util.format('not valid for %s account', provider.name)));
  }
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
        var module = require(file);
        if (module.name) {
          providers[module.name] = module;
        }
      } catch (err) {
        if (config.debug) { throw(err); }
      }
    }
  }
  return providers;
}

function readAccountFile() {
  try {
    var string = fs.readFileSync(config.account.file, { encoding: 'utf8' });
    return JSON.parse(string);
  } catch (err) {
    return { accounts: {}};
  }
}

// accountsData is optional
function writeAccount(name, account, accountsData) {
  if (!accountsData) { accountsData = readAccountFile(options); }
  accountsData.accounts[name] = account;
  if (!accountsData.selected) {
    accountsData.selected = name;
  }
  writeAccountFile(accountsData);
}

function writeAccountFile(accountsData) {
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
      files.push(fn);
    }
  }
  return files;
}

function setValue(key, value, options, cb) {

  if (key === 'provider') { return cb(new Error('Provider is immutable')); }

  var accountsData = readAccountFile(options);
  var name = options.account || accountsData.selected;
  var account = accountsData.accounts[name];
  if (!account) { cb(new Error('No account named: ' + name)); }

  account[key] = value;
  writeAccount(name, account, accountsData);
  cb(null, account);
}

function deleteValue(key, options, cb) {

  if (key === 'provider') { return cb(new Error('Provider is immutable')); }

  var accountsData = readAccountFile(options);
  var name = options.account || accountsData.selected;
  var account = accountsData.accounts[name];
  if (!account) { cb(new Error('No account named: ' + name)); }

  delete account[key];
  writeAccount(name, account, accountsData);
  cb(null, account);
}
