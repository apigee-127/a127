[![Build Status](https://travis-ci.org/apigee-127/a127.svg?branch=master)](https://travis-ci.org/apigee-127/a127)

# a127 reference

This is the installation guide and command reference for `a127`, the command-line interface for Apigee 127. 

* Prerequisites
* Installation
* Commands

# Prerequisites

If you choose to install Apigee-127 using npm you will need npm version 1.3 or higher.  You will also need [Node.js](http://nodejs.org/download/) version 0.10.24 or higher.

# Installation

You can install `apigee-127` either through npm or by cloning and linking the code from GitHub.  This document covers the installation details for installing from npm.

## Installation from npm

The `apigee-127` module and its dependencies are designed for Node.js and is available through npm using the following command:

### Linux / Mac from a Terminal Window:
```bash
$ sudo npm install -g apigee-127
```

> NOTE: The npm installation requires permission to create a folder in the ~/.a127 directory. When installing apigee-127 you may need to add the flag --unsafe-perm to the install command. For example:
    ```bash
        $sudo npm install -g apigee-127 --unsafe-perm
    ```

> NOTE: `sudo` may be required with the `-g` option which places the `a127` command-line commands in you PATH. If you do not use `-g`, then you need to add the `apigee-127/bin `directory to your PATH manually. 
> 
> Typically, the `-g` option places modules in: `/usr/local/lib/node_modules/apigee-127` on *nix-based machines.


### Windows, from a Command Prompt

```
npm install -g apigee-127
```

## Location of files

Apigee-127 places most of its files that it depends on at a global level in `~/.a127`.  This includes an `accounts` file that has details about the configured accounts and an optional `usergrid` directory if you choose to download and use Usergrid through the `a127` command line.

## Dependencies

For a list of dependencies and Node.js modules that are relevant to an Apigee-127 project, see [Apigee-127 modules](https://github.com/apigee-127/a127-documentation/wiki/Apigee-127-modules)

# Command reference

* project
* account
* usergrid
* config
* wiki

## <a name="a127-project"></a>project

Create and manage Apigee 127 projects on your local machine. 

`$ a127 project [options]  [command]`

**Examples:**

`$ a127 project create`

`$ a127 project start`

`$ a127 project deploy`

To print a list of valid options for a command:

`$ a127 project [command] -h`

**Commands:**

* **create** - Creates a new Apigee 127 skeleton project populated with files from GitHub. See also "New Apigee 127 project structure" below. 

* **start** - Runs the main Node.js project file, app.js. The server automatically restarts when you make changes to the project.
```bash
    Options:
        -h, --help   output usage information
        -d, --debug  start in debug mode
        -m, --mock   start in mock mode
        -o, --open   open in browser
        -a, --account <account> use the specified account for configuration
        -d, --debug [port]      start in remote debug mode
        -b, --debug-brk [port]  start in remote debug mode, wait for debugger connect
```
* **edit** - Opens the Swagger API editor.
* **deploy** - Deploys the project to the currently configured cloud platform account.
```bash
    Options: 
        -h, --help               output usage information
        -a, --account [account]  use specified account
        -i, --import-only        import project to provider, but don't deploy (Apigee only)
        -n, --name [name]        override deployment name
        -m, --main [main]        override deployment main file
        -b, --base [path]        override deployment base path (default is /projectName)
```

>Note: When you deploy your project to Apigee Edge, Node.js modules are installed or updated automatically for you on Edge. The command does not upload any files from your local `node_modules` directory. 


* **undeploy** - Undeploys the project from the currently configured cloud platform account.
```bash
    Options:
       -h, --help               output usage information
       -a, --account [account]  use specified account
       -n, --name [name]        override deployment name
```

## <a name="a127-account"></a>account

Create and manage deployment provider accounts. Deployment providers are cloud-based platforms where you can deploy your Apigee 127 project. 

**Note:** Currently, the only option is deploying to Apigee Edge. Other providers will be added in the future. 

`$ a127 account [-options]  [command]  {account_name}`

**Example:**

`$ a127 account create myaccount`

To print a list of valid options for a command:

`a127 account [command] -h`

**Commands:**

* **create** - Creates a deployment account on a specified provider. Follow the command line prompts. The deploy command deploys your project to this provider account. Account information for each account that you configure is stored by default in `~/.a127/accounts`. The default provider is `apigee`. 

```bash
    -h, --help                         output usage information
    -p, --provider [provider]          name of provider
    -b, --baseuri [baseuri]            base uri
    -o, --organization [organization]  organization
    -u, --username [username]          username
    -w, --password [password]          password
    -e, --environment [environment]    environment
    -v, --virtualhosts [virtualhosts]  virtual hosts -- by default "default,secure" is set, giving both http and https support. For http only, set this to default. For https only, set to https. 
```
Example:

```bash
        $ a127 account create myaccount
        [?] Provider? apigee
        [?] Do you have an account? Yes
        [?] Organization? jdoe
        [?] User Id? jdoe@apigee.com
        [?] Password? *********
        [?] Environment? test
```
* **delete** - Deletes the specified account. Information for the account is removed from `~/.a127/accounts`. 
```bash
        $ a127 account delete myaccount
```
* **update** - Updates the specified account. Follow the command line prompts.
* **show** - Shows information about the specified account. If you do not specify an account name, you will see information for the current account. 
* **list|ls** - Lists the deployment accounts. The current account is identified with "+". 
* **select** - Makes the specified account the current account. 

        `$ a127 account select myaccount`

* **providers** - Lists the available deployment providers. Currently, `apigee` is the only available provider. More will be added in the future. 
* **deployments** - Lists all all projects that are deployed to the current provider account. 

```bash
  Options:

    -h, --help  output usage information
    -l, --long  long format (includes URIs)
```

* **setValue** -- Sets a value on the account. 

* **deleteValue** -- Deletes a value from the account.  


## <a name="a127-usergrid"></a>usergrid

Manage an [Apache Usergrid](http://usergrid.incubator.apache.org/) service on your local machine. Usergrid is an open-source BaaS solution based on RESTful APIs. 

`$ a127 usergrid [options]  [command]`

Examples:

`$ a127 usergrid start`

`$ a127 usergrid portal`

`$ a127 usergrid stop`

To print a list of valid options for a command:

`$ a127 usergrid [command] -h`

**Commands:**

* **start** - Starts a local instance of the Apache Usergrid service.
* **stop** - Stops the running Usergrid service.

    Note: If you are unsure if Usergrid is running, hit localhost:8080. If you get a "Page Not Found" error, Usergrid is not running. In that case, try stopping and then starting Usergrid using `a127 usergrid stop` and `a127 usergrid start`.

* **download** - Downloads Apache Usergrid to your machine. 
* **portal** - Opens the Usergrid portal. Use the portal to manage Usergrid projects, create data sets, manage app security, and more. The default login credentials are test/test. 

    Note: You must download Usergrid before you can open the portal. Or, you can execute `a127 usergrid portal --download`.

* **pid** - Print the pid of the currently running Usergrid service.
* **tail** - Prints the tail of your local Usergrid service log. 

## config

Prints config information for the Apigee 127 project. 

`$ a127 config`

## <a name="a127-wiki"></a>wiki

Opens the Apigee-127 documentation wiki in your default browser. The wiki is hosted on GitHub with the [apigee-127/a127-documentation](https://github.com/apigee-127/a127-documentation) project. 
