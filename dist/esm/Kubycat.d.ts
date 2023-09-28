import KubycatConfig from "./KubycatConfig.js";
declare class Kubycat {
    private _config;
    private _fileCache;
    private _syncQueue;
    private _syncing;
    private _fileWatchers;
    constructor(config: KubycatConfig);
    get config(): KubycatConfig;
    set config(value: KubycatConfig);
    watchFiles(): void;
    unwatchFiles(): void;
    startQueue(interval?: number): Promise<void>;
    stopQueue(): void;
    start(): Promise<void>;
    stop(): void;
    addToQueue(file: string): void;
    handleSync(file: string): Promise<void>;
    private processQueue;
    private getFileHash;
    private getFileStatus;
    private runSync;
    private deleteFile;
    private updateFile;
    private runCommand;
    private getKubernetesBaseCommand;
    private getKubernetesPods;
    private handleError;
    private log;
    private buildCache;
}
export default Kubycat;
