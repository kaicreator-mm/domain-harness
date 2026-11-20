export class V011BuildRefusal extends Error {
    code;
    refPath;
    constructor(code, message, refPath) {
        super(message);
        this.name = 'V011BuildRefusal';
        this.code = code;
        this.refPath = refPath;
    }
}
export function refusal(code, message, refPath) {
    return new V011BuildRefusal(code, message, refPath);
}
