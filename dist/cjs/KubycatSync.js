import * as path from "path";
class KubycatSync {
    constructor(name, base, from = [], to = null) {
        this._enabled = true;
        this._namespace = '';
        this._context = null;
        this._config = null;
        this._from = [];
        this._to = null;
        this._excluding = [];
        this._including = [];
        this._pod = null;
        this._podLabel = null;
        this._cachePods = true;
        this._pods = null;
        this._shell = null;
        this._notify = false;
        this._onError = null;
        this._postLocal = null;
        this._postRemote = null;
        this._showLogs = true;
        this._name = name;
        this._base = base;
        this._from = from;
        this._to = to;
    }
    get showLogs() {
        return this._showLogs;
    }
    set showLogs(value) {
        this._showLogs = value;
    }
    get pods() {
        return this._pods;
    }
    set pods(value) {
        this._pods = value;
    }
    get cachePods() {
        return this._cachePods;
    }
    set cachePods(value) {
        this._cachePods = value;
    }
    get enabled() {
        return this._enabled;
    }
    set enabled(value) {
        this._enabled = value;
    }
    get name() {
        return this._name;
    }
    set name(value) {
        this._name = value;
    }
    get base() {
        return this._base;
    }
    set base(value) {
        this._base = value;
    }
    get namespace() {
        return this._namespace;
    }
    set namespace(value) {
        this._namespace = value;
    }
    get context() {
        return this._context;
    }
    set context(value) {
        this._context = value;
    }
    get config() {
        return this._config;
    }
    set config(value) {
        this._config = value;
    }
    get from() {
        return this._from;
    }
    set from(value) {
        this._from = value;
    }
    get to() {
        return this._to;
    }
    set to(value) {
        this._to = value;
    }
    get excluding() {
        return this._excluding;
    }
    set excluding(value) {
        this._excluding = value;
    }
    get including() {
        return this._including;
    }
    set including(value) {
        this._including = value;
    }
    get pod() {
        return this._pod;
    }
    set pod(value) {
        this._pod = value;
    }
    get podLabel() {
        return this._podLabel;
    }
    set podLabel(value) {
        this._podLabel = value;
    }
    get shell() {
        return this._shell;
    }
    set shell(value) {
        this._shell = value;
    }
    get notify() {
        return this._notify;
    }
    set notify(value) {
        this._notify = value;
    }
    get onError() {
        return this._onError;
    }
    set onError(value) {
        this._onError = value;
    }
    get postLocal() {
        return this._postLocal;
    }
    set postLocal(value) {
        this._postLocal = value;
    }
    get postRemote() {
        return this._postRemote;
    }
    set postRemote(value) {
        this._postRemote = value;
    }
    addFrom(from) {
        this._from.push(from);
    }
    removeFrom(from) {
        this._from = this._from.filter(f => f !== from);
    }
    clearFrom() {
        this._from = [];
    }
    addExclusion(excluding) {
        this._excluding.push(excluding);
    }
    removeExclusion(excluding) {
        this._excluding = this._excluding.filter(e => e !== excluding);
    }
    clearExclusions() {
        this._excluding = [];
    }
    addInclusion(including) {
        this._including.push(including);
    }
    removeInclusion(including) {
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
