import KubycatConfig from "./KubycatConfig.js";
import KubycatSync from "./KubycatSync.js";
import fs from 'fs';
import crypto from 'crypto';
import {spawn} from 'child_process';
import KubycatFileStatus from "./KubycatFileStatus.js";
import KubycatCommandStatus from "./KubycatCommandStatus.js";
import {exit} from 'node:process';
import notifier from 'node-notifier';
import chalk from 'chalk';

class Kubycat {
    private _config: KubycatConfig;
    private _fileCache: { [key: string]: string } = {};
    private _syncQueue: string[] = [];
    private _syncing: boolean = false;
    private _fileWatchers: fs.FSWatcher[] = [];

    constructor(config: KubycatConfig) {
        config.validate();
        this._config = config;
    }

    get config(): KubycatConfig {
        return this._config;
    }

    set config(value: KubycatConfig) {
        this._config = value;
    }

    public watchFiles() {
        for (const sync of this.config.syncs) {
            if (!sync.enabled) {
                continue;
            }

            for (const from of sync.from) {
                const isFile = fs.statSync(sync.base + '/' + from).isFile();
                const watcher = fs.watch(sync.base + '/' + from, { recursive: true }, async (_event, file) => {
                    if (file) {
                        file = file.replace(/\\/g, '/');
                        let absolutePath;
                        if (isFile) {
                            absolutePath = sync.base + '/' + from;
                        } else {
                            absolutePath = sync.base + '/' + from + '/' + file;
                        }
                        this._syncQueue.push(absolutePath);
                    }
                });
                this._fileWatchers.push(watcher);
            }
        }
    }

    public unwatchFiles() {
        for (const watcher of this._fileWatchers) {
            watcher.close();
        }
        this._fileWatchers = [];
    }

    public async startQueue(interval: number = 1000) {
        this._syncing = true;
        await this.processQueue(interval);
    }

    public stopQueue() {
        this._syncing = false;
    }

    public async start() {
        this.watchFiles();
        return await this.startQueue(this.config.interval);
    }

    public stop() {
        this.unwatchFiles();
        this.stopQueue();
    }

    public addToQueue(file: string) {
        this._syncQueue.push(file);
    }

    public async handleSync(file: string): Promise<void> {
        let excludedSync;
        const sync = this.config.syncs.find(s => {
            if (!s.enabled) {
                return false;
            }

            //Must be within the base path
            if (!file.startsWith(s.base)) {
                return false;
            }

            const relativeFile = file.substring(s.base.length + 1);

            //Must be within one of the from paths (recursive)
            if (!s.from.some(f => relativeFile.startsWith(f))) {
                return false;
            }

            //Must not be in the excluding regexes
            if (s.excluding.some(e => file.match(e))) {
                excludedSync = s;
                //Unless it is in the including regexes
                if (!s.including.some(i => file.match(i))) {
                    return false;
                } else {
                    excludedSync = null;
                }
            }
            return true;
        });

        if (!sync) {
            if (excludedSync) {
                this.log(excludedSync, chalk.blue(`sync\t${file}`));
                this.log(excludedSync, chalk.yellow(` - excluded`));
            }
            return;
        } else {
            this.log(sync, chalk.blue(`sync\t${file}`));
            this.log(sync, chalk.green(` - sync=${sync.name}`));
        }

        return await this.runSync(sync, file);
    }

    private async processQueue(interval: number = 1000) {
        if (!this._syncing) {
            return;
        }

        //get the current time in milliseconds
        const now = new Date().getTime();

        if (this._syncQueue.length > 0) {
            const file = this._syncQueue.shift();
            if (file) {
                await this.handleSync(file);
            }
        }

        //get the current time in milliseconds
        const end = new Date().getTime();

        //wait up to interval milliseconds before returning a promise that runs the function again
        const timeout = Math.max(0, interval - (end - now));

        return new Promise(resolve => {
            setTimeout(async () => {
                resolve(this.processQueue(interval));
            }, timeout);
        });
    }

    private getFileHash(file: string): string {
        try {
            const stat = fs.statSync(file);
            if (!stat.isDirectory()) {
                const contents = fs.readFileSync(file);
                return stat.ctime.toString() + ':' + crypto.createHash('md5').update(contents).digest('hex');
            } else {
                return KubycatFileStatus.Directory_Modified;
            }
        } catch (e) {
            return KubycatFileStatus.Deleted;
        }
    }

    private getFileStatus(file: string): KubycatFileStatus {
        const hash = this.getFileHash(file);
        if (this._fileCache[file] === hash) {
            return KubycatFileStatus.Unchanged;
        }
        const oldHash = this._fileCache[file];
        this._fileCache[file] = hash;
        if (hash === KubycatFileStatus.Deleted) {
            return KubycatFileStatus.Deleted;
        } else if(hash === KubycatFileStatus.Directory_Modified) {
            if (!oldHash || oldHash === KubycatFileStatus.Deleted) {
                //only sync if the directory is new or was previously deleted
                return KubycatFileStatus.Directory_Modified;
            } else {
                return KubycatFileStatus.Unchanged;
            }

        } else {
            return KubycatFileStatus.Modified;
        }
    }

    private async runSync(sync: KubycatSync, file: string) {
        const status = this.getFileStatus(file);
        this.log(sync, ` - status=${status}`);
        if (status === KubycatFileStatus.Unchanged) {
            return;
        }

        if (sync.to) {
            if (status === KubycatFileStatus.Deleted) {
                await this.deleteFile(sync, file);
            } else {
                await this.updateFile(sync, file, status === KubycatFileStatus.Directory_Modified);
            }
        } else {
            this.log(sync, chalk.yellow(` - no destination, nothing to do`));
        }

        if (sync.postLocal) {
            if (sync.postLocal == 'kubycat::exit') {
                this.stop();
                exit(0);
            }

            const localCommand = sync.postLocal.replace('${synced_file}', file);
            await this.runCommand(sync, localCommand, file, false);
        }

        if (sync.postRemote) {
            const remoteCommand = sync.postRemote.replace('${synced_file}', file);
            await this.runCommand(sync, remoteCommand, file, true);
        }
    }

