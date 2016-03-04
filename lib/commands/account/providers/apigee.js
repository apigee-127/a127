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

var apigeetool = require('apigeetool');
var config = require('../../../../config/index');
var request = require('request');
var _ = require('lodash');
var async = require('async');
var volosManagement = require('volos-management-apigee');
var debug = require('debug')('true');
var apigeeRemoteProxy = require('apigee-remote-proxy');
var emit = require('../../../util/feedback').emit;
var util = require('util');
var cli = require('../../../util/cli');
var browser = require('../../../util/browser');

var NAME = 'apigee';
var SIGNUP_URI = 'https://accounts.apigee.com/accounts/sign_up?utm_source=a127&utm_medium=cli&utm_campaign=a127';
var REMOTE_PROXY_SERVICE = 'RemoteProxy';
var SERVICE_TYPES = [ REMOTE_PROXY_SERVICE ];

var DEVELOPER = {
  firstName: 'Remote',
  lastName: 'Proxy',
  email: 'remote-proxy@apigee.com',
  userName: 'remote-proxy'
};

var FIELDS = [
  { name: 'baseuri',      message: 'Base URI?', default: 'https://api.enterprise.apigee.com' },
  { name: 'organization', message: 'Organization?' },
  { name: 'username',     message: 'User Id?'  },
  { name: 'password',     message: 'Password?', type: 'password' },
  { name: 'environment',  message: 'Environment?'  },
  { name: 'virtualhosts', message: 'Virtual Hosts?', default: 'default,secure' }
];

module.exports = {
  name: NAME,
  signupUri: SIGNUP_URI,
  fields: FIELDS,
  deployProject: deployProject,
  undeployProject: undeployProject,
  listDeployments: listDeployments,
  logs: logs,

  getServiceTypes: getServiceTypes,
  createService: createService,
  deleteService: deleteService,
  createAccount: createAccount
};

function createAccount(name, options, cb) {
  async.waterfall([
    function(cb) {
      if (options.username) { return cb(); }
      cli.confirm(util.format('Do you already have an account on %s?', NAME), function(yes) {
        if (yes) { return cb(); }
        emit('Opening browser to signup link: %s', SIGNUP_URI);
        browser.open(SIGNUP_URI, function(err) {
          cb(err);
        });
      });
    },
    function(cb) {
      var results = {};
      FIELDS.forEach(function(field) {
        results[field.name] = options[field.name]
      });
      async.retry(3,
        function(cb) {
          cli.requireAnswers(FIELDS, results, function(results) {
            validateAccount(results, options, function(err) {
              if (err) {
                if (err.message === 'bad_auth') {
                  emit('Authorization failed. Please retry username & password.');
                  cli.updateDefaultValue(FIELDS, 'username', results.username);
                  delete(results.username);
                  delete(results.password);
                } else if (err.message === 'bad_url') {
                  emit('Failed to connect to API. Please check uri.');
                  cli.updateDefaultValue('baseuri', 'username', results.baseuri);
                  delete(results.baseuri);
                }
              }
              cb(err, results);
            });
          });
        },
        cb);
    }
  ],
    function(err, reply) {
      if (err) { emit('Error: Account creation failed.'); }
      cb(err, reply);
    })
}

//.option('-i, --import-only', "import project to provider, but don't deploy (Apigee only)")
function deployProject(account, project, options, cb) {
  var opts = buildApigeetoolOpts(account, {
    api: project.api.name,
    main: project.api.main,
    directory: project.dirname,
    'base-path': project.api.basePath,
    'import-only': !!options.importOnly,
    'resolve-modules': !options.upload,
    virtualhosts: account.virtualhosts,
    environments: account.environment
  });
  delete(opts.environment);

  apigeetool.deployNodeApp(opts, function(err, results) {
    if (err) {
      if (err.code === 'ECONNRESET' && err.message === 'socket hang up') {
        err.message = 'Deployment timeout. Please try again or use the --upload option.'
      }
      return cb(err);
    }

    emit('');
    emit({ Deployed: results });

    if (!results) { return cb(); } // todo: temp fix to avoid error in existing tests, remove when tests have been updated

    async.each(results, function(result, cb) {
      addResources(account, project, result, cb);
    }, cb);
  });
}

