export class DomainRuntimeError extends Error {
    code;
    constructor(code, message, options) {
        super(message, options);
        this.code = code;
        this.name = 'DomainRuntimeError';
    }
}
//# sourceMappingURL=runtime-errors.js.map