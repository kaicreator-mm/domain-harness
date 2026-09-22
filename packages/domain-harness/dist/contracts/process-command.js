export class ProcessCommandContractError extends Error {
    code;
    constructor(code, message) {
        super(message);
        this.name = 'ProcessCommandContractError';
        this.code = code;
    }
}
//# sourceMappingURL=process-command.js.map