function addResources(account, project, results, cb) {

  emit('Adding resources...');

  var paths = Object
    .keys(project.api.swagger.paths)
    .filter(removeVendorExtensions)
    .map(function(key) { return { pathName: key } }
  );

  paths = paths.map(function(path) {
    return {
      pathName: path.pathName,
      operations: Object.keys(project.api.swagger.paths[path.pathName]).filter(removeVendorExtensions)
    };
  });

  var apiEndPoint = buildApigeeResourceDefEndPoint(account, results);

  // For each resource then for each operation make a POST call to add resources
  var postResourceRequests = [];
  paths.forEach(function(path) {
    path.operations.forEach(function(operation) {
      emit('  %s %s', operation.toUpperCase(), path.pathName);
      var payload = buildPostPayload(path.pathName, operation);
      postResourceRequests.push({
        json: payload,
        headers: { 'content-type': 'application/json' },
        auth: {
          user: account.username,
          pass: account.password
        }
      });
    });
  });

  async
    .mapSeries(postResourceRequests, function(reqPayload, cb) {
      request.post(apiEndPoint, reqPayload, function(err, response) {
        if (!err && (response.statusCode < 200 || response.statusCode >= 300)) {
          err = new Error(response.body.message);
          err.statusCode = response.statusCode;
        }
        cb(err, response);
      });
    },
    function(err, responses) {
      cb(err)
    }
  );
}

function removeVendorExtensions(key) {
  return key.indexOf('x-') !== 0;
}

function buildApigeeResourceDefEndPoint(account, results) {
  //https://api.enterprise.apigee.com/v1/o/demo_bvt/apis/hello1/revisions/1/proxies/default/flows
  // 20150317 replaced fixed url : return 'https://api.enterprise.apigee.com/v1/o/' +
  return account.baseuri + '/v1/o/' +
    account.organization + '/apis/' +
    results.name + '/revisions/' +
    results.revision + '/proxies/default/flows';
}

function buildPostPayload(resource, verb) {
  return {
    condition: '(proxy.pathsuffix MatchesPath "' + resource + '") and (request.verb = "' + verb + '")',
    description: '',
    name: resource + '-' + verb
  };
}

function undeployProject(account, project, options, cb) {
  var opts = buildApigeetoolOpts(account, {
    api: project.api.name
  });
  apigeetool.undeploy(opts, cb);
}

function listDeployments(account, options, cb) {
  var opts = buildApigeetoolOpts(account);
  if (options.long) { opts.long = true; }
  apigeetool.listDeployments(opts, cb);
}

function getServiceTypes(account, options, cb) {
  cb(null, SERVICE_TYPES);
}

function createService(name, account, type, options, cb) {
  async.waterfall([
    function(cb) {
      if (type) { return cb(); }
      cli.chooseOne('Service Type?', Object.keys(SERVICE_TYPES), function(selected) {
        type = selected;
        cb();
      });
    },
    function(cb) {
      if (type === REMOTE_PROXY_SERVICE) {
        return createRemoteProxyService(name, account, options, cb);
      } else {
        cb(new Error(util.format('Invalid service type: %s', type)));
      }
    }
  ], cb);
}

function createRemoteProxyService(name, account, options, cb) {
  async.parallel(
    [
      function(cb) {
        // deploys remote proxy as needed
        // todo: should this fail if it exists?
        getRemoteProxyURI(name, account, options, cb);
      },
      function(cb) {
        // creates developer and app as needed
        getRemoteProxyKey(name, account, options, cb);
      }
    ],
    function(err, reply) {
      if (err) { return cb(err); }
      var uri = reply[0];
      var key = reply[1];
      debug('remote proxy uri: %s', uri);
      debug('remote proxy key: %s', key);
      var service = { uri: uri, key: key };
      cb(null, service);
    }
  );
}

function deleteService(name, service, account, options, cb) {
  async.parallel(
    [
      function(cb) {
        var options = {
          api: deriveServiceApi(name),
          baseuri: account.baseuri,
          organization: account.organization,
          username: account.username,
          password: account.password,
          environment: account.environment
        };
        apigeetool.undeploy(options, function(err) {
          if (err) { return cb(err); }
          apigeetool.delete(options, cb);
        });
      },
      function(cb) {
        var mgmt = getVolosManagement(account);
        mgmt.getDeveloperApp(DEVELOPER.email, deriveServiceApi(name), function(err, app) {
          if (err) { return cb(err); }
          mgmt.deleteApp(app.id, function(err, app) { // note: will also delete product
            cb(err, app);
          })
        });
      }
    ],
    function(err) {
      if (err) { return cb(err); }
      cb();
    }
  );
}

