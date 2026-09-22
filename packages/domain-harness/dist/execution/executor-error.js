export class ExecutorError extends Error {
    code;
    constructor(code, message, options) {
        super(message, options);
        this.name = 'ExecutorError';
        this.code = code;
    }
}
//# sourceMappingURL=executor-error.js.map