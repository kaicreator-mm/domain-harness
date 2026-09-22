export class GovernanceContractError extends Error {
    code;
    constructor(code, message) {
        super(message);
        this.name = 'GovernanceContractError';
        this.code = code;
    }
}
//# sourceMappingURL=contracts.js.map