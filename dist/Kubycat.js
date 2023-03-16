var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import fs from 'fs';
import crypto from 'crypto';
import { spawn } from 'child_process';
import FileStatus from "./FileStatus.js";
import CommandStatus from "./CommandStatus.js";
import { exit } from 'node:process';
import notifier from 'node-notifier';
import chalk from 'chalk';
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
                const watcher = fs.watch(sync.base + '/' + from, { recursive: true }, (_event, file) => __awaiter(this, void 0, void 0, function* () {
                    if (file) {
                        file = file.replace(/\\/g, '/');
                        const absolutePath = sync.base + '/' + from + '/' + file;
                        this._syncQueue.push(absolutePath);
                    }
                }));
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
    startQueue(interval = 1000) {
        return __awaiter(this, void 0, void 0, function* () {
            this._syncing = true;
            yield this.processQueue(interval);
        });
    }
    stopQueue() {
        this._syncing = false;
    }
    start(interval = 1000) {
        return __awaiter(this, void 0, void 0, function* () {
            this.watchFiles();
            return yield this.startQueue(interval);
        });
    }
    stop() {
        this.unwatchFiles();
        this.stopQueue();
    }
    addToQueue(file) {
        this._syncQueue.push(file);
    }
    handleSync(file) {
        return __awaiter(this, void 0, void 0, function* () {
            let excludedSync;
            const sync = this.config.syncs.find(s => {
                if (!s.enabled) {
                    return false;
                }
                if (!file.startsWith(s.base)) {
                    return false;
                }
                const relativeFile = file.substring(s.base.length + 1);
                if (!s.from.some(f => relativeFile.startsWith(f))) {
                    return false;
                }
                if (s.excluding.some(e => file.match(e))) {
                    excludedSync = s;
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
                    this.log(excludedSync, chalk.blue(`sync\t${file}`));
                    this.log(excludedSync, chalk.yellow(` - excluded`));
                }
                return;
            }
            else {
                this.log(sync, chalk.blue(`sync\t${file}`));
                this.log(sync, chalk.green(` - sync=${sync.name}`));
            }
            return yield this.runSync(sync, file);
        });
    }
    processQueue(interval = 1000) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this._syncing) {
                return;
            }
            const now = new Date().getTime();
            if (this._syncQueue.length > 0) {
                const file = this._syncQueue.shift();
                if (file) {
                    yield this.handleSync(file);
                }
            }
            const end = new Date().getTime();
            const timeout = Math.max(0, interval - (end - now));
            return new Promise(resolve => {
                setTimeout(() => __awaiter(this, void 0, void 0, function* () {
                    resolve(this.processQueue(interval));
                }), timeout);
            });
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
                return FileStatus.Directory_Modified;
            }
        }
        catch (e) {
            return FileStatus.Deleted;
        }
    }
    getFileStatus(file) {
        const hash = this.getFileHash(file);
        if (this._fileCache[file] === hash) {
            return FileStatus.Unchanged;
        }
        const oldHash = this._fileCache[file];
        this._fileCache[file] = hash;
        if (hash === FileStatus.Deleted) {
            return FileStatus.Deleted;
        }
        else if (hash === FileStatus.Directory_Modified) {
            if (!oldHash || oldHash === FileStatus.Deleted) {
                return FileStatus.Directory_Modified;
            }
            else {
                return FileStatus.Unchanged;
            }
        }
        else {
            return FileStatus.Modified;
        }
    }
    runSync(sync, file) {
        return __awaiter(this, void 0, void 0, function* () {
            const status = this.getFileStatus(file);
            this.log(sync, ` - status=${status}`);
            if (status === FileStatus.Unchanged) {
                return;
            }
            if (status === FileStatus.Deleted) {
                yield this.deleteFile(sync, file);
            }
            else {
                yield this.updateFile(sync, file, status === FileStatus.Directory_Modified);
            }
            if (sync.postLocal) {
                if (sync.postLocal == 'kubycat::exit') {
                    this.stop();
                    exit(0);
                }
                const localCommand = sync.postLocal.replace('${synced_file}', file);
                yield this.runCommand(sync, localCommand, file, false);
            }
            if (sync.postRemote) {
                const remoteCommand = sync.postRemote.replace('${synced_file}', file);
                yield this.runCommand(sync, remoteCommand, file, true);
            }
        });
    }
    deleteFile(sync, file) {
        return __awaiter(this, void 0, void 0, function* () {
            const base = this.getKubernetesBaseCommand(sync);
            const relativePath = file.substring(sync.base.length + 1);
            const command = base.join(' ') + ' exec $POD -- ' + sync.shell + ' -c "rm -Rf ' + sync.to + '/' + relativePath + '"';
            yield this.runCommand(sync, command, file, true);
        });
    }
    updateFile(sync, file, directory) {
        return __awaiter(this, void 0, void 0, function* () {
            const base = this.getKubernetesBaseCommand(sync);
            const namespace = sync.namespace;
            let relativePath = file.substring(sync.base.length + 1);
            if (directory) {
                relativePath = relativePath.substring(0, relativePath.lastIndexOf('/'));
            }
            const command = base.join(' ') + ' cp ' + file + ' ' + namespace + '/$POD:' + sync.to + '/' + relativePath;
            yield this.runCommand(sync, command, file, true);
        });
    }
    runCommand(sync, command, file, remote = false, subCommand = false) {
        return __awaiter(this, void 0, void 0, function* () {
            let status = new CommandStatus(0);
            try {
                if (remote) {
                    const pods = yield this.getKubernetesPods(sync);
                    this.log(sync, ` - running on all ${pods.length} pods`);
                    for (const pod of pods) {
                        const remoteCommand = command.replace(/\$POD/g, pod);
                        status = yield this.runCommand(sync, remoteCommand, file, false, true);
                    }
                }
                else {
                    this.log(sync, ` - ${command}`);
                    const child = spawn(command, {
                        shell: true,
                        stdio: 'pipe',
                        env: Object.assign({}, process.env)
                    });
                    status = yield new Promise((resolve) => {
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
                                resolve(new CommandStatus(code, output, error));
                            }
                            else {
                                resolve(new CommandStatus(code || 1, output, error));
                            }
                        });
                    });
                    if (status.code !== 0) {
                        throw status;
                    }
                }
            }
            catch (e) {
                status = e;
                if (subCommand) {
                    throw status;
                }
                else {
                    yield this.handleError(sync, status);
                }
            }
            if (!subCommand && status.code == 0) {
                this.log(sync, chalk.green(` - success`));
            }
            return status;
        });
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
    getKubernetesPods(sync) {
        return __awaiter(this, void 0, void 0, function* () {
            if (sync.podLabel && sync.cachePods && sync.pods !== null) {
                return sync.pods;
            }
            const baseCommand = this.getKubernetesBaseCommand(sync);
            if (sync.pod) {
                return [sync.pod];
            }
            else {
                const command = [...baseCommand, 'get', 'pods', '-l', sync.podLabel, '-o', 'custom-columns=NAME:metadata.name', '--no-headers'];
                const commandStatus = yield this.runCommand(sync, command.join(' '), '', false, true);
                const pods = commandStatus.stdout;
                if (sync.podLabel && sync.cachePods) {
                    sync.pods = pods;
                }
                return pods;
            }
        });
    }
    handleError(sync, commandStatus) {
        return __awaiter(this, void 0, void 0, function* () {
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
                notifier.notify({
                    title: 'Kubycat Error',
                    message: commandStatus.stderr.pop() || 'Unknown error (status code ' + commandStatus.code + ')',
                    type: 'error',
                });
            }
            switch (sync.onError) {
                case 'ignore':
                    return;
                case 'reload':
                    this.log(sync, ' - reloading (service-mode only)...');
                    yield new Promise(resolve => setTimeout(resolve, 1000));
                    exit(0);
                case 'exit':
                    this.log(sync, ' - exiting with code ' + commandStatus.code + '...');
                    yield new Promise(resolve => setTimeout(resolve, 1000));
                    exit(commandStatus.code);
                case 'throw':
                default:
                    throw commandStatus;
            }
        });
    }
    log(sync, message) {
        if (sync.showLogs) {
            console.log(message);
        }
    }
}
export default Kubycat;
//# sourceMappingURL=Kubycat.js.map