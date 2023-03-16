class CommandStatus {
    constructor(status, stdout = [], stderr = []) {
        this._code = status;
        this._stdout = stdout;
        this._stderr = stderr;
    }
    get code() {
        return this._code;
    }
    set code(value) {
        this._code = value;
    }
    get stdout() {
        return this._stdout.map(line => line.trim()).filter(line => line.length > 0);
    }
    set stdout(value) {
        this._stdout = value;
    }
    get stderr() {
        return this._stderr.map(line => line.trim()).filter(line => line.length > 0);
    }
    set stderr(value) {
        this._stderr = value;
    }
    addStdout(line) {
        this._stdout.push(line);
    }
    addStderr(line) {
        this._stderr.push(line);
    }
}
export default CommandStatus;
//# sourceMappingURL=CommandStatus.js.map