    private async deleteFile(sync: KubycatSync, file: string) {
        const base = this.getKubernetesBaseCommand(sync);
        const relativePath = file.substring(sync.base.length + 1);
        const command = base.join(' ') + ' exec $POD -- ' + sync.shell + ' -c "rm -Rf ' + sync.to + '/' + relativePath + '"';
        await this.runCommand(sync, command, file, true);
    }

    private async updateFile(sync: KubycatSync, file: string, directory: boolean) {
        const base = this.getKubernetesBaseCommand(sync);
        const namespace = sync.namespace;
        let relativePath = file.substring(sync.base.length + 1);
        if (directory) {
            //we want sync to the parent directory so that this doesn't nest the directory
            relativePath = relativePath.substring(0, relativePath.lastIndexOf('/'));
        }
        const command = base.join(' ') + ' cp ' + file + ' ' + namespace + '/$POD:' + sync.to + '/' + relativePath;
        await this.runCommand(sync, command, file, true);
    }

    private async runCommand(sync: KubycatSync, command: string, file: string, remote: boolean = false, subCommand: boolean = false): Promise<KubycatCommandStatus> {
        let status: KubycatCommandStatus = new KubycatCommandStatus(0);
        try {
            if (remote) {
                //Runs a command on all the pods
                const pods = await this.getKubernetesPods(sync);
                this.log(sync, ` - running on all ${pods.length} pods`);
                for (const pod of pods) {
                    const remoteCommand = command.replace(/\$POD/g, pod);
                    status = await this.runCommand(sync, remoteCommand, file, false, true);
                }
            } else {
                this.log(sync, ` - ${command}`);
                //Runs the command locally
                const child = spawn(command, {
                    shell: true,
                    stdio: 'pipe',
                    env: {
                        ...process.env,
                    }
                });
                status = await  new Promise<KubycatCommandStatus>((resolve) => {
                    let output: string[] = [];
                    let error: string[] = [];

                    child.stdout.setEncoding('utf8');
                    child.stdout.on('data', (data) => {
                        output.push(data.toString());
                    });

                    child.stderr.setEncoding('utf8');
                    child.stderr.on('data', (data) => {
                        error.push(data.toString());
                    });

                    child.on('exit', (code) => {
                        if (code === 0) {
                            resolve(new KubycatCommandStatus(code, output, error));
                        } else {
                            resolve(new KubycatCommandStatus(code || 1, output, error));
                        }
                    });
                });
                if (status.code !== 0) {
                    throw status;
                }
            }
        } catch (e) {
            //@ts-ignore
            status = e;
            if (subCommand) {
                throw status;
            } else {
                await this.handleError(sync, status);
            }
        }

        if (!subCommand && status.code == 0) {
            this.log(sync, chalk.green(` - success`));
        }

        return status;
    }

    private getKubernetesBaseCommand(sync: KubycatSync): string[] {
        const baseCommand = ['kubectl'];
        const context = sync.context || this.config.context;
        if (context) {
            baseCommand.push('--context', context);
        }
        const config = sync.config || this.config.config;
        if (config) {
            baseCommand.push('--kubeconfig', config);
        }

        baseCommand.push('--namespace', sync.namespace);
        return baseCommand;
    }

    private async getKubernetesPods(sync: KubycatSync): Promise<string[]> {
        if (sync.podLabel && sync.cachePods && sync.pods !== null) {
            return sync.pods;
        }

        const baseCommand = this.getKubernetesBaseCommand(sync);
        if (sync.pod) {
            return [sync.pod];
        } else {
            const command = [...baseCommand, 'get', 'pods', '-l', sync.podLabel, '-o', 'custom-columns=NAME:metadata.name', '--no-headers'];
            const commandStatus = await this.runCommand(sync, command.join(' '), '', false, true);
            const pods = commandStatus.stdout;
            if (sync.podLabel && sync.cachePods) {
                sync.pods = pods;
            }
            return pods;
        }
    }

    private async handleError(sync: KubycatSync, commandStatus: KubycatCommandStatus): Promise<void> {
        this.log(sync, chalk.red(` - error:`));
        this.log(sync, ' ---------------------------------------');
        for (const line of commandStatus.stdout) {
            this.log(sync, ' - ' + line);
        }
        for (const line of commandStatus.stderr) {
            this.log(sync, ' - ' + line);
        }
        this.log(sync, ' ---------------------------------------');

        if (sync.notify) {
            //send desktop notification
            notifier.notify({
                title: 'Kubycat Error',
                message: commandStatus.stderr.pop() || 'Unknown error (status code ' + commandStatus.code + ')',
                type: 'error',
            });
        }

        //if we are exiting, wait a second to allow the notification to be seen
        switch (sync.onError) {
            case 'ignore':
                return;
            case 'reload':
                this.log(sync, ' - reloading (service-mode only)...');
                await new Promise(resolve => setTimeout(resolve, 1000));
                exit(0);
            case 'exit':
                this.log(sync, ' - exiting with code ' + commandStatus.code + '...');
                await new Promise(resolve => setTimeout(resolve, 1000));
                exit(commandStatus.code);
            case 'throw':
            default:
                throw commandStatus;
        }
    }

    private log(sync: KubycatSync, message: any) {
        if (sync.showLogs) {
            console.log(message);
        }
    }
}

export default Kubycat;