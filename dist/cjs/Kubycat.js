"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = __importDefault(require("fs"));
const crypto_1 = __importDefault(require("crypto"));
const child_process_1 = require("child_process");
const KubycatFileStatus_js_1 = __importDefault(require("./KubycatFileStatus.js"));
const KubycatCommandStatus_js_1 = __importDefault(require("./KubycatCommandStatus.js"));
const node_process_1 = require("node:process");
const node_notifier_1 = __importDefault(require("node-notifier"));
const chalk_1 = __importDefault(require("chalk"));
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
                const watcher = fs_1.default.watch(sync.base + '/' + from, { recursive: true }, (_event, file) => __awaiter(this, void 0, void 0, function* () {
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
    start() {
        return __awaiter(this, void 0, void 0, function* () {
            this.watchFiles();
            return yield this.startQueue(this.config.interval);
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
                    this.log(excludedSync, chalk_1.default.blue(`sync\t${file}`));
                    this.log(excludedSync, chalk_1.default.yellow(` - excluded`));
                }
                return;
            }
            else {
                this.log(sync, chalk_1.default.blue(`sync\t${file}`));
                this.log(sync, chalk_1.default.green(` - sync=${sync.name}`));
            }
            return yield this.runSync(sync, file);
        });
    }
    processQueue(interval = 1000) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this._syncing) {
                return;
            }
            //get the current time in milliseconds
            const now = new Date().getTime();
            if (this._syncQueue.length > 0) {
                const file = this._syncQueue.shift();
                if (file) {
                    yield this.handleSync(file);
                }
            }
            //get the current time in milliseconds
            const end = new Date().getTime();
            //wait up to interval milliseconds before returning a promise that runs the function again
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
            const stat = fs_1.default.statSync(file);
            if (!stat.isDirectory()) {
                const contents = fs_1.default.readFileSync(file);
                return stat.ctime.toString() + ':' + crypto_1.default.createHash('md5').update(contents).digest('hex');
            }
            else {
                return KubycatFileStatus_js_1.default.Directory_Modified;
            }
        }
        catch (e) {
            return KubycatFileStatus_js_1.default.Deleted;
        }
    }
    getFileStatus(file) {
        const hash = this.getFileHash(file);
        if (this._fileCache[file] === hash) {
            return KubycatFileStatus_js_1.default.Unchanged;
        }
        const oldHash = this._fileCache[file];
        this._fileCache[file] = hash;
        if (hash === KubycatFileStatus_js_1.default.Deleted) {
            return KubycatFileStatus_js_1.default.Deleted;
        }
        else if (hash === KubycatFileStatus_js_1.default.Directory_Modified) {
            if (!oldHash || oldHash === KubycatFileStatus_js_1.default.Deleted) {
                //only sync if the directory is new or was previously deleted
                return KubycatFileStatus_js_1.default.Directory_Modified;
            }
            else {
                return KubycatFileStatus_js_1.default.Unchanged;
            }
        }
        else {
            return KubycatFileStatus_js_1.default.Modified;
        }
    }
    runSync(sync, file) {
        return __awaiter(this, void 0, void 0, function* () {
            const status = this.getFileStatus(file);
            this.log(sync, ` - status=${status}`);
            if (status === KubycatFileStatus_js_1.default.Unchanged) {
                return;
            }
            if (sync.to) {
                if (status === KubycatFileStatus_js_1.default.Deleted) {
                    yield this.deleteFile(sync, file);
                }
                else {
                    yield this.updateFile(sync, file, status === KubycatFileStatus_js_1.default.Directory_Modified);
                }
            }
            else {
                this.log(sync, chalk_1.default.yellow(` - no destination, nothing to do`));
            }
            if (sync.postLocal) {
                if (sync.postLocal == 'kubycat::exit') {
                    this.stop();
                    (0, node_process_1.exit)(0);
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
                //we want sync to the parent directory so that this doesn't nest the directory
                relativePath = relativePath.substring(0, relativePath.lastIndexOf('/'));
            }
            const command = base.join(' ') + ' cp ' + file + ' ' + namespace + '/$POD:' + sync.to + '/' + relativePath;
            yield this.runCommand(sync, command, file, true);
        });
    }
    runCommand(sync, command, file, remote = false, subCommand = false) {
        return __awaiter(this, void 0, void 0, function* () {
            let status = new KubycatCommandStatus_js_1.default(0);
            try {
                if (remote) {
                    //Runs a command on all the pods
                    const pods = yield this.getKubernetesPods(sync);
                    this.log(sync, ` - running on all ${pods.length} pods`);
                    for (const pod of pods) {
                        const remoteCommand = command.replace(/\$POD/g, pod);
                        status = yield this.runCommand(sync, remoteCommand, file, false, true);
                    }
                }
                else {
                    this.log(sync, ` - ${command}`);
                    //Runs the command locally
                    const child = (0, child_process_1.spawn)(command, {
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
                                resolve(new KubycatCommandStatus_js_1.default(code, output, error));
                            }
                            else {
                                resolve(new KubycatCommandStatus_js_1.default(code || 1, output, error));
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
                    yield this.handleError(sync, status);
                }
            }
            if (!subCommand && status.code == 0) {
                this.log(sync, chalk_1.default.green(` - success`));
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
            this.log(sync, chalk_1.default.red(` - error:`));
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
                node_notifier_1.default.notify({
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
                    yield new Promise(resolve => setTimeout(resolve, 1000));
                    (0, node_process_1.exit)(0);
                case 'exit':
                    this.log(sync, ' - exiting with code ' + commandStatus.code + '...');
                    yield new Promise(resolve => setTimeout(resolve, 1000));
                    (0, node_process_1.exit)(commandStatus.code);
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
exports.default = Kubycat;
