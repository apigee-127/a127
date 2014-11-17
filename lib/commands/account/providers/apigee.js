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
var emit = require('../../util/feedback').emit;

var NAME = 'apigee';
var SIGNUP_URI = 'https://accounts.apigee.com/accounts/sign_up?utm_source=a127&utm_medium=cli&utm_campaign=a127';
var PROXY_API = 'apigee-remote-proxy';

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
  deployRemoteProxy: deployRemoteProxyAndApp
};

//.option('-i, --import-only', "import project to provider, but don't deploy (Apigee only)")
function deployProject(account, project, options, cb) {
  var opts = buildApigeetoolOpts(account, {
    api: project.api.name,
    main: project.api.main,
    directory: project.dirname,
    'base-path': project.api.basePath,
    'import-only': !!options.importOnly,
    'resolve-modules': !options.upload,
    virtualhosts: account.virtualhosts
  });

  apigeetool.deployNodeApp(opts, function (err,results) {
        if (!err) {
            emit('Project %s got deployed successfully', project.api.name);
            explicitlyAddResources(account,project,options,results,cb);
        }
    });
}

function explicitlyAddResources(account, project, options,results, cb) {
    var util = require("util");

    var paths = Object.keys(project.api.swagger.paths).filter(removeVendorExtensions).map(function (key) {
        return {
            pathName: key
        }
    });


    paths = paths.map(function (path) {
        return {
            pathName: path.pathName,
            operations: Object.keys(project.api.swagger.paths[path.pathName]).filter(removeVendorExtensions)
        };
    });

    var apiEndPoint = buildApigeeResourceDefEndPoint(account, results);
    //For each resource then for each operation make a POST call to add resources
    var postResourceRequests = [];
    paths.forEach(function (path) {
        path.operations.forEach(function (operation) {
            emit('Posting resource for %s and operation %s', path.pathName, operation);
            var payload = buildPostPayload(path.pathName, operation);
            postResourceRequests.push({
                json: payload,
                headers: {'content-type': 'application/json'},
                auth: {
                    'user': account.username,
                    'pass': account.password
                }
            });
        });
    });

    async.mapSeries(postResourceRequests, function (reqPayload, cb) {
        request.post(apiEndPoint, reqPayload, cb);
    }, function (err, responses) {
        if (err)
            return emit('Async Error: ', err);
        responses.forEach(function(response) {
            emit('Status code for Async resource call %s' , response.statusCode);
        })
    });
}

function removeVendorExtensions(key) {
    return key.indexOf('x-') !== 0;
}

function buildApigeeResourceDefEndPoint(account,results) {
    //https://api.enterprise.apigee.com/v1/o/demo_bvt/apis/hello1/revisions/1/proxies/default/flows
    return 'https://api.enterprise.apigee.com/v1/o/' +
        account.organization + '/apis/' +
        results.name + '/revisions/'+
        results.revision + '/proxies/default/flows';
}

function buildPostPayload(resource, verb) {
    /* return '{'+
     '"condition": "(proxy.pathsuffix MatchesPath \\"'+ resource + '\\") +' +
     'and (request.verb = \\"'+ verb + '\\")"'+
     '"description": "",'+
     '"name": '+ resource +
     '}';
     */
    return {
        condition: '(proxy.pathsuffix MatchesPath "'+resource + '") and (request.verb = "' + verb + '")',
        description: '',
        name: resource+'-'+verb
    };
}

function undeployProject(account, project, options, cb) {
  var opts = buildApigeetoolOpts(account, {
    api: project.api.name
  });
  apigeetool.undeploy(opts, cb);
}

function deployRemoteProxyAndApp(account, options, cb) {
  async.parallel([
    function(cb) {
      getRemoteProxyURI(account, options, cb);
    },
    function(cb) {
      getRemoteProxyKey(account, options, cb);
    }
  ],
    function(err, reply) {
      if (err) { return cb(err); }
      var uri = reply[0];
      var key = reply[1];
      debug('setting remote proxy uri: %s', uri);
      debug('setting remote proxy key: %s', key);
      account.apigeeProxyUri = uri;
      account.apigeeProxyKey = key;
      cb(err, account)
    }
  );
}

function listDeployments(account, options, cb) {
  var opts = buildApigeetoolOpts(account);
  if (options.long) { opts.long = true; }
  apigeetool.listDeployments(opts, cb);
}

// Utility

function getRemoteProxyURI(account, options, cb) {
  async.waterfall([
    function(cb) {
      options.long = true;
      deployedProxy(account, options, cb);
    },
    function(proxy, cb) {
      if (proxy && cb) { return cb(null, proxy); }
      cb = proxy;
      deployRemoteProxy(account, options, cb);
    },
    function(proxy, cb) {
      var httpsUri = _.find(proxy.uris, function(uri) {
        return uri.substr(0, 4) === 'https';
      });
      cb(null, httpsUri || proxy.uris[0]);
    }
  ], cb);
}

function deployedProxy(account, options, cb) {
  listDeployments(account, options, function(err, result) {
    if (err) { return cb(err); }
    var deployments = result.deployments;
    for (var i = 0; i < deployments.length; i++) {
      var deployment = deployments[i];
      if (deployment.name === PROXY_API && deployment.state === 'deployed') {
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
  apigeeRemoteProxy.deployRemoteProxy(_.clone(account), function(err, reply) {
    cb(err, reply);
  });
}

function getRemoteProxyKey(account, options, cb) {
  var config = {
    managementUri: account.baseuri,
    organization: account.organization,
    user: account.username,
    password: account.password
  };
  var mgmt = volosManagement.create(config);
  var devRequest = {
    firstName: 'Remote',
    lastName: 'Proxy',
    email: 'remote-proxy@apigee.com',
    userName: 'remote-proxy'
  };
  var appRequest = {
    name: 'Remote Proxy'
  };
  mgmt.getDeveloperApp(devRequest.email, appRequest.name, function(err, reply) {
    if (err && err.statusCode !== 404) { return cb(err); }
    if (reply) { return cb(null, reply.credentials[0].key); }
    debug('creating proxy developer: %j', devRequest);
    mgmt.createDeveloper(devRequest, function(err, dev) {
      if (err && err.statusCode != 409) { return cb(err); }
      if (err && err.statusCode === 409) {
        appRequest.developerId = devRequest.email;
      } else {
        appRequest.developerId = dev.id;
      }
      debug('creating proxy app: %j', appRequest);
      mgmt.createApp(appRequest, function(err, reply) {
        if (err) { return cb(err); }
        cb(null, reply.credentials[0].key);
      });
    });
  });
}
