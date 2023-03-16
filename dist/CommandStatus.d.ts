declare class CommandStatus {
    private _code;
    private _stdout;
    private _stderr;
    constructor(status: number, stdout?: string[], stderr?: string[]);
    get code(): number;
    set code(value: number);
    get stdout(): string[];
    set stdout(value: string[]);
    get stderr(): string[];
    set stderr(value: string[]);
    addStdout(line: string): void;
    addStderr(line: string): void;
}
export default CommandStatus;
