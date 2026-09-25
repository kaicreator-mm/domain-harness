/** Read-side dispatcher for the five frozen v0.2 DomainQuery variants. */
export class DomainQueryDispatcher {
    options;
    constructor(options) {
        this.options = options;
    }
    async query(request) {
        switch (request.kind) {
            case 'instance':
                return {
                    kind: 'instance',
                    value: await this.options.store.getInstance(request.target),
                };
            case 'message-disposition':
                return {
                    kind: 'message-disposition',
                    value: await this.options.store.getMessageDisposition(request.target, request.messageId),
                };
            case 'runtime-failure': {
                const instance = await this.options.store.getInstance(request.target);
                return {
                    kind: 'runtime-failure',
                    value: instance?.failure ?? null,
                };
            }
            case 'package-pins':
                return {
                    kind: 'package-pins',
                    value: [...await this.options.store.listPinnedPackageIds()].sort(),
                };
            case 'projection': {
                const projectionRequest = request.input === undefined
                    ? { projectionId: request.projectionId, key: request.key }
                    : { projectionId: request.projectionId, key: request.key, input: request.input };
                return {
                    kind: 'projection',
                    value: await this.options.projection.read(projectionRequest),
                };
            }
            default:
                return assertNever(request);
        }
    }
}
function assertNever(value) {
    throw new Error(`Unsupported DomainQuery kind: ${String(value.kind)}`);
}
//# sourceMappingURL=domain-query-dispatcher.js.map