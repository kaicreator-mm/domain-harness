export class AppContractGenerationError extends Error {
    code;
    path;
    constructor(code, path, message) {
        super(`${code} at ${path}: ${message}`);
        this.name = 'AppContractGenerationError';
        this.code = code;
        this.path = path;
    }
}
//# sourceMappingURL=app-contract-errors.js.map