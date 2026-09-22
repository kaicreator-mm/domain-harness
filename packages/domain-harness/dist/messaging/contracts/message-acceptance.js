export class MessageAcceptanceError extends Error {
    code;
    constructor(code, message, options) {
        super(message, options);
        this.name = 'MessageAcceptanceError';
        this.code = code;
    }
}
//# sourceMappingURL=message-acceptance.js.map