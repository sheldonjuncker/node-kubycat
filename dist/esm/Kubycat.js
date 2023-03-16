import fs from 'fs';
import crypto from 'crypto';
import { spawn } from 'child_process';
import KubycatFileStatus from "./KubycatFileStatus.js";
import KubycatCommandStatus from "./KubycatCommandStatus.js";
import { exit } from 'node:process';
import notifier from 'node-notifier';
let chalk = null;
async function importChalk() {
    if (!chalk) {
        chalk = (await import("chalk")).default;
    }
    return chalk;
}
class Kubycat {
    constructor(config) {
        this._fileCache = {};
        this._syncQueue = [];
        this._syncing = false;
        this._fileWatchers = [];
        config.validate();
        this._config = config;
    }
    get config() {
        return this._config;
    }
    set config(value) {
        this._config = value;
    }
    watchFiles() {
        for (const sync of this.config.syncs) {
            if (!sync.enabled) {
                continue;
            }
            for (const from of sync.from) {
                const watcher = fs.watch(sync.base + '/' + from, { recursive: true }, async (_event, file) => {
                    if (file) {
                        file = file.replace(/\\/g, '/');
                        const absolutePath = sync.base + '/' + from + '/' + file;
                        this._syncQueue.push(absolutePath);
                    }
                });
                this._fileWatchers.push(watcher);
            }
        }
    }
    unwatchFiles() {
        for (const watcher of this._fileWatchers) {
            watcher.close();
        }
        this._fileWatchers = [];
    }
    async startQueue(interval = 1000) {
        this._syncing = true;
        await this.processQueue(interval);
    }
    stopQueue() {
        this._syncing = false;
    }
    async start(interval = 1000) {
        this.watchFiles();
        return await this.startQueue(interval);
    }
    stop() {
        this.unwatchFiles();
        this.stopQueue();
    }
    addToQueue(file) {
        this._syncQueue.push(file);
    }
    async handleSync(file) {
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
                }
                else {
                    excludedSync = null;
                }
            }
            return true;
        });
        if (!sync) {
            if (excludedSync) {
                //@ts-ignore
                this.log(excludedSync, (await importChalk()).blue(`sync\t${file}`));
                //@ts-ignore
                this.log(excludedSync, (await importChalk()).yellow(` - excluded`));
            }
            return;
        }
        else {
            //@ts-ignore
            this.log(sync, (await importChalk()).blue(`sync\t${file}`));
            //@ts-ignore
            this.log(sync, (await importChalk()).green(` - sync=${sync.name}`));
        }
        return await this.runSync(sync, file);
    }
    async processQueue(interval = 1000) {
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
    getFileHash(file) {
        try {
            const stat = fs.statSync(file);
            if (!stat.isDirectory()) {
                const contents = fs.readFileSync(file);
                return stat.ctime.toString() + ':' + crypto.createHash('md5').update(contents).digest('hex');
            }
            else {
                return KubycatFileStatus.Directory_Modified;
            }
        }
        catch (e) {
            return KubycatFileStatus.Deleted;
        }
    }
    getFileStatus(file) {
        const hash = this.getFileHash(file);
        if (this._fileCache[file] === hash) {
            return KubycatFileStatus.Unchanged;
        }
        const oldHash = this._fileCache[file];
        this._fileCache[file] = hash;
        if (hash === KubycatFileStatus.Deleted) {
            return KubycatFileStatus.Deleted;
        }
        else if (hash === KubycatFileStatus.Directory_Modified) {
            if (!oldHash || oldHash === KubycatFileStatus.Deleted) {
                //only sync if the directory is new or was previously deleted
                return KubycatFileStatus.Directory_Modified;
            }
            else {
                return KubycatFileStatus.Unchanged;
            }
        }
        else {
            return KubycatFileStatus.Modified;
        }
    }
    async runSync(sync, file) {
        const status = this.getFileStatus(file);
        this.log(sync, ` - status=${status}`);
        if (status === KubycatFileStatus.Unchanged) {
            return;
        }
        if (status === KubycatFileStatus.Deleted) {
            await this.deleteFile(sync, file);
        }
        else {
            await this.updateFile(sync, file, status === KubycatFileStatus.Directory_Modified);
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
    async deleteFile(sync, file) {
        const base = this.getKubernetesBaseCommand(sync);
        const relativePath = file.substring(sync.base.length + 1);
        const command = base.join(' ') + ' exec $POD -- ' + sync.shell + ' -c "rm -Rf ' + sync.to + '/' + relativePath + '"';
        await this.runCommand(sync, command, file, true);
    }
    async updateFile(sync, file, directory) {
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
    async runCommand(sync, command, file, remote = false, subCommand = false) {
        let status = new KubycatCommandStatus(0);
        try {
            if (remote) {
                //Runs a command on all the pods
                const pods = await this.getKubernetesPods(sync);
                this.log(sync, ` - running on all ${pods.length} pods`);
                for (const pod of pods) {
                    const remoteCommand = command.replace(/\$POD/g, pod);
                    status = await this.runCommand(sync, remoteCommand, file, false, true);
                }
            }
            else {
                this.log(sync, ` - ${command}`);
                //Runs the command locally
                const child = spawn(command, {
                    shell: true,
                    stdio: 'pipe',
                    env: {
                        ...process.env,
                    }
                });
                status = await new Promise((resolve) => {
                    let output = [];
                    let error = [];
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
                        }
                        else {
                            resolve(new KubycatCommandStatus(code || 1, output, error));
                        }
                    });
                });
                if (status.code !== 0) {
                    throw status;
                }
            }
        }
        catch (e) {
            //@ts-ignore
            status = e;
            if (subCommand) {
                throw status;
            }
            else {
                await this.handleError(sync, status);
            }
        }
        if (!subCommand && status.code == 0) {
            //@ts-ignore
            this.log(sync, (await importChalk()).green(` - success`));
        }
        return status;
    }
    getKubernetesBaseCommand(sync) {
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
    async getKubernetesPods(sync) {
        if (sync.podLabel && sync.cachePods && sync.pods !== null) {
            return sync.pods;
        }
        const baseCommand = this.getKubernetesBaseCommand(sync);
        if (sync.pod) {
            return [sync.pod];
        }
        else {
            const command = [...baseCommand, 'get', 'pods', '-l', sync.podLabel, '-o', 'custom-columns=NAME:metadata.name', '--no-headers'];
            const commandStatus = await this.runCommand(sync, command.join(' '), '', false, true);
            const pods = commandStatus.stdout;
            if (sync.podLabel && sync.cachePods) {
                sync.pods = pods;
            }
            return pods;
        }
    }
    async handleError(sync, commandStatus) {
        //@ts-ignore
        this.log(sync, (await importChalk()).red(` - error:`));
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
    log(sync, message) {
        if (sync.showLogs) {
            console.log(message);
        }
    }
}
export default Kubycat;
