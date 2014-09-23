## a127 command reference

This is the command reference for `a127`, the command-line interface for Apigee 127. Note that the `/bin/a127` command must be in your PATH. See the "Installation" section for details. 

### <a name="a127-project"></a>project

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
        -r, --resolve-modules    resolve node modules on server instead of uploading (Apigee only, beta) ** See the Tip below **
```

>Tip: If you receive an error that says node_modules is too large to deploy to Apigee Edge, use the `-r` option with `a127 project deploy` command. When this flag is set, the deployment tool ([apigeetool](https://www.npmjs.org/package/apigeetool)) does not ZIP and upload the contents of node_modules; rather, it runs `npm` on Apigee Edge.

* **undeploy** - Undeploys the project from the currently configured cloud platform account.
```bash
    Options:
       -h, --help               output usage information
       -a, --account [account]  use specified account
       -n, --name [name]        override deployment name
```

### <a name="a127-account"></a>account

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
    -v, --virtualhosts [virtualhosts]  virtual hosts
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


### <a name="a127-usergrid"></a>usergrid

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
* **download** - Downloads Apache Usergrid to your machine. 
* **portal** - Opens the Usergrid portal. Use the portal to manage Usergrid projects, create data sets, manage app security, and more. The default login credentials are test/test. 

    Note: You must download Usergrid before you can open the portal. Or, you can execute `a127 usergrid portal --download`.

* **pid** - Print the pid of the currently running Usergrid service.
* **tail** - Prints the tail of your local Usergrid service log. 

## config

Prints config information for the Apigee 127 project. 

`$ a127 config`
