'use strict';

var apigeetool = require('apigeetool');
var qs = require('querystring');
var config = require('../../../../config/index');
var _ = require('lodash');
var async = require('async');

var NAME = 'apigee';
var SIGNUP_URI = 'https://accounts.apigee.com/';
var PROXY_API = 'volos-proxy';
var PROXY_BASE_PATH = '/volos-proxy';

var FIELDS = [
  { name: 'organization', message: 'Organization?' },
  { name: 'username',     message: 'User Id?'  },
  { name: 'password',     message: 'Password?', type: "password" },
  { name: 'environment',  message: 'Environment?'  }
];

/* todo: when we deployVolosProxy, retrieve Key & Secret:

https://api.enterprise.apigee.com/v1/organizations/sganyo/developers/volos@proxy.com/apps/Volos-Proxy

Response looks something like this:
{
  "credentials": [
    {
      "apiProducts": [
        {
          "apiproduct": "volos-proxy",
          "status": "approved"
        }
      ],
      "consumerKey": "xxxxxx",
      "consumerSecret": "xxxxxx",
      "expiresAt": -1,
      "status": "approved"
    }
  ],
  "name": "Volos-Proxy",
  "status": "approved"
}
 */

module.exports = {
  name: NAME,
  signupUri: SIGNUP_URI,
  fields: FIELDS,
  deployProject: deployProject,
  undeployProject: undeployProject,
  listDeployments: listDeployments,
  deployVolosProxy: deployVolosProxy
}

// options: { importOnly: false }
function deployProject(account, project, options, cb) {
  async.waterfall([
    function(cb) {
      isProxyDeployed(account, options, cb);
    },
    function(proxyDeployed, cb) {
      if (!proxyDeployed) { return cb(); }
      deployVolosProxy(account, options, function(err) {
        cb(err);
      });
    },
    function(cb) {
      var opts = buildApigeetoolOpts(account, {
        api: project.api.name,
        main: project.api.main,
        directory: project.api.directory,
        'base-path': project.api.basePath,
        'import-only': !!options.importOnly
      });
      apigeetool.deployNodeApp(opts, cb);
    }
  ], cb)
}

function undeployProject(account, project, options, cb) {
  var opts = buildApigeetoolOpts(account, {
    api: project.api.name
  });
  apigeetool.undeploy(opts, cb);
}

function deployVolosProxy(account, options, cb) {
  var opts = buildApigeetoolOpts(account, {
    api: PROXY_API,
    directory: config.volosProxyDir,
    'base-path': PROXY_BASE_PATH,
    'import-only': false
  });
  apigeetool.deployProxy(opts, function(err, reply) {
    if (err) { cb(err); }
    var deployments = reply.deployments;
    for (var i = 0; i < deployments.length; i++) {
      var deployment = deployments[i];
      if (deployment.environment === opts.environment) {
        return cb(null, deployment);
      }
    }
    cb(null, reply); // punt
  });
}

function listDeployments(account, options, cb) {
  var opts = buildApigeetoolOpts(account);
  apigeetool.listDeployments(opts, cb);
}

// Utility

function isProxyDeployed(account, options, cb) {
  listDeployments(account, options, function(err, deployments) {
    if (err) { return cb(err); }
    for (var i = 0; i < deployments.length; i++) {
      var deployment = deployments[i];
      if (deployment.name === PROXY_API) {
        return cb(null, deployment.state === 'deployed');
      }
    }
    cb(null, false);
  });
}

// example: 'http://sganyo-test.apigee.net/adapterproxy',
function proxyURI(account, options) {
  var org = qs.escape(account.organization);
  var env = qs.escape(account.environment);
  return 'https://' + org + '-' + env + '.apigee.net' + PROXY_BASE_PATH;
}

function buildApigeetoolOpts(account, others) {
  var accountOpts = {
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
