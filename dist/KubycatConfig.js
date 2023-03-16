import KubycatSync from "./KubycatSync.js";
import YAML from 'yaml';
import fs from 'fs';
class KubycatConfig {
    constructor(config = null, context = null, namespace = null, syncs = []) {
        this._context = null;
        this._namespace = null;
        this._syncs = [];
        this._config = config;
        this._context = context;
        this._namespace = namespace;
        this._syncs = syncs;
    }
    get config() {
        return this._config;
    }
    set config(value) {
        this._config = value;
    }
    get context() {
        return this._context;
    }
    set context(value) {
        this._context = value;
    }
    get namespace() {
        return this._namespace;
    }
    set namespace(value) {
        this._namespace = value;
    }
    get syncs() {
        return this._syncs;
    }
    set syncs(value) {
        this._syncs = value;
    }
    addSync(sync) {
        this._syncs.push(sync);
    }
    removeSync(sync) {
        this._syncs = this._syncs.filter(s => s !== sync);
    }
    clearSyncs() {
        this._syncs = [];
    }
    static fromYaml(yaml) {
        var _a, _b, _c, _d;
        const config = YAML.parse(yaml);
        if (!config.kubycat) {
            throw new Error('invalid config file, missing kubycat section.');
        }
        const syncs = [];
        for (const sync of config.kubycat.sync) {
            console.log(sync);
            const s = new KubycatSync(sync.name, sync.base, sync.from, sync.to);
            s.name = sync.name;
            s.enabled = (_a = sync.enabled) !== null && _a !== void 0 ? _a : true;
            s.namespace = sync.namespace || config.kubycat.namespace;
            s.context = sync.context || null;
            s.config = sync.config || null;
            s.including = sync.including || [];
            s.excluding = sync.excluding || [];
            s.pod = sync.pod || null;
            s.podLabel = sync['pod-label'] || null;
            s.cachePods = (_b = sync['cache-pods']) !== null && _b !== void 0 ? _b : true;
            s.shell = sync.shell || null;
            s.notify = (_c = sync.notify) !== null && _c !== void 0 ? _c : false;
            s.onError = sync['on-error'] || 'exit';
            s.postLocal = sync['post-local'] || null;
            s.postRemote = sync['post-remote'] || null;
            s.showLogs = (_d = sync['show-logs']) !== null && _d !== void 0 ? _d : true;
            syncs.push(s);
        }
        return new KubycatConfig(config.kubycat.config, config.kubycat.context, config.kubycat.namespace, syncs);
    }
    static fromYamlFile(path) {
        const yaml = fs.readFileSync(path, 'utf8');
        return KubycatConfig.fromYaml(yaml);
    }
    validate() {
        if (this.syncs.length === 0) {
            throw new Error("No syncs defined.");
        }
        for (const sync of this.syncs) {
            sync.validate();
        }
    }
}
export default KubycatConfig;
//# sourceMappingURL=KubycatConfig.js.map