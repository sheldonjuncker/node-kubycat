import * as path from "path";

class KubycatSync {
    get enabled(): boolean {
        return this._enabled;
    }

    set enabled(value: boolean) {
        this._enabled = value;
    }
    private _name: string;
    private _enabled: boolean = true;
    private _base: string;
    private _namespace: string;
    private _context: string|null = null;
    private _config: string|null = null;
    private _from: string[] = [];
    private _to: string|null = null;
    private _excluding: string[] = [];
    private _including: string[] = [];
    private _pod: string|null = null;
    private _podLabel: string|null = null;
    private _shell: string|null = null;
    private _notify: boolean = false;
    private _onError: string|null = null;
    private _postLocal: string|null = null;
    private _postRemote: string|null = null;

    constructor(name: string, base: string, from: string[] = [], to: string|null = null) {
        this._name = name;
        this._base = base;
        this._from = from;
        this._to = to;
    }


    get name(): string {
        return this._name;
    }

    set name(value: string) {
        this._name = value;
    }

    get base(): string {
        return this._base;
    }

    set base(value: string) {
        this._base = value;
    }

    get namespace(): string {
        return this._namespace;
    }

    set namespace(value: string) {
        this._namespace = value;
    }

    get context(): string | null {
        return this._context;
    }

    set context(value: string | null) {
        this._context = value;
    }

    get config(): string | null {
        return this._config;
    }

    set config(value: string | null) {
        this._config = value;
    }

    get from(): string[] {
        return this._from;
    }

    set from(value: string[]) {
        this._from = value;
    }

    get to(): string | null {
        return this._to;
    }

    set to(value: string | null) {
        this._to = value;
    }

    get excluding(): string[] {
        return this._excluding;
    }

    set excluding(value: string[]) {
        this._excluding = value;
    }

    get including(): string[] {
        return this._including;
    }

    set including(value: string[]) {
        this._including = value;
    }

    get pod(): string | null {
        return this._pod;
    }

    set pod(value: string | null) {
        this._pod = value;
    }

    get podLabel(): string | null {
        return this._podLabel;
    }

    set podLabel(value: string | null) {
        this._podLabel = value;
    }

    get shell(): string | null {
        return this._shell;
    }

    set shell(value: string | null) {
        this._shell = value;
    }

    get notify(): boolean {
        return this._notify;
    }

    set notify(value: boolean) {
        this._notify = value;
    }

    get onError(): string | null {
        return this._onError;
    }

    set onError(value: string | null) {
        this._onError = value;
    }

    get postLocal(): string | null {
        return this._postLocal;
    }

    set postLocal(value: string | null) {
        this._postLocal = value;
    }

    get postRemote(): string | null {
        return this._postRemote;
    }

    set postRemote(value: string | null) {
        this._postRemote = value;
    }

    addFrom(from: string) {
        this._from.push(from);
    }

    removeFrom(from: string) {
        this._from = this._from.filter(f => f !== from);
    }

    clearFrom() {
        this._from = [];
    }

    addExclusion(excluding: string) {
        this._excluding.push(excluding);
    }

    removeExclusion(excluding: string) {
        this._excluding = this._excluding.filter(e => e !== excluding);
    }

    clearExclusions() {
        this._excluding = [];
    }

    addInclusion(including: string) {
        this._including.push(including);
    }

    removeInclusion(including: string) {
        this._including = this._including.filter(i => i !== including);
    }

    clearInclusions() {
        this._including = [];
    }

    validate() {
        if (!this._enabled) {
            return;
        }

        if (!this._name) {
            throw new Error('sync.name is required');
        }

        if (!this._base) {
            throw new Error('sync.base path is required');
        }
        if (!path.isAbsolute(this._base)) {
            throw new Error('sync.base path must be absolute');
        }

        if (this._from.length === 0) {
            throw new Error('sync.from requires at least one path');
        }
        this._from.forEach(from => {
            if (path.isAbsolute(from)) {
                throw new Error('sync.from paths must be relative');
            }
        });

        if (this._to !== null) {
            if (!path.isAbsolute(this._to)) {
                throw new Error('sync.to path must be absolute if set');
            }

            if (this._pod && this._podLabel) {
                throw new Error('sync.pod and sync.pod-label are mutually exclusive');
            }

            if (!this._pod && !this._podLabel) {
                throw new Error('sync.pod or sync.pod-label is required');
            }

            if (!this._shell) {
                throw new Error('sync.shell is required');
            }

            if (!this._namespace) {
                throw new Error('sync.namespace (or kubycat.namespace) is required');
            }
        }
    }
}

export default KubycatSync;