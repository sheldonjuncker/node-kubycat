import KubycatSync from "./KubycatSync.js";
declare class KubycatConfig {
    private _config;
    private _context;
    private _namespace;
    private _syncs;
    constructor(config?: string | null, context?: string | null, namespace?: string | null, syncs?: KubycatSync[]);
    get config(): string | null;
    set config(value: string | null);
    get context(): string | null;
    set context(value: string | null);
    get namespace(): string | null;
    set namespace(value: string | null);
    get syncs(): KubycatSync[];
    set syncs(value: KubycatSync[]);
    addSync(sync: KubycatSync): void;
    removeSync(sync: KubycatSync): void;
    clearSyncs(): void;
    static fromYaml(yaml: string): KubycatConfig;
    static fromYamlFile(path: string): KubycatConfig;
    validate(): void;
}
export default KubycatConfig;
