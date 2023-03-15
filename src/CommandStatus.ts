class CommandStatus {
    private _code: number;
    private _stdout: string[];
    private _stderr: string[];

    constructor(status: number, stdout: string[] = [], stderr: string[] = []) {
        this._code = status;
        this._stdout = stdout;
        this._stderr = stderr;
    }


    get code(): number {
        return this._code;
    }

    set code(value: number) {
        this._code = value;
    }

    get stdout(): string[] {
        return this._stdout.map(line => line.trim()).filter(line => line.length > 0);
    }

    set stdout(value: string[]) {
        this._stdout = value;
    }

    get stderr(): string[] {
        return this._stderr.map(line => line.trim()).filter(line => line.length > 0);
    }

    set stderr(value: string[]) {
        this._stderr = value;
    }

    addStdout(line: string) {
        this._stdout.push(line);
    }

    addStderr(line: string) {
        this._stderr.push(line);
    }
}

export default CommandStatus;