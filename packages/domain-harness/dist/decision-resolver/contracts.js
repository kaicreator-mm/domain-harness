export class DecisionResolverError extends Error {
    code;
    cause;
    constructor(code, message, cause) {
        super(message);
        this.name = 'DecisionResolverError';
        this.code = code;
        this.cause = cause;
    }
}
//# sourceMappingURL=contracts.js.map