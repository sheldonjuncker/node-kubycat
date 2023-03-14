import KubycatSync from "./KubycatSync.js";
import YAML from 'yaml'
import fs from 'fs'

class KubycatConfig {
    private _config: string | null;
    private _context: string | null = null;
    private _namespace: string | null = null;

    private _syncs: KubycatSync[] = [];

    constructor(config: string | null = null, context: string | null = null, namespace: string | null = null, syncs: KubycatSync[] = []) {
        this._config = config;
        this._context = context;
        this._namespace = namespace;
        this._syncs = syncs;
    }

    get config(): string | null {
        return this._config;
    }

    set config(value: string | null) {
        this._config = value;
    }

    get context(): string | null {
        return this._context;
    }

    set context(value: string | null) {
        this._context = value;
    }

    get namespace(): string | null {
        return this._namespace;
    }

    set namespace(value: string | null) {
        this._namespace = value;
    }

    get syncs(): KubycatSync[] {
        return this._syncs;
    }

    set syncs(value: KubycatSync[]) {
        this._syncs = value;
    }

    addSync(sync: KubycatSync) {
        this._syncs.push(sync);
    }

    removeSync(sync: KubycatSync) {
        this._syncs = this._syncs.filter(s => s !== sync);
    }

    clearSyncs() {
        this._syncs = [];
    }

    static fromYaml(yaml: string): KubycatConfig {
        const config = YAML.parse(yaml);

        if (!config.kubycat) {
            throw new Error('invalid config file, missing kubycat section.');
        }

        const syncs: KubycatSync[] = [];
        for (const sync of config.kubycat.sync) {
            console.log(sync);
            const s = new KubycatSync(sync.name, sync.base, sync.from, sync.to);
            s.name = sync.name;
            s.enabled = sync.enabled || true;
            s.namespace = sync.namespace || config.kubycat.namespace;
            s.context = sync.context || null;
            s.config = sync.config || null;
            s.including = sync.including || []
            s.excluding = sync.excluding || []
            s.pod = sync.pod || null;
            s.podLabel = sync['pod-label'] || null;
            s.shell = sync.shell || null;
            s.notify = sync.notify || false;
            s.onError = sync['on-error'] || 'exit';
            s.postLocal = sync['post-local'] || null;
            s.postRemote = sync['post-remote'] || null;
            syncs.push(s);
        }
        return new KubycatConfig(config.kubycat.config, config.kubycat.context, config.kubycat.namespace, syncs);
    }

    static fromYamlFile(path: string): KubycatConfig {
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