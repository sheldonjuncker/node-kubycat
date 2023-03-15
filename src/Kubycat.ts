import KubycatConfig from "./KubycatConfig.js";
import KubycatSync from "./KubycatSync.js";
import fs from 'fs';
import crypto from 'crypto';
import {spawn} from 'child_process';
import FileStatus from "./FileStatus.js";
import CommandStatus from "./CommandStatus.js";
import {exit} from 'node:process';
import notifier from 'node-notifier';


class Kubycat {
    private _config: KubycatConfig;
    private _fileCache: { [key: string]: string } = {};
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

    watchFiles() {
        for (const sync of this.config.syncs) {
            if (!sync.enabled) {
                continue;
            }

            for (const from of sync.from) {
                fs.watch(sync.base + '/' + from, { recursive: true }, async (event, file) => {
                    console.log('sync\t' + event + '\t' + file);
                    if (file) {
                        file = file.replace(/\\/g, '/');
                        await this.handleSync(sync.base + '/' + from + '/' + file);
                    }
                });
            }
        }
    }

    async handleSync(file: string): Promise<void> {
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
                //Unless it is in the including regexes
                if (!s.including.some(i => file.match(i))) {
                    return false;
                }
            }
            return true;
        });

        if (!sync) {
            console.warn(` - sync=none`);
            return;
        } else {
            console.log(` - sync=${sync.name}`);
        }

        await this.runSync(sync, file);
    }

    private getFileHash(file: string): string {
        try {
            const stat = fs.statSync(file);
            if (!stat.isDirectory()) {
                const contents = fs.readFileSync(file);
                return stat.ctime.toString() + ':' + crypto.createHash('md5').update(contents).digest('hex');
            } else {
                return FileStatus.Directory_Modified;
            }
        } catch (e) {
            return FileStatus.Deleted;
        }
    }

    private getFileStatus(file: string): FileStatus {
        const hash = this.getFileHash(file);
        if (this._fileCache[file] === hash) {
            return FileStatus.Unchanged;
        }
        const oldHash = this._fileCache[file];
        this._fileCache[file] = hash;
        if (hash === FileStatus.Deleted) {
            return FileStatus.Deleted;
        } else if(hash === FileStatus.Directory_Modified) {
            if (!oldHash || oldHash === FileStatus.Deleted) {
                //only sync if the directory is new or was previously deleted
                return FileStatus.Directory_Modified;
            } else {
                return FileStatus.Unchanged;
            }

        } else {
            return FileStatus.Modified;
        }
    }

    private async runSync(sync: KubycatSync, file: string) {
        const status = this.getFileStatus(file);
        console.log(` - status=${status}`);
        if (status === FileStatus.Unchanged) {
            return;
        }

        if (status === FileStatus.Deleted) {
            await this.deleteFile(sync, file);
        } else {
            await this.updateFile(sync, file, status === FileStatus.Directory_Modified);
        }

        if (sync.postLocal) {
            await this.runCommand(sync, sync.postLocal, file, false);
        }

        if (sync.postRemote) {
            await this.runCommand(sync, sync.postRemote, file, true);
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

    private async runCommand(sync: KubycatSync, command: string, file: string, remote: boolean): Promise<CommandStatus> {
        if (remote) {
            console.log(` - remote=${command}`);
            //Runs a command on all the pods
            const status = new CommandStatus(0, [], []);
            const pods = await this.getKubernetesPods(sync);
            console.log(` - running on all ${pods.length} pods`);
            for (const pod of pods) {
                const remoteCommand = command.replace(/\$POD/g, pod);
                const commandStatus = await this.runCommand(sync, remoteCommand, file, false);
                status.code += commandStatus.code;
                for (const line of commandStatus.stdout) {
                    status.stdout.push(line);
                }
                for (const line of commandStatus.stderr) {
                    status.stderr.push(line);
                }
            }
            console.log(` - finished with code ${status.code}`);
            if (status.code !== 0) {
                await this.handleError(sync, status);
            } else {
                console.log(` - success`);
            }
            return status;
        } else {
            console.log(` - local=${command}`);
            //Runs the command locally
            const child = spawn(command, {
                shell: true,
                stdio: 'pipe',
                env: {
                    ...process.env,
                }
            });
            const status = await  new Promise<CommandStatus>((resolve) => {
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
                    //remove empty lines
                    output = output.filter(l => l.trim().length > 0);
                    error = error.filter(l => l.trim().length > 0);

                    if (code === 0) {
                        resolve(new CommandStatus(code, output, error));
                    } else {
                        resolve(new CommandStatus(code || 1, output, error));
                    }
                });
            });
            console.log(` - finished with code ${status.code}`);
            if (status.code !== 0) {
                await this.handleError(sync, status);
            } else {
                console.log(` - success`);
            }
            return status;
        }
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
        const baseCommand = this.getKubernetesBaseCommand(sync);
        if (sync.pod) {
            return [sync.pod];
        } else {
            const command = [...baseCommand, 'get', 'pods', '-l', sync.podLabel, '-o', 'custom-columns=NAME:metadata.name', '--no-headers'];
            const commandStatus = await this.runCommand(sync, command.join(' '), '', false);
            if (commandStatus.code === 0) {
                //remove empty lines
                const lines = commandStatus.stdout.filter(l => l.trim().length > 0);
                return lines.map(l => l.trim());
            } else {
                return [];
            }
        }
    }

    private async handleError(sync: KubycatSync, commandStatus: CommandStatus): Promise<void> {
        console.log(` - error:`);
        console.log(' ---------------------------------------');
        for (const line of commandStatus.stdout) {
            console.log(' - ' + line);
        }
        for (const line of commandStatus.stderr) {
            console.error(' - ' + line);
        }
        console.log(' ---------------------------------------');

        if (sync.notify) {
            //send desktop notification
            notifier.notify({
                title: 'Kubycat Error',
                message: commandStatus.stderr.pop() || 'Unknown error (status code ' + commandStatus.code + ')',
                type: 'error',
            });
        }

        if (sync.onError) {
            switch (sync.onError) {
                case 'ignore':
                    return;
                case 'reload':
                    exit(0);
                case 'exit':
                default:
                    exit(commandStatus.code);
            }
        }
    }
}

export default Kubycat;