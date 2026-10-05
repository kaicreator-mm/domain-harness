export class DomainRuntimeV3Error extends Error {
    code;
    constructor(code, message) {
        super(message);
        this.name = 'DomainRuntimeV3Error';
        this.code = code;
    }
}
export function failV3(code, message) {
    throw new DomainRuntimeV3Error(code, message);
}
//# sourceMappingURL=runtime-v3-errors.js.map