export class V011Error extends Error {
    code;
    constructor(code, message, options) {
        super(message, options);
        this.name = 'V011Error';
        this.code = code;
    }
}
