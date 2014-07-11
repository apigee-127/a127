'use strict';

var apigeetool = require('apigeetool');
var qs = require('querystring');
var config = require('../../../../config/index');
var _ = require('lodash');

var NAME = 'apigee';
var SIGNUP_URI = 'https://accounts.apigee.com/';
var PROXY_API = 'volos-proxy';
var PROXY_BASE_PATH = '/volos-proxy';

var FIELDS = [
  { name: 'organization', message: 'Organization?' },
  { name: 'username',     message: 'User Id?'  },
  { name: 'password',     message: 'Password?', type: "password" },
  { name: 'environment',  message: 'Environment?'  }
//  { name: 'key',          message: 'API Key?' } // todo: need to get this from the proxy
];

module.exports = {
  name: NAME,
  signupUri: SIGNUP_URI,
  fields: FIELDS,
  deploy: deploy,
  undeploy: undeploy,
  deployments: deployments,
  deployVolosProxy: deployVolosProxy
}

function deploy(account, profile) {
  // todo
}

function undeploy(account, profile) {
  // todo
}

function deployVolosProxy(account, options, cb) {
  var opts = buildOpts(account, {
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
        console.log(deployment, opts)
        return cb(null, deployment);
      }
    }
    cb(null, reply); // punt
  });
}

function deployments(account, options, cb) {
  var opts = buildOpts(account);
  apigeetool.listDeployments(opts, cb);
}

// utility...

// example: 'http://sganyo-test.apigee.net/adapterproxy',
function proxyURI(account, options) {
  var org = qs.escape(account.organization);
  var env = qs.escape(account.environment);
  return 'https://' + org + '-' + env + '.apigee.net' + PROXY_BASE_PATH;
}

function buildOpts(account, others) {
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
