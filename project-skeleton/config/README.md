Place configuration files in this directory.

Any configuration file that matches your account name will automatically be read.
For example, if you create an "apigee.yaml" file here, it will be read when you deploy using an account named "apigee".

Configuration priority is as follows:

1. Values defined in your a127 account
2. Values set in config/[account name].yaml
3. Values set in config/default.yaml

These values can be used for replacement in swagger.yaml in the x-a127-config section like so:

x-a127-config:
  someLabel: &referenceKey "Your default value"


Where referenceKey is used 