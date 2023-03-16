<a href="https://www.buymeacoffee.com/sheldonjuncker" target="_blank"><img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy Me A Coffee" width=150 height=40></a>

[View Kubycat on GitHub](https://github.com/sheldonjuncker/node-kubycat)

<img src="https://kubycat.info/kubycat.svg" alt="Kubycat" width="75" style="float: right" align="right" />

# kubycat
A small Node.js library for the watching and automated syncing of files into a local or remote Kubernetes cluster.

```typescript
const name = 'kubycat'
let version = 1.0.6
const author = 'Sheldon Juncker <sheldon@dreamcloud.app>'
const github = 'https://github.com/sheldonjuncker/node-kubycat'
const license = 'MIT'
```

## Table of Contents
- [Overview](#overview)
- [Installation](#installation)
    - [Install kubectl](#install-kubectl)
    - [Install Kubycat](#install-kubycat)
- [Configuration](#configuration)
- [Usage](#usage)
    - [Manual Syncing](#manual-syncing)
    - [Version](#version)
    - [Help](#help)
- [About](#about)
- [Contributing](#contributing)
- [License](#license)

## Overview
Kubycat is a small library and command-line utility for the watching and automated syncing of files into a local or remote Kubernetes cluster.

Kubycat is best suited for local development where it can be used as a simpler alternative to `ksync` or `Skaffold` where you either don't want to install components into your cluster or you don't want to use a complex project setup with a lot of configuration.

Kubycat relies on `fs.watch` to watch for file changes and then uses `kubectl cp` and `kubectl exec` to copy or delete the changed files into the specified Kubernetes pod(s).

**Example:**
```yaml
kubycat:
  config: /home/johndoe/.kube/config
  context: do-sfo1-k8s-cluster
  namespace: default
  sync:
    - name: web-app
      base: /home/johndoe/web-app
      from:
        - src
        - config
        - index.php
        - .env
        - .htaccess
      to: /remote/www
      pod: php-123
      shell: /bin/sh
```

## Installation
Kubycat requires `Node >= 14`, and `kubectl` with `cp` and `exec` support, and the `tar` binary to be installed on the host machine.

### Install kubectl
Kubycat uses kubectl to connect to the Kubernetes cluster.

You can install kubectl in any OS by following the instructions here: https://kubernetes.io/docs/tasks/tools/install-kubectl/


### Install Kubycat
You can install Kubycat globally using `npm` or `yarn`.
```bash
#npm
$ npm install -g kubycat
```

```bash
#yarn
$ yarn global add kubycat
```
or for module usage:
```bash
#npm
$ npm install kubycat
```

```bash
#yarn
$ yarn add kubycat
```

You can test the global installation by running:
```bash
$ kubycat version
```
or for module usage:
```bash
# npm
$ npm exec kubycat version
```

```bash
#yarn
$ yarn kubycat version
```

## Configuration
Kubycat can be configured either with a YAML file in command-line usage or programmatically in module usage.

The source code contains this sample configuration providing a brief overview of each available option. More detailed documentation is provided below.

_Example YAML:_
```yaml
kubycat:
  config: /home/johndoe/.kube/config
  context: minikube
  namespace: default
  sync:
    - name: test
      enabled: true
      base: /home/johndoe/test/
      config: /home/johndoe/.kube/do-sfo3-k8s-johndoe
      context: do-sfo3-k8s-johndoe
      namespace: other
      from:
        - src
        - config
        - index.php
      to: /remote/server
      excluding:
        - .+~$
      including:
        - .+\.php$
      pod: pod-name
      pod-label: key=value
      shell: /bin/sh
      notify: true
      on-error: exit
      show-logs: true
    - name: composer
      enabled: false
      base: /home/johndoe/test/
      namespace: other
      from:
        - composer.json
      to: /remote/server
      pod-label: key=value
      shell: /bin/sh
      post-remote: /bin/sh -c "composer install"
      show-logs: false
      on-error: ignore
```

_Example Typescript:_

```typescript
import {KubycatConfig, KubycatSync} from 'kubycat';

const config = new KubycatConfig('minikube', '~/.kube/config', 'default');
config.addSync(new KubycatSync(
    'test',
    '/home/johndoe/test', 
    ['src', 'config', 'index.php'],
    '/remote/server'
));
```

All of these options can be configured in the YAML file or programmatically.

### kubycat
The `kubycat` section contains all options to configure Kubycat.

### kubycat.config
The `kubycat.config` option specifies the Kubernetes config file to use. This should be an absolute path to the config file, but can be left blank in which case the default config file will be used by kubectl.

You can also override this for any individual sync specification.

### kubycat.context
The `kubycat.context` option specifies the Kubernetes context to use. This allows you to specify which Kubernetes cluster to connect to while using the same config file.

Like the `kubycat.config` option, this can be left blank or overridden for any individual sync specification.

### kubycat.namespace
The `kubycat.namespace` option specifies the default Kubernetes namespace to sync files into. This can also be left blank to use the default namespace or overridden.

### kubycat.sync
The `kubycat.sync` option is a list of sync specifications. Each sync specification contains the following options:

### kubycat.sync.name
The `kubycat.sync.name` option specifies the name of the sync. This is currently not used except to make the YAML look prettier and can be anything.

### kubycat.sync.enabled
The `kubycat.sync.enabled` option specifies whether the sync is enabled or not. This can be used to temporarily disable a sync without having to remove it from the configuration file.

### kubycat.sync.base
The `kubycat.sync.base` option specifies the base directory to sync from. This must be an absolute path, from which the individual `from` paths will be resolved.

### kubycat.sync.namespace
The `kubycat.sync.namespace` option specifies the Kubernetes namespace to sync files into. This can be left blank to use the global or default namespace.

### kubycat.sync.config
The `kubycat.sync.config` option specifies the Kubernetes config file to use for this sync. This should be an absolute path to the config file, but can be left blank in which case the global or default config will be used.

### kubycat.sync.context
The `kubycat.sync.context` option specifies the Kubernetes context to use for this sync. This can be left blank to use the global or default context.

### kubycat.sync.from
The `kubycat.sync.from` option is a list of files and/or folders to sync from the `base` directory. This can be a single file or folder or a list of files and folders. Each path must be a relative path from the `base` directory and if a folder will be synced recursively.

### kubycat.sync.excluding
The `kubycat.sync.excluding` option can be a list of regex file patterns to exclude from syncing. These are applied to the full path of the file being synced. These regexes are case-sensitive by default.

Example to disable syncing for IDE files:
```yaml
kubycat:
  sync:
    - name:
      ...
      from:
        - src
      excluding:
        - .+\.sw[pxo]$
        - .+~$
```

### kubycat.sync.including
The `kubycat.sync.including` option can be a list of regex file patterns to include in syncing. These are applied to the full path of the file being synced. These regexes are case-sensitive by default.

Example to only sync PHP files:
```yaml
kubycat:
  sync:
    - name: php-only
      from:
      - src
      ...
      including:
        - .+\.php$
```

The logic for inclusion/exclusion works as follows:
1. By default, any files in the "from" option will be synced.
2. Any files matching the "excluding" option will be excluded from syncing.
3. Any files matching the "including" option will be included in syncing regardless of whether they would otherwise be excluded by step 2.

### kubycat.sync.to
The `kubycat.sync.to` option specifies the remote path to sync files to. This must be an absolute path.

The to path is assumed to be logically equivalent to the `base` directory. For example, if the `base` directory is `/home/johndoe/test/` and the `to` path is `/remote/server` then the file `/home/johndoe/test/src/index.php` will be synced to `/remote/server/src/index.php`.

This field is optional in which case only the local command will be executed upon file change and no syncing will take place.

This is a convenient way to run a custom file watcher without needing to sync files, and for reloading configs.

### kubycat.sync.pod
The `kubycat.sync.pod` option specifies the name of the pod to sync files into. This is useful for simple deployments where you know the name of the single pod where you want to sync files.

### kubycat.sync.pod-label
Alternatively, the `kubycat.sync.pod-label` option can be used to specify a label to use to find the pod to sync files into. This is useful for deployments where you have multiple pods whose names you don't know but you can identify them by a label.

`pod` and `pod-label` are mutually exclusive and only one can be specified.

One of the two options must be specified if the `to` option is set.

### kubycat.sync.cache-pods
The `kubycat.sync.cache-pods` option specifies whether to cache the list of pods for the specified label. This is useful if you have a deployment with a large number of pods and you want to avoid having to query the Kubernetes API every time a file changes.

### kubycat.sync.shell
The `kubycat.sync.shell` option specifies the shell to use when executing commands in the pod. This is required for deleting files and folders within the Kubernetes pods because `kubectl` provides no `rm` equivalent to `cp`.

This option is required if the `to` option is set.

### kubycat.sync.post-local
The `kubycat.sync.post-local` option specifies a local command to run after syncing files to the Kubernetes pod. This is useful for running commands like `composer install` or `npm install` to install dependencies.

You can also specify the special `kubycat::exit` command to exit Kubycat after a sync is performed.

This might be useful if you only want to sync a one-off change to a pod and then exit.

### kubycat.sync.post-remote
The `kubycat.sync.post-remote` option specifies a remote command to run in each pod after files have been synced. This is useful for running commands like `composer install` or `npm install` to install dependencies.


With both `post-local` and `post-remote` you can use the `${synced_file}`placeholder to specify the path to the local or remote file that was synced. This is useful if you want to run a command on a specific file that was synced.

### kubycat.sync.notify
The `kubycat.sync.notify` option can be used to send desktop notifications when syncing actions or other commands fail.

### kubycat.sync.on-error
The `kubycat.sync.on-error` option specifies what to do when a sync fails. The options are `exit`, `reload`, `ignore`, and `throw`. The default is `throw`.

1. Exit: Kubycat will exit the Node process with a non-zero exit code.
2. Reload: Kubycat will exit the Node process with a zero exit code.
3. Ignore: Kubycat will continue to run as if nothing happened.
4. Throw: Kubycat will throw an exception which will exit in command-line mode but can be caught and handled if running as a module.

Reloading is the same as exiting except that a zero exit code is returned. This is useful if you want to run Kubycat as a service and have it be restarted when a sync fails.
This can also be used to have Kubycat watch its own configuration file and reload when it changes.

### kubycat.sync.show-logs
The `kubycat.sync.show-logs` option specifies whether to show syncing logs. This can be disabled when running programmatically as a module.

## Usage
Kubycat can be used as a command-line tool or as a module.
To start Kubycat as a command-line tool, run:
```bash
$ kubycat <config-file>
```
or programmatically as a module:
```typescript
import { Kubycat, KubycatConfig } from 'kubycat';

const config = KubycatConfig.fromYamlFile('/path/to/config.yaml');
const kubycat = new Kubycat(config);
kubycat.start(1000);
```

In either method, Kubycat will watch for file changes and sync them to the Kubernetes cluster via a synchronous queue.

### Manual Syncing
If you are using Kubycat as a module, you can manually sync files by calling the `Kubycat.addToQueue` or `Kubycat.handleSync` methods.

For example, if you have started Kubycat's file watcher and queue processing (via the `start` method, for example), you can add a file to the queue:
```typescript
import { Kubycat, KubycatConfig } from 'kubycat';

const config = KubycatConfig.fromYamlFile('/path/to/config.yaml');
const kubycat = new Kubycat(config);
kubycat.start(500);
kubycat.addToQueue('/absolute/path/to/file');
```

This will cause the file to be added to the end of the queue and synced when the queue is processed.

If you are not using Kubycat's file watcher or not using the queue, you can still manually sync a file:
```typescript
import { Kubycat, KubycatConfig } from 'kubycat';

const config = KubycatConfig.fromYamlFile('/path/to/config.yaml');
const kubycat = new Kubycat(config);
await kubycat.handleSync('/absolute/path/to/file');
```


### Version
You can view the current Kubycat version by running:
```bash
$ kubycat version
```

### Help
You can view the Kubycat help by running:
```bash
$ kubycat help
```

## About
I wrote Kubycat because I couldn't get `ksync` to work on my machine and I wanted a simple way to sync files into my minikube Kubernetes cluster for local development. I played around with other approaches such as `Skaffold`, but I found that they were too complex for my needs.

The problem at hand didn't seem too difficult, so I decided to write my own solution. It's far from polished, but it works for me quite nicely, and maybe that means others will find it helpful as well.

Kubycat was originally a Perl script and that repo is still available [here](https://github.com/sheldonjuncker/kubycat) though it isn't maintained anymore.

I'm currently using Kubycat for local development of [Dreamcloud](https://dreamcloud.app)--an online social network and dream journal to help people better understand their dreams and find likeminded individuals.

## Contributing
This is the first release of Kubycat, so I'm aware that there are a lot of features that would be useful (file patterns, exclusions, etc.)
I'm also guessing that there will be a handful of bugs that I haven't found yet as my use cases are pretty limited.
I'd be more than happy to accept pull requests for any of these features or bug fixes.

## License
MIT

<a href="https://www.buymeacoffee.com/sheldonjuncker" target="_blank"><img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy Me A Coffee" width=150 height=40></a>

