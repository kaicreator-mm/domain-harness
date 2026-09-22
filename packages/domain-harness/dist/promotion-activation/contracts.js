export class PromotionActivationAuthorityError extends Error {
    code;
    cause;
    constructor(code, message, cause) {
        super(message);
        this.name = 'PromotionActivationAuthorityError';
        this.code = code;
        this.cause = cause;
    }
}
//# sourceMappingURL=contracts.js.map