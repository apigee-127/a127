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
var yaml = require('js-yaml');
var debug = require('debug')('true');
var util = require('util');

module.exports = {
  list: list,
  create: create,
  delete: deleteAccount,
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
  get: getSelected,

  createService: createService,
  listServiceTypes: listServiceTypes,
  deleteService: deleteService,

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

function create(accountName, options, cb) {
  var accountsData = readAccountFile(options);
  if (accountsData.accounts[accountName]) {
    cb(new Error(util.format('Account %s already exists', accountName)));
  }
  var providers = getProviders();

  async.waterfall(
    [
      function(cb) {
        if (options.provider) {
          var p = providers[options.provider];
          if (!p) { var err = new Error('Unknown provider: ' + options.provider); }
          cb(err, p);
        } else {
          cli.chooseOne('Provider?', Object.keys(providers), function(name) {
            cb(null, providers[name]);
          });
        }
      },
      function(provider, cb) {
        if (provider.createAccount) {
          provider.createAccount(accountName, options, function(err, account) {
            if (err) { return cb(err); }
            account.provider = provider.name;
            cb(null, account);
          });
        } else {
          cb(null, { provider: provider.name });
        }
      },
      function(account, cb) {
        accountsData.selected = account.name;
        writeAccount(accountName, account, accountsData);
        cb(null, account);
      }
    ],
    function(err, account) {
      if (err) {
        emit('Error: Account creation failed.');
        return cb(err);
      }
      var header = util.format('Account %s', accountName);
      emit(header);
      emit(Array(header.length + 1).join('='));
      emit(account);
      emit('Account %s selected.', accountName);

      if (options.noservice) { return cb(); }

      listServiceTypes(accountName, options, function(err, types) {
        if (!(types && types.length)) { return cb(); }
        cli.confirm('Create account service?', function(yes) {
          if (!yes) { return cb(); }
          createService(undefined, { account: accountName }, cb);
        });
      });
    }
  )
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

function deleteAccount(name, options, cb) {
  chooseAccount(name, options, function(err, accountName, accountsData) {
    if (err) { return cb(err); }

    delete accountsData.accounts[accountName];
    if (name === accountsData.selected) { delete accountsData.selected; }
    writeAccountFile(accountsData);

    var services = getRelatedServices(accountName, options);
    if (Object.keys(services).length) {
      emit('The following associated services must be manually deleted if desired:');
    }
    cb(null, Object.keys(services));
  });
}

function getRelatedServices(accountName, options) {
  var servicesData = readServicesFile(options);
  var list = {};
  _.each(servicesData, function(service, name) {
    if (accountName === service.metadata.account) {
      list[name] = service.metadata;
    }
  });
  return list;
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
    cb(new Error(util.format('Cannot list deployments on %s accounts', provider.name)));
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

// todo: list service types for all accounts?
function listServiceTypes(name, options, cb) {
  var account = getSelected(options, name);
  var provider = getProvider(account.provider);
  if (provider.getServiceTypes) {
    provider.getServiceTypes(account, options, cb);
  } else {
    cb(new Error(util.format('No services available on %s accounts', provider.name)));
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

  if (additionalConfig) {
    account = _.extend(account || {}, additionalConfig);
  }
  if (!includePasswordInSecrets(project, account)) {
    account = _.omit(account, 'password');
  }
  var accountYaml = yaml.safeDump(account, { skipInvalid: true });
  var secretsFile = path.resolve(project.configdir, '.a127_secrets');
  debug('writing secrets file: %s', secretsFile);
  fs.writeFileSync(secretsFile, accountYaml);

  var envFile = path.resolve(project.configdir, '.a127_env');
  debug('writing environment: %s to %s', account.environment, envFile);
  fs.writeFileSync(envFile, account.name || '');

  var unbound = unboundRequiredServices(project);
  if (unbound) {
    emit();
    emit('Warning: The following services appear to be required in the x-a127-config');
    emit('section of your Swagger.yaml, but are not bound to your project. Ensure all');
    emit('required services are bound to your project before starting or deploying:');
    emit(unbound);
  }

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
    cb(new Error(util.format('Not valid for %s account', provider.name)));
  }
}

function createService(name, options, cb) {
  var servicesData = readServicesFile(options);
  if (servicesData[name]) { return cb(new Error(util.format('Service named %s already exists.', name))); }

  var account = getSelected(options);
  var provider = getProvider(account.provider);

  if (!provider.createService) {
    return cb(new Error(util.format('Not valid for %s account', provider.name)));
  }

  var type = options.type;
  async.waterfall(
    [
      function(cb) {
        provider.getServiceTypes(account, options, cb);
      },
      function(types, cb) {
        if (type) {
          var err = (types.indexOf(type) < 0) ? new Error(util.format('Invalid service type: %s', type)) : null;
          return cb(err);
        }
        cli.chooseOne('Service Type?', types, function(name) {
          type = name;
          cb();
        });
      },
      function(cb) {
        if (name) { return cb(); }
        async.retry(3, function(cb) {
          cli.prompt('Service name?', function(serviceName) {
            if (!serviceName.trim().length) {
              cb(new Error('Service create failed.'));
            }
            else if (servicesData[serviceName]) {
              emit(util.format('Service named %s already exists.', serviceName));
              cb(new Error('Service create failed.'));
            } else {
              name = serviceName;
              cb();
            }
          });
        },
          function(err) {
            cb(err);
          }
        );
      },
      function(cb) {
        emit('Creating service %s from %s...', name, account.name);
        provider.createService(name, account, type, options, function(err, data) {
          if (err) { return cb(err); }
          var service = {
            metadata: {
              account: account.name,
              type: type
            },
            data: data
          };
          cb(null, service);
        });
      },
      function(service, cb) {
        writeService(name, service, servicesData);
        cb(null, service);
      }
    ],
    function(err, reply) {
      if (err) { return cb(err); }
      emit('Remember to bind your service to any projects that require it.');
      cb(null, reply);
    });
}

function deleteService(name, options, cb) {
  chooseService(name, options, function(err, name, servicesData) {
    if (err) { return cb(err); }

    function confirm(cb) {
      if (options.force) { return cb(true); }
      cli.confirm('Service will be unavailable to deployed projects. Are you sure?', false, cb);
    }
    
    function removeRecord(name) {
      delete servicesData[name];
      writeServicesFile(servicesData);
    }

    var service = servicesData[name];
      var account = getSelected(null, service.metadata.account);
      var provider = getProvider(account.provider);
      if (provider.deleteService) {
        confirm(function(yes) {
          if (!yes) { return cb(null, 'Command cancelled'); }
          emit('Deleting service %s from %s...', name, account.name);
          provider.deleteService(name, service, account, options, function(err) {
            if (err) {
              emit(err);
              emit(util.format('Local record %s removed. Delete remote service manually.', name));
            }
            removeRecord(name);
            cb(null, 'Remember to unbind your service from any projects that were bound to it.');
          });
        });
      } else {
        cb(new Error(util.format('Not valid for %s account', provider.name)));
      }
  });
}


// utility

function includePasswordInSecrets(project, account) {
  function readProjectConfigFile(configDir, fileName) {
    configDir = project.configdir;
    try {
      var file = path.resolve(configDir, fileName);
      var obj = yaml.safeLoad(fs.readFileSync(file, 'utf8'));
      if (debug.enabled) { debug('read config file: ' + file); }
      return obj;
    }
    catch(err) {
      if (debug.enabled) { debug('failed attempt to read config: ' + file); }
      return {};
    }
  }
  var defaultConfig = readProjectConfigFile(project, 'default.yaml');
  if (defaultConfig && defaultConfig.includePasswordInSecrets) { return true; }
  var currentConfig = account ? readProjectConfigFile(project, account.name + '.yaml') : undefined;
  if (currentConfig && currentConfig.includePasswordInSecrets) { return true; }
  return false;
}

function unboundRequiredServices(project) {
  var config = project.api.swagger ? project.api.swagger['x-a127-config'] : null;
  if (!config || !Object.keys(config).length) { return null; }

  var requiredServices = [];
  Object.keys(config)
    .forEach(function(key) {
      var dotIndex = key.lastIndexOf('.');
      if (dotIndex > 0) {
        var serviceName = key.substr(0, dotIndex);
        requiredServices.push(serviceName);
      }
    });
  requiredServices = _.uniq(requiredServices);
  if (!requiredServices.length) { return null; }

  var boundServices = Object.keys(project.services);
  var unboundServices = _.difference(requiredServices, boundServices);

  if (!unboundServices.length) { return null; }
  return unboundServices;
}

function chooseAccount(name, options, cb) {
  var accountsData = readAccountFile();
  name = name || options.account;
  var account = accountsData.accounts[name];
  if (account) {
    cb(null, name, accountsData);
  } else {
    if (name) { emit('Account %s not found.', name) }
    var accountNames = Object.keys(accountsData.accounts);
    if (!accountNames.length) { return cb(new Error('No accounts found')); }
    cli.chooseOne('Account?', accountNames, function(name) {
      cb(null, name, accountsData);
    });
  }
}

function chooseService(name, options, cb) {
  var servicesData = readServicesFile();
  name = name || options.service;
  var service = servicesData[name];
  if (service) {
    cb(null, name, servicesData);
  } else {
    if (name) { emit('Service %s not found.', name); }
    var serviceNames = Object.keys(servicesData);
    if (!serviceNames.length) { return cb(new Error('No services found')); }
    cli.chooseOne('Service?', serviceNames, function(name) {
      cb(null, name, servicesData);
    });
  }
}

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

function readServicesFile() {
  try {
    var string = fs.readFileSync(config.services.file, { encoding: 'utf8' });
    return JSON.parse(string);
  } catch (err) {
    return {};
  }
}

// servicesData is optional
function writeService(name, service, servicesData) {
  if (!servicesData) { servicesData = readServicesFile(options); }
  servicesData[name] = service;
  writeServicesFile(servicesData);
}

function writeServicesFile(servicesData) {
  var stringified = JSON.stringify(servicesData);
  fs.writeFileSync(config.services.file, stringified);
}
