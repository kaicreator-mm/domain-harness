export class CentralAdmissionError extends Error {
    code;
    constructor(code, message) {
        super(message);
        this.name = 'CentralAdmissionError';
        this.code = code;
    }
}
//# sourceMappingURL=contracts.js.map