function logs(account, project, options, cb) {
  var opts = buildApigeetoolOpts(account);
  opts.api = project.name;
  if (options.timezone) { opts.timezone = options.timezone; }
  if (options.follow) { opts.streaming = true; }
  apigeetool.getLogs(opts, cb);
}

// Utility

// if problem, returns 'bad_url' or 'bad_auth' in error message
function validateAccount(account, options, cb) {
  listDeployments(account, options, function(err) {
    if (err) {
      debug('original err: %s', err);
      // ugly... but apigeetool only returns statusCode in the message
      var split = err.message.split(' ');
      var statusCode = split[split.length - 1];
      if (err.statusCode === 401 || statusCode === '401') {
        cb(new Error('bad_auth'));
      } else if (err.statusCode === 404 || statusCode === '404') {
        cb(new Error('bad_url'));
      }
    } else {
      cb();
    }
  });
}

function getRemoteProxyURI(name, account, options, cb) {
  async.waterfall([
    function(cb) {
      options.long = true;
      deployedProxy(name, account, options, cb);
    },
    function(proxy, cb) {
      if (proxy && cb) { return cb(null, proxy); }
      cb = proxy;
      options.name = name;
      options.api = deriveServiceApi(name);
      deployRemoteProxy(account, options, cb);
    },
    function(proxy, cb) {
      if (Array.isArray(proxy)) proxy = proxy[0];
      var httpsUri = _.find(proxy.uris, function(uri) {
        return uri.substr(0, 4) === 'https';
      });
      cb(null, httpsUri || proxy.uris[0]);
    }
  ], cb);
}

function deriveServiceApi(name) {
  return name.toLowerCase().replace(/ /g, '-');
}

function deployedProxy(name, account, options, cb) {
  listDeployments(account, options, function(err, result) {
    if (err) { return cb(err); }
    var deployments = result.deployments;
    for (var i = 0; i < deployments.length; i++) {
      var deployment = deployments[i];
      if (deployment.name === name && deployment.state === 'deployed') {
        return cb(null, deployment);
      }
    }
    cb();
  });
}

function buildApigeetoolOpts(account, others) {
  var accountOpts = {
    baseuri: account.baseuri,
    organization: account.organization,
    environment: account.environment,
    username: account.username,
    password: account.password,
    debug: config.debug,
    verbose: config.debug
  };
  if (others) { _.extend(accountOpts, others); }
  return accountOpts;
}

function deployRemoteProxy(account, options, cb) {
  var opts = _.clone(account);
  if (options.name) { opts.name = options.name; }
  if (options.api) { opts.api = options.api; }
  opts.environments = account.environment;
  apigeeRemoteProxy.deployRemoteProxy(opts, cb);
}

function getVolosManagement(account) {
  var config = {
    managementUri: account.baseuri,
    organization: account.organization,
    user: account.username,
    password: account.password
  };
  return volosManagement.create(config);
}

function getRemoteProxyKey(name, account, options, cb) {
  var mgmt = getVolosManagement(account);
  var appRequest = {
    // note: not just "name" of remote proxy because Edge changes the name to the api url
    name: util.format(deriveServiceApi(name)),
    environments: [ account.environment ]
  };
  mgmt.getDeveloperApp(DEVELOPER.email, appRequest.name, function(err, reply) {
    if (err && err.statusCode !== 404) { return cb(err); }
    if (reply) { return cb(null, reply.credentials[0].key); }
    debug('creating proxy developer: %j', DEVELOPER);
    mgmt.createDeveloper(DEVELOPER, function(err, dev) {
      if (err && !(err.statusCode == 409 || err.statusCode == 400)) {
          debug('error creating developer', err);
          return cb(err);
      }
      // For monetization enabled org, pre-existing developer status code is 400
      // but for the rest it's 409
      if (err && (err.statusCode === 409 || err.statusCode === 400)) {
        debug ('ignoring status code 409 and 400 for creating developer');
        appRequest.developerId = DEVELOPER.email;
      } else {
        appRequest.developerId = dev.id;
      }
      debug('creating proxy app: %j', appRequest);
      mgmt.createApp(appRequest, function(err, reply) {
        if (err) {
          debug('error creating app ', err);
          return cb(err);
        }
        cb(null, reply.credentials[0].key);
      });
    });
  });
}
