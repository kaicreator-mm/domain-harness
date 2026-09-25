export class PackageActivationError extends Error {
    code;
    details;
    constructor(code, message, details = []) {
        super(message);
        this.name = 'PackageActivationError';
        this.code = code;
        this.details = details;
    }
}
//# sourceMappingURL=errors.js.map